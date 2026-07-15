/* ══════════════════════════════════════════════════════════════
   FlowGuard Ops — PROPERTY NETWORK
   The spine of the model, made visible:
       Property → its drainage Assets → the Sentinels watching each
   Opened from Properties, Assets, Sentinel, or the dashboard.
   ══════════════════════════════════════════════════════════════ */
const OpsNetwork = (function () {
  let _data = null;
  let _propertyId = null;

  const TYPE_ICON = {
    primary_canal:    '<path d="M2 12h20M2 7c4 0 4 10 8 10s4-10 8-10 4 10 4 10"/>',
    secondary_drain:  '<path d="M4 6h16M6 10h12M8 14h8M10 18h4"/>',
    box_culvert:      '<rect x="3" y="7" width="18" height="10" rx="1"/><path d="M3 12h18"/>',
    storm_drain:      '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9v6M12 9v6M16 9v6"/>',
    catch_basin:      '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h10"/>',
    manhole:          '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
    retention_pond:   '<path d="M3 14c3-4 6-4 9 0s6 4 9 0"/><path d="M3 18c3-4 6-4 9 0s6 4 9 0"/>',
    pump_station:     '<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M9 9V6a3 3 0 016 0v3"/>',
    flood_gate:       '<path d="M4 4v16M20 4v16M4 8h16M4 14h16"/>',
    overflow_chamber: '<path d="M5 4h14v9a7 7 0 01-14 0z"/>',
    detention_tank:   '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/>',
    outfall:          '<path d="M4 8h9a5 5 0 015 5v7"/><path d="M4 5v6"/>',
  };

  function open(propertyId) {
    _propertyId = propertyId;
    switchTab('network');
  }

  async function render(container) {
    if (!_propertyId) {
      container.innerHTML = `<div class="nw-empty">Open a property from the Properties screen to see its drainage network.</div>${styles()}`;
      return;
    }
    container.innerHTML = styles() + '<div id="nw-body"><div class="nw-empty">Loading the network…</div></div>';
    await load();
  }

  let _outcomes = null;

  async function load() {
    try {
      const [netRes, outRes] = await Promise.all([
        OpsModal.apiGet(`/properties/${_propertyId}/network`),
        OpsModal.apiGet(`/properties/${_propertyId}/outcomes`).catch(() => ({ data: null })),
      ]);
      _data = netRes.data;
      _outcomes = outRes.data;
      draw();
    } catch (err) {
      const el = document.getElementById('nw-body');
      if (el) el.innerHTML = `<div class="nw-empty">Couldn't load the network — ${esc(err.message || 'network error')}.</div>`;
    }
  }

  function hCol(v) { return v >= 75 ? 'var(--ok)' : v >= 50 ? 'var(--warn)' : 'var(--err)'; }

  // why is this asset unhealthy? components are per-factor scores (0-100);
  // the LOW ones are what's dragging it down, so surface those.
  const FACTOR_LABEL = {
    network:      v => `Only ${v}% of its Sentinels online`,
    water_level:  v => `Water at ${v}% of capacity`,
    silt:         v => `Silt at ${v}%`,
    alerts:       v => `Open alerts on this asset`,
    inspection:   v => `Inspection overdue`,
    debris:       v => `Debris detected`,
    telemetry:    v => `No recent readings`,
  };
  function drivers(a) {
    let c = a.health_components;
    if (typeof c === 'string') { try { c = JSON.parse(c); } catch (_) { c = null; } }
    if (!c || typeof c !== 'object') return '';
    // a component score below 70 is pulling the asset down
    const bad = Object.entries(c)
      .filter(([, v]) => typeof v === 'number' && v < 70)
      .sort((x, y) => x[1] - y[1])
      .slice(0, 3);
    if (!bad.length) return '';
    return `<div class="ast-why">${bad.map(([k, v]) => {
      const fn = FACTOR_LABEL[k];
      const txt = fn ? fn(Math.round(v)) : `${k.replace(/_/g, ' ')}: ${Math.round(v)}`;
      return `<span class="why"><i></i>${esc(txt)}</span>`;
    }).join('')}</div>`;
  }

  function draw() {
    const el = document.getElementById('nw-body');
    if (!el || !_data) return;
    const p = _data.property;
    const billing = _data.billing;
    const s = _data.summary;
    const assets = _data.assets || [];
    const orphans = _data.unassigned_sentinels || [];
    const oc = _outcomes;

    const health = p.health_score != null ? Number(p.health_score) : null;

    el.innerHTML = `
      <div class="nw-head">
        <button class="nw-back" onclick="switchTab('properties')">← Properties</button>
        <div class="nw-title">
          <h2>${esc(p.property_name)}</h2>
          <span>${(p.property_type || '').replace(/_/g, ' ')}${p.city ? ' · ' + esc(p.city) : ''}${p.state ? ', ' + esc(p.state) : ''}</span>
        </div>
      </div>

      <div id="nw-kpis"></div>

      ${!assets.length ? `
        <div class="nw-empty">
          <b>No drainage assets registered for this property.</b><br>
          The canals, catch basins and pump stations that protect this estate live here — register them
          so Sentinels can be assigned and work can be tracked against them.
          <br><br><button class="nw-add" onclick="switchTab('assets')">Go to Assets →</button>
        </div>`
      : `
        <div class="nw-tree">
          ${assets.map(assetRow).join('')}
        </div>`}

      ${orphans.length ? `
        <div class="nw-orphans">
          <div class="nw-orph-h">⚠ ${orphans.length} Sentinel${orphans.length > 1 ? 's' : ''} on this client's account cover no asset here</div>
          <div class="nw-orph-list">
            ${orphans.map(o => `<button class="nw-orph" onclick="switchTab('sensors')">${esc(o.name || o.sensor_id)} · ${o.status}</button>`).join('')}
          </div>
        </div>` : ''}

      ${oc ? `
        <div class="nw-activity">
          <div class="nw-activity-h">Recent activity</div>
          ${oc.recent_events && oc.recent_events.length
            ? oc.recent_events.map(e => `
                <div class="nw-act-row">
                  <span class="nw-act-type">${esc((e.event_type || '').replace(/_/g, ' '))}</span>
                  <span class="nw-act-desc">${esc(e.description || '—')}</span>
                  <span class="nw-act-time">${OpsModal.fmtDate(e.occurred_at)}</span>
                </div>`).join('')
            : '<div class="nw-act-empty">No recorded work against this property yet.</div>'}
        </div>` : ''}
    `;

    renderMissionKpis(p, s, billing, health, oc);
  }

  // ── Mission-control KPI header: what's true about this property right
  // now, in one strip — health, days flood-free, prevention track record,
  // Sentinel coverage, and MRR where a billing account resolves. ──
  function renderMissionKpis(p, s, billing, health, oc) {
    const kp = document.getElementById('nw-kpis');
    if (!kp) return;
    const cards = [
      {
        label: 'Health score', value: health != null ? health : '—',
        sub: health != null ? (health >= 75 ? 'Healthy' : health >= 50 ? 'Needs attention' : 'At risk') : 'No score yet',
        subClass: health == null ? '' : health >= 75 ? 'ok' : health >= 50 ? 'warn' : 'err',
      },
      {
        label: 'Days flood-free', value: oc ? oc.days_since_flood : '—',
        sub: oc ? (oc.flood_free_basis === 'last_incident' ? 'Since last incident' : 'Since monitoring began') : 'No data yet',
      },
      {
        label: 'Incidents prevented', value: oc ? oc.incidents_prevented : '—',
        sub: oc && oc.incidents_prevented ? 'Confirmed saves' : 'None recorded',
        subClass: oc && oc.incidents_prevented ? 'ok' : '',
      },
      {
        label: 'Sentinels', value: s.sentinel_count ? `${s.sentinels_active ?? 0}/${s.sentinel_count}` : '—',
        sub: s.unmonitored ? `${s.unmonitored} asset${s.unmonitored > 1 ? 's' : ''} unmonitored` : (s.asset_count ? 'All assets covered' : 'No assets yet'),
        subClass: s.unmonitored ? 'warn' : (s.sentinel_count ? 'ok' : ''),
      },
    ];
    if (billing) {
      cards.push({
        label: 'MRR', value: billing.mrr != null ? '₦' + Number(billing.mrr).toLocaleString() : '—',
        sub: billing.tier ? `${billing.tier} tier` : 'Billing account',
      });
    }
    kp.innerHTML = OpsModal.kpiStrip(cards);
  }

  function assetRow(a) {
    const sentinels = a.sentinels || [];
    const icon = TYPE_ICON[a.property_type] || TYPE_ICON.catch_basin;

    // the asset's live state comes from the WORST reading among its Sentinels
    const levels = sentinels.map(s => s.level).filter(v => v != null).map(Number);
    const worst = levels.length ? Math.max(...levels) : null;
    const lvlCol = worst == null ? 'var(--ink-4)' : worst >= 70 ? 'var(--err)' : worst >= 50 ? 'var(--warn)' : 'var(--ok)';
    const debris = sentinels.some(s => s.debris);

    return `
      <div class="ast-row">
        <div class="ast-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></div>
        <div class="ast-main">
          <div class="ast-h">
            <b>${esc(a.asset_code || a.property_name)}</b>
            <span class="ast-type">${(a.property_type || '').replace(/_/g, ' ')}</span>
            ${a.health_score != null ? `<span class="ast-health" style="color:${hCol(a.health_score)};border-color:${hCol(a.health_score)}55;background:${hCol(a.health_score)}14">${a.health_score}/100</span>` : ''}
            ${a.risk_level ? `<span class="ast-risk r-${a.risk_level}">${a.risk_level} risk</span>` : ''}
            ${debris ? '<span class="ast-risk r-high">debris</span>' : ''}
          </div>
          ${drivers(a)}

          <div class="ast-live">
            <span class="lv-k">Water level</span>
            <span class="lv-bar"><i style="width:${worst != null ? Math.max(2, worst) : 0}%;background:${lvlCol}"></i></span>
            <span class="lv-v" style="color:${lvlCol}">${worst != null ? Math.round(worst) + '%' : 'no data'}</span>
            ${a.capacity_liters ? `<span class="lv-cap">${Number(a.capacity_liters).toLocaleString()} L capacity</span>` : ''}
          </div>

          <div class="ast-sent">
            ${sentinels.length
              ? sentinels.map(s => {
                  const st = s.status === 'active' ? 'var(--ok)' : s.status === 'maintenance' ? 'var(--warn)' : 'var(--err)';
                  return `<button class="sent-tag" onclick="switchTab('sensors')" title="${s.is_primary ? 'Installed on this asset' : 'Also monitors this asset'}">
                    <i style="background:${st}"></i>${s.is_primary ? '★ ' : ''}${esc(s.name || s.sensor_id)}
                    ${s.flow_rate != null ? `<b>${Number(s.flow_rate).toFixed(1)} L/s</b>` : ''}
                  </button>`;
                }).join('')
              : '<span class="sent-none">No Sentinel watching this asset — it is unmonitored</span>'}
          </div>
        </div>
      </div>`;
  }

  function styles() {
    return `<style>
      .ast-health { font-family:var(--ff-m); font-size:var(--fs-2xs); font-weight:700; padding:2px 8px; border-radius:100px; border:1px solid; }
      .ast-why { display:flex; flex-wrap:wrap; gap:6px; margin:7px 0 0; }
      .ast-why .why { display:inline-flex; align-items:center; gap:5px; font-size:var(--fs-2xs); color:var(--ink-3); background:var(--surface-2); border:1px solid var(--border); border-radius:6px; padding:3px 8px; }
      .ast-why .why i { width:4px; height:4px; border-radius:50%; background:var(--warn); flex-shrink:0; }
      .nw-head { display:flex; align-items:center; gap:14px; margin-bottom:14px; }
      .nw-back { padding:6px 12px; border-radius:8px; border:1px solid var(--border-2); background:var(--surface); color:var(--ink-2); font-size:var(--fs-xs); font-weight:600; font-family:var(--ff-b); cursor:pointer; flex-shrink:0; }
      .nw-back:hover { border-color:var(--blue-dim); color:var(--blue-hi); }
      .nw-title { flex:1; min-width:0; }
      .nw-title h2 { margin:0; font-size:var(--fs-xl); font-weight:700; color:var(--ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .nw-title span { font-size:var(--fs-xs); color:var(--ink-3); }

      #nw-kpis { margin-bottom:16px; }

      .nw-tree { display:flex; flex-direction:column; gap:10px; }
      .ast-row { display:flex; gap:12px; background:var(--surface); border:1px solid var(--border); border-radius:13px; padding:14px 15px; box-shadow:var(--sh-xs); }
      .ast-ic { width:36px; height:36px; border-radius:10px; display:grid; place-items:center; flex-shrink:0; background:var(--neon-trace); color:var(--blue-hi); }
      .ast-ic svg { width:18px; height:18px; }
      .ast-main { flex:1; min-width:0; }
      .ast-h { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
      .ast-h b { font-size:var(--fs-md); font-weight:700; color:var(--ink); }
      .ast-type { font-size:var(--fs-2xs); color:var(--ink-3); }
      .ast-risk { font-size:var(--fs-2xs); font-weight:800; letter-spacing:.5px; text-transform:uppercase; padding:2px 7px; border-radius:5px; background:var(--surface-3); color:var(--ink-2); }
      .ast-risk.r-high, .ast-risk.r-critical { background:var(--eb); color:var(--err); }
      .ast-risk.r-moderate { background:var(--wb); color:var(--warn); }

      .ast-live { display:flex; align-items:center; gap:9px; margin:9px 0; flex-wrap:wrap; }
      .lv-k { font-size:var(--fs-2xs); color:var(--ink-3); }
      .lv-bar { flex:1; min-width:70px; max-width:190px; height:5px; border-radius:3px; background:var(--surface-3); overflow:hidden; }
      .lv-bar i { display:block; height:100%; border-radius:3px; }
      .lv-v { font-family:var(--ff-m); font-size:var(--fs-sm); font-weight:600; }
      .lv-cap { font-size:var(--fs-2xs); color:var(--ink-4); }

      .ast-sent { display:flex; gap:6px; flex-wrap:wrap; }
      .sent-tag { display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:100px; border:1px solid var(--border-2); background:var(--surface-2); color:var(--ink-2); font-size:var(--fs-xs); font-family:var(--ff-b); cursor:pointer; }
      .sent-tag:hover { border-color:var(--blue-dim); color:var(--blue-hi); }
      .sent-tag i { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
      .sent-tag b { font-family:var(--ff-m); color:var(--ink); font-weight:600; }
      .sent-none { font-size:var(--fs-xs); color:var(--warn); }

      .nw-orphans { margin-top:16px; padding:13px 15px; border:1px solid var(--warn); border-radius:12px; background:var(--wb); }
      .nw-orph-h { font-size:var(--fs-sm); font-weight:700; color:var(--warn); margin-bottom:8px; }
      .nw-orph-list { display:flex; gap:6px; flex-wrap:wrap; }
      .nw-orph { padding:4px 10px; border-radius:100px; border:1px solid var(--warn); background:transparent; color:var(--warn); font-size:var(--fs-xs); font-family:var(--ff-b); cursor:pointer; }

      .nw-empty { padding:40px; text-align:center; color:var(--ink-3); font-size:var(--fs-base); line-height:1.7; background:var(--surface); border:1px solid var(--border); border-radius:14px; }
      .nw-empty b { color:var(--ink); }
      .nw-add { margin-top:4px; padding:8px 15px; border-radius:9px; border:1px solid var(--blue-dim); background:var(--neon-trace); color:var(--blue-hi); font-size:var(--fs-sm); font-weight:700; font-family:var(--ff-b); cursor:pointer; }

      .nw-activity { margin-top:16px; background:var(--surface); border:1px solid var(--border); border-radius:13px; overflow:hidden; }
      .nw-activity-h { padding:12px 15px; border-bottom:1px solid var(--border); font-size:var(--fs-xs); font-weight:700; letter-spacing:.8px; text-transform:uppercase; color:var(--ink-3); }
      .nw-act-row { display:flex; align-items:center; gap:12px; padding:10px 15px; border-bottom:1px solid var(--border); }
      .nw-act-row:last-child { border-bottom:none; }
      .nw-act-type { font-size:var(--fs-2xs); font-weight:800; letter-spacing:.5px; text-transform:uppercase; color:var(--blue-hi); min-width:110px; flex-shrink:0; }
      .nw-act-desc { flex:1; min-width:0; font-size:var(--fs-sm); color:var(--ink-2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .nw-act-time { font-family:var(--ff-m); font-size:var(--fs-2xs); color:var(--ink-3); white-space:nowrap; flex-shrink:0; }
      .nw-act-empty { padding:20px; text-align:center; color:var(--ink-3); font-size:var(--fs-sm); }
    </style>`;
  }

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  return { render, open };
})();
