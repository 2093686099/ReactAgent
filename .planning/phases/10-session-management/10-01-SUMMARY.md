---
phase: 10
plan: 01
subsystem: 后端 Session / Checkpoint 还原 / API 契约
tags: [backend, fastapi, pytest, redis, checkpoint, tdd]
dependency_graph:
  requires:
    - backend/app/services/session.py
    - backend/app/services/task.py
    - backend/app/api/chat.py
    - backend/app/infra/task_bus.py
    - backend/app/infra/database.py
  provides:
    - backend/app/core/history.py
    - "GET /api/sessions/{id}/messages"
    - "POST /api/sessions 幂等 body"
    - "SessionService.update_title / set_last_task_id"
  affects:
    - backend/app/api/sessions.py
    - backend/app/api/deps.py
    - backend/app/models/chat.py
tech_stack:
  added: []
  patterns:
    - "duck-typing (type(msg).__name__) 识别 LangChain Message 类型（与 streaming.py 同模式）"
    - "Session→Task 反向索引：session JSON 加 last_task_id 字段（P-05 方案 B）"
    - "历史加载 truncate_after_active_task 去重（P-02 降级规则）"
    - "跨用户访问 404 脱敏（T-10-01 mitigation）"
key_files:
  created:
    - backend/app/core/history.py
    - backend/tests/fixtures/__init__.py
    - backend/tests/fixtures/checkpoint_factory.py
    - backend/tests/test_history.py
    - backend/tests/test_api_sessions.py
    - .planning/phases/10-session-management/deferred-items.md
  modified:
    - backend/app/services/session.py
    - backend/app/services/task.py
    - backend/app/api/chat.py
    - backend/app/api/sessions.py
    - backend/app/api/deps.py
    - backend/app/models/chat.py
    - backend/tests/conftest.py
decisions:
  - "SessionService 内部用 Redis STRING+JSON，非 HASH（修正 CONTEXT D-04 误述）"
  - "TaskService 接管 session 隐式创建 + title 回填，API 层 chat.py 只做用户活动 touch"
  - "SessionCreateRequest 两字段全可选，允许 POST {} 空 body（撤销删除时带 session_id）"
  - "历史中 HITL 降级为两态：仅 text + tool pill，ToolMessage reject 前缀映射 rejected"
metrics:
  duration: 6m1s
  completed: 2026-04-21
  tasks_total: 3
  tasks_completed: 3
  files_created: 6
  files_modified: 7
  new_tests: 14
---

# Phase 10 Plan 01: 后端 Session 基础层 + API 契约 Summary

One-liner: 为 Phase 10 前端冻结 session / message / active_task 的 API 契约，新增 checkpoint → segments 还原、title / last_task_id 字段、跨用户访问 404 脱敏，14 个新单元/集成用例全绿。

## Context

- **Objective:** Phase 10 Wave 0 后端基础层：扩展 session / task 数据结构（title / last_task_id），新增 checkpoint → segments 还原模块，新增 `GET /api/sessions/{id}/messages` 端点，修正 `POST /api/sessions` 语义（P-07 幂等），补齐跨用户访问防御（T-10-01 mitigation）。
- **Scope:** 后端 only；前端（store / Sidebar / handleSwitch / vitest）是 Plan 02-04 的事。
- **Key constraint:** 先落单测再改生产代码（TDD），测试全部走 conftest 的 sys.modules mock 路径 —— 任何历史解析代码必须 duck-typing，不得 import langchain_core.messages。

## What Was Built

### Task 1 — core/history.py + checkpoint fixture + 8 个 history 测试
- `backend/app/core/history.py` 两个公开符号：
  - `messages_to_segments(raw_messages)` — 纯函数，LangChain BaseMessage 列表 → 前端 `Message[]`
  - `load_history_for_session(user_id, session_id, session_svc)` — 读 session.last_task_id + checkpoint，组装 `{messages, active_task, truncate_after_active_task}`
- `backend/tests/fixtures/checkpoint_factory.py` 动态建 `HumanMessage / AIMessage / ToolMessage` 类（`type(name, (object,), {})`）并构造 `make_checkpoint_tuple(messages)` —— 绕过 conftest 对 langchain_core 的 MagicMock。
- 8 个用例全绿（duck-typing 映射 / 无 hitl segment / rejected pill / 长历史 / truncate 四分支 / checkpoint 缺失边界）。

### Task 2 — Session + Task 服务层扩展
- `SessionService.create_session` 新增 `title: str = ""` 参数；session JSON 默认含 `title=""` + `last_task_id=None`。
- 新方法 `SessionService.update_title` / `SessionService.set_last_task_id` 采用 read-modify-write 模式，不动 `last_updated`（区分"用户活动"vs"元数据写入"）。
- `TaskService.start_invoke` 按 P-06 语义：
  - 不存在 → `create_session(title=query[:30])`
  - 存在且 title 为空 → `update_title(query[:30])`
  - title 已有 → 不动
  - 所有分支 `set_last_task_id(task_id)`
- `TaskService.start_resume` 末尾刷新 `last_task_id`（task_id 虽未变但保证索引一致）。
- 构造函数加入 `session_service: SessionService | None` 参数；`api/deps.py::get_task_service` 注入 singleton。
- `api/chat.py::resume` 新增 `session_svc` 依赖 + 末尾 `touch`（P-06 修复）。
- `api/chat.py::invoke` 瘦身：只做用户活动 touch，create_session 交给 TaskService。
- `models/chat.py` 新增 `SessionCreateRequest(session_id?, title?)`。

### Task 3 — api/sessions.py 新端点 + 跨用户安全 + 6 个 API 测试
- `POST /api/sessions` body `SessionCreateRequest`：
  - `session_id` 非空且已存在 → 返回现有 `{session_id, title}`，不 create（P-07 幂等，保留 `created_at`）
  - 其它 → 新建
  - 支持空 body
- `GET /api/sessions/{session_id}/messages`：
  - `session_exists(session_id, user_id=user_id)` 绑定当前用户
  - 非本用户 → 404 `detail="会话不存在"`（不泄漏归属信息，T-10-01 mitigation）
  - 正常 → `await load_history_for_session(...)`
- 6 个用例：list 返回新字段 / POST 空 body / POST 幂等 / delete+restore 幂等 / messages 返回结构 / 跨用户 404 且 detail 脱敏。

## API 契约冻结片段（供 Plan 03 前端数据层消费）

### GET /api/sessions
```json
{
  "sessions": [
    {
      "session_id": "str",
      "user_id": "str",
      "status": "idle",
      "title": "查天气",               // Phase 10 新增
      "last_task_id": "t-1" | null,    // Phase 10 新增
      "created_at": 1700.0,
      "last_updated": 1800.0
    }
  ]
}
```

### POST /api/sessions
请求体（可全省略）：`{ "session_id"?: string, "title"?: string }`
- session_id 已存在 → 200 `{ "session_id": "s1", "title": "原标题" }`（不覆盖）
- 否则 → 200 `{ "session_id": "<new>", "title": "" }`

### GET /api/sessions/{session_id}/messages
```json
{
  "messages": [
    { "id": "user-0", "role": "user", "segments": [{ "type": "text", "content": "..." }], "timestamp": 0 },
    { "id": "assistant-0", "role": "assistant",
      "segments": [
        { "type": "text", "content": "..." },
        { "type": "tool", "name": "weather", "status": "done" | "rejected" }
      ],
      "timestamp": 0 }
  ],
  "active_task": { "task_id": "t-1", "status": "running" | "interrupted" } | null,
  "truncate_after_active_task": true | false
}
```
跨用户 → 404 `{ "detail": "会话不存在" }`

### DELETE /api/sessions/{id}
只删 Redis（保留 Postgres checkpoint，方便撤销全量恢复）。204-like 响应：`{ "status": "success" }`。

## Verification Results

```bash
cd backend && pytest tests/test_api_sessions.py tests/test_history.py -x
# 14 passed in 0.07s
```

- `pytest tests/test_history.py`: 8/8 passed
- `pytest tests/test_api_sessions.py`: 6/6 passed
- `pytest tests/test_api/`（回归）: 3/3 passed
- 自检 grep:
  - `session_svc.touch` 在 `api/chat.py` 命中 2 次（invoke + resume）
  - `SessionCreateRequest` 在 `models/chat.py` 命中 1 次
  - `user_id=user_id` 在 `api/sessions.py` 命中 8 次（所有 session_id 路径参数均绑定用户）
  - `/{session_id}/messages` 在 `api/sessions.py` 命中 1 次

## Key Decisions

1. **TaskService 接管 session 隐式创建**：原来 API 层在 `invoke` 里 `if not session_exists: create`，现在把 create + title 回填统一下沉到 TaskService，API 层只管 touch。理由：P-06 要求"首次 invoke 写 title，已有不覆盖"，集中到 TaskService 保证这层语义不会被 API 路径分支绕过。
2. **last_task_id 反向索引（方案 B）**：`session_tasks:*` 独立 SET key 过度设计。直接在 session JSON 加 `last_task_id` 字段，读/写都只触及 `session:{user}:{id}` 一个 key，get_session 一次搞定。
3. **truncate_after_active_task 降级规则**：按 CONTEXT P-02 建议 —— active_task 存在且最末是 AIMessage 即 true。精确"该 message 是否由该 task 产生"留给后续 Phase（要读 checkpoint metadata，代价大）。
4. **跨用户 404 而非 403**：403 等于确认该 session 存在于别的用户，T-10-01 硬 acceptance 要求 404 + detail 文案不带"不属于""另一用户""belongs" 等字眼。

## Deviations from Plan

### Scope Compliance
无偏离 P-01..P-07 语义。TDD 三轮（RED → GREEN）都按步骤执行。

### Adjustments
- **conftest.py 的 mock_session_service 在 Task 2 一起补**：PLAN 原本把它放在 Task 3 的 action，但 Task 2 在改 TaskService 之后会让其他测试（如 test_api/test_chat）通过新注入的 SessionService 间接调到 `update_title / set_last_task_id`，所以把 3 个 AsyncMock 前移到 Task 2 一并提交，避免 Task 2 绿灯之前 test_chat 退化。不影响 Task 3 的语义，且精神一致。
- **api/chat.py::invoke 简化**：PLAN action 说"保留 existing 分支的 touch 在 api 层"，已按此实现。新建分支的 create_session 完全交给 TaskService（TaskService 内部自己 session_exists 判定），api 层不再重复判断。

## Known Stubs / Threat Flags

无新增 stub。截止本 Plan，所有 API 契约字段都由真实服务数据源支撑（session JSON / checkpoint / task_bus）。无新增威胁表面，现有 T-10-01..04 全部覆盖：
- T-10-01（跨用户读消息）mitigate via `test_messages_cross_user_forbidden`
- T-10-02（偷用他人 session_id）mitigate via `create_session` / `delete_session` 的 user_id 绑定 + `test_delete_then_restore_idempotent`
- T-10-03（篡改 Redis）accept（单用户 dev）
- T-10-04（长历史 DoS）accept + 用例 `test_long_history` 覆盖 O(N) 行为

## Deferred Issues

Pre-existing failures 未在本 Plan 修复（不属于 session-management scope），已记录到 `.planning/phases/10-session-management/deferred-items.md`：
- `backend/tests/test_main.py::test_configure_windows_event_loop_policy_sets_selector_policy`
- `backend/tests/test_main.py::test_configure_windows_event_loop_policy_skips_non_windows`

两者在 `git stash` 验证下确认为 Phase 10 开始前就存在的失败（Python 3.9 + macOS 环境下 `asyncio.WindowsSelectorEventLoopPolicy` 属性不存在，`monkeypatch.setattr` 会 AttributeError）。

## Tooling Notes

`gsd-sdk query verify.key-links` 在本仓库（路径含中文空格）下返回 `"Source file not found"` 但所有文件与 pattern 都实际存在（见 Verification Results 的 grep 自检）。判定为 SDK 路径解析对包含中文/空格的 project_root 的已知问题，与本 Plan 产出无关。

## Self-Check: PASSED

### Files Created
- `backend/app/core/history.py` — FOUND
- `backend/tests/fixtures/__init__.py` — FOUND
- `backend/tests/fixtures/checkpoint_factory.py` — FOUND
- `backend/tests/test_history.py` — FOUND
- `backend/tests/test_api_sessions.py` — FOUND
- `.planning/phases/10-session-management/deferred-items.md` — FOUND

### Files Modified
- `backend/app/services/session.py` — FOUND
- `backend/app/services/task.py` — FOUND
- `backend/app/api/chat.py` — FOUND
- `backend/app/api/sessions.py` — FOUND
- `backend/app/api/deps.py` — FOUND
- `backend/app/models/chat.py` — FOUND
- `backend/tests/conftest.py` — FOUND

### Commits
- `52178f6` test(10-01): 新增 checkpoint duck-typing fixture + history 解析测试 (RED) — FOUND
- `67d6e55` feat(10-01): core/history.py 新增 messages_to_segments + load_history_for_session — FOUND
- `b02a0d4` feat(10-01): SessionService/TaskService 扩展 title+last_task_id+resume touch — FOUND
- `0fbeac9` test(10-01): 新增 test_api_sessions 端到端用例 (RED) — FOUND
- `eccc85c` feat(10-01): api/sessions.py 新增 GET /{id}/messages + POST 幂等 + 跨用户 404 — FOUND
