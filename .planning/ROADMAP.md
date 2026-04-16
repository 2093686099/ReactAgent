# ReActAgents Roadmap

Progressive teaching project: build a production-grade ReAct Agent step by step.

## Milestones

- ✅ **v1.0 Core Agent Capabilities** - Phases 01-07 (shipped 2026-04-12)
- 🚧 **v2.0 Next.js 前端** - Phases 08-12 (in progress)

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

- [ ] **Phase 08: SSE Chat Foundation** - Next.js 项目脚手架 + SSE 流式聊天核心
- [ ] **Phase 09: Tool Call UX + HITL Approval** - 工具调用指示器 + 人工审批卡片
- [ ] **Phase 10: Session Management** - 会话侧边栏 + 历史消息加载
- [ ] **Phase 11: Todo Panel** - Agent 任务规划面板
- [ ] **Phase 12: Resilience** - SSE 断线重连 + HITL 状态持久化

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
**Plans:** 3 plans
Plans:
- [ ] 08-01-PLAN.md — Next.js 脚手架 + 设计系统 + 类型/Store/API/SSE hooks
- [ ] 08-02-PLAN.md — 全部 UI 组件（布局、消息气泡、输入框、Markdown 渲染）
- [ ] 08-03-PLAN.md — 页面装配连接 + 错误处理 + 端到端验证

### Phase 09: Tool Call UX + HITL Approval
**Goal**: 用户可以在聊天中看到工具调用状态，并对危险操作进行审批决策
**Depends on**: Phase 08
**Requirements**: HITL-01, HITL-02, HITL-03, HITL-04, HITL-05, HITL-06
**Success Criteria** (what must be TRUE):
  1. AI 消息气泡中内嵌工具调用指示器，显示工具名称和 calling/done 状态变化
  2. 需要审批的工具调用以卡片形式展示工具名称、参数和描述，用户可以 approve/reject
  3. 用户可以在审批前编辑工具参数，修改后提交
  4. 审批操作后 Agent 继续执行，SSE 流恢复输出新内容
**Plans:** 3 plans
Plans:
- [ ] 09-01-PLAN.md — 数据层扩展（HitlSegment 类型 + store actions + resume API + SSE hitl 监听）
- [ ] 09-02-PLAN.md — UI 组件（ToolPill 工具指示器 + HitlCard 审批卡片 + MessageBubble 更新）
- [ ] 09-03-PLAN.md — 页面连线（resume 回调 + 状态流转）+ 端到端验证
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
**Plans**: TBD
**UI hint**: yes

### Phase 11: Todo Panel
**Goal**: 用户可以实时看到 Agent 的任务规划和执行进度
**Depends on**: Phase 08
**Requirements**: TODO-01, TODO-02
**Success Criteria** (what must be TRUE):
  1. Agent 执行时，todo 列表实时出现在面板中，展示当前任务规划
  2. todo 项状态变化（pending -> done）时界面自动更新
**Plans**: TBD
**UI hint**: yes

### Phase 12: Resilience
**Goal**: 应用在网络波动和页面刷新等异常场景下保持可用
**Depends on**: Phase 09, Phase 10
**Requirements**: RESIL-01, RESIL-02
**Success Criteria** (what must be TRUE):
  1. SSE 连接断开后自动重连，并从断点续传（不丢失断线期间的事件）
  2. 页面刷新后，如果 Agent 仍在等待审批，HITL 审批卡片能恢复显示
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 08 → 09 → 10 → 11 → 12
Note: Phase 11 (Todo) depends only on Phase 08, can potentially parallel with 09/10.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-7 | v1.0 | - | Complete | 2026-04-12 |
| 8. SSE Chat Foundation | v2.0 | 0/3 | Planning done | - |
| 9. Tool Call UX + HITL | v2.0 | 0/3 | Planning done | - |
| 10. Session Management | v2.0 | 0/? | Not started | - |
| 11. Todo Panel | v2.0 | 0/? | Not started | - |
| 12. Resilience | v2.0 | 0/? | Not started | - |
