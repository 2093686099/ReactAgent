---
phase: 11
slug: todo-panel
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **后端框架** | pytest 7.x + pytest-asyncio（现有） |
| **后端配置** | `backend/pyproject.toml` + `backend/tests/conftest.py` |
| **后端快速跑** | `cd backend && pytest tests/test_history.py -x` |
| **后端全量跑** | `cd backend && pytest` |
| **前端框架** | vitest ^2.1.9（Phase 10 Wave 0 已接入） |
| **前端配置** | `frontend/vitest.config.ts` + `frontend/package.json` |
| **前端快速跑** | `cd frontend && npm run test -- run <target>` |
| **前端全量跑** | `cd frontend && npm run test -- run && npm run build` |
| **Estimated runtime** | 后端 ~15s / 前端 ~5s |

---

## Sampling Rate

- **After every task commit:** `cd backend && pytest tests/test_history.py -x`（后端改动）或 `cd frontend && npm run test -- run <target>`（前端改动）
- **After every plan wave:** `cd backend && pytest` + `cd frontend && npm run test -- run && npm run build`
- **Before `/gsd-verify-work`:** 两端全量绿 + 手工 UAT（auto-open 首次弹 / 手动关闭后不再弹 / 切会话 todos 跟随 / 删会话跟随下一条 / 三态图标 DESIGN.md token 走查）过关
- **Max feedback latency:** ~20s

---

## Per-Task Verification Map

> 下表按 Req ID × Wave 粗粒度预估。Plan 阶段细化到单个 Task 后，Plan Checker 将核对每 Task 的 `<acceptance_criteria>` 是否与本表一致并填充 Task ID 列。

| Req ID | 行为 | Wave | Test Type | Automated Command | File Exists | Status |
|--------|------|------|-----------|-------------------|-------------|--------|
| TODO-01 | `GET /api/sessions/{id}/messages` 响应体含 `todos: Todo[]`；空 todos 返回 `[]` | 1 | 后端集成 | `pytest tests/test_history.py::test_messages_endpoint_returns_empty_todos -x` | ❌ W0 | ⬜ pending |
| TODO-01 | `GET /api/sessions/{id}/messages` 响应体 todos 与 checkpoint state 同事务同源 | 1 | 后端集成 | `pytest tests/test_history.py::test_messages_endpoint_returns_todos_from_checkpoint -x` | ❌ W0 | ⬜ pending |
| TODO-01 | Pydantic `Todo` model 接受 `{content, status}`，status 枚举三态 | 1 | 后端单元 | `pytest tests/test_models_todo.py -x` | ❌ W0 | ⬜ pending |
| TODO-01 | `use-sse.ts` `todo` 事件 listener 调 `chat-store.setTodos`（整体覆盖） | 2 | 前端单元 | `cd frontend && npm run test -- run src/hooks/use-sse.todo.test.ts` | ❌ W0 | ⬜ pending |
| TODO-01 | `chat-store.loadHistory(payload)` 同时写 messages + todos | 2 | 前端单元 | `cd frontend && npm run test -- run src/stores/chat-store.todos.test.ts` | ❌ W0 | ⬜ pending |
| TODO-01 | `ui-store.todoDrawerOpen` 走 Zustand persist（key `neuron-assistant:ui-store:v1`、skipHydration）；`hasAutoOpenedFor` **不**持久化 | 2 | 前端单元 | `cd frontend && npm run test -- run src/stores/ui-store.test.ts` | ❌ W0 | ⬜ pending |
| TODO-01 | `ui-store.autoOpenDrawer(sessionId)` 幂等：同一 session 二次调用不再打开已被用户关闭的抽屉 | 2 | 前端单元 | `cd frontend && npm run test -- run src/stores/ui-store.test.ts` | ❌ W0 | ⬜ pending |
| TODO-01 | auto-open **仅由 live SSE 触发**；`loadHistory` 写入 todos 不触发 auto-open | 2 | 前端单元 | `cd frontend && npm run test -- run src/stores/ui-store.autoopen.test.ts` | ❌ W0 | ⬜ pending |
| TODO-01 | `AppLayout` 条件式 grid：drawer 关 `[240px_1fr]`，drawer 开 `[240px_1fr_320px]`，transition 200ms ease-out | 3 | 手验 + 静态审查 | 人工（dev 环境 toggle） + `grep -n "grid-template-columns" frontend/src/components/layout/app-layout.tsx` | — | ⬜ pending |
| TODO-01 | Drawer 首次收到 `todos.length > 0` 时自动弹出一次；用户手动关闭后续不再自动弹 | 3 | 手验 | 人工（dev 环境：连发两轮 agent 对话，第二轮不应再自动弹） | — | ⬜ pending |
| TODO-02 | `TodoItem` pending / in_progress / completed 三态图标渲染（DESIGN.md token 走查：`--color-border-standard` / `--color-accent`） | 3 | 前端单元 snapshot | `cd frontend && npm run test -- run src/components/todo/todo-item.test.tsx` | ❌ W0 | ⬜ pending |
| TODO-02 | `write_todos` 两次调用后 `chat-store.todos` 为第二次的全量快照（整体覆盖） | 2 | 前端单元 | `cd frontend && npm run test -- run src/stores/chat-store.todos.test.ts` | ❌ W0 | ⬜ pending |
| TODO-02 | 状态切换时图标 150ms ease 过渡；文案颜色不变（`text-secondary`） | 3 | 手验（视觉走查） | 人工（dev 环境 + DevTools 慢速动画） | — | ⬜ pending |
| TODO-02 | 同一时刻只有一条 item 处于 `in_progress`（deepagents 语义保证） | 3 | 手验 + 静态审查 | 人工（dev 环境） + 代码审查不做客户端校验 | — | ⬜ pending |
| TODO-02 | 切换 session：todos 随 `chat-store.reset()` 清空并从目标 session 历史还原 | 3 | 手验 + 前端单元 | `cd frontend && npm run test -- run src/stores/chat-store.session-switch.test.ts` + 人工 dev 验证 | ❌ W0 | ⬜ pending |
| TODO-02 | 删除当前会话并落下一条（Phase 10 D-12）：todos 跟随切换到下一会话的历史 todos | 3 | 手验 | 人工（dev 环境：删除当前、观察面板） | — | ⬜ pending |
| TODO-02 | `reattach`（`from_id=0` 重放）下 SSE 再次推送历史 todo 事件，`setTodos` 幂等覆盖收敛到最新快照 | 3 | 手验 | 人工（dev 环境：中途断网重连，观察面板不重复） | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_history.py` — 新增 `test_messages_endpoint_returns_empty_todos` / `test_messages_endpoint_returns_todos_from_checkpoint`
- [ ] `backend/tests/fixtures/checkpoint_factory.py` — 扩展 `make_checkpoint_tuple(todos=[...])` 支持注入 state.todos
- [ ] `backend/tests/test_models_todo.py` — 新增（Pydantic Todo 三态枚举校验）
- [ ] `frontend/src/stores/ui-store.test.ts` — 新增（`toggleDrawer` / `autoOpenDrawer` 幂等 / persist 行为 + skipHydration）
- [ ] `frontend/src/stores/ui-store.autoopen.test.ts` — 新增（loadHistory vs SSE 触发源辨析）
- [ ] `frontend/src/stores/chat-store.todos.test.ts` — 新增（setTodos 整体覆盖 / loadHistory 带 todos / reset 清空）
- [ ] `frontend/src/stores/chat-store.session-switch.test.ts` — 新增（切换 session 时 todos reset + loadHistory）
- [ ] `frontend/src/hooks/use-sse.todo.test.ts` — 新增（`todo` 事件 dispatch 到 setTodos + autoOpenDrawer）
- [ ] `frontend/src/components/todo/todo-item.test.tsx` — 新增（三态 snapshot）

*依赖已存在：vitest（^2.1.9）、pytest 基础设施、`frontend/vitest.config.ts`（Phase 10 落地）*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Drawer 首次 auto-open 体感 | TODO-01 | UX 取舍不可自动断言 | dev 环境新建会话，首条发"安排明天的行程"让 agent `write_todos`，观察面板首次弹出；然后手动关闭；再发一条让 agent 再 `write_todos`，观察面板不应再自动弹出 |
| 三态图标 DESIGN.md token 走查 | TODO-02 | DESIGN.md token 视觉一致性需人眼 | DevTools inspect 三态图标：pending 边框 `var(--color-border-standard)`、in_progress stroke `var(--color-accent)`（`#5e6ad2`）、completed 填充 `var(--color-accent)` + 内部白色 ✓ |
| 150ms 图标过渡 + 200ms 抽屉过渡 | TODO-01 / TODO-02 | 动效感知需视觉 | Chrome DevTools Performance > 慢速动画播放；验证 pending→in_progress 图标切换 ~150ms、drawer toggle ~200ms |
| 单 in_progress 约束 | TODO-02 | 属 deepagents 运行期语义 | dev 环境多轮对话，截屏面板，确认任意时刻至多一条 in_progress |
| 删会话切下一条时 todos 跟随 | TODO-02 | 与 Phase 10 D-12 耦合 | dev 环境：两个有 todos 的会话；删当前那个；面板应切到下一个会话的 todos 快照 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
