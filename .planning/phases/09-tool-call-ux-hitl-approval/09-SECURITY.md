---
phase: 09
slug: tool-call-ux-hitl-approval
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-19
---

# Phase 09 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Scope: 前端 HITL 审批 UI 落地 — ToolPill / HitlCard / resumeChat API / SSE hitl 事件监听 / 三按钮审批流。本期未改后端。

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| browser → backend (/api/chat/resume) | 用户审批决策从前端发往后端 | taskId (string), responseType (literal), message (optional string) |
| backend SSE → frontend (hitl event) | 后端推送 interrupt_value 至前端 | 工具名、工具参数摘要 (前两个参数截断 80 字符) |
| user input → resumeChat | 反馈 textarea 内容作为 reject message | 自然语言字符串，经 trim() 后送 Agent（LLM 理解，非代码执行） |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-09-01 | T (Tampering) | resumeChat request body | mitigate | `responseType` TypeScript 字面量联合 `"approve" \| "reject"`（[api.ts:25](frontend/src/lib/api.ts:25)）+ 后端 `build_decisions` 再校验 | closed |
| T-09-02 | I (Info Disclosure) | hitl event args | mitigate | `formatHitlDescription` 仅取前两个参数值摘要 + 80 字符截断（[use-sse.ts:19](frontend/src/hooks/use-sse.ts:19)），不展示完整 args JSON | closed |
| T-09-03 | S (Spoofing) | /api/chat/resume endpoint | accept | 单用户模式无认证（per Phase 08 D-12）；FUT-01 延迟到多用户阶段 | closed |
| T-09-04 | D (DoS) | SSE connection during interrupted | accept | 单用户场景；XREAD 阻塞期间资源消耗极低 | closed |
| T-09-05 | T (Tampering) | HitlCard feedback textarea | mitigate | `feedbackText.trim()` + 作为 reject message 送 LangGraph（[hitl-card.tsx:63](frontend/src/components/chat/hitl-card.tsx:63)），不执行为代码 | closed |
| T-09-06 | I (Info Disclosure) | HitlCard description render | mitigate | 只渲染 `{segment.description}`（预格式化摘要，[hitl-card.tsx:47](frontend/src/components/chat/hitl-card.tsx:47)）；React 自动转义；全仓 0 处 `dangerouslySetInnerHTML` | closed |
| T-09-07 | R (Repudiation) | 审批操作 | accept | 单用户场景无审计需求；resolved pill 提供视觉记录（[hitl-card.tsx:27](frontend/src/components/chat/hitl-card.tsx:27)） | closed |
| T-09-08 | T (Tampering) | handleApprove/Reject taskId 来源 | mitigate | taskId 来自 store 中的 HitlSegment（由 SSE 事件 `addHitlSegment(taskId)` 写入，[use-sse.ts:107](frontend/src/hooks/use-sse.ts:107)）；不来自用户输入 | closed |
| T-09-09 | D (DoS) | resume API 错误处理 | mitigate | try/catch + `updateHitlStatus(taskId, "pending")` 回退 + `setError` + `toast.error`（[page.tsx:49](frontend/src/app/page.tsx:49), [page.tsx:68](frontend/src/app/page.tsx:68), [page.tsx:83](frontend/src/app/page.tsx:83)）；UI 不阻塞 | closed |
| T-09-10 | E (Elevation of Privilege) | feedback message content | accept | 反馈文本作为 reject message 经 LLM 理解重规划，无代码执行路径 | closed |

*Status: closed*
*Disposition: mitigate (implementation verified) · accept (documented risk)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-09-01 | T-09-03 | 单用户模式无认证层（Phase 08 D-12）；FUT-01 延迟到多用户阶段再加 JWT 校验 | user | 2026-04-19 |
| AR-09-02 | T-09-04 | EventSource 持久连接在单用户场景下资源消耗极低，无 DoS 实际影响 | user | 2026-04-19 |
| AR-09-03 | T-09-07 | 单用户无审计需求；resolved pill 提供本地视觉记录 | user | 2026-04-19 |
| AR-09-04 | T-09-10 | 反馈文本最终到达 Agent LLM，经自然语言理解重规划，不存在代码执行或提权路径 | user | 2026-04-19 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-19 | 10 | 10 | 0 | gsd-security-auditor |

### Supporting Evidence (code-review-fix confirmations)

| Review ID | Status | Evidence |
|-----------|--------|----------|
| WR-04 (SSE JSON.parse hardening) | Confirmed | [use-sse.ts:49](frontend/src/hooks/use-sse.ts:49) token 监听、[use-sse.ts:62](frontend/src/hooks/use-sse.ts:62) tool 监听、[use-sse.ts:97](frontend/src/hooks/use-sse.ts:97) hitl 监听 — 全部 JSON.parse 包在 try/catch；hitl 解析失败 `setError("HITL 事件解析失败")` |
| WR-05 (safeStringify) | Confirmed | [use-sse.ts:7](frontend/src/hooks/use-sse.ts:7) — null/undefined→""、string 透传、其他 JSON.stringify + BigInt/circular fallback + 80 字符截断 |
| XSS 隐式防护 | Confirmed clean | `frontend/src` 全域 0 处 `dangerouslySetInnerHTML`；所有用户/Agent 内容经 React 文本节点自动转义 |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-19
