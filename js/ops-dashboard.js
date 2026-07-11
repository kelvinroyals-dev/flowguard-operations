// ============================================
// DASHBOARD MODULE — Light theme, Leaflet map
// ============================================

const OpsDashboard = (function () {
  let map = null;
  let layers = {};
  let baseTiles = null;
  let radarMap = null;
  let radarBase = null;

  function tileUrl() {
    const t = (window.OpsTheme && OpsTheme.get() === 'light') ? 'light_all' : 'dark_all';
    return `https://{s}.basemaps.cartocdn.com/${t}/{z}/{x}/{y}{r}.png`;
  }
  // instant tile swap on theme change — no re-render needed
  window.addEventListener('ops-theme-change', () => {
    if (baseTiles) baseTiles.setUrl(tileUrl());
    if (radarBase) radarBase.setUrl(tileUrl());
  });

  function loadLeaflet() {
    return new Promise((resolve) => {
      if (window.L) return resolve();
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      js.onload = resolve;
      document.head.appendChild(js);
    });
  }

  async function render(container) {
    if (map) { try { map.remove(); } catch (_) {} map = null; layers = {}; }
    if (radarMap) { try { radarMap.remove(); } catch (_) {} radarMap = null; }
    container.innerHTML = `
      <style>
        /* ══ COMMAND dashboard composition ══ */
        .cmd-kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(146px,1fr)); gap:12px; margin-bottom:14px; }
        .ck { background:var(--surface); border:1px solid var(--border); border-radius:var(--rs); padding:12px 14px; position:relative; overflow:hidden; box-shadow:var(--sh-xs); transition:border-color .15s, box-shadow .15s; }
        .ck:hover { border-color:var(--border-2); box-shadow:var(--sh-sm); }
        .ck-label { font-size:.57rem; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; color:var(--ink-3); display:flex; align-items:center; gap:6px; }
        .ck-label svg { width:13px; height:13px; color:var(--blue-hi); flex-shrink:0; }
        .ck-val { font-family:var(--ff-m); font-size:1.28rem; font-weight:600; color:var(--ink); margin-top:6px; line-height:1.1; }
        .ck-sub { font-size:.65rem; color:var(--ink-3); margin-top:3px; }
        .ck-sub.ok { color:var(--ok); } .ck-sub.err { color:var(--err); } .ck-sub.warn { color:var(--warn); }

        .cmd-main { display:grid; grid-template-columns:minmax(0,1fr) 300px; gap:12px; margin-bottom:14px; }
        .map-panel { position:relative; border-radius:var(--r); overflow:hidden; border:1px solid var(--border); min-height:430px; height:52vh; box-shadow:var(--sh-xs); }
        #fg-map { position:absolute; inset:0; z-index:1; }
        .map-legend { position:absolute; left:12px; top:12px; right:56px; z-index:500; display:flex; gap:6px; flex-wrap:wrap; }
        .map-stats-row { position:absolute; bottom:12px; left:12px; z-index:500; display:flex; gap:8px; flex-wrap:wrap; }

        .cmd-side { display:flex; flex-direction:column; gap:14px; min-width:0; }
        .cmd-panel { background:var(--surface); border:1px solid var(--border); border-radius:var(--r); overflow:hidden; box-shadow:var(--sh-xs); }
        .cmd-panel-h { padding:10px 13px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; }
        .cmd-panel-h b { font-size:.62rem; font-weight:700; letter-spacing:1.3px; text-transform:uppercase; color:var(--ink-2); }
        .cmd-panel-h a { font-size:.7rem; color:var(--blue-hi); cursor:pointer; text-decoration:none; font-weight:600; }

        /* priority queue */
        .pq-item { display:flex; gap:9px; padding:9px 12px; border-bottom:1px solid var(--border); align-items:flex-start; }
        .pq-item:last-child { border-bottom:none; }
        .pq-rank { width:20px; height:20px; border-radius:6px; flex-shrink:0; display:grid; place-items:center; font-family:var(--ff-m); font-size:.68rem; font-weight:700; color:#fff; margin-top:1px; }
        .pq-body { flex:1; min-width:0; }
        .pq-title { font-size:.74rem; font-weight:600; color:var(--ink); line-height:1.3; }
        .pq-sub { font-size:.68rem; color:var(--ink-3); margin-top:2px; }
        .pq-right { text-align:right; flex-shrink:0; }
        .pq-age { font-family:var(--ff-m); font-size:.66rem; color:var(--ink-3); white-space:nowrap; }
        .pq-chip { display:inline-block; padding:2px 7px; border-radius:5px; font-size:.58rem; font-weight:800; letter-spacing:.8px; text-transform:uppercase; }
        .pq-btn { margin-top:6px; padding:4px 10px; border-radius:7px; border:1px solid var(--blue-dim); background:transparent; color:var(--blue-hi); font-size:.66rem; font-weight:700; cursor:pointer; font-family:var(--ff-b); }
        .pq-btn:hover { background:var(--neon-glow); }
        .pq-empty { padding:22px 14px; font-size:.76rem; color:var(--ink-3); text-align:center; }

        /* field teams */
        .ft-row { display:flex; align-items:center; gap:9px; padding:8px 12px; border-bottom:1px solid var(--border); }
        .ft-row:last-child { border-bottom:none; }
        .ft-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
        .ft-name { font-size:.73rem; font-weight:600; color:var(--ink); flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .ft-meta { font-size:.66rem; color:var(--ink-3); font-family:var(--ff-m); white-space:nowrap; }

        .cmd-mid { display:grid; grid-template-columns:1.15fr 1fr; gap:12px; margin-bottom:14px; }
        /* infrastructure health minis */
        .ih-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; padding:12px 13px; }
        .ih-cell { border:1px solid var(--border); border-radius:9px; padding:10px 12px; }
        .ih-k { font-size:.62rem; font-weight:700; letter-spacing:.8px; text-transform:uppercase; color:var(--ink-3); }
        .ih-v { font-family:var(--ff-m); font-size:1rem; font-weight:600; color:var(--ink); margin:4px 0 6px; }
        .ih-bar { height:5px; border-radius:3px; background:var(--surface-3); overflow:hidden; }
        .ih-bar i { display:block; height:100%; border-radius:3px; }

        .cmd-bottom { display:grid; grid-template-columns:1.1fr 1.2fr .9fr; gap:12px; }
        .radar-body { position:relative; height:205px; }
        #radar-map { position:absolute; inset:0; }
        .radar-cap { position:absolute; left:10px; bottom:10px; z-index:500; font-family:var(--ff-m); font-size:.62rem; color:var(--ink-2); background:var(--overlay); border:1px solid var(--border); border-radius:6px; padding:3px 8px; }

        .wo-row { display:flex; align-items:center; gap:9px; padding:8px 12px; border-bottom:1px solid var(--border); }
        .wo-row:last-child { border-bottom:none; }
        .wo-id { font-family:var(--ff-m); font-size:.66rem; color:var(--ink-3); flex-shrink:0; }
        .wo-title { flex:1; min-width:0; font-size:.76rem; font-weight:500; color:var(--ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .wo-right { display:flex; gap:6px; align-items:center; flex-shrink:0; }

        .up-body { display:flex; gap:13px; align-items:center; padding:12px 13px; }
        .up-rows { flex:1; min-width:0; }
        .up-row { display:flex; justify-content:space-between; font-size:.72rem; color:var(--ink-2); padding:5px 0; border-bottom:1px solid var(--border); }
        .up-row:last-child { border-bottom:none; }
        .up-row b { color:var(--ink); font-family:var(--ff-m); font-weight:600; }

        .tl-body { padding:10px 12px 6px; }
        .tl-note { margin:0 14px 12px; padding:9px 12px; border-radius:9px; background:var(--surface-3); font-size:.72rem; color:var(--ink-2); line-height:1.5; }

        @media (max-width: 1500px) { .cmd-bottom { grid-template-columns:1fr 1fr; } }
        @media (max-width: 1100px) { .cmd-main { grid-template-columns:1fr; } }
        @media (max-width: 1100px) { .cmd-mid, .cmd-bottom { grid-template-columns:1fr; }  .map-panel{height:400px;} }

        /* popup styles (unchanged) */
        .fg-popup-title { font-family:var(--ff-d); font-size:.88rem; font-weight:700; color:var(--ink); margin-bottom:4px; }
        .fg-popup-badge { display:inline-block; padding:2px 8px; border-radius:12px; font-size:.65rem; font-weight:700; letter-spacing:.5px; text-transform:uppercase; margin-bottom:8px; }
        .fg-popup-row { font-size:.75rem; color:var(--ink-2); line-height:1.7; margin-bottom:1px; }
        .fg-popup-row span { color:var(--ink-3); }
        .leaflet-popup-content-wrapper, .leaflet-popup-tip { background:var(--surface); color:var(--ink); }

        /* legend + stat chips over the map */
        .lgd-chip, .mst-chip { background:var(--overlay); backdrop-filter:blur(6px); border:1px solid var(--border-2); border-radius:100px; padding:5px 12px; font-size:.68rem; font-weight:600; color:var(--ink-2); display:inline-flex; align-items:center; gap:7px; cursor:pointer; user-select:none; box-shadow:var(--sh-xs); white-space:nowrap; transition:all .12s; }
        .lgd-chip:hover { border-color:var(--blue-dim); color:var(--ink); }
        .lgd-title { background:transparent; border:none; box-shadow:none; cursor:default; color:var(--ink-3); font-size:.6rem; letter-spacing:1.2px; text-transform:uppercase; font-weight:800; padding:5px 2px; }
        .mst-chip { cursor:default; gap:5px; }
        .lgd-chip .dot { width:8px; height:8px; border-radius:50%; box-shadow:0 0 5px currentColor; flex-shrink:0; }
        .lgd-chip.off { opacity:.45; }
        .mst-chip b { font-family:var(--ff-m); color:var(--ink); }
      </style>

      <div class="cmd-kpis" id="dash-kpis"></div>

      <div class="cmd-main">
        <div class="map-panel">
          <div id="fg-map"></div>
          <div class="map-legend" id="map-legend"></div>
          <div class="map-stats-row" id="map-stats"></div>
        </div>
        <div class="cmd-side">
          <div class="cmd-panel">
            <div class="cmd-panel-h"><b>Priority queue</b><a onclick="switchTab('alerts')">All incidents →</a></div>
            <div id="dash-queue"><div class="pq-empty">Loading…</div></div>
          </div>
          <div class="cmd-panel">
            <div class="cmd-panel-h"><b>Field teams</b><a onclick="switchTab('teams')">All teams →</a></div>
            <div id="dash-teams"><div class="pq-empty">Loading…</div></div>
          </div>
        </div>
      </div>

      <div class="cmd-mid">
        <div class="cmd-panel">
          <div class="cmd-panel-h"><b>Infrastructure health</b><a onclick="switchTab('sensors')">All nodes →</a></div>
          <div class="ih-grid" id="dash-health"></div>
        </div>
        <div class="cmd-panel">
          <div class="cmd-panel-h"><b>Rainfall outlook — next 24h</b><span style="font-size:.62rem;color:var(--ink-3);font-family:var(--ff-m)">Open-Meteo · Lagos</span></div>
          <div class="tl-body" id="dash-timeline"></div>
        </div>
      </div>

      <div class="cmd-bottom">
        <div class="cmd-panel">
          <div class="cmd-panel-h"><b>Rainfall radar</b><span style="font-size:.62rem;color:var(--ink-3);font-family:var(--ff-m)" id="radar-ts"></span></div>
          <div class="radar-body"><div id="radar-map"></div><div class="radar-cap">RainViewer · live composite</div></div>
        </div>
        <div class="cmd-panel">
          <div class="cmd-panel-h"><b>Work order queue</b><a onclick="switchTab('alerts')">All →</a></div>
          <div id="dash-workorders"><div class="pq-empty">Loading…</div></div>
        </div>
        <div class="cmd-panel">
          <div class="cmd-panel-h"><b>System uptime</b></div>
          <div class="up-body" id="dash-uptime"></div>
        </div>
      </div>
    `;

    await loadLeaflet();
    initMap();
    initRadar();
    loadTimeline();
    loadAllData();
    // keep the map honest about its container for the panel's lifetime
    const mp = container.querySelector('.map-panel');
    if (mp && window.ResizeObserver) {
      new ResizeObserver(() => { try { map && map.invalidateSize(); radarMap && radarMap.invalidateSize(); } catch (_) {} }).observe(mp);
    }
  }

  function initMap() {
    map = L.map('fg-map', {
      center: [6.5244, 3.3792],
      zoom: 11,
      zoomControl: false,
      attributionControl: true,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    baseTiles = L.tileLayer(tileUrl(), {
      attribution: '&copy; <a href="https://www.openstreetmap.org">OSM</a> &copy; <a href="https://carto.com">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    layers = {
      areas_submitted:  L.layerGroup().addTo(map),
      areas_inspection: L.layerGroup().addTo(map),
      areas_active:     L.layerGroup().addTo(map),
      sites:            L.layerGroup().addTo(map),
      sensors:          L.layerGroup(),
      alerts:           L.layerGroup().addTo(map),
      flood_risk:       L.layerGroup().addTo(map),
      hfp_zones:        L.layerGroup().addTo(map),
      coverage:         L.layerGroup().addTo(map),
    };

    plotHFPZones();
    renderLegend();
  }

  function renderLegend() {
    const items = [
      { key: 'areas_submitted',  color: 'var(--warn)',    label: 'Pending' },
      { key: 'areas_inspection', color: 'var(--caut)',    label: 'Inspection' },
      { key: 'areas_active',     color: 'var(--blue-hi)', label: 'Active' },
      { key: 'sites',            color: 'var(--ink-2)',   label: 'Sites' },
      { key: 'sensors',          color: 'var(--off)',     label: 'Sensors' },
      { key: 'alerts',           color: 'var(--err)',     label: 'Alerts' },
      { key: 'flood_risk',       color: '#f87171',        label: 'Flood risk' },
      { key: 'hfp_zones',        color: '#8b5cf6',        label: 'HFP zones' },
      { key: 'coverage',         color: 'var(--blue-dim)',label: 'Coverage' },
    ];
    document.getElementById('map-legend').innerHTML = '<span class="lgd-chip lgd-title">Layers</span>' + items.map(i => `
      <span class="lgd-chip ${map.hasLayer(layers[i.key]) ? '' : 'off'}"
        onclick="OpsDashboard.toggleLayer('${i.key}', this)">
        <span class="dot" style="background:${i.color}"></span>${i.label}
      </span>`).join('');
  }

  function toggleLayer(key, el) {
    if (!layers[key]) return;
    if (map.hasLayer(layers[key])) {
      map.removeLayer(layers[key]);
      el.classList.add('off');
    } else {
      layers[key].addTo(map);
      el.classList.remove('off');
    }
  }

  async function loadAllData() {
    if (!Auth.isAuthenticated()) return;

    try {
      const [mapRes, kpiRes, teamRes, tickRes] = await Promise.all([
        OpsModal.apiGet('/analytics/map-data'),
        OpsModal.apiGet('/analytics/kpis'),
        OpsModal.apiGet('/teams').catch(() => ({ data: [] })),
        OpsModal.apiGet('/tickets?limit=8').catch(() => ({ data: [] })),
      ]);

      const md    = mapRes.data || {};
      const kpis  = kpiRes.data || {};
      const teams = teamRes.data || [];
      const ticks = tickRes.data || [];

      plotAreas(md.areas || []);
      plotSites(md.sites || []);
      plotSensors(md.sensors || []);
      plotAlerts(md.alerts || []);
      plotFloodRisk(md.flood_risk || []);
      renderMapStats(md, kpis);
      // container can settle after init — recalc so tiles fill the panel
      if (map) { setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 60); }
      renderKpiStrip(kpis, md, teams);
      renderQueue(md.alerts || []);
      renderTeamsPanel(teams);
      renderHealth(md.sensors || [], kpis);
      renderWorkOrders(ticks);
      renderUptime(kpis);
      fitBounds(md);

      // Update global alert count in shell
      if (typeof updateAlertCount === 'function') {
        updateAlertCount(kpis.activeAlerts || 0);
      }

    } catch (err) {
      console.error('Dashboard data error:', err);
    }
  }

  // ── Marker factory ──
  function makeIcon(color, size, pulse) {
    const s = size || 12;
    const ring = pulse
      ? `<div style="position:absolute;top:50%;left:50%;width:${s}px;height:${s}px;margin:-${s / 2}px;border-radius:50%;border:2px solid ${color};animation:dashPulse 1.6s ease-out infinite;"></div>`
      : '';
    return L.divIcon({
      className: '',
      iconSize:  [s, s],
      iconAnchor: [s / 2, s / 2],
      html: `
        <style>@keyframes dashPulse{0%{transform:scale(1);opacity:.7;}100%{transform:scale(2.4);opacity:0;}}</style>
        <div style="position:relative;width:${s}px;height:${s}px;">
          <div style="width:${s}px;height:${s}px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,.7);box-shadow:0 1px 4px rgba(0,0,0,.2),0 0 0 1px ${color}40;"></div>
          ${ring}
        </div>`,
    });
  }

  // ── Popup helpers ──
  function statusColor(s) {
    const m = { submitted:'#fbbf24', inspection_scheduled:'#fb923c', inspection_ongoing:'#fb923c', report_ready:'#eab308', active:'#22d3ee' };
    return m[s] || '#7d8fa3';
  }

  function areaPopup(a) {
    const sc = statusColor(a.status);
    const sl = (a.status || '').replace(/_/g, ' ');
    return `
      <div style="min-width:200px;">
        <div class="fg-popup-title">${a.property_name || 'Unknown Area'}</div>
        <div class="fg-popup-badge" style="background:${sc}18;color:${sc};border:1px solid ${sc}40;">${sl}</div>
        <div class="fg-popup-row">${a.property_type ? `<span>Type</span>&nbsp;&nbsp;${(a.property_type||'').replace(/_/g,' ')}` : ''}</div>
        <div class="fg-popup-row">${a.city ? `<span>Location</span>&nbsp;&nbsp;${a.city}${a.state?', '+a.state:''}` : ''}</div>
        <div class="fg-popup-row">${a.client_name ? `<span>Client</span>&nbsp;&nbsp;${a.client_name}` : ''}</div>
        ${a.urgency_level ? `<div class="fg-popup-row"><span>Urgency</span>&nbsp;&nbsp;<strong style="color:${{ critical:'#f87171',high:'#fb923c',medium:'#fbbf24',low:'#22d3ee' }[a.urgency_level]||'#7d8fa3'};">${a.urgency_level}</strong></div>` : ''}
      </div>`;
  }

  function sitePopup(s) {
    const online = parseInt(s.sensors_online) || 0;
    const total  = parseInt(s.sensor_count) || 0;
    const alerts = parseInt(s.active_alerts) || 0;
    const pct    = total > 0 ? Math.round((online / total) * 100) : 0;
    const hc     = pct >= 90 ? '#0a8a6a' : pct >= 70 ? '#fbbf24' : '#f87171';
    return `
      <div style="min-width:220px;">
        <div class="fg-popup-title">⚡ ${s.name}</div>
        <div class="fg-popup-badge" style="background:#22d3ee18;color:#22d3ee;border:1px solid #22d3ee40;">${s.tier} tier · ${s.status}</div>
        <div class="fg-popup-row"><span>Location</span>&nbsp;&nbsp;${s.location || '—'}</div>
        <div class="fg-popup-row"><span>Coverage</span>&nbsp;&nbsp;${s.coverage_km || 0} km</div>
        <div class="fg-popup-row"><span>MRR</span>&nbsp;&nbsp;₦${Number(s.mrr || 0).toLocaleString()}</div>
        <div class="fg-popup-row"><span>Sensors</span>&nbsp;&nbsp;<strong style="color:${hc};">${online}/${total}</strong> online (${pct}%)</div>
        <div class="fg-popup-row" style="color:${alerts>0?'#f87171':'#0a8a6a'};font-weight:600;">${alerts > 0 ? `⚠ ${alerts} active alert${alerts>1?'s':''}` : '✓ No active alerts'}</div>
      </div>`;
  }

  // ── Plotters ──
  function plotAreas(areas) {
    layers.areas_submitted.clearLayers();
    layers.areas_inspection.clearLayers();
    layers.areas_active.clearLayers();

    areas.forEach(a => {
      const lat = parseFloat(a.latitude), lng = parseFloat(a.longitude);
      if (!lat || !lng) return;

      let layer, color, size;
      const s = a.status;

      if (s === 'submitted')                                      { layer = layers.areas_submitted;  color = '#fbbf24'; size = 14; }
      else if (['inspection_scheduled','inspection_ongoing'].includes(s)) { layer = layers.areas_inspection; color = '#fb923c'; size = 14; }
      else if (s === 'active')                                    { layer = layers.areas_active;     color = '#22d3ee'; size = 16; }
      else if (['report_ready','quote_sent','payment_pending','payment_completed','deployment_scheduled'].includes(s)) { layer = layers.areas_inspection; color = '#eab308'; size = 12; }
      else                                                        { layer = layers.areas_submitted;  color = '#7d8fa3'; size = 10; }

      const marker = L.marker([lat, lng], { icon: makeIcon(color, size, s === 'submitted') });
      marker.bindPopup(areaPopup(a));
      layer.addLayer(marker);
    });
  }

  function plotSites(sites) {
    layers.sites.clearLayers();
    layers.coverage.clearLayers();

    sites.forEach(s => {
      const lat = parseFloat(s.latitude), lng = parseFloat(s.longitude);
      if (!lat || !lng) return;

      // Coverage circle
      const radius = (parseFloat(s.coverage_km) || 2) * 1000;
      layers.coverage.addLayer(L.circle([lat, lng], {
        radius, color: '#22d3ee', weight: 1, opacity: .35,
        fillColor: '#22d3ee', fillOpacity: .06, dashArray: '5 4',
      }));

      // Site marker — distinctive square icon
      const icon = L.divIcon({
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        html: `<div style="width:28px;height:28px;border-radius:7px;background:#1b3a52;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(10,42,61,.35);">
          <svg width="13" height="13" fill="none" stroke="#22d3ee" stroke-width="2.5" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
        </div>`,
      });

      const marker = L.marker([lat, lng], { icon });
      marker.bindPopup(sitePopup(s));
      layers.sites.addLayer(marker);
    });
  }

  function plotSensors(sensors) {
    layers.sensors.clearLayers();
    sensors.forEach(s => {
      const lat = parseFloat(s.latitude), lng = parseFloat(s.longitude);
      if (!lat || !lng) return;
      const c = s.status === 'active' ? '#22d3ee' : s.status === 'maintenance' ? '#fbbf24' : '#f87171';
      const marker = L.marker([lat, lng], { icon: makeIcon(c, 8, false) });
      marker.bindPopup(`
        <div style="min-width:160px;">
          <div class="fg-popup-title">${s.name || s.sensor_id}</div>
          <div class="fg-popup-row"><span>Status</span>&nbsp;&nbsp;<strong style="color:${c};">${s.status}</strong></div>
          ${s.site_name  ? `<div class="fg-popup-row"><span>Site</span>&nbsp;&nbsp;${s.site_name}</div>`  : ''}
          ${s.zone       ? `<div class="fg-popup-row"><span>Zone</span>&nbsp;&nbsp;${s.zone}</div>`       : ''}
          ${s.last_ping  ? `<div class="fg-popup-row"><span>Last ping</span>&nbsp;&nbsp;${new Date(s.last_ping).toLocaleTimeString()}</div>` : ''}
        </div>`);
      layers.sensors.addLayer(marker);
    });
  }

  function plotAlerts(alerts) {
    layers.alerts.clearLayers();
    alerts.forEach(a => {
      const lat = parseFloat(a.latitude), lng = parseFloat(a.longitude);
      if (!lat || !lng) return;
      const isCrit = a.severity === 'critical';
      const color  = isCrit ? '#f87171' : a.severity === 'high' ? '#fb923c' : '#fbbf24';
      const size   = isCrit ? 18 : 14;
      const marker = L.marker([lat, lng], { icon: makeIcon(color, size, true) });
      marker.bindPopup(`
        <div style="min-width:200px;">
          <div class="fg-popup-title" style="color:${color};">⚠ ${a.alert_type || 'Alert'}</div>
          <div class="fg-popup-badge" style="background:${color}18;color:${color};border:1px solid ${color}40;">${a.severity}</div>
          ${a.description   ? `<div class="fg-popup-row">${a.description}</div>` : ''}
          ${a.sensor_name   ? `<div class="fg-popup-row"><span>Sensor</span>&nbsp;&nbsp;${a.sensor_name}</div>` : ''}
          ${a.site_name     ? `<div class="fg-popup-row"><span>Site</span>&nbsp;&nbsp;${a.site_name}</div>` : ''}
          ${a.time_to_overflow_min ? `<div class="fg-popup-row" style="color:#f87171;font-weight:600;">Overflow in: ${a.time_to_overflow_min} min</div>` : ''}
          <div class="fg-popup-row"><span>Reported</span>&nbsp;&nbsp;${new Date(a.created_at).toLocaleString()}</div>
        </div>`);
      layers.alerts.addLayer(marker);
    });
  }

  function plotFloodRisk(risks) {
    layers.flood_risk.clearLayers();
    risks.forEach(r => {
      const lat = parseFloat(r.latitude), lng = parseFloat(r.longitude);
      if (!lat || !lng) return;
      const colors  = { critical:'#f87171', high:'#fb923c', moderate:'#fbbf24', low:'#22d3ee' };
      const radii   = { critical:800, high:600, moderate:400, low:200 };
      const color   = colors[r.flood_risk_level] || '#fbbf24';
      layers.flood_risk.addLayer(L.circle([lat, lng], {
        radius: radii[r.flood_risk_level] || 400,
        color, weight: 1.5, opacity: .55,
        fillColor: color, fillOpacity: .1,
        dashArray: r.flood_risk_level === 'critical' ? '' : '4 4',
      }));
    });
  }

  // ── HFP Zones (static reference data) ──
  const HFP_ZONES = [
    { name:'Victoria Island / Lekki Phase 1', lat:6.4281, lng:3.4219, risk:'critical', radius:1200, reason:'Most flood-exposed locality — low-lying peninsula between Lagos Lagoon and Atlantic Ocean.' },
    { name:'Lekki Phase 1 – Admiralty Way',   lat:6.4400, lng:3.4700, risk:'critical', radius:900,  reason:'Reclaimed marshland. Severe flooding Jul 2024. Streets submerged, buildings collapsed.' },
    { name:'Ibeju-Lekki',                     lat:6.4500, lng:3.5800, risk:'high',     radius:1500, reason:'Coastal flooding, rising sea level, tidal surge.' },
    { name:'Ajegunle (Ajilete Axis)',          lat:6.4520, lng:3.3312, risk:'critical', radius:1000, reason:'Lagos State Govt evacuation order Aug 2025. Low-lying, poor drainage.' },
    { name:'Majidun, Ikorodu',                 lat:6.6151, lng:3.4674, risk:'critical', radius:900,  reason:'Govt warned residents to evacuate Aug 2025. Annual inundation.' },
    { name:'Agboyi / Owode Onirin',            lat:6.5900, lng:3.4000, risk:'high',     radius:800,  reason:'Houses submerged in multiple flood events.' },
    { name:'Isheri / OPIC Area',               lat:6.6300, lng:3.3500, risk:'high',     radius:1000, reason:'Named in Aug 2025 govt flood warning. Ogun River floodplain.' },
    { name:'Ketu / Alapere',                   lat:6.5846, lng:3.3901, risk:'high',     radius:700,  reason:'Houses submerged in low-lying communities.' },
    { name:'Lagos Island',                     lat:6.4550, lng:3.3940, risk:'high',     radius:800,  reason:'Highest intensity flooding in Lagos State — yearly since 1968.' },
    { name:'Surulere Basin',                   lat:6.4920, lng:3.3560, risk:'moderate', radius:900,  reason:'Moderate risk. Drainage overwhelmed during heavy rain events.' },
    { name:'Apapa',                            lat:6.4490, lng:3.3590, risk:'moderate', radius:700,  reason:'Port area, low-lying. Tidal influence from Lagos Harbour.' },
    { name:'Mushin / Shomolu',                 lat:6.5300, lng:3.3550, risk:'moderate', radius:800,  reason:'Dense urban area with overwhelmed drainage channels.' },
    { name:'Ikoyi',                            lat:6.4520, lng:3.4350, risk:'moderate', radius:600,  reason:'Island geography vulnerable to tidal surge and lagoon overflow.' },
    { name:'Ajeromi-Ifelodun Central',         lat:6.4480, lng:3.3410, risk:'high',     radius:800,  reason:'66% of LGA land at high risk. Dense informal settlement.' },
    { name:'Badagry',                          lat:6.4150, lng:2.8810, risk:'high',     radius:1500, reason:'Coastal town — unregulated construction on natural buffers.' },
    { name:'Ojo',                              lat:6.4050, lng:3.2010, risk:'moderate', radius:1000, reason:'Coastal proximity, poor drainage infrastructure.' },
    { name:'Amuwo-Odofin',                     lat:6.4630, lng:3.3100, risk:'moderate', radius:800,  reason:'Low-lying between Lagos Lagoon channels.' },
    { name:'Agege',                            lat:6.6180, lng:3.3370, risk:'moderate', radius:700,  reason:'Drainage overwhelm during peak rainfall despite higher elevation.' },
    { name:'Mile 12 / Agiliti',                lat:6.5880, lng:3.3920, risk:'moderate', radius:600,  reason:'Low-lying market area prone to waterlogging.' },
  ];

  function plotHFPZones() {
    layers.hfp_zones.clearLayers();
    const cfg = {
      critical: { color:'#7c3aed', fillOpacity:.12, weight:2, dashArray:'' },
      high:     { color:'#6d28d9', fillOpacity:.08, weight:1.5, dashArray:'5 3' },
      moderate: { color:'#5b21b6', fillOpacity:.05, weight:1, dashArray:'4 4' },
    };

    HFP_ZONES.forEach(zone => {
      const c = cfg[zone.risk] || cfg.moderate;
      const circle = L.circle([zone.lat, zone.lng], {
        radius: zone.radius, color: c.color, weight: c.weight,
        opacity: .65, fillColor: c.color, fillOpacity: c.fillOpacity, dashArray: c.dashArray,
      });
      circle.bindPopup(`
        <div style="min-width:220px;">
          <div class="fg-popup-title" style="color:#7c3aed;">⚠ ${zone.name}</div>
          <div class="fg-popup-badge" style="background:#7c3aed18;color:#7c3aed;border:1px solid #7c3aed40;">${zone.risk} flood probability</div>
          <div class="fg-popup-row">${zone.reason}</div>
          <div style="margin-top:8px;padding-top:6px;border-top:1px solid #dae6ef;font-size:.68rem;color:#7d8fa3;">
            Source: Lagos State flood assessments, NEMA/SEMA, EM-DAT records
          </div>
        </div>`);
      layers.hfp_zones.addLayer(circle);

      if (zone.risk === 'critical') {
        const icon = L.divIcon({
          className: '', iconSize: [14,14], iconAnchor: [7,7],
          html: `<div style="width:14px;height:14px;border-radius:50%;background:#7c3aed;border:2px solid #fff;box-shadow:0 0 0 3px #7c3aed30;"></div>`,
        });
        const m = L.marker([zone.lat, zone.lng], { icon });
        m.bindPopup(circle.getPopup());
        layers.hfp_zones.addLayer(m);
      }
    });
  }

  // ── Map stat chips ──
  function renderMapStats(md, kpis) {
    const areas       = md.areas || [];
    const submitted   = areas.filter(a => a.status === 'submitted').length;
    const activeSites = (md.sites || []).length;
    const alertCount  = (md.alerts || []).length;
    const sensorCount = (md.sensors || []).length;
    const chip = (v, l, c) => `<span class="mst-chip"><b style="${c ? `color:${c}` : ''}">${v}</b><span>${l}</span></span>`;
    document.getElementById('map-stats').innerHTML =
      chip(activeSites, 'sites', 'var(--blue-hi)') +
      chip(alertCount, 'alerts', alertCount ? 'var(--err)' : null) +
      chip(sensorCount, 'sensors') +
      chip(submitted, 'pending') +
      chip(HFP_ZONES.length, 'HFP zones', '#8b5cf6');
  }

  function fitBounds(md) {
    const coords = [];
    ['areas','sites','sensors'].forEach(key => {
      (md[key] || []).forEach(item => {
        if (item.latitude && item.longitude) coords.push([parseFloat(item.latitude), parseFloat(item.longitude)]);
      });
    });
    if (coords.length > 0) map.fitBounds(L.latLngBounds(coords).pad(.15));
  }

  // ── Side panel ──
  // ── relative age ──
  function rel(ts) {
    try {
      const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
      if (m < 1) return 'now';
      if (m < 60) return m + 'm';
      if (m < 1440) return Math.floor(m / 60) + 'h';
      return Math.floor(m / 1440) + 'd';
    } catch (_) { return ''; }
  }

  // ── KPI strip (6) ──
  function renderKpiStrip(kpis, md, teams) {
    const el = document.getElementById('dash-kpis');
    if (!el) return;
    const areas = md.areas || [];
    const active = areas.filter(a => a.status === 'active').length;
    const so = kpis.sensorsOnline || {};
    const pct = so.total ? Math.round((so.online / so.total) * 100) : null;
    const crit = parseInt(kpis.criticalAlerts) || 0;
    const deployed = teams.filter(t => ['on_site', 'en_route'].includes((t.status || '').toLowerCase())).length;
    const ic = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
    const card = (icon, label, val, sub, subCls) => `
      <div class="ck">
        <div class="ck-label">${icon}${label}</div>
        <div class="ck-val">${val}</div>
        <div class="ck-sub ${subCls || ''}">${sub}</div>
      </div>`;
    el.innerHTML =
      card(ic('<path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/>'), 'Assets monitored', areas.length, `${active} live`, active ? 'ok' : '') +
      card(ic('<circle cx="12" cy="12" r="3"/><path d="M12 5V3M12 21v-2M5 12H3M21 12h-2M6.4 6.4L5 5M19 19l-1.4-1.4M6.4 17.6L5 19M19 5l-1.4 1.4"/>'), 'Sensors online', so.total ? `${so.online}/${so.total}` : '—', pct != null ? `${pct}% reporting` : 'No nodes yet', pct != null ? (pct >= 90 ? 'ok' : pct >= 75 ? 'warn' : 'err') : '') +
      card(ic('<path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'), 'Open incidents', kpis.activeAlerts || 0, crit ? `${crit} critical` : 'None critical', crit ? 'err' : 'ok') +
      card(ic('<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>'), 'Teams deployed', deployed, `${teams.length} total`, deployed ? 'ok' : '') +
      card(ic('<path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>'), 'Monthly revenue', formatMoney(kpis.mrr || 0), 'Recurring', '') +
      card(ic('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>'), 'Pending inspections', parseInt(kpis.pendingInspections) || 0, 'Awaiting scheduling', parseInt(kpis.pendingInspections) ? 'warn' : 'ok');
  }

  // ── Priority queue: incidents ranked by severity, then age ──
  function renderQueue(alerts) {
    const el = document.getElementById('dash-queue');
    if (!el) return;
    const rank = { critical: 0, high: 1, warning: 2, medium: 2, low: 3 };
    const open = alerts
      .filter(a => (a.status || 'active') !== 'resolved')
      .sort((x, y) => (rank[x.severity] ?? 4) - (rank[y.severity] ?? 4) || new Date(y.created_at) - new Date(x.created_at))
      .slice(0, 5);
    if (!open.length) { el.innerHTML = '<div class="pq-empty">No open incidents — network is clear.</div>'; return; }
    const sevColor = sv => sv === 'critical' ? 'var(--err)' : sv === 'high' ? 'var(--caut)' : 'var(--warn)';
    el.innerHTML = open.map((a, i) => `
      <div class="pq-item">
        <div class="pq-rank" style="background:${sevColor(a.severity)}">${i + 1}</div>
        <div class="pq-body">
          <div class="pq-title">${a.alert_type || 'Alert'}${a.site_name ? ' — ' + a.site_name : ''}</div>
          <div class="pq-sub">${a.description || a.sensor_name || ''}</div>
          ${a.time_to_overflow_min ? `<div class="pq-sub" style="color:var(--err);font-weight:700">Overflow in ~${a.time_to_overflow_min} min</div>` : ''}
          <button class="pq-btn" onclick="switchTab('alerts')">Respond →</button>
        </div>
        <div class="pq-right">
          <span class="pq-chip" style="background:${sevColor(a.severity)}20;color:${sevColor(a.severity)}">${a.severity}</span>
          <div class="pq-age" style="margin-top:5px">${rel(a.created_at)}</div>
        </div>
      </div>`).join('');
  }

  // ── Field teams ──
  function renderTeamsPanel(teams) {
    const el = document.getElementById('dash-teams');
    if (!el) return;
    if (!teams.length) { el.innerHTML = '<div class="pq-empty">No field teams registered yet.</div>'; return; }
    const stMap = { on_site: ['var(--ok)', 'On site'], en_route: ['var(--warn)', 'En route'], idle: ['var(--off)', 'Standby'] };
    el.innerHTML = teams.slice(0, 5).map(t => {
      const [c, lbl] = stMap[(t.status || '').toLowerCase()] || ['var(--off)', 'Standby'];
      const members = t.member_count ?? (Array.isArray(t.members) ? t.members.length : null);
      return `
      <div class="ft-row">
        <span class="ft-dot" style="background:${c};box-shadow:0 0 6px ${c}"></span>
        <span class="ft-name">${t.team_name || t.name || 'Team'}</span>
        <span class="ft-meta">${t.current_zone || t.zone || ''}${members != null ? ` · ${members} crew` : ''}</span>
        <span class="pq-chip" style="background:${c}20;color:${c}">${lbl}</span>
      </div>`;
    }).join('');
  }

  // ── Infrastructure health: sensor network by state + battery/signal where present ──
  function renderHealth(sensors, kpis) {
    const el = document.getElementById('dash-health');
    if (!el) return;
    const total = sensors.length;
    const by = st => sensors.filter(x => x.status === st).length;
    const online = by('active'), maint = by('maintenance');
    const offline = total - online - maint;
    const lowBatt = sensors.filter(x => x.battery_percent != null && x.battery_percent < 20).length;
    const battKnown = sensors.some(x => x.battery_percent != null);
    const uptime = kpis.networkUptime || null;
    const cell = (k, v, ratio, color) => `
      <div class="ih-cell">
        <div class="ih-k">${k}</div>
        <div class="ih-v">${v}</div>
        <div class="ih-bar"><i style="width:${Math.max(0, Math.min(100, ratio))}%;background:${color}"></i></div>
      </div>`;
    el.innerHTML =
      cell('Nodes online', total ? `${online}/${total}` : '—', total ? online / total * 100 : 0, 'var(--ok)') +
      cell('In maintenance', maint, total ? maint / total * 100 : 0, 'var(--warn)') +
      cell('Offline', offline, total ? offline / total * 100 : 0, offline ? 'var(--err)' : 'var(--ok)') +
      cell('Low battery', battKnown ? lowBatt : '—', battKnown && total ? lowBatt / total * 100 : 0, lowBatt ? 'var(--caut)' : 'var(--ok)') +
      cell('Network uptime', uptime ? uptime + '%' : '—', uptime || 0, 'var(--blue-hi)') +
      cell('Critical alerts', parseInt(kpis.criticalAlerts) || 0, Math.min(100, (parseInt(kpis.criticalAlerts) || 0) * 20), (parseInt(kpis.criticalAlerts) || 0) ? 'var(--err)' : 'var(--ok)');
  }

  // ── Rainfall outlook (24h, Open-Meteo) — bars + insight, no fabricated predictions ──
  async function loadTimeline() {
    const el = document.getElementById('dash-timeline');
    if (!el) return;
    try {
      const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=6.45&longitude=3.47&hourly=precipitation,precipitation_probability&timezone=Africa%2FLagos&forecast_hours=24');
      const j = await r.json();
      const hrs = j.hourly.time.map((t, i) => ({ t: new Date(t), mm: j.hourly.precipitation[i] || 0, prob: j.hourly.precipitation_probability[i] || 0 }));
      const w = 560, h = 170, padL = 32, padR = 8, padT = 12, padB = 24;
      const maxMm = Math.max(2, Math.ceil(Math.max(...hrs.map(x => x.mm))));
      const bw = (w - padL - padR) / hrs.length - 3;
      const x = i => padL + i * ((w - padL - padR) / hrs.length);
      const y = v => padT + (1 - v / maxMm) * (h - padT - padB);
      const bars = hrs.map((p, i) => {
        const c = p.mm >= 5 ? 'var(--err)' : p.mm >= 2 ? 'var(--warn)' : 'var(--blue-hi)';
        return `<rect x="${x(i).toFixed(1)}" y="${y(p.mm).toFixed(1)}" width="${bw.toFixed(1)}" height="${(y(0) - y(p.mm)).toFixed(1)}" rx="2" fill="${c}" opacity=".9"><title>${p.t.getHours()}:00 — ${p.mm}mm (${p.prob}%)</title></rect>`;
      }).join('');
      const grid = [0, .5, 1].map(f => { const g = Math.round(maxMm * f * 10) / 10; return `<line x1="${padL}" y1="${y(g)}" x2="${w - padR}" y2="${y(g)}" stroke="var(--border)" stroke-width="1"/><text x="${padL - 5}" y="${y(g) + 3}" fill="var(--ink-3)" font-size="9.5" text-anchor="end">${g}</text>`; }).join('');
      const xl = hrs.map((p, i) => p.t.getHours() % 6 === 0 ? `<text x="${x(i) + bw / 2}" y="${h - 8}" fill="var(--ink-3)" font-size="9.5" text-anchor="middle">${p.t.getHours()}:00</text>` : '').join('');
      const tot = Math.round(hrs.reduce((sm, p) => sm + p.mm, 0) * 10) / 10;
      const peak = hrs.reduce((a2, b2) => b2.mm > a2.mm ? b2 : a2, hrs[0]);
      el.innerHTML = `
        <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto">${grid}${bars}${xl}</svg>
        <div class="tl-note" style="margin:10px 0 6px">${tot >= 15
          ? `<b style="color:var(--err)">${tot}mm expected in 24h</b> — heaviest around ${peak.t.getHours()}:00 (${peak.mm}mm/h). High-silt assets should be cleared before then.`
          : tot >= 4
          ? `<b>${tot}mm expected in 24h</b> — peak around ${peak.t.getHours()}:00. Network capacity is adequate.`
          : `Light rainfall (${tot}mm) over the next 24h — no intervention window needed.`}</div>`;
    } catch (_) { el.innerHTML = '<div class="pq-empty">Weather service unreachable.</div>'; }
  }

  // ── Rainfall radar (RainViewer — real composite) ──
  async function initRadar() {
    const elMap = document.getElementById('radar-map');
    if (!elMap || !window.L) return;
    radarMap = L.map('radar-map', { center: [6.52, 3.55], zoom: 9, minZoom: 6, maxZoom: 11, zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false });
    setTimeout(() => { try { radarMap.invalidateSize(); radarMap.setView([6.52, 3.55], 9); } catch (_) {} }, 250);
    radarBase = L.tileLayer(tileUrl(), { subdomains: 'abcd', maxZoom: 11 }).addTo(radarMap);
    try {
      const r = await fetch('https://api.rainviewer.com/public/weather-maps.json');
      const j = await r.json();
      const frames = (j.radar && (j.radar.nowcast || []).concat(j.radar.past || [])) || [];
      const frame = (j.radar && j.radar.past && j.radar.past[j.radar.past.length - 1]) || frames[0];
      if (frame) {
        L.tileLayer(`${j.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`, { opacity: .75, maxZoom: 11, maxNativeZoom: 10 }).addTo(radarMap);
        const ts = document.getElementById('radar-ts');
        if (ts) ts.textContent = new Date(frame.time * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ' WAT';
      }
    } catch (_) { /* radar optional */ }
  }

  // ── Work order queue (tickets) ──
  function renderWorkOrders(ticks) {
    const el = document.getElementById('dash-workorders');
    if (!el) return;
    const open = (ticks || []).filter(t => !['resolved', 'closed'].includes((t.status || '').toLowerCase())).slice(0, 6);
    if (!open.length) { el.innerHTML = '<div class="pq-empty">No open work orders.</div>'; return; }
    const pc = p => p === 'urgent' ? 'var(--err)' : p === 'high' ? 'var(--caut)' : p === 'normal' ? 'var(--warn)' : 'var(--off)';
    el.innerHTML = open.map(t => `
      <div class="wo-row">
        <span class="wo-id">${t.ticket_id || ''}</span>
        <span class="wo-title">${t.subject || t.title || 'Work order'}</span>
        <span class="wo-right">
          <span class="pq-chip" style="background:${pc(t.priority)}20;color:${pc(t.priority)}">${t.priority || '—'}</span>
          <span class="pq-age">${rel(t.created_at)}</span>
        </span>
      </div>`).join('');
  }

  // ── Uptime card ──
  function renderUptime(kpis) {
    const el = document.getElementById('dash-uptime');
    if (!el) return;
    const up = parseFloat(kpis.networkUptime) || 0;
    const so = kpis.sensorsOnline || {};
    const r = 42, c = 2 * Math.PI * r, off = c * (1 - up / 100);
    const col = up >= 98 ? 'var(--ok)' : up >= 92 ? 'var(--warn)' : 'var(--err)';
    el.innerHTML = `
      <svg width="110" height="110" viewBox="0 0 110 110" style="flex-shrink:0">
        <circle cx="55" cy="55" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="9"/>
        <circle cx="55" cy="55" r="${r}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round"
          stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 55 55)"/>
        <text x="55" y="52" text-anchor="middle" fill="var(--ink)" font-size="19" font-weight="700" font-family="var(--ff-m)">${up || '—'}${up ? '%' : ''}</text>
        <text x="55" y="68" text-anchor="middle" fill="var(--ink-3)" font-size="9">uptime</text>
      </svg>
      <div class="up-rows">
        <div class="up-row"><span>Sensors online</span><b>${so.online ?? '—'}/${so.total ?? '—'}</b></div>
        <div class="up-row"><span>API</span><b style="color:var(--ok)">Operational</b></div>
        <div class="up-row"><span>Critical alerts</span><b style="color:${(parseInt(kpis.criticalAlerts) || 0) ? 'var(--err)' : 'var(--ok)'}">${parseInt(kpis.criticalAlerts) || 0}</b></div>
        <div class="up-row"><span>Pending inspections</span><b>${parseInt(kpis.pendingInspections) || 0}</b></div>
      </div>`;
  }

  function formatMoney(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000)    return (n / 1000).toFixed(0) + 'K';
    return Number(n).toLocaleString();
  }

  return { render, toggleLayer };

})();
