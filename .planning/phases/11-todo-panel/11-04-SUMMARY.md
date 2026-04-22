---
phase: 11-todo-panel
plan: "04"
subsystem: frontend-ui-components
tags: [frontend, todo, drawer, app-layout, css-animation, wave-3]
dependency_graph:
  requires: [ui-store.ts, chat-store.todos, use-sse.todo-listener, 11-03]
  provides: [todo-item, todo-list, todo-drawer, todo-toggle-button, app-layout-grid, chat-area-header]
  affects:
    - frontend/src/app/globals.css
    - frontend/src/components/todo/todo-item.tsx
    - frontend/src/components/todo/todo-list.tsx
    - frontend/src/components/todo/todo-drawer.tsx
    - frontend/src/components/todo/todo-toggle-button.tsx
    - frontend/src/components/chat/chat-area.tsx
    - frontend/src/components/layout/app-layout.tsx
tech_stack:
  added: []
  patterns:
    - AppLayout 条件式 grid（Tailwind 任意值 + transition-[grid-template-columns]）
    - Zustand persist.rehydrate 在 useEffect 顶层调用（skipHydration 配对）
    - 三态 SVG/span 图标组件（D-08 token 对照）
    - @keyframes 追加到 globals.css，Tailwind animate-[] 任意值引用
key_files:
  created:
    - frontend/src/components/todo/todo-item.tsx    # 66 行
    - frontend/src/components/todo/todo-list.tsx    # 23 行
    - frontend/src/components/todo/todo-drawer.tsx  # 27 行
    - frontend/src/components/todo/todo-toggle-button.tsx  # 20 行
  modified:
    - frontend/src/app/globals.css                  # 追加 @keyframes todoEnter（+10 行）
    - frontend/src/components/chat/chat-area.tsx    # 改为 client component，加 header（14→18 行）
    - frontend/src/components/layout/app-layout.tsx # 加 use client + rehydrate + 条件 grid（15→31 行）
decisions:
  - "抽屉标题用「任务计划」（以 PLAN.md 为准，非摘要里的 Todos）"
  - "pending border token 选 --color-border-standard（D-15 禁止新增，globals.css 中最接近的现有 token）"
  - "AppLayout 动画由 transition-[grid-template-columns] 承担，drawer 本体不做 translateX（Pitfall 7）"
  - "chat-area 加 <header> 挂 TodoToggleButton 而非在 page.tsx 顶层注入（与 ChatArea 封装边界一致）"
metrics:
  duration: "~15min"
  completed: "2026-04-22T08:44:00Z"
  tasks_completed: 2
  files_changed: 7
---

# Phase 11 Plan 04: Todo UI 贴皮层 Summary

**一句话：** 新建 4 个 todo 组件（item/list/drawer/toggle-button）+ globals.css @keyframes + AppLayout 条件式三列 grid + chat-area header，实现 TODO-01/TODO-02 的完整视觉呈现，vitest 24/24 + next build 全绿。

## What Was Built

### Task 1: 4 个 todo 组件 + globals.css

**`frontend/src/app/globals.css`（+10 行）：**
追加 `@keyframes todoEnter`（opacity 0→1 + translateY 4px→0，200ms ease-out）。token 数量前后均为 18，D-15 完全守住。

**`frontend/src/components/todo/todo-item.tsx`（66 行）：**
三态图标 + 单条 todo 渲染。

| 状态 | 图标实现 | 颜色 token |
|------|----------|-----------|
| pending | `<span>` 空心圆 1.5px border | `--color-border-standard` |
| in_progress | inline SVG 半圈 spinner，animate-spin 1s linear | 底圆 `--color-border-standard`，弧 `--color-accent` |
| completed | `<span>` 实心圆 + Lucide `<Check size={12} strokeWidth={3} />` | 背景 `--color-accent`，Check `text-white` |

文案颜色固定 `--color-text-secondary`（不随状态变）。容器 `animate-[todoEnter_200ms_ease-out]`，图标 `transition-all duration-150`。

**`frontend/src/components/todo/todo-list.tsx`（23 行）：**
`"use client"` + `useChatStore((s) => s.todos)` 订阅。空态显示「Agent 尚未制定任务计划」（text-tertiary 15px），非空 map TodoItem。

**`frontend/src/components/todo/todo-drawer.tsx`（27 行）：**
`<aside>` 容器：`bg-[var(--color-bg-panel)]` + `border-l border-[var(--color-border-subtle)]`。header「任务计划」+ 关闭按钮（调 `closeDrawer`）。body 渲染 `<TodoList />`。

**`frontend/src/components/todo/todo-toggle-button.tsx`（20 行）：**
`<ListTodo size={14} />`，`aria-pressed={drawerOpen}`，`aria-label="切换任务面板"`，常显（无 `opacity-0 group-hover`），调 `toggleDrawer`。

### Task 2: AppLayout + chat-area 装配

**`frontend/src/components/chat/chat-area.tsx`（18 行，+4 行）：**
- 加 `"use client"` 指令
- 加 `<header className="flex items-center justify-end px-4 py-2 border-b border-[var(--color-border-subtle)]">` 挂 `<TodoToggleButton />`
- `<section>` 根容器 class 不变

**`frontend/src/components/layout/app-layout.tsx`（31 行，原 15 行）：**
- 加 `"use client"` 指令
- `useUIStore((s) => s.todoDrawerOpen)` 订阅
- `useEffect(() => { void useUIStore.persist.rehydrate(); }, [])` — SSR mismatch 规避（T-11-05）
- grid 条件式：`"grid-cols-[240px_1fr_320px]"` / `"grid-cols-[240px_1fr]"`
- `transition-[grid-template-columns] duration-200 ease-out` — 动画由 grid 承担
- `{drawerOpen && <TodoDrawer />}` 第三列条件渲染
- children 外层 `border-l border-[var(--color-border-subtle)]` 保留

## 三态图标 token 对照表

| 状态 | CSS 变量 | 说明 |
|------|---------|------|
| pending 边框 | `--color-border-standard` | `rgba(255,255,255,0.08)`，原 D-08 写 border-default（不存在），已采用推荐替代值 |
| in_progress 底圆 | `--color-border-standard` | 同上，与 pending 轨道色一致 |
| in_progress 弧 | `--color-accent` | `#5e6ad2`，品牌色 |
| completed 背景 | `--color-accent` | `#5e6ad2` |
| completed Check | `text-white` | Tailwind，非 token（Check 图标固定白色） |
| 文案（所有状态） | `--color-text-secondary` | `#d0d6e0`，不随状态变 |

## 测试 + build 证据

```
vitest: Test Files  5 passed (5) / Tests  24 passed (24)
next build: ✓ Compiled successfully in 1841ms
```

## Deviations from Plan

### Auto-fixed Issues

无。

### 计划内调整（不算偏差）

**抽屉标题：** plan 文件（task 描述 line 306）写的是「任务计划」，执行摘要写的是「Todos」——以 plan 文件为准，实现为「任务计划」（符合 D-01 / 中文 UI 一致性）。

## Known Stubs

无。todos 数据从 chat-store 实时读取（SSE 推送 → setTodos），loadHistory 路径也已在 11-03 串通。

## Threat Flags

无新增信任边界。T-11-02（XSS）、T-11-05（hydration mismatch）缓解已实现：
- `dangerouslySetInnerHTML` grep 全为 0（`grep -rc "dangerouslySetInnerHTML" frontend/src/components/todo/` 全部 0）
- `skipHydration: true` + `useEffect rehydrate` 配对，首渲染用 false 初值，避免 SSR mismatch

## Self-Check: PASSED

- [x] `frontend/src/app/globals.css` 含 `@keyframes todoEnter`（line 95）
- [x] token 数量：改前 18，改后 18（无新增）
- [x] `frontend/src/components/todo/todo-item.tsx` 存在（66 行）
- [x] `frontend/src/components/todo/todo-list.tsx` 存在（23 行）
- [x] `frontend/src/components/todo/todo-drawer.tsx` 存在（27 行）
- [x] `frontend/src/components/todo/todo-toggle-button.tsx` 存在（20 行）
- [x] `frontend/src/components/chat/chat-area.tsx` 含 `"use client"` + `<header` + `TodoToggleButton`
- [x] `frontend/src/components/layout/app-layout.tsx` 含 `"use client"` + `persist.rehydrate` + `todoDrawerOpen` + 条件 grid + `TodoDrawer`
- [x] `grep -rc "color-border-default" frontend/src/` 全为 0
- [x] `grep -rc "dangerouslySetInnerHTML" frontend/src/components/todo/` 全为 0
- [x] `grep -c "autoOpenDrawer" frontend/src/components/layout/app-layout.tsx` = 0
- [x] commit `becf06a` 存在（Task 1）
- [x] commit `beed249` 存在（Task 2）
- [x] vitest 24/24 passed
- [x] next build 成功
