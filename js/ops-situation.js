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

  const esc = s => (window.OpsModal && OpsModal.escape) ? OpsModal.escape(s) : String(s == null ? '' : s);
  const api = p => OpsModal.apiGet(p);

  let _root = null, map = null, baseTiles = null, layers = null, _data = {};

  const riskColor = r => r >= 80 ? '#a11313' : r >= 60 ? '#d9463c' : r >= 45 ? '#e8720e' : r >= 25 ? '#e0a012' : '#1f9d5b';
  const riskLevel = r => r >= 80 ? 'Critical' : r >= 60 ? 'High' : r >= 45 ? 'Elevated' : r >= 25 ? 'Moderate' : 'Low';
  const sevRank = s => ({ critical: 4, high: 3, moderate: 2, medium: 2, low: 1 }[String(s || '').toLowerCase()] || 1);
  const sevColor = s => ({ critical: '#a11313', high: '#d9463c', moderate: '#e08e12', medium: '#e08e12', low: '#1f9d5b' }[String(s || '').toLowerCase()] || '#7d8fa3');

  function rel(t) {
    if (!t) return '—';
    const m = Math.floor((Date.now() - new Date(t).getTime()) / 60000);
    if (m < 1) return 'just now'; if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }

  const ICON = {
    incident: '<path d="M10.3 3.9L2.6 17.5a1.5 1.5 0 001.3 2.3h16.2a1.5 1.5 0 001.3-2.3L13.7 3.9a1.5 1.5 0 00-2.6 0z"/><path d="M12 9v4M12 17h.01"/>',
    flood: '<path d="M12 3s6 6 6 10a6 6 0 01-12 0c0-4 6-10 6-10z"/><path d="M9 13a3 3 0 003 3"/>',
    rain: '<path d="M20 16.2A4.5 4.5 0 0017.5 8h-1.8A7 7 0 104 14.9"/><path d="M8 19v2M12 20v2M16 19v2"/>',
    home: '<path d="M3 10l9-7 9 7"/><path d="M5 9v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V9"/>',
    teams: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>',
    risk: '<circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/>',
    sensor: '<circle cx="12" cy="12" r="3"/><path d="M4 12a8 8 0 0116 0M7.5 12a4.5 4.5 0 019 0"/>',
  };
  const svg = (paths, sz) => `<svg viewBox="0 0 24 24" width="${sz || 20}" height="${sz || 20}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

  // ── map libs (same loader/basemap as the rest of the portal) ──
  function loadLeaflet() {
    return new Promise(resolve => {
      const css = (href, id) => { if (id && document.getElementById(id)) return; const c = document.createElement('link'); if (id) c.id = id; c.rel = 'stylesheet'; c.href = href; document.head.appendChild(c); };
      const js = src => new Promise(r => { const s = document.createElement('script'); s.src = src; s.onload = r; s.onerror = r; document.head.appendChild(s); });
      css('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'fg-leaflet-css');
      css('https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css', 'fg-maplibre-css');
      const pre = [];
      if (!window.L) pre.push(js('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'));
      if (!window.maplibregl) pre.push(js('https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'));
      Promise.all(pre).then(() => { if (window.L && window.L.maplibreGL) return resolve(); js('https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.0.22/leaflet-maplibre-gl.js').then(resolve); });
    });
  }
  const themeDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
  const styleUrl = () => themeDark() ? 'https://tiles.openfreemap.org/styles/dark' : 'https://tiles.openfreemap.org/styles/positron';
  function pin(color, size, pulse) {
    const s = size || 12;
    return L.divIcon({ className: '', iconSize: [s, s], iconAnchor: [s / 2, s / 2],
      html: `<div style="position:relative;width:${s}px;height:${s}px;"><div style="width:${s}px;height:${s}px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,.9);box-shadow:0 1px 4px rgba(10,42,61,.35);"></div>${pulse ? `<div style="position:absolute;top:50%;left:50%;width:${s}px;height:${s}px;margin:-${s / 2}px;border-radius:50%;border:2px solid ${color};animation:sitPulse 1.5s ease-out infinite;"></div>` : ''}</div>` });
  }

  // ════════════════ render ════════════════
  function render(container) {
    _root = container;
    if (!document.getElementById('sit-css')) { const st = document.createElement('style'); st.id = 'sit-css'; st.textContent = STYLES; document.head.appendChild(st); }
    container.innerHTML = `<div class="sit"><div class="sit-load">Building the situation picture…</div></div>`;
    load();
  }

  async function fetchRain() {
    try {
      const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=6.45&longitude=3.4&hourly=precipitation&past_hours=48&forecast_hours=6&timezone=Africa%2FLagos');
      const j = await r.json();
      const times = (j.hourly && j.hourly.time) || [], vals = (j.hourly && j.hourly.precipitation) || [];
      if (!vals.length) return null;
      let now = times.findIndex(t => new Date(t).getTime() > Date.now()); if (now < 0) now = vals.length;
      const sum = (a, b) => vals.slice(Math.max(0, a), Math.max(0, b)).reduce((s, v) => s + (v || 0), 0);
      const last24 = sum(now - 24, now), prev24 = sum(now - 48, now - 24);
      const hrs = times.map((t, i) => ({ t, v: vals[i] || 0, future: i >= now })).slice(Math.max(0, now - 24), now + 6);
      return { hrs, last24, prev24 };
    } catch (_) { return null; }
  }

  async function load() {
    try {
      const [mapRes, hzRes, alertRes, teamRes, tickRes, wx] = await Promise.all([
        api('/analytics/map-data'),
        api('/forecast/horizons').catch(() => ({ data: {} })),
        api('/alerts').catch(() => ({ data: [] })),
        api('/teams').catch(() => ({ data: [] })),
        api('/tickets/planner').catch(() => api('/tickets?limit=20').catch(() => ({ data: [] }))),
        fetchRain(),
      ]);
      _data = { md: mapRes.data || {}, hz: hzRes.data || {}, alerts: alertRes.data || [], teams: teamRes.data || [], ticks: tickRes.data || [], wx };
      paint();
      await loadLeaflet(); initMap();
    } catch (err) {
      _root.innerHTML = `<div class="sit"><div class="sit-load" style="color:var(--err);">Couldn't load the situation — ${esc(err.message || 'error')}.<br><button class="sit-btn" style="margin-top:12px;" onclick="reloadTab('situation')">Retry</button></div></div>`;
    }
  }

  function model() {
    const { hz, alerts, teams, wx } = _data;
    const estates = (hz.estates || []);
    const active = alerts.filter(a => !['resolved', 'closed'].includes((a.status || 'active').toLowerCase()));
    const high = active.filter(a => (a.severity || '').toLowerCase() === 'high').length;
    const critical = active.filter(a => (a.severity || '').toLowerCase() === 'critical').length;
    const medium = active.filter(a => ['moderate', 'medium'].includes((a.severity || '').toLowerCase())).length;
    const atRisk = estates.filter(e => e.current_risk >= 60);
    const entering = estates.filter(e => e.current_risk < 60 && (e.horizons && e.horizons.h3 >= 60));
    const onSite = teams.filter(t => (t.status || '').toLowerCase() === 'on_site').length;
    const enRoute = teams.filter(t => (t.status || '').toLowerCase() === 'en_route').length;
    const respond = onSite + enRoute;
    const p = hz.portfolio || {};
    const worst = estates.reduce((m, e) => Math.max(m, e.current_risk || 0), 0);
    const overall = p.critical_now ? 'High' : worst >= 60 ? 'High' : worst >= 45 ? 'Elevated' : worst >= 25 ? 'Moderate' : 'Low';
    const avgNow = estates.length ? estates.reduce((s, e) => s + (e.current_risk || 0), 0) / estates.length : 0;
    const avgH3 = estates.length ? estates.reduce((s, e) => s + ((e.horizons && e.horizons.h3) || e.current_risk || 0), 0) / estates.length : 0;
    const trend = avgH3 > avgNow + 3 ? 'up' : avgH3 < avgNow - 3 ? 'down' : 'flat';
    const zones = zoneRisk();
    return { estates, active, critical, high, medium, atRisk, entering, respond, onSite, enRoute, overall, trend, p, wx, zones };
  }

  function zoneRisk() {
    const { md } = _data;
    const cityByProp = {}; (md.areas || []).forEach(a => { cityByProp[a.property_id] = a.city || a.state; });
    const z = {};
    (md.flood_risk || []).forEach(e => { const k = cityByProp[e.property_id] || 'Unzoned'; (z[k] = z[k] || []).push(e.risk_index || 0); });
    return Object.entries(z).map(([name, arr]) => ({ name, risk: Math.max(...arr), n: arr.length })).sort((a, b) => b.risk - a.risk);
  }

  function paint() {
    const M = model();
    _root.innerHTML = `<div class="sit">
      ${header(M)}
      ${statusStrip(M)}
      <div class="sit-main">
        ${mapCard()}
        <div class="sit-side">
          ${incidentsCard(M)}
          ${zonesCard(M)}
        </div>
      </div>
      <div class="sit-row2">
        ${timelineCard()}
        ${rainfallCard(M)}
      </div>
      <div class="sit-row2">
        ${emergingCard(M)}
        ${teamsCard(M)}
      </div>
      ${actionsCard(M)}
    </div>`;
    renderRainfall();
  }

  // ── header ──
  function header(M) {
    const bad = M.critical + M.high, tone = M.critical ? 'bad' : bad ? 'warn' : 'ok';
    const status = M.critical ? `${M.critical} critical` : bad ? `${bad} active incident${bad > 1 ? 's' : ''}` : 'All systems normal';
    const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `<div class="sit-head">
      <div><div class="sit-sub">Real-time view of incidents, risks and notable events across your network.</div></div>
      <div class="sit-head-r">
        <span class="sit-status ${tone}"><i></i>${esc(status)}</span>
        <span class="sit-date">${svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>', 15)} ${date}</span>
        <button class="sit-btn ghost" onclick="reloadTab('situation')">${svg('<path d="M21 2v6h-6M3 12a9 9 0 0115-6.7L21 8M3 22v-6h6M21 12a9 9 0 01-15 6.7L3 16"/>', 14)} Refresh</button>
      </div>
    </div>`;
  }

  // ── status strip (icon-left cards) ──
  function statusStrip(M) {
    const wx = M.wx || {};
    const rainDelta = wx.prev24 ? Math.round(((wx.last24 - wx.prev24) / Math.max(1, wx.prev24)) * 100) : null;
    const trendTxt = M.trend === 'up' ? '↑ Trending upward' : M.trend === 'down' ? '↓ Easing' : 'Stable';
    const cell = (icon, tint, label, value, sub, s022) => `<div class="sit-stat">
      <div class="sit-stat-ic" style="background:${tint}1f;color:${tint};">${svg(icon, 22)}</div>
      <div class="sit-stat-b"><div class="sit-stat-l">${label}</div><div class="sit-stat-v">${value}</div><div class="sit-stat-s">${sub}</div></div>
    </div>`;
    return `<div class="sit-strip">
      ${cell(ICON.incident, '#d9463c', 'Active incidents', M.active.length, `${M.high} high · ${M.medium} medium`)}
      ${cell(ICON.flood, '#e08e12', 'Flood risk level', M.overall, trendTxt)}
      ${cell(ICON.rain, '#16a8d3', 'Rainfall (last 24h)', (wx.last24 != null ? Math.round(wx.last24) : '—') + '<span class="u">mm</span>', rainDelta != null ? `${rainDelta >= 0 ? '↑' : '↓'} ${Math.abs(rainDelta)}% from yesterday` : 'Live')}
      ${cell(ICON.home, '#0d7fa0', 'At risk properties', M.atRisk.length, `${M.entering.length} entering high (3h)`)}
      ${cell(ICON.teams, '#7c6cf0', 'Response teams', M.respond, `${M.onSite} on site · ${M.enRoute} en route`)}
    </div>`;
  }

  // ── map ──
  function mapCard() {
    const p = (key, icon, label, on) => `<div class="sit-pill ${on ? 'on' : ''}" data-layer="${key}" onclick="OpsSituation.layer('${key}',this)">${svg(icon, 14)}<span>${label}</span></div>`;
    return `<div class="sit-card sit-mapcard">
      <div class="sit-h">
        <div><h3>Live situation map</h3><span class="sit-meta">Map of active incidents, flood-risk zones and critical assets</span></div>
        <div class="sit-layers">
          ${p('risk', ICON.risk, 'Risk zones', true)}${p('incidents', ICON.incident, 'Incidents', true)}${p('sensors', ICON.sensor, 'Sensors', false)}
        </div>
      </div>
      <div id="sit-map"></div>
      <div class="sit-legend">
        <span class="lbl">Risk level:</span>
        <span><i style="background:#1f9d5b"></i>Low</span><span><i style="background:#e0a012"></i>Moderate</span><span><i style="background:#e8720e"></i>Elevated</span><span><i style="background:#d9463c"></i>High</span><span><i style="background:#a11313"></i>Critical</span>
        <span class="sep"></span><span><i style="background:#7d8fa3"></i>Sensor</span>
      </div>
    </div>`;
  }

  function initMap() {
    if (!window.L || !document.getElementById('sit-map')) return;
    if (map) { try { map.remove(); } catch (_) {} map = null; }
    if (!document.getElementById('sit-pulse-kf')) { const st = document.createElement('style'); st.id = 'sit-pulse-kf'; st.textContent = '@keyframes sitPulse{0%{transform:scale(1);opacity:.7;}100%{transform:scale(2.6);opacity:0;}}'; document.head.appendChild(st); }
    map = L.map('sit-map', { center: [6.5244, 3.3792], zoom: 11, zoomControl: false, attributionControl: true });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    baseTiles = L.maplibreGL({ style: styleUrl(), attribution: '&copy; OpenFreeMap &copy; OSM' }).addTo(map);
    layers = { risk: L.layerGroup().addTo(map), incidents: L.layerGroup().addTo(map), sensors: L.layerGroup() };
    plot();
    if (window.ResizeObserver) new ResizeObserver(() => { try { map.invalidateSize(); } catch (_) {} }).observe(document.getElementById('sit-map'));
  }
  function popup(title, rows) {
    return `<div style="min-width:180px"><div style="font-weight:700;font-size:13px;color:var(--ink);margin-bottom:4px">${esc(title)}</div>${rows.filter(Boolean).map(r => `<div style="font-size:12px;color:var(--ink-2);line-height:1.6">${r}</div>`).join('')}</div>`;
  }
  function plot() {
    if (!map) return;
    const { md } = _data; const pts = [];
    Object.values(layers).forEach(l => l.clearLayers());
    (md.flood_risk || []).forEach(e => {
      const lat = parseFloat(e.latitude), lng = parseFloat(e.longitude); if (!lat || !lng) return;
      const r = e.risk_index || 0, size = r >= 80 ? 18 : r >= 60 ? 15 : r >= 45 ? 12 : 9;
      const m = L.marker([lat, lng], { icon: pin(riskColor(r), size, r >= 80), opacity: r < 25 ? 0.55 : 1 });
      m.bindPopup(popup(e.name || 'Estate', [`Risk <b style="color:${riskColor(r)}">${r}/100 · ${riskLevel(r)}</b>`]));
      layers.risk.addLayer(m); pts.push([lat, lng]);
    });
    (md.alerts || []).forEach(a => {
      const lat = parseFloat(a.latitude), lng = parseFloat(a.longitude); if (!lat || !lng) return;
      const m = L.marker([lat, lng], { icon: pin(sevColor(a.severity), a.severity === 'critical' ? 17 : 14, sevRank(a.severity) >= 3) });
      m.bindPopup(popup('⚠ ' + (a.alert_type || 'Incident'), [a.severity, a.description, a.site_name || a.client_name]));
      layers.incidents.addLayer(m); pts.push([lat, lng]);
    });
    (md.sensors || []).forEach(s => {
      const lat = parseFloat(s.latitude), lng = parseFloat(s.longitude); if (!lat || !lng) return;
      const col = s.status === 'active' ? '#8aa2ae' : s.status === 'maintenance' ? '#e08e12' : '#d9463c';
      const m = L.marker([lat, lng], { icon: pin(col, 8, false), opacity: 0.85 });
      m.bindPopup(popup(s.name || s.sensor_id || 'Sensor', [s.status, s.site_name, s.zone]));
      layers.sensors.addLayer(m);
    });
    if (pts.length) { try { map.fitBounds(L.latLngBounds(pts).pad(0.18)); } catch (_) {} }
    setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 80);
  }
  function layer(key, el) {
    if (!layers || !layers[key]) return;
    if (map.hasLayer(layers[key])) { map.removeLayer(layers[key]); el.classList.remove('on'); }
    else { layers[key].addTo(map); el.classList.add('on'); }
  }

  // ── active incidents ──
  function incidentsCard(M) {
    const rows = M.active.slice().sort((a, b) => sevRank(b.severity) - sevRank(a.severity) || new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 4);
    const body = rows.length ? rows.map(a => {
      const sev = (a.severity || 'medium').toLowerCase();
      const label = sev === 'critical' ? 'Critical' : sev === 'high' ? 'High' : ['moderate', 'medium'].includes(sev) ? 'Medium' : 'Low';
      const where = [a.site_name || a.client_name || a.property_name, a.zone].filter(Boolean).join(' · ');
      return `<div class="sit-inc" onclick="OpsSituation.openIncident('${esc(a.alert_id || a.id || '')}')">
        <span class="sit-inc-ic" style="color:${sevColor(sev)}">${svg(ICON.incident, 18)}</span>
        <div class="sit-inc-b"><div class="sit-inc-t">${esc(a.alert_type || a.description || 'Incident')}</div><div class="sit-inc-m">${esc(where || '—')}</div></div>
        <div class="sit-inc-r"><span class="sit-ago">${rel(a.created_at)}</span><span class="sit-chip ${sev}">${label}</span></div>
      </div>`;
    }).join('') : `<div class="sit-empty">No active incidents. A quiet board is a good sign.</div>`;
    return `<div class="sit-card"><div class="sit-h"><h3>Active incidents</h3><span class="sit-link" onclick="switchTab('alerts')">View all</span></div>${body}<div class="sit-foot" onclick="switchTab('alerts')">View incident log →</div></div>`;
  }

  // ── flood risk by zone ──
  function zonesCard(M) {
    const rows = M.zones.slice(0, 6);
    const body = rows.length ? rows.map(r => `<div class="sit-zone">
      <div class="sit-zone-n">${esc(r.name)}<span class="sit-zone-c">${r.n}</span></div>
      <div class="sit-zone-bar"><div style="width:${Math.min(100, r.risk)}%;background:${riskColor(r.risk)}"></div></div>
      <div class="sit-zone-lv" style="color:${riskColor(r.risk)}">${riskLevel(r.risk)}</div>
    </div>`).join('') : `<div class="sit-empty">No zone risk yet — needs estates with coordinates and a score.</div>`;
    return `<div class="sit-card"><div class="sit-h"><h3>Flood risk by zone</h3><span class="sit-link" onclick="switchTab('forecast')">View details</span></div>${body}</div>`;
  }

  // ── situation timeline ──
  function timelineCard() {
    const { alerts } = _data;
    const evs = alerts.slice().sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)).slice(0, 6);
    const body = evs.length ? evs.map(a => {
      const st = (a.status || 'active').toLowerCase(), sev = (a.severity || '').toLowerCase();
      const resolved = ['resolved', 'closed'].includes(st);
      const color = resolved ? '#1f9d5b' : sevColor(sev);
      const where = a.site_name || a.client_name || a.property_name || '';
      const verb = resolved ? 'Resolved' : (a.alert_type || 'Event');
      const chip = resolved ? '<span class="sit-chip ok">Resolved</span>' : `<span class="sit-chip ${sev}">${sev === 'high' || sev === 'critical' ? 'High' : 'Medium'}</span>`;
      return `<div class="sit-tl"><span class="sit-tl-dot" style="color:${color}">${svg(resolved ? '<circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/>' : ICON.incident, 16)}</span>
        <div class="sit-tl-b"><div class="sit-tl-t">${esc(verb)}${where ? ' — ' + esc(where) : ''}</div><div class="sit-tl-m">${rel(a.updated_at || a.created_at)}</div></div>${chip}</div>`;
    }).join('') : `<div class="sit-empty">No recent operational events.</div>`;
    return `<div class="sit-card"><div class="sit-h"><div><h3>Recent situation timeline</h3><span class="sit-meta">Live feed of notable events and system updates</span></div><span class="sit-link" onclick="switchTab('alerts')">View all</span></div>${body}</div>`;
  }

  // ── rainfall ──
  function rainfallCard() {
    return `<div class="sit-card"><div class="sit-h"><h3>Rainfall intensity</h3><span class="sit-meta">Lagos · last 24h</span></div><div id="sit-rain"><div class="sit-skel"></div><div class="sit-skel"></div></div></div>`;
  }
  function renderRainfall() {
    const el = document.getElementById('sit-rain'); if (!el) return;
    const wx = _data.wx;
    if (!wx || !wx.hrs || !wx.hrs.length) { el.innerHTML = `<div class="sit-empty">Rainfall data unavailable.</div>`; return; }
    const max = Math.max(30, ...wx.hrs.map(h => h.v));
    const threshPct = Math.round((30 / max) * 100);
    const bars = wx.hrs.map(h => {
      const ht = Math.max(2, Math.round((h.v / max) * 100));
      const col = h.v >= 30 ? '#d9463c' : h.v >= 15 ? '#e08e12' : '#1f9d5b';
      const hr = new Date(h.t).getHours();
      return `<div class="sit-bar" title="${hr}:00 · ${h.v}mm"><div style="height:${ht}%;background:${col};opacity:${h.future ? .4 : 1}"></div></div>`;
    }).join('');
    const labels = wx.hrs.map((h, i) => i % 6 === 0 ? `<span>${String(new Date(h.t).getHours()).padStart(2, '0')}:00</span>` : '').join('');
    el.innerHTML = `<div class="sit-rain-chart"><div class="sit-thresh" style="bottom:${threshPct}%"><span>30mm</span></div>${bars}</div>
      <div class="sit-rain-x">${labels}</div>
      <div class="sit-rain-lg"><span><i style="background:#1f9d5b"></i>Rainfall (mm)</span><span><i class="dash"></i>Threshold (30mm)</span><span class="faint">faded = forecast</span></div>`;
  }

  // ── emerging risks ──
  function emergingCard(M) {
    const rows = M.estates.filter(e => (e.current_risk < 60 && e.horizons && e.horizons.h3 >= 60) || e.anomaly)
      .sort((a, b) => ((b.horizons && b.horizons.h6) || 0) - ((a.horizons && a.horizons.h6) || 0)).slice(0, 3);
    const body = rows.length ? rows.map(e => {
      const to = riskLevel((e.horizons && e.horizons.h3) || e.current_risk), from = riskLevel(e.current_risk);
      const when = e.critical_window && e.critical_window.label ? e.critical_window.label : 'the next few hours';
      const drivers = (e.drivers || []).slice(0, 2).map(d => d.label).join('; ') || (e.anomaly ? e.anomaly.note : 'rising trend');
      return `<div class="sit-emerge"><div class="sit-emerge-t"><span style="color:#e08e12">${svg(ICON.incident, 15)}</span> ${esc(e.name)} — ${from} → <b style="color:${riskColor((e.horizons && e.horizons.h3) || 0)}">${to}</b></div>
        <div class="sit-emerge-m">Expected around ${esc(when)}. ${esc(drivers)}.</div>
        <button class="sit-btn sm" onclick="OpsSituation.act('${esc(e.property_id)}')">${esc(e.recommendation || 'Schedule inspection')}</button></div>`;
    }).join('') : `<div class="sit-empty">No emerging risks flagged. FlowGuard is watching.</div>`;
    return `<div class="sit-card"><div class="sit-h"><div><h3>Emerging risks</h3><span class="sit-meta">Not yet incidents — what may happen next</span></div></div>${body}</div>`;
  }

  // ── response teams ──
  function teamsCard(M) {
    const teams = _data.teams.slice().sort((a, b) => (['en_route', 'on_site'].includes((a.status || '').toLowerCase()) ? 0 : 1) - (['en_route', 'on_site'].includes((b.status || '').toLowerCase()) ? 0 : 1)).slice(0, 5);
    const body = teams.length ? teams.map(t => {
      const st = (t.status || 'available').toLowerCase();
      const tone = st === 'on_site' ? 'ok' : st === 'en_route' ? 'warn' : '';
      const label = st === 'on_site' ? 'On site' : st === 'en_route' ? 'En route' : st === 'standby' ? 'Standby' : 'Available';
      const target = t.current_assignment || t.assigned_property || t.location || '';
      return `<div class="sit-team"><div><div class="sit-team-n">${esc(t.name || t.team_name || 'Team')}</div><div class="sit-team-m">${label}${target ? ' → ' + esc(target) : ''}</div></div><span class="sit-chip ${tone}">${label}</span></div>`;
    }).join('') : `<div class="sit-empty">No field teams configured.</div>`;
    return `<div class="sit-card"><div class="sit-h"><h3>Response teams</h3><span class="sit-link" onclick="switchTab('teams')">Dispatch</span></div>${body}</div>`;
  }

  // ── recommended actions ──
  function actionsCard(M) {
    const acts = [];
    M.estates.filter(e => ['critical', 'warning'].includes(e.recommendation_level)).slice(0, 3).forEach(e => acts.push({ pr: e.recommendation_level === 'critical' ? 'High' : 'Medium', t: e.recommendation || 'Preventive work', why: `${e.name} · risk ${e.current_risk}`, cta: 'Create work order', tab: 'maintenance' }));
    (_data.md.sensors || []).filter(s => s.status && s.status !== 'active').slice(0, 2).forEach(s => acts.push({ pr: 'Medium', t: `Check Sentinel ${s.sensor_id || s.name || ''}`.trim(), why: `${s.status} · ${s.site_name || ''}`, cta: 'Dispatch', tab: 'teams' }));
    (_data.ticks || []).filter(t => t.scheduled_date && new Date(t.scheduled_date) < new Date() && !['done', 'closed', 'resolved'].includes((t.status || '').toLowerCase())).slice(0, 2).forEach(t => acts.push({ pr: 'Medium', t: t.title || (t.work_type ? String(t.work_type).replace(/_/g, ' ') : 'Scheduled work'), why: 'Overdue', cta: 'Open planner', tab: 'maintenance' }));
    const list = acts.slice(0, 6);
    const body = list.length ? list.map((a, i) => `<div class="sit-act">
      <div class="sit-act-n">${i + 1}</div>
      <div class="sit-act-b"><div class="sit-act-t">${esc(a.t)}</div><div class="sit-act-m"><span class="sit-chip ${a.pr === 'High' ? 'high' : 'warn'}">${a.pr}</span> ${esc(a.why)}</div></div>
      <button class="sit-btn sm" onclick="switchTab('${a.tab}')">${esc(a.cta)}</button></div>`).join('') : `<div class="sit-empty">No recommended actions right now.</div>`;
    return `<div class="sit-card"><div class="sit-h"><div><h3>Recommended actions</h3><span class="sit-meta">Prioritised operational queue — links to Field ops</span></div></div><div class="sit-acts">${body}</div></div>`;
  }

  function openIncident(id) { if (window.fgOpen) fgOpen('alerts', id); else switchTab('alerts'); }
  function act(pid) { if (window.OpsForecast && window.switchTab) { switchTab('forecast'); setTimeout(() => { try { OpsForecast.select && OpsForecast.select(pid); } catch (_) {} }, 400); } else switchTab('maintenance'); }

  const STYLES = `
    .sit{display:flex;flex-direction:column;gap:16px;}
    .sit-load{padding:60px;text-align:center;color:var(--ink-3);}
    .sit-btn{display:inline-flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--border-2);color:var(--ink);border-radius:9px;padding:8px 13px;font-weight:600;font-size:var(--fs-sm);cursor:pointer;font-family:inherit;}
    .sit-btn.sm{padding:6px 11px;font-size:var(--fs-xs);}
    .sit-btn.ghost{background:transparent;}
    .sit-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;box-shadow:var(--sh-xs);padding:16px 18px;}
    .sit-h{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;}
    .sit-h h3{font-size:var(--fs-base);font-weight:700;color:var(--ink);margin:0;}
    .sit-meta{font-size:var(--fs-2xs);color:var(--ink-3);}
    .sit-link{font-size:var(--fs-xs);color:var(--blue-hi);font-weight:600;cursor:pointer;white-space:nowrap;}
    .sit-empty{padding:16px 4px;color:var(--ink-3);font-size:var(--fs-sm);}
    .sit-skel{height:12px;border-radius:6px;background:var(--surface-3);margin:8px 0;}

    /* header */
    .sit-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;}
    .sit-head h1{font-size:var(--fs-xl);font-weight:800;color:var(--ink);letter-spacing:-.4px;margin:0;}
    .sit-sub{font-size:var(--fs-sm);color:var(--ink-3);margin-top:3px;}
    .sit-head-r{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
    .sit-status{display:inline-flex;align-items:center;gap:7px;font-size:var(--fs-xs);font-weight:600;padding:7px 13px;border-radius:20px;}
    .sit-status i{width:7px;height:7px;border-radius:50%;background:currentColor;}
    .sit-status.ok{background:var(--ok-bg);color:var(--ok);} .sit-status.warn{background:var(--wb);color:var(--warn);} .sit-status.bad{background:var(--eb);color:var(--err);}
    .sit-date{display:inline-flex;align-items:center;gap:7px;font-size:var(--fs-sm);color:var(--ink-2);background:var(--surface);border:1px solid var(--border-2);border-radius:9px;padding:7px 12px;}

    /* status strip — icon-left cards */
    .sit-strip{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;}
    @media (max-width:1100px){ .sit-strip{grid-template-columns:repeat(2,1fr);} }
    .sit-stat{background:var(--surface);border:1px solid var(--border);border-radius:16px;box-shadow:var(--sh-xs);padding:16px 18px;display:flex;align-items:flex-start;gap:14px;}
    .sit-stat-ic{width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
    .sit-stat-b{min-width:0;}
    .sit-stat-l{font-size:var(--fs-2xs);color:var(--ink-3);font-weight:600;}
    .sit-stat-v{font-size:26px;font-weight:800;color:var(--ink);letter-spacing:-.5px;line-height:1.1;margin:2px 0;}
    .sit-stat-v .u{font-size:14px;color:var(--ink-3);font-weight:600;margin-left:2px;}
    .sit-stat-s{font-size:var(--fs-2xs);color:var(--ink-3);}

    /* main layout */
    .sit-main{display:grid;grid-template-columns:1.75fr 1fr;gap:16px;align-items:start;}
    .sit-side{display:flex;flex-direction:column;gap:16px;}
    .sit-row2{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
    @media (max-width:1000px){ .sit-main,.sit-row2{grid-template-columns:1fr;} }

    /* map */
    .sit-mapcard{display:flex;flex-direction:column;}
    #sit-map{height:440px;border-radius:12px;overflow:hidden;border:1px solid var(--border);}
    .sit-layers{display:flex;gap:6px;flex-wrap:wrap;}
    .sit-pill{display:inline-flex;align-items:center;gap:6px;font-size:var(--fs-2xs);font-weight:600;color:var(--ink-2);background:var(--surface);border:1px solid var(--border-2);border-radius:20px;padding:6px 12px;cursor:pointer;}
    .sit-pill svg{opacity:.8;}
    .sit-pill.on{background:var(--ink);color:var(--surface);border-color:var(--ink);}
    .sit-legend{display:flex;gap:13px;flex-wrap:wrap;align-items:center;margin-top:10px;font-size:var(--fs-2xs);color:var(--ink-3);}
    .sit-legend .lbl{font-weight:700;color:var(--ink-2);}
    .sit-legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:middle;}
    .sit-legend .sep{width:1px;height:12px;background:var(--border-2);}

    /* incidents */
    .sit-inc{display:flex;align-items:center;gap:11px;padding:11px 0;border-top:1px solid var(--border);cursor:pointer;}
    .sit-inc:first-of-type{border-top:none;}
    .sit-inc-b{flex:1;min-width:0;}
    .sit-inc-t{font-size:var(--fs-sm);font-weight:600;color:var(--ink);}
    .sit-inc-m{font-size:var(--fs-2xs);color:var(--ink-3);margin-top:1px;}
    .sit-inc-r{display:flex;flex-direction:column;align-items:flex-end;gap:5px;}
    .sit-ago{font-size:var(--fs-2xs);color:var(--ink-4);}
    .sit-chip{font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px;background:var(--ob);color:var(--off);white-space:nowrap;}
    .sit-chip.high,.sit-chip.critical{background:var(--eb);color:var(--err);}
    .sit-chip.medium,.sit-chip.moderate,.sit-chip.warn{background:var(--wb);color:var(--warn);}
    .sit-chip.ok{background:var(--ok-bg);color:var(--ok);}
    .sit-foot{margin-top:10px;font-size:var(--fs-xs);color:var(--blue-hi);font-weight:600;cursor:pointer;}

    /* zones */
    .sit-zone{display:grid;grid-template-columns:1.2fr 1.3fr auto;align-items:center;gap:12px;padding:9px 0;border-top:1px solid var(--border);}
    .sit-zone:first-of-type{border-top:none;}
    .sit-zone-n{font-size:var(--fs-sm);font-weight:600;color:var(--ink);}
    .sit-zone-c{display:inline-block;margin-left:6px;font-size:10px;color:var(--ink-4);font-weight:600;}
    .sit-zone-bar{height:7px;border-radius:5px;background:var(--surface-3);overflow:hidden;}
    .sit-zone-bar>div{height:100%;border-radius:5px;}
    .sit-zone-lv{font-size:var(--fs-2xs);font-weight:700;text-align:right;}

    /* timeline */
    .sit-tl{display:flex;align-items:center;gap:11px;padding:10px 0;border-top:1px solid var(--border);}
    .sit-tl:first-of-type{border-top:none;}
    .sit-tl-dot{flex-shrink:0;display:flex;}
    .sit-tl-b{flex:1;min-width:0;}
    .sit-tl-t{font-size:var(--fs-sm);color:var(--ink);}
    .sit-tl-m{font-size:var(--fs-2xs);color:var(--ink-4);margin-top:1px;}

    /* rainfall */
    .sit-rain-chart{position:relative;display:flex;align-items:flex-end;gap:2px;height:150px;padding-top:6px;}
    .sit-bar{flex:1;display:flex;align-items:flex-end;height:100%;}
    .sit-bar>div{width:100%;border-radius:2px 2px 0 0;min-height:2px;}
    .sit-thresh{position:absolute;left:0;right:0;border-top:1px dashed var(--err);opacity:.6;}
    .sit-thresh span{position:absolute;right:0;top:-8px;font-size:9px;color:var(--err);background:var(--surface);padding:0 3px;}
    .sit-rain-x{display:flex;justify-content:space-between;margin-top:6px;font-size:9px;color:var(--ink-4);}
    .sit-rain-lg{display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;font-size:var(--fs-2xs);color:var(--ink-3);}
    .sit-rain-lg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:middle;}
    .sit-rain-lg i.dash{width:14px;height:0;border-top:2px dashed var(--err);border-radius:0;}
    .sit-rain-lg .faint{color:var(--ink-4);}

    /* emerging / teams / actions */
    .sit-emerge{padding:11px 0;border-top:1px solid var(--border);}
    .sit-emerge:first-of-type{border-top:none;}
    .sit-emerge-t{font-size:var(--fs-sm);font-weight:600;color:var(--ink);display:flex;align-items:center;gap:6px;}
    .sit-emerge-m{font-size:var(--fs-2xs);color:var(--ink-3);margin:4px 0 8px;line-height:1.5;}
    .sit-team{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--border);}
    .sit-team:first-of-type{border-top:none;}
    .sit-team-n{font-size:var(--fs-sm);font-weight:600;color:var(--ink);}
    .sit-team-m{font-size:var(--fs-2xs);color:var(--ink-3);margin-top:1px;}
    .sit-acts{display:grid;grid-template-columns:1fr 1fr;gap:0 24px;}
    @media (max-width:800px){ .sit-acts{grid-template-columns:1fr;} }
    .sit-act{display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid var(--border);}
    .sit-act-n{width:24px;height:24px;border-radius:7px;background:var(--surface-3);color:var(--ink-2);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:var(--fs-xs);flex-shrink:0;}
    .sit-act-b{flex:1;min-width:0;}
    .sit-act-t{font-size:var(--fs-sm);font-weight:600;color:var(--ink);}
    .sit-act-m{font-size:var(--fs-2xs);color:var(--ink-3);margin-top:2px;display:flex;align-items:center;gap:6px;}
  `;

  return { render, layer, openIncident, act };
})();
window.OpsSituation = OpsSituation;
