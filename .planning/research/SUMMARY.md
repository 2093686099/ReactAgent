# Project Research Summary

**Project:** AI Agent Chat Frontend (Next.js)
**Domain:** Real-time AI chat UI with tool-calling agent, HITL approval, and SSE streaming
**Researched:** 2026-04-12
**Confidence:** HIGH

## Executive Summary

This project is a Next.js frontend for an existing FastAPI-based AI agent backend. The backend is already fully functional: it manages multi-session conversations via Redis, executes LangGraph-based agents with tool calling via Celery workers, streams results via Server-Sent Events over Redis Streams, and implements a Human-in-the-Loop (HITL) approval protocol for dangerous tool calls. The frontend's job is to provide a ChatGPT-like conversation interface that consumes this SSE stream, renders streaming markdown, displays inline tool call indicators, and presents HITL approval cards when the agent requests human decisions. Experts build this type of product as a single-page chat application with a unified state store driving all UI from a single SSE event stream.

The recommended approach is Next.js 15.5 (App Router) with Tailwind CSS v4, shadcn/ui components, and Zustand for state management. The SSE client should use `fetch` + `ReadableStream` (not native `EventSource`) from day one -- this avoids a painful rewrite when authentication is added later. The core architectural pattern is "SSE Event Dispatch via Zustand Actions": SSE events flow into a custom `useSSE` hook, which calls Zustand store actions, which components subscribe to via selectors. The "segments" message model (interleaved text and tool-call indicators within a single AI bubble) maps directly to the backend's streaming event order.

The primary risks are: (1) SSE proxy buffering destroying the streaming experience -- mitigated by having the frontend connect directly to the backend, not through a Next.js proxy; (2) React render storms from high-frequency token events -- mitigated by a buffer + requestAnimationFrame batch pattern; (3) HITL state loss on page refresh -- mitigated by persisting interrupt state to sessionStorage and checking backend task status on load; (4) UTF-8 multi-byte character truncation in SSE stream parsing -- mitigated by using `TextDecoderStream` or `TextDecoder({ stream: true })`. All critical pitfalls have known, well-documented solutions.

## Key Findings

### Recommended Stack

Next.js 15.5 is the right choice over 16.x -- the app is a single-page chat UI with no need for 16's cache or Turbopack production improvements, and 15.5 avoids breaking changes to middleware and params APIs. The stack is deliberately minimal: no auth library (single-user), no data fetching library (Zustand + fetch covers it), no animation library (CSS transitions suffice), no WebSocket library (backend is SSE).

**Core technologies:**
- **Next.js 15.5** (App Router): Stable React framework with Turbopack dev server. Single `page.tsx` -- no multi-page routing needed.
- **React 19**: Ships with Next.js 15.5. `use()` hook and concurrent features.
- **TypeScript 5.x**: Non-negotiable. Catches SSE event type mismatches at compile time.
- **Tailwind CSS v4**: CSS-first config, auto content detection, 70% smaller production CSS. shadcn/ui fully supports it.
- **shadcn/ui (CLI v4)**: Copy-paste components (not a dependency). Provides Dialog, Card, Button, ScrollArea, Sheet, Tooltip -- everything needed for chat + HITL + sidebar.
- **Zustand 5.0.x**: 1.2KB state management. Selector-based subscriptions prevent cascade re-renders during token streaming. Handles chat, session, HITL, and todo state.
- **`fetch` + `ReadableStream`**: SSE client. No `EventSource` (can't send headers), no `@microsoft/fetch-event-source` (unnecessary dependency). Manual SSE parsing with `TextDecoderStream` for UTF-8 safety.
- **react-markdown + rehype-highlight + remark-gfm**: Markdown rendering with syntax highlighting and GFM tables.
- **Biome**: Linting + formatting in one binary, 10-25x faster than ESLint+Prettier.

### Expected Features

**Must have (table stakes -- P1):**
- SSE streaming text rendering (token-by-token with auto-scroll)
- Markdown rendering with code highlighting
- Chat message list with segments model (text + inline tool indicators)
- Text input (Enter to send, Shift+Enter for newline, disabled during streaming)
- Inline tool call indicators (spinner for "calling", checkmark for "done")
- HITL approve/reject cards (core safety feature)
- Session sidebar (list, create, switch, delete)
- Loading/thinking indicator and error display with retry

**Should have (differentiators -- P2):**
- Todo/task planning panel (real-time agent plan visibility from TodoListMiddleware)
- HITL edit mode (modify tool arguments before execution)
- Tool call detail expansion (click to see full args/results)
- SSE reconnection with `from_id` resume
- Copy code blocks, message actions (copy/retry), keyboard shortcuts

**Defer (v2+):**
- Session search, long-term memory UI, system prompt customization, dark mode, multi-LLM selector
- Anti-features to never build: multi-user auth, voice I/O, file upload, message branching, generative UI, offline/PWA

### Architecture Approach

Single-page chat application with a unified Zustand store as the single source of truth. The SSE event stream drives all real-time state. Components are organized by domain (chat, hitl, sidebar, todo), not by type. The core data flow is: user action -> API call -> task_id -> SSE connection -> events dispatch to store -> components re-render via selectors. The HITL interrupt flow is a special case where `hitl` events pause the stream, the user makes a decision via REST, and the same SSE stream resumes.

**Major components:**
1. **API Client (`lib/api.ts`)** -- Thin fetch wrappers for all REST endpoints (invoke, resume, sessions, memory)
2. **SSE Hook (`hooks/useSSE.ts`)** -- Manages fetch-based SSE connection lifecycle, dispatches parsed events to Zustand store, handles reconnection with `from_id`
3. **Chat Store (`stores/chat.ts`)** -- Unified Zustand store: messages[], status, todos[], interrupt, sessions[], activeSessionId
4. **Message Bubble (`components/chat/MessageBubble.tsx`)** -- Renders segments array (text as markdown, tool calls as indicator chips). Most complex UI component.
5. **HITL Card (`components/hitl/HITLCard.tsx`)** -- Approval UI embedded in message flow (not modal). Approve/edit/reject buttons, calls resume API.
6. **Sidebar (`components/sidebar/Sidebar.tsx`)** -- Session list with CRUD. Collapsible.

### Critical Pitfalls

1. **SSE proxy buffering** -- Tokens batch up instead of streaming when going through Next.js rewrite or nginx. Avoid by connecting frontend directly to backend (CORS already configured). Verify with `curl -N`.

2. **`EventSource` limitations** -- Cannot send custom headers, only supports GET. Use `fetch` + `ReadableStream` from day one to avoid rewrite when auth is added. The backend's GET SSE endpoint works with both approaches.

3. **React render storms from token streaming** -- Each token triggering `setState` causes 30-100 renders/sec. Use buffer + `requestAnimationFrame` batch pattern: tokens go to a `useRef` buffer, RAF loop flushes to state once per frame.

4. **UTF-8 multi-byte truncation** -- Chinese characters (3-byte UTF-8) split across TCP chunks produce garbage. Use `TextDecoder({ stream: true })` or `TextDecoderStream` pipe. This is near-certain to occur with Chinese text.

5. **HITL state loss on refresh** -- Interrupt data only in React memory; page refresh loses it while backend agent still waits. Persist HITL state to sessionStorage; on page load, check backend task status and restore approval UI if interrupted.

6. **SSE connection leaks** -- Switching sessions or leaving page without closing fetch stream exhausts browser's 6-connection limit. Always use `AbortController` in useEffect cleanup.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Project Scaffold and SSE Foundation
**Rationale:** Everything depends on the SSE streaming pipeline being correct. STACK.md's installation sequence, ARCHITECTURE.md's project structure, and 6 of 8 critical pitfalls are Phase 1 concerns. Get this right first.
**Delivers:** Next.js project with Tailwind/shadcn/Zustand, SSE client (fetch-based), basic chat store, and a working end-to-end token stream rendering in a single hardcoded session.
**Features addressed:** SSE streaming text rendering, markdown rendering, chat message list (segments model), text input, loading/thinking states, auto-scroll
**Pitfalls addressed:** SSE proxy buffering (direct connect), EventSource limitation (use fetch), render storms (RAF batch), UTF-8 truncation (TextDecoderStream), SSE connection leaks (AbortController), CORS (parameterize origin)
**Key decision:** Use `fetch` + `ReadableStream` for SSE, not `EventSource`. This is non-negotiable per PITFALLS.md analysis.

### Phase 2: HITL Approval and Tool Call UX
**Rationale:** HITL is the core product differentiator (FEATURES.md competitor analysis: no consumer AI product exposes tool approval). It depends on Phase 1's SSE infrastructure and segments model. This is the highest-complexity feature.
**Delivers:** Inline HITL approval cards (approve/reject), tool call indicator segments (calling/done states), error display with retry, and the complete invoke-stream-resume lifecycle.
**Features addressed:** HITL approve/reject cards, inline tool call indicators, error display + retry
**Pitfalls addressed:** HITL state inconsistency (sessionStorage persistence, multi-tool rendering, optimistic update + rollback), resume-after-approve SSE continuation
**Key risk:** Multi-tool approval (backend can interrupt with multiple `action_requests`). Frontend must render all pending approvals, not just the first.

### Phase 3: Session Management
**Rationale:** Sessions depend on stable chat and HITL flows. Switching sessions requires clean SSE teardown (Phase 1) and HITL state management (Phase 2). FEATURES.md marks session sidebar as P1 but it has lower coupling than HITL.
**Delivers:** Session sidebar (list/create/switch/delete), session switching with SSE cleanup, active session persistence, per-session scroll position preservation.
**Features addressed:** Session sidebar CRUD, session switching without data loss, responsive sidebar layout
**Pitfalls addressed:** SSE connection leaks on session switch, stale session list caching

### Phase 4: Todo Panel and Enhanced Features
**Rationale:** Todo panel is independent of chat rendering (separate panel, same SSE stream). HITL edit mode builds on Phase 2's approve/reject. These are P2 features that add polish.
**Delivers:** Real-time todo/task plan panel, HITL edit mode (tool arg editing), tool call detail expansion, copy code blocks, message actions.
**Features addressed:** Todo panel, HITL edit mode, tool detail expansion, copy code blocks, message copy/retry
**Pitfalls addressed:** None critical -- standard patterns

### Phase 5: Resilience and Polish
**Rationale:** SSE reconnection, keyboard shortcuts, and edge case handling. These are quality-of-life improvements that make the product daily-drivable but aren't needed for initial validation.
**Delivers:** SSE reconnection with `from_id` resume, keyboard shortcuts, task TTL expiry handling, empty state guidance, "stop generation" button.
**Features addressed:** SSE reconnection, keyboard shortcuts, UX polish items from PITFALLS.md checklist

### Phase Ordering Rationale

- **SSE first because everything is downstream of it.** Every feature (chat, HITL, todo, sessions) consumes the SSE event stream. Getting the streaming pipeline correct -- including UTF-8 handling, render batching, and connection management -- is prerequisite to all else.
- **HITL before sessions because it's the product's core value.** A working chat with HITL approval in a single session is more valuable than multi-session support without HITL. The invoke-stream-resume lifecycle must be proven before adding session complexity.
- **Sessions third because switching is the main source of connection leaks.** By Phase 3, the SSE and HITL patterns are stable, so adding teardown/reconnect on session switch is a controlled extension, not a greenfield risk.
- **Todo and enhanced features are additive.** They plug into the existing SSE dispatch and store patterns without requiring architectural changes.
- **Resilience last because it's optimization.** Reconnection and shortcuts improve a working product; they don't make a broken product work.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (SSE client):** The fetch + ReadableStream SSE parsing requires careful implementation. Research the exact SSE wire format the backend emits (named events with `event:`, `data:`, `id:` lines). Verify `TextDecoderStream` browser support (it's widely supported but confirm).
- **Phase 2 (HITL):** The multi-tool approval flow needs backend contract clarification. Research the exact shape of `action_requests` in the `hitl` SSE event and how `build_decisions` maps frontend responses. The edit mode needs research on how to construct the `ResumeRequest` with modified args.

Phases with standard patterns (skip research-phase):
- **Phase 3 (Sessions):** Standard CRUD + sidebar UI. Well-documented patterns, backend API is simple REST.
- **Phase 4 (Todo + extras):** Todo panel is a read-only display of SSE events. Code block copy is a solved problem.
- **Phase 5 (Resilience):** SSE reconnection patterns are well-documented. Keyboard shortcuts are standard.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against official Next.js 15.5/16 blogs, npm data, shadcn changelog. Version compatibility matrix confirmed. |
| Features | HIGH | Feature list derived from direct backend code inspection + competitor analysis. Backend API contracts verified against source code. |
| Architecture | HIGH | Architecture patterns based on direct backend source analysis (SSE format, Redis Streams, HITL protocol). Anti-patterns sourced from real-world streaming chat implementations. |
| Pitfalls | HIGH | All critical pitfalls sourced from documented issues (Next.js SSE buffering, EventSource limitations, React render storms). Each has verified prevention strategy with code examples. |

**Overall confidence:** HIGH

### Gaps to Address

- **Message history loading:** No backend endpoint for fetching previous messages in a session was documented. Either the backend has one not yet surfaced, or the frontend needs to replay from Redis Stream on session switch. Clarify during Phase 3 planning.
- **Backend `Last-Event-ID` header support:** ARCHITECTURE.md recommends a one-line backend fix to read `Last-Event-ID` header for SSE auto-reconnection. This should be implemented before Phase 5 (resilience), but is not blocking Phase 1.
- **Backend client disconnect handling:** PITFALLS.md notes that `backend/app/infra/task_bus.py` `read_events` loop may not terminate cleanly when the client disconnects. This is a backend fix, not a frontend concern, but it affects resource usage.
- **HITL `action_requests` exact schema:** The multi-tool approval UI depends on the exact structure of the `hitl` SSE event payload. Needs validation against backend code during Phase 2 planning.
- **`streamdown` vs `react-markdown`:** FEATURES.md mentions Vercel's `streamdown` library as an alternative for streaming markdown. Research during Phase 1 whether it handles incomplete markdown chunks better than throttled `react-markdown`.

## Sources

### Primary (HIGH confidence)
- Backend source code: `backend/app/api/chat.py`, `backend/app/infra/task_bus.py`, `backend/app/main.py`, `backend/app/core/streaming.py`, `backend/app/core/hitl.py`
- [Next.js 15.5 Blog](https://nextjs.org/blog/next-15-5)
- [Next.js 16 Blog](https://nextjs.org/blog/next-16)
- [shadcn/ui Changelog](https://ui.shadcn.com/docs/changelog)
- [Zustand npm](https://www.npmjs.com/package/zustand) -- v5.0.12, 20M weekly downloads
- [MDN EventSource / SSE docs](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [Tailwind CSS v4 Blog](https://tailwindcss.com/blog/tailwindcss-v4)

### Secondary (MEDIUM confidence)
- [AI UI Patterns - patterns.dev](https://www.patterns.dev/react/ai-ui-patterns/)
- [Streaming Backends & React Re-render Control](https://www.sitepoint.com/streaming-backends-react-controlling-re-render-chaos/)
- [Vercel AI SDK Stream Protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)
- [Next.js SSE Discussion #48427](https://github.com/vercel/next.js/discussions/48427)
- [@microsoft/fetch-event-source](https://github.com/Azure/fetch-event-source)

### Tertiary (LOW confidence)
- [Streamdown - Vercel](https://github.com/vercel/streamdown) -- Streaming markdown renderer, relatively new, needs evaluation
- [A2UI - Google](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/) -- Agent UI standard, early stage, not actionable yet

---
*Research completed: 2026-04-12*
*Ready for roadmap: yes*
