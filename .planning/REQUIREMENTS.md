# Requirements: Neuron AI Assistant

**Defined:** 2026-04-12
**Core Value:** 用户通过自然语言与 AI Agent 对话，Agent 自主调用工具完成任务，关键操作经人工审批后执行

## v2.0 Requirements

Requirements for Next.js 前端。Each maps to roadmap phases.

### Chat Core

- [ ] **CHAT-01**: 用户可以输入文本消息并发送给 AI Agent
- [ ] **CHAT-02**: 用户可以看到 AI 回复逐字流式输出（SSE token 事件）
- [ ] **CHAT-03**: AI 回复支持 Markdown 渲染（代码块高亮、列表、链接、表格）
- [ ] **CHAT-04**: 消息列表区分用户消息和 AI 消息（不同气泡样式）
- [ ] **CHAT-05**: 新消息到达时自动滚动到底部
- [ ] **CHAT-06**: 发送中/等待响应时显示加载状态
- [ ] **CHAT-07**: 请求失败时显示错误信息
- [ ] **CHAT-08**: 打开/切换会话时加载历史消息（需后端新增 endpoint，从 checkpoint 重���消息列表）

### Tool & HITL

- [ ] **HITL-01**: AI 消息中内嵌工具调用指示器（segments 模型，显示工具名称和 calling/done 状态）
- [ ] **HITL-02**: 收到 hitl 事件时展示审批卡片（工具名称、参数、描述）
- [ ] **HITL-03**: 用户可以 approve 工具调用
- [ ] **HITL-04**: 用户可以 reject 工具调用
- [ ] **HITL-05**: 用户可以 edit 工具参数后提交（修改 args 再 approve）
- [ ] **HITL-06**: 审批后恢复 agent 执行（POST /resume），SSE 流继续

### Session

- [ ] **SESS-01**: 侧边栏展示用户的所有会话列表
- [ ] **SESS-02**: 用户可以新建会话
- [ ] **SESS-03**: 用户可以切换会话（正确管理 SSE 连接生命周期）
- [ ] **SESS-04**: 用户可以删除会话

### Todo Panel

- [ ] **TODO-01**: 实时展示 agent 当前的 todo 列表（来自 SSE todo 事件）
- [ ] **TODO-02**: todo 项状态变化时自动更新（pending → done）

### Resilience

- [ ] **RESIL-01**: SSE 断线后自动重连（使用 from_id / Last-Event-ID 续传）
- [ ] **RESIL-02**: HITL 审批状态持久化（页面刷新后可从 task meta 恢复）

## Future Requirements

Deferred to v3.0+。Tracked but not in current roadmap.

- **FUT-01**: JWT 多用户认证

- **FUT-03**: 键盘快捷键（Enter 发送、Esc 取消等）
- **FUT-04**: 消息复制 / 重试操作

## Out of Scope

| Feature | Reason |
|---------|--------|
| 语音输入/输出 | 增加大量复杂度，个人助手文本交互足够 |
| 文件上传 | 后端未支持，defer |
| 消息分支/编辑历史 | 极高复杂度，非核心价值 |
| 移动端适配 | v2 专注桌面 Web 体验 |
| PWA / 离线模式 | 依赖实时网络连接的产品，离线无意义 |
| 多用户协作 | 个人助手场景 |
| Generative UI | 过度工程，固定组件足够 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| (populated during roadmap creation) | | |

**Coverage:**
- v2.0 requirements: 21 total
- Mapped to phases: 0
- Unmapped: 21 ⚠️

---
*Requirements defined: 2026-04-12*
*Last updated: 2026-04-12 after initial definition*
