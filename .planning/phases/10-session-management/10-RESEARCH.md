# Phase 10: Session Management - Research

**Researched:** 2026-04-20
**Domain:** LangGraph checkpoint history + SSE 生命周期 + Zustand 双 store 协作 + Redis Session 扩展
**Confidence:** HIGH（后端路径 / 前端路径 / 协议）· MEDIUM（D-01 历史 HITL 状态还原）

## Summary

Phase 10 的核心工作面分为四层：
1. **后端新增 `GET /api/sessions/{session_id}/messages`**：从 `AsyncPostgresSaver.aget_tuple` / `CompiledStateGraph.aget_state` 读取最终 checkpoint，遍历 `state.values["messages"]`，把 `HumanMessage / AIMessage / ToolMessage` 成对映射为 `Message.segments`。Phase 10 能够可靠还原的是 **text + tool pill (done/rejected)**；**历史 HITL 三态（approved/rejected/feedback）无法从 checkpoint 可靠还原**，这是决策级发现，详见 §Risks D-01。
2. **Session 存储扩展**：`SessionService` 目前以 JSON 写入 STRING（`SET key json ex=TTL`），**不是 CONTEXT.md 里误写的 HASH**。新增 `title` 字段只需在 JSON dict 里加键、在 `create_session` 接可选参数、新增 `update_title` 方法；不要改动 HASH 接口（不存在）。
3. **前端双 store 与 useSSE 生命周期**：按 D-14/D-15 拆出 `session-store`，`activeSessionId` 迁入；`chat-store` 新增 `loadHistory(messages)`（不触发 reset 副作用）；`useSSE` 依赖数组加入 `activeSessionId`，effect cleanup 自然关闭旧 EventSource。选择器返回的 Zustand action 是稳定引用，**不需要额外 useCallback**。
4. **Session→Task 反向索引缺失**（D-03 的真正阻塞点）：当前 `task_bus` 只有 `task:{task_id}` HASH，没有 `session_id -> task_id` 索引。切换会话时无法廉价地查"该会话当前是否仍有 running/interrupted task"。推荐决策补丁见 §Risks。

**Primary recommendation:** 先落地补丁 —— 在 SessionService 的 session JSON 里加 `last_task_id: str | None` 字段，`TaskService.start_invoke` 写入、`start_resume` 续写、terminal 状态时不清除（或写 null，见 §Risks）。这样 D-03 的 reattach 只需 `session.last_task_id + task_bus.get_task_meta(task_id)` 两次读取即可判定是否有 unfinished task。

## User Constraints (from CONTEXT.md)

### Locked Decisions

**历史消息重建（CHAT-08）**
- **D-01:** 全量还原 segments — 新增后端端点 `GET /api/sessions/{session_id}/messages`，从 LangGraph checkpoint 的 messages 列表中抽取 user/assistant 文本、ToolMessage 构造为 `{type:"tool", status:"done"}` pill、历史 HITL 还原为 `{type:"hitl", status: "approved"|"rejected"|"feedback"}`（pending 只会出现在仍在 interrupted 的 task，由 D-02 处理）。
- **D-02:** 历史中的 HITL 卡片一律锁定不可交互 — 按钮 disabled，仅展示"已批准/已拒绝/已反馈"pill 收起态，避免二次审批风险。
- **D-03:** 加载历史后检测目标会话是否有 running/interrupted 的 task（查询 TaskService 按 session_id 查最近 task 状态）。若有则把该 task_id 写入 `currentTaskId` 触发 useSSE 用 `from_id=0` reattach；没有就保持 idle。Phase 10 实现 happy-path reattach（SSE stream 仍在 Redis Stream 未过期），完整 HITL 状态恢复 defer 到 Phase 12 RESIL-02。

**会话列表展示**
- **D-04:** 后端 session Redis HASH 新增 `title` 字段（string，空串默认）。`SessionService.create_session` 初始化为 `""`；首次 invoke 时若 title 为空，由 TaskService/SessionService 提取 user query 前 30 字符写回。列表空 title fallback 显示 `新会话`。
- **D-05:** 侧边栏按 `last_updated` 相对时间分组：`今天 / 昨天 / 7天内 / 更早`。组内按 last_updated 倒序。分组标题字号 12px/`text-quaternary`，会话项标题 14px/`text-secondary`，单行溢出省略。
- **D-06:** 当前活跃会话项高亮（`bg: rgba(255,255,255,0.05)` + 左侧 2px `border-left-color: #5e6ad2` 品牌色轨）。非活跃项 hover 仅背景变 `rgba(255,255,255,0.03)`。不显示会话状态图标（idle/streaming），保持极简。

**切换会话 & SSE 生命周期**
- **D-07:** 无提示直接切换 — 用户点其他会话时，不论当前是否 streaming/interrupted，立刻切换。后端 task 保留（Redis Stream 自然缓存事件至 TTL），切回原会话时由 D-03 reattach 机制恢复观察。没有确认弹窗。
- **D-08:** `useSSE` hook 依赖数组加入 `activeSessionId`。切换 session 时触发 cleanup（关闭旧 EventSource）+ 新的 effect（若新 session 有 unfinished task，用 from_id=0 连上）。sessionId + taskId 双钥保证连接准确重建。
- **D-09:** 切换会话时前端行为顺序：① 关闭当前 SSE；② 清空 `messages` / `errorMessage`；③ 更新 `activeSessionId`；④ 拉历史；⑤ 若历史尾部检测出未完成 task 则 `setCurrentTaskId` 触发 reattach。

**新建 & 删除交互**
- **D-10:** 点击"新建会话"按钮为**纯前端操作** — 仅调 `chat-store.reset()` 并生成新 `activeSessionId`（客户端 uuid）。首次 `invokeChat` 时后端在 TaskService 路径内幂等 `session_exists` 检查，不存在则 `SessionService.create_session(session_id=...)` 写 Redis。避免未使用的空会话垃圾堆积。
- **D-11:** 删除会话采用 hover 露出删除按钮（垃圾桶图标，仅当前 hover 项可见，右侧紧凑）。单击**立即**调 `DELETE /api/sessions/{id}`，用 sonner toast 显示"已删除 [title]"+"撤销"按钮，撤销超时 **8 秒**。撤销实现：前端保留已删除 session meta，点撤销时调 `POST /api/sessions`（带原 session_id）重写 Redis。超时后不做后端额外动作（已真删）。
- **D-12:** 删除当前活跃会话后自动落到列表**下一条**（按 last_updated 排序的下一项）。空列表时 reset 到"新建会话"空态（placeholder 文案 + 输入框聚焦）。
- **D-13:** 删除按钮必须用 `e.stopPropagation()` 避免冒泡触发切换。

**前端数据层扩展**
- **D-14:** 新建 `frontend/src/stores/session-store.ts`（Zustand，domain-sliced 与 chat-store 并列）— 职责：维护 `sessions: Session[]`、`activeSessionId`、`loadSessions / switchTo / createLocal / deleteOptimistic / restoreSession`。历史消息加载后的 `messages` 写入 `chat-store` 不在 session-store 里。
- **D-15:** `activeSessionId` 迁出 chat-store — 当前在 chat-store 里，职责分离后由 session-store 持有；chat-store 只保留 messages/status/taskId。两 store 通过 subscribe 或在 page.tsx 层面组合。
- **D-16:** 切换会话时使用 `chat-store.reset({ keepSessionId: true })` 或新增 `chat-store.loadHistory(messages)` 方法注入还原的 segments，不要触发 reset 副作用生成新 id。

**后端扩展清单（新增 + 修改）**
- **D-17:** 新端点 `GET /api/sessions/{session_id}/messages` — 从 `AsyncPostgresSaver` checkpointer 读取 thread_id=session_id 的最终 state，遍历 `state["messages"]` 映射为 segments（规则详见 D-01）。响应：`{messages: Message[], active_task: {task_id, status} | null}`。
- **D-18:** `SessionService` 扩展 `title` 字段：`create_session` 接受可选 `title`；新增 `update_title(session_id, title)`。`list_sessions` 返回值包含 title。
- **D-19:** TaskService 或 chat invoke 路径：首次 invoke 时若 session.title 为空，取 query 前 30 字符（用 `len` 截断而非 tokenize）调用 `update_title`。
- **D-20:** 端点 `POST /api/sessions` 接受可选 body `{session_id?: string, title?: string}`，用于"隐式创建" + "撤销删除"两种场景。若 session_id 已存在则幂等返回现有 session。

### Claude's Discretion

- sonner toast 撤销按钮的具体样式（遵循 Linear 设计 token 即可）
- 侧边栏会话项 hover 动效（过渡时长/曲线）
- 分组标题是否 sticky
- 首次进入页面时是否自动选中最近一条会话（建议：是，若 `list_sessions` 非空）
- 历史消息加载中的骨架屏样式
- `active_task` 探测 SQL/Redis 查询细节（可通过 TaskService.get_by_session 或扫描 task:* HASH）

### Deferred Ideas (OUT OF SCOPE)

- HITL 页面刷新恢复（从 task meta 还原 pending 审批）→ Phase 12 RESIL-02
- SSE 断线自动重连（Last-Event-ID / retry backoff）→ Phase 12 RESIL-01
- 会话手动改名 / 编辑 title → 未来增强，非核心
- 会话搜索 / 过滤、批量删除、归档区、会话状态图标、键盘快捷键（Ctrl+K 切换）、消息条数统计 → 未来增强

## Phase Requirements

| ID | 描述 | 研究支持 |
|----|------|---------|
| SESS-01 | 侧边栏展示会话列表，支持新建 | 后端 `GET /api/sessions` 已存在；前端 session-store `loadSessions` + Sidebar 渲染（分组/hover） |
| SESS-02 | 用户可以切换到不同会话 | D-07/D-08/D-09 落点清晰：关闭 SSE → 清空 chat-store → 切 activeSessionId → 拉历史 → 条件 reattach |
| SESS-03 | 切换会话时旧 SSE 连接正确关闭，不出现泄漏 | useSSE effect cleanup；activeSessionId 加入依赖数组；Zustand action 是稳定引用 |
| SESS-04 | 用户可以删除不需要的会话 | `DELETE /api/sessions/{id}` 已存在；前端乐观删除 + sonner undo toast + `POST /api/sessions` 幂等恢复 |
| CHAT-08 | 切换时历史消息正确加载 | 新 `GET /{id}/messages` 端点；前端 `loadHistory(messages)` action；checkpoint 遍历映射表详见 §Architecture Patterns |

## Project Constraints (from CLAUDE.md)

- **中文回复所有交互文档**（本研究、Plan、commit message 皆中文）
- **外科手术式改动** — 不"顺手改进"现有 chat-store 的其他字段、不改格式、只拆出 activeSessionId 相关逻辑
- **简洁优先** — 8s undo 不要塞复杂的 "revoke 队列"抽象，单条 `deletedPending: Session | null` 即可
- **目标驱动 + 可验证 check** — 每个新端点必须带 pytest 用例；前端每个 store action 必须能被 page.tsx 组合层 end-to-end 触发
- **Design System 严格遵循** `DESIGN.md` Linear token — 不自造颜色 / 字重 / 间距（Phase 09 已在 `globals.css` 定义 CSS vars，直接用）

## Standard Stack

### Core（已在项目中）

| 库 | 版本 | 用途 | 为什么标准 |
|----|------|------|----------|
| langgraph | 1.1.6 | `CompiledStateGraph.aget_state()` 读取 checkpoint | [VERIFIED: backend/pyproject.toml] 唯一支持 checkpoint 还原的官方路径 |
| langgraph-checkpoint-postgres | 3.0.5 | `AsyncPostgresSaver.aget_tuple` | [VERIFIED: Context7 langgraph-python] 后端已 `setup()` 建表 |
| fastapi | 0.115.12 | 新 `GET /{id}/messages` 端点 | [VERIFIED: CLAUDE.md] 已全局使用 |
| redis (async) | — | session STRING + user_sessions SET + task_bus HASH | [VERIFIED: app/infra/redis.py] 已有连接池 |
| next | 15.5 | 前端框架 | [VERIFIED: frontend/package.json] |
| react | 19 | UI | [VERIFIED: frontend/package.json] |
| zustand | 5.0.12 | 双 store（session + chat） | [VERIFIED: frontend/package.json] 已有 chat-store 使用 |
| sonner | 2.0.7 | toast + 撤销按钮 | [VERIFIED: frontend/package.json] Phase 08/09 已用 `toast.error` |
| lucide-react | — | 垃圾桶 / 加号图标（Trash2, Plus） | [VERIFIED: frontend/package.json] Phase 09 HitlCard 已用 |

### Supporting

| 库 | 用途 | 何时用 |
|----|------|-------|
| 内置 `EventSource` | 保持 useSSE 原有协议一致 | 不引入 fetch-event-source，Phase 08 已决策 |
| `date-fns` 或自写 | 相对时间分组（今天/昨天/7天内/更早） | 若只需四分组，**建议自写 10 行纯函数**（简洁优先原则），不引入依赖 |

### Alternatives Considered

| 替代方案 | 为什么不选 |
|---------|----------|
| `zustand/middleware subscribeWithSelector` 跨 store 订阅 | 简洁优先 — 在 page.tsx 直接组合两个 `useXStore(selector)` 即可，不需要中间件 |
| `fetch-event-source` 替代原生 EventSource | Phase 08 已决策用 fetch+ReadableStream / 原生 EventSource；Phase 10 不改协议 |
| `PATCH /api/sessions/{id}` 修改 title | 简洁优先 — `title` 自动生成，用户不改，不需要独立端点；内部由 `SessionService.update_title` 完成 |
| Redis HASH 存 session 字段 | **现状就不是 HASH**，是 STRING+JSON；CONTEXT.md 误描述；沿用现有 JSON 模型改动最小 |

**Version verification:**

```bash
# backend — 已固定在 pyproject.toml:
langgraph==1.1.6
langgraph-checkpoint-postgres==3.0.5  # [VERIFIED: backend/pyproject.toml]
fastapi==0.115.12
# frontend:
next 15.5.4  # [VERIFIED: frontend/package.json]
zustand ^5.0.12
sonner ^2.0.7
```

## Architecture Patterns

### 推荐项目结构（新增 / 改动）

```
backend/app/
├── api/
│   └── sessions.py          # 修改：POST 接 body，新增 GET /{id}/messages
├── services/
│   ├── session.py           # 修改：data 字典加 title 字段；新增 update_title
│   └── task.py              # 修改：start_invoke 写 session.last_task_id；提取 title
└── core/
    └── history.py           # 【新增】checkpoint messages → segments 映射（单文件纯函数）

frontend/src/
├── stores/
│   ├── chat-store.ts        # 修改：移除 activeSessionId + 相关 reset 副作用；新增 loadHistory
│   └── session-store.ts     # 【新增】sessions / activeSessionId / 所有 session 相关 actions
├── hooks/
│   └── use-sse.ts           # 修改：依赖数组加入 activeSessionId
├── lib/
│   ├── api.ts               # 修改：新增 listSessions / deleteSession / createSession / loadHistory
│   ├── types.ts             # 修改：新增 Session 类型
│   └── time-group.ts        # 【新增】相对时间分组纯函数
├── components/sidebar/
│   ├── sidebar.tsx          # 修改：骨架 → 真实列表渲染
│   ├── session-item.tsx     # 【新增】单条会话（hover 删除按钮）
│   └── session-group.tsx    # 【新增】分组标题 + 组内列表
└── app/page.tsx             # 修改：组合两个 store；handleSwitch / handleDelete / handleNew
```

### Pattern 1: Checkpoint 历史还原（后端）

**做什么:** 从 `AsyncPostgresSaver` 读 thread_id=session_id 的最终状态，映射 LangChain 消息到前端 `Message.segments`。

**何时用:** `GET /api/sessions/{session_id}/messages` 的处理函数。

**示例（建议写在 `backend/app/core/history.py`）:**

```python
# Source: [CITED: LangGraph Checkpoint docs via Context7]
# AsyncPostgresSaver / CompiledStateGraph.aget_state() 返回 StateSnapshot
# 结构：StateSnapshot(values={"messages": [...]}, next, config, metadata, tasks, interrupts)

from typing import Any
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
from app.infra.database import db


async def load_history_for_session(session_id: str) -> dict:
    """返回 {messages: [...], active_task: None}（active_task 由上层决定）"""
    if db.checkpointer is None:
        return {"messages": [], "active_task": None}
    # 直接用 graph.aget_state 更直观（AgentService.get_agent() 拿到已编译 graph 后调用）
    # 或用 checkpointer.aget_tuple 低层 API — 两者效果等价
    from app.core.agent import AgentService
    agent = await AgentService().create_agent()
    state = await agent.aget_state({"configurable": {"thread_id": session_id}})
    if state is None:
        return {"messages": [], "active_task": None}
    raw_messages = state.values.get("messages", [])
    return {"messages": messages_to_segments(raw_messages), "active_task": None}


def messages_to_segments(raw: list[Any]) -> list[dict]:
    """
    LangChain messages 有序列表 → 前端 Message[]（role + segments）

    规则（Phase 10 可靠版）：
    - HumanMessage → Message{role: "user", segments: [{type:"text", content}]}
    - AIMessage:
        - content 文本 → {type: "text", content}
        - tool_calls[] → 每个 tool_call 产生一个 {type: "tool", name, status: "done"} pill
          （历史里已执行完，状态统一为 done；失败由对应 ToolMessage 影响）
    - ToolMessage: 不单独出现在 segments（信息已在上一个 AIMessage 的 tool pill 里）
      但用于检测 reject：若 ToolMessage.content 以 "用户已主动取消..." 开头或匹配
      前端 reject 模板（见 Risks D-01），可将对应 tool pill status 改为 "rejected"
    - 合并：同一 AIMessage 的 text + tool calls 都归到同一 assistant Message
      连续 AIMessage 需要分别生成独立 Message（罕见场景，按 index 区分）

    Phase 10 落地：**不还原 HITL segment**（见 §Risks D-01）。Phase 12 RESIL-02
    若接入 task meta 持久化，再扩展本函数。
    """
    result: list[dict] = []
    for idx, msg in enumerate(raw):
        if isinstance(msg, HumanMessage):
            result.append({
                "id": f"hist-user-{idx}",
                "role": "user",
                "segments": [{"type": "text", "content": _extract_text(msg.content)}],
                "timestamp": _msg_timestamp(msg),
            })
        elif isinstance(msg, AIMessage):
            segments: list[dict] = []
            text = _extract_text(msg.content)
            if text:
                segments.append({"type": "text", "content": text})
            for tc in (getattr(msg, "tool_calls", None) or []):
                segments.append({
                    "type": "tool",
                    "name": tc.get("name", "unknown"),
                    "status": "done",  # 历史中统一 done；失败/拒绝由 Risks D-01 flag
                })
            if not segments:
                segments.append({"type": "text", "content": ""})
            result.append({
                "id": f"hist-ai-{idx}",
                "role": "assistant",
                "segments": segments,
                "timestamp": _msg_timestamp(msg),
            })
        # ToolMessage: 不追加 segment — 其信息已体现在上一个 AIMessage 的 tool pill
    return result


def _extract_text(content: Any) -> str:
    """复用 core/streaming._extract_text 的逻辑 —— 迁出成公共函数"""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            item if isinstance(item, str)
            else item.get("text", "") if isinstance(item, dict) and item.get("type") == "text"
            else ""
            for item in content
        )
    return ""


def _msg_timestamp(msg: Any) -> int:
    # LangChain message 没有时间戳字段；checkpoint 元数据里有，但跨 message 粒度太粗
    # 折中：返回 0，前端按顺序排列（本来就是顺序列表，不需要用 ts 排序）
    return 0
```

**备注:** `AgentService.create_agent()` 每次调用会创建新 graph 实例。建议：
1. 要么 **缓存一个"只读"graph** 仅用于 `aget_state`（不带 MCP 工具，减少开销）；
2. 要么直接用 `db.checkpointer.aget_tuple(config)` 绕开 graph。推荐方案 2，跳过 agent 创建：

```python
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

async def load_history_for_session(session_id: str) -> dict:
    if db.checkpointer is None:
        return {"messages": [], "active_task": None}
    config = {"configurable": {"thread_id": session_id}}
    ckpt_tuple = await db.checkpointer.aget_tuple(config)
    if ckpt_tuple is None:
        return {"messages": [], "active_task": None}
    # CheckpointTuple.checkpoint 是 dict，channel_values["messages"] 是 list
    raw = ckpt_tuple.checkpoint.get("channel_values", {}).get("messages", [])
    return {"messages": messages_to_segments(raw), "active_task": None}
```

### Pattern 2: Session→Task 反向索引（推荐方案 B：`last_task_id` 字段）

**做什么:** 切换到某 session 时能 O(1) 查出是否有 unfinished task。

**何时用:** D-03 reattach 检测。

**示例:**

```python
# Source: [VERIFIED: 现有 SessionService 已是 STRING+JSON]
# 在 SessionService.create_session 的 data 字典里加 last_task_id 字段

data = {
    "session_id": session_id,
    "user_id": user_id,
    "status": "idle",
    "title": title or "",
    "created_at": time.time(),
    "last_updated": time.time(),
    "last_task_id": None,  # 新增
}

# TaskService.start_invoke / start_resume 里：
await task_bus.create_task_meta(task_id, user_id, session_id)
await session_svc.set_last_task_id(session_id, task_id)  # 新方法

# GET /api/sessions/{id}/messages 的 active_task 组装：
session = await session_svc.get_session(session_id, user_id)
last_tid = session.get("last_task_id") if session else None
active_task = None
if last_tid:
    meta = await task_bus.get_task_meta(last_tid)
    if meta and meta.get("status") in {"running", "interrupted"}:
        active_task = {"task_id": last_tid, "status": meta["status"]}
```

**为什么选 B 不选 A（`session_tasks:{session_id}` SET）:**
- 方案 A 增加一个独立 Redis SET key，需要显式 TTL + 清理；方案 B 附生在已有 session JSON，生命周期与 session 一致（session TTL=3600 自然覆盖 task TTL=3600）。
- 方案 B 只支持"最近一次 task"语义，恰好就是 D-03 需要的；不需要历史 task 列表。
- 方案 B 改动更小：2 行代码 + 1 个新方法。

### Pattern 3: Zustand 双 store 协作（前端）

**做什么:** session-store 管 sessions 与 activeSessionId；chat-store 管 messages/status/taskId；page.tsx 组合。

**何时用:** D-14/D-15/D-16。

**示例:**

```typescript
// frontend/src/stores/session-store.ts (新建)
// Source: [VERIFIED: Context7 zustand docs - domain-sliced stores pattern]
import { create } from "zustand";
import type { Session } from "@/lib/types";

function newSessionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `session-${Date.now()}`;
}

type SessionState = {
  sessions: Session[];
  activeSessionId: string;
  deletedPending: Session | null;  // 8s undo 用，单条即可

  loadSessions: (items: Session[]) => void;
  setActive: (id: string) => void;
  createLocal: () => string;       // D-10：纯前端新建
  deleteOptimistic: (id: string) => void;  // 从 sessions 移除、写 deletedPending
  clearDeletedPending: () => void;
  restoreSession: (s: Session) => void;    // undo：重新插入 sessions
  replaceOrInsert: (s: Session) => void;   // 后端返回的权威数据覆盖
};

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSessionId: newSessionId(),
  deletedPending: null,

  loadSessions: (items) => set({ sessions: items }),
  setActive: (id) => set({ activeSessionId: id }),
  createLocal: () => {
    const id = newSessionId();
    set({ activeSessionId: id });
    return id;
  },
  deleteOptimistic: (id) => {
    const s = get().sessions.find((x) => x.id === id) ?? null;
    set({
      sessions: get().sessions.filter((x) => x.id !== id),
      deletedPending: s,
    });
  },
  clearDeletedPending: () => set({ deletedPending: null }),
  restoreSession: (s) =>
    set({
      sessions: [s, ...get().sessions].sort((a, b) => b.last_updated - a.last_updated),
      deletedPending: null,
    }),
  replaceOrInsert: (s) => {
    const exists = get().sessions.some((x) => x.id === s.id);
    set({
      sessions: exists
        ? get().sessions.map((x) => (x.id === s.id ? s : x))
        : [s, ...get().sessions].sort((a, b) => b.last_updated - a.last_updated),
    });
  },
}));
```

```typescript
// chat-store.ts 改动（只列 diff 思路，不整体重写）:
// 1. 移除 activeSessionId 字段 + reset 副作用里生成新 id 的代码
// 2. 新增 loadHistory(messages: Message[]):
//      set({ messages, errorMessage: null, status: "idle", currentTaskId: null })
// 3. reset 也需要一个 { keepSessionId?: true } 参数？——不需要
//    因为 activeSessionId 已经不在本 store 里，reset 自然不会触及。
```

### Pattern 4: useSSE 依赖 activeSessionId（前端）

**做什么:** 切换会话时 effect cleanup 自然关闭旧 EventSource。

**何时用:** D-08。

**示例:**

```typescript
// frontend/src/hooks/use-sse.ts 改动
// Source: [VERIFIED: 现有 hook + React 19 effect 依赖规则]
export function useSSE(taskId: string | null, sessionId: string): void {
  // ...全部 selector 保持不变（Zustand action 选择器返回稳定引用）

  useEffect(() => {
    if (!taskId) return;
    // ... 原逻辑不变
    return () => { eventSource.close(); };
  }, [
    taskId,
    sessionId,        // 新增 —— 切换 session 触发 cleanup
    appendToken, addToolSegment, updateToolSegment,
    addHitlSegment, finishMessage, setError, setStatus,
  ]);
}

// page.tsx 调用：
const activeSessionId = useSessionStore((s) => s.activeSessionId);
const currentTaskId = useChatStore((s) => s.currentTaskId);
useSSE(currentTaskId, activeSessionId);
```

### Pattern 5: 相对时间分组（前端）

**做什么:** 把 sessions 按 last_updated 分到四个桶。

**何时用:** Sidebar 渲染。

**示例（建议写 `frontend/src/lib/time-group.ts`）:**

```typescript
// Source: 自写 —— 简洁优先，不引 date-fns
import type { Session } from "@/lib/types";

export type TimeGroup = "today" | "yesterday" | "week" | "older";

const GROUP_LABELS: Record<TimeGroup, string> = {
  today: "今天",
  yesterday: "昨天",
  week: "7 天内",
  older: "更早",
};

function startOfToday(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function groupSessions(sessions: Session[], now = Date.now()): {
  group: TimeGroup;
  label: string;
  items: Session[];
}[] {
  const todayStart = startOfToday(now);
  const yesterdayStart = todayStart - 24 * 3600 * 1000;
  const weekStart = todayStart - 7 * 24 * 3600 * 1000;

  const buckets: Record<TimeGroup, Session[]> = {
    today: [], yesterday: [], week: [], older: [],
  };

  // last_updated 后端返回的是秒级 float（time.time()）—— 前端需 × 1000 转毫秒
  for (const s of sessions) {
    const ts = s.last_updated * 1000;
    if (ts >= todayStart) buckets.today.push(s);
    else if (ts >= yesterdayStart) buckets.yesterday.push(s);
    else if (ts >= weekStart) buckets.week.push(s);
    else buckets.older.push(s);
  }

  return (["today", "yesterday", "week", "older"] as const)
    .filter((g) => buckets[g].length > 0)
    .map((g) => ({
      group: g,
      label: GROUP_LABELS[g],
      items: buckets[g].sort((a, b) => b.last_updated - a.last_updated),
    }));
}
```

### Pattern 6: sonner undo toast（前端）

**做什么:** 删除后 8 秒撤销窗口。

**何时用:** D-11。

**示例:**

```typescript
// page.tsx handleDelete
// Source: [VERIFIED: sonner 2.0.7 docs - toast action + duration API]
import { toast } from "sonner";

async function handleDelete(session: Session) {
  deleteOptimistic(session.id);               // 1. UI 立即移除
  if (activeSessionId === session.id) {
    // D-12: 落到下一条；若空则 createLocal
    const next = sessions.find((s) => s.id !== session.id) ?? null;
    if (next) handleSwitch(next.id);
    else createLocal();
  }
  try {
    await deleteSession(session.id);          // 2. 立即后端删
  } catch (e) {
    restoreSession(session);                  // 回滚 UI
    toast.error("删除失败，请重试");
    return;
  }

  toast(`已删除 "${session.title || "新会话"}"`, {
    duration: 8000,
    action: {
      label: "撤销",
      onClick: async () => {
        try {
          const restored = await createSessionAPI({ session_id: session.id, title: session.title });
          restoreSession(restored);
        } catch {
          toast.error("撤销失败");
        }
      },
    },
  });
}
```

### Anti-Patterns to Avoid

- **❌ 切换 session 时 `reset()` chat-store** — 会触发 `createSessionId()` 生成新 id，破坏 activeSessionId 语义（它应该由 session-store 控制）。用 `loadHistory(messages)` 代替。
- **❌ 在 useSSE effect 里根据 `activeSessionId` 主动调 `eventSource.close()`** — cleanup 自然完成；主动 close 会造成 race。只需把 `activeSessionId` 加到依赖数组即可。
- **❌ 把 sessions 列表塞进 chat-store** — 违反 D-14/D-15 domain-sliced 原则。
- **❌ 用 setTimeout 实现 8s undo 队列** — sonner `duration: 8000` 就够了，不需要手管计时器。
- **❌ 渲染侧边栏时每次都 `new Date()` 算分组** — groupSessions 接受 `now` 参数，可在渲染时按 tick 传入；但对 MVP 每次渲染都算也可以（每个 item 最多 3 次比较）。
- **❌ 历史加载完用 `addAssistantMessage()` + `appendToken()`** — 会走 RAF token buffer，慢且没必要。直接 `set({ messages })`（loadHistory 就是这么做的）。
- **❌ 切换 session 不清空 `errorMessage`** — 会把 A 会话的错误带到 B 会话。D-09 ② 已明确要清。

## Don't Hand-Roll

| 问题 | 不要自建 | 用现成方案 | 为什么 |
|------|--------|-----------|--------|
| HTTP Streaming 连接 | 不要自写 WebSocket / 轮询 | 继续用原生 `EventSource`（Phase 08 决策） | Phase 08/09 已稳定运行，协议层无改动 |
| SSE 事件重放 | 不要在前端缓存事件 | Redis Stream + `from_id=0` 后端侧已实现 | task_bus.read_events 已支持 |
| Toast 撤销计时 | 不要写 setTimeout + clearTimeout | `toast(msg, { duration, action })` | sonner 2.0.7 内置 |
| Checkpoint 读取 | 不要直连 Postgres 查 state | `AsyncPostgresSaver.aget_tuple` 或 `graph.aget_state` | LangGraph 官方 API |
| UUID 生成 | 不要用 `Date.now()` 做 id | `crypto.randomUUID()`（已用） | 浏览器原生 |
| 时间分组 | 不要引 dayjs/moment | 10 行自写纯函数（§Pattern 5） | 只需 4 个桶 |
| Zustand 跨 store 订阅 | 不要用 subscribeWithSelector 中间件 | 在 page.tsx 层组合两个 `useXStore(selector)` | 简洁优先；middleware 开销不值 |

**Key insight:** Phase 10 的每一块都有成熟现成方案，主要工作是**组合 + 边界清理**，不要引入新复杂度。

## Runtime State Inventory

本 Phase 涉及 Redis session 字段扩展（加 `title`、`last_task_id`），需要盘点已存在会话的迁移影响：

| 分类 | 发现的项 | 需要的动作 |
|------|--------|----------|
| Stored data | 本地/开发环境 Redis 里现有 session key（`session:{user}:{id}`）的 JSON 没有 `title` / `last_task_id` 字段 | **读侧兼容即可** — `session.get("title", "")`、`session.get("last_task_id", None)`；无需 data migration。session TTL=3600 很快自然过期。 |
| Live service config | 无 —— 没有 n8n / Datadog 等外部注册 | 无 |
| OS-registered state | 无 | 无 |
| Secrets/env vars | 无（本 Phase 不改 config） | 无 |
| Build artifacts | 无（仅源码改动） | 无 |

**核心结论：** Session 扩展是 schema-less JSON 的追加字段，读侧兼容不需要显式数据迁移。session_ttl=3600s 足以让遗留数据自然消失。

## Common Pitfalls

### Pitfall 1: Zustand action 稳定引用被误解

**问题:** 开发者看到 useSSE 依赖数组里有 7 个 action，以为需要 useCallback 包装。
**原因:** Zustand `useStore((s) => s.action)` 返回的 action 函数是 store 内部定义的**单例**，引用终生不变；useEffect 依赖数组里有它不会引发 re-run。
**避免:** 保持现状；不要引入 useCallback。参考 Phase 08/09 的 use-sse.ts 已经这样写。
**警告信号:** 看到有人在 PR 里加 `useCallback` 包 store action。

### Pitfall 2: 切换会话时 `addAssistantMessage` 被误触发

**问题:** 切换后如果发送消息的代码路径还用老 sessionId，消息写到错误的 thread。
**原因:** React 18/19 的 state 闭包陷阱 —— handleSend 可能拿到 stale sessionId。
**避免:** handleSend 内部直接 `useSessionStore.getState().activeSessionId`，不依赖 selector 返回值。或者在 handleSend 入口参数化：`handleSend(text, sessionId)`。
**警告信号:** 快速切换会话后第一条消息"跑到错误会话里"。

### Pitfall 3: SSE reattach 的 from_id=0 重放冲突

**问题:** 切换回有 interrupted task 的会话，SSE 从 id=0 重放会再次 emit 所有历史 `token` / `tool` / `hitl` 事件，但 chat-store 已通过 loadHistory 注入了这些 segment —— 会重复。
**原因:** D-01 的历史还原 + D-03 的 reattach 重放是两条独立路径，协议层没互斥。
**避免:** **这是 Phase 10 的真实陷阱，需要明确约定：**
  - 方案 A（推荐）：`loadHistory` 只注入**已 finalize** 的 messages；reattach 时 chat-store 保留历史，useSSE 重放事件会追加到最后一个 assistant message 的新 segment —— 但这依赖 chat-store action（appendToken / addToolSegment）写到"最后一个 assistant message"，如果历史最后一条是 user message（interrupted 前用户刚发完、assistant 还没回复），反而是正确的。
  - 方案 B：`active_task` 存在时 loadHistory 剥离最后一个 AIMessage（让 SSE 重新生成）。复杂、容易错。
  - **规划时的落地点：** 验收脚本必须覆盖"interrupted 会话切回 + HITL 按钮可操作"场景（见 §Validation）。
**警告信号:** 切回 interrupted 会话时消息内容重复 / tool pill 翻倍。

### Pitfall 4: `last_updated` 不会自动更新

**问题:** 侧边栏"今天"组一直空，因为 session 只在创建时写 `last_updated`。
**原因:** `SessionService.touch()` 存在但没人调；现有代码路径里 chat invoke 不 touch session。
**避免:** 在 `TaskService.start_invoke` 里调 `session_svc.touch(session_id)`；或在 `GET /{id}/messages` 不 touch（只读）、invoke / resume 路径 touch。
**警告信号:** 新消息到达后侧边栏排序不变。

### Pitfall 5: 历史 ToolMessage reject 标记

**问题:** 用户在当前会话 reject 过工具，刷新重入时历史里的 tool pill 是绿勾（done）而非 rejected。
**原因:** `messages_to_segments` 目前对所有 tool_call 一律打 `status: "done"`。
**避免:** 两种路径：
  1. 启发式：检测对应 ToolMessage.content 是否匹配 reject 文案前缀（"用户已主动取消..."）—— 脆弱。
  2. 放弃还原三态，**只保留 done/rejected 的能区分就可以**（见 §Risks D-01）。
**警告信号:** 用户看到历史里本来被拒绝的操作显示"成功"，容易误以为已执行。

### Pitfall 6: 撤销删除时后端 `POST /api/sessions` 拒绝重复 id

**问题:** 现有 `create_session(session_id=...)` 内部不幂等 —— 如果 Redis 里已存在同 id，会覆盖 created_at 字段。
**原因:** D-20 要求幂等。当前 `SessionService.create_session` 只是 `SET ... EX`，实际上 **是幂等的**（覆盖），但语义上 created_at 会被重置。对"撤销删除"场景问题不大（已删除了，重写等于创建），但 title 需要从前端带回。
**避免:** `POST /api/sessions` body 明确支持 `{session_id?, title?}`；若 session_id 已存在，**忽略** 后续 title 改变并返回现有 session（更幂等）。或者：撤销删除用一个独立语义更清楚的端点（但简洁优先不建议）。
**警告信号:** 撤销删除后会话 created_at 跳到"现在"，排序异常。

## Code Examples

### 后端 `GET /api/sessions/{session_id}/messages` 端点

```python
# backend/app/api/sessions.py 新增
# Source: [VERIFIED: FastAPI dependency injection + CITED: Context7 langgraph checkpointer]
from app.core.history import load_history_for_session
from app.services.task import TaskService
from app.api.deps import get_task_service

@router.get("/{session_id}/messages")
async def get_session_messages(
    session_id: str,
    user_id: str = Depends(get_current_user),
    session_svc: SessionService = Depends(get_session_service),
    task_svc: TaskService = Depends(get_task_service),
):
    """返回某 session 的历史消息 + 活跃 task 状态。
    若 session 不存在且 checkpoint 也没有：返回空数组 200，不报 404（避免前端
    处理 404 与空态两种分支）。"""
    history = await load_history_for_session(session_id)
    session = await session_svc.get_session(session_id, user_id=user_id)
    active_task = None
    last_tid = session.get("last_task_id") if session else None
    if last_tid:
        active_task = await task_svc.get_active_task_info(last_tid)
    return {
        "messages": history["messages"],
        "active_task": active_task,
    }
```

### 前端 `lib/api.ts` 新增函数

```typescript
// Source: [VERIFIED: frontend/src/lib/api.ts 现有 pattern]
import type { Session, Message } from "@/lib/types";

export async function listSessions(): Promise<Session[]> {
  const r = await fetch(`${API_BASE}/api/sessions`);
  if (!r.ok) throw new Error(await r.text());
  const data = (await r.json()) as { sessions: unknown[] };
  // 后端返回的 session 对象字段是 snake_case —— 映射到前端 Session 类型
  return data.sessions.map((s: any) => ({
    id: s.session_id,
    title: s.title ?? "",
    created_at: s.created_at,
    last_updated: s.last_updated,
    status: s.status,
  }));
}

export async function deleteSession(sessionId: string): Promise<void> {
  const r = await fetch(`${API_BASE}/api/sessions/${sessionId}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
}

export async function createSessionAPI(body: { session_id?: string; title?: string } = {}): Promise<Session> {
  const r = await fetch(`${API_BASE}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  const data = (await r.json()) as { session: any };
  return {
    id: data.session.session_id,
    title: data.session.title ?? "",
    created_at: data.session.created_at,
    last_updated: data.session.last_updated,
    status: data.session.status,
  };
}

export async function loadHistory(sessionId: string): Promise<{
  messages: Message[];
  active_task: { task_id: string; status: string } | null;
}> {
  const r = await fetch(`${API_BASE}/api/sessions/${sessionId}/messages`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
```

### 前端 `types.ts` 扩展

```typescript
// Source: [VERIFIED: CONTEXT.md D-04/D-17]
export interface Session {
  id: string;
  title: string;             // 空串 → UI fallback "新会话"
  created_at: number;        // 秒
  last_updated: number;      // 秒
  status: string;            // idle / streaming / interrupted
}
```

### 前端 `handleSwitch`（组合层）

```typescript
// page.tsx
// Source: [VERIFIED: D-09 顺序] ① 关 SSE ② 清 chat ③ 切 active ④ 拉历史 ⑤ reattach
const setActive = useSessionStore((s) => s.setActive);
const loadHistoryAction = useChatStore((s) => s.loadHistory);
const setCurrentTaskId = useChatStore((s) => s.setCurrentTaskId);
const setStatus = useChatStore((s) => s.setStatus);
const resetChat = useChatStore((s) => s.reset);

async function handleSwitch(sessionId: string) {
  // ① 关 SSE: 由 activeSessionId 变更自动触发 useSSE cleanup —— 无需手动调
  // ② 清 chat
  resetChat();  // reset 不再生成 sessionId（已迁走），仅清 messages/status/taskId/error
  // ③ 切 active
  setActive(sessionId);
  // ④ 拉历史
  try {
    const data = await loadHistory(sessionId);
    loadHistoryAction(data.messages);
    // ⑤ reattach
    if (data.active_task) {
      setCurrentTaskId(data.active_task.task_id);
      setStatus(data.active_task.status === "interrupted" ? "interrupted" : "streaming");
    }
  } catch (e) {
    toast.error("加载历史消息失败");
  }
}
```

## State of the Art

| 旧做法 | 当前做法 | 何时改变 | 影响 |
|--------|---------|---------|------|
| 用 polling 检查 task 状态 | Redis Streams + SSE 推送 | Phase 07 重构 | task_bus.read_events 已直接支持 reattach，无需额外改动 |
| 前端自管 message history 持久化（localStorage） | LangGraph checkpointer（Postgres） | Phase 04 | 后端单一真相来源，前端只做渲染 |
| 一个 Zustand store 装所有状态 | domain-sliced stores | Phase 08 决策 | Phase 10 按此原则继续拆分 |

**Deprecated/outdated:**

- 不再用 `fetch-event-source` 库（Phase 08 决策改回原生 EventSource，保持协议一致）
- 不再用 pydantic v1 / `BaseModel.dict()`（项目统一 pydantic v2）

## Validation Architecture

### Test Framework

| 属性 | 值 |
|-----|---|
| 后端框架 | pytest（`backend/pyproject.toml [dev]` 含 pytest-asyncio） |
| 后端配置 | `backend/pyproject.toml` + `backend/tests/conftest.py`（已有 mock_session_service/test_app fixture） |
| 后端快速跑 | `cd backend && pytest tests/test_api_sessions.py -x` |
| 后端全量跑 | `cd backend && pytest` |
| **前端框架** | **【未配置 — Wave 0 gap】** 无 vitest / jest / playwright / @testing-library |
| 前端配置 | 无 |
| 前端快速跑 | 无（Phase 10 必须先搭建，或采用 dev 环境手验 + 关键函数纯单测） |
| 前端全量跑 | 无 |

### Phase 要求 → 测试映射

| Req ID | 行为 | 测试类型 | 自动命令 | 文件存在? |
|--------|------|---------|---------|----------|
| SESS-01 | 新端点 `GET /api/sessions` 返回 title/last_updated/last_task_id 字段 | 后端单元 + 集成 | `pytest tests/test_api_sessions.py::test_list_returns_title -x` | ❌ Wave 0 |
| SESS-01 | Sidebar 渲染分组 | 前端 — 纯函数单测 | `npm run test -- time-group` | ❌ Wave 0（需先装测试框架） |
| SESS-01 | 新建会话按钮点击后 input 聚焦 | 手验（DESIGN 细节） | 人工 | — |
| SESS-02 | 切换会话调 `GET /{id}/messages` + 正确 loadHistory | 前端集成 | 同上（前端测） | ❌ Wave 0 |
| SESS-02 | `GET /{id}/messages` 从 checkpoint 正确映射 | 后端集成 | `pytest tests/test_history.py::test_messages_to_segments -x` | ❌ Wave 0 |
| SESS-03 | 切换时旧 SSE 连接关闭 | 前端手验 + DevTools Network 面板 | 人工 | — |
| SESS-03 | useSSE 依赖数组包含 activeSessionId | 代码审查（静态） | lint/grep | ✅（已有 eslint） |
| SESS-04 | `DELETE /api/sessions/{id}` + 撤销路径 | 后端单元 | `pytest tests/test_api_sessions.py::test_delete_then_restore -x` | ❌ Wave 0 |
| SESS-04 | 8s toast 超时后真删 | 手验 | 人工 | — |
| CHAT-08 | ≥10 条历史正确渲染 | 后端 + 前端 | 后端：构造 checkpoint fixture；前端：component 渲染测 | ❌ Wave 0 |
| CHAT-08 | 切回 interrupted 会话 HITL 按钮可操作 | 手验（E2E） | 人工 | — |

### 采样率（Nyquist）

- **每 task commit:** `cd backend && pytest tests/test_api_sessions.py tests/test_history.py -x`
- **每 wave merge:** `cd backend && pytest`（全量）+ 前端 `npm run build` + dev 环境手验 sidebar 切换 / 删除 / 撤销场景
- **Phase gate:** 后端全量绿 + Success Criteria 1-4 逐条在 dev 环境手验通过

### Wave 0 Gaps

- [ ] `backend/tests/test_api_sessions.py` — 扩展覆盖 title / last_task_id / POST body
- [ ] `backend/tests/test_history.py` — **新增**（checkpoint fixture + messages_to_segments）
- [ ] `backend/tests/fixtures/checkpoint_factory.py` — **新增**（造 Postgres checkpoint 或 mock AsyncPostgresSaver）
- [ ] `frontend/src/lib/__tests__/time-group.test.ts` — **新增**（需先决定是否接入 vitest）
- [ ] **前端测试框架:** 建议 Phase 10 Wave 0 **只做最小 vitest 引入**：`npm install -D vitest @vitest/ui`，一个 time-group.test.ts 验证纯函数即可；完整 @testing-library / Playwright 接入放到后续 Phase
  - 判断点：若规划同意"手验为主 + 关键纯函数自动化"，可跳过框架引入，Phase 10 全靠手验 + 后端覆盖。Plan 阶段请明确选择。

## Risks / Unknowns / 推荐决策补丁

### 风险 R-1: D-01 历史 HITL 三态还原**无法可靠实现** ⚠️ 决策级

**现状:** `HumanInTheLoopMiddleware`（deepagents / langchain）拦截工具调用时：
- **approve** → 工具正常执行 → 产生标准 `AIMessage(tool_calls=[...])` + 后续 `ToolMessage(content=工具结果)`
- **reject** → middleware 写入一个"假的" `ToolMessage` 其 content 是前端传的 reject 文案
- **edit** → args 被改写后正常执行，checkpoint 里与 approve 几乎相同

检查点里**不存储** "这个 tool call 经过了审批" 的元数据 —— 审批决策只在 `Command(resume={...})` 的 invocation 瞬间存在。

**影响:**
- D-01 原本承诺"历史 HITL 还原为 approved / rejected / feedback 三态"**做不到**（approve vs edit 完全无法区分；reject vs feedback 只能靠 reject message 文案启发式猜测）。
- D-02 "历史 HITL 卡片一律锁定" 语义失去根基 —— 锁定一个无法还原的状态卡片不如直接不显示。

**推荐决策补丁（需 discuss-phase 确认）:**
1. **Phase 10 只还原 text + tool pill（done / rejected）**：
   - 所有历史 tool_call → `{type:"tool", status:"done"}` pill
   - 若对应 ToolMessage.content 匹配 reject 前缀（如包含"用户已主动取消"或"告诉 Agent 你的修改意见"衍生文案）→ `status:"rejected"`
   - **不还原 HitlCard** —— 历史中不显示审批卡片
2. **刷新页面遇到仍在 interrupted 的 task** → 依靠 Phase 12 RESIL-02 从 task_bus meta 还原 pending HitlCard。Phase 10 只做 happy-path（task 还在 Redis Stream 未过期时切回来的 reattach）。
3. **修改 D-01 措辞：** "全量还原 segments" → "还原 text + tool pill（done / rejected 两态）；HITL 卡片不在历史中显示"。

**置信度:** MEDIUM —— 基于对 deepagents + HumanInTheLoopMiddleware 行为的推断；**Context7 本 session 已配额用尽无法完整验证**。建议 Plan Check / Discuss-Phase 再次复核 ToolMessage 对 reject 的内容格式。

### 风险 R-2: Session→Task 反向索引缺失 ⚠️ 决策级

**现状:** `task_bus.py` 只有 `task:{task_id}` HASH 与 `task:{task_id}:events` Stream；`TaskService` 只有进程内 `self._running: dict[str, asyncio.Task]`。**没有**"给定 session_id 查 task" 的索引。

**影响:** D-03 检测 unfinished task 无可依赖数据源。SCAN `task:*` 遍历所有 HASH 代价不可接受（O(n) + 生产数据）。

**推荐决策补丁（已写进 §Pattern 2）:**
- **方案 B（推荐）：** `SessionService` 的 session JSON 里加 `last_task_id` 字段；`TaskService.start_invoke / start_resume` 调用 `session_svc.set_last_task_id(session_id, task_id)`；查询只需一次 `get_session`。
- 替代方案 A：`session_tasks:{session_id}` Redis SET —— 更泛化但 overkill（只需要最近一次），pass。

**置信度:** HIGH —— 纯数据结构决策，代码路径清晰。

### 风险 R-3: 前端测试基建缺失

**现状:** `frontend/package.json` 没有任何测试依赖。Phase 08/09 均无前端自动化测试。

**影响:** Phase 10 涉及 SSE 切换、reattach、undo 等复杂前端逻辑，手验容易漏边角。

**推荐决策补丁:**
- **最小方案**：Wave 0 只装 `vitest`，写 `time-group.test.ts`（纯函数）。复杂逻辑（switch / useSSE 依赖） 靠手验 + review。
- **完整方案**：装 `vitest + @testing-library/react + @testing-library/user-event + jsdom`，覆盖 session-store action / Sidebar 渲染。成本更高，不符合简洁优先，**但若后续 Phase 10-13 都需要，一次性到位更划算**。
- **Plan 阶段请明确选择**；研究阶段推荐最小方案。

**置信度:** HIGH —— 依赖发现明确，决策是 trade-off。

### 风险 R-4: D-03 reattach 重放与 loadHistory 的事件冲突

**现状:** 见 §Common Pitfalls Pitfall 3。具体路径：
- 切回有 interrupted task 的 session → loadHistory 注入所有历史 messages（含已执行的 tool pill）
- setCurrentTaskId → useSSE 连上 `from_id=0` → 后端 Redis Stream 重放该 task 的所有事件（token / tool / hitl）
- 若上次 interrupted 后历史最后一条 AIMessage 已经包含那次 tool_call，loadHistory 和 SSE 重放会重复

**待规划阶段验证:**
- `TaskService._run_agent` 写入 Stream 的事件顺序，vs checkpoint 写入时机 —— 若 checkpoint 在 HITL 中断时已经包含了最后一个 AIMessage(tool_calls=...)，则 loadHistory 已渲染该 tool pill，SSE 重放会再添一次。
- **需要在 Plan 阶段由 Plan Check 复核**：建议一种"去重策略" —— 要么后端 endpoint 在 active_task 存在时返回的 messages **不包含** 对应 task 触发后的部分（需按 checkpoint metadata 找 task 起点），要么前端 loadHistory 在 active_task 存在时只渲染到最后一条 user message。

**推荐保守方案（写进 Plan）:** `GET /{id}/messages` 返回体：
```
{
  "messages": [...],                    # 历史消息（完整）
  "truncate_after_active_task": bool,   # 若 active_task 存在且 messages 最后一条是由该 task 产生，true
  "active_task": { task_id, status }
}
```
前端：若 `truncate_after_active_task`，loadHistory 时**不加**最后一个 assistant message（让 SSE 重放重建）。或者前端自行检测"最后一条是否 assistant 且该 assistant 有 interrupted task 存在" 来决定。

**置信度:** MEDIUM —— 需要 Plan 阶段用测试复现确认。

### 风险 R-5: Title 更新的时机与幂等

**现状:** D-19 要求"首次 invoke 时若 title 为空，取 query 前 30 字"。问题：
- 首次 invoke 如何判定？—— `session_exists=False` 时创建 session，此时 title=""；本次 invoke 用 query 填。
- 但 D-10 指出前端"纯前端新建"且首次 invoke 时后端幂等 `session_exists` 检查 —— 意味着同一 session 的第一次 invoke 是 create + set title 的唯一机会。
- 后续 invoke 不应覆盖 title（避免聊到一半突然 title 换了）。

**推荐决策:** TaskService.start_invoke 流程：
```python
if not await session_svc.session_exists(session_id, user_id):
    await session_svc.create_session(user_id=user_id, session_id=session_id,
                                      title=query[:30])
else:
    existing = await session_svc.get_session(session_id, user_id)
    if not existing.get("title"):
        await session_svc.update_title(session_id, query[:30], user_id=user_id)
# 同时 touch last_updated
await session_svc.touch(session_id, user_id=user_id)
await session_svc.set_last_task_id(session_id, task_id, user_id=user_id)
```

**置信度:** HIGH。

### 风险 R-6: delete 后撤销如何恢复 checkpoint

**现状:** D-11 撤销路径只恢复 Redis session JSON，**不恢复 LangGraph checkpoint**。但 `DELETE /api/sessions/{id}` 目前**也不删 checkpoint**（只 `DELETE session:{user}:{id}` + `SREM user_sessions`）。

**影响:** 撤销能成功 —— checkpoint 本来就没被删。历史消息还原也可用。
**但这是一个遗留决策:** 会话"删了"但 Postgres checkpoint 还在。长期会累积。
**Phase 10 不处理:** 范围外。建议在 §Deferred 里标注"checkpoint GC 未来单独处理"（未来 Phase）。

**置信度:** HIGH。

## Assumptions Log

| # | 假设 | 位置 | 风险 |
|---|------|------|------|
| A1 | **HumanInTheLoopMiddleware reject 决策写入的 ToolMessage.content 为前端传入的 message 原文** | Pitfall 5 / R-1 | 若格式不同（例如 middleware 加了前缀 / 元数据），前端启发式检测失败，历史 tool pill 全显示 done —— 可通过一次 dev 环境试跑验证 |
| A2 | **AIMessage(tool_calls=...) 后立即跟 ToolMessage 对应** | Pattern 1 | 验证方法：读取一次真实 interrupted 会话 checkpoint 的 messages 列表，肉眼确认结构 |
| A3 | **`AsyncPostgresSaver.aget_tuple(config).checkpoint["channel_values"]["messages"]` 返回 LangChain Message 对象列表（不是 dict）** | Pattern 1 | 若为 dict 需改映射逻辑；Context7 文档未明确 |
| A4 | **前端首次进入页面应自动选中最近一条会话**（CONTEXT 里是 discretion） | Validation / UX | 若用户反馈"打开总要选"，可调整 |
| A5 | **session_ttl=3600s 对 8 秒撤销窗口无影响** | Pitfall 6 | [VERIFIED: config.py:26] 3600 >> 8，不会触发。消号。 |
| A6 | **前端 ZEP Zustand action 是稳定引用** | Pattern 3 / Pitfall 1 | [VERIFIED: zustand docs + 现有 use-sse.ts 已这么用] 不会成为问题 |
| A7 | **sonner toast 配合 `duration: 8000 + action` 在按钮点击前不会关闭** | Pattern 6 | [VERIFIED: sonner 2.0.7 官方 demo] |
| A8 | **删除 session 后对应 Postgres checkpoint 保留** | R-6 | 当前代码路径就是这样；如果 Phase 11/12 改了需重评估 |
| A9 | **TaskService.start_invoke 路径为 SessionService 首次 title 写入的唯一入口**（resume 路径不动 title） | R-5 | Plan 阶段需在流程图里确认唯一入口 |

**A1-A3 需要 discuss-phase / plan-check 阶段通过真实运行验证。** A5-A7 已 VERIFIED 消号。A4/A8/A9 是产品/范围决策，非事实断言。

## Open Questions

1. **D-01 三态历史 HITL 还原 —— 是否接受降级为 text + tool pill 两态？**
   - 已知：checkpoint 不存 approval 元数据
   - 不清楚：用户对"历史里完全看不到 HITL 卡片"是否可接受
   - 建议：discuss-phase 把 R-1 推荐补丁交用户确认

2. **D-03 reattach 时是否需要 truncate loadHistory？**
   - 已知：Redis Stream from_id=0 会重放
   - 不清楚：checkpoint 在 interrupted 时已经写入到哪一条 message
   - 建议：Plan Check 阶段做一次真实运行验证，写 §Risks R-4 推荐方案

3. **前端测试框架方案选择**（最小 vitest vs 完整 testing-library）
   - 已知：package.json 空白
   - 建议：Plan 阶段决策

4. **首次加载是否自动选中最近会话？**
   - CONTEXT 标记为 discretion，建议选中

## Environment Availability

| 依赖 | 需要方 | 可用 | 版本 | 备注 |
|------|--------|------|------|------|
| PostgreSQL | checkpoint 读取 | ✓（假定 docker-compose 已跑） | — | `docker-compose up -d` 即可 |
| Redis | session / task_bus | ✓ | — | 同上 |
| Python 3.11 + pytest | 后端测试 | ✓ | — | 已在 pyproject |
| Node + npm | 前端 build | ✓（Next 15.5） | — | — |
| vitest | 前端测试 | ✗ | — | **Wave 0 gap** —— 见 §Validation / R-3 |

**阻塞项:** 无（后端基础设施全就绪）
**有替代的缺项:** 前端测试框架 —— 替代策略：手验 + review

## Sources

### Primary (HIGH confidence)

- **[VERIFIED: backend 源码]** `backend/app/services/session.py` — session 存储是 STRING+JSON（不是 HASH，CONTEXT 有误）
- **[VERIFIED: backend 源码]** `backend/app/services/task.py` — TaskService._running 为进程内 dict，无 session→task 反向索引
- **[VERIFIED: backend 源码]** `backend/app/infra/task_bus.py` — Redis Streams from_id 参数已支持 reattach
- **[VERIFIED: backend 源码]** `backend/app/infra/database.py` — AsyncPostgresSaver 已 setup
- **[VERIFIED: backend 源码]** `backend/app/core/streaming.py` — 事件协议清单
- **[VERIFIED: frontend 源码]** `frontend/src/stores/chat-store.ts` — activeSessionId 迁出路径
- **[VERIFIED: frontend 源码]** `frontend/src/hooks/use-sse.ts` — 依赖数组扩展点
- **[VERIFIED: frontend/package.json]** Next 15.5 + React 19 + Zustand 5.0.12 + sonner 2.0.7
- **[VERIFIED: backend/pyproject.toml]** langgraph==1.1.6, langgraph-checkpoint-postgres==3.0.5
- **[VERIFIED: .planning/config.json]** nyquist_validation: true

### Secondary (MEDIUM confidence)

- **[CITED: Context7 langgraph-python]** `CompiledStateGraph.aget_state(config)` 返回 StateSnapshot；`checkpointer.aget_tuple(config)` 返回 CheckpointTuple（本 session 已 fetch 过）
- **[CITED: Context7 zustand]** subscribeWithSelector / domain-sliced pattern；action 选择器返回稳定引用
- **[CITED: Context7 sonner]** `toast(msg, { duration, action })` API
- **[CITED: Phase 09 CONTEXT + HitlCard.tsx]** HITL segment 结构与收起态

### Tertiary (LOW confidence)

- **[ASSUMED]** HumanInTheLoopMiddleware reject 决策生成的 ToolMessage.content 格式 —— Plan Check 阶段需验证
- **[ASSUMED]** deepagents 对 HITL 事件的 checkpoint 写入时机 —— 影响 R-4 truncate 策略

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — 版本 + 依赖均直接读源码锁定
- Architecture: HIGH（后端路径 + 前端拆分）/ MEDIUM（历史重建）
- Pitfalls: MEDIUM — R-1/R-4 需 Plan 阶段运行验证
- Reverse index: HIGH — 纯数据结构决策
- Test infra: HIGH — 简单缺失，决策清晰

**Research date:** 2026-04-20
**Valid until:** 2026-05-20（30 天，栈稳定）

## RESEARCH COMPLETE

**Phase:** 10 - session-management
**Confidence:** HIGH（后端 + 前端协议）· MEDIUM（历史 HITL 三态还原 / reattach 去重）

### Key Findings

- **存储模型已修正**：SessionService 是 `SET key json ex=TTL`（STRING+JSON），不是 HASH —— CONTEXT.md D-04 描述错误，Plan 阶段须按 JSON 字典追加 `title` / `last_task_id` 字段。
- **D-01 历史 HITL 三态还原不可靠**：checkpoint 不存 approval 元数据，approve vs edit 无法区分，reject vs feedback 只能靠 ToolMessage 文案启发式判断。推荐 Phase 10 降级为 "text + tool pill（done / rejected）两态"，HITL 卡片不在历史中显示；完整刷新恢复 defer 到 Phase 12 RESIL-02。
- **Session→Task 反向索引缺失**：推荐方案 B —— session JSON 加 `last_task_id` 字段，`TaskService.start_invoke/start_resume` 维护，`GET /{id}/messages` 的 `active_task` 组装一次读取即可。
- **useSSE 改造极小**：Zustand action 选择器返回稳定引用，只需在依赖数组里加 `activeSessionId`；cleanup 自动关闭旧连接。
- **前端测试基建缺失**：Phase 10 Wave 0 建议最小化引入 vitest 仅测纯函数（time-group），复杂逻辑手验 + review。
- **reattach 与 loadHistory 去重是真实陷阱**：`from_id=0` 重放会与历史消息冲突，需 Plan 阶段验证并采用"truncate_after_active_task" 或等效策略。

### File Created

`/Users/neuron/文稿/2 私人/ReActAgents/.planning/phases/10-session-management/10-RESEARCH.md`

### Confidence Assessment

| 领域 | 等级 | 原因 |
|------|------|------|
| Standard Stack | HIGH | 版本锁定在源码，现有代码 pattern 明确 |
| Architecture | HIGH（主路径）/ MEDIUM（历史重建） | LangGraph aget_state API 明确；HITL 状态推断不可靠 |
| Pitfalls | MEDIUM | R-1/R-4 需 Plan 阶段运行时复核 |
| Reverse Index | HIGH | 纯数据结构，有可行 2 行方案 |
| Test Infra | HIGH | 空白清晰，trade-off 决策明确 |

### Open Questions（需 discuss-phase / plan-check 决定）

1. D-01 接受降级为 text + tool pill（done/rejected）两态 —— 历史 HitlCard 不显示？
2. D-03 reattach 时后端是否 truncate 最后一条 AIMessage 以避免 Stream 重放冲突？
3. 前端测试框架：最小 vitest vs 完整 testing-library？
4. 首次进入页面是否自动选中最近会话？（推荐：是）

### Ready for Planning

Research 完成。下一步：`/gsd-discuss-phase 10` 解决上述 4 个 open question（尤其 Q1/Q2），或直接进入 `/gsd-plan-phase 10` 由规划阶段明确选择。Plan 必须覆盖：
- 后端 `core/history.py` 新模块 + `api/sessions.py` 新端点 + `services/session.py` 扩展 title/last_task_id/touch
- 前端 session-store 新建 + chat-store 拆 activeSessionId + useSSE 依赖 + 新 Sidebar 组件 + undo toast 路径
- Wave 0 搭建 `tests/test_history.py` 与 checkpoint fixture（以及可选 vitest）
