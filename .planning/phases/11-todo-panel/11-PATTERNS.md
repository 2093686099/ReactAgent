# Phase 11: Todo Panel - Pattern Map

**Mapped:** 2026-04-21
**Files analyzed:** 20（前端新建 5 / 前端修改 4 / 后端修改 3 / 测试新建 6 —— 含 2 份聚焦覆盖点的拆分测试）
**Analogs found:** 19 / 20（1 个 "无完全对等 analog"：首个 Zustand persist store）

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `frontend/src/stores/ui-store.ts` | state store (persist) | request-response（localStorage） | `frontend/src/stores/session-store.ts` | role-match（**无 persist 先例**） |
| `frontend/src/components/todo/todo-drawer.tsx` | container component | request-response | `frontend/src/components/chat/chat-area.tsx` | role-match |
| `frontend/src/components/todo/todo-list.tsx` | list + empty state | request-response | `frontend/src/components/chat/message-list.tsx` | exact |
| `frontend/src/components/todo/todo-item.tsx` | single row + tri-state icon | request-response | `frontend/src/components/chat/tool-pill.tsx` | exact |
| `frontend/src/components/todo/todo-toggle-button.tsx` | icon-only button | event-driven（onClick） | `frontend/src/components/sidebar/session-item.tsx` 内删除按钮 + `frontend/src/components/ui/button.tsx` | role-match |
| `frontend/src/stores/chat-store.ts` (modify) | state store | request-response | 自身（扩展 messages/reset/loadHistory 的现有模式） | exact |
| `frontend/src/hooks/use-sse.ts` (modify) | SSE hook | event-driven | 自身（扩展 token/tool listener 模式） | exact |
| `frontend/src/components/layout/app-layout.tsx` (modify) | layout container | request-response | 自身（grid 扩列） | exact |
| `frontend/src/lib/api.ts` (modify) | API client | request-response | 自身（`loadHistory` 签名） | exact |
| `frontend/src/lib/types.ts` (modify) | shared type | — | 自身（现有 `TextSegment` / `Message` 结构） | exact |
| `frontend/src/app/page.tsx` (modify) | page orchestrator | request-response | 自身（`handleSwitch` / `handleDelete` / `handleNew` 的 setTodos 增补） | exact |
| `backend/app/api/sessions.py` (modify) | FastAPI route | request-response | 自身 `GET /{session_id}/messages` 当前实现 | exact |
| `backend/app/models/chat.py` (modify) | Pydantic model | — | 自身 `SessionCreateRequest`/`ResumeRequest` 结构 | exact |
| `backend/app/core/history.py` (modify) | business logic | request-response | 自身 line 145 `channel_values["messages"]` 读法 | exact |
| `backend/tests/fixtures/checkpoint_factory.py` (modify) | test fixture | — | 自身 `make_checkpoint_tuple` 签名 | exact |
| `backend/tests/test_history.py` (modify) | integration test | — | 自身 `test_truncate_when_active_task` 结构 | exact |
| `frontend/src/stores/__tests__/ui-store.test.ts` | store unit test — 基础行为 | — | `frontend/src/lib/__tests__/time-group.test.ts` | role-match（**项目首个 store 测试**） |
| `frontend/src/stores/__tests__/ui-store.autoopen.test.ts` | store unit test — autoOpen 语义 | — | `frontend/src/lib/__tests__/time-group.test.ts` | role-match |
| `frontend/src/stores/__tests__/chat-store.todos.test.ts` | store unit test — setTodos / 初值 | — | 同上 | role-match |
| `frontend/src/stores/__tests__/chat-store.session-switch.test.ts` | store unit test — loadHistory / reset 联动 todos | — | 同上 | role-match |
| `frontend/src/hooks/__tests__/use-sse.todo.test.ts` | hook unit test（optional） | — | 同上 | role-match（**项目首个 hook 测试，需要 DOM 环境**） |
| `frontend/src/components/todo/__tests__/todo-item.test.tsx` | component unit test（optional） | — | 同上 | role-match（**项目首个 .tsx 测试，需要 jsdom + @testing-library**） |

> **关键约束（vitest.config.ts 验证）：**
> - `include: ["src/**/__tests__/**/*.test.ts"]` —— 测试文件必须落在 `__tests__/` 子目录，且扩展名 `.test.ts`。RESEARCH.md 中提议的 `frontend/src/stores/ui-store.test.ts` 会被 glob 漏掉，planner 需将路径改为 `frontend/src/stores/__tests__/ui-store.test.ts`（已在上表体现）。
> - `environment: "node"` —— store 测试可直接跑；hook / tsx 组件测试需要 jsdom，且 include 需加 `*.test.tsx`。planner 应把"vitest.config 扩展"单列为一个 Wave 0 任务（与 RESEARCH.md Wave 0 清单一致）。

> **测试拆分说明（Consolidation Notes — 请 planner 注意）：**
> 上表显式保留 **6 个测试新建**（与上游 prompt 一致），未做合并：
> - `ui-store.test.ts` 只覆盖基础字段/toggle 行为。
> - `ui-store.autoopen.test.ts` 聚焦 autoOpen 语义（"切历史会话不触发 autoOpen"/"hasAutoOpenedFor 跨 sessionId 隔离"）——与 loadHistory 路径强耦合，单列更好审。
> - `chat-store.todos.test.ts` 聚焦 `setTodos` / 初值 / 覆盖语义。
> - `chat-store.session-switch.test.ts` 聚焦会话切换路径上的 todos 联动（"reset 后 todos=[]"/"loadHistory 注入 todos"）。
> 如 planner 有强烈合并理由（如减少 beforeEach setup 重复），可自行合并到 `ui-store.test.ts` / `chat-store.todos.test.ts`，但合并后需保证 **四组覆盖点都写到 describe block** 且名称可检索。

---

## Pattern Assignments

### `frontend/src/stores/ui-store.ts` (state store, persist)

**Analog:** `frontend/src/stores/session-store.ts`（结构骨架；persist 中间件无项目先例，需参考 RESEARCH.md Pattern 3）

**Store 骨架** (`session-store.ts:12-27`):
```typescript
type SessionState = {
  sessions: Session[];
  activeSessionId: string; // 永远非空（首次进入页面 createLocal 兜底）
  deletedPending: Session | null;
  loadSessions: () => Promise<Session[]>;
  setActive: (id: string) => void;
  // ...
};

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSessionId: newLocalId(),
  deletedPending: null,
  // ...
}));
```

**幂等 Set 更新模式** (`session-store.ts:84-89` 参考)：
```typescript
// restoreSession：读当前 set，构造新数组，再 set。Phase 11 的 hasAutoOpenedFor: Set<string>
// 应用同样的 "read state → copy → add → set" 惯例：
set((s) => ({
  sessions: [session, ...s.sessions].sort((a, b) => b.last_updated - a.last_updated),
  deletedPending: null,
}));
```

**偏差说明（persist 部分无 analog）：**
- 项目 zero Zustand persist 先例（`session-store.ts` / `chat-store.ts` 均未用 `persist`）。
- planner 应采用 RESEARCH.md Pattern 3 代码模板：
  - `persist(...)` 包裹 set 初始化器
  - `name: "neuron-assistant:ui-store:v1"`（RESEARCH.md A3）
  - `skipHydration: true` + 在 `app-layout.tsx` 顶层 `useEffect(() => void useUIStore.persist.rehydrate(), [])`（对应 RESEARCH.md Pitfall 1）
  - `partialize: (s) => ({ todoDrawerOpen: s.todoDrawerOpen })` —— `hasAutoOpenedFor: Set` 不入 localStorage（RESEARCH.md A2）。
- 这是"项目首次落地 Zustand persist"，planner 应把该 store 的实现作为后续 UI 持久化范式，写入 task notes。

---

### `frontend/src/components/todo/todo-drawer.tsx` (container)

**Analog:** `frontend/src/components/chat/chat-area.tsx`

**完整容器模式** (`chat-area.tsx:1-13`):
```tsx
import type { ReactNode } from "react";

type ChatAreaProps = {
  children: ReactNode;
};

export function ChatArea({ children }: ChatAreaProps) {
  return (
    <section className="flex h-screen flex-col bg-[var(--color-bg-panel)]">
      {children}
    </section>
  );
}
```

**Phase 11 扩展方向：**
- 顶层容器 `<aside className="flex h-screen flex-col bg-[var(--color-bg-panel)] border-l border-[var(--color-border-subtle)]">`（D-01 左边线 + panel 背景）。
- 头部：轻量标题 + 关闭按钮（模式同 `session-item.tsx` 删除按钮）。
- 主体：渲染 `<TodoList />`。
- 动效：RESEARCH.md Pattern 4 用 `transition-[grid-template-columns] duration-200 ease-out` 放在 **AppLayout**，drawer 本体不做 translateX（对应 RESEARCH.md Pitfall 7）。

---

### `frontend/src/components/todo/todo-list.tsx` (list + empty state)

**Analog:** `frontend/src/components/chat/message-list.tsx`

**列表 + 空态分叉** (`message-list.tsx:32-60`):
```tsx
return (
  <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-6 py-6">
      {messages.length === 0 && status === "idle" ? (
        <div className="flex flex-1 items-center justify-center text-[15px] text-[var(--color-text-tertiary)]">
          你好，有什么可以帮你的？
        </div>
      ) : (
        <div className="space-y-4">
          {messages.map((message) => (
            <MessageBubble ... />
          ))}
        </div>
      )}
    </div>
  </div>
);
```

**Phase 11 应用：**
- 空态：`<div className="... text-[var(--color-text-tertiary)]">Agent 尚未制定任务计划</div>`（CONTEXT.md Claude's Discretion）。
- 列表：`{todos.map((t, i) => <TodoItem key={i} todo={t} />)}`（todos 无稳定 id，用 index 作 key——SSE 全量覆盖语义下可接受，且 D-09 不做重排）。
- 空态字号 15px + `text-tertiary` 与 message-list 的 idle 空态严格一致，保持风格统一。

---

### `frontend/src/components/todo/todo-item.tsx` (single row + tri-state icon)

**Analog:** `frontend/src/components/chat/tool-pill.tsx`（三态图标分支 + Lucide icon + CSS 变量色）

**三态分支模式** (`tool-pill.tsx:9-43`):
```tsx
export function ToolPill({ segment }: ToolPillProps) {
  const isRejected = segment.status === "rejected";
  // ...
  return (
    <div className="my-1">
      <span
        role="status"
        aria-label={`工具 ${label} ${stateText}`}
        className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(255,255,255,0.08)] bg-white/[0.05] px-2 py-0.5"
      >
        {segment.status === "calling" ? (
          <Loader2 size={14} aria-hidden="true" className="animate-spin text-[var(--color-text-tertiary)]" />
        ) : isRejected ? (
          <X size={14} aria-hidden="true" className="text-[var(--color-text-tertiary)]" />
        ) : (
          <Check size={14} aria-hidden="true" className="text-[var(--color-success)]" />
        )}
        <span className="font-mono text-[13px] text-[var(--color-text-tertiary)]">{label}</span>
      </span>
    </div>
  );
}
```

**Phase 11 应用（关键偏差列表）：**
1. **图标尺寸 16px**（D-08 规定），而非 tool-pill 的 14px。
2. **三态不用 `Loader2`**：`pending` = 空心圆（border only），`in_progress` = 自定义 SVG 半圈 spinner（stroke `var(--color-accent)`），`completed` = 实心圆 + Lucide `Check` 12px（不是 tool-pill 的 ✓ 绿色）。
3. **文案颜色不变**（D-08 硬约束）：始终 `text-[var(--color-text-secondary)]`，即使 `completed`。禁止套用 tool-pill 的 `line-through opacity-60` rejected 样式。
4. **BLOCKER-1 待决**：pending 边框色：D-08 指名 `var(--color-border-default)` 但 globals.css 未定义此 token。planner 需参照 RESEARCH.md Open Question 1，若用户授权 Claude 定夺，采用 `var(--color-border-standard)`（推荐值）。
5. **进入动画**：D-09 规定 `animate-[todoEnter_200ms_ease-out]`，keyframe 定义新增到 `globals.css`（RESEARCH.md Code Examples 已给模板）。
6. **Lucide 版本注意**：`frontend/package.json` 依赖 `lucide-react: ^1.8.0`（非常新的 v1 major），用法与 tool-pill 的 `<Check size={14} />` 相同即可，无需额外迁移处理。

**参考：existing Lucide Check usage**（`tool-pill.tsx:31`, `hitl-card.tsx:32`）—— 确认 `<Check size={12} strokeWidth={3} />` 写法项目内一致。

---

### `frontend/src/components/todo/todo-toggle-button.tsx` (icon button)

**Analog:** `frontend/src/components/sidebar/session-item.tsx` 内部删除按钮（`session-item.tsx:37-47`）

**icon-only button 样式** (`session-item.tsx:37-47`):
```tsx
<button
  type="button"
  aria-label="删除会话"
  onClick={(e) => {
    e.stopPropagation();
    onDelete(session.id);
  }}
  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-[rgba(255,255,255,0.08)]"
>
  <Trash2 size={14} className="text-[var(--color-text-tertiary)]" />
</button>
```

**Phase 11 应用：**
- 挂在 chat 顶栏右上角（需要 planner 决定："加 `<header>` 到 `chat-area.tsx` 还是把 toggle 直接放 page.tsx 内顶层"）。
- 使用 `<ListTodo />` 或 `<CheckSquare />`（Claude's Discretion，推荐 `ListTodo`）。
- 一直可见（不是 opacity-0 hover 才显示）——去掉 `opacity-0 group-hover:opacity-100`。
- `onClick={() => useUIStore.getState().toggleDrawer()}` 或 `const toggle = useUIStore(s => s.toggleDrawer)`。
- `aria-pressed={drawerOpen}` 加语义。

---

### `frontend/src/stores/chat-store.ts` (modify — 加 todos)

**Analog:** 自身

**现有 `loadHistory` 模式** (`chat-store.ts:20, 299-312`):
```typescript
// Type：
loadHistory: (messages: Message[]) => void;

// 实现：
loadHistory: (messages) => {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  tokenBuffer = "";
  set({
    messages,
    status: "idle",
    currentTaskId: null,
    errorMessage: null,
  });
},
```

**现有 `reset` 模式** (`chat-store.ts:314-326`):
```typescript
reset: () => {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  tokenBuffer = "";
  set({
    messages: [],
    status: "idle",
    currentTaskId: null,
    errorMessage: null,
  });
},
```

**Phase 11 外科手术改动（最小集）：**
1. `ChatState` type 加：
   ```typescript
   todos: Todo[];
   setTodos: (todos: Todo[]) => void;
   ```
2. `loadHistory` **签名变更**：`(messages: Message[]) => void` → `(payload: { messages: Message[]; todos: Todo[] }) => void`。所有调用点（`page.tsx:58`, `:69`, `:126`, `:134` 四处 `loadHistoryAction([])` / `loadHistoryAction(msgs)`）需同步改。
3. `reset` 内部 `set({ messages: [], ... })` 追加 `todos: []`。
4. 初始值 `todos: []`。
5. 新增 action `setTodos: (todos) => set({ todos })`（整体覆盖，无 rafId 逻辑——它不是 token）。

**调用点改造样例**（`page.tsx` 侧）：
```typescript
// 旧：loadHistoryAction([])
// 新：loadHistoryAction({ messages: [], todos: [] })

// 旧：loadHistoryAction(msgs)
// 新：loadHistoryAction({ messages: msgs, todos: hist.todos })
```

---

### `frontend/src/hooks/use-sse.ts` (modify — 加 todo listener)

**Analog:** 自身（既有 token/tool/hitl/done/error listener）

**Listener 原型** (`use-sse.ts:49-76`):
```typescript
eventSource.addEventListener("token", (event) => {
  let payload: { text?: string };
  try {
    payload = JSON.parse((event as MessageEvent).data);
  } catch {
    return; // 单帧坏数据不应中断流
  }
  if (payload.text) {
    appendToken(payload.text);
  }
});

eventSource.addEventListener("tool", (event) => {
  let payload: { name?: string; status?: "calling" | "done" };
  try {
    payload = JSON.parse((event as MessageEvent).data);
  } catch {
    return;
  }
  if (!payload.name || !payload.status) {
    return;
  }
  // ...
});
```

**Phase 11 新增 listener（照抄上面的 parse + 早返回模式）：**
```typescript
eventSource.addEventListener("todo", (event) => {
  let payload: { todos?: Todo[] };
  try {
    payload = JSON.parse((event as MessageEvent).data);
  } catch {
    return; // 单帧坏数据不应中断流
  }
  if (!Array.isArray(payload.todos)) {
    return;
  }
  useChatStore.getState().setTodos(payload.todos);
  if (payload.todos.length > 0) {
    useUIStore.getState().autoOpenDrawer(sessionId);
  }
});
```

**关键点：**
- 用 `useChatStore.getState()` / `useUIStore.getState()` 而非 hook 选择器——`use-sse.ts` 既有模式是顶层选择器（`const appendToken = useChatStore((state) => state.appendToken)`）。**建议保持一致**：`const setTodos = useChatStore((s) => s.setTodos)` + `const autoOpenDrawer = useUIStore((s) => s.autoOpenDrawer)`，并把它们加入末尾 deps 数组（`use-sse.ts:125-134`）。
- `autoOpenDrawer` 只在 live SSE listener 内调用，不在 `loadHistory` 调用（RESEARCH.md Pitfall 2 + Assumption A1）。
- 负载解构：`{ todos }`，不是 `Todo[]`（RESEARCH.md Pitfall 5）。

---

### `frontend/src/components/layout/app-layout.tsx` (modify)

**Analog:** 自身

**当前完整实现** (`app-layout.tsx:1-15`):
```tsx
import type { ReactNode } from "react";

type AppLayoutProps = {
  children: ReactNode;
  sidebar: ReactNode;
};

export function AppLayout({ children, sidebar }: AppLayoutProps) {
  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr] bg-[var(--color-bg-panel)] text-[var(--color-text-primary)]">
      {sidebar}
      <div className="border-l border-[var(--color-border-subtle)]">{children}</div>
    </div>
  );
}
```

**Phase 11 改动（需加 "use client" 指令，因为要 subscribe store）：**
- 读 `useUIStore((s) => s.todoDrawerOpen)`。
- `grid-cols` 条件：`drawerOpen ? "grid-cols-[240px_1fr_320px]" : "grid-cols-[240px_1fr]"`（D-01）。
- 外层 div 加 `transition-[grid-template-columns] duration-200 ease-out`（D-09 推荐值）。
- `drawerOpen && <TodoDrawer />` 挂第三列。
- 顶层 `useEffect(() => { void useUIStore.persist.rehydrate(); }, [])`（RESEARCH.md Pattern 3 hydration 修复）。

---

### `frontend/src/lib/api.ts` (modify — loadHistory 返回类型)

**Analog:** 自身

**现有实现** (`api.ts:81-85`):
```typescript
export async function loadHistory(sessionId: string): Promise<HistoryResponse> {
  const r = await fetch(`${API_BASE}/api/sessions/${sessionId}/messages`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as HistoryResponse;
}
```

**Phase 11 无代码改动**，仅依赖 `HistoryResponse` 类型在 `types.ts` 扩展（见下）。

---

### `frontend/src/lib/types.ts` (modify — 加 Todo + HistoryResponse.todos)

**Analog:** 自身

**现有 HistoryResponse** (`types.ts:50-54`):
```typescript
export interface HistoryResponse {
  messages: Message[];
  active_task: ActiveTask | null;
  truncate_after_active_task: boolean;
}
```

**Phase 11 追加**：
```typescript
export type Todo = {
  content: string;
  status: "pending" | "in_progress" | "completed";
};

export interface HistoryResponse {
  messages: Message[];
  todos: Todo[];                    // 新增
  active_task: ActiveTask | null;
  truncate_after_active_task: boolean;
}
```

---

### `frontend/src/app/page.tsx` (modify)

**Analog:** 自身

**四处 `loadHistoryAction` 调用点**（`page.tsx:58, 69, 126, 134`）—— 全部改为 `{ messages, todos }` 对象签名。

**现有删会话兜底** (`page.tsx:118-129`):
```typescript
if (id === activeSessionId) {
  const remaining = useSessionStore.getState().sessions;
  const next = remaining[0];
  if (next) {
    await handleSwitch(next.id);
  } else {
    createLocal();
    loadHistoryAction([]);    // 改为 loadHistoryAction({ messages: [], todos: [] })
    setCurrentTaskId(null);
  }
}
```

**D-07 补充**：空态回到新建会话时，除了 `loadHistoryAction({...})`，还需：`useUIStore.getState().resetAutoOpened()` 或等价操作重置 `hasAutoOpenedFor`（Claude's Discretion——若 planner 选择不暴露该 action，至少保证下一次 SSE todo 进入时能再次 auto-open；当前 API 是 per-sessionId 追踪，切到新 sessionId 已自动满足，所以这条可能不需要额外调用，planner 决策）。

---

### `backend/app/api/sessions.py` (modify)

**Analog:** 自身（`GET /{session_id}/messages`）

**现有实现** (`sessions.py:86-100`):
```python
@router.get("/{session_id}/messages")
async def get_messages(
    session_id: str,
    user_id: str = Depends(get_current_user),
    session_svc: SessionService = Depends(get_session_service),
):
    """CHAT-08：从 LangGraph checkpoint 还原历史消息 + 回填 active_task。"""
    if not await session_svc.session_exists(session_id, user_id=user_id):
        raise HTTPException(status_code=404, detail="会话不存在")
    return await load_history_for_session(user_id, session_id, session_svc)
```

**Phase 11 外科手术改动：**
- **不动 `sessions.py` 的路由函数体**。`load_history_for_session` 返回 dict，端点原样透传；只需在 `load_history_for_session` 内追加 `todos` 字段（见 `history.py` 段）。
- 端点装饰器当前未绑定 `response_model=`。是否引入 `response_model=HistoryResponseModel` 由 planner 决定——这是对 D-11 的落地方式选择，不是对 D-11 的放宽或规避。详见下一段 `backend/app/models/chat.py` 对 Pydantic 模型新增范围的讨论。

---

### `backend/app/models/chat.py` (modify — 加 TodoModel；HistoryResponseModel 可选)

**Analog:** 自身（`SessionCreateRequest` / `ResumeRequest` 既有 BaseModel 风格）

**现有模型** (`chat.py:15-26`):
```python
class SessionCreateRequest(BaseModel):
    session_id: Optional[str] = None
    title: Optional[str] = None
    last_task_id: Optional[str] = None
```

**Phase 11 新增类型（最小集）**：
```python
from typing import Literal
from pydantic import BaseModel

class TodoModel(BaseModel):
    content: str
    status: Literal["pending", "in_progress", "completed"]
```

**落地 D-11 的两条路径（供 planner 抉择，请在 plan 中显式说明选哪条及理由）：**

| 路径 | 动作 | Tradeoff |
|------|------|----------|
| A. 仅加 `TodoModel` | 在 `history.py` 内用 `TodoModel(**t).model_dump()` 做校验后返回 dict，端点不绑 response_model | 与现状（端点返 dict、无 response_model）一致；`TodoModel` 显式声明 todo 契约；改动面最小 |
| B. 加 `TodoModel` + `HistoryResponseModel` | 同步把 `messages / active_task / truncate_after_active_task / todos` 都建模，装饰器加 `response_model=HistoryResponseModel` | 响应契约由 FastAPI 强校验，未来字段增减会自动 OpenAPI 化；但需同时为 Phase 10 既有 `messages` / `active_task` 结构补建模，改动面扩大到 Phase 10 范围 |

**注意**：无论选 A 或 B，D-11 "响应体变更需同步更新 Pydantic response model" 都被满足——A 路径通过 `TodoModel` 为新字段建模，B 路径进一步把整个响应建模。两条路径都不触犯 D-11，planner 依据 "改动面" vs "未来维护收益" 权衡即可。

---

### `backend/app/core/history.py` (modify — 读 todos)

**Analog:** 自身 line 145

**现有 messages 读取** (`history.py:145-155`):
```python
raw = (ckpt_tuple.checkpoint or {}).get("channel_values", {}).get("messages", []) or []
truncate = bool(
    active_task is not None
    and raw
    and type(raw[-1]).__name__ == "AIMessage"
)
return {
    "messages": messages_to_segments(raw),
    "active_task": active_task,
    "truncate_after_active_task": truncate,
}
```

**Phase 11 扩展：**
```python
raw = (ckpt_tuple.checkpoint or {}).get("channel_values", {}).get("messages", []) or []
raw_todos = (ckpt_tuple.checkpoint or {}).get("channel_values", {}).get("todos", []) or []

# Todo 形状来自 langchain TodoListMiddleware：{"content": str, "status": str}
# 兜底：只透出 content/status，丢弃任何未知字段（forward-compat）
todos: list[dict] = [
    {"content": t.get("content", ""), "status": t.get("status", "pending")}
    for t in raw_todos
    if isinstance(t, dict)
]

truncate = bool(...)  # 不变
return {
    "messages": messages_to_segments(raw),
    "todos": todos,             # 新增
    "active_task": active_task,
    "truncate_after_active_task": truncate,
}
```

**其余空壳分支**（`history.py:128-134`, `:138-143`）—— **四处都要加 `"todos": []`**（空响应也需契约完整性，D-11 "空 state.todos 时返回 `[]`，不返回 null"）。

---

### `backend/tests/fixtures/checkpoint_factory.py` (modify — 加 todos 参数)

**Analog:** 自身

**现有签名** (`checkpoint_factory.py:57-64`):
```python
def make_checkpoint_tuple(messages: list[Any]):
    """构造一个与 AsyncPostgresSaver.aget_tuple() 返回值形状相同的对象。"""
    return SimpleNamespace(
        checkpoint={"channel_values": {"messages": messages}},
    )
```

**Phase 11 扩展（向后兼容：todos 默认 None）：**
```python
def make_checkpoint_tuple(messages: list[Any], todos: list[dict] | None = None):
    """构造一个与 AsyncPostgresSaver.aget_tuple() 返回值形状相同的对象。

    todos=None → channel_values 不含 "todos" 键（模拟从未触发 write_todos 的 checkpoint）
    todos=[] → channel_values 含 "todos": []
    todos=[...] → channel_values 含 "todos": [...]
    """
    channel_values: dict = {"messages": messages}
    if todos is not None:
        channel_values["todos"] = todos
    return SimpleNamespace(checkpoint={"channel_values": channel_values})
```

**关键偏差说明**：
- 现有所有调用点（`test_history.py:124, 154, 192`）都是 `make_checkpoint_tuple(raw)` 单参数调用，**保持向后兼容**靠 `todos=None` 默认值 —— 不需改动任何旧测试。
- `todos=None` 与 `todos=[]` 的行为区分是为了覆盖 RESEARCH.md Pitfall 3（"新会话 checkpoint 根本没有 todos 键"的场景）。

---

### `backend/tests/test_history.py` (modify — 加 2 个 todos 用例)

**Analog:** 自身（`test_truncate_when_active_task` 完整结构）

**整段复用** (`test_history.py:117-145`):
```python
@pytest.mark.asyncio
async def test_truncate_when_active_task(monkeypatch):
    """active_task 非空 + 最末 AIMessage → truncate_after_active_task=True"""
    from app.core import history as history_mod

    raw = [make_human("hi"), make_ai(content="half answer...")]
    fake_ckptr = AsyncMock()
    fake_ckptr.aget_tuple = AsyncMock(return_value=make_checkpoint_tuple(raw))
    monkeypatch.setattr(history_mod.db, "checkpointer", fake_ckptr)

    session_svc = AsyncMock()
    session_svc.get_session = AsyncMock(return_value={
        "session_id": "s1", "user_id": "u1", "title": "hi",
        "last_task_id": "t-1", "last_updated": 1.0,
    })
    monkeypatch.setattr(
        history_mod.task_bus, "get_task_meta",
        AsyncMock(return_value={
            "task_id": "t-1", "user_id": "u1", "session_id": "s1",
            "status": history_mod.task_bus.STATUS_INTERRUPTED,
        }),
    )

    result = await history_mod.load_history_for_session("u1", "s1", session_svc)
    assert result["active_task"] == {"task_id": "t-1", "status": "interrupted"}
    assert result["truncate_after_active_task"] is True
    assert len(result["messages"]) == 2
```

**Phase 11 新增 2 个用例（模式直抄）：**
```python
@pytest.mark.asyncio
async def test_messages_endpoint_returns_empty_todos(monkeypatch):
    """todos 字段始终存在；state 无 todos 键时返回 []"""
    from app.core import history as history_mod

    raw = [make_human("hi"), make_ai(content="done")]
    fake_ckptr = AsyncMock()
    fake_ckptr.aget_tuple = AsyncMock(return_value=make_checkpoint_tuple(raw))  # 不传 todos
    monkeypatch.setattr(history_mod.db, "checkpointer", fake_ckptr)

    session_svc = AsyncMock()
    session_svc.get_session = AsyncMock(return_value={
        "session_id": "s1", "user_id": "u1", "title": "", "last_task_id": None,
    })

    result = await history_mod.load_history_for_session("u1", "s1", session_svc)
    assert result["todos"] == []


@pytest.mark.asyncio
async def test_messages_endpoint_returns_todos_from_checkpoint(monkeypatch):
    """state.todos 有内容时正确序列化为 {content, status} dict"""
    from app.core import history as history_mod

    raw = [make_human("plan 3 steps")]
    fake_todos = [
        {"content": "step A", "status": "completed"},
        {"content": "step B", "status": "in_progress"},
        {"content": "step C", "status": "pending"},
    ]
    fake_ckptr = AsyncMock()
    fake_ckptr.aget_tuple = AsyncMock(
        return_value=make_checkpoint_tuple(raw, todos=fake_todos)
    )
    monkeypatch.setattr(history_mod.db, "checkpointer", fake_ckptr)

    session_svc = AsyncMock()
    session_svc.get_session = AsyncMock(return_value={
        "session_id": "s1", "user_id": "u1", "title": "", "last_task_id": None,
    })

    result = await history_mod.load_history_for_session("u1", "s1", session_svc)
    assert len(result["todos"]) == 3
    assert result["todos"][0] == {"content": "step A", "status": "completed"}
    assert result["todos"][1]["status"] == "in_progress"
```

**另需额外两处小修**：
- `test_load_history_when_checkpointer_is_none`（line 178）断言加 `"todos": []`。
- `test_load_history_when_no_checkpoint`（line 200）断言加 `result["todos"] == []`。
- `test_no_truncate_when_no_active_task`（line 165）建议加 `assert result["todos"] == []` 作冒烟（幂等断言，不会破坏语义）。

---

### `frontend/src/stores/__tests__/ui-store.test.ts` (new — 基础行为)

**Analog:** `frontend/src/lib/__tests__/time-group.test.ts`

**测试文件结构** (`time-group.test.ts:1-10`):
```typescript
import { describe, it, expect } from "vitest";
import { groupSessions } from "@/lib/time-group";

// ...

describe("groupSessions", () => {
  it("returns empty array for empty input", () => {
    expect(groupSessions([], NOW)).toEqual([]);
  });
  // ...
});
```

**Phase 11 覆盖点（聚焦：字段初值 + toggle 行为）：**
1. 初始 `todoDrawerOpen === false`，`hasAutoOpenedFor.size === 0`。
2. `toggleDrawer()` 切换 true ↔ false。
3. `openDrawer()` / `closeDrawer()` 幂等（多次调用状态不抖）。

**persist 测试限制**：`environment: "node"` 下 localStorage 不可用；要么 ① 在 beforeEach 设置 stub global（推荐），要么 ② 把 persist 测试拆到单独文件、独立 environment（RESEARCH.md A2/A3）。建议 ①。

---

### `frontend/src/stores/__tests__/ui-store.autoopen.test.ts` (new — autoOpen 语义)

**Analog:** 同上 `time-group.test.ts`

**为何拆单独文件**：autoOpen 语义横跨 sessionId 维度，与 page.tsx / use-sse.ts 两条路径强耦合（一旦合错会让 drawer "切会话就自己弹"，属于 CONTEXT.md D-02/D-06/D-07 的核心体验红线）。单列文件确保这组断言不会被淹没在基础 toggle 测试里。

**Phase 11 覆盖点：**
1. **首次触发**：初态下 `autoOpenDrawer("s1")` → `todoDrawerOpen = true`，`hasAutoOpenedFor` 含 `"s1"`。
2. **同 session 幂等**：对同一 `"s1"` 再次 `autoOpenDrawer` 不改变已有状态；特别是用户手动 `closeDrawer()` 后再收到 `autoOpenDrawer("s1")`，**drawer 必须保持 closed**（尊重用户关闭意图，对应 CONTEXT.md D-06）。
3. **跨 session 隔离**：s1 打开/关闭后，`autoOpenDrawer("s2")` 能触发一次新的 auto-open（对应 CONTEXT.md D-02 "每个会话首次一次"）。
4. **loadHistory 路径 NOT 触发 autoOpen**：模拟 `setTodos([...])` 被 loadHistory 调用（不经 SSE 路径），断言 `hasAutoOpenedFor` 保持空（对应 RESEARCH.md Pitfall 2 —— autoOpenDrawer 只能在 SSE listener 内被调）。

**⚠️ 注意点 4 的实现**：由于 autoOpenDrawer 的触发点在 `use-sse.ts` 侧而非 store 侧，这条断言通过 "不调用 autoOpenDrawer 只调用 setTodos" 的组合来验证——保证 autoOpen 语义不会被意外绑到 setTodos action 内部（planner 实现 store 时要把 "autoOpen 与 setTodos 解耦" 作为硬约束）。

---

### `frontend/src/stores/__tests__/chat-store.todos.test.ts` (new — setTodos / 初值)

**Analog:** 同上（无直接 chat-store 测试先例）

**Phase 11 覆盖点（聚焦：setTodos 本身的契约）：**
1. 初始 `todos === []`。
2. `setTodos([{content:"a", status:"pending"}])` → state.todos 长度 1 且内容匹配。
3. `setTodos(newList)` 整体覆盖（不是 merge）：先 setTodos A=3 条，再 setTodos B=2 条，期末只剩 B 的 2 条。
4. `setTodos([])` 能清空（对应 SSE 收到 `{todos: []}` 的边界）。

---

### `frontend/src/stores/__tests__/chat-store.session-switch.test.ts` (new — 会话切换路径联动 todos)

**Analog:** 同上

**为何拆单独文件**：会话切换路径的 todos 联动跨 `loadHistory` / `reset` 两个 action 边界，且涉及 `setCurrentTaskId` / `messages` 共同变更。单列文件便于审"会话切换时 todos 是否跟着切"这一用户可见事实。

**Phase 11 覆盖点：**
1. **loadHistory 注入 todos**：调 `loadHistory({ messages: [m1, m2], todos: [t1, t2] })` → state 内 `messages.length === 2` 且 `todos.length === 2`。
2. **loadHistory 空 todos**：调 `loadHistory({ messages: [], todos: [] })` → state.todos === `[]`（对应新建会话空态）。
3. **reset 清空 todos**：先通过 setTodos 注入 2 条，再 `reset()` → state.todos === `[]`。
4. **loadHistory 覆盖而非 merge**：先 setTodos 注入 3 条，再 `loadHistory({ messages: [], todos: [only_one] })` → state.todos 长度 1（验证 loadHistory 是全量替换）。
5. **loadHistory 同时清 currentTaskId**（老测试已覆盖 messages/status，此处只加 todos 断言作冒烟）。

---

### `frontend/src/hooks/__tests__/use-sse.todo.test.ts` (new — optional)

**Analog:** 无（项目无现存 hook 测试）

**状态：**
- RESEARCH.md Validation 表将其标记为 "❌ Wave 0（use-sse 现无测试文件；可选，非强制）"。
- 实现需要：① `environment: "jsdom"` + EventSource polyfill 或 mock，② vitest.config include 扩展为 `src/**/__tests__/**/*.test.{ts,tsx}`。
- 建议 planner 将此项放入"可选 Wave"或跳过，改用手工 UAT 验证 SSE todo 事件（CONTEXT.md 明确提过 UI Checker 会手动验首次 auto-open / 手动关闭后不再弹）。

---

### `frontend/src/components/todo/__tests__/todo-item.test.tsx` (new — optional)

**Analog:** 无（项目无 .tsx 测试先例）

**状态：**
- 需要引入 `@testing-library/react` + `@testing-library/jest-dom` + `environment: "jsdom"`，是较重的基建投入。
- RESEARCH.md 将其标记为"建议但非强制"。
- planner 应评估 ROI：三态渲染手工 UAT 视觉走查即可；单测仅在用于阻止未来回归时值得投入。

---

## Shared Patterns

### CSS 变量引用（DESIGN.md token）

**Source:** `frontend/src/app/globals.css:25-27`
**Apply to:** 所有 `frontend/src/components/todo/*.tsx`

```css
--color-bg-panel: #0f1011;
--color-bg-surface: #191a1b;
--color-accent: #5e6ad2;
--color-border-subtle: rgba(255, 255, 255, 0.05);
--color-border-standard: rgba(255, 255, 255, 0.08);
--color-text-secondary: #d0d6e0;
--color-text-tertiary: #8a8f98;
```

**使用模板**（project 惯例）：
```tsx
className="bg-[var(--color-bg-panel)]"
style={{ borderColor: "var(--color-border-standard)" }}
// 亦可 Tailwind 任意值：
className="border-[var(--color-border-subtle)]"
```

**硬约束**：
- 不得字面写 `#5e6ad2` —— 必须 `var(--color-accent)`。
- 不得新增 token 到 globals.css（D-15）—— BLOCKER-1 的解法只能是"改选一个已有 token"（推荐 `--color-border-standard`）。

---

### Lucide icon 使用

**Source:** `tool-pill.tsx:1, 24`; `hitl-card.tsx:4, 32`; `session-item.tsx:3, 46`
**Apply to:** `todo-item.tsx`, `todo-toggle-button.tsx`

**惯例：**
```tsx
import { Check, X, Loader2, Trash2, ListTodo } from "lucide-react";

<Check size={14} aria-hidden="true" className="text-[var(--color-success)]" />
<Trash2 size={14} className="text-[var(--color-text-tertiary)]" />
```

- 永远显式 `size`（not default 24）。
- 装饰性图标 `aria-hidden="true"`；代表状态的用 `aria-label` 在父元素。
- 颜色走 CSS 变量，**不**用 Tailwind 色号。

---

### Zustand store 定义骨架

**Source:** `session-store.ts:25-27, 94-101`; `chat-store.ts:78-82`
**Apply to:** `ui-store.ts`, 以及 `chat-store.ts` 的扩展

**惯例：**
```typescript
import { create } from "zustand";

type StoreState = {
  // state fields
  // actions
};

export const useXStore = create<StoreState>((set, get) => ({
  // initial values
  // action implementations
}));
```

- **actions 返回 `set((state) => ({...}))` 而非直接 `set({...})`** 当需要读当前值时（`session-store.ts:94-101`, `chat-store.ts:85-96`）。
- **不变性**：所有嵌套更新拷贝数组/对象（`session-store.ts:97 [...s.sessions]`, `chat-store.ts:67 [...lastMessage.segments.slice(0, i), ...]`）。
- **初始 state 在顶层**：`sessions: []`, `messages: []`, `todos: []`（待加）。

---

### SSE listener 模板（parse → validate → dispatch）

**Source:** `use-sse.ts:49-111`
**Apply to:** todo listener 新增

**三步模板：**
```typescript
eventSource.addEventListener("<event_type>", (event) => {
  let payload: <PayloadType>;
  try {
    payload = JSON.parse((event as MessageEvent).data);
  } catch {
    return; // 单帧坏数据不应中断流
  }
  if (/* 必要字段缺失 */) {
    return;
  }
  // dispatch to store
  useChatStore.getState().<action>(/* ... */);
});
```

- 解析失败**静默吞**（`token`/`tool` 分支）或**显式 setError**（`hitl` 分支——因为 hitl 丢失会让用户卡死）。**todo 事件丢一帧无害**，采用静默吞。
- deps 数组更新：`use-sse.ts:125-134` 末尾那一串 —— 新增 action 要加到 deps。

---

### 测试 fixture 可选参数扩展

**Source:** `checkpoint_factory.py:57-64`
**Apply to:** `make_checkpoint_tuple` 加 `todos` 参数

**惯例：**
```python
def factory(required: T, optional: U | None = None):
    result = base_shape(required)
    if optional is not None:
        result = merge(optional)
    return result
```

- 默认 `None` 保持现有测试**零改动**。
- `None` 与空 `[]` 语义分离（"字段不存在" vs "字段为空"）。

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `frontend/src/stores/ui-store.ts` persist middleware 部分 | state persistence | localStorage | 项目内零 Zustand persist 先例，`session-store.ts` / `chat-store.ts` 都是纯内存 store。需参照 RESEARCH.md Pattern 3 / zustand 官方文档。Planner 应把实现固化为项目范式。 |

（`use-sse.todo.test.ts` / `todo-item.test.tsx` 虽然也"无 analog"但归为 optional 测试，已在表中注明是否 skip。）

---

## Metadata

**Analog search scope:**
- `frontend/src/stores/` (2 files — chat-store.ts, session-store.ts)
- `frontend/src/hooks/` (2 files — use-sse.ts, use-auto-scroll.ts)
- `frontend/src/components/chat/` (8 files — 取 tool-pill, message-list, chat-area, message-bubble, hitl-card, streaming-dots 作为主要 analog)
- `frontend/src/components/sidebar/` (3 files — session-item, sidebar, session-group)
- `frontend/src/components/layout/` (1 file — app-layout.tsx)
- `frontend/src/components/ui/` (shadcn generated — 作为 button 参考)
- `frontend/src/lib/__tests__/` (1 file — time-group.test.ts 作为唯一 vitest 模板)
- `backend/app/api/` (sessions.py)
- `backend/app/core/` (history.py, streaming.py)
- `backend/app/models/` (chat.py)
- `backend/tests/` (test_history.py, fixtures/checkpoint_factory.py)
- `frontend/src/app/` (page.tsx, globals.css)

**Files scanned:** 20+ (全部 read 验证过 line number 和代码片段)

**Pattern extraction date:** 2026-04-21

**Key project insights surfaced:**
1. **vitest config 限制**：`include` 只匹配 `__tests__/` 目录 + 只认 `.test.ts`；planner 若要测 `.tsx` 组件，必须 Wave 0 扩 config + 引入 jsdom + testing-library。RESEARCH.md 中给的测试路径（`frontend/src/stores/ui-store.test.ts`）会被漏掉。
2. **D-11 落地有两条路径**（A：仅 `TodoModel`；B：同时加 `HistoryResponseModel`）——当前端点未绑定 response_model，planner 需在 plan 中显式选择并说明理由，两条路径都不与 D-11 冲突。
3. **Zustand persist 项目首次落地** —— 应作为后续 UI 持久化范式，在 task notes 中显式固化 key 命名 / hydration 模式 / partialize 规则。
4. **lucide-react v1.8.0 is major v1** —— 与 v0.x 的 API 同，现有用法全部 `<Icon size={N} />` 照旧。
5. **BLOCKER-1 `--color-border-default`** 确认 globals.css 不存在该 token；只能在 `--color-border-subtle` / `--color-border-standard` / `--color-border-focus` 中选，或向用户提案新增。
