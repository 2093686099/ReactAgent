// scene.jsx — Operation video scene for the combined A+B UI
// Timeline drives: typing in composer → send → AI thinks → tool calls →
// HITL approval card → cursor clicks approve → result renders.
// Camera: zooms to composer, pulls back, zooms to HITL, pulls back.

const { Stage, Sprite, useTime, useTimeline, Easing, interpolate, animate, clamp } = window;

// ── Timings (seconds) ─────────────────────────────────────────────────────
const T = {
  // Scene total duration ~ 22s
  openHold:       [0.0, 1.0],
  zoomIn:         [1.0, 2.4],   // camera zooms toward composer
  typing:         [2.4, 5.6],   // types the Chinese query
  sendClick:      [5.6, 6.1],   // cursor clicks send button
  zoomOut:        [6.1, 7.4],   // pull back to show whole UI
  userBubble:     [6.3, 6.3],   // user bubble appears
  aiThinking:     [6.6, 7.6],   // dots
  aiGreeting:     [7.6, 7.6],   // "我来帮你预定..."
  todo1Write:     [8.2, 8.2],   // write_todos tool pill
  todoDrawer1:    [8.4, 8.4],   // task plan 0/3 visible
  toolMap:        [9.0, 10.4],  // 高德地图分析 Agent (calling → done)
  todo2Write:     [10.6, 10.6], // write_todos done
  resText:        [11.0, 11.0], // research result paragraph
  bookHotelCall:  [12.3, 12.3], // 预订酒店 tool pill (calling)
  hitlAppear:     [13.2, 13.2], // HITL card
  zoomToHitl:     [13.4, 14.6], // camera to HITL
  cursorToApprove:[14.6, 15.8], // cursor moves to 批准 btn
  clickApprove:   [15.8, 16.0], // click pulse
  zoomOutFromHitl:[16.0, 17.0],
  hitlApproved:   [16.0, 16.0], // HITL collapses to "已批准"
  bookHotelDone:  [16.6, 16.6], // tool pill → done
  todo3Write:     [17.0, 17.0],
  finalResult:    [17.4, 17.4], // 预定成功!
  todoAllDone:    [17.8, 17.8], // drawer 3/3
  endHold:        [17.8, 22.0],
};

const DURATION = 22;

// ── Cursor ─────────────────────────────────────────────────────────────────
function Cursor({ x, y, clicking = false }) {
  return (
    <div style={{
      position: 'absolute',
      left: x, top: y,
      pointerEvents: 'none',
      zIndex: 100,
      transition: 'none',
      willChange: 'transform',
      filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.5))',
    }}>
      <svg width="22" height="26" viewBox="0 0 22 26" fill="none">
        <path d="M1 1.5L1 20.5L6.5 16.5L10 23L13 21.5L9.5 15L15.5 14.5L1 1.5Z"
          fill="#fff" stroke="#111" strokeWidth="1.2" strokeLinejoin="round"/>
      </svg>
      {clicking && (
        <div style={{
          position: 'absolute',
          left: 8, top: 12,
          width: 28, height: 28,
          marginLeft: -14, marginTop: -14,
          borderRadius: '50%',
          border: '2px solid rgba(113,112,255,0.8)',
          animation: 'ripple 400ms ease-out',
        }} />
      )}
    </div>
  );
}

// ── Reusable tool pill (chip style from variant A) ─────────────────────────
function ToolChip({ kind, label, code, status, agentTag }) {
  const icon = status === 'calling' ? (
    <svg viewBox="0 0 16 16" width="10" height="10" className="spin-ico">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="9 30" strokeLinecap="round"/>
    </svg>
  ) : status === 'done' ? (
    <svg viewBox="0 0 16 16" width="10" height="10"><path d="M3.5 8l3 3 6-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ) : null;

  return (
    <div className={`tool-chip ${status} ${kind || ''}`}>
      <span className="tool-chip-ic">{icon}</span>
      <span className="tool-chip-label">{label}</span>
      {agentTag && <span className="tool-chip-agent">{agentTag}</span>}
      <span className="tool-chip-sep" />
      <span className="tool-chip-code">{code}</span>
    </div>
  );
}

// ── HITL card ─────────────────────────────────────────────────────────────
function HitlCard({ status, hovered, clickPulse }) {
  if (status === 'approved') {
    return (
      <div className="hitl-done-chip">
        <span className="hitl-check-ic">
          <svg width="10" height="10" viewBox="0 0 16 16"><path d="M3.5 8l3 3 6-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </span>
        已批准 · 预订酒店
      </div>
    );
  }

  return (
    <div className="hitl-card">
      <div className="hitl-bar" />
      <div className="hitl-inner">
        <div className="hitl-head">
          <span className="hitl-badge">
            <span className="hitl-dot" />
            需要审批
          </span>
          <span className="hitl-tool">book_hotel</span>
          <span className="hitl-kbd">Y / N / F</span>
        </div>
        <p className="hitl-body">Agent 想要预订酒店：深圳技术大学1034酒店</p>
        <div className="hitl-actions">
          <button className={`hitl-btn primary ${hovered ? 'hover' : ''} ${clickPulse ? 'pulse' : ''}`}>
            <svg width="12" height="12" viewBox="0 0 16 16"><path d="M3.5 8l3 3 6-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
            批准 <span className="kbd-inline">Y</span>
          </button>
          <button className="hitl-btn ghost">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 3h12v8H8l-3 3v-3H2V3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
            反馈 <span className="kbd-inline">F</span>
          </button>
          <button className="hitl-btn danger">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/></svg>
            拒绝 <span className="kbd-inline">N</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── The full UI, driven by time ───────────────────────────────────────────
function FullUI({ time, typedText, showCursorOnSend, cursorClickSend, showHitl, hitlStatus, cursorOnApprove, approveClickPulse, messages, todoState, composerFocused }) {

  return (
    <div className="ov-app">
      {/* SIDEBAR — variant B style */}
      <aside className="ov-sb">
        <div className="ov-sb-header">
          <div className="ov-sb-agent">
            <div className="ov-sb-agent-av">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 1.5L9.8 6.2L14.5 8L9.8 9.8L8 14.5L6.2 9.8L1.5 8L6.2 6.2L8 1.5Z" fill="currentColor"/>
              </svg>
            </div>
            <div className="ov-sb-agent-meta">
              <div className="ov-sb-agent-name">ReAct Agent</div>
              <div className="ov-sb-agent-status"><span className="pulse-green" />在线 · glm-5</div>
            </div>
          </div>
        </div>

        <div className="ov-sb-section">
          <button className="ov-sb-new">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            <span>新建会话</span>
          </button>
          <div className="ov-sb-search">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/><path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            <input placeholder="搜索会话与消息..." disabled />
          </div>
        </div>

        <div className="ov-sb-scroll">
          <div className="ov-sb-group">
            <div className="ov-sb-head"><span>今天</span><span className="ov-sb-head-count">4</span></div>
            <div className="ov-sess active"><span className="ov-sess-rule" /><span>新会话</span></div>
            <div className="ov-sess"><span className="ov-sess-rule" /><span>帮我订深圳福田免税大厦旁边的…</span></div>
            <div className="ov-sess"><span className="ov-sess-rule" /><span>帮我订深圳福田免税大厦旁边的…</span></div>
            <div className="ov-sess"><span className="ov-sess-rule" /><span>预定最近的那家</span></div>
          </div>
        </div>

        <div className="ov-sb-tools">
          <div className="ov-sb-tools-head"><span>🔌 已连接工具</span><span className="ov-sb-tools-count">22</span></div>
          <div className="ov-sb-tools-list">
            <div className="ov-tool-row"><span className="ov-tool-dot warn" /><span>book_hotel</span><span className="ov-tool-tag">需审批</span></div>
            <div className="ov-tool-row"><span className="ov-tool-dot" /><span>multiply</span></div>
            <div className="ov-tool-row"><span className="ov-tool-dot" /><span>query_knowledge_base</span></div>
            <div className="ov-tool-row"><span className="ov-tool-dot" /><span>maps_direction_bicycling</span></div>
            <div className="ov-tool-row"><span className="ov-tool-dot" /><span>maps_direction_driving</span></div>
            <div className="ov-tool-row"><span className="ov-tool-dot" /><span>maps_direction_transit_integra…</span></div>
          </div>
        </div>

        <div className="ov-sb-foot">
          <div className="ov-sb-avatar">W</div>
          <div className="ov-sb-user-meta">
            <div className="ov-sb-name">Wenhua</div>
            <div className="ov-sb-plan">Pro Plan</div>
          </div>
          <button className="ov-sb-icon">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5"/><path d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <section className="ov-main">
        <header className="ov-main-head">
          <div className="ov-main-head-l">
            <span className="ov-main-title">新会话</span>
            <span className="ov-main-meta">{messages.filter(m => m.role).length} 条消息 · 今天 19:34</span>
          </div>
          <div className="ov-main-head-r">
            <button className="ov-head-btn active">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h12M2 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="14" cy="12" r="1" fill="currentColor"/></svg>
            </button>
            <button className="ov-head-btn">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="4" cy="8" r="2" stroke="currentColor" strokeWidth="1.5"/><circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="1.5"/><circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.5"/><path d="M5.8 7L10.2 5M5.8 9L10.2 11" stroke="currentColor" strokeWidth="1.5"/></svg>
            </button>
            <button className="ov-head-btn">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="3" cy="8" r="1" fill="currentColor"/><circle cx="8" cy="8" r="1" fill="currentColor"/><circle cx="13" cy="8" r="1" fill="currentColor"/></svg>
            </button>
          </div>
        </header>

        <div className="ov-messages">
          <div className="ov-messages-inner">
            {messages.length === 0 && (
              <div className="ov-empty">
                <div className="ov-empty-mark">
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M8 1.5L9.8 6.2L14.5 8L9.8 9.8L8 14.5L6.2 9.8L1.5 8L6.2 6.2L8 1.5Z" fill="currentColor"/></svg>
                </div>
                <div className="ov-empty-text">你好，有什么可以帮你的？</div>
              </div>
            )}
            {messages.map((m, i) => m.role === 'user' ? (
              <div key={i} className="ov-u-row">
                <div className="ov-u-bub">{m.text}</div>
              </div>
            ) : (
              <div key={i} className="ov-a-row">
                <div className="ov-a-gutter">
                  <div className="ov-a-avatar">
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M8 1.5L9.8 6.2L14.5 8L9.8 9.8L8 14.5L6.2 9.8L1.5 8L6.2 6.2L8 1.5Z" fill="currentColor"/></svg>
                  </div>
                </div>
                <div className="ov-a-bub">
                  {m.segments.map((s, j) => {
                    if (s.type === 'text') return <p key={j} className="ov-a-p" dangerouslySetInnerHTML={{ __html: s.content }} />;
                    if (s.type === 'tool') return <div key={j} className="ov-tool-wrap"><ToolChip {...s} /></div>;
                    if (s.type === 'hitl') return <HitlCard key={j} status={s.status} hovered={cursorOnApprove} clickPulse={approveClickPulse} />;
                    if (s.type === 'result') return (
                      <div key={j} className="ov-result">
                        <p className="ov-a-p"><span className="ov-result-ok">✅</span> <strong>预定成功!</strong></p>
                        <p className="ov-a-p">已为你预定 <strong>深圳技术大学1034酒店</strong>。</p>
                        <p className="ov-a-p"><strong>酒店信息：</strong></p>
                        <ul className="ov-a-ul">
                          <li><span className="ov-bullet-ic">🏨</span> 酒店名称：深圳技术大学1034酒店</li>
                          <li><span className="ov-bullet-ic">📍</span> 地址：兰田路3002号技术大学国际学术交流中心</li>
                          <li><span className="ov-bullet-ic">📏</span> 距离学校：864米（步行约13分钟）</li>
                          <li><span className="ov-bullet-ic">⭐</span> 评分：4.7分</li>
                          <li><span className="ov-bullet-ic">🎓</span> 位置优势：位于校内国际学术交流中心，距离最近，非常适合学术交流访问</li>
                        </ul>
                        <p className="ov-a-p">如果你需要调整预定或了解其他酒店选项，随时告诉我！</p>
                      </div>
                    );
                    if (s.type === 'research') return (
                      <div key={j} className="ov-research">
                        <p className="ov-a-p">根据调研结果，我为你找到了 <strong>深圳技术大学</strong> 周边的多家酒店。综合考虑距离、评分和便利性，我推荐<strong>深圳技术大学1034酒店</strong>：</p>
                        <ul className="ov-a-ul">
                          <li><span className="ov-bullet-ic">📍</span> 距离学校仅864米（步行约13分钟）</li>
                          <li><span className="ov-bullet-ic">⭐</span> 评分4.7分</li>
                          <li><span className="ov-bullet-ic">🎓</span> 位于校内国际学术交流中心，非常方便</li>
                        </ul>
                        <p className="ov-a-p">现在为你预定这家酒店：</p>
                      </div>
                    );
                    return null;
                  })}
                  {m.streaming && <div className="ov-dots"><span /><span /><span /></div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="ov-composer-wrap">
          <div className={`ov-composer ${composerFocused ? 'focused' : ''}`}>
            <div className="ov-composer-row">
              <button className="ov-comp-btn">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M11 4L5.5 9.5a2.5 2.5 0 003.5 3.5L14 8.5a4 4 0 00-5.5-5.5L3 8.5a5.5 5.5 0 007.5 7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <div className="ov-textarea">
                {typedText ? (
                  <span className="ov-typed-text">{typedText}<span className={`ov-caret ${composerFocused ? 'blink' : ''}`}/></span>
                ) : (
                  <span className="ov-placeholder">回复 Agent，或输入 / 查看命令...{composerFocused && <span className="ov-caret blink" />}</span>
                )}
              </div>
              <button className={`ov-comp-send ${typedText ? 'active' : ''} ${cursorClickSend ? 'pressed' : ''}`}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 13V3M4 7l4-4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
            <div className="ov-composer-foot">
              <div className="ov-comp-chips">
                <span className="ov-comp-chip"><span>🔧</span>工具 · 22</span>
                <span className="ov-comp-chip"><span>🛡</span>HITL 开启</span>
              </div>
              <div className="ov-comp-hint">
                <span className="kbd-mini">Enter</span>发送
                <span className="kbd-mini">⇧ Enter</span>换行
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TASK PLAN DRAWER */}
      <aside className="ov-todo">
        <header className="ov-todo-head">
          <div className="ov-todo-head-l">
            <span className="ov-todo-title">任务计划</span>
            <span className="ov-todo-count">{todoState.done} / {todoState.total}</span>
          </div>
          <button className="ov-head-btn">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/></svg>
          </button>
        </header>
        <div className="ov-todo-progress">
          <div className="ov-todo-progress-bar" style={{ width: `${todoState.total ? (todoState.done/todoState.total)*100 : 0}%` }} />
        </div>
        <div className="ov-todo-list">
          {todoState.items.map((t, i) => (
            <div key={i} className={`ov-todo-item ${t.status}`}>
              <span className="ov-todo-mark">
                {t.status === 'pending' && <span className="ov-todo-circle" />}
                {t.status === 'in_progress' && (
                  <svg viewBox="0 0 16 16" width="14" height="14" className="spin-ico">
                    <circle cx="8" cy="8" r="6.5" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
                    <path d="M 8 1.5 A 6.5 6.5 0 0 1 14.5 8" fill="none" stroke="var(--accent-violet)" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                )}
                {t.status === 'completed' && (
                  <span className="ov-todo-check">
                    <svg width="10" height="10" viewBox="0 0 16 16"><path d="M3.5 8l3 3 6-6" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </span>
                )}
              </span>
              <span className="ov-todo-text">{t.content}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

// ── Chinese character-by-character typing helper ──────────────────────────
const TYPE_TEXT = '帮我订深圳技术大学旁边的酒店';
function typedAt(localT, totalDur = T.typing[1] - T.typing[0]) {
  const chars = TYPE_TEXT.length;
  // Type with slight easing and a small pause at end
  const typedFrac = clamp(localT / (totalDur * 0.88), 0, 1);
  const n = Math.floor(typedFrac * chars);
  return TYPE_TEXT.slice(0, n);
}

// ── Camera transform based on time ────────────────────────────────────────
// Returns {scale, tx, ty} for transform applied to UI wrapper.
function cameraAt(t) {
  // Phases:
  //   0..1           : overview (scale 1)
  //   1..2.4         : zoom in to composer (scale 1.55, focus bottom-center-left)
  //   2.4..5.6       : hold on composer
  //   5.6..6.1       : pull slightly as send pressed
  //   6.1..7.4       : pull back to overview
  //   7.4..13.2      : overview
  //   13.2..14.6     : zoom to HITL (scale 1.5, mid-left)
  //   14.6..16.0     : hold
  //   16.0..17.0     : zoom out
  //   17.0..         : overview

  // Artboard (UI canvas) is 1440x900, composer sits bottom area around y=790
  // HITL will be around y=430 when present

  // Default
  let scale = 1, tx = 0, ty = 0;

  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = Easing.easeInOutCubic;

  if (t < 1.0) {
    scale = 1; tx = 0; ty = 0;
  } else if (t < 2.4) {
    const p = ease((t - 1.0) / 1.4);
    scale = lerp(1, 1.5, p);
    tx = lerp(0, -80, p);
    ty = lerp(0, -260, p);
  } else if (t < 5.6) {
    scale = 1.5; tx = -80; ty = -260;
  } else if (t < 6.1) {
    const p = ease((t - 5.6) / 0.5);
    scale = lerp(1.5, 1.45, p);
    tx = lerp(-80, -60, p);
    ty = lerp(-260, -230, p);
  } else if (t < 7.4) {
    const p = ease((t - 6.1) / 1.3);
    scale = lerp(1.45, 1, p);
    tx = lerp(-60, 0, p);
    ty = lerp(-230, 0, p);
  } else if (t < 13.2) {
    scale = 1; tx = 0; ty = 0;
  } else if (t < 14.6) {
    const p = ease((t - 13.2) / 1.4);
    scale = lerp(1, 1.45, p);
    // HITL card sits mid-left area
    tx = lerp(0, -60, p);
    ty = lerp(0, -120, p);
  } else if (t < 16.0) {
    scale = 1.45; tx = -60; ty = -120;
  } else if (t < 17.0) {
    const p = ease((t - 16.0) / 1.0);
    scale = lerp(1.45, 1, p);
    tx = lerp(-60, 0, p);
    ty = lerp(-120, 0, p);
  } else {
    scale = 1; tx = 0; ty = 0;
  }

  return { scale, tx, ty };
}

// ── Cursor positioning ────────────────────────────────────────────────────
// Canvas coords (pre-camera). UI is 1440x900.
// Composer send button approx (1020, 790). HITL approve button approx (540, 470).
// Start off-canvas bottom-right before first interaction.
function cursorAt(t) {
  // phases:
  // hidden until ~5.0, then slide to send
  // after send, hide until 14.0, then slide to approve, click, exit
  if (t < 4.8) {
    return { x: null, y: null, clicking: false };
  } else if (t < 5.6) {
    // slide from (1200, 850) → (1020, 790)
    const p = Easing.easeOutCubic(clamp((t - 4.8) / 0.8, 0, 1));
    return { x: 1200 + (1020 - 1200) * p, y: 850 + (790 - 850) * p, clicking: false };
  } else if (t < 6.1) {
    // click on send
    return { x: 1020, y: 790, clicking: t > 5.65 && t < 5.95 };
  } else if (t < 6.6) {
    // move off
    const p = Easing.easeInCubic(clamp((t - 6.1) / 0.5, 0, 1));
    return { x: 1020 + (1400 - 1020) * p, y: 790 + (960 - 790) * p, clicking: false };
  } else if (t < 14.0) {
    return { x: null, y: null, clicking: false };
  } else if (t < 15.8) {
    // slide from (800, 800) → HITL approve (470, 490)
    const p = Easing.easeOutCubic(clamp((t - 14.0) / 1.8, 0, 1));
    const sx = 860, sy = 780, ex = 470, ey = 490;
    return { x: sx + (ex - sx) * p, y: sy + (ey - sy) * p, clicking: false };
  } else if (t < 16.1) {
    return { x: 470, y: 490, clicking: t > 15.8 && t < 16.05 };
  } else if (t < 16.8) {
    const p = Easing.easeInCubic(clamp((t - 16.1) / 0.7, 0, 1));
    return { x: 470 + (1400 - 470) * p, y: 490 + (960 - 490) * p, clicking: false };
  } else {
    return { x: null, y: null, clicking: false };
  }
}

// ── State derivation from time ────────────────────────────────────────────
function stateAt(t) {
  const typedText = t >= T.typing[0] && t < T.sendClick[1]
    ? typedAt(t - T.typing[0])
    : (t >= T.sendClick[1] ? '' : '');

  const composerFocused = t >= 1.8 && t < 6.3;

  const messages = [];

  // User message appears at sendClick
  if (t >= 6.3) {
    messages.push({ role: 'user', text: '帮我预定深圳技术大学旁边的酒店' });
  }

  // Assistant message
  if (t >= 6.3) {
    const asst = { role: 'assistant', segments: [], streaming: false };

    // Thinking dots
    if (t < 7.6) {
      asst.streaming = true;
    } else {
      asst.segments.push({ type: 'text', content: '我来帮你预定深圳技术大学旁边的酒店。先规划一下任务：' });
    }

    // write_todos (first)
    if (t >= 8.2) {
      asst.segments.push({ type: 'tool', code: 'write_todos', label: 'write_todos', status: 'done' });
    }

    // 高德地图分析 Agent
    if (t >= 9.0) {
      const status = t < 10.4 ? 'calling' : 'done';
      asst.segments.push({ type: 'tool', code: 'researcher', label: '高德地图分析 Agent', status, agentTag: 'researcher' });
    }

    // write_todos (second)
    if (t >= 10.6) {
      asst.segments.push({ type: 'tool', code: 'write_todos', label: 'write_todos', status: 'done' });
    }

    // Research text
    if (t >= 11.0) {
      asst.segments.push({ type: 'research' });
    }

    // book_hotel tool pill
    if (t >= 12.3) {
      const status = t < 16.6 ? (t < 16.0 ? 'calling' : 'calling') : 'done';
      if (t < 13.2) {
        // still calling, shown
        asst.segments.push({ type: 'tool', code: 'book_hotel', label: '预订酒店', status: 'calling' });
      } else if (t < 16.0) {
        // pending HITL — show as calling
        asst.segments.push({ type: 'tool', code: 'book_hotel', label: '预订酒店', status: 'calling' });
      } else if (t < 16.6) {
        asst.segments.push({ type: 'tool', code: 'book_hotel', label: '预订酒店', status: 'calling' });
      } else {
        asst.segments.push({ type: 'tool', code: 'book_hotel', label: '预订酒店', status: 'done' });
      }
    }

    // HITL card
    if (t >= 13.2 && t < 16.0) {
      asst.segments.push({ type: 'hitl', status: 'pending' });
    } else if (t >= 16.0) {
      asst.segments.push({ type: 'hitl', status: 'approved' });
    }

    // After approval: new write_todos then result
    if (t >= 17.0) {
      asst.segments.push({ type: 'tool', code: 'write_todos', label: 'write_todos', status: 'done' });
    }
    if (t >= 17.4) {
      asst.segments.push({ type: 'result' });
    }

    messages.push(asst);
  }

  // Todo state
  let todoState = {
    total: 3,
    done: 0,
    items: [
      { content: '调研深圳技术大学位置及周边酒店信息', status: 'pending' },
      { content: '根据调研结果选择合适的酒店', status: 'pending' },
      { content: '预定选定的酒店', status: 'pending' },
    ],
  };

  if (t >= 8.4 && t < 10.6) {
    todoState.items[0].status = 'in_progress';
  } else if (t >= 10.6 && t < 11.0) {
    todoState.items[0].status = 'completed';
    todoState.items[1].status = 'in_progress';
    todoState.done = 1;
  } else if (t >= 11.0 && t < 17.0) {
    todoState.items[0].status = 'completed';
    todoState.items[1].status = 'completed';
    todoState.items[2].status = 'in_progress';
    todoState.done = 2;
  } else if (t >= 17.0) {
    todoState.items[0].status = 'completed';
    todoState.items[1].status = 'completed';
    todoState.items[2].status = 'completed';
    todoState.done = 3;
  }

  const showHitl = t >= T.hitlAppear[0] && t < T.hitlApproved[0];
  const hitlStatus = t >= T.hitlApproved[0] ? 'approved' : 'pending';

  // Cursor-on-approve hover starts slightly before click
  const cursorOnApprove = t >= 15.4 && t < 16.0;
  const approveClickPulse = t >= 15.8 && t < 16.0;

  const cursorClickSend = t >= 5.65 && t < 5.95;

  return {
    typedText, composerFocused, messages, todoState,
    showHitl, hitlStatus, cursorOnApprove, approveClickPulse, cursorClickSend,
  };
}

// ── Auto-scroll: keep the latest content in view as the camera pulls back ─
// We position messages with flexbox; in the narrow chat column we use a fixed
// bottom-aligned layout by using flex-direction: column-reverse visually via
// margin-top: auto on inner wrapper.

// ── Top-level scene ───────────────────────────────────────────────────────
function Scene() {
  const time = useTime();
  const cam = cameraAt(time);
  const cur = cursorAt(time);
  const st = stateAt(time);

  // Scroll container ref: auto-scroll to bottom when messages grow
  const msgRef = React.useRef(null);
  React.useEffect(() => {
    const el = document.querySelector('.ov-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }, [time]);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'var(--bg-deepest, #08090a)',
      overflow: 'hidden',
    }}>
      {/* UI wrapper — receives camera transform */}
      <div style={{
        position: 'absolute', inset: 0,
        transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.scale})`,
        transformOrigin: 'center center',
        transition: 'none',
        willChange: 'transform',
      }}>
        <FullUI {...st} />
      </div>

      {/* Cursor — sits on top, uses same coordinate space */}
      {cur.x != null && (
        <div style={{
          position: 'absolute', inset: 0,
          transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.scale})`,
          transformOrigin: 'center center',
          pointerEvents: 'none',
        }}>
          <Cursor x={cur.x} y={cur.y} clicking={cur.clicking} />
        </div>
      )}

      {/* Subtle vignette */}
      <div style={{
        position: 'absolute', inset: 0,
        pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.35) 100%)',
      }} />
    </div>
  );
}

function VideoRoot() {
  return (
    <Stage width={1440} height={900} duration={DURATION} background="#08090a" persistKey="reactagent-video">
      <Scene />
    </Stage>
  );
}

window.VideoRoot = VideoRoot;
