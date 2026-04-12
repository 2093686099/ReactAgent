# backend/tests/conftest.py
"""
测试 fixtures。

重要：sys.modules mock 必须在 import app 之前执行，
因为 app 的 import chain 依赖 langgraph/redis 等外部包。
"""
from __future__ import annotations

import sys
from unittest.mock import MagicMock

# ── 在 import app 之前 mock 掉所有外部重依赖 ──────────────────────────
_EXTERNAL_MODS = [
    "langgraph", "langgraph.checkpoint", "langgraph.checkpoint.postgres",
    "langgraph.checkpoint.postgres.aio", "langgraph.store", "langgraph.store.postgres",
    "langgraph.types", "langgraph.graph", "langgraph.graph.state",
    "psycopg_pool", "psycopg",
    "deepagents", "deepagents.middleware", "deepagents.middleware.subagents",
    "deepagents.backends", "deepagents.backends.store",
    "langchain", "langchain.agents", "langchain.agents.middleware",
    "langchain.agents.middleware.summarization",
    "langchain_core", "langchain_core.runnables", "langchain_core.tools",
    "langchain_openai",
    "langchain_mcp_adapters", "langchain_mcp_adapters.client",
    "redis", "redis.asyncio",
]
for _mod in _EXTERNAL_MODS:
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()

# ── 现在可以安全 import app ─────────────────────────────────────────
import pytest  # noqa: E402
from unittest.mock import AsyncMock  # noqa: E402
from httpx import AsyncClient, ASGITransport  # noqa: E402
from app.main import app  # noqa: E402
from app.api.deps import get_task_service, get_session_service, get_memory_service  # noqa: E402


@pytest.fixture
def mock_task_service():
    svc = MagicMock()
    svc.start_invoke = AsyncMock(return_value="test-task-id")
    svc.start_resume = AsyncMock()
    svc.cancel_all = AsyncMock()
    return svc


@pytest.fixture
def mock_session_service():
    svc = MagicMock()
    svc.session_exists = AsyncMock(return_value=True)
    svc.touch = AsyncMock(return_value=True)
    svc.create_session = AsyncMock(return_value="test-session-id")
    svc.list_sessions = AsyncMock(return_value=[])
    svc.get_active_session_id = AsyncMock(return_value=None)
    svc.delete_session = AsyncMock(return_value=True)
    return svc


@pytest.fixture
def mock_memory_service():
    svc = MagicMock()
    svc.read = AsyncMock(return_value="")
    svc.write = AsyncMock(return_value="test-memory-id")
    return svc


@pytest.fixture
def test_app(mock_task_service, mock_session_service, mock_memory_service):
    app.dependency_overrides[get_task_service] = lambda: mock_task_service
    app.dependency_overrides[get_session_service] = lambda: mock_session_service
    app.dependency_overrides[get_memory_service] = lambda: mock_memory_service
    yield app
    app.dependency_overrides.clear()


@pytest.fixture
async def client(test_app):
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
