/* ══════════════════════════════════════════════════════════════
   FlowGuard Ops — NOTIFICATION CENTER
   One place for everything that used to live only as per-module badges
   or email: new support tickets + client replies, submitted field
   reports, new client signups, etc. Backed by the shared notifications
   table (GET/PUT /notifications).
   ══════════════════════════════════════════════════════════════ */
const OpsNotify = (function () {
  'use strict';
  let _items = [], _open = false, _timer = null, _built = false;
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = id => document.getElementById(id);

  const CSS = `<style id="ntf-css">
    .ntf-wrap { position:relative; flex-shrink:0; }
    .ntf-panel { position:absolute; top:calc(100% + 8px); right:0; width:360px; max-width:92vw; max-height:70vh;
      background:var(--surface); border:1px solid var(--border-2); border-radius:14px; box-shadow:var(--sh-lg);
      z-index:3000; display:none; overflow:hidden; flex-direction:column; }
    .ntf-panel.open { display:flex; }
    .ntf-head { display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid var(--border); }
    .ntf-head h3 { font-family:var(--ff-d); font-size:var(--fs-md); font-weight:700; color:var(--ink); }
    .ntf-mark { font-size:var(--fs-2xs); font-weight:600; color:var(--blue-hi); background:none; border:none; cursor:pointer; }
    .ntf-mark:hover { text-decoration:underline; }
    .ntf-list { overflow-y:auto; }
    .ntf-item { display:flex; gap:11px; padding:13px 16px; border-bottom:1px solid var(--border); cursor:pointer; transition:.12s; }
    .ntf-item:hover { background:var(--surface-h); }
    .ntf-item.unread { background:rgba(22,168,211,.06); }
    .ntf-dot { width:8px; height:8px; border-radius:50%; background:var(--blue); flex-shrink:0; margin-top:5px; opacity:0; }
    .ntf-item.unread .ntf-dot { opacity:1; }
    .ntf-body { flex:1; min-width:0; }
    .ntf-title { font-size:var(--fs-sm); font-weight:700; color:var(--ink); }
    .ntf-msg { font-size:var(--fs-xs); color:var(--ink-2); margin-top:2px; line-height:1.45; }
    .ntf-time { font-size:var(--fs-2xs); color:var(--ink-4); margin-top:4px; font-family:var(--ff-m); }
    .ntf-empty { padding:36px 20px; text-align:center; color:var(--ink-3); font-size:var(--fs-sm); }
  </style>`;

  function fmtAgo(d) {
    if (!d) return '';
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago';
  }
  // Deliberately uses XHR, NOT fetch: the app installs a global fetch 401
  // interceptor that force-logs-out on any 401. A background notification poll
  // must never be able to trigger that — a real session expiry is caught by the
  // actual data-loading calls. So we bypass the patched fetch entirely and just
  // fail quietly (badge doesn't update) if the request errors.
  function api(m, p, b) {
    return new Promise(resolve => {
      try {
        const base = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE) ? CONFIG.API_BASE : '/api/v1';
        const xhr = new XMLHttpRequest();
        xhr.open(m, base + p);
        xhr.setRequestHeader('Content-Type', 'application/json');
        const tok = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
        if (tok) xhr.setRequestHeader('Authorization', 'Bearer ' + tok);
        xhr.onload = () => { try { resolve(JSON.parse(xhr.responseText || '{}')); } catch (_) { resolve({ success: false }); } };
        xhr.onerror = () => resolve({ success: false });
        xhr.send(b ? JSON.stringify(b) : null);
      } catch (_) { resolve({ success: false }); }
    });
  }

  function ensure() {
    if (_built) return;
    const wrap = $('ntf-wrap');
    if (!wrap) return;
    document.head.insertAdjacentHTML('beforeend', CSS);
    wrap.insertAdjacentHTML('beforeend', '<div class="ntf-panel" id="ntf-panel"></div>');
    document.addEventListener('click', e => { if (_open && !wrap.contains(e.target)) close(); });
    _built = true;
  }

  async function refreshBadge() {
    try {
      const r = await api('GET', '/notifications');
      _items = (r && r.data) || [];
      const unread = _items.filter(n => !(n.is_read || n.read)).length;
      const b = $('ntf-badge');
      if (b) { b.textContent = unread > 99 ? '99+' : unread; b.style.display = unread ? '' : 'none'; }
      if (_open) renderPanel();
    } catch (_) {}
  }

  function renderPanel() {
    const panel = $('ntf-panel'); if (!panel) return;
    const rows = _items.length ? _items.map(n => {
      const unread = !(n.is_read || n.read);
      return `<div class="ntf-item ${unread ? 'unread' : ''}" onclick="OpsNotify.go('${esc(n.id || n.notification_id)}','${esc(n.link || '')}')">
        <div class="ntf-dot"></div>
        <div class="ntf-body">
          <div class="ntf-title">${esc(n.title || 'Notification')}</div>
          ${n.message ? `<div class="ntf-msg">${esc(n.message)}</div>` : ''}
          <div class="ntf-time">${fmtAgo(n.created_at)}</div>
        </div>
      </div>`;
    }).join('') : '<div class="ntf-empty">You\'re all caught up.</div>';
    panel.innerHTML = `
      <div class="ntf-head"><h3>Notifications</h3>${_items.some(n => !(n.is_read || n.read)) ? '<button class="ntf-mark" onclick="OpsNotify.markAll(event)">Mark all read</button>' : ''}</div>
      <div class="ntf-list">${rows}</div>`;
  }

  function toggle(e) { if (e) e.stopPropagation(); ensure(); _open ? close() : openPanel(); }
  function openPanel() { ensure(); _open = true; $('ntf-panel') && $('ntf-panel').classList.add('open'); refreshBadge().then(renderPanel); renderPanel(); }
  function close() { _open = false; const p = $('ntf-panel'); if (p) p.classList.remove('open'); }

  async function markAll(e) {
    if (e) e.stopPropagation();
    try { await api('PUT', '/notifications/read-all'); } catch (_) {}
    _items = _items.map(n => ({ ...n, is_read: true, read: true }));
    renderPanel(); refreshBadge();
  }
  async function go(id, link) {
    try { if (id) await api('PUT', '/notifications/' + encodeURIComponent(id) + '/read'); } catch (_) {}
    close();
    // link is either '#tab' (open the module) or '#tab/RECORD-ID' (open the
    // specific record straight away, not the list).
    if (link && link.charAt(0) === '#') {
      const rest = link.slice(1);
      const slash = rest.indexOf('/');
      if (slash > 0 && typeof fgOpen === 'function') fgOpen(rest.slice(0, slash), rest.slice(slash + 1));
      else if (typeof switchTab === 'function') switchTab(rest.split('/')[0]);
    }
    refreshBadge();
  }

  function init() {
    ensure();
    refreshBadge();
    if (_timer) clearInterval(_timer);
    _timer = setInterval(refreshBadge, 45000);
  }

  return { init, toggle, close, markAll, go, refreshBadge };
})();
