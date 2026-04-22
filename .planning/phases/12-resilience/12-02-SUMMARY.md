---
phase: 12-resilience
plan: "02"
subsystem: frontend-resilience
tags: [frontend, zustand, sse, hitl, nextjs, resilience]
dependency_graph:
  requires: [12-01 backend hitl_resolved event contract]
  provides: [connectionStatus state machine, hitl_resolved reconciliation, reconnect banner UI]
  affects: [12-03-uat, RESIL-01, RESIL-02]
tech_stack:
  added: []
  patterns:
    - store-level idempotent HITL reconciliation with tool_name hint
    - EventSource onerror non-closing reconnect path + per-listener connected heartbeat
key_files:
  created:
    - frontend/src/components/layout/reconnect-banner.tsx
    - frontend/src/stores/__tests__/chat-store.connection-status.test.ts
    - frontend/src/stores/__tests__/chat-store.resolve-hitl.test.ts
  modified:
    - frontend/src/stores/chat-store.ts
    - frontend/src/hooks/use-sse.ts
    - frontend/src/components/chat/chat-area.tsx
decisions:
  - "Do not close EventSource in non-terminal onerror path; rely on browser native reconnect with Last-Event-ID."
  - "resolveLastPendingHitl uses tool_name-first targeting and only falls back when hint is absent."
  - "Reconnect banner uses neutral panel/text tokens (no warning/error colors)."
metrics:
  duration: "~25min"
  completed: "2026-04-22T04:06:00Z"
  tasks_completed: 3
  files_changed: 6
requirements_completed: [RESIL-01, RESIL-02]
---

# Phase 12 Plan 02 Summary

**Frontend resilience now exposes reconnect state to users and safely reconciles pending HITL cards via `hitl_resolved` replay without collapsing the wrong card.**

## Accomplishments

- Extended `chat-store` with `connectionStatus`, `setConnectionStatus`, and idempotent `resolveLastPendingHitl(decision, toolName?)`.
- Updated `use-sse` to consume `hitl_resolved`, map decisions (`approve/edit -> approved`, `reject -> rejected`), and avoid breaking browser reconnect in `onerror`.
- Added `ReconnectBanner` and mounted it above chat header with debounce-based visibility (`1s` show, `300ms` hide).

## Task Commits

1. **Task 1: chat-store actions + tests** - `08b049f` (`feat`)
2. **Task 2: use-sse reconnect + hitl_resolved handling** - `a343e49` (`feat`)
3. **Task 3: reconnect banner UI + chat-area wiring** - `bd8437a` (`feat`)

## Verification

- `cd frontend && npx vitest run src/stores/__tests__/chat-store.connection-status.test.ts src/stores/__tests__/chat-store.resolve-hitl.test.ts` -> **12 passed**
- `cd frontend && npx tsc --noEmit && npx vitest run` -> **typecheck pass, 36 tests passed**
- `cd frontend && npx tsc --noEmit && npx next build` -> **build passed**

## Issues Encountered

- ESLint CLI is not configured in this frontend workspace (`eslint.config.*` missing).  
  `npx eslint ...` fails with config error, and `npx next lint` enters deprecated interactive setup flow. This is pre-existing project tooling state, not caused by this plan.
- `next build` needs network access for Google Fonts; in sandboxed mode it failed on `fonts.googleapis.com`, then passed under escalated network permissions.

## Deviations from Plan

None in code scope. One verification deviation: direct ESLint check could not run because the project has no ESLint config file.

## UAT Notes for Plan 12-03

- In Chrome DevTools, use `Network -> Offline` for ~5 seconds to validate banner appearance and reconnect recovery.
- After restoring network, confirm banner disappears and SSE frames continue.

## Self-Check: PASSED

- [x] `chat-store.ts` includes `connectionStatus`, `setConnectionStatus`, `resolveLastPendingHitl`.
- [x] `use-sse.ts` includes `hitl_resolved` listener and non-closing reconnect `onerror`.
- [x] `reconnect-banner.tsx` created with token-only styling.
- [x] `chat-area.tsx` mounts `<ReconnectBanner />` above header.
- [x] New tests exist and pass.

