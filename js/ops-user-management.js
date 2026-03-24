// ============================================
// OPS USER MANAGEMENT MODULE
// Internal team access — invite, edit, deactivate
// ============================================

const OpsUserManagement = (function () {
  'use strict';

  let _users = [];

  const ROLE_CONFIG = {
    admin:              { label: 'Admin',              color: '#0a2a3d', bg: 'rgba(10,42,61,.08)',    perms: ['Full system access, all modules and configuration'] },
    super_admin:        { label: 'Super Admin',        color: '#0a2a3d', bg: 'rgba(10,42,61,.08)',    perms: ['Full system access, all modules and configuration'] },
    operations_manager: { label: 'Ops Manager',        color: '#16a8d3', bg: 'rgba(22,168,211,.09)',  perms: ['Client management', 'Team management', 'Alert handling', 'Reports'] },
    dispatcher:         { label: 'Dispatcher',         color: '#b45309', bg: 'rgba(180,83,9,.08)',    perms: ['View alerts', 'Assign teams', 'Dispatch operations'] },
    field_lead:         { label: 'Field Lead',         color: '#0a8a6a', bg: 'rgba(10,138,106,.08)',  perms: ['View own alerts', 'Update job status'] },
    analyst:            { label: 'Analyst',             color: '#7c3aed', bg: 'rgba(124,58,237,.08)',  perms: ['View reports', 'Export data'] },
    finance:            { label: 'Finance',             color: '#0d7fa0', bg: 'rgba(13,127,160,.09)',  perms: ['View billing', 'Manage invoices', 'Revenue reports'] },
  };

  const ROLE_OPTIONS = [
    { value: 'super_admin',        label: 'Super Admin' },
    { value: 'operations_manager', label: 'Operations Manager' },
    { value: 'dispatcher',         label: 'Dispatcher' },
    { value: 'field_lead',         label: 'Field Lead' },
    { value: 'analyst',            label: 'Analyst' },
    { value: 'finance',            label: 'Finance' },
  ];

  function getRoleConfig(role) {
    return ROLE_CONFIG[role] || { label: role || '—', color: 'var(--ink-3)', bg: 'var(--surface-2)', perms: [] };
  }

  function render(container) {
    container.innerHTML = `
      <style>
        .um-header {
          display: flex; align-items: flex-start;
          justify-content: space-between; margin-bottom: 20px;
        }

        .um-header-title {
          font-family: var(--ff-d, 'Playfair Display', serif);
          font-size: 1.3rem; font-weight: 800;
          color: var(--ink, #0a1f2e); letter-spacing: -.02em; margin-bottom: 3px;
        }

        .um-header-sub { font-size: .8rem; color: var(--ink-3, #6b8fa3); }

        /* Members table card */
        .um-table-card {
          background: var(--surface, #fff);
          border: 1px solid var(--border, #dae6ef);
          border-radius: var(--r, 10px);
          overflow: hidden;
          box-shadow: var(--sh-xs);
          margin-bottom: 18px;
        }

        .um-table-head {
          padding: 14px 20px;
          border-bottom: 1px solid var(--border, #dae6ef);
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
        }

        .um-table-title {
          font-family: var(--ff-d, 'Playfair Display', serif);
          font-size: .9rem; font-weight: 700; color: var(--ink, #0a1f2e);
        }

        .um-controls { display: flex; align-items: center; gap: 8px; }

        .um-filter {
          padding: 7px 12px;
          border: 1px solid var(--border, #dae6ef);
          border-radius: var(--rs, 6px);
          background: var(--surface-2, #f7fafc);
          font-family: var(--ff-b, 'Figtree', sans-serif);
          font-size: .8rem; color: var(--ink, #0a1f2e);
          outline: none; cursor: pointer;
          transition: border-color .2s;
        }

        .um-filter:focus { border-color: var(--blue, #16a8d3); }

        /* User avatar */
        .um-avatar {
          width: 34px; height: 34px; border-radius: 9px;
          display: flex; align-items: center; justify-content: center;
          font-size: .72rem; font-weight: 700; color: white;
          flex-shrink: 0;
          font-family: var(--ff-m, 'JetBrains Mono', monospace);
          letter-spacing: .5px;
        }

        .um-user-wrap { display: flex; align-items: center; gap: 10px; }
        .um-user-name  { font-size: .85rem; font-weight: 600; color: var(--ink, #0a1f2e); }
        .um-user-email { font-size: .74rem; color: var(--ink-3, #6b8fa3); margin-top: 1px; }

        .um-role-chip {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 10px; border-radius: 20px;
          font-size: .72rem; font-weight: 700;
          white-space: nowrap;
        }

        /* Role permissions grid */
        .um-perms-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .um-perm-card {
          background: var(--surface, #fff);
          border: 1px solid var(--border, #dae6ef);
          border-radius: var(--r, 10px);
          padding: 16px 18px;
          box-shadow: var(--sh-xs);
          position: relative; overflow: hidden;
        }

        .um-perm-card::before {
          content: '';
          position: absolute; top: 0; left: 0; bottom: 0;
          width: 3px;
        }

        .um-perm-title {
          font-size: .84rem; font-weight: 700;
          color: var(--ink, #0a1f2e); margin-bottom: 8px;
        }

        .um-perm-list {
          list-style: none;
          display: flex; flex-direction: column; gap: 5px;
        }

        .um-perm-item {
          font-size: .74rem; color: var(--ink-2, #2d5068);
          display: flex; align-items: flex-start; gap: 6px; line-height: 1.4;
        }

        .um-perm-item::before {
          content: '✓';
          font-size: .65rem; font-weight: 700;
          flex-shrink: 0; margin-top: 1px;
        }
      </style>

      <div class="um-header">
        <div>
          <div class="um-header-title">Team Members</div>
          <div class="um-header-sub">Manage internal team access and role-based permissions</div>
        </div>
        <button class="btn-primary" onclick="OpsUserManagement.openInvite()">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
          Invite Member
        </button>
      </div>

      <!-- Members table -->
      <div class="um-table-card">
        <div class="um-table-head">
          <div class="um-table-title">Active Members</div>
          <div class="um-controls">
            <select class="um-filter" id="um-role-filter" onchange="OpsUserManagement.filterRole(this.value)">
              <option value="">All Roles</option>
              ${ROLE_OPTIONS.map(r => `<option value="${r.value}">${r.label}</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="um-table-body">
          <div style="padding:48px;text-align:center;color:var(--ink-3);">
            <div class="loading" style="margin:0 auto 12px;"></div>
            <div style="font-size:.82rem;">Loading members…</div>
          </div>
        </div>
      </div>

      <!-- Role permissions -->
      <div style="margin-bottom:12px;">
        <div style="font-family:var(--ff-d);font-size:.9rem;font-weight:700;color:var(--ink);margin-bottom:4px;">Role Permissions</div>
        <div style="font-size:.78rem;color:var(--ink-3);">What each role can access within the operations center</div>
      </div>

      <div class="um-perms-grid">
        ${Object.entries(ROLE_CONFIG)
          .filter(([k]) => k !== 'admin')
          .map(([key, rc]) => `
            <div class="um-perm-card" style="border-color:${rc.color}20;">
              <div style="position:absolute;top:0;left:0;bottom:0;width:3px;background:${rc.color};border-radius:0;"></div>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                <span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:.72rem;font-weight:700;background:${rc.bg};color:${rc.color};">${rc.label}</span>
              </div>
              <ul class="um-perm-list">
                ${rc.perms.map(p => `<li class="um-perm-item" style="color:${rc.color}40;"><span style="color:${rc.color};">&nbsp;</span><span style="color:var(--ink-2);">${p}</span></li>`).join('')}
              </ul>
            </div>`).join('')}
      </div>
    `;

    loadUsers();
  }

  async function loadUsers() {
    try {
      const res = await OpsModal.apiGet('/users');
      _users    = res.data || res.users || [];
      if (!Array.isArray(_users)) _users = [];
      renderTable(_users);
    } catch (err) {
      renderError(err.message);
    }
  }

  function filterRole(role) {
    const filtered = role ? _users.filter(u => (u.role_id || u.role) === role) : _users;
    renderTable(filtered);
  }

  function avatarColor(name) {
    const colors = ['#0a2a3d','#0d7fa0','#16a8d3','#0a8a6a','#7c3aed','#b45309'];
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
    if (mins < 1)   return 'Just now';
    if (mins < 60)  return `${mins}m ago`;
    if (hrs  < 24)  return `${hrs}h ago`;
    if (days < 7)   return `${days}d ago`;
    return new Date(ds).toLocaleDateString('en-GB', { day:'numeric', month:'short' });
  }

  function renderTable(users) {
    const el = document.getElementById('um-table-body');
    if (!el) return;

    if (!users || users.length === 0) {
      el.innerHTML = `
        <div style="padding:48px;text-align:center;color:var(--ink-3);">
          <div style="font-size:.88rem;font-weight:600;color:var(--ink-2);margin-bottom:8px;">No members found</div>
          <button class="btn-primary" onclick="OpsUserManagement.openInvite()">Invite First Member</button>
        </div>`;
      return;
    }

    el.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="ops-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last Active</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(u => {
              const id   = u.user_id || u.id;
              const name = u.full_name || u.name || 'Unknown';
              const role = u.role_id || u.role || '';
              const rc   = getRoleConfig(role);
              const isActive = u.status !== 'inactive' && u.status !== 'suspended';

              return `<tr>
                <td>
                  <div class="um-user-wrap">
                    <div class="um-avatar" style="background:${avatarColor(name)};">${initials(name)}</div>
                    <div>
                      <div class="um-user-name">${name}</div>
                      <div class="um-user-email">${u.email || ''}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <span class="um-role-chip" style="background:${rc.bg};color:${rc.color};">${rc.label}</span>
                </td>
                <td>
                  <span class="status-badge ${isActive ? 'nominal' : 'offline'}">${u.status || 'active'}</span>
                </td>
                <td style="font-family:var(--ff-m);font-size:.76rem;color:var(--ink-3);">
                  ${formatTime(u.last_login || u.last_active)}
                </td>
                <td style="text-align:right;">
                  <div style="display:flex;gap:6px;justify-content:flex-end;">
                    <button class="btn-ghost" onclick="OpsUserManagement.editUser('${id}','${name.replace(/'/g, "\\'")}')" style="padding:6px 12px;font-size:.76rem;">Edit</button>
                    ${isActive
                      ? `<button class="btn-ghost" onclick="OpsUserManagement.deactivateUser('${id}','${name.replace(/'/g, "\\'")}')" style="padding:6px 12px;font-size:.76rem;color:var(--err);border-color:rgba(220,38,38,.2);">Deactivate</button>`
                      : `<button class="btn-ghost" onclick="OpsUserManagement.reactivateUser('${id}')" style="padding:6px 12px;font-size:.76rem;color:var(--ok);">Reactivate</button>`}
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderError(message) {
    const el = document.getElementById('um-table-body');
    if (!el) return;
    el.innerHTML = `
      <div style="padding:48px;text-align:center;">
        <div style="color:var(--err);font-weight:700;margin-bottom:8px;">Failed to load members</div>
        <div style="color:var(--ink-3);font-size:.78rem;margin-bottom:16px;">${message}</div>
        <button class="btn-ghost" onclick="reloadTab('team-members')">Retry</button>
      </div>`;
  }

  // ── Invite modal ──
  function openInvite() {
    OpsModal.open('Invite Team Member', `
      ${OpsModal.field('Email Address', 'email', 'email', '', { placeholder: 'team.member@flowguard.ng' })}
      ${OpsModal.row([
        OpsModal.field('Full Name', 'full_name', 'text', '', { placeholder: 'First Last' }),
        OpsModal.field('Role', 'role_id', 'select', 'dispatcher', { options: ROLE_OPTIONS }),
      ])}
      ${OpsModal.field('Phone (optional)', 'phone', 'text', '', { placeholder: '+234…', required: false })}
    `, [
      { label: 'Cancel',      onclick: 'OpsModal.close()', class: 'btn-ghost' },
      { label: 'Send Invite', onclick: 'OpsUserManagement.sendInvite()', class: 'btn-primary', id: 'modal-save-btn' },
    ]);
  }

  async function sendInvite() {
    const data = OpsModal.getFormData();
    if (!data.email)     { OpsModal.toast('Email is required', 'warning'); return; }
    if (!data.full_name) { OpsModal.toast('Full name is required', 'warning'); return; }
    OpsModal.setLoading('modal-save-btn', true);
    try {
      await OpsModal.apiPost('/users/invite', data);
      OpsModal.close();
      OpsModal.toast('Invitation sent successfully', 'nominal');
      reloadTab('team-members');
    } catch (err) {
      OpsModal.toast('Failed: ' + err.message, 'critical');
      OpsModal.setLoading('modal-save-btn', false);
    }
  }

  // ── Edit user modal ──
  async function editUser(id, name) {
    let userData = { user_id: id, full_name: name };
    try {
      const res  = await OpsModal.apiGet(`/users/${id}`);
      userData   = res.data || res;
    } catch {}

    OpsModal.open(`Edit — ${name}`, `
      ${OpsModal.field('Full Name', 'full_name', 'text', userData.full_name || userData.name || name)}
      ${OpsModal.row([
        OpsModal.field('Role', 'role_id', 'select', userData.role_id || userData.role || '', { options: ROLE_OPTIONS }),
        OpsModal.field('Status', 'status', 'select', userData.status || 'active', {
          options: [
            { value: 'active',    label: 'Active' },
            { value: 'inactive',  label: 'Inactive' },
            { value: 'suspended', label: 'Suspended' },
          ]
        }),
      ])}
      ${OpsModal.field('Email', 'email', 'email', userData.email || '', { readonly: true })}
    `, [
      { label: 'Cancel',       onclick: 'OpsModal.close()', class: 'btn-ghost' },
      { label: 'Save Changes', onclick: `OpsUserManagement.saveEdit('${id}')`, class: 'btn-primary', id: 'modal-save-btn' },
    ]);
  }

  async function saveEdit(id) {
    const data = OpsModal.getFormData();
    delete data.email; // email is read-only
    OpsModal.setLoading('modal-save-btn', true);
    try {
      await OpsModal.apiPut(`/users/${id}`, data);
      OpsModal.close();
      OpsModal.toast('Member updated successfully', 'nominal');
      reloadTab('team-members');
    } catch (err) {
      OpsModal.toast('Failed: ' + err.message, 'critical');
      OpsModal.setLoading('modal-save-btn', false);
    }
  }

  // ── Deactivate ──
  function deactivateUser(id, name) {
    OpsModal.confirm(`Deactivate "${name}"? They will lose access immediately.`, async function () {
      OpsModal.setLoading('modal-confirm-btn', true);
      try {
        await OpsModal.apiPut(`/users/${id}`, { status: 'inactive' });
        OpsModal.close();
        OpsModal.toast('Member deactivated', 'nominal');
        reloadTab('team-members');
      } catch (err) {
        OpsModal.toast('Failed: ' + err.message, 'critical');
        OpsModal.setLoading('modal-confirm-btn', false);
      }
    });
  }

  // ── Reactivate ──
  async function reactivateUser(id) {
    try {
      await OpsModal.apiPut(`/users/${id}`, { status: 'active' });
      OpsModal.toast('Member reactivated', 'nominal');
      reloadTab('team-members');
    } catch (err) {
      OpsModal.toast('Failed: ' + err.message, 'critical');
    }
  }

  return {
    render, filterRole, openInvite, sendInvite,
    editUser, saveEdit, deactivateUser, reactivateUser,
  };

})();
