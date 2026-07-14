// ============================================
// ALERTS MODULE
// Full redesign — viewAlert, assignAlert, resolveAlert all wired
// ============================================

const OpsAlerts = (function () {
  'use strict';

  let _allAlerts = [];
  let _filter    = 'all';
  let _pg        = null;

  function getToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token');
  }

  function render(container) {
    container.innerHTML = `
      <style>
        /* ── Stats row ── */
        .al-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
          margin-bottom: 20px;
        }

        .al-stat {
          background: var(--surface, #fff);
          border: 1px solid var(--border, #dae6ef);
          border-radius: var(--r, 10px);
          padding: 18px 20px;
          position: relative; overflow: hidden;
          box-shadow: var(--sh-xs, 0 1px 2px rgba(10,31,46,.06));
          transition: all .2s;
        }

        .al-stat:hover { transform: translateY(-2px); box-shadow: var(--sh-md, 0 4px 20px rgba(10,31,46,.09)); }

        .al-stat::after {
          content: '';
          position: absolute; bottom: 0; left: 0; right: 0; height: 3px;
        }

        .al-stat.critical::after { background: var(--err, #dc2626); }
        .al-stat.high::after     { background: var(--caut, #c2410c); }
        .al-stat.moderate::after { background: var(--warn, #b45309); }
        .al-stat.minor::after    { background: var(--ink-3, #64748b); }
        .al-stat.warning::after  { background: var(--caut, #c2410c); }
        .al-stat.watch::after    { background: var(--warn, #b45309); }
        .al-stat.total::after    { background: linear-gradient(90deg, var(--navy, #0a2a3d), var(--blue, #16a8d3)); }

        .al-stat-label {
          font-size: .62rem; font-weight: 700;
          letter-spacing: 1.5px; text-transform: uppercase;
          color: var(--ink-3, #6b8fa3); margin-bottom: 6px;
        }

        .al-stat-val {
          font-family: var(--ff-d, 'Playfair Display', serif);
          font-size: 2.2rem; font-weight: 900;
          line-height: 1; letter-spacing: -.03em;
          color: var(--ink, #0a1f2e);
        }

        .al-stat-val.critical { color: var(--err, #dc2626); }
        .al-stat-val.high     { color: var(--caut, #c2410c); }
        .al-stat-val.moderate { color: var(--warn, #b45309); }
        .al-stat-val.minor    { color: var(--ink-3, #64748b); }
        .al-stat-val.warning  { color: var(--caut, #c2410c); }
        .al-stat-val.watch    { color: var(--warn, #b45309); }
        .severity-high     { border-left-color: var(--caut, #c2410c) !important; }
        .severity-moderate { border-left-color: var(--warn, #b45309) !important; }
        .severity-minor    { border-left-color: var(--ink-3, #64748b) !important; }

        /* ── Filter tabs ── */
        .al-filters {
          display: flex; align-items: center; gap: 6px;
          margin-bottom: 16px;
        }

        .al-filter-btn {
          padding: 6px 16px;
          border-radius: 20px;
          border: 1px solid var(--border, #dae6ef);
          background: var(--surface, #fff);
          font-family: var(--ff-b, 'Figtree', sans-serif);
          font-size: .78rem; font-weight: 600;
          color: var(--ink-3, #6b8fa3);
          cursor: pointer; transition: all .18s;
        }

        .al-filter-btn:hover { border-color: var(--border-2, #b8d0de); color: var(--ink-2, #2d5068); }

        .al-filter-btn.active {
          background: var(--navy, #0a2a3d);
          border-color: var(--navy, #0a2a3d);
          color: white;
        }

        .al-filter-btn.active.critical { background: var(--err, #dc2626); border-color: var(--err, #dc2626); }
        .al-filter-btn.active.warning  { background: var(--caut, #c2410c); border-color: var(--caut, #c2410c); }
        .al-filter-btn.active.watch    { background: var(--warn, #b45309); border-color: var(--warn, #b45309); }

        .al-count-pill {
          display: inline-flex; align-items: center; justify-content: center;
          width: 18px; height: 18px; border-radius: 50%;
          font-size: .62rem; font-weight: 700;
          background: rgba(255,255,255,.2);
          margin-left: 4px;
        }

        /* ── Feed card ── */
        .al-feed-card {
          background: var(--surface, #fff);
          border: 1px solid var(--border, #dae6ef);
          border-radius: var(--r, 10px);
          overflow: hidden;
          box-shadow: var(--sh-xs, 0 1px 2px rgba(10,31,46,.06));
        }

        .al-feed-head {
          padding: 14px 20px;
          border-bottom: 1px solid var(--border, #dae6ef);
          display: flex; align-items: center; justify-content: space-between;
        }

        .al-feed-title {
          font-family: var(--ff-d, 'Playfair Display', serif);
          font-size: .9rem; font-weight: 700; color: var(--ink, #0a1f2e);
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
          font-size: .88rem; font-weight: 700;
          color: var(--ink, #0a1f2e);
        }

        .al-row-location {
          font-size: .79rem; color: var(--ink-3, #6b8fa3);
          margin-bottom: 3px;
          display: flex; align-items: center; gap: 4px;
        }

        .al-row-meta {
          display: flex; align-items: center; gap: 10px;
          font-size: .72rem; color: var(--ink-4, #9eb8c8);
          font-family: var(--ff-m, 'JetBrains Mono', monospace);
        }

        .al-row-assigned {
          margin-top: 8px; padding: 6px 10px;
          background: var(--surface-3, #eef4f8);
          border-radius: 6px;
          font-size: .75rem; color: var(--ink-2, #2d5068);
          display: flex; align-items: center; gap: 6px;
        }

        .al-row-actions {
          display: flex; align-items: center;
          gap: 6px; flex-shrink: 0;
        }

        .al-action-btn {
          padding: 6px 14px;
          border-radius: var(--rs, 6px);
          border: 1px solid var(--border, #dae6ef);
          background: var(--surface-2, #f7fafc);
          font-family: var(--ff-b, 'Figtree', sans-serif);
          font-size: .75rem; font-weight: 600;
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
        .al-empty-title { font-size: .9rem; font-weight: 600; color: var(--ink-2, #2d5068); margin-bottom: 4px; }
        .al-empty-sub   { font-size: .78rem; }
      </style>

      <!-- Stats -->
      <div class="al-stats">
        <div class="al-stat critical">
          <div class="al-stat-label">Critical</div>
          <div class="al-stat-val critical" id="al-critical">—</div>
        </div>
        <div class="al-stat warning">
          <div class="al-stat-label">Warning</div>
          <div class="al-stat-val warning" id="al-warning">—</div>
        </div>
        <div class="al-stat watch">
          <div class="al-stat-label">Watch</div>
          <div class="al-stat-val watch" id="al-watch">—</div>
        </div>
        <div class="al-stat total">
          <div class="al-stat-label">Total Active</div>
          <div class="al-stat-val" id="al-total">—</div>
        </div>
      </div>

      <!-- Filters -->
      <div class="al-filters">
        <button class="al-filter-btn active" id="filter-all"      onclick="OpsAlerts.setFilter('all')">All</button>
        <button class="al-filter-btn critical" id="filter-critical" onclick="OpsAlerts.setFilter('critical')">Critical</button>
        <button class="al-filter-btn warning"  id="filter-warning"  onclick="OpsAlerts.setFilter('warning')">Warning</button>
        <button class="al-filter-btn watch"    id="filter-watch"    onclick="OpsAlerts.setFilter('watch')">Watch</button>
      </div>

      <!-- Feed -->
      <div class="al-feed-card">
        <div class="al-feed-head">
          <div class="al-feed-title">Active Incidents</div>
          <button class="btn-ghost" onclick="OpsAlerts.refresh()" style="font-size:.76rem;padding:6px 12px;">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            Refresh
          </button>
        </div>
        <div class="al-feed-body" id="al-feed">
          <div style="padding:40px;text-align:center;color:var(--ink-3);">
            <div class="loading" style="margin:0 auto 12px;"></div>
            <div style="font-size:.82rem;">Loading alerts…</div>
          </div>
        </div>
      </div>
    `;

    loadAlerts();
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

  function updateStats(alerts) {
    // alerts.severity CHECK constraint: critical | high | moderate | minor.
    // This used to fold 'high' into "Warning" and both 'moderate' and 'minor'
    // into "Watch" — so the same incident read High on the dashboard and
    // Warning here, and a minor was indistinguishable from a moderate.
    let critical = 0, high = 0, moderate = 0, minor = 0;
    alerts.forEach(a => {
      switch ((a.severity || '').toLowerCase()) {
        case 'critical': critical++; break;
        case 'high':     high++;     break;
        case 'moderate': moderate++; break;
        default:         minor++;
      }
    });
    const warning = high, watch = moderate + minor;   // legacy names still referenced below
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('al-critical', critical);
    set('al-warning',  warning);
    set('al-watch',    watch);
    set('al-total',    alerts.length);
  }

  function setFilter(f) {
    _filter = f;
    ['all','critical','warning','watch'].forEach(k => {
      const btn = document.getElementById(`filter-${k}`);
      if (btn) btn.classList.toggle('active', k === f);
    });
    const filtered = f === 'all' ? _allAlerts : _allAlerts.filter(a => {
      const s = a.severity?.toLowerCase();
      if (f === 'critical') return s === 'critical';
      if (f === 'warning')  return s === 'high' || s === 'warning';
      if (f === 'watch')    return s !== 'critical' && s !== 'high' && s !== 'warning';
      return true;
    });
    if (_pg) _pg.update(filtered);
    else renderFeed(filtered, f);
  }

  function refresh() {
    const feed = document.getElementById('al-feed');
    if (feed) feed.innerHTML = '<div style="padding:40px;text-align:center;color:var(--ink-3);"><div class="loading" style="margin:0 auto 12px;"></div><div style="font-size:.82rem;">Refreshing…</div></div>';
    // Remove data-rendered so reload works
    const container = document.getElementById('content-alerts');
    if (container) container.removeAttribute('data-rendered');
    loadAlerts();
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

    feed.innerHTML = alerts.map(a => {
      const id       = a.alert_id || a.id;
      const sc       = severityClass(a.severity);
      const ico      = severityIcon(a.severity);
      const isPending = !a.assigned_team && a.status !== 'resolved';
      const time     = formatTime(a.timestamp || a.created_at);
      const location = a.location || a.property || a.site_name || '—';
      const type     = a.alert_type || a.type || 'System Alert';

      return `
        <div class="al-row severity-${sc}" id="al-row-${id}">
          <div class="al-row-icon" style="background:${ico.bg};">
            <svg width="16" height="16" fill="none" stroke="${ico.color}" stroke-width="2.2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            </svg>
          </div>

          <div class="al-row-body">
            <div class="al-row-top">
              <span class="status-badge ${sc === 'watch' ? 'watch' : sc === 'warning' ? 'warning' : 'critical'}">${a.severity || sc}</span>
              <span class="al-row-title">${type}</span>
            </div>
            <div class="al-row-location">
              <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              ${location}
            </div>
            <div class="al-row-meta">
              <span>${time}</span>
              ${a.sensor_name ? `<span>· ${a.sensor_name}</span>` : ''}
              ${a.time_to_overflow_min ? `<span style="color:var(--err);font-weight:600;">· Overflow in ${a.time_to_overflow_min} min</span>` : ''}
            </div>
            ${a.assigned_team ? `
              <div class="al-row-assigned">
                <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0112 0v2"/></svg>
                Assigned to <strong>${a.assigned_team}</strong>
              </div>` : ''}
          </div>

          <div class="al-row-actions">
            ${isPending ? `
              <button class="al-action-btn primary" onclick="OpsAlerts.assignAlert('${id}')">
                Assign
              </button>` : ''}
            <button class="al-action-btn" onclick="OpsAlerts.viewAlert('${id}')">
              View
            </button>
            ${a.status !== 'resolved' ? `
              <button class="al-action-btn resolve" onclick="OpsAlerts.resolveAlert('${id}')">
                Resolve
              </button>` : ''}
          </div>
        </div>
      `;
    }).join('');
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

  // ── View alert modal ──
  async function viewAlert(id) {
    const a = _allAlerts.find(x => (x.alert_id || x.id) == id);
    if (!a) { OpsModal.toast('Alert not found', 'warning'); return; }

    const sc    = severityClass(a.severity);
    const ico   = severityIcon(a.severity);
    const time  = a.timestamp || a.created_at;

    OpsModal.open(`Incident — ${a.alert_type || 'Alert'}`, `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;padding:14px 16px;background:${ico.bg};border-radius:10px;border:1px solid ${ico.color}25;">
        <div style="width:40px;height:40px;border-radius:10px;background:${ico.color}20;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="18" height="18" fill="none" stroke="${ico.color}" stroke-width="2.2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
        </div>
        <div>
          <div style="font-family:var(--ff-d);font-size:1rem;font-weight:700;color:var(--ink);">${a.alert_type || 'System Alert'}</div>
          <div style="font-size:.78rem;color:${ico.color};font-weight:600;text-transform:uppercase;letter-spacing:.5px;">${a.severity} severity</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
        <div class="ops-modal-detail"><span class="label">Location</span><span class="value">${a.location || a.property || '—'}</span></div>
        <div class="ops-modal-detail"><span class="label">Sensor</span><span class="value">${a.sensor_name || '—'}</span></div>
        <div class="ops-modal-detail"><span class="label">Site</span><span class="value">${a.site_name || '—'}</span></div>
        <div class="ops-modal-detail"><span class="label">Status</span><span class="value"><span class="status-badge ${a.status === 'resolved' ? 'nominal' : sc === 'critical' ? 'critical' : 'watch'}">${a.status || 'active'}</span></span></div>
        <div class="ops-modal-detail"><span class="label">Reported</span><span class="value">${time ? new Date(time).toLocaleString() : '—'}</span></div>
        <div class="ops-modal-detail"><span class="label">Assigned To</span><span class="value">${a.assigned_team || 'Unassigned'}</span></div>
        ${a.time_to_overflow_min ? `<div class="ops-modal-detail" style="grid-column:1/-1;"><span class="label">Time to Overflow</span><span class="value" style="color:var(--err);font-weight:700;">${a.time_to_overflow_min} minutes</span></div>` : ''}
      </div>

      ${a.description ? `
        <div style="margin-bottom:14px;">
          <div style="font-size:.68rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--ink-3);margin-bottom:6px;">Description</div>
          <div style="font-size:.84rem;color:var(--ink-2);line-height:1.6;padding:12px 14px;background:var(--surface-2);border-radius:8px;">${a.description}</div>
        </div>` : ''}

      ${a.notes ? `
        <div style="margin-bottom:14px;">
          <div style="font-size:.68rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--ink-3);margin-bottom:6px;">Field Notes</div>
          <div style="font-size:.84rem;color:var(--ink-2);line-height:1.6;padding:12px 14px;background:var(--surface-2);border-radius:8px;">${a.notes}</div>
        </div>` : ''}
    `, [
      { label: 'Close',         class: 'btn-ghost',    onclick: 'OpsModal.close()' },
      { label: 'Assign Team',   class: 'btn-primary',  onclick: `OpsModal.close();OpsAlerts.assignAlert('${id}')`, id: 'modal-assign-btn' },
      ...(a.status !== 'resolved' ? [{ label: 'Resolve', class: 'btn-ghost', onclick: `OpsModal.close();OpsAlerts.resolveAlert('${id}')` }] : []),
    ]);
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
        <div style="font-size:.82rem;font-weight:600;color:var(--ink);">${alertLabel}</div>
        ${location ? `<div style="font-size:.76rem;color:var(--ink-3);margin-top:2px;">${location}</div>` : ''}
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
        <div style="color:var(--err);font-weight:700;margin-bottom:8px;font-size:.88rem;">Failed to load alerts</div>
        <div style="color:var(--ink-3);font-size:.78rem;margin-bottom:18px;">${message}</div>
        <button class="btn-ghost" onclick="OpsAlerts.refresh()">Retry</button>
      </div>`;
  }

  return { render, setFilter, refresh, viewAlert, assignAlert, confirmAssign, resolveAlert };

})();


// ============================================
// REPORTS MODULE
// ============================================

const OpsReports = (function () {
  'use strict';

  function render(container) {
    container.innerHTML = `
      <style>
        .rp-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; margin-bottom: 24px; }

        .rp-card {
          background: var(--surface, #fff);
          border: 1px solid var(--border, #dae6ef);
          border-radius: var(--r, 10px);
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

        .rp-card-title { font-family: var(--ff-d, 'Playfair Display', serif); font-size: .95rem; font-weight: 700; color: var(--ink, #0a1f2e); margin-bottom: 4px; }
        .rp-card-sub   { font-size: .76rem; color: var(--ink-3, #6b8fa3); line-height: 1.5; }

        .rp-recent {
          background: var(--surface, #fff);
          border: 1px solid var(--border, #dae6ef);
          border-radius: var(--r, 10px);
          overflow: hidden;
          box-shadow: var(--sh-xs, 0 1px 2px rgba(10,31,46,.06));
        }

        .rp-recent-head {
          padding: 14px 20px;
          border-bottom: 1px solid var(--border, #dae6ef);
          display: flex; align-items: center; justify-content: space-between;
        }

        .rp-recent-title { font-family: var(--ff-d, 'Playfair Display', serif); font-size: .9rem; font-weight: 700; color: var(--ink, #0a1f2e); }

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

        .rp-report-name  { font-size: .85rem; font-weight: 600; color: var(--ink, #0a1f2e); margin-bottom: 2px; }
        .rp-report-meta  { font-size: .72rem; color: var(--ink-3, #6b8fa3); font-family: var(--ff-m, 'JetBrains Mono', monospace); }
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
            <div style="font-size:.82rem;">Loading reports…</div>
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
          <div style="font-size:.84rem;font-weight:600;color:var(--ink-2);">No reports generated yet</div>
          <div style="font-size:.76rem;margin-top:3px;">Generate your first report above</div>
        </div>`;
      return;
    }

    const typeConfig = {
      daily:     { icon: 'var(--navy)',    bg: 'rgba(10,42,61,.07)',     label: 'Daily Operations' },
      weekly:    { icon: 'var(--blue)',    bg: 'rgba(22,168,211,.08)',   label: 'Weekly Performance' },
      financial: { icon: 'var(--ok)',      bg: 'var(--ok-bg)',           label: 'Financial Report' },
    };

    el.innerHTML = reports.map(r => {
      const tc   = typeConfig[r.type] || typeConfig.daily;
      const date = r.generated_at ? new Date(r.generated_at).toLocaleString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
      return `
        <div class="rp-report-row">
          <div class="rp-report-icon" style="background:${tc.bg};">
            <svg width="16" height="16" fill="none" stroke="${tc.icon}" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </div>
          <div style="flex:1;min-width:0;">
            <div class="rp-report-name">${r.name || tc.label}</div>
            <div class="rp-report-meta">${date}</div>
          </div>
          ${r.download_url ? `
            <a href="${r.download_url}" target="_blank" rel="noopener">
              <button class="btn-ghost" style="font-size:.76rem;padding:6px 12px;">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                Download
              </button>
            </a>` : ''}
        </div>`;
    }).join('');
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

  return { render, generate };

})();
