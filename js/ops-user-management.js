// ============================================
// OPS USER MANAGEMENT MODULE v3.3.0
// Internal staff — role, status, and team assignment.
// Team membership is managed in the Teams tab.
// This view shows which team each person belongs to
// and allows quick reassignment.
// ============================================

const OpsUserManagement = (function () {
  'use strict';
  const canMng = () => !(window.Auth && Auth.can) || Auth.can('team-members.manage');
  function requireStaffManage(adminOnly=false) { if (Auth.hasNavAccess('team-members') && canMng() && (!adminOnly || _isAdmin)) return true; OpsModal.toast(adminOnly ? 'Only an administrator can change account access or invite staff' : 'You do not have permission to edit staff', 'watch'); return false; }
  let _editingAccess = null;

  let _users = [];
  let _teams = [];
  let _pg    = null;
  let _container = null;
  const _dash = v => (v == null || v === '') ? '—' : v;
  function accountState(u) { return u.is_active===false ? 'inactive' : String(u.status || (u.is_active===true?'active':'unknown')).toLowerCase(); }

  // Only admins can permanently delete records
  const _isAdmin = (() => {
    try {
      const u = Auth.getUser() || {};
      return u.role === 'admin' || u.role === 'super_admin';
    } catch { return false; }
  })();

  const ROLE_CONFIG = {
    admin:              { label:'Admin',             color:'var(--ink-2)', bg:'var(--surface-2)', perms:['Full system access, all modules and configuration'] },
    super_admin:        { label:'Super admin',       color:'var(--ink-2)', bg:'var(--surface-2)', perms:['Full system access, all modules and configuration'] },
    operations_manager: { label:'Operations manager',color:'var(--ink-2)', bg:'var(--surface-2)', perms:['Client management','Team management','Incident handling','Reports'] },
    dispatcher:         { label:'Dispatcher',        color:'var(--ink-2)', bg:'var(--surface-2)', perms:['View incidents','Assign teams','Dispatch operations'] },
    field_lead:         { label:'Field lead',        color:'var(--ink-2)', bg:'var(--surface-2)', perms:['View own incidents','Update work status'] },
    analyst:            { label:'Analyst',           color:'var(--ink-2)', bg:'var(--surface-2)', perms:['View reports','Export data'] },
    finance:            { label:'Finance',           color:'var(--ink-2)', bg:'var(--surface-2)', perms:['View billing','Manage invoices','Revenue reports'] },
  };

  const ROLE_OPTIONS = [
    { value:'',                   label:'Select a role' },
    { value:'admin',              label:'Admin' },
    { value:'super_admin',        label:'Super admin' },
    { value:'operations_manager', label:'Operations manager' },
    { value:'dispatcher',         label:'Dispatcher' },
    { value:'field_lead',         label:'Field lead' },
    { value:'analyst',            label:'Analyst' },
    { value:'finance',            label:'Finance' },
  ];

  function getRoleConfig(role) {
    return ROLE_CONFIG[role] || { label: OpsModal.label(role), color:'var(--ink-3)', bg:'var(--surface-2)', perms:[] };
  }

  // ── RENDER ────────────────────────────────────────────────────────────

  function render(container) {
    _container = container;
    container.innerHTML = `


      ${OpsModal.pageHeader({title:'Staff',subtitle:'Manage internal staff access levels, operational roles, and rapid response team assignments.',actions:canMng() && _isAdmin ? '<button class="fg-action fg-action-primary" onclick="OpsUserManagement.openInvite()">Invite staff member</button>' : ''})}

      <div class="lv-wrap">
        <div class="lv-toolbar">
          <div class="lv-search">
            ${OpsModal.actionIcon("search")}
            <input id="um-search" aria-label="Search staff" placeholder="Search staff…" oninput="OpsUserManagement.search(this.value)">
          </div>
          <div class="lv-toolbar-right">
            <select aria-label="Staff team" class="um-filter" id="um-team-filter" onchange="OpsUserManagement.filterTeam(this.value)">
              <option value="">All teams</option>
            </select>
            <select aria-label="Staff role" class="um-filter" id="um-role-filter" onchange="OpsUserManagement.filterRole(this.value)">
              <option value="">All roles</option>
              ${ROLE_OPTIONS.filter(r => r.value).map(r => `<option value="${r.value}">${r.label}</option>`).join('')}
            </select>
            <select class="um-filter" id="um-state-filter" aria-label="Staff account state" onchange="OpsUserManagement.filterState(this.value)">
              <option value="">All account states</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
              <option value="invited">Invited</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
        </div>
        <div id="um-table-body">
          <div style="padding:48px;text-align:center;color:var(--ink-3);">
            <div class="loading" style="margin:0 auto 12px;"></div>
            <div style="font-size:var(--fs-base);">Loading staff…</div>
          </div>
        </div>
      </div>

    `;

    loadData();
  }

  // ── DATA ──────────────────────────────────────────────────────────────

  async function loadData() {
    try {
      // Load users and teams in parallel
      const [usersRes, teamsRes] = await Promise.all([
        OpsModal.apiGet('/users',{text:'raw'}),
        OpsModal.apiGet('/teams',{text:'raw'}),
      ]);

      _users = usersRes.data || usersRes.users;
      _teams = teamsRes.data || teamsRes.teams;
      if (!Array.isArray(_users) || !Array.isArray(_teams)) throw new Error('Staff or team choices were not supplied');

      // Populate team filter dropdown
      const teamFilter = document.getElementById('um-team-filter');
      if (teamFilter && _teams.length > 0) {
        _teams.forEach(t => {
          const opt = document.createElement('option');
          opt.value       = t.team_id || t.id;
          opt.textContent = t.team_name || t.name;
          teamFilter.appendChild(opt);
        });
      }

      _pg = FGPaginator.create(_users, { pageSize: 25, containerId: 'um-table-body' });
      _pg.render(renderTable);
      for (const [id,value] of [['um-role-filter',_activeRole],['um-team-filter',_activeTeam],['um-state-filter',_activeState],['um-search',_term]]) {
        const input=document.getElementById(id); if (input) input.value=value;
      }
      applyFilters();

    } catch (err) {
      renderError(err.message);
    }
  }

  // ── FILTERS ───────────────────────────────────────────────────────────

  let _activeRole = '';
  let _activeTeam = '';
  let _activeState = '';
  function filterState(state) { _activeState=state; applyFilters(); }

  function filterRole(role) {
    _activeRole = role;
    applyFilters();
  }

  function filterTeam(teamId) {
    _activeTeam = teamId;
    applyFilters();
  }

  let _term = '';
  function search(q) { _term = q.trim().toLowerCase(); applyFilters(); }
  function applyFilters() {
    let filtered = _users;
    if (_activeRole) filtered = filtered.filter(u => (u.role_id || u.role) === _activeRole);
    if (_activeTeam) filtered = filtered.filter(u => String(u.team_id || u.team?.team_id || '') === String(_activeTeam));
    if (_activeState) filtered = filtered.filter(u => accountState(u) === _activeState);
    if (_term) filtered = filtered.filter(u => `${u.full_name || u.name || ''} ${u.email || ''}`.toLowerCase().includes(_term));
    if (_pg) _pg.update(filtered);
    else renderTable(filtered);
  }

  // ── HELPERS ───────────────────────────────────────────────────────────

  function initials(name) {
    const letters=String(name || '').split(/\s+/).map(word=>word.match(/\p{L}/u)?.[0]).filter(Boolean);
    return letters.join('').toUpperCase().slice(0,2) || '?';
  }

  function formatTime(ds) { return OpsModal.relativeTime(ds); }

  function getTeamName(user) {
    // Try various response shapes
    const tid = user.team_id || user.team?.team_id || user.team?.id;
    if (!tid) return null;
    const t = _teams.find(x => (x.team_id || x.id) == tid);
    return t ? (t.team_name || t.name) : null;
  }

  // ── TABLE ─────────────────────────────────────────────────────────────

  function renderTable(users) {
    const el = document.getElementById('um-table-body');
    if (!el) return;

    if (!users || users.length === 0) {
      el.innerHTML = OpsModal.emptyState(OpsModal.entityIcon('client'),_users.length?'No matching staff':'No staff records returned',_users.length?'Change the search, team, role or account filter to review other staff.':'No staff records were returned. Authorised administrators can invite staff from the page header.');
      return;
    }

    el.innerHTML = `
      <div class="lv-scroll">
        <table class="lv-table">
          <thead>
            <tr>
              <th scope="col">Name</th><th scope="col">Role</th><th scope="col">Team</th><th scope="col">Phone</th>
              <th scope="col">Availability</th><th scope="col">Current assignment</th><th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(u => {
              const id       = OpsModal.sid(u.user_id || u.id);
              const name     = u.full_name || u.name || 'Unknown';
              const role     = u.role_id || u.role || '';
              const rc       = getRoleConfig(role);
              const teamName = getTeamName(u) || (u.team?.name) || null;
              const avail    = OpsModal.label(u.availability || 'unknown');
              return `<tr class="clickable" onclick="OpsUserManagement.open('${id}')">
                <td>
                  <div class="lv-name-cell">
                    <div class="lv-avatar" style="background:var(--surface-3);color:var(--ink-2);border:1px solid var(--border);">${OpsModal.escape(initials(name))}</div>
                    <div style="min-width:0;"><button type="button" class="record-link lv-name" onclick="event.stopPropagation();OpsUserManagement.open('${id}')">${OpsModal.escape(name)}</button><span class="lv-source">${OpsModal.escape(u.email || '')}</span></div>
                  </div>
                </td>
                <td><span class="um-role-chip" style="background:${rc.bg};color:${rc.color};">${OpsModal.escape(rc.label)}</span></td>
                <td>${teamName ? `<span class="um-team-chip">${OpsModal.escape(teamName)}</span>` : `<span class="um-team-chip unassigned">${u.team_id===null || u.team===null ? 'Unassigned' : 'Not supplied'}</span>`}</td>
                <td>${OpsModal.escape(_dash(u.phone))}</td>
                <td>${OpsModal.escape(avail)}</td>
                <td>${OpsModal.escape(_dash(u.current_assignment))}</td>
                <td>${OpsModal.status(accountState(u),null,null,'account')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function back() { if (_container) render(_container); }

  // ── FULL DETAIL SCREEN (no pop-up) ──
  async function open(id) {
    if (!_container) return;
    _container.innerHTML = `<div style="padding:60px;text-align:center;color:var(--ink-3);"><div class="loading" style="margin:0 auto 12px;"></div>Loading staff details…</div>`;
    try {
      const res = await OpsModal.apiGet('/users/' + id,{text:'raw'});
      if (!res.data || Array.isArray(res.data) || !(res.data.user_id || res.data.id)) throw new Error('Staff record was not supplied');
      renderDetail(res.data);
    } catch (err) {
      _container.innerHTML = OpsModal.recordFailure('Staff member',err,`OpsUserManagement.open('${OpsModal.sid(id)}')`,'OpsUserManagement.back()');
    }
  }

  function renderDetail(u) {
    const id = OpsModal.sid(u.user_id || u.id);
    const name = u.full_name || u.name || 'Staff member';
    const nameArg = "decodeURIComponent('"+encodeURIComponent(name).replace(/'/g,'%27')+"')";
    const role = u.role_id || u.role || '';
    const rc = getRoleConfig(role);
    const accessState = accountState(u), isActive=accessState==='active';
    const teamName = getTeamName(u) || (u.team?.name) || null;
    const teamId = u.team_id || u.team?.team_id || u.team?.id;
    const F = OpsModal.fact, E = OpsModal.emptyState;
    const roleChip = `<span class="um-role-chip" style="background:${rc.bg};color:${rc.color};">${OpsModal.escape(rc.label)}</span>`;
    const teamCell = teamId ? OpsModal.link('teams', teamId, teamName || teamId) : OpsModal.escape(teamName || (u.team_id===null || u.team===null ? 'Unassigned' : 'Not supplied'));
    const iUser=OpsModal.entityIcon('client'),iShield=OpsModal.entityIcon('shield');

    const profile = `<div class="fg-facts-grid">
      ${F('Phone', OpsModal.escape(_dash(u.phone)))}
      ${F('Email', OpsModal.escape(_dash(u.email)))}
      ${F('Availability', OpsModal.escape(OpsModal.label(u.availability || 'unknown')))}
      ${F('Current assignment', OpsModal.escape(_dash(u.current_assignment)))}
      ${F('Last active', formatTime(u.last_login || u.last_active))}</div>`;

    const roleDescription = rc.perms && rc.perms.length
      ? `<div class="fg-role-description">${rc.desc ? `<p>${OpsModal.escape(rc.desc)}</p>` : ''}<ul>${rc.perms.map(p => `<li>${OpsModal.escape(p)}</li>`).join('')}</ul></div>`
      : E(iShield, 'No permissions listed', 'This role has no explicit permission list configured.');
    const effective=u.effective_permissions;
    const accessBody = effective && typeof effective==='object' && !Array.isArray(effective)
      ? '<div class="capability-note">Server-returned effective role permissions, including overrides. Account state and record/tenant scope still apply; this is not a guarantee of access to every record.</div>'+ (Object.keys(effective).length ? '<div class="lv-scroll"><table class="fgd-table"><thead><tr><th scope="col">Permission</th><th scope="col">Grant</th></tr></thead><tbody>'+Object.entries(effective).map(([key,allowed])=>`<tr><td>${OpsModal.escape(OpsModal.permissionLabel(key))}</td><td>${OpsModal.status(allowed===true?'allowed':allowed===false?'denied':'unknown',allowed===true?'Allowed':allowed===false?'Denied':'Not supplied',null,'grant')}</td></tr>`).join('')+'</tbody></table></div>' : OpsModal.emptyState('','No effective grants returned','The supplied effective-permission object is empty. This is not a general role description.'))
      : '<div class="capability-note">This is a general role description, not this person’s effective permission set. Server overrides and record scope may change access; their effective permissions are not supplied here.</div>' + roleDescription;

    const actions = canMng() ? [
      `<button class="fg-action" onclick="OpsUserManagement.editUser('${id}',${nameArg})">Edit staff details</button>`,
      _isAdmin && ['active','inactive','suspended'].includes(accessState) ? isActive
        ? `<button class="fg-action danger" onclick="OpsUserManagement.deactivateUser('${id}',${nameArg})">Deactivate account</button>`
        : `<button class="fg-action" onclick="OpsUserManagement.reactivateUser('${id}')">Reactivate account</button>` : '',
      _isAdmin ? `<button class="danger fg-action" onclick="OpsUserManagement.deleteUser('${id}',${nameArg})">Delete account</button>` : '',
    ].filter(Boolean).join('') : '';

    _container.innerHTML = OpsModal.detailShell({
      back: 'OpsUserManagement.back()',
      crumbRoot: 'Staff',
      title: OpsModal.escape(name),
      avatar: { text: OpsModal.escape(initials(name)) },
      chips: [{ cls: OpsModal.statusTone(accessState,'account'), label: OpsModal.escape(OpsModal.label(accessState)), dot: true }],
      meta: [['Role', roleChip], ['Team', teamCell]],
      decision:[['Permission basis',effective && typeof effective==='object' && !Array.isArray(effective) ? 'Returned effective grants · account and record scope still apply' : 'Effective grants not supplied · general role description only'],['Next step',isActive?'Review effective permissions and team assignment':'Review account state before granting access']],
      actions,
      sections: [
        { id: 'profile', title: 'Contact and activity', body: profile },
        { id: 'access', title: effective && typeof effective==='object' && !Array.isArray(effective) ? 'Effective permissions' : 'General role description', body: accessBody },
        { id: 'jobs', title: 'Assigned work', body: `<div class="capability-note">Individual assignments were not supplied. Team maintenance shows shared team work, not this person’s individual workload.</div>${teamId && Auth.hasNavAccess('maintenance') ? `<button class="fg-action" onclick="OpsMaintenance.forTeam('${OpsModal.sid(teamId)}')">Review team maintenance</button>` : ''}` },
      ],
    });
  }

  function renderError(message) {
    const el = document.getElementById('um-table-body');
    if (!el) return;
    el.innerHTML = OpsModal.failure('Staff',{message},"reloadTab('team-members')");
  }

  // ── INVITE ────────────────────────────────────────────────────────────

  function openInvite() {
    if (!requireStaffManage(true)) return;
    const teamOptions = [
      { value: '', label: '— No team (assign later) —' },
      ..._teams.map(t => ({ value: t.team_id || t.id, label: t.team_name || t.name })),
    ];

    OpsModal.open('Invite staff member', `
      ${OpsModal.field('Email address', 'email', 'email', '', { placeholder: 'team.member@flowguard.ng' })}
      ${OpsModal.row([
        OpsModal.field('Full name', 'full_name', 'text', '', { placeholder: 'First Last' }),
        OpsModal.field('Role', 'role_id', 'select', 'dispatcher', { options: ROLE_OPTIONS }),
      ])}
      ${OpsModal.row([
        OpsModal.field('Assign to team', 'team_id', 'select', '', { options: teamOptions, required: false }),
        OpsModal.field('Phone (optional)', 'phone', 'text', '', { placeholder: '+234…', required: false }),
      ])}
      <div id="um-role-desc"></div>
      <div style="padding:10px 12px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--rs);font-size:var(--fs-sm);color:var(--ink-3);margin-top:4px;">
        ${window.FG_LOCAL_PREVIEW || CONFIG.LOCAL_SANDBOX ? 'Local review only. Invitation delivery is disabled; no email will be sent.' : 'Submitting creates a staff invitation. Check the returned result before assuming delivery or team assignment.'}
      </div>
    `, [
      { label: 'Cancel',      onclick: 'OpsModal.close()', class: 'btn-ghost' },
      { label: 'Send invitation', onclick: 'OpsUserManagement.sendInvite()', class: 'btn-primary', id: 'modal-save-btn' },
    ]);
    wireRoleDesc('dispatcher');
  }

  // Show a plain-language description of the selected role right where the
  // role is being chosen — replaces the always-on "Role Permissions" board
  // that used to sit on the list page.
  function roleDescHTML(rc) {
    if (!rc) return '';
    return `<div style="padding:11px 13px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--rs);margin-top:2px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:${rc.desc || (rc.perms && rc.perms.length) ? '8px' : '0'};">
        <span style="padding:3px 10px;border-radius:var(--radius-pill);font-size:var(--fs-xs);font-weight:700;background:${rc.bg};color:${rc.color};">${OpsModal.escape(rc.label)}</span>
        <span style="font-size:var(--fs-2xs);color:var(--ink-3);text-transform:uppercase;letter-spacing:.6px;font-weight:700;">General role description</span>
      </div>
      ${rc.desc ? `<div style="font-size:var(--fs-sm);color:var(--ink-2);margin-bottom:6px;line-height:1.5;">${rc.desc}</div>` : ''}
      ${rc.perms && rc.perms.length ? `<div class="fg-role-description"><ul>${rc.perms.map(p => `<li>${OpsModal.escape(p)}</li>`).join('')}</ul></div>` : ''}
    </div>`;
  }
  function wireRoleDesc(initialRole) {
    setTimeout(() => {
      const sel = document.querySelector('[name="role_id"]');
      const box = document.getElementById('um-role-desc');
      if (!box) return;
      const upd = () => { box.innerHTML = roleDescHTML(getRoleConfig(sel ? sel.value : initialRole)); };
      if (sel) sel.addEventListener('change', upd);
      upd();
    }, 0);
  }

  async function sendInvite() {
    if (!requireStaffManage(true)) return;
    const data = OpsModal.getFormData();
    if (!data.email)     { OpsModal.toast('Email is required', 'warning'); return; }
    if (!data.full_name) { OpsModal.toast('Full name is required', 'warning'); return; }
    OpsModal.setLoading('modal-save-btn', true);
    try {
      const res = await OpsModal.apiPost('/users/invite', data);
      OpsModal.close();
      const emailed = res?.data?.emailed;
      OpsModal.toast(emailed === true ? 'Invitation email sent' : emailed === false ? 'Staff account added, but the invite email failed to send' : 'Invitation accepted; email delivery was not reported', emailed === true ? 'nominal' : 'warning');
      reloadTab('team-members');
    } catch (err) {
      OpsModal.toast('Failed: ' + err.message, 'critical');
      OpsModal.setLoading('modal-save-btn', false);
    }
  }

  // ── EDIT USER ─────────────────────────────────────────────────────────

  async function editUser(id, name) {
    if (!requireStaffManage()) return;
    let userData = { user_id: id, full_name: name };
    try {
      const res = await OpsModal.apiGet(`/users/${id}`,{text:'raw'});
      userData  = res.data || res;
    } catch { return OpsModal.toast('Staff record is unavailable; editing is blocked until it loads', 'watch'); }
    if (!userData || !(userData.user_id || userData.id)) return OpsModal.toast('Staff record was not supplied', 'watch');
    _editingAccess = {id:String(id),role:userData.role_id || userData.role || '',status:userData.status || ''};

    const teamOptions = [
      { value: '', label: '— No team —' },
      ..._teams.map(t => ({ value: t.team_id || t.id, label: t.team_name || t.name })),
    ];

    const currentTeam = userData.team_id || userData.team?.team_id || userData.team?.id || '';

    OpsModal.open(`Edit staff details — ${name}`, `
      ${OpsModal.field('Full name', 'full_name', 'text', userData.full_name || userData.name || name)}
      ${OpsModal.row([
        OpsModal.field('Role', 'role_id', 'select', userData.role_id || userData.role || '', { options: ROLE_OPTIONS, disabled:!_isAdmin }),
        OpsModal.field('Status', 'status', 'select', userData.status || (userData.is_active === true ? 'active' : userData.is_active === false ? 'inactive' : ''), {
          disabled:!_isAdmin,
          options: [
            { value:'',          label:'Not supplied — select account state' },
            { value:'active',    label:'Active' },
            { value:'inactive',  label:'Inactive' },
            { value:'suspended', label:'Suspended' },
          ]
        }),
      ])}
      ${OpsModal.field('Assign to team', 'team_id', 'select', String(currentTeam), { options: teamOptions, required: false })}
      <div id="um-role-desc"></div>
      ${OpsModal.field('Email', 'email', 'email', userData.email || '', { readonly: true })}
    `, [
      { label: 'Cancel',       onclick: 'OpsModal.close()', class: 'btn-ghost' },
      { label: 'Save staff details', onclick: `OpsUserManagement.saveEdit('${id}')`, class: 'btn-primary', id: 'modal-save-btn' },
    ]);
    wireRoleDesc(userData.role_id || userData.role || '');
  }

  async function saveEdit(id, confirmed=false, preparedData=null) {
    if (!requireStaffManage()) return;
    const data = preparedData || OpsModal.getFormData();
    delete data.email;
    if (!String(data.full_name || '').trim()) return OpsModal.toast('Full name is required', 'watch');
    if (_isAdmin && (!data.role_id || !['active','inactive','suspended'].includes(data.status))) return OpsModal.toast('Select a role and account state explicitly before saving', 'watch');
    if (!_isAdmin) { delete data.role_id; delete data.status; delete data.is_active; }
    if (_isAdmin && !confirmed && _editingAccess?.id === String(id) && (String(data.role_id) !== String(_editingAccess.role) || String(data.status) !== String(_editingAccess.status))) {
      const pendingData = { ...data };
      return OpsModal.confirm('Change this staff member’s role or account state? This affects access and must be accepted by the server.',()=>saveEdit(id,true,pendingData));
    }
    const buttonId = confirmed ? 'modal-confirm-btn' : 'modal-save-btn';
    OpsModal.setLoading(buttonId, true);
    try {
      await OpsModal.apiPut(`/users/${id}`, data);
      OpsModal.close();
      OpsModal.toast('Staff details updated', 'nominal');
      reloadTab('team-members');
    } catch (err) {
      OpsModal.toast('Failed: ' + err.message, 'critical');
      OpsModal.setLoading(buttonId, false);
    }
  }

  // ── DEACTIVATE / REACTIVATE ───────────────────────────────────────────

  function deactivateUser(id, name) {
    if (!requireStaffManage(true)) return;
    OpsModal.confirm(`Deactivate "${name}"? They will lose access immediately.`, async function () {
      if (!requireStaffManage(true)) return;
      OpsModal.setLoading('modal-confirm-btn', true);
      try {
        await OpsModal.apiPut(`/users/${id}`, { is_active: false, status: 'inactive' });
        OpsModal.close();
        OpsModal.toast('Staff account deactivated', 'nominal');
        reloadTab('team-members');
      } catch (err) {
        OpsModal.toast('Failed: ' + err.message, 'critical');
        OpsModal.setLoading('modal-confirm-btn', false);
      }
    },{title:'Deactivate account',confirmLabel:'Deactivate account',detail:'This removes sign-in access immediately. The staff record and historical activity are retained.'});
  }

  async function reactivateUser(id) {
    if (!requireStaffManage(true)) return;
    try {
      await OpsModal.apiPut(`/users/${id}`, { status: 'active', is_active: true });
      OpsModal.toast('Staff account reactivated', 'nominal');
      reloadTab('team-members');
    } catch (err) {
      OpsModal.toast('Failed: ' + err.message, 'critical');
    }
  }

  // ── DELETE USER (admin only — permanent) ──────────────────────────────

  function deleteUser(id, name) {
    if (!requireStaffManage(true)) return;
    OpsModal.confirm(`Permanently delete "${name}"? This removes the account and all associated data.`, async function () {
      if (!requireStaffManage(true)) return;
      OpsModal.setLoading('modal-confirm-btn', true);
      try {
        await OpsModal.apiDelete(`/users/${id}`);
        OpsModal.close();
        OpsModal.toast(`${name} deleted`, 'nominal');
        reloadTab('team-members');
      } catch (err) {
        OpsModal.toast('Delete failed: ' + err.message, 'critical');
        OpsModal.setLoading('modal-confirm-btn', false);
      }
    });
  }

  return {
    render, open, back, search, filterRole, filterTeam, filterState,
    openInvite, sendInvite,
    editUser, saveEdit,
    deactivateUser, reactivateUser, deleteUser,
    ROLE_CONFIG,   // single source of truth for the role/permission reference
  };

})();
