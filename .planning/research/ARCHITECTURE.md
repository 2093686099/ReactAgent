# Architecture Research

**Domain:** Next.js frontend integrating with FastAPI SSE backend (AI Agent chat)
**Researched:** 2026-04-12
**Confidence:** HIGH

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Next.js Frontend (port 3000)                      │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────────┐     │
│  │ Chat Page │  │ Sidebar   │  │ Todo      │  │ HITL Approval │     │
│  │ (SSE +    │  │ (Sessions)│  │ Panel     │  │ Cards         │     │
│  │ Messages) │  │           │  │           │  │               │     │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └───────┬───────┘     │
│        │              │              │                │              │
│  ┌─────┴──────────────┴──────────────┴────────────────┴──────┐      │
│  │                    Chat Store (Zustand)                     │      │
│  │  messages[], status, todos[], interrupt, activeSession      │      │
│  └─────────────────────────┬──────────────────────────────────┘      │
│                            │                                         │
│  ┌─────────────────────────┴──────────────────────────────────┐      │
│  │                    API Client Layer                          │      │
│  │  apiClient (fetch wrappers) + useSSE hook (EventSource)     │      │
│  └─────────────────────────┬──────────────────────────────────┘      │
├─────────────────────────────┼────────────────────────────────────────┤
│                     HTTP / SSE (CORS)                                │
├─────────────────────────────┼────────────────────────────────────────┤
│                    FastAPI Backend (port 8001)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │ POST invoke  │  │ GET stream   │  │ POST resume  │               │
│  │ → task_id    │  │ → SSE events │  │ → resume     │               │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘               │
│         │                 │                 │                        │
│  ┌──────┴─────────────────┴─────────────────┴────────┐              │
│  │              Redis Streams (event bus)              │              │
│  └────────────────────────────────────────────────────┘              │
│  ┌──────────────┐  ┌──────────────┐                                  │
│  │ PostgreSQL   │  │ Redis        │                                  │
│  │ (checkpoint  │  │ (sessions +  │                                  │
│  │  + memory)   │  │  task meta)  │                                  │
│  └──────────────┘  └──────────────┘                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| API Client (`lib/api.ts`) | HTTP requests to FastAPI (invoke, resume, sessions, memory) | Thin `fetch` wrappers with error handling, typed responses |
| SSE Hook (`hooks/useSSE.ts`) | Connect to SSE stream, dispatch events to store, handle reconnection | Native `EventSource` + `from_id` reconnection logic |
| Chat Store (`stores/chat.ts`) | All chat state: messages, streaming status, todos, interrupts | Zustand store with action methods |
| Chat Page (`app/page.tsx`) | Main layout: sidebar + chat area + optional todo panel | Server component shell with client component children |
| Message List | Render message history with streaming AI response | Client component, subscribes to `messages` slice |
| Message Bubble | Single message with inline segments (text + tool indicators) | Pure component, renders `segments[]` array |
| HITL Card | Tool approval UI (approve/edit/reject buttons + arg editor) | Client component, dispatches resume via API client |
| Sidebar | Session list, create/switch/delete sessions | Client component, subscribes to `sessions` slice |
| Todo Panel | Real-time agent task plan display | Client component, subscribes to `todos` slice |

## Recommended Project Structure

```
frontend/
├── app/                        # Next.js App Router
│   ├── layout.tsx              # Root layout (fonts, providers)
│   ├── page.tsx                # Main chat page (server component shell)
│   └── globals.css             # Tailwind + global styles
├── components/                 # UI components
│   ├── chat/
│   │   ├── ChatArea.tsx        # Message list + input area container
│   │   ├── MessageList.tsx     # Scrollable message container
│   │   ├── MessageBubble.tsx   # Single message (segments rendering)
│   │   ├── TextSegment.tsx     # Markdown text segment
│   │   ├── ToolSegment.tsx     # Tool call indicator (calling/done)
│   │   ├── ChatInput.tsx       # User input form
│   │   └── StreamingDots.tsx   # Typing indicator
│   ├── hitl/
│   │   ├── HITLCard.tsx        # Approval card container
│   │   ├── ApproveButton.tsx   # One-click approve
│   │   ├── EditPanel.tsx       # JSON editor for tool args
│   │   └── RejectDialog.tsx    # Reject with optional message
│   ├── sidebar/
│   │   ├── Sidebar.tsx         # Session list container
│   │   ├── SessionItem.tsx     # Single session row
│   │   └── NewSessionButton.tsx
│   ├── todo/
│   │   └── TodoPanel.tsx       # Agent task plan display
│   └── ui/                     # Shared primitives (shadcn/ui)
├── hooks/
│   ├── useSSE.ts               # SSE connection management
│   └── useAutoScroll.ts        # Auto-scroll to bottom on new messages
├── stores/
│   └── chat.ts                 # Zustand chat store
├── lib/
│   ├── api.ts                  # API client (fetch wrappers)
│   ├── sse-parser.ts           # SSE event → store action mapping
│   └── types.ts                # Shared TypeScript types
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

### Structure Rationale

- **`app/` minimal:** Only routing concern. One page (chat), one layout. No API routes needed -- backend is separate.
- **`components/chat/`:** Domain-specific components grouped by feature, not by type. `MessageBubble` is the most complex component (segments rendering).
- **`components/hitl/`:** Isolated because HITL is a distinct interaction mode with its own state flow.
- **`hooks/`:** Custom hooks separated from components. `useSSE` is the most critical hook -- it bridges SSE events to the Zustand store.
- **`stores/`:** Single Zustand store file. Chat state is unified -- messages, status, todos, interrupts are all interdependent and must update atomically.
- **`lib/`:** Pure logic with no React dependencies. API client, types, and the SSE-to-action mapping are testable without rendering.

## Architectural Patterns

### Pattern 1: SSE Event Dispatch via Zustand Actions

**What:** SSE events from the backend are dispatched as Zustand store actions. The `useSSE` hook listens to EventSource events and calls store methods directly. Components subscribe to store slices and re-render only when their slice changes.

**When to use:** Always -- this is the core data flow pattern for the entire app.

**Trade-offs:**
- Pro: Clean separation. SSE logic is in a hook, state mutations are in the store, components only read.
- Pro: Zustand's selector-based subscriptions prevent unnecessary re-renders during high-frequency token streaming.
- Con: Slightly more indirection than putting SSE logic directly in components.

**Example:**
```typescript
// stores/chat.ts
interface ChatState {
  messages: Message[];
  status: 'idle' | 'streaming' | 'interrupted' | 'error';
  currentTaskId: string | null;
  todos: Todo[];
  interrupt: InterruptData | null;

  // Actions
  appendToken: (text: string) => void;
  addToolSegment: (name: string, status: string) => void;
  setInterrupt: (data: InterruptData) => void;
  setTodos: (todos: Todo[]) => void;
  finishMessage: (fullText: string) => void;
  addUserMessage: (text: string) => void;
}

// hooks/useSSE.ts
function useSSE(taskId: string | null) {
  const appendToken = useChatStore(s => s.appendToken);
  const addToolSegment = useChatStore(s => s.addToolSegment);
  // ... other actions

  useEffect(() => {
    if (!taskId) return;
    const url = `${API_BASE}/api/chat/stream/${taskId}?from_id=0`;
    const es = new EventSource(url);

    es.addEventListener('token', (e) => {
      const { text } = JSON.parse(e.data);
      appendToken(text);
    });
    es.addEventListener('tool', (e) => {
      const { name, status } = JSON.parse(e.data);
      addToolSegment(name, status);
    });
    es.addEventListener('done', (e) => {
      const { message } = JSON.parse(e.data);
      finishMessage(message);
      es.close();
    });
    // ... hitl, todo, error handlers

    return () => es.close();
  }, [taskId]);
}
```

### Pattern 2: Segments-Based Message Model

**What:** Each AI message contains a `segments` array where text and tool calls are interleaved in order of occurrence. A `MessageBubble` component renders segments sequentially -- text as markdown, tool calls as inline indicators. This matches the backend's streaming order: tokens and tool events arrive interleaved.

**When to use:** For all AI assistant messages. User messages are always plain text (single text segment).

**Trade-offs:**
- Pro: Tool calls appear inline within the message flow, not as separate bubbles -- matches ChatGPT/Claude UI patterns.
- Pro: Naturally maps to the SSE event stream order.
- Con: More complex rendering logic than flat text messages.

**Example:**
```typescript
// lib/types.ts
type Segment =
  | { type: 'text'; content: string }
  | { type: 'tool'; name: string; status: 'calling' | 'done' };

interface Message {
  id: string;
  role: 'user' | 'assistant';
  segments: Segment[];
  timestamp: number;
}

// components/chat/MessageBubble.tsx
function MessageBubble({ message }: { message: Message }) {
  return (
    <div className={message.role === 'user' ? 'ml-auto' : 'mr-auto'}>
      {message.segments.map((seg, i) =>
        seg.type === 'text'
          ? <TextSegment key={i} content={seg.content} />
          : <ToolSegment key={i} name={seg.name} status={seg.status} />
      )}
    </div>
  );
}
```

### Pattern 3: Invoke-Stream-Resume Lifecycle

**What:** Each user interaction follows a 3-step lifecycle:
1. **Invoke:** POST `/api/chat/invoke` returns `task_id`, store creates placeholder assistant message, sets status to `streaming`.
2. **Stream:** `useSSE` connects to `GET /api/chat/stream/{task_id}`, events fill the placeholder message.
3. **Resume (conditional):** If `hitl` event arrives, status becomes `interrupted`, HITL card appears. User action triggers POST `/api/chat/resume`, same `task_id` continues streaming.

**When to use:** Every user message follows this flow. Resume is optional (only when HITL interrupt occurs).

**Trade-offs:**
- Pro: Clean lifecycle. Each state transition is explicit.
- Pro: Same SSE connection pattern for both invoke and resume -- after resume, the stream continues on the same `task_id`.
- Con: Need to handle edge cases (user sends new message while streaming, network drops mid-stream).

## Data Flow

### Message Send Flow

```
User types message → ChatInput.onSubmit()
    ↓
addUserMessage(text)          ← Store: append user message
    ↓
POST /api/chat/invoke         ← API Client: {session_id, query}
    ↓
Response: {task_id}           ← Store: set currentTaskId, status='streaming'
    ↓                           ← Store: append empty assistant message
useSSE(taskId) activates      ← Hook: new EventSource connection
    ↓
SSE event: token {text: "你"} ← Store: appendToken() → last message.segments[last].content += "你"
SSE event: token {text: "好"} ← Store: appendToken() → accumulate
SSE event: tool {name, calling}← Store: addToolSegment() → push new tool segment
SSE event: tool {name, done}  ← Store: updateToolSegment() → update status
SSE event: token {text: "..."}← Store: appendToken() → new text segment after tool
SSE event: done {message}     ← Store: finishMessage(), status='idle'
                                ← Hook: es.close()
```

### HITL Interrupt Flow

```
SSE event: hitl {action_requests, ...}
    ↓
Store: setInterrupt(data), status='interrupted'
    ↓
HITLCard renders with tool call details
    ↓
User clicks Approve / Edit / Reject
    ↓
POST /api/chat/resume {task_id, response_type, args?}
    ↓
Response: {task_id, status: running}
    ↓
Store: clearInterrupt(), status='streaming'
    ↓
useSSE continues on same taskId (stream resumes from Redis Stream)
    ↓
SSE events continue → normal flow
```

### SSE Reconnection Flow

```
EventSource connection drops (network error)
    ↓
EventSource.onerror fires
    ↓
Hook: close current EventSource
    ↓
Hook: setTimeout with backoff (1s → 2s → 4s, max 30s)
    ↓
Hook: new EventSource with from_id = lastEventId
    ↓
Backend: read_events(task_id, from_id=lastId) resumes from that point
    ↓
No duplicate events, no gaps
```

### State Management

```
Zustand Store (single source of truth)
    ├── messages: Message[]           ← MessageList subscribes
    ├── status: StreamStatus          ← ChatInput subscribes (disable while streaming)
    ├── currentTaskId: string | null  ← useSSE subscribes (connect/disconnect)
    ├── todos: Todo[]                 ← TodoPanel subscribes
    ├── interrupt: InterruptData      ← HITLCard subscribes
    ├── sessions: Session[]           ← Sidebar subscribes
    └── activeSessionId: string       ← Multiple components subscribe
```

### Key Data Flows

1. **Token streaming:** SSE `token` events arrive at ~50-100ms intervals. Each triggers `appendToken()` which modifies only the last segment of the last message. Zustand's referential equality check ensures only `MessageList` (and specifically the last `MessageBubble`) re-renders.

2. **Session switching:** User clicks different session in sidebar. Store resets messages/status/todos/interrupt. If a stream was active, `useSSE` cleanup closes the EventSource. New session's message history is loaded (future: from backend endpoint or local cache).

3. **HITL flow:** `hitl` SSE event pauses the stream (backend stops publishing). Store holds interrupt data. User action triggers resume POST, which causes backend to resume agent and continue publishing events to the same Redis Stream. The SSE connection (or a new one for same task_id) picks up from where it left off.

## Integration Points with Existing Backend

### Backend API Surface (Already Implemented)

| Endpoint | Method | Frontend Use | Notes |
|----------|--------|-------------|-------|
| `/api/chat/invoke` | POST | Send user message | Returns `{task_id, session_id, status}` |
| `/api/chat/stream/{task_id}` | GET | SSE event stream | `from_id` query param for reconnection |
| `/api/chat/resume` | POST | HITL decision | `{task_id, response_type, args?, action_requests?}` |
| `/api/sessions` | GET | List user sessions | Returns `{sessions: [...]}` |
| `/api/sessions/active` | GET | Get last active session | Returns `{active_session_id}` |
| `/api/sessions` | POST | Create new session | Returns `{session_id}` |
| `/api/sessions/{id}` | DELETE | Delete session | Returns `{status: "success"}` |
| `/api/memory` | POST | Write long-term memory | `{memory_info}` |
| `/api/memory` | GET | Read memories | Returns memory entries |
| `/health` | GET | Health check | `{status: "ok"}` |

### SSE Event Types (Already Implemented)

| Event | Data Shape | Frontend Action |
|-------|-----------|-----------------|
| `token` | `{text: string}` | Append to current assistant message text segment |
| `tool` | `{name: string, status: "calling"\|"done"}` | Add/update tool segment in current message |
| `hitl` | `{action_requests: [...], ...}` | Set interrupt state, show HITL card |
| `todo` | `{todos: [...]}` | Update todo panel |
| `done` | `{message: string}` | Finalize message, close SSE connection |
| `error` | `{message: string}` | Show error state, close SSE connection |

### CORS (Already Configured)

The backend (`backend/app/main.py:51-57`) already has CORS configured for `http://localhost:3000` with credentials, all methods, and all headers. No changes needed.

### Critical Integration Detail: SSE Reconnection and `from_id`

**Finding:** The backend's SSE endpoint uses `from_id` as a **query parameter** (`GET /api/chat/stream/{task_id}?from_id=0`), not the standard `Last-Event-ID` header. The native browser `EventSource` sends `Last-Event-ID` as a header on automatic reconnection, which the backend ignores.

**Implication:** Native `EventSource` auto-reconnection will NOT resume correctly -- it will re-read from `from_id=0` (the default), causing duplicate events.

**Solution (two options):**

1. **Backend fix (recommended):** Add `Last-Event-ID` header reading to the stream endpoint. One line change: `from_id = request.headers.get("Last-Event-ID", from_id)`. This makes native `EventSource` auto-reconnect work perfectly.

2. **Frontend workaround:** Implement manual reconnection in the `useSSE` hook. On `onerror`, close the EventSource, then create a new one with the last received event ID as `from_id` query parameter. Loses native auto-reconnect but works with current backend.

**Recommendation:** Do both. Backend reads the header as primary, falls back to query param. Frontend tracks `lastEventId` as defense-in-depth.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 user (current) | Single Next.js dev server + single FastAPI process. No optimization needed. |
| 10-50 concurrent sessions | Add message history persistence/loading from backend. Consider message virtualization if sessions accumulate 500+ messages. |
| Production deployment | Next.js on Vercel/static export + FastAPI behind nginx. SSE needs `X-Accel-Buffering: no` (already set in backend). Add `proxy_buffering off` in nginx config. |

### Scaling Priorities

1. **First bottleneck:** Message rendering performance. Long conversations (100+ messages) with complex segments will slow down. Fix: virtualized list (`react-window` or `@tanstack/virtual`), memoized `MessageBubble`.
2. **Second bottleneck:** SSE connection limits. Browsers limit ~6 concurrent connections per domain. Not an issue for single-user, but if tabs multiply, connections pile up. Fix: close SSE on tab blur, reconnect on focus.

## Anti-Patterns

### Anti-Pattern 1: useState for Streaming Tokens

**What people do:** Use `useState` + `setMessages(prev => [...prev])` inside the SSE event handler to accumulate tokens.
**Why it's wrong:** Creates a new array reference on every token (~50-100ms), causing the entire message list to re-render. Stale closure bugs when multiple rapid updates race. React batching helps but doesn't eliminate the problem.
**Do this instead:** Zustand store with `appendToken()` action that mutates only the last message's last segment in place, then triggers a shallow re-render. Components use selectors to subscribe only to what they need.

### Anti-Pattern 2: Putting SSE Logic in Components

**What people do:** Create EventSource directly in the ChatArea component's useEffect, parse events inline, and setState directly.
**Why it's wrong:** Mixes transport concerns with UI rendering. Hard to test. Hard to reuse. Component becomes responsible for connection lifecycle, event parsing, and state management simultaneously.
**Do this instead:** `useSSE` hook handles connection lifecycle only. `sse-parser.ts` maps events to store actions. Store handles state. Component just renders.

### Anti-Pattern 3: Reconnecting Without `from_id`

**What people do:** On SSE disconnect, reconnect to the same URL without specifying where to resume.
**Why it's wrong:** Backend defaults to `from_id=0`, replaying ALL events from the start. Duplicate tokens appear in the UI. If the message was partially streamed, the user sees it twice.
**Do this instead:** Track `lastEventId` in the `useSSE` hook. On reconnect, pass it as `from_id` query parameter (and/or rely on `Last-Event-ID` header after backend fix).

### Anti-Pattern 4: Multiple EventSource Connections

**What people do:** Don't close the previous EventSource before opening a new one (e.g., when user sends a new message while previous stream is active, or when switching sessions).
**Why it's wrong:** Browser connection limit exhaustion. Events from old streams interfere with current state. Memory leak.
**Do this instead:** `useSSE` hook's cleanup function always calls `es.close()`. Store has explicit `cancelCurrentStream()` action that sets `currentTaskId = null`, triggering hook cleanup.

### Anti-Pattern 5: Rendering Markdown on Every Token

**What people do:** Run markdown-to-HTML conversion on every token event while streaming.
**Why it's wrong:** Markdown parsing is expensive. At 50ms token intervals, you're running the parser 20 times/second. Incomplete markdown (e.g., half a code block) produces broken HTML.
**Do this instead:** During streaming, render raw text (or minimal inline formatting). Run full markdown rendering only after the `done` event. Alternative: throttle markdown rendering to every 200-300ms during streaming.

## Sources

- Backend source code: `backend/app/api/chat.py`, `backend/app/infra/task_bus.py`, `backend/app/main.py`, `backend/app/core/streaming.py`
- [MDN EventSource API](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)
- [MDN Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- [SSE Practical Guide](https://tigerabrodi.blog/server-sent-events-a-practical-guide-for-the-real-world)
- [Streaming APIs with FastAPI and Next.js](https://sahansera.dev/streaming-apis-python-nextjs-part1/)
- [React State Management 2025](https://www.developerway.com/posts/react-state-management-2025)
- [AI UI Patterns](https://www.patterns.dev/react/ai-ui-patterns/)
- [React Streaming Chat Stale State Fix](https://www.technetexperts.com/react-stream-state/)
- [FastAPI CORS Documentation](https://fastapi.tiangolo.com/tutorial/cors/)

---
*Architecture research for: Next.js frontend SSE integration with FastAPI AI Agent backend*
*Researched: 2026-04-12*
