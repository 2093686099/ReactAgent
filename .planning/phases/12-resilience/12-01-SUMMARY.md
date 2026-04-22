---
phase: 12-resilience
plan: "01"
subsystem: backend-api-streaming
tags: [backend, fastapi, sse, hitl, resilience, redis-streams]
dependency_graph:
  requires: [12-CONTEXT decisions D-01 D-02 D-05 D-06]
  provides: [stream Last-Event-ID fallback, resume hitl_resolved signal, resilience integration tests]
  affects: [12-02-frontend, 12-03-uat, RESIL-01, RESIL-02]
tech_stack:
  added: []
  patterns:
    - query(from_id) > header(Last-Event-ID) > "0" stream replay priority
    - API-layer publish of hitl_resolved event for deterministic frontend reconciliation
key_files:
  created:
    - backend/tests/test_resilience.py
  modified:
    - backend/app/api/chat.py
decisions:
  - "Keep hitl_resolved publish in API layer after start_resume success; do not move into TaskService."
  - "Payload remains minimal: tool_name/call_id/decision/ts only, no edited_args."
  - "Preserve existing stream semantics while adding header fallback for browser auto-reconnect."
metrics:
  duration: "~20min"
  completed: "2026-04-22T03:58:51Z"
  tasks_completed: 3
  files_changed: 2
requirements_completed: [RESIL-01, RESIL-02]
---

# Phase 12 Plan 01 Summary

**Backend resilience path now supports browser `Last-Event-ID` replay and emits `hitl_resolved` events so frontend refresh/switch flows can converge pending HITL deterministically.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-04-22T03:58:51Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Added `/api/chat/stream/{task_id}` fallback order `query(from_id) > header(Last-Event-ID) > "0"` with no behavior change to 404/stream loop.
- Added `/api/chat/resume` post-success `task_bus.publish_event(..., "hitl_resolved", payload)` with strict payload schema (`tool_name`, `call_id`, `decision`, `ts`).
- Added `backend/tests/test_resilience.py` with 7 tests covering stream precedence, resume event emission, and interrupted-task replay.

## Task Commits

1. **Task 1: /stream Last-Event-ID fallback** - `b632df8` (`feat`)
2. **Task 2: /resume publish hitl_resolved** - `3b7d6ed` (`feat`)
3. **Task 3: Resilience integration tests** - `747b234` (`test`)

## Files Created/Modified

- `backend/app/api/chat.py` - stream replay offset precedence + resume-side `hitl_resolved` publish.
- `backend/tests/test_resilience.py` - 7 integration tests for D-13 scenarios.

## Event Payload Example

```json
{
  "tool_name": "maps_search",
  "call_id": "call-1",
  "decision": "approve",
  "ts": 1761112000.123
}
```

## Decisions Made

- Kept `hitl_resolved` emission in API layer immediately after `start_resume` success and before response return.
- Preserved small payload contract; no extra fields added.
- Did not touch `backend/app/services/task.py` or `backend/app/infra/task_bus.py`.

## Deviations from Plan

None - plan executed as specified.

## Issues Encountered

- `pytest tests -q` has 2 pre-existing failures in `tests/test_main.py` on macOS/Python 3.12 (`asyncio.WindowsSelectorEventLoopPolicy` attribute not present). This is unrelated to Phase 12 changes.

## Verification

- `../.venv/bin/python -m pytest tests/test_resilience.py -v` -> **7 passed**
- `../.venv/bin/python -m pytest tests/test_api/test_chat.py -q --tb=short` -> **3 passed**
- `../.venv/bin/python -m ruff check app/api/chat.py tests/test_resilience.py` -> **All checks passed**

## Self-Check: PASSED

- [x] `chat.py` includes `Header(... alias="Last-Event-ID")` and `effective_from_id` precedence logic.
- [x] `chat.py` publishes `hitl_resolved` with payload keys `{tool_name, call_id, decision, ts}`.
- [x] `backend/tests/test_resilience.py` exists with 7 passing tests.
- [x] Plan requirements `RESIL-01`, `RESIL-02` covered by implementation + tests.

