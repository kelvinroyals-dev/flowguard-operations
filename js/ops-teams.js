// ============================================
// OPS TEAMS MODULE
// Field team dispatch and tracking
// ============================================

const OpsTeams = (function () {
  'use strict';

  let _teams = [];
  let _pg    = null;

  function render(container) {
    container.innerHTML = `
      <style>
        .tm-header {
          display: flex; align-items: flex-start;
          justify-content: space-between; margin-bottom: 20px;
        }

        .tm-header-title {
          font-family: var(--ff-d, 'Playfair Display', serif);
          font-size: 1.3rem; font-weight: 800;
          color: var(--ink, #0a1f2e); letter-spacing: -.02em; margin-bottom: 3px;
        }

        .tm-header-sub { font-size: .8rem; color: var(--ink-3, #6b8fa3); }

        .tm-stats {
          display: grid; grid-template-columns: repeat(4,1fr);
          gap: 14px; margin-bottom: 20px;
        }

        .tm-stat {
          background: var(--surface, #fff);
          border: 1px solid var(--border, #dae6ef);
          border-radius: var(--r, 10px);
          padding: 16px 18px;
          box-shadow: var(--sh-xs);
          position: relative; overflow: hidden;
          transition: all .2s;
        }

        .tm-stat:hover { transform: translateY(-2px); box-shadow: var(--sh-md); }

        .tm-stat::after {
          content: ''; position: absolute;
          bottom: 0; left: 0; right: 0; height: 2.5px;
        }

        .tm-stat.onsite::after  { background: var(--ok, #0a8a6a); }
        .tm-stat.enroute::after { background: var(--warn, #b45309); }
        .tm-stat.idle::after    { background: var(--ink-4, #9eb8c8); }
        .tm-stat.total::after   { background: linear-gradient(90deg, var(--navy, #0a2a3d), var(--blue, #16a8d3)); }

        .tm-stat-label {
          font-size: .62rem; font-weight: 700;
          letter-spacing: 1.5px; text-transform: uppercase;
          color: var(--ink-3, #6b8fa3); margin-bottom: 6px;
        }

        .tm-stat-val {
          font-family: var(--ff-d, 'Playfair Display', serif);
          font-size: 1.9rem; font-weight: 900;
          color: var(--ink, #0a1f2e); letter-spacing: -.03em; line-height: 1;
        }

        .tm-stat-val.green { color: var(--ok, #0a8a6a); }
        .tm-stat-val.amber { color: var(--warn, #b45309); }

        /* Team cards grid */
        .tm-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 14px;
        }

        .tm-card {
          background: var(--surface, #fff);
          border: 1px solid var(--border, #dae6ef);
          border-radius: var(--r, 10px);
          overflow: hidden;
          box-shadow: var(--sh-xs);
          transition: all .2s;
        }

        .tm-card:hover { box-shadow: var(--sh-md); border-color: var(--border-2, #b8d0de); }

        .tm-card-head {
          padding: 14px 16px;
          border-bottom: 1px solid var(--border, #dae6ef);
          display: flex; align-items: center; gap: 12px;
        }

        .tm-card-avatar {
          width: 40px; height: 40px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--ff-m, 'JetBrains Mono', monospace);
          font-size: .8rem; font-weight: 700; color: white;
          flex-shrink: 0;
        }

        .tm-card-name {
          font-size: .9rem; font-weight: 700;
          color: var(--ink, #0a1f2e); margin-bottom: 2px;
        }

        .tm-card-id {
          font-family: var(--ff-m, 'JetBrains Mono', monospace);
          font-size: .68rem; color: var(--ink-4, #9eb8c8);
        }

        .tm-card-body { padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }

        .tm-detail-row {
          display: flex; align-items: center;
          justify-content: space-between;
          font-size: .79rem;
        }

        .tm-detail-label { color: var(--ink-3, #6b8fa3); font-weight: 500; }
        .tm-detail-val   { color: var(--ink-2, #2d5068); font-weight: 600; text-align: right; }

        .tm-card-foot {
          padding: 10px 16px;
          border-top: 1px solid var(--border, #dae6ef);
          display: flex; gap: 6px;
        }

        /* Status dot for cards */
        .tm-status-dot {
          width: 8px; height: 8px; border-radius: 50%;
          display: inline-block; margin-right: 6px;
          vertical-align: middle;
        }

        /* Table view (fallback for many teams) */
        .tm-table-card {
          background: var(--surface, #fff);
          border: 1px solid var(--border, #dae6ef);
          border-radius: var(--r, 10px);
          overflow: hidden; box-shadow: var(--sh-xs);
        }

        .tm-table-head {
          padding: 14px 20px;
          border-bottom: 1px solid var(--border, #dae6ef);
          display: flex; align-items: center; justify-content: space-between;
        }

        .tm-table-title {
          font-family: var(--ff-d, 'Playfair Display', serif);
          font-size: .9rem; font-weight: 700; color: var(--ink, #0a1f2e);
        }
      </style>

      <div class="tm-header">
        <div>
          <div class="tm-header-title">Field Teams</div>
          <div class="tm-header-sub">Dispatch and track response teams across all active deployments</div>
        </div>
        <button class="btn-primary" onclick="OpsTeams.createTeam()">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
          Create Team
        </button>
      </div>

      <div class="tm-stats">
        <div class="tm-stat onsite">
          <div class="tm-stat-label">On Site</div>
          <div class="tm-stat-val green" id="tm-onsite">—</div>
        </div>
        <div class="tm-stat enroute">
          <div class="tm-stat-label">En Route</div>
          <div class="tm-stat-val amber" id="tm-enroute">—</div>
        </div>
        <div class="tm-stat idle">
          <div class="tm-stat-label">Idle</div>
          <div class="tm-stat-val" id="tm-idle">—</div>
        </div>
        <div class="tm-stat total">
          <div class="tm-stat-label">Total Teams</div>
          <div class="tm-stat-val" id="tm-total">—</div>
        </div>
      </div>

      <div id="tm-content">
        <div style="padding:48px;text-align:center;color:var(--ink-3);">
          <div class="loading" style="margin:0 auto 12px;"></div>
          <div style="font-size:.82rem;">Loading teams…</div>
        </div>
      </div>
    `;

    loadTeams();
  }

  async function loadTeams() {
    try {
      const res = await OpsModal.apiGet('/teams');
      _teams    = res.data || res.teams || [];
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
          <div style="color:var(--ink-3);font-size:.78rem;margin-bottom:16px;">${err.message}</div>
          <button class="btn-ghost" onclick="reloadTab('teams')">Retry</button>
        </div>`;
    }
  }

  function updateStats(teams) {
    let onsite = 0, enroute = 0, idle = 0;
    teams.forEach(t => {
      const s = (t.status || '').toLowerCase();
      if (s === 'on_site')  onsite++;
      else if (s === 'en_route') enroute++;
      else idle++;
    });
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('tm-onsite',  onsite);
    set('tm-enroute', enroute);
    set('tm-idle',    idle);
    set('tm-total',   teams.length);
  }

  function statusConfig(s) {
    const m = {
      on_site:   { label: 'On Site',   badge: 'nominal', dot: 'var(--ok, #0a8a6a)' },
      en_route:  { label: 'En Route',  badge: 'watch',   dot: 'var(--warn, #b45309)' },
      returning: { label: 'Returning', badge: 'watch',   dot: 'var(--warn, #b45309)' },
      idle:      { label: 'Idle',      badge: 'offline',  dot: 'var(--off, #64748b)' },
    };
    return m[(s || '').toLowerCase()] || m.idle;
  }

  function teamColor(name) {
    const colors = ['#0a2a3d','#0d7fa0','#16a8d3','#0a8a6a','#7c3aed','#b45309'];
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) % colors.length;
    return colors[h];
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

  function renderTeams(teams) {
    const el = document.getElementById('tm-content');
    if (!el) return;

    if (!teams || teams.length === 0) {
      el.innerHTML = `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:60px;text-align:center;color:var(--ink-3);box-shadow:var(--sh-xs);">
          <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.3" viewBox="0 0 24 24" style="margin:0 auto 14px;opacity:.25;display:block;"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0112 0v2"/></svg>
          <div style="font-size:.88rem;font-weight:600;color:var(--ink-2);margin-bottom:8px;">No teams configured</div>
          <button class="btn-primary" onclick="OpsTeams.createTeam()">Create First Team</button>
        </div>`;
      return;
    }

    el.innerHTML = `<div class="tm-grid">${teams.map(t => {
      const id   = t.team_id || t.id;
      const name = t.team_name || t.name || id || '—';
      const sc   = statusConfig(t.status);
      const color = teamColor(name);
      const initials = name.split(/[\s-]/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
      const isIdle = (t.status || '').toLowerCase() === 'idle' || !t.status;

      return `
        <div class="tm-card">
          <div class="tm-card-head">
            <div class="tm-card-avatar" style="background:${color};">${initials}</div>
            <div style="flex:1;min-width:0;">
              <div class="tm-card-name">${name}</div>
              <div class="tm-card-id">${id}</div>
            </div>
            <span class="status-badge ${sc.badge}">
              <span class="tm-status-dot" style="background:${sc.dot};"></span>
              ${sc.label}
            </span>
          </div>
          <div class="tm-card-body">
            <div class="tm-detail-row">
              <span class="tm-detail-label">Location</span>
              <span class="tm-detail-val">${t.current_location || t.location || '—'}</span>
            </div>
            <div class="tm-detail-row">
              <span class="tm-detail-label">Assigned To</span>
              <span class="tm-detail-val">${t.assigned_to || '—'}</span>
            </div>
            ${t.eta ? `
            <div class="tm-detail-row">
              <span class="tm-detail-label">ETA</span>
              <span class="tm-detail-val" style="color:var(--warn);">${t.eta} min</span>
            </div>` : ''}
            <div class="tm-detail-row">
              <span class="tm-detail-label">Last Check-in</span>
              <span class="tm-detail-val">${formatTime(t.last_checkin || t.last_check_in)}</span>
            </div>
            ${t.members_count ? `
            <div class="tm-detail-row">
              <span class="tm-detail-label">Members</span>
              <span class="tm-detail-val">${t.members_count}</span>
            </div>` : ''}
          </div>
          <div class="tm-card-foot">
            <button class="btn-ghost" onclick="OpsTeams.viewTeam('${id}')" style="flex:1;justify-content:center;font-size:.76rem;">View</button>
            <button class="btn-ghost" onclick="OpsTeams.editStatus('${id}','${name.replace(/'/g, "\\'")}')" style="flex:1;justify-content:center;font-size:.76rem;">Update Status</button>
            ${isIdle ? `
            <button class="btn-primary" onclick="OpsTeams.dispatch('${id}','${name.replace(/'/g, "\\'")}')" style="flex:1;justify-content:center;font-size:.76rem;">
              Dispatch
            </button>` : ''}
          </div>
        </div>`;
    }).join('')}</div>`;
  }

  async function viewTeam(id) {
    const t = _teams.find(x => (x.team_id || x.id) == id);
    if (!t) { OpsModal.toast('Team not found', 'warning'); return; }

    const name = t.team_name || t.name || id;
    const sc   = statusConfig(t.status);

    OpsModal.open(`Team — ${name}`, `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
        <div class="ops-modal-detail"><span class="label">Team ID</span><span class="value" style="font-family:var(--ff-m);font-size:.8rem;">${id}</span></div>
        <div class="ops-modal-detail"><span class="label">Status</span><span class="value"><span class="status-badge ${sc.badge}">${sc.label}</span></span></div>
        <div class="ops-modal-detail"><span class="label">Location</span><span class="value">${t.current_location || t.location || '—'}</span></div>
        <div class="ops-modal-detail"><span class="label">Assigned To</span><span class="value">${t.assigned_to || 'Unassigned'}</span></div>
        ${t.eta ? `<div class="ops-modal-detail"><span class="label">ETA</span><span class="value" style="color:var(--warn);font-weight:700;">${t.eta} minutes</span></div>` : ''}
        <div class="ops-modal-detail"><span class="label">Last Check-in</span><span class="value">${formatTime(t.last_checkin || t.last_check_in)}</span></div>
        ${t.members_count ? `<div class="ops-modal-detail"><span class="label">Members</span><span class="value">${t.members_count}</span></div>` : ''}
        ${t.equipment ? `<div class="ops-modal-detail" style="grid-column:1/-1;"><span class="label">Equipment</span><span class="value">${t.equipment}</span></div>` : ''}
        ${t.notes ? `<div class="ops-modal-detail" style="grid-column:1/-1;"><span class="label">Notes</span><span class="value">${t.notes}</span></div>` : ''}
      </div>
    `, [
      { label: 'Close',          onclick: 'OpsModal.close()',                                            class: 'btn-ghost' },
      { label: 'Update Status',  onclick: `OpsModal.close();OpsTeams.editStatus('${id}','${name.replace(/'/g, "\\'")}')`, class: 'btn-ghost' },
      ...((t.status || '').toLowerCase() === 'idle' || !t.status
        ? [{ label: 'Dispatch', onclick: `OpsModal.close();OpsTeams.dispatch('${id}','${name.replace(/'/g, "\\'")}')`, class: 'btn-primary' }]
        : []),
    ]);
  }

  async function dispatch(id, name) {
    // Load open alerts for assignment dropdown
    let alerts = [];
    try {
      const res = await OpsModal.apiGet('/alerts');
      alerts = (res.data || res.alerts || []).filter(a => !a.assigned_team);
    } catch {}

    const alertOptions = alerts.length > 0
      ? [{ value:'', label:'— No specific incident —' }, ...alerts.map(a => ({
          value: a.alert_id || a.id,
          label: `${a.alert_type || 'Alert'} — ${a.location || a.site_name || '—'}`,
        }))]
      : [{ value: '', label: 'No open incidents' }];

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

  function editStatus(id, name) {
    const t  = _teams.find(x => (x.team_id || x.id) == id);
    OpsModal.open(`Update Status — ${name}`, `
      ${OpsModal.field('Status', 'status', 'select', t?.status || 'idle', {
        options: [
          { value: 'idle',      label: 'Idle — available for dispatch' },
          { value: 'en_route',  label: 'En Route — heading to site' },
          { value: 'on_site',   label: 'On Site — working at location' },
          { value: 'returning', label: 'Returning — heading back to base' },
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
      await OpsModal.apiPut(`/teams/${id}`, data);
      OpsModal.close();
      OpsModal.toast('Team status updated', 'nominal');
      reloadTab('teams');
    } catch (err) {
      OpsModal.toast('Update failed: ' + err.message, 'critical');
      OpsModal.setLoading('modal-save-btn', false);
    }
  }

  function createTeam() {
    OpsModal.open('Create Team', `
      ${OpsModal.field('Team Name', 'team_name', 'text', '', { placeholder: 'e.g. Alpha Response Unit' })}
      ${OpsModal.row([
        OpsModal.field('Team Lead', 'team_lead', 'text', '', { placeholder: 'Full name', required: false }),
        OpsModal.field('Members', 'members_count', 'number', '', { placeholder: '4', required: false }),
      ])}
      ${OpsModal.field('Equipment', 'equipment', 'text', '', { placeholder: 'e.g. Hydro-jetting unit, vacuum truck', required: false })}
      ${OpsModal.field('Base Location', 'base_location', 'text', '', { placeholder: 'e.g. Victoria Island Depot', required: false })}
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
      OpsModal.toast('Team created successfully', 'nominal');
      reloadTab('teams');
    } catch (err) {
      OpsModal.toast('Failed to create: ' + err.message, 'critical');
      OpsModal.setLoading('modal-save-btn', false);
    }
  }

  return { render, viewTeam, dispatch, confirmDispatch, editStatus, confirmStatus, createTeam, confirmCreate };

})();
