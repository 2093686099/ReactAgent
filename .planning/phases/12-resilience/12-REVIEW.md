---
phase: 12-resilience
reviewed: 2026-04-22T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - backend/app/api/chat.py
  - backend/tests/test_resilience.py
  - frontend/src/components/chat/chat-area.tsx
  - frontend/src/components/layout/reconnect-banner.tsx
  - frontend/src/hooks/use-sse.ts
  - frontend/src/stores/__tests__/chat-store.connection-status.test.ts
  - frontend/src/stores/__tests__/chat-store.resolve-hitl.test.ts
  - frontend/src/stores/chat-store.ts
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-04-22
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Phase 12 adds a thin, well-scoped resilience layer: `Last-Event-ID` header fallback on the SSE stream, a `hitl_resolved` lifecycle frame emitted from `/api/chat/resume`, a `connectionStatus` state machine in the chat-store, an idempotent `resolveLastPendingHitl` action, and a `ReconnectBanner` component. Tests are focused and assert the right invariants (query > header > "0" precedence, frame shape, idempotency, most-recent-pending semantics, tool-hint targeting).

Two correctness issues need attention:

1. The `ReconnectBanner` debounce specified in `12-CONTEXT.md` D-04 ("首次出现延迟 1s 避免 token 级微短抖动") is not actually delivered by the current render guard — the banner appears immediately.
2. There is a latent ordering race between `start_resume` (which schedules the bg agent task) and the subsequent `publish_event("hitl_resolved", ...)` in the same API handler. In practice the handler publishes first because the bg task has not yet context-switched, but nothing enforces this.

Remaining items are minor (dead CSS transition tokens, redundant `setConnectionStatus("connected")` calls on every frame, single-action-request assumption, CONTEXT↔types drift on `"edit"`).

No Critical issues. No secrets, injection, or crash paths introduced. HitlStatus type coverage and the fallback behavior on null tool_name are internally consistent.

## Warnings

### WR-01: ReconnectBanner 1s debounce is defeated by the render guard

**File:** `frontend/src/components/layout/reconnect-banner.tsx:10-21`

**Issue:** The component is supposed to delay banner appearance by 1s (D-04 in `12-CONTEXT.md`: "首次出现延迟（debounce 1s）避免 token 级微短抖动被放大成视觉噪音"). Trace the state machine starting from initial state `visible=false, status="connected"`:

1. SSE drops → store fires `setConnectionStatus("reconnecting")` → `status="reconnecting"`, `visible=false`.
2. `useEffect` schedules `setVisible(true)` after 1000ms.
3. Render guard runs *this render cycle*:
   ```ts
   if (!visible && status === "connected") return null;
   ```
   Evaluates `!false && "reconnecting" === "connected"` → `true && false` → `false`. The guard does **not** return null, so the banner renders immediately.

The `setTimeout` only toggles `visible` from `false → true`, but the null-guard already let the banner through at `visible=false`. Net result: the 1s debounce is a no-op on the appearance path; it only affects the hide path.

The dependency-array side effect is also slightly surprising — on a fast connect→reconnect→connect flip, a stale 300ms hide timer from the "connected" branch can fire during a subsequent "reconnecting" window (cleanup mitigates, but only if React re-runs the effect before that 300ms elapses).

**Fix:** Make the guard require `visible` only, so the useState+setTimeout becomes the sole appearance trigger:

```tsx
useEffect(() => {
  if (status === "reconnecting") {
    const timer = window.setTimeout(() => setVisible(true), 1000);
    return () => window.clearTimeout(timer);
  }
  const timer = window.setTimeout(() => setVisible(false), 300);
  return () => window.clearTimeout(timer);
}, [status]);

if (!visible) {
  return null;
}
```

Consider adding a unit test that advances fake timers by 999ms after status flips to `"reconnecting"` and asserts the banner is still null, then by another 2ms and asserts it renders — mirrors the D-04 intent.

---

### WR-02: `hitl_resolved` publish is racing the resumed agent's event stream

**File:** `backend/app/api/chat.py:86-100`

**Issue:** The handler does:

```python
await task_svc.start_resume(request.task_id, command_data)  # schedules asyncio.create_task
...
await task_bus.publish_event(request.task_id, "hitl_resolved", {...})
```

`start_resume` (see `backend/app/services/task.py:78-100`) is fire-and-forget — it returns as soon as the bg task is scheduled. In normal CPython asyncio, the scheduled coroutine does not run until the next `await` yields control, so the synchronous path through `publish_event` at line 91 generally wins the XADD race. However:

- Nothing in the code enforces this ordering. `start_resume` itself contains `await task_bus.set_task_status(...)` and `await self._session_service.set_last_task_id(...)` *after* `asyncio.create_task(...)`. Either of those awaits can yield and give the bg agent task a chance to run, potentially XADD'ing a token/tool/done frame before `hitl_resolved`.
- For a very short reject path, the agent could reach `done` quickly. If the SSE consumer's `read_events` sees `done` before `hitl_resolved` is published, the stream returns at `chat.py:135-136` and the pending HitlSegment on the replay client is **not** converged — exactly the G-01 failure mode this phase fixes.

This is not observed in the current tests (they mock `task_bus` entirely), so the race is silent.

**Fix:** Publish the `hitl_resolved` frame *before* scheduling the bg task, so the XADD ordering on Redis mirrors logical ordering:

```python
action_req = (request.action_requests or [{}])[0]
await task_bus.publish_event(
    request.task_id,
    "hitl_resolved",
    {
        "tool_name": action_req.get("name"),
        "call_id": action_req.get("id"),
        "decision": request.response_type,
        "ts": time.time(),
    },
)
await task_svc.start_resume(request.task_id, command_data)
await session_svc.touch(meta["session_id"], meta["user_id"])
```

Alternatively, have `start_resume` itself publish the frame as its first action, before the `set_task_status`+`create_task` block, to keep the lifecycle signal co-located with the state transition that produces it.

## Info

### IN-01: `setConnectionStatus("connected")` fires on every single SSE frame

**File:** `frontend/src/hooks/use-sse.ts:56, 69, 87, 94, 108, 125, 153`

**Issue:** Every event listener (`token`, `tool`, `done`, `error`, `hitl`, `todo`, `hitl_resolved`) starts with `setConnectionStatus("connected")`. For a token-heavy response this writes to the store once per token. Zustand bails out subscribers via `Object.is`, so this is not a correctness issue, but it does produce N extraneous `set` calls per streamed message and subscribers using `useChatStore(s => s.connectionStatus)` still receive N subscription notifications before the equality check.

**Fix:** Gate the write on the current status, either inline or inside the store action:

```ts
setConnectionStatus: (connectionStatus) =>
  set((s) => (s.connectionStatus === connectionStatus ? {} : { connectionStatus })),
```

This makes every repeat call a true no-op.

---

### IN-02: `transition-opacity duration-200` with no opacity class pair is dead styling

**File:** `frontend/src/components/layout/reconnect-banner.tsx:32`

**Issue:** The component declares `transition-opacity duration-200` but never sets `opacity-0` / `opacity-100` on any state. The transition token has nothing to animate; the banner pops in/out without fade. If a fade is intended (D-04 "Linear 的克制" implies graceful visuals), the classes need to actually drive opacity.

**Fix:** Bind the class to visible:

```tsx
className={`... transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
```

And let the "hide" path render the element at `opacity-0` for 300ms before unmounting (requires refactoring the early-return). If a fade is *not* intended, drop the unused `transition-opacity duration-200`.

---

### IN-03: Only the first `action_requests[0]` gets a `hitl_resolved` frame

**File:** `backend/app/api/chat.py:90-100`

**Issue:** `(request.action_requests or [{}])[0]` silently discards any additional entries. The v2 HITL protocol can in principle batch multiple tool approvals in a single interrupt; if that ever happens, only the first gets a resolve signal and the remaining pending HitlSegments on replay clients will stay visually pending forever (re-triggering G-01 for batches).

Current production usage in this codebase appears to be single-tool-per-interrupt, so this is dormant. Worth documenting and covering when/if multi-action batches become real.

**Fix:** Emit one frame per action_request, or note the single-tool assumption explicitly in the docstring:

```python
for action_req in (request.action_requests or [{}]):
    await task_bus.publish_event(
        request.task_id, "hitl_resolved",
        {"tool_name": action_req.get("name"), "call_id": action_req.get("id"),
         "decision": request.response_type, "ts": time.time()},
    )
```

---

### IN-04: Documented `"edited"` terminal state is silently collapsed to `"approved"`

**File:** `frontend/src/hooks/use-sse.ts:160-164` (vs `12-CONTEXT.md` D-02)

**Issue:** CONTEXT D-02 specifies three terminal mappings `approve→approved`, `edit→edited`, `reject→rejected`. The `HitlStatus` type (`frontend/src/lib/types.ts:9`) exposes `"pending" | "approved" | "rejected" | "feedback"` — no `"edited"`. The implementation folds `edit` into `approved`, which is consistent with the type system but loses the "user modified args before approving" distinction that downstream rendering might want to show (e.g. a different label or a diff indicator).

Two options — pick one and reconcile the docs:

- Accept the drift: update CONTEXT D-02 to say "edit maps to approved in v2.0 (edited-args rendering deferred)".
- Honor D-02: add `"edited"` to `HitlStatus` and route `edit` to it, with HitlCard rendering unchanged for now (just a status tag).

**Fix:** Prefer option 1 for v2.0 (smallest change, matches the deliberate "edited_args not carried" decision in CONTEXT's `additional_constraints`). If kept as-is, add a comment at use-sse.ts:160 documenting the collapse so future readers don't re-introduce the bug:

```ts
// D-02 defined three terminal states but HitlStatus only has two visible ones;
// edit collapses into approved because edited_args are deliberately not propagated.
```

---

_Reviewed: 2026-04-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
