# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 工作准则（优先于项目细节）

> 偏向谨慎而非速度。平凡任务可自行判断。

**交互**
- 全部用中文回复。

**1. 想清楚再写 — 不假设、不掩盖困惑、把 tradeoff 摆出来**
- 明确陈述假设；不确定就问。
- 多种解读并存时，把它们摆出来，不要默默选一个。
- 有更简单的路径就说出来，必要时反驳。
- 有不清楚的地方，停下来，指出困惑点，发问。

**2. 简洁优先 — 解决问题所需的最小代码，不做投机性设计**
- 不加超出需求的功能。
- 不为一次性代码造抽象。
- 不加未被要求的"灵活性"或可配置项。
- 不为不可能发生的场景写错误处理。
- 写了 200 行能压到 50 行的，重写。
- 自问："资深工程师会说这过度设计吗？"会，就简化。

**3. 外科手术式改动 — 只动必须动的，只清理自己的残留**
- 不"顺手改进"周围的代码、注释、格式。
- 不重构没坏的东西。
- 匹配现有风格，即使自己会用另一种写法。
- 注意到无关的死代码，提一下，不要自己删。
- 自己改动产生的孤儿 import/变量/函数自己清掉；已有的死代码不要动。
- 判据：每一行改动都应能直接追溯到用户需求。

**4. 目标驱动执行 — 定义成功标准，循环直到验证通过**
- "加校验" → "为非法输入写测试，然后让它们通过"。
- "修 bug" → "写一个能重现的测试，然后让它通过"。
- "重构 X" → "确保前后测试都通过"。
- 多步任务先给出简短计划，每步都要有可验证的 check。

---

## Project Overview

AI Agent 智能体应用，以 `07_DeepAgentHILApiMultiSessionTask` 为产品底座进行开发。目录 01-06 为历史学习阶段代码，不再维护。

当前架构：FastAPI 后端 + Rich CLI 前端（临时，待重构） + Celery 异步任务 + Redis 会话管理 + PostgreSQL 持久化。

## Tech Stack

- **Agent Framework**: `deepagents` 库的 `create_deep_agent` — 支持子 Agent 编排、任务规划、文件操作、Shell 执行、上下文摘要等能力，底层运行在 LangGraph 上
- **中间件栈**: `create_deep_agent` 自动加载 `TodoListMiddleware` → `FilesystemMiddleware` → `SubAgentMiddleware` → `SummarizationMiddleware` → `HumanInTheLoopMiddleware` 等；用户自定义中间件插入在 base stack 和 tail stack 之间
- **子 Agent**: 主 Agent 持有自定义工具，MCP 工具委派给 `researcher` 子 Agent（`SubAgent` 声明式配置）
- **LLM**: 多提供商支持（ModelScope/Qwen/OpenAI/Ollama），通过 `utils/config.py` 的 `LLM_TYPE` 切换，当前默认 `modelscope`（MiniMax-M2.5）
- **MCP**: `langchain-mcp-adapters` 连接高德地图 MCP Server（streamable_http 传输）
- **HITL**: `HumanInTheLoopMiddleware` + `Command(resume={"decisions": [...]})` 官方 v2 协议，支持 approve/edit/reject 三种决策
- **Memory**: PostgreSQL — `AsyncPostgresSaver`（短期/checkpointer）+ `AsyncPostgresStore`（长期/跨会话）+ `StoreBackend`（文件持久化）
- **Session**: Redis async，三级 key 结构 `session:{user_id}:{session_id}:{task_id}`
- **Async Tasks**: Celery + Redis broker，invoke/resume 均为异步任务，客户端轮询 `task:{task_id}`

## Running the Project

```bash
# 工作目录
cd 07_DeepAgentHILApiMultiSessionTask

# 1. 启动基础设施
cd docker/postgresql && docker-compose up -d && cd ../..
cd docker/redis && docker-compose up -d && cd ../..

# 2. 启动 Celery Worker（必须先于后端）
celery -A 01_backendServer.celery_app worker --loglevel=info

# 3. 启动后端 (port 8001)
python 01_backendServer.py

# 4. 启动前端（另一个终端）
python 02_frontendServer.py
```

## Architecture

### Backend (`01_backendServer.py`)
FastAPI app，纯路由层 — 不包含 agent 创建逻辑。所有 agent 执行在 Celery worker 中完成。

**API 端点:**
- `POST /agent/invoke` — 提交用户查询，异步执行，立即返回 task_id
- `POST /agent/resume` — 提交 HITL 决策恢复中断的 agent
- `GET /agent/status/{user_id}/{session_id}/{task_id}` — 轮询任务状态
- `GET /agent/active/sessionid/{user_id}` — 获取用户最近活跃会话
- `GET /agent/sessionids/{user_id}` — 用户所有会话列表
- `GET /agent/tasks/{user_id}/{session_id}` — 会话下所有任务及状态
- `POST /agent/write/longterm` — 写入长期记忆
- `DELETE /agent/session/{user_id}/{session_id}` — 删除会话
- `DELETE /agent/task/{user_id}/{session_id}/{task_id}` — 删除任务
- `GET /system/info` — 系统全局会话统计

### Agent 核心 (`utils/tasks.py`)
Celery 任务定义，包含 agent 的完整生命周期：
- `invoke_agent_task` — 创建 `create_deep_agent`，配置子 Agent/中间件/HITL，通过 `stream_and_collect_result` 流式执行
- `resume_agent_task` — 从 checkpointer 恢复 agent 状态，注入 `Command(resume=...)` 继续执行
- 每次任务都独立创建 DB 连接池和 agent 实例（Celery worker 进程隔离）

### HITL 决策流
1. Agent 调用工具 → `HumanInTheLoopMiddleware` 按 `interrupt_on` 配置拦截
2. `stream_and_collect_result` 捕获 `__interrupt__` 事件，写入 Redis
3. 前端轮询发现 `interrupted` 状态，展示工具调用详情
4. 用户选择 approve/edit/reject → `POST /agent/resume`
5. 后端构造 `{"decisions": [...]}` → `Command(resume=...)` 恢复 graph

### HITL 工具审批配置 (`utils/tools.py`)
- 危险操作需审批：`book_hotel`, `execute`, `write_file`, `edit_file`
- 安全操作免审批：`multiply`, `read_file`, `ls`, `glob`, `grep`, `write_todos`, `task`

### Utils 模块
| 文件 | 职责 |
|------|------|
| `config.py` | 集中配置：DB/Redis/Celery/LLM/端口 |
| `llms.py` | `initialize_llm()` 根据 LLM_TYPE 返回 `(ChatOpenAI, OpenAIEmbeddings)` |
| `tools.py` | MCP 工具获取、自定义工具定义、HITL 配置生成 |
| `models.py` | Pydantic 请求/响应模型（AgentRequest, AgentResponse, InterruptResponse 等） |
| `redis.py` | `RedisSessionManager` — 多用户多会话多任务的 Redis CRUD |
| `tasks.py` | Celery 任务 + agent 创建 + 流式收集 + 结果处理 |

## Infrastructure

- **PostgreSQL** (port 5432): user=`kevin`, password=`123456`, docker-compose 位于 `07.../docker/postgresql/`
- **Redis** (port 6379): 默认配置, docker-compose 位于 `07.../docker/redis/`
- **注意**: `config.py` 中 DB_URI 默认连接的数据库名为 `neuron_ai_assistant`，用户名为 `postgres`，与 docker-compose 中的 `kevin` 用户不同 — 需按实际环境配置 `.env` 中的 `DB_URI`

## Environment Variables

通过 `.env` 文件加载（项目根目录），关键变量：
- `DASHSCOPE_API_KEY` — 阿里通义千问
- `MODELSCOPE_API_KEY` — ModelScope 平台（当前默认）
- `AMAP_MAPS_API_KEY` — 高德地图 MCP Server
- `OPENAI_API_KEY` / `OPENAI_BASE_URL` — OpenAI 或兼容接口
- `DB_URI` — PostgreSQL 连接串（覆盖 config.py 默认值）

## Python Environment

```bash
conda create -n ReActAgents python=3.11
```

关键版本锁定：`langgraph==1.1.6`, `langchain==1.2.15`, `langchain-openai==1.1.12`, `langgraph-checkpoint-postgres==3.0.5`, `celery==5.5.3`, `redis==6.2.0`

## MCP Server 配置

项目配置了 LangChain 文档 MCP Server 供开发时查阅 API：
- `langchain-docs`: 通过 `mcpdoc` 提供 langchain/langgraph 的 llms.txt
- `langchain-reference`: LangChain 官方 API 参考 MCP
