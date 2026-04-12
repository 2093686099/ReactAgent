# Stack Research

**Domain:** Next.js frontend for AI Agent assistant (connecting to existing FastAPI backend)
**Researched:** 2026-04-12
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 15.5.x | React framework, App Router | Next.js 16 exists (16.2.2) but 15.5 is the safer choice -- 16 changes default bundler to Turbopack-only which may break custom webpack configs, removes sync params API, and replaces middleware.ts. For a new frontend connecting to an existing backend, 15.5 gives full stability with a clear upgrade path. The frontend is purely client-rendered chat UI (no SSG/ISR needed), so 16's cache improvements add no value. |
| React | 19.x | UI library | Ships with Next.js 15.5. React 19 provides use() hook, Server Components, and improved concurrent features. |
| TypeScript | 5.x | Type safety | Ships with Next.js. Non-negotiable for any non-trivial project. Catches SSE event type mismatches at compile time. |
| Tailwind CSS | 4.x | Utility-first CSS | CSS-first config (no tailwind.config.js), auto content detection, 70% smaller production CSS vs v3. shadcn/ui fully supports v4 since Feb 2026. |
| shadcn/ui | latest (CLI v4) | Component library | Not a dependency -- components are copied into project. Uses unified `radix-ui` package (single dep instead of 20+ `@radix-ui/react-*` packages). Provides Dialog, Sheet, Card, Button, ScrollArea, Tooltip, Dropdown -- everything needed for chat UI + HITL cards + session sidebar. |
| Zustand | 5.0.x | Client-side state management | 20M weekly downloads, 1.2KB, best TypeScript inference in v5. Handles SSE streaming state, session list, HITL interrupt state. No boilerplate (no reducers, no providers). |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-markdown` | latest | Render AI markdown responses | Every AI message bubble -- agent outputs markdown with code blocks, lists, links |
| `rehype-highlight` | latest | Syntax highlighting in code blocks | Used as rehype plugin for react-markdown; lighter than react-syntax-highlighter (no Prism bundle) |
| `remark-gfm` | latest | GitHub Flavored Markdown (tables, strikethrough, task lists) | Plugin for react-markdown; agent may output tables or checklists |
| `radix-ui` | latest | Accessible UI primitives | Installed once; shadcn/ui components import from this unified package |
| `lucide-react` | latest | Icon library | shadcn/ui default icon library; consistent with component style |
| `clsx` + `tailwind-merge` | latest | Conditional class merging | shadcn/ui's `cn()` utility depends on both; already scaffolded by `shadcn init` |
| `sonner` | latest | Toast notifications | shadcn/ui's recommended toast; error messages, session delete confirmations |

### SSE Client Strategy

**Use native `EventSource` API -- no library needed.**

| Approach | Verdict | Reason |
|----------|---------|--------|
| Native `EventSource` | **USE THIS** | Backend SSE endpoint is `GET /api/chat/stream/{task_id}` with no auth headers needed (single-user mode). Native API handles named events (`token`, `tool`, `hitl`, `todo`, `done`, `error`), auto-reconnect, and `Last-Event-ID` resume. Zero dependencies. |
| `@microsoft/fetch-event-source` | Skip | Adds POST body support and custom headers -- neither needed. Backend is GET-only SSE, no auth headers. Over-engineering. |
| `eventsource` polyfill | Skip | For Node.js or custom fetch. Browser native API is sufficient. |

**Implementation pattern:**
```typescript
// Custom hook: useSSE(taskId)
// 1. new EventSource(`/api/chat/stream/${taskId}`)
// 2. es.addEventListener("token", ...) for each named event type
// 3. Cleanup: es.close() in useEffect return
// 4. Reconnect: EventSource auto-reconnects; use `id:` field from backend for resume
```

The backend already emits SSE `id:` fields (Redis Stream entry IDs) and supports `from_id` query param for reconnection. The native `EventSource` `Last-Event-ID` header is not used -- instead, on reconnect, append `?from_id={lastId}` to the URL.

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Biome | Linting + formatting | Next.js 15.5 supports Biome as linter choice during `create-next-app`. Single binary, 10-25x faster than ESLint+Prettier. One config file (`biome.json`). |
| Turbopack | Dev server bundler | Default in Next.js 15.5 for `next dev`. 10x faster Fast Refresh vs webpack. |

## Installation

```bash
# 1. Scaffold Next.js project (inside monorepo frontend/ directory)
npx create-next-app@15 frontend --typescript --tailwind --app --src-dir --import-alias "@/*"
# When prompted: choose Biome for linting, Turbopack for dev

# 2. Initialize shadcn/ui
cd frontend
npx shadcn@latest init
# Style: new-york (uses unified radix-ui package)

# 3. Add shadcn components needed for chat UI
npx shadcn@latest add button card dialog dropdown-menu input scroll-area separator sheet sidebar skeleton textarea tooltip

# 4. State management
npm install zustand

# 5. Markdown rendering
npm install react-markdown remark-gfm rehype-highlight

# 6. Toast notifications (shadcn recommended)
npx shadcn@latest add sonner
```

**Note:** `radix-ui`, `lucide-react`, `clsx`, `tailwind-merge` are auto-installed by `shadcn init`. No manual install needed.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Next.js 15.5 | Next.js 16.2 | If you need `use cache` directive or new Turbopack production builds. Upgrade later is straightforward (codemod available). |
| shadcn/ui | Ant Design / Material UI | Never for this project. Ant Design is heavy (200KB+), opinionated styling clashes with Tailwind. MUI same problem. shadcn/ui is Tailwind-native and copy-paste (no version lock-in). |
| Zustand | React Context | If state is trivial (1-2 values). Chat app has streaming state, session state, HITL state, todo state -- Context would cause cascade re-renders. Zustand's selector pattern prevents this. |
| Zustand | Jotai | If you prefer atomic state model. Zustand's store model maps better to this app's domains (chatStore, sessionStore). Jotai atoms would scatter related state. |
| Biome | ESLint + Prettier | If you need ESLint plugins not yet ported to Biome (e.g., eslint-plugin-react-compiler). For this project Biome's built-in React rules are sufficient. |
| rehype-highlight | react-syntax-highlighter | If you need line numbers, line highlighting, or 200+ language support. rehype-highlight covers common languages with much smaller bundle. |
| Native EventSource | @microsoft/fetch-event-source | If backend requires POST SSE or auth headers. Current backend uses GET endpoint with no auth -- native API is perfect. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Redux / Redux Toolkit | Massive boilerplate for a single-user chat app. 10M weekly downloads vs Zustand's 20M -- community has moved on for new projects. | Zustand |
| axios | `fetch()` is native in Next.js with built-in caching/revalidation. Adding axios adds 14KB for no benefit. | Native `fetch()` |
| styled-components / emotion | CSS-in-JS has runtime cost, conflicts with React Server Components, and duplicates what Tailwind does. | Tailwind CSS v4 |
| next-auth / Auth.js | No multi-user auth needed. Backend is single-user with `get_current_user()` returning `default_user_id`. Adding auth is premature. | Nothing (single-user mode) |
| SWR / React Query (TanStack Query) | Overkill for this app. Session list is the only REST data; SSE handles all real-time state. A simple `fetch()` + Zustand covers it. | `fetch()` in Zustand actions |
| Socket.io / WebSockets | Backend uses SSE (Server-Sent Events), not WebSockets. Client-to-server communication is REST POST. Bidirectional channel not needed. | Native EventSource |
| Framer Motion | Chat UI animations are minimal (message fade-in, skeleton pulse). CSS transitions + Tailwind `animate-*` suffice. 50KB saved. | Tailwind CSS `animate-*` utilities |
| i18n libraries (next-intl, etc.) | Single-user Chinese-language assistant. No internationalization needed. | Hardcoded Chinese strings |

## Project Structure

```
frontend/
  src/
    app/                    # Next.js App Router
      layout.tsx            # Root layout (providers, global styles)
      page.tsx              # Main chat page (single-page app)
      globals.css           # Tailwind v4 imports + CSS variables
    components/
      ui/                   # shadcn/ui components (auto-generated)
      chat/                 # Chat feature components
        chat-input.tsx
        message-bubble.tsx
        message-list.tsx
        tool-indicator.tsx  # Inline tool call status in message
      hitl/                 # HITL approval components
        approval-card.tsx
        edit-dialog.tsx
      sidebar/              # Session management
        session-list.tsx
        session-item.tsx
      todo/                 # Todo panel
        todo-panel.tsx
        todo-item.tsx
    hooks/
      use-sse.ts            # SSE connection + event dispatching
      use-chat.ts           # Chat actions (invoke, resume)
    stores/
      chat-store.ts         # Messages, streaming state, segments
      session-store.ts      # Session list, active session
      hitl-store.ts         # Interrupt state, pending decisions
      todo-store.ts         # Agent todo list state
    lib/
      api.ts                # Backend API client (fetch wrappers)
      utils.ts              # cn() + misc utilities
    types/
      events.ts             # SSE event type definitions
      chat.ts               # Message, Segment types
      hitl.ts               # HITL decision types
```

**Rationale:** Single `page.tsx` because this is a chat app -- no multi-page routing needed. Feature components grouped by domain (chat, hitl, sidebar, todo), not by type. Stores separated by domain to prevent god-store.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Next.js 15.5.x | React 19.x | React 19 ships with Next.js 15.5 |
| Next.js 15.5.x | Tailwind CSS 4.x | Supported since 15.2; `create-next-app --tailwind` installs v4 |
| shadcn/ui CLI v4 | Next.js 15.x + Tailwind 4.x | Full support; uses unified `radix-ui` package |
| shadcn/ui CLI v4 | React 19 | Supported since late 2024 |
| Zustand 5.0.x | React 19 | Officially compatible; concurrent-safe rendering |
| react-markdown 9.x | React 19 | ESM-only; works with Next.js App Router |
| Biome | Next.js 15.5+ | Supported as linter choice during scaffolding |

## Backend Integration Points

The frontend connects to these existing backend endpoints:

| Frontend Feature | Backend Endpoint | Method | Notes |
|------------------|------------------|--------|-------|
| Send message | `POST /api/chat/invoke` | REST | Body: `{session_id, query, system_message?}` -> Returns `{task_id}` |
| Stream response | `GET /api/chat/stream/{task_id}` | SSE | Named events: token, tool, todo, hitl, done, error. Supports `?from_id=` for reconnect. |
| HITL resume | `POST /api/chat/resume` | REST | Body: `{task_id, response_type, args?, action_requests?}` |
| List sessions | `GET /api/sessions` | REST | Returns `{sessions: [...]}` |
| Create session | `POST /api/sessions` | REST | Returns `{session_id}` |
| Delete session | `DELETE /api/sessions/{session_id}` | REST | Returns `{status: "success"}` |
| Active session | `GET /api/sessions/active` | REST | Returns `{active_session_id}` |
| Write memory | `POST /api/memory` | REST | Body: `{memory_info}` |

**CORS:** Backend already configured for `http://localhost:3000`. Frontend dev server runs on port 3000 by default.

## Sources

- [Next.js 15.5 blog](https://nextjs.org/blog/next-15-5) -- Turbopack beta builds, Biome support, stable Node.js middleware (MEDIUM confidence, verified via multiple search results)
- [Next.js 16 blog](https://nextjs.org/blog/next-16) -- Release date Oct 2025, breaking changes documented (HIGH confidence, multiple sources)
- [Next.js 16.2 blog](https://nextjs.org/blog/next-16-2) -- Latest stable 16.2.2 as of April 2026 (MEDIUM confidence)
- [shadcn/ui changelog - Feb 2026](https://ui.shadcn.com/docs/changelog/2026-02-radix-ui) -- Unified radix-ui package (HIGH confidence)
- [shadcn/ui changelog - Mar 2026](https://ui.shadcn.com/docs/changelog/2026-03-cli-v4) -- CLI v4 with skills for coding agents (HIGH confidence)
- [Zustand npm](https://www.npmjs.com/package/zustand) -- v5.0.12, 20M weekly downloads (HIGH confidence)
- [Tailwind CSS v4.0 blog](https://tailwindcss.com/blog/tailwindcss-v4) -- CSS-first config, auto content detection (HIGH confidence)
- [PkgPulse - React state management 2026](https://www.pkgpulse.com/blog/react-state-management-2026) -- Zustand market position (MEDIUM confidence)
- [MDN EventSource docs](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) -- Native SSE API, named events, auto-reconnect (HIGH confidence)
- [@microsoft/fetch-event-source GitHub](https://github.com/Azure/fetch-event-source) -- POST/header support comparison (HIGH confidence)
- Backend source code: `backend/app/api/chat.py`, `backend/app/infra/task_bus.py`, `backend/app/models/chat.py` -- SSE event format, API contracts (HIGH confidence, direct code inspection)

---
*Stack research for: Next.js frontend for AI Agent assistant*
*Researched: 2026-04-12*
