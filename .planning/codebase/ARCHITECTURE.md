# Architecture

**Analysis Date:** 2026-04-12

## Pattern Overview

**Overall:** Layered Architecture with SSE-based async task streaming

The backend follows a clean 4-layer architecture: API (routing) -> Services (orchestration) -> Core (domain logic) -> Infra (external systems). Agent execution happens as in-process `asyncio.Task` coroutines that stream events through a Redis Stream bus, consumed by clients via SSE.

**Key Characteristics:**
- No Celery: The legacy 07 codebase used Celery workers; the new `backend/` replaces this with `asyncio.Task` running in the same FastAPI process
- SSE event streaming: Agent runs in background, writes events to Redis Stream; clients subscribe via `GET /api/chat/stream/{task_id}`
- Human-in-the-loop (HITL): Agent execution pauses on dangerous tool calls, client approves/edits/rejects, agent resumes via `Command(resume=...)`
- Single-user mode: Auth is stubbed (`get_current_user` returns `settings.default_user_id`); designed for future JWT injection

## Layers

**API Layer (`app/api/`):**
- Purpose: HTTP routing, request validation, SSE formatting
- Location: `backend/app/api/`
- Contains: FastAPI routers (`chat.py`, `sessions.py`, `memory.py`), dependency providers (`deps.py`)
- Depends on: `app.services`, `app.models`, `app.infra.task_bus`, `app.core.hitl`
- Used by: External HTTP clients (Next.js frontend on port 3000)

**Service Layer (`app/services/`):**
- Purpose: Business orchestration -- session lifecycle, task lifecycle, memory CRUD
- Location: `backend/app/services/`
- Contains: `TaskService` (agent execution + event publishing), `SessionService` (Redis session CRUD), `MemoryService` (PostgresStore long-term memory)
- Depends on: `app.core`, `app.infra`
- Used by: `app.api`

**Core Layer (`app/core/`):**
- Purpose: Domain logic -- agent creation, streaming event parser, HITL decision builder, tool definitions
- Location: `backend/app/core/`
- Contains: `AgentService` (agent factory), `parse_agent_events()` (stream parser), `build_decisions()` (HITL protocol), tool definitions, custom exceptions
- Depends on: `app.infra.database`, `app.infra.llm`, `app.config`, external `deepagents`/`langgraph` libraries
- Used by: `app.services`

**Infrastructure Layer (`app/infra/`):**
- Purpose: External system connections -- PostgreSQL, Redis, LLM providers
- Location: `backend/app/infra/`
- Contains: `Database` singleton (connection pool + checkpointer + store), `RedisManager` singleton, `task_bus` module (Redis Stream operations), `llm.py` (multi-provider LLM factory)
- Depends on: `app.config`, external libraries (`psycopg_pool`, `redis.asyncio`, `langchain_openai`)
- Used by: All upper layers

**Configuration (`app/config.py`):**
- Purpose: Centralized settings via pydantic-settings, loaded from `.env`
- Location: `backend/app/config.py`
- Contains: `Settings` class with PostgreSQL, Redis, LLM, server, and logging config
- Used by: All layers via `from app.config import settings`

## Data Flow

**Invoke Flow (user sends message):**

1. Client `POST /api/chat/invoke` with `{session_id, query, system_message?}`
2. `chat.py` router validates request, ensures session exists via `SessionService`
3. `TaskService.start_invoke()` generates `task_id`, writes meta to Redis (`task:{task_id}` HASH), launches `asyncio.Task`
4. Background coroutine `_run_agent()` creates agent via `AgentService.create_agent()`, calls `agent.astream()` with `stream_mode=["updates", "messages"]`
5. `parse_agent_events()` yields structured `(event_type, data)` tuples from the LangGraph stream
6. Each event is published to Redis Stream (`task:{task_id}:events`) via `task_bus.publish_event()`
7. Client `GET /api/chat/stream/{task_id}` reads events via `task_bus.read_events()` (blocking XREAD), formatted as SSE
8. On completion: `done` event published, task status set to `completed`
9. On HITL interrupt: `hitl` event published, task status set to `interrupted`, stream paused

**HITL Resume Flow:**

1. Client `POST /api/chat/resume` with `{task_id, response_type, args?, action_requests?}`
2. `chat.py` validates task exists and is in `interrupted` state
3. `build_decisions()` in `app/core/hitl.py` converts frontend input to `{"decisions": [...]}` format
4. `TaskService.start_resume()` resets status to `running`, launches new `asyncio.Task` with `Command(resume=command_data)` as agent input
5. Agent resumes from LangGraph checkpoint, continues streaming events to the same Redis Stream
6. Client SSE connection continues receiving events (same `task_id`, same stream)

**State Management:**
- **Short-term (checkpointer):** `AsyncPostgresSaver` backed by PostgreSQL -- persists LangGraph graph state per `thread_id` (= `session_id`). Enables resume after interrupts.
- **Long-term (store):** `AsyncPostgresStore` backed by PostgreSQL -- key-value store namespaced by `("memories", user_id)`. Used for cross-session memory.
- **Session metadata:** Redis HASH keys `session:{user_id}:{session_id}` with JSON payload. TTL-based expiry.
- **Task metadata:** Redis HASH keys `task:{task_id}` tracking status (`running`/`interrupted`/`completed`/`error`).
- **Task events:** Redis Stream keys `task:{task_id}:events` for ordered event delivery with replay support.

## Key Abstractions

**AgentService (`app/core/agent.py`):**
- Purpose: Factory that creates a fully configured `deepagents` agent with middleware, sub-agents, tools, and HITL config
- Pattern: Each call to `create_agent()` builds a fresh agent instance; the PostgreSQL checkpointer/store are shared via the `Database` singleton
- The agent includes: `SummarizationMiddleware` (context window management), `researcher` sub-agent (MCP tools), HITL interrupt config

**TaskService (`app/services/task.py`):**
- Purpose: Manages the lifecycle of agent execution as background asyncio tasks
- Pattern: Tracks running tasks in `self._running: dict[str, asyncio.Task]`, provides `cancel_all()` for graceful shutdown
- Key methods: `start_invoke()` (new conversation turn), `start_resume()` (HITL continuation)

**task_bus (`app/infra/task_bus.py`):**
- Purpose: Redis Stream-based event bus decoupling agent execution from SSE delivery
- Pattern: Write side (`publish_event`) and read side (`read_events` async generator with blocking XREAD + terminal status detection)
- Status constants: `STATUS_RUNNING`, `STATUS_INTERRUPTED`, `STATUS_COMPLETED`, `STATUS_ERROR`

**parse_agent_events (`app/core/streaming.py`):**
- Purpose: Transforms raw LangGraph `astream()` output into typed event tuples
- Event types: `token` (AI text chunk), `tool` (tool call/result), `todo` (TodoListMiddleware updates), `hitl` (interrupt), `done` (completion), `error`
- Pattern: Async generator that yields `(event_type, data)` -- pure transformation, no side effects

**build_decisions (`app/core/hitl.py`):**
- Purpose: Converts frontend HITL responses to the `Command(resume={"decisions": [...]})` format required by `deepagents` HITL v2 protocol
- Supports: `approve` (pass-through), `edit` (modified tool args), `reject` (with optional message)
- Handles legacy aliases: `accept` -> `approve`, `response` -> `reject`

## Entry Points

**FastAPI Application:**
- Location: `backend/app/main.py`
- Triggers: `uvicorn.run("app.main:app", ...)`
- Responsibilities: Lifespan management (DB/Redis connect/disconnect), CORS middleware, router registration, exception handler, health check
- Run: `cd backend && python -m app.main` or `uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload`

**API Routers:**
- `backend/app/api/chat.py`: `POST /api/chat/invoke`, `POST /api/chat/resume`, `GET /api/chat/stream/{task_id}`
- `backend/app/api/sessions.py`: `GET /api/sessions`, `GET /api/sessions/active`, `POST /api/sessions`, `DELETE /api/sessions/{session_id}`
- `backend/app/api/memory.py`: `POST /api/memory`, `GET /api/memory`
- `GET /health`: Health check (defined in `main.py`)

## Error Handling

**Strategy:** Custom exception hierarchy with HTTP status code mapping via FastAPI exception handler

**Patterns:**
- `BusinessError` base class (`backend/app/core/exceptions.py`) carries `status_code` and `message`
- Subclasses: `TaskNotFoundError` (404), `TaskStateError` (409 Conflict), `InvalidDecisionError` (400)
- Global handler in `backend/app/main.py` catches `BusinessError` and returns `{"detail": exc.message}` JSON
- Agent execution errors are caught in `TaskService._run_agent()`, published as `error` event to the Redis Stream, and task status set to `error`
- FastAPI's built-in 422 validation errors handle malformed request bodies (Pydantic validation)

## Cross-Cutting Concerns

**Logging:**
- Centralized `logging.basicConfig()` in `backend/app/main.py:setup_logging()`
- Each module uses `logging.getLogger(__name__)`
- Third-party noise (`httpx`, `httpcore`) suppressed to WARNING
- Config for file logging exists in `Settings` (`log_file`, `log_max_bytes`, `log_backup_count`) but file handler is not yet wired up

**Validation:**
- Pydantic models in `backend/app/models/chat.py` for request/response validation
- `ResumeRequest` inline model in `backend/app/api/memory.py` for memory writes
- `build_decisions()` in `backend/app/core/hitl.py` validates HITL decision structure and raises `InvalidDecisionError`

**Authentication:**
- Stubbed in `backend/app/api/deps.py:get_current_user()` -- returns `settings.default_user_id`
- All routers inject `user_id` via `Depends(get_current_user)`
- Designed for future JWT-based auth: swap the dependency implementation without touching routers

**Dependency Injection:**
- FastAPI `Depends()` for services: `get_task_service()`, `get_session_service()`, `get_memory_service()`
- Lazy singleton pattern in `backend/app/api/deps.py` (module-level globals, created on first call)
- Test-friendly: `app.dependency_overrides` used in `backend/tests/conftest.py` to inject mocks

**Lifecycle Management:**
- FastAPI lifespan context manager in `backend/app/main.py`
- Startup: `db.connect()` (PostgreSQL pool + checkpointer + store), `redis_manager.connect()`
- Shutdown: `task_service.cancel_all()` (graceful agent task cancellation), `redis_manager.disconnect()`, `db.disconnect()`

---

*Architecture analysis: 2026-04-12*
