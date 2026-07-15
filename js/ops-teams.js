// ============================================
// OPS TEAMS MODULE v3.3.0
// Teams are groups of field staff.
// Each team has members. Members can be
// added/removed from a team here.
// ============================================

const OpsTeams = (function () {
  'use strict';

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

  // ── RENDER ────────────────────────────────────────────────────────────

  function render(container) {
    _container = container;
    container.innerHTML = `
      <style>
        .ops-table tbody tr.clickable { cursor:pointer; transition:background .12s; }
        .ops-table tbody tr.clickable:hover { background:var(--surface-2,#f2f8fb); }
        .tmv-back { display:inline-flex; align-items:center; gap:6px; font-size:var(--fs-sm); font-weight:600; color:var(--ink-2); background:var(--surface-2); border:1px solid var(--border); border-radius:9px; padding:8px 13px; cursor:pointer; }
        .tmv-top { display:flex; align-items:center; gap:14px; margin-bottom:18px; flex-wrap:wrap; }
        .tmv-name { font-family:var(--ff-d); font-size:var(--fs-xl); font-weight:700; color:var(--ink); line-height:1.1; }
        .tmv-meta { font-size:var(--fs-sm); color:var(--ink-3); margin-top:3px; }
        .tmv-actions { margin-left:auto; display:flex; gap:8px; flex-wrap:wrap; }
        .tmv-sec { background:var(--surface); border:1px solid var(--border); border-radius:var(--r,14px); box-shadow:var(--sh-xs); margin-bottom:14px; overflow:hidden; }
        .tmv-sec-h { padding:12px 18px; border-bottom:1px solid var(--border); font-family:var(--ff-d); font-size:var(--fs-sm); font-weight:700; color:var(--ink); display:flex; justify-content:space-between; }
        .tmv-sec-b { padding:16px 18px; }
        .tmv-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:14px 22px; }
        .tmv-f .k { font-size:var(--fs-2xs); font-weight:700; letter-spacing:.9px; text-transform:uppercase; color:var(--ink-3); }
        .tmv-f .v { font-size:var(--fs-md); color:var(--ink); font-weight:600; margin-top:3px; }
        .tmv-e { color:var(--ink-3); font-size:var(--fs-sm); padding:6px 0; }
        .tmv-needs { font-size:var(--fs-xs); color:var(--ink-4); font-style:italic; }
        .tm-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:20px; }
        .tm-header-title { font-family:var(--ff-d,'Space Grotesk',sans-serif); font-size:var(--fs-xl); font-weight:800; color:var(--ink,#0a1f2e); letter-spacing:-.02em; margin-bottom:3px; }
        .tm-header-sub { font-size:var(--fs-base); color:var(--ink-3,#6b8fa3); }

        .tm-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:20px; }
        .tm-stat { background:var(--surface,#fff); border:1px solid var(--border,#dae6ef); border-radius:var(--r,14px); padding:16px 18px; box-shadow:var(--sh-xs); position:relative; overflow:hidden; transition:all .2s; }
        .tm-stat:hover { transform:translateY(-2px); box-shadow:var(--sh-md); }
        .tm-stat::after { content:''; position:absolute; bottom:0; left:0; right:0; height:2.5px; }
        .tm-stat.onsite::after  { background:var(--ok,#0a8a6a); }
        .tm-stat.enroute::after { background:var(--warn,#b45309); }
        .tm-stat.idle::after    { background:var(--ink-4,#9eb8c8); }
        .tm-stat.total::after   { background:linear-gradient(90deg,var(--navy,#0a2a3d),var(--blue,#16a8d3)); }
        .tm-stat-label { font-size:var(--fs-2xs); font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:var(--ink-3,#6b8fa3); margin-bottom:6px; }
        .tm-stat-val { font-family:var(--ff-d,'Space Grotesk',sans-serif); font-size:var(--fs-2xl); font-weight:900; color:var(--ink,#0a1f2e); letter-spacing:-.03em; line-height:1; }
        .tm-stat-val.green { color:var(--ok,#0a8a6a); }
        .tm-stat-val.amber { color:var(--warn,#b45309); }

        /* Team cards */
        .tm-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); gap:16px; }

        .tm-card { background:var(--surface,#fff); border:1px solid var(--border,#dae6ef); border-radius:var(--r,14px); overflow:hidden; box-shadow:var(--sh-xs); transition:all .2s; }
        .tm-card:hover { box-shadow:var(--sh-md); border-color:var(--border-2,#b8d0de); }

        .tm-card-head { padding:14px 16px; border-bottom:1px solid var(--border,#dae6ef); display:flex; align-items:center; gap:12px; }
        .tm-card-avatar { width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-family:var(--ff-m,'JetBrains Mono',monospace); font-size:var(--fs-base); font-weight:700; color:white; flex-shrink:0; }
        .tm-card-name { font-size:var(--fs-md); font-weight:700; color:var(--ink,#0a1f2e); margin-bottom:2px; }
        .tm-card-id { font-family:var(--ff-m,'JetBrains Mono',monospace); font-size:var(--fs-xs); color:var(--ink-4,#9eb8c8); }

        /* Members strip inside card */
        .tm-members-strip { padding:10px 16px; border-bottom:1px solid var(--border,#dae6ef); display:flex; align-items:center; justify-content:space-between; gap:10px; background:var(--surface-2,#f7fafc); }
        .tm-member-avatars { display:flex; }
        .tm-member-av { width:26px; height:26px; border-radius:7px; display:flex; align-items:center; justify-content:center; font-size:var(--fs-2xs); font-weight:700; color:white; border:2px solid var(--surface,#fff); margin-left:-6px; flex-shrink:0; }
        .tm-member-av:first-child { margin-left:0; }
        .tm-member-count { font-size:var(--fs-sm); color:var(--ink-3,#6b8fa3); font-weight:500; }
        .tm-member-add { font-size:var(--fs-xs); color:var(--blue,#16a8d3); font-weight:600; cursor:pointer; white-space:nowrap; background:none; border:none; padding:0; }
        .tm-member-add:hover { text-decoration:underline; }

        .tm-card-body { padding:12px 16px; display:flex; flex-direction:column; gap:7px; }
        .tm-detail-row { display:flex; align-items:center; justify-content:space-between; font-size:var(--fs-base); }
        .tm-detail-label { color:var(--ink-3,#6b8fa3); font-weight:500; }
        .tm-detail-val { color:var(--ink-2,#2d5068); font-weight:600; text-align:right; }

        .tm-card-foot { padding:10px 16px; border-top:1px solid var(--border,#dae6ef); display:flex; gap:6px; }

        /* Member list in modal */
        .tm-modal-member-row {
          display:flex; align-items:center; gap:10px;
          padding:9px 0; border-bottom:1px solid var(--border,#dae6ef);
        }
        .tm-modal-member-row:last-child { border-bottom:none; }
        .tm-modal-member-av { width:30px; height:30px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:var(--fs-xs); font-weight:700; color:white; flex-shrink:0; font-family:var(--ff-m,'JetBrains Mono',monospace); }
        .tm-modal-member-name { font-size:var(--fs-base); font-weight:600; color:var(--ink,#0a1f2e); }
        .tm-modal-member-role { font-size:var(--fs-sm); color:var(--ink-3,#6b8fa3); margin-top:1px; }
        .tm-modal-member-remove { margin-left:auto; padding:4px 10px; font-size:var(--fs-xs); font-weight:600; color:var(--err,#dc2626); background:var(--eb,#fef2f2); border:1px solid rgba(220,38,38,.2); border-radius:var(--rs,9px); cursor:pointer; transition:all .18s; }
        .tm-modal-member-remove:hover { background:var(--err,#dc2626); color:white; }
      </style>

      <div class="tm-header">
        <div>
          <div class="tm-header-title">Field Teams</div>
          <div class="tm-header-sub">Each team is a group of field staff. Manage members from each team card.</div>
        </div>
        <button class="btn-primary" onclick="OpsTeams.createTeam()">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
          Create Team
        </button>
      </div>

      <div class="tm-stats">
        <div class="tm-stat onsite"><div class="tm-stat-label">On Site</div><div class="tm-stat-val green" id="tm-onsite">—</div></div>
        <div class="tm-stat enroute"><div class="tm-stat-label">En Route</div><div class="tm-stat-val amber" id="tm-enroute">—</div></div>
        <div class="tm-stat idle"><div class="tm-stat-label">Idle</div><div class="tm-stat-val" id="tm-idle">—</div></div>
        <div class="tm-stat total"><div class="tm-stat-label">Total Teams</div><div class="tm-stat-val" id="tm-total">—</div></div>
      </div>

      <div id="tm-content">
        <div style="padding:48px;text-align:center;color:var(--ink-3);">
          <div class="loading" style="margin:0 auto 12px;"></div>
          <div style="font-size:var(--fs-base);">Loading teams…</div>
        </div>
      </div>
    `;
    loadTeams();
  }

  // ── DATA ──────────────────────────────────────────────────────────────

  async function loadTeams() {
    try {
      const res  = await OpsModal.apiGet('/teams');
      _teams     = res.data || res.teams || [];
      if (!Array.isArray(_teams)) _teams = [];
      updateStats(_teams);
      if (_teams.length > 12) {
        _pg = FGPaginator.create(_teams, { pageSize: 12, containerId: 'tm-content' });
        _pg.render(renderTeams);
      } else {
        renderTeams(_teams);
      }
    } catch (err) {
      document.getElementById('tm-content').innerHTML = `
        <div style="padding:48px;text-align:center;">
          <div style="color:var(--err);font-weight:700;margin-bottom:8px;">Failed to load teams</div>
          <div style="color:var(--ink-3);font-size:var(--fs-sm);margin-bottom:16px;">${err.message}</div>
          <button class="btn-ghost" onclick="reloadTab('teams')">Retry</button>
        </div>`;
    }
  }

  function updateStats(teams) {
    let onsite = 0, enroute = 0, idle = 0;
    teams.forEach(t => {
      const s = (t.status || '').toLowerCase();
      if (s === 'on_site')       onsite++;
      else if (s === 'en_route') enroute++;
      else                       idle++;
    });
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('tm-onsite',  onsite);
    set('tm-enroute', enroute);
    set('tm-idle',    idle);
    set('tm-total',   teams.length);
  }

  // ── HELPERS ───────────────────────────────────────────────────────────

  function statusConfig(s) {
    const m = {
      on_site:   { label:'On Site',   badge:'nominal', dot:'var(--ok,#0a8a6a)' },
      en_route:  { label:'En Route',  badge:'watch',   dot:'var(--warn,#b45309)' },
      returning: { label:'Returning', badge:'watch',   dot:'var(--warn,#b45309)' },
      idle:      { label:'Idle',      badge:'offline', dot:'var(--off,#64748b)' },
    };
    return m[(s || '').toLowerCase()] || m.idle;
  }

  function teamColor(name) {
    const colors = CONFIG.AVATAR_COLORS;
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) % colors.length;
    return colors[h];
  }

  function memberColor(name) {
    // rotated by one so a member's avatar doesn't land on the same color
    // as a team sharing the same name-hash bucket
    const colors = [...CONFIG.AVATAR_COLORS.slice(1), CONFIG.AVATAR_COLORS[0]];
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
    if (mins < 1)  return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hrs  < 24) return `${hrs}h ago`;
    return new Date(ds).toLocaleDateString('en-GB', { day:'numeric', month:'short' });
  }

  // ── RENDER CARDS ─────────────────────────────────────────────────────

  function renderTeams(teams) {
    const el = document.getElementById('tm-content');
    if (!el) return;

    if (!teams || teams.length === 0) {
      el.innerHTML = `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:60px;text-align:center;box-shadow:var(--sh-xs);">
          <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.3" viewBox="0 0 24 24" style="margin:0 auto 14px;opacity:.25;display:block;"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0112 0v2"/></svg>
          <div style="font-size:var(--fs-md);font-weight:600;color:var(--ink-2);margin-bottom:8px;">No teams yet</div>
          <button class="btn-primary" onclick="OpsTeams.createTeam()">Create First Team</button>
        </div>`;
      return;
    }

    // Columns per spec: Team, Members, Supervisor, Active Jobs, Vehicle, Availability
    el.innerHTML = `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r,14px);overflow:hidden;box-shadow:var(--sh-xs);">
        <div style="overflow-x:auto;">
          <table class="ops-table">
            <thead><tr><th>Team</th><th style="text-align:center;">Members</th><th>Supervisor</th><th style="text-align:center;">Active Jobs</th><th>Vehicle</th><th>Availability</th></tr></thead>
            <tbody>
              ${teams.map(t => {
                const id = t.team_id || t.id;
                const name = t.team_name || t.name || id || '—';
                const sc = statusConfig(t.status);
                const members = t.members || [];
                const supervisor = t.supervisor || t.lead_name || (members.find(m => m.team_role === 'lead') || {}).full_name;
                return `<tr class="clickable" onclick="OpsTeams.viewTeam('${id}')" tabindex="0" onkeydown="if(event.key==='Enter'){OpsTeams.viewTeam('${id}')}">
                  <td>
                    <div style="display:flex;align-items:center;gap:10px;">
                      <div class="tm-card-avatar" style="width:30px;height:30px;font-size:var(--fs-sm);background:${teamColor(name)};">${initials(name)}</div>
                      <div><div class="tm-card-name" style="font-size:var(--fs-md);">${name}</div><div class="tm-card-id" style="font-size:var(--fs-xs);color:var(--ink-3);font-family:var(--ff-m);">${id}</div></div>
                    </div>
                  </td>
                  <td class="num" style="text-align:center;font-weight:700;">${members.length}</td>
                  <td style="font-size:var(--fs-sm);">${_dash(supervisor)}</td>
                  <td style="text-align:center;">${t.active_jobs != null ? t.active_jobs : '<span style="color:var(--ink-4);">—</span>'}</td>
                  <td style="font-size:var(--fs-sm);">${_dash(t.vehicle)}</td>
                  <td><span class="status-badge ${sc.badge}">${sc.label}</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  // ── MANAGE MEMBERS MODAL ──────────────────────────────────────────────
  // This is the key feature: add/remove members from a specific team.

  async function manageMembers(teamId, teamName) {
    OpsModal.open(`${teamName} — Members`, `
      <div id="mm-loading" style="padding:32px;text-align:center;color:var(--ink-3);">
        <div class="loading" style="margin:0 auto 10px;"></div>
        <div style="font-size:var(--fs-base);">Loading…</div>
      </div>
      <div id="mm-body" style="display:none;"></div>
    `, [
      { label: 'Close', onclick: 'OpsModal.close()', class: 'btn-ghost' },
      { label: 'Add Member', onclick: `OpsTeams.addMemberToTeam('${teamId}','${teamName.replace(/'/g, "\\'")}')`, class: 'btn-primary', id: 'mm-add-btn' },
    ]);

    try {
      // Load team detail (members) and all available users in parallel
      const [teamRes, usersRes] = await Promise.all([
        OpsModal.apiGet(`/teams/${teamId}`),
        OpsModal.apiGet('/users'),
      ]);

      const team    = teamRes.data || {};
      const members = team.members || [];
      const allUsers = usersRes.data || usersRes.users || [];

      const loading = document.getElementById('mm-loading');
      const body    = document.getElementById('mm-body');
      if (loading) loading.style.display = 'none';
      if (!body)   return;

      body.style.display = 'block';

      if (members.length === 0) {
        body.innerHTML = `
          <div style="padding:32px;text-align:center;color:var(--ink-3);">
            <svg width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.3" viewBox="0 0 24 24" style="margin:0 auto 12px;opacity:.25;display:block;"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
            <div style="font-size:var(--fs-base);font-weight:600;color:var(--ink-2);margin-bottom:4px;">No members yet</div>
            <div style="font-size:var(--fs-sm);">Click "Add Member" to assign staff to this team.</div>
          </div>`;
        return;
      }

      body.innerHTML = `
        <div style="margin-bottom:10px;font-size:var(--fs-xs);font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--ink-3);">
          Current Members (${members.length})
        </div>
        <div id="mm-member-list">
          ${members.map(m => {
            const uid  = m.user_id || m.id;
            const name = m.full_name || m.name || 'Unknown';
            const role = m.role_id || m.role || '';
            return `
              <div class="tm-modal-member-row" id="mmr-${uid}">
                <div class="tm-modal-member-av" style="background:${memberColor(name)};">${initials(name)}</div>
                <div>
                  <div class="tm-modal-member-name">${name}</div>
                  <div class="tm-modal-member-role">${(CONFIG.ROLE_LABELS[role] || role).replace(/_/g, ' ')} ${m.phone ? '· ' + m.phone : ''}</div>
                </div>
                <button class="tm-modal-member-remove" onclick="OpsTeams.removeMember('${teamId}','${uid}','${name.replace(/'/g, "\\'")}')">
                  Remove
                </button>
              </div>`;
          }).join('')}
        </div>`;
    } catch (err) {
      const body = document.getElementById('mm-body');
      const loading = document.getElementById('mm-loading');
      if (loading) loading.style.display = 'none';
      if (body) {
        body.style.display = 'block';
        body.innerHTML = `<div style="padding:24px;text-align:center;color:var(--err);">Failed to load members: ${err.message}</div>`;
      }
    }
  }

  // ── ADD MEMBER TO TEAM ────────────────────────────────────────────────

  async function addMemberToTeam(teamId, teamName) {
    // Close current modal, open add-member modal
    OpsModal.close();
    await new Promise(r => setTimeout(r, 250));

    let users = [];
    try {
      const res = await OpsModal.apiGet('/users');
      users = (res.data || res.users || []).filter(u => u.status !== 'inactive');
    } catch {}

    const userOptions = users.length > 0
      ? users.map(u => ({
          value: u.user_id || u.id,
          label: `${u.full_name || u.name || u.email} (${(CONFIG.ROLE_LABELS[u.role_id || u.role] || u.role || '').replace(/_/g, ' ')})`,
        }))
      : [{ value: '', label: 'No available users' }];

    OpsModal.open(`Add Member — ${teamName}`, `
      <p style="font-size:var(--fs-base);color:var(--ink-3);margin-bottom:16px;line-height:1.55;">
        Select a staff member to add to this team. They will appear in the team's member list and can be dispatched together.
      </p>
      ${OpsModal.field('Select Staff Member', 'user_id', 'select', '', { options: userOptions })}
      ${OpsModal.field('Role in Team (optional)', 'team_role', 'text', '', { required: false, placeholder: 'e.g. Team Lead, Technician, Driver' })}
    `, [
      { label: 'Back',       onclick: `OpsModal.close();OpsTeams.manageMembers('${teamId}','${teamName.replace(/'/g, "\\'")}')`, class: 'btn-ghost' },
      { label: 'Add Member', onclick: `OpsTeams.confirmAddMember('${teamId}','${teamName.replace(/'/g, "\\'")}')`, class: 'btn-primary', id: 'modal-save-btn' },
    ]);
  }

  async function confirmAddMember(teamId, teamName) {
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
    OpsModal.confirm(`Remove "${name}" from this team?`, async function () {
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
    if (!t || !_container) { if (!t) OpsModal.toast('Team not found', 'warning'); return; }
    const name = t.team_name || t.name || id;
    const sc = statusConfig(t.status);
    const members = t.members || [];
    const supervisor = t.supervisor || t.lead_name || (members.find(m => m.team_role === 'lead') || {}).full_name;
    const esc = s => s.replace(/'/g, "\\'");
    const f = (k, v) => `<div class="tmv-f"><div class="k">${k}</div><div class="v">${v}</div></div>`;
    const sec = (tt, b, needs) => `<div class="tmv-sec"><div class="tmv-sec-h">${tt}${needs ? '<span class="tmv-needs">pending backend data</span>' : ''}</div><div class="tmv-sec-b">${b}</div></div>`;

    const overview = `<div class="tmv-grid">
      ${f('Team', name)}
      ${f('Members', members.length)}
      ${f('Supervisor', _dash(supervisor))}
      ${f('Active Jobs', t.active_jobs != null ? t.active_jobs : '—')}
      ${f('Vehicle', _dash(t.vehicle))}
      ${f('Availability', `<span class="status-badge ${sc.badge}">${sc.label}</span>`)}
      ${f('Location', _dash(t.current_location || t.location))}
      ${f('Assigned To', _dash(t.assigned_to))}
      ${t.eta ? f('ETA', `<span style="color:var(--warn);font-weight:700;">${t.eta} min</span>`) : ''}
      ${f('Last Check-in', formatTime(t.last_checkin || t.last_check_in))}
    </div>${t.equipment ? `<div style="margin-top:12px;">${f('Equipment', t.equipment)}</div>` : ''}`;

    const membersBody = members.length ? members.map(m => `
      <div class="tm-modal-member-row">
        <div class="tm-modal-member-av" style="background:${memberColor(m.full_name || m.name || '')};">${initials(m.full_name || m.name || '')}</div>
        <div><div class="tm-modal-member-name">${m.full_name || m.name || '—'}</div><div class="tm-modal-member-role">${(CONFIG.ROLE_LABELS[m.role_id || m.role] || '').replace(/_/g, ' ')} ${m.team_role ? '· ' + m.team_role : ''}</div></div>
      </div>`).join('') : '<div class="tmv-e">No members assigned to this team yet.</div>';

    const isIdle = !t.status || (t.status || '').toLowerCase() === 'idle';
    const actions = [
      `<button class="btn-ghost" onclick="OpsTeams.manageMembers('${id}','${esc(name)}')">Manage Members</button>`,
      `<button class="btn-ghost" onclick="OpsTeams.editStatus('${id}','${esc(name)}')">Update Status</button>`,
      isIdle ? `<button class="btn-primary" onclick="OpsTeams.dispatch('${id}','${esc(name)}')">Dispatch</button>` : '',
      _isAdmin ? `<button class="btn-ghost" style="color:var(--err);border-color:rgba(220,38,38,.2);" onclick="OpsTeams.deleteTeam('${id}','${esc(name)}')">Delete</button>` : '',
    ].filter(Boolean).join('');

    _container.innerHTML = `
      ${styleTag()}
      <div class="tmv-top">
        <button class="tmv-back" onclick="OpsTeams.back()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>Teams</button>
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="tm-card-avatar" style="width:42px;height:42px;font-size:var(--fs-md);background:${teamColor(name)};">${initials(name)}</div>
          <div><div class="tmv-name">${name}</div><div class="tmv-meta">${id} · <span class="status-badge ${sc.badge}">${sc.label}</span></div></div>
        </div>
        <div class="tmv-actions">${actions}</div>
      </div>
      ${sec('Team Overview', overview)}
      ${sec('Members', membersBody)}
      ${sec('Schedule', '<div class="tmv-e">No schedule in this response.</div>', true)}
      ${sec('Current Jobs', t.active_jobs != null ? `<div class="tmv-e">${t.active_jobs} active job(s). <a onclick="switchTab('maintenance')" style="color:var(--blue-hi);cursor:pointer;">Open Maintenance →</a></div>` : '<div class="tmv-e">No current jobs in this response.</div>', t.active_jobs == null)}
      ${sec('Performance', '<div class="tmv-e">No performance metrics in this response.</div>', true)}
      ${sec('Timeline', `<div class="tmv-e">Last check-in ${formatTime(t.last_checkin || t.last_check_in)}.</div>`, true)}
    `;
  }

  // minimal style tag so the detail view keeps its look when it replaces the list
  function styleTag() {
    return `<style>
      .ops-table tbody tr.clickable{cursor:pointer;transition:background .12s;} .ops-table tbody tr.clickable:hover{background:var(--surface-2,#f2f8fb);}
      .tmv-back{display:inline-flex;align-items:center;gap:6px;font-size:var(--fs-sm);font-weight:600;color:var(--ink-2);background:var(--surface-2);border:1px solid var(--border);border-radius:9px;padding:8px 13px;cursor:pointer;}
      .tmv-top{display:flex;align-items:center;gap:14px;margin-bottom:18px;flex-wrap:wrap;} .tmv-name{font-family:var(--ff-d);font-size:var(--fs-xl);font-weight:700;color:var(--ink);line-height:1.1;} .tmv-meta{font-size:var(--fs-sm);color:var(--ink-3);margin-top:3px;} .tmv-actions{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;}
      .tmv-sec{background:var(--surface);border:1px solid var(--border);border-radius:var(--r,14px);box-shadow:var(--sh-xs);margin-bottom:14px;overflow:hidden;} .tmv-sec-h{padding:12px 18px;border-bottom:1px solid var(--border);font-family:var(--ff-d);font-size:var(--fs-sm);font-weight:700;color:var(--ink);display:flex;justify-content:space-between;} .tmv-sec-b{padding:16px 18px;}
      .tmv-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px 22px;} .tmv-f .k{font-size:var(--fs-2xs);font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:var(--ink-3);} .tmv-f .v{font-size:var(--fs-md);color:var(--ink);font-weight:600;margin-top:3px;} .tmv-e{color:var(--ink-3);font-size:var(--fs-sm);padding:6px 0;} .tmv-needs{font-size:var(--fs-xs);color:var(--ink-4);font-style:italic;}
    </style>`;
  }

  // ── DISPATCH ──────────────────────────────────────────────────────────

  async function dispatch(id, name) {
    let alerts = [];
    try {
      const res = await OpsModal.apiGet('/alerts');
      alerts = (res.data || res.alerts || []).filter(a => !a.assigned_team);
    } catch {}

    const alertOptions = [
      { value: '', label: '— No specific incident —' },
      ...alerts.map(a => ({
        value: a.alert_id || a.id,
        label: `${a.alert_type || 'Alert'} — ${a.location || a.site_name || '—'}`,
      })),
    ];

    OpsModal.open(`Dispatch — ${name}`, `
      ${OpsModal.field('Dispatch Location', 'destination', 'text', '', { placeholder: 'e.g. Lekki Phase 1, Zone A' })}
      ${OpsModal.field('Assign to Incident (optional)', 'alert_id', 'select', '', { options: alertOptions, required: false })}
      ${OpsModal.field('ETA (minutes)', 'eta', 'number', '', { placeholder: '30', required: false })}
      ${OpsModal.field('Dispatch Notes (optional)', 'notes', 'textarea', '', { required: false, rows: 3, placeholder: 'Equipment required, access instructions, priority level…' })}
    `, [
      { label: 'Cancel',   onclick: 'OpsModal.close()', class: 'btn-ghost' },
      { label: 'Dispatch', onclick: `OpsTeams.confirmDispatch('${id}')`, class: 'btn-primary', id: 'modal-save-btn' },
    ]);
  }

  async function confirmDispatch(id) {
    const data = OpsModal.getFormData();
    if (!data.destination) { OpsModal.toast('Please enter a dispatch location', 'warning'); return; }
    OpsModal.setLoading('modal-save-btn', true);
    try {
      await OpsModal.apiPost(`/teams/${id}/dispatch`, {
        destination: data.destination,
        alert_id:    data.alert_id || null,
        eta:         data.eta ? parseInt(data.eta) : null,
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
    const t = _teams.find(x => (x.team_id || x.id) == id);
    OpsModal.open(`Update Status — ${name}`, `
      ${OpsModal.field('Status', 'status', 'select', t?.status || 'idle', {
        options: [
          { value:'idle',      label:'Idle — available for dispatch' },
          { value:'en_route',  label:'En Route — heading to site' },
          { value:'on_site',   label:'On Site — working at location' },
          { value:'returning', label:'Returning — heading back to base' },
        ]
      })}
      ${OpsModal.field('Current Location', 'current_location', 'text', t?.current_location || t?.location || '', { required: false })}
      ${OpsModal.field('Notes (optional)', 'notes', 'textarea', '', { required: false, rows: 2 })}
    `, [
      { label: 'Cancel',        onclick: 'OpsModal.close()', class: 'btn-ghost' },
      { label: 'Update Status', onclick: `OpsTeams.confirmStatus('${id}')`, class: 'btn-primary', id: 'modal-save-btn' },
    ]);
  }

  async function confirmStatus(id) {
    const data = OpsModal.getFormData();
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
    OpsModal.open('Create Team', `
      ${OpsModal.field('Team Name', 'team_name', 'text', '', { placeholder: 'e.g. Alpha Response Unit' })}
      ${OpsModal.row([
        OpsModal.field('Team Lead', 'team_lead', 'text', '', { placeholder: 'Full name', required: false }),
        OpsModal.field('Base Location', 'base_location', 'text', '', { placeholder: 'e.g. VI Depot', required: false }),
      ])}
      ${OpsModal.field('Equipment', 'equipment', 'text', '', { placeholder: 'e.g. Hydro-jetting unit, vacuum truck', required: false })}
      <div style="padding:10px 12px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--rs);font-size:var(--fs-sm);color:var(--ink-3);margin-top:4px;">
        After creating the team, use <strong style="color:var(--ink-2);">Manage Members</strong> on the team card to assign staff.
      </div>
    `, [
      { label: 'Cancel',      onclick: 'OpsModal.close()', class: 'btn-ghost' },
      { label: 'Create Team', onclick: 'OpsTeams.confirmCreate()', class: 'btn-primary', id: 'modal-save-btn' },
    ]);
  }

  async function confirmCreate() {
    const data = OpsModal.getFormData();
    if (!data.team_name) { OpsModal.toast('Team name is required', 'warning'); return; }
    OpsModal.setLoading('modal-save-btn', true);
    try {
      await OpsModal.apiPost('/teams', { ...data, status: 'idle' });
      OpsModal.close();
      OpsModal.toast('Team created — now add members from the team card', 'nominal');
      reloadTab('teams');
    } catch (err) {
      OpsModal.toast('Failed: ' + err.message, 'critical');
      OpsModal.setLoading('modal-save-btn', false);
    }
  }

  // ── DELETE TEAM ───────────────────────────────────────────────────────

  function deleteTeam(id, name) {
    OpsModal.confirm(
      `Permanently delete team "${name}"? Members will be unassigned but their accounts are not deleted.`,
      async function () {
        OpsModal.setLoading('modal-confirm-btn', true);
        try {
          await OpsModal.apiDelete(`/teams/${id}`);
          OpsModal.close();
          OpsModal.toast(`Team "${name}" deleted`, 'nominal');
          reloadTab('teams');
        } catch (err) {
          OpsModal.toast('Delete failed: ' + err.message, 'critical');
          OpsModal.setLoading('modal-confirm-btn', false);
        }
      }
    );
  }

  return {
    render, back, manageMembers, addMemberToTeam, confirmAddMember,
    removeMember, viewTeam, dispatch, confirmDispatch,
    editStatus, confirmStatus, createTeam, confirmCreate, deleteTeam,
  };

})();
