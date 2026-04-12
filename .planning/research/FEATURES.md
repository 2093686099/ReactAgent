# Feature Research

**Domain:** AI Agent Chat Frontend (Next.js) with Tool Calling, HITL Approval, SSE Streaming
**Researched:** 2026-04-12
**Confidence:** HIGH (based on existing backend protocol analysis + industry pattern research)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist after using ChatGPT/Claude/Copilot. Missing any of these makes the product feel broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **SSE streaming text rendering** | Every AI chat product streams token-by-token since 2023. Waiting for full response feels broken. | MEDIUM | Backend already emits `token` events. Frontend needs incremental DOM update + auto-scroll. Use `fetch()` + `ReadableStream` (not `EventSource`) because invoke is POST. |
| **Markdown rendering with code highlighting** | AI outputs markdown (headings, lists, code blocks, tables). Raw text is unusable. | MEDIUM | Use `streamdown` (Vercel, purpose-built for streaming markdown) or `react-markdown` + `rehype-highlight`. Must handle incomplete markdown chunks gracefully during streaming. |
| **Chat message list (user/AI bubbles)** | Core interaction paradigm. User messages right-aligned, AI messages left-aligned with avatar. | LOW | Standard layout. Key detail: AI messages use the `segments` model (text + inline tool indicators in same bubble, per PROJECT.md decision). |
| **Text input with submit** | Must support Enter to send, Shift+Enter for newline, disabled state while AI is responding. | LOW | Single `<textarea>` with auto-resize. Disable during active stream. |
| **Session sidebar (list/create/switch/delete)** | Users expect conversation history management. Backend already has `GET /api/sessions`, `POST /api/sessions`, `DELETE /api/sessions/{id}`. | MEDIUM | Left sidebar, collapsible. Sessions sorted by last activity. Active session highlighted. Session titles auto-generated from first message or editable. |
| **Session switching without data loss** | Switching sessions must preserve scroll position and not lose draft input. | MEDIUM | Store per-session UI state (scroll position, draft text) in React state or zustand store. Clear SSE connection on switch, establish new one if task is running. |
| **HITL approval cards (approve/edit/reject)** | Core product differentiator -- dangerous tool calls must be approved. Backend emits `hitl` events with tool call details. | HIGH | Approval card replaces the normal AI bubble tail. Shows tool name, args (formatted JSON), three action buttons. Edit mode needs inline JSON editor for args. Resume via `POST /api/chat/resume`. |
| **Tool call indicators (inline)** | Users need to see what the AI is doing when it calls tools. Backend emits `tool` events with `{name, status: "calling"/"done"}`. | MEDIUM | Per PROJECT.md segments model: tool indicators appear inline within AI message bubble as collapsible chips/badges. Show spinner for "calling", checkmark for "done". |
| **Loading/thinking states** | Users need feedback that AI is processing before first token arrives. | LOW | Typing indicator (animated dots or pulse) between invoke and first `token` event. Per-tool "calling" spinner. |
| **Error display** | Backend emits `error` events. Graceful display is mandatory. | LOW | Error banner or inline error message in chat. Include retry button that re-invokes with same query. |
| **Auto-scroll with user override** | Chat must scroll to bottom as tokens stream in, but stop if user scrolls up to read. | MEDIUM | "Stick to bottom" logic: auto-scroll while user is at bottom; pause if user scrolls up; show "scroll to bottom" floating button. This is a common source of bugs -- use `IntersectionObserver` on a sentinel element at the bottom. |
| **SSE reconnection on disconnect** | Network drops happen. Must reconnect and resume from last event. | MEDIUM | Backend supports `from_id` query param on `GET /api/chat/stream/{task_id}` for resuming. Track `Last-Event-ID` from SSE, reconnect with it. Exponential backoff (max 3 retries). |
| **Responsive layout (desktop)** | Per PROJECT.md: desktop-first, mobile is out of scope. But must handle different desktop widths. | LOW | Sidebar collapsible on narrow viewports. Chat area fills remaining width. Max-width on message bubbles (~700px) for readability. |

### Differentiators (Competitive Advantage)

Features that align with the project's core value of "agent transparency and human control." Not expected by all users, but create real value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Todo/task planning panel** | Real-time visibility into agent's plan. Backend emits `todo` events from TodoListMiddleware. Shows what agent plans to do before/while doing it. No consumer AI product exposes this well. | MEDIUM | Side panel or collapsible section showing todo items with status (pending/in_progress/completed). Updates live via SSE `todo` events. Checklist visualization with progress bar. |
| **HITL edit mode with structured arg editing** | Beyond simple approve/reject: letting users modify tool arguments before execution. Most AI products only offer approve/reject. | HIGH | JSON editor for tool args (use `@monaco-editor/react` inline or a simpler key-value form for common tools). Must construct `ResumeRequest` with `response_type: "edit"` and `args: {edited_args: {...}}`. |
| **Tool call detail expansion** | Collapsible detail view showing full tool args and results. Goes beyond the inline indicator chip. | LOW | Click on tool indicator chip to expand and see full args (calling) or result summary (done). Helps debugging and builds trust. |
| **Keyboard shortcuts** | Power user efficiency: Ctrl+N (new session), Ctrl+K (search sessions), Escape (cancel/close panels). | LOW | Global keyboard handler. Document in a help modal (Ctrl+?). |
| **Copy code blocks** | One-click copy button on code blocks in AI responses. Standard in ChatGPT/Claude but often missing in custom builds. | LOW | Overlay button on hover over `<pre>` blocks. Use `navigator.clipboard.writeText()`. |
| **Message actions (copy/retry)** | Copy full AI response, retry last message. | LOW | Hover actions on message bubbles. Copy to clipboard, retry re-invokes with same query in same session. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems for this specific project.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Multi-user auth (JWT/OAuth)** | "Real apps need login" | PROJECT.md explicitly out of scope. Single-user personal assistant. Adding auth adds complexity to every API call, session model, and state management -- for one user. Backend already stubs `get_current_user`. | Keep the stub. Architecture supports future auth injection without frontend changes (just add token to fetch headers). |
| **Voice input/output** | "Modern AI assistants support voice" | Significant complexity (speech-to-text, text-to-speech, audio streaming). This is a tool-calling agent assistant, not a conversational voice bot. Value is low for the use case. | Defer entirely. Not in any phase. |
| **File upload/attachments** | "ChatGPT supports image/file upload" | Backend has no file upload endpoint. Agent tools operate on server-side files. Adding multimodal upload requires backend changes, storage, and new tool definitions. | Defer until backend supports it. Agent already has `read_file`/`write_file` tools for server-side files. |
| **Message editing/branching** | "Let me edit my previous message" | Requires re-running agent from a checkpoint branch. Backend checkpointer supports this in theory, but no API exists for "fork from message N." Adds massive UI complexity (tree navigation). | Simple retry of last message is sufficient for v1. |
| **Real-time collaborative editing** | "Multiple users viewing same session" | Single-user product. WebSocket complexity for zero benefit. SSE is server-to-client only, which is exactly right for this use case. | Not applicable. |
| **Drag-and-drop session organization** | "Let me organize conversations into folders" | Over-engineering for personal use. Session list with search is sufficient. Folder management adds CRUD complexity for marginal value. | Flat session list sorted by recency. Add search if list grows large. |
| **Generative UI (agent renders custom components)** | "Agent should render charts/forms dynamically" | Requires a component registry, security sandboxing, and significant protocol changes. The 2026 A2UI standard is still early stage. | Keep to markdown + structured tool cards. If agent produces data, render as formatted markdown tables or code blocks. |
| **Offline support / PWA** | "Work without internet" | Agent execution is server-side. No meaningful offline capability for an AI chat app. Service worker adds complexity for caching static assets only. | Standard web app. No PWA. |

## Feature Dependencies

```
[SSE streaming text]
    |-- requires --> [Chat message list]
    |-- requires --> [Markdown rendering]
    |-- requires --> [Auto-scroll]
    |-- requires --> [Loading states]

[HITL approval cards]
    |-- requires --> [Tool call indicators]
    |-- requires --> [SSE streaming (hitl event handling)]
    |-- requires --> [Chat message list (card placement)]

[HITL edit mode]
    |-- requires --> [HITL approval cards (base approve/reject)]

[Session switching]
    |-- requires --> [Session sidebar]
    |-- requires --> [SSE reconnection (switch active stream)]

[Todo panel]
    |-- requires --> [SSE streaming (todo event handling)]
    |-- independent of --> [Chat message list (separate panel)]

[Tool call detail expansion]
    |-- requires --> [Tool call indicators (base chips)]

[Message actions (copy/retry)]
    |-- requires --> [Chat message list]
    |-- requires --> [SSE streaming (retry triggers new invoke)]
```

### Dependency Notes

- **HITL approval cards require tool call indicators:** The approval card is an extension of the tool indicator -- when backend emits `hitl` event, the most recent tool indicator transitions from "calling" to "awaiting approval" state, and the approval card UI appears.
- **HITL edit requires base approval:** Edit mode is a superset of approve/reject. Build approve/reject first, then add the arg editor.
- **Session switching requires SSE management:** Switching sessions means closing the current `EventSource`/fetch stream and potentially opening a new one if the target session has a running task. Must handle cleanup to avoid memory leaks.
- **Todo panel is independent of chat:** It reads from the same SSE stream but renders in a separate panel. Can be built in parallel with chat features.
- **Markdown rendering is foundational:** Every AI message passes through the markdown renderer. Must be correct and performant before adding other message features.

## MVP Definition

### Launch With (v1)

Minimum viable product -- what makes this usable as a daily personal assistant.

- [ ] **Chat message list with streaming** -- Core interaction. SSE connection, token accumulation, markdown rendering, auto-scroll. Without this, nothing works.
- [ ] **Text input with submit** -- User must be able to type and send. Auto-resize, Enter/Shift+Enter, disabled during streaming.
- [ ] **Inline tool call indicators** -- Agent frequently calls tools. Users must see "searching...", "writing file..." inline in the AI bubble (segments model).
- [ ] **HITL approve/reject cards** -- Core safety feature. Without approval, dangerous tools cannot execute. Approve and reject are the minimum; edit can be deferred.
- [ ] **Basic session sidebar** -- List sessions, create new, switch between them, delete. Sorted by recency.
- [ ] **Error handling** -- Display `error` SSE events gracefully. Show retry button.
- [ ] **Loading/thinking indicator** -- Visual feedback between submit and first token.

### Add After Validation (v1.x)

Features to add once core chat loop is solid and daily-drivable.

- [ ] **Todo panel** -- Once streaming and HITL are stable, add the task planning panel. Trigger: agent starts producing `todo` events regularly and user wants visibility.
- [ ] **HITL edit mode** -- Once approve/reject is working, add the ability to modify tool args before execution. Trigger: user frequently wants to tweak tool parameters rather than outright reject.
- [ ] **Tool call detail expansion** -- Click to see full args/results. Trigger: user wants to understand what tools did beyond the status chip.
- [ ] **Keyboard shortcuts** -- Power user efficiency. Trigger: daily use reveals friction in mouse-only workflows.
- [ ] **Copy code blocks** -- Trigger: AI produces code and user wants to copy it quickly.
- [ ] **Message actions (copy/retry)** -- Trigger: user wants to retry failed messages or copy AI responses.
- [ ] **SSE reconnection with resume** -- Trigger: network instability causes lost events during long agent runs.

### Future Consideration (v2+)

Features to defer until the product is proven useful.

- [ ] **Session search** -- Defer until session count exceeds ~50 and scrolling becomes impractical.
- [ ] **Long-term memory UI** -- Backend has `POST /api/memory` and `GET /api/memory`. A UI panel to view/manage stored memories. Defer until memory system is validated in daily use.
- [ ] **System prompt customization** -- Backend supports `system_message` in ChatRequest. UI to set/switch system prompts per session.
- [ ] **Dark mode** -- Theme toggle. Nice but not essential for personal use.
- [ ] **Multi-LLM selector** -- Backend supports multiple LLM providers. UI dropdown to switch models per session.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| SSE streaming text rendering | HIGH | MEDIUM | P1 |
| Markdown + code highlighting | HIGH | MEDIUM | P1 |
| Chat message list (segments model) | HIGH | LOW | P1 |
| Text input with submit | HIGH | LOW | P1 |
| Inline tool call indicators | HIGH | MEDIUM | P1 |
| HITL approve/reject cards | HIGH | HIGH | P1 |
| Session sidebar (CRUD) | HIGH | MEDIUM | P1 |
| Loading/thinking states | MEDIUM | LOW | P1 |
| Error display + retry | MEDIUM | LOW | P1 |
| Auto-scroll with user override | MEDIUM | MEDIUM | P1 |
| Todo panel | MEDIUM | MEDIUM | P2 |
| HITL edit mode (arg editing) | MEDIUM | HIGH | P2 |
| Tool call detail expansion | MEDIUM | LOW | P2 |
| SSE reconnection | MEDIUM | MEDIUM | P2 |
| Keyboard shortcuts | LOW | LOW | P2 |
| Copy code blocks | LOW | LOW | P2 |
| Message actions (copy/retry) | LOW | LOW | P2 |
| Session search | LOW | LOW | P3 |
| Long-term memory UI | LOW | MEDIUM | P3 |
| Dark mode | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for launch -- without these the product is not usable as a daily assistant
- P2: Should have -- add iteratively after core is stable
- P3: Nice to have -- defer until validated through use

## Competitor Feature Analysis

| Feature | ChatGPT | Claude.ai | Cursor/Copilot Chat | Our Approach |
|---------|---------|-----------|---------------------|--------------|
| Streaming text | Token-by-token with markdown | Token-by-token with markdown | Token-by-token | SSE `token` events -> incremental markdown render |
| Tool call display | Collapsible "Used tool" blocks between messages | "Analyzing..." inline indicator | Inline in response | **Segments model**: tool indicators inline within AI bubble, not separate blocks. More compact. |
| HITL approval | Not exposed (tools auto-execute) | Not exposed | Not exposed (some tools auto-run) | **Key differentiator**: explicit approve/edit/reject cards for dangerous operations. This is our core safety UX. |
| Session management | Left sidebar, folders, search, archive | Left sidebar, projects, search | Per-file/workspace context | Left sidebar, flat list sorted by recency. Simpler than ChatGPT (no folders/archive). |
| Task planning visibility | Not visible | "Thinking" block (collapsed) | Step-by-step plan display | **Todo panel**: real-time checklist from TodoListMiddleware. More granular than Claude's thinking block. |
| Code blocks | Syntax highlighting, copy button, "Run" for some languages | Syntax highlighting, copy, Artifacts for interactive code | Inline with apply-to-file actions | Syntax highlighting + copy button. No run/apply (agent has its own `execute` tool). |
| Error handling | "Something went wrong" + retry | Error message + retry | Error in chat | Error message in chat + retry button. Include error detail from backend `error` event. |
| Markdown | Full GFM + LaTeX | Full GFM + LaTeX | Basic markdown | GFM via streamdown/react-markdown. LaTeX deferred (not common in agent tool output). |

## Backend Contract Summary (Frontend Must Implement)

This section maps backend API and SSE events to required frontend features.

### SSE Event Types (from `GET /api/chat/stream/{task_id}`)

| Event | Data Shape | Frontend Behavior |
|-------|-----------|-------------------|
| `token` | `{text: string}` | Append text to current AI message segment. Trigger markdown re-render. |
| `tool` | `{name: string, status: "calling"\|"done"}` | Insert/update tool indicator chip in AI message segments. "calling" = spinner, "done" = checkmark. |
| `todo` | `{todos: Array}` | Update todo panel with current task plan. Replace entire list (not incremental). |
| `hitl` | `{...interrupt_value}` | Show approval card. Pause further streaming display. Enable approve/edit/reject buttons. |
| `done` | `{message: string}` | Mark AI message as complete. Close SSE connection. Re-enable input. |
| `error` | `{...error_details}` | Show error inline. Close SSE connection. Show retry button. Re-enable input. |

### API Endpoints (frontend must call)

| Endpoint | When | Request | Response |
|----------|------|---------|----------|
| `POST /api/chat/invoke` | User sends message | `{session_id, query, system_message?}` | `{task_id, session_id, status}` then subscribe to SSE |
| `POST /api/chat/resume` | User approves/edits/rejects | `{task_id, response_type, args?, action_requests?}` | `{task_id, session_id, status}` then continue SSE |
| `GET /api/chat/stream/{task_id}` | After invoke/resume | Query param `from_id` for resume | SSE event stream |
| `GET /api/sessions` | Page load, sidebar refresh | None | `{sessions: [...]}` |
| `GET /api/sessions/active` | Page load | None | `{active_session_id: string}` |
| `POST /api/sessions` | User clicks "new session" | None | `{session_id: string}` |
| `DELETE /api/sessions/{id}` | User deletes session | None | `{status: "success"}` |

## Sources

- [AI UI Patterns - patterns.dev](https://www.patterns.dev/react/ai-ui-patterns/) -- React AI UI pattern catalog
- [AI Chat UI Best Practices - thefrontkit](https://thefrontkit.com/blogs/ai-chat-ui-best-practices) -- Chat UI design guidelines
- [AI SDK UI: Stream Protocols - Vercel](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol) -- SSE streaming protocol reference
- [assistant-ui GitHub](https://github.com/assistant-ui/assistant-ui) -- React AI chat library (composable primitives)
- [Streamdown - Vercel](https://github.com/vercel/streamdown) -- Streaming markdown renderer for AI
- [Next.js Markdown Chatbot with Memoization - Vercel](https://ai-sdk.dev/cookbook/next/markdown-chatbot-with-memoization) -- Memoized markdown rendering pattern
- [HITL Best Practices - Permit.io](https://www.permit.io/blog/human-in-the-loop-for-ai-agents-best-practices-frameworks-use-cases-and-demo) -- Human-in-the-loop UX patterns
- [HITL When to Use Agent Approval - Mastra](https://mastra.ai/blog/human-in-the-loop-when-to-use-agent-approval) -- Approval flow design
- [Designing for Autonomy: UX Principles for Agentic AI - UXmatters](https://www.uxmatters.com/mt/archives/2025/12/designing-for-autonomy-ux-principles-for-agentic-ai.php) -- Agent UX principles
- [How Agents Plan Tasks with To-Do Lists - Towards Data Science](https://towardsdatascience.com/how-agents-plan-tasks-with-to-do-lists/) -- Todo list planning pattern
- [A2UI: Agent-Driven Interfaces - Google](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/) -- Google's agent UI framework (early stage)
- [SSE in React - OneUpTime](https://oneuptime.com/blog/post/2026-01-15-server-sent-events-sse-react/view) -- SSE implementation patterns
- [Generative AI Chat - Cloudscape Design System](https://cloudscape.design/patterns/genai/generative-AI-chat/) -- AWS chat pattern reference
- [AI Chat UI Libraries Evaluation 2026 - DEV Community](https://dev.to/alexander_lukashov/i-evaluated-every-ai-chat-ui-library-in-2026-heres-what-i-found-and-what-i-built-4p10) -- Library comparison

---
*Feature research for: AI Agent Chat Frontend*
*Researched: 2026-04-12*
