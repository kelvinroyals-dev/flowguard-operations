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
  let _container = null;
  let _filters = { action: '', actor: '', from: '', to: '' };
  const _dash = v => (v == null || v === '') ? '—' : OpsModal.escape(v);

  // Neutral event categories; result status owns success/failure colour.
  const ACTION_CONFIG = {
    // Dispatch & Alerts
    alert_assigned:    { label:'Incident assigned' },
    alert_resolved:    { label:'Incident resolved' },
    team_dispatched:   { label:'Team Dispatched' },
    // Client & Property
    client_created:    { label:'Client Created' },
    client_updated:    { label:'Client Updated' },
    area_submitted:    { label:'Estate submitted' },
    area_updated:      { label:'Estate Updated' },
    inspection_scheduled: { label:'Inspection Scheduled' },
    // Auth
    user_login:        { label:'Login' },
    user_logout:       { label:'Logout' },
    user_invited:      { label:'User Invited' },
    user_deactivated:  { label:'User Deactivated' },
    // Billing
    invoice_paid:      { label:'Invoice Paid' },
    reminder_sent:     { label:'Reminder Sent' },
    // Settings
    settings_updated:  { label:'Settings Updated' },
    // Team
    team_created:      { label:'Team Created' },
    member_added:      { label:'Member Added' },
    member_removed:    { label:'Member Removed' },
    // SLA
    sla_breach:        { label:'SLA Breach' },
    breach_acknowledged: { label:'Breach Acknowledged' },
  };

  function getActionConfig(action) {
    const config=ACTION_CONFIG[action] || { label: (action || 'Action').replace(/[_.]/g, ' ') };
    // Action type is a category, not evidence that the attempted action succeeded.
    // Result owns the semantic success/failure colour separately.
    return {label:OpsModal.label(config.label),color:'var(--ink-2)',bg:'var(--surface-2)'};
  }

  function render(container) {
    _container = container;
    container.innerHTML = `


      ${OpsModal.pageHeader({title:'Activity log',subtitle:'Reported actions with actor, timestamp, and context',actions:'<button class="fg-action" onclick="reloadTab(\'audit\')">Refresh</button>'})}

      <div class="lv-wrap">
        <div class="lv-toolbar">
          <div class="lv-search">
            ${OpsModal.actionIcon("search")}
            <input id="au-actor-filter" aria-label="Search activity by actor" placeholder="Search actor…" oninput="OpsAudit.applyFilters()">
          </div>
          <div class="lv-toolbar-right">
            <span id="au-count" class="fg-number" style="font-size:var(--fs-xs);color:var(--ink-3);"></span>
            <select class="au-filter-input" id="au-action-filter" aria-label="Action type" onchange="OpsAudit.applyFilters()">
              <option value="">All actions</option>
              ${Object.entries(ACTION_CONFIG).map(([k,v]) => `<option value="${k}">${OpsModal.escape(OpsModal.label(v.label))}</option>`).join('')}
            </select>
            <input class="au-filter-input" type="date" id="au-from-filter" aria-label="Activity from date" onchange="OpsAudit.applyFilters()" title="From date">
            <span style="font-size:var(--fs-sm);color:var(--ink-3);">→</span>
            <input class="au-filter-input" type="date" id="au-to-filter" aria-label="Activity to date" onchange="OpsAudit.applyFilters()" title="To date">
            <button class="fg-action" onclick="OpsAudit.clearFilters()">Clear</button>
          </div>
        </div>
        <div id="au-log-body">
          <div style="padding:48px;text-align:center;color:var(--ink-3);">
            <div class="loading" style="margin:0 auto 12px;"></div>
            <div style="font-size:var(--fs-base);">Loading audit log…</div>
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
      _logs = OpsModal.readArray(res,'Activity log',['data','logs']);
      renderLog(_logs);
    } catch (err) {
      const el = document.getElementById('au-log-body');
      if (el) el.innerHTML = OpsModal.failure('Activity log',err,"reloadTab('audit')");
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
    if (countEl) countEl.textContent = `${logs.length} returned ${logs.length===1?'entry':'entries'}`;

    const el = document.getElementById('au-log-body');
    if (!el) return;

    if (!logs || logs.length === 0) {
      el.innerHTML = OpsModal.emptyState(OpsModal.entityIcon('audit'),_logs.length?'No matching activity':'No activity entries returned',_logs.length?'Change the search or event filters to review other returned entries.':'No activity entries were returned. This does not establish that no actions occurred.');
      return;
    }

    _pg = FGPaginator.create(logs, { pageSize: 30, containerId: 'au-log-body' });
    _pg.render(renderPage);
  }

  function renderPage(items) {
    const el = document.getElementById('au-log-body');
    if (!el) return;
    const resultPill = log => OpsModal.status(log.result || 'unknown',null,null,'audit');
    el.innerHTML = `
      <div class="lv-scroll">
        <table class="lv-table">
          <thead><tr><th scope="col">Date</th><th scope="col">User</th><th scope="col">Action</th><th scope="col">Module</th><th scope="col">Object</th><th scope="col">IP address</th><th scope="col">Result</th></tr></thead>
          <tbody>
            ${items.map(log => {
              const ac = getActionConfig(log.action);
              return `<tr class="clickable" onclick="OpsAudit.viewEntry('${OpsModal.sid(log.id)}')">
                <td class="lv-mono">${OpsModal.fmtDateTime(log.created_at)}</td>
                <td><span class="fg-cell-copy">${_dash(log.actor_name || 'Not recorded')}</span></td>
                <td><button class="record-link lv-name" onclick="event.stopPropagation();OpsAudit.viewEntry('${OpsModal.sid(log.id)}')"><span class="au-action-badge" style="background:${ac.bg};color:${ac.color};">${OpsModal.escape(ac.label)}</span></button></td>
                <td>${log.module || log.target_type ? OpsModal.escape(OpsModal.permissionLabel(log.module || log.target_type)) : 'Not supplied'}</td>
                <td><span class="fg-cell-copy">${_dash(log.target_label || log.target_id)}</span></td>
                <td class="lv-mono">${_dash(log.ip_address)}</td>
                <td>${resultPill(log)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ── VIEW ENTRY DETAIL ─────────────────────────────────────────────────

  function back() { if (_container) render(_container); }

  // ── FULL DETAIL SCREEN (no pop-up) ──
  function viewEntry(id) {
    if (!id || !_container) return;
    const log = _logs.find(l => String(l.id) === String(id));
    if (!log) return;
    const ac = getActionConfig(log.action);
    const f = OpsModal.fact;
    const md = log.metadata || {};
    const before = md.before || md.old || md.from;
    const after = md.after || md.new || md.to;
    const jsonBox = obj => `<pre style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-control);padding:12px;font-family:var(--ff-m);font-size:var(--fs-sm);color:var(--ink-2);white-space:pre-wrap;overflow-x:auto;max-height:220px;overflow-y:auto;margin:0;">${OpsModal.escape(JSON.stringify(obj, null, 2))}</pre>`;

    const details = `<div class="fg-facts-grid">
      ${f('Date', OpsModal.fmtDateTime(log.created_at))}
      ${f('User', OpsModal.escape(log.actor_name || 'Not recorded'))}
      ${f('Role', log.actor_role ? OpsModal.escape(OpsModal.label(log.actor_role)) : '—')}
      ${f('Action', `<span class="au-action-badge" style="background:${ac.bg};color:${ac.color};">${OpsModal.escape(ac.label)}</span>`)}
      ${f('Module', log.module || log.target_type ? OpsModal.escape(OpsModal.permissionLabel(log.module || log.target_type)) : 'Not supplied')}
      ${f('Object', _dash(log.target_label || log.target_id))}
      ${f('IP address', _dash(log.ip_address))}
      ${f('Result', OpsModal.status(log.result || 'unknown',null,null,'audit'))}
    </div>${log.description ? OpsModal.textBlock('Event description',log.description) : ''}`;

    const keys = new Set([...Object.keys(before && typeof before === 'object' ? before : {}), ...Object.keys(after && typeof after === 'object' ? after : {})]);
    const changed = [...keys].filter(key=>JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]));
    const display = value => value == null ? 'Not recorded' : OpsModal.escape(typeof value === 'object' ? JSON.stringify(value) : String(value));
    const changes = changed.length ? `<table class="fgd-table"><thead><tr><th scope="col">Field</th><th scope="col">Before</th><th scope="col">After</th></tr></thead><tbody>${changed.map(key=>`<tr><td>${OpsModal.escape(OpsModal.label(key))}</td><td>${display(before?.[key])}</td><td>${display(after?.[key])}</td></tr>`).join('')}</tbody></table>` : '<div class="capability-note">No field-level change data was supplied.</div>';
    const modules = {alert:'alerts',property:'properties',sensor:'sensors',team:'teams',job:'jobs',invoice:'billing',client:'clients'};
    const target = modules[log.target_type];
    const related = log.target_id ? target ? OpsModal.link(target,log.target_id,log.target_label || `${log.target_type} ${log.target_id}`) : OpsModal.escape(`${log.target_type || 'Record'} · ${log.target_id}`) : 'No related record supplied';
    _container.innerHTML = OpsModal.detailShell({
      back:'OpsAudit.back()',crumbRoot:'Activity log',title:OpsModal.escape(OpsModal.label(ac.label)),
      chips:[{label:OpsModal.escape(OpsModal.label(log.result || 'Unknown result')),cls:OpsModal.statusTone(log.result,'audit')}],
      meta:[['Actor',OpsModal.escape(log.actor_name || 'Not recorded')],['Recorded',OpsModal.fmtDateTime(log.created_at)]],
      decision:[['Reported result',OpsModal.label(log.result || 'Unknown')],['Actor',log.actor_name || 'Not recorded'],['Next step','Review recorded changes and the related record']],
      note:'Read-only record of the reported event. Missing results or change data are not proof of success.',
      sections:[{id:'event',title:'Event summary',body:details},{id:'changes',title:'Field changes',body:changes},{id:'related',title:'Related record',body:`<div class="capability-note">${related}</div>`},{id:'raw',title:'Technical record',body:`<details class="capability-note"><summary>View raw metadata</summary>${jsonBox(md)}</details>`}],
    });
  }

  // ── HELPERS ───────────────────────────────────────────────────────────

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
    return OpsModal.fmtDate(ds);
  }

  return { render, applyFilters, clearFilters, viewEntry, back };

})();
