"""Phase 12 Resilience — /stream Last-Event-ID fallback + /resume hitl_resolved 集成测试"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest


# --------------------------------------------------------------------
# Group A: /stream from_id precedence (D-13.1)
# --------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stream_uses_last_event_id_when_query_missing(client):
    """query missing + header set -> read_events receives header value."""
    read_calls: list[str] = []

    async def fake_read_events(task_id, *, from_id="0", block_ms=5000):
        read_calls.append(from_id)
        return
        yield  # pragma: no cover

    with patch("app.api.chat.task_bus") as mock_bus:
        mock_bus.get_task_meta = AsyncMock(
            return_value={
                "task_id": "t1",
                "user_id": "u",
                "session_id": "s",
                "status": "running",
            }
        )
        mock_bus.read_events = fake_read_events
        resp = await client.get(
            "/api/chat/stream/t1",
            headers={"Last-Event-ID": "1700000000000-3"},
        )
    assert resp.status_code == 200
    assert read_calls == ["1700000000000-3"]


@pytest.mark.asyncio
async def test_stream_prefers_query_over_header(client):
    """query=5 + header=1700 -> read_events receives '5'."""
    read_calls: list[str] = []

    async def fake_read_events(task_id, *, from_id="0", block_ms=5000):
        read_calls.append(from_id)
        return
        yield  # pragma: no cover

    with patch("app.api.chat.task_bus") as mock_bus:
        mock_bus.get_task_meta = AsyncMock(
            return_value={
                "task_id": "t1",
                "user_id": "u",
                "session_id": "s",
                "status": "running",
            }
        )
        mock_bus.read_events = fake_read_events
        resp = await client.get(
            "/api/chat/stream/t1?from_id=5",
            headers={"Last-Event-ID": "1700000000000-3"},
        )
    assert resp.status_code == 200
    assert read_calls == ["5"]


@pytest.mark.asyncio
async def test_stream_defaults_to_zero(client):
    """query and header missing -> read_events receives '0'."""
    read_calls: list[str] = []

    async def fake_read_events(task_id, *, from_id="0", block_ms=5000):
        read_calls.append(from_id)
        return
        yield  # pragma: no cover

    with patch("app.api.chat.task_bus") as mock_bus:
        mock_bus.get_task_meta = AsyncMock(
            return_value={
                "task_id": "t1",
                "user_id": "u",
                "session_id": "s",
                "status": "running",
            }
        )
        mock_bus.read_events = fake_read_events
        resp = await client.get("/api/chat/stream/t1")
    assert resp.status_code == 200
    assert read_calls == ["0"]


# --------------------------------------------------------------------
# Group B: /resume publish hitl_resolved (D-13.2)
# --------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resume_publishes_hitl_resolved_approve(
    client, mock_task_service, mock_session_service
):
    captured: list[tuple[str, str, dict]] = []

    async def fake_publish(task_id, event, data):
        captured.append((task_id, event, data))
        return "1700-0"

    with patch("app.api.chat.task_bus") as mock_bus:
        mock_bus.get_task_meta = AsyncMock(
            return_value={
                "task_id": "t1",
                "user_id": "u",
                "session_id": "s",
                "status": "interrupted",
            }
        )
        mock_bus.STATUS_INTERRUPTED = "interrupted"
        mock_bus.STATUS_RUNNING = "running"
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
async def test_resume_publishes_hitl_resolved_reject(
    client, mock_task_service, mock_session_service
):
    captured: list[tuple[str, str, dict]] = []

    async def fake_publish(task_id, event, data):
        captured.append((task_id, event, data))
        return "1700-0"

    with patch("app.api.chat.task_bus") as mock_bus:
        mock_bus.get_task_meta = AsyncMock(
            return_value={
                "task_id": "t1",
                "user_id": "u",
                "session_id": "s",
                "status": "interrupted",
            }
        )
        mock_bus.STATUS_INTERRUPTED = "interrupted"
        mock_bus.STATUS_RUNNING = "running"
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
async def test_resume_without_action_requests_still_publishes(
    client, mock_task_service, mock_session_service
):
    """action_requests missing -> tool_name/call_id are None, event still emitted."""
    captured: list[tuple[str, str, dict]] = []

    async def fake_publish(task_id, event, data):
        captured.append((task_id, event, data))
        return "1700-0"

    with patch("app.api.chat.task_bus") as mock_bus:
        mock_bus.get_task_meta = AsyncMock(
            return_value={
                "task_id": "t1",
                "user_id": "u",
                "session_id": "s",
                "status": "interrupted",
            }
        )
        mock_bus.STATUS_INTERRUPTED = "interrupted"
        mock_bus.STATUS_RUNNING = "running"
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


# --------------------------------------------------------------------
# Group C: interrupted reattach from_id=0 replays hitl events (D-13.3)
# --------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stream_reattach_interrupted_replays_hitl(client):
    """interrupted task + from_id=0 should replay historical hitl frames."""

    async def fake_read_events(task_id, *, from_id="0", block_ms=5000):
        yield ("1700-0", "hitl", {"action_requests": [{"name": "maps_search", "id": "call-1"}]})
        yield ("1700-1", "done", {})

    with patch("app.api.chat.task_bus") as mock_bus:
        mock_bus.get_task_meta = AsyncMock(
            return_value={
                "task_id": "t1",
                "user_id": "u",
                "session_id": "s",
                "status": "interrupted",
            }
        )
        mock_bus.read_events = fake_read_events
        resp = await client.get("/api/chat/stream/t1")
    assert resp.status_code == 200
    assert "event: hitl" in resp.text
