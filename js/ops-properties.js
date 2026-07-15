// ============================================
// OPS PROPERTIES MODULE
// Submitted areas — full inspection pipeline.
// Rules: whole row opens a FULL detail screen (no pop-up), no "View"
// button, and every list column also appears in the detail view.
// ============================================

const OpsProperties = (function () {
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
      <div class="pr-table-card">
        <div class="pr-table-head">
          <div class="pr-table-title" id="pr-table-title">All Properties</div>
          <div class="pr-search-wrap">
            <svg class="pr-search-icon" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35"/></svg>
            <input class="pr-search" id="pr-search" placeholder="Search properties…" oninput="OpsProperties.search(this.value)">
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
    const titleMap = { all: 'All Properties', submitted: 'Awaiting Review', inspection: 'In Inspection', report: 'Report Ready', billing: 'Quote / Payment', active: 'Active Properties' };
    const titleEl = document.getElementById('pr-table-title');
    if (titleEl) titleEl.textContent = titleMap[stage] || 'All Properties';
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
    // Columns per spec: Property Name, Client, Location, Risk Level, Drain Health, Devices, Open Incidents, SLA, Status
    el.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="ops-table">
          <thead>
            <tr>
              <th>Property Name</th>
              <th>Client</th>
              <th>Location</th>
              <th>Risk Level</th>
              <th style="text-align:center;">Drain Health</th>
              <th style="text-align:center;">Devices</th>
              <th style="text-align:center;">Open Incidents</th>
              <th>SLA</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${areas.map(a => {
              const loc = [a.city, a.state].filter(Boolean).join(', ') || a.location || '—';
              const pid = sid(a.property_id);
              const devices = parseInt(a.sentinel_count);
              const inc = a.open_incidents;
              return `<tr class="clickable" onclick="OpsProperties.open('${pid}')" tabindex="0" onkeydown="if(event.key==='Enter'){OpsProperties.open('${pid}')}">
                <td class="bright trunc" title="${(a.property_name || '').replace(/"/g, '&quot;')}">${a.property_name || '—'}</td>
                <td class="trunc" style="font-size:var(--fs-base);max-width:160px;" title="${(a.client_name || a.client_email || '').replace(/"/g, '&quot;')}">${a.client_name || a.client_email || '—'}</td>
                <td style="font-size:var(--fs-sm);">${loc}</td>
                <td>${riskBadge(a.risk_level || a.urgency_level)}</td>
                <td style="text-align:center;">${healthCell(a.health_score)}</td>
                <td class="num" style="text-align:center;font-weight:700;">${isNaN(devices) ? '—' : devices}</td>
                <td style="text-align:center;">${inc == null ? '<span style="color:var(--ink-4);">—</span>' : (parseInt(inc) > 0 ? `<span style="color:var(--err);font-weight:700;font-family:var(--ff-d);">${inc}</span>` : '<span style="color:var(--ink-4);">0</span>')}</td>
                <td>${a.sla ? `<span class="status-badge nominal">${a.sla}</span>` : '<span style="color:var(--ink-4);">—</span>'}</td>
                <td>${pipelineBadge(a.status)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
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
    const loc = [a.city, a.state].filter(Boolean).join(', ') || a.location || '—';
    const field = (k, v) => `<div class="pr-field"><div class="k">${k}</div><div class="v">${v}</div></div>`;

    // Overview — includes every list column + more
    const overview = `<div class="pr-grid">
      ${field('Property Name', a.property_name || '—')}
      ${field('Type', (a.property_type || '').replace(/_/g, ' ') || '—')}
      ${field('Client', a.client_name || a.client_email || '—')}
      ${field('Location', loc)}
      ${field('Risk Level', riskBadge(a.risk_level || a.urgency_level))}
      ${field('Drain Health', healthCell(a.health_score))}
      ${field('Devices', isNaN(parseInt(a.sentinel_count)) ? '—' : parseInt(a.sentinel_count))}
      ${field('Open Incidents', a.open_incidents == null ? '—' : a.open_incidents)}
      ${field('SLA', a.sla ? `<span class="status-badge nominal">${a.sla}</span>` : '—')}
      ${field('Status', pipelineBadge(a.status))}
      ${field('Submitted', fmtDate(a.created_at))}
    </div>${a.issue_description ? `<div style="margin-top:14px;"><div class="pr-field"><div class="k">Description</div><div class="v" style="font-weight:400;white-space:pre-wrap;line-height:1.5;">${a.issue_description}</div></div></div>` : ''}`;

    const estateMap = (a.latitude && a.longitude)
      ? `<div class="pr-grid">${field('Latitude', a.latitude)}${field('Longitude', a.longitude)}</div><div style="margin-top:10px;"><a class="btn-ghost" style="text-decoration:none;padding:7px 12px;" onclick="switchTab('network')">Open on network map →</a></div>`
      : '<div class="pr-empty">No coordinates on file for this property yet.</div>';

    const drainNetwork = `<div class="pr-grid">
      ${field('Assets', isNaN(parseInt(a.asset_count)) ? '—' : parseInt(a.asset_count))}
      ${field('Sentinel devices', isNaN(parseInt(a.sentinel_count)) ? '—' : parseInt(a.sentinel_count))}
      ${field('Monitored', isNaN(parseInt(a.monitored_assets)) ? '—' : parseInt(a.monitored_assets))}
    </div><div style="margin-top:10px;"><a class="btn-ghost" style="text-decoration:none;padding:7px 12px;" onclick="OpsNetwork.open('${pid}')">Open drainage network →</a></div>`;

    const maintenance = inspections.length ? `
      <div style="overflow-x:auto;"><table class="ops-table">
        <thead><tr><th>ID</th><th>Status</th><th>Date</th><th>Team</th><th>Risk</th><th>Score</th></tr></thead>
        <tbody>${inspections.map(i => `<tr>
          <td style="font-family:var(--ff-m);font-size:var(--fs-sm);">${i.inspection_id}</td>
          <td>${inspBadge(i.status)}</td>
          <td style="font-size:var(--fs-sm);">${i.scheduled_date ? new Date(i.scheduled_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</td>
          <td style="font-size:var(--fs-sm);">${i.assigned_team || '—'}</td>
          <td>${i.flood_risk_level ? riskBadge(i.flood_risk_level) : '—'}</td>
          <td style="font-family:var(--ff-d);font-weight:700;">${i.drainage_condition_score ? i.drainage_condition_score + '/10' : '—'}</td>
        </tr>`).join('')}</tbody></table></div>` : '<div class="pr-empty">No inspections or work orders yet.</div>';

    const contacts = `<div class="pr-grid">
      ${field('Client', a.client_name || '—')}
      ${field('Contact Person', dash(a.contact_person_name))}
      ${field('Phone', dash(a.client_phone))}
      ${field('Email', dash(a.client_email))}
    </div>`;

    const billing = (quotes.length || invoices.length) ? `
      ${quotes.length ? `<div style="font-size:var(--fs-2xs);font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:var(--ink-3);margin-bottom:6px;">Quotes</div>
      <div style="overflow-x:auto;margin-bottom:14px;"><table class="ops-table"><thead><tr><th>Quote ID</th><th>Monthly</th><th>Status</th></tr></thead>
      <tbody>${quotes.map(q => `<tr><td style="font-family:var(--ff-m);font-size:var(--fs-sm);">${q.quote_id}</td><td style="font-family:var(--ff-d);font-weight:700;">₦${Number(q.total_monthly || 0).toLocaleString()}</td><td>${pipelineBadge(q.status)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${invoices.length ? `<div style="font-size:var(--fs-2xs);font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:var(--ink-3);margin-bottom:6px;">Invoices</div>
      <div style="overflow-x:auto;"><table class="ops-table"><thead><tr><th>Invoice</th><th>Amount</th><th>Status</th><th>Due</th></tr></thead>
      <tbody>${invoices.map(inv => `<tr><td style="font-family:var(--ff-m);font-size:var(--fs-sm);">${inv.invoice_id}</td><td style="font-family:var(--ff-d);font-weight:700;">₦${Number(inv.total_amount || 0).toLocaleString()}</td><td><span class="status-badge ${inv.payment_status === 'paid' ? 'nominal' : inv.payment_status === 'overdue' ? 'critical' : 'watch'}">${inv.payment_status}</span></td><td style="font-size:var(--fs-sm);">${inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ` : '<div class="pr-empty">No quotes or invoices yet.</div>';

    const timeline = `<div class="pr-empty">Submitted ${fmtDate(a.created_at)}${inspections.length ? ' · ' + inspections.length + ' inspection(s)' : ''}.</div>`;

    const actions = [
      `<button class="btn-ghost" onclick="OpsProperties.editArea('${pid}')">Edit</button>`,
      `<button class="btn-ghost" style="color:var(--blue-hi);border-color:var(--blue-dim);" onclick="OpsNetwork.open('${pid}')">Network</button>`,
      a.status === 'submitted' ? `<button class="btn-primary" onclick="OpsProperties.scheduleInspection('${pid}','${(a.property_name || '').replace(/'/g, "\\'")}')">Schedule</button>` : '',
      _isAdmin ? `<button class="btn-ghost" style="color:var(--err);border-color:rgba(220,38,38,.2);" onclick="OpsProperties.deleteArea('${pid}','${(a.property_name || '').replace(/'/g, "\\'")}')">Delete</button>` : '',
    ].filter(Boolean).join('');

    _container.innerHTML = `
      ${SHARED_CSS}
      <div class="pr-detail-top">
        <button class="pr-back" onclick="OpsProperties.back()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          Properties
        </button>
        <div>
          <div class="pr-detail-name">${a.property_name || 'Property'}</div>
          <div class="pr-detail-meta">${(a.property_type || '').replace(/_/g, ' ') || '—'} · ${loc} · ${a.client_name || a.client_email || '—'}</div>
        </div>
        <div class="pr-detail-actions">${actions}</div>
      </div>

      ${section('Overview', overview)}
      ${section('Estate Map', estateMap, '', !(a.latitude && a.longitude))}
      ${section('Drain Network', drainNetwork)}
      ${section('Devices', '<div class="pr-empty">Device list opens from the network view. <a onclick="OpsNetwork.open(\'' + pid + '\')" style="color:var(--blue-hi);cursor:pointer;">Open →</a></div>', '', true)}
      ${section('Assets', '<div class="pr-empty">Asset list opens from the network view. <a onclick="OpsNetwork.open(\'' + pid + '\')" style="color:var(--blue-hi);cursor:pointer;">Open →</a></div>', '', true)}
      ${section('Maintenance', maintenance)}
      ${section('Incidents', '<div class="pr-empty">No incidents linked in this response.</div>', '', true)}
      ${section('Reports', '<div class="pr-empty">No reports linked in this response.</div>', '', true)}
      ${section('Documents', '<div class="pr-empty">No documents uploaded.</div>', '', true)}
      ${section('Contacts', contacts)}
      ${section('Billing', billing)}
      ${section('Timeline', timeline, '', true)}
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

  return { render, filterStage, search, open, back, editArea, saveArea, deleteArea, scheduleInspection, confirmSchedule };

})();
