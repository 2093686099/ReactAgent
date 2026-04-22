---
phase: 12-resilience
plan: 02
type: execute
wave: 2
depends_on:
  - 12-01
files_modified:
  - frontend/src/stores/chat-store.ts
  - frontend/src/hooks/use-sse.ts
  - frontend/src/components/layout/reconnect-banner.tsx
  - frontend/src/components/chat/chat-area.tsx
  - frontend/src/stores/__tests__/chat-store.connection-status.test.ts
  - frontend/src/stores/__tests__/chat-store.resolve-hitl.test.ts
autonomous: true
requirements:
  - RESIL-01
  - RESIL-02
tags:
  - sse
  - resilience
  - hitl
  - zustand
  - design-system

must_haves:
  truths:
    - "断线期间浏览器 EventSource 自动重连时，UI 在顶栏显示 '连接中断，正在重连…' banner（debounce 1s 后出现，重连成功 300ms 后消失）"
    - "重连路径 onerror 不主动 close EventSource（否则会截断浏览器原生自动重连）"
    - "收到 hitl_resolved 事件时，前端优先按 payload.tool_name 匹配最近一条 status='pending' 的 HitlSegment；仅当 tool_name 缺省时才 fallback 到最近一条 pending HITL（approve/edit → approved，reject → rejected）"
    - "resolveLastPendingHitl 幂等：找不到可匹配的 pending HITL 时 no-op（支撑 from_id=0 全量重放多次收敛 = G-01 修复）"
    - "服务端发送 data-bearing error 或收到 done/error 终态后，connectionStatus 必须回到 connected，banner 不会卡在 reconnecting"
    - "刷新页面时，既有 handleSwitch 路径 + D-01 header 续传 + hitl_resolved 重放收敛三者共同完成 RESIL-02"
  artifacts:
    - path: "frontend/src/stores/chat-store.ts"
      provides: "connectionStatus 字段 + setConnectionStatus + resolveLastPendingHitl(decision, toolName?) action"
      contains: "resolveLastPendingHitl"
    - path: "frontend/src/hooks/use-sse.ts"
      provides: "hitl_resolved listener + onerror 不 close + 每个 listener 同步 connectionStatus"
      contains: "hitl_resolved"
    - path: "frontend/src/components/layout/reconnect-banner.tsx"
      provides: "顶栏轻提示 banner"
      min_lines: 30
    - path: "frontend/src/components/chat/chat-area.tsx"
      provides: "在 header 上方挂载 ReconnectBanner"
      contains: "ReconnectBanner"
    - path: "frontend/src/stores/__tests__/chat-store.connection-status.test.ts"
      provides: "connectionStatus 状态机单测（D-14 前半）"
      min_lines: 30
    - path: "frontend/src/stores/__tests__/chat-store.resolve-hitl.test.ts"
      provides: "resolveLastPendingHitl 幂等 / tool_name 定位 / fallback / rejected 回写 tool pill 单测（D-14 后半）"
      min_lines: 60
  key_links:
    - from: "use-sse.ts::hitl_resolved listener"
      to: "chat-store::resolveLastPendingHitl"
      via: "decision → HitlStatus 映射（approve/edit → approved, reject → rejected）+ tool_name 优先匹配"
      pattern: "resolveLastPendingHitl"
    - from: "use-sse.ts::onerror"
      to: "chat-store::setConnectionStatus('reconnecting')"
      via: "未收终态事件 → 仅置状态，不 close"
      pattern: "setConnectionStatus"
    - from: "chat-store::connectionStatus"
      to: "ReconnectBanner UI"
      via: "useChatStore selector + debounce"
      pattern: "connectionStatus"
---

<objective>
落地 Phase 12 前端侧全部改动：`chat-store` 加 `connectionStatus` 字段 + `resolveLastPendingHitl(decision, toolName?)` action（D-09）；`use-sse` 加 `hitl_resolved` listener + 细化 onerror（D-08）；新建 `reconnect-banner.tsx`（D-10）并挂载到 chat-area header 上方（D-11）；vitest 单测覆盖 D-14。

Purpose: 让 RESIL-01（断线自动重连 + 续传）对用户可见 —— banner 给出反馈且终态错误不会遗留 reconnecting 假象；让 RESIL-02（刷新恢复 HITL）自然闭环 —— `from_id=0` 重放时 `hitl_resolved` 帧按 `tool_name` 优先收敛正确的 pending HITL（= G-01 修复，且避免多 pending 场景错收敛）。前端改面仍然很小，但 review 反馈要求把“按最后一个 pending 收敛”的隐含假设改成显式、可验证的匹配规则。

Output: chat-store / use-sse 两处小改 + 新建 banner 组件 + chat-area 挂载点 + 两个 vitest 文件。
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@DESIGN.md
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/12-resilience/12-CONTEXT.md
@.planning/phases/12-resilience/12-PATTERNS.md
@.planning/phases/12-resilience/12-01-SUMMARY.md

# 直接依赖源文件（必读）
@frontend/src/hooks/use-sse.ts
@frontend/src/stores/chat-store.ts
@frontend/src/components/chat/chat-area.tsx
@frontend/src/components/todo/todo-toggle-button.tsx
@frontend/src/components/todo/todo-drawer.tsx
@frontend/src/lib/types.ts
@frontend/src/app/globals.css
@frontend/src/stores/__tests__/chat-store.todos.test.ts
@frontend/src/stores/__tests__/ui-store.autoopen.test.ts

<interfaces>
<!-- 执行者不需要再探索代码库，以下契约直接照用 -->

# HitlStatus（frontend/src/lib/types.ts）
export type HitlStatus = "pending" | "approved" | "rejected" | "feedback";

# Segment 联合类型（摘）
type Segment =
  | { type: "text"; content: string }
  | { type: "tool"; name: string; status: "calling" | "done" | "rejected" }
  | { type: "hitl"; toolName: string; description: string; status: HitlStatus; taskId: string };

# Message
type Message = { id: string; role: "user" | "assistant"; segments: Segment[]; timestamp: number };

# 现有 chat-store 初始 state（frontend/src/stores/chat-store.ts:80-85 附近）
messages: [],
todos: [],
status: "idle",
currentTaskId: null,
errorMessage: null,

# 现有 chat-store updateHitlStatus action（219-279 行）提供扫描和 tool pill 回写模板：
# - 从 messages 末尾向前扫
# - 命中 hitl segment 后可基于 toolName 做精确定位
# - 如果 decision ∈ {"rejected", "feedback"}，同步把前置同名 tool pill 的 status 回写为 "rejected"

# 后端新事件契约（plan 12-01 Task 2 落地）
# event: hitl_resolved
# data: { tool_name: string | null, call_id: string | null, decision: "approve"|"edit"|"reject", ts: number }
# decision → HitlStatus 映射（listener 内做）：
#   "approve" | "edit" → "approved"
#   "reject"           → "rejected"
# （不映射到 "feedback" —— 那是前端 UI 路径 `reject + message` 独有的，resume API 没有）

# 现有 EventSource onerror（use-sse.ts:142-149）—— 本 plan 需要替换
# 替换关键点：不再主动 eventSource.close()，否则浏览器 readyState 不会进入 CONNECTING 状态、不会自动重连、不会带 Last-Event-ID

# 现有 chat-area.tsx
"use client";
import type { ReactNode } from "react";
import { TodoToggleButton } from "@/components/todo/todo-toggle-button";

export function ChatArea({ children }: { children: ReactNode }) {
  return (
    <section className="flex h-screen flex-col bg-[var(--color-bg-panel)]">
      <header className="...">
        <TodoToggleButton />
      </header>
      {children}
    </section>
  );
}
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: chat-store 加 connectionStatus 字段 + resolveLastPendingHitl(decision, toolName?) action + 单测</name>
  <files>frontend/src/stores/chat-store.ts, frontend/src/stores/__tests__/chat-store.connection-status.test.ts, frontend/src/stores/__tests__/chat-store.resolve-hitl.test.ts</files>

  <read_first>
    - @frontend/src/stores/chat-store.ts 完整（重点：ChatState 类型定义、initial state、`updateHitlStatus` 219-279、`reset` 与 `loadHistory` 收尾）
    - @frontend/src/stores/__tests__/chat-store.todos.test.ts（vitest setState 模式）
    - @frontend/src/stores/__tests__/ui-store.autoopen.test.ts（debounce / defaults pattern）
    - @.planning/phases/12-resilience/12-PATTERNS.md §6 §12（chat-store 扩展 + 单测骨架）
    - @.planning/phases/12-resilience/12-CONTEXT.md D-09 / D-14
  </read_first>

  <behavior>
    chat-store 行为契约：
    - 初始 `connectionStatus` 为 `"connected"`
    - `setConnectionStatus(s)` 直接 set，不做校验
    - `reset()` / `loadHistory()` 收尾时 `connectionStatus` 回到 `"connected"`
    - `resolveLastPendingHitl(decision, toolName?)`：
      * messages 为空 → no-op（不触发 re-render）
      * 最后一条 message 不是 assistant → no-op
      * 若传入 `toolName`，优先匹配最近一条 `segment.type === "hitl" && segment.status === "pending" && segment.toolName === toolName`
      * 若 `toolName` 缺省/为空，才 fallback 到最近一条 pending HITL
      * assistant message 里找不到可匹配的 pending hitl segment → no-op（幂等核心）
      * 找到时，把它 status 改为 decision；若 decision ∈ {"rejected","feedback"} 且能在更靠前位置找到同 toolName 的 tool pill（status 非 "rejected"），把它的 status 回写为 "rejected"
      * 多个 pending hitl 共存且 `toolName` 可区分时，只改目标 tool 对应那一条；不得误改其他 pending HITL
  </behavior>

  <action>
    ### 1.1 `frontend/src/stores/chat-store.ts` —— 3 处小改

    1. **ChatState 类型**：在既有字段后加
       ```typescript
       connectionStatus: "connected" | "reconnecting";
       setConnectionStatus: (status: "connected" | "reconnecting") => void;
       resolveLastPendingHitl: (
         decision: Exclude<HitlStatus, "pending">,
         toolName?: string | null,
       ) => void;
       ```
       （HitlStatus 已从 `@/lib/types` import，如未 import 顺手加上）

    2. **Initial state**：在现有字段后追加
       ```typescript
       connectionStatus: "connected",
       ```

    3. **Actions**：
       - `setConnectionStatus: (connectionStatus) => set({ connectionStatus }),`
       - `resolveLastPendingHitl` —— 沿用 `updateHitlStatus` 的扫描/回写骨架，但把定位规则改成：
         1. 从最后一条 assistant message 的 segments 末尾向前扫
         2. 若传入 `toolName`，优先找 `type === "hitl" && status === "pending" && toolName === 入参`
         3. 若没传 `toolName`，再找最近一条 `status === "pending"` 的 hitl
         4. 命中后按 `decision` 更新该 hitl；若 `decision === "rejected" || decision === "feedback"`，把命中 hitl 前面最近一条同 `toolName` 的非 rejected tool pill 回写成 `rejected`
         5. 全程 no-op 路径返回 `{}`，不要制造无意义 re-render
         **不要改 `updateHitlStatus` 本身** —— 那是 Phase 09 交互路径
       - `reset` action：把 `connectionStatus: "connected"` 加入回写集
       - `loadHistory` action：同样把 `connectionStatus: "connected"` 加入整体替换 state（仓库现状是同步注入 payload，不存在 `.then(...)` 分支）
       - 这个 action 的注释里加一句：`Addresses review concern: avoid resolving the wrong pending HITL when multiple cards exist`

    约束：
    - 不改 `updateHitlStatus` / `addHitlSegment`（Phase 09 路径）
    - 不改 Zustand persist 配置（connectionStatus 不持久化）
    - `HitlStatus` 只有 "pending" | "approved" | "rejected" | "feedback" 四值；listener 会过滤掉 "pending"

    ### 1.2 `frontend/src/stores/__tests__/chat-store.connection-status.test.ts`（NEW）

    按 PATTERNS §12 骨架实现，至少覆盖：
    - `initial state is 'connected'`
    - `setConnectionStatus flips between connected and reconnecting`（双向）
    - `reset restores connectionStatus to 'connected'`（先置 reconnecting 再 reset）
    - `loadHistory replaces state and restores connectionStatus to 'connected'`

    beforeEach 复位 state 时必须显式写上 `connectionStatus: "connected"`（防止 test 顺序污染）。

    ### 1.3 `frontend/src/stores/__tests__/chat-store.resolve-hitl.test.ts`（NEW）

    至少覆盖 7 个场景：
    - `no-op when no messages`
    - `no-op when last message is user`
    - `no-op when no pending hitl exists`（幂等核心；G-01 关键）
    - `resolves the pending hitl whose toolName matches the payload hint`
    - `falls back to the most recent pending hitl when toolName is missing`
    - `reject decision backfills preceding same-tool tool pill to 'rejected'`
    - `multiple pending hitl: different toolName leaves non-target cards untouched`
    - `idempotent: calling twice, second call is no-op`（显式断言 state 引用未变或状态未二次变化）

    测试数据构造参考 PATTERNS §12。断言风格：`useChatStore.getState().messages[0].segments[n]` + type narrowing。
  </action>

  <verify>
    <automated>cd frontend && npx vitest run src/stores/__tests__/chat-store.connection-status.test.ts src/stores/__tests__/chat-store.resolve-hitl.test.ts</automated>
  </verify>

  <acceptance_criteria>
    - `chat-store.ts` ChatState 类型含 `connectionStatus / setConnectionStatus / resolveLastPendingHitl`
    - 初始 state 含 `connectionStatus: "connected"`
    - `reset()` 会把 `connectionStatus` 重置为 "connected"
    - `resolveLastPendingHitl(decision, toolName?)` 存在且 no-op 路径不触发 re-render
    - 两个 test 文件各自 ≥ 3 / ≥ 7 个 `it`，全部绿
    - `npx vitest run` 全量（含 Phase 10/11 既有）全绿
    - `tsc --noEmit` 零报错
  </acceptance_criteria>

  <done>
    chat-store 前端契约就绪，`use-sse` 可以在 Task 2 里消费 `setConnectionStatus` / `resolveLastPendingHitl(decision, toolName?)`；两个单测文件覆盖 D-14 全部场景，并显式锁死 review 提出的多 pending 错收敛风险。
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: use-sse 加 hitl_resolved listener + 细化 onerror（不主动 close）</name>
  <files>frontend/src/hooks/use-sse.ts</files>

  <read_first>
    - @frontend/src/hooks/use-sse.ts 完整（现有 listener 模式 + onerror 现状 142-149）
    - @.planning/phases/12-resilience/12-PATTERNS.md §5（新 listener + onerror 替换 snippet）
    - @.planning/phases/12-resilience/12-CONTEXT.md D-08 / Claude's Discretion（edit → "approved"，不加 edited_args）
  </read_first>

  <behavior>
    - 收到 `hitl_resolved` 且 payload.decision === "approve" 或 "edit" → 调 `resolveLastPendingHitl("approved", payload.tool_name)`
    - 收到 `hitl_resolved` 且 payload.decision === "reject" → 调 `resolveLastPendingHitl("rejected", payload.tool_name)`
    - 其他 decision 值或 payload 坏帧 → return（和既有 token listener 容错风格一致）
    - 每个 listener（token / tool / hitl / hitl_resolved / todo / done / data-bearing error）首行调 `setConnectionStatus("connected")` —— 收到任何一帧即视为已连上
    - `onerror`：
      * 若已收到终态事件 → `setConnectionStatus("connected")` + close + setStatus("idle")（终态后不遗留 reconnecting）
      * 否则 → `setConnectionStatus("reconnecting")`；**不 close、不调 setError**（让浏览器继续原生自动重连并带 Last-Event-ID）
  </behavior>

  <action>
    1. 在 store selectors 区（hook 顶部 useChatStore calls）加：
       ```typescript
       const setConnectionStatus = useChatStore((s) => s.setConnectionStatus);
       const resolveLastPendingHitl = useChatStore((s) => s.resolveLastPendingHitl);
       ```

    2. 在现有 `eventSource.addEventListener("todo", ...)` 之后、`eventSource.onerror = ...` 之前，新增 listener：
       ```typescript
       eventSource.addEventListener("hitl_resolved", (event) => {
         setConnectionStatus("connected");
         let payload: { decision?: string; tool_name?: string | null };
         try {
           payload = JSON.parse((event as MessageEvent).data);
         } catch {
           return; // 坏帧不中断流
         }
         if (payload.decision === "approve" || payload.decision === "edit") {
           // 注：edit 在前端视为批准的变体（参数已修改后批准），
           // 不使用 "feedback"（那是 09-D 前端独有的 reject+message 路径，resume API 没有）
           resolveLastPendingHitl("approved", payload.tool_name);
         } else if (payload.decision === "reject") {
           resolveLastPendingHitl("rejected", payload.tool_name);
         }
       });
       ```
       在 listener 上方补一句注释：
       `Addresses review concern: prefer payload.tool_name so multiple pending HITL cards do not collapse onto the wrong one.`

    3. 在 **每个**既有 listener（token / tool / hitl / todo / done）函数体第一行（`try` 之前）加：
       ```typescript
       setConnectionStatus("connected");
       ```
       并且对既有 `eventSource.addEventListener("error", (event) => { ... })` 也补一行 `setConnectionStatus("connected");`
       放在 `const maybeMessageEvent = event as MessageEvent;` 之前。原因：
       - 这是服务端主动发出的终态 error 事件，不是网络断流
       - 若不收敛成 connected，随后浏览器触发的 `onerror` 会把 banner 留在 reconnecting 假象
       - 这里是 `Addresses review concern: terminal error must not leave stale reconnect banner`

    4. 替换 `onerror`：
       ```typescript
       eventSource.onerror = () => {
         if (receivedTerminalEvent) {
           setConnectionStatus("connected");
           eventSource.close();
           setStatus("idle");
           return;
         }
         // Phase 12 D-08: 未收终态事件 → 浏览器将自动重连并携带 Last-Event-ID。
         // 不主动 close（否则截断浏览器 reconnect 路径）；不调 setError（那是真正异常路径）。
         setConnectionStatus("reconnecting");
       };
       ```

    5. 更新 useEffect deps 数组，追加 `setConnectionStatus` 和 `resolveLastPendingHitl`。

    约束：
    - 不移动 `error` listener（既有 `addEventListener("error", ...)` —— 后端 data-bearing error 帧路径保留）
    - 不新增 reconnect 次数上限 / 计数器（CONTEXT Deferred）
    - 不改 `EventSource` 构造参数（不加 withCredentials 之类）
    - 保留 `receivedTerminalEvent` 局部变量的既有语义（"是否已见到 done/error"）
  </action>

  <verify>
    <automated>cd frontend && npx tsc --noEmit && npx vitest run</automated>
  </verify>

  <acceptance_criteria>
    - `use-sse.ts` 新增 `eventSource.addEventListener("hitl_resolved", ...)`
    - 6 个既有 listener（token / tool / hitl / todo / done / data-bearing error）开头各有一行 `setConnectionStatus("connected")`
    - `onerror` 替换完成：已收终态时先 `setConnectionStatus("connected")` 再 close；未收终态只置 reconnecting（**无 eventSource.close()**、**无 setError**）
    - useEffect deps 数组含 `setConnectionStatus` / `resolveLastPendingHitl`
    - `tsc --noEmit` 零报错
    - `vitest run` 全量绿（Task 1 两个新文件 + Phase 10/11 既有）
    - `eslint` 无新增告警
  </acceptance_criteria>

  <done>
    断线时浏览器自动重连路径不被 onerror 截断；任意一帧落地即切回 connected；终态 error 不遗留 banner；hitl_resolved 按 `tool_name` 优先收敛正确的 pending HITL。
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: 新建 ReconnectBanner 组件 + 挂载到 chat-area header 上方</name>
  <files>frontend/src/components/layout/reconnect-banner.tsx, frontend/src/components/chat/chat-area.tsx</files>

  <read_first>
    - @DESIGN.md（颜色 / 字重 / 间距 token 清单，**banner 样式严格限 tokens**）
    - @frontend/src/app/globals.css（tokens 实际值）
    - @frontend/src/components/chat/chat-area.tsx 现状
    - @frontend/src/components/todo/todo-toggle-button.tsx（小而克制的单文件组件模板）
    - @frontend/src/components/todo/todo-drawer.tsx header 样式
    - @.planning/phases/12-resilience/12-PATTERNS.md §9 §10（完整 snippet）
    - @.planning/phases/12-resilience/12-CONTEXT.md D-04 / D-10 / D-11
  </read_first>

  <behavior>
    - `ReconnectBanner` 消费 `useChatStore((s) => s.connectionStatus)`
    - 进入 `reconnecting` 后 debounce **1s** 才 `visible=true`（防止 token 级微抖动被放大）
    - 切回 `connected` 后 **300ms** 再 `visible=false`（短暂过渡）
    - `visible=false && status==='connected'` → `return null`
    - 样式 token 严格：bg-panel / text-secondary / border-subtle；**禁用 warning 色**
    - 可访问性：`role="status"` + `aria-live="polite"`
    - 不新增动画（`transition-opacity` 够用）
    - chat-area 把 banner **放在 header 正上方**（不改 grid 结构）
  </behavior>

  <action>
    ### 3.1 新建 `frontend/src/components/layout/reconnect-banner.tsx`

    直接照 PATTERNS §9 snippet 实现（约 35 行）。关键点复核：
    - `"use client"` 指令
    - `import { useEffect, useState } from "react"`
    - `import { useChatStore } from "@/stores/chat-store"`
    - `status === "reconnecting"` → `setTimeout(setVisible(true), 1000)` + cleanup
    - 否则 → `setTimeout(setVisible(false), 300)` + cleanup
    - 早退：`if (!visible && status === "connected") return null;`
    - 样式：
      ```
      flex items-center gap-2 px-4 py-1.5
      text-[13px] font-[510] text-[var(--color-text-secondary)]
      bg-[var(--color-bg-panel)]
      border-b border-[var(--color-border-subtle)]
      transition-opacity duration-200
      ```
    - 指示点：`w-1.5 h-1.5 rounded-full bg-[var(--color-text-tertiary)] animate-pulse`
    - 文案：`连接中断，正在重连…`（全中文）

    约束：
    - 不抽 `<Icon>` / `<StatusDot>` 子组件（CLAUDE.md 简洁优先）
    - 不使用 `framer-motion`（项目未依赖；`transition-opacity` 足够）
    - 不 export default（与 `todo-toggle-button.tsx` 同风格）

    ### 3.2 改 `frontend/src/components/chat/chat-area.tsx`

    照 PATTERNS §10 snippet：
    ```typescript
    "use client";
    import type { ReactNode } from "react";
    import { ReconnectBanner } from "@/components/layout/reconnect-banner";
    import { TodoToggleButton } from "@/components/todo/todo-toggle-button";

    type ChatAreaProps = { children: ReactNode };

    export function ChatArea({ children }: ChatAreaProps) {
      return (
        <section className="flex h-screen flex-col bg-[var(--color-bg-panel)]">
          <ReconnectBanner />
          <header className="flex items-center justify-end px-4 py-2 border-b border-[var(--color-border-subtle)]">
            <TodoToggleButton />
          </header>
          {children}
        </section>
      );
    }
    ```

    约束：
    - **不改 `app-layout.tsx`** / 不改 grid 结构（banner 在 chat-area 内部挂即可；隐身时 `return null` 不占空间）
    - **不改 `page.tsx`**（CONTEXT additional_constraints：RESIL-02 自然路径 page.tsx 无需改动；已通过 handleSwitch + active_task.status 闭环）
    - **不改 `session-store.ts` / `api.ts` / `types.ts`**（同上）
    - 不加 unit test（这是一个小 UI 壳，useState + debounce 行为由 e2e/UAT 验证；Task 1 / Task 2 的 store + hook 单测已覆盖状态机）
  </action>

  <verify>
    <automated>cd frontend && npx tsc --noEmit && npx eslint src/components/layout/reconnect-banner.tsx src/components/chat/chat-area.tsx && npx next build</automated>
  </verify>

  <acceptance_criteria>
    - `reconnect-banner.tsx` 存在，行数 ≤ 50
    - `ReconnectBanner` 导出为 named export
    - 样式仅用 CSS 变量 `--color-bg-panel / --color-text-secondary / --color-text-tertiary / --color-border-subtle`；不出现 `red` / `yellow` / `warning` / `error` 字样
    - `chat-area.tsx` 新增 `<ReconnectBanner />`，放在 `<header>` 之前
    - `chat-area.tsx` grid / section / header 类名未改（diff 只是新增一行 import + 一行 JSX）
    - `app-layout.tsx` / `page.tsx` / `session-store.ts` / `api.ts` / `types.ts` 零 diff
    - `tsc --noEmit` / `eslint` / `next build` 全绿
  </acceptance_criteria>

  <done>
    Banner 组件就绪并挂在 chat-area 顶栏；隐身时不占空间；断线时出现，重连成功消失；整个前端侧 Phase 12 代码改动合并完毕，UAT plan 12-03 可以跑。
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| EventSource (browser) → React app | SSE 帧由后端推送；浏览器解析事件名/data 后交给 listener |
| `hitl_resolved` payload → chat-store | decision 字段直接驱动状态迁移；`tool_name` 参与匹配目标 HITL，`call_id` 当前仅随契约透传 |
| `connectionStatus` → banner UI | 单向状态流；banner 无用户交互 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-12-06 | Tampering | `hitl_resolved` payload 注入非法 decision / 伪造 tool_name | mitigate | listener 内白名单校验 decision ∈ {"approve","edit","reject"}；tool_name 只在本地 assistant message 的 pending HITL 集合中做匹配，匹配不到直接 no-op；JSON.parse 失败 return |
| T-12-07 | DoS (UI flicker) | 高频 hitl_resolved 重放时 banner 闪动 | mitigate | banner 用 debounce 1s + 300ms 过渡，高频切换期间不重渲染；resolveLastPendingHitl 幂等 no-op 分支不触发 zustand re-render |
| T-12-08 | Information Disclosure | banner 文案泄漏内部状态 | accept | 文案仅"连接中断，正在重连…"，不含 task_id / url / 错误堆栈 |
| T-12-09 | Misalignment | listener 把 decision="reject" 错映射为 "feedback" 或误收敛错误 card | mitigate | Task 2 action 明确注释 edit→approved / reject→rejected 映射；Task 1 的 resolve-hitl test 断言按 tool_name 精确定位目标 card，reject 场景最终 status === "rejected" |
| T-12-10 | Tampering | onerror 里误调 close() 截断浏览器原生重连 | mitigate | Task 2 acceptance_criteria 明确"onerror 未收终态时无 eventSource.close()"；代码审查 + UAT 场景 1 主动断网验证 |
</threat_model>

<verification>
- `cd frontend && npx tsc --noEmit`（零报错）
- `cd frontend && npx eslint src/`（无新增告警）
- `cd frontend && npx vitest run`（全量绿；含 Phase 10/11 既有 + Task 1 新增）
- `cd frontend && npx next build`（生产构建通过）
- 手工冒烟：`npm run dev` 启动，页面顶栏无 banner；Chrome DevTools → Network → Offline 5s → 顶栏出现 banner；恢复后 banner 消失
</verification>

<success_criteria>
1. chat-store 扩展后 Phase 10/11 既有测试全绿（无回归）
2. Phase 12 新增 vitest ≥ 9 个 `it` 全绿
3. 断网模拟场景 banner 出现且浏览器 EventSource 自动重连，终态 error 不会让 banner 卡死
4. `page.tsx` / `session-store.ts` / `api.ts` / `types.ts` / `app-layout.tsx` 零改动
5. banner 样式无 warning 色 / 无自造 token
</success_criteria>

<output>
完成后创建 `.planning/phases/12-resilience/12-02-SUMMARY.md`，含：
- 实际 files_modified 清单 + 每个文件行数变化
- Task 1~3 verify 结果
- 任何实际实现过程中的偏差与理由（例如 loadHistory 单测是否落地）
- 给 UAT plan 12-03 的提示：如何在 DevTools Network 面板模拟断网
</output>
