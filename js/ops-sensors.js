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
  let _tag = '';
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
      /* ── Redesigned drawer (ArtemisOS-style): breadcrumb, status tokens,
         action bar, tabs, metric cards ── */
      .sn-crumb { font-size:var(--fs-2xs); font-weight:600; letter-spacing:.04em; text-transform:uppercase; color:var(--ink-3); display:flex; align-items:center; gap:6px; margin-bottom:6px; }
      .sn-crumb span { opacity:.6; }
      .sn-status-line { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin-top:8px; font-family:var(--ff-m); font-size:var(--fs-2xs); font-weight:700; letter-spacing:.03em; }
      .sn-tok { display:inline-flex; align-items:center; gap:5px; color:var(--ink-2); }
      .sn-tok.id { color:var(--ink-3); }
      .sn-tok.ok { color:var(--ok); } .sn-tok.warn { color:var(--warn); } .sn-tok.err { color:var(--err); } .sn-tok.blue { color:var(--blue-hi,#22c3e6); }
      .sn-tok .tdot { width:7px; height:7px; border-radius:50%; background:currentColor; }
      .sn-status-line .sep { color:var(--ink-4,#8494a0); opacity:.6; }
      .sn-head-actions { display:flex; align-items:center; gap:2px; flex-shrink:0; }
      .sn-icon-btn { background:none; border:none; color:var(--ink-3); cursor:pointer; padding:6px; border-radius:8px; display:grid; place-items:center; }
      .sn-icon-btn:hover { background:var(--surface-2); color:var(--ink); }
      /* action bar */
      .sn-actionbar { display:flex; align-items:stretch; gap:8px; margin:14px 0 4px; }
      .sn-ab-icon { flex:0 0 auto; width:46px; display:grid; place-items:center; background:var(--surface-2); border:1px solid var(--border); border-radius:11px; color:var(--ink-2); cursor:pointer; transition:.13s; }
      .sn-ab-icon:hover { color:var(--blue-hi,#22c3e6); border-color:var(--blue-dim,#7fc8e0); }
      .sn-ab-main { flex:1; display:flex; align-items:center; justify-content:center; gap:8px; padding:12px 14px; background:var(--surface-2); border:1px solid var(--border); border-radius:11px; color:var(--ink); font-family:var(--ff-b); font-weight:700; font-size:var(--fs-sm); cursor:pointer; transition:.13s; }
      .sn-ab-main:hover { border-color:var(--blue-dim,#7fc8e0); color:var(--blue-hi,#22c3e6); }
      /* tabs */
      .sn-tabs { display:flex; gap:2px; border-bottom:1px solid var(--border); margin:16px 0 14px; }
      .sn-tab { flex:1; background:none; border:none; padding:10px 4px; font-family:var(--ff-b); font-size:var(--fs-2xs); font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--ink-3); cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; transition:.13s; }
      .sn-tab:hover { color:var(--ink-2); }
      .sn-tab.active { color:var(--ink); border-bottom-color:var(--blue-hi,#22c3e6); }
      /* metric cards */
      .sn-sec-h { font-size:var(--fs-2xs); font-weight:700; letter-spacing:1px; text-transform:uppercase; color:var(--ink-3); margin:4px 0 9px; }
      .sn-sec-h:not(:first-child) { margin-top:16px; }
      .sn-cards { display:grid; grid-template-columns:repeat(2,1fr); gap:8px; }
      .sn-card { background:var(--surface-2); border:1px solid var(--border); border-radius:11px; padding:12px 13px; min-width:0; }
      .sn-card-k { font-size:var(--fs-2xs); font-weight:600; letter-spacing:.04em; text-transform:uppercase; color:var(--ink-3); }
      .sn-card-v { margin-top:6px; font-family:var(--ff-m); font-size:var(--fs-lg); font-weight:800; color:var(--ink); overflow:hidden; text-overflow:ellipsis; }
      .sn-card-badge { display:inline-block; margin-top:6px; padding:2px 8px; border-radius:100px; background:var(--wb); color:var(--warn); font-size:var(--fs-2xs); font-weight:700; }
      /* ── 3D node model viewer (top of drawer) ── */
      .sn-3d { position:relative; width:100%; height:220px; border-radius:12px; overflow:hidden; background:radial-gradient(120% 120% at 50% 20%, var(--surface-2), var(--surface)); border:1px solid var(--border); margin-bottom:14px; }
      .sn-3d canvas { display:block; width:100% !important; height:100% !important; outline:none; cursor:grab; }
      .sn-3d canvas:active { cursor:grabbing; }
      .sn-3d-state { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; gap:9px; font-size:var(--fs-xs); color:var(--ink-3); pointer-events:none; }
      .sn-3d-spin { width:15px; height:15px; border:2px solid var(--border); border-top-color:var(--blue-hi,#22c3e6); border-radius:50%; animation:sn3dspin .7s linear infinite; }
      @keyframes sn3dspin { to { transform:rotate(360deg); } }
      .sn-3d-hint { position:absolute; left:0; right:0; bottom:6px; text-align:center; font-size:var(--fs-2xs); color:var(--ink-4,#8494a0); pointer-events:none; opacity:.75; }
    </style>`;

  async function render(container) {
    _container = container;
    _drawerId = null;
    _container.innerHTML = STYLES + shellHTML();
    await load();
  }

  function shellHTML() {
    return `
      <div class="fg-page-header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
        <div>
          <div class="fg-page-title">Sentinel Devices</div>
          <div class="fg-page-sub" id="sn-page-sub">Fleet management</div>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0">
          <button class="btn-ghost" onclick="OpsSensors.profilesManager()" title="Device configuration profiles">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:-2px;margin-right:6px"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>Profiles
          </button>
          <button class="btn-ghost" onclick="OpsSensors.firmwareManager()" title="Firmware releases & staged rollouts">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:-2px;margin-right:6px"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>Firmware
          </button>
          <button class="btn-ghost" onclick="OpsSensors.protectionWindows()" title="Pause reboots/firmware during storms or incidents">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:-2px;margin-right:6px"><path stroke-linecap="round" stroke-linejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Maintenance windows
          </button>
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
      preload3D(); // warm three.js + decoded model so the first drawer is instant
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

  // Three-state trust model (server-computed): Device alive? · Sensor data
  // trustworthy? · what's actually in the drain (UNKNOWN when data isn't trusted).
  function stateCards(x) {
    const col = { ok:'var(--ok)', warn:'var(--warn)', err:'var(--err)', muted:'var(--ink-4)' };
    const DS = { online:['ok','Online'], degraded:['warn','Degraded'], offline:['err','Offline'], maintenance:['muted','Maintenance'] };
    const SS = { ok:['ok','Trusted'], stale:['warn','Stale'], frozen:['warn','Frozen'], implausible:['err','Implausible'], unknown:['muted','Unknown'] };
    const IS = { normal:['ok','Normal'], elevated:['warn','Elevated'], high:['err','High'], critical:['err','Critical'], unknown:['warn','Unknown'] };
    const pill = (m, mark) => `<span style="display:inline-flex;align-items:center;gap:5px;font-weight:700;color:${col[m[0]]}"><span style="width:7px;height:7px;border-radius:50%;background:${col[m[0]]}"></span>${mark||''}${m[1]}</span>`;
    const c = (k, inner, reason) => `<div class="sn-card"><div class="sn-card-k">${k}</div><div class="sn-card-v" style="font-size:var(--fs-sm)">${inner}</div>${reason ? `<div style="font-size:var(--fs-2xs);color:var(--ink-4);margin-top:3px">${esc(reason)}</div>` : ''}</div>`;
    return c('Device', pill(DS[x.device_state] || DS.offline), x.device_reason)
         + c('Sensor data', pill(SS[x.sensor_state] || SS.unknown), x.sensor_reason)
         + c('Drainage', pill(IS[x.infrastructure_state] || IS.unknown, x.infrastructure_state === 'unknown' ? '⚠ ' : ''), x.infra_reason);
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
    // "alive but lying" — device reachable, data not trustworthy (stale/frozen/implausible)
    const dataIssues = _all.filter(x => x.data_trust === false && (x.device_state === 'online' || x.device_state === 'degraded')).length;

    if (sub) sub.textContent = `${total} nodes · ${commonFw ? 'firmware ' + commonFw + ' · ' : ''}fleet management`;

    if (kp) kp.innerHTML = '';

    const chips = [
      ['all', `All (${total})`], ['healthy', `Healthy (${healthy})`],
      ['degraded', `Degraded (${degraded})`], ['offline', `Offline (${offline})`],
      ['dataissue', `Data issues (${dataIssues})`],
      ['lowbatt', `Low battery (${battKnown ? lowBatt : 0})`],
      ['unassigned', `Unassigned (${unassigned})`],
    ];
    tb.innerHTML = `
      <div class="lv-search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input placeholder="Search Sentinels…" value="${_q.replace(/"/g, '&quot;')}" oninput="OpsSensors.setQuery(this.value)">
      </div>
      <div class="lv-toolbar-right">
        ${(() => { const tags = [...new Set(_all.flatMap(s => s.tags || []))].sort();
          return tags.length ? `<select class="um-filter" onchange="OpsSensors.setTag(this.value)">
            <option value="">All tags</option>
            ${tags.map(t => `<option value="${esc(t)}" ${_tag === t ? 'selected' : ''}>#${esc(t)}</option>`).join('')}
          </select>` : ''; })()}
        <select class="um-filter" onchange="OpsSensors.setFilter(this.value)">${chips.map(([k, l]) =>
        `<option value="${k}" ${_filter === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;

    let rows = _all.map((x, i) => ({ x, tier: tiers[i] }));
    if (_filter === 'healthy') rows = rows.filter(r => r.tier === 'healthy');
    else if (_filter === 'degraded') rows = rows.filter(r => r.tier === 'degraded');
    else if (_filter === 'offline') rows = rows.filter(r => r.tier === 'offline');
    else if (_filter === 'dataissue') rows = rows.filter(r => r.x.data_trust === false && (r.x.device_state === 'online' || r.x.device_state === 'degraded'));
    else if (_filter === 'lowbatt') rows = rows.filter(r => r.x.battery_percent != null && r.x.battery_percent < 20);
    else if (_filter === 'unassigned') rows = rows.filter(r => !r.x.assets || !r.x.assets.length);
    if (_tag) rows = rows.filter(r => (r.x.tags || []).includes(_tag));
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
      ${canMng() ? `<button class="btn-ghost" onclick="OpsSensors.bulkTag()">Tag…</button>
      <button class="btn-ghost" onclick="OpsSensors.bulkCommand('firmware_update')">Push firmware</button>
      <button class="btn-ghost" onclick="OpsSensors.bulkCommand('reset')">Remote reset</button>
      <button class="btn-ghost" onclick="OpsSensors.bulkCommand('recalibrate')">Request recalibration</button>` : ''}
      <button class="sn-bulk-clear" onclick="OpsSensors.clearSelection()">Clear</button>
    `;
  }

  // Bulk add/remove a tag across the selected Sentinels.
  function bulkTag() {
    if (!_selected.size) return;
    const n = _selected.size;
    OpsModal.open(`Tag ${n} Sentinel${n > 1 ? 's' : ''}`, `
      <p style="margin:0 0 12px;font-size:var(--fs-base);color:var(--ink-3);line-height:1.5">Add or remove a group tag across the ${n} selected node${n > 1 ? 's' : ''} (e.g. <code>lekki</code>, <code>ring-pilot</code>, <code>hw-v2</code>).</p>
      ${OpsModal.field('Add tag', 'add', 'text', '', { required: false, placeholder: 'tag to add' })}
      ${OpsModal.field('Remove tag', 'remove', 'text', '', { required: false, placeholder: 'tag to remove' })}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: `Apply to ${n}`, class: 'btn-primary', onclick: 'OpsSensors.confirmBulkTag()' },
    ]);
  }
  async function confirmBulkTag() {
    const f = OpsModal.getFormData();
    if (!f.add && !f.remove) { OpsModal.toast('Enter a tag to add or remove.', 'warning'); return; }
    OpsModal.setLoading(true);
    try {
      const r = await OpsModal.apiPost('/monitoring/sensors/tags/bulk', {
        sensor_ids: Array.from(_selected), add: f.add ? [f.add] : [], remove: f.remove ? [f.remove] : [] });
      OpsModal.close();
      OpsModal.toast(`Tags updated on ${(r.data && r.data.updated) || _selected.size} node(s).`, 'success');
      _selected.clear();
      await load();
    } catch (err) { OpsModal.setLoading(false); OpsModal.toast(err.message || 'Failed to update tags', 'error'); }
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
        <td class="sn-node-id" style="cursor:pointer;" title="Open full details" onclick="event.stopPropagation();OpsSensors.openFull('${__sid(x.sensor_id)}')">
          <div class="lv-name-cell">
            <div class="lv-avatar" style="background:var(--surface-3);color:var(--ink-3);border:1px solid var(--border);"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></svg></div>
            <div style="min-width:0;"><div class="lv-name">${esc(x.name || x.sensor_id)}</div>${x.pending_commands ? `<span class="lv-source" style="color:var(--blue-hi);">${x.pending_commands} queued</span>` : ''}</div>
          </div>
        </td>
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
  function setTag(t) { _tag = t; draw(); }
  function setQuery(q) { _q = q; draw(); }

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
    let list = [];
    try { list = (await OpsModal.apiGet('/monitoring/protection-windows')).data || []; } catch (_) {}
    const fmt = d => d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
    const scopeLabel = w => w.scope_type === 'fleet' ? 'Whole fleet' : `${w.scope_type}: ${esc(w.scope_value || '')}`;
    const rows = list.length ? list.map(w => `
      <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
        <span class="lv-status ${w.active ? 'warn' : 'neutral'}" style="margin-top:2px">${w.active ? 'Active' : 'Scheduled'}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;color:var(--ink)">${scopeLabel(w)}</div>
          ${w.reason ? `<div style="font-size:var(--fs-sm);color:var(--ink-2);margin-top:2px">${esc(w.reason)}</div>` : ''}
          <div style="font-size:var(--fs-2xs);color:var(--ink-3);margin-top:3px">${fmt(w.starts_at)} → ${fmt(w.ends_at)}${w.created_by_name ? ' · ' + esc(w.created_by_name) : ''}</div>
        </div>
        <button class="btn-ghost" style="padding:4px 10px" onclick="OpsSensors.cancelWindow(${w.id})">End</button>
      </div>`).join('') : '<div style="color:var(--ink-3);font-size:var(--fs-sm);padding:6px 0 14px">No active or scheduled windows.</div>';

    const form = `
      <div style="border-top:1px solid var(--border);margin-top:8px;padding-top:14px">
        <div style="font-weight:600;margin-bottom:10px">New window</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          ${OpsModal.field('Scope', 'scope_type', 'select', 'fleet', { options: [
            { value: 'fleet', label: 'Whole fleet' }, { value: 'tag', label: 'Tag / group' },
            { value: 'property', label: 'Property' }, { value: 'sensor', label: 'One Sentinel' }] })}
          ${OpsModal.field('Scope value (tag / property_id / sensor_id)', 'scope_value', 'text', '', { required: false, placeholder: 'leave blank for whole fleet' })}
        </div>
        ${OpsModal.field('Reason', 'reason', 'text', '', { required: false, placeholder: 'e.g. Heavy rain forecast tonight' })}
        ${OpsModal.field('Protect until', 'ends_at', 'datetime-local', '', { required: true })}
        <div style="text-align:right;margin-top:10px"><button class="btn-primary" onclick="OpsSensors.createWindow()">Start protection</button></div>
      </div>`;
    body.innerHTML = rows + form;
  }
  async function createWindow() {
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
    try { await OpsModal.apiPost(`/monitoring/protection-windows/${id}/cancel`, {}); OpsModal.toast('Window ended.', 'success'); refreshWindows(); }
    catch (err) { OpsModal.toast(err.message || 'Failed', 'error'); }
  }

  // ── Device configuration profiles ─────────────────────────────────────
  const CFG_FIELDS = [
    ['telemetry_interval_sec', 'Telemetry interval (s)', 60],
    ['water_poll_sec', 'Water polling (s)', 10],
    ['offline_alert_min', 'Offline alert (min)', 5],
    ['high_level_pct', 'High water (%)', 70],
    ['critical_level_pct', 'Critical water (%)', 85],
  ];
  function profilesManager() {
    OpsModal.open('Device profiles',
      '<div id="pf-body" style="min-width:520px;max-width:640px"><div style="padding:20px;color:var(--ink-3)">Loading…</div></div>',
      [{ label: 'Close', onclick: 'OpsModal.close()' }]);
    pfHome();
  }
  async function pfHome() {
    const body = document.getElementById('pf-body'); if (!body) return;
    let list = [];
    try { list = (await OpsModal.apiGet('/device-profiles')).data || []; } catch (_) {}
    const rows = list.length ? list.map(p => `<div class="sn-act-row" style="justify-content:space-between;cursor:pointer" onclick="OpsSensors.pfOpen(${p.id})">
        <div><b>${esc(p.name)}</b> <span class="lv-mono" style="color:var(--ink-3);margin-left:6px">v${p.version}</span>
          <div style="color:var(--ink-3);font-size:var(--fs-2xs);margin-top:2px">${p.assigned} assigned${p.drifted ? ` · <span style="color:var(--warn)">${p.drifted} drifted</span>` : ' · in sync'}</div></div>
        <span style="color:var(--ink-3)">›</span></div>`).join('')
      : '<div style="color:var(--ink-3);font-size:var(--fs-sm)">No profiles yet.</div>';
    body.innerHTML = `${rows}
      <div style="border-top:1px solid var(--border);margin-top:14px;padding-top:12px">
        <div style="font-weight:600;margin-bottom:8px">New profile</div>
        ${OpsModal.field('Name', 'pf-name', 'text', '', { required: false, placeholder: 'e.g. Urban Drain Profile' })}
        <div style="text-align:right;margin-top:8px"><button class="btn-primary" onclick="OpsSensors.pfCreate()">Create</button></div>
      </div>`;
  }
  async function pfCreate() {
    const f = OpsModal.getFormData();
    if (!f['pf-name']) { OpsModal.toast('Name the profile.', 'warning'); return; }
    try { const r = await OpsModal.apiPost('/device-profiles', { name: f['pf-name'], config: {} }); OpsModal.toast('Profile created.', 'success'); pfOpen(r.data.id); }
    catch (err) { OpsModal.toast(err.message || 'Failed', 'error'); }
  }
  async function pfOpen(id) {
    const body = document.getElementById('pf-body'); if (!body) return;
    body.innerHTML = '<div style="padding:20px;color:var(--ink-3)">Loading…</div>';
    let d; try { d = (await OpsModal.apiGet('/device-profiles/' + id)).data; } catch (_) { body.innerHTML = '<div style="padding:20px;color:var(--err)">Couldn\'t load.</div>'; return; }
    const cfg = d.config || {};
    const fields = CFG_FIELDS.map(([k, label, def]) => `<div class="ops-modal-field"><label class="ops-label">${label}</label><input class="ops-input" id="pf-${k}" type="number" value="${cfg[k] != null ? cfg[k] : def}"></div>`).join('');
    const drift = (d.devices || []).filter(x => x.drift).length;
    body.innerHTML = `
      <div class="sn-crumb" style="cursor:pointer" onclick="OpsSensors.pfHome()">‹ Profiles</div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin:6px 0 10px">
        <span style="font-family:var(--ff-d);font-size:17px;font-weight:700">${esc(d.name)} <span class="lv-mono" style="color:var(--ink-3);font-size:var(--fs-sm)">v${d.version}</span></span>
        <span style="font-size:var(--fs-2xs);color:${drift ? 'var(--warn)' : 'var(--ink-3)'}">${d.devices.length} assigned${drift ? ` · ${drift} drifted` : ''}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${fields}
        <div class="ops-modal-field"><label class="ops-label">Camera mode</label><select class="ops-input" id="pf-camera_mode">${['off', 'event', 'continuous'].map(o => `<option ${cfg.camera_mode === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
        <div class="ops-modal-field"><label class="ops-label">Firmware channel</label><select class="ops-input" id="pf-firmware_channel">${['stable', 'beta', 'internal'].map(o => `<option ${cfg.firmware_channel === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
      </div>
      <div style="text-align:right;margin-top:10px"><button class="btn-primary" onclick="OpsSensors.pfSave(${id})">Save new version</button></div>
      <div style="border-top:1px solid var(--border);margin-top:14px;padding-top:12px">
        <div style="font-weight:600;margin-bottom:8px">Assign</div>
        <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end">
          ${OpsModal.field('Target', 'pf-target', 'select', 'fleet', { options: [{ value: 'fleet', label: 'Whole fleet' }, { value: 'tag', label: 'Tag / group' }] })}
          ${OpsModal.field('Tag', 'pf-tag', 'text', '', { required: false, placeholder: 'if tag' })}
          <button class="btn-ghost" style="height:40px" onclick="OpsSensors.pfAssign(${id})">Assign</button>
        </div>
      </div>
      ${d.history && d.history.length ? `<div style="border-top:1px solid var(--border);margin-top:14px;padding-top:10px"><div style="font-weight:600;margin-bottom:6px;font-size:var(--fs-sm)">History</div>${d.history.map(h => `<div style="font-size:var(--fs-2xs);color:var(--ink-3)">v${h.version} · ${esc(h.note || '')} · ${new Date(h.changed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}${h.changed_by_name ? ' · ' + esc(h.changed_by_name) : ''}</div>`).join('')}</div>` : ''}`;
  }
  function _pfReadConfig() {
    const c = {};
    CFG_FIELDS.forEach(([k]) => { const el = document.getElementById('pf-' + k); if (el) c[k] = el.value; });
    c.camera_mode = (document.getElementById('pf-camera_mode') || {}).value;
    c.firmware_channel = (document.getElementById('pf-firmware_channel') || {}).value;
    return c;
  }
  async function pfSave(id) {
    try { const r = await OpsModal.apiPut('/device-profiles/' + id, { config: _pfReadConfig() });
      OpsModal.toast(`Saved v${r.data.version} — re-pushed to ${r.data.repushed} device(s).`, 'success'); pfOpen(id); }
    catch (err) { OpsModal.toast(err.message || 'Failed to save', 'error'); }
  }
  async function pfAssign(id) {
    const f = OpsModal.getFormData();
    try { const r = await OpsModal.apiPost(`/device-profiles/${id}/assign`, { target_type: f['pf-target'], target_value: f['pf-target'] === 'tag' ? f['pf-tag'] : null });
      OpsModal.toast(`Assigned to ${(r.data && r.data.assigned) || 0} device(s) — config queued.`, 'success'); pfOpen(id); await load(); }
    catch (err) { OpsModal.toast(err.message || 'Failed to assign', 'error'); }
  }

  // ── Firmware releases & staged rollouts ───────────────────────────────
  const RO_CHIP = { active:['warn','Active'], paused:['neutral','Paused'], completed:['ok','Completed'], rolled_back:['danger','Rolled back'], cancelled:['neutral','Cancelled'] };
  function firmwareManager() {
    OpsModal.open('Firmware & rollouts',
      '<div id="fw-body" style="min-width:520px;max-width:640px"><div style="padding:20px;color:var(--ink-3)">Loading…</div></div>',
      [{ label: 'Close', onclick: 'OpsModal.close()' }]);
    fwHome();
  }
  async function fwHome() {
    const body = document.getElementById('fw-body'); if (!body) return;
    let rel = [], ro = [];
    try { rel = (await OpsModal.apiGet('/firmware/releases')).data || []; } catch (_) {}
    try { ro = (await OpsModal.apiGet('/firmware/rollouts')).data || []; } catch (_) {}
    const relRows = rel.length ? rel.map(r => `<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:var(--fs-sm)">
        <div><b>${esc(r.version)}</b> <span class="lv-status neutral" style="margin-left:6px">${esc(r.channel)}</span>${r.notes ? `<div style="color:var(--ink-3);font-size:var(--fs-2xs);margin-top:2px">${esc(r.notes)}</div>` : ''}</div>
        <div class="lv-mono" style="color:var(--ink-3)">${r.devices_on_version} on this</div></div>`).join('')
      : '<div style="color:var(--ink-3);font-size:var(--fs-sm)">No releases yet.</div>';
    const relOpts = rel.map(r => `<option value="${r.id}">${esc(r.version)} (${esc(r.channel)})</option>`).join('');
    const roRows = ro.length ? ro.map(r => { const c = RO_CHIP[r.status] || RO_CHIP.active;
        const pct = r.total ? Math.round((r.updated / r.total) * 100) : 0;
        return `<div class="sn-act-row" style="justify-content:space-between;cursor:pointer" onclick="OpsSensors.fwOpenRollout(${r.id})">
          <div><b>${esc(r.name || r.version)}</b> <span class="lv-status ${c[0]}" style="margin-left:6px">${c[1]}</span>
            <div style="color:var(--ink-3);font-size:var(--fs-2xs);margin-top:2px">→ ${esc(r.version)} · ${r.target_type === 'fleet' ? 'whole fleet' : '#' + esc(r.target_value || '')} · ${r.updated}/${r.total} updated (${pct}%)</div></div>
          <span style="color:var(--ink-3)">›</span></div>`; }).join('')
      : '<div style="color:var(--ink-3);font-size:var(--fs-sm)">No rollouts yet.</div>';
    body.innerHTML = `
      <div style="font-weight:600;margin-bottom:8px">Releases</div>${relRows}
      <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:end;margin:12px 0 20px">
        ${OpsModal.field('New version', 'fw-version', 'text', '', { required: false, placeholder: '2.4.1' })}
        ${OpsModal.field('Channel', 'fw-channel', 'select', 'stable', { options: ['stable', 'beta', 'internal'] })}
        <button class="btn-ghost" style="height:40px" onclick="OpsSensors.fwCreateRelease()">Add</button>
      </div>
      <div style="font-weight:600;margin-bottom:8px;border-top:1px solid var(--border);padding-top:14px">Rollouts</div>${roRows}
      ${rel.length ? `<div style="border-top:1px solid var(--border);margin-top:14px;padding-top:12px">
        <div style="font-weight:600;margin-bottom:8px">New rollout</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${OpsModal.field('Release', 'ro-release', 'select', '', { options: rel.map(r => ({ value: String(r.id), label: r.version + ' (' + r.channel + ')' })) })}
          ${OpsModal.field('Target', 'ro-target', 'select', 'fleet', { options: [{ value: 'fleet', label: 'Whole fleet' }, { value: 'tag', label: 'Tag / group' }] })}
        </div>
        ${OpsModal.field('Tag (if target = tag)', 'ro-tag', 'text', '', { required: false, placeholder: 'e.g. lekki' })}
        ${OpsModal.field('Rings (cumulative %)', 'ro-rings', 'text', '5, 25, 100', { required: false, placeholder: '5, 25, 100' })}
        <div style="text-align:right;margin-top:10px"><button class="btn-primary" onclick="OpsSensors.fwCreateRollout()">Create rollout</button></div>
      </div>` : ''}`;
  }
  async function fwCreateRelease() {
    const f = OpsModal.getFormData();
    if (!f['fw-version']) { OpsModal.toast('Enter a version.', 'warning'); return; }
    try { await OpsModal.apiPost('/firmware/releases', { version: f['fw-version'], channel: f['fw-channel'] }); OpsModal.toast('Release added.', 'success'); fwHome(); }
    catch (err) { OpsModal.toast(err.message || 'Failed', 'error'); }
  }
  async function fwCreateRollout() {
    const f = OpsModal.getFormData();
    if (!f['ro-release']) { OpsModal.toast('Pick a release.', 'warning'); return; }
    const rings = (f['ro-rings'] || '5,25,100').split(',').map(s => parseInt(s.trim(), 10)).filter(n => n > 0);
    try {
      const r = await OpsModal.apiPost('/firmware/rollouts', {
        release_id: parseInt(f['ro-release'], 10), target_type: f['ro-target'],
        target_value: f['ro-target'] === 'tag' ? f['ro-tag'] : null, rings });
      OpsModal.toast(`Rollout created — ${(r.data && r.data.total) || 0} devices staged.`, 'success');
      fwOpenRollout(r.data.id);
    } catch (err) { OpsModal.toast(err.message || 'Failed to create rollout', 'error'); }
  }
  async function fwOpenRollout(id) {
    const body = document.getElementById('fw-body'); if (!body) return;
    body.innerHTML = '<div style="padding:20px;color:var(--ink-3)">Loading…</div>';
    let d; try { d = (await OpsModal.apiGet('/firmware/rollouts/' + id)).data; } catch (_) { body.innerHTML = '<div style="padding:20px;color:var(--err)">Couldn\'t load.</div>'; return; }
    const c = RO_CHIP[d.status] || RO_CHIP.active;
    const bar = r => { const w = r.total ? (r.updated / r.total) * 100 : 0;
      return `<div style="height:6px;border-radius:3px;background:var(--surface-3);overflow:hidden;margin-top:6px"><div style="height:100%;width:${w}%;background:var(--ok)"></div></div>`; };
    const ringRows = d.rings.map(r => `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;font-size:var(--fs-sm)"><b>Ring ${r.index + 1} · ${r.percent}%</b>
          <span style="color:var(--ink-3)">${r.open ? 'open' : 'not opened'}</span></div>
        <div style="font-size:var(--fs-2xs);color:var(--ink-3);margin-top:3px">${r.total} devices · ${r.updated} updated · ${r.queued} queued · ${r.pending} pending${r.failed ? ` · <span style="color:var(--err)">${r.failed} failed</span>` : ''}</div>
        ${bar(r)}</div>`).join('');
    const canAdvance = d.status === 'active' && d.current_ring < d.rings.length - 1;
    const actions = [
      canAdvance ? `<button class="btn-primary" onclick="OpsSensors.fwAdvance(${id})">Advance to ring ${d.current_ring + 2}</button>` : '',
      d.status === 'active' ? `<button class="btn-ghost" onclick="OpsSensors.fwState(${id},'pause')">Pause</button>` : '',
      d.status === 'paused' ? `<button class="btn-ghost" onclick="OpsSensors.fwState(${id},'resume')">Resume</button>` : '',
      ['active', 'paused'].includes(d.status) ? `<button class="btn-danger" onclick="OpsSensors.fwRollback(${id})">Roll back</button>` : '',
      ['active', 'paused'].includes(d.status) ? `<button class="btn-ghost" onclick="OpsSensors.fwState(${id},'cancel')">Cancel</button>` : '',
    ].filter(Boolean).join(' ');
    const failed = d.failed.length ? `<div style="margin-top:12px"><div style="font-weight:600;color:var(--err);font-size:var(--fs-sm);margin-bottom:4px">Failed (${d.failed.length})</div>${d.failed.map(x => `<div style="font-size:var(--fs-2xs);color:var(--ink-3)">${esc(x.name || x.sensor_id)}</div>`).join('')}</div>` : '';
    body.innerHTML = `
      <div class="sn-crumb" style="cursor:pointer" onclick="OpsSensors.fwHome()">‹ Firmware</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:6px 0 4px">
        <div><span style="font-family:var(--ff-d);font-size:17px;font-weight:700">${esc(d.name || d.version)}</span>
          <div style="color:var(--ink-3);font-size:var(--fs-2xs)">→ ${esc(d.version)} · ${d.target_type === 'fleet' ? 'whole fleet' : '#' + esc(d.target_value || '')} · ${d.total} devices</div></div>
        <span class="lv-status ${c[0]}">${c[1]}</span>
      </div>
      <div style="margin:12px 0">${ringRows}</div>
      ${failed}
      <div class="actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">${actions}</div>`;
  }
  async function fwAdvance(id) {
    try { const r = await OpsModal.apiPost(`/firmware/rollouts/${id}/advance`, {});
      const m = r.data || {}; OpsModal.toast(`Ring ${m.ring} opened — ${m.queued} queued${m.deferred ? `, ${m.deferred} deferred (protected)` : ''}.`, 'success'); fwOpenRollout(id); }
    catch (err) { OpsModal.toast(err.message || 'Failed to advance', 'error'); }
  }
  async function fwState(id, action) {
    try { await OpsModal.apiPost(`/firmware/rollouts/${id}/${action}`, {}); OpsModal.toast('Updated.', 'success'); fwOpenRollout(id); }
    catch (err) { OpsModal.toast(err.message || 'Failed', 'error'); }
  }
  function fwRollback(id) {
    OpsModal.confirm('Roll back this rollout? Devices already updated/queued get re-flashed to their previous firmware.', async () => {
      try { const r = await OpsModal.apiPost(`/firmware/rollouts/${id}/rollback`, {}); OpsModal.toast(`Rollback queued for ${(r.data && r.data.reverted) || 0} device(s).`, 'success'); fwOpenRollout(id); }
      catch (err) { OpsModal.toast(err.message || 'Failed to roll back', 'error'); }
    });
  }

  // Per-device tag editor (comma-separated).
  function editTags(sensorId) {
    const x = _all.find(s => s.sensor_id === sensorId) || {};
    OpsModal.open(`Manage tags — ${esc(x.name || sensorId)}`, `
      <p style="margin:0 0 10px;font-size:var(--fs-sm);color:var(--ink-3)">Comma-separated group tags — used for filtering and bulk actions (e.g. <code>lekki, ring-pilot, hw-v2</code>).</p>
      ${OpsModal.field('Tags', 'tags', 'text', (x.tags || []).join(', '), { required: false, placeholder: 'lekki, ring-pilot, hw-v2' })}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: 'Save', class: 'btn-primary', onclick: `OpsSensors.saveTags('${__sid(sensorId)}')` },
    ]);
  }
  async function saveTags(sensorId) {
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
    const x = _all.find(s => s.sensor_id === sensorId) || {};
    OpsModal.open(`Lifecycle &amp; hardware — ${esc(x.name || sensorId)}`, `
      <p style="margin:0 0 12px;font-size:var(--fs-sm);color:var(--ink-3)">Lifecycle state is where the unit sits in its life — separate from its live health. Hardware identity is used for warranty, RMA and audit.</p>
      ${OpsModal.field('Lifecycle state', 'lifecycle_state', 'select', x.lifecycle_state || 'active', { options: LIFECYCLE_OPTS })}
      ${OpsModal.field('Reason / note (optional)', 'lifecycle_note', 'text', '', { required: false, placeholder: 'e.g. moved to warehouse after site cancellation' })}
      <div style="height:1px;background:var(--line);margin:14px 0"></div>
      ${OpsModal.row([
        OpsModal.field('Serial number', 'serial_number', 'text', x.serial_number || '', { required: false, placeholder: 'FG-…' }),
        OpsModal.field('Hardware rev', 'hardware_rev', 'text', x.hardware_rev || '', { required: false, placeholder: 'v2.1' }),
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
      { label: 'Save', class: 'btn-primary', onclick: `OpsSensors.saveDeviceRecord('${__sid(sensorId)}')` },
    ]);
  }
  async function saveDeviceRecord(sensorId) {
    const x = _all.find(s => s.sensor_id === sensorId) || {};
    const f = OpsModal.getFormData();
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
      if (f.lifecycle_state && f.lifecycle_state !== (x.lifecycle_state || 'active')) {
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
    let resp;
    try { resp = await OpsModal.apiGet(`/monitoring/sensors/${sensorId}/lifecycle`); }
    catch (err) { OpsModal.toast(err.message || 'Failed to load history', 'error'); return; }
    const events = (resp && resp.data) || [];
    const EV = { state_change:['var(--blue-hi)','State change'], rma_out:['var(--err)','RMA out'], rma_in:['var(--ok)','RMA in'], replaced_by:['var(--warn)','Replaced'], note:['var(--ink-3)','Note'] };
    const body = events.length ? `<div style="display:flex;flex-direction:column;gap:0">${events.map(e => {
      const m = EV[e.event] || ['var(--ink-3)', e.event];
      const when = e.created_at ? new Date(e.created_at).toLocaleString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
      const trans = (e.from_state || e.to_state) ? ` <span style="color:var(--ink-3)">${esc(e.from_state || '—')} → ${esc(e.to_state || '—')}</span>` : '';
      const note = e.detail && (e.detail.note || e.detail.reason) ? `<div style="font-size:var(--fs-xs);color:var(--ink-3);margin-top:2px">${esc(e.detail.note || e.detail.reason)}</div>` : '';
      return `<div style="padding:10px 0;border-bottom:1px solid var(--line)">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline">
          <span style="font-weight:700;color:${m[0]};font-size:var(--fs-sm)">${m[1]}${trans}</span>
          <span style="font-size:var(--fs-2xs);color:var(--ink-4);white-space:nowrap">${when}</span>
        </div>${note}</div>`;
    }).join('')}</div>` : `<p style="color:var(--ink-4);font-size:var(--fs-sm);margin:8px 0">No lifecycle events recorded yet.</p>`;
    OpsModal.open(`Lifecycle history — ${esc(x.name || sensorId)}`, body, [{ label: 'Close', class: 'btn-primary', onclick: 'OpsModal.close()' }]);
  }

  // ── Replace device (RMA transfer) ─────────────────────────────────
  function replaceDevice(sensorId) {
    const x = _all.find(s => s.sensor_id === sensorId) || {};
    const spares = _all.filter(s => s.sensor_id !== sensorId && ['inventory', 'warehouse', 'assigned'].includes(s.lifecycle_state));
    const pool = spares.length ? spares : _all.filter(s => s.sensor_id !== sensorId);
    if (!pool.length) { OpsModal.toast('No other device available to swap in.', 'error'); return; }
    const opts = pool.map(s => ({ value: s.sensor_id, label: `${s.name || s.sensor_id} (${s.sensor_id})${s.lifecycle_state ? ' · ' + s.lifecycle_state : ''}` }));
    OpsModal.open(`Replace device — ${esc(x.name || sensorId)}`, `
      <p style="margin:0 0 12px;font-size:var(--fs-sm);color:var(--ink-3)">Transfers this node's property, coverage, tags and config profile to the replacement. The faulty unit moves to <b>RMA</b>; the replacement goes <b>active</b>. Both are logged.</p>
      ${OpsModal.field('Replacement device', 'replacement_id', 'select', '', { options: opts })}
      ${OpsModal.field('Reason', 'reason', 'text', '', { required: false, placeholder: 'e.g. modem failure, no check-in for 9 days' })}
      ${spares.length ? '' : '<p style="margin:10px 0 0;font-size:var(--fs-xs);color:var(--warn)">No units in inventory/warehouse — showing all devices. Make sure the replacement is genuinely a spare.</p>'}
    `, [
      { label: 'Cancel', onclick: 'OpsModal.close()' },
      { label: 'Replace &amp; transfer', class: 'btn-primary', onclick: `OpsSensors.doReplace('${__sid(sensorId)}')` },
    ]);
  }
  async function doReplace(sensorId) {
    const f = OpsModal.getFormData();
    if (!f.replacement_id) { OpsModal.toast('Choose a replacement device.', 'error'); return; }
    OpsModal.setLoading(true);
    try {
      await OpsModal.apiPost(`/monitoring/sensors/${sensorId}/replace`, { replacement_sensor_id: f.replacement_id, note: f.reason || null });
      OpsModal.close();
      OpsModal.toast('Device replaced. Assignments transferred.', 'success');
      await load();
      if (_drawerId === sensorId) { _drawerId = f.replacement_id; renderDrawer(); }
    } catch (err) { OpsModal.setLoading(false); OpsModal.toast(err.message || 'Failed to replace device', 'error'); }
  }

  // ── Component topology tree (derived client-side from the node payload) ──
  const _TONE = { ok: 'var(--ok)', warn: 'var(--warn)', err: 'var(--err)', info: 'var(--blue-hi)', muted: 'var(--ink-4)' };
  function _battTone(p) { return p == null ? 'muted' : p >= 60 ? 'ok' : p >= 25 ? 'warn' : 'err'; }
  function _sigTone(p)  { return p == null ? 'muted' : p >= 50 ? 'ok' : p >= 25 ? 'warn' : 'err'; }
  function _dataTone(s) { return ({ ok: 'ok', stale: 'warn', frozen: 'warn', implausible: 'err', unknown: 'muted' })[s] || 'muted'; }

  function topologyTree(x) {
    const cap = x.capabilities || {};
    const offline = x.device_state === 'offline' || x.device_state === 'maintenance';
    const rootTone = { online: 'ok', degraded: 'warn', offline: 'err', maintenance: 'muted' }[x.device_state] || 'muted';
    const comps = [];
    const add = (label, value, tone, sub) => comps.push({ label, value, tone, sub });

    if (cap.water_level !== false)
      add('Level sensor', x.level != null ? `${Math.round(x.level)}%` : '—', offline ? 'muted' : _dataTone(x.sensor_state), offline ? 'device ' + x.device_state : x.sensor_reason);
    if (cap.flow_rate !== false)
      add('Flow sensor', x.flow_rate != null ? `${x.flow_rate.toFixed(1)} L/s` : '—', offline ? 'muted' : (x.flow_rate != null ? 'ok' : 'muted'));
    if (cap.silt)
      add('Silt probe', x.silt_depth_mm != null ? `${x.silt_depth_mm} mm` : '—', offline ? 'muted' : (x.silt_depth_mm != null ? 'ok' : 'muted'));
    if (x.enzyme_level_percent != null || cap.enzyme)
      add('Enzyme dosing', x.enzyme_level_percent != null ? `${Math.round(x.enzyme_level_percent)}%` : (x.cartridge_status || '—'), x.enzyme_level_percent != null && x.enzyme_level_percent < 20 ? 'warn' : 'ok');
    if (x.water_quality_ph != null || x.turbidity_ntu != null)
      add('Water quality', [x.water_quality_ph != null ? `pH ${x.water_quality_ph}` : null, x.turbidity_ntu != null ? `${x.turbidity_ntu} NTU` : null].filter(Boolean).join(' · ') || '—', offline ? 'muted' : 'ok');
    add('Battery / power', x.battery_percent != null ? `${x.battery_percent}%` : '—', _battTone(x.battery_percent), x.battery_voltage != null ? `${x.battery_voltage.toFixed(2)} V` : null);
    add('Modem / uplink', offline ? 'offline' : (x.signal_strength != null ? `${x.signal_strength}%` : '—'), offline ? 'err' : _sigTone(x.signal_strength), x.link_type || null);
    if (x.temperature != null)
      add('Temperature', `${Math.round(x.temperature)}°C`, x.temperature >= 40 ? 'err' : 'ok');
    add('GPS / location', (x.latitude != null && x.longitude != null) ? `${(+x.latitude).toFixed(4)}, ${(+x.longitude).toFixed(4)}` : '—', (x.latitude != null && x.longitude != null) ? 'ok' : 'muted');

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
          <span style="font-size:var(--fs-2xs);font-weight:700;color:${_TONE[rootTone]};text-transform:uppercase">${esc((x.device_state || 'unknown'))}</span>
        </div>
        <div style="margin-left:4px">${rows}</div>
      </div>`;
  }

  // ── Unified event timeline (maintenance + commands + lifecycle) ──────────
  async function timeline(sensorId) {
    const x = _all.find(s => s.sensor_id === sensorId) || {};
    let resp;
    try { resp = await OpsModal.apiGet(`/monitoring/sensors/${sensorId}/timeline`); }
    catch (err) { OpsModal.toast(err.message || 'Failed to load timeline', 'error'); return; }
    const feed = (resp && resp.data) || [];
    const SRC = { maintenance: ['var(--blue-hi)', 'Maintenance'], command: ['var(--ink-3)', 'Command'], lifecycle: ['var(--ink-3)', 'Lifecycle'] };
    const body = feed.length ? `<div style="display:flex;flex-direction:column">${feed.map(e => {
      const col = _TONE[e.tone] || SRC[e.source]?.[0] || 'var(--ink-3)';
      const when = e.ts ? new Date(e.ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      return `<div style="display:flex;gap:11px;padding:10px 0;border-bottom:1px solid var(--line)">
        <span style="width:9px;height:9px;border-radius:50%;background:${col};flex:0 0 auto;margin-top:5px"></span>
        <div style="flex:1 1 auto;min-width:0">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline">
            <span style="font-weight:700;font-size:var(--fs-sm);color:var(--ink);text-transform:capitalize">${esc(e.title || e.kind || 'event')}</span>
            <span style="font-size:var(--fs-2xs);color:var(--ink-4);white-space:nowrap">${when}</span>
          </div>
          ${e.detail ? `<div style="font-size:var(--fs-xs);color:var(--ink-3);margin-top:2px">${esc(e.detail)}</div>` : ''}
          <div style="font-size:var(--fs-2xs);color:var(--ink-4);margin-top:2px">${esc(SRC[e.source]?.[1] || e.source)}${e.actor ? ' · ' + esc(e.actor) : ''}</div>
        </div>
      </div>`;
    }).join('')}</div>` : `<p style="color:var(--ink-4);font-size:var(--fs-sm);margin:8px 0">No events recorded for this device yet.</p>`;
    OpsModal.open(`Event timeline — ${esc(x.name || sensorId)}`, body, [{ label: 'Close', class: 'btn-primary', onclick: 'OpsModal.close()' }]);
  }

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
    disposeViewer();
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

    const sid = __sid(x.sensor_id);
    const tierClass = tier === 'healthy' ? 'ok' : tier === 'degraded' ? 'warn' : 'err';
    const online = (x.status || 'active') === 'active';
    const connLabel = online ? 'CONNECTED' : String(x.status || 'offline').toUpperCase();
    const card = (k, v) => `<div class="sn-card"><div class="sn-card-k">${k}</div><div class="sn-card-v">${v}</div></div>`;
    const dash = '<span style="color:var(--ink-4)">—</span>';

    const readings = [
      cap.water_level !== false ? card('Water Level', x.level != null ? `<span style="color:${levelColor(x.level)}">${Math.round(x.level)}%</span>` : dash) : '',
      cap.flow_rate !== false ? card('Flow Rate', x.flow_rate != null ? `${x.flow_rate.toFixed(1)} L/s` : dash) : '',
      cap.silt ? card('Silt Depth', x.silt_depth_mm != null ? `${x.silt_depth_mm} mm` : dash) : '',
    ].filter(Boolean).join('');

    const device = [
      card('Battery', x.battery_percent != null ? `<span style="color:${OpsModal.vitalColor(x.battery_percent)}">${x.battery_percent}%</span>` : dash),
      card('Signal', x.signal_strength != null ? `<span style="color:${OpsModal.vitalColor(x.signal_strength)}">${x.signal_strength}%</span>` : dash),
      card('Temperature', x.temperature != null ? `<span style="color:${x.temperature >= 40 ? 'var(--err)' : 'var(--ink)'}">${Math.round(x.temperature)}°C</span>` : dash),
      `<div class="sn-card"><div class="sn-card-k">Firmware</div><div class="sn-card-v" style="font-size:var(--fs-sm)">${x.firmware_version ? esc(x.firmware_version) : dash}</div>${outdated ? '<span class="sn-card-badge">Update</span>' : ''}</div>`,
      (() => { const st = { in_sync:['var(--ok)','in sync'], drift:['var(--warn)','drift'], pending:['var(--ink-3)','pending'] }[x.config_state];
        const v = x.profile_name ? `${esc(x.profile_name)}${st ? ` <span style="color:${st[0]};font-weight:700;font-size:var(--fs-2xs)">· ${st[1]}</span>` : ''}` : dash;
        return `<div class="sn-card"><div class="sn-card-k">Config profile</div><div class="sn-card-v" style="font-size:var(--fs-sm)">${v}</div></div>`; })(),
      (() => { const L = { active:['var(--ok)','Active'], installed:['var(--blue-hi)','Installed'], assigned:['var(--blue-hi)','Assigned'], warehouse:['var(--ink-4)','Warehouse'], inventory:['var(--ink-4)','Inventory'], maintenance:['var(--warn)','Maintenance'], rma:['var(--err)','RMA'], retired:['var(--ink-4)','Retired'] }[x.lifecycle_state] || ['var(--ink-4)', x.lifecycle_state || '—'];
        return `<div class="sn-card"><div class="sn-card-k">Lifecycle</div><div class="sn-card-v" style="font-size:var(--fs-sm);color:${L[0]};font-weight:700">${L[1]}</div></div>`; })(),
      card('Serial', x.serial_number ? esc(x.serial_number) : dash),
      card('Warranty', x.warranty_expires_at ? new Date(x.warranty_expires_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : dash),
    ].join('');

    overlay.innerHTML = `
      <div class="sn-drawer" onclick="event.stopPropagation()">
        <div class="sn-drawer-head">
          <div style="min-width:0">
            <div class="sn-crumb">Devices <span>›</span> ${esc(propertyOf(x))}</div>
            <div class="sn-drawer-title">${esc(x.name || x.sensor_id)}</div>
            <div class="sn-status-line">
              <span class="sn-tok id">${esc(x.sensor_id)}</span>
              <span class="sep">·</span>
              <span class="sn-tok ${tierClass}"><span class="tdot"></span>${tier.toUpperCase()}</span>
              <span class="sep">·</span>
              <span class="sn-tok ${online ? 'ok' : 'err'}">${connLabel}</span>
            </div>
            ${(x.tags && x.tags.length) ? `<div style="margin-top:7px;display:flex;flex-wrap:wrap;gap:5px">${x.tags.map(t => `<span style="font-size:var(--fs-2xs);font-weight:600;color:var(--blue-hi);background:var(--neon-trace);border:1px solid var(--blue-dim);padding:2px 8px;border-radius:20px">#${esc(t)}</span>`).join('')}</div>` : ''}
          </div>
          <div class="sn-head-actions">
            <button class="sn-icon-btn" title="Send command" onclick="OpsSensors.queueCommand('${sid}')" aria-label="Commands">
              <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
            </button>
            <button class="sn-drawer-close" onclick="OpsSensors.closeDrawer()" aria-label="Close">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        <div class="sn-drawer-body">
          <div class="sn-3d" id="sn-3d">
            <div class="sn-3d-state" id="sn-3d-state"><span class="sn-3d-spin"></span>Loading 3D model…</div>
            <div class="sn-3d-hint">Drag to rotate · scroll to zoom</div>
          </div>

          <div class="sn-actionbar">
            <button class="sn-ab-icon" title="Restart node" onclick="OpsSensors.sendCommand('${sid}', 'reset')" aria-label="Restart node">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            </button>
            <button class="sn-ab-main" onclick="OpsSensors.openFull('${sid}')">Open full details
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/></svg>
            </button>
            <button class="sn-ab-icon" title="Command history" onclick="OpsSensors.commandHistory('${sid}')" aria-label="Command history">
              <svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </button>
          </div>

          <div class="sn-tabs">
            <button class="sn-tab active" data-tab="telemetry" onclick="OpsSensors.drawerTab('telemetry')">Telemetry</button>
            <button class="sn-tab" data-tab="actions" onclick="OpsSensors.drawerTab('actions')">Actions</button>
          </div>

          <div class="sn-tabpanel" data-panel="telemetry">
            <div class="sn-sec-h">State</div>
            <div class="sn-cards">${stateCards(x)}</div>
            ${readings ? `<div class="sn-sec-h">Readings</div><div class="sn-cards">${readings}</div>` : ''}
            <div class="sn-sec-h">Device</div>
            <div class="sn-cards">${device}</div>
            <div class="sn-sec-h">Components</div>
            ${topologyTree(x)}
          </div>

          <div class="sn-tabpanel" data-panel="actions" style="display:none">
            <button class="sn-act-row" onclick="OpsSensors.sendCommand('${sid}', 'firmware_update')">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 19V5m0 0l-6 6m6-6l6 6"/></svg>
              Push Firmware OTA
            </button>
            <button class="sn-act-row" onclick="OpsSensors.sendCommand('${sid}', 'reset')">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              Restart Node
            </button>
            <button class="sn-act-row" onclick="OpsSensors.calibrate('${sid}')">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
              Run Calibration
            </button>
            <button class="sn-act-row" onclick="OpsSensors.sendCommand('${sid}', 'force_sync')">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              Force Sync / Diagnostics…
            </button>
            <button class="sn-act-row" onclick="OpsSensors.sendCommand('${sid}', 'locate')">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><circle cx="12" cy="11" r="2"/></svg>
              Locate / Identify
            </button>
            <button class="sn-act-row" onclick="OpsSensors.commandHistory('${sid}')">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              Command History
            </button>
            <button class="sn-act-row" onclick="OpsSensors.timeline('${sid}')">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3M3 12h3m12 0h3M12 3v3m0 12v3"/></svg>
              Event Timeline
            </button>
            <button class="sn-act-row" onclick="OpsSensors.history('${sid}')">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2"/></svg>
              View Diagnostics Log
            </button>
            <button class="sn-act-row" onclick="OpsSensors.coverage('${sid}')">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              Manage Coverage
            </button>
            <button class="sn-act-row" onclick="OpsSensors.editTags('${sid}')">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M3 5v6.586a1 1 0 00.293.707l8.414 8.414a1 1 0 001.414 0l5.586-5.586a1 1 0 000-1.414L10.707 5.293A1 1 0 0010 5H4a1 1 0 00-1 1z"/></svg>
              Manage Tags
            </button>
            <button class="sn-act-row" onclick="OpsSensors.deviceRecord('${sid}')">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path stroke-linecap="round" stroke-linejoin="round" d="M8 7h8M8 11h8M8 15h5"/></svg>
              Lifecycle &amp; Hardware
            </button>
            <button class="sn-act-row" onclick="OpsSensors.replaceDevice('${sid}')">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v6h6M20 20v-6h-6"/><path stroke-linecap="round" stroke-linejoin="round" d="M20 8a8 8 0 00-14.9-2M4 16a8 8 0 0014.9 2"/></svg>
              Replace Device (RMA)
            </button>
            <button class="sn-act-row danger" onclick="OpsSensors.decommission('${sid}')">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9.5 4L10 3h4l.5 1M4 7h16"/></svg>
              Decommission Node
            </button>
          </div>
        </div>
      </div>`;

    requestAnimationFrame(() => overlay.classList.add('open'));
    mountModelViewer();
  }

  // Switch the drawer's Telemetry / Actions tabs (DOM-only, no re-render).
  function drawerTab(name) {
    const root = document.getElementById('sn-drawer-overlay');
    if (!root) return;
    root.querySelectorAll('.sn-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    root.querySelectorAll('.sn-tabpanel').forEach(p => { p.style.display = (p.dataset.panel === name) ? '' : 'none'; });
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
    const node = _all.find(x => x.sensor_id === sensorId);
    const type = presetType && CMD_DISRUPTIVE.concat(CMD_CATALOG.flatMap(g => g.items.map(i => i[0]))).includes(presetType) ? presetType : 'force_sync';
    const optionsHtml = CMD_CATALOG.map(g =>
      `<optgroup label="${esc(g.group)}">${g.items.map(([v, l]) => `<option value="${v}" ${v === type ? 'selected' : ''}>${esc(l)}</option>`).join('')}</optgroup>`).join('');
    OpsModal.open(`Send command — ${esc(node ? (node.name || sensorId) : sensorId)}`, `
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
    OpsModal.open(`Commands — ${esc(node ? (node.name || sensorId) : sensorId)}`,
      '<div style="padding:20px;color:var(--ink-3);font-size:var(--fs-base)">Loading…</div>',
      [{ label: 'Close', onclick: 'OpsModal.close()' }]);
    try {
      const r = await OpsModal.apiGet(`/monitoring/sensors/${sensorId}/commands`);
      const cmds = r.data || [];
      const body = document.querySelector('.ops-modal-body');
      if (!body) return;
      const statusColor = { queued: 'var(--warn)', delivered: 'var(--blue-hi)', acknowledged: 'var(--ok)', failed: 'var(--err)', cancelled: 'var(--ink-3)', expired: 'var(--ink-3)' };
      body.innerHTML = cmds.length
        ? `<div>${cmds.map(c => `
            <div style="display:flex;gap:10px;align-items:center;padding:10px 2px;border-bottom:1px solid var(--border)">
              <span style="font-size:var(--fs-2xs);font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:${statusColor[c.status] || 'var(--ink-3)'};min-width:96px">${esc(c.status)}${c.hold_reason && c.status === 'queued' ? ' · held' : ''}</span>
              <span style="flex:1;min-width:0;font-size:var(--fs-sm);color:var(--ink-2)">${esc((c.command_type || '').replace(/_/g, ' '))}${c.payload && c.payload.firmware_version ? ` → v${esc(c.payload.firmware_version)}` : ''}${c.note ? ' — ' + esc(c.note) : ''}${c.hold_reason && c.status === 'queued' ? `<span style="display:block;font-size:var(--fs-2xs);color:var(--warn);margin-top:2px">⏸ ${esc(c.hold_reason)}</span>` : ''}${c.expires_at && c.status === 'queued' ? `<span style="display:block;font-size:var(--fs-2xs);color:var(--ink-3);margin-top:2px">expires ${OpsModal.fmtDate(c.expires_at)}</span>` : ''}</span>
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
    render, setFilter, setTag, setQuery,
    editTags, saveTags, bulkTag, confirmBulkTag,
    deviceRecord, saveDeviceRecord, lifecycleLog, replaceDevice, doReplace, timeline,
    protectionWindows, createWindow, cancelWindow,
    profilesManager, pfHome, pfCreate, pfOpen, pfSave, pfAssign,
    firmwareManager, fwHome, fwCreateRelease, fwCreateRollout, fwOpenRollout, fwAdvance, fwState, fwRollback,
    viewSensor, closeDrawer, decommission, openFull, back, queueCommand, drawerTab,
    getSensor: (id) => _all.find(s => s.sensor_id === id),
    loadAll: async () => { try { const r = await OpsModal.apiGet('/monitoring/sensors/all'); _all = r.data || []; } catch (_) {} return _all; },
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
