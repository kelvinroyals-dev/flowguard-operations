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
  const statusPill = s => { const m = STATUS[s] || STATUS.pending; return `<span class="lv-status ${m[0]}">${m[1]}</span>`; };

  const EXTRA = `<style id="spo-css">
    .spo-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:14px;}
    .spo-head-title h2{margin:0;font-size:var(--fs-xl);font-weight:700;color:var(--ink);}
    .spo-head-title span{font-size:var(--fs-xs);color:var(--ink-3);}
    .spo-members{font-size:var(--fs-sm);color:var(--ink-2);line-height:1.7;}
  </style>`;

  let _container = null, _filter = 'pending', _term = '', _rows = [];

  async function render(container) {
    _container = container;
    container.innerHTML = EXTRA + `
      <div class="spo-head">
        <div class="spo-head-title"><h2>Service Providers</h2><span>External providers who apply to deliver field work — review and approve</span></div>
      </div>
      <div class="lv-wrap">
        <div class="lv-toolbar">
          <div class="lv-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input id="spo-search" placeholder="Search providers…" oninput="OpsProviders.search(this.value)">
          </div>
          <div class="lv-toolbar-right">
            <select class="um-filter" onchange="OpsProviders.filter(this.value)">
              <option value="pending"${_filter==='pending'?' selected':''}>Pending</option>
              <option value="active"${_filter==='active'?' selected':''}>Active</option>
              <option value="rejected"${_filter==='rejected'?' selected':''}>Rejected</option>
              <option value="all"${_filter==='all'?' selected':''}>All</option>
            </select>
          </div>
        </div>
        <div id="spo-body"><div class="lv-empty" style="padding:40px;text-align:center;color:var(--ink-3)">Loading…</div></div>
      </div>`;
    await load();
  }

  async function load() {
    const body = document.getElementById('spo-body');
    try {
      const q = _filter === 'all' ? '' : ('?status=' + _filter);
      const res = await OpsModal.apiGet('/service-providers' + q);
      _rows = (res && res.data) || [];
      draw();
    } catch (err) {
      if (body) body.innerHTML = OpsModal.emptyState('', "Couldn't load providers", esc(err.message || 'network error'));
    }
  }

  function search(q) { _term = (q || '').trim().toLowerCase(); draw(); }
  function filter(k) { _filter = k; render(_container); }  // server filters by status → re-fetch

  function draw() {
    const body = document.getElementById('spo-body');
    if (!body) return;
    let rows = _rows.slice();
    if (_term) rows = rows.filter(o => `${o.name||''} ${o.contact_person||''} ${o.email||''} ${o.coverage_area||''}`.toLowerCase().includes(_term));
    if (!rows.length) {
      body.innerHTML = OpsModal.emptyState('', 'No providers here', _filter === 'pending' ? 'No applications awaiting review.' : 'Nothing in this view.');
      return;
    }
    body.innerHTML = `
      <div class="lv-scroll">
        <table class="lv-table">
          <thead><tr><th>Organisation</th><th>Contact</th><th>Coverage</th><th>Members</th><th>Status</th></tr></thead>
          <tbody>
            ${rows.map(o => {
              const services = Array.isArray(o.service_types) ? o.service_types.join(', ') : '';
              return `<tr class="clickable" onclick="OpsProviders.openDetail('${OpsModal.sid(o.id)}')" tabindex="0" onkeydown="if(event.key==='Enter'){OpsProviders.openDetail('${OpsModal.sid(o.id)}')}">
                <td>
                  <div class="lv-name-cell">
                    <div class="lv-avatar" style="background:var(--surface-3);color:var(--ink-3);border:1px solid var(--border);"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M6 21V7l6-4 6 4v14"/><path d="M9 9h.01M9 13h.01M9 17h.01"/></svg></div>
                    <div style="min-width:0"><div class="lv-name">${esc(dash(o.name))}</div><div style="font-size:var(--fs-2xs);color:var(--ink-3)">${services?esc(services):'—'}</div></div>
                  </div>
                </td>
                <td><div>${esc(dash(o.contact_person))}</div><div style="font-size:var(--fs-2xs);color:var(--ink-3)">${esc(dash(o.email))}</div></td>
                <td>${esc(dash(o.coverage_area))}</td>
                <td class="lv-mono">${o.member_count||1}</td>
                <td>${statusPill(o.status)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  async function openDetail(id) {
    if (_container) _container.innerHTML = EXTRA + `<div style="padding:40px;text-align:center;color:var(--ink-3)">Loading…</div>`;
    let o;
    try { const res = await OpsModal.apiGet('/service-providers/' + id); o = res && res.data; }
    catch (err) { OpsModal.toast("Couldn't load provider: " + (err.message||''), 'error'); back(); return; }
    if (!o) { back(); return; }
    const F = OpsModal.fact;
    const services = Array.isArray(o.service_types) ? o.service_types.join(', ') : '';
    const members = (o.members || []).map(m => `${esc(m.full_name||m.email)} <span style="color:var(--ink-3)">(${esc(m.sp_role||'member')})</span>`).join('<br>') || '—';

    const detailsBody = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px 20px">
      ${F('Contact', esc(dash(o.contact_person)))}
      ${F('Email', esc(dash(o.email)))}
      ${F('Phone', esc(dash(o.phone)))}
      ${F('Coverage area', esc(dash(o.coverage_area)))}
      ${F('Services', services ? esc(services) : '—')}
      ${F('Applied', fmtDate(o.created_at))}
      ${o.verification_submitted_at ? F('Submitted for review', fmtDate(o.verification_submitted_at)) : ''}
      ${o.status==='rejected' ? F('Rejection', esc(REJECT_REASONS[o.reject_reason]||o.reject_reason||'—') + (o.reject_note?(' — '+esc(o.reject_note)):'')) : ''}
    </div>`;

    let actions = '';
    if (o.status !== 'active') actions += `<button class="btn-ghost" onclick="OpsProviders._rejectForm(${o.id})">Reject</button> <button class="btn-primary" onclick="OpsProviders._approve(${o.id})">Approve</button>`;

    const st = STATUS[o.status] || STATUS.pending;
    _container.innerHTML = EXTRA + OpsModal.detailShell({
      back: 'OpsProviders.back()', crumbRoot: 'Service Providers', title: esc(dash(o.name)),
      chips: [{ cls: st[0], label: st[1], dot: true }],
      meta: [['Members ', String(o.member_count || (o.members||[]).length || 1)]],
      actions,
      sections: [
        { id:'details', title:'Organisation', body: detailsBody },
        { id:'members', title:'Members', body: `<div class="spo-members">${members}</div>` },
      ],
    });
  }
  function back() { if (_container) render(_container); }

  async function _approve(id) {
    OpsModal.confirm('Approve this provider? They\'ll be able to sign in and receive jobs.', async () => {
      try { await OpsModal.apiPost('/service-providers/' + id + '/approve', {}); OpsModal.toast('Provider approved', 'nominal'); openDetail(id); }
      catch (err) { OpsModal.toast(err.message || 'Failed to approve', 'error'); }
    });
  }
  function _rejectForm(id) {
    const body = `
      ${OpsModal.field('Reason', 'reason', 'select', 'incomplete_info', { options: Object.keys(REJECT_REASONS).map(k => ({ value:k, label:REJECT_REASONS[k] })) })}
      ${OpsModal.field('Note to applicant (optional)', 'note', 'textarea', '', { required:false, rows:3, placeholder:'Short, specific — this is emailed to them.' })}`;
    OpsModal.open('Reject provider', body, [
      { label:'Cancel', class:'btn-ghost', onclick:`OpsProviders.openDetail('${id}')` },
      { label:'Reject & email', class:'btn-danger', onclick:`OpsProviders._doReject(${id})`, id:'spo-rej-submit' },
    ]);
  }
  async function _doReject(id) {
    const d = OpsModal.getFormData();
    OpsModal.setLoading('spo-rej-submit', true);
    try { await OpsModal.apiPost('/service-providers/' + id + '/reject', { reason: d.reason || 'other', note: d.note || '' }); OpsModal.toast('Provider rejected — applicant emailed', 'nominal'); OpsModal.close(); openDetail(id); }
    catch (err) { OpsModal.toast(err.message || 'Failed to reject', 'error'); }
    finally { OpsModal.setLoading('spo-rej-submit', false); }
  }

  return { render, back, search, filter, openDetail, _approve, _rejectForm, _doReject };
})();
window.OpsProviders = OpsProviders;
