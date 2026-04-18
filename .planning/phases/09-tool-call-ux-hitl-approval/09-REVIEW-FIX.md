---
phase: 09-tool-call-ux-hitl-approval
fixed_at: 2026-04-18T00:00:00Z
review_path: .planning/phases/09-tool-call-ux-hitl-approval/09-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 09: Code Review Fix Report

**Fixed at:** 2026-04-18T00:00:00Z
**Source review:** `.planning/phases/09-tool-call-ux-hitl-approval/09-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (Critical + Warning; Info skipped per fix_scope=critical_warning)
- Fixed: 6
- Skipped: 0

## Fixed Issues

### WR-01: MessageBubble memo 跳过 HITL 状态切换 re-render

**Files modified:** `frontend/src/components/chat/message-bubble.tsx`
**Commit:** df8d5a6
**Applied fix:** 将 memo comparator 改为先做 `prev.message !== next.message` 引用比较；store 是 immutable 的，segment 状态变化必产生新 message 引用，因此能捕捉 pending → approved/rejected/feedback 切换。

### WR-02: 乐观 updateHitlStatus 无回滚

**Files modified:** `frontend/src/app/page.tsx`, `frontend/src/stores/chat-store.ts`
**Commit:** 8728dfa
**Applied fix:**
1. 在 `chat-store.ts` 的 `updateHitlStatus` finder 中加入例外：当目标状态为 `"pending"` 时（回滚场景），允许定位最近一个匹配 taskId 的 HITL，不再要求当前状态为 pending；其他目标状态保持原行为。
2. 在 `page.tsx` 的 `handleApprove` / `handleReject` / `handleFeedback` catch 块开头调用 `updateHitlStatus(taskId, "pending")` 回滚乐观更新。
**Status:** fixed: requires human verification（涉及状态机 + 异步错误路径，TS 仅校验语法；建议手动触发一次 resume 失败场景验证）。

### WR-03: reject 后 backfill 可能漏掉新插入的 tool segment

**Files modified:** `frontend/src/stores/chat-store.ts`
**Commit:** 9a9022a
**Applied fix:** 在 `addToolSegment` 与 `updateToolSegment` 中均加入相同守卫：从尾向头扫描最近一次同名 HITL，若其状态为 `rejected` / `feedback`，则把当前 tool segment 的 status 强制写为 `rejected`，避免 LangGraph 重放原 tool call 时显示绿✓。
**Status:** fixed: requires human verification（reviewer 明确建议 `python -m app.main` + `npm run dev` 触发拒绝来确认；需观察 Agent 是否仍重放 tool call 以及 backfill 是否正确接住）。

### WR-04: SSE handler 的 JSON.parse 未捕获异常

**Files modified:** `frontend/src/hooks/use-sse.ts`
**Commit:** 68ac1cd
**Applied fix:** 给 `token` / `tool` / `hitl` 三个 listener 的 `JSON.parse` 包上 try/catch。`token` / `tool` 静默丢弃单帧坏数据；`hitl` 解析失败调用 `setError("HITL 事件解析失败")` 显式提示，避免用户卡在没有按钮可点的状态。

### WR-05: formatHitlDescription 用 JSON.stringify 处理未知 args

**Files modified:** `frontend/src/hooks/use-sse.ts`
**Commit:** ab04779
**Applied fix:** 抽出 `safeStringify` helper：null/undefined 返回空串；string 直接返回；其他走 `JSON.stringify` 并 try/catch（兜底 `String(v)`），同时截断到 80 字符防止描述爆裂；`undefined` 序列化结果回退到 `String(v)`。`formatHitlDescription` 调用 `safeStringify` 替代裸 `JSON.stringify`。

### WR-06: handleSend 失败时残留空 assistant message

**Files modified:** `frontend/src/app/page.tsx`
**Commit:** 2c17381
**Applied fix:** 把 `addAssistantMessage()` 从 `await invokeChat` 之前推迟到之后、`setCurrentTaskId(...)` 之前。这样 invokeChat 失败时根本不会创建空 assistant 占位，且仍能保证 SSE 启动前已有 assistant message 接收 token（避免 token 落到 user message 上被 `flushTokenBuffer` 的 `role !== "assistant"` 守卫丢弃）。

---

_Fixed: 2026-04-18T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
