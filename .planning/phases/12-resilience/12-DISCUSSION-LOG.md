# Phase 12: Resilience - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-22
**Phase:** 12-resilience
**Areas discussed:** 重连机制, G-01 修复信号, RESIL-02 恢复路径, 重连 UX
**Route:** 路线 A（G-01 gap 并入 Phase 12，不单独 hotfix）

---

## 重连机制（RESIL-01）

### Q: SSE 断线后如何自动重连并续传？

| Option | Description | Selected |
|--------|-------------|----------|
| EventSource + Last-Event-ID header（后端读 header） | 浏览器原生能力；后端加 ~6 行读 header；前端零改动；W3C 标准语义 | ✓ |
| 切换到 WebSocket + 自定义重连 | 工程量大；08-D-12 已经明确选 EventSource | |
| fetch + ReadableStream 手动实现 | 更多控制，但要自己写指数回退 + 状态机，复杂度不值 | |

**User's choice:** EventSource + Last-Event-ID header（Recommended）
**Notes:** 与 08-D-12 兼容；前端无需任何改动，纯后端 header 注入

---

## G-01 修复信号

### Q: 如何让前端在 from_id=0 重放时知道一条 HITL 已经被 resolve，避免 pending 按钮复活？

| Option | Description | Selected |
|--------|-------------|----------|
| Stream 里 XADD hitl_resolved 事件 | 在 /resume 完成后向事件流追加一帧；前端 listener 把最近 pending HITL 映射为终态；幂等；小改面 | ✓ |
| task:{task_id} HASH 里记录 resolved 清单 | 前端读 HASH 判断；但这意味着重放时要额外拉一次 HTTP，打破"重放即真相"的简单模型 | |
| 后端在重放时过滤掉已 resolve 的 hitl 事件 | 要在 read_events 里做状态推断，污染 task_bus 层语义 | |
| checkpoint 里写 resolution 状态 | 改动面大，需要经由 LangGraph state；非必要 | |

**User's choice:** XADD hitl_resolved 事件（Recommended）
**Notes:** 与现有"一次一帧，严格幂等"事件契约同构，最小侵入

---

## RESIL-02 恢复路径

### Q: 页面刷新后，如何让 HitlCard 从后端状态恢复？

| Option | Description | Selected |
|--------|-------------|----------|
| 复用 from_id=0 全量重放 | 依赖 Phase 10 reattach 机制 + D-02 的 resolved 信号；零新端点；消费面只是既有 addHitlSegment | ✓ |
| 新增 GET /tasks/{id}/hitl-state endpoint | 单点查询更"干净"，但多一跳网络，且要定义新响应模型 | |
| checkpoint snapshot endpoint | 完整快照最强，但工程量巨大，超出本 Phase 范围 | |

**User's choice:** 复用 from_id=0 全量重放（Recommended）
**Notes:** 必须配合 D-02 才能闭环 G-01；优雅在于没有任何新数据源

---

## 重连 UX

### Q: 重连期间给用户什么反馈？

| Option | Description | Selected |
|--------|-------------|----------|
| 完全静默（用户无感） | 浏览器原生重连足够快；避免打扰；符合 Linear 克制美学 | (Recommended) |
| 顶栏轻提示 banner | "连接中断，正在重连…"横条；debounce 1s；重连成功 300ms 消失 | ✓ |
| 模态框 / 阻断式提示 | 太重，打断用户心流 | |
| 仅状态图标（右上角小点） | 克制但可能太微，用户注意不到 | |

**User's choice:** 顶栏轻提示 banner（**主动偏离 Recommended**）
**Notes:** 用户明确表示希望看到系统发生了什么；设计上以 Linear token 约束保持克制，不使用警告色

---

## 收尾

### Q: 以上四项够写 CONTEXT.md 了吗？

**User's choice:** 够（4 个灰区一并回答后直接进入 context 写作；Auto 模式无需再次确认）
**Notes:** —

---

## Claude's Discretion

- publish 调用落在 API 层还是 TaskService 层（D-07）
- `hitl_resolved` 事件是否携带 edited_args（默认不携带）
- banner 组件形态：独立横条 vs 顶栏内嵌小徽标（推荐横条）
- `connectionStatus` 是否附加 reconnectAttemptCount（默认不加）
- `loadHistory` 返回体是否扩展 `last_task_status`（推荐扩展，少一跳）
- reconnect-banner 具体挂载点由 Planner 对照 Phase 08/09 chat header 现状决定

## Deferred Ideas

- 后端崩溃后的 task 恢复（Redis Streams 持久化）
- WebSocket 替代 EventSource（08-D-12 已拒）
- 多标签页同 session SSE 仲裁（PROJECT.md Out of Scope）
- 断线期间用户输入 offline queue
- 重连次数上限与放弃提示
- connectionStatus 四态/更精细状态机
