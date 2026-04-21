---
phase: 10-session-management
plan: 02
subsystem: frontend-test-infra
tags: [frontend, vitest, time-group, tdd, wave-0]
requires:
  - frontend/package.json 现有结构
  - frontend/tsconfig.json 中的 `@/*` → `./src/*` 别名
provides:
  - frontend 单元测试基建（vitest 2.1.9，node 环境，最小配置）
  - `frontend/src/lib/time-group.ts::groupSessions()` 分组纯函数
  - `GROUP_LABELS` / `TimeGroup` / `GroupResult` 导出符号
affects:
  - frontend/package.json（新增 devDep vitest + scripts.test）
  - frontend/package-lock.json（vitest 及其依赖树）
  - 下游 Plan 03 Sidebar 分组渲染可直接消费 `groupSessions`
tech_stack:
  added:
    - vitest@^2.1.9
  patterns:
    - TDD RED→GREEN（先失败测试，再实现）
    - 纯函数 + 注入 now 参数（避免时间漂移）
    - 局部 type 作为 Plan 03 types.ts 落地前的过渡
key_files:
  created:
    - frontend/vitest.config.ts
    - frontend/src/lib/time-group.ts
    - frontend/src/lib/__tests__/time-group.test.ts
  modified:
    - frontend/package.json
    - frontend/package-lock.json
decisions:
  - 局部 Session 类型（Plan 03 Task 1 在 types.ts 落地 Session 后改为 import）
  - vitest.config.ts 禁用 postcss（`css: false` + `css.postcss.plugins: []`）绕过 @tailwindcss/postcss 在 node 测试环境的冲突
  - 不引入 jsdom / @vitest/ui / testing-library（P-03 最小引入原则）
metrics:
  duration: ~20m
  tasks_completed: 1
  files_changed: 5
  tests_added: 7
  completed: "2026-04-21"
---

# Phase 10 Plan 02: 前端测试基建最小引入 + time-group 分组函数 Summary

**One-liner：** 最小接入 vitest（node 环境，不含 jsdom / testing-library）+ 一个 `groupSessions()` 纯函数 + 7 个 TDD 覆盖的 vitest 用例，作为 Phase 10 Sidebar 分组渲染的自动化采样点。

---

## Plan

- **Phase:** 10-session-management
- **Plan:** 02
- **Wave:** 0（与 Plan 01 并列，不阻塞 Plan 03）
- **Scope:** frontend 文件；单任务 TDD

---

## Tasks

### Task 1: 引入 vitest + time-group.ts 纯函数 + 单元测试 ✅

TDD 流程：
1. 修改 `package.json`：加 `"vitest": "^2.1.9"` devDep + `"test": "vitest"` script
2. 创建 `vitest.config.ts`（node 环境，alias `@` → `./src`）
3. 运行 `npm install` 下载 vitest 依赖树
4. 创建 `__tests__/time-group.test.ts`（7 用例，使用固定 `NOW` 基准避免时间漂移）
5. RED 验证：`npx vitest run` → 模块找不到 `@/lib/time-group`，失败符合预期
6. 创建 `src/lib/time-group.ts`：`groupSessions` / `GROUP_LABELS` / `TimeGroup` / `GroupResult`
7. GREEN 验证：7/7 全绿

---

## Commits

| # | Phase | Commit  | Scope | Message                                                 |
|---|-------|---------|-------|---------------------------------------------------------|
| 1 | RED   | 6adff96 | 10-02 | test(10-02): 引入 vitest 并添加 time-group 失败单测（RED）      |
| 2 | GREEN | 2e047aa | 10-02 | feat(10-02): 实现 time-group 纯函数（GREEN）                 |

REFACTOR 阶段无必要（代码已简洁，与 PLAN 原型完全一致）。

---

## Duration

约 20 分钟（阅读 PLAN + 安装 vitest + 调试 postcss 冲突 + RED/GREEN 两次提交 + SUMMARY）。

---

## Verification

### Automated

```bash
cd frontend && npx vitest run
```

输出尾部：
```
 ✓ src/lib/__tests__/time-group.test.ts (7 tests) 4ms

 Test Files  1 passed (1)
      Tests  7 passed (7)
   Duration  284ms
```

### Coverage

7 个 vitest 用例：

1. `returns empty array for empty input` — 空输入
2. `populates all four buckets with one item each` — 四桶各落 1 条，label 与 group 对齐
3. `sorts items within bucket by last_updated desc` — 桶内倒序
4. `today/yesterday boundary at midnight` — `TODAY_START` 进 today，-1000ms 进 yesterday
5. `week/older boundary at 7 days` — `WEEK_START` 进 week，-1000ms 进 older
6. `excludes empty buckets from result` — 仅 older 有数据 → 结果长度 1
7. `treats last_updated as seconds (multiplies by 1000)` — 秒级 float × 1000 识别为今天

### Success Criteria（PLAN <success_criteria>）

- [x] `cd frontend && npm install && npm run test -- run` 退出码 0
- [x] 7 用例全绿（实际 7 个，原 PLAN 预期 ≥6 个）
- [x] vitest `environment: "node"`（未引 jsdom）
- [x] package.json 只新增 `vitest`（未引 jsdom / testing-library / @vitest/ui）

---

## Key Outputs for Downstream

### `frontend/src/lib/time-group.ts` 导出清单

| 符号             | 类型                        | 用途                                                             |
|------------------|-----------------------------|------------------------------------------------------------------|
| `TimeGroup`      | `type` 联合                 | `"today" \| "yesterday" \| "week" \| "older"`                    |
| `GROUP_LABELS`   | `Record<TimeGroup, string>` | 中文标签：`今天` / `昨天` / `7 天内` / `更早`                    |
| `GroupResult`    | `interface`                 | `{ group, label, items }` 单组结果                               |
| `groupSessions`  | `function`                  | `(sessions, now?) => GroupResult[]`，按 last_updated 分桶 + 排序 |

### Plan 03 接手建议

- Plan 03 Task 1 在 `frontend/src/lib/types.ts` 新增 `Session` 接口后，需要回到 `time-group.ts`：
  1. 删除文件顶部局部 `type Session = { ... }`
  2. 改为 `import type { Session } from "@/lib/types";`
  3. 重跑 `cd frontend && npx vitest run` 确认 7 用例仍全绿
- `time-group.test.ts` 内部用 `SessionLike` 局部接口避免耦合，无需修改。
- Sidebar 渲染直接 `map(groupResult => ...)`，无需再判空（`groupSessions` 已过滤空桶）。

### vitest 基建复用

- 未来更多前端纯函数单测：放到 `src/**/__tests__/*.test.ts`，自动被 include。
- 若 Phase 后续需要引入 jsdom / testing-library（React 组件测试），在 `vitest.config.ts` 改 `environment: "jsdom"` 并安装对应 devDep；保持现状直到有明确需求。

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] vitest 启动时 PostCSS 配置加载失败**

- **Found during:** Task 1，RED 阶段首次 `npx vitest run` 失败
- **Issue:** `@tailwindcss/postcss` 不是标准 PostCSS plugin 格式（它是 Tailwind v4 自己的 hook），Vite 默认尝试加载 `postcss.config.mjs` 时抛 `TypeError: Invalid PostCSS Plugin found at: plugins[0]`
- **Fix:** 在 `vitest.config.ts` 中显式关闭 CSS 处理：
  ```ts
  test: { ..., css: false },
  css: { postcss: { plugins: [] } },
  ```
  （node 环境测试纯函数无需 CSS，也无需 Tailwind 注入）
- **Files modified:** frontend/vitest.config.ts
- **Commit:** 包含在 RED 提交 `6adff96` 中（配置与测试一并提交，RED 是 vitest 启动成功后的真实业务失败，不是环境阻塞）

### 其他

- PLAN 原型中 `time-group.ts` 使用 `import type { Session } from "@/lib/types";`，实际采用 PLAN §3 推荐的"局部 type"方案（Plan 03 Task 1 在 types.ts 落地 Session 后再 swap）。该权衡在 PLAN 中已明确，不构成偏离。

---

## Known Stubs

无。`groupSessions` 是完整实现；局部 `Session` 类型是过渡（Plan 03 Task 1 移除），已在代码注释和 SUMMARY 中显式标注。

---

## Threat Flags

无新增安全相关面。devDep 新增仅影响开发链路（vitest 由 Vite 团队维护，主流开源，`package-lock.json` 锁版本），不进入生产 bundle。威胁模型 T-10-05 的 `accept` 决策沿用。

---

## Self-Check: PASSED

- [x] `frontend/vitest.config.ts` 存在（含 `environment: "node"` 与 CSS 禁用）
- [x] `frontend/src/lib/time-group.ts` 存在（`export function groupSessions` 命中）
- [x] `frontend/src/lib/__tests__/time-group.test.ts` 存在（7 个 `it` 用例）
- [x] `frontend/package.json` 含 `"test": "vitest"` 与 `vitest ^2.1.9`
- [x] commit `6adff96` (RED) 与 `2e047aa` (GREEN) 均在 `git log` 中
- [x] `cd frontend && npx vitest run` 退出码 0，7/7 passed
- [x] `git status` 干净（除 SUMMARY.md 待 commit）
