---
phase: 11-todo-panel
plan: "02"
subsystem: backend-history
tags: [backend, todos, history-endpoint, pydantic, test-coverage, wave-1]
dependency_graph:
  requires: [make_checkpoint_tuple(todos=...)]
  provides: [TodoModel, history.py todos 字段, test_history todos 覆盖]
  affects: [backend/app/core/history.py, backend/app/models/chat.py, backend/tests/test_history.py]
tech_stack:
  added: []
  patterns: [Pydantic Literal 枚举校验, channel_values dict 兜底读取, isinstance filter + dict comprehension]
key_files:
  created: []
  modified:
    - backend/app/models/chat.py
    - backend/app/core/history.py
    - backend/tests/test_history.py
    - .planning/phases/11-todo-panel/11-CONTEXT.md
decisions:
  - "路径 A：TodoModel 仅声明契约，端点不绑 response_model，改动面最小（CLAUDE.md §3 外科手术）"
  - "history.py 实际只有 3 个 return 分支（非计划描述的 4 个），session=None 路径继续走 checkpointer，无需独立分支"
  - "test_load_history_when_checkpointer_is_none 的精确相等断言改为字段级断言，避免未来新字段加入即破测试"
metrics:
  duration: "~10min"
  completed: "2026-04-22T00:30:00Z"
  tasks_completed: 3
  files_changed: 4
---

# Phase 11 Plan 02: 后端 todos 契约扩展 Summary

**一句话：** 新增 `TodoModel` Pydantic 声明，history.py 三处 return 分支透出 `todos` 字段，10 条 test_history 测试全绿（+2 新），CONTEXT.md D-08 border token 与 globals.css 对齐。

## What Was Built

### 新契约形状

**空 todos（checkpointer=None / ckpt_tuple=None / state 无 todos 键）：**
```json
{
  "messages": [],
  "todos": [],
  "active_task": null,
  "truncate_after_active_task": false
}
```

**非空 todos（state.todos 有内容）：**
```json
{
  "messages": [...],
  "todos": [
    {"content": "step A", "status": "completed"},
    {"content": "step B", "status": "in_progress"},
    {"content": "step C", "status": "pending"}
  ],
  "active_task": null,
  "truncate_after_active_task": false
}
```

### TodoModel 定义位置

`backend/app/models/chat.py:50-57`

```python
class TodoModel(BaseModel):
    """langchain TodoListMiddleware Todo TypedDict 的 Pydantic 镜像。"""
    content: str
    status: Literal["pending", "in_progress", "completed"]
```

### history.py 三处 return 分支修改

| 分支 | 位置 | 修改 |
|------|------|------|
| `db.checkpointer is None` | L129-135 | 加 `"todos": []` |
| `ckpt_tuple is None` | L138-144 | 加 `"todos": []` |
| 正常路径 | L145-162 | 加 `raw_todos` 读取 + 形状兜底 + `"todos": todos` |

形状兜底逻辑（`history.py:150-157`）：
- `(ckpt_tuple.checkpoint or {}).get("channel_values", {}).get("todos", []) or []` 双层兜底
- `isinstance(t, dict)` filter 丢弃非 dict 元素
- 只透出 `content`/`status`，缺失字段给默认值 `""` / `"pending"`

### 新增测试 + 既有测试补断言

**新增测试（2 条）：**
- `test_messages_endpoint_returns_empty_todos`（L148）：make_checkpoint_tuple 不传 todos → `result["todos"] == []`
- `test_messages_endpoint_returns_todos_from_checkpoint`（L167）：3 条 fake_todos 正确序列化，首条精确匹配，次/末条 status 校验

**既有测试补断言（3 处）：**
- `test_no_truncate_when_no_active_task`：末尾加 `assert result["todos"] == []`
- `test_load_history_when_checkpointer_is_none`：精确相等改字段级 + 加 `assert result["todos"] == []`
- `test_load_history_when_no_checkpoint`：末尾加 `assert result["todos"] == []`

### D-08 token 修正对照

| 位置 | 修改前 | 修改后 |
|------|--------|--------|
| CONTEXT.md L37 | `var(--color-border-default)` | `var(--color-border-standard)` |

理由：globals.css 只定义 subtle/standard/focus 三个 border token，`--color-border-default` 不存在；`--color-border-standard`（0.08 透明度白色）是 RESEARCH.md BLOCKER-1 推荐值。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 分析偏差] history.py 实际只有 3 个 return 分支**

- **Found during:** Task 2 前阅读代码
- **Issue:** 计划描述了 4 个 return 分支（含"session_svc.get_session 返回 None"独立分支），实际代码中该路径只设置 `active_task = None` 然后继续走 checkpointer 路径，没有独立 return。
- **Fix:** 只在实际存在的 3 处 return 加 `todos` 字段，acceptance criteria 中 `grep -c '"todos"' >= 4` 由变量行 + 3 处 return 合计 4 次满足，无需硬造分支。
- **Files modified:** 无额外改动，按实际代码结构执行。

**2. [Rule 1 - 测试精度] test_load_history_when_checkpointer_is_none 精确相等断言**

- **Found during:** Task 2 运行 pytest（预期的失败）
- **Issue:** 原断言 `result == {"messages": [], "active_task": None, "truncate_after_active_task": False}` 与新增 `todos` 字段不兼容。
- **Fix:** 在 Task 3 改为字段级断言（`result["messages"] == []` 等），更健壮（未来新字段不会破坏测试）。
- **Commit:** `6414dd8`

## Known Stubs

无。

## Threat Flags

无新增信任边界（todos 字段来自同一 session 的 LangGraph checkpoint，与 messages 同源同事务读）。

T-11-02 / T-11-03 缓解措施已实现：
- `isinstance(t, dict)` filter（T-11-02 形状篡改防护）
- `.get("todos", []) or []` 双层兜底（T-11-03 拒绝服务防护）

## Self-Check: PASSED

- [x] `backend/app/models/chat.py` 含 `class TodoModel` (L50)
- [x] `backend/app/core/history.py` 含 `raw_todos` + 3 处 `"todos"` 返回
- [x] `backend/tests/test_history.py` 含 `test_messages_endpoint_returns_empty_todos` + `test_messages_endpoint_returns_todos_from_checkpoint`
- [x] `grep -c "color-border-default" .planning/phases/11-todo-panel/11-CONTEXT.md` = 0
- [x] commit `fd6d381` 存在（Task 1）
- [x] commit `529d615` 存在（Task 2）
- [x] commit `6414dd8` 存在（Task 3）
- [x] `pytest tests/test_history.py -x -v` → 10 passed
