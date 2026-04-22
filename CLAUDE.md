# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

AI Agent 智能体助手 — 全栈已就绪。FastAPI 后端（分层 + asyncio 后台任务 + SSE 推送） + Next.js 15 前端（Tailwind v4 + shadcn + Zustand），PostgreSQL 做长期状态，Redis 做会话/事件流。

完整架构见 `ARCHITECTURE.md`；前端 UI 设计 token 见 `DESIGN.md`（必须遵守，不要自行发挥色值/字重/间距）。

## Tech Stack

- **Agent**: `deepagents.create_deep_agent`（LangGraph 之上），`SummarizationMiddleware` + `HumanInTheLoopMiddleware`
- **子 Agent**：`researcher`（高德 MCP 地图工具）、`data_analyst`（SQLDatabaseToolkit / MySQL，`sql_db_query` 强制 HITL）
- **LLM**: 多提供商（Tencent/ModelScope/Qwen/OpenAI/Ollama），当前 `.env` 默认 `tencent`（glm-5）
- **Memory**: PostgreSQL `AsyncPostgresSaver` (checkpointer) + `AsyncPostgresStore` (长期记忆)
- **Session**: Redis async，key `session:{user_id}:{session_id}`
- **Task Bus**: Redis Streams `task:{task_id}:events`（XADD/XREAD）+ `task:{task_id}` HASH（元数据）
- **Async**: `asyncio.create_task` 后台跑 agent，SSE 推送事件（不用 Celery + 轮询）
- **Frontend**: Next.js 15.5 + React 19 + Tailwind v4 + shadcn + Zustand；SSE via `EventSource`；无 SSR 数据层（`"use client"` 单页）

## Running the Project

```bash
# 基础设施（postgres:5432, redis:6379）
cd docker && docker-compose up -d

# 后端（port 8001）
cd backend && uv run python -m app.main
# 或 pip install -e ".[dev]" 后 python -m app.main

# 前端（port 3000，找不到会自动升到 3001...）
cd frontend && npm run dev
```

## Testing

```bash
# 后端 52 个用例（pytest + pytest-asyncio auto mode）
cd backend && pytest -q
cd backend && pytest tests/test_core/test_streaming.py -v    # 单文件
cd backend && pytest -k test_hitl -v                          # 按名字筛

# 前端 36 个用例（vitest，集中在 stores 状态机）
cd frontend && npx vitest run
cd frontend && npx vitest run src/stores/__tests__/chat-store.todos.test.ts

# 前端类型检查（Next build 里已隐式跑，但独立跑更快）
cd frontend && npx tsc --noEmit

# 前端格式化/lint（biome，老 shadcn 生成文件会报格式错，忽略即可）
cd frontend && npx @biomejs/biome check --write src/
```

**注意 `tests/test_main.py`**：在非 Windows 环境会因为 `asyncio.WindowsSelectorEventLoopPolicy` 属性缺失报 2 个失败，这是环境性失败不是代码回归，可用 `--ignore=tests/test_main.py` 跳过。

## Backend Architecture

### 分层

```
backend/app/
├── api/          路由 — 参数校验 + 响应组装
│   ├── chat.py       POST /api/chat/invoke, /resume, GET /stream/{task_id}
│   ├── sessions.py   会话 CRUD
│   ├── memory.py     长期记忆读写
│   ├── system.py     GET /api/system/meta（provider+model+tools，前端 Sidebar 消费）
│   └── deps.py       FastAPI 依赖注入（get_current_user, get_*_service）
├── core/         业务核心
│   ├── agent.py      AgentService — create_deep_agent 构建
│   ├── streaming.py  parse_agent_events — astream 事件解析（含 task→subagent 解析）
│   ├── hitl.py       build_decisions — HITL 决策转换
│   ├── tools.py      MCP/自定义工具 + HITL 配置（进程级缓存）
│   ├── exceptions.py BusinessError + TaskNotFoundError/TaskStateError/InvalidDecisionError
│   └── auth.py       JWT 认证（占位待实现）
├── services/     业务服务（lazy singleton）
│   ├── task.py       TaskService — 后台任务生命周期 + Redis 状态机
│   ├── session.py    SessionService — Redis 会话管理
│   └── memory.py     MemoryService — PostgresStore 长期记忆
├── infra/        基础设施
│   ├── database.py   PG 连接池 + checkpointer + store
│   ├── redis.py      Redis 连接管理
│   ├── llm.py        LLM 初始化（多提供商）+ get_model_info
│   └── task_bus.py   Redis Streams 事件总线 + TaskMeta HASH
├── models/chat.py    Pydantic: ChatRequest/ResumeRequest/TaskCreatedResponse
├── config.py         pydantic-settings 配置
└── main.py           FastAPI app + lifespan + exception_handler
```

### 依赖注入

服务走 `deps.py` 的 lazy singleton，路由用 `Depends` 注入。测试时通过 `app.dependency_overrides` 注入 mock。

### HITL 决策流

1. Agent 调用工具 → `HumanInTheLoopMiddleware` 按 `interrupt_on` 拦截
2. `parse_agent_events` yield `("hitl", ...)` 事件
3. `TaskService` 写 Redis Stream，task 状态 → `interrupted`
4. SSE 端点推 hitl 事件到前端
5. 用户 approve/edit/reject → `POST /api/chat/resume`
6. `build_decisions` 把 HTTP payload 转成 `Command(resume=...)`，graph 从 checkpoint 恢复

### streaming.py 里的 `task` 工具特殊处理

deepagents 的 `task` 工具是子 Agent 委派入口。为了让前端 pill 显示具体子 Agent 名（`researcher` / `data_analyst`）而不是通用的 `task`，parser 会 sniff `tool_call_chunks` 的 args 里的 `subagent_type` 字段。**关键**：langchain 的 `tool_call_chunks` 协议里 `name` 和 `id` **只出现在首个 chunk**，后续 chunk 只有 `args` 片段 + `index`，因此 parser 按 `(message_id, index) → tool_call_id` 建立映射追踪。解析失败时回落到 `task` 并补一条 `calling` 事件保证前端 calling→done 段完整。

### MCP 工具错误降级

`core/tools.py` 的 `_wrap_mcp_tool_with_retry`：
- **限流**（`CUQPS_HAS_EXCEEDED_THE_LIMIT` / `ACCESS_TOO_FREQUENT`）：semaphore 限并发 + 指数退避重试
- **其他 ToolException**（如 `INVALID_PARAMS`）：**返回错误字符串而非 re-raise**。若 re-raise，异常会穿过 langgraph ToolNode → 子 Agent → 父 `task` 工具，把整个会话 kill 掉。返回字符串让 Agent 看到失败可自行决定重试/换工具/告知用户。

## Frontend Architecture

```
frontend/src/
├── app/              Next App Router
│   ├── layout.tsx    根布局（Inter 字体 + Toaster）
│   ├── page.tsx      ChatPage — 单页所有状态编排（session switch / send / approve / reject）
│   └── globals.css   @theme tokens + .nice-scroll + keyframes（hitl-glow/hitl-dot/drawer-in/todoEnter）
├── components/
│   ├── layout/       AppLayout（三栏 grid）+ ReconnectBanner
│   ├── sidebar/      Sidebar（方案 B Editor Mode: Agent 卡片 + 搜索 + 工具面板）
│   ├── chat/         ChatArea/MessageList/MessageBubble/ToolPill/HitlCard/ChatInput/TextSegment
│   ├── todo/         TodoDrawer（320px 抽屉 + 渐变进度条）
│   └── ui/           shadcn 生成组件（不要手改，会被覆盖）
├── stores/           Zustand
│   ├── chat-store.ts       messages/todos/status/currentTaskId + token RAF buffer
│   ├── session-store.ts    sessions 列表 + active + 删除撤销
│   ├── ui-store.ts         drawerOpen + autoOpen 幂等（持久化到 localStorage）
│   └── system-meta-store.ts /api/system/meta 缓存（_inflight 去重，Sidebar+Composer 共享）
├── hooks/
│   ├── use-sse.ts          SSE 事件分发 → chat-store 各 action
│   └── use-auto-scroll.ts  智能滚动（用户滚开时暂停自动跟随）
└── lib/
    ├── api.ts        fetch 封装 + API_BASE=http://localhost:8001
    ├── types.ts      Message/Segment/HitlStatus/SystemMeta
    ├── tool-labels.ts 工具名 → 中文显示名（含 researcher/data_analyst/sql_db_*）
    └── time-group.ts  会话按"今天/本周/更早"分组
```

### 状态流向

```
EventSource (SSE) ──► use-sse.ts 派发 ──► chat-store actions ──► 组件重渲染
                                          │
                                          ▼
                     autoOpenDrawer (ui-store) 首次收到 todo 时弹抽屉
```

所有 API 调用（`invokeChat` / `resumeChat` / `fetchSystemMeta`）集中在 `src/lib/api.ts`，相对路径指向 `API_BASE`。CORS 在 `backend/app/main.py` 对 `http://localhost:*` 放行。

### UI 规范

- **颜色 / 字重 / 间距**：以 `DESIGN.md` 为权威，`globals.css` 的 `@theme` 块是这些 token 的实现
- **滚动条**：滚动容器必须加 `className="nice-scroll"`（默认白滚动条刺眼，已有过用户反馈）
- **HITL Card 琥珀警示**：`hitl-glow` / `hitl-dot` 呼吸动画已在 globals.css，Y/N/F 键盘快捷键全局监听
- **头像**：Sidebar Agent 卡片 + 消息气泡 assistant 头像统一用 `Sparkles` icon + 紫渐变方块

## Development Gotchas

### uvicorn `--reload` + SSE 卡死（高频坑）

`main.py` 里 `uvicorn.run(..., reload=True)` 配合长连接 SSE 会导致热重载卡住：
1. 编辑 `streaming.py` / `tools.py` / `prompts.py` 触发 reload
2. uvicorn 优雅关闭 → 等所有连接关闭 → 前端 SSE 长连接不关
3. 进程卡在 "Shutting down"，端口还监听但不接受新请求
4. 前端新的 POST `/api/chat/resume` 超时，UI 假死

**恢复**：`kill <pid>` 强杀旧进程 + 重启。若想治本，`uvicorn.run` 加 `timeout_graceful_shutdown=5`。

### AMAP 高德 MCP 免费 key 限流

个人 key 大约 2 QPS，`researcher` 子 Agent 并行查询会瞬间打满。`tools.py` 用 `_MCP_CONCURRENCY=2` 的 asyncio Semaphore 限并发 + 指数退避重试。看到日志 `AMAP rate-limited on X (attempt n/3)` 是正常 —— 不是 bug。

### HITL 恢复后 tool 标记回写

用户 reject / feedback 时前端立刻乐观更新 HITL 状态为 rejected，但 LangGraph resume 后会**重放原 tool call**，streaming 层会解析出 `ToolMessage` 标记 done。`chat-store.ts` 的 `addToolSegment` / `updateToolSegment` 会反查前面的 HITL 段：若同名 HITL 已是 rejected/feedback，tool 直接标 rejected，避免显示绿✓ 误导用户。

## Infrastructure

- **PostgreSQL** (port 5432): `docker/docker-compose.yml`，默认 `postgres:password@localhost:5432/neuron_ai_assistant`
- **Redis** (port 6379): 同一 compose
- 连接通过 `.env` 的 `DB_URI` 覆盖 `config.py` 默认

## Environment Variables

通过项目根 `.env` 加载：

- `DB_URI` — PostgreSQL 连接串（含 `sslmode=disable`）
- `LLM_TYPE` — `tencent` / `modelscope` / `qwen` / `openai` / `ollama`
- `TENCENT_API_KEY` / `MODELSCOPE_API_KEY` / `DASHSCOPE_API_KEY` / `OPENAI_API_KEY` / `OPENAI_BASE_URL`
- `AMAP_MAPS_API_KEY` — 高德 MCP key（没配会禁用 researcher 子 Agent）
- `MYSQL_URI` — MySQL 连接串（没配会禁用 data_analyst 子 Agent）
- `RAG_KB_URL` — graph2 RAG 知识库服务（默认 `http://localhost:8765`）

## Python Environment

```bash
# uv（推荐，项目用的是 uv）
cd backend && uv sync

# 或 conda
conda create -n ReActAgents python=3.11
cd backend && pip install -e ".[dev]"
```

关键版本锁定（`backend/pyproject.toml`）：`langgraph==1.1.6` / `langchain==1.2.15` / `langchain-openai==1.1.12` / `fastapi==0.115.12` / `langchain-community==1.0.0a1`（alpha，`data_analyst` 需要）

## MCP Servers for Development

`.mcp.json` 配了两个文档 MCP 供开发查 API（不是运行时依赖）：
- `langchain-docs`（stdio via `uvx mcpdoc`）— langchain-python + langgraph-python 的 llms.txt
- `langchain-reference`（http）— LangChain 官方 API 参考

查 langchain/langgraph API 时优先用这两个 MCP，不要靠记忆。

## Project Planning

`.planning/` 下是 GSD（Get Stuff Done）工作流文件 —— `ROADMAP.md` / `PROJECT.md` / `STATE.md` / `REQUIREMENTS.md` 跟踪阶段、需求、当前状态。开始新工作时先看 `.planning/STATE.md` 知道进度。
