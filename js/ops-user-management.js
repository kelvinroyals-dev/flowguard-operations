// ============================================
// USER MANAGEMENT MODULE (NEON THEME)
// Full CRUD - Team member invites and RBAC
// ============================================

const OpsUserManagement = (function() {
    
    async function render(container) {
        container.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
                <div>
                    <h2 style="font-family: var(--font-display); font-size: 1.3rem; font-weight: 700; color: var(--text-bright); margin-bottom: 4px;">Team Members</h2>
                    <p style="font-size: 11px; color: var(--text-dim); letter-spacing: 0.5px;">Manage internal team access and permissions</p>
                </div>
                <button onclick="OpsUserManagement.openInviteModal()" class="btn-primary">
                    <svg style="width:14px;height:14px;display:inline;margin-right:6px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                    Invite Member
                </button>
            </div>
            
            <div class="ops-card" style="margin-bottom: 20px;">
                <div class="ops-card-header">
                    <div class="ops-card-title">Active Members</div>
                    <div style="display:flex;gap:8px;">
                        <select id="filter-role" class="input-field" style="width:180px;">
                            <option value="">All Roles</option>
                            <option value="super_admin">Super Admin</option>
                            <option value="operations_manager">Operations Manager</option>
                            <option value="dispatcher">Dispatcher</option>
                            <option value="field_lead">Field Lead</option>
                            <option value="analyst">Analyst</option>
                        </select>
                    </div>
                </div>
                <div class="ops-card-body" style="padding: 0;">
                    <div style="overflow-x: auto;">
                        <table class="ops-table">
                            <thead>
                                <tr>
                                    <th>Member</th>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th>Status</th>
                                    <th>Last Active</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="users-table-body">
                                <tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-dim);">
                                    <div class="loading" style="margin:0 auto;"></div>
                                    <div style="margin-top:12px;">Loading members...</div>
                                </td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            
            <div class="ops-card">
                <div class="ops-card-header"><div class="ops-card-title">Role Permissions</div></div>
                <div class="ops-card-body">
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
                        <div style="padding:12px;background:var(--surface);border-radius:8px;">
                            <div style="font-weight:600;color:var(--text-bright);margin-bottom:8px;font-size:12px;">Super Admin</div>
                            <div style="font-size:10px;color:var(--text-dim);line-height:1.5;">Full system access, user management, configuration</div>
                        </div>
                        <div style="padding:12px;background:var(--surface);border-radius:8px;">
                            <div style="font-weight:600;color:var(--text-bright);margin-bottom:8px;font-size:12px;">Operations Manager</div>
                            <div style="font-size:10px;color:var(--text-dim);line-height:1.5;">Client & team management, alert handling, reports</div>
                        </div>
                        <div style="padding:12px;background:var(--surface);border-radius:8px;">
                            <div style="font-weight:600;color:var(--text-bright);margin-bottom:8px;font-size:12px;">Dispatcher</div>
                            <div style="font-size:10px;color:var(--text-dim);line-height:1.5;">View alerts, assign teams, dispatch operations</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        loadUsers();
        attachEventListeners();
    }
    
    async function loadUsers() {
        try {
            const data = await OpsModal.apiGet('/users');
            const users = data.data || data.users || [];
            renderUsersTable(Array.isArray(users) ? users : []);
        } catch (error) {
            console.error('Load users error:', error);
            renderError(error.message);
        }
    }
    
    function renderUsersTable(users) {
        const tbody = document.getElementById('users-table-body');
        if (!tbody) return;
        
        if (!users || users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-dim);">
                <div style="font-size:12px;margin-bottom:12px;">No team members yet</div>
                <button onclick="OpsUserManagement.openInviteModal()" class="btn-secondary">Invite First Member</button>
            </td></tr>`;
            return;
        }
        
        tbody.innerHTML = users.map(user => {
            const id = user.user_id || user.id;
            const name = user.full_name || user.name || 'Unknown';
            const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            
            return `
                <tr class="ops-table-row">
                    <td>
                        <div style="display:flex;align-items:center;gap:10px;">
                            <div style="width:32px;height:32px;background:linear-gradient(135deg,var(--neon-dim),#006b60);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--bg);">${initials}</div>
                            <span style="font-weight:600;color:var(--text-bright);">${name}</span>
                        </div>
                    </td>
                    <td style="color:var(--text-mid);font-size:12px;font-family:var(--font-mono);">${user.email}</td>
                    <td><span class="status-badge nominal" style="font-size:9px;">${formatRole(user.role_id || user.role)}</span></td>
                    <td><span class="status-badge ${user.status === 'active' ? 'nominal' : 'offline'}">${user.status || 'active'}</span></td>
                    <td style="font-size:11px;color:var(--text-dim);font-family:var(--font-mono);">${formatTime(user.last_login || user.last_active)}</td>
                    <td>
                        <div style="display:flex;gap:6px;">
                            <button onclick="OpsUserManagement.editUser('${id}','${name.replace(/'/g, "\\'")}')" class="btn-table-action" title="Edit">
                                <svg style="width:14px;height:14px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                            </button>
                            <button onclick="OpsUserManagement.deactivateUser('${id}','${name.replace(/'/g, "\\'")}')" class="btn-table-action" title="Deactivate" style="color:var(--s-critical);">
                                <svg style="width:14px;height:14px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }
    
    function formatRole(role) {
        const roles = {
            'super_admin': 'Super Admin',
            'operations_manager': 'Ops Manager',
            'dispatcher': 'Dispatcher',
            'field_lead': 'Field Lead',
            'analyst': 'Analyst',
            'finance': 'Finance'
        };
        return roles[role] || role || '—';
    }
    
    function formatTime(dateString) {
        if (!dateString) return '—';
        const minutes = Math.floor((new Date() - new Date(dateString)) / 60000);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        return new Date(dateString).toLocaleDateString();
    }
    
    // ============================================
    // CRUD MODALS
    // ============================================
    
    function openInviteModal() {
        const body = `
            ${OpsModal.field('Email Address', 'email', 'email', '', { placeholder: 'team.member@flowguard.ng' })}
            ${OpsModal.row([
                OpsModal.field('Full Name', 'full_name', 'text', '', { placeholder: 'John Doe' }),
                OpsModal.field('Role', 'role_id', 'select', 'dispatcher', { options: [
                    { value: 'super_admin', label: 'Super Admin' },
                    { value: 'operations_manager', label: 'Operations Manager' },
                    { value: 'dispatcher', label: 'Dispatcher' },
                    { value: 'field_lead', label: 'Field Lead' },
                    { value: 'analyst', label: 'Analyst' },
                    { value: 'finance', label: 'Finance' }
                ]})
            ])}
            ${OpsModal.field('Phone (optional)', 'phone', 'text', '', { placeholder: '+234...', required: false })}
        `;
        
        OpsModal.open('Invite Team Member', body, [
            { label: 'Cancel', class: 'btn-ghost', onclick: 'OpsModal.close()' },
            { label: 'Send Invite', class: 'btn-primary', onclick: 'OpsUserManagement.sendInvite()', id: 'modal-save-btn' }
        ]);
    }
    
    async function sendInvite() {
        const data = OpsModal.getFormData();
        if (!data.email) { OpsModal.toast('Email is required', 'warning'); return; }
        
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
    
    async function editUser(id, name) {
        // Try to get full user data
        let userData = {};
        try {
            const data = await OpsModal.apiGet(`/users/${id}`);
            userData = data.data || data;
        } catch (e) {
            // Fallback: use what we know
            userData = { user_id: id, full_name: name };
        }
        
        const body = `
            ${OpsModal.field('Full Name', 'full_name', 'text', userData.full_name || userData.name || name)}
            ${OpsModal.row([
                OpsModal.field('Role', 'role_id', 'select', userData.role_id || userData.role || '', { options: [
                    { value: 'super_admin', label: 'Super Admin' },
                    { value: 'operations_manager', label: 'Operations Manager' },
                    { value: 'dispatcher', label: 'Dispatcher' },
                    { value: 'field_lead', label: 'Field Lead' },
                    { value: 'analyst', label: 'Analyst' },
                    { value: 'finance', label: 'Finance' }
                ]}),
                OpsModal.field('Status', 'status', 'select', userData.status || 'active', { options: [
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                    { value: 'suspended', label: 'Suspended' }
                ]})
            ])}
            ${OpsModal.field('Email', 'email', 'email', userData.email || '', { readonly: true })}
        `;
        
        OpsModal.open(`Edit Member: ${name}`, body, [
            { label: 'Cancel', class: 'btn-ghost', onclick: 'OpsModal.close()' },
            { label: 'Save Changes', class: 'btn-primary', onclick: `OpsUserManagement.saveEditUser('${id}')`, id: 'modal-save-btn' }
        ]);
    }
    
    async function saveEditUser(id) {
        const data = OpsModal.getFormData();
        delete data.email; // Don't update email
        
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
    
    function deactivateUser(id, name) {
        OpsModal.confirm(`Deactivate user "${name}"?`, async function() {
            OpsModal.setLoading('modal-confirm-btn', true);
            try {
                await OpsModal.apiPut(`/users/${id}`, { status: 'inactive' });
                OpsModal.close();
                OpsModal.toast('User deactivated', 'nominal');
                reloadTab('team-members');
            } catch (err) {
                OpsModal.toast('Failed: ' + err.message, 'critical');
                OpsModal.setLoading('modal-confirm-btn', false);
            }
        });
    }
    
    function renderError(message) {
        const tbody = document.getElementById('users-table-body');
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;">
            <div style="color:var(--s-critical);font-weight:600;margin-bottom:8px;">Failed to Load</div>
            <div style="color:var(--text-dim);font-size:11px;margin-bottom:16px;">${message}</div>
            <button onclick="reloadTab('team-members')" class="btn-secondary">Retry</button>
        </td></tr>`;
    }
    
    function attachEventListeners() {
        const filter = document.getElementById('filter-role');
        if (filter) filter.addEventListener('change', loadUsers);
    }
    
    return {
        render, openInviteModal, sendInvite,
        editUser, saveEditUser, deactivateUser
    };
})();