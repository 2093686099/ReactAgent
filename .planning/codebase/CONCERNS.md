# Codebase Concerns

**Analysis Date:** 2026-04-12

## Tech Debt

**No Authentication / Authorization:**
- Issue: All API endpoints return a hardcoded `default_user_id`. Any client can access any user's sessions, tasks, and memory. The `get_current_user` dependency is a stub.
- Files: `backend/app/api/deps.py` (lines 10-16), `backend/app/config.py` (line 38)
- Impact: Multi-user support is impossible. Any network-reachable client has full access to all data. Session isolation is cosmetic only — relies on caller to pass correct `user_id`.
- Fix approach: Implement JWT-based auth middleware. Replace `get_current_user` with header-parsing logic. Add a `users` table or delegate to an external IdP.

**Duplicated Status Validation in resume Flow:**
- Issue: The "task must be interrupted" check is performed in both `app/api/chat.py` (line 74) and `app/services/task.py` (line 56). Two Redis round-trips for the same validation, with a TOCTOU race between them.
- Files: `backend/app/api/chat.py` (lines 71-78), `backend/app/services/task.py` (lines 53-57)
- Impact: Inconsistent error responses (API layer raises `HTTPException`, service layer raises `TaskStateError`). If the status changes between the two checks, behavior is undefined.
- Fix approach: Remove the check from the API layer and let `TaskService.start_resume` be the single authority. The API should catch `TaskStateError` or let the `BusinessError` handler do it.

**Dead Code — `MemoryRequest` Model:**
- Issue: `MemoryRequest` is defined in `backend/app/models/chat.py` (line 30) but never imported or used. `backend/app/api/memory.py` defines its own `MemoryWriteRequest` inline (line 13).
- Files: `backend/app/models/chat.py` (line 30), `backend/app/api/memory.py` (line 13)
- Impact: Confusing for developers — two request models for the same purpose. `MemoryRequest` has a `user_id` field that the API layer ignores (user comes from `get_current_user` dependency).
- Fix approach: Delete `MemoryRequest` from `backend/app/models/chat.py`. Move `MemoryWriteRequest` into `backend/app/models/chat.py` if centralizing models is desired.

**Long-Term Memory Not Injected into Agent:**
- Issue: The `MemoryService.read()` endpoint exists and the 07 codebase injected long-term memory into the system prompt before each agent invocation. The new backend does NOT — `AgentService.create_agent` passes `system_prompt` through but `TaskService.start_invoke` only forwards what the client sends. No memory is fetched and prepended.
- Files: `backend/app/core/agent.py` (line 20), `backend/app/services/task.py` (lines 28-45)
- Impact: Long-term memory written via `POST /api/memory` is never used by the agent. The feature is write-only.
- Fix approach: In `TaskService.start_invoke`, call `MemoryService.read(user_id)` and prepend the result to the system prompt before passing to `AgentService.create_agent`.

**MCP Tools Cached Forever (No Invalidation Strategy):**
- Issue: `_mcp_tools_cache` in `backend/app/core/tools.py` is set once and never cleared unless `refresh_mcp_tools()` is explicitly called. No endpoint exposes `refresh_mcp_tools()`. If the MCP server adds/removes tools, the app must be restarted.
- Files: `backend/app/core/tools.py` (lines 13-43)
- Impact: Stale tool definitions after MCP server updates. No way for operators to refresh without restart.
- Fix approach: Either add a TTL-based expiry to the cache, or expose an admin endpoint for `refresh_mcp_tools()`.

**No Session-Task Linkage:**
- Issue: Sessions and tasks are stored in separate Redis key spaces with no cross-reference. There is no way to list all tasks belonging to a session, or to clean up tasks when a session is deleted.
- Files: `backend/app/services/session.py`, `backend/app/infra/task_bus.py`
- Impact: Deleting a session orphans its tasks in Redis. The 07 codebase had `GET /agent/tasks/{user_id}/{session_id}` — the new backend has no equivalent. Clients cannot enumerate past tasks for a session.
- Fix approach: Maintain a Redis SET `session:{session_id}:tasks` that tracks task_ids. On session delete, clean up associated task metadata and event streams.

**`来源：07/` Comments Throughout:**
- Issue: Many docstrings reference the old 07 codebase with line numbers (e.g., `来源：07/01_backendServer.py:218-271`). These references will rot as the 07 code evolves or is deleted.
- Files: `backend/app/core/hitl.py` (line 10), `backend/app/core/streaming.py` (line 23), `backend/app/services/memory.py` (lines 29, 45), `backend/app/api/chat.py` (lines 68-69), `backend/app/api/sessions.py` (lines 17, 27, 48), `backend/app/api/memory.py` (line 23), `backend/app/infra/llm.py` (line 19)
- Impact: Misleading documentation. These are migration breadcrumbs, not useful references.
- Fix approach: Replace with self-contained descriptions of what the code does. Remove 07 line number references.

## Security Considerations

**No Authentication on Any Endpoint:**
- Risk: All endpoints are publicly accessible. An attacker with network access can read/write any user's sessions, memories, and control running agents.
- Files: `backend/app/api/deps.py` (lines 10-16), `backend/app/main.py` (lines 51-57)
- Current mitigation: CORS restricts browser access to `http://localhost:3000`. Does not protect against non-browser clients or same-network attackers.
- Recommendations: Implement authentication before any production deployment. At minimum, add API key validation as a stopgap.

**No Rate Limiting:**
- Risk: Any client can fire unlimited `POST /api/chat/invoke` requests, each spawning an LLM call and background task. Trivial to exhaust LLM API quotas, Redis memory, and DB connection pool.
- Files: `backend/app/api/chat.py` (line 30), `backend/app/services/task.py` (lines 28-45)
- Current mitigation: None.
- Recommendations: Add per-user rate limiting (e.g., via `slowapi` or a Redis-based token bucket). Limit concurrent tasks per user.

**No Input Sanitization on `query` or `system_message`:**
- Risk: User-supplied text is passed directly to the LLM. Prompt injection attacks could cause the agent to execute dangerous tools (which are HITL-gated, but the reject message is also user-controlled).
- Files: `backend/app/models/chat.py` (lines 8-12), `backend/app/services/task.py` (line 38)
- Current mitigation: HITL approval on dangerous tools (`execute`, `write_file`, `edit_file`, `book_hotel`). But the single-user setup means the user approves their own actions, making HITL a UX feature rather than a security boundary.
- Recommendations: Add input length limits on `query` and `system_message` fields. Consider output filtering for the agent's tool invocations.

**Hardcoded Default Password in DB URI:**
- Risk: `backend/app/config.py` line 18 contains `postgresql://postgres:password@localhost:5432/...` as the default `db_uri`. If `.env` is missing or misconfigured, the app connects with a known weak password.
- Files: `backend/app/config.py` (line 18)
- Current mitigation: `.env` file overrides the default in practice.
- Recommendations: Remove the default password. Fail fast if `DB_URI` is not explicitly configured.

**Redis Without Authentication:**
- Risk: Redis is configured without password (`backend/app/infra/redis.py` lines 14-19). Anyone on the network can connect, read session data, and inject fake task events.
- Files: `backend/app/infra/redis.py`, `docker/docker-compose.yml` (line 25)
- Current mitigation: Runs on localhost only.
- Recommendations: Add Redis AUTH before any network-exposed deployment.

**MCP API Key in URL:**
- Risk: The Amap MCP API key is embedded in the URL string (`backend/app/core/tools.py` line 30: `https://mcp.amap.com/mcp?key={settings.amap_maps_api_key}`). This key may appear in error messages, logs, and stack traces.
- Files: `backend/app/core/tools.py` (line 30)
- Current mitigation: None.
- Recommendations: Ensure the URL is never logged. Consider if the MCP client supports header-based auth.

## Performance Bottlenecks

**New Agent Created Per Task:**
- Problem: Every `_run_agent` call creates a new agent via `AgentService.create_agent()`, which initializes the LLM client, fetches MCP tools, and constructs the full agent graph.
- Files: `backend/app/services/task.py` (line 76), `backend/app/core/agent.py` (lines 20-51)
- Cause: `create_deep_agent` builds the entire LangGraph graph each time. LLM client instantiation includes validation and HTTP session setup.
- Improvement path: Cache the compiled graph and reuse it across tasks. LangGraph's `CompiledStateGraph` is designed to be shared — state is isolated via `thread_id` in the config. Only the `system_prompt` varies, which could be injected as a runtime configurable.

**LLM Client Re-instantiated Every Call:**
- Problem: `get_llm()` in `backend/app/infra/llm.py` creates new `ChatOpenAI` and `OpenAIEmbeddings` instances on every call. No caching.
- Files: `backend/app/infra/llm.py` (lines 61-128)
- Cause: `get_llm` is a pure function with no memoization.
- Improvement path: Cache the LLM instances at module level (guarded by settings hash) since `ChatOpenAI` is thread-safe and reusable.

**Session TTL Resets on Every Touch:**
- Problem: `SessionService.touch()` does a read-modify-write cycle (GET + JSON parse + SET) to update `last_updated`. For chatty clients, this is 2 Redis round-trips per message.
- Files: `backend/app/services/session.py` (lines 66-78)
- Cause: Session data stored as a JSON string in a single key, requiring full deserialization to update one field.
- Improvement path: Use Redis HASH instead of JSON string for session data. Update individual fields with `HSET` and refresh TTL with a single `EXPIRE`.

## Fragile Areas

**MCP Lock Initialization Race:**
- Files: `backend/app/core/tools.py` (lines 23-24)
- Why fragile: `_mcp_lock` is initialized lazily with `if _mcp_lock is None: _mcp_lock = asyncio.Lock()`. In theory, two coroutines could both see `None` and create separate locks, defeating the double-check pattern. In practice, Python's GIL makes this safe for CPython, but it is an antipattern and will break under alternative runtimes.
- Safe modification: Initialize the lock at import time or use `asyncio.Lock()` as a module-level default.
- Test coverage: No tests for `get_mcp_tools` concurrency.

**SSE Stream Does Not Handle Client Disconnect:**
- Files: `backend/app/api/chat.py` (lines 92-117), `backend/app/infra/task_bus.py` (lines 81-120)
- Why fragile: When the client disconnects from the SSE endpoint, `StreamingResponse` raises `asyncio.CancelledError` or similar. The `read_events` generator has no cleanup — the `while True` loop with `xread(block=5000)` will keep polling Redis until the task reaches a terminal status.
- Safe modification: Add a `try/finally` or `asynccontextmanager` pattern to the event stream generator. FastAPI's `StreamingResponse` will cancel the generator, but the Redis `xread` call may not be interrupted cleanly mid-block.
- Test coverage: No tests for SSE endpoint at all.

**Database Schema Setup Missing:**
- Files: `backend/app/infra/database.py` (lines 18-27)
- Why fragile: `AsyncPostgresSaver` and `AsyncPostgresStore` require `.setup()` to create their checkpoint/store tables. `database.py` never calls it. The 07 codebase had these calls commented out (`07_DeepAgentHILApiMultiSessionTask/01_backendServer.py` lines 105, 109). If running against a fresh database, the first agent invocation will crash with missing table errors.
- Safe modification: Add `await self.checkpointer.setup()` and `await self.store.setup()` to `Database.connect()`. These are idempotent — safe to call on existing schemas.
- Test coverage: Not tested.

**Service Singletons via Module-Level Globals:**
- Files: `backend/app/api/deps.py` (lines 19-42)
- Why fragile: `_task_service`, `_session_service`, `_memory_service` are module-level globals initialized lazily without locks. `TaskService` holds `self._running` (a dict of asyncio tasks) — if FastAPI somehow creates a second instance, running tasks would be split across two dicts and `cancel_all()` would miss some.
- Safe modification: Use FastAPI's `app.state` to hold service instances, initialized in the lifespan. This is the standard pattern and ensures cleanup on shutdown.
- Test coverage: Tests override via `dependency_overrides` (correct), but don't test the singleton behavior itself.

## Test Coverage Gaps

**No Integration Tests for Agent Execution:**
- What's not tested: The entire `TaskService._run_agent` → `parse_agent_events` → `task_bus.publish_event` pipeline. Tests mock all services at the API layer.
- Files: `backend/app/services/task.py`, `backend/app/core/streaming.py`, `backend/app/core/agent.py`
- Risk: The core value path (user sends query → agent runs → events stream back) has zero test coverage. Any change to LangGraph's streaming protocol or deepagents' middleware could silently break production.
- Priority: High

**No Tests for SSE Streaming Endpoint:**
- What's not tested: `GET /api/chat/stream/{task_id}` — the SSE format, event ordering, `from_id` resumption, and client disconnect behavior.
- Files: `backend/app/api/chat.py` (lines 92-117)
- Risk: SSE format is protocol-sensitive (newlines, event/data fields). A formatting bug breaks all real-time communication.
- Priority: High

**No Tests for Session Service:**
- What's not tested: `SessionService` methods — create, touch, list, delete, expired session cleanup.
- Files: `backend/app/services/session.py`
- Risk: The expired session cleanup logic in `list_sessions` (lines 94-104) is particularly tricky — it removes stale SET members via pipeline. Any bug silently corrupts the session index.
- Priority: Medium

**No Tests for Task Bus (Redis Stream):**
- What's not tested: `task_bus.create_task_meta`, `publish_event`, `read_events`, TTL expiry behavior.
- Files: `backend/app/infra/task_bus.py`
- Risk: The `read_events` generator has complex termination logic (terminal status check, drain on exit). Untested edge cases: task expires mid-stream, Redis connection lost, concurrent read/write.
- Priority: Medium

**No Tests for Database Lifecycle:**
- What's not tested: `Database.connect()` / `disconnect()`, pool behavior, checkpointer/store initialization.
- Files: `backend/app/infra/database.py`
- Risk: Connection pool misconfiguration (e.g., `prepare_threshold=0` workaround) could cause silent failures under load.
- Priority: Low

**conftest.py Mocks All External Dependencies at sys.modules Level:**
- What's not tested: The actual import chain — whether the real `langgraph`, `deepagents`, `redis`, `psycopg` packages work together.
- Files: `backend/tests/conftest.py` (lines 14-30)
- Risk: Tests pass but the app crashes on startup because of a version incompatibility or missing attribute. The `MagicMock` modules return `MagicMock` for any attribute access, masking real import errors.
- Priority: Medium — consider adding a single smoke test that imports without mocks (skipped in CI if deps unavailable).

## Scaling Limits

**In-Process Task Tracking:**
- Current capacity: `TaskService._running` is a local dict. Works for a single uvicorn worker.
- Limit: Multiple workers cannot share the `_running` dict. `cancel_all()` on shutdown only cancels tasks in the current process. With `uvicorn --workers N`, tasks are silently orphaned when a worker restarts.
- Scaling path: The Redis-based task_bus already tracks status externally. For multi-worker, rely on `task_bus` status and add a periodic cleanup for stale `running` tasks (heartbeat pattern).

**Session Data in Redis with Short TTL:**
- Current capacity: `session_ttl` defaults to 3600 seconds (1 hour). Session data expires after 1 hour of inactivity.
- Limit: Long-running conversations or users who step away lose their session metadata. The PostgreSQL checkpointer preserves agent state, but the session index in Redis vanishes.
- Scaling path: Increase TTL or add a persistence layer for session metadata (PostgreSQL). Keep Redis as a hot cache only.

## Dependencies at Risk

**`deepagents` Library — Unpinned Version:**
- Risk: `pyproject.toml` lists `deepagents` without a version pin. This is a critical dependency (`create_deep_agent` is the core agent factory). Any breaking change in a new release could break the entire system silently.
- Files: `backend/pyproject.toml` (line 12)
- Impact: `pip install` could pull a new version with incompatible middleware API, SubAgent config format, or streaming behavior.
- Migration plan: Pin to a specific version (e.g., `deepagents==X.Y.Z`). Add a CI step that tests against the pinned version.

**`langchain-mcp-adapters` — Unpinned Version:**
- Risk: Also unpinned. The MCP protocol and transport layer are evolving rapidly. A breaking change in `MultiServerMCPClient` or `streamable_http` transport would break tool loading.
- Files: `backend/pyproject.toml` (line 13)
- Impact: MCP tool fetching fails → agent has no researcher subagent tools.
- Migration plan: Pin the version.

---

*Concerns audit: 2026-04-12*
