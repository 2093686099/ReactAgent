// Variant A — "Refined Linear"
// Approach: Keep current structure; fix scrollbar, tighten breathing room,
// warmer HITL with amber warning + pulse, subtle type improvements.

const A_SAMPLE_SESSIONS = [
  { id: 's1', title: '上海天气查询', group: '今天' },
  { id: 's2', title: '预订出差酒店', group: '今天', active: true },
  { id: 's3', title: '规划周末路线', group: '本周' },
  { id: 's4', title: '整理季度报告', group: '本周' },
  { id: 's5', title: 'API 文档排错', group: '更早' },
];

function A_Icon({ name, size = 16 }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (window.lucide && ref.current) {
      window.lucide.createIcons({ nameAttr: 'data-lucide', icons: window.lucide.icons });
    }
  });
  return <i ref={ref} data-lucide={name} style={{ width: size, height: size, display: 'inline-flex', flex: 'none' }} />;
}

function A_Sidebar({ sessions, activeId, onNew, onSelect }) {
  const groups = {};
  sessions.forEach(s => { (groups[s.group] ||= []).push(s); });
  const order = ['今天', '本周', '更早'];

  return (
    <aside className="a-sb">
      <div className="a-sb-top">
        <div className="a-sb-logo">
          <div className="a-sb-mark"><A_Icon name="sparkles" size={12} /></div>
          <span>ReAct Agent</span>
        </div>
        <button className="a-sb-icon-btn" title="设置"><A_Icon name="settings-2" size={14} /></button>
      </div>

      <button className="a-sb-new" onClick={onNew}>
        <A_Icon name="plus" size={14} />
        <span>新建会话</span>
        <span className="a-kbd">⌘K</span>
      </button>

      <div className="a-sb-search">
        <A_Icon name="search" size={13} />
        <input placeholder="搜索..." />
      </div>

      <div className="a-sb-scroll">
        {order.map(g => groups[g] && (
          <div key={g} className="a-sb-group">
            <div className="a-sb-head">{g}</div>
            {groups[g].map(s => (
              <div
                key={s.id}
                className={`a-sess ${s.id === activeId ? 'active' : ''}`}
                onClick={() => onSelect(s.id)}
              >
                <span className="a-sess-title">{s.title}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="a-sb-foot">
        <div className="a-sb-avatar">W</div>
        <div className="a-sb-user">
          <div className="a-sb-name">Wenhua</div>
          <div className="a-sb-plan">Pro · 4 tools</div>
        </div>
      </div>
    </aside>
  );
}

function A_ToolPill({ name, status }) {
  const labels = {
    book_hotel: '预订酒店', maps_weather: '查询天气',
    maps_geo: '解析地址', maps_direction_driving: '规划路线',
  };
  const label = labels[name] || name;
  const rejected = status === 'rejected';
  return (
    <div className="a-tool-wrap">
      <span className={`a-tool ${status} ${rejected ? 'rej' : ''}`}>
        <span className="a-tool-ic">
          {status === 'calling' ? <i className="a-spin" data-lucide="loader" />
            : rejected ? <i data-lucide="x" />
            : <i data-lucide="check" />}
        </span>
        <span className="a-tool-name">{label}</span>
        <span className="a-tool-code">{name}</span>
      </span>
    </div>
  );
}

function A_HitlCard({ hitl, onApprove, onReject, onFeedback }) {
  const [showFb, setShowFb] = React.useState(false);
  const [fbText, setFbText] = React.useState('');
  const MAX = 500;

  React.useEffect(() => { if (window.lucide) window.lucide.createIcons(); });

  if (hitl.status !== 'pending') {
    const cfg = {
      approved: { icon: 'check', cls: 'ok', label: '已批准' },
      rejected: { icon: 'x', cls: 'bad', label: '已拒绝' },
      feedback: { icon: 'message-square', cls: 'fb', label: '已反馈' },
    }[hitl.status];
    return (
      <div className="a-hitl-done">
        <span className={`a-hitl-chip ${cfg.cls}`}>
          <i data-lucide={cfg.icon} />
          {cfg.label} · {hitl.toolName}
        </span>
      </div>
    );
  }

  return (
    <div className="a-hitl" role="group">
      <div className="a-hitl-pulse" />
      <div className="a-hitl-inner">
        <div className="a-hitl-head">
          <span className="a-hitl-badge">
            <span className="a-hitl-dot" />
            需要审批
          </span>
          <span className="a-hitl-tool">{hitl.toolName}</span>
          <span className="a-hitl-kbd">Y / N / F</span>
        </div>
        <p className="a-hitl-body">{hitl.description}</p>

        {showFb ? (
          <div className="a-fb-wrap">
            <textarea
              className="a-fb"
              placeholder="告诉 Agent 你的修改意见..."
              maxLength={MAX}
              autoFocus
              value={fbText}
              onChange={e => setFbText(e.target.value)}
            />
            <div className="a-fb-row">
              <span className="a-fb-count">{fbText.length} / {MAX}</span>
              <div className="a-hitl-actions">
                <button className="a-btn a-btn-ghost" onClick={() => { setShowFb(false); setFbText(''); }}>取消</button>
                <button className="a-btn a-btn-primary" disabled={!fbText.trim()}
                  onClick={() => onFeedback(fbText.trim())}>发送反馈</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="a-hitl-actions">
            <button className="a-btn a-btn-primary" onClick={onApprove}>
              <A_Icon name="check" size={13} />批准
              <span className="a-kbd-inline">Y</span>
            </button>
            <button className="a-btn a-btn-ghost" onClick={() => setShowFb(true)}>
              <A_Icon name="message-square" size={13} />反馈
              <span className="a-kbd-inline">F</span>
            </button>
            <button className="a-btn a-btn-danger" onClick={onReject}>
              <A_Icon name="x" size={13} />拒绝
              <span className="a-kbd-inline">N</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function A_MessageBubble({ message, isStreaming, onApprove, onReject, onFeedback }) {
  React.useEffect(() => { if (window.lucide) window.lucide.createIcons(); });

  if (message.role === 'user') {
    const text = message.segments.find(s => s.type === 'text')?.content || '';
    return (
      <div className="a-u-row">
        <div className="a-u-bub">{text}</div>
      </div>
    );
  }

  const hasPendingHitl = message.segments.some(s => s.type === 'hitl' && s.status === 'pending');

  return (
    <div className="a-a-row">
      <div className="a-a-gutter">
        <div className="a-a-avatar"><A_Icon name="sparkles" size={11} /></div>
      </div>
      <div className="a-a-bub">
        {message.segments.map((seg, i) => {
          if (seg.type === 'tool') return <A_ToolPill key={i} name={seg.name} status={seg.status} />;
          if (seg.type === 'hitl') return (
            <A_HitlCard key={i} hitl={seg}
              onApprove={() => onApprove(message.id, i)}
              onReject={() => onReject(message.id, i)}
              onFeedback={(msg) => onFeedback(message.id, i, msg)} />
          );
          return <p key={i} className="a-a-p" dangerouslySetInnerHTML={{
            __html: seg.content
              .replace(/`([^`]+)`/g, '<code>$1</code>')
              .replace(/\n/g, '<br>')
          }} />;
        })}
        {isStreaming && (
          <div className="a-dots"><span /><span /><span /></div>
        )}
      </div>
    </div>
  );
}

function A_Composer({ onSend, disabled }) {
  const [value, setValue] = React.useState('');
  const ref = React.useRef(null);
  const composing = React.useRef(false);
  React.useEffect(() => { if (window.lucide) window.lucide.createIcons(); });

  const adjust = () => {
    const el = ref.current; if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  const submit = () => {
    const t = value.trim();
    if (!t || disabled) return;
    onSend(t);
    setValue('');
    if (ref.current) ref.current.style.height = 'auto';
  };

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div className="a-composer-wrap">
      <div className="a-composer">
        <div className="a-composer-row">
          <button className="a-comp-btn" title="附件"><A_Icon name="paperclip" size={15} /></button>
          <textarea
            ref={ref}
            value={value}
            placeholder="回复 Agent，或输入 / 查看命令..."
            disabled={disabled}
            rows={1}
            onChange={e => { setValue(e.target.value); adjust(); }}
            onCompositionStart={() => composing.current = true}
            onCompositionEnd={() => composing.current = false}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !composing.current) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button className={`a-comp-send ${canSend ? 'active' : ''}`} onClick={submit} disabled={!canSend} aria-label="发送">
            <A_Icon name="arrow-up" size={14} />
          </button>
        </div>
        <div className="a-composer-foot">
          <div className="a-comp-chips">
            <span className="a-comp-chip"><A_Icon name="wrench" size={11} />4 工具</span>
            <span className="a-comp-chip"><A_Icon name="shield-check" size={11} />HITL 开启</span>
          </div>
          <div className="a-comp-hint">
            <span className="a-kbd-mini">Enter</span> 发送
            <span className="a-kbd-mini">⇧ Enter</span> 换行
          </div>
        </div>
      </div>
    </div>
  );
}

let _amid = 0;
const aNextId = () => `am${++_amid}`;

function A_TodoPanel({ todos, onClose }) {
  React.useEffect(() => { if (window.lucide) window.lucide.createIcons(); });
  const counts = todos.reduce((a, t) => { a[t.status] = (a[t.status] || 0) + 1; return a; }, {});
  const total = todos.length;
  const done = counts.completed || 0;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <aside className="a-todo">
      <header className="a-todo-head">
        <div className="a-todo-head-l">
          <span className="a-todo-title">任务计划</span>
          <span className="a-todo-count">{done} / {total}</span>
        </div>
        <button className="a-head-btn" aria-label="关闭" onClick={onClose}>
          <A_Icon name="x" size={13} />
        </button>
      </header>
      <div className="a-todo-progress">
        <div className="a-todo-progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <div className="a-todo-list">
        {todos.length === 0 ? (
          <div className="a-todo-empty">Agent 尚未制定任务计划</div>
        ) : todos.map((t, i) => (
          <div key={i} className={`a-todo-item ${t.status}`}>
            <span className="a-todo-mark">
              {t.status === 'pending' && <span className="a-todo-circle" />}
              {t.status === 'in_progress' && (
                <svg viewBox="0 0 16 16" width="14" height="14" className="a-todo-spinner">
                  <circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--border-standard)" strokeWidth="1.5" />
                  <path d="M 8 1.5 A 6.5 6.5 0 0 1 14.5 8" fill="none" stroke="var(--accent-violet)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
              {t.status === 'completed' && (
                <span className="a-todo-check"><A_Icon name="check" size={10} /></span>
              )}
            </span>
            <span className="a-todo-text">{t.content}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

function VariantA() {
  const [sessions] = React.useState(A_SAMPLE_SESSIONS);
  const [activeId, setActiveId] = React.useState('s2');
  const [messages, setMessages] = React.useState([]);
  const [status, setStatus] = React.useState('idle');
  const [drawerOpen, setDrawerOpen] = React.useState(true);
  const [todos, setTodos] = React.useState([
    { content: '解析上海浦东区域地理范围', status: 'completed' },
    { content: '筛选符合预算 (¥500 以内) 的候选酒店', status: 'completed' },
    { content: '确认「全季酒店 · 浦东店」预订', status: 'in_progress' },
    { content: '返回订单号与入住说明', status: 'pending' },
  ]);
  const scrollRef = React.useRef(null);
  const timers = React.useRef([]);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const schedule = (fn, ms) => { const t = setTimeout(fn, ms); timers.current.push(t); return t; };

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      const el = scrollRef.current; if (!el) return;
      el.scrollTop = el.scrollHeight;
    });
  };

  React.useEffect(() => { scrollToBottom(); }, [messages, status]);

  // Seed with a demo conversation so users see the design in context
  React.useEffect(() => {
    const seed = [
      { id: aNextId(), role: 'user', segments: [{ type: 'text', content: '帮我订 12 月 15 日上海浦东的酒店，预算 500 以内，靠近地铁。' }] },
      {
        id: aNextId(), role: 'assistant', segments: [
          { type: 'text', content: '好的，让我先查一下浦东区域符合条件的酒店。' },
          { type: 'tool', name: 'maps_geo', status: 'done' },
          { type: 'text', content: '找到 3 家候选：全季酒店（¥468）、亚朵（¥520）、汉庭（¥358）。综合评价与距离，我推荐「全季酒店 · 浦东店」，距离 2 号线地铁口 180 米。' },
          {
            type: 'hitl',
            toolName: 'book_hotel',
            description: '即将调用 book_hotel，预订「全季酒店 · 上海浦东店」12 月 15 日一晚，价格 ¥468。该操作会产生实际订单，请确认。',
            status: 'pending',
            taskId: `demo-1`,
          },
        ],
      },
    ];
    setMessages(seed);
    setStatus('interrupted');
  }, []);

  const updateAssistant = (id, updater) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, segments: updater(m.segments) } : m));
  };

  const handleSend = (text) => {
    const userMsg = { id: aNextId(), role: 'user', segments: [{ type: 'text', content: text }] };
    const asstId = aNextId();
    const asstMsg = { id: asstId, role: 'assistant', segments: [] };
    setMessages(prev => [...prev, userMsg, asstMsg]);
    setStatus('sending');

    schedule(() => {
      setStatus('streaming');
      updateAssistant(asstId, segs => [...segs, { type: 'text', content: '好的，让我帮你处理这个请求。' }]);
    }, 500);
    schedule(() => {
      updateAssistant(asstId, segs => [...segs, { type: 'tool', name: 'maps_geo', status: 'calling' }]);
    }, 1200);
    schedule(() => {
      updateAssistant(asstId, segs =>
        segs.map(s => s.type === 'tool' && s.status === 'calling' ? { ...s, status: 'done' } : s)
      );
      updateAssistant(asstId, segs => [...segs, { type: 'text', content: '已为你查询完毕。' }]);
      setStatus('idle');
    }, 2400);
  };

  const resolveHitl = (msgId, segIdx, newStatus, followupText) => {
    updateAssistant(msgId, segs => segs.map((s, i) => i === segIdx ? { ...s, status: newStatus } : s));
    setStatus('sending');

    schedule(() => {
      setStatus('streaming');
      if (newStatus === 'approved') {
        updateAssistant(msgId, segs => [...segs, { type: 'tool', name: 'book_hotel', status: 'calling' }]);
        schedule(() => {
          updateAssistant(msgId, segs =>
            segs.map(s => (s.type === 'tool' && s.name === 'book_hotel' && s.status === 'calling') ? { ...s, status: 'done' } : s)
          );
        }, 1200);
        schedule(() => {
          updateAssistant(msgId, segs => [...segs,
            { type: 'text', content: '已为你预订「全季酒店 · 上海浦东店」12 月 15 日一晚，订单号 `HT-20251215-0042`。入住当天可凭身份证办理。' },
          ]);
          setStatus('idle');
        }, 2000);
      } else if (newStatus === 'rejected') {
        updateAssistant(msgId, segs => [...segs,
          { type: 'tool', name: 'book_hotel', status: 'rejected' },
          { type: 'text', content: '好的，已取消预订。需要我搜索其他酒店选项吗？' },
        ]);
        schedule(() => setStatus('idle'), 400);
      } else {
        updateAssistant(msgId, segs => [...segs,
          { type: 'text', content: `收到你的反馈："${followupText}"。让我重新调整方案。` },
        ]);
        schedule(() => setStatus('idle'), 400);
      }
    }, 600);
  };

  const resetSession = () => {
    clearTimers();
    setMessages([]);
    setStatus('idle');
  };

  const disabled = status === 'sending' || status === 'streaming' || status === 'interrupted';
  const lastMsg = messages[messages.length - 1];
  const streamingId = status === 'streaming' && lastMsg?.role === 'assistant' ? lastMsg.id : null;

  return (
    <div className={`a-app ${drawerOpen ? 'with-drawer' : ''}`}>
      <A_Sidebar
        sessions={sessions}
        activeId={activeId}
        onNew={resetSession}
        onSelect={(id) => { setActiveId(id); resetSession(); }}
      />
      <section className="a-main">
        <header className="a-main-head">
          <div className="a-main-head-l">
            <span className="a-main-title">预订出差酒店</span>
            <span className="a-main-meta">12 条消息 · 今天 14:32</span>
          </div>
          <div className="a-main-head-r">
            <button
              className={`a-head-btn ${drawerOpen ? 'active' : ''}`}
              aria-pressed={drawerOpen}
              title="任务计划"
              onClick={() => setDrawerOpen(o => !o)}
            >
              <A_Icon name="list-todo" size={13} />
            </button>
            <button className="a-head-btn" title="分享"><A_Icon name="share" size={13} /></button>
            <button className="a-head-btn"><A_Icon name="more-horizontal" size={13} /></button>
          </div>
        </header>

        <div className="a-messages" ref={scrollRef}>
          <div className="a-messages-inner">
            {messages.length === 0 && status === 'idle' ? (
              <div className="a-empty">
                <div className="a-empty-mark"><A_Icon name="sparkles" size={18} /></div>
                <div className="a-empty-text">你好，有什么可以帮你的？</div>
              </div>
            ) : (
              messages.map(m => (
                <A_MessageBubble
                  key={m.id}
                  message={m}
                  isStreaming={streamingId === m.id}
                  onApprove={(mid, si) => resolveHitl(mid, si, 'approved')}
                  onReject={(mid, si) => resolveHitl(mid, si, 'rejected')}
                  onFeedback={(mid, si, text) => resolveHitl(mid, si, 'feedback', text)}
                />
              ))
            )}
            {status === 'sending' && (
              <div className="a-a-row">
                <div className="a-a-gutter"><div className="a-a-avatar"><A_Icon name="sparkles" size={11} /></div></div>
                <div className="a-a-bub"><div className="a-dots"><span /><span /><span /></div></div>
              </div>
            )}
          </div>
        </div>

        <A_Composer onSend={handleSend} disabled={disabled} />
      </section>
      {drawerOpen && <A_TodoPanel todos={todos} onClose={() => setDrawerOpen(false)} />}
    </div>
  );
}

window.VariantA = VariantA;
