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
      <div class="cl-table-wrap">
        <div class="cl-table-head">
          <div class="cl-table-title">All Clients</div>
          <div class="cl-search-wrap">
            <svg class="cl-search-icon" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35"/></svg>
            <input class="cl-search-input" id="cl-search" placeholder="Search clients…" oninput="OpsClients.search(this.value)">
          </div>
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

  function search(q) {
    const term = q.trim().toLowerCase();
    const filtered = term
      ? _all.filter(c => (c.full_name || '').toLowerCase().includes(term) || (c.email || '').toLowerCase().includes(term))
      : _all;
    if (_pg) _pg.update(filtered);
    else renderTable(filtered);
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
    // Columns per spec: Client, Contact, Industry, Properties, Active Contracts, MRR, SLA, Status
    el.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="ops-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Contact</th>
              <th>Industry</th>
              <th style="text-align:center;">Properties</th>
              <th style="text-align:center;">Active Contracts</th>
              <th style="text-align:right;">MRR</th>
              <th>SLA</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${clients.map(c => `
              <tr class="clickable" onclick="OpsClients.open(${c.client_id})" tabindex="0" onkeydown="if(event.key==='Enter'){OpsClients.open(${c.client_id})}">
                <td>
                  <div class="cl-name-wrap">
                    <div class="cl-avatar" style="background:${avatarColor(c.full_name)};">${initials(c.full_name)}</div>
                    <div style="min-width:0;">
                      <div class="cl-name">${c.full_name || '—'}</div>
                      <div class="cl-email" title="${(c.email || '').replace(/"/g, '&quot;')}">${c.email || ''}</div>
                    </div>
                  </div>
                </td>
                <td class="num" style="font-size:var(--fs-base);">${dash(c.phone)}</td>
                <td>${dash(c.industry)}</td>
                <td class="num" style="text-align:center;font-weight:700;">${c.submitted_areas || 0}</td>
                <td style="text-align:center;">${parseInt(c.active_areas) > 0 ? `<span style="color:var(--ok);font-weight:700;font-family:var(--ff-d);">${c.active_areas}</span>` : '<span style="color:var(--ink-4);">0</span>'}</td>
                <td class="num" style="text-align:right;font-family:var(--ff-d);font-weight:700;">${money(c.mrr)}</td>
                <td>${c.sla ? `<span class="status-badge nominal">${c.sla}</span>` : '<span style="color:var(--ink-4);">—</span>'}</td>
                <td>${statusBadge(c.status, c.is_active)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
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

    const field = (k, v) => `<div class="cl-field"><div class="k">${k}</div><div class="v">${v}</div></div>`;

    // Company Information — includes every list-view field + more
    const companyInfo = `<div class="cl-grid">
      ${field('Client', c.full_name || '—')}
      ${field('Email', c.email || '—')}
      ${field('Phone (contact)', dash(c.phone))}
      ${field('Industry', dash(c.industry))}
      ${field('Properties', areas.length)}
      ${field('Active Contracts', activeAreas.length)}
      ${field('MRR', money(c.mrr))}
      ${field('SLA', c.sla ? `<span class="status-badge nominal">${c.sla}</span>` : '—')}
      ${field('Status', statusBadge(c.status, c.is_active))}
      ${field('Joined', fmtDate(c.created_at))}
      ${field('Last Login', c.last_login ? OpsModal.fmtDateTime(c.last_login) : 'Never')}
    </div>`;

    const contacts = `<div class="cl-grid">
      ${field('Primary Contact', c.full_name || '—')}
      ${field('Email', c.email || '—')}
      ${field('Phone', dash(c.phone))}
    </div>`;

    const properties = areas.length ? `
      <div style="overflow-x:auto;"><table class="ops-table">
        <thead><tr><th>Property</th><th>Type</th><th>Location</th><th>Pipeline</th><th>Inspection</th></tr></thead>
        <tbody>${areas.map(a => `<tr>
          <td class="bright">${a.property_name || '—'}</td>
          <td style="font-size:var(--fs-sm);">${(a.property_type || '').replace(/_/g, ' ') || '—'}</td>
          <td style="font-size:var(--fs-sm);">${[a.city, a.state].filter(Boolean).join(', ') || '—'}</td>
          <td>${pipelineBadge(a.status)}</td>
          <td>${a.inspection_status ? inspBadge(a.inspection_status) : '<span style="color:var(--ink-4);font-size:var(--fs-sm);">Not scheduled</span>'}</td>
        </tr>`).join('')}</tbody></table></div>` : '<div class="cl-empty">No properties submitted yet.</div>';

    const contracts = activeAreas.length ? `
      <div style="overflow-x:auto;"><table class="ops-table">
        <thead><tr><th>Property</th><th>Type</th><th>Location</th><th>Status</th></tr></thead>
        <tbody>${activeAreas.map(a => `<tr>
          <td class="bright">${a.property_name || '—'}</td>
          <td style="font-size:var(--fs-sm);">${(a.property_type || '').replace(/_/g, ' ') || '—'}</td>
          <td style="font-size:var(--fs-sm);">${[a.city, a.state].filter(Boolean).join(', ') || '—'}</td>
          <td>${pipelineBadge(a.status)}</td>
        </tr>`).join('')}</tbody></table></div>` : '<div class="cl-empty">No active contracts.</div>';

    const billing = invoices.length ? `
      <div style="overflow-x:auto;"><table class="ops-table">
        <thead><tr><th>Invoice</th><th>Amount</th><th>Status</th><th>Due</th></tr></thead>
        <tbody>${invoices.map(inv => `<tr>
          <td class="bright" style="font-family:var(--ff-m);font-size:var(--fs-sm);">${inv.invoice_id}</td>
          <td style="font-family:var(--ff-d);font-weight:700;">₦${Number(inv.total_amount || 0).toLocaleString()}</td>
          <td><span class="status-badge ${inv.payment_status === 'paid' ? 'nominal' : inv.payment_status === 'overdue' ? 'critical' : 'watch'}">${inv.payment_status}</span></td>
          <td style="font-size:var(--fs-sm);">${inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</td>
        </tr>`).join('')}</tbody></table></div>` : '<div class="cl-empty">No invoices.</div>';

    const timeline = `<div class="cl-empty">Joined ${fmtDate(c.created_at)}${c.last_login ? ' · Last login ' + OpsModal.fmtDateTime(c.last_login) : ''}.</div>`;

    _container.innerHTML = `
      ${SHARED_CSS}
      <div class="cl-detail-top">
        <button class="cl-back" onclick="OpsClients.back()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          Clients
        </button>
        <div class="cl-detail-id">
          <div class="cl-avatar" style="width:42px;height:42px;border-radius:11px;font-size:var(--fs-md);background:${avatarColor(c.full_name)};">${initials(c.full_name)}</div>
          <div>
            <div class="cl-detail-name">${c.full_name || 'Client'}</div>
            <div class="cl-detail-meta">${c.email || '—'} · ${dash(c.phone)}</div>
          </div>
        </div>
        <div class="cl-detail-actions">
          <button class="btn-ghost" onclick="OpsClients.editClient(${c.client_id})">Edit</button>
          ${_isAdmin ? `<button class="btn-ghost" style="color:var(--err);border-color:rgba(220,38,38,.2);" onclick="OpsClients.deleteClient(${c.client_id},'${(c.full_name || '').replace(/'/g, "\\'")}')">Delete</button>` : ''}
        </div>
      </div>

      ${section('Company Information', companyInfo)}
      ${section('Contacts', contacts)}
      ${section('Properties', properties)}
      ${section('Contracts', contracts)}
      ${section('Billing', billing)}
      ${section('Reports', '<div class="cl-empty">No reports linked to this client yet.</div>', true)}
      ${section('Documents', '<div class="cl-empty">No documents uploaded.</div>', true)}
      ${section('Timeline', timeline, true)}
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

  return { render, search, open, back, editClient, saveClient, deleteClient };

})();
