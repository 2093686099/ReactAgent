---
phase: 260410-ne0
verified: 2026-04-10T00:00:00Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
---

# Task 260410-ne0: create_agent → create_deep_agent Migration Verification Report

**Task Goal:** 实施 07 迁移计划: create_agent → create_deep_agent
**Verified:** 2026-04-10
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Agent is created using create_deep_agent instead of create_agent | VERIFIED | `from deepagents import create_deep_agent` at line 9; `create_deep_agent(` called twice (invoke + resume); no `from langchain.agents import create_agent` present |
| 2 | MCP tools (amap) are assigned to researcher SubAgent, not the main agent | VERIFIED | `get_mcp_tools()` result passed exclusively to `SubAgent(name="researcher", tools=mcp_tools)` in both invoke and resume; main agent receives only `custom_tools` |
| 3 | Custom tools (book_hotel, multiply) remain on the main agent | VERIFIED | `get_custom_tools()` returns `[book_hotel, multiply]`; passed as `tools=custom_tools` to `create_deep_agent` top-level parameter |
| 4 | trimmed_messages_hook is removed and replaced by SummarizationMiddleware | VERIFIED | `trimmed_messages_hook`, `before_model`, `trim_messages` all absent from tasks.py; `SummarizationMiddleware(model=llm_chat, trigger=[("tokens", 3000), ("messages", 50)], keep=("messages", 20))` present in both invoke and resume |
| 5 | Deep Agents built-in tools (execute, write_file, edit_file) have HITL enforcement | VERIFIED | `get_hitl_config` sets `execute=True`, `write_file=True`, `edit_file=True`; also configures read_file, ls, glob, grep, write_todos, task as False |
| 6 | AgentResponse includes optional todos field | VERIFIED | `todos: Optional[List[Dict[str, str]]] = None` present at line 43 of models.py |
| 7 | Frontend displays todos when present in response | VERIFIED | Two display blocks confirmed: `display_session_info` (lines 307-318) and `process_agent_response_resume` (lines 629-641); both use consistent status_icon + cyan Panel |
| 8 | system_prompt is passed via create_deep_agent parameter, not in messages list | VERIFIED | invoke: `system_prompt=system_message` parameter in `create_deep_agent`; user-only message `{"role": "user", "content": query}` passed to stream; resume: no `system_prompt=` at main agent level (only SubAgent's own prompt) |

**Score:** 8/8 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `07_DeepAgentHILApiMultiSessionTask/utils/tools.py` | Split tool functions: get_mcp_tools() and get_custom_tools() | VERIFIED | Exports `get_mcp_tools` (async), `get_custom_tools` (sync), `get_hitl_config`; old `get_tools` fully removed |
| `07_DeepAgentHILApiMultiSessionTask/utils/models.py` | AgentResponse with todos field | VERIFIED | `todos: Optional[List[Dict[str, str]]] = None` present |
| `07_DeepAgentHILApiMultiSessionTask/utils/tasks.py` | Agent creation via create_deep_agent with SubAgent and SummarizationMiddleware | VERIFIED | Both invoke and resume use `create_deep_agent` with SubAgent researcher + SummarizationMiddleware |
| `07_DeepAgentHILApiMultiSessionTask/02_frontendServer.py` | Todos display in completed response panels | VERIFIED | Two locations with `任务规划` Panel; `status_icon` with `in_progress` present |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| utils/tasks.py | utils/tools.py | `from .tools import get_mcp_tools, get_custom_tools, get_hitl_config` | WIRED | Exact pattern present at line 18 |
| utils/tasks.py | deepagents | `from deepagents import create_deep_agent` | WIRED | Present at line 9 |
| utils/tasks.py | utils/models.py | `todos=result.get("todos")` | WIRED | Pattern appears twice (interrupted branch line 270, completed branch line 280) |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| utils/tasks.py (process_agent_result) | todos | `result.get("todos")` from agent final state | Yes — extracted from live agent state dict | FLOWING |
| 02_frontendServer.py | todos panel | `response.get("todos")` from API response JSON | Yes — sourced from AgentResponse.todos field | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All four files compile | `python -m py_compile` each file | All: OK | PASS |
| Old API absent | grep for create_agent, trimmed_messages_hook, before_model, trim_messages | All absent | PASS |
| New imports present | AST check for create_deep_agent, SubAgent, StoreBackend, SummarizationMiddleware | All present | PASS |
| todos extraction in both branches | `source.count('todos=result.get') >= 2` | 2 occurrences confirmed | PASS |
| todos display in 2 frontend locations | `source.count('任务规划') >= 2` | 2 occurrences confirmed | PASS |
| resume does not pass system_prompt to create_deep_agent top level | Manual inspection of lines 553-575 | Confirmed absent; SubAgent-level system_prompt is unrelated | PASS |

---

### Requirements Coverage

No `requirements:` array declared in PLAN frontmatter. Migration spec requirements verified against MIGRATION_PLAN.md success criteria instead.

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| MIGRATION_PLAN §1 | tasks.py: import changes, create_deep_agent, message construction, todos extraction, trimmed_messages_hook removal | SATISFIED | All items verified in tasks.py |
| MIGRATION_PLAN §2 | tools.py: split into get_mcp_tools + get_custom_tools + HITL built-in tools | SATISFIED | tools.py confirmed |
| MIGRATION_PLAN §3 | models.py: todos field | SATISFIED | models.py line 43 confirmed |
| MIGRATION_PLAN §4 | 02_frontendServer.py: todos display in 2 locations | SATISFIED | Lines 307-318 and 629-641 confirmed |

---

### Anti-Patterns Found

The following issues were identified (sourced from co-located REVIEW.md findings). They are below the blocker threshold for this migration goal.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| utils/tasks.py | 458, 585 | `result['messages']` bare KeyError risk | Warning | Crash if agent state omits messages key |
| utils/tasks.py | 532, 614 | session_manager guard absent in resume error path | Warning | NameError on Redis failure swallows original exception |
| 02_frontendServer.py | 598-610 | todos not shown in interrupted branch | Warning | User cannot see partial task plan during HITL interrupt |
| utils/tasks.py | 439, 566 | `StoreBackend()` without namespace isolation | Warning | Cross-user file visibility risk |
| 02_frontendServer.py | 834-838 | task_id not refreshed in history/no-tasks path | Warning | Stale task_id reuse |
| utils/tasks.py | 470, 598 | Commented-out debug code `# result=response.model_dump()` | Info | Noise only |

None of the above anti-patterns prevent the migration goal from being achieved. The core migration (create_agent → create_deep_agent) is complete and correct.

---

### Human Verification Required

The following behaviors require runtime validation and cannot be confirmed statically:

**1. End-to-end agent invocation with create_deep_agent**

- Test: Start the full stack (PostgreSQL, Redis, Celery worker, backend, frontend) and send a simple query ("你好")
- Expected: Agent responds via create_deep_agent without errors; no "module not found" for deepagents
- Why human: Runtime dependency (deepagents package) not importable without all infrastructure running

**2. SubAgent delegation (researcher)**

- Test: Send "北京到上海的路线" — a query requiring map tools
- Expected: Main agent delegates to researcher SubAgent via `task()` tool; researcher calls amap MCP tools; HITL fires for MCP tool call
- Why human: Requires live MCP server connection and agent execution

**3. TodoList middleware activation**

- Test: Send a complex multi-step query ("帮我规划北京三日游")
- Expected: `todos` field non-null in response; frontend displays "任务规划" panel with task entries
- Why human: Requires live agent execution to produce todos state

**4. SummarizationMiddleware replaces trimmed_messages_hook**

- Test: Run a long conversation exceeding 50 messages or 3000 tokens
- Expected: Context is summarized automatically; no manual trimming errors
- Why human: Requires sustained conversation load

---

### Gaps Summary

No blocking gaps. All 8 must-have truths verified. The migration from `create_agent` to `create_deep_agent` is structurally complete:

- Old API (`create_agent`, `trimmed_messages_hook`, `before_model`, `trim_messages`, `get_tools`) fully removed
- New API (`create_deep_agent`, `SubAgent`, `StoreBackend`, `SummarizationMiddleware`, `get_mcp_tools`, `get_custom_tools`) correctly wired
- `todos` field threaded end-to-end: models.py → tasks.py (both branches) → frontend (2 locations)
- HITL config covers all 9 Deep Agents built-in tools with correct dangerous/safe classification
- `system_prompt` correctly routed: via `create_deep_agent` parameter in invoke, absent (checkpointer restores) in resume

Five warning-level issues exist (documented in REVIEW.md) but none block the migration goal.

---

_Verified: 2026-04-10_
_Verifier: Claude (gsd-verifier)_
