// ============================================
// OPS PROPERTIES MODULE
// Submitted areas — full inspection pipeline
// submitted → inspection → report → quote → payment → active
// ============================================

const OpsProperties = (function () {
  'use strict';

  let _all    = [];
  let _filter = 'all';

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
        .pr-header {
          display: flex; align-items: flex-start;
          justify-content: space-between; margin-bottom: 20px;
        }

        .pr-header-title {
          font-family: var(--ff-d, 'Playfair Display', serif);
          font-size: 1.3rem; font-weight: 800;
          color: var(--ink, #0a1f2e); letter-spacing: -.02em; margin-bottom: 3px;
        }

        .pr-header-sub { font-size: .8rem; color: var(--ink-3, #6b8fa3); }

        /* Pipeline stage tiles */
        .pr-pipeline {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 10px; margin-bottom: 20px;
        }

        .pr-stage {
          background: var(--surface, #fff);
          border: 1px solid var(--border, #dae6ef);
          border-radius: var(--r, 10px);
          padding: 14px 16px;
          position: relative; overflow: hidden;
          box-shadow: var(--sh-xs);
          cursor: pointer; transition: all .18s;
        }

        .pr-stage:hover { transform: translateY(-2px); box-shadow: var(--sh-md); border-color: var(--border-2, #b8d0de); }
        .pr-stage.active-filter { border-color: var(--navy, #0a2a3d); box-shadow: 0 0 0 2px rgba(10,42,61,.12), var(--sh-sm); }

        .pr-stage::after {
          content: ''; position: absolute;
          bottom: 0; left: 0; right: 0; height: 3px;
        }

        .pr-stage.s0::after { background: var(--warn, #b45309); }
        .pr-stage.s1::after { background: var(--caut, #c2410c); }
        .pr-stage.s2::after { background: var(--amber, #f5a623); }
        .pr-stage.s3::after { background: #3b82f6; }
        .pr-stage.s4::after { background: linear-gradient(90deg, var(--navy, #0a2a3d), var(--blue, #16a8d3)); }

        .pr-stage-label {
          font-size: .6rem; font-weight: 700;
          letter-spacing: 1.2px; text-transform: uppercase;
          color: var(--ink-3, #6b8fa3); margin-bottom: 6px;
        }

        .pr-stage-val {
          font-family: var(--ff-d, 'Playfair Display', serif);
          font-size: 1.8rem; font-weight: 900;
          color: var(--ink, #0a1f2e); letter-spacing: -.03em; line-height: 1;
        }

        .pr-stage-sub { font-size: .68rem; color: var(--ink-3, #6b8fa3); margin-top: 3px; }

        /* Table card */
        .pr-table-card {
          background: var(--surface, #fff);
          border: 1px solid var(--border, #dae6ef);
          border-radius: var(--r, 10px);
          overflow: hidden; box-shadow: var(--sh-xs);
        }

        .pr-table-head {
          padding: 14px 20px;
          border-bottom: 1px solid var(--border, #dae6ef);
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
        }

        .pr-table-title {
          font-family: var(--ff-d, 'Playfair Display', serif);
          font-size: .9rem; font-weight: 700; color: var(--ink, #0a1f2e);
        }

        .pr-controls { display: flex; align-items: center; gap: 8px; }

        .pr-search-wrap { position: relative; }

        .pr-search-icon {
          position: absolute; left: 10px; top: 50%;
          transform: translateY(-50%);
          color: var(--ink-4, #9eb8c8); pointer-events: none;
        }

        .pr-search {
          padding: 7px 12px 7px 32px;
          border: 1px solid var(--border, #dae6ef);
          border-radius: var(--rs, 6px);
          background: var(--surface-2, #f7fafc);
          font-family: var(--ff-b, 'Figtree', sans-serif);
          font-size: .8rem; color: var(--ink, #0a1f2e);
          outline: none; transition: all .2s; width: 200px;
        }

        .pr-search:focus {
          border-color: var(--blue, #16a8d3);
          box-shadow: 0 0 0 3px rgba(22,168,211,.1);
          background: var(--surface, #fff);
        }
      </style>

      <div class="pr-header">
        <div>
          <div class="pr-header-title">Areas & Inspections</div>
          <div class="pr-header-sub">Submitted estates, communities, and drainage areas — full pipeline view</div>
        </div>
      </div>

      <!-- Pipeline stages -->
      <div class="pr-pipeline">
        <div class="pr-stage s0" id="prs-0" role="button" tabindex="0" aria-label="Filter: Awaiting Review"
          onclick="OpsProperties.filterStage('submitted')"
          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();OpsProperties.filterStage('submitted')}">
          <div class="pr-stage-label">Awaiting Review</div>
          <div class="pr-stage-val" id="prc-0">—</div>
          <div class="pr-stage-sub">Submitted</div>
        </div>
        <div class="pr-stage s1" id="prs-1" role="button" tabindex="0" aria-label="Filter: In Inspection"
          onclick="OpsProperties.filterStage('inspection')"
          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();OpsProperties.filterStage('inspection')}">
          <div class="pr-stage-label">In Inspection</div>
          <div class="pr-stage-val" id="prc-1">—</div>
          <div class="pr-stage-sub">Scheduled / Ongoing</div>
        </div>
        <div class="pr-stage s2" id="prs-2" role="button" tabindex="0" aria-label="Filter: Report Ready"
          onclick="OpsProperties.filterStage('report')"
          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();OpsProperties.filterStage('report')}">
          <div class="pr-stage-label">Report Ready</div>
          <div class="pr-stage-val" id="prc-2">—</div>
          <div class="pr-stage-sub">Awaiting quote</div>
        </div>
        <div class="pr-stage s3" id="prs-3" role="button" tabindex="0" aria-label="Filter: Quote / Payment"
          onclick="OpsProperties.filterStage('billing')"
          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();OpsProperties.filterStage('billing')}">
          <div class="pr-stage-label">Quote / Payment</div>
          <div class="pr-stage-val" id="prc-3">—</div>
          <div class="pr-stage-sub">In billing</div>
        </div>
        <div class="pr-stage s4" id="prs-4" role="button" tabindex="0" aria-label="Filter: Active"
          onclick="OpsProperties.filterStage('active')"
          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();OpsProperties.filterStage('active')}">
          <div class="pr-stage-label">Active</div>
          <div class="pr-stage-val" id="prc-4">—</div>
          <div class="pr-stage-sub">Monitored</div>
        </div>
      </div>

      <!-- Table -->
      <div class="pr-table-card">
        <div class="pr-table-head">
          <div class="pr-table-title" id="pr-table-title">All Areas</div>
          <div class="pr-controls">
            <div class="pr-search-wrap">
              <svg class="pr-search-icon" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35"/></svg>
              <input class="pr-search" id="pr-search" placeholder="Search areas…" oninput="OpsProperties.search(this.value)">
            </div>
            <button class="btn-ghost" onclick="OpsProperties.filterStage('all')" style="font-size:.76rem;padding:6px 12px;">
              Show All
            </button>
          </div>
        </div>
        <div id="pr-table-body">
          <div style="padding:48px;text-align:center;color:var(--ink-3);">
            <div class="loading" style="margin:0 auto 12px;"></div>
            <div style="font-size:.82rem;">Loading areas…</div>
          </div>
        </div>
      </div>
    `;

    loadAreas();
  }

  let _pg = null;

  async function loadAreas() {
    try {
      const res = await OpsModal.apiGet('/properties/all');
      _all      = res.data || [];
      renderPipeline(_all);
      _pg = FGPaginator.create(_all, { pageSize: 25, containerId: 'pr-table-body' });
      _pg.render(renderTable);
    } catch (err) {
      document.getElementById('pr-table-body').innerHTML = `
        <div style="padding:48px;text-align:center;">
          <div style="color:var(--err);font-weight:700;margin-bottom:8px;">Failed to load areas</div>
          <div style="color:var(--ink-3);font-size:.78rem;margin-bottom:16px;">${err.message}</div>
          <button class="btn-ghost" onclick="reloadTab('properties')">Retry</button>
        </div>`;
    }
  }

  function stageOf(a) {
    const s = a.status;
    if (s === 'submitted')                                                      return 'submitted';
    if (['inspection_scheduled','inspection_ongoing'].includes(s))               return 'inspection';
    if (s === 'report_ready')                                                   return 'report';
    if (['quote_sent','payment_pending','payment_completed','deployment_scheduled'].includes(s)) return 'billing';
    if (s === 'active')                                                         return 'active';
    return 'other';
  }

  function renderPipeline(areas) {
    const counts = { submitted:0, inspection:0, report:0, billing:0, active:0 };
    areas.forEach(a => { const k = stageOf(a); if (counts[k] !== undefined) counts[k]++; });
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('prc-0', counts.submitted);
    set('prc-1', counts.inspection);
    set('prc-2', counts.report);
    set('prc-3', counts.billing);
    set('prc-4', counts.active);
  }

  function filterStage(stage) {
    _filter = stage;

    // Update active stage highlight
    ['prs-0','prs-1','prs-2','prs-3','prs-4'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active-filter');
    });

    const stageMap = { submitted:'prs-0', inspection:'prs-1', report:'prs-2', billing:'prs-3', active:'prs-4' };
    if (stageMap[stage]) {
      const el = document.getElementById(stageMap[stage]);
      if (el) el.classList.add('active-filter');
    }

    const titleMap = {
      all: 'All Areas', submitted: 'Awaiting Review',
      inspection: 'In Inspection', report: 'Report Ready',
      billing: 'Quote / Payment', active: 'Active Areas',
    };

    const titleEl = document.getElementById('pr-table-title');
    if (titleEl) titleEl.textContent = titleMap[stage] || 'All Areas';

    const filtered = stage === 'all' ? _all : _all.filter(a => stageOf(a) === stage);
    if (_pg) _pg.update(filtered);
    else renderTable(filtered);
  }

  function search(q) {
    const term = q.trim().toLowerCase();
    const base = _filter === 'all' ? _all : _all.filter(a => stageOf(a) === _filter);
    const filtered = term
      ? base.filter(a =>
          (a.property_name || '').toLowerCase().includes(term) ||
          (a.client_name   || '').toLowerCase().includes(term) ||
          (a.city          || '').toLowerCase().includes(term))
      : base;
    if (_pg) _pg.update(filtered);
    else renderTable(filtered);
  }

  function pipelineBadge(s) {
    const m = { submitted:'watch', inspection_scheduled:'watch', inspection_ongoing:'warning', report_ready:'nominal', quote_sent:'watch', payment_pending:'warning', payment_completed:'nominal', deployment_scheduled:'watch', active:'nominal', suspended:'critical', cancelled:'offline' };
    return `<span class="status-badge ${m[s] || 'offline'}">${(s || 'unknown').replace(/_/g, ' ')}</span>`;
  }

  function inspBadge(s) {
    const m = { pending:'watch', scheduled:'watch', in_progress:'warning', completed:'nominal', cancelled:'critical', rescheduled:'watch' };
    return `<span class="status-badge ${m[s] || 'offline'}">${s}</span>`;
  }

  // the hierarchy, visible in the list: how many assets, how many watched
  function networkCell(a) {
    const assets = parseInt(a.asset_count) || 0;
    const nodes = parseInt(a.sentinel_count) || 0;
    const monitored = parseInt(a.monitored_assets) || 0;
    if (!assets) {
      return `<button class="btn-ghost" onclick="OpsNetwork.open('${a.property_id}')"
        style="padding:4px 9px;font-size:.7rem;color:var(--warn);border-color:var(--warn);">No assets</button>`;
    }
    const gap = assets - monitored;
    return `<button class="btn-ghost" onclick="OpsNetwork.open('${a.property_id}')"
      style="padding:4px 9px;font-size:.72rem;display:inline-flex;gap:7px;align-items:center;">
      <span><b style="color:var(--ink);font-family:var(--font-mono)">${assets}</b> asset${assets > 1 ? 's' : ''}</span>
      <span style="color:var(--ink-4)">·</span>
      <span><b style="color:${nodes ? 'var(--ok)' : 'var(--warn)'};font-family:var(--font-mono)">${nodes}</b> Sentinel${nodes === 1 ? '' : 's'}</span>
      ${gap ? `<span style="color:var(--warn)">· ${gap} unwatched</span>` : ''}
    </button>`;
  }

  function healthCell(score) {
    if (score == null) return '<span style="color:var(--ink-4);font-size:.76rem;">—</span>';
    const v = Math.round(Number(score));
    const c = v >= 75 ? 'var(--ok)' : v >= 50 ? 'var(--warn)' : 'var(--err)';
    return `<span style="font-family:var(--font-mono);font-weight:700;color:${c};font-size:.82rem">${v}</span>`;
  }

  function urgencyBadge(u) {
    if (!u) return '<span style="color:var(--ink-4);font-size:.76rem;">—</span>';
    const m = { low:'nominal', medium:'watch', high:'warning', critical:'critical' };
    return `<span class="status-badge ${m[u] || 'offline'}">${u}</span>`;
  }

  function renderTable(areas) {
    const el = document.getElementById('pr-table-body');
    if (!el) return;

    if (!areas || areas.length === 0) {
      el.innerHTML = `
        <div style="padding:60px;text-align:center;color:var(--ink-3);">
          <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.3" viewBox="0 0 24 24" style="margin:0 auto 14px;opacity:.25;display:block;"><path stroke-linecap="round" stroke-linejoin="round" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <div style="font-size:.88rem;font-weight:600;color:var(--ink-2);">No areas found</div>
        </div>`;
      return;
    }

    el.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="ops-table">
          <thead>
            <tr>
              <th>Area / Estate</th>
              <th>Type</th>
              <th>Client</th>
              <th>Location</th>
              <th>Drainage network</th>
              <th>Health</th>
              <th>Pipeline Status</th>
              <th>Inspection</th>
              <th>Urgency</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${areas.map(a => {
              const loc = [a.city, a.state].filter(Boolean).join(', ') || a.location || '—';
              const pid = a.property_id;
              return `<tr>
                <td class="bright">${a.property_name || '—'}</td>
                <td style="font-size:.78rem;">${(a.property_type || '').replace(/_/g, ' ')}</td>
                <td style="font-size:.82rem;">${a.client_name || a.client_email || '—'}</td>
                <td style="font-size:.78rem;">${loc}</td>
                <td>${networkCell(a)}</td>
                <td>${healthCell(a.health_score)}</td>
                <td>${pipelineBadge(a.status)}</td>
                <td>${a.inspection_status ? inspBadge(a.inspection_status) : '<span style="color:var(--ink-4);font-size:.76rem;">—</span>'}</td>
                <td>${urgencyBadge(a.urgency_level)}</td>
                <td style="text-align:right;">
                  <div style="display:flex;gap:6px;justify-content:flex-end;">
                    <button class="btn-ghost" onclick="OpsNetwork.open('${pid}')" style="padding:6px 12px;font-size:.76rem;color:var(--blue-hi);border-color:var(--blue-dim);">Network</button>
                    <button class="btn-ghost" onclick="OpsProperties.viewArea('${pid}')" style="padding:6px 12px;font-size:.76rem;">View</button>
                    <button class="btn-ghost" onclick="OpsProperties.editArea('${pid}')" style="padding:6px 12px;font-size:.76rem;">Edit</button>
                    ${a.status === 'submitted'
                      ? `<button class="btn-primary" onclick="OpsProperties.scheduleInspection('${pid}','${(a.property_name || '').replace(/'/g, "\\'")}')" style="padding:6px 12px;font-size:.76rem;">Schedule</button>`
                      : ''}
                    ${_isAdmin ? `<button class="btn-ghost" onclick="OpsProperties.deleteArea('${pid}','${(a.property_name||'').replace(/'/g,"\\'")}')" style="padding:6px 12px;font-size:.76rem;color:var(--err);border-color:rgba(220,38,38,.2);">Delete</button>` : ''}
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  async function viewArea(propertyId) {
    try {
      const res  = await OpsModal.apiGet('/properties/' + propertyId);
      const a    = res.data;
      if (!a) { OpsModal.toast('Area not found', 'warning'); return; }

      const inspections = a.inspections || [];
      const quotes      = a.quotes      || [];
      const invoices    = a.invoices    || [];

      const actions = [{ label: 'Close', onclick: 'OpsModal.close()', class: 'btn-ghost' }];
      if (a.status === 'submitted') {
        actions.push({ label: 'Schedule Inspection', onclick: `OpsModal.close();OpsProperties.scheduleInspection('${a.property_id}','${(a.property_name || '').replace(/'/g, "\\'")}')`, class: 'btn-primary' });
      }

      OpsModal.open(a.property_name || 'Area Details', `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px;">
          <div class="ops-modal-detail"><span class="label">Type</span><span class="value">${(a.property_type || '').replace(/_/g, ' ')}</span></div>
          <div class="ops-modal-detail"><span class="label">Location</span><span class="value">${[a.city, a.state].filter(Boolean).join(', ') || '—'}</span></div>
          <div class="ops-modal-detail"><span class="label">Pipeline Status</span><span class="value">${pipelineBadge(a.status)}</span></div>
          <div class="ops-modal-detail"><span class="label">Urgency</span><span class="value">${urgencyBadge(a.urgency_level)}</span></div>
          <div class="ops-modal-detail"><span class="label">Client</span><span class="value">${a.client_name || a.client_email || '—'}</span></div>
          <div class="ops-modal-detail"><span class="label">Phone</span><span class="value">${a.client_phone || '—'}</span></div>
          <div class="ops-modal-detail"><span class="label">Contact Person</span><span class="value">${a.contact_person_name || '—'}</span></div>
          <div class="ops-modal-detail"><span class="label">Submitted</span><span class="value">${a.created_at ? new Date(a.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—'}</span></div>
          ${a.issue_description ? `<div class="ops-modal-detail" style="grid-column:1/-1;"><span class="label">Description</span><span class="value" style="white-space:pre-wrap;line-height:1.5;">${a.issue_description}</span></div>` : ''}
        </div>

        ${inspections.length > 0 ? `
          <div style="margin-bottom:6px;font-size:.68rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--ink-3);">Inspections (${inspections.length})</div>
          <table class="ops-table" style="margin-bottom:16px;">
            <thead><tr><th>ID</th><th>Status</th><th>Date</th><th>Team</th><th>Risk</th><th>Score</th></tr></thead>
            <tbody>
              ${inspections.map(i => `<tr>
                <td style="font-family:var(--ff-m);font-size:.74rem;">${i.inspection_id}</td>
                <td>${inspBadge(i.status)}</td>
                <td style="font-size:.78rem;">${i.scheduled_date ? new Date(i.scheduled_date).toLocaleDateString('en-GB', { day:'numeric', month:'short' }) : '—'}</td>
                <td style="font-size:.78rem;">${i.assigned_team || '—'}</td>
                <td>${i.flood_risk_level ? urgencyBadge(i.flood_risk_level) : '—'}</td>
                <td style="font-family:var(--ff-d);font-weight:700;">${i.drainage_condition_score ? i.drainage_condition_score + '/10' : '—'}</td>
              </tr>`).join('')}
            </tbody>
          </table>` : ''}

        ${quotes.length > 0 ? `
          <div style="margin-bottom:6px;font-size:.68rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--ink-3);">Quotes</div>
          <table class="ops-table" style="margin-bottom:16px;">
            <thead><tr><th>Quote ID</th><th>Monthly</th><th>Status</th></tr></thead>
            <tbody>
              ${quotes.map(q => `<tr>
                <td style="font-family:var(--ff-m);font-size:.74rem;">${q.quote_id}</td>
                <td style="font-family:var(--ff-d);font-weight:700;">₦${Number(q.total_monthly || 0).toLocaleString()}</td>
                <td>${pipelineBadge(q.status)}</td>
              </tr>`).join('')}
            </tbody>
          </table>` : ''}

        ${invoices.length > 0 ? `
          <div style="margin-bottom:6px;font-size:.68rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--ink-3);">Invoices</div>
          <table class="ops-table">
            <thead><tr><th>Invoice</th><th>Amount</th><th>Status</th><th>Due</th></tr></thead>
            <tbody>
              ${invoices.map(inv => `<tr>
                <td style="font-family:var(--ff-m);font-size:.74rem;">${inv.invoice_id}</td>
                <td style="font-family:var(--ff-d);font-weight:700;">₦${Number(inv.total_amount || 0).toLocaleString()}</td>
                <td><span class="status-badge ${inv.payment_status === 'paid' ? 'nominal' : inv.payment_status === 'overdue' ? 'critical' : 'watch'}">${inv.payment_status}</span></td>
                <td style="font-size:.78rem;">${inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-GB', { day:'numeric', month:'short' }) : '—'}</td>
              </tr>`).join('')}
            </tbody>
          </table>` : ''}
      `, actions);

    } catch (err) {
      OpsModal.toast('Failed to load area details', 'critical');
    }
  }

  async function editArea(propertyId) {
    try {
      const res = await OpsModal.apiGet('/properties/' + propertyId);
      const a   = res.data;
      OpsModal.open('Edit Area', `
        ${OpsModal.field('Area Name', 'property_name', 'text', a.property_name || '')}
        ${OpsModal.row([
          OpsModal.field('Pipeline Status', 'status', 'select', a.status || 'submitted', {
            options: [
              { value:'submitted',            label:'Submitted' },
              { value:'inspection_scheduled', label:'Inspection Scheduled' },
              { value:'inspection_ongoing',   label:'Inspection Ongoing' },
              { value:'report_ready',         label:'Report Ready' },
              { value:'quote_sent',           label:'Quote Sent' },
              { value:'payment_pending',      label:'Payment Pending' },
              { value:'payment_completed',    label:'Payment Completed' },
              { value:'deployment_scheduled', label:'Deployment Scheduled' },
              { value:'active',               label:'Active' },
              { value:'suspended',            label:'Suspended' },
              { value:'cancelled',            label:'Cancelled' },
            ]
          }),
          OpsModal.field('Urgency', 'urgency_level', 'select', a.urgency_level || 'medium', {
            options: [
              { value:'low',      label:'Low' },
              { value:'medium',   label:'Medium' },
              { value:'high',     label:'High' },
              { value:'critical', label:'Critical' },
            ]
          }),
        ])}
        ${OpsModal.field('Notes', 'notes', 'textarea', a.notes || '', { required: false, rows: 3 })}
        ${OpsModal.row([
          OpsModal.field('Monthly Fee (₦)', 'monthly_fee', 'number', a.monthly_fee || '', { required: false, placeholder: 'e.g. 185000' }),
          OpsModal.field('Network Uptime (%)', 'network_uptime', 'number', a.network_uptime || '', { required: false, placeholder: 'e.g. 98.5' }),
        ])}
      `, [
        { label: 'Cancel',       onclick: 'OpsModal.close()', class: 'btn-ghost' },
        { label: 'Save Changes', onclick: `OpsProperties.saveArea('${propertyId}')`, class: 'btn-primary', id: 'modal-save-btn' },
      ]);
    } catch { OpsModal.toast('Failed to load area', 'critical'); }
  }

  async function saveArea(propertyId) {
    const data = OpsModal.getFormData();
    OpsModal.setLoading('modal-save-btn', true);
    try {
      await OpsModal.apiPut('/properties/' + propertyId, data);

      // Auto-generate monthly invoice if monthly_fee was set
      if (data.monthly_fee && parseFloat(data.monthly_fee) > 0) {
        try {
          await OpsModal.apiPost('/properties/' + propertyId + '/generate-invoice', {
            amount: parseFloat(data.monthly_fee),
            description: 'FlowGuard DaaS — Monthly Service Fee'
          });
        } catch(e) {
          // Non-fatal — invoice generation failure doesn't block the save
          console.warn('Invoice generation failed:', e.message);
        }
      }

      OpsModal.close();
      OpsModal.toast('Area updated successfully', 'nominal');
      reloadTab('properties');
    } catch (err) {
      OpsModal.toast('Failed to update: ' + err.message, 'critical');
      OpsModal.setLoading('modal-save-btn', false);
    }
  }

  // ── DELETE AREA ───────────────────────────────────────────────────────

  function deleteArea(propertyId, name) {
    OpsModal.confirm(
      `Permanently delete area "${name}"? All inspections, quotes, and invoices linked to this area will also be removed.`,
      async function () {
        OpsModal.setLoading('modal-confirm-btn', true);
        try {
          await OpsModal.apiDelete('/properties/' + propertyId);
          OpsModal.close();
          OpsModal.toast(`Area "${name}" deleted`, 'nominal');
          reloadTab('properties');
        } catch (err) {
          OpsModal.toast('Delete failed: ' + err.message, 'critical');
          OpsModal.setLoading('modal-confirm-btn', false);
        }
      }
    );
  }

  async function scheduleInspection(propertyId, propertyName) {
    // Load teams for assignment
    let teams = [];
    try {
      const res = await OpsModal.apiGet('/teams');
      teams = res.data || res.teams || [];
    } catch {}

    const teamOptions = teams.length > 0
      ? teams.map(t => ({ value: t.team_id || t.id, label: t.team_name || t.name }))
      : [{ value: '', label: 'No teams available' }];

    OpsModal.open(`Schedule Inspection — ${propertyName || 'Area'}`, `
      ${OpsModal.field('Scheduled Date', 'scheduled_date', 'date', '')}
      ${OpsModal.field('Assign Team', 'team_id', 'select', '', { options: teamOptions, required: false })}
      ${OpsModal.field('Inspector Notes (optional)', 'notes', 'textarea', '', { required: false, rows: 3, placeholder: 'Access instructions, key contacts, equipment needed…' })}
      ${OpsModal.field('Priority', 'priority', 'select', 'standard', {
        options: [
          { value:'standard', label:'Standard' },
          { value:'priority', label:'Priority' },
          { value:'urgent',   label:'Urgent' },
        ]
      })}
    `, [
      { label: 'Cancel',              onclick: 'OpsModal.close()', class: 'btn-ghost' },
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
      reloadTab('properties');
    } catch (err) {
      OpsModal.toast('Failed to schedule: ' + err.message, 'critical');
      OpsModal.setLoading('modal-save-btn', false);
    }
  }

  return { render, filterStage, search, viewArea, editArea, saveArea, deleteArea, scheduleInspection, confirmSchedule };

})();
