# ReActAgents Roadmap

Progressive teaching project: build a production-grade ReAct Agent step by step.

## Milestones

- ✅ **v1.0 Core Agent Capabilities** - Phases 01-07 (shipped 2026-04-12)
- 🚧 **v2.0 Next.js 前端** - Phases 08-13 (in progress)

## Phases

<details>
<summary>✅ v1.0 Core Agent Capabilities (Phases 01-07) - SHIPPED 2026-04-12</summary>

| Phase | Description | Status | Depends on |
|-------|-------------|--------|------------|
| 01 | 基础 Agent + MCP | Done | — |
| 02 | +人工审查 (HITL) | Done | 01 |
| 03 | +记忆系统 | Done | 02 |
| 04 | +API 服务化 | Done | 03 |
| 05 | +多会话管理 | Done | 04 |
| 06 | +异步任务 (Celery) | Done | 05 |
| 07 | Deep Agent 迁移 + 后端重构 | Done | 06 |

</details>

### 🚧 v2.0 Next.js 前端 (In Progress)

**Milestone Goal:** 为 AI Agent 个人助手构建现代化 Web 前端，对接已完成的 FastAPI 后端

- [x] **Phase 08: SSE Chat Foundation** - Next.js 项目脚手架 + SSE 流式聊天核心 (completed 2026-04-13)
- [x] **Phase 09: Tool Call UX + HITL Approval** - 工具调用指示器 + 人工审批卡片 (completed 2026-04-16)
- [x] **Phase 10: Session Management** - 会话侧边栏 + 历史消息加载 (completed 2026-04-21, UAT 8/8, G-01 defer)
- [x] **Phase 11: Todo Panel** - Agent 任务规划面板 (completed 2026-04-22)
- [x] **Phase 12: Resilience** - SSE 断线重连 + HITL 状态持久化 (completed 2026-04-22)
- [ ] **Phase 13: RAG Source Panel + Observability** - 工具 artifact 透传到前端引用卡片 + 调用链可观测

## Phase Details

### Phase 08: SSE Chat Foundation
**Goal**: 用户可以通过 Web 界面与 AI Agent 进行流式对话
**Depends on**: Phase 07 (后端 API 已就绪)
**Requirements**: CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05, CHAT-06, CHAT-07
**Success Criteria** (what must be TRUE):
  1. 用户在输入框输入消息并发送后，AI 回复逐字流式出现在聊天区域
  2. AI 回复中的 Markdown（代码块、列表、表格、链接）正确渲染并有语法高亮
  3. 用户消息和 AI 消息有明确的视觉区分（不同气泡样式/对齐方式）
  4. 新消息到达时聊天区域自动滚动到底部，发送中显示加载状态
  5. 请求失败时用户看到错误信息提示
**Plans:** 3/3 plans complete
Plans:
- [x] 08-01-PLAN.md — Next.js 脚手架 + 设计系统 + 类型/Store/API/SSE hooks (completed 2026-04-13)
- [x] 08-02-PLAN.md — 全部 UI 组件（布局、消息气泡、输入框、Markdown 渲染） (completed 2026-04-13)
- [x] 08-03-PLAN.md — 页面装配连接 + 错误处理 + 端到端验证 (completed 2026-04-13)

### Phase 09: Tool Call UX + HITL Approval
**Goal**: 用户可以在聊天中看到工具调用状态，并对危险操作进行审批决策
**Depends on**: Phase 08
**Requirements**: HITL-01, HITL-02, HITL-03, HITL-04, HITL-05, HITL-06
**Success Criteria** (what must be TRUE):
  1. AI 消息气泡中内嵌工具调用指示器，显示工具名称和 calling/done 状态变化
  2. 需要审批的工具调用以卡片形式展示工具名称、参数和描述，用户可以 approve/reject
  3. 用户可以在审批前编辑工具参数，修改后提交
  4. 审批操作后 Agent 继续执行，SSE 流恢复输出新内容
**Plans:** 3/3 plans complete
Plans:
- [x] 09-01-PLAN.md — 数据层扩展（HitlSegment 类型 + store actions + resume API + SSE hitl 监听）
- [x] 09-02-PLAN.md — UI 组件（ToolPill 工具指示器 + HitlCard 审批卡片 + MessageBubble 更新）
- [x] 09-03-PLAN.md — 页面连线（resume 回调 + 状态流转）+ 端到端验证
**UI hint**: yes

### Phase 10: Session Management
**Goal**: 用户可以管理多个对话会话，切换时正确加载历史并管理连接
**Depends on**: Phase 09
**Requirements**: SESS-01, SESS-02, SESS-03, SESS-04, CHAT-08
**Success Criteria** (what must be TRUE):
  1. 侧边栏展示用户所有会话列表，用户可以新建会话
  2. 用户可以点击切换到不同会话，历史消息正确加载显示
  3. 切换会话时旧的 SSE 连接正确关闭，不出现连接泄漏
  4. 用户可以删除不需要的会话
**Plans:** 4/4 plans complete (UAT 8/8, G-01 defer → Phase 11/hotfix)
Plans:
- [x] 10-01-PLAN.md — 后端基础层：history + session/task 扩展 + sessions API + pytest 全绿（Wave 0，autonomous） (completed 2026-04-21)
- [x] 10-02-PLAN.md — 前端 vitest 最小引入 + time-group 纯函数 + 单元测试（Wave 0，autonomous，与 10-01 并行） (completed 2026-04-21)
- [x] 10-03-PLAN.md — 前端数据层：types/api/session-store/chat-store.loadHistory/useSSE 双参数（Wave 1，autonomous，depends_on 10-01） (completed 2026-04-21)
- [x] 10-04-PLAN.md — Sidebar 组件 + page.tsx 组合 + Success Criteria 1-4 手验（Wave 2，autonomous=false，depends_on 10-02 + 10-03） (completed 2026-04-21)
**UI hint**: yes

### Phase 11: Todo Panel
**Goal**: 用户可以实时看到 Agent 的任务规划和执行进度
**Depends on**: Phase 08
**Requirements**: TODO-01, TODO-02
**Success Criteria** (what must be TRUE):
  1. Agent 执行时，todo 列表实时出现在面板中，展示当前任务规划
  2. todo 项状态变化（pending -> done）时界面自动更新
**Plans:** 5/5 plans complete
Plans:
- [x] 11-01-PLAN.md — Wave 0 后端 fixture 扩展（make_checkpoint_tuple 加 todos 参数） (completed 2026-04-22)
- [x] 11-02-PLAN.md — Wave 1 后端契约：history.py 透出 todos + TodoModel + 2 新测试 + 3 既有断言补齐 + CONTEXT.md D-08 token 更正 (completed 2026-04-22)
- [x] 11-03-PLAN.md — Wave 2 前端数据层：types + chat-store.todos + ui-store(persist) + use-sse todo listener + page.tsx 4 处 loadHistoryAction 迁移 + 4 个 store 单测 (completed 2026-04-22)
- [x] 11-04-PLAN.md — Wave 3 前端 UI 贴皮：4 个 todo 组件 + AppLayout 条件式 grid + rehydrate + chat-area header toggle 按钮 + globals.css @keyframes todoEnter (completed 2026-04-22)
- [x] 11-05-PLAN.md — Wave 3 人工 UAT：auto-open / 切会话 / 删会话 / reattach / DESIGN token 视觉走查（checkpoint，autonomous=false） (completed 2026-04-22)
**UI hint**: yes

### Phase 12: Resilience
**Goal**: 应用在网络波动和页面刷新等异常场景下保持可用
**Depends on**: Phase 09, Phase 10
**Requirements**: RESIL-01, RESIL-02
**Success Criteria** (what must be TRUE):
  1. SSE 连接断开后自动重连，并从断点续传（不丢失断线期间的事件）
  2. 页面刷新后，如果 Agent 仍在等待审批，HITL 审批卡片能恢复显示
**Plans:** 3/3 plans complete (Wave 1 backend / Wave 2 frontend / Wave 3 UAT；G-01 approve-then-switch 修复并入 RESIL-02 自然路径)
Plans:
- [x] 12-01-backend-PLAN.md — Wave 1 后端：/stream 读 Last-Event-ID header + /resume 后 publish hitl_resolved + tests/test_resilience.py（autonomous=true） (completed 2026-04-22)
- [x] 12-02-frontend-PLAN.md — Wave 2 前端：chat-store connectionStatus + resolveLastPendingHitl + use-sse hitl_resolved listener + reconnect-banner 组件 + chat-area 挂载 + 2 vitest 文件（autonomous=true，depends_on 12-01） (completed 2026-04-22)
- [x] 12-03-uat-PLAN.md — Wave 3 人工 UAT：断网重连 / G-01 回归 / 刷新恢复 HITL / reject 闭环 4 场景 + 12-UAT.md（autonomous=false，depends_on 12-01 + 12-02） (completed 2026-04-22)
**UI hint**: yes

### Phase 13: RAG Source Panel + Observability
**Goal**: 用户在 Agent 调用 RAG 知识库时能看到清晰的引用来源，系统侧能观测到 RAG 工具调用的路由分布与错误分布
**Depends on**: Phase 09 (Tool Call UX / SSE artifact infra)
**Requirements**: RAG-01, RAG-02, RAG-03, RAG-04, RAG-05
**Success Criteria** (what must be TRUE):
  1. AI 回复中使用 query_knowledge_base 工具时，UI 在回答下方展示最多 3 条来源卡片（源文件名 + 类别 + 180 字 snippet）
  2. ToolMessage.artifact 经由 SSE 事件透传到前端，前端不再二次请求 RAG 服务即可渲染来源
  3. 工具返回 KB_ERROR / KB_EMPTY 时，前端有明确区别于正常回答的视觉提示（而不是让用户误以为这就是答案）
  4. 后端结构化记录每次 query_knowledge_base 调用的 route 路径、error_type、document_count，可通过日志查询统计 web_search fallback 比例
  5. 切换会话或刷新页面后，历史消息中的来源卡片仍能从 checkpoint 重建并保留显示
**Plans**: TBD（context gathered; awaiting `/gsd-plan-phase 13`）
**UI hint**: yes
**Design decisions**: see `.planning/notes/tool-artifact-consumption-decisions.md`（B-lite vs B-full vs C 的取舍）

## Progress

**Execution Order:**
Phases execute in numeric order: 08 → 09 → 10 → 11 → 12 → 13
Note: Phase 11 (Todo) depends only on Phase 08, can potentially parallel with 09/10.
Note: Phase 13 depends only on Phase 09 (Tool Call UX), can run parallel with 10/11/12 if prioritized.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-7 | v1.0 | - | Complete | 2026-04-12 |
| 8. SSE Chat Foundation | v2.0 | 3/3 | Complete | 2026-04-13 |
| 9. Tool Call UX + HITL | v2.0 | 3/3 | Complete | 2026-04-16 |
| 10. Session Management | v2.0 | 4/4 | Complete | 2026-04-21 |
| 11. Todo Panel | v2.0 | 5/5 | Complete | 2026-04-22 |
| 12. Resilience | v2.0 | 3/3 | Complete | 2026-04-22 |
| 13. RAG Source Panel + Observability | v2.0 | 0/? | Context gathered | - |
