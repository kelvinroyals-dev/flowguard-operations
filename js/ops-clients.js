// ============================================
// OPS CLIENTS — People who submitted areas
// Source: users WHERE user_type='client'
// ============================================
const OpsClients = (function(){
    'use strict';

    function render(container) {
        container.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
                <div>
                    <h2 style="font-family:var(--font-display);font-size:1.1rem;color:var(--text-bright);margin:0;">Clients</h2>
                    <p style="font-size:11px;color:var(--text-dim);margin:4px 0 0;">People and organizations who submitted areas for drainage management</p>
                </div>
            </div>
            <div id="clients-stats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;"></div>
            <div id="clients-table-wrap" style="background:var(--panel);border:1px solid var(--panel-edge);border-radius:10px;overflow:hidden;">
                <div style="padding:40px;text-align:center;color:var(--text-dim);font-size:11px;letter-spacing:1px;">LOADING CLIENTS...</div>
            </div>
        `;
        loadClients();
    }

    async function loadClients() {
        try {
            const res = await OpsModal.apiGet('/clients');
            const clients = res.data || [];
            renderStats(clients);
            renderTable(clients);
        } catch (err) {
            console.error('Failed to load clients:', err);
            document.getElementById('clients-table-wrap').innerHTML = '<div style="padding:40px;text-align:center;color:var(--s-critical);font-size:11px;">FAILED TO LOAD CLIENTS</div>';
        }
    }

    function renderStats(clients) {
        const total = clients.length;
        const totalAreas = clients.reduce((s,c) => s + (parseInt(c.submitted_areas)||0), 0);
        const pending = clients.reduce((s,c) => s + (parseInt(c.pending_areas)||0), 0);
        const active = clients.reduce((s,c) => s + (parseInt(c.active_areas)||0), 0);
        document.getElementById('clients-stats').innerHTML = `
            <div class="metric-tile"><div class="metric-label">Total Clients</div><div class="metric-value">${total}</div></div>
            <div class="metric-tile"><div class="metric-label">Areas Submitted</div><div class="metric-value">${totalAreas}</div></div>
            <div class="metric-tile ${pending > 0 ? 'watch' : ''}"><div class="metric-label">Pending Review</div><div class="metric-value">${pending}</div></div>
            <div class="metric-tile"><div class="metric-label">Active Areas</div><div class="metric-value">${active}</div></div>
        `;
    }

    function renderTable(clients) {
        if (clients.length === 0) {
            document.getElementById('clients-table-wrap').innerHTML = '<div style="padding:60px;text-align:center;"><div style="font-size:28px;margin-bottom:12px;">📋</div><div style="color:var(--text-dim);font-size:11px;letter-spacing:1px;">NO CLIENTS YET</div></div>';
            return;
        }
        document.getElementById('clients-table-wrap').innerHTML = `
            <table class="ops-table"><thead><tr>
                <th>Client</th><th>Email</th><th>Areas</th><th>Pending</th><th>Active</th><th>Status</th><th>Joined</th><th style="text-align:right;">Actions</th>
            </tr></thead><tbody>
            ${clients.map(c => `<tr>
                <td class="bright">${c.full_name || '—'}</td>
                <td>${c.email || '—'}</td>
                <td style="text-align:center;">${c.submitted_areas || 0}</td>
                <td style="text-align:center;">${parseInt(c.pending_areas||0) > 0 ? '<span style="color:var(--s-watch);font-weight:600;">'+c.pending_areas+'</span>' : '0'}</td>
                <td style="text-align:center;">${parseInt(c.active_areas||0) > 0 ? '<span style="color:var(--s-nominal);font-weight:600;">'+c.active_areas+'</span>' : '0'}</td>
                <td>${statusBadge(c.status, c.is_active)}</td>
                <td style="font-size:10px;color:var(--text-dim);">${c.created_at ? new Date(c.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—'}</td>
                <td style="text-align:right;">
                    <button class="btn-ghost" onclick="OpsClients.viewClient(${c.client_id})" style="padding:5px 10px;font-size:9px;">VIEW</button>
                    <button class="btn-ghost" onclick="OpsClients.editClient(${c.client_id})" style="padding:5px 10px;font-size:9px;">EDIT</button>
                </td>
            </tr>`).join('')}
            </tbody></table>`;
    }

    function statusBadge(status, isActive) {
        if (isActive === false) return '<span class="status-badge offline">inactive</span>';
        if (status === 'active') return '<span class="status-badge nominal">active</span>';
        return '<span class="status-badge watch">'+(status||'pending')+'</span>';
    }

    function pipelineBadge(s) {
        const m = {'submitted':'watch','inspection_scheduled':'watch','inspection_ongoing':'warning','report_ready':'watch','quote_sent':'watch','payment_pending':'warning','payment_completed':'nominal','deployment_scheduled':'watch','active':'nominal','suspended':'critical','cancelled':'offline'};
        return '<span class="status-badge '+(m[s]||'offline')+'">'+(s||'unknown').replace(/_/g,' ')+'</span>';
    }

    function inspBadge(s) {
        const m = {'pending':'watch','scheduled':'watch','in_progress':'warning','completed':'nominal','cancelled':'critical','rescheduled':'watch'};
        return '<span class="status-badge '+(m[s]||'offline')+'">'+s+'</span>';
    }

    function payBadge(s) {
        const m = {'pending':'watch','partial':'warning','paid':'nominal','overdue':'critical','cancelled':'offline'};
        return '<span class="status-badge '+(m[s]||'offline')+'">'+s+'</span>';
    }

    async function viewClient(clientId) {
        try {
            const res = await OpsModal.apiGet('/clients/' + clientId);
            const c = res.data;
            if (!c) return OpsModal.toast('Client not found', 'error');
            const areas = c.areas || [];
            const invoices = c.invoices || [];

            OpsModal.open(c.full_name || 'Client Details', `
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
                        <div class="ops-modal-detail"><span class="label">Email</span><span class="value">${c.email||'—'}</span></div>
                        <div class="ops-modal-detail"><span class="label">Phone</span><span class="value">${c.phone||'—'}</span></div>
                        <div class="ops-modal-detail"><span class="label">Status</span><span class="value">${statusBadge(c.status, c.is_active)}</span></div>
                        <div class="ops-modal-detail"><span class="label">Joined</span><span class="value">${c.created_at ? new Date(c.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—'}</span></div>
                        <div class="ops-modal-detail"><span class="label">Last Login</span><span class="value">${c.last_login ? new Date(c.last_login).toLocaleString() : 'Never'}</span></div>
                        <div class="ops-modal-detail"><span class="label">Total Areas</span><span class="value">${areas.length}</span></div>
                    </div>
                    <div style="margin-top:16px;">
                        <div style="font-size:10px;letter-spacing:2px;color:var(--text-dim);text-transform:uppercase;margin-bottom:10px;">SUBMITTED AREAS</div>
                        ${areas.length === 0 ? '<div style="color:var(--text-dim);font-size:11px;padding:16px 0;">No areas submitted yet</div>' : `
                        <table class="ops-table" style="font-size:11px;"><thead><tr><th>Area Name</th><th>Type</th><th>Location</th><th>Pipeline Status</th><th>Inspection</th></tr></thead><tbody>
                        ${areas.map(a => `<tr>
                            <td class="bright">${a.property_name||'—'}</td>
                            <td>${(a.property_type||'').replace(/_/g,' ')}</td>
                            <td>${[a.city,a.state].filter(Boolean).join(', ')||'—'}</td>
                            <td>${pipelineBadge(a.status)}</td>
                            <td>${a.inspection_status ? inspBadge(a.inspection_status) : '<span style="color:var(--text-dim);font-size:10px;">Not scheduled</span>'}</td>
                        </tr>`).join('')}
                        </tbody></table>`}
                    </div>
                    ${invoices.length > 0 ? `
                    <div style="margin-top:20px;">
                        <div style="font-size:10px;letter-spacing:2px;color:var(--text-dim);text-transform:uppercase;margin-bottom:10px;">INVOICES</div>
                        <table class="ops-table" style="font-size:11px;"><thead><tr><th>Invoice</th><th>Amount</th><th>Payment</th><th>Due</th></tr></thead><tbody>
                        ${invoices.map(inv => `<tr>
                            <td class="bright">${inv.invoice_id}</td>
                            <td>₦${Number(inv.total_amount||0).toLocaleString()}</td>
                            <td>${payBadge(inv.payment_status)}</td>
                            <td>${inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '—'}</td>
                        </tr>`).join('')}
                        </tbody></table>
                    </div>` : ''}
                `, [
                { label: 'Close', onclick: 'OpsModal.close()', class: 'btn-ghost' }
            ]);
        } catch (err) {
            console.error('View client error:', err);
            OpsModal.toast('Failed to load client details', 'error');
        }
    }

    async function editClient(clientId) {
        try {
            const res = await OpsModal.apiGet('/clients/' + clientId);
            const c = res.data;
            OpsModal.open('Edit Client', `
                    ${OpsModal.field('Full Name', 'full_name', 'text', c.full_name||'')}
                    ${OpsModal.field('Phone', 'phone', 'text', c.phone||'')}
                    ${OpsModal.field('Status', 'status', 'select', c.status||'active', { options: [
                        {value:'active',label:'Active'},{value:'suspended',label:'Suspended'},{value:'inactive',label:'Inactive'}
                    ]})}
                `, [
                { label: 'Cancel', onclick: 'OpsModal.close()', class: 'btn-ghost' },
                { label: 'Save Changes', onclick: 'OpsClients.saveClient('+clientId+')', class: 'btn-primary' }
            ]);
        } catch(e) { OpsModal.toast('Failed to load client', 'error'); }
    }

    async function saveClient(clientId) {
        const data = OpsModal.getFormData();
        try {
            await OpsModal.apiPut('/clients/' + clientId, data);
            OpsModal.close();
            OpsModal.toast('Client updated', 'success');
            const container = document.getElementById('content-clients');
            if (container) { container.removeAttribute('data-rendered'); render(container); }
        } catch (err) { OpsModal.toast('Failed to update client', 'error'); }
    }

    return { render, viewClient, editClient, saveClient };
})();