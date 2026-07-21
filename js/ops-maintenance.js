/* ══════════════════════════════════════════════════════════════
   FlowGuard Ops — MAINTENANCE PLANNER
   A kanban board over the same `tickets` rows the client portal and
   field crews already use — this just gives ops a scheduling surface
   over work that has a work_type/crew/date attached to it (see the
   backend note in routes/tickets.js above GET /tickets/planner).
   Columns: Scheduled → In Progress → Complete. Complete is read-only
   here — closing a job stays on field.html's /complete endpoint,
   which is where the client's outcome record actually gets written.
   ══════════════════════════════════════════════════════════════ */
const OpsMaintenance = (function () {
  const canMng = () => !(window.Auth && Auth.can) || Auth.can('maintenance.manage');
  let _jobs = [];
  let _teams = [];
  let _properties = [];
  let _loaded = false;
  let _container = null;
  const _dash = v => (v == null || v === '') ? '—' : v;

  const MP_EXTRA = `<style>
    .ops-table tbody tr.clickable { cursor:pointer; transition:background .12s; }
    .ops-table tbody tr.clickable:hover { background:var(--surface-2,#f2f8fb); }
    .mp-back { display:inline-flex; align-items:center; gap:6px; font-size:var(--fs-sm); font-weight:600; color:var(--ink-2); background:var(--surface-2); border:1px solid var(--border); border-radius:9px; padding:8px 13px; cursor:pointer; }
    .mp-detail-top { display:flex; align-items:center; gap:14px; margin-bottom:18px; flex-wrap:wrap; }
    .mp-detail-name { font-family:var(--ff-d); font-size:var(--fs-xl); font-weight:700; color:var(--ink); line-height:1.1; }
    .mp-detail-meta { font-size:var(--fs-sm); color:var(--ink-3); margin-top:3px; }
    .mp-detail-actions { margin-left:auto; display:flex; gap:8px; }
    .mp-sec { background:var(--surface); border:1px solid var(--border); border-radius:var(--r,14px); box-shadow:var(--sh-xs); margin-bottom:14px; overflow:hidden; }
    .mp-sec-h { padding:12px 18px; border-bottom:1px solid var(--border); font-family:var(--ff-d); font-size:var(--fs-sm); font-weight:700; color:var(--ink); display:flex; justify-content:space-between; }
    .mp-sec-b { padding:16px 18px; }
    .mp-fgrid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:14px 22px; }
    .mp-f .k { font-size:var(--fs-2xs); font-weight:700; letter-spacing:.9px; text-transform:uppercase; color:var(--ink-3); }
    .mp-f .v { font-size:var(--fs-md); color:var(--ink); font-weight:600; margin-top:3px; }
    .mp-e { color:var(--ink-3); font-size:var(--fs-sm); padding:6px 0; }
    .mp-needs { font-size:var(--fs-xs); color:var(--ink-4); font-style:italic; }
  </style>`;

  const WORK_TYPES = [
    { value: 'silt_clearing', label: 'Silt Clearing' },
    { value: 'enzyme_refill', label: 'Enzyme Refill' },
    { value: 'node_repair',   label: 'Node Repair' },
    { value: 'maintenance',   label: 'General Maintenance' },
    { value: 'inspection',    label: 'Inspection' },
  ];
  const WORK_TYPE_LABEL = Object.fromEntries(WORK_TYPES.map(w => [w.value, w.label]));

  const PRIORITY_COLOR = { urgent: 'var(--err)', high: 'var(--caut)', normal: 'var(--warn)', low: 'var(--off,var(--ink-4))' };

  async function render(container) {
    _container = container;
    container.innerHTML = styles() + MP_EXTRA + shell();
    await load();
  }
  function back() { if (_container) render(_container); }

  function progressOf(s) { return s === 'resolved' || s === 'closed' ? 100 : s === 'in_progress' ? 50 : s === 'scheduled' ? 0 : 0; }

  async function load() {
    const board = document.getElementById('mp-board');
    try {
      const [jobsRes, teamsRes, propsRes] = await Promise.all([
        OpsModal.apiGet('/tickets/planner'),
        OpsModal.apiGet('/teams').catch(() => ({ data: [] })),
        OpsModal.apiGet('/properties').catch(() => ({ data: [] })),
      ]);
      _jobs = jobsRes.data || [];
      _teams = teamsRes.data || [];
      _properties = (propsRes.data || propsRes.data?.properties || []);
      if (!Array.isArray(_properties)) _properties = _properties.properties || [];
      _loaded = true;
      drawKpis();
      drawBoard();
    } catch (err) {
      if (board) board.innerHTML = `<div class="mp-empty">Couldn't load the planner — ${esc(err.message || 'network error')}.</div>`;
    }
  }

  function drawKpis() {
    const el = document.getElementById('mp-kpis');
    if (!el) return;
    const scheduled = _jobs.filter(j => j.status === 'scheduled').length;
    const inProgress = _jobs.filter(j => j.status === 'in_progress').length;
    const completedThisWeek = _jobs.filter(j => j.status === 'resolved' && j.completed_at &&
      (Date.now() - new Date(j.completed_at).getTime()) < 7 * 24 * 3600 * 1000).length;
    const overdue = _jobs.filter(j => j.status === 'scheduled' && j.scheduled_date &&
      new Date(j.scheduled_date).getTime() < Date.now()).length;
    el.innerHTML = OpsModal.kpiStrip([
      { label: 'Scheduled', value: scheduled },
      { label: 'In Progress', value: inProgress },
      { label: 'Completed (7d)', value: completedThisWeek, subClass: 'ok' },
      { label: 'Overdue', value: overdue, sub: overdue ? 'Past scheduled date' : 'None', subClass: overdue ? 'err' : 'ok' },
    ]);
  }

  const COLUMNS = [
    { key: 'scheduled',   title: 'Scheduled' },
    { key: 'in_progress', title: 'In Progress' },
    { key: 'resolved',    title: 'Complete' },
  ];

  function drawBoard() {
    const board = document.getElementById('mp-board-body');
    if (!board) return;
    if (!_jobs.length) {
      board.innerHTML = `<div class="mp-empty"><b>No scheduled work.</b><br>Jobs appear here once they carry a work type, a crew, or a scheduled date.<br><br>${canMng() ? `<button class="mp-add" onclick="OpsMaintenance.newJob()">+ New Job</button>` : ''}</div>`;
      return;
    }
    let rows = _jobs.slice().sort((a, b) => new Date(a.scheduled_date || a.created_at) - new Date(b.scheduled_date || b.created_at));
    if (_mstatus !== 'all') rows = rows.filter(j => (j.status || '') === _mstatus);
    if (_mterm) rows = rows.filter(j => `${j.ticket_id || ''} ${j.property_name || ''} ${j.title || ''} ${j.work_type || ''} ${j.team_name || ''}`.toLowerCase().includes(_mterm));
    const pc = p => PRIORITY_COLOR[p] || PRIORITY_COLOR.normal;
    const statusPill = s => { const m = { scheduled: 'warn', in_progress: 'warn', resolved: 'ok', closed: 'ok' }; return `<span class="lv-status ${m[s] || 'neutral'}">${(s || '').replace(/_/g, ' ') || '—'}</span>`; };
    if (!rows.length) { board.innerHTML = `<div class="mp-empty">No work orders match this filter.</div>`; return; }
    const L = OpsModal.link;
    board.innerHTML = `
      <div class="lv-scroll">
        <table class="lv-table">
          <thead><tr>
            <th>Work order</th><th>Property</th><th>Task</th><th>Priority</th>
            <th>Team</th><th>Due date</th><th>Status</th><th>Progress</th>
          </tr></thead>
          <tbody>
            ${rows.map(j => {
              const overdue = j.status === 'scheduled' && j.scheduled_date && new Date(j.scheduled_date).getTime() < Date.now();
              const prog = progressOf(j.status);
              const propCell = j.property_id ? L('properties', j.property_id, j.property_name || j.property_id) : esc(_dash(j.property_name));
              const teamCell = j.assigned_team ? L('teams', j.assigned_team, j.team_name || j.assigned_team) : (j.team_name ? esc(j.team_name) : '<span class="lv-dash">Unassigned</span>');
              return `<tr class="clickable" onclick="OpsMaintenance.openJob('${OpsModal.sid(j.ticket_id)}')" tabindex="0" onkeydown="if(event.key==='Enter'){OpsMaintenance.openJob('${OpsModal.sid(j.ticket_id)}')}">
                <td class="lv-mono" style="color:var(--ink);font-weight:700;">${esc(j.ticket_id)}</td>
                <td>${propCell}</td>
                <td>${esc(j.title || WORK_TYPE_LABEL[j.work_type] || (j.work_type || '').replace(/_/g, ' ') || '—')}</td>
                <td><span style="color:${pc(j.priority)};background:${pc(j.priority)}18;padding:2px 8px;border-radius:5px;font-size:var(--fs-2xs);font-weight:700;">${esc(j.priority || 'normal')}</span></td>
                <td>${teamCell}</td>
                <td class="lv-mono" style="${overdue ? 'color:var(--err);font-weight:700;' : ''}">${j.scheduled_date ? OpsModal.fmtDate(j.scheduled_date) : '—'}${overdue ? ' · overdue' : ''}</td>
                <td>${statusPill(j.status)}</td>
                <td><div style="display:flex;align-items:center;gap:6px;"><div style="flex:1;min-width:40px;height:5px;border-radius:3px;background:var(--surface-3);overflow:hidden;"><div style="height:100%;width:${prog}%;background:var(--ok);"></div></div><span style="font-size:var(--fs-2xs);color:var(--ink-3);font-family:var(--ff-m);">${prog}%</span></div></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function jobCard(j) {
    const overdue = j.status === 'scheduled' && j.scheduled_date && new Date(j.scheduled_date).getTime() < Date.now();
    const pc = PRIORITY_COLOR[j.priority] || PRIORITY_COLOR.normal;
    const canAdvance = j.status === 'scheduled' || j.status === 'in_progress';
    return `
      <div class="mp-card ${overdue ? 'is-overdue' : ''}" onclick="OpsMaintenance.openJob('${OpsModal.sid(j.ticket_id)}')">
        <div class="mp-card-top">
          <span class="mp-card-id">${esc(j.ticket_id)}</span>
          <span class="mp-card-pri" style="color:${pc};background:${pc}18;">${esc(j.priority || 'normal')}</span>
        </div>
        <div class="mp-card-title">${esc(j.title)}</div>
        <div class="mp-card-type">${esc(WORK_TYPE_LABEL[j.work_type] || (j.work_type || '').replace(/_/g, ' ') || 'Unspecified')}</div>
        <div class="mp-card-meta">
          ${j.property_name ? `<span class="mp-meta-row"><i class="mp-ic-site"></i>${esc(j.property_name)}</span>` : ''}
          ${j.team_name ? `<span class="mp-meta-row"><i class="mp-ic-team"></i>${esc(j.team_name)}${j.crew_size ? ` (${j.crew_size})` : ''}</span>` : '<span class="mp-meta-row mp-unassigned">Unassigned</span>'}
          <span class="mp-meta-row ${overdue ? 'mp-overdue-txt' : ''}"><i class="mp-ic-date"></i>${j.scheduled_date ? OpsModal.fmtDate(j.scheduled_date) : 'No date set'}${overdue ? ' · Overdue' : ''}</span>
          ${j.estimated_hours ? `<span class="mp-meta-row"><i class="mp-ic-clock"></i>${j.estimated_hours}h est.</span>` : ''}
        </div>
        ${canAdvance ? `
          <div class="mp-card-actions" onclick="event.stopPropagation()">
            ${j.status === 'scheduled' ? `<button class="mp-act" onclick="OpsMaintenance.advance('${OpsModal.sid(j.ticket_id)}','in_progress')">Start →</button>` : ''}
            ${j.status === 'in_progress' ? `<button class="mp-act mp-act-done" onclick="OpsMaintenance.completeJob('${OpsModal.sid(j.ticket_id)}')">Mark Complete →</button>` : ''}
          </div>` : ''}
      </div>`;
  }

  function shell() {
    return `
      <div class="mp-head">
        <div class="mp-head-title">
          <h2>Maintenance Planner</h2>
          <span>Scheduled field work across every crew and estate</span>
        </div>
        ${canMng() ? `<button class="mp-add" onclick="OpsMaintenance.newJob()">+ New Job</button>` : ''}
      </div>
      <div id="mp-kpis" class="mp-kpis-wrap"></div>
      <div class="lv-wrap">
        <div class="lv-toolbar">
          <div class="lv-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input id="mp-search" placeholder="Search work orders…" oninput="OpsMaintenance.search(this.value)">
          </div>
          <div class="lv-filters">
            <div class="lv-filter active" id="mpf-all" onclick="OpsMaintenance.filterStatus('all')">All</div>
            <div class="lv-filter" id="mpf-scheduled" onclick="OpsMaintenance.filterStatus('scheduled')">Scheduled</div>
            <div class="lv-filter" id="mpf-in_progress" onclick="OpsMaintenance.filterStatus('in_progress')">In progress</div>
            <div class="lv-filter" id="mpf-resolved" onclick="OpsMaintenance.filterStatus('resolved')">Complete</div>
          </div>
        </div>
        <div id="mp-board-body"><div class="mp-empty">Loading the planner…</div></div>
      </div>`;
  }

  let _mterm = '', _mstatus = 'all';
  function search(q) { _mterm = q.trim().toLowerCase(); drawBoard(); }
  function filterStatus(k) {
    _mstatus = k;
    ['all', 'scheduled', 'in_progress', 'resolved'].forEach(x => {
      const el = document.getElementById('mpf-' + x);
      if (el) el.classList.toggle('active', x === k);
    });
    drawBoard();
  }

  // ── FULL DETAIL SCREEN (no pop-up) ──
  function openJob(ticketId) {
    const j = _jobs.find(x => x.ticket_id === ticketId);
    if (!j || !_container) return;
    const prog = progressOf(j.status);
    const f = (k, v) => `<div class="mp-f"><div class="k">${k}</div><div class="v">${v}</div></div>`;
    const sec = (t, b, needs) => `<div class="mp-sec"><div class="mp-sec-h">${t}${needs ? '<span class="mp-needs">pending backend data</span>' : ''}</div><div class="mp-sec-b">${b}</div></div>`;

    const jobDetails = `<div class="mp-fgrid">
      ${f('Work Order', esc(j.ticket_id))}
      ${f('Property', j.property_id ? OpsModal.link('properties', j.property_id, j.property_name || j.property_id) : esc(_dash(j.property_name)))}
      ${f('Location', esc(_dash(j.location || j.city)))}
      ${f('Task', esc(j.title || WORK_TYPE_LABEL[j.work_type] || (j.work_type || '').replace(/_/g, ' ') || '—'))}
      ${f('Priority', esc(j.priority || 'normal'))}
      ${f('Assigned Team', j.assigned_team ? OpsModal.link('teams', j.assigned_team, j.team_name || j.assigned_team) : esc(_dash(j.team_name)))}
      ${f('Due Date', j.scheduled_date ? OpsModal.fmtDate(j.scheduled_date) : '—')}
      ${f('Status', `<span class="status-badge ${j.status === 'resolved' ? 'nominal' : j.status === 'in_progress' ? 'warning' : 'watch'}">${(j.status || '').replace(/_/g, ' ')}</span>`)}
      ${f('Estimated Duration', j.estimated_hours ? j.estimated_hours + 'h' : '—')}
      ${f('Progress', prog + '%')}
      ${f('Created', OpsModal.fmtDate(j.created_at))}
      ${j.completed_at ? f('Completed', OpsModal.fmtDate(j.completed_at)) : ''}
    </div>`;

    const notes = j.description || j.notes ? `<div class="mp-f"><div class="v" style="font-weight:400;white-space:pre-wrap;line-height:1.5;">${esc(j.description || j.notes)}</div></div>` : '<div class="mp-e">No notes.</div>';
    const team = j.team_name ? `<div class="mp-fgrid">${f('Crew', j.assigned_team ? OpsModal.link('teams', j.assigned_team, j.team_name) : esc(j.team_name))}${j.crew_size ? f('Crew size', j.crew_size) : ''}</div>` : '<div class="mp-e">No crew assigned.</div>';

    const actions = [
      j.status === 'scheduled' ? `<button class="btn-primary" onclick="OpsMaintenance.advance('${OpsModal.sid(j.ticket_id)}','in_progress')">Start Job</button>` : '',
      j.status === 'in_progress' ? `<button class="btn-primary" onclick="OpsMaintenance.completeJob('${OpsModal.sid(j.ticket_id)}')">Mark Complete</button>` : '',
    ].filter(Boolean).join('');

    _container.innerHTML = `
      ${styles()}${MP_EXTRA}
      <div class="mp-detail-top">
        <button class="mp-back" onclick="OpsMaintenance.back()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>Maintenance</button>
        <div>
          <div class="mp-detail-name">${esc(j.title || j.ticket_id)}</div>
          <div class="mp-detail-meta">${esc(j.ticket_id)} · ${esc(_dash(j.property_name))}</div>
        </div>
        <div class="mp-detail-actions">${actions}</div>
      </div>
      ${sec('Job Details', jobDetails)}
      ${sec('Checklist', '<div class="mp-e">No checklist items in this response.</div>', true)}
      ${sec('Required Equipment', '<div class="mp-e">No equipment list in this response.</div>', true)}
      ${sec('Before Photos', '<div class="mp-e">No before photos.</div>', true)}
      ${sec('After Photos', '<div class="mp-e">No after photos.</div>', true)}
      ${sec('Notes', notes)}
      ${sec('Team', team)}
      ${sec('Timeline', `<div class="mp-e">Created ${OpsModal.fmtDate(j.created_at)}${j.scheduled_date ? ' · Scheduled ' + OpsModal.fmtDate(j.scheduled_date) : ''}${j.completed_at ? ' · Completed ' + OpsModal.fmtDate(j.completed_at) : ''}.</div>`, true)}
      ${sec('Attachments', '<div class="mp-e">No attachments.</div>', true)}
    `;
  }

  async function advance(ticketId, status) {
    try {
      await OpsModal.apiPut(`/tickets/${ticketId}/status`, { status });
      OpsModal.toast('Job moved to ' + status.replace(/_/g, ' '), 'nominal');
      back();
    } catch (err) {
      OpsModal.toast(err.message || 'Failed to update job', 'error');
    }
  }

  function completeJob(ticketId) {
    OpsModal.confirm('Mark this job complete? This records the outcome and releases the crew.', async () => {
      try {
        await OpsModal.apiPost(`/tickets/${ticketId}/complete`, {});
        OpsModal.toast('Job marked complete', 'nominal');
        back();
      } catch (err) {
        OpsModal.toast(err.message || 'Failed to complete job', 'error');
      }
    });
  }

  // ── New job modal ──────────────────────────────────────────────
  function newJob() {
    const propOpts = [{ value: '', label: 'No specific estate' }, ..._properties.map(p => ({ value: p.property_id, label: p.asset_code || p.property_name }))];
    const teamOpts = [{ value: '', label: 'Unassigned' }, ..._teams.map(t => ({ value: t.team_id, label: t.team_name }))];
    const body = `
      ${OpsModal.field('Work Type', 'work_type', 'select', 'maintenance', { options: WORK_TYPES })}
      ${OpsModal.field('Title (optional — auto-generated if left blank)', 'title', 'text', '', { required: false, placeholder: 'e.g. Silt clearing — Ikoyi Waterside' })}
      ${OpsModal.row([
        OpsModal.field('Priority', 'priority', 'select', 'normal', { options: [{ value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' }] }),
        OpsModal.field('Scheduled Date', 'scheduled_date', 'date', '', {}),
      ])}
      ${OpsModal.row([
        OpsModal.field('Estate', 'property_id', 'select', '', { required: false, options: propOpts }),
        OpsModal.field('Crew', 'assigned_team', 'select', '', { required: false, options: teamOpts }),
      ])}
      ${OpsModal.field('Estimated Hours (optional)', 'estimated_hours', 'number', '', { required: false, placeholder: 'e.g. 4' })}
      ${OpsModal.field('Notes (optional)', 'description', 'textarea', '', { required: false, rows: 3 })}`;
    OpsModal.open('Schedule New Job', body, [
      { label: 'Cancel', class: 'btn-ghost', onclick: 'OpsModal.close()' },
      { label: 'Schedule', class: 'btn-primary', onclick: 'OpsMaintenance.submitNewJob()', id: 'mp-new-submit' },
    ]);
  }

  async function submitNewJob() {
    const data = OpsModal.getFormData();
    if (!data.scheduled_date) { OpsModal.toast('Scheduled date is required', 'warning'); return; }
    OpsModal.setLoading('mp-new-submit', true);
    try {
      await OpsModal.apiPost('/tickets/planner', {
        work_type: data.work_type,
        title: data.title || undefined,
        priority: data.priority,
        scheduled_date: data.scheduled_date,
        property_id: data.property_id || null,
        assigned_team: data.assigned_team || null,
        estimated_hours: data.estimated_hours || null,
        description: data.description || null,
      });
      OpsModal.toast('Job scheduled', 'nominal');
      OpsModal.close();
      await load();
    } catch (err) {
      OpsModal.toast(err.message || 'Failed to schedule job', 'error');
    } finally {
      OpsModal.setLoading('mp-new-submit', false);
    }
  }

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function styles() {
    return `<style>
      .mp-head { display:flex; align-items:center; justify-content:space-between; gap:14px; margin-bottom:14px; }
      .mp-head-title h2 { margin:0; font-size:var(--fs-xl); font-weight:700; color:var(--ink); }
      .mp-head-title span { font-size:var(--fs-xs); color:var(--ink-3); }
      .mp-add { padding:9px 16px; border-radius:9px; border:1px solid var(--blue-dim); background:var(--neon-trace); color:var(--blue-hi); font-size:var(--fs-sm); font-weight:700; font-family:var(--ff-b); cursor:pointer; white-space:nowrap; }
      .mp-add:hover { background:var(--blue-dim); color:#fff; }
      .mp-kpis-wrap { margin-bottom:16px; }

      .mp-board { display:grid; grid-template-columns:repeat(3, 1fr); gap:14px; align-items:start; }
      @media (max-width: 900px) { .mp-board { grid-template-columns:1fr; } }
      .mp-col { background:var(--surface-2); border:1px solid var(--border); border-radius:13px; overflow:hidden; display:flex; flex-direction:column; max-height:calc(100vh - 280px); }
      .mp-col-h { display:flex; align-items:center; justify-content:space-between; padding:12px 14px; font-size:var(--fs-xs); font-weight:700; letter-spacing:.6px; text-transform:uppercase; color:var(--ink-2); border-bottom:1px solid var(--border); background:var(--surface); flex-shrink:0; }
      .mp-col-n { background:var(--surface-3); color:var(--ink-3); border-radius:100px; padding:1px 8px; font-family:var(--ff-m); font-weight:700; }
      .mp-col-body { padding:10px; display:flex; flex-direction:column; gap:9px; overflow-y:auto; }
      .mp-col-empty { text-align:center; padding:20px; color:var(--ink-4); font-size:var(--fs-xs); }

      .mp-card { background:var(--surface); border:1px solid var(--border); border-radius:11px; padding:12px 13px; cursor:pointer; box-shadow:var(--sh-xs); transition:border-color .15s; }
      .mp-card:hover { border-color:var(--blue-dim); }
      .mp-card.is-overdue { border-left:3px solid var(--err); }
      .mp-card-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; }
      .mp-card-id { font-family:var(--ff-m); font-size:var(--fs-2xs); color:var(--ink-3); font-weight:700; }
      .mp-card-pri { font-size:var(--fs-2xs); font-weight:800; letter-spacing:.4px; text-transform:uppercase; padding:2px 7px; border-radius:5px; }
      .mp-card-title { font-size:var(--fs-sm); font-weight:700; color:var(--ink); margin-bottom:3px; line-height:1.35; }
      .mp-card-type { font-size:var(--fs-2xs); color:var(--ink-3); text-transform:capitalize; margin-bottom:8px; }
      .mp-card-meta { display:flex; flex-direction:column; gap:4px; }
      .mp-meta-row { display:flex; align-items:center; gap:6px; font-size:var(--fs-2xs); color:var(--ink-3); }
      .mp-meta-row i { width:5px; height:5px; border-radius:50%; background:var(--ink-4); flex-shrink:0; }
      .mp-unassigned { color:var(--warn); }
      .mp-overdue-txt { color:var(--err); font-weight:600; }
      .mp-card-actions { margin-top:10px; padding-top:9px; border-top:1px solid var(--border); }
      .mp-act { width:100%; padding:6px 10px; border-radius:7px; border:1px solid var(--blue-dim); background:transparent; color:var(--blue-hi); font-size:var(--fs-xs); font-weight:700; font-family:var(--ff-b); cursor:pointer; }
      .mp-act:hover { background:var(--neon-trace); }
      .mp-act-done { border-color:var(--ok); color:var(--ok); }
      .mp-act-done:hover { background:var(--ok); color:#fff; }

      .mp-empty { padding:40px; text-align:center; color:var(--ink-3); font-size:var(--fs-base); line-height:1.7; background:var(--surface); border:1px solid var(--border); border-radius:14px; grid-column:1/-1; }
      .mp-empty b { color:var(--ink); }

      .mp-detail-row { display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border); font-size:var(--fs-sm); }
      .mp-detail-row:last-child { border-bottom:none; }
      .mp-detail-row span { color:var(--ink-3); }
      .mp-detail-row b { color:var(--ink); font-weight:600; text-align:right; }
    </style>`;
  }

  return { render, back, search, filterStatus, newJob, submitNewJob, openJob, advance, completeJob };
})();
