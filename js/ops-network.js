/* ══════════════════════════════════════════════════════════════
   FlowGuard Ops — NETWORK (digital twin of the drainage system)
   Structure, not events: assets + topology, outfalls, water bodies,
   zones, and upstream/downstream tracing. Data: /network/graph.
   Network = structure · Situation = events · Overview = health · AI = prediction.
   ══════════════════════════════════════════════════════════════ */
const OpsNetwork = (function () {
  'use strict';

  const esc = s => (window.OpsModal && OpsModal.escape) ? OpsModal.escape(s) : String(s == null ? '' : s);
  const api = p => OpsModal.apiGet(p);
  let _root = null, _g = null, _md = null, map = null, baseTiles = null;
  let _layers = {}, _links = null, _traceLayer = null, _view = 'map', _sel = null;

  // property_type → layer group + label + icon
  const TYPE = {
    primary_canal:   { grp: 'primary',   label: 'Primary drain' },
    pump_station:    { grp: 'structure', label: 'Pump station' },
    flood_gate:      { grp: 'structure', label: 'Flood gate' },
    overflow_chamber:{ grp: 'structure', label: 'Overflow chamber' },
    detention_tank:  { grp: 'structure', label: 'Detention tank' },
    retention_pond:  { grp: 'structure', label: 'Retention pond' },
    secondary_drain: { grp: 'secondary', label: 'Secondary drain' },
    storm_drain:     { grp: 'secondary', label: 'Storm drain' },
    box_culvert:     { grp: 'culvert',   label: 'Culvert' },
    catch_basin:     { grp: 'tertiary',  label: 'Catch basin' },
    manhole:         { grp: 'tertiary',  label: 'Manhole' },
    outfall:         { grp: 'outfall',   label: 'Outfall' },
  };
  const typeInfo = t => TYPE[t] || { grp: 'secondary', label: (t || 'asset').replace(/_/g, ' ') };
  const condColor = c => ({ Good: '#1f9d5b', Fair: '#e0a012', Poor: '#e8720e', Critical: '#d9463c' }[c] || '#7d8fa3');
  const riskColor = r => ({ low: '#1f9d5b', moderate: '#e0a012', medium: '#e0a012', high: '#d9463c', critical: '#a11313' }[(r || '').toLowerCase()] || '#7d8fa3');
  const GRP_COLOR = { primary: '#16a8d3', secondary: '#22c3e6', tertiary: '#7c6cf0', culvert: '#e0a012', structure: '#8aa2ae', outfall: '#d9463c', property: '#0d7fa0', sensor: '#16b364', waterbody: '#2563eb' };
  // Per-type glyphs (all rendered at the same badge size, distinct colours)
  const GLYPH = {
    property:  '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M9.5 20v-5h5v5"/>',
    primary:   '<path d="M2 8c2.5 2 4.5-2 7 0s4.5-2 7 0 4.5-2 6 0"/><path d="M2 14c2.5 2 4.5-2 7 0s4.5-2 7 0 4.5-2 6 0"/>',
    secondary: '<path d="M2 9c2.5 2 4.5-2 7 0s4.5-2 7 0 4.5-2 6 0"/><path d="M2 15c2.5 2 4.5-2 7 0s4.5-2 7 0 4.5-2 6 0"/>',
    tertiary:  '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/>',
    culvert:   '<path d="M4 20V12a8 8 0 0 1 16 0v8"/><path d="M4 20h16"/><path d="M9 20v-8M15 20v-8"/>',
    structure: '<rect x="5" y="4" width="14" height="16" rx="1"/><path d="M9 8h.01M12 8h.01M15 8h.01M9 12h.01M12 12h.01M15 12h.01"/>',
    outfall:   '<path d="M3 12h11"/><path d="M10 7l5 5-5 5"/><path d="M20 5v14"/>',
    sensor:    '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
    waterbody: '<path d="M12 3s6 6.5 6 10.5a6 6 0 1 1-12 0C6 9.5 12 3 12 3z"/>',
  };
  function pin(kind, color, opts) {
    opts = opts || {};
    const S = 30; // uniform badge size for every marker
    const glyph = GLYPH[kind] || GLYPH.secondary;
    const ring = opts.attention ? `box-shadow:0 0 0 3px ${color}55,0 1px 5px rgba(10,42,61,.5);` : 'box-shadow:0 1px 5px rgba(10,42,61,.45);';
    return L.divIcon({ className: 'nw-pin', iconSize: [S, S], iconAnchor: [S / 2, S / 2],
      html: `<div style="width:${S}px;height:${S}px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,.92);${ring}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg></div>` });
  }
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  // ── map libs ──
  function loadLeaflet() {
    return new Promise(resolve => {
      const css = (h, id) => { if (id && document.getElementById(id)) return; const c = document.createElement('link'); if (id) c.id = id; c.rel = 'stylesheet'; c.href = h; document.head.appendChild(c); };
      const js = s => new Promise(r => { const el = document.createElement('script'); el.src = s; el.onload = r; el.onerror = r; document.head.appendChild(el); });
      css('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'fg-leaflet-css');
      css('https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css', 'fg-maplibre-css');
      const pre = [];
      if (!window.L) pre.push(js('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'));
      if (!window.maplibregl) pre.push(js('https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'));
      Promise.all(pre).then(() => { if (window.L && window.L.maplibreGL) return resolve(); js('https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.0.22/leaflet-maplibre-gl.js').then(resolve); });
    });
  }
  const dark = () => document.documentElement.getAttribute('data-theme') === 'dark';
  const styleUrl = () => dark() ? 'https://tiles.openfreemap.org/styles/dark' : 'https://tiles.openfreemap.org/styles/positron';
  function marker(color, size, ring) {
    const s = size || 12;
    return L.divIcon({ className: '', iconSize: [s, s], iconAnchor: [s / 2, s / 2],
      html: `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,.9);box-shadow:0 1px 4px rgba(10,42,61,.4);${ring ? `outline:3px solid ${color}55;` : ''}"></div>` });
  }

  // ════════════ render ════════════
  function render(container) {
    _root = container;
    if (!document.getElementById('nw-css')) { const st = document.createElement('style'); st.id = 'nw-css'; st.textContent = STYLES; document.head.appendChild(st); }
    container.innerHTML = `<div class="nw"><div class="nw-load">Building the network model…</div></div>`;
    load();
  }

  async function load() {
    try {
      const [gRes, mdRes] = await Promise.all([
        api('/network/graph'),
        api('/analytics/map-data').catch(() => ({ data: {} })),
      ]);
      _g = gRes.data || {}; _md = mdRes.data || {};
      _byId = {}; (_g.assets || []).forEach(a => { _byId[a.property_id] = a; });
      (_g.properties || []).forEach(p => { _byId[p.property_id] = p; });
      _wbId = {}; (_g.water_bodies || []).forEach(w => { _wbId[w.water_body_id] = w; });
      paint();
      await loadLeaflet(); initMap();
    } catch (err) {
      _root.innerHTML = `<div class="nw"><div class="nw-load" style="color:var(--err);">Couldn't load the network — ${esc(err.message || 'error')}.<br><button class="nw-btn" style="margin-top:12px;" onclick="reloadTab('network')">Retry</button></div></div>`;
    }
  }

  let _byId = {}, _wbId = {}, _snById = {}, _filter = null, _devSel = null;

  function paint() {
    const s = _g.summary || {};
    const kpi = (key, label, value) => `<div class="nw-kpi ${_filter === key ? 'on' : ''}" onclick="OpsNetwork.filter('${key}')"><div class="nw-kpi-v">${value ?? '—'}</div><div class="nw-kpi-l">${label}</div></div>`;
    _root.innerHTML = `<div class="nw">
      <div class="fg-page-header"><div>
        <div class="fg-page-title">Network</div>
        <div class="fg-page-sub">FlowGuard's digital model of the drainage system — assets, connectivity, outfalls and zones</div>
      </div>
      <div class="nw-viewtog">
        <button class="nw-vt ${_view === 'map' ? 'on' : ''}" onclick="OpsNetwork.setView('map')">Map</button>
        <button class="nw-vt ${_view === 'list' ? 'on' : ''}" onclick="OpsNetwork.setView('list')">List</button>
      </div></div>

      <div class="nw-sum">
        ${kpi('all', 'Drainage assets', s.assets)}
        ${kpi('km', 'Network length', (s.network_km != null ? s.network_km + ' km' : '—'))}
        ${kpi('outfall', 'Outfalls', s.outfalls)}
        ${kpi('property', 'Connected properties', s.connected_properties)}
        ${kpi('sensor', 'Sentinel devices', s.sentinel_devices)}
        ${kpi('attention', 'Need attention', s.attention)}
      </div>

      <div class="nw-main">
        <div class="nw-mapwrap ${_view === 'list' ? 'hidden' : ''}">
          <div id="nw-map"></div>
          ${layerPanel()}
        </div>
        <div class="nw-listwrap ${_view === 'map' ? 'hidden' : ''}">${listHTML()}</div>
        <div class="nw-drawer" id="nw-drawer"></div>
      </div>
    </div>`;
  }

  function layerPanel() {
    const row = (key, label, on) => `<label class="nw-lyr"><input type="checkbox" ${on ? 'checked' : ''} onchange="OpsNetwork.toggleLayer('${key}',this.checked)"><span style="background:${GRP_COLOR[key] || 'var(--ink-3)'}"></span>${label}</label>`;
    return `<div class="nw-panel">
      <div class="nw-panel-grp">Network</div>
      ${row('primary', 'Primary drains', true)}${row('secondary', 'Secondary drains', true)}${row('tertiary', 'Tertiary drains', true)}${row('culvert', 'Culverts', true)}${row('structure', 'Structures', true)}
      <div class="nw-panel-grp">Connected</div>
      ${row('property', 'Properties', true)}${row('sensor', 'Sentinel devices', true)}${row('outfall', 'Outfalls', true)}
      <div class="nw-panel-grp">Environment</div>
      ${row('waterbody', 'Water bodies', true)}
    </div>`;
  }

  // ════════════ map ════════════
  function initMap() {
    if (!window.L || !document.getElementById('nw-map')) return;
    if (map) { try { map.remove(); } catch (_) {} map = null; }
    map = L.map('nw-map', { center: [6.5244, 3.3792], zoom: 11, zoomControl: false, attributionControl: true });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    baseTiles = L.maplibreGL({ style: styleUrl(), attribution: '&copy; OpenFreeMap &copy; OSM' }).addTo(map);
    _links = L.layerGroup().addTo(map);
    _traceLayer = L.layerGroup().addTo(map);
    ['primary', 'secondary', 'tertiary', 'culvert', 'structure', 'outfall', 'property', 'sensor', 'waterbody'].forEach(k => { _layers[k] = L.layerGroup().addTo(map); });
    plot();
    // Warm the 3D pipeline (three.js + decoded model) so the first device
    // pop-out is instant.
    if (window.OpsSensors && OpsSensors.preload3D) OpsSensors.preload3D();
    if (window.ResizeObserver) new ResizeObserver(() => { try { map.invalidateSize(); } catch (_) {} }).observe(document.getElementById('nw-map'));
  }

  function plot() {
    if (!map) return;
    Object.values(_layers).forEach(l => l.clearLayers());
    _links.clearLayers();
    const pts = [];
    const coord = o => (o && o.latitude != null && o.longitude != null) ? [parseFloat(o.latitude), parseFloat(o.longitude)] : null;

    // Topology links (draw where both endpoints have coords).
    (_g.assets || []).forEach(a => {
      const from = coord(a); if (!from) return;
      const d = a.downstream_asset_id && _byId[a.downstream_asset_id];
      const to = d && coord(d);
      if (to) _links.addLayer(L.polyline([from, to], { color: dark() ? '#3a4a5a' : '#9fb3c0', weight: 2, opacity: .7, dashArray: a.topology_verified ? null : '4 5' }));
    });

    // Assets
    (_g.assets || []).forEach(a => {
      const c = coord(a); if (!c) return;
      const grp = a.is_outfall ? 'outfall' : typeInfo(a.property_type).grp;
      const col = a.needs_attention ? (riskColor(a.risk_level) || '#d9463c') : (GRP_COLOR[grp] || '#7d8fa3');
      const m = L.marker(c, { icon: pin(grp, col, { attention: a.needs_attention }) });
      m.on('click', () => openAsset(a.property_id));
      (_layers[grp] || _layers.secondary).addLayer(m); pts.push(c);
    });
    // Properties
    (_g.properties || []).forEach(p => {
      const c = coord(p); if (!c) return;
      const m = L.marker(c, { icon: pin('property', '#0d7fa0') });
      m.on('click', () => openAsset(p.property_id));
      _layers.property.addLayer(m); pts.push(c);
    });
    // Water bodies
    (_g.water_bodies || []).forEach(w => {
      const c = coord(w); if (!c) return;
      const m = L.marker(c, { icon: pin('waterbody', '#2563eb') });
      m.on('click', () => openWaterBody(w.water_body_id));
      _layers.waterbody.addLayer(m); pts.push(c);
    });
    // Sensors (from map-data)
    _snById = {};
    (_md.sensors || []).forEach(sn => {
      _snById[sn.sensor_id] = sn;
      const c = coord(sn); if (!c) return;
      const col = sn.status === 'active' ? '#16b364' : sn.status === 'maintenance' ? '#e0a012' : '#d9463c';
      const m = L.marker(c, { icon: pin('sensor', col) });
      m.on('click', () => openDevice(sn.sensor_id));
      _layers.sensor.addLayer(m); pts.push(c);
    });
    if (pts.length) { try { map.fitBounds(L.latLngBounds(pts).pad(0.2)); } catch (_) {} }
    setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 80);
  }

  function toggleLayer(key, on) {
    const l = _layers[key]; if (!l || !map) return;
    if (on) l.addTo(map); else map.removeLayer(l);
  }
  function setView(v) { _view = v; const sel = _sel; paint(); if (v === 'map') { loadLeaflet().then(initMap); } if (sel) setTimeout(() => openAsset(sel), 60); }

  // ════════════ tracing ════════════
  function traceDown(id) {
    const chain = []; let cur = _byId[id]; const seen = new Set();
    while (cur && !seen.has(cur.property_id)) {
      seen.add(cur.property_id); chain.push(cur);
      if (cur.water_body_id && _wbId[cur.water_body_id]) { chain.push({ _wb: true, ..._wbId[cur.water_body_id] }); break; }
      cur = cur.downstream_asset_id ? _byId[cur.downstream_asset_id] : null;
    }
    return chain;
  }
  function traceUp(id, acc, seen) {
    acc = acc || []; seen = seen || new Set();
    (_g.assets || []).concat(_g.properties || []).forEach(o => {
      if (o.downstream_asset_id === id && !seen.has(o.property_id)) { seen.add(o.property_id); acc.push(o); traceUp(o.property_id, acc, seen); }
    });
    return acc;
  }
  function highlightRoute(nodes) {
    if (!_traceLayer || !map) return;
    _traceLayer.clearLayers();
    const line = [];
    nodes.forEach(n => { const lat = n.latitude, lng = n.longitude; if (lat != null && lng != null) { line.push([+lat, +lng]); _traceLayer.addLayer(L.marker([+lat, +lng], { icon: marker('#16a8d3', 14, true) })); } });
    if (line.length > 1) _traceLayer.addLayer(L.polyline(line, { color: '#16a8d3', weight: 4, opacity: .95 }));
    if (line.length) { try { map.fitBounds(L.latLngBounds(line).pad(0.3)); } catch (_) {} }
  }
  function trace(id, dir) {
    if (_view !== 'map') { setView('map'); setTimeout(() => trace(id, dir), 300); return; }
    const start = _byId[id];
    const nodes = dir === 'down' ? traceDown(id) : [start].concat(traceUp(id));
    highlightRoute(nodes.filter(Boolean));
    const props = (dir === 'up' ? traceUp(id) : []).filter(n => !n._wb && String(n.property_id || '').startsWith('PROP')).length;
    openAsset(id, { dir, count: nodes.length - 1, props });
  }

  // ════════════ inspector drawer ════════════
  function vq(ok, label) { return `<span class="nw-vq ${ok ? 'ok' : 'miss'}">${ok ? '✓' : '⚠'} ${label}</span>`; }
  function fieldRow(k, v) { return `<div class="nw-f"><span class="nw-fk">${k}</span><span class="nw-fv">${v == null || v === '' ? '—' : v}</span></div>`; }

  async function openAsset(id, traceInfo) {
    _sel = id;
    const a = _byId[id]; if (!a) return;
    const dr = document.getElementById('nw-drawer'); if (!dr) return;
    const isProp = !a.property_type;
    const ti = isProp ? { label: 'Property' } : typeInfo(a.property_type);
    const cond = a.condition || '—';
    const down = traceDown(id);
    const up = traceUp(id);
    const outfallInChain = down.find(n => n._wb) || null;
    const traceLine = traceInfo ? `<div class="nw-tracebar">${traceInfo.dir === 'down' ? 'Downstream' : 'Upstream'} route · ${traceInfo.count} hop${traceInfo.count === 1 ? '' : 's'}${traceInfo.props ? ' · ' + traceInfo.props + ' properties' : ''}</div>` : '';
    dr.innerHTML = `
      <div class="nw-dr-head">
        <div><div class="nw-dr-name">${esc(a.asset_code || a.property_name || id)}</div>
          <div class="nw-dr-sub">${esc(ti.label)}${a.zone ? ' · ' + esc(a.zone) : ''} · <span style="color:${a.needs_attention ? 'var(--err)' : 'var(--ok)'}">${a.needs_attention ? 'Needs attention' : 'Operational'}</span></div></div>
        <button class="nw-dr-x" onclick="OpsNetwork.closeDrawer()">&times;</button>
      </div>
      ${traceLine}
      <div class="nw-vqs">
        ${vq(a.location_verified, 'Location')}
        ${!isProp ? vq(a.topology_verified, 'Topology') : ''}
        ${!isProp ? vq(a.dimensions_verified, 'Dimensions') : ''}
        ${vq((a.sentinel_count || 0) > 0, 'Sentinel')}
      </div>
      <div class="nw-fields">
        ${fieldRow('Asset ID', esc(a.property_id))}
        ${!isProp ? fieldRow('Type', esc(ti.label)) : ''}
        ${fieldRow('Zone', esc(a.zone))}
        ${a.estate_name ? fieldRow('Estate', esc(a.estate_name)) : ''}
        ${!isProp ? fieldRow('Length', a.length_m != null ? a.length_m + ' m' : null) : ''}
        ${!isProp ? fieldRow('Width', a.width_m != null ? a.width_m + ' m' : null) : ''}
        ${!isProp ? fieldRow('Depth', a.depth_m != null ? a.depth_m + ' m' : null) : ''}
        ${!isProp ? fieldRow('Material', esc(a.material)) : ''}
        ${!isProp ? fieldRow('Capacity', a.capacity_liters != null ? Number(a.capacity_liters).toLocaleString() + ' L' : null) : ''}
        ${fieldRow('Condition', `<span style="color:${condColor(cond)}">${cond}</span>`)}
        ${a.risk_level ? fieldRow('Risk', `<span style="color:${riskColor(a.risk_level)}">${esc(a.risk_level)}</span>`) : ''}
        ${!isProp ? fieldRow('Flow direction', esc(a.flow_direction)) : ''}
        ${fieldRow('Water level', a.water_level != null ? Math.round(a.water_level) + '%' : null)}
        ${fieldRow('Sentinels', a.sentinel_count || 0)}
        ${fieldRow('Last inspection', fmtDate(a.last_inspected_at))}
        ${fieldRow('Last maintenance', fmtDate(a.last_maintenance))}
      </div>
      <div class="nw-connected">${up.length} upstream · ${down.filter(n => !n._wb && n.property_id !== id).length} downstream${outfallInChain ? ' · outfall → ' + esc(outfallInChain.name) : ''}</div>
      <div class="nw-dr-actions">
        <button class="nw-btn" onclick="OpsNetwork.trace('${esc(id)}','up')">Trace upstream</button>
        <button class="nw-btn" onclick="OpsNetwork.trace('${esc(id)}','down')">Trace downstream</button>
      </div>
      <div class="nw-dr-actions">
        <button class="nw-btn ghost" onclick="OpsNetwork.clearTrace()">Clear trace</button>
        <button class="nw-btn ghost" onclick="switchTab('maintenance')">Maintenance planner →</button>
      </div>
      <div class="nw-mh"><div class="nw-mh-h">Maintenance history</div><div id="nw-mh-body"><div class="nw-mh-empty">Loading…</div></div></div>`;
    showInspector();
    loadMaintenance(id);
  }

  async function loadMaintenance(id) {
    const el = document.getElementById('nw-mh-body'); if (!el) return;
    try {
      const r = await api('/network/asset/' + encodeURIComponent(id) + '/maintenance');
      const rows = (r && r.data) || [];
      el.innerHTML = rows.length ? rows.map(e => `<div class="nw-mh-row"><div class="nw-mh-d">${fmtDate(e.occurred_at)}</div><div><div class="nw-mh-t">${esc((e.event_type || '').replace(/_/g, ' '))}</div><div class="nw-mh-s">${esc(e.description || '')}</div></div></div>`).join('') : `<div class="nw-mh-empty">No recorded history.</div>`;
    } catch (_) { el.innerHTML = `<div class="nw-mh-empty">Couldn't load history.</div>`; }
  }

  function openWaterBody(id) {
    _sel = null;
    const w = _wbId[id]; if (!w) return;
    const dr = document.getElementById('nw-drawer'); if (!dr) return;
    const upstream = (_g.assets || []).filter(a => a.water_body_id === id);
    const downstream = w.downstream_water_body_id && _wbId[w.downstream_water_body_id];
    dr.innerHTML = `
      <div class="nw-dr-head"><div><div class="nw-dr-name">${esc(w.name)}</div><div class="nw-dr-sub">${esc((w.type || 'water body'))} · <span style="color:${w.status === 'normal' ? 'var(--ok)' : 'var(--warn)'}">${esc(w.status || 'normal')}</span></div></div><button class="nw-dr-x" onclick="OpsNetwork.closeDrawer()">&times;</button></div>
      <div class="nw-fields">
        ${fieldRow('Type', esc(w.type))}
        ${fieldRow('Connected outfalls / drains', upstream.length)}
        ${fieldRow('Downstream', downstream ? esc(downstream.name) : '—')}
        ${fieldRow('Capacity', w.capacity_pct != null ? w.capacity_pct + '%' : null)}
        ${fieldRow('Condition', esc(w.condition))}
        ${fieldRow('Last inspection', fmtDate(w.last_inspected_at))}
        ${fieldRow('Status', esc(w.status))}
      </div>
      <div class="nw-connected">Water level is external / environmental data.</div>`;
    showInspector();
  }

  function openZone(zone) {
    const z = (_g.zones || []).find(x => x.zone === zone); if (!z) return;
    const dr = document.getElementById('nw-drawer'); if (!dr) return;
    dr.innerHTML = `
      <div class="nw-dr-head"><div><div class="nw-dr-name">${esc(z.zone)}</div><div class="nw-dr-sub">Zone · <span style="color:${riskColor(z.risk)}">${esc(z.risk)} risk</span></div></div><button class="nw-dr-x" onclick="OpsNetwork.closeDrawer()">&times;</button></div>
      <div class="nw-zstats">
        <div><b>${z.property_count}</b><span>Properties</span></div>
        <div><b>${z.asset_count}</b><span>Drainage assets</span></div>
        <div><b>${z.length_km} km</b><span>Network</span></div>
        <div><b>${z.sentinel_count}</b><span>Sentinels</span></div>
        <div><b>${z.attention}</b><span>Need attention</span></div>
        <div><b>${esc(z.condition || '—')}</b><span>Condition</span></div>
      </div>`;
    showInspector();
  }

  // A Sentinel device clicked on the map — the SAME pop-out as the Devices
  // module (3D model, status tokens, command action bar, Telemetry/Actions
  // tabs, metric cards), rendered into the side inspector, never overlaying
  // the map. Reuses OpsSensors data, 3D viewer and command functions.
  function nwDeviceTele(x) {
    const cap = x.capabilities || {};
    const vital = v => (window.OpsModal && OpsModal.vitalColor) ? OpsModal.vitalColor(v) : 'var(--ink)';
    const lvlCol = v => v == null ? 'var(--ink)' : v >= 80 ? '#d9463c' : v >= 60 ? '#e0a012' : '#1f9d5b';
    const dash = '<span style="color:var(--ink-4)">—</span>';
    const card = (k, v) => `<div class="nw-card"><div class="nw-card-k">${k}</div><div class="nw-card-v">${v}</div></div>`;
    const readings = [
      cap.water_level !== false ? card('Water Level', x.level != null ? `<span style="color:${lvlCol(x.level)}">${Math.round(x.level)}%</span>` : dash) : '',
      cap.flow_rate !== false ? card('Flow Rate', x.flow_rate != null ? `${(+x.flow_rate).toFixed(1)} L/s` : dash) : '',
    ].filter(Boolean).join('');
    const device = [
      card('Battery', x.battery_percent != null ? `<span style="color:${vital(x.battery_percent)}">${x.battery_percent}%</span>` : dash),
      card('Signal', x.signal_strength != null ? `<span style="color:${vital(x.signal_strength)}">${x.signal_strength}%</span>` : dash),
      card('Temperature', x.temperature != null ? `${Math.round(x.temperature)}°C` : dash),
      card('Firmware', x.firmware_version ? `<span style="font-size:var(--fs-sm)">${esc(x.firmware_version)}</span>` : dash),
    ].join('');
    return `${readings ? `<div class="nw-sec">Readings</div><div class="nw-cards">${readings}</div>` : ''}<div class="nw-sec">Device</div><div class="nw-cards">${device}</div>`;
  }

  async function openDevice(id) {
    const dr = document.getElementById('nw-drawer'); if (!dr) return;
    _sel = null; _devSel = id;
    const S = window.OpsSensors;
    // Render immediately with the best data we already have (map-data point or
    // cached Sentinel record) so the 3D can mount right away; enrich later.
    const rich = (S && S.getSensor) ? S.getSensor(id) : null;
    const x = rich || _snById[id] || { sensor_id: id };
    const sid = String(id).replace(/[^A-Za-z0-9_\-.:]/g, '');
    const online = (x.status || 'active') === 'active';
    const stCls = online ? 'ok' : x.status === 'maintenance' ? 'warn' : 'err';
    const stLbl = online ? 'CONNECTED' : String(x.status || 'offline').toUpperCase();

    dr.innerHTML = `
      <div class="nw-dr-head">
        <div style="min-width:0">
          <div class="nw-crumb">Devices <span>›</span> ${esc(x.site_name || x.zone || 'Network')}</div>
          <div class="nw-dr-name">${esc(x.name || x.sensor_id)}</div>
          <div class="nw-status-line">
            <span class="nw-tok id">${esc(x.sensor_id)}</span><span class="sep">·</span>
            <span class="nw-tok ${stCls}"><span class="tdot"></span>${stLbl}</span>
          </div>
        </div>
        <button class="nw-dr-x" onclick="OpsNetwork.closeDrawer()">&times;</button>
      </div>
      <div class="nw-3d" id="nw-3d"><div class="nw-3d-state" id="nw-3d-state"><span class="nw-3d-spin"></span>Loading 3D model…</div><div class="nw-3d-hint">Drag to rotate · scroll to zoom</div></div>
      <div class="nw-abar">
        <button class="nw-ab-ic" title="Restart node" onclick="OpsSensors.sendCommand('${sid}','reset')"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg></button>
        <button class="nw-ab-main" onclick="OpsNetwork.openInDevices('${sid}')">Open in Devices <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/></svg></button>
        <button class="nw-ab-ic" title="Command history" onclick="OpsSensors.commandHistory('${sid}')"><svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg></button>
      </div>
      <div class="nw-dtabs">
        <button class="nw-dtab active" data-dtab="telemetry" onclick="OpsNetwork.deviceTab('telemetry')">Telemetry</button>
        <button class="nw-dtab" data-dtab="actions" onclick="OpsNetwork.deviceTab('actions')">Actions</button>
      </div>
      <div class="nw-dpanel" data-dpanel="telemetry" id="nw-tele">${nwDeviceTele(x)}</div>
      <div class="nw-dpanel" data-dpanel="actions" style="display:none">
        <button class="nw-act" onclick="OpsSensors.sendCommand('${sid}','firmware_update')"><svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 19V5m0 0l-6 6m6-6l6 6"/></svg>Push Firmware OTA</button>
        <button class="nw-act" onclick="OpsSensors.sendCommand('${sid}','reset')"><svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>Restart Node</button>
        <button class="nw-act" onclick="OpsSensors.calibrate('${sid}')"><svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>Run Calibration</button>
        <button class="nw-act" onclick="OpsSensors.history('${sid}')"><svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2"/></svg>View Diagnostics Log</button>
        <button class="nw-act" onclick="OpsSensors.openFull('${sid}')"><svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/></svg>Open full details</button>
      </div>`;
    showInspector();
    if (S && S.mount3D) S.mount3D('nw-3d');   // model is preloaded → near-instant, runs in parallel
    // If we only had the light map-data point, fetch the full record in the
    // background and refresh just the telemetry cards.
    if (!rich && S && S.loadAll) {
      S.loadAll().then(() => {
        if (_devSel !== id) return; // user opened another entity meanwhile
        const r = S.getSensor(id), tele = document.getElementById('nw-tele');
        if (r && tele) tele.innerHTML = nwDeviceTele(r);
      });
    }
  }

  function deviceTab(name) {
    const root = _root; if (!root) return;
    root.querySelectorAll('.nw-dtab').forEach(b => b.classList.toggle('active', b.dataset.dtab === name));
    root.querySelectorAll('.nw-dpanel').forEach(p => { p.style.display = (p.dataset.dpanel === name) ? '' : 'none'; });
  }

  // Jump to the Sentinel Devices module and open this device's full drawer.
  function openInDevices(id) {
    try {
      if (typeof switchTab === 'function') switchTab('devices');
      setTimeout(() => { if (window.OpsSensors && OpsSensors.viewSensor) OpsSensors.viewSensor(id); }, 350);
    } catch (_) {}
  }

  // The inspector is a third column of the page, not an overlay — reveal it by
  // splitting the layout and let the map reflow into the remaining width.
  function showInspector() {
    const m = _root && _root.querySelector('.nw-main'); if (m) m.classList.add('split');
    const dr = document.getElementById('nw-drawer'); if (dr) { dr.classList.add('open'); dr.scrollTop = 0; }
    resizeMapSoon();
  }
  function hideInspector() {
    const m = _root && _root.querySelector('.nw-main'); if (m) m.classList.remove('split');
    const dr = document.getElementById('nw-drawer'); if (dr) dr.classList.remove('open');
    if (window.OpsSensors && OpsSensors.dispose3D) OpsSensors.dispose3D();
    resizeMapSoon();
  }
  function resizeMapSoon() { setTimeout(() => { try { if (map) map.invalidateSize(); } catch (_) {} }, 260); }

  function closeDrawer() { hideInspector(); _sel = null; _devSel = null; clearTrace(); }
  function clearTrace() { if (_traceLayer) _traceLayer.clearLayers(); }

  // ════════════ list view ════════════
  function listHTML() {
    let assets = (_g.assets || []);
    if (_filter && _filter !== 'all' && _filter !== 'km') {
      if (_filter === 'outfall') assets = assets.filter(a => a.is_outfall);
      else if (_filter === 'attention') assets = assets.filter(a => a.needs_attention);
    }
    const zoneChips = (_g.zones || []).slice(0, 8).map(z => `<button class="nw-zchip" onclick="OpsNetwork.openZone('${esc(z.zone)}')">${esc(z.zone)} · ${z.asset_count}</button>`).join('');
    const rows = assets.map(a => {
      const ti = typeInfo(a.property_type);
      return `<tr class="clickable" onclick="OpsNetwork.openAsset('${esc(a.property_id)}')">
        <td><div class="lv-name-cell"><div class="lv-avatar" style="background:var(--surface-3);color:${GRP_COLOR[ti.grp] || 'var(--ink-3)'};border:1px solid var(--border);">${esc((a.asset_code || 'A').slice(0, 2).toUpperCase())}</div><div style="min-width:0;"><div class="lv-name">${esc(a.asset_code || a.property_name)}</div><span class="lv-source">${esc(a.property_id)}</span></div></div></td>
        <td>${esc(ti.label)}</td>
        <td>${esc(a.zone) || '<span class="lv-dash">—</span>'}</td>
        <td><span style="color:${condColor(a.condition)}">${esc(a.condition || '—')}</span></td>
        <td class="lv-mono">${a.water_level != null ? Math.round(a.water_level) + '%' : '—'}</td>
        <td class="lv-mono">${a.sentinel_count || 0}</td>
        <td class="lv-mono">${fmtDate(a.last_inspected_at)}</td>
      </tr>`;
    }).join('');
    return `<div class="lv-wrap">
      <div class="lv-toolbar"><div class="nw-zones">${zoneChips || '<span class="lv-dash">No zones yet</span>'}</div></div>
      <div class="lv-scroll"><table class="lv-table">
        <thead><tr><th>Asset</th><th>Type</th><th>Zone</th><th>Condition</th><th>Capacity</th><th>Sentinel</th><th>Last inspection</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7" style="text-align:center;padding:36px;color:var(--ink-3);">No drainage assets registered.</td></tr>'}</tbody>
      </table></div>
    </div>`;
  }

  function filter(key) {
    _filter = _filter === key ? null : key;
    if (key === 'attention' || key === 'outfall') { _view = 'list'; }
    paint();
    if (_view === 'map') loadLeaflet().then(initMap);
  }

  const STYLES = `
    .nw{display:flex;flex-direction:column;gap:16px;}
    .nw-load{padding:60px;text-align:center;color:var(--ink-3);}
    .nw-btn{display:inline-flex;align-items:center;gap:6px;background:var(--surface-2);border:1px solid var(--border-2);color:var(--ink);border-radius:9px;padding:8px 13px;font-weight:600;font-size:var(--fs-sm);cursor:pointer;font-family:inherit;flex:1;justify-content:center;}
    .nw-btn.ghost{background:transparent;color:var(--ink-2);}
    .fg-page-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;}
    .nw-viewtog{display:flex;gap:4px;background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:3px;}
    .nw-vt{font-size:var(--fs-xs);font-weight:600;padding:6px 14px;border-radius:8px;border:none;background:transparent;color:var(--ink-2);cursor:pointer;font-family:inherit;}
    .nw-vt.on{background:var(--ink);color:var(--surface);}
    /* summary */
    .nw-sum{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;}
    @media (max-width:1100px){ .nw-sum{grid-template-columns:repeat(3,1fr);} }
    @media (max-width:640px){ .nw-sum{grid-template-columns:repeat(2,1fr);} }
    .nw-kpi{background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:var(--sh-xs);padding:14px 16px;cursor:pointer;transition:border-color .15s;}
    .nw-kpi:hover{border-color:var(--border-2);}
    .nw-kpi.on{border-color:var(--blue-hi);box-shadow:0 0 0 1px var(--blue-hi);}
    .nw-kpi-v{font-family:var(--ff-d);font-size:24px;font-weight:800;color:var(--ink);letter-spacing:-.5px;line-height:1;}
    .nw-kpi-l{font-size:var(--fs-2xs);color:var(--ink-3);font-weight:600;margin-top:6px;}
    /* main + map — inspector is a third column, not an overlay */
    .nw-main{position:relative;display:flex;gap:14px;align-items:stretch;}
    #nw-map{height:62vh;min-height:440px;border-radius:16px;overflow:hidden;border:1px solid var(--border);}
    .nw-mapwrap{position:relative;flex:1 1 auto;min-width:0;}
    .nw-listwrap{flex:1 1 auto;min-width:0;}
    .hidden{display:none;}
    /* layer panel */
    .nw-panel{position:absolute;top:14px;left:14px;z-index:600;background:var(--surface);border:1px solid var(--border-2);border-radius:12px;box-shadow:var(--sh-md);padding:12px 14px;min-width:172px;}
    .nw-panel-grp{font-size:var(--fs-2xs);text-transform:uppercase;letter-spacing:.5px;color:var(--ink-3);font-weight:700;margin:8px 0 6px;}
    .nw-panel-grp:first-child{margin-top:0;}
    .nw-lyr{display:flex;align-items:center;gap:8px;font-size:var(--fs-xs);color:var(--ink-2);padding:3px 0;cursor:pointer;}
    .nw-lyr span{width:9px;height:9px;border-radius:50%;flex-shrink:0;}
    .nw-lyr input{accent-color:var(--blue);}
    /* inspector — third column, revealed by .nw-main.split */
    .nw-drawer{flex:0 0 0;width:0;min-width:0;height:62vh;min-height:440px;overflow:hidden;opacity:0;background:var(--surface);border:1px solid var(--border-2);border-radius:16px;box-shadow:var(--sh-md);padding:0;transition:flex-basis .24s ease,width .24s ease,opacity .18s ease;}
    .nw-main.split .nw-drawer{flex:0 0 372px;width:372px;opacity:1;padding:16px 18px;overflow-y:auto;}
    @media (max-width:900px){ .nw-main{flex-direction:column;} .nw-main.split .nw-drawer{flex:1 1 auto;width:auto;height:auto;max-height:74vh;} }
    /* device inspector (Devices-drawer style) */
    .nw-crumb{font-size:var(--fs-2xs);font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-3);display:flex;align-items:center;gap:6px;margin-bottom:5px;}
    .nw-crumb span{opacity:.6;}
    .nw-status-line{display:flex;align-items:center;flex-wrap:wrap;gap:7px;margin-top:7px;font-family:var(--ff-m);font-size:var(--fs-2xs);font-weight:700;letter-spacing:.03em;}
    .nw-status-line .nw-tok{display:inline-flex;align-items:center;gap:5px;color:var(--ink-2);}
    .nw-status-line .nw-tok.id{color:var(--ink-3);}
    .nw-status-line .nw-tok.ok{color:var(--ok);} .nw-status-line .nw-tok.warn{color:var(--warn);} .nw-status-line .nw-tok.err{color:var(--err);}
    .nw-status-line .tdot{width:7px;height:7px;border-radius:50%;background:currentColor;}
    .nw-status-line .sep{color:var(--ink-4,#8494a0);opacity:.6;}
    .nw-cards{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:14px;}
    .nw-card{background:var(--surface-2);border:1px solid var(--border);border-radius:11px;padding:12px 13px;min-width:0;}
    .nw-card-k{font-size:var(--fs-2xs);font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-3);}
    .nw-card-v{margin-top:6px;font-family:var(--ff-m);font-size:var(--fs-lg);font-weight:800;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .nw-dload{padding:30px 10px;text-align:center;color:var(--ink-3);font-size:var(--fs-sm);}
    /* device 3D viewer */
    .nw-3d{position:relative;width:100%;height:200px;border-radius:12px;overflow:hidden;background:radial-gradient(120% 120% at 50% 20%, var(--surface-2), var(--surface));border:1px solid var(--border);margin:4px 0 12px;}
    .nw-3d canvas{display:block;width:100% !important;height:100% !important;outline:none;cursor:grab;}
    .nw-3d canvas:active{cursor:grabbing;}
    .nw-3d-state{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:9px;font-size:var(--fs-xs);color:var(--ink-3);pointer-events:none;}
    .nw-3d-spin{width:15px;height:15px;border:2px solid var(--border);border-top-color:var(--blue-hi,#22c3e6);border-radius:50%;animation:nw3dspin .7s linear infinite;}
    @keyframes nw3dspin{to{transform:rotate(360deg);}}
    .nw-3d-hint{position:absolute;left:0;right:0;bottom:6px;text-align:center;font-size:var(--fs-2xs);color:var(--ink-4,#8494a0);opacity:.75;pointer-events:none;}
    /* device action bar */
    .nw-abar{display:flex;align-items:stretch;gap:8px;margin-bottom:6px;}
    .nw-ab-ic{flex:0 0 auto;width:44px;display:grid;place-items:center;background:var(--surface-2);border:1px solid var(--border);border-radius:11px;color:var(--ink-2);cursor:pointer;transition:.13s;}
    .nw-ab-ic:hover{color:var(--blue-hi,#22c3e6);border-color:var(--blue-dim,#7fc8e0);}
    .nw-ab-main{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:11px 12px;background:var(--surface-2);border:1px solid var(--border);border-radius:11px;color:var(--ink);font-family:var(--ff-b);font-weight:700;font-size:var(--fs-sm);cursor:pointer;transition:.13s;}
    .nw-ab-main:hover{border-color:var(--blue-dim,#7fc8e0);color:var(--blue-hi,#22c3e6);}
    /* device tabs */
    .nw-dtabs{display:flex;gap:2px;border-bottom:1px solid var(--border);margin:14px 0 12px;}
    .nw-dtab{flex:1;background:none;border:none;padding:9px 4px;font-family:var(--ff-b);font-size:var(--fs-2xs);font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;transition:.13s;}
    .nw-dtab.active{color:var(--ink);border-bottom-color:var(--blue-hi,#22c3e6);}
    .nw-sec{font-size:var(--fs-2xs);font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--ink-3);margin:4px 0 9px;}
    .nw-sec:not(:first-child){margin-top:16px;}
    .nw-act{display:flex;align-items:center;gap:10px;width:100%;padding:9px 4px;background:none;border:none;text-align:left;font-size:var(--fs-sm);font-weight:600;color:var(--ink-2);cursor:pointer;font-family:var(--ff-b);border-radius:8px;}
    .nw-act:hover{background:var(--surface-2);color:var(--blue-hi,#22c3e6);}
    .nw-act svg{flex-shrink:0;}
    .nw-dr-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px;}
    .nw-dr-name{font-family:var(--ff-d);font-size:var(--fs-lg);font-weight:800;color:var(--ink);}
    .nw-dr-sub{font-size:var(--fs-2xs);color:var(--ink-3);margin-top:2px;}
    .nw-dr-x{background:none;border:none;color:var(--ink-3);font-size:22px;line-height:1;cursor:pointer;}
    .nw-tracebar{background:rgba(22,168,211,.12);color:var(--blue-hi);font-size:var(--fs-2xs);font-weight:700;padding:7px 11px;border-radius:8px;margin-bottom:12px;}
    .nw-vqs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;}
    .nw-vq{font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;}
    .nw-vq.ok{background:var(--ok-bg);color:var(--ok);}
    .nw-vq.miss{background:var(--wb);color:var(--warn);}
    .nw-f{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--border);font-size:var(--fs-sm);}
    .nw-fk{color:var(--ink-3);} .nw-fv{color:var(--ink);font-weight:600;text-align:right;}
    .nw-connected{font-size:var(--fs-xs);color:var(--ink-2);margin:12px 0;padding:9px 11px;background:var(--surface-2);border-radius:9px;}
    .nw-dr-actions{display:flex;gap:8px;margin-bottom:8px;}
    .nw-mh{margin-top:14px;}
    .nw-mh-h{font-size:var(--fs-sm);font-weight:700;color:var(--ink);margin-bottom:8px;}
    .nw-mh-row{display:flex;gap:10px;padding:8px 0;border-top:1px solid var(--border);}
    .nw-mh-d{font-family:var(--ff-m);font-size:var(--fs-2xs);color:var(--ink-4);white-space:nowrap;padding-top:1px;}
    .nw-mh-t{font-size:var(--fs-sm);color:var(--ink);text-transform:capitalize;}
    .nw-mh-s{font-size:var(--fs-2xs);color:var(--ink-3);}
    .nw-mh-empty{font-size:var(--fs-sm);color:var(--ink-3);padding:8px 0;}
    /* zone */
    .nw-zstats{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
    .nw-zstats>div{background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;}
    .nw-zstats b{display:block;font-family:var(--ff-d);font-size:20px;font-weight:800;color:var(--ink);}
    .nw-zstats span{font-size:var(--fs-2xs);color:var(--ink-3);}
    /* list */
    .nw-zones{display:flex;gap:6px;flex-wrap:wrap;}
    .nw-zchip{font-size:var(--fs-2xs);font-weight:600;color:var(--ink-2);background:var(--surface-2);border:1px solid var(--border-2);border-radius:20px;padding:6px 12px;cursor:pointer;}
    .nw-zchip:hover{border-color:var(--blue-dim);color:var(--blue-hi);}
  `;

  return { render, setView, toggleLayer, filter, openAsset, openWaterBody, openZone, openDevice, openInDevices, deviceTab, trace, clearTrace, closeDrawer };
})();
window.OpsNetwork = OpsNetwork;
