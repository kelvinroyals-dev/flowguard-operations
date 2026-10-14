// ============================================
// OPS CENTER — FIELD REPORTS MODULE
// neon.flowguard.ng
//
// Replaces the hardcoded OpsAlerts stub.
// Drop this file alongside the other ops-*.js modules.
// Load order in index.html: after ops-modal.js
//
// Registers as: OpsFieldReports
// Exposes: render(container), refresh()
//
// Also exports: OpsAlerts.render(container) — real live data,
//   replaces the hardcoded DEMO_ALERTS version in ops-alerts-reports.js
// ============================================

window.OpsFieldReports = (function () {
  const canMng = () => !(window.Auth && Auth.can) || Auth.can('field-reports.manage');
  function requireManage() { if (canMng()) return true; OpsModal.toast('You do not have permission to change field reports', 'watch'); return false; }
  function reviewCoverage(r) {
    const count = items => Array.isArray(items) ? String(items.length) : 'Not supplied';
    return `<div class="report-review-facts">${OpsModal.fact('Photos returned',count(r.photos))}${OpsModal.fact('Attachments returned',count(r.attachments))}${OpsModal.fact('Visit date',r.visit_date ? OpsModal.fmtDate(r.visit_date) : 'Not supplied')}</div><div class="capability-note">Report approval reviews this document; it does not verify completion of a linked work order. Review findings, recommendations and evidence before approving or sharing.</div>`;
  }

    // ── State ──────────────────────────────────────────────────────────────

    let _container  = null;
    let _unsaved = false;
    function confirmLeave(next) {
        if (!_unsaved) return true;
        OpsModal.confirm('Discard unsaved report edits?',()=>{OpsModal.close();_unsaved=false;next();});
        return false;
    }
    window.addEventListener('beforeunload',event=>{if (_unsaved) {event.preventDefault();event.returnValue='';}});
    let _reports    = [];
    let _filterStatus = 'all';
    let _filterType   = 'all';
    let _searchTerm   = '';
    let _wsSocket     = null;

    // ── Render entry point ────────────────────────────────────────────────

    async function render(container) {
        _container = container;
        container.innerHTML = _skeleton();
        await _loadAll();
        _bindControls();
        _subscribeWS();
    }

    function _skeleton() {
        return `
        <div class="fg-module" id="fgr-root">

          <!-- Header -->
          ${OpsModal.pageHeader({title:'Field reports',subtitle:'Review inspection findings, evidence and client delivery',actions:`<div class="fg-page-actions">
              <div class="fg-ws-badge" id="fgr-ws-badge">
                <span class="fg-ws-dot" id="fgr-ws-dot"></span>
                <span id="fgr-ws-lbl">${window.FG_LOCAL_PREVIEW ? 'Sample data' : 'Loading'}</span>
              </div>
              <button class="fg-action" onclick="OpsFieldReports.refresh()">
                ${OpsModal.actionIcon('refresh')}
                Refresh
              </button>
            </div>`})}

          <div class="lv-wrap">
            <div class="lv-toolbar">
              <div class="lv-search">
                ${OpsModal.actionIcon("search")}
                <input id="fgr-search" aria-label="Search field reports" placeholder="Search field reports…" oninput="OpsFieldReports.search(this.value)">
              </div>
              <div class="lv-toolbar-right">
                <select aria-label="Field report state" class="um-filter" id="fgr-filter-status">
                  <option value="all">All statuses</option>
                  <option value="submitted">Awaiting review</option>
                  <option value="under_review">Under review</option>
                  <option value="approved">Approved</option>
                  <option value="sent_to_client">Sent to client</option>
                  <option value="draft">Draft</option>
                  <option value="rejected">Rejected</option>
                </select>
                <select aria-label="Field report type" class="um-filter" id="fgr-filter-type">
                  <option value="all">All types</option>
                  <option value="incident">Incident</option>
                  <option value="inspection">Inspection</option>
                  <option value="general">General</option>
                  <option value="backup_request">Backup request</option>
                </select>
              </div>
            </div>
            <div id="fgr-list"></div>
          </div>

        </div>`;
    }

    // ── Data loading ──────────────────────────────────────────────────────

    async function _loadAll() {
        _setListLoading();
        try {
            const rRes = await OpsModal.apiGet('/field-reports?limit=200');
            _reports = OpsModal.readArray(rRes,'Field report feed');
            OpsModal.updateNavCount('field-reports',OpsModal.scopeCount(_reports,'field-reports'));
            _renderList();
        } catch (e) {
            OpsModal.updateNavCount('field-reports',null);
            _setListError(e.message);
        }
    }

    async function refresh() {
        if (!confirmLeave(refresh)) return;
        await _loadAll();
        OpsModal.toast('Reports refreshed', 'nominal');
    }

    // ── List render ───────────────────────────────────────────────────────

    function _renderList() {
        const list = document.getElementById('fgr-list');
        if (!list) return;

        let filtered = _reports.filter(r => {
            if (_filterStatus !== 'all' && r.status !== _filterStatus) return false;
            if (_filterType   !== 'all' && r.report_type !== _filterType) return false;
            if (_searchTerm && !(`${r.report_id} ${r.submitted_by_name || ''} ${r.property_name || r.site_name || ''} ${r.title || ''}`.toLowerCase().includes(_searchTerm))) return false;
            return true;
        });

        if (filtered.length === 0) {
            list.innerHTML = OpsModal.emptyState(OpsModal.entityIcon('field-reports'),_reports.length?'No matching field reports':'No field reports returned',_reports.length?'Change the search, state or report-type filter to review other returned reports.':'No field-report records were returned by this feed.');
            return;
        }

        const fmt = d => OpsModal.fmtDate(d);
        list.innerHTML = `
          <div class="lv-scroll"><table class="lv-table fg-mobile-cards">
            <thead><tr><th scope="col">Report</th><th scope="col">Engineer</th><th scope="col">Estate</th><th scope="col">Visit date</th><th scope="col">Type</th><th scope="col">Status</th></tr></thead>
            <tbody>
              ${filtered.map(r => {
                const eng = r.submitted_by_name || '—';
                return `<tr class="clickable" onclick="OpsFieldReports.openReport('${OpsModal.sid(r.report_id)}')">
                  <td data-label="Report">
                    <div class="lv-name-cell">
                      <div class="lv-avatar" aria-hidden="true">${OpsModal.entityIcon('field-reports')}</div>
                      <div style="min-width:0;"><button type="button" class="record-link lv-name" onclick="event.stopPropagation();OpsFieldReports.openReport('${OpsModal.sid(r.report_id)}')">${_esc(r.title || 'Inspection report')}</button><span class="lv-source lv-mono">${_esc(r.report_id)}</span></div>
                    </div>
                  </td>
                  <td data-label="Engineer"><div class="lv-name" style="font-weight:500;">${_esc(eng)}</div>${r.team_name ? `<div class="lv-source">${_esc(r.team_name)}</div>` : ''}</td>
                  <td data-label="Estate"><span class="fg-cell-copy">${_esc(r.property_name || r.site_name || '—')}</span></td>
                  <td data-label="Visit date" class="lv-mono">${fmt(r.visit_date || r.created_at)}</td>
                  <td data-label="Type">${OpsModal.detailPill(_esc(OpsModal.label(r.report_type)), 'neutral')}</td>
                  <td data-label="Status">${OpsModal.status(r.status,_statusLabel(r.status))}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table></div>`;
    }

    // ── Report detail modal ───────────────────────────────────────────────

    async function openReport(reportId) {
        if (!confirmLeave(()=>openReport(reportId))) return;
        if (_container) _container.innerHTML = '<div style="padding:60px;text-align:center;color:var(--ink-3);"><div class="loading" style="margin:0 auto 12px;"></div>Loading report…</div>';
        try {
            const res = await OpsModal.apiGet(`/field-reports/${reportId}`);
            _renderReportModal(OpsModal.readRecord(res,'Field report'));
        } catch (e) {
            if (_container) _container.innerHTML = OpsModal.recordFailure('Field report',e,`OpsFieldReports.openReport('${OpsModal.sid(reportId)}')`,'OpsFieldReports.back()');
        }
    }

    function _renderReportModal(r) {
        const _mng = canMng();
        const canEdit   = _mng && ['draft','submitted', 'under_review','rejected'].includes(r.status);
        const isReviewer = ['admin','super_admin','operations_manager'].includes(Auth.getRole());
        const canSend   = _mng && isReviewer && r.status === 'approved';
        const canReview = _mng && r.status === 'submitted';
        const canApprove= _mng && isReviewer && r.status === 'under_review';

        const auditHtml = !Array.isArray(r.edit_history) ? '<div class="capability-note">Edit history was not supplied with this report.</div>' : r.edit_history.length > 0
            ? r.edit_history.map(e => `
                <div class="audit-row">
                  <div class="audit-meta">
                    <strong>${_esc(e.editor_name)}</strong>
                    <span class="audit-role">${_esc(OpsModal.label(e.editor_role))}</span>
                    <span class="audit-time">${_ageStr(e.edited_at)}</span>
                  </div>
                  <div class="audit-change">
                    Changed <strong>${_esc(OpsModal.label(e.field_changed))}</strong>
                    from <span class="audit-old">${_esc(e.old_value == null ? 'Not recorded' : String(e.old_value))}</span>
                    to <span class="audit-new">${_esc(e.new_value == null ? 'Not recorded' : String(e.new_value))}</span>
                  </div>
                  ${e.edit_note ? `<div class="audit-note">Note: ${_esc(e.edit_note)}</div>` : ''}
                </div>`
            ).join('')
            : OpsModal.emptyState('','No report edits returned','The supplied report edit history is empty.');

        const fieldsBody = `
          <div class="report-reading">
            ${[['Summary',r.summary],['Findings',r.findings],['Recommendations',r.recommendations],['Materials used',r.materials_used]].map(([label,value]) => OpsModal.textBlock(label,value)).join('')}
          </div>
          ${canEdit ? '<details class="capability-note"><summary>Edit report narrative</summary>' : '<div hidden>'}
          <div id="rd-fields">
            ${_editableField('rd-title',           'Title',           r.title,           'input',    !canEdit)}
            ${_editableField('rd-summary',         'Summary',         r.summary,         'textarea', !canEdit)}
            ${_editableField('rd-findings',        'Findings',        r.findings,        'textarea', !canEdit)}
            ${_editableField('rd-recommendations', 'Recommendations', r.recommendations, 'textarea', !canEdit)}
            ${_editableField('rd-materials',       'Materials used',  r.materials_used,  'input',    !canEdit)}
            ${_editableField('rd-internal-notes',  'Internal notes (not shown to client)', r.internal_notes, 'textarea', !canEdit)}
          </div>
          ${canEdit ? `
          <div id="rd-save-row" style="display:flex;gap:8px;margin-top:4px;">
            <input type="text" id="rd-edit-note" class="ops-input" aria-label="Reason for edit (optional)" placeholder="Reason for edit (optional)" style="flex:1;">
            <button class="primary fg-action fg-action-primary" onclick="OpsFieldReports.saveEdits('${r.report_id}')">Save report edits</button>
          </div>` : ''}${canEdit ? '</details>' : '</div>'}`;

        const actions = [];
        if (_mng && ['draft','rejected'].includes(r.status)) actions.push({ label: 'Submit for review', cls: 'fgd-btn primary fg-action fg-action-primary', onclick: `OpsFieldReports.updateStatus('${r.report_id}','under_review')` });
        if (canReview)  actions.push({ label: 'Mark under review', cls: 'fgd-btn primary fg-action fg-action-primary', onclick: `OpsFieldReports.updateStatus('${r.report_id}','under_review')` });
        if (canApprove) actions.push({ label: 'Approve report', cls: 'fgd-btn primary', onclick: `OpsFieldReports.updateStatus('${r.report_id}','approved')` });
        if (canApprove) actions.push({ label: 'Reject', cls: 'fgd-btn danger', onclick: `OpsFieldReports.updateStatus('${r.report_id}','rejected')` });
        if (canSend)    actions.push({ label: 'Share in client portal', cls: 'fgd-btn primary', onclick: `OpsFieldReports.sendToClient('${r.report_id}')`, id: 'rd-send-btn' });
        const headerBtns = actions.map(a => `<button class="${a.cls}" ${a.id ? `id="${a.id}"` : ''} onclick="${a.onclick}">${a.label}</button>`).join('');

        const statusCls = OpsModal.statusTone(r.status);
        const F = OpsModal.fact, E = OpsModal.emptyState;
        const propCell = r.property_id ? OpsModal.link('properties', r.property_id, r.property_name || r.property_id) : (r.property_name ? _esc(r.property_name) : null);

        const sidebar = `
          <div class="fgd-card">
            <div class="fgd-card-head"><h2>Review history</h2></div>
            ${F('Created', OpsModal.fmtDateTime(r.created_at))}
            ${F('Reviewed', r.reviewed_at ? OpsModal.fmtDateTime(r.reviewed_at) : 'Not recorded')}
            ${F('Shared with client', r.sent_at ? OpsModal.fmtDateTime(r.sent_at) : 'Not recorded')}
          </div>`;

        _container.innerHTML = OpsModal.detailShell({
            back: 'OpsFieldReports.back()',
            crumbRoot: 'Field reports',
            title: _esc(r.title || 'Report'),
            avatar:{text:OpsModal.entityIcon('field-reports')},
            chips: [{ cls: 'neutral', label: _esc(OpsModal.label(r.report_type || OpsModal.missing.absent)) }, { cls: statusCls, label: _statusLabel(r.status), dot: true }],
            meta: [['Report', r.report_id], ['By', _esc(r.submitted_by_name || '')], propCell ? ['Estate', propCell] : null, r.team_name ? ['Team', _esc(r.team_name)] : null],
            decision: [['Review state',_statusLabel(r.status)],['Reviewer',r.reviewed_by_name || 'Not supplied'],['Next step',({draft:'Submit for review',submitted:'Review findings and evidence',under_review:'Approve or return with a reason',approved:'Share the approved report',sent_to_client:'Review the published record',rejected:'Revise and resubmit'})[r.status] || 'Review record availability']],
            actions: headerBtns,
            sections: [
                { id: 'review', title: 'Review context', body: reviewCoverage(r) },
                { id: 'report', title: 'Report', body: fieldsBody },
                { id: 'evidence', title: 'Inspection evidence', state:OpsModal.collectionState(r.photos,r.attachments), body: OpsModal.evidenceGroup([['Photos',r.photos],['Supporting files',r.attachments]]) },
                { id: 'audit', title: 'Edit history', body: `<div class="audit-list" id="rd-audit-list">${auditHtml}</div>` },
            ],
            sidebar,
        });
        _unsaved = false;
        _container.querySelectorAll('input[id^="rd-"],textarea[id^="rd-"]').forEach(field=>{
            if (!field.readOnly && !field.disabled) field.addEventListener('input',()=>{_unsaved=true;});
        });
    }

    function back() { if (_container && confirmLeave(back)) render(_container); }

    function _editableField(id, label, value, type, readonly) {
        const roAttr = readonly ? 'readonly' : '';
        if (type === 'textarea') {
            return `
            <div class="ops-modal-field">
              <label class="ops-label" for="${id}">${label}</label>
              <textarea id="${id}" class="ops-input" rows="4" ${roAttr} style="resize:vertical;">${_esc(value || '')}</textarea>
            </div>`;
        }
        return `
        <div class="ops-modal-field">
          <label class="ops-label" for="${id}">${label}</label>
          <input id="${id}" type="text" class="ops-input" value="${_esc(value || '')}" ${roAttr}>
        </div>`;
    }

    // ── Actions ───────────────────────────────────────────────────────────

    async function saveEdits(reportId) {
        if (!requireManage()) return;
        const fields = {
            title:            document.getElementById('rd-title')?.value            || undefined,
            summary:          document.getElementById('rd-summary')?.value          || undefined,
            findings:         document.getElementById('rd-findings')?.value         || undefined,
            recommendations:  document.getElementById('rd-recommendations')?.value  || undefined,
            materials_used:   document.getElementById('rd-materials')?.value        || undefined,
            internal_notes:   document.getElementById('rd-internal-notes')?.value   || undefined,
        };
        const edit_note = document.getElementById('rd-edit-note')?.value || undefined;
        // Strip undefined
        const body = Object.fromEntries(Object.entries({ ...fields, edit_note }).filter(([,v]) => v !== undefined));

        OpsModal.setLoading('modal-confirm-btn', true);
        try {
            await OpsModal.apiPut(`/field-reports/${reportId}`, body);
            _unsaved = false;
            OpsModal.toast('Changes saved', 'nominal');
            back();
        } catch (e) {
            OpsModal.toast(e.message, 'critical');
        }
    }

    async function updateStatus(reportId, newStatus) {
        if (!requireManage()) return;
        if (!confirmLeave(()=>updateStatus(reportId,newStatus))) return;
        const labels = {
            under_review:   'Mark as Under review?',
            approved:       'Approve this report? Approval makes it visible in the client portal and locks the published narrative. Email delivery is not confirmed.',
            rejected:       'Reject this report?',
            submitted:      'Return to Submitted?',
        };
        OpsModal.confirm(labels[newStatus] || `Set status to ${newStatus}?`, async () => {
            if (!requireManage()) return;
            try {
                await OpsModal.apiPut(`/field-reports/${reportId}`, { status: newStatus });
                OpsModal.toast(`Report ${OpsModal.label(newStatus)}`, 'nominal');
                back();
            } catch (e) {
                OpsModal.toast(e.message, 'critical');
            }
        }, {tone:newStatus==='rejected'?'danger':'neutral',title:'Update report review',confirmLabel:({under_review:'Mark under review',approved:'Approve report',rejected:'Reject report',submitted:'Return for review'})[newStatus] || 'Update review',detail:'This changes the report review state, not the completion state of related service work.'});
    }

    async function sendToClient(reportId) {
        if (!requireManage() || !confirmLeave(()=>sendToClient(reportId))) return;
        OpsModal.confirm('Send this report to the client? This will make it visible on their portal.', async () => {
            if (!requireManage()) return;
            OpsModal.setLoading('rd-send-btn', true);
            try {
                const result = await OpsModal.apiPost(`/field-reports/${reportId}/send-to-client`, {});
                if (!result?.data?.shared || !result.data.sent_to_client_at) throw new Error('Report sharing was not confirmed');
                OpsModal.toast('Report shared in client portal; email delivery is not confirmed', 'nominal');
                back();
            } catch (e) {
                OpsModal.toast(e.message, 'critical');
            }
        }, {tone:'neutral',title:'Share report',confirmLabel:'Share in client portal',detail:'This exposes the report to the client. It does not confirm email delivery.'});
    }

    // ── Filter binding ────────────────────────────────────────────────────

    function _bindControls() {
        const statusSel = document.getElementById('fgr-filter-status');
        const typeSel   = document.getElementById('fgr-filter-type');
        if (statusSel) statusSel.addEventListener('change', e => { _filterStatus = e.target.value; _renderList(); });
        if (typeSel)   typeSel.addEventListener('change',   e => { _filterType   = e.target.value; _renderList(); });

        // Stat card click filters
        document.querySelectorAll('[data-filter-status]').forEach(card => {
            card.addEventListener('click', () => {
                const s = card.dataset.filterStatus;
                _filterStatus = (_filterStatus === s) ? 'all' : s;
                if (statusSel) statusSel.value = _filterStatus;
                _renderList();
            });
        });
    }

    // ── WebSocket ─────────────────────────────────────────────────────────

    function _subscribeWS() {
        if (typeof io === 'undefined') return;
        try {
            const token = OpsModal._getToken ? OpsModal._getToken() : (sessionStorage.getItem('token') || localStorage.getItem('token'));
            const socket = io(CONFIG.WS_URL || CONFIG.API_BASE.replace('/api/v1',''), {
                auth: { token },
                transports: ['websocket','polling']
            });
            socket.on('connect', () => {
                _setWsDot('err');
                socket.timeout(5000).emit('subscribe', 'reports', (err, result) => {
                    if (socket === _wsSocket) _setWsDot(!err && result?.ok === true && socket.connected ? 'ok' : 'err');
                });
            });
            socket.on('disconnect',    () => _setWsDot('err'));
            socket.on('connect_error', () => _setWsDot('err'));

            socket.on('report:new',     async () => { await _loadAll(); OpsModal.toast('New field report received', 'watch'); });
            socket.on('report:updated', async () => { await _loadAll(); });
            socket.on('report:sent',    async () => { await _loadAll(); OpsModal.toast('Report sent to client', 'nominal'); });

            _wsSocket = socket;
        } catch(e) {
            console.warn('OpsFieldReports WS failed:', e.message);
        }
    }

    function _setWsDot(state) {
        const dot = document.getElementById('fgr-ws-dot');
        const lbl = document.getElementById('fgr-ws-lbl');
        if (dot) { dot.className = 'fg-ws-dot ' + state; }
        if (lbl) { lbl.textContent = state === 'ok' ? 'Live' : state === 'err' ? 'Offline' : 'Connecting'; }
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    function _esc(s) {
        return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function _ageStr(ts) { return OpsModal.relativeTime(ts); }

    function _statusLabel(s) {
        return ({draft:'Draft',submitted:'Awaiting review',under_review:'Under review',approved:'Approved',sent_to_client:'Sent to client',rejected:'Rejected'})[s] || OpsModal.label(s);
    }

    function _setListLoading() {
        const list = document.getElementById('fgr-list');
        if (list) list.innerHTML = OpsModal.loading('Loading field reports…');
    }

    function _setListError(msg) {
        const list = document.getElementById('fgr-list');
        if (list) list.innerHTML = OpsModal.failure('Field reports',{message:msg},"reloadTab('field-reports')");
    }

    // ── Public ────────────────────────────────────────────────────────────

    function search(v) { _searchTerm = (v || '').trim().toLowerCase(); _renderList(); }
    return { render, refresh, search, openReport, back, saveEdits, updateStatus, sendToClient, confirmLeave };

})();

// Both global access paths use the canonical incident module and its permissions.
if (typeof OpsAlerts !== 'undefined') window.OpsAlerts = OpsAlerts;
