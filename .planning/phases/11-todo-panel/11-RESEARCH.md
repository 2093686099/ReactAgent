# Phase 11: Todo Panel - Research

**Researched:** 2026-04-21
**Domain:** 前端抽屉 UI + 后端 checkpoint state 读取 + SSE 事件补丁
**Confidence:** HIGH（上游契约、SSE 事件、checkpoint 路径均已在代码中定位并验证；两项 BLOCKER 属 DESIGN.md/Zustand 细节，已在下方列出待 planner/用户拍板）

## Summary

Phase 11 是一次**纯增量前端落地 + 一处后端响应体扩展**：

- **后端只需一改**：`GET /api/sessions/{id}/messages` 的 Pydantic response model 增加 `todos: list[Todo]` 字段，实现处复用 Phase 10 已有的 `db.checkpointer.aget_tuple(config)` 调用，从 `checkpoint["channel_values"]["todos"]` 读取（与 messages 同事务、同源，零一致性窗口）。测试扩展 `tests/test_history.py::test_messages_endpoint_returns_todos`，`make_checkpoint_tuple` fixture 需加 `todos=` 参数。
- **SSE 已就绪**：`backend/app/core/streaming.py:116-122` 的 `EVT_TODO` 发射路径已经存在（扫 updates mode `node_state["todos"]`），`write_todos` 工具在 `backend/app/core/tools.py:257` 已配置绕过 HITL。前端唯一要做的是 `use-sse.ts` 补一个 `todo` listener，调 `chat-store.setTodos(...)` 整体覆盖。
- **前端主要工作量在 UI 层**：新建 `ui-store.ts`（drawer 开关 + `hasAutoOpenedFor`）、`components/todo/` 四个组件、`AppLayout` 条件式 grid、`chat-store` 加 `todos` state 与 `setTodos`、`loadHistory` 接收 todos。整体改动面积与 Phase 10 持平、复杂度低于 Phase 09。
- **上游契约已锁定**：`Todo = {content: str, status: "pending"|"in_progress"|"completed"}`（`.venv/lib/python3.12/site-packages/langchain/agents/middleware/todo.py:25-42` 原文验证）；deepagents 语义上**同一时刻只允许一条 in_progress**；SSE todo 事件 payload 是全量快照，不需前端 diff。
- **reattach 时 todos 会自动补齐**：Phase 10 D-03 的 `?from_id=0` 会重放所有历史事件，包括 `todo`，因此"切回在途 task"无需额外握手；`setTodos` 幂等覆盖天然收敛到最新快照。

**⚠️ 两项 BLOCKER 需 planner/用户在动工前明确：**

1. **BLOCKER-1 `--color-border-default` 未定义**：CONTEXT.md D-08 要求 pending 空心圆使用 `var(--color-border-default)`，但 `frontend/src/app/globals.css:25-27` 仅定义了 `--color-border-subtle` (0.05)、`--color-border-standard` (0.08)、`--color-border-focus` (0.12)。D-15 禁止新增 token。建议选 `--color-border-standard`（1.5px 描边对比度适中），但需要用户签字确认 —— 这是一个 *选择题* 而非 *判断题*。
2. **BLOCKER-2 Zustand persist 无项目先例**：CONTEXT.md D-03 要求 `todoDrawerOpen` 走 Zustand persist 写 localStorage，并"沿用 Phase 10 session-store 风格"——但 `session-store.ts` **没有用 persist**（`chat-store` 同样没有）。项目中未找到任何 Zustand persist 先例。需要 planner 一次性定下：①storage key 命名（建议 `neuron-assistant:ui-store:v1`）；②Next.js App Router 下的 SSR hydration 处理（推荐 `skipHydration: true` + `useEffect(() => useUIStore.persist.rehydrate(), [])` 于 `app-layout.tsx` 顶层）；③`hasAutoOpenedFor` 是否也入 persist（D-03 Claude's Discretion 建议**不**持久化，避免"换天再打开仍不弹"的反直觉）。

**Primary recommendation:** Planner 先拿两 BLOCKER 问用户确认（或按本文推荐值开干），其余按 D-01~D-15 直译成任务；Wave 0 不需要（vitest + pytest 基础设施齐备）。

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**面板位置与可见性：**
- **D-01:** 布局选型：**右侧可折叠抽屉**。`AppLayout` 当前 `grid-cols-[240px_1fr]` 扩展为**条件式**网格：抽屉关闭时保持 `[240px_1fr]`，打开时变 `[240px_1fr_320px]`。抽屉宽度固定 320px，使用 DESIGN.md 的 `--color-bg-panel` + `--color-border-subtle` 左边线分隔。
- **D-02:** 默认隐藏。首次收到某 session 内的 `todo` 事件（`todos.length > 0`）时，drawer 自动弹出一次；之后用户手动关闭后即使继续收到 todo 事件也不再自动弹（"手动关闭"视为用户偏好）。chat 区顶栏右上角放 toggle 按钮，无新增徽标/红点（极简）。
- **D-03:** 新建 `frontend/src/stores/ui-store.ts` （Zustand，与 chat-store / session-store 并列 domain slice）承载：`todoDrawerOpen: boolean`、`hasAutoOpenedFor: Set<sessionId>`。`todoDrawerOpen` 通过 Zustand persist middleware 写 localStorage（key 命名沿用 Phase 10 `session-store` 风格）。

**Todo 数据生命周期与 Store：**
- **D-04:** todos 绑定当前 session。新建 `frontend/src/stores/todo-store.ts` 或将 todos 挂到 **`chat-store`**（单一 slice 内）—— 推荐放进 `chat-store`，因为 todos 与 messages 都随 session 切换而 reset，复用现有 `chat-store.reset()` / `loadHistory()` 钩子最省心。最终选择由 Planner 权衡（Claude's Discretion）。
- **D-05:** 一整轮对话结束（SSE `done` 到达）后，todos **保留最终态**，不自动清空。下一轮 Agent 再次触发 `write_todos` 时由**整体覆盖**（SSE `todo` 事件的 payload 就是该时刻 state.todos 全量快照）。
- **D-06:** 切换 session 时沿用 Phase 10 `chat-store.reset()` 语义：messages / todos 一起清空，再通过 `loadHistory` 写回目标会话的历史 messages 与 todos（见 D-10 后端扩展）。
- **D-07:** 删除当前会话并落到下一条时（Phase 10 D-12），todo 面板跟随清空 + 加载下一会话的 todos 快照；空列表回到新建会话空态时，todos 清空，drawer 按 D-02 规则重置 `hasAutoOpenedFor`。

**三态视觉与动效：**
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

**历史会话 todos 还原：**
- **D-10:** 扩展后端 `GET /api/sessions/{session_id}/messages` 响应体（Phase 10 落地的端点），新增 `todos: Todo[]` 字段：从 LangGraph `AsyncPostgresSaver` checkpoint 的 `state["todos"]` 直接读出，与 messages 同源、同事务读。Todo 形状沿用 `langchain/agents/middleware/todo.py::Todo` TypedDict：`{content: str, status: "pending" | "in_progress" | "completed"}`。
- **D-11:** 响应体变更需同步更新 Pydantic response model（`backend/app/models/chat.py` 或 `sessions.py`）+ `backend/app/api/sessions.py` 端点实现 + 对应 pytest 集成用例（`tests/test_history.py` 新增 `test_messages_endpoint_returns_todos`）。空 state.todos 时返回 `[]`，不返回 null。
- **D-12:** 前端 `frontend/src/lib/api.ts` 的 `loadHistory(sessionId)` 返回类型扩展，`chat-store.loadHistory(payload)` 同时写 messages 与 todos。

**SSE 前端订阅：**
- **D-13:** `frontend/src/hooks/use-sse.ts` 增加 `todo` 事件 listener：解析 `{todos: Todo[]}`，调 `chat-store.setTodos(todos)`（整体覆盖，无需 diff）。首次 `todos.length > 0` 时调 `ui-store.autoOpenDrawer(sessionId)` 实现 D-02。
- **D-14:** `todo` 事件在 `reattach`（Phase 10 D-03 `from_id=0` 重放）流中同样生效 —— 重放时会再次推送历史 todo 事件，`setTodos` 幂等覆盖，最终收敛到最新快照。

**抽屉 UI 组件结构（参考，Planner 可调整）：**
- **D-15:** 新建 `frontend/src/components/todo/todo-drawer.tsx`（容器 + 动画）、`todo-list.tsx`（列表与空态）、`todo-item.tsx`（单条 item + 三态图标）。chat 顶栏加 `todo-toggle-button.tsx`。所有组件样式严格走 DESIGN.md 的 CSS 变量，不引入新 token。

### Claude's Discretion
- todos 最终放 `chat-store` 还是独立 `todo-store`（D-04 倾向合并，Planner 视 chat-store 膨胀度决定）
- 抽屉展开/收起动画细节（推荐 200ms ease，width / translateX 二选一，Planner 决定）
- toggle 按钮图标（Lucide `ListTodo` / `CheckSquare` / 自定义——非核心）
- 空态文案（e.g. "Agent 尚未制定任务计划"）
- `hasAutoOpenedFor` 是否也持久化到 localStorage（不持久化更符合"每次打开应用 agent 首次规划时给个提示"的语义，默认不持久化）
- spinner SVG 具体几何（半圈 vs 3/4 圈，Planner 决定）
- completed 项是否显示完成时间戳（**不显示**——极简原则；若未来需要回看再加）

### Deferred Ideas (OUT OF SCOPE)
- 手动编辑 / 勾选 todos —— 产品方向明确由 Agent 自主规划，不引入手动交互
- todo 项点击展开详情 / 进度百分比 / 子 todo —— 需求未要求，`langchain` Todo TypedDict 也无这些字段
- 跨 session 的"最近规划"全局视图 —— 与单 session 绑定原则冲突，超出 Phase 11 scope
- 抽屉宽度用户可拖拽调整 —— 非 MVP，默认 320px 足够
- 通知中心 / badge 未读计数 —— 极简原则下不引入
- RAG source panel 复用同一 drawer 框架 —— Phase 13 再评估（当时再决定是共用 drawer 壳还是两个独立抽屉）
- SSE 断线重连导致的 todo 事件补齐 → Phase 12 RESIL-01
- 移动端适配（抽屉在小屏的展示方式）→ Out of Scope per PROJECT.md
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TODO-01 | 实时展示 agent 当前 todo 列表 | `streaming.py:116-122` `EVT_TODO` 发射点已存在（updates mode 扫 `node_state["todos"]`）；前端新增 `use-sse.ts::todo` listener + `chat-store.todos` state + `TodoDrawer` 组件三件套即可串起 SSE→store→UI。详见"Architecture Patterns > Pattern 2"。 |
| TODO-02 | 状态变化自动更新 | `write_todos` 工具每次调用都 Command-update 整个 `state.todos` list（见 `langchain/agents/middleware/todo.py`），SSE 事件 payload 是**全量快照**而非增量 patch。前端 `setTodos(todos)` 整体覆盖；`TodoItem` 依据 `status` 渲染三态图标；D-09 规定 150ms CSS transition 做状态切换动画。详见"Code Examples > TodoItem 三态渲染"。 |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Todo 源头生成（Agent write_todos） | Backend / LangGraph middleware | — | Todo 是 Agent state 的一部分，由 `TodoListMiddleware` 托管，不是前端决策。前端永不写 Todo。 |
| Todo 实时推送 | API / SSE | — | 走 `parse_agent_events` 的 `EVT_TODO`，通过 `/api/chat/stream/{task_id}` 的 Redis Streams → SSE。 |
| Todo 历史快照持久 | Database (PostgreSQL checkpointer) | — | `AsyncPostgresSaver` 在 `channel_values["todos"]` 保存整个 state，与 messages 同一 checkpoint 行。 |
| Todo 历史快照读取 | API / `GET /sessions/{id}/messages` | — | 与 Phase 10 同端点同事务读取，避免独立查询带来的一致性窗口（D-10 硬约束）。 |
| Todo 渲染与状态机 UI | Browser / Client (React + Zustand) | — | 完全在 `chat-store.todos` 与 `TodoDrawer` 里，状态切换走 CSS transition；浏览器 localStorage 负责 drawer 开关记忆。 |
| Drawer 开关状态持久 | Browser / localStorage | — | 纯 UI 偏好，不走后端；Zustand persist middleware 序列化 `todoDrawerOpen`。 |
| Auto-open 触发（D-02） | Browser | — | `use-sse.ts::todo` listener 检查 `hasAutoOpenedFor` Set，首次为该 sessionId 且 `todos.length > 0` 时调 `autoOpenDrawer`。纯前端状态机。 |

**Sanity check:** Todo 的三大关键职责（写入、实时推送、历史读取）都在后端 / API 层；前端职责边界清晰——只消费 SSE 事件 + checkpoint 返回，不做任何 Todo 语义判断。

## Standard Stack

### Core（**全部已存在，Phase 11 零新增依赖**）
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zustand | 现有 | UI/domain state | 项目 domain-sliced store 约定（chat/session/新增 ui-store） |
| lucide-react | 现有 | 图标（`Check` `ListTodo`） | 项目全站统一图标库 |
| tailwindcss v4 | 现有 | 样式 | DESIGN.md token 全部走 CSS custom properties + `@theme inline` |
| langchain | 现有 | `Todo` TypedDict 源 | 上游契约来源，不需新装 |
| fastapi + pydantic | 现有 | 后端响应 model | Phase 10 已落地 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ^2.1.9（已装） | 前端单测 | `ui-store` auto-open 幂等 / `TodoItem` 三态渲染 snapshot |
| pytest | 现有 | 后端集成 | `test_messages_endpoint_returns_todos` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Zustand persist | localStorage setItem + useEffect 手动同步 | 手动方案避免 SSR hydration 坑，但失去 persist 提供的 `onFinishHydration` 回调；由于 D-03 明确指定 persist，采用 persist。 |
| 合并 todos 到 chat-store | 独立 todo-store | D-04 倾向合并；chat-store 已有 `reset()` / `loadHistory` 钩子直接复用，拆分反而多维护一份订阅。**推荐合并**。 |
| 新 grid 模板写进 tailwind config | inline `grid-cols-[...]` | 项目已用 inline 写法（Phase 10 `grid-cols-[240px_1fr]`），保持一致风格，不需改 config。 |

**Installation:**
```bash
# 无新包需装
```

**Version verification:**
- `vitest` ^2.1.9 — `frontend/package.json` devDependencies 已确认 [VERIFIED: package.json]
- `langchain` — `.venv/lib/python3.12/site-packages/langchain/agents/middleware/todo.py` 存在 `Todo` TypedDict [VERIFIED: local .venv read]
- Zustand persist — `zustand/middleware` 原生提供，不需额外包 [CITED: zustand docs]

## Architecture Patterns

### System Architecture Diagram

```
         ┌─────────────────────────────────────────────────────────────┐
         │ Agent Loop (LangGraph)                                      │
         │                                                             │
         │  TodoListMiddleware ──► write_todos(tool) ──► Command{      │
         │                                                  update: {  │
         │                                                    todos:[...│
         │                                                  }}         │
         │                                   │                         │
         │                                   ▼                         │
         │          state["todos"] = [{content, status}, ...]          │
         └──────────────┬──────────────────────────────┬───────────────┘
                        │ (1) checkpoint 持久化         │ (2) stream_mode=updates
                        ▼                              ▼
          ┌──────────────────────────┐     ┌──────────────────────────┐
          │ PostgreSQL checkpoint    │     │ parse_agent_events       │
          │  channel_values.todos    │     │  yields ("todo", {todos})│
          └──────────────────────────┘     └─────────────┬────────────┘
                        │                                │
                        │ (4) GET /sessions/{id}/msgs    │ (3) Redis Stream XADD
                        │     aget_tuple() 同事务读      │     event:{type:"todo"}
                        ▼                                ▼
          ┌──────────────────────────┐     ┌──────────────────────────┐
          │ loadHistory (switch)     │     │ SSE /stream/{task_id}    │
          │   messages + todos       │     │   event: token|tool|todo │
          └─────────────┬────────────┘     │         |hitl|done|error │
                        │                  └─────────────┬────────────┘
                        │                                │
                        └──────────────┬─────────────────┘
                                       ▼
              ┌──────────────────────────────────────────┐
              │ Frontend                                 │
              │                                          │
              │  use-sse.ts::todo listener ──┐           │
              │  api.ts::loadHistory ────────┤           │
              │                              ▼           │
              │  chat-store.setTodos(todos)              │
              │         │                                │
              │         │  (首次 & todos.length>0)       │
              │         ▼                                │
              │  ui-store.autoOpenDrawer(sessionId)      │
              │         │                                │
              │         ▼                                │
              │  AppLayout grid-cols-[240px_1fr_320px]   │
              │         │                                │
              │         ▼                                │
              │  TodoDrawer → TodoList → TodoItem        │
              │                           （三态图标）   │
              └──────────────────────────────────────────┘
```

**数据流关键点：**
- 路径 (2)(3) 是 **live stream**（TODO-01）
- 路径 (1)(4) 是 **history restore**（D-10 / D-12）
- 路径 (2)(3) 的 SSE `todo` 事件在 reattach 时会被 `?from_id=0` 重放（D-14），所以切回在途 task 自动补齐，不需额外请求

### Recommended Project Structure
```
backend/
├── app/
│   ├── api/sessions.py          # 扩展响应 model（加 todos 字段）
│   ├── core/history.py          # 新增 read_todos(ckpt) 辅助或直接内联
│   ├── core/streaming.py        # (无需改动，EVT_TODO 已就绪)
│   ├── core/tools.py            # (无需改动，write_todos 已绕过 HITL)
│   └── models/chat.py           # 加 Todo Pydantic model + 扩展 HistoryResponse
└── tests/
    ├── fixtures/checkpoint_factory.py  # make_checkpoint_tuple 加 todos= 参数
    └── test_history.py                 # 新增 test_messages_endpoint_returns_todos

frontend/
├── src/
│   ├── app/page.tsx                    # handleSwitch/handleNew/handleDelete 里 setTodos([])
│   ├── components/
│   │   ├── layout/app-layout.tsx       # grid-cols 条件式
│   │   ├── chat/chat-area.tsx          # 顶栏加 TodoToggleButton
│   │   └── todo/
│   │       ├── todo-drawer.tsx         # 容器 + 动画
│   │       ├── todo-list.tsx           # 列表渲染 + 空态
│   │       ├── todo-item.tsx           # 单条 + 三态图标
│   │       └── todo-toggle-button.tsx  # 顶栏按钮
│   ├── hooks/use-sse.ts                # 加 todo listener + autoOpenDrawer 调用
│   ├── lib/api.ts                      # loadHistory 返回类型扩展
│   ├── lib/types.ts                    # 加 Todo 类型
│   └── stores/
│       ├── chat-store.ts               # 加 todos + setTodos + loadHistory 扩展
│       └── ui-store.ts                 # 新建（persist）
```

### Pattern 1: `channel_values["todos"]` checkpoint 读取（D-10/D-11）

**What:** 与现有 messages 读取同源同事务，避免一致性窗口。

**When to use:** `GET /api/sessions/{id}/messages` 处理函数内，拿到 `ckpt_tuple` 后。

**Example:**
```python
# Source: backend/app/core/history.py:145（messages 读取既有模式）
# Phase 11 新增 Pattern：
raw_messages = (ckpt_tuple.checkpoint or {}).get("channel_values", {}).get("messages", []) or []
raw_todos    = (ckpt_tuple.checkpoint or {}).get("channel_values", {}).get("todos", []) or []

# 转 Pydantic：
todos = [Todo(content=t["content"], status=t["status"]) for t in raw_todos]
# 空 state.todos 时 raw_todos == [] → todos == []，符合 D-11 "不返回 null"
```

### Pattern 2: SSE `todo` listener + auto-open（D-02/D-13）

**What:** 消费 SSE `todo` 事件，整体覆盖 `chat-store.todos`，首次触发 drawer 自动弹出。

**When to use:** `frontend/src/hooks/use-sse.ts` 内，紧挨现有 `token`/`tool`/`hitl`/`done`/`error` listener。

**Example:**
```typescript
// Source: 同构于 frontend/src/hooks/use-sse.ts:30-136 的既有 listener 模式
es.addEventListener("todo", (e) => {
  const { todos } = JSON.parse((e as MessageEvent).data) as { todos: Todo[] };
  useChatStore.getState().setTodos(todos);
  if (todos.length > 0) {
    useUIStore.getState().autoOpenDrawer(sessionId);
  }
});
```

`autoOpenDrawer(sessionId)` 在 ui-store 内部是幂等的：
```typescript
autoOpenDrawer: (sessionId) => set((s) => {
  if (s.hasAutoOpenedFor.has(sessionId)) return s;
  const next = new Set(s.hasAutoOpenedFor);
  next.add(sessionId);
  return { hasAutoOpenedFor: next, todoDrawerOpen: true };
}),
```

### Pattern 3: Zustand persist + Next.js SSR（应对 BLOCKER-2）

**What:** `ui-store.todoDrawerOpen` 写 localStorage，但必须避开 SSR 首渲染的 hydration mismatch。

**When to use:** 新建 `frontend/src/stores/ui-store.ts`。

**Example:**
```typescript
// Source: zustand persist 官方文档推荐的 Next.js 模式
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type UIState = {
  todoDrawerOpen: boolean;
  hasAutoOpenedFor: Set<string>;  // 不持久化 —— 由 partialize 过滤
  toggleDrawer: () => void;
  autoOpenDrawer: (sessionId: string) => void;
  closeDrawer: () => void;
};

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      todoDrawerOpen: false,
      hasAutoOpenedFor: new Set<string>(),
      toggleDrawer: () => set((s) => ({ todoDrawerOpen: !s.todoDrawerOpen })),
      autoOpenDrawer: (sessionId) => set((s) => {
        if (s.hasAutoOpenedFor.has(sessionId)) return s;
        const next = new Set(s.hasAutoOpenedFor);
        next.add(sessionId);
        return { hasAutoOpenedFor: next, todoDrawerOpen: true };
      }),
      closeDrawer: () => set({ todoDrawerOpen: false }),
    }),
    {
      name: "neuron-assistant:ui-store:v1",   // BLOCKER-2 待用户确认 key
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,                    // SSR 首渲染用初始值，避免 mismatch
      partialize: (s) => ({ todoDrawerOpen: s.todoDrawerOpen }),  // hasAutoOpenedFor 不持久
    }
  )
);
```

然后在 `app-layout.tsx`（或 `providers.tsx`）顶层：
```typescript
useEffect(() => {
  void useUIStore.persist.rehydrate();
}, []);
```

### Pattern 4: AppLayout 条件式 grid（D-01）

**What:** 保持 `grid-cols-[240px_1fr]` 为默认值，drawer 打开时切到 `grid-cols-[240px_1fr_320px]`。

**When to use:** `frontend/src/components/layout/app-layout.tsx`。

**Example:**
```typescript
"use client";
import { useUIStore } from "@/stores/ui-store";
import { TodoDrawer } from "@/components/todo/todo-drawer";

export function AppLayout({ children, sidebar }: Props) {
  const drawerOpen = useUIStore((s) => s.todoDrawerOpen);
  const cols = drawerOpen
    ? "grid-cols-[240px_1fr_320px]"
    : "grid-cols-[240px_1fr]";
  return (
    <div className={`grid min-h-screen ${cols} bg-[var(--color-bg-panel)] text-[var(--color-text-primary)] transition-[grid-template-columns] duration-200 ease-out`}>
      {sidebar}
      {children}
      {drawerOpen && <TodoDrawer />}
    </div>
  );
}
```

### Anti-Patterns to Avoid
- **不要用单独 API 拉 todos**：D-10 硬约束走同端点同事务；另起 endpoint 会引入 messages 与 todos 的一致性窗口（messages 已加载但 todos 还在读）
- **不要在前端 diff todo 列表**：SSE payload 是全量快照，`setTodos(full)` 最简单最健壮；按 `content` 或 index 做 diff 在 write_todos 改名场景会炸
- **不要让 TodoItem 文案随状态变色**：D-08 硬约束 `text-secondary` 固定，违背会被 UI checker 打回
- **不要在 SSR render 时读 `todoDrawerOpen`**：hydration mismatch，用 `skipHydration: true` + `rehydrate()` 处理
- **不要给 Set 直接走默认 JSON storage**：`new Set()` 序列化为 `{}`，需要自定义 replacer/reviver。推荐 `partialize` 只持久化 primitive 字段，`hasAutoOpenedFor` 留在内存。

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Todo 状态机（pending→in_progress→completed） | 前端本地状态机 | 消费 SSE 快照，store 整体覆盖 | 状态推进由 Agent / middleware 拥有，前端建模会与后端权威分歧 |
| Todo 持久化 | 前端 localStorage 缓存 todos | LangGraph checkpointer 已持久 + Phase 10 history 端点 | 双源持久必然漂移；checkpointer 是唯一权威 |
| localStorage 读写封装 | 自研 hook | Zustand `persist` middleware | 官方方案，已处理 hydration / storage 事件 / SSR |
| "只允许一条 in_progress" 校验 | 前端检查 | 信任 deepagents / TodoListMiddleware 语义 | 上游契约保证，前端重复校验属防御性冗余 |
| SSE 事件去重 | 客户端 event_id 记录 | Phase 10 `?from_id=0` 机制 + 幂等 `setTodos` | 幂等覆盖 > 去重；代码少一半 |
| Todo 渲染动画 | Framer Motion / 自定义 orchestration | Tailwind `transition-* duration-*` + CSS keyframes | D-09 规定最小集（fade + 150/200ms），不值得引入动画库 |

**Key insight:** Phase 11 的核心是"薄薄的前端贴皮 + 一处后端字段透出"，任何增加抽象层的提议（todo schema 前端校验、状态机、事件总线）都是过度设计，违反 CLAUDE.md §2 简洁优先。

## Common Pitfalls

### Pitfall 1: Zustand persist 在 Next.js App Router 下的 hydration mismatch
**What goes wrong:** 服务器端 render 用 `todoDrawerOpen: false`（store 初始值），客户端 hydrate 后 persist 从 localStorage 读回 `true` → React 报 hydration mismatch，控制台红字。
**Why it happens:** Next.js RSC → SSR → hydrate 三阶段，persist 默认 `onMount` 同步读 localStorage。
**How to avoid:**
- `persist({ skipHydration: true, ... })`
- 在顶层 client component `useEffect(() => void useUIStore.persist.rehydrate(), [])`
- 或者把"读 store"包在 `useEffect` 里延后一帧渲染
**Warning signs:** 浏览器 console "Hydration failed because the initial UI does not match"；drawer 首帧闪烁。

### Pitfall 2: Auto-open 在历史会话加载时也触发，导致切回旧会话就弹
**What goes wrong:** 用户期望"Agent 当场规划时自动弹一次"，但如果 `autoOpenDrawer` 也被 `loadHistory`（读到历史 todos）调用，切回任何有 todos 的旧会话都会弹，反客为主。
**Why it happens:** D-02 只说"首次收到某 session 内的 `todo` 事件"，没有严格区分"live SSE 事件"vs"历史快照"。
**How to avoid:** `autoOpenDrawer(sessionId)` **只**在 `use-sse.ts::todo` listener 里调；`loadHistory` 只调 `setTodos`，不触发 auto-open。在 RESEARCH.md 本条明确语义，由 planner 写进任务注释。
**Warning signs:** 切历史会话时 drawer 自动弹出；用户反馈"我不想每次打开旧会话都看到 todo 面板"。

### Pitfall 3: `channel_values["todos"]` 为 None 或缺失时的空值处理
**What goes wrong:** 新会话 / 用户从未触发 write_todos 的会话，checkpoint 里 `todos` 可能不存在或为 None；直接 `list(obj["todos"])` 抛 KeyError 或 TypeError。
**Why it happens:** LangGraph state 是 append-only，未写入的 channel 不出现在 `channel_values` 里。
**How to avoid:** `.get("todos", []) or []`（同 Phase 10 messages 的写法，兜底双层：key 不存在 → []；值为 None → []）。
**Warning signs:** 500 错误 on 新会话 history 请求；pytest 的 happy path 过了但 `test_messages_endpoint_returns_todos_empty` 没写或没跑。

### Pitfall 4: `make_checkpoint_tuple` fixture 未同步扩展
**What goes wrong:** 新测试调用 `make_checkpoint_tuple(messages=..., todos=...)` 但 fixture 只接收 `messages` 参数 → TypeError。
**Why it happens:** Phase 10 fixture 只为 messages 设计，duck-typing 后未预留 todos。
**How to avoid:** Phase 11 计划里必须包含一条任务：**扩展 `backend/tests/fixtures/checkpoint_factory.py::make_checkpoint_tuple`**，加 `todos: list | None = None`，在 `channel_values` 里条件式放入。
**Warning signs:** `test_messages_endpoint_returns_todos` 报 "unexpected keyword argument 'todos'"。

### Pitfall 5: SSE todo payload 结构误判
**What goes wrong:** 前端 listener 解析 `JSON.parse(e.data)` 后直接 `setTodos(data)`，但 streaming.py 实际 yield 的是 `{"todos": [...]}`（外层裹了一层），前端得到的是 `{todos: [...]}` 而非 `Todo[]`。
**Why it happens:** Phase 09 的 tool 事件 payload 是 `{...tool fields}`（平坦），todo 事件是 `{todos: [...]}`（包一层）—— 两者不同。
**How to avoid:** listener 内 `const { todos } = JSON.parse(e.data)` 解构，不要直接 `setTodos(JSON.parse(e.data))`。在 `lib/types.ts` 定义 `type TodoEventPayload = { todos: Todo[] }` 作文档。
**Warning signs:** TodoList 渲染空白或 map 报错 "todos.map is not a function"。

### Pitfall 6: `--color-border-default` 直接写进 CSS 导致样式回退为 `initial`
**What goes wrong:** 代码字面写 `border: 1.5px solid var(--color-border-default)`，浏览器找不到变量 → fallback 为 `initial` → 边框消失，pending 圆圈肉眼几乎看不见。
**Why it happens:** BLOCKER-1。
**How to avoid:** 动工前把 BLOCKER-1 解决；或写 `var(--color-border-default, var(--color-border-standard))` 用 fallback（不推荐，掩盖问题）。
**Warning signs:** 视觉走查 pending 圆圈缺失；Chrome DevTools Computed 样式显示 `border-color: initial`。

### Pitfall 7: drawer 动画跟 grid 切换打架
**What goes wrong:** 给 drawer 本体加 `transform: translateX(100%→0)` 动画 + 给 grid `transition-[grid-template-columns]`，两者同时跑导致 320px 区域"裂开"。
**Why it happens:** grid 在折叠→展开瞬间把 drawer 占位区立即扩到 320px，但 drawer 还在 `translateX(100%)` 处；中间透出空白。
**How to avoid:** **只选一种动画机制**：要么 grid 过渡（本研究推荐，因为 grid 本身平滑），要么固定占位不 transition + drawer translateX。D-09 对此无硬约束，Claude's Discretion。推荐 grid-only：实现简单、无闪烁。
**Warning signs:** 动画过程中 chat 区右侧短暂出现 320px 背景色但 drawer 内容未跟上。

## Code Examples

### Todo TypedDict（上游契约，不改）
```python
# Source: .venv/lib/python3.12/site-packages/langchain/agents/middleware/todo.py:25-42
class Todo(TypedDict):
    content: str
    status: Literal["pending", "in_progress", "completed"]

class PlanningState(AgentState):
    todos: Annotated[NotRequired[list[Todo]], OmitFromInput]
```

### EVT_TODO 发射（已存在，无需改）
```python
# Source: backend/app/core/streaming.py:116-122
for node_name, node_state in data.items():
    if isinstance(node_state, dict) and "todos" in node_state:
        yield EVT_TODO, {"todos": node_state["todos"]}
        break
```

### channel_values 读取扩展（Phase 11 新增）
```python
# Source: 同构于 backend/app/core/history.py:145 既有 messages 读取
raw_todos = (ckpt_tuple.checkpoint or {}).get("channel_values", {}).get("todos", []) or []
```

### Pydantic Todo model（新增）
```python
# backend/app/models/chat.py 或 sessions.py
from typing import Literal
from pydantic import BaseModel

class TodoModel(BaseModel):
    content: str
    status: Literal["pending", "in_progress", "completed"]

class HistoryResponse(BaseModel):
    messages: list[MessageModel]
    todos: list[TodoModel]                    # 新增字段
    active_task: ActiveTaskModel | None
    truncate_after_active_task: bool
```

### TypeScript Todo 类型（新增）
```typescript
// frontend/src/lib/types.ts 新增
export type Todo = {
  content: string;
  status: "pending" | "in_progress" | "completed";
};

export type TodoEventPayload = { todos: Todo[] };
```

### chat-store 扩展
```typescript
// frontend/src/stores/chat-store.ts
// 新增 slice：
todos: Todo[];
setTodos: (todos: Todo[]) => void;
// 修改 reset：messages = []; todos = [];
// 修改 loadHistory：接受 { messages, todos }，两个一起 set
```

### TodoItem 三态渲染（D-08）
```tsx
// frontend/src/components/todo/todo-item.tsx
import { Check } from "lucide-react";

export function TodoItem({ todo }: { todo: Todo }) {
  return (
    <div className="flex items-start gap-3 py-2 px-4 animate-[todoEnter_200ms_ease-out]">
      <span className="shrink-0 mt-0.5">
        {todo.status === "pending" && <PendingCircle />}
        {todo.status === "in_progress" && <InProgressSpinner />}
        {todo.status === "completed" && <CompletedCircle />}
      </span>
      <span className="text-[var(--color-text-secondary)] text-sm leading-5 transition-colors duration-150">
        {todo.content}
      </span>
    </div>
  );
}

function PendingCircle() {
  // BLOCKER-1: 确认用 --color-border-standard 或 --color-border-focus 或等用户补 --color-border-default
  return (
    <span
      className="inline-block w-4 h-4 rounded-full transition-all duration-150"
      style={{ border: "1.5px solid var(--color-border-standard)" }}  // ← 本研究推荐值，pending user sign-off
    />
  );
}

function InProgressSpinner() {
  return (
    <svg className="w-4 h-4 animate-spin" style={{ animationDuration: "1s" }} viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--color-border-standard)" strokeWidth="1.5" />
      <path d="M 8 1.5 A 6.5 6.5 0 0 1 14.5 8" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CompletedCircle() {
  return (
    <span
      className="inline-flex w-4 h-4 rounded-full items-center justify-center transition-all duration-150"
      style={{ backgroundColor: "var(--color-accent)" }}
    >
      <Check className="w-3 h-3 text-white" strokeWidth={3} />
    </span>
  );
}
```

### keyframe（D-09 新 todo item 进入动画）
```css
/* frontend/src/app/globals.css 新增 */
@keyframes todoEnter {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| EventSource + 单事件监听 | 已在用（Phase 08），本 Phase 仅扩展 | Phase 08 落地 | 本 Phase 无变化 |
| Zustand without middleware | Zustand persist middleware | Phase 11 引入 | 项目首次使用 persist，模式须固化下来（见 BLOCKER-2） |
| checkpoint 读取仅 messages | 同事务 messages + todos | Phase 11 本次 | 新 API 契约，前端 types 跟随 |

**Deprecated/outdated:**
- 无

## Validation Architecture

### Test Framework

**Backend:**
| Property | Value |
|----------|-------|
| Framework | pytest + pytest-asyncio（现有） |
| Config file | `backend/pytest.ini` / `pyproject.toml` |
| Quick run command | `cd backend && pytest tests/test_history.py -x` |
| Full suite command | `cd backend && pytest` |

**Frontend:**
| Property | Value |
|----------|-------|
| Framework | vitest ^2.1.9（现有） |
| Config file | `frontend/vitest.config.ts`（若不存在需 Wave 0 加） |
| Quick run command | `cd frontend && npm run test -- src/stores/ui-store.test.ts` |
| Full suite command | `cd frontend && npm run test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TODO-01 | SSE `todo` 事件触发 setTodos | 前端单元 | `npm run test -- src/hooks/use-sse.test.ts` | ❌ Wave 0（use-sse 现无测试文件；可选，非强制） |
| TODO-01 | 历史端点返回 todos 字段 | 后端集成 | `pytest tests/test_history.py::test_messages_endpoint_returns_todos -x` | ❌ Wave 0 新增 |
| TODO-01 | `ui-store.autoOpenDrawer` 幂等 | 前端单元 | `npm run test -- src/stores/ui-store.test.ts` | ❌ Wave 0 新增 |
| TODO-02 | TodoItem 三态渲染正确 | 前端单元 | `npm run test -- src/components/todo/todo-item.test.tsx` | ❌ Wave 0 新增（建议，snapshot） |
| TODO-02 | write_todos 二次调用整体覆盖 todos | 手工 UAT | — | 手工验（两轮对话，看面板 diff） |
| TODO-02 | 150ms 图标切换过渡 | 手工 UAT | — | 视觉走查 |

### Sampling Rate
- **Per task commit:** `cd backend && pytest tests/test_history.py -x`（后端变更）或 `cd frontend && npm run test -- <target>`（前端）
- **Per wave merge:** `cd backend && pytest` + `cd frontend && npm run test`
- **Phase gate:** 两端全绿 + 手工 UAT（auto-open 首次弹 / 手动关闭后不再弹 / 切会话 todos 跟随 / 删会话跟随下一条）过关，再 `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `backend/tests/fixtures/checkpoint_factory.py::make_checkpoint_tuple` 扩展 `todos=` 参数
- [ ] `backend/tests/test_history.py::test_messages_endpoint_returns_todos` 新增（空 todos 返回 `[]` + 有 todos 正确序列化）
- [ ] `frontend/src/stores/ui-store.test.ts` 新增（`autoOpenDrawer` 幂等 / `toggleDrawer` / persist 行为）
- [ ] `frontend/src/components/todo/todo-item.test.tsx` 新增（三态 snapshot，可选但建议）
- [ ] `frontend/vitest.config.ts` 若不存在需补齐（用 `package.json` `test: vitest` 推断已可直接运行，Planner 确认）

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `auto-open` **仅由 live SSE todo 事件触发**，历史会话 `loadHistory` 带出的 todos 不触发弹出 | Pitfall 2 | 若实际语义为"任何 todos 出现都弹"，切换历史会话会反复自动弹；用户已在 D-02 原文暗示"首次收到某 session 内的 `todo` 事件"，倾向支持此假设，但仍请 planner/用户最终确认。[ASSUMED] |
| A2 | `hasAutoOpenedFor` **不**持久化到 localStorage，仅 in-memory | Pattern 3 `partialize` | 若持久化：换天打开应用、首次出现 todos 不弹（因为跨会话记录了"已弹过"），违反用户"每次重新打开应用首轮规划提示一次"期望。D-03 Claude's Discretion 建议不持久，默认采用。[ASSUMED] |
| A3 | localStorage key 命名 `neuron-assistant:ui-store:v1`（Phase 10 session-store 无 persist，D-03 "沿用 Phase 10 风格"无实际参照） | BLOCKER-2 / Pattern 3 | key 名随意，不影响功能；但未来扩展需要 migrate 时需要一个稳定前缀。[ASSUMED] |
| A4 | BLOCKER-1 暂定方案：pending 空心圆用 `var(--color-border-standard)` | BLOCKER-1 / Pitfall 6 | 若用户选 `--color-border-focus`（对比更强）或要求新增 `--color-border-default` token，需改 globals.css + todo-item.tsx。[ASSUMED] |
| A5 | Drawer 展开/收起动画用 grid `transition-[grid-template-columns]`（200ms ease），不叠加 translateX | Pitfall 7 | 若 Planner 决定 translateX 方案，需重写 AppLayout 为固定 3 列 + drawer translateX，实现更复杂。[ASSUMED] |

**如果用户对 A1~A5 有不同意见，请在 `/gsd-discuss-phase` 追加轮次 或在 planner 阶段显式覆盖。**

## Open Questions

1. **BLOCKER-1: `--color-border-default` token 缺失**
   - What we know: CONTEXT.md D-08 明确指名 `var(--color-border-default)`，但 `frontend/src/app/globals.css:25-27` 只有 `--color-border-subtle`、`--color-border-standard`、`--color-border-focus` 三个 token。DESIGN.md 亦未定义 `default`。D-15 又禁止"引入新 token"。
   - What's unclear: 用户是希望**把 D-08 改为引用已有 token**（哪个？推荐 `--color-border-standard`），还是**给 globals.css + DESIGN.md 补一个 `--color-border-default` = `rgba(255,255,255,0.08)` 的别名**（技术上不算"新增 token"，只是重命名）？
   - Recommendation: Planner 在 /gsd-plan-phase 开始前向用户发起一轮 Q&A，二选一；若用户授权 Claude 自行决定，推荐选项 A（`--color-border-standard`），0 代价、最小改动。

2. **BLOCKER-2: Zustand persist 无项目先例，storage key 命名 + Next.js SSR 处理需定标准**
   - What we know: `session-store.ts` / `chat-store.ts` 均未用 persist；全项目 grep 不到 `persist(` 调用。D-03 "沿用 Phase 10 session-store 风格" 无实际参照。
   - What's unclear: ①localStorage key 是否用 `neuron-assistant:` 前缀（推荐）；②`skipHydration: true` + 顶层 `rehydrate()` 是否作为项目范式固化（推荐，Next.js App Router 最安全）；③`hasAutoOpenedFor: Set` 是否也走 persist（推荐**否**，per A2 + D-03 Claude's Discretion）。
   - Recommendation: Planner 在第一个任务里把上述三点写成 AC，并把 Pattern 3 的代码模板作为范例，固化后续所有 UI 持久化的惯例。

3. **auto-open 触发源明确化（呼应 A1）**
   - What we know: D-02 原文说"首次收到某 session 内的 `todo` 事件"。SSE todo 事件 ≠ loadHistory 写入。
   - What's unclear: 切回有历史 todos 的会话时，面板应保持关闭（按用户偏好）还是也"首次"弹一次？
   - Recommendation: 按 A1 采"仅 SSE 触发"；planner 把这条写进 `use-sse.ts::todo` listener 的实现注释 + 单测 AC（"切历史会话时 drawer 不会被 autoOpenDrawer 打开"）。

4. **动画机制二选一（呼应 A5）**
   - What we know: D-09 只约束 "新 todo item fade-in 200ms" + "状态切换 150ms"，未说 drawer 本体动画。
   - What's unclear: drawer 弹出用 grid transition（推荐）还是 translateX。
   - Recommendation: grid transition 方案简单，Planner 默认采用；若遇到浏览器兼容/性能问题再切换。

## Sources

### Primary (HIGH confidence)
- `.venv/lib/python3.12/site-packages/langchain/agents/middleware/todo.py:25-42` — `Todo` TypedDict 与 `PlanningState`，源码原文 [VERIFIED]
- `backend/app/core/streaming.py:116-122` — `EVT_TODO` 发射路径 [VERIFIED]
- `backend/app/core/history.py:145` — messages 从 `channel_values` 读取既有模式 [VERIFIED]
- `backend/app/core/tools.py:257` — `write_todos` 已配置 `HITL: False` [VERIFIED]
- `frontend/src/hooks/use-sse.ts:30-136` — 既有 SSE listener 模式（token/tool/hitl/done/error） [VERIFIED]
- `frontend/src/stores/session-store.ts` — 确认**未用** Zustand persist（BLOCKER-2 依据） [VERIFIED]
- `frontend/src/stores/chat-store.ts` — `loadHistory` / `reset` 现有钩子形态 [VERIFIED]
- `frontend/src/components/layout/app-layout.tsx` — 当前 15 行定稿，grid-cols-[240px_1fr] [VERIFIED]
- `frontend/src/app/globals.css:25-27` — CSS 变量清单，确认缺 `--color-border-default`（BLOCKER-1 依据） [VERIFIED]
- `frontend/package.json` — vitest ^2.1.9 已装 [VERIFIED]

### Secondary (MEDIUM confidence)
- `.planning/phases/10-session-management/10-CONTEXT.md` — D-03 `?from_id=0` reattach 机制 [CITED]
- `.planning/phases/10-session-management/10-04-SUMMARY.md` — Phase 10 执行总结 [CITED]
- `.planning/phases/08-sse-chat-foundation/08-CONTEXT.md` — Zustand domain-sliced 约定 [CITED]
- zustand v5 `persist` + Next.js App Router hydration 文档 [CITED: zustand 官方 middleware 文档通用模式]

### Tertiary (LOW confidence)
- （无）

## Metadata

**Confidence breakdown:**
- 上游契约（Todo TypedDict / EVT_TODO / HITL 配置）：HIGH — 全部源码本地 grep 确认
- 后端扩展路径：HIGH — Phase 10 历史端点 + channel_values 读法同构
- 前端 SSE / store 扩展：HIGH — 既有代码模式直接复用
- DESIGN.md token 映射：MEDIUM — BLOCKER-1 待定，其余 token (`--color-accent` `--color-bg-panel` `--color-border-subtle`) 全部在 globals.css 核实
- Zustand persist + Next.js SSR：MEDIUM — 模式通用正确，但项目首次落地，有调试成本
- 测试策略：HIGH — pytest / vitest 基础设施齐备，fixture 扩展方案明确

**Research date:** 2026-04-21
**Valid until:** 2026-05-21（30 天，前端栈相对稳定；超过 30 天 Planner 应校验 langchain / zustand / Next.js 版本是否有破坏性更新）
