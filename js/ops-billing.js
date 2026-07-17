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
  let _props = [], _draft = [], _editId = null;
  const DEFAULT_VAT = 7.5;

  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dash = v => (v == null || v === '') ? '—' : v;
  const NGN = n => '₦' + Number(n || 0).toLocaleString();
  const money = n => { n = Number(n || 0); if (n >= 1e6) return '₦' + (n / 1e6).toFixed(2) + 'M'; if (n >= 1e3) return '₦' + Math.round(n / 1e3) + 'K'; return '₦' + n.toLocaleString(); };
  const fmtDate = ds => ds ? new Date(ds).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const inThisMonth = ds => { if (!ds) return false; const d = new Date(ds), n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); };

  // Gate write actions on the billing.manage permission (server also enforces).
  const canManage = () => (typeof Auth !== 'undefined' && Auth.can) ? Auth.can('billing.manage') : true;

  function payMeta(ps) {
    ps = String(ps || '').toLowerCase();
    return ({ paid: { c: 'paid', l: 'Paid' }, overdue: { c: 'overdue', l: 'Overdue' }, pending: { c: 'pending', l: 'Pending' }, partial: { c: 'partial', l: 'Partially paid' }, unpaid: { c: 'pending', l: 'Pending' } })[ps]
      || { c: 'pending', l: ps ? ps[0].toUpperCase() + ps.slice(1) : 'Pending' };
  }
  // A pending/partial invoice past its due date reads as "overdue" for the operator.
  function effStatus(inv) {
    const ps = String(inv.payment_status || 'pending').toLowerCase();
    if (ps !== 'paid' && (inv.days_overdue > 0 || (inv.due_date && new Date(inv.due_date) < new Date() && ps !== 'paid'))) return 'overdue';
    return ps;
  }

  const BL_CSS = `<style id="bl-css">
    .bl-head { display:flex; align-items:center; gap:16px; margin-bottom:16px; flex-wrap:wrap; }
    .bl-head h1 { font-family:var(--ff-d); font-size:var(--fs-xl); font-weight:700; color:var(--ink); }
    .bl-head .sub { font-size:var(--fs-sm); color:var(--ink-3); margin-top:2px; }
    .bl-head-actions { margin-left:auto; display:flex; gap:8px; }
    .bl-btn { font-size:var(--fs-sm); font-weight:600; padding:9px 16px; border-radius:10px; cursor:pointer; border:1px solid var(--border-2); background:var(--surface); color:var(--ink-2); }
    .bl-btn:hover { border-color:var(--blue-dim); color:var(--blue-hi); }
    .bl-btn.primary { background:linear-gradient(135deg,#16a8d3,#0d7fa0); color:#fff; border:none; }
    .bl-btn.primary:hover { filter:brightness(1.05); color:#fff; }

    .bl-story { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:16px; }
    @media (max-width:900px){ .bl-story{ grid-template-columns:repeat(2,1fr); } }
    .bl-story-card { background:var(--surface); border:1px solid var(--border); border-radius:14px; box-shadow:var(--sh-xs); padding:16px 18px; }
    .bl-story-label { font-size:var(--fs-xs); color:var(--ink-2); font-weight:600; margin-bottom:8px; }
    .bl-story-value { font-size:22px; font-weight:800; font-family:var(--ff-d); color:var(--ink); letter-spacing:-.02em; }
    .bl-story-value.danger{ color:var(--err); } .bl-story-value.green{ color:var(--ok); } .bl-story-value.amber{ color:var(--warn); }
    .bl-story-sub { font-size:var(--fs-2xs); color:var(--ink-3); margin-top:4px; }

    .bl-status { display:inline-flex; align-items:center; gap:5px; font-size:var(--fs-2xs); font-weight:700; padding:3px 10px; border-radius:20px; }
    .bl-status.paid{ background:rgba(31,157,91,.12); color:var(--ok); }
    .bl-status.overdue{ background:rgba(217,70,60,.12); color:var(--err); }
    .bl-status.pending{ background:rgba(224,142,18,.12); color:var(--warn); }
    .bl-status.partial{ background:rgba(28,184,232,.14); color:var(--blue-hi,#0d7fa0); }
    .bl-raw { display:block; font-size:var(--fs-2xs); color:var(--ink-4); font-family:var(--ff-mono,monospace); margin-top:3px; }
    .bl-flag { color:var(--warn); font-weight:700; cursor:help; }

    .bl-gap { display:flex; gap:8px; align-items:flex-start; font-size:var(--fs-xs); color:var(--ink-3); background:var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:10px 12px; line-height:1.5; margin-top:12px; }
    .bl-gap svg{ width:14px; height:14px; flex-shrink:0; margin-top:1px; color:var(--warn); }
    .bl-gap .mono{ font-family:var(--ff-mono,monospace); color:var(--ink-2); }

    .bl-tbl { width:100%; border-collapse:collapse; font-size:var(--fs-sm); }
    .bl-tbl th { text-align:left; font-size:var(--fs-2xs); text-transform:uppercase; letter-spacing:.4px; color:var(--ink-3); font-weight:700; padding:0 8px 10px; border-bottom:1px solid var(--border); }
    .bl-tbl td { padding:11px 8px; border-bottom:1px solid var(--border); color:var(--ink-2); }
    .bl-tbl tr:last-child td { border-bottom:none; }
    .bl-tbl td.strong{ color:var(--ink); font-weight:600; }
    .bl-tbl td.num, .bl-tbl th.num{ text-align:right; font-family:var(--ff-mono,monospace); }

    /* create form */
    .bl-grid2 { display:grid; grid-template-columns:1fr 300px; gap:16px; align-items:start; }
    @media (max-width:900px){ .bl-grid2{ grid-template-columns:1fr; } }
    .bl-side { display:flex; flex-direction:column; gap:14px; position:sticky; top:70px; }
    .bl-field { margin-bottom:14px; }
    .bl-field:last-child { margin-bottom:0; }
    .bl-field-label { font-size:var(--fs-sm); font-weight:600; color:var(--ink); margin-bottom:5px; display:flex; gap:8px; align-items:baseline; }
    .bl-field-label .sub{ font-size:var(--fs-2xs); color:var(--ink-3); font-weight:500; }
    .bl-input { width:100%; box-sizing:border-box; padding:9px 11px; border:1px solid var(--border); border-radius:9px; font-family:var(--ff-b); font-size:var(--fs-sm); color:var(--ink); background:var(--surface); }
    .bl-input:focus{ outline:none; border-color:var(--blue-dim); }
    .bl-derived { padding:9px 11px; border:1px dashed var(--border-2); border-radius:9px; font-size:var(--fs-sm); color:var(--ink-2); background:var(--surface-2); }
    .bl-derived.warn{ color:var(--warn); border-color:var(--warn); background:rgba(224,142,18,.06); }
    .bl-omit { font-size:var(--fs-xs); color:var(--ink-3); background:var(--surface-2); border:1px solid var(--border); border-radius:9px; padding:9px 11px; margin-top:6px; line-height:1.5; }
    .bl-omit .mono{ font-family:var(--ff-mono,monospace); }
    .bl-li-head, .bl-li { display:grid; grid-template-columns:1fr 56px 116px 104px 26px; gap:8px; align-items:center; }
    .bl-li-head { font-size:var(--fs-2xs); text-transform:uppercase; letter-spacing:.4px; color:var(--ink-3); font-weight:700; margin-bottom:8px; }
    .bl-li { margin-bottom:8px; }
    .bl-li .amt{ font-family:var(--ff-mono,monospace); font-weight:700; color:var(--ink); text-align:right; font-size:var(--fs-sm); }
    .bl-li-rm{ cursor:pointer; color:var(--ink-4); font-size:18px; text-align:center; line-height:1; }
    .bl-li-rm:hover{ color:var(--err); }
    .bl-addrow{ font-size:var(--fs-sm); font-weight:600; color:var(--blue-hi,#0d7fa0); background:var(--neon-trace,rgba(28,184,232,.08)); border:1px dashed var(--blue-dim,#7fc8e0); border-radius:9px; padding:8px 12px; cursor:pointer; width:100%; margin-top:4px; }
    .bl-totals{ margin-top:14px; border-top:1px solid var(--border); padding-top:12px; }
    .bl-totrow{ display:flex; justify-content:space-between; font-size:var(--fs-sm); color:var(--ink-2); padding:4px 0; }
    .bl-totrow.grand{ font-weight:800; color:var(--ink); font-size:var(--fs-md); border-top:1px solid var(--border); margin-top:6px; padding-top:10px; }
    .bl-savebar{ display:flex; justify-content:flex-end; gap:8px; margin-top:16px; flex-wrap:wrap; }
  </style>`;

  const IWARN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  const gap = html => `<div class="bl-gap">${IWARN}<span>${html}</span></div>`;

  // ────────────────────────────────────────────────── LIST
  function render(container) {
    _container = container;
    container.innerHTML = BL_CSS + `
      <div class="bl-head">
        <div>
          <h1>Billing</h1>
          <div class="sub" id="bl-count">Loading invoices…</div>
        </div>
        <div class="bl-head-actions">
          <button class="bl-btn" onclick="OpsBilling.exportCsv()">Export</button>
          ${canManage() ? `<button class="bl-btn primary" onclick="OpsBilling.openCreate()">+ New invoice</button>` : ''}
        </div>
      </div>
      <div id="bl-story" class="bl-story"></div>
      <div class="lv-wrap">
        <div class="lv-toolbar">
          <div class="lv-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input id="bl-search" placeholder="Search invoices…" oninput="OpsBilling.search(this.value)">
          </div>
          <div class="lv-filters">
            <div class="lv-filter active" id="blf-all"     onclick="OpsBilling.setFilter('all')">All</div>
            <div class="lv-filter"        id="blf-paid"    onclick="OpsBilling.setFilter('paid')">Paid</div>
            <div class="lv-filter"        id="blf-pending" onclick="OpsBilling.setFilter('pending')">Pending</div>
            <div class="lv-filter"        id="blf-overdue" onclick="OpsBilling.setFilter('overdue')">Overdue</div>
            <div class="lv-filter"        id="blf-partial" onclick="OpsBilling.setFilter('partial')">Partially paid</div>
          </div>
        </div>
        <div id="bl-table-body"><div style="padding:48px;text-align:center;color:var(--ink-3);">Loading invoices…</div></div>
      </div>`;
    loadAll();
  }

  async function loadAll() {
    try {
      const res = await OpsModal.apiGet('/billing/invoices');
      _invoices = res.data || res.invoices || [];
      const c = document.getElementById('bl-count'); if (c) c.textContent = `${_invoices.length} invoice${_invoices.length === 1 ? '' : 's'}`;
      renderStory();
      applyFilter();
    } catch (err) {
      const el = document.getElementById('bl-table-body');
      if (el) el.innerHTML = `<div style="padding:48px;text-align:center;"><div style="color:var(--err);font-weight:700;margin-bottom:8px;">Failed to load billing data</div><div style="color:var(--ink-3);font-size:var(--fs-sm);">${esc(err.message)}</div></div>`;
    }
  }

  function renderStory() {
    const unpaid = _invoices.filter(i => String(i.payment_status).toLowerCase() !== 'paid');
    const outstanding = unpaid.reduce((s, i) => s + (Number(i.balance_due) || 0), 0);
    const overdue = _invoices.filter(i => effStatus(i) === 'overdue');
    const overdueAmt = overdue.reduce((s, i) => s + (Number(i.balance_due) || Number(i.total_amount) || 0), 0);
    const paidMonth = _invoices.filter(i => String(i.payment_status).toLowerCase() === 'paid' && inThisMonth(i.paid_date));
    const paidMonthAmt = paidMonth.reduce((s, i) => s + (Number(i.total_amount) || 0), 0);
    const unlinked = _invoices.filter(i => !i.user_id && !i.client_name);
    const cards = [
      { label: 'Outstanding balance', value: money(outstanding), cls: '', sub: `Across ${unpaid.length} unpaid invoice${unpaid.length === 1 ? '' : 's'}` },
      { label: 'Overdue', value: money(overdueAmt), cls: 'danger', sub: `${overdue.length} invoice${overdue.length === 1 ? '' : 's'} past due date` },
      { label: 'Paid this month', value: money(paidMonthAmt), cls: 'green', sub: `${paidMonth.length} invoice${paidMonth.length === 1 ? '' : 's'} settled` },
      { label: 'Unlinked to a client', value: unlinked.length, cls: 'amber', sub: 'Invoices with no client resolved' },
    ];
    const el = document.getElementById('bl-story');
    if (el) el.innerHTML = cards.map(c => `<div class="bl-story-card"><div class="bl-story-label">${c.label}</div><div class="bl-story-value ${c.cls}">${c.value}</div><div class="bl-story-sub">${c.sub}</div></div>`).join('');
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
    if (!rows.length) { el.innerHTML = `<div style="padding:48px;text-align:center;color:var(--ink-3);"><div style="font-size:var(--fs-md);font-weight:600;color:var(--ink-2);">No invoices found</div></div>`; return; }
    const L = OpsModal.link;
    el.innerHTML = `<div class="lv-scroll"><table class="lv-table">
      <thead><tr>
        <th>Invoice</th>
        <th>Client <span class="bl-flag" title="Invoices have no client_id — resolved via the property's client / invoice.user_id">⚠</span></th>
        <th>Property</th>
        <th>Amount</th>
        <th>Due date</th>
        <th>Status</th>
        <th>Payment method <span class="bl-flag" title="No payment_method column exists on invoices">⚠</span></th>
      </tr></thead>
      <tbody>${rows.map(inv => {
        const id = inv.invoice_id;
        const eff = effStatus(inv), pm = payMeta(eff);
        const overdue = eff === 'overdue';
        const client = inv.user_id ? L('clients', inv.user_id, inv.client_name || 'Client') : '<span style="color:var(--ink-4);">Unlinked</span>';
        const prop = inv.property_id ? L('properties', inv.property_id, inv.property_name || inv.property_id) : dash(inv.property_name);
        return `<tr class="clickable" onclick="OpsBilling.open('${id}')" tabindex="0" onkeydown="if(event.key==='Enter'){OpsBilling.open('${id}')}">
          <td class="lv-mono" style="color:var(--ink);font-weight:700;">${esc(id)}</td>
          <td>${client}</td>
          <td>${prop}</td>
          <td class="lv-mono" style="font-weight:700;color:${overdue ? 'var(--err)' : 'var(--ink)'};">${NGN(inv.total_amount)}</td>
          <td class="lv-mono" style="${overdue ? 'color:var(--err);font-weight:700;' : ''}">${fmtDate(inv.due_date)}</td>
          <td><span class="bl-status ${pm.c}">${pm.l}</span><span class="bl-raw">status: ${esc(inv.status || '—')}</span></td>
          <td class="lv-dash">—</td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  }

  function exportCsv() {
    if (!_invoices.length) return OpsModal.toast('Nothing to export', 'watch');
    const head = ['invoice_id', 'client', 'property', 'total_amount', 'balance_due', 'due_date', 'payment_status', 'status'];
    const esc2 = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const lines = [head.join(',')].concat(_invoices.map(i => [i.invoice_id, i.client_name || '', i.property_name || '', i.total_amount || 0, i.balance_due || 0, i.due_date || '', i.payment_status || '', i.status || ''].map(esc2).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'flowguard-invoices.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function back() { if (_container) render(_container); }

  // ────────────────────────────────────────────────── DETAIL
  async function open(id) {
    if (!_container) return;
    _container.innerHTML = BL_CSS + `<div style="padding:60px;text-align:center;color:var(--ink-3);">Loading invoice…</div>`;
    try {
      const res = await OpsModal.apiGet('/billing/invoices/' + id);
      renderDetail(res.data || {});
    } catch (err) {
      _container.innerHTML = BL_CSS + `<div style="padding:48px;text-align:center;"><div style="color:var(--err);font-weight:700;margin-bottom:8px;">Failed to load invoice</div><button class="bl-btn" onclick="OpsBilling.back()">← Back to Billing</button></div>`;
    }
  }

  function renderDetail(inv) {
    const F = OpsModal.fact, L = OpsModal.link;
    const id = inv.invoice_id;
    const eff = effStatus(inv), pm = payMeta(eff);
    const chipCls = { paid: 'ok', overdue: 'danger', pending: 'warn', partial: 'warn' }[pm.c] || 'neutral';
    const items = Array.isArray(inv.line_items) ? inv.line_items : (() => { try { return JSON.parse(inv.line_items || '[]'); } catch { return []; } })();
    const total = Number(inv.total_amount) || 0;
    const balance = inv.balance_due != null ? Number(inv.balance_due) : total;
    const paidSoFar = Math.max(0, total - balance);
    const q = inv.quote;
    const clientLink = inv.user_id ? L('clients', inv.user_id, inv.client_name || 'Client') : '<span style="color:var(--warn);">Not linked to a clients row</span>';
    const propLink = inv.property_id ? L('properties', inv.property_id, inv.property_name || inv.property_id) : dash(inv.property_name);

    const detailsBody = `
      ${F('Invoice ID', `<span class="lv-mono">${esc(id)}</span>`)}
      ${F('Invoice type', `<span class="lv-mono">${esc(inv.invoice_type || '—')}</span>`)}
      ${F('Property', propLink)}
      ${F('Client', clientLink)}
      ${F('Subtotal', NGN(inv.subtotal != null ? inv.subtotal : total))}
      ${F('VAT rate', (inv.vat_rate != null ? inv.vat_rate : 7.5) + '%')}
      ${F('VAT amount', NGN(inv.vat_amount || 0))}
      ${F('Total amount', NGN(total))}
      ${F('Balance due', `<b style="color:${balance > 0 ? 'var(--err)' : 'var(--ok)'}">${NGN(balance)}</b>`)}
      ${F('Issue date', `<span class="lv-mono">${fmtDate(inv.issue_date || inv.created_at)}</span>`)}
      ${F('Due date', `<span class="lv-mono">${fmtDate(inv.due_date)}</span>`)}
      ${F('payment_status', `<span class="lv-mono">${esc(inv.payment_status || '—')}</span>`)}
      ${F('status', `<span class="lv-mono">${esc(inv.status || '—')}</span>`)}
      ${gap('Both <span class="mono">status</span> and <span class="mono">payment_status</span> are shown raw because nothing documents how they differ. The chip above uses <span class="mono">payment_status</span>.')}`;

    const servicesBody = items.length
      ? `<table class="bl-tbl"><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead>
         <tbody>${items.map(l => `<tr>
           <td class="strong">${esc(l.description || '—')}</td>
           <td class="num">${l.qty != null ? esc(l.qty) : '—'}</td>
           <td class="num">${l.unit_price != null ? NGN(l.unit_price) : '—'}</td>
           <td class="num">${NGN(l.amount)}</td></tr>`).join('')}</tbody></table>
         ${gap('Parsed from the <span class="mono">invoices.line_items</span> jsonb blob — no normalized line-items table, so shape isn\'t guaranteed.')}`
      : OpsModal.emptyState('', 'No line items', 'This invoice has an empty <span class="mono">line_items</span> array.');

    const contractBody = q
      ? `${F('Nearest quote', `<span class="lv-mono">${esc(q.quote_id || '—')}</span>`)}
         ${F('Selected packages', esc(Array.isArray(q.selected_packages) ? q.selected_packages.join(', ') : (q.selected_packages || '—')))}
         ${F('Monthly value', q.total_monthly != null ? NGN(q.total_monthly) : '—')}
         ${F('Is latest', q.is_latest ? 'Yes' : 'No')}
         ${gap('No contracts table exists. The closest real record is the <span class="mono">service_quotes</span> row above — a quote is not a signed contract.')}`
      : `${OpsModal.emptyState('', 'No linked quote', 'No <span class="mono">service_quotes</span> row for this property.')}${gap('No contracts table exists anywhere in the schema.')}`;

    const paymentsBody = `
      ${F('Total amount', NGN(total))}
      ${F('Paid so far (implied)', NGN(paidSoFar))}
      ${F('Balance due', `<b style="color:${balance > 0 ? 'var(--err)' : 'var(--ok)'}">${NGN(balance)}</b>`)}
      ${F('Payment method', '<span style="color:var(--ink-4);">Not captured — no column exists</span>')}
      ${gap('No payment-ledger table — only the current <span class="mono">balance_due</span> / <span class="mono">payment_status</span> snapshot. Individual installments aren\'t recoverable.')}`;

    const sidebar = `
      <div class="fgd-card"><div class="fgd-card-head"><h2>Quick facts</h2></div>
        ${F('Invoice ID', `<span class="lv-mono">${esc(id)}</span>`)}
        ${F('Type', `<span class="lv-mono">${esc(inv.invoice_type || '—')}</span>`)}
        ${F('Total', NGN(total))}
        ${F('Balance due', `<b style="color:${balance > 0 ? 'var(--err)' : 'var(--ok)'}">${NGN(balance)}</b>`)}
        ${F('Due', `<span class="lv-mono">${fmtDate(inv.due_date)}</span>`)}
        ${F('Client', inv.user_id ? L('clients', inv.user_id, inv.client_name || 'Client') : 'Unlinked')}
      </div>
      <div class="fgd-card"><div class="fgd-card-head"><h2>Related</h2></div>
        ${F('Property', propLink)}
        ${F('Nearest quote', q && q.quote_id ? `<span class="lv-mono">${esc(q.quote_id)}</span>` : '—')}
        ${F('Open tickets', inv.property_id ? L('maintenance', inv.property_id, String(inv.open_tickets || 0)) : (inv.open_tickets || 0))}
      </div>`;

    _container.innerHTML = BL_CSS + OpsModal.detailShell({
      back: 'OpsBilling.back()',
      crumbRoot: 'Billing',
      title: esc(id),
      avatar: { text: '₦', bg: 'linear-gradient(135deg,#16a8d3,#0d7fa0)' },
      chips: [{ cls: chipCls, label: pm.l, dot: true }],
      meta: [['Property', esc(inv.property_name || '—')], ['Client', inv.client_name ? esc(inv.client_name) : 'Unlinked'], ['Issued', fmtDate(inv.issue_date || inv.created_at)], ['Due', fmtDate(inv.due_date)], ['Sent', inv.sent_at ? fmtDate(inv.sent_at) : 'Not sent']],
      actions: `<button class="fgd-btn" onclick="OpsBilling.downloadPdf('${id}')">Download PDF</button>${canManage() ? `<button class="fgd-btn" onclick="OpsBilling.openEdit('${id}')">Edit</button>${eff !== 'paid' ? `<button class="fgd-btn" onclick="OpsBilling.recordPayment('${id}')">Record payment</button>` : ''}<button class="fgd-btn" style="background:linear-gradient(135deg,#16a8d3,#0d7fa0);color:#fff;border:none;" onclick="OpsBilling.sendInvoiceEmail('${id}')">${inv.sent_at ? 'Resend to client' : 'Send to client'}</button>` : ''}`,
      sections: [
        { id: 'details', title: 'Invoice details', meta: 'invoices', body: detailsBody },
        { id: 'services', title: 'Services', meta: 'invoices.line_items (jsonb)', body: servicesBody },
        { id: 'contract', title: 'Contract', meta: 'service_quotes', body: contractBody },
        { id: 'payments', title: 'Payments', meta: 'no ledger table', body: paymentsBody },
        { id: 'credits', title: 'Credit notes', body: OpsModal.emptyState('', 'No credit notes table exists', 'Nothing in the schema stores adjustments, refunds, or waived charges. This tab needs new schema.') },
        { id: 'attachments', title: 'Attachments', body: OpsModal.emptyState('', 'No attachments table exists', 'A signed quote PDF or proof-of-payment can\'t be attached until file storage is added — the same gap as every module.') },
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

  function recordPayment(id) {
    OpsModal.confirm(
      `There's no payment-ledger table, so a partial payment can't be itemized. Recording payment here settles the invoice in full — balance due goes to ₦0 and status becomes paid. Continue?`,
      async function () {
        OpsModal.setLoading('modal-confirm-btn', true);
        try {
          await OpsModal.apiPost('/billing/invoices/' + id + '/mark-paid', {});
          OpsModal.close();
          OpsModal.toast('Invoice settled', 'nominal');
          open(id);
        } catch (err) { OpsModal.toast('Failed: ' + err.message, 'critical'); OpsModal.setLoading('modal-confirm-btn', false); }
      });
  }

  // ────────────────────────────────────────────────── CREATE / EDIT
  async function ensureProps() {
    if (_props.length) return;
    try {
      const res = await OpsModal.apiGet('/properties/all');
      _props = (res.data || []).filter(p => p.asset_class === 'customer_property' || p.asset_class == null);
    } catch { _props = []; }
  }

  async function openCreate() {
    if (!_container) return;
    if (!canManage()) return OpsModal.toast('You do not have permission to create invoices', 'critical');
    _editId = null;
    _draft = [{ description: '', qty: 1, unit_price: 0, amount: 0 }];
    _container.innerHTML = BL_CSS + `<div style="padding:60px;text-align:center;color:var(--ink-3);">Loading…</div>`;
    await ensureProps();
    renderForm(null);
  }

  async function openEdit(id) {
    if (!_container) return;
    if (!canManage()) return OpsModal.toast('You do not have permission to edit invoices', 'critical');
    _container.innerHTML = BL_CSS + `<div style="padding:60px;text-align:center;color:var(--ink-3);">Loading…</div>`;
    await ensureProps();
    let inv;
    try { inv = (await OpsModal.apiGet('/billing/invoices/' + id)).data; }
    catch { return OpsModal.toast('Failed to load invoice', 'critical'); }
    _editId = id;
    const items = Array.isArray(inv.line_items) ? inv.line_items : (() => { try { return JSON.parse(inv.line_items || '[]'); } catch { return []; } })();
    _draft = items.length
      ? items.map(l => ({ description: l.description || '', qty: l.qty != null ? Number(l.qty) : 1, unit_price: l.unit_price != null ? Number(l.unit_price) : (Number(l.amount) || 0), amount: Number(l.amount) || 0 }))
      : [{ description: '', qty: 1, unit_price: 0, amount: 0 }];
    renderForm(inv);
  }

  function renderForm(inv) {
    const isEdit = !!inv;
    const today = (inv && inv.issue_date) ? String(inv.issue_date).slice(0, 10) : new Date().toISOString().slice(0, 10);
    const due = (inv && inv.due_date) ? String(inv.due_date).slice(0, 10) : new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const selType = inv ? inv.invoice_type : 'maintenance';
    const selStatus = inv ? String(inv.status || 'open').toLowerCase() : 'open';
    let selP = inv ? String(inv.payment_status || 'unpaid').toLowerCase() : 'unpaid';
    if (selP === 'pending') selP = 'unpaid';
    const vat = inv && inv.vat_rate != null ? Number(inv.vat_rate) : DEFAULT_VAT;
    const pid = inv ? inv.property_id : '';
    const o = (v, l, sel) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(l)}</option>`;

    _container.innerHTML = BL_CSS + `
      <div class="fgd-crumb"><span class="lnk" onclick="OpsBilling.back()">Billing</span><span class="sep">/</span><span class="cur">${isEdit ? esc(inv.invoice_id) : 'New invoice'}</span></div>
      <div class="bl-head">
        <div><h1>${isEdit ? 'Edit invoice' : 'New invoice'}</h1><div class="sub">${isEdit ? esc(inv.invoice_id) : 'Invoice ID will be auto-generated on save'}</div></div>
        <div class="bl-head-actions">
          <button class="bl-btn" onclick="OpsBilling.back()">Cancel</button>
          ${isEdit ? '' : `<button class="bl-btn" id="bl-draft-btn" onclick="OpsBilling.confirmSave(false)">Save as draft</button>`}
          <button class="bl-btn primary" id="bl-create-btn" onclick="OpsBilling.confirmSave(${isEdit ? 'false' : 'true'})">${isEdit ? 'Save changes' : 'Create & send'}</button>
        </div>
      </div>
      <div class="bl-grid2">
        <div style="display:flex;flex-direction:column;gap:16px;">
          <div class="fgd-card">
            <div class="fgd-card-head"><h2>Invoice details</h2><span class="cmeta">invoices</span></div>
            <div class="bl-field">
              <div class="bl-field-label">Property <span class="sub">required · determines client</span></div>
              <select class="bl-input" id="bl-c-property" onchange="OpsBilling.onProp()">
                <option value="">— Select a property —</option>
                ${_props.map(p => o(p.property_id, p.property_name || p.property_id, pid)).join('')}
              </select>
            </div>
            <div class="bl-field">
              <div class="bl-field-label">Client <span class="sub">derived, read-only</span></div>
              <div class="bl-derived warn" id="bl-c-client">Select a property first</div>
            </div>
            <div class="bl-field">
              <div class="bl-field-label">Invoice type</div>
              <select class="bl-input" id="bl-c-type">
                ${['maintenance', 'installation', 'subscription', 'one_time'].map(t => o(t, t, selType)).join('')}
              </select>
            </div>
            <div style="display:flex;gap:12px;">
              <div class="bl-field" style="flex:1;"><div class="bl-field-label">Issue date</div><input class="bl-input" type="date" id="bl-c-issue" value="${today}"></div>
              <div class="bl-field" style="flex:1;"><div class="bl-field-label">Due date</div><input class="bl-input" type="date" id="bl-c-due" value="${due}"></div>
            </div>
            <div class="bl-omit">Payment method isn't collected — there's no column for it on <span class="mono">invoices</span>.</div>
          </div>

          <div class="fgd-card">
            <div class="fgd-card-head"><h2>Services</h2><span class="cmeta">writes to invoices.line_items (jsonb)</span></div>
            <div class="bl-li-head"><span>Description</span><span>Qty</span><span>Unit price</span><span style="text-align:right;">Amount</span><span></span></div>
            <div id="bl-items"></div>
            <button class="bl-addrow" onclick="OpsBilling.addItem()">+ Add line</button>
            <div class="bl-field" style="max-width:220px;margin-top:14px;margin-bottom:0;">
              <div class="bl-field-label">VAT rate (%) <span class="sub">default 7.5</span></div>
              <input class="bl-input" type="number" min="0" step="0.1" id="bl-c-vat" value="${vat}" oninput="OpsBilling.recalc()">
            </div>
            <div class="bl-totals" id="bl-totals"></div>
          </div>

          <div class="fgd-card">
            <div class="fgd-card-head"><h2>Status</h2><span class="cmeta">two separate columns</span></div>
            <div style="display:flex;gap:12px;">
              <div class="bl-field" style="flex:1;"><div class="bl-field-label">status</div>
                <select class="bl-input" id="bl-c-status">${['open', 'closed'].map(s => o(s, s, selStatus)).join('')}</select></div>
              <div class="bl-field" style="flex:1;"><div class="bl-field-label">payment_status</div>
                <select class="bl-input" id="bl-c-pstatus" onchange="OpsBilling.recalc()">${['unpaid', 'partial', 'paid'].map(s => o(s, s, selP)).join('')}</select></div>
            </div>
            <div class="bl-field" style="margin-bottom:0;"><div class="bl-field-label">Balance due <span class="sub">computed</span></div><input class="bl-input" id="bl-c-balance" disabled></div>
            ${gap('Both fields exist on the row and are exposed because their relationship isn\'t documented. Pick one as source of truth before this ships.')}
          </div>

          <div class="bl-savebar">
            <button class="bl-btn" onclick="OpsBilling.back()">Cancel</button>
            ${isEdit ? '' : `<button class="bl-btn" onclick="OpsBilling.confirmSave(false)">Save as draft</button>`}
            <button class="bl-btn primary" onclick="OpsBilling.confirmSave(${isEdit ? 'false' : 'true'})">${isEdit ? 'Save changes' : 'Create & send'}</button>
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
    if (!p) { el.className = 'bl-derived warn'; el.textContent = 'Select a property first'; }
    else if (p.client_name || p.user_id) { el.className = 'bl-derived'; el.textContent = p.client_name || 'Linked client'; }
    else { el.className = 'bl-derived warn'; el.textContent = 'No client linked to this property'; }
    recalc();
  }

  function renderItems() {
    const el = document.getElementById('bl-items');
    if (!el) return;
    el.innerHTML = _draft.map((l, i) => `<div class="bl-li">
      <input class="bl-input" placeholder="Description" value="${esc(l.description || '')}" oninput="OpsBilling.editItem(${i},'description',this.value)">
      <input class="bl-input" type="number" min="0" value="${l.qty != null ? l.qty : 1}" oninput="OpsBilling.editItem(${i},'qty',this.value)">
      <input class="bl-input" type="number" min="0" value="${l.unit_price != null ? l.unit_price : 0}" oninput="OpsBilling.editItem(${i},'unit_price',this.value)">
      <span class="amt">${NGN(l.amount)}</span>
      <span class="bl-li-rm" onclick="OpsBilling.removeItem(${i})" title="Remove">×</span>
    </div>`).join('');
    recalc();
  }
  function addItem() { _draft.push({ description: '', qty: 1, unit_price: 0, amount: 0 }); renderItems(); }
  function removeItem(i) { _draft.splice(i, 1); if (!_draft.length) _draft.push({ description: '', qty: 1, unit_price: 0, amount: 0 }); renderItems(); }
  function editItem(i, k, v) {
    if (!_draft[i]) return;
    _draft[i][k] = (k === 'description') ? v : (parseFloat(v) || 0);
    _draft[i].amount = (parseFloat(_draft[i].qty) || 0) * (parseFloat(_draft[i].unit_price) || 0);
    // update just the amount + totals without wiping focus
    const row = document.querySelectorAll('#bl-items .bl-li')[i];
    if (row) row.querySelector('.amt').textContent = NGN(_draft[i].amount);
    recalc();
  }

  function vatRateInput() { return Math.max(0, parseFloat((document.getElementById('bl-c-vat') || {}).value) || 0); }

  function recalc() {
    const subtotal = _draft.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const vatRate = vatRateInput();
    const vat = Math.round(subtotal * vatRate) / 100;
    const total = subtotal + vat;
    const tot = document.getElementById('bl-totals');
    if (tot) tot.innerHTML = `<div class="bl-totrow"><span>Subtotal</span><span>${NGN(subtotal)}</span></div><div class="bl-totrow"><span>VAT (${vatRate}%)</span><span>${NGN(vat)}</span></div><div class="bl-totrow grand"><span>Total</span><span>${NGN(total)}</span></div>`;
    const ps = (document.getElementById('bl-c-pstatus') || {}).value || 'unpaid';
    const balance = ps === 'paid' ? 0 : total;
    const bd = document.getElementById('bl-c-balance'); if (bd) bd.value = NGN(balance);
    const prop = _props.find(x => x.property_id === (document.getElementById('bl-c-property') || {}).value);
    const prev = document.getElementById('bl-preview');
    const F = OpsModal.fact;
    if (prev) prev.innerHTML = `
      ${F('Invoice ID', _editId ? esc(_editId) : 'Auto on save')}
      ${F('Property', prop ? esc(prop.property_name || prop.property_id) : '—')}
      ${F('Client', prop ? (prop.client_name || 'Unlinked') : '—')}
      ${F('Subtotal', NGN(subtotal))}
      ${F('VAT (' + vatRate + '%)', NGN(vat))}
      ${F('Total', NGN(total))}
      ${F('Balance due', NGN(balance))}`;
  }

  async function confirmSave(send) {
    const pid = (document.getElementById('bl-c-property') || {}).value;
    if (!pid) return OpsModal.toast('Select a property first', 'critical');
    const items = _draft.filter(l => l.description || l.amount).map(l => ({ description: l.description, qty: Number(l.qty) || 0, unit_price: Number(l.unit_price) || 0, amount: Number(l.amount) || 0 }));
    if (!items.length) return OpsModal.toast('Add at least one line item', 'critical');
    const subtotal = items.reduce((s, l) => s + l.amount, 0);
    const payload = {
      property_id: pid,
      invoice_type: (document.getElementById('bl-c-type') || {}).value || 'maintenance',
      issue_date: (document.getElementById('bl-c-issue') || {}).value || null,
      due_date: (document.getElementById('bl-c-due') || {}).value || null,
      line_items: items, subtotal, vat_rate: vatRateInput(),
      status: (document.getElementById('bl-c-status') || {}).value || 'open',
      payment_status: (document.getElementById('bl-c-pstatus') || {}).value || 'unpaid',
    };
    const btnId = (send && !_editId) ? 'bl-create-btn' : (_editId ? 'bl-create-btn' : 'bl-draft-btn');
    OpsModal.setLoading(btnId, true);
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
        OpsModal.toast(_editId ? 'Invoice updated' : 'Draft saved', 'nominal');
      }
      if (newId) open(newId); else back();
    } catch (err) {
      OpsModal.toast('Failed to save invoice: ' + err.message, 'critical');
      OpsModal.setLoading(btnId, false);
    }
  }

  // Email the invoice (PDF + pay CTA) to the client from the detail view.
  function sendInvoiceEmail(id) {
    OpsModal.confirm('Email this invoice to the client? They\'ll get the PDF attached and a link to log in and pay.', async function () {
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
    });
  }

  return {
    render, setFilter, search, open, back, exportCsv,
    openCreate, openEdit, onProp, addItem, removeItem, editItem, recalc, confirmSave, recordPayment, downloadPdf, sendInvoiceEmail,
  };
})();
