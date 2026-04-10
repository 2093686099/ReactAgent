# Quick Task 260410-ne0: 实施 07 迁移计划: create_agent → create_deep_agent

**Completed:** 2026-04-10
**Status:** Needs Review (runtime verification pending)

## Changes Made

### utils/tools.py — Tool splitting + HITL config
- Replaced `get_tools()` (mixed MCP + custom) with two functions:
  - `get_mcp_tools()` (async) — returns Amap MCP tools for researcher SubAgent
  - `get_custom_tools()` (sync) — returns `book_hotel` + `multiply` for main Agent
- Updated `get_hitl_config(custom_tools)` with 9 Deep Agents built-in tool entries (execute/write_file/edit_file require HITL; read_file/ls/glob/grep/write_todos/task do not)

### utils/tasks.py — Core migration
- Replaced `from langchain.agents import create_agent` with `from deepagents import create_deep_agent`
- Added imports: `SubAgent`, `StoreBackend`, `SummarizationMiddleware`
- Removed `trimmed_messages_hook` (@before_model decorator + trim_messages) — replaced by `SummarizationMiddleware(model=llm_chat, trigger=[("tokens", 3000), ("messages", 50)], keep=("messages", 20))`
- `invoke_agent_task`: `create_deep_agent` with `system_prompt=system_message`, `SubAgent("researcher")` with MCP tools, `StoreBackend()`, messages reduced to user-only
- `resume_agent_task`: same pattern without `system_prompt` (checkpointer restores state)
- `process_agent_result`: added `todos=result.get("todos")` in both interrupted and completed branches

### utils/models.py — AgentResponse update
- Added `todos: Optional[List[Dict[str, str]]] = None` field

### 02_frontendServer.py — Todos display
- Added todos Panel (cyan border, "任务规划" title) in `process_agent_response_resume` completed branch
- Added todos Panel in `display_session_info` completed branch
- Consistent status icons: `[ ]` pending, `[~]` in_progress, `[x]` completed

## Files Not Changed (as planned)
- `01_backendServer.py` — FastAPI routes unchanged
- `utils/redis.py` — Redis session manager unchanged
- `utils/llms.py` — LLM initialization unchanged
- `utils/config.py` — No changes (debug switch deferred)

## Verification
- 8/8 must-haves verified (automated)
- 4 runtime behaviors need live testing (deepagents package load, SubAgent delegation, TodoList output, Summarization)
- Code review: 1 pre-existing critical (session_manager NameError), 4 warnings (3 pre-existing)
