---
phase: 12
reviewers:
  - codex-self-review
reviewed_at: 2026-04-22T00:00:00+08:00
plans_reviewed:
  - 12-01-backend-PLAN.md
  - 12-02-frontend-PLAN.md
  - 12-03-uat-PLAN.md
---

# Cross-AI Plan Review — Phase 12

## Codex Self Review

### Summary

Phase 12 的方向是对的，后端 `Last-Event-ID` fallback 与 `hitl_resolved` 事件也抓到了根因。但当前计划里还有几处会在执行或验收时直接卡住的问题，主要集中在前端 reconnect 状态收敛和 UAT 可验证性。

### Strengths

- 后端范围控制得很小，`/stream` 与 `/resume` 两个落点足够聚焦。
- 前端复用既有 `from_id=0` 重放路径，而不是再造新的恢复接口，这个方向是对的。
- 明确把 G-01 并入 Phase 12，一次修掉根因，不再单做 hotfix。
- `query > header > "0"` 的优先级写得清楚，便于测试和回归。

### Concerns

- `HIGH` `12-02-frontend-PLAN.md:268-271`, `12-02-frontend-PLAN.md:305-318`
  当前 plan 明确要求只有 `token/tool/hitl/hitl_resolved/todo/done` 这些 listener 会把 `connectionStatus` 置回 `connected`，同时明确排除了 data-bearing `error` listener；但终态 `error` 之后的 `onerror` 分支又只会 `close + setStatus("idle")`，不会清掉 `reconnecting`。这会让一次真实的后端错误把 banner 永久卡在“正在重连…”，UI 状态与真实终态不一致。

- `MEDIUM` `12-02-frontend-PLAN.md:175-181`, `12-02-frontend-PLAN.md:265-297`, `frontend/src/stores/chat-store.ts:204-247`
  plan 让 `hitl_resolved` 直接调用 `resolveLastPendingHitl(...)`，只按“最后一个 pending HITL”收敛，而不使用 payload 里的 `tool_name` / `call_id`。仓库现状已经明确同一个 task 可能出现多次 HITL；一旦发生重放乱序、同 task 多次审批、或未来同消息里有多个 pending HITL，这个策略会把错误的卡片收敛掉。

- `MEDIUM` `12-01-backend-PLAN.md:158-161`, `12-03-uat-PLAN.md:112-125`
  backend plan 明确禁止新增日志，但 UAT 场景 1 又把“后端日志可见 Last-Event-ID header”写成判定项。现有 `backend/app/api/chat.py` 和默认 FastAPI/Uvicorn access log 都不会打印请求头，这个验收项实际上不可观测，执行时只会让 UAT 卡在“想验证但看不到证据”。

### Suggestions

- 在 `error` 事件路径里也显式收敛连接状态。
  最简单的是 data-bearing `error` listener 首行也 `setConnectionStatus("connected")`，或者在 `receivedTerminalEvent === true` 的 `onerror` 分支里顺手 `setConnectionStatus("connected")`。

- 不要浪费 `hitl_resolved` payload 里的标识信息。
  至少让前端按 `tool_name` 匹配最近 pending HITL；更稳的是把可唯一对应前端 segment 的标识补到消息模型或事件契约里，而不是永远依赖“最后一个 pending”。

- 把 UAT 的可观测性改成可执行的证据链。
  选一个：1. 加一个很轻量的 debug log；2. 在测试里断言 `read_events(..., from_id=...)` 被正确调用；3. 让浏览器 Network/EventSource 帧成为唯一验收证据，而不是要求后端日志看 header。

### Risk Assessment

`MEDIUM`

主链路方案可行，但如果按当前计划原样执行，至少会留下一个明显的前端状态错误（terminal error 后 banner 不收敛），并且 UAT 场景 1 的验收标准不可操作。建议先修正这些问题，再进入执行阶段。
