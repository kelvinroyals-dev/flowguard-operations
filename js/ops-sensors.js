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
  const canMng = () => !(typeof CONFIG !== 'undefined' && CONFIG.LOCAL_SANDBOX) && (!(window.Auth && Auth.can) || Auth.can('devices.manage'));
  function requireDeviceManage() { if (Auth.hasNavAccess('sensors') && canMng()) return true; OpsModal.toast('You do not have permission to change devices', 'watch'); return false; }
  const __sid = v => String(v == null ? '' : v).replace(/[^A-Za-z0-9_\-.:]/g, '');

  let _all = [];
  let _fleetReads = 0;
  let _filter = 'all';
  let _tag = '';
  let _q = '';
  let _pg = null;
  let _container = null;
  let _selected = new Set();
  let _filteredRows = [];
  let _drawerId = null;
  let _drawerOpener=null,_drawerBackground=null,_drawerBackgroundInert=false;


  async function render(container) {
    _container = container;
    _drawerId = null;
    _container.innerHTML = shellHTML();
    await load();
  }

  function shellHTML() {
    return `
      ${typeof CONFIG !== 'undefined' && CONFIG.LOCAL_SANDBOX ? '<div class="capability-note">Local device review is read-only. Fleet, events and command history are available; ingestion, device commands, configuration and external delivery remain disabled.</div>' : ''}
      ${OpsModal.pageHeader({title:'Device fleet',subtitle:'Fleet management',subtitleId:'sn-page-sub',actions:`<div class="fleet-tools">
          <button class="fg-action" onclick="OpsSensors.fleetAnalytics()" title="Fleet-wide health, firmware, connectivity & integrity rollups">
            ${OpsModal.entityIcon('analytics')}Analytics
          </button>
          <details class="fleet-management"><summary>Fleet management</summary><div class="fleet-management-menu">
          <button class="fg-action" onclick="OpsSensors.profilesManager()" title="Device configuration profiles">
            ${OpsModal.entityIcon('settings')}Profiles
          </button>
          <button class="fg-action" onclick="OpsSensors.firmwareManager()" title="Firmware releases & staged rollouts">
            ${OpsModal.entityIcon('firmware')}Firmware
          </button>
          <button class="fg-action" onclick="OpsSensors.driversManager()" title="Third-party device drivers & adapters">
            ${OpsModal.entityIcon('driver')}Drivers
          </button>
          <button class="fg-action" onclick="OpsSensors.protectionWindows()" title="Pause reboots/firmware during storms or incidents">
            ${OpsModal.entityIcon('shield')}Maintenance windows
          </button>
          </div></details>
        </div>`})}
      <div id="sn-kpis"></div>
      <div id="sn-note-slot"></div>
      <div class="lv-wrap">
        <div class="lv-toolbar" id="sn-toolbar"></div>
        <div class="sn-bulkbar" id="sn-bulkbar" style="margin:0 20px 10px;"></div>
        <div id="sn-body">${OpsModal.loading('Loading the device fleet…')}</div>
      </div>
    `;
  }

  async function load() {
    _fleetReads++;
    try {
      const r = await OpsModal.apiGet('/monitoring/sensors/all');
      if (!Array.isArray(r.data)) throw new Error('Device collection was not supplied');
      _all = r.data;
      draw();
      preload3D(); // warm three.js + decoded model so the first drawer is instant
    } catch (err) {
      if (_container) _container.innerHTML = OpsModal.failure('Device fleet',err,"reloadTab('sensors')",true);
    } finally {
      _fleetReads--;
    }
  }

  function rel(ts) { return ts ? OpsModal.relativeTime(ts) : null; }

  // Connectivity is the reported device assessment, not registration status,
  // battery quality or an inferred heartbeat window. Missing stays unknown.
  function healthTier(x) {
    if (x.device_state === 'online') return 'healthy'; // Legacy CSS/filter key; displayed as Online.
    if (['degraded','offline','maintenance'].includes(x.device_state)) return x.device_state;
    return 'unknown';
  }

  // Raw water levels do not imply uniform site-specific severity thresholds.
  const levelColor = (v,trusted) => OpsModal.waterLevelColor(v,trusted);

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

  // Three-state trust model (server-computed): Device alive? · Sensor data
  // trustworthy? · what's actually in the drain (UNKNOWN when data isn't trusted).
  function stateCards(x) {
    const pill = (value,domain,display) => OpsModal.status(value,display,null,domain);
    const c = (k, inner, reason) => `<div class="sn-card"><div class="sn-card-k">${k}</div><div class="sn-card-v" style="font-size:var(--fs-sm)">${inner}</div>${reason ? `<div style="font-size:var(--fs-2xs);color:var(--ink-4);margin-top:3px">${esc(reason)}</div>` : ''}</div>`;
    return c('Device', pill(x.device_state || 'unknown','device'), x.device_reason)
         + c('Sensor data', pill(x.sensor_state==='ok' && x.data_trust!==true ? 'unknown' : x.sensor_state || 'unknown','sensordata',x.sensor_state==='ok' && x.data_trust===true?'Trusted':null), x.sensor_reason)
         + c('Drainage', pill(x.data_trust===true ? x.infrastructure_state || 'unknown' : 'unknown','drainage'), x.infra_reason || 'Assessment basis not supplied');
  }

  function draw() { drawList(); }

  function drawList() {
    if (!_container) return;
    if (!document.getElementById('sn-kpis')) _container.innerHTML = shellHTML();

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
    const unknownBatt = _all.filter(x => OpsModal.reading(x.battery_percent,0,100)===null).length;
    const lowBatt = _all.filter(x => criticalBattery(x.battery_percent)).length;
    const unassigned = _all.filter(x => Array.isArray(x.assets) && !x.assets.length).length;
    const unknownLinks = _all.filter(x => !Array.isArray(x.assets)).length;
    // "alive but lying" — device reachable, data not trustworthy (stale/frozen/implausible)
    const dataIssues = _all.filter(x => x.data_trust === false && (x.device_state === 'online' || x.device_state === 'degraded')).length;

    if (sub) sub.textContent = `${total} returned devices · ${commonFw ? 'firmware ' + commonFw + ' · ' : ''}fleet management`;

    if (kp) kp.innerHTML = '';

    const chips = [
      ['all', `All (${total})`], ['healthy', `Online (${healthy})`],
      ['degraded', `Degraded (${degraded})`], ['offline', `Offline (${offline})`],
      ['maintenance', `Maintenance (${tiers.filter(t=>t==='maintenance').length})`], ['unknown', `Unknown (${tiers.filter(t=>t==='unknown').length})`],
      ['dataissue', `Data issues (${dataIssues})`],
      ['lowbatt', `Critical battery (${lowBatt})`], ['unknownbatt', `Battery not supplied (${unknownBatt})`],
      ['unassigned', `No asset links (${unassigned})`], ['unknownlinks', `Links unknown (${unknownLinks})`],
    ];
    tb.innerHTML = `
      <div class="lv-search">
        ${OpsModal.actionIcon("search")}
        <input aria-label="Search devices" placeholder="Search devices…" value="${_q.replace(/"/g, '&quot;')}" oninput="OpsSensors.setQuery(this.value)">
      </div>
      <div class="lv-toolbar-right">
        ${(() => { const tags = [...new Set(_all.flatMap(s => s.tags || []))].sort();
          return tags.length ? `<select aria-label="Device tag" class="um-filter" onchange="OpsSensors.setTag(this.value)">
            <option value="">All tags</option>
            ${tags.map(t => `<option value="${esc(t)}" ${_tag === t ? 'selected' : ''}>#${esc(t)}</option>`).join('')}
          </select>` : ''; })()}
        <select class="um-filter" aria-label="Device fleet state" onchange="OpsSensors.setFilter(this.value)">${chips.map(([k, l]) =>
        `<option value="${k}" ${_filter === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        ${canMng() ? `<button class="fg-action" onclick="OpsSensors.targetCohort()" title="Select a cohort by tag, state, firmware, lifecycle or integrity">
          ${OpsModal.entityIcon('target')}Target…</button>` : ''}</div>`;

    let rows = _all.map((x, i) => ({ x, tier: tiers[i] }));
    if (_filter === 'healthy') rows = rows.filter(r => r.tier === 'healthy');
    else if (_filter === 'degraded') rows = rows.filter(r => r.tier === 'degraded');
    else if (_filter === 'offline') rows = rows.filter(r => r.tier === 'offline');
    else if (['maintenance','unknown'].includes(_filter)) rows = rows.filter(r => r.tier === _filter);
    else if (_filter === 'dataissue') rows = rows.filter(r => r.x.data_trust === false && (r.x.device_state === 'online' || r.x.device_state === 'degraded'));
    else if (_filter === 'lowbatt') rows = rows.filter(r => criticalBattery(r.x.battery_percent));
    else if (_filter === 'unknownbatt') rows = rows.filter(r => OpsModal.reading(r.x.battery_percent,0,100)===null);
    else if (_filter === 'unassigned') rows = rows.filter(r => Array.isArray(r.x.assets) && !r.x.assets.length);
    else if (_filter === 'unknownlinks') rows = rows.filter(r => !Array.isArray(r.x.assets));
    if (_tag) rows = rows.filter(r => (r.x.tags || []).includes(_tag));
    if (_q) {
      const q = _q.toLowerCase();
      rows = rows.filter(r => `${r.x.name || ''} ${r.x.sensor_id || ''} ${propertyOf(r.x)}`.toLowerCase().includes(q));
    }
    rows = rows.map(r => r.x);

    document.getElementById('sn-note-slot').innerHTML = (offline === total && total)
      ? '<div class="sn-note"><b>No fresh device telemetry is available.</b> Readings may be stale or absent. Review each device’s last-seen timestamp and connection state.</div>'
      : '';

    _filteredRows = rows;
    renderBulkBar();

    if (!rows.length) {
      el.innerHTML = OpsModal.emptyState(OpsModal.entityIcon('device'),total?'No matching devices':'No devices returned',total?'Change the search or state filter to review other returned devices.':'No devices were returned by this fleet feed. This does not establish physical deployment or coverage.');
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
      ${canMng() ? `<button class="fg-action" onclick="OpsSensors.bulkTag()">Tag…</button>
      <button class="fg-action" onclick="OpsSensors.bulkCommand('firmware_update')">Push firmware</button>
      <button class="fg-action danger" onclick="OpsSensors.bulkCommand('reset')">Remote reset</button>
      <button class="fg-action" onclick="OpsSensors.bulkCommand('recalibrate')">Request recalibration</button>` : ''}
      <button class="sn-bulk-clear" onclick="OpsSensors.clearSelection()">Clear</button>
    `;
  }

  // Bulk add/remove a tag across the selected Sentinels.
  function bulkTag() {
    if (!requireDeviceManage()) return;
    if (!_selected.size) return;
    const n = _selected.size;
    OpsModal.open(`Tag ${n} device${n > 1 ? 's' : ''}`, `
      <p style="margin:0 0 12px;font-size:var(--fs-base);color:var(--ink-3);line-height:1.5">Add or remove a group tag across the ${n} selected device${n > 1 ? 's' : ''} (e.g. <code>lekki</code>, <code>ring-pilot</code>, <code>hw-v2</code>).</p>
      ${OpsModal.field('Add tag', 'add', 'text', '', { required: false, placeholder: 'tag to add' })}
      ${OpsModal.field('Remove tag', 'remove', 'text', '', { required: false, placeholder: 'tag to remove' })}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: `Apply to ${n}`, class: 'btn-primary', onclick: 'OpsSensors.confirmBulkTag()' },
    ]);
  }
  async function confirmBulkTag() {
    if (!requireDeviceManage()) return;
    const f = OpsModal.getFormData();
    if (!f.add && !f.remove) { OpsModal.toast('Enter a tag to add or remove.', 'warning'); return; }
    OpsModal.setLoading(true);
    try {
      const r = await OpsModal.apiPost('/monitoring/sensors/tags/bulk', {
        sensor_ids: Array.from(_selected), add: f.add ? [f.add] : [], remove: f.remove ? [f.remove] : [] });
      OpsModal.close();
      const outcome=bulkOutcome('tags',r.data?.updated,_selected.size);OpsModal.toast(outcome.text,outcome.tone);
      _selected.clear();
      await load();
    } catch (err) { OpsModal.setLoading(false); OpsModal.toast(err.message || 'Failed to update tags', 'error'); }
  }

  // ── Advanced bulk targeting — build a selection cohort by criteria ───────
  function _cohortMatch(f) {
    const base = fleetFirmware(_all);
    return _all.filter(x => {
      if (f.tag && !(x.tags || []).includes(f.tag)) return false;
      if (f.device_state && f.device_state !== 'any' && x.device_state !== f.device_state) return false;
      if (f.data === 'issues' && !(x.data_trust === false && (x.device_state === 'online' || x.device_state === 'degraded'))) return false;
      if (f.lifecycle && f.lifecycle !== 'any' && x.lifecycle_state !== f.lifecycle) return false;
      if (f.config && f.config !== 'any' && (x.config_state || 'none') !== f.config) return false;
      if (f.fw === 'outdated') { if (!(base && x.firmware_version && x.firmware_version !== base)) return false; }
      else if (f.fw && f.fw !== 'any') { if (x.firmware_version !== f.fw) return false; }
      if (f.integrity === 'flagged' && !(x.integrity_state === 'warning' || x.integrity_state === 'critical')) return false;
      if (f.integrity === 'tamper' && !x.tamper_flagged) return false;
      if (f.integrity === 'geofence' && x.geofence_state !== 'breach') return false;
      if (f.lowbatt === 'yes' && !criticalBattery(x.battery_percent)) return false;
      return true;
    }).map(x => x.sensor_id);
  }
  function targetCohort() {
    const tags = [...new Set(_all.flatMap(s => s.tags || []))].sort();
    const vers = [...new Set(_all.map(s => s.firmware_version).filter(Boolean))].sort();
    const any = [{ value: 'any', label: 'Any' }];
    OpsModal.open('Target a cohort', `
      <p style="margin:0 0 12px;font-size:var(--fs-sm);color:var(--ink-3);line-height:1.5">Match devices by criteria, then select them — the bulk bar lets you tag, push firmware, reset or recalibrate the whole set at once.</p>
      <div onchange="OpsSensors._targetPreview()">
        ${OpsModal.field('Tag / group', 'tag', 'select', '', { options: [{ value: '', label: 'Any tag' }].concat(tags.map(t => ({ value: t, label: '#' + t }))) })}
        ${OpsModal.row([
          OpsModal.field('Device state', 'device_state', 'select', 'any', { options: any.concat(['online', 'degraded', 'offline', 'maintenance'].map(v => ({ value: v, label: OpsModal.label(v) }))) }),
          OpsModal.field('Data trust', 'data', 'select', 'any', { options: [{ value: 'any', label: 'Any' }, { value: 'issues', label: 'Data issues only' }] }),
        ])}
        ${OpsModal.row([
          OpsModal.field('Lifecycle', 'lifecycle', 'select', 'any', { options: any.concat(['inventory', 'warehouse', 'assigned', 'installed', 'active', 'maintenance', 'rma', 'retired'].map(v => ({ value: v, label: OpsModal.label(v) }))) }),
          OpsModal.field('Config', 'config', 'select', 'any', { options: any.concat([{ value: 'in_sync', label: 'In sync' }, { value: 'drift', label: 'Drift' }, { value: 'pending', label: 'Pending' }, { value: 'none', label: 'No profile' }]) }),
        ])}
        ${OpsModal.row([
          OpsModal.field('Firmware', 'fw', 'select', 'any', { options: [{ value: 'any', label: 'Any' }, { value: 'outdated', label: 'Outdated (≠ baseline)' }].concat(vers.map(v => ({ value: v, label: v }))) }),
          OpsModal.field('Integrity', 'integrity', 'select', 'any', { options: [{ value: 'any', label: 'Any' }, { value: 'flagged', label: 'Flagged (warn/critical)' }, { value: 'tamper', label: 'Tamper only' }, { value: 'geofence', label: 'Geofence breach' }] }),
        ])}
        ${OpsModal.field('Battery', 'lowbatt', 'select', 'any', { options: [{ value: 'any', label: 'Any' }, { value: 'yes', label: 'Critical only (<20%)' }] })}
      </div>
      <div id="tg-count" style="margin-top:12px;font-size:var(--fs-sm);font-weight:700;color:var(--ink)"></div>
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: 'Select matching', class: 'btn-primary', onclick: 'OpsSensors.applyCohort()' },
    ]);
    _targetPreview();
  }
  function _targetPreview() {
    const el = document.getElementById('tg-count');
    if (!el) return;
    const n = _cohortMatch(OpsModal.getFormData()).length;
    el.innerHTML = n ? `${n} device${n > 1 ? 's' : ''} match` : `<span style="color:var(--ink-4)">No devices match — loosen the criteria</span>`;
  }
  function applyCohort() {
    const ids = _cohortMatch(OpsModal.getFormData());
    if (!ids.length) { OpsModal.toast('No devices match those criteria.', 'warning'); return; }
    _selected = new Set(ids);
    // clear list filters so the whole cohort is visible in the table
    _filter = 'all'; _tag = ''; _q = '';
    OpsModal.close();
    draw();
    OpsModal.toast(`${ids.length} device${ids.length > 1 ? 's' : ''} selected — apply a bulk action from the bar.`, 'success');
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
    if (!requireDeviceManage()) return;
    if(!['firmware_update','reset','recalibrate'].includes(type))return OpsModal.toast('Unsupported bulk command','watch');
    if (!_selected.size) return;
    const ids = Array.from(_selected);
    const verb = { firmware_update: 'Push a firmware update to', reset: 'Send a remote reset to', recalibrate: 'Request recalibration on' }[type];
    const needsVersion = type === 'firmware_update';
    OpsModal.open(`${type === 'firmware_update' ? 'Push firmware' : type === 'reset' ? 'Remote reset' : 'Request recalibration'} — ${ids.length} device${ids.length > 1 ? 's' : ''}`, `
      <p style="margin:0 0 12px;font-size:var(--fs-base);color:var(--ink-3);line-height:1.5">
        ${verb} <b>${ids.length}</b> selected device${ids.length > 1 ? 's' : ''}. Delivery depends on each device’s next check-in, not an immediate execution guarantee.
      </p>
      ${needsVersion ? OpsModal.field('Firmware version', 'firmware_version', 'text', '', { required: true, placeholder: 'e.g. 2.4.1' }) : ''}
      ${OpsModal.field('Note (optional)', 'note', 'textarea', '', { required: false, placeholder: 'Reason for this command' })}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: `Queue for ${ids.length}`, class: 'btn-primary', onclick: `OpsSensors.confirmBulkCommand('${type}')` },
    ]);
  }

  async function confirmBulkCommand(type) {
    if (!requireDeviceManage()) return;
    if(!['firmware_update','reset','recalibrate'].includes(type))return OpsModal.toast('Unsupported bulk command','watch');
    if(!_selected.size)return OpsModal.toast('Select devices before queuing a bulk command','watch');
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
      const outcome=bulkOutcome('commands',r.data?.queued,_selected.size);OpsModal.toast(outcome.text,outcome.tone);
      _selected.clear();
      await load();
    } catch (err) {
      OpsModal.setLoading(false);
      OpsModal.toast(err.message || 'Failed to queue command', 'error');
    }
  }

  function bulkOutcome(kind,value,requested) {
    const count=OpsModal.count(value),known=count!==null && count<=requested;
    if(!known)return {text:kind==='tags'?'Tag request accepted; updated-device count was not supplied.':'Command request accepted; queued-device count was not supplied.',tone:'watch'};
    if(count===0)return {text:kind==='tags'?'No devices were reported updated.':'No device commands were reported queued.',tone:'watch'};
    return {text:kind==='tags'?`Tags updated on ${count} device${count===1?'':'s'}.`:`Queued for ${count} device${count===1?'':'s'} — delivery depends on each device's next check-in.`,tone:'success'};
  }

  function renderTable(rows, commonFw) {
    const el = document.getElementById('sn-body');
    if (!el) return;
    const allChecked = rows.length > 0 && _filteredRows.every(x => _selected.has(x.sensor_id));
    el.innerHTML = `
      <div class="lv-scroll">
        <table class="lv-table fg-device-fleet">
          <thead>
            <tr>
              <th scope="col" style="width:44px;"><label class="fg-check-target"><input type="checkbox" ${allChecked ? 'checked' : ''} onclick="OpsSensors.toggleSelectAll(this.checked)" aria-label="Select all matching devices"></label></th>
              <th scope="col">Device</th>
              <th scope="col">Estate</th>
              <th scope="col">Power / signal</th>
              <th scope="col">Last reading</th>
              <th scope="col">Device / data</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(x => rowHTML(x, commonFw)).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function criticalBattery(value) { const charge=OpsModal.reading(value,0,100);return charge!==null && charge<20; }
  function vitBar(v) {
    v=OpsModal.reading(v,0,100);
    if(v===null) return '<span class="lv-source">Unknown</span>';
    const color = OpsModal.vitalColor(v);
    const pct = v;
    return `<span class="sn-vitcell"><span class="sn-bar"><i style="width:${pct}%;background:${color}"></i></span><span class="sn-vit-v" style="color:${color}">${v != null ? v + '%' : '—'}</span></span>`;
  }

  function rowHTML(x, commonFw) {
    const tier = healthTier(x);
    const beat = rel(x.reading_time);
    return `
      <tr class="sn-row clickable" onclick="OpsSensors.viewSensor('${__sid(x.sensor_id)}')">
        <td onclick="event.stopPropagation()"><label class="fg-check-target"><input type="checkbox" aria-label="Select ${esc(x.name || x.sensor_id)}" ${_selected.has(x.sensor_id) ? 'checked' : ''} onclick="OpsSensors.toggleSelect('${__sid(x.sensor_id)}', this.checked); event.stopPropagation()"></label></td>
        <td class="sn-node-id" style="cursor:pointer;" title="Open full details" onclick="event.stopPropagation();OpsSensors.openFull('${__sid(x.sensor_id)}')">
          <div class="lv-name-cell">
            <div class="lv-avatar" aria-hidden="true">${OpsSpatial.icon('device')}</div>
            <div style="min-width:0;"><button type="button" class="record-link lv-name" onclick="event.stopPropagation();OpsSensors.openFull('${__sid(x.sensor_id)}')">${esc(x.name || x.sensor_id)}</button><span class="lv-source">${esc(x.sensor_id)}</span>${x.pending_commands ? `<span class="lv-source" style="color:var(--blue-hi);">${OpsModal.escape(x.pending_commands)} queued</span>` : ''}</div>
          </div>
        </td>
        <td><span class="fg-cell-copy">${esc(propertyOf(x))}</span></td>
        <td><div class="lv-source sn-power-row">Battery ${vitBar(x.battery_percent)}</div><div class="lv-source sn-power-row">Signal ${vitBar(x.signal_strength)}</div></td>
        <td class="sn-last" style="color:${beat ? 'var(--ink-2)' : 'var(--ink-3)'}">${beat || 'Not supplied'}</td>
        <td>${OpsModal.status(tier==='healthy'?'online':tier,null,null,'device')}<div class="lv-source">Data: ${esc(x.sensor_state==='ok'?(x.data_trust===true?'Trusted':'Unknown'):OpsModal.label(x.sensor_state || 'unknown'))}</div></td>
        <td class="sn-acts" onclick="event.stopPropagation()">
          <button type="button" class="fg-action" onclick="OpsSensors.viewSensor('${__sid(x.sensor_id)}')">Review controls</button>
        </td>
      </tr>`;
  }

  function setFilter(f) { _filter = f; draw(); }
  function setTag(t) { _tag = t; draw(); }
  function setQuery(q) { _q = q; draw(); }

  // ── Fleet analytics — rollups across the whole device fleet ─────────────
  const _AC = { ok: 'var(--ok)', warn: 'var(--warn)', caution: 'var(--caut)', err: 'var(--err)', info: 'var(--blue-hi)', muted: 'var(--ink-3)' };
  function fleetAnalytics() {
    const A = _all || [];
    const n = A.length;
    if (!n) { OpsModal.open('Fleet analytics', OpsModal.emptyState(OpsModal.entityIcon('device'),'No devices returned','No devices were returned by the fleet feed. This does not establish network coverage or health.'), [{ label: 'Close', class: 'btn-ghost', onclick: 'OpsModal.close()' }]); return; }
    const c = pred => A.filter(pred).length;
    const pct = k => Math.round(k / n * 100);
    const percent = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;

    const seg = (label, cnt, color, filter) => ({ label, cnt, color, filter });
    const block = (title, segs, sub) => {
      const shown = segs.filter(s => s.cnt > 0);
      const max = Math.max(1, ...shown.map(s => s.cnt));
      const rows = (shown.length ? shown : [{ label: 'None', cnt: 0, color: _AC.muted }]).map(s => `
        <div style="display:flex;align-items:center;gap:8px;padding:3px 0">
          <span style="width:9px;height:9px;border-radius:var(--radius-micro);background:${s.color};flex:0 0 auto"></span>
          <span style="font-size:var(--fs-xs);color:var(--ink-2);flex:0 0 40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.label)}</span>
          <span style="flex:1 1 auto;height:7px;background:var(--line);border-radius:var(--radius-micro);overflow:hidden"><span style="display:block;height:100%;width:${Math.round(s.cnt / max * 100)}%;background:${s.color}"></span></span>
          <span style="font-size:var(--fs-xs);font-weight:700;color:var(--ink);width:26px;text-align:right">${s.cnt}</span>
          ${s.filter ? `<button class="fg-action" aria-label="View ${esc(title)}: ${esc(s.label)}" onclick="OpsModal.close();OpsSensors.setFilter('${s.filter}')" style="cursor:pointer">View</button>` : '<span style="width:26px"></span>'}
        </div>`).join('');
      return `<div style="background:var(--surface-2,transparent);border:1px solid var(--line);border-radius:var(--radius-control);padding:13px 15px">
        <div style="font-size:var(--fs-sm);font-weight:700;color:var(--ink);margin-bottom:7px">${esc(title)}${sub ? ` <span style="color:var(--ink-4);font-weight:400;font-size:var(--fs-2xs)">${sub}</span>` : ''}</div>${rows}</div>`;
    };

    // firmware spread (most common first)
    const fwT = {}; A.forEach(x => { const k = x.firmware_version || '—'; fwT[k] = (fwT[k] || 0) + 1; });
    const commonFw = fleetFirmware(A);
    const fwSegs = Object.entries(fwT).sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([v, cnt]) => seg(v === '—' ? 'Not supplied' : v, cnt, _AC.muted));

    const tamper = c(x => x.tamper_flagged);
    const geo = c(x => x.geofence_state === 'breach');
    const skew = c(x => x.last_clock_skew_seconds != null && Math.abs(x.last_clock_skew_seconds) >= 300);
    const commandCounts = A.filter(x => Number.isInteger(x.pending_commands) && x.pending_commands >= 0);
    const pendingCmds = commandCounts.reduce((s, x) => s + x.pending_commands, 0);

    const blocks = [
      block('Device health', [
        seg('Online', c(x => x.device_state === 'online'), _AC.ok),
        seg('Degraded', c(x => x.device_state === 'degraded'), _AC.warn, 'degraded'),
        seg('Offline', c(x => x.device_state === 'offline'), _AC.muted, 'offline'),
        seg('Maintenance', c(x => x.device_state === 'maintenance'), _AC.muted),
        seg('Unknown', c(x => !['online','degraded','offline','maintenance'].includes(x.device_state)), _AC.muted),
      ]),
      block('Data trust', [
        seg('Trusted', c(x => x.sensor_state === 'ok' && x.data_trust === true), _AC.ok),
        seg('Stale', c(x => x.sensor_state === 'stale'), _AC.warn, 'dataissue'),
        seg('Frozen', c(x => x.sensor_state === 'frozen'), _AC.warn, 'dataissue'),
        seg('Implausible', c(x => x.sensor_state === 'implausible'), _AC.err, 'dataissue'),
        seg('Unknown', c(x => !['stale','frozen','implausible'].includes(x.sensor_state) && !(x.sensor_state === 'ok' && x.data_trust === true)), _AC.muted),
      ]),
      block('Infrastructure', [
        seg('Normal', c(x => x.data_trust === true && x.infrastructure_state === 'normal'), _AC.ok),
        seg('Elevated', c(x => x.data_trust === true && x.infrastructure_state === 'elevated'), _AC.warn),
        seg('High', c(x => x.data_trust === true && x.infrastructure_state === 'high'), _AC.caution),
        seg('Critical', c(x => x.data_trust === true && x.infrastructure_state === 'critical'), _AC.err),
        seg('Unknown', c(x => x.data_trust !== true || !['normal','elevated','high','critical'].includes(x.infrastructure_state)), _AC.muted),
      ]),
      block('Integrity', [
        seg('OK', c(x => x.integrity_state === 'ok'), _AC.ok),
        seg('Warning', c(x => x.integrity_state === 'warning'), _AC.warn),
        seg('Critical', c(x => x.integrity_state === 'critical'), _AC.err),
        seg('Unknown', c(x => !['ok','warning','critical'].includes(x.integrity_state)), _AC.muted),
      ], `Reported: ${tamper} tamper · ${geo} geofence · ${skew} clock`),
      block('Firmware', fwSegs, commonFw ? `fleet baseline ${esc(commonFw)}` : ''),
      block('Config profiles', [
        seg('In sync', c(x => x.config_state === 'in_sync'), _AC.ok),
        seg('Drift', c(x => x.config_state === 'drift'), _AC.warn),
        seg('Pending', c(x => x.config_state === 'pending'), _AC.muted),
        seg('No profile', c(x => x.config_state === 'none'), _AC.muted),
        seg('Unknown', c(x => !['in_sync','drift','pending','none'].includes(x.config_state)), _AC.muted),
      ]),
      block('Lifecycle', [
        seg('Active', c(x => x.lifecycle_state === 'active'), _AC.ok),
        seg('Installed', c(x => x.lifecycle_state === 'installed'), _AC.muted),
        seg('Assigned', c(x => x.lifecycle_state === 'assigned'), _AC.muted),
        seg('Warehouse', c(x => x.lifecycle_state === 'warehouse'), _AC.muted),
        seg('Inventory', c(x => x.lifecycle_state === 'inventory'), _AC.muted),
        seg('Maintenance', c(x => x.lifecycle_state === 'maintenance'), _AC.warn),
        seg('RMA', c(x => x.lifecycle_state === 'rma'), _AC.err),
        seg('Retired', c(x => x.lifecycle_state === 'retired'), _AC.muted),
        seg('Unknown', c(x => !['active','installed','assigned','warehouse','inventory','maintenance','rma','retired'].includes(x.lifecycle_state)), _AC.muted),
      ]),
      block('Power', [
        seg('Healthy (≥50%)', c(x => percent(x.battery_percent) && x.battery_percent >= 50), _AC.ok),
        seg('Low (20–49%)', c(x => percent(x.battery_percent) && x.battery_percent >= 20 && x.battery_percent < 50), _AC.warn),
        seg('Critical (<20%)', c(x => percent(x.battery_percent) && x.battery_percent < 20), _AC.err, 'lowbatt'),
        seg('Unknown', c(x => !percent(x.battery_percent)), _AC.muted),
      ]),
      block('Connectivity', [
        seg('Good (≥50%)', c(x => ['online','degraded'].includes(x.device_state) && percent(x.signal_strength) && x.signal_strength >= 50), _AC.ok),
        seg('Fair (20–49%)', c(x => ['online','degraded'].includes(x.device_state) && percent(x.signal_strength) && x.signal_strength >= 20 && x.signal_strength < 50), _AC.warn),
        seg('Poor (<20%)', c(x => ['online','degraded'].includes(x.device_state) && percent(x.signal_strength) && x.signal_strength < 20), _AC.err),
        seg('Unavailable', c(x => !['online','degraded'].includes(x.device_state) || !percent(x.signal_strength)), _AC.muted),
      ]),
    ];

    const summary = OpsModal.kpiStrip([
      {label:'Devices returned',value:n},
      {label:'Reported online share',value:n?pct(c(x=>x.device_state==='online'))+'%':'Not supplied',sub:'Of all returned devices, including unknown states'},
      {label:'Reported integrity flags',value:tamper+geo+skew,sub:'Flags present in returned records, not a clean-fleet assessment'},
      {label:'Queued commands reported',value:commandCounts.length?pendingCmds:'Unavailable',sub:commandCounts.length+' / '+n+' devices supplied command counts'}
    ]);

    OpsModal.open('Fleet analytics',
      `${summary}<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">${blocks.join('')}</div>`,
      [{ label: 'Close', class: 'btn-primary', onclick: 'OpsModal.close()' }]);
  }

  // ── Protection (maintenance) windows ──────────────────────────────────
  function protectionWindows() {
    OpsModal.open('Maintenance windows',
      '<div id="pw-body" style="min-width:0"><div style="padding:20px;color:var(--ink-3)">Loading…</div></div>',
      [{ label: 'Close', onclick: 'OpsModal.close()' }]);
    refreshWindows();
  }
  async function refreshWindows() {
    const body = document.getElementById('pw-body');
    if (!body) return;
    let list;
    try { list = (await OpsModal.apiGet('/monitoring/protection-windows')).data; if (!Array.isArray(list)) throw new Error('Maintenance window directory unavailable'); }
    catch (err) { body.innerHTML = OpsModal.failure('Maintenance windows',err,'OpsSensors.refreshWindows()'); return; }
    const fmt = d => d ? OpsModal.fmtDateTime(d) : '—';
    const scopeLabel = w => w.scope_type === 'fleet' ? 'Whole fleet' : `${esc(OpsModal.label(w.scope_type || 'unknown'))}: ${esc(w.scope_value || 'Not supplied')}`;
    const rows = list.length ? list.map(w => `
      <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
        ${OpsModal.status(w.active===true?'active':w.active===false?'scheduled':'unknown',null,w.active===true?'warn':'neutral')}
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;color:var(--ink)">${scopeLabel(w)}</div>
          ${w.reason ? `<div style="font-size:var(--fs-sm);color:var(--ink-2);margin-top:2px">${esc(w.reason)}</div>` : ''}
          <div style="font-size:var(--fs-2xs);color:var(--ink-3);margin-top:3px">${fmt(w.starts_at)} → ${fmt(w.ends_at)}${w.created_by_name ? ' · ' + esc(w.created_by_name) : ''}</div>
        </div>
        <button class="fg-action" onclick="OpsSensors.cancelWindow(${w.id})">End</button>
      </div>`).join('') : OpsModal.emptyState('','No protection windows returned','No active or scheduled protection windows were returned by this feed.');

    const form = `
      <div style="border-top:1px solid var(--border);margin-top:8px;padding-top:14px">
        <h3 class="fg-manager-title">Create protection window</h3>
        <div class="ops-modal-row" style="--field-columns:2">
          ${OpsModal.field('Scope', 'scope_type', 'select', 'fleet', { options: [
            { value: 'fleet', label: 'Whole fleet' }, { value: 'tag', label: 'Tag / group' },
            { value: 'property', label: 'Estate' }, { value: 'sensor', label: 'One device' }] })}
          ${OpsModal.field('Target reference', 'scope_value', 'text', '', { required: false, placeholder: 'Tag, estate reference or device reference' })}
        </div>
        ${OpsModal.field('Reason', 'reason', 'text', '', { required: false, placeholder: 'e.g. Heavy rain forecast tonight' })}
        ${OpsModal.field('Protect until', 'ends_at', 'datetime-local', '', { required: true })}
        <div style="text-align:right;margin-top:10px"><button class="fg-action fg-action-primary" onclick="OpsSensors.createWindow()">Start protection</button></div>
      </div>`;
    body.innerHTML = rows + form;
  }
  async function createWindow() {
    if (!requireDeviceManage()) return;
    const f = OpsModal.getFormData();
    if (!f.ends_at) { OpsModal.toast('Set an end time.', 'warning'); return; }
    if (f.scope_type !== 'fleet' && !f.scope_value) { OpsModal.toast('This scope needs a value.', 'warning'); return; }
    try {
      await OpsModal.apiPost('/monitoring/protection-windows', {
        scope_type: f.scope_type, scope_value: f.scope_type === 'fleet' ? null : f.scope_value,
        reason: f.reason || null, ends_at: new Date(f.ends_at).toISOString() });
      OpsModal.toast('Protection window started.', 'success');
      refreshWindows();
    } catch (err) { OpsModal.toast(err.message || 'Failed to create window', 'error'); }
  }
  async function cancelWindow(id) {
    if (!requireDeviceManage()) return;
    try { await OpsModal.apiPost(`/monitoring/protection-windows/${id}/cancel`, {}); OpsModal.toast('Window ended.', 'success'); refreshWindows(); }
    catch (err) { OpsModal.toast(err.message || 'Failed', 'error'); }
  }

  // ── Device configuration profiles ─────────────────────────────────────
  const CFG_FIELDS = [
    ['telemetry_interval_sec', 'Telemetry interval (seconds)', 5,3600],
    ['water_poll_sec', 'Water polling (seconds)', 1,600],
    ['offline_alert_min', 'Offline alert (minutes)', 1,240],
    ['high_level_pct', 'High water (%)', 1,100],
    ['critical_level_pct', 'Critical water (%)', 1,100],
  ];
  function profilesManager() {
    OpsModal.open('Device profiles',
      '<div id="pf-body"><div style="padding:20px;color:var(--ink-3)">Loading…</div></div>',
      [{ label: 'Close', onclick: 'OpsModal.close()' }]);
    pfHome();
  }
  async function pfHome() {
    const body = document.getElementById('pf-body'); if (!body) return;
    let list;
    try { list = OpsModal.readArray(await OpsModal.apiGet('/device-profiles'),'Profiles'); if(list.some(p=>!p || typeof p!=='object' || Array.isArray(p)))throw new Error('Profile records unavailable'); }
    catch (err) { body.innerHTML = OpsModal.failure('Profiles',err,'OpsSensors.pfHome()'); return; }
    if(!document.contains(body))return;
    const count = value => OpsModal.count(value) ?? 'Not supplied';
    const rows = list.length ? list.map(p => `<button type="button" class="sn-act-row fg-action" style="width:100%;text-align:left" onclick="OpsSensors.pfOpen('${esc(String(p.id).replace(/[^a-zA-Z0-9_-]/g,''))}')">
        <div><b>${esc(p.name || 'Unnamed profile')}</b> <span class="lv-mono" style="color:var(--ink-3);margin-left:6px">${OpsModal.count(p.version)!==null?'v'+OpsModal.count(p.version):'Version not supplied'}</span>
          <div style="color:var(--ink-3);font-size:var(--fs-xs);margin-top:2px">Assignments: ${count(p.assigned)} · Drifted: ${count(p.drifted)}</div></div>
        <span aria-hidden="true" style="color:var(--ink-3)">›</span></button>`).join('')
      : OpsModal.emptyState('','No profiles returned','No device configuration profiles were returned by this directory.');
    body.innerHTML = `${rows}
      <div style="border-top:1px solid var(--border);margin-top:14px;padding-top:12px">
        <h3 class="fg-manager-title">Create profile</h3>
        ${OpsModal.field('Name', 'pf-name', 'text', '', { required: false, placeholder: 'e.g. Urban drainage profile',disabled:!canMng() })}
        <div class="fg-diagnostic-actions"><button class="fg-action fg-action-primary" ${!canMng()?'disabled':''} onclick="OpsSensors.pfCreate()">${OpsModal.actionIcon('create')}Create profile</button></div>
      </div>`;
  }
  async function pfCreate() {
    if (!requireDeviceManage()) return;
    const f = OpsModal.getFormData();
    if (!f['pf-name']) { OpsModal.toast('Name the profile.', 'warning'); return; }
    try { const r = await OpsModal.apiPost('/device-profiles', { name: f['pf-name'], config: {} }); OpsModal.toast('Profile created.', 'success'); pfOpen(r.data.id); }
    catch (err) { OpsModal.toast(err.message || 'Failed', 'error'); }
  }
  async function pfOpen(id) {
    const body = document.getElementById('pf-body'); if (!body) return;
    body.innerHTML = '<div style="padding:20px;color:var(--ink-3)">Loading…</div>';
    let d; try { d = OpsModal.readRecord(await OpsModal.apiGet('/device-profiles/' + id),'Device profile'); } catch (err) { body.innerHTML = OpsModal.failure('Device profile',err,`OpsSensors.pfOpen('${__sid(id)}')`); return; }
    if(!document.contains(body))return;
    const cfg = d.config && typeof d.config==='object' && !Array.isArray(d.config)?d.config:{};
    const enums={camera_mode:['off','event','continuous'],firmware_channel:['stable','beta','internal']};
    const knownConfig=CFG_FIELDS.every(([key,,min,max])=>{const value=diagnosticNumber(cfg[key],min,max);return value!==null && Number.isInteger(value);}) && Object.entries(enums).every(([key,values])=>values.includes(cfg[key]));
    const fields = CFG_FIELDS.map(([k, label,min,max]) => {const value=diagnosticNumber(cfg[k],min,max),known=value!==null && Number.isInteger(value);return `<div class="ops-modal-field"><label class="ops-label" for="pf-${k}">${label}</label><input class="ops-input" id="pf-${k}" type="number" min="${min}" max="${max}" step="1" value="${known?value:''}" ${!known || !canMng()?'disabled':''} ${known?'':'placeholder="Not supplied"'}></div>`;});
    const records=value=>Array.isArray(value) && value.every(row=>row && typeof row==='object' && !Array.isArray(row))?value:null;
    const assigned=records(d.devices),history=records(d.history);
    const drift = assigned?.filter(x => x.drift===true).length;
    const driftUnknown=assigned?.filter(x=>typeof x.drift!=='boolean').length;
    const enumField=(key,label)=>`<div class="ops-modal-field"><label class="ops-label" for="pf-${key}">${label}</label><select class="ops-input" id="pf-${key}" ${!canMng() || !enums[key].includes(cfg[key])?'disabled':''}>${!enums[key].includes(cfg[key])?'<option value="" selected>Not supplied</option>':''}${enums[key].map(o=>`<option value="${o}" ${cfg[key]===o?'selected':''}>${OpsModal.label(o)}</option>`).join('')}</select></div>`;
    const version=OpsModal.count(d.version);
    body.innerHTML = `
      <button type="button" class="fg-action" onclick="OpsSensors.pfHome()">Back to profiles</button>
      <div class="fg-manager-header">
        <h3 class="fg-manager-title">${esc(d.name || 'Device profile')} <span class="lv-mono">${version!==null?'v'+version:'Version not supplied'}</span></h3>
        <span class="fg-timeline-meta">${assigned?assigned.length+' returned assignments · '+drift+' confirmed drifting'+(driftUnknown?' · '+driftUnknown+' with drift state not supplied':''):'Assignments unavailable'}</span>
      </div>
      ${knownConfig?'':OpsModal.textBlock('Configuration unavailable','Some configuration values were not supplied or are invalid. They are not filled with defaults, and this profile cannot be saved or assigned from this view.')}
      ${OpsModal.row([...fields,enumField('camera_mode','Camera mode'),enumField('firmware_channel','Firmware channel')],2)}
      <div class="fg-diagnostic-actions"><button class="fg-action fg-action-primary" ${!knownConfig || !canMng()?'disabled':''} onclick="OpsSensors.pfSave('${__sid(id)}')">Save new version</button></div>
      <div style="border-top:1px solid var(--border);margin-top:14px;padding-top:12px">
        <h3 class="fg-manager-title">Assign profile</h3>
        <div class="ops-modal-row fg-form-actions" style="--field-columns:3">
          ${OpsModal.field('Assignment scope', 'pf-target', 'select', '', { options: [{value:'',label:'Choose scope'},{ value: 'fleet', label: 'Whole fleet' }, { value: 'tag', label: 'Tag / group' }],disabled:!knownConfig || !canMng() })}
          ${OpsModal.field('Group tag', 'pf-tag', 'text', '', { required: false, placeholder: 'For tag / group',disabled:!knownConfig || !canMng() })}
          <button class="fg-action" ${!knownConfig || !canMng()?'disabled':''} onclick="OpsSensors.pfAssign('${__sid(id)}')">Assign profile</button>
        </div>
      </div>
      <h3 class="fg-manager-title">Version history</h3>${history?history.length?`<div class="fg-timeline">${history.map(h=>`<div class="fg-timeline-row"><span class="fg-timeline-icon">${OpsModal.entityIcon('settings')}</span><div><div class="fg-timeline-title">${OpsModal.count(h.version)!==null?'Version '+OpsModal.count(h.version):'Version not supplied'}</div><div class="fg-timeline-meta">${esc(h.changed_by_name || 'Actor not supplied')}${h.note?' · '+esc(h.note):''}</div></div><time class="fg-timeline-time">${OpsModal.fmtDateTime(h.changed_at)}</time></div>`).join('')}</div>`:OpsModal.emptyState('','No profile versions returned','The returned version history is empty.'):OpsModal.textBlock('History unavailable','Version history was not supplied; no absence of changes is inferred.')}`;
  }
  function _pfReadConfig() {
    const c = {};
    CFG_FIELDS.forEach(([k,label,min,max]) => { const el = document.getElementById('pf-' + k),value=el && !el.disabled?diagnosticNumber(el.value,min,max):null;if(value===null || !Number.isInteger(value))throw new Error('Supply a valid whole-number '+label.toLowerCase());c[k]=value; });
    c.camera_mode = (document.getElementById('pf-camera_mode') || {}).value;
    c.firmware_channel = (document.getElementById('pf-firmware_channel') || {}).value;
    if(!['off','event','continuous'].includes(c.camera_mode) || !['stable','beta','internal'].includes(c.firmware_channel))throw new Error('Camera mode and firmware channel must be supplied');
    if(c.high_level_pct>c.critical_level_pct)throw new Error('High-water threshold cannot exceed the critical threshold');
    return c;
  }
  async function pfSave(id) {
    if (!requireDeviceManage()) return;
    let config;try { config=_pfReadConfig(); }catch(err){return OpsModal.toast(err.message,'warning');}
    OpsModal.confirm('Save a new profile version? This queues updated configuration for devices already assigned to this profile.',async()=>{
      if(!requireDeviceManage())return;
      try { const r = await OpsModal.apiPut('/device-profiles/' + id, { config });
        const version=OpsModal.count(r.data?.version),affected=OpsModal.count(r.data?.repushed);
        OpsModal.toast(`Profile saved${version!==null?' as v'+version:''}; ${affected!==null?'configuration queued for '+affected+' devices':'affected-device count not supplied'}.`, 'success');pfOpen(id);
      }catch(err){OpsModal.toast(err.message || 'Failed to save','error');}
    });
  }
  async function pfAssign(id) {
    if (!requireDeviceManage()) return;
    const f = OpsModal.getFormData();
    if(!['fleet','tag'].includes(f['pf-target']) || f['pf-target']==='tag' && !String(f['pf-tag'] || '').trim())return OpsModal.toast('Choose an assignment scope and supply a tag when using a group.','warning');
    const target=f['pf-target']==='tag'?String(f['pf-tag']).trim():null;
    OpsModal.confirm(`Assign this profile to ${target?'tag '+target:'the whole fleet'}? This queues device configuration changes.`,async()=>{
      if(!requireDeviceManage())return;
      try { const r = await OpsModal.apiPost(`/device-profiles/${id}/assign`, { target_type:f['pf-target'],target_value:target });
        const assigned=OpsModal.count(r.data?.assigned);
        OpsModal.toast(assigned!==null?`Assignment accepted for ${assigned} device${assigned===1?'':'s'}; configuration queued.`:'Assignment accepted; affected-device count was not supplied.','success');pfOpen(id);await load(); }
      catch (err) { OpsModal.toast(err.message || 'Failed to assign', 'error'); }
    });
  }

  // ── Firmware releases & staged rollouts ───────────────────────────────
  function rolloutProgress(record) {
    const total=OpsModal.count(record?.total),updated=OpsModal.count(record?.updated);
    if (total===null || total <= 0 || updated===null || updated > total) return null;
    return Math.round(updated / total * 100);
  }
  const rolloutScope=record=>record.target_type==='fleet'?'Whole fleet':record.target_type==='tag' && typeof record.target_value==='string' && record.target_value.trim()?'Tag / group: '+record.target_value:'Scope not supplied';
  function firmwareManager() {
    OpsModal.open('Firmware & rollouts',
      '<div id="fw-body"><div style="padding:20px;color:var(--ink-3)">Loading…</div></div>',
      [{ label: 'Close', onclick: 'OpsModal.close()' }]);
    fwHome();
  }
  async function fwHome() {
    const body = document.getElementById('fw-body'); if (!body) return;
    let rel = [], ro = [], relError, roError;
    try { rel = OpsModal.readArray(await OpsModal.apiGet('/firmware/releases'),'Releases'); if(rel.some(r=>!r || typeof r!=='object' || Array.isArray(r)))throw new Error('Release records unavailable'); } catch (err) { rel=[]; relError=err; }
    try { ro = OpsModal.readArray(await OpsModal.apiGet('/firmware/rollouts'),'Rollouts'); if(ro.some(r=>!r || typeof r!=='object' || Array.isArray(r)))throw new Error('Rollout records unavailable'); } catch (err) { ro=[]; roError=err; }
    if(!document.contains(body))return;
    const relRows = rel.length ? rel.map(r => `<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:var(--fs-sm)">
        <div><b>${esc(r.version || 'Version not supplied')}</b> <span class="lv-status neutral" style="margin-left:6px">${OpsModal.label(r.channel)}</span>${r.notes ? `<div style="color:var(--ink-3);font-size:var(--fs-xs);margin-top:2px">${esc(r.notes)}</div>` : ''}</div>
        <div class="fg-number" style="color:var(--ink-3)">${OpsModal.count(r.devices_on_version) ?? 'Not supplied'} devices on version</div></div>`).join('')
      : relError ? OpsModal.failure('Releases',relError,'OpsSensors.fwHome()') : OpsModal.emptyState('','No releases returned','No firmware release records were returned by this directory.');
    const roRows = ro.length ? ro.map(r => {
        const progress = rolloutProgress(r);
        return `<button type="button" class="sn-act-row fg-action" style="width:100%;text-align:left" onclick="OpsSensors.fwOpenRollout('${esc(String(r.id).replace(/[^a-zA-Z0-9_-]/g,''))}')">
          <div><b>${esc(r.name || r.version)}</b> ${OpsModal.status(r.status,null,null,'rollout')}
            <div style="color:var(--ink-3);font-size:var(--fs-xs);margin-top:2px">Version ${esc(r.version || 'not supplied')} · ${esc(rolloutScope(r))} · ${progress === null ? 'Progress unavailable' : `${r.updated}/${r.total} updated (${progress}%)`}</div></div>
          <span aria-hidden="true" style="color:var(--ink-3)">›</span></button>`; }).join('')
      : roError ? OpsModal.failure('Rollouts',roError,'OpsSensors.fwHome()') : OpsModal.emptyState('','No rollouts returned','No staged firmware rollouts were returned by this directory.');
    body.innerHTML = `
      <h3 class="fg-manager-title">Releases</h3>${relRows}
      <div class="ops-modal-row fg-form-actions" style="--field-columns:3;margin:12px 0 20px">
        ${OpsModal.field('New version', 'fw-version', 'text', '', { required: false, placeholder: '2.4.1',disabled:!canMng() })}
        ${OpsModal.field('Channel', 'fw-channel', 'select', 'stable', { options: ['stable', 'beta', 'internal'].map(value=>({value,label:OpsModal.label(value)})),disabled:!canMng() })}
        <button class="fg-action" ${!canMng()?'disabled':''} onclick="OpsSensors.fwCreateRelease()">${OpsModal.actionIcon('create')}Add release</button>
      </div>
      <h3 class="fg-manager-title">Rollouts</h3>${roRows}
      ${rel.length ? `<div style="border-top:1px solid var(--border);margin-top:14px;padding-top:12px">
        <h3 class="fg-manager-title">Create rollout</h3>
        <div class="ops-modal-row" style="--field-columns:2">
          ${OpsModal.field('Release', 'ro-release', 'select', '', { options: [{value:'',label:'Choose release'},...rel.map(r => ({ value: String(r.id), label: (r.version || 'Version not supplied') + ' (' + OpsModal.label(r.channel) + ')' }))],disabled:!canMng() })}
          ${OpsModal.field('Assignment scope', 'ro-target', 'select', '', { options: [{value:'',label:'Choose scope'},{ value: 'fleet', label: 'Whole fleet' }, { value: 'tag', label: 'Tag / group' }],disabled:!canMng() })}
        </div>
        ${OpsModal.field('Group tag', 'ro-tag', 'text', '', { required: false, placeholder: 'Required for tag / group',disabled:!canMng() })}
        ${OpsModal.field('Rings (cumulative %)', 'ro-rings', 'text', '5, 25, 100', { required: false, placeholder: '5, 25, 100',disabled:!canMng() })}
        <p class="capability-note">Suggested rings are editable. Creating a rollout stages the selected devices; advancing a ring queues firmware updates.</p>
        <div class="fg-diagnostic-actions"><button class="fg-action fg-action-primary" ${!canMng()?'disabled':''} onclick="OpsSensors.fwCreateRollout()">${OpsModal.actionIcon('create')}Create rollout</button></div>
      </div>` : ''}`;
  }
  async function fwCreateRelease() {
    if (!requireDeviceManage()) return;
    const f = OpsModal.getFormData();
    if (!f['fw-version']) { OpsModal.toast('Enter a version.', 'warning'); return; }
    try { await OpsModal.apiPost('/firmware/releases', { version: f['fw-version'], channel: f['fw-channel'] }); OpsModal.toast('Release added.', 'success'); fwHome(); }
    catch (err) { OpsModal.toast(err.message || 'Failed', 'error'); }
  }
  async function fwCreateRollout() {
    if (!requireDeviceManage()) return;
    const f = OpsModal.getFormData();
    if (!f['ro-release']) { OpsModal.toast('Pick a release.', 'warning'); return; }
    const release=diagnosticNumber(f['ro-release'],1,Number.MAX_SAFE_INTEGER);
    const rings = String(f['ro-rings'] || '').split(',').map(s => diagnosticNumber(s.trim(),1,100));
    if(!Number.isSafeInteger(release) || !['fleet','tag'].includes(f['ro-target']) || f['ro-target']==='tag' && !String(f['ro-tag'] || '').trim())return OpsModal.toast('Choose a release and assignment scope; supply a tag for a group.','warning');
    if(rings.some(n=>n===null || !Number.isInteger(n)) || rings.some((n,i)=>i && n<=rings[i-1]) || rings[rings.length-1]!==100)return OpsModal.toast('Supply ascending whole-number ring percentages ending at 100.','warning');
    try {
      const r = await OpsModal.apiPost('/firmware/rollouts', {
        release_id: release, target_type: f['ro-target'],
        target_value: f['ro-target'] === 'tag' ? String(f['ro-tag']).trim() : null, rings });
      OpsModal.toast(`Rollout created; ${OpsModal.count(r.data?.total)!==null?OpsModal.count(r.data.total)+' devices staged':'staged-device count not supplied'}.`, 'success');
      fwOpenRollout(r.data.id);
    } catch (err) { OpsModal.toast(err.message || 'Failed to create rollout', 'error'); }
  }
  async function fwOpenRollout(id) {
    const body = document.getElementById('fw-body'); if (!body) return;
    body.innerHTML = '<div style="padding:20px;color:var(--ink-3)">Loading…</div>';
    let d; try { d = OpsModal.readRecord(await OpsModal.apiGet('/firmware/rollouts/' + id),'Firmware rollout'); } catch (err) { body.innerHTML = OpsModal.failure('Firmware rollout',err,`OpsSensors.fwOpenRollout('${__sid(id)}')`); return; }
    if(!document.contains(body))return;
    const records=value=>Array.isArray(value) && value.every(row=>row && typeof row==='object' && !Array.isArray(row))?value:null;
    const rings = records(d.rings);
    const count=value=>OpsModal.count(value) ?? 'Not supplied';
    const bar = r => { const w = rolloutProgress(r); if (w === null) return '<p class="capability-note">Progress unavailable</p>';
      return `<div style="height:6px;border-radius:var(--radius-micro);background:var(--surface-3);overflow:hidden;margin-top:6px"><div style="height:100%;width:${w}%;background:var(--ok)"></div></div>`; };
    const ringRows = rings?.map(r => `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;gap:8px;font-size:var(--fs-sm)"><b>${OpsModal.count(r.index)!==null?'Ring '+(OpsModal.count(r.index)+1):'Ring index not supplied'} · ${diagnosticNumber(r.percent,1,100)!==null?diagnosticNumber(r.percent,1,100)+'%':'Percentage not supplied'}</b>
          <span style="color:var(--ink-3)">${r.open===true?'Open':r.open===false?'Not opened':'Opening state not supplied'}</span></div>
        <div style="font-size:var(--fs-xs);color:var(--ink-3);margin-top:3px">${count(r.total)} devices · ${count(r.updated)} updated · ${count(r.queued)} queued · ${count(r.pending)} pending · <span style="color:${OpsModal.count(r.failed)>0?'var(--err)':'var(--ink-3)'}">${count(r.failed)} failed</span></div>
        ${bar(r)}</div>`).join('');
    const canAdvance = d.status === 'active' && OpsModal.count(d.current_ring)!==null && rings && d.current_ring < rings.length - 1;
    const disabled=canMng()?'':'disabled';
    const sid=__sid(id);
    const actions = [
      canAdvance ? `<button class="fg-action fg-action-primary" ${disabled} onclick="OpsSensors.fwAdvance('${sid}')">Advance to ring ${OpsModal.count(d.current_ring) + 2}</button>` : '',
      d.status === 'active' ? `<button class="fg-action" ${disabled} onclick="OpsSensors.fwState('${sid}','pause')">Pause rollout</button>` : '',
      d.status === 'paused' ? `<button class="fg-action" ${disabled} onclick="OpsSensors.fwState('${sid}','resume')">Resume rollout</button>` : '',
      ['active', 'paused'].includes(d.status) ? `<button class="fg-action danger" ${disabled} onclick="OpsSensors.fwRollback('${sid}')">Roll back</button>` : '',
      ['active', 'paused'].includes(d.status) ? `<button class="fg-action danger" ${disabled} onclick="OpsSensors.fwState('${sid}','cancel')">Cancel rollout</button>` : '',
    ].filter(Boolean).join(' ');
    const failures=records(d.failed);
    const failed = failures===null?OpsModal.textBlock('Failed-device records unavailable','This feed cannot establish whether any devices failed.'):failures.length?OpsModal.textBlock('Returned failed devices ('+failures.length+')',failures.map(x=>x.name || x.sensor_id || 'Unnamed device').join('\n')):OpsModal.emptyState('','No failed-device records returned','This is the returned failure list, not proof that every device updated successfully.');
    body.innerHTML = `
      <button type="button" class="fg-action" onclick="OpsSensors.fwHome()">Back to firmware</button>
      <div class="fg-manager-header">
        <h3 class="fg-manager-title">${esc(d.name || 'Firmware rollout')}</h3>
        <div class="fg-timeline-meta">Version ${esc(d.version || 'not supplied')} · ${esc(rolloutScope(d))} · ${count(d.total)} devices</div>
        ${OpsModal.status(d.status,null,null,'rollout')}
      </div>
      <h3 class="fg-manager-title">Rollout rings</h3>${rings?ringRows || OpsModal.emptyState('','No rollout rings returned','No stages were returned for this rollout.'):OpsModal.textBlock('Rollout rings unavailable','Stage records were missing or malformed. Progress is not inferred.')}
      ${failed}
      <div class="fg-diagnostic-actions">${actions}</div>`;
  }
  async function fwAdvance(id) {
    if (!requireDeviceManage()) return;
    OpsModal.confirm('Advance this rollout? Firmware updates are queued for eligible devices in the next ring; protected devices may be deferred.',async()=>{
      if(!requireDeviceManage())return;
      try { const r = await OpsModal.apiPost(`/firmware/rollouts/${id}/advance`, {});
        const m=r.data || {},ring=OpsModal.count(m.ring),queued=OpsModal.count(m.queued),deferred=OpsModal.count(m.deferred);
        OpsModal.toast(`Advance accepted${ring!==null?' for ring '+ring:''}; ${queued!==null?queued+' updates queued':'queued count not supplied'}; ${deferred!==null?deferred+' protected devices deferred':'deferred count not supplied'}.`,'success');fwOpenRollout(id);
      }catch(err){OpsModal.toast(err.message || 'Failed to advance','error');}
    });
  }
  async function fwState(id, action) {
    if (!requireDeviceManage()) return;
    if(!['pause','resume','cancel'].includes(action))return OpsModal.toast('Unsupported rollout action.','warning');
    const descriptions={pause:'Pause this rollout? Already queued device commands are not recalled.',resume:'Resume this rollout? The rollout becomes active again; advancing a ring is a separate action.',cancel:'Cancel this rollout? Already queued device commands are not recalled, and cancellation does not roll back firmware.'};
    OpsModal.confirm(descriptions[action],async()=>{
      if(!requireDeviceManage())return;
      try { await OpsModal.apiPost(`/firmware/rollouts/${id}/${action}`, {});OpsModal.toast('Rollout '+({pause:'paused',resume:'resumed',cancel:'cancelled'}[action])+'.','success');fwOpenRollout(id); }
      catch(err){OpsModal.toast(err.message || 'Failed','error');}
    });
  }
  function fwRollback(id) {
    if (!requireDeviceManage()) return;
    OpsModal.confirm('Roll back this rollout? Devices already updated/queued get re-flashed to their previous firmware.', async () => {
      if (!requireDeviceManage()) return;
      try { const r = await OpsModal.apiPost(`/firmware/rollouts/${id}/rollback`, {});const affected=OpsModal.count(r.data?.reverted);OpsModal.toast(affected!==null?`Rollback queued for ${affected} devices.`:'Rollback accepted; affected-device count not supplied.', 'success'); fwOpenRollout(id); }
      catch (err) { OpsModal.toast(err.message || 'Failed to roll back', 'error'); }
    });
  }

  // Per-device tag editor (comma-separated).
  function editTags(sensorId) {
    if (!requireDeviceManage()) return;
    const x = _all.find(s => s.sensor_id === sensorId) || {};
    OpsModal.open(`Manage tags — ${x.name || sensorId}`, `
      <p style="margin:0 0 10px;font-size:var(--fs-sm);color:var(--ink-3)">Comma-separated group tags — used for filtering and bulk actions (e.g. <code>lekki, ring-pilot, hw-v2</code>).</p>
      ${OpsModal.field('Tags', 'tags', 'text', (x.tags || []).join(', '), { required: false, placeholder: 'lekki, ring-pilot, hw-v2' })}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: 'Save tags', class: 'btn-primary', onclick: `OpsSensors.saveTags('${__sid(sensorId)}')` },
    ]);
  }
  async function saveTags(sensorId) {
    if (!requireDeviceManage()) return;
    const f = OpsModal.getFormData();
    const tags = (f.tags || '').split(',').map(s => s.trim()).filter(Boolean);
    OpsModal.setLoading(true);
    try {
      await OpsModal.apiPut(`/monitoring/sensors/${sensorId}/tags`, { tags });
      OpsModal.close();
      OpsModal.toast('Tags updated.', 'success');
      await load();
      if (_drawerId === sensorId) renderDrawer();
    } catch (err) { OpsModal.setLoading(false); OpsModal.toast(err.message || 'Failed to update tags', 'error'); }
  }

  // ── Lifecycle state + hardware inventory ──────────────────────────
  const LIFECYCLE_OPTS = [
    { value: 'inventory',   label: 'Inventory — received, not yet stocked' },
    { value: 'warehouse',   label: 'Warehouse — in stock' },
    { value: 'assigned',    label: 'Assigned — allocated to a site' },
    { value: 'installed',   label: 'Installed — mounted, not yet live' },
    { value: 'active',      label: 'Active — live in the field' },
    { value: 'maintenance', label: 'Maintenance — pulled for service' },
    { value: 'rma',         label: 'RMA — returned / faulty' },
    { value: 'retired',     label: 'Retired — decommissioned' },
  ];
  const _dval = v => v ? String(v).slice(0, 10) : '';

  function deviceRecord(sensorId) {
    if (!requireDeviceManage()) return;
    const x = _all.find(s => s.sensor_id === sensorId) || {};
    OpsModal.open(`Lifecycle & hardware — ${x.name || sensorId}`, `
      <p style="margin:0 0 12px;font-size:var(--fs-sm);color:var(--ink-3)">Lifecycle state is where the unit sits in its life — separate from its live health. Hardware identity is used for warranty, RMA and audit.</p>
      ${OpsModal.field('Lifecycle state', 'lifecycle_state', 'select', LIFECYCLE_OPTS.some(o=>o.value===x.lifecycle_state)?x.lifecycle_state:'', { options: [{value:'',label:'Not supplied — keep unchanged'},...LIFECYCLE_OPTS] })}
      ${OpsModal.field('Reason / note (optional)', 'lifecycle_note', 'text', '', { required: false, placeholder: 'e.g. moved to warehouse after site cancellation' })}
      <div style="height:1px;background:var(--line);margin:14px 0"></div>
      ${OpsModal.row([
        OpsModal.field('Serial number', 'serial_number', 'text', x.serial_number || '', { required: false, placeholder: 'FG-…' }),
        OpsModal.field('Hardware revision', 'hardware_rev', 'text', x.hardware_rev || '', { required: false, placeholder: 'v2.1' }),
      ])}
      ${OpsModal.row([
        OpsModal.field('Manufacturing batch', 'manufacturing_batch', 'text', x.manufacturing_batch || '', { required: false }),
        OpsModal.field('Modem IMEI', 'modem_imei', 'text', x.modem_imei || '', { required: false }),
      ])}
      ${OpsModal.row([
        OpsModal.field('SIM ICCID', 'sim_iccid', 'text', x.sim_iccid || '', { required: false }),
        OpsModal.field('Install date', 'install_date', 'date', _dval(x.install_date), { required: false }),
      ])}
      ${OpsModal.field('Warranty expires', 'warranty_expires_at', 'date', _dval(x.warranty_expires_at), { required: false })}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: 'View history', onclick: `OpsSensors.lifecycleLog('${__sid(sensorId)}')` },
      { label: 'Save device', class: 'btn-primary', onclick: `OpsSensors.saveDeviceRecord('${__sid(sensorId)}')` },
    ]);
  }
  async function saveDeviceRecord(sensorId) {
    if (!requireDeviceManage()) return;
    const x = _all.find(s => s.sensor_id === sensorId) || {};
    const f = OpsModal.getFormData();
    if(f.lifecycle_state && !LIFECYCLE_OPTS.some(o=>o.value===f.lifecycle_state))return OpsModal.toast('Choose a supplied lifecycle option or keep the state unchanged.','warning');
    OpsModal.setLoading(true);
    try {
      const hw = {
        serial_number: f.serial_number || null,
        hardware_rev: f.hardware_rev || null,
        manufacturing_batch: f.manufacturing_batch || null,
        modem_imei: f.modem_imei || null,
        sim_iccid: f.sim_iccid || null,
        install_date: f.install_date || null,
        warranty_expires_at: f.warranty_expires_at || null,
      };
      await OpsModal.apiPut(`/monitoring/sensors/${sensorId}/hardware`, hw);
      if (f.lifecycle_state && f.lifecycle_state !== x.lifecycle_state) {
        await OpsModal.apiPut(`/monitoring/sensors/${sensorId}/lifecycle`, { lifecycle_state: f.lifecycle_state, note: f.lifecycle_note || null });
      }
      OpsModal.close();
      OpsModal.toast('Device record updated.', 'success');
      await load();
      if (_drawerId === sensorId) renderDrawer();
    } catch (err) { OpsModal.setLoading(false); OpsModal.toast(err.message || 'Failed to update device record', 'error'); }
  }

  async function lifecycleLog(sensorId) {
    const x = _all.find(s => s.sensor_id === sensorId) || {};
    let events;
    try { events = OpsModal.readArray(await OpsModal.apiGet(`/monitoring/sensors/${sensorId}/lifecycle`),'Lifecycle history'); }
    catch (err) { OpsModal.open('Lifecycle history',OpsModal.failure('Lifecycle history',err,`OpsSensors.lifecycleLog('${__sid(sensorId)}')`),[{label:'Close',onclick:'OpsModal.close()'}]); return; }
    const names = {state_change:'State change',rma_out:'RMA sent',rma_in:'RMA returned',replaced_by:'Replaced',note:'Note'};
    const body = events.length ? events.map(e => `<div class="fg-timeline-row"><div class="fg-timeline-icon">${OpsModal.entityIcon('device')}</div><div><div class="fg-timeline-title">${esc(names[e.event] || OpsModal.label(e.event || 'Unknown event'))}</div>${e.from_state || e.to_state ? `<div class="fg-timeline-meta">${esc(OpsModal.label(e.from_state || 'unknown'))} → ${esc(OpsModal.label(e.to_state || 'unknown'))}</div>` : ''}${e.detail?.note || e.detail?.reason ? `<div class="fg-timeline-meta">${esc(e.detail.note || e.detail.reason)}</div>` : ''}</div><time class="fg-timeline-time">${OpsModal.fmtDateTime(e.created_at)}</time></div>`).join('') : OpsModal.emptyState('','No lifecycle events returned','No lifecycle records were returned for this device.');
    OpsModal.open(`Lifecycle history — ${x.name || sensorId}`, body, [{ label: 'Close', onclick: 'OpsModal.close()' }]);
  }

  // ── Replace device (RMA transfer) ─────────────────────────────────
  function replaceDevice(sensorId) {
    if (!requireDeviceManage()) return;
    const x = _all.find(s => s.sensor_id === sensorId) || {};
    const spares = _all.filter(s => s.sensor_id !== sensorId && ['inventory', 'warehouse', 'assigned'].includes(s.lifecycle_state));
    const pool = spares.length ? spares : _all.filter(s => s.sensor_id !== sensorId);
    if (!pool.length) { OpsModal.toast('No other device available to swap in.', 'error'); return; }
    const opts = [{value:'',label:'Choose replacement'},...pool.map(s => ({ value: s.sensor_id, label: `${s.name || s.sensor_id} (${s.sensor_id})${s.lifecycle_state ? ' · ' + OpsModal.label(s.lifecycle_state) : ''}` }))];
    OpsModal.open(`Replace device — ${x.name || sensorId}`, `
      <p style="margin:0 0 12px;font-size:var(--fs-sm);color:var(--ink-3)">Transfers this node's property, coverage, tags and config profile to the replacement. The faulty unit moves to <b>RMA</b>; the replacement goes <b>active</b>. Both are logged.</p>
      ${OpsModal.field('Replacement device', 'replacement_id', 'select', '', { options: opts })}
      ${OpsModal.field('Reason', 'reason', 'text', '', { required: false, placeholder: 'e.g. modem failure, no check-in for 9 days' })}
      ${spares.length ? '' : '<p style="margin:10px 0 0;font-size:var(--fs-xs);color:var(--warn)">No units in inventory/warehouse — showing all devices. Make sure the replacement is genuinely a spare.</p>'}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: 'Replace & transfer', class: 'btn-primary', onclick: `OpsSensors.doReplace('${__sid(sensorId)}')` },
    ]);
  }
  async function doReplace(sensorId) {
    if (!requireDeviceManage()) return;
    const f = OpsModal.getFormData();
    if (!f.replacement_id || f.replacement_id===sensorId || !_all.some(s=>s.sensor_id===f.replacement_id)) { OpsModal.toast('Choose another returned device as the replacement.', 'warning'); return; }
    OpsModal.confirm('Replace this device and transfer its estate, coverage, tags and profile assignments? The current device record moves to RMA and the replacement record becomes active. This does not prove the physical replacement has been installed.',async()=>{
    if(!requireDeviceManage())return;
    OpsModal.setLoading(true);
    try {
      await OpsModal.apiPost(`/monitoring/sensors/${sensorId}/replace`, { replacement_sensor_id: f.replacement_id, note: f.reason || null });
      OpsModal.close();
      OpsModal.toast('Device replaced. Assignments transferred.', 'success');
      await load();
      if (_drawerId === sensorId) { _drawerId = f.replacement_id; renderDrawer(); }
    } catch (err) { OpsModal.setLoading(false); OpsModal.toast(err.message || 'Failed to replace device', 'error'); }
    });
  }

  // ── Component topology tree (derived client-side from the node payload) ──
  const _TONE = { ok: 'var(--ok)', warn: 'var(--warn)', err: 'var(--err)', info: 'var(--blue-hi)', muted: 'var(--ink-3)' };
  function diagnosticNumber(value,min=-Infinity,max=Infinity) {
    if(!['number','string'].includes(typeof value) || typeof value==='string' && !value.trim())return null;
    const number=Number(value);return Number.isFinite(number) && number>=min && number<=max?number:null;
  }
  function diagnosticPosition(lat,lng) {
    const latitude=diagnosticNumber(lat,-90,90),longitude=diagnosticNumber(lng,-180,180);
    return latitude!==null && longitude!==null?[latitude,longitude]:null;
  }
  function _battTone(p) { return ({'var(--err)':'err','var(--warn)':'warn','var(--ok)':'ok'})[OpsModal.vitalColor(p)] || 'muted'; }
  const _sigTone=_battTone;
  function diagnosticTone(value,domain) { return ({danger:'err',neutral:'muted'})[OpsModal.statusTone(value,domain)] || OpsModal.statusTone(value,domain); }
  function _dataTone(s) { return diagnosticTone(s,'sensordata'); }

  function topologyTree(x) {
    const cap = x.capabilities || {};
    const offline = x.device_state === 'offline' || x.device_state === 'maintenance';
    const rootTone = diagnosticTone(x.device_state,'device');
    const comps = [];
    const add = (label, value, tone, sub) => comps.push({ label, value, tone, sub });
    const level=diagnosticNumber(x.level,0,100),flow=diagnosticNumber(x.flow_rate,0),silt=diagnosticNumber(x.silt_depth_mm,0),enzyme=diagnosticNumber(x.enzyme_level_percent,0,100),ph=diagnosticNumber(x.water_quality_ph,0,14),turbidity=diagnosticNumber(x.turbidity_ntu,0),battery=diagnosticNumber(x.battery_percent,0,100),voltage=diagnosticNumber(x.battery_voltage,0),signal=diagnosticNumber(x.signal_strength,0,100),temperature=diagnosticNumber(x.temperature),gps=diagnosticPosition(x.latitude,x.longitude);

    if (cap.water_level !== false && (cap.water_level === true || x.level != null))
      add('Level sensor', level!==null ? `${Math.round(level)}%` : 'Not supplied', offline || level===null ? 'muted' : _dataTone(x.sensor_state), offline ? 'Device ' + OpsModal.label(x.device_state) : x.sensor_reason);
    if (cap.flow_rate !== false && (cap.flow_rate === true || x.flow_rate != null))
      add('Flow sensor', flow!==null ? `${flow.toFixed(1)} L/s` : 'Not supplied', 'muted');
    if (cap.silt===true || x.silt_depth_mm!=null)
      add('Silt probe', silt!==null ? `${silt} mm` : 'Not supplied', 'muted');
    if (x.enzyme_level_percent != null || cap.enzyme===true)
      add('Enzyme dosing', enzyme!==null ? `${Math.round(enzyme)}%` : (x.cartridge_status ? OpsModal.label(x.cartridge_status):'Not supplied'), enzyme===null || offline?'muted':enzyme<20?'warn':'ok');
    if (x.water_quality_ph != null || x.turbidity_ntu != null)
      add('Water quality', [ph!==null ? `pH ${ph}` : null, turbidity!==null ? `${turbidity} NTU` : null].filter(Boolean).join(' · ') || 'Not supplied', 'muted');
    add('Battery / power', battery!==null ? `${battery}%` : 'Not supplied', _battTone(battery), voltage!==null ? `${voltage.toFixed(2)} V` : null);
    add('Modem / uplink', offline ? OpsModal.label(x.device_state) : (signal!==null ? `${signal}%` : 'Not supplied'), offline ? diagnosticTone(x.device_state,'device') : _sigTone(signal), x.link_type || null);
    if (x.temperature != null)
      add('Reported temperature', temperature!==null?`${Math.round(temperature)}°C`:'Not supplied', 'muted');
    add('Reported GPS', gps?gps.map(v=>v.toFixed(4)).join(', '):'Not supplied', 'muted');

    const dot = t => `<span style="width:8px;height:8px;border-radius:50%;background:${_TONE[t] || _TONE.muted};display:inline-block;flex:0 0 auto"></span>`;
    const rows = comps.map(c => `
      <div style="display:flex;align-items:center;gap:10px;padding:7px 0 7px 18px;position:relative">
        <span style="position:absolute;left:0;top:0;bottom:50%;width:11px;border-left:1px solid var(--line);border-bottom:1px solid var(--line);border-bottom-left-radius:0"></span>
        ${dot(c.tone)}
        <span style="font-size:var(--fs-sm);color:var(--ink-2);flex:1 1 auto;min-width:0">${esc(c.label)}${c.sub ? `<span style="color:var(--ink-4);font-size:var(--fs-2xs)"> · ${esc(c.sub)}</span>` : ''}</span>
        <span style="font-size:var(--fs-sm);font-weight:600;color:var(--ink);white-space:nowrap">${esc(c.value)}</span>
      </div>`).join('');

    return `
      <div class="sn-topo" style="padding:2px 2px 6px">
        <div style="display:flex;align-items:center;gap:10px;padding:6px 0;font-weight:700">
          ${dot(rootTone)}
          <span style="font-size:var(--fs-sm);color:var(--ink);flex:1 1 auto;min-width:0">${esc(x.name || x.sensor_id)}</span>
          ${OpsModal.status(x.device_state || 'unknown',null,null,'device')}
        </div>
        <div style="margin-left:4px">${rows}</div>
      </div>`;
  }

  // ── Unified event timeline (maintenance + commands + lifecycle) ──────────
  async function timeline(sensorId) {
    const x = _all.find(s => s.sensor_id === sensorId) || {};
    let feed;
    try { feed = OpsModal.readArray(await OpsModal.apiGet(`/monitoring/sensors/${sensorId}/timeline`),'Event timeline'); }
    catch (err) { OpsModal.open('Event timeline',OpsModal.failure('Event timeline',err,`OpsSensors.timeline('${__sid(sensorId)}')`),[{label:'Close',onclick:'OpsModal.close()'}]); return; }
    const SRC = {maintenance:['maintenance','Maintenance'],command:['device','Command'],lifecycle:['device','Lifecycle'],integrity:['device','Integrity']};
    const body = feed.length ? feed.map(e => `<div class="fg-timeline-row"><div class="fg-timeline-icon">${OpsModal.entityIcon(SRC[e.source]?.[0] || 'device')}</div><div><div class="fg-timeline-title">${esc(e.title || OpsModal.label(e.kind || 'Unknown event'))}</div>${e.detail ? `<div class="fg-timeline-meta">${esc(e.detail)}</div>` : ''}<div class="fg-timeline-meta">${esc(SRC[e.source]?.[1] || OpsModal.label(e.source || 'Source not supplied'))}${e.actor ? ' · '+esc(e.actor) : ''}</div></div><time class="fg-timeline-time">${OpsModal.fmtDateTime(e.ts)}</time></div>`).join('') : OpsModal.emptyState('','No timeline events returned','No maintenance, command or lifecycle events were returned for this device.');
    OpsModal.open(`Event timeline — ${x.name || sensorId}`, body, [{ label: 'Close', onclick: 'OpsModal.close()' }]);
  }

  // ── Per-domain drawer panels (connectivity / power / calibration) ────────
  // (uses the shared _ago() relative-time helper defined below)
  const _prow = (label, value, tone) => `
    <div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--line)">
      <span style="font-size:var(--fs-sm);color:var(--ink-3)">${esc(label)}</span>
      <span style="font-size:var(--fs-sm);font-weight:600;color:${tone ? (_TONE[tone] || 'var(--ink)') : 'var(--ink)'};text-align:right">${value}</span>
    </div>`;
  const _qa = (sid, type, label) => `<button class="fg-action" ${!canMng()?'disabled':''} onclick="OpsSensors.sendCommand('${__sid(sid)}','${type}')">${esc(label)}</button>`;
  const _qaWrap = html => `<div class="fg-diagnostic-actions">${html}</div>`;

  function connectivityPanel(sensorId) {
    const x = _all.find(s => s.sensor_id === sensorId) || {};
    const offline = x.device_state === 'offline' || x.device_state === 'maintenance';
    const sig = diagnosticNumber(x.signal_strength,0,100),position=diagnosticPosition(x.latitude,x.longitude);
    const band = offline ? ['Reported offline', diagnosticTone(x.device_state,'device')] : sig === null ? ['Unknown', 'muted'] : sig>=50?['Healthy',_sigTone(sig)]:sig>=20?['Low',_sigTone(sig)]:['Critical',_sigTone(sig)];
    const dstate = diagnosticTone(x.device_state,'device');
    const last = x.last_ping || x.reading_time;
    const body = `
      ${_prow('Uplink state', `${esc(OpsModal.label(x.device_state || 'unknown'))}${x.device_reason ? ` <span style="color:var(--ink-4);font-weight:400">· ${esc(x.device_reason)}</span>` : ''}`, dstate)}
      ${_prow('Signal quality', `${sig != null && !offline ? sig + '% · ' : ''}${band[0]}`, band[1])}
      ${_prow('Link type', esc(OpsModal.label(x.link_type)))}
      ${_prow('Last check-in', `${_ago(last)}${last ? ` <span style="color:var(--ink-4);font-weight:400">· ${OpsModal.fmtDateTime(last)}</span>` : ''}`)}
      ${_prow('Modem IMEI', x.modem_imei ? esc(x.modem_imei) : '—')}
      ${_prow('SIM ICCID', x.sim_iccid ? esc(x.sim_iccid) : '—')}
      ${_prow('Reported GPS', position ? position.map(v=>v.toFixed(4)).join(', ') : 'Not supplied',position?'info':'muted')}
      ${_qaWrap(_qa(sensorId, 'connectivity_test', 'Test uplink') + _qa(sensorId, 'reconnect_modem', 'Reconnect modem') + _qa(sensorId, 'refresh_gps', 'Refresh GPS') + _qa(sensorId, 'force_sync', 'Force sync'))}`;
    OpsModal.open(`Connectivity — ${x.name || sensorId}`, body, [{ label: 'Close', onclick: 'OpsModal.close()' }]);
  }

  function powerPanel(sensorId) {
    const x = _all.find(s => s.sensor_id === sensorId) || {};
    const b = diagnosticNumber(x.battery_percent,0,100),voltage=diagnosticNumber(x.battery_voltage,0);
    const band = b === null ? ['Unknown', 'muted'] : b >= 50 ? ['Healthy', _battTone(b)] : b >= 20 ? ['Low', _battTone(b)] : ['Critical', _battTone(b)];
    const t = diagnosticNumber(x.temperature);
    const body = `
      ${_prow('Battery charge', b != null ? `${b}% · ${band[0]}` : 'Unknown', band[1])}
      ${_prow('Battery voltage', voltage!==null ? `${voltage.toFixed(2)} V` : 'Not supplied')}
      ${_prow('Reported temperature', t!==null ? `${Math.round(t)}°C` : 'Not supplied')}
      ${_prow('Power source', esc(x.power_source?OpsModal.label(x.power_source):'Not supplied'))}
      ${_prow('Reporting node', esc(OpsModal.label(x.device_state || 'unknown')), diagnosticTone(x.device_state,'device'))}
      ${b!==null && b<20 ? OpsModal.textBlock('Power review','Reported battery charge is critical. Confirm the power condition before scheduling a replacement; charge alone does not establish battery health.') : ''}
      ${_qaWrap(_qa(sensorId, 'self_test', 'Run self-test') + _qa(sensorId, 'force_sync', 'Force sync'))}`;
    OpsModal.open(`Power & battery — ${x.name || sensorId}`, body, [{ label: 'Close', onclick: 'OpsModal.close()' }]);
  }

  function calibrationPanel(sensorId) {
    const x = _all.find(s => s.sensor_id === sensorId) || {};
    const dueText=OpsModal.fmtDateTime(x.calibration_due_at),due=dueText!=='—';
    const overdue=due && OpsModal.pastDue(x.calibration_due_at);
    const dueTone=due?overdue?'err':'muted':'muted';
    const dueTxt=due?(overdue?'Overdue · ':'')+dueText:'Not supplied';
    const isBio = x.enzyme_level_percent != null || x.cartridge_status;
    const enzyme=diagnosticNumber(x.enzyme_level_percent,0,100);
    const chan = [];
    if ((x.capabilities || {}).water_level !== false) chan.push(['Level', x.sensor_state, x.sensor_reason]);
    const dt = s => diagnosticTone(s,'sensordata');
    const body = `
      ${_prow('Last calibrated', x.last_calibrated_at ? `${_ago(x.last_calibrated_at)} · ${OpsModal.fmtDate(x.last_calibrated_at)}` : 'Not supplied')}
      ${_prow('Next due', dueTxt, dueTone)}
      ${chan.map(c => _prow(`${c[0]} channel`, `${esc(OpsModal.label(c[1] || 'unknown'))}${c[2] ? ` <span style="color:var(--ink-3);font-weight:400">· ${esc(c[2])}</span>` : ''}`, dt(c[1]))).join('')}
      ${isBio ? _prow('Enzyme level', enzyme!==null ? `${Math.round(enzyme)}%` : 'Not supplied', enzyme===null?'muted':enzyme<20?'warn':'ok') : ''}
      ${isBio ? _prow('Cartridge', esc(OpsModal.label(x.cartridge_status))) : ''}
      ${overdue ? OpsModal.textBlock('Calibration review','The recorded calibration due date has passed. Confirm inspection and calibration evidence before updating the record; logging a calibration does not prove a device command ran.') : ''}
      <div class="fg-diagnostic-actions">
        <button class="fg-action" ${!canMng()?'disabled':''} onclick="OpsSensors.calibrate('${__sid(sensorId)}')">Log calibration</button>
        ${_qa(sensorId, 'recalibrate', 'Request recalibration')}
      </div>`;
    OpsModal.open(`Calibration — ${x.name || sensorId}`, body, [{ label: 'Close', onclick: 'OpsModal.close()' }]);
  }

  // ── Integrity panel (time-sync / geofence / tamper) ─────────────────────
  function integrityPanel(sensorId) {
    const x = _all.find(s => s.sensor_id === sensorId) || {};
    const skew = diagnosticNumber(x.last_clock_skew_seconds);
    const skewTone = skew == null ? 'muted' : Math.abs(skew) >= 300 ? 'err' : Math.abs(skew) >= 60 ? 'warn' : 'ok';
    const skewTxt = skew === null ? 'Not supplied' : `${skew > 0 ? '+' : ''}${Math.abs(skew) < 120 ? skew + ' s' : Math.round(skew / 60) + ' min'}${x.clock_synced_at ? ` · ${OpsModal.fmtDateTime(x.clock_synced_at)}` : ''}`;
    const anchor=diagnosticPosition(x.geofence_center_lat,x.geofence_center_lng),gps=diagnosticPosition(x.latitude,x.longitude),radius=diagnosticNumber(x.geofence_radius_m,10,100000),distance=diagnosticNumber(x.geofence_distance_m,0);
    const gf = x.geofence_state;
    const gfTone = gf === 'breach' ? 'err' : gf === 'inside' ? 'ok' : 'muted';
    const gfTxt = gf === 'breach' ? `Breach${distance!==null?' · '+distance+' m from anchor':''}`
      : gf === 'inside' ? `Inside${distance!==null?' · '+distance+' m from anchor':''}`
      : 'Not supplied';
    const tamper = typeof x.tamper_flagged==='boolean'?x.tamper_flagged:null;
    const body = `
      <h3 class="fg-timeline-title">Time sync</h3>
      ${_prow('Clock skew', skewTxt, skewTone)}
      <h3 class="fg-timeline-title">Geofence</h3>
      ${_prow('Reported state', gfTxt, gfTone)}
      ${_prow('Radius', radius!==null?`${radius} m`:'Not supplied')}
      ${_prow('Anchor', anchor ? anchor.map(v=>v.toFixed(4)).join(', ') : 'Not supplied')}
      <h3 class="fg-timeline-title">Tamper</h3>
      ${_prow('Reported state', tamper===null?'Not supplied':tamper ? `Flagged${x.tamper_at?' · '+OpsModal.fmtDateTime(x.tamper_at):''}` : 'Clear', tamper===null?'muted':tamper ? 'err' : 'ok')}
      ${tamper && x.tamper_reason ? _prow('Reason', esc(x.tamper_reason)) : ''}
      <div class="fg-diagnostic-actions">
        <button class="fg-action" ${!canMng() || !gps?'disabled':''} onclick="OpsSensors.setGeofenceAnchor('${__sid(sensorId)}')">Anchor to reported GPS</button>
        <button class="fg-action" ${!canMng()?'disabled':''} onclick="OpsSensors.editGeofence('${__sid(sensorId)}')">Edit geofence</button>
        ${tamper
          ? `<button class="fg-action" ${!canMng()?'disabled':''} onclick="OpsSensors.clearTamper('${__sid(sensorId)}')">Clear tamper</button>`
          : `<button class="fg-action danger" ${!canMng()?'disabled':''} onclick="OpsSensors.flagTamper('${__sid(sensorId)}')">Flag tamper</button>`}
      </div>`;
    OpsModal.open(`Integrity — ${x.name || sensorId}`, body, [{ label: 'Close', onclick: 'OpsModal.close()' }]);
  }

  function setGeofenceAnchor(sensorId) {
    if (!requireDeviceManage()) return;
    const x = _all.find(s => s.sensor_id === sensorId) || {};
    const position=diagnosticPosition(x.latitude,x.longitude);
    if (!position) { OpsModal.toast('Device has no valid reported GPS position to anchor to.', 'error'); return; }
    OpsModal.confirm(`Pin the geofence anchor to this device's reported position (${position.map(v=>v.toFixed(4)).join(', ')})? Future GPS reports are measured against it.`, async () => {
      if (!requireDeviceManage()) return;
      try {
        await OpsModal.apiPut(`/monitoring/sensors/${sensorId}/geofence`, { anchor: true });
        OpsModal.toast('Geofence anchored.', 'success');
        await load(); if (_drawerId === sensorId) renderDrawer();
      } catch (err) { OpsModal.toast(err.message || 'Failed to anchor geofence', 'error'); }
    });
  }
  function editGeofence(sensorId) {
    if (!requireDeviceManage()) return;
    const x = _all.find(s => s.sensor_id === sensorId) || {};
    const anchor=diagnosticPosition(x.geofence_center_lat,x.geofence_center_lng),radius=diagnosticNumber(x.geofence_radius_m,10,100000);
    OpsModal.open(`Edit geofence — ${x.name || sensorId}`, `
      <p style="margin:0 0 12px;font-size:var(--fs-sm);color:var(--ink-3)">Set the fence centre and how far the device may report from it before a breach is raised. Leave the centre blank to keep the current anchor.</p>
      ${OpsModal.row([
        OpsModal.field('Centre latitude', 'center_lat', 'number', anchor?anchor[0]:'', { required: false,min:-90,max:90,step:'any',placeholder:'-90 to 90' }),
        OpsModal.field('Centre longitude', 'center_lng', 'number', anchor?anchor[1]:'', { required: false,min:-180,max:180,step:'any',placeholder:'-180 to 180' }),
      ])}
      ${OpsModal.field('Radius (metres)', 'radius_m', 'number', radius!==null?radius:'', { required:true,min:10,max:100000,step:1,placeholder:'10–100000' })}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: 'Save geofence', class: 'btn-primary', onclick: `OpsSensors.saveGeofence('${__sid(sensorId)}')` },
    ]);
  }
  async function saveGeofence(sensorId) {
    if (!requireDeviceManage()) return;
    const f = OpsModal.getFormData();
    const x=_all.find(s=>s.sensor_id===sensorId) || {};
    const blank=v=>v==null || typeof v==='string' && !v.trim();
    if(blank(f.center_lat)!==blank(f.center_lng)){OpsModal.toast('Set both latitude and longitude, or leave both blank.','error');return;}
    const anchor=blank(f.center_lat)?diagnosticPosition(x.geofence_center_lat,x.geofence_center_lng):diagnosticPosition(f.center_lat,f.center_lng);
    const radius=diagnosticNumber(f.radius_m,10,100000);
    if(!anchor){OpsModal.toast('Supply a valid latitude and longitude, or preserve a supplied anchor.','error');return;}
    if(radius===null || !Number.isInteger(radius)){OpsModal.toast('Enter a whole-metre radius from 10 to 100000.','error');return;}
    const payload={center_lat:anchor[0],center_lng:anchor[1],radius_m:radius};
    OpsModal.setLoading(true);
    try {
      await OpsModal.apiPut(`/monitoring/sensors/${sensorId}/geofence`, payload);
      OpsModal.close(); OpsModal.toast('Geofence updated.', 'success');
      await load(); if (_drawerId === sensorId) renderDrawer();
    } catch (err) { OpsModal.setLoading(false); OpsModal.toast(err.message || 'Failed to update geofence', 'error'); }
  }

  function flagTamper(sensorId) {
    if (!requireDeviceManage()) return;
    const x = _all.find(s => s.sensor_id === sensorId) || {};
    OpsModal.open(`Flag tamper — ${x.name || sensorId}`, `
      <p style="margin:0 0 12px;font-size:var(--fs-sm);color:var(--ink-3)">Mark this device as suspected tampered — it stays flagged until an inspection clears it.</p>
      ${OpsModal.field('Reason', 'reason', 'text', '', { required: true, placeholder: 'e.g. enclosure found open on site visit' })}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: 'Flag tamper', class: 'btn-danger', onclick: `OpsSensors.doTamper('${__sid(sensorId)}', true)` },
    ]);
  }
  function clearTamper(sensorId) {
    if (!requireDeviceManage()) return;
    const x = _all.find(s => s.sensor_id === sensorId) || {};
    OpsModal.open(`Clear tamper — ${x.name || sensorId}`, `
      <p style="margin:0 0 12px;font-size:var(--fs-sm);color:var(--ink-3)">Confirm the device has been inspected and is intact. This is logged against your name.</p>
      ${OpsModal.field('Note (optional)', 'reason', 'text', '', { required: false, placeholder: 'e.g. inspected, seal intact' })}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: 'Clear tamper', class: 'btn-primary', onclick: `OpsSensors.doTamper('${__sid(sensorId)}', false)` },
    ]);
  }
  async function doTamper(sensorId, flagged) {
    if (!requireDeviceManage()) return;
    const f = OpsModal.getFormData();
    if (flagged && (!f.reason || !f.reason.trim())) { OpsModal.toast('A reason is required.', 'error'); return; }
    OpsModal.setLoading(true);
    try {
      await OpsModal.apiPost(`/monitoring/sensors/${sensorId}/tamper`, { flagged: !!flagged, reason: f.reason || null });
      OpsModal.close();
      OpsModal.toast(flagged ? 'Device flagged for tamper.' : 'Tamper cleared.', 'success');
      await load(); if (_drawerId === sensorId) renderDrawer();
    } catch (err) { OpsModal.setLoading(false); OpsModal.toast(err.message || 'Failed to update tamper flag', 'error'); }
  }

  // ══════════════════════════════════════════════════════════════
  //  RIGHT-SIDE DETAIL DRAWER — matches the Figma slide-over exactly:
  //  header (name + estate), status badge, metric rows, firmware +
  //  update badge, then an ACTIONS list (not buttons in a row).
  // ══════════════════════════════════════════════════════════════
  function viewSensor(sensorId, defaultCommand) {
    // Exact-record navigation retries while the fleet read settles; loading is
    // not evidence that the linked device is missing.
    if (_fleetReads && !_all.some(s=>s.sensor_id===sensorId)) return;
    if(!_all.some(s=>s.sensor_id===sensorId))return OpsModal.toast('Device record is unavailable; refresh the fleet before opening controls','watch');
    if(!_drawerId){_drawerOpener=document.activeElement;_drawerBackground=document.querySelector('.app-neon');_drawerBackgroundInert=!!_drawerBackground?.inert;if(_drawerBackground)_drawerBackground.inert=true;}
    _drawerId = sensorId;
    renderDrawer();
    if (defaultCommand) sendCommand(sensorId, defaultCommand);
  }

  function closeDrawer() {
    _drawerId = null;
    disposeViewer();
    const el = document.getElementById('sn-drawer-overlay');
    if (el) el.remove();
    if(_drawerBackground)_drawerBackground.inert=_drawerBackgroundInert;
    _drawerBackground=null;
    if(_drawerOpener?.isConnected && typeof _drawerOpener.focus==='function')_drawerOpener.focus();
    _drawerOpener=null;
  }

  function eventDetail(detail) {
    if (!detail || typeof detail !== 'object') return esc(detail ?? OpsModal.missing.absent);
    const note=typeof detail.note==='string' ? detail.note : '';
    const technical=Array.isArray(detail) || Object.keys(detail).some(key=>key!=='note');
    return (note ? esc(note) : '')+(technical ? `<details class="fg-technical"><summary>Technical event details</summary><pre>${esc(JSON.stringify(detail,null,2))}</pre></details>` : note ? '' : OpsModal.missing.absent);
  }

  function telemetryMarkup(x) {
    const cap=x.capabilities || {};
    const value=(key,min=-Infinity,max=Infinity)=>diagnosticNumber(x[key],min,max);
    const number=(key,unit,min=-Infinity,max=Infinity,precision=null)=>{const n=value(key,min,max);return n===null?'Not supplied':(precision===null?String(n):n.toFixed(precision))+unit;};
    const card=(label,content)=>`<div class="sn-card"><div class="sn-card-k">${esc(label)}</div><div class="sn-card-v${['Water level','Flow rate','Silt depth','Battery','Signal','Reported temperature'].includes(label) && !content.includes('Not supplied')?'':' fg-device-text'}">${content}</div></div>`;
    const reading=[];
    if(cap.water_level===true || cap.water_level!==false && x.level!=null)reading.push(card('Water level',`<span style="color:${levelColor(value('level',0,100),x.data_trust)}">${number('level','%',0,100)}</span>`));
    if(cap.flow_rate===true || cap.flow_rate!==false && x.flow_rate!=null)reading.push(card('Flow rate',number('flow_rate',' L/s',0,Infinity,1)));
    if(cap.silt===true || x.silt_depth_mm!=null)reading.push(card('Silt depth',number('silt_depth_mm',' mm',0)));
    const lifecycle=LIFECYCLE_OPTS.find(o=>o.value===x.lifecycle_state);
    const driver=x.driver_native===true?'Sentinel (native)':typeof x.driver_name==='string' && x.driver_name.trim()?x.driver_name:'Not supplied';
    const device=[
      card('Battery',`<span style="color:${OpsModal.vitalColor(value('battery_percent',0,100))}">${number('battery_percent','%',0,100)}</span>`),
      card('Signal',`<span style="color:${OpsModal.vitalColor(value('signal_strength',0,100))}">${number('signal_strength','%',0,100)}</span>`),
      card('Reported temperature',number('temperature','°C')),
      card('Firmware',esc(x.firmware_version || 'Not supplied')),
      card('Config profile',esc(x.profile_name || 'Not supplied')+(x.config_state?' · '+OpsModal.label(x.config_state):'')),
      card('Lifecycle',lifecycle?OpsModal.label(lifecycle.value):'Not supplied'),
      card('Serial',esc(x.serial_number || 'Not supplied')),
      card('Warranty',OpsModal.fmtDate(x.warranty_expires_at)),
      card('Driver',esc(driver))
    ];
    return `<div class="sn-sec-h">State</div><div class="sn-cards">${stateCards(x)}</div>${reading.length?'<div class="sn-sec-h">Readings</div><div class="sn-cards">'+reading.join('')+'</div>':''}<div class="sn-sec-h">Device</div><div class="sn-cards">${device.join('')}</div><div class="sn-sec-h">Components</div>${topologyTree(x)}`;
  }
  function renderDrawer() {
    const x = _all.find(s => s.sensor_id === _drawerId);
    if (!x) return;
    let overlay = document.getElementById('sn-drawer-overlay');
    const focusOnOpen=!overlay;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'sn-drawer-overlay';
      overlay.className = 'sn-drawer-overlay';
      overlay.addEventListener('click', e => { if (e.target === overlay) closeDrawer(); });
      overlay.addEventListener('keydown',drawerDialogKey);
      document.body.appendChild(overlay);
    }
    const tier = healthTier(x);
    const sid = __sid(x.sensor_id);

    overlay.innerHTML = `
      <div class="sn-drawer" role="dialog" aria-modal="true" aria-labelledby="sn-drawer-title" tabindex="-1" onclick="event.stopPropagation()">
        <div class="sn-drawer-head">
          <div style="min-width:0">
            <div class="sn-crumb">Device fleet <span>›</span> ${esc(propertyOf(x))}</div>
            <div class="sn-drawer-title" id="sn-drawer-title">${esc(x.name || x.sensor_id)}</div>
            <div class="sn-status-line">
              <span class="sn-tok id">${esc(x.sensor_id)}</span>
              <span class="sep">·</span>
              ${OpsModal.status(tier==='healthy'?'online':tier,null,null,'device')}
              ${(x.integrity_state === 'warning' || x.integrity_state === 'critical') ? `<span class="sep">·</span><span title="${esc((x.integrity_reasons || []).join('; '))}">${OpsModal.status(x.integrity_state,x.integrity_state==='critical'?'Critical integrity alert':'Integrity warning',null,'integrity')}</span>` : ''}
            </div>
            ${(x.tags && x.tags.length) ? `<div style="margin-top:7px;display:flex;flex-wrap:wrap;gap:5px">${x.tags.map(t => `<span style="font-size:var(--fs-2xs);font-weight:600;color:var(--blue-hi);background:var(--neon-trace);border:1px solid var(--blue-dim);padding:2px 8px;border-radius:var(--radius-pill)">#${esc(t)}</span>`).join('')}</div>` : ''}
          </div>
          <div class="sn-head-actions">
            <button class="sn-icon-btn" title="Send command" onclick="OpsSensors.queueCommand('${sid}')" aria-label="Commands">
              ${OpsModal.entityIcon('more')}
            </button>
            <button class="sn-drawer-close" onclick="OpsSensors.closeDrawer()" aria-label="Close">
              ${OpsModal.entityIcon('close')}
            </button>
          </div>
        </div>
        <div class="sn-drawer-body">
          <div class="sn-3d" id="sn-3d">
            <div class="sn-3d-state" id="sn-3d-state"><span class="sn-3d-spin"></span>Loading 3D model…</div>
            <div class="sn-3d-hint">Drag to rotate · scroll to zoom</div>
          </div>

          <div class="sn-actionbar">
            <button type="button" class="fg-action fg-action-primary" onclick="OpsSensors.openFull('${sid}')">Open full details</button>
          </div>

          <div class="sn-tabs" role="tablist" aria-label="Device inspector" onkeydown="OpsSensors.drawerKey(event)">
            <button type="button" class="sn-tab active" id="sn-tab-telemetry" role="tab" aria-selected="true" aria-controls="sn-panel-telemetry" tabindex="0" data-tab="telemetry" onclick="OpsSensors.drawerTab('telemetry')">Telemetry</button>
            <button type="button" class="sn-tab" id="sn-tab-actions" role="tab" aria-selected="false" aria-controls="sn-panel-actions" tabindex="-1" data-tab="actions" onclick="OpsSensors.drawerTab('actions')">Actions</button>
          </div>

          <div class="sn-tabpanel" id="sn-panel-telemetry" role="tabpanel" aria-labelledby="sn-tab-telemetry" data-panel="telemetry">
            ${telemetryMarkup(x)}
          </div>

          <div class="sn-tabpanel" id="sn-panel-actions" role="tabpanel" aria-labelledby="sn-tab-actions" data-panel="actions" hidden>
            <fieldset class="fg-choice-group" ${canMng() ? '' : 'disabled'}><legend>Device commands</legend>
<button type="button" class="sn-act-row fg-action fg-action-attention" onclick="OpsSensors.sendCommand('${sid}', 'firmware_update')">
              Push firmware (OTA)
            </button>
<button type="button" class="sn-act-row fg-action danger" onclick="OpsSensors.sendCommand('${sid}', 'reset')">
              Restart device
            </button>
<button type="button" class="sn-act-row fg-action fg-action-attention" onclick="OpsSensors.calibrate('${sid}')">
              Run calibration
            </button>
<button type="button" class="sn-act-row fg-action" onclick="OpsSensors.sendCommand('${sid}', 'force_sync')">
              Force sync / diagnostics
            </button>
<button type="button" class="sn-act-row fg-action" onclick="OpsSensors.sendCommand('${sid}', 'locate')">
              Locate / identify
            </button>
            </fieldset>
            <div class="sn-sec-h">Diagnostics</div>
<button type="button" class="sn-act-row fg-action" onclick="OpsSensors.connectivityPanel('${sid}')">
              Connectivity
            </button>
<button type="button" class="sn-act-row fg-action" onclick="OpsSensors.powerPanel('${sid}')">
              Power &amp; battery
            </button>
<button type="button" class="sn-act-row fg-action" onclick="OpsSensors.calibrationPanel('${sid}')">
              Calibration
            </button>
<button type="button" class="sn-act-row fg-action" onclick="OpsSensors.integrityPanel('${sid}')">
              Integrity
            </button>
<button type="button" class="sn-act-row fg-action" onclick="OpsSensors.commandHistory('${sid}')">
              Command history
            </button>
<button type="button" class="sn-act-row fg-action" onclick="OpsSensors.timeline('${sid}')">
              Event timeline
            </button>
<button type="button" class="sn-act-row fg-action" onclick="OpsSensors.history('${sid}')">
              Diagnostic history
            </button>
            <fieldset class="fg-choice-group" ${canMng() ? '' : 'disabled'}><legend>Configuration &amp; hardware</legend>
<button type="button" class="sn-act-row fg-action" onclick="OpsSensors.coverage('${sid}')">
              Manage coverage
            </button>
<button type="button" class="sn-act-row fg-action" onclick="OpsSensors.editTags('${sid}')">
              Manage tags
            </button>
<button type="button" class="sn-act-row fg-action" onclick="OpsSensors.deviceRecord('${sid}')">
              Lifecycle &amp; hardware
            </button>
<button type="button" class="sn-act-row fg-action" onclick="OpsSensors.setDriver('${sid}')">
              Device driver
            </button>
<button type="button" class="sn-act-row fg-action" onclick="OpsSensors.replaceDevice('${sid}')">
              Replace device (RMA)
            </button>
            <button type="button" class="sn-act-row danger fg-action" onclick="OpsSensors.decommission('${sid}')">
              Record retirement event
            </button>
            </fieldset>
          </div>
        </div>
      </div>`;

    requestAnimationFrame(() => {if(!overlay.isConnected)return;overlay.classList.add('open');if(focusOnOpen && !document.getElementById('ops-modal-overlay'))overlay.querySelector('.sn-drawer-close')?.focus();});
    mountModelViewer();
  }

  // Switch the drawer's Telemetry / Actions tabs (DOM-only, no re-render).
  function drawerTab(name) {
    const root = document.getElementById('sn-drawer-overlay');
    if (!root || !['telemetry','actions'].includes(name)) return;
    root.querySelectorAll('.sn-tab').forEach(b => {const active=b.dataset.tab===name;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
    root.querySelectorAll('.sn-tabpanel').forEach(p => {p.hidden=p.dataset.panel!==name;});
  }
  function drawerKey(event) {
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const root=document.getElementById('sn-drawer-overlay');if(!root)return;
    const tabs=[...root.querySelectorAll('.sn-tab')];
    const index=tabs.indexOf(event.target);if(index<0)return;
    const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
    event.preventDefault();drawerTab(tabs[next].dataset.tab);tabs[next].focus();
  }
  function drawerDialogKey(event) {
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeDrawer();return;}
    if(event.key!=='Tab')return;
    const root=document.getElementById('sn-drawer-overlay');if(!root)return;
    const focusable=[...root.querySelectorAll('button,a[href],input,select,textarea,[tabindex]')].filter(el=>!el.disabled && el.tabIndex>=0 && el.getClientRects().length);
    if(!focusable.length){event.preventDefault();return;}
    const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
  }

  // ── 3D node model viewer ──────────────────────────────────────
  // Lazily loads three.js + GLTFLoader + OrbitControls (only when a
  // drawer is first opened), renders models/node.glb into #sn-3d,
  // auto-centres/scales it, and slow-spins with drag-to-orbit.
  const MODEL_URL = 'models/node.glb';
  const DRACO_PATH = 'models/draco/'; // decoder hosted same-origin (CSP connect-src 'self')
  const MODEL_FRONT_YAW = -Math.PI / 2; // yaw (radians) that turns the model's front toward the camera; ±90°/180° to reface
  // three.js served same-origin (vendored) — no external CDN latency/failure.
  const THREE_LIB = 'vendor/three/';
  let _threePromise = null;
  let _viewer = null; // { renderer, raf, controls, onResize }
  let _dracoLoader = null;  // shared across mounts — decoder/worker created once
  let _modelPromise = null; // resolves to the decoded scene, cached & cloned per mount

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if ([...document.scripts].some(s => s.src === src)) return resolve();
      const el = document.createElement('script');
      el.src = src; el.onload = resolve; el.onerror = () => reject(new Error('load ' + src));
      document.head.appendChild(el);
    });
  }
  function threeReady() { return !!(window.THREE && THREE.GLTFLoader && THREE.DRACOLoader && THREE.OrbitControls); }
  // three.js is loaded ONCE via deferred <script> tags in index.html. We only
  // WAIT for it here — never inject a second copy (that caused "multiple
  // instances of three.js" and broke rendering).
  function loadThree() {
    if (_threePromise) return _threePromise;
    _threePromise = new Promise((resolve, reject) => {
      if (threeReady()) return resolve();
      console.time('[3d] libs-wait');
      let waited = 0;
      const iv = setInterval(() => {
        if (threeReady()) { clearInterval(iv); console.timeEnd('[3d] libs-wait'); return resolve(); }
        waited += 40;
        if (waited >= 8000) { clearInterval(iv); reject(new Error('three.js not available')); }
      }, 40);
    });
    return _threePromise;
  }

  // Shared Draco decoder — created once, reused for every mount so we don't
  // re-spawn a worker + re-instantiate the wasm on each open.
  function getDraco() {
    if (!_dracoLoader) { _dracoLoader = new THREE.DRACOLoader(); _dracoLoader.setDecoderPath(DRACO_PATH); }
    return _dracoLoader;
  }
  // Fetch + Draco-decode the model ONCE; later mounts clone the cached scene
  // (no network, no decode).
  function loadModel() {
    if (_modelPromise) return _modelPromise;
    _modelPromise = new Promise((resolve, reject) => {
      console.time('[3d] model fetch+decode');
      const g = new THREE.GLTFLoader(); g.setDRACOLoader(getDraco());
      g.load(MODEL_URL, gltf => { console.timeEnd('[3d] model fetch+decode'); resolve(gltf.scene); }, undefined, err => { _modelPromise = null; reject(err); });
    });
    return _modelPromise;
  }
  // Warm the pipeline (libs + decoded model) ahead of first use.
  function preload3D() { return loadThree().then(loadModel).catch(() => {}); }
  // Kick off warming as soon as the app is idle, so three.js + the decoded
  // model are ready long before the user opens any device pop-out.
  (function warmOnIdle() {
    const go = () => preload3D();
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 3000 });
    else setTimeout(go, 1200);
  })();

  function disposeViewer() {
    if (!_viewer) return;
    _viewer.disposed = true;
    try {
      cancelAnimationFrame(_viewer.raf);
      window.removeEventListener('resize', _viewer.onResize);
      if (_viewer.controls) _viewer.controls.dispose();
      if (_viewer.renderer) {
        try { _viewer.renderer.forceContextLoss(); } catch (_) {} // actually free the WebGL context (dispose() alone leaks it)
        _viewer.renderer.dispose();
        const c = _viewer.renderer.domElement; if (c && c.parentNode) c.parentNode.removeChild(c);
      }
      // NB: the shared Draco loader and cached model are intentionally kept.
    } catch (_) { /* noop */ }
    _viewer = null;
  }

  async function mountModelViewer(hostId, stateId) {
    const host = document.getElementById(hostId || 'sn-3d');
    const stateEl = document.getElementById(stateId || 'sn-3d-state');
    console.log('[3d] mount start', hostId, 'host?', !!host, 'threeReady?', threeReady());
    if (!host) return;
    const _t0 = performance.now();
    disposeViewer();
    try {
      await loadThree();
    } catch (e) {
      console.error('[3d] loadThree failed', e);
      if (stateEl) stateEl.innerHTML = 'Could not load the 3D viewer.';
      return;
    }
    // Drawer may have been closed while three.js was downloading.
    if (!document.body.contains(host)) { console.warn('[3d] host detached before render'); return; }

    // Wait one frame if the container hasn't been laid out yet (0 size).
    const W = host.clientWidth || 340, H = host.clientHeight || 220;
    console.log('[3d] container', W + 'x' + H);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.01, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, H);
    if ('outputEncoding' in renderer) renderer.outputEncoding = THREE.sRGBEncoding;
    host.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(3, 5, 4); scene.add(key);
    const rim = new THREE.DirectionalLight(0x88bbff, 0.5); rim.position.set(-4, 2, -3); scene.add(rim);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.enablePan = false; controls.autoRotate = true; controls.autoRotateSpeed = 1.1;

    const viewer = { renderer, controls, raf: 0, onResize: null, disposed: false };
    _viewer = viewer;

    loadModel().then((cached) => {
      console.log('[3d] model resolved; disposed?', viewer.disposed, 'current?', _viewer === viewer);
      if (viewer.disposed) return; // this viewer was torn down before the model arrived
      const model = cached.clone(true); // clone shares geometry/materials — no re-decode
      // centre + scale to fit the frame
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const s = 2.2 / maxDim; model.scale.setScalar(s);
      // Face the model's front toward the camera before the auto-rotate begins.
      const pivot = new THREE.Group();
      pivot.rotation.y = MODEL_FRONT_YAW;
      pivot.add(model);
      scene.add(pivot);
      camera.position.set(0, 0.6, 3.4);
      controls.target.set(0, 0, 0); controls.update();
      if (stateEl) stateEl.style.display = 'none';
      console.log('[3d] mount total', Math.round(performance.now() - _t0) + 'ms');
    }).catch((e) => {
      console.error('[3d] model mount failed', e);
      if (stateEl) stateEl.innerHTML = 'Model unavailable.';
    });

    const animate = () => { viewer.raf = requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); };
    animate();

    viewer.onResize = () => {
      if (!host.clientWidth) return;
      camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    window.addEventListener('resize', viewer.onResize);
  }

  // decommission logs a real device_events entry (event_type already
  // supports 'decommission' — nothing fabricated) and marks intent clearly
  // since it's destructive.
  function decommission(sensorId) {
    if (!requireDeviceManage()) return;
    const x = _all.find(s => s.sensor_id === sensorId);
    OpsModal.confirm(`Record a retirement event for ${x ? (x.name || sensorId) : sensorId}? This adds history only; registry lifecycle and device operation are not changed.`, async () => {
      if (!requireDeviceManage()) return;
      OpsModal.setLoading(true);
      try {
        await OpsModal.apiPost(`/monitoring/sensors/${sensorId}/events`, { event_type: 'decommission', detail: 'Decommissioned from Device fleet' });
        OpsModal.close();
        OpsModal.toast('Retirement event recorded; registry lifecycle is unchanged.', 'success');
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
    if (!requireDeviceManage()) return;
    const node = _all.find(x => x.sensor_id === sensorId);
    if (!node) return;
    let assets = [];
    try {
      const r = await OpsModal.apiGet('/properties/assets');
      assets = OpsModal.readArray(r,'Asset directory').filter(a => !node.client_id || a.client_id === node.client_id || a.client_id == null);
    } catch (err) { OpsModal.open('Device coverage',OpsModal.failure('Asset directory',err,`OpsSensors.coverage('${__sid(sensorId)}')`),[{label:'Close',onclick:'OpsModal.close()'}]); return; }
    if (!assets.length) {
      OpsModal.open('Device coverage',OpsModal.emptyState('','No eligible assets returned','No eligible assets were returned for this device account. Review Assets and client links before configuring coverage.'),[{label:'Close',onclick:'OpsModal.close()'}]);
      return;
    }
    if(!Array.isArray(node.assets)) { OpsModal.open('Device coverage',OpsModal.failure('Coverage links',new Error('Existing asset links were not supplied. Refresh the fleet before replacing this device configuration.'),'OpsSensors.back()'),[{label:'Close',onclick:'OpsModal.close()'}]);return; }
    const covered = new Set(node.assets.map(a => a.property_id));
    const primary = node.assets.find(a => a.is_primary);

    OpsModal.open(`Coverage — ${node.name || sensorId}`, `
      <p style="margin:0 0 12px;font-size:var(--fs-base);color:var(--ink-3);line-height:1.5">
        Tick every asset this Sentinel monitors. Mark one as <b>primary</b> — the asset the device is physically installed on.
      </p>
      <div style="max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-control)">
        ${assets.map(a => `
          <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--border)">
            <label class="fg-check-target"><input type="checkbox" name="cov" aria-label="Link ${esc(a.asset_code || a.property_name || a.property_id)}" value="${esc(a.property_id)}" ${covered.has(a.property_id) ? 'checked' : ''}></label>
            <span style="flex:1;min-width:0">
              <span style="font-size:var(--fs-sm);font-weight:600;color:var(--ink)">${esc(a.asset_code || a.property_name)}</span>
              <span style="display:block;font-size:var(--fs-2xs);color:var(--ink-3)">${esc(OpsModal.label(a.property_type))}${a.parent_name ? ' · ' + esc(a.parent_name) : ''}</span>
            </span>
            <label style="display:flex;align-items:center;gap:5px;font-size:var(--fs-2xs);color:var(--ink-3);white-space:nowrap">
              <input type="radio" name="primary" aria-label="Primary asset: ${esc(a.asset_code || a.property_name || a.property_id)}" value="${esc(a.property_id)}" ${primary && primary.property_id === a.property_id ? 'checked' : ''}> Primary
            </label>
          </div>`).join('')}
      </div>
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: 'Save coverage', class: 'btn-primary', onclick: `OpsSensors.saveCoverage('${sensorId}')` },
    ]);
  }

  async function saveCoverage(sensorId) {
    if (!requireDeviceManage()) return;
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
    OpsModal.open(`Diagnostics log — ${node ? (node.name || sensorId) : sensorId}`,
      '<div style="padding:20px;color:var(--ink-3);font-size:var(--fs-base)">Loading…</div>',
      [{ label: 'Close', onclick: 'OpsModal.close()' }]);
    try {
      const r = await OpsModal.apiGet(`/monitoring/sensors/${sensorId}/events`);
      if (!Array.isArray(r.data)) throw new Error('Device history not supplied');
      const evts = r.data;
      const body = document.querySelector('.ops-modal-body');
      if (!body) return;
      body.innerHTML = evts.length
        ? `<div>${evts.map(e => `
            <div class="fg-history-row">
              <span class="fg-history-type">${esc(OpsModal.label(e.event_type || 'Unknown event'))}</span>
              <span style="flex:1;min-width:0;font-size:var(--fs-sm);color:var(--ink-2)">${esc(e.detail || '—')}</span>
              <time class="fg-history-time">${OpsModal.fmtDateTime(e.occurred_at)}</time>
            </div>`).join('')}</div>`
        : OpsModal.emptyState('','No recorded history returned','No recorded history was returned for this device.');
    } catch (err) { const body=document.querySelector('.ops-modal-body'); if(body) body.innerHTML=OpsModal.failure('Device history',err,`OpsSensors.history('${__sid(sensorId)}')`); }
  }

  function calibrate(sensorId) {
    if (!requireDeviceManage()) return;
    OpsModal.open('Record calibration', `
      <p style="margin:0 0 12px;font-size:var(--fs-base);color:var(--ink-3);line-height:1.5">
        Logs a calibration against this Sentinel and resets its calibration due date. To remotely request the device recalibrate itself, use "Run Calibration" via a queued command instead.
      </p>
      ${OpsModal.field('Notes', 'detail', 'textarea', '', { required: false, placeholder: 'What was calibrated, and against what reference' })}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: 'Record', class: 'btn-primary', onclick: `OpsSensors.confirmCalibrate('${sensorId}')` },
      { label: 'Queue remote recalibration', class: 'btn-primary', onclick: `OpsModal.close();OpsSensors.sendCommand('${sensorId}','recalibrate')` },
    ]);
  }

  async function confirmCalibrate(sensorId) {
    if (!requireDeviceManage()) return;
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
  // Remote-action catalogue — mirrors the backend COMMAND_TYPES vocabulary.
  const CMD_CATALOG = [
    { group: 'Diagnostics & connectivity', items: [
      ['force_sync', 'Force sync (report now)'],
      ['connectivity_test', 'Connectivity test'],
      ['self_test', 'Run self-test'],
      ['reconnect_modem', 'Reconnect modem'],
      ['refresh_gps', 'Refresh GPS fix'],
      ['diagnostic_bundle', 'Collect diagnostic bundle'],
      ['locate', 'Locate / identify (blink)'],
    ] },
    { group: 'Configuration', items: [
      ['recalibrate', 'Request recalibration'],
      ['set_reporting_interval', 'Set reporting interval'],
      ['set_thresholds', 'Set alert thresholds'],
      ['enable_sensor', 'Enable sensor channel'],
      ['disable_sensor', 'Disable sensor channel'],
      ['reset_config', 'Reset config to defaults'],
    ] },
    { group: 'Firmware & lifecycle', items: [
      ['firmware_update', 'Push firmware update'],
      ['reset', 'Remote reset (reboot)'],
      ['factory_reset', 'Factory reset (wipe)'],
      ['reprovision', 'Re-provision (re-enrol)'],
    ] },
  ];
  const CMD_DISRUPTIVE = ['firmware_update', 'reset', 'reset_config', 'factory_reset', 'reprovision'];
  const CMD_CHANNELS = [
    { value: 'water_level', label: 'Water level' }, { value: 'flow_rate', label: 'Flow rate' },
    { value: 'silt', label: 'Silt probe' }, { value: 'water_quality', label: 'Water quality' },
    { value: 'temperature', label: 'Temperature' },
  ];

  // Param fields for the parameterised commands (rendered into the live slot).
  function _cmdParams(type) {
    if (type === 'firmware_update')
      return OpsModal.field('Firmware version', 'firmware_version', 'text', '', { required: true, placeholder: 'e.g. 2.4.1' });
    if (type === 'set_reporting_interval')
      return OpsModal.field('Reporting interval', 'interval_seconds', 'select', '300', { options: [
        { value: '60', label: 'Every 1 minute' }, { value: '300', label: 'Every 5 minutes' },
        { value: '900', label: 'Every 15 minutes' }, { value: '1800', label: 'Every 30 minutes' },
        { value: '3600', label: 'Every hour' }, { value: '21600', label: 'Every 6 hours' },
      ] });
    if (type === 'set_thresholds')
      return OpsModal.row([
        OpsModal.field('High-water alert (%)', 'level_high_pct', 'number', '', { required: false, placeholder: 'e.g. 80' }),
        OpsModal.field('Low-water alert (%)', 'level_low_pct', 'number', '', { required: false, placeholder: 'e.g. 15' }),
      ]);
    if (type === 'enable_sensor' || type === 'disable_sensor')
      return OpsModal.field('Sensor channel', 'channel', 'select', 'water_level', { options: CMD_CHANNELS });
    return '';
  }

  function sendCommand(sensorId, presetType) {
    if (!requireDeviceManage()) return;
    const node = _all.find(x => x.sensor_id === sensorId);
    const type = presetType && CMD_DISRUPTIVE.concat(CMD_CATALOG.flatMap(g => g.items.map(i => i[0]))).includes(presetType) ? presetType : 'force_sync';
    const optionsHtml = CMD_CATALOG.map(g =>
      `<optgroup label="${esc(g.group)}">${g.items.map(([v, l]) => `<option value="${v}" ${v === type ? 'selected' : ''}>${esc(l)}</option>`).join('')}</optgroup>`).join('');
    OpsModal.open(`Send command — ${node ? (node.name || sensorId) : sensorId}`, `
      <p style="margin:0 0 12px;font-size:var(--fs-base);color:var(--ink-3);line-height:1.5">
        This Sentinel is store-and-forward — the command is queued here and delivered on its next check-in, not instantly.
      </p>
      <div class="ops-modal-field">
        <label class="ops-label">Command</label>
        <select name="cmdtype" class="ops-input" onchange="OpsSensors._onCmdChange()">${optionsHtml}</select>
      </div>
      <div id="sn-cmd-warn" style="display:none;margin:0 0 10px;font-size:var(--fs-xs);color:var(--warn);display:flex;gap:6px;align-items:flex-start">
        <span>⚠</span><span>Disruptive — takes the node offline briefly. Blocked automatically if it's the last trusted node on a channel at high water.</span>
      </div>
      <div id="sn-cmd-params">${_cmdParams(type)}</div>
      ${OpsModal.field('Expire after (hours, optional)', 'ttl_hours', 'number', '', { required: false, placeholder: 'e.g. 48 — lapses if never delivered' })}
      ${OpsModal.field('Note (optional)', 'note', 'textarea', '', { required: false, placeholder: 'Reason for this command' })}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: 'Queue command', class: 'btn-primary', onclick: `OpsSensors.confirmSendCommand('${sensorId}')` },
    ]);
    _onCmdChange();
  }

  function _onCmdChange() {
    const sel = document.querySelector('select[name="cmdtype"]');
    if (!sel) return;
    const slot = document.getElementById('sn-cmd-params');
    if (slot) slot.innerHTML = _cmdParams(sel.value);
    const warn = document.getElementById('sn-cmd-warn');
    if (warn) warn.style.display = CMD_DISRUPTIVE.includes(sel.value) ? 'flex' : 'none';
  }

  // Build the payload for a command type from the current form fields.
  function _cmdPayload(type, f) {
    if (type === 'firmware_update') return { firmware_version: f.firmware_version };
    if (type === 'set_reporting_interval') return { interval_seconds: parseInt(f.interval_seconds, 10) };
    if (type === 'set_thresholds') {
      const th = {};
      if (f.level_high_pct !== '' && f.level_high_pct != null) th.level_high_pct = Number(f.level_high_pct);
      if (f.level_low_pct !== '' && f.level_low_pct != null) th.level_low_pct = Number(f.level_low_pct);
      return { thresholds: th };
    }
    if (type === 'enable_sensor' || type === 'disable_sensor') return { channel: f.channel };
    return null;
  }

  async function confirmSendCommand(sensorId) {
    if (!requireDeviceManage()) return;
    const sel = document.querySelector('select[name="cmdtype"]');
    const type = sel ? sel.value : 'force_sync';
    const f = OpsModal.getFormData();
    if (type === 'firmware_update' && !f.firmware_version) {
      OpsModal.toast('Firmware version is required.', 'error'); return;
    }
    if (type === 'set_thresholds' && (f.level_high_pct === '' || f.level_high_pct == null) && (f.level_low_pct === '' || f.level_low_pct == null)) {
      OpsModal.toast('Set at least one threshold.', 'error'); return;
    }
    const payload = _cmdPayload(type, f);
    OpsModal.setLoading(true);
    try {
      await OpsModal.apiPost(`/monitoring/sensors/${sensorId}/commands`, {
        command_type: type,
        payload,
        note: f.note || null,
        ttl_hours: f.ttl_hours ? parseInt(f.ttl_hours, 10) : null,
      });
      OpsModal.close();
      OpsModal.toast("Command queued — delivered on the device's next check-in.", 'success');
      await load();
      if (_drawerId === sensorId) renderDrawer();
    } catch (err) {
      OpsModal.setLoading(false);
      // Command-safety block from the server (sole node on a high-water channel,
      // or an active protection/maintenance window)
      if (/only node reporting|protection window/i.test(err.message || '')) {
        return safetyOverride(sensorId, type, payload, f.note || '', err.message);
      }
      OpsModal.toast(err.message || 'Failed to queue command', 'error');
    }
  }

  // Server refused a disruptive command because it's the only trusted node on a
  // channel at high water. Force an explicit, logged override with a reason.
  let _ovrPayload = null;
  function safetyOverride(sensorId, type, payload, note, reasonMsg) {
    if (!requireDeviceManage()) return;
    _ovrPayload = payload;
    OpsModal.open('⚠ Safety check', `
      <p style="margin:0 0 12px;color:var(--err);font-weight:600;line-height:1.5">${esc(reasonMsg)}</p>
      <p style="margin:0 0 12px;font-size:var(--fs-sm);color:var(--ink-3)">Proceed only if you're certain another crew/node has eyes on this channel. This is recorded as a safety override against your name.</p>
      ${OpsModal.field('Reason to override', 'ovr', 'textarea', note, { required: true, placeholder: 'Why this must proceed now' })}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: 'Override & queue', class: 'btn-danger', onclick: `OpsSensors._doOverride('${__sid(sensorId)}','${type}')` },
    ]);
  }
  async function _doOverride(sensorId, type) {
    if (!requireDeviceManage()) return;
    const f = OpsModal.getFormData();
    if (!f.ovr || !f.ovr.trim()) { OpsModal.toast('A reason is required to override.', 'warning'); return; }
    OpsModal.setLoading(true);
    try {
      await OpsModal.apiPost(`/monitoring/sensors/${sensorId}/commands`, {
        command_type: type, payload: _ovrPayload || null, note: f.ovr.trim(), override: true });
      OpsModal.close();
      OpsModal.toast('Command queued — safety override logged.', 'success');
      await load();
      if (_drawerId === sensorId) renderDrawer();
    } catch (err) {
      OpsModal.setLoading(false);
      OpsModal.toast(err.message || 'Failed to queue command', 'error');
    }
  }

  async function commandHistory(sensorId) {
    const node = _all.find(x => x.sensor_id === sensorId);
    OpsModal.open(`Commands — ${node ? (node.name || sensorId) : sensorId}`,
      '<div style="padding:20px;color:var(--ink-3);font-size:var(--fs-base)">Loading…</div>',
      [{ label: 'Close', onclick: 'OpsModal.close()' }]);
    try {
      const r = await OpsModal.apiGet(`/monitoring/sensors/${sensorId}/commands`);
      if (!Array.isArray(r.data)) throw new Error('Command history not supplied');
      const cmds = r.data;
      const body = document.querySelector('.ops-modal-body');
      if (!body) return;
      body.innerHTML = cmds.length
        ? `<div>${cmds.map(c => `
            <div class="fg-history-row">
              ${OpsModal.status(c.status || 'unknown',OpsModal.label(c.status || 'unknown')+(c.hold_reason && c.status==='queued'?' · held':''),null,'command')}
              <span style="flex:1;min-width:0;font-size:var(--fs-sm);color:var(--ink-2)">${esc(OpsModal.label(c.command_type))}${c.payload && c.payload.firmware_version ? ` → v${esc(c.payload.firmware_version)}` : ''}${c.note ? ' — ' + esc(c.note) : ''}${c.hold_reason && c.status === 'queued' ? `<span style="display:block;font-size:var(--fs-2xs);color:var(--warn);margin-top:2px">⏸ ${esc(c.hold_reason)}</span>` : ''}${c.expires_at && c.status === 'queued' ? `<span style="display:block;font-size:var(--fs-2xs);color:var(--ink-3);margin-top:2px">Expires ${OpsModal.fmtDateTime(c.expires_at)}</span>` : ''}</span>
              <time class="fg-history-time">${OpsModal.fmtDateTime(c.created_at)}</time>
              ${c.status === 'queued' ? `<button class="fg-action danger" onclick="OpsSensors.cancelCommand('${sensorId}', ${parseInt(c.id, 10)})">Cancel</button>` : ''}
            </div>`).join('')}</div>`
        : OpsModal.emptyState('','No commands returned','No command records were returned for this device.');
    } catch (err) { const body=document.querySelector('.ops-modal-body'); if(body) body.innerHTML=OpsModal.failure('Command history',err,`OpsSensors.commandHistory('${__sid(sensorId)}')`); }
  }

  async function cancelCommand(sensorId, commandId) {
    if (!requireDeviceManage()) return;
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
      const asset = OpsModal.readArray(r,'Asset directory').find(a => a.property_id === assetId);
      if (asset && asset.parent_property_id) { OpsNetwork.viewRecord(asset.parent_property_id); return; }
      OpsModal.toast('The asset’s parent estate was not supplied.', 'watch');
    } catch (_) { OpsModal.toast('Could not open the asset', 'error'); }
  }

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // ══════════════════════════════════════════════════════════════
  //  FULL DETAIL PAGE — the primary detail view for a Sentinel.
  //  (The slide-over drawer is now the "quick view".) Built on the
  //  shared detailShell so it matches Clients/Properties/Assets/etc.
  // ══════════════════════════════════════════════════════════════

  const _cap = s => s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : s;
  const _ago = d => OpsModal.relativeTime(d);

  async function openFull(sensorId) {
    if (!_container) return;
    closeDrawer();
    _container.innerHTML = `<div style="padding:60px;text-align:center;color:var(--ink-3);">Loading device…</div>`;
    let x = _all.find(s => s.sensor_id === sensorId);
    if (!x) { try { const r = await OpsModal.apiGet('/monitoring/sensors/all'); _all = OpsModal.readArray(r,'Device fleet'); x = _all.find(s => s.sensor_id === sensorId); } catch (err) { _container.innerHTML=OpsModal.recordFailure('Device',err,`OpsSensors.openFull('${__sid(sensorId)}')`,'OpsSensors.back()');return; } }
    if (!x) { _container.innerHTML = OpsModal.recordFailure('Device',new Error('The requested device was not returned by this fleet feed'),'OpsSensors.back()','OpsSensors.back()'); return; }
    const [events, commands] = await Promise.all([
      OpsModal.apiGet('/monitoring/sensors/' + sensorId + '/events').then(r => r.data).catch(() => null),
      OpsModal.apiGet('/monitoring/sensors/' + sensorId + '/commands').then(r => r.data).catch(() => null),
    ]);
    renderFull(x, events, commands);
  }

  function back() { if (_container) render(_container); }

  function renderFull(x, events, commands) {
    const F = OpsModal.fact, L = OpsModal.link, E = OpsModal.emptyState;
    const sid = __sid(x.sensor_id);
    const tier = healthTier(x);
    const chipCls = OpsModal.statusTone(tier==='healthy'?'online':tier,'device');
    const last = x.reading_time || x.last_ping;
    const isBio = x.device_variant === 'bio_dispenser';
    const primary = x.primary_asset || (x.assets || []).find(a => a.is_primary) || null;
    const secondary = (x.assets || []).filter(a => !a.is_primary && (!primary || String(a.property_id)!==String(primary.property_id)));

    const tile = (l, v, unit, color) => {const supplied=v!=null && v!=='' && typeof v!=='boolean' && !(typeof v==='number' && !Number.isFinite(v));return `<div class="snd-tile"><div class="l">${l}</div><div class="v"${color ? ` style="color:${color}"` : ''}>${supplied ? esc(v) : 'Not supplied'}${supplied && unit ? `<span class="u">${unit}</span>` : ''}</div></div>`;};
    const bar = (l, pct, color) => {const value=OpsModal.reading(pct,0,100);return `<div class="snd-diag"><span class="l">${l}</span><span class="track"><i style="width:${value ?? 0}%;background:${value!==null?color:'var(--ink-3)'}"></i></span><span class="v">${value!==null ? Math.round(value) + '%' : 'Unknown'}</span></div>`;};
    const drow = (l, v) => `<div class="snd-diag"><span class="l">${l}</span><span style="flex:1"></span><span class="v" style="width:auto;font-family:var(--ff-b);font-weight:600;">${v == null || v === '' ? '—' : v}</span></div>`;

    const overview = `<div class="snd-tele">
      ${tile('Registry state', _cap(x.status || 'Unknown'), '', 'var(--ink)')}
      ${tile('Last ping', x.last_ping ? _ago(x.last_ping) : null, '')}
      ${tile('Firmware', x.firmware_version || null, '')}
      ${tile('Calibration due', x.calibration_due_at ? OpsModal.fmtDate(x.calibration_due_at) : 'Not supplied', '')}
    </div>`;

    const cap = x.capabilities || {};
    const channel = (key,value,html) => cap[key] !== false && (cap[key] === true || value != null) ? html : '';
    const measured = (value,min,max,format=v=>v) => {const n=OpsModal.reading(value,min,max);return n===null?null:format(n);};
    const tele = `${x.data_trust !== true ? '<div class="capability-note">Last received values are not a trusted current assessment: ' + esc(x.sensor_reason || x.sensor_state || 'quality not supplied') + '. Infrastructure state remains unknown.</div>' : ''}<div class="snd-tele">
      ${channel('water_level',x.level,tile('Water level', measured(x.level,0,100,Math.round), '%', levelColor(x.level,x.data_trust)))}
      ${channel('volume',x.level_liters,tile('Level (volume)', measured(x.level_liters,0,Infinity,v=>v.toLocaleString()), 'L'))}
      ${channel('flow_rate',x.flow_rate,tile('Inflow rate', measured(x.flow_rate,0,Infinity,v=>v.toFixed(1)), 'L/s'))}
      ${channel('flow_rate',x.outflow_rate,tile('Outflow rate', measured(x.outflow_rate,0,Infinity,v=>v.toFixed(1)), 'L/s'))}
      ${channel('temperature',x.temperature,tile('Temperature', measured(x.temperature,-Infinity,Infinity,Math.round), '°C'))}
      ${channel('silt',x.silt_depth_mm,tile('Silt depth', measured(x.silt_depth_mm,0,Infinity), 'mm'))}
      ${channel('rainfall',x.rainfall_mm,tile('Rainfall', measured(x.rainfall_mm,0,Infinity), 'mm'))}
      ${channel('debris',x.debris_detected,tile('Debris detected', typeof x.debris_detected!=='boolean' ? null : (x.debris_detected ? 'Yes' : 'No'), '', x.debris_detected===true ? 'var(--warn)' : null))}
      ${channel('water_quality',x.water_quality_ph,tile('Water pH', measured(x.water_quality_ph,0,14), ''))}
      ${channel('water_quality',x.turbidity_ntu,tile('Turbidity', measured(x.turbidity_ntu,0,Infinity), 'NTU'))}
    </div>${OpsModal.provenance([['Reading timestamp',last ? OpsModal.fmtDateTime(last) : null],['Water-level reference',null]],'Channels shown were declared or supplied. Their measurement times may differ; a percentage without a reference scale is not a capacity assessment.')}`;

    const diag = `
      ${bar('Battery', x.battery_percent, OpsModal.vitalColor(x.battery_percent))}
      ${bar('Signal strength', x.signal_strength, OpsModal.vitalColor(x.signal_strength))}
      ${drow('Hydraulic capacity', 'Not supplied')}
      ${isBio ? bar('Enzyme level', x.enzyme_level_percent, x.enzyme_level_percent != null && x.enzyme_level_percent < 20 ? 'var(--err)' : 'var(--ok)') : ''}
      ${drow('Last calibrated', x.last_calibrated_at ? OpsModal.fmtDate(x.last_calibrated_at) : 'Not supplied')}
      ${isBio ? drow('Cartridge status', OpsModal.label(x.cartridge_status)) : ''}`;

    const install = `
      ${F('Primary asset', primary ? L('assets', primary.property_id, esc(primary.name || primary.property_id)) : '—')}
      ${F('Asset class', OpsModal.label(primary && primary.asset_class))}
      ${F('Estate', x.property_ref ? L('properties', x.property_ref, esc(x.property_name || 'Estate')) : esc(x.property_name || '—'))}
      ${F('Zone', esc(x.zone || '—'))}
      ${F('Link type', esc(OpsModal.label(x.link_type || 'Not supplied')))}
      ${F('Variant', esc(OpsModal.label(x.device_variant || 'Not supplied')))}
      ${secondary.length ? F('Secondary coverage', secondary.map(a => L('assets', a.property_id, esc(a.name || a.property_id))).join(', ')) : ''}`;

    const evList = Array.isArray(events) ? events : [];
    const evRow = e => `<div class="snd-ev"><span class="dot"></span><div><div class="t">${esc(OpsModal.label(e.event_type || 'event'))}</div><div class="m">${eventDetail(e.detail)}${e.performed_by_name ? ' · ' + esc(e.performed_by_name) : ''} · ${OpsModal.fmtDateTime(e.occurred_at)}</div></div></div>`;
    const maintEv = evList.filter(e => /calibrat|battery|install|repair|swap|mount|decommission/i.test(e.event_type || ''));
    const maintBody = !Array.isArray(events) ? '<div class="capability-note">Maintenance event feed unavailable or not supplied.</div>' : maintEv.length ? maintEv.map(evRow).join('') : E('', 'No maintenance returned', 'No matching maintenance events were returned by this feed.');
    const eventsBody = !Array.isArray(events) ? '<div class="capability-note">Event history unavailable or not supplied. This does not mean no events occurred.</div>' : evList.length ? evList.map(evRow).join('') : E('', 'No events returned', 'No events were returned by this feed.');

    const cmdList = Array.isArray(commands) ? commands : [];
    const cmdRow = c => `<div class="snd-cmd">${OpsModal.status(c.status || 'unknown',null,null,'command')}<div><div class="t">${esc(OpsModal.label(c.command_type || 'command'))}</div><div class="m">${c.requested_by_name ? 'by ' + esc(c.requested_by_name) + ' · ' : ''}${OpsModal.fmtDateTime(c.created_at)}${c.note ? ' · ' + esc(c.note) : ''}</div></div></div>`;
    const fwBody = `${F('Current firmware', esc(x.firmware_version || '—'))}${!Array.isArray(commands) ? '<div class="capability-note">Command history unavailable or not supplied.</div>' : cmdList.length ? `<div style="margin-top:12px;">${cmdList.map(cmdRow).join('')}</div>` : `<div style="margin-top:8px;">${E('', 'No commands returned', 'No commands were returned by this feed.')}</div>`}`;

    const sidebar = `
      <div class="fgd-card"><div class="fgd-card-head"><h2>Related records</h2></div>
        ${F('Estate', x.property_ref || x.property_id ? L('properties', x.property_ref || x.property_id, x.property_name || 'Estate') : 'Not linked')}
        ${F('Linked asset', primary ? L('assets',primary.property_id,primary.name || primary.property_id) : 'Not linked')}
      </div>
      ${canMng() ? `<div class="fgd-card"><div class="fgd-card-head"><h2>Device management</h2></div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <button class="fg-action fg-action-attention" onclick="OpsSensors.sendCommand('${sid}','firmware_update')">Push firmware (OTA)</button>
          <button class="fg-action fg-action-attention" onclick="OpsSensors.calibrate('${sid}')">Run calibration</button>
          <button class="fg-action danger" onclick="OpsSensors.sendCommand('${sid}','reset')">Restart device</button>
          <button class="fg-action" onclick="OpsSensors.coverage('${sid}')">Manage coverage</button>
        </div>
      </div>` : ''}`;

    _container.innerHTML = OpsModal.detailShell({
      back: 'OpsSensors.back()',
      crumbRoot: 'Device fleet',
      decision:[['Data trust',x.data_trust===true && x.sensor_state==='ok'?'Trusted':x.sensor_state && x.sensor_state!=='ok'?OpsModal.label(x.sensor_state):'Unknown'],['Reading received',OpsModal.relativeTime(last)],['Next step',x.data_trust===true && x.sensor_state==='ok'?'Review drainage state and diagnostics':'Restore and validate telemetry before relying on readings']],
      title: esc(x.name || x.sensor_id),
      reference:x.sensor_id,
      avatar: { text: OpsModal.entityIcon('sensors') },
      chips: [
        { cls: chipCls, dot: true, label: esc('Device: ' + OpsModal.label(tier === 'healthy' ? 'online' : tier)) },
        { cls:'neutral',label:esc('Registry: ' + OpsModal.label(x.status)) },
        x.device_variant ? { cls: 'neutral', label: esc(OpsModal.label(x.device_variant)) } : null,
      ].filter(Boolean),
      meta: [['Zone', esc(x.zone || '—')], ['Primary asset', primary ? esc(primary.name || primary.property_id) : '—'], ['Estate', esc(x.property_name || '—')], ['Link', esc(OpsModal.label(x.link_type))]],
      actions: `${primary && primary.property_id ? `<button class="fg-action" onclick="OpsNetwork.viewRecord('${__sid(primary.property_id)}')">View on map</button>` : ''}${canMng() ? `<button class="fg-action" onclick="OpsSensors.queueCommand('${sid}')">Queue command</button>` : ''}`,
      sections: [
        { id: 'telemetry', title: 'Latest telemetry', body: tele },
        { id: 'overview', title: 'Device overview', meta: x.last_ping ? 'Last ping ' + _ago(x.last_ping) : 'Check-in not supplied', body: '<div class="snd-state-grid">' + stateCards(x) + '</div>' + overview },
        { id: 'diagnostics', title: 'Diagnostics', body: diag },
        { id: 'installation', title: 'Installation', body: install },
        { id: 'maintenance', title: 'Maintenance', body: maintBody },
        { id: 'firmware', title: 'Firmware', body: fwBody },
        { id: 'events', title: 'Event history', body: eventsBody },
        { id: 'evidence', title: 'Device evidence', state:OpsModal.collectionState(x.photos,x.documents), body: OpsModal.evidenceGroup([['Installation photos',x.photos],['Documents',x.documents]]) },
      ],
      sidebar,
    });
  }

  function queueCommand(sensorId) {
    if (!requireDeviceManage()) return;
    OpsModal.open('Queue a command', `<p style="margin:0 0 4px;font-size:var(--fs-sm);color:var(--ink-3);">Send a command to this Sentinel.</p>`, [
      { label: 'Push firmware (OTA)', onclick: `OpsSensors.sendCommand('${__sid(sensorId)}','firmware_update')`, class: 'btn-primary' },
      { label: 'Restart device', intent:'danger', onclick: `OpsSensors.sendCommand('${__sid(sensorId)}','reset')` },
      { label: 'Recalibrate', onclick: `OpsSensors.calibrate('${__sid(sensorId)}')` },
      { label: 'Cancel', onclick: 'OpsModal.close()', class: 'btn-ghost' },
    ]);
  }

  // ══════════════════════════════════════════════════════════════
  //  THIRD-PARTY DEVICE DRIVERS — registry manager + per-device binding
  // ══════════════════════════════════════════════════════════════
  const DRV_CAPS = ['water_level', 'flow_rate', 'silt', 'temperature', 'battery', 'signal', 'gps'];
  const DRV_CMDS = ['firmware_update', 'reset', 'recalibrate', 'apply_config', 'force_sync', 'connectivity_test', 'self_test', 'reconnect_modem', 'refresh_gps', 'diagnostic_bundle', 'locate', 'set_reporting_interval', 'set_thresholds', 'enable_sensor', 'disable_sensor', 'reset_config', 'factory_reset', 'reprovision'];
  let _drivers = [];

  async function driversManager() {
    OpsModal.open('Device drivers', '<div style="padding:20px;color:var(--ink-3)">Loading…</div>', [{ label: 'Close', onclick: 'OpsModal.close()' }]);
    try { const r = await OpsModal.apiGet('/device-drivers'); if (!Array.isArray(r.data)) throw new Error('Driver directory not supplied'); _drivers = r.data; }
    catch (err) { OpsModal.open('Device drivers',OpsModal.failure('Device drivers',err,'OpsSensors.driversManager()'),[{label:'Close',onclick:'OpsModal.close()'}]); return; }
    drvHome();
  }
  function drvHome() {
    const rows = _drivers.map(d => {
      const caps = Object.keys(d.capabilities || {}).filter(k => d.capabilities[k]).length;
      const cmds = (d.commands || []).length;
      return `<div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--line)">
        <div style="flex:1 1 auto;min-width:0">
          <div style="font-weight:700;color:var(--ink);font-size:var(--fs-sm)">${esc(d.name)}${d.native ? ' <span class="lv-status neutral">Native</span>' : ''}${OpsModal.status(d.active===true?'active':d.active===false?'inactive':'unknown',null,null,'account')}</div>
          <div class="lv-source">${esc(d.key)}${d.vendor ? ' · ' + esc(d.vendor) : ''} · ${d.capabilities && typeof d.capabilities==='object'?caps+' capabilities':'Capabilities unavailable'} · ${Array.isArray(d.commands)?cmds+' commands':'Commands unavailable'} · ${Number.isInteger(d.device_count) && d.device_count>=0?d.device_count+' linked devices':'Device count unavailable'}</div>
        </div>
        <button class="fg-action" onclick="OpsSensors.drvEdit(${d.id})">${d.native ? 'View' : 'Edit'}</button>
      </div>`;
    }).join('');
    OpsModal.open('Device drivers', `
      <p style="margin:0 0 12px;font-size:var(--fs-sm);color:var(--ink-3);line-height:1.5">Adapters that let third-party hardware report telemetry and take commands through the same model as a Sentinel. Each device binds to a driver.</p>
      ${rows || OpsModal.emptyState('','No drivers returned','No device adapters were returned by this directory.')}
    `, [
      { label: 'Create driver', class: 'btn-primary', onclick: 'OpsSensors.drvEdit(0)' },
      { label: 'Close', onclick: 'OpsModal.close()' },
    ]);
  }
  function drvEdit(id) {
    if (!requireDeviceManage()) return;
    const d = id ? (_drivers.find(x => x.id === id) || {}) : {};
    const ro = !!d.native;
    const capBoxes = DRV_CAPS.map(c => `<label class="fg-choice"><input type="checkbox" name="cap_${c}" ${(d.capabilities && d.capabilities[c]) ? 'checked' : ''} ${ro?'disabled':''}> ${OpsModal.label(c)}</label>`).join('');
    const cmdBoxes = DRV_CMDS.map(c => `<label class="fg-choice"><input type="checkbox" name="cmd_${c}" ${(d.commands || []).includes(c) ? 'checked' : ''} ${ro ? 'disabled' : ''}> ${OpsModal.label(c)}</label>`).join('');
    OpsModal.open(id ? `Driver — ${d.name || ''}` : 'Create driver', `
      ${OpsModal.row([
        OpsModal.field('Driver key', 'key', 'text', d.key || '', { required: !id, readonly: !!id, placeholder: 'acme-flow-v2' }),
        OpsModal.field('Name', 'name', 'text', d.name || '', { required: true, readonly:ro, placeholder: 'Acme Flow Meter v2' }),
      ])}
      ${OpsModal.row([
        OpsModal.field('Vendor', 'vendor', 'text', d.vendor || '', { required: false,readonly:ro }),
        OpsModal.field('Model', 'model', 'text', d.model || '', { required: false,readonly:ro }),
      ])}
      ${OpsModal.field('Authentication method', 'auth_type', 'select', d.auth_type || 'device_key', {disabled:ro, options: [{value:'device_key',label:'Device key'},{value:'hmac',label:'HMAC signature'},{value:'bearer',label:'Bearer token'}] })}
      <fieldset class="fg-choice-group"><legend>Capabilities</legend><div>${capBoxes}</div></fieldset>
      <fieldset class="fg-choice-group"><legend>Supported commands</legend><div>${cmdBoxes}</div></fieldset>
      ${OpsModal.field('Field mapping (JSON)', 'field_map', 'textarea', d.field_map ? JSON.stringify(d.field_map, null, 2) : '{}', { required: false,readonly:ro, rows: 5, placeholder: '{ "water_level_percent": "level_pct" }' })}
      ${OpsModal.field('Notes', 'notes', 'textarea', d.notes || '', { required: false,readonly:ro, rows: 2 })}
      ${id && !ro ? OpsModal.field('Active', 'active', 'select', d.active === false ? 'no' : 'yes', { options: [{ value: 'yes', label: 'Active' }, { value: 'no', label: 'Inactive' }] }) : ''}
    `, ro ? [{ label: 'Back to drivers', onclick: 'OpsSensors.drvHome()' }] : [
      { label: 'Back to drivers', onclick: 'OpsSensors.drvHome()' },
      { label: id ? 'Save driver' : 'Create driver', class: 'btn-primary', onclick: `OpsSensors.drvSave(${id || 0})` },
    ]);
  }
  async function drvSave(id) {
    if (!requireDeviceManage()) return;
    const f = OpsModal.getFormData();
    let field_map;
    try { field_map = f.field_map && f.field_map.trim() ? JSON.parse(f.field_map) : {}; }
    catch (_) { OpsModal.toast('Field mapping must be valid JSON.', 'error'); return; }
    const capabilities = {}; DRV_CAPS.forEach(c => { const el = document.querySelector(`input[name="cap_${c}"]`); if (el && el.checked) capabilities[c] = true; });
    const commands = DRV_CMDS.filter(c => { const el = document.querySelector(`input[name="cmd_${c}"]`); return el && el.checked; });
    const body = { name: f.name, vendor: f.vendor || null, model: f.model || null, auth_type: f.auth_type, capabilities, field_map, commands, notes: f.notes || null };
    if (!id) body.key = f.key;
    if (id) body.active = f.active !== 'no';
    if (!body.name || (!id && !body.key)) { OpsModal.toast('Key and name are required.', 'error'); return; }
    OpsModal.setLoading(true);
    try {
      if (id) await OpsModal.apiPut(`/device-drivers/${id}`, body);
      else await OpsModal.apiPost('/device-drivers', body);
      OpsModal.toast('Driver saved.', 'success');
      await driversManager();
    } catch (err) { OpsModal.setLoading(false); OpsModal.toast(err.message || 'Failed to save driver', 'error'); }
  }

  async function setDriver(sensorId) {
    if (!requireDeviceManage()) return;
    const x = _all.find(s => s.sensor_id === sensorId) || {};
    if (!_drivers.length) { try { _drivers = OpsModal.readArray(await OpsModal.apiGet('/device-drivers'),'Driver directory'); } catch(err) { OpsModal.open('Assign device driver',OpsModal.failure('Driver choices',err,`OpsSensors.setDriver('${__sid(sensorId)}')`),[{label:'Close',onclick:'OpsModal.close()'}]);return; } }
    const eligible=_drivers.filter(d=>d.active===true && d.native===false && Number.isSafeInteger(Number(d.id)) && Number(d.id)>0);
    const current=eligible.some(d=>String(d.id)===String(x.driver_id))?String(x.driver_id):'';
    const opts = [{ value: '', label: 'Choose assignment · unchanged until saved' },{value:'__unbound',label:'Remove driver binding'}].concat(eligible.map(d => ({ value: String(d.id), label: `${d.name || 'Unnamed driver'}${d.vendor ? ' · ' + d.vendor : ''}` })));
    OpsModal.open(`Device driver — ${x.name || sensorId}`, `
      <p style="margin:0 0 12px;font-size:var(--fs-sm);color:var(--ink-3);line-height:1.5">Bind this device to a driver. Telemetry is remapped to canonical fields on ingest and commands are gated to the driver's supported set.</p>
      ${OpsModal.field('Driver', 'driver_id', 'select', current, { options: opts })}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: 'Save driver assignment', class: 'btn-primary', onclick: `OpsSensors.saveDriver('${__sid(sensorId)}')` },
    ]);
  }
  async function saveDriver(sensorId) {
    if (!requireDeviceManage()) return;
    const f = OpsModal.getFormData();
    const unbind=f.driver_id==='__unbound';
    const driver=_drivers.find(d=>String(d.id)===String(f.driver_id) && d.active===true && d.native===false && Number.isSafeInteger(Number(d.id)) && Number(d.id)>0);
    if(!unbind && !driver)return OpsModal.toast('Choose an available driver or explicitly remove the binding. No assignment changed.','warning');
    const node=_all.find(s=>s.sensor_id===sensorId);
    OpsModal.confirm(`${unbind?'Remove the driver binding from':'Assign '+(driver.name || 'the selected driver')+' to'} ${node?.name || sensorId}? This changes telemetry mapping and the supported command set. It does not verify installed hardware.`,async()=>{
      if(!requireDeviceManage())return;
      OpsModal.setLoading(true);
      try {
        await OpsModal.apiPut(`/monitoring/sensors/${sensorId}/driver`, { driver_id: unbind?null:Number(driver.id) });
        OpsModal.close(); OpsModal.toast('Driver assignment saved.', 'success');
        await load(); if (_drawerId === sensorId) renderDrawer();
      } catch (err) { OpsModal.setLoading(false); OpsModal.toast(err.message || 'Failed to set driver', 'error'); }
    });
  }

  return {
    render, setFilter, setTag, setQuery, fleetAnalytics,
    targetCohort, _targetPreview, applyCohort,
    editTags, saveTags, bulkTag, confirmBulkTag,
    deviceRecord, saveDeviceRecord, lifecycleLog, replaceDevice, doReplace, timeline,
    connectivityPanel, powerPanel, calibrationPanel,
    integrityPanel, setGeofenceAnchor, editGeofence, saveGeofence, flagTamper, clearTamper, doTamper,
    driversManager, drvHome, drvEdit, drvSave, setDriver, saveDriver,
    protectionWindows, refreshWindows, createWindow, cancelWindow,
    profilesManager, pfHome, pfCreate, pfOpen, pfSave, pfAssign,
    firmwareManager, fwHome, fwCreateRelease, fwCreateRollout, fwOpenRollout, fwAdvance, fwState, fwRollback,
    viewSensor, closeDrawer, decommission, openFull, back, queueCommand, drawerTab, drawerKey,
    getSensor: (id) => _all.find(s => s.sensor_id === id),
    telemetryMarkup,
    canManage:canMng,
    loadAll: async () => { _all = OpsModal.readArray(await OpsModal.apiGet('/monitoring/sensors/all'),'Device fleet'); return _all; },
    mount3D: (hostId) => mountModelViewer(hostId, (hostId || 'sn-3d') + '-state'),
    dispose3D: () => disposeViewer(),
    preload3D: () => preload3D(),
    coverage, saveCoverage, history, calibrate, confirmCalibrate, openAsset,
    toggleSelect, toggleSelectAll, clearSelection, bulkCommand, confirmBulkCommand,
    sendCommand, _onCmdChange, confirmSendCommand, commandHistory, cancelCommand,
    _doOverride,
  };
})();
// Expose on window so other modules (e.g. Network) can reach it — a top-level
// `const` is only a lexical global, not a window property.
window.OpsSensors = OpsSensors;
