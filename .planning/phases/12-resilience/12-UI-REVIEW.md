# UI Review — Phase 12 (resilience) · 以 DESIGN.md 为基准

**审计范围**：截至 main 分支前端全部 UI（不限于 Phase 12 改动），以 `DESIGN.md`（Linear 风格设计系统）为唯一基准。
**审计模式**：源码静态比对（无 Playwright）。
**审计日期**：2026-04-22

---

## 综合评分：**18 / 24** — `稳健落地，关键 token 命中；细节一致性与排版纵深仍有提升空间`

| Pillar | Score | 一句话定调 |
|---|---|---|
| Copywriting | 3/4 | 中文文案克制、专业；个别提示语可更"Linear" |
| Visuals | 3/4 | 暗色基调与半透明分层正确；部分组件半径与图标元素偏离体系 |
| Color | **4/4** | 调色板与品牌靛紫 token 命中度极高 |
| Typography | 2/4 | 510/590 用对了，但负字距、Berkeley Mono、显示级层次缺位 |
| Spacing | 3/4 | 8px 节奏到位；侧栏与会话项间距偏紧 |
| Experience Design | 3/4 | 流式/HITL/重连/撤销已成体系；空态与状态可视化偏弱 |

---

## 1. Copywriting — **3/4**

DESIGN.md 没有写文案规则，但 Linear 整体语气追求 *cool, precise, declarative*。当前中文文案大多达标，少量地方过于"客服式"。

**Pass**
- [reconnect-banner.tsx:39](frontend/src/components/layout/reconnect-banner.tsx:39) "连接中断，正在重连…" — 直白、克制 ✓
- [hitl-card.tsx:76](frontend/src/components/chat/hitl-card.tsx:76) "需要审批" — 短促、命令式 ✓
- [hitl-card.tsx:88](frontend/src/components/chat/hitl-card.tsx:88) "告诉 Agent 你的修改意见..." — 友好且引导明确 ✓
- [sidebar.tsx:42](frontend/src/components/sidebar/sidebar.tsx:42) "新建会话" — 标准、清晰 ✓
- [todo-list.tsx:11](frontend/src/components/todo/todo-list.tsx:11) "Agent 尚未制定任务计划" — 中性、无负担 ✓

**Findings**
| ID | Where | Issue | Fix |
|---|---|---|---|
| C-1 | [page.tsx:225](frontend/src/app/page.tsx:225) | "服务暂时不可用，请稍后重试" — 偏客服话术 | 改为更工程化的 "服务暂不可用 · 请稍后重试" 或 "无法连接到 Agent 服务" |
| C-2 | [page.tsx:175](frontend/src/app/page.tsx:175) | reject 时硬编码长句 "用户已主动取消…请确认用户意图后再继续，不要重复尝试" — 这是给 LLM 的系统提示，不是 UI 文案；正确，但长期硬编码在 page.tsx 难以国际化 | 抽到 `lib/prompts.ts` 或 `lib/copy.ts` 集中管理 |
| C-3 | [message-list.tsx:37](frontend/src/components/chat/message-list.tsx:37) | "你好，有什么可以帮你的？" — 友好但平庸；Linear 空态多用 *suggestion + tagline* | 可加副标题示例 prompts（如 "试试：本周北京天气怎样？"），或保持空但加一行品牌 tagline |
| C-4 | [todo-drawer.tsx:13](frontend/src/components/todo/todo-drawer.tsx:13) | "任务计划" — 准确，但与 ToggleButton 的 `aria-label="切换任务面板"` 用词不一致（"计划" vs "面板"） | 统一用 "任务计划" 或 "Plan" |
| C-5 | [hitl-card.tsx:34](frontend/src/components/chat/hitl-card.tsx:34) `已批准 ${toolLabel}` 等三态文案 | 状态-工具拼接读起来有点机械（"已批准 高德地图查询"） | 改为 `${toolLabel} · 已批准`（subject 在前，状态在后，更像日志） |

---

## 2. Visuals — **3/4**

整体暗色质感和半透明分层都对了。失分集中在**圆角层级**与**装饰元素**两处。

**Pass**
- 半透明背景策略一致（`white/[0.02]` ~ `white/[0.05]`）— 严格遵循 DESIGN.md §6 luminance stepping
- ToolPill / HitlCard / 用户气泡的"边框 + 浅底"组合复刻了 Linear 卡片质感
- HitlCard 的 `shadow-[rgba(0,0,0,0.2)_0_0_0_1px]` ([hitl-card.tsx:71](frontend/src/components/chat/hitl-card.tsx:71)) 正是 DESIGN §6 Level 3 "Ring" 技法 ✓
- TodoItem 的 in-progress spinner 用 `--color-accent` 描边段 + `--color-border-standard` 底环，是 Linear 风格的克制 spinner ✓

**Findings**
| ID | Where | Issue | DESIGN ref | Fix |
|---|---|---|---|---|
| V-1 | [chat-input.tsx:81](frontend/src/components/chat/chat-input.tsx:81) `rounded-lg` (8px) | DESIGN.md §4 Inputs 明确说 **6px** | §4 Text Area | 改为 `rounded-md` (6px) |
| V-2 | [button.tsx:7](frontend/src/components/ui/button.tsx:7) shadcn 默认 `rounded-lg` (8px) | DESIGN.md §4 Buttons 全线 **6px** | §4 / §5 Border Radius Scale | 把 cva base 改为 `rounded-md`，size sm 改为同 6px（不要 12px） |
| V-3 | [tool-pill.tsx:20](frontend/src/components/chat/tool-pill.tsx:20) ToolPill `rounded-md` (6px) | DESIGN.md §4 Pill 标准是 **9999px**（full pill）或 micro **2px** | §4 Pill / §5 Full Pill | 改为 `rounded-full` 配 `px-2.5`，更像 Linear 的 status chip |
| V-4 | [message-bubble.tsx:76](frontend/src/components/chat/message-bubble.tsx:76) 流式结束后在 assistant 消息底部加一个 `<Sparkles>` 图标 | DESIGN.md 没有这个元素；Linear 的克制美学倾向"留空胜于装饰" | §7 Don't 类（"don't introduce decorative elements"） | 删除 Sparkles，或改用一条更细的分隔线/时间戳 |
| V-5 | [session-item.tsx:32](frontend/src/components/sidebar/session-item.tsx:32) 激活态用 `border-l-2 border-l-[#5e6ad2]` | Linear 侧栏激活态典型做法是"轻底 + 文字提亮"，不用左侧色条；左侧色条偏 Notion / VSCode | §4 Navigation | 去掉左 border，仅保留 `bg-[rgba(255,255,255,0.05)] + text-primary`；或保留色条但减为 2px 高度小标记 |
| V-6 | [text-segment.tsx:53](frontend/src/components/chat/text-segment.tsx:53) `<pre>` 块用 `bg-[var(--color-bg-surface)]` (#191a1b) | OK，但缺少 inset 阴影与 0.08 边框 hairline 形成 Linear "recessed code" 质感 | §6 Inset (Level 2b) | 加 `shadow-[inset_0_0_12px_rgba(0,0,0,0.2)]` 或保持现状但确保 padding 与字号匹配 mono caption |
| V-7 | [hitl-card.tsx:56](frontend/src/components/chat/hitl-card.tsx:56) 已完结状态徽章 `rounded-md` | 应为 pill (full) 或 micro (2px)；当前 6px 与 DESIGN 体系两端都不沾 | §4 Subtle Badge / Pill | 已批准 / 已拒绝 / 已反馈 这种状态徽章建议 `rounded-full` |

---

## 3. Color — **4/4**

最强 pillar。tokens 命中度近乎一比一。

**Pass**
- [globals.css:11-31](frontend/src/app/globals.css#L11-L31) tokens 与 DESIGN.md §2/§9 完全一致：
  - `#08090a` `#0f1011` `#191a1b` `#28282c` ✓
  - `#f7f8f8` `#d0d6e0` `#8a8f98` `#62666d` ✓
  - `#5e6ad2` `#7170ff` `#828fff` ✓
  - `rgba(255,255,255,0.05/0.08)` 边框 ✓
- selection bg 用 `rgba(94, 106, 210, 0.45)` ([globals.css:61](frontend/src/app/globals.css#L61)) — 正是 brand indigo 透明态 ✓
- 链接色用 `--color-accent-violet` (#7170ff) ([text-segment.tsx:30](frontend/src/components/chat/text-segment.tsx:30)) — DESIGN §2 把这个色明确分配给"interactive accents / links" ✓
- 任务完成 ✓ 用 `--color-success` (#10b981) — DESIGN §2 status 一致 ✓

**Minor Findings**
| ID | Where | Issue | Fix |
|---|---|---|---|
| K-1 | `--color-error: #ef4444` ([globals.css:29](frontend/src/app/globals.css#L29)) | DESIGN.md 没有定义 error 红，#ef4444 偏暖；但 Linear 中没有强红配色，pragmatic 选择可以接受 | 可考虑改为更冷的 `#eb5757` 或 `#f04438`，与 indigo-violet 调性更近 |
| K-2 | [hitl-card.tsx:144](frontend/src/components/chat/hitl-card.tsx:144) "拒绝" 按钮用 `text-[var(--color-error)] hover:bg-[var(--color-error)]/10` | OK；但 Linear 通常不会把 destructive 直接染红，更多用中性灰 + icon 区分。属设计取舍，不算违规 | 可保留 |
| K-3 | [page.tsx:54](frontend/src/components/chat/message-list.tsx:54) `text-[var(--color-error)]` 作为整段错误提示 | 可读性 OK；但缺少图标与卡片包裹，看起来像散文而非系统提示 | 用 `border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-3 py-2 rounded-md` 包一层 |

---

## 4. Typography — **2/4**

最大失分项。**核心问题：DESIGN.md 的字体身份没有被完全装载。**

**Critical Findings**
| ID | Where | Issue | Impact |
|---|---|---|---|
| T-1 | [layout.tsx:6-9](frontend/src/app/layout.tsx#L6-L9) `Inter({ variable: "--font-inter", subsets: ["latin"] })` | 没显式声明 `weight`，next/font 默认走 Inter 的可变字体（OK），但**没有显式设置 `axes: ['slnt']` 或确保 wght 轴被加载**。在 Next.js 15 下默认行为已是 variable font，**实际运行 510/590 应能渲染**，但配置表达不显式，未来若误改为非 variable 子集会立即降级到 400 | 隐性风险：UI 看上去"差点意思"却不会报错 |
| T-2 | [layout.tsx:6](frontend/src/app/layout.tsx#L6) 用的是 Google Fonts 的 Inter，**不是 Inter Variable** with axes loaded explicitly | DESIGN.md §3 第一行就强调 "Inter Variable, with `cv01`, `ss03`" — 当前 OpenType features 已开（globals.css:51 ✓），但字体来源链路没有显式化 | 同上 |
| T-3 | globals.css 没有 `Berkeley Mono` 引用 | DESIGN.md §3 mono 首选 Berkeley Mono；当前直接走 `ui-monospace, SF Mono, Menlo` 兜底链。Berkeley Mono 是付费字体，可接受省略，**但应在 globals.css 注释里写明"刻意省略 Berkeley Mono，使用系统 mono 兜底"** | 可读性 OK，但 mono 内容缺少 Linear 标志感 |
| T-4 | 全站缺少 **negative letter-spacing on display text** | DESIGN.md §3/§7 反复强调 "aggressive negative letter-spacing at display sizes"。当前 chat 页确实没有 display-size 标题，但 markdown 渲染中 h1-h3 全部塌缩为 `text-[15px]` ([text-segment.tsx:78-80](frontend/src/components/chat/text-segment.tsx#L78-L80))，**完全失去层次** | 长 markdown 回复时所有标题视觉等同正文，破坏可扫读性 |
| T-5 | tracking `-0.165px` 只在用户气泡和 HITL 描述上出现 | DESIGN.md §3 表格里 15px Small/Body 一律 `-0.165px`；当前侧栏 14px、TodoItem 14px、ToolPill 13px 等都没加负字距 | 全站 13–15px 文本缺少 Linear 字距质感 |

**Pass**
- [globals.css:51](frontend/src/app/globals.css#L51) `font-feature-settings: "cv01", "ss03"` ✓ 全局生效
- [globals.css:74](frontend/src/app/globals.css#L74) 标题/strong/b 默认 weight 590 ✓
- 多处 `font-[510]` 用于侧栏导航与会话项 ✓
- [chat-input.tsx:81](frontend/src/components/chat/chat-input.tsx#L81) 输入框用 `text-[15px] font-normal` ✓ 与 Body 15 行一致

**Recommended Fixes**
1. **显式声明字重轴**：
   ```ts
   const inter = Inter({
     variable: "--font-inter",
     subsets: ["latin"],
     weight: "variable",          // 显式声明可变轴
     display: "swap",
     adjustFontFallback: true,
   });
   ```
2. **markdown 标题分级恢复**（在 chat 上下文也应保留）：
   ```ts
   h1: 20px / 590 / -0.24px
   h2: 17px / 590
   h3: 16px / 590
   h4-h6: 15px / 590
   ```
3. **建一个 `text-body-sm` utility**（在 globals.css 加 `.text-body-sm { font-size:15px; letter-spacing:-0.165px; line-height:1.6 }`），全站替换孤立的 `text-[15px]` 写法。
4. globals.css 把 `--font-mono` 注释为：
   ```css
   /* Berkeley Mono 为付费字体未加载，使用系统 mono 兜底 */
   --font-mono: ui-monospace, "SF Mono", Menlo, monospace;
   ```

---

## 5. Spacing — **3/4**

8px rhythm 基本成立，少量地方过紧。

**Pass**
- AppLayout 三栏 `240px / 1fr / 320px` ([app-layout.tsx:18-21](frontend/src/components/layout/app-layout.tsx#L18-L21)) — 标准侧栏宽度 ✓
- ChatInput 容器 `max-w-3xl` + `px-6 pb-6 pt-4` ([chat-input.tsx:53-54](frontend/src/components/chat/chat-input.tsx#L53-L54)) — 居中对齐 + 8px 倍数 ✓
- MessageList `space-y-4` ([message-list.tsx:40](frontend/src/components/chat/message-list.tsx#L40)) — 16px 节奏 ✓
- HitlCard `p-4 my-2` ✓

**Findings**
| ID | Where | Issue | Fix |
|---|---|---|---|
| S-1 | [session-item.tsx:28](frontend/src/components/sidebar/session-item.tsx#L28) `h-8 px-3` | 8 + 8 + 8 节奏对，但 14px 字号 + 32px 高 + 12px 内边距对触控偏紧；Linear 桌面侧栏列表项更接近 28~32px 高 + 10px 字 | 当前 OK，可保留 |
| S-2 | [sidebar.tsx:29](frontend/src/components/sidebar/sidebar.tsx#L29) `gap-4 p-4` | 顶部 brand mark 与 "新建会话" 按钮间距 16px 偏大；与会话列表 `gap-3` 不一致 | 顶部块用 `gap-3` 与列表一致；或在 brand mark 下加 `border-b` 隔出 section |
| S-3 | [chat-area.tsx:14](frontend/src/components/chat/chat-area.tsx#L14) `px-4 py-2` header | 整个 header 高度仅 ~32px，又只放一个 toggle 按钮，显得头重脚轻；Linear 顶栏典型高度 44–48px | 改为 `px-4 py-3`，并考虑左侧加上当前 session 标题 |
| S-4 | [reconnect-banner.tsx:28](frontend/src/components/layout/reconnect-banner.tsx#L28) `px-4 py-1.5` | 内边距偏紧，banner 仅 24px 高 | 改为 `px-4 py-2`（28~32px 高度） |
| S-5 | [message-bubble.tsx:74](frontend/src/components/chat/message-bubble.tsx#L74) Sparkles `mt-2` | 见 V-4，建议直接删除 | — |
| S-6 | [todo-item.tsx:6](frontend/src/components/todo/todo-item.tsx#L6) `py-2 px-4 gap-3` | 与 sidebar 节奏一致 ✓ |  — |

---

## 6. Experience Design — **3/4**

Phase 12 把 resilience（重连 banner、HITL 解锁、会话切换、撤销 toast）做得相当完整。失分在**反馈密度**与**空态/异常引导**。

**Pass — 这些是真正的 Linear 级体验细节**
- 重连 banner 1s 延迟显示 + 300ms 退出 ([reconnect-banner.tsx:11-17](frontend/src/components/layout/reconnect-banner.tsx#L11-L17)) — 避免短暂闪烁 ✓
- 删除会话有 8s 撤销 toast ([page.tsx:108-117](frontend/src/app/page.tsx#L108-L117)) — Linear / Notion 标配 ✓
- HITL 三态（pending / approved / rejected / feedback）+ 提交时按钮禁用 + 失败回滚 ([page.tsx:153-200](frontend/src/app/page.tsx#L153-L200)) ✓
- 中文输入法 composition guard ([chat-input.tsx:65-79](frontend/src/components/chat/chat-input.tsx#L65-L79)) — Enter 不误发 ✓
- StreamingDots ([streaming-dots.tsx](frontend/src/components/chat/streaming-dots.tsx)) — sending 态视觉反馈 ✓
- TodoItem 入场动画 `animate-[todoEnter_200ms_ease-out]` ([todo-item.tsx:6](frontend/src/components/todo/todo-item.tsx#L6)) — Linear 风格的克制动效 ✓

**Findings**
| ID | Where | Issue | Fix |
|---|---|---|---|
| X-1 | [message-list.tsx:37](frontend/src/components/chat/message-list.tsx#L37) 空态只有一句话 | Linear / ChatGPT 风格的空态会给 2–4 个 starter prompts，提升首次使用激活率 | 加 prompt suggestion grid（2x2 卡片，使用 ToolPill 同款边框） |
| X-2 | [chat-input.tsx:91-98](frontend/src/components/chat/chat-input.tsx#L91-L98) 发送按钮禁用态 `disabled:bg-transparent disabled:text-quaternary` | 完全透明的禁用按钮在某些浏览器下与背景对比度过低，无障碍可达性差（WCAG 文本对比 < 3:1） | 禁用态保留 `bg-white/[0.04]`，仅文字降到 quaternary |
| X-3 | [reconnect-banner.tsx:36-37](frontend/src/components/layout/reconnect-banner.tsx#L36-L37) 重连指示用灰色脉冲点 | 灰色不携带"warning"语义；用户难以一眼判断这是"系统正在自愈"还是"数据加载中" | 把脉冲点改为 `--color-accent-violet` 或加一个小 `RefreshCw` icon |
| X-4 | [hitl-card.tsx:122-150](frontend/src/components/chat/hitl-card.tsx#L122-L150) 三按钮组（批准/反馈/拒绝）字号一致、视觉权重相近 | "批准" 是主动作（实色 brand bg ✓），但 "反馈" 与 "拒绝" 的视觉对称容易让用户犹豫"反馈是不是也算否决" | "反馈" 改为 ghost outline 风格，明确"不是否决" |
| X-5 | [chat-area.tsx:14-16](frontend/src/components/chat/chat-area.tsx#L14-L16) header 仅有 ToggleButton，无任何 session 上下文（标题、模型名） | 用户在多会话切换时缺少"我在哪里"的位置感 | header 左侧加当前 session title（truncate），右侧 toggle |
| X-6 | [message-list.tsx:53-56](frontend/src/components/chat/message-list.tsx#L53-L56) 错误态仅显示一行红色 paragraph | 没有重试按钮 / 没有"复制错误"快捷动作 | 包成 error card 并加 "重试" / "查看详情" 双按钮 |
| X-7 | [session-item.tsx:44](frontend/src/components/sidebar/session-item.tsx#L44) 删除按钮 `opacity-0 group-hover:opacity-100` | 移动端没有 hover，永远不可见 | 使用 `focus-within:opacity-100` + 长按手势 / 或永远显示但低对比 |
| X-8 | 全站缺少 keyboard shortcut overlay（`?` / `Cmd+K`） | DESIGN.md §4 Navigation 明确提到 "Search: command palette trigger (`/` or `Cmd+K`)" — 这是 Linear 的标志特性 | 列入 backlog，不是当前 phase 必须 |

---

## 顶部修复清单（Top Fixes，按 ROI 排序）

1. **T-1 / T-2 显式声明 Inter Variable axes**（5 行配置 → 整套 510/590 字重风险归零）
2. **V-1 / V-2 圆角统一为 6px**（input、button cva base）— 一处改动惠及全站
3. **T-4 markdown 标题恢复字号分级** — 长回答可读性立即提升
4. **V-4 删除 Sparkles 装饰图标** — 让 Linear 的"克制"真正成立
5. **V-3 ToolPill 改 `rounded-full`** — Linear 状态 chip 的灵魂形状
6. **T-5 抽 `.text-body-sm` 工具类**，全站消灭裸 `text-[15px]`
7. **X-2 发送按钮禁用态 `bg-white/[0.04]`** — WCAG / 视觉双修
8. **V-5 侧栏激活态去掉左 border** 改纯背景高亮 — 更 Linear 更少 Notion
9. **X-1 空态加 starter prompts** — 首次激活体验
10. **X-3 重连指示色改紫色 + 图标** — 语义明确化

---

## DESIGN.md 合规度速查

| DESIGN.md 章节 | 合规度 | 备注 |
|---|---|---|
| §1 Visual Theme | ✅ 90% | 暗色基调、半透明边框、品牌靛紫均到位 |
| §2 Color Palette | ✅ 98% | tokens 一比一；仅 `--color-error` 是 DESIGN 之外的扩展 |
| §3 Typography | ⚠️ 55% | OpenType features ✓ 但显示级层次/负字距/Berkeley Mono 缺位 |
| §4 Components | ⚠️ 70% | 圆角偏离体系、ToolPill 形状不对、装饰元素超规 |
| §5 Layout | ✅ 85% | 8px 节奏达标，max-width 与栏宽合理 |
| §6 Depth & Elevation | ✅ 80% | luminance stepping 用对了；inset shadow 仅 HitlCard 用过一次 |
| §7 Do's & Don'ts | ⚠️ 75% | 用了纯白 `text-white` 在 accent bg 上（icon 对比 OK，可接受）；引入了装饰 Sparkles（违反"克制"原则） |
| §8 Responsive | ⚪ N/A | 当前为桌面优先，未做移动断点验证 — 待 Phase 后续 |

---

## ▶ Next

`/clear` 然后任选其一：

- 直接修复 → 推荐先做 Top Fixes 1–6（半天工作量）
- `/gsd:plan-phase 13` — 规划下一阶段（移动端响应式 / Cmd+K palette / 空态体验）
- `/gsd:verify-work 12` — 对 Phase 12 做 UAT 验证

Full review path: `.planning/phases/12-resilience/12-UI-REVIEW.md`
