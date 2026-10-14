/* ══════════════════════════════════════════════════════════════
   FlowGuard Ops — ASSETS
   Drainage infrastructure (canals, catch basins, culverts, pump
   stations…). Stored as properties with asset_class='drainage_asset',
   so detail reuses /properties/:id.
   Rules: whole row opens a FULL detail screen (no pop-up), no "View"
   button, every list column also appears in the detail.
   ══════════════════════════════════════════════════════════════ */
const OpsAssets = (function () {
  const canMng = () => !(window.Auth && Auth.can) || Auth.can('assets.manage');
  const __sid = v => String(v == null ? '' : v).replace(/[^A-Za-z0-9_\-.:]/g, '');
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  const dash = v => (v == null || v === '') ? '—' : v;
  const fmtDate = d => OpsModal.fmtDate(d);

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


  async function render(container) {
    _container = container;
    container.innerHTML = `

      ${OpsModal.pageHeader({title:'Assets',subtitle:'Drainage infrastructure, condition and linked monitoring devices',actions:canMng() ? '<button class="fg-action fg-action-primary" onclick="OpsAssets.add()">Register asset</button>' : ''})}
      <div class="lv-wrap">
        <div class="lv-toolbar">
          <div class="lv-search">
            ${OpsModal.actionIcon("search")}
            <input id="as-search" aria-label="Search assets" placeholder="Search assets…" oninput="OpsAssets.search(this.value)">
          </div>
          <div class="lv-filters" id="as-chips"></div>
          <div class="lv-toolbar-right">
          </div>
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
      _assets = OpsModal.readArray(aRes,'Asset directory').filter(a => a.asset_class === 'drainage_asset');
      _parents = OpsModal.readArray(pRes,'Estate directory');
      draw();
    } catch (err) {
      const el = document.getElementById('as-body');
      if (el) el.innerHTML = OpsModal.failure('Assets',err,"reloadTab('assets')",false);
    }
  }

  function catLabel(t) { const f = DRAINAGE_TYPES.find(d => d.value === t); return f ? f.label : OpsModal.label(t || 'unknown'); }
  function assetIcon(type) { return OpsSpatial.icon(OpsSpatial.assetKind(type)); }
  function reportedNodeCount(a) {
    if(Array.isArray(a.devices)) return a.devices.length;
    return OpsModal.count(a.node_count);
  }

  function draw() {
    const chipsEl = document.getElementById('as-chips');
    const linked = _assets.filter(a=>reportedNodeCount(a)>0).length;
    const noLinks = _assets.filter(a=>reportedNodeCount(a)===0).length;
    const unknown = _assets.filter(a=>reportedNodeCount(a)==null).length;
    const chips = [
      ['all', `All assets (${_assets.length})`],
      ['monitored', `Device links reported (${linked})`],
      ['unmonitored', `No device links reported (${noLinks})`],
      ['unknown', `Device links unavailable (${unknown})`],
    ];
    if (chipsEl) chipsEl.innerHTML = `<select class="um-filter" aria-label="Filter assets by reported device links" onchange="OpsAssets.setFilter(this.value)">${chips.map(([k, l]) => `<option value="${k}" ${_filter === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;

    let rows = _assets;
    if (_filter === 'monitored') rows = rows.filter(a => reportedNodeCount(a)>0);
    else if (_filter === 'unmonitored') rows = rows.filter(a => reportedNodeCount(a)===0);
    else if (_filter === 'unknown') rows = rows.filter(a => reportedNodeCount(a)==null);
    if (_term) rows = rows.filter(a => (a.asset_code || a.property_name || '').toLowerCase().includes(_term) || (a.parent_name || '').toLowerCase().includes(_term));
    _pg = FGPaginator.create(rows, { pageSize: 25, containerId: 'as-body' });
    _pg.render(renderTable);
  }
  let _term = '';
  function search(q) { _term = q.trim().toLowerCase(); draw(); }

  function renderTable(rows) {
    const el = document.getElementById('as-body');
    if (!el) return;
    if (!rows.length) {
      el.innerHTML = OpsModal.emptyState('',_term || _filter!=='all'?'No matching assets':'No assets returned',_term || _filter!=='all'?'Adjust the search or device-link filter to review other assets.':'No drainage assets were returned by this feed. Use Register asset to add a record.');
      return;
    }
    const initials = n => (n || '?').replace(/[^A-Za-z0-9 ]/g, '').split(/[\s-]+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const dc = '<span class="lv-dash">—</span>';
    el.innerHTML = `
      <div class="lv-scroll">
        <table class="lv-table fg-asset-registry">
          <thead><tr>
            <th scope="col">Asset / type</th><th scope="col">Estate</th>
            <th scope="col">Installed coverage</th><th scope="col">Recorded assessment</th><th scope="col">Inspection / maintenance</th>
          </tr></thead>
          <tbody>
            ${rows.map(a => {
              const propCell = a.parent_property_id ? OpsModal.link('properties', a.parent_property_id, a.parent_name || a.parent_property_id) : esc(a.parent_name || '—');
              return `
              <tr class="clickable" onclick="OpsAssets.open('${__sid(a.property_id)}')">
                <td>
                  <div class="lv-name-cell">
                    <div class="lv-avatar" style="background:var(--surface-3);color:var(--ink-2);border:1px solid var(--border);">${assetIcon(a.property_type)}</div>
                    <div style="min-width:0;">
                      <button type="button" class="record-link lv-name" onclick="event.stopPropagation();OpsAssets.open('${__sid(a.property_id)}')">${esc(a.property_name || a.asset_code || '—')}</button>
                      <span class="lv-source">${esc(a.asset_code || '')} · ${esc(catLabel(a.property_type))}</span>
                    </div>
                  </div>
                </td>
                <td>${propCell}</td>
                <td>${assetStatusPill(a)}</td>
                <td>${a.condition ? condPill(a.condition) : '<span class="lv-dash">Condition not assessed</span>'}<span class="lv-source">Risk: ${esc(a.risk_level ? OpsModal.label(a.risk_level) : 'Not assessed')}</span></td>
                <td>Inspected ${a.last_inspected_at ? fmtDate(a.last_inspected_at) : dc}<span class="lv-source">Maintenance ${a.next_maintenance ? fmtDate(a.next_maintenance) : dc}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function assetStatusPill(a) {
    const nodes=reportedNodeCount(a);
    return OpsModal.detailPill(nodes==null?'Device links unavailable':nodes===0?'No device links reported':`${nodes} linked devices reported`,'neutral');
  }
  function condPill(r) {
    if (!r) return '<span class="lv-dash">—</span>';
    return OpsModal.status(r,null,null,'condition');
  }

  function setFilter(f) { _filter = f; draw(); }
  function back() { if (_container) render(_container); }

  // ─────────────────────────────────────────────── FULL DETAIL SCREEN
  async function open(assetId) {
    if (!_container) return;
    _container.innerHTML = `<div style="padding:60px;text-align:center;color:var(--ink-3);"><div class="loading" style="margin:0 auto 12px;"></div>Loading asset…</div>`;
    try {
      const res = await OpsModal.apiGet('/properties/' + assetId);
      const a = OpsModal.readRecord(res,'Asset');
      renderDetail(a);
    } catch (err) {
      _container.innerHTML = OpsModal.recordFailure('Asset',err,`OpsAssets.open('${OpsModal.sid(assetId)}')`,'OpsAssets.back()');
    }
  }


  function renderDetail(a) {
    const pid = __sid(a.property_id);
    const inspections = Array.isArray(a.inspections) ? a.inspections : [];
    const devicesArr = Array.isArray(a.devices) ? a.devices : [];
    const ticketsArr = Array.isArray(a.tickets) ? a.tickets : [];
    const nodes = reportedNodeCount(a);
    const L = OpsModal.link, F = OpsModal.fact, E = OpsModal.emptyState;
    const condition = a.condition || (a.condition_score != null ? a.condition_score + '/10' : null);
    const rl = String(condition || '').toLowerCase();
    const condCls = OpsModal.statusTone(rl,'condition');
    const propLink = a.parent_property_id ? L('properties', a.parent_property_id, a.parent_name || a.parent_property_id) : esc(a.parent_name || '—');
    const clientLink = a.user_id ? L('clients', a.user_id, a.client_name || a.client_email || 'Client') : esc(a.client_name || '—');
    const initials = n => (n || '?').replace(/[^A-Za-z0-9 ]/g, '').split(/[\s-]+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const iBox=OpsModal.entityIcon('asset'),iDoc=OpsModal.entityIcon('document');

    const overview = `<div class="fg-facts-grid">${F('Asset code',esc(a.asset_code || 'Not supplied'))}${F('Client', clientLink)}${F('Serial number', esc(a.serial_number || 'Not supplied'))}${F('Warranty', a.warranty_until ? fmtDate(a.warranty_until) : '—')}${F('Last maintenance', a.last_maintenance ? fmtDate(a.last_maintenance) : '—')}${F('Next maintenance', a.next_maintenance ? fmtDate(a.next_maintenance) : '—')}</div>`;
    const capacity=OpsModal.reading(a.capacity_liters,0)===null ? OpsModal.missing.absent : Number(a.capacity_liters).toLocaleString()+' L';
    const dimension=v=>OpsModal.reading(v,0)===null ? OpsModal.missing.absent : Number(v).toLocaleString()+' m';
    const specs = `<div class="fg-facts-grid">${F('Recorded capacity',capacity)}${F('Length',dimension(a.length_m))}${F('Width',dimension(a.width_m))}${F('Depth',dimension(a.depth_m))}${F('Linked devices reported', nodes)}${F('Recorded flood risk', OpsModal.status(a.risk_level || 'unknown',null,null,'risk'))}</div><div class="capability-note">Capacity, dimensions and risk are registry values, not live hydraulic measurements. Construction material and type-specific operating limits are not supplied.</div>`;
    const topology=`<div class="fg-facts-grid">${F('Downstream asset',a.downstream_asset_id ? L('assets',a.downstream_asset_id,a.downstream_asset_id) : 'Not supplied')}${F('Receiving water body',esc(a.water_body_id || 'Not supplied'))}${F('Recorded coordinates',OpsModal.reading(a.latitude,-90,90)!==null && OpsModal.reading(a.longitude,-180,180)!==null ? esc(a.latitude+', '+a.longitude) : 'Not supplied')}</div><div class="capability-note">Recorded topology is not proof of a surveyed hydraulic connection. Review its source in Network.</div>`;

    const devicesBody = devicesArr.length
      ? `<table class="fgd-table"><thead><tr><th scope="col">Device</th><th scope="col">Device reference</th><th scope="col">Connectivity</th></tr></thead><tbody>${devicesArr.map(d => `<tr><td class="strong">${L('sensors', d.sensor_id, d.name || d.sensor_id)}</td><td class="fgd-mono">${esc(d.sensor_id)}</td><td>${OpsModal.status(d.device_state,null,null,'device')}</td></tr>`).join('')}</tbody></table>`
      : !Array.isArray(a.devices) ? '<div class="capability-note">Linked-device records unavailable. Missing records do not establish zero coverage.</div>' : E(iBox, 'No devices returned', 'No linked device records were returned. This does not establish physical installation or live coverage.');
    const workBody = ticketsArr.length
      ? `<table class="fgd-table"><thead><tr><th scope="col">Maintenance task</th><th scope="col">Type</th><th scope="col">Team</th><th scope="col">Status</th></tr></thead><tbody>${ticketsArr.map(t => `<tr><td class="strong">${L('maintenance', t.ticket_id, t.title || t.ticket_id)}</td><td>${esc(OpsModal.label(t.work_type || 'Not supplied'))}</td><td>${t.assigned_team ? L('teams', t.assigned_team, t.assigned_team) : 'Not assigned'}</td><td>${OpsModal.status(t.status,null,null,'maintenance')}</td></tr>`).join('')}</tbody></table>`
      : !Array.isArray(a.tickets) ? '<div class="capability-note">Linked maintenance records unavailable.</div>' : E(iBox, 'No maintenance tasks returned', 'No linked maintenance records were returned for this asset.');
    const maintBody = inspections.length
      ? `<table class="fgd-table"><thead><tr><th scope="col">Inspection</th><th scope="col">Status</th><th scope="col">Team</th><th scope="col">Score</th><th scope="col">Date</th></tr></thead><tbody>${inspections.map(i => `<tr><td class="strong fgd-mono">${esc(i.inspection_id)}</td><td>${OpsModal.status(i.status)}</td><td>${i.assigned_team ? L('teams', i.assigned_team, i.assigned_team) : '—'}</td><td class="fg-number">${i.drainage_condition_score != null ? esc(i.drainage_condition_score + '/10') : '—'}</td><td class="fg-number">${i.scheduled_date ? OpsModal.fmtDate(i.scheduled_date) : '—'}</td></tr>`).join('')}</tbody></table>`
      : !Array.isArray(a.inspections) ? '<div class="capability-note">Inspection history unavailable.</div>' : E(iDoc, 'No inspections returned', 'No inspection records were returned for this asset.');

    const sidebar = `
      <div class="fgd-card">
        <div class="fgd-card-head"><h2>Related records</h2></div>
        ${F('Devices returned', Array.isArray(a.devices) ? devicesArr.length : 'Unavailable')}
        ${F('Maintenance tasks returned', Array.isArray(a.tickets) ? ticketsArr.length : 'Unavailable')}
        ${F('Estate', propLink)}
      </div>`;

    _container.innerHTML = OpsModal.detailShell({
      back: 'OpsAssets.back()',
      crumbRoot: 'Assets',
      title: esc(a.property_name || a.asset_code || 'Asset'),
      avatar: { text: assetIcon(a.property_type) },
      chips: [
        { cls: 'neutral', label: nodes == null ? 'Device links unavailable' : `${nodes} linked devices reported`, dot: true },
        condition ? { cls: condCls, label: esc(OpsModal.label(condition)) + ' condition' } : null,
      ].filter(Boolean),
      meta: [['Category', esc(catLabel(a.property_type))], ['Estate', propLink], ['Zone', esc(a.zone || 'Not supplied')]],
      decision:[['Condition',condition?OpsModal.label(condition):'Not assessed'],['Last inspection',a.last_inspected_at?fmtDate(a.last_inspected_at):'Not supplied'],['Next step',['caution','danger'].includes(condCls)?'Review condition and plan field inspection':!condition?'Assess physical condition':nodes==null?'Confirm monitoring coverage':'Review condition and reading freshness']],
      actions: `<button class="fg-action" onclick="OpsNetwork.viewRecord('${OpsModal.sid(a.property_id)}')">Locate on network</button>`,
      sections: [
        { id: 'overview', title: 'Overview', body: overview },
        { id: 'topology', title: 'Location & topology', body: topology },
        { id: 'specs', title: 'Specifications', body: specs },
        { id: 'devices', title: 'Devices', body: Array.isArray(a.devices) ? devicesBody : '<div class="capability-note">Linked device records were not supplied. Installed coverage does not confirm live health.</div>' },
        { id: 'work', title: 'Maintenance tasks', body: workBody },
        { id: 'maintenance', title: 'Maintenance history', body: Array.isArray(a.inspections) ? maintBody : '<div class="capability-note">Inspection history was not supplied.</div>' },
        { id: 'documents', title: 'Documents', body: OpsModal.evidence(a.documents) },
      ],
      sidebar,
    });
  }

  // ─────────────────────────────────────────────── REGISTER (action)
  function add() {
    OpsModal.open('Register a drainage asset', `
      <p style="margin:0 0 14px;font-size:var(--fs-base);color:var(--ink-3);line-height:1.5">Assets are drainage infrastructure—a canal, catch basin or pump station. Link the estate they serve, or register standalone infrastructure.</p>
      ${OpsModal.field('Asset name', 'property_name', 'text', '', { placeholder: 'e.g. Canal 7' })}
      ${OpsModal.field('Asset code', 'asset_code', 'text', '', { required: false, placeholder: 'e.g. CB-12' })}
      ${OpsModal.field('Type', 'property_type', 'select', 'catch_basin', { options: DRAINAGE_TYPES })}
      ${OpsModal.field('Estate served', 'parent_property_id', 'select', '', { options: [{ value: '', label: 'None—standalone infrastructure' }].concat(_parents.map(p => ({ value: p.property_id, label: p.property_name }))) })}
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

  return { render, setFilter, search, add, confirmAdd, open, back };
})();
