# Phase 10: Session Management - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 10-session-management
**Areas discussed:** 历史消息重建, 会话列表展示, 切换 & SSE 生命周期, 新建 & 删除交互

---

## 灰色地带选择

| Option | Description | Selected |
|--------|-------------|----------|
| 历史消息重建 | CHAT-08 新后端端点，重建粒度 | ✓ |
| 会话列表展示 | 后端 session 无 title 字段 — 显示 id / 自动标题 / 后端加 title 字段 | ✓ |
| 切换会话 & SSE 生命周期 | 当前会话 streaming 中切走的处理，连接清理策略 | ✓ |
| 新建 & 删除交互 | 新建时机、删除确认、删除活跃会话后的落点、空态 | ✓ |

---

## 历史消息重建

### 重建粒度

| Option | Description | Selected |
|--------|-------------|----------|
| 全量还原 segments | 文本 + tool pill(done) + 锁定历史 HITL 卡片 | ✓ |
| 仅文本 | user/assistant 文本，tool/HITL 省略 | |
| 文本 + tool pill（无 HITL） | 中间方案 | |

**User's choice:** 全量还原 segments（Recommended）
**Notes:** 与实时流 UI 一致，历史审批决策保留，不丢失上下文。HITL 卡片锁定不可交互，避免二次审批风险。

### 未完成 task 处理

| Option | Description | Selected |
|--------|-------------|----------|
| 展示历史 + 重新订阅 SSE | 检测 unfinished task，from_id=0 reattach | ✓ |
| 仅展示历史快照 | 不重新订阅，需手动发新消息 | |
| defer 到 Phase 12 | Phase 10 历史仅展示已完成会话 | |

**User's choice:** 展示历史 + 重新订阅 SSE（Recommended）
**Notes:** Phase 10 实现 happy-path reattach，完整 HITL 状态恢复 defer 到 RESIL-02。

---

## 会话列表展示

### 标题来源

| Option | Description | Selected |
|--------|-------------|----------|
| 后端新增 title + 首条 user 消息自动生成 | Redis hash 加字段，TaskService 首次 invoke 填充 | ✓ |
| 前端从历史消息推出 title | 需 N+1 查询或 batch preview | |
| 仅 session_id 前缀 + 相对时间 | MVP 最小改动 | |

**User's choice:** 后端新增 title + 首条 user 消息自动生成（Recommended）
**Notes:** 前 30 字符截断，为将来支持手动改名预留扩展点。

### 信息密度

| Option | Description | Selected |
|--------|-------------|----------|
| 分组按相对时间 | 今天 / 昨天 / 7天内 / 更早 + 高亮活跃项 | ✓ |
| 极简平铺列表 | 不分组，hover 显示时间 | |
| 分组 + 会话状态标识 | 加 streaming 小圆点 | |

**User's choice:** 分组按相对时间（Recommended）
**Notes:** 保持 Linear 极简美学，无状态图标。

---

## 切换会话 & SSE 生命周期

### 切换时机处理

| Option | Description | Selected |
|--------|-------------|----------|
| 无提示直接切 + 后台 task 保留 | SSE 断开，后端 task 继续跑，切回自动 reattach | ✓ |
| 弹窗确认 | 阻止误操作，但频繁打断 | |
| 禁用会话列表直到 done | 最安全但体验差 | |

**User's choice:** 无提示直接切 + 后台 task 保留（Recommended）
**Notes:** Redis Stream TTL 内切回可无损恢复，符合后端异步架构优势。

### SSE hook 调整

| Option | Description | Selected |
|--------|-------------|----------|
| sessionId + taskId 双钥控制 | useSSE 依赖数组加 activeSessionId | ✓ |
| store 统一管理 eventSource | 连接实例提升到 store | |
| hook 仅订阅 currentTaskId | 切会话时 reset taskId 自然卸载 | |

**User's choice:** sessionId + taskId 双钥控制（Recommended）
**Notes:** 结合 from_id=0 实现切回恢复流。

---

## 新建 & 删除交互

### 新建时机

| Option | Description | Selected |
|--------|-------------|----------|
| 首次发消息时隐式创建 | 点"新建"仅前端 reset + 生成 uuid，首次 invoke 后端写 Redis | ✓ |
| 立即 POST /api/sessions | 点"新建"即创建远端记录 | |
| 点击不创建 + 空态等输入 | 仅 reset UI | |

**User's choice:** 首次发消息时隐式创建（Recommended）
**Notes:** 避免空会话垃圾，与当前前端行为兼容。

### 删除交互

| Option | Description | Selected |
|--------|-------------|----------|
| hover 删除按钮 + 点完即执行 + toast 8秒撤销 | 无二次确认弹窗，sonner toast 撤销 | ✓ |
| 弹窗二次确认 | Linear 风格更多是确认 destructive | |
| 软删除隐藏 + 已删除区 (未来恢复) | defer 需后端 archived 字段 | |

**User's choice:** hover + toast 撤销（Recommended）
**Notes:** sonner 已引入，撤销调 POST /api/sessions 携带原 session_id 幂等重建。

### 删除活跃会话后落点

| Option | Description | Selected |
|--------|-------------|----------|
| 落到列表下一条，空列表回空态 | 自动选中下一条并加载历史 | ✓ |
| 始终回空态 | 简单但每次删除都要看空屏 | |
| 弹窗让用户选 | 过重 | |

**User's choice:** 落到下一条，空列表回空态（Recommended）

---

## Claude's Discretion

- sonner toast 撤销按钮的具体样式
- 侧边栏 hover 动效（过渡时长/曲线）
- 分组标题是否 sticky
- 首次进入是否自动选中最近会话（建议：是）
- 历史加载骨架屏样式
- `active_task` 探测的 SQL/Redis 查询细节

## Deferred Ideas

- HITL 刷新恢复 → Phase 12 RESIL-02
- SSE 自动重连 → Phase 12 RESIL-01
- 手动改 title、会话搜索、批量操作、归档区、状态图标、键盘快捷键、token 统计
