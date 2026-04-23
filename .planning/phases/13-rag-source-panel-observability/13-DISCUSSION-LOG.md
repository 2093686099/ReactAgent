---
phase: 13
name: RAG Source Panel + Observability
created: 2026-04-22
mode: auto (discuss)
---

# Phase 13 Discussion Log

Auto mode active — decisions made without per-question user prompts; defensible picks derived from prior CONTEXT files and the locking design note. Course corrections expected via user's normal input.

## Locked (carried forward, not re-discussed)

来自 `.planning/notes/tool-artifact-consumption-decisions.md`（2026-04-20 预规划对话）：

1. **B-lite 形态** — 最多 3 张卡片、180 字 snippet、源文件名+类别，**不可展开、不跳 PDF**
2. **不碰 RAG_PROJECT** — 纯 ReActAgents 内部 middleware → SSE → 前端链路
3. **Observability 并入 middleware 改动** — 不单开 phase
4. **B-full 作为 seed 延后** — 触发条件"用户明确反馈想看原文"
5. **C（行内脚注）延后** — grounding 是研究级问题
6. **不做独立 dashboard** — 只做 `logger.info` 层

## Gray Areas Identified (after advisor sharpening)

1. **Segment integration** — SourcesSegment inline vs message-level sidecar
2. **History persistence** — 通过 `/messages` 持久化 vs SSE-replay-only
3. **KB_ERROR / KB_EMPTY 视觉** — 三态变体卡片 vs 变体 tool pill vs 裸文本
4. **Route / fallback 对用户透明度** — 徽章 vs 静默（仅日志）
5. **Observability sink** — Python logger `extra=` vs JSONL 审计文件 vs Redis Stream

Advisor 额外点出：area #2（历史持久化）是最关键的用户侧不可见维度 —— 不做会悄悄违反 Phase 10/11/12 建立的"会话切换保留上下文"红线。

## Decisions (auto-mode picks + rationale)

### 1. Segment integration → **inline `SourcesSegment`**（D-02）

- 复用 Phase 09 segments 契约；避免 `MessageBubble` 双路径渲染
- 天然支持"一条 AI 消息中多次 KB 调用"的顺序表达
- `from_id=0` 重放免费复用

### 2. History persistence → **走 `/messages` + checkpoint 重建**（D-03）

- Phase 10 加 messages、Phase 11 加 todos、Phase 12 锚定 from_id=0 重放红线；若只 SSE 流里活一次，切会话就丢卡片，违反既定契约
- LangGraph `AsyncPostgresSaver` 已持久化 `ToolMessage.artifact`，后端成本 = "重建时多读一字段"，零新存储
- 这是本期最不能偷懒的决策

### 3. KB_ERROR / KB_EMPTY → **同一 SourceCards 组件的三 variant**（D-04）

- 用户最脆弱的感知是"AI 编的 vs 文献来的"；KB_ERROR 静默让用户把 fallback 回答当 grounded
- 不走 pill 变体：pill 在 Phase 09 锚定"工具调用发生了"，加失败态会稀释语义
- 不让 agent text 自说：agent 可能会也可能不会说，UI 层自己保证一致性更可靠

### 4. Route / fallback 透明度 → **对用户静默，走日志**（D-05）

- 单用户工具；"降级到 web_search" 对用户不 actionable（无法重试 KB），只是噪音
- Observability 读者是 owner / dev，不是 end user
- 错误必须可见（影响信任）、路由可不可见（影响不了决策）—— 这是 D-04 与 D-05 的边界

### 5. Observability sink → **Python `logger.info` + `extra={}`**（D-06）

- 匹配现有栈，无新基础设施
- JSONL 需要轮转策略；Redis Stream 与任务总线共用命名空间会混乱
- 未来真要接 Grafana，log shipper（vector/fluentbit）成本 < 改代码成本

### 6. Event protocol → **新独立 SSE `source` 事件**（D-01，planner 级但已在 CONTEXT 定死）

- 不扩展 `tool:done` payload 污染 Phase 09 ToolPill 契约
- 新事件 = 纯加法，零回归面

## Out of Scope / Redirected

- "能不能顺便加脚注 `[1][2]`" → 已在 locking note 里定为 C 形态延后，本期不讨论
- "能不能显示 web_search fallback 徽章" → D-05 显式否决，移进 `<deferred>`
- "要不要接 Prom / Grafana" → D-06 延后，本期只做 logger 层

## Requirements Added to REQUIREMENTS.md

Roadmap 里 Phase 13 requirements 原为 TBD。本期锁定：RAG-01 / RAG-02 / RAG-03 / RAG-04 / RAG-05（详见 CONTEXT D-07）。

（是否把这些条目写进 `.planning/REQUIREMENTS.md` 由 planner/executor 按工作流惯例处理；CONTEXT.md 里已是单一真相。）

## Next Steps

- 手动：`/gsd-plan-phase 13` 把 D-01~D-07 拆成 plan
  - 建议 wave：
    - Wave 1：后端 middleware artifact 提取 + source 事件 + observability logger（单 atomic PR）
    - Wave 2：前端 types / store action / SSE listener（可并入 Wave 1 亦可独立）
    - Wave 3：`<SourceCards>` 组件 + MessageBubble 挂接 + 三 variant
    - Wave 4：`/messages` checkpoint 重建 + E2E UAT（切会话保留）
- 未启用 `--chain`：不自动进入 plan-phase
