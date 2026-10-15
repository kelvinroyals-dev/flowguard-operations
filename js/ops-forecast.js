// ============================================
// OPS — AI RISK FORECAST  (redesign v4, mockup-matched)
// Rule-based flood-risk projection surfaced as a command-center page:
// KPI sparkline strip, Leaflet risk map + inspector, forecast-event feed,
// four charts (risk timeline, rainfall, risk distribution, drain vs volume),
// highest-risk table, and a model-confidence panel. All bound to /forecast.
// NOTE: this is NOT a trained ML model — it's a documented rule-based blend of
// each estate's current sensor risk + Open-Meteo rainfall (see backend util).
// ============================================

const OpsForecast = (function () {
  'use strict';

  let _root = null, _fc = null, _md = null, _map = null, _horizon = 'today', _sel = null, _layers = {}, _tiles = null, _themeObs = null;
  let _hz = new Map(), _portfolio = null;   // real now/+1h/+3h/+6h horizon data + portfolio triage (GET /forecast/horizons)
  let _chartResize=null;
  let _loadRevision=0;

  const esc = v => (v == null ? '' : String(v)).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  const riskColor = v => OpsSpatial.color(OpsSpatial.risk(v));
  const riskHex = v => OpsSpatial.color(OpsSpatial.risk(v));
  const riskLabel = v => OpsModal.label(OpsSpatial.risk(v));
  const riskValue = v => OpsSpatial.risk(v)==='unknown' ? 'Unknown' : esc(Number(v));
  const riskBadge = (v,score=false) => OpsModal.status(OpsSpatial.risk(v),score && OpsSpatial.risk(v)!=='unknown' ? riskValue(v)+'/100 · '+riskLabel(v) : riskLabel(v),null,'risk');
  const pct = (v, t) => t ? Math.round((v / t) * 100) : 0;
  const inputBasis = e => e.has_live===true ? 'recent' : e.has_live===false ? 'baseline' : 'unknown';
  const inputLabel = e => ({recent:'Recent telemetry',baseline:'Environmental baseline · not measured',unknown:'Input basis not supplied'})[inputBasis(e)];
  const reportedCount = OpsModal.count;
  const reportingLabel = e => {
    const reporting=reportedCount(e.reporting_count), devices=reportedCount(e.sensor_count);
    return reporting==null ? 'Reporting count not supplied' : `${reporting} reporting · ${devices==null ? 'device count not supplied' : devices+' devices reported'}`;
  };

  // ── SVG chart helpers ──────────────────────────────────────────────────
  function chartReading(value,max=Infinity) {
    if(!['number','string'].includes(typeof value) || typeof value==='string'&&!value.trim())return null;
    const number=Number(value);return Number.isFinite(number)&&number>=0&&number<=max?number:null;
  }
  function lineChart(vals, opt) {
    if(typeof OpsCharts!=='undefined')return OpsCharts.series(vals,{...opt,type:'line',unit:'index',note:'Model forecast'});
    opt = opt || {};
    const yMax = opt.yMax || 100, ticks = opt.ticks || [25, 50, 75, 100], color = opt.color || 'var(--blue-hi)';
    const W = Number.isFinite(opt.width)&&opt.width>=160?opt.width:260, H = Number.isFinite(opt.height)&&opt.height>=100?opt.height:140, pl = 34, pr = 8, pt = 8, pb = 22, iw = W - pl - pr, ih = H - pt - pb;
    if (!Array.isArray(vals) || opt.available===false) return OpsModal.textBlock('Forecast readings unavailable','The hourly feed was not supplied.');
    if (!vals.length) return OpsModal.textBlock('No forecast readings returned','The hourly feed returned no readings.');
    const n = vals.length;
    const X = i => pl + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
    const Y = v => pt + ih - (Math.max(0, Math.min(yMax, v)) / yMax) * ih;
    const segments=[];let current=[];
    vals.forEach((value,index)=>{const reading=chartReading(value,yMax);if(reading==null){if(current.length)segments.push(current);current=[];}else current.push({index,point:`${X(index).toFixed(1)},${Y(reading).toFixed(1)}`});});
    if(current.length)segments.push(current);
    if(!segments.length)return OpsModal.textBlock('Forecast readings unavailable','No valid readings were supplied for this chart.');
    const line=segments.map(segment=>'M'+segment.map(point=>point.point).join(' L')).join(' ');
    const area=segments.map(segment=>`M${X(segment[0].index).toFixed(1)},${(pt+ih).toFixed(1)} L${segment.map(point=>point.point).join(' L')} L${X(segment[segment.length-1].index).toFixed(1)},${(pt+ih).toFixed(1)} Z`).join(' ');
    const grid = ticks.map(t => { const y = Y(t); return `<line x1="${pl}" y1="${y.toFixed(1)}" x2="${W - pr}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1"/><text x="${pl - 4}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="12" fill="var(--ink-3)">${esc(t)}</text>`; }).join('');
    const xl = (opt.xLabels || []).map((l, i, a) => `<text x="${X(Math.round(i / (a.length - 1) * (n - 1))).toFixed(1)}" y="${H - 5}" text-anchor="${i === 0 ? 'start' : i === a.length - 1 ? 'end' : 'middle'}" font-size="12" fill="var(--ink-3)">${esc(l)}</text>`).join('');
    return `<svg role="img" aria-label="${esc(opt.label || 'Forecast values')}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" width="100%" height="100%">${grid}${opt.fill ? `<path d="${area}" fill="${color}" opacity="0.12"/>` : ''}<path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>${xl}</svg>`;
  }
  function barChart(vals, opt) {
    if(typeof OpsCharts!=='undefined')return OpsCharts.series(vals,{...opt,type:'bar',unit:'mm',note:'Hourly forecast'});
    opt = opt || {};
    const yMax = opt.yMax || 100, ticks = opt.ticks || [25, 50, 75, 100], color = opt.color || 'var(--blue-hi)';
    const W = Number.isFinite(opt.width)&&opt.width>=160?opt.width:260, H = Number.isFinite(opt.height)&&opt.height>=100?opt.height:140, pl = 34, pr = 8, pt = 8, pb = 22, iw = W - pl - pr, ih = H - pt - pb;
    if (!Array.isArray(vals) || opt.available===false) return OpsModal.textBlock('Forecast readings unavailable','The hourly feed was not supplied.');
    if (!vals.length) return OpsModal.textBlock('No forecast readings returned','The hourly feed returned no readings.');
    if(!vals.some(value=>chartReading(value,yMax)!=null))return OpsModal.textBlock('Forecast readings unavailable','No valid readings were supplied for this chart.');
    const n = vals.length, bw = iw / n;
    const grid = ticks.map(t => { const y = pt + ih - (t / yMax) * ih; return `<line x1="${pl}" y1="${y.toFixed(1)}" x2="${W - pr}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1"/><text x="${pl - 4}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="12" fill="var(--ink-3)">${esc(t)}</text>`; }).join('');
    const bars = vals.map((v, i) => { const reading=chartReading(v,yMax);if(reading==null)return '';const h = (reading / yMax) * ih; const x = pl + i * bw; return `<rect x="${(x + (bw-Math.min(14,bw*.62))/2).toFixed(1)}" y="${(pt + ih - h).toFixed(1)}" width="${Math.min(14,bw * 0.62).toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${color}" opacity="0.9"><title>${esc('Reading '+(i+1))} · ${reading} mm</title></rect>`; }).join('');
    const xl = (opt.xLabels || []).map((l, i, a) => `<text x="${(pl + (i / (a.length - 1)) * iw).toFixed(1)}" y="${H - 5}" text-anchor="${i === 0 ? 'start' : i === a.length - 1 ? 'end' : 'middle'}" font-size="12" fill="var(--ink-3)">${esc(l)}</text>`).join('');
    return `<svg role="img" aria-label="${esc(opt.label || 'Forecast values')}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" width="100%" height="100%">${grid}${bars}${xl}</svg>`;
  }
  function donut(segs, total, centerLabel) {
    if(typeof OpsCharts!=='undefined')return OpsCharts.donut(segs,total,centerLabel||'Estates');
    const r = 54, c = 2 * Math.PI * r; let off = 0;
    const arcs = segs.filter(s => s.v > 0).map(s => { const len = (total ? s.v / total : 0) * c; const el = `<circle cx="72" cy="72" r="${r}" fill="none" stroke="${s.color}" stroke-width="15" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 72 72)"/>`; off += len; return el; }).join('');
    return `<svg role="img" aria-label="${esc('Risk distribution across '+total+' returned estates')}" viewBox="0 0 144 144" width="128" height="128"><circle cx="72" cy="72" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="15"/>${arcs}<text x="72" y="68" text-anchor="middle" font-size="26" font-weight="800" fill="var(--ink)" font-family="var(--ff-b)">${total}</text><text x="72" y="86" text-anchor="middle" font-size="14" fill="var(--ink-3)">${esc(centerLabel || '')}</text></svg>`;
  }
  function ringMini(pctv, color) {
    if(typeof OpsCharts!=='undefined')return OpsCharts.ring(pctv,color);
    const r = 15, c = 2 * Math.PI * r, off = c * (1 - pctv / 100);
    return `<svg viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="20" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="4"/><circle cx="20" cy="20" r="${r}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 20 20)"/></svg>`;
  }
  function rainEta(series) {
    for (let i = 0; i < series.length; i++) if ((series[i].rainfall || 0) >= 2) return i === 0 ? 'now' : `${i}h`;
    return '—';
  }

  // ── icons (proper rainfall = cloud with raindrops) ─────────────────────
  const ICON = {
    rain:OpsModal.entityIcon('rain'), heat:OpsModal.entityIcon('target'),
    net:OpsModal.entityIcon('network'), prop:OpsModal.entityIcon('estate'),
    dev:OpsModal.entityIcon('device'), team:OpsModal.entityIcon('crew'),
    inc:OpsModal.entityIcon('incident'), crew:OpsModal.entityIcon('crew'),
    cap:OpsModal.entityIcon('analytics'),
  };

  // ── data + render ────────────────────────────────────────────────────
  async function render(container) {
    const revision=++_loadRevision;
    _root = container;
    container.innerHTML = `<div class="fcx"><div class="fcx-loading"><div class="loading" style="margin:0 auto 12px;"></div>Building the risk forecast…</div></div>`;
    try {
      const [fcRes, mdRes, hzRes] = await Promise.all([
        OpsModal.apiGet(`/forecast?horizon=${_horizon}&${typeof OpsGeography!=='undefined'?OpsGeography.query():''}`),
        OpsModal.apiGet('/analytics/estate-situation?'+(typeof OpsGeography!=='undefined'?OpsGeography.query():'')).then(res=>({data:res.data.md})).catch(() => ({ data: {} })),
        OpsModal.apiGet('/forecast/horizons?'+(typeof OpsGeography!=='undefined'?OpsGeography.query():'')).catch(() => ({ data: {} })),
      ]);
      if(revision!==_loadRevision)return;
      _fc = OpsModal.readRecord(fcRes,'Risk forecast');
      OpsModal.readArray({data:_fc.estates},'Estate assessment feed');
      _md = mdRes.data || {};
      _hz = new Map((Array.isArray(hzRes.data?.estates) ? hzRes.data.estates : []).map(e => [String(e.property_id), e]));
      _portfolio = (hzRes.data && hzRes.data.portfolio) || null;
      _sel=(_fc.estates||[]).find(e=>String(e.property_id)===String(_sel?.property_id))||_fc.estates[0]||null;
      draw();
      if (_fc.has_rainfall_data === false) return;
      await loadLeaflet();
      if(revision!==_loadRevision)return;
      initMap();
    } catch (err) {
      if(revision!==_loadRevision)return;
      container.innerHTML = OpsModal.failure('Risk forecast',err,"reloadTab('forecast')",true);
    }
  }

  let _assessmentQuery = '', _assessmentFilter = 'all';
  function assessmentData(){return (_fc.estates || []).filter(e => (!_assessmentQuery || [e.name,e.property_id].some(v=>String(v||'').toLowerCase().includes(_assessmentQuery))) && (_assessmentFilter === 'all' || inputBasis(e)===_assessmentFilter));}
  function assessmentRows() {
    const estates=assessmentData();
    return estates.map(e=>`<tr>
      <td>${OpsModal.link('properties',e.property_id,esc(e.name || e.property_id))}<div class="lv-source">${esc(e.property_id)}</div></td>
      <td>${riskBadge(e.current_risk,true)}<div class="lv-source">${inputLabel(e)}</div></td>
      <td>${OpsModal.status(inputBasis(e)==='recent' && e.telemetry_state==='partial' ? 'partial' : 'unknown',inputBasis(e)==='recent' ? e.telemetry_state==='partial' ? 'Partial readings' : 'Recent readings' : inputBasis(e)==='baseline' ? 'No recent valid readings' : 'Input quality not supplied',null,'telemetryinput')}<div class="lv-source">${esc(reportingLabel(e))}</div></td>
      <td>${e.latest_reading ? OpsModal.fmtDateTime(e.latest_reading) : 'Not supplied'}</td>
      <td><span class="lv-status neutral">Unavailable</span></td>
    </tr>`).join('') || `<tr><td colspan="5">${OpsModal.emptyState(OpsModal.entityIcon('estate'),(_fc.estates || []).length?'No matching estate assessments':'No estate assessments returned',(_fc.estates || []).length?'Change the search or input-state filter to review other returned assessments.':'No estate assessments were supplied. Missing records do not establish low risk.')}</td></tr>`;
  }
  function filterAssessments(query, filter) {
    if (query != null) _assessmentQuery = String(query).toLowerCase().trim();
    if (filter != null) _assessmentFilter = filter;
    const rows = document.getElementById('fc-assessment-rows');
    if (rows) rows.innerHTML = assessmentRows();
  }
  function drawUnavailable() {
    _root.innerHTML = `<div class="fcx">
      ${typeof OpsGeography!=='undefined'?OpsGeography.form():''}
      ${OpsModal.pageHeader({title:'Risk forecast',subtitle:'Current inputs remain available; future risk is not assessed.',actions:`<button class="fg-action" onclick="reloadTab('forecast')">Retry weather input</button>`})}
      <div class="fcx-card"><div class="fcx-card-head"><h3>Weather forecast unavailable</h3><span class="lv-status neutral">Projection withheld</span></div>${OpsModal.provenance([['Weather input','Unavailable'],['Generated',_fc.generated_at ? OpsModal.fmtDateTime(_fc.generated_at) : null],['Forecast confidence','Unavailable'],['Estate scope',`${(_fc.estates || []).length} assessments returned`]],'Rainfall, future risk, trends and forecast recommendations are unavailable; missing weather is not zero rainfall. Current indices distinguish recent readings from environmental estimates. Partial readings do not prove estate-wide coverage. Scores are rule-based indices, not probabilities or hydraulic capacity. Generation time is not a sensor measurement timestamp.'+(CONFIG.LOCAL_SANDBOX ? ' External weather requests are intentionally disabled in this isolated local environment.' : ''))}</div>
      <div class="lv-wrap"><div class="lv-toolbar"><div class="lv-search"><input aria-label="Search estate assessments" placeholder="Search estates…" value="${esc(_assessmentQuery)}" oninput="OpsForecast.filterAssessments(this.value,null)"></div><div class="lv-toolbar-right"><select class="um-filter" aria-label="Assessment input basis" onchange="OpsForecast.filterAssessments(null,this.value)"><option value="all" ${_assessmentFilter === 'all' ? 'selected' : ''}>All input states</option><option value="recent" ${_assessmentFilter === 'recent' ? 'selected' : ''}>Recent telemetry</option><option value="baseline" ${_assessmentFilter === 'baseline' ? 'selected' : ''}>Environmental baseline</option></select></div></div>
      <div class="lv-scroll"><table class="lv-table"><thead><tr><th scope="col">Estate</th><th scope="col">Current assessment</th><th scope="col">Input quality</th><th scope="col">Last received reading</th><th scope="col">Future risk</th></tr></thead><tbody id="fc-assessment-rows">${assessmentRows()}</tbody></table></div></div>
    </div>`;
  }

  function draw() {
    if (_fc.has_rainfall_data === false) { drawUnavailable(); return; }
    const est = (_fc.estates || []).slice();
    const series = Array.isArray(_fc.series)?_fc.series:[];
    const riskVals = series.map(h => h?.risk);
    const rainVals = series.map(h => h?.rainfall);
    const n = series.length;
    const total = est.length;
    const riskGroups=['critical','high','elevated','moderate','low','unknown'].map(level=>({level,count:est.filter(e=>OpsSpatial.risk(e.predicted_risk)===level).length}));
    const countRisk=level=>riskGroups.find(group=>group.level===level).count;
    const high = countRisk('critical')+countRisk('high');
    const med = countRisk('elevated')+countRisk('moderate');
    const low = countRisk('low');
    const scored = est.filter(e=>OpsSpatial.risk(e.predicted_risk)!=='unknown');
    const overall = scored.length ? Math.max(...scored.map(e=>Number(e.predicted_risk))) : null;
    const rain24 = chartReading(_fc.cumulative_rain_mm) ?? 'Unavailable';
    const preventive = est.filter(e => ['warning', 'critical'].includes(e.recommendation_level)).length;

    const xl = n ? ['Now', '+6h', '+12h', '+18h', '+24h'] : ['Now', '+24h'];
    // Auto-scale rainfall to the actual forecast so light rain is still visible
    // (a fixed 0–100 axis flattened real ~1–3mm/hr readings to nothing).
    const maxRain = Math.max(0, ...rainVals.map(value=>chartReading(value)).filter(value=>value!=null));
    const rainMax = Math.max(4, Math.ceil(maxRain * 1.3));
    const validRisk=riskVals.map(v=>chartReading(v,100)).filter(v=>v!==null);
    const firstRisk=chartReading(riskVals[0],100);
    const riskSummary=`<div class="fg-chart-summary"><strong>${firstRisk===null?'—':firstRisk}<small>/100</small></strong><span>At window start</span><aside>Peak in window<b>${validRisk.length?Math.max(...validRisk)+'/100':'Unavailable'}</b></aside></div>`;
    const rainPeak = rainVals.some(v=>chartReading(v)!==null) ? `<div class="fg-chart-summary"><strong>${maxRain.toFixed(1)}<small> mm</small></strong><span>Highest hourly value · selected forecast</span></div>` : '';

    const kpis = OpsModal.kpiStrip([
      {icon:OpsModal.entityIcon('forecast'),label:'Peak predicted risk',value:overall==null?'Unavailable':`${overall}/100`,sub:`${riskBadge(overall)} · Maximum across ${scored.length} assessed estates · not a probability`},
      {icon:OpsModal.entityIcon('estate'),label:'High-risk estates',value:high,sub:`${med} moderate/elevated · ${low} low · ${countRisk('unknown')} unknown · ${scored.length} assessed`},
      {icon:OpsSpatial.icon('water'),label:'Reference estate rain · 24h',value:rain24==='Unavailable'?'Unavailable':esc(rain24)+' mm',sub:_fc.weather_scope==='estate'?esc(_fc.weather_reference?.name || 'No reference estate')+' · '+esc(_fc.weather_reference?.source || 'Weather provider')+' estimate':'Legacy regional input · not estate-specific'},
      {icon:OpsModal.entityIcon('maintenance'),label:'Recommended inspections',value:preventive,sub:'Model recommendations · not scheduled work orders'},
    ]);

    const events = buildEvents(est, series);
    const eventsCard = `
      <div class="fcx-card fcx-events">
        <div class="fcx-card-head"><h3>Forecast events</h3></div>
        ${events.length ? events.map(e => `
          <div class="fcx-fe">
            <div class="fcx-fe-ic" style="background:${e.bg};color:${e.color};">${e.icon}</div>
            <div style="min-width:0;flex:1;"><div class="fcx-fe-title">${esc(e.title)}</div><div class="fcx-fe-desc">${esc(e.desc)}</div></div>
            <div class="fcx-fe-time">${esc(e.time)}</div>
          </div>`).join('') : OpsModal.emptyState('','No forecast events returned','No events were derived for the selected forecast window.')}
      </div>`;

    const liveCount = est.filter(e => e.has_live===true).length;
    const conf = OpsModal.reading(_fc.portfolio_confidence,0,100);
    const confLvl = conf == null ? 'Unknown' : conf >= 80 ? 'High' : conf >= 55 ? 'Medium' : 'Low';
    const check = (on, label) => `<div class="fcx-check"><span class="fcx-check-m ${on === true ? 'on' : 'off'}">${on === true ? '✓' : on === false ? '—' : '?'}</span>${label}${on == null ? ' · not supplied' : ''}</div>`;
    const confCard = `
      <div class="fcx-card">
        <div class="fcx-card-head"><h3>Evidence completeness · heuristic</h3></div>
        <div class="fcx-conf-row">
          ${conf == null ? '<span class="fcx-conf-t">—</span>' : ring(conf, conf >= 80 ? 'var(--ok)' : conf >= 55 ? 'var(--warn)' : 'var(--err)')}
          <div><div class="fcx-conf-t">${confLvl} evidence completeness</div></div>
        </div>
        <div class="fcx-checks">
          ${check(_fc.has_rainfall_data, 'Weather forecast')}
          ${check(_fc.has_historical_data, 'Historical data')}
          ${check(liveCount > 0 ? true : est.length && est.every(e=>e.has_live===false) ? false : null, 'Recent telemetry reported')}
          ${check(est.some(e => OpsModal.suppliedDate(e.last_inspection)) ? true : null, 'Inspection dates supplied')}
        </div>
        ${confidenceContext(_fc,liveCount,total)}
      </div>`;

    const charts = `<div class="fcx-charts">
      <div class="fcx-card fcx-chart"><div class="fcx-card-head"><h3>Flood risk timeline</h3><span class="fcx-meta">index · 0–100</span></div>${riskSummary}<div class="fcx-chart-box">${lineChart(riskVals, { available:Array.isArray(_fc.series), label:'Flood risk timeline', yMax: 100, ticks: [25, 50, 75, 100], color: 'var(--err)', fill: true, xLabels: xl })}</div><div class="fg-chart-footer" style="--chart-accent:var(--err)"><span><i></i>Predicted risk index</span><span class="chart-hint">Hover or focus to inspect</span></div></div>
      <div class="fcx-card fcx-chart"><div class="fcx-card-head"><h3>Rainfall forecast</h3><span class="fcx-meta">Hourly · mm</span></div>${rainPeak}<div class="fcx-chart-box">${barChart(rainVals, { available:Array.isArray(_fc.series), label:'Rainfall forecast', yMax: rainMax, ticks: [rainMax * 0.25, rainMax * 0.5, rainMax * 0.75, rainMax].map(v => Math.round(v)), color: 'var(--chart-rain)', xLabels: xl })}</div><div class="fg-chart-footer" style="--chart-accent:var(--chart-rain)"><span><i></i>Hourly rainfall</span><span class="chart-hint">Hover or focus to inspect</span></div></div>
      <div class="fcx-card fcx-chart"><div class="fcx-card-head"><h3>Estate risk distribution</h3><span class="fcx-meta">${total} returned estates</span></div>
        <div class="fcx-donut">
          ${donut(riskGroups.map(group=>({v:group.count,color:OpsSpatial.color(group.level)})), total, 'Estates')}
          <div class="fcx-donut-legend">
            ${riskGroups.map(group=>`<div class="fcx-dl"><span><span class="sw" style="background:${OpsSpatial.color(group.level)}"></span>${OpsModal.label(group.level)}</span><span class="fg-number">${group.count} (${pct(group.count,total)}%)</span></div>`).join('')}
          </div>
        </div>
      </div>
      ${confCard}
    </div>`;

    const topEst = est.slice().sort((a,b)=>Number(b.predicted_risk ?? -1)-Number(a.predicted_risk ?? -1)).slice(0, 8);
    const table = `<div class="fcx-card fcx-tablecard">
      <div class="fcx-card-head"><h2>Estate risk triage</h2><span class="fg-result-count">Top ${topEst.length} of ${est.length} returned estates · predicted risk, descending</span></div>
      <div class="lv-scroll"><table class="lv-table">
        <thead><tr><th scope="col">Estate</th><th scope="col">Current risk</th><th scope="col">Predicted risk</th><th scope="col">Rain ETA</th><th scope="col">Last inspection</th><th scope="col">Recommendation</th></tr></thead>
        <tbody>${topEst.length ? topEst.map(e => {
          const st = recommendationState(e);
          const cleaned = OpsModal.fmtDate(e.last_inspection);
          return `<tr class="clickable" onclick="OpsForecast.select('${esc(e.property_id)}')">
            <td>${OpsModal.link('properties', e.property_id, e.name || e.property_id)}<div class="lv-source">${inputLabel(e)}</div></td>
            <td>${riskBadge(e.current_risk,true)}</td>
            <td>${riskBadge(e.predicted_risk,true)}</td>
            <td class="lv-mono">${rainEta(series)}</td>
            <td class="lv-mono">${cleaned}</td>
            <td>${OpsModal.status(e.recommendation_level,st.l,null,'recommendation')}<div class="lv-source">${esc(e.recommendation || 'No recommendation supplied')}</div></td>
          </tr>`;
        }).join('') : `<tr><td colspan="6">${OpsModal.emptyState(OpsModal.entityIcon('estate'),'No estate forecasts returned','No estate assessments were returned for this forecast window. This does not establish low risk or absence of managed estates.')}</td></tr>`}</tbody>
      </table></div>
    </div>`;

    const modelOpts = ['Rule-based risk forecast'].map(o => `<option>${o}</option>`).join('');
    const rangeOpts = [['today', 'Next 24 hours'], ['tomorrow', 'Tomorrow (24–48h)']].map(([v, l]) => `<option value="${v}" ${v === _horizon ? 'selected' : ''}>${l}</option>`).join('');

    _root.innerHTML = `
      <div class="fcx">
        ${typeof OpsGeography!=='undefined'?OpsGeography.form():''}
        <div class="capability-note" role="status">${_fc.weather_scope==='estate'?`Estate-specific weather inputs · ${esc(_fc.weather_coverage?.available)} / ${esc(_fc.weather_coverage?.total)} estates assessed. Charts show ${esc(_fc.weather_reference?.name || 'no reference estate')}, not a national rainfall total. Scores are uncalibrated heuristics, not flood probabilities.`:'Legacy regional forecast: this response has no estate-specific weather scope. Do not interpret it as a nationwide prediction.'}</div>
        <p class="capability-note">Weather estimates are general guidance and may be inaccurate locally. Do not rely on them alone for personal safety or emergency decisions; consult official meteorological services and relevant authorities.</p>
        ${OpsModal.pageHeader({title:'Risk forecast',subtitle:'Predicted risk is a model estimate, not an observed flood or measured drain capacity.',actions:`<div class="fcx-controls">
            <label class="fcx-ctl"><span>Forecast model</span><select class="fcx-select">${modelOpts}</select></label>
            <label class="fcx-ctl"><span>Time range</span><select class="fcx-select" onchange="OpsForecast.setHorizon(this.value)">${rangeOpts}</select></label>
            <button class="fg-action" onclick="reloadTab('forecast')">${OpsModal.actionIcon('refresh')}Refresh forecast</button>
            <button class="fg-action" onclick="OpsForecast.exportCSV()">Download scoped CSV</button>
          </div>`})}
        ${kpis}
        ${table}
        <div id="fcx-daily"></div>
        <div class="fcx-card" style="margin-bottom:16px;" id="fcx-ask-card">
          <div class="fcx-card-head"><h3>Ask FlowGuard</h3></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <input id="fcx-ask-input" aria-label="Ask about forecast conditions" type="text" placeholder="e.g. Which estates need action before tonight's rain?" style="flex:1;min-width:220px;font-size:var(--fs-sm);padding:9px 12px;border-radius:var(--radius-control);border:1px solid var(--border-2);background:var(--surface);color:var(--ink);" onkeydown="if(event.key==='Enter')OpsForecast.ask()">
            <button class="primary fg-action fg-action-primary" onclick="OpsForecast.ask()" id="fcx-ask-btn">Ask</button>
          </div>
          <div id="fcx-ask-answer"></div>
        </div>
        <div class="fcx-map-row">
          <div class="fcx-map-workspace">
          <div class="fcx-map-wrap">
            <div class="fcx-map-head"><h2>Estate risk map</h2><span class="fcx-meta">${scored.length} assessed · ${total} estates returned${est.filter(e => e.geo_approx).length ? ` · ${est.filter(e => e.geo_approx).length} locations to verify` : ''} · Lagos</span></div>
            <div id="fcx-map"></div>
            ${OpsSpatial.layerPanel(`
              ${OpsSpatial.layerButton({kind:"estate",label:"Risk halos",on:true,extra:'data-l="heat"',onclick:"OpsForecast.layer('heat',this);this.setAttribute('aria-pressed',this.classList.contains('active'))"})}
              ${OpsSpatial.layerButton({kind:"water",label:"Rainfall reference",on:false,extra:'data-l="rain"',onclick:"OpsForecast.layer('rain',this);this.setAttribute('aria-pressed',this.classList.contains('active'))"})}
              ${Auth.hasNavAccess('network') ? `<button class="fg-action" onclick="switchTab('network')">${OpsModal.entityIcon('asset')}Open network map</button>` : ''}
              ${OpsSpatial.layerButton({kind:"estate",label:"Estates",on:true,extra:'data-l="prop"',onclick:"OpsForecast.layer('prop',this);this.setAttribute('aria-pressed',this.classList.contains('active'))"})}
              ${OpsSpatial.layerButton({kind:"device",label:Array.isArray(_md.sensors)?'Devices':'Devices unavailable',available:Array.isArray(_md.sensors),on:false,extra:'data-l="dev"',onclick:"OpsForecast.layer('dev',this);this.setAttribute('aria-pressed',this.classList.contains('active'))"})}
              ${OpsSpatial.layerButton({kind:"incident",label:Array.isArray(_md.alerts)?'Incidents':'Incidents unavailable',available:Array.isArray(_md.alerts),on:false,extra:'data-l="inc"',onclick:"OpsForecast.layer('inc',this);this.setAttribute('aria-pressed',this.classList.contains('active'))"})}
            `,'fcx-layers',{collapsed:true})}
          </div>
            ${OpsSpatial.legend()}
            <p class="fg-map-caveat">Halos identify estate risk. They do not represent flood extent or drainage coverage.</p>
            <div id="fcx-inspector" class="fcx-inspector fg-map-inspector"></div>
          </div>
          <div class="fcx-side">${eventsCard}<div class="fcx-card" id="fcx-inputs-card"><div class="fcx-card-head"><h3>Prediction inputs</h3></div><div id="fcx-inputs"></div></div></div>
        </div>
        ${charts}
        <section class="fcx-card fcx-capacity-note"><div class="fcx-card-head"><h3>Hydraulic capacity assessment</h3><span class="fcx-meta">Unavailable</span></div><div class="capability-note">Measured drain capacity and calibrated flow forecasts are not supplied by this feed. Risk scores and rainfall remain available; they must not be interpreted as hydraulic capacity.</div></section>
        <div id="fcx-interventions"></div>
      </div>`;

    bindChartSizes(riskVals,rainVals,rainMax,xl);
    renderInspector();
    loadDaily();
    loadInterventions();
  }

  function confidenceContext(data,liveCount,total) {
    const score=OpsModal.reading(data.portfolio_confidence,0,100);
    return OpsModal.provenance([
      ['Model','Rule-based blend'],
      ['Source updated',data.generated_at || data.updated_at ? OpsModal.fmtDateTime(data.generated_at || data.updated_at) : null],
      ['Evidence completeness (heuristic)',score===null ? null : score+'%'],
      ['Telemetry cohort',`${liveCount} of ${total} returned estates report recent telemetry`]
    ],'Evidence completeness is a heuristic, not a guarantee or probability of flooding. A supplied inspection date does not establish recency, an inspection schedule or complete monitoring coverage. Source update time is not a sensor measurement timestamp.');
  }

  function bindChartSizes(riskVals,rainVals,rainMax,labels) {
    _chartResize?.disconnect();
    if(!_root?.querySelectorAll)return;
    const boxes=[..._root.querySelectorAll('.fcx-chart-box')];
    const sizes=new WeakMap();
    const redraw=box=>{
      const rect=box.getBoundingClientRect();if(rect.width<160 || rect.height<100)return;
      const key=rect.width+':'+rect.height;if(sizes.get(box)===key)return;
      sizes.set(box,key);
      const dimensions={width:rect.width,height:rect.height,xLabels:labels,pointLabels:riskVals.map((_,i)=>'Hour '+i+' of forecast window'),available:Array.isArray(_fc.series)};
      box.innerHTML=boxes.indexOf(box)===0
        ?lineChart(riskVals,{...dimensions,label:'Flood risk timeline',yMax:100,ticks:[25,50,75,100],color:'var(--err)',fill:true})
        :barChart(rainVals,{...dimensions,label:'Rainfall forecast',yMax:rainMax,ticks:[.25,.5,.75,1].map(f=>Math.round(rainMax*f)),color:'var(--chart-rain)'});
    };
    boxes.forEach(redraw);
    if(window.ResizeObserver){_chartResize=new ResizeObserver(entries=>entries.forEach(entry=>redraw(entry.target)));boxes.forEach(box=>_chartResize.observe(box));}
  }

  // "Does maintenance actually reduce risk?" — before/after sensor deltas per
  // intervention type (GET /analytics/interventions). A negative delta = a win.
  const _iTypeLabel = { silt_clearing: 'Silt clearing', enzyme_refill: 'Bio-enzyme refill', maintenance: 'Maintenance', node_repair: 'Device repair', dispatch: 'Dispatch', incident_prevented: 'Incident prevented' };
  function _deltaCell(v, unit) {
    v=OpsModal.reading(v);
    if (v === null) return '<span class="fg-missing">Not supplied</span>';
    const good = v < 0;
    const col = good ? 'var(--ok)' : v > 0 ? 'var(--err)' : 'var(--ink-3)';
    return `<span style="color:${col};font-weight:600;">${v > 0 ? '+' : ''}${v}${unit}</span>`;
  }
  async function loadInterventions() {
    const el = document.getElementById('fcx-interventions');
    if (!el) return;
    let d = null;
    try { const r = await OpsModal.apiGet('/analytics/interventions'); d = r && r.data; if(!d || !Array.isArray(d.by_type)) throw new Error('Paired intervention measurements were not supplied'); } catch (err) { el.innerHTML = OpsModal.failure('Observed maintenance outcomes',err,'OpsForecast.loadInterventions()'); return; }
    if (!d.by_type.length) {
      el.innerHTML = `<div class="fcx-card" style="margin-top:16px;"><div class="fcx-card-head"><h3>Observed maintenance outcomes</h3></div>${OpsModal.emptyState('','No paired outcomes returned','No intervention types with paired before/after measurements were returned. This is not evidence of ineffective maintenance.')}</div>`;
      return;
    }
    const rows = d.by_type.map(t => `<tr>
      <td>${esc(_iTypeLabel[t.event_type] || OpsModal.label(t.event_type))}</td>
      <td style="text-align:center;">${OpsModal.count(t.count) ?? OpsModal.missing.absent}</td>
      <td style="text-align:center;">${_deltaCell(t.avg_water_level_delta, ' pp')}</td>
      <td style="text-align:center;">${_deltaCell(t.avg_silt_delta, 'mm')}</td>
      <td style="text-align:center;">${OpsModal.reading(t.improved_pct,0,100) === null ? OpsModal.missing.absent : Number(t.improved_pct) + '%'}</td>
    </tr>`).join('');
    el.innerHTML = `<div class="fcx-card fcx-tablecard" style="margin-top:16px;">
      <div class="fcx-card-head"><h3>Observed maintenance outcomes</h3></div>
      ${outcomesContext(d)}
      <div class="lv-scroll"><table class="lv-table">
        <thead><tr><th scope="col">Intervention</th><th scope="col">Count</th><th scope="col">Δ water level</th><th scope="col">Δ silt</th><th scope="col">Improved</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
  }

  function outcomesContext(data) {
    const days=value=>OpsModal.count(value)===null ? null : Number(value)+' days';
    const pct=OpsModal.reading(data.improved_pct,0,100);
    return OpsModal.provenance([
      ['Comparison','Paired before/after measurements'],
      ['Measured interventions',OpsModal.count(data.total_measured)],
      ['Lower primary signal',pct===null ? null : pct+'%'],
      ['Measurement window',days(data.window_days)],
      ['Lookback',days(data.lookback_days)]
    ],'Association is not causal proof; a lower primary signal does not establish that an intervention prevented flooding.'+(data.note ? ' '+String(data.note) : ''));
  }

  // This morning's stored portfolio briefing (from the daily batch job). Shown
  // as a compact banner; a "Regenerate" button reruns it on demand.
  async function loadDaily() {
    if(typeof OpsGeography!=='undefined'&&OpsGeography.query()){const panel=document.getElementById('fcx-daily');if(panel)panel.innerHTML='<p class="capability-note">National morning briefing is hidden in a filtered view. Ask FlowGuard below for an answer scoped to these estates.</p>';return;}
    const el = document.getElementById('fcx-daily');
    if (!el) return;
    let d = null;
    try { const r = await OpsModal.apiGet('/ai/daily'); d = r && r.data; if(!d || typeof d!=='object' || !Object.prototype.hasOwnProperty.call(d,'briefing')) throw new Error('The briefing response was not supplied'); } catch (err) { el.innerHTML = OpsModal.failure('Morning briefing',err,'OpsForecast.loadDaily()'); return; }
    if (!d.briefing) {
      el.innerHTML = `<div class="fcx-card" style="margin-bottom:16px;"><div class="fcx-card-head"><h3>Morning briefing</h3><button class="fg-action" onclick="OpsForecast.runDaily(this)">${OpsModal.actionIcon('create')}Generate briefing</button></div>${OpsModal.emptyState('','No briefing returned','No stored briefing content was supplied. Generate a briefing to request a new summary.')}</div>`;
      return;
    }
    const when = d.generated_at ? OpsModal.fmtDateTime(d.generated_at) : '';
    const foot = d.ai ? when : `${when ? when + ' · ' : ''}Rule-based briefing · AI-written commentary unavailable`;
    el.innerHTML = `<div class="fcx-card" style="margin-bottom:16px;">
      <div class="fcx-card-head"><h3>Morning briefing</h3><button class="fg-action" onclick="OpsForecast.runDaily(this)">Regenerate</button></div>
      <div style="font-size:var(--fs-sm);line-height:1.55;color:var(--ink-2);white-space:pre-wrap;padding:2px 0;">${esc(d.briefing)}</div>
      ${foot ? `<div style="margin-top:8px;font-size:var(--fs-2xs);color:var(--ink-4);">${foot}</div>` : ''}
    </div>`;
  }

  async function ask() {
    const input = document.getElementById('fcx-ask-input');
    const out = document.getElementById('fcx-ask-answer');
    const btn = document.getElementById('fcx-ask-btn');
    if (!input || !out) return;
    const q = input.value.trim();
    if (!q) { input.focus(); return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Thinking…'; }
    out.innerHTML = '<div style="display:flex;align-items:center;gap:8px;margin-top:12px;color:var(--ink-3);font-size:var(--fs-sm);"><span class="loading" style="width:15px;height:15px;"></span> Consulting the live forecast…</div>';
    try {
      const r = await OpsModal.apiPost('/ai/ask', { question: q,geography:typeof OpsGeography!=='undefined'?OpsGeography.values():{} });
      const d = (r && r.data) || {};
      out.innerHTML = `<div style="margin-top:12px;font-size:var(--fs-sm);line-height:1.6;color:var(--ink-2);white-space:pre-wrap;border-left:2px solid var(--border-2);padding:2px 0 2px 12px;">${esc(d.answer || 'No answer.')}</div>`;
    } catch (err) {
      out.innerHTML = `<div style="margin-top:12px;font-size:var(--fs-sm);color:var(--err);">Couldn't answer: ${esc(err.message || 'error')}</div>`;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Ask'; }
    }
  }

  async function runDaily(btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
    try { await OpsModal.apiPost('/ai/daily/run', {}); } catch (_) {}
    if (btn) { btn.disabled = false; btn.textContent = 'Regenerate'; }
    loadDaily();
  }

  function inspectorContext(e) {
    const count = value => OpsModal.count(value) ?? OpsModal.missing.absent;
    return `<div class="fcx-insp-b"><div class="fcx-insp-l">Estate${e.geo_approx ? ' · approx. location' : ''}</div><div class="fcx-pf"><div><span class="k">Client</span><span class="v">${esc(e.client_name || OpsModal.missing.absent)}</span></div><div><span class="k">Last cleaning reported</span><span class="v">${e.last_cleaning ? OpsModal.fmtDateTime(e.last_cleaning) : OpsModal.missing.absent}</span></div><div><span class="k">Last inspection reported</span><span class="v">${e.last_inspection ? OpsModal.fmtDateTime(e.last_inspection) : OpsModal.missing.absent}</span></div><div><span class="k">Open incidents reported</span><span class="v">${count(e.open_incidents)}</span></div><div><span class="k">Flood events reported</span><span class="v">${count(e.flood_events)}</span></div></div></div>`;
  }
  function recommendationState(e) {
    if (OpsSpatial.risk(e.predicted_risk)==='unknown') return {l:'Assessment unavailable'};
    if (typeof e.recommendation!=='string' || !e.recommendation.trim()) return {l:'Recommendation not supplied'};
    const labels={critical:'Dispatch',warning:'Preventive',monitoring:'Monitoring',normal:'Monitoring',low:'Monitoring'};
    return {l:labels[e.recommendation_level] || 'Recommendation supplied'};
  }
  function recommendationBlock(e) {
    const text = typeof e.recommendation === 'string' && e.recommendation.trim() ? e.recommendation : null;
    return `<div class="fcx-insp-b"><div class="fcx-insp-l">Model recommendation</div>${text ? `<div class="fcx-act">${OpsModal.icon('info',18)}<span>${esc(text)}</span></div>` : OpsModal.emptyState('','Recommendation not supplied','Review the forecast inputs and observed conditions before deciding on field work.')}</div>`;
  }
  function renderInspector() {
    const el = document.getElementById('fcx-inspector');
    renderInputs();
    if (!el) return;
    const e = _sel;
    if (!e) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    const cur = e.current_risk, pred = e.predicted_risk;
    // Inspector surfaces use the shared neutral theme, not decorative risk gradients.
    // Recent telemetry is not an installation or estate-wide coverage assertion.
    const coverageValue = chartReading(e.data_coverage,100);
    const coverage = coverageValue === null ? OpsModal.missing.absent : coverageValue+'%';
    const liveBlock = e.has_live===true
      ? `<div class="fcx-insp-b"><div class="fcx-insp-l">Monitoring inputs</div><div class="fcx-live-grid"><div><span class="k">Devices reported</span><span class="v">${OpsModal.count(e.sensor_count) ?? OpsModal.missing.absent}</span></div><div><span class="k">Reported data coverage</span><span class="v">${coverage}</span></div><div><span class="k">Last reading</span><span class="v">${e.latest_reading ? timeAgo(e.latest_reading) : OpsModal.missing.absent}</span></div></div>${OpsModal.provenance([['Basis','Reported telemetry']], 'Data coverage is a supplied telemetry metric, not verified estate-wide protection.')}</div>`
      : `<div class="fcx-insp-b">${OpsModal.emptyState('','Live monitoring unavailable','This feed does not confirm live coverage. Review Device fleet before relying on monitoring inputs.')}</div>`;
    el.innerHTML = `
      <div class="fcx-insp-head"><span class="fcx-insp-name">${esc(e.name || e.property_id)}</span>${riskBadge(pred)}<button type="button" class="fcx-insp-x" aria-label="Close estate inspector" onclick="OpsForecast.deselect()">&times;</button></div>
      <div class="fcx-insp-scroll">
        ${inspectorContext(e)}
        <div class="fcx-insp-b"><div class="fcx-insp-l">Current risk</div><div class="fcx-gauge"><span class="big" style="color:${riskColor(cur)}">${riskValue(cur)}</span>${OpsSpatial.risk(cur)==='unknown'?'':ringMini(cur, riskHex(cur))}</div></div>
        ${horizonBlock(e)}
        ${liveBlock}
        ${recommendationBlock(e)}
        <div class="fcx-insp-b"><div class="fcx-insp-l">AI briefing</div><button class="fg-action" style="width:100%" ${OpsSpatial.risk(pred)==='unknown'?'disabled title="No valid forecast score to explain"':''} onclick="OpsForecast.explain('${esc(e.property_id)}')" id="fcx-brief-btn">Explain this score</button><div id="fcx-brief" class="fcx-brief"></div></div>
      </div>
      <div class="fcx-insp-foot" style="display:flex;flex-direction:column;gap:8px;"><button class="primary fg-action fg-action-primary" style="width:100%" ${OpsSpatial.risk(pred)==='unknown'?'disabled title="A valid forecast is required; prepare manual work from Services"':''} onclick="OpsForecast.act()">${OpsModal.actionIcon('create')}Prepare provider work</button><button class="fg-action" style="width:100%" onclick="OpsForecast.logIncident('${esc(e.property_id)}')">Log flood incident</button></div>`;
  }

  // Real multi-horizon block (now / +1h / +3h / +6h) from GET /forecast/horizons,
  // with the critical-window time and any blockage anomaly. Falls back to the
  // simple projection if the horizons endpoint hasn't returned this estate.
  function horizonBlock(e) {
    const hz = _hz.get(String(e.property_id));
    if (hz && hz.horizons) {
      const h = hz.horizons;
      const cell = (lbl, v) => `<div class="fcx-h"><div class="h">${lbl}</div><div class="v" style="color:${riskColor(v)}">${OpsSpatial.risk(v)==='unknown' ? 'Unavailable' : esc(Number(v))+'/100'}</div></div>`;
      const cw = hz.critical_window
        ? `<div style="margin-top:9px;font-size:var(--fs-xs);font-weight:600;color:var(--err);">${hz.critical_window.in_hours === 0 ? '● Critical now' : '● Likely critical ~' + esc(hz.critical_window.label)}</div>`
        : '';
      const an = hz.anomaly ? `<div style="margin-top:6px;font-size:var(--fs-xs);color:var(--warn);line-height:1.4;">⚠ ${esc(hz.anomaly.note)}</div>` : '';
      return `<div class="fcx-insp-b"><div class="fcx-insp-l">Forecast risk <span style="color:var(--ink-4);font-weight:400;">· next 6h</span></div>
        <div class="fcx-hours">${cell('Now', h.now)}${cell('+1h', h.h1)}${cell('+3h', h.h3)}${cell('+6h', h.h6)}</div>${cw}${an}</div>`;
    }
    return '<div class="fcx-insp-b"><div class="fcx-insp-l">Forecast horizons unavailable</div><div class="fcx-nolive-s">No short-horizon feed was supplied. A daily score cannot establish +1h, +3h or +6h risk.</div></div>';
  }

  // "Explain this score" — asks the backend LLM layer (/ai/brief) to phrase the
  // real numbers as a plain-language briefing. Works even with no API key (the
  // endpoint returns a deterministic template flagged as such).
  async function explain(id) {
    const slot = document.getElementById('fcx-brief');
    const btn = document.getElementById('fcx-brief-btn');
    if (!slot) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Thinking…'; }
    slot.innerHTML = '<div style="display:flex;align-items:center;gap:8px;margin-top:10px;color:var(--ink-3);font-size:var(--fs-sm);"><span class="loading" style="width:15px;height:15px;"></span> Generating briefing…</div>';
    try {
      const r = await OpsModal.apiPost('/ai/brief', { property_id: id,geography:typeof OpsGeography!=='undefined'?OpsGeography.values():{} });
      const d = (r && r.data) || {};
      // No provider/model name is ever surfaced. On success: no tag. On the
      // template fallback: a config-only diagnostic (never the provider name).
      let note = '';
      if (!d.ai) {
        if (d.reason === 'no_key') note = 'AI-written commentary is unavailable; review the supplied rule-based assessment and inputs.';
        else note = 'AI-written commentary is unavailable. The supplied briefing is a rule-based summary, not an independent risk assessment.';
      }
      const tag = note ? `<div style="margin-top:7px;font-size:var(--fs-2xs);color:var(--ink-4);">${note}</div>` : '';
      slot.innerHTML = `<div style="margin-top:10px;font-size:var(--fs-sm);line-height:1.55;color:var(--ink-2);white-space:pre-wrap;">${esc(d.briefing || 'No briefing available.')}</div>${tag}`;
    } catch (err) {
      slot.innerHTML = `<div style="margin-top:10px;font-size:var(--fs-sm);color:var(--err);">Couldn't generate a briefing: ${esc(err.message || 'error')}</div>`;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Regenerate'; }
    }
  }

  // Prediction inputs — the explainability panel: why the model reached its
  // score. Contributors come straight from the backend (real components).
  function renderInputs() {
    const el = document.getElementById('fcx-inputs');
    if (!el) return;
    const e = _sel;
    if (!e) { el.innerHTML = OpsModal.emptyState('','Select an estate','Choose an estate marker to review its reported risk inputs.',{compact:true}); return; }
    const contributionFeed=Array.isArray(e.contributors) && e.contributors.every(c=>c && typeof c==='object' && !Array.isArray(c));
    const contribs = contributionFeed ? e.contributors : [];
    const delta = c => (typeof c.delta==='number' || typeof c.delta==='string' && c.delta.trim()!=='') && Number.isFinite(Number(c.delta)) ? Number(c.delta) : null;
    const maxD = Math.max(1, ...contribs.map(c => Math.abs(delta(c) || 0)));
    const confidence=OpsSpatial.risk(e.confidence)==='unknown' ? 'Not supplied' : Number(e.confidence)+'%';
    const confidenceSources=Array.isArray(e.confidence_sources) ? e.confidence_sources.map(v=>esc(OpsModal.label(v))).join(' · ') : 'Sources not supplied';
    el.innerHTML = `
      <div class="fcx-inputs-top"><span class="fcx-inputs-name">${esc(e.name || e.property_id)}</span>${riskBadge(e.predicted_risk,true)}</div>
      <div class="fcx-inputs-list">
        ${contribs.map(c => {
          const d = delta(c), up = d>0;
          const w = Math.round((Math.abs(d) / maxD) * 100);
          return `<div class="fcx-ci">
            <div class="fcx-ci-top">${d ? `<span class="fcx-ci-arrow ${up ? 'up' : 'down'}">${up ? '↑' : '↓'}</span>` : ''}<span class="fcx-ci-label">${esc(c.label || 'Contributor not named')}</span><span class="fcx-ci-delta ${d ? up ? 'up' : 'down' : ''}">${d==null ? 'Contribution not supplied' : d ? (up ? '+' : '−') + Math.abs(d)+' points' : esc(c.note || '0 points')}</span></div>
            ${d ? `<div class="fcx-ci-bar"><div class="fcx-ci-fill ${up ? 'up' : 'down'}" style="width:${w}%;"></div></div>` : ''}
          </div>`;
        }).join('') || (contributionFeed ? OpsModal.emptyState('','No contribution details returned','No individual score contributions were returned for this estate.') : '<div class="capability-note">Score contributions were not supplied. A forecast score alone does not establish which inputs influenced it.</div>')}
      </div>
      <div class="fcx-inputs-foot">Evidence completeness (heuristic) <b>${confidence}</b> · ${confidenceSources}</div>`;
  }

  function timeAgo(ts) { return OpsModal.relativeTime(ts); }

  // Events are derived from the SAME scored estates the map/inspector use, so
  // the feed is informative even on a dry day or before any Sentinel is live —
  // rainfall spikes, the sharpest-risk property, open incidents and overdue
  // maintenance all surface, not just heavy-rain events.
  function buildEvents(est, series) {
    const out = [];
    const unknown=est.filter(e=>OpsSpatial.risk(e.predicted_risk)==='unknown').length;
    if(unknown) out.push({icon:ICON.cap,bg:'var(--surface-2)',color:'var(--ink-3)',title:'Assessment incomplete',desc:`${unknown} of ${est.length} estates have no valid forecast score. Missing assessments do not establish low risk.`,time:'Unknown'});
    const rainVals = series.map(h => chartReading(h?.rainfall));
    let peakI = -1; rainVals.forEach((v, i) => { if (v!=null && (peakI<0 || v > rainVals[peakI])) peakI = i; });
    const peakRain = peakI>=0?rainVals[peakI]:null;
    if (peakRain>0) out.push({ icon: ICON.rain, bg: 'var(--neon-trace)', color: 'var(--chart-rain)', title: 'Peak forecast rainfall', desc: `${peakRain.toFixed(1)}mm forecast around +${peakI}h. This is a weather input, not a drain-capacity assessment.`, time: `+${peakI}h` });

    const crit = est.filter(e => e.recommendation_level === 'critical');
    if (crit.length) out.push({ icon: ICON.crew, bg: 'var(--eb)', color: 'var(--err)', title: 'Provider response recommended', desc: `Review provider work for ${crit.slice(0, 2).map(e => e.name).join(', ')}${crit.length > 2 ? ' +' + (crit.length - 2) : ''}. This recommendation does not dispatch a provider.`, time: 'review' });

    const warn = est.filter(e => e.recommendation_level === 'warning');
    if (warn.length) out.push({ icon: ICON.inc, bg: 'var(--wb)', color: 'var(--warn)', title: 'Preventive cleaning recommended', desc: `${warn.length} returned estate${warn.length === 1 ? '' : 's'} recommended for pre-cleaning. This is a model recommendation, not a scheduled work deadline.`, time: 'review' });

    // The sharpest end of the portfolio, even when it hasn't tripped a recommendation.
    const worst = est[0];
    if (worst && !crit.length && !warn.length && worst.predicted_risk >= 45)
      out.push({ icon: ICON.cap, bg: 'var(--wb)', color: 'var(--warn)', title: 'Highest forecast risk', desc: `${worst.name} at ${worst.predicted_risk}/100 (${inputLabel(worst)}).`, time: 'window' });

    const incProps = est.filter(e => OpsModal.count(e.open_incidents) > 0);
    const incTotal = incProps.reduce((n, e) => n + OpsModal.count(e.open_incidents), 0);
    const unknownIncidents = est.filter(e => OpsModal.count(e.open_incidents) === null).length;
    if (incTotal) out.push({ icon: ICON.inc, bg: 'var(--eb)', color: 'var(--err)', title: 'Open incidents reported', desc: `${incTotal} reported open incident${incTotal === 1 ? '' : 's'} across ${incProps.length} returned estate${incProps.length === 1 ? '' : 's'}.${unknownIncidents ? ` Counts unavailable for ${unknownIncidents} other returned estate${unknownIncidents === 1 ? '' : 's'}.` : ''}`, time: 'now' });
    else if (unknownIncidents) out.push({icon:ICON.inc,bg:'var(--surface-2)',color:'var(--ink-3)',title:'Incident counts incomplete',desc:`Counts unavailable for ${unknownIncidents} of ${est.length} returned estates. Missing counts do not establish that there are no open incidents.`,time:'Unknown'});

    const review = est.filter(e => { const d = e.last_cleaning || e.last_inspection; return d && (Date.now() - new Date(d).getTime()) > 270 * 864e5; });
    if (review.length) out.push({ icon: ICON.cap, bg: 'var(--wb)', color: 'var(--warn)', title: 'Maintenance history review', desc: `${review.length} returned estate${review.length === 1 ? '' : 's'} have a supplied cleaning or inspection date more than 270 days old. Review the history; this does not establish an overdue contract or the date of the last cleaning.`, time: 'review' });

    // Never dead-empty when there are properties to speak to.
    if (!out.length && est.length) out.push({ icon: ICON.crew, bg: 'var(--ok-bg)', color: 'var(--ok)', title: 'All clear', desc: `No elevated risk across ${est.length} estate${est.length === 1 ? '' : 's'} for this window.`, time: '—' });

    return out.slice(0, 6);
  }

  // ── map ──────────────────────────────────────────────────────────────
  function loadLeaflet() {
    return new Promise(resolve => {
      function css(href, id) { if (id && document.getElementById(id)) return; var c = document.createElement('link'); if (id) c.id = id; c.rel = 'stylesheet'; c.href = href; document.head.appendChild(c); }
      function js(src) { return new Promise(r => { var s = document.createElement('script'); s.src = src; s.onload = r; s.onerror = r; document.head.appendChild(s); }); }
      css('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'fg-leaflet-css');
      css('https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css', 'fg-maplibre-css');
      var pre = [];
      if (!window.L) pre.push(js('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'));
      if (!window.maplibregl) pre.push(js('https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'));
      Promise.all(pre).then(function () {
        if (window.L && window.L.maplibreGL) return resolve();
        js('https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.0.22/leaflet-maplibre-gl.js').then(resolve);
      });
    });
  }
  function styleUrl() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    // OpenFreeMap vector styles — keyless & free.
    return dark
      ? 'https://tiles.openfreemap.org/styles/dark'
      : 'https://tiles.openfreemap.org/styles/positron';
  }
  function initMap() {
    const holder = document.getElementById('fcx-map');
    if (!window.L || !holder) return;
    if (_map) { try { _map.remove(); } catch (_) {} _map = null; }
    const est = (_fc.estates || []).filter(e => e.latitude && e.longitude);
    _map = L.map(holder, { center: [6.5244, 3.3792], zoom: 11, zoomControl: false, attributionControl: false });
    L.control.zoom({ position: 'bottomright' }).addTo(_map);
    _tiles = L.maplibreGL({ style: styleUrl(), attribution: '&copy; <a href="https://openfreemap.org">OpenFreeMap</a> &copy; OSM' }).addTo(_map);
    // Live-swap the basemap (and re-tint the inspector) when the theme toggles.
    if (_themeObs) _themeObs.disconnect();
    _themeObs = new MutationObserver(() => {
      if (_map && _tiles) { _map.removeLayer(_tiles); _tiles = L.maplibreGL({style:styleUrl(),attribution:'&copy; OpenFreeMap &copy; OSM'}).addTo(_map); }
      if (_sel) renderInspector();
    });
    _themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    _layers = { heat: L.layerGroup(), rain: L.layerGroup(), prop: L.layerGroup(), dev: L.layerGroup(), inc: L.layerGroup() };
    const pts = [];

    // Each badge is anchored to its estate, never an invented Lagos reference.
    est.forEach(e=>{
      const rainMm=chartReading(e.cumulative_rain_mm);
      if(_fc.weather_scope!=='estate'||rainMm===null)return;
      _layers.rain.addLayer(L.marker([e.latitude,e.longitude], {title:(e.name||'Estate')+' · forecast rain, not measured',icon:L.divIcon({className:'',iconSize:[90,20],iconAnchor:[45,10],html:`<div style="background:var(--chart-rain);color:var(--canvas);font-size:var(--fs-2xs);font-weight:700;padding:2px 8px;border-radius:var(--radius-pill);white-space:nowrap;">${rainMm.toFixed(1)} mm / 24h</div>`})}));
    });

    est.forEach(e => {
      const col = riskHex(e.predicted_risk);
      _layers.heat.addLayer(L.circleMarker([e.latitude, e.longitude], { radius: 14, color: col, weight: 1, opacity:0.25, fillColor: col, fillOpacity: 0.08 }));
      const icon = OpsSpatial.marker("estate",{state:OpsSpatial.risk(e.predicted_risk),estimated:e.has_live!==true});
      const m = L.marker([e.latitude, e.longitude], { icon, title: (e.name || e.property_name || "Estate") + " · Predicted risk " + riskValue(e.predicted_risk) });
      m.on('click', () => { _sel = e; renderInspector(); });
      _layers.prop.addLayer(m);
      pts.push([e.latitude, e.longitude]);
    });

    // Sentinel devices
    (Array.isArray(_md.sensors) ? _md.sensors : []).filter(s => s.latitude && s.longitude).forEach(s => {
      const on = s.status === 'active';
      const c = on ? 'var(--chart-rain)' : 'var(--ink-3)';
      const icon = OpsSpatial.marker("device",{state:s.status});
      _layers.dev.addLayer(L.marker([s.latitude, s.longitude], { icon, title: s.name || s.sensor_id }));
    });

    // Incidents (active alerts)
    (Array.isArray(_md.alerts) ? _md.alerts : []).filter(a => a.latitude && a.longitude).forEach(a => {
      const c = a.severity === 'critical' ? 'var(--err)' : a.severity === 'high' ? 'var(--warn)' : 'var(--warn)';
      const icon = OpsSpatial.marker("incident",{state:a.severity,attention:a.severity==="critical"});
      _layers.inc.addLayer(L.marker([a.latitude, a.longitude], { icon, title: (a.alert_type || 'Incident') + ' · ' + (a.client_name || '') }));
    });

    // Default-on layers
    _layers.heat.addTo(_map);
    _layers.prop.addTo(_map);
    OpsSpatial.ready(_root);

    // Never leave the hero map mysteriously blank — say why nothing is drawn.
    const old = document.getElementById('fcx-map-empty');
    if (old) old.remove();
    if (!pts.length) {
      const total = (_fc.estates || []).length;
      const msg = total
        ? 'Returned estates have no map coordinates. Review an estate’s recorded location before using this spatial view.'
        : 'No estate assessments were returned for this window. Forecast coverage is unknown; review device freshness and current incidents.';
      const wrap = holder.parentElement;
      const ov = document.createElement('div');
      ov.id = 'fcx-map-empty';
      ov.style.cssText = 'position:absolute;inset:0;z-index:405;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;pointer-events:none;';
      ov.innerHTML = `<div style="max-width:340px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-panel);box-shadow:var(--sh-md);padding:18px 20px;pointer-events:auto;"><div style="font-weight:700;color:var(--ink);margin-bottom:6px;">Nothing to plot yet</div><div style="font-size:var(--fs-sm);color:var(--ink-3);line-height:1.5;">${msg}</div></div>`;
      wrap.appendChild(ov);
    }

    if (pts.length) { try { _map.fitBounds(pts, { padding: [60, 60], maxZoom: 13 }); } catch (_) {} }
    if (window.ResizeObserver) new ResizeObserver(() => { try { _map.invalidateSize(); } catch (_) {} }).observe(holder);
  }

  // ── interactions ───────────────────────────────────────────────────────
  function setHorizon(h) { _horizon = h; _sel = null; render(_root); }
  function layer(key, elx) {
    const grp = _layers[key];
    if (!grp || !_map) { if (elx) elx.classList.toggle('active'); return; }
    const on = _map.hasLayer(grp);
    if (on) { _map.removeLayer(grp); if (elx) elx.classList.remove('active'); }
    else { grp.addTo(_map); if (elx) elx.classList.add('active'); }
  }
  function select(pid) {
    const e = (_fc.estates || []).find(x => String(x.property_id) === String(pid));
    if (!e) return;
    _sel = e; renderInspector();
    if (_map && e.latitude && e.longitude) { try { _map.panTo([e.latitude, e.longitude]); } catch (_) {} }
    const card = document.getElementById('fcx-inputs-card');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function deselect() { _sel = null; renderInspector(); }
  // Forecast recommends; Services owns provider assignment and work delivery.
  function act() {
    if (!Auth.hasNavAccess('jobs') || !Auth.can('jobs.manage')) return OpsModal.toast('You do not have permission to prepare provider work orders', 'watch');
    const e = _sel; if (!e) return;
    if (OpsSpatial.risk(e.predicted_risk)==='unknown') return OpsModal.toast('Forecast assessment unavailable. Prepare manual work from Services.','watch');
    return OpsJobs.newJob({source:'forecast',property_id:e.property_id,title:`Preventive inspection — ${e.name || e.property_id}`,description:`Forecast recommendation: ${e.recommendation || 'Review preventive inspection requirements'}. Predicted risk: ${e.predicted_risk}/100 (model estimate, not observed flooding). Confirm scope and provider availability before dispatch.`});
  }
  // Compatibility for old callers: prepare the canonical form, never submit a legacy ticket.
  function confirmAct() { return act(); }
  // Ground-truth labelling: record that an estate actually flooded. These
  // flood_incident labels are the target variable the Phase 2 ML model trains on.
  function logIncident(pid) {
    if (!Auth.hasNavAccess('forecast')) return OpsModal.toast('You do not have access to forecast observations', 'watch');
    const e = (_fc.estates || []).find(x => String(x.property_id) === String(pid)) || _sel;
    const name = e ? (e.name || e.property_id) : pid;
    const today = new Date().toISOString().slice(0, 10);
    OpsModal.open('Log flood incident', `
      <p style="margin:0 0 14px;font-size:var(--fs-sm);color:var(--ink-3);line-height:1.5;">Record a confirmed flood at <b style="color:var(--ink);">${esc(name)}</b>. This becomes a labelled outcome the risk model learns from — log real incidents, including historical ones.</p>
      ${OpsModal.row([
        OpsModal.field('Date it flooded', 'occurred_at', 'date', today),
        OpsModal.field('Severity', 'severity', 'select', 'moderate', { options: ['minor', 'moderate', 'major', 'severe'] }),
      ])}
      ${OpsModal.field('Note (optional)', 'description', 'text', '', { required: false, placeholder: 'e.g. Surface flooding after 40mm in 2h; access road cut off' })}
    `, [
      { label: 'Cancel', class: 'btn-ghost', onclick: 'OpsModal.close()' },
      { label: 'Log incident', class: 'btn-primary', onclick: `OpsForecast.confirmIncident('${esc(pid)}')`, id: 'modal-save-btn' },
    ]);
  }
  async function confirmIncident(pid) {
    if (!Auth.hasNavAccess('forecast')) return OpsModal.toast('You do not have access to forecast observations', 'watch');
    const d = OpsModal.getFormData();
    if (!d.occurred_at) { OpsModal.toast('Pick the date it flooded', 'warning'); return; }
    OpsModal.setLoading('modal-save-btn', true);
    try {
      await OpsModal.apiPost('/labels/flood-incident', {
        property_id: pid, occurred_at: d.occurred_at, severity: d.severity, description: d.description || '',
      });
      OpsModal.close();
      OpsModal.toast('Flood incident logged', 'nominal');
    } catch (err) {
      OpsModal.setLoading('modal-save-btn', false);
      OpsModal.toast(err.message || 'Failed to log incident', 'critical');
    }
  }

  function open(i) { const e = (_fc.estates || [])[i]; if (e && typeof fgOpen === 'function') fgOpen('properties', e.property_id); }
  function back() { render(_root); }
  function exportCSV(){
    if(!_fc)return;
    const cell=value=>{let text=value==null?'':String(value);if(typeof value==='string'&&/^\s*[=+@-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
    const rows=[['Estate reference','Estate','State','Locality','Current risk index','Forecast risk index','Forecast rainfall mm','Forecast status','Score meaning'],...assessmentData().map(e=>[e.property_id,e.name,e.state,e.city,e.current_risk,e.predicted_risk,e.cumulative_rain_mm,e.forecast_status,'Uncalibrated heuristic; not flood probability'])];
    const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='flowguard-scoped-estate-forecast.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }


  return { render, filterAssessments, setHorizon, layer, select, deselect, act, confirmAct, open, back, explain, loadDaily, loadInterventions, runDaily, ask, logIncident, confirmIncident,exportCSV };

})();
