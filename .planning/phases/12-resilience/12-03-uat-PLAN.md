---
phase: 12-resilience
plan: 03
type: execute
wave: 3
depends_on:
  - 12-01
  - 12-02
files_modified:
  - .planning/phases/12-resilience/12-UAT.md
autonomous: false
requirements:
  - RESIL-01
  - RESIL-02
tags:
  - uat
  - resilience
  - hitl
  - checkpoint

must_haves:
  truths:
    - "用户主动断网 5s 后 UI 顶栏出现 banner，恢复网络 banner 消失，断线期间的事件在重连后完整补齐"
    - "G-01 回归：对一条 HITL approve 后，切走再切回同一会话，pending 按钮不再出现"
    - "刷新页面时如 Agent 仍处于 interrupted，HitlCard 正确重建且按钮可操作"
    - "reject 路径也走 hitl_resolved 收敛（tool pill 回写 rejected，气泡显示红色状态）"
    - "UAT 结论写入 12-UAT.md，任何 P0/P1 issue 若存在，明确列入'遗留 defer'或触发 plan-phase --gaps"
  artifacts:
    - path: ".planning/phases/12-resilience/12-UAT.md"
      provides: "4 个场景的 UAT 记录 + 结论"
      min_lines: 60
  key_links:
    - from: "UAT scenario 1 (主动断网)"
      to: "RESIL-01 + D-01 + D-04 + D-08"
      via: "人工观察 banner 出现/消失 + 浏览器重连请求 Headers 里的 Last-Event-ID"
      pattern: "reconnect-banner"
    - from: "UAT scenario 2 (approve-then-switch)"
      to: "G-01 + D-02 + D-09 resolveLastPendingHitl"
      via: "切会话 → 切回 → pending 按钮不应再出现"
      pattern: "resolveLastPendingHitl"
    - from: "UAT scenario 3 (刷新恢复)"
      to: "RESIL-02 + D-03 from_id=0 重放路径"
      via: "F5 刷新 → HitlCard 重建且按钮可点击"
      pattern: "handleSwitch"
    - from: "UAT scenario 4 (reject 闭环)"
      to: "D-02 reject decision + D-09 tool pill 回写"
      via: "reject 一条 HITL → tool pill 变 rejected"
      pattern: "hitl_resolved"
---

<objective>
人工 UAT Phase 12 Resilience 的 4 个场景（D-15），产出 `.planning/phases/12-resilience/12-UAT.md` 作为本 Phase 可交付的验证证据。

Purpose: Phase 12 全部三条线（RESIL-01 重连、RESIL-02 刷新恢复、G-01 修复）的"对用户可见"行为，自动化测试只能覆盖单元与集成层，**真实网络抖动 + 浏览器事件循环 + SSE 重连**必须人工验证。D-15 在 CONTEXT 明确要求 4 个场景；此 plan 作为 Phase 12 的 exit gate。
Output: `12-UAT.md` 包含所有场景的执行记录、截图（可选）、结论、若有 issue 的去向（新建 gap plan 还是 defer）。
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/12-resilience/12-CONTEXT.md
@.planning/phases/12-resilience/12-01-SUMMARY.md
@.planning/phases/12-resilience/12-02-SUMMARY.md
@.planning/phases/10-session-management/10-UAT.md

# Phase 12 两个前置 plan 的 SUMMARY 必读（了解已落地的实际契约与任何偏差）
</context>

<tasks>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 1: UAT 场景 1 — RESIL-01 主动断网 5s 重连 + 事件补齐</name>
  <files>.planning/phases/12-resilience/12-UAT.md</files>

  <read_first>
    - @.planning/phases/12-resilience/12-CONTEXT.md D-01 / D-04 / D-15 场景 ①
    - @.planning/phases/12-resilience/12-01-SUMMARY.md（确认后端 Last-Event-ID 契约）
    - @.planning/phases/12-resilience/12-02-SUMMARY.md（确认 banner 挂载点与 debounce 时长）
  </read_first>

  <what-built>
    - 后端 `/api/chat/stream/{task_id}` 读 `Last-Event-ID` header 作为续传起点（plan 12-01 Task 1）
    - 前端 `use-sse.ts` 在 onerror 未收终态时只置 `connectionStatus="reconnecting"`，收到终态 error/done 时会把连接状态收回 `connected`
    - 前端 `ReconnectBanner` 顶栏轻提示（debounce 1s 出现，重连成功 300ms 消失）
  </what-built>

  <action>
    **前置准备：**
    1. 启动基础设施：`cd docker && docker-compose up -d && cd ..`
    2. 启动后端：`cd backend && python -m app.main`
    3. 启动前端：`cd frontend && npm run dev`
    4. 打开 Chrome 访问 `http://localhost:3000`
    5. DevTools → Network 面板常开；勾选 "Preserve log"

    **执行步骤：**
    1. 发送会触发工具调用的消息（例："搜索北京西单周边的餐厅"，让后端调高德 MCP 产生 tool/token 流）
    2. 看到 token 开始流出后，DevTools Network → Throttling → Offline（或拔网线）
    3. 保持断网 5~8 秒，观察：
       - ~1s 后顶栏出现 banner "连接中断，正在重连…"（debounce 1s 生效）
       - banner 样式：灰色背景、次级灰文字、无警告色、左侧小脉动指示点
    4. DevTools Network → Throttling → No throttling（恢复网络）
    5. 观察：
       - 顶栏 banner 在 300ms 内消失
       - 聊天区域的 token/tool 事件继续补齐（断网期间事件不丢）
       - DevTools Network 中重连后的 `/api/chat/stream/{task_id}` 请求 Headers 里可见 `Last-Event-ID: <某 entry_id>`
    6. 看到 `done` 事件后整条消息完成

    **把每项判定结果记到 `12-UAT.md` §Scenario 1。**
  </action>

  <how-to-verify>
    **判定项（逐项打对勾 or 填写实际现象，写入 12-UAT.md）：**
    - [ ] 断网 1s 后 banner 出现
    - [ ] banner 样式符合 Linear 克制美学（无黄/红色）
    - [ ] 恢复网络 300ms 内 banner 消失
    - [ ] 断网期间的事件在重连后全部补齐（消息未截断）
    - [ ] DevTools 里重连请求 Headers 可见 Last-Event-ID（证明 D-01 链路通）
    - [ ] 无控制台 error / warning（React、zustand、SSE 相关）
  </how-to-verify>

  <verify>
    <automated>ls .planning/phases/12-resilience/12-UAT.md 2>/dev/null && grep -q "Scenario 1" .planning/phases/12-resilience/12-UAT.md</automated>
  </verify>

  <acceptance_criteria>
    - 6 条判定项全部写入 12-UAT.md（通过或带现象描述）
    - 控制台无 unhandled promise rejection
    - 至少完成 1 次完整"断网-恢复-看到 done"循环
  </acceptance_criteria>

  <done>
    12-UAT.md §Scenario 1 小节完整记录；通过或明确失败去向
  </done>

  <resume-signal>
    用户回复 `场景1通过` 或描述失败现象；失败由 orchestrator 决定是否触发 `/gsd-plan-phase 12 --gaps`
  </resume-signal>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: UAT 场景 2 — G-01 回归（approve-then-switch HITL 不复活）</name>
  <files>.planning/phases/12-resilience/12-UAT.md</files>

  <read_first>
    - @.planning/phases/10-session-management/10-UAT.md § G-01 小节（根因回顾）
    - @.planning/phases/12-resilience/12-CONTEXT.md D-02 / D-03 / D-15 场景 ②
  </read_first>

  <what-built>
    - 后端 `/resume` 成功后 XADD 一帧 `hitl_resolved`（plan 12-01 Task 2）
    - 前端 `use-sse.ts` 收到 `hitl_resolved` 调 `resolveLastPendingHitl("approved", payload.tool_name)`
    - 前端 `chat-store.resolveLastPendingHitl` 按 `tool_name` 优先匹配 pending HITL，匹配不到才 no-op / fallback
  </what-built>

  <action>
    **前置：** 至少两个会话 A / B（若只有 A，点"新建会话"创建 B）

    **执行：**
    1. 会话 A 发一条会触发 HITL 的消息（如"给我发一封邮件到 test@example.com"，触发需审批工具）
    2. HitlCard 出现 → 点 **Approve（批准）**
    3. 观察：HitlCard 变为已批准视觉（绿色✓或等效），按钮消失
    4. 等待后续 token/done 事件流完，消息完整收尾
    5. **切到会话 B**（点侧边栏 B）
    6. **切回会话 A**（点侧边栏 A）
    7. **关键判定：** 之前 approve 过的 HITL 是否仍显示 pending 状态 + 按钮？
       - 预期：**不应再出现 pending 按钮** —— HitlCard 保持 approved 终态（G-01 修复成功）
       - 若再次出现 pending 按钮 → G-01 回归未达成，需诊断
    8. **额外验证：** DevTools → Network → EventSource 面板（Chrome 99+），确认 from_id=0 重放时：
       - 流过一条 `event: hitl` 帧（尝试重建 HitlCard）
       - 紧接着流过一条 `event: hitl_resolved` 帧（把 pending 收敛为 approved）

    **把结果记到 12-UAT.md §Scenario 2。**
  </action>

  <how-to-verify>
    **判定项：**
    - [ ] 切回会话 A 后，approve 过的 HITL 不再显示 pending 按钮
    - [ ] 消息整体渲染顺序正确（无双气泡、无错位）
    - [ ] EventSource 日志里 `hitl` 帧 + `hitl_resolved` 帧都存在（顺序：hitl 先、resolved 后）
  </how-to-verify>

  <verify>
    <automated>grep -q "Scenario 2" .planning/phases/12-resilience/12-UAT.md</automated>
  </verify>

  <acceptance_criteria>
    - 3 条判定都写入 12-UAT.md
    - 若未达成：记录具体切换时序 + 网络面板截图路径 + 推测原因（backend publish 没发 / frontend listener 没触发 / resolveLastPendingHitl tool_name 匹配错位）
  </acceptance_criteria>

  <done>
    12-UAT.md §Scenario 2 完整；若失败则 issue 去向明确
  </done>

  <resume-signal>
    用户回复 `场景2通过` 或描述失败现象
  </resume-signal>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: UAT 场景 3 — RESIL-02 刷新页面恢复 HITL</name>
  <files>.planning/phases/12-resilience/12-UAT.md</files>

  <read_first>
    - @.planning/phases/12-resilience/12-CONTEXT.md D-03 / D-12 / D-15 场景 ③
    - @.planning/phases/12-resilience/12-02-SUMMARY.md（确认 page.tsx 是否改动）
  </read_first>

  <what-built>
    - 复用 Phase 10 `handleSwitch` + `active_task.status === "interrupted"` 路径
    - 前端 `useSSE` 用 `from_id=0` 重放 → `addHitlSegment` 重建 HitlCard
    - 此场景无新代码，是既有路径 + plan 12-01 事件契约的组合验证
  </what-built>

  <action>
    **执行：**
    1. 会话 A 发一条会触发 HITL 的消息
    2. HitlCard 出现时（**不要点任何按钮**），**F5 刷新页面**
    3. 观察：
       - 页面加载后自动激活最近会话 A
       - 历史消息正确渲染
       - **HitlCard 重新出现，状态仍为 pending，Approve/Edit/Reject 按钮可点击**
    4. 点 **Approve**
    5. 观察：agent 恢复执行，token 继续流出，消息完成
    6. **额外验证：** 点 Approve 后 DevTools Network EventSource 可见：
       - 一条 `hitl` 帧（初次重放时产生的历史气泡 —— 来自 from_id=0）
       - 一条 `hitl_resolved` 帧（本次 approve 后端 publish 的新事件）
       - 两条帧可能都从 from_id=0 重放出（视时序），但最终 HitlCard 保持 approved 终态

    **负样本警示：** 若刷新后 HitlCard 直接显示 approved（按钮消失）—— 错误行为；意味着 `resolveLastPendingHitl` 在没有匹配到真实目标时仍错误收敛了一条 pending 卡，需记录并排查。

    **把结果记到 12-UAT.md §Scenario 3。**
  </action>

  <how-to-verify>
    **判定项：**
    - [ ] 刷新后 HitlCard 可见且按钮可操作
    - [ ] 点 approve 后 agent 正常恢复执行到 done
    - [ ] 控制台无 error
    - [ ] 无重复 HitlCard（只有一张卡，不因 from_id=0 重放产生两张）
  </how-to-verify>

  <verify>
    <automated>grep -q "Scenario 3" .planning/phases/12-resilience/12-UAT.md</automated>
  </verify>

  <acceptance_criteria>
    - 4 条判定写入 12-UAT.md
    - HitlCard 状态异常时，记录 sessions Redis JSON 内容 + 网络面板 SSE 帧序列
  </acceptance_criteria>

  <done>
    12-UAT.md §Scenario 3 完整；RESIL-02 真实浏览器路径已验证
  </done>

  <resume-signal>
    用户回复 `场景3通过` 或描述失败现象
  </resume-signal>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: UAT 场景 4 — reject 路径闭环（tool pill 回写 rejected）</name>
  <files>.planning/phases/12-resilience/12-UAT.md</files>

  <read_first>
    - @.planning/phases/12-resilience/12-CONTEXT.md D-02 / D-15 场景 ④
    - @.planning/phases/09-tool-call-ux-hitl-approval/09-CONTEXT.md D-11（了解 Phase 09 建立的 tool pill 回写 rejected 语义）
  </read_first>

  <what-built>
    - plan 12-01 Task 2：`/resume` 在 `response_type === "reject"` 时也发 `hitl_resolved`，payload.decision = "reject"
    - plan 12-02 Task 2：前端 listener 把 "reject" → `resolveLastPendingHitl("rejected", payload.tool_name)`
    - plan 12-02 Task 1：`resolveLastPendingHitl("rejected", toolName)` 会把目标卡前置同 toolName 的 tool pill 回写为 "rejected"
  </what-built>

  <action>
    **执行：**
    1. 发一条会触发 HITL 的消息 → HitlCard 出现
    2. 点 **Reject**（"拒绝"），若需填 feedback 文本也填上
    3. 观察：
       - HitlCard 变为 rejected 终态视觉（红色✕或等效 DESIGN.md 约束视觉）
       - 前置出现过的 tool pill（"工具名 calling"/"工具名 done"）状态变为 rejected
       - 消息流继续正常收尾到 done
    4. **切会话再切回**，验证 reject 状态持久化且无回溯到 pending（与 G-01 同理但走 reject 路径）
    5. **额外：** 刷新页面验证 reject 状态也能从 from_id=0 重放正确恢复

    **把结果记到 12-UAT.md §Scenario 4。**
  </action>

  <how-to-verify>
    **判定项：**
    - [ ] 点 reject 后 HitlCard 进入 rejected 终态
    - [ ] 前置同名 tool pill 视觉变为 rejected（不再显示绿✓/done）
    - [ ] 切会话往返后状态稳定
    - [ ] 刷新后状态稳定
  </how-to-verify>

  <verify>
    <automated>grep -q "Scenario 4" .planning/phases/12-resilience/12-UAT.md</automated>
  </verify>

  <acceptance_criteria>
    - 4 条判定写入 12-UAT.md
    - tool pill 未回写（仍显示 done）时，记录现象并推测：`resolveLastPendingHitl` 回写分支漏了 / decision 映射不对 / toolName 匹配到了错误 card
  </acceptance_criteria>

  <done>
    12-UAT.md §Scenario 4 完整；reject 闭环已验证
  </done>

  <resume-signal>
    用户回复 `场景4通过` 或描述失败现象
  </resume-signal>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 5: 产出 12-UAT.md 汇总结论并决定 Phase 12 去向</name>
  <files>.planning/phases/12-resilience/12-UAT.md</files>

  <read_first>
    - 前 4 个 task 的执行记录
    - @$HOME/.claude/get-shit-done/templates/uat.md（若项目有 UAT 模板）
  </read_first>

  <what-built>
    通过 Task 1~4 的真实执行结果决定 Phase 12 收尾路径
  </what-built>

  <action>
    **人工产出 `.planning/phases/12-resilience/12-UAT.md`**，推荐结构：

    ```markdown
    # Phase 12 Resilience — UAT Report

    **UAT Date:** 2026-04-XX
    **Tester:** <user>
    **Build:** frontend + backend @ HEAD of Phase 12 plans merged

    ## Scenario 1: RESIL-01 主动断网重连
    - 执行结果：✅ / ❌
    - 实际现象：...
    - 判定项：6/6 通过 / N/6 通过
    - Issue：<若无则 None>

    ## Scenario 2: G-01 approve-then-switch
    - 执行结果：✅ / ❌
    - ...

    ## Scenario 3: RESIL-02 刷新恢复
    - 执行结果：✅ / ❌
    - ...

    ## Scenario 4: reject 闭环
    - 执行结果：✅ / ❌
    - ...

    ## 汇总结论

    **Phase 12 UAT：** 通过 / 部分通过 / 未通过

    ### 遗留 Issue（若有）
    | ID | 场景 | 现象 | 去向 |
    |----|------|------|------|
    | P12-UAT-01 | ... | ... | defer / new gap plan / hotfix |

    ### 决定
    - [ ] Phase 12 可 ship → 更新 ROADMAP + STATE；git commit 标记完成
    - [ ] 需要 gap fix → `/gsd-plan-phase 12 --gaps`
    - [ ] 需要回到 discuss → `/gsd-discuss-phase 12 --revision`
    ```

    完成后 `git add .planning/phases/12-resilience/12-UAT.md && git commit -m "docs(12): UAT report"`
  </action>

  <how-to-verify>
    **判定项：**
    - [ ] 4 个场景结果已记录
    - [ ] 若有失败/部分通过场景，每个都有去向决定
    - [ ] 若全部通过，明确写 "Phase 12 UAT 通过，可 ship"
    - [ ] 文件已 git commit
  </how-to-verify>

  <verify>
    <automated>test -f .planning/phases/12-resilience/12-UAT.md && grep -q "汇总结论" .planning/phases/12-resilience/12-UAT.md</automated>
  </verify>

  <acceptance_criteria>
    - `.planning/phases/12-resilience/12-UAT.md` 存在且覆盖 4 个场景
    - 每个失败项都有明确去向（defer / gap / hotfix）
    - 若全通过：ROADMAP Phase 12 可标记 `- [x]`
  </acceptance_criteria>

  <done>
    Phase 12 去向确定；UAT 报告已 git commit
  </done>

  <resume-signal>
    用户确认 UAT 报告已完成并 git commit；明确 Phase 12 去向
  </resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 测试者 ↔ 浏览器 DevTools | 手工模拟断网、刷新；不涉及真实生产流量 |
| UAT 报告 ↔ .planning/phases/ | 写入 markdown 文件；不影响运行时 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-12-11 | Repudiation | UAT 结果缺乏证据 | mitigate | 要求 12-UAT.md 记录每条判定项 + 失败现象 + 去向；截图路径（可选）；git commit |
| T-12-12 | Accept | 开发环境与生产网络差异 | accept | 本 Phase 仅保证开发环境 UAT 通过；生产环境 CDN / 代理 / WAF 对 SSE 重连的兼容性不在本 Phase 范围 |
</threat_model>

<verification>
- 本 plan 为 checkpoint 性质，"automated verify" 仅是人工 UAT 记录的存在性检查
- 若 UAT 通过且 ROADMAP 被更新，orchestrator 可继续至 Phase 13 规划
- 若 UAT 发现 issue 需 gap fix，orchestrator 应启动 `/gsd-plan-phase 12 --gaps`
</verification>

<success_criteria>
1. 4 个 UAT 场景全部执行并留下记录
2. `12-UAT.md` 文件生成并 git commit
3. Phase 12 去向明确（ship / gap / revision 三选一）
</success_criteria>

<output>
完成后创建 `.planning/phases/12-resilience/12-03-SUMMARY.md`，含：
- 4 个场景的通过/失败结果摘要
- 12-UAT.md 的关键结论复写
- Phase 12 最终去向（ship / gap / revision）
- 若 ship：ROADMAP.md 与 STATE.md 更新点
</output>
