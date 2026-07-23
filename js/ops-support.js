/* ══════════════════════════════════════════════════════════════
   FlowGuard Ops — SUPPORT INBOX
   Client-raised support tickets (no work_type) that used to have no
   ops-side home. List → conversation thread → reply / resolve.
   ══════════════════════════════════════════════════════════════ */
const OpsSupport = (function () {
  'use strict';
  let _container = null, _rows = [], _filter = 'open', _term = '', _cur = null;

  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const canManage = () => (typeof Auth !== 'undefined' && Auth.can) ? Auth.can('support.manage') : true;
  const openStatus = s => !['resolved', 'closed'].includes(String(s || '').toLowerCase());
  const statusCls = s => openStatus(s) ? 'warn' : 'ok';
  const timeAgo = d => {
    if (!d) return '—';
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago';
  };

  const CSS = `<style id="sup-css">
    .sup-head { display:flex; align-items:center; gap:16px; margin-bottom:16px; flex-wrap:wrap; }
    .sup-head h1 { font-family:var(--ff-d); font-size:var(--fs-xl); font-weight:700; color:var(--ink); }
    .sup-head .sub { font-size:var(--fs-sm); color:var(--ink-3); margin-top:2px; }
    .sup-thread { display:grid; grid-template-columns:1fr 300px; gap:16px; align-items:start; }
    @media (max-width:900px){ .sup-thread{ grid-template-columns:1fr; } }
    .sup-msgs { background:var(--surface); border:1px solid var(--border); border-radius:16px; box-shadow:var(--sh-xs); padding:18px; display:flex; flex-direction:column; gap:12px; }
    .sup-bubble { max-width:80%; padding:11px 14px; border-radius:14px; font-size:var(--fs-sm); line-height:1.5; }
    .sup-bubble .who { font-size:var(--fs-2xs); font-weight:700; margin-bottom:3px; opacity:.8; }
    .sup-bubble .t { font-size:var(--fs-2xs); color:var(--ink-4); margin-top:5px; }
    .sup-client { align-self:flex-start; background:var(--surface-2); color:var(--ink); border:1px solid var(--border); }
    .sup-ops { align-self:flex-end; background:linear-gradient(135deg,#16a8d3,#0d7fa0); color:#fff; }
    .sup-ops .t, .sup-ops .who { color:rgba(255,255,255,.85); }
    .sup-reply { margin-top:14px; }
    .sup-reply textarea { width:100%; box-sizing:border-box; min-height:80px; padding:11px; border:1px solid var(--border); border-radius:12px; font-family:var(--ff-b); font-size:var(--fs-sm); color:var(--ink); background:var(--surface); resize:vertical; }
    .sup-reply-bar { display:flex; justify-content:flex-end; gap:8px; margin-top:10px; }
    .sup-btn { font-size:var(--fs-sm); font-weight:600; padding:9px 16px; border-radius:10px; cursor:pointer; border:1px solid var(--border-2); background:var(--surface); color:var(--ink-2); }
    .sup-btn.primary { background:linear-gradient(135deg,#16a8d3,#0d7fa0); color:#fff; border:none; }
    .sup-empty { padding:40px; text-align:center; color:var(--ink-3); }
  </style>`;

  function render(container) {
    _container = container; _cur = null;
    container.innerHTML = CSS + `
      <div class="sup-head">
        <div><h1>Support</h1><div class="sub" id="sup-count">Loading…</div></div>
      </div>
      <div class="lv-wrap">
        <div class="lv-toolbar">
          <div class="lv-search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input id="sup-search" placeholder="Search tickets…" oninput="OpsSupport.search(this.value)"></div>
          <div class="lv-filters">
            <div class="lv-filter active" id="supf-open" onclick="OpsSupport.setFilter('open')">Open</div>
            <div class="lv-filter" id="supf-resolved" onclick="OpsSupport.setFilter('resolved')">Resolved</div>
            <div class="lv-filter" id="supf-all" onclick="OpsSupport.setFilter('all')">All</div>
          </div>
        </div>
        <div id="sup-body"><div class="sup-empty">Loading support tickets…</div></div>
      </div>`;
    load();
  }

  async function load() {
    try {
      const res = await OpsModal.apiGet('/tickets/support');
      _rows = res.data || [];
      const c = document.getElementById('sup-count');
      const open = _rows.filter(r => openStatus(r.status)).length;
      if (c) c.textContent = `${_rows.length} ticket${_rows.length === 1 ? '' : 's'} · ${open} open`;
      applyFilter();
    } catch (err) {
      const b = document.getElementById('sup-body');
      if (b) b.innerHTML = `<div class="sup-empty"><div style="color:var(--err);font-weight:700;">${/403/.test(err.message) ? 'You do not have access to the support inbox.' : 'Failed to load: ' + esc(err.message)}</div></div>`;
    }
  }

  function setFilter(f) { _filter = f; ['open', 'resolved', 'all'].forEach(k => { const e = document.getElementById('supf-' + k); if (e) e.classList.toggle('active', k === f); }); applyFilter(); }
  function search(q) { _term = (q || '').trim().toLowerCase(); applyFilter(); }

  function applyFilter() {
    let rows = _rows;
    if (_filter === 'open') rows = rows.filter(r => openStatus(r.status));
    else if (_filter === 'resolved') rows = rows.filter(r => !openStatus(r.status));
    if (_term) rows = rows.filter(r => `${r.ticket_id} ${r.client_name || ''} ${r.title || ''} ${r.property_name || ''}`.toLowerCase().includes(_term));
    renderTable(rows);
  }

  function renderTable(rows) {
    const el = document.getElementById('sup-body'); if (!el) return;
    if (!rows.length) { el.innerHTML = `<div class="sup-empty">No support tickets ${_filter === 'open' ? 'open' : 'here'}. A quiet inbox is a good sign.</div>`; return; }
    const L = OpsModal.link;
    el.innerHTML = `<div class="lv-scroll"><table class="lv-table">
      <thead><tr><th>Ticket</th><th>Client</th><th>Subject</th><th>Category</th><th>Priority</th><th>Status</th><th>Last activity</th></tr></thead>
      <tbody>${rows.map(r => `<tr class="clickable" onclick="OpsSupport.open('${r.ticket_id}')" tabindex="0" onkeydown="if(event.key==='Enter'){OpsSupport.open('${r.ticket_id}')}">
        <td class="lv-mono" style="color:var(--ink);font-weight:700;">${esc(r.ticket_id)}</td>
        <td>${r.user_id ? L('clients', r.user_id, r.client_name || 'Client') : esc(r.client_name || '—')}</td>
        <td class="strong">${esc(r.title || '—')}</td>
        <td>${esc((r.category || 'general'))}</td>
        <td>${esc(r.priority || 'normal')}</td>
        <td><span class="lv-status ${statusCls(r.status)}">${esc(r.status || 'new')}</span></td>
        <td class="lv-mono">${timeAgo(r.last_message_at || r.created_at)}</td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  function back() { if (_container) render(_container); }

  async function open(id) {
    if (!_container) return;
    _container.innerHTML = CSS + `<div class="sup-empty">Loading conversation…</div>`;
    try {
      const t = (await OpsModal.apiGet('/tickets/' + id)).data;
      _cur = t;
      renderThread(t);
    } catch (err) {
      _container.innerHTML = CSS + `<div class="sup-empty"><div style="color:var(--err);font-weight:700;">Failed to load ticket</div><button class="sup-btn" onclick="OpsSupport.back()" style="margin-top:12px;">← Back</button></div>`;
    }
  }

  function renderThread(t) {
    const meta = _rows.find(r => r.ticket_id === t.ticket_id) || {};
    const msgs = t.messages || [];
    const bubbles = msgs.length ? msgs.map(m => {
      const ops = m.author_type !== 'client';   // support/system/ops all render on the staff side
      return `<div class="sup-bubble ${ops ? 'sup-ops' : 'sup-client'}"><div class="who">${esc(m.author_name || (ops ? 'FlowGuard' : 'Client'))}</div>${esc(m.message)}<div class="t">${OpsModal.fmtDateTime ? OpsModal.fmtDateTime(m.created_at) : esc(m.created_at)}</div></div>`;
    }).join('') : `<div class="sup-empty">No messages yet — the original request is below.</div>`;
    const F = OpsModal.fact;
    // Payment-notification tickets reference an invoice — deep-link finance to it.
    const invMatch = `${t.subject || ''} ${t.title || ''} ${t.description || ''}`.match(/INV-\d{4}-\d+/);
    const invId = invMatch ? invMatch[0] : null;
    _container.innerHTML = CSS + `
      <div class="fgd-crumb"><span class="lnk" onclick="OpsSupport.back()">Support</span><span class="sep">/</span><span class="cur">${esc(t.ticket_id)}</span></div>
      <div class="sup-head">
        <div><h1>${esc(t.subject || t.title || 'Support ticket')}</h1>
          <div class="sub">${esc(t.ticket_id)} · <span class="lv-status ${statusCls(t.status)}">${esc(t.status || 'new')}</span></div></div>
        ${canManage() && openStatus(t.status) ? `<button class="sup-btn primary" style="margin-left:auto;" onclick="OpsSupport.resolve('${t.ticket_id}')">Mark resolved</button>` : ''}
        ${canManage() && !openStatus(t.status) ? `<button class="sup-btn" style="margin-left:auto;" onclick="OpsSupport.reopen('${t.ticket_id}')">Reopen</button>` : ''}
      </div>
      <div class="sup-thread">
        <div>
          <div class="sup-msgs">
            ${t.description ? `<div class="sup-bubble sup-client"><div class="who">${esc(meta.client_name || 'Client')} · original request</div>${esc(t.description)}<div class="t">${OpsModal.fmtDateTime ? OpsModal.fmtDateTime(t.created_at) : ''}</div></div>` : ''}
            ${bubbles}
          </div>
          ${canManage() ? `<div class="sup-reply">
            <textarea id="sup-reply-txt" placeholder="Write a reply to the client…"></textarea>
            <div class="sup-reply-bar"><button class="sup-btn primary" id="sup-reply-btn" onclick="OpsSupport.reply('${t.ticket_id}')">Send reply</button></div>
          </div>` : `<div class="sup-empty" style="padding:14px;">You have read-only access to support.</div>`}
        </div>
        <div class="fgd-card" style="padding:16px;">
          <div class="fgd-card-head"><h2>Details</h2></div>
          ${F('Client', meta.client_name ? esc(meta.client_name) : '—')}
          ${F('Email', meta.client_email ? esc(meta.client_email) : '—')}
          ${F('Property', meta.property_name ? OpsModal.link('properties', t.property_id, esc(meta.property_name)) : (t.property_id ? esc(t.property_id) : '—'))}
          ${F('Category', esc(t.type || 'general'))}
          ${F('Priority', esc(t.priority || 'normal'))}
          ${F('Opened', OpsModal.fmtDate ? OpsModal.fmtDate(t.created_at) : '—')}
          ${invId ? F('Invoice', OpsModal.link('billing', invId, esc(invId))) : ''}
        </div>
        ${invId ? `<div class="fgd-card" style="padding:16px;"><div class="fgd-card-head"><h2>Reconcile</h2></div><button class="fgd-btn" style="width:100%;background:linear-gradient(135deg,#16a8d3,#0d7fa0);color:#fff;border:none;" onclick="fgOpen('billing','${esc(invId)}')">Open invoice ${esc(invId)} →</button></div>` : ''}
      </div>`;
  }

  async function reply(id) {
    const txt = (document.getElementById('sup-reply-txt') || {}).value || '';
    if (!txt.trim()) return OpsModal.toast('Write a message first', 'watch');
    OpsModal.setLoading('sup-reply-btn', true);
    try {
      await OpsModal.apiPost('/tickets/' + id + '/reply', { message: txt.trim() });
      OpsModal.toast('Reply sent', 'nominal');
      open(id);
    } catch (err) { OpsModal.toast('Failed: ' + err.message, 'critical'); OpsModal.setLoading('sup-reply-btn', false); }
  }
  async function resolve(id) { await setStatus(id, 'resolved', 'Ticket resolved'); }
  async function reopen(id) { await setStatus(id, 'in_progress', 'Ticket reopened'); }
  async function setStatus(id, status, msg) {
    try { await OpsModal.apiPut('/tickets/' + id + '/support-status', { status }); OpsModal.toast(msg, 'nominal'); open(id); }
    catch (err) { OpsModal.toast('Failed: ' + err.message, 'critical'); }
  }

  return { render, setFilter, search, open, back, reply, resolve, reopen };
})();
