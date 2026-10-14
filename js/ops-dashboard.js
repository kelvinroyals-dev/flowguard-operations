// ════════════════════════════════════════════════════════════════════════
//  FlowGuard Ops — Operations Overview
//  Entry: OpsDashboard.render(container). Live view model from
//  /analytics/overview (portfolio, device trust, estate risk, response desk,
//  drainage, weather). Sample data is provided only by explicit local preview.
// ════════════════════════════════════════════════════════════════════════
const OpsDashboard = (function () {
  let _root = null, _timer = null, _lastVM = null;

  const SEV = { critical: 'var(--sev-crit)', high: 'var(--sev-high)', elevated:'var(--sev-mod)', moderate: 'var(--sev-mod)', low: 'var(--sev-low)', unknown: 'var(--sev-unk)' };
  const SEV_LABEL = { critical: 'Critical', high: 'High', elevated:'Elevated', moderate: 'Moderate', low: 'Low', unknown: 'Unknown' };
  const suppliedNumber = value => ['number','string'].includes(typeof value) && String(value).trim()!=='' && Number.isFinite(Number(value));
  function estateAssessment(estate) {
    const score = suppliedNumber(estate.score) && Number(estate.score) >= 0 && Number(estate.score) <= 100 ? Number(estate.score) : null;
    const risk = Object.hasOwn(SEV_LABEL, String(estate.risk || '').toLowerCase()) ? String(estate.risk).toLowerCase() : 'unknown';
    const change = suppliedNumber(estate.change) && Math.abs(Number(estate.change)) <= 100 ? Number(estate.change) : null;
    return {score,risk,change};
  }
  function completeSnapshot(data) {
    if (!data || !Array.isArray(data.estates) || !['portfolio','risk','confidence','response','drainage','weather'].every(key => data[key] && typeof data[key] === 'object' && !Array.isArray(data[key]))) return false;
    const counts = {portfolio:['estates','assessed','unknown','online','offline','total'],risk:['highRisk','critical','high','moderate','low','unknown'],confidence:['valid','stale','invalid','total','needReview'],response:['open','workOrders','slaBreaches','unacknowledged']};
    return Object.entries(counts).every(([group,keys]) => keys.every(key => suppliedNumber(data[group][key]) && Number.isSafeInteger(Number(data[group][key])) && Number(data[group][key]) >= 0)) && Array.isArray(data.response.priority);
  }
  const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));


  function demoVM() {
    return { live: false,
      portfolio: { estates: 24, assessed: 23, unknown: 1, online: 118, offline: 2, total: 120 },
      risk: { critical: 2, high: 3, elevated: 1, moderate: 6, low: 11, unknown: 1, highRisk: 5 },
      confidence: { pct: 94, valid: 113, stale: 4, invalid: 3, total: 120, needReview: 7 },
      estates: [
        { name: 'Azure Estate', zone: 'Lekki', score: 92, risk: 'critical', change: 14, driver: 'Drain capacity 91%', response: 'Team en route' },
        { name: 'Palm Court', zone: 'Ajah', score: 86, risk: 'critical', change: 9, driver: 'Outfall restriction', response: 'Unassigned' },
        { name: 'Harbour View', zone: 'Ikoyi', score: 78, risk: 'high', change: 6, driver: 'Rapid water rise', response: 'Assigned' },
        { name: 'Orchid Gardens', zone: 'Lekki', score: 74, risk: 'high', change: 4, driver: 'Silt build-up', response: 'Inspection due' },
        { name: 'Creekside Estate', zone: 'VI', score: 71, risk: 'high', change: 3, driver: 'High downstream level', response: 'Monitoring' },
        { name: 'Victoria Court', zone: 'Ikoyi', score: 48, risk: 'elevated', change: -5, driver: 'Elevated inflow', response: 'Monitoring' },
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
    if(typeof OpsCharts!=='undefined')return `<div class="ov-spark">${OpsCharts.series(series,{mini:true,width:150,height:64,color,unit,label:'Drainage trend'})}</div>`;
    if (!series || series.length < 2) return '<span class="fg-chart-unavailable">Trend unavailable</span>';
    const w = 130, h = 52, p = 3, max = Math.max(...series, 1), min = Math.min(...series, 0), rng = (max - min) || 1;
    const pts = series.map((v, i) => `${(p + i * (w - 2 * p) / (series.length - 1)).toFixed(1)},${(h - p - ((v - min) / rng) * (h - 2 * p)).toFixed(1)}`).join(' ');
    const last = series[series.length - 1];
    return `<svg class="ov-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><title>Latest ${last}${unit || ''} · range ${min}–${max}${unit || ''}</title><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  }
  function sparkBars(series, color, unit) {
    if(typeof OpsCharts!=='undefined')return `<div class="ov-spark">${OpsCharts.series(series,{mini:true,type:'bar',width:150,height:64,color,unit,label:'Hourly rainfall'})}</div>`;
    if (!series || !series.length) return '<span class="fg-chart-unavailable">Series unavailable</span>';
    const w = 130, h = 52, n = series.length, gap = 2, bw = Math.max(1, (w - gap * (n - 1)) / n), max = Math.max(...series, 1);
    return `<svg class="ov-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${series.map((v, i) => { const bh = Math.max(1.5, (v / max) * (h - 3)); return `<rect x="${(i * (bw + gap)).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1" fill="${color}"><title>+${i + 1}h · ${v}${unit || ''}</title></rect>`; }).join('')}</svg>`;
  }

  function template(vm) {
    const p = vm.portfolio, rk = vm.risk, cf = vm.confidence, rd = vm.response;
    if (OpsModal.count(p.estates)===0) return OpsModal.pageHeader({title:'Portfolio health',subtitle:'Estate risk, coverage and service performance'})+OpsModal.emptyState('','No estates returned','No estate assessment can be made from this returned snapshot. Register or select estates before reviewing portfolio health.');
    const liveTag = vm.live ? 'Recorded' : 'Sample';
    const riskLine = (k) => `<div class="ov-line"><span class="l"><span class="d" style="background:${SEV[k]}"></span>${SEV_LABEL[k]}</span><span class="v">${rk[k] ?? 'Not supplied'}</span></div>`;
    const arrow = OpsModal.icon('arrow');

    const titleCase = s => String(s || '').replace(/\b([a-z])/g, m => m.toUpperCase());
    const rows = vm.estates.map(e => {
      const assessment = estateAssessment(e);
      const chg = assessment.change == null ? `<span title="Comparable assessment change not supplied">—</span>` : (assessment.change > 0 ? `+${assessment.change} pts` : `${assessment.change} pts`);
      // Live estates show a definitive score + bar; unassessed show "—" (no fake score)
      const scoreCell = assessment.score != null
        ? `<div class="ov-score"><span class="n">${assessment.score}</span><span class="ov-bar"><span style="width:${assessment.score}%;background:${SEV[assessment.risk]}"></span></span></div>`
        : `<div class="ov-score"><span class="n" style="color:var(--t4)" title="No live assessment">—</span></div>`;
      return `<tr data-estate="${esc(e.name)}" data-risk="${assessment.risk}" data-id="${esc(e.property_id || '')}">
        <td><div class="ov-est"><button type="button" class="record-link">${esc(titleCase(e.name))}</button>${e.zone ? `<span class="z">${esc(e.zone)}</span>` : ''}</div></td>
        <td>${scoreCell}</td>
        <td><span class="ov-risk"><span class="d" style="background:${SEV[assessment.risk]}"></span>${SEV_LABEL[assessment.risk]}</span></td>
        <td><span class="ov-chg">${chg}</span></td>
        <td style="color:var(--t2)">${assessment.risk === 'unknown' ? 'Risk assessment unavailable' : esc(e.driver || 'Driver not supplied')}</td>
        <td><span class="ov-resp">${esc(e.response)}</span></td>
      </tr>`;
    }).join('');

    const priority = (rd.priority || []).map(i => `
      <div class="ov-inc">
        <div class="ov-inc-top">
          <div>
            <div class="ov-inc-name">${esc(i.estate)}</div>
            <div class="ov-inc-meta">${esc(i.issue)} · ${esc(i.ago)}</div>
          </div>
          <button class="ov-ack" data-incident="${esc(i.alert_id || '')}">Review incident</button>
        </div>
        ${i.acked
          ? `${i.team ? `<div class="ov-inc-team">${esc(i.team)}</div>` : ''}${OpsModal.status('assigned','Assigned',null,'workflow')}`
          : `<div class="ov-inc-state unassigned">${esc(i.state || 'Unassigned')}</div>`}
      </div>`).join('') || '<div class="ov-inc-meta" style="padding:8px 0">No priority incidents.</div>';

    const confHealthy = Number(cf.total)>0 && Number(cf.valid)===Number(cf.total) && Number(cf.stale)===0 && Number(cf.invalid)===0 && Number(cf.needReview)===0;

    return `
    ${OpsModal.pageHeader({title:'Portfolio health',subtitle:'Estate risk, coverage and service performance',actions:OpsModal.status('neutral',vm.live?'Recorded snapshot':'Sample data')})}
    ${OpsModal.provenance([['Source',vm.live?'Recorded portfolio snapshot':'Sample data'],['Estate cohort',`${p.estates} returned`],['Fetched',nowWAT()]],'Fetch time is not measurement time. Stream quality is not predictive-model confidence. Review reporting period, eligibility and service terms in Service performance.')}
    ${OpsModal.kpiStrip([
      {icon:OpsModal.entityIcon('estate'),label:'Estates returned',value:esc(p.estates),sub:esc(p.assessed)+' with a sensor-backed assessment'},
      {icon:OpsModal.entityIcon('forecast'),label:'High-risk estates',value:esc(rk.highRisk),sub:esc(rk.unknown)+' without a live assessment'},
      {icon:OpsModal.entityIcon('device'),label:'Valid sensor streams',value:Number(cf.total)>0 && suppliedNumber(cf.pct) && Number(cf.pct)>=0 && Number(cf.pct)<=100 ? Number(cf.pct)+'%' : 'Unknown',sub:esc(cf.valid)+' valid of '+esc(cf.total)+' returned streams'},
      {icon:OpsModal.entityIcon('incident'),label:'Open incidents',value:esc(rd.open),sub:esc(rd.unacknowledged)+' unassigned · '+esc(rd.workOrders)+' work orders'},
    ])}

    <div class="ov-grid">
      <div class="ov-kpis">
        <!-- Portfolio -->
        <div class="ovc">
          <div class="ovc-h"><h2 class="ovc-k">Portfolio composition</h2></div>
          <div class="ov-div"></div>
          <div class="ov-lines">
            <div class="ov-line"><span class="l">Assessed <span style="color:var(--t4);font-size:var(--fs-2xs)">· sensor-backed</span></span><span class="v">${p.assessed}</span></div>
            <div class="ov-line"><span class="l">Without live assessment</span><span class="v">${p.unknown}</span></div>
          </div>
          <div class="ov-div"></div>
          <div class="ov-subh">Gateway connectivity</div>
          <div class="ov-lines" style="margin-top:2px">
            <div class="ov-line"><span class="l">Online</span><span class="v">${p.online} / ${p.total}</span></div>
            <div class="ov-line"><span class="l">Offline</span><span class="v">${p.offline} / ${p.total}</span></div>
          </div>
          <div class="ov-note">Online = active device with a non-future heartbeat within 6 hours. This is connectivity, not reading freshness.</div>
          <div class="ov-links"><button class="ov-link" data-go="estates">View estates ${arrow}</button></div>
        </div>

        <!-- Risk exposure -->
        <div class="ovc">
          <div class="ovc-h"><h2 class="ovc-k">Risk distribution</h2>
            ${OpsModal.status(rk.critical>0?'critical':rk.highRisk>0?'high':'unknown',rk.highRisk>0?'Action required':rk.unknown>0?'Review assessment coverage':'No high-risk assessments',null,'risk')}</div>
          <div class="ov-lines">${riskLine('critical')}${riskLine('high')}${riskLine('elevated')}${riskLine('moderate')}${riskLine('low')}${riskLine('unknown')}</div>
        </div>

        <!-- Data confidence -->
        <div class="ovc">
          <div class="ovc-h"><h2 class="ovc-k">Stream quality</h2>
            ${OpsModal.status(confHealthy?'ok':cf.needReview>0?'stale':'unknown',confHealthy?'All returned streams valid':cf.needReview>0?esc(cf.needReview)+' need review':'No assessed streams',null,'sensordata')}</div>
          <div class="ov-lines">
            <div class="ov-line"><span class="l">Valid</span><span class="v">${cf.valid}</span></div>
            <div class="ov-line"><span class="l">Stale</span><span class="v">${cf.stale}</span></div>
            <div class="ov-line"><span class="l">Invalid</span><span class="v">${cf.invalid}</span></div>
          </div>
          <div class="ov-div"></div>
          <div class="ov-line"><span class="l">Total streams</span><span class="v">${cf.total}</span></div>
          <div class="ov-note">Valid here = latest level within 0–100% and 30 minutes. Device diagnostics include additional checks.</div>
          <div class="ov-links">
            <button class="ov-link" data-go="dataissues">${cf.needReview>0 ? 'Review ' + cf.needReview + ' data issues' : 'View data quality'} ${arrow}</button>
            <button class="ov-link" data-go="integrity">View device integrity ${arrow}</button>
          </div>
        </div>
      </div>

      <div class="ov-rail-cell"><div class="ov-rail">
        <div class="ovc-h"><h2 class="ovc-k">Response desk</h2>
          ${rd.unacknowledged ? `<span class="ovc-flag" style="color:var(--sev-mod)"><span class="d" style="background:var(--sev-mod)"></span>${rd.unacknowledged} unassigned</span>` : ''}</div>
        <div class="ov-div"></div>
        <div class="ov-sec" style="margin-top:2px">Priority incidents</div>
        ${priority}
        <div class="ov-div"></div>
        <div class="ov-sec" style="margin-top:2px">Field operations · ${liveTag}</div>
        <div class="ov-frow"><span class="l">Open work orders</span><span class="v">${rd.workOrders}</span></div>
        <div class="ov-frow"><span class="l">Teams deployed</span><span class="v"${rd.teamsConfigured === false ? ' style="color:var(--t3);font-weight:500"' : ''}>${esc(rd.teamsDeployed)}</span></div>
        <div class="ov-frow"><span class="l">Recorded SLA breaches · this month</span><span class="v">${rd.slaBreaches ? `<span class="ad"></span>${rd.slaBreaches}` : '0'}</span></div>
        <div class="ov-div"></div>
        <div class="ov-sec" style="margin-top:2px">Next action</div>
        <div class="ov-next"${rd.dispatchable ? '' : ' style="color:var(--t2);font-weight:500"'}>${esc(rd.nextAction)}</div>
        ${rd.dispatchable
          ? `<button class="ov-cta" data-go="incident">Review response</button>`
          : (p.unknown ? `<button class="ov-link" data-go="estates" style="font-size:var(--fs-xs)">Review ${p.unknown} unassessed estate${p.unknown > 1 ? 's' : ''} ${arrow}</button>` : '')}
        <button class="ov-queue" data-go="queue"${rd.dispatchable ? '' : ' style="margin-top:11px"'}>View response queue →</button>
      </div></div>

      <div class="ov-lower">
        <div class="ovc">
          <div class="ov-table-h">
            <div><h2 class="ov-th-title">Estate risk</h2><div class="ov-th-sub">Highest risk first · Change versus a recorded snapshot 40–80 minutes ago, when available</div></div>
            <div class="ov-seg">
              <button class="active" data-filter="all" aria-pressed="true">All <span class="c">${p.estates}</span></button>
              <button data-filter="critical" aria-pressed="false">Critical <span class="c">${rk.critical}</span></button>
              <button data-filter="high" aria-pressed="false">High <span class="c">${rk.high}</span></button>
              <button data-filter="unknown" aria-pressed="false">Unknown <span class="c">${rk.unknown}</span></button>
            </div>
          </div>
          <div class="ov-tbl-wrap"${vm.estates.length > 10 ? '' : ' style="max-height:none;overflow:visible"'}><table class="ov-tbl">
            <thead><tr><th scope="col">Estate</th><th scope="col">Score</th><th scope="col">Risk</th><th scope="col">Recorded change</th><th scope="col">Risk driver / assessment</th><th scope="col">Response</th></tr></thead>
            <tbody id="ov-tbody">${rows}</tbody>
          </table>
          <div id="ov-empty" style="display:none;padding:24px 12px;text-align:center;color:var(--t3);font-size:var(--fs-xs)"></div></div>
          <div class="ov-foot">Showing <span id="ov-shown">${Math.min(vm.estates.length, p.estates)}</span> of ${p.estates} estates · Score 0 – 100 · Higher means greater risk</div>
        </div>

        ${vm.lagoon
          ? `<div class="ov-banner">
              <span class="ic">${OpsModal.entityIcon('incident')}</span>
              <span class="tx"><b>${esc(vm.lagoon.name)}</b> <span class="code">${esc(vm.lagoon.device)}</span> · Risk unavailable · Latest recorded reading ${esc(vm.lagoon.lastValid)}</span>
              <button class="ov-link" data-go="timeline" data-device="${esc(vm.lagoon.device)}">Device timeline ${arrow}</button>
            </div>`
          : `<div class="ov-banner ok">
              <span class="ic">${OpsModal.entityIcon('check')}</span>
              <span class="tx"><b>${cf.valid} of ${cf.total}</b> sensor streams fresh · <b>${p.assessed} of ${p.estates}</b> estates have a sensor-backed assessment.</span>
            </div>`}

        <div class="ov-bottom">
          ${(() => { const dr = vm.drainage, hasObs = dr.observations > 0 || (dr.series && dr.series.some(v => suppliedNumber(v) && Number(v)>=0));
          return `<div class="ovc">
            <div class="ovc-k">Drainage · Past 24h</div>
            ${hasObs ? `<div class="ov-mini-body">
              <div class="col">
                <div class="ov-mrow"><span class="l">Peak recorded water level</span><span class="v">${dr.peak}%</span></div>
                <div class="ov-mrow"><span class="l">Devices reaching ≥90% (24h)</span><span class="v">${dr.restricted}</span></div>
                <div class="ov-mrow"><span class="l">Devices reaching ≥70% (2h)</span><span class="v">${dr.rising}</span></div>
              </div>
              <div class="ov-vdiv"></div>
              ${sparkLine(dr.series, 'var(--t2)', '%')}
            </div>` : `<div class="ov-note" style="margin-top:14px">No observations from monitored locations yet.</div>`}
            <div class="ov-note" style="margin-top:9px">Recorded observations · water level %, not hydraulic utilisation or verified restriction</div>
          </div>`; })()}
          ${(() => { const w = vm.weather; const hasW = w.updated && (w.series && w.series.length);
          return `<div class="ovc">
            <div class="ovc-k">Estate weather coverage · Next 6h</div>
            ${hasW ? `<div class="ov-mini-body">
              <div class="col">
                <div class="ov-mrow"><span class="l">${esc(w.reference?.name || 'Reference estate not supplied')}</span><span class="v">${w.rainfall} mm</span></div>
                <div class="ov-mrow"><span class="l">Estates with weather</span><span class="v">${w.coverage ? esc(w.coverage.available)+' / '+esc(w.coverage.total) : 'Not supplied'}</span></div>
                <div class="ov-mrow"><span class="l" style="color:var(--t3)">Updated ${esc(w.updated)}</span><span class="v"></span></div>
              </div>
              <div class="ov-vdiv"></div>
              ${sparkBars(w.series, 'var(--sev-low)', ' mm')}
            </div>` : `<div class="ov-note" style="margin-top:14px">Forecast unavailable.</div>`}
            <div class="ov-note" style="margin-top:9px">${w.scope==='estate'?'Highest supplied estate forecast, not a national rainfall total.':'Legacy unscoped weather; do not interpret as nationwide rainfall.'} Total is mm over 6 hours; bars are hourly mm. Open an estate’s weather tab for details.</div>
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
    root.querySelectorAll('.ov-tbl tbody tr').forEach(tr => tr.addEventListener('click', async () => {
      let id = tr.dataset.id;
      // fallback: resolve the property id by name if the overview feed didn't supply it
      if (!id) {
        try {
          const r = await OpsModal.apiGet('/properties');
          const list = (r && r.data) || [];
          const nm = tr.dataset.estate;
          const matches = Array.isArray(list) ? list.filter(p => (p.property_name || p.name || p.asset_code) === nm) : [];
          if (matches.length === 1) id = matches[0].property_id || matches[0].id;
        } catch (_) {}
      }
      if (id && typeof window.fgOpen === 'function') window.fgOpen('properties', id);  // open that estate directly
      else if (typeof window.switchTab === 'function') window.switchTab('properties');
    }));
    const applyFilter = (f) => {
      root.querySelectorAll('.ov-seg button').forEach(x => { const active=x.dataset.filter===f; x.classList.toggle('active',active); x.setAttribute('aria-pressed',String(active)); });
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
      if (b.dataset.incident && window.fgOpen) window.fgOpen('alerts',b.dataset.incident);
      else switchTab('alerts');
    }));
  }

  async function load() {
    if (!_root) return;
    const host = _root.querySelector('.ovx');
    if (!host) return;
    let vm;
    try {
      const r = await OpsModal.apiGet('/analytics/overview');
      if (!r || !completeSnapshot(r.data)) throw new Error('Portfolio data is incomplete');
      vm = r.data;
      if (vm && vm.live == null) vm.live = true;
    } catch (error) {
        host.innerHTML = OpsModal.failure('Portfolio health',error,"reloadTab('dashboard')",true);
        return;
    }
    _lastVM = vm;
    host.innerHTML = template(vm);
    wire(host);
  }
  async function render(container) {
    _root = container;
    try { container.style.background = 'var(--fg-bg)'; container.style.minHeight = 'calc(100vh - 58px)'; } catch (_) {}   // theme-aware full-height surface
    container.innerHTML = '<div class="ovx"><div style="padding:60px;text-align:center;color:var(--ink-3)" role="status">Loading portfolio…</div></div>';
    await load();
    if (_timer) clearInterval(_timer);
    _timer = setInterval(load, 60000);
  }
  return { render };
})();
window.OpsDashboard = OpsDashboard;
