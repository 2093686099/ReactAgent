# Coding Conventions

**Analysis Date:** 2026-04-12

## Naming Patterns

**Files:**
- Use `snake_case.py` for all Python modules: `task_bus.py`, `streaming.py`, `hitl.py`
- Test files mirror source structure with `test_` prefix: `test_core/test_hitl.py` tests `core/hitl.py`
- `__init__.py` files are empty or minimal (no barrel re-exports)

**Functions:**
- `snake_case` for all functions and methods: `get_mcp_tools()`, `build_decisions()`, `start_invoke()`
- Private helpers prefixed with `_`: `_extract_text()`, `_client()`, `_meta_key()`, `_model_configs()`
- Async functions use descriptive verbs: `connect()`, `disconnect()`, `create_session()`

**Variables:**
- `snake_case` for local variables and parameters: `task_id`, `session_id`, `user_id`
- Module-level singletons use short names: `db`, `settings`, `redis_manager`, `logger`
- Module-level caches use `_` prefix: `_mcp_tools_cache`, `_mcp_lock`
- Constants use `UPPER_SNAKE_CASE`: `STATUS_RUNNING`, `EVT_TOKEN`, `DEFAULT_TEMPERATURE`

**Classes:**
- `PascalCase`: `TaskService`, `SessionService`, `RedisManager`, `Database`
- Pydantic models follow same convention: `ChatRequest`, `TaskCreatedResponse`
- Exception classes end with `Error`: `BusinessError`, `TaskNotFoundError`, `LLMInitializationError`

**Types:**
- Type aliases at module level with `PascalCase`: `AgentInput = dict[str, Any] | Command`
- TypedDict for structured dicts: `TaskMeta` in `app/infra/task_bus.py`

## Code Style

**Formatting:**
- Tool: `ruff` (configured in `backend/pyproject.toml`)
- Line length: 120 characters (`[tool.ruff] line-length = 120`)
- No other ruff rules explicitly configured (uses defaults)

**Linting:**
- Tool: `ruff` (serves as both linter and formatter)
- Install via: `pip install -e ".[dev]"`

**Future Imports:**
- Every module starts with `from __future__ import annotations` for PEP 604 `X | Y` syntax
- This is mandatory across 100% of source and test files

**File Headers:**
- Each file begins with a comment identifying its path: `# backend/app/core/agent.py`
- Some files include brief Chinese-language purpose comment after the path

## Import Organization

**Order:**
1. `from __future__ import annotations` (always first)
2. Standard library: `logging`, `json`, `asyncio`, `uuid`, `time`, `os`
3. Third-party: `fastapi`, `pydantic`, `redis`, `langchain_*`, `langgraph`, `deepagents`
4. Local `app.*` imports: `app.config`, `app.infra.*`, `app.core.*`, `app.services.*`

**Path Style:**
- Always use absolute imports from `app`: `from app.config import settings`
- Never use relative imports (no `from .config import ...`)
- Import specific names, not whole modules: `from app.core.exceptions import InvalidDecisionError`

**Path Aliases:**
- None. The project relies on `pip install -e .` (editable install via `pyproject.toml`) to make `app` importable.

## Error Handling

**Custom Exception Hierarchy:**
- Base: `BusinessError` with `status_code` and `message` attributes (`app/core/exceptions.py`)
- Subclasses: `TaskNotFoundError(404)`, `TaskStateError(409)`, `InvalidDecisionError(400)`
- Global handler in `app/main.py` converts `BusinessError` to `JSONResponse`

**Patterns:**
- Service layer raises `BusinessError` subclasses for expected failures
- API layer uses `HTTPException` for quick validation (e.g., `resume` endpoint 404 check in `app/api/chat.py`)
- Infrastructure errors (Redis/DB not initialized) raise `RuntimeError` with Chinese message
- Background task errors caught with bare `except Exception`, logged with `logger.exception()`, then status set to error
- LLM initialization has its own `LLMInitializationError` with fallback retry logic in `app/infra/llm.py`

**Pattern to follow when adding new business errors:**
```python
# app/core/exceptions.py
class MyNewError(BusinessError):
    status_code = 422  # appropriate HTTP status
```

**Pattern to follow in service layer:**
```python
from app.core.exceptions import TaskNotFoundError

async def my_method(self, task_id: str):
    meta = await task_bus.get_task_meta(task_id)
    if meta is None:
        raise TaskNotFoundError(f"task {task_id} 不存在或已过期")
```

## Logging

**Framework:** Python standard `logging` module

**Setup:** Centralized in `app/main.py:setup_logging()` via `logging.basicConfig()`
- Level: `INFO`
- Format: `%(asctime)s - %(name)s - %(levelname)s - %(message)s`
- Third-party noise suppressed: `httpx` and `httpcore` set to `WARNING`

**Patterns:**
- Every module creates its own logger: `logger = logging.getLogger(__name__)`
- Use f-strings in log messages (not lazy `%` formatting): `logger.info(f"task {task_id} 结束")`
- Use `logger.exception()` for caught exceptions (includes traceback)
- Use `logger.warning()` for non-fatal fallbacks
- Log messages mix Chinese and English — Chinese for domain concepts, English for technical identifiers

## Comments

**When to Comment:**
- Chinese docstrings and comments for business logic explanation
- English for code-level technical notes
- `来源：07/...` comments trace migration origin from legacy `07_DeepAgentHILApiMultiSessionTask` directory
- Inline `# ⚠️` warnings for known gotchas (see `app/core/streaming.py` lines 50-56)

**Docstrings:**
- Triple-quote docstrings on public functions with Chinese descriptions
- `Args:` / `Returns:` / `Raises:` sections in Google style (see `app/infra/llm.py:initialize_llm`)
- Private helpers may have single-line docstrings or none

**Migration Provenance:**
- Many functions carry `来源：07/filename.py:line-range function_name` comments
- These trace back to the legacy codebase and should be preserved but not added to new code

## Function Design

**Size:**
- Files are small: largest is 128 lines (`app/infra/llm.py`), most are under 80 lines
- Functions are short: typically 5-25 lines
- One function per concern

**Parameters:**
- Use keyword-only arguments via `*` for clarity: `async def create_agent(self, *, system_prompt: str | None = None)`
- Default `user_id` to `settings.default_user_id` at the service layer, not the API layer
- Optional params use `X | None = None` style (PEP 604), not `Optional[X]`
  - Exception: `app/models/chat.py` still uses `Optional[str]` in some Pydantic models — follow PEP 604 for new code

**Return Values:**
- Services return domain values (str IDs, dicts, lists), not HTTP responses
- API layer wraps service results into Pydantic response models

## Module Design

**Exports:**
- No `__all__` declarations in any module
- `__init__.py` files are empty — no barrel re-exports

**Singleton Pattern:**
- Infrastructure objects instantiated at module level: `db = Database()`, `redis_manager = RedisManager()`, `settings = Settings()`
- Service singletons via lazy init in `app/api/deps.py` using global variables with `None` guard
- Lifecycle (connect/disconnect) managed in FastAPI `lifespan` context manager

**Dependency Injection:**
- FastAPI `Depends()` for injecting services into route handlers
- `app.dependency_overrides` used in tests to swap real services with mocks
- Services receive infrastructure via module-level singletons (not constructor injection)

## Async Conventions

**All IO is async:**
- Route handlers are `async def`
- Service methods are `async def`
- Infrastructure clients use async variants: `redis.asyncio`, `AsyncConnectionPool`, `AsyncPostgresSaver`

**Background Tasks:**
- Use `asyncio.create_task()` for fire-and-forget agent execution (not Celery — migrated away)
- Track running tasks in `TaskService._running: dict[str, asyncio.Task]`
- Clean up via `cancel_all()` in lifespan shutdown

**Concurrency Safety:**
- `asyncio.Lock` for cache initialization (`app/core/tools.py:_mcp_lock`)
- Double-check locking pattern for `_mcp_tools_cache`

## Pydantic Usage

**Settings:**
- `pydantic_settings.BaseSettings` with `SettingsConfigDict` for `.env` loading (`app/config.py`)
- All settings have defaults — `.env` file overrides

**Request/Response Models:**
- Defined in `app/models/chat.py`
- Use `BaseModel` with type annotations
- API response uses `response_model=` parameter on route decorator

---

*Convention analysis: 2026-04-12*
