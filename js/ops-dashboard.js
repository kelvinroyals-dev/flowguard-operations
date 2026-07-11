// ============================================
// DASHBOARD MODULE — Light theme, Leaflet map
// ============================================

const OpsDashboard = (function () {
  let map = null;
  let layers = {};

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
    container.innerHTML = `
      <style>
        .dash-wrap {
          display: grid;
          grid-template-columns: 1fr 288px;
          gap: 18px;
          height: calc(100vh - var(--th) - 56px);
          min-height: 500px;
        }

        /* ── Map ── */
        .map-panel {
          position: relative;
          border-radius: var(--rl, 16px);
          overflow: hidden;
          border: 1px solid var(--border, #dae6ef);
          box-shadow: var(--sh-sm, 0 2px 8px rgba(10,31,46,.07));
          background: #f8fafc;
        }

        #fg-map {
          width: 100%; height: 100%;
        }

        /* Override Leaflet controls for light theme */
        .map-panel .leaflet-control-zoom {
          border: none !important;
          box-shadow: var(--sh-md, 0 4px 20px rgba(10,31,46,.09)) !important;
        }

        .map-panel .leaflet-control-zoom a {
          width: 32px !important; height: 32px !important;
          line-height: 32px !important;
          background: var(--surface) !important;
          color: var(--ink, #0a1f2e) !important;
          border: 1px solid var(--border, #dae6ef) !important;
          font-size: 16px !important;
          font-weight: 300 !important;
          transition: all .18s !important;
        }

        .map-panel .leaflet-control-zoom a:first-child {
          border-radius: 8px 8px 0 0 !important;
        }

        .map-panel .leaflet-control-zoom a:last-child {
          border-radius: 0 0 8px 8px !important;
        }

        .map-panel .leaflet-control-zoom a:hover {
          background: var(--navy, #0a2a3d) !important;
          color: white !important;
          border-color: var(--navy, #0a2a3d) !important;
        }

        .map-panel .leaflet-control-attribution {
          background: var(--overlay) !important;
          color: var(--ink-3, #6b8fa3) !important;
          font-size: 9px !important;
          border-radius: 6px 0 0 0 !important;
          backdrop-filter: blur(4px) !important;
        }

        .map-panel .leaflet-control-attribution a {
          color: var(--ink-3, #6b8fa3) !important;
        }

        .map-panel .leaflet-popup-content-wrapper {
          background: var(--surface) !important;
          color: var(--ink, #0a1f2e) !important;
          border: 1px solid var(--border, #dae6ef) !important;
          border-radius: 12px !important;
          box-shadow: var(--sh-lg, 0 20px 60px rgba(10,31,46,.12)) !important;
          padding: 0 !important;
        }

        .map-panel .leaflet-popup-content {
          margin: 14px 16px !important;
          font-family: var(--ff-b, 'Figtree', sans-serif) !important;
          font-size: 12px !important;
          line-height: 1.5 !important;
          color: var(--ink-2, #2d5068) !important;
        }

        .map-panel .leaflet-popup-tip {
          background: var(--surface) !important;
        }

        .map-panel .leaflet-popup-close-button {
          color: var(--ink-3, #6b8fa3) !important;
          font-size: 18px !important;
          top: 8px !important; right: 10px !important;
        }

        /* ── Map overlay elements ── */
        .map-legend {
          position: absolute;
          bottom: 20px; left: 14px;
          z-index: 1000;
          background: var(--overlay);
          backdrop-filter: blur(8px);
          border: 1px solid var(--border, #dae6ef);
          border-radius: 12px;
          padding: 12px 14px;
          box-shadow: var(--sh-md, 0 4px 20px rgba(10,31,46,.09));
          min-width: 170px;
        }

        .legend-title {
          font-size: .6rem; font-weight: 700;
          letter-spacing: 2px; text-transform: uppercase;
          color: var(--ink-3, #6b8fa3); margin-bottom: 9px;
        }

        .legend-item {
          display: flex; align-items: center; gap: 8px;
          padding: 3px 0; cursor: pointer;
          transition: opacity .18s;
        }

        .legend-item.off { opacity: .3; }

        .legend-dot {
          width: 9px; height: 9px; border-radius: 50%;
          flex-shrink: 0;
          border: 1.5px solid rgba(0,0,0,.08);
        }

        .legend-label {
          font-size: .75rem; color: var(--ink-2, #2d5068);
          font-family: var(--ff-b, 'Figtree', sans-serif);
        }

        .map-stats-row {
          position: absolute;
          top: 14px; right: 14px;
          z-index: 1000;
          display: flex; gap: 6px;
        }

        .map-stat-chip {
          background: var(--overlay);
          backdrop-filter: blur(8px);
          border: 1px solid var(--border, #dae6ef);
          border-radius: 8px;
          padding: 7px 12px;
          text-align: center;
          box-shadow: var(--sh-sm, 0 2px 8px rgba(10,31,46,.07));
        }

        .map-stat-chip .val {
          font-family: var(--ff-d, 'Playfair Display', serif);
          font-size: 1.1rem; font-weight: 800;
          color: var(--ink, #0a1f2e); line-height: 1;
          display: block;
        }

        .map-stat-chip .val.red   { color: var(--err, #dc2626); }
        .map-stat-chip .val.blue  { color: var(--blue, #16a8d3); }
        .map-stat-chip .val.purple{ color: #7c3aed; }

        .map-stat-chip .lbl {
          font-size: .57rem; font-weight: 700;
          letter-spacing: 1.2px; text-transform: uppercase;
          color: var(--ink-3, #6b8fa3); margin-top: 2px;
          display: block;
        }

        /* ── Side panel ── */
        .side-panel {
          display: flex; flex-direction: column;
          gap: 12px; overflow-y: auto;
        }

        .side-panel::-webkit-scrollbar { width: 3px; }
        .side-panel::-webkit-scrollbar-thumb { background: var(--border, #dae6ef); border-radius: 2px; }

        /* KPI cards */
        .kpi-card {
          background: var(--surface, #fff);
          border: 1px solid var(--border, #dae6ef);
          border-radius: var(--r, 10px);
          padding: 16px 18px;
          position: relative; overflow: hidden;
          box-shadow: var(--sh-xs, 0 1px 2px rgba(10,31,46,.06));
          transition: all .2s;
        }

        .kpi-card:hover {
          transform: translateY(-2px);
          box-shadow: var(--sh-md, 0 4px 20px rgba(10,31,46,.09));
        }

        /* Accent bottom bar */
        .kpi-card::after {
          content: '';
          position: absolute; bottom: 0; left: 0; right: 0;
          height: 2.5px;
        }

        .kpi-card.kpi-blue::after   { background: linear-gradient(90deg, var(--navy, #0a2a3d), var(--blue, #16a8d3)); }
        .kpi-card.kpi-red::after    { background: var(--err, #dc2626); }
        .kpi-card.kpi-green::after  { background: var(--ok, #0a8a6a); }
        .kpi-card.kpi-amber::after  { background: var(--amber, #f5a623); }
        .kpi-card.kpi-purple::after { background: #7c3aed; }

        .kpi-top {
          display: flex; align-items: flex-start;
          justify-content: space-between; margin-bottom: 8px;
        }

        .kpi-label {
          font-size: .62rem; font-weight: 700;
          letter-spacing: 1.5px; text-transform: uppercase;
          color: var(--ink-3, #6b8fa3); margin-bottom: 5px;
        }

        .kpi-val {
          font-family: var(--ff-d, 'Playfair Display', serif);
          font-size: 1.8rem; font-weight: 900;
          color: var(--ink, #0a1f2e);
          letter-spacing: -.03em; line-height: 1;
        }

        .kpi-val.red    { color: var(--err, #dc2626); }
        .kpi-val.green  { color: var(--ok, #0a8a6a); }
        .kpi-val.blue   { color: var(--blue, #16a8d3); }
        .kpi-val.amber  { color: var(--amber, #f5a623); }
        .kpi-val.purple { color: #7c3aed; }

        .kpi-sub {
          font-size: .72rem; color: var(--ink-3, #6b8fa3);
          margin-top: 3px;
        }

        .kpi-sub.red    { color: var(--err, #dc2626); font-weight: 600; }
        .kpi-sub.green  { color: var(--ok, #0a8a6a); }

        .kpi-icon {
          width: 34px; height: 34px;
          border-radius: 9px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }

        /* Pipeline card */
        .pipeline-card {
          background: var(--surface, #fff);
          border: 1px solid var(--border, #dae6ef);
          border-radius: var(--r, 10px);
          overflow: hidden;
          box-shadow: var(--sh-xs, 0 1px 2px rgba(10,31,46,.06));
        }

        .pipeline-head {
          padding: 12px 16px;
          border-bottom: 1px solid var(--border, #dae6ef);
          font-size: .62rem; font-weight: 700;
          letter-spacing: 1.5px; text-transform: uppercase;
          color: var(--ink-3, #6b8fa3);
        }

        .pipeline-row {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 16px;
          border-bottom: 1px solid var(--border, #dae6ef);
          transition: background .12s;
        }

        .pipeline-row:last-child { border-bottom: none; }
        .pipeline-row:hover { background: var(--surface-3, #eef4f8); }

        .pipeline-dot {
          width: 8px; height: 8px;
          border-radius: 50%; flex-shrink: 0;
        }

        .pipeline-name {
          flex: 1; font-size: .8rem;
          color: var(--ink-2, #2d5068);
        }

        .pipeline-count {
          font-family: var(--ff-d, 'Playfair Display', serif);
          font-size: .95rem; font-weight: 800;
          color: var(--ink, #0a1f2e);
          min-width: 20px; text-align: right;
        }

        /* Quick actions */
        .quick-actions {
          background: var(--surface, #fff);
          border: 1px solid var(--border, #dae6ef);
          border-radius: var(--r, 10px);
          overflow: hidden;
          box-shadow: var(--sh-xs, 0 1px 2px rgba(10,31,46,.06));
        }

        .qa-head {
          padding: 12px 16px;
          border-bottom: 1px solid var(--border, #dae6ef);
          font-size: .62rem; font-weight: 700;
          letter-spacing: 1.5px; text-transform: uppercase;
          color: var(--ink-3, #6b8fa3);
        }

        .qa-btn {
          width: 100%; padding: 10px 16px;
          background: transparent; border: none;
          border-bottom: 1px solid var(--border, #dae6ef);
          display: flex; align-items: center; gap: 10px;
          cursor: pointer; text-align: left;
          color: var(--ink-2, #2d5068);
          font-family: var(--ff-b, 'Figtree', sans-serif);
          font-size: .81rem; font-weight: 500;
          transition: all .15s;
        }

        .qa-btn:last-child { border-bottom: none; }

        .qa-btn:hover {
          background: var(--surface-3, #eef4f8);
          color: var(--ink, #0a1f2e);
          padding-left: 20px;
        }

        .qa-btn svg { flex-shrink: 0; color: var(--ink-3, #6b8fa3); }
        .qa-btn:hover svg { color: var(--blue, #16a8d3); }

        /* Popup styles */
        .fg-popup-title {
          font-family: var(--ff-d, 'Playfair Display', serif);
          font-size: .88rem; font-weight: 700;
          color: var(--ink, #0a1f2e); margin-bottom: 4px;
        }

        .fg-popup-badge {
          display: inline-block;
          padding: 2px 8px; border-radius: 12px;
          font-size: .65rem; font-weight: 700;
          letter-spacing: .5px; text-transform: uppercase;
          margin-bottom: 8px;
        }

        .fg-popup-row {
          font-size: .75rem; color: var(--ink-2, #2d5068);
          line-height: 1.7; margin-bottom: 1px;
        }

        .fg-popup-row span { color: var(--ink-3, #6b8fa3); }

        @media (max-width: 1100px) {
          .dash-wrap { grid-template-columns: 1fr; grid-template-rows: 420px auto; }
          .side-panel { flex-direction: row; flex-wrap: wrap; overflow-y: visible; }
          .kpi-card { flex: 1; min-width: 140px; }
          .pipeline-card, .quick-actions { width: 100%; }
        }
      </style>

      <div class="dash-wrap">
        <div class="map-panel">
          <div id="fg-map"></div>
          <div class="map-legend" id="map-legend"></div>
          <div class="map-stats-row" id="map-stats"></div>
        </div>
        <div class="side-panel" id="dash-side"></div>
      </div>
    `;

    renderSidePanel({});
    await loadLeaflet();
    initMap();
    loadAllData();
  }

  function initMap() {
    map = L.map('fg-map', {
      center: [6.5244, 3.3792],
      zoom: 11,
      zoomControl: true,
      attributionControl: true,
    });

    // ── Light tile layer (Positron) — matches the light shell ──
    L.tileLayer(`https://{s}.basemaps.cartocdn.com/${(window.OpsTheme && OpsTheme.get() === 'light') ? 'light_all' : 'dark_all'}/{z}/{x}/{y}{r}.png`, {
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
      { key: 'areas_submitted',  color: '#f5a623', label: 'Pending Areas' },
      { key: 'areas_inspection', color: '#f97316', label: 'In Inspection' },
      { key: 'areas_active',     color: '#16a8d3', label: 'Active / Deployed' },
      { key: 'sites',            color: '#0a2a3d', label: 'Monitored Sites' },
      { key: 'sensors',          color: '#6b8fa3', label: 'Sensors' },
      { key: 'alerts',           color: '#dc2626', label: 'Active Alerts' },
      { key: 'flood_risk',       color: '#e74c3c', label: 'Inspection Flood Risk' },
      { key: 'hfp_zones',        color: '#7c3aed', label: 'High Flood Probability' },
      { key: 'coverage',         color: 'rgba(22,168,211,.2)', label: 'Coverage Area' },
    ];

    document.getElementById('map-legend').innerHTML = `
      <div class="legend-title">Map Layers</div>
      ${items.map(i => `
        <div class="legend-item ${map.hasLayer(layers[i.key]) ? '' : 'off'}"
          onclick="OpsDashboard.toggleLayer('${i.key}', this)">
          <div class="legend-dot" style="background:${i.color};"></div>
          <div class="legend-label">${i.label}</div>
        </div>
      `).join('')}
    `;
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
      const [mapRes, kpiRes] = await Promise.all([
        OpsModal.apiGet('/analytics/map-data'),
        OpsModal.apiGet('/analytics/kpis'),
      ]);

      const md   = mapRes.data || {};
      const kpis = kpiRes.data || {};

      plotAreas(md.areas || []);
      plotSites(md.sites || []);
      plotSensors(md.sensors || []);
      plotAlerts(md.alerts || []);
      plotFloodRisk(md.flood_risk || []);
      renderMapStats(md, kpis);
      renderSidePanel(kpis, md);
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
    const m = { submitted:'#f5a623', inspection_scheduled:'#f97316', inspection_ongoing:'#f97316', report_ready:'#e0a800', active:'#16a8d3' };
    return m[s] || '#6b8fa3';
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
        ${a.urgency_level ? `<div class="fg-popup-row"><span>Urgency</span>&nbsp;&nbsp;<strong style="color:${{ critical:'#dc2626',high:'#f97316',medium:'#f5a623',low:'#16a8d3' }[a.urgency_level]||'#6b8fa3'};">${a.urgency_level}</strong></div>` : ''}
      </div>`;
  }

  function sitePopup(s) {
    const online = parseInt(s.sensors_online) || 0;
    const total  = parseInt(s.sensor_count) || 0;
    const alerts = parseInt(s.active_alerts) || 0;
    const pct    = total > 0 ? Math.round((online / total) * 100) : 0;
    const hc     = pct >= 90 ? '#0a8a6a' : pct >= 70 ? '#f5a623' : '#dc2626';
    return `
      <div style="min-width:220px;">
        <div class="fg-popup-title">⚡ ${s.name}</div>
        <div class="fg-popup-badge" style="background:#16a8d318;color:#16a8d3;border:1px solid #16a8d340;">${s.tier} tier · ${s.status}</div>
        <div class="fg-popup-row"><span>Location</span>&nbsp;&nbsp;${s.location || '—'}</div>
        <div class="fg-popup-row"><span>Coverage</span>&nbsp;&nbsp;${s.coverage_km || 0} km</div>
        <div class="fg-popup-row"><span>MRR</span>&nbsp;&nbsp;₦${Number(s.mrr || 0).toLocaleString()}</div>
        <div class="fg-popup-row"><span>Sensors</span>&nbsp;&nbsp;<strong style="color:${hc};">${online}/${total}</strong> online (${pct}%)</div>
        <div class="fg-popup-row" style="color:${alerts>0?'#dc2626':'#0a8a6a'};font-weight:600;">${alerts > 0 ? `⚠ ${alerts} active alert${alerts>1?'s':''}` : '✓ No active alerts'}</div>
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

      if (s === 'submitted')                                      { layer = layers.areas_submitted;  color = '#f5a623'; size = 14; }
      else if (['inspection_scheduled','inspection_ongoing'].includes(s)) { layer = layers.areas_inspection; color = '#f97316'; size = 14; }
      else if (s === 'active')                                    { layer = layers.areas_active;     color = '#16a8d3'; size = 16; }
      else if (['report_ready','quote_sent','payment_pending','payment_completed','deployment_scheduled'].includes(s)) { layer = layers.areas_inspection; color = '#e0a800'; size = 12; }
      else                                                        { layer = layers.areas_submitted;  color = '#6b8fa3'; size = 10; }

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
        radius, color: '#16a8d3', weight: 1, opacity: .35,
        fillColor: '#16a8d3', fillOpacity: .06, dashArray: '5 4',
      }));

      // Site marker — distinctive square icon
      const icon = L.divIcon({
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        html: `<div style="width:28px;height:28px;border-radius:7px;background:#0a2a3d;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(10,42,61,.35);">
          <svg width="13" height="13" fill="none" stroke="#16a8d3" stroke-width="2.5" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
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
      const c = s.status === 'active' ? '#16a8d3' : s.status === 'maintenance' ? '#f5a623' : '#dc2626';
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
      const color  = isCrit ? '#dc2626' : a.severity === 'high' ? '#f97316' : '#f5a623';
      const size   = isCrit ? 18 : 14;
      const marker = L.marker([lat, lng], { icon: makeIcon(color, size, true) });
      marker.bindPopup(`
        <div style="min-width:200px;">
          <div class="fg-popup-title" style="color:${color};">⚠ ${a.alert_type || 'Alert'}</div>
          <div class="fg-popup-badge" style="background:${color}18;color:${color};border:1px solid ${color}40;">${a.severity}</div>
          ${a.description   ? `<div class="fg-popup-row">${a.description}</div>` : ''}
          ${a.sensor_name   ? `<div class="fg-popup-row"><span>Sensor</span>&nbsp;&nbsp;${a.sensor_name}</div>` : ''}
          ${a.site_name     ? `<div class="fg-popup-row"><span>Site</span>&nbsp;&nbsp;${a.site_name}</div>` : ''}
          ${a.time_to_overflow_min ? `<div class="fg-popup-row" style="color:#dc2626;font-weight:600;">Overflow in: ${a.time_to_overflow_min} min</div>` : ''}
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
      const colors  = { critical:'#dc2626', high:'#f97316', moderate:'#f5a623', low:'#16a8d3' };
      const radii   = { critical:800, high:600, moderate:400, low:200 };
      const color   = colors[r.flood_risk_level] || '#f5a623';
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
          <div style="margin-top:8px;padding-top:6px;border-top:1px solid #dae6ef;font-size:.68rem;color:#6b8fa3;">
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

    document.getElementById('map-stats').innerHTML = `
      <div class="map-stat-chip"><span class="val blue">${activeSites}</span><span class="lbl">Sites</span></div>
      <div class="map-stat-chip"><span class="val ${alertCount > 0 ? 'red' : ''}">${alertCount}</span><span class="lbl">Alerts</span></div>
      <div class="map-stat-chip"><span class="val">${sensorCount}</span><span class="lbl">Sensors</span></div>
      <div class="map-stat-chip"><span class="val">${submitted}</span><span class="lbl">Pending</span></div>
      <div class="map-stat-chip"><span class="val purple">${HFP_ZONES.length}</span><span class="lbl">HFP Zones</span></div>
    `;
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
  function renderSidePanel(kpis, md) {
    const areas = md?.areas || [];
    const pipeline = {
      submitted:   areas.filter(a => a.status === 'submitted').length,
      inspection:  areas.filter(a => ['inspection_scheduled','inspection_ongoing'].includes(a.status)).length,
      report:      areas.filter(a => a.status === 'report_ready').length,
      billing:     areas.filter(a => ['quote_sent','payment_pending','payment_completed','deployment_scheduled'].includes(a.status)).length,
      active:      areas.filter(a => a.status === 'active').length,
    };

    const critAlerts    = parseInt(kpis.criticalAlerts) || 0;
    const activeAlerts  = kpis.activeAlerts || 0;
    const sensorsOnline = kpis.sensorsOnline?.online || 0;
    const sensorsTotal  = kpis.sensorsOnline?.total  || 0;
    const uptime        = kpis.networkUptime || 0;
    const mrr           = kpis.mrr || 0;
    const pendingInsp   = parseInt(kpis.pendingInspections) || 0;

    document.getElementById('dash-side').innerHTML = `

      <!-- Active Alerts -->
      <div class="kpi-card ${critAlerts > 0 ? 'kpi-red' : 'kpi-blue'}">
        <div class="kpi-top">
          <div>
            <div class="kpi-label">Active Alerts</div>
            <div class="kpi-val ${critAlerts > 0 ? 'red' : ''}">${activeAlerts}</div>
            ${critAlerts > 0
              ? `<div class="kpi-sub red">${critAlerts} critical</div>`
              : `<div class="kpi-sub green">All clear</div>`}
          </div>
          <div class="kpi-icon" style="background:${critAlerts > 0 ? 'var(--eb)' : 'rgba(22,168,211,.08)'};">
            <svg width="17" height="17" fill="none" stroke="${critAlerts > 0 ? 'var(--err)' : 'var(--blue)'}" stroke-width="2" viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
          </div>
        </div>
      </div>

      <!-- Network Health -->
      <div class="kpi-card kpi-green">
        <div class="kpi-top">
          <div>
            <div class="kpi-label">Network Health</div>
            <div class="kpi-val">${uptime || '—'}${uptime ? '%' : ''}</div>
            <div class="kpi-sub">${sensorsOnline}/${sensorsTotal} sensors online</div>
          </div>
          <div class="kpi-icon" style="background:var(--ok-bg);">
            <svg width="17" height="17" fill="none" stroke="var(--ok)" stroke-width="2" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          </div>
        </div>
      </div>

      <!-- Monthly Revenue -->
      <div class="kpi-card kpi-blue">
        <div class="kpi-top">
          <div>
            <div class="kpi-label">Monthly Revenue</div>
            <div class="kpi-val blue">₦${formatMoney(mrr)}</div>
            <div class="kpi-sub">${kpis.activeSites || 0} active sites</div>
          </div>
          <div class="kpi-icon" style="background:rgba(22,168,211,.08);">
            <svg width="17" height="17" fill="none" stroke="var(--blue)" stroke-width="2" viewBox="0 0 24 24"><path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1"/></svg>
          </div>
        </div>
      </div>

      <!-- Inspection Pipeline -->
      <div class="pipeline-card">
        <div class="pipeline-head">Inspection Pipeline</div>
        <div class="pipeline-row">
          <div class="pipeline-dot" style="background:#f5a623;"></div>
          <div class="pipeline-name">Awaiting Review</div>
          <div class="pipeline-count">${pipeline.submitted}</div>
        </div>
        <div class="pipeline-row">
          <div class="pipeline-dot" style="background:#f97316;"></div>
          <div class="pipeline-name">In Inspection</div>
          <div class="pipeline-count">${pipeline.inspection}</div>
        </div>
        <div class="pipeline-row">
          <div class="pipeline-dot" style="background:#e0a800;"></div>
          <div class="pipeline-name">Report Ready</div>
          <div class="pipeline-count">${pipeline.report}</div>
        </div>
        <div class="pipeline-row">
          <div class="pipeline-dot" style="background:#3b82f6;"></div>
          <div class="pipeline-name">Quote / Payment</div>
          <div class="pipeline-count">${pipeline.billing}</div>
        </div>
        <div class="pipeline-row">
          <div class="pipeline-dot" style="background:#16a8d3;"></div>
          <div class="pipeline-name">Active / Deployed</div>
          <div class="pipeline-count">${pipeline.active}</div>
        </div>
      </div>

      <!-- HFP Summary -->
      <div class="kpi-card kpi-purple">
        <div class="kpi-top">
          <div>
            <div class="kpi-label">Flood Probability Zones</div>
            <div class="kpi-val purple">${HFP_ZONES.length}</div>
            <div class="kpi-sub">${HFP_ZONES.filter(z=>z.risk==='critical').length} critical · ${HFP_ZONES.filter(z=>z.risk==='high').length} high · ${HFP_ZONES.filter(z=>z.risk==='moderate').length} moderate</div>
          </div>
          <div class="kpi-icon" style="background:#7c3aed14;">
            <svg width="17" height="17" fill="none" stroke="#7c3aed" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/></svg>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="quick-actions">
        <div class="qa-head">Quick Actions</div>
        <button class="qa-btn" onclick="switchTab('alerts')">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/></svg>
          View Live Alerts
        </button>
        <button class="qa-btn" onclick="switchTab('properties')">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4"/></svg>
          Manage Areas
        </button>
        <button class="qa-btn" onclick="switchTab('teams')">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0112 0v2"/></svg>
          Dispatch Team
        </button>
        <button class="qa-btn" onclick="switchTab('clients')">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          View Clients
        </button>
      </div>
    `;
  }

  function formatMoney(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000)    return (n / 1000).toFixed(0) + 'K';
    return Number(n).toLocaleString();
  }

  return { render, toggleLayer };

})();
