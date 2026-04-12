---
phase: quick-260412-oar-di
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/app/core/agent.py
  - backend/app/services/task.py
  - backend/app/services/session.py
  - backend/app/services/memory.py
  - backend/app/api/deps.py
  - backend/app/api/chat.py
  - backend/app/api/sessions.py
  - backend/app/api/memory.py
  - backend/app/main.py
  - backend/tests/conftest.py
  - backend/tests/test_core/__init__.py
  - backend/tests/test_core/test_hitl.py
  - backend/tests/test_core/test_streaming.py
  - backend/tests/test_api/__init__.py
  - backend/tests/test_api/test_chat.py
autonomous: true
requirements: [DI-refactor, basic-tests]

must_haves:
  truths:
    - "服务实例通过 deps.py 的 provider 函数获取，不再由各服务模块导出单例"
    - "API 路由通过 FastAPI Depends 注入服务，而非直接 import 单例"
    - "测试可通过 app.dependency_overrides 注入 mock 服务"
    - "build_decisions 全部边界用例有单元测试覆盖"
    - "_extract_text 全部类型分支有单元测试覆盖"
    - "POST /api/chat/invoke 有集成测试验证 200 + mock 注入"
  artifacts:
    - path: "backend/app/api/deps.py"
      provides: "get_task_service, get_session_service, get_memory_service provider 函数"
      exports: ["get_task_service", "get_session_service", "get_memory_service"]
    - path: "backend/tests/test_core/test_hitl.py"
      provides: "build_decisions 单元测试"
      min_lines: 50
    - path: "backend/tests/test_core/test_streaming.py"
      provides: "_extract_text 单元测试"
      min_lines: 30
    - path: "backend/tests/test_api/test_chat.py"
      provides: "chat API 集成测试"
      min_lines: 30
  key_links:
    - from: "backend/app/api/chat.py"
      to: "backend/app/api/deps.py"
      via: "Depends(get_task_service), Depends(get_session_service)"
      pattern: "Depends\\(get_(task|session)_service\\)"
    - from: "backend/app/main.py"
      to: "backend/app/api/deps.py"
      via: "get_task_service() 在 lifespan shutdown 中调用"
      pattern: "get_task_service\\(\\)"
    - from: "backend/tests/conftest.py"
      to: "backend/app/api/deps.py"
      via: "app.dependency_overrides 替换 provider"
      pattern: "dependency_overrides"
---

<objective>
DI 改造 + 基础测试：将三个服务从模块级单例改为 FastAPI Depends 注入，然后为纯函数（hitl、streaming）编写单元测试，为 chat API 编写集成测试验证 mock 注入可行。

Purpose: 消除服务硬编码单例，使测试可以注入 mock；同时为核心纯函数建立测试覆盖。
Output: 可注入的服务架构 + 通过的 pytest 测试套件。
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@backend/app/core/agent.py
@backend/app/services/task.py
@backend/app/services/session.py
@backend/app/services/memory.py
@backend/app/api/deps.py
@backend/app/api/chat.py
@backend/app/api/sessions.py
@backend/app/api/memory.py
@backend/app/main.py
@backend/app/core/hitl.py
@backend/app/core/streaming.py
@backend/app/core/exceptions.py
@backend/app/models/chat.py
@backend/tests/conftest.py
@backend/pyproject.toml

<interfaces>
<!-- 当前各服务模块导出的单例（即将移除） -->

From backend/app/services/task.py:
```python
task_service = TaskService()  # 第109行 — 将移除
```

From backend/app/services/session.py:
```python
session_service = SessionService()  # 第119行 — 将移除
```

From backend/app/services/memory.py:
```python
memory_service = MemoryService()  # 第56行 — 将移除
```

<!-- 被测试的纯函数签名 -->

From backend/app/core/hitl.py:
```python
def build_decisions(response_type: str, args: dict | None, action_requests: list) -> dict:
```

From backend/app/core/streaming.py:
```python
def _extract_text(content: Any) -> str:
```

From backend/app/core/exceptions.py:
```python
class InvalidDecisionError(BusinessError):
    status_code = 400
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: DI 改造 — 服务从单例改为 Depends 注入</name>
  <files>
    backend/app/core/agent.py
    backend/app/services/task.py
    backend/app/services/session.py
    backend/app/services/memory.py
    backend/app/api/deps.py
    backend/app/api/chat.py
    backend/app/api/sessions.py
    backend/app/api/memory.py
    backend/app/main.py
  </files>
  <action>
**改动目标：** 服务实例的创建和获取统一到 `deps.py`，API 路由通过 `Depends` 注入，模块级单例删除。

**1. `backend/app/core/agent.py` — AgentService 接受可选参数**

`__init__` 新增 `checkpointer=None, store=None` 参数。`create_agent` 中用 `self._checkpointer or db.checkpointer` 和 `self._store or db.store` 替代直接访问 `db.checkpointer`/`db.store`。这样测试可以注入 mock checkpointer/store。

```python
class AgentService:
    def __init__(self, checkpointer=None, store=None):
        self._checkpointer = checkpointer
        self._store = store

    async def create_agent(self, *, system_prompt: str | None = None):
        llm_chat, _ = get_llm()
        mcp_tools = await get_mcp_tools()
        custom_tools = get_custom_tools()
        interrupt_on = get_hitl_config(custom_tools)

        checkpointer = self._checkpointer or db.checkpointer
        store = self._store or db.store

        return create_deep_agent(
            ...,
            checkpointer=checkpointer,
            store=store,
            backend=StoreBackend(),
            ...
        )
```

**2. `backend/app/services/task.py` — TaskService 接受可选 agent_service**

`__init__` 新增 `agent_service: AgentService | None = None`，默认 lazy 创建。**删除**文件末尾的 `task_service = TaskService()`。

```python
class TaskService:
    def __init__(self, agent_service: AgentService | None = None):
        self._agent_service = agent_service or AgentService()
        self._running: dict[str, asyncio.Task] = {}
```

**3. `backend/app/services/session.py` — 删除末尾 `session_service = SessionService()`**

SessionService 类本身不需要改 `__init__`（它无外部依赖，只用 redis_manager 属性）。只删除模块级单例。

**4. `backend/app/services/memory.py` — 删除末尾 `memory_service = MemoryService()`**

同上，MemoryService 类本身不需要改（它通过 `db.store` 属性访问）。只删除模块级单例。

**5. `backend/app/api/deps.py` — 新增三个 provider 函数**

在现有 `get_current_user` 下方添加：

```python
from app.services.task import TaskService
from app.services.session import SessionService
from app.services.memory import MemoryService

_task_service: TaskService | None = None
_session_service: SessionService | None = None
_memory_service: MemoryService | None = None

def get_task_service() -> TaskService:
    global _task_service
    if _task_service is None:
        _task_service = TaskService()
    return _task_service

def get_session_service() -> SessionService:
    global _session_service
    if _session_service is None:
        _session_service = SessionService()
    return _session_service

def get_memory_service() -> MemoryService:
    global _memory_service
    if _memory_service is None:
        _memory_service = MemoryService()
    return _memory_service
```

注意：使用 lazy 单例模式（非 `lru_cache`），因为 `lru_cache` 不能被 `dependency_overrides` 覆盖。`dependency_overrides` 要求 key 是同一个 callable 对象，provider 函数正好满足。

**6. `backend/app/api/chat.py` — 改用 Depends 注入**

- 删除 `from app.services.task import task_service`
- 删除 `from app.services.session import session_service`
- 新增 `from app.api.deps import get_task_service, get_session_service`
- `invoke` 函数签名加参数：
  ```python
  async def invoke(
      request: ChatRequest,
      user_id: str = Depends(get_current_user),
      task_svc: TaskService = Depends(get_task_service),
      session_svc: SessionService = Depends(get_session_service),
  ):
  ```
- 函数体中 `task_service` → `task_svc`，`session_service` → `session_svc`
- `resume` 函数同理，只需注入 `task_svc`（resume 不用 session_service）
- `stream` 函数不需要改（它只用 `task_bus`，那是基础设施层，不是服务）

**7. `backend/app/api/sessions.py` — 改用 Depends 注入**

- 删除 `from app.services.session import session_service`
- 新增 `from app.api.deps import get_session_service`
- 每个路由函数加 `session_svc: SessionService = Depends(get_session_service)`
- 函数体中 `session_service` → `session_svc`

**8. `backend/app/api/memory.py` — 改用 Depends 注入**

- 删除 `from app.services.memory import memory_service`
- 新增 `from app.api.deps import get_memory_service`
- 每个路由函数加 `memory_svc: MemoryService = Depends(get_memory_service)`
- 函数体中 `memory_service` → `memory_svc`

**9. `backend/app/main.py` — lifespan 使用 deps provider**

- 删除 `from app.services.task import task_service`
- 新增 `from app.api.deps import get_task_service`
- `lifespan` 中 `await task_service.cancel_all()` → `await get_task_service().cancel_all()`

**自查清单：**
- 全局搜索 `from app.services.task import task_service` — 应该为 0 结果
- 全局搜索 `from app.services.session import session_service` — 应该为 0 结果
- 全局搜索 `from app.services.memory import memory_service` — 应该为 0 结果
- 三个服务模块末尾的 `xxx_service = XxxService()` 全部删除
  </action>
  <verify>
    <automated>cd /Users/neuron/文稿/2\ 私人/ReActAgents/backend && python -c "from app.main import app; print('import ok')" && grep -rn "task_service = TaskService()" app/ && echo "FAIL: singleton still exists" || echo "PASS: no singleton"</automated>
  </verify>
  <done>
- 三个服务模块不再导出模块级单例
- deps.py 导出 get_task_service / get_session_service / get_memory_service
- 所有 API 路由通过 Depends 获取服务实例
- main.py lifespan 通过 get_task_service() 获取实例
- `python -c "from app.main import app"` 不报错
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 编写基础测试 — hitl 单元测试 + streaming 单元测试 + chat API 集成测试</name>
  <files>
    backend/tests/conftest.py
    backend/tests/test_core/__init__.py
    backend/tests/test_core/test_hitl.py
    backend/tests/test_core/test_streaming.py
    backend/tests/test_api/__init__.py
    backend/tests/test_api/test_chat.py
  </files>
  <behavior>
    **test_hitl.py — build_decisions 边界测试：**
    - approve + 单个 action → {"decisions": [{"type": "approve"}]}
    - approve + 3 个 action_requests → decisions 长度 3
    - reject + args 带 message → decisions 含 message
    - reject + 无 args → decisions 无 message 键
    - edit + 合法 args(含 edited_args dict + name) → 正确 edit decision
    - edit + 多个 action_requests → raises InvalidDecisionError("多工具调用不支持单次 edit")
    - edit + args 为 None → raises InvalidDecisionError("edit 需要提供参数")
    - 未知 response_type "xyz" → raises InvalidDecisionError
    - "accept" 别名 → 等价于 approve
    - "response" 别名 → 等价于 reject

    **test_streaming.py — _extract_text 类型分支：**
    - 字符串 "hello" → "hello"
    - 字符串列表 ["a", "b"] → "ab"
    - dict 列表 [{"type": "text", "text": "x"}] → "x"
    - 混合列表 ["a", {"type": "text", "text": "b"}, {"type": "image"}] → "ab"
    - None → ""
    - 整数 123 → ""
    - 空列表 [] → ""

    **test_chat.py — API 集成测试（mock 注入验证 DI 可行）：**
    - POST /api/chat/invoke 正常 → 200 + 含 task_id
    - POST /api/chat/resume 不存在的 task → 404
    - GET /health → 200
  </behavior>
  <action>
**1. `backend/tests/conftest.py` — 编写 fixtures**

```python
import pytest
from unittest.mock import AsyncMock, MagicMock
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.api.deps import get_task_service, get_session_service, get_memory_service


@pytest.fixture
def mock_task_service():
    svc = MagicMock()
    svc.start_invoke = AsyncMock(return_value="test-task-id")
    svc.start_resume = AsyncMock()
    svc.cancel_all = AsyncMock()
    return svc


@pytest.fixture
def mock_session_service():
    svc = MagicMock()
    svc.session_exists = AsyncMock(return_value=True)
    svc.touch = AsyncMock(return_value=True)
    svc.create_session = AsyncMock(return_value="test-session-id")
    svc.list_sessions = AsyncMock(return_value=[])
    svc.get_active_session_id = AsyncMock(return_value=None)
    svc.delete_session = AsyncMock(return_value=True)
    return svc


@pytest.fixture
def mock_memory_service():
    svc = MagicMock()
    svc.read = AsyncMock(return_value="")
    svc.write = AsyncMock(return_value="test-memory-id")
    return svc


@pytest.fixture
def test_app(mock_task_service, mock_session_service, mock_memory_service):
    app.dependency_overrides[get_task_service] = lambda: mock_task_service
    app.dependency_overrides[get_session_service] = lambda: mock_session_service
    app.dependency_overrides[get_memory_service] = lambda: mock_memory_service
    yield app
    app.dependency_overrides.clear()


@pytest.fixture
async def client(test_app):
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
```

注意：不启动 lifespan（不连接真实 DB/Redis）。httpx AsyncClient + ASGITransport 是 FastAPI 官方推荐的测试方式。

**2. `backend/tests/test_core/__init__.py` — 空文件**

**3. `backend/tests/test_core/test_hitl.py` — build_decisions 单元测试**

直接 import `from app.core.hitl import build_decisions` 和 `from app.core.exceptions import InvalidDecisionError`。按 behavior 列表逐个编写 test 函数。纯函数测试，不需要 async，不需要 fixture。

每个测试命名：`test_approve_single`、`test_approve_multiple`、`test_reject_with_message`、`test_reject_without_message`、`test_edit_valid`、`test_edit_multiple_actions_raises`、`test_edit_no_args_raises`、`test_invalid_type_raises`、`test_accept_alias`、`test_response_alias`。

**4. `backend/tests/test_core/test_streaming.py` — _extract_text 单元测试**

注意 `_extract_text` 是模块私有函数（下划线前缀），直接 `from app.core.streaming import _extract_text` 即可。纯函数测试。

测试命名：`test_string`、`test_string_list`、`test_dict_list`、`test_mixed_list`、`test_none`、`test_int`、`test_empty_list`。

**5. `backend/tests/test_api/__init__.py` — 空文件**

**6. `backend/tests/test_api/test_chat.py` — API 集成测试**

使用 conftest.py 中的 `client` 和 `mock_task_service` fixtures。

- `test_invoke_ok(client, mock_task_service)`: POST `/api/chat/invoke` body=`{"session_id": "s1", "query": "hello"}`，断言 200、response 含 `task_id`、`mock_task_service.start_invoke.assert_awaited_once()`
- `test_resume_not_found(client)`: 需要 mock `task_bus.get_task_meta` 返回 None。用 `unittest.mock.patch("app.api.chat.task_bus")` patch 掉 task_bus，设置 `task_bus.get_task_meta = AsyncMock(return_value=None)`。POST `/api/chat/resume` body=`{"task_id": "nonexistent", "response_type": "approve"}`，断言 404
- `test_health(client)`: GET `/health`，断言 200 + `{"status": "ok"}`
  </action>
  <verify>
    <automated>cd /Users/neuron/文稿/2\ 私人/ReActAgents/backend && python -m pytest tests/ -x -v 2>&1 | tail -40</automated>
  </verify>
  <done>
- pytest 全部通过（0 failures）
- test_hitl.py 覆盖 10 个 build_decisions 用例
- test_streaming.py 覆盖 7 个 _extract_text 用例
- test_chat.py 覆盖 invoke 200、resume 404、health 200 三个端点
- 所有测试通过 dependency_overrides 注入 mock，验证 DI 改造有效
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| N/A | 本次改动是内部重构+测试，不引入新的信任边界 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-oar-01 | T (Tampering) | deps.py global singletons | accept | 模块级全局变量与改造前行为一致，无新风险；生产环境不使用 dependency_overrides |
</threat_model>

<verification>
```bash
# 1. 确认单例已移除
cd backend
grep -rn "^task_service = TaskService()" app/ && echo "FAIL" || echo "OK: no task singleton"
grep -rn "^session_service = SessionService()" app/ && echo "FAIL" || echo "OK: no session singleton"
grep -rn "^memory_service = MemoryService()" app/ && echo "FAIL" || echo "OK: no memory singleton"

# 2. 确认 Depends 注入
grep -rn "Depends(get_task_service)" app/api/
grep -rn "Depends(get_session_service)" app/api/
grep -rn "Depends(get_memory_service)" app/api/

# 3. 全部测试通过
python -m pytest tests/ -x -v

# 4. 应用可正常 import（不启动服务器）
python -c "from app.main import app; print('OK')"
```
</verification>

<success_criteria>
- 三个服务模块不再导出模块级单例，全部通过 deps.py provider 获取
- API 路由全部通过 Depends 注入服务
- pytest 全部测试通过（hitl 10 用例 + streaming 7 用例 + API 3 用例 = 20 个测试）
- 应用可正常 import，无循环依赖
</success_criteria>

<output>
After completion, create `.planning/quick/260412-oar-di/260412-oar-SUMMARY.md`
</output>
