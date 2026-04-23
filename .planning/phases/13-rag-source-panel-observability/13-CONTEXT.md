---
phase: 13
name: RAG Source Panel + Observability
created: 2026-04-22
discuss_mode: discuss (auto)
depends_on: Phase 09 (Tool Call UX / SSE artifact infra)
locking_note: .planning/notes/tool-artifact-consumption-decisions.md
---

# Phase 13 — RAG Source Panel + Observability

## <domain>

把 `query_knowledge_base` 工具返回的 `ToolMessage.artifact` 从后端死路打通到前端，做成 **B-lite 形态**（最多 3 张来源卡片、180 字 snippet、源文件名+类别，不可展开、不跳 PDF），并同时把每次 RAG 调用的 `route` / `error_type` / `document_count` 写成结构化日志，让 owner 可以统计 `web_search` fallback 比例、错误分布。

**本期不做：**
- B-full（PDF viewer、点击展开全文） → seed 候选，触发条件：有用户明确反馈想看原文
- C（行内脚注 `[1][2]` hover） → 研究级问题，暂不规划
- 独立 observability dashboard（Grafana/Prom） → 只做 `logger.info` 层

## <decisions>

### D-01 — Artifact 透传走新 SSE 事件 `source`，不复用 `tool:done`

**Decision:** 后端 `parse_agent_events` 在遇到 `ToolMessage` 且 `artifact` 非空时，紧接 `tool:done` 事件之后额外产出一个 `source` 事件（不是扩展现有 `tool` 事件的 payload）。

**Why:**
- `tool:done` 当前契约是 `{name, status}`，所有工具共用。往里塞可选的 `sources[]` 会让非 RAG 工具的消费路径多一次 `sources ? render : skip` 判断，污染 Phase 09 的 ToolPill 渲染契约。
- 新事件类型 = 纯加法，前端 `useSSE` 增加一个 listener 即可，不触碰 `tool` listener 的既有行为；降低 Phase 08/09 的回归面。
- Phase 12 的 Last-Event-ID / from_id=0 重放是事件级别的，新事件天然在重放中复现，无需特殊处理。

**How to apply:** 事件 payload 形状 `{tool_name, call_id?, ok, route, sources[{source,category,snippet}], document_count, error_type?}`（字段对齐 artifact schema）。planner 拆任务时把"后端发 source 事件"与"前端消费"分开原子提交。

---

### D-02 — 前端用新增 `SourcesSegment` 嵌入 `Message.segments`，不走 message 级 sidecar

**Decision:** 扩展 `frontend/src/lib/types.ts` 的 `Segment` union，新增：

```ts
export type SourceCard = { source: string; category: string; snippet: string };

export type SourcesSegment = {
  type: "sources";
  variant: "ok" | "empty" | "error";
  toolName: string;           // 用于区分同一条 AI 消息内的多次 KB 调用
  cards: SourceCard[];        // variant=ok 时最多 3 条；empty/error 时为空
  errorType?: string;         // variant=error 时填充，驱动卡片文案
  route?: string[];           // 仅后端/日志消费，前端保留不渲染
};

export type Segment = TextSegment | ToolSegment | HitlSegment | SourcesSegment;
```

**Why:**
- Phase 09 已经把"AI 消息内嵌工具结构"锚定在 segments 模型；另起 `message.sources: SourceCard[]` sidecar 会让 `MessageBubble` 出现两种渲染路径（遍历 segments + 尾部附加 sources），而且无法表达"一条消息内多次 KB 调用各自带卡片"的顺序。
- 保持 segments append-only 的语义，让 Phase 12 的 `from_id=0` 重放幂等性免费继承。
- `SourceCards` 渲染分支插在 `MessageBubble` 的 `switch (segment.type)` 里，与 `ToolPill` / `HitlCard` 同构。

**How to apply:** SSE `source` 事件到达时，chat-store 新增 `addSourcesSegment(toolName, variant, cards, errorType?)` action，插入当前 assistant 消息 segments 末尾（位置：对应 `tool:done` segment 之后、后续 text token 之前，由事件顺序自然保证）。

---

### D-03 — 历史持久化走 `/api/sessions/{id}/messages`，与 messages/todos 同一机制

**Decision:** 会话切换/刷新时，`GET /api/sessions/{id}/messages` 的响应体里重建的 `messages[].segments[]` 必须包含 `SourcesSegment`。实现路径：从 LangGraph checkpoint（`AsyncPostgresSaver`）里读 `ToolMessage`，取 `artifact` 字段按 D-02 结构重建 segment，拼到对应 AI 消息的 segments 里。

**Why:**
- Phase 10 已扩展 `/messages` 返回 `messages`，Phase 11 扩展返回 `todos`，Phase 12 已把"from_id=0 重放是单一真相"写进红线。如果 Phase 13 只让 sources 在 SSE 流里活一次，那用户切走再切回来，同一条 AI 回答下面的来源卡片就消失了——违反 Phase 10/11/12 建立的"会话切换保留全部可见上下文"契约。
- 这是本期最关键的"别偷懒"决策：LangGraph checkpoint 本身就持久化了 `ToolMessage.artifact`（AsyncPostgresSaver 存整棵 state），所以后端成本只是"在重建 messages 时多读一个字段"，不新增存储。
- 对前端完全无感：`HistoryResponse.messages[].segments[]` 里就是 `SourcesSegment`，与实时 SSE 产出的结构一致。

**How to apply:** Phase 10 的 messages reconstruction 函数需要扩展；planner 把"后端 reconstruction"与"E2E 历史回放验证"放进同一个 plan wave，UAT 必须覆盖"发送 RAG 问答 → 切会话 → 切回来 → 卡片依然在"。

---

### D-04 — KB_ERROR / KB_EMPTY 用同一 `SourceCards` 组件的 variant 呈现，不降级为 tool pill 或裸文本

**Decision:** `<SourceCards variant>` 三态：

- `variant="ok"`：top-3 卡片，每张 `{源文件名·类别，180 字 snippet}`
- `variant="empty"`：单张 muted 卡片，copy "未找到相关资料"，视觉灰阶
- `variant="error"`：单张 warning-tone 卡片，带图标（lucide `AlertTriangle` 或类似），copy 按 `errorType` 映射："RAG 服务暂不可用" / "超时" / "未知错误"，附一行小字 "Agent 已基于自身知识回答"

**Why:**
- 整个项目（单用户、桌面端、无 PM 压力）最脆弱的环节是"用户不知道这是 AI 编的还是文献来的"。KB_ERROR 静默 = 用户把 agent 自由发挥当成文献 grounded 的回答，信任反而下降。
- 不走 ToolPill 变体，因为 pill 在 Phase 09 里已锚定"工具调用发生了"的含义；把"失败"挤进 pill 会稀释它的职责。
- 不让 agent 的 text 自己说"我没查到"，因为 agent 可能会也可能不会这么说；UI 层自己保证一致性更可靠。

**How to apply:** `SourceCards` 组件内部 `switch (variant)` 三分支渲染；后端 D-01 的事件 payload 带 `ok` bool + `error_type?`，前端据此映射 variant。

---

### D-05 — Route / fallback 对用户静默，只记结构化日志

**Decision:** 当 `artifact.route` 指示 RAG 图走了 `web_search` fallback（而不是 KB 命中），**UI 不显示任何"降级"徽章或文案**。观测完全走后端日志：

```python
logger.info(
    "rag.query_knowledge_base",
    extra={
        "call_id": tool_call_id,
        "route": artifact["route"],
        "document_count": artifact["document_count"],
        "error_type": artifact.get("error_type"),
        "ok": artifact["ok"],
        "duration_ms": ...,
    },
)
```

**Why:**
- 单用户、自用工具。"降级到 web_search"对用户不是 actionable 信息（他无法选择重试 KB），只是噪音；而且 agent 的 text 回答已经隐含地反映了 route（KB 语气 vs web search 语气）。
- Observability 目标读者是 owner（dev），不是 end user；`logger.info` + `extra={}` 是标准 Python 结构化日志，下游 `grep "rag.query_knowledge_base"` 或接 ELK 都可。
- 这是对 D-04 的边界划分：错误 = 用户必须知道（影响信任），路由 = 用户不必知道（影响不了决策）。

**How to apply:** middleware 层在产出 `source` 事件的同一代码路径里，调一次 `logger.info`（避免分裂的 observability 逻辑）。后端 plan 任务里加一条"提供一个示例 grep / logfmt 查询统计 fallback 比例"的小脚本或 README 段落。

---

### D-06 — Observability sink：Python `logger.info` + `extra={}`，不新建 JSONL 或 Redis Stream

**Decision:** 唯一 sink 是 application logger，通过 `extra={}` 注入结构化字段，`logging.Formatter` 输出 key=value 或 JSON 均可（沿用项目现有 logger 配置）。不建独立 audit 文件，不用 Redis Stream 当审计流。

**Why:**
- 单用户项目没有 multi-service 审计需求；Redis Stream 会和任务事件总线共用命名空间带来混淆。
- JSONL 审计文件需要轮转策略，额外维护成本；logger 已经有（uvicorn 日志或 stderr）。
- 未来若真要接 Grafana / Prom，通过 log shipper（vector/fluentbit/promtail）接入成本低于改代码。

**How to apply:** planner 拆任务时，observability 不独立成 plan，而是并入"middleware artifact extraction" plan 作为同一处代码的副产物。

---

### D-07 — Requirements 定义（在本期锁定，roadmap 里是 TBD）

此前 REQUIREMENTS.md 没有 RAG-* 条目，本 phase 新增：

- **RAG-01** — 后端 middleware 层从 `ToolMessage.artifact` 提取 sources/route/error_type，通过新 SSE `source` 事件下发（涵盖实时流和 `/stream` reattach 重放两条路径）
- **RAG-02** — 前端新增 `SourcesSegment` 类型 + `<SourceCards>` 组件，挂在 `MessageBubble` segments 渲染循环；variant=ok 渲染 top-3 卡片（源文件名+类别+180字 snippet，不可展开）
- **RAG-03** — `<SourceCards>` variant=empty/error 提供区别于正常回答的视觉提示（empty 灰阶卡片、error 带警示图标 + errorType 映射文案）
- **RAG-04** — 后端每次 `query_knowledge_base` 调用用 `logger.info("rag.query_knowledge_base", extra={...})` 结构化记录 route/error_type/document_count/call_id/ok；提供一条示例 grep 查询给 owner
- **RAG-05** — 历史回放：`GET /api/sessions/{id}/messages` 从 LangGraph checkpoint 重建 `SourcesSegment`，切会话/刷新后来源卡片保留

(Planner 可按需重编号；重要的是 5 条都要覆盖。)

## <canonical_refs>

- `.planning/notes/tool-artifact-consumption-decisions.md` — B-lite vs B-full vs C 取舍的**锁定文档**（本 phase 不重开该讨论）
- `.planning/phases/09-tool-call-ux-hitl-approval/09-CONTEXT.md` — segments 模型、ToolPill / HitlCard 渲染范式（本 phase 复用）
- `.planning/phases/10-session-management/10-CONTEXT.md` — `/api/sessions/{id}/messages` 扩展的范式（本 phase D-03 沿用）
- `.planning/phases/11-todo-panel/11-CONTEXT.md` — 给 segments 外的 message-level 字段（todos）的先例对比（本 phase 故意不走这条路，走 D-02 inline segment）
- `.planning/phases/12-resilience/12-CONTEXT.md` — Last-Event-ID / from_id=0 重放红线；新 SSE 事件必须兼容该契约

## <code_context>

### 后端注入点

**`backend/app/core/streaming.py:90-97`** — `parse_agent_events` 中的 `ToolMessage` 分支，当前只发 `tool:done`，完全丢弃 `artifact`：

```python
elif msg_type == "ToolMessage":
    tool_name = getattr(message_chunk, "name", "") or "unknown"
    result_content = getattr(message_chunk, "content", "")
    logger.info(f"tool result: {tool_name} content={str(result_content)[:500]}")
    yield EVT_TOOL, {"name": tool_name, "status": "done"}
    # ← Phase 13 在这之后增加：读 message_chunk.artifact，yield EVT_SOURCE
```

**`backend/app/core/tools.py`** — `query_knowledge_base` 工具定义（`response_format="content_and_artifact"`），不需要改；只是消费端补齐。

**`backend/app/services/task.py:118`** — `_run_agent` 的 `await task_bus.publish_event(task_id, event, data)` 循环对事件名称无感知，新事件类型只需在 `streaming.py` 里 `yield`，任务总线自然透传。

**`backend/app/api/sessions.py`（Phase 10 引入）** — `/api/sessions/{id}/messages` 的 messages 重建函数需扩展：遍历 checkpoint 的 ToolMessage 时读 `artifact`，按 D-02 结构插 `SourcesSegment`。

### 前端注入点

**`frontend/src/lib/types.ts`** — 扩展 `Segment` union（D-02）。

**`frontend/src/hooks/use-sse.ts`** — 新增 `eventSource.addEventListener("source", ...)`，调用新 store action `addSourcesSegment`；与 `tool` / `hitl` listener 同结构。

**`frontend/src/stores/chat-store.ts`** — 新增 `addSourcesSegment(toolName, variant, cards, errorType?)` action；插入当前流式 assistant 消息 segments 末尾。

**`frontend/src/components/chat/message-bubble.tsx:49-73`** — `segments.map` 的 switch 里增加 `if (segment.type === "sources")` 分支，渲染新组件 `<SourceCards segment={segment}/>`。

**`frontend/src/components/chat/source-cards.tsx`（新）** — 三变体渲染组件。

**`frontend/src/lib/tool-labels.ts`** — 可能需要增加 `query_knowledge_base` 的中文标签（若未有）。

## <specifics>

### 卡片渲染细节（B-lite 契约）
- 最多 3 张卡片
- 每张：头部 `{源文件名}·{category}`（加粗），下方 `snippet`（180 字截断，后端已 slice）
- **不可展开**、**不可点击跳 PDF**、**不渲染 route**
- 桌面端并排 3 列；移动端堆叠（后续 PR 处理，Phase 13 默认 desktop-only 单列也可）
- 颜色/字重严格走 `DESIGN.md`（Linear 风格），参照 HitlCard 的信息密度

### SSE 事件顺序语义
事件流内顺序：
```
token* → tool:calling(query_knowledge_base) → tool:done(query_knowledge_base)
       → source(tool_name=query_knowledge_base, variant=ok|empty|error, cards, ...)
       → token* → ... → done
```
前端 store 必须保证 SourcesSegment 追加到 "最近一次 `query_knowledge_base` 的 ToolSegment" 之后，而不是消息末尾——因为后续可能还有 agent 补充文字、甚至第二次工具调用。实现上：事件到达即按时序 `push` 到 `segments[]` 即可，不需要按 toolName 查找。

### 结构化日志字段（RAG-04 契约）
```python
{
  "event": "rag.query_knowledge_base",    # logger name or msg prefix
  "call_id": "<tool_call_id>",            # 来自 LangChain ToolCall.id
  "route": ["retriever", "web_search"],   # artifact.route 原样透传
  "document_count": 3,
  "ok": true,
  "error_type": null,                     # 正常时 null
  "duration_ms": 1234,                    # 从 calling → done 的时间（需在 middleware 侧 bookkeeping）
}
```
查询样例（README 片段，planner 带上即可）：
```bash
grep 'rag.query_knowledge_base' app.log | jq 'select(.route | contains(["web_search"]))' | wc -l
```

### 不变量 / 测试锚点
1. **非 RAG 工具不触发 source 事件** — `msg_chunk.artifact is None` 时跳过，防止未来别的工具也用 `response_format="content_and_artifact"` 误发。
2. **variant 派生**：`artifact.ok=true && sources` 非空 → ok；`ok=true && sources` 空 → empty；`ok=false` → error（且必须有 `error_type`，否则 fallback "unknown"）。
3. **checkpoint 重建与 SSE 实时的 SourcesSegment 结构必须 byte-equal**（同一 helper 函数产出）—— 否则 E2E 会出现"刚发时显示 3 张卡片，切会话回来变 2 张"的 bug。

## <deferred>

（以下在本期明确不做，未来若真有信号再开新 phase；不要写进 Phase 13 plan）

- **B-full — PDF viewer / 全文展开** — 触发条件：用户明确反馈"想看引用文档原文"，或 owner 自己调 RAG 有多次"这句话在哪个章节"的疑惑。需：RAG_PROJECT 加 `/documents/{filename}` 端点、Milvus schema 加 `page_number`，前端加 PDF.js viewer。
- **C — 行内脚注 `[1][2]` + hover 预览** — 触发条件：B-lite 上线后用户仍表现出"不信 AI 答案"，且 RAG grounding 研究有成熟方案。
- **高级 observability** — 独立 Grafana dashboard、告警规则、错误率 SLO。Phase 13 只做 "日志能查" 这一层。
- **Source 可点击复制/分享** — 小而甜的 UX 改进，等 B-lite 落地后再评估。
- **来源卡片的国际化（i18n）** — 当前 copy 写死中文，未来做多语言时再抽。
- **跨工具的 artifact 透传通用化** — 如果将来另一个工具也想 side-channel 传结构化数据，现在的 `source` 事件名就显得太具体；但 YAGNI，等出现第二例再抽象。
