# Handoff: ReAct Agent — UI/UX 精修（方向 A · Refined Linear）

## Overview

这是对 `ReActAgents/frontend` 的一次 **UI/UX 精修**（不是重写）。整体保留 Linear 风深色克制基调，主要解决四个痛点：

1. 全局滚动条刺眼（白色、始终可见）。
2. 内容呼吸感不足、信息密度失衡。
3. HITL 审批卡不够醒目，容易被忽略。
4. Composer 功能挤在一条、快捷键提示不清晰。
5. 任务计划（TodoDrawer）作为次要面板缺乏层次 / 进度反馈。

设计已经在 HTML 原型中完成（`ReActAgent UI Optimized.html` + `assets/variant-a.jsx` + `assets/variants.css`），现在要把它 **映射回真实的 Next.js + Tailwind v4 + shadcn 代码库**。

---

## About the Design Files

本 handoff 包里的 HTML / JSX / CSS 是 **设计参考**，不是可以直接搬进项目的生产代码。

- `ReActAgent UI Optimized.html` 是 Babel-in-browser 的原型，使用 `className="a-xxx"` 做独立样式命名空间，避免和设计画布干扰。
- **实施时请在现有 `frontend/src/components/**` 里原地修改**，继续使用 Tailwind v4 utility + CSS 变量（`var(--color-bg-panel)` 等），不要引入新的类名约定。
- `colors_and_type.css` / `variants.css` 是可读性高的「设计规格书」，用来抄数字（色值、spacing、radius、transition），不是要移植的样式表。

方向 B（Editor Mode）是当时对比用的参考，**不采用**。所有实施都以方向 A 为准。

---

## Fidelity

**High-fidelity.**  原型里的间距、色值、圆角、动画时长、字重、letter-spacing 都已经定好。实施时请按文档里的数字走，不要重新"感觉"一遍。

---

## Files to Change (映射表)

| 设计文件（参考） | 需要修改的源码文件 |
|---|---|
| `assets/variant-a.jsx` — `A_Sidebar` | `frontend/src/components/sidebar/sidebar.tsx`, `session-group.tsx`, `session-item.tsx` |
| `assets/variant-a.jsx` — `A_Header` | `frontend/src/components/chat/chat-area.tsx`（顶部栏部分） |
| `assets/variant-a.jsx` — `A_UserMsg` / `A_AssistantMsg` | `frontend/src/components/chat/message-bubble.tsx`, `message-list.tsx` |
| `assets/variant-a.jsx` — `A_ToolPill` | `frontend/src/components/chat/tool-pill.tsx` |
| `assets/variant-a.jsx` — `A_HitlCard` | `frontend/src/components/chat/hitl-card.tsx` |
| `assets/variant-a.jsx` — `A_Composer` | `frontend/src/components/chat/chat-input.tsx` |
| `assets/variant-a.jsx` — `A_TodoPanel` | `frontend/src/components/todo/todo-drawer.tsx`, `todo-list.tsx`, `todo-item.tsx` |
| `assets/variants.css` 里 scrollbar 规则 | `frontend/src/app/globals.css` |

---

## Design Tokens

Tailwind theme 里 **已有的 token 继续用**，不要新增。所有引用走 `var(--color-xxx)`：

```
--color-bg-deepest:       #08090a   侧栏背景
--color-bg-panel:         #0f1011   主区 / 抽屉背景
--color-bg-surface:       #191a1b   composer / 聚焦卡片
--color-bg-hover:         #28282c   悬停 / 用户气泡
--color-text-primary:     #f7f8f8   主要文本
--color-text-secondary:   #d0d6e0   次要文本 / assistant body
--color-text-tertiary:    #8a8f98   说明文字 / icon
--color-text-quaternary:  #62666d   占位符 / metadata
--color-accent:           #5e6ad2   按钮主色
--color-accent-violet:    #7170ff   渐变 / 进度条终点
--color-accent-hover:     #828fff   hover
--color-border-subtle:    rgba(255,255,255,0.05)
--color-border-standard:  rgba(255,255,255,0.08)
--color-border-focus:     rgba(255,255,255,0.12)
--color-error:            #ef4444
--color-success:          #10b981
```

**新增（需要在 globals.css `@theme` 里加）：**
```
--color-warn:         #f59e0b      HITL 琥珀警示主色
--color-warn-strong:  #d97706      HITL 条纹深色端
```
—— 如果不想加 CSS 变量，就用 `rgba(245,158,11, ...)` 字面量即可。

### Spacing / Radius

| 用途 | 值 |
|---|---|
| 主要 radius（气泡、卡片、按钮） | 6px / 10px / 12px 三档 |
| 侧栏 session item radius | 5px |
| Chip / pill radius | 999px |
| 侧栏宽度 | **248px**（原 240px，加宽 8px 做呼吸） |
| TodoDrawer 宽度 | **320px** |
| 主内容 max-width | **720px**（居中） |
| Composer padding | `12px 24px 20px`（外容器） |
| Message gap | **22px** |

### Typography

继承 Inter，全局加 `font-feature-settings: "cv01","ss03"`（已经在 globals.css 里）。下面是实际用到的几档：

| Role | Size | Weight | Letter-spacing | Line-height |
|---|---|---|---|---|
| 侧栏 logo / session title | 13 / 12.5px | 510 | — | 1.4 |
| Assistant / User 气泡正文 | **14.5px** | 400 | **-0.165px** | **1.65 / 1.5** |
| Header 标题 | 14px | 510 | -0.182px | — |
| Header 次信息（`12 条消息 · 今天 14:32`） | 11.5px | 400 | — | — |
| 快捷键 kbd | 9.5–10.5px | — | — | 字体用 mono |
| 小标签（分组头 / metadata） | 10.5px uppercase | 510 | 0.04em | — |

---

## Screen: Full Chat (方向 A 终版)

### Layout

三栏 CSS grid：

```
grid-template-columns: 248px  minmax(0, 1fr)  320px;
height: 100vh;
```

TodoDrawer 关闭时降为两栏 `248px 1fr`。抽屉展开动画：`transition: grid-template-columns 220ms ease`，抽屉内容 `transform: translateX(12px)` → `0` + opacity fade。

### 1. Sidebar（`components/sidebar/**`）

结构（自上而下）：

1. **顶部 Logo 行** — `padding: 4px 6px 2px`
   - 18×18 圆角 5px 方块，`linear-gradient(135deg, var(--color-accent), var(--color-accent-violet))`，内嵌 `sparkles` icon 12px。
   - 文字 "ReAct Agent"，13px / 510，`color: var(--color-text-secondary)`。
   - 右侧 22×22 设置按钮（`settings-2` icon 14px，hover 显 `bg-hover`）。
2. **New Session 按钮** — 整行，7×10 padding，1px border `border-standard`，hover 背景 `bg-hover` + border `border-focus`。
   - 图标 `plus` 14px + "新建会话" + 右侧 kbd `⌘K`。
3. **Search 输入** — 与 New Session 同行高，背景 `rgba(255,255,255,0.02)`，border `border-subtle`。`search` icon 13px + placeholder "搜索..."。
4. **Sessions（分组：今天 / 本周 / 更早）**
   - 分组头：10.5px uppercase 510，letter-spacing 0.04em，color `text-quaternary`。
   - Item：`padding: 6px 10px`，radius 5px，12.5px / 1.4。
   - Hover：`bg: rgba(255,255,255,0.03)` + color 升为 `text-secondary`。
   - Active：`bg: rgba(113,112,255,0.08)` + color `text-primary` + title 字重升为 510。
5. **Footer 用户行** — `padding: 8px`，上边框 `border-subtle`。
   - 26×26 头像方块，`linear-gradient(135deg, #4c4d8a, #7170ff)`，文字 `W`（11.5 / 590 白色）。
   - 右侧 name "Wenhua" 12.5 / 510 + "Pro · 4 tools" 10.5 `text-quaternary`。

### 2. Main Header（`chat/chat-area.tsx` 顶部）

- `padding: 10px 20px`，底边 `border-subtle`。
- 左：标题 "预订出差酒店" 14/510 + 灰色次信息 "12 条消息 · 今天 14:32" 11.5px。
- 右：三个 26×26 icon 按钮 — TodoDrawer 切换（`list-todo`，打开时 `bg: rgba(113,112,255,0.12)` + color `accent-hover`）、分享、更多。Hover `bg-hover`。

### 3. Message List（`chat/message-list.tsx` + `message-bubble.tsx`）

容器：`max-width: 720px; margin: 0 auto; padding: 28px 24px 24px; gap: 22px`。

**User 气泡** — `justify-content: flex-end`。
- `max-width: 85%`，`bg: var(--color-bg-hover)`，`color: text-primary`。
- **Radius：`14px 14px 4px 14px`**（右下角尖）。
- Padding `9px 14px`，font 14.5 / 1.5 / -0.165px，支持 `white-space: pre-wrap`。
- 内阴影 `inset 0 0 0 1px rgba(255,255,255,0.04)`。

**Assistant 消息** — `display: flex; gap: 14px; align-items: flex-start`。
- 左 gutter：22×22 头像方块（同 sidebar logo 渐变），`sparkles` 12px 白色。
- 右 body：最大宽度取容器，color `text-secondary`，14.5 / 1.65 / -0.165px。段间 `gap: 10px`。
- 行内 `<code>`：mono 12.5，`bg: rgba(255,255,255,0.05)`，padding `1px 5px`，radius 3px，1px border `border-subtle`，color `text-primary`。

### 4. Tool Pill（`chat/tool-pill.tsx`）

Pill 样式（**不是卡片**）：`display: inline-flex`，padding `4px 10px 4px 8px`，radius 999px，`bg: rgba(255,255,255,0.03)`，border `border-subtle`，font 12。

内部：16×16 圆形状态 icon + 工具名（12 / 510 `text-secondary`）+ 可选 `| arg:"..."` code（mono 11，前面 1px 左 divider）。

三状态：
| status | icon | icon bg | icon color |
|---|---|---|---|
| `calling` | `loader` spin | `rgba(113,112,255,0.12)` | `accent-violet` |
| `done` | `check` | `rgba(16,185,129,0.12)` | `success` |
| `rejected` | `x` | `rgba(239,68,68,0.12)` | `error`（工具名 line-through + 0.6 opacity） |

### 5. HITL Card（`chat/hitl-card.tsx`）⭐ 重点改动

原来是中性灰卡片，改成 **琥珀警示 + 呼吸光晕**。

容器：
```css
position: relative;
border-radius: 10px;
background: linear-gradient(180deg, rgba(245,158,11,0.06), rgba(245,158,11,0.02));
border: 1px solid rgba(245,158,11,0.22);
box-shadow: 0 0 0 3px rgba(245,158,11,0.04), var(--shadow-ring);
animation: hitl-glow 2.6s ease-in-out infinite;
overflow: hidden;
```

```css
@keyframes hitl-glow {
  0%, 100% { box-shadow: 0 0 0 2px rgba(245,158,11,0.03), var(--shadow-ring); }
  50%      { box-shadow: 0 0 0 4px rgba(245,158,11,0.10), var(--shadow-ring); }
}
```

左边 2px 渐变色条 `linear-gradient(180deg, #f59e0b, #d97706)`，绝对定位铺满高度。

内部 `padding: 14px 16px`：

1. **Header 行** — gap 10px，可 wrap，row-gap 6px：
   - 琥珀 badge `需要审批`（pill 2px 8px 2px 6px，bg `rgba(245,158,11,0.12)`，border `rgba(245,158,11,0.25)`，color `#f59e0b`，11.5 / 510），内部 6×6 圆点带 `box-shadow: 0 0 0 0 rgba(245,158,11,0.6)` 脉冲动画 1.6s。
   - 工具名用 mono chip：11.5px，`bg: rgba(255,255,255,0.04)`，border `border-subtle`，padding `1px 6px` radius 3px。
   - 最右快捷键提示 `Y / N / F`，`margin-left: auto`，10.5 mono `text-quaternary`，`white-space: nowrap`。

2. **Body 文本** — 14 / 1.55 / -0.165px，`text-secondary`，`margin: 6px 0 12px`。

3. **Actions 行** — gap 8px：
   - 批准（primary）：`bg: var(--color-accent)`，white，padding `6px 11px`，radius 6，12.5 / 510，内阴影 `inset 0 0 0 1px rgba(255,255,255,0.08)`，hover `accent-hover`。右侧 kbd `Y` 10 mono `rgba(0,0,0,0.25)` bg。
   - 反馈（ghost）：transparent + `border-standard`，hover `bg-hover` + `border-focus`。kbd `F`。
   - 拒绝（danger-ghost）：transparent + `border-standard`，hover `bg: rgba(239,68,68,0.1)` + color `error` + border `rgba(239,68,68,0.3)`。kbd `N`。

4. **反馈模式展开** —— 替换 Actions 行为 textarea：
   - 全宽 textarea，min-height 68px，padding `10px 12px` radius 6，bg `rgba(0,0,0,0.20)`，border `border-standard`，focus border `rgba(245,158,11,0.35)`。
   - 下方一行：左 count `n / 500` 11px `text-quaternary`，右提交按钮。

5. **已完成态**（approved/rejected）：整个卡淡化成 chip，padding 3×10，radius 999，display inline-flex。
   - `已批准`：color `success`，border `rgba(16,185,129,0.2)`，bg `rgba(16,185,129,0.06)`，`check` 12px。
   - `已拒绝`：同形，用 `error` 色 + `x` icon。

### 6. Composer（`chat/chat-input.tsx`）⭐ 重点改动

外层 `padding: 12px 24px 20px`。内部容器 `max-width: 720px; margin: 0 auto`，bg `bg-surface`，border `border-standard`，radius 12，`focus-within` 时 border `border-focus` + `box-shadow: 0 0 0 3px rgba(113,112,255,0.08)`。

结构拆成两行：

**Row 1**（`display: flex; align-items: flex-end; gap: 4px; padding: 8px 8px 8px 12px`）：
- 左 30×30 附件按钮（`paperclip` 14px，hover `bg-hover`）。
- 中 textarea：`flex: 1`，min-height 26，max-height 200，auto-resize。无 border / bg，padding `5px 4px`，14.5 / 1.5 / -0.165px。Placeholder "回复 Agent，或输入 / 查看命令..." 用 `text-quaternary`。Enter 发送，Shift+Enter 换行。
- 右 30×30 发送按钮：空时 `bg: rgba(255,255,255,0.04)` + color `text-quaternary`；有内容时 `bg: var(--color-accent)` + white，hover `accent-hover`。

**Row 2 Footer**（`padding: 6px 10px 8px`，上 `border-subtle`，`display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap`）：
- 左侧 chips：两个 `.comp-chip` — `工具 4` 和 `HITL 开启`。每个 padding `2px 7px` radius 4，10.5 `text-quaternary`，bg `rgba(255,255,255,0.03)` + border `border-subtle`，`white-space: nowrap`。
- 右侧 hint：`<kbd>Enter</kbd> 发送 · <kbd>⇧Enter</kbd> 换行`，10.5 `text-quaternary`。kbd 9.5 mono，padding `1px 4px` radius 3，bg `rgba(255,255,255,0.04)` + border `border-subtle`，`margin-right: 3px`。

### 7. TodoDrawer（`components/todo/**`）⭐ 重点改动

宽度 320px，bg `bg-panel`，左 border `border-subtle`。入场动画 220ms ease，同时 translateX 和 opacity。

**Header** — `padding: 10px 14px 10px 18px`，下 `border-subtle`：
- 左：标题 "任务计划" 13 / 510 + 完成计数 `2 / 4`（mono 11 `text-quaternary`）。
- 右：26×26 关闭按钮 `x` 13。

**进度条** — 高 2px，bg `rgba(255,255,255,0.04)`。
- Bar：`linear-gradient(90deg, var(--color-accent), var(--color-accent-violet))`，`box-shadow: 0 0 8px rgba(113,112,255,0.5)`，width 按完成比例，`transition: width 320ms ease`。

**List** — `flex: 1; overflow-y: auto; padding: 10px 0 16px`，使用共享 scrollbar 样式。

**Item** — `padding: 8px 18px; gap: 10px`，13 / 1.5 / `text-secondary`，入场 `todoEnter` 200ms。
- 左 14×14 mark，三态：
  - `pending`：14×14 圆，1.5px border `border-standard`。
  - `in_progress`：14×14 spinner，轨道 `border-standard`，头部 6.5r `accent-violet` 1.5px stroke，`animate-spin` 1s。
  - `completed`：14×14 圆填充 `accent-violet`，内嵌 `check` 10px 白色 strokeWidth 3，`inset 0 0 0 1px rgba(255,255,255,0.15)`。
- 文本：completed 态 color 降为 `text-quaternary` + line-through `rgba(255,255,255,0.15)`；in_progress 态 color 升为 `text-primary`。

**空态**："Agent 尚未制定任务计划"，居中 `padding: 32px 18px`，13px `text-quaternary`。

### 8. Scrollbar（⭐ 核心痛点修复）

改 `globals.css`，给 chat 消息区、侧栏滚动区、todo list 都应用：

```css
.nice-scroll {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  transition: scrollbar-color 200ms ease;
}
.nice-scroll:hover,
.nice-scroll:focus-within {
  scrollbar-color: rgba(255,255,255,0.08) transparent;
}
.nice-scroll::-webkit-scrollbar { width: 10px; height: 10px; background: transparent; }
.nice-scroll::-webkit-scrollbar-track { background: transparent; }
.nice-scroll::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 999px;
  border: 3px solid transparent;
  background-clip: content-box;
  transition: background-color 200ms ease;
}
.nice-scroll:hover::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.10); background-clip: content-box; }
.nice-scroll:hover::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.18); background-clip: content-box; }
```

应用到：`MessageList` 外层、`Sidebar` 滚动容器、`TodoList`。原来的白色默认滚动条是用户反复提到最刺眼的问题，必须修掉。

---

## Interactions & Behavior

| 事件 | 行为 |
|---|---|
| `⌘K` | 聚焦 New Session 按钮（或触发 `onNew`） |
| Enter | 发送（textarea 非空时） |
| Shift + Enter | 换行 |
| Y / N / F (HITL 卡激活时) | 对应 批准 / 拒绝 / 反馈 |
| TodoDrawer toggle | grid-template-columns 过渡 220ms ease |
| 消息进入 | 轻微 `todoEnter` 式淡入可选，默认无动画保持克制 |
| HITL 卡未决时 | glow 脉冲 2.6s infinite，badge 圆点脉冲 1.6s |

---

## State Management

现有 Zustand store 基本够用，只需确认：

- `useUIStore.todoDrawerOpen`：控制三栏 / 两栏切换（已存在）。
- `useChatStore.todos`：包含 `{ content, status: 'pending'|'in_progress'|'completed' }[]`（已存在）。
- HITL 卡的本地状态（查看 / 反馈模式 / 已决）保持原有实现方式即可。

---

## Assets

不需要新图。Icon 全部用 `lucide-react`：
`sparkles` / `settings-2` / `plus` / `search` / `list-todo` / `share` / `more-horizontal` / `paperclip` / `send` / `check` / `x` / `loader-2`（spin 用）/ `circle-alert`（HITL badge 可选）。

---

## Implementation Notes

1. **先改 `globals.css` scrollbar 规则**，然后用 `className="nice-scroll"` 往三处滚动容器上挂。这个改动收益最大，用户反复强调。
2. **HITL 卡和 TodoDrawer 是视觉差异最大的两处**，建议作为两个独立 PR。
3. **所有数字严格按文档**：14.5px 正文 / -0.165px letter-spacing / 22px message gap / 248px sidebar / 320px drawer。不要"大概这样"。
4. **不要引入新的 class 命名约定**，继续用 Tailwind utility + 已有 CSS 变量。原型里 `a-xxx` 是设计画布独立命名空间用的，不迁移。
5. **keyframes** `hitl-glow` / `hitl-dot` / `todoEnter`（已存在）统一放 `globals.css`。

## Files in This Bundle

- `README.md` — 本文档
- `ReActAgent UI Optimized.html` — 可运行原型（方向 A + 方向 B 对比）
- `assets/variant-a.jsx` — 方向 A（**采用**）全部 React 组件
- `assets/variant-b.jsx` — 方向 B（**不采用**，仅作对照参考）
- `assets/variants.css` — 所有视觉规格的 CSS 源
- `assets/colors_and_type.css` — 设计系统的色彩与字体 tokens
- `assets/design-canvas.jsx` — 设计画布的框架（**不需要移植**，仅为展示用）
