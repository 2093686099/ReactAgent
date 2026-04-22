---
phase: 11-todo-panel
plan: 05
type: uat
status: approved
date: 2026-04-22
requirements: [TODO-01, TODO-02]
---

# 11-05 — 人工 UAT 结果

## 验证结论

用户手工 UAT 后回复 "没啥问题应该，approve"。全部 9 个验证点（A~I）通过验收，无偏差。

| 字母 | 验证点 | 结果 |
|------|--------|------|
| A | 新会话首次 `write_todos` → drawer 自动弹一次 | ✅ |
| B | 手动 × 关闭后再触发 `write_todos` 不再自动弹（D-02 红线） | ✅ |
| C | 切换会话 todos 跟随（不触发 auto-open，D-06 + A1） | ✅ |
| D | 删当前会话跟随下一条（D-07 + Phase 10 D-12 耦合） | ✅ |
| E | reattach（`from_id=0` 重放）幂等覆盖（D-14） | ✅ |
| F | DESIGN.md token 视觉走查（三态图标） | ✅ |
| G | 动效时长（item 进入 200ms / 图标 150ms / drawer 200ms / spinner 1s） | ✅ |
| H | 单 in_progress 约束（deepagents 语义） | ✅（monitor 日志同步确认：live write_todos payload 中至多一条 in_progress） |
| I | 全量回归冒烟 + 无 hydration 警告 | ✅ |

## Monitor 证据链

Backend monitor（bb6nyobb9）在 UAT 过程中捕获到若干 write_todos 事件：

- `09:06:55` — `write_todos` payload `[{演示, completed}, {展示, completed}, {完成, in_progress}]`（H：单 in_progress 成立）
- `09:06:57` — 第二次 `write_todos` (call_70667376)（多轮覆盖）
- `09:08:29` — 第三次 `write_todos` (call_71b3771f)（多轮覆盖，B/E 语义观察窗口）
- `09:03:43` / `09:04:42` — 两次 task completed

Frontend monitor（b9rkra8ln）在整个 UAT 周期内未捕获任何 ENOENT / Error / hydration warning / TypeError 事件。

## 预跑回归（验证点 I 自动化部分）

- `../.venv/bin/pytest --ignore=tests/test_main.py` → 36 passed（剔除的 2 条 `test_main.py` 失败是 Phase 10 前遗留的 Windows-only 测试，macOS 无 `asyncio.WindowsSelectorEventLoopPolicy`，与 Phase 11 无关）
- `npm run test -- run` → 24 / 24 passed
- `npm run build` → ok（Route `/` 116 kB，First Load JS 240 kB）

## 基础设施偏差（非 Phase 11 scope）

UAT 过程中发现 Next.js 15.5 dev server 在 `--turbopack` 模式下，配合 macOS 中文带空格路径（`/Users/neuron/文稿/2 私人/ReActAgents/`）时，高频触发 `_buildManifest.js.tmp.<rand>` 的 ENOENT race（Turbopack Rust 多线程并发写 + `rename()` 在该路径下有竞争）。

**补丁**：commit `476867a` `fix(infra): dev 脚本去 --turbopack 规避 macOS 中文路径 race` —— 只改 `frontend/package.json` 的 `dev` 脚本（`"next dev --turbopack"` → `"next dev"`），保留 `build` 的 `--turbopack`（build 单次同步写无竞争）。

此改动为 UAT unblocker，不在 11-04 `files_modified` 声明内，归类为 **out-of-scope infra fix**，已单独记录在 commit message 里。

## Hand-off 到 `/gsd-verify-work`

Phase 11 全部 5 个 plan 的自动化 + 人工验证均通过。可进入：

1. `verify_phase_goal` — gsd-verifier 写 VERIFICATION.md（对照 must_haves / REQUIREMENTS.md TODO-01/TODO-02 验收）
2. `code_review_gate`（可选）
3. STATE.md / ROADMAP.md 更新（orchestrator 职责）

## 遗留项（不计入 Phase 11）

- `test_main.py::test_configure_windows_event_loop_policy_*` 2 条 macOS 平台失败（Phase 10 前遗留）—— 建议下个 maintenance phase 用 `@pytest.mark.skipif(sys.platform != "win32")` 标记跳过
