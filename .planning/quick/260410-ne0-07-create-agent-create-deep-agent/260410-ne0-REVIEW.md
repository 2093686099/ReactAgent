---
phase: 260410-ne0-07-create-agent-create-deep-agent
reviewed: 2026-04-10T00:00:00Z
depth: quick
files_reviewed: 4
files_reviewed_list:
  - 07_DeepAgentHILApiMultiSessionTask/utils/tools.py
  - 07_DeepAgentHILApiMultiSessionTask/utils/tasks.py
  - 07_DeepAgentHILApiMultiSessionTask/utils/models.py
  - 07_DeepAgentHILApiMultiSessionTask/02_frontendServer.py
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Code Review: create_agent → create_deep_agent Migration

**Reviewed:** 2026-04-10
**Depth:** quick (pattern scan + migration spec verification)
**Files Reviewed:** 4
**Status:** issues_found

## Summary

The migration from `create_agent` to `create_deep_agent` is structurally complete. Old API symbols (`create_agent`, `trimmed_messages_hook`, `before_model`, `trim_messages`, `get_tools`) are fully removed. The new imports (`deepagents`, `SubAgent`, `StoreBackend`, `SummarizationMiddleware`) are in place. The `todos` field is correctly threaded through `models.py` → `tasks.py` → `02_frontendServer.py`. HITL config covers all dangerous built-in tools.

One critical bug is present: `process_agent_result` calls `session_manager` unconditionally after a `try/except` block that may have set `session_manager` to an uninitialized state in the error path of `resume_agent_task`. There are also four warning-level issues around `KeyError` crash risks, a namespace isolation gap flagged in the migration plan, inconsistent `todos` display coverage, and a missing `task_id` reset in `history` command flow.

---

## Critical Issues

### CR-01: `session_manager` used after scope in `resume_agent_task` error path

**File:** `07_DeepAgentHILApiMultiSessionTask/utils/tasks.py:614`

**Issue:** In `resume_agent_task`, `session_manager` is initialized inside `resume_invoke()` (line 532), but the `except` block at line 613 references `session_manager` without a guard. If `get_session_manager()` itself raises (e.g., Redis is unreachable), `session_manager` is never assigned, so the `except` block's `await session_manager.update_session(...)` call will raise a `NameError`, swallowing the original exception and leaving the task status permanently stuck at whatever state Redis had before the call.

The same pattern exists symmetrically in `invoke_agent_task` (line 487), but there `session_manager` is assigned earlier (line 381) before the DB pool is opened, so it is reachable. In `resume_agent_task`, `session_manager` is also assigned at line 532 (before the pool), so it is technically reachable — however the `finally` at line 634 calls `session_manager.close()` with no guard either. If `get_session_manager()` fails, this will also `NameError`.

**Fix:** Guard the `except`/`finally` blocks:
```python
except Exception as e:
    if session_manager is not None:
        await session_manager.update_session(...)
        await session_manager.set_task_status(...)
    raise e
finally:
    if session_manager is not None:
        await session_manager.close()
```
And initialize `session_manager = None` at the top of `resume_invoke()` and `run_invoke()`.

---

## Warnings

### WR-01: `KeyError` crash on `result['messages']` when agent state has no messages key

**File:** `07_DeepAgentHILApiMultiSessionTask/utils/tasks.py:458,585`

**Issue:** Both `invoke_agent_task` (line 458) and `resume_agent_task` (line 585) call `await parse_messages(result['messages'])` with a bare key access. If `create_deep_agent` returns a final state where `messages` is absent (e.g., the graph ended via an error branch that only emits `todos` or a subagent state), this will raise `KeyError` and fall into the `except` block, marking the task as failed even though the agent may have completed successfully.

**Fix:**
```python
await parse_messages(result.get('messages', []))
```

### WR-02: `todos` not displayed in the `interrupted` branch of `process_agent_response_resume`

**File:** `07_DeepAgentHILApiMultiSessionTask/02_frontendServer.py:598-610`

**Issue:** The migration spec (MIGRATION_PLAN.md section 4.1) instructs adding `todos` display in the `completed` branch of `process_agent_response_resume`, which is correctly implemented at lines 630-641. However the `interrupted` branch (lines 598-610) does not display `todos`. When the agent has partially completed a task plan and then hits a HITL interrupt, the user never sees which todos are `in_progress` or `completed`. This is inconsistent with `display_session_info` (line 308) which does show todos for an interrupted session.

**Fix:** After the `handle_tool_interrupt` call returns (or in its callee path), add the same `todos` panel display block. At minimum, add it in the `interrupted` branch before delegating to `handle_tool_interrupt`:
```python
if status == "interrupted":
    todos = response.get("todos")
    if todos:
        todo_lines = []
        status_icon = {"pending": "[ ]", "in_progress": "[~]", "completed": "[x]"}
        for todo in todos:
            icon = status_icon.get(todo.get("status", ""), "[ ]")
            todo_lines.append(f"  {icon} {todo.get('content', '')}")
        console.print(Panel("\n".join(todo_lines), title="[info]任务规划[/info]", border_style="cyan"))
    interrupt_data = response.get("interrupt_data", {})
    ...
```

### WR-03: `StoreBackend` has no namespace isolation — different users share the same file store

**File:** `07_DeepAgentHILApiMultiSessionTask/utils/tasks.py:439,566`

**Issue:** Both `invoke_agent_task` and `resume_agent_task` construct `StoreBackend()` with no namespace factory. The migration plan (section 七, risk row 5) explicitly flags this: "不同用户的文件可能互相可见". With the current code, every user's `write_file`/`read_file` operations share the same storage namespace. User A can read or overwrite files created by User B.

**Fix:** Pass a namespace factory keyed on `user_id`:
```python
backend=StoreBackend(namespace=lambda config: ("files", config["configurable"].get("user_id", "default"))),
```
This requires `user_id` to be threaded into `configurable` (alongside `thread_id`):
```python
config={"configurable": {"thread_id": task_id, "user_id": user_id}},
```

### WR-04: `task_id` not refreshed in `history` flow when user picks an existing session with no tasks

**File:** `07_DeepAgentHILApiMultiSessionTask/02_frontendServer.py:834-838`

**Issue:** When the `history` command is used, the user selects a `session_id` but there are no existing `task_ids` (lines 834-838). The code prints `f"将为你打开一个全新任务，任务ID为 {task_id}"` but `task_id` still holds whatever value it had from before (either the initial `str(uuid.uuid4())` at startup or the most recent task). A new UUID is not generated here, so the user may unknowingly reuse a stale `task_id`.

**Fix:**
```python
else:
    task_id = str(uuid.uuid4())   # generate fresh task_id
    has_active_session = False
    session_status = None
    console.print(f"[info]将为你打开一个全新任务，任务ID为 {task_id}[/info]")
    continue
```

---

## Info

### IN-01: Commented-out debug code left in production path

**File:** `07_DeepAgentHILApiMultiSessionTask/utils/tasks.py:470,598`

**Issue:** Two lines of commented-out code remain: `# result=response.model_dump(),` (lines 470 and 598). These are harmless but add noise and suggest the code was left in an intermediate state.

**Fix:** Remove the commented lines if the `filtered_data` approach is the intended final form.

### IN-02: `get_custom_tools()` recreates tool functions on every call

**File:** `07_DeepAgentHILApiMultiSessionTask/utils/tools.py:44-75`

**Issue:** `get_custom_tools()` defines `book_hotel` and `multiply` as nested functions decorated with `@tool` every time it is called. Both `invoke_agent_task` and `resume_agent_task` call it once per Celery task execution, so there is no practical hot-path concern. However, this is an unusual pattern that may confuse readers expecting module-level tool definitions. This matches the migration plan spec exactly, so it is not a regression.

**Fix (optional):** Move tool definitions to module level.

### IN-03: `process_agent_response_resume` and `process_agent_response` are misnamed relative to their roles

**File:** `07_DeepAgentHILApiMultiSessionTask/02_frontendServer.py:581,679`

**Issue:** `process_agent_response_resume` handles the full display/interrupt loop (called after polling completes), while `process_agent_response` is the lightweight function called immediately after `invoke_agent` that only extracts and returns `task_id`. The naming suggests the opposite relationship. A future developer adding logic to "the response handler" will likely edit the wrong function.

**Fix:** Rename for clarity, e.g., `display_agent_result` for the full display function and `extract_task_id_from_response` for the thin wrapper.

---

_Reviewed: 2026-04-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
