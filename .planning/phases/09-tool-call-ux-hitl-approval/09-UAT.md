---
status: complete
phase: 09-tool-call-ux-hitl-approval
source:
  - 09-01-SUMMARY.md
  - 09-02-SUMMARY.md
  - 09-03-SUMMARY.md
started: 2026-04-18T00:00:00Z
updated: 2026-04-19T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: 后端（port 8001）+ 前端（Next.js dev）都能从零启动；首次打开页面发送"你好"，Agent 正常返回文本，无红色错误提示。
result: pass

### 2. Tool Call Inline Indicator
expected: 触发需要工具的请求（如"北京天气"），消息体中出现工具 pill：调用中显示 Loader2 旋转 + 工具名，完成后变为绿色 Check ✓。
result: pass

### 3. HITL Approval Card Display
expected: 触发需要审批的工具（如订酒店/地图搜索），消息流中出现审批卡片：Shield 图标 + 描述摘要 + 三个按钮（批准 / 反馈 / 拒绝）+ 反馈按钮可展开 textarea。
result: pass

### 4. Approve Flow
expected: 点击"批准"按钮后，卡片收起为绿色 pill，工具 pill 从 calling 切到 done ✓，Agent 继续生成后续文本。
result: pass

### 5. Reject Flow (no green check)
expected: 点击"拒绝"按钮后，卡片收起为灰色 rejected pill；对应的工具 pill 显示 X 图标 + 删除线 + 60% 透明度（不会出现绿色 ✓ 误导）；Agent 收到"用户已主动取消"消息后停止或改问。
result: pass

### 6. Feedback Flow
expected: 点击"反馈"展开 textarea，输入反馈文本并提交；卡片收起为 feedback pill；对应工具 pill 显示 rejected 状态（X + 删除线）；Agent 根据反馈内容继续执行（例如根据新条件重试）。
result: pass

### 7. SSE Connection Continuity
expected: approve/reject/feedback 后，SSE 连接不重建（同一 task_id 继续接收事件）；在浏览器 DevTools Network 面板观察 EventSource 请求数量不增加；resume 后 token 持续流入最后一条 assistant 消息。
result: pass
notes: 用户已在 WR-02/WR-06 错误回退场景中验证连接健壮性——停后端触发 resume 失败时 toast+回退正常，重启后发送功能恢复。

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
