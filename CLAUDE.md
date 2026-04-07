# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a progressive teaching project that builds a production-grade ReAct Agent step by step. Each numbered directory adds a new capability on top of the previous one:

```
01 基础Agent+MCP → 02 +人工审查(HITL) → 03 +记忆系统 → 04 +API服务化 → 05 +多会话管理 → 06 +异步任务(Celery)
```

- **01-03**: Standalone scripts for concept validation
- **04-06**: Frontend/backend split architecture (FastAPI + Rich CLI)

## Tech Stack

- **Agent Framework**: LangGraph (`create_react_agent`) + LangChain
- **LLM Providers**: Qwen (DashScope), OpenAI, OneAPI, Ollama — configured via `utils/config.py` `LLM_TYPE`
- **MCP**: `langchain-mcp-adapters` for Amap (Gaode Maps) MCP Server integration
- **HITL**: LangGraph `interrupt()` / `Command(resume=...)` pattern
- **Memory**: PostgreSQL via `AsyncPostgresSaver` (short-term checkpointer) and `AsyncPostgresStore` (long-term cross-session)
- **Session Management**: Redis (async) with TTL-based expiration
- **API**: FastAPI backend, Rich-based CLI frontend using `requests`
- **Async Tasks** (06 only): Celery with Redis as broker

## Running the Project (04-06)

```bash
# 1. Start infrastructure
cd docker/postgresql && docker-compose up -d
cd docker/redis && docker-compose up -d

# 2. Start backend
python 01_backendServer.py

# 3. Start frontend (separate terminal)
python 02_frontendServer.py

# 4. (06 only) Start Celery worker BEFORE backend
celery -A 01_backendServer.celery_app worker --loglevel=info
```

For 01-03, just run the individual Python scripts directly.

## Architecture (04-06)

### Backend (`01_backendServer.py`)
FastAPI app exposing REST endpoints:
- `POST /agent/invoke` — Start agent run, returns `interrupted` or `completed`
- `POST /agent/resume` — Resume from HITL interrupt with user feedback
- `GET /agent/status/{user_id}` — Session status (for fault recovery)
- `DELETE /agent/session/{user_id}` — Clear session

In 06, invoke/resume are async Celery tasks returning `task_id`; client polls `GET /task/{task_id}`.

### Frontend (`02_frontendServer.py`)
Rich-based CLI that calls backend API via `requests`. Handles HITL interaction loop (accept/edit/response/reject).

### Utils Module (`utils/`)
- `config.py` — All configuration: DB_URI, Redis, LLM_TYPE, ports, timeouts
- `llms.py` — `initialize_llm()` returns `(ChatOpenAI, OpenAIEmbeddings)` based on LLM_TYPE
- `tools.py` — `get_tools()` loads MCP tools + custom tools, wraps with HITL
- `models.py` (05/06) — Pydantic request/response models
- `redis.py` (05/06) — `RedisSessionManager` for session CRUD with TTL
- `tasks.py` (06) — Celery task definitions for async agent execution

### HITL Flow
1. Agent calls tool → `interrupt()` pauses graph execution
2. Backend returns `interrupted` status with tool call details
3. Frontend prompts user for one of 4 response types:
   - `accept` — proceed with original args
   - `edit` — modify tool args (user provides new JSON)
   - `response` — skip tool, inject custom result
   - `reject` — cancel tool call
4. Frontend sends choice to `POST /agent/resume`
5. Backend uses `Command(resume=...)` to continue graph

### Session Keys (Redis)
- 04: `session:{user_id}`
- 05: `session:{user_id}:{session_id}`
- 06: `session:{user_id}:{session_id}:{task_id}`

## Infrastructure

**PostgreSQL** (port 5432): user=`kevin`, password=`123456`
**Redis** (port 6379): default config

## Key Environment Variables

- `DASHSCOPE_API_KEY` — Qwen/Alibaba model
- `AMAP_MAPS_API_KEY` — Gaode Maps MCP Server
- `OPENAI_API_KEY` / `OPENAI_BASE_URL` — OpenAI or compatible
- `DB_URI` — PostgreSQL connection (overrides config.py default)

## Python Environment

```bash
conda create -n ReActAgents python=3.11
```

Pin versions matter — see each directory's README for exact versions. Key: `langgraph==0.4.5`, `langchain==0.3.25`, `langchain-openai==0.3.17`.
