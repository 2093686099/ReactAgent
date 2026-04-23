# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**AI Assistant** —— 个人 AI Agent 智能体助手。用户自然语言对话，Agent 自主调用工具完成任务，关键操作走人工审批（HITL）。

- **后端** FastAPI（分层 + asyncio 后台任务 + Redis Streams + SSE 推送）
- **前端** Next.js 15 单页（Tailwind v4 + shadcn + Zustand）
- **Agent** `deepagents.create_deep_agent`（LangGraph 之上）+ `SummarizationMiddleware` + `HumanInTheLoopMiddleware`
- **子 Agent** `researcher`（高德 MCP 地图）、`data_analyst`（MySQL SQLToolkit，`sql_db_query` 强制 HITL）
- **LLM** 多提供商（tencent/modelscope/qwen/openai/ollama），默认 `tencent` (glm-5)
- **持久化** PostgreSQL（`AsyncPostgresSaver` checkpointer + `AsyncPostgresStore` 长期记忆）+ Redis（会话 + task 事件流）

架构细节看 `ARCHITECTURE.md`；UI token 看 `DESIGN.md`（色值/字重/间距以它为权威，不要自行发挥）；阶段进度看 `.planning/STATE.md`。

## Running

```bash
cd docker && docker-compose up -d            # postgres:5432 + redis:6379
cd backend && uv run python -m app.main      # 后端 :8001
cd frontend && npm run dev                   # 前端 :3000（占用会升到 3001）
```

## Testing

```bash
cd backend && pytest -q                                      # 52 用例
cd backend && pytest tests/test_core/test_streaming.py -v    # 单文件
cd backend && pytest -k test_hitl -v                         # 按名字筛
cd frontend && npx vitest run                                # 36 用例（集中在 stores）
cd frontend && npx tsc --noEmit                              # 独立类型检查
cd frontend && npx @biomejs/biome check --write src/         # lint（旧 shadcn 文件会报，忽略）
```

`tests/test_main.py` 在非 Windows 会报 2 个 `WindowsSelectorEventLoopPolicy` 环境性失败，不是回归，可 `--ignore=tests/test_main.py` 跳过。

## Backend Layout

```
backend/app/
├── api/       路由（chat/sessions/memory/system + deps 依赖注入）
├── core/      agent · streaming · hitl · tools · exceptions · auth(占位)
├── services/  task / session / memory — lazy singleton，路由走 Depends 注入
├── infra/     database · redis · llm · task_bus（Redis Streams 事件 + HASH 元数据）
├── models/    Pydantic schemas
└── main.py    FastAPI app + lifespan + exception_handler
```

### HITL 决策流

Agent 工具调用 → `HumanInTheLoopMiddleware` 按 `interrupt_on` 拦截 → `parse_agent_events` yield `hitl` → `TaskService` 写 Redis Stream + task 状态 `interrupted` → SSE 推前端 → 用户 approve/edit/reject `POST /api/chat/resume` → `build_decisions` 转 `Command(resume=...)` → graph 从 checkpoint 恢复。

### streaming.py 里 `task` 工具的特殊处理

`task` 是 deepagents 的子 Agent 委派入口，为了让前端 pill 显示具体子 Agent 名（`researcher` / `data_analyst`），parser sniff `tool_call_chunks` 里的 `subagent_type`。**坑**：langchain `tool_call_chunks` 协议里 `name` / `id` **只在首个 chunk** 出现，后续只有 `args` 片段 + `index`，所以 parser 按 `(message_id, index) → tool_call_id` 建映射追踪。解析失败回落到 `task` 并补一条 `calling` 事件，保证前端 calling→done 段完整。

### MCP 工具错误降级

`core/tools.py` 的 `_wrap_mcp_tool_with_retry`：

- **限流**（`CUQPS_HAS_EXCEEDED_THE_LIMIT` / `ACCESS_TOO_FREQUENT`）：semaphore 限并发 + 指数退避
- **其他 ToolException**（如 `INVALID_PARAMS`）：**返回错误字符串，不 re-raise**。re-raise 会穿过 ToolNode → 子 Agent → 父 `task` 把整个会话 kill 掉。返回字符串让 Agent 自行决定重试/换工具/告知用户。

## Frontend Layout

```
frontend/src/
├── app/         layout · page.tsx（ChatPage 单页编排）· globals.css（@theme + nice-scroll + keyframes）
├── components/  layout · sidebar · chat（MessageBubble/ToolPill/HitlCard/...） · todo · ui (shadcn)
├── stores/      chat · session · ui · system-meta（Zustand）
├── hooks/       use-sse · use-auto-scroll
└── lib/         api · types · tool-labels · time-group
```

事件流：`EventSource` → `use-sse.ts` 分发 → `chat-store` actions → 组件重渲染。首次收到 todo 时 `ui-store.autoOpenDrawer` 弹抽屉（幂等，持久化 localStorage）。

API 调用集中在 `src/lib/api.ts`（`API_BASE=http://localhost:8001`），CORS 在 `main.py` 对 `localhost:*` 放行。

UI 规范：

- 色值/字重/间距以 `DESIGN.md` 为权威，实现在 `globals.css` 的 `@theme` 块
- 滚动容器必须加 `className="nice-scroll"`（默认滚动条刺眼，有过用户反馈）
- HITL 琥珀呼吸 `hitl-glow` / `hitl-dot` 已在 globals.css，全局 Y/N/F 键盘快捷键
- assistant 头像统一 `Sparkles` icon + 紫渐变方块（Sidebar Agent 卡片同）
- `components/ui/` 是 shadcn 生成的，不要手改会被覆盖

## Development Gotchas

### uvicorn `--reload` + SSE 卡死

编辑 `streaming.py` / `tools.py` / `prompts.py` 触发 reload 时，uvicorn 优雅关闭会等 SSE 长连接关，前端不关就卡在 "Shutting down"，`/api/chat/resume` 超时、UI 假死。**恢复**：`kill <pid>` 强杀重启。治本：`uvicorn.run(..., timeout_graceful_shutdown=5)`。

### AMAP 高德 MCP 免费 key ≈ 2 QPS

`researcher` 并行查询会瞬间打满。`tools.py` 用 `_MCP_CONCURRENCY=2` 的 asyncio Semaphore + 指数退避重试。日志里 `AMAP rate-limited on X (attempt n/3)` 是正常不是 bug。

### HITL 恢复后 tool 标记回写

用户 reject/feedback 时前端立刻乐观标 rejected，但 LangGraph resume 会**重放原 tool call**，streaming 会 yield `ToolMessage` 标 done。`chat-store.ts` 的 `addToolSegment` / `updateToolSegment` 反查前面的 HITL 段：同名 HITL 已是 rejected/feedback 就直接标 rejected，避免绿 ✓ 误导。

## Environment

`.env` 在项目根：

- `DB_URI` — PostgreSQL 连接串（含 `sslmode=disable`）
- `LLM_TYPE` + 对应的 `TENCENT_API_KEY` / `MODELSCOPE_API_KEY` / `DASHSCOPE_API_KEY` / `OPENAI_API_KEY` / `OPENAI_BASE_URL`
- `AMAP_MAPS_API_KEY` — 高德 MCP（没配则禁用 `researcher`）
- `MYSQL_URI` — MySQL（没配则禁用 `data_analyst`）
- `RAG_KB_URL` — graph2 RAG 知识库（默认 `http://localhost:8765`）

Python 环境：`cd backend && uv sync`（推荐）或 `pip install -e ".[dev]"`。

版本锁定（`backend/pyproject.toml`）：`langgraph==1.1.6` / `langchain==1.2.15` / `langchain-openai==1.1.12` / `fastapi==0.115.12` / `langchain-community==1.0.0a1`（alpha，`data_analyst` 要）。

## MCP 文档服务器（开发用，非运行时）

`.mcp.json` 配了 `langchain-docs`（`uvx mcpdoc`）和 `langchain-reference`（http）。查 langchain/langgraph API 时优先走这俩，别靠记忆。

## Project Planning

`.planning/` 是 GSD（Get Stuff Done）工作流文件：`ROADMAP.md` / `PROJECT.md` / `STATE.md` / `REQUIREMENTS.md`。开始新工作先看 `.planning/STATE.md` 对进度。
