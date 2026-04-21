---
phase: 10-session-management
plan: 03
subsystem: frontend-data-layer
tags: [frontend, zustand, domain-slice, react-hooks, sse, wave-1]
dependency_graph:
  requires:
    - 10-01 冻结的后端 API 契约（GET /api/sessions、POST /api/sessions 幂等、GET /api/sessions/{id}/messages、DELETE /api/sessions/{id}）
    - 10-02 落地的 time-group.ts（局部 Session 类型待回切）
  provides:
    - frontend/src/lib/types.ts::Session / ActiveTask / HistoryResponse
    - frontend/src/lib/api.ts::listSessions / createSessionAPI / deleteSession / loadHistory
    - frontend/src/stores/session-store.ts::useSessionStore（domain-sliced，含 7 个 actions）
    - frontend/src/stores/chat-store.ts::loadHistory(messages) action
    - frontend/src/hooks/use-sse.ts::useSSE(taskId, sessionId)
  affects:
    - frontend/src/app/page.tsx（预期 TS 报错 1 处，留 10-04 Task 2 修复）
tech_stack:
  added: []
  patterns:
    - "domain-sliced store：session-store 与 chat-store 并列，activeSessionId 迁移到 session-store"
    - "乐观删除 + 8s 撤销窗口：deleteOptimistic 先本地移除+置 deletedPending，失败回滚"
    - "幂等恢复：restoreSession 调 POST /api/sessions（session_id 已存在时后端返回原记录）"
    - "one-shot history setter：loadHistory 直接 set({ messages }) 不走 RAF token buffer（Anti-Pattern 禁止）"
    - "useSSE 依赖数组加 sessionId：让 React 自动 cleanup，不手动 eventSource.close（Anti-Pattern 禁止）"
    - "字段映射：后端 session_id → 前端 id 在 api.ts::mapSession 边界完成，store/组件层只见 id"
key_files:
  created:
    - frontend/src/stores/session-store.ts
  modified:
    - frontend/src/lib/types.ts
    - frontend/src/lib/api.ts
    - frontend/src/lib/time-group.ts
    - frontend/src/stores/chat-store.ts
    - frontend/src/hooks/use-sse.ts
decisions:
  - "采用 mapSession 字段映射方案（PLAN §interfaces 方案 B）：time-group.ts 期望 s.id，api.ts 一次性映射，避免 sidebar/time-group/store 多处改字段名"
  - "createSessionId 辅助函数彻底删除（grep 显示除 chat-store 自身外无其他消费者），而非保留为 unused；简洁优先"
  - "useSSE 不在 effect 内主动 eventSource.close() 响应 sessionId 变化，只靠依赖数组触发 React cleanup（遵循 RESEARCH Anti-Patterns）"
  - "session-store.createLocal 使用 Date.now()/1000 作 created_at/last_updated，保证本地占位会进入 today 分组"
metrics:
  duration: 2m34s
  completed: "2026-04-21"
  tasks_total: 3
  tasks_completed: 3
  files_created: 1
  files_modified: 5
---

# Phase 10 Plan 03: 前端数据层（types / api / session-store / chat-store.loadHistory / useSSE）Summary

**One-liner：** 为 Phase 10 前端冻结 types/api 契约与 session-store domain slice，把 `activeSessionId` 从 chat-store 迁走、新增 `chat-store.loadHistory` one-shot setter，并给 `useSSE` 加 `sessionId` 依赖以切换会话时自动 cleanup EventSource。

---

## Plan

- **Phase:** 10-session-management
- **Plan:** 03
- **Wave:** 1（depends_on 10-01 + 10-02）
- **Scope:** 前端 lib/stores/hooks 数据层；不触 components 与 page.tsx（留 10-04）

---

## Tasks

### Task 1: types.ts + api.ts + time-group.ts ✅
- types.ts 新增 `Session` / `ActiveTask` / `HistoryResponse`
- api.ts 新增 `listSessions / createSessionAPI / deleteSession / loadHistory` + 内部 `RawSession → Session` 映射
- time-group.ts 删除局部 `type Session`，改 `import type { Session } from "@/lib/types"`

### Task 2: session-store.ts 新建 + chat-store.ts 迁移 ✅
- 新建 `frontend/src/stores/session-store.ts`
- `chat-store.ts` 移除 `activeSessionId` 字段 + 删掉 `createSessionId` 辅助函数 + `reset` 不再生成新 id
- `chat-store.ts` 新增 `loadHistory(messages: Message[]) => void`

### Task 3: useSSE 双参数 + 依赖数组加 sessionId ✅
- 签名 `useSSE(taskId: string | null) → useSSE(taskId: string | null, sessionId: string)`
- 依赖数组第二位加 `sessionId`；effect 内部业务逻辑 0 改动

---

## Commits

| # | Commit  | Message                                                                                                                     |
|---|---------|-----------------------------------------------------------------------------------------------------------------------------|
| 1 | 7755038 | feat(10-03): types.ts 新增 Session/ActiveTask/HistoryResponse + api.ts 4 个会话接口 + time-group 切回共享 Session             |
| 2 | 881159f | feat(10-03): 新建 session-store + chat-store 迁走 activeSessionId 并新增 loadHistory action                                   |
| 3 | 1a5df61 | feat(10-03): useSSE 签名加 sessionId 参数 + 依赖数组加 sessionId                                                              |

---

## Duration

约 2m34s（00:51:58Z → 00:54:32Z），三任务顺序执行，无 blocker。

---

## Verification

### Automated

```bash
cd frontend && npx vitest run
# ✓ src/lib/__tests__/time-group.test.ts (7 tests) 3ms
# Test Files  1 passed (1)
#      Tests  7 passed (7)

cd frontend && npx tsc --noEmit 2>&1 | grep -v "src/app/page.tsx" | grep -E "error TS"
# (空输出 → 除 page.tsx 外 tsc 无 error)
```

实际 tsc 输出仅剩一条 expected handoff：

```
src/app/page.tsx(18,57): error TS2339: Property 'activeSessionId' does not exist on type 'ChatState'.
```

这是 PLAN 明确约定的交接点（page.tsx 现在读 `state.activeSessionId`，由 10-04 Task 2 切到 `useSessionStore`）。

### Grep 自检

- `grep -c "activeSessionId" frontend/src/stores/chat-store.ts` → 0 ✔
- `grep -c "loadHistory" frontend/src/stores/chat-store.ts` → 2（type 声明 + action 实现）✔
- `grep -c "useSessionStore\|activeSessionId" frontend/src/stores/session-store.ts` → ≥4 ✔
- `grep -n "sessionId" frontend/src/hooks/use-sse.ts` → 2（参数 + deps）✔
- `grep -c "listSessions\|deleteSession\|createSessionAPI\|loadHistory" frontend/src/lib/api.ts` → 4 ✔

---

## Key Outputs for Plan 04

### `useSessionStore` 导出 shape（Sidebar + page.tsx 消费）

```typescript
type SessionState = {
  sessions: Session[];
  activeSessionId: string;
  deletedPending: Session | null;

  loadSessions: () => Promise<Session[]>;
  setActive: (id: string) => void;
  createLocal: () => string;
  deleteOptimistic: (id: string) => Promise<void>;
  restoreSession: (session: Session) => Promise<void>;
  clearDeletedPending: () => void;
  upsertSession: (session: Session) => void;
};
```

### `chat-store` 新增/变更

- `loadHistory(messages: Message[])` — 历史切换时调用：清 RAF/tokenBuffer，一次性 `set({ messages, status: "idle", currentTaskId: null, errorMessage: null })`
- `activeSessionId` 字段 + 对应 initial/reset 副作用已移除
- 旧 `reset()` 现在只负责 chat 内容清空，不再生成新 session id

### `useSSE` 签名变更对比

| 位置 | Before | After |
|------|--------|-------|
| signature | `useSSE(taskId: string \| null): void` | `useSSE(taskId: string \| null, sessionId: string): void` |
| deps array | `[taskId, appendToken, ...]` | `[taskId, sessionId, appendToken, ...]` |
| effect body | unchanged | unchanged（无主动 close，依赖数组驱动 cleanup） |

### 10-04 预期修复点（TS 报错 + 集成）

| 文件 | 现状 | 10-04 需要做 |
|------|------|-------------|
| `frontend/src/app/page.tsx` | `state.activeSessionId` 报 TS2339；`useSSE(currentTaskId)` 缺第二参 | 改为 `useSessionStore((s) => s.activeSessionId)`；`useSSE(currentTaskId, activeSessionId)`；`handleNew` 调 `createLocal`；`handleSwitch` 调 `setActive` + `loadHistory`；`handleDelete` 调 `deleteOptimistic` + 8s 撤销窗口 |
| `frontend/src/components/sidebar/sidebar.tsx`（如存在） | 当前仍是 Plan 08 mock | 换成 `useSessionStore` + `groupSessions`，渲染 today/yesterday/week/older 四桶 |

---

## Deviations from Plan

### Auto-fixed Issues

无 Rule 1/2/3 触发。三个 Task 按 PLAN <action> 步骤执行，无需自动修复。

### Adjustments

- **`createSessionId` 辅助函数：直接删除而非保留为 unused**
  - PLAN Task 2 action 提了"保守做法：保留函数定义但不再调用"
  - Grep 确认除 chat-store 自身 initial state + reset 外无其他 import 使用者（`page.tsx` 只引 `state.activeSessionId`，不引 `createSessionId`）
  - 删除更符合 CLAUDE.md §3 "自己改动产生的孤儿函数自己清掉"
  - 对下游 Plan 04 无影响（不需要再次清理）

### Scope Compliance

- 本 Plan 完全不动 components / page.tsx（CLAUDE.md 外科手术原则 + PLAN wave 隔离）
- api.ts 未新增 PLAN 未列出的接口（invokeChat / resumeChat 保留原样）
- useSSE 未引入 backoff / retry（Phase 12 scope）
- session-store 的 actions 仅包含 PLAN must_haves.truths 列出字段

---

## Known Stubs

无。本 Plan 产出均为可运行逻辑；唯一"占位"语义是 `session-store.createLocal` 生成的本地 Session（`title=""`, `last_task_id=null`），其在用户首次 `invokeChat` 时由后端幂等持久化（10-01 TaskService.start_invoke P-06 语义）。这是数据流设计中预期的占位，非 stub。

---

## Threat Flags

无新增威胁表面。本 Plan 产出全部在前端层；唯一 I/O 是 fetch 四个已冻结端点，T-10-01/02 的 enforcement 由 10-01 后端 `user_id=user_id` 绑定负责。`mapSession` 为纯 JSON rename（T-10-06 accept）。

---

## Self-Check: PASSED

### Files Created
- `frontend/src/stores/session-store.ts` — FOUND

### Files Modified
- `frontend/src/lib/types.ts` — FOUND（新增 Session/ActiveTask/HistoryResponse 块）
- `frontend/src/lib/api.ts` — FOUND（新增 4 个函数 + mapSession）
- `frontend/src/lib/time-group.ts` — FOUND（import type { Session } from @/lib/types）
- `frontend/src/stores/chat-store.ts` — FOUND（activeSessionId/createSessionId 已全清；loadHistory 已加入）
- `frontend/src/hooks/use-sse.ts` — FOUND（双参数 + deps 含 sessionId）

### Commits
- `7755038` feat(10-03): types.ts 新增 Session/ActiveTask/HistoryResponse + api.ts 4 个会话接口 + time-group 切回共享 Session — FOUND
- `881159f` feat(10-03): 新建 session-store + chat-store 迁走 activeSessionId 并新增 loadHistory action — FOUND
- `1a5df61` feat(10-03): useSSE 签名加 sessionId 参数 + 依赖数组加 sessionId — FOUND

### Verification Gates
- `cd frontend && npx vitest run` → 7/7 passed ✔
- `cd frontend && npx tsc --noEmit`（除 page.tsx expected handoff 外）→ 0 error ✔
- git status（SUMMARY 之外）干净 ✔
