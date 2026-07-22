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

  let _users = [];
  let _teams = [];
  let _pg    = null;
  let _container = null;
  const _dash = v => (v == null || v === '') ? '—' : v;

  // Only admins can permanently delete records
  const _isAdmin = (() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('user') || localStorage.getItem('user') || '{}');
      return u.role === 'admin';
    } catch { return false; }
  })();

  const ROLE_CONFIG = {
    admin:              { label:'Admin',             color:'#0a2a3d', bg:'rgba(10,42,61,.08)',   perms:['Full system access, all modules and configuration'] },
    super_admin:        { label:'Super Admin',       color:'#0a2a3d', bg:'rgba(10,42,61,.08)',   perms:['Full system access, all modules and configuration'] },
    operations_manager: { label:'Ops Manager',       color:'#16a8d3', bg:'rgba(22,168,211,.09)', perms:['Client management','Team management','Alert handling','Reports'] },
    dispatcher:         { label:'Dispatcher',        color:'#b45309', bg:'rgba(180,83,9,.08)',   perms:['View alerts','Assign teams','Dispatch operations'] },
    field_lead:         { label:'Field Lead',        color:'#0a8a6a', bg:'rgba(10,138,106,.08)', perms:['View own alerts','Update job status'] },
    analyst:            { label:'Analyst',           color:'#7c3aed', bg:'rgba(124,58,237,.08)', perms:['View reports','Export data'] },
    finance:            { label:'Finance',           color:'#0d7fa0', bg:'rgba(13,127,160,.09)', perms:['View billing','Manage invoices','Revenue reports'] },
  };

  const ROLE_OPTIONS = [
    { value:'super_admin',        label:'Super Admin' },
    { value:'operations_manager', label:'Operations Manager' },
    { value:'dispatcher',         label:'Dispatcher' },
    { value:'field_lead',         label:'Field Lead' },
    { value:'analyst',            label:'Analyst' },
    { value:'finance',            label:'Finance' },
  ];

  function getRoleConfig(role) {
    return ROLE_CONFIG[role] || { label: role || '—', color:'var(--ink-3)', bg:'var(--surface-2)', perms:[] };
  }

  // ── RENDER ────────────────────────────────────────────────────────────

  function render(container) {
    _container = container;
    container.innerHTML = `
      <style>
        .ops-table tbody tr.clickable { cursor:pointer; transition:background .12s; }
        .ops-table tbody tr.clickable:hover { background:var(--surface-2,#f2f8fb); }
        .um-back { display:inline-flex; align-items:center; gap:6px; font-size:var(--fs-sm); font-weight:600; color:var(--ink-2); background:var(--surface-2); border:1px solid var(--border); border-radius:9px; padding:8px 13px; cursor:pointer; }
        .um-detail-top { display:flex; align-items:center; gap:14px; margin-bottom:18px; flex-wrap:wrap; }
        .um-detail-name { font-family:var(--ff-d); font-size:var(--fs-xl); font-weight:700; color:var(--ink); line-height:1.1; }
        .um-detail-meta { font-size:var(--fs-sm); color:var(--ink-3); margin-top:3px; }
        .um-detail-actions { margin-left:auto; display:flex; gap:8px; }
        .um-sec { background:var(--surface); border:1px solid var(--border); border-radius:var(--r,14px); box-shadow:var(--sh-xs); margin-bottom:14px; overflow:hidden; }
        .um-sec-h { padding:12px 18px; border-bottom:1px solid var(--border); font-family:var(--ff-d); font-size:var(--fs-sm); font-weight:700; color:var(--ink); display:flex; justify-content:space-between; }
        .um-sec-b { padding:16px 18px; }
        .um-fgrid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:14px 22px; }
        .um-f .k { font-size:var(--fs-2xs); font-weight:700; letter-spacing:.9px; text-transform:uppercase; color:var(--ink-3); }
        .um-f .v { font-size:var(--fs-md); color:var(--ink); font-weight:600; margin-top:3px; }
        .um-e { color:var(--ink-3); font-size:var(--fs-sm); padding:6px 0; }
        .um-needs { font-size:var(--fs-xs); color:var(--ink-4); font-style:italic; }
        .um-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:20px; }
        .um-header-title { font-family:var(--ff-d,'Space Grotesk',sans-serif); font-size:var(--fs-xl); font-weight:800; color:var(--ink,#0a1f2e); letter-spacing:-.02em; margin-bottom:3px; }
        .um-header-sub { font-size:var(--fs-base); color:var(--ink-3,#6b8fa3); }

        .um-table-card { background:var(--surface,#fff); border:1px solid var(--border,#dae6ef); border-radius:var(--r,14px); overflow:hidden; box-shadow:var(--sh-xs); margin-bottom:18px; }
        .um-table-head { padding:14px 20px; border-bottom:1px solid var(--border,#dae6ef); display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .um-table-title { font-family:var(--ff-d,'Space Grotesk',sans-serif); font-size:var(--fs-md); font-weight:700; color:var(--ink,#0a1f2e); }
        .um-controls { display:flex; align-items:center; gap:8px; }

        .um-filter { padding:7px 12px; border:1px solid var(--border,#dae6ef); border-radius:var(--rs,9px); background:var(--surface-2,#f7fafc); font-family:var(--ff-b,'Inter',sans-serif); font-size:var(--fs-base); color:var(--ink,#0a1f2e); outline:none; cursor:pointer; transition:border-color .2s; }
        .um-filter:focus { border-color:var(--blue,#16a8d3); }

        .um-avatar { width:34px; height:34px; border-radius:9px; display:flex; align-items:center; justify-content:center; font-size:var(--fs-xs); font-weight:700; color:white; flex-shrink:0; font-family:var(--ff-m,'JetBrains Mono',monospace); letter-spacing:.5px; }
        .um-user-wrap { display:flex; align-items:center; gap:10px; }
        .um-user-name  { font-size:var(--fs-md); font-weight:600; color:var(--ink,#0a1f2e); }
        .um-user-email { font-size:var(--fs-sm); color:var(--ink-3,#6b8fa3); margin-top:1px; }

        .um-role-chip { display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border-radius:20px; font-size:var(--fs-xs); font-weight:700; white-space:nowrap; }

        /* Team chip */
        .um-team-chip { display:inline-flex; align-items:center; gap:6px; padding:3px 10px; border-radius:20px; font-size:var(--fs-xs); font-weight:600; background:rgba(22,168,211,.08); color:var(--blue,#16a8d3); border:1px solid rgba(22,168,211,.18); white-space:nowrap; cursor:pointer; transition:all .18s; }
        .um-team-chip:hover { background:rgba(22,168,211,.15); }
        .um-team-chip.unassigned { background:var(--surface-2,#f7fafc); color:var(--ink-4,#9eb8c8); border-color:var(--border,#dae6ef); cursor:default; }

        /* Permissions grid */
        .um-perms-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
        .um-perm-card { background:var(--surface,#fff); border:1px solid var(--border,#dae6ef); border-radius:var(--r,14px); padding:16px 18px; box-shadow:var(--sh-xs); position:relative; overflow:hidden; }
        .um-perm-title { font-size:var(--fs-base); font-weight:700; color:var(--ink,#0a1f2e); margin-bottom:8px; }
        .um-perm-list  { list-style:none; display:flex; flex-direction:column; gap:5px; }
        .um-perm-item  { font-size:var(--fs-sm); color:var(--ink-2,#2d5068); display:flex; align-items:flex-start; gap:6px; line-height:1.4; }
      </style>

      <div class="um-header">
        <div>
          <div class="um-header-title">Team Members</div>
          <div class="um-header-sub">Internal staff access, roles, and team assignments</div>
        </div>
        ${canMng() ? `<button class="btn-primary" onclick="OpsUserManagement.openInvite()">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
          Invite Member
        </button>` : ''}
      </div>

      <div class="lv-wrap">
        <div class="lv-toolbar">
          <div class="lv-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input id="um-search" placeholder="Search members…" oninput="OpsUserManagement.search(this.value)">
          </div>
          <div class="lv-toolbar-right">
            <select class="um-filter" id="um-team-filter" onchange="OpsUserManagement.filterTeam(this.value)">
              <option value="">All Teams</option>
            </select>
            <select class="um-filter" id="um-role-filter" onchange="OpsUserManagement.filterRole(this.value)">
              <option value="">All Roles</option>
              ${ROLE_OPTIONS.map(r => `<option value="${r.value}">${r.label}</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="um-table-body">
          <div style="padding:48px;text-align:center;color:var(--ink-3);">
            <div class="loading" style="margin:0 auto 12px;"></div>
            <div style="font-size:var(--fs-base);">Loading members…</div>
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
        OpsModal.apiGet('/users'),
        OpsModal.apiGet('/teams'),
      ]);

      _users = usersRes.data || usersRes.users || [];
      _teams = teamsRes.data || teamsRes.teams || [];
      if (!Array.isArray(_users)) _users = [];
      if (!Array.isArray(_teams)) _teams = [];

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

    } catch (err) {
      renderError(err.message);
    }
  }

  // ── FILTERS ───────────────────────────────────────────────────────────

  let _activeRole = '';
  let _activeTeam = '';

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
    if (_term) filtered = filtered.filter(u => `${u.full_name || u.name || ''} ${u.email || ''}`.toLowerCase().includes(_term));
    if (_pg) _pg.update(filtered);
    else renderTable(filtered);
  }

  // ── HELPERS ───────────────────────────────────────────────────────────

  function avatarColor(name) {
    const colors = CONFIG.AVATAR_COLORS;
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) % colors.length;
    return colors[h];
  }

  function initials(name) {
    return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  function formatTime(ds) {
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
      el.innerHTML = `
        <div style="padding:48px;text-align:center;color:var(--ink-3);">
          <div style="font-size:var(--fs-md);font-weight:600;color:var(--ink-2);margin-bottom:8px;">No members found</div>
          <button class="btn-primary" onclick="OpsUserManagement.openInvite()">Invite First Member</button>
        </div>`;
      return;
    }

    el.innerHTML = `
      <div class="lv-scroll">
        <table class="lv-table">
          <thead>
            <tr>
              <th>Name</th><th>Role</th><th>Team</th><th>Phone</th>
              <th>Availability</th><th>Current assignment</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(u => {
              const id       = u.user_id || u.id;
              const name     = u.full_name || u.name || 'Unknown';
              const role     = u.role_id || u.role || '';
              const rc       = getRoleConfig(role);
              const isActive = u.status !== 'inactive' && u.status !== 'suspended';
              const teamName = getTeamName(u) || (u.team?.name) || null;
              const avail    = u.availability || (isActive ? 'Available' : '—');
              return `<tr class="clickable" onclick="OpsUserManagement.open('${id}')" tabindex="0" onkeydown="if(event.key==='Enter'){OpsUserManagement.open('${id}')}">
                <td>
                  <div class="lv-name-cell">
                    <div class="lv-avatar" style="background:${avatarColor(name)};">${initials(name)}</div>
                    <div style="min-width:0;"><div class="lv-name">${name}</div><span class="lv-source">${u.email || ''}</span></div>
                  </div>
                </td>
                <td><span class="um-role-chip" style="background:${rc.bg};color:${rc.color};">${rc.label}</span></td>
                <td>${teamName ? `<span class="um-team-chip">${teamName}</span>` : `<span class="um-team-chip unassigned">Unassigned</span>`}</td>
                <td>${_dash(u.phone)}</td>
                <td>${_dash(avail)}</td>
                <td>${_dash(u.current_assignment)}</td>
                <td><span class="lv-status ${isActive ? 'ok' : 'neutral'}">${u.status || 'active'}</span></td>
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
    _container.innerHTML = `<div style="padding:60px;text-align:center;color:var(--ink-3);"><div class="loading" style="margin:0 auto 12px;"></div>Loading member…</div>`;
    try {
      const res = await OpsModal.apiGet('/users/' + id);
      renderDetail(res.data || {});
    } catch (err) {
      _container.innerHTML = `<div style="padding:48px;text-align:center;"><div style="color:var(--err);font-weight:700;margin-bottom:8px;">Failed to load member</div><button class="um-back" onclick="OpsUserManagement.back()">← Back to Team Members</button></div>`;
    }
  }

  function renderDetail(u) {
    const id = u.user_id || u.id;
    const name = u.full_name || u.name || 'Member';
    const role = u.role_id || u.role || '';
    const rc = getRoleConfig(role);
    const isActive = u.status !== 'inactive' && u.status !== 'suspended';
    const teamName = getTeamName(u) || (u.team?.name) || null;
    const teamId = u.team_id || u.team?.team_id || u.team?.id;
    const F = OpsModal.fact, E = OpsModal.emptyState;
    const roleChip = `<span class="um-role-chip" style="background:${rc.bg};color:${rc.color};">${rc.label}</span>`;
    const teamCell = teamId ? OpsModal.link('teams', teamId, teamName || teamId) : (teamName || 'Unassigned');
    const iUser = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></svg>';
    const iShield = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>';

    const profile = `
      ${F('Name', name)}
      ${F('Role', roleChip)}
      ${F('Team', teamCell)}
      ${F('Phone', _dash(u.phone))}
      ${F('Email', _dash(u.email))}
      ${F('Availability', _dash(u.availability || (isActive ? 'Available' : '—')))}
      ${F('Current assignment', _dash(u.current_assignment))}
      ${F('Last active', formatTime(u.last_login || u.last_active))}`;

    const accessBody = rc.perms && rc.perms.length
      ? `<div style="font-size:var(--fs-sm);color:var(--ink-2);line-height:1.5;">${rc.desc ? `<div style="margin-bottom:10px;color:var(--ink-3);">${rc.desc}</div>` : ''}${rc.perms.map(p => `<div style="display:flex;gap:8px;padding:5px 0;"><span style="color:var(--ok);">✓</span><span>${p}</span></div>`).join('')}</div>`
      : E(iShield, 'No permissions listed', 'This role has no explicit permission list configured.');

    const actions = [
      `<button class="fgd-btn" onclick="OpsUserManagement.editUser('${id}','${name.replace(/'/g, "\\'")}')">Edit</button>`,
      isActive
        ? `<button class="fgd-btn" style="color:var(--warn);border-color:rgba(180,83,9,.25);" onclick="OpsUserManagement.deactivateUser('${id}','${name.replace(/'/g, "\\'")}')">Deactivate</button>`
        : `<button class="fgd-btn" style="color:var(--ok);border-color:rgba(31,157,91,.25);" onclick="OpsUserManagement.reactivateUser('${id}')">Reactivate</button>`,
      _isAdmin ? `<button class="fgd-btn danger" onclick="OpsUserManagement.deleteUser('${id}','${name.replace(/'/g, "\\'")}')">Delete</button>` : '',
    ].filter(Boolean).join('');

    const sidebar = `
      <div class="fgd-card">
        <div class="fgd-card-head"><h2 style="font-size:var(--fs-sm);">Quick facts</h2></div>
        ${F('Role', rc.label)}
        ${F('Team', teamCell)}
        ${F('Status', isActive ? '<span style="color:var(--ok);">Active</span>' : `<span style="color:var(--ink-3);">${u.status || 'inactive'}</span>`)}
        ${F('Last active', formatTime(u.last_login || u.last_active))}
      </div>`;

    _container.innerHTML = OpsModal.detailShell({
      back: 'OpsUserManagement.back()',
      crumbRoot: 'Team Members',
      title: name,
      avatar: { text: initials(name), bg: avatarColor(name) },
      chips: [{ cls: isActive ? 'ok' : 'neutral', label: u.status || 'active', dot: true }],
      meta: [['Role', roleChip], ['Team', teamCell], ['Email', _dash(u.email)]],
      actions,
      sections: [
        { id: 'profile', title: 'Profile', meta: 'users', body: profile },
        { id: 'access', title: 'Access', meta: 'role permissions', body: accessBody },
        { id: 'jobs', title: 'Assigned jobs', body: E(iUser, 'No assigned jobs', 'Jobs assigned to this member will appear here.') },
      ],
      sidebar,
    });
  }

  function renderError(message) {
    const el = document.getElementById('um-table-body');
    if (!el) return;
    el.innerHTML = `
      <div style="padding:48px;text-align:center;">
        <div style="color:var(--err);font-weight:700;margin-bottom:8px;">Failed to load members</div>
        <div style="color:var(--ink-3);font-size:var(--fs-sm);margin-bottom:16px;">${message}</div>
        <button class="btn-ghost" onclick="reloadTab('team-members')">Retry</button>
      </div>`;
  }

  // ── INVITE ────────────────────────────────────────────────────────────

  function openInvite() {
    const teamOptions = [
      { value: '', label: '— No team (assign later) —' },
      ..._teams.map(t => ({ value: t.team_id || t.id, label: t.team_name || t.name })),
    ];

    OpsModal.open('Invite Team Member', `
      ${OpsModal.field('Email Address', 'email', 'email', '', { placeholder: 'team.member@flowguard.ng' })}
      ${OpsModal.row([
        OpsModal.field('Full Name', 'full_name', 'text', '', { placeholder: 'First Last' }),
        OpsModal.field('Role', 'role_id', 'select', 'dispatcher', { options: ROLE_OPTIONS }),
      ])}
      ${OpsModal.row([
        OpsModal.field('Assign to Team', 'team_id', 'select', '', { options: teamOptions, required: false }),
        OpsModal.field('Phone (optional)', 'phone', 'text', '', { placeholder: '+234…', required: false }),
      ])}
      <div id="um-role-desc"></div>
      <div style="padding:10px 12px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--rs);font-size:var(--fs-sm);color:var(--ink-3);margin-top:4px;">
        An invitation email will be sent. The member will appear in their team's roster immediately.
      </div>
    `, [
      { label: 'Cancel',      onclick: 'OpsModal.close()', class: 'btn-ghost' },
      { label: 'Send Invite', onclick: 'OpsUserManagement.sendInvite()', class: 'btn-primary', id: 'modal-save-btn' },
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
        <span style="padding:3px 10px;border-radius:20px;font-size:var(--fs-xs);font-weight:700;background:${rc.bg};color:${rc.color};">${rc.label}</span>
        <span style="font-size:var(--fs-2xs);color:var(--ink-3);text-transform:uppercase;letter-spacing:.6px;font-weight:700;">What this role can do</span>
      </div>
      ${rc.desc ? `<div style="font-size:var(--fs-sm);color:var(--ink-2);margin-bottom:6px;line-height:1.5;">${rc.desc}</div>` : ''}
      ${rc.perms && rc.perms.length ? `<div style="font-size:var(--fs-xs);color:var(--ink-3);line-height:1.8;">${rc.perms.map(p => `<span style="color:${rc.color};">✓</span> ${p}`).join('<br>')}</div>` : ''}
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
    const data = OpsModal.getFormData();
    if (!data.email)     { OpsModal.toast('Email is required', 'warning'); return; }
    if (!data.full_name) { OpsModal.toast('Full name is required', 'warning'); return; }
    OpsModal.setLoading('modal-save-btn', true);
    try {
      const res = await OpsModal.apiPost('/users/invite', data);
      OpsModal.close();
      const emailed = !res || !res.data || res.data.emailed !== false;
      OpsModal.toast(emailed ? 'Invitation email sent' : 'Member added, but the invite email failed to send', emailed ? 'nominal' : 'warning');
      reloadTab('team-members');
    } catch (err) {
      OpsModal.toast('Failed: ' + err.message, 'critical');
      OpsModal.setLoading('modal-save-btn', false);
    }
  }

  // ── EDIT USER ─────────────────────────────────────────────────────────

  async function editUser(id, name) {
    let userData = { user_id: id, full_name: name };
    try {
      const res = await OpsModal.apiGet(`/users/${id}`);
      userData  = res.data || res;
    } catch {}

    const teamOptions = [
      { value: '', label: '— No team —' },
      ..._teams.map(t => ({ value: t.team_id || t.id, label: t.team_name || t.name })),
    ];

    const currentTeam = userData.team_id || userData.team?.team_id || userData.team?.id || '';

    OpsModal.open(`Edit — ${name}`, `
      ${OpsModal.field('Full Name', 'full_name', 'text', userData.full_name || userData.name || name)}
      ${OpsModal.row([
        OpsModal.field('Role', 'role_id', 'select', userData.role_id || userData.role || '', { options: ROLE_OPTIONS }),
        OpsModal.field('Status', 'status', 'select', userData.status || 'active', {
          options: [
            { value:'active',    label:'Active' },
            { value:'inactive',  label:'Inactive' },
            { value:'suspended', label:'Suspended' },
          ]
        }),
      ])}
      ${OpsModal.field('Assign to Team', 'team_id', 'select', String(currentTeam), { options: teamOptions, required: false })}
      <div id="um-role-desc"></div>
      ${OpsModal.field('Email', 'email', 'email', userData.email || '', { readonly: true })}
    `, [
      { label: 'Cancel',       onclick: 'OpsModal.close()', class: 'btn-ghost' },
      { label: 'Save Changes', onclick: `OpsUserManagement.saveEdit('${id}')`, class: 'btn-primary', id: 'modal-save-btn' },
    ]);
    wireRoleDesc(userData.role_id || userData.role || '');
  }

  async function saveEdit(id) {
    const data = OpsModal.getFormData();
    delete data.email;
    OpsModal.setLoading('modal-save-btn', true);
    try {
      await OpsModal.apiPut(`/users/${id}`, data);
      OpsModal.close();
      OpsModal.toast('Member updated', 'nominal');
      reloadTab('team-members');
    } catch (err) {
      OpsModal.toast('Failed: ' + err.message, 'critical');
      OpsModal.setLoading('modal-save-btn', false);
    }
  }

  // ── DEACTIVATE / REACTIVATE ───────────────────────────────────────────

  function deactivateUser(id, name) {
    OpsModal.confirm(`Deactivate "${name}"? They will lose access immediately.`, async function () {
      OpsModal.setLoading('modal-confirm-btn', true);
      try {
        await OpsModal.apiPut(`/users/${id}`, { is_active: false, status: 'inactive' });
        OpsModal.close();
        OpsModal.toast('Member deactivated', 'nominal');
        reloadTab('team-members');
      } catch (err) {
        OpsModal.toast('Failed: ' + err.message, 'critical');
        OpsModal.setLoading('modal-confirm-btn', false);
      }
    });
  }

  async function reactivateUser(id) {
    try {
      await OpsModal.apiPut(`/users/${id}`, { status: 'active', is_active: true });
      OpsModal.toast('Member reactivated', 'nominal');
      reloadTab('team-members');
    } catch (err) {
      OpsModal.toast('Failed: ' + err.message, 'critical');
    }
  }

  // ── DELETE USER (admin only — permanent) ──────────────────────────────

  function deleteUser(id, name) {
    OpsModal.confirm(`Permanently delete "${name}"? This removes the account and all associated data.`, async function () {
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
    render, open, back, search, filterRole, filterTeam,
    openInvite, sendInvite,
    editUser, saveEdit,
    deactivateUser, reactivateUser, deleteUser,
    ROLE_CONFIG,   // single source of truth for the role/permission reference
  };

})();
