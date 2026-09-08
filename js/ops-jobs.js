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
  const dash = v => (v == null || v === '') ? '—' : v;
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
  const PRIORITY_COLOR = { urgent:'var(--err)', high:'var(--caut)', normal:'var(--warn)', low:'var(--off,var(--ink-4))' };

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
  const statusPill = s => { const m = STATUS[s] || STATUS.draft; return `<span class="lv-status ${m[0]}">${m[1]}</span>`; };
  // list buckets
  const BUCKET = {
    active: ['dispatched','accepted','en_route','in_progress','declined'],
    review: ['completed'],
    done:   ['verified'],
    draft:  ['draft'],
  };
  const IN_FLIGHT = ['dispatched','accepted','en_route','in_progress'];
  const isOverdue = j => j.sla_due_at && IN_FLIGHT.includes(j.status) && new Date(j.sla_due_at).getTime() < Date.now();

  const EXTRA = `<style id="jb-css">
    .jb-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:14px;}
    .jb-head-title h2{margin:0;font-size:var(--fs-xl);font-weight:700;color:var(--ink);}
    .jb-head-title span{font-size:var(--fs-xs);color:var(--ink-3);}
    .jb-add{padding:9px 16px;border-radius:9px;border:1px solid var(--blue-dim);background:var(--neon-trace);color:var(--blue-hi);font-size:var(--fs-sm);font-weight:700;font-family:var(--ff-b);cursor:pointer;white-space:nowrap;}
    .jb-add:hover{background:var(--blue-dim);color:#fff;}
    .jb-req{display:inline-flex;align-items:center;gap:5px;font-size:var(--fs-2xs);font-weight:700;padding:3px 9px;border-radius:20px;margin:4px 5px 0 0;}
    .jb-req.ok{color:var(--ok);background:var(--ok,#0a8a6a)18;}
    .jb-req.no{color:var(--warn);background:var(--warn,#b45309)18;}
    .jb-ev{display:flex;gap:10px;align-items:center;padding:9px 11px;border:1px solid var(--border);border-radius:9px;margin-top:8px;font-size:var(--fs-sm);}
    .jb-ev .k{font-weight:700;text-transform:capitalize;color:var(--ink-2);}
    .jb-ev a{color:var(--blue-hi);text-decoration:none;font-weight:600;}
    .jb-tl{border-left:2px solid var(--border);padding-left:14px;margin-top:4px;}
    .jb-tl-i{position:relative;padding:6px 0;}
    .jb-tl-i::before{content:'';position:absolute;left:-21px;top:10px;width:9px;height:9px;border-radius:50%;background:var(--blue-hi);border:2px solid var(--surface);}
    .jb-tl-t{font-size:var(--fs-sm);color:var(--ink);font-weight:600;}
    .jb-tl-d{font-size:var(--fs-2xs);color:var(--ink-3);margin-top:1px;}
  </style>`;

  let _container = null, _filter = 'active', _term = '', _rows = [];

  async function render(container) {
    _container = container;
    container.innerHTML = EXTRA + `
      <div class="jb-head">
        <div class="jb-head-title"><h2>Field Jobs</h2><span>Work dispatched to service providers — track, verify, and close out</span></div>
        <button class="jb-add" onclick="OpsJobs.newJob()">+ New job</button>
      </div>
      <div id="jb-kpis" style="margin-bottom:16px"></div>
      <div class="lv-wrap">
        <div class="lv-toolbar">
          <div class="lv-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input id="jb-search" placeholder="Search jobs…" oninput="OpsJobs.search(this.value)">
          </div>
          <div class="lv-toolbar-right">
            <select class="um-filter" onchange="OpsJobs.filter(this.value)">
              <option value="active"${_filter==='active'?' selected':''}>Active</option>
              <option value="overdue"${_filter==='overdue'?' selected':''}>Overdue</option>
              <option value="review"${_filter==='review'?' selected':''}>Awaiting verification</option>
              <option value="done"${_filter==='done'?' selected':''}>Verified</option>
              <option value="draft"${_filter==='draft'?' selected':''}>Drafts</option>
              <option value="all"${_filter==='all'?' selected':''}>All</option>
            </select>
          </div>
        </div>
        <div id="jb-body"><div class="lv-empty" style="padding:40px;text-align:center;color:var(--ink-3)">Loading…</div></div>
      </div>`;
    await load();
  }

  async function load() {
    const body = document.getElementById('jb-body');
    try {
      const res = await OpsModal.apiGet('/jobs');
      _rows = (res && res.data) || [];
      drawKpis();
      draw();
    } catch (err) {
      if (body) body.innerHTML = OpsModal.emptyState('', "Couldn't load jobs", esc(err.message || 'network error'));
    }
  }

  function drawKpis() {
    const el = document.getElementById('jb-kpis');
    if (!el) return;
    const open     = _rows.filter(j => IN_FLIGHT.includes(j.status)).length;
    const overdue  = _rows.filter(isOverdue).length;
    const awaiting = _rows.filter(j => j.status === 'completed').length;
    const verified = _rows.filter(j => j.status === 'verified').length;
    el.innerHTML = OpsModal.kpiStrip([
      { label: 'Open', value: open, sub: open ? 'In flight' : 'None' },
      { label: 'Overdue', value: overdue, sub: overdue ? 'Past SLA' : 'On track', subClass: overdue ? 'err' : 'ok' },
      { label: 'Awaiting verification', value: awaiting, sub: awaiting ? 'Needs review' : 'Clear', subClass: awaiting ? 'warn' : 'ok' },
      { label: 'Verified', value: verified, sub: 'Signed off', subClass: 'ok' },
    ]);
  }

  function draw() {
    const body = document.getElementById('jb-body');
    if (!body) return;
    let rows = _rows.slice();
    if (_filter === 'overdue') rows = rows.filter(isOverdue);
    else if (BUCKET[_filter]) rows = rows.filter(j => BUCKET[_filter].includes(j.status));
    if (_term) rows = rows.filter(j => `${j.reference||''} ${j.title||''} ${j.property_name||''} ${j.provider_name||''} ${j.job_type||''}`.toLowerCase().includes(_term));
    if (!rows.length) {
      body.innerHTML = OpsModal.emptyState('', 'No jobs here yet',
        _filter === 'all' ? 'Create a job to dispatch work to a provider.' : 'Nothing in this view right now.');
      return;
    }
    const L = OpsModal.link;
    const pc = p => PRIORITY_COLOR[p] || PRIORITY_COLOR.normal;
    body.innerHTML = `
      <div class="lv-scroll">
        <table class="lv-table">
          <thead><tr>
            <th>Job</th><th>Property</th><th>Provider</th><th>Priority</th><th>Status</th><th>SLA due</th>
          </tr></thead>
          <tbody>
            ${rows.map(j => {
              const overdue = j.sla_due_at && ['dispatched','accepted','en_route','in_progress'].includes(j.status) && new Date(j.sla_due_at).getTime() < Date.now();
              const propCell = j.property_id ? L('properties', j.property_id, j.property_name || j.property_id) : `<span class="lv-dash">${esc(dash(j.property_name))}</span>`;
              return `<tr class="clickable" onclick="OpsJobs.openJob('${OpsModal.sid(j.id)}')" tabindex="0" onkeydown="if(event.key==='Enter'){OpsJobs.openJob('${OpsModal.sid(j.id)}')}">
                <td>
                  <div class="lv-name-cell">
                    <div class="lv-avatar" style="background:var(--surface-3);color:var(--ink-3);border:1px solid var(--border);"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3 8-8"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div>
                    <div style="min-width:0"><div class="lv-name">${esc(dash(j.title))}</div><div class="lv-mono" style="font-size:var(--fs-2xs);color:var(--ink-3)">${esc(dash(j.reference))} · ${esc(JT[j.job_type]||j.job_type)}</div></div>
                  </div>
                </td>
                <td>${propCell}</td>
                <td>${j.provider_name ? esc(j.provider_name) : '<span class="lv-dash">Not dispatched</span>'}</td>
                <td><span style="color:${pc(j.priority)};background:${pc(j.priority)}18;padding:2px 8px;border-radius:5px;font-size:var(--fs-2xs);font-weight:700;">${esc(PR[j.priority]||j.priority||'normal')}</span></td>
                <td>${statusPill(j.status)}</td>
                <td class="lv-mono" style="${overdue?'color:var(--err);font-weight:700;':''}">${j.sla_due_at?fmtDate(j.sla_due_at):'—'}${overdue?' · overdue':''}</td>
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
    if (_container) _container.innerHTML = EXTRA + `<div style="padding:40px;text-align:center;color:var(--ink-3)">Loading…</div>`;
    let j;
    try { const res = await OpsModal.apiGet('/jobs/' + id); j = res && res.data; }
    catch (err) { OpsModal.toast("Couldn't load job: " + (err.message||''), 'error'); back(); return; }
    if (!j) { back(); return; }
    const F = OpsModal.fact;

    const detailsBody = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px 20px">
      ${F('Reference', esc(dash(j.reference)))}
      ${F('Type', esc(JT[j.job_type]||j.job_type))}
      ${F('Priority', esc(PR[j.priority]||j.priority))}
      ${F('Property', j.property_id ? OpsModal.link('properties', j.property_id, j.property_name || j.property_id) : esc(dash(j.property_name)))}
      ${F('Provider', j.provider_name ? esc(j.provider_name) : 'Not dispatched')}
      ${F('Technician', esc(dash(j.technician_name)))}
      ${F('Scheduled', fmtDT(j.scheduled_for))}
      ${F('SLA due', fmtDT(j.sla_due_at))}
      ${j.description ? F('Description', esc(j.description)) : ''}
      ${j.decline_reason ? F('Decline reason', esc(j.decline_reason)) : ''}
      ${j.reject_reason ? F('Rework reason', esc(j.reject_reason)) : ''}
      ${j.cancel_reason ? F('Cancel reason', esc(j.cancel_reason)) : ''}
    </div>`;

    const have = {}; (j.evidence || []).forEach(e => { if (e.evidence_key) have[e.evidence_key] = 1; });
    const reqs = Array.isArray(j.required_evidence) ? j.required_evidence : [];
    const reqHtml = reqs.length
      ? reqs.map(r => `<span class="jb-req ${have[r.key]?'ok':'no'}">${have[r.key]?'✓':'○'} ${esc(r.label||r.key)}</span>`).join('')
      : '<div class="jb-tl-d">No evidence requirements set.</div>';
    const evItems = (j.evidence || []).map(e => `<div class="jb-ev"><span class="k">${esc(e.kind)}</span><span style="flex:1;color:var(--ink-2)">${esc(e.caption || e.evidence_key || '—')}</span>${e.file_url?`<a href="${esc(e.file_url)}" target="_blank" rel="noopener">Open</a>`:''}${(e.lat!=null&&e.lng!=null)?`<span class="jb-tl-d">${Number(e.lat).toFixed(4)}, ${Number(e.lng).toFixed(4)}</span>`:''}</div>`).join('');
    const evidenceBody = reqHtml + (evItems || '<div class="jb-tl-d" style="margin-top:8px">Nothing uploaded yet.</div>');

    const LB = { created:'Created', dispatched:'Dispatched to provider', accepted:'Accepted by provider', declined:'Declined by provider', en_route:'Technician en route', started:'Work started', completed:'Marked complete', verified:'Verified by FlowGuard', rejected:'Returned for rework', cancelled:'Cancelled', evidence_added:'Evidence added', note:'Note' };
    const tlBody = (j.events && j.events.length)
      ? `<div class="jb-tl">${j.events.map(e => `<div class="jb-tl-i"><div class="jb-tl-t">${esc(LB[e.event_type]||e.event_type)}${e.note?' — '+esc(e.note):''}</div><div class="jb-tl-d">${fmtDT(e.created_at)}${e.actor_type?' · '+esc(String(e.actor_type).replace('_',' ')):''}</div></div>`).join('')}</div>`
      : '<div class="jb-tl-d">No activity yet.</div>';

    let actions = '';
    if (['draft','declined'].includes(j.status)) actions += `<button class="btn-primary" onclick="OpsJobs._dispatchForm(${j.id})">Dispatch</button>`;
    if (j.status === 'completed') actions += `<button class="btn-ghost" onclick="OpsJobs._rejectForm(${j.id})">Return for rework</button> <button class="btn-primary" onclick="OpsJobs._verify(${j.id})">Verify</button>`;
    if (!['verified','cancelled'].includes(j.status)) actions += ` <button class="btn-danger" onclick="OpsJobs._cancel(${j.id})">Cancel</button>`;

    const st = STATUS[j.status] || STATUS.draft;
    _container.innerHTML = EXTRA + OpsModal.detailShell({
      back: 'OpsJobs.back()', crumbRoot: 'Field Jobs', title: esc(dash(j.title)),
      chips: [{ cls: st[0], label: st[1], dot: true }],
      meta: [['Ref ', esc(dash(j.reference))], ['Type ', esc(JT[j.job_type]||j.job_type)]],
      actions,
      sections: [
        { id:'details',  title:'Job details', body: detailsBody },
        { id:'evidence', title:'Evidence',    body: evidenceBody },
        { id:'activity', title:'Activity',    body: tlBody },
      ],
    });
  }

  // ── CREATE ─────────────────────────────────────────────────────────────
  async function newJob() {
    let props = [], provs = [];
    try { props = (await OpsModal.apiGet('/properties/all')).data || []; } catch (_) {}
    try { provs = (await OpsModal.apiGet('/service-providers?status=active')).data || []; } catch (_) {}
    const propOpts = [{ value:'', label:'No specific property' }].concat(props.map(p => ({ value:p.property_id, label:(p.property_name||p.property_id) + (p.city?(' · '+p.city):'') })));
    const provOpts = [{ value:'', label:'Leave as draft (dispatch later)' }].concat(provs.map(o => ({ value:String(o.id), label:o.name + (o.coverage_area?(' · '+o.coverage_area):'') })));
    const body = `
      ${OpsModal.field('Title', 'title', 'text', '', { placeholder:'e.g. Quarterly drain inspection — Block C' })}
      ${OpsModal.row([
        OpsModal.field('Job type', 'job_type', 'select', 'inspection', { options: JOB_TYPES }),
        OpsModal.field('Priority', 'priority', 'select', 'normal', { options: PRIORITIES }),
      ])}
      ${OpsModal.field('Property', 'property_id', 'select', '', { required:false, options: propOpts })}
      ${OpsModal.field('Description', 'description', 'textarea', '', { required:false, rows:3, placeholder:'What needs doing, access notes, etc.' })}
      ${OpsModal.row([
        OpsModal.field('Scheduled for', 'scheduled_for', 'datetime-local', '', { required:false }),
        OpsModal.field('SLA due', 'sla_due_at', 'datetime-local', '', { required:false }),
      ])}
      ${OpsModal.field('Dispatch to provider', 'service_provider_org_id', 'select', '', { required:false, options: provOpts })}`;
    OpsModal.open('New job', body, [
      { label:'Cancel', class:'btn-ghost', onclick:'OpsModal.close()' },
      { label:'Create', class:'btn-primary', onclick:'OpsJobs.submitNewJob()', id:'jb-new-submit' },
    ]);
  }
  const _iso = v => v ? new Date(v).toISOString() : null;
  async function submitNewJob() {
    const d = OpsModal.getFormData();
    if (!d.title || !d.title.trim()) { OpsModal.toast('Give the job a title', 'warning'); return; }
    OpsModal.setLoading('jb-new-submit', true);
    try {
      await OpsModal.apiPost('/jobs', {
        title: d.title.trim(), job_type: d.job_type, priority: d.priority,
        property_id: d.property_id || null, description: d.description || null,
        scheduled_for: _iso(d.scheduled_for), sla_due_at: _iso(d.sla_due_at),
        service_provider_org_id: d.service_provider_org_id || null,
      });
      OpsModal.toast('Job created', 'nominal');
      OpsModal.close(); await load();
    } catch (err) { OpsModal.toast(err.message || 'Failed to create job', 'error'); }
    finally { OpsModal.setLoading('jb-new-submit', false); }
  }

  // ── DISPATCH ───────────────────────────────────────────────────────────
  async function _dispatchForm(id) {
    let provs = [];
    try { provs = (await OpsModal.apiGet('/service-providers?status=active')).data || []; } catch (_) {}
    if (!provs.length) { OpsModal.toast('No active providers to dispatch to', 'warning'); return; }
    const opts = provs.map(o => ({ value:String(o.id), label:o.name + (o.coverage_area?(' · '+o.coverage_area):'') }));
    const body = `
      ${OpsModal.field('Provider', 'service_provider_org_id', 'select', '', { options: opts })}
      ${OpsModal.field('SLA due (optional)', 'sla_due_at', 'datetime-local', '', { required:false })}`;
    OpsModal.open('Dispatch job', body, [
      { label:'Cancel', class:'btn-ghost', onclick:`OpsJobs.openJob('${id}')` },
      { label:'Dispatch', class:'btn-primary', onclick:`OpsJobs._doDispatch(${id})`, id:'jb-disp-submit' },
    ]);
  }
  async function _doDispatch(id) {
    const d = OpsModal.getFormData();
    if (!d.service_provider_org_id) { OpsModal.toast('Pick a provider', 'warning'); return; }
    OpsModal.setLoading('jb-disp-submit', true);
    try {
      await OpsModal.apiPost('/jobs/' + id + '/dispatch', { service_provider_org_id: d.service_provider_org_id, sla_due_at: _iso(d.sla_due_at) });
      OpsModal.toast('Job dispatched', 'nominal'); OpsModal.close(); openJob(id);
    } catch (err) { OpsModal.toast(err.message || 'Failed to dispatch', 'error'); }
    finally { OpsModal.setLoading('jb-disp-submit', false); }
  }

  // ── VERIFY / REJECT / CANCEL ───────────────────────────────────────────
  function _verify(id) {
    OpsModal.confirm('Verify this job? This accepts the provider\'s completion.', async () => {
      try { await OpsModal.apiPost('/jobs/' + id + '/verify', {}); OpsModal.toast('Job verified', 'nominal'); openJob(id); }
      catch (err) { OpsModal.toast(err.message || 'Failed to verify', 'error'); }
    });
  }
  function _rejectForm(id) {
    const body = OpsModal.field('What needs redoing?', 'reason', 'textarea', '', { rows:3, placeholder:'Specific — this goes to the provider.' });
    OpsModal.open('Return for rework', body, [
      { label:'Cancel', class:'btn-ghost', onclick:`OpsJobs.openJob('${id}')` },
      { label:'Return', class:'btn-danger', onclick:`OpsJobs._doReject(${id})`, id:'jb-rej-submit' },
    ]);
  }
  async function _doReject(id) {
    const d = OpsModal.getFormData();
    if (!d.reason || !d.reason.trim()) { OpsModal.toast('Add a reason', 'warning'); return; }
    OpsModal.setLoading('jb-rej-submit', true);
    try { await OpsModal.apiPost('/jobs/' + id + '/reject', { reason: d.reason.trim() }); OpsModal.toast('Returned to provider', 'nominal'); OpsModal.close(); openJob(id); }
    catch (err) { OpsModal.toast(err.message || 'Failed to return', 'error'); }
    finally { OpsModal.setLoading('jb-rej-submit', false); }
  }
  function _cancel(id) {
    const body = OpsModal.field('Reason (optional)', 'reason', 'textarea', '', { required:false, rows:2, placeholder:'Why is this job being cancelled?' });
    OpsModal.open('Cancel job', body, [
      { label:'Keep job', class:'btn-ghost', onclick:`OpsJobs.openJob('${id}')` },
      { label:'Cancel job', class:'btn-danger', onclick:`OpsJobs._doCancel(${id})`, id:'jb-can-submit' },
    ]);
  }
  async function _doCancel(id) {
    const d = OpsModal.getFormData();
    OpsModal.setLoading('jb-can-submit', true);
    try { await OpsModal.apiPost('/jobs/' + id + '/cancel', { reason: d.reason || null }); OpsModal.toast('Job cancelled', 'nominal'); OpsModal.close(); openJob(id); }
    catch (err) { OpsModal.toast(err.message || 'Failed to cancel', 'error'); }
    finally { OpsModal.setLoading('jb-can-submit', false); }
  }

  return { render, back, search, filter, openJob, newJob, submitNewJob, _dispatchForm, _doDispatch, _verify, _rejectForm, _doReject, _cancel, _doCancel };
})();
window.OpsJobs = OpsJobs;
