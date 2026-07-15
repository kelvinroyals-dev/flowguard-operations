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
  let _jobs = [];
  let _teams = [];
  let _properties = [];
  let _loaded = false;

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
    container.innerHTML = styles() + shell();
    await load();
  }

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
    const board = document.getElementById('mp-board');
    if (!board) return;
    if (!_jobs.length) {
      board.innerHTML = `<div class="mp-empty"><b>No scheduled work.</b><br>Jobs appear here once they carry a work type, a crew, or a scheduled date.<br><br><button class="mp-add" onclick="OpsMaintenance.newJob()">+ New Job</button></div>`;
      return;
    }
    board.innerHTML = COLUMNS.map(col => {
      const rows = _jobs
        .filter(j => (col.key === 'resolved' ? ['resolved', 'closed'].includes(j.status) : j.status === col.key))
        .sort((a, b) => new Date(a.scheduled_date || a.created_at) - new Date(b.scheduled_date || b.created_at));
      return `
        <div class="mp-col">
          <div class="mp-col-h">
            <span>${col.title}</span>
            <span class="mp-col-n">${rows.length}</span>
          </div>
          <div class="mp-col-body">
            ${rows.length ? rows.map(jobCard).join('') : '<div class="mp-col-empty">No jobs</div>'}
          </div>
        </div>`;
    }).join('');
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
        <button class="mp-add" onclick="OpsMaintenance.newJob()">+ New Job</button>
      </div>
      <div id="mp-kpis" class="mp-kpis-wrap"></div>
      <div id="mp-board" class="mp-board"><div class="mp-empty">Loading the planner…</div></div>`;
  }

  // ── Job detail (read-only summary + status controls) ──────────
  function openJob(ticketId) {
    const j = _jobs.find(x => x.ticket_id === ticketId);
    if (!j) return;
    const body = `
      <div class="mp-detail">
        <div class="mp-detail-row"><span>Work order</span><b>${esc(j.ticket_id)}</b></div>
        <div class="mp-detail-row"><span>Title</span><b>${esc(j.title)}</b></div>
        <div class="mp-detail-row"><span>Work type</span><b>${esc(WORK_TYPE_LABEL[j.work_type] || j.work_type || '—')}</b></div>
        <div class="mp-detail-row"><span>Priority</span><b>${esc(j.priority || 'normal')}</b></div>
        <div class="mp-detail-row"><span>Status</span><b>${esc((j.status || '').replace(/_/g, ' '))}</b></div>
        <div class="mp-detail-row"><span>Estate</span><b>${esc(j.property_name || '—')}</b></div>
        <div class="mp-detail-row"><span>Crew</span><b>${esc(j.team_name || 'Unassigned')}</b></div>
        <div class="mp-detail-row"><span>Scheduled</span><b>${j.scheduled_date ? OpsModal.fmtDate(j.scheduled_date) : '—'}</b></div>
        <div class="mp-detail-row"><span>Estimated hours</span><b>${j.estimated_hours ?? '—'}</b></div>
        <div class="mp-detail-row"><span>Created</span><b>${OpsModal.fmtDate(j.created_at)}</b></div>
        ${j.completed_at ? `<div class="mp-detail-row"><span>Completed</span><b>${OpsModal.fmtDate(j.completed_at)}</b></div>` : ''}
      </div>`;
    const actions = [{ label: 'Close', class: 'btn-ghost', onclick: 'OpsModal.close()' }];
    if (j.status === 'scheduled') actions.push({ label: 'Start Job', class: 'btn-primary', onclick: `OpsMaintenance.advance('${OpsModal.sid(j.ticket_id)}','in_progress');OpsModal.close()` });
    if (j.status === 'in_progress') actions.push({ label: 'Mark Complete', class: 'btn-primary', onclick: `OpsMaintenance.completeJob('${OpsModal.sid(j.ticket_id)}');OpsModal.close()` });
    OpsModal.open('Job Details', body, actions);
  }

  async function advance(ticketId, status) {
    try {
      await OpsModal.apiPut(`/tickets/${ticketId}/status`, { status });
      OpsModal.toast('Job moved to ' + status.replace(/_/g, ' '), 'nominal');
      await load();
    } catch (err) {
      OpsModal.toast(err.message || 'Failed to update job', 'error');
    }
  }

  function completeJob(ticketId) {
    OpsModal.confirm('Mark this job complete? This records the outcome and releases the crew.', async () => {
      try {
        await OpsModal.apiPost(`/tickets/${ticketId}/complete`, {});
        OpsModal.toast('Job marked complete', 'nominal');
        await load();
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

  return { render, newJob, submitNewJob, openJob, advance, completeJob };
})();
