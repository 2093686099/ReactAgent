---
phase: 09-tool-call-ux-hitl-approval
reviewed: 2026-04-18T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - frontend/src/lib/types.ts
  - frontend/src/lib/api.ts
  - frontend/src/stores/chat-store.ts
  - frontend/src/hooks/use-sse.ts
  - frontend/src/components/chat/tool-pill.tsx
  - frontend/src/components/chat/hitl-card.tsx
  - frontend/src/components/chat/message-bubble.tsx
  - frontend/src/components/chat/message-list.tsx
  - frontend/src/app/page.tsx
findings:
  critical: 0
  warning: 6
  info: 4
  total: 10
status: issues_found
---

# Phase 09: Code Review Report

**Reviewed:** 2026-04-18T00:00:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 09 wires HITL 审批 UI end-to-end：新增 `HitlSegment` 类型、`addHitlSegment`/`updateHitlStatus` store actions、`ToolPill`/`HitlCard` 组件、SSE `hitl` 监听器以及 page 层三个回调。整体结构清晰，状态机符合"乐观更新 + SSE 复用"的设计意图。Recent fixes（按 toolName 回写 tool segment 为 rejected、reject 时传中文取消提示、`updateHitlStatus` 只取最近一个 pending）方向正确。

但存在一些待修问题：

1. **MessageBubble 的 memo 比较函数** 在 `pending → approved/rejected/feedback` 状态切换时会跳过 re-render，导致审批后 HITL 卡片短暂"卡"在 pending 状态，直到下一个 length 变化的事件触发 re-render（WR-01）。
2. **乐观 UI 更新无回滚**：API 调用失败时 store 已被改为 approved/rejected/feedback，UI 显示与后端实际状态不一致（WR-02）。
3. **reject 路径的"绿✓"修复可能不完整**：`updateHitlStatus` 的 backfill 只向 `targetIndex` 之前扫描，但 resume 后 LangGraph 极有可能重新流式产出原 tool call（`tool: calling`），新 tool segment 会被插入 HITL 之后，绕过 backfill（WR-03）。
4. **SSE handler 的 `JSON.parse` 没有 try/catch**，单个畸形帧会让该事件类型监听器抛出（WR-04）。
5. **`formatHitlDescription` 用 `JSON.stringify` 处理未知 tool args**，遇到循环引用 / `BigInt` 会抛出（WR-05）。
6. **`handleSend` 在 await 前就 push 了空 assistant message**，请求失败时这条空消息变成孤儿（WR-06）。

无 Critical 安全问题。

## Warnings

### WR-01: MessageBubble memo 跳过 HITL 状态切换 re-render

**File:** `frontend/src/components/chat/message-bubble.tsx:80-93`

**Issue:**
`memo` 自定义 comparator 仅检查 `prev.message.id === next.message.id` 和 `prev.message.segments.length === next.message.segments.length`，并且只在 `next.hasPendingHitl === true` 时强制 re-render（return false）。

`updateHitlStatus(taskId, "approved")` 是 immutable 更新，segment 数量不变、message id 不变；状态切换后 `next.hasPendingHitl` 变成 `false`，于是 comparator 走到最后的 id+length 比较，返回 `true` → React 跳过 re-render。结果：用户点击"批准"后，HitlCard 仍显示 pending UI（按钮、Shield 图标），直到下一次 length 变化（新 tool segment 加入或 token 追加 + isStreaming 切换）才更新。

跨度通常很短，但在 Agent 还没立刻产出新 segment 的窗口内，UI 与 store 不一致，给用户"按钮没响应"的错觉。

**Fix:**
```tsx
export const MessageBubble = memo(
  MessageBubbleInner,
  (prev, next) => {
    if (next.isStreaming) return false;
    // 引用变化即重渲染（store 是 immutable，状态变化必产生新引用）
    if (prev.message !== next.message) return false;
    return (
      prev.message.id === next.message.id &&
      prev.message.segments.length === next.message.segments.length
    );
  }
);
```
或更精细一点：比较 `prev.hasPendingHitl !== next.hasPendingHitl` 时强制 re-render。

---

### WR-02: 乐观 updateHitlStatus 无回滚

**File:** `frontend/src/app/page.tsx:43-87`

**Issue:**
`handleApprove` / `handleReject` / `handleFeedback` 都是先 `updateHitlStatus(taskId, ...)` 再 `await resumeChat(...)`。当 `resumeChat` 抛错时只 `setError` + toast，但之前的 segment 状态已经被改成 approved/rejected/feedback —— UI 会一直显示成功状态，即便后端实际什么都没做。用户不会知道审批没生效，且 HITL 卡片没办法重新打开重试。

**Fix:**
回滚到 `pending`：
```tsx
const handleApprove = async (taskId: string) => {
  updateHitlStatus(taskId, "approved");
  setStatus("sending");
  try {
    await resumeChat(taskId, "approve");
    setStatus("streaming");
  } catch (error) {
    updateHitlStatus(taskId, "pending");        // 回滚
    const message = error instanceof Error ? error.message : "恢复执行失败";
    setError(message);
    toast.error("审批操作失败，请重试");
  }
};
```
注意：当前 `updateHitlStatus` 只匹配 `status === "pending"` 的 segment，回滚需要绕过这个检查或新增一个允许显式 set 的 action。建议增加 `resetHitlToPending(taskId)` 或在 store action 里支持 `pending` 作为目标状态（去掉那个 `pending` 守卫）。

---

### WR-03: reject 后 backfill 可能漏掉新插入的 tool segment

**File:** `frontend/src/stores/chat-store.ts:236-249`

**Issue:**
`updateHitlStatus` 的 backfill 仅向 `targetIndex` **之前**（`for (let i = targetIndex - 1; ...)`）扫描，目的是把现存的 `tool: done` 翻成 `rejected`。但实际时序是：

1. 用户点击拒绝 → `updateHitlStatus("rejected")` 立即触发，扫描时 HITL 之前没有 tool segment（因为 middleware 拦截在工具执行之前）。
2. 接着 `resumeChat("reject", message)` 才请求后端。
3. 后端 resume 后 LangGraph 仍然会把原 AIMessage（含 `tool_call_chunks`）流式回放，`backend/app/core/streaming.py:76-82` 会再次 `yield EVT_TOOL "calling"`。
4. 前端 SSE handler 走 `addToolSegment` → 新 tool segment 被插入到 HITL **之后**（不会被 backfill 看到）。
5. 紧跟着的 ToolMessage 触发 `tool: done` → `updateToolSegment` 找到 `status !== "rejected"` 的同名 tool → 改成 done → 显示绿✓。

如果 PR 描述的"修复 reject 路径绿✓"指的就是这一条，那么当前实现并未真正消除问题（除非回放路径上有未在仓库内体现的过滤）。请用 `python -m app.main` 启动后端 + npm run dev 触发一次拒绝来确认；如果绿✓仍偶现，建议在 `updateToolSegment` 里加守卫：若同名 tool 后存在已 `rejected/feedback` 的 HITL 段，则把状态写为 `rejected`；或者在 `addToolSegment` 时检查最近一个同名 HITL 是否被拒绝。

**Fix:**
在 `addToolSegment` 中检查同名 HITL 的最终状态：
```ts
addToolSegment: (name, status) =>
  set((state) => {
    // ... existing guards ...
    const segments = lastMessage.segments;
    // 找最近一次同名 HITL，若它是 rejected/feedback，新 tool 直接标记 rejected
    let rejectedByHitl = false;
    for (let i = segments.length - 1; i >= 0; i--) {
      const s = segments[i];
      if (s.type === "hitl" && s.toolName === name) {
        rejectedByHitl = s.status === "rejected" || s.status === "feedback";
        break;
      }
    }
    const newStatus = rejectedByHitl ? "rejected" : status;
    // ...append { type: "tool", name, status: newStatus }...
  }),
```
并让 `updateToolSegment` 跳过同样的情况。

---

### WR-04: SSE handler 的 JSON.parse 未捕获异常

**File:** `frontend/src/hooks/use-sse.ts:38, 45, 79`

**Issue:**
`token` / `tool` / `hitl` 三个 listener 都是 `JSON.parse((event as MessageEvent).data)` 不带 try/catch。后端只要一次写入畸形 JSON（或网络层截断、Redis Stream 传输异常），监听器会抛出，浏览器控制台报错，且后续同类事件依然会进这个 handler，但解析仍失败 —— 用户看到的是"发了消息没反应"。`error` listener 已经有 try/catch（line 69-74），可见作者意识到此风险。

**Fix:**
```ts
eventSource.addEventListener("token", (event) => {
  let payload: { text?: string };
  try {
    payload = JSON.parse((event as MessageEvent).data);
  } catch {
    return; // 单帧坏数据不应中断流
  }
  if (payload.text) appendToken(payload.text);
});
```
对 `tool` / `hitl` 同样处理。`hitl` 解析失败时建议 `setError("HITL 事件解析失败")` 显式提示，因为 hitl 事件丢失会让用户卡在没有按钮可点的状态。

---

### WR-05: formatHitlDescription 用 JSON.stringify 处理未知 args

**File:** `frontend/src/hooks/use-sse.ts:7-16`

**Issue:**
```ts
.map(([, v]) => (typeof v === "string" ? v : JSON.stringify(v)))
```
后端工具 args 是任意 JSON。`JSON.stringify` 遇到循环引用会抛 `TypeError`，遇到 `BigInt` 会抛 `TypeError`，长字符串/嵌套对象会让描述爆裂（前端展示溢出）。整个 SSE handler 没有捕获，会冒到 EventSource listener 之外，hitl 事件就丢了，用户卡死。

**Fix:**
```ts
const safeStringify = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try {
    const s = JSON.stringify(v);
    return s.length > 80 ? `${s.slice(0, 77)}...` : s;
  } catch {
    return String(v);
  }
};
const summary = entries.map(([, v]) => safeStringify(v)).join("、");
```

---

### WR-06: handleSend 失败时残留空 assistant message

**File:** `frontend/src/app/page.tsx:89-109`

**Issue:**
```ts
addUserMessage(text);
addAssistantMessage();   // 立刻插入空气泡
setStatus("sending");
try {
  const response = await invokeChat(...);  // 失败时
  ...
} catch (error) {
  setError(message);     // 没有移除前面那个空 assistant message
  ...
}
```
失败后用户看到自己的消息 + 一个空白 assistant 气泡 + 错误提示，下次发消息时空气泡仍在列表中。

**Fix:**
两种思路：
1. 把 `addAssistantMessage()` 推迟到 `invokeChat` 成功后；UI 缺失"等待中"占位用 `StreamingDots`（status === "sending" 时已显示）来覆盖。
2. 或在 catch 里 pop 最后一条空 assistant message：
   ```ts
   set((state) => ({
     messages: state.messages.slice(0, -1)
   }));
   ```
推荐方案 1，更干净。

---

## Info

### IN-01: hitl SSE payload 未类型收窄

**File:** `frontend/src/hooks/use-sse.ts:78-85`

**Issue:**
```ts
const payload = JSON.parse((event as MessageEvent).data);   // 隐式 any
const actionReq = payload.action_requests?.[0];
const toolName = actionReq?.name ?? "unknown";
```
没有断言 / 类型，`payload` 实质 `any`，未来后端字段重命名前端不会有任何编译报错。建议定义 `HitlEventPayload` 接口或至少做 runtime 校验（zod / 简单 typeguard）。

**Fix:**
```ts
type HitlActionRequest = { name?: string; args?: Record<string, unknown> };
type HitlPayload = { action_requests?: HitlActionRequest[] };
const payload = JSON.parse(...) as HitlPayload;
```

---

### IN-02: api.ts 响应未做形状校验

**File:** `frontend/src/lib/api.ts:20, 46`

**Issue:**
`return response.json() as Promise<InvokeResponse>;` 是断言，不是验证。后端字段缺失或重命名后调用方拿到 `undefined.task_id` 才会爆炸，定位成本高。

**Fix:**
轻量手写 typeguard（无需引 zod）：
```ts
const data = (await response.json()) as unknown;
if (
  typeof data !== "object" || data === null ||
  typeof (data as any).task_id !== "string"
) {
  throw new Error("invalid invoke response shape");
}
return data as InvokeResponse;
```
或在该层引入 zod schema 也可，按团队偏好定。

---

### IN-03: updateHitlStatus 的 tool backfill 仅按 name 匹配

**File:** `frontend/src/stores/chat-store.ts:237-248`

**Issue:**
向后扫描时只比较 `segment.name === toolName`。若同一轮 Agent 触发过多个同名 tool（罕见但 plan 里 parallel tool calls 是合法的），可能错回写到不相关的那一个。当前 HITL 流程下 backfill 通常找不到任何 tool（见 WR-03），实际触发概率低，但写法上仍属脆弱匹配。

**Fix:**
若未来 Agent 引入并行同名 tool，建议在 segment 上同时记录 `tool_call_id` 并按 id 匹配，而非按 name。

---

### IN-04: HitlCard feedback 提交后内部状态未清理

**File:** `frontend/src/components/chat/hitl-card.tsx:50-79`

**Issue:**
`onFeedback(feedbackText.trim())` 调用后，`showFeedback` / `feedbackText` state 没被清掉。当前 segment 状态切到 `feedback` 后卡片会渲染早返回的"已反馈"分支，看不到旧 state，所以无明显症状。但若将来允许同一 segment 回到 pending（如 WR-02 的回滚），残留 state 会泄漏到下一次展示。

**Fix:**
提交成功后调用 `setShowFeedback(false); setFeedbackText("");`，或把 `<Textarea>` 段落抽成独立组件，靠 unmount 清除。

---

_Reviewed: 2026-04-18T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
