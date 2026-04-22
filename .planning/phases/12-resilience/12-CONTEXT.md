# Phase 12: Resilience - Context

**Gathered:** 2026-04-22
**Status:** Ready for planning

<domain>
## Phase Boundary

让应用在**两类异常**下保持可用：
1. **网络波动导致 SSE 断流**（RESIL-01）—— 断开后自动重连，并从断点处续传，不丢失断线期间的事件（token/tool/hitl/todo/done）
2. **页面刷新/重新打开应用**（RESIL-02）—— 如果 Agent 仍处于 `interrupted` 等待审批，HitlCard 能从后端 task 状态恢复到可操作形态

**并入本 Phase 的 gap：**
- **G-01**（Phase 10 UAT 遗留）：approve-then-switch 场景下，切回刚 approve 过的会话时，历史 HITL card 会重新出现并显示 pending 按钮 —— 根因是 SSE `from_id=0` 重放回溯了 hitl 事件，但没有对应的 resolve 事件把状态收敛。Phase 10 明确 defer（见 10-D-03），在 RESIL-02 自然路径中一并修掉。

**Covers:** RESIL-01, RESIL-02, G-01 fix

**Does NOT cover:**
- 后端崩溃/重启后的 task 恢复（LangGraph checkpoint 已覆盖 Agent 侧，但 Redis Streams 事件落在内存流里，重启即丢 —— 不在 v2.0 范围）
- 网络切换（WiFi → 4G）导致 IP 变化时的会话迁移（浏览器 EventSource 自动重连已足够覆盖常见场景）
- 多标签页同一 session 的 SSE 竞态（v2.0 假设单标签页使用；移动端与多标签协作属于 PROJECT.md Out of Scope）
- 离线模式 / PWA（PROJECT.md 明确 Out of Scope）
- 重连过程中的用户输入队列化（断流期间用户无法发送，属于 UX 边缘，默认不做）

</domain>

<decisions>
## Implementation Decisions

### 重连机制（RESIL-01）

- **D-01:** **继续使用浏览器原生 `EventSource` + 服务端 `Last-Event-ID` header**。后端 `/api/chat/stream/{task_id}` 现已支持 `?from_id=` query 续传（`backend/app/api/chat.py:97-122`），也已在每帧 SSE 里写 `id: {redis_entry_id}`（`_format_sse` 已就绪），缺的是**读 HTTP `Last-Event-ID` header**（浏览器 reconnect 时自动发送）。在现有 endpoint 入口加 ~6 行：`Header(default=None, alias="Last-Event-ID")` 注入，当 query 缺省时用它当 `from_id`。前端 `use-sse.ts` **不需要任何改动** —— 浏览器 `EventSource` 断开会自动重连并发送 Last-Event-ID header。
- **D-01-rationale:** 保留 08-D-12（采用 EventSource）的决策，不推翻。两件事之间不做重复论证。

### G-01 修复 —— HITL resolved 信号（入本 Phase 前置依赖 RESIL-02）

- **D-02:** 后端在 `/api/chat/resume` 返回前，**向 `task:{task_id}:events` Stream XADD 一帧 `event='hitl_resolved'`**，data payload 形状：`{tool_name: str, call_id: str | null, decision: "approve" | "edit" | "reject", ts: float}`。前端 `use-sse.ts` 增加 `hitl_resolved` listener，在重放/实时路径上都把最近一条仍处于 `pending` 状态的 HitlSegment 根据 `decision` 映射为终态（v2.0：`approve→approved`，**`edit→approved`**，`reject→rejected`；`edit` 与 `approve` 在前端视觉上合流，因为 `HitlStatus` 类型只暴露两种可见终态，且 `edited_args` 刻意不随 `hitl_resolved` 下行 —— 见 `additional_constraints`；独立 `edited` 状态与 edited-args 渲染 defer 到后续版本），由 chat-store 的新 action `resolveLastPendingHitl(decision)` 完成幂等修改。
- **D-02-rationale:** 最小改动覆盖 G-01 根因 —— Phase 09 segments 模型已经把 HITL 作为消息内嵌气泡持久化在 checkpoint 里（经由 Agent 消息），一旦 resume 完成、下一条 token 流又进来，用户原本的 HitlSegment 已经有效地完成使命；缺的是"前端在 from_id=0 重放时如何判断它已经被解决过"—— 靠一帧 resolve 事件即可。此事件与 `done`、`error` 等同性质，都是生命周期信号，不污染现有事件模型。

### RESIL-02 —— 页面刷新 HITL 恢复

- **D-03:** **复用 `from_id=0` 全量重放路径**，不新增后端 endpoint。刷新页面后的恢复顺序：
  1. 侧边栏激活最近 session（Phase 10 既有）
  2. `chat-store.loadHistory(sessionId)`（Phase 10 既有）—— 同时会通过 `session-store.sessions[sid].last_task_id`（Phase 10-01 已落地）拿到该会话最后一个 task_id
  3. 若 task 状态为 `interrupted`，`session-store.setCurrentTaskId(last_task_id)` 激活 task
  4. `useSSE(taskId, sessionId)` 触发 `EventSource` → 后端从 `from_id=0` 重放全部事件
  5. 重放期间遇到 `hitl` 事件 → `addHitlSegment` 重建 HitlCard（复用 09-D-11 的 SSE 重建路径）
  6. 若期间还重放出 `hitl_resolved`（D-02）则把那条 HITL 收敛为终态 —— 解决 G-01；未解决的仍保持 pending，用户可操作
- **D-03-rationale:** Phase 10-D-03 早有"完整 HITL 状态恢复 defer 到 Phase 12 RESIL-02"的预先承诺，本 Phase 按承诺兑现。零新端点、零新数据源，全部在既有 `from_id=0` 重放管道上叠加 D-02 的信号即可自洽。前端不需要从 `task:{task_id}` HASH 单独拉 meta，重放本身就是最强的真相。
- **D-03-depends-on:** D-02 必须先落地 —— 否则重放时 pending HitlCard 会再次出现（=G-01 复发）。

### 重连 UX —— 用户可见反馈

- **D-04:** 重连期间**显示顶栏轻提示 banner**（"连接中断，正在重连…"），重连成功 300ms 后消失，仅在断开超过一次心跳（默认 5s）时出现。不阻断交互，但让用户知道发生了什么。
  - 新建组件 `frontend/src/components/layout/reconnect-banner.tsx`，挂在 chat 区域顶栏内嵌
  - `chat-store` 新增 `connectionStatus: 'connected' | 'reconnecting'` 字段（不持久化），`use-sse.ts` 的 `onerror` 里在**未进入终态**时把它置为 `reconnecting`；收到任何一帧 SSE 事件即切回 `connected`
  - 样式严格走 DESIGN.md：背景 `--color-bg-panel`、文字 `--color-text-secondary`、不使用警告色（保持 Linear 的克制）
  - 首次出现延迟（debounce 1s）避免 token 级微短抖动被放大成视觉噪音
- **D-04-rationale:** 这是用户在灰区讨论中**主动偏离 Recommended（静默重连）**做出的决策 —— 显式优先级高于实现便利性。设计上克制以兼顾 Linear 美学。

### 后端必改文件（小改面）

- **D-05:** `backend/app/api/chat.py` 的 `/api/chat/stream/{task_id}`：增加 `Last-Event-ID` header 注入；query 缺省时 fallback 到该 header；都缺才默认 `"0"`。
- **D-06:** `backend/app/api/chat.py` 的 `/api/chat/resume`：在 `TaskService.resume()` 成功返回后 XADD 一帧 `hitl_resolved`（用 `task_bus.publish(task_id, "hitl_resolved", data)` 既有 API 即可，无需造新函数）。
- **D-07:** `backend/app/services/task.py` 视需要在 resume 路径里 `build_decisions` 之前捕获 `tool_name` / `call_id`（`action_requests[0].name` / `action_requests[0].id`）传递给 publish 调用。如果放到 api 层更干净也行，由 Planner 决定最终落点（**Claude's Discretion**）。

### 前端必改文件（小改面）

- **D-08:** `frontend/src/hooks/use-sse.ts`：新增 `hitl_resolved` event listener（约 10 行）；`onerror` 细化 —— 未收到终态事件时把 status 置为 `reconnecting` 而不是直接 `setError`（保留 `setError` 为真正异常路径）。
- **D-09:** `frontend/src/stores/chat-store.ts`：新增 `connectionStatus` 字段与 `setConnectionStatus` action；新增 `resolveLastPendingHitl(decision)` action —— 找到 messages 里最近一条 `status === 'pending'` 的 HitlSegment，把它改为 `decision` 对应终态（幂等：若没有 pending HITL 则 no-op）。
- **D-10:** `frontend/src/components/layout/reconnect-banner.tsx`（新建）：消费 `chat-store.connectionStatus`；DESIGN.md token-only；debounce 1s。
- **D-11:** `frontend/src/components/chat-area/chat-area.tsx`（或同层顶栏）：把 banner 渲入顶栏，不改变既有 grid 结构。具体挂载点由 Planner 视 Phase 11 chat header 现状决定（**Claude's Discretion**）。
- **D-12:** `frontend/src/app/page.tsx`：RESIL-02 需要在 `loadHistoryAction` 的 `.then()` 里判断：若 `last_task_id` 存在且 `sessions[sid].last_task_status === 'interrupted'`，则 `setCurrentTaskId(last_task_id)` 触发 useSSE。注意：前端目前没把 last_task_status 存下来，Plan 设计时若 session-store 需要扩展则一并考虑（**Claude's Discretion —— Planner 评估是否加字段或在 loadHistory 里判断**）。

### Testing Strategy

- **D-13:** 后端新增集成测试：`tests/test_resilience.py`，覆盖
  - `Last-Event-ID header` 与 `from_id` query 的优先级：query > header > "0"
  - `resume` 后流里应出现 `hitl_resolved` 一帧，data 字段齐全
  - reattach 到 `interrupted` task 且 from_id=0 时能重放出历史 hitl + resolved（或仅 hitl）
- **D-14:** 前端 vitest：`connectionStatus` 状态机的单元测试（reconnecting ↔ connected 切换）；`resolveLastPendingHitl` 的幂等性与多 pending HITL 场景的"最近一条"语义。
- **D-15:** 人工 UAT（checkpoint）：4 个场景 —— ① 主动断网 5s 再恢复观察 banner + 续传 ② G-01 回归：approve 一条 HITL → 切会话再切回 → 不应再看到 pending 按钮 ③ 刷新页面时 HITL 待审批 → HitlCard 正确重建，按钮可点击 ④ reject 路径也走 resolve 闭环。

### Claude's Discretion

- `hitl_resolved` 事件里是否带上 `edited_args`（便于前端在已完成气泡里显示用户修改过的参数）—— 默认不带，保持事件最小化；若 Planner 在 09-D-11 消息气泡已显示 edited args 的语境下认为需要，可加
- publish 调用落在 API 层还是 `TaskService` 层（见 D-07）
- banner 是一个独立横条还是顶栏内嵌小徽标（视 Phase 08 chat header 现状，推荐横条更易看见）
- `connectionStatus` 是否也携带 `reconnectAttemptCount`（默认不加，避免过度设计）
- 是否把 `loadHistory` 返回体扩展 `last_task_status`（见 D-12）或在前端组合 session + task meta 二次判断（推荐前者，少一跳）

### Folded Todos

（`gsd-sdk query todo.match-phase 12` 未查 —— 项目尚未使用 todo.match-phase；10-UAT G-01 已明确折入本 Phase）

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 设计系统（最高优先级）
- `DESIGN.md` — Linear 风格设计 tokens：颜色、字重、间距、圆角、字体特性。Banner 样式必须走既有 tokens，不新增。

### 项目级
- `CLAUDE.md` — 工作准则（外科手术式改动、简洁优先、中文回复）
- `.planning/PROJECT.md` — v2.0 范围与 Out of Scope
- `.planning/REQUIREMENTS.md` — RESIL-01、RESIL-02 验收点
- `ARCHITECTURE.md` — 分层、SSE 事件契约、Redis Streams / TaskMeta HASH 模型、HITL 决策流

### 前序阶段遗产（必读）
- `.planning/phases/10-session-management/10-CONTEXT.md` — D-03 reattach `from_id=0`；"完整 HITL 恢复 defer 到 Phase 12 RESIL-02" 承诺
- `.planning/phases/10-session-management/10-UAT.md` — **G-01 小节**（approve-then-switch 根因分析与遗留 defer 说明）
- `.planning/phases/09-tool-call-ux-hitl-approval/09-CONTEXT.md` — D-11 SSE 重建 HitlSegment 的现有路径（Phase 12 直接复用）
- `.planning/phases/08-sse-chat-foundation/08-CONTEXT.md` — D-12 选用 EventSource 的理由（Phase 12 不推翻）；D-05 SSE 事件契约命名；Redis Streams `id: ...` 帧头约定

### 后端落点（Phase 12 需改动）
- `backend/app/api/chat.py:97-122` — `/stream/{task_id}` endpoint，Phase 12 扩展 Last-Event-ID header
- `backend/app/api/chat.py` `/resume` endpoint — Phase 12 在 resume 成功后 publish `hitl_resolved`
- `backend/app/infra/task_bus.py` — `publish(task_id, event, data)` 既有 API，可直接用于 XADD hitl_resolved；`read_events(task_id, from_id)` 已支持续传
- `backend/app/services/task.py` — `TaskService.resume()` 可能需要把 `tool_name` / `call_id` 透传给 publish 调用
- `backend/app/core/streaming.py` — 仅**读**其中 EVT_* 常量以保持事件命名一致，不修改
- `backend/tests/` — 新增 `test_resilience.py`

### 前端落点（Phase 12 需新增/改动）
- `frontend/src/hooks/use-sse.ts` — 新 `hitl_resolved` listener；`onerror` / `onopen` 写 `connectionStatus`
- `frontend/src/stores/chat-store.ts` — `connectionStatus` 字段 + `resolveLastPendingHitl` action
- `frontend/src/components/layout/reconnect-banner.tsx` — 新建
- `frontend/src/components/chat-area/` — 顶栏挂载点（具体文件由 Planner 对照 Phase 08/09 现状）
- `frontend/src/app/page.tsx` — `loadHistoryAction` 收尾时 interrupted 恢复流
- `frontend/src/stores/session-store.ts` — 视需要扩展 `last_task_status`
- `frontend/src/lib/api.ts` — 视需要扩展 `loadHistory` 返回类型

### SSE 事件契约参考
- 既有事件：`token`, `tool`, `hitl`, `todo`, `done`, `error`（Phase 08/09/11 已落地）
- 新增事件：`hitl_resolved` —— payload `{tool_name, call_id, decision, ts}`；语义"一条 HITL 已被前端或后端恢复"

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets（本 Phase 复用，不重造）

- **Redis Streams + `from_id` 续传** — `backend/app/infra/task_bus.py::read_events` 已经在持续读 stream 并把每条的 `entry_id` 交出；`/stream/{task_id}` 已把它写成 `id: {entry_id}` SSE 帧头。整套续传基础设施已经就绪，Phase 12 只补 header fallback。
- **`task_bus.publish(task_id, event, data)`** — Phase 6/7 既有 API，直接用于 XADD `hitl_resolved`，无需新函数
- **`addHitlSegment(toolName, description, taskId)`** — `chat-store.ts` 既有 action（Phase 09 D-11），`useSSE` 重放 `hitl` 事件时已经会重建 HitlCard；Phase 12 只需再配一个 `resolveLastPendingHitl` 让重放结果收敛为终态
- **`session.last_task_id`** — Phase 10-01 已经在 Redis session JSON 里维护，前端 `session-store.sessions[sid].last_task_id` 已可直接读 —— RESIL-02 的 task 激活路径无需新数据源
- **`from_id=0` 全量重放** — Phase 10 reattach 路径 + Phase 11 todo 重放都已验证幂等性，RESIL-02 直接沿用

### Established Patterns

- **SSE 事件一次一帧，严格幂等**：token 追加、tool/hitl/todo 整体覆盖或按位置累加 —— `hitl_resolved` 作为"收敛信号"符合幂等：找到最近 pending 改状态，找不到 no-op
- **Store 按 domain 切片**：connectionStatus 放 chat-store（连接服务于消息流），不新建 net-store 避免碎片化
- **Pydantic 响应模型扩展需要对应 pytest 同步更新**（Phase 10 已建立纪律）—— `hitl_resolved` 事件无 response model，但若 `loadHistory` 返回类型扩展则需同步

### Integration Points

- **后端 /stream endpoint** — Phase 12 的唯一入侵点在参数注入行数级小改
- **后端 /resume endpoint** — Phase 12 在返回响应前 publish 一帧，不改响应体
- **前端 useSSE hook** — 新增 listener + onerror 分支细化，不解构现有 listener 集合
- **前端 chat-store** — 新增两个字段/action，不影响既有 messages/todos/hitl segment 写入路径
- **前端 AppLayout** — banner 内嵌在 chat 顶栏，不需要改 grid 布局（和 Phase 11 drawer 的改法对比极其克制）

</code_context>

<specifics>
## Specific Ideas

- **G-01 并入 Phase 12 是路线 A 用户明确选择** —— 不单独做 hotfix，不再拖延；RESIL-02 的自然路径上 D-02 正好是其根因修复
- **用户对"重连 UX 可见性"做了主动偏离 Recommended 的选择**：静默重连 → 显式 banner。这不是遗漏，而是"我希望看到系统发生了什么"的设计偏好，执行层 不得 静默处理或把它压成一个看不清的小徽标
- **Phase 12 的"小"**：相比 Phase 10/11 新建目录和 store 的改面，Phase 12 绝大多数改动是"在既有管道上叠加一帧事件 + 一个字段 + 一个小组件"。这也是 Planner 应追求的形态 —— 不应演变成重构 SSE 栈或抽"网络层"
- **Last-Event-ID 是 W3C 标准**，浏览器 `EventSource` 在遇到 `readyState === 2` 自动重连时会自动发送；这是不写前端一行代码就能拿到的能力，Phase 12 的"重连机制"工程量只在后端

</specifics>

<deferred>
## Deferred Ideas

- 后端崩溃/重启后 task 恢复（Redis Streams 内存流丢失问题）—— 需要 Streams 持久化或事件溯源，工程量远超本 Phase
- WebSocket 替换 EventSource —— 08-D-12 已明确选 EventSource，不在此重议
- 多标签页同 session SSE 仲裁 —— PROJECT.md Out of Scope 的单标签页约束
- 断线期间用户输入队列化（offline queue）—— 与 PWA Out of Scope 同源
- 重连次数上限与放弃提示 —— 默认浏览器 EventSource 无限重连足够；需要时再加
- `connectionStatus` 的更精细状态机（connecting / connected / reconnecting / failed）—— 二态足够本 Phase 用户价值

### Reviewed Todos (not folded)
（本项目尚未使用 `todo.match-phase` —— 若后续启用，G-01 已按路线 A 并入本 Phase，无需再查）

</deferred>

---

*Phase: 12-resilience*
*Context gathered: 2026-04-22*
