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

    // ── State ──────────────────────────────────────────────────────────────

    let _container  = null;
    let _reports    = [];
    let _teams      = [];
    let _filterStatus = 'all';
    let _filterType   = 'all';
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
          <div class="fg-module-header">
            <div>
              <h2 class="fg-module-title">Field Reports</h2>
              <p class="fg-module-sub">Reports submitted by field technicians. Review, edit, and send to clients.</p>
            </div>
            <div style="display:flex;gap:10px;align-items:center;">
              <div class="fg-ws-badge" id="fgr-ws-badge">
                <span class="fg-ws-dot" id="fgr-ws-dot"></span>
                <span id="fgr-ws-lbl">Live</span>
              </div>
              <button class="btn-ghost" onclick="OpsFieldReports.refresh()">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                Refresh
              </button>
            </div>
          </div>

          <!-- Counters -->
          <div class="fg-stat-row" id="fgr-stats">
            <div class="fg-stat-card" data-filter-status="submitted">
              <div class="fg-stat-label">Awaiting Review</div>
              <div class="fg-stat-value" id="fgr-ct-submitted">—</div>
            </div>
            <div class="fg-stat-card" data-filter-status="under_review">
              <div class="fg-stat-label">Under Review</div>
              <div class="fg-stat-value" id="fgr-ct-review">—</div>
            </div>
            <div class="fg-stat-card" data-filter-status="approved">
              <div class="fg-stat-label">Approved</div>
              <div class="fg-stat-value" id="fgr-ct-approved">—</div>
            </div>
            <div class="fg-stat-card" data-filter-status="sent_to_client">
              <div class="fg-stat-label">Sent to Client</div>
              <div class="fg-stat-value" id="fgr-ct-sent">—</div>
            </div>
            <div class="fg-stat-card" data-filter-status="draft">
              <div class="fg-stat-label">Drafts</div>
              <div class="fg-stat-value" id="fgr-ct-draft">—</div>
            </div>
          </div>

          <!-- Filters -->
          <div class="fg-filter-bar" id="fgr-filters">
            <div class="fg-filter-group">
              <label class="fg-filter-label">Status</label>
              <select class="fg-filter-select" id="fgr-filter-status">
                <option value="all">All Statuses</option>
                <option value="submitted">Awaiting Review</option>
                <option value="under_review">Under Review</option>
                <option value="approved">Approved</option>
                <option value="sent_to_client">Sent to Client</option>
                <option value="draft">Draft</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div class="fg-filter-group">
              <label class="fg-filter-label">Type</label>
              <select class="fg-filter-select" id="fgr-filter-type">
                <option value="all">All Types</option>
                <option value="incident">Incident</option>
                <option value="inspection">Inspection</option>
                <option value="general">General</option>
                <option value="backup_request">Backup Request</option>
              </select>
            </div>
          </div>

          <!-- List -->
          <div id="fgr-list"></div>

        </div>`;
    }

    // ── Data loading ──────────────────────────────────────────────────────

    async function _loadAll() {
        _setListLoading();
        try {
            const [rRes, tRes] = await Promise.all([
                OpsModal.apiGet('/field-reports?limit=200'),
                OpsModal.apiGet('/teams').catch(() => ({ data: [] }))
            ]);
            _reports = rRes.data || [];
            _teams   = tRes.data || [];
            _updateCounters();
            _renderList();
        } catch (e) {
            _setListError(e.message);
        }
    }

    async function refresh() {
        await _loadAll();
        OpsModal.toast('Reports refreshed', 'nominal');
    }

    // ── Counters ──────────────────────────────────────────────────────────

    function _updateCounters() {
        const ct = { submitted: 0, under_review: 0, approved: 0, sent_to_client: 0, draft: 0 };
        _reports.forEach(r => { if (ct[r.status] !== undefined) ct[r.status]++; });
        document.getElementById('fgr-ct-submitted') && (document.getElementById('fgr-ct-submitted').textContent = ct.submitted);
        document.getElementById('fgr-ct-review')    && (document.getElementById('fgr-ct-review').textContent    = ct.under_review);
        document.getElementById('fgr-ct-approved')  && (document.getElementById('fgr-ct-approved').textContent  = ct.approved);
        document.getElementById('fgr-ct-sent')      && (document.getElementById('fgr-ct-sent').textContent      = ct.sent_to_client);
        document.getElementById('fgr-ct-draft')     && (document.getElementById('fgr-ct-draft').textContent     = ct.draft);
    }

    // ── List render ───────────────────────────────────────────────────────

    function _renderList() {
        const list = document.getElementById('fgr-list');
        if (!list) return;

        let filtered = _reports.filter(r => {
            if (_filterStatus !== 'all' && r.status !== _filterStatus) return false;
            if (_filterType   !== 'all' && r.report_type !== _filterType) return false;
            return true;
        });

        if (filtered.length === 0) {
            list.innerHTML = `
              <div class="fg-empty-state">
                <div class="fg-empty-icon">
                  <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                </div>
                <div class="fg-empty-title">No reports found</div>
                <div class="fg-empty-sub">Field reports will appear here when submitted by technicians.</div>
              </div>`;
            return;
        }

        const statusMeta = {
            draft: { label: 'Draft', cls: 'badge-off' }, submitted: { label: 'Awaiting Review', cls: 'badge-warn' },
            under_review: { label: 'Under Review', cls: 'badge-watch' }, approved: { label: 'Approved', cls: 'badge-ok' },
            sent_to_client: { label: 'Sent to Client', cls: 'badge-sent' }, rejected: { label: 'Rejected', cls: 'badge-err' },
        };
        const typeMeta = {
            incident: { label: 'Incident' }, inspection: { label: 'Inspection' }, general: { label: 'General' }, backup_request: { label: 'Backup Request' },
        };
        const fmt = d => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
        // Columns per spec: Report ID, Engineer, Property, Visit Date, Report Type, Status
        list.innerHTML = `
          <style>.ops-table tbody tr.clickable{cursor:pointer;transition:background .12s;} .ops-table tbody tr.clickable:hover{background:var(--surface-2,#f2f8fb);}</style>
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r,14px);overflow:hidden;box-shadow:var(--sh-xs);">
            <div style="overflow-x:auto;">
              <table class="ops-table">
                <thead><tr><th>Report ID</th><th>Engineer</th><th>Property</th><th>Visit Date</th><th>Report Type</th><th>Status</th></tr></thead>
                <tbody>
                  ${filtered.map(r => {
                    const sm = statusMeta[r.status] || { label: r.status, cls: 'badge-off' };
                    const tm = typeMeta[r.report_type] || { label: r.report_type || '—' };
                    return `<tr class="clickable" onclick="OpsFieldReports.openReport('${r.report_id}')" tabindex="0" onkeydown="if(event.key==='Enter'){OpsFieldReports.openReport('${r.report_id}')}">
                      <td style="font-family:var(--ff-m);font-size:var(--fs-sm);" class="bright">${r.report_id}</td>
                      <td style="font-size:var(--fs-sm);">${_esc(r.submitted_by_name || '—')}</td>
                      <td style="font-size:var(--fs-sm);">${_esc(r.property_name || r.site_name || '—')}</td>
                      <td style="font-size:var(--fs-sm);font-family:var(--ff-m);">${fmt(r.visit_date || r.created_at)}</td>
                      <td style="font-size:var(--fs-sm);">${tm.label}</td>
                      <td><span class="fg-status-badge ${sm.cls}">${sm.label}</span></td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>`;
    }

    function _reportCard(r) {
        const statusMeta = {
            draft:          { label: 'Draft',           cls: 'badge-off'    },
            submitted:      { label: 'Awaiting Review', cls: 'badge-warn'   },
            under_review:   { label: 'Under Review',    cls: 'badge-watch'  },
            approved:       { label: 'Approved',        cls: 'badge-ok'     },
            sent_to_client: { label: 'Sent to Client',  cls: 'badge-sent'   },
            rejected:       { label: 'Rejected',        cls: 'badge-err'    },
        };
        const typeMeta = {
            incident:       { label: 'Incident',        cls: 'type-incident'  },
            inspection:     { label: 'Inspection',      cls: 'type-inspection'},
            general:        { label: 'General',         cls: 'type-general'   },
            backup_request: { label: 'Backup Request',  cls: 'type-backup'    },
        };
        const sm = statusMeta[r.status] || { label: r.status, cls: 'badge-off' };
        const tm = typeMeta[r.report_type] || { label: r.report_type, cls: 'type-general' };
        const ago = _ageStr(r.created_at);
        const title = r.title || '(Untitled report)';
        const context = r.property_name || r.site_name || r.alert_type || '';
        const edits = r.edit_count > 0 ? `<span class="fg-edit-badge">${r.edit_count} edit${r.edit_count > 1 ? 's' : ''}</span>` : '';
        const needsAction = r.status === 'submitted' || r.status === 'approved';

        return `
        <div class="fg-report-card ${needsAction ? 'fg-report-card--action' : ''}" role="button" tabindex="0" aria-label="Open report: ${_esc(title)}"
          onclick="OpsFieldReports.openReport('${r.report_id}')"
          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();OpsFieldReports.openReport('${r.report_id}')}">
          <div class="fg-rc-header">
            <div class="fg-rc-badges">
              <span class="fg-type-badge ${tm.cls}">${tm.label}</span>
              <span class="fg-status-badge ${sm.cls}">${sm.label}</span>
              ${edits}
            </div>
            <span class="fg-rc-age">${ago}</span>
          </div>
          <div class="fg-rc-title">${_esc(title)}</div>
          ${context ? `<div class="fg-rc-context">${_esc(context)}</div>` : ''}
          <div class="fg-rc-footer">
            <span class="fg-rc-author">
              <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
              ${_esc(r.submitted_by_name || 'Unknown')}
              ${r.team_name ? '· ' + _esc(r.team_name) : ''}
            </span>
            <span class="fg-rc-id">${r.report_id}</span>
          </div>
        </div>`;
    }

    // ── Report detail modal ───────────────────────────────────────────────

    async function openReport(reportId) {
        if (_container) _container.innerHTML = '<div style="padding:60px;text-align:center;color:var(--ink-3);"><div class="loading" style="margin:0 auto 12px;"></div>Loading report…</div>';
        try {
            const res = await OpsModal.apiGet(`/field-reports/${reportId}`);
            _renderReportModal(res.data);
        } catch (e) {
            if (_container) _container.innerHTML = `<div style="padding:48px;text-align:center;"><div style="color:var(--err);font-weight:700;margin-bottom:8px;">${_esc(e.message)}</div><button class="btn-ghost" onclick="OpsFieldReports.back()">← Back to Field Reports</button></div>`;
        }
    }

    function _renderReportModal(r) {
        const _mng = canMng();
        const canEdit   = _mng && ['submitted', 'under_review', 'approved'].includes(r.status);
        const canSend   = _mng && r.status === 'approved';
        const canReview = _mng && r.status === 'submitted';
        const canApprove= _mng && r.status === 'under_review';

        const auditHtml = r.edit_history && r.edit_history.length > 0
            ? r.edit_history.map(e => `
                <div class="audit-row">
                  <div class="audit-meta">
                    <strong>${_esc(e.editor_name)}</strong>
                    <span class="audit-role">${_esc(e.editor_role)}</span>
                    <span class="audit-time">${_ageStr(e.edited_at)}</span>
                  </div>
                  <div class="audit-change">
                    Changed <code>${_esc(e.field_changed)}</code>
                    ${e.old_value ? `from <span class="audit-old">${_esc(e.old_value.slice(0,80))}${e.old_value.length>80?'…':''}</span>` : ''}
                    to <span class="audit-new">${_esc((e.new_value||'').slice(0,80))}${(e.new_value||'').length>80?'…':''}</span>
                  </div>
                  ${e.edit_note ? `<div class="audit-note">Note: ${_esc(e.edit_note)}</div>` : ''}
                </div>`
            ).join('')
            : '<div class="audit-empty">No edits made yet.</div>';

        const fieldsBody = `
          <div id="rd-fields">
            ${_editableField('rd-title',           'Title',           r.title,           'input',    !canEdit)}
            ${_editableField('rd-summary',         'Summary',         r.summary,         'textarea', !canEdit)}
            ${_editableField('rd-findings',        'Findings',        r.findings,        'textarea', !canEdit)}
            ${_editableField('rd-recommendations', 'Recommendations', r.recommendations, 'textarea', !canEdit)}
            ${_editableField('rd-materials',       'Materials Used',  r.materials_used,  'input',    !canEdit)}
            ${_editableField('rd-internal-notes',  'Internal Notes (not shown to client)', r.internal_notes, 'textarea', false)}
          </div>
          ${canEdit ? `
          <div id="rd-save-row" style="display:flex;gap:8px;margin-top:4px;">
            <input type="text" id="rd-edit-note" class="ops-input" placeholder="Reason for edit (optional)" style="flex:1;">
            <button class="fgd-btn primary" onclick="OpsFieldReports.saveEdits('${r.report_id}')">Save changes</button>
          </div>` : ''}`;

        const actions = [];
        if (canReview)  actions.push({ label: 'Mark under review', cls: 'fgd-btn', onclick: `OpsFieldReports.updateStatus('${r.report_id}','under_review')` });
        if (canApprove) actions.push({ label: 'Approve report', cls: 'fgd-btn primary', onclick: `OpsFieldReports.updateStatus('${r.report_id}','approved')` });
        if (canEdit)    actions.push({ label: 'Reject', cls: 'fgd-btn danger', onclick: `OpsFieldReports.updateStatus('${r.report_id}','rejected')` });
        if (canSend)    actions.push({ label: 'Send to client', cls: 'fgd-btn primary', onclick: `OpsFieldReports.sendToClient('${r.report_id}')`, id: 'rd-send-btn' });
        const headerBtns = actions.map(a => `<button class="${a.cls}" ${a.id ? `id="${a.id}"` : ''} onclick="${a.onclick}">${a.label}</button>`).join('');

        const statusCls = { approved: 'ok', sent_to_client: 'ok', submitted: 'warn', under_review: 'warn', draft: 'neutral', rejected: 'danger' }[r.status] || 'neutral';
        const F = OpsModal.fact, E = OpsModal.emptyState;
        const iImg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>';
        const iClip = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21.4 11.5l-9.2 9.2a5 5 0 01-7.1-7.1l9.2-9.2a3.5 3.5 0 015 5l-9.2 9.2a2 2 0 01-2.8-2.8l8.5-8.5"/></svg>';
        const propCell = r.property_id ? OpsModal.link('properties', r.property_id, r.property_name || r.property_id) : (r.property_name ? _esc(r.property_name) : null);

        const sidebar = `
          <div class="fgd-card">
            <div class="fgd-card-head"><h2 style="font-size:var(--fs-sm);">Quick facts</h2></div>
            ${F('Report', `<span class="fgd-mono">${r.report_id || '—'}</span>`)}
            ${F('Type', r.report_type || 'general')}
            ${F('Status', _statusLabel(r.status))}
            ${F('Submitted by', _esc(r.submitted_by_name || '—'))}
            ${F('Team', _esc(r.team_name || '—'))}
            ${F('Created', _ageStr(r.created_at))}
          </div>`;

        _container.innerHTML = OpsModal.detailShell({
            back: 'OpsFieldReports.back()',
            crumbRoot: 'Field Reports',
            title: _esc(r.title || 'Report'),
            chips: [{ cls: 'primary', label: r.report_type || 'general' }, { cls: statusCls, label: _statusLabel(r.status), dot: true }],
            meta: [['Report', r.report_id], ['By', _esc(r.submitted_by_name || '')], propCell ? ['Property', propCell] : null, r.team_name ? ['Team', _esc(r.team_name)] : null],
            actions: headerBtns,
            sections: [
                { id: 'report', title: 'Report', meta: 'inspection_reports', body: fieldsBody },
                { id: 'audit', title: 'Edit history', body: `<div class="audit-list" id="rd-audit-list">${auditHtml}</div>` },
                { id: 'photos', title: 'Photos', body: E(iImg, 'No photos', 'No photos were attached to this report.') },
                { id: 'attachments', title: 'Attachments', body: E(iClip, 'No attachments', 'No files are attached to this report.') },
            ],
            sidebar,
        });
    }

    function back() { if (_container) render(_container); }

    function _editableField(id, label, value, type, readonly) {
        const roAttr = readonly ? 'readonly style="opacity:.55;cursor:not-allowed;"' : '';
        if (type === 'textarea') {
            return `
            <div class="ops-modal-field">
              <label class="ops-label">${label}</label>
              <textarea id="${id}" class="ops-input" rows="4" ${roAttr} style="resize:vertical;">${_esc(value || '')}</textarea>
            </div>`;
        }
        return `
        <div class="ops-modal-field">
          <label class="ops-label">${label}</label>
          <input id="${id}" type="text" class="ops-input" value="${_esc(value || '')}" ${roAttr}>
        </div>`;
    }

    // ── Actions ───────────────────────────────────────────────────────────

    async function saveEdits(reportId) {
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
            OpsModal.toast('Changes saved', 'nominal');
            back();
        } catch (e) {
            OpsModal.toast(e.message, 'critical');
        }
    }

    async function updateStatus(reportId, newStatus) {
        const labels = {
            under_review:   'Mark as Under Review?',
            approved:       'Approve this report?',
            rejected:       'Reject this report?',
            submitted:      'Return to Submitted?',
        };
        OpsModal.confirm(labels[newStatus] || `Set status to ${newStatus}?`, async () => {
            try {
                await OpsModal.apiPut(`/field-reports/${reportId}`, { status: newStatus });
                OpsModal.toast(`Report ${newStatus.replace(/_/g,' ')}`, 'nominal');
                back();
            } catch (e) {
                OpsModal.toast(e.message, 'critical');
            }
        });
    }

    async function sendToClient(reportId) {
        OpsModal.confirm('Send this report to the client? This will make it visible on their portal.', async () => {
            OpsModal.setLoading('rd-send-btn', true);
            try {
                await OpsModal.apiPost(`/field-reports/${reportId}/send-to-client`, {});
                OpsModal.toast('Report sent to client', 'nominal');
                back();
            } catch (e) {
                OpsModal.toast(e.message, 'critical');
            }
        });
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
                socket.emit('subscribe', 'reports');
                _setWsDot('ok');
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

    function _ageStr(ts) {
        if (!ts) return '';
        const m = Math.floor((Date.now() - new Date(ts)) / 60000);
        if (m < 1)    return 'just now';
        if (m < 60)   return `${m}m ago`;
        if (m < 1440) return `${Math.floor(m/60)}h ago`;
        return `${Math.floor(m/1440)}d ago`;
    }

    function _statusLabel(s) {
        return ({ draft:'Draft', submitted:'Awaiting Review', under_review:'Under Review', approved:'Approved', sent_to_client:'Sent to Client', rejected:'Rejected' })[s] || s;
    }

    function _statusBadgeCls(s) {
        return ({ draft:'off', submitted:'warn', under_review:'watch', approved:'ok', sent_to_client:'sent', rejected:'err' })[s] || 'off';
    }

    function _setListLoading() {
        const list = document.getElementById('fgr-list');
        if (list) list.innerHTML = `<div class="fg-loading"><div class="fg-spinner"></div> Loading reports…</div>`;
    }

    function _setListError(msg) {
        const list = document.getElementById('fgr-list');
        if (list) list.innerHTML = `<div class="fg-empty-state"><div class="fg-empty-title">Failed to load</div><div class="fg-empty-sub">${_esc(msg)}</div></div>`;
    }

    // ── Public ────────────────────────────────────────────────────────────

    return { render, refresh, openReport, back, saveEdits, updateStatus, sendToClient };

})();


// ============================================
// OpsAlerts — LIVE REPLACEMENT
// Replaces the hardcoded DEMO_ALERTS stub in ops-alerts-reports.js
// Load AFTER ops-alerts-reports.js to override it.
// ============================================

// Override the stub OpsAlerts from ops-alerts-reports.js with live data version.
// window.OpsAlerts instead of const avoids duplicate-declaration syntax error.
window.OpsAlerts = (function () {

    async function render(container) {
        container.innerHTML = `
        <div class="fg-module" id="fga-root">
          <div class="fg-module-header">
            <div>
              <h2 class="fg-module-title">Live Alerts</h2>
              <p class="fg-module-sub">Active alerts from monitored sites. Assign teams and track resolution.</p>
            </div>
            <button class="btn-ghost" onclick="OpsAlerts.refresh()">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              Refresh
            </button>
          </div>

          <!-- Stat row -->
          <div class="fg-stat-row" id="fga-stats">
            <div class="fg-stat-card"><div class="fg-stat-label">Critical</div><div class="fg-stat-value" id="fga-ct-crit" style="color:var(--err,#dc2626);">—</div></div>
            <div class="fg-stat-card"><div class="fg-stat-label">High</div><div class="fg-stat-value" id="fga-ct-high" style="color:var(--caut,#c2410c);">—</div></div>
            <div class="fg-stat-card"><div class="fg-stat-label">Moderate</div><div class="fg-stat-value" id="fga-ct-mod" style="color:var(--warn,#b45309);">—</div></div>
            <div class="fg-stat-card"><div class="fg-stat-label">Unassigned</div><div class="fg-stat-value" id="fga-ct-unas">—</div></div>
          </div>

          <div id="fga-list"><div class="fg-loading"><div class="fg-spinner"></div> Loading…</div></div>
        </div>`;

        await _loadAlerts();
    }

    async function _loadAlerts() {
        try {
            const [alertsRes, teamsRes] = await Promise.all([
                OpsModal.apiGet('/alerts'),
                OpsModal.apiGet('/teams').catch(()=>({data:[]}))
            ]);
            const alerts = alertsRes.data || [];
            const teams  = teamsRes.data  || [];
            _updateAlertStats(alerts);
            _renderAlertList(alerts, teams);
        } catch (e) {
            const list = document.getElementById('fga-list');
            if (list) list.innerHTML = `<div class="fg-empty-state"><div class="fg-empty-title">Failed to load alerts</div><div class="fg-empty-sub">${e.message}</div></div>`;
        }
    }

    async function refresh() { await _loadAlerts(); OpsModal.toast('Alerts refreshed','nominal'); }

    function _updateAlertStats(alerts) {
        const ct = { critical:0, high:0, moderate:0, minor:0 };
        let unassigned = 0;
        alerts.forEach(a => {
            if (ct[a.severity] !== undefined) ct[a.severity]++;
            if (!a.assigned_team) unassigned++;
        });
        document.getElementById('fga-ct-crit') && (document.getElementById('fga-ct-crit').textContent = ct.critical);
        document.getElementById('fga-ct-high') && (document.getElementById('fga-ct-high').textContent = ct.high);
        document.getElementById('fga-ct-mod')  && (document.getElementById('fga-ct-mod').textContent  = ct.moderate);
        document.getElementById('fga-ct-unas') && (document.getElementById('fga-ct-unas').textContent = unassigned);
    }

    function _renderAlertList(alerts, teams) {
        const list = document.getElementById('fga-list');
        if (!list) return;

        if (alerts.length === 0) {
            list.innerHTML = `<div class="fg-empty-state"><div class="fg-empty-icon"><svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div><div class="fg-empty-title">No active alerts</div><div class="fg-empty-sub">All clear — no unresolved alerts.</div></div>`;
            return;
        }

        const sevColors = { critical:'var(--err,#dc2626)', high:'var(--caut,#c2410c)', moderate:'var(--warn,#b45309)', minor:'var(--ok,#0a8a6a)' };
        const teamOpts = teams.map(t=>`<option value="${t.name}">${t.name}</option>`).join('');

        list.innerHTML = alerts.map(a => `
        <div class="fg-alert-card sev-${a.severity||'minor'}">
          <div class="fg-ac-top">
            <span class="fg-sev-badge" style="color:${sevColors[a.severity]||sevColors.minor}">${(a.severity||'minor').toUpperCase()}</span>
            <span class="fg-ac-type">${_esc(a.alert_type||'Alert')}</span>
            <span class="fg-ac-age">${_ageStr(a.created_at)}</span>
          </div>
          <div class="fg-ac-location">${_esc(a.location || a.site_name || '—')}</div>
          ${a.description ? `<div class="fg-ac-desc">${_esc(a.description)}</div>` : ''}
          <div class="fg-ac-bottom">
            ${a.assigned_team
              ? `<span class="fg-assigned-chip">→ ${_esc(a.assigned_team)}</span>`
              : `<div style="display:flex;gap:8px;align-items:center;">
                   <select class="fg-inline-select" id="team-sel-${a.alert_id}">
                     <option value="">Assign team…</option>${teamOpts}
                   </select>
                   <button class="btn-primary btn-sm" onclick="OpsAlerts.dispatchAlert('${a.alert_id}')">Dispatch</button>
                 </div>`
            }
            <button class="btn-ghost btn-sm" onclick="OpsAlerts.resolveAlert('${a.alert_id}')">Resolve</button>
          </div>
        </div>`).join('');
    }

    async function dispatchAlert(alertId) {
        const sel = document.getElementById(`team-sel-${alertId}`);
        const teamName = sel?.value;
        if (!teamName) { OpsModal.toast('Select a team first', 'warning'); return; }
        try {
            await OpsModal.apiPut(`/alerts/${alertId}`, { assigned_team: teamName, status: 'dispatched' });

            // Create ticket
            await OpsModal.apiPost('/tickets', { alert_id: alertId, assigned_team: teamName, title: `Alert dispatched to ${teamName}` }).catch(()=>{});

            OpsModal.toast(`Dispatched to ${teamName}`, 'nominal');
            await _loadAlerts();
        } catch (e) { OpsModal.toast(e.message, 'critical'); }
    }

    async function resolveAlert(alertId) {
        OpsModal.confirm('Mark this alert as resolved?', async () => {
            try {
                await OpsModal.apiPut(`/alerts/${alertId}`, { status: 'resolved' });
                OpsModal.toast('Alert resolved', 'nominal');
                await _loadAlerts();
            } catch (e) { OpsModal.toast(e.message, 'critical'); }
        });
    }

    function _esc(s) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function _ageStr(ts) {
        if (!ts) return '';
        const m = Math.floor((Date.now()-new Date(ts))/60000);
        if (m<1) return 'just now'; if(m<60) return m+'m ago'; if(m<1440) return Math.floor(m/60)+'h ago';
        return Math.floor(m/1440)+'d ago';
    }

    return { render, refresh, dispatchAlert, resolveAlert };

})();


// ============================================
// CSS additions — inject into <head>
// Add these to your neon ops center stylesheet
// (or paste into a <style> block in index.html)
// ============================================
(function injectStyles() {
    if (document.getElementById('fg-field-reports-styles')) return;
    const style = document.createElement('style');
    style.id = 'fg-field-reports-styles';
    style.textContent = `
      .fg-module { }
      .fg-module-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:20px; gap:12px; flex-wrap:wrap; }
      .fg-module-title  { font-size:var(--fs-xl); font-weight:700; color:var(--ink,#0a1f2e); letter-spacing:-.02em; margin-bottom:3px; }
      .fg-module-sub    { font-size:var(--fs-base); color:var(--ink-3,#6b8fa3); }

      .fg-stat-row { display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:10px; margin-bottom:18px; }
      .fg-stat-card { background:var(--surface,#fff); border:1px solid var(--border,#dae6ef); border-radius:var(--r,14px); padding:14px 16px; cursor:pointer; transition:border-color .2s, box-shadow .2s; }
      .fg-stat-card:hover { border-color:var(--blue,#16a8d3); box-shadow:0 2px 8px rgba(22,168,211,.12); }
      .fg-stat-label { font-size:var(--fs-2xs); font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-3,#6b8fa3); margin-bottom:6px; }
      .fg-stat-value { font-size:var(--fs-2xl); font-weight:800; color:var(--ink,#0a1f2e); line-height:1; }

      .fg-filter-bar   { display:flex; gap:12px; margin-bottom:16px; flex-wrap:wrap; }
      .fg-filter-group { display:flex; flex-direction:column; gap:5px; }
      .fg-filter-label { font-size:var(--fs-2xs); font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-3,#6b8fa3); }
      .fg-filter-select { padding:8px 12px; border:1px solid var(--border,#dae6ef); border-radius:8px; font-size:var(--fs-base); background:var(--surface,#fff); color:var(--ink,#0a1f2e); cursor:pointer; }

      .fg-report-card { background:var(--surface,#fff); border:1px solid var(--border,#dae6ef); border-radius:var(--r,14px); padding:16px 18px; margin-bottom:10px; cursor:pointer; transition:border-color .18s, box-shadow .18s, transform .1s; }
      .fg-report-card:hover { border-color:var(--blue,#16a8d3); box-shadow:0 2px 12px rgba(22,168,211,.12); }
      .fg-report-card:active { transform:scale(0.995); }
      .fg-report-card--action { border-left:3px solid var(--blue,#16a8d3); }

      .fg-rc-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; gap:8px; flex-wrap:wrap; }
      .fg-rc-badges { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
      .fg-rc-age    { font-size:var(--fs-xs); color:var(--ink-3,#6b8fa3); font-family:var(--ff-m,'JetBrains Mono',monospace); flex-shrink:0; }
      .fg-rc-title  { font-size:var(--fs-lg); font-weight:700; color:var(--ink,#0a1f2e); margin-bottom:4px; line-height:1.3; }
      .fg-rc-context{ font-size:var(--fs-base); color:var(--ink-3,#6b8fa3); margin-bottom:10px; }
      .fg-rc-footer { display:flex; justify-content:space-between; align-items:center; font-size:var(--fs-xs); color:var(--ink-3,#6b8fa3); border-top:1px solid var(--border,#dae6ef); padding-top:10px; margin-top:8px; }
      .fg-rc-author { display:flex; align-items:center; gap:5px; }
      .fg-rc-id     { font-family:var(--ff-m,'JetBrains Mono',monospace); font-size:var(--fs-2xs); }

      .fg-edit-badge { padding:2px 8px; border-radius:10px; font-size:var(--fs-2xs); font-weight:600; background:rgba(22,168,211,.08); color:var(--blue,#16a8d3); border:1px solid rgba(22,168,211,.2); }

      /* Type badges */
      .fg-type-badge { padding:3px 9px; border-radius:20px; font-size:var(--fs-2xs); font-weight:800; letter-spacing:.8px; text-transform:uppercase; }
      .type-incident   { background:var(--eb);  color:var(--err,#dc2626); border:1px solid rgba(220,38,38,.2); }
      .type-inspection { background:rgba(22,168,211,.08); color:var(--blue,#16a8d3); border:1px solid rgba(22,168,211,.2); }
      .type-general    { background:rgba(10,31,46,.05);   color:var(--ink-2,#2d5068); border:1px solid var(--border,#dae6ef); }
      .type-backup     { background:rgba(196,130,0,.08);  color:#c48200; border:1px solid rgba(196,130,0,.2); }

      /* Status badges */
      .fg-status-badge { padding:3px 9px; border-radius:20px; font-size:var(--fs-2xs); font-weight:800; letter-spacing:.8px; text-transform:uppercase; }
      .badge-off   { background:var(--ob);  color:var(--off,#64748b); border:1px solid rgba(100,116,139,.15); }
      .badge-warn  { background:var(--wb);  color:var(--warn,#b45309); border:1px solid rgba(180,83,9,.2); }
      .badge-watch { background:var(--cb);  color:var(--caut,#c2410c); border:1px solid rgba(194,65,12,.2); }
      .badge-ok    { background:var(--ok-bg); color:var(--ok,#0a8a6a); border:1px solid rgba(10,138,106,.2); }
      .badge-sent  { background:rgba(22,168,211,.08);  color:var(--blue,#16a8d3); border:1px solid rgba(22,168,211,.2); }
      .badge-err   { background:var(--eb);  color:var(--err,#dc2626); border:1px solid rgba(220,38,38,.2); }

      /* Alert card */
      .fg-alert-card { background:var(--surface,#fff); border:1.5px solid var(--border,#dae6ef); border-radius:var(--r,14px); padding:16px 18px; margin-bottom:10px; }
      .fg-alert-card.sev-critical { border-left:4px solid var(--err,#dc2626); }
      .fg-alert-card.sev-high     { border-left:4px solid var(--caut,#c2410c); }
      .fg-alert-card.sev-moderate { border-left:4px solid var(--warn,#b45309); }
      .fg-alert-card.sev-minor    { border-left:4px solid var(--ok,#0a8a6a); }
      .fg-ac-top { display:flex; align-items:center; gap:10px; margin-bottom:8px; flex-wrap:wrap; }
      .fg-sev-badge { font-size:var(--fs-2xs); font-weight:800; letter-spacing:1.5px; }
      .fg-ac-type   { font-size:var(--fs-md); font-weight:700; color:var(--ink,#0a1f2e); flex:1; }
      .fg-ac-age    { font-size:var(--fs-xs); color:var(--ink-3,#6b8fa3); font-family:var(--ff-m,'JetBrains Mono',monospace); }
      .fg-ac-location { font-size:var(--fs-base); color:var(--ink-2,#2d5068); margin-bottom:4px; }
      .fg-ac-desc   { font-size:var(--fs-base); color:var(--ink-3,#6b8fa3); margin-bottom:10px; line-height:1.5; }
      .fg-ac-bottom { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding-top:10px; border-top:1px solid var(--border,#dae6ef); margin-top:8px; }
      .fg-assigned-chip { padding:4px 12px; border-radius:20px; font-size:var(--fs-sm); font-weight:600; background:rgba(22,168,211,.08); color:var(--blue,#16a8d3); border:1px solid rgba(22,168,211,.2); }
      .fg-inline-select { padding:7px 10px; border:1px solid var(--border,#dae6ef); border-radius:8px; font-size:var(--fs-base); background:var(--surface,#fff); color:var(--ink,#0a1f2e); }

      /* WebSocket badge */
      .fg-ws-badge { display:flex; align-items:center; gap:6px; padding:5px 10px; border-radius:20px; background:var(--surface-2,#f7fafc); border:1px solid var(--border,#dae6ef); font-size:var(--fs-xs); color:var(--ink-3,#6b8fa3); }
      .fg-ws-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
      .fg-ws-dot.ok  { background:var(--ok,#0a8a6a); box-shadow:0 0 5px rgba(10,138,106,.5); }
      .fg-ws-dot.err { background:var(--err,#dc2626); }
      .fg-ws-dot.con { background:var(--warn,#b45309); animation:dotBlink 1s infinite; }
      @keyframes dotBlink { 0%,100%{opacity:1;} 50%{opacity:.2;} }

      /* Report detail modal */
      .report-detail { }
      .rd-status-bar { display:flex; align-items:center; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
      .rd-meta { font-size:var(--fs-sm); color:var(--ink-3,#6b8fa3); }
      .rd-context-bar { display:flex; gap:16px; flex-wrap:wrap; font-size:var(--fs-base); color:var(--ink-2,#2d5068); margin-bottom:16px; padding:10px 14px; background:var(--surface-2,#f7fafc); border-radius:10px; border:1px solid var(--border,#dae6ef); }
      .rd-audit-section { margin-top:24px; padding-top:20px; border-top:1px solid var(--border,#dae6ef); }
      .rd-section-title { font-size:var(--fs-xs); font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-3,#6b8fa3); margin-bottom:12px; }
      .audit-list { display:flex; flex-direction:column; gap:8px; max-height:260px; overflow-y:auto; }
      .audit-row { padding:10px 12px; background:var(--surface-2,#f7fafc); border-radius:8px; border:1px solid var(--border,#dae6ef); font-size:var(--fs-base); }
      .audit-meta { display:flex; gap:8px; align-items:center; margin-bottom:5px; flex-wrap:wrap; }
      .audit-meta strong { color:var(--ink,#0a1f2e); }
      .audit-role { padding:1px 7px; border-radius:8px; background:rgba(22,168,211,.08); color:var(--blue,#16a8d3); font-size:var(--fs-2xs); font-weight:700; text-transform:uppercase; letter-spacing:.5px; }
      .audit-time { color:var(--ink-3,#6b8fa3); font-family:var(--ff-m,'JetBrains Mono',monospace); font-size:var(--fs-xs); }
      .audit-change { color:var(--ink-2,#2d5068); line-height:1.5; }
      .audit-change code { background:rgba(22,168,211,.08); padding:1px 5px; border-radius:4px; font-size:var(--fs-base); color:var(--blue,#16a8d3); }
      .audit-old  { text-decoration:line-through; color:var(--ink-3,#6b8fa3); }
      .audit-new  { font-weight:600; color:var(--ok,#0a8a6a); }
      .audit-note { margin-top:4px; font-style:italic; color:var(--ink-3,#6b8fa3); }
      .audit-empty { font-size:var(--fs-base); color:var(--ink-3,#6b8fa3); padding:8px 0; }

      .fg-loading { display:flex; align-items:center; gap:10px; padding:32px 20px; color:var(--ink-3,#6b8fa3); font-size:var(--fs-md); }
      .fg-spinner { width:18px; height:18px; border:2px solid var(--border,#dae6ef); border-top-color:var(--blue,#16a8d3); border-radius:50%; animation:spin .8s linear infinite; flex-shrink:0; }
      @keyframes spin { to { transform:rotate(360deg); } }
      .fg-empty-state { padding:44px 24px; text-align:center; }
      .fg-empty-icon  { margin-bottom:14px; opacity:.25; }
      .fg-empty-title { font-size:var(--fs-lg); font-weight:700; color:var(--ink,#0a1f2e); margin-bottom:6px; }
      .fg-empty-sub   { font-size:var(--fs-base); color:var(--ink-3,#6b8fa3); line-height:1.6; }
    `;
    document.head.appendChild(style);
})();
