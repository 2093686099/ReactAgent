# Phase 10: Session Management - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

用户可以在侧边栏查看、新建、切换、删除会话；切换到某会话时加载其历史消息（文本 + 工具 pill + 锁定的 HITL 卡片）；若目标会话仍有未完成的后端 task，前端自动 reattach SSE 流继续观察产出。

**Covers:** SESS-01（列表）、SESS-02（新建）、SESS-03（切换 + SSE 生命周期）、SESS-04（删除）、CHAT-08（历史加载）

**Does NOT cover:**
- HITL 状态持久化（刷新页面后从 task meta 恢复审批上下文）→ Phase 12 RESIL-02
- SSE 断线自动重连（Last-Event-ID / from_id 续传）→ Phase 12 RESIL-01
- Todo 面板 → Phase 11
- RAG source cards → Phase 13

</domain>

<decisions>
## Implementation Decisions

### 历史消息重建（CHAT-08）
- **D-01:** 全量还原 segments — 新增后端端点 `GET /api/sessions/{session_id}/messages`，从 LangGraph checkpoint 的 messages 列表中抽取 user/assistant 文本、ToolMessage 构造为 `{type:"tool", status:"done"}` pill、历史 HITL 还原为 `{type:"hitl", status: "approved"|"rejected"|"feedback"}`（pending 只会出现在仍在 interrupted 的 task，由 D-02 处理）。
- **D-02:** 历史中的 HITL 卡片一律锁定不可交互 — 按钮 disabled，仅展示"已批准/已拒绝/已反馈"pill 收起态，避免二次审批风险。
- **D-03:** 加载历史后检测目标会话是否有 running/interrupted 的 task（查询 TaskService 按 session_id 查最近 task 状态）。若有则把该 task_id 写入 `currentTaskId` 触发 useSSE 用 `from_id=0` reattach；没有就保持 idle。Phase 10 实现 happy-path reattach（SSE stream 仍在 Redis Stream 未过期），完整 HITL 状态恢复 defer 到 Phase 12 RESIL-02。

### 会话列表展示
- **D-04:** 后端 session Redis HASH 新增 `title` 字段（string，空串默认）。`SessionService.create_session` 初始化为 `""`；首次 invoke 时若 title 为空，由 TaskService/SessionService 提取 user query 前 30 字符写回。列表空 title fallback 显示 `新会话`。
- **D-05:** 侧边栏按 `last_updated` 相对时间分组：`今天 / 昨天 / 7天内 / 更早`。组内按 last_updated 倒序。分组标题字号 12px/`text-quaternary`，会话项标题 14px/`text-secondary`，单行溢出省略。
- **D-06:** 当前活跃会话项高亮（`bg: rgba(255,255,255,0.05)` + 左侧 2px `border-left-color: #5e6ad2` 品牌色轨）。非活跃项 hover 仅背景变 `rgba(255,255,255,0.03)`。不显示会话状态图标（idle/streaming），保持极简。

### 切换会话 & SSE 生命周期
- **D-07:** 无提示直接切换 — 用户点其他会话时，不论当前是否 streaming/interrupted，立刻切换。后端 task 保留（Redis Stream 自然缓存事件至 TTL），切回原会话时由 D-03 reattach 机制恢复观察。没有确认弹窗。
- **D-08:** `useSSE` hook 依赖数组加入 `activeSessionId`。切换 session 时触发 cleanup（关闭旧 EventSource）+ 新的 effect（若新 session 有 unfinished task，用 from_id=0 连上）。sessionId + taskId 双钥保证连接准确重建。
- **D-09:** 切换会话时前端行为顺序：① 关闭当前 SSE；② 清空 `messages` / `errorMessage`；③ 更新 `activeSessionId`；④ 拉历史；⑤ 若历史尾部检测出未完成 task 则 `setCurrentTaskId` 触发 reattach。

### 新建 & 删除交互
- **D-10:** 点击"新建会话"按钮为**纯前端操作** — 仅调 `chat-store.reset()` 并生成新 `activeSessionId`（客户端 uuid）。首次 `invokeChat` 时后端在 TaskService 路径内幂等 `session_exists` 检查，不存在则 `SessionService.create_session(session_id=...)` 写 Redis。避免未使用的空会话垃圾堆积。
- **D-11:** 删除会话采用 hover 露出删除按钮（垃圾桶图标，仅当前 hover 项可见，右侧紧凑）。单击**立即**调 `DELETE /api/sessions/{id}`，用 sonner toast 显示"已删除 [title]"+"撤销"按钮，撤销超时 **8 秒**。撤销实现：前端保留已删除 session meta，点撤销时调 `POST /api/sessions`（带原 session_id）重写 Redis。超时后不做后端额外动作（已真删）。
- **D-12:** 删除当前活跃会话后自动落到列表**下一条**（按 last_updated 排序的下一项）。空列表时 reset 到"新建会话"空态（placeholder 文案 + 输入框聚焦）。
- **D-13:** 删除按钮必须用 `e.stopPropagation()` 避免冒泡触发切换。

### 前端数据层扩展
- **D-14:** 新建 `frontend/src/stores/session-store.ts`（Zustand，domain-sliced 与 chat-store 并列）— 职责：维护 `sessions: Session[]`（服务端权威数据）、`activeSessionId`、`loadSessions / switchTo / createLocal / deleteOptimistic / restoreSession`。历史消息加载后的 `messages` 写入 `chat-store` 不在 session-store 里。
- **D-15:** `activeSessionId` 迁出 chat-store — 当前在 chat-store 里，职责分离后由 session-store 持有；chat-store 只保留 messages/status/taskId。两 store 通过 subscribe 或在 page.tsx 层面组合。
- **D-16:** 切换会话时使用 `chat-store.reset({ keepSessionId: true })` 或新增 `chat-store.loadHistory(messages)` 方法注入还原的 segments，不要触发 reset 副作用生成新 id。

### 后端扩展清单（新增 + 修改）
- **D-17:** 新端点 `GET /api/sessions/{session_id}/messages` — 从 `AsyncPostgresSaver` checkpointer 读取 thread_id=session_id 的最终 state，遍历 `state["messages"]` 映射为 segments（规则详见 D-01）。响应：`{messages: Message[], active_task: {task_id, status} | null}`。
- **D-18:** `SessionService` 扩展 `title` 字段：`create_session` 接受可选 `title`；新增 `update_title(session_id, title)`。`list_sessions` 返回值包含 title。
- **D-19:** TaskService 或 chat invoke 路径：首次 invoke 时若 session.title 为空，取 query 前 30 字符（用 `len` 截断而非 tokenize）调用 `update_title`。
- **D-20:** 端点 `POST /api/sessions` 接受可选 body `{session_id?: string, title?: string}`，用于"隐式创建" + "撤销删除"两种场景。若 session_id 已存在则幂等返回现有 session。

### Claude's Discretion
- sonner toast 撤销按钮的具体样式（遵循 Linear 设计 token 即可）
- 侧边栏会话项 hover 动效（过渡时长/曲线）
- 分组标题是否 sticky
- 首次进入页面时是否自动选中最近一条会话（建议：是，若 `list_sessions` 非空）
- 历史消息加载中的骨架屏样式
- `active_task` 探测 SQL/Redis 查询细节（可通过 TaskService.get_by_session 或扫描 task:* HASH）

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 后端 Session 与 Task
- `backend/app/api/sessions.py` — 现有 CRUD 端点（list/active/create/delete），Phase 10 需新增 `GET /{id}/messages` 与修改 create
- `backend/app/services/session.py` — Redis HASH 结构与 CRUD 方法，需新增 title 字段支持
- `backend/app/services/task.py` — TaskService，首次 invoke 时写入 title + 按 session_id 查未完成 task
- `backend/app/infra/task_bus.py` — Redis Streams 事件总线与 TaskMeta HASH，reattach 时 from_id=0 重放
- `backend/app/infra/database.py` — AsyncPostgresSaver checkpointer，历史消息还原源
- `backend/app/api/chat.py` — invoke/resume/stream 端点，session_id 幂等创建逻辑注入点
- `backend/app/models/chat.py` — ChatRequest/TaskCreatedResponse 模型

### 前端现有代码
- `frontend/src/components/sidebar/sidebar.tsx` — 骨架已就位（仅"新建会话"按钮），Phase 10 填充列表
- `frontend/src/stores/chat-store.ts` — 现存 activeSessionId，Phase 10 需要拆分并新增 loadHistory
- `frontend/src/hooks/use-sse.ts` — 依赖数组需加入 sessionId，reattach 行为
- `frontend/src/lib/api.ts` — 需新增 listSessions/deleteSession/restoreSession/loadHistory/createSession
- `frontend/src/lib/types.ts` — Session 类型待新增（id, title, created_at, last_updated, status）
- `frontend/src/app/page.tsx` — 组合 session-store + chat-store + useSSE 的装配点
- `frontend/src/components/layout/app-layout.tsx` — 布局容器

### 设计与架构
- `DESIGN.md` — Linear 风格设计系统，所有侧边栏 / toast / hover 细节遵循
- `ARCHITECTURE.md` — 后端架构与 SSE 协议
- `.planning/phases/08-sse-chat-foundation/08-CONTEXT.md` — 已决策：侧边栏色 `#08090a`、dark only、Zustand domain-sliced、segments 模型
- `.planning/phases/09-tool-call-ux-hitl-approval/09-CONTEXT.md` — HITL segment 结构，tool pill 规范，Phase 10 历史还原直接沿用

### 要求与状态
- `.planning/REQUIREMENTS.md` — SESS-01..04 + CHAT-08 定义
- `.planning/ROADMAP.md` §Phase 10 — Success Criteria 权威清单
- `.planning/STATE.md` — 当前项目进度

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/app/services/session.py`：已有 Redis HASH + Set 的 user_sessions 索引，扩展 title 为新 HASH field 即可，不改动连接层
- `backend/app/infra/task_bus.py`：Redis Streams 天生支持 from_id 重放，reattach 逻辑无需新存储
- `frontend/src/components/ui/button.tsx`：新建/删除按钮直接复用 shadcn Button
- `sonner` toast（已在 page.tsx 中被 `toast.error` 调用）：撤销提示直接复用 `toast(title, { action: ... })`
- Phase 08 的 RAF 批处理（token buffer）：历史加载时一次性 `set messages`，不走 token path，自然不干扰
- Phase 09 的 HITL segment 渲染（`message-bubble.tsx` + `hitl-card.tsx`）：锁定模式只需在 HitlCard 接收 `readonly` prop 或检测 status ≠ "pending" 时隐藏按钮（09 已实现收起态）

### Established Patterns
- Zustand domain-sliced stores（chat-store 独立）→ session-store 顺延此约定
- `useSSE` hook 当前依赖 `[taskId, ...actions]`，扩展 sessionId 需谨慎处理 effect 依赖闭包（currentTaskId 变化不能导致重复 reattach）
- 后端 FastAPI Depends 注入 `get_session_service` / `get_task_service` / `get_current_user`：新端点沿用
- Linear tokens 已在 globals.css 定义：`--color-bg-deepest/panel/surface`、`--color-text-*`、`--color-border-*`，侧边栏 hover/active 态直接用 CSS var

### Integration Points
- `page.tsx` 装配层：当前把 chat-store / useSSE / useAutoScroll 组合。Phase 10 加入 session-store 订阅 + switchTo handler
- `invokeChat` 调用点：隐式创建 session 的后端逻辑必须对前端透明，前端只传 session_id
- `useSSE` hook：唯一的 SSE 入口，reattach 逻辑集中于此

</code_context>

<specifics>
## Specific Ideas

- 删除撤销窗口 **8 秒**（人类反应时间 + 发现误删的常见跨度，参考 Gmail 撤销发送默认 5-30s 范围中间值）
- 自动 title 取 user query **前 30 字符**（纯 len 截断，中英文兼容），超出加 `…`
- 分组：`今天 / 昨天 / 7 天内 / 更早`，相对时间参考基准 `last_updated`
- 活跃会话左侧 2px 品牌色轨 `#5e6ad2`（Linear 侧边栏导航的常见强调方式）
- hover 显露的删除按钮必须 `stopPropagation`，避免误触切换
- 历史 HITL 卡片：沿用 Phase 09 已有的 pill 收起态（D-08 of Phase 09），不新增组件

</specifics>

<deferred>
## Deferred Ideas

**Postponed to later phases / future work:**

- HITL 页面刷新恢复（从 task meta 还原 pending 审批）→ Phase 12 RESIL-02
- SSE 断线自动重连（Last-Event-ID / retry backoff）→ Phase 12 RESIL-01
- 会话手动改名 / 编辑 title → 未来增强，非核心
- 会话搜索 / 过滤 → 未来增强
- 批量删除 / 批量导出 → 未来增强
- 归档区（soft delete + 可恢复列表）→ 需后端 `archived` 字段，非 MVP
- 会话状态图标（streaming/interrupted 小点）→ 若用户反馈需要再加
- 键盘快捷键（Ctrl+K 切换会话）→ FUT-03
- 会话项显示消息条数 / token 统计 → 未来观测能力

</deferred>

---

*Phase: 10-session-management*
*Context gathered: 2026-04-20*
