# Phase 09: Tool Call UX + HITL Approval - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

用户在聊天中看到工具调用状态指示器（内联 pill），收到 HITL 中断时出现审批卡片（嵌入消息流），可以 Approve / 反馈 / Reject，审批后 Agent 恢复执行并继续在同一条消息中输出。不包含会话管理（Phase 10）、Todo 面板（Phase 11）、SSE 重连（Phase 12）。

</domain>

<decisions>
## Implementation Decisions

### 工具调用指示器
- **D-01:** 内联 pill 标签 — 嵌在 AI 消息 segments 流中，小圆角标签，左侧小图标 + 工具名称。不打断阅读流。
- **D-02:** calling 状态使用 lucide Loader2 + animate-spin 旋转动画，done 状态切换为 lucide Check 图标。与 ChatInput 发送状态保持一致的视觉语言。
- **D-03:** pill 样式遵循 Linear 设计系统 — bg `rgba(255,255,255,0.05)`, border `rgba(255,255,255,0.08)`, 文字 `#8a8f98`(tertiary), 等宽字体显示工具名。

### 审批卡片
- **D-04:** 嵌入消息流 — 卡片作为 AI 消息 segments 的一部分出现，保持上下文连贯（Agent 说了什么 → 要调什么工具 → 等待审批）。
- **D-05:** 卡片只显示自然语言描述（"Agent 想调用 XX 工具做 XX 事"），不展示原始 JSON 参数。让非技术用户也能理解。
- **D-06:** 三按钮并排 — Approve（品牌色 `#5e6ad2` 填充）/ 反馈（ghost 样式）/ Reject（红色 `#ef4444` ghost 样式）。Approve 最突出，因为大多数情况用户会同意。
- **D-07:** "反馈"按钮点击后展开 textarea，用户填写修改意见（自然语言），提交后发回给 Agent。后端走 reject + message（Agent 根据反馈重新规划）。

### 审批后状态流转
- **D-08:** 审批完成后卡片收起为一行 pill 标记 — "已批准 XXX" 或 "已拒绝 XXX"，不再占用大片空间。
- **D-09:** approve 后 SSE 流恢复，新内容继续追加到同一条 assistant 消息的 segments 中。整个对话回合是一个连贯的消息（文本 + 工具调用 + 审批 + 更多文本）。
- **D-10:** approve 后恢复等待期间显示 StreamingDots（复用 Phase 08 组件），表示 Agent 正在继续执行。

### 数据模型扩展
- **D-11:** 在现有 segments 模型基础上扩展，新增 `hitl` segment 类型：`{type: "hitl", toolName: string, description: string, status: "pending" | "approved" | "rejected" | "feedback", taskId: string}`。
- **D-12:** chat-store 新增 HITL 相关 actions：`addHitlSegment`, `updateHitlStatus`。useSSE hook 监听 `hitl` 事件并分派到 store。
- **D-13:** resume API 调用封装到 `api.ts`：`resumeChat(taskId, responseType, message?)`。

### Claude's Discretion
- 审批卡片的具体视觉细节（内边距、圆角、阴影）
- pill 标记的收起动画（是否需要过渡动画）
- 反馈 textarea 的最大高度和 placeholder 文案
- hitl 事件中 interrupt_value 到自然语言描述的转换逻辑

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 后端 HITL 协议
- `backend/app/core/hitl.py` — build_decisions 函数，approve/edit/reject 决策转换逻辑
- `backend/app/models/chat.py` — ResumeRequest 数据模型（task_id, response_type, args, action_requests）
- `backend/app/core/streaming.py` — EVT_HITL 事件定义，__interrupt__ 解析逻辑
- `backend/app/api/chat.py` — POST /api/chat/resume 端点

### 前端已有基础
- `frontend/src/lib/types.ts` — Segment 联合类型（需扩展 hitl 类型）
- `frontend/src/stores/chat-store.ts` — Zustand store（需扩展 HITL actions）
- `frontend/src/hooks/use-sse.ts` — EventSource hook（已监听 tool 事件，需增加 hitl 事件处理）
- `frontend/src/components/chat/message-bubble.tsx` — segments 渲染（tool segment 当前 return null，需实现）
- `frontend/src/lib/api.ts` — API client（需增加 resume 函数）

### 设计规范
- `DESIGN.md` — Linear 风格设计系统，Phase 09 的卡片和 pill 必须遵循

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `StreamingDots` 组件：approve 后恢复等待期间复用
- shadcn `Button` 组件：审批按钮基于 variant="default"/"ghost" 构建
- shadcn `Textarea` 组件：反馈输入框复用
- lucide 图标库：Loader2、Check、X 等已安装

### Established Patterns
- Segments 数组模型：tool/text 类型已就位，扩展 hitl 类型自然融入
- RAF 批处理：token 追加机制不需要改动，HITL 事件是低频离散事件
- useSSE hook 的 addEventListener 模式：新增 hitl 事件监听器即可

### Integration Points
- `POST /api/chat/resume` — 前端需要新增调用此端点的函数
- `useSSE` hook — 需要新增 `hitl` 事件监听，当前未处理
- `message-bubble.tsx` — tool segment 渲染（`return null` → pill 组件），新增 hitl segment 渲染

</code_context>

<specifics>
## Specific Ideas

- 审批卡片的自然语言描述从 interrupt_value 中提取工具名和关键参数，组合成人话（如"Agent 想搜索附近的咖啡馆"）
- "反馈"功能走后端的 reject + message 路径（不用 edit 类型），让 Agent 自行理解用户意图并重新规划
- pill 收起状态保留在 segments 中（status 字段标记），刷新后仍可见历史审批记录

</specifics>

<deferred>
## Deferred Ideas

- HITL 审批状态持久化（RESIL-02，Phase 12）— 页面刷新后从 task meta 恢复审批状态
- 多工具批量审批（当前一次只审批一个工具调用）
- 审批卡片展开查看原始 JSON 参数的高级模式（开发者选项）

</deferred>

---

*Phase: 09-tool-call-ux-hitl-approval*
*Context gathered: 2026-04-16*
