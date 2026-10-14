/* ══════════════════════════════════════════════════════════════
   FlowGuard Ops — NOTIFICATION CENTER
   One place for everything that used to live only as per-module badges
   or email: new support tickets + client replies, submitted field
   reports, new client signups, etc. Backed by the shared notifications
   table (GET/PUT /notifications).
   ══════════════════════════════════════════════════════════════ */
const OpsNotify = (function () {
  'use strict';
  let _items = [], _open = false, _timer = null, _built = false, _loadError = null;
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = id => document.getElementById(id);


  function fmtAgo(d) { return OpsModal.relativeTime(d); }
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
        const tok = sessionStorage.getItem('token') || localStorage.getItem('token') || '';
        if (tok) xhr.setRequestHeader('Authorization', 'Bearer ' + tok);
        xhr.onload = () => { try { const response = JSON.parse(xhr.responseText || '{}'); resolve(xhr.status >= 200 && xhr.status < 300 ? response : { success: false, status: xhr.status }); } catch (_) { resolve({ success: false }); } };
        xhr.onerror = () => resolve({ success: false });
        xhr.timeout = 15000;
        xhr.ontimeout = () => resolve({ success: false });
        xhr.onabort = () => resolve({ success: false });
        xhr.send(b ? JSON.stringify(b) : null);
      } catch (_) { resolve({ success: false }); }
    });
  }

  function ensure() {
    if (_built) return;
    const wrap = $('ntf-wrap');
    if (!wrap) return;
    wrap.insertAdjacentHTML('beforeend', '<div class="ntf-panel" id="ntf-panel"></div>');
    document.addEventListener('click', e => { if (_open && !wrap.contains(e.target)) close(); });
    _built = true;
  }

  async function refreshBadge() {
    try {
      const r = await api('GET', '/notifications');
      if (r?.success === false || !Array.isArray(r?.data)) {
        _loadError = 'Notifications could not be refreshed. Previously loaded records are retained.';
        const badge=$('ntf-badge');
        if(badge)badge.title='Notification count could not be refreshed. Any visible count belongs to the previously loaded feed.';
        if (_open) renderPanel();
        return;
      }
      _loadError = null;
      _items = r.data;
      const unread = _items.filter(n => !(n.is_read || n.read)).length;
      const b = $('ntf-badge');
      if (b) { b.textContent = unread > 99 ? '99+' : unread; b.style.display = unread ? '' : 'none'; b.title=unread+' unread in the returned notification feed; not a complete platform total'; }
      if (_open) renderPanel();
    } catch (_) {}
  }

  function renderPanel() {
    const panel = $('ntf-panel'); if (!panel) return;
    const rows = _items.length ? _items.map(n => {
      const unread = !(n.is_read || n.read);
      return `<button type="button" class="ntf-item ${unread ? 'unread' : ''}" onclick="OpsNotify.go(${esc(JSON.stringify(String(n.id || n.notification_id || '')))},${esc(JSON.stringify(String(n.link || '')))})">
        <span class="ntf-dot" aria-hidden="true"></span>
        <span class="ntf-body">
          <span class="ntf-title">${esc(n.title || 'Notification')}</span>
          ${n.message ? `<span class="ntf-msg">${esc(n.message)}</span>` : ''}
          <span class="ntf-time">${fmtAgo(n.created_at)}</span>
        </span>
      </button>`;
    }).join('') : _loadError ? '' : OpsModal.emptyState('', 'No notifications returned', 'No records were returned by the notification feed.', {compact:true});
    panel.innerHTML = `
      <div class="ntf-head"><h3>Notifications</h3>${_items.some(n => !(n.is_read || n.read)) ? '<button class="fg-action fg-action-neutral ntf-mark" onclick="OpsNotify.markAll(event)">Mark all read</button>' : ''}</div>
      ${_loadError ? '<div class="fg-state-compact">'+OpsModal.failure('Notifications',new Error(_loadError),'OpsNotify.refreshBadge()')+'</div>' : ''}
      <div class="ntf-list">${rows}</div>`;
  }

  function toggle(e) { if (e) e.stopPropagation(); ensure(); _open ? close() : openPanel(); }
  function openPanel() { ensure(); _open = true; $('ntf-panel') && $('ntf-panel').classList.add('open'); refreshBadge().then(renderPanel); renderPanel(); }
  function close() { _open = false; const p = $('ntf-panel'); if (p) p.classList.remove('open'); }

  async function markAll(e) {
    if (e) e.stopPropagation();
    const result = await api('PUT', '/notifications/read-all');
    if (result?.success !== true) {
      OpsModal.toast('Notifications were not marked read. Retry when the connection is restored.', 'critical');
      return;
    }
    _items = _items.map(n => ({ ...n, is_read: true, read: true }));
    renderPanel(); refreshBadge();
  }
  async function go(id, link) {
    try { if (id) await api('PUT', '/notifications/' + encodeURIComponent(id) + '/read'); } catch (_) {}
    close();
    // link is either '#tab' (open the module) or '#tab/RECORD-ID' (open the
    // specific record straight away, not the list).
    if (link && link.charAt(0) === '#') {
      const aliases = { 'service-providers':'providers', incidents:'alerts', property:'properties', ticket:'support' };
      const parts = link.slice(1).split('/');
      parts[0] = aliases[parts[0]] || parts[0];
      const rest = parts.join('/');
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
