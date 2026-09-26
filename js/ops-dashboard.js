// ════════════════════════════════════════════════════════════════════════
//  FlowGuard Ops — Overview (Neon Center)
//  Entry point: OpsDashboard.render(container)   (called by index.html)
//
//  Live estate risk + response console. Pulls real device trust data from
//  /monitoring/sensors/all (gateway connectivity + valid/stale/invalid stream
//  quality — the three-state trust model) and estate risk / response signals
//  from analytics + teams + tickets, falling back to representative demo data
//  (shown under the "Demo mode · Simulated data" chip) when a feed is empty.
// ════════════════════════════════════════════════════════════════════════
const OpsDashboard = (function () {
  let _root = null, _timer = null;

  // ── palette shortcuts (portal tokens) ───────────────────────────────────
  const SEV = { critical: 'var(--err)', high: 'var(--caut)', moderate: 'var(--warn)', low: 'var(--off)', unknown: 'var(--ink-4)' };
  const SEV_LABEL = { critical: 'Critical', high: 'High', moderate: 'Moderate', low: 'Low', unknown: 'Unknown' };
  const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const CSS = `
  .ovx { --ov-blue:#2f6bfe; --ov-blue-h:#2456d6; padding:22px 26px 40px; max-width:1560px; margin:0 auto; font-family:var(--ff-b); color:var(--ink); }
  .ovx *{ box-sizing:border-box; }
  .ov-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:18px; }
  .ov-title { font-size:30px; font-weight:800; letter-spacing:-.02em; color:var(--ink); line-height:1.05; }
  .ov-sub { margin-top:5px; font-size:13.5px; color:var(--ink-3); }
  .ov-demo { display:inline-flex; align-items:center; gap:7px; font-size:12px; font-weight:600; color:var(--ink-2); background:var(--surface); border:1px solid var(--border); border-radius:9px; padding:7px 12px; white-space:nowrap; }
  .ov-demo .d { width:6px; height:6px; border-radius:50%; background:var(--warn); }

  .ov-grid { display:grid; grid-template-columns:minmax(0,1fr) 344px; gap:16px; align-items:start; }
  .ov-main { display:flex; flex-direction:column; gap:16px; min-width:0; }
  .ov-kpis { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }

  .ovc { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:18px 18px 16px; box-shadow:var(--sh-sm); }
  .ovc-h { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:12px; }
  .ovc-k { font-size:11px; font-weight:700; letter-spacing:.09em; text-transform:uppercase; color:var(--ink-3); }
  .ovc-k .live { color:var(--ink-4); }
  .ovc-flag { display:inline-flex; align-items:center; gap:6px; font-size:11.5px; font-weight:600; white-space:nowrap; }
  .ovc-flag .d { width:7px; height:7px; border-radius:50%; }
  .ov-big { display:flex; align-items:baseline; gap:9px; }
  .ov-big .n { font-size:38px; font-weight:800; letter-spacing:-.02em; line-height:1; }
  .ov-big .u { font-size:13px; color:var(--ink-3); font-weight:500; }
  .ov-lines { margin-top:14px; display:flex; flex-direction:column; gap:0; }
  .ov-line { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:6px 0; font-size:13px; }
  .ov-line .l { color:var(--ink-2); display:flex; align-items:center; gap:8px; min-width:0; }
  .ov-line .l .d { width:8px; height:8px; border-radius:50%; flex:0 0 auto; }
  .ov-line .v { color:var(--ink); font-weight:700; font-variant-numeric:tabular-nums; }
  .ov-line .v.muted { color:var(--ink-3); font-weight:600; }
  .ov-sep { height:1px; background:var(--border); margin:8px 0 2px; }
  .ov-note { font-size:11.5px; color:var(--ink-4); margin-top:8px; }
  .ov-links { margin-top:12px; display:flex; flex-direction:column; gap:7px; }
  .ov-link { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; font-weight:600; color:var(--blue-hi); cursor:pointer; background:none; border:none; padding:0; font-family:inherit; text-align:left; }
  .ov-link:hover { text-decoration:underline; }
  .ov-link svg { width:13px; height:13px; }

  /* estate risk table */
  .ov-table-h { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:2px; }
  .ov-th-title { font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-2); }
  .ov-th-sub { font-size:12px; color:var(--ink-4); margin-top:3px; }
  .ov-pills { display:flex; gap:4px; background:var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:3px; }
  .ov-pill { display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:var(--ink-3); padding:5px 11px; border-radius:8px; cursor:pointer; border:none; background:none; font-family:inherit; }
  .ov-pill.active { background:var(--surface-h); color:var(--ink); }
  .ov-pill .c { color:var(--ink-4); font-weight:700; }
  .ov-pill.active .c { color:var(--ink-2); }
  table.ov-tbl { width:100%; border-collapse:collapse; margin-top:14px; }
  .ov-tbl thead th { text-align:left; font-size:10.5px; font-weight:700; letter-spacing:.07em; text-transform:uppercase; color:var(--ink-4); padding:0 10px 10px; border-bottom:1px solid var(--border); }
  .ov-tbl thead th.r { text-align:right; }
  .ov-tbl tbody td { padding:12px 10px; border-bottom:1px solid var(--border); font-size:13.5px; vertical-align:middle; }
  .ov-tbl tbody tr:last-child td { border-bottom:none; }
  .ov-tbl tbody tr { cursor:pointer; }
  .ov-tbl tbody tr:hover td { background:var(--surface-h); }
  .ov-tbl tbody tr.urgent td:first-child { box-shadow:inset 2px 0 0 var(--err); }
  .ov-est { font-weight:700; color:var(--ink); }
  .ov-est .z { display:block; font-size:11.5px; font-weight:500; color:var(--ink-4); margin-top:2px; }
  .ov-score { display:flex; align-items:center; gap:10px; }
  .ov-score .n { font-size:17px; font-weight:800; font-variant-numeric:tabular-nums; width:26px; }
  .ov-bar { width:74px; height:6px; border-radius:4px; background:var(--surface-3); overflow:hidden; }
  .ov-bar > span { display:block; height:100%; border-radius:4px; }
  .ov-risk { display:inline-flex; align-items:center; gap:7px; font-weight:600; }
  .ov-risk .d { width:8px; height:8px; border-radius:50%; }
  .ov-chg { font-variant-numeric:tabular-nums; font-weight:700; }
  .ov-resp { color:var(--ink-2); }
  .ov-resp.unassigned { color:var(--err); font-weight:600; }
  .ov-tbl-foot { display:flex; align-items:center; justify-content:space-between; margin-top:12px; font-size:12px; color:var(--ink-4); }

  /* banner */
  .ov-banner { display:flex; align-items:center; gap:12px; background:var(--amber-bg); border:1px solid rgba(251,191,36,.28); border-radius:12px; padding:13px 16px; }
  .ov-banner .ic { color:var(--warn); flex:0 0 auto; display:flex; }
  .ov-banner .tx { font-size:13px; color:var(--ink-2); flex:1 1 auto; min-width:0; }
  .ov-banner .tx b { color:var(--ink); font-weight:700; }
  .ov-banner .tx .code { font-family:var(--ff-m); font-size:12px; color:var(--ink-3); }

  /* bottom two */
  .ov-bottom { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  .ov-mini-h { font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-3); margin-bottom:12px; }
  .ov-mini-row { display:flex; align-items:center; justify-content:space-between; padding:5px 0; font-size:13px; }
  .ov-mini-row .l { color:var(--ink-2); }
  .ov-mini-row .v { color:var(--ink); font-weight:700; font-variant-numeric:tabular-nums; }
  .ov-mini-body { display:flex; gap:16px; align-items:flex-end; }
  .ov-mini-body .col { flex:1 1 auto; }
  .ov-spark { width:150px; height:64px; flex:0 0 auto; }

  /* response desk rail */
  .ov-rail { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:18px; box-shadow:var(--sh-sm); position:sticky; top:14px; }
  .ov-inc { padding:12px 0; border-bottom:1px solid var(--border); }
  .ov-inc:first-of-type { padding-top:4px; }
  .ov-inc-top { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
  .ov-inc-name { display:flex; align-items:center; gap:8px; font-weight:700; font-size:14px; color:var(--ink); }
  .ov-inc-name .d { width:8px; height:8px; border-radius:50%; background:var(--err); flex:0 0 auto; }
  .ov-inc-meta { font-size:12.5px; color:var(--ink-3); margin-top:3px; }
  .ov-inc-meta .ago { color:var(--ink-4); }
  .ov-ack-btn { font-size:12px; font-weight:600; color:var(--blue-hi); background:transparent; border:1px solid var(--border-2); border-radius:8px; padding:5px 11px; cursor:pointer; font-family:inherit; white-space:nowrap; }
  .ov-ack-btn:hover { border-color:var(--blue-dim); background:var(--neon-trace); }
  .ov-inc-state { display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600; margin-top:8px; }
  .ov-inc-state.unassigned { color:var(--ink-3); }
  .ov-inc-state.acked { color:var(--ok); }
  .ov-inc-state svg { width:14px; height:14px; }
  .ov-fo-h { font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-3); margin:16px 0 8px; }
  .ov-fo-row { display:flex; align-items:center; justify-content:space-between; padding:7px 0; font-size:13px; border-bottom:1px solid var(--border); }
  .ov-fo-row:last-child { border-bottom:none; }
  .ov-fo-row .l { color:var(--ink-2); display:flex; align-items:center; gap:8px; }
  .ov-fo-row .v { color:var(--ink); font-weight:700; font-variant-numeric:tabular-nums; }
  .ov-fo-row .v .warn { color:var(--warn); }
  .ov-next-h { font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-3); margin:16px 0 8px; }
  .ov-next { font-size:15px; font-weight:700; color:var(--ink); margin-bottom:12px; line-height:1.35; }
  .ov-cta { display:block; width:100%; text-align:center; background:var(--ov-blue); color:#fff; font-size:14px; font-weight:700; border:none; border-radius:10px; padding:12px; cursor:pointer; font-family:inherit; }
  .ov-cta:hover { background:var(--ov-blue-h); }
  .ov-queue { display:block; width:100%; text-align:left; margin-top:12px; font-size:13px; font-weight:600; color:var(--blue-hi); background:none; border:none; cursor:pointer; font-family:inherit; }
  .ov-queue:hover { text-decoration:underline; }

  @media (max-width:1180px){ .ov-grid{ grid-template-columns:1fr; } .ov-rail{ position:static; } }
  @media (max-width:820px){ .ov-kpis{ grid-template-columns:1fr; } .ov-bottom{ grid-template-columns:1fr; } }
  `;

  // ── demo (fallback) view model, matching the reference design ────────────
  function demoVM() {
    return {
      demo: true,
      portfolio: { estates: 24, monitoring: true, assessed: 23, unknown: 1, online: 118, offline: 2, total: 120 },
      risk: { critical: 2, high: 3, moderate: 7, low: 11, unknown: 1, highRisk: 5 },
      confidence: { pct: 94, valid: 113, stale: 4, invalid: 3, total: 120, needReview: 7 },
      estates: [
        { name: 'Azure Estate', zone: 'Lekki', score: 92, risk: 'critical', change: 14, driver: 'Drain capacity 91%', response: 'Team en route' },
        { name: 'Palm Court', zone: 'Ajah', score: 86, risk: 'critical', change: 9, driver: 'Outfall restriction', response: 'Unassigned' },
        { name: 'Harbour View', zone: 'Ikoyi', score: 78, risk: 'high', change: 6, driver: 'Rapid water rise', response: 'Assigned' },
        { name: 'Orchid Gardens', zone: 'Lekki', score: 74, risk: 'high', change: 4, driver: 'Silt build-up', response: 'Inspection due' },
        { name: 'Creekside Estate', zone: 'VI', score: 71, risk: 'high', change: 3, driver: 'High downstream level', response: 'Monitoring' },
        { name: 'Victoria Court', zone: 'Ikoyi', score: 48, risk: 'moderate', change: -5, driver: 'Elevated inflow', response: 'Monitoring' },
      ],
      response: {
        open: 7, unacknowledged: 2,
        priority: [
          { estate: 'Palm Court', issue: 'Outfall restriction', ago: '4 min ago', state: 'Unassigned', acked: false },
          { estate: 'Azure Estate', issue: 'Water threshold exceeded', ago: '12 min ago', team: 'Team Delta · ETA 8 min', acked: true },
        ],
        workOrders: 6, teamsDeployed: '3 / 4', slaBreaches: 1, nextAction: 'Dispatch a team to Palm Court',
      },
      lagoon: { name: 'Lagoon Park', device: 'SNT-024', lastValid: '28m ago' },
      drainage: { peak: 91, restricted: 2, rising: 8, series: [40, 44, 52, 49, 58, 63, 60, 71, 76, 74, 83, 91] },
      weather: { rainfall: 18, exposed: 8, updated: '10:30 WAT', series: [3, 4, 6, 5, 8, 10, 9, 12, 14, 11, 16, 18, 15, 9] },
    };
  }

  // ── overlay REAL device trust data onto the view model ───────────────────
  async function withLiveDevices(vm) {
    try {
      const r = await OpsModal.apiGet('/monitoring/sensors/all');
      const d = (r && r.data) || [];
      if (!d.length) return vm;
      const total = d.length;
      const offline = d.filter(x => x.device_state === 'offline' || x.device_state === 'maintenance').length;
      const online = total - offline;
      const valid = d.filter(x => x.sensor_state === 'ok').length;
      const stale = d.filter(x => x.sensor_state === 'stale' || x.sensor_state === 'frozen').length;
      const invalid = total - valid - stale;   // implausible + unknown
      vm.portfolio.online = online; vm.portfolio.offline = offline; vm.portfolio.total = total;
      vm.confidence = { pct: Math.round(valid / total * 100), valid, stale, invalid, total, needReview: stale + invalid };
      vm.demo = false;
      // surface a real "risk unavailable" node if one exists
      const dark = d.find(x => x.sensor_state === 'unknown' && (x.device_state === 'online' || x.device_state === 'degraded'));
      if (dark) vm.lagoon = { name: dark.property_name || dark.name || dark.sensor_id, device: dark.sensor_id, lastValid: dark.reading_time ? rel(dark.reading_time) : 'unknown' };
    } catch (_) { /* keep demo confidence */ }
    return vm;
  }

  function rel(ts) {
    if (!ts) return 'unknown';
    const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 90) return Math.round(s) + 's ago';
    if (s < 5400) return Math.round(s / 60) + 'm ago';
    if (s < 172800) return Math.round(s / 3600) + 'h ago';
    return Math.round(s / 86400) + 'd ago';
  }

  function nowWAT() {
    try { return new Date().toLocaleTimeString('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit' }) + ' WAT'; }
    catch (_) { return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ' WAT'; }
  }

  // ── tiny inline sparklines ───────────────────────────────────────────────
  function sparkLine(series, color) {
    const w = 150, h = 64, p = 4, max = Math.max(...series, 1), min = Math.min(...series, 0);
    const rng = (max - min) || 1;
    const pts = series.map((v, i) => {
      const x = p + i * (w - 2 * p) / (series.length - 1);
      const y = h - p - ((v - min) / rng) * (h - 2 * p);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<svg class="ov-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  function sparkBars(series, color) {
    const w = 150, h = 64, n = series.length, gap = 2, bw = (w - gap * (n - 1)) / n, max = Math.max(...series, 1);
    const bars = series.map((v, i) => {
      const bh = Math.max(2, (v / max) * (h - 4)); const x = i * (bw + gap); const y = h - bh;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1" fill="${color}"/>`;
    }).join('');
    return `<svg class="ov-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${bars}</svg>`;
  }

  // ── render ───────────────────────────────────────────────────────────────
  function template(vm) {
    const p = vm.portfolio, rk = vm.risk, cf = vm.confidence, rd = vm.response;
    const liveTag = vm.demo ? 'DEMO' : 'LIVE';

    const riskLine = (key) => `<div class="ov-line"><span class="l"><span class="d" style="background:${SEV[key]}"></span>${SEV_LABEL[key]}</span><span class="v">${rk[key]}</span></div>`;

    const rows = vm.estates.map(e => {
      const urgent = e.response === 'Unassigned' && (e.risk === 'critical' || e.risk === 'high');
      const chg = e.change > 0 ? `+${e.change}` : `${e.change}`;
      const chgColor = e.change < 0 ? 'var(--ok)' : 'var(--ink-2)';
      return `<tr class="${urgent ? 'urgent' : ''}" data-estate="${esc(e.name)}">
        <td><div class="ov-est">${esc(e.name)}<span class="z">${esc(e.zone)}</span></div></td>
        <td><div class="ov-score"><span class="n">${e.score}</span><span class="ov-bar"><span style="width:${e.score}%;background:${SEV[e.risk]}"></span></span></div></td>
        <td><span class="ov-risk" style="color:${SEV[e.risk]}"><span class="d" style="background:${SEV[e.risk]}"></span>${SEV_LABEL[e.risk]}</span></td>
        <td><span class="ov-chg" style="color:${chgColor}">${chg} pts</span></td>
        <td style="color:var(--ink-2)">${esc(e.driver)}</td>
        <td><span class="ov-resp ${e.response === 'Unassigned' ? 'unassigned' : ''}">${esc(e.response)}</span></td>
      </tr>`;
    }).join('');

    const priority = rd.priority.map(i => `
      <div class="ov-inc">
        <div class="ov-inc-top">
          <div>
            <div class="ov-inc-name"><span class="d"></span>${esc(i.estate)}</div>
            <div class="ov-inc-meta">${esc(i.issue)} · <span class="ago">${esc(i.ago)}</span></div>
          </div>
          ${i.acked ? '' : `<button class="ov-ack-btn" data-ack="${esc(i.estate)}">Acknowledge</button>`}
        </div>
        ${i.acked
          ? `<div class="ov-inc-state acked"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M20 6L9 17l-5-5"/></svg>Acknowledged${i.team ? ' · ' + esc(i.team) : ''}</div>`
          : `<div class="ov-inc-state unassigned">${esc(i.state || 'Unassigned')}</div>`}
      </div>`).join('');

    return `
    <div class="ov-head">
      <div>
        <div class="ov-title">Overview</div>
        <div class="ov-sub">Live estate risk and response · Updated ${esc(nowWAT())}</div>
      </div>
      <div class="ov-demo"><span class="d"></span>${vm.demo ? 'Demo mode · Simulated data' : 'Live data · Lagos'}</div>
    </div>

    <div class="ov-grid">
      <div class="ov-main">
        <div class="ov-kpis">
          <!-- Portfolio -->
          <div class="ovc">
            <div class="ovc-h"><span class="ovc-k">Portfolio · <span class="live">${liveTag}</span></span>
              <span class="ovc-flag" style="color:var(--ok)"><span class="d" style="background:var(--ok)"></span>Monitoring</span></div>
            <div class="ov-big"><span class="n">${p.estates}</span><span class="u">estates</span></div>
            <div class="ov-lines">
              <div class="ov-line"><span class="l">Assessed</span><span class="v">${p.assessed}</span></div>
              <div class="ov-line"><span class="l">Unknown</span><span class="v">${p.unknown}</span></div>
              <div class="ov-sep"></div>
              <div class="ov-line"><span class="l">Gateway online</span><span class="v">${p.online} / ${p.total}</span></div>
              <div class="ov-line"><span class="l">Offline</span><span class="v muted">${p.offline} / ${p.total}</span></div>
            </div>
            <div class="ov-note">Online = heartbeat within 5 min</div>
            <div class="ov-links"><button class="ov-link" data-go="estates">View estates <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/></svg></button></div>
          </div>

          <!-- Risk exposure -->
          <div class="ovc">
            <div class="ovc-h"><span class="ovc-k">Risk exposure · <span class="live">${liveTag}</span></span>
              ${rk.highRisk ? `<span class="ovc-flag" style="color:var(--err)"><span class="d" style="background:var(--err)"></span>Action required</span>` : ''}</div>
            <div class="ov-big"><span class="n">${rk.highRisk}</span><span class="u">high-risk estates</span></div>
            <div class="ov-lines">
              ${riskLine('critical')}${riskLine('high')}${riskLine('moderate')}${riskLine('low')}${riskLine('unknown')}
            </div>
          </div>

          <!-- Data confidence -->
          <div class="ovc">
            <div class="ovc-h"><span class="ovc-k">Data confidence · <span class="live">${liveTag}</span></span>
              ${cf.needReview ? `<span class="ovc-flag" style="color:var(--warn)"><span class="d" style="background:var(--warn)"></span>${cf.needReview} need review</span>` : ''}</div>
            <div class="ov-big"><span class="n">${cf.pct}%</span><span class="u">valid sensor streams</span></div>
            <div class="ov-lines">
              <div class="ov-line"><span class="l">Valid</span><span class="v">${cf.valid}</span></div>
              <div class="ov-line"><span class="l">Stale</span><span class="v">${cf.stale}</span></div>
              <div class="ov-line"><span class="l">Invalid</span><span class="v">${cf.invalid}</span></div>
              <div class="ov-sep"></div>
              <div class="ov-line"><span class="l">Total streams</span><span class="v">${cf.total}</span></div>
            </div>
            <div class="ov-note">Valid = fresh + passed quality checks</div>
            <div class="ov-links">
              <button class="ov-link" data-go="dataissues">Review ${cf.needReview} data issues <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/></svg></button>
              <button class="ov-link" data-go="integrity">View device integrity <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/></svg></button>
            </div>
          </div>
        </div>

        <!-- Estate risk table -->
        <div class="ovc">
          <div class="ov-table-h">
            <div><div class="ov-th-title">Estate risk · ${liveTag}</div><div class="ov-th-sub">Highest risk first · Change over past 1 hour</div></div>
            <div class="ov-pills">
              <button class="ov-pill active" data-filter="all">All <span class="c">${vm.estates.length}</span></button>
              <button class="ov-pill" data-filter="critical">Critical <span class="c">${rk.critical}</span></button>
              <button class="ov-pill" data-filter="high">High <span class="c">${rk.high}</span></button>
              <button class="ov-pill" data-filter="unknown">Unknown <span class="c">${rk.unknown}</span></button>
            </div>
          </div>
          <table class="ov-tbl">
            <thead><tr><th>Estate</th><th>Score</th><th>Risk</th><th>Change · 1h</th><th>Primary driver</th><th>Response</th></tr></thead>
            <tbody id="ov-tbody">${rows}</tbody>
          </table>
          <div class="ov-tbl-foot"><span>Score 0 – 100 · Higher means greater risk</span></div>
        </div>

        <!-- risk unavailable banner -->
        <div class="ov-banner">
          <span class="ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg></span>
          <span class="tx"><b>${esc(vm.lagoon.name)}</b> <span class="code">${esc(vm.lagoon.device)}</span> · Risk unavailable · Last valid reading ${esc(vm.lagoon.lastValid)}</span>
          <button class="ov-link" data-go="timeline" data-device="${esc(vm.lagoon.device)}">Device timeline <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/></svg></button>
        </div>

        <!-- drainage + weather -->
        <div class="ov-bottom">
          <div class="ovc">
            <div class="ov-mini-h">Drainage · Past 24h</div>
            <div class="ov-mini-body">
              <div class="col">
                <div class="ov-mini-row"><span class="l">Peak utilisation</span><span class="v">${vm.drainage.peak}%</span></div>
                <div class="ov-mini-row"><span class="l">Restricted outfalls</span><span class="v">${vm.drainage.restricted}</span></div>
                <div class="ov-mini-row"><span class="l">Rising-level locations</span><span class="v">${vm.drainage.rising}</span></div>
              </div>
              ${sparkLine(vm.drainage.series, 'var(--ink-2)')}
            </div>
          </div>
          <div class="ovc">
            <div class="ov-mini-h">Weather · Next 6h</div>
            <div class="ov-mini-body">
              <div class="col">
                <div class="ov-mini-row"><span class="l">Forecast rainfall</span><span class="v">${vm.weather.rainfall} mm</span></div>
                <div class="ov-mini-row"><span class="l">Estates exposed</span><span class="v">${vm.weather.exposed}</span></div>
                <div class="ov-mini-row"><span class="l" style="color:var(--ink-4)">Updated ${esc(vm.weather.updated)}</span><span class="v"></span></div>
              </div>
              ${sparkBars(vm.weather.series, 'var(--blue-dim)')}
            </div>
          </div>
        </div>
      </div>

      <!-- Response desk rail -->
      <div class="ov-rail">
        <div class="ovc-h" style="margin-bottom:10px"><span class="ovc-k">Response desk · <span class="live">${liveTag}</span></span>
          ${rd.unacknowledged ? `<span class="ovc-flag" style="color:var(--warn)"><span class="d" style="background:var(--warn)"></span>${rd.unacknowledged} unacknowledged</span>` : ''}</div>
        <div class="ov-big"><span class="n">${rd.open}</span><span class="u">open incidents</span></div>

        <div class="ov-fo-h" style="margin-top:14px">Priority incidents</div>
        ${priority}

        <div class="ov-fo-h">Field operations · ${liveTag}</div>
        <div class="ov-fo-row"><span class="l">Open work orders</span><span class="v">${rd.workOrders}</span></div>
        <div class="ov-fo-row"><span class="l">Teams deployed</span><span class="v">${esc(rd.teamsDeployed)}</span></div>
        <div class="ov-fo-row"><span class="l">SLA breaches · today</span><span class="v">${rd.slaBreaches ? `<span class="warn">● ${rd.slaBreaches}</span>` : '0'}</span></div>

        <div class="ov-next-h">Next action</div>
        <div class="ov-next">${esc(rd.nextAction)}</div>
        <button class="ov-cta" data-go="incident">Dispatch team</button>
        <button class="ov-queue" data-go="queue">View response queue →</button>
      </div>
    </div>`;
  }

  // ── deep-link wiring into the rest of the portal ─────────────────────────
  function go(name, el) {
    const tab = (t) => { if (typeof window.switchTab === 'function') window.switchTab(t); };
    switch (name) {
      case 'dataissues':
        tab('sensors'); setTimeout(() => { try { OpsSensors.setFilter('dataissue'); } catch (_) {} }, 450); break;
      case 'integrity':
      case 'timeline':
        tab('sensors'); break;
      case 'estates':
        tab('properties'); break;
      case 'incident':
      case 'queue':
        tab('alerts'); break;
      default: break;
    }
  }

  function wire(root) {
    root.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go, b)));
    root.querySelectorAll('.ov-tbl tbody tr').forEach(tr => tr.addEventListener('click', () => { try { if (typeof window.switchTab === 'function') window.switchTab('properties'); } catch (_) {} }));
    root.querySelectorAll('.ov-pill').forEach(p => p.addEventListener('click', () => {
      root.querySelectorAll('.ov-pill').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      const f = p.dataset.filter;
      root.querySelectorAll('#ov-tbody tr').forEach(tr => {
        const est = _lastVM.estates.find(e => e.name === tr.dataset.estate);
        tr.style.display = (f === 'all' || (est && est.risk === f)) ? '' : 'none';
      });
    }));
    root.querySelectorAll('.ov-ack-btn').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const inc = b.closest('.ov-inc');
      b.remove();
      const st = inc.querySelector('.ov-inc-state');
      if (st) { st.className = 'ov-inc-state acked'; st.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M20 6L9 17l-5-5"/></svg>Acknowledged'; }
      if (typeof OpsModal !== 'undefined' && OpsModal.toast) OpsModal.toast('Incident acknowledged.', 'success');
    }));
  }

  let _lastVM = null;
  async function load() {
    if (!_root) return;
    const host = _root.querySelector('.ovx');
    if (!host) return;
    let vm = demoVM();
    vm = await withLiveDevices(vm);
    _lastVM = vm;
    host.innerHTML = template(vm);
    wire(host);
  }

  async function render(container) {
    _root = container;
    if (!document.getElementById('ovx-style')) {
      const st = document.createElement('style'); st.id = 'ovx-style'; st.textContent = CSS; document.head.appendChild(st);
    }
    container.innerHTML = '<div class="ovx"><div style="padding:60px;text-align:center;color:var(--ink-3)">Loading overview…</div></div>';
    await load();
    if (_timer) clearInterval(_timer);
    _timer = setInterval(load, 60000);
  }

  return { render };
})();
window.OpsDashboard = OpsDashboard;
