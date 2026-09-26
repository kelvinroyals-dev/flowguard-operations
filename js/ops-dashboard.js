// ════════════════════════════════════════════════════════════════════════
//  FlowGuard Ops — Operations Overview
//  Entry: OpsDashboard.render(container). Live view model from
//  /analytics/overview (portfolio, device trust, estate risk, response desk,
//  drainage, weather). Falls back to demo only if the feed is unreachable.
// ════════════════════════════════════════════════════════════════════════
const OpsDashboard = (function () {
  let _root = null, _timer = null, _lastVM = null;

  const SEV = { critical: 'var(--sev-crit)', high: 'var(--sev-high)', moderate: 'var(--sev-mod)', low: 'var(--sev-low)', unknown: 'var(--sev-unk)' };
  const SEV_LABEL = { critical: 'Critical', high: 'High', moderate: 'Moderate', low: 'Low', unknown: 'Unknown' };
  const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const CSS = `
  .ovx{ --bg:#111214; --card:#1c1d20; --line:#34363b; --line-2:#3d4046;
        --t1:#f0f1f2; --t2:#b5b8be; --t3:#8b909a; --t4:#6c727c;
        --link:#5379ff; --btn:#5379ff; --btn-h:#3f63e6;
        --sev-crit:#f0616d; --sev-high:#f0913e; --sev-mod:#f2c14e; --sev-low:#8b9099; --sev-unk:#8b9099;
        --ok:#35c98a;
        background:var(--bg); min-height:100%; padding:14px 20px 30px; font-family:var(--ff-b); color:var(--t1);
        font-variant-numeric:tabular-nums; }
  .ovx *{ box-sizing:border-box; }
  .ovx button{ font-family:inherit; }

  .ov-head{ display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin:2px 0 14px; }
  .ov-title{ font-size:22px; font-weight:700; letter-spacing:-.01em; color:var(--t1); line-height:1.1; }
  .ov-sub{ margin-top:3px; font-size:12.5px; color:var(--t3); }
  .ov-chip{ display:inline-flex; align-items:center; gap:7px; font-size:12px; font-weight:600; color:var(--t2); background:var(--card); border:1px solid var(--line); border-radius:7px; padding:6px 11px; white-space:nowrap; }
  .ov-chip .d{ width:6px; height:6px; border-radius:50%; }

  .ov-grid{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; align-items:start; }
  .ov-kpis{ grid-column:1 / 4; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
  .ov-rail-cell{ grid-column:4 / 5; grid-row:1 / span 2; min-width:0; }
  .ov-lower{ grid-column:1 / 4; grid-row:2; display:flex; flex-direction:column; gap:12px; min-width:0; }

  .ovc{ background:var(--card); border:1px solid var(--line); border-radius:9px; padding:13px; min-width:0; }
  .ovc-h{ display:flex; align-items:center; justify-content:space-between; gap:8px; min-height:16px; }
  .ovc-k{ font-size:10.5px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; color:var(--t2); white-space:nowrap; }
  .ovc-k .live{ color:var(--t4); }
  .ovc-flag{ display:inline-flex; align-items:center; gap:6px; font-size:11px; font-weight:600; white-space:nowrap; }
  .ovc-flag .d{ width:6px; height:6px; border-radius:50%; }
  .ov-big{ display:flex; align-items:baseline; gap:8px; margin-top:11px; }
  .ov-big .n{ font-size:30px; font-weight:700; letter-spacing:-.01em; line-height:1; color:var(--t1); }
  .ov-big .u{ font-size:12px; color:var(--t3); font-weight:500; white-space:nowrap; }
  .ov-lines{ margin-top:11px; }
  .ov-line{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:3.5px 0; font-size:12.5px; }
  .ov-line .l{ color:var(--t2); display:flex; align-items:center; gap:8px; min-width:0; }
  .ov-line .l .d{ width:7px; height:7px; border-radius:50%; flex:0 0 auto; }
  .ov-line .v{ color:var(--t1); font-weight:600; }
  .ov-div{ height:1px; background:var(--line); margin:8px 0; }
  .ov-subh{ font-size:12px; font-weight:600; text-transform:none; color:var(--t2); margin:2px 0 2px; }
  .ov-note{ font-size:11px; color:var(--t3); margin-top:7px; }
  .ov-links{ margin-top:10px; display:flex; flex-direction:column; gap:6px; }
  .ov-link{ display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:500; color:var(--link); cursor:pointer; background:none; border:none; padding:0; text-align:left; }
  .ov-link:hover{ text-decoration:underline; }
  .ov-link svg{ width:12px; height:12px; }

  /* estate table */
  .ov-table-h{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
  .ov-th-title{ font-size:11px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--t2); }
  .ov-th-sub{ font-size:11.5px; color:var(--t3); margin-top:3px; }
  .ov-seg{ display:flex; background:#1c1e23; border:1px solid var(--line-2); border-radius:7px; overflow:hidden; }
  .ov-seg button{ font-size:12px; font-weight:500; color:var(--t3); padding:5px 12px; cursor:pointer; border:none; background:none; border-right:1px solid var(--line-2); }
  .ov-seg button:last-child{ border-right:none; }
  .ov-seg button.active{ background:var(--line-2); color:var(--t1); }
  .ov-seg .c{ color:var(--t4); font-weight:600; margin-left:5px; }
  .ov-tbl-wrap{ margin-top:11px; max-height:320px; overflow-y:auto; }
  .ov-tbl-wrap::-webkit-scrollbar{ width:8px; } .ov-tbl-wrap::-webkit-scrollbar-thumb{ background:var(--line-2); border-radius:4px; }
  table.ov-tbl{ width:100%; border-collapse:collapse; table-layout:fixed; }
  .ov-tbl thead th{ text-align:left; font-size:10px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; color:var(--t4); padding:0 8px 8px; border-bottom:1px solid var(--line); position:sticky; top:0; background:var(--card); }
  .ov-tbl tbody td{ padding:7px 8px; border-bottom:1px solid var(--line); font-size:13px; vertical-align:middle; color:var(--t1); }
  .ov-tbl tbody tr:last-child td{ border-bottom:none; }
  .ov-tbl tbody tr{ cursor:pointer; }
  .ov-tbl tbody tr:hover td{ background:rgba(255,255,255,.02); }
  .ov-tbl th:nth-child(1),.ov-tbl td:nth-child(1){ width:20%; }
  .ov-tbl th:nth-child(2),.ov-tbl td:nth-child(2){ width:16%; white-space:nowrap; }
  .ov-tbl th:nth-child(3),.ov-tbl td:nth-child(3){ width:12%; white-space:nowrap; }
  .ov-tbl th:nth-child(4),.ov-tbl td:nth-child(4){ width:11%; white-space:nowrap; }
  .ov-tbl th:nth-child(5),.ov-tbl td:nth-child(5){ width:23%; }
  .ov-tbl th:nth-child(6),.ov-tbl td:nth-child(6){ width:18%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .ov-est{ font-weight:600; color:var(--t1); }
  .ov-est .z{ display:block; font-size:11px; font-weight:400; color:var(--t3); margin-top:1px; }
  .ov-score{ display:flex; align-items:center; gap:9px; }
  .ov-score .n{ font-size:15px; font-weight:700; width:24px; color:var(--t1); }
  .ov-bar{ width:52px; height:5px; border-radius:3px; background:var(--line-2); overflow:hidden; }
  .ov-bar > span{ display:block; height:100%; border-radius:3px; }
  .ov-risk{ display:inline-flex; align-items:center; gap:7px; font-weight:500; color:var(--t1); }
  .ov-risk .d{ width:7px; height:7px; border-radius:50%; }
  .ov-chg{ color:var(--t2); font-weight:500; }
  .ov-resp{ color:var(--t2); }
  .ov-foot{ margin-top:9px; font-size:11.5px; color:var(--t3); }

  /* banner */
  .ov-banner{ display:flex; align-items:center; gap:11px; background:rgba(242,193,78,.06); border:1px solid rgba(242,193,78,.24); border-radius:9px; padding:10px 14px; }
  .ov-banner.ok{ background:transparent; border:1px solid var(--line); }
  .ov-banner.ok .ic{ color:var(--ok); }
  .ov-banner .ic{ color:var(--sev-mod); flex:0 0 auto; display:flex; }
  .ov-banner .tx{ font-size:12.5px; color:var(--t2); flex:1 1 auto; min-width:0; }
  .ov-banner .tx b{ color:var(--t1); font-weight:600; }
  .ov-banner .tx .code{ font-family:var(--ff-m); font-size:11.5px; color:var(--t3); }

  .ov-bottom{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .ov-mini-body{ display:flex; gap:14px; align-items:flex-end; margin-top:10px; }
  .ov-mini-body .col{ flex:1 1 auto; }
  .ov-mrow{ display:flex; align-items:center; justify-content:space-between; padding:3.5px 0; font-size:12.5px; }
  .ov-mrow .l{ color:var(--t2); } .ov-mrow .v{ color:var(--t1); font-weight:600; }
  .ov-vdiv{ width:1px; align-self:stretch; background:var(--line); margin:2px 0; }
  .ov-spark{ width:130px; height:52px; flex:0 0 auto; }

  /* response rail */
  .ov-rail{ background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px; position:sticky; top:12px; }
  .ov-inc{ padding:11px 0; }
  .ov-inc + .ov-inc{ border-top:1px solid var(--line); }
  .ov-inc-top{ display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
  .ov-inc-name{ display:flex; align-items:center; gap:8px; font-weight:600; font-size:13.5px; color:var(--t1); }
  .ov-inc-name .d{ width:7px; height:7px; border-radius:50%; background:var(--sev-crit); flex:0 0 auto; }
  .ov-inc-meta{ font-size:12px; color:var(--t3); margin-top:4px; }
  .ov-ack{ font-size:12px; font-weight:600; color:var(--link); background:transparent; border:1px solid var(--link); border-radius:7px; padding:4px 10px; cursor:pointer; white-space:nowrap; }
  .ov-ack:hover{ background:rgba(91,141,239,.1); }
  .ov-inc-state{ display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:500; margin-top:7px; }
  .ov-inc-state.unassigned{ color:var(--t3); }
  .ov-inc-state.acked{ color:var(--ok); }
  .ov-inc-state .tick{ width:15px; height:15px; border-radius:50%; background:var(--ok); display:inline-flex; align-items:center; justify-content:center; flex:0 0 auto; }
  .ov-inc-state .tick svg{ width:9px; height:9px; color:#0b0c0e; }
  .ov-inc-team{ font-size:12px; color:var(--t2); margin-top:5px; }
  .ov-sec{ font-size:10px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--t3); margin:15px 0 7px; }
  .ov-frow{ display:flex; align-items:center; justify-content:space-between; padding:6px 0; font-size:12.5px; }
  .ov-frow .l{ color:var(--t2); } .ov-frow .v{ color:var(--t1); font-weight:600; display:inline-flex; align-items:center; gap:6px; }
  .ov-frow .v .ad{ width:6px; height:6px; border-radius:50%; background:var(--sev-mod); }
  .ov-next{ font-size:13.5px; font-weight:600; color:var(--t1); margin-bottom:11px; line-height:1.35; }
  .ov-cta{ display:block; width:100%; text-align:center; background:var(--btn); color:#fff; font-size:13px; font-weight:600; border:none; border-radius:8px; padding:10px; cursor:pointer; }
  .ov-cta:hover{ background:var(--btn-h); }
  .ov-queue{ display:block; width:100%; text-align:left; margin-top:11px; font-size:12.5px; font-weight:500; color:var(--link); background:none; border:none; cursor:pointer; }
  .ov-queue:hover{ text-decoration:underline; }

  @media (max-width:1240px){ .ov-grid{ grid-template-columns:1fr; } .ov-kpis,.ov-lower{ grid-column:1 / -1; } .ov-rail-cell{ grid-column:1 / -1; grid-row:auto; order:3; } .ov-rail{ position:static; } }
  @media (max-width:820px){ .ov-kpis{ grid-template-columns:1fr; } .ov-bottom{ grid-template-columns:1fr; } }
  `;

  function demoVM() {
    return { live: false,
      portfolio: { estates: 24, assessed: 23, unknown: 1, online: 118, offline: 2, total: 120 },
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
      response: { open: 7, unacknowledged: 2,
        priority: [
          { estate: 'Palm Court', issue: 'Outfall restriction', ago: '4 min ago', acked: false, state: 'Unassigned' },
          { estate: 'Azure Estate', issue: 'Water threshold exceeded', ago: '12 min ago', acked: true, team: 'Team Delta · ETA 8 min' },
        ], workOrders: 6, teamsDeployed: '3 / 4', slaBreaches: 1, nextAction: 'Dispatch a team to Palm Court' },
      lagoon: { name: 'Lagoon Park', device: 'SNT-024', lastValid: '28m ago' },
      drainage: { peak: 91, restricted: 2, rising: 8, series: [40, 44, 52, 49, 58, 63, 60, 71, 76, 74, 83, 91] },
      weather: { rainfall: 18, exposed: 8, updated: '10:30 WAT', series: [3, 4, 6, 5, 8, 10, 9, 12, 14, 11, 16, 18, 15, 9] },
    };
  }

  function nowWAT() {
    try { return new Date().toLocaleTimeString('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit' }) + ' WAT'; }
    catch (_) { return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ' WAT'; }
  }
  function sparkLine(series, color, unit) {
    if (!series || series.length < 2) series = [0, 0];
    const w = 130, h = 52, p = 3, max = Math.max(...series, 1), min = Math.min(...series, 0), rng = (max - min) || 1;
    const pts = series.map((v, i) => `${(p + i * (w - 2 * p) / (series.length - 1)).toFixed(1)},${(h - p - ((v - min) / rng) * (h - 2 * p)).toFixed(1)}`).join(' ');
    const last = series[series.length - 1];
    return `<svg class="ov-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><title>Latest ${last}${unit || ''} · range ${min}–${max}${unit || ''}</title><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  }
  function sparkBars(series, color, unit) {
    if (!series || !series.length) series = [0];
    const w = 130, h = 52, n = series.length, gap = 2, bw = Math.max(1, (w - gap * (n - 1)) / n), max = Math.max(...series, 1);
    return `<svg class="ov-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${series.map((v, i) => { const bh = Math.max(1.5, (v / max) * (h - 3)); return `<rect x="${(i * (bw + gap)).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1" fill="${color}"><title>+${i + 1}h · ${v}${unit || ''}</title></rect>`; }).join('')}</svg>`;
  }

  function template(vm) {
    const p = vm.portfolio, rk = vm.risk, cf = vm.confidence, rd = vm.response;
    const liveTag = vm.live ? 'LIVE' : 'DEMO';
    const riskLine = (k) => `<div class="ov-line"><span class="l"><span class="d" style="background:${SEV[k]}"></span>${SEV_LABEL[k]}</span><span class="v">${rk[k] || 0}</span></div>`;
    const arrow = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/></svg>`;

    const rows = vm.estates.map(e => {
      const chg = (e.change == null) ? `<span title="Insufficient history">—</span>` : (e.change > 0 ? `+${e.change} pts` : `${e.change} pts`);
      const sc = e.score != null ? e.score : e.baseline;
      const scoreCell = e.score != null
        ? `<div class="ov-score"><span class="n">${e.score}</span><span class="ov-bar"><span style="width:${Math.max(2, Math.min(100, e.score))}%;background:${SEV[e.risk]}"></span></span></div>`
        : `<div class="ov-score"><span class="n" style="color:var(--t3)" title="Baseline estimate">${sc != null ? sc : '—'}</span><span class="ov-bar"><span style="width:${Math.max(2, Math.min(100, sc || 0))}%;background:var(--sev-unk);opacity:.5"></span></span></div>`;
      return `<tr data-estate="${esc(e.name)}" data-risk="${e.risk}">
        <td><div class="ov-est">${esc(e.name)}${e.zone ? `<span class="z">${esc(e.zone)}</span>` : ''}</div></td>
        <td>${scoreCell}</td>
        <td><span class="ov-risk"><span class="d" style="background:${SEV[e.risk]}"></span>${SEV_LABEL[e.risk]}</span></td>
        <td><span class="ov-chg">${chg}</span></td>
        <td style="color:var(--t2)">${esc(e.driver)}</td>
        <td><span class="ov-resp">${esc(e.response)}</span></td>
      </tr>`;
    }).join('');

    const priority = (rd.priority || []).map(i => `
      <div class="ov-inc">
        <div class="ov-inc-top">
          <div>
            <div class="ov-inc-name"><span class="d"></span>${esc(i.estate)}</div>
            <div class="ov-inc-meta">${esc(i.issue)} · ${esc(i.ago)}</div>
          </div>
          ${i.acked ? '' : `<button class="ov-ack" data-ack="${esc(i.estate)}">Acknowledge</button>`}
        </div>
        ${i.acked
          ? `${i.team ? `<div class="ov-inc-team">${esc(i.team)}</div>` : ''}<div class="ov-inc-state acked"><span class="tick"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M20 6L9 17l-5-5"/></svg></span>Acknowledged</div>`
          : `<div class="ov-inc-state unassigned">${esc(i.state || 'Unassigned')}</div>`}
      </div>`).join('') || '<div class="ov-inc-meta" style="padding:8px 0">No priority incidents.</div>';

    const confHealthy = (cf.needReview || 0) === 0;

    return `
    <div class="ov-head">
      <div>
        <div class="ov-title">Overview</div>
        <div class="ov-sub">Live estate risk and response · Updated ${esc(nowWAT())}</div>
      </div>
      <div class="ov-chip"><span class="d" style="background:${vm.live ? 'var(--ok)' : 'var(--sev-mod)'}"></span>${vm.live ? 'Live data' : 'Demo mode · Simulated data'}</div>
    </div>

    <div class="ov-grid">
      <div class="ov-kpis">
        <!-- Portfolio -->
        <div class="ovc">
          <div class="ovc-h"><span class="ovc-k">Portfolio · <span class="live">${liveTag}</span></span>
            <span class="ovc-flag" style="color:var(--ok)"><span class="d" style="background:var(--ok)"></span>Monitoring</span></div>
          <div class="ov-big"><span class="n">${p.estates}</span><span class="u">estates</span></div>
          <div class="ov-div"></div>
          <div class="ov-lines">
            <div class="ov-line"><span class="l">Assessed <span style="color:var(--t4);font-size:11px">· sensor-backed</span></span><span class="v">${p.assessed}</span></div>
            <div class="ov-line"><span class="l">Without live assessment</span><span class="v">${p.unknown}</span></div>
          </div>
          <div class="ov-div"></div>
          <div class="ov-subh">Gateway connectivity</div>
          <div class="ov-lines" style="margin-top:2px">
            <div class="ov-line"><span class="l">Online</span><span class="v">${p.online} / ${p.total}</span></div>
            <div class="ov-line"><span class="l">Offline</span><span class="v">${p.offline} / ${p.total}</span></div>
          </div>
          <div class="ov-note">Online = heartbeat within 5 min</div>
          <div class="ov-links"><button class="ov-link" data-go="estates">View estates ${arrow}</button></div>
        </div>

        <!-- Risk exposure -->
        <div class="ovc">
          <div class="ovc-h"><span class="ovc-k">Risk exposure · <span class="live">${liveTag}</span></span>
            ${rk.highRisk ? `<span class="ovc-flag" style="color:var(--sev-crit)"><span class="d" style="background:var(--sev-crit)"></span>Action required</span>` : `<span class="ovc-flag" style="color:var(--t3)"><span class="d" style="background:var(--sev-low)"></span>Monitoring</span>`}</div>
          <div class="ov-big"><span class="n">${rk.highRisk}</span><span class="u">high-risk estates</span></div>
          <div class="ov-note" style="margin-top:5px">${rk.highRisk} identified${rk.unknown ? ` · ${rk.unknown} without live assessment` : ''}</div>
          <div class="ov-lines">${riskLine('critical')}${riskLine('high')}${riskLine('moderate')}${riskLine('low')}${riskLine('unknown')}</div>
        </div>

        <!-- Data confidence -->
        <div class="ovc">
          <div class="ovc-h"><span class="ovc-k">Data confidence · <span class="live">${liveTag}</span></span>
            ${confHealthy ? `<span class="ovc-flag" style="color:var(--ok)"><span class="d" style="background:var(--ok)"></span>All valid</span>` : `<span class="ovc-flag" style="color:var(--sev-mod)"><span class="d" style="background:var(--sev-mod)"></span>${cf.needReview} need review</span>`}</div>
          <div class="ov-big"><span class="n">${cf.pct}%</span><span class="u">valid sensor streams</span></div>
          <div class="ov-lines">
            <div class="ov-line"><span class="l">Valid</span><span class="v">${cf.valid}</span></div>
            <div class="ov-line"><span class="l">Stale</span><span class="v">${cf.stale}</span></div>
            <div class="ov-line"><span class="l">Invalid</span><span class="v">${cf.invalid}</span></div>
          </div>
          <div class="ov-div"></div>
          <div class="ov-line"><span class="l">Total streams</span><span class="v">${cf.total}</span></div>
          <div class="ov-note">Valid = fresh + passed quality checks</div>
          <div class="ov-links">
            <button class="ov-link" data-go="dataissues">${confHealthy ? 'View data quality' : 'Review ' + cf.needReview + ' data issues'} ${arrow}</button>
            <button class="ov-link" data-go="integrity">View device integrity ${arrow}</button>
          </div>
        </div>
      </div>

      <div class="ov-rail-cell"><div class="ov-rail">
        <div class="ovc-h"><span class="ovc-k">Response desk · <span class="live">${liveTag}</span></span>
          ${rd.unacknowledged ? `<span class="ovc-flag" style="color:var(--sev-mod)"><span class="d" style="background:var(--sev-mod)"></span>${rd.unacknowledged} unacknowledged</span>` : ''}</div>
        <div class="ov-big"><span class="n">${rd.open}</span><span class="u">open incidents</span></div>
        <div class="ov-div"></div>
        <div class="ov-sec" style="margin-top:2px">Priority incidents</div>
        ${priority}
        <div class="ov-div"></div>
        <div class="ov-sec" style="margin-top:2px">Field operations · ${liveTag}</div>
        <div class="ov-frow"><span class="l">Open work orders</span><span class="v">${rd.workOrders}</span></div>
        <div class="ov-frow"><span class="l">Teams deployed</span><span class="v"${rd.teamsConfigured === false ? ' style="color:var(--t3);font-weight:500"' : ''}>${esc(rd.teamsDeployed)}</span></div>
        <div class="ov-frow"><span class="l">SLA breaches · today</span><span class="v">${rd.slaBreaches ? `<span class="ad"></span>${rd.slaBreaches}` : '0'}</span></div>
        <div class="ov-div"></div>
        <div class="ov-sec" style="margin-top:2px">Next action</div>
        <div class="ov-next"${rd.dispatchable ? '' : ' style="color:var(--t2);font-weight:500"'}>${esc(rd.nextAction)}</div>
        ${rd.dispatchable
          ? `<button class="ov-cta" data-go="incident">Dispatch team</button>`
          : (p.unknown ? `<button class="ov-link" data-go="estates" style="font-size:12.5px">Review ${p.unknown} unassessed estate${p.unknown > 1 ? 's' : ''} ${arrow}</button>` : '')}
        <button class="ov-queue" data-go="queue"${rd.dispatchable ? '' : ' style="margin-top:11px"'}>View response queue →</button>
      </div></div>

      <div class="ov-lower">
        <div class="ovc">
          <div class="ov-table-h">
            <div><div class="ov-th-title">Estate risk · ${liveTag}</div><div class="ov-th-sub">Highest risk first · Change over past 1 hour</div></div>
            <div class="ov-seg">
              <button class="active" data-filter="all">All <span class="c">${p.estates}</span></button>
              <button data-filter="critical">Critical <span class="c">${rk.critical}</span></button>
              <button data-filter="high">High <span class="c">${rk.high}</span></button>
              <button data-filter="unknown">Unknown <span class="c">${rk.unknown}</span></button>
            </div>
          </div>
          <div class="ov-tbl-wrap"><table class="ov-tbl">
            <thead><tr><th>Estate</th><th>Score</th><th>Risk</th><th>Change · 1h</th><th>Primary driver</th><th>Response</th></tr></thead>
            <tbody id="ov-tbody">${rows}</tbody>
          </table>
          <div id="ov-empty" style="display:none;padding:24px 12px;text-align:center;color:var(--t3);font-size:13px"></div></div>
          <div class="ov-foot">Showing <span id="ov-shown">${Math.min(vm.estates.length, p.estates)}</span> of ${p.estates} estates · Score 0 – 100 · Higher means greater risk</div>
        </div>

        ${vm.lagoon
          ? `<div class="ov-banner">
              <span class="ic"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg></span>
              <span class="tx"><b>${esc(vm.lagoon.name)}</b> <span class="code">${esc(vm.lagoon.device)}</span> · Risk unavailable · Last valid reading ${esc(vm.lagoon.lastValid)}</span>
              <button class="ov-link" data-go="timeline" data-device="${esc(vm.lagoon.device)}">Device timeline ${arrow}</button>
            </div>`
          : `<div class="ov-banner ok">
              <span class="ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M20 6L9 17l-5-5"/></svg></span>
              <span class="tx"><b>${cf.valid} of ${cf.total}</b> sensor streams fresh · <b>${p.assessed} of ${p.estates}</b> estates have a sensor-backed assessment.</span>
            </div>`}

        <div class="ov-bottom">
          ${(() => { const dr = vm.drainage, hasObs = (dr.series && dr.series.some(v => v > 0)) || dr.peak > 0;
          return `<div class="ovc">
            <div class="ovc-k">Drainage · Past 24h</div>
            ${hasObs ? `<div class="ov-mini-body">
              <div class="col">
                <div class="ov-mrow"><span class="l">Peak utilisation</span><span class="v">${dr.peak}%</span></div>
                <div class="ov-mrow"><span class="l">Restricted outfalls</span><span class="v">${dr.restricted}</span></div>
                <div class="ov-mrow"><span class="l">Rising-level locations</span><span class="v">${dr.rising}</span></div>
              </div>
              <div class="ov-vdiv"></div>
              ${sparkLine(dr.series, 'var(--t2)', '%')}
            </div>` : `<div class="ov-note" style="margin-top:14px">No observations from monitored locations yet.</div>`}
            <div class="ov-note" style="margin-top:9px">From monitored locations · % utilisation</div>
          </div>`; })()}
          ${(() => { const w = vm.weather; const hasW = w.updated && (w.series && w.series.length);
          return `<div class="ovc">
            <div class="ovc-k">Weather · Next 6h</div>
            ${hasW ? `<div class="ov-mini-body">
              <div class="col">
                <div class="ov-mrow"><span class="l">Forecast rainfall</span><span class="v">${w.rainfall} mm</span></div>
                <div class="ov-mrow"><span class="l">Estates exposed</span><span class="v">${w.exposed}</span></div>
                <div class="ov-mrow"><span class="l" style="color:var(--t3)">Updated ${esc(w.updated)}</span><span class="v"></span></div>
              </div>
              <div class="ov-vdiv"></div>
              ${sparkBars(w.series, 'var(--sev-low)', ' mm')}
            </div>` : `<div class="ov-note" style="margin-top:14px">Forecast unavailable.</div>`}
            <div class="ov-note" style="margin-top:9px">Forecast · Open-Meteo · mm/h</div>
          </div>`; })()}
        </div>
      </div>
    </div>`;
  }

  function go(name) {
    const tab = (t) => { if (typeof window.switchTab === 'function') window.switchTab(t); };
    switch (name) {
      case 'dataissues': tab('sensors'); setTimeout(() => { try { OpsSensors.setFilter('dataissue'); } catch (_) {} }, 450); break;
      case 'integrity': case 'timeline': tab('sensors'); break;
      case 'estates': tab('properties'); break;
      case 'incident': case 'queue': tab('alerts'); break;
    }
  }
  function wire(root) {
    root.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
    root.querySelectorAll('.ov-tbl tbody tr').forEach(tr => tr.addEventListener('click', () => go('estates')));
    const applyFilter = (f) => {
      root.querySelectorAll('.ov-seg button').forEach(x => x.classList.toggle('active', x.dataset.filter === f));
      let shown = 0;
      root.querySelectorAll('#ov-tbody tr').forEach(tr => {
        const vis = (f === 'all' || tr.dataset.risk === f);
        tr.style.display = vis ? '' : 'none'; if (vis) shown++;
      });
      const sh = root.querySelector('#ov-shown'); if (sh) sh.textContent = shown;
      const empty = root.querySelector('#ov-empty');
      if (empty) {
        if (shown === 0) {
          const label = { critical: 'critical-risk', high: 'high-risk', unknown: 'unknown-risk' }[f] || 'matching';
          empty.style.display = 'block';
          empty.innerHTML = `No ${label} estates. <button class="ov-link" data-all="1" style="display:inline">View all estates</button>`;
          const b = empty.querySelector('[data-all]'); if (b) b.addEventListener('click', () => applyFilter('all'));
        } else empty.style.display = 'none';
      }
    };
    root.querySelectorAll('.ov-seg button').forEach(p => p.addEventListener('click', () => applyFilter(p.dataset.filter)));
    root.querySelectorAll('.ov-ack').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const inc = b.closest('.ov-inc'); b.remove();
      const st = inc.querySelector('.ov-inc-state');
      if (st) { st.className = 'ov-inc-state acked'; st.innerHTML = '<span class="tick"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M20 6L9 17l-5-5"/></svg></span>Acknowledged'; }
      if (typeof OpsModal !== 'undefined' && OpsModal.toast) OpsModal.toast('Incident acknowledged.', 'success');
    }));
  }

  async function load() {
    if (!_root) return;
    const host = _root.querySelector('.ovx');
    if (!host) return;
    let vm;
    try {
      const r = await OpsModal.apiGet('/analytics/overview');
      vm = (r && r.data) ? r.data : demoVM();
      if (vm && vm.live == null) vm.live = true;
    } catch (_) { vm = demoVM(); }
    _lastVM = vm;
    host.innerHTML = template(vm);
    wire(host);
  }
  async function render(container) {
    _root = container;
    try { container.style.background = '#111214'; container.style.minHeight = 'calc(100vh - 58px)'; } catch (_) {}   // continuous charcoal surface, full height
    if (!document.getElementById('ovx-style')) {
      const st = document.createElement('style'); st.id = 'ovx-style'; st.textContent = CSS; document.head.appendChild(st);
    }
    container.innerHTML = '<div class="ovx"><div style="padding:60px;text-align:center;color:#71767e">Loading overview…</div></div>';
    await load();
    if (_timer) clearInterval(_timer);
    _timer = setInterval(load, 60000);
  }
  return { render };
})();
window.OpsDashboard = OpsDashboard;
