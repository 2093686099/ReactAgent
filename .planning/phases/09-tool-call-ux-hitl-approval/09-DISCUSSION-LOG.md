# Phase 09: Tool Call UX + HITL Approval - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 09-tool-call-ux-hitl-approval
**Areas discussed:** 工具调用指示器样式, HITL 审批卡片设计, 参数编辑交互, 审批后的状态流转

---

## 工具调用指示器样式

| Option | Description | Selected |
|--------|-------------|----------|
| 内联 pill 标签 | 类似 Claude — 小圆角标签嵌在文本流中，左侧小图标 + 工具名 | ✓ |
| 折叠卡片 | 独立卡片区块，默认折叠，可展开看工具输入/输出 | |
| 纯文字行 | 一行文字"⚙️ 调用 XXX 工具..." | |

**User's choice:** 内联 pill 标签
**Notes:** 轻量且不打断阅读流

### 动画风格

| Option | Description | Selected |
|--------|-------------|----------|
| Loader2 旋转 | 复用 lucide Loader2 + animate-spin，done 时切换 Check | ✓ |
| 脉冲闪烁 | 整个 pill 背景色脉冲闪烁 | |
| 你来决定 | Claude 自行选择 | |

**User's choice:** Loader2 旋转

---

## HITL 审批卡片设计

### 卡片位置

| Option | Description | Selected |
|--------|-------------|----------|
| 嵌入消息流 | 卡片作为 AI 消息的一部分 | ✓ |
| 底部固定栏 | 替代输入框显示 | |
| 弹窗/抽屉 | modal 或右侧抽屉 | |

**User's choice:** 嵌入消息流

### 参数展示

| Option | Description | Selected |
|--------|-------------|----------|
| JSON 代码块 | 格式化 JSON 展示 | |
| 键值对表格 | 参数名和值分两列 | |
| 不展示原始参数 | 只用自然语言描述 Agent 想做什么 | ✓ |

**User's choice:** 不展示原始参数（用户反馈后修改）
**Notes:** 用户认为展示 JSON 对普通用户没意义，改为只显示自然语言描述

### 按钮排列

| Option | Description | Selected |
|--------|-------------|----------|
| 三按钮并排 | Approve + 反馈 + Reject | ✓ |
| 两按钮 + 下拉 | Approve + Reject，Edit 放下拉 | |

**User's choice:** 三按钮并排（Approve / 反馈 / Reject）

---

## 参数编辑交互

**原始方案被推翻。** 用户认为不需要 JSON 参数编辑功能，改为"反馈"——用户填写自然语言意见，发回给 Agent。

### 按钮命名

| Option | Description | Selected |
|--------|-------------|----------|
| 反馈 | 用户给 Agent 提修改建议 | ✓ |
| 修改 | 更直接 | |
| 建议 | 语气更柔和 | |

**User's choice:** 反馈
**Notes:** 点击后展开 textarea，用户填写意见后提交。后端走 reject + message 路径。

---

## 审批后的状态流转

### 卡片变化

| Option | Description | Selected |
|--------|-------------|----------|
| 收起为已完成标记 | 卡片变为一行 pill（"已批准 XXX"/"已拒绝 XXX"） | ✓ |
| 保持卡片但置灰 | 完整布局保留，按钮置灰 | |

**User's choice:** 收起为已完成标记

### SSE 恢复展示

| Option | Description | Selected |
|--------|-------------|----------|
| 同一条消息中追加 | Agent 继续输出追加到同一 assistant 消息 | ✓ |
| 新开一条消息 | 审批后的输出作为新 AI 消息 | |

**User's choice:** 继续在同一条消息中追加

---

## Claude's Discretion

- 审批卡片的具体视觉细节
- pill 收起动画
- 反馈 textarea 的 placeholder 文案
- interrupt_value 到自然语言描述的转换逻辑

## Deferred Ideas

- HITL 审批状态持久化（RESIL-02，Phase 12）
- 多工具批量审批
- 开发者模式查看原始 JSON 参数
