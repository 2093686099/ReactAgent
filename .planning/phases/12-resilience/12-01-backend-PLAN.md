---
phase: 12-resilience
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/app/api/chat.py
  - backend/tests/test_resilience.py
autonomous: true
requirements:
  - RESIL-01
  - RESIL-02
tags:
  - sse
  - resilience
  - hitl
  - fastapi

must_haves:
  truths:
    - "浏览器 EventSource 自动重连发来的 Last-Event-ID header 能被后端消费，作为 Redis Streams 读取起点"
    - "当客户端同时传了 ?from_id= query 和 Last-Event-ID header 时，query 优先"
    - "POST /api/chat/resume 成功后，事件流里会出现一条 event=hitl_resolved 帧，payload 含 tool_name / call_id / decision / ts"
    - "对处于 interrupted 状态的 task，/stream 从 from_id=0 重放时能完整回放既有 hitl 帧（支撑 RESIL-02 前端恢复）"
  artifacts:
    - path: "backend/app/api/chat.py"
      provides: "/stream 端点接受 Last-Event-ID header + /resume 后 publish hitl_resolved"
      contains: "Last-Event-ID"
    - path: "backend/tests/test_resilience.py"
      provides: "D-13 三类用例的集成测试"
      min_lines: 80
  key_links:
    - from: "POST /api/chat/resume"
      to: "task_bus.publish_event(task_id, 'hitl_resolved', {...})"
      via: "API 层在 start_resume 成功后 XADD"
      pattern: "publish_event.*hitl_resolved"
    - from: "GET /api/chat/stream/{task_id}"
      to: "task_bus.read_events(task_id, from_id=effective_from_id)"
      via: "query > header > '0' 优先级解析"
      pattern: "Last-Event-ID"
---

<objective>
落地 Phase 12 后端侧所有改动：让 `/api/chat/stream/{task_id}` 支持浏览器 EventSource 自动重连携带的 `Last-Event-ID` header（D-01 / D-05），让 `/api/chat/resume` 成功后向事件流追加一帧 `hitl_resolved`（D-02 / D-06），并用 `backend/tests/test_resilience.py` 覆盖 D-13 的全部场景。

Purpose: RESIL-01（断线续传）的续传起点由这条改动提供；RESIL-02（刷新恢复 HITL）以及 G-01（approve-then-switch HITL 复活）都依赖 `hitl_resolved` 事件作为"前端重放时把 pending HITL 收敛为终态"的信号。改动量极小——两处端点签名细化 + 一个事件帧 + 一组测试——但它是整个 Phase 12 的基础层，前端 plan 12-02 必须依赖本 plan 已合并。
Output: `chat.py` 两处改动（stream header 注入 / resume 后 publish）+ 新测试文件。
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@ARCHITECTURE.md
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/12-resilience/12-CONTEXT.md
@.planning/phases/12-resilience/12-PATTERNS.md

# 直接依赖源文件（必读）
@backend/app/api/chat.py
@backend/app/infra/task_bus.py
@backend/app/services/task.py
@backend/app/models/chat.py
@backend/app/core/streaming.py
@backend/tests/conftest.py
@backend/tests/test_api/test_chat.py
@backend/tests/test_history.py

<interfaces>
<!-- 执行者不需要再探索代码库，以下契约直接照用 -->

# task_bus 可用 API（backend/app/infra/task_bus.py）
# 均为 module-level async 函数，直接从 `app.infra import task_bus` 或在 chat.py 顶部既有的
# `from app.infra import task_bus` 下使用。

async def publish_event(task_id: str, event: str, data: dict) -> str:
    """XADD 一帧事件到 task:{task_id}:events，返回 Redis entry_id。data 会被 json.dumps。"""

async def read_events(
    task_id: str,
    from_id: str = "0",
    block_ms: int = 5000,
) -> AsyncGenerator[tuple[str, str, dict], None]:
    """从 from_id 开始持续读 stream；yield (entry_id, event, data)。"""

async def get_task_meta(task_id: str) -> dict | None:
    """HGETALL task:{task_id}；不存在返回 None。字段包含 task_id / user_id / session_id / status。"""

STATUS_INTERRUPTED = "interrupted"

# ResumeRequest（backend/app/models/chat.py）
class ResumeRequest(BaseModel):
    task_id: str
    response_type: Literal["approve", "edit", "reject"]
    args: dict | None = None
    action_requests: list[dict] | None = None   # [{name: str, id: str | None, args: dict}]

# 现有端点签名（backend/app/api/chat.py:61-93, 96-121）
@router.post("/resume", response_model=TaskCreatedResponse)
async def resume(request: ResumeRequest, task_svc=..., session_svc=...): ...

@router.get("/stream/{task_id}")
async def stream(task_id: str, from_id: str = Query("0")): ...

# SSE 帧格式
# _format_sse(event, data, entry_id=entry_id) 已就绪；entry_id 写入 "id: {entry_id}" 头
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: /stream 端点接受 Last-Event-ID header（query > header > "0"）</name>
  <files>backend/app/api/chat.py</files>

  <read_first>
    - @backend/app/api/chat.py 第 1-30 行（imports 现状）和第 96-121 行（/stream 当前实现）
    - @backend/app/infra/task_bus.py 第 1-90 行（确认 read_events 签名接受 from_id 字符串）
    - @.planning/phases/12-resilience/12-PATTERNS.md §1（直接对应 snippet）
  </read_first>

  <behavior>
    - 当请求带 `Last-Event-ID: 1700000000000-3` header 且未传 `?from_id=`，`read_events` 应被调用时 `from_id="1700000000000-3"`
    - 当同时传了 `?from_id=5` 与 `Last-Event-ID: 1700` header，`read_events` 的 from_id 参数为 `"5"`（query 优先）
    - 当两者都缺省，`read_events` 的 from_id 参数为 `"0"`（默认回落）
    - 404 行为（meta 为 None）保持不变
  </behavior>

  <action>
    1. 编辑 `backend/app/api/chat.py` 顶部 imports，把 `from fastapi import APIRouter, Depends, HTTPException, Query` 加上 `Header`：
       `from fastapi import APIRouter, Depends, HTTPException, Query, Header`
    2. 定位 `/stream/{task_id}` 端点（当前约 96-121 行），把签名从
       `async def stream(task_id: str, from_id: str = Query("0")):`
       改为：
       ```python
       async def stream(
           task_id: str,
           from_id: str | None = Query(default=None),
           last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
       ):
       ```
    3. 在 endpoint 函数体 `meta = await task_bus.get_task_meta(task_id)` 行之前插入解析：
       ```python
       # Phase 12 D-01 / D-05：query > header > "0"。浏览器 EventSource 自动重连时会在
       # HTTP header 里带 Last-Event-ID，这条 fallback 让服务端无须前端改动就能续传。
       effective_from_id = from_id if from_id is not None else (last_event_id or "0")
       ```
    4. 把下方 `async for entry_id, event, data in task_bus.read_events(task_id, from_id=from_id):`
       里的 `from_id=from_id` 改为 `from_id=effective_from_id`。
    5. docstring 同步更新，提示 query > header > "0" 的语义（保持简洁）。

    约束（per CONTEXT + CLAUDE.md 外科手术式）：
    - 不修改 `/stream` 的 404 / 事件循环主体；不动 `_format_sse`；不动 `task_bus`
    - 不加日志层（endpoint 现状没有 logger；保持一致）
    - 不引入 pydantic 模型表示 header —— Header 函数形参即可
  </action>

  <verify>
    <automated>cd backend && pytest tests/test_resilience.py::test_stream_uses_last_event_id_when_query_missing tests/test_resilience.py::test_stream_prefers_query_over_header tests/test_resilience.py::test_stream_defaults_to_zero -x</automated>
  </verify>

  <acceptance_criteria>
    - `from fastapi import ... Header` 存在
    - `/stream` 签名含 `last_event_id: str | None = Header(default=None, alias="Last-Event-ID")`
    - 端点函数体出现 `effective_from_id = from_id if from_id is not None else (last_event_id or "0")`
    - `read_events` 调用传入 `from_id=effective_from_id`
    - Task 3 的三个 test 全绿
    - 既有 `backend/tests/test_api/test_chat.py` 全部保持绿（未回归）
  </acceptance_criteria>

  <done>
    /stream 在 query 缺省时能用 Last-Event-ID header 作为续传起点；query 优先；双缺省回落 "0"；既有 404 行为不变；相关 pytest 全绿。
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: /resume 成功后 XADD hitl_resolved 事件帧</name>
  <files>backend/app/api/chat.py</files>

  <read_first>
    - @backend/app/api/chat.py 第 61-93 行（/resume 当前实现）和顶部 imports
    - @backend/app/infra/task_bus.py 第 70-78 行（publish_event 签名）
    - @.planning/phases/12-resilience/12-PATTERNS.md §2（直接对应 snippet）
    - @.planning/phases/12-resilience/12-CONTEXT.md D-02 与 additional_constraints（**禁止**在 payload 里加 `edited_args`）
  </read_first>

  <behavior>
    - 任何 response_type ∈ {"approve", "edit", "reject"} 的成功 resume 请求，在响应返回前向 `task:{task_id}:events` XADD 一帧
      `event="hitl_resolved"`, `data={tool_name, call_id, decision, ts}`
    - `tool_name` / `call_id` 从 `request.action_requests[0]` 取；若 `action_requests` 缺省或为空，两者皆为 `None`
    - `decision` 即 `request.response_type` 字面量；`ts` 为 `time.time()`
    - payload **只能**含上述 4 个字段，不得带 `edited_args`（CONTEXT additional_constraints 硬约束）
    - 404 / 400（state 非 interrupted）分支原地保持，不发 `hitl_resolved`
  </behavior>

  <action>
    1. 编辑 `backend/app/api/chat.py` 顶部 imports，加 `import time`（若已存在则跳过）
    2. 定位 `/resume` endpoint（当前约 61-93 行）。在
       ```python
       await task_svc.start_resume(request.task_id, command_data)
       await session_svc.touch(meta["session_id"], meta["user_id"])
       ```
       这两行**之间**插入（放在 start_resume 之后、touch 之前，保证 resume 成功才发；顺序不关键但挨着 start_resume 便于阅读）：
       ```python
       # Phase 12 D-02 / D-06：向事件流写一帧 hitl_resolved，让前端 from_id=0 重放时
       # 能把对应 pending HitlSegment 收敛为终态（=G-01 修复信号）。
       # 事件 payload 刻意最小化，不携带 edited_args（见 CONTEXT additional_constraints）。
       action_req = (request.action_requests or [{}])[0]
       await task_bus.publish_event(
           request.task_id,
           "hitl_resolved",
           {
               "tool_name": action_req.get("name"),
               "call_id": action_req.get("id"),
               "decision": request.response_type,
               "ts": time.time(),
           },
       )
       ```
    3. 不修改 `/resume` 的 404 / 400 早退分支、不修改 `build_decisions` 调用、不改响应体。
    4. **落点选择** per CONTEXT D-07 + PATTERNS §3：publish 留在 API 层，不下沉到 `TaskService`（service 层只关心 agent lifecycle，不污染前端事件契约；也避免把 HTTP DTO 泄漏进 service）。`backend/app/services/task.py` 本 plan **不动**。

    约束：
    - 事件名字面量 `"hitl_resolved"`，不写进 `streaming.py::EVT_*` 常量（那些属于 Agent 侧事件，见 PATTERNS §2 末尾）
    - 不扩展 `ResumeRequest` 模型
    - 不加 try/except 吞异常 —— publish 失败应让请求 5xx（既有 FastAPI 默认异常处理即可）
  </action>

  <verify>
    <automated>cd backend && pytest tests/test_resilience.py::test_resume_publishes_hitl_resolved_approve tests/test_resilience.py::test_resume_publishes_hitl_resolved_reject tests/test_resilience.py::test_resume_without_action_requests_still_publishes -x</automated>
  </verify>

  <acceptance_criteria>
    - `/resume` 在 `start_resume` 成功后、`return` 之前调用 `task_bus.publish_event(request.task_id, "hitl_resolved", {...})`
    - payload 含且仅含 `tool_name / call_id / decision / ts` 四个 key
    - `decision` 是 `request.response_type` 原值（不做映射）
    - `request.action_requests` 缺省 / 空列表时，`tool_name` 和 `call_id` 都为 `None`，事件照发
    - 404 / 400 分支不发事件（通过 Task 3 的早退 fixture 验证间接覆盖）
    - `backend/app/services/task.py` 在本 plan 内保持零改动
    - 既有 `backend/tests/test_api/test_chat.py` 全部保持绿
  </acceptance_criteria>

  <done>
    /resume happy-path 一定发 hitl_resolved；payload 严格按契约；既有错误分支不变；既有测试不回归。
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: backend/tests/test_resilience.py 覆盖 D-13 全部场景</name>
  <files>backend/tests/test_resilience.py</files>

  <read_first>
    - @backend/tests/conftest.py（了解 `client` / `mock_task_service` / `mock_session_service` fixtures）
    - @backend/tests/test_api/test_chat.py（dependency_overrides + `patch("app.api.chat.task_bus")` 模式）
    - @backend/tests/test_history.py 第 130-150 行附近（async generator monkeypatch 模式；`read_events` 是 AsyncGenerator，不能直接 AsyncMock）
    - @.planning/phases/12-resilience/12-PATTERNS.md §4（完整 test 骨架）
    - @.planning/phases/12-resilience/12-CONTEXT.md D-13（测试覆盖清单）
  </read_first>

  <behavior>
    测试覆盖三组场景：
    - 组 A：`/stream` 的 from_id 优先级（3 个 test）
    - 组 B：`/resume` publish hitl_resolved（3 个 test：approve / reject / action_requests 缺省）
    - 组 C：reattach 到 interrupted task 的 from_id=0 重放（1 个 test；用自定义 async generator mock `read_events`）
  </behavior>

  <action>
    新建 `backend/tests/test_resilience.py`，按以下骨架实现（直接照抄 PATTERNS §4 模式 + 下方补全细节）：

    ```python
    """Phase 12 Resilience — /stream Last-Event-ID fallback + /resume hitl_resolved 集成测试"""
    from __future__ import annotations

    from unittest.mock import AsyncMock, MagicMock, patch

    import pytest


    def _empty_async_gen():
        async def gen(*_args, **_kwargs):
            if False:
                yield  # pragma: no cover
        return gen


    # ────────────────────────────────────────────────────────────────────
    # 组 A：/stream from_id 优先级（D-13.1）
    # ────────────────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_stream_uses_last_event_id_when_query_missing(client):
        """query 缺省 + header 存在 → read_events 收到 header 值"""
        read_calls = []

        async def fake_read_events(task_id, *, from_id="0", block_ms=5000):
            read_calls.append(from_id)
            return
            yield  # pragma: no cover

        with patch("app.api.chat.task_bus") as mock_bus:
            mock_bus.get_task_meta = AsyncMock(return_value={
                "task_id": "t1", "user_id": "u", "session_id": "s", "status": "running",
            })
            mock_bus.read_events = fake_read_events
            resp = await client.get(
                "/api/chat/stream/t1",
                headers={"Last-Event-ID": "1700000000000-3"},
            )
        assert resp.status_code == 200
        assert read_calls == ["1700000000000-3"]


    @pytest.mark.asyncio
    async def test_stream_prefers_query_over_header(client):
        """query=5 + header=1700 → read_events 收到 '5'"""
        read_calls = []

        async def fake_read_events(task_id, *, from_id="0", block_ms=5000):
            read_calls.append(from_id)
            return
            yield  # pragma: no cover

        with patch("app.api.chat.task_bus") as mock_bus:
            mock_bus.get_task_meta = AsyncMock(return_value={
                "task_id": "t1", "user_id": "u", "session_id": "s", "status": "running",
            })
            mock_bus.read_events = fake_read_events
            resp = await client.get(
                "/api/chat/stream/t1?from_id=5",
                headers={"Last-Event-ID": "1700000000000-3"},
            )
        assert resp.status_code == 200
        assert read_calls == ["5"]


    @pytest.mark.asyncio
    async def test_stream_defaults_to_zero(client):
        """query 和 header 都缺省 → read_events 收到 '0'"""
        read_calls = []

        async def fake_read_events(task_id, *, from_id="0", block_ms=5000):
            read_calls.append(from_id)
            return
            yield  # pragma: no cover

        with patch("app.api.chat.task_bus") as mock_bus:
            mock_bus.get_task_meta = AsyncMock(return_value={
                "task_id": "t1", "user_id": "u", "session_id": "s", "status": "running",
            })
            mock_bus.read_events = fake_read_events
            resp = await client.get("/api/chat/stream/t1")
        assert resp.status_code == 200
        assert read_calls == ["0"]


    # ────────────────────────────────────────────────────────────────────
    # 组 B：/resume publish hitl_resolved（D-13.2）
    # ────────────────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_resume_publishes_hitl_resolved_approve(client, mock_task_service, mock_session_service):
        captured: list[tuple[str, str, dict]] = []

        async def fake_publish(task_id, event, data):
            captured.append((task_id, event, data))
            return "1700-0"

        with patch("app.api.chat.task_bus") as mock_bus:
            mock_bus.get_task_meta = AsyncMock(return_value={
                "task_id": "t1", "user_id": "u", "session_id": "s",
                "status": "interrupted",
            })
            mock_bus.STATUS_INTERRUPTED = "interrupted"
            mock_bus.publish_event = fake_publish
            resp = await client.post(
                "/api/chat/resume",
                json={
                    "task_id": "t1",
                    "response_type": "approve",
                    "action_requests": [{"name": "maps_search", "id": "call-1", "args": {}}],
                },
            )
        assert resp.status_code == 200
        resolved = [d for (_tid, e, d) in captured if e == "hitl_resolved"]
        assert len(resolved) == 1
        data = resolved[0]
        assert set(data.keys()) == {"tool_name", "call_id", "decision", "ts"}
        assert data["tool_name"] == "maps_search"
        assert data["call_id"] == "call-1"
        assert data["decision"] == "approve"
        assert isinstance(data["ts"], float)


    @pytest.mark.asyncio
    async def test_resume_publishes_hitl_resolved_reject(client, mock_task_service, mock_session_service):
        captured: list[tuple[str, str, dict]] = []

        async def fake_publish(task_id, event, data):
            captured.append((task_id, event, data))
            return "1700-0"

        with patch("app.api.chat.task_bus") as mock_bus:
            mock_bus.get_task_meta = AsyncMock(return_value={
                "task_id": "t1", "user_id": "u", "session_id": "s",
                "status": "interrupted",
            })
            mock_bus.STATUS_INTERRUPTED = "interrupted"
            mock_bus.publish_event = fake_publish
            resp = await client.post(
                "/api/chat/resume",
                json={
                    "task_id": "t1",
                    "response_type": "reject",
                    "action_requests": [{"name": "maps_search", "id": "call-1", "args": {}}],
                },
            )
        assert resp.status_code == 200
        data = next(d for (_tid, e, d) in captured if e == "hitl_resolved")
        assert data["decision"] == "reject"


    @pytest.mark.asyncio
    async def test_resume_without_action_requests_still_publishes(client, mock_task_service, mock_session_service):
        """action_requests 缺省时，tool_name 和 call_id 为 None，事件仍发"""
        captured: list[tuple[str, str, dict]] = []

        async def fake_publish(task_id, event, data):
            captured.append((task_id, event, data))
            return "1700-0"

        with patch("app.api.chat.task_bus") as mock_bus:
            mock_bus.get_task_meta = AsyncMock(return_value={
                "task_id": "t1", "user_id": "u", "session_id": "s",
                "status": "interrupted",
            })
            mock_bus.STATUS_INTERRUPTED = "interrupted"
            mock_bus.publish_event = fake_publish
            resp = await client.post(
                "/api/chat/resume",
                json={"task_id": "t1", "response_type": "approve"},
            )
        assert resp.status_code == 200
        data = next(d for (_tid, e, d) in captured if e == "hitl_resolved")
        assert data["tool_name"] is None
        assert data["call_id"] is None
        assert data["decision"] == "approve"


    # ────────────────────────────────────────────────────────────────────
    # 组 C：reattach from_id=0 on interrupted task 能重放 hitl（D-13.3）
    # ────────────────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_stream_reattach_interrupted_replays_hitl(client):
        """interrupted task + from_id=0 → read_events 能把历史 hitl 帧推给客户端"""

        async def fake_read_events(task_id, *, from_id="0", block_ms=5000):
            # 模拟历史上有一条 hitl 待审批 + 一条 done（让流正常结束）
            yield ("1700-0", "hitl", {"action_requests": [{"name": "maps_search", "id": "call-1"}]})
            yield ("1700-1", "done", {})

        with patch("app.api.chat.task_bus") as mock_bus:
            mock_bus.get_task_meta = AsyncMock(return_value={
                "task_id": "t1", "user_id": "u", "session_id": "s",
                "status": "interrupted",
            })
            mock_bus.read_events = fake_read_events
            resp = await client.get("/api/chat/stream/t1")
        assert resp.status_code == 200
        body = resp.text
        # SSE 帧里应能看到 hitl 事件名，验证重放路径通畅
        assert "event: hitl" in body
    ```

    约束：
    - 所有 test 使用既有 `client` fixture（conftest 已注入 dependency_overrides）
    - 用 `patch("app.api.chat.task_bus")` 替换整个 task_bus 模块（这是 test_api/test_chat.py 既定模式）
    - `read_events` 是 AsyncGenerator，**不能**直接 `AsyncMock(return_value=...)` —— 用普通 async def + yield（或空 generator）替换
    - `AsyncClient.get/post` 会自动 drain SSE body 直到 done —— 因此 async generator fixture 必须 yield 到终态（`done` 或 `error`），否则测试会挂起；组 A 的空 generator 直接 `return` 也能终止 endpoint 事件循环（内部遇到迭代结束自然退出）
  </action>

  <verify>
    <automated>cd backend && pytest tests/test_resilience.py -v</automated>
  </verify>

  <acceptance_criteria>
    - 文件 `backend/tests/test_resilience.py` 存在且 ≥ 7 个 test（3 + 3 + 1）
    - 全部 test 绿
    - 组 A：断言 `read_events` 收到的 `from_id` 值分别为 `"1700000000000-3"` / `"5"` / `"0"`
    - 组 B：断言 `publish_event` 被调用时 event 名为 `"hitl_resolved"` 且 payload key 集合严格等于 `{tool_name, call_id, decision, ts}`
    - 组 C：响应 200 且 body 含 `event: hitl`
    - `pytest tests/` 全量回归绿（包括 Phase 10 / 11 既有测试）
  </acceptance_criteria>

  <done>
    D-13 三组场景全部有测试且全绿；后端 Phase 12 侧完成，前端 plan 12-02 可以 depends_on=[12-01] 开启。
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → `/api/chat/stream` | 浏览器发起 SSE GET；`Last-Event-ID` header 由浏览器在自动重连时自动写入，但用户可以伪造此 header |
| client → `/api/chat/resume` | 用户 POST JSON；`action_requests[].name` / `.id` 会被原样写入事件流 payload |
| `task:{task_id}:events` Redis Stream | 事件流是 per-task 隔离的，但任何持有该 task_id 的订阅者都能读到 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-12-01 | Tampering / Injection | `/stream` Last-Event-ID header | mitigate | Header 值作为字符串透传给 `task_bus.read_events(from_id=...)`，后者只把它当作 Redis Streams entry-id；Redis XREAD 会在 id 非法时返回空（不抛异常、不中断流），没有 SQL/shell 注入面；Header 值不落日志、不拼接到响应体 |
| T-12-02 | Information Disclosure | `hitl_resolved` payload 含 tool_name / call_id | accept | 事件流仅按 task_id 隔离；本 Phase 不引入跨用户订阅点；`call_id` 为 LangGraph 内部 UUID，非敏感；既有 `/stream` 已经推送 tool/hitl 帧，增量风险为零 |
| T-12-03 | Tampering | `/resume` action_requests[].name 被原样写入事件流 | mitigate | 前端 listener 仅在当前 assistant message 的 pending HITL 集合内按 `tool_name` 优先匹配；匹配不到直接 no-op，再 fallback 到“无 tool_name 时最近 pending”规则；payload 不参与权限判定 |
| T-12-04 | Denial of Service | `Last-Event-ID` 极大值导致 Redis XREAD 永远 block | accept | 既有 `block_ms=5000` 心跳已存在；非法 entry_id Redis 返回空 → 继续 block 心跳；不构成 DoS 放大 |
| T-12-05 | Repudiation | resume 操作无结构化日志 | accept | v2.0 观测性在 Phase 13 统一落地；本 Phase 不单独加 logger |
</threat_model>

<verification>
- `pytest tests/test_resilience.py` 全绿（7 个 test）
- `pytest tests/` 全量回归绿（Phase 10/11 既有测试不回归）
- `ruff check backend/app/api/chat.py` 无新增告警
- 手工冒烟：后端启动，`curl -N -H "Last-Event-ID: 999-999" http://localhost:8001/api/chat/stream/<task_id>` 不 500
</verification>

<success_criteria>
1. `/api/chat/stream/{task_id}` 在 query 缺省时从 `Last-Event-ID` header 取 from_id；query 优先
2. `/api/chat/resume` 成功后事件流里必定出现一条 `event=hitl_resolved` 帧，payload 严格按契约
3. `test_resilience.py` 全绿 + 既有测试全量回归绿
4. `backend/app/services/task.py` / `backend/app/infra/task_bus.py` 零改动（落点选 A，service 层不受污染）
</success_criteria>

<output>
完成后创建 `.planning/phases/12-resilience/12-01-SUMMARY.md`，含：
- files_modified 实际清单（chat.py + test_resilience.py）
- tasks 清单 + 每个 task 的 verify 结果
- 新事件契约的 payload 示例（给前端 plan 12-02 执行者参考）
- 任何实际实现过程中的偏差与理由
</output>
