---
phase: 10-session-management
fixed_at: 2026-04-21T05:30:00Z
review_path: .planning/phases/10-session-management/10-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 10: Code Review Fix Report

**Fixed at:** 2026-04-21T05:30:00Z
**Source review:** .planning/phases/10-session-management/10-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3（WR-01、WR-02、WR-03；Info 级别不在本次 scope）
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: `handleDelete` 使用了删除前的 sessions 闭包快照

**Files modified:** `frontend/src/app/page.tsx`
**Commit:** 0f53684
**Applied fix:** `handleDelete` 中在 `id === activeSessionId` 分支不再用闭包里的 `sessions.find((s) => s.id !== id)`，改为 `useSessionStore.getState().sessions` 读删除后的最新快照，取 `remaining[0]` 作为下一 next。Toast 需要的 `target` 在 `deleteOptimistic` 前已捕获，保持原样。

### WR-02: `restoreSession` 丢失 `last_task_id`，撤销后无法 reattach 在途 HITL

**Files modified:** `backend/app/models/chat.py`, `backend/app/services/session.py`, `backend/app/api/sessions.py`, `frontend/src/lib/api.ts`, `frontend/src/stores/session-store.ts`
**Commit:** 46f90bb
**Applied fix:** 五个文件串起来打通 `last_task_id` 在 restore 路径的透传：
- `SessionCreateRequest` 增加 `last_task_id: Optional[str] = None` 字段。
- `SessionService.create_session` 新增同名参数，写入 Redis JSON。
- `POST /api/sessions` 把 `request.last_task_id` 传给 `create_session`；幂等分支响应体也补回 `last_task_id`，保持 API 对称。
- `createSessionAPI` 入参类型加 `last_task_id?: string | null`，body 直接 JSON.stringify。
- `restoreSession` 在 POST 时带上 `session.last_task_id ?? undefined`。

### WR-03: SessionService 读改写非原子，并发 invoke 可丢 title / last_task_id

**Files modified:** `backend/app/services/session.py`
**Commit:** 78908e9
**Applied fix:** 沿用顾问建议的 Option 2（保留 JSON 存储 + WATCH 乐观锁），最小侵入。新增私有 helper `_atomic_update(session_id, user_id, mutator)`：
- `pipeline(transaction=True)` + `pipe.watch(key)` + `get` + mutator 修改 dict + `pipe.multi()` + `pipe.set(...)` + `pipe.execute()`。
- 捕获 `redis.exceptions.WatchError`，重试至多 3 次；超限 warn log。
- key 不存在直接 `unwatch` 返回 False。

`touch / update_title / set_last_task_id` 三个写方法改为传 lambda-like mutator 调 `_atomic_update`，外部调用签名不变。`create_session / delete_session / list_sessions / session_exists` 保持原样（未涉及并发 read-modify-write）。

**⚠️ 人工复核建议（并发 bug 非纯语法 verify 能覆盖）：**
- 建议针对 `touch / update_title / set_last_task_id` 的并发场景加一层 fakeredis 集成测试（或真实 Redis），模拟 `asyncio.gather` 内两写方法同 key 并发，验证字段不丢失（目前项目内没有 fakeredis；current test 全 mock `SessionService` 实例，无法覆盖）。
- 语义上 redis-py async 的 `pipeline(transaction=True)` + `watch` 是官方文档推荐用法，重试循环也与顾问建议一致；但这是并发正确性改动，建议在集成测试或手动多会话发送验证后再合入 phase verifier。

---

_Fixed: 2026-04-21T05:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
