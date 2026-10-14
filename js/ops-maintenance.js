/* ══════════════════════════════════════════════════════════════
   FlowGuard Services — LEGACY MAINTENANCE RECORDS
   Existing ticket-based work retains its original identifiers,
   assignments and completion lifecycle. New work uses provider work
   orders; this compatibility reader is not a second scheduling system.
   ══════════════════════════════════════════════════════════════ */
const OpsMaintenance = (function () {
  const canMng = () => !(window.Auth && Auth.can) || Auth.can('maintenance.manage');
  function requireManage() { if (canMng()) return true; OpsModal.toast('You do not have permission to change maintenance work', 'watch'); return false; }
  let _jobs = [];
  let _container = null;
  let _teamScope = '';
  function scopedJobs() { return _teamScope ? _jobs.filter(j=>String(j.assigned_team)===_teamScope) : _jobs; }
  function forTeam(id) { if (!Auth.hasNavAccess('maintenance')) return OpsModal.toast('You do not have access to maintenance', 'watch');_teamScope=String(id);_mstatus='all';_mterm='';switchTab('maintenance');if (_container) render(_container); }
  function clearScope() { _teamScope='';if (_container) render(_container); }
  const _dash = v => (v == null || v === '') ? '—' : v;


  const WORK_TYPES = [
    { value: 'silt_clearing', label: 'Silt clearing' },
    { value: 'enzyme_refill', label: 'Enzyme refill' },
    { value: 'node_repair',   label: 'Device repair' },
    { value: 'maintenance',   label: 'General maintenance' },
    { value: 'inspection',    label: 'Inspection' },
  ];
  const WORK_TYPE_LABEL = Object.fromEntries(WORK_TYPES.map(w => [w.value, w.label]));

  const PRIORITY_COLOR = { urgent: 'var(--err)', high: 'var(--caut)', normal: 'var(--warn)', low: 'var(--off,var(--ink-4))' };

  async function render(container) {
    _container = container;
    container.innerHTML = shell();
    await load();
  }
  function back() { if (_container) render(_container); }

  function progressOf(s) { return OpsModal.label(s || 'unknown'); }

  async function load() {
    const board = document.getElementById('mp-board-body');
    try {
      const jobsRes = await OpsModal.apiGet('/tickets/planner');
      if (!Array.isArray(jobsRes.data)) throw new Error('Maintenance list was not supplied');
      _jobs = jobsRes.data;
      drawKpis();
      drawBoard();
    } catch (err) {
      if (board) board.innerHTML = OpsModal.failure('Maintenance',err,"reloadTab('maintenance')");
    }
  }

  function drawKpis() {
    const el = document.getElementById('mp-kpis');
    if (!el) return;
    const scheduled = _jobs.filter(j => j.status === 'scheduled').length;
    const inProgress = _jobs.filter(j => j.status === 'in_progress').length;
    const completedThisWeek = _jobs.filter(j => {
      const age = j.completed_at ? Date.now() - new Date(j.completed_at).getTime() : NaN;
      return j.status === 'resolved' && age >= 0 && age < 7 * 24 * 3600 * 1000;
    }).length;
    const overdue = _jobs.filter(j => j.status === 'scheduled' && j.scheduled_date &&
      OpsModal.pastDue(j.scheduled_date)).length;
    el.innerHTML = OpsModal.kpiStrip([
      { label: 'Scheduled', value: scheduled },
      { label: 'In progress', value: inProgress },
      { label: 'Completed (7d)', value: completedThisWeek, subClass: 'ok' },
      { label: 'Overdue', value: overdue, sub: overdue ? 'Past scheduled date' : 'None', subClass: overdue ? 'err' : 'ok' },
    ]) + OpsModal.provenance([['Scope',`${_jobs.length} maintenance tasks returned`],['Completion window','Previous 7 days']],'Counts precede list filters and are not platform-wide totals. Only supplied scheduled dates establish overdue tasks.');
  }

  const COLUMNS = [
    { key: 'scheduled',   title: 'Scheduled' },
    { key: 'in_progress', title: 'In progress' },
    { key: 'resolved',    title: 'Complete' },
  ];

  function drawBoard() {
    const board = document.getElementById('mp-board-body');
    if (!board) return;
    if (!_jobs.length) {
      board.innerHTML = OpsModal.emptyState('','No legacy maintenance records returned','New provider work is coordinated through Services → Provider work orders.');
      return;
    }
    let rows = scopedJobs().slice().sort((a, b) => new Date(a.scheduled_date || a.created_at) - new Date(b.scheduled_date || b.created_at));
    if (_mstatus !== 'all') rows = rows.filter(j => (j.status || '') === _mstatus);
    if (_mterm) rows = rows.filter(j => `${j.ticket_id || ''} ${j.property_name || ''} ${j.title || ''} ${j.work_type || ''} ${j.team_name || ''}`.toLowerCase().includes(_mterm));
    FGPaginator.create(rows,{pageSize:25,containerId:'mp-board-body'}).render(renderBoardRows);
  }
  function renderBoardRows(rows) {
    const board=document.getElementById('mp-board-body'); if(!board) return;
    const pc = p => PRIORITY_COLOR[p] || PRIORITY_COLOR.normal;
    const statusPill = s => OpsModal.status(s,null,null,'maintenance');
    if (!rows.length) { board.innerHTML = OpsModal.emptyState('',_mterm || _mstatus!=='all'?'No matching maintenance tasks':'No maintenance tasks returned',_mterm || _mstatus!=='all'?'Adjust the search or status filter to review other tasks.':'No maintenance tasks were returned by this feed.'); return; }
    const L = OpsModal.link;
    board.innerHTML = `
      <div class="lv-scroll">
        <table class="lv-table fg-mobile-cards">
          <thead><tr>
            <th scope="col">Maintenance task</th><th scope="col">Estate</th><th scope="col">Work type</th><th scope="col">Priority</th>
            <th scope="col">Team</th><th scope="col">Due date</th><th scope="col">Status</th>
          </tr></thead>
          <tbody>
            ${rows.map(j => {
              const overdue = j.status === 'scheduled' && OpsModal.pastDue(j.scheduled_date);
              const propCell = j.property_id ? L('properties', j.property_id, j.property_name || j.property_id) : esc(_dash(j.property_name));
              const teamCell = j.assigned_team ? L('teams', j.assigned_team, j.team_name || j.assigned_team) : (j.team_name ? esc(j.team_name) : '<span class="lv-dash">Unassigned</span>');
              return `<tr class="clickable" onclick="OpsMaintenance.openJob('${OpsModal.sid(j.ticket_id)}')">
                <td data-label="Maintenance task">
                  <div class="lv-name-cell">
                    <div class="lv-avatar" aria-hidden="true">${OpsModal.entityIcon('maintenance')}</div>
                    <div style="min-width:0;"><button type="button" class="record-link lv-name" onclick="event.stopPropagation();OpsMaintenance.openJob('${OpsModal.sid(j.ticket_id)}')">${esc(j.title || WORK_TYPE_LABEL[j.work_type] || 'Maintenance task')}</button><div class="lv-source lv-mono">${esc(j.ticket_id)}</div></div>
                  </div>
                </td>
                <td data-label="Estate">${propCell}</td>
                <td data-label="Work type">${esc(WORK_TYPE_LABEL[j.work_type] || OpsModal.label(j.work_type))}</td>
                <td data-label="Priority">${OpsModal.status(j.priority,null,null,'priority')}</td>
                <td data-label="Team">${teamCell}</td>
                <td data-label="Due date" class="lv-mono" style="${overdue ? 'color:var(--err);font-weight:700;' : ''}">${j.scheduled_date ? OpsModal.fmtDate(j.scheduled_date) : '—'}${overdue ? ' · overdue' : ''}</td>
                <td data-label="Status">${statusPill(j.status)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function jobCard(j) {
    const overdue = j.status === 'scheduled' && OpsModal.pastDue(j.scheduled_date);
    const pc = PRIORITY_COLOR[j.priority] || PRIORITY_COLOR.normal;
    const canAdvance = j.status === 'scheduled' || j.status === 'in_progress';
    return `
      <div class="mp-card ${overdue ? 'is-overdue' : ''}" onclick="OpsMaintenance.openJob('${OpsModal.sid(j.ticket_id)}')">
        <div class="mp-card-top">
          <span class="mp-card-id">${esc(j.ticket_id)}</span>
          <span class="mp-card-pri" style="color:${pc};background:${pc}18;">${esc(j.priority || 'normal')}</span>
        </div>
        <div class="mp-card-title">${esc(j.title)}</div>
        <div class="mp-card-type">${esc(WORK_TYPE_LABEL[j.work_type] || OpsModal.label(j.work_type || 'Unspecified'))}</div>
        <div class="mp-card-meta">
          ${j.property_name ? `<span class="mp-meta-row"><i class="mp-ic-site"></i>${esc(j.property_name)}</span>` : ''}
          ${j.team_name ? `<span class="mp-meta-row"><i class="mp-ic-team"></i>${esc(j.team_name)}${j.crew_size ? ` (${j.crew_size})` : ''}</span>` : '<span class="mp-meta-row mp-unassigned">Unassigned</span>'}
          <span class="mp-meta-row ${overdue ? 'mp-overdue-txt' : ''}"><i class="mp-ic-date"></i>${j.scheduled_date ? OpsModal.fmtDate(j.scheduled_date) : 'No date set'}${overdue ? ' · Overdue' : ''}</span>
          ${j.estimated_hours ? `<span class="mp-meta-row"><i class="mp-ic-clock"></i>${j.estimated_hours}h est.</span>` : ''}
        </div>
        ${canAdvance ? `
          <div class="mp-card-actions" onclick="event.stopPropagation()">
            ${canMng() && j.status === 'scheduled' ? `<button class="mp-act" onclick="OpsMaintenance.advance('${OpsModal.sid(j.ticket_id)}','in_progress')">Start →</button>` : ''}
            ${canMng() && j.status === 'in_progress' ? `<button class="mp-act mp-act-done" onclick="OpsMaintenance.completeJob('${OpsModal.sid(j.ticket_id)}')">Mark complete →</button>` : ''}
          </div>` : ''}
      </div>`;
  }

  function shell() {
    return `
      ${OpsModal.pageHeader({title:'Services',subtitle:'Legacy maintenance records · Existing ticket-based work, retained for continuity'})}
      ${typeof OpsServices !== 'undefined' ? OpsServices.navigation('maintenance') : ''}
      <p class="capability-note">These existing records retain their original team assignments and lifecycle. Create new provider work orders in the provider view; legacy tickets have not been migrated or reclassified.</p>
      ${_teamScope ? OpsModal.provenance([['Team filter',_teamScope],['Feed limit','Up to 300 returned maintenance tasks']],'This scoped feed is not a complete platform total.')+'<button class="fg-action" onclick="OpsMaintenance.clearScope()">Show all teams</button>' : ''}
      <div class="lv-wrap">
        <div class="lv-toolbar">
          <div class="lv-search">
            ${OpsModal.actionIcon("search")}
            <input id="mp-search" aria-label="Search maintenance tasks" placeholder="Search maintenance tasks…" oninput="OpsMaintenance.search(this.value)">
          </div>
          <div class="lv-toolbar-right">
            <select aria-label="Maintenance task state" class="um-filter" onchange="OpsMaintenance.filterStatus(this.value)">
              <option value="all">All statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Complete</option>
            </select>
          </div>
        </div>
        <div id="mp-board-body">${OpsModal.loading('Loading maintenance…')}</div>
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
    const f = OpsModal.fact;

    const jobDetails = `<div class="fg-facts-grid">
      ${f('Location', esc(_dash(j.location || j.city)))}
      ${f('Work type', esc(WORK_TYPE_LABEL[j.work_type] || OpsModal.label(j.work_type)))}
      ${f('Priority', OpsModal.status(j.priority,null,null,'priority'))}
      ${f('Estimated duration', j.estimated_hours!=null ? esc(j.estimated_hours)+'h' : '—')}
    </div>`;

    const notes = OpsModal.textBlock('Work scope',j.description || j.notes);
    const team = j.team_name || j.assigned_team ? `<div class="fg-facts-grid">${f('Crew', j.assigned_team ? OpsModal.link('teams', j.assigned_team, j.team_name || j.assigned_team) : esc(j.team_name))}${j.crew_size != null ? f('Crew size', esc(j.crew_size)) : ''}</div>` : '<div class="capability-note">Crew assignment was not supplied.</div>';

    // Legacy records are retained for visibility, not an internal execution queue.
    const actions = '';

    _container.innerHTML = OpsModal.detailShell({
      back:'OpsMaintenance.back()', crumbRoot:'Services / Legacy maintenance records', title:esc(j.title || j.ticket_id),
      avatar:{text:OpsModal.entityIcon('maintenance')},
      chips:[{label:esc(prog),cls:OpsModal.statusTone(j.status,'maintenance')}],
      meta:[['Maintenance reference',esc(j.ticket_id)],['Estate',j.property_id ? OpsModal.link('properties',j.property_id,j.property_name || j.property_id) : esc(j.property_name || (j.property_id === null ? OpsModal.missing.unlinked : OpsModal.missing.absent))]], actions,
      decision:[['Recorded assignment',j.team_name || 'Not supplied'],['Scheduled',OpsModal.fmtDate(j.scheduled_date)],['Next step','Review the retained work record; coordinate new provider work in Services']],
      note:'Recorded completion is a lifecycle state, not an independent verification of work quality. Review scope and before/after evidence; absent attachments do not confirm that evidence was never collected.',
      sections:[
        {id:'details',title:'Work summary',body:jobDetails},
        {id:'notes',title:'Scope & notes',body:notes},
        {id:'outcome',title:'Recorded completion findings',body:j.resolution_notes ? OpsModal.textBlock('Findings',j.resolution_notes) : '<div class="capability-note">Completion findings have not been recorded.</div>'},
        {id:'team',title:'Response ownership',body:team},
        {id:'evidence',title:'Work evidence',state:OpsModal.collectionState(j.before_photos,j.after_photos,j.attachments),body:OpsModal.evidenceGroup([['Before work',j.before_photos],['After work',j.after_photos],['Supporting files',j.attachments]])},
        {id:'timeline',title:'Recorded dates',body:[['Task created',j.created_at],['Work scheduled',j.scheduled_date],['Completion recorded',j.completed_at]].filter(([,date])=>date!=null && date!=='').map(([title,date])=>`<div class="fg-timeline-row"><div class="fg-timeline-icon">${OpsModal.entityIcon('maintenance')}</div><div class="fg-timeline-title">${title}</div><time class="fg-timeline-time">${OpsModal.fmtDateTime(date)}</time></div>`).join('') || '<div class="capability-note">Recorded task dates were not supplied. This record does not provide a complete activity history.</div>'},
      ],
    });
  }

  async function advance(ticketId, status) {
    if (!requireManage()) return;
    try {
      await OpsModal.apiPut(`/tickets/${ticketId}/status`, { status });
      OpsModal.toast('Maintenance state: ' + OpsModal.label(status), 'nominal');
      back();
    } catch (err) {
      OpsModal.toast(err.message || 'Failed to update maintenance task', 'error');
    }
  }

  function completeJob(ticketId) {
    if (!requireManage()) return;
    OpsModal.open('Record maintenance completion', '<p class="capability-note">Record the observed work and findings. Completion is your submitted outcome, not independent verification. Device-affecting refill updates are disabled locally.</p>'+OpsModal.field('Completion findings','resolution_notes','textarea',''),[
      {label:'Cancel',class:'btn-ghost',onclick:'OpsModal.close()'},
      {label:'Save completion',class:'btn-primary',onclick:`OpsMaintenance.confirmComplete('${OpsModal.sid(ticketId)}')`},
    ]);
  }
  async function confirmComplete(ticketId) {
    if (!requireManage()) return;
    const data=OpsModal.getFormData();
    if (!data.resolution_notes?.trim()) return OpsModal.toast('Completion findings are required','watch');
    try {
      const result=await OpsModal.apiPost(`/tickets/${ticketId}/complete`,{resolution_notes:data.resolution_notes.trim()});
      if (result?.data?.ticket_id!==ticketId) throw new Error('Completion was not confirmed');
      OpsModal.close();OpsModal.toast('Recorded completion saved','nominal');back();
    } catch(err) {OpsModal.toast(err.message || 'Failed to complete work','error');}
  }

  // ── New job modal ──────────────────────────────────────────────
  async function newJob(context = {}) {
    if (!Auth.can('jobs.manage') || !Auth.hasNavAccess?.('jobs')) return OpsModal.toast('New service work requires permission to prepare provider work orders', 'watch');
    // Old callers may supply an internal crew: never reinterpret it as a provider.
    if (context.assigned_team || _teamScope) OpsModal.toast('Select a service provider in the work-order form; internal crew assignments are not transferred', 'watch');
    return OpsJobs.newJob({source:'estate',property_id:context.property_id,title:context.title,description:context.description});
  }

  async function submitNewJob() {
    OpsModal.toast('Legacy scheduling has been retired. Prepare new provider work in Services.', 'watch');
  }

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }


  return { render, back, search, filterStatus, forTeam, clearScope, newJob, submitNewJob, openJob, advance, completeJob, confirmComplete };
})();
