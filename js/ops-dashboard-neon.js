// ============================================================
// NEON CENTER DASHBOARD — live data wiring
// ------------------------------------------------------------
// Binds real API data into the exact Neon Center mockup markup
// (dashboard.html). The design is never touched here: we only
// (a) init a Leaflet map inside the #fg-map container that
// replaced the mockup's illustrative SVG, keeping the inspector
// widget, and (b) populate existing elements selected by their
// mockup classes / panel headings.
//
// Depends on: config.js (CONFIG), auth.js (Auth), ops-modal.js
// (OpsModal.apiGet). Loaded after all three in dashboard.html.
// ============================================================

(function () {
  'use strict';

  // Auth guard — same contract as index.html's shell.
  if (typeof Auth === 'undefined' || !Auth.isAuthenticated()) {
    window.location.href = 'login.html';
    return;
  }

  // ── palette (mirrors dashboard.html :root tokens) ──
  const C = {
    danger: '#d9463c', amber: '#e08e12', warnAmber: '#e0a012',
    green: '#1f9d5b', cyan: '#16a8d3', teal: '#0d7fa0', off: '#7d8fa3',
  };
  // OpsModal.apiGet() already runs deepEscape() over every response string,
  // so values are HTML-safe when inserted via innerHTML (same contract the
  // other ops-*.js modules rely on). esc() here is only a null-guard —
  // re-escaping would double-encode entities (e.g. "R&D" → "R&amp;amp;D").
  const esc = v => String(v == null ? '' : v);

  function rel(ts) {
    if (!ts) return '—';
    try {
      const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
      if (m < 1) return 'now';
      if (m < 60) return m + 'm';
      if (m < 1440) return Math.floor(m / 60) + 'h';
      return Math.floor(m / 1440) + 'd';
    } catch (_) { return '—'; }
  }

  const sevColor = s => s === 'critical' ? C.danger : s === 'high' ? C.amber
    : s === 'moderate' ? C.warnAmber : C.off;

  // Find a rail-card / panel by its heading text.
  function cardByHeading(txt) {
    return [...document.querySelectorAll('.rail-card')].find(c => {
      const h = c.querySelector('.rail-head h3');
      return h && h.textContent.trim() === txt;
    });
  }

  // ════════════════════════════════════════════════════════════
  // LEAFLET MAP (replaces the mockup's decorative SVG; inspector
  // widget and layer pills are preserved from the design)
  // ════════════════════════════════════════════════════════════
  let map = null, layers = {}, baseTiles = null;

  function themeNow() {
    const r = document.querySelector('[data-theme-root]');
    return (r && r.getAttribute('data-theme')) === 'dark' ? 'dark' : 'light';
  }
  function tileUrl() {
    return `https://{s}.basemaps.cartocdn.com/${themeNow() === 'dark' ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`;
  }

  function dot(color, size, pulse) {
    const s = size || 12;
    return L.divIcon({
      className: '', iconSize: [s, s], iconAnchor: [s / 2, s / 2],
      html: `<div style="position:relative;width:${s}px;height:${s}px;">
        <div style="width:${s}px;height:${s}px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,.8);box-shadow:0 1px 4px rgba(10,42,61,.3),0 0 0 1px ${color}40;"></div>
        ${pulse ? `<div style="position:absolute;top:50%;left:50%;width:${s}px;height:${s}px;margin:-${s / 2}px;border-radius:50%;border:2px solid ${color};animation:neonPulse 1.6s ease-out infinite;"></div>` : ''}
      </div>`,
    });
  }

  function initMap() {
    const host = document.getElementById('fg-map');
    if (!host || !window.L) return;
    // pulse keyframes (once)
    if (!document.getElementById('neon-pulse-kf')) {
      const st = document.createElement('style');
      st.id = 'neon-pulse-kf';
      st.textContent = '@keyframes neonPulse{0%{transform:scale(1);opacity:.7;}100%{transform:scale(2.4);opacity:0;}}';
      document.head.appendChild(st);
    }
    map = L.map('fg-map', { center: [6.5244, 3.3792], zoom: 11, zoomControl: false, attributionControl: true });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    baseTiles = L.tileLayer(tileUrl(), {
      subdomains: 'abcd', maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org">OSM</a> &copy; <a href="https://carto.com">CARTO</a>',
    }).addTo(map);
    layers = {
      sensors: L.layerGroup().addTo(map),
      areas:   L.layerGroup().addTo(map),
      sites:   L.layerGroup().addTo(map),
      alerts:  L.layerGroup().addTo(map),
    };
    wireLayerPills();
    // keep tiles honest against container resize + theme toggle
    if (window.ResizeObserver) new ResizeObserver(() => { try { map.invalidateSize(); } catch (_) {} }).observe(host);
    const root = document.querySelector('[data-theme-root]');
    if (root && window.MutationObserver) {
      new MutationObserver(() => { if (baseTiles) baseTiles.setUrl(tileUrl()); })
        .observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    }
  }

  // Map the four mockup pills to real layers.
  function wireLayerPills() {
    const pills = [...document.querySelectorAll('.layer-pills .layer-pill')];
    const keys = ['sensors', 'areas', 'sites', 'alerts']; // Drainage, Estates, Crews, Incidents
    pills.forEach((p, i) => {
      const key = keys[i];
      if (!key) return;
      p.style.cursor = 'pointer';
      p.addEventListener('click', () => {
        if (!layers[key]) return;
        if (map.hasLayer(layers[key])) { map.removeLayer(layers[key]); p.classList.remove('active'); }
        else { layers[key].addTo(map); p.classList.add('active'); }
      });
    });
  }

  function plot(md) {
    if (!map) return;
    Object.values(layers).forEach(l => l.clearLayers());

    (md.areas || []).forEach(a => {
      const lat = parseFloat(a.latitude), lng = parseFloat(a.longitude);
      if (!lat || !lng) return;
      const m = L.marker([lat, lng], { icon: dot(C.teal, 12, a.status === 'submitted') });
      m.bindPopup(popup(a.property_name || 'Area', [(a.status || '').replace(/_/g, ' '), a.city, a.client_name]));
      layers.areas.addLayer(m);
    });

    (md.sites || []).forEach(s => {
      const lat = parseFloat(s.latitude), lng = parseFloat(s.longitude);
      if (!lat || !lng) return;
      const m = L.marker([lat, lng], { icon: dot(C.cyan, 14, false) });
      const online = parseInt(s.sensors_online) || 0, total = parseInt(s.sensor_count) || 0;
      m.bindPopup(popup('⚡ ' + (s.name || 'Site'), [s.location, `${online}/${total} sensors online`, s.tier ? s.tier + ' tier' : '']));
      layers.sites.addLayer(m);
    });

    (md.sensors || []).forEach(s => {
      const lat = parseFloat(s.latitude), lng = parseFloat(s.longitude);
      if (!lat || !lng) return;
      const col = s.status === 'active' ? C.green : s.status === 'maintenance' ? C.amber : C.danger;
      const m = L.marker([lat, lng], { icon: dot(col, 10, false) });
      m.on('click', () => setInspector(s));
      m.bindPopup(popup(s.name || s.sensor_id || 'Sensor', [s.status, s.site_name, s.zone]));
      layers.sensors.addLayer(m);
    });

    (md.alerts || []).forEach(a => {
      const lat = parseFloat(a.latitude), lng = parseFloat(a.longitude);
      if (!lat || !lng) return;
      const col = sevColor(a.severity);
      const m = L.marker([lat, lng], { icon: dot(col, a.severity === 'critical' ? 16 : 13, true) });
      m.on('click', () => setInspector({
        name: a.sensor_name || a.alert_type, zone: a.site_name, status: 'active',
        flow_rate: null, level: null, battery_percent: null, last_ping: a.created_at,
      }));
      m.bindPopup(popup('⚠ ' + (a.alert_type || 'Alert'), [a.severity, a.description, a.site_name]));
      layers.alerts.addLayer(m);
    });

    // fit
    const pts = [];
    ['areas', 'sites', 'sensors', 'alerts'].forEach(k => (md[k] || []).forEach(i => {
      if (i.latitude && i.longitude) pts.push([parseFloat(i.latitude), parseFloat(i.longitude)]);
    }));
    if (pts.length) { try { map.fitBounds(L.latLngBounds(pts).pad(0.15)); } catch (_) {} }
    setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 80);
  }

  function popup(title, rows) {
    const body = rows.filter(Boolean).map(r => `<div style="font-size:12px;color:var(--text-2);line-height:1.6">${esc(r)}</div>`).join('');
    return `<div style="min-width:170px"><div style="font-weight:700;font-size:13px;color:var(--text-1);margin-bottom:4px">${esc(title)}</div>${body}</div>`;
  }

  // ── Inspector widget (design preserved, values live) ──
  function setInspector(n) {
    const insp = document.querySelector('.inspector');
    if (!insp || !n) return;
    const nameEl = insp.querySelector('.inspector-name');
    const locEl = insp.querySelector('.inspector-loc');
    // values are deepEscape()'d by apiGet → safe to set as innerHTML
    if (nameEl) nameEl.innerHTML = n.name || n.sensor_id || '—';
    if (locEl) locEl.innerHTML = [n.zone || n.site_name, n.city].filter(Boolean).join(' · ') || '—';
    const vals = insp.querySelectorAll('.metric-line .v');
    const inflow = n.flow_rate != null ? Number(n.flow_rate).toFixed(1) : (n.level != null ? Math.round(n.level) + '%' : '—');
    const batt = n.battery_percent != null ? n.battery_percent + '%' : '—';
    if (vals[0]) vals[0].textContent = inflow;
    if (vals[1]) vals[1].textContent = batt;
    if (vals[2]) vals[2].textContent = rel(n.reading_time || n.last_ping) + ' ago';
    const dots = insp.querySelectorAll('.led .dot');
    if (dots[0]) dots[0].style.background = n.status === 'active' ? C.green : C.danger;      // Status
    if (dots[1]) dots[1].style.background = C.cyan;                                            // Network
    if (dots[2]) dots[2].style.background = (n.battery_percent != null && n.battery_percent < 20) ? C.amber : C.green; // Power
  }

  // ════════════════════════════════════════════════════════════
  // PANEL BINDINGS
  // ════════════════════════════════════════════════════════════
  function setStory(idx, valueHTML, subText) {
    const cards = document.querySelectorAll('.story-strip .story-card');
    const card = cards[idx];
    if (!card) return;
    const v = card.querySelector('.story-value');
    const s = card.querySelector('.story-sub');
    if (v && valueHTML != null) v.innerHTML = valueHTML;
    if (s && subText != null) s.textContent = subText;
  }

  function renderKpis(kpis, md, teams, ticks) {
    const am = kpis.assetsMonitored || {};
    const so = kpis.sensorsOnline || {};
    const pct = so.total ? Math.round((so.online / so.total) * 100) : null;
    const alerts = md.alerts || [];
    const openAlerts = alerts.filter(a => !['resolved', 'closed'].includes(a.status || 'active'));
    const crit = openAlerts.filter(a => a.severity === 'critical').length;
    const high = openAlerts.filter(a => a.severity === 'high').length;
    const mod = openAlerts.filter(a => a.severity === 'moderate').length;
    const deployed = (teams || []).filter(t => ['on_site', 'en_route'].includes((t.status || '').toLowerCase())).length;
    const openTickets = (ticks || []).filter(t => !['closed', 'resolved', 'done'].includes((t.status || '').toLowerCase())).length;
    const dim = '<span style="font-size:13px;color:var(--text-3);">';

    setStory(0, `${am.total != null ? am.total : '—'}`, `${am.monitored || 0} actively monitored`);
    setStory(1, `${pct != null ? pct : '—'}${dim}/100</span>`, so.total ? `${so.online} of ${so.total} nodes reporting` : 'No nodes yet');
    setStory(2, `${openTickets}${dim} open</span>`, `${deployed} field team${deployed === 1 ? '' : 's'} en route or on site`);
    setStory(3, `${openAlerts.length}${dim} open</span>`, `${crit} critical · ${high} high · ${mod} moderate`);
  }

  function renderRing(kpis) {
    const card = cardByHeading('Network health');
    if (!card) return;
    const so = kpis.sensorsOnline || {};
    const pct = so.total ? Math.round((so.online / so.total) * 100) : 0;
    const arc = card.querySelector('circle[stroke-linecap="round"]');
    if (arc) {
      const circ = 2 * Math.PI * 27; // r=27 → 169.6
      arc.setAttribute('stroke-dasharray', circ.toFixed(1));
      arc.setAttribute('stroke-dashoffset', (circ * (1 - pct / 100)).toFixed(1));
    }
    const v = card.querySelector('.ring-value');
    const l = card.querySelector('.ring-label');
    if (v) v.textContent = pct + '%';
    if (l) l.textContent = so.total ? `${so.online} of ${so.total} nodes reporting normally across the network` : 'No nodes reporting yet';
  }

  function renderIncidents(alerts) {
    const card = cardByHeading('Incident queue');
    if (!card) return;
    card.querySelectorAll('.incident-row').forEach(n => n.remove());
    const rank = { critical: 0, high: 1, moderate: 2, minor: 3 };
    const open = (alerts || [])
      .filter(a => !['resolved', 'closed'].includes(a.status || 'active'))
      .sort((x, y) => (rank[x.severity] ?? 4) - (rank[y.severity] ?? 4) || new Date(y.created_at) - new Date(x.created_at))
      .slice(0, 3);
    if (!open.length) {
      card.insertAdjacentHTML('beforeend', '<div class="incident-meta" style="padding:6px 0">No open incidents — network is clear.</div>');
      return;
    }
    const html = open.map(a => {
      const c = sevColor(a.severity);
      const meta = [a.sensor_name || a.site_name, rel(a.created_at) + ' ago'].filter(Boolean).join(' · ');
      return `<div class="incident-row">
        <span class="isev" style="background:${c};"></span>
        <div>
          <div class="incident-title">${esc(a.alert_type || 'Alert')} &middot; ${esc(a.severity || '')}</div>
          <div class="incident-meta">${esc(meta)}</div>
        </div>
      </div>`;
    }).join('');
    card.insertAdjacentHTML('beforeend', html);
  }

  function renderCrew(teams) {
    const card = cardByHeading('Field operations');
    if (!card) return;
    card.querySelectorAll('.crew-row').forEach(n => n.remove());
    if (!teams || !teams.length) {
      card.insertAdjacentHTML('beforeend', '<div class="crew-site" style="padding:6px 0">No field teams registered yet.</div>');
      return;
    }
    const st = { on_site: ['onsite', 'On site'], en_route: ['enroute', 'En route'], idle: ['idle', 'Idle'] };
    const html = teams.slice(0, 4).map(t => {
      const name = t.team_name || t.name || 'Team';
      const initials = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
      const [cls, lbl] = st[(t.status || 'idle').toLowerCase()] || ['idle', 'Idle'];
      const site = t.current_zone || t.zone || t.current_location || 'Unassigned';
      return `<div class="crew-row">
        <div class="crew-avatar">${esc(initials || 'T')}</div>
        <div><div class="crew-name">${esc(name)}</div><div class="crew-site">${esc(site)}</div></div>
        <span class="crew-chip ${cls}">${lbl}</span>
      </div>`;
    }).join('');
    card.insertAdjacentHTML('beforeend', html);
  }

  function renderDeviceFleet(fleet) {
    const stats = document.querySelector('.device-stats');
    if (!stats || !fleet) return;
    const deployed = fleet.length;
    const isBio = n => /bio|dispenser|enzyme/i.test(String(n.model || n.device_type || n.type || ''));
    const bio = fleet.filter(isBio).length;
    const basic = deployed - bio;
    const fw = mode(fleet.map(n => n.firmware || n.firmware_version).filter(Boolean));
    stats.innerHTML =
      line('Deployed', `${deployed} units`) +
      line('Basic', String(basic)) +
      line('Bio&#8209;dispenser', String(bio)) +
      line('Firmware', `<span class="mono">${esc(fw || '—')}</span>`);
    function line(k, v) { return `<div class="device-stat-line"><span class="k">${k}</span><span class="v">${v}</span></div>`; }
  }
  function mode(arr) {
    if (!arr.length) return null;
    const m = {}; let best = arr[0], bestN = 0;
    arr.forEach(v => { m[v] = (m[v] || 0) + 1; if (m[v] > bestN) { bestN = m[v]; best = v; } });
    return best;
  }

  function renderPortfolio(md) {
    const grid = document.querySelector('.portfolio-grid');
    if (!grid) return;
    const grads = [
      'linear-gradient(135deg,var(--teal),var(--cyan))',
      'linear-gradient(135deg,var(--danger),var(--amber))',
      'linear-gradient(135deg,var(--green),var(--teal))',
    ];
    const items = (md.sites && md.sites.length ? md.sites : md.areas || []).slice(0, 3);
    if (!items.length) return;
    grid.innerHTML = items.map((s, i) => {
      const name = s.name || s.property_name || 'Property';
      const loc = s.location || s.city || '—';
      const sensors = s.sensor_count != null ? s.sensor_count : (s.sensors_online != null ? s.sensors_online : '—');
      const tier = s.tier || (s.status === 'active' ? 'A' : null);
      const tierHTML = tier ? `<span class="tier">${esc(tier)}</span>` : `<span class="tier unlinked">No billing linked</span>`;
      return `<div class="glass-soft portfolio-card">
        <div class="portfolio-thumb" style="background:${grads[i % 3]};">${tierHTML}</div>
        <div class="portfolio-name">${esc(name)}</div>
        <div class="portfolio-meta">${esc(loc)} &middot; ${esc(String(sensors))} sensors</div>
      </div>`;
    }).join('');
  }

  function renderSyncPill(fleet) {
    const pill = document.querySelector('.sync-pill');
    if (!pill) return;
    const times = (fleet || []).map(n => n.reading_time || n.last_ping).filter(Boolean).map(t => new Date(t).getTime());
    const latest = times.length ? Math.max(...times) : null;
    pill.innerHTML = `<span class="heartbeat"></span>Telemetry feed &middot; last ping ${latest ? rel(latest) : '—'} ago`;
  }

  function setAvatar() {
    const u = (Auth.getUser && Auth.getUser()) || {};
    const nm = u.fullName || u.full_name || u.name || '';
    const initials = nm.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    const av = document.querySelector('.avatar');
    if (av && initials) av.textContent = initials;
  }

  // ════════════════════════════════════════════════════════════
  // LOAD
  // ════════════════════════════════════════════════════════════
  async function load() {
    if (!Auth.isAuthenticated()) return;
    try {
      const [mapRes, kpiRes, teamRes, tickRes, fleetRes] = await Promise.all([
        OpsModal.apiGet('/analytics/map-data'),
        OpsModal.apiGet('/analytics/kpis'),
        OpsModal.apiGet('/teams').catch(() => ({ data: [] })),
        OpsModal.apiGet('/tickets?limit=8').catch(() => ({ data: [] })),
        OpsModal.apiGet('/monitoring/sensors/all').catch(() => ({ data: [] })),
      ]);
      const md = mapRes.data || {};
      const kpis = kpiRes.data || {};
      const teams = teamRes.data || [];
      const ticks = tickRes.data || [];
      const fleet = fleetRes.data || [];

      plot(md);
      renderKpis(kpis, md, teams, ticks);
      renderRing(kpis);
      renderIncidents(md.alerts || []);
      renderCrew(teams);
      renderDeviceFleet(fleet);
      renderPortfolio(md);
      renderSyncPill(fleet);

      // default inspector = first open alert's node, else first active sensor
      const firstAlert = (md.alerts || [])[0];
      const firstSensor = (md.sensors || []).find(s => s.status === 'active') || (md.sensors || [])[0] || (fleet || [])[0];
      if (firstSensor) setInspector(firstSensor);
      else if (firstAlert) setInspector({ name: firstAlert.sensor_name, zone: firstAlert.site_name, status: 'active', last_ping: firstAlert.created_at });
    } catch (err) {
      console.error('Neon dashboard load error:', err);
    }
  }

  function boot() {
    setAvatar();
    initMap();
    load();
    setInterval(load, 60000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
