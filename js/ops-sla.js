// ============================================
// OPS SLA TRACKER MODULE v1.0.0
// Per-client SLA compliance, breach detection,
// response time analytics
//
// API contracts expected:
//   GET /sla/summary   → { overall_compliance, avg_response_min, breaches_this_month,
//                          resolved_on_time, total_incidents,
//                          clients: [{ client_id, client_name, compliance_pct,
//                                      avg_response_min, breaches, sla_target_min }] }
//   GET /sla/breaches  → { data: [Breach] }
//   POST /sla/breaches/:id/acknowledge
// ============================================

const OpsSLA = (function () {
  'use strict';

  let _clients  = [];
  let _breaches = [];
  let _pg       = null;

  function render(container) {
    container.innerHTML = `
      <style>
        /* KPI row */
        .sla-kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:20px; }
        .sla-kpi { background:var(--surface,#fff); border:1px solid var(--border,#dae6ef); border-radius:var(--r,14px); padding:18px; box-shadow:var(--sh-xs); position:relative; overflow:hidden; transition:all .2s; }
        .sla-kpi:hover { transform:translateY(-2px); box-shadow:var(--sh-md); }
        .sla-kpi::after { content:''; position:absolute; bottom:0; left:0; right:0; height:3px; }
        .sla-kpi.green::after  { background:var(--ok,#0a8a6a); }
        .sla-kpi.blue::after   { background:linear-gradient(90deg,var(--navy,#0a2a3d),var(--blue,#16a8d3)); }
        .sla-kpi.amber::after  { background:var(--amber,#f5a623); }
        .sla-kpi.red::after    { background:var(--err,#dc2626); }
        .sla-kpi-label { font-size:.62rem; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:var(--ink-3,#6b8fa3); margin-bottom:6px; }
        .sla-kpi-val { font-family:var(--ff-d,'Space Grotesk',sans-serif); font-size:1.75rem; font-weight:900; color:var(--ink,#0a1f2e); letter-spacing:-.03em; line-height:1; }
        .sla-kpi-val.green { color:var(--ok,#0a8a6a); }
        .sla-kpi-val.amber { color:var(--amber,#f5a623); }
        .sla-kpi-val.red   { color:var(--err,#dc2626); }
        .sla-kpi-sub { font-size:.72rem; color:var(--ink-3,#6b8fa3); margin-top:4px; }

        /* Two-column layout */
        .sla-grid { display:grid; grid-template-columns:1fr 360px; gap:16px; margin-bottom:20px; }

        /* Per-client table */
        .sla-card { background:var(--surface,#fff); border:1px solid var(--border,#dae6ef); border-radius:var(--r,14px); box-shadow:var(--sh-xs); overflow:hidden; }
        .sla-card-head { padding:14px 20px; border-bottom:1px solid var(--border,#dae6ef); display:flex; align-items:center; justify-content:space-between; }
        .sla-card-title { font-family:var(--ff-d,'Space Grotesk',sans-serif); font-size:.9rem; font-weight:700; color:var(--ink,#0a1f2e); }

        /* Compliance bar */
        .sla-bar-track { height:6px; background:var(--border,#dae6ef); border-radius:3px; overflow:hidden; margin-top:5px; }
        .sla-bar-fill { height:100%; border-radius:3px; transition:width .5s cubic-bezier(.22,1,.36,1); }

        /* Breach list */
        .sla-breach-card { background:var(--surface,#fff); border:1px solid rgba(220,38,38,.2); border-radius:var(--r,14px); box-shadow:var(--sh-xs); overflow:hidden; }
        .sla-breach-head { padding:14px 18px; border-bottom:1px solid rgba(220,38,38,.1); background:rgba(220,38,38,.03); display:flex; align-items:center; gap:8px; }
        .sla-breach-title { font-family:var(--ff-d,'Space Grotesk',sans-serif); font-size:.9rem; font-weight:700; color:var(--err,#dc2626); }
        .sla-breach-item { padding:11px 18px; border-bottom:1px solid var(--border,#dae6ef); transition:background .12s; }
        .sla-breach-item:last-child { border-bottom:none; }
        .sla-breach-item:hover { background:var(--surface-2,#f7fafc); }
        .sla-breach-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:3px; }
        .sla-breach-name { font-size:.83rem; font-weight:600; color:var(--ink,#0a1f2e); }
        .sla-breach-delta { font-size:.76rem; font-weight:700; color:var(--err,#dc2626); font-family:var(--ff-m,'JetBrains Mono',monospace); }
        .sla-breach-meta { font-size:.73rem; color:var(--ink-3,#6b8fa3); }
      </style>

      <div class="sla-kpis">
        <div class="sla-kpi green">
          <div class="sla-kpi-label">Overall Compliance</div>
          <div class="sla-kpi-val green" id="sla-compliance">—</div>
          <div class="sla-kpi-sub">Across all clients</div>
        </div>
        <div class="sla-kpi blue">
          <div class="sla-kpi-label">Avg Response Time</div>
          <div class="sla-kpi-val" id="sla-response">—</div>
          <div class="sla-kpi-sub">Minutes to dispatch</div>
        </div>
        <div class="sla-kpi amber">
          <div class="sla-kpi-label">Resolved On Time</div>
          <div class="sla-kpi-val amber" id="sla-resolved">—</div>
          <div class="sla-kpi-sub">This month</div>
        </div>
        <div class="sla-kpi red">
          <div class="sla-kpi-label">Breaches This Month</div>
          <div class="sla-kpi-val red" id="sla-breaches">—</div>
          <div class="sla-kpi-sub" id="sla-breach-sub">Unacknowledged</div>
        </div>
      </div>

      <div class="sla-grid">
        <!-- Per-client compliance table -->
        <div class="sla-card">
          <div class="sla-card-head">
            <div class="sla-card-title">Client SLA Performance</div>
          </div>
          <div id="sla-client-body">
            <div style="padding:48px;text-align:center;color:var(--ink-3);">
              <div class="loading" style="margin:0 auto 12px;"></div>
              <div style="font-size:.82rem;">Loading…</div>
            </div>
          </div>
        </div>

        <!-- Active breaches -->
        <div class="sla-breach-card">
          <div class="sla-breach-head">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
            <div class="sla-breach-title">Active Breaches</div>
          </div>
          <div id="sla-breach-list">
            <div style="padding:28px;text-align:center;color:var(--ink-3);font-size:.82rem;">Loading…</div>
          </div>
        </div>
      </div>

      <!-- Full breach log -->
      <div class="sla-card">
        <div class="sla-card-head">
          <div class="sla-card-title">Breach History</div>
          <button class="btn-ghost" onclick="reloadTab('sla')" style="font-size:.76rem;padding:6px 12px;">Refresh</button>
        </div>
        <div id="sla-breach-table">
          <div style="padding:32px;text-align:center;color:var(--ink-3);font-size:.82rem;">Loading…</div>
        </div>
      </div>
    `;

    loadAll();
  }

  // ── DATA ──────────────────────────────────────────────────────────────

  async function loadAll() {
    try {
      const [summaryRes, breachRes] = await Promise.all([
        OpsModal.apiGet('/sla/summary'),
        OpsModal.apiGet('/sla/breaches'),
      ]);

      const s = summaryRes.data || {};
      _clients  = s.clients  || [];
      _breaches = breachRes.data || breachRes.breaches || [];

      renderKPIs(s);
      renderClientTable(_clients);
      renderBreachList(_breaches.filter(b => !b.acknowledged_at));
      renderBreachHistory(_breaches);

    } catch (err) {
      ['sla-client-body','sla-breach-list','sla-breach-table'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<div style="padding:24px;text-align:center;color:var(--err);font-size:.82rem;">
          Failed to load: ${err.message}
          <br><button class="btn-ghost" style="margin-top:10px;" onclick="reloadTab('sla')">Retry</button>
        </div>`;
      });
    }
  }

  // ── KPI CARDS ─────────────────────────────────────────────────────────

  function renderKPIs(d) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('sla-compliance', d.overall_compliance != null ? d.overall_compliance + '%' : '—');
    set('sla-response',   d.avg_response_min   != null ? d.avg_response_min + 'm'  : '—');
    set('sla-resolved',   d.resolved_on_time   != null ? d.resolved_on_time        : '—');
    set('sla-breaches',   d.breaches_this_month != null ? d.breaches_this_month    : '—');
    const unack = _breaches.filter(b => !b.acknowledged_at).length;
    set('sla-breach-sub', unack > 0 ? `${unack} unacknowledged` : 'All acknowledged');
  }

  // ── PER-CLIENT TABLE ──────────────────────────────────────────────────

  function renderClientTable(clients) {
    const el = document.getElementById('sla-client-body');
    if (!el) return;

    if (!clients || clients.length === 0) {
      el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--ink-3);font-size:.82rem;">No client SLA data available</div>';
      return;
    }

    el.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="ops-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>SLA Target</th>
              <th style="min-width:140px;">Compliance</th>
              <th>Avg Response</th>
              <th>Breaches</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${clients.map(c => {
              const pct       = c.compliance_pct ?? 0;
              const barColor  = pct >= 95 ? 'var(--ok)' : pct >= 80 ? 'var(--amber)' : 'var(--err)';
              const badgeType = pct >= 95 ? 'nominal' : pct >= 80 ? 'watch' : 'critical';
              const label     = pct >= 95 ? 'On Track' : pct >= 80 ? 'At Risk' : 'Breached';
              return `<tr>
                <td class="bright">${c.client_name || '—'}</td>
                <td style="font-family:var(--ff-m);font-size:.78rem;">${c.sla_target_min || '—'} min</td>
                <td>
                  <div style="font-size:.82rem;font-weight:700;color:${barColor};margin-bottom:3px;">${pct}%</div>
                  <div class="sla-bar-track">
                    <div class="sla-bar-fill" style="width:${pct}%;background:${barColor};"></div>
                  </div>
                </td>
                <td style="font-family:var(--ff-m);font-size:.78rem;">${c.avg_response_min != null ? c.avg_response_min + ' min' : '—'}</td>
                <td style="font-family:var(--ff-d);font-size:.95rem;font-weight:800;color:${c.breaches > 0 ? 'var(--err)' : 'var(--ok)'};">${c.breaches ?? 0}</td>
                <td><span class="status-badge ${badgeType}">${label}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ── ACTIVE BREACHES ───────────────────────────────────────────────────

  function renderBreachList(breaches) {
    const el = document.getElementById('sla-breach-list');
    if (!el) return;

    if (!breaches || breaches.length === 0) {
      el.innerHTML = `
        <div style="padding:28px;text-align:center;color:var(--ok);">
          <svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="margin:0 auto 8px;display:block;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <div style="font-size:.82rem;font-weight:600;">No active breaches</div>
        </div>`;
      return;
    }

    el.innerHTML = breaches.slice(0, 8).map(b => {
      const id      = b.breach_id || b.id;
      const overMin = b.response_time_min && b.sla_target_min ? b.response_time_min - b.sla_target_min : null;
      return `
        <div class="sla-breach-item">
          <div class="sla-breach-top">
            <span class="sla-breach-name">${b.client_name || b.alert_type || '—'}</span>
            ${overMin != null ? `<span class="sla-breach-delta">+${overMin}m over</span>` : ''}
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div class="sla-breach-meta">${b.alert_type || ''} ${b.occurred_at ? '· ' + fmtRelTime(b.occurred_at) : ''}</div>
            <button class="btn-ghost" onclick="OpsSLA.acknowledge('${id}')" style="padding:4px 8px;font-size:.7rem;">Acknowledge</button>
          </div>
        </div>`;
    }).join('');
  }

  // ── BREACH HISTORY TABLE ──────────────────────────────────────────────

  function renderBreachHistory(breaches) {
    const el = document.getElementById('sla-breach-table');
    if (!el) return;

    if (!breaches || breaches.length === 0) {
      el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--ink-3);font-size:.82rem;">No breach history</div>';
      return;
    }

    _pg = FGPaginator.create(breaches, { pageSize: 20, containerId: 'sla-breach-table' });
    _pg.render(items => {
      const tableEl = document.getElementById('sla-breach-table');
      if (!tableEl) return;
      tableEl.innerHTML = `
        <div style="overflow-x:auto;">
          <table class="ops-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Alert Type</th>
                <th>Target</th>
                <th>Actual Response</th>
                <th>Overage</th>
                <th>Occurred</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(b => {
                const overMin = b.response_time_min && b.sla_target_min ? b.response_time_min - b.sla_target_min : null;
                return `<tr>
                  <td class="bright">${b.client_name || '—'}</td>
                  <td style="font-size:.82rem;">${b.alert_type || '—'}</td>
                  <td style="font-family:var(--ff-m);font-size:.78rem;">${b.sla_target_min != null ? b.sla_target_min + ' min' : '—'}</td>
                  <td style="font-family:var(--ff-m);font-size:.78rem;">${b.response_time_min != null ? b.response_time_min + ' min' : '—'}</td>
                  <td style="font-family:var(--ff-m);font-size:.78rem;color:${overMin > 0 ? 'var(--err)' : 'var(--ok)'};font-weight:700;">
                    ${overMin != null ? (overMin > 0 ? '+' + overMin + 'm' : '—') : '—'}
                  </td>
                  <td style="font-size:.78rem;">${fmtDate(b.occurred_at)}</td>
                  <td>
                    ${b.acknowledged_at
                      ? `<span class="status-badge nominal">Acknowledged</span>`
                      : `<span class="status-badge critical">Unacknowledged</span>`}
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
    });
  }

  // ── ACTIONS ───────────────────────────────────────────────────────────

  async function acknowledge(id) {
    try {
      await OpsModal.apiPost(`/sla/breaches/${id}/acknowledge`, {});
      OpsModal.toast('Breach acknowledged', 'nominal');
      reloadTab('sla');
    } catch (err) {
      OpsModal.toast('Failed: ' + err.message, 'critical');
    }
  }

  // ── HELPERS ───────────────────────────────────────────────────────────

  function fmtDate(ds) {
    if (!ds) return '—';
    return new Date(ds).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  }

  function fmtRelTime(ds) {
    if (!ds) return '';
    const diff = Date.now() - new Date(ds).getTime();
    const mins = Math.floor(diff / 60000);
    const hrs  = Math.floor(diff / 3600000);
    if (mins < 60) return `${mins}m ago`;
    if (hrs  < 24) return `${hrs}h ago`;
    return new Date(ds).toLocaleDateString('en-GB', { day:'numeric', month:'short' });
  }

  return { render, acknowledge };

})();
