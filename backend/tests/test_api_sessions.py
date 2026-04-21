"""api/sessions.py 集成测试（Phase 10 Plan 01 Task 3）。

与 tests/test_api/test_chat.py 平行放置（不在 test_api/ 子包）。
通过 conftest.py 的 `client` + `mock_session_service` fixture 走真实 FastAPI routing。
"""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest


# ────────────────────────────────────────────
# GET /api/sessions 列表字段
# ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_returns_title(client, mock_session_service):
    """SESS-01：响应里每条 session 带 title / last_updated / last_task_id"""
    mock_session_service.list_sessions = AsyncMock(return_value=[
        {
            "session_id": "s1",
            "user_id": "default",
            "title": "查天气",
            "last_task_id": "t1",
            "last_updated": 1700.0,
            "created_at": 1000.0,
            "status": "idle",
        },
    ])
    resp = await client.get("/api/sessions")
    assert resp.status_code == 200
    body = resp.json()
    assert "sessions" in body
    s = body["sessions"][0]
    assert s["title"] == "查天气"
    assert s["last_task_id"] == "t1"
    assert s["last_updated"] == 1700.0


# ────────────────────────────────────────────
# POST /api/sessions 语义（P-07 幂等）
# ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_post_empty_body(client, mock_session_service):
    """POST 不带 body → 用服务端生成的 session_id"""
    mock_session_service.session_exists = AsyncMock(return_value=False)
    mock_session_service.create_session = AsyncMock(return_value="new-sid")
    resp = await client.post("/api/sessions")
    assert resp.status_code == 200
    body = resp.json()
    assert body["session_id"] == "new-sid"
    mock_session_service.create_session.assert_awaited_once()


@pytest.mark.asyncio
async def test_post_existing_session_idempotent(client, mock_session_service):
    """session_id 已存在 → 幂等返回，不调 create_session"""
    mock_session_service.session_exists = AsyncMock(return_value=True)
    mock_session_service.get_session = AsyncMock(return_value={
        "session_id": "s1",
        "user_id": "default",
        "title": "原标题",
        "last_task_id": None,
        "created_at": 100.0,
        "last_updated": 100.0,
        "status": "idle",
    })
    mock_session_service.create_session = AsyncMock(return_value="SHOULD_NOT_BE_CALLED")

    resp = await client.post("/api/sessions", json={"session_id": "s1", "title": "新标题被忽略"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["session_id"] == "s1"
    assert body["title"] == "原标题"  # 不覆盖现有 title
    mock_session_service.create_session.assert_not_awaited()


@pytest.mark.asyncio
async def test_delete_then_restore_idempotent(client, mock_session_service):
    """SESS-04 + P-07：删除后 POST 同 id → 恢复；再次 POST 同 id → 幂等"""
    # 第一步：DELETE
    mock_session_service.session_exists = AsyncMock(return_value=True)
    mock_session_service.delete_session = AsyncMock(return_value=True)
    resp = await client.delete("/api/sessions/s1")
    assert resp.status_code == 200

    # 第二步：POST 同 session_id（此时 session_exists=False，走 create）
    mock_session_service.session_exists = AsyncMock(return_value=False)
    mock_session_service.create_session = AsyncMock(return_value="s1")
    resp = await client.post("/api/sessions", json={"session_id": "s1", "title": "原标题"})
    assert resp.status_code == 200
    assert resp.json()["session_id"] == "s1"

    # 第三步：再 POST 同 session_id → 幂等
    mock_session_service.session_exists = AsyncMock(return_value=True)
    mock_session_service.get_session = AsyncMock(return_value={
        "session_id": "s1", "user_id": "default", "title": "原标题",
        "last_task_id": None, "created_at": 500.0, "last_updated": 500.0, "status": "idle",
    })
    resp = await client.post("/api/sessions", json={"session_id": "s1"})
    assert resp.status_code == 200
    assert resp.json()["session_id"] == "s1"


# ────────────────────────────────────────────
# GET /api/sessions/{id}/messages
# ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_messages_returns_structure(client, mock_session_service, monkeypatch):
    """成功返回 messages + active_task + truncate_after_active_task 三字段"""
    mock_session_service.session_exists = AsyncMock(return_value=True)
    stub = AsyncMock(return_value={
        "messages": [{"id": "user-0", "role": "user",
                      "segments": [{"type": "text", "content": "hi"}], "timestamp": 0}],
        "active_task": None,
        "truncate_after_active_task": False,
    })
    monkeypatch.setattr("app.api.sessions.load_history_for_session", stub)

    resp = await client.get("/api/sessions/s1/messages")
    assert resp.status_code == 200
    body = resp.json()
    assert "messages" in body
    assert "active_task" in body
    assert "truncate_after_active_task" in body
    assert body["messages"][0]["role"] == "user"


@pytest.mark.asyncio
async def test_messages_cross_user_forbidden(client, mock_session_service):
    """T-10-01 硬性 acceptance：跨用户访问返回 404 且 detail 不泄漏归属信息"""
    mock_session_service.session_exists = AsyncMock(return_value=False)

    resp = await client.get("/api/sessions/someone-elses-sid/messages")
    assert resp.status_code == 404
    detail = resp.json().get("detail", "")
    # 不得出现任何"归属 / 另一用户 / belongs"类字眼（防信息泄漏）
    assert "不属于" not in detail
    assert "另一用户" not in detail
    assert "belongs" not in detail.lower()
