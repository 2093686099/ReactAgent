# Phase 08: SSE Chat Foundation - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

用户可以通过 Web 界面与 AI Agent 进行流式对话。包含 Next.js 项目脚手架搭建、SSE 流式聊天核心、消息列表、输入框、Markdown 渲染、加载/错误状态。不包含 HITL 审批、会话管理、Todo 面板（后续 Phase）。

</domain>

<decisions>
## Implementation Decisions

### 页面布局
- **D-01:** 预留侧边栏骨架 — Phase 08 搭好左侧边栏 + 右聊天区的整体 layout。侧边栏内容（会话列表）Phase 10 填充，Phase 08 只放 logo + "新建会话"按钮占位。
- **D-02:** 聊天区域背景用 `#0f1011`（Panel Dark），侧边栏用 `#08090a`（最深色），形成层次。

### 消息气泡风格
- **D-03:** Claude 风格 — AI 消息无气泡背景，直接铺文本。用户消息右对齐，有气泡背景（`#191a1b` + `rgba(255,255,255,0.08)` 边框）。
- **D-04:** 无头像。AI 回复底部放一个小 logo 标识。
- **D-05:** 数据模型预留 segments 数组结构（`{type: "text", content} | {type: "tool", name, status}`），Phase 08 只渲染 text 类型，Phase 09 实现 tool 类型。

### 色彩与主题
- **D-06:** 只做 dark mode，不做 light/dark 切换。
- **D-07:** 采用 Linear 设计系统（项目根 `DESIGN.md`），关键 token：
  - 背景三级：`#08090a` → `#0f1011` → `#191a1b`
  - 品牌色：`#5e6ad2`（CTA）/ `#7170ff`（交互强调）/ `#828fff`（hover）
  - 文字四级：`#f7f8f8`（主）/ `#d0d6e0`（次）/ `#8a8f98`（三级）/ `#62666d`（四级）
  - 边框：`rgba(255,255,255,0.05)` ~ `rgba(255,255,255,0.08)` 半透明白
  - 字体：Inter Variable（cv01, ss03）+ Berkeley Mono（代码）
  - 签名字重 510，最大 590，不用 700

### 输入区域
- **D-08:** Enter 发送 + Shift+Enter 换行。
- **D-09:** 输入框高度自适应（多行自动撑开），有 placeholder 引导文案。
- **D-10:** 输入框底部固定在聊天区域底部。

### 技术栈（来自研究阶段）
- **D-11:** Next.js 15.5 + Tailwind v4 + shadcn/ui + Zustand 5
- **D-12:** 原生 EventSource 处理 SSE（单用户无需自定义 header）
- **D-13:** RAF 批处理防止 token 高频渲染风暴（useRef buffer + requestAnimationFrame flush）
- **D-14:** Zustand domain-sliced stores（chat store 独立）

### Claude's Discretion
- Markdown 渲染库选择（react-markdown 或其他）
- 代码块语法高亮方案
- 具体的 Zustand store 结构设计
- 自动滚动的具体实现策略

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 设计规范
- `DESIGN.md` — Linear 风格设计系统，包含完整色彩、字体、组件、间距 token

### 后端 API
- `backend/app/api/chat.py` — 3 端点：POST /api/chat/invoke, POST /api/chat/resume, GET /api/chat/stream/{task_id}
- `backend/app/models/chat.py` — ChatRequest, TaskCreatedResponse 数据模型
- `backend/app/core/streaming.py` — SSE 事件类型定义：EVT_TOKEN, EVT_TOOL, EVT_HITL, EVT_TODO, EVT_DONE, EVT_ERROR

### 架构文档
- `ARCHITECTURE.md` — 后端架构设计，SSE 协议，数据流
- `.planning/research/ARCHITECTURE.md` — 前端架构研究（组件划分、状态管理、SSE 集成）
- `.planning/research/PITFALLS.md` — 关键陷阱（SSE 缓冲、渲染风暴、UTF-8 解析）
- `.planning/research/STACK.md` — 技术栈推荐与版本

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- 无现有前端代码（全新搭建）

### Established Patterns
- 后端 SSE 事件格式：`id: {entry_id}\nevent: {type}\ndata: {json}\n\n`
- 事件类型：token（`{text: "..."}`）、tool（`{name, status}`）、hitl（`{interrupt_value}`）、todo（`{todos: [...]}`）、done（`{message: "..."}`）、error（`{message: "..."}`）
- 后端 CORS 已配置，允许 localhost 跨域

### Integration Points
- POST `http://localhost:8001/api/chat/invoke` → 返回 `{task_id, session_id, status}`
- GET `http://localhost:8001/api/chat/stream/{task_id}?from_id=0` → SSE 事件流
- GET `http://localhost:8001/health` → 健康检查

</code_context>

<specifics>
## Specific Ideas

- Linear 设计系统（`DESIGN.md`）作为所有 UI 组件的设计规范
- AI 回复底部的 logo 标识参考 Claude 的做法（小巧、不突兀）
- 用户气泡与聊天区域背景通过 Linear 的亮度层级系统区分（`#191a1b` on `#0f1011`）

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-sse-chat-foundation*
*Context gathered: 2026-04-13*
