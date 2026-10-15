/* ══════════════════════════════════════════════════════════════
   FlowGuard Ops — SITUATION
   "What needs my attention now, what's about to happen, and what
   are we doing about it?" — action-oriented, problem-first.
   Styled to the situation mockup: header + icon status strip, big
   live map with icon layer-pills, active incidents, flood risk by
   zone, situation timeline, rainfall intensity — plus proactive
   emerging risks / response teams / recommended actions below.

   Real data: /analytics/map-data · /forecast/horizons · /alerts ·
   /teams · /tickets/planner · Open-Meteo (rainfall).
   ══════════════════════════════════════════════════════════════ */
const OpsSituation = (function () {
  'use strict';

  const esc = s => OpsModal.escape(s);
  const api = p => OpsModal.apiGet(p);

  let _root = null, map = null, baseTiles = null, layers = null, _data = {};
  const incidentMarkers = new Map();
  let weatherEstate='',weatherRevision=0,situationRevision=0;
  function weatherEstates(){const records=[...(_data.md?.areas||[]),...(_data.hz?.estates||[])];return [...new Map(records.filter(r=>r.property_id).map(r=>[String(r.property_id),r])).values()];}
  async function selectWeather(id){
    weatherEstate=String(id||'');const revision=++weatherRevision,estate=weatherEstates().find(r=>String(r.property_id)===weatherEstate);
    _data.wx=null;const target=document.getElementById('sit-rain');
    if(target)target.innerHTML='<p class="fg-weather-context">'+(estate?'Loading estate weather estimate…':'Choose an estate to inspect its rainfall. A national rainfall total is not meaningful.')+'</p>';
    const update=()=>{const strip=document.getElementById('sit-statistics');if(strip)strip.innerHTML=statusStrip(model());};update();
    if(!estate)return;
    try{const wx=await OpsWeather.load(estate);if(revision!==weatherRevision||!_root?.isConnected)return;_data.wx={...wx,estateName:estate.name||estate.property_name||estate.property_id};renderRainfall();update();}
    catch(err){if(revision!==weatherRevision||!target?.isConnected)return;target.innerHTML=OpsModal.emptyState('','Weather unavailable',OpsWeather.errorDescription(err));}
  }
  const coordinates = record => {
    if (![record.latitude,record.longitude].every(value=>(typeof value==='number' || typeof value==='string' && value.trim()!=='') && Number.isFinite(Number(value)))) return null;
    const lat = Number(record.latitude), lng = Number(record.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat)<=90 && Math.abs(lng)<=180 ? [lat,lng] : null;
  };
  const riskScore = value => (typeof value==='number' || typeof value==='string' && value.trim()!=='') && Number.isFinite(Number(value)) && Number(value)>=0 && Number(value)<=100 ? Number(value) : null;
  function selectIncident(id) {
    const marker = incidentMarkers.get(String(id));
    document.querySelectorAll('[data-situation-incident]').forEach(el=>{
      const selected = el.dataset.situationIncident === String(id);
      el.classList.toggle('selected',selected);
      el.querySelector('[aria-pressed]')?.setAttribute('aria-pressed',String(selected));
    });
    if (!marker || !map) return OpsModal.toast('Map location is unavailable for this incident; open its record for reported context.', 'watch');
    if (!map.hasLayer(layers.incidents)) { layers.incidents.addTo(map); document.querySelector('[onclick*="layer(\'incidents\'"]')?.setAttribute('aria-checked','true'); }
    map.panTo(marker.getLatLng()); marker.openPopup();
  }
  function freshnessSummary() {
    const feeds = [['Map context','/analytics/map-data'],['Incidents','/alerts'],['Teams','/teams'],['Forecast horizons','/forecast/horizons'],['Maintenance','/tickets/planner']];
    return OpsModal.provenance(feeds.map(([label,path])=>[label,_data.failed.includes(path)?'Unavailable':'Fetched this refresh']), 'Refresh time is not measurement time. Feed measurement timestamps were not supplied; review individual device timestamps in Device fleet.');
  }

  const riskColor = v => OpsSpatial.color(OpsSpatial.risk(v));
  const riskLevel = r => OpsModal.label(OpsSpatial.risk(r));
  const riskText = r => OpsSpatial.color(OpsSpatial.risk(r));
  const sevRank = s => ({ critical: 4, high: 3, moderate: 2, medium: 2, low: 1 }[String(s || '').toLowerCase()] || 1);
  const sevColor = s => OpsSpatial.color(s);

  function rel(t) { return OpsModal.relativeTime(t); }

  const ICON = {
    incident:'incident', flood:'water', rain:'rain', home:'estate',
    teams:'crew', risk:'estate', sensor:'device',
  };
  const svg = (kind, sz) => OpsSpatial.icon(kind,sz || 20);

  // ── map libs (same loader/basemap as the rest of the portal) ──
  function loadLeaflet() {
    return OpsNetwork.mapLibrary();
  }
  const themeDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
  const styleUrl = () => themeDark() ? 'https://tiles.openfreemap.org/styles/dark' : 'https://tiles.openfreemap.org/styles/positron';
  window.addEventListener?.('ops-theme-change', () => {
    if (!map || !baseTiles || !document.getElementById('sit-map')) return;
    map.removeLayer(baseTiles);
    baseTiles = L.maplibreGL({style:styleUrl(),attribution:'&copy; OpenFreeMap &copy; OSM'}).addTo(map);
  });
  function pin(color, size, pulse, kind) { return OpsSpatial.marker(kind || "estate", { color, attention: pulse }); }

  // ════════════════ render ════════════════
  function render(container) {
    _root = container;
    container.innerHTML = `<div class="sit"><div class="sit-load">Building the situation picture…</div></div>`;
    load();
  }

  async function load() {
    const revision=++situationRevision;
    ++weatherRevision;
    try {
      const failed = [];
      const optional = (path, fallback) => api(path).catch(() => { failed.push(path); return { data: fallback }; });
      const scoped=OpsModal.readRecord(await api('/analytics/estate-situation?'+(typeof OpsGeography!=='undefined'?OpsGeography.query():'')),'Estate situation');
      if(revision!==situationRevision)return;
      const [mapRes,hzRes,alertRes,teamRes,tickRes]=[scoped.md,scoped.hz,scoped.alerts,scoped.teams,scoped.ticks].map(data=>({data}));
      const list = (response,path) => {
        if (Array.isArray(response.data)) return response.data;
        if (!failed.includes(path)) failed.push(path);
        return [];
      };
      const object = (response,path) => {
        try { return OpsModal.readRecord(response,path === '/analytics/map-data' ? 'Map context' : 'Forecast horizons'); }
        catch(_) { if(!failed.includes(path)) failed.push(path); return {}; }
      };
      const md = object(mapRes,'/analytics/map-data'), hz = object(hzRes,'/forecast/horizons');
      if(!Array.isArray(hz.estates)) { hz.estates=[];if(!failed.includes('/forecast/horizons'))failed.push('/forecast/horizons'); }
      if(['areas','flood_risk','alerts','sensors'].some(key=>!Array.isArray(md[key]))) {
        if(!failed.includes('/analytics/map-data'))failed.push('/analytics/map-data');
        for(const key of ['areas','flood_risk','alerts','sensors'])if(!Array.isArray(md[key]))md[key]=[];
      }
      _data = { md, hz, alerts:list(alertRes,'/alerts'), teams:list(teamRes,'/teams'), ticks:list(tickRes,'/tickets/planner'), wx:null, failed };
      if(failed.length === 5) throw new Error('Operational feeds are unavailable');
      paint();
      if(weatherEstate)selectWeather(weatherEstate);
      if(failed.includes('/analytics/map-data')) return;
      try { await loadLeaflet(); if(revision!==situationRevision)return;initMap(); }
      catch (_) { const target = document.getElementById('sit-map'); if (target) target.innerHTML = OpsModal.failure('Situation map',new Error('The map could not be loaded. Incident and response feeds remain available alongside this panel.'),"reloadTab('situation')"); }
    } catch (err) {
      if(revision!==situationRevision)return;
      _root.innerHTML = OpsModal.failure('Command centre',err,"reloadTab('situation')",true);
    }
  }

  function model() {
    const { hz, alerts, teams, wx } = _data;
    const estates = (hz.estates || []);
    const active = alerts.filter(a => !['resolved', 'closed'].includes((a.status || 'active').toLowerCase()));
    const high = active.filter(a => (a.severity || '').toLowerCase() === 'high').length;
    const critical = active.filter(a => (a.severity || '').toLowerCase() === 'critical').length;
    const medium = active.filter(a => ['moderate', 'medium'].includes((a.severity || '').toLowerCase())).length;
    const observed = estates.filter(e => e.has_live === true && riskScore(e.current_risk)!=null);
    const atRisk = observed.filter(e => riskScore(e.current_risk) >= 60);
    const entering = estates.filter(e => riskScore(e.current_risk)!=null && riskScore(e.current_risk)<60 && riskScore(e.horizons?.h3)!=null && riskScore(e.horizons.h3)>=60);
    const onSite = teams.filter(t => (t.status || '').toLowerCase() === 'on_site').length;
    const enRoute = teams.filter(t => (t.status || '').toLowerCase() === 'en_route').length;
    const respond = onSite + enRoute;
    const p = hz.portfolio || {};
    const worst = observed.reduce((m, e) => Math.max(m, Number(e.current_risk)), 0);
    const overall = !observed.length ? 'Unknown' : worst >= 80 ? 'Critical' : worst >= 60 ? 'High' : worst >= 45 ? 'Elevated' : worst >= 25 ? 'Moderate' : 'Low';
    const hasForecast = estates.length>0 && estates.every(e=>riskScore(e.current_risk)!=null && riskScore(e.horizons?.h3)!=null);
    const avgNow = hasForecast ? estates.reduce((s,e)=>s+riskScore(e.current_risk),0)/estates.length : null;
    const avgH3 = hasForecast ? estates.reduce((s,e)=>s+Number(e.horizons.h3),0)/estates.length : null;
    const trend = avgH3 == null ? 'unknown' : avgH3 > avgNow + 3 ? 'up' : avgH3 < avgNow - 3 ? 'down' : 'flat';
    const zones = zoneRisk();
    return { estates, observed, active, critical, high, medium, atRisk, entering, respond, onSite, enRoute, overall, trend, hasForecast,p, wx, zones };
  }

  function zoneRisk() {
    const { md } = _data;
    const cityByProp = {}; (md.areas || []).forEach(a => { cityByProp[a.property_id] = a.city || a.state; });
    const z = {};
    (md.flood_risk || []).forEach(e => { const k = cityByProp[e.property_id] || 'Unzoned'; const value=e.risk_index; (z[k] = z[k] || []).push(value == null || value === '' || !Number.isFinite(Number(value)) || Number(value)<0 || Number(value)>100 ? null : Number(value)); });
    return Object.entries(z).map(([name, arr]) => {const supplied=arr.filter(value=>value != null);return { name, risk:supplied.length ? Math.max(...supplied) : null, n:arr.length, missing:arr.length-supplied.length };}).sort((a, b) => (b.risk ?? -1) - (a.risk ?? -1));
  }

  function paint() {
    const M = model();
    _root.innerHTML = `<div class="sit">
      ${header(M)}
      ${typeof OpsGeography!=='undefined'?OpsGeography.form():''}
      <p class="fg-weather-context">Geographic scope includes linked estate records only. Response teams are those assigned to returned estate incidents, not all available teams nationwide. Unlinked records are excluded.</p>
      ${_data.failed.length ? '<div class="fgd-note" role="status">Partial data: some operational feeds are unavailable. Missing feeds are not evidence of normal conditions. Refresh to retry.</div>' : ''}
      <div class="sit-briefing">${focusCard(M)}<div id="sit-statistics">${statusStrip(M)}</div></div>
      <div class="sit-main">${mapCard()}<div class="sit-side">${incidentsCard(M)}${teamsCard(M)}</div></div>
      <div class="sit-response-grid">
        ${zonesCard(M)}
        ${actionsCard(M)}
      </div>
      <div class="sit-row2">
        ${timelineCard()}
        ${rainfallCard(M)}
      </div>
      <div class="sit-row2">
        ${emergingCard(M)}
        <div class="sit-card"><div class="sit-h"><h2>Data freshness</h2></div>${OpsModal.provenance([['Situation fetched',OpsModal.fmtDateTime(new Date())]],'Incident age is event age, not sensor freshness. Fetch time is not measurement time.')}${freshnessSummary()}<button class="fg-action" onclick="switchTab('sensors')">Review device streams →</button></div>
      </div>
    </div>`;
    if(_data.wx)renderRainfall();
  }

  function focusCard(M) {
    const lead = M.active.slice().sort((a, b) => sevRank(b.severity) - sevRank(a.severity) || new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
    if (!lead) return `<section class="sit-focus calm"><div class="sit-focus-copy"><span class="sit-focus-k">FLOWGUARD OPERATIONS</span><h2>${_data.failed.includes('/alerts') ? 'Incident feed unavailable.' : 'No active incidents in this feed.'}</h2><p>Review emerging risks and device health before the next rainfall window.</p><button class="fg-action fg-action-primary" onclick="switchTab('forecast')">Review forecast →</button></div><figure class="sit-focus-art"><img src="assets/${_data.failed.includes('/alerts') ? 'guide-offline.png' : 'guide-normal.png'}" alt="" width="1024" height="1024"><figcaption>Illustration · check the recorded conditions</figcaption></figure></section>`;
    const sev = (lead.severity || 'moderate').toLowerCase();
    const where = [lead.site_name || lead.client_name || lead.property_name, lead.zone].filter(Boolean).join(' · ');
    const label = sev === 'critical' ? 'Critical incident' : sev === 'high' ? 'High-priority incident' : 'Incident requires review';
    const deviceIssue = /offline|not reporting|connectivity/i.test(lead.alert_type || '');
    return `<section class="sit-focus ${sev === 'critical' ? 'critical' : 'watch'}"><div class="sit-focus-copy"><span class="sit-focus-k">FLOWGUARD OPERATIONS · ${label}</span><h2>${esc(lead.alert_type || lead.description || 'Review the active incident')}.</h2><div class="sit-focus-location">${esc(where || 'Location pending')} · raised ${esc(rel(lead.created_at))}</div><div class="sit-guide-step"><strong>What needs attention</strong><p>${esc(lead.description || lead.alert_type || 'Review the recorded conditions.')}</p></div><div class="sit-guide-step"><strong>Next step</strong><p>Review the incident and confirm a response owner before arranging work.</p></div><button class="fg-action fg-action-primary ${sev === 'critical' ? 'danger' : ''}" onclick="OpsSituation.openIncident('${OpsModal.sid(lead.alert_id || lead.id || '')}')">Review incident →</button></div><figure class="sit-focus-art"><img src="assets/${deviceIssue ? 'guide-offline.png' : 'guide-inspection.png'}" alt="" width="1024" height="1024"></figure></section>`;
  }

  // ── header ──
  function header(M) {
    const bad = M.critical + M.high, tone = M.critical ? 'bad' : bad ? 'warn' : 'ok';
    const status = _data.failed.length ? 'Partial data' : M.critical ? `${M.critical} critical` : M.active.length ? `${M.active.length} active incidents` : 'No active incidents reported';
    const date = OpsModal.fmtDate(new Date().toISOString());
    return OpsModal.pageHeader({title:'Command centre',subtitle:'Your operational picture. Know what needs attention, where, and who is responding.',actions:`<div class="sit-head-r">
        <span class="sit-status ${tone}"><i></i>${esc(status)}</span>
        <span class="sit-date">${svg('calendar',15)} ${date}</span>
        <button class="ghost fg-action" onclick="reloadTab('situation')">${OpsModal.actionIcon('refresh')} Refresh</button>
      </div>`});
  }

  // ── status strip (icon-left cards) ──
  function statusStrip(M) {
    const wx = M.wx || {};
    const rainDelta = wx.last24 != null && wx.prev24 > 0 ? Math.round(((wx.last24 - wx.prev24) / wx.prev24) * 100) : null;
    const trendTxt = M.overall === 'Unknown' || M.trend === 'unknown' ? 'Forecast trend unavailable' : M.trend === 'up' ? '↑ Trending upward' : M.trend === 'down' ? '↓ Easing' : 'Stable';
    const cell = (icon, tint, label, value, sub, destination, tone) => `<div class="sit-stat" data-tone="${tone || 'neutral'}">
      <div class="sit-stat-ic" style="background:var(--surface-2);color:${tint};">${svg(icon, 22)}</div>
      <div class="sit-stat-b"><div class="sit-stat-l fg-metric-label">${label}</div><div class="sit-stat-v fg-metric-value">${value}</div><div class="sit-stat-s">${sub}</div><button class="metric-link" onclick="${tone==='weather'?"document.getElementById('sit-weather-estate').focus()":`switchTab('${destination}')`}">${tone==='weather'?'Estate weather':destination === 'alerts' ? 'All incidents' : destination === 'teams' ? 'View teams' : destination === 'properties' ? 'View estates' : 'Full forecast'} →</button></div>
    </div>`;
    return `<div class="sit-strip">
      ${cell(ICON.incident, 'var(--err)', 'Active incidents', _data.failed.includes('/alerts') ? 'Unknown' : M.active.length, _data.failed.includes('/alerts') ? 'Feed unavailable' : `${M.critical} critical · ${M.high} high · ${M.medium} moderate`, 'alerts', M.critical || M.high ? 'attention' : 'neutral')}
      ${cell(ICON.flood, 'var(--warn)', 'Highest recent risk', M.overall, `${M.observed.length}/${M.estates.length} estates · ${trendTxt}`, 'forecast', M.overall === 'Critical' ? 'attention' : 'neutral')}
      ${cell(ICON.rain, 'var(--chart-rain)', 'Estate rain estimate · 24h', wx.last24 != null ? esc(OpsWeather.amount(wx.last24)) + '<span class="u">mm</span>' : 'Unknown', esc(wx.estateName || 'Choose an estate below') + (rainDelta != null ? ` · ${rainDelta >= 0 ? '↑' : '↓'} ${Math.abs(rainDelta)}% vs prior 24h` : ''), 'forecast', 'weather')}
      ${cell(ICON.home, 'var(--blue)', 'At risk estates', M.overall === 'Unknown' ? 'Unknown' : M.atRisk.length, `${M.observed.length!==M.estates.length ? `${M.observed.length} assessed · ` : ''}${!M.hasForecast ? 'Future risk unavailable' : `${M.entering.length} predicted to enter high (3h)`}`, 'properties', 'monitor')}
      ${cell(ICON.teams, 'var(--ok)', 'Response teams', _data.failed.includes('/teams') ? 'Unknown' : M.respond, _data.failed.includes('/teams') ? 'Feed unavailable' : `${M.onSite} on site · ${M.enRoute} en route`, 'teams', 'response')}
    </div>`;
  }

  // ── map ──
  function mapCard() {
    if(_data.failed.includes('/analytics/map-data')) return `<div class="sit-card sit-mapcard">${OpsModal.failure('Situation map',new Error('Map context was not supplied'),"reloadTab('situation')")}</div>`;
    const p = (key,icon,label,on) => OpsSpatial.layerButton({kind:{risk:"estate",incidents:"incident",sensors:"device"}[key],label,on,onclick:`OpsSituation.layer('${key}',this);this.setAttribute('aria-pressed',this.classList.contains('on'))`,extra:`data-layer="${key}"`});
    return `<div class="sit-card sit-mapcard">
      <div class="sit-h">
        <div><h2>Situation map</h2><span class="sit-meta">Recorded incidents, estate risk and device locations</span></div>
        <div class="sit-layers">
          ${p('risk', ICON.risk, 'Estate risk', true)}${p('incidents', ICON.incident, 'Incidents', true)}${p('sensors', ICON.sensor, 'Devices', false)}
        </div>
      </div>
      <div id="sit-map"></div>
      ${OpsSpatial.legend()}
    </div>`;
  }

  function initMap() {
    if (!window.L || !document.getElementById('sit-map')) return;
    if (map) { try { map.remove(); } catch (_) {} map = null; }
    map = L.map('sit-map', { center: [6.5244, 3.3792], zoom: 11, maxZoom:19, zoomControl: false, attributionControl: true });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    baseTiles = L.maplibreGL({ style: styleUrl(), attribution: '&copy; OpenFreeMap &copy; OSM' }).addTo(map);
    layers = { risk: L.layerGroup().addTo(map), incidents: L.layerGroup().addTo(map), sensors: L.layerGroup() };
    OpsSpatial.ready(_root);
    plot();
    if (window.ResizeObserver) new ResizeObserver(() => { try { map.invalidateSize(); } catch (_) {} }).observe(document.getElementById('sit-map'));
  }
  function popup(title, rows) {
    return `<div style="min-width:180px"><div style="font-weight:700;font-size:var(--fs-xs);color:var(--ink);margin-bottom:4px">${esc(title)}</div>${rows.filter(Boolean).map(r => `<div style="font-size:var(--fs-2xs);color:var(--ink-2);line-height:1.6">${esc(r)}</div>`).join('')}</div>`;
  }
  function plot() {
    if (!map) return;
    const { md } = _data; const pts = [];
    Object.values(layers).forEach(l => l.clearLayers());
    incidentMarkers.clear();
    (md.flood_risk || []).forEach(e => {
      const point = coordinates(e); if (!point) return; const [lat,lng] = point;
      const r = e.risk_index == null || e.risk_index === '' || !Number.isFinite(Number(e.risk_index)) ? null : Number(e.risk_index), size = r >= 80 ? 18 : r >= 60 ? 15 : r >= 45 ? 12 : 9;
      const m = L.marker([lat, lng], { icon: OpsSpatial.marker('estate',{state:OpsSpatial.risk(r),attention:r>=80}), opacity: r != null && r < 25 ? 0.55 : 1, title:'Estate risk: ' + (e.name || e.property_name || e.property_id || 'Unnamed estate') });
      OpsModal.keyboardMarker(m);
      m.bindPopup(popup(e.name || 'Estate', [r == null ? 'Risk unavailable' : `Risk ${r}/100 · ${riskLevel(r)}`]));
      layers.risk.addLayer(m); pts.push([lat, lng]);
    });
    (md.alerts || []).forEach(a => {
      const point = coordinates(a); if (!point) return; const [lat,lng] = point;
      const m = L.marker([lat, lng], { icon: OpsSpatial.marker('incident', {state:a.severity,attention:sevRank(a.severity)>=3}), title:'Incident: ' + (a.alert_type || a.description || a.alert_id || 'Unnamed incident') });
      OpsModal.keyboardMarker(m);
      m.bindPopup(popup('⚠ ' + (a.alert_type || 'Incident'), [a.severity, a.description, a.site_name || a.client_name]));
      const id = String(a.alert_id || a.id || '');
      incidentMarkers.set(id,m);
      m.on('click',()=>selectIncident(id));
      layers.incidents.addLayer(m); pts.push([lat, lng]);
    });
    (md.sensors || []).forEach(s => {
      const point = coordinates(s); if (!point) return; const [lat,lng] = point;
      const col = s.status === 'active' ? 'var(--ink-3)' : s.status === 'maintenance' ? 'var(--warn)' : 'var(--err)';
      const m = L.marker([lat, lng], { icon: OpsSpatial.marker('device',{color:OpsSpatial.color(s.device_state || (s.status==='offline'?'offline':'unknown'),'device')}), opacity: 0.85, title:'Device: ' + (s.name || s.sensor_id || 'Unnamed device') });
      OpsModal.keyboardMarker(m);
      m.bindPopup(popup(s.name || s.sensor_id || 'Sensor', [s.status, s.site_name, s.zone]));
      layers.sensors.addLayer(m);
    });
    if (pts.length) { try { map.fitBounds(L.latLngBounds(pts).pad(0.18),{maxZoom:16}); } catch (_) {} }
    setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 80);
  }
  function layer(key, el) {
    if (!layers || !layers[key]) return;
    if (map.hasLayer(layers[key])) { map.removeLayer(layers[key]); el.classList.remove('on'); }
    else { layers[key].addTo(map); el.classList.add('on'); }
  }

  // ── active incidents ──
  function incidentsCard(M) {
    if (_data.failed.includes('/alerts')) return `<div class="sit-card">${OpsModal.failure('Active incidents',new Error('Incident feed unavailable. Active counts and ownership cannot be assessed.'),"reloadTab('situation')")}</div>`;
    const rows = M.active.slice().sort((a, b) => sevRank(b.severity) - sevRank(a.severity) || new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 4);
    const body = rows.length ? rows.map(a => {
      const sev = (a.severity || 'unknown').toLowerCase();
      const label = sev === 'critical' ? 'Critical' : sev === 'high' ? 'High' : ['moderate', 'medium'].includes(sev) ? 'Moderate' : ['minor','low'].includes(sev) ? 'Low' : 'Unknown';
      const where = [a.site_name || a.client_name || a.property_name, a.zone].filter(Boolean).join(' · ');
      const id = OpsModal.sid(a.alert_id || a.id || '');
      return `<div class="sit-inc" data-situation-incident="${esc(id)}">
        <span class="sit-inc-ic" style="color:${sevColor(sev)}">${svg(ICON.incident, 18)}</span>
        <div class="sit-inc-b"><button type="button" class="record-link sit-inc-t" onclick="OpsSituation.openIncident('${id}')">${esc(a.alert_type || a.description || 'Incident')}</button><div class="sit-inc-m">${esc(where || '—')}</div><button type="button" class="sit-link" aria-pressed="false" onclick="OpsSituation.selectIncident('${id}')">Locate on map</button></div>
        <div class="sit-inc-r">${OpsModal.status(sev,label,null,'severity')}<span class="sit-ago">${rel(a.created_at)}</span><span class="sit-owner">${esc(a.assigned_team || a.team_name || 'Owner not supplied')}</span></div>
      </div>`;
    }).join('') : OpsModal.emptyState('','No active incidents returned','Check device freshness and forecast conditions before assessing the situation.');
    return `<div class="sit-card"><div class="sit-h"><div><h2>Active incidents</h2><span class="sit-meta">${rows.length} shown of ${M.active.length} returned active incidents</span></div><button type="button" class="sit-link" onclick="switchTab('alerts')">View all</button></div>${body}<button type="button" class="sit-foot" onclick="switchTab('alerts')">View incident log →</button></div>`;
  }

  // ── flood risk by zone ──
  function zonesCard(M) {
    if(_data.failed.includes('/analytics/map-data'))return `<div class="sit-card">${OpsModal.failure('Flood risk by zone',new Error('The map feed did not supply estate risk or zone context.'),"reloadTab('situation')")}</div>`;
    const rows = M.zones.slice(0, 6);
    const body = rows.length ? rows.map(r => `<div class="sit-zone">
      <div class="sit-zone-n">${esc(r.name)}<span class="sit-zone-c">${r.n}</span></div>
      <div class="sit-zone-bar"><div style="width:${r.risk == null ? 0 : Math.min(100, r.risk)}%;background:${r.risk == null ? 'var(--ink-3)' : riskColor(r.risk)}"></div></div>
      <div class="sit-zone-lv" style="color:${r.risk == null ? 'var(--ink-3)' : riskText(r.risk)}">${r.risk == null ? 'Unknown' : riskLevel(r.risk)}${r.missing ? ' · incomplete' : ''}</div>
    </div>`).join('') : OpsModal.emptyState('','No zone risk returned','No zone assessments could be derived from the supplied estate coordinates and scores. Missing assessments do not establish low risk.');
    return `<div class="sit-card"><div class="sit-h"><h2>Flood risk by zone</h2><button type="button" class="sit-link" onclick="switchTab('forecast')">View details</button></div><div class="capability-note">Highest supplied estate risk in each zone; an incomplete zone is not fully assessed.</div>${body}</div>`;
  }

  // ── situation timeline ──
  function timelineCard() {
    if (_data.failed.includes('/alerts')) return `<div class="sit-card">${OpsModal.failure('Recent situation timeline',new Error('Incident event context was not supplied.'),"reloadTab('situation')")}</div>`;
    const { alerts } = _data;
    const evs = alerts.slice().sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)).slice(0, 6);
    const body = evs.length ? evs.map(a => {
      const st = (a.status || 'active').toLowerCase(), sev = (a.severity || '').toLowerCase();
      const resolved = ['resolved', 'closed'].includes(st);
      const color = resolved ? 'var(--ok)' : sevColor(sev);
      const where = a.site_name || a.client_name || a.property_name || '';
      const verb = resolved ? 'Resolved' : (a.alert_type || 'Event');
      const chip = resolved ? OpsModal.status('resolved',null,null,'incident') : OpsModal.status(sev,null,null,'severity');
      return `<div class="sit-tl"><span class="sit-tl-dot" style="color:${color}">${svg(resolved ? 'check' : ICON.incident,16)}</span>
        <div class="sit-tl-b"><div class="sit-tl-t">${esc(verb)}${where ? ' — ' + esc(where) : ''}</div><div class="sit-tl-m">${rel(a.updated_at || a.created_at)}</div></div>${chip}</div>`;
    }).join('') : OpsModal.emptyState('','No incident activity returned','No recent activity could be derived from the returned incident feed. This is not the full platform activity log.');
    return `<div class="sit-card"><div class="sit-h"><div><h2>Recent situation timeline</h2><span class="sit-meta">${evs.length} shown of ${alerts.length} returned incidents · latest recorded activity, not a complete event log</span></div><button type="button" class="sit-link" onclick="switchTab('alerts')">View all</button></div>${body}</div>`;
  }

  // ── rainfall ──
  function rainfallCard() {
    return `<div class="sit-card sit-weather-card"><div class="sit-h"><h2>Estate rainfall</h2><span class="sit-meta">Estimated · WAT</span></div><label class="fg-weather-select">Estate<select id="sit-weather-estate" onchange="OpsSituation.selectWeather(this.value)"><option value="">Choose an estate</option>${weatherEstates().map(e=>`<option value="${esc(e.property_id)}" ${String(e.property_id)===weatherEstate?'selected':''}>${esc(e.name||e.property_name||e.property_id)}${coordinates(e)?'':' · location missing'}</option>`).join('')}</select></label><div id="sit-rain"><p class="fg-weather-context">Choose an estate. Rainfall is not summed across the country.</p></div></div>`;
  }
  function renderRainfall() {
    const el = document.getElementById('sit-rain'); if (!el) return;
    const wx = _data.wx;
    if (!wx || !wx.hrs || !wx.hrs.length) { el.innerHTML = OpsModal.emptyState('','Rainfall data unavailable','No hourly weather readings were supplied. Missing rainfall is not zero rainfall.'); return; }
    const readings=wx.hrs.map(h=>OpsModal.reading(h.v,0));
    if(readings.every(v=>v===null)){el.innerHTML=OpsModal.emptyState('','Rainfall data unavailable','No valid hourly readings were supplied.');return;}
    if(typeof OpsCharts!=='undefined'){
      const peak=Math.max(...readings.filter(v=>v!==null));
      const pointLabels=wx.hrs.map(h=>Number.isFinite(new Date(h.t).getTime())?new Date(h.t).toLocaleTimeString('en-GB',{timeZone:'Africa/Lagos',hour:'2-digit',minute:'2-digit'})+' WAT':'Time unavailable');
      const selected=pointLabels.filter((_,i)=>i%6===0);
      el.innerHTML=`${typeof OpsWeather!=='undefined'&&wx.point?OpsWeather.summary(wx):''}<div class="rain-summary"><strong>${peak.toFixed(1)}<small> mm</small></strong><span>Peak hourly value in this view</span></div><div class="fg-weather-chart"></div><div class="fg-chart-footer" style="--chart-accent:var(--chart-rain)"><span><i></i>Past-hour estimate</span><span><i style="opacity:.35"></i>Forecast</span><span class="chart-hint">Hover or focus to inspect</span></div>`;
      OpsCharts.mount(el.querySelector('.fg-weather-chart'),readings,{type:'bar',pastLabel:'Past-hour estimate',yMax:Math.ceil(Math.max(30,peak)*1.15/5)*5,color:'var(--chart-rain)',label:'Hourly rainfall',unit:'mm',pointLabels,xLabels:selected,forecast:wx.hrs.map(h=>h.future===true),reference:30,referenceLabel:'30 mm reference'});
      return;
    }
    const peak=Math.max(...readings.filter(v=>v!==null));
    const max = Math.ceil(Math.max(30,peak)*1.15/5)*5;
    const threshPct = Math.round((30 / max) * 100);
    const hour=h=>Number.isFinite(new Date(h.t).getTime())?new Date(h.t).toLocaleTimeString('en-GB',{timeZone:'Africa/Lagos',hour:'2-digit',minute:'2-digit'}):'Time unavailable';
    const bars = wx.hrs.map((h,i) => {
      const v=readings[i],ht=v===null?0:Math.min(100,(v/max)*100);
      const col = v>=30?'var(--err)':'var(--chart-rain)';
      return `<div class="sit-bar${h.future?' is-forecast':''}" title="${hour(h)} WAT · ${v===null?'Unavailable':v+' mm'} · ${h.future?'Forecast':'Past-hour estimate'}"><div style="height:${ht}%;background:${col}"></div></div>`;
    }).join('');
    const labels = wx.hrs.map((h, i) => i % 6 === 0 ? `<span>${hour(h)}</span>` : '').join('');
    el.innerHTML = `${typeof OpsWeather!=='undefined'&&wx.point?OpsWeather.summary(wx):''}<div class="rain-summary"><strong>${peak.toFixed(1)}<small> mm</small></strong><span>Peak hourly value in this view</span></div><div class="rain-plot"><div class="rain-axis"><span>${max}</span><span>${max/2}</span><span>0</span></div><div class="sit-rain-chart"><div class="rain-grid"></div><div class="sit-thresh" style="bottom:${threshPct}%"><span>30 mm reference</span></div>${bars}</div></div>
      <div class="sit-rain-x">${labels}</div>
      <div class="sit-rain-lg"><span><i style="background:var(--chart-rain)"></i>Past-hour estimate</span><span><i class="rain-forecast-key"></i>Forecast</span><span class="faint">Hourly mm · not flood confirmation</span></div>`;
  }

  // ── emerging risks ──
  function emergingCard(M) {
    const rows = M.estates.filter(e => M.entering.includes(e) || e.anomaly)
      .sort((a, b) => ((b.horizons && b.horizons.h6) || 0) - ((a.horizons && a.horizons.h6) || 0)).slice(0, 3);
    const body = rows.length ? rows.map(e => {
      const forecastRisk = riskScore(e.horizons?.h3);
      const to = riskLevel(forecastRisk), from = riskLevel(e.current_risk);
      const when = e.critical_window && e.critical_window.label ? e.critical_window.label : 'the next few hours';
      const drivers = (Array.isArray(e.drivers) ? e.drivers : []).slice(0, 2).map(d => d.label).join('; ') || (e.anomaly ? e.anomaly.note : 'rising trend');
      return `<div class="sit-emerge"><div class="sit-emerge-t"><span style="color:var(--warn)">${svg(ICON.incident, 15)}</span> ${esc(e.name)} — ${from} → <b style="color:${riskColor(forecastRisk)}">${to}</b></div>
        <div class="sit-emerge-m">Expected around ${esc(when)}. ${esc(drivers)}.</div>
        <div class="sit-emerge-m">${esc(e.recommendation || 'Review preventive inspection needs')}</div>
        <button class="sm fg-action" onclick="OpsSituation.act('${esc(e.property_id)}')">Review estate forecast</button></div>`;
    }).join('') : OpsModal.emptyState('',M.hasForecast?'No emerging risks flagged':'Future risk unavailable',M.hasForecast?'No emerging risks were flagged in the supplied forecast. This is not proof of normal conditions.':'Forecast inputs are unavailable. Review current incidents and device data.');
    return `<div class="sit-card"><div class="sit-h"><div><h2>Emerging risks</h2><span class="sit-meta">Not yet incidents — what may happen next</span></div></div>${body}</div>`;
  }

  // ── response teams ──
  function teamsCard(M) {
    if (_data.failed.includes('/teams')) return `<div class="sit-card">${OpsModal.failure('Response teams',new Error('Team feed unavailable. Response coverage is unknown.'),"reloadTab('situation')")}</div>`;
    const teams = _data.teams.slice().sort((a, b) => (['en_route', 'on_site'].includes((a.status || '').toLowerCase()) ? 0 : 1) - (['en_route', 'on_site'].includes((b.status || '').toLowerCase()) ? 0 : 1)).slice(0, 5);
    const body = teams.length ? teams.map(t => {
      const st = (t.status || 'unknown').toLowerCase();
    const label = OpsModal.label(st);
      const target = t.dispatch_destination || t.current_assignment || t.assigned_property || '';
      return `<div class="sit-team"><div><div class="sit-team-n">${esc(t.name || t.team_name || 'Team')}</div><div class="sit-team-m">${label}${target ? ' → ' + esc(target) : ''}</div></div>${OpsModal.status(st,label,null,'crew')}</div>`;
    }).join('') : OpsModal.emptyState('','No response teams returned','The returned team feed has no response teams. This does not establish that no teams are configured.');
    return `<div class="sit-card"><div class="sit-h"><div><h2>Response teams</h2><span class="sit-meta">${teams.length} shown of ${_data.teams.length} returned teams · on-site and en-route first</span></div><button type="button" class="sit-link" onclick="switchTab('teams')">View teams</button></div>${body}</div>`;
  }

  // ── recommended actions ──
  function actionsCard(M) {
    const acts = [];
    M.active.filter(a => !a.assigned_team && !a.team_name).slice(0, 2).forEach(a => acts.push({ pr: sevRank(a.severity) >= 3 ? 'High' : 'Moderate', t: 'Review response ownership', why: a.site_name || a.property_name || a.alert_type || 'Active incident', cta: 'Review incident', tab: 'alerts',id:a.alert_id || a.id }));
    M.estates.filter(e => ['critical', 'warning'].includes(e.recommendation_level)).slice(0, 3).forEach(e => acts.push({ pr: e.recommendation_level === 'critical' ? 'High' : 'Moderate', t: e.recommendation || 'Preventive work', why: `${e.name} · risk ${e.current_risk}`, cta: 'Review estate forecast', tab: 'forecast',id:e.property_id }));
    (_data.md.sensors || []).filter(s => s.device_state === 'offline' || s.sensor_state && s.sensor_state !== 'ok' || s.status && s.status !== 'active').slice(0, 2).forEach(s => acts.push({ pr: 'Moderate', t: `Review device ${s.name || s.sensor_id || ''}`.trim(), why: `${OpsModal.label(s.device_state || s.status || s.sensor_state)} · ${s.site_name || s.property_name || ''}`, cta: 'Review device', tab: 'sensors',id:s.sensor_id }));
    (_data.ticks || []).filter(t => t.scheduled_date && OpsModal.pastDue(t.scheduled_date) && !['done', 'closed', 'resolved', 'completed', 'cancelled'].includes((t.status || '').toLowerCase())).slice(0, 2).forEach(t => acts.push({ pr: 'Moderate', t: t.title || (t.work_type ? OpsModal.label(t.work_type) : 'Scheduled work'), why: 'Past scheduled date', cta: 'Review legacy record', tab: 'maintenance',id:t.ticket_id }));
    const list = acts.slice(0, 6);
    const body = list.length ? list.map((a, i) => `<div class="sit-act">
      <div class="sit-act-n">${i + 1}</div>
      <div class="sit-act-b"><div class="sit-act-t">${esc(a.t)}</div><div class="sit-act-m">${OpsModal.status(a.pr.toLowerCase(),null,null,'severity')} <span class="sit-act-context">${esc(a.why)}</span></div></div>
      <button class="sm fg-action" onclick="${a.id != null && a.id !== '' ? a.tab==='forecast' ? `OpsSituation.act('${OpsModal.sid(a.id)}')` : `fgOpen('${a.tab}','${OpsModal.sid(a.id)}')` : `switchTab('${a.tab}')`}">${esc(a.cta)}</button></div>`).join('') : OpsModal.emptyState('','No response prompts derived','No prompts were derived from the supplied feeds. Missing feeds do not establish normal conditions.');
    return `<div class="sit-card sit-queue"><div class="sit-h"><div><h2>Response queue</h2><span class="sit-meta">Ownership, preventive work and past scheduled dates · ${list.length} shown of ${acts.length} derived prompts</span></div></div><div class="sit-acts">${body}</div></div>`;
  }

  function openIncident(id) { if (window.fgOpen) fgOpen('alerts', id); else switchTab('alerts'); }
  function act(pid) { if (window.OpsForecast && window.switchTab) { switchTab('forecast'); setTimeout(() => { try { OpsForecast.select && OpsForecast.select(pid); } catch (_) {} }, 400); } else switchTab('maintenance'); }


  return { render, layer, openIncident, selectIncident, act, selectWeather };
})();
window.OpsSituation = OpsSituation;
