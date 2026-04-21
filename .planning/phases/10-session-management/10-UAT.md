---
status: complete
phase: 10-session-management
source:
  - 10-01-SUMMARY.md
  - 10-02-SUMMARY.md
  - 10-03-SUMMARY.md
  - 10-04-SUMMARY.md
started: 2026-04-21T05:45:00Z
updated: 2026-04-21T11:30:00Z
completed: 2026-04-21T11:30:00Z
---

## Current Test

[none — all passed]

## Tests

### 1. 冷启动烟雾测试
expected: 杀掉已跑的 backend/frontend，docker compose 重启基础设施，分别重启两端。backend 与 frontend 启动无异常，浏览器打开 http://localhost:3000 无 500/白屏，GET /api/sessions 正常 200。
result: pass
verified_by: claude
note: "docker postgres+redis healthy；backend 用 .venv/bin/python 启 8001 LISTEN + Application startup complete（仅一条 psycopg deprecation warning）；frontend next dev 3000 LISTEN Ready 933ms；GET /api/sessions 200 {\"sessions\":[]}；GET :3000 200。error/warn monitor 已挂。"

### 2. 侧边栏分组渲染 + 新建会话（含 hover / active 样式）
expected: |
  - 历史有会话时，sidebar 按"今天 / 昨天 / 7 天内 / 更早"分组展示（空桶不渲染）。
  - 输入框发 1-2 条消息：该会话出现在"今天"分组，title 取 query 前 30 字。
  - 点击"新建会话"按钮：sidebar 顶部立即插入无标题占位项；输入框保持可交互。
  - 会话项 hover：背景变深（#28282c）。
  - active 项左侧 2px 品牌色左轨（#5e6ad2）+ 略深背景 rgba(255,255,255,0.05)。
result: pass
reported: "有了有了"

### 3. 切换会话 + 历史加载 + 首次自动选中
expected: |
  - 刷新页面若有历史 session：自动选中最新一条（last_updated 最新），message list 展示该会话历史。
  - 点击另一条会话：message list 立即清空 → 加载该会话的 user/assistant 气泡 + tool pill。
  - 历史中 tool pill：done 绿 ✓；被 reject 的 tool 显示 rejected 红 ×。
  - 历史中不出现 HitlCard（P-01 降级两态语义）。
result: pass
reported: "pass"

### 4. SSE 连接切换 + HITL 跨会话切换
expected: |
  - 发消息时 DevTools → Network → EventStream 有一条 /api/chat/stream/{task_id}。
  - 期间切换到另一个会话：旧连接状态变 (canceled)，不同时存在两条 pending SSE。
  - 切回原会话且原 task 仍 running/interrupted：新开 SSE（from_id=0 重放）。
  - HITL 场景：A 触发 HITL → 切 B → 切回 A → HitlCard 可见且按钮可点，只有一张 HitlCard 不重复。
result: pass
reported: "可以了正常了"
note: "初测切回 A 无 HitlCard → 修 page.tsx handleSwitch reattach 分支补 addAssistantMessage 占位（commit 4c308f3）后复测通过。pending 状态下跨会话切回 HitlCard 正确重放且按钮可用。"
gap_discovered:
  - "approve 后立即切走再切回：SSE from_id=0 重放把整个 task 历史（tool+hitl+token）又追一遍，与 loadHistory 注入的 assistant message 堆叠 → 多一条 tool pill + 过期 pending HitlCard 重建。Redis stream 里无 hitl_resolved 标记，前端无从知晓该 HITL 已被 approve。"

### 5. 删除会话 + 8s 撤销
expected: |
  - hover 会话项右侧出现垃圾桶图标；点击 stopPropagation，不触发切换。
  - 点击垃圾桶：会话立即从列表移除 + 底部出现 sonner "已删除 [title]" + "撤销" 按钮。
  - 点"撤销"：会话重新回到列表；切到该会话能看到原消息历史。
  - 不点撤销 ~10s：toast 自动消失；会话不再回到列表。
result: pass
reported: "pass"

### 6. 删除当前活跃会话自动切到 next（WR-01 回归）
expected: |
  - 选中一个会话作为 active，点击其垃圾桶删除。
  - UI 不卡死、不空白；自动切到列表下一条（按 last_updated 排序，通常为剩下第一条）。
  - 若列表已空：进入 createLocal 空态（输入框可用但 sidebar 仅有"新建会话"按钮）。
  - 关键点：切到的 next 不是"刚删的那一条幻影项"（修复前的 bug 表现）。
result: pass
reported: "pass"

### 7. 撤销删除 HITL 在途会话后审批按钮仍可用（WR-02 回归）
expected: |
  - 让会话 A 触发 HITL（interrupted 状态，HitlCard 可见）。
  - 切到别的会话（不 resume）。
  - 回到 A → 删除 A → sonner "已删除" 出现。
  - 8s 内点"撤销"：A 重回列表，切到 A，HitlCard 可见且 approve / reject / feedback 三按钮仍可点（说明 last_task_id 已透传，active_task 不为 null）。
  - 修复前的 bug 表现：撤销后 HitlCard 不出现 / 按钮不可达 / 后台 task 继续跑但 UI 与其失联。
result: pass
reported: "pass"
note: "初测撤销后 HitlCard 不显示 → 根因是 session-store.sessions 数组的 last_task_id 自 loadSessions 后未同步后端（upsertSession 定义未使用），deletedPending 带的是陈旧 null。修 page.tsx handleDelete：删活跃会话时合并 chat-store.currentTaskId 到 target（commit 1b4551f）后复测通过。"
related_gap: G-02

### 8. 单会话普通消息流 + HITL 三路径回归（防 Phase 9 退化）
expected: |
  - 任选会话，发一条不涉及工具的普通问题：SSE token 逐字显示，结束后气泡完整。
  - 任选会话，发一条触发高德 MCP 工具的问题：HitlCard 出现。
    · 点 approve：工具执行，tool pill 变 done，后续回答正常。
    · 点 reject：tool pill 变 rejected，assistant 用 reject 前缀消息继续。
    · 点 feedback（若 UI 提供）：反馈提交后 agent 按新指令继续。
result: pass
reported: "正常"
note: "普通消息流 + HITL approve / reject / feedback 三路径全部正常，Phase 9 逻辑未退化。backend log 见 task 6a8c59f9 interrupted → resume → e667af2e completed。"

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

### G-01: reattach SSE 重放与 loadHistory 堆叠（approve 后切换触发）
severity: warning
phase: 10-session-management
discovered_in: Test 4
reproduce: |
  1. A 触发 HITL（book_hotel）→ HitlCard 出现。
  2. 点 approve。
  3. 立刻切到 B。
  4. 再切回 A（此时 A 的 task 仍 running，assistant 输出尚未 completed / 已 completed 但 last_task_id meta 未清）。
observed: |
  - 消息流出现两条同名 tool pill（历史一条 + 重放一条）。
  - 已 approve 过的 HitlCard 以 pending 状态重现，批准/反馈/拒绝按钮可点（但点击也无实际效果）。
  - 再切一次回 A（task 此时完全 completed）又恢复正常单条 tool pill。
root_cause: |
  后端 Redis task stream (`task:{task_id}:events`) 里只记录 tool/hitl/token/done 等原始事件，没有 "hitl_resolved {decision}" 标记。
  前端 SSE from_id=0 重放时，addHitlSegment 只按 pending 语义插卡片；addToolSegment 在 assistant 占位上无条件 append tool segment →
  与 loadHistory 注入的 assistant message（已含 tool done + 回复文本）堆叠重复。
  Phase 10 CONTEXT P-02 原记："精确匹配留给后续 Phase"。
suggested_fix: |
  Option A（后端侧，推荐）：resume 执行时 XADD 一条 `hitl_resolved {tool_name, decision}` 事件；前端收到后把最近 pending 同名 HITL 标记为对应终态，并 skip 之后的 tool:calling/done 重放（或标记"已渲染过"）。
  Option B（前端侧）：loadHistory 返回 truncate_after_active_task=true 时同时告知要丢弃最末几条而不止一条（对 approve-then-cross-switch 场景无法完整判定）—— 不推荐。
  Option C：load_history_for_session 改为根据 checkpoint metadata 精确计算 truncate 位置（代价大，留 Phase 11+）。
defer_to: Phase 11 或 hotfix

### G-02: session-store.sessions 的 last_task_id 不随 invoke / reattach 同步
severity: warning
phase: 10-session-management
discovered_in: Test 7
root_cause: |
  frontend/src/stores/session-store.ts 定义了 upsertSession 但无人调用。
  sessions 数组里每条记录的 last_task_id 只在 loadSessions 首次写入后就一直陈旧：
  - handleSend 成功的 invokeChat.response.task_id 没写回 sessions；
  - handleSwitch 的 hist.active_task.task_id 也没写回。
  导致任何依赖 "sessions 数组里 target.last_task_id" 的下游都是 stale。
current_mitigation: |
  Test 7 的主路径（删活跃会话后撤销）已通过 handleDelete 合并
  chat-store.currentTaskId 绕过（commit 1b4551f）。但非活跃会话的
  同类删除（先切走再回来不切入 → 直接从 sidebar 列表删除）无法
  覆盖，这是本 Gap 的剩余风险。
suggested_fix: |
  系统性修：在 handleSend 的 invokeChat 成功分支、handleSwitch 的
  reattach 分支，显式调 useSessionStore.getState().upsertSession
  用最新 last_task_id 更新对应 session 记录。一次性消除 stale 风险。
defer_to: Phase 11 或 hotfix
