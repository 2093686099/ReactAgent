# backend/tests/test_api/test_chat.py
"""chat API 集成测试 — 通过 dependency_overrides 注入 mock 验证 DI 可行"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest


@pytest.mark.asyncio
async def test_invoke_ok(client, mock_task_service):
    resp = await client.post(
        "/api/chat/invoke",
        json={"session_id": "s1", "query": "hello"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "task_id" in body
    assert body["task_id"] == "test-task-id"
    mock_task_service.start_invoke.assert_awaited_once()


@pytest.mark.asyncio
async def test_resume_not_found(client):
    with patch("app.api.chat.task_bus") as mock_bus:
        mock_bus.get_task_meta = AsyncMock(return_value=None)
        resp = await client.post(
            "/api/chat/resume",
            json={"task_id": "nonexistent", "response_type": "approve"},
        )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
