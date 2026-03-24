// ============================================
// DASHBOARD MODULE — NEON THEME
// Leaflet map + KPI sidebar
// ============================================

const OpsDashboard = (function() {
    let map = null;
    let layers = {};

    // Dynamically load Leaflet if not present
    function loadLeaflet() {
        return new Promise((resolve) => {
            if (window.L) return resolve();
            // CSS
            const css = document.createElement('link');
            css.rel = 'stylesheet';
            css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(css);
            // JS
            const js = document.createElement('script');
            js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            js.onload = resolve;
            document.head.appendChild(js);
        });
    }

    async function render(container) {
        container.innerHTML = `
            <style>
                .dash-grid{display:grid;grid-template-columns:1fr 300px;gap:16px;height:calc(100vh - 140px);}
                .map-wrap{position:relative;border-radius:12px;overflow:hidden;border:1px solid var(--panel-edge);background:var(--surface);}
                .map-wrap .leaflet-container{background:var(--surface)!important;}
                .map-wrap .leaflet-control-zoom a{background:var(--panel)!important;color:var(--neon)!important;border-color:var(--panel-edge)!important;}
                .map-wrap .leaflet-control-zoom a:hover{background:var(--panel-hover)!important;}
                .map-wrap .leaflet-control-attribution{background:rgba(4,15,20,0.8)!important;color:var(--text-dim)!important;font-size:9px!important;}
                .map-wrap .leaflet-control-attribution a{color:var(--text-dim)!important;}
                .map-wrap .leaflet-popup-content-wrapper{background:var(--panel);color:var(--text-bright);border:1px solid var(--panel-edge);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.5);}
                .map-wrap .leaflet-popup-tip{background:var(--panel);border:1px solid var(--panel-edge);}
                .map-wrap .leaflet-popup-content{margin:12px 14px;font-family:var(--font-mono);font-size:11px;line-height:1.5;}
                .map-wrap .leaflet-popup-close-button{color:var(--text-dim)!important;font-size:16px!important;padding:6px 8px!important;}
                .map-legend{position:absolute;bottom:28px;left:12px;z-index:1000;background:rgba(7,24,32,0.94);border:1px solid var(--panel-edge);border-radius:10px;padding:12px 14px;backdrop-filter:blur(8px);min-width:180px;}
                .legend-title{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--text-dim);margin-bottom:10px;}
                .legend-item{display:flex;align-items:center;gap:8px;padding:3px 0;cursor:pointer;transition:opacity 0.2s;}
                .legend-item.off{opacity:0.3;}
                .legend-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;border:1.5px solid rgba(255,255,255,0.15);}
                .legend-label{font-size:10px;color:var(--text-mid);letter-spacing:0.3px;}
                .map-stats{position:absolute;top:12px;right:12px;z-index:1000;display:flex;gap:8px;}
                .map-stat{background:rgba(7,24,32,0.92);border:1px solid var(--panel-edge);border-radius:8px;padding:8px 12px;backdrop-filter:blur(8px);text-align:center;}
                .map-stat-val{font-family:var(--font-display);font-size:1.1rem;font-weight:800;color:var(--text-bright);line-height:1;}
                .map-stat-lbl{font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-dim);margin-top:3px;}
                .side-panel{display:flex;flex-direction:column;gap:12px;overflow-y:auto;}
                .side-panel::-webkit-scrollbar{width:3px;}
                .side-panel::-webkit-scrollbar-thumb{background:var(--panel-edge);border-radius:2px;}
                .kpi-card{background:var(--panel);border:1px solid var(--panel-edge);border-radius:10px;padding:14px 16px;position:relative;overflow:hidden;}
                .kpi-card::after{content:'';position:absolute;bottom:0;left:0;right:0;height:2px;opacity:0.5;}
                .kpi-card.neon::after{background:var(--neon);}
                .kpi-card.warn::after{background:var(--s-watch);}
                .kpi-card.crit::after{background:var(--s-critical);}
                .kpi-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;}
                .kpi-label{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--text-dim);}
                .kpi-val{font-family:var(--font-display);font-size:1.6rem;font-weight:800;color:var(--text-bright);letter-spacing:-0.02em;line-height:1;}
                .kpi-sub{font-size:10px;color:var(--text-dim);margin-top:4px;letter-spacing:0.3px;}
                .kpi-icon{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
                .pipeline-row{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(13,42,54,0.4);}
                .pipeline-row:last-child{border:none;}
                .pipeline-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
                .pipeline-name{flex:1;font-size:10px;color:var(--text-mid);}
                .pipeline-count{font-size:12px;font-weight:700;color:var(--text-bright);min-width:20px;text-align:right;}
                .quick-btn{width:100%;padding:9px 14px;background:var(--surface);border:1px solid var(--panel-edge);border-radius:8px;color:var(--text-mid);font-family:var(--font-mono);font-size:10px;letter-spacing:0.5px;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;gap:8px;text-align:left;}
                .quick-btn:hover{border-color:var(--neon-dim);color:var(--neon);background:var(--panel);}
                @keyframes pulse-ring{0%{transform:scale(1);opacity:0.8;}100%{transform:scale(2.5);opacity:0;}}
            </style>

            <div class="dash-grid">
                <div class="map-wrap">
                    <div id="fg-map" style="width:100%;height:100%;"></div>
                    <div class="map-legend" id="map-legend"></div>
                    <div class="map-stats" id="map-stats"></div>
                </div>
                <div class="side-panel" id="dash-side"></div>
            </div>
        `;

        // Render side panel immediately with loading state
        renderSidePanel({});

        await loadLeaflet();
        initMap();
        loadAllData();
    }

    function initMap() {
        // Lagos center
        map = L.map('fg-map', {
            center: [6.5244, 3.3792],
            zoom: 11,
            zoomControl: true,
            attributionControl: true
        });

        // Dark tile layer (CartoDB Dark Matter)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org">OSM</a> &copy; <a href="https://carto.com">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(map);

        // Init layer groups
        layers = {
            areas_submitted: L.layerGroup().addTo(map),
            areas_inspection: L.layerGroup().addTo(map),
            areas_active: L.layerGroup().addTo(map),
            sites: L.layerGroup().addTo(map),
            sensors: L.layerGroup(),  // off by default (too dense)
            alerts: L.layerGroup().addTo(map),
            flood_risk: L.layerGroup().addTo(map),
            hfp_zones: L.layerGroup().addTo(map),
            coverage: L.layerGroup().addTo(map)
        };

        // Plot static HFP zones immediately (no backend needed)
        plotHFPZones();
        renderLegend();
    }

    function renderLegend() {
        const items = [
            { key: 'areas_submitted', color: '#f5a623', label: 'Pending Areas' },
            { key: 'areas_inspection', color: '#f97316', label: 'In Inspection' },
            { key: 'areas_active', color: '#00e5cc', label: 'Active / Deployed' },
            { key: 'sites', color: '#00b4a0', label: 'Monitored Sites' },
            { key: 'sensors', color: '#6db8b0', label: 'Sensors' },
            { key: 'alerts', color: '#ff3b5c', label: 'Active Alerts' },
            { key: 'flood_risk', color: '#e74c3c', label: 'Inspection Flood Risk' },
            { key: 'hfp_zones', color: '#9b59b6', label: 'High Flood Probability' },
            { key: 'coverage', color: 'rgba(0,229,204,0.15)', label: 'Coverage Area' }
        ];

        document.getElementById('map-legend').innerHTML = `
            <div class="legend-title">Map Layers</div>
            ${items.map(i => `
                <div class="legend-item ${map.hasLayer(layers[i.key]) ? '' : 'off'}" onclick="OpsDashboard.toggleLayer('${i.key}', this)">
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
        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            const [mapRes, kpiRes] = await Promise.all([
                fetch('https://api.flowguard.ng/api/v1/analytics/map-data', {
                    headers: { 'Authorization': 'Bearer ' + token }
                }).then(r => r.json()),
                fetch('https://api.flowguard.ng/api/v1/analytics/kpis', {
                    headers: { 'Authorization': 'Bearer ' + token }
                }).then(r => r.json())
            ]);

            const md = mapRes.data || {};
            const kpis = kpiRes.data || {};

            plotAreas(md.areas || []);
            plotSites(md.sites || []);
            plotSensors(md.sensors || []);
            plotAlerts(md.alerts || []);
            plotFloodRisk(md.flood_risk || []);
            renderMapStats(md, kpis);
            renderSidePanel(kpis, md);
            fitBounds(md);
        } catch (err) {
            console.error('Dashboard data load error:', err);
        }
    }

    // ---- MARKERS ----

    function makeIcon(color, size, pulse) {
        const s = size || 12;
        const pulseRing = pulse ? `<div style="position:absolute;top:50%;left:50%;width:${s}px;height:${s}px;margin:-${s/2}px;border-radius:50%;border:2px solid ${color};animation:pulse-ring 1.5s ease-out infinite;"></div>` : '';
        return L.divIcon({
            className: '',
            iconSize: [s, s],
            iconAnchor: [s/2, s/2],
            html: `<div style="position:relative;width:${s}px;height:${s}px;">
                <div style="width:${s}px;height:${s}px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.2);box-shadow:0 0 ${s}px ${color}40;"></div>
                ${pulseRing}
            </div>`
        });
    }

    function plotAreas(areas) {
        layers.areas_submitted.clearLayers();
        layers.areas_inspection.clearLayers();
        layers.areas_active.clearLayers();

        areas.forEach(a => {
            const lat = parseFloat(a.latitude), lng = parseFloat(a.longitude);
            if (!lat || !lng) return;

            let layer, color, size;
            const s = a.status;

            if (s === 'submitted') { layer = layers.areas_submitted; color = '#f5a623'; size = 14; }
            else if (['inspection_scheduled','inspection_ongoing'].includes(s)) { layer = layers.areas_inspection; color = '#f97316'; size = 14; }
            else if (s === 'active') { layer = layers.areas_active; color = '#00e5cc'; size = 16; }
            else if (['report_ready','quote_sent','payment_pending','payment_completed','deployment_scheduled'].includes(s)) { layer = layers.areas_inspection; color = '#e0a800'; size = 12; }
            else { layer = layers.areas_submitted; color = '#3d5a60'; size = 10; }

            const marker = L.marker([lat, lng], { icon: makeIcon(color, size, s === 'submitted') });
            marker.bindPopup(areaPopup(a));
            layer.addLayer(marker);
        });
    }

    function areaPopup(a) {
        const statusLabel = (a.status||'').replace(/_/g,' ');
        const statusColor = {'submitted':'#f5a623','inspection_scheduled':'#f97316','inspection_ongoing':'#f97316','report_ready':'#e0a800','active':'#00e5cc'}[a.status] || '#3d5a60';
        return `
            <div style="min-width:200px;">
                <div style="font-family:var(--font-display);font-size:13px;font-weight:700;color:var(--text-bright);margin-bottom:6px;">${a.property_name||'Unknown Area'}</div>
                <div style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40;margin-bottom:8px;">${statusLabel}</div>
                <div style="font-size:10px;color:var(--text-dim);line-height:1.6;">
                    ${a.property_type ? '<div>Type: '+(a.property_type||'').replace(/_/g,' ')+'</div>' : ''}
                    ${a.city ? '<div>Location: '+a.city+(a.state?', '+a.state:'')+'</div>' : ''}
                    ${a.client_name ? '<div>Client: '+a.client_name+'</div>' : ''}
                    ${a.urgency_level ? '<div>Urgency: <span style="color:'+({'critical':'#ff3b5c','high':'#f97316','medium':'#f5a623','low':'#00e5cc'}[a.urgency_level]||'#6db8b0')+';">'+a.urgency_level+'</span></div>' : ''}
                    ${a.coverage_area ? '<div>Coverage: '+a.coverage_area+'</div>' : ''}
                </div>
            </div>`;
    }

    function plotSites(sites) {
        layers.sites.clearLayers();
        layers.coverage.clearLayers();

        sites.forEach(s => {
            const lat = parseFloat(s.latitude), lng = parseFloat(s.longitude);
            if (!lat || !lng) return;

            // Coverage circle
            const radius = (parseFloat(s.coverage_km) || 2) * 1000;
            const circle = L.circle([lat, lng], {
                radius: radius,
                color: '#00e5cc',
                weight: 1,
                opacity: 0.4,
                fillColor: '#00e5cc',
                fillOpacity: 0.06,
                dashArray: '6 4'
            });
            layers.coverage.addLayer(circle);

            // Site marker (larger, distinctive)
            const icon = L.divIcon({
                className: '',
                iconSize: [28, 28],
                iconAnchor: [14, 14],
                html: `<div style="width:28px;height:28px;border-radius:6px;background:rgba(0,180,160,0.9);border:2px solid #00e5cc;display:flex;align-items:center;justify-content:center;box-shadow:0 0 16px rgba(0,229,204,0.4);">
                    <svg width="14" height="14" fill="none" stroke="#020c10" stroke-width="2.5" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                </div>`
            });

            const marker = L.marker([lat, lng], { icon });
            marker.bindPopup(sitePopup(s));
            layers.sites.addLayer(marker);
        });
    }

    function sitePopup(s) {
        const online = parseInt(s.sensors_online)||0;
        const total = parseInt(s.sensor_count)||0;
        const alerts = parseInt(s.active_alerts)||0;
        const healthPct = total > 0 ? Math.round((online/total)*100) : 0;
        const healthColor = healthPct >= 90 ? '#00e5cc' : healthPct >= 70 ? '#f5a623' : '#ff3b5c';
        return `
            <div style="min-width:220px;">
                <div style="font-family:var(--font-display);font-size:13px;font-weight:700;color:var(--text-bright);margin-bottom:4px;">⚡ ${s.name}</div>
                <div style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;background:rgba(0,229,204,0.15);color:#00e5cc;border:1px solid rgba(0,229,204,0.3);margin-bottom:8px;">${s.tier} tier — ${s.status}</div>
                <div style="font-size:10px;color:var(--text-dim);line-height:1.7;">
                    <div>Location: ${s.location||'—'}</div>
                    <div>Coverage: ${s.coverage_km||0} km</div>
                    <div>MRR: ₦${Number(s.mrr||0).toLocaleString()}</div>
                    <div>Sensors: <span style="color:${healthColor};font-weight:600;">${online}/${total}</span> online (${healthPct}%)</div>
                    ${alerts > 0 ? '<div style="color:#ff3b5c;font-weight:600;">⚠ '+alerts+' active alert'+(alerts>1?'s':'')+'</div>' : '<div style="color:#00e5cc;">✓ No active alerts</div>'}
                    ${s.drainage_capacity ? '<div>Drainage capacity: '+s.drainage_capacity+' L/s</div>' : ''}
                    ${s.elevation ? '<div>Elevation: '+s.elevation+' m</div>' : ''}
                </div>
            </div>`;
    }

    function plotSensors(sensors) {
        layers.sensors.clearLayers();
        sensors.forEach(s => {
            const lat = parseFloat(s.latitude), lng = parseFloat(s.longitude);
            if (!lat || !lng) return;
            const isOnline = s.status === 'active';
            const color = isOnline ? '#00e5cc' : s.status === 'maintenance' ? '#f5a623' : '#ff3b5c';
            const marker = L.marker([lat, lng], { icon: makeIcon(color, 8, false) });
            marker.bindPopup(`
                <div style="min-width:160px;">
                    <div style="font-weight:700;color:var(--text-bright);margin-bottom:4px;">${s.name||s.sensor_id}</div>
                    <div style="font-size:10px;color:var(--text-dim);line-height:1.6;">
                        <div>Status: <span style="color:${color};font-weight:600;">${s.status}</span></div>
                        ${s.site_name ? '<div>Site: '+s.site_name+'</div>' : ''}
                        ${s.zone ? '<div>Zone: '+s.zone+'</div>' : ''}
                        ${s.battery_voltage ? '<div>Battery: '+s.battery_voltage+'V</div>' : ''}
                        ${s.signal_strength ? '<div>Signal: '+s.signal_strength+'%</div>' : ''}
                        ${s.last_ping ? '<div>Last ping: '+new Date(s.last_ping).toLocaleString()+'</div>' : ''}
                    </div>
                </div>`);
            layers.sensors.addLayer(marker);
        });
    }

    function plotAlerts(alerts) {
        layers.alerts.clearLayers();
        alerts.forEach(a => {
            const lat = parseFloat(a.latitude), lng = parseFloat(a.longitude);
            if (!lat || !lng) return;
            const isCritical = a.severity === 'critical';
            const color = isCritical ? '#ff3b5c' : a.severity === 'high' ? '#f97316' : '#f5a623';
            const size = isCritical ? 18 : 14;
            const marker = L.marker([lat, lng], { icon: makeIcon(color, size, true) });
            marker.bindPopup(`
                <div style="min-width:200px;">
                    <div style="font-weight:700;color:${color};margin-bottom:4px;">⚠ ${a.alert_type||'Alert'}</div>
                    <div style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;background:${color}20;color:${color};border:1px solid ${color}40;margin-bottom:6px;">${a.severity}</div>
                    <div style="font-size:10px;color:var(--text-dim);line-height:1.6;">
                        ${a.description ? '<div>'+a.description+'</div>' : ''}
                        ${a.sensor_name ? '<div>Sensor: '+a.sensor_name+'</div>' : ''}
                        ${a.site_name ? '<div>Site: '+a.site_name+'</div>' : ''}
                        ${a.time_to_overflow_min ? '<div style="color:#ff3b5c;font-weight:600;">Overflow in: '+a.time_to_overflow_min+' min</div>' : ''}
                        <div>Reported: ${new Date(a.created_at).toLocaleString()}</div>
                    </div>
                </div>`);
            layers.alerts.addLayer(marker);
        });
    }

    function plotFloodRisk(risks) {
        layers.flood_risk.clearLayers();
        risks.forEach(r => {
            const lat = parseFloat(r.latitude), lng = parseFloat(r.longitude);
            if (!lat || !lng) return;
            const level = r.flood_risk_level;
            const colors = { critical:'#ff3b5c', high:'#f97316', moderate:'#f5a623', low:'#00e5cc' };
            const radii = { critical:800, high:600, moderate:400, low:200 };
            const color = colors[level] || '#f5a623';
            const radius = radii[level] || 400;

            const circle = L.circle([lat, lng], {
                radius: radius,
                color: color,
                weight: 1.5,
                opacity: 0.6,
                fillColor: color,
                fillOpacity: 0.12,
                dashArray: level === 'critical' ? '' : '4 4'
            });
            circle.bindPopup(`
                <div>
                    <div style="font-weight:700;color:${color};margin-bottom:4px;">Flood Risk: ${level.toUpperCase()}</div>
                    <div style="font-size:10px;color:var(--text-dim);">
                        <div>Area: ${r.property_name||'—'}</div>
                        ${r.drainage_condition_score ? '<div>Drainage score: '+r.drainage_condition_score+'/10</div>' : ''}
                    </div>
                </div>`);
            layers.flood_risk.addLayer(circle);
        });
    }

    // ---- HIGH FLOOD PROBABILITY ZONES (static reference data) ----
    // Source: Lagos State flood vulnerability studies, NEMA/SEMA 2024 assessments,
    // Lagos State Govt evacuation warnings (Aug 2025), EM-DAT flood records
    // Coordinates verified via geodatos.net, latlong.net, OpenStreetMap, getamap.net

    const HFP_ZONES = [
        // === HIGH RISK — Eti-Osa LGA (79.38% land at high flood risk) ===
        { name: 'Victoria Island / Lekki Phase 1', lat: 6.4281, lng: 3.4219, risk: 'critical', radius: 1200,
          reason: 'Most flood-exposed locality in Lagos — 7 recorded flood events. Low-lying peninsula between Lagos Lagoon and Atlantic Ocean. Coastal surge + poor drainage.' },
        { name: 'Lekki Phase 1 – Admiralty / Freedom Way', lat: 6.4400, lng: 3.4700, risk: 'critical', radius: 900,
          reason: 'Reclaimed marshland. Severe flooding Jul 2024 (10hr rainfall). Streets submerged, buildings collapsed, cars swept away.' },
        { name: 'Ibeju-Lekki', lat: 6.4500, lng: 3.5800, risk: 'high', radius: 1500,
          reason: 'High-risk LGA per geospatial assessment. Coastal flooding, rising sea level, tidal surge. Major damage in 2024 Lekki flood.' },

        // === HIGH RISK — Ajeromi-Ifelodun LGA (66% land at high risk) ===
        { name: 'Ajegunle (Ajilete Axis)', lat: 6.4520, lng: 3.3312, risk: 'critical', radius: 1000,
          reason: 'Lagos State Govt issued evacuation order Aug 2025. Low-lying, poor drainage, recurrent annual flooding. 66% of LGA land at high risk.' },
        { name: 'Ajeromi-Ifelodun Central', lat: 6.4480, lng: 3.3410, risk: 'high', radius: 800,
          reason: 'Second highest proportion of high-risk land (66%) among all Lagos LGAs. Dense informal settlement on low ground.' },

        // === HIGH RISK — Ikorodu coastline (Govt evacuation warning) ===
        { name: 'Majidun, Ikorodu', lat: 6.6151, lng: 3.4674, risk: 'critical', radius: 900,
          reason: 'Lagos State Govt warned residents to evacuate Aug 2025. Coastal Ikorodu along Majidun River/Lagos Lagoon. Annual inundation.' },
        { name: 'Agboyi / Owode Onirin, Ikorodu', lat: 6.5900, lng: 3.4000, risk: 'high', radius: 800,
          reason: 'Houses submerged in multiple flood events. Low-lying communities including Agboyi I, Agboyi II, Owode Onirin, Owode Elede.' },
        { name: 'Isheri / OPIC Area', lat: 6.6300, lng: 3.3500, risk: 'high', radius: 1000,
          reason: 'Specifically named in Aug 2025 govt flood warning. Ogun River floodplain — dredging project ongoing since Sep 2024.' },

        // === MODERATE-HIGH RISK — Kosofe LGA (3 recorded flood events) ===
        { name: 'Ketu / Alapere', lat: 6.5846, lng: 3.3901, risk: 'high', radius: 700,
          reason: 'Houses submerged in low-lying communities. Student carried away by floods in Ketu area (2024). Part of Kosofe LGA — 3 recorded flood events.' },
        { name: 'Mile 12 / Agiliti', lat: 6.5880, lng: 3.3920, risk: 'moderate', radius: 600,
          reason: 'Low-lying market area prone to waterlogging. Araromi Otun Agiliti, Maidan communities repeatedly affected.' },

        // === MODERATE RISK — Lagos Island (highest flood intensity historically) ===
        { name: 'Lagos Island', lat: 6.4550, lng: 3.3940, risk: 'high', radius: 800,
          reason: 'Highest intensity and severity of flooding in Lagos State — yearly occurrence since 1968. Lowest elevation in state (25m).' },

        // === MODERATE RISK — Mainland LGAs ===
        { name: 'Surulere Basin', lat: 6.4920, lng: 3.3560, risk: 'moderate', radius: 900,
          reason: 'GIS-mapped flood-prone zones. Moderate risk per LGA assessment. Drainage system overwhelmed during heavy rain events.' },
        { name: 'Apapa', lat: 6.4490, lng: 3.3590, risk: 'moderate', radius: 700,
          reason: 'Port area, low-lying. Moderate flood risk per state assessment. Tidal influence from Lagos Harbour.' },
        { name: 'Mushin / Shomolu', lat: 6.5300, lng: 3.3550, risk: 'moderate', radius: 800,
          reason: 'Mushin neighbourhood — 2024 floods destroyed two-storey structure. Dense urban area with overwhelmed drainage channels.' },
        { name: 'Ojo', lat: 6.4050, lng: 3.2010, risk: 'moderate', radius: 1000,
          reason: 'Moderate flood risk per state mapping. Coastal proximity, poor drainage infrastructure in residential zones.' },
        { name: 'Amuwo-Odofin', lat: 6.4630, lng: 3.3100, risk: 'moderate', radius: 800,
          reason: 'Moderate flood risk zone. Low-lying area between Lagos Lagoon channels with limited drainage capacity.' },

        // === MODERATE RISK — Outer LGAs ===
        { name: 'Agege', lat: 6.6180, lng: 3.3370, risk: 'moderate', radius: 700,
          reason: '3 recorded flood events per spatial analysis. Despite higher elevation (65m), drainage overwhelm during peak rainfall.' },
        { name: 'Badagry', lat: 6.4150, lng: 2.8810, risk: 'high', radius: 1500,
          reason: 'High-risk LGA per geospatial assessment. Coastal town — unregulated construction on natural buffers increases flooding and erosion.' },
        { name: 'Ikoyi', lat: 6.4520, lng: 3.4350, risk: 'moderate', radius: 600,
          reason: 'Incessant flooding occurrence from 1969–2020. Island geography vulnerable to tidal surge and lagoon overflow.' }
    ];

    function plotHFPZones() {
        layers.hfp_zones.clearLayers();

        const riskConfig = {
            critical: { color: '#9b59b6', fillOpacity: 0.14, weight: 2, dashArray: '' },
            high:     { color: '#8e44ad', fillOpacity: 0.10, weight: 1.5, dashArray: '6 3' },
            moderate: { color: '#7d3c98', fillOpacity: 0.07, weight: 1, dashArray: '4 4' }
        };

        HFP_ZONES.forEach(zone => {
            const cfg = riskConfig[zone.risk] || riskConfig.moderate;

            // Hazard circle
            const circle = L.circle([zone.lat, zone.lng], {
                radius: zone.radius,
                color: cfg.color,
                weight: cfg.weight,
                opacity: 0.7,
                fillColor: cfg.color,
                fillOpacity: cfg.fillOpacity,
                dashArray: cfg.dashArray
            });

            circle.bindPopup(`
                <div style="min-width:220px;">
                    <div style="font-family:var(--font-display);font-size:13px;font-weight:700;color:#c39bd3;margin-bottom:6px;">⚠ ${zone.name}</div>
                    <div style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;background:${cfg.color}25;color:${cfg.color};border:1px solid ${cfg.color}50;margin-bottom:8px;">${zone.risk} flood probability</div>
                    <div style="font-size:10px;color:var(--text-dim);line-height:1.6;">${zone.reason}</div>
                    <div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--panel-edge);font-size:9px;color:var(--text-dim);letter-spacing:0.5px;">
                        Source: Lagos State flood assessments, NEMA/SEMA, EM-DAT records
                    </div>
                </div>`);

            layers.hfp_zones.addLayer(circle);

            // Small center marker for critical zones
            if (zone.risk === 'critical') {
                const icon = L.divIcon({
                    className: '',
                    iconSize: [16, 16],
                    iconAnchor: [8, 8],
                    html: `<div style="width:16px;height:16px;display:flex;align-items:center;justify-content:center;">
                        <div style="width:8px;height:8px;border-radius:50%;background:#9b59b6;border:2px solid rgba(155,89,182,0.5);box-shadow:0 0 12px rgba(155,89,182,0.5);"></div>
                        <div style="position:absolute;width:8px;height:8px;border-radius:50%;border:2px solid #9b59b6;animation:pulse-ring 2s ease-out infinite;"></div>
                    </div>`
                });
                const marker = L.marker([zone.lat, zone.lng], { icon });
                marker.bindPopup(circle.getPopup());
                layers.hfp_zones.addLayer(marker);
            }
        });
    }

    // ---- MAP OVERLAYS ----

    function renderMapStats(md, kpis) {
        const areas = md.areas || [];
        const submitted = areas.filter(a => a.status === 'submitted').length;
        const active = (md.sites || []).length;
        const alertCount = (md.alerts || []).length;
        const sensorTotal = (md.sensors || []).length;

        document.getElementById('map-stats').innerHTML = `
            <div class="map-stat"><div class="map-stat-val">${active}</div><div class="map-stat-lbl">Active Sites</div></div>
            <div class="map-stat"><div class="map-stat-val" ${alertCount > 0 ? 'style="color:var(--s-critical);"' : ''}>${alertCount}</div><div class="map-stat-lbl">Alerts</div></div>
            <div class="map-stat"><div class="map-stat-val">${sensorTotal}</div><div class="map-stat-lbl">Sensors</div></div>
            <div class="map-stat"><div class="map-stat-val">${submitted}</div><div class="map-stat-lbl">Pending</div></div>
            <div class="map-stat"><div class="map-stat-val" style="color:#c39bd3;">${HFP_ZONES.length}</div><div class="map-stat-lbl">HFP Zones</div></div>
        `;
    }

    function fitBounds(md) {
        const allCoords = [];
        (md.areas || []).forEach(a => { if(a.latitude && a.longitude) allCoords.push([parseFloat(a.latitude), parseFloat(a.longitude)]); });
        (md.sites || []).forEach(s => { if(s.latitude && s.longitude) allCoords.push([parseFloat(s.latitude), parseFloat(s.longitude)]); });
        (md.sensors || []).forEach(s => { if(s.latitude && s.longitude) allCoords.push([parseFloat(s.latitude), parseFloat(s.longitude)]); });

        if (allCoords.length > 0) {
            map.fitBounds(L.latLngBounds(allCoords).pad(0.15));
        }
    }

    // ---- SIDE PANEL ----

    function renderSidePanel(kpis, md) {
        const areas = md?.areas || [];
        const pipeline = {
            submitted: areas.filter(a => a.status === 'submitted').length,
            inspection: areas.filter(a => ['inspection_scheduled','inspection_ongoing'].includes(a.status)).length,
            report: areas.filter(a => a.status === 'report_ready').length,
            billing: areas.filter(a => ['quote_sent','payment_pending','payment_completed','deployment_scheduled'].includes(a.status)).length,
            active: areas.filter(a => a.status === 'active').length
        };

        const critAlerts = parseInt(kpis.criticalAlerts) || 0;
        const sensorsOnline = kpis.sensorsOnline?.online || 0;
        const sensorsTotal = kpis.sensorsOnline?.total || 0;
        const uptime = kpis.networkUptime || 0;
        const mrr = kpis.mrr || 0;
        const pendingInsp = parseInt(kpis.pendingInspections) || 0;

        document.getElementById('dash-side').innerHTML = `
            <!-- Critical Alerts -->
            <div class="kpi-card ${critAlerts > 0 ? 'crit' : 'neon'}">
                <div class="kpi-top">
                    <div>
                        <div class="kpi-label">Active Alerts</div>
                        <div class="kpi-val" ${critAlerts > 0 ? 'style="color:var(--s-critical);"' : ''}>${kpis.activeAlerts || 0}</div>
                        ${critAlerts > 0 ? '<div class="kpi-sub" style="color:var(--s-critical);">'+critAlerts+' critical</div>' : '<div class="kpi-sub" style="color:var(--neon);">All clear</div>'}
                    </div>
                    <div class="kpi-icon" style="background:${critAlerts > 0 ? 'rgba(255,59,92,0.12)' : 'rgba(0,229,204,0.1)'};">
                        <svg width="18" height="18" fill="none" stroke="${critAlerts > 0 ? 'var(--s-critical)' : 'var(--neon)'}" stroke-width="2" viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
                    </div>
                </div>
            </div>

            <!-- Network Health -->
            <div class="kpi-card neon">
                <div class="kpi-top">
                    <div>
                        <div class="kpi-label">Network Health</div>
                        <div class="kpi-val">${uptime}%</div>
                        <div class="kpi-sub">${sensorsOnline}/${sensorsTotal} sensors online</div>
                    </div>
                    <div class="kpi-icon" style="background:rgba(0,229,204,0.1);">
                        <svg width="18" height="18" fill="none" stroke="var(--neon)" stroke-width="2" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                    </div>
                </div>
            </div>

            <!-- Revenue -->
            <div class="kpi-card neon">
                <div class="kpi-top">
                    <div>
                        <div class="kpi-label">Monthly Revenue</div>
                        <div class="kpi-val">₦${formatMoney(mrr)}</div>
                        <div class="kpi-sub">${kpis.activeSites||0} active sites</div>
                    </div>
                    <div class="kpi-icon" style="background:rgba(0,229,204,0.1);">
                        <svg width="18" height="18" fill="none" stroke="var(--neon)" stroke-width="2" viewBox="0 0 24 24"><path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1"/></svg>
                    </div>
                </div>
            </div>

            <!-- Pipeline -->
            <div class="kpi-card ${pendingInsp > 0 ? 'warn' : 'neon'}">
                <div class="kpi-label" style="margin-bottom:10px;">Inspection Pipeline</div>
                <div class="pipeline-row"><div class="pipeline-dot" style="background:#f5a623;"></div><div class="pipeline-name">Awaiting Review</div><div class="pipeline-count">${pipeline.submitted}</div></div>
                <div class="pipeline-row"><div class="pipeline-dot" style="background:#f97316;"></div><div class="pipeline-name">In Inspection</div><div class="pipeline-count">${pipeline.inspection}</div></div>
                <div class="pipeline-row"><div class="pipeline-dot" style="background:#e0a800;"></div><div class="pipeline-name">Report Ready</div><div class="pipeline-count">${pipeline.report}</div></div>
                <div class="pipeline-row"><div class="pipeline-dot" style="background:#3498db;"></div><div class="pipeline-name">Quote / Payment</div><div class="pipeline-count">${pipeline.billing}</div></div>
                <div class="pipeline-row"><div class="pipeline-dot" style="background:#00e5cc;"></div><div class="pipeline-name">Active / Deployed</div><div class="pipeline-count">${pipeline.active}</div></div>
            </div>

            <!-- HFP Zones Summary -->
            <div class="kpi-card" style="border-color:rgba(155,89,182,0.3);">
                <div class="kpi-top">
                    <div>
                        <div class="kpi-label">Flood Probability Zones</div>
                        <div class="kpi-val" style="color:#c39bd3;">${HFP_ZONES.length}</div>
                        <div class="kpi-sub">${HFP_ZONES.filter(z=>z.risk==='critical').length} critical · ${HFP_ZONES.filter(z=>z.risk==='high').length} high · ${HFP_ZONES.filter(z=>z.risk==='moderate').length} moderate</div>
                    </div>
                    <div class="kpi-icon" style="background:rgba(155,89,182,0.12);">
                        <svg width="18" height="18" fill="none" stroke="#9b59b6" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/></svg>
                    </div>
                </div>
            </div>

            <!-- Quick Actions -->
            <div class="kpi-card neon">
                <div class="kpi-label" style="margin-bottom:10px;">Quick Actions</div>
                <div style="display:flex;flex-direction:column;gap:6px;">
                    <button class="quick-btn" onclick="switchTab('alerts')">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/></svg>
                        View Live Alerts
                    </button>
                    <button class="quick-btn" onclick="switchTab('properties')">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4"/></svg>
                        Manage Areas
                    </button>
                    <button class="quick-btn" onclick="switchTab('teams')">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0112 0v2"/></svg>
                        Dispatch Team
                    </button>
                    <button class="quick-btn" onclick="switchTab('clients')">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                        View Clients
                    </button>
                </div>
            </div>
        `;
    }

    function formatMoney(amount) {
        if (amount >= 1000000) return (amount / 1000000).toFixed(1) + 'M';
        if (amount >= 1000) return (amount / 1000).toFixed(0) + 'K';
        return Number(amount).toLocaleString();
    }

    return { render, toggleLayer };
})();