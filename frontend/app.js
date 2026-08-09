/* ══════════════════════════════════════════════════════════════
   AI Workspace — talks to the FastAPI agent server in server.py.
   No build step: the page is served straight off /static.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const GITHUB = 'github.com/darkmonger';
  const STORE = 'aiw:';

  /* ── tiny DOM helper ──────────────────────────────────────── */
  function add(parent, kids) {
    kids.flat(Infinity).forEach((k) => {
      if (k === null || k === undefined || k === false || k === '') return;
      parent.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
    });
  }

  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'style') Object.assign(e.style, v);
        else if (k === 'dataset') Object.assign(e.dataset, v);
        else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v === true) e.setAttribute(k, '');
        else e.setAttribute(k, v);
      }
    }
    add(e, kids);
    return e;
  }

  const store = {
    get(k, fallback) {
      try {
        const v = localStorage.getItem(STORE + k);
        return v === null ? fallback : v;
      } catch (e) { return fallback; }
    },
    set(k, v) {
      try { localStorage.setItem(STORE + k, v); } catch (e) {}
    },
  };

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'sid-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  /* ── state ────────────────────────────────────────────────── */
  const state = {
    lang: store.get('lang', (navigator.language || 'en').slice(0, 2).toLowerCase()),
    theme: store.get('theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
    vivid: store.get('vivid', 'vivid'),
    defaultModel: store.get('model', 'flash-lite'),
    sessionId: store.get('session', ''),

    collapsed: false,
    drawer: false,
    projectsOpen: true,
    pickerOpen: false,

    view: { type: 'dashboard' },
    model: 'flash-lite',

    agents: [],
    models: [],
    online: true,
    loadError: '',

    chats: {},      // agentId -> { messages: [], busy: false }
    draft: '',
    wantFocus: false,
  };

  if (!window.STR[state.lang]) state.lang = 'en';
  if (!state.sessionId) { state.sessionId = uuid(); store.set('session', state.sessionId); }

  const t = () => window.STR[state.lang];
  const agentById = (id) => state.agents.find((a) => a.id === id) || null;
  const modelById = (id) => state.models.find((m) => m.id === id) || state.models[0] || null;
  const nameOf = (a) => (a.i18n[state.lang] || a.i18n.en).name;
  const taglineOf = (a) => (a.i18n[state.lang] || a.i18n.en).tagline;

  function chatOf(agentId) {
    if (!state.chats[agentId]) state.chats[agentId] = { messages: [], busy: false };
    return state.chats[agentId];
  }

  /* ── api ──────────────────────────────────────────────────── */
  async function api(path, options) {
    const res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options));
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body.detail || res.statusText || 'request failed');
      err.status = res.status;
      throw err;
    }
    return body;
  }

  async function loadRegistry() {
    const data = await api('/api/agents');
    state.agents = data.agents;
    state.models = data.models;
    // A model saved in this browser can become unusable later (e.g. Pro once the
    // Gemini plan lapses), so never trust the stored id without re-checking.
    const saved = modelById(state.defaultModel);
    state.defaultModel = saved && saved.free_tier ? state.defaultModel : data.default_model;
    state.model = state.defaultModel;
    state.online = true;
    injectHues();
  }

  /* Agent hues live in the Python registry, so the palette follows the data. */
  function injectHues() {
    const rules = state.agents.map((a) => `[data-agent="${a.id}"]{--h:${a.hue}}`).join('');
    let tag = document.getElementById('hue-style');
    if (!tag) {
      tag = h('style', { id: 'hue-style' });
      document.head.appendChild(tag);
    }
    tag.textContent = rules;
  }

  /* ── actions ──────────────────────────────────────────────── */
  function render() { draw(); }

  function go(view) {
    state.view = view;
    state.pickerOpen = false;
    state.drawer = false;
    render();
  }

  function openAgent(id) {
    const a = agentById(id);
    const preferred = a ? modelById(a.model) : null;
    if (a) state.model = preferred && preferred.free_tier ? a.model : state.defaultModel;
    state.draft = '';
    state.wantFocus = a && a.status === 'live';
    go({ type: 'agent', id });
  }

  function setLang(id) { state.lang = id; store.set('lang', id); render(); }
  function setTheme(v) { state.theme = v; store.set('theme', v); render(); }
  function setVivid(v) { state.vivid = v; store.set('vivid', v); render(); }
  function setDefaultModel(id) {
    state.defaultModel = id;
    state.model = id;
    store.set('model', id);
    render();
  }

  async function newChat(agentId) {
    const chat = chatOf(agentId);
    chat.messages = [];
    chat.busy = false;
    state.draft = '';
    state.wantFocus = true;
    render();
    try {
      await api('/api/chat/reset', {
        method: 'POST',
        body: JSON.stringify({ message: '', agent: agentId, session_id: state.sessionId }),
      });
    } catch (e) { /* a stale server-side history is harmless */ }
  }

  async function send(agentId, raw) {
    const text = String(raw === undefined ? state.draft : raw).trim();
    const chat = chatOf(agentId);
    if (!text || chat.busy) return;

    chat.messages.push({ id: Date.now(), role: 'user', text });
    chat.busy = true;
    state.draft = '';
    state.wantFocus = true;
    render();

    try {
      const data = await api('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: text,
          agent: agentId,
          model: state.model,
          session_id: state.sessionId,
        }),
      });
      if (data.session_id) {
        state.sessionId = data.session_id;
        store.set('session', data.session_id);
      }
      chat.messages.push({
        id: Date.now() + 1,
        role: 'agent',
        text: data.reply,
        tools: data.tools || [],
        model: (modelById(data.model) || {}).name || data.model,
      });
      state.online = true;
    } catch (e) {
      const offline = !e.status;
      state.online = !offline;
      chat.messages.push({
        id: Date.now() + 1,
        role: 'error',
        text: offline ? t().chat.offline : t().chat.failed + '\n\n' + e.message,
      });
    } finally {
      chat.busy = false;
      state.wantFocus = true;
      render();
    }
  }

  /* ── pieces ───────────────────────────────────────────────── */
  function statusDot(live) {
    return h('span', { class: 'dot' + (live ? ' live' : '') });
  }

  function navRow(opts) {
    return h(
      'button',
      {
        type: 'button',
        class: 'nav-row' + (opts.active ? ' active' : ''),
        title: state.collapsed ? opts.label : null,
        dataset: opts.agentId ? { agent: opts.agentId } : null,
        onclick: opts.onClick,
      },
      opts.icon ? icon(opts.icon, 17) : null,
      h('span', { class: 'lbl' }, opts.label),
      opts.trailing || null
    );
  }

  function sidebar() {
    return h(
      'aside',
      { class: 'sidebar' },
      h(
        'div',
        { class: 'sb-head' },
        h('div', { class: 'brand-mark' }, icon('bot', 15)),
        h(
          'div',
          { class: 'lbl', style: { minWidth: 0, flex: 1 } },
          h('div', { class: 'brand-name' }, 'AI Workspace'),
          h('div', { class: 'brand-sub mono' }, 'arman · kit')
        ),
        h(
          'button',
          {
            type: 'button', class: 'icon-btn lbl', 'aria-label': t().nav.close,
            style: { display: state.drawer ? 'grid' : 'none' },
            onclick: () => { state.drawer = false; render(); },
          },
          icon('x', 16)
        )
      ),

      h(
        'nav',
        { class: 'nav scroll' },
        navRow({
          icon: 'dashboard', label: t().nav.home,
          active: state.view.type === 'dashboard',
          onClick: () => go({ type: 'dashboard' }),
        }),
        navRow({
          icon: 'folder', label: t().nav.projects,
          trailing: h('span', { class: 'lbl', style: { display: 'flex', color: 'var(--t3)' } },
            icon(state.projectsOpen ? 'chevron-down' : 'chevron-right', 15)),
          onClick: () => {
            if (state.collapsed) state.collapsed = false;
            else state.projectsOpen = !state.projectsOpen;
            render();
          },
        }),
        state.projectsOpen
          ? h(
              'div',
              { class: 'nav-sub' },
              state.agents.map((a) =>
                navRow({
                  icon: state.collapsed ? a.icon : null,
                  agentId: a.id,
                  label: nameOf(a),
                  active: state.view.type === 'agent' && state.view.id === a.id,
                  trailing: statusDot(a.status === 'live'),
                  onClick: () => openAgent(a.id),
                })
              )
            )
          : null,
        navRow({
          icon: 'settings', label: t().nav.settings,
          active: state.view.type === 'settings',
          onClick: () => go({ type: 'settings' }),
        })
      ),

      h(
        'div',
        { class: 'sb-foot' },
        h(
          'div',
          { class: 'sb-lang' },
          h('span', { style: { color: 'var(--t3)' } }, icon('languages', 15)),
          h(
            'div',
            { class: 'lang-switch' },
            window.LANGS.map((l) =>
              h('button', {
                type: 'button',
                class: 'lang-btn mono' + (l.id === state.lang ? ' active' : ''),
                'aria-label': l.label,
                onclick: () => setLang(l.id),
              }, l.code)
            )
          )
        ),
        h(
          'div',
          { class: 'profile' },
          h('div', { class: 'avatar mono' }, 'AK'),
          h(
            'div',
            { class: 'lbl', style: { minWidth: 0, flex: 1 } },
            h('div', { class: 'profile-name' }, 'Arman'),
            h('div', { class: 'profile-sub mono' }, 'MSc CS · KIT')
          ),
          h('button', {
            type: 'button', class: 'icon-btn lbl',
            'aria-label': t().settings.appearance,
            onclick: () => setTheme(state.theme === 'dark' ? 'light' : 'dark'),
          }, icon(state.theme === 'dark' ? 'sun' : 'moon', 16))
        ),
        h(
          'button',
          {
            type: 'button', class: 'collapse-btn mono',
            onclick: () => { state.collapsed = !state.collapsed; render(); },
          },
          icon(state.collapsed ? 'panel-open' : 'panel-close', 15),
          h('span', { class: 'lbl' }, t().nav.collapse)
        )
      )
    );
  }

  /* ── dashboard ────────────────────────────────────────────── */
  function agentCard(a, wide) {
    const live = a.status === 'live';
    const model = modelById(a.model);

    return h(
      'button',
      {
        type: 'button',
        class: 'card' + (wide ? ' wide' : ''),
        dataset: { agent: a.id },
        onmousemove: (e) => {
          const r = e.currentTarget.getBoundingClientRect();
          e.currentTarget.style.setProperty('--mx', ((e.clientX - r.left) / r.width) * 100 + '%');
          e.currentTarget.style.setProperty('--my', ((e.clientY - r.top) / r.height) * 100 + '%');
        },
        onclick: () => openAgent(a.id),
      },
      h('span', { class: 'sweep' }),
      h('span', { class: 'ret' }, h('i'), h('i'), h('i'), h('i')),
      h(
        'span',
        { class: 'card-body' },
        h(
          'span',
          { class: 'card-top' },
          h('span', { class: 'tile' }, icon(a.icon, wide ? 18 : 17)),
          h('span', { class: 'status mono' + (live ? ' live' : '') },
            statusDot(live), live ? t().status.active : t().status.planned)
        ),
        h('span', { class: 'card-title' }, nameOf(a)),
        h('span', { class: 'card-desc' }, taglineOf(a)),
        h(
          'span',
          { class: 'card-foot' },
          h('span', { class: 'chips' }, a.stack.map((s) => h('span', { class: 'chip mono' }, s))),
          h(
            'span',
            { class: 'card-meta mono' },
            h('span', { title: model ? model.gemini_model : '' }, 'model: ' + a.model),
            h('span', { class: 'cta' }, live ? t().cta.open : t().cta.details, icon('chevron-right', 12))
          )
        )
      )
    );
  }

  function dashboard() {
    const live = state.agents.filter((a) => a.status === 'live');
    const soon = state.agents.filter((a) => a.status !== 'live');
    const hues = state.agents.map((a) => `oklch(var(--al) var(--ac) ${a.hue})`);
    const sheen = hues.concat(hues[0] || []).join(',');

    return h(
      'div',
      { class: 'scroll' },
      h(
        'div',
        { class: 'page' },
        h(
          'header',
          {},
          h('p', { class: 'eyebrow mono' }, t().nav.home),
          h('h1', { class: 'h1' }, t().dash.hi, h('span', { class: 'stop' }, '.')),
          h('p', { class: 'lead' }, t().dash.intro),
          h('div', { class: 'sheen', style: { background: `linear-gradient(90deg,${sheen})`, backgroundSize: '200% 100%' } }),
          h(
            'div',
            { class: 'meta-row mono' },
            state.online
              ? h('span', { dataset: { agent: (live[0] || {}).id || '' } }, statusDot(true), t().dash.running(live.length))
              : h('span', { class: 'down' }, icon('alert', 12), t().dash.offline),
            h('span', {}, t().dash.dev(soon.length)),
            h('span', {}, icon('github', 12), GITHUB)
          )
        ),

        h(
          'section',
          { class: 'cards' },
          live.map((a) => agentCard(a, true)),
          soon.map((a) => agentCard(a, false))
        ),

        h(
          'section',
          { class: 'panel' },
          h(
            'div',
            { class: 'panel-head' },
            h('span', { style: { marginTop: '2px', color: 'var(--t2)' } }, icon('cpu', 17)),
            h(
              'div',
              { style: { minWidth: 0 } },
              h('h2', { class: 'h2' }, t().models.title),
              h('p', {}, t().models.body),
              h(
                'div',
                { class: 'model-grid' },
                state.models.map((m) =>
                  h('div', { class: 'model-cell' + (m.free_tier ? '' : ' locked') },
                    h('b', { class: 'mono' }, m.name),
                    h('span', {}, m.free_tier ? (t().notes[m.id] || '') : t().models.paidOnly),
                    h('code', { class: 'mono' }, m.gemini_model))
                )
              )
            )
          )
        )
      )
    );
  }

  /* ── chat ─────────────────────────────────────────────────── */
  function modelPicker() {
    const active = modelById(state.model);
    return h(
      'div',
      { class: 'picker' },
      h(
        'button',
        {
          type: 'button', class: 'picker-btn mono',
          'aria-haspopup': 'listbox', 'aria-expanded': String(state.pickerOpen),
          onclick: (e) => { e.stopPropagation(); state.pickerOpen = !state.pickerOpen; render(); },
        },
        h('span', { style: { color: 'var(--ink)' } }, icon('zap', 13)),
        h('b', {}, active ? active.name : state.model),
        h('span', { style: { color: 'var(--t3)' } }, icon('chevron-down', 13))
      ),
      state.pickerOpen
        ? h(
            'div',
            { class: 'picker-menu', role: 'listbox', onclick: (e) => e.stopPropagation() },
            state.models.map((m) =>
              h(
                'button',
                {
                  type: 'button', role: 'option',
                  class: 'picker-item' + (m.free_tier ? '' : ' locked'),
                  'aria-selected': String(m.id === state.model),
                  disabled: !m.free_tier,
                  title: m.free_tier ? m.gemini_model : t().models.paidOnly,
                  onclick: m.free_tier
                    ? () => { state.model = m.id; state.pickerOpen = false; render(); }
                    : null,
                },
                h('span', { class: 'picker-tick' }, m.id === state.model ? '✓' : ''),
                h(
                  'span',
                  { class: 'picker-main' },
                  h('span', { class: 'picker-name mono' }, m.name),
                  h('span', { class: 'picker-note' },
                    m.free_tier ? (t().notes[m.id] || m.gemini_model) : t().models.paidOnly)
                ),
                h('span', { class: 'picker-lat mono' }, m.free_tier ? m.latency : '—')
              )
            )
          )
        : null
    );
  }

  function messageNode(msg) {
    if (msg.role === 'user') {
      return h('div', { class: 'msg user' }, h('div', { class: 'bubble' }, msg.text));
    }
    const isError = msg.role === 'error';
    return h(
      'div',
      { class: 'msg' + (isError ? ' error' : '') },
      h(
        'div',
        { class: 'agent-label mono' },
        isError ? icon('alert', 12) : null,
        h('b', {}, 'agent'),
        msg.model ? h('span', {}, '· ' + String(msg.model).toLowerCase()) : null
      ),
      msg.tools && msg.tools.length
        ? h('div', { class: 'trace mono' }, msg.tools.map((name, i) =>
            h('span', { class: 'trace-step' },
              i ? h('span', {}, '→') : null,
              h('span', { class: 'tool-pill' }, name))
          ))
        : null,
      h('div', { class: 'msg-body' }, msg.text)
    );
  }

  function chatView(a) {
    const chat = chatOf(a.id);
    const empty = chat.messages.length === 0 && !chat.busy;
    const placeholder = state.lang === 'tr'
      ? nameOf(a) + ' ile konuş…'
      : t().chat.talkTo + ' ' + nameOf(a) + '…';

    const textarea = h('textarea', {
      class: 'composer-text', rows: 1, placeholder: placeholder,
      oninput: (e) => {
        state.draft = e.target.value;
        e.target.style.height = 'auto';
        e.target.style.height = Math.min(e.target.scrollHeight, 180) + 'px';
        sendBtn.disabled = !state.draft.trim() || chat.busy;
      },
      onkeydown: (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(a.id); }
      },
    });
    textarea.value = state.draft;

    const sendBtn = h('button', {
      type: 'button', class: 'send-btn', 'aria-label': t().chat.send,
      disabled: !state.draft.trim() || chat.busy,
      onclick: () => send(a.id),
    }, icon('arrow-up', 17));

    const thread = h(
      'div',
      { class: 'thread' },
      empty
        ? h(
            'div',
            { class: 'empty' },
            h('h2', {}, nameOf(a) + ' ' + t().chat.ready),
            h('p', {}, taglineOf(a)),
            h('div', { class: 'starters' }, ['s1', 's2', 's3'].map((k) =>
              h('button', { type: 'button', class: 'starter', onclick: () => send(a.id, t().chat[k]) }, t().chat[k])
            ))
          )
        : null,
      chat.messages.map(messageNode),
      chat.busy
        ? h('div', { class: 'msg' },
            h('div', { class: 'agent-label mono' }, h('b', {}, 'agent'), h('span', {}, '· ' + t().chat.thinking)),
            h('div', { class: 'typing' }, h('span'), h('span'), h('span')))
        : null
    );

    const threadWrap = h('div', { class: 'thread-wrap scroll' }, thread);

    // Runs after this node is in the document.
    queueMicrotask(() => {
      threadWrap.scrollTop = threadWrap.scrollHeight;
      if (state.wantFocus) {
        state.wantFocus = false;
        textarea.focus();
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 180) + 'px';
      }
    });

    return h(
      'div',
      { class: 'chat' },
      h(
        'header',
        { class: 'chat-head' },
        h('span', { class: 'chat-mark' }, icon(a.icon, 16)),
        h(
          'span',
          { class: 'chat-id' },
          h('span', { class: 'chat-name' }, nameOf(a)),
          h('span', { class: 'chat-domain mono' }, a.domain.toLowerCase())
        ),
        chat.messages.length
          ? h('button', {
              type: 'button', class: 'icon-btn', title: t().chat.newChat,
              'aria-label': t().chat.newChat,
              onclick: () => newChat(a.id),
            }, icon('plus', 17))
          : null,
        modelPicker()
      ),
      threadWrap,
      h(
        'div',
        { class: 'composer' },
        h(
          'div',
          { class: 'composer-inner' },
          h(
            'div',
            { class: 'composer-box' },
            h('button', { type: 'button', class: 'ghost-btn', 'aria-label': t().chat.attach, disabled: true, title: t().chat.attach }, icon('paperclip', 17)),
            textarea,
            sendBtn
          ),
          h('p', { class: 'hint mono' }, t().chat.hint)
        )
      )
    );
  }

  /* ── coming soon ──────────────────────────────────────────── */
  function soonView(a) {
    return h(
      'div',
      { class: 'scroll' },
      h(
        'div',
        { class: 'page narrow' },
        h('button', { type: 'button', class: 'back-btn mono', onclick: () => go({ type: 'dashboard' }) },
          icon('arrow-left', 13), t().soon.back),
        h('div', { class: 'soon-mark' }, icon(a.icon, 20)),
        h('h1', { class: 'soon-title' }, nameOf(a)),
        h('p', { class: 'soon-tag' }, taglineOf(a)),
        h('div', { class: 'soon-badge mono' }, icon('clock', 12), t().soon.dev),
        h(
          'div',
          { class: 'soon-panel' },
          h('h2', { class: 'h2' }, t().soon.title),
          h('div', { class: 'tool-list' }, a.tools.map((name) =>
            h('div', { class: 'tool-line' },
              h('span', { class: 'tool-pill mono' }, name),
              h('span', {}, t().soon.toolLine))
          )),
          h('div', { class: 'soon-stack' }, a.stack.map((s) => h('span', { class: 'chip mono' }, s)))
        )
      )
    );
  }

  /* ── settings ─────────────────────────────────────────────── */
  function settingsRow(label, desc, control) {
    return h(
      'div',
      { class: 'set-row' },
      h('div', { style: { minWidth: 0 } },
        h('div', { class: 'set-label' }, label),
        h('div', { class: 'set-desc' }, desc)),
      control
    );
  }

  function settingsView() {
    return h(
      'div',
      { class: 'scroll' },
      h(
        'div',
        { class: 'page narrow' },
        h('p', { class: 'eyebrow mono' }, t().nav.settings),
        h('h1', { class: 'soon-title' }, t().settings.title),
        h(
          'div',
          { class: 'settings-card' },
          settingsRow(t().settings.language, t().settings.languageDesc,
            h('div', { class: 'seg' }, window.LANGS.map((l) =>
              h('button', { type: 'button', class: l.id === state.lang ? 'active' : '', onclick: () => setLang(l.id) }, l.label)
            ))),

          settingsRow(t().settings.appearance, t().settings.appearanceDesc,
            h('button', {
              type: 'button', class: 'pill-btn mono',
              onclick: () => setTheme(state.theme === 'dark' ? 'light' : 'dark'),
            },
              h('span', { style: { color: 'var(--ink)' } }, icon(state.theme === 'dark' ? 'moon' : 'sun', 13)),
              state.theme === 'dark' ? t().theme.dark : t().theme.light)),

          settingsRow(t().settings.accent, t().settings.accentDesc,
            h('div', { class: 'seg' }, ['calm', 'vivid', 'punchy'].map((v) =>
              h('button', { type: 'button', class: v === state.vivid ? 'active' : '', onclick: () => setVivid(v) }, t().accent[v])
            ))),

          settingsRow(t().settings.defaultModel, t().settings.defaultModelDesc,
            h('div', { class: 'seg mono' }, state.models.map((m) =>
              h('button', {
                type: 'button',
                class: (m.id === state.defaultModel ? 'active' : '') + (m.free_tier ? '' : ' locked'),
                disabled: !m.free_tier,
                title: m.free_tier ? null : t().models.paidOnly,
                onclick: m.free_tier ? () => setDefaultModel(m.id) : null,
              }, m.name)
            ))),

          settingsRow(t().settings.backend, t().settings.backendDesc,
            h('code', { class: 'addr mono' + (state.online ? ' ok' : '') },
              location.host + ' · ' + (state.online ? t().conn.ok : t().conn.bad)))
        ),
        h('p', { class: 'note mono' }, t().settings.note)
      )
    );
  }

  /* ── shell ────────────────────────────────────────────────── */
  function mainContent() {
    if (state.loadError) {
      return h('div', { class: 'scroll' }, h('div', { class: 'page narrow' },
        h('div', { class: 'soon-mark' }, icon('alert', 20)),
        h('h1', { class: 'soon-title' }, t().dash.offline),
        h('p', { class: 'soon-tag' }, t().chat.offline),
        h('p', { class: 'note mono' }, state.loadError)));
    }
    if (state.view.type === 'settings') return settingsView();
    if (state.view.type === 'agent') {
      const a = agentById(state.view.id);
      if (!a) return dashboard();
      return a.status === 'live' ? chatView(a) : soonView(a);
    }
    return dashboard();
  }

  const root = document.getElementById('root');

  function draw() {
    const agentKey = state.view.type === 'agent' ? state.view.id : 'brand';

    const shell = h(
      'div',
      {
        class: 'app',
        dataset: {
          uiTheme: state.theme,
          vivid: state.vivid,
          hover: 'spotlight',
          reticle: 'on',
          collapsed: state.collapsed ? '1' : '0',
          drawer: state.drawer ? '1' : '0',
          agent: agentKey,
        },
      },
      sidebar(),
      h('div', { class: 'scrim', onclick: () => { state.drawer = false; render(); } }),
      h(
        'main',
        { class: 'main' },
        h(
          'div',
          { class: 'topbar' },
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': t().nav.menu, onclick: () => { state.drawer = true; render(); } }, icon('menu', 18)),
          h('span', { style: { fontSize: '13.5px', fontWeight: 600 } }, 'AI Workspace')
        ),
        mainContent()
      )
    );

    // data-ui-theme has to reach <html> too, so the page background matches.
    document.documentElement.setAttribute('data-ui-theme', state.theme);
    document.documentElement.setAttribute('data-vivid', state.vivid);
    root.className = '';
    root.replaceChildren(shell);
  }

  /* Close the model picker on any outside click. */
  document.addEventListener('mousedown', (e) => {
    if (state.pickerOpen && !e.target.closest('.picker')) { state.pickerOpen = false; render(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (state.pickerOpen || state.drawer)) {
      state.pickerOpen = false;
      state.drawer = false;
      render();
    }
  });

  /* ── boot ─────────────────────────────────────────────────── */
  loadRegistry()
    .catch((e) => { state.online = false; state.loadError = String(e.message || e); })
    .finally(render);
})();
