// ============================================
// OPS CLIENTS MODULE
// People/orgs who submitted areas for drainage management
// ============================================

const OpsClients = (function () {
  'use strict';

  // Only admins can permanently delete records
  const _isAdmin = (() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('user') || localStorage.getItem('user') || '{}');
      return u.role === 'admin';
    } catch { return false; }
  })();

  function render(container) {
    container.innerHTML = `
      <style>
        /* Page header uses the shared .fg-page-header/.fg-page-title/
           .fg-page-sub (index.html) — was a local .cl-header* copy,
           byte-for-byte identical to Properties' old .pr-header*. */

        .cl-table-wrap {
          background: var(--surface, #fff);
          border: 1px solid var(--border, #dae6ef);
          border-radius: var(--r, 14px);
          overflow: hidden;
          box-shadow: var(--sh-xs);
        }

        .cl-table-head {
          padding: 14px 20px;
          border-bottom: 1px solid var(--border, #dae6ef);
          display: flex; align-items: center; justify-content: space-between;
        }

        .cl-table-title {
          font-family: var(--ff-d, 'Space Grotesk', sans-serif);
          font-size: var(--fs-md); font-weight: 700; color: var(--ink, #0a1f2e);
        }

        .cl-search {
          display: flex; align-items: center; gap: 8px;
        }

        .cl-search-input {
          padding: 7px 12px 7px 32px;
          border: 1px solid var(--border, #dae6ef);
          border-radius: var(--rs, 9px);
          background: var(--surface-2, #f7fafc);
          font-family: var(--ff-b, 'Inter', sans-serif);
          font-size: var(--fs-base); color: var(--ink, #0a1f2e);
          outline: none; transition: all .2s; width: 220px;
          position: relative;
        }

        .cl-search-input:focus {
          border-color: var(--blue, #16a8d3);
          box-shadow: 0 0 0 3px rgba(22,168,211,.1);
          background: var(--surface, #fff);
        }

        .cl-search-wrap { position: relative; }

        .cl-search-icon {
          position: absolute; left: 10px; top: 50%;
          transform: translateY(-50%);
          color: var(--ink-4, #9eb8c8); pointer-events: none;
        }

        /* Client avatar chip */
        .cl-avatar {
          width: 32px; height: 32px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          font-size: var(--fs-sm); font-weight: 700; color: white;
          flex-shrink: 0; font-family: var(--ff-m, 'JetBrains Mono', monospace);
        }

        .cl-name-wrap { display: flex; align-items: center; gap: 10px; }

        .cl-name { font-size: var(--fs-md); font-weight: 600; color: var(--ink, #0a1f2e); }
        .cl-email { font-size: var(--fs-sm); color: var(--ink-3, #6b8fa3); margin-top: 1px; max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      </style>

      <div class="fg-page-header">
        <div>
          <div class="fg-page-title">Clients</div>
          <div class="fg-page-sub">People and organisations who submitted properties for drainage management</div>
        </div>
      </div>

      <!-- Shared KpiStrip — was a fourth bespoke KPI card design (uppercase label, no border) -->
      <div id="cl-stats"></div>

      <div class="cl-table-wrap">
        <div class="cl-table-head">
          <div class="cl-table-title">All Clients</div>
          <div class="cl-search">
            <div class="cl-search-wrap">
              <svg class="cl-search-icon" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35"/></svg>
              <input class="cl-search-input" id="cl-search" placeholder="Search clients…" oninput="OpsClients.search(this.value)">
            </div>
          </div>
        </div>
        <div id="cl-table-body">
          <div style="padding:48px;text-align:center;color:var(--ink-3);">
            <div class="loading" style="margin:0 auto 12px;"></div>
            <div style="font-size:var(--fs-base);">Loading clients…</div>
          </div>
        </div>
      </div>
    `;

    loadClients();
  }

  let _all = [];
  let _pg  = null;

  async function loadClients() {
    try {
      const res = await OpsModal.apiGet('/clients');
      _all      = res.data || [];
      renderStats(_all);
      _pg = FGPaginator.create(_all, { pageSize: 25, containerId: 'cl-table-body' });
      _pg.render(renderTable);
    } catch (err) {
      document.getElementById('cl-table-body').innerHTML = `
        <div style="padding:48px;text-align:center;">
          <div style="color:var(--err);font-weight:700;margin-bottom:8px;">Failed to load clients</div>
          <div style="color:var(--ink-3);font-size:var(--fs-sm);margin-bottom:16px;">${err.message}</div>
          <button class="btn-ghost" onclick="reloadTab('clients')">Retry</button>
        </div>`;
    }
  }

  function renderStats(clients) {
    const total   = clients.length;
    const areas   = clients.reduce((s, c) => s + (parseInt(c.submitted_areas) || 0), 0);
    const pending = clients.reduce((s, c) => s + (parseInt(c.pending_areas)   || 0), 0);
    const active  = clients.reduce((s, c) => s + (parseInt(c.active_areas)    || 0), 0);

    const el = document.getElementById('cl-stats');
    if (!el) return;
    el.innerHTML = OpsModal.kpiStrip([
      { label: 'Total Clients',        value: total },
      { label: 'Properties Submitted', value: areas },
      { label: 'Pending Review',       value: pending, sub: pending ? 'Needs attention' : 'All clear', subClass: pending ? 'warn' : 'ok' },
      { label: 'Active Properties',    value: active,  sub: active ? 'Monitored' : null, subClass: 'ok' },
    ]);
  }

  function search(q) {
    const term     = q.trim().toLowerCase();
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

    if (!clients || clients.length === 0) {
      el.innerHTML = `
        <div style="padding:60px;text-align:center;color:var(--ink-3);">
          <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.3" viewBox="0 0 24 24" style="margin:0 auto 14px;opacity:.25;display:block;"><path stroke-linecap="round" stroke-linejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          <div style="font-size:var(--fs-md);font-weight:600;color:var(--ink-2);">No clients found</div>
        </div>`;
      return;
    }

    el.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="ops-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Phone</th>
              <th style="text-align:center;">Properties</th>
              <th style="text-align:center;">Pending</th>
              <th style="text-align:center;">Active</th>
              <th>Status</th>
              <th>Joined</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${clients.map(c => `
              <tr>
                <td>
                  <div class="cl-name-wrap">
                    <div class="cl-avatar" style="background:${avatarColor(c.full_name)};">${initials(c.full_name)}</div>
                    <div style="min-width:0;">
                      <div class="cl-name">${c.full_name || '—'}</div>
                      <div class="cl-email" title="${(c.email || '').replace(/"/g, '&quot;')}">${c.email || ''}</div>
                    </div>
                  </div>
                </td>
                <td class="num" style="font-size:var(--fs-base);">${c.phone || '—'}</td>
                <td class="num" style="text-align:center;font-weight:700;">${c.submitted_areas || 0}</td>
                <td style="text-align:center;">
                  ${parseInt(c.pending_areas) > 0
                    ? `<span style="color:var(--warn);font-weight:700;font-family:var(--ff-d);">${c.pending_areas}</span>`
                    : '<span style="color:var(--ink-4);">0</span>'}
                </td>
                <td style="text-align:center;">
                  ${parseInt(c.active_areas) > 0
                    ? `<span style="color:var(--ok);font-weight:700;font-family:var(--ff-d);">${c.active_areas}</span>`
                    : '<span style="color:var(--ink-4);">0</span>'}
                </td>
                <td>${statusBadge(c.status, c.is_active)}</td>
                <td style="font-size:var(--fs-sm);color:var(--ink-3);font-family:var(--ff-m);">
                  ${c.created_at ? new Date(c.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—'}
                </td>
                <td style="text-align:right;">
                  <div style="display:flex;gap:6px;justify-content:flex-end;">
                    <button class="btn-ghost" onclick="OpsClients.viewClient(${c.client_id})" style="padding:6px 12px;font-size:var(--fs-sm);">View</button>
                    <button class="btn-ghost" onclick="OpsClients.editClient(${c.client_id})" style="padding:6px 12px;font-size:var(--fs-sm);">Edit</button>
                    ${_isAdmin ? `<button class="btn-ghost" onclick="OpsClients.deleteClient(${c.client_id},'${(c.full_name||'').replace(/'/g,"\\'")}')" style="padding:6px 12px;font-size:var(--fs-sm);color:var(--err);border-color:rgba(220,38,38,.2);">Delete</button>` : ''}
                  </div>
                </td>
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
    const m = { submitted:'watch', inspection_scheduled:'watch', inspection_ongoing:'warning', report_ready:'watch', quote_sent:'watch', payment_pending:'warning', payment_completed:'nominal', deployment_scheduled:'watch', active:'nominal', suspended:'critical', cancelled:'offline' };
    return `<span class="status-badge ${m[s] || 'offline'}">${(s || 'unknown').replace(/_/g, ' ')}</span>`;
  }

  function inspBadge(s) {
    const m = { pending:'watch', scheduled:'watch', in_progress:'warning', completed:'nominal', cancelled:'critical', rescheduled:'watch' };
    return `<span class="status-badge ${m[s] || 'offline'}">${s}</span>`;
  }

  async function viewClient(clientId) {
    try {
      const res = await OpsModal.apiGet('/clients/' + clientId);
      const c   = res.data;
      if (!c) { OpsModal.toast('Client not found', 'warning'); return; }

      const areas    = c.areas    || [];
      const invoices = c.invoices || [];

      OpsModal.open(c.full_name || 'Client Details', `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;">
          <div class="ops-modal-detail"><span class="label">Email</span><span class="value">${c.email || '—'}</span></div>
          <div class="ops-modal-detail"><span class="label">Phone</span><span class="value">${c.phone || '—'}</span></div>
          <div class="ops-modal-detail"><span class="label">Status</span><span class="value">${statusBadge(c.status, c.is_active)}</span></div>
          <div class="ops-modal-detail"><span class="label">Joined</span><span class="value">${c.created_at ? new Date(c.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—'}</span></div>
          <div class="ops-modal-detail"><span class="label">Last Login</span><span class="value">${c.last_login ? OpsModal.fmtDateTime(c.last_login) : 'Never'}</span></div>
          <div class="ops-modal-detail"><span class="label">Total Properties</span><span class="value">${areas.length}</span></div>
        </div>

        ${areas.length > 0 ? `
          <div style="margin-bottom:6px;font-size:var(--fs-xs);font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--ink-3);">Submitted Properties</div>
          <table class="ops-table" style="margin-bottom:16px;">
            <thead><tr><th>Property</th><th>Type</th><th>Location</th><th>Pipeline</th><th>Inspection</th></tr></thead>
            <tbody>
              ${areas.map(a => `<tr>
                <td class="bright">${a.property_name || '—'}</td>
                <td style="font-size:var(--fs-sm);">${(a.property_type || '').replace(/_/g, ' ')}</td>
                <td style="font-size:var(--fs-sm);">${[a.city, a.state].filter(Boolean).join(', ') || '—'}</td>
                <td>${pipelineBadge(a.status)}</td>
                <td>${a.inspection_status ? inspBadge(a.inspection_status) : '<span style="color:var(--ink-4);font-size:var(--fs-sm);">Not scheduled</span>'}</td>
              </tr>`).join('')}
            </tbody>
          </table>` : '<div style="color:var(--ink-3);font-size:var(--fs-base);padding:12px 0 16px;">No properties submitted yet</div>'}

        ${invoices.length > 0 ? `
          <div style="margin-bottom:6px;font-size:var(--fs-xs);font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--ink-3);">Invoices</div>
          <table class="ops-table">
            <thead><tr><th>Invoice</th><th>Amount</th><th>Status</th><th>Due</th></tr></thead>
            <tbody>
              ${invoices.map(inv => `<tr>
                <td class="bright" style="font-family:var(--ff-m);font-size:var(--fs-sm);">${inv.invoice_id}</td>
                <td style="font-family:var(--ff-d);font-weight:700;">₦${Number(inv.total_amount || 0).toLocaleString()}</td>
                <td><span class="status-badge ${inv.payment_status === 'paid' ? 'nominal' : inv.payment_status === 'overdue' ? 'critical' : 'watch'}">${inv.payment_status}</span></td>
                <td style="font-size:var(--fs-sm);">${inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-GB', { day:'numeric', month:'short' }) : '—'}</td>
              </tr>`).join('')}
            </tbody>
          </table>` : ''}
      `, [
        { label: 'Close', onclick: 'OpsModal.close()', class: 'btn-ghost' },
        { label: 'Edit Client', onclick: `OpsModal.close();OpsClients.editClient(${c.client_id})`, class: 'btn-primary' },
      ]);
    } catch (err) {
      OpsModal.toast('Failed to load client details', 'critical');
    }
  }

  async function editClient(clientId) {
    try {
      const res = await OpsModal.apiGet('/clients/' + clientId);
      const c   = res.data;
      OpsModal.open('Edit Client', `
        ${OpsModal.field('Full Name', 'full_name', 'text', c.full_name || '')}
        ${OpsModal.field('Phone', 'phone', 'text', c.phone || '', { required: false })}
        ${OpsModal.field('Status', 'status', 'select', c.status || 'active', {
          options: [
            { value: 'active',    label: 'Active' },
            { value: 'suspended', label: 'Suspended' },
            { value: 'inactive',  label: 'Inactive' },
          ]
        })}
      `, [
        { label: 'Cancel',       onclick: 'OpsModal.close()', class: 'btn-ghost' },
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
      reloadTab('clients');
    } catch (err) {
      OpsModal.toast('Failed to update: ' + err.message, 'critical');
      OpsModal.setLoading('modal-save-btn', false);
    }
  }

  // ── DELETE CLIENT ─────────────────────────────────────────────────────

  function deleteClient(clientId, name) {
    OpsModal.confirm(
      `Permanently delete client "${name}"? This removes all their submitted areas and associated data.`,
      async function () {
        OpsModal.setLoading('modal-confirm-btn', true);
        try {
          await OpsModal.apiDelete('/clients/' + clientId);
          OpsModal.close();
          OpsModal.toast(`Client "${name}" deleted`, 'nominal');
          reloadTab('clients');
        } catch (err) {
          OpsModal.toast('Delete failed: ' + err.message, 'critical');
          OpsModal.setLoading('modal-confirm-btn', false);
        }
      }
    );
  }

  return { render, search, viewClient, editClient, saveClient, deleteClient };

})();
