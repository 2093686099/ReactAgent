# Phase 11: Todo Panel - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

用户在右侧可折叠抽屉中实时看到 Agent 通过 `write_todos` 工具产出的 TodoList（pending / in_progress / completed 三态），并在同一 session 内跨轮保留清单，切回历史会话时能看到该会话最后一次的 todos 快照。

**Covers:** TODO-01（实时展示 agent 当前 todo 列表）、TODO-02（状态变化自动更新）

**Does NOT cover:**
- 可编辑的 todo（用户改内容 / 手动勾选）——不在需求内，Agent 自主规划是唯一来源
- SSE 断线重连导致的 todo 事件补齐 → Phase 12 RESIL-01
- 页面刷新后恢复抽屉 open/close 以外的状态 → 由 Phase 12 RESIL-02 覆盖 HITL 持久化时顺带考虑
- 移动端适配（抽屉在小屏的展示方式）→ Out of Scope per PROJECT.md

</domain>

<decisions>
## Implementation Decisions

### 面板位置与可见性
- **D-01:** 布局选型：**右侧可折叠抽屉**。`AppLayout` 当前 `grid-cols-[240px_1fr]` 扩展为**条件式**网格：抽屉关闭时保持 `[240px_1fr]`，打开时变 `[240px_1fr_320px]`。抽屉宽度固定 320px，使用 DESIGN.md 的 `--color-bg-panel` + `--color-border-subtle` 左边线分隔。
- **D-02:** 默认隐藏。首次收到某 session 内的 `todo` 事件（`todos.length > 0`）时，drawer 自动弹出一次；之后用户手动关闭后即使继续收到 todo 事件也不再自动弹（"手动关闭"视为用户偏好）。chat 区顶栏右上角放 toggle 按钮，无新增徽标/红点（极简）。
- **D-03:** 新建 `frontend/src/stores/ui-store.ts` （Zustand，与 chat-store / session-store 并列 domain slice）承载：`todoDrawerOpen: boolean`、`hasAutoOpenedFor: Set<sessionId>`。`todoDrawerOpen` 通过 Zustand persist middleware 写 localStorage（key 命名沿用 Phase 10 `session-store` 风格）。

### Todo 数据生命周期与 Store
- **D-04:** todos 绑定当前 session。新建 `frontend/src/stores/todo-store.ts` 或将 todos 挂到 **`chat-store`**（单一 slice 内）—— 推荐放进 `chat-store`，因为 todos 与 messages 都随 session 切换而 reset，复用现有 `chat-store.reset()` / `loadHistory()` 钩子最省心。最终选择由 Planner 权衡（Claude's Discretion）。
- **D-05:** 一整轮对话结束（SSE `done` 到达）后，todos **保留最终态**，不自动清空。下一轮 Agent 再次触发 `write_todos` 时由**整体覆盖**（SSE `todo` 事件的 payload 就是该时刻 state.todos 全量快照）。
- **D-06:** 切换 session 时沿用 Phase 10 `chat-store.reset()` 语义：messages / todos 一起清空，再通过 `loadHistory` 写回目标会话的历史 messages 与 todos（见 D-10 后端扩展）。
- **D-07:** 删除当前会话并落到下一条时（Phase 10 D-12），todo 面板跟随清空 + 加载下一会话的 todos 快照；空列表回到新建会话空态时，todos 清空，drawer 按 D-02 规则重置 `hasAutoOpenedFor`。

### 三态视觉与动效
- **D-08:** 三态图标（左侧 16px 圆形）：
  - `pending`：空心圆，`border: 1.5px solid var(--color-border-default)`
  - `in_progress`：半圈 SVG spinner（`stroke: var(--color-accent)` 即 `#5e6ad2` 品牌色），循环旋转 1s linear
  - `completed`：实心圆填充 `var(--color-accent)` + 白色 ✓（Lucide `Check` 12px）
  - 文案颜色**不随状态变**，始终 `text-secondary`（Linear 惯例，避免 completed 显灰导致扫读成本上升）。
- **D-09:** 动效最小集：
  - 新 todo item 进入列表：opacity 0→1 + translateY(4px→0)，200ms ease-out
  - 状态切换（pending → in_progress → completed）：图标 150ms ease color/fill 过渡；文案本身无动画
  - in_progress spinner 持续循环；只允许一条 item 同时 in_progress（deepagents 语义保证）
  - 不做勾选弹跳 / 列表重排 / completed 淡出

### 历史会话 todos 还原
- **D-10:** 扩展后端 `GET /api/sessions/{session_id}/messages` 响应体（Phase 10 落地的端点），新增 `todos: Todo[]` 字段：从 LangGraph `AsyncPostgresSaver` checkpoint 的 `state["todos"]` 直接读出，与 messages 同源、同事务读。Todo 形状沿用 `langchain/agents/middleware/todo.py::Todo` TypedDict：`{content: str, status: "pending" | "in_progress" | "completed"}`。
- **D-11:** 响应体变更需同步更新 Pydantic response model（`backend/app/models/chat.py` 或 `sessions.py`）+ `backend/app/api/sessions.py` 端点实现 + 对应 pytest 集成用例（`tests/test_history.py` 新增 `test_messages_endpoint_returns_todos`）。空 state.todos 时返回 `[]`，不返回 null。
- **D-12:** 前端 `frontend/src/lib/api.ts` 的 `loadHistory(sessionId)` 返回类型扩展，`chat-store.loadHistory(payload)` 同时写 messages 与 todos。

### SSE 前端订阅
- **D-13:** `frontend/src/hooks/use-sse.ts` 增加 `todo` 事件 listener：解析 `{todos: Todo[]}`，调 `chat-store.setTodos(todos)`（整体覆盖，无需 diff）。首次 `todos.length > 0` 时调 `ui-store.autoOpenDrawer(sessionId)` 实现 D-02。
- **D-14:** `todo` 事件在 `reattach`（Phase 10 D-03 `from_id=0` 重放）流中同样生效 —— 重放时会再次推送历史 todo 事件，`setTodos` 幂等覆盖，最终收敛到最新快照。

### 抽屉 UI 组件结构（参考，Planner 可调整）
- **D-15:** 新建 `frontend/src/components/todo/todo-drawer.tsx`（容器 + 动画）、`todo-list.tsx`（列表与空态）、`todo-item.tsx`（单条 item + 三态图标）。chat 顶栏加 `todo-toggle-button.tsx`。所有组件样式严格走 DESIGN.md 的 CSS 变量，不引入新 token。

### Claude's Discretion
- todos 最终放 `chat-store` 还是独立 `todo-store`（D-04 倾向合并，Planner 视 chat-store 膨胀度决定）
- 抽屉展开/收起动画细节（推荐 200ms ease，width / translateX 二选一，Planner 决定）
- toggle 按钮图标（Lucide `ListTodo` / `CheckSquare` / 自定义——非核心）
- 空态文案（e.g. "Agent 尚未制定任务计划"）
- `hasAutoOpenedFor` 是否也持久化到 localStorage（不持久化更符合"每次打开应用 agent 首次规划时给个提示"的语义，默认不持久化）
- spinner SVG 具体几何（半圈 vs 3/4 圈，Planner 决定）
- completed 项是否显示完成时间戳（**不显示**——极简原则；若未来需要回看再加）

### Folded Todos
（无——`gsd-sdk query todo.match-phase 11` 返回 count=0）

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 设计系统（最高优先级）
- `DESIGN.md` — Linear 风格设计 tokens：颜色变量、字重、间距、圆角、字体特性、动效时长。**所有前端 UI 必须严格遵守，不得自行发挥**。

### 项目级
- `CLAUDE.md` — 工作准则（外科手术式改动、简洁优先）与项目架构概览
- `.planning/PROJECT.md` — 产品愿景与约束（Out of Scope：移动端、PWA、文件上传）
- `.planning/REQUIREMENTS.md` — TODO-01 / TODO-02 验收点
- `ARCHITECTURE.md` — 后端分层、SSE 事件类型、数据流

### Phase 11 关联（前序阶段遗产）
- `.planning/phases/10-session-management/10-CONTEXT.md` — 历史加载与 reattach 设计（D-03 reattach、D-06 store 切换钩子的直接前置）
- `.planning/phases/10-session-management/10-04-SUMMARY.md` — Phase 10 页面装配实际落点（AppLayout / chat-store / use-sse 现状）
- `.planning/phases/09-tool-call-ux-hitl-approval/09-CONTEXT.md` — 工具指示器与 HITL segments 模型（与 todo 事件独立，但 SSE 订阅模式同构，参考实现风格）
- `.planning/phases/08-sse-chat-foundation/08-CONTEXT.md` — 前端脚手架、Zustand domain-sliced store 约定

### 后端落点（Phase 11 需改动）
- `backend/app/core/streaming.py:116-122` — `EVT_TODO` 事件产出点（已就绪，无需改）
- `backend/app/api/sessions.py` — `GET /sessions/{id}/messages` 端点，Phase 11 需扩展响应加 `todos`
- `backend/app/models/chat.py` 或 `backend/app/models/session.py` — Pydantic 响应模型，Phase 11 需扩展
- `backend/app/infra/database.py` — `AsyncPostgresSaver` checkpointer，读 `state["todos"]` 的入口
- `backend/tests/test_history.py` — Phase 10 建立的集成测试集，Phase 11 新增 `test_messages_endpoint_returns_todos`

### 前端落点（Phase 11 需新增/改动）
- `frontend/src/hooks/use-sse.ts` — 增加 `todo` 事件 listener
- `frontend/src/stores/chat-store.ts` — 增加 `todos` state 与 `setTodos` / `loadHistory` 扩展
- `frontend/src/stores/` — 新建 `ui-store.ts`（drawer 开关 + hasAutoOpenedFor）
- `frontend/src/components/layout/app-layout.tsx` — 条件式 grid 网格扩展
- `frontend/src/components/todo/` — 新建目录（drawer / list / item / toggle button）
- `frontend/src/lib/api.ts` — `loadHistory` 返回类型扩展
- `frontend/src/app/globals.css` — CSS 变量来源，不新增 token

### 上游框架契约
- `langchain/agents/middleware/todo.py` — `Todo` TypedDict 与 `TodoListMiddleware` 行为（`.venv/lib/python3.12/site-packages/langchain/agents/middleware/todo.py:25-32`）。确认 `{content, status}` 形状与 `status` 三值枚举。
- `deepagents/graph.py` — `write_todos` 工具是 `create_deep_agent` 默认挂载的安全工具（不触发 HITL，`backend/app/core/tools.py:257` 已配置 `"write_todos": False`）

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Zustand domain-sliced stores** — chat-store / session-store 已建立模式，新增 ui-store 直接复用
- **SSE listener 模式** — `use-sse.ts` 对 token/tool/hitl/done/error 的订阅写法，todo listener 直接同构
- **`chat-store.reset()` / `loadHistory()`** — Phase 10 已落地，todos 复用切换会话时的清空/还原钩子
- **Linear checkbox 风格** — DESIGN.md 已定义 `--color-accent` / `--color-border-*` / 圆角 tokens，三态图标不需新 token
- **AppLayout grid** — Phase 10 的 `grid-cols-[240px_1fr]` 扩展成条件式三列，改动局部

### Established Patterns
- **Segments 模型不适用**：todo 不进消息气泡（与 HITL / tool pill 不同），独立面板
- **SSE 事件整体覆盖**：todo 事件语义天然是"当前 state.todos 快照"，前端 setTodos 直接整体替换，无需增量 diff
- **Domain sliced stores**：UI 状态走新 ui-store，业务数据走 chat-store/session-store，与 Phase 10 D-14/D-15 一致

### Integration Points
- **后端 history 端点扩展**：沿 Phase 10 `GET /sessions/{id}/messages` 既有响应体加 `todos` 字段（非新端点）
- **前端 AppLayout 改动**：改 `app-layout.tsx` 一个文件 + chat header 加 toggle 按钮
- **reattach 机制复用**：Phase 10 `from_id=0` 重放会同时补齐 todo 事件，无需额外握手
- **checkpointer 读路径**：与 messages 同源读取 checkpoint state，同一事务内拿 todos，避免一致性窗口

</code_context>

<specifics>
## Specific Ideas

- 用户强调：**前端相关必须严格遵守 DESIGN.md**（2026-04-21 讨论明确）。这不是一般性提醒，是硬约束——Planner 与 Executor 在做三态图标、抽屉边框、过渡时长时都要回查 DESIGN.md token，不得凭直觉造 token。
- 抽屉"首次 auto-open"是 UX 取舍点：既要避免 SSE 一来就跳闸吓到用户（所以不做徽标红点），又要避免静默（所以第一次自动弹）。这个平衡点是关键，Planner 与 UI Checker 需要在验证时专门手验这一条。
- Linear 的 checkbox：`completed` 状态文案**不改色**（不用 `text-quaternary` 或 strikethrough），仅图标变——这是 Linear 与 "todo app 风格" 的核心区分。

</specifics>

<deferred>
## Deferred Ideas

- 手动编辑 / 勾选 todos —— 产品方向明确由 Agent 自主规划，不引入手动交互
- todo 项点击展开详情 / 进度百分比 / 子 todo —— 需求未要求，`langchain` Todo TypedDict 也无这些字段
- 跨 session 的"最近规划"全局视图 —— 与单 session 绑定原则冲突，超出 Phase 11 scope
- 抽屉宽度用户可拖拽调整 —— 非 MVP，默认 320px 足够
- 通知中心 / badge 未读计数 —— 极简原则下不引入
- RAG source panel 复用同一 drawer 框架 —— Phase 13 再评估（当时再决定是共用 drawer 壳还是两个独立抽屉）

### Reviewed Todos (not folded)
（无——当时 todo.match-phase 查询 count=0）

</deferred>

---

*Phase: 11-todo-panel*
*Context gathered: 2026-04-21*
