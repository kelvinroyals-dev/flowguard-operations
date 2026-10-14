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
  function coordinates(record) {
    if (!record || [record.latitude,record.longitude].some(value => !['number','string'].includes(typeof value) || typeof value==='string' && !value.trim())) return null;
    const lat=Number(record.latitude),lng=Number(record.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat)<=90 && Math.abs(lng)<=180 ? [lat,lng] : null;
  }
  let _mapChoices=[];
  function locationRecords(anchor,graph,mapData,project) {
    const point=coordinates(anchor);if(!point)return [];
    const screen=typeof project==='function'?project(point):null;
    const validScreen=p=>p && Number.isFinite(p.x) && Number.isFinite(p.y);
    const same=record=>{
      const p=coordinates(record);if(!p)return false;
      if(p.every((value,i)=>Math.abs(value-point[i])<1e-7))return true;
      const candidate=validScreen(screen)?project(p):null;
      // Each marker has a44px hit target. Offer overlapping targets without
      // offsetting or claiming that neighbouring registry positions are equal.
      return validScreen(candidate) && Math.hypot(candidate.x-screen.x,candidate.y-screen.y)<=44;
    };
    return [
      ...(graph?.assets || []).filter(same).map(record=>({kind:'asset',id:record.property_id,name:record.property_name || record.asset_code || record.property_id,layer:record.is_outfall?'outfall':typeInfo(record.property_type).grp})),
      ...(graph?.properties || []).filter(same).map(record=>({kind:'estate',id:record.property_id,name:record.property_name || record.name || record.property_id,layer:'property'})),
      ...(graph?.water_bodies || []).filter(same).map(record=>({kind:'waterbody',id:record.water_body_id,name:record.name || record.water_body_id,layer:'waterbody'})),
      ...(mapData?.sensors || []).filter(same).map(record=>({kind:'device',id:record.sensor_id,name:record.name || record.sensor_id,layer:'sensor'}))
    ];
  }
  function activateMapRecord(record) {
    if(record.kind==='device')return openDevice(record.id);
    if(record.kind==='waterbody')return openWaterBody(record.id);
    return openAsset(record.id);
  }
  function mapRecord(kind,id,anchor) {
    _mapChoices=locationRecords(anchor,_g,_md,typeof map?.latLngToContainerPoint==='function'?point=>map.latLngToContainerPoint(point):null).filter(record=>!map?.hasLayer || map.hasLayer(_layers[record.layer]));
    if(_mapChoices.length<2)return activateMapRecord({kind,id});
    OpsModal.open('Overlapping map records',`${OpsModal.textBlock('Choose a record',_mapChoices.length+' returned records have overlapping map targets at this zoom. Recorded locations are unchanged and are not treated as verified.')}<div class="fg-map-record-choices">${_mapChoices.map((record,i)=>`<button type="button" class="fg-action fg-map-record-choice" onclick="OpsNetwork.chooseMapRecord(${i})">${OpsModal.entityIcon(record.kind)}<span><span class="fg-timeline-meta">${OpsModal.label(record.kind)}</span><strong>${esc(record.name || 'Unnamed record')}</strong><span class="fg-timeline-meta">${esc(record.id)}</span></span></button>`).join('')}</div>`,[{label:'Close',onclick:'OpsModal.close()'}]);
  }
  function chooseMapRecord(index) {
    if(!Number.isInteger(index) || !_mapChoices[index])return;
    const record=_mapChoices[index];_mapChoices=[];OpsModal.close();activateMapRecord(record);
  }

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
  const typeInfo = t => TYPE[t] || { grp: 'secondary', label: OpsModal.label(t || 'asset') };
  const condColor = c => OpsSpatial.color(c,'condition');
  const riskColor = r => OpsSpatial.color(r);
  const GRP_COLOR = Object.fromEntries(["primary","secondary","tertiary","culvert","structure","outfall","property","sensor","waterbody"].map(kind=>[kind,kind==="waterbody"?"var(--chart-rain)":"var(--blue-hi)"]));
  // Per-type glyphs (all rendered at the same badge size, distinct colours)
  function pin(kind, color, opts) { return OpsSpatial.marker(opts?.assetType ? OpsSpatial.assetKind(opts.assetType) : kind, { color, attention: opts?.attention }); }
  const fmtDate = d => OpsModal.fmtDate(d);

  // ── map libs ──
  let _mapDependencies = null;
  function loadLeaflet() {
    if (_mapDependencies) return _mapDependencies;
    _mapDependencies = new Promise((resolve,reject) => {
      const css = (h, id) => { if (id && document.getElementById(id)) return; const c = document.createElement('link'); if (id) c.id = id; c.rel = 'stylesheet'; c.href = h; document.head.appendChild(c); };
      const js = s => new Promise((r,fail) => {
        const el = document.createElement('script'); el.src = s;
        const timer = setTimeout(()=>fail(new Error('Map library timed out')),12000);
        el.onload = ()=>{clearTimeout(timer);r();}; el.onerror = ()=>{clearTimeout(timer);fail(new Error('Map library unavailable'));};
        document.head.appendChild(el);
      });
      css('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'fg-leaflet-css');
      css('https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css', 'fg-maplibre-css');
      const pre = [];
      if (!window.L) pre.push(js('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'));
      if (!window.maplibregl) pre.push(js('https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'));
      Promise.all(pre).then(() => { if (window.L && window.L.maplibreGL) return; return js('https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.0.22/leaflet-maplibre-gl.js'); }).then(()=>{
        if (!window.L?.maplibreGL) throw new Error('Map library unavailable');
        resolve();
      }).catch(reject);
    }).catch(error=>{_mapDependencies=null;throw error;});
    return _mapDependencies;
  }
  const dark = () => document.documentElement.getAttribute('data-theme') === 'dark';
  const styleUrl = () => dark() ? 'https://tiles.openfreemap.org/styles/dark' : 'https://tiles.openfreemap.org/styles/positron';
  window.addEventListener?.('ops-theme-change', () => {
    if (!map || !baseTiles || !document.getElementById('nw-map')) return;
    map.removeLayer(baseTiles);
    baseTiles = L.maplibreGL({style:styleUrl(),attribution:'&copy; OpenFreeMap &copy; OSM'}).addTo(map);
  });
  function marker(color, size, ring) {
    const s = size || 12;
    return L.divIcon({ className: '', iconSize: [s, s], iconAnchor: [s / 2, s / 2],
      html: `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${color};border:2px solid var(--canvas);${ring ? `outline:3px solid ${color};outline-offset:2px;` : ''}"></div>` });
  }

  // ════════════ render ════════════
  function render(container) {
    _root = container;
    container.innerHTML = OpsModal.loading('Building the network model…');
    load();
  }

  async function load() {
    try {
      const [gRes, mdRes] = await Promise.all([
        api('/network/graph'),
        api('/analytics/map-data').catch(() => ({ data: {} })),
      ]);
      _g = gRes.data || {}; _md = mdRes.data || {};
      if (!Array.isArray(_g.assets) || !Array.isArray(_g.properties)) throw new Error('Network record collections were not supplied');
      _byId = {}; (_g.assets || []).forEach(a => { _byId[a.property_id] = a; });
      (_g.properties || []).forEach(p => { _byId[p.property_id] = p; });
      _wbId = {}; (_g.water_bodies || []).forEach(w => { _wbId[w.water_body_id] = w; });
      paint();
      if (_pendingRecord != null) {
        const id = _pendingRecord; _pendingRecord = null;
        if (_byId[id]) openAsset(id);
        else OpsModal.toast('This record is not included in the network feed. No location has been assumed.', 'watch');
      }
      try { await loadLeaflet(); initMap(); }
      catch (error) { mapFailure(error); }
    } catch (err) {
      _root.innerHTML = OpsModal.failure('Network map',err,"reloadTab('network')",true);
    }
  }

  let _byId = {}, _wbId = {}, _snById = {}, _filter = null, _devSel = null, _pendingRecord = null;
  function viewRecord(id) {
    if (!Auth.hasNavAccess('network')) return OpsModal.toast('You do not have access to the network', 'watch');
    _pendingRecord = id;
    switchTab('network');
  }

  function paint() {
    const s = _g.summary || {};
    const kpi = (key, label, value) => {
      const actionable=['all','outfall','attention'].includes(key);
      const display=key==='km' ? value : OpsModal.count(value);
      const content=`<span class="nw-kpi-v fg-metric-value">${esc(display ?? OpsModal.missing.absent)}</span><span class="nw-kpi-l fg-metric-label">${label}</span>`;
      return actionable ? `<button type="button" class="nw-kpi fg-metric ${_filter === key ? 'on' : ''}" aria-pressed="${_filter === key}" onclick="OpsNetwork.filter('${key}')">${content}</button>` : `<div class="nw-kpi fg-metric">${content}</div>`;
    };
    _root.innerHTML = `<div class="nw">
      ${OpsModal.pageHeader({title:'Network map',subtitle:"FlowGuard's digital model of the drainage system — assets, connectivity, outfalls and zones",actions:OpsModal.workspace({name:"Network workspace",value:_view,handler:"OpsNetwork.setView",options:[["map","Map"],["list","List"]]})})}

      <div class="nw-sum fg-metrics">
        ${kpi('all', 'Drainage assets', s.assets)}
        ${kpi('km', 'Network length', (OpsModal.reading(s.network_km,0) !== null ? Number(s.network_km) + ' km' : OpsModal.missing.absent))}
        ${kpi('outfall', 'Outfalls', s.outfalls)}
        ${kpi('property', 'Registered estates', s.registered_properties ?? s.connected_properties)}
        ${kpi('sensor', 'Devices reported', s.sentinel_devices)}
        ${kpi('attention', 'Need attention', s.attention)}
      </div>

      ${OpsModal.provenance([["Source","Network registry"],["Metric basis","Reported registry summary"],["List scope",`${_g.assets.length} returned drainage assets before list filters`],["Length coverage",OpsModal.count(s.length_recorded_assets)!==null && OpsModal.count(s.assets)!==null?s.length_recorded_assets+" of "+s.assets+" assets":null],["Level eligibility","Valid readings within 30 minutes"]],"Summary values are not recalculated by map layers or list filters. Partial device coverage is labelled. Supplied links are not verified physical connectivity." + (!Array.isArray(_md.sensors)?" Device locations are unavailable.":""))}
      ${_view==='map' && !_g.assets.length && !_g.properties.length ? OpsModal.emptyState('','No network registry records returned','No estates or drainage assets were returned. The basemap is geographical context, not evidence of registered assets or monitoring coverage.',{compact:true}) : ''}
      <div class="nw-main">
        <div class="nw-mapwrap ${_view === 'list' ? 'hidden' : ''}">
          <div id="nw-map"></div>
          ${layerPanel()}
          <div class="nw-spatial-legend">${OpsSpatial.legend('Recorded asset risk')}</div>
        </div>
        <div class="nw-listwrap ${_view === 'map' ? 'hidden' : ''}">${listHTML()}</div>
        <div class="nw-drawer fg-map-inspector" id="nw-drawer"></div>
      </div>
    </div>`;
  }

  function layerPanel() {
    const row = (key,label,on) => OpsSpatial.layerButton({kind:key,label,on,onclick:`OpsNetwork.toggleLayer('${key}',this.getAttribute('aria-pressed')!=='true');this.setAttribute('aria-pressed',this.getAttribute('aria-pressed')!=='true')`});
    return OpsSpatial.layerPanel(`
      <div class="nw-panel-grp">Network</div>
      ${row('primary', 'Primary drains', true)}${row('secondary', 'Secondary drains', true)}${row('tertiary', 'Tertiary drains', true)}${row('culvert', 'Culverts', true)}${row('structure', 'Structures', true)}
      <div class="nw-panel-grp">Connected</div>
      ${row('property', 'Estates', true)}${Array.isArray(_md.sensors) ? row('sensor', 'Devices', true) : '<div class="nw-lyr">Device overlay unavailable</div>'}${row('outfall', 'Outfalls', true)}
      <div class="nw-panel-grp">Environment</div>
      ${row('waterbody', 'Water bodies', true)}
    `,'nw-panel',{collapsed:true});
  }

  // ════════════ map ════════════
  function initMap() {
    if (!window.L || !document.getElementById('nw-map')) return;
    if (map) { try { map.remove(); } catch (_) {} map = null; }
    map = L.map('nw-map', { center: [6.5244, 3.3792], zoom: 11, maxZoom:19, zoomControl: false, attributionControl: true });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    baseTiles = L.maplibreGL({ style: styleUrl(), attribution: '&copy; OpenFreeMap &copy; OSM' }).addTo(map);
    _links = L.layerGroup().addTo(map);
    _traceLayer = L.layerGroup().addTo(map);
    ['primary', 'secondary', 'tertiary', 'culvert', 'structure', 'outfall', 'property', 'sensor', 'waterbody'].forEach(k => { _layers[k] = L.layerGroup().addTo(map); });
    plot();
    OpsSpatial.ready(_root);
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
    const coord = coordinates;

    // Topology links (draw where both endpoints have coords).
    (_g.assets || []).forEach(a => {
      const from = coord(a); if (!from) return;
      const d = a.downstream_asset_id && _byId[a.downstream_asset_id];
      const to = d && coord(d);
      if (to) _links.addLayer(L.polyline([from, to], { color:'var(--ink-3)', weight:2, opacity:.7, dashArray:a.topology_verified===true?null:'4 5' }));
    });

    // Assets
    (_g.assets || []).forEach(a => {
      const c = coord(a); if (!c) return;
      const grp = a.is_outfall ? 'outfall' : typeInfo(a.property_type).grp;
      const col = riskColor(a.risk_level);
      const m = L.marker(c, { icon: pin(grp, col, { attention: a.needs_attention, assetType:a.property_type }), title:'Asset: ' + (a.property_name || a.asset_code || a.property_id) });
      OpsModal.keyboardMarker(m);
      m.on('click', () => mapRecord('asset',a.property_id,a));
      (_layers[grp] || _layers.secondary).addLayer(m); pts.push(c);
    });
    // Properties
    (_g.properties || []).forEach(p => {
      const c = coord(p); if (!c) return;
      const m = L.marker(c, { icon: pin('property', 'var(--blue-hi)'), title:'Estate: ' + (p.property_name || p.name || p.property_id) });
      OpsModal.keyboardMarker(m);
      m.on('click', () => mapRecord('estate',p.property_id,p));
      _layers.property.addLayer(m); pts.push(c);
    });
    // Water bodies
    (_g.water_bodies || []).forEach(w => {
      const c = coord(w); if (!c) return;
      const m = L.marker(c, { icon: pin('waterbody', 'var(--chart-rain)'), title:'Water body: ' + (w.name || w.water_body_id) });
      OpsModal.keyboardMarker(m);
      m.on('click', () => mapRecord('waterbody',w.water_body_id,w));
      _layers.waterbody.addLayer(m); pts.push(c);
    });
    // Sensors (from map-data)
    _snById = {};
    (_md.sensors || []).forEach(sn => {
      _snById[sn.sensor_id] = sn;
      const c = coord(sn); if (!c) return;
      const col = OpsSpatial.color(sn.device_state || (sn.status==='offline'?'offline':'unknown'),'device');
      const m = L.marker(c, { icon: pin('sensor', col), title:'Device: ' + (sn.name || sn.sensor_id) });
      OpsModal.keyboardMarker(m);
      m.on('click', () => mapRecord('device',sn.sensor_id,sn));
      _layers.sensor.addLayer(m); pts.push(c);
    });
    if (pts.length) { try { map.fitBounds(L.latLngBounds(pts).pad(0.2),{maxZoom:16}); } catch (_) {} }
    setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 80);
  }

  function toggleLayer(key, on) {
    const l = _layers[key]; if (!l || !map) return;
    if (on) l.addTo(map); else map.removeLayer(l);
  }
  function mapFailure(error) {
    const target=document.getElementById('nw-map');
    if(target) target.innerHTML=OpsModal.failure('Network map',new Error('The map library could not be loaded. Use List to inspect the supplied network records. '+(error?.message || '')),"reloadTab('network')");
  }
  function setView(v) { _view = v; const sel = _sel; paint(); if (v === 'map') { loadLeaflet().then(initMap).catch(mapFailure); } if (sel) setTimeout(() => openAsset(sel), 60); }

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
    acc = acc || []; seen = seen || new Set([String(id)]);
    (_g.assets || []).concat(_g.properties || []).forEach(o => {
      if (o.downstream_asset_id != null && String(o.downstream_asset_id) === String(id) && !seen.has(String(o.property_id))) { seen.add(String(o.property_id)); acc.push(o); traceUp(o.property_id, acc, seen); }
    });
    return acc;
  }
  function highlightRoute(nodes) {
    if (!_traceLayer || !map) return;
    _traceLayer.clearLayers();
    const points = [], selected = new Map(nodes.filter(n=>n.property_id != null).map(n=>[String(n.property_id),n]));
    const waters = new Map(nodes.filter(n=>n._wb).map(n=>[String(n.water_body_id),n]));
    nodes.forEach(n => {
      const point=coordinates(n); if (!point) return;
      points.push(point); _traceLayer.addLayer(L.marker(point, {icon:marker('var(--blue-hi)',14,true),interactive:false,keyboard:false}));
      const target=n.water_body_id != null && !n._wb ? waters.get(String(n.water_body_id)) : n.downstream_asset_id != null ? selected.get(String(n.downstream_asset_id)) : null;
      const endpoint=coordinates(target);
      if (endpoint) _traceLayer.addLayer(L.polyline([point,endpoint],{color:'var(--blue-hi)',weight:4,opacity:.95}));
    });
    if (points.length) { try { map.fitBounds(L.latLngBounds(points).pad(0.3),{maxZoom:16}); } catch (_) {} }
  }
  function trace(id, dir) {
    if (_view !== 'map') { setView('map'); setTimeout(() => trace(id, dir), 300); return; }
    const start = _byId[id];
    const nodes = dir === 'down' ? traceDown(id) : [start].concat(traceUp(id));
    highlightRoute(nodes.filter(Boolean));
    const propertyIds=new Set((_g.properties || []).map(record=>String(record.property_id)));
    const props = (dir === 'up' ? traceUp(id) : []).filter(n => !n._wb && propertyIds.has(String(n.property_id))).length;
    openAsset(id, { dir, count: nodes.length - 1, props });
  }

  // ════════════ inspector drawer ════════════
  function vq(ok, label) { const known = ok === true || ok === false || ok === 1 || ok === 0; return `<span class="nw-vq ${known && ok ? 'ok' : known ? 'miss' : ''}">${known ? ok ? '✓' : '⚠' : '—'} ${label}${known ? '' : ' · unknown'}</span>`; }
  function fieldRow(k, v) { return `<div class="nw-f"><span class="nw-fk">${k}</span><span class="nw-fv">${v == null || v === '' ? 'Not supplied' : v}</span></div>`; }

  async function openAsset(id, traceInfo) {
    _sel = id;
    const a = _byId[id]; if (!a) return;
    const dr = document.getElementById('nw-drawer'); if (!dr) return;
    const isProp = !a.property_type;
    const ti = isProp ? { label: 'Estate' } : typeInfo(a.property_type);
    const linkedDevices=OpsModal.count(a.sentinel_count);
    const cond = a.condition || '—';
    const down = traceDown(id);
    const up = traceUp(id);
    const outfallInChain = down.find(n => n._wb) || null;
    const traceLine = traceInfo ? `<div class="nw-tracebar">${traceInfo.dir === 'down' ? 'Downstream' : 'Upstream'} references · ${traceInfo.count} related record${traceInfo.count === 1 ? '' : 's'}${traceInfo.props ? ' · ' + traceInfo.props + ' estates' : ''}. Only supplied links with valid endpoints are drawn.</div>` : '';
    dr.innerHTML = `
      <div class="nw-dr-head">
        <div><div class="nw-dr-name">${esc(a.property_name || a.asset_code || id)}</div>
          <div class="nw-dr-sub">${esc(ti.label)}${a.zone ? ' · ' + esc(a.zone) : ''} · <span style="color:${a.needs_attention ? 'var(--caut)' : condColor(cond)}">${a.needs_attention ? 'Needs attention' : a.condition ? esc(OpsModal.label(a.condition)) : 'Condition not supplied'}</span></div></div>
        <button class="nw-dr-x" aria-label="Close asset inspector" onclick="OpsNetwork.closeDrawer()">&times;</button>
      </div>
      ${traceLine}
      <div class="nw-vqs">
        ${vq(a.location_verified, 'Location')}
        ${!isProp ? vq(a.topology_verified, 'Topology') : ''}
        ${!isProp ? vq(a.dimensions_verified, 'Dimensions') : ''}
        ${vq(linkedDevices===null ? null : linkedDevices>0, 'Device links')}
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
        ${!isProp ? fieldRow('Capacity', OpsModal.reading(a.capacity_liters,0) !== null ? Number(a.capacity_liters).toLocaleString() + ' L' : null) : ''}
        ${fieldRow('Recorded condition', `<span style="color:${condColor(cond)}">${esc(OpsModal.label(cond))}</span>`)}
        ${a.risk_level ? fieldRow('Recorded risk', `<span style="color:${riskColor(a.risk_level)}">${esc(OpsModal.label(a.risk_level))}</span>`) : ''}
        ${!isProp ? fieldRow('Flow direction', a.flow_direction?esc(OpsModal.label(a.flow_direction)):null) : ''}
        ${fieldRow('Water level', OpsModal.reading(a.water_level,0,100)!==null ? Math.round(OpsModal.reading(a.water_level,0,100)) + '%' : null)}
        ${fieldRow('Reading coverage', esc(telemetryLabel(a)))}
        ${fieldRow('Last reading', a.latest_reading && Number.isFinite(new Date(a.latest_reading).getTime()) ? OpsModal.fmtDateTime(a.latest_reading) : 'Not supplied')}
        ${fieldRow('Derived health', a.health_score != null ? esc(a.health_score) + '/100 · not an inspection result' : 'Not supplied')}
        ${fieldRow('Linked devices reported', linkedDevices===null ? 'Unknown' : linkedDevices)}
        ${fieldRow('Map location', coordinates(a) ? coordinates(a).map(value=>value.toFixed(6)).join(', ') : 'Missing or invalid coordinates — not plotted')}
        ${fieldRow('Location accuracy', a.location_verified === true || a.location_verified === 1 ? 'Verified' : a.location_verified === false || a.location_verified === 0 ? 'Unverified · do not use for field navigation' : 'Verification not supplied')}
        ${fieldRow('Last inspection', fmtDate(a.last_inspected_at))}
        ${fieldRow('Last maintenance', fmtDate(a.last_maintenance))}
      </div>
      <div class="nw-connected">Supplied links: ${up.length} upstream · ${down.filter(n => !n._wb && String(n.property_id) !== String(id)).length} downstream${outfallInChain ? ' · receiving water → ' + esc(outfallInChain.name) : ''}</div>
      <div class="nw-dr-actions">
        <button class="fg-action" onclick="OpsNetwork.trace('${OpsModal.sid(id)}','up')">Trace upstream</button>
        <button class="fg-action" onclick="OpsNetwork.trace('${OpsModal.sid(id)}','down')">Trace downstream</button>
      </div>
      <div class="nw-dr-actions">
        <button class="ghost fg-action" onclick="OpsNetwork.clearTrace()">Clear trace</button>
        <button class="ghost fg-action" onclick="OpsServices.open()">Services →</button>
      </div>
      <div class="nw-mh"><div class="nw-mh-h">Maintenance history</div><div id="nw-mh-body">${OpsModal.loading('Loading maintenance history…')}</div></div>`;
    showInspector();
    loadMaintenance(id);
  }

  async function loadMaintenance(id) {
    const el = document.getElementById('nw-mh-body'); if (!el) return;
    try {
      const r = await api('/network/asset/' + encodeURIComponent(id) + '/maintenance');
      const rows = r && r.data;
      if (!Array.isArray(rows)) throw new Error('Maintenance history not supplied');
      el.innerHTML = rows.length ? rows.map(e => `<div class="nw-mh-row"><div class="nw-mh-d">${OpsModal.fmtDateTime(e.occurred_at)}</div><div><div class="nw-mh-t">${esc(OpsModal.label(e.event_type || 'Maintenance event'))}</div><div class="nw-mh-s">${esc(e.description || '')}</div></div></div>`).join('') : OpsModal.emptyState('','No maintenance history returned','No dated maintenance events were returned for this asset.');
    } catch (err) { el.innerHTML = OpsModal.failure('Maintenance history',err,`OpsNetwork.loadMaintenance('${OpsModal.sid(id)}')`); }
  }

  function openWaterBody(id) {
    _sel = null;
    const w = _wbId[id]; if (!w) return;
    const dr = document.getElementById('nw-drawer'); if (!dr) return;
    const upstream = (_g.assets || []).filter(a => a.water_body_id === id);
    const downstream = w.downstream_water_body_id && _wbId[w.downstream_water_body_id];
    dr.innerHTML = `
      <div class="nw-dr-head"><div><div class="nw-dr-name">${esc(w.name)}</div><div class="nw-dr-sub">${esc(OpsModal.label(w.type || 'water body'))} · ${OpsModal.status(w.status || 'unknown',null,null,'drainage')}</div></div><button class="nw-dr-x" aria-label="Close water-body details" onclick="OpsNetwork.closeDrawer()">&times;</button></div>
      <div class="nw-fields">
        ${fieldRow('Type', esc(OpsModal.label(w.type)))}
        ${fieldRow('Connected outfalls / drains', upstream.length)}
        ${fieldRow('Downstream', downstream ? esc(downstream.name) : '—')}
        ${fieldRow('Capacity', w.capacity_pct != null ? w.capacity_pct + '%' : null)}
        ${fieldRow('Condition', esc(OpsModal.label(w.condition)))}
        ${fieldRow('Last inspection', fmtDate(w.last_inspected_at))}
        ${fieldRow('Status', esc(OpsModal.label(w.status)))}
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
        <div><b>${z.property_count}</b><span>Estates</span></div>
        <div><b>${z.asset_count}</b><span>Drainage assets</span></div>
        <div><b>${z.length_km} km</b><span>Network</span></div>
        <div><b>${OpsModal.count(z.sentinel_count) ?? 'Unknown'}</b><span>Devices reported</span></div>
        <div><b>${z.attention}</b><span>Need attention</span></div>
        <div><b>${esc(z.condition || '—')}</b><span>Condition</span></div>
      </div>`;
    showInspector();
  }

  // Network owns topology and location. Device fleet owns diagnostics and commands.
  function devicePreview(x) {
    const estate = x.property_ref || x.property_id;
    const primary = x.primary_asset || (x.assets || []).find(a=>a.is_primary);
    const asset = primary?.property_id || x.asset_id;
    return `<div class="fg-facts-grid">${OpsModal.fact('Estate',estate ? OpsModal.link('properties',estate,esc(x.property_name || x.site_name || estate)) : esc(x.property_name || x.site_name || OpsModal.missing.absent))}${OpsModal.fact('Linked asset',asset ? OpsModal.link('assets',asset,esc(primary?.name || primary?.property_name || x.asset_name || asset)) : esc(OpsModal.missing.absent))}</div><p class="capability-note">Map snapshot. Open the device record for current telemetry, diagnostics and management.</p>`;
  }

  function openDevice(id) {
    const dr = document.getElementById('nw-drawer'); if (!dr) return;
    _sel = null; _devSel = id;
    const S = window.OpsSensors;
    // Use the supplied map snapshot or an already cached record, never fetch a
    // second device list merely to duplicate the owner's full detail interface.
    const rich = (S && S.getSensor) ? S.getSensor(id) : null;
    const x = rich || _snById[id] || { sensor_id: id };
    const sid = OpsModal.sid(id);
    const stLbl = 'Registry: ' + OpsModal.label(x.status || 'unknown');

    dr.innerHTML = `
      <div class="nw-dr-head">
        <div style="min-width:0">
          <div class="nw-crumb">Devices <span>›</span> ${esc(x.site_name || x.zone || 'Network')}</div>
          <div class="nw-dr-name">${esc(x.name || x.sensor_id)}</div>
          <div class="nw-status-line">
            <span class="nw-tok id">${esc(x.sensor_id)}</span><span class="sep">·</span>
            ${OpsModal.status(x.device_state || 'unknown',null,null,'device')} ${OpsModal.status(x.status || 'unknown',stLbl,'neutral')}
          </div>
        </div>
        <button class="nw-dr-x" aria-label="Close device preview" onclick="OpsNetwork.closeDrawer()">&times;</button>
      </div>
      ${devicePreview(x)}
      <div class="nw-abar">
        <button type="button" class="nw-ab-main fg-action fg-action-primary" onclick="OpsNetwork.openInDevices('${sid}')">Open in Device fleet</button>
      </div>`;
    showInspector();
  }

  // Jump to the Sentinel Devices module and open this device's full drawer.
  function openInDevices(id) {
    try {
      closeDrawer();
      // fgOpen switches to the Devices (key: 'sensors') tab, waits for it to
      // render (so its styles are injected) and opens the sensor drawer.
      if (typeof fgOpen === 'function') { fgOpen('sensors', id); return; }
      if (typeof switchTab === 'function') switchTab('sensors');
      setTimeout(() => { if (window.OpsSensors && OpsSensors.viewSensor) OpsSensors.viewSensor(id); }, 400);
    } catch (_) {}
  }

  // The inspector is a third column of the page, not an overlay — reveal it by
  // splitting the layout and let the map reflow into the remaining width.
  let _inspectorReturn = null;
  function showInspector() {
    const m = _root && _root.querySelector('.nw-main'); if (m) m.classList.add('split');
    const dr = document.getElementById('nw-drawer'); if (dr) {
      if (!dr.contains(document.activeElement)) _inspectorReturn = document.activeElement;
      dr.classList.add('open'); dr.scrollTop = 0;
      dr.setAttribute('role','region'); dr.setAttribute('aria-label','Network record inspector');
      const close = dr.querySelector('.nw-dr-x');
      if (close) { close.setAttribute('aria-label','Close network inspector'); close.focus({preventScroll:true}); }
      dr.onkeydown = event=>{ if (event.key === 'Escape') { event.preventDefault(); closeDrawer(); } };
    }
    resizeMapSoon();
  }
  function hideInspector() {
    const m = _root && _root.querySelector('.nw-main'); if (m) m.classList.remove('split');
    const dr = document.getElementById('nw-drawer'); if (dr) dr.classList.remove('open');
    if (window.OpsSensors && OpsSensors.dispose3D) OpsSensors.dispose3D();
    resizeMapSoon();
  }
  function resizeMapSoon() { setTimeout(() => { try { if (map) map.invalidateSize(); } catch (_) {} }, 260); }

  function closeDrawer() {
    hideInspector(); _sel = null; _devSel = null; clearTrace();
    if (_inspectorReturn?.isConnected && _inspectorReturn.closest('.tab-content')?.classList.contains('active')) _inspectorReturn.focus({preventScroll:true});
    else _root?.querySelector('[aria-label="Network workspace"] button')?.focus({preventScroll:true});
    _inspectorReturn = null;
  }
  function clearTrace() { if (_traceLayer) _traceLayer.clearLayers(); }

  // ════════════ list view ════════════
  function telemetryLabel(a) {
    if (a.telemetry_state === 'recent') return 'Recent · ' + a.reporting_count + ' reporting';
    if (a.telemetry_state === 'partial') return 'Partial · ' + a.reporting_count + '/' + a.sentinel_count + ' reporting';
    if (a.telemetry_state === 'stale_or_invalid') return 'Stale or invalid · not used';
    return 'No recent reading supplied';
  }
  function listHTML() {
    let assets = (_g.assets || []);
    if (_filter && _filter !== 'all' && _filter !== 'km') {
      if (_filter === 'outfall') assets = assets.filter(a => a.is_outfall);
      else if (_filter === 'attention') assets = assets.filter(a => a.needs_attention);
    }
    const zoneChips = (_g.zones || []).slice(0, 8).map(z => `<button class="nw-zchip" onclick="OpsNetwork.openZone(${esc(JSON.stringify(z.zone))})">${esc(z.zone)} · ${z.asset_count}</button>`).join('');
    const rows = assets.map(a => {
      const ti = typeInfo(a.property_type);
      return `<tr>
        <td><div class="lv-name-cell"><div class="lv-avatar">${OpsSpatial.icon(OpsSpatial.assetKind(a.property_type))}</div><div style="min-width:0;"><button type="button" class="record-link lv-name" onclick="OpsNetwork.openAsset('${OpsModal.sid(a.property_id)}')">${esc(a.property_name || a.asset_code)}</button><span class="lv-source">${esc(a.asset_code || a.property_id)}</span></div></div></td>
        <td>${esc(ti.label)}</td>
        <td>${esc(a.zone) || '<span class="lv-dash">—</span>'}</td>
        <td><span style="color:${condColor(a.condition)}">${esc(OpsModal.label(a.condition || 'unknown'))}</span></td>
        <td class="num">${OpsModal.reading(a.water_level,0,100)!==null ? Math.round(OpsModal.reading(a.water_level,0,100)) + '%' : 'Unknown'}<div class="lv-source">${esc(telemetryLabel(a))}</div></td>
        <td class="fg-number">${OpsModal.count(a.sentinel_count) ?? 'Unknown'}</td>
        <td class="lv-mono">${fmtDate(a.last_inspected_at)}</td>
      </tr>`;
    }).join('');
    return `<div class="lv-wrap">
      <div class="lv-toolbar"><div class="nw-zones">${zoneChips || '<span class="lv-dash">No zone labels supplied</span>'}</div></div>
      <div class="lv-scroll"><table class="lv-table">
        <thead><tr><th scope="col">Asset</th><th scope="col">Type</th><th scope="col">Zone</th><th scope="col">Recorded condition</th><th scope="col">Water level</th><th scope="col">Devices</th><th scope="col">Last inspection</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="7">${OpsModal.emptyState(OpsModal.entityIcon('asset'),(_g.assets || []).length?'No matching drainage assets':'No drainage assets returned',(_g.assets || []).length?'Change the network filter to review other returned assets.':'No drainage assets were returned by the network registry. This does not establish that no assets are registered.')}</td></tr>`}</tbody>
      </table></div>
    </div>`;
  }

  function filter(key) {
    if (!['all','attention','outfall'].includes(key)) return;
    _filter = _filter === key ? null : key;
    if (key === 'attention' || key === 'outfall') { _view = 'list'; }
    paint();
    _root.querySelector(`button.nw-kpi[onclick="OpsNetwork.filter('${key}')"]`)?.focus({preventScroll:true});
    if (_view === 'map') loadLeaflet().then(initMap);
  }


  return { render, viewRecord, mapRecord, chooseMapRecord, mapLibrary:loadLeaflet, setView, toggleLayer, filter, loadMaintenance, openAsset, openWaterBody, openZone, openDevice, openInDevices, trace, clearTrace, closeDrawer };
})();
window.OpsNetwork = OpsNetwork;
