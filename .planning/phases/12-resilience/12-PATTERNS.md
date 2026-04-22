# Phase 12: Resilience - Pattern Map

**Mapped:** 2026-04-22
**Files analyzed:** 11 (2 new + 9 modified)
**Analogs found:** 11 / 11

本 Phase 改面极小（CONTEXT.md <specifics>：“在既有管道上叠加一帧事件 + 一个字段 + 一个小组件”）。所有新增/修改文件都能在代码库里找到直接对应的既有模式，Planner 与 Executor 只需**照抄**而非重造。

## File Classification

| File (new / modified) | Role | Data Flow | Closest Analog | Match Quality |
|-----------------------|------|-----------|----------------|---------------|
| `backend/app/api/chat.py` (M) `/stream` | FastAPI endpoint | HTTP → Redis Stream (SSE) | 同文件 `/stream` 现状 + `sessions.py` 中 Depends header 写法 | 自我延伸 |
| `backend/app/api/chat.py` (M) `/resume` | FastAPI endpoint | HTTP → Redis XADD | 同文件 `resume` + `task_bus.publish_event` 既有调用 | 自我延伸 |
| `backend/app/services/task.py` (M) | service | 后台 task 生命周期 | 同文件 `start_resume` | 自我延伸 |
| `backend/app/infra/task_bus.py` | infra | Redis Streams 只读 | （只读，不改） | n/a |
| `backend/tests/test_resilience.py` (NEW) | test | 集成测试 | `backend/tests/test_api/test_chat.py` + `backend/tests/test_api_sessions.py` + `backend/tests/test_history.py` | exact |
| `frontend/src/hooks/use-sse.ts` (M) | hook | EventSource → zustand store | 同文件 `hitl` / `todo` listener | 自我延伸 |
| `frontend/src/stores/chat-store.ts` (M) | store | React state | 同文件 `setTodos` / `updateHitlStatus` / `loadHistory` | 自我延伸 |
| `frontend/src/stores/session-store.ts` (M, 视需要) | store | React state | 同文件 `upsertSession` + `last_task_id` 字段 | 自我延伸 |
| `frontend/src/lib/api.ts` (M, 视需要) | lib | HTTP client | 同文件 `loadHistory` + types.ts `HistoryResponse` | 自我延伸 |
| `frontend/src/components/layout/reconnect-banner.tsx` (NEW) | component | React state → UI | `frontend/src/components/todo/todo-toggle-button.tsx`（小而克制的单文件组件）+ `todo-drawer.tsx` header | role-match |
| `frontend/src/components/chat/chat-area.tsx` (M) | component | 顶栏挂载 | 同文件 header 现状（已挂 `TodoToggleButton`） | 自我延伸 |
| `frontend/src/app/page.tsx` (M) | app orchestrator | 装配 | 同文件 `handleSwitch` reattach 分支 | 自我延伸 |
| `frontend/src/stores/__tests__/chat-store.*.test.ts` (NEW) | test | vitest unit | `chat-store.todos.test.ts` / `chat-store.session-switch.test.ts` / `ui-store.autoopen.test.ts` | exact |

---

## Pattern Assignments

### 1. `backend/app/api/chat.py` (M) — `/api/chat/stream/{task_id}` 新增 Last-Event-ID header

**Analog:** 同文件现状 + FastAPI 官方 Depends/Header 语义

**当前代码** (`backend/app/api/chat.py:96-121`)：
```python
@router.get("/stream/{task_id}")
async def stream(task_id: str, from_id: str = Query("0")):
    """
    SSE 端点。从 Redis Stream 读取任务事件并推送给客户端。

    from_id: 起始位置。"0" 从头读（客户端首次连接）；重连时传入上次最后一条
    事件的 id（SSE 的 Last-Event-ID）。这样客户端断开再连接不会丢失事件。
    """
    meta = await task_bus.get_task_meta(task_id)
    if meta is None:
        raise HTTPException(status_code=404, detail=f"task {task_id} 不存在或已过期")

    async def event_stream():
        async for entry_id, event, data in task_bus.read_events(task_id, from_id=from_id):
            yield _format_sse(event, data, entry_id=entry_id)
            if event in ("done", "error"):
                return
    ...
```

**Phase 12 应扩展为（D-01 / D-05）**：
- 注入 `last_event_id: str | None = Header(default=None, alias="Last-Event-ID")`
- 签名改为 `from_id: str | None = Query(default=None)`
- endpoint 内解析：`effective_from_id = from_id if from_id is not None else (last_event_id or "0")` —— query > header > "0"
- 其余行为保持不变；`task_bus.read_events(task_id, from_id=effective_from_id)` 已支持续传
- 注意：`fastapi.Header` 需要从顶部 import 语句加入（`from fastapi import APIRouter, Depends, HTTPException, Query, Header`）

**Error handling pattern（复用 `backend/app/api/chat.py:104-106`）**：
```python
meta = await task_bus.get_task_meta(task_id)
if meta is None:
    raise HTTPException(status_code=404, detail=f"task {task_id} 不存在或已过期")
```

---

### 2. `backend/app/api/chat.py` (M) — `/api/chat/resume` 成功后 publish `hitl_resolved`

**Analog:** 同文件 `resume` 现状 + `task_bus.publish_event` 既有调用（`backend/app/services/task.py:118`）

**当前代码** (`backend/app/api/chat.py:61-93`)：
```python
@router.post("/resume", response_model=TaskCreatedResponse)
async def resume(
    request: ResumeRequest,
    task_svc: TaskService = Depends(get_task_service),
    session_svc: SessionService = Depends(get_session_service),
):
    meta = await task_bus.get_task_meta(request.task_id)
    if meta is None:
        raise HTTPException(status_code=404, detail=f"task {request.task_id} 不存在或已过期")
    if meta["status"] != task_bus.STATUS_INTERRUPTED:
        raise HTTPException(
            status_code=400,
            detail=f"task {request.task_id} 当前状态 {meta['status']}，无法恢复",
        )

    command_data = build_decisions(
        request.response_type, request.args, request.action_requests or []
    )
    await task_svc.start_resume(request.task_id, command_data)
    await session_svc.touch(meta["session_id"], meta["user_id"])
    return TaskCreatedResponse(...)
```

**Phase 12 应扩展为（D-02 / D-06）**：
在 `await task_svc.start_resume(...)` **成功后**、`return TaskCreatedResponse(...)` **之前**插入：
```python
# Phase 12 D-02: 向事件流写一帧 hitl_resolved，让前端 from_id=0 重放时
# 能把对应 pending HitlSegment 收敛为终态（修复 Phase 10 G-01）
action_req = (request.action_requests or [{}])[0]
await task_bus.publish_event(
    request.task_id,
    "hitl_resolved",
    {
        "tool_name": action_req.get("name"),
        "call_id": action_req.get("id"),
        "decision": request.response_type,   # "approve" | "edit" | "reject"
        "ts": time.time(),
    },
)
```
- 复用 `task_bus.publish_event`（`backend/app/infra/task_bus.py:70-78`），**无需新函数**。
- **Claude's Discretion**：也可以落在 `TaskService.start_resume` 里（D-07），需要把 `action_requests` 从 API 层透传。推荐落在 API 层——signature 更干净、与 resume 响应时序一致、不把 HTTP DTO 泄漏进 service。
- `tool_name` / `call_id` 都可能为 None（`ResumeRequest.action_requests` 是 `Optional[list]`），这点契合 `frontend` 定位逻辑用的是 “最近一条 pending HITL”（不依赖 `tool_name` 精确匹配）。

**新事件契约（CONTEXT §canonical_refs SSE 事件契约）**：
```
event: hitl_resolved
data: {"tool_name": "maps_search", "call_id": "abc-123", "decision": "approve", "ts": 1713789012.345}
```
事件名不放入 `streaming.py::EVT_*` 常量（只读使用，防止误把它当作 Agent 侧事件），直接写字面量 `"hitl_resolved"` 就好。

---

### 3. `backend/app/services/task.py` (M，仅当 Planner 选择 D-07 路线) — 透传 tool_name / call_id

**Analog:** 同文件 `start_resume` (`backend/app/services/task.py:78-100`)：
```python
async def start_resume(
    self,
    task_id: str,
    command_data: dict,
) -> None:
    """恢复已有的中断任务（保持同一 task_id，继续写入同一事件流）"""
    meta = await task_bus.get_task_meta(task_id)
    ...
    await task_bus.set_task_status(task_id, task_bus.STATUS_RUNNING)

    bg = asyncio.create_task(
        self._run_agent(task_id, Command(resume=command_data), meta["session_id"], None),
        name=f"agent-resume-{task_id}",
    )
```

**若 Planner 选落点 B（publish 放 service）**：
- `start_resume(task_id, command_data, *, tool_name=None, call_id=None, decision=None)`
- 在 `set_task_status(STATUS_RUNNING)` 之前 / 之后（与 `create_task` 同级）调 `await task_bus.publish_event(task_id, "hitl_resolved", {...})`
- 推荐 API 层落（方案 A），service 层只关心 agent lifecycle，不关心前端契约事件。

---

### 4. `backend/tests/test_resilience.py` (NEW) — 集成测试

**Analog:** `backend/tests/test_api/test_chat.py`（API 路由 happy-path） + `backend/tests/test_api_sessions.py`（endpoint 详细语义测试） + `backend/tests/test_history.py`（checkpointer monkeypatch 风格）

**Imports pattern (`backend/tests/test_api/test_chat.py:1-8`)**：
```python
"""chat API 集成测试 — 通过 dependency_overrides 注入 mock 验证 DI 可行"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
```

**Conftest fixtures available** (`backend/tests/conftest.py:40-94`)：
- `mock_task_service`: `start_invoke` / `start_resume` / `cancel_all` 均已 AsyncMock
- `mock_session_service`: `session_exists` / `touch` / `get_session` / ... 均已 AsyncMock
- `client`: `httpx.AsyncClient` + ASGITransport，已装好 dependency_overrides

**Test case 1 — Last-Event-ID header 解析**（D-13.1）：
```python
@pytest.mark.asyncio
async def test_stream_last_event_id_header_fallback(client):
    """D-01：header 存在且 query 缺省时，read_events 收到 header 值"""
    from unittest.mock import patch, AsyncMock

    async def empty_gen(*_args, **_kwargs):
        if False:
            yield
    with patch("app.api.chat.task_bus") as mock_bus:
        mock_bus.get_task_meta = AsyncMock(return_value={
            "task_id": "t1", "user_id": "u", "session_id": "s", "status": "running",
        })
        mock_bus.read_events = empty_gen
        # 发送 Last-Event-ID header，不传 from_id query
        resp = await client.get(
            "/api/chat/stream/t1",
            headers={"Last-Event-ID": "1700000000000-3"},
        )
        # read_events 被调用时 from_id 应是 header 值
        # 断言调用参数（用 MagicMock 包一层即可）
        ...
```

注意：`read_events` 是 `AsyncGenerator`，不能直接用 `AsyncMock(return_value=...)` 替换；参考 `backend/tests/test_history.py:134-139` 风格，建议用 module-level `monkeypatch.setattr(history_mod.task_bus, "get_task_meta", AsyncMock(...))` + 自定义 async generator 替换 `task_bus.read_events`。

**Test case 2 — query > header > "0" 优先级**（D-13.1）：
同上，额外传 `?from_id=5`，断言 read_events 收到 `"5"` 而非 header 值。

**Test case 3 — resume 后出现 hitl_resolved 帧**（D-13.2）：
```python
@pytest.mark.asyncio
async def test_resume_publishes_hitl_resolved(client, mock_task_service):
    from unittest.mock import patch, AsyncMock
    captured: list[tuple] = []

    async def fake_publish(task_id, event, data):
        captured.append((task_id, event, data))
        return "1700-0"

    with patch("app.api.chat.task_bus") as mock_bus:
        mock_bus.get_task_meta = AsyncMock(return_value={
            "task_id": "t1", "user_id": "u", "session_id": "s",
            "status": "interrupted",
        })
        mock_bus.publish_event = fake_publish
        resp = await client.post(
            "/api/chat/resume",
            json={
                "task_id": "t1",
                "response_type": "approve",
                "action_requests": [{"name": "maps_search", "id": "call-1"}],
            },
        )
    assert resp.status_code == 200
    events = [e for (_tid, e, _d) in captured]
    assert "hitl_resolved" in events
    data = next(d for (_tid, e, d) in captured if e == "hitl_resolved")
    assert data["tool_name"] == "maps_search"
    assert data["call_id"] == "call-1"
    assert data["decision"] == "approve"
    assert "ts" in data
```

**Test case 4 — reattach from_id=0 on interrupted task**（D-13.3）：
沿用 `test_history.py` 的 `monkeypatch.setattr(history_mod.task_bus, "get_task_meta", AsyncMock(...))` 风格，验证在 `status=interrupted` 的 task 上 `/stream` 端点能正确从头读 stream 且至少回放一条 hitl 事件。

**Error handling pattern (`backend/tests/test_api/test_chat.py:23-31`)**：
```python
@pytest.mark.asyncio
async def test_resume_not_found(client):
    with patch("app.api.chat.task_bus") as mock_bus:
        mock_bus.get_task_meta = AsyncMock(return_value=None)
        resp = await client.post(
            "/api/chat/resume",
            json={"task_id": "nonexistent", "response_type": "approve"},
        )
    assert resp.status_code == 404
```

---

### 5. `frontend/src/hooks/use-sse.ts` (M) — 新 `hitl_resolved` listener + connectionStatus

**Analog:** 同文件 `hitl` listener (`use-sse.ts:101-115`) 与 `todo` listener (`use-sse.ts:117-140`)

**现有 listener 写法 (`use-sse.ts:117-140`)**：
```typescript
eventSource.addEventListener("todo", (event) => {
  let payload: { todos?: unknown };
  try {
    payload = JSON.parse((event as MessageEvent).data);
  } catch {
    return; // 单帧坏数据不应中断流
  }
  if (!Array.isArray(payload.todos)) {
    return;
  }
  const validTodos: Todo[] = payload.todos.filter(
    (t: unknown): t is Todo =>
      typeof t === "object" &&
      t !== null &&
      typeof (t as { content?: unknown }).content === "string" &&
      ((t as { status?: unknown }).status === "pending" || ...),
  );
  setTodos(validTodos);
  if (validTodos.length > 0) {
    autoOpenDrawer(sessionId);
  }
});
```

**Phase 12 新增 `hitl_resolved` listener（D-08）**：
```typescript
eventSource.addEventListener("hitl_resolved", (event) => {
  let payload: { decision?: string; tool_name?: string | null };
  try {
    payload = JSON.parse((event as MessageEvent).data);
  } catch {
    return;
  }
  const decision = payload.decision;
  if (decision === "approve") {
    resolveLastPendingHitl("approved");
  } else if (decision === "reject") {
    resolveLastPendingHitl("rejected");
  } else if (decision === "edit") {
    resolveLastPendingHitl("approved");  // edit 视为批准的变体
  }
});
```

**onerror 细化（D-08 后半）**：
现有 `onerror` (`use-sse.ts:142-149`)：
```typescript
eventSource.onerror = () => {
  eventSource.close();
  if (!receivedTerminalEvent) {
    setError("流式连接中断，请检查后端日志或模型配置");
  } else {
    setStatus("idle");
  }
};
```

**Phase 12 修正**：
```typescript
eventSource.onerror = () => {
  if (receivedTerminalEvent) {
    eventSource.close();
    setStatus("idle");
    return;
  }
  // 未收终态事件 → 浏览器正在自动重连（readyState === 2 / CONNECTING）
  // 不关闭 eventSource、不调 setError（保留 setError 给后端 data 事件里明确的 error 帧）
  setConnectionStatus("reconnecting");
};
```
**注意：不要 `eventSource.close()`**（那会终止浏览器自动重连）。浏览器会在大约 3s 后自动重连，并在请求 header 里携带 `Last-Event-ID`——这正是 D-01 要消费的。

**重连成功回切 connectionStatus（D-08）**：
在**所有** `addEventListener(...)` 回调的第一行加 `setConnectionStatus("connected")`，或更简洁：在 `addEventListener` 之外包一层：
```typescript
const handleAnyFrame = () => setConnectionStatus("connected");
["token", "tool", "hitl", "hitl_resolved", "todo", "done"].forEach(evt =>
  eventSource.addEventListener(evt, handleAnyFrame)
);
```
推荐在 token / tool / hitl / hitl_resolved / todo / done 各自 listener 开头显式调用（Phase 11 的 todo listener 已经是这种“每个 listener 自成一体”的风格；添加一个辅助变量更一致）。

**Deps 更新 (`use-sse.ts:154-166`)**：新增依赖 `setConnectionStatus` / `resolveLastPendingHitl`。

---

### 6. `frontend/src/stores/chat-store.ts` (M) — connectionStatus + resolveLastPendingHitl

**Analog:** 同文件 `updateHitlStatus` (`chat-store.ts:219-279`) 与 `setTodos` (`chat-store.ts:302`)

**State 字段扩展 (`chat-store.ts:4-24` 的 ChatState 类型)**：
```typescript
// 在 ChatState 类型定义里加：
connectionStatus: "connected" | "reconnecting";
setConnectionStatus: (status: "connected" | "reconnecting") => void;
resolveLastPendingHitl: (decision: HitlStatus) => void;
```
注意 `decision` 类型只会是 `"approved" | "rejected" | "feedback"`（不会是 `"pending"`）；仍然复用 `HitlStatus` 方便调用。

**初始 state (`chat-store.ts:80-85`)**：
```typescript
messages: [],
todos: [],
status: "idle",
currentTaskId: null,
errorMessage: null,
connectionStatus: "connected",   // 新增
```

**Action: setConnectionStatus**（简单的 set）：
```typescript
setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
```

**Action: resolveLastPendingHitl** —— 沿用 `updateHitlStatus` 的“从后向前扫、找最近 pending”模式 (`chat-store.ts:231-245`)：
```typescript
resolveLastPendingHitl: (decision) =>
  set((state) => {
    if (!state.messages.length) return {};
    const nextMessages = [...state.messages];
    const lastMessage = nextMessages[nextMessages.length - 1];
    if (lastMessage.role !== "assistant") return {};

    // 从后向前，找最近一条 status === "pending" 的 hitl segment
    let targetIndex = -1;
    for (let i = lastMessage.segments.length - 1; i >= 0; i--) {
      const s = lastMessage.segments[i];
      if (s.type === "hitl" && s.status === "pending") {
        targetIndex = i;
        break;
      }
    }
    if (targetIndex === -1) return {}; // 幂等：没有 pending 则 no-op

    // 若 decision 是 rejected / feedback，回写同工具名的前置 tool pill 为 rejected
    // （与 updateHitlStatus:252-265 同源逻辑，避免绿✓误导）
    const target = lastMessage.segments[targetIndex];
    const toolName = target.type === "hitl" ? target.toolName : null;
    let toolBackfillIndex = -1;
    if ((decision === "rejected" || decision === "feedback") && toolName) {
      for (let i = targetIndex - 1; i >= 0; i--) {
        const s = lastMessage.segments[i];
        if (s.type === "tool" && s.name === toolName && s.status !== "rejected") {
          toolBackfillIndex = i;
          break;
        }
      }
    }

    const segments = lastMessage.segments.map((segment, index) => {
      if (index === targetIndex && segment.type === "hitl") {
        return { ...segment, status: decision };
      }
      if (index === toolBackfillIndex && segment.type === "tool") {
        return { ...segment, status: "rejected" as const };
      }
      return segment;
    });

    nextMessages[nextMessages.length - 1] = { ...lastMessage, segments };
    return { messages: nextMessages };
  }),
```

**reset / loadHistory 同步** (`chat-store.ts:304-333`)：都要把 `connectionStatus: "connected"` 写回初始值。

**幂等要点（CONTEXT §Established Patterns）**：
- 找不到 pending hitl → 返回 `{}`（Zustand 不触发 re-render）——**这是 G-01 修复的核心幂等保证**
- 多次调用（e.g. reattach 时连续重放多帧 hitl_resolved）最终都收敛到同一状态

---

### 7. `frontend/src/stores/session-store.ts` (M, 视需要) — 扩展 last_task_status

**Analog:** 同文件 `upsertSession` (`session-store.ts:94-101`) + `Session` 类型 (`types.ts:41-48`)

**Claude's Discretion 决策 (CONTEXT D-12 末尾)**：
> “是否把 `loadHistory` 返回体扩展 `last_task_status`（见 D-12）或在前端组合 session + task meta 二次判断（推荐前者，少一跳）”

**推荐：不扩展 session-store**。`page.tsx` 的 `loadHistoryAction` 收尾已经能直接拿到 `hist.active_task?.status` (`HistoryResponse.active_task.status`，`types.ts:50-53` 已有 `ActiveTask` 类型，`page.tsx:79-82` 已在消费)：
```typescript
// page.tsx:79-82 现有
setCurrentTaskId(hist.active_task.task_id);
setStatus(
  hist.active_task.status === "interrupted" ? "interrupted" : "streaming",
);
```

RESIL-02 自然在这条路径上——`page.tsx` 的 `handleSwitch` 已经 `setCurrentTaskId(hist.active_task.task_id)` + `setStatus("interrupted")`，后续 `useSSE` 用 `from_id=0` 重放会复现 hitl pending 卡片，再加上 D-02 的 hitl_resolved 帧收敛——**已经覆盖刷新页面场景**。

**结论：`session-store.ts` 不需要改**。若 Planner 决定为了 UI 骨架显示而保存 `last_task_status`，只需沿 `upsertSession` 同款路径写一个字段即可——但非必要。

---

### 8. `frontend/src/lib/api.ts` (M, 视需要) — `loadHistory` 返回类型

**Analog:** 同文件 `loadHistory` (`api.ts:81-85`) + `types.ts:55-60` 的 `HistoryResponse`

**现状**：
```typescript
export interface HistoryResponse {
  messages: Message[];
  todos: Todo[];
  active_task: ActiveTask | null;   // { task_id, status }
  truncate_after_active_task: boolean;
}
```
**已包含 `active_task.status`**，`page.tsx` 已在消费。**api.ts 与 types.ts 都无需改动**。

---

### 9. `frontend/src/components/layout/reconnect-banner.tsx` (NEW) — 新建

**Analog:** `frontend/src/components/todo/todo-toggle-button.tsx`（小、克制、单一职责的 store 消费组件）+ `frontend/src/components/todo/todo-drawer.tsx` 的 header 样式

**Imports pattern (`todo-toggle-button.tsx:1-3`)**：
```typescript
"use client";
import { useUIStore } from "@/stores/ui-store";
```

**连接状态 banner（D-04 / D-10）**：
```typescript
"use client";
import { useEffect, useState } from "react";
import { useChatStore } from "@/stores/chat-store";

/**
 * Phase 12 D-04 重连反馈 banner。
 * - 仅在 connectionStatus === "reconnecting" 时显示
 * - debounce 1s：避免 token 级微短抖动把 banner 放大成视觉噪音
 * - 文字样式走 DESIGN.md tokens（text-secondary + bg-panel），
 *   不使用警告色（CONTEXT.md D-04：保持 Linear 的克制）
 */
export function ReconnectBanner() {
  const status = useChatStore((s) => s.connectionStatus);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (status === "reconnecting") {
      const t = window.setTimeout(() => setVisible(true), 1000); // debounce 1s
      return () => window.clearTimeout(t);
    } else {
      // 切回 connected 300ms 后消失（D-04）
      const t = window.setTimeout(() => setVisible(false), 300);
      return () => window.clearTimeout(t);
    }
  }, [status]);

  if (!visible && status === "connected") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="
        flex items-center gap-2 px-4 py-1.5
        text-[13px] font-[510] text-[var(--color-text-secondary)]
        bg-[var(--color-bg-panel)]
        border-b border-[var(--color-border-subtle)]
        transition-opacity duration-200
      "
    >
      <span
        aria-hidden="true"
        className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-text-tertiary)] animate-pulse"
      />
      连接中断，正在重连…
    </div>
  );
}
```

**DESIGN.md token 一览（全部来自 `globals.css:11-30`）**：
- 背景：`var(--color-bg-panel)` = `#0f1011`
- 文字：`var(--color-text-secondary)` = `#d0d6e0`（次级文字）/ `var(--color-text-tertiary)` = `#8a8f98`（指示点）
- 边框：`var(--color-border-subtle)` = `rgba(255,255,255,0.05)`
- 字号 13px / 字重 510（DESIGN.md §Typography Caption Large）——与 `todo-drawer.tsx:12-13` 一致
- **不使用**：`color-error` / `color-accent` / 任何警告色——D-04 明文禁止

**无动画要求**：CONTEXT.md 未要求滑入/滑出动画，`transition-opacity` 已足够克制。

---

### 10. `frontend/src/components/chat/chat-area.tsx` (M) — 顶栏挂载 banner

**Analog:** 同文件现状 (`chat-area.tsx:1-18`)：
```typescript
"use client";
import type { ReactNode } from "react";
import { TodoToggleButton } from "@/components/todo/todo-toggle-button";

type ChatAreaProps = {
  children: ReactNode;
};

export function ChatArea({ children }: ChatAreaProps) {
  return (
    <section className="flex h-screen flex-col bg-[var(--color-bg-panel)]">
      <header className="flex items-center justify-end px-4 py-2 border-b border-[var(--color-border-subtle)]">
        <TodoToggleButton />
      </header>
      {children}
    </section>
  );
}
```

**Phase 12 改法（D-11）**：在 header 正上方或下方挂 `<ReconnectBanner />`（banner 自带 `border-b`，挂在 header 上方视觉堆叠即 panel-bg → banner → header → children）：
```typescript
import { ReconnectBanner } from "@/components/layout/reconnect-banner";

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
**原因：**
- Banner 不渲染时 `return null`——不占据空间，`grid` 不变。
- Banner 渲染时挤占 header 上方 ~28px，视觉上是“通知条从顶部滑入”的自然位置。
- 不改变既有 grid 结构（CONTEXT §Integration Points）。

**Claude's Discretion**：也可以把 Banner 放进 `app-layout.tsx:22-30` 全局头部。**不推荐**——那会需要改 `grid-rows` 结构，违反 D-11 “不改变既有 grid 结构”。

---

### 11. `frontend/src/app/page.tsx` (M) — RESIL-02 interrupted 恢复

**Analog:** 同文件 `handleSwitch` reattach 分支 (`page.tsx:54-96`)

**现状** (`page.tsx:71-89`)：
```typescript
if (hist.active_task?.task_id) {
  const last = msgs[msgs.length - 1];
  if (!last || last.role !== "assistant") {
    addAssistantMessage();
  }
  setCurrentTaskId(hist.active_task.task_id);
  setStatus(
    hist.active_task.status === "interrupted" ? "interrupted" : "streaming",
  );
  // G-02 sync
  const existing = useSessionStore.getState().sessions.find((s) => s.id === id);
  if (existing && existing.last_task_id !== hist.active_task.task_id) {
    upsertSession({ ...existing, last_task_id: hist.active_task.task_id });
  }
}
```

**关键发现**：`handleSwitch` 已经处理了 reattach！RESIL-02 的刷新页面路径是 `loadSessions → handleSwitch(list[0].id)` (`page.tsx:140-151`)，**complete path已就绪**。

**Phase 12 无需额外代码，只需补一条测试验证**：
- 进入页面 → 自动 `handleSwitch(latest)` → `hist.active_task.status === "interrupted"` → `setCurrentTaskId` → `useSSE` 触发 → SSE `from_id=0` 重放 hitl pending → (如已 resolve 过) 重放 `hitl_resolved` → `resolveLastPendingHitl` 收敛

D-12 在 CONTEXT 留的“**Claude's Discretion**——Planner 评估是否加字段或在 loadHistory 里判断”——**推荐按当前路径走，不加字段**。Planner 若发现刷新后状态回落不正确，再考虑扩展。

---

### 12. `frontend/src/stores/__tests__/chat-store.*.test.ts` (NEW) — vitest 单元测试

**Analog:** `frontend/src/stores/__tests__/chat-store.todos.test.ts` + `chat-store.session-switch.test.ts` + `ui-store.autoopen.test.ts`

**Imports / setup (`chat-store.todos.test.ts:1-13`)**：
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore } from "@/stores/chat-store";
import type { Todo } from "@/lib/types";

beforeEach(() => {
  useChatStore.setState({
    messages: [],
    todos: [],
    status: "idle",
    currentTaskId: null,
    errorMessage: null,
    connectionStatus: "connected", // Phase 12 新增
  });
});
```

**Test: connectionStatus 状态机（D-14）**：
```typescript
describe("chat-store.connectionStatus", () => {
  it("initial state is 'connected'", () => {
    expect(useChatStore.getState().connectionStatus).toBe("connected");
  });
  it("setConnectionStatus flips between connected and reconnecting", () => {
    useChatStore.getState().setConnectionStatus("reconnecting");
    expect(useChatStore.getState().connectionStatus).toBe("reconnecting");
    useChatStore.getState().setConnectionStatus("connected");
    expect(useChatStore.getState().connectionStatus).toBe("connected");
  });
  it("reset restores connectionStatus to 'connected'", () => {
    useChatStore.getState().setConnectionStatus("reconnecting");
    useChatStore.getState().reset();
    expect(useChatStore.getState().connectionStatus).toBe("connected");
  });
});
```

**Test: resolveLastPendingHitl 幂等性 / 最近一条语义（D-14）**：
```typescript
describe("chat-store.resolveLastPendingHitl", () => {
  it("no-op when no messages", () => {
    useChatStore.getState().resolveLastPendingHitl("approved");
    expect(useChatStore.getState().messages).toEqual([]);
  });

  it("resolves the last pending hitl to approved", () => {
    // 构造一条 assistant message 含一个 pending hitl
    const msg: Message = {
      id: "a1",
      role: "assistant",
      segments: [
        { type: "text", content: "" },
        { type: "hitl", toolName: "maps_search", description: "...", status: "pending", taskId: "t1" },
        { type: "text", content: "" },
      ],
      timestamp: 0,
    };
    useChatStore.setState({ messages: [msg] });
    useChatStore.getState().resolveLastPendingHitl("approved");
    const hitl = useChatStore.getState().messages[0].segments[1];
    expect(hitl.type === "hitl" && hitl.status).toBe("approved");
  });

  it("is idempotent: second call finds no pending, no-op", () => {
    // 调用两次 → 状态只变一次
    ...
  });

  it("multiple pending hitl: targets the last one (最近语义)", () => {
    // 两个 pending → 只有第二个变 approved
    ...
  });

  it("rejected decision backfills preceding same-tool tool pill to rejected", () => {
    // tool(calling) + hitl(pending, toolName='X') → resolve('rejected') → tool status → 'rejected'
    ...
  });
});
```

**断言 state mutation 风格** 参照 `chat-store.session-switch.test.ts:20-65`（`useChatStore.getState().xxx()` + `expect(useChatStore.getState().yyy)...`）

---

## Shared Patterns

### A. SSE 事件 listener 模式（前端）
**Source:** `frontend/src/hooks/use-sse.ts:53-140`
**Apply to:** 新增 `hitl_resolved` listener
```typescript
eventSource.addEventListener("<event_name>", (event) => {
  let payload: { <fields>? };
  try {
    payload = JSON.parse((event as MessageEvent).data);
  } catch {
    return; // 单帧坏数据不应中断流（除非像 hitl 那样无按钮用户卡死，才 setError）
  }
  // validate payload fields, call store action
});
```
**幂等约定**：listener 内只调用 store action，store action 自己处理 no-op 分支（参考 `resolveLastPendingHitl` 模式）。

### B. FastAPI endpoint 错误响应（后端）
**Source:** `backend/app/api/chat.py:74-80, 104-106`
**Apply to:** `/stream` 与 `/resume` 所有异常分支
```python
meta = await task_bus.get_task_meta(task_id)
if meta is None:
    raise HTTPException(status_code=404, detail=f"task {task_id} 不存在或已过期")
```
**Phase 12 无需新增 HTTPException，现有覆盖已足够**（header 解析 fallback 是无害的，缺省回落 `"0"`）。

### C. Redis Streams event publish
**Source:** `backend/app/infra/task_bus.py:70-78`
```python
async def publish_event(task_id: str, event: str, data: dict) -> str:
    client = await _client()
    entry_id = await client.xadd(
        _events_key(task_id),
        {"event": event, "data": json.dumps(data, ensure_ascii=False)},
    )
    await client.expire(_events_key(task_id), settings.task_ttl)
    return entry_id
```
**直接复用**，不新增函数（CONTEXT §code_context §Reusable Assets）。

### D. DESIGN.md Linear token-only 样式（前端）
**Source:** `frontend/src/app/globals.css:11-30` + `frontend/src/components/todo/todo-drawer.tsx:10-25` + `frontend/src/components/chat/chat-area.tsx:11-15`
**Apply to:** `reconnect-banner.tsx`
**硬约束：**
- 背景：`var(--color-bg-panel)` 或 `var(--color-bg-surface)`
- 文字：`var(--color-text-primary/secondary/tertiary/quaternary)` 四级
- 边框：`var(--color-border-subtle/standard/focus)`
- **禁用**：`var(--color-error)` / 任何 warning 色 / 任何自造 token
- 字重：510 / 590；**不用** 700
- 字体：13-15px 为主（CONTEXT D-04 “克制”）

### E. vitest + Zustand store 单元测试
**Source:** `frontend/src/stores/__tests__/chat-store.todos.test.ts:5-13`, `ui-store.autoopen.test.ts:4-18`
```typescript
beforeEach(() => {
  useChatStore.setState({ /* reset initial state */ });
});

it("<assertion>", () => {
  useChatStore.getState().<action>(...);
  expect(useChatStore.getState().<field>).toBe(...);
});
```
**不需要 jsdom / testing-library**（CONTEXT Phase 10 P-03 建立的极简纪律）。

### F. pytest 集成测试 + dependency_overrides
**Source:** `backend/tests/conftest.py:40-94` + `backend/tests/test_api/test_chat.py:10-32`
- 用现有 `client` fixture（已装好 mock 注入）
- 对 `task_bus` 用 `patch("app.api.chat.task_bus")` 替换整体模块
- `AsyncMock` 包所有 async 方法
- **不需要启真实 Redis / Postgres**

### G. Claude Code 工作准则
**Source:** `CLAUDE.md`
**Apply to:** 全体 Phase 12 plans / executions
- 全中文回复
- **外科手术式改动**：每一行改动都应能追溯到 Phase 12 CONTEXT 的某个 D-XX 决策
- **简洁优先**：`reconnect-banner.tsx` 目标 <50 行，不新增 UI 抽象
- **匹配现有风格**：`use-sse.ts` 新 listener 与既有 `hitl` / `todo` listener 同风格，不另开一种
- 不删除与 Phase 12 无关的“周围”死代码

---

## No Analog Found

（空）—— 所有 Phase 12 新增/修改文件都能在现有代码中找到直接对应的模式。

---

## Metadata

**Analog search scope:**
- `backend/app/api/` — FastAPI endpoints
- `backend/app/services/` — 业务服务
- `backend/app/infra/` — Redis / DB infra
- `backend/app/core/` — 事件解析、HITL 决策
- `backend/tests/` — 集成测试模式
- `frontend/src/hooks/` — SSE hook
- `frontend/src/stores/` — Zustand domain-sliced stores
- `frontend/src/components/` — UI 组件（layout / chat / todo）
- `frontend/src/lib/` — api client / types
- `frontend/src/app/globals.css` — DESIGN tokens
- `.planning/phases/08..11` — 前序阶段决策

**Files scanned:** 27

**Pattern extraction date:** 2026-04-22
