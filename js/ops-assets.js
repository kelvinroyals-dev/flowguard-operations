/* ══════════════════════════════════════════════════════════════
   FlowGuard Ops — ASSETS
   The drainage network: canals, catch basins, culverts, pump stations,
   manholes, retention ponds. The things that flood. The things a
   Sentinel is bolted to. Grouped under the customer property they serve.
   ══════════════════════════════════════════════════════════════ */
const OpsAssets = (function () {
  // identifiers embedded in inline handlers: restrict to a safe charset.
  // HTML-escaping does NOT protect here — the browser decodes entities before
  // parsing the JS, so a quote can still break out of the string.
  const __sid = v => String(v == null ? '' : v).replace(/[^A-Za-z0-9_\-.:]/g, '');

  let _assets = [];
  let _parents = [];
  let _filter = 'all';

  const DRAINAGE_TYPES = [
    { value: 'primary_canal',     label: 'Primary canal' },
    { value: 'secondary_drain',   label: 'Secondary drain' },
    { value: 'box_culvert',       label: 'Box culvert' },
    { value: 'storm_drain',       label: 'Storm drain' },
    { value: 'catch_basin',       label: 'Catch basin' },
    { value: 'manhole',           label: 'Manhole' },
    { value: 'retention_pond',    label: 'Retention pond' },
    { value: 'pump_station',      label: 'Pump station' },
    { value: 'flood_gate',        label: 'Flood gate' },
    { value: 'overflow_chamber',  label: 'Overflow chamber' },
    { value: 'detention_tank',    label: 'Detention tank' },
    { value: 'outfall',           label: 'Outfall' },
  ];

  const ICONS = {
    primary_canal:    '<path d="M2 12h20M2 7c4 0 4 10 8 10s4-10 8-10 4 10 4 10"/>',
    secondary_drain:  '<path d="M4 6h16M6 10h12M8 14h8M10 18h4"/>',
    box_culvert:      '<rect x="3" y="7" width="18" height="10" rx="1"/><path d="M3 12h18"/>',
    storm_drain:      '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9v6M12 9v6M16 9v6"/>',
    catch_basin:      '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h10"/>',
    manhole:          '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
    retention_pond:   '<path d="M3 14c3-4 6-4 9 0s6 4 9 0"/><path d="M3 18c3-4 6-4 9 0s6 4 9 0"/><circle cx="12" cy="6" r="2"/>',
    pump_station:     '<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M9 9V6a3 3 0 016 0v3M12 13v3"/>',
    flood_gate:       '<path d="M4 4v16M20 4v16M4 8h16M4 14h16"/>',
    overflow_chamber: '<path d="M5 4h14v9a7 7 0 01-14 0z"/><path d="M9 8h6"/>',
    detention_tank:   '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/>',
    outfall:          '<path d="M4 8h9a5 5 0 015 5v7"/><path d="M4 5v6M14 17l4 4 4-4"/>',
  };

  async function render(container) {
    container.innerHTML = `
      <style>
        .as-head { display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
        .as-chip { padding:6px 13px; border-radius:100px; border:1px solid var(--border-2); background:var(--surface); font-size:.68rem; font-weight:600; color:var(--ink-2); cursor:pointer; user-select:none; }
        .as-chip.on { background:var(--neon-trace); border-color:var(--blue-dim); color:var(--blue-hi); }
        .as-add { margin-left:auto; padding:8px 15px; border-radius:9px; border:1px solid var(--blue-dim); background:var(--neon-trace); color:var(--blue-hi); font-size:.74rem; font-weight:700; font-family:var(--ff-b); cursor:pointer; }
        .as-add:hover { background:var(--blue-dim); color:var(--ink); }

        .as-group { margin-bottom:18px; }
        .as-group-h { display:flex; align-items:center; gap:9px; margin-bottom:9px; }
        .as-group-h b { font-size:.8rem; font-weight:700; color:var(--ink); }
        .as-group-h span { font-size:.66rem; color:var(--ink-3); }
        .as-group-h .line { flex:1; height:1px; background:var(--border); }

        .as-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:10px; }
        .ast:hover { border-color:var(--blue-dim); }
        .ast { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:13px 14px; box-shadow:var(--sh-xs); display:flex; gap:11px; align-items:flex-start; }
        .ast-ic { width:34px; height:34px; border-radius:9px; display:grid; place-items:center; flex-shrink:0; background:var(--neon-trace); color:var(--blue-hi); }
        .ast-ic svg { width:17px; height:17px; }
        .ast-b { flex:1; min-width:0; }
        .ast-n { font-size:.79rem; font-weight:700; color:var(--ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .ast-t { font-size:.64rem; color:var(--ink-3); margin-top:2px; }
        .ast-m { display:flex; gap:8px; margin-top:7px; flex-wrap:wrap; }
        .ast-tag { font-size:.6rem; padding:2px 7px; border-radius:5px; background:var(--surface-3); color:var(--ink-2); white-space:nowrap; }
        .ast-tag.nodes { background:var(--ok-bg); color:var(--ok); }
        .ast-tag.none  { background:var(--wb); color:var(--warn); }
        .ast-tag.risk-high, .ast-tag.risk-critical { background:var(--eb); color:var(--err); }
        .ast-tag.risk-moderate { background:var(--wb); color:var(--warn); }

        .as-empty { padding:44px; text-align:center; color:var(--ink-3); font-size:.8rem; background:var(--surface); border:1px solid var(--border); border-radius:14px; line-height:1.6; }
      </style>
      <div class="as-head" id="as-head"></div>
      <div id="as-body"><div class="as-empty">Loading the drainage network…</div></div>
    `;
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
      if (el) el.innerHTML = `<div class="as-empty">Couldn't load assets — ${esc(err.message || 'network error')}.</div>`;
    }
  }

  function draw() {
    const el = document.getElementById('as-body');
    const hd = document.getElementById('as-head');
    if (!el) return;

    const unmonitored = _assets.filter(a => !a.node_count || a.node_count === '0').length;
    const chips = [
      ['all', `All assets (${_assets.length})`],
      ['monitored', `Monitored (${_assets.length - unmonitored})`],
      ['unmonitored', `No Sentinel (${unmonitored})`],
    ];
    hd.innerHTML = chips.map(([k, l]) =>
      `<span class="as-chip ${_filter === k ? 'on' : ''}" onclick="OpsAssets.setFilter('${__sid(k)}')">${l}</span>`).join('')
      + `<button class="as-add" onclick="OpsAssets.add()">+ Register asset</button>`;

    let rows = _assets;
    if (_filter === 'monitored') rows = rows.filter(a => Number(a.node_count) > 0);
    else if (_filter === 'unmonitored') rows = rows.filter(a => !Number(a.node_count));

    if (!rows.length) {
      el.innerHTML = `<div class="as-empty">
        ${_assets.length
          ? 'No assets match this filter.'
          : 'No drainage assets registered yet.<br>Canals, catch basins, culverts and pump stations live here — the infrastructure your Sentinels monitor and your crews maintain.<br><br><button class="as-add" style="margin:0" onclick="OpsAssets.add()">+ Register the first asset</button>'}
      </div>`;
      return;
    }

    // group by the customer property each asset serves
    const groups = {};
    rows.forEach(a => {
      const k = a.parent_property_id || '__none__';
      (groups[k] = groups[k] || { name: a.parent_name || 'Unassigned to a property', items: [] }).items.push(a);
    });

    el.innerHTML = Object.entries(groups).map(([k, g]) => `
      <div class="as-group">
        <div class="as-group-h">
          <b>${esc(g.name)}</b>
          <span>${g.items.length} asset${g.items.length > 1 ? 's' : ''}</span>
          <span class="line"></span>
        </div>
        <div class="as-grid">${g.items.map(cardFor).join('')}</div>
      </div>`).join('');
  }

  function cardFor(a) {
    const icon = ICONS[a.property_type] || ICONS.catch_basin;
    const nodes = Number(a.node_count) || 0;
    return `
      <div class="ast" ${a.parent_property_id ? `onclick="OpsNetwork.open('${__sid(a.parent_property_id)}')" style="cursor:pointer"` : ''}>
        <div class="ast-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></div>
        <div class="ast-b">
          <div class="ast-n">${esc(a.asset_code || a.property_name)}</div>
          <div class="ast-t">${(a.property_type || '').replace(/_/g, ' ')}</div>
          <div class="ast-m">
            <span class="ast-tag ${nodes ? 'nodes' : 'none'}">${nodes ? `${nodes} Sentinel${nodes > 1 ? 's' : ''}` : 'No Sentinel'}</span>
            ${a.risk_level ? `<span class="ast-tag risk-${a.risk_level}">${a.risk_level} risk</span>` : ''}
            ${a.capacity_liters ? `<span class="ast-tag">${Number(a.capacity_liters).toLocaleString()} L</span>` : ''}
          </div>
        </div>
      </div>`;
  }

  function add() {
    OpsModal.open('Register a drainage asset', `
      <p style="margin:0 0 14px;font-size:.8rem;color:var(--ink-3);line-height:1.5">
        Assets are the infrastructure itself — a canal, a catch basin, a pump station. They sit under
        the customer property they serve, and a Sentinel is assigned to monitor them.
      </p>
      ${OpsModal.field('Asset name', 'property_name', 'text', '', { placeholder: 'e.g. Canal 7' })}
      ${OpsModal.field('Asset code', 'asset_code', 'text', '', { required: false, placeholder: 'e.g. CB-12' })}
      ${OpsModal.field('Type', 'property_type', 'select', 'catch_basin', { options: DRAINAGE_TYPES })}
      ${OpsModal.field('Serves which property', 'parent_property_id', 'select', '', {
        options: [{ value: '', label: '— None (standalone infrastructure) —' }].concat(
          _parents.map(p => ({ value: p.property_id, label: p.property_name }))) })}
      ${OpsModal.row([
        OpsModal.field('Capacity (litres)', 'capacity_liters', 'number', '', { required: false }),
        OpsModal.field('Risk level', 'risk_level', 'select', '', { required: false, options: [
          { value: '', label: '— Not assessed —' },
          { value: 'low', label: 'Low' }, { value: 'moderate', label: 'Moderate' },
          { value: 'high', label: 'High' }, { value: 'critical', label: 'Critical' },
        ]}),
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
        property_name: f.property_name,
        asset_code: f.asset_code || null,
        property_type: f.property_type,
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

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function setFilter(f) { _filter = f; draw(); }

  return { render, setFilter, add, confirmAdd };
})();
