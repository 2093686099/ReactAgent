# Codebase Structure

**Analysis Date:** 2026-04-12

## Directory Layout

```
ReActAgents/                          # Project root (git root)
├── .env                              # Environment variables (secrets -- DO NOT read)
├── .gitignore                        # Git ignore rules
├── .mcp.json                         # MCP server config for dev tooling
├── CLAUDE.md                         # Project instructions for Claude Code
├── requirements.txt                  # Legacy top-level deps (07 era)
│
├── backend/                          # Active codebase -- FastAPI application
│   ├── pyproject.toml                # Package definition, dependencies, tool config
│   ├── app/                          # Application source code
│   │   ├── __init__.py
│   │   ├── main.py                   # FastAPI app factory, lifespan, CORS, routers
│   │   ├── config.py                 # Pydantic Settings (centralized config)
│   │   ├── api/                      # HTTP routing layer
│   │   │   ├── __init__.py
│   │   │   ├── deps.py              # DI providers (get_current_user, service singletons)
│   │   │   ├── chat.py              # /api/chat/* endpoints (invoke, resume, stream SSE)
│   │   │   ├── sessions.py          # /api/sessions/* endpoints (CRUD)
│   │   │   └── memory.py            # /api/memory/* endpoints (read/write long-term)
│   │   ├── core/                     # Domain logic layer
│   │   │   ├── __init__.py
│   │   │   ├── agent.py             # AgentService -- deepagents agent factory
│   │   │   ├── streaming.py         # parse_agent_events() -- LangGraph stream parser
│   │   │   ├── hitl.py              # build_decisions() -- HITL decision protocol
│   │   │   ├── tools.py             # MCP tools, custom tools, HITL config
│   │   │   └── exceptions.py        # BusinessError hierarchy
│   │   ├── services/                 # Business orchestration layer
│   │   │   ├── __init__.py
│   │   │   ├── task.py              # TaskService -- agent execution lifecycle
│   │   │   ├── session.py           # SessionService -- Redis session CRUD
│   │   │   └── memory.py            # MemoryService -- PostgresStore long-term memory
│   │   ├── infra/                    # Infrastructure / external systems
│   │   │   ├── __init__.py
│   │   │   ├── database.py          # Database singleton (PG pool + checkpointer + store)
│   │   │   ├── redis.py             # RedisManager singleton
│   │   │   ├── task_bus.py          # Redis Stream event bus (task meta + events)
│   │   │   └── llm.py              # Multi-provider LLM factory
│   │   └── models/                   # Pydantic request/response models
│   │       ├── __init__.py
│   │       └── chat.py             # ChatRequest, ResumeRequest, TaskCreatedResponse
│   └── tests/                        # Test suite
│       ├── __init__.py
│       ├── conftest.py              # Fixtures, sys.modules mocks, test client
│       ├── test_api/                # API integration tests
│       │   ├── __init__.py
│       │   └── test_chat.py
│       └── test_core/               # Core logic unit tests
│           ├── __init__.py
│           ├── test_hitl.py
│           └── test_streaming.py
│
├── docker/                           # Infrastructure containers
│   └── docker-compose.yml           # PostgreSQL 15 + Redis (unified)
│
├── 07_DeepAgentHILApiMultiSessionTask/  # Legacy monolith (reference only, not maintained)
│   ├── 01_backendServer.py          # Legacy FastAPI + Celery backend
│   ├── 02_frontendServer.py         # Legacy Rich CLI frontend
│   ├── utils/                       # Legacy utility modules
│   ├── docker/                      # Legacy separate docker-compose files
│   └── docs/                        # Legacy documentation PDFs
│
└── logfile/                          # Application log output directory
```

## Directory Purposes

**`backend/app/api/`:**
- Purpose: HTTP request handling and response formatting
- Contains: FastAPI routers, DI dependency providers, SSE formatting
- Key files: `chat.py` (main chat endpoints), `deps.py` (service singletons + auth stub)

**`backend/app/core/`:**
- Purpose: Domain logic that is independent of HTTP transport
- Contains: Agent creation, stream parsing, HITL protocol, tool definitions, exception types
- Key files: `agent.py` (agent factory), `streaming.py` (event parser), `hitl.py` (decision builder)

**`backend/app/services/`:**
- Purpose: Business orchestration bridging API and core/infra layers
- Contains: Task lifecycle, session CRUD, memory CRUD
- Key files: `task.py` (the most complex service -- manages background agent execution)

**`backend/app/infra/`:**
- Purpose: External system adapters (databases, caches, LLM providers)
- Contains: Connection managers, Redis Stream operations, LLM initialization
- Key files: `task_bus.py` (Redis Stream event bus), `database.py` (PG pool lifecycle), `llm.py` (5-provider LLM factory)

**`backend/app/models/`:**
- Purpose: Pydantic schemas for API request/response validation
- Contains: Chat-related models
- Key files: `chat.py` (ChatRequest, ResumeRequest, TaskCreatedResponse, MemoryRequest)

**`backend/tests/`:**
- Purpose: Automated test suite
- Contains: API integration tests (httpx + ASGI transport), core unit tests
- Key files: `conftest.py` (critical -- mocks all external deps via `sys.modules` before any app import)

**`docker/`:**
- Purpose: Local development infrastructure
- Contains: Single `docker-compose.yml` for PostgreSQL 15 and Redis
- Run: `cd docker && docker-compose up -d`

**`07_DeepAgentHILApiMultiSessionTask/`:**
- Purpose: Legacy monolithic implementation (reference only)
- Contains: Backend server, CLI frontend, utility modules
- Status: Not maintained. The `backend/` directory is a clean rewrite of this codebase.

## Key File Locations

**Entry Points:**
- `backend/app/main.py`: FastAPI app creation, lifespan, router mounting
- `backend/pyproject.toml`: Package definition with all dependencies

**Configuration:**
- `backend/app/config.py`: `Settings` class (pydantic-settings), reads from `.env`
- `.env`: Environment variables (project root, loaded by config.py using absolute path)
- `docker/docker-compose.yml`: PostgreSQL and Redis container definitions

**Core Logic:**
- `backend/app/core/agent.py`: Agent factory -- creates `deepagents` agent with all middleware
- `backend/app/core/streaming.py`: LangGraph `astream()` output parser
- `backend/app/core/hitl.py`: HITL decision protocol converter
- `backend/app/core/tools.py`: Tool definitions + MCP client + HITL interrupt config
- `backend/app/services/task.py`: Agent task lifecycle (start, run, resume, cancel)
- `backend/app/infra/task_bus.py`: Redis Stream event bus (publish + subscribe)

**Testing:**
- `backend/tests/conftest.py`: Test fixtures and external dependency mocking
- `backend/tests/test_api/test_chat.py`: Chat API endpoint tests
- `backend/tests/test_core/test_hitl.py`: HITL decision builder edge case tests
- `backend/tests/test_core/test_streaming.py`: Text extraction utility tests

## Naming Conventions

**Files:**
- Snake_case for all Python modules: `task_bus.py`, `test_chat.py`
- Test files mirror source structure: `app/core/hitl.py` -> `tests/test_core/test_hitl.py`
- Test files prefixed with `test_`: `test_chat.py`, `test_hitl.py`

**Directories:**
- Snake_case, lowercase: `app/`, `api/`, `core/`, `services/`, `infra/`, `models/`
- Test directories prefixed with `test_`: `test_api/`, `test_core/`

**Classes:**
- PascalCase: `TaskService`, `SessionService`, `AgentService`, `RedisManager`, `Database`
- Pydantic models: `ChatRequest`, `ResumeRequest`, `TaskCreatedResponse`
- Exceptions: `BusinessError`, `TaskNotFoundError`, `InvalidDecisionError`

**Functions:**
- Snake_case: `get_mcp_tools()`, `build_decisions()`, `parse_agent_events()`
- Private functions prefixed with `_`: `_extract_text()`, `_run_agent()`, `_format_sse()`
- FastAPI dependencies prefixed with `get_`: `get_current_user()`, `get_task_service()`

**Constants:**
- UPPER_SNAKE_CASE: `STATUS_RUNNING`, `EVT_TOKEN`, `DEFAULT_TEMPERATURE`
- Module-level singletons: lowercase: `db`, `redis_manager`, `settings`

## Where to Add New Code

**New API Endpoint:**
- Create router in `backend/app/api/{resource}.py` with `APIRouter(prefix="/api/{resource}")`
- Register router in `backend/app/main.py`: `app.include_router({resource}.router)`
- Add request/response models to `backend/app/models/{resource}.py`
- Add dependency injection via `backend/app/api/deps.py` if new service needed
- Add tests in `backend/tests/test_api/test_{resource}.py`

**New Service:**
- Create `backend/app/services/{name}.py` with a class following the `SessionService`/`MemoryService` pattern
- Use `@property` for lazy access to infra singletons (`redis_manager.client`, `db.store`)
- Register singleton factory in `backend/app/api/deps.py`
- Add tests in `backend/tests/test_services/test_{name}.py` (directory does not exist yet -- create it)

**New Tool for the Agent:**
- Add `@tool` decorated function in `backend/app/core/tools.py:get_custom_tools()`
- Update HITL config in `backend/app/core/tools.py:get_hitl_config()` if the tool needs approval

**New MCP Integration:**
- Add server config to the `MultiServerMCPClient` dict in `backend/app/core/tools.py:get_mcp_tools()`
- If the MCP tools go to a new sub-agent, add a `SubAgent(...)` entry in `backend/app/core/agent.py`

**New LLM Provider:**
- Add config entry in `backend/app/infra/llm.py:_model_configs()`
- Add corresponding API key field to `backend/app/config.py:Settings`

**New Infrastructure Adapter:**
- Create `backend/app/infra/{name}.py` with a connection manager class (follow `RedisManager` pattern)
- Initialize in `backend/app/main.py:lifespan()` (connect on startup, disconnect on shutdown)

**Utilities / Shared Helpers:**
- Place in appropriate layer: `core/` for domain logic, `infra/` for external adapters
- There is no dedicated `utils/` directory in the new backend -- this is intentional to enforce layer boundaries

## Special Directories

**`backend/.pytest_cache/`:**
- Purpose: pytest cache data
- Generated: Yes
- Committed: No (should be in .gitignore)

**`backend/neuron_assistant.egg-info/`:**
- Purpose: Python package metadata from editable install (`pip install -e .`)
- Generated: Yes
- Committed: No (should be in .gitignore)

**`logfile/`:**
- Purpose: Application log output
- Generated: Yes
- Committed: No (contains runtime data)

**`07_DeepAgentHILApiMultiSessionTask/`:**
- Purpose: Legacy reference code
- Generated: No
- Committed: Yes, but frozen -- do not modify

---

*Structure analysis: 2026-04-12*
