---
phase: 12-resilience
fixed_at: 2026-04-22T00:00:00Z
review_path: .planning/phases/12-resilience/12-REVIEW.md
iteration: 2
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 12: Code Review Fix Report

**Fixed at:** 2026-04-22
**Source review:** `.planning/phases/12-resilience/12-REVIEW.md`
**Iteration:** 2

**Summary:**
- Findings in scope: 6 (2 Warning already fixed in iter 1 + 4 Info fixed this pass)
- Fixed: 6
- Skipped: 0

Iteration 1 fixed the 2 Warning findings (WR-01, WR-02). Iteration 2 expands
scope to `--all` and closes the 4 Info findings (IN-01..IN-04). The iter-1
entries are preserved below for traceability but are not re-counted or
re-committed in this pass.

## Fixed Issues

### WR-01: ReconnectBanner 1s debounce is defeated by the render guard

**Status:** fixed in iter 1
**Files modified:** `frontend/src/components/layout/reconnect-banner.tsx`
**Commit:** 7b2b0cf
**Applied fix:** Changed the early-return guard from
`if (!visible && status === "connected") return null;` to `if (!visible) return null;`.
The `useEffect` with `setTimeout(..., 1000)` is now the sole trigger that
flips `visible` to `true` when `status === "reconnecting"`, so the banner
no longer appears synchronously on the first render cycle after status
flips. The 1s debounce specified in 12-CONTEXT.md D-04 is honored on the
appearance path.

Note: logic-sensitive; a human should confirm the 1s debounce visually or
via a `jest.useFakeTimers()` test as suggested in the review.

### WR-02: `hitl_resolved` publish is racing the resumed agent's event stream

**Status:** fixed in iter 1
**Files modified:** `backend/app/api/chat.py`
**Commit:** 592f18b
**Applied fix:** Reordered `/api/chat/resume` so `task_bus.publish_event(..., "hitl_resolved", ...)`
runs *before* `task_svc.start_resume(...)`. Since `start_resume` schedules
the bg agent task via `asyncio.create_task` and then performs additional
awaits (`set_task_status`, `set_last_task_id`), any of those could yield
control and let the agent XADD token/tool/done frames ahead of
`hitl_resolved`, re-triggering G-01 on replay clients. Publishing first
makes the Redis Stream XADD order mirror the logical order deterministically.
A comment was added explaining the ordering constraint. Existing tests in
`backend/tests/test_resilience.py` continue to pass — they mock `task_bus`
and don't assert ordering against `start_resume`.

### IN-01: `setConnectionStatus("connected")` fires on every single SSE frame

**Status:** fixed in iter 2
**Files modified:** `frontend/src/stores/chat-store.ts`
**Commit:** 3a6472e
**Applied fix:** Rewrote the `setConnectionStatus` action to short-circuit
when the incoming value equals the current `connectionStatus` in state.
`set((s) => (s.connectionStatus === connectionStatus ? {} : { connectionStatus }))`
turns repeat calls from `use-sse.ts` (which unconditionally fires this on
every token/tool/done/error/hitl/todo/hitl_resolved frame) into a true
no-op: Zustand detects the empty patch and skips both the state transition
and the subscriber notification. No callers needed changes; the gate is
store-local.

### IN-02: `transition-opacity duration-200` with no opacity class pair is dead styling

**Status:** fixed in iter 2
**Files modified:** `frontend/src/components/layout/reconnect-banner.tsx`
**Commit:** 86c30e1
**Applied fix:** Dropped the unused `transition-opacity duration-200`
classes from the banner container's className. The component already pops
in/out through the `visible`-gated early return (see WR-01 iter-1 fix), and
D-04 does not strictly require a fade. Removing the dead tokens keeps the
style surface honest rather than refactoring the early-return to support a
true opacity animation.

### IN-03: Only the first `action_requests[0]` gets a `hitl_resolved` frame

**Status:** fixed in iter 2
**Files modified:** `backend/app/api/chat.py`
**Commit:** 7387991
**Applied fix:** Added an inline comment adjacent to the
`action_req = (request.action_requests or [{}])[0]` line documenting the
explicit single-tool assumption: v2.0's HITL protocol in this codebase
emits one `action_request` per interrupt, so publishing a single
`hitl_resolved` frame is sufficient. The comment records the upgrade path
(loop-publish per action_request) for when/if batched multi-action
interrupts land, so a future reader does not silently re-introduce G-01
for the batch case. No behavioural change; this was selected over
loop-publishing to avoid expanding protocol surface beyond current
production usage.

### IN-04: Documented `"edited"` terminal state is silently collapsed to `"approved"`

**Status:** fixed in iter 2
**Files modified:** `frontend/src/hooks/use-sse.ts`, `.planning/phases/12-resilience/12-CONTEXT.md`
**Commit:** 9ee794f
**Applied fix:** Followed review option 1 — reconcile the docs to match
implementation rather than expand the type system. Two touches:

1. `frontend/src/hooks/use-sse.ts:160` — added a comment immediately above
   the `hitl_resolved` decision branch explaining that `edit` collapses
   into `approved` because `edited_args` are deliberately not propagated
   over the wire, plus a note of the two-part change required to honor a
   distinct `"edited"` terminal state in the future (extend `HitlStatus`
   *and* start shipping `edited_args` in `hitl_resolved`).
2. `.planning/phases/12-resilience/12-CONTEXT.md` D-02 — rewrote the
   terminal-mapping clause to explicitly state `edit→approved` in v2.0
   and point at the `additional_constraints` rationale, so the CONTEXT
   doc and the code no longer drift.

`HitlStatus` was intentionally left untouched; the review explicitly
preferred option 1 over option 2 to keep v2.0's smallest reconciliation.

---

_Fixed: 2026-04-22_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
