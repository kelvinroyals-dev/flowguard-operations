// ============================================
// OPS CLIENTS MODULE
// Customer directory (client-type users who submitted properties).
// Rules: whole row opens a FULL detail screen (no pop-up), no "View"
// button, and every list column also appears in the detail view.
// ============================================

const OpsClients = (function () {
  'use strict';

  const _isAdmin = (() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('user') || localStorage.getItem('user') || '{}');
      return u.role === 'admin' || u.role === 'super_admin';
    } catch { return false; }
  })();

  let _all = [];
  let _pg = null;
  let _container = null;

  const money = v => (v == null || v === '' || isNaN(Number(v))) ? '—' : '₦' + Number(v).toLocaleString();
  const dash = v => (v == null || v === '') ? '—' : v;
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  const SHARED_CSS = `
    <style>
      .cl-table-wrap { background: var(--surface,#fff); border:1px solid var(--border,#dae6ef); border-radius:var(--r,14px); overflow:hidden; box-shadow:var(--sh-xs); }
      .cl-table-head { padding:14px 20px; border-bottom:1px solid var(--border,#dae6ef); display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .cl-table-title { font-family:var(--ff-d,'Space Grotesk',sans-serif); font-size:var(--fs-md); font-weight:700; color:var(--ink,#0a1f2e); }
      .cl-search-wrap { position:relative; }
      .cl-search-input { padding:7px 12px 7px 32px; border:1px solid var(--border,#dae6ef); border-radius:var(--rs,9px); background:var(--surface-2,#f7fafc); font-family:var(--ff-b,'Inter',sans-serif); font-size:var(--fs-base); color:var(--ink,#0a1f2e); outline:none; transition:all .2s; width:220px; }
      .cl-search-input:focus { border-color:var(--blue,#16a8d3); box-shadow:0 0 0 3px rgba(22,168,211,.1); background:var(--surface,#fff); }
      .cl-search-icon { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:var(--ink-4,#9eb8c8); pointer-events:none; }
      .cl-avatar { width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:var(--fs-sm); font-weight:700; color:#fff; flex-shrink:0; font-family:var(--ff-m,'JetBrains Mono',monospace); }
      .cl-name-wrap { display:flex; align-items:center; gap:10px; }
      .cl-name { font-size:var(--fs-md); font-weight:600; color:var(--ink,#0a1f2e); }
      .cl-email { font-size:var(--fs-sm); color:var(--ink-3,#6b8fa3); margin-top:1px; max-width:220px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .ops-table tbody tr.clickable { cursor:pointer; transition:background .12s; }
      .ops-table tbody tr.clickable:hover { background:var(--surface-2,#f2f8fb); }

      /* ── Detail screen (full view, no pop-up) ── */
      .cl-detail-top { display:flex; align-items:center; gap:14px; margin-bottom:18px; flex-wrap:wrap; }
      .cl-back { display:inline-flex; align-items:center; gap:6px; font-size:var(--fs-sm); font-weight:600; color:var(--ink-2); background:var(--surface-2); border:1px solid var(--border); border-radius:9px; padding:8px 13px; cursor:pointer; }
      .cl-back:hover { color:var(--ink); border-color:var(--border-2); }
      .cl-detail-id { display:flex; align-items:center; gap:12px; }
      .cl-detail-name { font-family:var(--ff-d); font-size:var(--fs-xl); font-weight:700; color:var(--ink); line-height:1.1; }
      .cl-detail-meta { font-size:var(--fs-sm); color:var(--ink-3); margin-top:3px; }
      .cl-detail-actions { margin-left:auto; display:flex; gap:8px; }
      .cl-section { background:var(--surface,#fff); border:1px solid var(--border); border-radius:var(--r,14px); box-shadow:var(--sh-xs); margin-bottom:14px; overflow:hidden; }
      .cl-section-h { padding:12px 18px; border-bottom:1px solid var(--border); font-family:var(--ff-d); font-size:var(--fs-sm); font-weight:700; letter-spacing:.4px; color:var(--ink); display:flex; align-items:center; justify-content:space-between; }
      .cl-section-b { padding:16px 18px; }
      .cl-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:14px 22px; }
      .cl-field .k { font-size:var(--fs-2xs); font-weight:700; letter-spacing:.9px; text-transform:uppercase; color:var(--ink-3); }
      .cl-field .v { font-size:var(--fs-md); color:var(--ink); font-weight:600; margin-top:3px; }
      .cl-empty { color:var(--ink-3); font-size:var(--fs-sm); padding:6px 0; }
      .cl-needs { font-size:var(--fs-xs); color:var(--ink-4); font-style:italic; }
      @media (max-width:640px){ .cl-detail-actions{ margin-left:0; width:100%; } }
    </style>`;

  // ── Client detail v2 — two-column glass layout (from mockup) ──────────
  const CLD_CSS = `
    <style>
      .cld { display:flex; flex-direction:column; gap:16px; }
      .cld-crumb { display:flex; align-items:center; gap:6px; font-size:var(--fs-2xs); color:var(--ink-3); padding:2px 2px; }
      .cld-crumb .lnk { color:var(--ink-2); font-weight:600; cursor:pointer; }
      .cld-crumb .lnk:hover { color:var(--ink); }
      .cld-crumb .sep { opacity:.5; }
      .cld-crumb .cur { color:var(--ink); font-weight:700; }
      .cld-card { background:var(--surface); border:1px solid var(--border); border-radius:16px; box-shadow:var(--sh-xs); padding:20px 22px; scroll-margin-top:72px; }
      .cld-header { display:flex; gap:16px; align-items:flex-start; flex-wrap:wrap; }
      .cld-avatar { width:44px; height:44px; border-radius:12px; color:#fff; font-size:var(--fs-md); font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-family:var(--ff-m); }
      .cld-header-main { flex:1; min-width:0; }
      .cld-header-top { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
      .cld-title { font-family:var(--ff-d); font-size:var(--fs-xl); font-weight:700; color:var(--ink); line-height:1.1; }
      .cld-chip { font-size:var(--fs-2xs); font-weight:700; padding:4px 11px; border-radius:20px; display:inline-flex; align-items:center; gap:6px; }
      .cld-chip .dot { width:6px; height:6px; border-radius:50%; background:currentColor; }
      .cld-chip.ok { background:rgba(31,157,91,.12); color:var(--ok); }
      .cld-chip.warn { background:rgba(224,142,18,.12); color:var(--warn); }
      .cld-chip.neutral { background:var(--surface-2); color:var(--ink-3); }
      .cld-chip.primary { background:rgba(28,184,232,.12); color:var(--blue-hi); }
      .cld-meta { display:flex; gap:16px; flex-wrap:wrap; margin-top:8px; font-size:var(--fs-sm); color:var(--ink-2); }
      .cld-meta b { color:var(--ink); font-weight:600; margin-right:5px; }
      .cld-actions { display:flex; gap:8px; flex-shrink:0; flex-wrap:wrap; }
      .cld-btn { font-size:var(--fs-sm); font-weight:600; padding:9px 16px; border-radius:10px; cursor:pointer; border:1px solid var(--border-2); color:var(--ink-2); background:var(--surface); }
      .cld-btn:hover { border-color:var(--ink-4); color:var(--ink); }
      .cld-btn.primary { background:var(--blue-hi); color:#fff; border:none; }
      .cld-btn.danger { color:var(--err); border-color:rgba(217,70,60,.25); }
      .cld-note { font-size:var(--fs-2xs); color:var(--warn); background:rgba(224,142,18,.08); border:1px solid rgba(224,142,18,.22); padding:8px 12px; border-radius:10px; display:flex; gap:8px; align-items:flex-start; }
      .cld-note svg { flex-shrink:0; margin-top:1px; }
      .cld-secnav { display:flex; gap:4px; padding:6px; flex-wrap:wrap; position:sticky; top:6px; z-index:6; background:var(--surface); border:1px solid var(--border); border-radius:12px; box-shadow:var(--sh-xs); }
      .cld-secnav a { font-size:var(--fs-xs); font-weight:600; color:var(--ink-2); padding:8px 13px; border-radius:9px; cursor:pointer; white-space:nowrap; }
      .cld-secnav a:hover { background:var(--surface-2); }
      .cld-secnav a.active { background:var(--surface-2); color:var(--ink); }
      .cld-grid { display:grid; grid-template-columns:1fr 300px; gap:16px; align-items:start; }
      .cld-main { display:flex; flex-direction:column; gap:16px; min-width:0; }
      .cld-side { display:flex; flex-direction:column; gap:14px; position:sticky; top:72px; }
      @media (max-width:900px){ .cld-grid{ grid-template-columns:1fr; } .cld-side{ position:static; } }
      .cld-card-head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:14px; }
      .cld-card-head h2 { font-family:var(--ff-d); font-size:var(--fs-md); font-weight:700; color:var(--ink); }
      .cld-card-head .cmeta { font-size:var(--fs-2xs); color:var(--ink-3); font-family:var(--ff-m); }
      .cld-block { margin-top:14px; padding-top:14px; border-top:1px dashed var(--border-2); }
      .cld-block:first-child { margin-top:0; padding-top:0; border-top:none; }
      .cld-block-label { font-size:var(--fs-xs); font-weight:700; margin-bottom:10px; display:flex; align-items:center; gap:6px; }
      .cld-block-label svg { width:14px; height:14px; flex-shrink:0; }
      .cld-fact { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:9px 0; border-bottom:1px solid var(--border); font-size:var(--fs-sm); }
      .cld-fact:last-child { border-bottom:none; }
      .cld-fact .k { color:var(--ink-3); }
      .cld-fact .v { font-weight:600; color:var(--ink); text-align:right; }
      .cld-mono { font-family:var(--ff-m); }
      .cld-table { width:100%; border-collapse:collapse; font-size:var(--fs-sm); }
      .cld-table th { text-align:left; font-size:var(--fs-2xs); text-transform:uppercase; letter-spacing:.4px; color:var(--ink-3); font-weight:600; padding:0 8px 10px; border-bottom:1px solid var(--border); }
      .cld-table td { padding:11px 8px; border-bottom:1px solid var(--border); color:var(--ink-2); }
      .cld-table tr:last-child td { border-bottom:none; }
      .cld-table td.strong { color:var(--ink); font-weight:600; }
      .cld-pill { font-size:var(--fs-2xs); font-weight:700; padding:2px 8px; border-radius:20px; }
      .cld-pill.ok { background:rgba(31,157,91,.12); color:var(--ok); }
      .cld-pill.warn { background:rgba(224,142,18,.12); color:var(--warn); }
      .cld-pill.danger { background:rgba(217,70,60,.12); color:var(--err); }
      .cld-pill.secondary { background:var(--surface-2); color:var(--ink-3); }
      .cld-tl-row { display:flex; gap:12px; padding:12px 0; border-bottom:1px solid var(--border); align-items:flex-start; }
      .cld-tl-row:last-child { border-bottom:none; }
      .cld-tl-icon { width:30px; height:30px; border-radius:9px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
      .cld-tl-icon svg { width:15px; height:15px; }
      .cld-tl-title { font-size:var(--fs-sm); font-weight:600; color:var(--ink); }
      .cld-tl-meta { font-size:var(--fs-xs); color:var(--ink-3); margin-top:2px; }
      .cld-tl-time { margin-left:auto; font-size:var(--fs-2xs); color:var(--ink-3); font-family:var(--ff-m); white-space:nowrap; }
      .cld-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:28px 20px; text-align:center; gap:8px; }
      .cld-empty svg { width:28px; height:28px; color:var(--ink-3); opacity:.6; }
      .cld-empty .t { font-size:var(--fs-sm); font-weight:600; color:var(--ink-2); }
      .cld-empty .s { font-size:var(--fs-xs); color:var(--ink-3); max-width:340px; line-height:1.5; }
    </style>`;

  // ────────────────────────────────────────────────────────── LIST VIEW
  function render(container) {
    _container = container;
    container.innerHTML = `
      ${SHARED_CSS}
      <div class="fg-page-header">
        <div>
          <div class="fg-page-title">Clients</div>
          <div class="fg-page-sub">People and organisations who submitted properties for drainage management</div>
        </div>
      </div>
      <div id="cl-stats"></div>
      <div class="lv-wrap">
        <div class="lv-toolbar">
          <div class="lv-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input id="cl-search" placeholder="Search clients…" oninput="OpsClients.search(this.value)">
          </div>
          <div class="lv-filters">
            <div class="lv-filter active" id="clf-all" onclick="OpsClients.setFilter('all')">All</div>
            <div class="lv-filter" id="clf-active" onclick="OpsClients.setFilter('active')">Active</div>
            <div class="lv-filter" id="clf-billing" onclick="OpsClients.setFilter('billing')">Has billing</div>
            <div class="lv-filter" id="clf-inactive" onclick="OpsClients.setFilter('inactive')">Inactive</div>
          </div>
          <div class="lv-toolbar-right">
            <div class="lv-icon-btn" title="Reload" onclick="reloadTab('clients')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0114.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0020.5 15"/></svg>
            </div>
          </div>
        </div>
        <div class="lv-legend">
          <span><span class="sw" style="background:var(--ok);"></span>Billing account linked</span>
          <span><span class="sw" style="background:var(--ink-3);"></span>Portal login only</span>
        </div>
        <div id="cl-table-body">
          <div style="padding:48px;text-align:center;color:var(--ink-3);">
            <div class="loading" style="margin:0 auto 12px;"></div>
            <div style="font-size:var(--fs-base);">Loading clients…</div>
          </div>
        </div>
      </div>`;
    loadClients();
  }

  async function loadClients() {
    try {
      const res = await OpsModal.apiGet('/clients');
      _all = res.data || [];
      renderStats(_all);
      _pg = FGPaginator.create(_all, { pageSize: 25, containerId: 'cl-table-body' });
      _pg.render(renderTable);
    } catch (err) {
      const el = document.getElementById('cl-table-body');
      if (el) el.innerHTML = `
        <div style="padding:48px;text-align:center;">
          <div style="color:var(--err);font-weight:700;margin-bottom:8px;">Failed to load clients</div>
          <div style="color:var(--ink-3);font-size:var(--fs-sm);margin-bottom:16px;">${err.message}</div>
          <button class="btn-ghost" onclick="reloadTab('clients')">Retry</button>
        </div>`;
    }
  }

  function renderStats(clients) {
    const total = clients.length;
    const areas = clients.reduce((s, c) => s + (parseInt(c.submitted_areas) || 0), 0);
    const pending = clients.reduce((s, c) => s + (parseInt(c.pending_areas) || 0), 0);
    const active = clients.reduce((s, c) => s + (parseInt(c.active_areas) || 0), 0);
    const el = document.getElementById('cl-stats');
    if (!el) return;
    el.innerHTML = OpsModal.kpiStrip([
      { label: 'Total Clients', value: total },
      { label: 'Properties Submitted', value: areas },
      { label: 'Pending Review', value: pending, sub: pending ? 'Needs attention' : 'All clear', subClass: pending ? 'warn' : 'ok' },
      { label: 'Active Properties', value: active, sub: active ? 'Monitored' : null, subClass: 'ok' },
    ]);
  }

  let _filter = 'all';
  let _term = '';

  function _hasBilling(c) { return c.mrr != null || c.sla || c.tier; }
  function _matchesFilter(c) {
    if (_filter === 'active') return c.is_active !== false;
    if (_filter === 'inactive') return c.is_active === false;
    if (_filter === 'billing') return _hasBilling(c);
    return true;
  }
  function applyFilters() {
    const rows = _all.filter(c =>
      _matchesFilter(c) &&
      (!_term || (c.full_name || '').toLowerCase().includes(_term) || (c.email || '').toLowerCase().includes(_term)));
    if (_pg) _pg.update(rows);
    else renderTable(rows);
  }
  function search(q) {
    _term = q.trim().toLowerCase();
    applyFilters();
  }
  function setFilter(f) {
    _filter = f;
    ['all', 'active', 'billing', 'inactive'].forEach(k => {
      const el = document.getElementById('clf-' + k);
      if (el) el.classList.toggle('active', k === f);
    });
    applyFilters();
  }

  function avatarColor(name) {
    const colors = CONFIG.AVATAR_COLORS;
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) % colors.length;
    return colors[h];
  }
  function initials(name) {
    return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  function renderTable(clients) {
    const el = document.getElementById('cl-table-body');
    if (!el) return;
    if (!clients || !clients.length) {
      el.innerHTML = `
        <div style="padding:60px;text-align:center;color:var(--ink-3);">
          <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.3" viewBox="0 0 24 24" style="margin:0 auto 14px;opacity:.25;display:block;"><path stroke-linecap="round" stroke-linejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          <div style="font-size:var(--fs-md);font-weight:600;color:var(--ink-2);">No clients found</div>
        </div>`;
      return;
    }
    const dashCell = '<span class="lv-dash">—</span>';
    el.innerHTML = `
      <div class="lv-scroll">
        <table class="lv-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Contact</th>
              <th>Industry<span class="flag" title="No industry column in schema">⚠</span></th>
              <th>Properties</th>
              <th>Active contracts<span class="flag" title="No contracts table exists">⚠</span></th>
              <th>MRR</th>
              <th>SLA</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${clients.map(c => {
              const src = c.is_active === false
                ? '<span class="lv-source">portal login · inactive</span>'
                : _hasBilling(c)
                  ? '<span class="lv-source ok"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>billing account linked</span>'
                  : '<span class="lv-source">portal login</span>';
              const st = clientStatus(c);
              return `
              <tr class="clickable" onclick="OpsClients.open(${c.client_id})" tabindex="0" onkeydown="if(event.key==='Enter'){OpsClients.open(${c.client_id})}">
                <td>
                  <div class="lv-name-cell">
                    <div class="lv-avatar" style="background:${avatarColor(c.full_name)};">${initials(c.full_name)}</div>
                    <div style="min-width:0;">
                      <div class="lv-name">${c.full_name || '—'}</div>
                      ${src}
                    </div>
                  </div>
                </td>
                <td>${c.email ? `<span class="lv-mono" style="font-size:var(--fs-xs);">${c.email}</span>` : dashCell}</td>
                <td>${c.industry || dashCell}</td>
                <td class="lv-mono">${c.submitted_areas != null ? c.submitted_areas : dashCell}</td>
                <td>${parseInt(c.active_areas) > 0 ? `<span class="lv-mono" style="color:var(--ok);font-weight:700;">${c.active_areas}</span>` : dashCell}</td>
                <td class="lv-mono">${c.mrr != null ? money(c.mrr) : dashCell}</td>
                <td class="lv-mono">${c.sla || dashCell}</td>
                <td><span class="lv-status ${st.cls}">${st.label}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function clientStatus(c) {
    if (c.is_active === false) return { cls: 'neutral', label: 'Inactive' };
    return { cls: 'ok', label: 'Active' };
  }

  function statusBadge(status, isActive) {
    if (isActive === false) return '<span class="status-badge offline">Inactive</span>';
    if (status === 'active') return '<span class="status-badge nominal">Active</span>';
    return `<span class="status-badge watch">${status || 'Pending'}</span>`;
  }
  function pipelineBadge(s) {
    const m = { submitted: 'watch', inspection_scheduled: 'watch', inspection_ongoing: 'warning', report_ready: 'watch', quote_sent: 'watch', payment_pending: 'warning', payment_completed: 'nominal', deployment_scheduled: 'watch', active: 'nominal', suspended: 'critical', cancelled: 'offline' };
    return `<span class="status-badge ${m[s] || 'offline'}">${(s || 'unknown').replace(/_/g, ' ')}</span>`;
  }
  function inspBadge(s) {
    const m = { pending: 'watch', scheduled: 'watch', in_progress: 'warning', completed: 'nominal', cancelled: 'critical', rescheduled: 'watch' };
    return `<span class="status-badge ${m[s] || 'offline'}">${s}</span>`;
  }

  function back() { if (_container) render(_container); }

  // ────────────────────────────────────────────────── FULL DETAIL SCREEN
  async function open(clientId) {
    if (!_container) return;
    _container.innerHTML = `${SHARED_CSS}<div style="padding:60px;text-align:center;color:var(--ink-3);"><div class="loading" style="margin:0 auto 12px;"></div>Loading client…</div>`;
    try {
      const res = await OpsModal.apiGet('/clients/' + clientId);
      const c = res.data;
      if (!c) { OpsModal.toast('Client not found', 'warning'); back(); return; }
      renderDetail(c);
    } catch (err) {
      _container.innerHTML = `${SHARED_CSS}<div style="padding:48px;text-align:center;"><div style="color:var(--err);font-weight:700;margin-bottom:8px;">Failed to load client</div><button class="btn-ghost" onclick="OpsClients.back()">← Back to Clients</button></div>`;
    }
  }

  function section(title, bodyHTML, needsBackend) {
    return `<div class="cl-section">
      <div class="cl-section-h">${title}${needsBackend ? '<span class="cl-needs">pending backend data</span>' : ''}</div>
      <div class="cl-section-b">${bodyHTML}</div>
    </div>`;
  }

  function renderDetail(c) {
    const areas = c.areas || [];
    const invoices = c.invoices || [];
    const activeAreas = areas.filter(a => a.status === 'active');
    const L = OpsModal.link;
    const hasBilling = _hasBilling(c);
    const dt = v => v ? OpsModal.fmtDateTime(v) : '—';
    const dS = v => v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—';
    const linkState = c.is_active === false ? { cls: 'neutral', label: 'Inactive' }
      : hasBilling ? { cls: 'ok', label: 'Fully linked' }
      : { cls: 'neutral', label: 'Portal account' };

    const fact = (k, v) => `<div class="cld-fact"><span class="k">${k}</span><span class="v">${v}</span></div>`;
    const emptyBox = (icon, t, s) => `<div class="cld-empty">${icon}<div class="t">${t}</div><div class="s">${s}</div></div>`;
    const note = txt => `<div class="cld-note"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg><span>${txt}</span></div>`;
    const iDoc  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>';
    const iFile = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/></svg>';
    const iCard = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>';
    const iUser = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="7" r="4"/><path d="M4 21a8 8 0 0116 0"/></svg>';
    const iCheck = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>';
    const payPill = s => { const v = String(s || '').toLowerCase(); const cl = v === 'paid' ? 'ok' : v === 'overdue' ? 'danger' : 'warn'; return `<span class="cld-pill ${cl}">${s || '—'}</span>`; };

    // Company information — the portal login (users) is the record we hold.
    // The billing block (clients table) only appears when a match actually
    // exists, so we never render a phantom empty "second record".
    const companyBody = `
      <div class="cld-block">
        <div class="cld-block-label" style="color:var(--blue-hi);">${iUser} Portal login · users table</div>
        ${fact('Full name', c.full_name || '—')}
        ${fact('Email', c.email || '—')}
        ${fact('Phone', dash(c.phone))}
        ${fact('Role / user_type', '<span class="cld-mono">client</span>')}
        ${fact('Active', c.is_active === false ? '<span style="color:var(--err);">No</span>' : '<span style="color:var(--ok);">Yes</span>')}
        ${fact('Last login', c.last_login ? dt(c.last_login) : 'Never')}
      </div>
      ${hasBilling ? `
      <div class="cld-block">
        <div class="cld-block-label" style="color:var(--ok);">${iCard} Billing account · clients table</div>
        ${fact('Name', c.full_name || '—')}
        ${c.tier ? fact('Tier', c.tier) : ''}
        ${c.mrr != null ? fact('MRR', money(c.mrr)) : ''}
        ${c.sla ? fact('SLA', c.sla) : ''}
        ${c.industry ? fact('Industry', c.industry) : ''}
      </div>` : `<div class="cld-block">${note('No billing account (clients table) is linked to this portal login. Tier, MRR and coverage live in a separate clients table that has no foreign key to users — it only appears here when a match exists.')}</div>`}`;

    const contactsBody = `
      ${note('Two contact points exist because two source rows exist — there is no dedicated multi-contact table. A client with several site managers has nowhere to store more than one contact today.')}
      <div style="margin-top:12px;">
        ${c.email ? `<div class="cld-tl-row"><div class="cld-tl-icon" style="background:rgba(28,184,232,.12);color:var(--blue-hi);">${iUser}</div><div><div class="cld-tl-title">${c.full_name || 'Portal user'}</div><div class="cld-tl-meta">${c.email}${c.phone ? ' · ' + c.phone : ''}</div></div></div>` : ''}
      </div>`;

    const propertiesBody = areas.length
      ? `<table class="cld-table"><thead><tr><th>Property</th><th>Type</th><th>Location</th><th>Status</th></tr></thead>
         <tbody>${areas.map(a => `<tr>
           <td class="strong">${a.property_id ? L('properties', a.property_id, a.property_name || a.property_id) : (a.property_name || '—')}</td>
           <td>${(a.property_type || '').replace(/_/g, ' ') || '—'}</td>
           <td>${[a.city, a.state].filter(Boolean).join(', ') || '—'}</td>
           <td>${pipelineBadge(a.status)}</td>
         </tr>`).join('')}</tbody></table>`
      : emptyBox(iDoc, 'No properties', 'No properties are linked to this client yet.');

    const contractsBody = emptyBox(iFile, 'No contracts table exists',
      'Nothing in the schema stores contract dates, terms, or signed documents. The nearest real data is service_quotes and invoices, shown under Billing below — neither is a contract record.');

    const billingBody = invoices.length
      ? `<table class="cld-table"><thead><tr><th>Invoice</th><th>Amount</th><th>Status</th><th>Due</th></tr></thead>
         <tbody>${invoices.map(inv => `<tr>
           <td class="strong">${L('billing', inv.invoice_id, inv.invoice_id)}</td>
           <td class="cld-mono">₦${Number(inv.total_amount || 0).toLocaleString()}</td>
           <td>${payPill(inv.payment_status)}</td>
           <td class="cld-mono">${dS(inv.due_date)}</td>
         </tr>`).join('')}</tbody></table>
         ${c.sla ? `<div style="margin-top:16px;"><div style="font-size:var(--fs-2xs);font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:var(--ink-3);margin-bottom:8px;">SLA · current</div>${fact('Uptime', c.sla)}</div>` : ''}`
      : emptyBox(iCard, 'No billing', 'No invoices exist for this client\'s properties yet.');

    const timelineEvents = [];
    if (c.created_at) timelineEvents.push({ t: 'Client account created', m: c.full_name || '', d: c.created_at, bg: 'rgba(28,184,232,.12)', c: 'var(--blue-hi)', ic: iUser });
    invoices.filter(i => i.payment_status === 'paid').forEach(i => timelineEvents.push({ t: 'Invoice ' + i.invoice_id + ' paid', m: '₦' + Number(i.total_amount || 0).toLocaleString(), d: i.created_at, bg: 'rgba(31,157,91,.12)', c: 'var(--ok)', ic: iCard }));
    if (c.last_login) timelineEvents.push({ t: 'Portal login', m: c.full_name || '', d: c.last_login, bg: 'var(--surface-2)', c: 'var(--ink-3)', ic: iUser });
    timelineEvents.sort((x, y) => new Date(y.d || 0) - new Date(x.d || 0));
    const timelineBody = timelineEvents.length
      ? timelineEvents.slice(0, 10).map(e => `<div class="cld-tl-row"><div class="cld-tl-icon" style="background:${e.bg};color:${e.c};">${e.ic}</div><div><div class="cld-tl-title">${e.t}</div><div class="cld-tl-meta">${e.m || '—'}</div></div><div class="cld-tl-time">${dS(e.d)}</div></div>`).join('')
      : emptyBox(iCheck, 'No activity yet', 'Events appear here as invoices are paid and the client logs in.');

    const SECTIONS = [
      ['company', 'Company information', 'two source tables', companyBody],
      ['contacts', 'Contacts', 'no dedicated table', contactsBody],
      ['properties', 'Properties', 'properties.user_id', propertiesBody],
      ['contracts', 'Contracts', '', contractsBody],
      ['billing', 'Billing', 'invoices · sla', billingBody],
      ['documents', 'Documents', '', emptyBox(iDoc, 'No documents attached', 'Signed agreements or handover documents can be attached once a documents table exists.')],
      ['timeline', 'Timeline', 'derived events', timelineBody],
    ];
    const navHTML = SECTIONS.map((s, idx) =>
      `<a class="${idx === 0 ? 'active' : ''}" onclick="this.parentNode.querySelectorAll('a').forEach(function(x){x.classList.remove('active')});this.classList.add('active');var el=document.getElementById('cld-${s[0]}');if(el)el.scrollIntoView({behavior:'smooth',block:'start'})">${s[1]}</a>`
    ).join('');
    const cardsHTML = SECTIONS.map(s =>
      `<div class="cld-card" id="cld-${s[0]}"><div class="cld-card-head"><h2>${s[1]}</h2>${s[2] ? `<span class="cmeta">${s[2]}</span>` : ''}</div>${s[3]}</div>`
    ).join('');

    const openInvoices = invoices.filter(i => String(i.payment_status || '').toLowerCase() !== 'paid').length;
    const sidebar = `
      <div class="cld-card">
        <div class="cld-card-head"><h2 style="font-size:var(--fs-sm);">Quick facts</h2></div>
        ${fact('Client ID', `<span class="cld-mono">${c.client_id != null ? c.client_id : c.id}</span>`)}
        ${fact('Tier', c.tier || '—')}
        ${fact('MRR', c.mrr != null ? money(c.mrr) : '—')}
        ${fact('Properties', areas.length)}
        ${fact('Portal login', c.is_active === false ? '<span style="color:var(--err);">Inactive</span>' : '<span style="color:var(--ok);">Linked</span>')}
        ${fact('Joined', `<span class="cld-mono">${dS(c.created_at)}</span>`)}
      </div>
      <div class="cld-card">
        <div class="cld-card-head"><h2 style="font-size:var(--fs-sm);">Related</h2></div>
        ${fact('Properties', areas.length)}
        ${fact('Open invoices', openInvoices)}
        ${fact('SLA this month', c.sla || '—')}
      </div>`;

    const actions = [
      `<button class="cld-btn" onclick="OpsClients.editClient(${c.client_id})">Edit</button>`,
      _isAdmin ? `<button class="cld-btn danger" onclick="OpsClients.deleteClient(${c.client_id},'${(c.full_name || '').replace(/'/g, "\\'")}')">Delete</button>` : '',
    ].filter(Boolean).join('');

    _container.innerHTML = `
      ${CLD_CSS}
      <div class="cld">
        <div class="cld-crumb">
          <span class="lnk" onclick="OpsClients.back()">Clients</span>
          <span class="sep">/</span>
          <span class="cur">${c.full_name || 'Client'}</span>
        </div>

        <div class="cld-card cld-header">
          <div class="cld-avatar" style="background:${avatarColor(c.full_name)};">${initials(c.full_name)}</div>
          <div class="cld-header-main">
            <div class="cld-header-top">
              <span class="cld-title">${c.full_name || 'Client'}</span>
              ${c.tier ? `<span class="cld-chip primary">Tier ${c.tier}</span>` : ''}
              <span class="cld-chip ${linkState.cls}">${linkState.label}</span>
            </div>
            <div class="cld-meta">
              <span><b>Email</b>${c.email || '—'}</span>
              <span><b>Phone</b>${dash(c.phone)}</span>
              ${c.mrr != null ? `<span><b>MRR</b>${money(c.mrr)}</span>` : ''}
              <span><b>Portal</b>${c.is_active === false ? 'inactive' : (c.last_login ? 'active · last seen ' + dt(c.last_login) : 'active')}</span>
            </div>
          </div>
          <div class="cld-actions">${actions}</div>
        </div>

        ${note('This page merges two unrelated rows: a clients billing account and a users portal login. There is no foreign key joining them — they are matched by name/email. If either side is renamed independently, this page can mismatch until re-linked.')}

        <div class="cld-secnav">${navHTML}</div>

        <div class="cld-grid">
          <div class="cld-main">${cardsHTML}</div>
          <div class="cld-side">${sidebar}</div>
        </div>
      </div>
    `;
  }

  // ────────────────────────────────────────────────────────── EDIT / DELETE (actions)
  async function editClient(clientId) {
    try {
      const res = await OpsModal.apiGet('/clients/' + clientId);
      const c = res.data;
      OpsModal.open('Edit Client', `
        ${OpsModal.field('Full Name', 'full_name', 'text', c.full_name || '')}
        ${OpsModal.field('Phone', 'phone', 'text', c.phone || '', { required: false })}
        ${OpsModal.field('Status', 'status', 'select', c.status || 'active', {
          options: [
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Suspended' },
            { value: 'inactive', label: 'Inactive' },
          ]
        })}
      `, [
        { label: 'Cancel', onclick: 'OpsModal.close()', class: 'btn-ghost' },
        { label: 'Save Changes', onclick: `OpsClients.saveClient(${clientId})`, class: 'btn-primary', id: 'modal-save-btn' },
      ]);
    } catch { OpsModal.toast('Failed to load client', 'critical'); }
  }

  async function saveClient(clientId) {
    const data = OpsModal.getFormData();
    OpsModal.setLoading('modal-save-btn', true);
    try {
      await OpsModal.apiPut('/clients/' + clientId, data);
      OpsModal.close();
      OpsModal.toast('Client updated successfully', 'nominal');
      open(clientId); // return to the (refreshed) detail screen
    } catch (err) {
      OpsModal.toast('Failed to update: ' + err.message, 'critical');
      OpsModal.setLoading('modal-save-btn', false);
    }
  }

  function deleteClient(clientId, name) {
    OpsModal.confirm(
      `Permanently delete client "${name}"? This removes all their submitted areas and associated data.`,
      async function () {
        OpsModal.setLoading('modal-confirm-btn', true);
        try {
          await OpsModal.apiDelete('/clients/' + clientId);
          OpsModal.close();
          OpsModal.toast(`Client "${name}" deleted`, 'nominal');
          back();
        } catch (err) {
          OpsModal.toast('Delete failed: ' + err.message, 'critical');
          OpsModal.setLoading('modal-confirm-btn', false);
        }
      }
    );
  }

  return { render, search, setFilter, open, back, editClient, saveClient, deleteClient };

})();
