---
phase: 10-session-management
plan: 04
subsystem: frontend-sidebar-composition
tags: [frontend, sidebar, zustand, sonner, wave-2]
dependency_graph:
  requires:
    - 10-02 落地的 groupSessions 纯函数
    - 10-03 落地的 session-store / api.loadHistory / useSSE(taskId, sessionId)
  provides:
    - frontend/src/components/sidebar/session-item.tsx（单条会话项，hover 显删除）
    - frontend/src/components/sidebar/session-group.tsx（分组标题 + 列表）
    - frontend/src/components/sidebar/sidebar.tsx（真实列表 + 3 props handler）
    - frontend/src/app/page.tsx（handleSwitch/handleDelete/handleNew + 首次 useEffect）
    - frontend/src/components/layout/app-layout.tsx（接受 sidebar ReactNode）
  affects:
    - 下游 Phase 11 Todo 面板可直接往 AppLayout 右侧塞 panel；session 切换基础已稳定
tech_stack:
  added: []
  patterns:
    - "受控 Sidebar：组件不持业务逻辑，handleSwitch/handleDelete/handleNew 由 page.tsx 注入"
    - "乐观删除 + 8s 撤销：deleteOptimistic 先本地移除 → DELETE → sonner 8000ms 撤销 action 调 restoreSession（幂等 POST）"
    - "首次自动选中：didInitRef 防抖 + loadSessions 后 handleSwitch(sessions[0].id)（P-04）"
    - "切换会话五步：清空 chat → setActive → 拉历史 → truncate_after_active_task → reattach 触发 useSSE"
    - "AppLayout 注入 slot：sidebar 作为 ReactNode prop，page 层组合 handler，不在 Sidebar 内部耦合 store"
key_files:
  created:
    - frontend/src/components/sidebar/session-item.tsx
    - frontend/src/components/sidebar/session-group.tsx
  modified:
    - frontend/src/components/sidebar/sidebar.tsx
    - frontend/src/components/layout/app-layout.tsx
    - frontend/src/app/page.tsx
decisions:
  - "hover 色用现有 token --color-bg-hover (#28282c)，不自造 --color-bg-hover-strong；删除按钮内 hover 用 rgba(255,255,255,0.08) fallback"
  - "Sidebar 宽度维持 AppLayout 现有 240px grid-cols，不改 260px（PLAN 未强制，外科手术原则）"
  - "handleNew 仅调 createLocal（session-store 内部已 setActive），不在 page.tsx 重复 setActive"
  - "handleDelete 用 closure 中的 sessions 作删除前快照，find next；空列表 fallback 到 createLocal 空态"
  - "首次自动选中放 useEffect+didInitRef，明确 eslint-disable react-hooks/exhaustive-deps 注释，避免依赖变化重复触发"
metrics:
  duration: 6m12s
  completed: "2026-04-21"
  tasks_total: 3
  tasks_completed: 2
  tasks_deferred: 1  # Task 3 human-verify 待浏览器手验
  files_created: 2
  files_modified: 3
---

# Phase 10 Plan 04: Sidebar 组件套件 + page.tsx 组合（代码层）Summary

**One-liner：** 补齐 session-item/session-group/sidebar 三件套 + page.tsx 装配 handleSwitch/handleDelete/handleNew + sonner 8s 撤销 + 首次自动选中；静态验证三件套（tsc / vitest / next build）全绿，浏览器手验交由后续人工完成。

---

## Plan

- **Phase:** 10-session-management
- **Plan:** 04
- **Wave:** 2（depends_on 10-02 + 10-03）
- **Scope:** frontend 仅组件层 + page.tsx 组合；不改 backend、不改 session-store actions、不实现 SSE 重连 / HITL 刷新恢复

---

## Tasks

### Task 1: session-item.tsx + session-group.tsx（视觉基元）✅
- 新建 `session-item.tsx`：
  - 14px/font-510 会话项，h-8 px-3 rounded-md
  - active：`bg-[rgba(255,255,255,0.05)]` + `border-l-2 border-l-[#5e6ad2]` 左侧 2px 品牌色轨 + `text-primary`
  - 非 active：`text-secondary`，hover 用 `var(--color-bg-hover)`
  - 删除按钮 `opacity-0 group-hover:opacity-100`，onClick **首行 stopPropagation**（D-13）
  - role=button / tabIndex=0 / Enter+Space 键盘触发
  - aria-label="删除会话"
- 新建 `session-group.tsx`：
  - 分组标题 12px/font-510/`text-quaternary`/uppercase/tracking-wide
  - map items → SessionItem

### Task 2: sidebar.tsx 真实列表 + app-layout.tsx prop 化 + page.tsx 组合 ✅
- `sidebar.tsx`：接受 `{ onSwitch, onDelete, onNew }` props；useEffect 首次调 loadSessions；groupSessions 渲染；catch 静默，不阻塞 UI
- `app-layout.tsx`：`sidebar: ReactNode` prop 替代硬编码 `<Sidebar />`
- `page.tsx`：
  - `activeSessionId` 改从 `useSessionStore` 取
  - `useSSE(currentTaskId, activeSessionId)` 双参数
  - `handleSwitch` 按 D-09 五步：`loadHistoryAction([])` 清空 → `setActive` → `setCurrentTaskId(null)` → `await apiLoadHistory` → `truncate_after_active_task` 丢最末 → `setCurrentTaskId(active_task.task_id)` + setStatus 触发 reattach
  - `handleDelete`：`deleteOptimistic` → 失败 toast.error 回滚 → sonner `{ duration: 8000, action: { label: "撤销", onClick: restoreSession } }` → 若删的是 activeSessionId 则 `handleSwitch(next)` 或 `createLocal()` 空态
  - `handleNew`：`createLocal()`（store 内部已 setActive）+ 清 chat + currentTaskId=null
  - 首次 `didInitRef` useEffect：`loadSessions` → `list.length > 0 ? handleSwitch(list[0].id)`（P-04）

### Task 3: Success Criteria 1-4 浏览器手验 ⏳ 待人工
代码层完成，静态验证全绿，dev 环境可运行。浏览器勾选 20 条检查项由 orchestrator 向用户请求。

---

## Commits

| # | Commit  | Message                                                                 |
|---|---------|-------------------------------------------------------------------------|
| 1 | 0e4d8c4 | feat(10-04): 新增 session-item + session-group 视觉基元                  |
| 2 | 896c02f | feat(10-04): sidebar 渲染真实列表 + page.tsx 组合 session-store handlers |

（最终 SUMMARY commit 由本文件提交产生，记为 `docs(10-04): 完成 Phase 10 Plan 04 代码层 — 待人工浏览器验证`）

---

## Duration

约 6m12s（读 plan + 读上下文 + 落两 task + 静态验证 + SUMMARY）。

---

## 静态验证结果

| 命令 | 结果 |
|------|------|
| `cd frontend && npx tsc --noEmit` | **exit 0**（Plan 03 残留的 `activeSessionId` / `useSSE` 单参数两条 TS2339/TS2554 全部清除） |
| `cd frontend && npx vitest run` | **exit 0**，`time-group.test.ts` 7/7 passed |
| `cd frontend && npx next build` | **exit 0**，Compiled successfully，First Load JS 226 kB，路由 `/` 预渲染正常；Next.js 内置 Linting 步骤通过 |
| `cd frontend && npx next lint` | **跳过** — 项目未单独配置 eslint（只有 next.config.ts，无 .eslintrc，`package.json` 无 `lint` script）。Next build 流程已集成 Linting 步骤并 pass |

### PLAN 指定的 grep 自检

```bash
grep -n "useSSE(currentTaskId, activeSessionId)" frontend/src/app/page.tsx
# 38:  useSSE(currentTaskId, activeSessionId);

grep -n "duration: 8000" frontend/src/app/page.tsx
# 93:      duration: 8000,

grep -n "truncate_after_active_task" frontend/src/app/page.tsx
# 65:        hist.truncate_after_active_task && hist.messages.length > 0

grep -n "stopPropagation" frontend/src/components/sidebar/session-item.tsx
# 41:          e.stopPropagation();
```

全部命中预期次数。

---

## DESIGN Token 使用清单

| 位置 | Token / Literal | 用途 |
|------|----------------|------|
| session-item active bg | `rgba(255,255,255,0.05)` | Linear 活跃项背景（DESIGN §Surface / D-06） |
| session-item active border-left | `#5e6ad2` | Linear 品牌 Indigo 2px 左轨（CONTEXT §D-06 明确指定） |
| session-item 默认 text | `var(--color-text-secondary)` | 14px 默认态 |
| session-item active text | `var(--color-text-primary)` | 突出 active |
| session-item hover bg | `var(--color-bg-hover)` | globals.css 映射 `#28282c` |
| delete btn hover bg | `rgba(255,255,255,0.08)` | **fallback** — `--color-bg-hover-strong` 未在 globals.css 定义（决策已记录） |
| delete btn icon | `var(--color-text-tertiary)` | `#8a8f98`，匹配 muted icon |
| session-group label | `var(--color-text-quaternary)` 12px/510 uppercase | `#62666d` 分组标题 |
| sidebar bg | `var(--color-bg-deepest)` | `#08090a` Linear 最深层 |
| 新建会话 button | 复用 shadcn Button variant="ghost" + `var(--color-text-secondary)` | 与 DESIGN ghost button 一致 |
| 字重 | 510（会话项 / 按钮） / 510（分组标题） | DESIGN 签名 weight |
| 字号 | 14px（item）/ 12px（group label）/ 15px（新建会话） | DESIGN Caption Large / Label / Small Medium |
| radius | rounded-md（item）/ rounded p-1（delete btn） | DESIGN Comfortable 6px / Standard 4px |

---

## 手验待办（HUMAN VERIFY）

**前置准备：**
```bash
cd docker && docker-compose up -d && cd ..
cd backend && python -m app.main          # port 8001
cd frontend && npm run dev                # port 3000
# 浏览器打开 http://localhost:3000，DevTools → Network → Fetch/XHR + EventStream
```

### ☐ Success Criteria 1：侧边栏展示会话列表 + 新建
1. 首次进入：若之前有 session 历史，sidebar 按"今天/昨天/7 天内/更早"分组显示；若无，只显示"新建会话"按钮
2. 发几条消息（title 取 query 前 30 字）→ 会话出现在"今天"分组
3. 点击"新建会话"：sidebar 立即新增无标题占位；输入框可继续发消息
4. 会话项 hover：背景变深（`#28282c`）；active 项左侧 2px `#5e6ad2` 品牌色轨 + 稍深背景 `rgba(255,255,255,0.05)`

### ☐ Success Criteria 2：切换会话 + 历史加载
1. 点击另一条会话：message list 立即清空 → 加载该会话的 user/assistant 气泡 + tool pill
2. 历史中 tool pill 显示 done（绿 ✓）；reject 过的显示 rejected（红 ×）
3. 历史中 **不** 显示 HitlCard（P-01 降级为两态）
4. 首次进入页面若有历史 session，自动选中最新一条并加载历史（P-04）

### ☐ Success Criteria 3：SSE 连接正确关闭，不出现泄漏
1. DevTools Network → EventStream → 看到一个 `/api/chat/stream/{task_id}` 连接
2. 发消息期间切换到另一个会话：旧连接状态变 `(canceled)`；**不**同时存在两个 pending SSE
3. 切回原会话（若原 task 仍 running/interrupted）：新开 SSE，`from_id=0` 重放事件
4. HITL 场景：A 触发 HITL → 切 B → 切回 A → HitlCard 可见、按钮可用；**只有一张** HitlCard 不重复

### ☐ Success Criteria 4：删除会话 + 撤销
1. hover 会话项右侧出现垃圾桶图标
2. 点击垃圾桶：会话立即消失 + 底部 sonner "已删除 [title]" + "撤销" 按钮
3. 点撤销：会话重新出现在列表；切到该会话能看到原消息历史
4. 删除后不点撤销等 ~10s：toast 自动消失；会话不再出现
5. 删除当前活跃会话：自动切到列表下一条（按 last_updated 排序）；若列表空则进入"新建会话"空态
6. 点击删除按钮时 **不** 触发切换（stopPropagation 生效）

### ☐ 回归验证
1. 单会话普通消息流不受影响（SSE token 逐字显示）
2. HITL approve / reject / feedback 三路径仍工作

**失败格式：** "失败：Criterion 3 第 3 条 — 切回 A 没有新开 SSE，控制台报 404"

---

## 已知 Limitation（Phase 10 边界）

- **HITL 页面刷新恢复**（从 task meta 还原 pending 审批）→ Phase 12 RESIL-02
- **SSE 断线自动重连**（Last-Event-ID / retry backoff）→ Phase 12 RESIL-01
- **deletedPending 刷新丢失**：8s 撤销窗口内用户刷新页面会丢失撤销机会（T-10-07 accept，产品决策非缺陷）
- **sessions 闭包快照**：handleDelete 里 `sessions.find(next)` 依赖 closure 中的 sessions 作删除前快照。React 的 `useSessionStore` 订阅不会立即同步更新组件内变量，此行为符合 React 语义且 PLAN 明确指定此方案

---

## Deviations from Plan

### Auto-fixed Issues
无 Rule 1/2/3 触发。两个 Task 严格按 PLAN `<action>` 步骤执行。

### Adjustments
- **Sidebar 宽度 260px → 维持 240px**：PLAN 原型 Sidebar 写 `w-[260px]`，但 AppLayout 现有 `grid-cols-[240px_1fr]` 固定 240px。两者冲突下遵循 CLAUDE.md §3 外科手术原则，维持 AppLayout 现状（Sidebar 去除硬编码宽度，由 grid 控制）。视觉差别 20px 不影响 Linear 风格。
- **`--color-bg-hover-strong` fallback**：PLAN 允许当 token 未定义时用 `rgba(255,255,255,0.08)`。globals.css 确认未定义，已采用 fallback，无歧义。
- **handleNew 简化**：PLAN 原型有未使用的 `const newId = createLocal()`，按 CLAUDE.md §3 "不产生孤儿变量" 删除声明。createLocal 内部已 setActive，page.tsx 不再重复 setActive。
- **首次自动选中 eslint-disable 注释**：`didInitRef` 保证只 mount 触发一次，空依赖数组是有意设计，添加 `// eslint-disable-next-line react-hooks/exhaustive-deps` 明确意图。

### Scope Compliance
- 不触 backend
- 不动 session-store 的 actions
- 不动 chat-store 内部 token buffer / segments 逻辑
- 不实现 SSE 重连（Phase 12）
- 不引入新库（sonner 已在 08 阶段引入）
- 未改 DESIGN.md 或 globals.css

---

## Known Stubs
无。Sidebar 所有渲染均来自真实 `useSessionStore.sessions`；deletedPending 是功能设计非 stub；createLocal 本地占位语义已在 Plan 03 明确记录，不重复。

---

## Threat Flags
无新增威胁表面。T-10-07/08/09 全部 accept（见 PLAN threat_model）。T-10-01 由 Plan 01 后端 `user_id=user_id` 绑定兜底，前端只消费 listSessions 天然过滤后的结果。

---

## TDD Gate Compliance
本 Plan 非 TDD 类型（type=execute 非 type=tdd），无需 RED/GREEN gate 顺序。静态验证复用 Plan 02 的 vitest 套件（7/7 passed 保持）。

---

## Self-Check: PASSED

### Files Created
- `frontend/src/components/sidebar/session-item.tsx` — FOUND
- `frontend/src/components/sidebar/session-group.tsx` — FOUND

### Files Modified
- `frontend/src/components/sidebar/sidebar.tsx` — FOUND（props 化 + 真实列表）
- `frontend/src/components/layout/app-layout.tsx` — FOUND（sidebar ReactNode prop）
- `frontend/src/app/page.tsx` — FOUND（useSessionStore 订阅 + 三 handler + 首次 useEffect）

### Commits
- `0e4d8c4` feat(10-04): 新增 session-item + session-group 视觉基元 — FOUND
- `896c02f` feat(10-04): sidebar 渲染真实列表 + page.tsx 组合 session-store handlers — FOUND

### Verification Gates（静态）
- `npx tsc --noEmit` exit 0 ✔
- `npx vitest run` 7/7 passed ✔
- `npx next build` exit 0, Compiled successfully ✔
- 四项 grep 自检全部命中 ✔

### Human Verify Gate（浏览器）
- Success Criteria 1-4 共 20 条勾选项 **尚未完成** — 本 executor 按指令不代替人工勾选，交由 orchestrator 向用户请求浏览器手验

### 结论
代码层验证通过；浏览器手验待人工完成。本 SUMMARY 在"手验待办"章节已列出完整 20 条勾选清单。
