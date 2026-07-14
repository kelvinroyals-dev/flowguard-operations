/* ══════════════════════════════════════════════════════════════
   FlowGuard Ops — SENTINEL
   The devices themselves, not the infrastructure they watch.
   Online state, battery, signal, firmware, heartbeat, capabilities,
   calibration, and the assets each node covers (many-to-many).
   ══════════════════════════════════════════════════════════════ */
const OpsSensors = (function () {
  // identifiers embedded in inline handlers: restrict to a safe charset.
  // HTML-escaping does NOT protect here — the browser decodes entities before
  // parsing the JS, so a quote can still break out of the string.
  const __sid = v => String(v == null ? '' : v).replace(/[^A-Za-z0-9_\-.:]/g, '');

  let _all = [];
  let _filter = 'all';
  let _q = '';

  async function render(container) {
    container.innerHTML = `
      <style>
        .sn-kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-bottom:14px; }
        .sn-kpis .ck { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:14px 16px; box-shadow:var(--sh-xs); min-width:0; }
        .sn-kpis .ck-label { font-size:.68rem; font-weight:500; color:var(--ink-2); line-height:1.25; }
        .sn-kpis .ck-val { font-family:var(--ff-b); font-size:1.5rem; font-weight:700; color:var(--ink); margin-top:5px; line-height:1.15; letter-spacing:-.5px; }
        .sn-kpis .ck-sub { font-size:.66rem; color:var(--ink-3); margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .sn-kpis .ck-sub.ok { color:var(--ok); } .sn-kpis .ck-sub.warn { color:var(--warn); } .sn-kpis .ck-sub.err { color:var(--err); }

        .sn-toolbar { display:flex; gap:9px; align-items:center; margin-bottom:12px; flex-wrap:wrap; }
        .sn-chip { padding:6px 13px; border-radius:100px; border:1px solid var(--border-2); background:var(--surface); font-size:.68rem; font-weight:600; color:var(--ink-2); cursor:pointer; user-select:none; }
        .sn-chip.on { background:var(--neon-trace); border-color:var(--blue-dim); color:var(--blue-hi); }
        .sn-search { display:flex; align-items:center; gap:7px; background:var(--surface); border:1px solid var(--border-2); border-radius:9px; padding:7px 12px; width:220px; color:var(--ink-3); margin-left:auto; }
        .sn-search input { flex:1; min-width:0; background:transparent; border:none; outline:none; color:var(--ink); font-size:.76rem; font-family:var(--ff-b); }

        .sn-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:12px; }
        .dev { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:15px 16px; box-shadow:var(--sh-xs); }
        .dev-top { display:flex; align-items:flex-start; gap:10px; margin-bottom:11px; }
        .dev-id { flex:1; min-width:0; }
        .dev-name { font-size:.86rem; font-weight:700; color:var(--ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .dev-code { font-family:var(--ff-m); font-size:.63rem; color:var(--ink-3); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .dev-st { display:inline-flex; align-items:center; gap:6px; padding:4px 9px; border-radius:100px; font-size:.6rem; font-weight:800; letter-spacing:.6px; text-transform:uppercase; flex-shrink:0; }
        .dev-st i { width:6px; height:6px; border-radius:50%; background:currentColor; box-shadow:0 0 6px currentColor; }

        .dev-vitals { display:grid; grid-template-columns:repeat(3,1fr); gap:9px; padding:10px 0; border-top:1px solid var(--border); border-bottom:1px solid var(--border); }
        .vit { min-width:0; }
        .vit-k { font-size:.57rem; font-weight:700; letter-spacing:.7px; text-transform:uppercase; color:var(--ink-3); }
        .vit-v { font-family:var(--ff-m); font-size:.8rem; font-weight:600; color:var(--ink); margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .vit-bar { height:4px; border-radius:2px; background:var(--surface-3); margin-top:5px; overflow:hidden; }
        .vit-bar i { display:block; height:100%; border-radius:2px; }

        .dev-read { display:flex; flex-wrap:wrap; gap:6px; margin:11px 0 0; }
        .rd { display:flex; align-items:center; gap:5px; padding:4px 9px; border-radius:7px; background:var(--surface-2); border:1px solid var(--border); font-size:.65rem; color:var(--ink-2); white-space:nowrap; }
        .rd b { font-family:var(--ff-m); color:var(--ink); font-weight:600; }
        .rd.off { opacity:.45; }

        .dev-cov { margin-top:12px; }
        .cov-k { font-size:.57rem; font-weight:700; letter-spacing:.7px; text-transform:uppercase; color:var(--ink-3); margin-bottom:6px; }
        .cov-list { display:flex; flex-wrap:wrap; gap:5px; }
        .cov-tag { cursor:pointer; font-family:var(--ff-b); display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:100px; background:var(--neon-trace); border:1px solid var(--blue-dim); font-size:.64rem; color:var(--blue-hi); white-space:nowrap; }
        .cov-tag:hover { border-color:var(--ink-2); }
        .cov-tag.pri { background:var(--ok-bg); border-color:var(--ok); color:var(--ok); font-weight:700; }
        .cov-none { font-size:.68rem; color:var(--warn); }

        .dev-acts { display:flex; gap:7px; margin-top:12px; }
        .dev-btn { flex:1; padding:6px 8px; border-radius:8px; border:1px solid var(--border-2); background:transparent; color:var(--ink-2); font-size:.67rem; font-weight:600; font-family:var(--ff-b); cursor:pointer; }
        .dev-btn:hover { border-color:var(--blue-dim); color:var(--blue-hi); }

        .sn-empty { padding:40px; text-align:center; color:var(--ink-3); font-size:.8rem; background:var(--surface); border:1px solid var(--border); border-radius:14px; }
        .sn-note { padding:11px 14px; border-radius:10px; background:var(--wb); color:var(--warn); font-size:.74rem; margin-bottom:12px; line-height:1.5; }
      </style>
      <div class="sn-kpis" id="sn-kpis"></div>
      <div class="sn-toolbar" id="sn-toolbar"></div>
      <div id="sn-body"><div class="sn-empty">Loading the Sentinel fleet…</div></div>
    `;
    await load();
  }

  async function load() {
    try {
      const r = await OpsModal.apiGet('/monitoring/sensors/all');
      _all = r.data || [];
      draw();
    } catch (err) {
      const el = document.getElementById('sn-body');
      if (el) el.innerHTML = `<div class="sn-empty">Couldn't load the fleet — ${esc(err.message || 'network error')}.</div>`;
    }
  }

  function rel(ts) {
    if (!ts) return null;
    const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    if (m < 1440) return Math.floor(m / 60) + 'h ago';
    return Math.floor(m / 1440) + 'd ago';
  }

  function draw() {
    const el = document.getElementById('sn-body');
    const kp = document.getElementById('sn-kpis');
    const tb = document.getElementById('sn-toolbar');
    if (!el) return;

    const total = _all.length;
    const online = _all.filter(x => x.status === 'active').length;
    const maint = _all.filter(x => x.status === 'maintenance').length;
    const offline = total - online - maint;
    const battKnown = _all.some(x => x.battery_percent != null);
    const lowBatt = _all.filter(x => x.battery_percent != null && x.battery_percent < 20).length;
    const unassigned = _all.filter(x => !x.assets || !x.assets.length).length;
    const silent = _all.filter(x => !x.reading_time && !x.last_ping).length;

    kp.innerHTML = `
      <div class="ck"><div class="ck-label">Fleet size</div><div class="ck-val">${total}</div><div class="ck-sub">Deployed Sentinels</div></div>
      <div class="ck"><div class="ck-label">Online</div><div class="ck-val">${online}</div><div class="ck-sub ${online === total && total ? 'ok' : ''}">${total ? Math.round(online / total * 100) + '% reporting' : '—'}</div></div>
      <div class="ck"><div class="ck-label">Offline / maintenance</div><div class="ck-val">${offline + maint}</div><div class="ck-sub ${offline ? 'err' : ''}">${offline} offline · ${maint} maintenance</div></div>
      <div class="ck"><div class="ck-label">Low battery</div><div class="ck-val">${battKnown ? lowBatt : '—'}</div><div class="ck-sub ${lowBatt ? 'warn' : ''}">${battKnown ? 'Below 20%' : 'Not reported'}</div></div>
      <div class="ck"><div class="ck-label">Unassigned</div><div class="ck-val">${unassigned}</div><div class="ck-sub ${unassigned ? 'warn' : 'ok'}">${unassigned ? 'Covering no asset' : 'All assigned'}</div></div>
    `;

    const chips = [
      ['all', `All (${total})`], ['active', `Online (${online})`],
      ['offline', `Offline (${offline})`], ['maintenance', `Maintenance (${maint})`],
      ['lowbatt', `Low battery (${battKnown ? lowBatt : 0})`],
      ['unassigned', `Unassigned (${unassigned})`],
    ];
    tb.innerHTML = chips.map(([k, l]) =>
      `<span class="sn-chip ${_filter === k ? 'on' : ''}" onclick="OpsSensors.setFilter('${__sid(k)}')">${l}</span>`).join('') + `
      <span class="sn-search">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input placeholder="Search Sentinels…" value="${_q.replace(/"/g, '&quot;')}" oninput="OpsSensors.setQuery(this.value)">
      </span>`;

    let rows = _all;
    if (_filter === 'active') rows = rows.filter(x => x.status === 'active');
    else if (_filter === 'offline') rows = rows.filter(x => x.status !== 'active' && x.status !== 'maintenance');
    else if (_filter === 'maintenance') rows = rows.filter(x => x.status === 'maintenance');
    else if (_filter === 'lowbatt') rows = rows.filter(x => x.battery_percent != null && x.battery_percent < 20);
    else if (_filter === 'unassigned') rows = rows.filter(x => !x.assets || !x.assets.length);
    if (_q) {
      const q = _q.toLowerCase();
      rows = rows.filter(x => `${x.name || ''} ${x.sensor_id || ''} ${x.client_name || ''} ${(x.assets || []).map(a => a.name).join(' ')}`.toLowerCase().includes(q));
    }

    const banner = (silent === total && total)
      ? '<div class="sn-note"><b>No Sentinel is reporting telemetry.</b> Devices are registered and their vitals are on record, but no readings have reached the platform — level, flow and silt stay empty until the nodes start posting.</div>'
      : '';

    if (!rows.length) {
      el.innerHTML = banner + `<div class="sn-empty">${total ? 'No Sentinels match this filter.' : 'No Sentinels deployed yet.'}</div>`;
      return;
    }
    el.innerHTML = banner + `<div class="sn-grid">${rows.map(card).join('')}</div>`;
  }

  function card(x) {
    const stMap = { active: ['var(--ok)', 'Online'], maintenance: ['var(--warn)', 'Maintenance'] };
    const [c, lbl] = stMap[x.status] || ['var(--err)', 'Offline'];

    const bar = (v, invert) => {
      if (v == null) return '<div class="vit-v">—</div>';
      const bad = invert ? v <= 20 : v >= 80;
      const mid = invert ? v <= 40 : v >= 60;
      const col = bad ? 'var(--err)' : mid ? 'var(--warn)' : 'var(--ok)';
      return `<div class="vit-v" style="color:${col}">${v}%</div>
              <div class="vit-bar"><i style="width:${Math.max(2, v)}%;background:${col}"></i></div>`;
    };

    const cap = x.capabilities || {};
    const reading = (on, label, val, unit) => {
      if (!on) return '';
      const has = val != null;
      return `<span class="rd ${has ? '' : 'off'}">${label} <b>${has ? val + unit : '—'}</b></span>`;
    };

    const beat = rel(x.reading_time || x.last_ping);
    const assets = x.assets || [];
    const cov = assets.length
      ? assets.map(a => `<button class="cov-tag ${a.is_primary ? 'pri' : ''}" onclick="OpsSensors.openAsset('${__sid(a.property_id)}')" title="${a.type ? a.type.replace(/_/g, ' ') : ''} — open its property network">${a.is_primary ? '★ ' : ''}${esc(a.name)}</button>`).join('')
      : '<span class="cov-none">Covering no asset — assign one</span>';

    return `
      <div class="dev">
        <div class="dev-top">
          <div class="dev-id">
            <div class="dev-name">${esc(x.name || x.sensor_id)}</div>
            <div class="dev-code">${esc(x.sensor_id)}${x.device_variant ? ' · ' + x.device_variant.replace(/_/g, ' ') : ''}${x.firmware_version ? ' · fw ' + esc(x.firmware_version) : ''}${x.link_type ? ' · ' + x.link_type : ''}</div>
          </div>
          <span class="dev-st" style="color:${c};background:${c}18;border:1px solid ${c}40"><i></i>${lbl}</span>
        </div>

        <div class="dev-vitals">
          <div class="vit"><div class="vit-k">Battery</div>${bar(x.battery_percent, true)}</div>
          <div class="vit"><div class="vit-k">Signal</div>${bar(x.signal_strength, true)}</div>
          <div class="vit">
            <div class="vit-k">Heartbeat</div>
            <div class="vit-v" style="color:${beat ? 'var(--ink)' : 'var(--err)'}">${beat || 'never'}</div>
            <div class="vit-bar"><i style="width:100%;background:${beat ? 'var(--ok)' : 'var(--err)'}"></i></div>
          </div>
        </div>

        <div class="dev-read">
          ${reading(cap.water_level !== false, 'Level', x.level != null ? Math.round(x.level) : null, '%')}
          ${reading(cap.flow_rate !== false, 'Flow', x.flow_rate != null ? x.flow_rate.toFixed(1) : null, ' L/s')}
          ${reading(!!cap.silt, 'Silt', x.silt_depth_mm, ' mm')}
          ${reading(!!cap.rain_gauge, 'Rain', x.rainfall_mm, ' mm')}
          ${reading(!!cap.water_quality, 'pH', x.water_quality_ph, '')}
          ${reading(!!cap.enzyme_dispenser, 'Enzyme', x.enzyme_level_percent != null ? Math.round(x.enzyme_level_percent) : null, '%')}
          ${x.debris_detected ? '<span class="rd" style="color:var(--caut);border-color:var(--caut)">Debris</span>' : ''}
        </div>

        <div class="dev-cov">
          <div class="cov-k">Monitors${assets.length ? ` · ${assets.length} asset${assets.length > 1 ? 's' : ''}` : ''}</div>
          <div class="cov-list">${cov}</div>
        </div>

        <div class="dev-acts">
          <button class="dev-btn" onclick="OpsSensors.coverage('${__sid(x.sensor_id)}')">Coverage</button>
          <button class="dev-btn" onclick="OpsSensors.history('${__sid(x.sensor_id)}')">History</button>
          <button class="dev-btn" onclick="OpsSensors.calibrate('${__sid(x.sensor_id)}')">Calibrate</button>
        </div>
      </div>`;
  }

  // ── Coverage: one Sentinel, several nearby assets ──
  async function coverage(sensorId) {
    const node = _all.find(x => x.sensor_id === sensorId);
    if (!node) return;
    let assets = [];
    try {
      const r = await OpsModal.apiGet('/properties/assets');
      assets = (r.data || []).filter(a => !node.client_id || a.client_id === node.client_id || a.client_id == null);
    } catch (_) {}
    if (!assets.length) {
      OpsModal.toast('No assets registered yet — add drainage assets on the Assets screen first.', 'error');
      return;
    }
    const covered = new Set((node.assets || []).map(a => a.property_id));
    const primary = (node.assets || []).find(a => a.is_primary);

    OpsModal.open(`Coverage — ${esc(node.name || sensorId)}`, `
      <p style="margin:0 0 12px;font-size:.8rem;color:var(--ink-3);line-height:1.5">
        Tick every asset this Sentinel monitors. Mark one as <b>primary</b> — the asset the device is physically installed on.
      </p>
      <div style="max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:10px">
        ${assets.map(a => `
          <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--border)">
            <input type="checkbox" name="cov" value="${a.property_id}" ${covered.has(a.property_id) ? 'checked' : ''}>
            <span style="flex:1;min-width:0">
              <span style="font-size:.78rem;font-weight:600;color:var(--ink)">${esc(a.asset_code || a.property_name)}</span>
              <span style="display:block;font-size:.65rem;color:var(--ink-3)">${(a.property_type || '').replace(/_/g, ' ')}${a.parent_name ? ' · ' + esc(a.parent_name) : ''}</span>
            </span>
            <label style="display:flex;align-items:center;gap:5px;font-size:.65rem;color:var(--ink-3);white-space:nowrap">
              <input type="radio" name="primary" value="${a.property_id}" ${primary && primary.property_id === a.property_id ? 'checked' : ''}> primary
            </label>
          </div>`).join('')}
      </div>
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: 'Save coverage', primary: true, onclick: `OpsSensors.saveCoverage('${sensorId}')` },
    ]);
  }

  async function saveCoverage(sensorId) {
    const checks = Array.from(document.querySelectorAll('input[name="cov"]:checked')).map(i => i.value);
    const primaryEl = document.querySelector('input[name="primary"]:checked');
    const primaryId = primaryEl ? primaryEl.value : null;
    if (primaryId && !checks.includes(primaryId)) {
      OpsModal.toast('The primary asset must also be ticked as covered.', 'error');
      return;
    }
    OpsModal.setLoading(true);
    try {
      await OpsModal.apiPut(`/monitoring/sensors/${sensorId}/coverage`, {
        assets: checks.map(id => ({ property_id: id, is_primary: id === primaryId })),
      });
      OpsModal.close();
      OpsModal.toast('Coverage saved.', 'success');
      await load();
    } catch (err) {
      OpsModal.setLoading(false);
      OpsModal.toast(err.message || 'Failed to save coverage', 'error');
    }
  }

  async function history(sensorId) {
    const node = _all.find(x => x.sensor_id === sensorId);
    OpsModal.open(`History — ${esc(node ? (node.name || sensorId) : sensorId)}`,
      '<div style="padding:20px;color:var(--ink-3);font-size:.8rem">Loading…</div>',
      [{ label: 'Close', onclick: 'OpsModal.close()' }]);
    try {
      const r = await OpsModal.apiGet(`/monitoring/sensors/${sensorId}/events`);
      const evts = r.data || [];
      const body = document.querySelector('.ops-modal-body');
      if (!body) return;
      body.innerHTML = evts.length
        ? `<div>${evts.map(e => `
            <div style="display:flex;gap:10px;padding:10px 2px;border-bottom:1px solid var(--border)">
              <span style="font-size:.6rem;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:var(--blue-hi);min-width:102px">${(e.event_type || '').replace(/_/g, ' ')}</span>
              <span style="flex:1;min-width:0;font-size:.76rem;color:var(--ink-2)">${esc(e.detail || '—')}</span>
              <span style="font-family:var(--ff-m);font-size:.65rem;color:var(--ink-3);white-space:nowrap">${new Date(e.occurred_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
            </div>`).join('')}</div>`
        : '<div style="padding:22px;text-align:center;color:var(--ink-3);font-size:.8rem">No recorded history for this device yet.</div>';
    } catch (_) {}
  }

  function calibrate(sensorId) {
    OpsModal.open('Record calibration', `
      <p style="margin:0 0 12px;font-size:.8rem;color:var(--ink-3);line-height:1.5">
        Logs a calibration against this Sentinel and resets its calibration due date.
      </p>
      ${OpsModal.field('Notes', 'detail', 'textarea', '', { required: false, placeholder: 'What was calibrated, and against what reference' })}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: 'Record', primary: true, onclick: `OpsSensors.confirmCalibrate('${sensorId}')` },
    ]);
  }

  async function confirmCalibrate(sensorId) {
    const f = OpsModal.getFormData();
    OpsModal.setLoading(true);
    try {
      await OpsModal.apiPost(`/monitoring/sensors/${sensorId}/events`, {
        event_type: 'calibration', detail: f.detail || 'Field calibration',
      });
      OpsModal.close();
      OpsModal.toast('Calibration recorded.', 'success');
      await load();
    } catch (err) {
      OpsModal.setLoading(false);
      OpsModal.toast(err.message || 'Failed to record calibration', 'error');
    }
  }

  // a coverage tag drills through to the asset's parent property network
  async function openAsset(assetId) {
    try {
      const r = await OpsModal.apiGet('/properties/assets');
      const asset = (r.data || []).find(a => a.property_id === assetId);
      if (asset && asset.parent_property_id) { OpsNetwork.open(asset.parent_property_id); return; }
      OpsModal.toast('This asset is not attached to a property yet.', 'error');
    } catch (_) { OpsModal.toast('Could not open the asset', 'error'); }
  }

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function setFilter(f) { _filter = f; draw(); }
  function setQuery(q) { _q = q; draw(); }

  return { render, setFilter, setQuery, coverage, saveCoverage, history, calibrate, confirmCalibrate, openAsset };
})();
