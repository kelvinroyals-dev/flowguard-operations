/* ══════════════════════════════════════════════════════════════
   FlowGuard Ops — ASSETS
   Drainage infrastructure (canals, catch basins, culverts, pump
   stations…). Stored as properties with asset_class='drainage_asset',
   so detail reuses /properties/:id.
   Rules: whole row opens a FULL detail screen (no pop-up), no "View"
   button, every list column also appears in the detail.
   ══════════════════════════════════════════════════════════════ */
const OpsAssets = (function () {
  const __sid = v => String(v == null ? '' : v).replace(/[^A-Za-z0-9_\-.:]/g, '');
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  const dash = v => (v == null || v === '') ? '—' : v;
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  let _assets = [];
  let _parents = [];
  let _filter = 'all';
  let _pg = null;
  let _container = null;

  const DRAINAGE_TYPES = [
    { value: 'primary_canal', label: 'Primary canal' }, { value: 'secondary_drain', label: 'Secondary drain' },
    { value: 'box_culvert', label: 'Box culvert' }, { value: 'storm_drain', label: 'Storm drain' },
    { value: 'catch_basin', label: 'Catch basin' }, { value: 'manhole', label: 'Manhole' },
    { value: 'retention_pond', label: 'Retention pond' }, { value: 'pump_station', label: 'Pump station' },
    { value: 'flood_gate', label: 'Flood gate' }, { value: 'overflow_chamber', label: 'Overflow chamber' },
    { value: 'detention_tank', label: 'Detention tank' }, { value: 'outfall', label: 'Outfall' },
  ];

  const SHARED_CSS = `
    <style>
      .as-table-card { background:var(--surface,#fff); border:1px solid var(--border); border-radius:var(--r,14px); overflow:hidden; box-shadow:var(--sh-xs); }
      .as-table-head { padding:14px 20px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
      .as-controls { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
      .as-chip { padding:6px 13px; border-radius:100px; border:1px solid var(--border-2); background:var(--surface); font-size:var(--fs-xs); font-weight:600; color:var(--ink-2); cursor:pointer; user-select:none; }
      .as-chip.on { background:var(--neon-trace); border-color:var(--blue-dim); color:var(--blue-hi); }
      .as-add { padding:8px 15px; border-radius:9px; border:1px solid var(--blue-dim); background:var(--neon-trace); color:var(--blue-hi); font-size:var(--fs-sm); font-weight:700; font-family:var(--ff-b); cursor:pointer; }
      .ops-table tbody tr.clickable { cursor:pointer; transition:background .12s; }
      .ops-table tbody tr.clickable:hover { background:var(--surface-2,#f2f8fb); }
      .as-back { display:inline-flex; align-items:center; gap:6px; font-size:var(--fs-sm); font-weight:600; color:var(--ink-2); background:var(--surface-2); border:1px solid var(--border); border-radius:9px; padding:8px 13px; cursor:pointer; }
      .as-detail-top { display:flex; align-items:center; gap:14px; margin-bottom:18px; flex-wrap:wrap; }
      .as-detail-name { font-family:var(--ff-d); font-size:var(--fs-xl); font-weight:700; color:var(--ink); line-height:1.1; }
      .as-detail-meta { font-size:var(--fs-sm); color:var(--ink-3); margin-top:3px; }
      .as-detail-actions { margin-left:auto; display:flex; gap:8px; }
      .as-section { background:var(--surface); border:1px solid var(--border); border-radius:var(--r,14px); box-shadow:var(--sh-xs); margin-bottom:14px; overflow:hidden; }
      .as-section-h { padding:12px 18px; border-bottom:1px solid var(--border); font-family:var(--ff-d); font-size:var(--fs-sm); font-weight:700; letter-spacing:.4px; color:var(--ink); display:flex; align-items:center; justify-content:space-between; }
      .as-section-b { padding:16px 18px; }
      .as-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:14px 22px; }
      .as-field .k { font-size:var(--fs-2xs); font-weight:700; letter-spacing:.9px; text-transform:uppercase; color:var(--ink-3); }
      .as-field .v { font-size:var(--fs-md); color:var(--ink); font-weight:600; margin-top:3px; }
      .as-empty { color:var(--ink-3); font-size:var(--fs-sm); padding:6px 0; }
      .as-needs { font-size:var(--fs-xs); color:var(--ink-4); font-style:italic; }
    </style>`;

  async function render(container) {
    _container = container;
    container.innerHTML = `
      ${SHARED_CSS}
      <div class="fg-page-header">
        <div>
          <div class="fg-page-title">Assets</div>
          <div class="fg-page-sub">The drainage infrastructure your Sentinels monitor and your crews maintain</div>
        </div>
      </div>
      <div class="as-table-card">
        <div class="as-table-head">
          <div class="as-controls" id="as-chips"></div>
          <button class="as-add" onclick="OpsAssets.add()">+ Register asset</button>
        </div>
        <div id="as-body"><div style="padding:44px;text-align:center;color:var(--ink-3);"><div class="loading" style="margin:0 auto 12px;"></div>Loading assets…</div></div>
      </div>`;
    await load();
  }

  async function load() {
    try {
      const [aRes, pRes] = await Promise.all([
        OpsModal.apiGet('/properties/assets'),
        OpsModal.apiGet('/properties'),
      ]);
      _assets = (aRes.data || []).filter(a => a.asset_class === 'drainage_asset');
      _parents = pRes.data || [];
      draw();
    } catch (err) {
      const el = document.getElementById('as-body');
      if (el) el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--ink-3);">Couldn't load assets — ${esc(err.message || 'network error')}.</div>`;
    }
  }

  function catLabel(t) { const f = DRAINAGE_TYPES.find(d => d.value === t); return f ? f.label : (t || '').replace(/_/g, ' ') || '—'; }
  function condBadge(r) { if (!r) return '<span style="color:var(--ink-4);">—</span>'; const m = { low: 'nominal', moderate: 'watch', high: 'warning', critical: 'critical' }; return `<span class="status-badge ${m[r] || 'offline'}">${r}</span>`; }
  function statusOf(a) { return Number(a.node_count) > 0 ? '<span class="status-badge nominal">Monitored</span>' : '<span class="status-badge watch">No Sentinel</span>'; }

  function draw() {
    const chipsEl = document.getElementById('as-chips');
    const unmonitored = _assets.filter(a => !Number(a.node_count)).length;
    const chips = [
      ['all', `All assets (${_assets.length})`],
      ['monitored', `Monitored (${_assets.length - unmonitored})`],
      ['unmonitored', `No Sentinel (${unmonitored})`],
    ];
    if (chipsEl) chipsEl.innerHTML = chips.map(([k, l]) => `<span class="as-chip ${_filter === k ? 'on' : ''}" onclick="OpsAssets.setFilter('${__sid(k)}')">${l}</span>`).join('');

    let rows = _assets;
    if (_filter === 'monitored') rows = rows.filter(a => Number(a.node_count) > 0);
    else if (_filter === 'unmonitored') rows = rows.filter(a => !Number(a.node_count));
    _pg = FGPaginator.create(rows, { pageSize: 25, containerId: 'as-body' });
    _pg.render(renderTable);
  }

  function renderTable(rows) {
    const el = document.getElementById('as-body');
    if (!el) return;
    if (!rows.length) {
      el.innerHTML = `<div style="padding:44px;text-align:center;color:var(--ink-3);line-height:1.6;">${_assets.length ? 'No assets match this filter.' : 'No drainage assets registered yet.<br><button class="as-add" style="margin-top:12px;" onclick="OpsAssets.add()">+ Register the first asset</button>'}</div>`;
      return;
    }
    // Columns per spec: Asset Name, Category, Property, Serial Number, Status, Condition, Warranty, Last Maintenance, Next Maintenance
    el.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="ops-table">
          <thead><tr>
            <th>Asset Name</th><th>Category</th><th>Property</th><th>Serial Number</th>
            <th>Status</th><th>Condition</th><th>Warranty</th><th>Last Maintenance</th><th>Next Maintenance</th>
          </tr></thead>
          <tbody>
            ${rows.map(a => `
              <tr class="clickable" onclick="OpsAssets.open('${__sid(a.property_id)}')" tabindex="0" onkeydown="if(event.key==='Enter'){OpsAssets.open('${__sid(a.property_id)}')}">
                <td class="bright">${esc(a.asset_code || a.property_name || '—')}</td>
                <td style="font-size:var(--fs-sm);">${esc(catLabel(a.property_type))}</td>
                <td class="trunc" style="max-width:170px;font-size:var(--fs-sm);" title="${esc(a.parent_name || '')}">${esc(a.parent_name || '—')}</td>
                <td class="num" style="font-size:var(--fs-sm);">${dash(a.serial_number || a.asset_code)}</td>
                <td>${statusOf(a)}</td>
                <td>${condBadge(a.risk_level)}</td>
                <td style="font-size:var(--fs-sm);color:var(--ink-4);">${dash(a.warranty_until && fmtDate(a.warranty_until))}</td>
                <td style="font-size:var(--fs-sm);color:var(--ink-4);">${dash(a.last_maintenance && fmtDate(a.last_maintenance))}</td>
                <td style="font-size:var(--fs-sm);color:var(--ink-4);">${dash(a.next_maintenance && fmtDate(a.next_maintenance))}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function setFilter(f) { _filter = f; draw(); }
  function back() { if (_container) render(_container); }

  // ─────────────────────────────────────────────── FULL DETAIL SCREEN
  async function open(assetId) {
    if (!_container) return;
    _container.innerHTML = `${SHARED_CSS}<div style="padding:60px;text-align:center;color:var(--ink-3);"><div class="loading" style="margin:0 auto 12px;"></div>Loading asset…</div>`;
    try {
      const res = await OpsModal.apiGet('/properties/' + assetId);
      const a = res.data;
      if (!a) { OpsModal.toast('Asset not found', 'warning'); back(); return; }
      renderDetail(a);
    } catch (err) {
      _container.innerHTML = `${SHARED_CSS}<div style="padding:48px;text-align:center;"><div style="color:var(--err);font-weight:700;margin-bottom:8px;">Failed to load asset</div><button class="as-back" onclick="OpsAssets.back()">← Back to Assets</button></div>`;
    }
  }

  function section(title, body, needs) {
    return `<div class="as-section"><div class="as-section-h">${title}${needs ? '<span class="as-needs">pending backend data</span>' : ''}</div><div class="as-section-b">${body}</div></div>`;
  }

  function renderDetail(a) {
    const pid = __sid(a.property_id);
    const inspections = a.inspections || [];
    const nodes = Number(a.node_count) || 0;
    const field = (k, v) => `<div class="as-field"><div class="k">${k}</div><div class="v">${v}</div></div>`;

    const overview = `<div class="as-grid">
      ${field('Asset Name', esc(a.asset_code || a.property_name || '—'))}
      ${field('Category', esc(catLabel(a.property_type)))}
      ${field('Property', esc(a.parent_name || '—'))}
      ${field('Serial Number', dash(a.serial_number || a.asset_code))}
      ${field('Status', statusOf(a))}
      ${field('Condition', condBadge(a.risk_level))}
      ${field('Warranty', dash(a.warranty_until && fmtDate(a.warranty_until)))}
      ${field('Last Maintenance', dash(a.last_maintenance && fmtDate(a.last_maintenance)))}
      ${field('Next Maintenance', dash(a.next_maintenance && fmtDate(a.next_maintenance)))}
    </div>`;

    const specs = `<div class="as-grid">
      ${field('Type', esc(catLabel(a.property_type)))}
      ${field('Capacity', a.capacity_liters ? Number(a.capacity_liters).toLocaleString() + ' L' : '—')}
      ${field('Risk level', condBadge(a.risk_level))}
      ${field('Sentinels', nodes)}
    </div>`;

    const maintenance = inspections.length ? `
      <div style="overflow-x:auto;"><table class="ops-table"><thead><tr><th>ID</th><th>Status</th><th>Date</th><th>Team</th><th>Score</th></tr></thead>
      <tbody>${inspections.map(i => `<tr><td style="font-family:var(--ff-m);font-size:var(--fs-sm);">${i.inspection_id}</td><td><span class="status-badge ${i.status === 'completed' ? 'nominal' : 'watch'}">${i.status}</span></td><td style="font-size:var(--fs-sm);">${i.scheduled_date ? new Date(i.scheduled_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</td><td style="font-size:var(--fs-sm);">${i.assigned_team || '—'}</td><td style="font-family:var(--ff-d);font-weight:700;">${i.drainage_condition_score ? i.drainage_condition_score + '/10' : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="as-empty">No maintenance history yet.</div>';

    const relatedDevices = `<div class="as-field"><div class="k">Sentinels monitoring this asset</div><div class="v">${nodes}</div></div><div style="margin-top:10px;"><a class="btn-ghost" style="text-decoration:none;padding:7px 12px;" onclick="OpsNetwork.open('${__sid(a.parent_property_id || a.property_id)}')">Open on network view →</a></div>`;

    _container.innerHTML = `
      ${SHARED_CSS}
      <div class="as-detail-top">
        <button class="as-back" onclick="OpsAssets.back()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>Assets</button>
        <div>
          <div class="as-detail-name">${esc(a.asset_code || a.property_name || 'Asset')}</div>
          <div class="as-detail-meta">${esc(catLabel(a.property_type))} · ${esc(a.parent_name || 'Standalone')}</div>
        </div>
        <div class="as-detail-actions"><button class="btn-ghost" onclick="OpsNetwork.open('${pid}')">Network</button></div>
      </div>
      ${section('Asset Overview', overview)}
      ${section('Specifications', specs)}
      ${section('Maintenance History', maintenance)}
      ${section('Documents', '<div class="as-empty">No documents uploaded.</div>', true)}
      ${section('Photos', '<div class="as-empty">No photos uploaded.</div>', true)}
      ${section('Related Devices', relatedDevices)}
      ${section('Related Work Orders', '<div class="as-empty">No work orders linked in this response.</div>', true)}
    `;
  }

  // ─────────────────────────────────────────────── REGISTER (action)
  function add() {
    OpsModal.open('Register a drainage asset', `
      <p style="margin:0 0 14px;font-size:var(--fs-base);color:var(--ink-3);line-height:1.5">Assets are the infrastructure itself — a canal, a catch basin, a pump station. They sit under the customer property they serve.</p>
      ${OpsModal.field('Asset name', 'property_name', 'text', '', { placeholder: 'e.g. Canal 7' })}
      ${OpsModal.field('Asset code', 'asset_code', 'text', '', { required: false, placeholder: 'e.g. CB-12' })}
      ${OpsModal.field('Type', 'property_type', 'select', 'catch_basin', { options: DRAINAGE_TYPES })}
      ${OpsModal.field('Serves which property', 'parent_property_id', 'select', '', { options: [{ value: '', label: '— None (standalone infrastructure) —' }].concat(_parents.map(p => ({ value: p.property_id, label: p.property_name }))) })}
      ${OpsModal.row([
        OpsModal.field('Capacity (litres)', 'capacity_liters', 'number', '', { required: false }),
        OpsModal.field('Risk level', 'risk_level', 'select', '', { required: false, options: [{ value: '', label: '— Not assessed —' }, { value: 'low', label: 'Low' }, { value: 'moderate', label: 'Moderate' }, { value: 'high', label: 'High' }, { value: 'critical', label: 'Critical' }] }),
      ])}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: 'Register asset', primary: true, onclick: 'OpsAssets.confirmAdd()' },
    ]);
  }

  async function confirmAdd() {
    const f = OpsModal.getFormData();
    if (!f.property_name) { OpsModal.toast('Give the asset a name', 'error'); return; }
    OpsModal.setLoading(true);
    try {
      await OpsModal.apiPost('/properties/assets', {
        property_name: f.property_name, asset_code: f.asset_code || null, property_type: f.property_type,
        parent_property_id: f.parent_property_id || null,
        capacity_liters: f.capacity_liters ? parseInt(f.capacity_liters, 10) : null,
        risk_level: f.risk_level || null,
      });
      OpsModal.close();
      OpsModal.toast('Asset registered.', 'success');
      await load();
    } catch (err) {
      OpsModal.setLoading(false);
      OpsModal.toast(err.message || 'Failed to register asset', 'error');
    }
  }

  return { render, setFilter, add, confirmAdd, open, back };
})();
