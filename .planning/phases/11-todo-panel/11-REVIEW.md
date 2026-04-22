---
phase: 11-todo-panel
reviewed: 2026-04-22T10:00:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - backend/tests/fixtures/checkpoint_factory.py
  - backend/tests/conftest.py
  - backend/app/models/chat.py
  - backend/app/core/history.py
  - backend/tests/test_history.py
  - frontend/src/stores/ui-store.ts
  - frontend/src/stores/__tests__/ui-store.test.ts
  - frontend/src/stores/__tests__/ui-store.autoopen.test.ts
  - frontend/src/stores/__tests__/chat-store.todos.test.ts
  - frontend/src/stores/__tests__/chat-store.session-switch.test.ts
  - frontend/src/lib/types.ts
  - frontend/src/stores/chat-store.ts
  - frontend/src/hooks/use-sse.ts
  - frontend/src/app/page.tsx
  - frontend/src/components/todo/todo-item.tsx
  - frontend/src/components/todo/todo-list.tsx
  - frontend/src/components/todo/todo-drawer.tsx
  - frontend/src/components/todo/todo-toggle-button.tsx
  - frontend/src/app/globals.css
  - frontend/src/components/chat/chat-area.tsx
  - frontend/src/components/layout/app-layout.tsx
  - frontend/package.json
findings:
  critical: 0
  warning: 1
  info: 5
  total: 6
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-04-22T10:00:00Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Phase 11（Todo Panel）整体质量高，关键安全与语义契约都经得起审视：

- `setTodos` 为真正的整体覆盖（`chat-store.ts:302`），重放幂等成立。
- `partialize` 仅持久化 `todoDrawerOpen`，`Set<sessionId>` 留在内存 → 无 PII 泄漏、无 Set 序列化陷阱。
- `skipHydration: true` + 根节点 `useEffect(() => rehydrate())` 配对正确，SSR 首渲染用 `false` 避免 mismatch。
- `autoOpenDrawer` 幂等 + 尊重用户关闭意图，单测覆盖充分。
- `{todo.content}` 走 React 文本转义，todo 组件目录 `grep dangerouslySetInnerHTML` 为 0，无 XSS。
- 后端 `isinstance(t, dict)` filter + `.get("todos", []) or []` 双层兜底，形状篡改与空值路径均有防护。

共发现 1 条 Warning（React key 选型导致的入场动画回退）+ 5 条 Info（token 严格度、未使用契约、前端缺字段级校验、冗余动画声明、非 token 颜色的明示例外）。全部不阻塞交付，建议作为 Phase 12 或下一次整理时清理。

## Warnings

### WR-01: `todo-list.tsx` 使用数组索引作为 React key，导致 `animate-[todoEnter]` 在"整体覆盖"场景下不回放

**File:** `frontend/src/components/todo/todo-list.tsx:18-20`

**Issue:**
```tsx
{todos.map((t, i) => (
  <TodoItem key={i} todo={t} />
))}
```
- D-05 契约明确为"SSE `todo` 事件整体覆盖"，`setTodos` 也是真替换（非 merge）。
- D-09 要求 new item 进入列表时播放 `@keyframes todoEnter`（opacity 0→1 + translateY(4px→0)）。
- 但这里 `key={i}`，当 Agent 重新规划（`write_todos` 第二次触发，内容/顺序变化）时，React 只会做 props 更新、**不会 unmount/remount** 已有索引位置，导致 `animate-[todoEnter_200ms_ease-out]` 不回放，用户看到的是文本瞬切而非入场过渡。
- UAT（11-05）未捕获：Agent 行为偏向"追加"而非"整体换题"，碰巧让 tail 位置的新 item 落在新索引、能播动画。
- 这是 D-09 的实际回退，与 TODO-02 "状态变化自动更新" 紧密相关。

**Fix:** 使用内容驱动的 key，或组合 key：
```tsx
{todos.map((t, i) => (
  <TodoItem key={`${i}-${t.content}`} todo={t} />
))}
```
如果业务上可以断言 `content` 在同一时刻唯一（从 deepagents `write_todos` 观察到的行为支持这一点），直接 `key={t.content}` 更简洁。若想保留索引维度（同名 todo 重复场景），采用组合 key。

## Info

### IN-01: DESIGN.md token 严格度 — drawer 与 toggle-button 的 hover bg 使用裸 rgba，而非声明的 CSS 变量

**File:**
- `frontend/src/components/todo/todo-drawer.tsx:19`
- `frontend/src/components/todo/todo-toggle-button.tsx:15`

**Issue:**
```tsx
className="p-1 rounded hover:bg-[rgba(255,255,255,0.08)] transition-colors"
```
Phase 11 的 11-04 Summary 明确自我约束为"所有组件样式严格走 DESIGN.md 的 CSS 变量，不引入新 token"（D-15）；Phase 11 Context `<specifics>` 也强调"前端相关必须严格遵守 DESIGN.md … 不得凭直觉造 token"。

`rgba(255,255,255,0.08)` 数值上就是 `--color-border-standard`。更符合语义的 hover 背景 token 是 `--color-bg-hover`（`#28282c`，`globals.css:14`），项目另一处 sidebar 已经采用此惯例（`sidebar/sidebar.tsx:38` 用的是 `hover:bg-[var(--color-bg-hover)]`）。

（说明：与此同时 `sidebar/session-item.tsx:44` 确实使用了与新代码相同的 `hover:bg-[rgba(255,255,255,0.08)]` 写法 —— 按 CLAUDE.md §3"匹配现有风格"这是允许的理由。但由于 Phase 11 自己声明了比项目平均更严的 token 纪律，这仍应归档为 INFO 以保留例外可见性。）

**Fix:** 任选其一，保持风格一致：
```tsx
// 方案 A（语义贴合 hover bg 的已有 token）
className="... hover:bg-[var(--color-bg-hover)] transition-colors"

// 方案 B（数值等价）
className="... hover:bg-[var(--color-border-standard)] transition-colors"
```

### IN-02: `TodoModel` Pydantic 类声明后未被任何端点引用，属于未落地的"幽灵契约"

**File:** `backend/app/models/chat.py:50-57`

**Issue:** 11-02 Summary 明确选用"路径 A：TodoModel 仅声明契约，端点不绑 response_model"。结果是这个类既不参与 FastAPI 运行时校验，也不被其他类型引用（history.py 直接返回 `dict`）。

这与 CLAUDE.md §2"简洁优先：不加超出需求的功能 / 不加未被要求的'灵活性'"冲突：读者会预期"Pydantic 模型 = 校验点"，而这里实际只是文档性的占位。

**Fix:** 二选一：
- **方案 A（推荐，最小化）：** 删除 `TodoModel`，在 `app/core/history.py` 开头新增一行 docstring 说明 `todos` 字段形状（已有的 "Todo 形状来自 langchain TodoListMiddleware" 行覆盖了这一点），移除 `Literal` 导入。
- **方案 B（让契约真正生效）：** 在 `sessions.py` 的 messages 端点函数签名上标 `-> HistoryResponse`（新建 `HistoryResponse` model 引用 `list[TodoModel]`），并 `response_model=HistoryResponse`，让 FastAPI 真的校验并写入 OpenAPI schema。

### IN-03: 前端 `todo` SSE listener 缺少 per-item 字段校验，与后端非对称

**File:** `frontend/src/hooks/use-sse.ts:117-131`

**Issue:** 后端 `history.py:152-159` 对历史 todos 做 `isinstance(t, dict)` 过滤 + `content`/`status` 缺失补默认值。前端 SSE 路径只校验 `Array.isArray(payload.todos)`，逐条数据形状未校验。

若服务端（或未来的代理/压缩层）推出不合规元素（如 `{content: "x"}` 缺 `status`，或非 object），`TodoItem` 组件里三个 `status === "..."` 条件全都不命中 → 图标完全不渲染，用户只看到一行纯文字，无任何视觉指示（比"丢帧 + console 报错"更隐蔽）。

**Fix:** 在 listener 中镜像后端的兜底逻辑：
```ts
const sanitized = payload.todos
  .filter((t): t is { content?: unknown; status?: unknown } => t != null && typeof t === "object")
  .map((t) => ({
    content: typeof t.content === "string" ? t.content : "",
    status:
      t.status === "pending" || t.status === "in_progress" || t.status === "completed"
        ? t.status
        : ("pending" as const),
  }));
setTodos(sanitized);
if (sanitized.length > 0) autoOpenDrawer(sessionId);
```
若认为"信任后端输出、不加前端二次校验"是 established pattern（`token`/`tool`/`hitl` 三个 listener 也只做粗校验），可以保留现状并以 INFO 留档 —— 但 `token.text` 缺失会直接被 React 无害渲染，而 todo 缺 `status` 会产生"隐形元素"，严重度不同。

### IN-04: `InProgressSpinner` 冗余的 `animationDuration` inline style + 无效 `transition-all`

**File:** `frontend/src/components/todo/todo-item.tsx:33-34`

**Issue:**
```tsx
<svg
  aria-hidden="true"
  className="w-4 h-4 animate-spin transition-all duration-150"
  style={{ animationDuration: "1s" }}
  viewBox="0 0 16 16"
>
```
1. Tailwind `animate-spin` 默认就是 `animation: spin 1s linear infinite`，`style={{ animationDuration: "1s" }}` 完全重复（项目其他 3 处 `animate-spin` 用法都没这么写）。
2. `transition-all duration-150` 对一个持续 keyframe 旋转的元素没有意义 —— 没有属性值切换事件需要插值；而且 keyframes 会覆盖 transform 的 transition。CLAUDE.md §2"简洁优先"+ §3"自己改动产生的残留自己清"。

**Fix:**
```tsx
<svg
  aria-hidden="true"
  className="w-4 h-4 animate-spin"
  viewBox="0 0 16 16"
>
```

### IN-05: `CompletedCircle` 内 `text-white` 是明示的 token 例外，建议在代码/REVIEW 中保留可见性

**File:** `frontend/src/components/todo/todo-item.tsx:63`

**Issue:** 11-04 Summary 的 token 对照表已承认："completed Check 颜色 = `text-white`（Tailwind，非 token）"。DESIGN.md token 严格度原则下，这是 Phase 11 唯一被显式承认的例外。独立留档为 INFO 是为了避免将来有人按"全部走变量"的口径误删/误改，而丢失这段上下文。

**Fix（可选）：** 在 `todo-item.tsx` 的 `CompletedCircle` 上加一行 1 行注释：
```tsx
// NOTE: text-white 为 Phase 11 token 规范的明示例外（深色 accent 背景 + 固定白色 Check）。
```
或者不改代码，仅在本次 REVIEW.md 中记录，作为下次视觉走查的提示即可。

---

_Reviewed: 2026-04-22T10:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
