// ============================================
// OPS PROPERTIES MODULE
// Submitted areas — full inspection pipeline.
// Rules: whole row opens a FULL detail screen (no pop-up), no "View"
// button, and every list column also appears in the detail view.
// ============================================

const OpsProperties = (function () {
  const canMng = () => !(window.Auth && Auth.can) || Auth.can('properties.manage');
  'use strict';

  let _all = [];
  let _filter = 'all';
  let _pg = null;
  let _container = null;

  const _isAdmin = (() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('user') || localStorage.getItem('user') || '{}');
      return u.role === 'admin' || u.role === 'super_admin';
    } catch { return false; }
  })();

  const dash = v => (v == null || v === '') ? '—' : v;
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const sid = v => String(v == null ? '' : v).replace(/[^A-Za-z0-9_\-.:]/g, '');

  const SHARED_CSS = `
    <style>
      .pr-table-card { background:var(--surface,#fff); border:1px solid var(--border,#dae6ef); border-radius:var(--r,14px); overflow:hidden; box-shadow:var(--sh-xs); }
      .pr-table-head { padding:14px 20px; border-bottom:1px solid var(--border,#dae6ef); display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .pr-table-title { font-family:var(--ff-d,'Space Grotesk',sans-serif); font-size:var(--fs-md); font-weight:700; color:var(--ink,#0a1f2e); }
      .pr-search-wrap { position:relative; }
      .pr-search-icon { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:var(--ink-4,#9eb8c8); pointer-events:none; }
      .pr-search { padding:7px 12px 7px 32px; border:1px solid var(--border,#dae6ef); border-radius:var(--rs,9px); background:var(--surface-2,#f7fafc); font-family:var(--ff-b,'Inter',sans-serif); font-size:var(--fs-base); color:var(--ink,#0a1f2e); outline:none; transition:all .2s; width:200px; }
      .pr-search:focus { border-color:var(--blue,#16a8d3); box-shadow:0 0 0 3px rgba(22,168,211,.1); background:var(--surface,#fff); }
      .ops-table tbody tr.clickable { cursor:pointer; transition:background .12s; }
      .ops-table tbody tr.clickable:hover { background:var(--surface-2,#f2f8fb); }

      .pr-detail-top { display:flex; align-items:center; gap:14px; margin-bottom:18px; flex-wrap:wrap; }
      .pr-back { display:inline-flex; align-items:center; gap:6px; font-size:var(--fs-sm); font-weight:600; color:var(--ink-2); background:var(--surface-2); border:1px solid var(--border); border-radius:9px; padding:8px 13px; cursor:pointer; }
      .pr-back:hover { color:var(--ink); border-color:var(--border-2); }
      .pr-detail-name { font-family:var(--ff-d); font-size:var(--fs-xl); font-weight:700; color:var(--ink); line-height:1.1; }
      .pr-detail-meta { font-size:var(--fs-sm); color:var(--ink-3); margin-top:3px; }
      .pr-detail-actions { margin-left:auto; display:flex; gap:8px; flex-wrap:wrap; }
      .pr-section { background:var(--surface,#fff); border:1px solid var(--border); border-radius:var(--r,14px); box-shadow:var(--sh-xs); margin-bottom:14px; overflow:hidden; }
      .pr-section-h { padding:12px 18px; border-bottom:1px solid var(--border); font-family:var(--ff-d); font-size:var(--fs-sm); font-weight:700; letter-spacing:.4px; color:var(--ink); display:flex; align-items:center; justify-content:space-between; }
      .pr-section-b { padding:16px 18px; }
      .pr-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:14px 22px; }
      .pr-field .k { font-size:var(--fs-2xs); font-weight:700; letter-spacing:.9px; text-transform:uppercase; color:var(--ink-3); }
      .pr-field .v { font-size:var(--fs-md); color:var(--ink); font-weight:600; margin-top:3px; }
      .pr-empty { color:var(--ink-3); font-size:var(--fs-sm); padding:6px 0; }
      .pr-needs { font-size:var(--fs-xs); color:var(--ink-4); font-style:italic; }
      @media (max-width:640px){ .pr-detail-actions{ margin-left:0; width:100%; } }
    </style>`;

  // ── Property detail v2 — two-column glass layout (from mockup) ─────────
  const PRD_CSS = `
    <style>
      .prd { display:flex; flex-direction:column; gap:16px; }
      .prd-crumb { display:flex; align-items:center; gap:6px; font-size:var(--fs-2xs); color:var(--ink-3); padding:2px 2px; }
      .prd-crumb .lnk { color:var(--ink-2); font-weight:600; cursor:pointer; }
      .prd-crumb .lnk:hover { color:var(--ink); }
      .prd-crumb .sep { opacity:.5; }
      .prd-crumb .cur { color:var(--ink); font-weight:700; }
      .prd-card { background:var(--surface); border:1px solid var(--border); border-radius:16px; box-shadow:var(--sh-xs); padding:20px 22px; scroll-margin-top:72px; }
      .prd-header { display:flex; gap:20px; align-items:flex-start; flex-wrap:wrap; }
      .prd-header-main { flex:1; min-width:0; }
      .prd-header-top { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
      .prd-title { font-family:var(--ff-d); font-size:var(--fs-xl); font-weight:700; color:var(--ink); line-height:1.1; }
      .prd-chip { font-size:var(--fs-2xs); font-weight:700; padding:4px 11px; border-radius:20px; display:inline-flex; align-items:center; gap:6px; }
      .prd-chip .dot { width:6px; height:6px; border-radius:50%; background:currentColor; }
      .prd-chip.ok { background:rgba(31,157,91,.12); color:var(--ok); }
      .prd-chip.warn { background:rgba(224,142,18,.12); color:var(--warn); }
      .prd-chip.danger { background:rgba(217,70,60,.12); color:var(--err); }
      .prd-chip.neutral { background:var(--surface-2); color:var(--ink-3); }
      .prd-meta { display:flex; gap:16px; flex-wrap:wrap; margin-top:8px; font-size:var(--fs-sm); color:var(--ink-2); }
      .prd-meta b { color:var(--ink); font-weight:600; margin-right:5px; }
      .prd-actions { display:flex; gap:8px; flex-shrink:0; flex-wrap:wrap; }
      .prd-btn { font-size:var(--fs-sm); font-weight:600; padding:9px 16px; border-radius:10px; cursor:pointer; border:1px solid var(--border-2); color:var(--ink-2); background:var(--surface); }
      .prd-btn:hover { border-color:var(--ink-4); color:var(--ink); }
      .prd-btn.primary { background:var(--blue-hi); color:#fff; border:none; }
      .prd-btn.danger { color:var(--err); border-color:rgba(217,70,60,.25); }
      .prd-secnav { display:flex; gap:4px; padding:6px; flex-wrap:wrap; position:sticky; top:6px; z-index:6; background:var(--surface); border:1px solid var(--border); border-radius:12px; box-shadow:var(--sh-xs); }
      .prd-secnav a { font-size:var(--fs-xs); font-weight:600; color:var(--ink-2); padding:8px 13px; border-radius:9px; cursor:pointer; white-space:nowrap; }
      .prd-secnav a:hover { background:var(--surface-2); }
      .prd-secnav a.active { background:var(--surface-2); color:var(--ink); }
      .prd-grid { display:grid; grid-template-columns:1fr 300px; gap:16px; align-items:start; }
      .prd-main { display:flex; flex-direction:column; gap:16px; min-width:0; }
      .prd-side { display:flex; flex-direction:column; gap:14px; position:sticky; top:72px; }
      @media (max-width:900px){ .prd-grid{ grid-template-columns:1fr; } .prd-side{ position:static; } }
      .prd-card-head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:16px; }
      .prd-card-head h2 { font-family:var(--ff-d); font-size:var(--fs-md); font-weight:700; color:var(--ink); }
      .prd-card-head .cmeta { font-size:var(--fs-2xs); color:var(--ink-3); font-family:var(--ff-m); }
      .prd-ring-box { display:flex; align-items:center; gap:14px; margin-bottom:16px; }
      .prd-ring-num { font-family:var(--ff-d); font-size:24px; font-weight:700; color:var(--ink); }
      .prd-ring-sub { font-size:var(--fs-2xs); color:var(--ink-3); margin-top:2px; line-height:1.4; }
      .prd-stats { display:flex; gap:10px; flex-wrap:wrap; }
      .prd-stat { background:var(--surface-2); border:1px solid var(--border); border-radius:11px; padding:12px 16px; flex:1; min-width:104px; }
      .prd-stat .n { font-family:var(--ff-m); font-size:20px; font-weight:700; color:var(--ink); }
      .prd-stat .l { font-size:var(--fs-2xs); color:var(--ink-3); margin-top:3px; }
      .prd-desc { margin-top:14px; font-size:var(--fs-sm); color:var(--ink-2); white-space:pre-wrap; line-height:1.5; }
      .prd-table { width:100%; border-collapse:collapse; font-size:var(--fs-sm); }
      .prd-table th { text-align:left; font-size:var(--fs-2xs); text-transform:uppercase; letter-spacing:.4px; color:var(--ink-3); font-weight:600; padding:0 8px 10px; border-bottom:1px solid var(--border); }
      .prd-table td { padding:11px 8px; border-bottom:1px solid var(--border); color:var(--ink-2); }
      .prd-table tr:last-child td { border-bottom:none; }
      .prd-table td.strong { color:var(--ink); font-weight:600; }
      .prd-mono { font-family:var(--ff-m); }
      .prd-pill { font-size:var(--fs-2xs); font-weight:700; padding:2px 8px; border-radius:20px; }
      .prd-pill.primary { background:rgba(28,184,232,.12); color:var(--blue-hi); }
      .prd-pill.secondary { background:var(--surface-2); color:var(--ink-3); }
      .prd-pill.ok { background:rgba(31,157,91,.12); color:var(--ok); }
      .prd-pill.warn { background:rgba(224,142,18,.12); color:var(--warn); }
      .prd-pill.danger { background:rgba(217,70,60,.12); color:var(--err); }
      .prd-tl-row { display:flex; gap:12px; padding:12px 0; border-bottom:1px solid var(--border); align-items:flex-start; }
      .prd-tl-row:last-child { border-bottom:none; }
      .prd-tl-icon { width:30px; height:30px; border-radius:9px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
      .prd-tl-icon svg { width:15px; height:15px; }
      .prd-tl-title { font-size:var(--fs-sm); font-weight:600; color:var(--ink); }
      .prd-tl-meta { font-size:var(--fs-xs); color:var(--ink-3); margin-top:2px; }
      .prd-tl-time { margin-left:auto; font-size:var(--fs-2xs); color:var(--ink-3); font-family:var(--ff-m); white-space:nowrap; }
      .prd-inc { display:flex; gap:12px; align-items:flex-start; padding:11px 0; border-bottom:1px solid var(--border); }
      .prd-inc:last-child { border-bottom:none; }
      .prd-inc .sev { width:8px; height:8px; border-radius:50%; margin-top:5px; flex-shrink:0; }
      .prd-inc .it { font-size:var(--fs-sm); font-weight:600; color:var(--ink); }
      .prd-inc .im { font-size:var(--fs-xs); color:var(--ink-3); margin-top:2px; }
      .prd-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:28px 20px; text-align:center; gap:8px; }
      .prd-empty svg { width:28px; height:28px; color:var(--ink-3); opacity:.6; }
      .prd-empty .t { font-size:var(--fs-sm); font-weight:600; color:var(--ink-2); }
      .prd-empty .s { font-size:var(--fs-xs); color:var(--ink-3); max-width:340px; line-height:1.5; }
      .prd-fact { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:9px 0; border-bottom:1px solid var(--border); font-size:var(--fs-sm); }
      .prd-fact:last-child { border-bottom:none; }
      .prd-fact .k { color:var(--ink-3); }
      .prd-fact .v { font-weight:600; color:var(--ink); text-align:right; }
      .prd-mapbox { height:200px; border-radius:12px; overflow:hidden; position:relative; background:var(--surface-2); border:1px solid var(--border); display:flex; align-items:center; justify-content:center; }
    </style>`;

  // ────────────────────────────────────────────────────────── LIST VIEW
  function render(container) {
    _container = container;
    container.innerHTML = `
      ${SHARED_CSS}
      <div class="fg-page-header">
        <div>
          <div class="fg-page-title">Properties</div>
          <div class="fg-page-sub">Properties moving through inspection, quoting, and activation</div>
        </div>
      </div>
      <div id="pr-pipeline"></div>
      <div class="lv-wrap">
        <div class="lv-toolbar">
          <div class="lv-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input id="pr-search" placeholder="Search properties…" oninput="OpsProperties.search(this.value)">
          </div>
          <div class="lv-filters">
            <div class="lv-filter active" id="prf-all" onclick="OpsProperties.filterStage('all')">All</div>
            <div class="lv-filter" id="prf-submitted" onclick="OpsProperties.filterStage('submitted')">Awaiting review</div>
            <div class="lv-filter" id="prf-inspection" onclick="OpsProperties.filterStage('inspection')">In inspection</div>
            <div class="lv-filter" id="prf-billing" onclick="OpsProperties.filterStage('billing')">Quote / payment</div>
            <div class="lv-filter" id="prf-active" onclick="OpsProperties.filterStage('active')">Active</div>
          </div>
          <div class="lv-toolbar-right">
            <div class="lv-icon-btn" title="Reload" onclick="reloadTab('properties')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0114.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0020.5 15"/></svg>
            </div>
          </div>
        </div>
        <div id="pr-table-body">
          <div style="padding:48px;text-align:center;color:var(--ink-3);">
            <div class="loading" style="margin:0 auto 12px;"></div>
            <div style="font-size:var(--fs-base);">Loading properties…</div>
          </div>
        </div>
      </div>`;
    loadAreas();
  }

  async function loadAreas() {
    try {
      const res = await OpsModal.apiGet('/properties/all');
      _all = res.data || [];
      renderPipeline(_all);
      _pg = FGPaginator.create(_all, { pageSize: 25, containerId: 'pr-table-body' });
      _pg.render(renderTable);
    } catch (err) {
      const el = document.getElementById('pr-table-body');
      if (el) el.innerHTML = `
        <div style="padding:48px;text-align:center;">
          <div style="color:var(--err);font-weight:700;margin-bottom:8px;">Failed to load properties</div>
          <div style="color:var(--ink-3);font-size:var(--fs-sm);margin-bottom:16px;">${err.message}</div>
          <button class="btn-ghost" onclick="reloadTab('properties')">Retry</button>
        </div>`;
    }
  }

  function stageOf(a) {
    const s = a.status;
    if (s === 'submitted') return 'submitted';
    if (['inspection_scheduled', 'inspection_ongoing'].includes(s)) return 'inspection';
    if (s === 'report_ready') return 'report';
    if (['quote_sent', 'payment_pending', 'payment_completed', 'deployment_scheduled'].includes(s)) return 'billing';
    if (s === 'active') return 'active';
    return 'other';
  }

  const STAGES = [
    { key: 'submitted', label: 'Awaiting Review', sub: 'Submitted' },
    { key: 'inspection', label: 'In Inspection', sub: 'Scheduled / ongoing' },
    { key: 'report', label: 'Report Ready', sub: 'Awaiting quote' },
    { key: 'billing', label: 'Quote / Payment', sub: 'In billing' },
    { key: 'active', label: 'Active', sub: 'Monitored' },
  ];

  function renderPipeline(areas) {
    const counts = { submitted: 0, inspection: 0, report: 0, billing: 0, active: 0 };
    areas.forEach(a => { const k = stageOf(a); if (counts[k] !== undefined) counts[k]++; });
    const el = document.getElementById('pr-pipeline');
    if (!el) return;
    el.innerHTML = OpsModal.kpiStrip(STAGES.map(s => ({
      label: s.label, value: counts[s.key], sub: s.sub,
      active: _filter === s.key, onClick: `OpsProperties.filterStage('${s.key}')`,
    })));
  }

  function filterStage(stage) {
    _filter = stage;
    renderPipeline(_all);
    ['all', 'submitted', 'inspection', 'billing', 'active'].forEach(k => {
      const el = document.getElementById('prf-' + k);
      if (el) el.classList.toggle('active', k === stage);
    });
    const filtered = stage === 'all' ? _all : _all.filter(a => stageOf(a) === stage);
    if (_pg) _pg.update(filtered);
    else renderTable(filtered);
  }

  function search(q) {
    const term = q.trim().toLowerCase();
    const base = _filter === 'all' ? _all : _all.filter(a => stageOf(a) === _filter);
    const filtered = term
      ? base.filter(a => (a.property_name || '').toLowerCase().includes(term) || (a.client_name || '').toLowerCase().includes(term) || (a.city || '').toLowerCase().includes(term))
      : base;
    if (_pg) _pg.update(filtered);
    else renderTable(filtered);
  }

  function pipelineBadge(s) {
    const m = { submitted: 'watch', inspection_scheduled: 'watch', inspection_ongoing: 'warning', report_ready: 'nominal', quote_sent: 'watch', payment_pending: 'warning', payment_completed: 'nominal', deployment_scheduled: 'watch', active: 'nominal', suspended: 'critical', cancelled: 'offline' };
    return `<span class="status-badge ${m[s] || 'offline'}">${(s || 'unknown').replace(/_/g, ' ')}</span>`;
  }
  function inspBadge(s) {
    const m = { pending: 'watch', scheduled: 'watch', in_progress: 'warning', completed: 'nominal', cancelled: 'critical', rescheduled: 'watch' };
    return `<span class="status-badge ${m[s] || 'offline'}">${s}</span>`;
  }
  function riskBadge(u) {
    if (!u) return '<span style="color:var(--ink-4);font-size:var(--fs-sm);">—</span>';
    const m = { low: 'nominal', moderate: 'watch', medium: 'watch', high: 'warning', critical: 'critical' };
    return `<span class="status-badge ${m[u] || 'offline'}">${u}</span>`;
  }
  function healthCell(score) {
    if (score == null) return '<span style="color:var(--ink-4);font-size:var(--fs-sm);">—</span>';
    const v = Math.round(Number(score));
    const c = v >= 75 ? 'var(--ok)' : v >= 50 ? 'var(--warn)' : 'var(--err)';
    return `<span style="font-family:var(--font-mono);font-weight:700;color:${c};font-size:var(--fs-base)">${v}</span>`;
  }

  function renderTable(areas) {
    const el = document.getElementById('pr-table-body');
    if (!el) return;
    if (!areas || !areas.length) {
      el.innerHTML = `
        <div style="padding:60px;text-align:center;color:var(--ink-3);">
          <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.3" viewBox="0 0 24 24" style="margin:0 auto 14px;opacity:.25;display:block;"><path stroke-linecap="round" stroke-linejoin="round" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <div style="font-size:var(--fs-md);font-weight:600;color:var(--ink-2);">No properties found</div>
        </div>`;
      return;
    }
    const initials = n => (n || '?').split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
    el.innerHTML = `
      <div class="lv-scroll">
        <table class="lv-table">
          <thead>
            <tr>
              <th>Property</th>
              <th>Client</th>
              <th>Risk</th>
              <th>Drain health</th>
              <th>Devices</th>
              <th>Open incidents</th>
              <th>SLA</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${areas.map(a => {
              const loc = [a.city, a.state].filter(Boolean).join(', ') || a.location || '';
              const pid = sid(a.property_id);
              const devices = parseInt(a.sentinel_count);
              const inc = a.open_incidents;
              const clientCell = a.user_id ? OpsModal.link('clients', a.user_id, a.client_name || a.client_email || 'Client') : (a.client_name || a.client_email || '<span class="lv-dash">—</span>');
              return `<tr class="clickable" onclick="OpsProperties.open('${pid}')" tabindex="0" onkeydown="if(event.key==='Enter'){OpsProperties.open('${pid}')}">
                <td>
                  <div class="lv-name-cell">
                    <div class="lv-avatar" style="background:linear-gradient(135deg,#16a8d3,#0d7fa0);">${initials(a.property_name)}</div>
                    <div style="min-width:0;">
                      <div class="lv-name">${a.property_name || '—'}</div>
                      ${loc ? `<span class="lv-source">${loc}</span>` : ''}
                    </div>
                  </div>
                </td>
                <td>${clientCell}</td>
                <td>${riskPill(a.risk_level || a.urgency_level)}</td>
                <td>${healthCell(a.health_score)}</td>
                <td class="lv-mono">${isNaN(devices) ? '<span class="lv-dash">—</span>' : devices}</td>
                <td>${inc == null ? '<span class="lv-dash">—</span>' : (parseInt(inc) > 0 ? `<span class="lv-mono" style="color:var(--err);font-weight:700;">${inc}</span>` : '<span class="lv-mono">0</span>')}</td>
                <td>${a.sla ? `<span class="lv-mono">${a.sla}</span>` : '<span class="lv-dash">—</span>'}</td>
                <td>${statusPill(a.status)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function riskPill(u) {
    if (!u) return '<span class="lv-dash">—</span>';
    const v = String(u).toLowerCase();
    const c = (v === 'high' || v === 'critical') ? 'danger' : (v === 'moderate' || v === 'medium') ? 'warn' : 'ok';
    return `<span class="lv-status ${c}">${u}</span>`;
  }
  function statusPill(s) {
    const v = String(s || '').toLowerCase();
    let c = 'neutral';
    if (v === 'active' || v === 'report_ready' || v === 'payment_completed') c = 'ok';
    else if (v === 'suspended' || v === 'cancelled') c = 'danger';
    else if (v.includes('inspection') || v.includes('quote') || v.includes('payment') || v === 'submitted') c = 'warn';
    return `<span class="lv-status ${c}">${(s || 'unknown').replace(/_/g, ' ')}</span>`;
  }

  function back() { if (_container) render(_container); }

  // ────────────────────────────────────────────────── FULL DETAIL SCREEN
  async function open(propertyId) {
    if (!_container) return;
    _container.innerHTML = `${SHARED_CSS}<div style="padding:60px;text-align:center;color:var(--ink-3);"><div class="loading" style="margin:0 auto 12px;"></div>Loading property…</div>`;
    try {
      const res = await OpsModal.apiGet('/properties/' + propertyId);
      const a = res.data;
      if (!a) { OpsModal.toast('Property not found', 'warning'); back(); return; }
      renderDetail(a);
    } catch (err) {
      _container.innerHTML = `${SHARED_CSS}<div style="padding:48px;text-align:center;"><div style="color:var(--err);font-weight:700;margin-bottom:8px;">Failed to load property</div><button class="btn-ghost" onclick="OpsProperties.back()">← Back to Properties</button></div>`;
    }
  }

  function section(title, bodyHTML, link, needsBackend) {
    return `<div class="pr-section">
      <div class="pr-section-h">${title}${link ? link : ''}${needsBackend ? '<span class="pr-needs">pending backend data</span>' : ''}</div>
      <div class="pr-section-b">${bodyHTML}</div>
    </div>`;
  }

  function renderDetail(a) {
    const pid = sid(a.property_id);
    const inspections = a.inspections || [];
    const quotes = a.quotes || [];
    const invoices = a.invoices || [];
    const assetsArr    = a.assets     || [];
    const devicesArr   = a.devices    || [];
    const incidentsArr = a.incidents  || [];
    const ticketsArr   = a.tickets    || [];
    const L = OpsModal.link;
    const loc = [a.city, a.state].filter(Boolean).join(', ') || a.location || '—';
    const typeLabel = (a.property_type || '').replace(/_/g, ' ') || '—';
    const d1 = v => v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
    const dS = v => v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—';
    const clientLink = a.user_id ? L('clients', a.user_id, a.client_name || a.client_email || 'Client') : (a.client_name || a.client_email || 'Unlinked');

    // ── chips & helpers ────────────────────────────────────────────────
    const st = (a.status || '').toLowerCase();
    const statusCls = st === 'active' ? 'ok' : (st === 'suspended' || st === 'cancelled') ? 'danger' : 'warn';
    const statusLabel = st === 'active' ? 'Monitored' : (a.status || 'Pending').replace(/_/g, ' ');
    const rl = String(a.risk_level || a.urgency_level || '').toLowerCase();
    const riskCls = (rl === 'high' || rl === 'critical') ? 'danger' : (rl === 'moderate' || rl === 'medium') ? 'warn' : rl ? 'ok' : 'neutral';
    const riskLabel = rl ? rl.charAt(0).toUpperCase() + rl.slice(1) + ' risk' : 'Risk n/a';

    const statPill = s => {
      const v = String(s || '').toLowerCase();
      const c = v === 'active' ? 'ok' : (v === 'suspended' || v === 'cancelled' || v === 'critical') ? 'danger' : v ? 'secondary' : 'secondary';
      return `<span class="prd-pill ${c}">${(s || '—').replace(/_/g, ' ')}</span>`;
    };
    const sevPill = s => {
      const v = String(s || '').toLowerCase();
      const c = (v === 'critical' || v === 'high') ? 'danger' : (v === 'moderate' || v === 'medium') ? 'warn' : 'ok';
      return `<span class="prd-pill ${c}">${s || '—'}</span>`;
    };
    const payPill = s => {
      const v = String(s || '').toLowerCase();
      const c = v === 'paid' ? 'ok' : v === 'overdue' ? 'danger' : 'warn';
      return `<span class="prd-pill ${c}">${s || '—'}</span>`;
    };
    const sevColor = s => {
      const v = String(s || '').toLowerCase();
      return (v === 'critical' || v === 'high') ? 'var(--err)' : (v === 'moderate' || v === 'medium') ? 'var(--warn)' : 'var(--ok)';
    };
    const emptyBox = (icon, t, s) => `<div class="prd-empty">${icon}<div class="t">${t}</div><div class="s">${s}</div></div>`;
    const iBox   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>';
    const iDoc   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>';
    const iUser  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="9" cy="7" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0113 0"/></svg>';
    const iAlert = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L2.6 17.5a1.5 1.5 0 001.3 2.3h16.2a1.5 1.5 0 001.3-2.3L13.7 3.9a1.5 1.5 0 00-2.6 0z"/></svg>';
    const iWrench= '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6l9-4 9 4M3 6l9 4 9-4M3 6v12l9 4 9-4V6"/></svg>';
    const iCheck = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>';

    // ── health ring ────────────────────────────────────────────────────
    const scoreRaw = a.health_score != null && a.health_score !== '' ? parseInt(a.health_score) : null;
    const score = scoreRaw != null && !isNaN(scoreRaw) ? Math.max(0, Math.min(100, scoreRaw)) : null;
    const C = 175.9;
    const off = (score != null ? C * (1 - score / 100) : C).toFixed(1);
    const ringColor = score == null ? 'var(--ink-3)' : score >= 80 ? 'var(--ok)' : score >= 60 ? 'var(--warn)' : 'var(--err)';
    const daysMonitored = a.created_at ? Math.max(0, Math.floor((Date.now() - new Date(a.created_at).getTime()) / 864e5)) : null;

    // ── card bodies ────────────────────────────────────────────────────
    const overviewBody = `
      <div class="prd-ring-box">
        <svg width="66" height="66" viewBox="0 0 66 66">
          <circle cx="33" cy="33" r="28" fill="none" stroke="var(--border-2)" stroke-width="6"/>
          <circle cx="33" cy="33" r="28" fill="none" stroke="${ringColor}" stroke-width="6" stroke-linecap="round"
            stroke-dasharray="${C}" stroke-dashoffset="${off}" transform="rotate(-90 33 33)"/>
        </svg>
        <div>
          <div class="prd-ring-num">${score != null ? score : '—'}</div>
          <div class="prd-ring-sub">Health score${a.created_at ? ' · as of ' + d1(a.created_at) : ''}</div>
        </div>
      </div>
      <div class="prd-stats">
        <div class="prd-stat"><div class="n">${assetsArr.length}</div><div class="l">Drainage assets</div></div>
        <div class="prd-stat"><div class="n">${devicesArr.length}</div><div class="l">Sentinel devices</div></div>
        <div class="prd-stat"><div class="n">${incidentsArr.filter(x => x.status === 'active').length}</div><div class="l">Open incidents</div></div>
        <div class="prd-stat"><div class="n">${daysMonitored != null ? daysMonitored : '—'}</div><div class="l">Days monitored</div></div>
      </div>
      ${a.issue_description ? `<div class="prd-desc">${a.issue_description}</div>` : ''}`;

    const verified = a.location_verified === true;
    const mapBody = (a.latitude && a.longitude)
      ? `<div class="prd-mapbox"><div style="text-align:center;">
           <div class="prd-mono" style="font-size:var(--fs-md);color:var(--ink);font-weight:700;">${(+a.latitude).toFixed(6)}, ${(+a.longitude).toFixed(6)}</div>
           <div style="font-size:var(--fs-xs);color:${verified ? 'var(--ok)' : 'var(--warn)'};margin-top:4px;font-weight:600;">${verified ? '✓ Confirmed location' : 'Approximate — from address, not yet confirmed'}</div>
         </div></div>
         <div class="prd-actions" style="margin-top:12px;">
           <button class="prd-btn" onclick="OpsNetwork.open('${pid}')">Open on network map →</button>
           <button class="prd-btn primary" onclick="OpsProperties.setLocation('${pid}')">${verified ? 'Adjust location' : 'Verify location'}</button>
         </div>`
      : `${emptyBox(iDoc, 'No coordinates on file', 'This property is not on the map yet. Drop its pin to plot it, and to power dispatch and per-property risk scoring.')}
         <div style="margin-top:12px;"><button class="prd-btn primary" onclick="OpsProperties.setLocation('${pid}')">Set location</button></div>`;

    const networkBody = assetsArr.length
      ? `<table class="prd-table"><thead><tr><th>Asset</th><th>Type</th><th>Health</th><th>Status</th></tr></thead>
         <tbody>${assetsArr.map(x => `<tr>
           <td class="strong">${L('assets', x.property_id, x.name || x.property_id)}</td>
           <td>${(x.type || '').replace(/_/g, ' ') || '—'}</td>
           <td class="prd-mono">${x.health_score != null ? x.health_score : '—'}</td>
           <td>${statPill(x.status)}</td>
         </tr>`).join('')}</tbody></table>`
      : emptyBox(iBox, 'No drainage assets', 'No child drainage_asset rows are linked to this property yet.');

    const devicesBody = devicesArr.length
      ? `<table class="prd-table"><thead><tr><th>Device</th><th>Sentinel ID</th><th>Status</th></tr></thead>
         <tbody>${devicesArr.map(d => `<tr>
           <td class="strong">${L('sensors', d.sensor_id, d.name || d.sensor_id)}</td>
           <td class="prd-mono">${d.sensor_id}</td>
           <td>${statPill(d.status)}</td>
         </tr>`).join('')}</tbody></table>`
      : emptyBox(iBox, 'No devices', 'No Sentinel devices cover this property via sentinel_coverage yet.');

    const maintenanceBody = ticketsArr.length
      ? ticketsArr.map(t => `<div class="prd-tl-row">
          <div class="prd-tl-icon" style="background:rgba(28,184,232,.12);color:var(--blue-hi);">${iWrench}</div>
          <div><div class="prd-tl-title">${L('maintenance', t.ticket_id, t.title || (t.work_type || 'Work order').replace(/_/g, ' '))}</div>
          <div class="prd-tl-meta">${t.assigned_team ? 'Team ' + t.assigned_team + ' · ' : ''}${(t.status || '').replace(/_/g, ' ') || '—'}</div></div>
          <div class="prd-tl-time">${dS(t.scheduled_date || t.created_at)}</div>
        </div>`).join('')
      : emptyBox(iWrench, 'No work orders', 'No maintenance work orders (tickets) scheduled for this property.');

    const incidentsBody = incidentsArr.length
      ? incidentsArr.map(al => `<div class="prd-inc">
          <span class="sev" style="background:${sevColor(al.severity)};"></span>
          <div><div class="it">${L('alerts', al.alert_id, (al.alert_type || 'Alert').replace(/_/g, ' '))} · ${al.severity || ''}</div>
          <div class="im">${al.alert_id} · ${(al.status || '')} · ${dS(al.created_at)}</div></div>
        </div>`).join('')
      : emptyBox(iAlert, 'No incidents', 'No alerts recorded against this property.');

    const reportsBody = inspections.length
      ? `<table class="prd-table"><thead><tr><th>Inspection</th><th>Status</th><th>Team</th><th>Score</th><th>Date</th></tr></thead>
         <tbody>${inspections.map(i => `<tr>
           <td class="strong prd-mono">${i.inspection_id}</td>
           <td>${statPill(i.status)}</td>
           <td>${i.assigned_team ? L('teams', i.assigned_team, i.assigned_team) : '—'}</td>
           <td class="prd-mono">${i.drainage_condition_score ? i.drainage_condition_score + '/10' : '—'}</td>
           <td class="prd-mono">${dS(i.scheduled_date)}</td>
         </tr>`).join('')}</tbody></table>`
      : emptyBox(iDoc, 'No reports', 'No inspection reports carry this property_id yet.');

    const contactsBody = (a.client_name || a.client_email || a.client_phone)
      ? `<div class="prd-fact"><span class="k">Client</span><span class="v">${clientLink}</span></div>
         <div class="prd-fact"><span class="k">Email</span><span class="v">${a.client_email || '—'}</span></div>
         <div class="prd-fact"><span class="k">Phone</span><span class="v">${a.client_phone || '—'}</span></div>`
      : emptyBox(iUser, 'No contact on file', 'This property has no linked client account holding a contact email or phone.');

    const billingBody = (invoices.length || quotes.length)
      ? `<table class="prd-table"><thead><tr><th>Ref</th><th>Amount</th><th>Status</th><th>Due</th></tr></thead>
         <tbody>${invoices.map(inv => `<tr>
           <td class="strong">${L('billing', inv.invoice_id, inv.invoice_id)}</td>
           <td class="prd-mono">₦${Number(inv.total_amount || 0).toLocaleString()}</td>
           <td>${payPill(inv.payment_status)}</td>
           <td class="prd-mono">${dS(inv.due_date)}</td>
         </tr>`).join('')}${quotes.map(q => `<tr>
           <td class="strong prd-mono">${q.quote_id}</td>
           <td class="prd-mono">₦${Number(q.total_monthly || 0).toLocaleString()}/mo</td>
           <td>${statPill(q.status)}</td>
           <td>—</td>
         </tr>`).join('')}</tbody></table>`
      : emptyBox(iDoc, 'No billing', 'No invoices or service quotes exist for this property yet.');

    // Timeline — derived from real records, newest first
    const events = [];
    if (a.created_at) events.push({ t: 'Property created', m: a.property_name || '', d: a.created_at, bg: 'rgba(28,184,232,.12)', c: 'var(--blue-hi)', ic: iCheck });
    inspections.forEach(i => events.push({ t: 'Inspection ' + (i.status || ''), m: i.drainage_condition_score ? 'Score ' + i.drainage_condition_score + '/10' : '', d: i.scheduled_date, bg: 'rgba(31,157,91,.12)', c: 'var(--ok)', ic: iCheck }));
    ticketsArr.forEach(t => events.push({ t: t.title || (t.work_type || 'Work order').replace(/_/g, ' '), m: (t.status || '').replace(/_/g, ' '), d: t.scheduled_date || t.created_at, bg: 'rgba(28,184,232,.12)', c: 'var(--blue-hi)', ic: iWrench }));
    incidentsArr.forEach(al => events.push({ t: (al.alert_type || 'Alert').replace(/_/g, ' '), m: al.severity || '', d: al.created_at, bg: 'rgba(217,70,60,.12)', c: 'var(--err)', ic: iAlert }));
    events.sort((x, y) => new Date(y.d || 0) - new Date(x.d || 0));
    const timelineBody = events.length
      ? events.slice(0, 10).map(e => `<div class="prd-tl-row">
          <div class="prd-tl-icon" style="background:${e.bg};color:${e.c};">${e.ic}</div>
          <div><div class="prd-tl-title">${e.t}</div><div class="prd-tl-meta">${e.m || '—'}</div></div>
          <div class="prd-tl-time">${dS(e.d)}</div>
        </div>`).join('')
      : emptyBox(iCheck, 'No timeline yet', 'Events appear here as inspections, work orders and incidents are recorded.');

    // ── section nav + cards ────────────────────────────────────────────
    const SECTIONS = [
      ['overview', 'Overview', 'properties · asset_class: ' + (a.asset_class || 'customer_property'), overviewBody],
      ['map', 'Estate map', 'lat/long + coverage', mapBody],
      ['network', 'Drain network', 'child rows · drainage_asset', networkBody],
      ['devices', 'Devices', 'via sentinel_coverage', devicesBody],
      ['maintenance', 'Maintenance', 'tickets · work_type', maintenanceBody],
      ['incidents', 'Incidents', 'alerts', incidentsBody],
      ['reports', 'Reports', 'inspection_reports', reportsBody],
      ['contacts', 'Contacts', 'client account', contactsBody],
      ['billing', 'Billing', 'invoices · service_quotes', billingBody],
      ['timeline', 'Timeline', 'derived events', timelineBody],
    ];
    const navHTML = SECTIONS.map((s, idx) =>
      `<a class="${idx === 0 ? 'active' : ''}" onclick="this.parentNode.querySelectorAll('a').forEach(function(x){x.classList.remove('active')});this.classList.add('active');var el=document.getElementById('prd-${s[0]}');if(el)el.scrollIntoView({behavior:'smooth',block:'start'})">${s[1]}</a>`
    ).join('');
    const cardsHTML = SECTIONS.map(s =>
      `<div class="prd-card" id="prd-${s[0]}">
         <div class="prd-card-head"><h2>${s[1]}</h2><span class="cmeta">${s[2]}</span></div>
         ${s[3]}
       </div>`
    ).join('');

    // ── sidebar ────────────────────────────────────────────────────────
    const openTickets = ticketsArr.filter(t => !['resolved', 'closed', 'completed'].includes(String(t.status || '').toLowerCase())).length;
    const openAlerts = incidentsArr.filter(x => x.status === 'active').length;
    const fact = (k, v) => `<div class="prd-fact"><span class="k">${k}</span><span class="v">${v}</span></div>`;
    const sidebar = `
      <div class="prd-card">
        <div class="prd-card-head"><h2 style="font-size:var(--fs-sm);">Quick facts</h2></div>
        ${fact('Asset code', `<span class="prd-mono">${a.asset_code || '—'}</span>`)}
        ${fact('Property type', typeLabel)}
        ${fact('Asset class', `<span class="prd-mono">${a.asset_class || 'customer_property'}</span>`)}
        ${fact('City / state', loc)}
        ${fact('Urgency', a.urgency_level || 'Standard')}
        ${fact('Status', `<span style="color:var(--${statusCls === 'ok' ? 'ok' : statusCls === 'danger' ? 'err' : 'warn'});">${statusLabel}</span>`)}
        ${fact('Client account', a.user_id ? clientLink : '<span style="color:var(--ink-3);">Not linked</span>')}
        ${a.parent_property_id ? fact('Parent estate', L('properties', a.parent_property_id, a.parent_name || a.parent_property_id)) : ''}
        ${fact('Created', `<span class="prd-mono">${d1(a.created_at)}</span>`)}
      </div>
      <div class="prd-card">
        <div class="prd-card-head"><h2 style="font-size:var(--fs-sm);">Related</h2></div>
        ${fact('Drainage assets', assetsArr.length)}
        ${fact('Sentinel devices', devicesArr.length)}
        ${fact('Open alerts', openAlerts ? `<span style="color:var(--warn);">${openAlerts}</span>` : '0')}
        ${fact('Open tickets', openTickets)}
        ${fact('SLA', a.sla || '—')}
      </div>`;

    const actions = [
      canMng() ? `<button class="prd-btn" onclick="OpsProperties.editArea('${pid}')">Edit</button>` : '',
      `<button class="prd-btn" onclick="OpsNetwork.open('${pid}')">Network</button>`,
      (a.status === 'submitted' && canMng()) ? `<button class="prd-btn primary" onclick="OpsProperties.scheduleInspection('${pid}','${(a.property_name || '').replace(/'/g, "\\'")}')">Schedule inspection</button>` : '',
      _isAdmin ? `<button class="prd-btn danger" onclick="OpsProperties.deleteArea('${pid}','${(a.property_name || '').replace(/'/g, "\\'")}')">Delete</button>` : '',
    ].filter(Boolean).join('');

    _container.innerHTML = `
      ${SHARED_CSS}${PRD_CSS}
      <div class="prd">
        <div class="prd-crumb">
          <span class="lnk" onclick="OpsProperties.back()">Properties</span>
          <span class="sep">/</span>
          <span class="cur">${a.property_name || 'Property'}</span>
        </div>

        <div class="prd-card prd-header">
          <div class="prd-header-main">
            <div class="prd-header-top">
              <span class="prd-title">${a.property_name || 'Property'}</span>
              <span class="prd-chip ${statusCls}"><span class="dot"></span>${statusLabel}</span>
              <span class="prd-chip ${riskCls}">${riskLabel}</span>
            </div>
            <div class="prd-meta">
              <span><b>Type</b>${typeLabel}</span>
              <span><b>Asset code</b>${a.asset_code || '—'}</span>
              <span><b>Location</b>${loc}</span>
              <span><b>Client</b>${clientLink}</span>
              <span><b>Submitted</b>${d1(a.created_at)}</span>
            </div>
          </div>
          <div class="prd-actions">${actions}</div>
        </div>

        <div class="prd-secnav">${navHTML}</div>

        <div class="prd-grid">
          <div class="prd-main">${cardsHTML}</div>
          <div class="prd-side">${sidebar}</div>
        </div>
      </div>
    `;
  }

  // ────────────────────────────────────────────────────────── ACTIONS
  async function editArea(propertyId) {
    try {
      const res = await OpsModal.apiGet('/properties/' + propertyId);
      const a = res.data;
      OpsModal.open('Edit Property', `
        ${OpsModal.field('Property Name', 'property_name', 'text', a.property_name || '')}
        ${OpsModal.row([
          OpsModal.field('Pipeline Status', 'status', 'select', a.status || 'submitted', {
            options: [
              { value: 'submitted', label: 'Submitted' }, { value: 'inspection_scheduled', label: 'Inspection Scheduled' },
              { value: 'inspection_ongoing', label: 'Inspection Ongoing' }, { value: 'report_ready', label: 'Report Ready' },
              { value: 'quote_sent', label: 'Quote Sent' }, { value: 'payment_pending', label: 'Payment Pending' },
              { value: 'payment_completed', label: 'Payment Completed' }, { value: 'deployment_scheduled', label: 'Deployment Scheduled' },
              { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }, { value: 'cancelled', label: 'Cancelled' },
            ]
          }),
          OpsModal.field('Urgency', 'urgency_level', 'select', a.urgency_level || 'medium', {
            options: [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'critical', label: 'Critical' }]
          }),
        ])}
        ${OpsModal.field('Notes', 'notes', 'textarea', a.notes || '', { required: false, rows: 3 })}
        ${OpsModal.row([
          OpsModal.field('Monthly Fee (₦)', 'monthly_fee', 'number', a.monthly_fee || '', { required: false, placeholder: 'e.g. 185000' }),
          OpsModal.field('Network Uptime (%)', 'network_uptime', 'number', a.network_uptime || '', { required: false, placeholder: 'e.g. 98.5' }),
        ])}
      `, [
        { label: 'Cancel', onclick: 'OpsModal.close()', class: 'btn-ghost' },
        { label: 'Save Changes', onclick: `OpsProperties.saveArea('${propertyId}')`, class: 'btn-primary', id: 'modal-save-btn' },
      ]);
    } catch { OpsModal.toast('Failed to load property', 'critical'); }
  }

  async function saveArea(propertyId) {
    const data = OpsModal.getFormData();
    OpsModal.setLoading('modal-save-btn', true);
    try {
      await OpsModal.apiPut('/properties/' + propertyId, data);
      if (data.monthly_fee && parseFloat(data.monthly_fee) > 0) {
        try {
          await OpsModal.apiPost('/properties/' + propertyId + '/generate-invoice', { amount: parseFloat(data.monthly_fee), description: 'FlowGuard DaaS — Monthly Service Fee' });
        } catch (e) { console.warn('Invoice generation failed:', e.message); }
      }
      OpsModal.close();
      OpsModal.toast('Property updated successfully', 'nominal');
      open(propertyId);
    } catch (err) {
      OpsModal.toast('Failed to update: ' + err.message, 'critical');
      OpsModal.setLoading('modal-save-btn', false);
    }
  }

  function deleteArea(propertyId, name) {
    OpsModal.confirm(
      `Permanently delete property "${name}"? All inspections, quotes, and invoices linked to this property will also be removed.`,
      async function () {
        OpsModal.setLoading('modal-confirm-btn', true);
        try {
          await OpsModal.apiDelete('/properties/' + propertyId);
          OpsModal.close();
          OpsModal.toast(`Property "${name}" deleted`, 'nominal');
          back();
        } catch (err) {
          OpsModal.toast('Delete failed: ' + err.message, 'critical');
          OpsModal.setLoading('modal-confirm-btn', false);
        }
      }
    );
  }

  async function scheduleInspection(propertyId, propertyName) {
    let teams = [];
    try { const res = await OpsModal.apiGet('/teams'); teams = res.data || res.teams || []; } catch {}
    const teamOptions = teams.length ? teams.map(t => ({ value: t.team_id || t.id, label: t.team_name || t.name })) : [{ value: '', label: 'No teams available' }];
    OpsModal.open(`Schedule Inspection — ${propertyName || 'Property'}`, `
      ${OpsModal.field('Scheduled Date', 'scheduled_date', 'date', '')}
      ${OpsModal.field('Assign Team', 'team_id', 'select', '', { options: teamOptions, required: false })}
      ${OpsModal.field('Inspector Notes (optional)', 'notes', 'textarea', '', { required: false, rows: 3, placeholder: 'Access instructions, key contacts, equipment needed…' })}
      ${OpsModal.field('Priority', 'priority', 'select', 'standard', { options: [{ value: 'standard', label: 'Standard' }, { value: 'priority', label: 'Priority' }, { value: 'urgent', label: 'Urgent' }] })}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()', class: 'btn-ghost' },
      { label: 'Schedule Inspection', onclick: `OpsProperties.confirmSchedule('${propertyId}')`, class: 'btn-primary', id: 'modal-save-btn' },
    ]);
  }

  async function confirmSchedule(propertyId) {
    const data = OpsModal.getFormData();
    if (!data.scheduled_date) { OpsModal.toast('Please select a date', 'warning'); return; }
    OpsModal.setLoading('modal-save-btn', true);
    try {
      await OpsModal.apiPost('/properties/' + propertyId + '/schedule-inspection', data);
      OpsModal.close();
      OpsModal.toast('Inspection scheduled successfully', 'nominal');
      open(propertyId);
    } catch (err) {
      OpsModal.toast('Failed to schedule: ' + err.message, 'critical');
      OpsModal.setLoading('modal-save-btn', false);
    }
  }

  // ────────────────────────────────────── LOCATION (pin tool)
  // Coordinates are the source of truth for the map, dispatch and risk scoring.
  // Addresses geocode to a point on registration, but a geocoder can miss by a
  // district — so an operator can drop/drag the pin to the exact spot and mark
  // it confirmed. No client-side geocoding (CSP blocks Nominatim from the
  // browser): the pin + editable lat/long are the interface.
  let _leafletP = null;
  function ensureLeaflet() {
    return _leafletP || (_leafletP = new Promise(res => {
      if (window.L) return res();
      if (!document.getElementById('fg-leaflet-css')) {
        const c = document.createElement('link'); c.id = 'fg-leaflet-css'; c.rel = 'stylesheet';
        c.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(c);
      }
      const s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.onload = res; document.head.appendChild(s);
    }));
  }

  async function setLocation(propertyId) {
    let a;
    try { a = (await OpsModal.apiGet('/properties/' + propertyId)).data; }
    catch { return OpsModal.toast('Failed to load property', 'critical'); }
    const hasC = a.latitude != null && a.longitude != null;
    const lat0 = hasC ? Number(a.latitude) : 6.5244;
    const lon0 = hasC ? Number(a.longitude) : 3.3792;
    const inpCss = 'width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid var(--border);border-radius:8px;font-family:var(--ff-mono,monospace);font-size:var(--fs-sm);color:var(--ink);background:var(--surface);';
    OpsModal.open('Set property location', `
      <div style="font-size:var(--fs-sm);color:var(--ink-3);margin-bottom:10px;line-height:1.5;">
        Drag the pin (or click the map) to the exact gate. Coordinates are the source of truth for the map, dispatch and risk scoring — the address is just for humans.
      </div>
      <div id="plm-map" style="height:320px;border-radius:12px;overflow:hidden;border:1px solid var(--border);background:var(--surface-2);"></div>
      <div style="display:flex;gap:10px;margin-top:12px;">
        <div style="flex:1;"><div style="font-size:var(--fs-2xs);text-transform:uppercase;letter-spacing:.5px;color:var(--ink-3);font-weight:700;margin-bottom:4px;">Latitude</div><input id="plm-lat" style="${inpCss}" value="${lat0.toFixed(6)}"></div>
        <div style="flex:1;"><div style="font-size:var(--fs-2xs);text-transform:uppercase;letter-spacing:.5px;color:var(--ink-3);font-weight:700;margin-bottom:4px;">Longitude</div><input id="plm-lon" style="${inpCss}" value="${lon0.toFixed(6)}"></div>
      </div>
      ${hasC && a.location_verified ? '' : `<div style="margin-top:10px;font-size:var(--fs-xs);color:var(--warn);font-weight:600;">${hasC ? 'This pin came from the address and is unconfirmed — drag it to verify.' : 'No coordinates yet — place the pin to put this property on the map.'}</div>`}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()', class: 'btn-ghost' },
      { label: 'Save location', onclick: `OpsProperties.saveLocation('${propertyId}')`, class: 'btn-primary', id: 'modal-save-btn' },
    ]);
    await ensureLeaflet();
    const holder = document.getElementById('plm-map');
    if (!holder || !window.L) return;
    const map = L.map(holder, { center: [lat0, lon0], zoom: hasC ? 15 : 11, attributionControl: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 19 }).addTo(map);
    const mk = L.marker([lat0, lon0], { draggable: true }).addTo(map);
    const latI = document.getElementById('plm-lat'), lonI = document.getElementById('plm-lon');
    const sync = ll => { latI.value = ll.lat.toFixed(6); lonI.value = ll.lng.toFixed(6); };
    mk.on('drag', e => sync(e.target.getLatLng()));
    map.on('click', e => { mk.setLatLng(e.latlng); sync(e.latlng); });
    const fromInputs = () => { const la = parseFloat(latI.value), lo = parseFloat(lonI.value); if (Number.isFinite(la) && Number.isFinite(lo)) { mk.setLatLng([la, lo]); map.panTo([la, lo]); } };
    latI.addEventListener('change', fromInputs); lonI.addEventListener('change', fromInputs);
    setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 60);
  }

  async function saveLocation(propertyId) {
    const la = parseFloat((document.getElementById('plm-lat') || {}).value);
    const lo = parseFloat((document.getElementById('plm-lon') || {}).value);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return OpsModal.toast('Drop the pin first', 'critical');
    OpsModal.setLoading('modal-save-btn', true);
    try {
      await OpsModal.apiPut('/properties/' + propertyId + '/location', { latitude: la, longitude: lo });
      OpsModal.close();
      OpsModal.toast('Location saved', 'nominal');
      open(propertyId);
    } catch (err) {
      OpsModal.toast('Failed to save location: ' + err.message, 'critical');
      OpsModal.setLoading('modal-save-btn', false);
    }
  }

  return { render, filterStage, search, open, back, editArea, saveArea, deleteArea, scheduleInspection, confirmSchedule, setLocation, saveLocation };

})();
