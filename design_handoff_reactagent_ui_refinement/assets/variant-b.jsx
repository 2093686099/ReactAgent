// Variant B — "Editor Mode"
// Approach: IDE/editor feel. Wider left rail with agent + tools panel,
// messages use gutter rules + timestamps, tool calls render as inspector cards
// with collapsible params, floating composer with slash menu.

const B_SAMPLE_SESSIONS = [
  { id: 's1', title: '上海天气查询', group: '今天', pinned: false },
  { id: 's2', title: '预订出差酒店', group: '今天', active: true, pinned: true },
  { id: 's3', title: '规划周末路线', group: '本周', pinned: false },
  { id: 's4', title: '整理季度报告', group: '本周', pinned: false },
  { id: 's5', title: 'API 文档排错', group: '更早', pinned: false },
];

function B_Icon({ name, size = 14 }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (window.lucide && ref.current) {
      window.lucide.createIcons({ nameAttr: 'data-lucide' });
    }
  });
  return <i ref={ref} data-lucide={name} style={{ width: size, height: size, display: 'inline-flex', flex: 'none' }} />;
}

function B_Sidebar({ sessions, activeId, onNew, onSelect }) {
  const groups = {};
  sessions.forEach(s => { (groups[s.group] ||= []).push(s); });
  const order = ['今天', '本周', '更早'];

  return (
    <aside className="b-sb">
      <div className="b-sb-header">
        <div className="b-sb-agent">
          <div className="b-sb-agent-av">R</div>
          <div className="b-sb-agent-meta">
            <div className="b-sb-agent-name">ReAct · Travel</div>
            <div className="b-sb-agent-status"><span className="b-pulse-green" />在线 · GPT-4o</div>
          </div>
          <button className="b-sb-swap"><B_Icon name="chevrons-up-down" size={12} /></button>
        </div>
      </div>

      <div className="b-sb-section">
        <button className="b-sb-new" onClick={onNew}>
          <B_Icon name="square-pen" size={13} />
          <span>新建会话</span>
          <span className="b-kbd">⌘N</span>
        </button>
        <div className="b-sb-search">
          <B_Icon name="search" size={12} />
          <input placeholder="搜索会话与消息..." />
          <span className="b-kbd">⌘K</span>
        </div>
      </div>

      <div className="b-sb-scroll">
        {order.map(g => groups[g] && (
          <div key={g} className="b-sb-group">
            <div className="b-sb-head">
              <span>{g}</span>
              <span className="b-sb-head-count">{groups[g].length}</span>
            </div>
            {groups[g].map(s => (
              <div
                key={s.id}
                className={`b-sess ${s.id === activeId ? 'active' : ''}`}
                onClick={() => onSelect(s.id)}
              >
                <span className="b-sess-rule" />
                <span className="b-sess-title">{s.title}</span>
                {s.pinned && <B_Icon name="pin" size={10} />}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="b-sb-tools">
        <div className="b-sb-tools-head">
          <span>已连接工具</span>
          <span className="b-sb-tools-count">4</span>
        </div>
        <div className="b-sb-tools-list">
          <div className="b-tool-row"><span className="b-tool-dot" /><span>maps_geo</span></div>
          <div className="b-tool-row"><span className="b-tool-dot" /><span>maps_weather</span></div>
          <div className="b-tool-row"><span className="b-tool-dot warn" /><span>book_hotel</span><span className="b-tool-tag">需审批</span></div>
          <div className="b-tool-row"><span className="b-tool-dot" /><span>maps_direction</span></div>
        </div>
      </div>

      <div className="b-sb-foot">
        <div className="b-sb-avatar">W</div>
        <div className="b-sb-user-meta">
          <div className="b-sb-name">Wenhua</div>
          <div className="b-sb-plan">Pro Plan</div>
        </div>
        <button className="b-sb-icon"><B_Icon name="settings-2" size={13} /></button>
      </div>
    </aside>
  );
}

function B_ToolCard({ name, status }) {
  const labels = {
    book_hotel: '预订酒店', maps_weather: '查询天气',
    maps_geo: '解析地址', maps_direction_driving: '规划路线',
  };
  const label = labels[name] || name;
  const [open, setOpen] = React.useState(false);

  const params = {
    maps_geo: { address: '上海市浦东新区', city: '上海' },
    book_hotel: { hotel: '全季酒店·浦东店', date: '2025-12-15', price: 468 },
  }[name] || {};

  const rejected = status === 'rejected';
  return (
    <div className={`b-tool ${status} ${rejected ? 'rej' : ''}`}>
      <button className="b-tool-head" onClick={() => setOpen(o => !o)}>
        <span className="b-tool-ic">
          {status === 'calling' ? <i className="b-spin" data-lucide="loader" />
            : rejected ? <i data-lucide="x" />
            : <i data-lucide="check" />}
        </span>
        <span className="b-tool-code">{name}</span>
        <span className="b-tool-label">{label}</span>
        <span className="b-tool-status">
          {status === 'calling' ? '调用中…' : rejected ? '已取消' : '完成 · 480ms'}
        </span>
        <i data-lucide={open ? 'chevron-down' : 'chevron-right'} className="b-tool-caret" />
      </button>
      {open && (
        <div className="b-tool-body">
          <div className="b-tool-section">
            <div className="b-tool-sec-label">params</div>
            <pre>{JSON.stringify(params, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

function B_HitlCard({ hitl, onApprove, onReject, onFeedback }) {
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
      <div className="b-hitl-done">
        <span className={`b-hitl-chip ${cfg.cls}`}>
          <i data-lucide={cfg.icon} />
          {cfg.label} · {hitl.toolName}
        </span>
      </div>
    );
  }

  return (
    <div className="b-hitl">
      <div className="b-hitl-bar" />
      <div className="b-hitl-main">
        <div className="b-hitl-top">
          <div className="b-hitl-title-row">
            <span className="b-hitl-ring"><span className="b-hitl-ring-inner" /></span>
            <span className="b-hitl-title">等待你的审批</span>
            <span className="b-hitl-risk">中风险 · 将产生订单</span>
          </div>
          <span className="b-hitl-kbd-hint">按 <kbd>Y</kbd> / <kbd>N</kbd> / <kbd>F</kbd></span>
        </div>

        <div className="b-hitl-diff">
          <div className="b-diff-row"><span className="b-diff-key">tool</span><span className="b-diff-val mono">{hitl.toolName}</span></div>
          <div className="b-diff-row"><span className="b-diff-key">hotel</span><span className="b-diff-val">全季酒店 · 上海浦东店</span></div>
          <div className="b-diff-row"><span className="b-diff-key">date</span><span className="b-diff-val mono">2025-12-15</span></div>
          <div className="b-diff-row"><span className="b-diff-key">price</span><span className="b-diff-val mono">¥468.00</span></div>
        </div>

        <p className="b-hitl-body">{hitl.description}</p>

        {showFb ? (
          <div className="b-fb-wrap">
            <textarea
              className="b-fb"
              placeholder="告诉 Agent 你的修改意见..."
              maxLength={MAX}
              autoFocus
              value={fbText}
              onChange={e => setFbText(e.target.value)}
            />
            <div className="b-fb-row">
              <span className="b-fb-count">{fbText.length} / {MAX}</span>
              <div className="b-hitl-actions">
                <button className="b-btn b-btn-ghost" onClick={() => { setShowFb(false); setFbText(''); }}>取消</button>
                <button className="b-btn b-btn-primary" disabled={!fbText.trim()}
                  onClick={() => onFeedback(fbText.trim())}>发送反馈</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="b-hitl-actions">
            <button className="b-btn b-btn-primary" onClick={onApprove}>
              <B_Icon name="check" size={13} />批准执行
              <span className="b-kbd-inline">Y</span>
            </button>
            <button className="b-btn b-btn-ghost" onClick={() => setShowFb(true)}>
              <B_Icon name="message-square" size={13} />反馈修改
              <span className="b-kbd-inline">F</span>
            </button>
            <button className="b-btn b-btn-danger" onClick={onReject}>
              <B_Icon name="x" size={13} />拒绝
              <span className="b-kbd-inline">N</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function B_MessageBubble({ message, isStreaming, onApprove, onReject, onFeedback }) {
  React.useEffect(() => { if (window.lucide) window.lucide.createIcons(); });

  if (message.role === 'user') {
    const text = message.segments.find(s => s.type === 'text')?.content || '';
    return (
      <div className="b-msg b-msg-user">
        <div className="b-msg-gutter">
          <div className="b-msg-av b-msg-av-u">W</div>
        </div>
        <div className="b-msg-content">
          <div className="b-msg-meta">
            <span className="b-msg-name">Wenhua</span>
            <span className="b-msg-time">14:32</span>
          </div>
          <div className="b-u-text">{text}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="b-msg b-msg-a">
      <div className="b-msg-gutter">
        <div className="b-msg-av b-msg-av-a"><B_Icon name="sparkles" size={11} /></div>
      </div>
      <div className="b-msg-content">
        <div className="b-msg-meta">
          <span className="b-msg-name">ReAct Agent</span>
          <span className="b-msg-time">14:32</span>
        </div>
        {message.segments.map((seg, i) => {
          if (seg.type === 'tool') return <B_ToolCard key={i} name={seg.name} status={seg.status} />;
          if (seg.type === 'hitl') return (
            <B_HitlCard key={i} hitl={seg}
              onApprove={() => onApprove(message.id, i)}
              onReject={() => onReject(message.id, i)}
              onFeedback={(msg) => onFeedback(message.id, i, msg)} />
          );
          return <p key={i} className="b-a-p" dangerouslySetInnerHTML={{
            __html: seg.content
              .replace(/`([^`]+)`/g, '<code>$1</code>')
              .replace(/\n/g, '<br>')
          }} />;
        })}
        {isStreaming && (
          <div className="b-dots"><span /><span /><span /></div>
        )}
      </div>
    </div>
  );
}

function B_Composer({ onSend, disabled }) {
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
    <div className="b-composer-wrap">
      <div className="b-composer">
        <div className="b-comp-top">
          <span className="b-comp-prefix">/</span>
          <textarea
            ref={ref}
            value={value}
            placeholder="回复或输入命令…  / 召唤工具    @ 引用消息"
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
        </div>
        <div className="b-comp-foot">
          <div className="b-comp-left">
            <button className="b-comp-btn"><B_Icon name="paperclip" size={13} />附件</button>
            <button className="b-comp-btn"><B_Icon name="at-sign" size={13} />引用</button>
            <button className="b-comp-btn"><B_Icon name="wrench" size={13} />工具 · 4</button>
          </div>
          <div className="b-comp-right">
            <span className="b-comp-hint">
              <span className="b-kbd-mini">Enter</span>发送
              <span className="b-kbd-mini">⇧Enter</span>换行
            </span>
            <button className={`b-comp-send ${canSend ? 'active' : ''}`} onClick={submit} disabled={!canSend}>
              <B_Icon name="arrow-up" size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

let _bmid = 0;
const bNextId = () => `bm${++_bmid}`;

function VariantB() {
  const [sessions] = React.useState(B_SAMPLE_SESSIONS);
  const [activeId, setActiveId] = React.useState('s2');
  const [messages, setMessages] = React.useState([]);
  const [status, setStatus] = React.useState('idle');
  const scrollRef = React.useRef(null);
  const timers = React.useRef([]);

  const schedule = (fn, ms) => { const t = setTimeout(fn, ms); timers.current.push(t); return t; };
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  React.useEffect(() => {
    const seed = [
      { id: bNextId(), role: 'user', segments: [{ type: 'text', content: '帮我订 12 月 15 日上海浦东的酒店，预算 500 以内，靠近地铁。' }] },
      {
        id: bNextId(), role: 'assistant', segments: [
          { type: 'text', content: '好的，让我先查一下浦东区域符合条件的酒店。' },
          { type: 'tool', name: 'maps_geo', status: 'done' },
          { type: 'text', content: '找到 3 家候选：全季（¥468）、亚朵（¥520）、汉庭（¥358）。综合评价与距离，推荐「全季酒店 · 浦东店」，距 2 号线地铁口 180 米。' },
          {
            type: 'hitl',
            toolName: 'book_hotel',
            description: '即将调用 book_hotel 产生真实订单，请确认参数。',
            status: 'pending',
          },
        ],
      },
    ];
    setMessages(seed);
    setStatus('interrupted');
  }, []);

  React.useEffect(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current; if (!el) return;
      el.scrollTop = el.scrollHeight;
    });
  }, [messages, status]);

  const updateAssistant = (id, updater) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, segments: updater(m.segments) } : m));
  };

  const handleSend = (text) => {
    const userMsg = { id: bNextId(), role: 'user', segments: [{ type: 'text', content: text }] };
    const asstId = bNextId();
    setMessages(prev => [...prev, userMsg, { id: asstId, role: 'assistant', segments: [] }]);
    setStatus('sending');
    schedule(() => {
      setStatus('streaming');
      updateAssistant(asstId, segs => [...segs, { type: 'text', content: '好的，让我帮你处理。' }]);
    }, 500);
    schedule(() => {
      updateAssistant(asstId, segs => [...segs, { type: 'tool', name: 'maps_geo', status: 'calling' }]);
    }, 1100);
    schedule(() => {
      updateAssistant(asstId, segs =>
        segs.map(s => s.type === 'tool' && s.status === 'calling' ? { ...s, status: 'done' } : s)
      );
      setStatus('idle');
    }, 2200);
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
            { type: 'text', content: '已为你预订，订单号 `HT-20251215-0042`。' },
          ]);
          setStatus('idle');
        }, 2000);
      } else if (newStatus === 'rejected') {
        updateAssistant(msgId, segs => [...segs,
          { type: 'tool', name: 'book_hotel', status: 'rejected' },
          { type: 'text', content: '好的，已取消预订。需要搜索其他选项吗？' },
        ]);
        schedule(() => setStatus('idle'), 400);
      } else {
        updateAssistant(msgId, segs => [...segs,
          { type: 'text', content: `收到反馈："${followupText}"。让我重新调整。` },
        ]);
        schedule(() => setStatus('idle'), 400);
      }
    }, 500);
  };

  const resetSession = () => { clearTimers(); setMessages([]); setStatus('idle'); };

  const disabled = status === 'sending' || status === 'streaming' || status === 'interrupted';
  const lastMsg = messages[messages.length - 1];
  const streamingId = status === 'streaming' && lastMsg?.role === 'assistant' ? lastMsg.id : null;

  return (
    <div className="b-app">
      <B_Sidebar
        sessions={sessions}
        activeId={activeId}
        onNew={resetSession}
        onSelect={(id) => { setActiveId(id); resetSession(); }}
      />
      <section className="b-main">
        <header className="b-main-head">
          <div className="b-main-head-l">
            <span className="b-breadcrumb">Travel Agent<span className="b-crumb-sep">/</span></span>
            <span className="b-main-title">预订出差酒店</span>
            <span className="b-main-tag">
              <span className="b-pulse-green" />
              活跃
            </span>
          </div>
          <div className="b-main-head-r">
            <span className="b-main-meta">12 条 · 3 工具</span>
            <button className="b-head-btn"><B_Icon name="panel-right" size={13} /></button>
            <button className="b-head-btn"><B_Icon name="more-horizontal" size={13} /></button>
          </div>
        </header>

        <div className="b-messages" ref={scrollRef}>
          <div className="b-messages-inner">
            {messages.length === 0 && status === 'idle' ? (
              <div className="b-empty">
                <div className="b-empty-mark"><B_Icon name="sparkles" size={20} /></div>
                <div className="b-empty-text">你好，有什么可以帮你的？</div>
              </div>
            ) : (
              messages.map(m => (
                <B_MessageBubble
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
              <div className="b-msg b-msg-a">
                <div className="b-msg-gutter">
                  <div className="b-msg-av b-msg-av-a"><B_Icon name="sparkles" size={11} /></div>
                </div>
                <div className="b-msg-content">
                  <div className="b-dots"><span /><span /><span /></div>
                </div>
              </div>
            )}
          </div>
        </div>

        <B_Composer onSend={handleSend} disabled={disabled} />
      </section>
    </div>
  );
}

window.VariantB = VariantB;
