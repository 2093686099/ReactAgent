---
phase: 10
slug: session-management
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-20
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **后端框架** | pytest 7.x（`backend/pyproject.toml [dev]` 含 `pytest-asyncio`） |
| **后端配置** | `backend/pyproject.toml` + `backend/tests/conftest.py`（已有 fixtures） |
| **后端快速跑** | `cd backend && pytest tests/test_api_sessions.py tests/test_history.py -x` |
| **后端全量跑** | `cd backend && pytest` |
| **前端框架** | vitest（Wave 0 最小引入 —— 仅覆盖纯函数） |
| **前端配置** | `frontend/vitest.config.ts` + `frontend/package.json`（Wave 0 新增） |
| **前端快速跑** | `cd frontend && npm run test -- run` |
| **前端全量跑** | `cd frontend && npm run test -- run && npm run build` |
| **Estimated runtime** | 后端 ~15s / 前端 ~3s |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && pytest tests/test_api_sessions.py tests/test_history.py -x`
- **After every plan wave:** Run `cd backend && pytest`（全量）+ `cd frontend && npm run test -- run && npm run build`
- **Before `/gsd-verify-work`:** 后端全量绿 + 前端 test + build 绿 + dev 环境手验 Success Criteria 1-4
- **Max feedback latency:** ~20s（后端快速 + 前端单测）

---

## Per-Task Verification Map

> 下表按每个 Wave/Plan 粗粒度预估。Plan 阶段细化到单个 Task 后，Plan Checker 会核对每 Task 的 `<acceptance_criteria>` 是否与本表一致。

| Req ID | 行为 | Wave | Test Type | Automated Command | File Exists | Status |
|--------|------|------|-----------|-------------------|-------------|--------|
| SESS-01 | `GET /api/sessions` 返回体包含 `title` / `last_updated` / `last_task_id` | 1 | 后端集成 | `pytest tests/test_api_sessions.py::test_list_returns_title -x` | ❌ W0 | ⬜ pending |
| SESS-01 | 分组纯函数 `groupSessions()` 按 today/yesterday/week/older 正确分桶 | 1 | 前端单测 | `cd frontend && npm run test -- time-group -- run` | ❌ W0 | ⬜ pending |
| SESS-01 | Sidebar 渲染分组、hover 样式、新建按钮 | 2 | 手验（DESIGN 细节） | 人工（dev 环境） | — | ⬜ pending |
| SESS-02 | `GET /api/sessions/{id}/messages` 从 checkpoint 正确映射 `HumanMessage/AIMessage/ToolMessage` 为 segments | 1 | 后端集成 | `pytest tests/test_history.py::test_messages_to_segments -x` | ❌ W0 | ⬜ pending |
| SESS-02 | 切换会话调 loadHistory + setActive 顺序正确 | 2 | 手验 + 代码审查 | 人工 + grep 检查 `handleSwitch` 步骤 | — | ⬜ pending |
| SESS-02 | `truncate_after_active_task` 在 active_task 存在时为 `true` | 1 | 后端集成 | `pytest tests/test_history.py::test_truncate_when_active_task -x` | ❌ W0 | ⬜ pending |
| SESS-03 | `useSSE` 依赖数组包含 `activeSessionId` | 2 | 静态审查 | `grep -n "activeSessionId" frontend/src/hooks/use-sse.ts` 必须命中依赖数组 | ✅ | ⬜ pending |
| SESS-03 | 切换会话时 DevTools Network 面板中旧 EventSource closed | 2 | 手验 | 人工（dev 环境 + DevTools） | — | ⬜ pending |
| SESS-04 | `DELETE /api/sessions/{id}` + `POST /api/sessions {session_id}` 幂等恢复 | 1 | 后端单元 | `pytest tests/test_api_sessions.py::test_delete_then_restore_idempotent -x` | ❌ W0 | ⬜ pending |
| SESS-04 | 8s sonner toast 超时后不再调后端（撤销按钮消失） | 2 | 手验 | 人工（dev 环境） | — | ⬜ pending |
| SESS-04 | `deleteSession` → 删除当前活跃会话后 `setActive(next)`；空列表 → `createLocal` | 2 | 手验 + 代码审查 | 人工 + grep `handleDelete` | — | ⬜ pending |
| CHAT-08 | checkpoint 有 ≥10 条消息时 `messages_to_segments` 输出结构稳定 | 1 | 后端单测 | `pytest tests/test_history.py::test_long_history -x` | ❌ W0 | ⬜ pending |
| CHAT-08 | 切回 interrupted 会话时历史 + 重放不重复（truncate_after_active_task 生效） | 2 | 手验（E2E） | 人工（dev 环境构造 interrupt） | — | ⬜ pending |
| CHAT-08 | 历史 HITL 卡片 **不** 出现（D-01 降级为 text + tool pill 两态） | 1 | 后端单测 | `pytest tests/test_history.py::test_no_hitl_segment_in_history -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_history.py` — 新增：checkpoint fixture + `messages_to_segments` 单测 + `truncate_after_active_task` 集成
- [ ] `backend/tests/test_api_sessions.py` — 扩展：`title` / `last_task_id` / `POST body` / `delete_then_restore_idempotent`
- [ ] `backend/tests/fixtures/checkpoint_factory.py` — 新增：构造 `AsyncPostgresSaver` fixture 或 mock 返回 `CheckpointTuple`
- [ ] `frontend/vitest.config.ts` + `frontend/src/lib/__tests__/time-group.test.ts` — 新增：vitest 最小接入 + 分组纯函数测试
- [ ] `frontend/package.json` — devDependencies 新增 `vitest`；新增 `"test": "vitest"` 脚本

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sidebar 分组/hover/active 高亮符合 DESIGN tokens | SESS-01 | 视觉/token 对齐需肉眼核 | dev 环境 → 打开 sidebar → 对照 `DESIGN.md` token 验证（bg / border-left / text color） |
| 切换会话 DevTools Network 面板无旧 EventSource 泄漏 | SESS-03 | 浏览器运行时观察 | dev → 发起流式消息 → 切换 session → Network → SSE 连接数 = 1 |
| 8s sonner 撤销窗口体验（超时自动消失 / 点击恢复会话） | SESS-04 | toast 动画 + 计时行为 | dev → 删除某会话 → 不点撤销等 10s → 观察 toast 消失且会话未恢复；再删一次 8s 内点撤销 → 会话重新出现 |
| 切回 interrupted 会话 HITL 按钮可操作且不重复渲染 | CHAT-08 | E2E 流程涉及实时中断 | dev → 触发 HITL 中断 → 切到其他会话 → 切回 → 只看到 1 个待审批卡片（无重复）+ 点击 approve/reject 成功 |
| 首次进入页面自动选中最近会话并加载历史 | SESS-01/CHAT-08 | 产品体验决策 | 关闭所有 tab → 重新打开 → 进页面默认显示最近会话的消息 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (后端 test_history.py / 前端 vitest)
- [ ] No watch-mode flags（pytest `-x` / `vitest run` 均 one-shot）
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter（Wave 0 完成后由 executor 更新）

**Approval:** pending
