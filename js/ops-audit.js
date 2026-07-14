// ============================================
// OPS AUDIT LOG MODULE v1.0.0
// Every significant action logged with actor,
// timestamp, target, and before/after state.
//
// API contracts expected:
//   GET /audit-logs?page=1&limit=50&action=&actor=&from=&to=
//     → { data: [AuditLog], total, page }
//
// AuditLog shape:
//   { id, actor_name, actor_role, action, target_type,
//     target_id, target_label, description, metadata,
//     ip_address, created_at }
// ============================================

const OpsAudit = (function () {
  'use strict';

  let _logs   = [];
  let _pg     = null;
  let _filters = { action: '', actor: '', from: '', to: '' };

  // Action categories with colours
  const ACTION_CONFIG = {
    // Dispatch & Alerts
    alert_assigned:    { label:'Alert Assigned',    color:'var(--warn,#b45309)',  bg:'var(--wb,#fef3c7)' },
    alert_resolved:    { label:'Alert Resolved',    color:'var(--ok,#0a8a6a)',    bg:'var(--ok-bg,#e2f5ee)' },
    team_dispatched:   { label:'Team Dispatched',   color:'var(--blue,#16a8d3)',  bg:'rgba(22,168,211,.08)' },
    // Client & Property
    client_created:    { label:'Client Created',    color:'var(--ok,#0a8a6a)',    bg:'var(--ok-bg,#e2f5ee)' },
    client_updated:    { label:'Client Updated',    color:'var(--blue,#16a8d3)',  bg:'rgba(22,168,211,.08)' },
    area_submitted:    { label:'Area Submitted',    color:'var(--blue,#16a8d3)',  bg:'rgba(22,168,211,.08)' },
    area_updated:      { label:'Area Updated',      color:'var(--blue,#16a8d3)',  bg:'rgba(22,168,211,.08)' },
    inspection_scheduled: { label:'Inspection Scheduled', color:'var(--amber,#f5a623)', bg:'var(--ambb,rgba(245,166,35,.09))' },
    // Auth
    user_login:        { label:'Login',             color:'var(--ink-3,#6b8fa3)', bg:'var(--surface-2,#f7fafc)' },
    user_logout:       { label:'Logout',            color:'var(--ink-3,#6b8fa3)', bg:'var(--surface-2,#f7fafc)' },
    user_invited:      { label:'User Invited',      color:'var(--ok,#0a8a6a)',    bg:'var(--ok-bg,#e2f5ee)' },
    user_deactivated:  { label:'User Deactivated',  color:'var(--err,#dc2626)',   bg:'var(--eb,#fef2f2)' },
    // Billing
    invoice_paid:      { label:'Invoice Paid',      color:'var(--ok,#0a8a6a)',    bg:'var(--ok-bg,#e2f5ee)' },
    reminder_sent:     { label:'Reminder Sent',     color:'var(--warn,#b45309)',  bg:'var(--wb,#fef3c7)' },
    // Settings
    settings_updated:  { label:'Settings Updated',  color:'var(--ink-2,#2d5068)', bg:'var(--surface-2,#f7fafc)' },
    // Team
    team_created:      { label:'Team Created',      color:'var(--blue,#16a8d3)',  bg:'rgba(22,168,211,.08)' },
    member_added:      { label:'Member Added',      color:'var(--ok,#0a8a6a)',    bg:'var(--ok-bg,#e2f5ee)' },
    member_removed:    { label:'Member Removed',    color:'var(--err,#dc2626)',   bg:'var(--eb,#fef2f2)' },
    // SLA
    sla_breach:        { label:'SLA Breach',        color:'var(--err,#dc2626)',   bg:'var(--eb,#fef2f2)' },
    breach_acknowledged: { label:'Breach Acknowledged', color:'var(--ok,#0a8a6a)', bg:'var(--ok-bg,#e2f5ee)' },
  };

  function getActionConfig(action) {
    return ACTION_CONFIG[action] || { label: (action || 'Action').replace(/_/g, ' '), color:'var(--ink-3)', bg:'var(--surface-2)' };
  }

  function render(container) {
    container.innerHTML = `
      <style>
        .au-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:20px; }
        .au-header-title { font-family:var(--ff-d,'Space Grotesk',sans-serif); font-size:1.3rem; font-weight:800; color:var(--ink,#0a1f2e); letter-spacing:-.02em; margin-bottom:3px; }
        .au-header-sub { font-size:.8rem; color:var(--ink-3,#6b8fa3); }

        /* Filters bar */
        .au-filters { background:var(--surface,#fff); border:1px solid var(--border,#dae6ef); border-radius:var(--r,14px); padding:14px 20px; display:flex; align-items:center; gap:10px; margin-bottom:16px; box-shadow:var(--sh-xs); flex-wrap:wrap; }
        .au-filter-input { padding:7px 12px; border:1px solid var(--border,#dae6ef); border-radius:var(--rs,9px); background:var(--surface-2,#f7fafc); font-family:var(--ff-b,'Inter',sans-serif); font-size:.8rem; color:var(--ink,#0a1f2e); outline:none; transition:all .2s; }
        .au-filter-input:focus { border-color:var(--blue,#16a8d3); box-shadow:0 0 0 3px rgba(22,168,211,.1); background:var(--surface,#fff); }
        .au-filter-label { font-size:.68rem; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:var(--ink-3,#6b8fa3); }

        /* Log table */
        .au-card { background:var(--surface,#fff); border:1px solid var(--border,#dae6ef); border-radius:var(--r,14px); overflow:hidden; box-shadow:var(--sh-xs); }
        .au-card-head { padding:14px 20px; border-bottom:1px solid var(--border,#dae6ef); display:flex; align-items:center; justify-content:space-between; }
        .au-card-title { font-family:var(--ff-d,'Space Grotesk',sans-serif); font-size:.9rem; font-weight:700; color:var(--ink,#0a1f2e); }

        /* Log row */
        .au-row { padding:12px 20px; border-bottom:1px solid var(--border,#dae6ef); display:flex; align-items:flex-start; gap:12px; transition:background .12s; cursor:pointer; }
        .au-row:last-child { border-bottom:none; }
        .au-row:hover { background:var(--surface-2,#f7fafc); }

        .au-icon { width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:1px; }

        .au-body { flex:1; min-width:0; }
        .au-action-row { display:flex; align-items:center; gap:8px; margin-bottom:3px; flex-wrap:wrap; }
        .au-action-badge { display:inline-flex; padding:2px 8px; border-radius:12px; font-size:.68rem; font-weight:700; letter-spacing:.3px; white-space:nowrap; }
        .au-desc { font-size:.82rem; color:var(--ink-2,#2d5068); line-height:1.4; }
        .au-meta { font-size:.72rem; color:var(--ink-4,#9eb8c8); margin-top:3px; font-family:var(--ff-m,'JetBrains Mono',monospace); display:flex; align-items:center; gap:8px; }

        .au-actor { display:flex; align-items:center; gap:6px; flex-shrink:0; }
        .au-actor-av { width:26px; height:26px; border-radius:7px; display:flex; align-items:center; justify-content:center; font-size:.62rem; font-weight:700; color:white; flex-shrink:0; font-family:var(--ff-m,'JetBrains Mono',monospace); }
        .au-actor-name { font-size:.78rem; font-weight:600; color:var(--ink-2,#2d5068); white-space:nowrap; }
        .au-actor-role { font-size:.68rem; color:var(--ink-4,#9eb8c8); }
        .au-time { font-family:var(--ff-m,'JetBrains Mono',monospace); font-size:.7rem; color:var(--ink-4,#9eb8c8); flex-shrink:0; white-space:nowrap; }
      </style>

      <div class="au-header">
        <div>
          <div class="au-header-title">Audit Log</div>
          <div class="au-header-sub">Every significant action with actor, timestamp, and context</div>
        </div>
        <button class="btn-ghost" onclick="reloadTab('audit')" style="font-size:.8rem;padding:7px 14px;">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="margin-right:5px;"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          Refresh
        </button>
      </div>

      <!-- Filters -->
      <div class="au-filters">
        <span class="au-filter-label">Filter by</span>
        <select class="au-filter-input" id="au-action-filter" onchange="OpsAudit.applyFilters()">
          <option value="">All actions</option>
          ${Object.entries(ACTION_CONFIG).map(([k,v]) => `<option value="${k}">${v.label}</option>`).join('')}
        </select>
        <input class="au-filter-input" id="au-actor-filter" placeholder="Actor name…" oninput="OpsAudit.applyFilters()" style="width:160px;">
        <input class="au-filter-input" type="date" id="au-from-filter" onchange="OpsAudit.applyFilters()" title="From date">
        <span style="font-size:.78rem;color:var(--ink-3);">→</span>
        <input class="au-filter-input" type="date" id="au-to-filter" onchange="OpsAudit.applyFilters()" title="To date">
        <button class="btn-ghost" onclick="OpsAudit.clearFilters()" style="font-size:.76rem;padding:6px 12px;">Clear</button>
      </div>

      <!-- Log -->
      <div class="au-card">
        <div class="au-card-head">
          <div class="au-card-title">Activity</div>
          <span id="au-count" style="font-size:.76rem;color:var(--ink-3);font-family:var(--ff-m);"></span>
        </div>
        <div id="au-log-body">
          <div style="padding:48px;text-align:center;color:var(--ink-3);">
            <div class="loading" style="margin:0 auto 12px;"></div>
            <div style="font-size:.82rem;">Loading audit log…</div>
          </div>
        </div>
      </div>
    `;

    loadLogs();
  }

  // ── DATA ──────────────────────────────────────────────────────────────

  async function loadLogs() {
    try {
      const res = await OpsModal.apiGet('/audit-logs');
      _logs     = res.data || res.logs || [];
      renderLog(_logs);
    } catch (err) {
      const el = document.getElementById('au-log-body');
      if (el) el.innerHTML = `
        <div style="padding:48px;text-align:center;">
          <div style="color:var(--err);font-weight:700;margin-bottom:8px;">Failed to load audit log</div>
          <div style="color:var(--ink-3);font-size:.78rem;margin-bottom:16px;">${err.message}</div>
          <button class="btn-ghost" onclick="reloadTab('audit')">Retry</button>
        </div>`;
    }
  }

  // ── FILTERS ───────────────────────────────────────────────────────────

  function applyFilters() {
    const action = document.getElementById('au-action-filter')?.value || '';
    const actor  = (document.getElementById('au-actor-filter')?.value || '').toLowerCase().trim();
    const from   = document.getElementById('au-from-filter')?.value;
    const to     = document.getElementById('au-to-filter')?.value;

    let filtered = _logs;
    if (action) filtered = filtered.filter(l => l.action === action);
    if (actor)  filtered = filtered.filter(l => (l.actor_name || '').toLowerCase().includes(actor));
    if (from)   filtered = filtered.filter(l => l.created_at && new Date(l.created_at) >= new Date(from));
    if (to)     filtered = filtered.filter(l => l.created_at && new Date(l.created_at) <= new Date(to + 'T23:59:59'));

    renderLog(filtered);
  }

  function clearFilters() {
    ['au-action-filter','au-actor-filter','au-from-filter','au-to-filter'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    renderLog(_logs);
  }

  // ── RENDER LOG ────────────────────────────────────────────────────────

  function renderLog(logs) {
    const countEl = document.getElementById('au-count');
    if (countEl) countEl.textContent = `${logs.length} entries`;

    const el = document.getElementById('au-log-body');
    if (!el) return;

    if (!logs || logs.length === 0) {
      el.innerHTML = `
        <div style="padding:60px;text-align:center;color:var(--ink-3);">
          <svg width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.3" viewBox="0 0 24 24" style="margin:0 auto 12px;opacity:.25;display:block;"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
          <div style="font-size:.88rem;font-weight:600;color:var(--ink-2);">No entries match your filter</div>
        </div>`;
      return;
    }

    _pg = FGPaginator.create(logs, { pageSize: 30, containerId: 'au-log-body' });
    _pg.render(renderPage);
  }

  function renderPage(items) {
    const el = document.getElementById('au-log-body');
    if (!el) return;

    el.innerHTML = items.map(log => {
      const ac    = getActionConfig(log.action);
      const name  = log.actor_name || 'System';
      const inits = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      const avColor = avatarColor(name);

      return `
        <div class="au-row" onclick="OpsAudit.viewEntry('${log.id || ''}')">
          <div class="au-icon" style="background:${ac.bg};">
            <svg width="13" height="13" fill="none" stroke="${ac.color}" stroke-width="2.2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
          </div>
          <div class="au-body">
            <div class="au-action-row">
              <span class="au-action-badge" style="background:${ac.bg};color:${ac.color};">${ac.label}</span>
              ${log.target_label ? `<span style="font-size:.78rem;color:var(--ink-2);font-weight:500;">${log.target_label}</span>` : ''}
            </div>
            <div class="au-desc">${log.description || '—'}</div>
            <div class="au-meta">
              ${log.ip_address ? `<span>${log.ip_address}</span>` : ''}
              ${log.target_type ? `<span>${log.target_type}</span>` : ''}
            </div>
          </div>
          <div class="au-actor">
            <div>
              <div class="au-actor-av" style="background:${avColor};">${inits}</div>
            </div>
            <div>
              <div class="au-actor-name">${name}</div>
              <div class="au-actor-role">${log.actor_role ? log.actor_role.replace(/_/g, ' ') : ''}</div>
            </div>
          </div>
          <div class="au-time">${fmtRelTime(log.created_at)}</div>
        </div>`;
    }).join('');
  }

  // ── VIEW ENTRY DETAIL ─────────────────────────────────────────────────

  function viewEntry(id) {
    if (!id) return;
    const log = _logs.find(l => String(l.id) === String(id));
    if (!log) return;

    const ac = getActionConfig(log.action);

    OpsModal.open('Audit Entry', `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:${ac.bg};border-radius:10px;margin-bottom:18px;">
        <span style="display:inline-flex;padding:4px 12px;border-radius:12px;font-size:.74rem;font-weight:700;background:${ac.bg};color:${ac.color};border:1px solid ${ac.color}30;">${ac.label}</span>
        <div style="font-size:.84rem;color:var(--ink-2);">${log.description || '—'}</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
        <div class="ops-modal-detail"><span class="label">Actor</span><span class="value">${log.actor_name || 'System'}</span></div>
        <div class="ops-modal-detail"><span class="label">Role</span><span class="value">${log.actor_role ? log.actor_role.replace(/_/g, ' ') : '—'}</span></div>
        <div class="ops-modal-detail"><span class="label">Timestamp</span><span class="value" style="font-family:var(--ff-m);font-size:.78rem;">${log.created_at ? new Date(log.created_at).toLocaleString() : '—'}</span></div>
        <div class="ops-modal-detail"><span class="label">IP Address</span><span class="value" style="font-family:var(--ff-m);font-size:.78rem;">${log.ip_address || '—'}</span></div>
        ${log.target_type ? `<div class="ops-modal-detail"><span class="label">Target Type</span><span class="value">${log.target_type}</span></div>` : ''}
        ${log.target_id   ? `<div class="ops-modal-detail"><span class="label">Target ID</span><span class="value" style="font-family:var(--ff-m);font-size:.78rem;">${log.target_id}</span></div>` : ''}
      </div>

      ${log.metadata && Object.keys(log.metadata).length > 0 ? `
        <div style="margin-bottom:8px;font-size:.68rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--ink-3);">Metadata</div>
        <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:12px;font-family:var(--ff-m);font-size:.76rem;color:var(--ink-2);white-space:pre-wrap;overflow-x:auto;max-height:160px;overflow-y:auto;">
          ${JSON.stringify(log.metadata, null, 2)}
        </div>` : ''}
    `, [
      { label: 'Close', onclick: 'OpsModal.close()', class: 'btn-ghost' },
    ]);
  }

  // ── HELPERS ───────────────────────────────────────────────────────────

  function avatarColor(name) {
    const colors = ['#0a2a3d','#0d7fa0','#16a8d3','#0a8a6a','#7c3aed','#b45309'];
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) % colors.length;
    return colors[h];
  }

  function fmtRelTime(ds) {
    if (!ds) return '—';
    const diff = Date.now() - new Date(ds).getTime();
    const mins = Math.floor(diff / 60000);
    const hrs  = Math.floor(diff / 3600000);
    const days = Math.floor(hrs / 24);
    if (mins < 1)  return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hrs  < 24) return `${hrs}h ago`;
    if (days < 7)  return `${days}d ago`;
    return new Date(ds).toLocaleDateString('en-GB', { day:'numeric', month:'short' });
  }

  return { render, applyFilters, clearFilters, viewEntry };

})();
