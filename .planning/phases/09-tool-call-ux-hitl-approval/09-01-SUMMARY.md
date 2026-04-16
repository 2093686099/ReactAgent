---
phase: 09-tool-call-ux-hitl-approval
plan: 01
subsystem: frontend-hitl-data-layer
tags: [hitl, types, store, api, sse]
dependency_graph:
  requires: []
  provides: [HitlSegment, HitlStatus, addHitlSegment, updateHitlStatus, resumeChat, hitl-sse-listener]
  affects: [frontend/src/lib/types.ts, frontend/src/stores/chat-store.ts, frontend/src/lib/api.ts, frontend/src/hooks/use-sse.ts]
tech_stack:
  added: []
  patterns: [zustand-immutable-update, sse-event-listener, segment-union-extension]
key_files:
  modified:
    - frontend/src/lib/types.ts
    - frontend/src/stores/chat-store.ts
    - frontend/src/lib/api.ts
    - frontend/src/hooks/use-sse.ts
decisions:
  - "responseType 限制为 approve|reject，反馈走 reject+message（per D-07）"
  - "formatHitlDescription 只提取前两个参数值做摘要（per D-05 + T-09-02）"
metrics:
  duration: 1m58s
  completed: 2026-04-16T07:04:00Z
  tasks_completed: 2
  tasks_total: 2
  files_changed: 4
---

# Phase 09 Plan 01: HITL 数据层扩展 Summary

HITL 审批数据层完整就位：HitlSegment 类型 + store actions + resumeChat API + SSE hitl 事件监听，TypeScript 编译零错误。

## Tasks Completed

### Task 1: 扩展 types.ts + chat-store.ts + api.ts 支持 HITL 数据层

**Commit:** a6915cf

- types.ts: 新增 `HitlStatus` 类型 (`pending|approved|rejected|feedback`)，`HitlSegment` 类型 (`type:"hitl"` + toolName/description/status/taskId`)，`Segment` 联合扩展，`ChatStatus` 增加 `"interrupted"`
- chat-store.ts: 新增 `addHitlSegment` action（往最后一条 assistant 消息追加 hitl segment + 空 text segment），`updateHitlStatus` action（按 taskId 匹配更新 hitl segment 状态）
- api.ts: 新增 `resumeChat(taskId, responseType, message?)` 函数，调用 `POST /api/chat/resume`，reject 时通过 `args.message` 传递反馈

### Task 2: 扩展 useSSE hook 监听 hitl 事件

**Commit:** f84e94f

- 新增 `formatHitlDescription` 纯函数，从 interrupt_value 的 action_requests 提取工具名和前两个参数值生成自然语言描述
- useSSE hook 新增 `hitl` 事件监听器，触发 `addHitlSegment` + `setStatus("interrupted")`
- EventSource 在 hitl 事件后保持连接不关闭，resume 后继续接收事件（per D-09）

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

1. `npx tsc --noEmit` - 零错误通过
2. types.ts 包含 `HitlSegment` 和 `HitlStatus` 导出
3. chat-store.ts 包含 `addHitlSegment` 和 `updateHitlStatus` 实现
4. api.ts 包含 `resumeChat` 函数且调用 `/api/chat/resume`
5. use-sse.ts 包含 `addEventListener("hitl"` 监听
6. use-sse.ts 在 hitl 事件中调用 `setStatus("interrupted")`

## Known Stubs

None - all data paths are fully wired. UI rendering of HitlSegment deferred to Plan 02.

## Self-Check: PASSED

- All 5 files exist on disk
- Both commit hashes (a6915cf, f84e94f) found in git log
