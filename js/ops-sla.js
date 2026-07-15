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
  let _container = null;
  const _dash = v => (v == null || v === '') ? '—' : v;

  function render(container) {
    _container = container;
    container.innerHTML = `
      <style>
        .ops-table tbody tr.clickable { cursor:pointer; transition:background .12s; }
        .ops-table tbody tr.clickable:hover { background:var(--surface-2,#f2f8fb); }
        /* KPI row */
        .sla-kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:20px; }
        .sla-kpi { background:var(--surface,#fff); border:1px solid var(--border,#dae6ef); border-radius:var(--r,14px); padding:18px; box-shadow:var(--sh-xs); position:relative; overflow:hidden; transition:all .2s; }
        .sla-kpi:hover { transform:translateY(-2px); box-shadow:var(--sh-md); }
        .sla-kpi::after { content:''; position:absolute; bottom:0; left:0; right:0; height:3px; }
        .sla-kpi.green::after  { background:var(--ok,#0a8a6a); }
        .sla-kpi.blue::after   { background:linear-gradient(90deg,var(--navy,#0a2a3d),var(--blue,#16a8d3)); }
        .sla-kpi.amber::after  { background:var(--amber,#f5a623); }
        .sla-kpi.red::after    { background:var(--err,#dc2626); }
        .sla-kpi-label { font-size:var(--fs-2xs); font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:var(--ink-3,#6b8fa3); margin-bottom:6px; }
        .sla-kpi-val { font-family:var(--ff-d,'Space Grotesk',sans-serif); font-size:var(--fs-2xl); font-weight:900; color:var(--ink,#0a1f2e); letter-spacing:-.03em; line-height:1; }
        .sla-kpi-val.green { color:var(--ok,#0a8a6a); }
        .sla-kpi-val.amber { color:var(--amber,#f5a623); }
        .sla-kpi-val.red   { color:var(--err,#dc2626); }
        .sla-kpi-sub { font-size:var(--fs-xs); color:var(--ink-3,#6b8fa3); margin-top:4px; }

        /* Two-column layout */
        .sla-grid { display:grid; grid-template-columns:1fr 360px; gap:16px; margin-bottom:20px; }

        /* Per-client table */
        .sla-card { background:var(--surface,#fff); border:1px solid var(--border,#dae6ef); border-radius:var(--r,14px); box-shadow:var(--sh-xs); overflow:hidden; }
        .sla-card-head { padding:14px 20px; border-bottom:1px solid var(--border,#dae6ef); display:flex; align-items:center; justify-content:space-between; }
        .sla-card-title { font-family:var(--ff-d,'Space Grotesk',sans-serif); font-size:var(--fs-md); font-weight:700; color:var(--ink,#0a1f2e); }

        /* Compliance bar */
        .sla-bar-track { height:6px; background:var(--border,#dae6ef); border-radius:3px; overflow:hidden; margin-top:5px; }
        .sla-bar-fill { height:100%; border-radius:3px; transition:width .5s cubic-bezier(.22,1,.36,1); }

        /* Breach list */
        .sla-breach-card { background:var(--surface,#fff); border:1px solid rgba(220,38,38,.2); border-radius:var(--r,14px); box-shadow:var(--sh-xs); overflow:hidden; }
        .sla-breach-head { padding:14px 18px; border-bottom:1px solid rgba(220,38,38,.1); background:rgba(220,38,38,.03); display:flex; align-items:center; gap:8px; }
        .sla-breach-title { font-family:var(--ff-d,'Space Grotesk',sans-serif); font-size:var(--fs-md); font-weight:700; color:var(--err,#dc2626); }
        .sla-breach-item { padding:11px 18px; border-bottom:1px solid var(--border,#dae6ef); transition:background .12s; }
        .sla-breach-item:last-child { border-bottom:none; }
        .sla-breach-item:hover { background:var(--surface-2,#f7fafc); }
        .sla-breach-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:3px; }
        .sla-breach-name { font-size:var(--fs-base); font-weight:600; color:var(--ink,#0a1f2e); }
        .sla-breach-delta { font-size:var(--fs-sm); font-weight:700; color:var(--err,#dc2626); font-family:var(--ff-m,'JetBrains Mono',monospace); }
        .sla-breach-meta { font-size:var(--fs-sm); color:var(--ink-3,#6b8fa3); }
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
              <div style="font-size:var(--fs-base);">Loading…</div>
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
            <div style="padding:28px;text-align:center;color:var(--ink-3);font-size:var(--fs-base);">Loading…</div>
          </div>
        </div>
      </div>

      <!-- Full breach log -->
      <div class="sla-card">
        <div class="sla-card-head">
          <div class="sla-card-title">Breach History</div>
          <button class="btn-ghost" onclick="reloadTab('sla')" style="font-size:var(--fs-sm);padding:6px 12px;">Refresh</button>
        </div>
        <div id="sla-breach-table">
          <div style="padding:32px;text-align:center;color:var(--ink-3);font-size:var(--fs-base);">Loading…</div>
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
        if (el) el.innerHTML = `<div style="padding:24px;text-align:center;color:var(--err);font-size:var(--fs-base);">
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
      el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--ink-3);font-size:var(--fs-base);">No client SLA data available</div>';
      return;
    }

    // Columns per spec: Client, Property, SLA, Response Time, Resolution Time, Compliance, Status
    el.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="ops-table">
          <thead>
            <tr>
              <th>Client</th><th>Property</th><th>SLA</th><th>Response Time</th>
              <th>Resolution Time</th><th style="min-width:140px;">Compliance</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${clients.map(c => {
              const pct       = c.compliance_pct ?? 0;
              const barColor  = pct >= 95 ? 'var(--ok)' : pct >= 80 ? 'var(--amber)' : 'var(--err)';
              const badgeType = pct >= 95 ? 'nominal' : pct >= 80 ? 'watch' : 'critical';
              const label     = pct >= 95 ? 'On Track' : pct >= 80 ? 'At Risk' : 'Breached';
              const cid       = c.client_id != null ? c.client_id : '';
              return `<tr class="clickable" onclick="OpsSLA.open('${cid}')" tabindex="0" onkeydown="if(event.key==='Enter'){OpsSLA.open('${cid}')}">
                <td class="bright">${c.client_name || '—'}</td>
                <td style="font-size:var(--fs-sm);">${_dash(c.property_name)}</td>
                <td style="font-family:var(--ff-m);font-size:var(--fs-sm);">${c.sla_target_min || '—'} min</td>
                <td style="font-family:var(--ff-m);font-size:var(--fs-sm);">${c.avg_response_min != null ? c.avg_response_min + ' min' : '—'}</td>
                <td style="font-family:var(--ff-m);font-size:var(--fs-sm);">${c.avg_resolution_min != null ? c.avg_resolution_min + ' min' : '—'}</td>
                <td>
                  <div style="font-size:var(--fs-base);font-weight:700;color:${barColor};margin-bottom:3px;">${pct}%</div>
                  <div class="sla-bar-track"><div class="sla-bar-fill" style="width:${pct}%;background:${barColor};"></div></div>
                </td>
                <td><span class="status-badge ${badgeType}">${label}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function back() { if (_container) render(_container); }

  // ── FULL DETAIL SCREEN (no pop-up) ──
  function open(clientId) {
    const c = _clients.find(x => String(x.client_id) === String(clientId));
    if (!c || !_container) return;
    const pct = c.compliance_pct ?? 0;
    const label = pct >= 95 ? 'On Track' : pct >= 80 ? 'At Risk' : 'Breached';
    const badgeType = pct >= 95 ? 'nominal' : pct >= 80 ? 'watch' : 'critical';
    const clientBreaches = _breaches.filter(b => String(b.client_id) === String(clientId));
    const f = (k, v) => `<div><div style="font-size:var(--fs-2xs);font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:var(--ink-3);">${k}</div><div style="font-size:var(--fs-md);color:var(--ink);font-weight:600;margin-top:3px;">${v}</div></div>`;
    const sec = (t, b, needs) => `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r,14px);box-shadow:var(--sh-xs);margin-bottom:14px;overflow:hidden;"><div style="padding:12px 18px;border-bottom:1px solid var(--border);font-family:var(--ff-d);font-size:var(--fs-sm);font-weight:700;color:var(--ink);display:flex;justify-content:space-between;">${t}${needs ? '<span style="font-size:var(--fs-xs);color:var(--ink-4);font-style:italic;">pending backend data</span>' : ''}</div><div style="padding:16px 18px;">${b}</div></div>`;

    const details = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px 22px;">
      ${f('Client', c.client_name || '—')}
      ${f('Property', _dash(c.property_name))}
      ${f('SLA Target', (c.sla_target_min || '—') + ' min')}
      ${f('Response Time', c.avg_response_min != null ? c.avg_response_min + ' min' : '—')}
      ${f('Resolution Time', c.avg_resolution_min != null ? c.avg_resolution_min + ' min' : '—')}
      ${f('Compliance', pct + '%')}
      ${f('Breaches', c.breaches ?? 0)}
      ${f('Status', `<span class="status-badge ${badgeType}">${label}</span>`)}
    </div>`;

    const breachTable = clientBreaches.length ? `
      <div style="overflow-x:auto;"><table class="ops-table"><thead><tr><th>Month</th><th>Breaches</th><th>Acknowledged</th></tr></thead>
      <tbody>${clientBreaches.map(b => `<tr><td style="font-size:var(--fs-sm);">${_dash(b.month)}</td><td>${b.breaches ?? b.breach_count ?? '—'}</td><td style="font-size:var(--fs-sm);">${b.acknowledged_at ? OpsModal.fmtDateTime(b.acknowledged_at) : '<span style="color:var(--warn);">Pending</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<div style="color:var(--ink-3);font-size:var(--fs-sm);">No breaches on record for this client.</div>';

    _container.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;flex-wrap:wrap;">
        <button class="btn-ghost" onclick="OpsSLA.back()" style="display:inline-flex;align-items:center;gap:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>SLA Tracker</button>
        <div><div style="font-family:var(--ff-d);font-size:var(--fs-xl);font-weight:700;color:var(--ink);">${c.client_name || 'Client'}</div><div style="font-size:var(--fs-sm);color:var(--ink-3);margin-top:3px;">Compliance ${pct}% · <span class="status-badge ${badgeType}">${label}</span></div></div>
      </div>
      ${sec('SLA Details', details)}
      ${sec('Incident History', '<div style="color:var(--ink-3);font-size:var(--fs-sm);">No incident history in this response.</div>', true)}
      ${sec('Performance Charts', '<div style="color:var(--ink-3);font-size:var(--fs-sm);">Compliance ' + pct + '% over the current period.</div>', true)}
      ${sec('Breaches', breachTable)}
      ${sec('Timeline', '<div style="color:var(--ink-3);font-size:var(--fs-sm);">No timeline in this response.</div>', true)}
    `;
  }

  // ── ACTIVE BREACHES ───────────────────────────────────────────────────

  function renderBreachList(breaches) {
    const el = document.getElementById('sla-breach-list');
    if (!el) return;

    if (!breaches || breaches.length === 0) {
      el.innerHTML = `
        <div style="padding:28px;text-align:center;color:var(--ok);">
          <svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="margin:0 auto 8px;display:block;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <div style="font-size:var(--fs-base);font-weight:600;">No active breaches</div>
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
            <button class="btn-ghost" onclick="OpsSLA.acknowledge('${id}')" style="padding:4px 8px;font-size:var(--fs-xs);">Acknowledge</button>
          </div>
        </div>`;
    }).join('');
  }

  // ── BREACH HISTORY TABLE ──────────────────────────────────────────────

  function renderBreachHistory(breaches) {
    const el = document.getElementById('sla-breach-table');
    if (!el) return;

    if (!breaches || breaches.length === 0) {
      el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--ink-3);font-size:var(--fs-base);">No breach history</div>';
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
                  <td style="font-size:var(--fs-base);">${b.alert_type || '—'}</td>
                  <td style="font-family:var(--ff-m);font-size:var(--fs-sm);">${b.sla_target_min != null ? b.sla_target_min + ' min' : '—'}</td>
                  <td style="font-family:var(--ff-m);font-size:var(--fs-sm);">${b.response_time_min != null ? b.response_time_min + ' min' : '—'}</td>
                  <td style="font-family:var(--ff-m);font-size:var(--fs-sm);color:${overMin > 0 ? 'var(--err)' : 'var(--ok)'};font-weight:700;">
                    ${overMin != null ? (overMin > 0 ? '+' + overMin + 'm' : '—') : '—'}
                  </td>
                  <td style="font-size:var(--fs-sm);">${fmtDate(b.occurred_at)}</td>
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

  return { render, acknowledge, open, back };

})();
