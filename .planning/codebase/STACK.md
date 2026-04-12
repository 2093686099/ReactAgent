# Technology Stack

**Analysis Date:** 2026-04-12

## Languages

**Primary:**
- Python >=3.11 - All backend code (recommended via `conda create -n ReActAgents python=3.11`)

**Secondary:**
- None detected (no frontend code in `backend/`; CORS configured for `http://localhost:3000` implying a separate Next.js frontend)

## Runtime

**Environment:**
- CPython 3.11+ (conda environment `ReActAgents`)
- No `.python-version` file; version constraint in `backend/pyproject.toml` line 4: `requires-python = ">=3.11"`

**Package Manager:**
- pip (via `pyproject.toml` at `backend/pyproject.toml`)
- Root-level `requirements.txt` exists at project root (historical, for 07 directory)
- No lockfile (no `requirements.lock`, `poetry.lock`, or `uv.lock`)

## Frameworks

**Core:**
- FastAPI 0.115.12 - HTTP API server (`backend/app/main.py`)
- LangGraph 1.1.6 - Agent orchestration graph runtime
- LangChain 1.2.15 - LLM abstraction layer
- `deepagents` (unpinned) - High-level agent creation framework (`create_deep_agent`)

**Testing:**
- pytest >=8.0 - Test runner (dev dependency in `backend/pyproject.toml`)
- pytest-asyncio >=0.23 - Async test support (`asyncio_mode = "auto"`)
- httpx - FastAPI async test client (via `ASGITransport`)

**Build/Dev:**
- ruff - Linter + formatter (config: `line-length = 120` in `backend/pyproject.toml`)
- uvicorn[standard] - ASGI server with hot reload (`backend/app/main.py:70`)

## Key Dependencies

**Critical (agent pipeline):**
- `langgraph==1.1.6` - Compiled state graph, streaming, checkpointing
- `langchain==1.2.15` - Tool definitions, middleware (SummarizationMiddleware)
- `langchain-openai==1.1.12` - `ChatOpenAI` and `OpenAIEmbeddings` for all LLM providers (OpenAI-compatible API)
- `deepagents` (unpinned) - `create_deep_agent`, `SubAgent`, `StoreBackend`, middleware stack (TodoList, Filesystem, SubAgent, Summarization, HITL)
- `langchain-mcp-adapters` (unpinned) - `MultiServerMCPClient` for MCP tool integration
- `langgraph-checkpoint-postgres==3.0.5` - `AsyncPostgresSaver` (checkpointer) + `AsyncPostgresStore` (long-term memory)

**Infrastructure:**
- `redis>=5.0` - Async Redis client (`redis.asyncio`) for session management and task event bus
- `psycopg[binary,pool]` - PostgreSQL async driver + connection pooling (`AsyncConnectionPool`)
- `pydantic-settings>=2.0` - Settings management with `.env` file loading (`backend/app/config.py`)
- `python-dotenv` - Environment variable loading

**Historical (root `requirements.txt` only, not in `backend/pyproject.toml`):**
- `celery==5.5.3` - Was used in 07 for async tasks; `backend/` uses native `asyncio.Task` instead
- `redis==6.2.0` - Pinned version in root requirements
- `rich==14.0.0` - CLI frontend (07 only)
- `concurrent-log-handler==0.9.28` - Rotating file logger (07 only)

## Configuration

**Environment:**
- Single `.env` file at project root: `/Users/neuron/文稿/2 私人/ReActAgents/.env`
- Loaded by `pydantic_settings.BaseSettings` in `backend/app/config.py`
- `Settings` class with defaults for all values; `.env` overrides
- Key env vars (names only):
  - `DB_URI` - PostgreSQL connection string
  - `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB` - Redis connection
  - `LLM_TYPE` - LLM provider selector (default: `modelscope`)
  - `MODELSCOPE_API_KEY` - ModelScope platform key (current default provider)
  - `DASHSCOPE_API_KEY` - Alibaba Qwen API
  - `OPENAI_API_KEY`, `OPENAI_BASE_URL` - OpenAI or compatible
  - `TENCENT_API_KEY` - Tencent MaaS
  - `AMAP_MAPS_API_KEY` - Amap (Gaode) MCP server
  - `DEFAULT_USER_ID` - Single-user mode identifier
  - `SESSION_TTL`, `TASK_TTL` - Redis key expiration (seconds)
  - `HOST`, `PORT` - Server bind (default `0.0.0.0:8001`)

**Build:**
- `backend/pyproject.toml` - Project metadata, dependencies, tool config
- No Dockerfile for the application itself (only infrastructure in `docker/docker-compose.yml`)

**Linting/Formatting:**
- `[tool.ruff]` in `backend/pyproject.toml`: `line-length = 120`

**Test Config:**
- `[tool.pytest.ini_options]` in `backend/pyproject.toml`: `asyncio_mode = "auto"`, `testpaths = ["tests"]`

## Platform Requirements

**Development:**
- Python 3.11+ (conda recommended)
- Docker / Docker Compose (for PostgreSQL 15 and Redis)
- Access to at least one LLM API (ModelScope default, or OpenAI/Qwen/Ollama/Tencent)

**Production:**
- Single-process uvicorn (no Celery in new backend; agent tasks run as `asyncio.Task` in-process)
- PostgreSQL 15 (checkpointing + long-term memory)
- Redis latest (sessions + task event streaming via Redis Streams)
- Target: `0.0.0.0:8001` (configurable via `HOST`/`PORT` env vars)

---

*Stack analysis: 2026-04-12*
