// ============================================
// OPS PROPERTIES MODULE
// Submitted areas — full inspection pipeline.
// Rules: whole row opens a FULL detail screen (no pop-up), no "View"
// button, and every list column also appears in the detail view.
// ============================================

const OpsProperties = (function () {
  const canMng = () => !(window.Auth && Auth.can) || Auth.can('properties.manage');
  const requireManage = () => canMng() || (OpsModal.toast('You do not have permission to change estates','watch'),false);
  'use strict';

  let _all = [];
  let _filter = 'all';
  let _pg = null;
  let _container = null;
  let _workspace = 'operations';
  let _term = '';
  let _currentEstate = null;
  let _viewRevision=0;
  let _nextOffset=null,_directoryRevision=0;
  const isOpenIncident = incident => ['active','open','acknowledged','assigned','investigating','in_progress'].includes(String(incident.status || '').toLowerCase());
  const openIncidentCount = incidents => !Array.isArray(incidents) || incidents.some(x=>!isOpenIncident(x) && !['resolved','closed','dismissed','cancelled'].includes(String(x.status || '').toLowerCase())) ? '—' : incidents.filter(isOpenIncident).length;
  const reportedCount = OpsModal.count;
  function prepareWork() {
    if (!_currentEstate) return OpsModal.toast('Open an estate before preparing work', 'watch');
    return OpsJobs.newJob({source:'estate',property_id:_currentEstate.property_id,title:`Estate work — ${_currentEstate.property_name || _currentEstate.name || _currentEstate.property_id}`,description:`Estate reference: ${_currentEstate.property_id}\nConfirm the work scope, access and response requirements.`});
  }
  function prepareMaintenance() {
    if (!_currentEstate) return OpsModal.toast('Open an estate before preparing maintenance', 'watch');
    return prepareWork();
  }
  function workspaceRows() {
    return _all.filter(a=>_workspace === 'all' || (_workspace === 'operations' ? ['active','suspended'].includes(String(a.status || '').toLowerCase()) : !['active','suspended'].includes(String(a.status || '').toLowerCase()) && stageOf(a) !== 'other'));
  }
  function setWorkspace(value) {
    _workspace = ['operations','onboarding','all'].includes(value) ? value : 'operations';
    _filter = 'all';
    document.querySelectorAll('#content-properties .fg-workspace button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.workspace===_workspace));
    const stages = document.getElementById('pr-stage'); if (stages) stages.value = 'all';
    search(_term);
  }

  const _isAdmin = (() => {
    try {
      const u = Auth.getUser() || {};
      return u.role === 'admin' || u.role === 'super_admin';
    } catch { return false; }
  })();

  const dash = v => (v == null || v === '') ? '—' : v;
  const fmtDate = d => OpsModal.fmtDate(d);
  const sid = v => String(v == null ? '' : v).replace(/[^A-Za-z0-9_\-.:]/g, '');


  // ── Property detail v2 — two-column glass layout (from mockup) ─────────

  // ────────────────────────────────────────────────────────── LIST VIEW
  function render(container) {
    ++_viewRevision;
    _container = container;
    container.innerHTML = `

      ${OpsModal.pageHeader({title:'Estates',subtitle:'Review operational estates, service state and onboarding'})}
      ${typeof OpsGeography!=='undefined'?OpsGeography.form():''}
      <p id="pr-directory-coverage" class="fg-weather-context"></p><button id="pr-load-more" class="fg-action" hidden onclick="OpsProperties.loadMore()">Load more estates</button>
      ${OpsModal.workspace({name:'Estate workspace',value:_workspace,handler:'OpsProperties.setWorkspace',options:[['operations','Operations'],['onboarding','Onboarding'],['all','All records']]})}
      <div class="lv-wrap">
        <div class="lv-toolbar">
          <div class="lv-search">
            ${OpsModal.actionIcon("search")}
            <input id="pr-search" aria-label="Search estates" placeholder="Search estates…" oninput="OpsProperties.search(this.value)">
          </div>
          <div class="lv-toolbar-right">
            <select id="pr-stage" class="um-filter" aria-label="Estate service stage" onchange="OpsProperties.filterStage(this.value)">
              <option value="all">All stages</option>
              <option value="submitted">Awaiting review</option>
              <option value="inspection">In inspection</option>
              <option value="billing">Quote / payment</option>
              <option value="active">Active</option>
            </select>
          </div>
        </div>
        <div id="pr-table-body">
          <div style="padding:48px;text-align:center;color:var(--ink-3);">
            <div class="loading" style="margin:0 auto 12px;"></div>
            <div style="font-size:var(--fs-base);">Loading properties…</div>
          </div>
        </div>
      </div>`;
    loadAreas();
  }

  async function loadAreas(append=false) {
    const revision=++_directoryRevision;
    try {
      const offset=append?_nextOffset:0;
      if(offset===null)return;
      const res = await OpsModal.apiGet('/properties/all?limit=250&offset='+offset+'&'+(typeof OpsGeography!=='undefined'?OpsGeography.query():''));
      if(revision!==_directoryRevision)return;
      const records=OpsModal.readArray(res,'Estate directory');
      _all=append?[...new Map([..._all,...records].map(r=>[r.property_id,r])).values()]:records;
      _nextOffset=res.page?.next_offset??null;
      const coverage=document.getElementById('pr-directory-coverage');if(coverage)coverage.textContent='Loaded '+_all.length+' of '+(res.page?.total??_all.length)+' matching estates. Filters and stage counts below apply to loaded records.';
      const more=document.getElementById('pr-load-more');if(more)more.hidden=_nextOffset===null;
      renderPipeline(_all);
      _pg = FGPaginator.create(workspaceRows(), { pageSize: 25, containerId: 'pr-table-body' });
      _pg.render(renderTable);
      search(_term);
    } catch (err) {
      const el = document.getElementById('pr-table-body');
      if (el) el.innerHTML = OpsModal.failure('Estates',err,"reloadTab('properties')");
    }
  }

  function stageOf(a) {
    const s = a.status;
    if (s === 'submitted') return 'submitted';
    if (['inspection_scheduled', 'inspection_ongoing'].includes(s)) return 'inspection';
    if (s === 'report_ready') return 'report';
    if (['quote_sent', 'payment_pending', 'payment_completed', 'deployment_scheduled'].includes(s)) return 'billing';
    if (s === 'active') return 'active';
    return 'other';
  }

  const STAGES = [
    { key: 'submitted', label: 'Awaiting review', sub: 'Submitted' },
    { key: 'inspection', label: 'In inspection', sub: 'Scheduled / ongoing' },
    { key: 'report', label: 'Report ready', sub: 'Awaiting quote' },
    { key: 'billing', label: 'Quote / payment', sub: 'In billing' },
    { key: 'active', label: 'Active', sub: 'Service stage' },
  ];

  function renderPipeline(areas) {
    const counts = { submitted: 0, inspection: 0, report: 0, billing: 0, active: 0 };
    areas.forEach(a => { const k = stageOf(a); if (counts[k] !== undefined) counts[k]++; });
    const el = document.getElementById('pr-pipeline');
    if (!el) return;
    el.innerHTML = OpsModal.kpiStrip(STAGES.map(s => ({
      label: s.label, value: counts[s.key], sub: s.sub,
      active: _filter === s.key, onClick: `OpsProperties.filterStage('${s.key}')`,
    })));
  }

  function filterStage(stage) {
    _filter = stage;
    renderPipeline(_all);
    ['all', 'submitted', 'inspection', 'billing', 'active'].forEach(k => {
      const el = document.getElementById('prf-' + k);
      if (el) el.classList.toggle('active', k === stage);
    });
    search(_term);
  }

  function search(q) {
    const term = q.trim().toLowerCase();
    _term = term;
    const base = _filter === 'all' ? workspaceRows() : workspaceRows().filter(a => stageOf(a) === _filter);
    const filtered = term
      ? base.filter(a => (a.property_name || '').toLowerCase().includes(term) || (a.client_name || '').toLowerCase().includes(term) || (a.city || '').toLowerCase().includes(term))
      : base;
    if (_pg) _pg.update(filtered);
    else renderTable(filtered);
  }

  function healthCell(score) {
    return OpsSpatial.risk(score)==='unknown' ? '<span class="fg-missing">Not supplied</span>' : `<span class="fg-number">${Number(score)} / 100</span>`;
  }

  function renderTable(areas) {
    const el = document.getElementById('pr-table-body');
    if (!el) return;
    if (!areas || !areas.length) {
      el.innerHTML = OpsModal.emptyState(OpsModal.entityIcon('estate'),!_all.length?'No estates returned':workspaceRows().length?'No matching estates':'No estates in this workspace',!_all.length?'No estates were returned by this directory.':workspaceRows().length?'Change the search or state filter to review other returned estates.':'Switch the estate workspace to review other returned records.');
      return;
    }
    const initials = n => (n || '?').split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
    el.innerHTML = `
      <div class="lv-scroll">
        <table class="lv-table">
          <thead>
            <tr>
              <th scope="col">Estate</th>
              <th scope="col">Client</th>
              <th scope="col">Risk</th>
              <th scope="col">Drain health</th>
              <th scope="col">Devices</th>
              <th scope="col">Open incidents</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            ${areas.map(a => {
              const loc = [a.city, a.state].filter(Boolean).join(', ') || a.location || '';
              const pid = sid(a.property_id);
              const devices = Array.isArray(a.devices) ? a.devices.length : reportedCount(a.sentinel_count);
              const inc = Array.isArray(a.incidents) ? openIncidentCount(a.incidents) : reportedCount(a.open_incidents);
              const clientCell = a.user_id ? OpsModal.link('clients', a.user_id, a.client_name || a.client_email || 'Client') : (a.client_name || a.client_email || '<span class="lv-dash">—</span>');
              return `<tr class="clickable" onclick="OpsProperties.open('${pid}')">
                <td>
                  <div class="lv-name-cell">
                    <div class="lv-avatar" aria-hidden="true">${OpsSpatial.icon('estate')}</div>
                    <div style="min-width:0;">
                      <button type="button" class="record-link lv-name" onclick="event.stopPropagation();OpsProperties.open('${pid}')">${OpsModal.escape(a.property_name || '—')}</button>
                      ${loc ? `<span class="lv-source">${OpsModal.escape(loc)}</span>` : ''}
                    </div>
                  </div>
                </td>
                <td>${clientCell}</td>
                <td>${riskPill(a.risk_level)}</td>
                <td>${healthCell(a.health_score)}</td>
                <td class="fg-number">${devices == null ? 'Not supplied' : devices}</td>
                <td class="fg-number">${inc == null || inc==='—' ? 'Not supplied' : inc}</td>
                <td>${statusPill(a.status)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function riskPill(u) {
    return OpsModal.status(u || 'unknown',null,null,'risk');
  }
  function statusPill(s) {
    return OpsModal.status(s || 'unknown',null,null,'estate');
  }

  function back() { if (_container) render(_container); }

  // ────────────────────────────────────────────────── FULL DETAIL SCREEN
  async function open(propertyId) {
    const revision=++_viewRevision;
    if (!_container) return;
    _container.innerHTML = `<div style="padding:60px;text-align:center;color:var(--ink-3);"><div class="loading" style="margin:0 auto 12px;"></div>Loading estate…</div>`;
    try {
      const res = await OpsModal.apiGet('/properties/' + propertyId);
      if(revision!==_viewRevision)return;
      const a = OpsModal.readRecord(res,'Estate');
      renderDetail(a);
    } catch (err) {
      if(revision!==_viewRevision)return;
      _container.innerHTML = OpsModal.recordFailure('Estate',err,`OpsProperties.open('${OpsModal.sid(propertyId)}')`,'OpsProperties.back()');
    }
  }


  function renderDetail(a) {
    _currentEstate = a;
    const pid = sid(a.property_id);
    const inspections = Array.isArray(a.inspections) ? a.inspections : [];
    const quotes = Array.isArray(a.quotes) ? a.quotes : [];
    const invoices = Array.isArray(a.invoices) ? a.invoices : [];
    const assetsArr    = Array.isArray(a.assets) ? a.assets : [];
    const devicesArr   = Array.isArray(a.devices) ? a.devices : [];
    const incidentsArr = Array.isArray(a.incidents) ? a.incidents : [];
    const ticketsArr   = Array.isArray(a.tickets) ? a.tickets : [];
    const L = OpsModal.link;
    const fact = OpsModal.fact;
    const loc = [a.city, a.state].filter(Boolean).join(', ') || a.location || '—';
    const d1 = v => OpsModal.fmtDate(v);
    const dS = v => OpsModal.fmtDate(v);
    const clientLink = a.user_id ? L('clients', a.user_id, a.client_name || a.client_email || 'Client') : OpsModal.escape(a.client_name || a.client_email || (a.user_id === null ? OpsModal.missing.unlinked : OpsModal.missing.absent));

    // ── chips & helpers ────────────────────────────────────────────────
    const st = (a.status || '').toLowerCase();
    const statusCls = OpsModal.statusTone(st,'estate');
    const statusLabel = st === 'active' ? 'Active estate' : OpsModal.label(a.status || 'Unknown');
    const rl = String(a.risk_level || '').toLowerCase();
    const riskCls = OpsModal.statusTone(rl,'risk');
    const riskLabel = rl && ['low','moderate','medium','elevated','high','critical'].includes(rl) ? OpsModal.label(rl==='medium'?'moderate':rl) + ' risk' : 'Risk unknown';

    const statPill = s => OpsModal.status(s);
    const sevPill = s => OpsModal.status(s,null,null,'severity');
    const payPill = s => OpsModal.status(s,null,null,'payment');
    const emptyBox = OpsModal.emptyState;
    const iBox = OpsModal.entityIcon('asset');
    const iDoc = OpsModal.entityIcon('document');
    const iUser = OpsModal.entityIcon('client');
    const iAlert = OpsModal.entityIcon('incident');
    const iWrench = OpsModal.entityIcon('maintenance');
    const iCheck = OpsModal.entityIcon('check');

    // Recorded score: no implied current assessment or invented severity band.
    const scoreRaw = ['number','string'].includes(typeof a.health_score) && String(a.health_score).trim()!=='' ? Number(a.health_score) : null;
    const score = OpsSpatial.risk(scoreRaw)==='unknown' ? null : Number(scoreRaw);
    const createdTimestamp=a.created_at ? new Date(a.created_at).getTime() : NaN;
    const daysMonitored = Number.isFinite(createdTimestamp) && createdTimestamp<=Date.now() ? Math.floor((Date.now()-createdTimestamp)/864e5) : null;

    // ── card bodies ────────────────────────────────────────────────────
    const overviewBody = `
      <div class="fg-facts-grid">${fact('Recorded health score',score==null?'Not supplied':score+' / 100')}${fact('Health assessment time',a.health_assessed_at?OpsModal.fmtDateTime(a.health_assessed_at):'Not supplied')}</div>
      ${OpsModal.kpiStrip([
        {label:'Assets returned',value:Array.isArray(a.assets)?assetsArr.length:'Unavailable'},
        {label:'Linked devices reported',value:Array.isArray(a.devices)?devicesArr.length:reportedCount(a.sentinel_count)??'Unavailable',sub:'Not proof of installation or live coverage'},
        {label:'Reported open incidents',value:Array.isArray(a.incidents)?openIncidentCount(a.incidents):reportedCount(a.open_incidents)??'Unavailable'},
        {label:'Days since registration',value:daysMonitored??'Not supplied'}
      ])}
      ${a.issue_description ? `<div class="fg-record-description">${a.issue_description}</div>` : ''}`;

    const verified = a.location_verified === true;
    const mapBody = (a.latitude && a.longitude)
      ? `<div class="prd-mapbox"><div style="text-align:center;">
           <div class="lv-mono" style="font-size:var(--fs-md);color:var(--ink);font-weight:700;">${(+a.latitude).toFixed(6)}, ${(+a.longitude).toFixed(6)}</div>
           <div style="font-size:var(--fs-xs);color:${verified ? 'var(--ok)' : 'var(--warn)'};margin-top:4px;font-weight:600;">${verified ? '✓ Confirmed location' : 'Approximate — from address, not yet confirmed'}</div>
         </div></div>
         <div class="prd-actions" style="margin-top:12px;">
           <button class="fg-action" onclick="OpsNetwork.viewRecord('${pid}')">Open on network map →</button>
           <button class="primary fg-action fg-action-primary" onclick="OpsProperties.setLocation('${pid}')">${verified ? 'Adjust location' : 'Verify location'}</button>
         </div>`
      : `${emptyBox(iDoc, 'Location unavailable', 'Valid coordinates were not supplied. Confirm and record the estate location before relying on map positioning.')}
         <div style="margin-top:12px;"><button class="primary fg-action fg-action-primary" onclick="OpsProperties.setLocation('${pid}')">Set location</button></div>`;

    const networkBody = assetsArr.length
      ? `<table class="lv-table"><thead><tr><th scope="col">Asset</th><th scope="col">Type</th><th scope="col">Health</th><th scope="col">Status</th></tr></thead>
         <tbody>${assetsArr.map(x => `<tr>
           <td class="strong">${L('assets', x.property_id, x.name || x.property_id)}</td>
           <td>${OpsModal.escape(OpsModal.label(x.type || 'unknown'))}</td>
           <td class="lv-mono">${OpsSpatial.risk(x.health_score)==='unknown'?'Not supplied':OpsModal.escape(x.health_score)+' / 100'}</td>
           <td>${statPill(x.status)}</td>
         </tr>`).join('')}</tbody></table>`
      : emptyBox(iBox, 'No linked drainage assets', 'No drainage assets were returned with this estate record.');

    const devicesBody = devicesArr.length
      ? `<table class="lv-table"><thead><tr><th scope="col">Device</th><th scope="col">Device ID</th><th scope="col">Registry state</th></tr></thead>
         <tbody>${devicesArr.map(d => `<tr>
           <td class="strong">${L('sensors', d.sensor_id, d.name || d.sensor_id)}</td>
           <td class="lv-mono">${d.sensor_id}</td>
           <td>${statPill(d.status)}</td>
         </tr>`).join('')}</tbody></table>`
      : emptyBox(iBox, 'No linked devices', 'No device links were returned with this estate record.');

    const maintenanceBody = ticketsArr.length
      ? ticketsArr.map(t => `<div class="fg-timeline-row">
          <div class="fg-timeline-icon">${iWrench}</div>
          <div><div class="fg-timeline-title">${L('maintenance', t.ticket_id, t.title || OpsModal.label(t.work_type || 'Maintenance task'))}</div>
          <div class="fg-timeline-meta">${t.assigned_team ? L('teams',t.assigned_team,t.assigned_team)+' · ' : ''}${statPill(t.status)}</div></div>
          <div class="fg-timeline-time">${dS(t.scheduled_date || t.created_at)}</div>
        </div>`).join('')
      : emptyBox(iWrench, 'No maintenance tasks', 'No maintenance tasks were returned with this estate record.');

    const incidentsBody = incidentsArr.length
      ? [...incidentsArr].sort((a,b)=>Number(isOpenIncident(b))-Number(isOpenIncident(a))).map(al => `<div class="fg-timeline-row">
          <div class="fg-timeline-icon">${OpsSpatial.icon('incident')}</div>
          <div><div class="fg-timeline-title">${L('alerts', al.alert_id, OpsModal.label(al.alert_type || 'Incident'))} ${sevPill(al.severity)}</div>
          <div class="fg-timeline-meta">${OpsModal.escape(al.alert_id || al.id || 'Reference not supplied')} · ${OpsModal.escape(OpsModal.label(al.status || 'Unknown status'))}</div></div>
          <div class="fg-timeline-time">${OpsModal.fmtDateTime(al.created_at)}</div>
        </div>`).join('')
      : emptyBox(iAlert, 'No incidents returned', 'No incidents were returned with this estate record.');

    const reportsBody = inspections.length
      ? `<table class="lv-table"><thead><tr><th scope="col">Inspection</th><th scope="col">Status</th><th scope="col">Team</th><th scope="col">Score</th><th scope="col">Date</th></tr></thead>
         <tbody>${inspections.map(i => `<tr>
           <td class="strong lv-mono">${i.inspection_id}</td>
           <td>${statPill(i.status)}</td>
           <td>${i.assigned_team ? L('teams', i.assigned_team, i.assigned_team) : '—'}</td>
           <td class="lv-mono">${i.drainage_condition_score != null ? OpsModal.escape(i.drainage_condition_score) + ' / 10' : 'Not supplied'}</td>
           <td class="lv-mono">${dS(i.scheduled_date)}</td>
         </tr>`).join('')}</tbody></table>`
      : emptyBox(iDoc, 'No reports', 'No inspection reports are linked to this estate.');

    const contactsBody = (a.client_name || a.client_email || a.client_phone)
      ? `<div class="fgd-fact"><span class="k">Client</span><span class="v">${clientLink}</span></div>
         <div class="fgd-fact"><span class="k">Email</span><span class="v">${a.client_email || '—'}</span></div>
         <div class="fgd-fact"><span class="k">Phone</span><span class="v">${a.client_phone || '—'}</span></div>`
      : emptyBox(iUser, 'Contact details unavailable', 'Contact details were not supplied with this estate record. Confirm the account and contact information before arranging access.');

    const billingBody = (invoices.length || quotes.length)
      ? `<table class="lv-table"><thead><tr><th scope="col">Ref</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Due</th></tr></thead>
         <tbody>${invoices.map(inv => `<tr>
           <td class="strong">${L('billing', inv.invoice_id, inv.invoice_id)}</td>
           <td class="num">${OpsModal.money(inv.total_amount,inv.currency)}</td>
           <td>${payPill(inv.payment_status)}</td>
           <td class="lv-mono">${dS(inv.due_date)}</td>
         </tr>`).join('')}${quotes.map(q => `<tr>
           <td class="strong lv-mono">${q.quote_id}</td>
           <td class="num">${OpsModal.money(q.total_monthly,q.currency)}/mo</td>
           <td>${statPill(q.status)}</td>
           <td>—</td>
         </tr>`).join('')}</tbody></table>`
      : emptyBox(iDoc, 'No billing records returned', 'No invoices or service quotes were returned with this estate record.');

    // Timeline — derived from real records, newest first
    const events = [];
    if (a.created_at) events.push({ t:'Estate registered',m:a.property_name || '',d:a.created_at,ic:iCheck });
    inspections.forEach(i => events.push({t:'Inspection scheduled',m:OpsModal.label(i.status || 'unknown'),d:i.scheduled_date,ic:iCheck}));
    ticketsArr.forEach(t => events.push({t:t.title || OpsModal.label(t.work_type || 'Maintenance task'),m:OpsModal.label(t.status || 'unknown'),d:t.scheduled_date || t.created_at,ic:iWrench}));
    incidentsArr.forEach(al => events.push({t:OpsModal.label(al.alert_type || 'Incident'),m:OpsModal.label(al.severity || 'unknown'),d:al.created_at,ic:iAlert}));
    events.sort((x, y) => new Date(y.d || 0) - new Date(x.d || 0));
    const timelineBody = events.length
      ? events.slice(0, 10).map(e => `<div class="fg-timeline-row">
          <div class="fg-timeline-icon">${e.ic}</div>
          <div><div class="fg-timeline-title">${OpsModal.escape(e.t)}</div><div class="fg-timeline-meta">${OpsModal.escape(e.m || '—')}</div></div>
          <div class="fg-timeline-time">${OpsModal.fmtDateTime(e.d)}</div>
        </div>`).join('')
      : emptyBox(iCheck, 'No timeline entries returned', 'No dated events were returned from the supplied inspection, maintenance and incident feeds. This is not proof of complete estate history.');

    // ── section nav + cards ────────────────────────────────────────────
    const SECTIONS = [
      ['overview', 'Overview', overviewBody],
      ['weather', 'Estate weather', '<div id="estate-weather-panel"></div>'],
      ['monitoring', 'Water & devices', '<div id="estate-monitoring-panel"></div>'],
      ['incidents', 'Incidents & response', incidentsBody],
      ['maintenance', 'Maintenance', maintenanceBody],
      ['map', 'Estate map', mapBody],
      ['network', 'Drain network', networkBody],
      ['devices', 'Devices', devicesBody],
      ['reports', 'Reports', reportsBody],
      ['contacts', 'Contacts', contactsBody],
      ['billing', 'Billing', billingBody],
      ['timeline', 'Timeline', timelineBody],
    ];

    const actions = [
      Auth.hasNavAccess('jobs') && Auth.can('jobs.manage') ? '<button class="fg-action" onclick="OpsProperties.prepareWork()">Prepare work order</button>' : '',
      canMng() ? `<button class="fg-action" onclick="OpsProperties.editArea('${pid}')">Edit</button>` : '',
      `<button class="fg-action" onclick="OpsNetwork.viewRecord('${pid}')">Network</button>`,
      (a.status === 'submitted' && canMng()) ? `<button class="primary fg-action fg-action-primary" onclick="OpsProperties.scheduleInspection('${pid}','${(a.property_name || '').replace(/'/g, "\\'")}')">Schedule inspection</button>` : '',
      _isAdmin ? `<button class="danger fg-action" onclick="OpsProperties.deleteArea('${pid}','${(a.property_name || '').replace(/'/g, "\\'")}')">Delete</button>` : '',
    ].filter(Boolean).join('');

    const feeds = {network:'assets',devices:'devices',maintenance:'tickets',incidents:'incidents',reports:'inspections',billing:'invoices'};
    _container.innerHTML = OpsModal.detailShell({
      back:'OpsProperties.back()', crumbRoot:'Estates', title:OpsModal.escape(a.property_name || 'Estate'),
      avatar:{text:OpsSpatial.icon('estate')},
      chips:[{label:OpsModal.escape(statusLabel),cls:statusCls,dot:true},{label:OpsModal.escape(riskLabel),cls:riskCls}],
      meta:[['Location',OpsModal.escape(loc)],['Client',clientLink],['Registered',d1(a.created_at)]],
      decision:[['Service state',statusLabel],['Incident scope',Array.isArray(a.incidents)?`${a.incidents.length} returned`:'Unavailable'],['Next step',st==='submitted'?'Schedule the initial inspection':['caution','danger'].includes(riskCls)?'Review incidents and arrange response':st==='active'?'Review monitoring and preventive work':'Review the recorded onboarding stage']],
      actions,
      sections:SECTIONS.filter(([id])=>!['contacts','billing'].includes(id)).map(([id,title,body])=>({id,title,state:feeds[id] ? OpsModal.collectionState(a[feeds[id]]) : null,body:feeds[id] && !Array.isArray(a[feeds[id]]) ? '<div class="capability-note">This related feed was not supplied with the estate record.</div>' : body})).concat([{id:'administration',title:'Contacts & commercial',body:`<details class="capability-note estate-admin"><summary>Contacts, account and billing</summary><h3>Contacts</h3>${contactsBody}<h3>Billing</h3>${Array.isArray(a.invoices) ? billingBody : '<p>Billing feed was not supplied with this record.</p>'}</details>`}]),
      note:'An active estate record does not confirm live monitoring. Review device health and data freshness before making an operational assessment.',
    });
    if(typeof OpsWeather!=='undefined')OpsWeather.mount(_container.querySelector('#estate-weather-panel'),a);
    if(typeof OpsEstateMonitoring!=='undefined')OpsEstateMonitoring.mount(_container.querySelector('#estate-monitoring-panel'),a);
  }

  // ────────────────────────────────────────────────────────── ACTIONS
  async function editArea(propertyId) {
    if(!requireManage()) return;
    try {
      const res = await OpsModal.apiGet('/properties/' + propertyId);
      const a = OpsModal.readRecord(res,'Estate');
      OpsModal.open('Edit estate', `
        ${OpsModal.field('Estate name', 'property_name', 'text', a.property_name || '')}
        ${OpsModal.row([
          OpsModal.field('Pipeline status', 'status', 'select', a.status || 'submitted', {
            options: [
              { value: 'submitted', label: 'Submitted' }, { value: 'inspection_scheduled', label: 'Inspection scheduled' },
              { value: 'inspection_ongoing', label: 'Inspection ongoing' }, { value: 'report_ready', label: 'Report ready' },
              { value: 'quote_sent', label: 'Quote sent' }, { value: 'payment_pending', label: 'Payment pending' },
              { value: 'payment_completed', label: 'Payment completed' }, { value: 'deployment_scheduled', label: 'Deployment scheduled' },
              { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }, { value: 'cancelled', label: 'Cancelled' },
            ]
          }),
          OpsModal.field('Urgency', 'urgency_level', 'select', a.urgency_level || 'medium', {
            options: [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'critical', label: 'Critical' }]
          }),
        ])}
        ${OpsModal.field('Monthly fee (NGN)', 'monthly_fee', 'number', a.monthly_fee || '', { required: false, placeholder: 'e.g. 185000', sub: 'Setting a fee generates a monthly invoice' })}
      `, [
        { label: 'Cancel', onclick: 'OpsModal.close()', class: 'btn-ghost' },
        { label: 'Save estate', onclick: `OpsProperties.saveArea('${propertyId}')`, class: 'btn-primary', id: 'modal-save-btn' },
      ]);
    } catch(err) { OpsModal.open('Edit estate',OpsModal.failure('Estate',err,`OpsProperties.editArea('${sid(propertyId)}')`),[{label:'Close',onclick:'OpsModal.close()'}]); }
  }

  async function saveArea(propertyId) {
    if(!requireManage()) return;
    const data = OpsModal.getFormData();
    OpsModal.setLoading('modal-save-btn', true);
    try {
      await OpsModal.apiPut('/properties/' + propertyId, data);
      if (data.monthly_fee && parseFloat(data.monthly_fee) > 0) {
        try {
          await OpsModal.apiPost('/properties/' + propertyId + '/generate-invoice', { amount: parseFloat(data.monthly_fee), description: 'FlowGuard DaaS — Monthly Service Fee' });
        } catch (e) { console.warn('Invoice generation failed:', e.message); }
      }
      OpsModal.close();
      OpsModal.toast('Estate updated successfully', 'nominal');
      open(propertyId);
    } catch (err) {
      OpsModal.toast('Failed to update: ' + err.message, 'critical');
      OpsModal.setLoading('modal-save-btn', false);
    }
  }

  function deleteArea(propertyId, name) {
    if(!requireManage()) return;
    if(!_isAdmin) return OpsModal.toast('Only administrators can delete estates','watch');
    OpsModal.confirm(
      `Permanently delete property "${name}"? All inspections, quotes, and invoices linked to this property will also be removed.`,
      async function () {
        if(!requireManage() || !_isAdmin) return;
        OpsModal.setLoading('modal-confirm-btn', true);
        try {
          await OpsModal.apiDelete('/properties/' + propertyId);
          OpsModal.close();
          OpsModal.toast(`Estate "${name}" deleted`, 'nominal');
          back();
        } catch (err) {
          OpsModal.toast('Delete failed: ' + err.message, 'critical');
          OpsModal.setLoading('modal-confirm-btn', false);
        }
      }
    );
  }

  async function scheduleInspection(propertyId, propertyName) {
    if(!requireManage()) return;
    let teams = [];
    try { teams = OpsModal.readArray(await OpsModal.apiGet('/teams'),'Team directory',['data','teams']); }
    catch(err) { OpsModal.open('Schedule inspection',OpsModal.failure('Team choices',err,`OpsProperties.scheduleInspection('${OpsModal.sid(propertyId)}')`),[{label:'Close',onclick:'OpsModal.close()'}]);return; }
    const teamOptions = teams.length ? teams.map(t => ({ value: t.team_id || t.id, label: t.team_name || t.name })) : [{ value: '', label: 'No teams available' }];
    OpsModal.open(`Schedule inspection — ${propertyName || 'Estate'}`, `
      ${OpsModal.field('Scheduled date', 'scheduled_date', 'date', '')}
      ${OpsModal.field('Assign team', 'team_id', 'select', '', { options: teamOptions, required: false })}
      ${OpsModal.field('Inspector notes (optional)', 'notes', 'textarea', '', { required: false, rows: 3, placeholder: 'Access instructions, key contacts, equipment needed…' })}
      ${OpsModal.field('Priority', 'priority', 'select', 'standard', { options: [{ value: 'standard', label: 'Standard' }, { value: 'priority', label: 'Priority' }, { value: 'urgent', label: 'Urgent' }] })}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()', class: 'btn-ghost' },
      { label: 'Schedule inspection', onclick: `OpsProperties.confirmSchedule('${propertyId}')`, class: 'btn-primary', id: 'modal-save-btn' },
    ]);
  }

  async function confirmSchedule(propertyId) {
    if(!requireManage()) return;
    const data = OpsModal.getFormData();
    if (!data.scheduled_date) { OpsModal.toast('Please select a date', 'warning'); return; }
    OpsModal.setLoading('modal-save-btn', true);
    try {
      await OpsModal.apiPost('/properties/' + propertyId + '/schedule-inspection', data);
      OpsModal.close();
      OpsModal.toast('Inspection scheduled successfully', 'nominal');
      open(propertyId);
    } catch (err) {
      OpsModal.toast('Failed to schedule: ' + err.message, 'critical');
      OpsModal.setLoading('modal-save-btn', false);
    }
  }

  // ────────────────────────────────────── LOCATION (pin tool)
  // Coordinates are the source of truth for the map, dispatch and risk scoring.
  // Addresses geocode to a point on registration, but a geocoder can miss by a
  // district — so an operator can drop/drag the pin to the exact spot and mark
  // it confirmed. No client-side geocoding (CSP blocks Nominatim from the
  // browser): the pin + editable lat/long are the interface.
  let _leafletP = null;
  function ensureLeaflet() {
    return _leafletP || (_leafletP = new Promise(res => {
      function css(href, id) { if (id && document.getElementById(id)) return; var c = document.createElement('link'); if (id) c.id = id; c.rel = 'stylesheet'; c.href = href; document.head.appendChild(c); }
      function js(src) { return new Promise(r => { var s = document.createElement('script'); s.src = src; s.onload = r; s.onerror = r; document.head.appendChild(s); }); }
      css('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'fg-leaflet-css');
      css('https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css', 'fg-maplibre-css');
      var pre = [];
      if (!window.L) pre.push(js('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'));
      if (!window.maplibregl) pre.push(js('https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'));
      Promise.all(pre).then(function () {
        if (window.L && window.L.maplibreGL) return res();
        js('https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.0.22/leaflet-maplibre-gl.js').then(res);
      });
    }));
  }

  async function setLocation(propertyId) {
    if(!requireManage()) return;
    let a;
    try { a = OpsModal.readRecord(await OpsModal.apiGet('/properties/' + propertyId),'Estate'); }
    catch(err) { return OpsModal.open('Set estate location',OpsModal.failure('Estate',err,`OpsProperties.setLocation('${sid(propertyId)}')`),[{label:'Close',onclick:'OpsModal.close()'}]); }
    const validCoordinate = (value,limit) => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= limit;
    const hasC = validCoordinate(a.latitude,90) && validCoordinate(a.longitude,180);
    const lat0 = hasC ? Number(a.latitude) : 6.5244;
    const lon0 = hasC ? Number(a.longitude) : 3.3792;
    OpsModal.open('Set estate location', `
      ${OpsModal.textBlock('Location reference','Place the pin at the estate gate or enter both coordinates. The initial city-centre map position is only a reference, not a saved estate location.')}
      <div id="plm-map" style="height:320px;border-radius:var(--radius-panel);overflow:hidden;border:1px solid var(--border);background:var(--surface-2);"></div>
      ${OpsModal.row([OpsModal.field('Latitude','plm-lat','number',hasC ? lat0.toFixed(6) : '',{placeholder:'−90 to 90',min:-90,max:90,step:'any'}),OpsModal.field('Longitude','plm-lon','number',hasC ? lon0.toFixed(6) : '',{placeholder:'−180 to 180',min:-180,max:180,step:'any'})])}
      ${hasC && a.location_verified === true ? '' : OpsModal.textBlock('Confirmation required',hasC ? 'The supplied coordinates are unconfirmed. Check the estate gate before saving.' : 'No valid estate coordinates were supplied. Place the pin or enter both coordinates before saving.')}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()', class: 'btn-ghost' },
      { label: 'Save location', onclick: `OpsProperties.saveLocation('${propertyId}')`, class: 'btn-primary', id: 'modal-save-btn' },
    ]);
    await ensureLeaflet();
    const holder = document.getElementById('plm-map');
    if (!holder || !window.L) return;
    const map = L.map(holder, { center: [lat0, lon0], zoom: hasC ? 15 : 11, attributionControl: false });
    const mapTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'positron';
    L.maplibreGL({ style: 'https://tiles.openfreemap.org/styles/'+mapTheme, attribution: '&copy; <a href="https://openfreemap.org">OpenFreeMap</a> &copy; OSM' }).addTo(map);
    const mk = L.marker([lat0, lon0], { draggable: true, title:hasC ? 'Estate gate location — check before saving' : 'Reference pin — place at the estate gate before saving' }).addTo(map);
    OpsModal.keyboardMarker(mk);
    const latI = document.querySelector('.ops-modal-body [name="plm-lat"]'), lonI = document.querySelector('.ops-modal-body [name="plm-lon"]');
    const sync = ll => { latI.value = ll.lat.toFixed(6); lonI.value = ll.lng.toFixed(6); };
    mk.on('drag', e => sync(e.target.getLatLng()));
    map.on('click', e => { mk.setLatLng(e.latlng); sync(e.latlng); });
    const fromInputs = () => { const la = Number(latI.value), lo = Number(lonI.value); if (latI.value.trim() && lonI.value.trim() && validCoordinate(la,90) && validCoordinate(lo,180)) { mk.setLatLng([la, lo]); map.panTo([la, lo]); } };
    latI.addEventListener('change', fromInputs); lonI.addEventListener('change', fromInputs);
    setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 60);
  }

  async function saveLocation(propertyId) {
    if(!requireManage()) return;
    const location = OpsModal.getFormData();
    const latText = String(location['plm-lat'] ?? '').trim();
    const lonText = String(location['plm-lon'] ?? '').trim();
    const la = Number(latText), lo = Number(lonText);
    if (!latText || !lonText || !Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la)>90 || Math.abs(lo)>180) return OpsModal.toast('Enter valid latitude (−90 to 90) and longitude (−180 to 180), or place the pin','watch');
    OpsModal.setLoading('modal-save-btn', true);
    try {
      await OpsModal.apiPut('/properties/' + propertyId + '/location', { latitude: la, longitude: lo });
      OpsModal.close();
      OpsModal.toast('Location saved', 'nominal');
      open(propertyId);
    } catch (err) {
      OpsModal.toast('Failed to save location: ' + err.message, 'critical');
      OpsModal.setLoading('modal-save-btn', false);
    }
  }

  return { render, setWorkspace, filterStage, search, open, back, prepareWork, prepareMaintenance, editArea, saveArea, deleteArea, scheduleInspection, confirmSchedule, setLocation, saveLocation,loadMore:()=>loadAreas(true) };

})();
