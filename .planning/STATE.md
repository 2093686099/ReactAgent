---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Next.js 前端
status: planning
stopped_at: Phase 13 context gathered — CONTEXT.md 完成
last_updated: "2026-04-22T12:00:00.000Z"
last_activity: 2026-04-22
progress:
  total_phases: 6
  completed_phases: 5
  total_plans: 18
  completed_plans: 18
  percent: 83
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-12)

**Core value:** 用户通过自然语言与 AI Agent 对话，Agent 自主调用工具完成任务，关键操作经人工审批后执行
**Current focus:** Phase 13 — RAG Source Panel + Observability

## Current Position

Phase: 13 (RAG Source Panel + Observability) — CONTEXT GATHERED
Plan: 0 of ?
CONTEXT.md: `.planning/phases/13-rag-source-panel-observability/13-CONTEXT.md`（2026-04-22）
Plans: 0/? — 待 `/gsd-plan-phase 13`
Status: Ready to plan
Last activity: 2026-04-22

Progress: [████████░░] 83%

**Next phase:** `/gsd-plan-phase 13` 把 CONTEXT.md 的 D-01～D-07 拆成可执行 plan（建议 4 个 wave：后端 middleware artifact+source event+observability logger / 前端 types+store+SSE listener / `<SourceCards>` 组件+MessageBubble 挂接 / `/messages` checkpoint 重建+E2E UAT）。

## Performance Metrics

**Velocity:**

- Total plans completed: 18
- Average duration: -
- Total execution time: -

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 08 | 3 | - | - |
| Phase 09 | 3 | - | - |
| Phase 10 | 4 | - | - |
| Phase 11 | 5 | - | - |
| Phase 12 | 3 | - | - |

**Recent Trend:**

- Last 5 plans: 11-04, 11-05, 12-01, 12-02, 12-03
- Trend: stable

*Updated after each plan completion*
| Phase 11 P04 | - | - | - |
| Phase 11 P05 | - | - | - |
| Phase 12 P01 | - | - | - |
| Phase 12 P02 | - | - | - |
| Phase 12 P03 | - | - | - |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v2.0 Roadmap]: fetch + ReadableStream for SSE (not EventSource), per research
- [v2.0 Roadmap]: segments model for tool call indicators inline in AI message bubbles
- [v2.0 Roadmap]: CHAT-08 (history loading) placed in Phase 10 with session management (needs backend endpoint)
- [Phase 09]: HitlCard 回调 props 为可选，Plan 03 连线时传入实际 handler
- [Phase 09]: pending HITL 时隐藏 Sparkles 完成图标，表示消息未完结
- [Phase 09]: feedback 走 reject + message 路径，SSE 连接复用无需重建 EventSource
- [Phase 10-01]: session JSON 加 last_task_id 字段作为反向索引（方案 B），避免新建独立 session_tasks:* key
- [Phase 10-01]: 历史 HITL 降级为两态（text + tool pill），ToolMessage reject 前缀映射 rejected（P-01）
- [Phase 10-01]: 跨用户访问 GET /api/sessions/{id}/messages 返回 404 且 detail 脱敏（T-10-01）
- [Phase 10-01]: TaskService 接管 session 隐式创建 + title 回填，API 层仅做用户活动 touch
- [Phase 11]: Zustand persist 首次落地（ui-store），key neuron-assistant:ui-store:v1 + skipHydration + partialize={todoDrawerOpen}；hasAutoOpenedFor 仅内存
- [Phase 11]: SSE-only auto-open 红线 — autoOpenDrawer 仅由 use-sse todo listener 触发，loadHistory 路径永不自动弹
- [Phase 11]: setTodos 整体覆盖语义（无 merge/concat），保证 SSE reattach from_id=0 重放幂等
- [Phase 11-INFRA]: dev 脚本移除 --turbopack（macOS 中文带空格路径 ENOENT race），build 保留 --turbopack
- [Phase 12]: 路线 A — G-01（approve-then-switch HITL 复活）gap 并入 Phase 12 RESIL-02 自然路径，不再单独 hotfix
- [Phase 12-D-01]: 继续使用 EventSource + Last-Event-ID header 重连（沿用 08-D-12），后端 /stream 加 header 注入，前端零改动
- [Phase 12-D-02]: /resume 后 XADD `hitl_resolved` 事件（tool_name/call_id/decision/ts），前端 resolveLastPendingHitl 幂等收敛
- [Phase 12-D-03]: RESIL-02 复用 from_id=0 全量重放，零新端点；依赖 D-02 的 resolved 信号闭环 G-01
- [Phase 12-D-04]: 重连 UX 采用顶栏轻提示 banner（用户主动偏离 Recommended 的静默方案，强调可见性）
- [Phase 13-D-01]: artifact 走新 SSE `source` 事件，不扩展 `tool:done`（避免污染 Phase 09 ToolPill 契约）
- [Phase 13-D-02]: 前端新增 inline `SourcesSegment` 扩展 Segment union；不走 message.sources sidecar（复用 segments 契约，自然支持多次 KB 调用顺序）
- [Phase 13-D-03]: 历史持久化走 `/api/sessions/{id}/messages` + LangGraph checkpoint 重建 `SourcesSegment`；SSE-replay-only 会违反 Phase 10/11/12 "会话切换保留上下文" 红线
- [Phase 13-D-04]: KB_OK/KB_EMPTY/KB_ERROR 用同一 `<SourceCards>` 组件 variant 三态；不走 pill 变体、不让 agent text 自说（UI 层保一致性）
- [Phase 13-D-05]: route/fallback 对用户静默，只走结构化日志；用户无 actionable、仅 owner 关心
- [Phase 13-D-06]: observability sink = Python `logger.info` + `extra={}`；不新建 JSONL / Redis Stream

### Pending Todos

None yet.

### Blockers/Concerns

- None currently. Next step is planning Phase 13.

## Session Continuity

Last session: 2026-04-22
Stopped at: Phase 13 context gathered — CONTEXT.md 完成
Resume file: `.planning/phases/13-rag-source-panel-observability/13-CONTEXT.md`

**Completed Phase:** 12 (resilience) — 3/3 plans + UAT — 2026-04-22
**In Progress:** Phase 13 (RAG Source Panel + Observability) — discuss-phase 完成，待 `/gsd-plan-phase 13`

**Planned Phase:** 13 (RAG Source Panel + Observability) — context gathered，待 `/gsd-plan-phase 13`
