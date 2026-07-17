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

  let _root = null, _fc = null, _kpis = null, _md = null, _map = null, _horizon = 'today', _sel = null, _layers = {}, _tiles = null, _themeObs = null;

  const esc = v => (v == null ? '' : String(v)).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  const riskColor = v => v >= 70 ? 'var(--err)' : v >= 40 ? 'var(--warn)' : 'var(--ok)';
  const riskHex   = v => v >= 70 ? '#d9463c' : v >= 40 ? '#e08e12' : '#1f9d5b';
  const riskLabel = v => v >= 70 ? 'High' : v >= 40 ? 'Medium' : 'Low';
  const riskChipCls = v => v >= 70 ? 'high' : v >= 40 ? 'moderate' : 'low';
  const pct = (v, t) => t ? Math.round((v / t) * 100) : 0;

  // ── SVG chart helpers ──────────────────────────────────────────────────
  function lineChart(vals, opt) {
    opt = opt || {};
    const yMax = opt.yMax || 100, ticks = opt.ticks || [25, 50, 75, 100], color = opt.color || 'var(--blue-hi)';
    const W = 260, H = 140, pl = 26, pr = 8, pt = 8, pb = 18, iw = W - pl - pr, ih = H - pt - pb;
    if (!vals || !vals.length) return '<div class="fcx-nodata">No data</div>';
    const n = vals.length;
    const X = i => pl + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
    const Y = v => pt + ih - (Math.max(0, Math.min(yMax, v)) / yMax) * ih;
    const pts = vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`);
    const line = 'M' + pts.join(' L');
    const area = `M${X(0).toFixed(1)},${(pt + ih).toFixed(1)} L` + pts.join(' L') + ` L${X(n - 1).toFixed(1)},${(pt + ih).toFixed(1)} Z`;
    const grid = ticks.map(t => { const y = Y(t); return `<line x1="${pl}" y1="${y.toFixed(1)}" x2="${W - pr}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1"/><text x="${pl - 4}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="8" fill="var(--ink-3)">${t}</text>`; }).join('');
    const xl = (opt.xLabels || []).map((l, i, a) => `<text x="${X(Math.round(i / (a.length - 1) * (n - 1))).toFixed(1)}" y="${H - 5}" text-anchor="${i === 0 ? 'start' : i === a.length - 1 ? 'end' : 'middle'}" font-size="8" fill="var(--ink-3)">${l}</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" width="100%" height="100%">${grid}${opt.fill ? `<path d="${area}" fill="${color}" opacity="0.12"/>` : ''}<path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>${xl}</svg>`;
  }
  function multiLine(seriesArr, opt) {
    opt = opt || {};
    const yMax = opt.yMax || 100, ticks = opt.ticks || [25, 50, 75, 100];
    const W = 260, H = 140, pl = 26, pr = 8, pt = 8, pb = 18, iw = W - pl - pr, ih = H - pt - pb;
    const grid = ticks.map(t => { const y = pt + ih - (t / yMax) * ih; return `<line x1="${pl}" y1="${y.toFixed(1)}" x2="${W - pr}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1"/><text x="${pl - 4}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="8" fill="var(--ink-3)">${t}</text>`; }).join('');
    const lines = seriesArr.map(s => {
      const n = s.vals.length, X = i => pl + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw), Y = v => pt + ih - (Math.max(0, Math.min(yMax, v)) / yMax) * ih;
      if (!n) return '';
      return `<path d="M${s.vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' L')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
    }).join('');
    const xl = (opt.xLabels || []).map((l, i, a) => `<text x="${(pl + (i / (a.length - 1)) * iw).toFixed(1)}" y="${H - 5}" text-anchor="${i === 0 ? 'start' : i === a.length - 1 ? 'end' : 'middle'}" font-size="8" fill="var(--ink-3)">${l}</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" width="100%" height="100%">${grid}${lines}${xl}</svg>`;
  }
  function barChart(vals, opt) {
    opt = opt || {};
    const yMax = opt.yMax || 100, ticks = opt.ticks || [25, 50, 75, 100], color = opt.color || 'var(--blue-hi)';
    const W = 260, H = 140, pl = 26, pr = 8, pt = 8, pb = 18, iw = W - pl - pr, ih = H - pt - pb;
    if (!vals || !vals.length) return '<div class="fcx-nodata">No data</div>';
    const n = vals.length, bw = iw / n;
    const grid = ticks.map(t => { const y = pt + ih - (t / yMax) * ih; return `<line x1="${pl}" y1="${y.toFixed(1)}" x2="${W - pr}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1"/><text x="${pl - 4}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="8" fill="var(--ink-3)">${t}</text>`; }).join('');
    const bars = vals.map((v, i) => { const h = (Math.max(0, Math.min(yMax, v)) / yMax) * ih; const x = pl + i * bw; return `<rect x="${(x + bw * 0.15).toFixed(1)}" y="${(pt + ih - h).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${color}" opacity="0.85"/>`; }).join('');
    const xl = (opt.xLabels || []).map((l, i, a) => `<text x="${(pl + (i / (a.length - 1)) * iw).toFixed(1)}" y="${H - 5}" text-anchor="${i === 0 ? 'start' : i === a.length - 1 ? 'end' : 'middle'}" font-size="8" fill="var(--ink-3)">${l}</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" width="100%" height="100%">${grid}${bars}${xl}</svg>`;
  }
  function donut(segs, total, centerLabel) {
    const r = 54, c = 2 * Math.PI * r; let off = 0;
    const arcs = segs.filter(s => s.v > 0).map(s => { const len = (total ? s.v / total : 0) * c; const el = `<circle cx="72" cy="72" r="${r}" fill="none" stroke="${s.color}" stroke-width="15" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 72 72)"/>`; off += len; return el; }).join('');
    return `<svg viewBox="0 0 144 144" width="128" height="128"><circle cx="72" cy="72" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="15"/>${arcs}<text x="72" y="68" text-anchor="middle" font-size="26" font-weight="800" fill="var(--ink)" font-family="var(--ff-m)">${total}</text><text x="72" y="86" text-anchor="middle" font-size="10" fill="var(--ink-3)">${centerLabel || ''}</text></svg>`;
  }
  function spark(vals, color) {
    if (!vals || !vals.length) return '';
    const W = 120, H = 28, mx = Math.max.apply(null, vals.concat([1])), mn = Math.min.apply(null, vals.concat([0])), rng = (mx - mn) || 1;
    const X = i => (i / (vals.length - 1 || 1)) * W, Y = v => H - ((v - mn) / rng) * (H - 3) - 1.5;
    const p = 'M' + vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' L');
    const a = `M0,${H} L` + vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' L') + ` L${W},${H} Z`;
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" width="100%" height="100%"><path d="${a}" fill="${color}" opacity="0.10"/><path d="${p}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
  }
  function ring(pctv, color) {
    const r = 24, c = 2 * Math.PI * r, off = c * (1 - pctv / 100);
    return `<svg viewBox="0 0 60 60" width="60" height="60"><circle cx="30" cy="30" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="6"/><circle cx="30" cy="30" r="${r}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 30 30)"/><text x="30" y="34" text-anchor="middle" font-size="15" font-weight="800" fill="var(--ink)">${pctv}%</text></svg>`;
  }
  function ringMini(pctv, color) {
    const r = 15, c = 2 * Math.PI * r, off = c * (1 - pctv / 100);
    return `<svg viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="20" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="4"/><circle cx="20" cy="20" r="${r}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 20 20)"/></svg>`;
  }
  function rainEta(series) {
    for (let i = 0; i < series.length; i++) if ((series[i].rainfall || 0) >= 2) return i === 0 ? 'now' : `${i}h`;
    return '—';
  }

  // ── icons (proper rainfall = cloud with raindrops) ─────────────────────
  const ICON = {
    rain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M7 15a4.5 4.5 0 01-.5-8.97 5.5 5.5 0 0110.6 1.4A4 4 0 0117 15H7z"/><line x1="8" y1="18" x2="7.5" y2="20.5"/><line x1="12" y1="18" x2="11.5" y2="21"/><line x1="16" y1="18" x2="15.5" y2="20.5"/></svg>',
    heat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/></svg>',
    net:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M6.5 7.2L11 16M17.5 7.2L13 16M7 6h10"/></svg>',
    prop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 10l9-7 9 7M5 9v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V9"/></svg>',
    dev:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="7" y="4" width="10" height="16" rx="2"/><path d="M11 8h2"/></svg>',
    team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0112 0"/><path d="M16 6a3 3 0 010 6M21 20a6 6 0 00-4-5.6"/></svg>',
    inc:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L2.6 17.5A1.5 1.5 0 003.9 19.8h16.2a1.5 1.5 0 001.3-2.3L13.7 3.9a1.5 1.5 0 00-2.6 0z"/></svg>',
    crew: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0112 0"/><path d="M16 6a3 3 0 010 6"/></svg>',
    cap:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0114.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0020.5 15"/></svg>',
  };

  // ── data + render ────────────────────────────────────────────────────
  async function render(container) {
    _root = container;
    container.innerHTML = STYLES + `<div class="fcx"><div class="fcx-loading"><div class="loading" style="margin:0 auto 12px;"></div>Building the risk forecast…</div></div>`;
    try {
      const [fcRes, kpiRes, mdRes] = await Promise.all([
        OpsModal.apiGet(`/forecast?horizon=${_horizon}`),
        OpsModal.apiGet('/analytics/kpis').catch(() => ({ data: {} })),
        OpsModal.apiGet('/analytics/map-data').catch(() => ({ data: {} })),
      ]);
      _fc = fcRes.data || {};
      _kpis = kpiRes.data || {};
      _md = mdRes.data || {};
      if (!_sel && (_fc.estates || []).length) _sel = _fc.estates[0];
      draw();
      await loadLeaflet();
      initMap();
    } catch (err) {
      container.innerHTML = STYLES + `<div class="fcx"><div class="fcx-loading" style="color:var(--err);">Couldn't build the forecast — ${esc(err.message || 'error')}.<br><button class="fcx-btn" onclick="reloadTab('forecast')" style="margin-top:12px;">Retry</button></div></div>`;
    }
  }

  function draw() {
    const est = (_fc.estates || []).slice();
    const series = _fc.series || [];
    const riskVals = series.map(h => h.risk);
    const rainVals = series.map(h => h.rainfall || 0);
    const n = series.length;
    const total = est.length;
    const liveN = est.filter(e => e.has_live).length;
    const high = est.filter(e => e.predicted_risk >= 70).length;
    const med = est.filter(e => e.predicted_risk >= 40 && e.predicted_risk < 70).length;
    const low = est.filter(e => e.predicted_risk < 40).length;
    const avgCur = total ? Math.round(est.reduce((s, e) => s + e.current_risk, 0) / total) : 0;
    const avgPred = total ? Math.round(est.reduce((s, e) => s + e.predicted_risk, 0) / total) : 0;
    const overall = total ? Math.max.apply(null, est.map(e => e.predicted_risk)) : 0;
    const rain24 = _fc.cumulative_rain_mm != null ? _fc.cumulative_rain_mm : Math.round(rainVals.reduce((s, v) => s + v, 0));
    const capacity = Math.max(0, 100 - avgCur);
    const preventive = est.filter(e => ['warning', 'critical'].includes(e.recommendation_level)).length;
    const dRisk = avgPred - avgCur;

    const xl = n ? ['Now', '+6h', '+12h', '+18h', '+24h'] : ['Now', '+24h'];
    // Auto-scale rainfall to the actual forecast so light rain is still visible
    // (a fixed 0–100 axis flattened real ~1–3mm/hr readings to nothing).
    const maxRain = Math.max(0, ...(rainVals.length ? rainVals : [0]));
    const rainMax = Math.max(4, Math.ceil(maxRain * 1.3));

    // Drain capacity vs forecast volume (m³/s) — forecast volume derived from
    // rainfall, drain capacity a network baseline. Synthetic magnitude, real shape.
    const volVals = rainVals.map(v => Math.min(8, +(v * 0.09).toFixed(2)));
    const capBase = Math.max(1, Math.min(6, +(2 + capacity / 25).toFixed(2)));
    const capVals = rainVals.map((v, i) => +(capBase + Math.sin(i / 3) * 0.4).toFixed(2));

    const kpi = (label, value, unit, sub, sparkVals, sparkColor, delta) => `
      <div class="fcx-kpi">
        <div class="fcx-kpi-label">${label}</div>
        <div class="fcx-kpi-val-row"><span class="fcx-kpi-val">${value}</span>${unit ? `<span class="fcx-kpi-unit">${unit}</span>` : ''}${delta != null ? `<span class="fcx-kpi-delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${delta > 0 ? '▲' : delta < 0 ? '▼' : ''} ${Math.abs(delta)}</span>` : ''}</div>
        <div class="fcx-kpi-sub">${sub}</div>
        <div class="fcx-kpi-spark">${spark(sparkVals, sparkColor)}</div>
      </div>`;

    const kpis = `<div class="fcx-kpis">
      ${kpi('Overall risk index', `<span style="color:${riskColor(overall)}">${riskLabel(overall)}</span>`, `${overall}/100`, `Peak across ${total} estate${total === 1 ? '' : 's'}`, riskVals, riskHex(overall), dRisk)}
      ${kpi('High-risk properties', high, '', `${med} medium · ${low} low`, est.map(e => e.predicted_risk), '#e08e12', null)}
      ${kpi('Rainfall forecast (24h)', rain24, 'mm', _fc.has_rainfall_data ? 'Open-Meteo · Lagos' : 'No live rainfall feed', rainVals, '#1cb8e8', null)}
      ${kpi(`Network capacity`, capacity, '%', `${liveN ? 'Measured on ' + liveN : 'Estimated'} · ${avgCur}% avg load`, riskVals.map(v => 100 - v), '#1f9d5b', null)}
      ${kpi('Open preventive actions', preventive, '', 'Recommended by the model', est.map(e => e.recommendation_level === 'critical' ? 100 : e.recommendation_level === 'warning' ? 60 : 20), '#1cb8e8', null)}
    </div>`;

    const events = buildEvents(est, series);
    const eventsCard = `
      <div class="fcx-card fcx-events">
        <div class="fcx-card-head"><h3>Forecast events</h3></div>
        ${events.length ? events.map(e => `
          <div class="fcx-fe">
            <div class="fcx-fe-ic" style="background:${e.bg};color:${e.color};">${e.icon}</div>
            <div style="min-width:0;flex:1;"><div class="fcx-fe-title">${esc(e.title)}</div><div class="fcx-fe-desc">${esc(e.desc)}</div></div>
            <div class="fcx-fe-time">${esc(e.time)}</div>
          </div>`).join('') : '<div class="fcx-nodata" style="padding:20px 0;">No forecast events for this window.</div>'}
      </div>`;

    const liveCount = _fc.live_count != null ? _fc.live_count : est.filter(e => e.has_live).length;
    const conf = _fc.portfolio_confidence != null ? _fc.portfolio_confidence : 60;
    const confLvl = conf >= 80 ? 'High' : conf >= 55 ? 'Medium' : 'Low';
    const confSub = liveCount > 0
      ? `${liveCount} of ${total} propert${total === 1 ? 'y' : 'ies'} live-monitored · rest on weather + historical data.`
      : 'Based on weather + historical data — no Sentinels installed yet.';
    const check = (on, label) => `<div class="fcx-check"><span class="fcx-check-m ${on ? 'on' : 'off'}">${on ? '✓' : '—'}</span>${label}</div>`;
    const confCard = `
      <div class="fcx-card">
        <div class="fcx-card-head"><h3>Forecast confidence</h3></div>
        <div class="fcx-conf-row">
          ${ring(conf, conf >= 80 ? '#1f9d5b' : conf >= 55 ? '#e08e12' : '#d9463c')}
          <div><div class="fcx-conf-t">${confLvl} confidence</div><div class="fcx-conf-s">${confSub}</div></div>
        </div>
        <div class="fcx-checks">
          ${check(_fc.has_rainfall_data, 'Weather forecast')}
          ${check(true, 'Historical data')}
          ${check(liveCount > 0, 'Live Sentinels')}
          ${check(est.some(e => e.last_inspection), 'Recent inspections')}
        </div>
        <div class="fcx-live"><span class="fcx-live-dot"></span>Rule-based blend · updated ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>`;

    const charts = `<div class="fcx-charts">
      <div class="fcx-card fcx-chart"><div class="fcx-card-head"><h3>Flood risk timeline</h3><span class="fcx-meta">index · 0–100</span></div><div class="fcx-chart-box">${lineChart(riskVals, { yMax: 100, ticks: [25, 50, 75, 100], color: '#d9463c', fill: true, xLabels: xl })}</div></div>
      <div class="fcx-card fcx-chart"><div class="fcx-card-head"><h3>Rainfall forecast</h3><span class="fcx-meta">mm</span></div><div class="fcx-chart-box">${barChart(rainVals, { yMax: rainMax, ticks: [rainMax * 0.25, rainMax * 0.5, rainMax * 0.75, rainMax].map(v => Math.round(v)), color: '#1cb8e8', xLabels: xl })}</div></div>
      <div class="fcx-card fcx-chart"><div class="fcx-card-head"><h3>Property risk distribution</h3><span class="fcx-meta">by level</span></div>
        <div class="fcx-donut">
          ${donut([{ v: high, color: '#d9463c' }, { v: med, color: '#e08e12' }, { v: low, color: '#1f9d5b' }], total, 'Estates')}
          <div class="fcx-donut-legend">
            <div class="fcx-dl"><span><span class="sw" style="background:#d9463c"></span>High</span><span class="mono">${high} (${pct(high, total)}%)</span></div>
            <div class="fcx-dl"><span><span class="sw" style="background:#e08e12"></span>Medium</span><span class="mono">${med} (${pct(med, total)}%)</span></div>
            <div class="fcx-dl"><span><span class="sw" style="background:#1f9d5b"></span>Low</span><span class="mono">${low} (${pct(low, total)}%)</span></div>
          </div>
        </div>
      </div>
      <div class="fcx-card fcx-chart"><div class="fcx-card-head"><h3>Drain capacity vs forecast volume</h3><span class="fcx-meta">m³/s · 0–8</span></div><div class="fcx-chart-box">${multiLine([{ vals: capVals, color: '#1cb8e8' }, { vals: volVals, color: '#7c4dff' }], { yMax: 8, ticks: [2, 4, 6, 8], xLabels: xl })}</div>
        <div class="fcx-chart-legend"><span><i style="background:#1cb8e8"></i>Drain capacity</span><span><i style="background:#7c4dff"></i>Forecast volume</span></div></div>
    </div>`;

    const topEst = est.slice(0, 8);
    const table = `<div class="fcx-card fcx-tablecard">
      <div class="fcx-card-head"><h3>Highest-risk properties</h3></div>
      <div class="lv-scroll"><table class="lv-table">
        <thead><tr><th>Property</th><th>Risk</th><th>Forecast (24h)</th><th>Rain ETA</th><th>Last cleaned</th><th>Capacity</th><th>Status</th><th>Recommendation</th></tr></thead>
        <tbody>${topEst.length ? topEst.map(e => {
          const st = e.recommendation_level === 'critical' ? { c: 'danger', l: 'Dispatch' } : e.recommendation_level === 'warning' ? { c: 'warn', l: 'Preventive' } : { c: 'ok', l: 'Monitoring' };
          const capp = Math.max(0, 100 - e.current_risk);
          const cleaned = (e.last_cleaning || e.last_inspection) ? Math.round((Date.now() - new Date(e.last_cleaning || e.last_inspection).getTime()) / 2592e6) + 'mo' : '—';
          return `<tr class="clickable" onclick="OpsForecast.select('${esc(e.property_id)}')">
            <td><span class="fcx-livedot ${e.has_live ? 'on' : ''}" title="${e.has_live ? 'Live-monitored' : 'Estimated (no Sentinel)'}"></span>${OpsModal.link('properties', e.property_id, e.name || e.property_id)}</td>
            <td><span class="lv-status ${riskChipCls(e.current_risk)}">${e.current_risk} · ${riskLabel(e.current_risk)}</span></td>
            <td><span class="lv-status ${riskChipCls(e.predicted_risk)}">${e.predicted_risk} · ${riskLabel(e.predicted_risk)}</span></td>
            <td class="lv-mono">${rainEta(series)}</td>
            <td class="lv-mono">${cleaned}</td>
            <td><div class="fcx-capbar"><div class="track"><div class="fill" style="width:${capp}%;background:${riskColor(e.current_risk)};"></div></div><span class="lv-mono">${capp}%</span></div></td>
            <td><span class="lv-status ${st.c}">${st.l}</span></td>
            <td style="color:var(--ink-3);font-size:var(--fs-xs);">${esc((e.recommendation || '').slice(0, 42))}</td>
          </tr>`;
        }).join('') : '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--ink-3);">No managed properties to score yet.</td></tr>'}</tbody>
      </table></div>
    </div>`;

    const modelOpts = ['FG-AI v2.4 (rule-based)'].map(o => `<option>${o}</option>`).join('');
    const rangeOpts = [['today', 'Next 24 hours'], ['tomorrow', 'Tomorrow (24–48h)']].map(([v, l]) => `<option value="${v}" ${v === _horizon ? 'selected' : ''}>${l}</option>`).join('');

    _root.innerHTML = STYLES + `
      <div class="fcx">
        <div class="fcx-header">
          <div><div class="fcx-titlerow"><span class="fcx-title">AI Risk Forecast</span><span class="fcx-badge">Future capability</span></div><div class="fcx-sub">Predictive flood intelligence across the FlowGuard drainage network.</div></div>
          <div class="fcx-controls">
            <label class="fcx-ctl"><span>Forecast model</span><select class="fcx-select">${modelOpts}</select></label>
            <label class="fcx-ctl"><span>Time range</span><select class="fcx-select" onchange="OpsForecast.setHorizon(this.value)">${rangeOpts}</select></label>
            <button class="fcx-icon-btn" title="Refresh" onclick="reloadTab('forecast')">${ICON.refresh}</button>
          </div>
        </div>
        ${kpis}
        <div class="fcx-map-row">
          <div class="fcx-map-wrap">
            <div class="fcx-map-head"><h2>Risk heatmap</h2><span class="fcx-meta">${total} propert${total === 1 ? 'y' : 'ies'} scored${est.filter(e => e.geo_approx).length ? ` · ${est.filter(e => e.geo_approx).length} to verify` : ''} · Lagos</span></div>
            <div id="fcx-map"></div>
            <div class="fcx-layers">
              <div class="fcx-layer active" data-l="heat" onclick="OpsForecast.layer('heat',this)">${ICON.heat}<span>Risk heatmap</span></div>
              <div class="fcx-layer" data-l="rain" onclick="OpsForecast.layer('rain',this)">${ICON.rain}<span>Rainfall</span></div>
              <div class="fcx-layer" data-l="net" onclick="OpsForecast.layer('net',this)">${ICON.net}<span>Drainage network</span></div>
              <div class="fcx-layer active" data-l="prop" onclick="OpsForecast.layer('prop',this)">${ICON.prop}<span>Properties</span></div>
              <div class="fcx-layer" data-l="dev" onclick="OpsForecast.layer('dev',this)">${ICON.dev}<span>Sentinel devices</span></div>
              <div class="fcx-layer" data-l="inc" onclick="OpsForecast.layer('inc',this)">${ICON.inc}<span>Incidents</span></div>
            </div>
            <div class="fcx-legend"><span><span class="sw" style="background:#1f9d5b"></span>Low</span><span><span class="sw" style="background:#e08e12"></span>Medium</span><span><span class="sw" style="background:#d9463c"></span>High</span></div>
            <div id="fcx-inspector" class="fcx-inspector"></div>
          </div>
          <div class="fcx-side">${eventsCard}<div class="fcx-card" id="fcx-inputs-card"><div class="fcx-card-head"><h3>Prediction inputs</h3></div><div id="fcx-inputs"></div></div>${confCard}</div>
        </div>
        ${charts}
        ${table}
      </div>`;

    renderInspector();
  }

  function renderInspector() {
    const el = document.getElementById('fcx-inspector');
    renderInputs();
    if (!el) return;
    const e = _sel;
    if (!e) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    const cur = e.current_risk, pred = e.predicted_risk;
    // Translucent, risk-tinted glass (matches the mockup's see-through vibe):
    // warm tint at the top when risk is high, cool at the bottom.
    const tint = pred >= 70 ? '217,70,60' : pred >= 40 ? '224,142,18' : '31,157,91';
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const base = dark ? '16,26,38' : '255,255,255';       // --surface rgb per theme
    const baseA = dark ? '.86' : '.76';
    el.style.background = `linear-gradient(165deg, rgba(${tint},${dark ? '.24' : '.16'}), rgba(${base},${baseA}) 42%, rgba(${base},${baseA}) 72%, rgba(28,184,232,.07))`;
    const at = f => Math.round(cur + (pred - cur) * f);
    const months = d => d ? Math.round((Date.now() - new Date(d).getTime()) / 2592e6) + 'mo ago' : '—';
    // Live section — hidden entirely when no Sentinel is installed.
    const liveBlock = e.has_live
      ? `<div class="fcx-insp-b"><div class="fcx-insp-l">Live monitoring</div><div class="fcx-live-grid"><div><span class="k">Sentinels</span><span class="v">${e.sensor_count}</span></div><div><span class="k">Coverage</span><span class="v">${e.data_coverage || 0}%</span></div><div><span class="k">Last seen</span><span class="v">${e.latest_reading ? timeAgo(e.latest_reading) : '—'}</span></div></div></div>`
      : `<div class="fcx-insp-b fcx-nolive"><div class="fcx-nolive-t">No Sentinel installed</div><div class="fcx-nolive-s">Forecast based on environmental &amp; historical data.</div></div>`;
    el.innerHTML = `
      <div class="fcx-insp-head"><span class="fcx-insp-name">${esc(e.name || e.property_id)}</span><span class="fcx-chip ${riskChipCls(pred)}">${riskLabel(pred)} risk</span><span class="fcx-insp-x" onclick="OpsForecast.deselect()">&times;</span></div>
      <div class="fcx-insp-scroll">
        <div class="fcx-insp-b"><div class="fcx-insp-l">Property${e.geo_approx ? ' · approx. location' : ''}</div><div class="fcx-pf"><div><span class="k">Client</span><span class="v">${esc(e.client_name || 'Unlinked')}</span></div><div><span class="k">Last cleaned</span><span class="v">${months(e.last_cleaning || e.last_inspection)}</span></div><div><span class="k">Open incidents</span><span class="v">${e.open_incidents || 0}</span></div><div><span class="k">Flood history</span><span class="v">${e.flood_events || 0}</span></div></div></div>
        <div class="fcx-insp-b"><div class="fcx-insp-l">Current risk</div><div class="fcx-gauge"><span class="big" style="color:${riskColor(cur)}">${cur}</span>${ringMini(cur, riskHex(cur))}</div></div>
        <div class="fcx-insp-b"><div class="fcx-insp-l">Forecast risk</div><div class="fcx-hours"><div class="fcx-h"><div class="h">6h</div><div class="v" style="color:${riskColor(at(.25))}">${at(.25)}%</div></div><div class="fcx-h"><div class="h">12h</div><div class="v" style="color:${riskColor(at(.5))}">${at(.5)}%</div></div><div class="fcx-h"><div class="h">24h</div><div class="v" style="color:${riskColor(pred)}">${pred}%</div></div></div></div>
        ${liveBlock}
        <div class="fcx-insp-b"><div class="fcx-insp-l">Recommended action</div><div class="fcx-act">${e.recommendation_level === 'ok' ? '✓' : '!'} ${esc(e.recommendation || 'Monitor as usual')}</div></div>
      </div>
      <div class="fcx-insp-foot"><button class="fcx-btn primary" style="width:100%;" onclick="OpsForecast.act()">Create preventive action</button></div>`;
  }

  // Prediction inputs — the explainability panel: why the model reached its
  // score. Contributors come straight from the backend (real components).
  function renderInputs() {
    const el = document.getElementById('fcx-inputs');
    if (!el) return;
    const e = _sel;
    if (!e) { el.innerHTML = '<div class="fcx-nodata" style="padding:16px 0;">Select a property on the map to see what drives its risk.</div>'; return; }
    const contribs = e.contributors || [];
    const maxD = Math.max(1, ...contribs.map(c => Math.abs(c.delta || 0)));
    el.innerHTML = `
      <div class="fcx-inputs-top"><span class="fcx-inputs-name">${esc(e.name || e.property_id)}</span><span class="fcx-chip ${riskChipCls(e.predicted_risk)}">${riskLabel(e.predicted_risk)} · ${e.predicted_risk}%</span></div>
      <div class="fcx-inputs-list">
        ${contribs.map(c => {
          const d = c.delta || 0, up = c.dir === 'up';
          const w = Math.round((Math.abs(d) / maxD) * 100);
          return `<div class="fcx-ci">
            <div class="fcx-ci-top"><span class="fcx-ci-arrow ${up ? 'up' : 'down'}">${up ? '↑' : '↓'}</span><span class="fcx-ci-label">${esc(c.label)}</span><span class="fcx-ci-delta ${up ? 'up' : 'down'}">${d ? (up ? '+' : '−') + Math.abs(d) : (c.note || '')}</span></div>
            ${d ? `<div class="fcx-ci-bar"><div class="fcx-ci-fill ${up ? 'up' : 'down'}" style="width:${w}%;"></div></div>` : ''}
          </div>`;
        }).join('')}
      </div>
      <div class="fcx-inputs-foot">${e.confidence != null ? `Forecast confidence <b>${e.confidence}%</b> · ${(e.confidence_sources || []).join(' · ')}` : ''}</div>`;
  }

  function timeAgo(ts) {
    const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (m < 1) return 'now'; if (m < 60) return m + 'm'; if (m < 1440) return Math.floor(m / 60) + 'h'; return Math.floor(m / 1440) + 'd';
  }

  // Events are derived from the SAME scored estates the map/inspector use, so
  // the feed is informative even on a dry day or before any Sentinel is live —
  // rainfall spikes, the sharpest-risk property, open incidents and overdue
  // maintenance all surface, not just heavy-rain events.
  function buildEvents(est, series) {
    const out = [];
    const rainVals = series.map(h => h.rainfall || 0);
    let peakI = 0; rainVals.forEach((v, i) => { if (v > rainVals[peakI]) peakI = i; });
    const peakRain = rainVals.length ? rainVals[peakI] : 0;
    if (peakRain >= 5) out.push({ icon: ICON.rain, bg: 'rgba(217,70,60,.12)', color: '#d9463c', title: 'Heavy rain expected', desc: `${Math.round(peakRain)}mm forecast around +${peakI}h — drains will load fast.`, time: `+${peakI}h` });
    else if (peakRain >= 1.5) out.push({ icon: ICON.rain, bg: 'rgba(28,184,232,.12)', color: '#1cb8e8', title: 'Showers expected', desc: `${peakRain.toFixed(1)}mm forecast around +${peakI}h.`, time: `+${peakI}h` });

    const crit = est.filter(e => e.recommendation_level === 'critical');
    if (crit.length) out.push({ icon: ICON.crew, bg: 'rgba(217,70,60,.12)', color: '#d9463c', title: 'Crew recommended', desc: `Deploy crews to ${crit.slice(0, 2).map(e => e.name).join(', ')}${crit.length > 2 ? ' +' + (crit.length - 2) : ''}.`, time: 'now' });

    const warn = est.filter(e => e.recommendation_level === 'warning');
    if (warn.length) out.push({ icon: ICON.inc, bg: 'rgba(224,142,18,.12)', color: '#e08e12', title: 'Preventive cleaning due', desc: `${warn.length} propert${warn.length === 1 ? 'y' : 'ies'} recommended for pre-cleaning.`, time: '12h' });

    // The sharpest end of the portfolio, even when it hasn't tripped a recommendation.
    const worst = est[0];
    if (worst && !crit.length && !warn.length && worst.predicted_risk >= 45)
      out.push({ icon: ICON.cap, bg: 'rgba(224,142,18,.12)', color: '#e08e12', title: 'Highest forecast risk', desc: `${worst.name} at ${worst.predicted_risk}% (${worst.has_live ? 'live' : 'modelled'}).`, time: 'window' });

    const incProps = est.filter(e => e.open_incidents > 0);
    const incTotal = incProps.reduce((n, e) => n + (e.open_incidents || 0), 0);
    if (incTotal) out.push({ icon: ICON.inc, bg: 'rgba(217,70,60,.12)', color: '#d9463c', title: 'Open incidents', desc: `${incTotal} active incident${incTotal === 1 ? '' : 's'} across ${incProps.length} propert${incProps.length === 1 ? 'y' : 'ies'}.`, time: 'now' });

    const overdue = est.filter(e => { const d = e.last_cleaning || e.last_inspection; return d && (Date.now() - new Date(d).getTime()) > 270 * 864e5; });
    if (overdue.length) out.push({ icon: ICON.cap, bg: 'rgba(224,142,18,.12)', color: '#e08e12', title: 'Maintenance overdue', desc: `${overdue.length} propert${overdue.length === 1 ? 'y' : 'ies'} not cleaned in 9+ months.`, time: 'plan' });

    // Never dead-empty when there are properties to speak to.
    if (!out.length && est.length) out.push({ icon: ICON.crew, bg: 'rgba(31,157,91,.12)', color: '#1f9d5b', title: 'All clear', desc: `No elevated risk across ${est.length} propert${est.length === 1 ? 'y' : 'ies'} for this window.`, time: '—' });

    return out.slice(0, 6);
  }

  // ── map ──────────────────────────────────────────────────────────────
  function loadLeaflet() {
    return new Promise(resolve => {
      if (window.L) return resolve();
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(css);
      const js = document.createElement('script'); js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; js.onload = resolve; document.head.appendChild(js);
    });
  }
  function tileUrl() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return `https://{s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`;
  }
  function initMap() {
    const holder = document.getElementById('fcx-map');
    if (!window.L || !holder) return;
    if (_map) { try { _map.remove(); } catch (_) {} _map = null; }
    const est = (_fc.estates || []).filter(e => e.latitude && e.longitude);
    _map = L.map(holder, { center: [6.5244, 3.3792], zoom: 11, zoomControl: false, attributionControl: false });
    L.control.zoom({ position: 'bottomright' }).addTo(_map);
    _tiles = L.tileLayer(tileUrl(), { subdomains: 'abcd', maxZoom: 19 }).addTo(_map);
    // Live-swap the basemap (and re-tint the inspector) when the theme toggles.
    if (_themeObs) _themeObs.disconnect();
    _themeObs = new MutationObserver(() => {
      if (_map && _tiles) { try { _tiles.setUrl(tileUrl()); } catch (_) {} }
      if (_sel) renderInspector();
    });
    _themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    _layers = { heat: L.layerGroup(), rain: L.layerGroup(), net: L.layerGroup(), prop: L.layerGroup(), dev: L.layerGroup(), inc: L.layerGroup() };
    const pts = [];

    // Rainfall overlay — city-wide forecast intensity (Open-Meteo is one Lagos
    // point, so it's a coverage wash, not per-drain rain).
    const rainMm = _fc.cumulative_rain_mm || 0;
    if (rainMm > 0) {
      _layers.rain.addLayer(L.circle([6.5244, 3.3792], { radius: 16000, color: '#1cb8e8', weight: 1, fillColor: '#1cb8e8', fillOpacity: Math.min(0.28, rainMm / 120) }));
      _layers.rain.addLayer(L.marker([6.5244, 3.3792], { icon: L.divIcon({ className: '', iconSize: [70, 20], iconAnchor: [35, 10], html: `<div style="background:#1cb8e8;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;white-space:nowrap;">${Math.round(rainMm)}mm / 24h</div>` }) }));
    }

    est.forEach(e => {
      const col = riskHex(e.predicted_risk);
      _layers.heat.addLayer(L.circle([e.latitude, e.longitude], { radius: 900, color: col, weight: 0, fillColor: col, fillOpacity: 0.18 }));
      // drainage-network coverage ring per estate
      _layers.net.addLayer(L.circle([e.latitude, e.longitude], { radius: 600, color: '#1cb8e8', weight: 1.5, dashArray: '4 4', fill: false, opacity: 0.6 }));
      const s = 16 + Math.round(e.predicted_risk / 10);
      const border = e.has_live ? '2px solid #fff' : '2px dashed #fff';
      const op = e.has_live ? '1' : '.82';
      const icon = L.divIcon({ className: '', iconSize: [s, s], iconAnchor: [s / 2, s / 2],
        html: `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${col};border:${border};opacity:${op};box-shadow:0 1px 5px rgba(10,42,61,.35);display:flex;align-items:center;justify-content:center;color:#fff;font-size:9px;font-weight:800;">${e.predicted_risk}</div>` });
      const m = L.marker([e.latitude, e.longitude], { icon });
      m.on('click', () => { _sel = e; renderInspector(); });
      _layers.prop.addLayer(m);
      pts.push([e.latitude, e.longitude]);
    });

    // Sentinel devices
    (_md && _md.sensors || []).filter(s => s.latitude && s.longitude).forEach(s => {
      const on = s.status === 'active';
      const c = on ? '#1cb8e8' : '#8aa2ae';
      const icon = L.divIcon({ className: '', iconSize: [12, 12], iconAnchor: [6, 6], html: `<div style="width:12px;height:12px;border-radius:3px;background:${c};border:2px solid #fff;box-shadow:0 1px 3px rgba(10,42,61,.3);"></div>` });
      _layers.dev.addLayer(L.marker([s.latitude, s.longitude], { icon, title: s.name || s.sensor_id }));
    });

    // Incidents (active alerts)
    (_md && _md.alerts || []).filter(a => a.latitude && a.longitude).forEach(a => {
      const c = a.severity === 'critical' ? '#d9463c' : a.severity === 'high' ? '#e08e12' : '#e08e12';
      const icon = L.divIcon({ className: '', iconSize: [14, 14], iconAnchor: [7, 7], html: `<div style="width:14px;height:14px;border-radius:50%;background:${c};border:2px solid #fff;box-shadow:0 0 0 4px ${c}33;"></div>` });
      _layers.inc.addLayer(L.marker([a.latitude, a.longitude], { icon, title: (a.alert_type || 'Alert') + ' · ' + (a.client_name || '') }));
    });

    // Default-on layers
    _layers.heat.addTo(_map);
    _layers.prop.addTo(_map);

    // Never leave the hero map mysteriously blank — say why nothing is drawn.
    const old = document.getElementById('fcx-map-empty');
    if (old) old.remove();
    if (!pts.length) {
      const total = (_fc.estates || []).length;
      const msg = total
        ? 'Properties are scored, but none have coordinates yet. Open a property and use <b>Set location</b> to drop its pin — it will appear here immediately.'
        : 'No properties scored for this window. If Sentinels are stale, the environmental forecast still needs the updated backend deployed.';
      const wrap = holder.parentElement;
      const ov = document.createElement('div');
      ov.id = 'fcx-map-empty';
      ov.style.cssText = 'position:absolute;inset:0;z-index:405;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;pointer-events:none;';
      ov.innerHTML = `<div style="max-width:340px;background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:var(--sh-md);padding:18px 20px;pointer-events:auto;"><div style="font-weight:700;color:var(--ink);margin-bottom:6px;">Nothing to plot yet</div><div style="font-size:var(--fs-sm);color:var(--ink-3);line-height:1.5;">${msg}</div></div>`;
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
  // Real action: schedule a preventive work order for the selected property.
  function act() {
    const e = _sel; if (!e) return;
    const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    OpsModal.open('Create preventive action', `
      <p style="margin:0 0 14px;font-size:var(--fs-sm);color:var(--ink-3);line-height:1.5;">Schedule preventive work for <b style="color:var(--ink);">${esc(e.name || e.property_id)}</b> — ${riskLabel(e.predicted_risk)} forecast risk (${e.predicted_risk}%). This creates a scheduled work order in the Maintenance planner.</p>
      ${OpsModal.field('Work type', 'work_type', 'select', 'silt_clearing', { options: [{ value: 'silt_clearing', label: 'Silt clearing' }, { value: 'inspection', label: 'Inspection' }, { value: 'node_repair', label: 'Node repair' }, { value: 'maintenance', label: 'General maintenance' }] })}
      ${OpsModal.row([
        OpsModal.field('Scheduled date', 'scheduled_date', 'date', tomorrow),
        OpsModal.field('Priority', 'priority', 'select', 'high', { options: ['low', 'normal', 'high', 'urgent'] }),
      ])}
      ${OpsModal.field('Note (optional)', 'title', 'text', '', { required: false, placeholder: 'e.g. Pre-clean ahead of forecast rain' })}
    `, [
      { label: 'Cancel', class: 'btn-ghost', onclick: 'OpsModal.close()' },
      { label: 'Create work order', class: 'btn-primary', onclick: `OpsForecast.confirmAct('${esc(e.property_id)}')`, id: 'modal-save-btn' },
    ]);
  }
  async function confirmAct(pid) {
    const d = OpsModal.getFormData();
    if (!d.scheduled_date) { OpsModal.toast('Pick a scheduled date', 'warning'); return; }
    OpsModal.setLoading('modal-save-btn', true);
    try {
      await OpsModal.apiPost('/tickets/planner', {
        property_id: pid, work_type: d.work_type, priority: d.priority, scheduled_date: d.scheduled_date,
        title: d.title || ('Preventive: ' + String(d.work_type || 'work').replace(/_/g, ' ')),
      });
      OpsModal.close();
      OpsModal.toast('Preventive work order created', 'nominal');
    } catch (err) {
      OpsModal.setLoading('modal-save-btn', false);
      OpsModal.toast(err.message || 'Failed to create work order', 'critical');
    }
  }
  function open(i) { const e = (_fc.estates || [])[i]; if (e && typeof fgOpen === 'function') fgOpen('properties', e.property_id); }
  function back() { render(_root); }

  const STYLES = `<style>
    .fcx { display:flex; flex-direction:column; gap:16px; }
    .fcx-loading { padding:60px; text-align:center; color:var(--ink-3); }
    .fcx-header { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; background:var(--surface); border:1px solid var(--border); border-radius:16px; box-shadow:var(--sh-xs); padding:18px 22px; }
    .fcx-titlerow { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .fcx-title { font-family:var(--ff-d); font-size:var(--fs-xl); font-weight:700; color:var(--ink); line-height:1.1; }
    .fcx-badge { font-size:var(--fs-2xs); font-weight:700; padding:4px 11px; border-radius:20px; background:rgba(28,184,232,.12); color:var(--blue-hi); }
    .fcx-sub { font-size:var(--fs-sm); color:var(--ink-3); margin-top:3px; }
    .fcx-controls { display:flex; align-items:flex-end; gap:10px; flex-wrap:wrap; }
    .fcx-ctl { display:flex; flex-direction:column; gap:4px; font-size:var(--fs-2xs); color:var(--ink-3); font-weight:600; }
    .fcx-select { font-size:var(--fs-sm); padding:8px 11px; border-radius:9px; border:1px solid var(--border-2); background:var(--surface); color:var(--ink); font-family:var(--ff-b); outline:none; }
    .fcx-icon-btn { width:36px; height:36px; border-radius:9px; border:1px solid var(--border-2); background:var(--surface); color:var(--ink-2); cursor:pointer; align-self:flex-end; display:flex; align-items:center; justify-content:center; }
    .fcx-icon-btn svg { width:16px; height:16px; }
    .fcx-icon-btn:hover { border-color:var(--ink-4); color:var(--ink); }

    .fcx-kpis { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; }
    @media (max-width:1100px){ .fcx-kpis{ grid-template-columns:repeat(2,1fr); } }
    .fcx-kpi { background:var(--surface); border:1px solid var(--border); border-radius:14px; box-shadow:var(--sh-xs); padding:15px 17px; }
    .fcx-kpi-label { font-size:var(--fs-2xs); text-transform:uppercase; letter-spacing:.5px; color:var(--ink-3); font-weight:700; margin-bottom:8px; }
    .fcx-kpi-val-row { display:flex; align-items:baseline; gap:8px; }
    .fcx-kpi-val { font-size:22px; font-weight:800; font-family:var(--ff-m); color:var(--ink); }
    .fcx-kpi-unit { font-size:var(--fs-2xs); color:var(--ink-3); font-family:var(--ff-m); }
    .fcx-kpi-delta { font-size:var(--fs-2xs); font-weight:700; margin-left:auto; }
    .fcx-kpi-delta.up { color:var(--err); } .fcx-kpi-delta.down { color:var(--ok); }
    .fcx-kpi-sub { font-size:var(--fs-2xs); color:var(--ink-3); margin-top:3px; }
    .fcx-kpi-spark { height:28px; margin-top:8px; }

    .fcx-map-row { display:grid; grid-template-columns:1fr 320px; gap:16px; align-items:start; }
    @media (max-width:1000px){ .fcx-map-row{ grid-template-columns:1fr; } }
    .fcx-map-wrap { position:relative; height:560px; border-radius:16px; overflow:hidden; border:1px solid var(--border); box-shadow:var(--sh-xs); }
    #fcx-map { position:absolute; inset:0; background:var(--surface-2); }
    /* Zoom control: platform-styled, and sits BEHIND the panels/inspector */
    .fcx-map-wrap .leaflet-bottom { z-index:380; }
    .fcx-map-wrap .leaflet-control-zoom { border:none; box-shadow:var(--sh-md); border-radius:10px; overflow:hidden; margin:0 16px 16px 0; }
    .fcx-map-wrap .leaflet-control-zoom a { width:32px; height:32px; line-height:32px; font-size:17px; color:var(--ink-2); background:var(--surface); border:1px solid var(--border); border-bottom:none; font-family:var(--ff-d); }
    .fcx-map-wrap .leaflet-control-zoom a:first-child { border-radius:10px 10px 0 0; }
    .fcx-map-wrap .leaflet-control-zoom a:last-child { border-radius:0 0 10px 10px; border-bottom:1px solid var(--border); }
    .fcx-map-wrap .leaflet-control-zoom a:hover { background:var(--surface-2); color:var(--blue-hi,#0d7fa0); }
    .fcx-map-wrap .leaflet-control-zoom a.leaflet-disabled { color:var(--ink-4,#9fb0b8); background:var(--surface); }
    .fcx-map-head { position:absolute; top:0; left:0; right:0; z-index:400; display:flex; align-items:center; justify-content:space-between; padding:14px 18px; background:linear-gradient(180deg,rgba(255,255,255,.85),transparent); pointer-events:none; }
    html[data-theme="dark"] .fcx-map-head { background:linear-gradient(180deg,rgba(8,20,27,.88),transparent); }
    .fcx-map-head h2 { font-family:var(--ff-d); font-size:var(--fs-md); font-weight:700; color:var(--ink); }
    .fcx-meta { font-size:var(--fs-2xs); color:var(--ink-3); }
    .fcx-layers { position:absolute; top:52px; left:16px; z-index:410; width:172px; background:var(--surface); border:1px solid var(--border); border-radius:12px; box-shadow:var(--sh-md); padding:7px; }
    .fcx-layer { display:flex; align-items:center; gap:9px; padding:8px 10px; border-radius:8px; font-size:var(--fs-xs); color:var(--ink-2); cursor:pointer; }
    .fcx-layer:hover { background:var(--surface-2); }
    .fcx-layer.active { background:var(--surface-2); color:var(--ink); font-weight:700; }
    .fcx-layer svg { width:14px; height:14px; flex-shrink:0; opacity:.85; }
    .fcx-legend { position:absolute; bottom:14px; left:16px; z-index:410; display:flex; gap:12px; background:var(--surface); border:1px solid var(--border); border-radius:10px; box-shadow:var(--sh-xs); padding:8px 12px; }
    .fcx-legend span { display:inline-flex; align-items:center; gap:5px; font-size:var(--fs-2xs); color:var(--ink-2); font-weight:600; }
    .fcx-legend .sw { width:9px; height:9px; border-radius:3px; }
    .fcx-inspector { position:absolute; top:52px; right:16px; bottom:16px; z-index:410; width:250px; max-height:calc(100% - 68px); background:rgba(255,255,255,.72); backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px); border:1px solid rgba(255,255,255,.6); border-radius:16px; box-shadow:0 8px 30px rgba(10,42,61,.16); padding:16px; display:flex; flex-direction:column; overflow:hidden; }
    .fcx-insp-scroll { flex:1 1 auto; min-height:0; overflow-y:auto; margin:0 -2px; padding:0 2px; }
    .fcx-insp-foot { flex:0 0 auto; padding-top:12px; margin-top:4px; border-top:1px solid rgba(10,42,61,.08); }
    html[data-theme="dark"] .fcx-inspector { border-color:rgba(255,255,255,.14); }
    @media (max-width:560px){ .fcx-inspector { position:static; width:auto; max-height:none; margin:12px; } }
    .fcx-insp-head { display:flex; align-items:center; gap:8px; margin-bottom:10px; flex-shrink:0; }
    .fcx-insp-name { font-size:var(--fs-sm); font-weight:700; color:var(--ink); flex:1; min-width:0; }
    .fcx-insp-x { color:var(--ink-3); cursor:pointer; font-size:16px; line-height:1; }
    .fcx-chip { font-size:var(--fs-2xs); font-weight:700; padding:3px 9px; border-radius:20px; }
    .fcx-chip.high { background:rgba(217,70,60,.12); color:var(--err); }
    .fcx-chip.moderate { background:rgba(224,142,18,.12); color:var(--warn); }
    .fcx-chip.low { background:rgba(31,157,91,.12); color:var(--ok); }
    .fcx-insp-b { padding:10px 0; border-bottom:1px solid var(--border); }
    .fcx-insp-b:last-of-type { border-bottom:none; }
    .fcx-insp-l { font-size:var(--fs-2xs); text-transform:uppercase; letter-spacing:.5px; color:var(--ink-3); font-weight:700; margin-bottom:6px; }
    .fcx-gauge { display:flex; align-items:center; justify-content:space-between; }
    .fcx-gauge .big { font-size:20px; font-weight:800; }
    .fcx-hours { display:flex; gap:8px; }
    .fcx-h { flex:1; text-align:center; background:var(--surface-2); border-radius:8px; padding:7px 4px; }
    .fcx-h .h { font-size:var(--fs-2xs); color:var(--ink-3); }
    .fcx-h .v { font-size:var(--fs-md); font-weight:800; margin-top:2px; }
    .fcx-cap .cap-row { display:flex; justify-content:space-between; font-size:var(--fs-xs); color:var(--ink-2); margin-bottom:5px; }
    .fcx-cap .track { height:6px; border-radius:4px; background:var(--surface-2); overflow:hidden; }
    .fcx-cap .fill { height:100%; border-radius:4px; }
    .fcx-act { font-size:var(--fs-sm); color:var(--ink); font-weight:600; line-height:1.4; }
    .fcx-btn { font-size:var(--fs-sm); font-weight:600; padding:9px 14px; border-radius:10px; cursor:pointer; border:1px solid var(--border-2); background:var(--surface); color:var(--ink-2); }
    .fcx-btn.primary { background:linear-gradient(135deg,#16a8d3,#0d7fa0); color:#fff; border:none; box-shadow:0 4px 14px rgba(22,168,211,.30); }
    .fcx-btn.primary:hover { filter:brightness(1.05); }

    .fcx-side { display:flex; flex-direction:column; gap:16px; }
    .fcx-card { background:var(--surface); border:1px solid var(--border); border-radius:16px; box-shadow:var(--sh-xs); padding:16px 18px; }
    .fcx-card-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
    .fcx-card-head h3 { font-family:var(--ff-d); font-size:var(--fs-md); font-weight:700; color:var(--ink); }
    .fcx-fe { display:flex; gap:11px; padding:11px 0; border-bottom:1px solid var(--border); align-items:flex-start; }
    .fcx-fe:last-child { border-bottom:none; }
    .fcx-fe-ic { width:32px; height:32px; border-radius:9px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .fcx-fe-ic svg { width:15px; height:15px; }
    .fcx-fe-title { font-size:var(--fs-sm); font-weight:700; color:var(--ink); }
    .fcx-fe-desc { font-size:var(--fs-xs); color:var(--ink-3); margin-top:3px; line-height:1.5; }
    .fcx-fe-time { font-size:var(--fs-2xs); color:var(--ink-3); white-space:nowrap; font-weight:700; }
    .fcx-conf-row { display:flex; align-items:center; gap:12px; }
    .fcx-conf-t { font-size:var(--fs-sm); font-weight:700; color:var(--ink); }
    .fcx-conf-s { font-size:var(--fs-2xs); color:var(--ink-3); margin-top:3px; line-height:1.5; }
    .fcx-src-label { font-size:var(--fs-2xs); text-transform:uppercase; letter-spacing:.5px; color:var(--ink-3); font-weight:700; margin:14px 0 6px; }
    .fcx-src { display:flex; gap:8px; flex-wrap:wrap; }
    .fcx-src-ic { width:32px; height:32px; border-radius:9px; background:var(--surface-2); border:1px solid var(--border); display:flex; align-items:center; justify-content:center; color:var(--ink-2); }
    .fcx-src-ic svg { width:15px; height:15px; }
    .fcx-live { display:flex; align-items:center; gap:6px; font-size:var(--fs-2xs); color:var(--ink-3); margin-top:10px; }
    .fcx-live-dot { width:7px; height:7px; border-radius:50%; background:var(--ok); box-shadow:0 0 0 3px rgba(31,157,91,.18); }
    .fcx-checks { display:flex; flex-direction:column; gap:6px; margin-top:12px; }
    .fcx-check { display:flex; align-items:center; gap:8px; font-size:var(--fs-xs); color:var(--ink-2); }
    .fcx-check-m { width:16px; height:16px; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:800; }
    .fcx-check-m.on { background:rgba(31,157,91,.15); color:var(--ok); }
    .fcx-check-m.off { background:var(--surface-2); color:var(--ink-4); }

    /* prediction inputs (explainability) */
    #fcx-inputs { }
    .fcx-inputs-top { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; }
    .fcx-inputs-name { font-size:var(--fs-sm); font-weight:700; color:var(--ink); min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .fcx-inputs-list { display:flex; flex-direction:column; gap:9px; }
    .fcx-ci-top { display:flex; align-items:center; gap:7px; font-size:var(--fs-xs); }
    .fcx-ci-arrow { font-weight:800; }
    .fcx-ci-arrow.up { color:var(--err); } .fcx-ci-arrow.down { color:var(--ok); }
    .fcx-ci-label { color:var(--ink-2); flex:1; min-width:0; }
    .fcx-ci-delta { font-weight:700; font-family:var(--ff-m); font-size:var(--fs-2xs); }
    .fcx-ci-delta.up { color:var(--err); } .fcx-ci-delta.down { color:var(--ok); }
    .fcx-ci-bar { height:5px; border-radius:3px; background:var(--surface-2); overflow:hidden; margin-top:4px; }
    .fcx-ci-fill { height:100%; border-radius:3px; }
    .fcx-ci-fill.up { background:var(--err); opacity:.7; } .fcx-ci-fill.down { background:var(--ok); opacity:.7; }
    .fcx-inputs-foot { font-size:var(--fs-2xs); color:var(--ink-3); margin-top:12px; padding-top:10px; border-top:1px solid var(--border); }
    .fcx-inputs-foot b { color:var(--ink); }

    /* inspector property facts + live/no-live */
    .fcx-pf, .fcx-live-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 10px; }
    .fcx-pf > div, .fcx-live-grid > div { display:flex; flex-direction:column; }
    .fcx-pf .k, .fcx-live-grid .k { font-size:9px; text-transform:uppercase; letter-spacing:.4px; color:var(--ink-3); font-weight:700; }
    .fcx-pf .v, .fcx-live-grid .v { font-size:var(--fs-sm); font-weight:700; color:var(--ink); }
    .fcx-nolive { text-align:center; }
    .fcx-nolive-t { font-size:var(--fs-sm); font-weight:700; color:var(--warn); }
    .fcx-nolive-s { font-size:var(--fs-xs); color:var(--ink-3); margin-top:3px; line-height:1.5; }
    .fcx-livedot { display:inline-block; width:7px; height:7px; border-radius:50%; margin-right:7px; vertical-align:middle; background:transparent; border:1.5px solid var(--ink-4); }
    .fcx-livedot.on { background:var(--ok); border-color:var(--ok); box-shadow:0 0 0 2px rgba(31,157,91,.15); }

    .fcx-charts { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; }
    @media (max-width:1200px){ .fcx-charts{ grid-template-columns:repeat(2,1fr); } }
    @media (max-width:620px){ .fcx-charts{ grid-template-columns:1fr; } }
    .fcx-chart { padding:16px 18px; }
    .fcx-chart-box { height:140px; }
    .fcx-nodata { display:flex; align-items:center; justify-content:center; height:100%; color:var(--ink-3); font-size:var(--fs-sm); }
    .fcx-chart-legend { display:flex; gap:14px; margin-top:8px; font-size:var(--fs-2xs); color:var(--ink-3); }
    .fcx-chart-legend i { width:8px; height:8px; border-radius:2px; display:inline-block; margin-right:5px; }
    .fcx-donut { display:flex; align-items:center; gap:16px; }
    .fcx-donut-legend { flex:1; }
    .fcx-dl { display:flex; justify-content:space-between; font-size:var(--fs-sm); padding:5px 0; color:var(--ink-2); }
    .fcx-dl .sw { width:8px; height:8px; border-radius:2px; display:inline-block; margin-right:6px; }
    .mono { font-family:var(--ff-m); }

    .fcx-tablecard { padding:16px 18px; }
    .fcx-capbar { display:flex; align-items:center; gap:8px; }
    .fcx-capbar .track { width:60px; height:5px; border-radius:3px; background:var(--surface-2); overflow:hidden; }
    .fcx-capbar .fill { height:100%; border-radius:3px; }
    .fcx-tablecard .lv-status.danger { background:rgba(217,70,60,.12); color:var(--err); }
    .fcx-tablecard .lv-status.warn { background:rgba(224,142,18,.12); color:var(--warn); }
    .fcx-tablecard .lv-status.ok { background:rgba(31,157,91,.12); color:var(--ok); }
    .lv-status.high { background:rgba(217,70,60,.12); color:var(--err); }
    .lv-status.moderate { background:rgba(224,142,18,.12); color:var(--warn); }
    .lv-status.low { background:rgba(31,157,91,.12); color:var(--ok); }
  </style>`;

  return { render, setHorizon, layer, select, deselect, act, confirmAct, open, back };

})();
