# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

AI Agent 智能体助手。后端已完成迁移（Step 1-3），前端待搭建（Step 4-5）。

当前架构：FastAPI 后端（分层）+ asyncio 后台任务 + SSE 实时推送 + Redis 会话/事件流 + PostgreSQL 持久化。前端计划 Next.js 14 + TypeScript + Tailwind CSS + shadcn/ui。

完整架构设计见 `ARCHITECTURE.md`，迁移指南见 `MIGRATION_GUIDE.md`。

## Design System

前端 UI 必须严格遵循 `DESIGN.md`（Linear 风格设计系统）。所有颜色、字重、间距、圆角、字体特性等 token 以该文件为准，不得自行发挥。

## Tech Stack

- **Agent**: `deepagents` 库的 `create_deep_agent`（LangGraph），支持子 Agent、HITL、任务规划、文件操作
- **中间件**: `SummarizationMiddleware`（上下文摘要）+ `HumanInTheLoopMiddleware`（工具审批）
- **子 Agent**: `researcher`（高德地图 MCP 工具）
- **LLM**: 多提供商（Tencent/ModelScope/Qwen/OpenAI/Ollama），`pydantic-settings` 管理，当前 `.env` 配置为 `tencent`（GLM-5）
- **MCP**: `langchain-mcp-adapters` 连接高德地图（streamable_http），工具列表进程级缓存
- **HITL**: `HumanInTheLoopMiddleware` + `Command(resume={"decisions": [...]})` v2 协议
- **Memory**: PostgreSQL — `AsyncPostgresSaver`（checkpointer）+ `AsyncPostgresStore`（长期记忆）
- **Session**: Redis async，key 结构 `session:{user_id}:{session_id}`
- **Task Bus**: Redis Streams — `task:{task_id}:events`（XADD/XREAD），`task:{task_id}` HASH（元数据）
- **Async**: `asyncio.create_task` 后台执行 agent，SSE 推送事件流（替代 Celery + 轮询）

## Running the Project

```bash
# 1. 启动基础设施
cd docker && docker-compose up -d && cd ..

# 2. 安装依赖
cd backend && pip install -e ".[dev]" && cd ..

# 3. 启动后端 (port 8001)
cd backend && python -m app.main

# 4. 运行测试
cd backend && pytest
```

## Architecture

### 分层结构

```
backend/app/
├── api/          路由层 — 参数校验 + 响应组装
│   ├── chat.py       POST /api/chat/invoke, /resume, GET /stream/{task_id}
│   ├── sessions.py   会话 CRUD
│   ├── memory.py     长期记忆读写
│   └── deps.py       FastAPI 依赖注入（get_current_user, get_*_service）
├── core/         核心业务
│   ├── agent.py      AgentService — create_deep_agent 构建
│   ├── streaming.py  parse_agent_events — astream 事件解析
│   ├── hitl.py       build_decisions — HITL 决策转换
│   ├── tools.py      MCP/自定义工具 + HITL 配置（缓存）
│   ├── exceptions.py BusinessError + TaskNotFoundError/TaskStateError/InvalidDecisionError
│   └── auth.py       JWT 认证（待实现）
├── services/     业务服务
│   ├── task.py       TaskService — 后台任务生命周期
│   ├── session.py    SessionService — Redis 会话管理
│   └── memory.py     MemoryService — PostgresStore 长期记忆
├── infra/        基础设施
│   ├── database.py   PostgreSQL 连接池 + checkpointer + store
│   ├── redis.py      Redis 连接管理
│   ├── llm.py        LLM 初始化（多提供商）
│   └── task_bus.py   Redis Streams 事件总线 + TaskMeta HASH
├── models/       Pydantic 数据模型
│   └── chat.py       ChatRequest, ResumeRequest, TaskCreatedResponse
├── config.py     pydantic-settings 配置管理
└── main.py       FastAPI app 入口 + lifespan + exception_handler
```

### 依赖注入

服务通过 `deps.py` 的 lazy singleton 提供，API 层通过 `Depends` 注入：
- `get_task_service()` → `TaskService`
- `get_session_service()` → `SessionService`
- `get_memory_service()` → `MemoryService`
- `get_current_user()` → `str`（当前返回默认值，Step 4 改为 JWT 解析）

测试时通过 `app.dependency_overrides` 注入 mock。

### HITL 决策流
1. Agent 调用工具 → `HumanInTheLoopMiddleware` 按 `interrupt_on` 配置拦截
2. `parse_agent_events` 产出 `("hitl", ...)` 事件
3. `TaskService` 写入 Redis Stream，设置 task 状态为 `interrupted`
4. SSE 端点推送 hitl 事件到前端
5. 用户选择 approve/edit/reject → `POST /api/chat/resume`
6. `build_decisions` 转换 → `Command(resume=...)` 恢复 graph

### 测试

```bash
cd backend && pytest  # 20 个用例：hitl 单元测试 + streaming 单元测试 + API 集成测试
```

## Infrastructure

- **PostgreSQL** (port 5432): `docker/docker-compose.yml`，默认 user=`postgres`, db=`neuron_ai_assistant`
- **Redis** (port 6379): 同一 docker-compose
- 连接配置通过 `.env` 的 `DB_URI` 覆盖 `config.py` 默认值

## Environment Variables

通过 `.env` 文件加载（项目根目录），关键变量：
- `DB_URI` — PostgreSQL 连接串
- `MODELSCOPE_API_KEY` — ModelScope 平台（当前默认 LLM）
- `DASHSCOPE_API_KEY` — 阿里通义千问
- `AMAP_MAPS_API_KEY` — 高德地图 MCP Server
- `OPENAI_API_KEY` / `OPENAI_BASE_URL` — OpenAI 或兼容接口

## Python Environment

```bash
conda create -n ReActAgents python=3.11
cd backend && pip install -e ".[dev]"
```

依赖管理：`backend/pyproject.toml`。关键版本：`langgraph==1.1.6`, `langchain==1.2.15`, `langchain-openai==1.1.12`, `fastapi==0.115.12`

## MCP Server 配置

项目配置了 LangChain 文档 MCP Server 供开发时查阅 API：
- `langchain-docs`: 通过 `mcpdoc` 提供 langchain/langgraph 的 llms.txt
- `langchain-reference`: LangChain 官方 API 参考 MCP
