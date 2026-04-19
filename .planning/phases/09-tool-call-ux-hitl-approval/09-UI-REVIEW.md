---
phase: 09-tool-call-ux-hitl-approval
type: ui-review
audit_baseline:
  - DESIGN.md (Linear 设计系统)
  - 09-CONTEXT.md D-01..D-13
scope:
  - frontend/src/components/chat/tool-pill.tsx
  - frontend/src/components/chat/hitl-card.tsx
  - frontend/src/components/chat/message-bubble.tsx
  - frontend/src/components/chat/text-segment.tsx
  - frontend/src/components/chat/message-list.tsx
  - frontend/src/hooks/use-sse.ts
  - frontend/src/app/page.tsx
scores:
  copywriting: 3
  visuals: 3
  color: 3
  typography: 3
  spacing: 4
  experience: 3
overall: 19
reviewed: 2026-04-19
---

# Phase 09 UI Review — Tool Call UX + HITL Approval

**Overall: 19 / 24** · 审核基线：DESIGN.md + 09-CONTEXT.md 决策 D-01…D-13（本阶段未单独交付 UI-SPEC.md，以 CONTEXT + DESIGN 作为双重合约）。

整体评价：Phase 09 把工具调用与审批流自然嵌入消息流中，视觉语言与 Linear 深色系一致，状态机（pending → approved / rejected / feedback → collapsed pill）按 D-08/D-09 落地。薄弱点集中在**文案可读性**、**颜色 token 一致性**、**按钮防抖与可访问性**三处，其余均在合约内。

---

## Pillar 1 — Copywriting 3/4

### 做得好
- 中文优先，动作动词精准：`批准` / `反馈` / `拒绝`（[hitl-card.tsx:88-106](frontend/src/components/chat/hitl-card.tsx:88)），短、清、无歧义；状态收起用 `已批准 / 已拒绝 / 已反馈`（[hitl-card.tsx:22-24](frontend/src/components/chat/hitl-card.tsx:22)），语义自然。
- 反馈 placeholder `告诉 Agent 你的修改意见...`（[hitl-card.tsx:54](frontend/src/components/chat/hitl-card.tsx:54)）把"反馈"二字拆解成用户视角的动作，比"输入内容"好一档。
- Reject 走 reject+message（D-07），page 层给默认 message `用户已主动取消此次工具调用，请确认用户意图后再继续，不要重复尝试。`（[page.tsx:65](frontend/src/app/page.tsx:65)），对 Agent 行为有明确约束，比空 reject 更稳。
- 错误 toast 区分网络故障 / 服务故障（[page.tsx:107-111](frontend/src/app/page.tsx:107)），文案不骂用户。

### 需要改的
- **[HIGH] 原始工具名泄漏给终端用户**。`formatHitlDescription` 直接把 `toolName`（如 `maps_geocode` / `maps_text_search`）拼进描述：`Agent 想要调用 maps_text_search：北京、咖啡`（[use-sse.ts:25](frontend/src/hooks/use-sse.ts:25)）。D-05 明确要求"自然语言描述，让非技术用户也能理解"，当前实现把技术 ID 直接暴露，违反合约。
  - **修复**：在 `use-sse.ts` 增加工具名 → 人话映射（至少覆盖当前启用的高德 MCP 工具），降级时才用原始名。例：`{ "maps_text_search": "搜索地点", "maps_geocode": "解析地址" }`。
- **[MED] 收起 pill 里依然是原始工具名**：`已批准 maps_text_search`（[hitl-card.tsx:22](frontend/src/components/chat/hitl-card.tsx:22)）。同上问题，审批后仍然残留在历史记录里。需要和上面的映射函数共用一套 label。
- **[LOW] 卡片标题 "需要审批"** （[hitl-card.tsx:41](frontend/src/components/chat/hitl-card.tsx:41)）稍硬。在对话语境里，`需要你确认一下` 或 `Agent 想做个操作` 更像人话；但"需要审批"也不是错，等 A/B 再定。
- **[LOW] 反馈成功无反馈**：点"发送反馈"后按钮即消失（组件由 pending → feedback 切换到 pill）。缺少一瞬的 loading 态文案（见 Experience 一节）。

---

## Pillar 2 — Visuals 3/4

### 做得好
- 双视觉层级清晰：ToolPill = 行内小圆角标签（[tool-pill.tsx:12](frontend/src/components/chat/tool-pill.tsx:12)，`rounded-md` 6px），HitlCard pending = 独立卡片（[hitl-card.tsx:38](frontend/src/components/chat/hitl-card.tsx:38)，`rounded-lg` 8px），resolved = 再退回 pill。信息密度随状态自适应。
- 图标语言一致：Loader2（calling，旋转）、Check（done/approved）、X（rejected）、MessageSquare（feedback）、Shield（审批中）。14/16px 尺寸分工清晰（pill 14px、卡片头 16px、按钮 14px）。
- Shield 图标 + 品牌色 `var(--color-accent)`（[hitl-card.tsx:40](frontend/src/components/chat/hitl-card.tsx:40)）给审批卡片一个权威锚点，避免整张卡片太平。
- MessageBubble 对 pending HITL 隐藏 Sparkles 完成图标（[message-bubble.tsx:41-43, 71-75](frontend/src/components/chat/message-bubble.tsx:41)），视觉正确传达"消息尚未完结"。

### 需要改的
- **[MED] 审批卡片缺少 elevation 分层**。DESIGN §6 的 Surface Level 要求 `bg rgba(255,255,255,0.05) + border rgba(255,255,255,0.08)`，当前卡片用 `bg-[var(--color-bg-surface)]`（`#191a1b`，实色）（[hitl-card.tsx:38](frontend/src/components/chat/hitl-card.tsx:38)）。实色在 `#0f1011` panel 背景上仍可见但层级感弱，也不符合 Linear "translucent card" 哲学（DESIGN §4 Cards "never solid — always translucent"）。建议改为 `bg-white/[0.03]`。
- **[MED] pending 卡片无任何阴影或 inset**。DESIGN §6 Level 3 `rgba(0,0,0,0.2) 0 0 0 1px` 或 Level 4 推荐给需要引起用户注意的浮层。审批卡片是一个**阻塞性交互**，理应比普通内容"浮"一档，现在它和旁边文本几乎等重。
- **[LOW] ToolPill done 态用纯 Tailwind 的 `text-emerald-500`（#10b981）**（[tool-pill.tsx:18](frontend/src/components/chat/tool-pill.tsx:18)），和 HitlCard approved pill 的 `text-emerald-500`（[hitl-card.tsx:22](frontend/src/components/chat/hitl-card.tsx:22)）是同色，但**没有**接入 globals.css 的 token 系统（没有 `--color-success`）。DESIGN §2 定义了 `#27a644` 与 `#10b981` 两个绿色，当前选择的是后者，OK，但应 tokenize。见 Color 一节。
- **[LOW] HitlCard pending → resolved 无过渡**。尺寸差距较大（卡片 → 单行 pill），瞬间折叠在长消息里有"跳"感。加 80ms 高度过渡会更像 Linear 的"消解"感。D-08 Claude's Discretion 范围内（未要求动画），不扣分，仅建议。

---

## Pillar 3 — Color 3/4

### 做得好
- 绝大多数颜色走 CSS 变量（`--color-accent`、`--color-accent-hover`、`--color-text-*`、`--color-border-standard`、`--color-error`）—— globals.css 的 token 体系在 Phase 09 得到了忠实执行（见 [hitl-card.tsx:23,40,41,46,53](frontend/src/components/chat/hitl-card.tsx:23)）。
- 品牌色 `#5e6ad2` 仅用于 Approve / "发送反馈" 主按钮与 Shield 图标，**符合** DESIGN §2 "brand indigo reserved for interactive/CTA elements only"。
- Reject 按钮用 `--color-error`（#ef4444）ghost 样式（[hitl-card.tsx:102-103](frontend/src/components/chat/hitl-card.tsx:102)），hover 态 `--color-error/10` 底色过渡克制。
- ToolPill 边框 `rgba(255,255,255,0.08)` + 底色 `bg-white/[0.05]`（[tool-pill.tsx:12](frontend/src/components/chat/tool-pill.tsx:12)），严格匹配 D-03 与 DESIGN §6 Level 2。

### 需要改的
- **[MED] 绿色未 tokenize**。ToolPill done 和 HitlCard approved 都直接写 `text-emerald-500`（Tailwind 内置）。等同于 `#10b981`，数值没错，但绕过了 globals.css 的 token 层，将来换 `#27a644` 或主题化需要全局 grep。建议在 `@theme` 里加 `--color-success: #10b981;`，组件统一用 `text-[var(--color-success)]`。
- **[LOW] Feedback 态 pill 图标用 `--color-accent`**（`#5e6ad2`）（[hitl-card.tsx:24](frontend/src/components/chat/hitl-card.tsx:24)）。主品牌色同时承担"已反馈"状态语义，会稀释 CTA 的唯一性。建议用 `--color-text-secondary` 或新增一个中性状态色。
- **[LOW] ToolPill rejected 态只用线划与透明度做差异**（[tool-pill.tsx:21-23](frontend/src/components/chat/tool-pill.tsx:21)），X 图标色 `text-tertiary`，和 done 的 emerald 形成对比不够强。rejected 用 `--color-error` 才和 HitlCard 语义对齐。

---

## Pillar 4 — Typography 3/4

### 做得好
- 卡片标题 `需要审批` 用 `font-[510]`（[hitl-card.tsx:41](frontend/src/components/chat/hitl-card.tsx:41)）—— **命中 Linear 签名权重**，DESIGN §3 "510 is the signature weight"。同时 `text-[14px]`/`text-[15px]` 的分层也符合 Small Medium / Small 档位。
- ToolPill 用 `font-mono text-[13px]`（[tool-pill.tsx:21](frontend/src/components/chat/tool-pill.tsx:21)），匹配 DESIGN §3 "Mono Caption" 13px 档，给技术工具名一个视觉上的"代码感"，区分于普通文本。
- globals.css 在 body 上启用 `font-feature-settings: "cv01", "ss03"`（[globals.css:50](frontend/src/app/globals.css:50)），Phase 09 所有组件都继承到，Linear Inter 字符替换全局生效。
- 代码块（text-segment.tsx）有完整的 markdown heading / code / table 层级处理，不是空壳。

### 需要改的
- **[MED] 15px 档缺失 `tracking` 修正**。DESIGN §3 Small 档要求 `-0.165px` letter-spacing；当前 HitlCard 描述文本（[hitl-card.tsx:46](frontend/src/components/chat/hitl-card.tsx:46)）、Textarea（[hitl-card.tsx:53](frontend/src/components/chat/hitl-card.tsx:53)）、MessageBubble 用户气泡（[message-bubble.tsx:27](frontend/src/components/chat/message-bubble.tsx:27)）均用 `text-[15px]` 但未加 `tracking-[-0.0103em]`（≈-0.165px at 16px 基准）。这是全项目一致性问题，不只是 Phase 09，但本次工作复用/新增了多处 15px 文字，顺势修复价值最高。
- **[MED] TextSegment 的 h1-h6 全部被扁平化为 `text-[15px] font-[590]`**（[text-segment.tsx:78-83](frontend/src/components/chat/text-segment.tsx:78)），Agent 输出的 Markdown 标题在聊天气泡内与正文等大，破坏了 Agent 回答中的结构感。建议至少 h1/h2 用 17px/590 (Body Emphasis)，h3 用 16px/510，保留 3 级层次。
- **[LOW] 按钮字号未显式**。shadcn Button `size="sm"` 默认 14px/500，DESIGN §4 建议 Small Label 12-14px 510。差距不大，不扣分，仅提示。

---

## Pillar 5 — Spacing 4/4

- 8px 基线严格：pill `my-1`（4px）、按钮 `gap-2`（8px）、卡片 `p-4`（16px）+ 内部 `mt-2/mt-3`（8/12px）—— 每一个数字都在 DESIGN §5 的 scale（1/4/8/12/16/24）里。
- 审批卡片内垂直节奏清晰：标题 → 描述（mt-2）→ 动作区（mt-3），三段间距递增，符合 Linear "呼吸感优于填满"。
- Textarea 展开后的 Send/Cancel 按钮使用 `gap-2`（[hitl-card.tsx:59](frontend/src/components/chat/hitl-card.tsx:59)），和未展开的三按钮组 `gap-2`（[hitl-card.tsx:81](frontend/src/components/chat/hitl-card.tsx:81)）保持一致，状态切换不"跳格"。
- ToolPill 内部 `px-2 py-0.5 gap-1.5`（[tool-pill.tsx:12](frontend/src/components/chat/tool-pill.tsx:12)），小到克制，不在消息流里抢视觉焦点，完美贴合 D-01"不打断阅读流"。
- MessageBubble `max-w-full` + TextSegment 响应式 markdown 布局稳定。

唯一小意见：**审批卡片左右无 `mx-*`**，卡片紧贴消息区宽边（`max-w-3xl`），可以考虑微缩 `mx-1` 增强"这是一张独立卡片"的感受，但在 3xl 容器里也不明显，不扣分。

---

## Pillar 6 — Experience Design 3/4

### 做得好
- 乐观更新 + 回滚（[page.tsx:50-55, 68-74, 84-89](frontend/src/app/page.tsx:50)）：HITL 操作瞬时反映在 UI，API 失败自动回到 pending，用户可以重试——符合"感知延迟"降低原则。
- SSE 连接复用（[use-sse.ts:111-118](frontend/src/hooks/use-sse.ts:111)）：resume 后不新开 EventSource，per D-09，流在同一条 assistant 消息里继续追加。
- HITL 事件解析失败**显式报错**：`setError("HITL 事件解析失败")`（[use-sse.ts:102](frontend/src/hooks/use-sse.ts:102)）附有清晰注释"hitl 事件丢失会让用户卡死无按钮可点"。不吞错误，是专业选择。
- Textarea 有 `disabled={!feedbackText.trim()}`（[hitl-card.tsx:63](frontend/src/components/chat/hitl-card.tsx:63)），防空提交；Cancel 同时清空内容（[hitl-card.tsx:71-74](frontend/src/components/chat/hitl-card.tsx:71)），符合预期。
- Toast + setError 双通道错误（[page.tsx:53-54, 72-73, 87-88](frontend/src/app/page.tsx:53)），在流中即时可见。

### 需要改的
- **[HIGH] 审批按钮在 API in-flight 期间不禁用**。用户点了 `批准` 后，如果后端恢复稍慢（常见），按钮仍然是 enabled 状态，快速双击会触发两次 `resumeChat`。虽然 updateHitlStatus 已把 segment 设为 approved，HitlCard pending 判断会失效，但这依赖状态顺序且未显式防护。
  - **修复**：HitlCard 接 `disabled={isSubmitting}` prop；或 page 层通过 `status === "sending"` 传入禁用标志。
- **[HIGH] 无可访问性标签**。所有图标 + 文字按钮没问题，但 ToolPill / HitlCard resolved pill 纯装饰图标缺 `aria-label`（[tool-pill.tsx, hitl-card.tsx:28-34](frontend/src/components/chat/tool-pill.tsx)）。屏幕阅读器用户听不到"工具 X 已完成"这样的语义。
  - **修复**：pill 外层 `<span role="status" aria-label="已批准 {toolName}">`，图标 `aria-hidden="true"`。
- **[MED] 反馈 textarea 缺 maxLength**（[hitl-card.tsx:52-58](frontend/src/components/chat/hitl-card.tsx:52)）。非技术用户粘贴长文本可能超过后端限制却毫无反馈。建议 `maxLength={500}` + 实时字符计数（右下角 `x/500`）。
- **[MED] 发送反馈按钮无 loading 态**。点击后 `onFeedback` 异步执行，在 `setStatus("sending")` 切换前按钮仍可再次点击，且没有 spinner 指示"正在提交"。ChatInput（Phase 08）有类似的状态处理，可复用模式（Loader2 替换 icon + disabled）。
- **[MED] 无键盘捷径**。审批是高频操作，`Enter` → Approve / `Esc` → 取消反馈 / `Cmd+Enter` → 发送反馈 会显著加速——Linear 自家产品几乎所有交互都有快捷键，这是"达到参考品质"的必修课。
- **[LOW] Reject 默认 message 硬编码在 page.tsx**（[page.tsx:65](frontend/src/app/page.tsx:65)），不可覆盖、不可国际化。未来 i18n 会踩坑，可提到 `lib/constants.ts` 或 `lib/messages.ts`。
- **[LOW] `resolvedIndex` 计算每次 render 重跑**（[message-bubble.tsx:33-39](frontend/src/components/chat/message-bubble.tsx:33)）。长消息 + 多 segments 时可用 `useMemo`，不过当前量级下不是瓶颈。

---

## Summary Table

| Pillar | Score | 一句话 |
|---|---|---|
| Copywriting | 3 / 4 | 中文表达自然；但原始工具名（`maps_geocode` 等）泄漏给终端用户，违反 D-05 |
| Visuals | 3 / 4 | 状态切换与图标语言统一；审批卡片缺 elevation、实色背景偏离 Linear translucent 哲学 |
| Color | 3 / 4 | token 覆盖面大；绿色未 tokenize、feedback 态用品牌色稀释 CTA 唯一性 |
| Typography | 3 / 4 | 510 权重与 cv01/ss03 就位；15px 档缺 tracking，markdown heading 层级被扁平化 |
| Spacing | 4 / 4 | 8px 基线严格，状态切换不跳格 |
| Experience | 3 / 4 | 乐观更新与回滚得体；缺按钮防抖、ARIA 标签与键盘捷径 |
| **Overall** | **19 / 24** | 在合约内，离"Linear 级"差最后 20% 打磨 |

---

## Top Fixes (优先级从高到低)

1. **工具名 → 人话映射** ([use-sse.ts:19-26](frontend/src/hooks/use-sse.ts:19) + [hitl-card.tsx:22-24](frontend/src/components/chat/hitl-card.tsx:22))
   添加 `TOOL_LABELS` 映射表，`formatHitlDescription` 与 resolved pill 共用，让非技术用户不再看到 `maps_text_search`。
2. **审批按钮 in-flight 禁用** ([hitl-card.tsx:83-107](frontend/src/components/chat/hitl-card.tsx:83))
   增加 `isSubmitting` prop，防重复点击；配合 Loader2 spinner 替换 Approve / 发送反馈按钮的图标。
3. **ARIA 可访问性** (tool-pill.tsx / hitl-card.tsx resolved pill)
   外层 span 加 `role="status" aria-label="..."`，图标 `aria-hidden`。
4. **成功色 tokenize**（globals.css + tool-pill.tsx + hitl-card.tsx）
   `--color-success: #10b981;` → 组件统一用 `text-[var(--color-success)]`，移除 `text-emerald-500`。
5. **审批卡片 elevation 调整** ([hitl-card.tsx:38](frontend/src/components/chat/hitl-card.tsx:38))
   背景换 `bg-white/[0.03]` + 叠加 `shadow-[rgba(0,0,0,0.2)_0_0_0_1px]`，强调阻塞性交互的视觉浮起。
6. **15px 文字补 Linear tracking**（全局，顺带修）
   Tailwind preset 或 globals.css 为 15px 档加 `letter-spacing: -0.0103em`。
7. **键盘捷径**（hitl-card.tsx）
   Enter 触发 Approve（未展开反馈态）、Cmd+Enter 发送反馈、Esc 取消反馈。
8. **反馈 textarea maxLength + 字符计数**（hitl-card.tsx:52）
   `maxLength={500}` + 右下角 counter。

## UI REVIEW COMPLETE

- **Overall: 19 / 24**
- Copywriting 3 · Visuals 3 · Color 3 · Typography 3 · Spacing 4 · Experience 3
- Top fixes: 工具名人话映射 / 按钮 in-flight 禁用 / ARIA 可访问性
