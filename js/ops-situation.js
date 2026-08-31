/* ══════════════════════════════════════════════════════════════
   FlowGuard Ops — SITUATION
   "What needs my attention now, what's about to happen, and what
   are we doing about it?" — action-oriented, problem-first. Distinct
   from Overview (which reports how the operation is doing).

   Real data:
     /analytics/map-data     flood_risk (per-estate risk) · alerts · sensors · areas
     /forecast/horizons      per-estate now/+1h/+3h/+6h · drivers · anomaly · recommendation · portfolio triage
     /alerts                 active incidents
     /teams                  field teams
     /tickets/planner        work orders (overdue → recommended actions)
     Open-Meteo              rainfall (no Sentinel required)
   ══════════════════════════════════════════════════════════════ */
const OpsSituation = (function () {
  'use strict';

  const esc = s => (window.OpsModal && OpsModal.escape) ? OpsModal.escape(s) : String(s == null ? '' : s);
  const api = p => OpsModal.apiGet(p);

  let _root = null, map = null, baseTiles = null, layers = null;
  let _data = {};

  // ── risk → colour/level (5 bands per the situation spec) ──
  const riskColor = r => r >= 80 ? '#a11313' : r >= 60 ? '#d9463c' : r >= 45 ? '#e8720e' : r >= 25 ? '#e0a012' : '#1f9d5b';
  const riskLevel = r => r >= 80 ? 'Critical' : r >= 60 ? 'High' : r >= 45 ? 'Elevated' : r >= 25 ? 'Watch' : 'Low';
  const sevRank = s => ({ critical: 4, high: 3, moderate: 2, medium: 2, low: 1 }[String(s || '').toLowerCase()] || 1);
  const sevColor = s => ({ critical: '#a11313', high: '#d9463c', moderate: '#e08e12', medium: '#e08e12', low: '#1f9d5b' }[String(s || '').toLowerCase()] || '#7d8fa3');

  function rel(t) {
    if (!t) return '—';
    const d = Date.now() - new Date(t).getTime();
    const m = Math.floor(d / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }

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
      Promise.all(pre).then(() => {
        if (window.L && window.L.maplibreGL) return resolve();
        js('https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.0.22/leaflet-maplibre-gl.js').then(resolve);
      });
    });
  }
  const themeDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
  const styleUrl = () => themeDark() ? 'https://tiles.openfreemap.org/styles/dark' : 'https://tiles.openfreemap.org/styles/positron';
  function dot(color, size, pulse) {
    const s = size || 12;
    return L.divIcon({
      className: '', iconSize: [s, s], iconAnchor: [s / 2, s / 2],
      html: `<div style="position:relative;width:${s}px;height:${s}px;">
        <div style="width:${s}px;height:${s}px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,.85);box-shadow:0 1px 4px rgba(10,42,61,.35);"></div>
        ${pulse ? `<div style="position:absolute;top:50%;left:50%;width:${s}px;height:${s}px;margin:-${s / 2}px;border-radius:50%;border:2px solid ${color};animation:sitPulse 1.5s ease-out infinite;"></div>` : ''}
      </div>`,
    });
  }

  // ════════════════ render ════════════════
  function render(container) {
    _root = container;
    if (!document.getElementById('sit-css')) {
      const st = document.createElement('style'); st.id = 'sit-css'; st.textContent = STYLES; document.head.appendChild(st);
    }
    container.innerHTML = `<div class="sit"><div class="sit-load">Building the situation picture…</div></div>`;
    load();
  }

  async function load() {
    try {
      const [mapRes, hzRes, alertRes, teamRes, tickRes] = await Promise.all([
        api('/analytics/map-data'),
        api('/forecast/horizons').catch(() => ({ data: {} })),
        api('/alerts').catch(() => ({ data: [] })),
        api('/teams').catch(() => ({ data: [] })),
        api('/tickets/planner').catch(() => api('/tickets?limit=20').catch(() => ({ data: [] }))),
      ]);
      _data = {
        md: mapRes.data || {},
        hz: hzRes.data || {},
        alerts: alertRes.data || [],
        teams: teamRes.data || [],
        ticks: tickRes.data || [],
      };
      paint();
      await loadLeaflet();
      initMap();
      renderRainfall();
    } catch (err) {
      _root.innerHTML = `<div class="sit"><div class="sit-load" style="color:var(--err);">Couldn't load the situation — ${esc(err.message || 'error')}.<br><button class="sit-btn" style="margin-top:12px;" onclick="reloadTab('situation')">Retry</button></div></div>`;
    }
  }

  // ── derived situation model ──
  function model() {
    const { md, hz, alerts, teams } = _data;
    const estates = (hz.estates || []);
    const active = alerts.filter(a => !['resolved', 'closed'].includes((a.status || 'active').toLowerCase()));
    const bySev = s => active.filter(a => (a.severity || '').toLowerCase() === s).length;
    const critical = bySev('critical');
    const high = bySev('high');
    const medium = active.filter(a => ['moderate', 'medium'].includes((a.severity || '').toLowerCase())).length;
    const atRisk = estates.filter(e => e.current_risk >= 60);
    const entering = estates.filter(e => e.current_risk < 60 && (e.horizons && e.horizons.h3 >= 60));
    const respond = teams.filter(t => ['on_site', 'en_route'].includes((t.status || '').toLowerCase()));
    const onSite = teams.filter(t => (t.status || '').toLowerCase() === 'on_site').length;
    const enRoute = teams.filter(t => (t.status || '').toLowerCase() === 'en_route').length;
    // overall flood risk from the portfolio triage / worst estate
    const p = hz.portfolio || {};
    const worst = estates.reduce((m, e) => Math.max(m, e.current_risk || 0), 0);
    const overall = p.critical_now ? 'High' : worst >= 60 ? 'High' : worst >= 45 ? 'Elevated' : worst >= 25 ? 'Moderate' : 'Low';
    const avgNow = estates.length ? estates.reduce((s, e) => s + (e.current_risk || 0), 0) / estates.length : 0;
    const avgH3 = estates.length ? estates.reduce((s, e) => s + ((e.horizons && e.horizons.h3) || e.current_risk || 0), 0) / estates.length : 0;
    const trend = avgH3 > avgNow + 3 ? 'up' : avgH3 < avgNow - 3 ? 'down' : 'flat';
    return { estates, active, critical, high, medium, atRisk, entering, respond, onSite, enRoute, overall, trend, p };
  }

  function paint() {
    const M = model();
    _root.innerHTML = `<div class="sit">
      ${statusStrip(M)}
      <div class="sit-grid-main">
        ${mapCard()}
        ${incidentsCard(M)}
      </div>
      <div class="sit-grid-2">
        ${zonesCard()}
        ${emergingCard(M)}
      </div>
      <div class="sit-grid-2">
        ${timelineCard()}
        <div class="sit-card"><div class="sit-h"><h3>Rainfall intensity</h3><span class="sit-meta">Lagos · last 24h</span></div><div id="sit-rain">${skel()}</div></div>
      </div>
      <div class="sit-grid-2">
        ${teamsCard(M)}
        ${actionsCard(M)}
      </div>
    </div>`;
  }

  const skel = () => `<div class="sit-skel"></div><div class="sit-skel"></div><div class="sit-skel" style="width:60%;"></div>`;

  // 1 ── status strip
  function statusStrip(M) {
    const trendTxt = M.trend === 'up' ? '↑ Trending upward' : M.trend === 'down' ? '↓ Easing' : 'Stable';
    const cell = (label, value, sub, tone) => `<div class="sit-stat ${tone || ''}">
      <div class="sit-stat-l">${label}</div>
      <div class="sit-stat-v">${value}</div>
      <div class="sit-stat-s">${sub}</div>
    </div>`;
    return `<div class="sit-strip">
      ${cell('Active incidents', M.active.length, `${M.high} high · ${M.medium} medium`, M.active.length ? 'bad' : 'ok')}
      ${cell('Properties at risk', M.atRisk.length, `${M.entering.length} entering high (3h)`, M.atRisk.length ? 'warn' : 'ok')}
      ${cell('Flood risk', M.overall, trendTxt, M.overall === 'High' || M.overall === 'Critical' ? 'bad' : M.overall === 'Elevated' || M.overall === 'Moderate' ? 'warn' : 'ok')}
      ${cell('Teams responding', M.respond.length, `${M.onSite} on site · ${M.enRoute} en route`, '')}
      ${cell('Critical alerts', M.critical, M.critical ? 'Immediate response' : 'None', M.critical ? 'bad' : 'ok')}
    </div>`;
  }

  // 2 ── map
  function mapCard() {
    return `<div class="sit-card sit-mapcard">
      <div class="sit-h">
        <div><h3>Live situation map</h3><span class="sit-meta">Active incidents, flood-risk zones and critical assets</span></div>
        <div class="sit-layers">
          <div class="sit-pill on" data-layer="risk" onclick="OpsSituation.layer('risk',this)">Risk zones</div>
          <div class="sit-pill on" data-layer="incidents" onclick="OpsSituation.layer('incidents',this)">Incidents</div>
          <div class="sit-pill" data-layer="sensors" onclick="OpsSituation.layer('sensors',this)">Sensors</div>
        </div>
      </div>
      <div id="sit-map"></div>
      <div class="sit-legend">
        <span><i style="background:#1f9d5b"></i>Low</span>
        <span><i style="background:#e0a012"></i>Watch</span>
        <span><i style="background:#e8720e"></i>Elevated</span>
        <span><i style="background:#d9463c"></i>High</span>
        <span><i style="background:#a11313"></i>Critical</span>
      </div>
    </div>`;
  }

  function initMap() {
    if (!window.L || !document.getElementById('sit-map')) return;
    if (map) { try { map.remove(); } catch (_) {} map = null; }
    if (!document.getElementById('sit-pulse-kf')) {
      const st = document.createElement('style'); st.id = 'sit-pulse-kf';
      st.textContent = '@keyframes sitPulse{0%{transform:scale(1);opacity:.7;}100%{transform:scale(2.6);opacity:0;}}';
      document.head.appendChild(st);
    }
    map = L.map('sit-map', { center: [6.5244, 3.3792], zoom: 11, zoomControl: false, attributionControl: true });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    baseTiles = L.maplibreGL({ style: styleUrl(), attribution: '&copy; OpenFreeMap &copy; OSM' }).addTo(map);
    layers = { risk: L.layerGroup().addTo(map), incidents: L.layerGroup().addTo(map), sensors: L.layerGroup() };
    plot();
    if (window.ResizeObserver) new ResizeObserver(() => { try { map.invalidateSize(); } catch (_) {} }).observe(document.getElementById('sit-map'));
    if (window.MutationObserver) new MutationObserver(() => { if (baseTiles) baseTiles.setStyle ? baseTiles.setStyle(styleUrl()) : baseTiles.setUrl && baseTiles.setUrl(styleUrl()); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  function popup(title, rows) {
    const body = rows.filter(Boolean).map(r => `<div style="font-size:12px;color:#4d6d7d;line-height:1.6">${r}</div>`).join('');
    return `<div style="min-width:180px"><div style="font-weight:700;font-size:13px;color:#0e2c3d;margin-bottom:4px">${esc(title)}</div>${body}</div>`;
  }

  function plot() {
    if (!map) return;
    const { md } = _data;
    Object.values(layers).forEach(l => l.clearLayers());
    const pts = [];
    // Risk zones — problem-first: high/critical are larger & pulse, low recedes (small, faded).
    (md.flood_risk || []).forEach(e => {
      const lat = parseFloat(e.latitude), lng = parseFloat(e.longitude); if (!lat || !lng) return;
      const r = e.risk_index || 0;
      const size = r >= 80 ? 18 : r >= 60 ? 15 : r >= 45 ? 12 : 9;
      const m = L.marker([lat, lng], { icon: dot(riskColor(r), size, r >= 80), opacity: r < 25 ? 0.55 : 1 });
      m.bindPopup(popup(e.name || 'Estate', [`Risk <b style="color:${riskColor(r)}">${r}/100 · ${riskLevel(r)}</b>`]));
      layers.risk.addLayer(m); pts.push([lat, lng]);
    });
    // Incidents
    (md.alerts || []).forEach(a => {
      const lat = parseFloat(a.latitude), lng = parseFloat(a.longitude); if (!lat || !lng) return;
      const m = L.marker([lat, lng], { icon: dot(sevColor(a.severity), a.severity === 'critical' ? 17 : 14, sevRank(a.severity) >= 3) });
      m.bindPopup(popup('⚠ ' + (a.alert_type || 'Incident'), [a.severity, a.description, a.site_name || a.client_name]));
      layers.incidents.addLayer(m); pts.push([lat, lng]);
    });
    // Sensors — recede (small grey), off by default
    (md.sensors || []).forEach(s => {
      const lat = parseFloat(s.latitude), lng = parseFloat(s.longitude); if (!lat || !lng) return;
      const col = s.status === 'active' ? '#8aa2ae' : s.status === 'maintenance' ? '#e08e12' : '#d9463c';
      const m = L.marker([lat, lng], { icon: dot(col, 8, false), opacity: 0.8 });
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

  // 3 ── active incidents
  function incidentsCard(M) {
    const rows = M.active.slice().sort((a, b) => sevRank(b.severity) - sevRank(a.severity) || new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 6);
    const body = rows.length ? rows.map(a => {
      const sev = (a.severity || 'medium').toLowerCase();
      const label = sev === 'critical' ? 'Critical' : sev === 'high' ? 'High' : sev === 'moderate' || sev === 'medium' ? 'Medium' : 'Low';
      const where = [a.site_name || a.client_name || a.property_name, a.zone].filter(Boolean).join(' · ');
      return `<div class="sit-inc" onclick="OpsSituation.openIncident('${esc(a.alert_id || a.id || '')}')">
        <span class="sit-inc-ic" style="color:${sevColor(sev)}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M10.3 3.9L2.6 17.5a1.5 1.5 0 001.3 2.3h16.2a1.5 1.5 0 001.3-2.3L13.7 3.9a1.5 1.5 0 00-2.6 0z"/><path d="M12 9v4M12 17h.01"/></svg></span>
        <div class="sit-inc-b"><div class="sit-inc-t">${esc(a.alert_type || a.description || 'Incident')}</div><div class="sit-inc-m">${esc(where || '—')}</div></div>
        <div class="sit-inc-r"><span class="sit-chip ${sev}">${label}</span><span class="sit-ago">${rel(a.created_at)}</span></div>
      </div>`;
    }).join('') : `<div class="sit-empty">No active incidents. A quiet board is a good sign.</div>`;
    return `<div class="sit-card">
      <div class="sit-h"><h3>Active incidents</h3><span class="sit-link" onclick="switchTab('alerts')">View all</span></div>
      ${body}
      <div class="sit-foot" onclick="switchTab('alerts')">View incident log →</div>
    </div>`;
  }

  // 4 ── flood risk by zone (grouped by property city)
  function zonesCard() {
    const { md } = _data;
    const cityByProp = {}; (md.areas || []).forEach(a => { cityByProp[a.property_id] = a.city || a.state; });
    const zones = {};
    (md.flood_risk || []).forEach(e => {
      const z = cityByProp[e.property_id] || 'Unzoned';
      (zones[z] = zones[z] || []).push(e.risk_index || 0);
    });
    const rows = Object.entries(zones)
      .map(([z, arr]) => ({ z, risk: Math.max(...arr), n: arr.length }))
      .sort((a, b) => b.risk - a.risk).slice(0, 6);
    const body = rows.length ? rows.map(r => `<div class="sit-zone">
      <div class="sit-zone-n">${esc(r.z)}<span class="sit-zone-c">${r.n}</span></div>
      <div class="sit-zone-bar"><div style="width:${Math.min(100, r.risk)}%;background:${riskColor(r.risk)}"></div></div>
      <div class="sit-zone-lv" style="color:${riskColor(r.risk)}">${riskLevel(r.risk)}</div>
    </div>`).join('') : `<div class="sit-empty">No zone risk yet — needs estates with coordinates and a computed score.</div>`;
    return `<div class="sit-card"><div class="sit-h"><h3>Flood risk by zone</h3><span class="sit-link" onclick="switchTab('forecast')">View details</span></div>${body}</div>`;
  }

  // 5 ── situation timeline (from recent alerts, incl. resolved)
  function timelineCard() {
    const { alerts } = _data;
    const evs = alerts.slice().sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)).slice(0, 6);
    const body = evs.length ? evs.map(a => {
      const st = (a.status || 'active').toLowerCase();
      const sev = (a.severity || '').toLowerCase();
      const color = ['resolved', 'closed'].includes(st) ? '#1f9d5b' : sevColor(sev);
      const where = a.site_name || a.client_name || a.property_name || '';
      const verb = ['resolved', 'closed'].includes(st) ? 'Resolved' : (a.alert_type || 'Event');
      return `<div class="sit-tl"><span class="sit-tl-dot" style="background:${color}"></span>
        <div><div class="sit-tl-t">${esc(verb)}${where ? ' — ' + esc(where) : ''}</div><div class="sit-tl-m">${rel(a.updated_at || a.created_at)}</div></div></div>`;
    }).join('') : `<div class="sit-empty">No recent operational events.</div>`;
    return `<div class="sit-card"><div class="sit-h"><h3>Situation timeline</h3><span class="sit-meta">Events relevant to right now</span></div>${body}</div>`;
  }

  // 6 ── rainfall (Open-Meteo, no Sentinel needed)
  async function renderRainfall() {
    const el = document.getElementById('sit-rain'); if (!el) return;
    try {
      const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=6.45&longitude=3.4&hourly=precipitation&past_hours=18&forecast_hours=6&timezone=Africa%2FLagos');
      const j = await r.json();
      const times = (j.hourly && j.hourly.time) || [];
      const vals = (j.hourly && j.hourly.precipitation) || [];
      if (!vals.length) { el.innerHTML = `<div class="sit-empty">Rainfall data unavailable.</div>`; return; }
      const nowIdx = times.findIndex(t => new Date(t).getTime() > Date.now());
      const max = Math.max(30, ...vals);
      const bars = vals.map((v, i) => {
        const h = Math.max(2, Math.round((v / max) * 90));
        const future = nowIdx >= 0 && i >= nowIdx;
        const col = v >= 30 ? '#d9463c' : v >= 15 ? '#e08e12' : '#1f9d5b';
        return `<div class="sit-bar" title="${new Date(times[i]).getHours()}:00 · ${v}mm"><div style="height:${h}%;background:${col};opacity:${future ? .45 : 1}"></div></div>`;
      }).join('');
      const total6 = vals.slice(Math.max(0, (nowIdx < 0 ? vals.length : nowIdx) - 6), (nowIdx < 0 ? vals.length : nowIdx)).reduce((s, v) => s + v, 0);
      el.innerHTML = `<div class="sit-rain-top"><b>${total6.toFixed(1)}mm</b><span>last 6h · 30mm flood threshold · faded = forecast</span></div>
        <div class="sit-rain-chart"><div class="sit-thresh" style="bottom:${Math.round((30 / max) * 90)}%"></div>${bars}</div>`;
    } catch (_) { el.innerHTML = `<div class="sit-empty">Rainfall data unavailable.</div>`; }
  }

  // 7 ── response teams
  function teamsCard(M) {
    const teams = _data.teams.slice().sort((a, b) => {
      const rk = t => ['en_route', 'on_site'].includes((t.status || '').toLowerCase()) ? 0 : 1;
      return rk(a) - rk(b);
    }).slice(0, 5);
    const body = teams.length ? teams.map(t => {
      const st = (t.status || 'available').toLowerCase();
      const tone = st === 'on_site' ? 'ok' : st === 'en_route' ? 'warn' : '';
      const label = st === 'on_site' ? 'On site' : st === 'en_route' ? 'En route' : st === 'standby' ? 'Standby' : 'Available';
      const target = t.current_assignment || t.assigned_property || t.location || '';
      return `<div class="sit-team">
        <div><div class="sit-team-n">${esc(t.name || t.team_name || 'Team')}</div><div class="sit-team-m">${label}${target ? ' → ' + esc(target) : ''}</div></div>
        <span class="sit-chip ${tone}">${label}</span>
      </div>`;
    }).join('') : `<div class="sit-empty">No field teams configured.</div>`;
    return `<div class="sit-card"><div class="sit-h"><h3>Response teams</h3><span class="sit-link" onclick="switchTab('teams')">Dispatch</span></div>${body}</div>`;
  }

  // 8/9 ── emerging risks + recommended actions (from forecast + planner + sensors)
  function emergingCard(M) {
    const rows = M.estates
      .filter(e => (e.current_risk < 60 && e.horizons && e.horizons.h3 >= 60) || e.anomaly)
      .sort((a, b) => ((b.horizons && b.horizons.h6) || 0) - ((a.horizons && a.horizons.h6) || 0))
      .slice(0, 3);
    const body = rows.length ? rows.map(e => {
      const to = riskLevel((e.horizons && e.horizons.h3) || e.current_risk);
      const from = riskLevel(e.current_risk);
      const when = e.critical_window && e.critical_window.label ? e.critical_window.label : 'the next few hours';
      const drivers = (e.drivers || []).slice(0, 2).map(d => d.label).join('; ') || (e.anomaly ? e.anomaly.note : 'rising trend');
      return `<div class="sit-emerge">
        <div class="sit-emerge-t">⚠ ${esc(e.name)} — ${from} → <b style="color:${riskColor((e.horizons && e.horizons.h3) || 0)}">${to}</b></div>
        <div class="sit-emerge-m">Expected around ${esc(when)}. ${esc(drivers)}.</div>
        <div class="sit-emerge-a"><button class="sit-btn sm" onclick="OpsSituation.act('${esc(e.property_id)}')">${esc(e.recommendation || 'Schedule inspection')}</button></div>
      </div>`;
    }).join('') : `<div class="sit-empty">No emerging risks flagged. FlowGuard is watching.</div>`;
    return `<div class="sit-card"><div class="sit-h"><h3>Emerging risks</h3><span class="sit-meta">Not yet incidents</span></div>${body}</div>`;
  }

  function actionsCard(M) {
    const acts = [];
    // From forecast recommendations (critical/warning estates)
    M.estates.filter(e => ['critical', 'warning'].includes(e.recommendation_level)).slice(0, 3).forEach(e => {
      acts.push({ pr: e.recommendation_level === 'critical' ? 'High' : 'Medium', t: e.recommendation || 'Preventive work', why: `${e.name} · risk ${e.current_risk}`, cta: 'Create work order', tab: 'maintenance' });
    });
    // Offline / stale sensors
    (_data.md.sensors || []).filter(s => s.status && s.status !== 'active').slice(0, 2).forEach(s => {
      acts.push({ pr: 'Medium', t: `Check Sentinel ${s.sensor_id || s.name || ''}`.trim(), why: `${s.status} · ${s.site_name || ''}`, cta: 'Dispatch', tab: 'teams' });
    });
    // Overdue planner tickets
    (_data.ticks || []).filter(t => t.scheduled_date && new Date(t.scheduled_date) < new Date() && !['done', 'closed', 'resolved'].includes((t.status || '').toLowerCase())).slice(0, 2).forEach(t => {
      acts.push({ pr: 'Medium', t: t.title || (t.work_type ? String(t.work_type).replace(/_/g, ' ') : 'Scheduled work'), why: 'Overdue', cta: 'Open planner', tab: 'maintenance' });
    });
    const list = acts.slice(0, 5);
    const body = list.length ? list.map((a, i) => `<div class="sit-act">
      <div class="sit-act-n">${i + 1}</div>
      <div class="sit-act-b"><div class="sit-act-t">${esc(a.t)}</div><div class="sit-act-m"><span class="sit-chip ${a.pr === 'High' ? 'high' : 'warn'}">${a.pr}</span> ${esc(a.why)}</div></div>
      <button class="sit-btn sm" onclick="switchTab('${a.tab}')">${esc(a.cta)}</button>
    </div>`).join('') : `<div class="sit-empty">No recommended actions right now.</div>`;
    return `<div class="sit-card"><div class="sit-h"><h3>Recommended actions</h3><span class="sit-meta">Links to Field ops</span></div>${body}</div>`;
  }

  // ── actions ──
  function openIncident(id) { if (window.fgOpen) fgOpen('alerts', id); else switchTab('alerts'); }
  function act(pid) { if (window.OpsForecast && window.switchTab) { switchTab('forecast'); setTimeout(() => { try { OpsForecast.select && OpsForecast.select(pid); } catch (_) {} }, 400); } else switchTab('maintenance'); }

  const STYLES = `
    .sit{display:flex;flex-direction:column;gap:16px;}
    .sit-load{padding:60px;text-align:center;color:var(--ink-3);}
    .sit-btn{background:var(--surface);border:1px solid var(--border-2);color:var(--ink);border-radius:9px;padding:9px 14px;font-weight:600;font-size:var(--fs-sm);cursor:pointer;font-family:inherit;}
    .sit-btn.sm{padding:6px 11px;font-size:var(--fs-xs);}
    .sit-btn.primary{background:linear-gradient(135deg,var(--blue),var(--teal));color:#fff;border:none;}
    .sit-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;box-shadow:var(--sh-xs);padding:16px 18px;}
    .sit-h{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;}
    .sit-h h3{font-size:var(--fs-base);font-weight:700;color:var(--ink);margin:0;}
    .sit-meta{font-size:var(--fs-2xs);color:var(--ink-3);}
    .sit-link{font-size:var(--fs-xs);color:var(--blue-hi);font-weight:600;cursor:pointer;white-space:nowrap;}
    .sit-empty{padding:18px 4px;color:var(--ink-3);font-size:var(--fs-sm);}
    .sit-skel{height:12px;border-radius:6px;background:var(--surface-3);margin:8px 0;}

    /* status strip */
    .sit-strip{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;}
    @media (max-width:1100px){ .sit-strip{grid-template-columns:repeat(2,1fr);} }
    .sit-stat{background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--off);border-radius:14px;box-shadow:var(--sh-xs);padding:14px 16px;}
    .sit-stat.ok{border-left-color:var(--ok);} .sit-stat.warn{border-left-color:var(--warn);} .sit-stat.bad{border-left-color:var(--err);}
    .sit-stat-l{font-size:var(--fs-2xs);text-transform:uppercase;letter-spacing:.4px;color:var(--ink-3);font-weight:700;}
    .sit-stat-v{font-size:26px;font-weight:800;color:var(--ink);letter-spacing:-.5px;margin:4px 0 2px;line-height:1;}
    .sit-stat-s{font-size:var(--fs-2xs);color:var(--ink-3);}

    .sit-grid-main{display:grid;grid-template-columns:1.7fr 1fr;gap:16px;}
    .sit-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
    @media (max-width:1000px){ .sit-grid-main,.sit-grid-2{grid-template-columns:1fr;} }

    /* map */
    .sit-mapcard{display:flex;flex-direction:column;}
    #sit-map{height:420px;border-radius:12px;overflow:hidden;border:1px solid var(--border);}
    .sit-layers{display:flex;gap:6px;flex-wrap:wrap;}
    .sit-pill{font-size:var(--fs-2xs);font-weight:600;color:var(--ink-2);background:var(--surface-2);border:1px solid var(--border-2);border-radius:20px;padding:5px 11px;cursor:pointer;}
    .sit-pill.on{background:var(--ink);color:var(--surface);border-color:var(--ink);}
    .sit-legend{display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;font-size:var(--fs-2xs);color:var(--ink-3);}
    .sit-legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:middle;}

    /* incidents */
    .sit-inc{display:flex;align-items:center;gap:11px;padding:11px 0;border-top:1px solid var(--border);cursor:pointer;}
    .sit-inc:first-of-type{border-top:none;}
    .sit-inc-b{flex:1;min-width:0;}
    .sit-inc-t{font-size:var(--fs-sm);font-weight:600;color:var(--ink);}
    .sit-inc-m{font-size:var(--fs-2xs);color:var(--ink-3);margin-top:1px;}
    .sit-inc-r{display:flex;flex-direction:column;align-items:flex-end;gap:4px;}
    .sit-ago{font-size:var(--fs-2xs);color:var(--ink-4);}
    .sit-chip{font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:var(--ob);color:var(--off);}
    .sit-chip.high,.sit-chip.critical{background:var(--eb);color:var(--err);}
    .sit-chip.medium,.sit-chip.moderate,.sit-chip.warn{background:var(--wb);color:var(--warn);}
    .sit-chip.ok{background:var(--ok-bg);color:var(--ok);}
    .sit-foot{margin-top:10px;font-size:var(--fs-xs);color:var(--blue-hi);font-weight:600;cursor:pointer;}

    /* zones */
    .sit-zone{display:grid;grid-template-columns:1fr 1.4fr auto;align-items:center;gap:12px;padding:9px 0;border-top:1px solid var(--border);}
    .sit-zone:first-of-type{border-top:none;}
    .sit-zone-n{font-size:var(--fs-sm);font-weight:600;color:var(--ink);}
    .sit-zone-c{display:inline-block;margin-left:6px;font-size:10px;color:var(--ink-4);font-weight:600;}
    .sit-zone-bar{height:7px;border-radius:5px;background:var(--surface-3);overflow:hidden;}
    .sit-zone-bar>div{height:100%;border-radius:5px;}
    .sit-zone-lv{font-size:var(--fs-2xs);font-weight:700;text-align:right;}

    /* timeline */
    .sit-tl{display:flex;gap:11px;padding:9px 0;}
    .sit-tl-dot{width:9px;height:9px;border-radius:50%;margin-top:5px;flex-shrink:0;}
    .sit-tl-t{font-size:var(--fs-sm);color:var(--ink);}
    .sit-tl-m{font-size:var(--fs-2xs);color:var(--ink-4);margin-top:1px;}

    /* rainfall */
    .sit-rain-top{display:flex;align-items:baseline;gap:8px;margin-bottom:8px;}
    .sit-rain-top b{font-size:20px;font-weight:800;color:var(--ink);}
    .sit-rain-top span{font-size:var(--fs-2xs);color:var(--ink-3);}
    .sit-rain-chart{position:relative;display:flex;align-items:flex-end;gap:2px;height:100px;padding-top:6px;}
    .sit-bar{flex:1;display:flex;align-items:flex-end;height:100%;}
    .sit-bar>div{width:100%;border-radius:2px 2px 0 0;}
    .sit-thresh{position:absolute;left:0;right:0;border-top:1px dashed var(--err);opacity:.5;}

    /* teams */
    .sit-team{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--border);}
    .sit-team:first-of-type{border-top:none;}
    .sit-team-n{font-size:var(--fs-sm);font-weight:600;color:var(--ink);}
    .sit-team-m{font-size:var(--fs-2xs);color:var(--ink-3);margin-top:1px;}

    /* emerging */
    .sit-emerge{padding:11px 0;border-top:1px solid var(--border);}
    .sit-emerge:first-of-type{border-top:none;}
    .sit-emerge-t{font-size:var(--fs-sm);font-weight:600;color:var(--ink);}
    .sit-emerge-m{font-size:var(--fs-2xs);color:var(--ink-3);margin:4px 0 8px;line-height:1.5;}

    /* actions */
    .sit-act{display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid var(--border);}
    .sit-act:first-of-type{border-top:none;}
    .sit-act-n{width:24px;height:24px;border-radius:7px;background:var(--surface-3);color:var(--ink-2);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:var(--fs-xs);flex-shrink:0;}
    .sit-act-b{flex:1;min-width:0;}
    .sit-act-t{font-size:var(--fs-sm);font-weight:600;color:var(--ink);}
    .sit-act-m{font-size:var(--fs-2xs);color:var(--ink-3);margin-top:2px;display:flex;align-items:center;gap:6px;}
  `;

  return { render, layer, openIncident, act };
})();
window.OpsSituation = OpsSituation;
