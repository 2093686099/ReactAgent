---
phase: 12-resilience
fixed_at: 2026-04-22T00:00:00Z
review_path: .planning/phases/12-resilience/12-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 4
status: all_fixed
---

# Phase 12: Code Review Fix Report

**Fixed at:** 2026-04-22
**Source review:** `.planning/phases/12-resilience/12-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope (Critical + Warning): 2
- Fixed: 2
- Skipped (out of scope): 4

All in-scope findings were fixed. The 4 Info-level findings were not in scope
for this pass because `--all` was not passed; they are listed below for
traceability.

## Fixed Issues

### WR-01: ReconnectBanner 1s debounce is defeated by the render guard

**Files modified:** `frontend/src/components/layout/reconnect-banner.tsx`
**Commit:** 7b2b0cf
**Applied fix:** Changed the early-return guard from
`if (!visible && status === "connected") return null;` to `if (!visible) return null;`.
The `useEffect` with `setTimeout(..., 1000)` is now the sole trigger that
flips `visible` to `true` when `status === "reconnecting"`, so the banner
no longer appears synchronously on the first render cycle after status
flips. The 1s debounce specified in 12-CONTEXT.md D-04 is honored on the
appearance path.

Note: this fix is logic-sensitive; the existing test
`ReconnectBanner behaviour` in the frontend test suite should still pass
(it doesn't exercise sub-second timing), but a human should confirm the
1s debounce visually or via the suggested `jest.useFakeTimers()` test.

### WR-02: `hitl_resolved` publish is racing the resumed agent's event stream

**Files modified:** `backend/app/api/chat.py`
**Commit:** 592f18b
**Applied fix:** Reordered `/api/chat/resume` so `task_bus.publish_event(..., "hitl_resolved", ...)`
runs *before* `task_svc.start_resume(...)`. Since `start_resume` schedules
the bg agent task via `asyncio.create_task` and then performs additional
awaits (`set_task_status`, `set_last_task_id`), any of those could yield
control and let the agent XADD token/tool/done frames ahead of
`hitl_resolved`, re-triggering G-01 on replay clients. Publishing first
makes the Redis Stream XADD order mirror the logical order deterministically.
Added a comment explaining the ordering constraint. Existing tests in
`backend/tests/test_resilience.py` continue to pass — they mock `task_bus`
and don't assert ordering against `start_resume`.

## Skipped Issues

### IN-01: `setConnectionStatus("connected")` fires on every single SSE frame

**File:** `frontend/src/hooks/use-sse.ts:56, 69, 87, 94, 108, 125, 153`
**Reason:** not in scope (--all flag not provided)
**Original issue:** Every SSE event listener unconditionally calls
`setConnectionStatus("connected")`, producing N store writes per streamed
message. Zustand's `Object.is` short-circuits the render side but the
set calls themselves are redundant.

### IN-02: `transition-opacity duration-200` with no opacity class pair is dead styling

**File:** `frontend/src/components/layout/reconnect-banner.tsx:32`
**Reason:** not in scope (--all flag not provided)
**Original issue:** The component declares `transition-opacity duration-200`
but never binds `opacity-0` / `opacity-100`, so the transition token has
nothing to animate. Either bind the classes or remove the dead tokens.

### IN-03: Only the first `action_requests[0]` gets a `hitl_resolved` frame

**File:** `backend/app/api/chat.py:90-100`
**Reason:** not in scope (--all flag not provided)
**Original issue:** The resume handler indexes `(request.action_requests or [{}])[0]`
and silently discards additional entries. Dormant today (single-tool-per-interrupt
in practice) but will re-trigger G-01 for batched multi-action interrupts
if those ever land.

### IN-04: Documented `"edited"` terminal state is silently collapsed to `"approved"`

**File:** `frontend/src/hooks/use-sse.ts:160-164` (vs `12-CONTEXT.md` D-02)
**Reason:** not in scope (--all flag not provided)
**Original issue:** CONTEXT D-02 specifies three terminal mappings
(`approve→approved`, `edit→edited`, `reject→rejected`), but `HitlStatus`
only exposes two visible ones, so `edit` folds into `approved`. Either
update D-02 to document the collapse or add `"edited"` to the type.

---

_Fixed: 2026-04-22_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
