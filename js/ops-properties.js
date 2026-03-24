// ============================================
// OPS PROPERTIES (Areas & Inspections Pipeline)
// Source: properties table = submitted areas/estates/communities
// Shows pipeline: submitted → inspection → report → quote → payment → active
// ============================================
const OpsProperties = (function(){
    'use strict';

    function render(container) {
        container.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
                <div>
                    <h2 style="font-family:var(--font-display);font-size:1.1rem;color:var(--text-bright);margin:0;">Areas & Inspections</h2>
                    <p style="font-size:11px;color:var(--text-dim);margin:4px 0 0;">Submitted estates, communities, and areas — full inspection pipeline</p>
                </div>
            </div>
            <div id="areas-pipeline" style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:20px;"></div>
            <div id="areas-table-wrap" style="background:var(--panel);border:1px solid var(--panel-edge);border-radius:10px;overflow:hidden;">
                <div style="padding:40px;text-align:center;color:var(--text-dim);font-size:11px;letter-spacing:1px;">LOADING AREAS...</div>
            </div>
        `;
        loadAreas();
    }

    async function loadAreas() {
        try {
            const res = await OpsModal.apiGet('/properties/all');
            const areas = res.data || [];
            renderPipeline(areas);
            renderTable(areas);
        } catch (err) {
            console.error('Failed to load areas:', err);
            document.getElementById('areas-table-wrap').innerHTML = '<div style="padding:40px;text-align:center;color:var(--s-critical);font-size:11px;">FAILED TO LOAD AREAS</div>';
        }
    }

    function renderPipeline(areas) {
        const counts = { submitted:0, inspection:0, report:0, quote_payment:0, active:0 };
        areas.forEach(a => {
            const s = a.status;
            if (s === 'submitted') counts.submitted++;
            else if (['inspection_scheduled','inspection_ongoing'].includes(s)) counts.inspection++;
            else if (s === 'report_ready') counts.report++;
            else if (['quote_sent','payment_pending','payment_completed','deployment_scheduled'].includes(s)) counts.quote_payment++;
            else if (s === 'active') counts.active++;
        });
        document.getElementById('areas-pipeline').innerHTML = `
            <div class="metric-tile ${counts.submitted > 0 ? 'watch' : ''}"><div class="metric-label">Awaiting Review</div><div class="metric-value">${counts.submitted}</div><div class="metric-sub">Submitted</div></div>
            <div class="metric-tile ${counts.inspection > 0 ? 'watch' : ''}"><div class="metric-label">In Inspection</div><div class="metric-value">${counts.inspection}</div><div class="metric-sub">Scheduled / Ongoing</div></div>
            <div class="metric-tile"><div class="metric-label">Report Ready</div><div class="metric-value">${counts.report}</div><div class="metric-sub">Awaiting quote</div></div>
            <div class="metric-tile ${counts.quote_payment > 0 ? 'watch' : ''}"><div class="metric-label">Quote / Payment</div><div class="metric-value">${counts.quote_payment}</div><div class="metric-sub">In billing</div></div>
            <div class="metric-tile"><div class="metric-label">Active</div><div class="metric-value">${counts.active}</div><div class="metric-sub">Monitored</div></div>
        `;
    }

    function renderTable(areas) {
        if (areas.length === 0) {
            document.getElementById('areas-table-wrap').innerHTML = '<div style="padding:60px;text-align:center;"><div style="font-size:28px;margin-bottom:12px;">🏘️</div><div style="color:var(--text-dim);font-size:11px;letter-spacing:1px;">NO AREAS SUBMITTED YET</div></div>';
            return;
        }
        document.getElementById('areas-table-wrap').innerHTML = `
            <table class="ops-table"><thead><tr>
                <th>Area / Estate</th><th>Type</th><th>Client</th><th>Location</th><th>Pipeline Status</th><th>Inspection</th><th>Urgency</th><th style="text-align:right;">Actions</th>
            </tr></thead><tbody>
            ${areas.map(a => {
                const loc = [a.city,a.state].filter(Boolean).join(', ') || a.location || '—';
                return `<tr>
                    <td class="bright">${a.property_name||'—'}</td>
                    <td style="font-size:10px;">${(a.property_type||'').replace(/_/g,' ')}</td>
                    <td>${a.client_name||a.client_email||'—'}</td>
                    <td>${loc}</td>
                    <td>${pipelineBadge(a.status)}</td>
                    <td>${a.inspection_status ? inspBadge(a.inspection_status) : '<span style="color:var(--text-dim);font-size:10px;">—</span>'}</td>
                    <td>${urgencyBadge(a.urgency_level)}</td>
                    <td style="text-align:right;">
                        <button class="btn-ghost" onclick="OpsProperties.viewArea('${a.property_id}')" style="padding:5px 10px;font-size:9px;">VIEW</button>
                        <button class="btn-ghost" onclick="OpsProperties.editArea('${a.property_id}')" style="padding:5px 10px;font-size:9px;">EDIT</button>
                        ${a.status === 'submitted' ? '<button class="btn-primary" onclick="OpsProperties.scheduleInspection(\''+a.property_id+'\',\''+( a.property_name||'').replace(/'/g,"\\'")+'\' )" style="padding:5px 10px;font-size:9px;">SCHEDULE</button>' : ''}
                    </td>
                </tr>`;
            }).join('')}
            </tbody></table>`;
    }

    function pipelineBadge(s) {
        const m = {'submitted':'watch','inspection_scheduled':'watch','inspection_ongoing':'warning','report_ready':'nominal','quote_sent':'watch','payment_pending':'warning','payment_completed':'nominal','deployment_scheduled':'watch','active':'nominal','suspended':'critical','cancelled':'offline'};
        return '<span class="status-badge '+(m[s]||'offline')+'">'+(s||'unknown').replace(/_/g,' ')+'</span>';
    }
    function inspBadge(s) {
        const m = {'pending':'watch','scheduled':'watch','in_progress':'warning','completed':'nominal','cancelled':'critical','rescheduled':'watch'};
        return '<span class="status-badge '+(m[s]||'offline')+'">'+s+'</span>';
    }
    function urgencyBadge(u) {
        if (!u) return '<span style="color:var(--text-dim);font-size:10px;">—</span>';
        const m = {'low':'nominal','medium':'watch','high':'warning','critical':'critical'};
        return '<span class="status-badge '+(m[u]||'offline')+'">'+u+'</span>';
    }

    async function viewArea(propertyId) {
        try {
            const res = await OpsModal.apiGet('/properties/' + propertyId);
            const a = res.data;
            if (!a) return OpsModal.toast('Area not found', 'error');
            const inspections = a.inspections || [];
            const quotes = a.quotes || [];
            const invoices = a.invoices || [];

            const viewActions = [{ label: 'Close', onclick: 'OpsModal.close()', class: 'btn-ghost' }];
            if (a.status === 'submitted') {
                viewActions.push({ label: 'Schedule Inspection', onclick: "OpsProperties.scheduleInspection('"+a.property_id+"','"+((a.property_name||'').replace(/'/g,"\\'"))+"')", class: 'btn-primary' });
            }
            OpsModal.open(a.property_name || 'Area Details', `
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
                        <div class="ops-modal-detail"><span class="label">Property ID</span><span class="value" style="font-size:10px;">${a.property_id}</span></div>
                        <div class="ops-modal-detail"><span class="label">Type</span><span class="value">${(a.property_type||'').replace(/_/g,' ')}</span></div>
                        <div class="ops-modal-detail"><span class="label">Location</span><span class="value">${[a.city,a.state].filter(Boolean).join(', ')||a.location||'—'}</span></div>
                        <div class="ops-modal-detail"><span class="label">Pipeline Status</span><span class="value">${pipelineBadge(a.status)}</span></div>
                        <div class="ops-modal-detail"><span class="label">Client</span><span class="value">${a.client_name||a.client_email||'—'}</span></div>
                        <div class="ops-modal-detail"><span class="label">Client Phone</span><span class="value">${a.client_phone||'—'}</span></div>
                        <div class="ops-modal-detail"><span class="label">Contact Person</span><span class="value">${a.contact_person_name||'—'}</span></div>
                        <div class="ops-modal-detail"><span class="label">Urgency</span><span class="value">${urgencyBadge(a.urgency_level)}</span></div>
                        <div class="ops-modal-detail"><span class="label">Submitted</span><span class="value">${a.created_at ? new Date(a.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—'}</span></div>
                        <div class="ops-modal-detail"><span class="label">Description</span><span class="value">${a.issue_description||'—'}</span></div>
                    </div>

                    <div style="margin-top:16px;">
                        <div style="font-size:10px;letter-spacing:2px;color:var(--text-dim);text-transform:uppercase;margin-bottom:10px;">INSPECTIONS (${inspections.length})</div>
                        ${inspections.length === 0 ? '<div style="color:var(--text-dim);font-size:11px;padding:12px 0;">No inspections scheduled yet</div>' : `
                        <table class="ops-table" style="font-size:11px;"><thead><tr><th>ID</th><th>Status</th><th>Date</th><th>Team</th><th>Risk</th><th>Score</th></tr></thead><tbody>
                        ${inspections.map(i => `<tr>
                            <td style="font-size:10px;">${i.inspection_id}</td>
                            <td>${inspBadge(i.status)}</td>
                            <td>${i.scheduled_date ? new Date(i.scheduled_date).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '—'}</td>
                            <td>${i.assigned_team||'—'}</td>
                            <td>${i.flood_risk_level ? urgencyBadge(i.flood_risk_level) : '—'}</td>
                            <td>${i.drainage_condition_score ? i.drainage_condition_score+'/10' : '—'}</td>
                        </tr>`).join('')}
                        </tbody></table>`}
                    </div>

                    ${quotes.length > 0 ? `
                    <div style="margin-top:16px;">
                        <div style="font-size:10px;letter-spacing:2px;color:var(--text-dim);text-transform:uppercase;margin-bottom:10px;">QUOTES (${quotes.length})</div>
                        <table class="ops-table" style="font-size:11px;"><thead><tr><th>Quote</th><th>Monthly</th><th>Status</th></tr></thead><tbody>
                        ${quotes.map(q => `<tr><td style="font-size:10px;">${q.quote_id}</td><td>₦${Number(q.total_monthly||0).toLocaleString()}</td><td>${pipelineBadge(q.status)}</td></tr>`).join('')}
                        </tbody></table>
                    </div>` : ''}

                    ${invoices.length > 0 ? `
                    <div style="margin-top:16px;">
                        <div style="font-size:10px;letter-spacing:2px;color:var(--text-dim);text-transform:uppercase;margin-bottom:10px;">INVOICES (${invoices.length})</div>
                        <table class="ops-table" style="font-size:11px;"><thead><tr><th>Invoice</th><th>Amount</th><th>Payment</th><th>Due</th></tr></thead><tbody>
                        ${invoices.map(inv => `<tr>
                            <td style="font-size:10px;">${inv.invoice_id}</td>
                            <td>₦${Number(inv.total_amount||0).toLocaleString()}</td>
                            <td><span class="status-badge ${{pending:'watch',partial:'warning',paid:'nominal',overdue:'critical',cancelled:'offline'}[inv.payment_status]||'offline'}">${inv.payment_status}</span></td>
                            <td>${inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '—'}</td>
                        </tr>`).join('')}
                        </tbody></table>
                    </div>` : ''}
                `, viewActions);
        } catch (err) {
            console.error('View area error:', err);
            OpsModal.toast('Failed to load area details', 'error');
        }
    }

    async function editArea(propertyId) {
        try {
            const res = await OpsModal.apiGet('/properties/' + propertyId);
            const a = res.data;
            OpsModal.open('Edit Area: ' + (a.property_name||''), `
                    ${OpsModal.field('Area Name', 'property_name', 'text', a.property_name||'')}
                    ${OpsModal.row([
                        OpsModal.field('Type', 'property_type', 'select', a.property_type||'', { options: [
                            {value:'',label:'Select type...'},{value:'residential_estate',label:'Residential Estate'},
                            {value:'commercial_complex',label:'Commercial Complex'},{value:'industrial_park',label:'Industrial Park'},
                            {value:'mixed_use',label:'Mixed Use'},{value:'individual_building',label:'Individual Building'}
                        ]}),
                        OpsModal.field('Urgency', 'urgency_level', 'select', a.urgency_level||'', { options: [
                            {value:'',label:'—'},{value:'low',label:'Low'},{value:'medium',label:'Medium'},{value:'high',label:'High'},{value:'critical',label:'Critical'}
                        ]})
                    ])}
                    ${OpsModal.field('Location', 'location', 'text', a.location||'')}
                    ${OpsModal.row([
                        OpsModal.field('City', 'city', 'text', a.city||''),
                        OpsModal.field('State', 'state', 'text', a.state||'')
                    ])}
                    ${OpsModal.row([
                        OpsModal.field('Coverage Area', 'coverage_area', 'text', a.coverage_area||''),
                        OpsModal.field('Pipeline Status', 'status', 'select', a.status||'submitted', { options: [
                            {value:'submitted',label:'Submitted'},{value:'inspection_scheduled',label:'Inspection Scheduled'},
                            {value:'inspection_ongoing',label:'Inspection Ongoing'},{value:'report_ready',label:'Report Ready'},
                            {value:'quote_sent',label:'Quote Sent'},{value:'payment_pending',label:'Payment Pending'},
                            {value:'payment_completed',label:'Payment Completed'},{value:'deployment_scheduled',label:'Deployment Scheduled'},
                            {value:'active',label:'Active'},{value:'suspended',label:'Suspended'},{value:'cancelled',label:'Cancelled'}
                        ]})
                    ])}
                    ${OpsModal.field('Notes', 'notes', 'textarea', a.notes||'')}
                `, [
                    { label: 'Cancel', onclick: 'OpsModal.close()', class: 'btn-ghost' },
                    { label: 'Save Changes', onclick: "OpsProperties.saveArea('"+propertyId+"')", class: 'btn-primary' }
                ]);
        } catch(e) { OpsModal.toast('Failed to load area', 'error'); }
    }

    async function saveArea(propertyId) {
        const data = OpsModal.getFormData();
        try {
            await OpsModal.apiPut('/properties/' + propertyId, data);
            OpsModal.close();
            OpsModal.toast('Area updated', 'success');
            const container = document.getElementById('content-properties');
            if (container) { container.removeAttribute('data-rendered'); render(container); }
        } catch (err) { OpsModal.toast('Failed to update area', 'error'); }
    }

    function scheduleInspection(propertyId, areaName) {
        OpsModal.open('Schedule Inspection: ' + areaName, `
                ${OpsModal.field('Scheduled Date', 'scheduled_date', 'date', '')}
                ${OpsModal.row([
                    OpsModal.field('Start Time', 'scheduled_time_start', 'time', ''),
                    OpsModal.field('End Time', 'scheduled_time_end', 'time', '')
                ])}
                ${OpsModal.field('Assigned Team', 'assigned_team', 'text', '', {placeholder: 'e.g. Alpha Team'})}
                ${OpsModal.field('Agent Name', 'assigned_agent_name', 'text', '')}
                ${OpsModal.field('Agent Email', 'assigned_agent_email', 'text', '', {placeholder: 'agent@flowguard.ng'})}
                <input type="hidden" name="property_id" value="${propertyId}">
            `, [
                { label: 'Cancel', onclick: 'OpsModal.close()', class: 'btn-ghost' },
                { label: 'Schedule', onclick: "OpsProperties.createInspection('"+propertyId+"')", class: 'btn-primary' }
            ]);
    }

    async function createInspection(propertyId) {
        const data = OpsModal.getFormData();
        data.property_id = propertyId;
        try {
            await OpsModal.apiPost('/inspections', data);
            OpsModal.close();
            OpsModal.toast('Inspection scheduled!', 'success');
            const container = document.getElementById('content-properties');
            if (container) { container.removeAttribute('data-rendered'); render(container); }
        } catch (err) { OpsModal.toast('Failed to schedule inspection', 'error'); }
    }

    async function deleteArea(propertyId) {
        if (!confirm('Delete this area? This cannot be undone.')) return;
        try {
            await OpsModal.apiDelete('/properties/' + propertyId);
            OpsModal.toast('Area deleted', 'success');
            const container = document.getElementById('content-properties');
            if (container) { container.removeAttribute('data-rendered'); render(container); }
        } catch (err) { OpsModal.toast('Failed to delete area', 'error'); }
    }

    return { render, viewArea, editArea, saveArea, scheduleInspection, createInspection, deleteArea };
})();