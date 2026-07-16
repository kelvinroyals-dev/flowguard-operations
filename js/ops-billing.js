// ============================================
// OPS BILLING MODULE v1.0.0
// Revenue dashboard — MRR, invoices, overdue
//
// API contracts expected:
//   GET /billing/summary  → { mrr, arr, overdue_count, overdue_amount,
//                             active_subscriptions, avg_revenue_per_site,
//                             mrr_trend: [{month, amount}] }
//   GET /billing/invoices → { data: [Invoice] }
//   GET /billing/invoices/:id
//   POST /billing/invoices/:id/send-reminder
//   POST /billing/invoices/:id/mark-paid
// ============================================

const OpsBilling = (function () {
  'use strict';

  let _invoices = [];
  let _pg       = null;
  let _filter   = 'all'; // all | overdue | pending | paid
  let _container = null;
  const dash = v => (v == null || v === '') ? '—' : v;

  function render(container) {
    _container = container;
    container.innerHTML = `
      <style>
        .ops-table tbody tr.clickable { cursor:pointer; transition:background .12s; }
        .ops-table tbody tr.clickable:hover { background:var(--surface-2,#f2f8fb); }
        .bl-back { display:inline-flex; align-items:center; gap:6px; font-size:var(--fs-sm); font-weight:600; color:var(--ink-2); background:var(--surface-2); border:1px solid var(--border); border-radius:9px; padding:8px 13px; cursor:pointer; }
        .bl-detail-top { display:flex; align-items:center; gap:14px; margin-bottom:18px; flex-wrap:wrap; }
        .bl-detail-name { font-family:var(--ff-d); font-size:var(--fs-xl); font-weight:700; color:var(--ink); line-height:1.1; }
        .bl-detail-meta { font-size:var(--fs-sm); color:var(--ink-3); margin-top:3px; }
        .bl-detail-actions { margin-left:auto; display:flex; gap:8px; }
        .bl-section { background:var(--surface,#fff); border:1px solid var(--border); border-radius:var(--r,14px); box-shadow:var(--sh-xs); margin-bottom:14px; overflow:hidden; }
        .bl-section-h { padding:12px 18px; border-bottom:1px solid var(--border); font-family:var(--ff-d); font-size:var(--fs-sm); font-weight:700; letter-spacing:.4px; color:var(--ink); display:flex; align-items:center; justify-content:space-between; }
        .bl-section-b { padding:16px 18px; }
        .bl-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:14px 22px; }
        .bl-field .k { font-size:var(--fs-2xs); font-weight:700; letter-spacing:.9px; text-transform:uppercase; color:var(--ink-3); }
        .bl-field .v { font-size:var(--fs-md); color:var(--ink); font-weight:600; margin-top:3px; }
        .bl-empty { color:var(--ink-3); font-size:var(--fs-sm); padding:6px 0; }
        .bl-needs { font-size:var(--fs-xs); color:var(--ink-4); font-style:italic; }
        /* ── KPI row ── */
        .bl-kpis { display:grid; grid-template-columns:repeat(5,1fr); gap:14px; margin-bottom:20px; }

        .bl-kpi {
          background:var(--surface,#fff);
          border:1px solid var(--border,#dae6ef);
          border-radius:var(--r,14px);
          padding:18px;
          box-shadow:var(--sh-xs);
          position:relative; overflow:hidden;
          transition:all .2s;
        }
        .bl-kpi:hover { transform:translateY(-2px); box-shadow:var(--sh-md); }
        .bl-kpi::after { content:''; position:absolute; bottom:0; left:0; right:0; height:3px; }
        .bl-kpi.green::after  { background:var(--ok,#0a8a6a); }
        .bl-kpi.blue::after   { background:linear-gradient(90deg,var(--navy,#0a2a3d),var(--blue,#16a8d3)); }
        .bl-kpi.amber::after  { background:var(--amber,#f5a623); }
        .bl-kpi.red::after    { background:var(--err,#dc2626); }
        .bl-kpi.purple::after { background:#7c3aed; }

        .bl-kpi-label { font-size:var(--fs-2xs); font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:var(--ink-3,#6b8fa3); margin-bottom:6px; }
        .bl-kpi-val   { font-family:var(--ff-d,'Space Grotesk',sans-serif); font-size:var(--fs-2xl); font-weight:900; color:var(--ink,#0a1f2e); letter-spacing:-.03em; line-height:1; }
        .bl-kpi-val.green  { color:var(--ok,#0a8a6a); }
        .bl-kpi-val.blue   { color:var(--blue,#16a8d3); }
        .bl-kpi-val.amber  { color:var(--amber,#f5a623); }
        .bl-kpi-val.red    { color:var(--err,#dc2626); }
        .bl-kpi-val.purple { color:#7c3aed; }
        .bl-kpi-sub { font-size:var(--fs-xs); color:var(--ink-3,#6b8fa3); margin-top:4px; }
        .bl-kpi-sub.red { color:var(--err,#dc2626); font-weight:600; }

        /* ── Trend + overdue row ── */
        .bl-mid { display:grid; grid-template-columns:1fr 360px; gap:16px; margin-bottom:20px; }

        /* MRR chart card */
        .bl-chart-card { background:var(--surface,#fff); border:1px solid var(--border,#dae6ef); border-radius:var(--r,14px); box-shadow:var(--sh-xs); overflow:hidden; }
        .bl-card-head { padding:14px 20px; border-bottom:1px solid var(--border,#dae6ef); display:flex; align-items:center; justify-content:space-between; }
        .bl-card-title { font-family:var(--ff-d,'Space Grotesk',sans-serif); font-size:var(--fs-md); font-weight:700; color:var(--ink,#0a1f2e); }
        .bl-chart-body { padding:20px; }

        /* Bar chart */
        .bl-bars { display:flex; align-items:flex-end; gap:6px; height:120px; }
        .bl-bar-wrap { flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; }
        .bl-bar { width:100%; border-radius:4px 4px 0 0; background:linear-gradient(180deg,var(--blue,#16a8d3),var(--navy,#0a2a3d)); min-height:4px; transition:height .4s cubic-bezier(.22,1,.36,1); position:relative; cursor:pointer; }
        .bl-bar:hover { filter:brightness(1.15); }
        .bl-bar-tip { position:absolute; top:-28px; left:50%; transform:translateX(-50%); background:var(--navy,#0a2a3d); color:white; font-size:var(--fs-2xs); font-weight:700; padding:2px 6px; border-radius:4px; white-space:nowrap; opacity:0; transition:opacity .15s; pointer-events:none; }
        .bl-bar:hover .bl-bar-tip { opacity:1; }
        .bl-bar-label { font-size:var(--fs-2xs); color:var(--ink-4,#9eb8c8); font-family:var(--ff-m,'JetBrains Mono',monospace); }

        /* Overdue list */
        .bl-overdue-card { background:var(--surface,#fff); border:1px solid rgba(220,38,38,.2); border-radius:var(--r,14px); box-shadow:var(--sh-xs); overflow:hidden; }
        .bl-overdue-head { padding:14px 18px; border-bottom:1px solid rgba(220,38,38,.12); display:flex; align-items:center; gap:8px; background:rgba(220,38,38,.03); }
        .bl-overdue-title { font-family:var(--ff-d,'Space Grotesk',sans-serif); font-size:var(--fs-md); font-weight:700; color:var(--err,#dc2626); }
        .bl-overdue-item { padding:11px 18px; border-bottom:1px solid var(--border,#dae6ef); display:flex; align-items:center; justify-content:space-between; gap:10px; transition:background .12s; }
        .bl-overdue-item:last-child { border-bottom:none; }
        .bl-overdue-item:hover { background:var(--surface-2,#f7fafc); }
        .bl-overdue-name { font-size:var(--fs-base); font-weight:600; color:var(--ink,#0a1f2e); }
        .bl-overdue-days { font-size:var(--fs-sm); color:var(--err,#dc2626); font-weight:600; }
        .bl-overdue-amount { font-family:var(--ff-d,'Space Grotesk',sans-serif); font-size:var(--fs-lg); font-weight:800; color:var(--err,#dc2626); }

        /* ── Invoice table ── */
        .bl-table-card { background:var(--surface,#fff); border:1px solid var(--border,#dae6ef); border-radius:var(--r,14px); box-shadow:var(--sh-xs); overflow:hidden; }
        .bl-table-head { padding:14px 20px; border-bottom:1px solid var(--border,#dae6ef); display:flex; align-items:center; justify-content:space-between; gap:12px; }

        .bl-filter-tabs { display:flex; gap:5px; }
        .bl-filter-btn { padding:5px 14px; border-radius:20px; border:1px solid var(--border,#dae6ef); background:var(--surface,#fff); font-family:var(--ff-b,'Inter',sans-serif); font-size:var(--fs-sm); font-weight:600; color:var(--ink-3,#6b8fa3); cursor:pointer; transition:all .15s; }
        .bl-filter-btn:hover { border-color:var(--border-2,#b8d0de); color:var(--ink-2,#2d5068); }
        .bl-filter-btn.active { background:var(--navy,#0a2a3d); border-color:var(--navy,#0a2a3d); color:white; }
        .bl-filter-btn.active.overdue { background:var(--err,#dc2626); border-color:var(--err,#dc2626); }
        .bl-filter-btn.active.pending { background:var(--warn,#b45309); border-color:var(--warn,#b45309); }
        .bl-filter-btn.active.paid    { background:var(--ok,#0a8a6a);  border-color:var(--ok,#0a8a6a); }
      </style>

      <!-- KPI row -->
      <div class="bl-kpis">
        <div class="bl-kpi green">
          <div class="bl-kpi-label">Monthly Revenue</div>
          <div class="bl-kpi-val green" id="bl-mrr">—</div>
          <div class="bl-kpi-sub" id="bl-mrr-sub">Loading…</div>
        </div>
        <div class="bl-kpi blue">
          <div class="bl-kpi-label">Annual Run Rate</div>
          <div class="bl-kpi-val blue" id="bl-arr">—</div>
          <div class="bl-kpi-sub" id="bl-arr-sub">Projected</div>
        </div>
        <div class="bl-kpi amber">
          <div class="bl-kpi-label">Active Subscriptions</div>
          <div class="bl-kpi-val amber" id="bl-subs">—</div>
          <div class="bl-kpi-sub" id="bl-subs-sub">Deployed sites</div>
        </div>
        <div class="bl-kpi purple">
          <div class="bl-kpi-label">Avg Revenue / Site</div>
          <div class="bl-kpi-val purple" id="bl-arps">—</div>
          <div class="bl-kpi-sub">Per month</div>
        </div>
        <div class="bl-kpi red">
          <div class="bl-kpi-label">Overdue</div>
          <div class="bl-kpi-val red" id="bl-overdue-val">—</div>
          <div class="bl-kpi-sub red" id="bl-overdue-sub">—</div>
        </div>
      </div>

      <!-- MRR trend + overdue list -->
      <div class="bl-mid">
        <div class="bl-chart-card">
          <div class="bl-card-head">
            <div class="bl-card-title">MRR Trend</div>
            <span style="font-size:var(--fs-xs);color:var(--ink-3);font-family:var(--ff-m);">Last 6 months</span>
          </div>
          <div class="bl-chart-body">
            <div class="bl-bars" id="bl-bars">
              <div style="margin:auto;color:var(--ink-3);font-size:var(--fs-base);">Loading…</div>
            </div>
          </div>
        </div>

        <div class="bl-overdue-card">
          <div class="bl-overdue-head">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <div class="bl-overdue-title">Overdue Invoices</div>
          </div>
          <div id="bl-overdue-list">
            <div style="padding:28px;text-align:center;color:var(--ink-3);font-size:var(--fs-base);">Loading…</div>
          </div>
        </div>
      </div>

      <!-- Invoice table -->
      <div class="bl-table-card">
        <div class="bl-table-head">
          <div class="bl-card-title">All Invoices</div>
          <div class="bl-filter-tabs">
            <button class="bl-filter-btn active"   id="blf-all"     onclick="OpsBilling.setFilter('all')">All</button>
            <button class="bl-filter-btn overdue"  id="blf-overdue" onclick="OpsBilling.setFilter('overdue')">Overdue</button>
            <button class="bl-filter-btn pending"  id="blf-pending" onclick="OpsBilling.setFilter('pending')">Pending</button>
            <button class="bl-filter-btn paid"     id="blf-paid"    onclick="OpsBilling.setFilter('paid')">Paid</button>
          </div>
        </div>
        <div id="bl-table-body">
          <div style="padding:48px;text-align:center;color:var(--ink-3);">
            <div class="loading" style="margin:0 auto 12px;"></div>
            <div style="font-size:var(--fs-base);">Loading invoices…</div>
          </div>
        </div>
      </div>
    `;

    loadAll();
  }

  // ── DATA ──────────────────────────────────────────────────────────────

  async function loadAll() {
    try {
      const [summaryRes, invoicesRes] = await Promise.all([
        OpsModal.apiGet('/billing/summary'),
        OpsModal.apiGet('/billing/invoices'),
      ]);

      renderKPIs(summaryRes.data || {});
      renderTrend(summaryRes.data?.mrr_trend || []);

      _invoices = invoicesRes.data || invoicesRes.invoices || [];
      renderOverdue(_invoices.filter(i => i.payment_status === 'overdue'));
      _pg = FGPaginator.create(_invoices, { pageSize: 25, containerId: 'bl-table-body' });
      _pg.render(renderInvoiceTable);

    } catch (err) {
      document.getElementById('bl-table-body').innerHTML = `
        <div style="padding:48px;text-align:center;">
          <div style="color:var(--err);font-weight:700;margin-bottom:8px;">Failed to load billing data</div>
          <div style="color:var(--ink-3);font-size:var(--fs-sm);margin-bottom:16px;">${err.message}</div>
          <button class="btn-ghost" onclick="reloadTab('billing')">Retry</button>
        </div>`;
    }
  }

  // ── KPI CARDS ─────────────────────────────────────────────────────────

  function renderKPIs(d) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const mrr = d.mrr || 0;
    const arr = mrr * 12;

    set('bl-mrr',         fmtMoney(mrr));
    set('bl-mrr-sub',     d.mrr_growth ? `${d.mrr_growth > 0 ? '+' : ''}${d.mrr_growth}% vs last month` : 'Current month');
    set('bl-arr',         fmtMoney(arr));
    set('bl-subs',        d.active_subscriptions ?? '—');
    set('bl-arps',        d.avg_revenue_per_site ? fmtMoney(d.avg_revenue_per_site) : '—');
    set('bl-overdue-val', d.overdue_count != null ? d.overdue_count : '—');
    set('bl-overdue-sub', d.overdue_amount ? `₦${Number(d.overdue_amount).toLocaleString()} outstanding` : 'invoices');
  }

  // ── MRR BAR CHART ─────────────────────────────────────────────────────

  function renderTrend(trend) {
    const el = document.getElementById('bl-bars');
    if (!el) return;

    if (!trend || trend.length === 0) {
      el.innerHTML = '<div style="margin:auto;color:var(--ink-3);font-size:var(--fs-base);">No trend data yet</div>';
      return;
    }

    const max = Math.max(...trend.map(t => t.amount || 0), 1);
    el.innerHTML = trend.map(t => {
      const pct   = Math.max(4, Math.round(((t.amount || 0) / max) * 100));
      const label = t.month ? new Date(t.month + '-01').toLocaleDateString('en-GB', { month:'short' }) : '—';
      return `
        <div class="bl-bar-wrap">
          <div class="bl-bar" style="height:${pct}%;">
            <div class="bl-bar-tip">₦${fmtMoney(t.amount)}</div>
          </div>
          <div class="bl-bar-label">${label}</div>
        </div>`;
    }).join('');
  }

  // ── OVERDUE LIST ──────────────────────────────────────────────────────

  function renderOverdue(invoices) {
    const el = document.getElementById('bl-overdue-list');
    if (!el) return;

    if (!invoices || invoices.length === 0) {
      el.innerHTML = `
        <div style="padding:28px;text-align:center;color:var(--ok);">
          <svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="margin:0 auto 8px;display:block;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <div style="font-size:var(--fs-base);font-weight:600;">No overdue invoices</div>
        </div>`;
      return;
    }

    el.innerHTML = invoices.slice(0, 6).map(inv => {
      const days = inv.days_overdue || daysSince(inv.due_date);
      return `
        <div class="bl-overdue-item">
          <div>
            <div class="bl-overdue-name">${inv.client_name || '—'}</div>
            <div class="bl-overdue-days">${days} days overdue</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="bl-overdue-amount">₦${Number(inv.total_amount || 0).toLocaleString()}</div>
            <button class="btn-ghost" onclick="OpsBilling.sendReminder('${inv.invoice_id || inv.id}')" style="padding:5px 10px;font-size:var(--fs-xs);">Remind</button>
          </div>
        </div>`;
    }).join('');
  }

  // ── INVOICE TABLE ─────────────────────────────────────────────────────

  function setFilter(f) {
    _filter = f;
    ['all','overdue','pending','paid'].forEach(k => {
      const btn = document.getElementById(`blf-${k}`);
      if (btn) btn.classList.toggle('active', k === f);
    });
    const filtered = f === 'all'
      ? _invoices
      : _invoices.filter(i => (i.payment_status || '').toLowerCase() === f);
    if (_pg) _pg.update(filtered);
    else renderInvoiceTable(filtered);
  }

  function renderInvoiceTable(invoices) {
    const el = document.getElementById('bl-table-body');
    if (!el) return;

    if (!invoices || invoices.length === 0) {
      el.innerHTML = `
        <div style="padding:48px;text-align:center;color:var(--ink-3);">
          <div style="font-size:var(--fs-md);font-weight:600;color:var(--ink-2);">No invoices found</div>
        </div>`;
      return;
    }

    // Columns per spec: Invoice, Client, Property, Amount, Due Date, Status, Payment Method
    el.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="ops-table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Client</th>
              <th>Property</th>
              <th style="text-align:right;">Amount</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Payment Method</th>
            </tr>
          </thead>
          <tbody>
            ${invoices.map(inv => {
              const id     = inv.invoice_id || inv.id;
              const status = (inv.payment_status || 'pending').toLowerCase();
              const badge  = { paid:'nominal', overdue:'critical', pending:'watch', cancelled:'offline' }[status] || 'watch';
              const isOverdue = status === 'overdue';
              return `<tr class="clickable" onclick="OpsBilling.open('${id}')" tabindex="0" onkeydown="if(event.key==='Enter'){OpsBilling.open('${id}')}">
                <td style="font-family:var(--ff-m);font-size:var(--fs-sm);" class="bright">${id}</td>
                <td>${dash(inv.client_name)}</td>
                <td style="font-size:var(--fs-sm);">${dash(inv.property_name)}</td>
                <td style="text-align:right;font-family:var(--ff-d);font-weight:800;color:${isOverdue ? 'var(--err)' : 'var(--ink)'};">₦${Number(inv.total_amount || 0).toLocaleString()}</td>
                <td style="font-size:var(--fs-sm);font-family:var(--ff-m);${isOverdue ? 'color:var(--err);font-weight:700;' : ''}">${fmtDate(inv.due_date)}</td>
                <td><span class="status-badge ${badge}">${status}</span></td>
                <td style="font-size:var(--fs-sm);">${dash(inv.payment_method)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function back() { if (_container) render(_container); }

  // ── ACTIONS ───────────────────────────────────────────────────────────

  // ── FULL DETAIL SCREEN (no pop-up) ──
  async function open(id) {
    if (!_container) return;
    _container.innerHTML = `<div style="padding:60px;text-align:center;color:var(--ink-3);"><div class="loading" style="margin:0 auto 12px;"></div>Loading invoice…</div>`;
    try {
      const res = await OpsModal.apiGet(`/billing/invoices/${id}`);
      renderDetail(res.data || {});
    } catch (err) {
      _container.innerHTML = `<div style="padding:48px;text-align:center;"><div style="color:var(--err);font-weight:700;margin-bottom:8px;">Failed to load invoice</div><button class="bl-back" onclick="OpsBilling.back()">← Back to Billing</button></div>`;
    }
  }

  function section(title, body, needs) {
    return `<div class="bl-section"><div class="bl-section-h">${title}${needs ? '<span class="bl-needs">pending backend data</span>' : ''}</div><div class="bl-section-b">${body}</div></div>`;
  }

  function renderDetail(inv) {
    const id = inv.invoice_id || inv.id;
    const status = (inv.payment_status || 'pending').toLowerCase();
    const badge = { paid: 'nominal', overdue: 'critical', pending: 'watch', cancelled: 'offline' }[status] || 'watch';
    const items = inv.line_items || inv.services || [];
    const payments = inv.payments || [];
    const field = (k, v) => `<div class="bl-field"><div class="k">${k}</div><div class="v">${v}</div></div>`;

    const details = `<div class="bl-grid">
      ${field('Invoice', id)}
      ${field('Client', inv.user_id ? OpsModal.link('clients', inv.user_id, inv.client_name || 'Client') : dash(inv.client_name))}
      ${field('Property', inv.property_id ? OpsModal.link('properties', inv.property_id, inv.property_name || inv.property_id) : dash(inv.property_name))}
      ${field('Amount', '₦' + Number(inv.total_amount || 0).toLocaleString())}
      ${field('Due Date', fmtDate(inv.due_date))}
      ${field('Status', `<span class="status-badge ${badge}">${status}</span>`)}
      ${field('Payment Method', dash(inv.payment_method))}
      ${field('Issue Date', fmtDate(inv.issue_date || inv.created_at))}
      ${inv.paid_at ? field('Paid On', fmtDate(inv.paid_at)) : ''}
    </div>${inv.description ? `<div style="margin-top:12px;">${field('Description', inv.description)}</div>` : ''}`;

    const services = items.length ? `
      <div style="overflow-x:auto;"><table class="ops-table"><thead><tr><th>Description</th><th style="text-align:right;">Amount</th></tr></thead>
      <tbody>${items.map(l => `<tr><td>${l.description || '—'}</td><td style="text-align:right;font-family:var(--ff-d);font-weight:700;">₦${Number(l.amount || 0).toLocaleString()}</td></tr>`).join('')}</tbody></table></div>` : '<div class="bl-empty">No line items on this invoice.</div>';

    const paymentsBody = payments.length ? `
      <div style="overflow-x:auto;"><table class="ops-table"><thead><tr><th>Date</th><th>Method</th><th style="text-align:right;">Amount</th></tr></thead>
      <tbody>${payments.map(p => `<tr><td style="font-size:var(--fs-sm);">${fmtDate(p.paid_at || p.date)}</td><td style="font-size:var(--fs-sm);">${dash(p.method)}</td><td style="text-align:right;font-family:var(--ff-d);font-weight:700;">₦${Number(p.amount || 0).toLocaleString()}</td></tr>`).join('')}</tbody></table></div>` : (status === 'paid' ? `<div class="bl-empty">Paid ${fmtDate(inv.paid_at)}${inv.payment_method ? ' · ' + inv.payment_method : ''}.</div>` : '<div class="bl-empty">No payments recorded.</div>');

    const actions = status !== 'paid'
      ? `<button class="btn-ghost" onclick="OpsBilling.sendReminder('${id}')">Send Reminder</button><button class="btn-primary" onclick="OpsBilling.markPaid('${id}')">Mark as Paid</button>`
      : '';

    _container.innerHTML = `
      <div class="bl-detail-top">
        <button class="bl-back" onclick="OpsBilling.back()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>Billing</button>
        <div>
          <div class="bl-detail-name">Invoice ${id}</div>
          <div class="bl-detail-meta">${dash(inv.client_name)} · ₦${Number(inv.total_amount || 0).toLocaleString()} · <span class="status-badge ${badge}">${status}</span></div>
        </div>
        <div class="bl-detail-actions">${actions}</div>
      </div>
      ${section('Invoice Details', details)}
      ${section('Services', services)}
      ${section('Contract', '<div class="bl-empty">No contract linked in this response.</div>', true)}
      ${section('Payments', paymentsBody)}
      ${section('Credit Notes', '<div class="bl-empty">No credit notes.</div>', true)}
      ${section('Attachments', '<div class="bl-empty">No attachments.</div>', true)}
    `;
  }

  async function sendReminder(id) {
    try {
      await OpsModal.apiPost(`/billing/invoices/${id}/send-reminder`, {});
      OpsModal.toast('Reminder sent to client', 'nominal');
    } catch (err) {
      OpsModal.toast('Failed: ' + err.message, 'critical');
    }
  }

  function markPaid(id) {
    OpsModal.confirm(`Mark invoice ${id} as paid?`, async function () {
      try {
        await OpsModal.apiPost(`/billing/invoices/${id}/mark-paid`, {});
        OpsModal.close();
        OpsModal.toast('Invoice marked as paid', 'nominal');
        reloadTab('billing');
      } catch (err) {
        OpsModal.toast('Failed: ' + err.message, 'critical');
        OpsModal.setLoading('modal-confirm-btn', false);
      }
    });
  }

  // ── HELPERS ───────────────────────────────────────────────────────────

  function fmtMoney(n) {
    if (!n) return '₦0';
    if (n >= 1000000) return `₦${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000)    return `₦${(n / 1000).toFixed(0)}K`;
    return `₦${Number(n).toLocaleString()}`;
  }

  function fmtDate(ds) {
    if (!ds) return '—';
    return new Date(ds).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  }

  function daysSince(ds) {
    if (!ds) return 0;
    return Math.floor((Date.now() - new Date(ds).getTime()) / 86400000);
  }

  return { render, setFilter, open, back, sendReminder, markPaid };

})();
