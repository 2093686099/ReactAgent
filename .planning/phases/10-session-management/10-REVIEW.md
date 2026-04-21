---
phase: 10-session-management
reviewed: 2026-04-21T05:04:58Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - backend/app/api/chat.py
  - backend/app/api/deps.py
  - backend/app/api/sessions.py
  - backend/app/core/history.py
  - backend/app/main.py
  - backend/app/models/chat.py
  - backend/app/services/session.py
  - backend/app/services/task.py
  - backend/tests/conftest.py
  - backend/tests/fixtures/__init__.py
  - backend/tests/fixtures/checkpoint_factory.py
  - backend/tests/test_api_sessions.py
  - backend/tests/test_history.py
  - frontend/package.json
  - frontend/src/app/page.tsx
  - frontend/src/components/layout/app-layout.tsx
  - frontend/src/components/sidebar/session-group.tsx
  - frontend/src/components/sidebar/session-item.tsx
  - frontend/src/components/sidebar/sidebar.tsx
  - frontend/src/hooks/use-sse.ts
  - frontend/src/lib/__tests__/time-group.test.ts
  - frontend/src/lib/api.ts
  - frontend/src/lib/time-group.ts
  - frontend/src/lib/types.ts
  - frontend/src/stores/chat-store.ts
  - frontend/src/stores/session-store.ts
  - frontend/vitest.config.ts
findings:
  critical: 0
  warning: 3
  info: 6
  total: 9
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-04-21T05:04:58Z
**Depth:** standard
**Files Reviewed:** 27
**Status:** issues_found

## Summary

Phase 10 引入了会话管理的多个正交切面：后端 Redis 会话元数据扩展（title / last_task_id）、
LangGraph checkpoint 还原历史消息、以及前端 domain-sliced Zustand stores + 8s 撤销删除。整
体代码简洁，与 CLAUDE.md §2/§3 的外科手术风格相符；安全上跨用户访问的 404 不泄漏 mitigation
已落到 `api/sessions.py:get_messages` 与测试 `test_messages_cross_user_forbidden`。

但仍有三处 warning 级问题值得在后续迭代前处理：

1. `handleDelete` 中 `sessions` 为删除前闭包快照，依赖偶然正确（`!== id` 过滤掉了幻影项）。
2. `restoreSession` 走 `POST /api/sessions` 只携带 `title`，丢失 `last_task_id`；若被删会话
   仍有 running/interrupted task，撤销后前端不会 reattach，HITL 按钮不可达。
3. `SessionService` 的 `touch / update_title / set_last_task_id` 是 Redis 非原子的
   read-modify-write（get+set on JSON blob）。Phase 10 增了两处调用，并发 invoke 同 session
   或 invoke + touch 并发时有丢 title/last_task_id 的可能。

另外还有 6 条 info 级提醒（输入校验、from_id 硬编码、ToolMessage 起始边角等）。

---

## Warnings

### WR-01: `handleDelete` 使用了删除前的 sessions 闭包快照

**File:** `frontend/src/app/page.tsx:84-114`
**Issue:** `const target = sessions.find(...)` 之后 `await deleteOptimistic(id)` 已把
store 中的 `sessions` 更新了，但函数内局部变量 `sessions` 仍指向旧 snapshot（含被删项）。
随后 `if (id === activeSessionId)` 分支里又用 `sessions.find((s) => s.id !== id)` 去找
"下一个可切换的会话"。这一句恰好靠 `!== id` 过滤把"幻影"项排除、挑到兄弟项，所以当前肉眼
看没问题——**但这是偶然正确**（accidental correctness）。一旦后续改了 delete 的乐观模型
（例如：即使后端失败也保留占位、或引入批量删除），该处就会退化为"切到刚删除的 session"
导致 UI 卡死。Toast 的 `target.title` 回填正确是因为在 `deleteOptimistic` 之前就 find 过。

**Fix:** 显式用"删除后的"状态做 next 查找：
```tsx
const handleDelete = async (id: string) => {
  const target = sessions.find((s) => s.id === id);
  if (!target) return;
  try {
    await deleteOptimistic(id);
  } catch {
    toast.error("删除失败");
    return;
  }
  toast(`已删除 ${target.title || "新会话"}`, { duration: 8000, action: { ... } });
  if (id === activeSessionId) {
    // 读删除后的 store 快照，避免依赖闭包里的旧数组
    const remaining = useSessionStore.getState().sessions;
    const next = remaining[0];
    if (next) {
      await handleSwitch(next.id);
    } else {
      createLocal();
      loadHistoryAction([]);
      setCurrentTaskId(null);
    }
  }
};
```

---

### WR-02: `restoreSession` 丢失 `last_task_id`，撤销后无法 reattach 在途 HITL

**File:** `frontend/src/stores/session-store.ts:72-88`（配合 `backend/app/api/sessions.py:36-64`）
**Issue:** 删除路径保留了 Postgres checkpoint（SESS-04 语义：仅删 Redis）。如果被删的
session 有 **running / interrupted** 的 task，`deletedPending` 对象里 `last_task_id`
字段**是保存下来的**，但 `restoreSession` 调用 `createSessionAPI({session_id, title})`
时只带了 title。API 层 `POST /api/sessions` 走 create 分支（`session_exists=False`），
`SessionService.create_session` 把 `last_task_id` 硬编码为 `None`。结果：用户"撤销"之后，
下次 handleSwitch / loadHistory 的 `active_task` 永远为 None，HITL 审批按钮无法出现，agent
后台 task 仍在跑但 UI 无法与之交互（或等 TTL/agent 自行结束才 clean up）。

实际触发路径虽少（删除中断态会话并撤销），但撤销 UX 的"完整复原"承诺没兑现。

**Fix:** 两层都动最小：
1. 扩展 `SessionCreateRequest`，允许带 `last_task_id`；`create_session` 接受该参数并写入；
2. `restoreSession` 在 POST body 里回传 `session.last_task_id`。

```python
# backend/app/models/chat.py
class SessionCreateRequest(BaseModel):
    session_id: Optional[str] = None
    title: Optional[str] = None
    last_task_id: Optional[str] = None  # 新增

# backend/app/services/session.py::create_session 签名里加
# last_task_id: str | None = None
# data 字典里把 "last_task_id": last_task_id

# backend/app/api/sessions.py::create_session 里把 request.last_task_id 透传
```
```ts
// frontend/src/stores/session-store.ts::restoreSession
await createSessionAPI({
  session_id: session.id,
  title: session.title,
  last_task_id: session.last_task_id ?? undefined,
});
```

同时让 `createSessionAPI` 的入参类型与 `RawSession` 对齐，避免类型泄漏。

---

### WR-03: SessionService 读改写非原子，并发 invoke 可丢 title / last_task_id

**File:** `backend/app/services/session.py:74-124`（`touch`、`update_title`、`set_last_task_id`）
**Issue:** 三个方法统一模式是 `get_session → mutate Python dict → self.client.set(...json...)`。
Phase 10 新增了 `update_title` 与 `set_last_task_id` 两个写点，同时 `start_invoke`
(`services/task.py:57-67`) 在同一 session 上串联 `session_exists → update_title →
set_last_task_id`，`chat.py invoke` 自己还先做 `touch`。下列场景会丢写：

- 并发两次 POST /api/chat/invoke（同 session）→ 两个 TaskService._run_agent 的 set_last_task_id 与各自的 touch/update_title 交错 → 后生效的 set 覆盖前者的中间字段，`last_task_id` / `title` / `last_updated` 三者之一可能被回退。
- 前端 resume 同时进来第二条 invoke → API 层 `touch` 与 `start_resume` 里的 `set_last_task_id` 对同一 key 并发 SET。
- 单进程事件循环通常不并发，但 asyncio background task (`_run_agent`) 可能与 API 请求的协程交错调度。

已有的 P-05 反向索引 + P-06 title 首写是 Phase 10 新增的关键业务事实，没有锁保护会在
真实用户双击发送时出现标题抖动（先取到空 → 回填，和另一请求覆盖交错）。

**Fix（任选其一，从简到稳）：**
1. **最小侵入**：把 session 元数据从 "JSON-in-string" 改成 Redis HASH，每个字段 HSET；需要续 TTL 时 `EXPIRE key ttl`。读用 HGETALL。`touch/update_title/set_last_task_id` 都变成单 HSET，天然原子。
2. **保留 JSON 存储**：在 `SessionService` 内部包一层 `WATCH / MULTI / EXEC` 乐观锁（redis-py async 支持 `pipeline(transaction=True)` + `watch`）；冲突重试 2-3 次。
3. **退而求其次**：显式声明本 Phase 语义是"最终一致"，在 PLAN 或 CLAUDE.md 记录 known limitation；但考虑到 title 抖动会直接被用户看到，不推荐。

另：现有测试都 mock 了 `SessionService` 整个实例（`conftest.py::mock_session_service`），
不会在 CI 暴露该 race；需要真正 Redis 的集成测试（或 fakeredis）才能覆盖，属于后续加强项。

---

## Info

### IN-01: `useSSE` 硬编码 `from_id=0`，session 切换会从流头重放

**File:** `frontend/src/hooks/use-sse.ts:46`
**Issue:** URL 写死 `?from_id=0`，断线重连 / 组件重建都从头读事件。Phase 10 扩展了 useEffect
依赖成 `(taskId, sessionId)` 双轴：切 session 后如果 reattach 到一个已经跑了一半的 task，
会把所有历史 token/tool/hitl 重新 replay 一遍，用户会看到"重新打字"。后端 Redis Stream
XADD 后 entry_id 单调递增，客户端本应该记住 last entry_id 随带上。
**Fix:** 在 eventSource handler 里把 `event.lastEventId` 记到 ref，重连时用它；或利用
EventSource 原生的 `Last-Event-ID` header（需要后端同时读 header 或 cookie，前端只要不
强制 query 就行）。非阻塞，可放到后续 phase。

### IN-02: 首条 ToolMessage 的 orphan 处理会悄悄丢 tool pill

**File:** `backend/app/core/history.py:82-98`
**Issue:** `current_ai is None` 时起一个空 assistant 气泡，但随后只在 `is_reject` 分支里
`for reversed(segments)` 找同名 tool segment 改 rejected。由于气泡是空的，`for` 不会执行，
也没有 fallback 往 `segments` 里 append 一个 `type: "tool"` pill —— 所以这条首条
ToolMessage 在前端被完全静默掉。实际 checkpoint 起始就是 ToolMessage 的概率很低，但已经
进了"保守处理"分支就应该把 pill 补上：
```python
segments_append = current_ai["segments"].append
segments_append({
  "type": "tool", "name": tool_name,
  "status": "rejected" if is_reject else "done",
})
```

### IN-03: path 参数 `session_id` 未做格式校验

**File:** `backend/app/api/sessions.py:67,80`
**Issue:** `DELETE /api/sessions/{session_id}` 和 `GET /api/sessions/{session_id}/messages`
都直接把 FastAPI 的 path 参数拼进 Redis key `session:{user_id}:{session_id}`。跨用户泄漏已
通过 `session_exists(..., user_id)` 硬绑定 mitigation，但如果客户端传奇怪值（含 `:`、空白、
超长字符串），会写出形态奇怪的 key，pattern SCAN 时可能混淆。单用户阶段影响不大。
**Fix:** 在 FastAPI 层用 `session_id: str = Path(..., regex=r"^[a-zA-Z0-9-]+$")` 或
`Annotated[str, StringConstraints(pattern=...)]`，服务端 uuid 也符合该规则；或在
`SessionService._key` 前做一次 whitelist 校验。

### IN-04: `task_bus.get_task_meta` 返回类型与 TypedDict 不完全契合

**File:** `backend/app/infra/task_bus.py:54-57`
**Issue:** `hgetall` 可能返回少字段的 dict（例如历史数据），签名却是 `TaskMeta | None`。
`history.py:load_history_for_session` 新引入了 `meta.get("status")`、`chat.py` 里用了
`meta["user_id"]`。非 Phase 10 新增但本 Phase 新调用方扩大了面。
**Fix:** 补一个 `_coerce_meta(data) -> TaskMeta | None`，缺字段就返回 None；或者 hgetall 后
显式校验 `{"task_id","user_id","session_id","status"}.issubset(data)`。

### IN-05: `handleDelete` 的 toast 回调闭包会在 8s 撤销窗口内持有旧 `target`

**File:** `frontend/src/app/page.tsx:94-102`
**Issue:** 8s 内用户可以点"撤销"，`onClick` 里引用的 `target` 是删除前 snapshot，ok。但
如果同一会话"删 → 立即在另一 tab 里被修改 → 撤销"，会把旧 title 覆盖回去。单用户单 tab
不触发，info 级记录。

### IN-06: `sidebar.tsx` 和 `page.tsx` 各自 `loadSessions` 一次，重复调用

**File:** `frontend/src/components/sidebar/sidebar.tsx:21-24`；`frontend/src/app/page.tsx:124-135`
**Issue:** Sidebar mount 时触发一次 `loadSessions().catch(() => {})`；页面在 `didInitRef`
首次也调 `loadSessions()`。两次独立发 GET /api/sessions，返回值都 set 到 store；由于异步到
达顺序不确定，理论上后到的旧数据会覆盖新数据（概率极低，但非 idempotent）。
**Fix:** 统一由 page 层的 init effect 负责 loadSessions，Sidebar 只读 store；或者把
loadSessions 做成去重（promise cache / loading flag）。不阻塞 Phase 10 验收。

---

_Reviewed: 2026-04-21T05:04:58Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
