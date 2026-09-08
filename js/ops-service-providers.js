// ============================================
// OPS SERVICE PROVIDERS MODULE
// Review queue for external Service Provider Organisations (SPOs):
// list by status, open a detail view, approve, or reject with a
// categorical reason (which emails the applicant). Backed by
// /api/v1/service-providers (staff-only endpoints).
// ============================================

const OpsProviders = (function () {
  'use strict';
  const esc = (OpsModal && OpsModal.esc) ? OpsModal.esc : (v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])));
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—';
  const dash = v => (v == null || v === '') ? '—' : esc(v);

  const REJECT_REASONS = {
    incomplete_info:     'Incomplete information',
    unsupported_area:    'Unsupported coverage area',
    verification_failed: 'Verification failed',
    other:               'Not accepted (other)',
  };
  const STATUS_CHIP = {
    pending:  ['#b45309', 'rgba(180,83,9,.12)',  'Pending review'],
    active:   ['#0a8a6a', 'rgba(16,185,129,.12)','Active'],
    rejected: ['#dc2626', 'rgba(220,38,38,.10)', 'Rejected'],
    suspended:['#6b7280', 'rgba(107,114,128,.12)','Suspended'],
  };

  const CSS = `<style id="spo-css">
    .spo-tabs{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap}
    .spo-tab{font-size:13px;font-weight:600;padding:7px 14px;border-radius:20px;background:var(--surface);border:1px solid var(--border);color:var(--ink-2);cursor:pointer}
    .spo-tab.on{background:var(--ink);color:var(--surface);border-color:var(--ink)}
    .spo-wrap{background:var(--surface);border:1px solid var(--border);border-radius:14px;overflow:hidden;box-shadow:var(--sh-xs)}
    .spo-row{display:grid;grid-template-columns:1.6fr 1.4fr 1.2fr 130px 44px;gap:12px;align-items:center;padding:14px 18px;border-bottom:1px solid var(--border);cursor:pointer}
    .spo-row:last-child{border-bottom:0}
    .spo-row:hover{background:var(--surface-h,rgba(0,0,0,.02))}
    .spo-row .nm{font-weight:700;color:var(--ink);font-size:14px}
    .spo-row .sub{font-size:12px;color:var(--ink-3);margin-top:2px}
    .spo-chip{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:20px;white-space:nowrap}
    .spo-chip .d{width:7px;height:7px;border-radius:50%}
    .spo-empty{padding:44px 20px;text-align:center;color:var(--ink-3);font-size:14px}
    .spo-head{padding:14px 18px;border-bottom:1px solid var(--border);font-size:12px;color:var(--ink-3);font-weight:700;letter-spacing:.4px;text-transform:uppercase}
    .spo-detail dt{font-size:11.5px;color:var(--ink-3);font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-top:12px}
    .spo-detail dd{font-size:14px;color:var(--ink);margin-top:3px}
    .spo-members{margin-top:6px;font-size:13px;color:var(--ink-2)}
    .spo-field{margin:14px 0}
    .spo-field label{display:block;font-size:12px;font-weight:700;color:var(--ink-2);margin-bottom:6px}
    .spo-field select,.spo-field textarea{width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:9px;font-family:inherit;font-size:14px;background:var(--surface);color:var(--ink)}
  </style>`;

  let _container = null, _filter = 'pending';

  function chip(status) {
    const c = STATUS_CHIP[status] || STATUS_CHIP.pending;
    return `<span class="spo-chip" style="color:${c[0]};background:${c[1]}"><span class="d" style="background:${c[0]}"></span>${c[2]}</span>`;
  }

  async function render(container) {
    _container = container;
    container.innerHTML = CSS + `
      <div class="spo-tabs" id="spo-tabs">
        ${['pending','active','rejected','all'].map(s => `<button class="spo-tab ${s===_filter?'on':''}" data-s="${s}">${s[0].toUpperCase()+s.slice(1)}</button>`).join('')}
      </div>
      <div id="spo-list"><div class="spo-empty">Loading…</div></div>`;
    container.querySelector('#spo-tabs').addEventListener('click', e => {
      const b = e.target.closest('.spo-tab'); if (!b) return;
      _filter = b.dataset.s; render(container);
    });
    await loadList();
  }

  async function loadList() {
    const el = _container.querySelector('#spo-list');
    try {
      const q = _filter === 'all' ? '' : ('?status=' + _filter);
      const res = await OpsModal.apiGet('/service-providers' + q);
      const rows = (res && res.data) || [];
      if (!rows.length) { el.innerHTML = `<div class="spo-wrap"><div class="spo-empty">No ${_filter==='all'?'':_filter+' '}providers.</div></div>`; return; }
      el.innerHTML = `<div class="spo-wrap">
        <div class="spo-row spo-head" style="cursor:default"><div>Organisation</div><div>Contact</div><div>Coverage</div><div>Status</div><div></div></div>
        ${rows.map(rowHtml).join('')}
      </div>`;
      el.querySelectorAll('.spo-row[data-id]').forEach(r => r.addEventListener('click', () => openDetail(r.dataset.id)));
    } catch (err) {
      el.innerHTML = `<div class="spo-wrap"><div class="spo-empty">Couldn't load providers. ${esc(err.message||'')}</div></div>`;
    }
  }

  function rowHtml(o) {
    const services = Array.isArray(o.service_types) ? o.service_types.join(', ') : '';
    return `<div class="spo-row" data-id="${o.id}">
      <div><div class="nm">${dash(o.name)}</div><div class="sub">${services ? esc(services) : '—'} · ${o.member_count||1} member${(o.member_count||1)>1?'s':''}</div></div>
      <div><div>${dash(o.contact_person)}</div><div class="sub">${dash(o.email)}</div></div>
      <div>${dash(o.coverage_area)}</div>
      <div>${chip(o.status)}</div>
      <div style="color:var(--ink-3)">›</div>
    </div>`;
  }

  async function openDetail(id) {
    try {
      const res = await OpsModal.apiGet('/service-providers/' + id);
      const o = res && res.data; if (!o) return;
      const services = Array.isArray(o.service_types) ? o.service_types.join(', ') : '';
      const members = (o.members || []).map(m => `${esc(m.full_name||m.email)} <span style="color:var(--ink-3)">(${esc(m.sp_role||'member')})</span>`).join('<br>') || '—';
      const body = `<div class="spo-detail">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <div style="font-size:18px;font-weight:800;color:var(--ink)">${dash(o.name)}</div>${chip(o.status)}
        </div>
        <dl>
          <dt>Contact</dt><dd>${dash(o.contact_person)} · ${dash(o.email)} · ${dash(o.phone)}</dd>
          <dt>Coverage area</dt><dd>${dash(o.coverage_area)}</dd>
          <dt>Services</dt><dd>${services ? esc(services) : '—'}</dd>
          <dt>Applied</dt><dd>${fmtDate(o.created_at)}${o.verification_submitted_at ? ' · submitted for verification ' + fmtDate(o.verification_submitted_at) : ''}</dd>
          ${o.status==='rejected' ? `<dt>Rejection</dt><dd>${esc(REJECT_REASONS[o.reject_reason]||o.reject_reason||'—')}${o.reject_note?(' — '+esc(o.reject_note)):''}</dd>` : ''}
          <dt>Members</dt><dd class="spo-members">${members}</dd>
        </dl>
      </div>`;
      const buttons = o.status === 'active'
        ? [{ label:'Close', class:'btn-ghost', onclick:'OpsModal.close()' }]
        : [
            { label:'Close',   class:'btn-ghost',  onclick:'OpsModal.close()' },
            { label:'Reject',  class:'btn-ghost',  onclick:`OpsProviders._rejectForm(${o.id})` },
            { label:'Approve', class:'btn-primary', onclick:`OpsProviders._approve(${o.id})` },
          ];
      OpsModal.open('Service Provider', body, buttons);
    } catch (err) { OpsModal.toast('Couldn\'t load provider: ' + (err.message||''), 'error'); }
  }

  async function _approve(id) {
    try {
      const res = await OpsModal.apiPost('/service-providers/' + id + '/approve', {});
      if (res && res.success) { OpsModal.close(); OpsModal.toast('Provider approved', 'success'); loadList(); }
      else OpsModal.toast((res && res.error) || 'Failed to approve', 'error');
    } catch (err) { OpsModal.toast('Failed to approve: ' + (err.message||''), 'error'); }
  }

  function _rejectForm(id) {
    const body = `<div class="spo-field">
        <label>Reason</label>
        <select id="spo-reject-reason">
          ${Object.keys(REJECT_REASONS).map(k => `<option value="${k}">${REJECT_REASONS[k]}</option>`).join('')}
        </select>
      </div>
      <div class="spo-field">
        <label>Note to applicant (optional)</label>
        <textarea id="spo-reject-note" rows="3" placeholder="Short, specific — this is emailed to them."></textarea>
      </div>`;
    OpsModal.open('Reject provider', body, [
      { label:'Cancel', class:'btn-ghost', onclick:`OpsProviders._openDetail(${id})` },
      { label:'Reject & email', class:'btn-danger', onclick:`OpsProviders._doReject(${id})` },
    ]);
  }

  async function _doReject(id) {
    const reason = (document.getElementById('spo-reject-reason') || {}).value || 'other';
    const note = (document.getElementById('spo-reject-note') || {}).value || '';
    try {
      const res = await OpsModal.apiPost('/service-providers/' + id + '/reject', { reason, note });
      if (res && res.success) { OpsModal.close(); OpsModal.toast('Provider rejected — applicant emailed', 'success'); loadList(); }
      else OpsModal.toast((res && res.error) || 'Failed to reject', 'error');
    } catch (err) { OpsModal.toast('Failed to reject: ' + (err.message||''), 'error'); }
  }

  return { render, _approve, _rejectForm, _doReject, _openDetail: openDetail };
})();
window.OpsProviders = OpsProviders;
