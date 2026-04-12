---
phase: quick-260412-nyx
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/app/core/streaming.py
  - backend/app/services/task.py
  - backend/app/models/chat.py
  - backend/app/infra/task_bus.py
  - backend/app/main.py
autonomous: true
must_haves:
  truths:
    - "parse_agent_events 参数有完整类型标注，mypy/pyright 可静态检查"
    - "TaskService.cancel_all() 在 lifespan 关闭时取消所有运行中的 asyncio.Task"
    - "task meta 存储为 Redis HASH，set_task_status 原子更新单个字段"
  artifacts:
    - path: "backend/app/infra/task_bus.py"
      provides: "TaskMeta TypedDict + HASH-based create/get/set_task_status"
      contains: "hset"
    - path: "backend/app/services/task.py"
      provides: "cancel_all 方法 + AgentInput 类型别名"
      contains: "cancel_all"
    - path: "backend/app/main.py"
      provides: "lifespan teardown 调用 cancel_all"
      contains: "cancel_all"
  key_links:
    - from: "backend/app/main.py"
      to: "backend/app/services/task.py"
      via: "lifespan teardown 调用 task_service.cancel_all()"
      pattern: "task_service\\.cancel_all"
    - from: "backend/app/infra/task_bus.py"
      to: "Redis"
      via: "hset/hgetall 替代 set/get+JSON"
      pattern: "hset|hgetall"
---

<objective>
后端代码质量三项改进：补充关键类型标注、lifespan 优雅关闭时取消运行中任务、task meta 从 JSON string 迁移到 Redis HASH 实现原子字段更新。

Purpose: 提高类型安全、防止关闭时 orphan 任务泄漏、消除 set_task_status 的 read-modify-write 竞态。
Output: 5 个文件的精确修改。
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@backend/app/core/streaming.py
@backend/app/services/task.py
@backend/app/models/chat.py
@backend/app/infra/task_bus.py
@backend/app/main.py
@backend/app/infra/redis.py
@backend/app/config.py

<interfaces>
<!-- Redis client 已设 decode_responses=True，hgetall 返回 dict[str, str] -->

From backend/app/infra/redis.py:
```python
class RedisManager:
    client: redis.Redis | None = None
```

From backend/app/services/task.py:
```python
class TaskService:
    _running: dict[str, asyncio.Task] = {}
task_service = TaskService()  # 模块级单例
```

From backend/app/infra/task_bus.py:
```python
STATUS_RUNNING = "running"
STATUS_INTERRUPTED = "interrupted"
STATUS_COMPLETED = "completed"
STATUS_ERROR = "error"
TERMINAL_STATUSES = {STATUS_INTERRUPTED, STATUS_COMPLETED, STATUS_ERROR}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: 补充关键类型标注</name>
  <files>backend/app/core/streaming.py, backend/app/services/task.py, backend/app/models/chat.py, backend/app/infra/task_bus.py</files>
  <action>
四个文件的精确修改：

**streaming.py**:
- 添加 import: `from langgraph.graph.state import CompiledStateGraph` 和 `from langchain_core.runnables import RunnableConfig`
- line 34-35: `agent` 标注为 `CompiledStateGraph`，`config: dict` 改为 `config: RunnableConfig`
- 不改动函数体内任何逻辑

**services/task.py**:
- 在文件顶部 import 区后添加类型别名: `AgentInput = dict[str, Any] | Command` (需要 `from typing import Any`)
- line 62-63: `_run_agent` 的 `agent_input` 参数标注为 `AgentInput`

**models/chat.py**:
- line 18: `action_requests: Optional[list] = None` 改为 `action_requests: list[dict[str, Any]] | None = None`
- 调整 import: 确保 `Any` 在 import 中（`Dict` 和 `Optional` 如不再被其他字段使用可移除，但 `Optional` 仍被 line 9/17 使用，`Dict` 被 line 16 使用 — 保留）

**infra/task_bus.py**:
- 添加 import: `from typing import TypedDict`
- 在常量定义之后定义 `TaskMeta(TypedDict)`:
  ```python
  class TaskMeta(TypedDict):
      task_id: str
      user_id: str
      session_id: str
      status: str
  ```
- `get_task_meta` 返回类型从 `dict | None` 改为 `TaskMeta | None`
- `create_task_meta` 内部的 `meta` dict 标注为 `TaskMeta`
  </action>
  <verify>
    <automated>cd "/Users/neuron/文稿/2 私人/ReActAgents" && python -c "from backend.app.core.streaming import parse_agent_events; from backend.app.services.task import AgentInput; from backend.app.models.chat import ResumeRequest; from backend.app.infra.task_bus import TaskMeta; print('imports OK')"</automated>
  </verify>
  <done>四个文件的类型标注补充完成，所有 import 可正常解析，TaskMeta TypedDict 可被外部引用</done>
</task>

<task type="auto">
  <name>Task 2: lifespan 中 cancel running tasks</name>
  <files>backend/app/services/task.py, backend/app/main.py</files>
  <action>
**services/task.py**:
在 `TaskService` 类中添加方法:
```python
async def cancel_all(self) -> None:
    """取消所有运行中的 agent 后台任务（用于 shutdown）"""
    for task_id, t in self._running.items():
        logger.info(f"取消运行中的任务 {task_id}")
        t.cancel()
    # 等待所有任务响应取消（suppress CancelledError）
    if self._running:
        await asyncio.gather(*self._running.values(), return_exceptions=True)
        self._running.clear()
```
注意：cancel() 后 done_callback 会自动 pop，但 gather 确保全部完成后 clear 兜底。

**main.py**:
- 添加 import: `from app.services.task import task_service`
- 在 lifespan 的 yield 之后、redis/db disconnect 之前插入:
  ```python
  await task_service.cancel_all()
  ```
  最终 teardown 顺序: cancel_all -> redis disconnect -> db disconnect
  </action>
  <verify>
    <automated>cd "/Users/neuron/文稿/2 私人/ReActAgents" && python -c "
from backend.app.services.task import task_service
import inspect
assert hasattr(task_service, 'cancel_all'), 'cancel_all 方法不存在'
assert inspect.iscoroutinefunction(task_service.cancel_all), 'cancel_all 必须是 async'
# 验证 main.py lifespan 包含 cancel_all 调用
src = open('backend/app/main.py').read()
assert 'cancel_all' in src, 'main.py 未调用 cancel_all'
idx_cancel = src.index('cancel_all')
idx_yield = src.index('yield')
idx_redis = src.index('redis_manager.disconnect')
assert idx_cancel > idx_yield, 'cancel_all 应在 yield 之后'
assert idx_cancel < idx_redis, 'cancel_all 应在 redis disconnect 之前'
print('cancel_all 验证通过')
"</automated>
  </verify>
  <done>TaskService.cancel_all() 方法存在且为 async；main.py lifespan teardown 顺序: cancel_all -> redis disconnect -> db disconnect</done>
</task>

<task type="auto">
  <name>Task 3: task meta 改用 Redis HASH</name>
  <files>backend/app/infra/task_bus.py</files>
  <action>
修改 task_bus.py 中 3 个函数，移除 JSON 序列化（事件流的 XADD 不动）:

**create_task_meta**: 
```python
async def create_task_meta(task_id: str, user_id: str, session_id: str) -> None:
    client = await _client()
    meta: TaskMeta = {
        "task_id": task_id,
        "user_id": user_id,
        "session_id": session_id,
        "status": STATUS_RUNNING,
    }
    await client.hset(_meta_key(task_id), mapping=meta)
    await client.expire(_meta_key(task_id), settings.task_ttl)
```

**get_task_meta**:
```python
async def get_task_meta(task_id: str) -> TaskMeta | None:
    client = await _client()
    data = await client.hgetall(_meta_key(task_id))
    return data if data else None  # hgetall 返回空 dict 时表示 key 不存在
```
注意: `decode_responses=True` 下 hgetall 返回 `dict[str, str]`，与 TaskMeta 的字段类型 `str` 匹配。

**set_task_status**:
```python
async def set_task_status(task_id: str, status: str) -> None:
    client = await _client()
    key = _meta_key(task_id)
    exists = await client.exists(key)
    if not exists:
        logger.warning(f"set_task_status 找不到 task {task_id}")
        return
    await client.hset(key, "status", status)
```
用 `exists` + `hset` 单字段更新替代 get+parse+modify+serialize+set 的 read-modify-write。
不再需要 `import json` 给 meta 用（但 publish_event / read_events 仍需 json — 保留 import）。
  </action>
  <verify>
    <automated>cd "/Users/neuron/文稿/2 私人/ReActAgents" && python -c "
import ast, inspect
src = open('backend/app/infra/task_bus.py').read()
tree = ast.parse(src)
# 确认 create_task_meta 不再用 json.dumps
for node in ast.walk(tree):
    if isinstance(node, ast.AsyncFunctionDef) and node.name == 'create_task_meta':
        body_src = ast.get_source_segment(src, node)
        assert 'json.dumps' not in body_src, 'create_task_meta 仍在用 json.dumps'
        assert 'hset' in body_src, 'create_task_meta 应使用 hset'
        print('create_task_meta: OK')
    if isinstance(node, ast.AsyncFunctionDef) and node.name == 'get_task_meta':
        body_src = ast.get_source_segment(src, node)
        assert 'json.loads' not in body_src, 'get_task_meta 仍在用 json.loads'
        assert 'hgetall' in body_src, 'get_task_meta 应使用 hgetall'
        print('get_task_meta: OK')
    if isinstance(node, ast.AsyncFunctionDef) and node.name == 'set_task_status':
        body_src = ast.get_source_segment(src, node)
        assert 'json.dumps' not in body_src, 'set_task_status 仍在用 json.dumps'
        assert 'get_task_meta' not in body_src, 'set_task_status 不应再调用 get_task_meta'
        assert 'hset' in body_src, 'set_task_status 应使用 hset'
        print('set_task_status: OK')
print('Redis HASH 迁移验证通过')
"</automated>
  </verify>
  <done>create_task_meta 用 hset+expire，get_task_meta 用 hgetall，set_task_status 用 exists+hset 原子更新单字段；publish_event/read_events 的 JSON 序列化不受影响</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 无新增 | 本次改动为内部重构，不引入新的信任边界 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-nyx-01 | T (Tampering) | set_task_status | accept | exists+hset 仍无事务保护，但 task_id 为 UUID 且仅内部调用，竞态窗口极小，可接受 |
</threat_model>

<verification>
三个任务的 verify 命令全部通过即视为完成。
</verification>

<success_criteria>
1. streaming.py 的 agent/config 参数有 CompiledStateGraph/RunnableConfig 类型标注
2. task.py 定义 AgentInput 别名且 _run_agent 使用它；cancel_all 方法存在
3. chat.py 的 action_requests 类型为 list[dict[str, Any]] | None
4. task_bus.py 定义 TaskMeta TypedDict；meta 操作用 hset/hgetall 无 JSON
5. main.py lifespan teardown 在 disconnect 之前调用 cancel_all
</success_criteria>

<output>
After completion, create `.planning/quick/260412-nyx-lifespan-cancel-tasks-task-meta-redis-ha/260412-nyx-SUMMARY.md`
</output>
