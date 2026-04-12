---
phase: quick-260412-njo
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/app/core/tools.py
  - backend/app/core/exceptions.py
  - backend/app/core/hitl.py
  - backend/app/services/task.py
  - backend/app/services/session.py
  - backend/app/main.py
  - backend/app/models/chat.py
  - backend/app/api/chat.py
autonomous: true
requirements: [MCP-CACHE, BIZ-EXCEPTIONS, IDENTITY-SPOOF, LIST-SESSIONS-N1]

must_haves:
  truths:
    - "MCP 工具列表在进程生命周期内只请求一次远端，后续 agent 创建复用缓存"
    - "core 层（hitl.py, task.py）不再依赖 fastapi.HTTPException"
    - "ChatRequest 不接受 user_id 字段，用户身份只来自 deps 注入"
    - "list_sessions 用 mget 批量取代逐个 get，Redis 调用从 N+1 降为 2"
  artifacts:
    - path: "backend/app/core/tools.py"
      provides: "缓存的 get_mcp_tools"
      contains: "_mcp_tools_cache"
    - path: "backend/app/core/exceptions.py"
      provides: "业务异常类"
      exports: ["TaskNotFoundError", "TaskStateError", "InvalidDecisionError"]
    - path: "backend/app/main.py"
      provides: "异常处理器注册"
      contains: "exception_handler"
    - path: "backend/app/services/session.py"
      provides: "批量查询 list_sessions"
      contains: "mget"
  key_links:
    - from: "backend/app/core/hitl.py"
      to: "backend/app/core/exceptions.py"
      via: "raise InvalidDecisionError"
      pattern: "InvalidDecisionError"
    - from: "backend/app/main.py"
      to: "backend/app/core/exceptions.py"
      via: "exception_handler 捕获 BusinessError"
      pattern: "exception_handler"
---

<objective>
后端 4 项评估修复：MCP 工具缓存、业务异常体系、堵住身份伪造、list_sessions N+1 查询。

Purpose: 消除每次请求的 MCP 网络开销，解耦 core 层对 FastAPI 的依赖，堵住 user_id 伪造漏洞，修复 Redis N+1 性能问题。
Output: 修改 8 个文件，新建 1 个文件（exceptions.py）。
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@backend/app/core/tools.py
@backend/app/core/hitl.py
@backend/app/services/task.py
@backend/app/services/session.py
@backend/app/main.py
@backend/app/models/chat.py
@backend/app/api/chat.py

<interfaces>
<!-- 执行者需要了解的现有接口 -->

From backend/app/infra/task_bus.py:
```python
STATUS_RUNNING = "running"
STATUS_INTERRUPTED = "interrupted"
STATUS_COMPLETED = "completed"
STATUS_ERROR = "error"

async def get_task_meta(task_id: str) -> dict | None: ...
async def set_task_status(task_id: str, status: str) -> None: ...
```

From backend/app/api/deps.py:
```python
async def get_current_user() -> str:
    """当前返回 settings.default_user_id，未来从 JWT 解析"""
    return settings.default_user_id
```

From backend/app/config.py:
```python
settings.amap_maps_api_key  # 高德 MCP key
settings.default_user_id    # 默认用户 ID
settings.session_ttl        # 会话过期时间
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: 缓存 MCP 工具列表 + 修复 list_sessions N+1</name>
  <files>backend/app/core/tools.py, backend/app/services/session.py</files>
  <action>
**backend/app/core/tools.py** — 给 `get_mcp_tools()` 加模块级缓存：
1. 添加模块级变量 `_mcp_tools_cache: list | None = None` 和 `_mcp_lock: asyncio.Lock | None = None`
2. 在 `get_mcp_tools()` 内部：用 lazy-init 的 asyncio.Lock（因为模块加载时可能没有事件循环），先检查缓存命中直接返回，未命中时加锁，double-check 后再创建 MultiServerMCPClient 并缓存结果
3. 新增 `async def refresh_mcp_tools() -> list` 强制清除缓存并重新获取，供未来手动刷新用
4. 导入 `asyncio`

**backend/app/services/session.py** — 修复 `list_sessions` 的 N+1：
1. 获取 `session_ids` 后，用 `self.client.mget([self._key(user_id, sid) for sid in session_ids])` 一次批量获取所有会话数据
2. 遍历结果，`raw` 为 None 的表示已过期，用 pipeline 批量 `srem` 清理（而非逐个 srem）
3. 保留原有的按 `last_updated` 倒序排序逻辑
  </action>
  <verify>
    <automated>cd /Users/neuron/文稿/2\ 私人/ReActAgents && python -c "
import ast, sys
# 验证 tools.py 有缓存变量
src = open('backend/app/core/tools.py').read()
assert '_mcp_tools_cache' in src, 'missing cache variable'
assert 'asyncio' in src, 'missing asyncio import'
assert 'refresh_mcp_tools' in src, 'missing refresh function'
# 验证 session.py 用 mget
src2 = open('backend/app/services/session.py').read()
assert 'mget' in src2, 'missing mget in list_sessions'
print('PASS')
"</automated>
  </verify>
  <done>
    - get_mcp_tools() 首次调用走网络，后续直接返回缓存，asyncio.Lock 保证并发安全
    - refresh_mcp_tools() 可手动清缓存重新获取
    - list_sessions 用 mget 批量获取，Redis 调用从 N+1 降为 2（smembers + mget）
  </done>
</task>

<task type="auto">
  <name>Task 2: 定义业务异常体系 + 替换 core/service 层的 HTTPException</name>
  <files>backend/app/core/exceptions.py, backend/app/core/hitl.py, backend/app/services/task.py, backend/app/main.py</files>
  <action>
**新建 backend/app/core/exceptions.py**:
```python
class BusinessError(Exception):
    """业务异常基类，携带 HTTP 状态码供 handler 转换"""
    status_code: int = 400
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)

class TaskNotFoundError(BusinessError):
    status_code = 404

class TaskStateError(BusinessError):
    status_code = 409  # Conflict — 状态不允许该操作

class InvalidDecisionError(BusinessError):
    status_code = 400
```

**修改 backend/app/core/hitl.py**:
1. 删除 `from fastapi import HTTPException`
2. 添加 `from app.core.exceptions import InvalidDecisionError`
3. 将三处 `raise HTTPException(status_code=400, detail=...)` 替换为 `raise InvalidDecisionError(...)`
   - 不支持的响应类型 → `InvalidDecisionError(f"不支持的响应类型: {response_type}")`
   - 多工具调用不支持单次 edit → `InvalidDecisionError("多工具调用不支持单次 edit")`
   - edit 需要提供参数 → `InvalidDecisionError("edit 需要提供参数")`
   - edited_args 必须是 JSON 对象 → `InvalidDecisionError("edited_args 必须是 JSON 对象")`

**修改 backend/app/services/task.py**:
1. 添加 `from app.core.exceptions import TaskNotFoundError, TaskStateError`
2. `start_resume` 中第 49 行：`raise ValueError(...)` → `raise TaskNotFoundError(f"task {task_id} 不存在或已过期")`
3. `start_resume` 中第 51 行：`raise ValueError(...)` → `raise TaskStateError(f"task {task_id} 当前状态 {meta['status']}，无法 resume")`

**修改 backend/app/main.py**:
1. 添加 `from fastapi.responses import JSONResponse`
2. 添加 `from app.core.exceptions import BusinessError`
3. 在 `app = FastAPI(...)` 之后、CORS 中间件之前，注册异常处理器：
```python
@app.exception_handler(BusinessError)
async def business_error_handler(request, exc: BusinessError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message},
    )
```
  </action>
  <verify>
    <automated>cd /Users/neuron/文稿/2\ 私人/ReActAgents && python -c "
import ast, sys
# 验证 hitl.py 不再 import HTTPException
src = open('backend/app/core/hitl.py').read()
assert 'HTTPException' not in src, 'hitl.py still imports HTTPException'
assert 'InvalidDecisionError' in src, 'hitl.py missing InvalidDecisionError'
# 验证 task.py 不再用 ValueError
src2 = open('backend/app/services/task.py').read()
assert 'TaskNotFoundError' in src2, 'task.py missing TaskNotFoundError'
assert 'raise ValueError' not in src2, 'task.py still raises ValueError'
# 验证 exceptions.py 存在
src3 = open('backend/app/core/exceptions.py').read()
assert 'BusinessError' in src3
assert 'TaskNotFoundError' in src3
assert 'TaskStateError' in src3
assert 'InvalidDecisionError' in src3
# 验证 main.py 注册了 handler
src4 = open('backend/app/main.py').read()
assert 'exception_handler' in src4, 'main.py missing exception_handler'
assert 'BusinessError' in src4, 'main.py missing BusinessError import'
print('PASS')
"</automated>
  </verify>
  <done>
    - core/exceptions.py 定义 BusinessError 基类 + 3 个子类，各携带语义化的 status_code
    - hitl.py 零 fastapi 依赖，用 InvalidDecisionError 替代 HTTPException
    - task.py 用 TaskNotFoundError/TaskStateError 替代 ValueError
    - main.py 注册 exception_handler 将 BusinessError 转为 JSONResponse
    - API 路由层（chat.py resume）中已有的 HTTPException 可保留——它们在路由层本身使用是合理的
  </done>
</task>

<task type="auto">
  <name>Task 3: 堵住身份伪造 — 移除 ChatRequest.user_id</name>
  <files>backend/app/models/chat.py, backend/app/api/chat.py</files>
  <action>
**修改 backend/app/models/chat.py**:
1. 删除 `ChatRequest` 的 `user_id: Optional[str] = None` 字段（第 10 行）及其注释
2. 保留其他字段不变

**修改 backend/app/api/chat.py**:
1. 第 37 行 `user_id = request.user_id or user_id` → 删除这一行。直接使用 `Depends(get_current_user)` 注入的 `user_id`
2. 确认后续代码中的 `user_id` 引用都指向注入值（不需要其他改动）
  </action>
  <verify>
    <automated>cd /Users/neuron/文稿/2\ 私人/ReActAgents && python -c "
import ast, sys
# 验证 ChatRequest 不再有 user_id
src = open('backend/app/models/chat.py').read()
tree = ast.parse(src)
for node in ast.walk(tree):
    if isinstance(node, ast.ClassDef) and node.name == 'ChatRequest':
        fields = [n.target.id for n in node.body if isinstance(n, ast.AnnAssign) and isinstance(n.target, ast.Name)]
        assert 'user_id' not in fields, f'ChatRequest still has user_id, fields={fields}'
# 验证 chat.py 不再引用 request.user_id
src2 = open('backend/app/api/chat.py').read()
assert 'request.user_id' not in src2, 'chat.py still references request.user_id'
print('PASS')
"</automated>
  </verify>
  <done>
    - ChatRequest 不再接受 user_id，客户端无法通过请求体伪造身份
    - invoke 端点直接使用 deps 注入的 user_id（当前来自 settings.default_user_id，未来来自 JWT）
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client -> API | 客户端请求携带的数据进入 FastAPI 路由层 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-quick-01 | Spoofing | ChatRequest.user_id | mitigate | 移除 user_id 字段，身份只来自服务端注入（Task 3） |
| T-quick-02 | Tampering | hitl build_decisions | mitigate | InvalidDecisionError 拒绝非法 response_type（Task 2） |
| T-quick-03 | Denial of Service | get_mcp_tools 每次网络调用 | mitigate | 缓存工具列表，消除重复网络调用（Task 1） |
</threat_model>

<verification>
全部 3 个 task 的 verify 脚本通过。手动检查：
1. `grep -c 'HTTPException' backend/app/core/hitl.py` 应输出 0
2. `grep -c 'mget' backend/app/services/session.py` 应输出 >= 1
3. `grep -c '_mcp_tools_cache' backend/app/core/tools.py` 应输出 >= 1
4. `grep -c 'user_id' backend/app/models/chat.py` 应输出 0（ChatRequest 中）
</verification>

<success_criteria>
- MCP 工具缓存：首次调用走网络创建客户端，后续直接返回缓存列表
- 业务异常体系：core 层和 service 层零 FastAPI 依赖，异常由 main.py handler 统一转 HTTP 响应
- 身份伪造：ChatRequest 不接受 user_id，客户端无法覆盖服务端身份
- N+1 修复：list_sessions 仅 2 次 Redis 调用（smembers + mget），不再逐个 get
</success_criteria>

<output>
After completion, create `.planning/quick/260412-njo-mcp-list-sessions-n-1/260412-njo-SUMMARY.md`
</output>
