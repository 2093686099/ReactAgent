---
phase: 09-tool-call-ux-hitl-approval
plan: 02
subsystem: frontend-hitl-ui
tags: [hitl, react, tool-pill, approval-card, segments, lucide]
dependency_graph:
  requires:
    - phase: 09-01
      provides: HitlSegment/ToolSegment types, addHitlSegment/updateHitlStatus store actions, resumeChat API
  provides:
    - ToolPill inline indicator component (calling spin + done check)
    - HitlCard approval card component (pending card + resolved pill)
    - MessageBubble rendering for tool/hitl/text segment types
  affects: [09-03-page-wiring, message-list, chat-area]
tech_stack:
  added: []
  patterns: [segment-type-switch-rendering, optional-callback-props, memo-pending-hitl-bypass]
key_files:
  created:
    - frontend/src/components/chat/tool-pill.tsx
    - frontend/src/components/chat/hitl-card.tsx
  modified:
    - frontend/src/components/chat/message-bubble.tsx
key-decisions:
  - "HitlCard 回调 props 为可选，Plan 03 连线时传入实际 handler"
  - "pending HITL 时隐藏 Sparkles 完成图标，表示消息未完结"
patterns-established:
  - "Segment type switch: segments.map 中按 type 分发到 ToolPill/HitlCard/TextSegment"
  - "Optional callback props: MessageBubble 接受可选回调，默认 noop，由父组件按需传入"
requirements-completed: [HITL-01, HITL-02, HITL-03, HITL-04, HITL-05]
metrics:
  duration: 2m53s
  completed: 2026-04-16T07:10:45Z
  tasks_completed: 2
  tasks_total: 2
  files_changed: 3
---

# Phase 09 Plan 02: Tool Call UX + HITL Approval Card Summary

**ToolPill 内联工具指示器（calling 旋转/done 勾选）+ HitlCard 审批卡片（三按钮+反馈 textarea+resolved pill）+ MessageBubble 多 segment 类型渲染**

## Performance

- **Duration:** 2m53s
- **Started:** 2026-04-16T07:07:52Z
- **Completed:** 2026-04-16T07:10:45Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- ToolPill 组件：calling 状态 Loader2 旋转动画，done 状态 Check 图标，mono 字体工具名
- HitlCard 组件：pending 态审批卡片（Shield 图标 + 描述 + 批准/反馈/拒绝三按钮 + 反馈 textarea 展开），resolved 态收起为 pill
- MessageBubble 更新：segments.map 按 type 分发渲染 text/tool/hitl，可选回调 props，pending HITL 时隐藏 Sparkles

## Task Commits

Each task was committed atomically:

1. **Task 1: 创建 ToolPill 工具调用内联指示器组件** - `a00b4d1` (feat)
2. **Task 2: 创建 HitlCard 审批卡片组件 + 更新 MessageBubble** - `c384443` (feat)

## Files Created/Modified
- `frontend/src/components/chat/tool-pill.tsx` - 工具调用内联 pill，calling spin + done check
- `frontend/src/components/chat/hitl-card.tsx` - HITL 审批卡片，pending 态三按钮 + 反馈 textarea，resolved 态 pill
- `frontend/src/components/chat/message-bubble.tsx` - 更新 segments 渲染逻辑，支持 tool/hitl 类型 + 可选回调 props

## Decisions Made
- HitlCard 回调 props（onApprove/onReject/onFeedback）在 MessageBubble 中为可选参数，Plan 03 连线时由 chat-area 传入实际 handler
- pending HITL segment 存在时隐藏 Sparkles 完成图标，表示 assistant 消息尚未完结
- memo 比较函数：pending HITL 状态下强制 re-render，确保回调 props 变化被响应

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

1. `npx tsc --noEmit` - 零错误通过
2. tool-pill.tsx 包含 `Loader2` 和 `Check` 图标导入
3. tool-pill.tsx 包含 `animate-spin` 类名
4. hitl-card.tsx 包含 `<Button` 和 `<Textarea` shadcn 组件
5. hitl-card.tsx 包含 "批准"、"反馈"、"拒绝" 文字
6. hitl-card.tsx pending 态渲染卡片，resolved 态渲染 pill
7. message-bubble.tsx import 了 ToolPill 和 HitlCard
8. message-bubble.tsx segments.map 中处理了 tool 和 hitl 类型

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ToolPill + HitlCard 组件已就位，等待 Plan 03 在 chat-area 中连线（传入 resumeChat 回调 + updateHitlStatus）
- MessageBubble 的可选回调 props 设计确保了 Plan 03 只需在 message-list 层传入 handler，无需再改组件

## Self-Check: PASSED

- All 4 files exist on disk
- Both commit hashes (a00b4d1, c384443) found in git log

---
*Phase: 09-tool-call-ux-hitl-approval*
*Completed: 2026-04-16*
