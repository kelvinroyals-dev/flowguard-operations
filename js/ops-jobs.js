/* ══════════════════════════════════════════════════════════════
   FlowGuard Ops — FIELD JOBS
   FlowGuard-side management of jobs dispatched to external Service
   Provider Organisations. Create → dispatch → (provider works) →
   verify / reject. Backed by /api/v1/jobs (staff endpoints).

   Chrome deliberately matches the established module pattern
   (see Maintenance Planner): title+subtitle header, ghost primary
   action, a bordered .lv-wrap panel with .lv-search + .um-filter,
   and a .lv-table with uppercase headers + .lv-status pills. Detail
   uses the shared OpsModal.detailShell like every other module.
   ══════════════════════════════════════════════════════════════ */
const OpsJobs = (function () {
  'use strict';
  const esc = (OpsModal && OpsModal.escape) ? OpsModal.escape : (v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])));
  const dash = v => (v == null || v === '') ? OpsModal.missing.absent : v;
  const fmtDate = d => OpsModal.fmtDate(d);
  const fmtDT   = d => OpsModal.fmtDateTime(d);

  const JOB_TYPES = [
    { value:'inspection',         label:'Inspection' },
    { value:'drain_cleaning',     label:'Drain cleaning' },
    { value:'sensor_maintenance', label:'Sensor maintenance' },
    { value:'repair',             label:'Repair' },
    { value:'survey',             label:'Survey' },
    { value:'other',              label:'Other' },
  ];
  const JT = Object.fromEntries(JOB_TYPES.map(t => [t.value, t.label]));
  const PRIORITIES = [
    { value:'low', label:'Low' }, { value:'normal', label:'Normal' },
    { value:'high', label:'High' }, { value:'urgent', label:'Urgent' },
  ];
  const PR = Object.fromEntries(PRIORITIES.map(p => [p.value, p.label]));

  // status → [ lv-status modifier, label ]
  const STATUS = {
    draft:       ['neutral','Draft'],
    dispatched:  ['warn','Dispatched'],
    accepted:    ['warn','Accepted'],
    en_route:    ['warn','En route'],
    in_progress: ['warn','In progress'],
    completed:   ['warn','Awaiting verification'],
    verified:    ['ok','Verified'],
    declined:    ['danger','Declined'],
    rejected:    ['danger','Returned for rework'],
    cancelled:   ['neutral','Cancelled'],
  };
  const statusPill = s => OpsModal.status(s,(STATUS[s] || ['neutral',OpsModal.label(s)])[1],null,'workorder');
  // list buckets
  const BUCKET = {
    active: ['dispatched','accepted','en_route','in_progress','declined'],
    review: ['completed'],
    done:   ['verified'],
    draft:  ['draft'],
  };
  const IN_FLIGHT = ['dispatched','accepted','en_route','in_progress'];
  const isOverdue = j => j.sla_due_at && IN_FLIGHT.includes(j.status) && new Date(j.sla_due_at).getTime() < Date.now();


  let _container = null, _filter = 'active', _term = '', _rows = [];
  let _providerScope = '';
  let _loadRevision = 0;
  function scopedRows() { return _providerScope ? _rows.filter(j=>String(j.service_provider_org_id)===_providerScope) : _rows; }
  function forProvider(id) { if (!Auth.hasNavAccess('jobs')) return OpsModal.toast('You do not have access to work orders', 'watch');const value=Number(id);if (!Number.isInteger(value)||value<=0) return OpsModal.toast('Provider identifier is unavailable', 'watch');if(typeof OpsServices!=='undefined')OpsServices.selectView('jobs');_providerScope=String(value);_filter='all';_term='';switchTab('jobs');if (_container) render(_container); }
  function clearScope() { _providerScope='';if (_container) render(_container); }
  const _messageDrafts = new Map(), _sending = new Set();
  const canManage = () => Auth.hasNavAccess('jobs') && Auth.can('jobs.manage');
  function requireManage() { if (canManage()) return true; OpsModal.toast('You do not have permission to change work orders', 'watch'); return false; }
  function retainMessage(id, value) { _messageDrafts.set(String(id), value); }
  function evidencePoint(e) {
    const valid = (v,limit) => (typeof v === 'number' || typeof v === 'string' && v.trim() !== '') && Number.isFinite(Number(v)) && Math.abs(Number(v)) <= limit;
    return valid(e.lat,90) && valid(e.lng,180) ? `${Number(e.lat).toFixed(4)}, ${Number(e.lng).toFixed(4)}` : null;
  }
  function usableEvidence(e) {
    if (e.kind === 'note') return typeof e.caption === 'string' && e.caption.trim().length > 0;
    if (e.kind === 'gps') return !!evidencePoint(e);
    return typeof e.file_url === 'string' && /^https?:\/\//i.test(e.file_url);
  }
  function evidenceReview(j) {
    const supplied = Array.isArray(j.evidence);
    const entries = supplied ? j.evidence.filter(e=>e && typeof e === 'object') : [];
    const reqs = Array.isArray(j.required_evidence) ? j.required_evidence.filter(r=>r && typeof r === 'object') : null;
    const reqHtml = reqs === null ? '<div class="capability-note">Evidence requirements were not supplied.</div>' : !reqs.length ? '<div class="capability-note">No evidence requirements returned.</div>' : reqs.map(r=>{
      const matching=entries.filter(e=>e.evidence_key===r.key);
      const usable=matching.some(e=>(!r.kind || e.kind===r.kind) && usableEvidence(e));
      const state=!supplied ? 'Unknown' : usable ? 'Supplied · review needed' : matching.length ? 'Supplied · incomplete or mismatched' : 'Not supplied';
      return `<div class="jb-ev"><span>${esc(r.label || (r.key ? OpsModal.label(r.key) : 'Requirement'))}${r.required === false ? ' · Optional' : ''}</span><span class="lv-status neutral">${state}</span></div>`;
    }).join('');
    const review=entries.map((e,index)=>{
      const file=!['note','gps'].includes(e.kind);
      const requirement=reqs?.find(r=>r.key===e.evidence_key);
      const title=OpsModal.label(e.kind)+' · '+(index+1);
      const facts=OpsModal.fact('Requirement',esc(requirement?.label || (e.evidence_key ? OpsModal.label(e.evidence_key) : 'Not supplied')))+OpsModal.fact('Requirement reference',esc(dash(e.evidence_key)))+OpsModal.fact('Reported coordinates',evidencePoint(e) || 'Not supplied')+(file ? '' : OpsModal.fact('Captured',fmtDT(e.captured_at))+OpsModal.fact('Uploaded',fmtDT(e.created_at)));
      const content=file ? OpsModal.evidence([e]) : (e.caption ? `<div class="jb-ev-caption"><div class="k">${e.kind==='note'?'Findings':'Caption'}</div><p>${esc(e.caption)}</p></div>` : '');
      return `<article class="fg-evidence-group"><h3>${esc(title)}</h3>${content}<div class="fg-facts-grid">${facts}</div></article>`;
    }).join('');
    if(!entries.length && !reqs?.length)return OpsModal.emptyState('',supplied?'No evidence returned':'Evidence unavailable',reqs===null?'Evidence requirements were not supplied. Review the work scope before accepting completion.':'No evidence requirements returned. Review the work scope before accepting completion.',{compact:true});
    return '<p class="fg-evidence-guidance">Review supplied files and findings before accepting completion.</p>' + reqHtml + (supplied ? review || OpsModal.evidence([],'No evidence returned with this work order.') : OpsModal.evidence(undefined));
  }

  async function render(container) {
    _container = container;
    if(typeof OpsServiceIntake!=='undefined'&&['requests','plans'].includes(OpsServices.currentView()))return OpsServiceIntake.render(container,OpsServices.currentView());
    container.innerHTML = `
      ${OpsModal.pageHeader({title:'Services',subtitle:'Provider work orders · Coordinate assignments, track delivery and review completion',actions:canManage() ? '<button class="fg-action fg-action-primary" onclick="OpsJobs.newJob()">Create work order</button>' : ''})}
      ${typeof OpsServices !== 'undefined' ? OpsServices.navigation('jobs') : ''}
      ${_providerScope ? OpsModal.provenance([['Provider filter',_providerScope],['Feed limit','Up to 300 returned work orders']],'This scoped feed is not a complete platform total.')+'<button class="fg-action" onclick="OpsJobs.clearScope()">Show all providers</button>' : ''}
      <div id="jb-kpis" style="margin-bottom:16px"></div>
      <div class="lv-wrap">
        <div class="lv-toolbar">
          <div class="lv-search">
            ${OpsModal.actionIcon("search")}
            <input id="jb-search" aria-label="Search work orders" placeholder="Search work orders…" oninput="OpsJobs.search(this.value)">
          </div>
          <div class="lv-toolbar-right">
            <select aria-label="Work order state" class="um-filter" onchange="OpsJobs.filter(this.value)">
              <option value="active"${_filter==='active'?' selected':''}>Active</option>
              <option value="overdue"${_filter==='overdue'?' selected':''}>Overdue</option>
              <option value="review"${_filter==='review'?' selected':''}>Awaiting verification</option>
              <option value="done"${_filter==='done'?' selected':''}>Verified</option>
              <option value="draft"${_filter==='draft'?' selected':''}>Drafts</option>
              <option value="all"${_filter==='all'?' selected':''}>All</option>
            </select>
          </div>
        </div>
        <div id="jb-body">${OpsModal.loading('Loading work orders…')}</div>
      </div>`;
    await load();
  }

  async function load() {
    const revision=++_loadRevision;
    const body = document.getElementById('jb-body');
    try {
      const res = await OpsModal.apiGet('/jobs'+(_providerScope ? '?org='+encodeURIComponent(_providerScope) : ''));
      if (revision!==_loadRevision) return;
      if (!Array.isArray(res && res.data)) throw new Error('Work-order list was not supplied');
      _rows = res.data;
      drawKpis();
      draw();
    } catch (err) {
      if (revision!==_loadRevision) return;
      if (body) body.innerHTML = OpsModal.failure('Work orders',err,"reloadTab('jobs')",false);
    }
  }

  function drawKpis() {
    const el = document.getElementById('jb-kpis');
    if (!el) return;
    const open     = scopedRows().filter(j => IN_FLIGHT.includes(j.status)).length;
    const overdue  = scopedRows().filter(isOverdue).length;
    const awaiting = scopedRows().filter(j => j.status === 'completed').length;
    const verified = scopedRows().filter(j => j.status === 'verified').length;
    el.innerHTML = OpsModal.kpiStrip([
      { label: 'Open', value: open, sub: open ? 'In flight' : 'None' },
      { label: 'Overdue', value: overdue, sub: overdue ? 'Past response deadline' : 'None reported', subClass: overdue ? 'err' : '' },
      { label: 'Awaiting verification', value: awaiting, sub: awaiting ? 'Needs review' : 'None reported', subClass: awaiting ? 'warn' : '' },
      { label: 'Verified', value: verified, sub: verified ? 'Signed off' : 'None reported', subClass: verified ? 'ok' : '' },
    ]) + OpsModal.provenance([['Scope',`${scopedRows().length} returned work orders in the selected estate scope`]],'Counts precede search and response-state filters. They are not platform-wide totals; unreported deadlines do not prove work is on track.');
  }

  function draw() {
    const body = document.getElementById('jb-body');
    if (!body) return;
    let rows = scopedRows().slice();
    if (_filter === 'overdue') rows = rows.filter(isOverdue);
    else if (BUCKET[_filter]) rows = rows.filter(j => BUCKET[_filter].includes(j.status));
    if (_term) rows = rows.filter(j => `${j.reference||''} ${j.title||''} ${j.property_name||''} ${j.provider_name||''} ${j.job_type||''}`.toLowerCase().includes(_term));
    if (!rows.length) {
      body.innerHTML = OpsModal.emptyState('', !_rows.length ? 'No work orders returned' : _term ? 'No matching work orders' : _filter === 'all' ? 'No work orders returned' : 'No work orders in this view',
        !_rows.length ? 'No work orders were returned by this feed.' : _term ? 'Try a different search or status filter.' : _filter === 'all' ? 'Create a work order to dispatch work to a provider.' : 'Change the status filter to review other returned work orders.');
      return;
    }
    FGPaginator.create(rows,{pageSize:25,containerId:'jb-body'}).render(renderRows);
  }
  function renderRows(rows) {
    const body=document.getElementById('jb-body'); if(!body) return;
    const L = OpsModal.link;
    body.innerHTML = `
      <div class="lv-scroll">
        <table class="lv-table fg-mobile-cards">
          <thead><tr>
            <th scope="col">Work order</th><th scope="col">Estate</th><th scope="col">Provider</th><th scope="col">Priority</th><th scope="col">Status</th><th scope="col">Response deadline</th>
          </tr></thead>
          <tbody>
            ${rows.map(j => {
              const overdue = j.sla_due_at && ['dispatched','accepted','en_route','in_progress'].includes(j.status) && new Date(j.sla_due_at).getTime() < Date.now();
              const propCell = j.property_id ? L('properties', j.property_id, j.property_name || j.property_id) : `<span class="lv-dash">${esc(dash(j.property_name))}</span>`;
              return `<tr class="clickable" onclick="OpsJobs.openJob('${OpsModal.sid(j.id)}')">
                <td data-label="Work order">
                  <div class="lv-name-cell">
                    <div class="lv-avatar" aria-hidden="true">${OpsModal.entityIcon('jobs')}</div>
                    <div style="min-width:0"><button type="button" class="record-link lv-name" onclick="event.stopPropagation();OpsJobs.openJob('${OpsModal.sid(j.id)}')">${esc(dash(j.title))}</button><div class="lv-source"><span class="lv-mono">${esc(dash(j.reference))}</span> · ${esc(JT[j.job_type]||OpsModal.label(j.job_type))}</div></div>
                  </div>
                </td>
                <td data-label="Estate">${propCell}</td>
                <td data-label="Provider">${j.service_provider_org_id ? OpsModal.link('providers',j.service_provider_org_id,esc(j.provider_name || j.service_provider_org_id)) : j.provider_name ? esc(j.provider_name) : '<span class="lv-dash">Not supplied</span>'}</td>
                <td data-label="Priority">${OpsModal.status(j.priority,null,null,'priority')}</td>
                <td data-label="Status">${statusPill(j.status)}</td>
                <td data-label="Response deadline" class="lv-mono" style="${overdue?'color:var(--err);font-weight:700;':''}">${j.sla_due_at?fmtDT(j.sla_due_at):OpsModal.missing.absent}${overdue?' · overdue':''}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function search(q) { _term = (q || '').trim().toLowerCase(); draw(); }
  function filter(k) { _filter = k; draw(); }
  function back() { if (_container) render(_container); }

  // ── DETAIL (shared detailShell) ────────────────────────────────────────
  async function openJob(id) {
    const revision = ++_loadRevision;
    if(typeof OpsServices!=='undefined')OpsServices.selectView('jobs');
    if (_container) _container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--ink-3)">Loading…</div>`;
    let j;
    try { j = OpsModal.readRecord(await OpsModal.apiGet('/jobs/' + id),'Work order'); }
    catch (err) { if(revision===_loadRevision&&_container)_container.innerHTML=OpsModal.recordFailure('Work order',err,`OpsJobs.openJob('${OpsModal.sid(id)}')`,'OpsJobs.back()');return; }
    if (revision !== _loadRevision) return;
    const F = OpsModal.fact;

    const detailsBody = `<div class="fg-facts-grid">
      ${j.source_alert_id ? F('Source incident',OpsModal.link('alerts',j.source_alert_id,j.source_alert_id)) : ''}
      ${j.source_ticket_id ? F('Source support request',OpsModal.link('support',j.source_ticket_id,j.source_ticket_id)) : ''}
      ${F('Priority', OpsModal.status(j.priority,null,null,'priority'))}
      ${F('Estate', j.property_id ? OpsModal.link('properties', j.property_id, j.property_name || j.property_id) : esc(dash(j.property_name)))}
      ${F('Provider', j.service_provider_org_id ? OpsModal.link('providers',j.service_provider_org_id,esc(j.provider_name || j.service_provider_org_id)) : j.provider_name ? esc(j.provider_name) : j.status === 'draft' ? 'Not dispatched' : 'Not supplied')}
      ${F('Technician', esc(dash(j.technician_name)))}
      ${F('Scheduled', fmtDT(j.scheduled_for))}
      ${j.status === 'verified' ? F('Verified',fmtDT(j.verified_at)) + F('Verified by',esc(j.verified_by_name || 'Not supplied')) : ''}
    </div>${OpsModal.textBlock('Work scope',j.description)}
      ${j.status==='verified' ? OpsModal.textBlock('Verification note',j.verify_note) : ''}
      ${j.decline_reason ? OpsModal.textBlock('Decline reason',j.decline_reason) : ''}
      ${j.reject_reason ? OpsModal.textBlock('Rework reason',j.reject_reason) : ''}
      ${j.cancel_reason ? OpsModal.textBlock('Cancellation reason',j.cancel_reason) : ''}`;

    const evidenceBody = evidenceReview(j);

    const LB = { created:'Created', dispatched:'Dispatched to provider', accepted:'Accepted by provider', declined:'Declined by provider', en_route:'Technician en route', started:'Work started', completed:'Marked complete', verified:'Verified by FlowGuard', rejected:'Returned for rework', cancelled:'Cancelled', evidence_added:'Evidence added', note:'Note' };
    const tlBody = !Array.isArray(j.events) ? '<div class="capability-note">Activity feed was not supplied with this work order.</div>' : j.events.length
      ? j.events.map(e => `<div class="fg-timeline-row"><div class="fg-timeline-icon">${OpsModal.entityIcon('jobs')}</div><div><div class="fg-timeline-title">${esc(LB[e.event_type]||OpsModal.label(e.event_type))}</div><div class="fg-timeline-meta">${esc(e.note || '')}${e.actor_type?' · '+esc(OpsModal.label(e.actor_type)):''}</div></div><div class="fg-timeline-time">${fmtDT(e.created_at)}</div></div>`).join('')
      : OpsModal.emptyState('','No activity returned','No work-order events were returned with this record.');

    let actions = '';
    if (['dispatched','accepted','en_route','in_progress'].includes(j.status)) actions += `<button type="button" class="fg-action fg-action-primary" onclick="OpsModal.selectRecordTab(this.closest('.fgd'),'messages',true)">Review provider updates</button>`;
    const safeId = OpsModal.sid(j.id);
    if (canManage() && ['draft','declined'].includes(j.status)) actions += `<button class="fg-action fg-action-primary" onclick="OpsJobs._dispatchForm('${safeId}')">Dispatch</button>`;
    if (canManage() && j.status === 'completed') actions += `<button class="fg-action" onclick="OpsJobs._rejectForm('${safeId}')">Return for rework</button> <button class="fg-action fg-action-primary" onclick="OpsJobs._verify('${safeId}')">Verify completion</button>`;
    if(j.status==='rejected') actions += `<button type="button" class="fg-action fg-action-primary" onclick="OpsModal.selectRecordTab(this.closest('.fgd'),'evidence',true)">Review rework requirements</button>`;
    if (canManage() && STATUS[j.status] && !['verified','cancelled'].includes(j.status)) actions += ` <button class="fg-action danger" onclick="OpsJobs._cancel('${safeId}')">Cancel</button>`;

    let comments = null;
    try { comments = (await OpsModal.apiGet('/jobs/' + id + '/comments')).data; } catch (_) {}
    if (revision !== _loadRevision) return;
    const cBody = '<div class="fg-message-thread">'+(!Array.isArray(comments) ? OpsModal.failure('Provider messages',new Error('Message history was not supplied. This is not an empty conversation.'),`OpsJobs.openJob('${safeId}')`) : comments.length
      ? comments.map(c=>OpsModal.message({side:c.author_type==='internal'?'staff':'external',author:c.author_name,body:c.body,createdAt:c.created_at})).join('')
      : OpsModal.emptyState('','No messages returned','No provider messages were returned for this work order.'))+'</div>'
      + (canManage() ? `<div class="jb-message-compose"><label for="jb-cmt">Message the provider</label><textarea class="ops-input" id="jb-cmt" rows="3" placeholder="Message the provider about this job…" oninput="OpsJobs.retainMessage('${safeId}',this.value)">${esc(_messageDrafts.get(String(id)) || '')}</textarea></div><div class="capability-note">${window.FG_LOCAL_PREVIEW ? 'Design preview · message sending is disabled. You can test a draft locally.' : 'Unsent text is retained in this tab only, not saved to the server.'}</div>
         <div class="fg-action-footer"><button id="jb-send" class="fg-action fg-action-primary" onclick="OpsJobs._postComment('${safeId}')" ${window.FG_LOCAL_PREVIEW || _sending.has(String(id)) ? 'disabled' : ''}>Send message</button></div>` : '<div class="capability-note">You have read-only access to this work order.</div>');

    const st = STATUS[j.status] || ['neutral',OpsModal.label(j.status)];
    _container.innerHTML = OpsModal.detailShell({
      back: 'OpsJobs.back()', crumbRoot: 'Services / Provider work orders', title: esc(dash(j.title)),
      avatar:{text:OpsModal.entityIcon('jobs')},
      chips: [{ cls: OpsModal.statusTone(j.status,'workorder'), label: st[1], dot: true }],
      meta: [['Ref ', esc(dash(j.reference))], ['Type ', esc(JT[j.job_type]||OpsModal.label(j.job_type))]],
      decision:[['Response owner',j.provider_name || 'Not supplied'],['Response deadline',OpsModal.fmtDateTime(j.sla_due_at)],['Next step',j.status==='completed'?'Review evidence and verify completion':j.status==='rejected'?'Review rework requirements and provider updates':['draft','declined'].includes(j.status)?'Choose a provider and dispatch':['verified','cancelled'].includes(j.status)?'Review recorded outcome':['dispatched','accepted','en_route','in_progress'].includes(j.status)?'Review provider updates':'Confirm work-order state before taking action']],
      actions,
      sections: [
        { id:'details',  title:'Work summary', body: detailsBody },
        { id:'evidence', title:'Evidence',    body: evidenceBody },
        { id:'messages', title:'Messages',    body: cBody },
        { id:'activity', title:'Activity',    body: tlBody },
      ],
    });
  }
  async function _postComment(id) {
    if (!requireManage() || _sending.has(String(id))) return;
    const el = document.getElementById('jb-cmt'); const body = el ? el.value.trim() : '';
    if (!body) { OpsModal.toast('Type a message first', 'warning'); return; }
    const draft = el.value; retainMessage(id,draft); _sending.add(String(id));
    const button = document.getElementById('jb-send'); if (button) button.disabled = true;
    try {
      const res = await OpsModal.apiPost('/jobs/' + id + '/comments', { body });
      if (res && res.success) { if (_messageDrafts.get(String(id)) === draft) _messageDrafts.delete(String(id)); await openJob(id); } else OpsModal.toast((res && res.error) || 'Failed to send', 'error');
    } catch (err) { OpsModal.toast('Failed to send: ' + (err.message||''), 'error'); }
    finally { _sending.delete(String(id)); const current = document.getElementById('jb-send'); if (current) current.disabled = false; }
  }

  // ── CREATE ─────────────────────────────────────────────────────────────
  async function newJob(context = {}) {
    if (!Auth.hasNavAccess('jobs') || !Auth.can('jobs.manage')) return OpsModal.toast('You do not have permission to create work orders', 'watch');
    if (context.property_id || context.title) switchTab('jobs');
    let props = [], provs = [], propertiesAvailable = false, providersAvailable = false;
    try { const data = (await OpsModal.apiGet('/properties/all')).data; if (Array.isArray(data)) { props = data; propertiesAvailable = true; } } catch (_) {}
    try { const data = (await OpsModal.apiGet('/service-providers?status=active')).data; if (Array.isArray(data)) { provs = data; providersAvailable = true; } } catch (_) {}
    const hasSourceEstate = context.property_id != null && String(context.property_id) !== '';
    const estateReturned = props.some(p=>String(p.property_id) === String(context.property_id));
    _creationState = { propertiesAvailable, requiresEstate:hasSourceEstate && !estateReturned, sourceAlertId:context.source_alert_id || null, sourceTicketId:context.source_ticket_id || null };
    const propOpts = [{ value:'', label:'No specific estate' }].concat(props.map(p => ({ value:p.property_id, label:(p.property_name||p.property_id) + (p.city?(' · '+p.city):'') })));
    const provOpts = [{ value:'', label:'Leave as draft (dispatch later)' }].concat(provs.map(o => ({ value:String(o.id), label:o.name + (o.coverage_area?(' · '+o.coverage_area):'') })));
    const body = `
      ${context.title ? `<div class="capability-note">Prepared from the ${context.source === 'estate' ? 'estate' : context.source==='support' ? 'support request' : 'incident'} you were reviewing. Confirm the estate and scope before creating.${context.source_alert_id ? ` Source incident ${esc(context.source_alert_id)} will be linked when you create this work order; this does not record an incident outcome.` : ''}${context.source_ticket_id ? ` Support request ${esc(context.source_ticket_id)} will be linked only when you create this work order. It will not resolve the support conversation.` : ''}</div>` : ''}
      ${!propertiesAvailable ? '<div class="capability-note" role="alert">Estate choices are unavailable. Creation is blocked until they load; close and reopen this draft to retry.</div>' : hasSourceEstate && !estateReturned ? `<div class="capability-note" role="alert">Source estate ${esc(context.property_id)} was not returned in the available choices. Select the correct estate before creating; it has not been replaced automatically.</div>` : ''}
      ${!providersAvailable ? '<div class="capability-note">Provider choices are unavailable, not empty. Once estate choices are available, you can create an undispatched draft and choose a provider later.</div>' : ''}
      ${OpsModal.field('Title', 'title', 'text', context.title || '', { placeholder:'e.g. Quarterly drain inspection — Block C' })}
      ${OpsModal.row([
        OpsModal.field('Work type', 'job_type', 'select', 'inspection', { options: JOB_TYPES }),
        OpsModal.field('Priority', 'priority', 'select', 'normal', { options: PRIORITIES }),
      ])}
      ${OpsModal.field('Estate', 'property_id', 'select', props.some(p=>String(p.property_id) === String(context.property_id)) ? context.property_id : '', { required:false, options: propOpts })}
      ${OpsModal.field('Description', 'description', 'textarea', context.description || '', { required:false, rows:3, placeholder:'What needs doing, access notes, etc.' })}
      ${OpsModal.row([
        OpsModal.field('Scheduled for', 'scheduled_for', 'datetime-local', '', { required:false }),
        OpsModal.field('Response deadline', 'sla_due_at', 'datetime-local', '', { required:false }),
      ])}
      ${OpsModal.field('Dispatch to provider', 'service_provider_org_id', 'select', '', { required:false, options: provOpts })}`;
    OpsModal.open('Create work order', body, [
      { label:'Cancel', class:'btn-ghost', onclick:'OpsModal.close()' },
      { label:'Create work order', class:'btn-primary', onclick:'OpsJobs.submitNewJob()', id:'jb-new-submit', disabled:!propertiesAvailable },
    ]);
  }
  let _creationState = { propertiesAvailable:false, requiresEstate:false };
  let _creating = false;
  const _dispatching = new Set();
  const _iso = v => v ? new Date(v).toISOString() : null;
  async function submitNewJob() {
    if (_creating) return;
    if (!requireManage()) return;
    if (!_creationState.propertiesAvailable) return OpsModal.toast('Estate choices are unavailable. Reopen the draft to retry.', 'watch');
    const d = OpsModal.getFormData();
    if (_creationState.requiresEstate && !d.property_id) return OpsModal.toast('Select the correct estate for this contextual work order.', 'watch');
    if (!d.title || !d.title.trim()) { OpsModal.toast('Give the work order a title', 'warning'); return; }
    _creating = true;
    OpsModal.setLoading('jb-new-submit', true);
    try {
      await OpsModal.apiPost('/jobs', {
        title: d.title.trim(), job_type: d.job_type, priority: d.priority,
        property_id: d.property_id || null, description: d.description || null,
        source_alert_id:_creationState.sourceAlertId || null,
        source_ticket_id:_creationState.sourceTicketId || null,
        scheduled_for: _iso(d.scheduled_for), sla_due_at: _iso(d.sla_due_at),
        service_provider_org_id: d.service_provider_org_id || null,
      });
      OpsModal.toast('Work order created', 'nominal');
      OpsModal.close(); await load();
    } catch (err) { OpsModal.toast(err.message || 'Failed to create work order', 'error'); }
    finally { _creating = false; OpsModal.setLoading('jb-new-submit', false); }
  }

  // ── DISPATCH ───────────────────────────────────────────────────────────
  async function _dispatchForm(id) {
    if (!requireManage()) return;
    let provs = [];
    try { provs = OpsModal.readArray(await OpsModal.apiGet('/service-providers?status=active'),'Provider choices'); }
    catch(err) { OpsModal.open('Dispatch work order',OpsModal.failure('Provider choices',err,`OpsJobs._dispatchForm('${OpsModal.sid(id)}')`),[{label:'Close',onclick:'OpsModal.close()'}]);return; }
    if (!provs.length) { OpsModal.toast('No active providers to dispatch to', 'warning'); return; }
    const opts = provs.map(o => ({ value:String(o.id), label:o.name + (o.coverage_area?(' · '+o.coverage_area):'') }));
    const body = `
      ${OpsModal.field('Provider', 'service_provider_org_id', 'select', '', { options: opts })}
      ${OpsModal.field('Planned visit (optional)', 'scheduled_for', 'datetime-local', '', { required:false })}
      ${OpsModal.field('Response deadline (optional)', 'sla_due_at', 'datetime-local', '', { required:false })}`;
    OpsModal.open('Dispatch work order', body, [
      { label:'Cancel', class:'btn-ghost', onclick:'OpsModal.close()' },
      { label:'Dispatch', class:'btn-primary', onclick:`OpsJobs._doDispatch('${OpsModal.sid(id)}')`, id:'jb-disp-submit' },
    ]);
  }
  async function _doDispatch(id) {
    if (_dispatching.has(String(id))) return;
    if (!requireManage()) return;
    const d = OpsModal.getFormData();
    if (!d.service_provider_org_id) { OpsModal.toast('Pick a provider', 'warning'); return; }
    _dispatching.add(String(id));
    OpsModal.setLoading('jb-disp-submit', true);
    try {
      await OpsModal.apiPost('/jobs/' + id + '/dispatch', { service_provider_org_id: d.service_provider_org_id, sla_due_at: _iso(d.sla_due_at), scheduled_for: _iso(d.scheduled_for) });
      OpsModal.toast('Work order dispatched', 'nominal'); OpsModal.close(); openJob(id);
    } catch (err) { OpsModal.toast(err.message || 'Failed to dispatch', 'error'); }
    finally { _dispatching.delete(String(id)); OpsModal.setLoading('jb-disp-submit', false); }
  }

  // ── VERIFY / REJECT / CANCEL ───────────────────────────────────────────
  function _verify(id) {
    if (!requireManage()) return;
    OpsModal.confirm('Verify this work order? This accepts the provider\'s completion.', async () => {
      if (!requireManage()) return;
      try { await OpsModal.apiPost('/jobs/' + id + '/verify', {}); OpsModal.toast('Work order verified', 'nominal'); openJob(id); }
      catch (err) { OpsModal.toast(err.message || 'Failed to verify', 'error'); }
    }, {tone:'neutral',title:'Verify provider completion',confirmLabel:'Verify completion',detail:'Accept completion only after reviewing the scope, evidence and provider updates.'});
  }
  function _rejectForm(id) {
    if (!requireManage()) return;
    const body = OpsModal.field('What needs redoing?', 'reason', 'textarea', '', { rows:3, placeholder:'Specific — this goes to the provider.' });
    OpsModal.open('Return for rework', body, [
      { label:'Cancel', class:'btn-ghost', onclick:`OpsJobs.openJob('${id}')` },
      { label:'Return', class:'btn-danger', onclick:`OpsJobs._doReject('${OpsModal.sid(id)}')`, id:'jb-rej-submit' },
    ]);
  }
  async function _doReject(id) {
    if (!requireManage()) return;
    const d = OpsModal.getFormData();
    if (!d.reason || !d.reason.trim()) { OpsModal.toast('Add a reason', 'warning'); return; }
    OpsModal.setLoading('jb-rej-submit', true);
    try { await OpsModal.apiPost('/jobs/' + id + '/reject', { reason: d.reason.trim() }); OpsModal.toast('Returned to provider', 'nominal'); OpsModal.close(); openJob(id); }
    catch (err) { OpsModal.toast(err.message || 'Failed to return', 'error'); }
    finally { OpsModal.setLoading('jb-rej-submit', false); }
  }
  function _cancel(id) {
    if (!requireManage()) return;
    const body = OpsModal.field('Reason (optional)', 'reason', 'textarea', '', { required:false, rows:2, placeholder:'Why is this work order being cancelled?' });
    OpsModal.open('Cancel work order', body, [
      { label:'Keep work order', class:'btn-ghost', onclick:`OpsJobs.openJob('${OpsModal.sid(id)}')` },
      { label:'Cancel work order', class:'btn-danger', onclick:`OpsJobs._doCancel('${OpsModal.sid(id)}')`, id:'jb-can-submit' },
    ]);
  }
  async function _doCancel(id) {
    if (!requireManage()) return;
    const d = OpsModal.getFormData();
    OpsModal.setLoading('jb-can-submit', true);
    try { await OpsModal.apiPost('/jobs/' + id + '/cancel', { reason: d.reason || null }); OpsModal.toast('Work order cancelled', 'nominal'); OpsModal.close(); openJob(id); }
    catch (err) { OpsModal.toast(err.message || 'Failed to cancel', 'error'); }
    finally { OpsModal.setLoading('jb-can-submit', false); }
  }

  return { render, back, search, filter, forProvider, clearScope, openJob, newJob, submitNewJob, retainMessage, _dispatchForm, _doDispatch, _verify, _rejectForm, _doReject, _cancel, _doCancel, _postComment };
})();
window.OpsJobs = OpsJobs;
