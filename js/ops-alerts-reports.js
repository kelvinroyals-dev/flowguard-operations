// ============================================
// ALERTS MODULE
// Full redesign — viewAlert, assignAlert, resolveAlert all wired
// ============================================

const OpsAlerts = (function () {
  const canMng = () => !(window.Auth && Auth.can) || Auth.can('alerts.manage');
  'use strict';

  let _allAlerts = [];
  let _filter    = 'all';
  let _pg        = null;
  let _container = null;
  let _incidentMap = null;
  let _incidentTheme = null;
  let _detailId = null, _loadRevision = 0;
  const _dash = v => (v == null || v === '') ? '—' : OpsModal.escape(v);
  const _esc = s => OpsModal.escape(s);
  let _queueScope = 'all', _queueTerm = '', _queueState = 'unresolved';
  const closedIncident = a => ['resolved','closed','dismissed','cancelled'].includes(String(a.status || '').toLowerCase());
  const stateMatches = a => _queueState === 'all' || (_queueState === 'resolved' ? closedIncident(a) : _queueState === 'in_progress' ? ['dispatched','assigned','acknowledged','in_progress','investigating'].includes(String(a.status || '').toLowerCase()) : !closedIncident(a));
  function requireIncidentManage() { if (Auth.hasNavAccess('alerts') && Auth.can('alerts.manage')) return true; OpsModal.toast('You do not have permission to change incidents', 'watch'); return false; }
  function queueFilter() {
    _queueScope = document.getElementById('al-scope')?.value || 'all';
    _queueTerm = document.getElementById('al-search')?.value.toLowerCase() || '';
    _queueState = document.getElementById('al-state')?.value || 'unresolved';
    setFilter(_filter);
  }
  function queuedAlerts() {
    return _allAlerts.filter(a => stateMatches(a) && (_filter === 'all' || severityClass(a.severity) === _filter)
      && (_queueScope !== 'unassigned' || !(a.assigned_team_id || a.assigned_team))
      && (_queueScope !== 'owned' || !!(a.assigned_team_id || a.assigned_team))
      && `${a.alert_id || a.id || ''} ${a.alert_type || a.type || ''} ${a.property_name || a.location || ''} ${a.assigned_team || ''}`.toLowerCase().includes(_queueTerm));
  }

  function getToken() {
    return Auth.getToken();
  }

  function render(container) {
    _detailId = null;
    _loadRevision++;
    if (_incidentTheme) { _incidentTheme.disconnect(); _incidentTheme = null; }
    if (_incidentMap) { _incidentMap.remove(); _incidentMap = null; }
    _container = container;
    container.innerHTML = `


      ${OpsModal.pageHeader({title:'Incidents',subtitle:'Response queue and recorded outcomes, ranked by severity'})}

      <!-- Stats/filter — matches alerts.severity CHECK constraint exactly: critical | high | moderate | minor -->
      <div id="al-stats"></div>

      <!-- Incident Intelligence — pattern-detected candidates, ahead of the reactive feed -->
      <div class="ic-card" id="ic-card">
        <div class="ic-head">
          <div class="ic-title">Detection candidates <span class="ic-badge" id="ic-badge" style="display:none;"></span></div>
          <div class="ic-sub">Review detection candidates separately from the active incident queue above. Confirm a candidate to create an incident, or dismiss it with a reason after review.</div>
        </div>
        <div id="ic-body">
          ${OpsModal.loading('Checking detection candidates…')}
        </div>
      </div>

      <!-- Feed -->
      <div class="al-feed-card" id="al-feed-card">
        <div class="lv-toolbar">
          <div class="lv-search"><input id="al-search" aria-label="Search incidents" placeholder="Search incident, estate or owner…" oninput="OpsAlerts.queueFilter()"></div>
          <select id="al-scope" class="um-filter" aria-label="Incident ownership" onchange="OpsAlerts.queueFilter()"><option value="all">All ownership</option><option value="unassigned">Needs an owner</option><option value="owned">Owner assigned</option></select>
          <select id="al-state" class="um-filter" aria-label="Incident response state" onchange="OpsAlerts.queueFilter()"><option value="unresolved">Unresolved</option><option value="in_progress">Response in progress</option><option value="resolved">Recorded outcomes</option><option value="all">All returned incidents</option></select>
        </div>
        <div class="al-feed-head">
          <div class="al-feed-title">Incident response queue</div>
          <button class="fg-action" onclick="OpsAlerts.refresh()">
            ${OpsModal.actionIcon('refresh')}
            Refresh
          </button>
        </div>
        <div class="al-feed-body" id="al-feed">
          <div style="padding:40px;text-align:center;color:var(--ink-3);">
            <div class="loading" style="margin:0 auto 12px;"></div>
            <div style="font-size:var(--fs-base);">Loading alerts…</div>
          </div>
        </div>
      </div>
    `;

    // Response comes first; detection candidates are a separate review queue.
    const intelligence = container.querySelector('#ic-card');
    if (intelligence) container.append(intelligence);
    loadAlerts();
    loadCandidates();
  }

  // ── Incident Intelligence: pending automation-raised candidates ──
  let _candidates = [];

  async function loadCandidates() {
    try {
      const r = await OpsModal.apiGet('/monitoring/incident-candidates?status=pending');
      _candidates = OpsModal.readArray(r,'Detection candidates');
      renderCandidates();
    } catch (err) {
      const body = document.getElementById('ic-body');
      if (body) body.innerHTML = OpsModal.failure('Detection candidates',err,'OpsAlerts.refresh()');
    }
  }

  function renderCandidates() {
    const body = document.getElementById('ic-body');
    const badge = document.getElementById('ic-badge');
    if (!body) return;
    if (badge) {
      badge.textContent = _candidates.length || '';
      badge.style.display = _candidates.length ? '' : 'none';
    }
    if (!_candidates.length) {
      body.innerHTML = OpsModal.emptyState(OpsModal.entityIcon('incident'),'No detection candidates returned','No pending candidates were returned for review. This is separate from the active incident queue.');
      return;
    }
    body.innerHTML = _candidates.map(c => {
      const start = OpsModal.fmtDateTime(c.breach_start);
      const dur = c.duration_min ? `${c.duration_min} min sustained` : 'duration unknown';
      const site = c.property_name || c.sensor_name || c.sensor_id || 'Unknown site';
      return `
        <div class="ic-row">
          <div class="ic-row-body">
            <div class="ic-row-title">${site}</div>
            <div class="ic-row-meta">${c.sensor_name || c.sensor_id || ''} · ${dur} · began ${start}</div>
          </div>
          <div class="ic-row-peak">${c.peak_level != null ? Math.round(c.peak_level) + '%' : '—'}</div>
          <div class="al-row-actions">
            <button class="fg-action" onclick="OpsAlerts.dismissCandidate(${parseInt(c.id, 10)})">Dismiss</button>
            <button class="resolve fg-action" onclick="OpsAlerts.confirmCandidate(${parseInt(c.id, 10)})">Confirm incident</button>
          </div>
        </div>`;
    }).join('');
  }

  function confirmCandidate(id) {
    const c = _candidates.find(x => x.id == id);
    const site = c ? (c.property_name || c.sensor_name || c.sensor_id) : 'this site';
    OpsModal.open('Confirm flood incident', `
      <p style="margin:0 0 12px;font-size:var(--fs-base);color:var(--ink-3);line-height:1.5">
        Confirms this as a real flood incident at <b>${site}</b>. This resets the client's "days flood-free" counter and writes a permanent record.
      </p>
      ${OpsModal.field('Note (optional)', 'note', 'textarea', '', { required: false, placeholder: 'What happened, what was observed' })}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: 'Confirm incident', class: 'btn-primary', onclick: `OpsAlerts.resolveCandidate(${id}, true)` },
    ]);
  }

  function dismissCandidate(id) {
    const c = _candidates.find(x => x.id == id);
    const site = c ? (c.property_name || c.sensor_name || c.sensor_id) : 'this site';
    OpsModal.open('Dismiss candidate', `
      <p style="margin:0 0 12px;font-size:var(--fs-base);color:var(--ink-3);line-height:1.5">
        Marks this as a false positive at <b>${site}</b>. Nothing is written to the client's record.
      </p>
      ${OpsModal.field('Reason (optional)', 'note', 'textarea', '', { required: false, placeholder: "Why this isn't a real incident" })}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: 'Dismiss', class: 'btn-danger', onclick: `OpsAlerts.resolveCandidate(${id}, false)` },
    ]);
  }

  async function resolveCandidate(id, confirmed) {
    const f = OpsModal.getFormData();
    OpsModal.setLoading(true);
    try {
      await OpsModal.apiPost(`/monitoring/incident-candidates/${id}/confirm`, { confirmed, note: f.note || null });
      OpsModal.close();
      OpsModal.toast(confirmed ? 'Incident confirmed.' : 'Candidate dismissed.', confirmed ? 'success' : 'nominal');
      _candidates = _candidates.filter(c => c.id != id);
      renderCandidates();
      if (confirmed) loadAlerts();   // a confirmed incident may also raise/affect the active feed
    } catch (err) {
      OpsModal.setLoading(false);
      OpsModal.toast(err.message || 'Failed to update candidate', 'error');
    }
  }

  async function loadAlerts() {
    const revision=++_loadRevision;
    try {
      const res    = await fetch(`${CONFIG.API_BASE}/alerts`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data   = await res.json();
      const _raw   = Array.isArray(data.data) ? data.data
                   : Array.isArray(data.alerts) ? data.alerts : null;
      if (!_raw) throw new Error('Incident records were not supplied');
      if (revision !== _loadRevision) return;
      // "Active Incidents" means unresolved — resolved/closed alerts must not
      // appear in the feed nor inflate the severity counts or Total Active.
      _allAlerts = _raw;
      if (_detailId != null) {
        if (typeof updateAlertCount === 'function') updateAlertCount(OpsModal.scopeCount(_allAlerts,'alerts'));
        return;
      }
      const stateControl = document.getElementById('al-state'); if (stateControl) stateControl.value = _queueState;
      updateStats(_allAlerts);
      _pg = FGPaginator.create(queuedAlerts(), { pageSize: 20, containerId: 'al-feed-card' });
      _pg.render((items) => renderFeed(items, _filter));
      if (typeof updateAlertCount === 'function') updateAlertCount(OpsModal.scopeCount(_allAlerts,'alerts'));
    } catch (err) {
      if (revision !== _loadRevision || _detailId != null) return;
      renderError(err.message);
    }
  }


  // Shared KpiStrip, doubling as the severity filter (matches the Properties
  // pipeline pattern) — was a stat-card row PLUS a separate filter-button
  // row underneath doing the same job, costing an extra ~40px of vertical
  // space above the fold with nothing on it but redundant controls.
  function updateStats(alerts) {
    const WARN_ICON = OpsModal.icon('incident');
    const CHECK_ICON = OpsModal.icon('verify');
    alerts = alerts.filter(stateMatches);
    // alerts.severity CHECK constraint: critical | high | moderate | minor.
    // One count per real value — no folding into legacy 3-bucket labels.
    let critical = 0, high = 0, moderate = 0, minor = 0, unknown=0;
    alerts.forEach(a => {
      switch (severityClass(a.severity)) {
        case 'critical': critical++; break;
        case 'high':     high++;     break;
        case 'moderate': moderate++; break;
        case 'minor': minor++; break;
        default: unknown++; break;
      }
    });
    const el = document.getElementById('al-stats');
    if (!el) return;
    el.innerHTML = OpsModal.kpiStrip([
      { icon: WARN_ICON,  color: 'var(--err)',   label: 'Critical',    value: critical, active: _filter === 'critical', onClick: "OpsAlerts.setFilter('critical')" },
      { icon: WARN_ICON,  color: 'var(--caut)',  label: 'High',        value: high,     active: _filter === 'high',     onClick: "OpsAlerts.setFilter('high')" },
      { icon: WARN_ICON,  color: 'var(--warn)',  label: 'Moderate',    value: moderate, active: _filter === 'moderate', onClick: "OpsAlerts.setFilter('moderate')" },
      { icon: WARN_ICON,  color: 'var(--ink-3)', label: 'Low',         value: minor,    active: _filter === 'minor',    onClick: "OpsAlerts.setFilter('minor')" },
      ...(unknown ? [{icon:WARN_ICON,color:'var(--ink-3)',label:'Unknown severity',value:unknown,active:_filter==='unknown',onClick:"OpsAlerts.setFilter('unknown')"}] : []),
      { icon: CHECK_ICON, color: 'var(--blue-hi)', label: 'Returned in state', value: alerts.length, active: _filter === 'all', onClick: "OpsAlerts.setFilter('all')" },
    ])+OpsModal.provenance([['Metric cohort',`${alerts.length} returned incidents in the selected response state`]],'Severity counts precede severity, ownership and search filters. Returned matches below reflect those additional filters. The sidebar counts returned unresolved incidents, not a complete platform total.');
  }

  function setFilter(f) {
    _filter = f;
    updateStats(_allAlerts);
    const filtered = queuedAlerts();
    if (_pg) _pg.update(filtered);
    else renderFeed(filtered, f);
  }

  function refresh() {
    const feed = document.getElementById('al-feed');
    if (feed) feed.innerHTML = '<div style="padding:40px;text-align:center;color:var(--ink-3);"><div class="loading" style="margin:0 auto 12px;"></div><div style="font-size:var(--fs-base);">Refreshing…</div></div>';
    // Remove data-rendered so reload works
    const container = document.getElementById('content-alerts');
    if (container) container.removeAttribute('data-rendered');
    loadAlerts();
    loadCandidates();
  }

  function severityClass(s) {
    switch ((s || '').toLowerCase()) {
      case 'critical': return 'critical';
      case 'high':     return 'high';
      case 'medium':
      case 'moderate': return 'moderate';
      case 'low':
      case 'minor':    return 'minor';
      default:         return 'unknown';
    }
  }

  // one label, used everywhere, matching what the database actually stores
  function severityLabel(s) {
    const c = severityClass(s);
    return c==='minor'?'Low':OpsModal.label(c);
  }

  function renderFeed(alerts, filter) {
    const feed = document.getElementById('al-feed');
    if (!feed) return;

    if (!alerts || alerts.length === 0) {
      feed.innerHTML = OpsModal.emptyState(OpsModal.entityIcon('incident'),_allAlerts.length?'No matching incidents':'No incidents returned',_allAlerts.length?'No returned incidents match the response state and filters. Change the filters to broaden this queue. This does not confirm device or network health.':'No incidents were returned by this feed. This does not confirm device or network health.');
      return;
    }

    const sevTile = { critical: 'var(--err)', high: 'var(--caut)', moderate: 'var(--warn)', minor: 'var(--ink-3)' };
    feed.innerHTML = `
      <div class="lv-scroll"><table class="lv-table">
        <thead><tr>
          <th scope="col">Incident</th><th scope="col">Estate</th><th scope="col">Severity</th><th scope="col">Owner</th><th scope="col">Response state</th><th scope="col">Raised</th>
        </tr></thead>
        <tbody>
          ${alerts.map(a => {
            const id = OpsModal.sid(a.alert_id || a.id);
            const type = a.alert_type || a.type || 'Incident';
            const location = a.property_name || a.property || a.site_name || a.location || '—';
            const sc = severityClass(a.severity);
            return `<tr class="clickable" onclick="OpsAlerts.open('${id}')">
              <td><button class="record-link" onclick="event.stopPropagation();OpsAlerts.open('${OpsModal.sid(id)}')">${_esc(type)}</button><div class="lv-source">${_esc(id)}${a.sensor_name ? ' · ' + _esc(a.sensor_name) : ''}</div></td>
              <td><span class="fg-cell-copy">${_esc(location)}</span></td>
              <td>${OpsModal.status(a.severity,severityLabel(a.severity),null,'severity')}</td>
              <td>${a.assigned_team ? _esc(a.assigned_team) : '<span class="lv-dash">Unassigned</span>'}</td>
              <td>${OpsModal.status(a.status,null,['resolved','closed'].includes(a.status)?'ok':'neutral')}</td>
              <td class="lv-mono">${formatTime(a.timestamp || a.created_at)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>`;
  }

  function formatTime(ds) { return OpsModal.relativeTime(ds); }

  function back() { if (_container) render(_container); }

  function open(id) {
    if (!_container) return;
    const a=_allAlerts.find(row=>String(row.alert_id || row.id)===String(id));
    if (!a) return OpsModal.toast('Incident is no longer in this queue','watch');
    _detailId=a.alert_id || a.id;
    if (_incidentTheme) { _incidentTheme.disconnect(); _incidentTheme = null; }
    if (_incidentMap) { _incidentMap.remove();_incidentMap=null; }
    const sid=OpsModal.sid(_detailId), F=OpsModal.fact, linked=OpsModal.link;
    const resolved=closedIncident(a), owner=a.assigned_team_name || a.assigned_team || (a.assigned_team === null ? 'Not assigned' : OpsModal.missing.absent);
    const created=a.timestamp || a.created_at;
    const coordinate=value=>value!=null && value!=='' && typeof value!=='boolean' && Number.isFinite(Number(value));
    const hasCoordinates=coordinate(a.latitude) && coordinate(a.longitude) && Math.abs(Number(a.latitude))<=90 && Math.abs(Number(a.longitude))<=180;
    const title=OpsModal.label(a.alert_type || a.type || 'Incident');
    const device=a.sensor_id?linked('sensors',a.sensor_id,a.sensor_name || a.device_name || a.sensor_id):'Not linked';
    const estate=a.property_id?linked('properties',a.property_id,a.property_name || a.property || a.site_name || a.property_id):_dash(a.property_name || a.location || a.site_name);
    const work=a.job_id?linked('jobs',a.job_id,a.job_title || a.job_id):a.ticket_id?linked('maintenance',a.ticket_id,a.ticket_id):'Not linked';
    const events=[['Raised',created,a.description],['Acknowledged',a.acknowledged_at,a.acknowledged_by_name],['Assigned',a.assigned_at,owner],['Resolved',a.resolved_at,a.outcome]].filter(([,date])=>date);
    const timeline=events.map(([label,date,description])=>`<div class="fg-timeline-row"><div class="fg-timeline-icon" aria-hidden="true">${OpsSpatial.icon('incident')}</div><div><div class="fg-timeline-title">${_esc(label)}</div>${description?`<div class="fg-timeline-meta">${_esc(description)}</div>`:''}</div><time class="fg-timeline-time">${OpsModal.fmtDateTime(date)}</time></div>`).join('') || OpsModal.emptyState('','No recorded events','Event timestamps were not supplied.');
    let actions='';
    if (canMng()) actions=resolved?`<button class="fg-action" onclick="OpsAlerts.reopenAlert('${sid}')">Reopen incident</button>`:`<button class="fg-action fg-action-primary" onclick="OpsAlerts.assignAlert('${sid}')">${a.assigned_team?'Reassign team':'Assign team'}</button><button class="fg-action" onclick="OpsAlerts.resolveAlert('${sid}')">Record outcome</button>`;
    if (Auth.hasNavAccess('jobs') && Auth.can('jobs.manage')) actions+=`<button class="fg-action" onclick="OpsAlerts.prepareWork('${sid}')">Prepare work order</button>`;
    const locationBody=hasCoordinates?`<div id="incident-location-map" style="height:260px;border-radius:var(--radius-control);background:var(--surface-2)" role="region" aria-label="Incident location map"></div>${F('Reported coordinates',_esc(a.latitude+', '+a.longitude))}<button class="fg-action" onclick="switchTab('situation')">Open command centre</button>`:`<div class="capability-note">Coordinates were not supplied. ${_esc(a.location || a.site_name || 'Location requires confirmation')}.</div>`;
    _container.innerHTML=OpsModal.detailShell({
      back:'OpsAlerts.back()',crumbRoot:'Incidents',title:_esc(title),avatar:{text:OpsSpatial.icon('incident')},
      chips:[{label:severityLabel(a.severity),cls:OpsModal.statusTone(a.severity,'severity')},{label:OpsModal.label(a.status),cls:['resolved','closed'].includes(a.status)?'ok':'neutral'}],
      meta:[['Incident',_esc(_detailId)],['Estate',estate]],actions,
      decision:[['Response owner',owner],['Raised',OpsModal.fmtDateTime(created)],['Next step',resolved?'Review recorded resolution':a.assigned_team?'Review response progress':'Assign a response team']],
      note:'Assignment, acknowledgement and resolution are distinct steps. Review evidence before recording an outcome.',
      sections:[
        {id:'info',title:'Incident information',body:F('Incident reference',`<span class="lv-source lv-mono">${_esc(_detailId)}</span>`)+F('Type',_esc(title))+F('Severity',_esc(severityLabel(a.severity)))+F('State',OpsModal.status(a.status,null,['resolved','closed'].includes(a.status)?'ok':'neutral'))+F('Location',_dash(a.location || a.site_name || a.property_name))+(a.time_to_overflow_min!=null?F('Reported time to overflow',_esc(a.time_to_overflow_min+' min')):'')+(a.description?`<p class="fg-record-description">${_esc(a.description)}</p>`:'')},
        {id:'map',title:'Reported location',body:locationBody},
        {id:'timeline',title:'Response timeline',body:timeline},
        {id:'resolution',title:'Recorded outcome',stateLabel:'Pending',body:resolved?F('Outcome',_esc(a.outcome?OpsModal.label(a.outcome):'Not supplied'))+F('Resolved',OpsModal.fmtDateTime(a.resolved_at))+F('Resolution note',_dash(a.notes || a.resolution_note)):'<div class="capability-note">An outcome has not yet been recorded. Confirm the observed outcome before resolving this incident.</div>'},
        {id:'evidence',title:'Evidence',body:OpsModal.evidence(a.attachments || a.evidence)},
        {id:'activity',title:'Activity log',body:'<div class="capability-note">A per-incident audit trail was not supplied with this record. Use Activity log for recorded platform events.</div>'}
      ],
      sidebar:`<div class="fgd-card"><div class="fgd-card-head"><h2>Related records</h2></div>${F('Estate',estate)}${F('Device',device)}${F('Work',work)}${a.assigned_team?F('Team',linked('teams',a.assigned_team_id || a.assigned_team,owner)):''}</div>`
    });
    if (hasCoordinates && typeof OpsNetwork!=='undefined') {
      const target=document.getElementById('incident-location-map');
      OpsNetwork.mapLibrary().then(()=>{
        if (!target?.isConnected) return;
        _incidentMap=L.map(target,{zoomControl:true}).setView([Number(a.latitude),Number(a.longitude)],15);
        const styleUrl=()=>`https://tiles.openfreemap.org/styles/${document.documentElement.dataset.theme==='dark'?'dark':'positron'}`;
        let basemap=L.maplibreGL({style:styleUrl(),attribution:'&copy; OpenFreeMap &copy; OSM'}).addTo(_incidentMap);
        _incidentTheme=new MutationObserver(()=>{
          if (!target.isConnected || !_incidentMap) { _incidentTheme?.disconnect(); return; }
          _incidentMap.removeLayer(basemap);
          basemap=L.maplibreGL({style:styleUrl(),attribution:'&copy; OpenFreeMap &copy; OSM'}).addTo(_incidentMap);
        });
        _incidentTheme.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
        const marker=L.marker([Number(a.latitude),Number(a.longitude)],{title:`Incident: ${title}`,alt:`Incident: ${title}`,icon:OpsSpatial.marker('incident',{state:a.severity,attention:a.severity==='critical'})}).addTo(_incidentMap);
        marker.bindPopup(`<strong>${_esc(title)}</strong><br>Reported location: ${Number(a.latitude)}, ${Number(a.longitude)}`);
        OpsModal.keyboardMarker(marker);
      }).catch(error=>{if(target?.isConnected) target.textContent='Map unavailable. Reported coordinates are shown below.';console.warn('[FlowGuard] Incident map:',error.message);});
    }
  }

  // ── Assign alert modal ──
  async function assignAlert(id) {
    if (!requireIncidentManage()) return;
    // Load teams for the dropdown
    let teams = [];
    try {
      const res = await OpsModal.apiGet('/teams');
      teams = OpsModal.readArray(res,'Team choices',['data','teams']);
    } catch { return OpsModal.toast('Team choices are unavailable. Retry before assigning.', 'watch'); }
    if (!Array.isArray(teams)) return OpsModal.toast('Team choices were not supplied', 'watch');

    const a = _allAlerts.find(x => (x.alert_id || x.id) == id);
    const alertLabel = a ? (a.alert_type || 'Incident') : 'Incident';
    const location   = a ? (a.location || a.property || a.site_name || '') : '';

    const teamOptions = teams.length > 0
      ? [{value:'',label:'Select a team'}].concat(teams.map(t => ({ value: t.team_id || t.id, label: (t.team_name || t.name) + (t.status ? ' · reported ' + OpsModal.label(t.status) : ' · availability unknown') })))
      : [{ value: '', label: 'No teams available' }];

    OpsModal.open(`Assign incident`, `
      <div style="padding:12px 14px;background:var(--surface-2);border-radius:var(--radius-control);margin-bottom:18px;">
        <div style="font-size:var(--fs-base);font-weight:600;color:var(--ink);">${_esc(alertLabel)}</div>
        ${location ? `<div style="font-size:var(--fs-sm);color:var(--ink-3);margin-top:2px;">${_esc(location)}</div>` : ''}
      </div>
      ${OpsModal.field('Assign to team', 'team_id', 'select', '', { options: teamOptions })}
      <div class="capability-note">This records the assigned team. It does not confirm arrival, readiness or a crew ETA. Instructions and ETA are not saved by this assignment route.</div>
    `, [
      { label: 'Cancel',     class: 'btn-ghost',   onclick: 'OpsModal.close()' },
      { label: 'Assign team', class: 'btn-primary', onclick: `OpsAlerts.confirmAssign('${OpsModal.sid(id)}')`, id: 'modal-save-btn', disabled:!teams.length },
    ]);
  }

  async function confirmAssign(id) {
    if (!requireIncidentManage()) return;
    const data = OpsModal.getFormData();
    if (!data.team_id) { OpsModal.toast('Please select a team', 'warning'); return; }

    OpsModal.setLoading('modal-save-btn', true);
    try {
      await OpsModal.apiPut(`/alerts/${id}/assign`, {team_id:data.team_id});
      OpsModal.close();
      OpsModal.toast('Team assignment recorded', 'nominal');
      render(_container);
    } catch (err) {
      OpsModal.toast('Failed to assign: ' + err.message, 'critical');
      OpsModal.setLoading('modal-save-btn', false);
    }
  }

  // ── Resolve alert ──
  function resolveAlert(id) {
    if (!requireIncidentManage()) return;
    const a = _allAlerts.find(x => (x.alert_id || x.id) == id);
    const label = a ? (a.alert_type || 'Incident') : 'Incident';

    OpsModal.open('Record incident outcome', `<div class="capability-note">${_esc(label)} · choose the observed outcome. Resolving the incident is distinct from verifying related work.</div>${OpsModal.field('Outcome','outcome','select','',{options:[{value:'',label:'Select an outcome'},{value:'prevented',label:'Flooding prevented'},{value:'flooded',label:'Flooding occurred'},{value:'false_alarm',label:'False alarm'}]})}${OpsModal.field('Outcome note','note','textarea','',{required:false})}`, [{label:'Cancel',class:'btn-ghost',onclick:'OpsModal.close()'},{label:'Record outcome',class:'btn-primary',onclick:`OpsAlerts.confirmResolve('${OpsModal.sid(id)}')`,id:'modal-save-btn'}]);
  }
  async function confirmResolve(id) {
      if (!requireIncidentManage()) return;
      const data = OpsModal.getFormData();
      if (!['prevented','flooded','false_alarm'].includes(data.outcome)) return OpsModal.toast('Choose the observed outcome before resolving', 'watch');
      OpsModal.setLoading('modal-save-btn', true);
      try {
        await OpsModal.apiPost(`/alerts/${id}/resolve`, {outcome:data.outcome,note:data.note || ''});
        OpsModal.close();
        OpsModal.toast('Incident resolved', 'nominal');
        render(_container);
      } catch (err) {
        OpsModal.toast('Failed to resolve: ' + err.message, 'critical');
        OpsModal.setLoading('modal-save-btn', false);
      }
  }

  function reopenAlert(id) {
    if (!requireIncidentManage()) return;
    const a = _allAlerts.find(x => (x.alert_id || x.id) == id);
    const label = a ? (a.alert_type || 'Incident') : 'Incident';

    OpsModal.confirm(`Reopen "${label}"? This puts the alert back into active state.`, async function () {
      if (!requireIncidentManage()) return;
      OpsModal.setLoading('modal-confirm-btn', true);
      try {
        await OpsModal.apiPut(`/alerts/${id}/reopen`, {});
        OpsModal.close();
        OpsModal.toast('Incident reopened', 'nominal');
        render(_container);
      } catch (err) {
        OpsModal.toast('Failed to reopen: ' + err.message, 'critical');
        OpsModal.setLoading('modal-confirm-btn', false);
      }
    }, {tone:'neutral',title:'Reopen incident',confirmLabel:'Reopen incident',detail:'The incident returns to the active queue. Related work orders remain unchanged.'});
  }

  // After resolve/reopen: refresh stats + badge, then re-render whichever view
  // is on screen (the detail screen if open, otherwise the alert feed).
  function _afterAlertMutation(id) {
    updateStats(_allAlerts);
    if (typeof updateAlertCount === 'function') {
      updateAlertCount(OpsModal.scopeCount(_allAlerts,'alerts'));
    }
    if (_container && _detailId != null) {
      open(id);
    } else {
      renderFeed(_filter === 'all' ? _allAlerts : _allAlerts.filter(a => severityClass(a.severity) === _filter), _filter);
    }
  }

  function prepareWork(id) {
    const incident = _allAlerts.find(a=>String(a.alert_id || a.id) === String(id));
    if (!incident) return OpsModal.toast('Incident is no longer in this queue', 'watch');
    OpsJobs.newJob({
      source:'incident',source_alert_id:incident.alert_id || incident.id,
      property_id:incident.property_id,
      title:`Review ${incident.alert_type || incident.type || 'incident'} — ${incident.property_name || incident.location || 'estate to confirm'}`,
      description:`Incident reference: ${incident.alert_id || incident.id}\n${incident.description || ''}`,
    });
  }
  function renderError(message) {
    const feed = document.getElementById('al-feed');
    if (!feed) return;
    feed.innerHTML = OpsModal.failure('Incidents',{message},"OpsAlerts.refresh()");
  }

  return {
    render, setFilter, queueFilter, refresh, open, back, assignAlert, confirmAssign, resolveAlert, confirmResolve, reopenAlert, prepareWork,
    confirmCandidate, dismissCandidate, resolveCandidate,
  };

})();


// ============================================
// REPORTS MODULE
// ============================================

const OpsReports = (function () {
  const canMng = () => !(window.Auth && Auth.can) || Auth.can('reports.manage');
  'use strict';

  let _reports = [];
  let _rc = null;
  const _d = v => (v == null || v === '') ? '—' : OpsModal.escape(v);
  const reportCategory = value => ({daily:'Daily operations',weekly:'Weekly performance',financial:'Financial report',monthly:'Monthly report'})[value] || OpsModal.label(value || 'unclassified');
  const reportKey = r => String(r.report_id || r.id || JSON.stringify([r.name,r.title,r.generated_at,r.created_at,r.report_type,r.type,r.download_url]));
  let _reportTerm = '', _reportType = 'all', _reportPeriod = 'all';
  function inGeneratedWindow(r,period,now=Date.now()) { if (period==='all') return true;const raw=r.generated_at || r.created_at;const time=raw?new Date(raw).getTime():NaN;return Number.isFinite(time) && time<=now && time>=now-Number(period)*864e5; }
  function filterLibrary() {
    _reportTerm = document.getElementById('rp-search')?.value.toLowerCase() || '';
    _reportType = document.getElementById('rp-category')?.value || 'all';
    _reportPeriod = document.getElementById('rp-period')?.value || 'all';
    const rows=_reports.filter(r=>inGeneratedWindow(r,_reportPeriod) && (_reportType === 'all' || (r.type || r.report_type) === _reportType) && `${r.name || r.title || ''} ${r.property_name || ''}`.toLowerCase().includes(_reportTerm));
    FGPaginator.create(rows,{pageSize:25,containerId:'rp-list'}).render(renderReports);
  }

  function render(container) {
    _rc = container;
    container.innerHTML = `


      ${OpsModal.pageHeader({title:'Reports',subtitle:'Review the report library or generate a new operational summary',actions:'<button type="button" id="rp-generate-toggle" class="fg-action fg-action-primary" aria-expanded="false" aria-controls="rp-generator" onclick="OpsReports.toggleGenerator()">Generate a report</button>'})}
      <section id="rp-generator" class="fg-report-generator" aria-labelledby="rp-generation-label" hidden>
      <h2 id="rp-generation-label">Choose report type</h2><div class="rp-grid">
        <button type="button" class="rp-card daily" aria-label="Generate daily operations report" ${canMng() ? '' : 'disabled'} onclick="OpsReports.generate('daily')">
          <div class="rp-icon">
            ${OpsModal.entityIcon('document')}
          </div>
          <div class="rp-card-title">Daily operations</div>
          <div class="rp-card-sub">Records raised today: incident severity and state, plus internal maintenance completion</div>
        </button>

        <button type="button" class="rp-card weekly" aria-label="Generate weekly performance report" ${canMng() ? '' : 'disabled'} onclick="OpsReports.generate('weekly')">
          <div class="rp-icon">
            ${OpsModal.entityIcon('analytics')}
          </div>
          <div class="rp-card-title">Weekly performance</div>
          <div class="rp-card-sub">Records raised over seven calendar days, with their status at generation time</div>
        </button>

        <button type="button" class="rp-card finance" aria-label="Generate financial report" ${canMng() ? '' : 'disabled'} onclick="OpsReports.generate('financial')">
          <div class="rp-icon">
            ${OpsModal.entityIcon('billing')}
          </div>
          <div class="rp-card-title">Financial report</div>
          <div class="rp-card-sub">Current-month invoice amounts and recorded balances; not reconciled cash collections</div>
        </button>
      </div>

      </section>
      <div class="rp-recent lv-wrap">
        <div class="lv-toolbar">
          <div class="lv-search"><input id="rp-search" aria-label="Search report library" placeholder="Search reports or estate…" oninput="OpsReports.filterLibrary()"></div>
          <select id="rp-category" class="um-filter" aria-label="Report category" onchange="OpsReports.filterLibrary()"><option value="all">All categories</option></select>
          <select id="rp-period" class="um-filter" aria-label="Report generation window" onchange="OpsReports.filterLibrary()"><option value="all">All generation dates</option><option value="30">Generated in last 30 days</option><option value="90">Generated in last 90 days</option></select>
        </div>
        <div class="fg-table-note">Dates refer to generation, not coverage. Undated records are excluded from dated filters.</div>
        <div id="rp-list">
          <div style="padding:40px;text-align:center;color:var(--ink-3);">
            <div class="loading" style="margin:0 auto 12px;"></div>
            <div style="font-size:var(--fs-base);">Loading reports…</div>
          </div>
        </div>
      </div>
    `;

    loadReports();
  }

  function toggleGenerator() {
    const panel = document.getElementById('rp-generator');
    const trigger = document.getElementById('rp-generate-toggle');
    if (!panel || !trigger) return;
    panel.hidden = !panel.hidden;
    trigger.setAttribute('aria-expanded',String(!panel.hidden));
  }

  async function loadReports() {
    try {
      const res  = await OpsModal.apiGet('/reports');
      const list = OpsModal.readArray(res,'Report library',['data','reports']);
      _reports = list;
      const select = document.getElementById('rp-category');
      if (select) select.innerHTML = '<option value="all">All categories</option>' + [...new Set(list.map(r=>r.type || r.report_type).filter(Boolean))].map(type=>`<option value="${OpsModal.escape(type)}">${OpsModal.escape(reportCategory(type))}</option>`).join('');
      filterLibrary();
    } catch (err) {
      const list = document.getElementById('rp-list');
      if (list) list.innerHTML = OpsModal.failure('Report library',err,"reloadTab('reports')");
    }
  }

  function renderReports(reports) {
    const el = document.getElementById('rp-list');
    if (!el) return;

    if (reports.length === 0) {
      el.innerHTML = OpsModal.emptyState(OpsModal.entityIcon('report'),_reports.length?'No matching reports':'No reports returned',_reports.length?'Change the search, category or reporting-period filter to review other reports.':'No generated report records were returned by this library feed.');
      return;
    }

    const fmtOf = r => OpsModal.label(r.format || (r.download_url ? (r.download_url.split('.').pop() || '').toUpperCase().slice(0, 4) : ''));
    // Columns per spec: Report, Category, Property, Date, Generated By, Format
    el.innerHTML = `
      <div class="lv-scroll">
        <table class="lv-table">
          <thead><tr><th scope="col">Report</th><th scope="col">Category</th><th scope="col">Estate</th><th scope="col">Date</th><th scope="col">Generated by</th><th scope="col">Format</th></tr></thead>
          <tbody>
            ${reports.map((r, i) => {
              const tc = {label:reportCategory(r.type || r.report_type)};
              const date = r.generated_at || r.created_at ? OpsModal.fmtDateTime(r.generated_at || r.created_at) : '—';
              const propCell = r.property_id ? OpsModal.link('properties', r.property_id, r.property_name || r.property_id) : _d(r.property_name);
              const key = encodeURIComponent(reportKey(r)).replace(/'/g,'%27');
              return `<tr class="clickable" onclick="OpsReports.open(decodeURIComponent('${key}'))">
                <td><button type="button" class="record-link lv-name" onclick="event.stopPropagation();OpsReports.open(decodeURIComponent('${key}'))">${OpsModal.escape(r.name || r.title || tc.label)}</button></td>
                <td>${OpsModal.escape(tc.label)}</td>
                <td>${propCell}</td>
                <td class="lv-mono">${date}</td>
                <td>${_d(r.generated_by || r.generated_by_name)}</td>
                <td class="lv-mono">${OpsModal.escape(fmtOf(r))}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function back() { if (_rc) render(_rc); }

  // ── FULL DETAIL SCREEN (no pop-up) ──
  function open(key) {
    const r = _reports.find(record=>reportKey(record) === String(key));
    if (!_rc || !r) return;
    const date = r.generated_at || r.created_at ? OpsModal.fmtDateTime(r.generated_at || r.created_at) : '—';
    const F = OpsModal.fact, E = OpsModal.emptyState;
    const label = OpsModal.escape(reportCategory(r.type || r.report_type));
    const fmt = OpsModal.label(r.format || (r.download_url ? (r.download_url.split('.').pop() || '').toUpperCase().slice(0, 4) : ''));
    const iDoc = OpsModal.entityIcon('document');
    const iChart = OpsModal.entityIcon('analytics');

    const previewBody = `<div class="fg-facts-grid">
      ${F('Estate', r.property_id ? OpsModal.link('properties', r.property_id, r.property_name || r.property_id) : _d(r.property_name))}
      ${F('Generated / created', date)}
      ${F('Generated by', _d(r.generated_by || r.generated_by_name))}
      ${F('Format', `<span>${OpsModal.escape(fmt)}</span>`)}</div>`;

    _rc.innerHTML = OpsModal.detailShell({
      back: 'OpsReports.back()',
      crumbRoot: 'Reports',
      title: OpsModal.escape(r.name || r.title || label),
      avatar:{text:OpsModal.entityIcon('reports')},
      chips: [{ cls: 'neutral', label: label }],
      meta: [['Date', date], ['Generated by', _d(r.generated_by || r.generated_by_name)]],
      decision:[['Content',r.metrics?.schema_version===1?'Recorded snapshot':r.download_url?'Hosted file supplied':'Unavailable'],['Coverage period',r.period_start && r.period_end?OpsModal.fmtDate(r.period_start)+' – '+OpsModal.fmtDate(r.period_end):'Not supplied'],['Next step',r.metrics?.schema_version===1?'Review the snapshot and its coverage':r.download_url?'Review the supplied report file':'Restore report content before relying on it']],
      actions: '',
      sections: [
        { id: 'preview', title: 'Report metadata', body: previewBody },
        { id: 'content', title: 'Recorded report snapshot', body: reportContent(r) },
        { id: 'export', title: 'Hosted report file', body: r.metrics?.schema_version===1 && !r.download_url ? '<div class="capability-note">Download the snapshot JSON above. No separately hosted report file or PDF is supplied.</div>' : OpsModal.evidence(r.download_url ? [{url:r.download_url,name:'Open / download report'}] : [], 'No report file supplied') },
      ],
    });
  }

  async function generate(type) {
    if (!canMng()) return OpsModal.toast('You do not have permission to generate reports', 'critical');
    OpsModal.toast(`Generating ${type} report…`, 'watch');
    try {
      const result = await OpsModal.apiPost('/reports/generate', { type });
      if (!result?.data?.report_id || result.data.metrics?.schema_version !== 1) throw new Error('The server did not confirm a report with content');
      OpsModal.toast('Recorded report snapshot saved', 'nominal');
      loadReports();
    } catch (err) {
      OpsModal.toast('Failed to generate report: ' + err.message, 'critical');
    }
  }

  function reportContent(r) {
    const m=r.metrics;
    if (m?.schema_version!==1) return '<div class="capability-note">Report content not supplied. Metadata alone does not establish a completed report.</div>';
    const n=value=>OpsModal.count(value)===null ? OpsModal.missing.absent : OpsModal.escape(Number(value).toLocaleString('en-GB'));
    const money=(value,currency)=>OpsModal.escape(OpsModal.money(value,currency));
    const f=OpsModal.fact;
    const rows=m.invoice_snapshot
      ? f('Invoices in period',n(m.invoice_snapshot.invoice_count))+(Array.isArray(m.invoice_currency_groups) ? m.invoice_currency_groups.map(g=>f('Invoice total',money(g.total_invoiced,g.currency))+f('Outstanding balance',money(g.outstanding_balance,g.currency))).join('') : f('Recorded invoice total',money(m.invoice_snapshot.total_invoiced,m.invoice_snapshot.currency))+f('Recorded outstanding balance',money(m.invoice_snapshot.outstanding_balance,m.invoice_snapshot.currency)))+f('Invoices with an amount / balance',n(m.invoice_snapshot.amount_record_count)+' / '+n(m.invoice_snapshot.balance_record_count))
      : f('Incidents raised in period',n(m.incidents?.raised))+f('Critical incidents in cohort',n(m.incidents?.critical))+f('Cohort incidents currently active',n(m.incidents?.currently_active))+f('Cohort recorded resolutions',n(m.incidents?.recorded_resolutions))+f('Internal maintenance created',n(m.maintenance?.created))+f('Cohort recorded completions',n(m.maintenance?.recorded_completions));
    const limitations=Array.isArray(m.limitations) ? m.limitations.map(text=>`<li>${OpsModal.escape(text)}</li>`).join('') : '<li>Source limitations not supplied.</li>';
    return `<div class="fg-facts-grid">${rows}</div><details class="fg-technical"><summary>Snapshot limitations</summary><div class="capability-note"><ul>${limitations}</ul></div></details><details class="fg-technical"><summary>Snapshot source data</summary><pre>${OpsModal.escape(JSON.stringify(m,null,2))}</pre></details><button class="fg-action" type="button" onclick="OpsReports.exportSnapshot('${OpsModal.sid(r.report_id || r.id)}')">Download snapshot JSON</button>`;
  }
  async function exportSnapshot(id) {
    let r = _reports.find(x=>String(x.report_id || x.id)===String(id));
    if (!r || r.metrics?.schema_version !== 1) return OpsModal.toast('Report content unavailable','watch');
    if (typeof r.snapshot_download_path==='string' && /^\/reports\/snapshot\?t=/.test(r.snapshot_download_path)) {
      try {
        const refreshed=(await OpsModal.apiGet('/reports')).data;
        r=Array.isArray(refreshed) ? refreshed.find(x=>String(x.report_id || x.id)===String(id)) : null;
      }
      catch (err) { return OpsModal.toast('Could not authorise download: '+err.message,'critical'); }
      if (!r || !/^\/reports\/snapshot\?t=/.test(r.snapshot_download_path || '')) return OpsModal.toast('Download authorisation unavailable','critical');
      const a=document.createElement('a');a.href=CONFIG.API_BASE.replace(/\/$/,'')+r.snapshot_download_path;a.download=OpsModal.sid(id)+'.json';a.referrerPolicy='no-referrer';document.body.appendChild(a);a.click();a.remove();return;
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(r.metrics,null,2)],{type:'application/json'}));
    const a = document.createElement('a');a.href=url;a.download=OpsModal.sid(id)+'.json';document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return { render, generate, open, back, filterLibrary, exportSnapshot, toggleGenerator };

})();
