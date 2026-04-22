---
status: complete
phase: 12-resilience
source: [12-01-SUMMARY.md, 12-02-SUMMARY.md]
started: "2026-04-22T04:09:00Z"
updated: "2026-04-22T06:50:00Z"
---

## Current Test

[testing complete]

## Tests

### 1. Scenario 1: RESIL-01 主动断网重连
expected: banner 出现/消失时序正确，事件补齐，Last-Event-ID 可见
result: pass
note: "Chrome DevTools Offline 不触发 EventSource onerror；改用 backend Ctrl+C 验证，banner 按预期出现/消失。"

### 2. Scenario 2: G-01 approve-then-switch 不复活
expected: approve 后切会话再切回，不再出现 pending 按钮
result: pass

### 3. Scenario 3: RESIL-02 刷新恢复 HITL
expected: 刷新后 pending HITL 卡片重建且按钮可操作，approve 后恢复执行
result: pass

### 4. Scenario 4: reject 闭环
expected: reject 后 HitlCard 与前置同名 tool pill 均为 rejected，切会话/刷新后稳定
result: pass

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

