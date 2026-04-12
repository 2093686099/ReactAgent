# 迁移指南：07 → 新项目结构

## 总览

分 6 步走，每步可独立验证。前 3 步完成后就能跑通后端，第 4 步开始做前端。

```
Step 1: 搭建项目骨架（目录 + 配置 + 依赖）
Step 2: 迁移基础设施层（DB/Redis/LLM）
Step 3: 迁移核心业务层（Agent/Tools/HITL） + 路由层 + 后台任务 + SSE
Step 4: 搭建 Next.js 前端脚手架
Step 5: 实现聊天 + HITL + 会话管理 UI
Step 6: 清理旧代码，更新 CLAUDE.md
```

---

## Step 1: 搭建项目骨架

### 1.1 创建目录结构

```bash
# 在 ReActAgents 根目录下操作（或新建独立仓库）
mkdir -p backend/app/{api,core,models,services,infra}
mkdir -p backend/tests/{test_api,test_core,test_services}
mkdir -p docker
touch backend/app/__init__.py
touch backend/app/{api,core,models,services,infra}/__init__.py
touch backend/tests/__init__.py
touch backend/tests/conftest.py
```

### 1.2 创建 `backend/pyproject.toml`

替代 `requirements.txt`，统一管理依赖和工具配置。

```toml
[project]
name = "neuron-assistant"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    # Agent 核心
    "langgraph==1.1.6",
    "langchain==1.2.15",
    "langchain-openai==1.1.12",
    "langgraph-checkpoint-postgres==3.0.5",
    "langchain-mcp-adapters",
    "deepagents",

    # API 服务
    "fastapi==0.115.12",
    "uvicorn[standard]",
    "pydantic-settings>=2.0",

    # 基础设施
    "redis>=5.0",
    "psycopg[binary,pool]",
    "python-dotenv",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.23",
    "httpx",          # FastAPI 测试客户端
    "ruff",           # linter + formatter
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[tool.ruff]
line-length = 120
```

### 1.3 创建 `backend/app/config.py`

从 `07/utils/config.py` 迁移，改用 `pydantic-settings`。

```python
# backend/app/config.py
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# 项目根目录：backend/app/config.py → backend/ → 项目根
PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # 用绝对路径定位 .env，避免依赖进程 cwd
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # PostgreSQL
    db_uri: str = "postgresql://postgres:password@localhost:5432/neuron_ai_assistant?sslmode=disable"
    db_pool_min: int = 5
    db_pool_max: int = 10

    # Redis
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    session_ttl: int = 3600

    # LLM
    llm_type: str = "modelscope"
    dashscope_api_key: str = ""
    modelscope_api_key: str = ""
    openai_api_key: str = ""
    openai_base_url: str = ""
    amap_maps_api_key: str = ""

    # 单用户默认标识（未来加登录时从 JWT 注入真实 user_id）
    default_user_id: str = "default"

    # 任务管理
    task_ttl: int = 3600  # Redis 中 task 元数据和事件流的 TTL (秒)

    # Server
    host: str = "0.0.0.0"
    port: int = 8001

    # Logging
    log_file: str = "logs/app.log"
    log_max_bytes: int = 5 * 1024 * 1024
    log_backup_count: int = 3


settings = Settings()
```

**对比 07**：不再用 `Config` 类 + `os.getenv()`，pydantic-settings 自动从 `.env` 加载并做类型校验。

### 1.4 合并 Docker Compose

从 `07/docker/postgresql/` 和 `07/docker/redis/` 合并为一个文件。

```yaml
# docker/docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:15
    container_name: neuron_postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: neuron_ai_assistant
      TZ: Asia/Shanghai
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:latest
    container_name: neuron_redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  pgdata:
  redis-data:
```

**注意**：统一用户名/密码与 `config.py` 的 `db_uri` 默认值对齐，不再有 07 里 docker 用 `kevin` 而 config 用 `postgres` 的不一致问题。

---

## Step 2: 迁移基础设施层

### 2.1 `backend/app/infra/database.py`

从 `07/01_backendServer.py` 的 lifespan 中提取 PG 连接池管理。

```python
# backend/app/infra/database.py
from psycopg_pool import AsyncConnectionPool
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.store.postgres import AsyncPostgresStore
from app.config import settings


class Database:
    """PostgreSQL 连接池 + checkpointer + store 的生命周期管理"""

    def __init__(self):
        self.pool: AsyncConnectionPool | None = None
        self.checkpointer: AsyncPostgresSaver | None = None
        self.store: AsyncPostgresStore | None = None

    async def connect(self):
        self.pool = AsyncConnectionPool(
            conninfo=settings.db_uri,
            min_size=settings.db_pool_min,
            max_size=settings.db_pool_max,
            kwargs={"autocommit": True, "prepare_threshold": 0},
        )
        await self.pool.open()
        self.checkpointer = AsyncPostgresSaver(self.pool)
        self.store = AsyncPostgresStore(self.pool)

    async def disconnect(self):
        if self.pool:
            await self.pool.close()


db = Database()
```

**来源**：`07/01_backendServer.py:84-110` lifespan 函数中的初始化逻辑。

### 2.2 `backend/app/infra/redis.py`

从 `07/utils/redis.py` 大幅精简。本文件只负责 Redis 连接生命周期，业务逻辑（会话、任务事件流）分别拆到 `services/session.py`、`services/task.py`、`infra/task_bus.py`。

```python
# backend/app/infra/redis.py
import redis.asyncio as redis
from app.config import settings


class RedisManager:
    """Redis 连接管理"""

    def __init__(self):
        self.client: redis.Redis | None = None

    async def connect(self):
        self.client = redis.Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            db=settings.redis_db,
            decode_responses=True,
        )

    async def disconnect(self):
        if self.client:
            await self.client.aclose()


redis_manager = RedisManager()
```

**来源**：`07/utils/redis.py:37-50` 的 `RedisSessionManager.__init__`。连接管理独立出来，业务操作放到 `services/session.py`。

### 2.3 `backend/app/infra/llm.py`

从 `07/utils/llms.py` 迁移。相比 07 有以下改动：
- 删除每个文件都重复的 `ConcurrentRotatingFileHandler` 样板（统一在 `main.py` 做）
- `os.getenv("XXX_API_KEY")` → `settings.xxx_api_key`（走 pydantic-settings）
- `MODEL_CONFIGS` 改为 `_model_configs()` 函数延迟求值（避免模块导入时 settings 还没初始化）
- 删除 oneapi（07 里硬编码了 key，属于安全隐患；默认走 modelscope）
- 删除 `__main__` 测试块（应放 `tests/`）

```python
# backend/app/infra/llm.py
import logging
import os
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from app.config import settings


logger = logging.getLogger(__name__)

DEFAULT_TEMPERATURE = 0


def _model_configs() -> dict:
    """模型配置字典。函数延迟求值保证读取的是最新的 settings。"""
    return {
        "openai": {
            "base_url": settings.openai_base_url,
            "api_key": settings.openai_api_key,
            "chat_model": "gpt-4o-mini",
            "embedding_model": "text-embedding-3-small",
        },
        "qwen": {
            "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
            "api_key": settings.dashscope_api_key,
            "chat_model": "qwen-max",
            "embedding_model": "text-embedding-v1",
        },
        "ollama": {
            "base_url": "http://localhost:11434/v1",
            "api_key": "ollama",
            "chat_model": "llama3.1:8b",
            "embedding_model": "nomic-embed-text:latest",
        },
        "modelscope": {
            "base_url": "https://api-inference.modelscope.cn/v1",
            "api_key": settings.modelscope_api_key,
            "chat_model": "MiniMax/MiniMax-M2.5",
            "embedding_model": "BAAI/bge-m3",
        },
    }


class LLMInitializationError(Exception):
    """LLM 初始化失败"""


def initialize_llm(llm_type: str | None = None) -> tuple[ChatOpenAI, OpenAIEmbeddings]:
    """初始化 LLM 实例。省略 llm_type 时使用 settings.llm_type。"""
    llm_type = llm_type or settings.llm_type
    configs = _model_configs()

    if llm_type not in configs:
        raise LLMInitializationError(
            f"不支持的 LLM 类型: {llm_type}. 可用的类型: {list(configs.keys())}"
        )

    config = configs[llm_type]

    # Ollama 不需要真实 API key，但 langchain_openai 仍会校验环境变量
    if llm_type == "ollama":
        os.environ.setdefault("OPENAI_API_KEY", "NA")

    try:
        llm_chat = ChatOpenAI(
            base_url=config["base_url"],
            api_key=config["api_key"],
            model=config["chat_model"],
            temperature=DEFAULT_TEMPERATURE,
            timeout=30,
            max_retries=2,
        )
        llm_embedding = OpenAIEmbeddings(
            base_url=config["base_url"],
            api_key=config["api_key"],
            model=config["embedding_model"],
            deployment=config["embedding_model"],
        )
    except Exception as e:
        logger.error(f"初始化 LLM 失败: {e}")
        raise LLMInitializationError(f"初始化 LLM 失败: {e}") from e

    logger.info(f"成功初始化 {llm_type} LLM")
    return llm_chat, llm_embedding


def get_llm(llm_type: str | None = None) -> tuple[ChatOpenAI, OpenAIEmbeddings]:
    """封装函数：失败时回退到默认 llm_type 重试。"""
    llm_type = llm_type or settings.llm_type
    try:
        return initialize_llm(llm_type)
    except LLMInitializationError as e:
        if llm_type != settings.llm_type:
            logger.warning(f"{e}，使用默认 LLM 类型 {settings.llm_type} 重试")
            return initialize_llm(settings.llm_type)
        raise
```

---

## Step 3: 迁移核心层 + 路由层 + SSE

这是最大的一步，核心是**拆 `07/utils/tasks.py` 的 640 行**。

### 🏗️ 任务模型：后台执行 + Redis Streams

和原方案（agent 跑在请求协程里）不同，这一步采用**后台任务模型**：

```
POST /api/chat/invoke
  ↓ 创建 task_id，asyncio.create_task() 启动后台协程，立即返回 task_id
  ↓
后台协程独立运行 agent，将 SSE 事件写入 Redis Stream: task:{task_id}:events
  ↓
GET /api/chat/stream/{task_id}
  ↓ 独立的 SSE 端点，XREAD 订阅事件流，支持从任意位置恢复（Last-Event-ID）
```

**好处：**
- Agent 任务生命周期独立于客户端连接 — 切换会话、关闭标签都不会中断
- 客户端可以断开重连，从上次位置继续消费事件（通过 `?from_id=` 参数）
- 单进程内实现，无需 Celery worker

**数据维度：**
- `user_id`：保留，默认 `settings.default_user_id`（当前 `"default"`），未来加登录只需在路由层从 JWT 注入
- `session_id`：会话 = LangGraph thread_id（checkpointer 按此分组）
- `task_id`：一次消息 → 一个 task（包含可能的 HITL resume 续作），UUID

**约束**：同一 session 同时只能有一个非终结态 task（符合聊天自然语义，避免 agent 状态冲突）。

**Redis 结构：**
```
user_sessions:{user_id}            SET     该用户的所有 session_id
session:{user_id}:{session_id}     STRING  会话元数据（JSON）
task:{task_id}                     STRING  任务元数据（JSON：user_id, session_id, status）
task:{task_id}:events              STREAM  任务事件流（XADD / XREAD）
```

### ⚠️ 开工前必读

1. **SSE 端点是 GET，可以用 EventSource 也可以用 fetch**
   - 新架构下 `POST /api/chat/invoke` 只返回 `{task_id, ...}` JSON，不是流
   - SSE 实际在 `GET /api/chat/stream/{task_id}?from_id=X`，支持 EventSource
   - **但前端推荐还是用 `fetch()` + `getReader()`** — 因为需要传 `from_id` 查询参数 + 支持断点续传 + 方便自定义错误处理，EventSource 的自动重连反而碍事

2. **`streaming.py` 的协议已对照官方文档**
   - `astream(stream_mode=[...])` 多模式时产出 **`(mode, data)` 元组**，不是 dict
   - `"messages"` 模式：`data = (message_chunk, metadata)` 二元组
   - `"updates"` 模式：`data = {node_name: {field: value}}` dict
   - HITL 中断作为顶层键 `__interrupt__` 出现在 updates dict 中，值是 `(Interrupt(value=HITLRequest),)` 元组
   - HITLRequest 结构：`{"action_requests": [{"name", "args", "description"}], "review_configs": [...]}`
   - ⚠️ **剩下唯一需实测的**：deepagents `TodoListMiddleware` 对应的节点名（用于从 updates 里提取 todos）— 首次跑起来打 `logger.debug(updates)` 看清楚，按需调整 `parse_agent_events` 的 todo 提取逻辑

3. **日志配置在 `main.py` 集中做** — `database.py` / `redis.py` / `llm.py` 都只写 `logging.getLogger(__name__)`，没配 handler，只有在 `main.py` 调用 `logging.basicConfig(...)` 后日志才会真正输出（见 3.10）。

4. **CORS 必须加** — 前端 Next.js 跑在 3000 端口，后端 8001 端口，没 CORS 跨域直接挂。`main.py` 里已经加了（见 3.10）。

### 3.1 `backend/app/core/tools.py` — 工具注册

从 `07/utils/tools.py` 迁移。相比 07：
- 删除 `ConcurrentRotatingFileHandler` 的 logger 样板（统一在 `main.py` 做）
- `os.getenv("AMAP_MAPS_API_KEY")` → `settings.amap_maps_api_key`

```python
# backend/app/core/tools.py
import logging
from langchain_core.tools import tool
from langchain_mcp_adapters.client import MultiServerMCPClient
from app.config import settings


logger = logging.getLogger(__name__)


async def get_mcp_tools():
    """获取 MCP 工具（高德地图），分配给 researcher 子 Agent"""
    client = MultiServerMCPClient({
        "amap-maps-streamableHTTP": {
            "url": f"https://mcp.amap.com/mcp?key={settings.amap_maps_api_key}",
            "transport": "streamable_http",
        }
    })
    return await client.get_tools()


def get_custom_tools():
    """获取自定义工具（酒店预定、计算），分配给主 Agent"""

    @tool("book_hotel", description="酒店预定工具")
    async def book_hotel(hotel_name: str):
        """
        支持酒店预定的工具

        Args:
            hotel_name: 酒店名称

        Returns:
            工具的调用结果
        """
        return f"成功预定了在{hotel_name}的住宿。"

    @tool("multiply", description="计算两个数的乘积的工具")
    async def multiply(a: float, b: float) -> float:
        """
        支持计算两个数的乘积的工具

        Args:
            a: 参数1
            b: 参数2

        Returns:
            工具的调用结果
        """
        return f"{a}乘以{b}等于{a * b}。"

    return [book_hotel, multiply]


def get_hitl_config(custom_tools):
    """
    生成主 Agent 的 HITL 中断配置。

    危险操作需要审批：book_hotel, execute, write_file, edit_file
    安全操作免审批：multiply, read_file, ls, glob, grep, write_todos, task
    """
    interrupt_on = {}

    for t in custom_tools:
        name = getattr(t, "name", str(t))
        interrupt_on[name] = name != "multiply"

    # Deep Agents 内置工具
    interrupt_on.update({
        "execute": True,
        "write_file": True,
        "edit_file": True,
        "read_file": False,
        "ls": False,
        "glob": False,
        "grep": False,
        "write_todos": False,
        "task": False,
    })

    return interrupt_on
```

### 3.2 `backend/app/core/agent.py` — AgentService

从 `07/utils/tasks.py` 的 `invoke_agent_task` 和 `resume_agent_task` 中提取 Agent 创建逻辑，合并为一个 `AgentService` 类。

```python
# backend/app/core/agent.py
from deepagents import create_deep_agent
from deepagents.middleware.subagents import SubAgent
from deepagents.backends.store import StoreBackend
from langchain.agents.middleware.summarization import SummarizationMiddleware
from app.infra.database import db
from app.infra.llm import get_llm
from app.core.tools import get_mcp_tools, get_custom_tools, get_hitl_config


class AgentService:
    """Agent 创建和生命周期管理 — 统一 invoke 和 resume 的 Agent 构建"""

    async def create_agent(self, *, system_prompt: str | None = None):
        """
        来源：07/utils/tasks.py:424-448 (invoke) 和 :553-575 (resume)
        两处代码几乎一样，这里合并为一个方法
        """
        llm_chat, _ = get_llm()  # 默认读 settings.llm_type
        mcp_tools = await get_mcp_tools()
        custom_tools = get_custom_tools()
        interrupt_on = get_hitl_config(custom_tools)

        return create_deep_agent(
            model=llm_chat,
            tools=custom_tools,
            system_prompt=system_prompt,
            middleware=[
                SummarizationMiddleware(
                    model=llm_chat,
                    trigger=[("tokens", 3000), ("messages", 50)],
                    keep=("messages", 20),
                ),
            ],
            interrupt_on=interrupt_on,
            checkpointer=db.checkpointer,
            store=db.store,
            backend=StoreBackend(),
            subagents=[
                SubAgent(
                    name="researcher",
                    description="负责使用高德地图工具进行地理信息搜索、路线规划和周边查询",
                    system_prompt="你是一个地理信息调研助手，擅长使用地图工具查询地点、路线和周边信息。将调研结果整理为结构化摘要返回。",
                    tools=mcp_tools,
                ),
            ],
        )
```

**关键变化**：
- 不再每次创建 DB 连接池（用全局 `db` 单例）
- invoke/resume 共用同一个 `create_agent()`
- `system_prompt` 可选，resume 时不传（从 checkpointer 恢复）

### 3.3 `backend/app/core/streaming.py` — 事件解析器

**不再直接输出 SSE 字符串**，而是作为纯解析器：把 `agent.astream()` 的原始 chunk 解析成结构化的 `(event_type, data)` tuple。后续由 `TaskService` 写入 Redis Stream，由 `/chat/stream/{task_id}` 端点格式化为 SSE。

```python
# backend/app/core/streaming.py
import logging
from typing import AsyncGenerator, Any


logger = logging.getLogger(__name__)

# 事件类型常量
EVT_TOKEN = "token"
EVT_TOOL = "tool"
EVT_TODO = "todo"
EVT_HITL = "hitl"
EVT_DONE = "done"
EVT_ERROR = "error"


def _extract_text(content: Any) -> str:
    """
    提取流式消息中的纯文本内容。
    来源：07/utils/tasks.py:177-189 _extract_text_from_content
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            item if isinstance(item, str)
            else item.get("text", "") if isinstance(item, dict) and item.get("type") == "text"
            else ""
            for item in content
        )
    return ""


async def parse_agent_events(
    agent, agent_input, config: dict,
) -> AsyncGenerator[tuple[str, dict], None]:
    """
    将 agent.astream() 的输出解析为结构化事件元组 (event_type, data)。
    不处理 SSE 格式，也不写入任何后端 — 纯转换。

    调用方：TaskService.run() 遍历事件写入 Redis Stream，
    SSE 端点从 Stream 读取并格式化为 `event: X\\ndata: Y\\n\\n`。

    遇到 __interrupt__ 时 yield ("hitl", ...) 后立即 return，调用方负责后续处理。
    正常结束 yield ("done", {"message": 累积文本})。

    ⚠️ LangGraph astream() 协议（已对照官方文档）：
    - 多 stream_mode 时产出 (mode, data) 元组，不是 dict
    - "messages" 模式：data = (message_chunk, metadata) 二元组
    - "updates" 模式：data = {node_name: node_state_update} dict
    - "values" 模式：data = 完整状态 dict
    07 的 stream_and_collect_result 用 chunk.get("type") 是错的（把 astream 和
    astream_events 的格式混起来了）— 这里已经修正。
    """
    final_text = ""

    # 只订阅需要的模式。values 对流式没用，去掉减少开销。
    async for mode, data in agent.astream(
        input=agent_input,
        config=config,
        stream_mode=["updates", "messages"],
    ):
        if mode == "messages":
            # data 是 (message_chunk, metadata) 二元组
            if not isinstance(data, tuple) or len(data) != 2:
                continue
            message_chunk, _metadata = data
            msg_type = type(message_chunk).__name__

            if msg_type == "AIMessageChunk":
                # 检测工具调用发起 — tool_call_chunks 是流式增量，name 只在首个 chunk 出现
                # 前端只展示"AI 正在调用 XXX 工具"，不暴露 args，详细信息走后端日志
                for tc in (getattr(message_chunk, "tool_call_chunks", None) or []):
                    tool_name = tc.get("name")
                    if tool_name:
                        logger.info(
                            f"tool call: {tool_name} args={tc.get('args')} id={tc.get('id')}"
                        )
                        yield EVT_TOOL, {"name": tool_name, "status": "calling"}

                # 文本 token — 仅 AI 的自然语言输出
                text = _extract_text(getattr(message_chunk, "content", None))
                if text:
                    final_text += text
                    yield EVT_TOKEN, {"text": text}

            elif msg_type == "ToolMessage":
                # 工具结果 — 只发一个"完成"信号到前端，内容写日志
                tool_name = getattr(message_chunk, "name", "") or "unknown"
                result_content = getattr(message_chunk, "content", "")
                logger.info(
                    f"tool result: {tool_name} content={str(result_content)[:500]}"
                )
                yield EVT_TOOL, {"name": tool_name, "status": "done"}

            # 其他消息类型（HumanMessage / SystemMessage）直接忽略，不进流式输出

        elif mode == "updates":
            # data 是 dict，形如 {node_name: {field: value}}
            if not isinstance(data, dict):
                continue

            # HITL 中断 — LangGraph 用顶层键 __interrupt__ 标识
            if "__interrupt__" in data:
                interrupts = data["__interrupt__"]
                first = interrupts[0] if interrupts else None
                interrupt_value = getattr(first, "value", first)
                if not isinstance(interrupt_value, dict):
                    interrupt_value = {"raw": str(interrupt_value)}
                yield EVT_HITL, interrupt_value
                return

            # Todo 更新：deepagents TodoListMiddleware 把 todos 写到 state.todos
            # updates 模式是 {node_name: {todos: [...]}}，需要遍历节点
            # ⚠️ 实测点：首次运行确认 TodoListMiddleware 对应的节点名
            logger.debug(f"updates chunk: {data}")
            for node_name, node_state in data.items():
                if isinstance(node_state, dict) and "todos" in node_state:
                    yield EVT_TODO, {"todos": node_state["todos"]}
                    break

    yield EVT_DONE, {"message": final_text}
```

**相比 07 的错误代码修正**：
- ❌ 07: `async for chunk in astream(..., version="v2")` + `chunk.get("type")` — 把 `astream` 当 `astream_events` 用
- ✅ 新: `async for mode, data in astream(stream_mode=["updates","messages"])` — 按官方文档的元组解包
- 结果：07 的 `stream_and_collect_result` 里 token 事件实际从没被捕获过（所有消息在 `isinstance(chunk, dict)` 检查时都被 skip），只是因为 07 最后靠 `final_state` 返回结果所以没人发现
- `version` 参数删除：`astream` 的 `version` 默认 'v1'（和 `astream_events` 的 `version="v2"` 无关，我之前混淆了）

### 3.4 `backend/app/core/hitl.py` — HITL 决策构造

从 `07/01_backendServer.py:218-271` 的 resume 端点中提取决策构造逻辑。

```python
# backend/app/core/hitl.py
from fastapi import HTTPException


def build_decisions(response_type: str, args: dict | None, action_requests: list) -> dict:
    """
    将前端的 approve/edit/reject 转换为 Command(resume=...) 所需的 decisions 结构。
    来源：07/01_backendServer.py:218-271
    """
    # 兼容历史值
    response_type = (response_type or "").lower().strip()
    if response_type == "accept":
        response_type = "approve"
    elif response_type == "response":
        response_type = "reject"

    if response_type not in {"approve", "edit", "reject"}:
        raise HTTPException(status_code=400, detail=f"不支持的响应类型: {response_type}")

    count = len(action_requests) if action_requests else 1

    if response_type == "approve":
        return {"decisions": [{"type": "approve"} for _ in range(count)]}

    if response_type == "reject":
        message = None
        if args:
            message = args.get("message") or args.get("args")
        decision = {"type": "reject"}
        if message:
            decision["message"] = message
        return {"decisions": [decision for _ in range(count)]}

    # edit
    if count != 1:
        raise HTTPException(status_code=400, detail="多工具调用不支持单次 edit")
    if not args:
        raise HTTPException(status_code=400, detail="edit 需要提供参数")

    edited_args = args.get("edited_args") or args.get("args")
    if not isinstance(edited_args, dict):
        raise HTTPException(status_code=400, detail="edited_args 必须是 JSON 对象")

    tool_name = args.get("name")
    if not tool_name and action_requests:
        tool_name = action_requests[0].get("name")

    return {"decisions": [{"type": "edit", "edited_action": {"name": tool_name, "args": edited_args}}]}
```

### 3.5 `backend/app/models/chat.py` — 数据模型

从 `07/utils/models.py` 精简。保留 `user_id` 和 `task_id` 维度（分别对应"未来多用户"和"后台任务"）。

```python
# backend/app/models/chat.py
from pydantic import BaseModel
from typing import Dict, Any, Optional


class ChatRequest(BaseModel):
    """用户发送消息，启动新的后台 task"""
    session_id: str
    query: str
    user_id: Optional[str] = None   # 未传时由路由层填充 settings.default_user_id
    system_message: Optional[str] = None


class ResumeRequest(BaseModel):
    """HITL 恢复请求 — 针对已有 task_id"""
    task_id: str
    response_type: str          # approve / edit / reject
    args: Optional[Dict[str, Any]] = None
    action_requests: Optional[list] = None  # 前端回传的中断上下文


class TaskCreatedResponse(BaseModel):
    """invoke/resume 立即返回的响应"""
    task_id: str
    session_id: str
    status: str  # "running"


class MemoryRequest(BaseModel):
    """写入长期记忆"""
    memory_info: str
    user_id: Optional[str] = None
```

**相比 07**：
- `task_id` **服务端生成**，不再由客户端传入（07 是客户端生成 task_id 的）
- `ResumeRequest` 只需 `task_id`，因为 session_id/user_id 可从 task 元数据查到
- 响应模型从 07 的巨型 `AgentResponse` 简化 — 状态通过 SSE 流推送，不走 REST 响应

### 3.6 `backend/app/services/session.py` — 会话服务

从 `07/utils/redis.py` 的 `RedisSessionManager`（490 行）大幅精简。相比 07：
- 保留 `user_id` + `session_id` 两级 key（留了未来加登录的口子）
- 去掉 `task_id` 维度 — task 管理拆到 `services/task.py`
- 去掉所有 `cleanup_*` 方法 — 依赖 Redis TTL 自动过期
- Redis 客户端从全局 `redis_manager.client` 注入

```python
# backend/app/services/session.py
import json
import logging
import time
import uuid
from app.infra.redis import redis_manager
from app.config import settings


logger = logging.getLogger(__name__)


class SessionService:
    """会话管理服务。
    数据结构：
      user_sessions:{user_id}              SET     该用户的所有 session_id
      session:{user_id}:{session_id}       HASH    会话元数据
    """

    @property
    def client(self):
        if redis_manager.client is None:
            raise RuntimeError("Redis 未初始化，请确认 lifespan 已运行")
        return redis_manager.client

    @staticmethod
    def _key(user_id: str, session_id: str) -> str:
        return f"session:{user_id}:{session_id}"

    @staticmethod
    def _user_sessions_key(user_id: str) -> str:
        return f"user_sessions:{user_id}"

    async def create_session(
        self,
        user_id: str | None = None,
        session_id: str | None = None,
    ) -> str:
        """创建新会话，返回 session_id"""
        user_id = user_id or settings.default_user_id
        session_id = session_id or str(uuid.uuid4())
        data = {
            "session_id": session_id,
            "user_id": user_id,
            "status": "idle",
            "created_at": time.time(),
            "last_updated": time.time(),
        }
        await self.client.set(
            self._key(user_id, session_id),
            json.dumps(data, ensure_ascii=False),
            ex=settings.session_ttl,
        )
        await self.client.sadd(self._user_sessions_key(user_id), session_id)
        await self.client.expire(self._user_sessions_key(user_id), settings.session_ttl)
        logger.info(f"创建会话 {user_id}:{session_id}")
        return session_id

    async def get_session(self, session_id: str, user_id: str | None = None) -> dict | None:
        user_id = user_id or settings.default_user_id
        raw = await self.client.get(self._key(user_id, session_id))
        return json.loads(raw) if raw else None

    async def touch(self, session_id: str, user_id: str | None = None) -> bool:
        """更新 last_updated 时间戳并续期 TTL"""
        user_id = user_id or settings.default_user_id
        current = await self.get_session(session_id, user_id)
        if current is None:
            return False
        current["last_updated"] = time.time()
        await self.client.set(
            self._key(user_id, session_id),
            json.dumps(current, ensure_ascii=False),
            ex=settings.session_ttl,
        )
        return True

    async def session_exists(self, session_id: str, user_id: str | None = None) -> bool:
        user_id = user_id or settings.default_user_id
        return (await self.client.exists(self._key(user_id, session_id))) > 0

    async def list_sessions(self, user_id: str | None = None) -> list[dict]:
        """列出用户的所有会话，按 last_updated 倒序"""
        user_id = user_id or settings.default_user_id
        session_ids = await self.client.smembers(self._user_sessions_key(user_id))
        sessions = []
        for sid in session_ids:
            raw = await self.client.get(self._key(user_id, sid))
            if raw:
                sessions.append(json.loads(raw))
            else:
                # 清理已过期的 session_id 引用
                await self.client.srem(self._user_sessions_key(user_id), sid)
        sessions.sort(key=lambda s: s.get("last_updated", 0), reverse=True)
        return sessions

    async def get_active_session_id(self, user_id: str | None = None) -> str | None:
        sessions = await self.list_sessions(user_id)
        return sessions[0]["session_id"] if sessions else None

    async def delete_session(self, session_id: str, user_id: str | None = None) -> bool:
        user_id = user_id or settings.default_user_id
        deleted = await self.client.delete(self._key(user_id, session_id))
        await self.client.srem(self._user_sessions_key(user_id), session_id)
        if deleted:
            logger.info(f"删除会话 {user_id}:{session_id}")
        return deleted > 0


session_service = SessionService()
```

### 3.6.1 `backend/app/infra/task_bus.py` — Redis Streams 事件总线（新增）

用 Redis Streams 实现任务事件的发布/订阅。**选 Streams 而不是 pub/sub**：Streams 有持久化、支持从任意位置读取、支持阻塞读取，天然适合"客户端断线重连"场景。

```python
# backend/app/infra/task_bus.py
import json
import logging
from typing import AsyncGenerator
from app.infra.redis import redis_manager
from app.config import settings


logger = logging.getLogger(__name__)

STATUS_RUNNING = "running"
STATUS_INTERRUPTED = "interrupted"
STATUS_COMPLETED = "completed"
STATUS_ERROR = "error"
TERMINAL_STATUSES = {STATUS_INTERRUPTED, STATUS_COMPLETED, STATUS_ERROR}


def _events_key(task_id: str) -> str:
    return f"task:{task_id}:events"


def _meta_key(task_id: str) -> str:
    return f"task:{task_id}"


async def _client():
    if redis_manager.client is None:
        raise RuntimeError("Redis 未初始化")
    return redis_manager.client


async def create_task_meta(task_id: str, user_id: str, session_id: str) -> None:
    """登记 task 元数据"""
    client = await _client()
    meta = {
        "task_id": task_id,
        "user_id": user_id,
        "session_id": session_id,
        "status": STATUS_RUNNING,
    }
    await client.set(_meta_key(task_id), json.dumps(meta), ex=settings.task_ttl)


async def get_task_meta(task_id: str) -> dict | None:
    client = await _client()
    raw = await client.get(_meta_key(task_id))
    return json.loads(raw) if raw else None


async def set_task_status(task_id: str, status: str) -> None:
    client = await _client()
    meta = await get_task_meta(task_id)
    if meta is None:
        logger.warning(f"set_task_status 找不到 task {task_id}")
        return
    meta["status"] = status
    await client.set(_meta_key(task_id), json.dumps(meta), ex=settings.task_ttl)


async def publish_event(task_id: str, event: str, data: dict) -> str:
    """向任务事件流追加一条事件，返回 stream entry ID"""
    client = await _client()
    entry_id = await client.xadd(
        _events_key(task_id),
        {"event": event, "data": json.dumps(data, ensure_ascii=False)},
    )
    await client.expire(_events_key(task_id), settings.task_ttl)
    return entry_id


async def read_events(
    task_id: str,
    from_id: str = "0",
    block_ms: int = 5000,
) -> AsyncGenerator[tuple[str, str, dict], None]:
    """
    从任务事件流读取事件。

    Args:
        task_id: 任务 ID
        from_id: 起始位置（"0" 表示从头读）。客户端重连时传入上次最后 entry_id。
        block_ms: 每次阻塞读的超时（毫秒）。超时后会检查 task 状态决定是否退出。

    Yields:
        (entry_id, event_type, data) 三元组
    """
    client = await _client()
    last_id = from_id
    while True:
        entries = await client.xread(
            {_events_key(task_id): last_id},
            block=block_ms,
        )
        if not entries:
            # 超时无新事件 — 检查 task 是否已终结
            meta = await get_task_meta(task_id)
            if meta is None or meta.get("status") in TERMINAL_STATUSES:
                # 最后再 drain 一次，捕获超时窗口内的残留事件
                entries = await client.xread({_events_key(task_id): last_id}, block=0, count=100)
                if not entries:
                    return
            else:
                continue

        for _stream, msgs in entries:
            for entry_id, fields in msgs:
                last_id = entry_id
                event = fields.get("event", "")
                data = json.loads(fields.get("data", "{}"))
                yield entry_id, event, data
```

### 3.6.2 `backend/app/services/task.py` — 任务生命周期服务（新增）

把 agent 的后台执行封装成 `TaskService.start()`，用 `asyncio.create_task()` 脱离请求协程。

```python
# backend/app/services/task.py
import asyncio
import logging
import uuid
from langgraph.types import Command
from app.infra import task_bus
from app.core.agent import AgentService
from app.core.streaming import parse_agent_events, EVT_HITL, EVT_DONE, EVT_ERROR
from app.config import settings


logger = logging.getLogger(__name__)


class TaskService:
    """任务生命周期管理 — 后台执行 agent 并把事件写入 Redis Stream"""

    def __init__(self):
        self._agent_service = AgentService()
        self._running: dict[str, asyncio.Task] = {}

    async def start_invoke(
        self,
        user_id: str,
        session_id: str,
        query: str,
        system_prompt: str | None = None,
    ) -> str:
        """启动一个新的 invoke 任务，返回 task_id"""
        task_id = str(uuid.uuid4())
        await task_bus.create_task_meta(task_id, user_id, session_id)
        agent_input = {"messages": [{"role": "user", "content": query}]}
        bg = asyncio.create_task(
            self._run_agent(task_id, agent_input, session_id, system_prompt),
            name=f"agent-{task_id}",
        )
        self._running[task_id] = bg
        bg.add_done_callback(lambda t: self._running.pop(task_id, None))
        return task_id

    async def start_resume(
        self,
        task_id: str,
        command_data: dict,
    ) -> None:
        """恢复已有的中断任务（保持同一 task_id，继续写入同一事件流）"""
        meta = await task_bus.get_task_meta(task_id)
        if meta is None:
            raise ValueError(f"task {task_id} 不存在或已过期")
        if meta["status"] != task_bus.STATUS_INTERRUPTED:
            raise ValueError(f"task {task_id} 当前状态 {meta['status']}，无法 resume")
        await task_bus.set_task_status(task_id, task_bus.STATUS_RUNNING)

        bg = asyncio.create_task(
            self._run_agent(task_id, Command(resume=command_data), meta["session_id"], None),
            name=f"agent-resume-{task_id}",
        )
        self._running[task_id] = bg
        bg.add_done_callback(lambda t: self._running.pop(task_id, None))

    async def _run_agent(
        self,
        task_id: str,
        agent_input,
        session_id: str,
        system_prompt: str | None,
    ) -> None:
        """后台协程：创建 agent，解析事件，写入 task_bus"""
        try:
            agent = await self._agent_service.create_agent(system_prompt=system_prompt)
            hit_interrupt = False
            async for event, data in parse_agent_events(
                agent,
                agent_input,
                config={"configurable": {"thread_id": session_id}},
            ):
                await task_bus.publish_event(task_id, event, data)
                if event == EVT_HITL:
                    hit_interrupt = True
                    break
                if event == EVT_DONE:
                    break

            final_status = (
                task_bus.STATUS_INTERRUPTED if hit_interrupt else task_bus.STATUS_COMPLETED
            )
            await task_bus.set_task_status(task_id, final_status)
            logger.info(f"task {task_id} 结束，状态 {final_status}")

        except Exception as e:
            logger.exception(f"task {task_id} 执行失败")
            await task_bus.publish_event(task_id, EVT_ERROR, {"message": str(e)})
            await task_bus.set_task_status(task_id, task_bus.STATUS_ERROR)


task_service = TaskService()
```

**关键点**：
- `asyncio.create_task()` 启动的协程独立于请求生命周期，请求协程返回后 agent 继续跑
- `_running` 字典持有后台任务的引用，防止被 GC（`asyncio.create_task` 的弱引用陷阱）
- `_run_agent` 遇到 HITL 后退出 — 不是错误，后续 resume 会创建新协程继续
- 用同一 `task_id` 贯穿 invoke + resume，事件流连续

### 3.7 `backend/app/services/memory.py` — 记忆服务

从 `07/utils/tasks.py:70-116` 的 `read_long_term_info` 和 `07/01_backendServer.py:44-80` 的 `write_long_term_info` 合并为 `MemoryService` 类。

**user_id 决策**：07 原代码用 `namespace = ("memories", user_id)` 区分用户，新架构是个人助手，**用固定常量 `"default"`**。未来需要多用户时只需改这一处常量为从请求/settings 读取。

```python
# backend/app/services/memory.py
import logging
import uuid
from app.infra.database import db
from app.config import settings


logger = logging.getLogger(__name__)


class MemoryService:
    """长期记忆服务（基于 AsyncPostgresStore）"""

    @property
    def store(self):
        if db.store is None:
            raise RuntimeError("PostgresStore 未初始化，请确认 lifespan 已运行")
        return db.store

    @staticmethod
    def _namespace(user_id: str) -> tuple[str, str]:
        return ("memories", user_id)

    async def read(self, user_id: str | None = None) -> str:
        """
        读取用户长期记忆，返回拼接后的字符串。
        来源：07/utils/tasks.py:70-116 read_long_term_info
        """
        user_id = user_id or settings.default_user_id
        memories = await self.store.asearch(self._namespace(user_id), query="")
        if not memories:
            return ""
        texts = [
            d.value["data"]
            for d in memories
            if isinstance(d.value, dict) and "data" in d.value
        ]
        return " ".join(texts)

    async def write(self, memory_info: str, user_id: str | None = None) -> str:
        """
        写入一条长期记忆，返回 memory_id。
        来源：07/01_backendServer.py:44-80 write_long_term_info
        """
        user_id = user_id or settings.default_user_id
        memory_id = str(uuid.uuid4())
        await self.store.aput(
            namespace=self._namespace(user_id),
            key=memory_id,
            value={"data": memory_info},
        )
        logger.info(f"写入长期记忆 {memory_id}（user={user_id}）")
        return memory_id


memory_service = MemoryService()
```

### 3.8 `backend/app/api/chat.py` — 聊天路由（3 端点）

**核心改动**：从原 2 端点（invoke、resume）拆成 3 端点：
- `POST /invoke` — 创建 task，立即返回 `task_id`（不阻塞到 agent 结束）
- `POST /resume` — 恢复中断的 task（也立即返回）
- `GET /stream/{task_id}` — SSE 订阅端点，从 Redis Streams 消费事件

```python
# backend/app/api/chat.py
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from app.models.chat import ChatRequest, ResumeRequest, TaskCreatedResponse
from app.services.task import task_service
from app.services.session import session_service
from app.infra import task_bus
from app.core.hitl import build_decisions
from app.api.deps import get_current_user


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])


def _format_sse(event: str, data: dict, entry_id: str | None = None) -> str:
    """格式化 SSE 消息。entry_id 作为 SSE 的 id 字段，客户端用来断点续传。"""
    lines = []
    if entry_id:
        lines.append(f"id: {entry_id}")
    lines.append(f"event: {event}")
    lines.append(f"data: {json.dumps(data, ensure_ascii=False)}")
    return "\n".join(lines) + "\n\n"


@router.post("/invoke", response_model=TaskCreatedResponse)
async def invoke(
    request: ChatRequest,
    user_id: str = Depends(get_current_user),
):
    """
    发送消息，创建后台 agent 任务。立即返回 task_id，客户端通过
    GET /api/chat/stream/{task_id} 订阅 SSE 事件流。
    """
    user_id = request.user_id or user_id

    # 确保会话存在
    if not await session_service.session_exists(request.session_id, user_id):
        await session_service.create_session(user_id=user_id, session_id=request.session_id)
    else:
        await session_service.touch(request.session_id, user_id)

    task_id = await task_service.start_invoke(
        user_id=user_id,
        session_id=request.session_id,
        query=request.query,
        system_prompt=request.system_message,
    )
    return TaskCreatedResponse(
        task_id=task_id,
        session_id=request.session_id,
        status=task_bus.STATUS_RUNNING,
    )


@router.post("/resume", response_model=TaskCreatedResponse)
async def resume(request: ResumeRequest):
    """
    提交 HITL 决策，恢复已中断的 task。保持同一 task_id，事件流续接。

    来源：07/01_backendServer.py:176-291 (resume_agent)
          + 07/utils/tasks.py:513-636 (resume_agent_task)
    """
    meta = await task_bus.get_task_meta(request.task_id)
    if meta is None:
        raise HTTPException(status_code=404, detail=f"task {request.task_id} 不存在或已过期")
    if meta["status"] != task_bus.STATUS_INTERRUPTED:
        raise HTTPException(
            status_code=400,
            detail=f"task {request.task_id} 当前状态 {meta['status']}，无法恢复",
        )

    command_data = build_decisions(
        request.response_type, request.args, request.action_requests or []
    )
    await task_service.start_resume(request.task_id, command_data)

    return TaskCreatedResponse(
        task_id=request.task_id,
        session_id=meta["session_id"],
        status=task_bus.STATUS_RUNNING,
    )


@router.get("/stream/{task_id}")
async def stream(task_id: str, from_id: str = Query("0")):
    """
    SSE 端点。从 Redis Stream 读取任务事件并推送给客户端。

    from_id: 起始位置。"0" 从头读（客户端首次连接）；重连时传入上次最后一条
    事件的 id（SSE 的 Last-Event-ID）。这样客户端断开再连接不会丢失事件。
    """
    meta = await task_bus.get_task_meta(task_id)
    if meta is None:
        raise HTTPException(status_code=404, detail=f"task {task_id} 不存在或已过期")

    async def event_stream():
        async for entry_id, event, data in task_bus.read_events(task_id, from_id=from_id):
            yield _format_sse(event, data, entry_id=entry_id)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # 禁用 nginx 缓冲
        },
    )
```

**前端消费模式**：
1. `POST /api/chat/invoke` → 拿到 `task_id`
2. `fetch("/api/chat/stream/{task_id}")` 打开 SSE 流（用 `fetch` 而非 `EventSource`，因为要设自定义 header）
3. 边读边处理事件，记录每条事件的 `id`
4. 如果连接断了：`fetch("/api/chat/stream/{task_id}?from_id={last_id}")` 从上次位置继续
5. 收到 `event: hitl` → 弹审批 UI → `POST /api/chat/resume` → 重新打开 SSE 流从上次 last_id 续读

### 3.9 `backend/app/api/sessions.py` 和 `backend/app/api/memory.py`

**user_id 通过依赖注入获取**，当前从 settings 读默认值，未来加登录时只需改 `get_current_user` 这一个依赖为从 JWT 解析 — 路由和 service 层代码零改动。

```python
# backend/app/api/deps.py（新增公共依赖）
from app.config import settings


async def get_current_user() -> str:
    """
    获取当前用户 ID。
    当前阶段：返回 settings.default_user_id（单用户）。
    未来加登录：改为从 Authorization header 解析 JWT，返回真实 user_id。
    """
    return settings.default_user_id
```

```python
# backend/app/api/sessions.py
from fastapi import APIRouter, Depends, HTTPException
from app.api.deps import get_current_user
from app.services.session import session_service


router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.get("")
async def list_sessions(user_id: str = Depends(get_current_user)):
    """来源：07/01_backendServer.py:328-346 get_agent_sessionids"""
    sessions = await session_service.list_sessions(user_id=user_id)
    return {"sessions": sessions}


@router.get("/active")
async def get_active_session(user_id: str = Depends(get_current_user)):
    """来源：07/01_backendServer.py:308-325 get_agent_active_sessionid"""
    session_id = await session_service.get_active_session_id(user_id=user_id)
    return {"active_session_id": session_id or ""}


@router.post("")
async def create_session(user_id: str = Depends(get_current_user)):
    """新增：显式创建会话端点"""
    session_id = await session_service.create_session(user_id=user_id)
    return {"session_id": session_id}


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    user_id: str = Depends(get_current_user),
):
    """来源：07/01_backendServer.py:431-448 delete_agent_session"""
    if not await session_service.session_exists(session_id, user_id=user_id):
        raise HTTPException(status_code=404, detail=f"会话 {session_id} 不存在")
    await session_service.delete_session(session_id, user_id=user_id)
    return {"status": "success"}
```

```python
# backend/app/api/memory.py
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.api.deps import get_current_user
from app.services.memory import memory_service


router = APIRouter(prefix="/api/memory", tags=["memory"])


class MemoryWriteRequest(BaseModel):
    memory_info: str


@router.post("")
async def write_memory(
    request: MemoryWriteRequest,
    user_id: str = Depends(get_current_user),
):
    """来源：07/01_backendServer.py:401-428 write_long_term"""
    memory_id = await memory_service.write(request.memory_info, user_id=user_id)
    return {"status": "success", "memory_id": memory_id}


@router.get("")
async def read_memory(user_id: str = Depends(get_current_user)):
    """新增：读取当前用户全部长期记忆（07 只有 write，read 在 agent 内部调用）"""
    content = await memory_service.read(user_id=user_id)
    return {"memory": content}
```

**一致性检查**：`api/chat.py`（3.8）的 `invoke` 端点也应该用同一个 `get_current_user` 依赖。对应的 `ChatRequest.user_id` 字段改为**可选后备**（显式传入优先，否则走依赖）：

```python
# 3.8 api/chat.py 的 invoke 稍作调整：
@router.post("/invoke", response_model=TaskCreatedResponse)
async def invoke(
    request: ChatRequest,
    user_id: str = Depends(get_current_user),
):
    # request.user_id 优先（允许测试时覆盖），否则用依赖注入的值
    effective_user_id = request.user_id or user_id
    ...
```

### 3.10 `backend/app/main.py` — 入口

从 `07/01_backendServer.py` 的 app 创建 + lifespan 迁移。

```python
# backend/app/main.py
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.infra.database import db
from app.infra.redis import redis_manager
from app.api import chat, sessions, memory


def setup_logging() -> None:
    """集中配置 root logger。各模块只需 logging.getLogger(__name__)。"""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    # 降低第三方噪声
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    await db.connect()
    await redis_manager.connect()
    yield
    await redis_manager.disconnect()
    await db.disconnect()


app = FastAPI(title="Neuron AI Assistant", lifespan=lifespan)

# CORS — Next.js 前端跑在 3000 端口
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router)
app.include_router(sessions.router)
app.include_router(memory.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=True)
```

### 3.11 验证后端

```bash
cd backend

# 启动基础设施
docker compose -f ../docker/docker-compose.yml up -d

# 安装依赖
pip install -e ".[dev]"

# 启动
python -m app.main

# 健康检查
curl http://localhost:8001/health

# 用 curl 测试完整流程（两步）：
# 1. 提交消息，拿到 task_id
TASK_ID=$(curl -sX POST http://localhost:8001/api/chat/invoke \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test-1","query":"你好"}' | python -c "import sys,json;print(json.load(sys.stdin)['task_id'])")
echo "task_id: $TASK_ID"

# 2. 订阅该 task 的 SSE 事件流
curl -N "http://localhost:8001/api/chat/stream/$TASK_ID"
# 应该看到 id:... / event: token / event: done 等事件
```

---

## Step 4: 搭建 Next.js 前端

```bash
cd ..  # 回到项目根目录
npx create-next-app@latest frontend \
  --typescript --tailwind --eslint --app \
  --src-dir --import-alias "@/*" \
  --use-pnpm

cd frontend
pnpm add zustand
pnpm dlx shadcn@latest init
```

---

## Step 5: 实现前端核心组件

优先级排序，逐个实现：

```
1. lib/sse.ts          — SSE 连接工具函数
2. hooks/useChat.ts    — 核心 hook：发送消息 + 消费 SSE 流
3. components/chat/    — ChatPanel + MessageBubble + InputBar + StreamingText
4. hooks/useHITL.ts    — HITL 审批交互
5. components/hitl/    — ApprovalCard + ArgsEditor
6. components/todos/   — 任务进度展示
7. hooks/useSession.ts — 会话切换
8. components/sidebar/ — SessionList + NewChatButton
9. stores/chat.ts      — Zustand 全局状态
```

### 5.6 任务进度组件 `components/todos/`

Agent 通过 `TodoListMiddleware` 自动拆解复杂任务为 todo 列表，后端通过 SSE `event: todo` 实时推送更新。

```
components/todos/
├── TodoPanel.tsx          # 任务进度面板（可折叠，嵌在聊天区右侧或消息流内）
├── TodoItem.tsx           # 单条任务项：名称 + 状态标记（pending/in_progress/completed）
└── TodoProgress.tsx       # 进度条：已完成/总数
```

消费方式：`useChat` hook 监听 `event: todo`，更新 Zustand store 中的 `todos` 数组，`TodoPanel` 订阅渲染。

```typescript
// SSE 事件示例
event: todo
data: {"todos": [
  {"task": "查询上海天气", "status": "completed"},
  {"task": "查询北京天气", "status": "in_progress"},
  {"task": "汇总对比两地天气", "status": "pending"}
]}
```

UI 效果参考：类似 Claude Artifacts 的任务进度条，或 Cursor 的 Agent 步骤展示 — 用户能看到 Agent "在想什么、做到哪了"。

---

## Step 6: 清理

- 将 `07_DeepAgentHILApiMultiSessionTask/` 归档或删除
- 更新 `CLAUDE.md` 指向新的 `backend/` 和 `frontend/`
- 更新 `.gitignore`

---

## 文件映射速查表

### 从 07 迁移
| 07 旧文件 | 新位置 | 改动幅度 |
|-----------|--------|---------|
| `01_backendServer.py` lifespan | `app/main.py`（lifespan + CORS + logging） | 小改 |
| `01_backendServer.py` 路由 | `app/api/chat.py` + `sessions.py` + `memory.py` + `deps.py` | 拆分 + 重构为 3 端点 |
| `01_backendServer.py` write_long_term_info | `app/services/memory.py` | 提取为类 |
| `utils/config.py` | `app/config.py` | 重写（pydantic-settings + 绝对路径 .env） |
| `utils/llms.py` | `app/infra/llm.py` | 删 logger 样板、API key 走 settings |
| `utils/tools.py` | `app/core/tools.py` | 删 logger 样板、API key 走 settings |
| `utils/models.py` | `app/models/chat.py` | 精简 + 加回 user_id/task_id 字段 |
| `utils/redis.py`（连接） | `app/infra/redis.py` | 只保留连接管理 |
| `utils/redis.py`（RedisSessionManager） | `app/services/session.py` | 490 行 → ~100 行 |
| `utils/tasks.py` Agent 创建 | `app/core/agent.py` `AgentService` | 提取、去重 |
| `utils/tasks.py` `stream_and_collect_result` | `app/core/streaming.py` `parse_agent_events` | **重写** — 修复 07 的 astream/astream_events 混用 bug |
| `utils/tasks.py` `invoke_agent_task` Celery 任务 | `app/services/task.py` `TaskService.start_invoke` + `app/infra/task_bus.py` | **拆解重写** — asyncio.create_task + Redis Streams |
| `utils/tasks.py` `resume_agent_task` Celery 任务 | `app/services/task.py` `TaskService.start_resume` + `app/core/hitl.py` | **拆解重写** |
| `utils/tasks.py` `process_agent_result` | **删除** — SSE 流式推送，不需要统一处理最终结果 |
| `utils/tasks.py` `filter_last_human_conversation` | **删除** — 前端自己管理消息列表 |
| `utils/tasks.py` `parse_messages` | **删除** — 调试用打印，改为 logger.debug |
| `utils/tasks.py` Celery app / 装饰器 | **删除** |
| `02_frontendServer.py` Rich CLI | **删除** — Next.js 替代 |
| `redisTest.py` | **删除** |
| `docker/postgresql/` + `docker/redis/` | `docker/docker-compose.yml` | 合并 |

### 新增文件（07 中不存在）
| 新文件 | 作用 |
|-------|------|
| `app/infra/task_bus.py` | Redis Streams 封装：task 元数据 + 事件发布/订阅 |
| `app/services/task.py` | `TaskService`：任务生命周期 + `asyncio.create_task` 后台执行 |
| `app/api/deps.py` | FastAPI 公共依赖（`get_current_user`，未来接入 JWT） |
| `app/core/streaming.py` | `parse_agent_events`：agent 流解析器 |
| `app/core/hitl.py` | `build_decisions`：HITL 决策构造 |

---

## 依赖变化

```diff
# 新增
+ pydantic-settings
+ uvicorn[standard]  # 含 uvloop、httptools

# 删除
- celery                    # 不再需要任务队列
- rich                      # 不再需要 CLI 前端
- concurrent-log-handler    # 标准 logging 已够用

# 不变
  langgraph, langchain, langchain-openai, langgraph-checkpoint-postgres
  deepagents, fastapi, redis, langchain-mcp-adapters, python-dotenv
```
