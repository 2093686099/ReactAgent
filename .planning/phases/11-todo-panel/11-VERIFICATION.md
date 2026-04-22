---
phase: 11-todo-panel
verified: 2026-04-21T09:30:00Z
status: passed
score: 2/2 ROADMAP success criteria verified
overrides_applied: 0
---

# Phase 11: Todo Panel — Verification Report

**Phase Goal:** 用户可以实时看到 Agent 的任务规划和执行进度
**Verified:** 2026-04-21T09:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths（ROADMAP Success Criteria）

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Agent 执行时，todo 列表实时出现在面板中，展示当前任务规划 | ✓ VERIFIED | `use-sse.ts:117-131` 订阅 `todo` SSE 事件 → `setTodos(payload.todos)`；`todo-list.tsx` 从 `chat-store.todos` 渲染；UAT 验证点 A ✅ |
| 2 | todo 项状态变化（pending → done）时界面自动更新 | ✓ VERIFIED | `setTodos` 整体覆盖（chat-store 单测锁定）；`todo-item.tsx` 三态条件渲染；150ms CSS transition；UAT 验证点 G/F ✅ |

**Score:** 2/2 ROADMAP success criteria verified

---

### Plan Must-Have Truths（Per-Plan Verification）

#### 11-01: Fixture 扩展

| Truth | Status | Evidence |
|-------|--------|----------|
| 旧调用 `make_checkpoint_tuple(messages)` 保持向后兼容 | ✓ VERIFIED | `checkpoint_factory.py:57` — `todos: list[dict] \| None = None` 默认参数；既有 3 处调用未修改仍通过 |
| `make_checkpoint_tuple(messages, todos=[...])` 写入 `channel_values["todos"]` | ✓ VERIFIED | `checkpoint_factory.py:67-68` — `if todos is not None: channel_values["todos"] = todos` |
| `todos=None` 时 `channel_values` 不含 `todos` 键 | ✓ VERIFIED | 条件写入逻辑确认；`test_messages_endpoint_returns_empty_todos` 验证 |
| `todos=[]` 时 `channel_values` 含 `todos: []` | ✓ VERIFIED | 同上逻辑；`todos is not None` 为真，写入空列表 |

#### 11-02: 后端契约

| Truth | Status | Evidence |
|-------|--------|----------|
| `GET /api/sessions/{id}/messages` 响应体包含 `todos` 字段（所有返回分支） | ✓ VERIFIED | `history.py:130-135`（checkpointer=None）、`history.py:140-145`（ckpt_tuple=None）、`history.py:166-170`（正常路径）各含 `"todos"` 字段 |
| 空 state.todos / 无 todos 键 / 无 checkpoint / checkpointer=None 四种场景均返回 `todos: []` | ✓ VERIFIED | 10/10 后端测试通过；`test_messages_endpoint_returns_empty_todos`、`test_load_history_when_checkpointer_is_none`、`test_load_history_when_no_checkpoint` 均断言 `todos == []` |
| 非空 state.todos 被序列化（形状兜底）| ✓ VERIFIED | `history.py:152-159` — `isinstance(t, dict)` filter + 只透出 `content`/`status`；`test_messages_endpoint_returns_todos_from_checkpoint` 验证 3 条 todos |
| `TodoModel` 强校验 status ∈ {pending, in_progress, completed} | ✓ VERIFIED | `models/chat.py:50-57` — `Literal["pending", "in_progress", "completed"]` |
| CONTEXT.md D-08 token 从 `--color-border-default` 更正为 `--color-border-standard` | ✓ VERIFIED | `grep -c "color-border-default" 11-CONTEXT.md` = 0 |

#### 11-03: 前端数据层

| Truth | Status | Evidence |
|-------|--------|----------|
| `types.ts` 导出 `Todo` 与扩展的 `HistoryResponse` | ✓ VERIFIED | `types.ts:28-31` — `export type Todo`；`types.ts:55-60` — `HistoryResponse` 含 `todos: Todo[]` |
| `chat-store.todos` 初值 `[]`；`setTodos` 整体覆盖 | ✓ VERIFIED | `chat-store.ts:82` — `todos: []`；`chat-store.ts:302` — `setTodos: (todos) => set({ todos })`；`chat-store.todos.test.ts` 4 条测试锁定覆盖语义 |
| `chat-store.loadHistory` 签名改为对象 `{messages, todos}`，reset 清空 todos | ✓ VERIFIED | `chat-store.ts:22` — 对象签名；`chat-store.ts:313` — `todos: payload.todos`；`chat-store.ts:328` — reset 含 `todos: []` |
| `ui-store.todoDrawerOpen` 通过 Zustand persist（key `neuron-assistant:ui-store:v1`，`skipHydration: true`，`partialize` 只保留 `todoDrawerOpen`） | ✓ VERIFIED | `ui-store.ts:30-34` — 完整 persist 配置确认 |
| `ui-store.hasAutoOpenedFor: Set<string>` 仅内存，不入 localStorage | ✓ VERIFIED | `partialize: (s) => ({ todoDrawerOpen: s.todoDrawerOpen })` — Set 被过滤 |
| `ui-store.autoOpenDrawer(sessionId)` 幂等；用户关闭后不再触发 | ✓ VERIFIED | `ui-store.ts:21-27` — Set.has 拦截逻辑；`ui-store.autoopen.test.ts` 5 条测试（含 D-02 硬约束测试） |
| `use-sse.ts` `todo` listener 调 `setTodos(payload.todos)` + 仅当 `length > 0` 时调 `autoOpenDrawer` | ✓ VERIFIED | `use-sse.ts:117-131` — 整体覆盖语义，无 concat/merge/[... 累加 |
| auto-open 只在 live SSE `todo` listener 触发；`loadHistory` 不触发 | ✓ VERIFIED | `autoOpenDrawer` 命中：`ui-store.ts`（定义）、`use-sse.ts`（调用）、`ui-store.autoopen.test.ts`（测试）；`page.tsx` / `chat-store.ts` / 任何 loadHistory 路径无 `autoOpenDrawer` 调用 |
| `page.tsx` 四处 `loadHistoryAction` 改成对象签名 | ✓ VERIFIED | `page.tsx:58,69,126,134` — 4 处均为 `loadHistoryAction({`；旧数组签名 `loadHistoryAction([` 消除（grep 返回 0） |

#### 11-04: 前端 UI

| Truth | Status | Evidence |
|-------|--------|----------|
| Drawer 可见时 AppLayout grid `[240px_1fr_320px]`，关闭时 `[240px_1fr]`，transition 200ms | ✓ VERIFIED | `app-layout.tsx:19-24` — 条件式 cols + `transition-[grid-template-columns] duration-200 ease-out` |
| AppLayout 为 client component + `useUIStore.persist.rehydrate()` 调用 | ✓ VERIFIED | `app-layout.tsx:1` — `"use client"`；`app-layout.tsx:14-16` — `useEffect(() => { void useUIStore.persist.rehydrate(); }, [])` |
| TodoItem 三态图标用正确 DESIGN.md token | ✓ VERIFIED | `todo-item.tsx` — pending: `var(--color-border-standard)`；in_progress stroke: `var(--color-accent)`；completed 填充: `var(--color-accent)` + 白色 Check |
| TodoItem 文案颜色固定 `--color-text-secondary` | ✓ VERIFIED | `todo-item.tsx:12` — `text-[var(--color-text-secondary)]`（不随状态变） |
| globals.css 新增 `@keyframes todoEnter`（不新增 color/border token） | ✓ VERIFIED | `globals.css:95-104` — `@keyframes todoEnter` 存在；D-15 约束：无新增 `--color-*` token |
| Chat header 右上角 TodoToggleButton 无红点/徽标 | ✓ VERIFIED | `todo-toggle-button.tsx` — 无 badge/dot；`aria-pressed={drawerOpen}`；常显（无 `opacity-0 group-hover` 隐藏） |

#### 11-05: UAT

| Truth | Status | Evidence |
|-------|--------|----------|
| Drawer 首次收到 SSE todo 事件（`todos.length > 0`）时自动弹出一次 | ✓ VERIFIED (human) | 11-05-SUMMARY.md 验证点 A ✅ |
| 切换会话：todos 清空并从目标 session 历史还原（不触发 auto-open） | ✓ VERIFIED (human) | 11-05-SUMMARY.md 验证点 C ✅ |
| 删除当前会话落下一条：todos 跟随切换 | ✓ VERIFIED (human) | 11-05-SUMMARY.md 验证点 D ✅ |
| reattach（from_id=0 重放）下历史 todo 事件幂等覆盖 | ✓ VERIFIED (human) | 11-05-SUMMARY.md 验证点 E ✅ |
| DESIGN.md token 三态图标走查 | ✓ VERIFIED (human) | 11-05-SUMMARY.md 验证点 F ✅ |
| 动效时长（item 200ms / 图标 150ms / drawer 200ms / spinner 1s） | ✓ VERIFIED (human) | 11-05-SUMMARY.md 验证点 G ✅ |
| 同一时刻最多一条 in_progress | ✓ VERIFIED (human) | 11-05-SUMMARY.md 验证点 H ✅（monitor 日志确认） |

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/tests/fixtures/checkpoint_factory.py` | Checkpoint fixture with optional todos parameter | ✓ VERIFIED | `todos: list[dict] \| None = None` 参数；条件写入 `channel_values["todos"]` |
| `backend/app/models/chat.py` | TodoModel Pydantic schema | ✓ VERIFIED | `class TodoModel(BaseModel)` with `Literal` status |
| `backend/app/core/history.py` | todos 字段透出逻辑 | ✓ VERIFIED | 3 处 return 分支全含 `"todos"` 字段；`channel_values.get("todos", []) or []` + `isinstance(t, dict)` 兜底 |
| `backend/tests/test_history.py` | 2 个新测试 + 3 个既有测试的 todos 断言 | ✓ VERIFIED | `test_messages_endpoint_returns_empty_todos`、`test_messages_endpoint_returns_todos_from_checkpoint` 新增；3 处既有测试追加 `todos == []` 断言 |
| `frontend/src/lib/types.ts` | Todo + HistoryResponse 扩展 | ✓ VERIFIED | `export type Todo` + `HistoryResponse.todos: Todo[]` |
| `frontend/src/stores/ui-store.ts` | 新建 Zustand persist store | ✓ VERIFIED | persist + skipHydration + partialize 完整配置 |
| `frontend/src/stores/chat-store.ts` | todos state + setTodos action + loadHistory 签名变更 | ✓ VERIFIED | 初值 `todos: []`；`setTodos` 整体覆盖；对象签名 loadHistory |
| `frontend/src/hooks/use-sse.ts` | todo 事件 listener + autoOpenDrawer 触发 | ✓ VERIFIED | `addEventListener("todo", ...)` + `setTodos` + `autoOpenDrawer(sessionId)` |
| `frontend/src/app/page.tsx` | 4 处 loadHistoryAction 对象签名迁移 | ✓ VERIFIED | 4 处 `loadHistoryAction({` 确认；旧数组签名消除 |
| `frontend/src/stores/__tests__/ui-store.test.ts` | 基础 toggle / 初值测试 | ✓ VERIFIED | 文件存在，测试通过 |
| `frontend/src/stores/__tests__/ui-store.autoopen.test.ts` | auto-open 幂等 + SSE-only 语义测试 | ✓ VERIFIED | 5 条测试含 D-02 硬约束 |
| `frontend/src/stores/__tests__/chat-store.todos.test.ts` | setTodos 整体覆盖 / 初值 / 清空测试 | ✓ VERIFIED | 4 条测试通过 |
| `frontend/src/stores/__tests__/chat-store.session-switch.test.ts` | loadHistory / reset 联动 todos 测试 | ✓ VERIFIED | 5 条测试通过 |
| `frontend/src/app/globals.css` | @keyframes todoEnter | ✓ VERIFIED | `@keyframes todoEnter` line 95 |
| `frontend/src/components/todo/todo-item.tsx` | 三态图标 + todo 单条渲染 | ✓ VERIFIED | 3 态条件渲染；正确 DESIGN token |
| `frontend/src/components/todo/todo-list.tsx` | 列表 + 空态 | ✓ VERIFIED | `todos.map` + 空态文案 |
| `frontend/src/components/todo/todo-drawer.tsx` | 抽屉容器 + 标题 + 关闭按钮 | ✓ VERIFIED | `aside` 结构；`closeDrawer` 绑定 |
| `frontend/src/components/todo/todo-toggle-button.tsx` | chat 顶栏按钮 + aria-pressed | ✓ VERIFIED | `aria-pressed={drawerOpen}`；常显 |
| `frontend/src/components/chat/chat-area.tsx` | 加 header 挂 TodoToggleButton | ✓ VERIFIED | `<header>` + `<TodoToggleButton />` |
| `frontend/src/components/layout/app-layout.tsx` | 条件式 grid + rehydrate useEffect | ✓ VERIFIED | `"use client"`；条件 cols；`persist.rehydrate()` |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `use-sse.ts` | `chat-store.ts` | `setTodos(payload.todos)` 整体覆盖 | ✓ WIRED | `use-sse.ts:40,127` — selector + listener 调用；deps 数组含 `setTodos` |
| `use-sse.ts` | `ui-store.ts` | `autoOpenDrawer(sessionId)` | ✓ WIRED | `use-sse.ts:41,129` — selector + 条件调用；deps 数组含 `autoOpenDrawer` |
| `page.tsx` | `chat-store.ts` | `loadHistoryAction({ messages, todos })` 新签名 | ✓ WIRED | 4 处 `loadHistoryAction({` 全部迁移 |
| `app-layout.tsx` | `ui-store.ts` | `useUIStore((s) => s.todoDrawerOpen)` + `persist.rehydrate()` | ✓ WIRED | `app-layout.tsx:12,15` |
| `chat-area.tsx` | `todo-toggle-button.tsx` | `<header>` 右上角挂 toggle 按钮 | ✓ WIRED | `chat-area.tsx:13` — `<TodoToggleButton />` |
| `todo-drawer.tsx` | `todo-list.tsx` | `<TodoList />` 组件树 | ✓ WIRED | `todo-drawer.tsx:24` |
| `todo-list.tsx` | `chat-store.ts` | `useChatStore((s) => s.todos)` | ✓ WIRED | `todo-list.tsx:6` |
| `history.py` | LangGraph AsyncPostgresSaver | `channel_values.get("todos", []) or []` 同事务读 | ✓ WIRED | `history.py:148` |
| `history.py` | `TodoModel` | 契约声明（路径 A：不绑 response_model） | ✓ WIRED | `models/chat.py:50-57` |

---

## Data-Flow Trace（Level 4）

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `todo-list.tsx` | `todos` | `useChatStore((s) => s.todos)` | ✓ — SSE `todo` 事件 → `setTodos` 整体写入；history 端点 → `loadHistory({todos})` 写入 | ✓ FLOWING |
| `history.py` | `raw_todos` | `ckpt_tuple.checkpoint["channel_values"]["todos"]` — LangGraph checkpoint 真实 DB 读 | ✓ — `AsyncPostgresSaver.aget_tuple()` 读 PostgreSQL；10/10 集成测试覆盖 | ✓ FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command / Evidence | Result | Status |
|----------|--------------------|--------|--------|
| 后端测试 todos 返回 | `pytest tests/test_history.py -v` → 10 passed | 10/10 ✓ | ✓ PASS |
| 前端 store 单测 | `npm run test -- run` → 24/24 passed | 24/24 ✓ | ✓ PASS |
| TypeScript 类型检查 | `npx tsc --noEmit` → 无输出（0 error） | 通过 | ✓ PASS |
| 后端全量回归（排除 test_main.py） | `pytest --ignore=tests/test_main.py -q` → 36 passed | 36/36 ✓ | ✓ PASS |
| auto-open SSE-only 约束 | `grep -rn "autoOpenDrawer" frontend/src/` | 命中：ui-store.ts（定义 2 处）、use-sse.ts（selector+调用+deps）、ui-store.autoopen.test.ts；page.tsx/app-layout.tsx/chat-store.ts 无命中 | ✓ PASS |
| D-15：no color-border-default | `grep -rn "color-border-default" frontend/src/` | 0 命中 | ✓ PASS |
| XSS 防护 | `grep -rc "dangerouslySetInnerHTML" frontend/src/components/todo/` | 全部 0 | ✓ PASS |
| 端对端 UAT（人工） | 11-05-SUMMARY.md A~I 验证点 | 9/9 ✅ approved | ✓ PASS |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| TODO-01 | 11-01, 11-02, 11-03, 11-04 | 实时展示 agent 当前的 todo 列表（来自 SSE todo 事件） | ✓ SATISFIED | SSE `todo` listener → `setTodos` → `todo-list.tsx` 渲染；history 端点 `todos` 字段支持跨 session 还原；后端 10 测试 + 前端 24 测试 + UAT A/C/D/I ✅ |
| TODO-02 | 11-03, 11-04, 11-05 | todo 项状态变化时自动更新（pending → done） | ✓ SATISFIED | `setTodos` 整体覆盖语义（不 merge）；`todo-item.tsx` 三态条件渲染；150ms CSS transition；UAT F/G/H ✅ |

---

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `frontend/package.json` | `dev` 脚本去 `--turbopack`（commit `476867a`，out-of-scope infra fix） | ℹ️ Info | 非 Phase 11 scope；macOS 中文路径 + Turbopack 竞争条件 workaround；不影响 build/test |

无 blocker 或 warning 级别反模式。

---

## Human Verification Required

（已在 11-05 UAT 中全部完成，本节为空）

所有需要人工验证的行为（auto-open 体感、三态图标 DESIGN token 视觉走查、动效时长、删会话跟随下一条）均已在 11-05-SUMMARY.md 中由用户逐条确认（9/9 ✅ approved）。

---

## Notes

**分支数说明（11-02 PLAN 提及"四个 return 分支"）：** 代码实际为 3 处显式 `return {`，因为"session_svc.get_session 返回 None"场景不触发 early return，而是 fallthrough 到 checkpointer 检查路径。所有 4 种场景（checkpointer=None、ckpt_tuple=None、session=None、正常路径）均被集成测试覆盖，todos 字段正确返回。这是语义正确的，不是 gap。

**out-of-scope infra commit：** `476867a` `fix(infra): dev 脚本去 --turbopack` 已在 11-05-SUMMARY.md 中记录。该修改只改 `frontend/package.json` 的 `dev` 脚本，build 路径不受影响，UAT 和 CI 均使用 `npm run build`（未去 turbopack），不影响 Phase 11 目标。

---

_Verified: 2026-04-21T09:30:00Z_
_Verifier: Claude (gsd-verifier)_
