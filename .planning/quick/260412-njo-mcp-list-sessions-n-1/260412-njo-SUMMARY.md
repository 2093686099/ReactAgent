---
phase: quick-260412-njo
plan: 01
subsystem: api
tags: [redis, mcp, fastapi, security, caching]

requires:
  - phase: quick-260410-ne0
    provides: backend 重构后的 app 目录结构
provides:
  - MCP 工具进程级缓存（get_mcp_tools / refresh_mcp_tools）
  - 业务异常体系（BusinessError + 3 子类 + exception_handler）
  - 身份伪造防护（ChatRequest 移除 user_id）
  - list_sessions N+1 修复（mget 批量查询）
affects: [backend-api, agent-core, session-management]

tech-stack:
  added: []
  patterns: [业务异常基类 + exception_handler 统一转 HTTP 响应, 模块级 asyncio.Lock 缓存]

key-files:
  created:
    - backend/app/core/exceptions.py
  modified:
    - backend/app/core/tools.py
    - backend/app/core/hitl.py
    - backend/app/services/task.py
    - backend/app/services/session.py
    - backend/app/main.py
    - backend/app/models/chat.py
    - backend/app/api/chat.py

key-decisions:
  - "BusinessError 基类用 status_code 类属性携带 HTTP 状态码，exception_handler 统一转换"
  - "MCP 缓存用 lazy-init asyncio.Lock + double-check 模式，避免模块加载时无事件循环"
  - "过期 session 清理改用 pipeline 批量 srem 而非逐个调用"

patterns-established:
  - "业务异常模式: core/service 层 raise BusinessError 子类，main.py exception_handler 统一转 JSONResponse"
  - "进程级缓存模式: 模块变量 + asyncio.Lock + double-check"

requirements-completed: [MCP-CACHE, BIZ-EXCEPTIONS, IDENTITY-SPOOF, LIST-SESSIONS-N1]

duration: 4min
completed: 2026-04-12
---

# Quick Task 260412-njo: MCP Cache / Biz Exceptions / Identity Spoof / N+1 Summary

**MCP 工具进程级缓存 + BusinessError 异常体系解耦 FastAPI + 堵住 user_id 伪造 + list_sessions mget 批量查询**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-12T09:03:12Z
- **Completed:** 2026-04-12T09:06:49Z
- **Tasks:** 3
- **Files modified:** 8 (1 created + 7 modified)

## Accomplishments
- get_mcp_tools() 加模块级缓存 + asyncio.Lock 并发安全，消除每次请求的 MCP 网络开销
- 新建 BusinessError 异常体系，core/service 层零 FastAPI 依赖，hitl.py 和 task.py 完全解耦
- ChatRequest 移除 user_id 字段，堵住客户端身份伪造漏洞
- list_sessions 用 mget 批量获取 + pipeline 批量清理过期会话，Redis 调用从 N+1 降为 2

## Task Commits

Each task was committed atomically:

1. **Task 1: 缓存 MCP 工具列表 + 修复 list_sessions N+1** - `d786416` (feat)
2. **Task 2: 定义业务异常体系 + 替换 core/service 层的 HTTPException** - `e8fa1b2` (feat)
3. **Task 3: 堵住身份伪造 — 移除 ChatRequest.user_id** - `b879760` (fix)

## Files Created/Modified
- `backend/app/core/exceptions.py` - BusinessError 基类 + TaskNotFoundError / TaskStateError / InvalidDecisionError
- `backend/app/core/tools.py` - get_mcp_tools() 缓存 + refresh_mcp_tools() 强制刷新
- `backend/app/core/hitl.py` - InvalidDecisionError 替代 HTTPException
- `backend/app/services/task.py` - TaskNotFoundError/TaskStateError 替代 ValueError
- `backend/app/services/session.py` - list_sessions 用 mget 批量查询 + pipeline 清理
- `backend/app/main.py` - BusinessError exception_handler 注册
- `backend/app/models/chat.py` - ChatRequest 移除 user_id 字段
- `backend/app/api/chat.py` - invoke 端点移除 request.user_id 覆盖逻辑

## Decisions Made
- BusinessError 基类用 status_code 类属性携带 HTTP 状态码，exception_handler 统一转换 — 保持 core 层零 FastAPI 依赖
- MCP 缓存用 lazy-init asyncio.Lock + double-check 模式 — 避免模块加载时无事件循环的问题
- 过期 session 清理改用 pipeline 批量 srem — 减少额外的 Redis 往返

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Threat Flags

None - all security surfaces addressed by plan tasks (T-quick-01 spoofing, T-quick-02 tampering, T-quick-03 DoS).

## Self-Check: PASSED

All 8 files verified present. All 3 commit hashes verified in git log.

---
*Phase: quick-260412-njo*
*Completed: 2026-04-12*
