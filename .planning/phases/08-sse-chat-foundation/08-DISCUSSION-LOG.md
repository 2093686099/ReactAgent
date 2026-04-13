# Phase 08: SSE Chat Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 08-SSE Chat Foundation
**Areas discussed:** 页面布局, 消息气泡风格, 色彩与主题, 输入区域

---

## 页面布局

| Option | Description | Selected |
|--------|-------------|----------|
| A. 先全屏聊天 | Phase 08 只有聊天区域，Phase 10 加侧边栏时重构布局 | |
| B. 预留侧边栏骨架 | Phase 08 搭好整体 layout，侧边栏先占位 | ✓ |

**User's choice:** Claude's Discretion — 用户要求由 Claude 根据计划决策
**Notes:** 选 B 的理由：layout 是全局结构，后面每个 phase 都往里填内容，早期搭好避免重构

---

## 消息气泡风格

| Option | Description | Selected |
|--------|-------------|----------|
| A. ChatGPT 风格 | AI 左对齐无背景，用户右对齐有背景 | |
| B. 双侧气泡 | 双方都有圆角气泡背景，类微信 | |
| C. Claude 风格 | AI 无气泡直接铺文本，用户有轻背景气泡 | ✓ |

**User's choice:** C — Claude 风格
**Notes:** 无头像。AI 回复底部放一个小 logo 标识（参考 Claude）

---

## 色彩与主题

| Option | Description | Selected |
|--------|-------------|----------|
| A. 浅色为主 | 白底 + 中性灰 | |
| B. 深色为主 | 深灰/黑底 | |
| C. 跟随系统 | 支持 light/dark 切换 | (initially selected) |

**User's choice:** 最终确定只做 dark mode
**Notes:** 用户找到 getdesign.md 库，选定 Linear 设计系统（`npx getdesign@latest add linear.app`）。Linear 是 dark-mode-first 设计，light mode token 不完整，因此决定只做 dark mode。

**Follow-up — 背景层级讨论：**
用户担心纯黑背景上气泡对比度不够。确认使用 Linear 的亮度层级：侧边栏 `#08090a`、聊天区 `#0f1011`、用户气泡 `#191a1b` + 边框。

---

## 输入区域

| Option | Description | Selected |
|--------|-------------|----------|
| A. Enter 发送 + Shift+Enter 换行 | 标准 AI 聊天模式 | ✓ |
| B. 按钮发送 | Enter 换行，按钮发送 | |
| C. 两者都有 | Enter 发送 + 发送按钮 | |

**User's choice:** A
**Notes:** 输入框高度自适应（多行撑开），有 placeholder 引导文案

---

## Claude's Discretion

- Markdown 渲染库选择
- 代码块语法高亮方案
- Zustand store 结构
- 自动滚动实现策略

## Deferred Ideas

None
