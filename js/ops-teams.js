// ============================================
// TEAMS MANAGEMENT MODULE (NEON THEME)
// Full CRUD - Field team dispatch and tracking
// ============================================

const OpsTeams = (function() {
    
    async function render(container) {
        container.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
                <div>
                    <h2 style="font-family: var(--font-display); font-size: 1.3rem; font-weight: 700; color: var(--text-bright); margin-bottom: 4px;">Field Teams</h2>
                    <p style="font-size: 11px; color: var(--text-dim); letter-spacing: 0.5px;">Dispatch and track response teams</p>
                </div>
                <button onclick="OpsTeams.createTeam()" class="btn-primary">
                    <svg style="width:14px;height:14px;display:inline;margin-right:6px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                    Create Team
                </button>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px;">
                <div class="ops-card"><div class="ops-card-body" style="text-align:center;">
                    <div style="font-size:10px;color:var(--text-dim);letter-spacing:1px;margin-bottom:6px;">ON SITE</div>
                    <div style="font-size:28px;font-weight:700;font-family:var(--font-mono);color:var(--s-nominal);" id="teams-onsite">—</div>
                </div></div>
                <div class="ops-card"><div class="ops-card-body" style="text-align:center;">
                    <div style="font-size:10px;color:var(--text-dim);letter-spacing:1px;margin-bottom:6px;">EN ROUTE</div>
                    <div style="font-size:28px;font-weight:700;font-family:var(--font-mono);color:var(--s-watch);" id="teams-enroute">—</div>
                </div></div>
                <div class="ops-card"><div class="ops-card-body" style="text-align:center;">
                    <div style="font-size:10px;color:var(--text-dim);letter-spacing:1px;margin-bottom:6px;">IDLE</div>
                    <div style="font-size:28px;font-weight:700;font-family:var(--font-mono);color:var(--text-mid);" id="teams-idle">—</div>
                </div></div>
                <div class="ops-card"><div class="ops-card-body" style="text-align:center;">
                    <div style="font-size:10px;color:var(--text-dim);letter-spacing:1px;margin-bottom:6px;">TOTAL</div>
                    <div style="font-size:28px;font-weight:700;font-family:var(--font-mono);color:var(--text-bright);" id="teams-total">—</div>
                </div></div>
            </div>
            
            <div class="ops-card">
                <div class="ops-card-header">
                    <div class="ops-card-title">Active Teams</div>
                </div>
                <div class="ops-card-body" style="padding: 0;">
                    <div style="overflow-x: auto;">
                        <table class="ops-table">
                            <thead>
                                <tr>
                                    <th>Team</th>
                                    <th>Status</th>
                                    <th>Location</th>
                                    <th>Assigned To</th>
                                    <th>ETA</th>
                                    <th>Last Check-in</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="teams-table-body">
                                <tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-dim);">
                                    <div class="loading" style="margin:0 auto;"></div>
                                    <div style="margin-top:12px;">Loading teams...</div>
                                </td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        
        loadTeams();
    }
    
    async function loadTeams() {
        try {
            const data = await OpsModal.apiGet('/teams');
            const teams = data.data || data.teams || [];
            renderTeamsTable(Array.isArray(teams) ? teams : []);
            updateTeamStats(Array.isArray(teams) ? teams : []);
        } catch (error) {
            console.error('Load teams error:', error);
            renderError(error.message);
        }
    }
    
    function updateTeamStats(teams) {
        const stats = teams.reduce((acc, t) => {
            if (t.status === 'on_site') acc.onsite++;
            else if (t.status === 'en_route') acc.enroute++;
            else acc.idle++;
            return acc;
        }, { onsite: 0, enroute: 0, idle: 0 });
        
        document.getElementById('teams-onsite').textContent = stats.onsite;
        document.getElementById('teams-enroute').textContent = stats.enroute;
        document.getElementById('teams-idle').textContent = stats.idle;
        document.getElementById('teams-total').textContent = teams.length;
    }
    
    function renderTeamsTable(teams) {
        const tbody = document.getElementById('teams-table-body');
        if (!tbody) return;
        
        if (!teams || teams.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-dim);">
                <div style="font-size:12px;margin-bottom:12px;">No teams configured</div>
                <button onclick="OpsTeams.createTeam()" class="btn-secondary">Create First Team</button>
            </td></tr>`;
            return;
        }
        
        tbody.innerHTML = teams.map(team => {
            const id = team.team_id || team.id;
            const name = team.team_name || team.name || id || '—';
            return `
            <tr class="ops-table-row">
                <td style="font-weight:600;color:var(--text-bright);font-family:var(--font-mono);">${name}</td>
                <td>${getStatusBadge(team.status || 'idle')}</td>
                <td style="color:var(--text-mid);font-size:12px;">${team.current_location || team.location || '—'}</td>
                <td style="color:var(--text-mid);font-size:12px;">${team.assigned_to || '—'}</td>
                <td style="font-family:var(--font-mono);font-size:12px;color:${team.eta ? 'var(--s-watch)' : 'var(--text-dim)'};">
                    ${team.eta ? team.eta + ' min' : '—'}
                </td>
                <td style="font-size:11px;color:var(--text-dim);">${formatTime(team.last_checkin || team.last_check_in)}</td>
                <td>
                    <div style="display:flex;gap:6px;">
                        <button onclick="OpsTeams.viewTeam('${id}')" class="btn-table-action" title="View">
                            <svg style="width:14px;height:14px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                        </button>
                        <button onclick="OpsTeams.editTeamStatus('${id}','${name.replace(/'/g, "\\'")}')" class="btn-table-action" title="Update Status">
                            <svg style="width:14px;height:14px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        </button>
                        ${team.status === 'idle' ? `
                            <button onclick="OpsTeams.dispatch('${id}','${name.replace(/'/g, "\\'")}')" class="btn-table-action" title="Dispatch" style="color:var(--s-nominal);">
                                <svg style="width:14px;height:14px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>`;
        }).join('');
    }
    
    function getStatusBadge(status) {
        const m = { 'on_site': 'nominal', 'en_route': 'watch', 'idle': 'offline', 'returning': 'watch' };
        return `<span class="status-badge ${m[status] || 'offline'}">${status.replace('_', ' ')}</span>`;
    }
    
    function formatTime(dateString) {
        if (!dateString) return '—';
        const minutes = Math.floor((new Date() - new Date(dateString)) / 60000);
        if (minutes < 60) return `${minutes} min ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        return new Date(dateString).toLocaleDateString();
    }
    
    // ============================================
    // CRUD MODALS
    // ============================================
    
    function createTeam() {
        const body = `
            ${OpsModal.field('Team Name', 'team_name', 'text', '', { placeholder: 'e.g. Alpha Response Unit' })}
            ${OpsModal.row([
                OpsModal.field('Team Lead', 'team_lead', 'text', '', { placeholder: 'Lead name' }),
                OpsModal.field('Members Count', 'member_count', 'number', '', { placeholder: '4' })
            ])}
            ${OpsModal.field('Base Location', 'current_location', 'text', '', { placeholder: 'e.g. VI Depot, Lagos' })}
            ${OpsModal.field('Contact Phone', 'phone', 'text', '', { placeholder: '+234...', required: false })}
        `;
        
        OpsModal.open('Create Field Team', body, [
            { label: 'Cancel', class: 'btn-ghost', onclick: 'OpsModal.close()' },
            { label: 'Create Team', class: 'btn-primary', onclick: 'OpsTeams.saveNewTeam()', id: 'modal-save-btn' }
        ]);
    }
    
    async function saveNewTeam() {
        const data = OpsModal.getFormData();
        if (!data.team_name) { OpsModal.toast('Team name is required', 'warning'); return; }
        data.status = 'idle';
        
        OpsModal.setLoading('modal-save-btn', true);
        try {
            await OpsModal.apiPost('/teams', data);
            OpsModal.close();
            OpsModal.toast('Team created successfully', 'nominal');
            reloadTab('teams');
        } catch (err) {
            OpsModal.toast('Failed: ' + err.message, 'critical');
            OpsModal.setLoading('modal-save-btn', false);
        }
    }
    
    async function viewTeam(id) {
        try {
            const data = await OpsModal.apiGet(`/teams/${id}`);
            const t = data.data || data;
            
            const body = `
                <div class="ops-modal-detail"><span class="label">Team Name</span><span class="value">${t.team_name || t.name || '—'}</span></div>
                <div class="ops-modal-detail"><span class="label">ID</span><span class="value">${t.team_id || t.id || '—'}</span></div>
                <div class="ops-modal-detail"><span class="label">Status</span><span class="value">${getStatusBadge(t.status || 'idle')}</span></div>
                <div class="ops-modal-detail"><span class="label">Location</span><span class="value">${t.current_location || '—'}</span></div>
                <div class="ops-modal-detail"><span class="label">Assigned To</span><span class="value">${t.assigned_to || '—'}</span></div>
                <div class="ops-modal-detail"><span class="label">Last Check-in</span><span class="value">${formatTime(t.last_checkin)}</span></div>
                <div class="ops-modal-detail"><span class="label">Team Lead</span><span class="value">${t.team_lead || '—'}</span></div>
            `;
            
            OpsModal.open(`Team: ${t.team_name || t.name || id}`, body, [
                { label: 'Close', class: 'btn-ghost', onclick: 'OpsModal.close()' }
            ]);
        } catch (err) {
            // Fallback: just show the ID
            OpsModal.toast('Could not load team details: ' + err.message, 'warning');
        }
    }
    
    function editTeamStatus(id, name) {
        const body = `
            <div style="margin-bottom:14px;font-size:12px;color:var(--text-mid);">Update status for <strong style="color:var(--text-bright);">${name}</strong></div>
            ${OpsModal.field('Status', 'status', 'select', '', { options: [
                { value: 'idle', label: 'Idle' },
                { value: 'en_route', label: 'En Route' },
                { value: 'on_site', label: 'On Site' },
                { value: 'returning', label: 'Returning' }
            ]})}
            ${OpsModal.field('Current Location', 'location', 'text', '', { placeholder: 'Where is the team now?' })}
        `;
        
        OpsModal.open('Update Team Status', body, [
            { label: 'Cancel', class: 'btn-ghost', onclick: 'OpsModal.close()' },
            { label: 'Update', class: 'btn-primary', onclick: `OpsTeams.saveTeamStatus('${id}')`, id: 'modal-save-btn' }
        ]);
    }
    
    async function saveTeamStatus(id) {
        const data = OpsModal.getFormData();
        OpsModal.setLoading('modal-save-btn', true);
        try {
            await OpsModal.apiPut(`/teams/${id}/status`, data);
            OpsModal.close();
            OpsModal.toast('Team status updated', 'nominal');
            reloadTab('teams');
        } catch (err) {
            OpsModal.toast('Failed: ' + err.message, 'critical');
            OpsModal.setLoading('modal-save-btn', false);
        }
    }
    
    function dispatch(id, name) {
        const body = `
            <div style="margin-bottom:14px;font-size:12px;color:var(--text-mid);">Dispatching <strong style="color:var(--text-bright);">${name}</strong></div>
            ${OpsModal.field('Destination', 'location', 'text', '', { placeholder: 'Dispatch destination address' })}
            ${OpsModal.field('Assignment / Alert ID', 'assigned_to', 'text', '', { placeholder: 'e.g. Client name or Alert ID', required: false })}
            ${OpsModal.field('Notes', 'notes', 'textarea', '', { placeholder: 'Dispatch instructions...', required: false })}
        `;
        
        OpsModal.open('Dispatch Team', body, [
            { label: 'Cancel', class: 'btn-ghost', onclick: 'OpsModal.close()' },
            { label: '⚡ Dispatch Now', class: 'btn-primary', onclick: `OpsTeams.confirmDispatch('${id}')`, id: 'modal-save-btn' }
        ]);
    }
    
    async function confirmDispatch(id) {
        const data = OpsModal.getFormData();
        data.status = 'en_route';
        
        OpsModal.setLoading('modal-save-btn', true);
        try {
            await OpsModal.apiPut(`/teams/${id}/status`, data);
            OpsModal.close();
            OpsModal.toast('Team dispatched!', 'nominal');
            reloadTab('teams');
        } catch (err) {
            OpsModal.toast('Failed: ' + err.message, 'critical');
            OpsModal.setLoading('modal-save-btn', false);
        }
    }
    
    function renderError(message) {
        const tbody = document.getElementById('teams-table-body');
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;">
            <div style="color:var(--s-critical);font-weight:600;margin-bottom:8px;">Failed to Load</div>
            <div style="color:var(--text-dim);font-size:11px;margin-bottom:16px;">${message}</div>
            <button onclick="reloadTab('teams')" class="btn-secondary">Retry</button>
        </td></tr>`;
        ['teams-onsite','teams-enroute','teams-idle','teams-total'].forEach(id => {
            document.getElementById(id).textContent = '0';
        });
    }
    
    return {
        render, createTeam, saveNewTeam,
        viewTeam, editTeamStatus, saveTeamStatus,
        dispatch, confirmDispatch
    };
})();