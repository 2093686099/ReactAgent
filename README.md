# Neuron AI Assistant

> 全栈 AI Agent 智能体助手 — 用自然语言驱动工具链，关键操作人在回路。

个人 AI 助手，后端 FastAPI + deepagents / LangGraph，前端 Next.js 15 单页。Agent 自主调用地图、SQL、记忆等工具完成任务，敏感操作走人工审批（HITL），从会话到任务进度全链路可恢复。

<p align="center">
  <sub>FastAPI · LangGraph · Next.js 15 · PostgreSQL · Redis Streams · SSE</sub>
</p>

---

## 核心亮点

### 架构 — 异步原生 · SSE 流式 · 无 Worker

- **FastAPI 全链路 `async`**：路由、服务层、Agent 执行一条协程到底，无阻塞 I/O；连接池化的 PostgreSQL / Redis / HTTP 客户端。
- **SSE 替代 Celery**：Agent token 走 `text/event-stream`，[告别了 "任务入队 → Worker → Redis → 前端轮询" 的四跳链路](./ARCHITECTURE.md)，端到端延迟降到百毫秒级，Agent 实例进程内常驻可复用。
- **Redis Streams 事件总线**：`task:{task_id}:events` 支持多端 `XREAD` fan-out，前端断线重连走 `Last-Event-ID` 从断点续播，SSE 零丢失。
- **`asyncio.create_task` 后台调度**：不需要 worker 进程、不需要消息队列，Agent 在 FastAPI 进程内协程执行，部署就一个二进制。

### Agent — 分层智能 · 人在回路

- **主 Agent + 子 Agent 编排**：基于 `deepagents.create_deep_agent`，主 Agent 负责规划/对话，`researcher`（高德 MCP 地图）和 `data_analyst`（MySQL 自然语言查询）作为专用子 Agent 按需委派。
- **HITL 中间件**：`sql_db_query` 等高危工具强制中断，前端弹审批卡片（approve / edit / reject / feedback），决策通过 `Command(resume=...)` 注入回 LangGraph checkpoint 无缝续跑，审批体验接近编辑器 inline diff。
- **多 LLM 提供商**：tencent / modelscope / qwen / openai / ollama 统一 LangChain 接口抽象，切换只改一行 `.env`，当前默认 `tencent` (glm-5)。
- **持久化一切**：`AsyncPostgresSaver` 做 graph checkpoint（每一步中断都能恢复），`AsyncPostgresStore` 做跨会话长期记忆，Redis 只管热路径状态。

### 韧性 — QPS 限流 · 故障降级

- **MCP 调用 Semaphore 限并发**：高德免费 key 只有约 2 QPS，工具层用 `_MCP_CONCURRENCY=2` + 指数退避，限流错误自动重试不打穿。
- **错误字符串降级而非异常穿透**：`ToolException` 不 re-raise，转成字符串回传给 Agent 自主决策（重试 / 换工具 / 告知用户），异常不会穿过 `ToolNode → 子 Agent → 父 task` 把整条对话线 kill 掉。
- **SSE 事件重放**：重连走 `Last-Event-ID`，服务端从该位置 `XREAD` 恢复推送，结合前端乐观更新，弱网体验接近本地。

### 前端 — Linear 风格 · 实时反馈

- **Next.js 15 + React 19 + Tailwind v4 单页**：全 `"use client"`，省掉 SSR 数据层复杂度，编译产物极小。
- **Zustand 细粒度 store**：chat / session / ui / system-meta 四个 store 职责分离，token 使用 RAF 批渲染避免高频重绘导致掉帧。
- **设计语言参考 Linear**：`#08090a` 深色画布、Inter 510 signature 字重、琥珀色 HITL 警示呼吸动画（`hitl-glow` / `hitl-dot`）、全局 Y/N/F 键盘快捷键，详见 [DESIGN.md](./DESIGN.md)。

---

## 架构总览

```
                      ┌──────────────────────┐
                      │   Next.js 15 单页     │
                      │   Zustand · SSE      │
                      └──────────┬───────────┘
                                 │  POST /invoke  · GET /stream/{id}
                                 │  POST /resume
┌────────────────────────────────┴────────────────────────────────┐
│  FastAPI (async lifespan)                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │  api/    │→ │ services │→ │  core    │→ │  infra   │         │
│  │  路由    │  │ task ··· │  │ agent ·  │  │ pg/redis │         │
│  │          │  │ session  │  │streaming │  │ llm      │         │
│  │          │  │ memory   │  │ hitl     │  │ task_bus │         │
│  └──────────┘  └──────────┘  └────┬─────┘  └──────────┘         │
│                                   │                             │
│         deepagents.create_deep_agent                            │
│           ├── SummarizationMiddleware                           │
│           ├── HumanInTheLoopMiddleware (interrupt_on)           │
│           └── sub-agents: researcher · data_analyst             │
└────────────┬──────────────────────────────┬─────────────────────┘
             │                              │
      ┌──────▼──────┐                ┌──────▼───────┐
      │ PostgreSQL  │                │    Redis     │
      │ checkpoint  │                │ session +    │
      │ + long-mem  │                │ task streams │
      └─────────────┘                └──────────────┘
```

---

## 技术栈

| 层 | 选型 |
|---|---|
| Agent 框架 | deepagents · LangGraph 1.1.6 · LangChain 1.2.15 |
| LLM 接入 | langchain-openai 统一入口，支持 tencent / modelscope / qwen / openai / ollama |
| Web 框架 | FastAPI 0.115 + uvicorn（async lifespan · StreamingResponse） |
| 状态存储 | PostgreSQL 16（`AsyncPostgresSaver` + `AsyncPostgresStore`）· Redis 7（Streams + HASH） |
| 前端框架 | Next.js 15.5 · React 19 · TypeScript 5 |
| 样式 | Tailwind CSS v4 · shadcn/ui · Radix UI primitives |
| 状态管理 | Zustand（selector 粒度 + RAF 批渲染） |
| 工具链 | uv（Python）· npm · biome（lint/format）· pytest · vitest |
| MCP 集成 | 高德地图 MCP（researcher）· 自研 SQL Toolkit 包装（data_analyst） |

---

## 快速开始

```bash
# 1. 拉起基础设施（postgres:5432 + redis:6379）
cd docker && docker-compose up -d

# 2. 启动后端（:8001）
cd backend && uv sync && uv run python -m app.main

# 3. 启动前端（:3000）
cd frontend && npm install && npm run dev
```

浏览器打开 `http://localhost:3000`，试试：

> "帮我查一下上海人民广场附近 2 公里内评分最高的火锅店"
> "从 sales 表里统计过去 7 天每个品类的销售额，画个对比"（会触发 HITL 审批）

---

## 项目结构

```
.
├── backend/              FastAPI + deepagents
│   ├── app/
│   │   ├── api/          路由层（chat/sessions/memory/system/deps）
│   │   ├── core/         Agent · streaming · HITL · tools
│   │   ├── services/     业务服务（task/session/memory，lazy singleton）
│   │   ├── infra/        PostgreSQL · Redis · LLM · task_bus
│   │   └── models/       Pydantic schemas
│   └── tests/            52 用例 · pytest-asyncio
├── frontend/             Next.js 15 单页
│   └── src/
│       ├── app/          App Router（ChatPage）
│       ├── components/   layout · sidebar · chat · todo · ui(shadcn)
│       ├── stores/       Zustand（chat/session/ui/system-meta）
│       ├── hooks/        use-sse · use-auto-scroll
│       └── lib/          api · types · tool-labels · time-group
├── docker/               docker-compose.yml（pg + redis）
├── ARCHITECTURE.md       架构决策与选型理由
├── DESIGN.md             UI Design System（Linear 风格 token）
└── CLAUDE.md             Claude Code 开发上下文
```

---

## 环境变量

在项目根 `.env`：

| Key | 说明 |
|---|---|
| `DB_URI` | PostgreSQL 连接串（含 `sslmode=disable`） |
| `LLM_TYPE` | `tencent` / `modelscope` / `qwen` / `openai` / `ollama` |
| `TENCENT_API_KEY` · `MODELSCOPE_API_KEY` · `DASHSCOPE_API_KEY` · `OPENAI_API_KEY` · `OPENAI_BASE_URL` | 对应 provider 的凭证 |
| `AMAP_MAPS_API_KEY` | 高德 MCP key（可选，未配置则禁用 `researcher`） |
| `MYSQL_URI` | MySQL 连接串（可选，未配置则禁用 `data_analyst`） |
| `RAG_KB_URL` | RAG 知识库服务（默认 `http://localhost:8765`） |

---

## 测试

```bash
# 后端 52 用例
cd backend && pytest -q

# 前端 36 用例（集中在 stores 状态机）
cd frontend && npx vitest run

# 前端类型检查 + lint
cd frontend && npx tsc --noEmit
cd frontend && npx @biomejs/biome check --write src/
```

---

## 深入阅读

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — 架构决策记录，含 SSE vs WebSocket、为什么去掉 Celery、状态机设计等
- **[DESIGN.md](./DESIGN.md)** — UI Design System，Linear 风格 token 全量定义
- **[CLAUDE.md](./CLAUDE.md)** — 仓库开发上下文（给 Claude Code 用，人类也能看）

---

## 路线图

- [x] Agent 核心能力 · HITL · 多会话 · SSE 流式
- [x] 子 Agent（researcher / data_analyst）· 多 LLM provider
- [x] Next.js 前端 · Linear 风格 UI
- [ ] 用户认证（JWT，架构已预留 `Depends(get_current_user)` 扩展点）
- [ ] Agent 配置 UI（目前通过 `.env`）
- [ ] 移动端适配

---

<p align="center">
  <sub>Built with a lot of <code>asyncio.create_task</code></sub>
</p>
