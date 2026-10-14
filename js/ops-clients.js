// ============================================
// OPS CLIENTS MODULE
// Customer directory (client-type users who submitted properties).
// Rules: whole row opens a FULL detail screen (no pop-up), no "View"
// button, and every list column also appears in the detail view.
// ============================================

const OpsClients = (function () {
  const canMng = () => !(window.Auth && Auth.can) || Auth.can('clients.manage');
  const requireManage = () => canMng() || (OpsModal.toast('You do not have permission to change clients','watch'),false);
  'use strict';

  const _isAdmin = (() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('user') || localStorage.getItem('user') || '{}');
      return u.role === 'admin' || u.role === 'super_admin';
    } catch { return false; }
  })();

  let _all = [];
  let _pg = null;
  let _container = null;

  const money = (v,currency) => OpsModal.money(v,currency);
  const dash = v => (v == null || v === '') ? '—' : v;
  const fmtDate = d => OpsModal.fmtDate(d);


  // ── Client detail v2 — two-column glass layout (from mockup) ──────────

  // ────────────────────────────────────────────────────────── LIST VIEW
  function render(container) {
    _container = container;
    container.innerHTML = `

      ${OpsModal.pageHeader({title:'Clients',subtitle:'People and organisations receiving drainage management services'})}
      <div class="lv-wrap">
        <div class="lv-toolbar">
          <div class="lv-search">
            ${OpsModal.actionIcon("search")}
            <input id="cl-search" aria-label="Search clients" placeholder="Search clients…" oninput="OpsClients.search(this.value)">
          </div>
          <div class="lv-toolbar-right">
            <select aria-label="Client account scope" class="um-filter" onchange="OpsClients.setFilter(this.value)">
              <option value="all">All clients</option>
              <option value="active">Active</option>
              <option value="billing">Has billing</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
              <option value="unknown">Not supplied</option>
            </select>
          </div>
        </div>
        <div class="lv-legend">
          <span><span class="sw" style="background:var(--ink-3);"></span>Commercial details supplied</span>
          <span><span class="sw" style="background:var(--ink-3);"></span>Portal login only</span>
        </div>
        <div id="cl-table-body">
          <div style="padding:48px;text-align:center;color:var(--ink-3);">
            <div class="loading" style="margin:0 auto 12px;"></div>
            <div style="font-size:var(--fs-base);">Loading clients…</div>
          </div>
        </div>
      </div>`;
    loadClients();
  }

  async function loadClients() {
    try {
      const res = await OpsModal.apiGet('/clients');
      _all = OpsModal.readArray(res,'Client directory');
      _pg = FGPaginator.create(_all, { pageSize: 25, containerId: 'cl-table-body' });
      _pg.render(renderTable);
    } catch (err) {
      const el = document.getElementById('cl-table-body');
      if (el) el.innerHTML = OpsModal.failure('Clients',err,"reloadTab('clients')");
    }
  }

  let _filter = 'all';
  let _term = '';

  function _hasBilling(c) { return c.mrr != null || c.sla || c.tier; }
  function _matchesFilter(c) {
    if (['active','inactive','suspended','unknown'].includes(_filter)) return clientStatus(c).label.toLowerCase()===_filter;
    if (_filter === 'billing') return _hasBilling(c);
    return true;
  }
  function applyFilters() {
    const rows = _all.filter(c =>
      _matchesFilter(c) &&
      (!_term || (c.full_name || '').toLowerCase().includes(_term) || (c.email || '').toLowerCase().includes(_term)));
    if (_pg) _pg.update(rows);
    else renderTable(rows);
  }
  function search(q) {
    _term = q.trim().toLowerCase();
    applyFilters();
  }
  function setFilter(f) {
    _filter = f;
    ['all', 'active', 'billing', 'inactive'].forEach(k => {
      const el = document.getElementById('clf-' + k);
      if (el) el.classList.toggle('active', k === f);
    });
    applyFilters();
  }

  function initials(name) {
    return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  function renderTable(clients) {
    const el = document.getElementById('cl-table-body');
    if (!el) return;
    if (!clients || !clients.length) {
      el.innerHTML = OpsModal.emptyState(OpsModal.entityIcon('client'),_all.length?'No matching clients':'No clients returned',_all.length?'Change the search or account filter to broaden these results.':'No client accounts were returned by this directory.');
      return;
    }
    const dashCell = '<span class="lv-dash">—</span>';
    el.innerHTML = `
      <div class="lv-scroll">
        <table class="lv-table">
          <thead>
            <tr>
              <th scope="col">Client</th>
              <th scope="col">Contact</th>
              <th scope="col">Estate coverage</th>
              <th scope="col">Reported MRR</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            ${clients.map(c => {
              const src = c.is_active === false
                ? '<span class="lv-source">portal login · inactive</span>'
                : _hasBilling(c)
                  ? '<span class="lv-source">commercial details supplied</span>'
                  : '<span class="lv-source">portal login</span>';
              const st = clientStatus(c);
              return `
              <tr>
                <td>
                  <div class="lv-name-cell">
                    <div class="lv-avatar" style="background:var(--surface-3);color:var(--ink-2);border:1px solid var(--border);">${OpsModal.escape(initials(c.full_name))}</div>
                    <div style="min-width:0;">
                      <button type="button" class="record-link lv-name" onclick="event.stopPropagation();OpsClients.open('${OpsModal.sid(c.client_id)}')">${OpsModal.escape(c.full_name || '—')}</button>
                      ${src}
                    </div>
                  </div>
                </td>
                <td>${c.email ? `<span class="lv-mono" style="font-size:var(--fs-xs);">${OpsModal.escape(c.email)}</span>` : dashCell}</td>
                <td>${OpsModal.count(c.submitted_areas)!=null ? OpsModal.count(c.submitted_areas)+' submitted estate'+(OpsModal.count(c.submitted_areas)===1?'':'s') : 'Not supplied'}<div class="lv-source">${OpsModal.count(c.active_areas)!=null ? OpsModal.count(c.active_areas)+' active' : 'Active count not supplied'}</div></td>
                <td class="num">${c.mrr != null ? money(c.mrr,c.mrr_currency || c.currency) : 'Not supplied'}</td>
                <td><span class="lv-status ${st.cls}">${OpsModal.escape(st.label)}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function clientStatus(c) {
    const key=c.is_active===true?'active':c.is_active===false?'inactive':c.status || 'unknown';
    return {cls:OpsModal.statusTone(key,'account'),label:OpsModal.label(key)};
  }

  function pipelineBadge(s) {
    return OpsModal.status(s,null,null,'estate');
  }

  function back() { if (_container) render(_container); }

  // ────────────────────────────────────────────────── FULL DETAIL SCREEN
  async function open(clientId) {
    if (!_container) return;
    _container.innerHTML = `<div style="padding:60px;text-align:center;color:var(--ink-3);"><div class="loading" style="margin:0 auto 12px;"></div>Loading client…</div>`;
    try {
      const res = await OpsModal.apiGet('/clients/' + clientId);
      const c = OpsModal.readRecord(res,'Client');
      renderDetail(c);
    } catch (err) {
      _container.innerHTML = OpsModal.recordFailure('Client',err,`OpsClients.open('${OpsModal.sid(clientId)}')`,'OpsClients.back()');
    }
  }


  function renderDetail(c) {
    const areas = Array.isArray(c.areas) ? c.areas : [];
    const invoices = Array.isArray(c.invoices) ? c.invoices : [];
    const activeAreas = areas.filter(a => a.status === 'active');
    const L = OpsModal.link;
    const hasBilling = _hasBilling(c);
    const dt = v => v ? OpsModal.fmtDateTime(v) : '—';
    const dS = v => OpsModal.fmtDate(v);
    const linkState = c.is_active === false ? { cls: 'neutral', label: 'Inactive' }
      : hasBilling ? { cls: 'neutral', label: 'Commercial details supplied' }
      : { cls: 'neutral', label: 'Portal account' };

    const fact = OpsModal.fact;
    const emptyBox = OpsModal.emptyState;
    const note = txt => `<div class="capability-note">${txt}</div>`;
    const iDoc=OpsModal.entityIcon('document'),iFile=iDoc,iCard=OpsModal.entityIcon('payment'),iUser=OpsModal.entityIcon('client'),iCheck=OpsModal.entityIcon('check');
    const payPill = s => OpsModal.status(s,null,null,'payment');

    // Company information — the portal login (users) is the record we hold.
    // The billing block (clients table) only appears when a match actually
    // exists, so we never render a phantom empty "second record".
    const companyBody = `
      <section class="fg-record-subsection">
        <h3>Portal account</h3><div class="fg-facts-grid">
        ${fact('Email', c.email || '—')}
        ${fact('Phone', dash(c.phone))}
        ${fact('Account type', 'Client')}
        ${fact('Account state', OpsModal.detailPill(OpsModal.escape(clientStatus(c).label),clientStatus(c).cls))}
        ${fact('Last login', c.last_login ? dt(c.last_login) : 'Not supplied')}
      </div></section>
      ${hasBilling ? `
      <section class="fg-record-subsection">
        <h3>Commercial details</h3><div class="fg-facts-grid">
        ${c.tier ? fact('Tier', c.tier) : ''}
        ${c.mrr != null ? fact('MRR', money(c.mrr,c.mrr_currency || c.currency)) : ''}
        ${c.sla ? fact('Reported service value', c.sla) : ''}
        ${c.industry ? fact('Industry', c.industry) : ''}
      </div>${note('Commercial metrics are supplied account values. Their effective period, calculation and eligible service scope are not supplied in this view; account access is not proof of active service.')}</section>` : note('A commercial account was not supplied for this portal account. Billing and service terms cannot be assessed here.')}`;

    const contactsBody = note('A separate commercial contact directory was not supplied. Portal login details are in Account information and do not establish who is authorised to approve commercial changes.');

    const propertiesBody = areas.length
      ? `<table class="lv-table"><thead><tr><th scope="col">Estate</th><th scope="col">Type</th><th scope="col">Location</th><th scope="col">Status</th></tr></thead>
         <tbody>${areas.map(a => `<tr>
           <td class="strong">${a.property_id ? L('properties', a.property_id, a.property_name || a.property_id) : (a.property_name || '—')}</td>
           <td>${OpsModal.escape(OpsModal.label(a.property_type || 'unknown'))}</td>
           <td>${[a.city, a.state].filter(Boolean).join(', ') || '—'}</td>
           <td>${pipelineBadge(a.status)}</td>
         </tr>`).join('')}</tbody></table>`
      : emptyBox(iDoc, 'No estates returned', 'No estates were returned with this client record.');

    const contractsBody = emptyBox(iFile, 'Service terms unavailable', 'Signed contract details were not supplied with this record. Quotes and invoices are not proof of signed terms.');

    const billingBody = invoices.length
      ? `<table class="lv-table"><thead><tr><th scope="col">Invoice</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Due</th></tr></thead>
         <tbody>${invoices.map(inv => `<tr>
           <td class="strong">${L('billing', inv.invoice_id, inv.invoice_id)}</td>
           <td class="num">${OpsModal.money(inv.total_amount,inv.currency)}</td>
           <td>${payPill(inv.payment_status)}</td>
           <td class="lv-mono">${dS(inv.due_date)}</td>
         </tr>`).join('')}</tbody></table>
         `
      : emptyBox(iCard, 'No invoices returned', 'No invoices were returned with this client record.');

    const timelineEvents = [];
    if (c.created_at) timelineEvents.push({ t: 'Client account created', m: c.full_name || '', d: c.created_at, bg: 'rgba(28,184,232,.12)', c: 'var(--blue-hi)', ic: iUser });
    invoices.forEach(i => timelineEvents.push({t:'Invoice '+i.invoice_id+' created',m:money(i.total_amount,i.currency),d:i.created_at,ic:iCard}));
    if (c.last_login) timelineEvents.push({ t: 'Portal login', m: c.full_name || '', d: c.last_login, bg: 'var(--surface-2)', c: 'var(--ink-3)', ic: iUser });
    timelineEvents.sort((x, y) => new Date(y.d || 0) - new Date(x.d || 0));
    const timelineBody = timelineEvents.length
      ? timelineEvents.slice(0, 10).map(e => `<div class="fg-timeline-row"><div class="fg-timeline-icon">${e.ic}</div><div><div class="fg-timeline-title">${OpsModal.escape(e.t)}</div><div class="fg-timeline-meta">${OpsModal.escape(e.m || '—')}</div></div><div class="fg-timeline-time">${dt(e.d)}</div></div>`).join('')
      : emptyBox(iCheck, 'No activity returned', 'No dated account or invoice activity was supplied with this record.');

    const SECTIONS = [
      ['company', 'Account information', '', companyBody],
      ['contacts', 'Commercial contacts', '', contactsBody],
      ['properties', 'Estates', '', propertiesBody],
      ['contracts', 'Contracts', '', contractsBody],
      ['billing', 'Billing', '', billingBody],
      ['documents', 'Documents', '', OpsModal.evidence(c.documents)],
      ['timeline', 'Timeline', 'derived events', timelineBody],
    ];

    const openInvoices = Array.isArray(c.invoices) ? invoices.filter(i => ['unpaid','partial','overdue','pending','failed'].includes(String(i.payment_status || '').toLowerCase())).length : 'Unavailable';
    const unknownPayments = invoices.filter(i=>!['paid','unpaid','partial','overdue','pending','failed'].includes(String(i.payment_status || '').toLowerCase())).length;
    const sidebar = `
      <div class="fgd-card">
        <div class="fgd-card-head"><h2>Record context</h2></div>
        ${fact('Client ID', `<span class="lv-mono">${OpsModal.escape(c.client_id ?? c.id ?? 'Not supplied')}</span>`)}
        ${fact('Joined', `<span class="fg-number">${dS(c.created_at)}</span>`)}
      </div>
      <div class="fgd-card">
        <div class="fgd-card-head"><h2>Billing follow-up</h2></div>
        ${fact('Open returned invoices', openInvoices)}
        ${unknownPayments ? fact('Invoices with unknown payment state',unknownPayments) : ''}
        <p class="capability-note">This count covers invoices supplied with this record, not a complete ledger reconciliation.</p>
      </div>`;

    const actions = [
      canMng() ? `<button class="fg-action" onclick="OpsClients.editClient(${c.client_id})">Edit</button>` : '',
      _isAdmin ? `<button class="danger fg-action" onclick="OpsClients.deleteClient(${c.client_id},'${(c.full_name || '').replace(/'/g, "\\'")}')">Delete</button>` : '',
    ].filter(Boolean).join('');

    _container.innerHTML = OpsModal.detailShell({
      back:'OpsClients.back()',crumbRoot:'Clients',title:OpsModal.escape(c.full_name || 'Client'),
      avatar:{text:OpsModal.escape(initials(c.full_name))},
      chips:linkState.label==='Portal account'?[]:[{label:linkState.label,cls:linkState.cls}],
      decision:[['Account context',linkState.label],['Estate scope',Array.isArray(c.areas)?`${c.areas.length} returned`:'Unavailable'],['Next step',!Array.isArray(c.invoices)?'Restore billing visibility':unknownPayments?'Resolve unknown payment states':openInvoices>0?'Review returned invoices requiring follow-up':'Review estate service coverage']],
      actions,sections:SECTIONS.map(([id,title,,body])=>({id,title,state:id==='contracts'?'unavailable':id==='documents'?OpsModal.collectionState(c.documents):null,body:id === 'properties' && !Array.isArray(c.areas) || id === 'billing' && !Array.isArray(c.invoices) ? '<div class="capability-note">Related records were not supplied with this account.</div>' : body})),
      note:'Portal access and the commercial account are separate. Confirm the linked organisation before billing or account changes.',sidebar,
    });
  }

  // ────────────────────────────────────────────────────────── EDIT / DELETE (actions)
  async function editClient(clientId) {
    if(!requireManage()) return;
    try {
      const res = await OpsModal.apiGet('/clients/' + clientId);
      const c = OpsModal.readRecord(res,'Client');
      OpsModal.open('Edit client', `
        ${OpsModal.field('Full name', 'full_name', 'text', c.full_name || '')}
        ${OpsModal.field('Phone', 'phone', 'text', c.phone || '', { required: false })}
        ${OpsModal.field('Account state', 'status', 'select', c.status || '', {
          options: [
            { value: '', label: 'Select an account state' },
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Suspended' },
            { value: 'inactive', label: 'Inactive' },
          ]
        })}
      `, [
        { label: 'Cancel', onclick: 'OpsModal.close()', class: 'btn-ghost' },
        { label: 'Save client', onclick: `OpsClients.saveClient(${clientId})`, class: 'btn-primary', id: 'modal-save-btn' },
      ]);
    } catch (err) { OpsModal.open('Edit client',OpsModal.failure('Client details',err,`OpsClients.editClient('${OpsModal.sid(clientId)}')`),[{label:'Close',onclick:'OpsModal.close()'}]); }
  }

  async function saveClient(clientId) {
    if(!requireManage()) return;
    const data = OpsModal.getFormData();
    if (!['active','suspended','inactive'].includes(data.status)) return OpsModal.toast('Select the intended account state before saving', 'watch');
    OpsModal.setLoading('modal-save-btn', true);
    try {
      await OpsModal.apiPut('/clients/' + clientId, data);
      OpsModal.close();
      OpsModal.toast('Client updated successfully', 'nominal');
      open(clientId); // return to the (refreshed) detail screen
    } catch (err) {
      OpsModal.toast('Failed to update: ' + err.message, 'critical');
      OpsModal.setLoading('modal-save-btn', false);
    }
  }

  function deleteClient(clientId, name) {
    if(!requireManage()) return;
    if(!_isAdmin) return OpsModal.toast('Only an administrator can delete clients','watch');
    OpsModal.confirm(
      `Permanently delete client "${name}"? This removes all their submitted areas and associated data.`,
      async function () {
        if(!requireManage()) return;
        OpsModal.setLoading('modal-confirm-btn', true);
        try {
          await OpsModal.apiDelete('/clients/' + clientId);
          OpsModal.close();
          OpsModal.toast(`Client "${name}" deleted`, 'nominal');
          back();
        } catch (err) {
          OpsModal.toast('Delete failed: ' + err.message, 'critical');
          OpsModal.setLoading('modal-confirm-btn', false);
        }
      }
    );
  }

  return { render, search, setFilter, open, back, editClient, saveClient, deleteClient };

})();
