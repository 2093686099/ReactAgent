# Phase 11: Todo Panel - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-21
**Phase:** 11-todo-panel
**Areas discussed:** 面板位置与布局, Todo 数据生命周期, 三态视觉与动效, 历史会话 todos 还原

---

## 面板位置与布局

### Q1: Todo Panel 应以什么方式结合到现有聊天布局？

| Option | Description | Selected |
|--------|-------------|----------|
| 右侧固定 panel | AppLayout 改为 grid-cols-[240px_1fr_320px]，经典 IDE 布局，面板常驻 | |
| 右侧可折叠抽屉 | 默认隐藏，顶栏/聊天右上角切换按钮，需要 toggle 细节 | ✓ |
| 聊天流内缩略卡片 | AI 消息上方/底部嵌入 todo card，不改 layout，但多轮重复占位 | |
| 顶部 banner 进度条 | chat 顶部一行进度条 + x/y，点击展开列表 | |

**User's choice:** 右侧可折叠抽屉
**Notes:** —

### Q2: 抽屉的默认状态与触发行为怎么定？

| Option | Description | Selected |
|--------|-------------|----------|
| 默认隐藏，首次收到 todo 自动弹出 | 空态不占平面；首条 todo 事件到达时 drawer 自动打开一次 | ✓ |
| 默认隐藏，完全用户手动切换 | 即使产生 todos 也不自动弹，仅顶栏按钮 toggle | |
| 默认展开 | 等同"固定 panel"选项，状态持久化到 localStorage | |

**User's choice:** 默认隐藏，首次收到 todo 自动弹出

### Q3: 抽屉的状态记交给谁？

| Option | Description | Selected |
|--------|-------------|----------|
| 独立的 UI store | 新建 ui-store.ts，domain-sliced，可未来复用 | ✓ |
| 直接放入 chat-store | 简单，但脉络 domain-slicing 原则 | |
| 本地 React state 在 page.tsx | 快，但无法持久化、其他组件访问麻烦 | |

**User's choice:** 独立的 UI store

---

## Todo 数据生命周期

### Q1: todos 数据绑定到哪个维度？

| Option | Description | Selected |
|--------|-------------|----------|
| 绑定当前 session | todos 随 activeSessionId 隔离，与 Phase 10 一致 | ✓ |
| 绑定当前 task | 随 currentTaskId 隔离，task 切换即清空 | |
| 全局最新，不隔离会话 | 只有一份 todos，所有会话共享 | |

**User's choice:** 绑定当前 session

### Q2: task 结束后（done 事件），todos 是否保留？

**Round 1 outcome:** 用户提出"什么意思，你是指单个任务还是当前一整轮的 todolist"——术语澄清。
**Round 2 重新提问：** 同一 session 内，一轮对话结束（SSE done）后，整张 todo 清单要不要继续显示在面板里？

| Option | Description | Selected |
|--------|-------------|----------|
| 保留，等下一轮覆盖 | 上一轮整张 todo 留在面板；下一轮 Agent write_todos 时整体覆盖 | ✓ |
| done 后清空面板 | SSE done 到达即清空，drawer 回到空态 | |

**User's choice:** 保留，等下一轮覆盖

---

## 三态视觉与动效

### Q1: pending / in_progress / completed 三个状态的视觉区分？

| Option | Description | Selected |
|--------|-------------|----------|
| Linear 风 checkbox + 圆环 | pending 空心圆、in_progress 半圈 spinner、completed 实心+✓ | ✓ |
| Dot + color swatch | 三态用不同颜色小圆点 + 循环动画 | |
| Checkbox + 删除线 | completed 划删除线 + 文案降灰 | |

**User's choice:** Linear 风 checkbox + 圆环

### Q2: 状态切换时要不要动画？

| Option | Description | Selected |
|--------|-------------|----------|
| 极简：fade-in + spinner + 150ms ease | 新 item fade-in，in_progress spinner 循环，状态切换 150ms | ✓ |
| 无动画 | 快照直接刷新，不做任何过渡 | |
| 较丰富的动效 | 勾选/填充/重排动画 | |

**User's choice:** 极简

---

## 历史会话 todos 还原

### Q1: 用户切回一个旧会话时，todo 面板要显示什么？

| Option | Description | Selected |
|--------|-------------|----------|
| 扩展后端 GET /sessions/{id}/messages 返回 state.todos | 复用 Phase 10 端点，响应体加 todos 字段 | ✓ |
| 仅 live 流显示 | 切历史会话清空面板，重新 invoke 才有 todos | |
| reattach 到运行中 task 时重放 | 仅运行中会话能补齐，已完成会话面板为空 | |

**User's choice:** 扩展后端

---

## 收尾

### Q: 以上决策足够写 CONTEXT.md 了吗？还有没有 Phase 11 内尚未明确的 gray area？

| Option | Description | Selected |
|--------|-------------|----------|
| 可以写了 | 进入 /gsd-plan-phase 11 | ✓ |
| 还想谈几项 | 识别副 gray area（宽度/点击 item/负载上限 等） | |

**User's choice:** 可以写了
**Notes (用户强调):** 前端相关的请务必遵守我的 DESIGN.md

---

## Claude's Discretion

- todos 最终放 chat-store 还是独立 todo-store（倾向合并入 chat-store）
- 抽屉展开/收起具体动画细节（推荐 200ms ease）
- toggle 按钮具体图标
- 空态文案
- `hasAutoOpenedFor` 是否持久化（默认不持久化）
- spinner SVG 几何细节
- completed 项是否显示时间戳（决定不显示）

## Deferred Ideas

- 手动编辑/勾选 todos
- todo 展开详情 / 百分比 / 子 todo
- 跨 session 全局规划视图
- 抽屉宽度可拖拽
- 未读 badge / 通知中心
- RAG source panel 是否复用 drawer 壳（Phase 13 评估）
