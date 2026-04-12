---
phase: quick-260412-oar-di
plan: 01
subsystem: backend
tags: [di, testing, refactor]
dependency_graph:
  requires: []
  provides: [di-injectable-services, basic-test-suite]
  affects: [backend/app/api/*, backend/app/services/*, backend/app/main.py]
tech_stack:
  added: [eval-type-backport]
  patterns: [fastapi-depends-injection, lazy-singleton-provider, sys-modules-mock]
key_files:
  created:
    - backend/tests/conftest.py
    - backend/tests/test_core/__init__.py
    - backend/tests/test_core/test_hitl.py
    - backend/tests/test_core/test_streaming.py
    - backend/tests/test_api/__init__.py
    - backend/tests/test_api/test_chat.py
  modified:
    - backend/app/core/agent.py
    - backend/app/services/task.py
    - backend/app/services/session.py
    - backend/app/services/memory.py
    - backend/app/api/deps.py
    - backend/app/api/chat.py
    - backend/app/api/sessions.py
    - backend/app/api/memory.py
    - backend/app/main.py
    - backend/app/core/hitl.py
    - backend/app/infra/task_bus.py
    - backend/app/infra/llm.py
    - backend/app/infra/redis.py
    - backend/app/infra/database.py
    - backend/app/core/tools.py
    - backend/app/models/chat.py
decisions:
  - lazy singleton provider (非 lru_cache) 确保 dependency_overrides 可覆盖
  - conftest 用 sys.modules mock 外部重依赖，避免测试依赖 langgraph/redis 安装
metrics:
  duration: 13m
  completed: 2026-04-12T09:50Z
  tasks: 2/2
  tests: 20 passed
---

# Quick Task 260412-oar: DI 改造 + 基础测试 Summary

三个服务从模块级单例改为 deps.py lazy singleton provider + FastAPI Depends 注入；20 个 pytest 用例覆盖 hitl/streaming 纯函数和 chat API 端点。

## Task Results

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | DI 改造 -- 服务从单例改为 Depends 注入 | fd14115 | Done |
| 2 | 基础测试 -- hitl + streaming + chat API | dddc12b | Done |

## Key Changes

### Task 1: DI 改造

- `AgentService.__init__` 接受可选 `checkpointer`/`store` 参数，测试可注入 mock
- `TaskService.__init__` 接受可选 `agent_service` 参数
- 删除 `task_service`/`session_service`/`memory_service` 三个模块级单例
- `deps.py` 新增 `get_task_service()`/`get_session_service()`/`get_memory_service()` lazy singleton provider
- 所有 API 路由 (chat/sessions/memory) 改用 `Depends(get_xxx_service)` 注入
- `main.py` lifespan shutdown 通过 `get_task_service()` 获取实例

### Task 2: 基础测试

- `test_hitl.py`: 10 个 `build_decisions` 边界用例 (approve/reject/edit/alias/异常)
- `test_streaming.py`: 7 个 `_extract_text` 类型分支用例
- `test_chat.py`: 3 个 API 集成测试 (invoke 200 / resume 404 / health 200)
- `conftest.py`: sys.modules mock 外部重依赖 + `dependency_overrides` DI 替换验证

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 全部 app 模块添加 `from __future__ import annotations`**
- **Found during:** Task 2
- **Issue:** 测试环境 Python 3.9 无法解析 `dict | None` 等 PEP 604 语法，导致 import 失败
- **Fix:** 为 16 个 app 模块添加 `from __future__ import annotations`（行为无变化，仅延迟注解求值）
- **Files modified:** hitl.py, task_bus.py, llm.py, tools.py, redis.py, database.py, agent.py, task.py, session.py, memory.py (services), deps.py, chat.py, sessions.py, memory.py (api), main.py, models/chat.py
- **Commit:** dddc12b

## Known Stubs

None.

## Self-Check: PASSED

- All 7 key files exist
- Both commits (fd14115, dddc12b) verified in git log
- test_hitl.py: 74 lines (min 50), test_streaming.py: 32 lines (min 30), test_chat.py: 38 lines (min 30)
- 20/20 tests passing
