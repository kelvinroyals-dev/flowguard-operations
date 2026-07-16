// ============================================
// ALERTS MODULE
// Full redesign — viewAlert, assignAlert, resolveAlert all wired
// ============================================

const OpsAlerts = (function () {
  'use strict';

  let _allAlerts = [];
  let _filter    = 'all';
  let _pg        = null;
  let _container = null;
  const _dash = v => (v == null || v === '') ? '—' : v;

  function getToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token');
  }

  function render(container) {
    _container = container;
    container.innerHTML = `
      <style>
        .ops-table tbody tr.clickable { cursor:pointer; transition:background .12s; }
        .ops-table tbody tr.clickable:hover { background:var(--surface-2,#f2f8fb); }
        .al-back { display:inline-flex; align-items:center; gap:6px; font-size:var(--fs-sm); font-weight:600; color:var(--ink-2); background:var(--surface-2); border:1px solid var(--border); border-radius:9px; padding:8px 13px; cursor:pointer; }
        .al-detail-top { display:flex; align-items:center; gap:14px; margin-bottom:18px; flex-wrap:wrap; }
        .al-detail-name { font-family:var(--ff-d); font-size:var(--fs-xl); font-weight:700; color:var(--ink); line-height:1.1; }
        .al-detail-meta { font-size:var(--fs-sm); color:var(--ink-3); margin-top:3px; }
        .al-detail-actions { margin-left:auto; display:flex; gap:8px; }
        .al-section { background:var(--surface,#fff); border:1px solid var(--border); border-radius:var(--r,14px); box-shadow:var(--sh-xs); margin-bottom:14px; overflow:hidden; }
        .al-section-h { padding:12px 18px; border-bottom:1px solid var(--border); font-family:var(--ff-d); font-size:var(--fs-sm); font-weight:700; letter-spacing:.4px; color:var(--ink); display:flex; align-items:center; justify-content:space-between; }
        .al-section-b { padding:16px 18px; }
        .al-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:14px 22px; }
        .al-field .k { font-size:var(--fs-2xs); font-weight:700; letter-spacing:.9px; text-transform:uppercase; color:var(--ink-3); }
        .al-field .v { font-size:var(--fs-md); color:var(--ink); font-weight:600; margin-top:3px; }
        .al-empty { color:var(--ink-3); font-size:var(--fs-sm); padding:6px 0; }
        .al-needs { font-size:var(--fs-xs); color:var(--ink-4); font-style:italic; }
        /* ── Stats row — shared .fg-kpis/.fg-kpi (OpsModal.kpiStrip), and the
           cards double as the severity filter, so the separate al-filters
           button row underneath it is gone (was two rows doing the same
           job, and the extra row was pure vertical space with nothing else
           on it — the KPI-strip-eats-300px-before-a-single-record problem). ── */
        .severity-high     { border-left-color: var(--caut, #c2410c) !important; }
        .severity-moderate { border-left-color: var(--warn, #b45309) !important; }
        .severity-minor    { border-left-color: var(--ink-3, #64748b) !important; }

        /* ── Feed card ── */
        .al-feed-card {
          background: var(--surface, #fff);
          border: 1px solid var(--border, #dae6ef);
          border-radius: var(--r, 14px);
          overflow: hidden;
          box-shadow: var(--sh-xs, 0 1px 2px rgba(10,31,46,.06));
        }

        .al-feed-head {
          padding: 14px 20px;
          border-bottom: 1px solid var(--border, #dae6ef);
          display: flex; align-items: center; justify-content: space-between;
        }

        .al-feed-title {
          font-family: var(--ff-d, 'Space Grotesk', sans-serif);
          font-size: var(--fs-md); font-weight: 700; color: var(--ink, #0a1f2e);
        }

        .al-feed-body { display: flex; flex-direction: column; }

        /* ── Individual alert row ── */
        .al-row {
          padding: 16px 20px;
          border-bottom: 1px solid var(--border, #dae6ef);
          display: flex; align-items: flex-start;
          gap: 14px; transition: background .12s;
          border-left: 3px solid transparent;
        }

        .al-row:last-child { border-bottom: none; }
        .al-row:hover { background: var(--surface-2, #f7fafc); }

        .al-row.severity-critical { border-left-color: var(--err, #dc2626); }
        .al-row.severity-high,
        .al-row.severity-warning  { border-left-color: var(--caut, #c2410c); }
        .al-row.severity-moderate,
        .al-row.severity-watch    { border-left-color: var(--warn, #b45309); }

        .al-row-icon {
          width: 36px; height: 36px; border-radius: 9px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; margin-top: 1px;
        }

        .al-row-body { flex: 1; min-width: 0; }

        .al-row-top {
          display: flex; align-items: center; gap: 8px;
          margin-bottom: 4px; flex-wrap: wrap;
        }

        .al-row-title {
          font-size: var(--fs-md); font-weight: 700;
          color: var(--ink, #0a1f2e);
        }

        .al-row-location {
          font-size: var(--fs-base); color: var(--ink-3, #6b8fa3);
          margin-bottom: 3px;
          display: flex; align-items: center; gap: 4px;
        }

        .al-row-meta {
          display: flex; align-items: center; gap: 10px;
          font-size: var(--fs-xs); color: var(--ink-4, #9eb8c8);
          font-family: var(--ff-m, 'JetBrains Mono', monospace);
        }

        .al-row-assigned {
          margin-top: 8px; padding: 6px 10px;
          background: var(--surface-3, #eef4f8);
          border-radius: 6px;
          font-size: var(--fs-sm); color: var(--ink-2, #2d5068);
          display: flex; align-items: center; gap: 6px;
        }

        .al-row-actions {
          display: flex; align-items: center;
          gap: 6px; flex-shrink: 0;
        }

        .al-action-btn {
          padding: 6px 14px;
          border-radius: var(--rs, 9px);
          border: 1px solid var(--border, #dae6ef);
          background: var(--surface-2, #f7fafc);
          font-family: var(--ff-b, 'Inter', sans-serif);
          font-size: var(--fs-sm); font-weight: 600;
          color: var(--ink-2, #2d5068);
          cursor: pointer; transition: all .18s;
          white-space: nowrap;
        }

        .al-action-btn:hover { border-color: var(--blue, #16a8d3); color: var(--blue, #16a8d3); background: rgba(22,168,211,.05); }
        .al-action-btn.primary { background: var(--navy, #0a2a3d); border-color: var(--navy, #0a2a3d); color: white; }
        .al-action-btn.primary:hover { background: var(--navy-mid, #0d3a54); }
        .al-action-btn.resolve { background: var(--ok-bg, #e2f5ee); border-color: var(--ok, #0a8a6a); color: var(--ok, #0a8a6a); }
        .al-action-btn.resolve:hover { background: var(--ok, #0a8a6a); color: white; }

        /* Empty state */
        .al-empty {
          padding: 60px 20px; text-align: center;
          color: var(--ink-3, #6b8fa3);
        }

        .al-empty svg { margin: 0 auto 14px; display: block; opacity: .25; }
        .al-empty-title { font-size: var(--fs-md); font-weight: 600; color: var(--ink-2, #2d5068); margin-bottom: 4px; }
        .al-empty-sub   { font-size: var(--fs-sm); }

        /* ── Incident Intelligence — the "days flood-free" sweep already runs
           every 15 minutes (utils/incidents.js) and raises a candidate the
           moment a sensor holds a critical level for a sustained window.
           That automation existed with a full confirm/dismiss API and had
           never been surfaced anywhere in ops — this is the one place a
           proactive "we already caught this, confirm or dismiss" signal
           belongs, ahead of the reactive Active Incidents feed below it. ── */
        .ic-card { background: var(--surface, #fff); border: 1px solid var(--blue-dim, #7dd3fc); border-radius: var(--r, 14px); overflow: hidden; box-shadow: var(--sh-xs, 0 1px 2px rgba(10,31,46,.06)); margin-bottom: 16px; }
        .ic-head { padding: 14px 20px; border-bottom: 1px solid var(--border, #dae6ef); background: var(--neon-trace, rgba(22,168,211,.06)); }
        .ic-title { font-family: var(--ff-d, 'Space Grotesk', sans-serif); font-size: var(--fs-md); font-weight: 700; color: var(--ink, #0a1f2e); display: flex; align-items: center; gap: 8px; }
        .ic-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 100px; background: var(--wb, #fef3c7); color: var(--warn, #b45309); font-size: var(--fs-2xs); font-weight: 800; }
        .ic-sub { font-size: var(--fs-sm); color: var(--ink-3, #6b8fa3); margin-top: 3px; line-height: 1.5; max-width: 680px; }
        .ic-row { padding: 14px 20px; border-bottom: 1px solid var(--border, #dae6ef); display: flex; align-items: center; gap: 14px; }
        .ic-row:last-child { border-bottom: none; }
        .ic-row-body { flex: 1; min-width: 0; }
        .ic-row-title { font-size: var(--fs-md); font-weight: 700; color: var(--ink, #0a1f2e); }
        .ic-row-meta { font-size: var(--fs-xs); color: var(--ink-3, #6b8fa3); font-family: var(--ff-m, 'JetBrains Mono', monospace); margin-top: 2px; }
        .ic-row-peak { font-family: var(--ff-m, 'JetBrains Mono', monospace); font-weight: 700; color: var(--warn, #b45309); white-space: nowrap; }
        .ic-empty { padding: 20px; text-align: center; color: var(--ink-3, #6b8fa3); font-size: var(--fs-sm); }
      </style>

      <div class="fg-page-header">
        <div>
          <div class="fg-page-title">Alerts</div>
          <div class="fg-page-sub">Active incidents raised by the Sentinel network, ranked by severity</div>
        </div>
      </div>

      <!-- Stats/filter — matches alerts.severity CHECK constraint exactly: critical | high | moderate | minor -->
      <div id="al-stats"></div>

      <!-- Incident Intelligence — pattern-detected candidates, ahead of the reactive feed -->
      <div class="ic-card" id="ic-card">
        <div class="ic-head">
          <div class="ic-title">Incident Intelligence <span class="ic-badge" id="ic-badge" style="display:none;"></span></div>
          <div class="ic-sub">Sustained-breach patterns the network already caught — a sweep checks every 15 minutes. Confirm to write the incident, or dismiss as a false positive, before either touches Active Incidents below.</div>
        </div>
        <div id="ic-body">
          <div class="ic-empty">Checking for pattern-detected candidates…</div>
        </div>
      </div>

      <!-- Feed -->
      <div class="al-feed-card">
        <div class="al-feed-head">
          <div class="al-feed-title">Active Incidents</div>
          <button class="btn-ghost" onclick="OpsAlerts.refresh()" style="font-size:var(--fs-sm);padding:6px 12px;">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            Refresh
          </button>
        </div>
        <div class="al-feed-body" id="al-feed">
          <div style="padding:40px;text-align:center;color:var(--ink-3);">
            <div class="loading" style="margin:0 auto 12px;"></div>
            <div style="font-size:var(--fs-base);">Loading alerts…</div>
          </div>
        </div>
      </div>
    `;

    loadAlerts();
    loadCandidates();
  }

  // ── Incident Intelligence: pending automation-raised candidates ──
  let _candidates = [];

  async function loadCandidates() {
    try {
      const r = await OpsModal.apiGet('/monitoring/incident-candidates?status=pending');
      _candidates = r.data || [];
      renderCandidates();
    } catch (err) {
      const body = document.getElementById('ic-body');
      if (body) body.innerHTML = `<div class="ic-empty">Couldn't load incident candidates — ${err.message || 'network error'}.</div>`;
    }
  }

  function renderCandidates() {
    const body = document.getElementById('ic-body');
    const badge = document.getElementById('ic-badge');
    if (!body) return;
    if (badge) {
      badge.textContent = _candidates.length || '';
      badge.style.display = _candidates.length ? '' : 'none';
    }
    if (!_candidates.length) {
      body.innerHTML = '<div class="ic-empty">No sustained-breach patterns awaiting review — the network is quiet.</div>';
      return;
    }
    body.innerHTML = _candidates.map(c => {
      const start = OpsModal.fmtDateTime(c.breach_start);
      const dur = c.duration_min ? `${c.duration_min} min sustained` : 'duration unknown';
      const site = c.property_name || c.sensor_name || c.sensor_id || 'Unknown site';
      return `
        <div class="ic-row">
          <div class="ic-row-body">
            <div class="ic-row-title">${site}</div>
            <div class="ic-row-meta">${c.sensor_name || c.sensor_id || ''} · ${dur} · began ${start}</div>
          </div>
          <div class="ic-row-peak">${c.peak_level != null ? Math.round(c.peak_level) + '%' : '—'}</div>
          <div class="al-row-actions">
            <button class="al-action-btn" onclick="OpsAlerts.dismissCandidate(${parseInt(c.id, 10)})">Dismiss</button>
            <button class="al-action-btn resolve" onclick="OpsAlerts.confirmCandidate(${parseInt(c.id, 10)})">Confirm incident</button>
          </div>
        </div>`;
    }).join('');
  }

  function confirmCandidate(id) {
    const c = _candidates.find(x => x.id == id);
    const site = c ? (c.property_name || c.sensor_name || c.sensor_id) : 'this site';
    OpsModal.open('Confirm flood incident', `
      <p style="margin:0 0 12px;font-size:var(--fs-base);color:var(--ink-3);line-height:1.5">
        Confirms this as a real flood incident at <b>${site}</b>. This resets the client's "days flood-free" counter and writes a permanent record.
      </p>
      ${OpsModal.field('Note (optional)', 'note', 'textarea', '', { required: false, placeholder: 'What happened, what was observed' })}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: 'Confirm incident', class: 'btn-primary', onclick: `OpsAlerts.resolveCandidate(${id}, true)` },
    ]);
  }

  function dismissCandidate(id) {
    const c = _candidates.find(x => x.id == id);
    const site = c ? (c.property_name || c.sensor_name || c.sensor_id) : 'this site';
    OpsModal.open('Dismiss candidate', `
      <p style="margin:0 0 12px;font-size:var(--fs-base);color:var(--ink-3);line-height:1.5">
        Marks this as a false positive at <b>${site}</b>. Nothing is written to the client's record.
      </p>
      ${OpsModal.field('Reason (optional)', 'note', 'textarea', '', { required: false, placeholder: "Why this isn't a real incident" })}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: 'Dismiss', class: 'btn-ghost', onclick: `OpsAlerts.resolveCandidate(${id}, false)` },
    ]);
  }

  async function resolveCandidate(id, confirmed) {
    const f = OpsModal.getFormData();
    OpsModal.setLoading(true);
    try {
      await OpsModal.apiPost(`/monitoring/incident-candidates/${id}/confirm`, { confirmed, note: f.note || null });
      OpsModal.close();
      OpsModal.toast(confirmed ? 'Incident confirmed.' : 'Candidate dismissed.', confirmed ? 'success' : 'nominal');
      _candidates = _candidates.filter(c => c.id != id);
      renderCandidates();
      if (confirmed) loadAlerts();   // a confirmed incident may also raise/affect the active feed
    } catch (err) {
      OpsModal.setLoading(false);
      OpsModal.toast(err.message || 'Failed to update candidate', 'error');
    }
  }

  async function loadAlerts() {
    try {
      const res    = await fetch(`${CONFIG.API_BASE}/alerts`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data   = await res.json();
      _allAlerts   = Array.isArray(data.data) ? data.data
                   : Array.isArray(data.alerts) ? data.alerts : [];
      updateStats(_allAlerts);
      _pg = FGPaginator.create(_allAlerts, { pageSize: 20, containerId: 'al-feed-card' });
      _pg.render((items) => renderFeed(items, _filter));
      if (typeof updateAlertCount === 'function') updateAlertCount(_allAlerts.length);
    } catch (err) {
      renderError(err.message);
    }
  }

  const WARN_ICON = '<path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/>';
  const CHECK_ICON = '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>';

  // Shared KpiStrip, doubling as the severity filter (matches the Properties
  // pipeline pattern) — was a stat-card row PLUS a separate filter-button
  // row underneath doing the same job, costing an extra ~40px of vertical
  // space above the fold with nothing on it but redundant controls.
  function updateStats(alerts) {
    // alerts.severity CHECK constraint: critical | high | moderate | minor.
    // One count per real value — no folding into legacy 3-bucket labels.
    let critical = 0, high = 0, moderate = 0, minor = 0;
    alerts.forEach(a => {
      switch (severityClass(a.severity)) {
        case 'critical': critical++; break;
        case 'high':     high++;     break;
        case 'moderate': moderate++; break;
        default:         minor++;
      }
    });
    const el = document.getElementById('al-stats');
    if (!el) return;
    el.innerHTML = OpsModal.kpiStrip([
      { icon: WARN_ICON,  color: 'var(--err)',   label: 'Critical',    value: critical, active: _filter === 'critical', onClick: "OpsAlerts.setFilter('critical')" },
      { icon: WARN_ICON,  color: 'var(--caut)',  label: 'High',        value: high,     active: _filter === 'high',     onClick: "OpsAlerts.setFilter('high')" },
      { icon: WARN_ICON,  color: 'var(--warn)',  label: 'Moderate',    value: moderate, active: _filter === 'moderate', onClick: "OpsAlerts.setFilter('moderate')" },
      { icon: WARN_ICON,  color: 'var(--ink-3)', label: 'Minor',       value: minor,    active: _filter === 'minor',    onClick: "OpsAlerts.setFilter('minor')" },
      { icon: CHECK_ICON, color: 'var(--blue-hi)', label: 'Total Active', value: alerts.length, active: _filter === 'all', onClick: "OpsAlerts.setFilter('all')" },
    ]);
  }

  function setFilter(f) {
    _filter = f;
    updateStats(_allAlerts);
    const filtered = f === 'all' ? _allAlerts : _allAlerts.filter(a => severityClass(a.severity) === f);
    if (_pg) _pg.update(filtered);
    else renderFeed(filtered, f);
  }

  function refresh() {
    const feed = document.getElementById('al-feed');
    if (feed) feed.innerHTML = '<div style="padding:40px;text-align:center;color:var(--ink-3);"><div class="loading" style="margin:0 auto 12px;"></div><div style="font-size:var(--fs-base);">Refreshing…</div></div>';
    // Remove data-rendered so reload works
    const container = document.getElementById('content-alerts');
    if (container) container.removeAttribute('data-rendered');
    loadAlerts();
    loadCandidates();
  }

  function severityClass(s) {
    switch ((s || '').toLowerCase()) {
      case 'critical': return 'critical';
      case 'high':     return 'high';
      case 'moderate': return 'moderate';
      case 'minor':    return 'minor';
      default:         return 'minor';
    }
  }

  // one label, used everywhere, matching what the database actually stores
  function severityLabel(s) {
    const c = severityClass(s);
    return c.charAt(0).toUpperCase() + c.slice(1);
  }

  function severityIcon(s) {
    s = s?.toLowerCase();
    const colors = { critical: 'var(--err)', high: 'var(--caut)', moderate: 'var(--warn)', minor: 'var(--ink-3)' };
    const bgs    = { critical: 'var(--eb)',   high: 'var(--cb)',   moderate: 'var(--wb)',   minor: 'var(--surface-2)' };
    const sc     = severityClass(s);
    return { color: colors[sc] || 'var(--warn)', bg: bgs[sc] || 'var(--wb)' };
  }

  // maps the 4 real severities onto the shared .status-badge palette
  // (index.html) instead of a 3-bucket approximation:
  //   critical -> critical (red)   high -> warning (orange)
  //   moderate -> watch (amber)    minor -> offline (grey)
  function severityBadgeClass(s) {
    const m = { critical: 'critical', high: 'warning', moderate: 'watch', minor: 'offline' };
    return m[severityClass(s)] || 'watch';
  }

  function renderFeed(alerts, filter) {
    const feed = document.getElementById('al-feed');
    if (!feed) return;

    if (!alerts || alerts.length === 0) {
      feed.innerHTML = `
        <div class="al-empty">
          <svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.3" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div class="al-empty-title">${filter === 'all' ? 'No active alerts' : `No ${filter} alerts`}</div>
          <div class="al-empty-sub">All systems are operating normally</div>
        </div>`;
      return;
    }

    // Columns per spec: Alert ID, Alert Type, Property, Device, Severity, Trigger Time, Status, Assigned To
    feed.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="ops-table">
          <thead><tr>
            <th>Alert ID</th><th>Alert Type</th><th>Property</th><th>Device</th>
            <th>Severity</th><th>Trigger Time</th><th>Status</th><th>Assigned To</th>
          </tr></thead>
          <tbody>
            ${alerts.map(a => {
              const id = a.alert_id || a.id;
              const type = a.alert_type || a.type || 'System Alert';
              const location = a.location || a.property || a.property_name || a.site_name || '—';
              const status = a.status || 'active';
              return `<tr class="clickable" onclick="OpsAlerts.open('${id}')" tabindex="0" onkeydown="if(event.key==='Enter'){OpsAlerts.open('${id}')}">
                <td style="font-family:var(--ff-m);font-size:var(--fs-sm);" class="bright">${id}</td>
                <td>${type}</td>
                <td style="font-size:var(--fs-sm);">${_dash(location)}</td>
                <td style="font-size:var(--fs-sm);">${_dash(a.sensor_name || a.device_name)}</td>
                <td><span class="status-badge ${severityBadgeClass(a.severity)}">${severityLabel(a.severity)}</span></td>
                <td style="font-size:var(--fs-sm);font-family:var(--ff-m);">${formatTime(a.timestamp || a.created_at)}</td>
                <td><span class="status-badge ${status === 'resolved' ? 'nominal' : severityBadgeClass(a.severity)}">${status}</span></td>
                <td style="font-size:var(--fs-sm);">${a.assigned_team || '<span style="color:var(--ink-4);">Unassigned</span>'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function formatTime(ds) {
    if (!ds) return '—';
    const diff = Date.now() - new Date(ds).getTime();
    const mins = Math.floor(diff / 60000);
    const hrs  = Math.floor(diff / 3600000);
    if (mins < 1)  return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hrs  < 24) return `${hrs}h ago`;
    return new Date(ds).toLocaleDateString('en-GB', { day:'numeric', month:'short' });
  }

  function back() { if (_container) render(_container); }

  // ── FULL DETAIL SCREEN (no pop-up) ──
  function open(id) {
    if (!_container) return;
    const a = _allAlerts.find(x => (x.alert_id || x.id) == id);
    if (!a) { OpsModal.toast('Alert not found', 'warning'); return; }
    const status = a.status || 'active';
    const badge = status === 'resolved' ? 'nominal' : severityBadgeClass(a.severity);
    const field = (k, v) => `<div class="al-field"><div class="k">${k}</div><div class="v">${v}</div></div>`;
    const s = (title, body, needs) => `<div class="al-section"><div class="al-section-h">${title}${needs ? '<span class="al-needs">pending backend data</span>' : ''}</div><div class="al-section-b">${body}</div></div>`;

    const info = `<div class="al-grid">
      ${field('Alert ID', a.alert_id || a.id)}
      ${field('Alert Type', a.alert_type || a.type || 'System Alert')}
      ${field('Severity', `<span class="status-badge ${severityBadgeClass(a.severity)}">${severityLabel(a.severity)}</span>`)}
      ${field('Status', `<span class="status-badge ${badge}">${status}</span>`)}
      ${field('Property', a.property_id ? OpsModal.link('properties', a.property_id, a.property_name || a.property || a.location) : _dash(a.location || a.property || a.property_name || a.site_name))}
      ${field('Device', a.sensor_id ? OpsModal.link('sensors', a.sensor_id, a.sensor_name || a.device_name || a.sensor_id) : _dash(a.sensor_name || a.device_name))}
      ${field('Trigger Time', a.timestamp || a.created_at ? OpsModal.fmtDateTime(a.timestamp || a.created_at) : '—')}
      ${field('Assigned To', _dash(a.assigned_team))}
      ${a.time_to_overflow_min ? field('Time to Overflow', `<span style="color:var(--err);font-weight:700;">${a.time_to_overflow_min} min</span>`) : ''}
    </div>${a.description ? `<div style="margin-top:12px;">${field('Description', a.description)}</div>` : ''}`;

    const resolution = status === 'resolved'
      ? `<div class="al-grid">${field('Outcome', _dash(a.outcome))}${field('Resolved', a.resolved_at ? OpsModal.fmtDateTime(a.resolved_at) : '—')}</div>${a.notes ? `<div style="margin-top:12px;">${field('Notes', a.notes)}</div>` : ''}`
      : `<div class="al-empty">This incident is still open.</div>${a.notes ? `<div style="margin-top:10px;">${field('Field Notes', a.notes)}</div>` : ''}`;

    const actions = [
      status !== 'resolved' ? `<button class="btn-primary" onclick="OpsAlerts.assignAlert('${id}')">Assign Team</button>` : '',
      status !== 'resolved' ? `<button class="btn-ghost" onclick="OpsAlerts.resolveAlert('${id}')">Resolve</button>` : '',
    ].filter(Boolean).join('');

    _container.innerHTML = `
      <div class="al-detail-top">
        <button class="al-back" onclick="OpsAlerts.back()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>Alerts</button>
        <div>
          <div class="al-detail-name">${a.alert_type || 'System Alert'}</div>
          <div class="al-detail-meta">${a.alert_id || a.id} · ${_dash(a.location || a.property || a.site_name)}</div>
        </div>
        <div class="al-detail-actions">${actions}</div>
      </div>
      ${s('Alert Information', info)}
      ${s('Map', a.latitude && a.longitude ? `<div class="al-grid">${field('Latitude', a.latitude)}${field('Longitude', a.longitude)}</div><div style="margin-top:10px;"><a class="btn-ghost" style="text-decoration:none;padding:7px 12px;" onclick="switchTab('dashboard')">Open on operational map →</a></div>` : '<div class="al-empty">No coordinates on this alert.</div>', !(a.latitude && a.longitude))}
      ${s('Related Device', a.sensor_id ? `<div class="al-grid">${field('Device', OpsModal.link('sensors', a.sensor_id, a.sensor_name || a.sensor_id))}</div>` : '<div class="al-empty">No device linked.</div>')}
      ${s('Related Property', a.property_id ? `<div class="al-grid">${field('Property', OpsModal.link('properties', a.property_id, a.property_name || a.property || a.property_id))}</div>` : '<div class="al-empty">No property linked.</div>')}
      ${s('Timeline', `<div class="al-empty">Triggered ${a.timestamp || a.created_at ? OpsModal.fmtDateTime(a.timestamp || a.created_at) : '—'}${a.assigned_team ? ' · Assigned to ' + a.assigned_team : ''}${status === 'resolved' ? ' · Resolved' : ''}.</div>`, true)}
      ${s('Resolution', resolution)}
      ${s('Attachments', '<div class="al-empty">No attachments.</div>', true)}
      ${s('Activity Log', '<div class="al-empty">No activity log in this response.</div>', true)}
    `;
  }

  // ── Assign alert modal ──
  async function assignAlert(id) {
    // Load teams for the dropdown
    let teams = [];
    try {
      const res = await OpsModal.apiGet('/teams');
      teams = res.data || res.teams || [];
    } catch { /* show modal anyway with empty list */ }

    const a = _allAlerts.find(x => (x.alert_id || x.id) == id);
    const alertLabel = a ? (a.alert_type || 'Alert') : 'Alert';
    const location   = a ? (a.location || a.property || a.site_name || '') : '';

    const teamOptions = teams.length > 0
      ? teams.map(t => ({ value: t.team_id || t.id, label: t.team_name || t.name }))
      : [{ value: '', label: 'No teams available' }];

    OpsModal.open(`Assign Incident`, `
      <div style="padding:12px 14px;background:var(--surface-2);border-radius:8px;margin-bottom:18px;">
        <div style="font-size:var(--fs-base);font-weight:600;color:var(--ink);">${alertLabel}</div>
        ${location ? `<div style="font-size:var(--fs-sm);color:var(--ink-3);margin-top:2px;">${location}</div>` : ''}
      </div>
      ${OpsModal.field('Assign to Team', 'team_id', 'select', '', { options: teamOptions })}
      ${OpsModal.field('Priority Instructions (optional)', 'notes', 'textarea', '', { placeholder: 'E.g. High-pressure hydro-jetting required. Report on arrival.', required: false, rows: 3 })}
      ${OpsModal.field('ETA (minutes)', 'eta', 'number', '', { placeholder: '30', required: false })}
    `, [
      { label: 'Cancel',     class: 'btn-ghost',   onclick: 'OpsModal.close()' },
      { label: 'Dispatch',   class: 'btn-primary',  onclick: `OpsAlerts.confirmAssign('${id}')`, id: 'modal-save-btn' },
    ]);
  }

  async function confirmAssign(id) {
    const data = OpsModal.getFormData();
    if (!data.team_id) { OpsModal.toast('Please select a team', 'warning'); return; }

    OpsModal.setLoading('modal-save-btn', true);
    try {
      await OpsModal.apiPost(`/alerts/${id}/assign`, {
        team_id: data.team_id,
        notes:   data.notes || null,
        eta:     data.eta   ? parseInt(data.eta) : null,
      });
      OpsModal.close();
      OpsModal.toast('Team dispatched successfully', 'nominal');

      // Update local state optimistically
      const a = _allAlerts.find(x => (x.alert_id || x.id) == id);
      if (a) {
        const teams    = await OpsModal.apiGet('/teams').catch(() => ({ data: [] }));
        const team     = (teams.data || []).find(t => (t.team_id || t.id) == data.team_id);
        a.assigned_team = team ? (team.team_name || team.name) : 'Team dispatched';
      }

      renderFeed(_filter === 'all' ? _allAlerts : _allAlerts.filter(a => severityClass(a.severity) === _filter), _filter);
    } catch (err) {
      OpsModal.toast('Failed to assign: ' + err.message, 'critical');
      OpsModal.setLoading('modal-save-btn', false);
    }
  }

  // ── Resolve alert ──
  function resolveAlert(id) {
    const a = _allAlerts.find(x => (x.alert_id || x.id) == id);
    const label = a ? (a.alert_type || 'Alert') : 'Alert';

    OpsModal.confirm(`Mark "${label}" as resolved?`, async function () {
      OpsModal.setLoading('modal-confirm-btn', true);
      try {
        await OpsModal.apiPost(`/alerts/${id}/resolve`, {});
        OpsModal.close();
        OpsModal.toast('Alert resolved', 'nominal');

        // Remove from local list
        _allAlerts = _allAlerts.filter(x => (x.alert_id || x.id) != id);
        updateStats(_allAlerts);
        renderFeed(_filter === 'all' ? _allAlerts : _allAlerts.filter(a => severityClass(a.severity) === _filter), _filter);
        if (typeof updateAlertCount === 'function') updateAlertCount(_allAlerts.length);
      } catch (err) {
        OpsModal.toast('Failed to resolve: ' + err.message, 'critical');
        OpsModal.setLoading('modal-confirm-btn', false);
      }
    });
  }

  function renderError(message) {
    const feed = document.getElementById('al-feed');
    if (!feed) return;
    feed.innerHTML = `
      <div style="padding:48px;text-align:center;">
        <div style="color:var(--err);font-weight:700;margin-bottom:8px;font-size:var(--fs-md);">Failed to load alerts</div>
        <div style="color:var(--ink-3);font-size:var(--fs-sm);margin-bottom:18px;">${message}</div>
        <button class="btn-ghost" onclick="OpsAlerts.refresh()">Retry</button>
      </div>`;
  }

  return {
    render, setFilter, refresh, open, back, assignAlert, confirmAssign, resolveAlert,
    confirmCandidate, dismissCandidate, resolveCandidate,
  };

})();


// ============================================
// REPORTS MODULE
// ============================================

const OpsReports = (function () {
  'use strict';

  let _reports = [];
  let _rc = null;
  const _d = v => (v == null || v === '') ? '—' : v;

  function render(container) {
    _rc = container;
    container.innerHTML = `
      <style>
        .ops-table tbody tr.clickable { cursor:pointer; transition:background .12s; }
        .ops-table tbody tr.clickable:hover { background:var(--surface-2,#f2f8fb); }
        .rp-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; margin-bottom: 24px; }

        .rp-card {
          background: var(--surface, #fff);
          border: 1px solid var(--border, #dae6ef);
          border-radius: var(--r, 14px);
          padding: 24px 20px;
          cursor: pointer;
          transition: all .22s cubic-bezier(.22,1,.36,1);
          box-shadow: var(--sh-xs, 0 1px 2px rgba(10,31,46,.06));
          position: relative; overflow: hidden;
        }

        .rp-card::after {
          content: '';
          position: absolute; bottom: 0; left: 0; right: 0; height: 3px;
          opacity: 0; transition: opacity .22s;
        }

        .rp-card:hover { transform: translateY(-3px); box-shadow: var(--sh-md, 0 4px 20px rgba(10,31,46,.09)); border-color: var(--border-2, #b8d0de); }
        .rp-card:hover::after { opacity: 1; }

        .rp-card.daily::after   { background: linear-gradient(90deg, var(--navy, #0a2a3d), var(--blue, #16a8d3)); }
        .rp-card.weekly::after  { background: linear-gradient(90deg, var(--blue, #16a8d3), var(--ok, #0a8a6a)); }
        .rp-card.finance::after { background: linear-gradient(90deg, var(--ok, #0a8a6a), #34d399); }

        .rp-icon {
          width: 46px; height: 46px;
          border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 16px;
        }

        .rp-card-title { font-family: var(--ff-d, 'Space Grotesk', sans-serif); font-size: var(--fs-lg); font-weight: 700; color: var(--ink, #0a1f2e); margin-bottom: 4px; }
        .rp-card-sub   { font-size: var(--fs-sm); color: var(--ink-3, #6b8fa3); line-height: 1.5; }

        .rp-recent {
          background: var(--surface, #fff);
          border: 1px solid var(--border, #dae6ef);
          border-radius: var(--r, 14px);
          overflow: hidden;
          box-shadow: var(--sh-xs, 0 1px 2px rgba(10,31,46,.06));
        }

        .rp-recent-head {
          padding: 14px 20px;
          border-bottom: 1px solid var(--border, #dae6ef);
          display: flex; align-items: center; justify-content: space-between;
        }

        .rp-recent-title { font-family: var(--ff-d, 'Space Grotesk', sans-serif); font-size: var(--fs-md); font-weight: 700; color: var(--ink, #0a1f2e); }

        .rp-report-row {
          padding: 14px 20px;
          border-bottom: 1px solid var(--border, #dae6ef);
          display: flex; align-items: center; gap: 14px;
          transition: background .12s;
        }

        .rp-report-row:last-child { border-bottom: none; }
        .rp-report-row:hover { background: var(--surface-2, #f7fafc); }

        .rp-report-icon {
          width: 36px; height: 36px; border-radius: 9px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }

        .rp-report-name  { font-size: var(--fs-md); font-weight: 600; color: var(--ink, #0a1f2e); margin-bottom: 2px; }
        .rp-report-meta  { font-size: var(--fs-xs); color: var(--ink-3, #6b8fa3); font-family: var(--ff-m, 'JetBrains Mono', monospace); }
      </style>

      <div class="rp-grid">
        <div class="rp-card daily" onclick="OpsReports.generate('daily')">
          <div class="rp-icon" style="background:rgba(10,42,61,.07);">
            <svg width="20" height="20" fill="none" stroke="var(--navy)" stroke-width="1.8" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </div>
          <div class="rp-card-title">Daily Operations</div>
          <div class="rp-card-sub">Today's alert activity, team deployment summary, and incident resolution rate</div>
        </div>

        <div class="rp-card weekly" onclick="OpsReports.generate('weekly')">
          <div class="rp-icon" style="background:rgba(22,168,211,.08);">
            <svg width="20" height="20" fill="none" stroke="var(--blue)" stroke-width="1.8" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
          </div>
          <div class="rp-card-title">Weekly Performance</div>
          <div class="rp-card-sub">Sensor uptime, SLA compliance, response times, and pipeline movement</div>
        </div>

        <div class="rp-card finance" onclick="OpsReports.generate('financial')">
          <div class="rp-icon" style="background:var(--ok-bg, #e2f5ee);">
            <svg width="20" height="20" fill="none" stroke="var(--ok)" stroke-width="1.8" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <div class="rp-card-title">Financial Report</div>
          <div class="rp-card-sub">MRR breakdown, client billing status, outstanding invoices, and revenue trends</div>
        </div>
      </div>

      <div class="rp-recent">
        <div class="rp-recent-head">
          <div class="rp-recent-title">Recent Reports</div>
        </div>
        <div id="rp-list">
          <div style="padding:40px;text-align:center;color:var(--ink-3);">
            <div class="loading" style="margin:0 auto 12px;"></div>
            <div style="font-size:var(--fs-base);">Loading reports…</div>
          </div>
        </div>
      </div>
    `;

    loadReports();
  }

  async function loadReports() {
    try {
      const res  = await OpsModal.apiGet('/reports');
      const list = res.data || res.reports || [];
      _reports = list;
      renderReports(list);
    } catch {
      renderReports([]);
    }
  }

  function renderReports(reports) {
    const el = document.getElementById('rp-list');
    if (!el) return;

    if (reports.length === 0) {
      el.innerHTML = `
        <div style="padding:48px;text-align:center;color:var(--ink-3);">
          <svg width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.3" viewBox="0 0 24 24" style="margin:0 auto 12px;opacity:.25;display:block;">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <div style="font-size:var(--fs-base);font-weight:600;color:var(--ink-2);">No reports generated yet</div>
          <div style="font-size:var(--fs-sm);margin-top:3px;">Generate your first report above</div>
        </div>`;
      return;
    }

    const typeConfig = {
      daily:     { icon: 'var(--navy)',    bg: 'rgba(10,42,61,.07)',     label: 'Daily Operations' },
      weekly:    { icon: 'var(--blue)',    bg: 'rgba(22,168,211,.08)',   label: 'Weekly Performance' },
      financial: { icon: 'var(--ok)',      bg: 'var(--ok-bg)',           label: 'Financial Report' },
    };

    const fmtOf = r => (r.format || (r.download_url ? (r.download_url.split('.').pop() || '').toUpperCase().slice(0, 4) : '')) || '—';
    // Columns per spec: Report, Category, Property, Date, Generated By, Format
    el.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="ops-table">
          <thead><tr><th>Report</th><th>Category</th><th>Property</th><th>Date</th><th>Generated By</th><th>Format</th></tr></thead>
          <tbody>
            ${reports.map((r, i) => {
              const tc = typeConfig[r.type] || typeConfig.daily;
              const date = r.generated_at ? new Date(r.generated_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
              return `<tr class="clickable" onclick="OpsReports.open(${i})" tabindex="0" onkeydown="if(event.key==='Enter'){OpsReports.open(${i})}">
                <td class="bright">${r.name || tc.label}</td>
                <td style="font-size:var(--fs-sm);">${tc.label}</td>
                <td style="font-size:var(--fs-sm);">${_d(r.property_name)}</td>
                <td style="font-size:var(--fs-sm);font-family:var(--ff-m);">${date}</td>
                <td style="font-size:var(--fs-sm);">${_d(r.generated_by || r.generated_by_name)}</td>
                <td style="font-size:var(--fs-sm);">${fmtOf(r)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function back() { if (_rc) render(_rc); }

  // ── FULL DETAIL SCREEN (no pop-up) ──
  function open(i) {
    const r = _reports[i];
    if (!_rc || !r) return;
    const typeConfig = { daily: { label: 'Daily Operations' }, weekly: { label: 'Weekly Performance' }, financial: { label: 'Financial Report' }, monthly: { label: 'Monthly Report' } };
    const date = r.generated_at ? new Date(r.generated_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    const field = (k, v) => `<div style="margin-bottom:2px;"><div style="font-size:var(--fs-2xs);font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:var(--ink-3);">${k}</div><div style="font-size:var(--fs-md);color:var(--ink);font-weight:600;margin-top:3px;">${v}</div></div>`;
    const sec = (t, b, needs) => `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r,14px);box-shadow:var(--sh-xs);margin-bottom:14px;overflow:hidden;"><div style="padding:12px 18px;border-bottom:1px solid var(--border);font-family:var(--ff-d);font-size:var(--fs-sm);font-weight:700;color:var(--ink);display:flex;justify-content:space-between;">${t}${needs ? '<span style="font-size:var(--fs-xs);color:var(--ink-4);font-style:italic;">pending backend data</span>' : ''}</div><div style="padding:16px 18px;">${b}</div></div>`;
    const preview = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px 22px;">
      ${field('Report', r.name || (typeConfig[r.type] || typeConfig.daily).label)}
      ${field('Category', (typeConfig[r.type] || typeConfig.daily).label)}
      ${field('Date', date)}
      ${field('Generated By', _d(r.generated_by || r.generated_by_name))}
    </div>${r.download_url ? `<div style="margin-top:14px;"><a href="${r.download_url}" target="_blank" rel="noopener"><button class="btn-primary" style="font-size:var(--fs-sm);">Open / Download report</button></a></div>` : '<div style="color:var(--ink-3);font-size:var(--fs-sm);margin-top:12px;">No downloadable file for this report.</div>'}`;

    _rc.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;flex-wrap:wrap;">
        <button class="btn-ghost" onclick="OpsReports.back()" style="display:inline-flex;align-items:center;gap:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>Reports</button>
        <div><div style="font-family:var(--ff-d);font-size:var(--fs-xl);font-weight:700;color:var(--ink);">${r.name || (typeConfig[r.type] || typeConfig.daily).label}</div><div style="font-size:var(--fs-sm);color:var(--ink-3);margin-top:3px;">${date}</div></div>
      </div>
      ${sec('Report Preview', preview)}
      ${sec('Charts', '<div style="color:var(--ink-3);font-size:var(--fs-sm);">Chart previews render from the report payload.</div>', true)}
      ${sec('Filters', '<div style="color:var(--ink-3);font-size:var(--fs-sm);">No filter metadata in this response.</div>', true)}
      ${sec('Export', r.download_url ? `<a href="${r.download_url}" target="_blank" rel="noopener" style="color:var(--blue-hi);">Download file →</a>` : '<div style="color:var(--ink-3);font-size:var(--fs-sm);">No export available.</div>')}
      ${sec('Share', '<div style="color:var(--ink-3);font-size:var(--fs-sm);">Sharing links are generated on export.</div>', true)}
    `;
  }

  async function generate(type) {
    OpsModal.toast(`Generating ${type} report…`, 'watch');
    try {
      await OpsModal.apiPost('/reports/generate', { type });
      OpsModal.toast('Report generated successfully', 'nominal');
      loadReports();
    } catch (err) {
      OpsModal.toast('Failed to generate report: ' + err.message, 'critical');
    }
  }

  return { render, generate, open, back };

})();
