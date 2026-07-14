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
  let _pg = null;

  async function render(container) {
    container.innerHTML = `
      <style>
        .sn-kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-bottom:14px; }
        .sn-kpis .ck { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:14px 16px; box-shadow:var(--sh-xs); min-width:0; }
        .sn-kpis .ck-label { font-size:var(--fs-2xs); font-weight:500; color:var(--ink-2); line-height:1.25; }
        .sn-kpis .ck-val { font-family:var(--ff-b); font-size:var(--fs-2xl); font-weight:700; color:var(--ink); margin-top:5px; line-height:1.15; letter-spacing:-.5px; }
        .sn-kpis .ck-sub { font-size:var(--fs-xs); color:var(--ink-3); margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .sn-kpis .ck-sub.ok { color:var(--ok); } .sn-kpis .ck-sub.warn { color:var(--warn); } .sn-kpis .ck-sub.err { color:var(--err); }

        .sn-toolbar { display:flex; gap:9px; align-items:center; margin-bottom:12px; flex-wrap:wrap; }
        .sn-chip { padding:6px 13px; border-radius:100px; border:1px solid var(--border-2); background:var(--surface); font-size:var(--fs-xs); font-weight:600; color:var(--ink-2); cursor:pointer; user-select:none; }
        .sn-chip.on { background:var(--neon-trace); border-color:var(--blue-dim); color:var(--blue-hi); }
        .sn-search { display:flex; align-items:center; gap:7px; background:var(--surface); border:1px solid var(--border-2); border-radius:9px; padding:7px 12px; width:220px; color:var(--ink-3); margin-left:auto; }
        .sn-search input { flex:1; min-width:0; background:transparent; border:none; outline:none; color:var(--ink); font-size:var(--fs-sm); font-family:var(--ff-b); }

        /* Dense fleet table — built to stay scannable at hundreds/thousands of rows */
        .sn-table-wrap { background:var(--surface); border:1px solid var(--border); border-radius:14px; overflow:hidden; box-shadow:var(--sh-xs); }
        .sn-row { cursor:pointer; }
        .sn-row:hover td { background:var(--surface-3); }
        .sn-dev-name { font-size:var(--fs-md); font-weight:700; color:var(--ink); }
        .sn-dev-code { font-family:var(--ff-m); font-size:var(--fs-2xs); color:var(--ink-3); margin-top:2px; }
        .sn-vit { font-family:var(--ff-m); font-size:var(--fs-base); font-weight:600; white-space:nowrap; }
        .sn-cov-count { font-size:var(--fs-base); color:var(--ink-2); }
        .sn-cov-count.warn { color:var(--warn); font-weight:600; }

        /* Detail modal (opened on row click) */
        .snd-section-title { font-size:var(--fs-xs); font-weight:700; letter-spacing:1px; text-transform:uppercase; color:var(--ink-3); margin:18px 0 8px; }
        .snd-section-title:first-child { margin-top:0; }
        .snd-read { display:flex; flex-wrap:wrap; gap:6px; }
        .rd { display:flex; align-items:center; gap:5px; padding:4px 9px; border-radius:7px; background:var(--surface-2); border:1px solid var(--border); font-size:var(--fs-2xs); color:var(--ink-2); white-space:nowrap; }
        .rd b { font-family:var(--ff-m); color:var(--ink); font-weight:600; }
        .rd.off { opacity:.45; }
        .cov-list { display:flex; flex-wrap:wrap; gap:5px; }
        .cov-tag { cursor:pointer; font-family:var(--ff-b); display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:100px; background:var(--neon-trace); border:1px solid var(--blue-dim); font-size:var(--fs-2xs); color:var(--blue-hi); white-space:nowrap; }
        .cov-tag:hover { border-color:var(--ink-2); }
        .cov-tag.pri { background:var(--ok-bg); border-color:var(--ok); color:var(--ok); font-weight:700; }
        .cov-none { font-size:var(--fs-xs); color:var(--warn); }

        .sn-empty { padding:40px; text-align:center; color:var(--ink-3); font-size:var(--fs-base); background:var(--surface); border:1px solid var(--border); border-radius:14px; }
        .sn-note { padding:11px 14px; border-radius:10px; background:var(--wb); color:var(--warn); font-size:var(--fs-sm); margin-bottom:12px; line-height:1.5; }
      </style>
      <div class="sn-kpis" id="sn-kpis"></div>
      <div class="sn-toolbar" id="sn-toolbar"></div>
      <div id="sn-note-slot"></div>
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

    document.getElementById('sn-note-slot').innerHTML = (silent === total && total)
      ? '<div class="sn-note"><b>No Sentinel is reporting telemetry.</b> Devices are registered and their vitals are on record, but no readings have reached the platform — level, flow and silt stay empty until the nodes start posting.</div>'
      : '';

    if (!rows.length) {
      el.innerHTML = `<div class="sn-empty">${total ? 'No Sentinels match this filter.' : 'No Sentinels deployed yet.'}</div>`;
      _pg = null;
      return;
    }

    _pg = FGPaginator.create(rows, { pageSize: 25, containerId: 'sn-body' });
    _pg.render(renderTable);
  }

  function statusBadge(status) {
    const m = { active: 'nominal', maintenance: 'watch' };
    const lbl = { active: 'Online', maintenance: 'Maintenance' };
    return `<span class="status-badge ${m[status] || 'critical'}">${lbl[status] || 'Offline'}</span>`;
  }

  function vitColor(v, invert) {
    if (v == null) return 'var(--ink-4)';
    const bad = invert ? v <= 20 : v >= 80;
    const mid = invert ? v <= 40 : v >= 60;
    return bad ? 'var(--err)' : mid ? 'var(--warn)' : 'var(--ok)';
  }

  function renderTable(rows) {
    const el = document.getElementById('sn-body');
    if (!el) return;
    el.innerHTML = `
      <div class="sn-table-wrap">
        <div style="overflow-x:auto;">
          <table class="ops-table">
            <thead>
              <tr>
                <th>Sentinel</th>
                <th>Status</th>
                <th style="text-align:right;">Battery</th>
                <th style="text-align:right;">Signal</th>
                <th>Last reading</th>
                <th>Coverage</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(x => {
                const beat = rel(x.reading_time || x.last_ping);
                const assets = x.assets || [];
                return `
                <tr class="sn-row" onclick="OpsSensors.viewSensor('${__sid(x.sensor_id)}')">
                  <td>
                    <div class="sn-dev-name">${esc(x.name || x.sensor_id)}</div>
                    <div class="sn-dev-code">${esc(x.sensor_id)}</div>
                  </td>
                  <td>${statusBadge(x.status)}</td>
                  <td class="sn-vit" style="text-align:right;color:${vitColor(x.battery_percent, true)};">${x.battery_percent != null ? x.battery_percent + '%' : '—'}</td>
                  <td class="sn-vit" style="text-align:right;color:${vitColor(x.signal_strength, true)};">${x.signal_strength != null ? x.signal_strength + '%' : '—'}</td>
                  <td class="sn-vit" style="color:${beat ? 'var(--ink-2)' : 'var(--err)'};">${beat || 'never'}</td>
                  <td class="sn-cov-count ${assets.length ? '' : 'warn'}">${assets.length ? `${assets.length} asset${assets.length > 1 ? 's' : ''}` : 'Unassigned'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  // ── Detail modal — every field, at a click, matching the pattern used
  // for clients/properties/field-reports. The table row is for scanning;
  // this is for the one record you actually need to dig into. ──
  function viewSensor(sensorId) {
    const x = _all.find(s => s.sensor_id === sensorId);
    if (!x) return;

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

    OpsModal.open(esc(x.name || x.sensor_id), `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="ops-modal-detail"><span class="label">Sensor ID</span><span class="value">${esc(x.sensor_id)}</span></div>
        <div class="ops-modal-detail"><span class="label">Status</span><span class="value">${statusBadge(x.status)}</span></div>
        <div class="ops-modal-detail"><span class="label">Battery</span><span class="value" style="color:${vitColor(x.battery_percent, true)};">${x.battery_percent != null ? x.battery_percent + '%' : '—'}</span></div>
        <div class="ops-modal-detail"><span class="label">Signal</span><span class="value" style="color:${vitColor(x.signal_strength, true)};">${x.signal_strength != null ? x.signal_strength + '%' : '—'}</span></div>
        <div class="ops-modal-detail"><span class="label">Last reading</span><span class="value" style="color:${beat ? 'var(--ink)' : 'var(--err)'};">${beat || 'never'}</span></div>
        <div class="ops-modal-detail"><span class="label">Device variant</span><span class="value">${x.device_variant ? esc(x.device_variant.replace(/_/g, ' ')) : '—'}</span></div>
        <div class="ops-modal-detail"><span class="label">Firmware</span><span class="value">${x.firmware_version ? esc(x.firmware_version) : '—'}</span></div>
        <div class="ops-modal-detail"><span class="label">Link type</span><span class="value">${x.link_type ? esc(x.link_type) : '—'}</span></div>
        <div class="ops-modal-detail"><span class="label">Client</span><span class="value">${x.client_name ? esc(x.client_name) : '—'}</span></div>
      </div>

      <div class="snd-section-title">Readings</div>
      <div class="snd-read">
        ${reading(cap.water_level !== false, 'Level', x.level != null ? Math.round(x.level) : null, '%')}
        ${reading(cap.flow_rate !== false, 'Flow', x.flow_rate != null ? x.flow_rate.toFixed(1) : null, ' L/s')}
        ${reading(!!cap.silt, 'Silt', x.silt_depth_mm, ' mm')}
        ${reading(!!cap.rain_gauge, 'Rain', x.rainfall_mm, ' mm')}
        ${reading(!!cap.water_quality, 'pH', x.water_quality_ph, '')}
        ${reading(!!cap.enzyme_dispenser, 'Enzyme', x.enzyme_level_percent != null ? Math.round(x.enzyme_level_percent) : null, '%')}
        ${x.debris_detected ? '<span class="rd" style="color:var(--caut);border-color:var(--caut)">Debris</span>' : ''}
      </div>

      <div class="snd-section-title">Monitors${assets.length ? ` · ${assets.length} asset${assets.length > 1 ? 's' : ''}` : ''}</div>
      <div class="cov-list">${cov}</div>
    `, [
      { label: 'Close', onclick: 'OpsModal.close()' },
      { label: 'Coverage', onclick: `OpsSensors.coverage('${sensorId}')` },
      { label: 'History', onclick: `OpsSensors.history('${sensorId}')` },
      { label: 'Calibrate', class: 'btn-primary', onclick: `OpsSensors.calibrate('${sensorId}')` },
    ]);
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
      <p style="margin:0 0 12px;font-size:var(--fs-base);color:var(--ink-3);line-height:1.5">
        Tick every asset this Sentinel monitors. Mark one as <b>primary</b> — the asset the device is physically installed on.
      </p>
      <div style="max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:10px">
        ${assets.map(a => `
          <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--border)">
            <input type="checkbox" name="cov" value="${a.property_id}" ${covered.has(a.property_id) ? 'checked' : ''}>
            <span style="flex:1;min-width:0">
              <span style="font-size:var(--fs-sm);font-weight:600;color:var(--ink)">${esc(a.asset_code || a.property_name)}</span>
              <span style="display:block;font-size:var(--fs-2xs);color:var(--ink-3)">${(a.property_type || '').replace(/_/g, ' ')}${a.parent_name ? ' · ' + esc(a.parent_name) : ''}</span>
            </span>
            <label style="display:flex;align-items:center;gap:5px;font-size:var(--fs-2xs);color:var(--ink-3);white-space:nowrap">
              <input type="radio" name="primary" value="${a.property_id}" ${primary && primary.property_id === a.property_id ? 'checked' : ''}> primary
            </label>
          </div>`).join('')}
      </div>
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: 'Save coverage', class: 'btn-primary', onclick: `OpsSensors.saveCoverage('${sensorId}')` },
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
      '<div style="padding:20px;color:var(--ink-3);font-size:var(--fs-base)">Loading…</div>',
      [{ label: 'Close', onclick: 'OpsModal.close()' }]);
    try {
      const r = await OpsModal.apiGet(`/monitoring/sensors/${sensorId}/events`);
      const evts = r.data || [];
      const body = document.querySelector('.ops-modal-body');
      if (!body) return;
      body.innerHTML = evts.length
        ? `<div>${evts.map(e => `
            <div style="display:flex;gap:10px;padding:10px 2px;border-bottom:1px solid var(--border)">
              <span style="font-size:var(--fs-2xs);font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:var(--blue-hi);min-width:102px">${(e.event_type || '').replace(/_/g, ' ')}</span>
              <span style="flex:1;min-width:0;font-size:var(--fs-sm);color:var(--ink-2)">${esc(e.detail || '—')}</span>
              <span style="font-family:var(--ff-m);font-size:var(--fs-2xs);color:var(--ink-3);white-space:nowrap">${new Date(e.occurred_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
            </div>`).join('')}</div>`
        : '<div style="padding:22px;text-align:center;color:var(--ink-3);font-size:var(--fs-base)">No recorded history for this device yet.</div>';
    } catch (_) {}
  }

  function calibrate(sensorId) {
    OpsModal.open('Record calibration', `
      <p style="margin:0 0 12px;font-size:var(--fs-base);color:var(--ink-3);line-height:1.5">
        Logs a calibration against this Sentinel and resets its calibration due date.
      </p>
      ${OpsModal.field('Notes', 'detail', 'textarea', '', { required: false, placeholder: 'What was calibrated, and against what reference' })}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: 'Record', class: 'btn-primary', onclick: `OpsSensors.confirmCalibrate('${sensorId}')` },
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

  return { render, setFilter, setQuery, viewSensor, coverage, saveCoverage, history, calibrate, confirmCalibrate, openAsset };
})();
