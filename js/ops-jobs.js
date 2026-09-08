// ============================================================================
// OPS JOBS MODULE
// FlowGuard-side management of field jobs dispatched to Service Provider
// Organisations. Create → dispatch → (provider works) → verify / reject.
// Backed by /api/v1/jobs (staff endpoints). Tenancy + lifecycle live server-side;
// this is the console for staff to drive and audit the work.
// ============================================================================

const OpsJobs = (function () {
  'use strict';
  const esc = (OpsModal && OpsModal.esc) ? OpsModal.esc : (v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])));
  const dash = v => (v == null || v === '') ? '—' : esc(v);
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—';
  const fmtDT   = d => d ? new Date(d).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : '—';

  const JOB_TYPES = {
    inspection:'Inspection', drain_cleaning:'Drain cleaning', sensor_maintenance:'Sensor maintenance',
    repair:'Repair', survey:'Survey', other:'Other',
  };
  const PRIORITIES = { low:'Low', normal:'Normal', high:'High', urgent:'Urgent' };

  // status → [ink, bg, label]
  const STATUS_CHIP = {
    draft:       ['#6b7280','rgba(107,114,128,.12)','Draft'],
    dispatched:  ['#2563eb','rgba(37,99,235,.12)','Dispatched'],
    accepted:    ['#0d7fa0','rgba(13,127,160,.12)','Accepted'],
    declined:    ['#dc2626','rgba(220,38,38,.10)','Declined'],
    en_route:    ['#7c3aed','rgba(124,58,237,.12)','En route'],
    in_progress: ['#b45309','rgba(180,83,9,.12)','In progress'],
    completed:   ['#0a8a6a','rgba(16,185,129,.12)','Awaiting verification'],
    verified:    ['#0a8a6a','rgba(16,185,129,.16)','Verified'],
    rejected:    ['#dc2626','rgba(220,38,38,.10)','Returned for rework'],
    cancelled:   ['#6b7280','rgba(107,114,128,.12)','Cancelled'],
  };
  // Which list bucket a status belongs to.
  const BUCKET = {
    active: ['dispatched','accepted','en_route','in_progress','declined'],
    review: ['completed'],
    done:   ['verified'],
  };
  const PRIORITY_INK = { low:'#6b7280', normal:'#0d7fa0', high:'#b45309', urgent:'#dc2626' };

  const CSS = `<style id="job-css">
    .job-bar{display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap}
    .job-tabs{display:flex;gap:6px;flex-wrap:wrap}
    .job-tab{font-size:13px;font-weight:600;padding:7px 14px;border-radius:20px;background:var(--surface);border:1px solid var(--border);color:var(--ink-2);cursor:pointer}
    .job-tab.on{background:var(--ink);color:var(--surface);border-color:var(--ink)}
    .job-new{margin-left:auto;font-size:13px;font-weight:700;padding:9px 16px;border-radius:10px;background:var(--blue,#16a8d3);color:#fff;border:0;cursor:pointer}
    .job-wrap{background:var(--surface);border:1px solid var(--border);border-radius:14px;overflow:hidden;box-shadow:var(--sh-xs)}
    .job-row{display:grid;grid-template-columns:1.5fr 1.4fr 1.2fr 150px 44px;gap:12px;align-items:center;padding:14px 18px;border-bottom:1px solid var(--border);cursor:pointer}
    .job-row:last-child{border-bottom:0}
    .job-row:hover{background:var(--surface-h,rgba(0,0,0,.02))}
    .job-row .nm{font-weight:700;color:var(--ink);font-size:14px}
    .job-row .sub{font-size:12px;color:var(--ink-3);margin-top:2px}
    .job-ref{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--ink-3)}
    .job-chip{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:20px;white-space:nowrap}
    .job-chip .d{width:7px;height:7px;border-radius:50%}
    .job-pri{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.4px}
    .job-empty{padding:44px 20px;text-align:center;color:var(--ink-3);font-size:14px}
    .job-head{padding:14px 18px;border-bottom:1px solid var(--border);font-size:12px;color:var(--ink-3);font-weight:700;letter-spacing:.4px;text-transform:uppercase}
    .jd dt{font-size:11.5px;color:var(--ink-3);font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-top:12px}
    .jd dd{font-size:14px;color:var(--ink);margin-top:3px}
    .jf{margin:14px 0}
    .jf label{display:block;font-size:12px;font-weight:700;color:var(--ink-2);margin-bottom:6px}
    .jf input,.jf select,.jf textarea{width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:9px;font-family:inherit;font-size:14px;background:var(--surface);color:var(--ink);box-sizing:border-box}
    .jf-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .jtl{margin-top:8px;border-left:2px solid var(--border);padding-left:14px}
    .jtl-item{position:relative;padding:6px 0}
    .jtl-item::before{content:'';position:absolute;left:-21px;top:10px;width:9px;height:9px;border-radius:50%;background:var(--blue,#16a8d3);border:2px solid var(--surface)}
    .jtl-t{font-size:13px;color:var(--ink);font-weight:600}
    .jtl-m{font-size:12.5px;color:var(--ink-2);margin-top:1px}
    .jtl-d{font-size:11px;color:var(--ink-3);margin-top:1px}
    .jev{display:flex;gap:10px;align-items:center;padding:8px 10px;border:1px solid var(--border);border-radius:9px;margin-top:8px;font-size:13px}
    .jev .k{font-weight:700;color:var(--ink-2);text-transform:capitalize}
    .jev a{color:var(--blue,#16a8d3);text-decoration:none;font-weight:600}
    .jd-req{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px;margin:3px 4px 0 0}
    .jd-req.ok{color:#0a8a6a;background:rgba(16,185,129,.12)}
    .jd-req.no{color:#b45309;background:rgba(180,83,9,.12)}
  </style>`;

  let _container = null, _filter = 'active';

  function chip(status) {
    const c = STATUS_CHIP[status] || STATUS_CHIP.draft;
    return `<span class="job-chip" style="color:${c[0]};background:${c[1]}"><span class="d" style="background:${c[0]}"></span>${c[2]}</span>`;
  }

  async function render(container) {
    _container = container;
    const tabs = [['active','Active'],['review','Awaiting verification'],['done','Verified'],['draft','Drafts'],['all','All']];
    container.innerHTML = CSS + `
      <div class="job-bar">
        <div class="job-tabs" id="job-tabs">
          ${tabs.map(([s,l]) => `<button class="job-tab ${s===_filter?'on':''}" data-s="${s}">${l}</button>`).join('')}
        </div>
        <button class="job-new" id="job-new">+ New job</button>
      </div>
      <div id="job-list"><div class="job-empty">Loading…</div></div>`;
    container.querySelector('#job-tabs').addEventListener('click', e => {
      const b = e.target.closest('.job-tab'); if (!b) return;
      _filter = b.dataset.s; render(container);
    });
    container.querySelector('#job-new').addEventListener('click', openCreate);
    await loadList();
  }

  async function loadList() {
    const el = _container.querySelector('#job-list');
    try {
      // Server filters by a single status; the multi-status buckets are filtered client-side.
      let q = '';
      if (_filter === 'draft') q = '?status=draft';
      const res = await OpsModal.apiGet('/jobs' + q);
      let rows = (res && res.data) || [];
      if (BUCKET[_filter]) rows = rows.filter(r => BUCKET[_filter].includes(r.status));
      if (!rows.length) { el.innerHTML = `<div class="job-wrap"><div class="job-empty">No jobs here yet.</div></div>`; return; }
      el.innerHTML = `<div class="job-wrap">
        <div class="job-row job-head" style="cursor:default"><div>Job</div><div>Property</div><div>Provider</div><div>Status</div><div></div></div>
        ${rows.map(rowHtml).join('')}
      </div>`;
      el.querySelectorAll('.job-row[data-id]').forEach(r => r.addEventListener('click', () => openDetail(r.dataset.id)));
    } catch (err) {
      el.innerHTML = `<div class="job-wrap"><div class="job-empty">Couldn't load jobs. ${esc(err.message||'')}</div></div>`;
    }
  }

  function rowHtml(j) {
    const pri = PRIORITIES[j.priority] ? `<span class="job-pri" style="color:${PRIORITY_INK[j.priority]}">${PRIORITIES[j.priority]}</span> · ` : '';
    return `<div class="job-row" data-id="${j.id}">
      <div><div class="nm">${dash(j.title)}</div><div class="sub">${pri}${esc(JOB_TYPES[j.job_type]||j.job_type)} · <span class="job-ref">${dash(j.reference)}</span></div></div>
      <div><div>${dash(j.property_name)}</div><div class="sub">${dash(j.property_address)}</div></div>
      <div>${j.provider_name ? esc(j.provider_name) : '<span style="color:var(--ink-3)">Not dispatched</span>'}</div>
      <div>${chip(j.status)}</div>
      <div style="color:var(--ink-3)">›</div>
    </div>`;
  }

  function timeline(events) {
    if (!events || !events.length) return '<div class="jtl-m">No activity yet.</div>';
    const LABEL = { created:'Created', dispatched:'Dispatched to provider', accepted:'Accepted by provider',
      declined:'Declined by provider', en_route:'Technician en route', started:'Work started',
      completed:'Marked complete', verified:'Verified by FlowGuard', rejected:'Returned for rework',
      cancelled:'Cancelled', evidence_added:'Evidence added', note:'Note' };
    return `<div class="jtl">${events.map(e => `
      <div class="jtl-item">
        <div class="jtl-t">${esc(LABEL[e.event_type] || e.event_type)}</div>
        ${e.note ? `<div class="jtl-m">${esc(e.note)}</div>` : ''}
        <div class="jtl-d">${fmtDT(e.created_at)}${e.actor_type ? ' · ' + esc(e.actor_type.replace('_',' ')) : ''}</div>
      </div>`).join('')}</div>`;
  }

  function evidenceList(job) {
    const have = new Set((job.evidence || []).map(e => e.evidence_key).filter(Boolean));
    const reqs = Array.isArray(job.required_evidence) ? job.required_evidence : [];
    const reqChips = reqs.length
      ? '<div style="margin-top:4px">' + reqs.map(r => `<span class="jd-req ${have.has(r.key)?'ok':'no'}">${have.has(r.key)?'✓':'○'} ${esc(r.label||r.key)}</span>`).join('') + '</div>'
      : '<div class="jtl-m">No evidence requirements set.</div>';
    const items = (job.evidence || []).map(e => `
      <div class="jev">
        <span class="k">${esc(e.kind)}</span>
        <span style="flex:1;color:var(--ink-2)">${e.caption ? esc(e.caption) : (e.evidence_key ? esc(e.evidence_key) : '—')}</span>
        ${e.file_url ? `<a href="${esc(e.file_url)}" target="_blank" rel="noopener">Open</a>` : ''}
        ${(e.lat!=null&&e.lng!=null) ? `<span style="font-size:11px;color:var(--ink-3)">${Number(e.lat).toFixed(4)}, ${Number(e.lng).toFixed(4)}</span>` : ''}
      </div>`).join('');
    return reqChips + (items || '<div class="jtl-m" style="margin-top:8px">Nothing uploaded yet.</div>');
  }

  async function openDetail(id) {
    try {
      const res = await OpsModal.apiGet('/jobs/' + id);
      const j = res && res.data; if (!j) return;
      const body = `<div class="jd">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <div><div style="font-size:18px;font-weight:800;color:var(--ink)">${dash(j.title)}</div>
          <div class="job-ref">${dash(j.reference)}</div></div>${chip(j.status)}
        </div>
        <dl>
          <dt>Type / priority</dt><dd>${esc(JOB_TYPES[j.job_type]||j.job_type)} · ${esc(PRIORITIES[j.priority]||j.priority)}</dd>
          <dt>Property</dt><dd>${dash(j.property_name)}${j.property_address?(' · '+esc(j.property_address)):''}</dd>
          <dt>Provider</dt><dd>${j.provider_name?esc(j.provider_name):'Not dispatched'}${j.technician_name?(' · tech: '+esc(j.technician_name)):''}</dd>
          ${j.description?`<dt>Description</dt><dd>${esc(j.description)}</dd>`:''}
          <dt>Schedule / SLA</dt><dd>Scheduled ${fmtDT(j.scheduled_for)} · Due ${fmtDT(j.sla_due_at)}</dd>
          ${j.decline_reason?`<dt>Decline reason</dt><dd>${esc(j.decline_reason)}</dd>`:''}
          ${j.reject_reason?`<dt>Rework reason</dt><dd>${esc(j.reject_reason)}</dd>`:''}
          ${j.cancel_reason?`<dt>Cancel reason</dt><dd>${esc(j.cancel_reason)}</dd>`:''}
          <dt>Evidence</dt><dd>${evidenceList(j)}</dd>
          <dt>Activity</dt><dd>${timeline(j.events)}</dd>
        </dl>
      </div>`;
      const buttons = [{ label:'Close', class:'btn-ghost', onclick:'OpsModal.close()' }];
      if (['draft','declined'].includes(j.status))
        buttons.push({ label:'Dispatch', class:'btn-primary', onclick:`OpsJobs._dispatchForm(${j.id})` });
      if (j.status === 'completed') {
        buttons.push({ label:'Return for rework', class:'btn-ghost', onclick:`OpsJobs._rejectForm(${j.id})` });
        buttons.push({ label:'Verify', class:'btn-primary', onclick:`OpsJobs._verify(${j.id})` });
      }
      if (!['verified','cancelled'].includes(j.status))
        buttons.splice(1, 0, { label:'Cancel job', class:'btn-danger', onclick:`OpsJobs._cancel(${j.id})` });
      OpsModal.open('Job', body, buttons);
    } catch (err) { OpsModal.toast("Couldn't load job: " + (err.message||''), 'error'); }
  }

  // ── create ────────────────────────────────────────────────────────────
  async function openCreate() {
    let props = [], provs = [];
    try { props = (await OpsModal.apiGet('/properties/all')).data || []; } catch (_) {}
    try { provs = (await OpsModal.apiGet('/service-providers?status=active')).data || []; } catch (_) {}
    const propOpts = ['<option value="">— Select property —</option>']
      .concat(props.map(p => `<option value="${esc(p.property_id)}">${esc(p.property_name||p.property_id)}${p.city?(' · '+esc(p.city)):''}</option>`)).join('');
    const provOpts = ['<option value="">Leave as draft (dispatch later)</option>']
      .concat(provs.map(o => `<option value="${o.id}">${esc(o.name)}${o.coverage_area?(' · '+esc(o.coverage_area)):''}</option>`)).join('');
    const typeOpts = Object.keys(JOB_TYPES).map(k => `<option value="${k}">${JOB_TYPES[k]}</option>`).join('');
    const priOpts  = Object.keys(PRIORITIES).map(k => `<option value="${k}" ${k==='normal'?'selected':''}>${PRIORITIES[k]}</option>`).join('');
    const body = `
      <div class="jf"><label>Title</label><input id="j-title" placeholder="e.g. Quarterly drain inspection — Block C"></div>
      <div class="jf-row">
        <div class="jf"><label>Job type</label><select id="j-type">${typeOpts}</select></div>
        <div class="jf"><label>Priority</label><select id="j-pri">${priOpts}</select></div>
      </div>
      <div class="jf"><label>Property</label><select id="j-prop">${propOpts}</select></div>
      <div class="jf"><label>Description</label><textarea id="j-desc" rows="3" placeholder="What needs doing, access notes, etc."></textarea></div>
      <div class="jf-row">
        <div class="jf"><label>Scheduled for</label><input id="j-sched" type="datetime-local"></div>
        <div class="jf"><label>SLA due</label><input id="j-sla" type="datetime-local"></div>
      </div>
      <div class="jf"><label>Dispatch to provider</label><select id="j-prov">${provOpts}</select>
        <div class="jtl-m" style="margin-top:6px">Required evidence is taken from the job type's template. Leave blank to keep as a draft.</div></div>`;
    OpsModal.open('New job', body, [
      { label:'Cancel', class:'btn-ghost', onclick:'OpsModal.close()' },
      { label:'Create', class:'btn-primary', onclick:'OpsJobs._create()' },
    ]);
  }

  const _val = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  const _iso = id => { const v = _val(id); return v ? new Date(v).toISOString() : null; };

  async function _create() {
    const title = _val('j-title').trim();
    if (!title) { OpsModal.toast('Give the job a title', 'warning'); return; }
    const payload = {
      title, job_type: _val('j-type'), priority: _val('j-pri'),
      property_id: _val('j-prop') || null, description: _val('j-desc') || null,
      scheduled_for: _iso('j-sched'), sla_due_at: _iso('j-sla'),
      service_provider_org_id: _val('j-prov') || null,
    };
    try {
      const res = await OpsModal.apiPost('/jobs', payload);
      if (res && res.success) { OpsModal.close(); OpsModal.toast('Job created', 'success'); loadList(); }
      else OpsModal.toast((res && res.error) || 'Failed to create', 'error');
    } catch (err) { OpsModal.toast('Failed to create: ' + (err.message||''), 'error'); }
  }

  // ── dispatch ──────────────────────────────────────────────────────────
  async function _dispatchForm(id) {
    let provs = [];
    try { provs = (await OpsModal.apiGet('/service-providers?status=active')).data || []; } catch (_) {}
    if (!provs.length) { OpsModal.toast('No active providers to dispatch to', 'warning'); return; }
    const opts = provs.map(o => `<option value="${o.id}">${esc(o.name)}${o.coverage_area?(' · '+esc(o.coverage_area)):''}</option>`).join('');
    const body = `
      <div class="jf"><label>Provider</label><select id="j-dprov">${opts}</select></div>
      <div class="jf"><label>SLA due (optional)</label><input id="j-dsla" type="datetime-local"></div>`;
    OpsModal.open('Dispatch job', body, [
      { label:'Cancel', class:'btn-ghost', onclick:`OpsJobs._openDetail(${id})` },
      { label:'Dispatch', class:'btn-primary', onclick:`OpsJobs._doDispatch(${id})` },
    ]);
  }
  async function _doDispatch(id) {
    const org = _val('j-dprov'); const sla = _iso('j-dsla');
    if (!org) { OpsModal.toast('Pick a provider', 'warning'); return; }
    try {
      const res = await OpsModal.apiPost('/jobs/' + id + '/dispatch', { service_provider_org_id: org, sla_due_at: sla });
      if (res && res.success) { OpsModal.close(); OpsModal.toast('Job dispatched', 'success'); loadList(); }
      else OpsModal.toast((res && res.error) || 'Failed to dispatch', 'error');
    } catch (err) { OpsModal.toast('Failed to dispatch: ' + (err.message||''), 'error'); }
  }

  // ── verify / reject / cancel ───────────────────────────────────────────
  async function _verify(id) {
    try {
      const res = await OpsModal.apiPost('/jobs/' + id + '/verify', {});
      if (res && res.success) { OpsModal.close(); OpsModal.toast('Job verified', 'success'); loadList(); }
      else OpsModal.toast((res && res.error) || 'Failed to verify', 'error');
    } catch (err) { OpsModal.toast('Failed to verify: ' + (err.message||''), 'error'); }
  }
  function _rejectForm(id) {
    const body = `<div class="jf"><label>What needs redoing?</label>
      <textarea id="j-rej" rows="3" placeholder="Specific — this goes to the provider."></textarea></div>`;
    OpsModal.open('Return for rework', body, [
      { label:'Cancel', class:'btn-ghost', onclick:`OpsJobs._openDetail(${id})` },
      { label:'Return', class:'btn-danger', onclick:`OpsJobs._doReject(${id})` },
    ]);
  }
  async function _doReject(id) {
    const reason = _val('j-rej').trim();
    if (!reason) { OpsModal.toast('Add a reason', 'warning'); return; }
    try {
      const res = await OpsModal.apiPost('/jobs/' + id + '/reject', { reason });
      if (res && res.success) { OpsModal.close(); OpsModal.toast('Returned to provider', 'success'); loadList(); }
      else OpsModal.toast((res && res.error) || 'Failed to return', 'error');
    } catch (err) { OpsModal.toast('Failed to return: ' + (err.message||''), 'error'); }
  }
  function _cancel(id) {
    const body = `<div class="jf"><label>Reason (optional)</label>
      <textarea id="j-can" rows="2" placeholder="Why is this job being cancelled?"></textarea></div>`;
    OpsModal.open('Cancel job', body, [
      { label:'Keep job', class:'btn-ghost', onclick:`OpsJobs._openDetail(${id})` },
      { label:'Cancel job', class:'btn-danger', onclick:`OpsJobs._doCancel(${id})` },
    ]);
  }
  async function _doCancel(id) {
    try {
      const res = await OpsModal.apiPost('/jobs/' + id + '/cancel', { reason: _val('j-can') || null });
      if (res && res.success) { OpsModal.close(); OpsModal.toast('Job cancelled', 'success'); loadList(); }
      else OpsModal.toast((res && res.error) || 'Failed to cancel', 'error');
    } catch (err) { OpsModal.toast('Failed to cancel: ' + (err.message||''), 'error'); }
  }

  return { render, _create, _dispatchForm, _doDispatch, _verify, _rejectForm, _doReject, _cancel, _doCancel, _openDetail: openDetail };
})();
window.OpsJobs = OpsJobs;
