---
phase: 11-todo-panel
plan: "01"
subsystem: test-fixtures
tags: [test-infra, checkpoint-factory, todos, wave-0]
dependency_graph:
  requires: []
  provides: [make_checkpoint_tuple(todos=...)]
  affects: [backend/tests/test_history.py, backend/tests/ (11-02 下游)]
tech_stack:
  added: []
  patterns: [SimpleNamespace duck-typing checkpoint fixture, optional param with sentinel None]
key_files:
  created: []
  modified:
    - backend/tests/fixtures/checkpoint_factory.py
    - backend/tests/conftest.py
decisions:
  - "todos=None 作 sentinel（不写键），区分 '从未 write_todos' 与 'todos 明确为空列表' 两种 checkpoint 状态"
  - "conftest._EXTERNAL_MODS 补 redis.exceptions —— Rule 3 阻塞修复，与既有 redis/redis.asyncio 同模式"
metrics:
  duration: "~5min"
  completed: "2026-04-22T00:23:51Z"
  tasks_completed: 1
  files_changed: 2
---

# Phase 11 Plan 01: 扩展 make_checkpoint_tuple 支持可选 todos 参数 Summary

**一句话：** 为 checkpoint fixture 加 `todos: list[dict] | None = None` 参数，三态语义（None/[]/[...]），8 条 test_history 测试全绿，为 11-02 集成测试铺路。

## What Was Built

`make_checkpoint_tuple` 扩展后签名：

```python
def make_checkpoint_tuple(messages: list[Any], todos: list[dict] | None = None):
    """
    todos=None → channel_values 不含 "todos" 键（模拟从未触发 write_todos 的 checkpoint）
    todos=[] → channel_values 含 "todos": []
    todos=[...] → channel_values 含 "todos": [...]
    """
    channel_values: dict = {"messages": messages}
    if todos is not None:
        channel_values["todos"] = todos
    return SimpleNamespace(checkpoint={"channel_values": channel_values})
```

既有 3 处单参数调用（test_history.py:124, 154, 192）不需修改，向后完全兼容。

## 既有测试通过证据

```
pytest tests/test_history.py -x -v
8 passed in 0.02s
```

全部 8 条测试通过，包含：
- test_messages_to_segments
- test_no_hitl_segment_in_history
- test_rejected_tool_pill
- test_long_history
- test_truncate_when_active_task
- test_no_truncate_when_no_active_task
- test_load_history_when_checkpointer_is_none
- test_load_history_when_no_checkpoint

## 11-02 下游调用方式示例

```python
from tests.fixtures.checkpoint_factory import make_checkpoint_tuple, make_human, make_ai

fake_todos = [{"content": "买牛奶", "status": "pending", "id": "t-1"}]

# 有 todos 的 checkpoint
ckpt_with_todos = make_checkpoint_tuple([make_human("hi")], todos=fake_todos)
assert ckpt_with_todos.checkpoint["channel_values"]["todos"] == fake_todos

# 模拟旧 checkpoint（从未 write_todos）
ckpt_no_todos = make_checkpoint_tuple([make_human("hi")])
assert "todos" not in ckpt_no_todos.checkpoint["channel_values"]

# todos 明确为空列表
ckpt_empty_todos = make_checkpoint_tuple([make_human("hi")], todos=[])
assert ckpt_empty_todos.checkpoint["channel_values"]["todos"] == []
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] conftest.py 缺 redis.exceptions mock 导致 pytest 无法加载**

- **Found during:** Task 1 验证阶段（运行 pytest 时）
- **Issue:** Phase 10 commit `78908e9` 引入 `from redis.exceptions import WatchError`（SessionService 乐观锁），但未同步 conftest.py `_EXTERNAL_MODS`，导致 pytest 加载 conftest 时抛 `ModuleNotFoundError: No module named 'redis.exceptions'`。自那时起 test_history 套件完全无法运行。
- **Fix:** 在 `_EXTERNAL_MODS` 列表加入 `"redis.exceptions"`，与既有 `"redis"` / `"redis.asyncio"` 同模式，一行改动。
- **Files modified:** `backend/tests/conftest.py`
- **Commit:** `1c17da2`

`backend/tests/fixtures/checkpoint_factory.py` 主体改动 commit: `2b7cb46`

## Known Stubs

无。

## Threat Flags

无（纯测试 fixture，无生产代码路径，无外部信任边界）。

## Self-Check: PASSED

- [x] `backend/tests/fixtures/checkpoint_factory.py` 存在且含 `todos: list[dict] | None = None`
- [x] commit `1c17da2` 存在（conftest 修复）
- [x] commit `2b7cb46` 存在（checkpoint_factory 扩展）
- [x] `pytest tests/test_history.py` → 8 passed
