# 07 迁移计划：create_agent → create_deep_agent

## 一、迁移目标

将 06 的 `create_agent` 架构升级为 `create_deep_agent`，获得以下新能力：

| 新能力 | 实现机制 | 说明 |
|--------|---------|------|
| 任务规划 | `TodoListMiddleware`（自动加载为中间件栈第 1 层） | Agent 自动拆解复杂任务为 todo 列表，逐步完成并追踪状态 |
| 文件读写 | `FilesystemMiddleware` + `StoreBackend` | 内置 `read_file`/`write_file`/`edit_file`/`ls`/`glob`/`grep` 工具，文件持久化到 PostgresStore |
| Shell 执行 | `execute` 工具 + `SandboxBackendProtocol` | 可选开启，需配合 HITL 审批保障安全 |
| 多智能体 | `SubAgentMiddleware` + `SubAgent` 声明式配置 | 主 Agent 作为主管，不直接持有 MCP 工具，通过 `task()` 委派给专业子 Agent |
| 上下文摘要 | `SummarizationMiddleware`（自动加载） | 长对话自动压缩，替代手动 `trimmed_messages_hook` |

---

## 二、Deep Agents 默认中间件栈

`create_deep_agent` 自动加载以下中间件栈（无需手动添加）：

```
Base stack（自动加载）:
  1. TodoListMiddleware          ← 任务规划
  2. SkillsMiddleware            ← 技能系统（需传 skills 参数才激活）
  3. FilesystemMiddleware        ← 文件读写工具
  4. SubAgentMiddleware          ← 同步子 Agent 编排
  5. SummarizationMiddleware     ← 长上下文自动摘要
  6. PatchToolCallsMiddleware    ← 工具调用修正
  7. AsyncSubAgentMiddleware     ← 异步远程子 Agent（需传 AsyncSubAgent 才激活）

User middleware（你的自定义中间件插入位置）:
  → trimmed_messages_hook 等

Tail stack（自动加载）:
  8. AnthropicPromptCachingMiddleware
  9. MemoryMiddleware            ← 文件记忆系统（需传 memory 参数才激活）
  10. HumanInTheLoopMiddleware   ← HITL（需传 interrupt_on 参数才激活）
```

---

## 三、文件级改动清单

### 不需要改动的文件

| 文件 | 原因 |
|------|------|
| `01_backendServer.py` | FastAPI 路由层、Redis 会话管理、Celery 调度逻辑与 agent 创建方式无关，完全不动 |
| `utils/redis.py` | Redis 会话管理器，与 agent 无关 |
| `utils/llms.py` | LLM 初始化方式不变，`create_deep_agent` 接受 `BaseChatModel` 实例 |
| `docker/` | 基础设施不变（PostgreSQL + Redis） |

---

### 需要改动的文件

#### 1. `utils/tasks.py` — 核心改动

这是唯一需要大改的文件，改动集中在 agent 创建部分。

##### 1.1 导入变更

```python
# ===== 删除 =====
from langchain.agents import create_agent
from langchain.agents.middleware import HumanInTheLoopMiddleware, before_model

# ===== 新增 =====
from deepagents import create_deep_agent
from deepagents.middleware.subagents import SubAgent
from deepagents.backends.store import StoreBackend
from langchain.agents.middleware.summarization import SummarizationMiddleware
```

> 注意：
> - `HumanInTheLoopMiddleware` 和 `TodoListMiddleware` 不再需要手动导入，`create_deep_agent` 自动加载。
> - `SummarizationMiddleware` 需要手动导入，因为我们要自定义 `model` 参数（指定用自己的 LLM 做摘要）。
> - `before_model` 和 `trim_messages` 已删除（由 `SummarizationMiddleware` 替代）。

##### 1.2 `invoke_agent_task` 中的 agent 创建（约第 431-441 行）

```python
# ===== 改前 =====
interrupt_on = get_hitl_config(tools)
agent = create_agent(
    model=llm_chat,
    tools=tools,
    middleware=[trimmed_messages_hook, HumanInTheLoopMiddleware(interrupt_on=interrupt_on)],
    checkpointer=checkpointer,
    store=store
)

# ===== 改后 =====
# 工具拆分：MCP 工具给子 Agent，自定义工具给主 Agent
mcp_tools = await get_mcp_tools()          # 高德地图工具
custom_tools = get_custom_tools()          # book_hotel, multiply
interrupt_on = get_hitl_config(custom_tools)

agent = create_deep_agent(
    model=llm_chat,
    tools=custom_tools,                    # 主 Agent 只拿自定义工具（酒店预定、计算）
                                           # 主 Agent 作为主管，遇到地图需求通过 task() 委派
    system_prompt=system_message,          # 直接传入，不再需要拼到 messages 里
    middleware=[
        # 自定义 SummarizationMiddleware，指定用我们自己的 LLM 做摘要
        SummarizationMiddleware(
            model=llm_chat,
            trigger=[("tokens", 3000), ("messages", 50)],
            keep=("messages", 20),
        ),
    ],
    interrupt_on=interrupt_on,             # 自动生成 HumanInTheLoopMiddleware 放到栈尾
    checkpointer=checkpointer,
    store=store,
    backend=StoreBackend(),                # 文件持久化到 PostgresStore（复用现有基础设施）
    subagents=[
        SubAgent(
            name="researcher",
            description="负责使用高德地图工具进行地理信息搜索、路线规划和周边查询",
            system_prompt="你是一个地理信息调研助手，擅长使用地图工具查询地点、路线和周边信息。将调研结果整理为结构化摘要返回。",
            tools=mcp_tools,               # 地图工具只分配给 researcher
        ),
        # 任务规划由内置 TodoListMiddleware 自动处理，无需 planner SubAgent
    ],
)
```

##### 1.3 `invoke_agent_task` 中的消息构造（约第 455-458 行）

```python
# ===== 改前 =====
# system_prompt 拼到 messages 里
messages = [
    {"role": "system", "content": system_message},
    {"role": "user", "content": query}
]
result = await stream_and_collect_result(
    agent,
    {"messages": messages},
    config={"configurable": {"thread_id": task_id}},
)

# ===== 改后 =====
# system_prompt 已通过 create_deep_agent 的 system_prompt 参数传入
# 只需要传 user 消息
result = await stream_and_collect_result(
    agent,
    {"messages": [{"role": "user", "content": query}]},
    config={"configurable": {"thread_id": task_id}},
)
```

##### 1.4 `resume_agent_task` 中的 agent 创建（约第 560-570 行）

与 `invoke_agent_task` 相同的改法，但 `resume_agent_task` **不需要传 `system_prompt`**，因为 checkpointer 会恢复上一次的状态（包括 system_prompt）：

```python
# 工具拆分同 invoke（resume 时也需要重建 agent 结构）
mcp_tools = await get_mcp_tools()
custom_tools = get_custom_tools()
interrupt_on = get_hitl_config(custom_tools)

agent = create_deep_agent(
    model=llm_chat,
    tools=custom_tools,                    # 主 Agent 只拿自定义工具
    middleware=[
        SummarizationMiddleware(
            model=llm_chat,
            trigger=[("tokens", 3000), ("messages", 50)],
            keep=("messages", 20),
        ),
    ],
    interrupt_on=interrupt_on,
    checkpointer=checkpointer,
    store=store,
    backend=StoreBackend(),
    subagents=[
        SubAgent(
            name="researcher",
            description="负责使用高德地图工具进行地理信息搜索、路线规划和周边查询",
            system_prompt="你是一个地理信息调研助手，擅长使用地图工具查询地点、路线和周边信息。将调研结果整理为结构化摘要返回。",
            tools=mcp_tools,               # 地图工具只给 researcher
        ),
    ],
)
```

##### 1.5 `process_agent_result` 中提取 todos（约第 259-328 行）

在构造 `AgentResponse` 时，新增提取 `todos` 字段：

```python
# 在 "completed" 分支中
response = AgentResponse(
    session_id=session_id,
    task_id=task_id,
    status="completed",
    result=result,
    todos=result.get("todos"),  # ← 新增：提取任务规划状态
)

# 在 "interrupted" 分支中同理
response = AgentResponse(
    session_id=session_id,
    task_id=task_id,
    status="interrupted",
    interrupt_data=interrupt_data,
    todos=result.get("todos"),  # ← 新增
)
```

##### 1.6 移除 `trimmed_messages_hook`，由内置 `SummarizationMiddleware` 替代

`create_deep_agent` 默认中间件栈第 5 层自动加载 `SummarizationMiddleware`，它会：
- 统计每轮对话的 token 用量
- 当上下文接近窗口上限时，自动将旧的历史消息和工具调用参数压缩为摘要
- 摘要事件持久化到 state 中，跨轮次保留

这比原来的 `trimmed_messages_hook`（简单截断最后 N 条消息）更智能 — 不会丢失关键上下文，而是通过 LLM 生成摘要保留语义。

**决策：移除手动修剪，完全由 `SummarizationMiddleware` 接管。** 删除以下内容：

```python
# ===== 删除 trimmed_messages_hook 函数定义（约第 70-90 行）=====
@before_model
def trimmed_messages_hook(state, runtime):
    ...

# ===== 删除相关导入 =====
from langchain.agents.middleware import before_model        # 删除
from langchain_core.messages.utils import trim_messages     # 删除
```

对应地，agent 创建时 `middleware` 参数传空列表或省略：

```python
agent = create_deep_agent(
    model=llm_chat,
    tools=tools,
    # middleware 不再需要传 trimmed_messages_hook
    interrupt_on=interrupt_on,
    checkpointer=checkpointer,
    store=store,
    backend=StoreBackend(),
    subagents=[...],
)

---

#### 2. `utils/tools.py` — 拆分工具 + HITL 配置

原来的 `get_tools()` 返回一个混合列表，现在需要拆分为两个函数，让主 Agent 和子 Agent 各持有不同的工具：

##### 2.1 工具拆分

```python
# ===== 改前 =====
# 一个函数返回所有工具的混合列表
async def get_tools():
    ...
    tools = list(amap_tools)
    tools.append(book_hotel)
    tools.append(multiply)
    return tools

# ===== 改后 =====
# 拆分为两个函数：MCP 工具 vs 自定义工具

async def get_mcp_tools():
    """获取 MCP 工具（高德地图），分配给 researcher 子 Agent"""
    client = MultiServerMCPClient({
        "amap-maps-streamableHTTP": {
            "url": "https://mcp.amap.com/mcp?key=" + os.getenv("AMAP_MAPS_API_KEY"),
            "transport": "streamable_http"
        }
    })
    return await client.get_tools()

def get_custom_tools():
    """获取自定义工具（酒店预定、计算），分配给主 Agent"""
    @tool("book_hotel", description="酒店预定工具")
    async def book_hotel(hotel_name: str):
        return f"成功预定了在{hotel_name}的住宿。"

    @tool("multiply", description="计算两个数的乘积的工具")
    async def multiply(a: float, b: float) -> float:
        result = a * b
        return f"{a}乘以{b}等于{result}。"

    return [book_hotel, multiply]
```

##### 2.2 HITL 配置

`get_hitl_config()` 现在只需要处理主 Agent 的工具（自定义工具 + Deep Agents 内置工具）：

```python
def get_hitl_config(custom_tools):
    """生成主 Agent 的 HITL 中断配置"""
    interrupt_on = {}

    # 自定义工具的 HITL 配置
    for t in custom_tools:
        tool_name = getattr(t, "name", str(t))
        if tool_name == "multiply":
            interrupt_on[tool_name] = False
        else:
            interrupt_on[tool_name] = True

    # Deep Agents 内置工具的 HITL 配置
    # 危险操作 → 需要 HITL 审批
    interrupt_on["execute"] = True       # Shell 命令执行
    interrupt_on["write_file"] = True    # 文件写入
    interrupt_on["edit_file"] = True     # 文件编辑
    # 安全操作 → 无需审批
    interrupt_on["read_file"] = False
    interrupt_on["ls"] = False
    interrupt_on["glob"] = False
    interrupt_on["grep"] = False
    interrupt_on["write_todos"] = False  # 任务规划
    interrupt_on["task"] = False         # 子 Agent 委派

    return interrupt_on
```

> 注意：researcher 子 Agent 的 HITL 配置由 `create_deep_agent` 的顶层 `interrupt_on` 自动继承。
> 即主 Agent 的 `interrupt_on` 会传递给声明式 `SubAgent`（除非子 Agent 自己覆盖 `interrupt_on`）。
> 因此 MCP 工具在子 Agent 中的 HITL 行为无需单独配置。

---

#### 3. `utils/models.py` — 小改

`AgentResponse` 新增 `todos` 字段：

```python
from typing import Dict, Any, Optional, List

class AgentResponse(BaseModel):
    session_id: str
    task_id: str
    status: str
    timestamp: float = Field(default_factory=lambda: time.time())
    message: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    interrupt_data: Optional[Dict[str, Any]] = None
    todos: Optional[List[Dict[str, str]]] = None   # ← 新增：任务规划列表
```

---

#### 4. `02_frontendServer.py` — 小改

在展示 agent 响应结果时，增加 todos 的显示逻辑。

##### 4.1 `process_agent_response_resume` 函数中（约第 599-616 行 completed 分支之后）

```python
elif status == "completed":
    # ... 现有的结果展示逻辑 ...

    # 新增：展示任务规划
    todos = response.get("todos")
    if todos:
        todo_lines = []
        status_icon = {"pending": "[ ]", "in_progress": "[~]", "completed": "[x]"}
        for todo in todos:
            icon = status_icon.get(todo.get("status", ""), "[ ]")
            todo_lines.append(f"  {icon} {todo.get('content', '')}")
        console.print(Panel(
            "\n".join(todo_lines),
            title="[info]任务规划[/info]",
            border_style="cyan"
        ))
```

##### 4.2 `display_session_info` 函数中（约第 305 行之后）

```python
# 在 completed 结果展示后，增加 todos 展示
if last_response.get("todos"):
    todo_lines = []
    status_icon = {"pending": "[ ]", "in_progress": "[~]", "completed": "[x]"}
    for todo in last_response["todos"]:
        icon = status_icon.get(todo.get("status", ""), "[ ]")
        todo_lines.append(f"  {icon} {todo.get('content', '')}")
    console.print(Panel(
        "\n".join(todo_lines),
        title="[info]任务规划[/info]",
        border_style="cyan"
    ))
```

---

#### 5. `utils/config.py` — 可选改动

无必须改动。可选新增调试开关：

```python
# Deep Agents 配置
DEEP_AGENT_DEBUG = False
```

---

## 四、依赖变更

```bash
pip install deepagents
```

需要确认 `deepagents` 与现有锁定版本的兼容性：
- `langgraph==1.1.6`
- `langchain==1.2.15`
- `langchain-openai==1.1.12`
- `langgraph-checkpoint-postgres==3.0.5`

建议在安装后运行 `pip check` 验证依赖冲突。

---

## 五、改动量汇总

| 文件 | 改动类型 | 估计行数 | 风险等级 |
|------|---------|---------|---------|
| `utils/tasks.py` | 导入 + agent 创建 + 消息构造 + todos 提取 + 删除 trimmed_messages_hook | ~40 行（改 + 删） | 中 |
| `utils/tools.py` | 拆分为 `get_mcp_tools()` + `get_custom_tools()` + 内置工具 HITL 配置 | ~30 行（重构） | 中 |
| `utils/models.py` | 新增 todos 字段 | ~1 行 | 低 |
| `02_frontendServer.py` | 新增 todos 展示 | ~20 行 | 低 |
| `utils/config.py` | 可选调试开关 | ~1 行 | 无 |
| `01_backendServer.py` | **不改** | 0 | 无 |
| `utils/redis.py` | **不改** | 0 | 无 |
| `utils/llms.py` | **不改** | 0 | 无 |
| **合计** | | **~92 行** | |

---

## 六、验证步骤

### 6.1 基础功能验证

1. 启动 PostgreSQL + Redis
2. 启动 Celery worker → 启动后端 → 启动前端
3. 测试简单查询（如 "你好"）→ 验证 agent 正常返回
4. 测试 MCP 工具调用（如 "北京到上海的路线"）→ 验证主 Agent 委派 researcher 子 Agent，子 Agent 调用地图工具时触发 HITL

### 6.2 新能力验证

5. **任务规划**：发送复杂查询（如 "帮我规划一个北京三日游，包含景点、酒店和交通"）→ 验证 `todos` 字段返回且前端正确展示
6. **文件读写**：发送 "把这个计划保存到文件" → 验证 `write_file` 触发 HITL 审批，approve 后文件持久化到 Store
7. **多智能体**：发送复杂任务 → 观察日志确认主 Agent 通过 `task()` 工具委派子 Agent 执行
8. **子 Agent HITL**：验证子 Agent 调用需要审批的工具时，中断信号正确传递到前端

### 6.3 回归验证

9. 多会话管理（new/history 命令）正常
10. 长期记忆写入/读取（setting 命令）正常
11. 会话状态恢复（中断后重连）正常
12. Celery 异步任务调度正常

---

## 七、风险点与应对

| 风险 | 影响 | 应对方案 |
|------|------|---------|
| `deepagents` 包版本与现有 langchain/langgraph 版本冲突 | 安装失败或运行时错误 | 安装后 `pip check`，必要时升级 langchain 全家桶 |
| 内置工具名与 MCP 工具名冲突 | LLM 调用错误的工具 | 检查 MCP 工具名列表，必要时用 system_prompt 引导 |
| `execute` 工具的安全性（本地后端无沙箱） | 用户可能通过 Agent 执行危险命令 | `interrupt_on["execute"] = True` 强制 HITL |
| `SummarizationMiddleware` 的摘要策略可能与预期不符 | 关键上下文被过度压缩 | 观察长对话表现，必要时通过 system_prompt 引导保留关键信息 |
| `StoreBackend` 的 namespace 隔离 | 不同用户的文件可能互相可见 | 配置 `namespace` 工厂函数，按 user_id 隔离 |
| 默认模型是 claude-sonnet-4-6，你用 Qwen/OpenAI | 某些内置 prompt 可能对非 Claude 模型效果不佳 | 显式传入 `model=llm_chat`，观察 todo/task 工具调用质量 |

---

## 八、项目结构对比

```
06（改前）                              07（改后）
├── 01_backendServer.py  [不变]        ├── 01_backendServer.py  [不变]
├── 02_frontendServer.py [小改]        ├── 02_frontendServer.py [+todos展示]
├── utils/                             ├── utils/
│   ├── config.py        [不变]        │   ├── config.py        [可选+调试开关]
│   ├── llms.py          [不变]        │   ├── llms.py          [不变]
│   ├── models.py        [小改]        │   ├── models.py        [+todos字段]
│   ├── redis.py         [不变]        │   ├── redis.py         [不变]
│   ├── tasks.py         [★核心改]     │   ├── tasks.py         [create_deep_agent]
│   └── tools.py         [★重构]       │   └── tools.py         [拆分MCP/自定义+HITL]
└── docker/              [不变]        └── docker/              [不变]
```
