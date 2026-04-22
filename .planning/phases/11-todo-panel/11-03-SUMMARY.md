---
phase: 11-todo-panel
plan: "03"
subsystem: frontend-store-wiring
tags: [frontend, zustand, todos, sse, chat-store, ui-store, store-tests, wave-2]
dependency_graph:
  requires: [TodoModel(backend), HistoryResponse.todos(backend), 11-02]
  provides: [ui-store.ts, chat-store.todos, use-sse.todo-listener, page.tsx-migration]
  affects:
    - frontend/src/lib/types.ts
    - frontend/src/stores/chat-store.ts
    - frontend/src/stores/ui-store.ts
    - frontend/src/hooks/use-sse.ts
    - frontend/src/app/page.tsx
tech_stack:
  added: [zustand/middleware persist]
  patterns:
    - Zustand persist + skipHydration（项目首次落地，后续 UI 持久化范式）
    - SSE listener parse→validate→dispatch 三步模板
    - store 单测用 vi.stubGlobal localStorage + setState 重置
key_files:
  created:
    - frontend/src/stores/ui-store.ts
    - frontend/src/stores/__tests__/ui-store.test.ts
    - frontend/src/stores/__tests__/ui-store.autoopen.test.ts
    - frontend/src/stores/__tests__/chat-store.todos.test.ts
    - frontend/src/stores/__tests__/chat-store.session-switch.test.ts
  modified:
    - frontend/src/lib/types.ts
    - frontend/src/stores/chat-store.ts
    - frontend/src/hooks/use-sse.ts
    - frontend/src/app/page.tsx
decisions:
  - "ui-store persist key: neuron-assistant:ui-store:v1，skipHydration=true，partialize 只保留 todoDrawerOpen"
  - "hasAutoOpenedFor: Set<string> 不入 localStorage，避免 sessionId 泄漏 + Set 序列化陷阱"
  - "autoOpenDrawer 幂等：Set.has 检查同时守住 user close 语义（Set 内 sessionId 保留，再次 auto-open 被拦截）"
  - "loadHistory 对象签名 breaking change 与 page.tsx 4 处调用同一 commit 迁移"
  - "use-sse todo listener 用 setTodos 整体覆盖，不含任何累加语义（reattach 重放幂等）"
metrics:
  duration: "~20min"
  completed: "2026-04-22T00:58:00Z"
  tasks_completed: 3
  files_changed: 9
---

# Phase 11 Plan 03: 前端数据层闭环 Summary

**一句话：** 新建 ui-store（Zustand persist，项目首次落地），chat-store 加 todos state + setTodos + loadHistory 对象签名，use-sse 挂 todo listener（SSE-only auto-open），page.tsx 四处调用迁移，4 个 store 单测文件全绿，vitest 24/24 + next build 通过。

## What Was Built

### Task 1: ui-store.ts（Zustand persist 范式）

`frontend/src/stores/ui-store.ts`：

- `todoDrawerOpen: boolean` — 通过 persist 写 localStorage
- `hasAutoOpenedFor: Set<string>` — 纯内存，partialize 过滤
- `toggleDrawer / openDrawer / closeDrawer` — 幂等操作
- `autoOpenDrawer(sessionId)` — 幂等：Set.has 检查；用户手动 closeDrawer 后同 sessionId 再调不重开（尊重关闭意图）

**persist 配置：**
```typescript
persist(..., {
  name: "neuron-assistant:ui-store:v1",
  storage: createJSONStorage(() => localStorage),
  skipHydration: true,
  partialize: (s) => ({ todoDrawerOpen: s.todoDrawerOpen }),
})
```

注意：`skipHydration: true` 配合根节点 `useUIStore.persist.rehydrate()` 使用（在 11-04 的 app-layout.tsx 加 useEffect）。

### Task 2: types.ts + chat-store.ts

**types.ts 新增：**
```typescript
export type Todo = {
  content: string;
  status: "pending" | "in_progress" | "completed";
};

// HistoryResponse 扩展：
todos: Todo[];
```

**chat-store 外科手术改动（最小集）：**
- 初值 `todos: []`
- `setTodos: (todos) => set({ todos })` — 整体覆盖，无 rafId 逻辑
- `loadHistory` 签名：`(payload: { messages: Message[]; todos: Todo[] }) => void`
- `reset` 追加 `todos: []`

### Task 3: use-sse.ts + page.tsx

**use-sse.ts todo listener：**
```typescript
eventSource.addEventListener("todo", (event) => {
  let payload: { todos?: Todo[] };
  try { payload = JSON.parse((event as MessageEvent).data); } catch { return; }
  if (!Array.isArray(payload.todos)) return;
  setTodos(payload.todos);
  if (payload.todos.length > 0) autoOpenDrawer(sessionId);
});
```
- deps 数组追加 `setTodos, autoOpenDrawer`
- 无任何 `[...` / `concat` / `merge` / `.map` 累加语义

**page.tsx 迁移（4 处）：**
- `loadHistoryAction([])` → `loadHistoryAction({ messages: [], todos: [] })`（3 处空态）
- `loadHistoryAction(msgs)` → `loadHistoryAction({ messages: msgs, todos: hist.todos })`（1 处历史注入）

## 4 个单测覆盖点

| 文件 | 覆盖点 | 测试数 |
|------|--------|--------|
| `ui-store.test.ts` | 初值/toggleDrawer/openDrawer/closeDrawer 幂等 | 3 |
| `ui-store.autoopen.test.ts` | 首次 auto-open、幂等、用户 close 后不重开、跨 session 隔离、SSE-only 契约 | 5 |
| `chat-store.todos.test.ts` | 初值/setTodos 写入/整体覆盖不 merge/清空 | 4 |
| `chat-store.session-switch.test.ts` | loadHistory 注入/空态/reset 清空/整体替换/currentTaskId 清空 | 5 |

**总计：17 条新测试 + 7 条既有（time-group）= 24 passed**

## auto-open 触发源 SSE-only 证据链

1. **ui-store 不暴露任何触发 auto-open 的其他路径**：`ui-store.autoopen.test.ts` 第 5 条测试穷举 toggleDrawer/openDrawer/closeDrawer 均不改变 `hasAutoOpenedFor`
2. **use-sse.ts 是唯一调用点**：`grep -rn "autoOpenDrawer" frontend/src/` 命中：ui-store.ts（定义）、use-sse.ts（调用）、两个 test 文件；page.tsx 无命中
3. **page.tsx 不调 autoOpenDrawer**：`grep -c "autoOpenDrawer" frontend/src/app/page.tsx` = 0
4. **loadHistory 路径不触发 auto-open**：`chat-store.loadHistory` 只写 messages + todos，不触及 ui-store

## localStorage 持久化配置（后续 UI 持久化范式）

| 配置项 | 值 |
|--------|-----|
| key | `neuron-assistant:ui-store:v1` |
| skipHydration | `true`（SSR mismatch 规避）|
| partialize | `{ todoDrawerOpen: boolean }`（无 PII，无 Set）|
| hasAutoOpenedFor | 不持久化（内存 only，每次打开 App 重置）|
| 根节点 hydration | `useUIStore.persist.rehydrate()`（在 11-04 app-layout.tsx 加）|

## Deviations from Plan

**1. [Rule 2 - 测试健壮性] chat-store.session-switch.test.ts 中 mkMsg 的 segment 类型**

- **Found during:** Task 2 写测试时
- **Issue:** types.ts 中 `TextSegment` 的文本字段是 `content`（非 `text`），PLAN.md 示例 mkMsg 用 `{ type: "text", text: "" }` 会产生 TS 类型错误
- **Fix:** 改为 `{ type: "text", content: "" }` 并加 `timestamp: 0`，与 Message 类型完全对齐，无需 `as unknown as Message` 强制转换

无其他偏差，plan 执行按计划完成。

## Known Stubs

无。todos 数据流从 SSE 事件 → setTodos → chat-store.todos 完整串通；loadHistory 路径从后端响应 hist.todos 注入；UI 组件层在 11-04 贴皮（todo-drawer/list/item），本 plan 仅数据层。

## Threat Flags

无新增信任边界。T-11-02 / T-11-03 / T-11-04 缓解措施已实现：
- T-11-02：JSON.parse try/catch 静默吞 + Array.isArray 校验；use-sse.ts 无 dangerouslySetInnerHTML
- T-11-03：partialize 只保留 todoDrawerOpen（无 PII）；hasAutoOpenedFor 不入 localStorage
- T-11-04：hasAutoOpenedFor per-sessionId track；单测锁定用户 close 后不重弹

## Self-Check: PASSED

- [x] `frontend/src/stores/ui-store.ts` 存在，含 `persist(` + `skipHydration: true` + `neuron-assistant:ui-store:v1` + `partialize`
- [x] `frontend/src/stores/__tests__/ui-store.test.ts` 存在
- [x] `frontend/src/stores/__tests__/ui-store.autoopen.test.ts` 存在
- [x] `frontend/src/lib/types.ts` 含 `export type Todo` + `todos: Todo[]`（HistoryResponse）
- [x] `frontend/src/stores/chat-store.ts` 含 `setTodos` + `todos: []`（2处）+ `payload: { messages: Message[]; todos: Todo[] }` 签名
- [x] `frontend/src/stores/__tests__/chat-store.todos.test.ts` 存在
- [x] `frontend/src/stores/__tests__/chat-store.session-switch.test.ts` 存在
- [x] `frontend/src/hooks/use-sse.ts` 含 `addEventListener("todo"` + `autoOpenDrawer(sessionId)` + `from "@/stores/ui-store"`
- [x] `frontend/src/app/page.tsx`：`grep -c "loadHistoryAction({"` = 4，`grep -c "loadHistoryAction(\["` = 0，`grep -c "autoOpenDrawer"` = 0
- [x] commit `4b25b64` 存在（Task 1）
- [x] commit `5e40063` 存在（Task 2）
- [x] commit `47259fc` 存在（Task 3）
- [x] vitest 24/24 passed
- [x] next build 成功（无 TS 错误）
