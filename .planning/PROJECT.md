# Neuron AI Assistant

## What This Is

个人 AI Agent 智能体助手，支持工具调用、子 Agent 编排、任务规划、人工审批（HITL）等能力。后端基于 FastAPI + deepagents/LangGraph，前端计划采用 Next.js 构建现代化 Web 界面。

## Core Value

用户能通过自然语言与 AI Agent 对话，Agent 自主调用工具完成任务，关键操作经人工审批后执行。

## Requirements

### Validated

- ✓ Agent 对话与工具调用 — Phase 01-03
- ✓ HITL 人工审批（approve/edit/reject）— Phase 02
- ✓ 记忆系统（短期 + 长期）— Phase 03
- ✓ API 服务化（FastAPI）— Phase 04
- ✓ 多会话管理 — Phase 05
- ✓ 异步任务执行 — Phase 06
- ✓ Deep Agent 迁移（create_deep_agent）— Phase 07
- ✓ SSE 实时事件流（替代 Celery 轮询）— 后端重构
- ✓ 多 LLM Provider 支持（modelscope/tencent/openai/qwen/ollama）— 后端重构

### Active

- [ ] Next.js 前端聊天界面（SSE 流式输出）
- [ ] HITL 工具审批卡片（approve/edit/reject）
- [ ] 会话管理（侧边栏列表，新建/切换/删除）
- [ ] Todo 面板（实时展示 agent 任务规划）
- [ ] AI 消息内嵌工具调用指示器（segments 模型）

### Out of Scope

- 多用户认证（JWT）— 当前为单用户模式，架构已预留 Depends(get_current_user) 扩展点
- 移动端适配 — v2 专注桌面 Web 体验
- Agent 自定义配置界面 — 当前通过 .env 配置

## Context

- 后端 API 已就绪并验证通过：POST /api/chat/invoke, GET /api/chat/stream/{task_id}, POST /api/chat/resume
- SSE 事件类型：token, tool, hitl, todo, done, error
- AI 消息数据模型：`segments: Array<{type: "text", content} | {type: "tool", name, status}>`，工具调用与文本在同一气泡内展示
- PostgreSQL（checkpointer + 长期记忆）+ Redis（会话管理 + 任务事件流）
- deepagents 框架自带中间件栈：TodoList → Filesystem → SubAgent → Summarization → HITL

## Constraints

- **Tech stack**: Next.js (React) 前端，对接现有 FastAPI 后端
- **Runtime**: Python 3.12 后端，Node.js 前端
- **Infra**: PostgreSQL 5432 + Redis 6379（本地部署）
- **LLM**: 当前默认 Tencent GLM-5（OpenAI 兼容接口）

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| asyncio.create_task + Redis Streams 替代 Celery | 个人助手场景不需要分布式任务队列，简化架构 | ✓ Good |
| SSE 替代轮询 | 实时性更好，减少无效请求 | ✓ Good |
| segments 模型（工具调用内嵌消息气泡） | 避免工具信息单独占一个气泡，UI 更紧凑 | — Pending |
| 单用户 + Depends(get_current_user) | 当前不需要多用户，但预留扩展点 | ✓ Good |

## Current Milestone: v2.0 Next.js 前端

**Goal:** 为 AI Agent 个人助手构建现代化 Web 前端，对接已完成的 FastAPI 后端

**Target features:**
- 聊天界面 — SSE 实时流式输出
- HITL 工具审批 — approve/edit/reject 审批卡片
- 会话管理 — 侧边栏列表，新建/切换/删除
- Todo 面板 — 实时展示 agent 任务规划

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-12 after milestone v2.0 initialization*
