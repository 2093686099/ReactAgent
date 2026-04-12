# 架构设计方案

## 技术选型

| 层 | 选型 | 理由 |
|---|------|------|
| **前端** | Next.js 14 + TypeScript + Tailwind CSS | App Router 原生支持 SSE 消费；AI 聊天 UI 参考多（Vercel AI SDK）；React 生态组件丰富 |
| **UI 组件** | shadcn/ui | 可复制而非安装的组件库，可深度定制，适合自有产品 |
| **后端** | FastAPI (Python) | 保留现有 Agent 生态，原生 async + SSE 支持 |
| **实时通信** | SSE (Server-Sent Events) | Agent token 流式输出是单向的，SSE 比 WebSocket 简单；HITL 审批由前端 POST 提交，无需双向长连接 |
| **Agent** | deepagents (create_deep_agent) | 保留现有能力：子 Agent、HITL、任务规划、文件操作 |
| **数据库** | PostgreSQL | 保留，checkpointer + store |
| **缓存/会话** | Redis | 保留，简化 key 结构 |
| **包管理** | pyproject.toml (backend) + pnpm (frontend) | 现代标准 |

### 为什么选 SSE 而不是 WebSocket

```
SSE 优势（适合本场景）：
✓ 天然适配 LLM 流式输出（text/event-stream，和 OpenAI API 一致）
✓ 基于 HTTP，无需额外协议升级，proxy/CDN 友好
✓ FastAPI 原生 StreamingResponse 支持，零依赖
✓ 自动重连（EventSource API 内置 retry）
✓ 个人助手场景不需要客户端→服务端的实时推送

WebSocket 适合：
× 多人协作编辑、实时聊天室、游戏 — 不是我们的场景
```

### 为什么去掉 Celery

```
之前（Celery）：
  前端 POST → Celery 任务入队 → Worker 执行 → 结果写 Redis → 前端轮询 Redis
  问题：延迟高、架构复杂、Worker 进程隔离导致每次重建 Agent

之后（SSE 直连）：
  前端 POST → FastAPI 异步协程直接执行 Agent → SSE 实时推送 token → 完成
  优势：延迟低、代码简单、Agent 实例可复用
```

---

## 项目结构

```
neuron-assistant/                  # 项目根目录（从 07 提取后重命名）
├── backend/                       # Python 后端
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py               # FastAPI app 入口 + lifespan
│   │   ├── config.py             # pydantic-settings 配置管理
│   │   ├── dependencies.py       # FastAPI 依赖注入（db pool, redis, agent_service）
│   │   │
│   │   ├── api/                  # 路由层 — 只做参数校验和响应组装
│   │   │   ├── __init__.py
│   │   │   ├── chat.py           # POST /chat, GET /chat/stream/{task_id}
│   │   │   ├── sessions.py       # 会话 CRUD
│   │   │   └── memory.py         # 长期记忆读写
│   │   │
│   │   ├── core/                 # 核心业务 — Agent 生命周期
│   │   │   ├── __init__.py
│   │   │   ├── agent.py          # AgentService: 创建/配置 deep_agent
│   │   │   ├── streaming.py      # SSE 流式输出封装
│   │   │   ├── hitl.py           # HITL 决策构造（approve/edit/reject → Command）
│   │   │   └── tools.py          # 工具注册 + HITL 配置
│   │   │
│   │   ├── models/               # Pydantic 数据模型
│   │   │   ├── __init__.py
│   │   │   ├── chat.py           # ChatRequest, ChatEvent (SSE 事件类型)
│   │   │   ├── session.py        # SessionInfo, SessionStatus
│   │   │   └── memory.py         # MemoryRequest
│   │   │
│   │   ├── services/             # 业务服务层
│   │   │   ├── __init__.py
│   │   │   ├── session.py        # SessionService (Redis 操作封装)
│   │   │   └── memory.py         # MemoryService (PostgresStore 封装)
│   │   │
│   │   └── infra/                # 基础设施
│   │       ├── __init__.py
│   │       ├── database.py       # PG 连接池管理
│   │       ├── redis.py          # Redis 连接管理
│   │       └── llm.py            # LLM 初始化（多提供商）
│   │
│   ├── tests/
│   │   ├── conftest.py           # pytest fixtures (test db, redis mock)
│   │   ├── test_api/
│   │   ├── test_core/
│   │   └── test_services/
│   │
│   ├── pyproject.toml            # 项目元数据 + 依赖 + pytest/ruff 配置
│   ├── Dockerfile
│   └── alembic/                  # 数据库迁移（可选，目前 checkpointer 自动建表）
│       └── ...
│
├── frontend/                      # Next.js 前端
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx          # 主聊天页面
│   │   │   ├── layout.tsx        # 根布局（侧边栏 + 主区域）
│   │   │   └── globals.css
│   │   │
│   │   ├── components/
│   │   │   ├── chat/
│   │   │   │   ├── ChatPanel.tsx       # 聊天主面板
│   │   │   │   ├── MessageBubble.tsx   # 消息气泡（支持 Markdown 渲染）
│   │   │   │   ├── StreamingText.tsx   # 流式文字动画
│   │   │   │   └── InputBar.tsx        # 输入框 + 发送按钮
│   │   │   │
│   │   │   ├── hitl/
│   │   │   │   ├── ApprovalCard.tsx    # 工具调用审批卡片
│   │   │   │   └── ArgsEditor.tsx      # 工具参数编辑器（JSON editor）
│   │   │   │
│   │   │   ├── todos/
│   │   │   │   ├── TodoPanel.tsx       # 任务进度面板（可折叠）
│   │   │   │   ├── TodoItem.tsx        # 单条任务项 + 状态标记
│   │   │   │   └── TodoProgress.tsx    # 进度条（已完成/总数）
│   │   │   │
│   │   │   ├── sidebar/
│   │   │   │   ├── SessionList.tsx     # 历史会话列表
│   │   │   │   └── NewChatButton.tsx
│   │   │   │
│   │   │   └── ui/                     # shadcn/ui 基础组件
│   │   │       └── ...
│   │   │
│   │   ├── hooks/
│   │   │   ├── useChat.ts        # 核心 hook: 发送消息 + 消费 SSE 流
│   │   │   ├── useSession.ts     # 会话管理 hook
│   │   │   └── useHITL.ts        # HITL 审批交互 hook
│   │   │
│   │   ├── lib/
│   │   │   ├── api.ts            # 后端 API client (fetch wrapper)
│   │   │   ├── sse.ts            # SSE 连接管理
│   │   │   └── types.ts          # 共享 TypeScript 类型
│   │   │
│   │   └── stores/
│   │       └── chat.ts           # Zustand store（会话状态、消息列表）
│   │
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── next.config.ts
│   └── Dockerfile
│
├── docker/
│   └── docker-compose.yml        # 统一编排：postgres + redis（+ 可选 backend/frontend）
│
├── .env.example                   # 环境变量模板
├── .gitignore
├── CLAUDE.md
└── README.md
```

---

## 分层职责

```
┌─────────────────────────────────────────────┐
│  Frontend (Next.js)                         │
│  ┌─────────┐ ┌──────────┐ ┌─────────────┐  │
│  │ ChatUI  │ │ HITL审批  │ │ 会话管理     │  │
│  └────┬────┘ └────┬─────┘ └──────┬──────┘  │
│       │ SSE       │ POST         │ REST     │
└───────┼───────────┼──────────────┼──────────┘
        │           │              │
┌───────┼───────────┼──────────────┼──────────┐
│  API Layer (FastAPI Routers)                │
│  chat.py      chat.py       sessions.py     │  ← 参数校验 + 响应组装
├─────────────────────────────────────────────┤
│  Core Layer (Agent 生命周期)                 │
│  AgentService  │  streaming  │  hitl        │  ← 业务核心
├─────────────────────────────────────────────┤
│  Service Layer (数据操作)                    │
│  SessionService  │  MemoryService           │  ← 数据存取抽象
├─────────────────────────────────────────────┤
│  Infrastructure (连接管理)                   │
│  PostgreSQL pool  │  Redis  │  LLM clients  │  ← 基础设施
└─────────────────────────────────────────────┘
```

---

## 核心数据流

### 1. 后台任务模型 — 三端点分离

**关键设计**：agent 的执行生命周期和客户端的 SSE 连接生命周期分离。用户切换会话/关闭标签不会中断 agent 的工作。

```
┌──────────────┐       ┌─────────────────────────────┐       ┌──────────────┐
│   Frontend   │       │        FastAPI (Backend)    │       │    Redis     │
└──────┬───────┘       └──────┬──────────────────────┘       └──────┬───────┘
       │                      │                                     │
       │  POST /chat/invoke   │                                     │
       ├─────────────────────▶│                                     │
       │                      │  task_id=uuid4()                    │
       │                      │  create_task_meta(task_id)          │
       │                      ├────────────────────────────────────▶│
       │                      │  asyncio.create_task(run_agent)     │
       │                      │  ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈    │
       │                      │                                     │
       │   {task_id, status}  │                                     │
       │◀─────────────────────┤                                     │
       │                      │                                     │
       │                      │                                     │
       │                      │   后台协程：agent.astream()          │
       │                      │   parse_agent_events()              │
       │                      │   每个事件 XADD:                    │
       │                      │   task:{task_id}:events             │
       │                      ├────────────────────────────────────▶│
       │                      │                                     │
       │ GET /chat/stream/:id │                                     │
       ├─────────────────────▶│                                     │
       │                      │  XREAD task:{task_id}:events        │
       │                      │◀───────────────────────────────────▶│
       │                      │  循环阻塞读取 + 检查 task 状态       │
       │                      │                                     │
       │◀─────────────────────┤  SSE: id:X / event:token / ...      │
       │  event: token        │                                     │
       │  event: todo         │                                     │
       │  event: hitl         │                                     │
       │  ...                 │                                     │
       │                      │                                     │
```

**客户端断线重连**：
```
断开  →  task 在后台继续运行，事件继续写入 Redis Stream
重连  →  GET /chat/stream/{task_id}?from_id={last_seen_id}
       →  XREAD 从 from_id 开始读，不丢失事件
```

### 2. HITL 中断流

```
后台协程执行中
    │
    ▼
parse_agent_events 产出 ("hitl", {...})
    │
    ▼
publish_event 写入 Stream
set_task_status(task_id, "interrupted")
后台协程退出（不是错误）
    │
    ▼
SSE 端点检测到 task 状态 = interrupted → 发送最后事件后关闭流
    │
    ▼
前端弹 ApprovalCard，记录 last_event_id
    │
    ▼
用户选择 approve/edit/reject
    │
    ▼
POST /api/chat/resume {task_id, response_type, args}
    │
    ▼
TaskService.start_resume 创建新协程（同一 task_id）
Command(resume=...) 继续 agent
事件继续写入同一 Stream
    │
    ▼
前端重新 GET /chat/stream/{task_id}?from_id={last_event_id}
    │
    ▼
从中断后的新事件继续消费
```

### 3. 数据层

```
Redis：
  user_sessions:{user_id}             SET      用户的所有 session_id
  session:{user_id}:{session_id}      JSON     会话元数据
  task:{task_id}                      JSON     任务元数据 {user_id, session_id, status}
  task:{task_id}:events               STREAM   任务事件流（XADD/XREAD）

PostgreSQL（持久化，LangGraph 内置）：
  checkpointer → 按 thread_id=session_id 存储 agent 运行状态
  store         → 长期记忆（namespace=("memories", user_id)）
```

---

## SSE 事件协议

前后端约定的事件类型。SSE 端点为 `GET /api/chat/stream/{task_id}`，每条事件带 `id` 字段用于断点续传。

```typescript
// frontend/src/lib/types.ts

type SSEEvent =
  | { event: "token"; data: { text: string } }                              // AI 文本 token
  | { event: "tool";  data: { name: string; status: "calling" | "done" } }  // 工具调用（不含 args/result，详情走后端日志）
  | { event: "hitl";  data: HITLRequest }                                   // HITL 中断审批
  | { event: "todo";  data: { todos: Array<{ task: string; status: string }> } }
  | { event: "done";  data: { message: string } }                           // Agent 完成
  | { event: "error"; data: { message: string } }                           // 错误

// HumanInTheLoopMiddleware 的中断数据
type HITLRequest = {
  action_requests: Array<{ name: string; args: Record<string, any>; description?: string }>;
  review_configs: Array<any>;
}
```

后端解析器 `parse_agent_events()` 使用 LangGraph `astream(stream_mode=["updates", "messages"])` 的 `(mode, data)` 元组格式（非 astream_events 的 dict 格式）。

---

## 后端关键变化（对比 07）

| 07 现状 | 新架构 |
|--------|--------|
| `utils/tasks.py` 640 行 Celery 任务 | `core/agent.py`（Agent 创建）+ `core/streaming.py`（事件解析）+ `services/task.py`（后台执行）+ `infra/task_bus.py`（Redis Streams） |
| invoke/resume 各自创建 Agent（重复代码） | `AgentService.create_agent()` 统一创建 |
| Celery Worker 进程隔离，每次重建连接池 | `asyncio.create_task` 同进程后台执行，共享连接池 |
| 前端轮询 `GET /status/{task_id}` | SSE 推送 `GET /chat/stream/{task_id}`，支持断点续传 |
| `stream_and_collect_result` 用 `chunk.get("type")` 解析（astream/astream_events 混用 bug） | `parse_agent_events` 正确使用 `(mode, data)` 元组解包 |
| `utils/config.py` 手动 Config 类 | `config.py` 用 `pydantic-settings`，自动读 .env，类型安全 |
| `utils/redis.py` 490 行巨型 RedisSessionManager | `services/session.py`（~100 行）+ `infra/task_bus.py`（Redis Streams）|
| `01_backendServer.py` 混合路由+业务 | `api/*.py` 纯路由 + `api/deps.py` 依赖注入 + `core/*.py` 纯业务 |
| 无测试 | `tests/` pytest + httpx AsyncClient |
| 无 CORS、无健康检查 | `main.py` 内置 CORS + `/health` 端点 + 集中 logging 配置 |

---

## 前端关键组件

```
┌──────────────────────────────────────────────────────────────────┐
│  Layout                                                          │
│  ┌──────────┐  ┌──────────────────────────────┐  ┌───────────┐  │
│  │ Sidebar  │  │  ChatPanel                   │  │ TodoPanel  │  │
│  │          │  │  ┌────────────────────────┐   │  │           │  │
│  │ 新建对话  │  │  │ MessageBubble (user)   │   │  │ ✅ 查天气  │  │
│  │          │  │  │ MessageBubble (ai)      │   │  │ ⏳ 查路线  │  │
│  │ ──────── │  │  │  "让我帮你查一下..."     │   │  │ ○ 汇总    │  │
│  │ 会话 1   │  │  │  🔧 book_hotel ⏳       │   │  │           │  │
│  │ 会话 2   │  │  │  "已预定全季酒店。"      │   │  │ ━━━━━━━━  │  │
│  │ 会话 3   │  │  │  [HITL: ApprovalCard]  │   │  │ 1/3 完成   │  │
│  │          │  │  └────────────────────────┘   │  │           │  │
│  │          │  │  ┌────────────────────────┐   │  │           │  │
│  │          │  │  │ InputBar               │   │  │           │  │
│  └──────────┘  │  └────────────────────────┘   │  └───────────┘  │
│                └──────────────────────────────┘                  │
└──────────────────────────────────────────────────────────────────┘
```

AI 消息采用 segments 数组，文本与工具调用按时间交错排列在**同一气泡**内。

---

## 迁移路径

详见 `MIGRATION_GUIDE.md`（6 步迁移指南，含完整代码）。
