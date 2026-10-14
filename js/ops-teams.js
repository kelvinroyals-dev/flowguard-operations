// ============================================
// OPS TEAMS MODULE v3.3.0
// Teams are groups of field staff.
// Each team has members. Members can be
// added/removed from a team here.
// ============================================

const OpsTeams = (function () {
  'use strict';
  const canMng = () => !(window.Auth && Auth.can) || Auth.can('teams.manage');
  function requireTeamManage() { if (Auth.hasNavAccess('teams') && canMng()) return true; OpsModal.toast('You do not have permission to change teams', 'watch'); return false; }

  let _teams = [];
  let _pg    = null;
  let _container = null;
  let _view = 'dispatch';
  function setView(view) { _view = view === 'roster' ? 'roster' : 'dispatch'; document.querySelectorAll('#content-teams .fg-workspace button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.workspace===_view)); applyTeams(); }
  const _dash = v => (v == null || v === '') ? '—' : OpsModal.escape(v);

  // Only admins can permanently delete records
  const _isAdmin = (() => {
    try {
      const u = Auth.getUser() || {};
      return u.role === 'admin' || u.role === 'super_admin';
    } catch { return false; }
  })();

  // ── RENDER ────────────────────────────────────────────────────────────

  function render(container) {
    _container = container;
    container.innerHTML = `


      ${OpsModal.pageHeader({title:'Teams',subtitle:'Review reported readiness and assignments, or switch to the administrative roster. Location and check-ins are not assumed live.',actions:canMng() ? '<button class="fg-action fg-action-primary" onclick="OpsTeams.createTeam()">Create team</button>' : ''})}

      <div class="lv-wrap">
        <div class="lv-toolbar">
          <div class="lv-search">
            ${OpsModal.actionIcon("search")}
            <input id="tm-search" aria-label="Search teams" placeholder="Search teams…" oninput="OpsTeams.searchTeams(this.value)">
          </div>
          <div class="lv-toolbar-right">
            ${OpsModal.workspace({name:'Team workspace',value:_view,handler:'OpsTeams.setView',options:[['dispatch','Dispatch overview'],['roster','Team roster']]})}
            <select id="tm-status" aria-label="Team availability" class="um-filter" onchange="OpsTeams.filterStatus(this.value)">
              <option value="all">All statuses</option>
              <option value="on_site">On site</option>
              <option value="en_route">En route</option>
              <option value="returning">Returning</option>
              <option value="available">Available for dispatch</option>
              <option value="unknown">Unknown readiness</option>
            </select>
          </div>
        </div>
        <div id="tm-body">
          <div style="padding:48px;text-align:center;color:var(--ink-3);">
            <div class="loading" style="margin:0 auto 12px;"></div>
            <div style="font-size:var(--fs-base);">Loading teams…</div>
          </div>
        </div>
      </div>
    `;
    loadTeams();
  }

  // ── DATA ──────────────────────────────────────────────────────────────

  async function loadTeams() {
    try {
      const res  = await OpsModal.apiGet('/teams',{text:'raw'});
      _teams = OpsModal.readArray(res,'Team directory',['data','teams']);
      const search=document.getElementById('tm-search'),status=document.getElementById('tm-status');
      if(search)search.value=_tterm;
      if(status)status.value=_tstatus;
      applyTeams();
    } catch (err) {
      document.getElementById('tm-body').innerHTML = OpsModal.failure('Teams',err,"reloadTab('teams')");
    }
  }

  // ── HELPERS ───────────────────────────────────────────────────────────

  function statusConfig(s) {
    const key=String(s || '').toLowerCase();
    return {label:['available','on_site','en_route','returning','idle'].includes(key)?OpsModal.label(key):'Unknown'};
  }

  function initials(name) {
    return String(name || '').split(/\s+/).map(word=>word.match(/\p{L}/u)?.[0]).filter(Boolean).join('').toUpperCase().slice(0,2) || '?';
  }

  function formatTime(ds) { return OpsModal.relativeTime(ds); }

  // ── RENDER CARDS ─────────────────────────────────────────────────────

  let _tterm = '', _tstatus = 'all';
  function searchTeams(q) { _tterm = q.trim().toLowerCase(); applyTeams(); }
  function filterStatus(k) {
    _tstatus = k;
    applyTeams();
  }
  function applyTeams() {
    let rows = _teams;
    if (_tstatus !== 'all') rows = rows.filter(t => {
      const s = (t.status || '').toLowerCase();
      return _tstatus === 'available' ? ['idle','available'].includes(s) : _tstatus === 'unknown' ? !['idle','available','on_site','en_route','returning'].includes(s) : s === _tstatus;
    });
    if (_tterm) rows = rows.filter(t => `${t.team_name || t.name || ''} ${t.team_id || t.id || ''}`.toLowerCase().includes(_tterm));
    _pg = FGPaginator.create(rows,{pageSize:25,containerId:'tm-body'});
    _pg.render(renderTeams);
  }

  function renderTeams(teams) {
    const el = document.getElementById('tm-body');
    if (!el) return;

    if (!teams || teams.length === 0) {
      el.innerHTML = OpsModal.emptyState('',_teams.length?'No matching teams':'No teams returned',_teams.length?'Adjust the search or availability filter to review other teams.':'No teams were returned by this feed. Team creation is available to authorised operators in the page header.');
      return;
    }

    el.innerHTML = `
      <div class="lv-scroll">
        <table class="lv-table">
          <thead><tr><th scope="col">Team</th>${_view === 'dispatch' ? '<th scope="col">Readiness</th><th scope="col">Assignment / location</th><th scope="col">Last check-in</th><th scope="col">Active work</th>' : '<th scope="col">Members</th><th scope="col">Supervisor</th><th scope="col">Active work</th><th scope="col">Vehicle</th><th scope="col">Readiness</th>'}</tr></thead>
          <tbody>
            ${teams.map(t => {
              const id = OpsModal.sid(t.team_id || t.id);
              const name = t.team_name || t.name || id || '—';
              const sc = statusConfig(t.status);
              const scls = OpsModal.statusTone(t.status,'crew');
              const members = Array.isArray(t.members) ? t.members : [];
              const supervisor = t.supervisor || t.lead_name || (members.find(m => m.team_role === 'lead') || {}).full_name;
              const workCount = OpsModal.count(t.active_jobs);
              return `<tr class="clickable" onclick="OpsTeams.viewTeam('${id}')">
                <td>
                  <div class="lv-name-cell">
                    <div class="lv-avatar" aria-hidden="true">${OpsSpatial.icon("crew")}</div>
                    <div style="min-width:0;"><button type="button" class="record-link lv-name" onclick="event.stopPropagation();OpsTeams.viewTeam('${id}')">${OpsModal.escape(name)}</button><span class="lv-source">${OpsModal.escape(id)}</span></div>
                  </div>
                </td>
                ${_view === 'dispatch' ? `<td><span class="lv-status ${scls}">${sc.label}</span></td><td>${_dash(t.current_assignment || t.assigned_property || t.current_location || t.location)}</td><td>${formatTime(t.last_checkin || t.last_check_in)}</td><td class="lv-mono">${workCount === null ? 'Not supplied' : workCount}</td>` : `
                <td class="lv-mono">${Array.isArray(t.members) ? members.length : 'Unknown'}</td>
                <td>${_dash(supervisor)}</td>
                <td class="lv-mono">${workCount === null ? 'Not supplied' : workCount}</td>
                <td>${_dash(t.vehicle)}</td>
                <td><span class="lv-status ${scls}">${sc.label}</span></td>`}
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ── MANAGE MEMBERS MODAL ──────────────────────────────────────────────
  // This is the key feature: add/remove members from a specific team.

  async function manageMembers(teamId, teamName='Team') {
    if (!requireTeamManage()) return;
    OpsModal.open(`${teamName} — members`, `
      <div id="mm-loading" style="padding:32px;text-align:center;color:var(--ink-3);">
        <div class="loading" style="margin:0 auto 10px;"></div>
        <div style="font-size:var(--fs-base);">Loading…</div>
      </div>
      <div id="mm-body" style="display:none;"></div>
    `, [
      { label: 'Close', onclick: 'OpsModal.close()', class: 'btn-ghost' },
      { label: 'Add member', onclick: `OpsTeams.addMemberToTeam('${OpsModal.sid(teamId)}',${OpsModal.escape(JSON.stringify(teamName))})`, class: 'btn-primary', id: 'mm-add-btn' },
    ]);
    const body=document.getElementById('mm-body'),loading=document.getElementById('mm-loading');

    try {
      const teamRes=await OpsModal.apiGet(`/teams/${teamId}`,{text:'raw'});
      const team = OpsModal.readRecord(teamRes,'Team');
      const members = OpsModal.readArray({data:team.members},'Team member directory');
      if(!body || !document.contains(body))return;
      if (loading) loading.style.display = 'none';
      if (!body)   return;

      body.style.display = 'block';

      if (members.length === 0) {
        body.innerHTML = OpsModal.emptyState(OpsModal.entityIcon('crew'),'No team members returned','The returned roster is empty. Add member is available to authorised operators.');
        return;
      }

      body.innerHTML = `
        <div class="fg-timeline-title">Current members (${members.length})</div>
        <div id="mm-member-list">
          ${members.map(m => {
            const uid  = m.user_id || m.id;
            const name = m.full_name || m.name || 'Unknown';
            const role = m.role_id || m.role || '';
            return `
              <div class="tm-modal-member-row" id="mmr-${OpsModal.sid(uid)}">
                <div class="tm-modal-member-av">${OpsModal.escape(initials(name))}</div>
                <div>
                  <div class="tm-modal-member-name">${OpsModal.escape(name)}</div>
                  <div class="tm-modal-member-role">${OpsModal.escape(OpsModal.label(CONFIG.ROLE_LABELS[role] || role))}${m.phone ? ' · ' + OpsModal.escape(m.phone) : ''}</div>
                </div>
                <button class="tm-modal-member-remove fg-action" onclick="OpsTeams.removeMember('${OpsModal.sid(teamId)}','${OpsModal.sid(uid)}',${OpsModal.escape(JSON.stringify(name))})">
                  Remove
                </button>
              </div>`;
          }).join('')}
        </div>`;
    } catch (err) {
      if(!body || !document.contains(body))return;
      if (loading) loading.style.display = 'none';
      if (body) {
        body.style.display = 'block';
        body.innerHTML = OpsModal.failure('Team roster', err,`OpsTeams.manageMembers('${OpsModal.sid(teamId)}',${OpsModal.escape(JSON.stringify(teamName))})`);
      }
    }
  }

  // ── ADD MEMBER TO TEAM ────────────────────────────────────────────────

  async function addMemberToTeam(teamId, teamName='Team') {
    if (!requireTeamManage()) return;
    OpsModal.close();

    let users = [];
    try {
      const res = await OpsModal.apiGet('/users',{text:'raw'});
      users = OpsModal.readArray(res,'Staff directory',['data','users']).filter(u => !['inactive','suspended'].includes(String(u.status || '').toLowerCase()) && u.is_active!==false && (u.is_active===true || String(u.status || '').toLowerCase()==='active'));
    } catch (err) { OpsModal.open('Add team member',OpsModal.failure('Staff directory',err,`OpsTeams.addMemberToTeam('${OpsModal.sid(teamId)}',${OpsModal.escape(JSON.stringify(teamName))})`),[{label:'Close',onclick:'OpsModal.close()'}]); return; }
    const backAction={label:'Back to team roster',onclick:`OpsTeams.manageMembers('${OpsModal.sid(teamId)}',${OpsModal.escape(JSON.stringify(teamName))})`,class:'btn-ghost'};
    if(!users.length) {OpsModal.open(`Add member — ${teamName}`,OpsModal.emptyState(OpsModal.entityIcon('crew'),'No eligible active staff returned','No staff with a supplied active account state were returned. Unknown, suspended and inactive accounts are not eligible for this choice.'),[backAction]);return;}

    const userOptions = users.map(u => ({
          value: u.user_id || u.id,
          label: `${u.full_name || u.name || u.email || 'Name not supplied'} (${OpsModal.label(CONFIG.ROLE_LABELS[u.role_id || u.role] || u.role_id || u.role)})`,
        }));

    OpsModal.open(`Add member — ${teamName}`, `
      <p style="font-size:var(--fs-base);color:var(--ink-3);margin-bottom:16px;line-height:1.55;">
        Select a staff member to add to this team. They will appear in the team's member list and can be dispatched together.
      </p>
      ${OpsModal.field('Select staff member', 'user_id', 'select', '', { options: userOptions })}
      ${OpsModal.field('Role in team (optional)', 'team_role', 'text', '', { required: false, placeholder: 'e.g. Team lead, Technician, Driver' })}
    `, [
      backAction,
      { label: 'Add member', onclick: `OpsTeams.confirmAddMember('${OpsModal.sid(teamId)}',${OpsModal.escape(JSON.stringify(teamName))})`, class: 'btn-primary', id: 'modal-save-btn' },
    ]);
  }

  async function confirmAddMember(teamId, teamName) {
    if (!requireTeamManage()) return;
    const data = OpsModal.getFormData();
    if (!data.user_id) { OpsModal.toast('Please select a staff member', 'warning'); return; }
    OpsModal.setLoading('modal-save-btn', true);
    try {
      await OpsModal.apiPost(`/teams/${teamId}/members`, {
        user_id:   data.user_id,
        team_role: data.team_role || null,
      });
      OpsModal.close();
      OpsModal.toast('Member added to team', 'nominal');
      reloadTab('teams');
    } catch (err) {
      OpsModal.toast('Failed: ' + err.message, 'critical');
      OpsModal.setLoading('modal-save-btn', false);
    }
  }

  // ── REMOVE MEMBER FROM TEAM ───────────────────────────────────────────

  async function removeMember(teamId, userId, name) {
    if (!requireTeamManage()) return;
    OpsModal.confirm(`Remove "${name}" from this team?`, async function () {
      if (!requireTeamManage()) return;
      try {
        await OpsModal.apiDelete(`/teams/${teamId}/members/${userId}`);
        OpsModal.close();
        OpsModal.toast(`${name} removed from team`, 'nominal');
        // Remove the row from the modal DOM without full reload
        const row = document.getElementById(`mmr-${userId}`);
        if (row) row.remove();
        // Reload the tab in the background so counts update
        reloadTab('teams');
      } catch (err) {
        OpsModal.toast('Failed: ' + err.message, 'critical');
      }
    });
  }

  // ── VIEW TEAM ─────────────────────────────────────────────────────────

  function back() { if (_container) render(_container); }

  // ── FULL DETAIL SCREEN (no pop-up) ──
  function viewTeam(id) {
    const t = _teams.find(x => (x.team_id || x.id) == id);
    if (!_container) return;
    if (!t) { _container.innerHTML=OpsModal.recordFailure('Team',new Error('The requested team was not returned by the current directory.'),'OpsTeams.back()','OpsTeams.back()'); return; }
    const name = t.team_name || t.name || id;
    const sc = statusConfig(t.status);
    const membersSupplied = Array.isArray(t.members);
    const members = membersSupplied ? t.members : [];
    const supervisor = t.supervisor || t.lead_name || (members.find(m => m.team_role === 'lead') || {}).full_name;
    const safeId = OpsModal.sid(id);
    const nameArg = OpsModal.escape(JSON.stringify(name));

    const F = OpsModal.fact, E = OpsModal.emptyState, L = OpsModal.link;
    const statusCls = OpsModal.statusTone(t.status,'crew');
    const activeJobs=OpsModal.count(t.active_jobs);
    const dispatchEta=OpsModal.count(t.dispatch_eta_min),reportedEta=OpsModal.count(t.eta);

    const overview = `
      ${F('Vehicle', _dash(t.vehicle))}
      ${F('Location', _dash(t.current_location || t.location))}
      ${F('Dispatch destination', _dash(t.dispatch_destination))}
      ${F('Reported assignment', _dash(t.current_assignment || t.assigned_property))}
      ${t.current_alert_id ? F('Assigned incident', L('alerts',t.current_alert_id,'Review assigned incident')) : ''}
      ${t.dispatch_eta_min!=null ? F('Operator-entered ETA at dispatch',dispatchEta===null?'Not supplied':dispatchEta+' min · not a live estimate') : ''}
      ${t.dispatched_at ? F('Dispatched',OpsModal.fmtDateTime(t.dispatched_at)) : ''}
      ${t.dispatch_notes ? F('Dispatch notes',OpsModal.escape(t.dispatch_notes)) : ''}
      ${t.eta!=null ? F('Reported ETA',reportedEta===null?'Not supplied':reportedEta+' min · not a live estimate') : ''}
      ${t.equipment ? F('Equipment', OpsModal.escape(t.equipment)) : ''}`;

    const membersBody = members.length
      ? `<div class="lv-scroll"><table class="fgd-table"><thead><tr><th scope="col">Member</th><th scope="col">Role</th></tr></thead><tbody>${members.map(m => {
          const mid = m.user_id || m.id;
          const mn = m.full_name || m.name || '—';
          return `<tr><td class="strong">${mid ? L('team-members', mid, OpsModal.escape(mn)) : OpsModal.escape(mn)}</td><td>${OpsModal.escape(OpsModal.label(CONFIG.ROLE_LABELS[m.role_id || m.role] || m.role_id || m.role))}${m.team_role ? ' · ' + OpsModal.escape(OpsModal.label(m.team_role)) : ''}</td></tr>`;
        }).join('')}</tbody></table></div>`
      : E(OpsModal.entityIcon('crew'), membersSupplied ? 'No members returned' : 'Member roster unavailable', membersSupplied ? 'The returned roster is empty.' : 'Member records were not supplied; the team is not assumed empty.');

    const isIdle = ['idle', 'available'].includes((t.status || '').toLowerCase());
    const actions = canMng() ? [
      `<button class="fg-action" onclick="OpsTeams.manageMembers('${safeId}',${nameArg})">Manage members</button>`,
      `<button class="fg-action" onclick="OpsTeams.editStatus('${safeId}',${nameArg})">Update status</button>`,
      isIdle ? `<button class="primary fg-action fg-action-primary" onclick="OpsTeams.dispatch('${safeId}',${nameArg})">Dispatch team</button>` : '',
      _isAdmin && isIdle ? `<button class="danger fg-action" onclick="OpsTeams.deleteTeam('${safeId}',${nameArg})">Archive team</button>` : '',
    ].filter(Boolean).join('') : '';

    _container.innerHTML = OpsModal.detailShell({
      back: 'OpsTeams.back()',
      crumbRoot: 'Teams',
      title: OpsModal.escape(name),
      avatar: { text: OpsSpatial.icon("crew") },
      chips: [{ cls: statusCls, label: sc.label, dot: true }],
      meta: [['ID', OpsModal.escape(id)], ['Members', membersSupplied ? members.length : 'Not supplied']],
      actions,
      decision:[['Supervisor',supervisor || 'Not supplied'],['Last check-in',OpsModal.fmtDateTime(t.last_checkin || t.last_check_in)],['Next step',isIdle?'Review readiness before dispatch':'Review the reported assignment and confirm progress']],
      sections: [
        { id: 'overview', title: 'Dispatch context', body: overview },
        { id: 'members', title: 'Members', body: membersBody },
        { id: 'jobs', title: 'Current work', body: OpsModal.textBlock('Reported workload',`${activeJobs!==null?activeJobs+' active internal maintenance ticket'+(activeJobs===1?'':'s')+' reported.':'Active-work count was not supplied.'} Team maintenance tickets and external-provider work orders are separate queues.`)+`${Auth.hasNavAccess('maintenance') ? `<button class="fg-action" onclick="OpsMaintenance.forTeam('${OpsModal.sid(id)}')">Review this team’s maintenance</button>` : ''}` },
      ],
    });
  }

  // ── DISPATCH ──────────────────────────────────────────────────────────

  async function dispatch(id, name) {
    if (!requireTeamManage()) return;
    let alerts = [],alertsUnavailable=false;
    try {
      const res = await OpsModal.apiGet('/alerts',{text:'raw'});
      alerts = OpsModal.readArray(res,'Incident feed',['data','alerts']).filter(a => !a.assigned_team);
    } catch {alertsUnavailable=true;}

    const alertOptions = [
      { value: '', label: '— No specific incident —' },
      ...alerts.map(a => ({
        value: a.alert_id || a.id,
        label: `${OpsModal.label(a.alert_type) || 'Incident type not supplied'} — ${a.location || a.site_name || 'Location not supplied'}`,
      })),
    ];

    OpsModal.open(`Dispatch — ${name}`, `
      ${alertsUnavailable ? '<div class="capability-note">Incident choices are unavailable. You may record a destination-only dispatch, or cancel and retry before linking an incident.</div>' : ''}
      ${OpsModal.field('Dispatch location', 'destination', 'text', '', { placeholder: 'e.g. Lekki Phase 1, Zone A' })}
      ${OpsModal.field('Assign to incident (optional)', 'alert_id', 'select', '', { options: alertOptions, required: false })}
      ${OpsModal.field('ETA (minutes)', 'eta', 'number', '', { placeholder: '30', required: false, min:0, step:1 })}
      ${OpsModal.field('Dispatch notes (optional)', 'notes', 'textarea', '', { required: false, rows: 3, placeholder: 'Equipment required, access instructions, priority level…' })}
    `, [
      { label: 'Cancel',   onclick: 'OpsModal.close()', class: 'btn-ghost' },
      { label: 'Dispatch team', onclick: `OpsTeams.confirmDispatch('${OpsModal.sid(id)}')`, class: 'btn-primary', id: 'modal-save-btn' },
    ]);
  }

  async function confirmDispatch(id) {
    if (!requireTeamManage()) return;
    const data = OpsModal.getFormData();
    if (!data.destination) { OpsModal.toast('Please enter a dispatch location', 'warning'); return; }
    const eta=data.eta==null || String(data.eta).trim()==='' ? null : OpsModal.count(data.eta);
    if (data.eta!=null && String(data.eta).trim()!=='' && eta===null) { OpsModal.toast('ETA must be a non-negative whole number of minutes', 'watch'); return; }
    OpsModal.setLoading('modal-save-btn', true);
    try {
      await OpsModal.apiPost(`/teams/${id}/dispatch`, {
        destination: data.destination,
        alert_id:    data.alert_id || null,
        eta,
        notes:       data.notes || null,
        status:      'en_route',
      });
      OpsModal.close();
      OpsModal.toast('Team dispatched', 'nominal');
      reloadTab('teams');
    } catch (err) {
      OpsModal.toast('Dispatch failed: ' + err.message, 'critical');
      OpsModal.setLoading('modal-save-btn', false);
    }
  }

  // ── STATUS UPDATE ─────────────────────────────────────────────────────

  function editStatus(id, name) {
    if (!requireTeamManage()) return;
    const t = _teams.find(x => (x.team_id || x.id) == id);
    const status=['idle','available','en_route','on_site','returning'].includes(t?.status) ? t.status : '';
    OpsModal.open(`Update status — ${name}`, `
      ${OpsModal.field('Reported readiness', 'status', 'select', status, {
        options: [
          { value:'',          label:'Not supplied — select reported readiness' },
          { value:'idle',      label:'Idle — available for dispatch' },
          { value:'available', label:'Available for dispatch' },
          { value:'en_route',  label:'En route — heading to site' },
          { value:'on_site',   label:'On site — working at location' },
          { value:'returning', label:'Returning — heading back to base' },
        ]
      })}
      ${OpsModal.field('Current location', 'current_location', 'text', t?.current_location || t?.location || '', { required: false })}
      ${OpsModal.field('Notes (optional)', 'notes', 'textarea', '', { required: false, rows: 2 })}
    `, [
      { label: 'Cancel',        onclick: 'OpsModal.close()', class: 'btn-ghost' },
      { label: 'Update status', onclick: `OpsTeams.confirmStatus('${OpsModal.sid(id)}')`, class: 'btn-primary', id: 'modal-save-btn' },
    ]);
  }

  async function confirmStatus(id) {
    if (!requireTeamManage()) return;
    const data = OpsModal.getFormData();
    if (!['idle','available','en_route','on_site','returning'].includes(data.status)) { OpsModal.toast('Select the team’s reported readiness', 'watch'); return; }
    OpsModal.setLoading('modal-save-btn', true);
    try {
      await OpsModal.apiPut(`/teams/${id}/status`, { status: data.status, location: data.current_location });
      OpsModal.close();
      OpsModal.toast('Team status updated', 'nominal');
      reloadTab('teams');
    } catch (err) {
      OpsModal.toast('Update failed: ' + err.message, 'critical');
      OpsModal.setLoading('modal-save-btn', false);
    }
  }

  // ── CREATE TEAM ───────────────────────────────────────────────────────

  function createTeam() {
    if (!requireTeamManage()) return;
    OpsModal.open('Create team', `
      ${OpsModal.field('Team name', 'team_name', 'text', '', { placeholder: 'e.g. Alpha Response Unit' })}
      ${OpsModal.row([
        OpsModal.field('Team lead', 'team_lead', 'text', '', { placeholder: 'Full name', required: false }),
        OpsModal.field('Base location', 'base_location', 'text', '', { placeholder: 'e.g. VI Depot', required: false }),
      ])}
      ${OpsModal.field('Equipment', 'equipment', 'text', '', { placeholder: 'e.g. Hydro-jetting unit, vacuum truck', required: false })}
      <div style="padding:10px 12px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--rs);font-size:var(--fs-sm);color:var(--ink-3);margin-top:4px;">
        After creating the team, use <strong style="color:var(--ink-2);">Manage members</strong> on the team record to assign staff.
      </div>
    `, [
      { label: 'Cancel',      onclick: 'OpsModal.close()', class: 'btn-ghost' },
      { label: 'Create team', onclick: 'OpsTeams.confirmCreate()', class: 'btn-primary', id: 'modal-save-btn' },
    ]);
  }

  async function confirmCreate() {
    if (!requireTeamManage()) return;
    const data = OpsModal.getFormData();
    if (!data.team_name) { OpsModal.toast('Team name is required', 'warning'); return; }
    OpsModal.setLoading('modal-save-btn', true);
    try {
      await OpsModal.apiPost('/teams', { ...data, status: 'idle' });
      OpsModal.close();
      OpsModal.toast('Team created — add members from the team record', 'nominal');
      reloadTab('teams');
    } catch (err) {
      OpsModal.toast('Failed: ' + err.message, 'critical');
      OpsModal.setLoading('modal-save-btn', false);
    }
  }

  // ── DELETE TEAM ───────────────────────────────────────────────────────

  function deleteTeam(id, name) {
    if (!requireTeamManage()) return;
    if (!_isAdmin) return OpsModal.toast('Only an administrator can archive a team', 'watch');
    OpsModal.confirm(
      `Archive team "${name}"? Historical assignments, membership and staff accounts are preserved. Teams with active assignments cannot be archived.`,
      async function () {
        if (!requireTeamManage() || !_isAdmin) return;
        OpsModal.setLoading('modal-confirm-btn', true);
        try {
          await OpsModal.apiDelete(`/teams/${id}`);
          OpsModal.close();
          OpsModal.toast(`Team "${name}" archived; history preserved`, 'nominal');
          reloadTab('teams');
        } catch (err) {
          OpsModal.toast('Delete failed: ' + err.message, 'critical');
          OpsModal.setLoading('modal-confirm-btn', false);
        }
      }
    );
  }

  return {
    render, back, setView, searchTeams, filterStatus, manageMembers, addMemberToTeam, confirmAddMember,
    removeMember, viewTeam, dispatch, confirmDispatch,
    editStatus, confirmStatus, createTeam, confirmCreate, deleteTeam,
  };

})();
