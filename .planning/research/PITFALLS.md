# Pitfalls Research

**Domain:** Next.js chat frontend integrating with existing FastAPI AI agent backend (SSE, HITL, session management)
**Researched:** 2026-04-12
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: SSE Proxy Buffering — Token 流看不见或成批到达

**What goes wrong:**
部署后（或通过 Next.js rewrite 代理时），SSE token 事件不再逐个到达，而是积攒几秒后一次性涌出。用户看到的不是流式打字效果，而是文字突然跳出一大段。开发模式直连 FastAPI 一切正常，加了 nginx/Vercel/Next.js proxy 后症状出现。

**Why it happens:**
三层缓冲叠加：(1) nginx 默认开启 `proxy_buffering on`，把整个响应缓冲到内存再转发；(2) Next.js rewrite/Route Handler 可能经过 Node 中间层，Node HTTP 默认带 gzip 压缩，压缩器会攒够数据再 flush；(3) 某些 CDN/Edge 节点也会缓冲。后端已正确设置 `X-Accel-Buffering: no`（见 `backend/app/api/chat.py` 第 115 行），但如果前端代理层重新包装响应，这个 header 会丢失。

**How to avoid:**
1. **直连方案（推荐）**：Next.js 前端直接 fetch `http://localhost:8001/api/chat/stream/{task_id}`，不走 Next.js rewrite。跨域由 FastAPI CORS 处理（已配置 `localhost:3000`）。
2. **如果必须代理**：在 `next.config.js` rewrites 中配置 SSE 端点转发，并确认 Next.js 不对该路径做压缩。在 nginx 中对 SSE 路径专门配置：
   ```nginx
   location /api/chat/stream/ {
       proxy_buffering off;
       proxy_http_version 1.1;
       chunked_transfer_encoding on;
       proxy_set_header Connection '';
   }
   ```
3. **验证 header 传递**：用 `curl -N` 直接请求 SSE 端点，确认 `X-Accel-Buffering: no` 和 `Cache-Control: no-cache` 到达客户端。

**Warning signs:**
- 开发模式流畅，部署后卡顿
- Chrome DevTools Network 面板中 SSE 事件时间戳不均匀（几秒空白后突然一批）
- `curl -N http://backend:8001/api/chat/stream/{task_id}` 正常但通过前端代理不正常

**Phase to address:**
Phase 1（基础 SSE 连接）— 第一个能跑通的端到端流必须验证无缓冲问题

---

### Pitfall 2: EventSource 的局限性 — 无法发送自定义 Header 和 POST

**What goes wrong:**
开发者用浏览器原生 `EventSource` API 连接 SSE 端点，发现无法传 Authorization header（未来认证需要），且 EventSource 只支持 GET。当需要认证或更复杂的请求时，必须重写整个 SSE 客户端。

**Why it happens:**
`EventSource` API 设计于 2010 年代早期，只支持 GET 请求，不允许自定义 request header。`withCredentials` 只能控制是否发送 cookie，不能加 Bearer token。这个限制在开发阶段（无认证）不会暴露，但加认证后立即变成 blocker。

**How to avoid:**
从一开始就用 `fetch` + `ReadableStream` 而不是 `EventSource`。具体模式：
```typescript
const response = await fetch(`/api/chat/stream/${taskId}`, {
  headers: { /* 未来放 Authorization */ },
});
const reader = response.body!.getReader();
const decoder = new TextDecoder();
// 手动解析 SSE 格式 event: xxx\ndata: xxx\n\n
```
或者使用 `@microsoft/fetch-event-source` 库，它基于 fetch 实现了完整的 SSE 协议（包括自动重连和 Last-Event-ID），同时支持 POST 和自定义 header。

**当前后端兼容性**：`GET /api/chat/stream/{task_id}` 是纯 GET 端点，两种方案都能用。选择 fetch 方案没有后端适配成本。

**Warning signs:**
- 使用了 `new EventSource(url)`
- 讨论"以后加认证怎么办"但当前代码用 EventSource
- 需要在 URL query string 里传 token（安全隐患，token 出现在 server log 和浏览器历史）

**Phase to address:**
Phase 1（基础 SSE 连接）— 第一天就选对 SSE 客户端方案

---

### Pitfall 3: Token 流式渲染触发 React 渲染风暴

**What goes wrong:**
每个 SSE `token` 事件（每个字/词一次）触发一次 `setState`，导致 React 每秒重新渲染 30-100 次。长消息时 UI 卡顿、滚动不流畅、CPU 飙升。在低端设备上尤为明显。

**Why it happens:**
LLM token 到达频率远高于屏幕刷新率（60fps = 16.7ms/帧）。如果每个 token 都 `setMessages(prev => [...prev])`，React 的 reconciliation 在每帧内运行多次，但只有最后一次对用户可见。

**How to avoid:**
采用 **Buffer + RAF Batch** 模式（ChatGPT 的实际做法）：
1. token 到达时写入 `useRef` 缓冲区（不触发渲染）
2. `requestAnimationFrame` 循环每帧读一次缓冲区，合并到 state（每帧最多一次 setState）
3. 只更新当前正在流式输出的消息，不重建整个消息列表

```typescript
const bufferRef = useRef<string>('');
const rafRef = useRef<number>(0);

// SSE 回调 — 写 ref，不 setState
onToken(text: string) {
  bufferRef.current += text;
  if (!rafRef.current) {
    rafRef.current = requestAnimationFrame(flush);
  }
}

function flush() {
  rafRef.current = 0;
  setStreamingText(prev => prev + bufferRef.current);
  bufferRef.current = '';
}
```

额外优化：
- 消息列表用 `React.memo` + 浅比较避免已完成消息重渲染
- 超长对话用 `@tanstack/react-virtual` 虚拟化滚动
- 流式消息和历史消息分开管理（流式消息是 mutable ref，完成后才放入 state 数组）

**Warning signs:**
- React DevTools Profiler 显示 MessageList 组件每秒渲染 50+ 次
- 流式输出时 CPU 占用 > 30%
- 输入框在流式输出时有输入延迟

**Phase to address:**
Phase 1（基础聊天 UI）— 但可以分两步：先用简单 setState 验证流程，再优化渲染

---

### Pitfall 4: SSE 重连后事件丢失或重复

**What goes wrong:**
网络闪断后 SSE 连接断开。重连后（1）丢失断开期间的事件，导致消息不完整；或（2）从头重放所有事件，导致消息重复显示。

**Why it happens:**
后端用 Redis Stream 存储事件，支持 `from_id` 断点续传（`backend/app/api/chat.py` 第 93 行）。但前端如果不记录 `Last-Event-ID`（SSE 的 `id` 字段），重连时会从头读（`from_id=0`），导致所有事件重放。反之如果用 `EventSource` 的自动重连，浏览器会自动发送 `Last-Event-ID` header，但这依赖后端 SSE 格式中包含 `id:` 行（后端已正确实现，见 `_format_sse` 函数第 24 行）。

**How to avoid:**
1. 前端维护 `lastEventId` 状态，每收到一条 SSE 事件就更新
2. 重连时将 `lastEventId` 作为 `from_id` query 参数传给 `GET /api/chat/stream/{task_id}?from_id={lastEventId}`
3. 前端做幂等处理 — 以 `entry_id` 为 key 去重（防止极端情况下的重复）
4. 处理 task 已终结的边缘情况 — 重连时先检查 task meta 状态，如果已完成/出错，直接展示最终结果而不是重新订阅

**关键边缘情况**：Redis Stream 有 TTL（`task_ttl=3600s`），如果断线超过 TTL，事件流过期，重连拿不到任何数据。前端需要处理 404 响应（task 不存在）并提示用户。

**Warning signs:**
- 切换 Wi-Fi 后消息显示两遍
- 长时间后台后回到页面，消息列表为空
- 没有 `from_id` 参数的 SSE 请求

**Phase to address:**
Phase 1（SSE 连接）— 重连逻辑是 SSE 客户端的核心组成部分

---

### Pitfall 5: HITL 中断态的 UI 状态不一致

**What goes wrong:**
Agent 发出 HITL 中断事件后，前端需要展示审批卡片（approve/edit/reject）。但多种边缘情况导致 UI 状态混乱：(1) 用户在审批卡片弹出前刷新页面，HITL 状态丢失；(2) 用户点了 approve 后网络中断，resume 请求失败，但审批卡片已消失；(3) 同一 task 收到多个 interrupt（多工具调用），前端只展示了第一个。

**Why it happens:**
HITL 是有状态的交互流程，但典型的 React SPA 把状态放在内存里（useState），刷新即丢失。后端 task 状态在 Redis（`status=interrupted`），但前端不一定和后端同步。`build_decisions` 函数支持多工具审批（`action_requests` 列表，见 `backend/app/core/hitl.py` 第 22 行），但前端如果只渲染单个审批卡片就会遗漏。

**How to avoid:**
1. **状态恢复**：页面加载时检查是否有未完成的 interrupted task（查 task meta），如果有则恢复审批 UI。将 `hitl` 事件数据持久化到 `sessionStorage` 或 URL state。
2. **乐观更新 + 回滚**：点击 approve 后立即禁用按钮+显示 loading，但保留审批卡片直到 resume API 返回成功。失败时恢复按钮可用状态并显示错误。
3. **多工具审批**：`hitl` 事件的 `action_requests` 可能包含多个工具调用（`count = len(action_requests)`），前端必须渲染所有待审批项，不能只渲染第一个。
4. **resume 后的 SSE 续接**：approve 后需要继续监听同一 `task_id` 的事件流（`from_id` 从中断点继续），而不是开一个新连接。

**Warning signs:**
- 刷新页面后审批卡片消失，但 agent 仍在等待
- 多工具调用只显示一个审批项
- approve 后没有续接流式输出
- approve 按钮可以点击多次（重复发送 resume 请求）

**Phase to address:**
Phase 2（HITL 审批 UI）— 这是 HITL 功能的核心复杂度

---

### Pitfall 6: CORS 配置在生产中失效

**What goes wrong:**
开发环境 `localhost:3000` → `localhost:8001` 正常，部署到实际域名后 CORS 报错。或者 SSE 连接时 CORS 正常但 credential（cookie）传不过去。

**Why it happens:**
后端 CORS 配置硬编码为 `allow_origins=["http://localhost:3000"]`（见 `backend/app/main.py` 第 52 行）。部署后前端域名变了，但忘记更新后端 CORS 配置。另外 `allow_credentials=True` 和 `allow_origins=["*"]` 不能同时使用 — 这是 W3C 规范限制，如果有人图省事改成通配符会直接报错。

**How to avoid:**
1. 将 `CORS_ORIGINS` 提取为环境变量：`allow_origins=settings.cors_origins.split(",")`
2. 永远不要用 `allow_origins=["*"]` + `allow_credentials=True`
3. SSE 端点如果用 fetch（推荐，见 Pitfall 2），需要在 fetch 中明确设置 `credentials: 'include'`（如果需要 cookie）或用 header-based auth（更简单，不需要 credentials）
4. 本地开发可以用 Next.js rewrite 绕过 CORS（但要注意 Pitfall 1 的缓冲问题）

**Warning signs:**
- CORS origin 是硬编码字符串而非环境变量
- 部署脚本没有检查 CORS 配置
- SSE 连接在部署后静默失败（浏览器 console 有 CORS 错误但容易被忽略）

**Phase to address:**
Phase 1（项目骨架）— 搭建时就把 CORS origin 参数化

---

### Pitfall 7: SSE 连接泄漏 — 切换会话或离开页面未关闭

**What goes wrong:**
用户切换到另一个会话或离开聊天页面，但旧的 SSE 连接仍然打开。积累多个 SSE 连接导致：(1) 浏览器达到 HTTP/1.1 每域名 6 连接上限，新请求被阻塞；(2) 后端 `read_events` 的 `while True` 循环持续 xread Redis（见 `backend/app/infra/task_bus.py` 第 99 行），浪费资源；(3) CONCERNS.md 已标记后端"SSE Stream Does Not Handle Client Disconnect"（第 116 行）。

**Why it happens:**
`fetch` + `ReadableStream` 不像 `EventSource` 有 `.close()` 方法，需要手动调用 `reader.cancel()` 或 `AbortController.abort()`。React 组件卸载时如果忘记清理，连接就泄漏了。后端的 `StreamingResponse` 在客户端断开时会抛 `CancelledError`，但 `read_events` 生成器的 `xread(block=5000)` 可能不会被干净中断。

**How to avoid:**
前端：
```typescript
useEffect(() => {
  const controller = new AbortController();
  startSSE(taskId, controller.signal);
  return () => controller.abort(); // 组件卸载或 taskId 变化时中止
}, [taskId]);
```
后端（需修复，CONCERNS.md 已标记）：
- 在 `event_stream` 生成器中添加 `try/finally` 清理
- 考虑给 SSE 添加心跳（每 15-30 秒发一个 `: keep-alive\n\n` 注释行），既保活连接也能让前端检测死连接

**Warning signs:**
- Chrome DevTools Network 面板中有多个 pending SSE 请求
- 后端日志持续打印已结束 task 的 xread 超时
- 切换会话后新请求响应变慢（连接数耗尽）

**Phase to address:**
Phase 1（SSE 连接管理）— AbortController 是 SSE 客户端的必备组件

---

### Pitfall 8: SSE 文本解析 — 多字节 UTF-8 字符被截断

**What goes wrong:**
使用 `fetch` + `ReadableStream` 手动解析 SSE 时，中文字符（3 字节 UTF-8）被 TCP 分包切断，解码出现乱码 `U+FFFD`（替换字符 `�`）。

**Why it happens:**
`ReadableStream` 的 chunk 边界由 TCP 包决定，不保证在 UTF-8 字符边界上。如果用 `new TextDecoder().decode(chunk)` 逐 chunk 解码，一个跨 chunk 的中文字符会被截成两半，前半解码失败变成 `�`。本项目全中文对话，几乎必然触发。

**How to avoid:**
使用 `TextDecoder` 的流模式 — 传入 `{ stream: true }` 参数：
```typescript
const decoder = new TextDecoder();
// 每个 chunk：
const text = decoder.decode(chunk, { stream: true });
// 最后一个 chunk：
const remaining = decoder.decode(); // flush 缓冲区
```
或者直接用 `response.body.pipeThrough(new TextDecoderStream())` 管道，它内部自动处理流式解码。

**Warning signs:**
- 中文消息偶尔出现 `�` 字符
- 英文消息正常（ASCII 是单字节，不受影响）
- 问题时有时无（取决于网络条件和 chunk 大小）

**Phase to address:**
Phase 1（SSE 解析器）— 这是 SSE 解析实现的基础要求

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| 每个 token setState（不做 RAF batch） | 代码简单，5 行搞定 | 长消息卡顿，重写渲染逻辑 | MVP 验证阶段可接受，但 Phase 1 结束前必须优化 |
| 用 EventSource 而非 fetch | 自动重连、协议解析都自带 | 加认证时必须整体重写 SSE 客户端 | Never — 重写成本远高于一开始用 fetch |
| HITL 状态只放 React state | 不需要持久化，代码简单 | 刷新丢状态，用户体验差 | MVP 可接受，Phase 2 必须修 |
| SSE 端点走 Next.js Route Handler 代理 | 前端只需访问一个域名 | 多一层缓冲风险，调试困难 | 有 nginx 反代时 never；开发阶段可用但需验证 |
| 消息列表不做虚拟滚动 | 减少依赖，实现简单 | 50+ 条消息后滚动卡顿 | 个人助手场景对话不会太长，可以延迟到 v2.1 |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| FastAPI SSE → Next.js | 把 SSE stream URL 写成相对路径，经过 Next.js 服务端导致 Node 进程缓冲 | SSE URL 用绝对路径直连后端，或确认 rewrite 不缓冲 |
| Redis Stream → SSE 格式 | 假设 SSE `id:` 字段是递增整数，实际是 Redis Stream 的 `1234567890-0` 格式 | 原样传递 Redis entry_id 作为 SSE id，前端不要解析它 |
| HITL resume → SSE 续接 | resume 后开一个新 SSE 连接从头读 | resume 后用同一 task_id 连接，`from_id` 传上次最后的 event id |
| Task 生命周期 → 前端状态 | 只靠 SSE 事件判断 task 状态，忽略 SSE 连接本身可能断开 | SSE 断开时主动查询 `task_bus.get_task_meta` 做状态兜底 |
| Session TTL → 前端会话列表 | 从后端获取会话列表后缓存不更新 | 每次显示列表时刷新，或至少设一个合理的 revalidation 间隔 |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| 每 token 触发完整消息列表重渲染 | Profiler 显示 MessageList 每秒 50+ 次渲染 | 流式消息与历史消息分开管理；历史消息用 React.memo | 消息超过 10 条 + 快速流式输出 |
| SSE 连接不关闭 | 浏览器 HTTP 连接池耗尽，新请求 pending | useEffect cleanup + AbortController | 切换 3-6 个会话（HTTP/1.1 限制 6 连接）|
| 消息列表 DOM 节点过多 | 滚动卡顿，内存持续增长 | @tanstack/react-virtual 虚拟滚动 | 单会话 50+ 条消息（含工具调用段落）|
| JSON.parse 每个 SSE data 字段 | 高频 token 事件下 parse 开销累积 | token 事件的 data 只有 `{"text":"X"}`，可以用简单字符串截取代替 JSON.parse | token 频率 > 50/秒 |
| 自动滚动到底部用 scrollIntoView | 每个 token 触发一次 layout reflow | 用 `scrollTop = scrollHeight` 并在 RAF 中合并 | 流式输出时 |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| SSE URL 中通过 query string 传 token | Token 出现在 server access log、浏览器历史、Referer header | 用 fetch + header 传 token（见 Pitfall 2） |
| CORS origin 设为 `*` + credentials | 浏览器直接拒绝请求；即使去掉 credentials 也允许任意站点调用 API | 指定具体 origin，从环境变量读取 |
| 前端未过滤 agent 输出中的 HTML/JS | XSS — agent 可能在回复中输出 `<script>` | 用 markdown 渲染库（如 react-markdown）并配置不渲染原始 HTML |
| HITL 的 edit 模式允许用户任意修改工具参数 | 用户可以注入恶意参数到工具调用 | 后端对 edit 后的参数做 schema 验证（backend 已有此逻辑，但前端也应做基本校验） |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| 流式输出时无法取消 | 用户看到 agent 跑偏了但只能干等 | 添加"停止生成"按钮，调用后端 task cancel |
| HITL 审批弹窗阻塞整个界面 | 用户无法查看对话上下文来做决策 | 审批卡片内嵌在消息流中，不用模态框 |
| 工具调用只显示名称，不显示参数 | 用户不知道 approve 的具体是什么操作 | 展示工具名+关键参数摘要，edit 时可展开完整参数 |
| 流式输出时光标/加载态消失 | 用户不知道 agent 还在工作 | 保持 typing indicator 直到收到 done/error 事件 |
| 切换会话后回来，上次对话位置丢失 | 用户需要手动翻找 | 记住每个会话的 scroll position |
| 错误消息直接显示 Python traceback | 用户看不懂，体验差 | 前端捕获 `error` 事件，展示友好错误消息 |

## "Looks Done But Isn't" Checklist

- [ ] **SSE 流式输出**：测试了中文长文本（多字节 UTF-8 分包）吗？测试了网络断开重连吗？
- [ ] **HITL 审批**：刷新页面后能恢复中断态吗？多工具调用能全部展示吗？approve 失败能回滚吗？
- [ ] **会话切换**：旧 SSE 连接关闭了吗？新会话的历史消息正确加载了吗？
- [ ] **消息渲染**：agent 输出中的 markdown 格式正确渲染了吗？代码块有语法高亮吗？
- [ ] **错误处理**：agent 执行失败时前端展示友好消息了吗？SSE 连接断开时有重试逻辑吗？
- [ ] **Task TTL 过期**：Redis 中 task 过期后，前端访问该 task 的 SSE 端点返回 404，前端处理了吗？
- [ ] **空状态**：新用户首次打开，没有任何会话时，UI 正确引导了吗？
- [ ] **resume 后续接**：approve 后的新 token 出现在同一条消息气泡中了吗？还是错误地创建了新消息？

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| EventSource 重写为 fetch | MEDIUM | 替换 SSE 客户端层，核心解析逻辑不变。约 1-2 天工作量 |
| 渲染风暴（未做 RAF batch） | LOW | 加一个 buffer+flush 层，不影响上层组件。约半天 |
| SSE 代理缓冲 | LOW | 改为直连或调整 nginx/rewrite 配置。约 1-2 小时 |
| HITL 状态丢失 | MEDIUM | 添加 sessionStorage 持久化 + 页面加载时 task 状态检查。约 1 天 |
| CORS 配置错误 | LOW | 改环境变量，重启后端。约 10 分钟 |
| UTF-8 截断 | LOW | 加 `{ stream: true }` 参数或改用 TextDecoderStream。约 30 分钟 |
| SSE 连接泄漏 | MEDIUM | 全局审计所有 SSE 调用点，添加 AbortController。约半天 |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| SSE 代理缓冲 | Phase 1: 基础 SSE | curl 直连和通过代理都能逐 token 收到事件 |
| EventSource 局限 | Phase 1: SSE 客户端 | SSE 客户端用 fetch 实现，能传自定义 header |
| Token 渲染风暴 | Phase 1: 流式渲染 | React Profiler 显示流式输出时 < 60 renders/sec |
| SSE 重连丢失/重复 | Phase 1: SSE 客户端 | 断网 5 秒后重连，消息无丢失无重复 |
| HITL 状态不一致 | Phase 2: HITL UI | 刷新页面后审批卡片能恢复；多工具全展示 |
| CORS 配置 | Phase 1: 项目骨架 | `CORS_ORIGINS` 从环境变量读取 |
| SSE 连接泄漏 | Phase 1: SSE 连接管理 | 切换 10 个会话后 Network 面板只有 1 个活跃 SSE |
| UTF-8 截断 | Phase 1: SSE 解析 | 流式输出 1000 字中文无乱码 |

## Sources

- [Next.js SSE Discussion #48427](https://github.com/vercel/next.js/discussions/48427) — Next.js API route 中 SSE 的压缩和缓冲问题
- [Streaming APIs with FastAPI and Next.js](https://sahansera.dev/streaming-apis-python-nextjs-part1/) — FastAPI + Next.js 流式 API 端到端实现
- [Fixing Slow SSE Streaming in Next.js](https://medium.com/@oyetoketoby80/fixing-slow-sse-server-sent-events-streaming-in-next-js-and-vercel-99f42fbdb996) — Next.js/Vercel SSE 性能问题修复
- [Streaming Backends & React: Controlling Re-render Chaos](https://www.sitepoint.com/streaming-backends-react-controlling-re-render-chaos/) — 高频数据流下 React 渲染优化的 Buffer+RAF 模式
- [Why React Apps Lag With Streaming Text](https://akashbuilds.com/blog/chatgpt-stream-text-react) — ChatGPT 流式文本渲染的 buffer batch 技术
- [@microsoft/fetch-event-source](https://github.com/Azure/fetch-event-source) — 基于 fetch 的 SSE 客户端，支持 POST 和自定义 header
- [EventSource: withCredentials — MDN](https://developer.mozilla.org/en-US/docs/Web/API/EventSource/withCredentials) — EventSource 跨域 credentials 限制
- [Using server-sent events — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) — SSE 规范、Last-Event-ID 重连机制
- [Nginx proxy module — proxy_buffering](https://nginx.org/en/docs/http/ngx_http_proxy_module.html) — nginx 代理缓冲配置
- [Next.js AI SDK HITL Cookbook](https://ai-sdk.dev/cookbook/next/human-in-the-loop) — Next.js HITL 审批流程参考实现
- [CORS — FastAPI](https://fastapi.tiangolo.com/tutorial/cors/) — FastAPI CORS 中间件配置
- [next.config.js rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites) — Next.js URL rewrite 代理配置
- [`backend/app/api/chat.py`](backend/app/api/chat.py) — 本项目 SSE 端点实现（`_format_sse`、`X-Accel-Buffering`、`from_id` 支持）
- [`backend/app/infra/task_bus.py`](backend/app/infra/task_bus.py) — Redis Stream 事件总线（`read_events` 的 xread 循环和终结检测）
- [`.planning/codebase/CONCERNS.md`](.planning/codebase/CONCERNS.md) — 已知问题：SSE 不处理客户端断连、Task-Session 无关联、认证缺失

---
*Pitfalls research for: Next.js chat frontend + FastAPI AI agent backend integration*
*Researched: 2026-04-12*
