// ============================================
// OPS BILLING — invoices
// List (story strip + lv-table) · Invoice detail (detailShell) · Create invoice
// Built to the billing / invoice-detail / create-invoice mockups, and honest
// about schema gaps: invoices carry BOTH `status` and `payment_status`, client
// is derived via the property (not a client_id on the invoice), there's no
// payment_method column, and no contracts / payment-ledger / credit-note /
// attachments tables — the UI surfaces those gaps rather than faking them.
// ============================================
const OpsBilling = (function () {
  'use strict';

  let _invoices = [], _container = null, _filter = 'all', _term = '';
  let _props = [], _draft = [], _editId = null, _draftCurrency = 'NGN', _savingInvoice = false;
  const DEFAULT_VAT = 7.5;

  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dash = v => (v == null || v === '') ? '—' : v;
  const currencyMoney = (n,code) => OpsModal.money(n,code);
  const NGN = n => currencyMoney(n,_draftCurrency);
  const suppliedAmount = n => !['number','string'].includes(typeof n) || String(n).trim()==='' || !Number.isFinite(Number(n)) ? null : Number(n);
  function invoiceAmounts(inv) {
    return {total:suppliedAmount(inv.total_amount), balance:suppliedAmount(inv.balance_due), paid:suppliedAmount(inv.paid_total), subtotal:suppliedAmount(inv.subtotal), vat:suppliedAmount(inv.vat_amount), vatRate:suppliedAmount(inv.vat_rate)};
  }
  const balanceColour = n => n == null ? 'var(--ink-3)' : n > 0 ? 'var(--err)' : 'var(--ok)';
  const fmtDate = ds => OpsModal.fmtDate(ds);

  // Gate write actions on the billing.manage permission (server also enforces).
  const canManage = () => (typeof Auth !== 'undefined' && Auth.can) ? Auth.can('billing.manage') : true;

  function payMeta(ps) {
    ps = String(ps || '').toLowerCase();
    return { c:OpsModal.statusTone(ps,'payment'), l:ps==='partial'?'Partially paid':OpsModal.label(ps || 'unknown') };
  }
  // A pending/partial invoice past its due date reads as "overdue" for the operator.
  function effStatus(inv,now=Date.now()) {
    const ps = String(inv.payment_status || 'unknown').toLowerCase();
    const late=inv.due_date ? OpsModal.pastDue(inv.due_date,now) : Number.isFinite(Number(inv.days_overdue)) && Number(inv.days_overdue)>0;
    if (['pending','partial','unpaid'].includes(ps) && late) return 'overdue';
    return ps;
  }


  const IWARN = OpsModal.entityIcon('incident');
  const gap = html => `<div class="bl-gap">${IWARN}<span>${html}</span></div>`;

  // ────────────────────────────────────────────────── LIST
  function render(container) {
    _container = container;
    container.innerHTML = `
      ${OpsModal.pageHeader({title:'Billing',subtitle:'Review balances, reconcile payments and manage invoices',actions:'<button class="fg-action" onclick="OpsBilling.exportCsv()">Export invoices</button>' + (canManage() ? '<button class="fg-action fg-action-primary" onclick="OpsBilling.openCreate()">Create invoice</button>' : '')})}
      <div class="lv-wrap">
        <div class="lv-toolbar">
          <div class="lv-search">
            ${OpsModal.actionIcon("search")}
            <input id="bl-search" aria-label="Search invoices" placeholder="Search invoices…" oninput="OpsBilling.search(this.value)">
          </div>
          <div class="lv-toolbar-right">
            <span id="bl-count" class="fg-result-count" aria-live="polite">Loading invoices…</span>
            <select aria-label="Invoice payment state" class="um-filter" onchange="OpsBilling.setFilter(this.value)">
              <option value="all">All invoices</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
              <option value="partial">Partially paid</option>
            </select>
          </div>
        </div>
        <div id="bl-table-body"><div style="padding:48px;text-align:center;color:var(--ink-3);">Loading invoices…</div></div>
      </div>`;
    loadAll();
  }

  async function loadAll() {
    try {
      const res = await OpsModal.apiGet('/billing/invoices');
      _invoices = OpsModal.readArray(res,'Invoice feed',['data','invoices']);
      const c = document.getElementById('bl-count'); if (c) c.textContent = `${_invoices.length} returned invoice${_invoices.length === 1 ? '' : 's'}`;
      applyFilter();
    } catch (err) {
      const el = document.getElementById('bl-table-body');
      if (el) el.innerHTML = OpsModal.failure('Billing',err,"reloadTab('billing')",false);
      const count=document.getElementById('bl-count'); if(count) count.textContent='Unavailable';
    }
  }

  function setFilter(f) {
    _filter = f;
    ['all', 'paid', 'pending', 'overdue', 'partial'].forEach(k => { const b = document.getElementById('blf-' + k); if (b) b.classList.toggle('active', k === f); });
    applyFilter();
  }
  function search(q) { _term = (q || '').trim().toLowerCase(); applyFilter(); }

  function applyFilter() {
    let rows = _invoices;
    if (_filter !== 'all') rows = rows.filter(i => effStatus(i) === _filter);
    if (_term) rows = rows.filter(i => `${i.invoice_id || ''} ${i.client_name || ''} ${i.property_name || ''}`.toLowerCase().includes(_term));
    renderTable(rows);
  }

  function renderTable(rows) {
    const el = document.getElementById('bl-table-body');
    if (!el) return;
    if (!rows.length) { el.innerHTML = OpsModal.emptyState('',_term || _filter!=='all'?'No matching invoices':'No invoices returned',_term || _filter!=='all'?'Adjust the search or settlement filter to review other invoices.':'No invoices were returned by this feed.'); return; }
    const L = OpsModal.link;
    el.innerHTML = `<div class="lv-scroll billing-ledger"><table class="lv-table">
      <colgroup><col class="bill-identity"><col class="bill-client"><col class="bill-estate"><col class="bill-amount"><col class="bill-amount"><col class="bill-date"><col class="bill-state"><col class="bill-state"></colgroup>
      <thead><tr>
        <th scope="col">Invoice</th>
        <th scope="col">Client</th>
        <th scope="col">Estate</th>
        <th scope="col">Total</th>
        <th scope="col">Balance due</th>
        <th scope="col">Due date</th>
        <th scope="col">Settlement</th>
        <th scope="col">Invoice lifecycle</th>
      </tr></thead>
      <tbody>${rows.map(inv => {
        const id = inv.invoice_id;
        const eff = effStatus(inv), pm = payMeta(eff);
        const overdue = eff === 'overdue';
        const client = inv.user_id ? L('clients', inv.user_id, inv.client_name || 'Client') : '<span class="lv-dash">'+(Object.hasOwn(inv,'user_id') && inv.user_id===null ? 'Not linked' : 'Not supplied')+'</span>';
        const prop = inv.property_id ? L('properties', inv.property_id, inv.property_name || inv.property_id) : dash(inv.property_name);
        return `<tr class="clickable" onclick="OpsBilling.open('${id}')">
          <td>
            <div class="lv-name-cell">
              <div class="lv-avatar" aria-hidden="true">${OpsModal.entityIcon('billing')}</div>
              <div style="min-width:0;"><button type="button" class="record-link lv-name lv-mono" onclick="event.stopPropagation();OpsBilling.open('${id}')">${esc(id)}</button></div>
            </div>
          </td>
          <td>${client}</td>
          <td>${prop}</td>
          <td class="lv-mono num" style="font-weight:700;color:${overdue ? 'var(--err)' : 'var(--ink)'};">${currencyMoney(inv.total_amount,inv.currency)}</td>
          <td class="lv-mono num" style="font-weight:700;color:${overdue ? 'var(--err)' : 'var(--ink)'};">${currencyMoney(inv.balance_due,inv.currency)}</td>
          <td class="lv-mono" style="${overdue ? 'color:var(--err);font-weight:700;' : ''}">${fmtDate(inv.due_date)}</td>
          <td>${OpsModal.status(eff,pm.l,null,'payment')}</td>
          <td>${esc(OpsModal.label(inv.status || 'Not supplied'))}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  }

  function exportCsv() {
    if (!_invoices.length) return OpsModal.toast('Nothing to export', 'watch');
    const head = ['invoice_id', 'client', 'property', 'currency', 'total_amount', 'balance_due', 'due_date', 'payment_status', 'status'];
    const esc2 = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const lines = [head.join(',')].concat(_invoices.map(i => [i.invoice_id, i.client_name || '', i.property_name || '', i.currency || '', i.total_amount ?? '', i.balance_due ?? '', i.due_date || '', i.payment_status || '', i.status || ''].map(esc2).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'flowguard-invoices.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function back() { if (_container) render(_container); }

  // ────────────────────────────────────────────────── DETAIL
  async function open(id) {
    if (!_container) return;
    _container.innerHTML = `<div style="padding:60px;text-align:center;color:var(--ink-3);">Loading invoice…</div>`;
    try {
      const res = await OpsModal.apiGet('/billing/invoices/' + id);
      renderDetail(OpsModal.readRecord(res,'Invoice'));
    } catch (err) {
      _container.innerHTML = OpsModal.recordFailure('Invoice',err,`OpsBilling.open('${OpsModal.sid(id)}')`,'OpsBilling.back()');
    }
  }

  function renderDetail(inv) {
    const NGN = n => currencyMoney(n,inv.currency);
    const F = OpsModal.fact, L = OpsModal.link;
    const id = inv.invoice_id;
    const eff = effStatus(inv), pm = payMeta(eff);
    const chipCls = pm.c;
    const parsedItems = Array.isArray(inv.line_items) ? inv.line_items : (() => { try { return JSON.parse(inv.line_items); } catch { return null; } })();
    const items = Array.isArray(parsedItems) ? parsedItems.filter(l=>l && typeof l === 'object') : null;
    const amounts = invoiceAmounts(inv);
    const {total, balance} = amounts;
    const q = inv.quote;
    const clientLink = inv.user_id ? L('clients', inv.user_id, inv.client_name || 'Client') : esc(inv.client_name ? inv.client_name+' · Account link not supplied' : Object.hasOwn(inv,'user_id') && inv.user_id===null ? 'Not linked' : 'Not supplied');
    const propLink = inv.property_id ? L('properties', inv.property_id, inv.property_name || inv.property_id) : dash(inv.property_name);

    const detailsBody = `<div class="fg-facts-grid">
      ${F('Invoice type', esc(OpsModal.label(inv.invoice_type || 'Not supplied')))}
      ${F('Estate', propLink)}
      ${F('Client', clientLink)}
      ${F('Subtotal', NGN(amounts.subtotal))}
      ${F('VAT rate', amounts.vatRate == null ? 'Not supplied' : amounts.vatRate + '%')}
      ${F('VAT amount', NGN(amounts.vat))}
      ${F('Total amount', NGN(total))}
      ${F('Balance due', `<b style="color:${balanceColour(balance)}">${NGN(balance)}</b>`)}
      ${F('Issue date', `<span class="lv-mono">${fmtDate(inv.issue_date)}</span>`)}
      ${F('Due date', `<span class="lv-mono">${fmtDate(inv.due_date)}</span>`)}
      ${F('Payment state', OpsModal.status(eff,pm.l,null,'payment'))}
      ${F('Invoice lifecycle', esc(OpsModal.label(inv.status || 'Not supplied')))}</div>
      ${gap('Payment state and invoice lifecycle are separate. Amounts shown are supplied invoice or ledger values; missing amounts are not inferred.')}`;

    const servicesBody = items && items.length
      ? `<table class="bl-tbl"><thead><tr><th scope="col">Description</th><th scope="col" class="num">Qty</th><th scope="col" class="num">Unit price</th><th scope="col" class="num">Amount</th></tr></thead>
         <tbody>${items.map(l => `<tr>
           <td class="strong">${esc(l.description || '—')}</td>
           <td class="num">${l.qty != null ? esc(l.qty) : '—'}</td>
           <td class="num">${l.unit_price != null ? NGN(l.unit_price) : '—'}</td>
           <td class="num">${NGN(l.amount)}</td></tr>`).join('')}</tbody></table>
         `
      : OpsModal.emptyState('', items ? 'No line items returned' : 'Line items unavailable', items ? 'The returned service breakdown is empty.' : 'No service breakdown was supplied with this invoice.');

    const contractBody = q
      ? `${F('Nearest quote', `<span class="lv-mono">${esc(q.quote_id || '—')}</span>`)}
         ${F('Selected packages', esc(Array.isArray(q.selected_packages) ? q.selected_packages.join(', ') : (q.selected_packages || '—')))}
         ${F('Monthly value', currencyMoney(q.total_monthly,q.currency))}
         ${F('Latest quote flag', q.is_latest===true ? 'Yes' : q.is_latest===false ? 'No' : 'Not supplied')}
         ${gap('This is a service quote, not proof of a signed contract.')}`
      : OpsModal.emptyState('', 'Quote unavailable', 'No linked service quote was supplied.');

    const payments = Array.isArray(inv.payments) ? inv.payments : null;
    const paidTotal = amounts.paid;
    const prettyMethod = m => OpsModal.label(m);
    const payChip = s => OpsModal.status(s || 'unknown',null,null,'ledger');
    const ledgerTbl = payments && payments.length
      ? `<table class="bl-tbl"><thead><tr><th scope="col">Date</th><th scope="col">Method</th><th scope="col">Reference</th><th scope="col" class="num">Amount</th><th scope="col">Status</th></tr></thead>
         <tbody>${payments.map(p => `<tr>
           <td>${OpsModal.fmtDateTime(p.payment_date || p.created_at)}</td>
           <td>${esc(prettyMethod(p.payment_method))}</td>
           <td class="lv-mono">${esc(p.transaction_reference || '—')}</td>
           <td class="num">${currencyMoney(p.amount,p.currency)}</td>
           <td>${payChip(p.status)}</td></tr>`).join('')}</tbody></table>`
      : OpsModal.emptyState('', payments ? 'No payments returned' : 'Payment history unavailable', payments ? 'The returned payment ledger is empty.' : 'Payment history was not supplied with this invoice.');

    const paymentsBody = `<div class="fg-facts-grid">
      ${F('Total amount', NGN(total))}
      ${F('Successful ledger payments', `<b style="color:${paidTotal == null ? 'var(--ink-3)' : 'var(--ok)'}">${NGN(paidTotal)}</b>`)}
      ${F('Invoice balance due', `<b style="color:${balanceColour(balance)}">${NGN(balance)}</b>`)}</div>
      <div style="margin-top:14px;">${ledgerTbl}</div>`;

    const sidebar = `
      <div class="fgd-card"><div class="fgd-card-head"><h2>Billing context</h2></div>
        ${F('Currency', esc(inv.currency || 'Not supplied'))}
        ${F('Reported open tickets', esc(inv.open_tickets == null ? 'Not supplied' : inv.open_tickets))}
      </div>
      <div class="fgd-card"><div class="fgd-card-head"><h2>Related</h2></div>
        ${F('Estate', propLink)}
        ${F('Client',clientLink)}
      </div>`;

    _container.innerHTML = OpsModal.detailShell({
      back: 'OpsBilling.back()',
      crumbRoot: 'Billing',
      title: esc(id),
      avatar: { text: OpsModal.entityIcon('billing') },
      chips: [{ cls: chipCls, label: esc(pm.l), dot: true }],
      decision:[['Settlement state',pm.l],['Due date',fmtDate(inv.due_date)],['Next step',inv.reconciliation_required?'Reconcile invoice totals with the payment ledger':balance==null?'Restore balance visibility':balance>0?'Review payment evidence before recording a receipt':'Review the recorded payment ledger']],
      meta: [['Estate', esc(inv.property_name || '—')], ['Client', inv.client_name ? esc(inv.client_name) : inv.user_id ? 'Linked client · name not supplied' : Object.hasOwn(inv,'user_id') && inv.user_id===null ? 'Not linked' : 'Not supplied'], ['Issued', fmtDate(inv.issue_date)], ['Due', fmtDate(inv.due_date)], ['Sent', inv.sent_at ? fmtDate(inv.sent_at) : Object.hasOwn(inv,'sent_at') && inv.sent_at===null ? 'Not sent' : 'Not supplied']],
      actions: `<button class="fg-action" onclick="OpsBilling.downloadPdf('${id}')">Download PDF</button>${canManage() ? `${paidTotal===0 && !inv.reconciliation_required ? `<button class="fg-action" onclick="OpsBilling.openEdit('${id}')">Edit</button>` : ''}${eff !== 'paid' && !inv.reconciliation_required && balance>0 ? `<button class="fg-action fg-action-primary" onclick="OpsBilling.recordPayment('${id}')">Record payment</button>` : ''}<button class="fg-action" onclick="OpsBilling.sendInvoiceEmail('${id}')">${inv.sent_at ? 'Retry email delivery' : 'Email invoice'}</button>` : ''}`,
      note: inv.reconciliation_required ? 'Recorded invoice payment totals do not match the ledger. Reconciliation is required; further payments and edits are blocked. Do not treat either value as verified settlement.' : 'Payments are manual ledger records, not independently verified bank settlement. Paid invoices are protected from rewriting.',
      sections: [
        { id: 'details', title: 'Invoice details', body: detailsBody },
        { id: 'services', title: 'Services', body: servicesBody },
        { id: 'contract', title: 'Service quote', body: contractBody },
        { id: 'payments', title: 'Payments', body: paymentsBody },
        { id: 'attachments', title: 'Supporting files', body: OpsModal.evidence(inv.attachments) },
      ],
      sidebar,
    });
  }

  // Generated server-side (pdfkit) so ₦ renders; fetched with auth then saved.
  async function downloadPdf(id) {
    try {
      const base = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE) ? CONFIG.API_BASE : '/api/v1';
      const token = sessionStorage.getItem('token') || localStorage.getItem('token') || '';
      OpsModal.toast('Preparing PDF…', 'watch');
      const res = await fetch(base + '/billing/invoices/' + id + '/pdf', { headers: { Authorization: 'Bearer ' + token } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('pdf')) throw new Error('unexpected response (' + (ct || 'no content-type') + ')');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = id + '.pdf';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    } catch (err) { OpsModal.toast('Failed to download PDF: ' + err.message, 'critical'); }
  }

  async function recordPayment(id) {
    if (!canManage()) return OpsModal.toast('You do not have permission to record payments', 'critical');
    let inv;
    try { inv = (await OpsModal.apiGet('/billing/invoices/' + id)).data; }
    catch (err) { return OpsModal.toast('Failed to load invoice: ' + err.message, 'critical'); }
    if (!/^[A-Z]{3}$/.test(String(inv.currency || '')) || inv.reconciliation_required) return OpsModal.toast('Invoice currency or ledger requires reconciliation before recording a payment','critical');
    const NGN = n => currencyMoney(n,inv.currency);
    const { total, balance: bal } = invoiceAmounts(inv);
    const today = new Date().toISOString().slice(0, 10);
    const body = `
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div style="font-size:var(--fs-sm);color:var(--ink-3);line-height:1.5;">Reported outstanding balance <b style="color:var(--ink);">${bal == null ? 'Not supplied' : NGN(bal)}</b>. Invoice total: ${total == null ? 'Not supplied' : NGN(total)}. Recording a payment writes to the payments ledger; confirm the amount against your payment evidence.</div>
        <label class="bl-field"><div class="bl-field-label">Amount (${esc(inv.currency)})</div><input class="bl-input" id="rp-amount" type="number" min="0" step="0.01" value="${bal || ''}"></label>
        <label class="bl-field"><div class="bl-field-label">Method</div>
          <select class="bl-input" id="rp-method">
            <option value="bank_transfer">Bank transfer</option>
            <option value="card">Card</option>
            <option value="cash">Cash</option>
            <option value="cheque">Cheque</option>
            <option value="pos">POS</option>
            <option value="other">Other</option>
          </select></label>
        <label class="bl-field"><div class="bl-field-label">Reference <span class="sub">optional</span></div><input class="bl-input" id="rp-ref" placeholder="Bank / transaction reference"></label>
        <label class="bl-field" style="margin-bottom:0;"><div class="bl-field-label">Payment date</div><input class="bl-input" id="rp-date" type="date" value="${today}"></label>
      </div>`;
    OpsModal.open('Record payment — ' + id, body, [
      { label: 'Cancel', class: 'btn-ghost', onclick: 'OpsModal.close()' },
      { label: 'Record payment', class: 'btn-primary', onclick: `OpsBilling._submitPayment('${id}')`, id: 'rp-submit' },
    ]);
  }

  async function _submitPayment(id) {
    if (!canManage()) return OpsModal.toast('You do not have permission to record payments', 'critical');
    const amount = Number((document.getElementById('rp-amount') || {}).value);
    if (!Number.isFinite(amount) || !(amount > 0)) return OpsModal.toast('Enter a positive finite amount', 'critical');
    const payload = {
      amount,
      payment_method: (document.getElementById('rp-method') || {}).value || 'bank_transfer',
      transaction_reference: (document.getElementById('rp-ref') || {}).value || '',
      payment_date: (document.getElementById('rp-date') || {}).value || undefined,
    };
    OpsModal.setLoading('rp-submit', true);
    try {
      await OpsModal.apiPost('/billing/invoices/' + id + '/payments', payload);
      OpsModal.close();
      OpsModal.toast('Payment recorded', 'nominal');
      open(id);
    } catch (err) { OpsModal.toast('Failed: ' + err.message, 'critical'); OpsModal.setLoading('rp-submit', false); }
  }

  // ────────────────────────────────────────────────── CREATE / EDIT
  async function ensureProps() {
    if (_props.length) return;
    try {
      const res = await OpsModal.apiGet('/properties/all');
      _props = OpsModal.readArray(res,'Estate directory').filter(p => p.asset_class === 'customer_property' || p.asset_class == null);
    } catch (error) { _props = []; throw error; }
  }

  async function openCreate() {
    if (!_container) return;
    if (!canManage()) return OpsModal.toast('You do not have permission to create invoices', 'critical');
    _editId = null;
    _draft = [{ description: '', qty: 1, unit_price: 0, amount: 0 }];
    _container.innerHTML = `<div style="padding:60px;text-align:center;color:var(--ink-3);">Loading…</div>`;
    try { await ensureProps(); renderForm(null); }
    catch (error) { _container.innerHTML = OpsModal.recordFailure('Create invoice',error,'OpsBilling.openCreate()','OpsBilling.back()'); }
  }

  async function openEdit(id) {
    if (!_container) return;
    if (!canManage()) return OpsModal.toast('You do not have permission to edit invoices', 'critical');
    _container.innerHTML = `<div style="padding:60px;text-align:center;color:var(--ink-3);">Loading…</div>`;
    let inv;
    try { await ensureProps(); inv = OpsModal.readRecord(await OpsModal.apiGet('/billing/invoices/' + id),'Invoice'); }
    catch (error) { _container.innerHTML = OpsModal.recordFailure('Edit invoice',error,`OpsBilling.openEdit('${OpsModal.sid(id)}')`,'OpsBilling.back()'); return; }
    if (invoiceAmounts(inv).paid!==0 || inv.reconciliation_required || ['paid','partial'].includes(String(inv.payment_status).toLowerCase())) {
      _container.innerHTML=OpsModal.recordFailure('Edit invoice',new Error('Charge editing requires a confirmed zero-payment ledger and no reconciliation issues. Review the invoice and payment history first.'),`OpsBilling.openEdit('${OpsModal.sid(id)}')`,'OpsBilling.back()');return;
    }
    _editId = id;
    const items = Array.isArray(inv.line_items) ? inv.line_items : (() => { try { return JSON.parse(inv.line_items); } catch { return null; } })();
    if(!Array.isArray(items) || items.some(l=>!l || typeof l!=='object' || Array.isArray(l))) {
      _container.innerHTML=OpsModal.recordFailure('Edit invoice',new Error('The service breakdown was not supplied as a valid list. Restore it before editing charges.'),`OpsBilling.openEdit('${OpsModal.sid(id)}')`,'OpsBilling.back()');return;
    }
    _draft = items.map(l => ({ description: l.description || '', qty: suppliedAmount(l.qty), unit_price: suppliedAmount(l.unit_price), amount: suppliedAmount(l.amount) }));
    renderForm(inv);
  }

  function renderForm(inv) {
    const isEdit = !!inv;
    _draftCurrency = isEdit ? inv.currency : 'NGN';
    const today = isEdit ? String(inv.issue_date || '').slice(0,10) : new Date().toISOString().slice(0, 10);
    const due = isEdit ? String(inv.due_date || '').slice(0,10) : new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const selType = inv ? inv.invoice_type : 'maintenance';
    const selStatus = inv ? String(inv.status || '') : 'open';
    const vat = isEdit ? suppliedAmount(inv.vat_rate) ?? '' : DEFAULT_VAT;
    const pid = inv ? inv.property_id : '';
    const o = (v, l, sel) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(l)}</option>`;

    _container.innerHTML = `
      <div class="fgd-crumb"><button type="button" class="lnk" onclick="OpsBilling.back()">Billing</button><span class="sep">/</span><span class="cur">${isEdit ? esc(inv.invoice_id) : 'Create invoice'}</span></div>
      ${OpsModal.pageHeader({title:isEdit?'Edit invoice':'Create invoice',subtitle:isEdit?inv.invoice_id:'Invoice ID will be assigned on save',actions:`<div class="bl-head-actions">
          <button class="fg-action fg-action-neutral" onclick="OpsBilling.back()">Cancel</button>
          ${isEdit ? '' : `<button class="fg-action" id="bl-draft-btn" onclick="OpsBilling.confirmSave(false)">Save without sending</button>`}
          <button class="primary fg-action fg-action-primary" id="bl-create-btn" onclick="OpsBilling.confirmSave(${isEdit ? 'false' : 'true'})">${isEdit ? 'Save invoice' : 'Create and send invoice'}</button>
        </div>`})}
      <div class="bl-grid2">
        <div style="display:flex;flex-direction:column;gap:16px;">
          <div class="fgd-card">
            <div class="fgd-card-head"><h2>Invoice details</h2><span class="cmeta">${esc(_draftCurrency || 'Currency not supplied')}</span></div>
            <div class="bl-field">
              <label class="bl-field-label" for="bl-c-property">Estate <span class="sub">required · determines client</span></label>
              <select class="bl-input" id="bl-c-property" onchange="OpsBilling.onProp()">
                <option value="">Select an estate</option>
                ${_props.map(p => o(p.property_id, p.property_name || p.property_id, pid)).join('')}
              </select>
            </div>
            <div class="bl-field">
              <div class="bl-field-label">Client <span class="sub">derived, read-only</span></div>
              <div class="bl-derived warn" id="bl-c-client">Select an estate first</div>
            </div>
            <div class="bl-field">
              <label class="bl-field-label" for="bl-c-type">Invoice type</label>
              <select class="bl-input" id="bl-c-type">
                ${!selType ? o('','Select invoice type · not supplied','') : !['maintenance','installation','subscription','one_time'].includes(selType) ? o(selType,OpsModal.label(selType),selType) : ''}
                ${['maintenance', 'installation', 'subscription', 'one_time'].map(t => o(t, OpsModal.label(t), selType)).join('')}
              </select>
            </div>
            <div style="display:flex;gap:12px;">
              <div class="bl-field" style="flex:1;min-width:0;"><label class="bl-field-label" for="bl-c-issue">Issue date</label><input class="bl-input" type="date" id="bl-c-issue" value="${today}"></div>
              <div class="bl-field" style="flex:1;min-width:0;"><label class="bl-field-label" for="bl-c-due">Due date</label><input class="bl-input" type="date" id="bl-c-due" value="${due}"></div>
            </div>
            <div class="bl-omit">Record payment method and transaction evidence separately in the payment ledger.</div>
          </div>

          <div class="fgd-card">
            <div class="fgd-card-head"><h2>Services</h2><span class="cmeta">Itemised service charges</span></div>
            <div class="bl-li-head"><span>Description</span><span>Qty</span><span>Unit price</span><span style="text-align:right;">Amount</span><span></span></div>
            <div id="bl-items"></div>
            <button class="bl-addrow fg-action" onclick="OpsBilling.addItem()">${OpsModal.actionIcon('create')}Add line item</button>
            <div class="bl-field" style="max-width:220px;margin-top:14px;margin-bottom:0;">
              <label class="bl-field-label" for="bl-c-vat">VAT rate (%) <span class="sub">${isEdit ? 'confirm the supplied rate' : 'draft default 7.5 · review before saving'}</span></label>
              <input class="bl-input" type="number" min="0" step="0.1" id="bl-c-vat" value="${vat}" oninput="OpsBilling.recalc()">
            </div>
            <div class="bl-totals" id="bl-totals"></div>
          </div>

          <div class="fgd-card">
            <div class="fgd-card-head"><h2>Status</h2><span class="cmeta">Invoice and payment state</span></div>
            <div style="display:flex;gap:12px;">
              <div class="bl-field" style="flex:1;min-width:0;"><label class="bl-field-label" for="bl-c-status">Invoice state</label>
                <select class="bl-input" id="bl-c-status" ${isEdit?'disabled':''}>${isEdit ? o(selStatus,selStatus?OpsModal.label(selStatus):'Not supplied',selStatus) : ['open', 'closed'].map(s => o(s, OpsModal.label(s), selStatus)).join('')}</select></div>
              <div class="bl-field" style="flex:1;min-width:0;"><label class="bl-field-label" for="bl-c-pstatus">Payment handling</label>
                <select class="bl-input" id="bl-c-pstatus" ${isEdit?'disabled':''}>${isEdit ? o(inv.payment_status || '',inv.payment_status ? OpsModal.label(inv.payment_status) : 'Not supplied',inv.payment_status || '') : o('unpaid','Unpaid · payments recorded separately','unpaid')}</select></div>
            </div>
            <div class="bl-field" style="margin-bottom:0;"><label class="bl-field-label" for="bl-c-balance">Draft amount due <span class="sub">before ledger reconciliation</span></label><input class="bl-input" id="bl-c-balance" disabled></div>
            ${gap('Invoice lifecycle and payment settlement are separate. Charge editing requires a confirmed zero-payment ledger. Sending and ledger payments have their own actions; this form does not reconcile payments and its draft is not payment evidence.')}
          </div>

          <div class="bl-savebar">
            <button class="fg-action fg-action-neutral" onclick="OpsBilling.back()">Cancel</button>
            ${isEdit ? '' : `<button class="fg-action" onclick="OpsBilling.confirmSave(false)">Save without sending</button>`}
            <button class="primary fg-action fg-action-primary" onclick="OpsBilling.confirmSave(${isEdit ? 'false' : 'true'})">${isEdit ? 'Save invoice' : 'Create and send invoice'}</button>
          </div>
        </div>

        <div class="bl-side">
          <div class="fgd-card"><div class="fgd-card-head"><h2>Preview</h2></div><div id="bl-preview"></div></div>
        </div>
      </div>`;
    onProp();
    renderItems();
  }

  function onProp() {
    const pid = document.getElementById('bl-c-property').value;
    const p = _props.find(x => x.property_id === pid);
    const el = document.getElementById('bl-c-client');
    if (!p) { el.className = 'bl-derived warn'; el.textContent = 'Select an estate first'; }
    else if (p.client_name || p.user_id) { el.className = 'bl-derived'; el.textContent = p.client_name || 'Linked client'; }
    else { el.className = 'bl-derived warn'; el.textContent = Object.hasOwn(p,'user_id') && p.user_id===null ? 'No client linked to this estate' : 'Client link not supplied'; }
    recalc();
  }

  function renderItems() {
    const el = document.getElementById('bl-items');
    if (!el) return;
    el.innerHTML = _draft.map((l, i) => `<div class="bl-li">
      <input class="bl-input" aria-label="Line ${i+1} description" placeholder="Description" value="${esc(l.description || '')}" oninput="OpsBilling.editItem(${i},'description',this.value)">
      <input class="bl-input" aria-label="Line ${i+1} quantity" type="number" min="0" placeholder="Not supplied" value="${l.qty ?? ''}" oninput="OpsBilling.editItem(${i},'qty',this.value)">
      <input class="bl-input" aria-label="Line ${i+1} unit price" type="number" min="0" placeholder="Not supplied" value="${l.unit_price ?? ''}" oninput="OpsBilling.editItem(${i},'unit_price',this.value)">
      <span class="amt">${NGN(l.amount)}</span>
      <button type="button" class="bl-li-rm" onclick="OpsBilling.removeItem(${i})" aria-label="Remove line ${i+1}">×</button>
    </div>`).join('');
    recalc();
  }
  function addItem() { _draft.push({ description: '', qty: 1, unit_price: 0, amount: 0 }); renderItems(); }
  function removeItem(i) { _draft.splice(i, 1); if (!_draft.length) _draft.push({ description: '', qty: 1, unit_price: 0, amount: 0 }); renderItems(); }
  function editItem(i, k, v) {
    if (!_draft[i]) return;
    _draft[i][k] = (k === 'description') ? v : suppliedAmount(v);
    if(k!=='description')_draft[i].amount = _draft[i].qty===null || _draft[i].unit_price===null ? null : _draft[i].qty * _draft[i].unit_price;
    // update just the amount + totals without wiping focus
    const row = document.querySelectorAll('#bl-items .bl-li')[i];
    if (row) row.querySelector('.amt').textContent = NGN(_draft[i].amount);
    recalc();
  }

  function vatRateInput() { const rate=suppliedAmount((document.getElementById('bl-c-vat') || {}).value);return rate !== null && rate>=0 && rate<=100 ? rate : null; }

  function recalc() {
    const subtotal = _draft.some(l=>suppliedAmount(l.amount)===null) ? null : _draft.reduce((s,l)=>s+Number(l.amount),0);
    const vatRate = vatRateInput();
    const vat = vatRate === null || subtotal === null ? null : Math.round(subtotal * vatRate) / 100;
    const total = vat === null ? null : subtotal + vat;
    const tot = document.getElementById('bl-totals');
    if (tot) tot.innerHTML = `<div class="bl-totrow"><span>Subtotal</span><span>${NGN(subtotal)}</span></div><div class="bl-totrow"><span>${vatRate===null?'VAT rate not supplied':`VAT (${vatRate}%)`}</span><span>${NGN(vat)}</span></div><div class="bl-totrow grand"><span>Total</span><span>${NGN(total)}</span></div>`;
    const ps = (document.getElementById('bl-c-pstatus') || {}).value || 'unpaid';
    const balance = ps === 'paid' ? 0 : total;
    const bd = document.getElementById('bl-c-balance'); if (bd) bd.value = NGN(balance);
    const prop = _props.find(x => x.property_id === (document.getElementById('bl-c-property') || {}).value);
    const prev = document.getElementById('bl-preview');
    const F = OpsModal.fact;
    if (prev) prev.innerHTML = `
      ${F('Invoice ID', _editId ? esc(_editId) : 'Auto on save')}
      ${F('Estate', prop ? esc(prop.property_name || prop.property_id) : '—')}
      ${F('Client', prop && prop.client_name ? esc(prop.client_name) : 'Not supplied')}
      ${F('Subtotal', NGN(subtotal))}
      ${F(vatRate===null?'VAT rate not supplied':`VAT (${vatRate}%)`, NGN(vat))}
      ${F('Total', NGN(total))}
      ${F('Draft amount due', NGN(balance))}`;
  }

  async function confirmSave(send) {
    if (_savingInvoice) return;
    if (!canManage()) return OpsModal.toast('You do not have permission to change invoices', 'critical');
    const pid = (document.getElementById('bl-c-property') || {}).value;
    if (!pid) return OpsModal.toast('Select an estate first', 'critical');
    const invoiceType=(document.getElementById('bl-c-type') || {}).value;
    if (!invoiceType) return OpsModal.toast('Select an invoice type before saving; no type was supplied', 'watch');
    if (vatRateInput() === null) return OpsModal.toast('Enter a valid VAT rate from 0 to 100 before saving', 'watch');
    if(_draft.some(l=>[l.qty,l.unit_price,l.amount].some(v=>suppliedAmount(v)===null || Number(v)<0)))return OpsModal.toast('Confirm each line quantity, unit price and amount before saving', 'watch');
    const items = _draft.filter(l => l.description || l.amount).map(l => ({ description: l.description, qty: Number(l.qty), unit_price: Number(l.unit_price), amount: Number(l.amount) }));
    if (!items.length) return OpsModal.toast('Add at least one line item', 'critical');
    const subtotal = items.reduce((s, l) => s + l.amount, 0);
    const payload = {
      property_id: pid,
      invoice_type: invoiceType,
      issue_date: (document.getElementById('bl-c-issue') || {}).value || null,
      due_date: (document.getElementById('bl-c-due') || {}).value || null,
      line_items: items, subtotal, vat_rate: vatRateInput(),
      ...(_editId ? {} : {status:(document.getElementById('bl-c-status') || {}).value || 'open'}),
      ...(_editId ? {} : {payment_status:'unpaid'}),
    };
    const btnId = (send && !_editId) ? 'bl-create-btn' : (_editId ? 'bl-create-btn' : 'bl-draft-btn');
    _savingInvoice = true;
    OpsModal.setLoading('bl-create-btn', true);
    OpsModal.setLoading('bl-draft-btn', true);
    try {
      const res = _editId
        ? await OpsModal.apiPut('/billing/invoices/' + _editId, payload)
        : await OpsModal.apiPost('/billing/invoices', payload);
      const newId = (res.data && res.data.invoice_id) || _editId;
      if (send && !_editId && newId) {
        try {
          const s = await OpsModal.apiPost('/billing/invoices/' + newId + '/send', {});
          const em = s.data && s.data.emailed;
          OpsModal.toast(em ? ('Invoice created & emailed to ' + s.data.to) : 'Created — email not delivered (check mail config)', em ? 'nominal' : 'watch');
        } catch (e) {
          OpsModal.toast('Invoice created, but sending failed: ' + e.message, 'watch');
        }
      } else {
        OpsModal.toast(_editId ? 'Invoice updated' : 'Invoice saved without sending', 'nominal');
      }
      if (newId) open(newId); else back();
    } catch (err) {
      OpsModal.toast('Failed to save invoice: ' + err.message, 'critical');
    } finally {
      _savingInvoice = false;
      OpsModal.setLoading('bl-create-btn', false);
      OpsModal.setLoading('bl-draft-btn', false);
    }
  }

  // Email the invoice (PDF + pay CTA) to the client from the detail view.
  function sendInvoiceEmail(id) {
    if (!canManage()) return OpsModal.toast('You do not have permission to send invoices', 'critical');
    OpsModal.confirm('Email this invoice to the client? They\'ll get the PDF attached and a link to log in and pay.', async function () {
      if (!canManage()) return OpsModal.toast('You do not have permission to send invoices', 'critical');
      OpsModal.setLoading('modal-confirm-btn', true);
      try {
        const res = await OpsModal.apiPost('/billing/invoices/' + id + '/send', {});
        OpsModal.close();
        const d = res.data || {};
        OpsModal.toast(d.emailed ? ('Invoice emailed to ' + d.to) : 'Marked as sent — email not delivered (check mail config)', d.emailed ? 'nominal' : 'watch');
        open(id);
      } catch (err) {
        OpsModal.setLoading('modal-confirm-btn', false);
        OpsModal.toast('Failed to send: ' + err.message, 'critical');
      }
    }, {tone:'neutral',title:'Email invoice',confirmLabel:'Email invoice',detail:'This requests delivery to the recorded client address. No payment or settlement is recorded.'});
  }

  return {
    render, setFilter, search, open, back, exportCsv,
    openCreate, openEdit, onProp, addItem, removeItem, editItem, recalc, confirmSave, recordPayment, _submitPayment, downloadPdf, sendInvoiceEmail,
  };
})();
