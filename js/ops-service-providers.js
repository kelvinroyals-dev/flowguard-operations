/* ══════════════════════════════════════════════════════════════
   FlowGuard Ops — SERVICE PROVIDERS
   Review queue for external Service Provider Organisations (SPOs):
   list by status, open a detail view, approve, or reject with a
   categorical reason (which emails the applicant). Backed by
   /api/v1/service-providers (staff-only endpoints).

   Chrome matches the established module pattern (Maintenance Planner):
   title+subtitle header, a bordered .lv-wrap panel with .lv-search +
   .um-filter, a .lv-table with uppercase headers + .lv-status pills,
   and the shared OpsModal.detailShell for the detail screen.
   ══════════════════════════════════════════════════════════════ */
const OpsProviders = (function () {
  'use strict';
  const esc = (OpsModal && OpsModal.escape) ? OpsModal.escape : (v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])));
  const dash = v => (v == null || v === '') ? '—' : v;
  const fmtDate = d => OpsModal.fmtDate(d);
  const coverage = o => o.coverage_area || (Array.isArray(o.coverage_areas) ? o.coverage_areas.join(', ') : '') || '—';
  const canManage = () => Auth.hasNavAccess('providers') && Auth.can('providers.manage');
  function requireManage() {if(canManage())return true;OpsModal.toast('You do not have permission to change service providers','watch');return false;}

  const REJECT_REASONS = {
    incomplete_info:     'Incomplete information',
    unsupported_area:    'Unsupported coverage area',
    verification_failed: 'Verification failed',
    other:               'Not accepted (other)',
  };
  // status → [ lv-status modifier, label ]
  const STATUS = {
    pending:   ['warn','Pending review'],
    active:    ['ok','Active'],
    rejected:  ['danger','Rejected'],
    suspended: ['neutral','Suspended'],
  };
  const statusPill = s => OpsModal.status(s,(STATUS[s] || ['neutral',OpsModal.label(s)])[1],null,'provider');


  let _container = null, _filter = 'pending', _term = '', _rows = [];
  let _workspace = 'review';
  let _revision = 0;
  function workspaceRows(rows) { return rows.filter(o=>_workspace==='all' || (_workspace==='review' ? ['pending','rejected'].includes(o.status) : ['active','suspended'].includes(o.status))); }
  function setWorkspace(value) { _workspace=['review','directory','all'].includes(value)?value:'review';_filter=_workspace==='review'?'pending':'all';if (_container) render(_container); }
  function onTimeRate(stats) { const eligible=Number(stats.with_sla),onTime=Number(stats.on_time);return stats.with_sla!=null && stats.on_time!=null && String(stats.with_sla).trim()!=='' && String(stats.on_time).trim()!=='' && Number.isInteger(eligible) && eligible>0 && Number.isInteger(onTime) && onTime>=0 && onTime<=eligible ? Math.round(onTime/eligible*100) : null; }

  async function render(container) {
    _container = container;
    container.innerHTML = `
      ${OpsModal.pageHeader({title:'Service providers',subtitle:'Review applications separately from the approved-provider directory'})}
      ${OpsModal.workspace({name:'Provider workspace',value:_workspace,handler:'OpsProviders.setWorkspace',options:[['review','Application review'],['directory','Provider directory'],['all','All records']]})}
      <div class="lv-wrap">
        <div class="lv-toolbar">
          <div class="lv-search">
            ${OpsModal.actionIcon("search")}
            <input id="spo-search" aria-label="Search service providers" placeholder="Search service providers…" oninput="OpsProviders.search(this.value)">
          </div>
          <div class="lv-toolbar-right">
            <select class="um-filter" aria-label="Provider status" onchange="OpsProviders.filter(this.value)">
              <option value="pending"${_filter==='pending'?' selected':''}>Pending</option>
              <option value="active"${_filter==='active'?' selected':''}>Active</option>
              <option value="rejected"${_filter==='rejected'?' selected':''}>Rejected</option>
              <option value="suspended"${_filter==='suspended'?' selected':''}>Suspended</option>
              <option value="all"${_filter==='all'?' selected':''}>All</option>
            </select>
          </div>
        </div>
        <div id="spo-body">${OpsModal.loading('Loading service providers…')}</div>
      </div>`;
    await load();
  }

  async function load() {
    const revision=++_revision;
    const body = document.getElementById('spo-body');
    try {
      const q = _filter === 'all' ? '' : ('?status=' + _filter);
      const res = await OpsModal.apiGet('/service-providers' + q);
      if(revision!==_revision)return;
      if (!Array.isArray(res && res.data)) throw new Error('Provider list was not supplied');
      _rows = res.data;
      draw();
    } catch (err) {
      if (body && revision===_revision) body.innerHTML = OpsModal.failure('Service providers',err,"reloadTab('providers')");
    }
  }

  function search(q) { _term = (q || '').trim().toLowerCase(); draw(); }
  function filter(k) { _filter = k; render(_container); }  // server filters by status → re-fetch

  function draw() {
    const body = document.getElementById('spo-body');
    if (!body) return;
    let rows = workspaceRows(_rows).filter(o=>_filter==='all'||o.status===_filter);
    if (_term) rows = rows.filter(o => `${o.name||''} ${o.contact_person||''} ${o.email||''} ${o.coverage_area||''}`.toLowerCase().includes(_term));
    if (!rows.length) {
      body.innerHTML = OpsModal.emptyState(OpsModal.entityIcon('provider'),_term?'No matching providers':'No providers returned for this view',_term?'Change the search or provider workspace to review other records.':'No provider records were returned for this workspace and server-side state filter. Switch workspace or state to broaden the directory.');
      return;
    }
    body.innerHTML = `
      <div class="lv-scroll">
        <table class="lv-table">
          <thead><tr><th scope="col">Organisation</th><th scope="col">Contact</th><th scope="col">Coverage</th><th scope="col">Members</th><th scope="col">Status</th></tr></thead>
          <tbody>
            ${rows.map(o => {
              const services = Array.isArray(o.service_types) ? o.service_types.map(OpsModal.label).join(', ') : '';
              return `<tr class="clickable" onclick="OpsProviders.openDetail('${OpsModal.sid(o.id)}')">
                <td>
                  <div class="lv-name-cell">
                    <div class="lv-avatar" aria-hidden="true">${OpsModal.entityIcon('providers')}</div>
                    <div style="min-width:0"><button type="button" class="record-link lv-name" onclick="event.stopPropagation();OpsProviders.openDetail('${OpsModal.sid(o.id)}')">${esc(dash(o.name))}</button><div style="font-size:var(--fs-2xs);color:var(--ink-3)">${services?esc(services):'—'}</div></div>
                  </div>
                </td>
                <td><div class="fg-cell-copy">${esc(dash(o.contact_person || o.contact_name))}</div><div style="font-size:var(--fs-2xs);color:var(--ink-3)">${esc(dash(o.email))}</div></td>
                <td>${esc(coverage(o))}</td>
                <td class="lv-mono">${o.member_count!=null ? esc(o.member_count) : '—'}</td>
                <td>${statusPill(o.status)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  async function openDetail(id) {
    const revision=++_revision;
    if (_container) _container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--ink-3)">Loading…</div>`;
    let o, assigns = null;
    try { o = OpsModal.readRecord(await OpsModal.apiGet('/service-providers/' + id),'Service provider'); }
    catch (err) { if(revision===_revision&&_container) _container.innerHTML=OpsModal.recordFailure('Service provider',err,`OpsProviders.openDetail('${OpsModal.sid(id)}')`,'OpsProviders.back()');return; }
    if(revision!==_revision)return;
    try { assigns = (await OpsModal.apiGet('/service-providers/' + id + '/properties')).data; } catch (_) {}
    if(revision!==_revision)return;
    const F = OpsModal.fact;
    const services = Array.isArray(o.service_types) ? o.service_types.map(OpsModal.label).join(', ') : '';
    const members = Array.isArray(o.members) ? o.members.map(m => `${esc(m.full_name||m.email)} <span style="color:var(--ink-3)">(${esc(OpsModal.label(m.sp_role||'member'))})</span>`).join('<br>') || 'No members returned' : 'Member roster was not supplied';

    const detailsBody = `<div class="fg-facts-grid">
      ${F('Contact', esc(dash(o.contact_person || o.contact_name)))}
      ${F('Email', esc(dash(o.email)))}
      ${F('Phone', esc(dash(o.phone)))}
      ${F('Coverage area', esc(coverage(o)))}
      ${F('Services', services ? esc(services) : '—')}
      ${F('Applied', fmtDate(o.created_at))}
      ${o.verification_submitted_at ? F('Submitted for review', fmtDate(o.verification_submitted_at)) : ''}
      ${o.status==='rejected' ? F('Rejection', esc(REJECT_REASONS[o.reject_reason]||o.reject_reason||'—') + (o.reject_note?(' — '+esc(o.reject_note)):'')) : ''}
    </div>`;

    // Assigned estates (tenancy). Assign is only meaningful once active.
    const canAssign = o.status === 'active' && canManage();
    const propRows = !Array.isArray(assigns) ? '<div class="capability-note">Assigned-estate feed is unavailable; assignment count is unknown.</div>' : assigns.length
      ? `<div class="lv-scroll"><table class="lv-table"><thead><tr><th scope="col">Estate</th><th scope="col">Location</th><th scope="col">Assigned</th><th scope="col"></th></tr></thead><tbody>
          ${assigns.map(p => `<tr><td>${OpsModal.link('properties', p.property_id, p.property_name || p.property_id)}</td>
            <td>${esc([p.city, p.state].filter(Boolean).join(', ') || '—')}</td>
            <td class="lv-mono">${fmtDate(p.assigned_at)}</td>
            <td style="text-align:right">${canAssign ? `<button class="fg-action danger" onclick="OpsProviders._unassign(${o.id},'${OpsModal.sid(p.property_id)}')">Remove</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div>`
      : OpsModal.emptyState(OpsModal.entityIcon('estate'),'No assigned estates returned','This directory returned no assigned estates for the provider.');
    const propsBody = (canAssign ? `<div style="margin-bottom:12px"><button class="fg-action" onclick="OpsProviders._assignForm(${o.id})">Assign estate</button></div>` : '') + propRows;

    // performance (GET /:id returns stats)
    const s = o.stats || {};
    const onTime = onTimeRate(s);
    const perfBody = `<div class="fg-facts-grid">
      ${F('Total jobs', s.total != null ? s.total : '—')}
      ${F('Open', s.open != null ? s.open : '—')}
      ${F('Overdue', s.overdue != null ? esc(s.overdue) : 'Not supplied')}
      ${F('Awaiting verification', s.awaiting != null ? s.awaiting : '—')}
      ${F('Verified', s.verified != null ? s.verified : '—')}
      ${F('Declined', s.declined != null ? s.declined : '—')}
      ${F('On-time rate', onTime != null ? onTime + '%' : '—')}
      ${F('SLA-eligible jobs', s.with_sla != null ? esc(s.with_sla) : 'Not supplied')}
      ${F('Measurement period', s.period_start && s.period_end ? fmtDate(s.period_start)+' – '+fmtDate(s.period_end) : 'Not supplied')}
      ${F('Avg. time to accept', s.avg_accept_hrs != null ? s.avg_accept_hrs + ' h' : '—')}
      ${F('Avg. time on site', s.avg_work_hrs != null ? s.avg_work_hrs + ' h' : '—')}
    </div>`;

    let actions = '';
    if (o.status === 'pending' && canManage()) actions += `<button class="fg-action danger" onclick="OpsProviders._rejectForm(${o.id})">Reject application</button> <button class="fg-action fg-action-primary" onclick="OpsProviders._approve(${o.id})">Approve application</button>`;

    const st = STATUS[o.status] || ['neutral',OpsModal.label(o.status)];
    _container.innerHTML = OpsModal.detailShell({
      back: 'OpsProviders.back()', crumbRoot: 'Service providers', title: esc(dash(o.name)),
      avatar:{text:OpsModal.entityIcon('providers')},
      chips: [{ cls: OpsModal.statusTone(o.status,'provider'), label: st[1], dot: true }],
      decision:[['Application state',st[1]],['Contact',o.contact_person || o.contact_name || 'Not supplied'],['Next step',o.status==='pending'?'Review qualifications before approval':o.status==='active'?'Review assigned work and service performance':o.status==='suspended'?'Review suspension before assigning work':'Review the recorded application decision']],
      meta: [['Members ', o.member_count!=null ? esc(o.member_count) : Array.isArray(o.members) ? String(o.members.length) : 'Unknown'], ['Estates ', Array.isArray(assigns) ? String(assigns.length) : 'Unknown']],
      actions,
      sections: [
        { id:'details',     title:'Organisation', body: detailsBody },
        { id:'performance', title:'Performance', body: perfBody + (Auth.hasNavAccess('jobs') ? `<div class="capability-note"><button class="fg-action" onclick="OpsJobs.forProvider('${OpsModal.sid(o.id)}')">Review this provider’s work orders</button></div>` : '') },
        { id:'members',     title:'Members', body: `<div class="spo-members">${members}</div>` },
        { id:'properties',  title:'Assigned estates', body: propsBody },
      ],
    });
  }
  function back() { if (_container) render(_container); }

  async function _approve(id) {
    if (!requireManage()) return;
    OpsModal.confirm('Approve this provider? They\'ll be able to sign in and receive jobs.', async () => {
      if (!requireManage()) return;
      try { await OpsModal.apiPost('/service-providers/' + id + '/approve', {}); OpsModal.toast('Provider approved', 'nominal'); openDetail(id); }
      catch (err) { OpsModal.toast(err.message || 'Failed to approve', 'error'); }
    }, {tone:'neutral',title:'Approve provider application',confirmLabel:'Approve provider',detail:'Approval enables provider sign-in and eligibility to receive assigned work. Review the organisation before proceeding.'});
  }
  function _rejectForm(id) {
    if (!requireManage()) return;
    const body = `
      ${OpsModal.field('Reason', 'reason', 'select', 'incomplete_info', { options: Object.keys(REJECT_REASONS).map(k => ({ value:k, label:REJECT_REASONS[k] })) })}
      <div class="capability-note">The decision and note are saved. ${CONFIG.LOCAL_SANDBOX ? 'External delivery is disabled in this local environment.' : 'Email delivery is not confirmed by this action.'}</div>
      ${OpsModal.field('Note to applicant (optional)', 'note', 'textarea', '', { required:false, rows:3, placeholder:'A short, specific explanation.' })}`;
    OpsModal.open('Reject provider', body, [
      { label:'Cancel', class:'btn-ghost', onclick:`OpsProviders.openDetail('${id}')` },
      { label:'Record rejection', class:'btn-danger', onclick:`OpsProviders._doReject(${id})`, id:'spo-rej-submit' },
    ]);
  }
  async function _doReject(id) {
    if (!requireManage()) return;
    const d = OpsModal.getFormData();
    OpsModal.setLoading('spo-rej-submit', true);
    try { await OpsModal.apiPost('/service-providers/' + id + '/reject', { reason: d.reason || 'other', note: d.note || '' }); OpsModal.toast('Provider rejection recorded', 'nominal'); OpsModal.close(); openDetail(id); }
    catch (err) { OpsModal.toast(err.message || 'Failed to reject', 'error'); }
    finally { OpsModal.setLoading('spo-rej-submit', false); }
  }

  // ── property assignment ────────────────────────────────────────────────
  async function _assignForm(id) {
    if (!requireManage()) return;
    let props = [];
    try { props = (await OpsModal.apiGet('/properties/all')).data; if (!Array.isArray(props)) throw new Error('Invalid estate feed'); } catch (_) {OpsModal.toast('Estates are unavailable. Reopen to retry.','watch');return;}
    if (!props.length) { OpsModal.toast('No estates returned for assignment', 'warning'); return; }
    const opts = props.map(p => ({ value: p.property_id, label: (p.property_name || p.property_id) + (p.city ? (' · ' + p.city) : '') }));
    OpsModal.open('Assign estate', OpsModal.field('Estate', 'property_id', 'select', '', { options: opts }), [
      { label:'Cancel', class:'btn-ghost', onclick:`OpsProviders.openDetail('${id}')` },
      { label:'Assign', class:'btn-primary', onclick:`OpsProviders._doAssign(${id})`, id:'spo-asg-submit' },
    ]);
  }
  async function _doAssign(id) {
    if (!requireManage()) return;
    const d = OpsModal.getFormData();
    if (!d.property_id) { OpsModal.toast('Select an estate', 'warning'); return; }
    OpsModal.setLoading('spo-asg-submit', true);
    try { await OpsModal.apiPost('/service-providers/' + id + '/properties', { property_id: d.property_id }); OpsModal.toast('Estate assigned', 'nominal'); OpsModal.close(); openDetail(id); }
    catch (err) { OpsModal.toast(err.message || 'Failed to assign', 'error'); }
    finally { OpsModal.setLoading('spo-asg-submit', false); }
  }
  function _unassign(id, propertyId) {
    if (!requireManage()) return;
    OpsModal.confirm('Remove this estate from the provider?', async () => {
      if (!requireManage()) return;
      try { await OpsModal.apiDelete('/service-providers/' + id + '/properties/' + encodeURIComponent(propertyId)); OpsModal.toast('Estate removed', 'nominal'); openDetail(id); }
      catch (err) { OpsModal.toast(err.message || 'Failed to remove', 'error'); }
    });
  }

  return { render, back, search, filter, setWorkspace, openDetail, _approve, _rejectForm, _doReject, _assignForm, _doAssign, _unassign };
})();
window.OpsProviders = OpsProviders;
