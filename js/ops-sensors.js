/* ══════════════════════════════════════════════════════════════
   FlowGuard Ops — SENTINEL DEVICES
   Rebuilt to match the Figma "Sentinel Devices" screen exactly:
   4-card fleet header (Total/Online/Degraded/Offline), a dense
   NODE ID/ESTATE/FIRMWARE/BATTERY/SIGNAL/TEMP/LAST SEEN/HEALTH/
   ACTIONS table, and a right-side slide-over detail drawer (not a
   full-page swap) with a metric list and an action list.
   Colors use the app's existing theme tokens (var(--ok)/--warn/
   --err/--blue-hi/--surface/--border/...) so light/dark theming
   still works — the Figma file is dark-only, this app isn't.
   ══════════════════════════════════════════════════════════════ */
const OpsSensors = (function () {
  const canMng = () => !(window.Auth && Auth.can) || Auth.can('devices.manage');
  const __sid = v => String(v == null ? '' : v).replace(/[^A-Za-z0-9_\-.:]/g, '');

  let _all = [];
  let _filter = 'all';
  let _q = '';
  let _pg = null;
  let _container = null;
  let _selected = new Set();
  let _filteredRows = [];
  let _drawerId = null;

  const ICON = {
    cpu:  '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/>',
    wifi: '<path d="M5 13a10 10 0 0114 0"/><path d="M8.5 16.5a5 5 0 017 0"/><path d="M12 20h.01"/>',
    pulse:'<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    wifiOff: '<path d="M1 1l22 22"/><path d="M16.72 11.06A10.94 10.94 0 0119 12.55"/><path d="M5 12.55a10.94 10.94 0 015.17-2.39"/><path d="M10.71 5.05A16 16 0 0122.58 9"/><path d="M1.42 9a15.91 15.91 0 014.7-2.88"/><path d="M8.53 16.11a6 6 0 016.95 0"/><path d="M12 20h.01"/>',
  };

  const STYLES = `
    <style>
      .sn-toolbar { display:flex; gap:9px; align-items:center; margin-bottom:12px; flex-wrap:wrap; }
      .sn-chip { padding:6px 13px; border-radius:100px; border:1px solid var(--border-2); background:var(--surface); font-size:var(--fs-xs); font-weight:600; color:var(--ink-2); cursor:pointer; user-select:none; }
      .sn-chip.on { background:var(--neon-trace); border-color:var(--blue-dim); color:var(--blue-hi); }
      .sn-search { display:flex; align-items:center; gap:7px; background:var(--surface); border:1px solid var(--border-2); border-radius:9px; padding:7px 12px; width:220px; color:var(--ink-3); margin-left:auto; }
      .sn-search input { flex:1; min-width:0; background:transparent; border:none; outline:none; color:var(--ink); font-size:var(--fs-sm); font-family:var(--ff-b); }
      .sn-add-btn { display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border-radius:9px; border:none; background:var(--blue-hi); color:#04202b; font-size:var(--fs-sm); font-weight:700; font-family:var(--ff-b); cursor:pointer; }

      .sn-table-wrap { background:var(--surface); border:1px solid var(--border); border-radius:14px; overflow:hidden; box-shadow:var(--sh-xs); }
      .sn-fleet-head { display:flex; align-items:center; justify-content:space-between; padding:14px 18px; border-bottom:1px solid var(--border); }
      .sn-fleet-title { font-family:var(--ff-d); font-size:var(--fs-md); font-weight:700; color:var(--ink); }
      .sn-row { cursor:pointer; }
      .sn-row:hover td { background:var(--surface-3); }
      .sn-node-id { font-family:var(--ff-m); font-weight:700; color:var(--blue-hi); white-space:nowrap; }
      .sn-fw { font-family:var(--ff-m); font-size:var(--fs-sm); }
      .sn-fw.outdated { color:var(--warn); font-weight:600; }
      .sn-fw.current { color:var(--ink-3); }
      .sn-vitcell { display:flex; align-items:center; gap:8px; white-space:nowrap; }
      .sn-bar { display:inline-block; width:46px; height:3px; border-radius:2px; background:var(--surface-3); overflow:hidden; flex-shrink:0; }
      .sn-bar i { display:block; height:100%; border-radius:2px; }
      .sn-vit-v { font-family:var(--ff-m); font-size:var(--fs-sm); font-weight:600; min-width:32px; text-align:right; }
      .sn-temp { font-family:var(--ff-m); font-size:var(--fs-sm); color:var(--ink-2); }
      .sn-last { font-family:var(--ff-m); font-size:var(--fs-sm); }
      .hbadge { display:inline-block; padding:3px 10px; border-radius:100px; font-size:var(--fs-2xs); font-weight:700; font-family:var(--ff-m); text-transform:lowercase; }
      .hbadge.healthy { background:var(--ok-bg); color:var(--ok); }
      .hbadge.degraded { background:var(--wb); color:var(--warn); }
      .hbadge.offline { background:var(--eb); color:var(--err); }
      .sn-acts { display:flex; align-items:center; gap:6px; }
      .sn-ota-btn { padding:4px 12px; border-radius:100px; border:none; background:var(--blue-hi); color:#04202b; font-size:var(--fs-2xs); font-weight:800; letter-spacing:.4px; font-family:var(--ff-m); cursor:pointer; }
      .sn-icon-btn { width:26px; height:26px; border-radius:8px; border:1px solid var(--border-2); background:var(--surface); color:var(--ink-3); display:inline-flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; }
      .sn-icon-btn:hover { border-color:var(--blue-dim); color:var(--blue-hi); }
      .sn-cmd-badge { display:inline-flex; align-items:center; justify-content:center; min-width:15px; height:15px; padding:0 4px; border-radius:100px; background:var(--wb); color:var(--warn); font-size:9px; font-weight:800; margin-left:5px; vertical-align:middle; }

      .sn-bulkbar { display:none; align-items:center; gap:9px; padding:9px 13px; margin-bottom:10px; background:var(--neon-trace); border:1px solid var(--blue-dim); border-radius:11px; flex-wrap:wrap; }
      .sn-bulk-count { font-size:var(--fs-sm); font-weight:700; color:var(--blue-hi); margin-right:4px; }
      .sn-bulk-clear { margin-left:auto; background:none; border:none; color:var(--ink-3); font-size:var(--fs-xs); font-weight:600; cursor:pointer; padding:4px 6px; }
      .sn-bulk-clear:hover { color:var(--ink); }

      .sn-empty { padding:40px; text-align:center; color:var(--ink-3); font-size:var(--fs-base); background:var(--surface); border:1px solid var(--border); border-radius:14px; }
      .sn-note { padding:11px 14px; border-radius:10px; background:var(--wb); color:var(--warn); font-size:var(--fs-sm); margin-bottom:12px; line-height:1.5; }

      /* ── Right-side detail drawer (matches Figma: slide-over, not a
         full-page swap) — appended to <body> so it isn't clipped by the
         table's horizontal scroll container. ── */
      .sn-drawer-overlay { position:fixed; inset:0; z-index:2000; background:rgba(4,12,18,0); pointer-events:none; transition:background .22s; }
      .sn-drawer-overlay.open { background:rgba(4,12,18,.45); pointer-events:auto; }
      .sn-drawer { position:absolute; top:0; right:0; bottom:0; width:380px; max-width:92vw; background:var(--surface); border-left:1px solid var(--border); box-shadow:-8px 0 30px rgba(0,0,0,.25); transform:translateX(100%); transition:transform .24s cubic-bezier(.22,1,.36,1); display:flex; flex-direction:column; }
      .sn-drawer-overlay.open .sn-drawer { transform:translateX(0); }
      .sn-drawer-head { padding:18px 20px 14px; border-bottom:1px solid var(--border); display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
      .sn-drawer-title { font-family:var(--ff-d); font-size:var(--fs-lg); font-weight:800; color:var(--ink); }
      .sn-drawer-sub { font-size:var(--fs-xs); color:var(--ink-3); margin-top:2px; }
      .sn-drawer-close { background:none; border:none; color:var(--ink-3); cursor:pointer; padding:4px; flex-shrink:0; }
      .sn-drawer-close:hover { color:var(--ink); }
      .sn-drawer-body { flex:1; overflow-y:auto; padding:16px 20px 20px; }
      .sn-drawer-status { margin-bottom:14px; }
      .sn-metric-row { display:flex; align-items:center; justify-content:space-between; padding:9px 12px; background:var(--surface-2); border-radius:9px; margin-bottom:6px; }
      .sn-metric-k { font-size:var(--fs-xs); color:var(--ink-3); }
      .sn-metric-v { font-family:var(--ff-m); font-size:var(--fs-sm); font-weight:700; }
      .sn-fw-row { display:flex; align-items:center; justify-content:space-between; padding:9px 12px; background:var(--surface-2); border-radius:9px; margin:12px 0 4px; }
      .sn-fw-badge { padding:2px 9px; border-radius:100px; background:var(--wb); color:var(--warn); font-size:var(--fs-2xs); font-weight:700; }
      .sn-acts-h { font-size:var(--fs-2xs); font-weight:700; letter-spacing:1px; text-transform:uppercase; color:var(--ink-3); margin:18px 0 8px; }
      .sn-act-row { display:flex; align-items:center; gap:10px; width:100%; padding:9px 4px; background:none; border:none; text-align:left; font-size:var(--fs-sm); font-weight:600; color:var(--ink-2); cursor:pointer; font-family:var(--ff-b); border-radius:8px; }
      .sn-act-row:hover { background:var(--surface-2); color:var(--blue-hi); }
      .sn-act-row.danger { color:var(--err); }
      .sn-act-row.danger:hover { background:var(--eb); }
      .sn-act-row svg { flex-shrink:0; }
    </style>`;

  async function render(container) {
    _container = container;
    _drawerId = null;
    _container.innerHTML = STYLES + shellHTML();
    await load();
  }

  function shellHTML() {
    return `
      <div class="fg-page-header">
        <div>
          <div class="fg-page-title">Sentinel Devices</div>
          <div class="fg-page-sub" id="sn-page-sub">Fleet management</div>
        </div>
      </div>
      <div id="sn-kpis"></div>
      <div id="sn-note-slot"></div>
      <div class="lv-wrap">
        <div class="lv-toolbar" id="sn-toolbar"></div>
        <div class="sn-bulkbar" id="sn-bulkbar" style="margin:0 20px 10px;"></div>
        <div id="sn-body"><div class="sn-empty">Loading the Sentinel fleet…</div></div>
      </div>
    `;
  }

  async function load() {
    try {
      const r = await OpsModal.apiGet('/monitoring/sensors/all');
      _all = r.data || [];
      draw();
    } catch (err) {
      if (_container) _container.innerHTML = STYLES + `<div class="sn-empty">Couldn't load the fleet — ${esc(err.message || 'network error')}.</div>`;
    }
  }

  function rel(ts) {
    if (!ts) return null;
    const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (m < 1) return 'now';
    if (m < 60) return m + 'm ago';
    if (m < 1440) return Math.floor(m / 60) + 'h ago';
    return Math.floor(m / 1440) + 'd ago';
  }

  // "online" = active status AND telemetry within 6h — the same freshness
  // window already established elsewhere in this app, not a new number.
  function healthTier(x) {
    const beat = x.reading_time || x.last_ping;
    const stale = !beat || (Date.now() - new Date(beat).getTime()) > 6 * 3600 * 1000;
    if (x.status !== 'active' || stale) return 'offline';
    const lowBatt = x.battery_percent != null && x.battery_percent < 50;
    const lowSig = x.signal_strength != null && x.signal_strength < 70;
    if (lowBatt || lowSig) return 'degraded';
    return 'healthy';
  }

  // water level is the inverse polarity of battery/signal — HIGH is the
  // danger direction, so this can't reuse OpsModal.vitalColor().
  function levelColor(v) {
    if (v == null) return 'var(--ink-4)';
    if (v >= 70) return 'var(--err)';
    if (v >= 50) return 'var(--warn)';
    return 'var(--ok)';
  }

  // The Property a node belongs to. Prefer the resolved customer property;
  // fall back to its primary asset or zone. NEVER the estate-account name.
  function propertyOf(x) {
    return x.property_name || (x.primary_asset && x.primary_asset.name) || x.zone || '—';
  }

  // "outdated" firmware = doesn't match the fleet's most common version —
  // derived from real data, not a fabricated "latest release" reference.
  function fleetFirmware(rows) {
    const counts = {};
    rows.forEach(x => { if (x.firmware_version) counts[x.firmware_version] = (counts[x.firmware_version] || 0) + 1; });
    let best = null, bestN = 0;
    Object.entries(counts).forEach(([v, n]) => { if (n > bestN) { best = v; bestN = n; } });
    return best;
  }

  function draw() { drawList(); }

  function drawList() {
    if (!_container) return;
    if (!document.getElementById('sn-kpis')) _container.innerHTML = STYLES + shellHTML();

    const el = document.getElementById('sn-body');
    const kp = document.getElementById('sn-kpis');
    const tb = document.getElementById('sn-toolbar');
    const sub = document.getElementById('sn-page-sub');
    if (!el) return;

    const total = _all.length;
    const tiers = _all.map(healthTier);
    const healthy = tiers.filter(t => t === 'healthy').length;
    const degraded = tiers.filter(t => t === 'degraded').length;
    const offline = tiers.filter(t => t === 'offline').length;
    const online = healthy + degraded;
    const properties = new Set(_all.map(propertyOf).filter(e => e && e !== '—')).size;
    const uptime = total ? Math.round(online / total * 100 * 10) / 10 : 0;
    const commonFw = fleetFirmware(_all);
    const battKnown = _all.some(x => x.battery_percent != null);
    const lowBatt = _all.filter(x => x.battery_percent != null && x.battery_percent < 20).length;
    const unassigned = _all.filter(x => !x.assets || !x.assets.length).length;

    if (sub) sub.textContent = `${total} nodes · ${commonFw ? 'firmware ' + commonFw + ' · ' : ''}fleet management`;

    kp.innerHTML = OpsModal.kpiStrip([
      { icon: ICON.cpu,     color: 'var(--blue-hi)', label: 'Total Nodes', value: total, sub: `Across ${properties} propert${properties === 1 ? 'y' : 'ies'}` },
      { icon: ICON.wifi,    color: 'var(--ok)',      label: 'Online',      value: online, sub: `${uptime}% fleet uptime`, subClass: 'ok' },
      { icon: ICON.pulse,   color: 'var(--warn)',    label: 'Degraded',    value: degraded, sub: 'Needs attention', subClass: degraded ? 'warn' : '' },
      { icon: ICON.wifiOff, color: 'var(--err)',     label: 'Offline',     value: offline, sub: 'Requires dispatch', subClass: offline ? 'err' : '' },
    ]);

    const chips = [
      ['all', `All (${total})`], ['healthy', `Healthy (${healthy})`],
      ['degraded', `Degraded (${degraded})`], ['offline', `Offline (${offline})`],
      ['lowbatt', `Low battery (${battKnown ? lowBatt : 0})`],
      ['unassigned', `Unassigned (${unassigned})`],
    ];
    tb.innerHTML = `
      <div class="lv-search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input placeholder="Search Sentinels…" value="${_q.replace(/"/g, '&quot;')}" oninput="OpsSensors.setQuery(this.value)">
      </div>
      <div class="lv-filters">${chips.map(([k, l]) =>
        `<div class="lv-filter ${_filter === k ? 'active' : ''}" onclick="OpsSensors.setFilter('${__sid(k)}')">${l}</div>`).join('')}</div>`;

    let rows = _all.map((x, i) => ({ x, tier: tiers[i] }));
    if (_filter === 'healthy') rows = rows.filter(r => r.tier === 'healthy');
    else if (_filter === 'degraded') rows = rows.filter(r => r.tier === 'degraded');
    else if (_filter === 'offline') rows = rows.filter(r => r.tier === 'offline');
    else if (_filter === 'lowbatt') rows = rows.filter(r => r.x.battery_percent != null && r.x.battery_percent < 20);
    else if (_filter === 'unassigned') rows = rows.filter(r => !r.x.assets || !r.x.assets.length);
    if (_q) {
      const q = _q.toLowerCase();
      rows = rows.filter(r => `${r.x.name || ''} ${r.x.sensor_id || ''} ${propertyOf(r.x)}`.toLowerCase().includes(q));
    }
    rows = rows.map(r => r.x);

    document.getElementById('sn-note-slot').innerHTML = (offline === total && total)
      ? '<div class="sn-note"><b>No Sentinel is reporting telemetry.</b> Devices are registered but no readings have reached the platform yet.</div>'
      : '';

    _filteredRows = rows;
    renderBulkBar();

    if (!rows.length) {
      el.innerHTML = `<div class="sn-empty">${total ? 'No Sentinels match this filter.' : 'No Sentinels deployed yet.'}</div>`;
      _pg = null;
      return;
    }

    _pg = FGPaginator.create(rows, { pageSize: 25, containerId: 'sn-body' });
    _pg.render(rs => renderTable(rs, commonFw));
  }

  // ── Bulk selection + remote command dispatch ──
  function renderBulkBar() {
    const bar = document.getElementById('sn-bulkbar');
    if (!bar) return;
    if (!_selected.size) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
    bar.style.display = 'flex';
    bar.innerHTML = `
      <span class="sn-bulk-count">${_selected.size} selected</span>
      ${canMng() ? `<button class="btn-ghost" onclick="OpsSensors.bulkCommand('firmware_update')">Push firmware</button>
      <button class="btn-ghost" onclick="OpsSensors.bulkCommand('reset')">Remote reset</button>
      <button class="btn-ghost" onclick="OpsSensors.bulkCommand('recalibrate')">Request recalibration</button>` : ''}
      <button class="sn-bulk-clear" onclick="OpsSensors.clearSelection()">Clear</button>
    `;
  }

  function toggleSelect(id, checked) {
    if (checked) _selected.add(id); else _selected.delete(id);
    renderBulkBar();
  }

  function toggleSelectAll(checked) {
    _filteredRows.forEach(x => { if (checked) _selected.add(x.sensor_id); else _selected.delete(x.sensor_id); });
    if (_pg) _pg.render(rs => renderTable(rs, fleetFirmware(_all)));
    renderBulkBar();
  }

  function clearSelection() {
    _selected.clear();
    if (_pg) _pg.render(rs => renderTable(rs, fleetFirmware(_all)));
    renderBulkBar();
  }

  function bulkCommand(type) {
    if (!_selected.size) return;
    const ids = Array.from(_selected);
    const verb = { firmware_update: 'Push a firmware update to', reset: 'Send a remote reset to', recalibrate: 'Request recalibration on' }[type];
    const needsVersion = type === 'firmware_update';
    OpsModal.open(`${type === 'firmware_update' ? 'Push firmware' : type === 'reset' ? 'Remote reset' : 'Request recalibration'} — ${ids.length} Sentinel${ids.length > 1 ? 's' : ''}`, `
      <p style="margin:0 0 12px;font-size:var(--fs-base);color:var(--ink-3);line-height:1.5">
        ${verb} <b>${ids.length}</b> selected Sentinel${ids.length > 1 ? 's' : ''}. These nodes are store-and-forward — each picks this up on its next check-in, not instantly.
      </p>
      ${needsVersion ? OpsModal.field('Firmware version', 'firmware_version', 'text', '', { required: true, placeholder: 'e.g. 2.4.1' }) : ''}
      ${OpsModal.field('Note (optional)', 'note', 'textarea', '', { required: false, placeholder: 'Reason for this command' })}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: `Queue for ${ids.length}`, class: 'btn-primary', onclick: `OpsSensors.confirmBulkCommand('${type}')` },
    ]);
  }

  async function confirmBulkCommand(type) {
    const f = OpsModal.getFormData();
    if (type === 'firmware_update' && !f.firmware_version) {
      OpsModal.toast('Firmware version is required.', 'error');
      return;
    }
    OpsModal.setLoading(true);
    try {
      const payload = type === 'firmware_update' ? { firmware_version: f.firmware_version } : null;
      const r = await OpsModal.apiPost('/monitoring/sensors/commands/bulk', {
        sensor_ids: Array.from(_selected), command_type: type, payload, note: f.note || null,
      });
      OpsModal.close();
      const n = (r.data && r.data.queued) || _selected.size;
      OpsModal.toast(`Queued for ${n} Sentinel${n > 1 ? 's' : ''} — delivered on each device's next check-in.`, 'success');
      _selected.clear();
      await load();
    } catch (err) {
      OpsModal.setLoading(false);
      OpsModal.toast(err.message || 'Failed to queue command', 'error');
    }
  }

  function renderTable(rows, commonFw) {
    const el = document.getElementById('sn-body');
    if (!el) return;
    const allChecked = rows.length > 0 && _filteredRows.every(x => _selected.has(x.sensor_id));
    el.innerHTML = `
      <div class="lv-scroll">
        <table class="lv-table">
          <thead>
            <tr>
              <th style="width:26px;"><input type="checkbox" ${allChecked ? 'checked' : ''} onclick="OpsSensors.toggleSelectAll(this.checked)" title="Select all matching this filter"></th>
              <th>Node ID</th>
              <th>Property</th>
              <th>Firmware</th>
              <th>Battery</th>
              <th>Signal</th>
              <th>Temp</th>
              <th>Last seen</th>
              <th>Health</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(x => rowHTML(x, commonFw)).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function vitBar(v) {
    const color = OpsModal.vitalColor(v);
    const pct = v == null ? 0 : Math.max(2, v);
    return `<span class="sn-vitcell"><span class="sn-bar"><i style="width:${pct}%;background:${color}"></i></span><span class="sn-vit-v" style="color:${color}">${v != null ? v + '%' : '—'}</span></span>`;
  }

  function rowHTML(x, commonFw) {
    const tier = healthTier(x);
    const beat = rel(x.reading_time || x.last_ping);
    const outdated = commonFw && x.firmware_version && x.firmware_version !== commonFw;
    return `
      <tr class="sn-row clickable" onclick="OpsSensors.viewSensor('${__sid(x.sensor_id)}')">
        <td onclick="event.stopPropagation()"><input type="checkbox" ${_selected.has(x.sensor_id) ? 'checked' : ''} onclick="OpsSensors.toggleSelect('${__sid(x.sensor_id)}', this.checked); event.stopPropagation()"></td>
        <td class="sn-node-id" style="cursor:pointer;" title="Open full details" onclick="event.stopPropagation();OpsSensors.openFull('${__sid(x.sensor_id)}')"><span style="text-decoration:underline;text-decoration-color:var(--border-2);text-underline-offset:2px;">${esc(x.name || x.sensor_id)}</span>${x.pending_commands ? `<span class="sn-cmd-badge" title="${x.pending_commands} command(s) queued">${x.pending_commands}</span>` : ''}</td>
        <td>${esc(propertyOf(x))}</td>
        <td class="sn-fw ${outdated ? 'outdated' : 'current'}">${x.firmware_version ? esc(x.firmware_version) : '—'}</td>
        <td>${vitBar(x.battery_percent)}</td>
        <td>${vitBar(x.signal_strength)}</td>
        <td class="sn-temp">${x.temperature != null ? Math.round(x.temperature) + '°C' : '—'}</td>
        <td class="sn-last" style="color:${beat ? 'var(--ink-2)' : 'var(--err)'}">${beat || 'never'}</td>
        <td><span class="hbadge ${tier}">${tier}</span></td>
        <td class="sn-acts" onclick="event.stopPropagation()">
          <button class="sn-ota-btn" onclick="OpsSensors.sendCommand('${__sid(x.sensor_id)}', 'firmware_update')" title="Push firmware OTA">OTA</button>
          <button class="sn-icon-btn" onclick="OpsSensors.sendCommand('${__sid(x.sensor_id)}', 'reset')" title="Restart node">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          </button>
        </td>
      </tr>`;
  }

  function setFilter(f) { _filter = f; draw(); }
  function setQuery(q) { _q = q; draw(); }

  // ══════════════════════════════════════════════════════════════
  //  RIGHT-SIDE DETAIL DRAWER — matches the Figma slide-over exactly:
  //  header (name + estate), status badge, metric rows, firmware +
  //  update badge, then an ACTIONS list (not buttons in a row).
  // ══════════════════════════════════════════════════════════════
  function viewSensor(sensorId, defaultCommand) {
    _drawerId = sensorId;
    renderDrawer();
    if (defaultCommand) sendCommand(sensorId, defaultCommand);
  }

  function closeDrawer() {
    _drawerId = null;
    const el = document.getElementById('sn-drawer-overlay');
    if (el) { el.classList.remove('open'); setTimeout(() => el.remove(), 220); }
  }

  function renderDrawer() {
    const x = _all.find(s => s.sensor_id === _drawerId);
    if (!x) return;
    let overlay = document.getElementById('sn-drawer-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'sn-drawer-overlay';
      overlay.className = 'sn-drawer-overlay';
      overlay.addEventListener('click', e => { if (e.target === overlay) closeDrawer(); });
      document.body.appendChild(overlay);
    }
    const tier = healthTier(x);
    const commonFw = fleetFirmware(_all);
    const outdated = commonFw && x.firmware_version && x.firmware_version !== commonFw;
    const cap = x.capabilities || {};

    const metric = (on, label, val, unit, color) => {
      if (on === false) return '';
      const has = val != null;
      return `<div class="sn-metric-row"><span class="sn-metric-k">${label}</span><span class="sn-metric-v" style="color:${has ? (color || 'var(--ink)') : 'var(--ink-4)'}">${has ? val + unit : '—'}</span></div>`;
    };

    overlay.innerHTML = `
      <div class="sn-drawer" onclick="event.stopPropagation()">
        <div class="sn-drawer-head">
          <div>
            <div class="sn-drawer-title">${esc(x.name || x.sensor_id)}</div>
            <div class="sn-drawer-sub">${esc(propertyOf(x))}${x.sensor_id !== (x.name || x.sensor_id) ? ' · ' + esc(x.sensor_id) : ''}</div>
          </div>
          <button class="sn-drawer-close" onclick="OpsSensors.closeDrawer()" aria-label="Close">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="sn-drawer-body">
          <div class="sn-drawer-status"><span class="hbadge ${tier}">${tier}</span></div>
          <button class="sn-act-row" style="justify-content:center;font-weight:700;color:var(--blue-hi,#0d7fa0);border:1px solid var(--blue-dim,#7fc8e0);margin-bottom:12px;" onclick="OpsSensors.openFull('${__sid(x.sensor_id)}')">Open full details →</button>

          ${metric(cap.water_level !== false, 'Water Level', x.level != null ? Math.round(x.level) : null, '%', levelColor(x.level))}
          ${metric(cap.flow_rate !== false, 'Flow Rate', x.flow_rate != null ? x.flow_rate.toFixed(1) : null, ' L/s')}
          <div class="sn-metric-row"><span class="sn-metric-k">Battery</span><span class="sn-metric-v" style="color:${OpsModal.vitalColor(x.battery_percent)}">${x.battery_percent != null ? x.battery_percent + '%' : '—'}</span></div>
          <div class="sn-metric-row"><span class="sn-metric-k">Signal</span><span class="sn-metric-v" style="color:${OpsModal.vitalColor(x.signal_strength)}">${x.signal_strength != null ? x.signal_strength + '%' : '—'}</span></div>
          <div class="sn-metric-row"><span class="sn-metric-k">Temperature</span><span class="sn-metric-v" style="color:${x.temperature != null && x.temperature >= 40 ? 'var(--err)' : 'var(--ink)'}">${x.temperature != null ? Math.round(x.temperature) + '°C' : '—'}</span></div>
          ${metric(!!cap.silt, 'Silt depth', x.silt_depth_mm, ' mm')}

          <div class="sn-fw-row">
            <span class="sn-metric-k">Firmware</span>
            <span style="display:flex;align-items:center;gap:8px;">
              <span class="sn-metric-v">${x.firmware_version ? esc(x.firmware_version) : '—'}</span>
              ${outdated ? `<span class="sn-fw-badge">Update available</span>` : ''}
            </span>
          </div>

          <div class="sn-acts-h">Actions</div>
          <button class="sn-act-row" onclick="OpsSensors.sendCommand('${__sid(x.sensor_id)}', 'firmware_update')">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 19V5m0 0l-6 6m6-6l6 6"/></svg>
            Push Firmware OTA
          </button>
          <button class="sn-act-row" onclick="OpsSensors.sendCommand('${__sid(x.sensor_id)}', 'reset')">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            Restart Node
          </button>
          <button class="sn-act-row" onclick="OpsSensors.calibrate('${__sid(x.sensor_id)}')">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
            Run Calibration
          </button>
          <button class="sn-act-row" onclick="OpsSensors.commandHistory('${__sid(x.sensor_id)}')">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            Command History
          </button>
          <button class="sn-act-row" onclick="OpsSensors.history('${__sid(x.sensor_id)}')">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2"/></svg>
            View Diagnostics Log
          </button>
          <button class="sn-act-row" onclick="OpsSensors.coverage('${__sid(x.sensor_id)}')">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            Manage Coverage
          </button>
          <button class="sn-act-row danger" onclick="OpsSensors.decommission('${__sid(x.sensor_id)}')">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9.5 4L10 3h4l.5 1M4 7h16"/></svg>
            Decommission Node
          </button>
        </div>
      </div>`;

    requestAnimationFrame(() => overlay.classList.add('open'));
  }

  // decommission logs a real device_events entry (event_type already
  // supports 'decommission' — nothing fabricated) and marks intent clearly
  // since it's destructive.
  function decommission(sensorId) {
    const x = _all.find(s => s.sensor_id === sensorId);
    OpsModal.confirm(`Decommission ${esc(x ? (x.name || sensorId) : sensorId)}? This logs the node as retired.`, async () => {
      OpsModal.setLoading(true);
      try {
        await OpsModal.apiPost(`/monitoring/sensors/${sensorId}/events`, { event_type: 'decommission', detail: 'Decommissioned from Sentinel Devices' });
        OpsModal.close();
        OpsModal.toast('Node marked as decommissioned.', 'success');
        closeDrawer();
        await load();
      } catch (err) {
        OpsModal.setLoading(false);
        OpsModal.toast(err.message || 'Failed to decommission node', 'error');
      }
    });
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
    OpsModal.open(`Diagnostics log — ${esc(node ? (node.name || sensorId) : sensorId)}`,
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
        Logs a calibration against this Sentinel and resets its calibration due date. To remotely request the device recalibrate itself, use "Run Calibration" via a queued command instead.
      </p>
      ${OpsModal.field('Notes', 'detail', 'textarea', '', { required: false, placeholder: 'What was calibrated, and against what reference' })}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: 'Record', class: 'btn-ghost', onclick: `OpsSensors.confirmCalibrate('${sensorId}')` },
      { label: 'Queue remote recalibration', class: 'btn-primary', onclick: `OpsModal.close();OpsSensors.sendCommand('${sensorId}','recalibrate')` },
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

  // ── Remote command: OTA push, reset, recalibrate — queued, delivered
  // on the device's next check-in (store-and-forward, no open socket). ──
  function sendCommand(sensorId, presetType) {
    const node = _all.find(x => x.sensor_id === sensorId);
    const type = presetType || 'firmware_update';
    OpsModal.open(`Send command — ${esc(node ? (node.name || sensorId) : sensorId)}`, `
      <p style="margin:0 0 12px;font-size:var(--fs-base);color:var(--ink-3);line-height:1.5">
        This Sentinel is store-and-forward — the command is queued here and delivered on its next check-in, not instantly.
      </p>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">
        <label style="display:flex;align-items:center;gap:8px;font-size:var(--fs-sm);color:var(--ink-2);"><input type="radio" name="cmdtype" value="firmware_update" ${type === 'firmware_update' ? 'checked' : ''} onchange="OpsSensors._toggleFwField()"> Push firmware update</label>
        <label style="display:flex;align-items:center;gap:8px;font-size:var(--fs-sm);color:var(--ink-2);"><input type="radio" name="cmdtype" value="reset" ${type === 'reset' ? 'checked' : ''} onchange="OpsSensors._toggleFwField()"> Remote reset</label>
        <label style="display:flex;align-items:center;gap:8px;font-size:var(--fs-sm);color:var(--ink-2);"><input type="radio" name="cmdtype" value="recalibrate" ${type === 'recalibrate' ? 'checked' : ''} onchange="OpsSensors._toggleFwField()"> Request recalibration</label>
      </div>
      <div id="sn-fw-field" style="${type === 'firmware_update' ? '' : 'display:none;'}">${OpsModal.field('Firmware version', 'firmware_version', 'text', '', { required: true, placeholder: 'e.g. 2.4.1' })}</div>
      ${OpsModal.field('Note (optional)', 'note', 'textarea', '', { required: false, placeholder: 'Reason for this command' })}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: 'Queue command', class: 'btn-primary', onclick: `OpsSensors.confirmSendCommand('${sensorId}')` },
    ]);
  }

  function _toggleFwField() {
    const checked = document.querySelector('input[name="cmdtype"]:checked');
    const slot = document.getElementById('sn-fw-field');
    if (!slot) return;
    slot.style.display = checked && checked.value === 'firmware_update' ? '' : 'none';
  }

  async function confirmSendCommand(sensorId) {
    const checked = document.querySelector('input[name="cmdtype"]:checked');
    const type = checked ? checked.value : 'reset';
    const f = OpsModal.getFormData();
    if (type === 'firmware_update' && !f.firmware_version) {
      OpsModal.toast('Firmware version is required.', 'error');
      return;
    }
    OpsModal.setLoading(true);
    try {
      await OpsModal.apiPost(`/monitoring/sensors/${sensorId}/commands`, {
        command_type: type,
        payload: type === 'firmware_update' ? { firmware_version: f.firmware_version } : null,
        note: f.note || null,
      });
      OpsModal.close();
      OpsModal.toast("Command queued — delivered on the device's next check-in.", 'success');
      await load();
      if (_drawerId === sensorId) renderDrawer();
    } catch (err) {
      OpsModal.setLoading(false);
      OpsModal.toast(err.message || 'Failed to queue command', 'error');
    }
  }

  async function commandHistory(sensorId) {
    const node = _all.find(x => x.sensor_id === sensorId);
    OpsModal.open(`Commands — ${esc(node ? (node.name || sensorId) : sensorId)}`,
      '<div style="padding:20px;color:var(--ink-3);font-size:var(--fs-base)">Loading…</div>',
      [{ label: 'Close', onclick: 'OpsModal.close()' }]);
    try {
      const r = await OpsModal.apiGet(`/monitoring/sensors/${sensorId}/commands`);
      const cmds = r.data || [];
      const body = document.querySelector('.ops-modal-body');
      if (!body) return;
      const statusColor = { queued: 'var(--warn)', delivered: 'var(--blue-hi)', acknowledged: 'var(--ok)', failed: 'var(--err)', cancelled: 'var(--ink-3)' };
      body.innerHTML = cmds.length
        ? `<div>${cmds.map(c => `
            <div style="display:flex;gap:10px;align-items:center;padding:10px 2px;border-bottom:1px solid var(--border)">
              <span style="font-size:var(--fs-2xs);font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:${statusColor[c.status] || 'var(--ink-3)'};min-width:96px">${esc(c.status)}</span>
              <span style="flex:1;min-width:0;font-size:var(--fs-sm);color:var(--ink-2)">${esc((c.command_type || '').replace(/_/g, ' '))}${c.payload && c.payload.firmware_version ? ` → v${esc(c.payload.firmware_version)}` : ''}${c.note ? ' — ' + esc(c.note) : ''}</span>
              <span style="font-family:var(--ff-m);font-size:var(--fs-2xs);color:var(--ink-3);white-space:nowrap">${OpsModal.fmtDate(c.created_at)}</span>
              ${c.status === 'queued' ? `<button class="btn-ghost" style="padding:3px 9px;font-size:var(--fs-2xs);" onclick="OpsSensors.cancelCommand('${sensorId}', ${parseInt(c.id, 10)})">Cancel</button>` : ''}
            </div>`).join('')}</div>`
        : '<div style="padding:22px;text-align:center;color:var(--ink-3);font-size:var(--fs-base)">No commands sent to this device yet.</div>';
    } catch (_) {}
  }

  async function cancelCommand(sensorId, commandId) {
    try {
      await OpsModal.apiPost(`/monitoring/sensors/${sensorId}/commands/${commandId}/cancel`, {});
      OpsModal.toast('Command cancelled.', 'success');
      await load();
      commandHistory(sensorId);
    } catch (err) {
      OpsModal.toast(err.message || 'Failed to cancel', 'error');
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

  // ══════════════════════════════════════════════════════════════
  //  FULL DETAIL PAGE — the primary detail view for a Sentinel.
  //  (The slide-over drawer is now the "quick view".) Built on the
  //  shared detailShell so it matches Clients/Properties/Assets/etc.
  // ══════════════════════════════════════════════════════════════
  const SND_CSS = `<style id="snd-css">
    .snd-tele{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
    @media(max-width:760px){.snd-tele{grid-template-columns:repeat(2,1fr);}}
    .snd-tile{background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:12px 14px;}
    .snd-tile .l{font-size:var(--fs-2xs);color:var(--ink-3);margin-bottom:6px;}
    .snd-tile .v{font-size:19px;font-weight:700;font-family:var(--ff-mono,monospace);color:var(--ink);line-height:1.1;}
    .snd-tile .v .u{font-size:11px;color:var(--ink-3);font-family:var(--ff-b);font-weight:500;margin-left:2px;}
    .snd-diag{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);}
    .snd-diag:last-child{border-bottom:none;}
    .snd-diag .l{width:140px;flex-shrink:0;font-size:var(--fs-sm);color:var(--ink-2);}
    .snd-diag .track{flex:1;height:8px;border-radius:5px;background:var(--surface-2);overflow:hidden;}
    .snd-diag .track i{display:block;height:100%;border-radius:5px;}
    .snd-diag .v{width:84px;text-align:right;font-size:var(--fs-sm);font-weight:700;font-family:var(--ff-mono,monospace);flex-shrink:0;color:var(--ink);}
    .snd-cmd,.snd-ev{display:flex;gap:12px;align-items:flex-start;padding:11px 0;border-bottom:1px solid var(--border);}
    .snd-cmd:last-child,.snd-ev:last-child{border-bottom:none;}
    .snd-cmd .st{font-size:var(--fs-2xs);font-weight:700;padding:3px 9px;border-radius:20px;flex-shrink:0;text-transform:capitalize;}
    .snd-cmd .st.queued,.snd-cmd .st.pending{background:var(--surface-2);color:var(--ink-2);}
    .snd-cmd .st.delivered{background:rgba(28,184,232,.12);color:#0d7fa0;}
    .snd-cmd .st.acknowledged,.snd-cmd .st.completed{background:rgba(31,157,91,.12);color:var(--ok);}
    .snd-cmd .st.failed,.snd-cmd .st.cancelled{background:rgba(217,70,60,.12);color:var(--err);}
    .snd-cmd .t,.snd-ev .t{font-size:var(--fs-sm);font-weight:600;color:var(--ink);text-transform:capitalize;}
    .snd-cmd .m,.snd-ev .m{font-size:var(--fs-2xs);color:var(--ink-3);margin-top:2px;}
    .snd-ev .dot{width:9px;height:9px;border-radius:50%;background:var(--blue-hi,#0d7fa0);margin-top:5px;flex-shrink:0;}
  </style>`;

  const _cap = s => s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : s;
  const _ago = d => { if (!d) return '—'; const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000); if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago'; };

  async function openFull(sensorId) {
    if (!_container) return;
    closeDrawer();
    _container.innerHTML = `<div style="padding:60px;text-align:center;color:var(--ink-3);">Loading device…</div>`;
    let x = _all.find(s => s.sensor_id === sensorId);
    if (!x) { try { const r = await OpsModal.apiGet('/monitoring/sensors/all'); _all = r.data || []; x = _all.find(s => s.sensor_id === sensorId); } catch (_) {} }
    if (!x) { _container.innerHTML = `<div style="padding:48px;text-align:center;"><div style="color:var(--err);font-weight:700;margin-bottom:8px;">Device not found</div><button class="fgd-btn" onclick="OpsSensors.back()">← Back to fleet</button></div>`; return; }
    const [events, commands] = await Promise.all([
      OpsModal.apiGet('/monitoring/sensors/' + sensorId + '/events').then(r => r.data || []).catch(() => []),
      OpsModal.apiGet('/monitoring/sensors/' + sensorId + '/commands').then(r => r.data || []).catch(() => []),
    ]);
    renderFull(x, events, commands);
  }

  function back() { if (_container) render(_container); }

  function renderFull(x, events, commands) {
    const F = OpsModal.fact, L = OpsModal.link, E = OpsModal.emptyState;
    const sid = __sid(x.sensor_id);
    const tier = healthTier(x);
    const chipCls = tier === 'healthy' ? 'ok' : tier === 'offline' ? 'danger' : 'warn';
    const last = x.reading_time || x.last_ping;
    const isBio = x.device_variant === 'bio_dispenser';
    const primary = x.primary_asset || (x.assets || []).find(a => a.is_primary) || null;
    const secondary = (x.assets || []).filter(a => !a.is_primary);

    const tile = (l, v, unit, color) => `<div class="snd-tile"><div class="l">${l}</div><div class="v"${color ? ` style="color:${color}"` : ''}>${v == null ? '—' : v}${(v != null && unit) ? `<span class="u">${unit}</span>` : ''}</div></div>`;
    const bar = (l, pct, color) => `<div class="snd-diag"><span class="l">${l}</span><span class="track"><i style="width:${pct != null ? Math.max(0, Math.min(100, pct)) : 0}%;background:${color}"></i></span><span class="v">${pct != null ? Math.round(pct) + '%' : '—'}</span></div>`;
    const drow = (l, v) => `<div class="snd-diag"><span class="l">${l}</span><span style="flex:1"></span><span class="v" style="width:auto;font-family:var(--ff-b);font-weight:600;">${v == null || v === '' ? '—' : v}</span></div>`;

    const overview = `<div class="snd-tele">
      ${tile('Status', _cap(x.status || '—'), '', x.status === 'active' ? 'var(--ok)' : x.status === 'offline' ? 'var(--err)' : 'var(--warn)')}
      ${tile('Last ping', last ? _ago(last) : null, '')}
      ${tile('Firmware', x.firmware_version || null, '')}
      ${tile('Calibration due', x.calibration_due_at ? OpsModal.fmtDate(x.calibration_due_at) : 'On schedule', '')}
    </div>`;

    const tele = `<div class="snd-tele">
      ${tile('Water level', x.level != null ? Math.round(x.level) : null, '%', levelColor(x.level))}
      ${tile('Level (volume)', x.level_liters != null ? Number(x.level_liters).toLocaleString() : null, 'L')}
      ${tile('Inflow rate', x.flow_rate != null ? Number(x.flow_rate).toFixed(1) : null, 'L/s')}
      ${tile('Outflow rate', x.outflow_rate != null ? Number(x.outflow_rate).toFixed(1) : null, 'L/s')}
      ${tile('Temperature', x.temperature != null ? Math.round(x.temperature) : null, '°C')}
      ${tile('Silt depth', x.silt_depth_mm != null ? x.silt_depth_mm : null, 'mm')}
      ${tile('Rainfall', x.rainfall_mm != null ? x.rainfall_mm : null, 'mm')}
      ${tile('Debris detected', x.debris_detected == null ? null : (x.debris_detected ? 'Yes' : 'No'), '', x.debris_detected ? 'var(--warn)' : null)}
      ${tile('Water pH', x.water_quality_ph != null ? x.water_quality_ph : null, '')}
      ${tile('Turbidity', x.turbidity_ntu != null ? x.turbidity_ntu : null, 'NTU')}
    </div>`;

    const diag = `
      ${bar('Battery', x.battery_percent, OpsModal.vitalColor(x.battery_percent))}
      ${bar('Signal strength', x.signal_strength, OpsModal.vitalColor(x.signal_strength))}
      ${bar('Capacity used', x.level, levelColor(x.level))}
      ${isBio ? bar('Enzyme level', x.enzyme_level_percent, x.enzyme_level_percent != null && x.enzyme_level_percent < 20 ? 'var(--err)' : 'var(--ok)') : ''}
      ${drow('Last calibrated', x.last_calibrated_at ? OpsModal.fmtDate(x.last_calibrated_at) : '—')}
      ${isBio ? drow('Cartridge status', x.cartridge_status ? _cap(String(x.cartridge_status).replace(/_/g, ' ')) : '—') : ''}`;

    const install = `
      ${F('Primary asset', primary ? L('assets', primary.property_id, esc(primary.name || primary.property_id)) : '—')}
      ${F('Asset class', primary && primary.asset_class ? _cap(String(primary.asset_class).replace(/_/g, ' ')) : '—')}
      ${F('Property', x.property_ref ? L('properties', x.property_ref, esc(x.property_name || 'Property')) : esc(x.property_name || '—'))}
      ${F('Zone', esc(x.zone || '—'))}
      ${F('Link type', esc(x.link_type || '—'))}
      ${F('Variant', esc((x.device_variant || '—').replace(/_/g, ' ')))}
      ${secondary.length ? F('Secondary coverage', secondary.map(a => L('assets', a.property_id, esc(a.name || a.property_id))).join(', ')) : ''}`;

    const evList = Array.isArray(events) ? events : [];
    const evRow = e => `<div class="snd-ev"><span class="dot"></span><div><div class="t">${esc((e.event_type || 'event').replace(/_/g, ' '))}</div><div class="m">${esc(e.detail || '')}${e.performed_by_name ? ' · ' + esc(e.performed_by_name) : ''} · ${OpsModal.fmtDateTime ? OpsModal.fmtDateTime(e.occurred_at) : esc(e.occurred_at)}</div></div></div>`;
    const maintEv = evList.filter(e => /calibrat|battery|install|repair|swap|mount|decommission/i.test(e.event_type || ''));
    const maintBody = maintEv.length ? maintEv.map(evRow).join('') : E('', 'No maintenance logged', 'Calibration, battery swaps and installs will appear here.');
    const eventsBody = evList.length ? evList.map(evRow).join('') : E('', 'No events yet', 'Device events are recorded here as they happen.');

    const cmdList = Array.isArray(commands) ? commands : [];
    const cmdRow = c => { const st = String(c.status || 'queued').toLowerCase(); return `<div class="snd-cmd"><span class="st ${st}">${st}</span><div><div class="t">${esc((c.command_type || 'command').replace(/_/g, ' '))}</div><div class="m">${c.requested_by_name ? 'by ' + esc(c.requested_by_name) + ' · ' : ''}${OpsModal.fmtDateTime ? OpsModal.fmtDateTime(c.created_at) : esc(c.created_at)}${c.note ? ' · ' + esc(c.note) : ''}</div></div></div>`; };
    const fwBody = `${F('Current firmware', esc(x.firmware_version || '—'))}${cmdList.length ? `<div style="margin-top:12px;">${cmdList.map(cmdRow).join('')}</div>` : `<div style="margin-top:8px;">${E('', 'No commands queued', 'Firmware pushes and other commands appear here.')}</div>`}`;

    const sidebar = `
      <div class="fgd-card"><div class="fgd-card-head"><h2>Quick facts</h2></div>
        ${F('Device ID', `<span class="lv-mono">${esc(x.sensor_id)}</span>`)}
        ${F('Variant', esc((x.device_variant || '—').replace(/_/g, ' ')))}
        ${F('Zone', esc(x.zone || '—'))}
        ${F('Property', x.property_ref ? L('properties', x.property_ref, esc(x.property_name || 'Property')) : esc(x.property_name || '—'))}
        ${F('Firmware', esc(x.firmware_version || '—'))}
        ${F('Battery', x.battery_percent != null ? x.battery_percent + '%' : '—')}
        ${F('Signal', x.signal_strength != null ? x.signal_strength + '%' : '—')}
        ${F('Last ping', last ? _ago(last) : '—')}
      </div>
      ${canMng() ? `<div class="fgd-card"><div class="fgd-card-head"><h2>Actions</h2></div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <button class="fgd-btn" onclick="OpsSensors.sendCommand('${sid}','firmware_update')">Push firmware (OTA)</button>
          <button class="fgd-btn" onclick="OpsSensors.calibrate('${sid}')">Run calibration</button>
          <button class="fgd-btn" onclick="OpsSensors.sendCommand('${sid}','reset')">Restart node</button>
          <button class="fgd-btn" onclick="OpsSensors.coverage('${sid}')">Manage coverage</button>
        </div>
      </div>` : ''}`;

    _container.innerHTML = SND_CSS + OpsModal.detailShell({
      back: 'OpsSensors.back()',
      crumbRoot: 'Sentinel Devices',
      title: esc(x.name || x.sensor_id),
      avatar: { text: 'SN', bg: 'linear-gradient(135deg,#0d7fa0,#16a8d3)' },
      chips: [
        { cls: chipCls, dot: true, label: _cap(x.status || 'unknown') },
        x.device_variant ? { cls: 'neutral', label: x.device_variant.replace(/_/g, ' ') } : null,
      ].filter(Boolean),
      meta: [['Zone', esc(x.zone || '—')], ['Primary asset', primary ? esc(primary.name || primary.property_id) : '—'], ['Property', esc(x.property_name || '—')], ['Link', esc(x.link_type || '—')]],
      actions: `${primary && primary.property_id ? `<button class="fgd-btn" onclick="OpsNetwork.open('${__sid(primary.property_id)}')">View on map</button>` : ''}${canMng() ? `<button class="fgd-btn" style="background:linear-gradient(135deg,#16a8d3,#0d7fa0);color:#fff;border:none;" onclick="OpsSensors.queueCommand('${sid}')">Queue command</button>` : ''}`,
      sections: [
        { id: 'overview', title: 'Device overview', meta: last ? 'Last ping ' + _ago(last) : '', body: overview },
        { id: 'telemetry', title: 'Live telemetry', body: tele },
        { id: 'diagnostics', title: 'Diagnostics', body: diag },
        { id: 'installation', title: 'Installation', body: install },
        { id: 'maintenance', title: 'Maintenance', body: maintBody },
        { id: 'firmware', title: 'Firmware', body: fwBody },
        { id: 'events', title: 'Event history', body: eventsBody },
        { id: 'photos', title: 'Photos', body: E('', 'No photos attached', 'Install and site photos can be attached once file storage exists.') },
        { id: 'documents', title: 'Documents', body: E('', 'No documents attached', 'Datasheets and warranty docs can be attached once file storage exists.') },
      ],
      sidebar,
    });
  }

  function queueCommand(sensorId) {
    OpsModal.open('Queue a command', `<p style="margin:0 0 4px;font-size:var(--fs-sm);color:var(--ink-3);">Send a command to this Sentinel.</p>`, [
      { label: 'Push firmware (OTA)', onclick: `OpsSensors.sendCommand('${__sid(sensorId)}','firmware_update')`, class: 'btn-primary' },
      { label: 'Restart node', onclick: `OpsSensors.sendCommand('${__sid(sensorId)}','reset')` },
      { label: 'Recalibrate', onclick: `OpsSensors.calibrate('${__sid(sensorId)}')` },
      { label: 'Cancel', onclick: 'OpsModal.close()', class: 'btn-ghost' },
    ]);
  }

  return {
    render, setFilter, setQuery,
    viewSensor, closeDrawer, decommission, openFull, back, queueCommand,
    coverage, saveCoverage, history, calibrate, confirmCalibrate, openAsset,
    toggleSelect, toggleSelectAll, clearSelection, bulkCommand, confirmBulkCommand,
    sendCommand, _toggleFwField, confirmSendCommand, commandHistory, cancelCommand,
  };
})();
