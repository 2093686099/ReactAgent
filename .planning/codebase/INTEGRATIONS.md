# External Integrations

**Analysis Date:** 2026-04-12

## APIs & External Services

**LLM Providers (OpenAI-compatible API, all via `ChatOpenAI` / `OpenAIEmbeddings`):**

All providers are accessed through a unified `ChatOpenAI` client with different `base_url` values. Provider selection is controlled by `settings.llm_type` (default: `modelscope`). Configuration in `backend/app/infra/llm.py`.

- **ModelScope** (default) - MiniMax-M2.5 chat + BAAI/bge-m3 embeddings
  - SDK/Client: `langchain_openai.ChatOpenAI` / `OpenAIEmbeddings`
  - Base URL: `https://api-inference.modelscope.cn/v1`
  - Auth: `MODELSCOPE_API_KEY`

- **Alibaba Qwen (DashScope)** - qwen-max chat + text-embedding-v1 embeddings
  - Base URL: `https://dashscope.aliyuncs.com/compatible-mode/v1`
  - Auth: `DASHSCOPE_API_KEY`

- **OpenAI** - gpt-4o-mini chat + text-embedding-3-small embeddings
  - Base URL: configurable via `OPENAI_BASE_URL`
  - Auth: `OPENAI_API_KEY`

- **Tencent MaaS** - glm-5 chat (embeddings fallback to ModelScope bge-m3)
  - Base URL: `https://tokenhub.tencentmaas.com/v1`
  - Auth: `TENCENT_API_KEY` (+ `MODELSCOPE_API_KEY` for embeddings)

- **Ollama** (local) - llama3.1:8b chat + nomic-embed-text embeddings
  - Base URL: `http://localhost:11434/v1`
  - Auth: none (hardcoded `"ollama"`)

**MCP (Model Context Protocol) Services:**
- **Amap (Gaode) Maps MCP** - Geographic search, route planning, POI queries
  - SDK/Client: `langchain_mcp_adapters.client.MultiServerMCPClient`
  - Transport: `streamable_http`
  - URL: `https://mcp.amap.com/mcp?key={AMAP_MAPS_API_KEY}`
  - Auth: `AMAP_MAPS_API_KEY` (passed as URL query parameter)
  - Used by: `researcher` sub-agent (not main agent)
  - Configuration: `backend/app/core/tools.py:28-33`
  - Caching: In-memory with `asyncio.Lock` for thread safety (`_mcp_tools_cache`)

**Development-only MCP Servers (for IDE/Claude Code, not runtime):**
- `langchain-docs` - LangChain/LangGraph documentation via `mcpdoc` (stdio transport)
- `langchain-reference` - LangChain API reference MCP (URL transport: `https://reference.langchain.com/mcp`)
- Configuration: `mcp.json` at project root

## Data Storage

**Databases:**
- PostgreSQL 15
  - Connection: `DB_URI` env var (default: `postgresql://postgres:password@localhost:5432/neuron_ai_assistant?sslmode=disable`)
  - Client: `psycopg_pool.AsyncConnectionPool` (`backend/app/infra/database.py`)
  - Pool: min=5, max=10 (configurable via `DB_POOL_MIN`, `DB_POOL_MAX`)
  - Docker: `docker/docker-compose.yml` - container `neuron_postgres`
  - **Usage 1 - Checkpointing (short-term memory):** `langgraph.checkpoint.postgres.aio.AsyncPostgresSaver`
    - Stores agent graph state per `thread_id` (= session_id)
    - Enables resume from HITL interrupts
  - **Usage 2 - Long-term memory (cross-session):** `langgraph.store.postgres.AsyncPostgresStore`
    - Namespace: `("memories", user_id)`
    - Key: UUID per memory entry
    - Value: `{"data": "..."}` JSON
    - Service: `backend/app/services/memory.py`

**Caching / Session Store / Event Bus:**
- Redis (latest)
  - Connection: `REDIS_HOST:REDIS_PORT/REDIS_DB` (default: `localhost:6379/0`)
  - Client: `redis.asyncio.Redis` with `decode_responses=True` (`backend/app/infra/redis.py`)
  - Docker: `docker/docker-compose.yml` - container `neuron_redis`
  - **Usage 1 - Session management:** `backend/app/services/session.py`
    - `user_sessions:{user_id}` (SET) - user's session IDs
    - `session:{user_id}:{session_id}` (STRING/JSON) - session metadata
    - TTL: `SESSION_TTL` (default 3600s)
  - **Usage 2 - Task event bus:** `backend/app/infra/task_bus.py`
    - `task:{task_id}` (HASH) - task metadata (status, user_id, session_id)
    - `task:{task_id}:events` (STREAM) - SSE event stream (token, tool, hitl, done, error)
    - TTL: `TASK_TTL` (default 3600s)
    - Uses Redis Streams (`XADD` / `XREAD` with blocking)

**File Storage:**
- `deepagents.backends.store.StoreBackend` - Agent file operations backed by `AsyncPostgresStore`
- No external file storage (S3, etc.)

## Authentication & Identity

**Auth Provider:**
- None (single-user mode)
  - Implementation: `backend/app/api/deps.py:get_current_user()` returns `settings.default_user_id`
  - Future plan: JWT from `Authorization` header (noted in code comment)
  - All API endpoints use `Depends(get_current_user)` — when auth is added, only `get_current_user()` needs to change

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry, Datadog, etc.)

**Logs:**
- Python `logging` module, configured centrally in `backend/app/main.py:setup_logging()`
- Format: `%(asctime)s - %(name)s - %(levelname)s - %(message)s`
- Level: INFO (default), third-party `httpx`/`httpcore` set to WARNING
- Log file settings exist in config (`LOG_FILE`, `LOG_MAX_BYTES`, `LOG_BACKUP_COUNT`) but file handler is not wired up in `backend/` (was used in 07 with `concurrent-log-handler`)

## CI/CD & Deployment

**Hosting:**
- Local development only (no cloud deployment configuration detected)
- uvicorn single-process with `--reload` for development

**CI Pipeline:**
- None detected (no `.github/workflows/`, no `Jenkinsfile`, no `.gitlab-ci.yml`)

**Docker:**
- `docker/docker-compose.yml` - Infrastructure only (PostgreSQL 15 + Redis latest)
- No application Dockerfile

## Environment Configuration

**Required env vars (minimum to run):**
- At least one LLM API key matching `LLM_TYPE`:
  - `modelscope` (default): `MODELSCOPE_API_KEY`
  - `qwen`: `DASHSCOPE_API_KEY`
  - `openai`: `OPENAI_API_KEY` (+ `OPENAI_BASE_URL` if not using OpenAI directly)
  - `tencent`: `TENCENT_API_KEY` (+ `MODELSCOPE_API_KEY` for embeddings)
  - `ollama`: none (local)
- `AMAP_MAPS_API_KEY` - Required if using MCP tools (Amap maps)

**Optional env vars (have working defaults):**
- `DB_URI` - PostgreSQL (default: `postgresql://postgres:password@localhost:5432/neuron_ai_assistant?sslmode=disable`)
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB` - Redis (default: `localhost:6379/0`)
- `LLM_TYPE` - Provider selector (default: `modelscope`)
- `DEFAULT_USER_ID` - User identifier (default: `default`)
- `SESSION_TTL` - Session expiration in seconds (default: `3600`)
- `TASK_TTL` - Task metadata/events expiration in seconds (default: `3600`)
- `HOST`, `PORT` - Server bind (default: `0.0.0.0:8001`)
- `LOG_FILE`, `LOG_MAX_BYTES`, `LOG_BACKUP_COUNT` - Logging config

**Secrets location:**
- `.env` file at project root (gitignored)

## Webhooks & Callbacks

**Incoming:**
- None (no webhook endpoints)

**Outgoing:**
- None (no outbound webhook calls)

## Real-time Communication

**Server-Sent Events (SSE):**
- `GET /api/chat/stream/{task_id}` - Streams agent events to frontend (`backend/app/api/chat.py:92`)
- Events: `token` (text chunks), `tool` (tool call status), `todo` (todo list updates), `hitl` (interrupt), `done` (completion), `error`
- Supports reconnection via `from_id` query parameter (maps to Redis Stream entry ID)
- Backend writes events to Redis Stream, SSE endpoint reads and forwards
- Headers: `Cache-Control: no-cache`, `X-Accel-Buffering: no` (nginx-compatible)

---

*Integration audit: 2026-04-12*
