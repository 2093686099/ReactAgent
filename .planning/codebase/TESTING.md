# Testing Patterns

**Analysis Date:** 2026-04-12

## Test Framework

**Runner:**
- pytest >= 8.0
- pytest-asyncio >= 0.23
- Config: `backend/pyproject.toml` (`[tool.pytest.ini_options]`)

**Assertion Library:**
- Built-in `assert` statements (pytest native)
- `pytest.raises` for exception testing

**HTTP Client:**
- `httpx.AsyncClient` with `ASGITransport` for in-process FastAPI testing (no server startup needed)

**Run Commands:**
```bash
cd backend
pip install -e ".[dev]"       # Install dev dependencies (pytest, httpx, ruff)
python -m pytest              # Run all tests
python -m pytest -v           # Verbose output
python -m pytest tests/test_core/  # Run specific directory
```

**Note:** Coverage tooling (pytest-cov) is not configured. No coverage targets are enforced.

## Test File Organization

**Location:**
- Separate `tests/` directory at `backend/tests/`
- Mirrors `app/` structure: `app/core/hitl.py` → `tests/test_core/test_hitl.py`

**Naming:**
- Directories: `test_` prefix matching source package: `test_api/`, `test_core/`
- Files: `test_` prefix matching source module: `test_chat.py`, `test_hitl.py`, `test_streaming.py`
- Each `tests/` subdirectory has an `__init__.py` (empty)

**Structure:**
```
backend/tests/
├── __init__.py
├── conftest.py                  # Shared fixtures + sys.modules mocking
├── test_api/
│   ├── __init__.py
│   └── test_chat.py             # API integration tests
└── test_core/
    ├── __init__.py
    ├── test_hitl.py             # Unit tests for HITL decision builder
    └── test_streaming.py        # Unit tests for text extraction
```

## Test Structure

**Async Mode:**
- `asyncio_mode = "auto"` in `pyproject.toml` — all async test functions are automatically detected
- Mark `@pytest.mark.asyncio` is still used explicitly on async tests (belt-and-suspenders)

**Suite Organization:**
```python
# Flat function-based tests, no classes
# Each test is a standalone function with descriptive name
def test_approve_single():
    """approve + 单个 action"""
    result = build_decisions("approve", None, [{"name": "tool1"}])
    assert result == {"decisions": [{"type": "approve"}]}
```

**Patterns:**
- No setup/teardown methods — use fixtures
- Chinese docstrings on each test explaining the scenario
- Tests are short (3-8 lines typically)
- Test names follow `test_{scenario}` pattern: `test_approve_multiple`, `test_resume_not_found`

## Mocking

**Framework:** `unittest.mock` (stdlib) — `MagicMock`, `AsyncMock`, `patch`

**Critical Pattern — sys.modules Pre-Mocking:**

The codebase has heavy external dependencies (langgraph, deepagents, redis, psycopg) that are not available in the test environment. The test suite solves this by mocking entire packages at the `sys.modules` level BEFORE any `app` imports.

```python
# backend/tests/conftest.py — this pattern is mandatory for all test files
from __future__ import annotations
import sys
from unittest.mock import MagicMock

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
```

**When adding new external dependencies:** Add them to `_EXTERNAL_MODS` list in `conftest.py` or tests will fail on import.

**Service Mocking via FastAPI DI:**

```python
# backend/tests/conftest.py
@pytest.fixture
def mock_task_service():
    svc = MagicMock()
    svc.start_invoke = AsyncMock(return_value="test-task-id")
    svc.start_resume = AsyncMock()
    svc.cancel_all = AsyncMock()
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
```

**Inline Patching (for module-level dependencies):**
```python
# backend/tests/test_api/test_chat.py
async def test_resume_not_found(client):
    with patch("app.api.chat.task_bus") as mock_bus:
        mock_bus.get_task_meta = AsyncMock(return_value=None)
        resp = await client.post(
            "/api/chat/resume",
            json={"task_id": "nonexistent", "response_type": "approve"},
        )
    assert resp.status_code == 404
```

**What to Mock:**
- All external service dependencies (Redis, PostgreSQL, LLM providers, MCP servers)
- Service layer when testing API routes (via `dependency_overrides`)
- Module-level singletons (via `patch`) when not covered by DI

**What NOT to Mock:**
- Pure logic functions (test directly): `build_decisions()`, `_extract_text()`
- Pydantic model validation
- FastAPI routing/serialization (tested through `AsyncClient`)

## Fixtures and Factories

**Test Data:**
```python
# Inline test data — no factory files or shared fixtures beyond conftest.py
resp = await client.post(
    "/api/chat/invoke",
    json={"session_id": "s1", "query": "hello"},
)
```

**Location:**
- All fixtures in `backend/tests/conftest.py`
- No separate fixtures directory or factory files
- Test data is inline in each test function

**Available Fixtures:**
| Fixture | Scope | Purpose |
|---------|-------|---------|
| `mock_task_service` | function | Mocked `TaskService` with async stubs |
| `mock_session_service` | function | Mocked `SessionService` with async stubs |
| `mock_memory_service` | function | Mocked `MemoryService` with async stubs |
| `test_app` | function | FastAPI app with DI overrides |
| `client` | function | httpx `AsyncClient` for HTTP testing |

## Coverage

**Requirements:** None enforced. No coverage configuration or CI targets.

**View Coverage:**
```bash
# Not currently configured. To add:
pip install pytest-cov
python -m pytest --cov=app --cov-report=html
```

## Test Types

**Unit Tests:**
- Pure function testing without any mocking
- Files: `backend/tests/test_core/test_hitl.py`, `backend/tests/test_core/test_streaming.py`
- Scope: test single functions with various input combinations
- Pattern: direct function call + `assert` on return value

**API Integration Tests:**
- Test HTTP endpoints through FastAPI's ASGI transport
- File: `backend/tests/test_api/test_chat.py`
- Scope: request → routing → DI → (mocked) service → response
- Pattern: `client.post()` / `client.get()` + assert on status code and JSON body

**E2E Tests:**
- Not present. No tests that exercise real Redis/PostgreSQL/LLM providers.

## Common Patterns

**Async Testing:**
```python
@pytest.mark.asyncio
async def test_invoke_ok(client, mock_task_service):
    resp = await client.post(
        "/api/chat/invoke",
        json={"session_id": "s1", "query": "hello"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "task_id" in body
    mock_task_service.start_invoke.assert_awaited_once()
```

**Error Testing:**
```python
def test_invalid_type_raises():
    """未知 response_type 'xyz' → raises"""
    with pytest.raises(InvalidDecisionError, match="不支持的响应类型"):
        build_decisions("xyz", None, [])
```

**Boundary/Edge Case Testing:**
```python
def test_none():
    assert _extract_text(None) == ""

def test_int():
    assert _extract_text(123) == ""

def test_empty_list():
    assert _extract_text([]) == ""
```

**Mock Verification:**
```python
mock_task_service.start_invoke.assert_awaited_once()
```

## Adding New Tests

**For a new pure function in `app/core/foo.py`:**
1. Create `backend/tests/test_core/test_foo.py`
2. Import the function directly: `from app.core.foo import my_func`
3. Write `def test_*` functions (sync is fine for pure logic)

**For a new API endpoint in `app/api/bar.py`:**
1. Create `backend/tests/test_api/test_bar.py`
2. Use `client` fixture for HTTP calls
3. Mock any new services — add fixture to `conftest.py` if reused
4. Override DI in `test_app` fixture if new service dependency added

**For a new external dependency:**
1. Add all submodule paths to `_EXTERNAL_MODS` in `backend/tests/conftest.py`
2. Test that `python -m pytest --co` collects without import errors

## Current Test Inventory

| File | Tests | Type | What's Tested |
|------|-------|------|---------------|
| `test_api/test_chat.py` | 3 | API integration | invoke, resume 404, health |
| `test_core/test_hitl.py` | 10 | Unit | build_decisions all branches |
| `test_core/test_streaming.py` | 7 | Unit | _extract_text type handling |
| **Total** | **20** | | |

## Gaps

- No tests for `app/services/task.py` (TaskService — background task lifecycle)
- No tests for `app/services/session.py` (SessionService — Redis operations)
- No tests for `app/services/memory.py` (MemoryService — Postgres store)
- No tests for `app/infra/task_bus.py` (Redis Stream operations)
- No tests for `app/infra/llm.py` (LLM initialization + fallback)
- No tests for `app/core/agent.py` (agent creation)
- No tests for `app/api/sessions.py` or `app/api/memory.py` endpoints
- No SSE streaming tests for `GET /api/chat/stream/{task_id}`

---

*Testing analysis: 2026-04-12*
