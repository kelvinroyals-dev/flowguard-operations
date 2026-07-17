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

  let _root = null, _fc = null, _kpis = null, _map = null, _horizon = 'today', _sel = null;

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
      const [fcRes, kpiRes] = await Promise.all([
        OpsModal.apiGet(`/forecast?horizon=${_horizon}`),
        OpsModal.apiGet('/analytics/kpis').catch(() => ({ data: {} })),
      ]);
      _fc = fcRes.data || {};
      _kpis = kpiRes.data || {};
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
    const rainMax = Math.max(100, Math.ceil((Math.max(0, ...(rainVals.length ? rainVals : [0])) + 5) / 25) * 25);

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
      ${kpi('Network capacity', capacity, '%', `Drain headroom · ${avgCur}% avg load`, riskVals.map(v => 100 - v), '#1f9d5b', null)}
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

    const cov = total ? Math.round(est.reduce((s, e) => s + (e.data_coverage || 0), 0) / total) : 0;
    const confLvl = cov >= 75 ? 'High' : cov >= 45 ? 'Medium' : 'Low';
    const confCard = `
      <div class="fcx-card">
        <div class="fcx-card-head"><h3>Model confidence</h3></div>
        <div class="fcx-conf-row">
          ${ring(cov, riskHex(100 - cov))}
          <div><div class="fcx-conf-t">${confLvl} confidence</div><div class="fcx-conf-s">Rule-based blend of live sensor trend and Open-Meteo rainfall — not a trained model. Coverage reflects how many Sentinels are reporting.</div></div>
        </div>
        <div class="fcx-src-label">Data sources</div>
        <div class="fcx-src">
          <span class="fcx-src-ic" title="Sentinel telemetry">${ICON.dev}</span>
          <span class="fcx-src-ic" title="Rainfall (Open-Meteo)">${ICON.rain}</span>
          <span class="fcx-src-ic" title="Drainage network">${ICON.net}</span>
          <span class="fcx-src-ic" title="Alerts">${ICON.inc}</span>
        </div>
        <div class="fcx-live"><span class="fcx-live-dot"></span>Live · updated ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
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
        <thead><tr><th>Property</th><th>Current risk</th><th>Forecast (24h)</th><th>Rain ETA</th><th>Drain capacity</th><th>Status</th><th>Recommendation</th></tr></thead>
        <tbody>${topEst.length ? topEst.map(e => {
          const st = e.recommendation_level === 'critical' ? { c: 'danger', l: 'Dispatch' } : e.recommendation_level === 'warning' ? { c: 'warn', l: 'Preventive' } : { c: 'ok', l: 'Monitoring' };
          const capp = Math.max(0, 100 - e.current_risk);
          return `<tr class="clickable" onclick="fgOpen('properties','${esc(e.property_id)}')">
            <td>${OpsModal.link('properties', e.property_id, e.name || e.property_id)}</td>
            <td><span class="lv-status ${riskChipCls(e.current_risk)}">${e.current_risk} · ${riskLabel(e.current_risk)}</span></td>
            <td><span class="lv-status ${riskChipCls(e.predicted_risk)}">${e.predicted_risk} · ${riskLabel(e.predicted_risk)}</span></td>
            <td class="lv-mono">${rainEta(series)}</td>
            <td><div class="fcx-capbar"><div class="track"><div class="fill" style="width:${capp}%;background:${riskColor(e.current_risk)};"></div></div><span class="lv-mono">${capp}%</span></div></td>
            <td><span class="lv-status ${st.c}">${st.l}</span></td>
            <td style="color:var(--ink-3);font-size:var(--fs-xs);">${esc((e.recommendation || '').slice(0, 42))}</td>
          </tr>`;
        }).join('') : '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--ink-3);">No estates are reporting enough telemetry to score yet.</td></tr>'}</tbody>
      </table></div>
    </div>`;

    const modelOpts = ['FG-AI v2.4 (rule-based)'].map(o => `<option>${o}</option>`).join('');
    const rangeOpts = [['today', 'Next 24 hours'], ['tomorrow', 'Tomorrow (24–48h)']].map(([v, l]) => `<option value="${v}" ${v === _horizon ? 'selected' : ''}>${l}</option>`).join('');

    _root.innerHTML = STYLES + `
      <div class="fcx">
        <div class="fcx-header">
          <div><div class="fcx-title">AI Risk Forecast</div><div class="fcx-sub">Predictive flood intelligence across the FlowGuard drainage network.</div></div>
          <div class="fcx-controls">
            <label class="fcx-ctl"><span>Forecast model</span><select class="fcx-select">${modelOpts}</select></label>
            <label class="fcx-ctl"><span>Time range</span><select class="fcx-select" onchange="OpsForecast.setHorizon(this.value)">${rangeOpts}</select></label>
            <button class="fcx-icon-btn" title="Refresh" onclick="reloadTab('forecast')">${ICON.refresh}</button>
          </div>
        </div>
        ${kpis}
        <div class="fcx-map-row">
          <div class="fcx-map-wrap">
            <div class="fcx-map-head"><h2>Risk heatmap</h2><span class="fcx-meta">${total} estate${total === 1 ? '' : 's'} scored · Lagos drainage network</span></div>
            <div id="fcx-map"></div>
            <div class="fcx-layers">
              <div class="fcx-layer active" data-l="heat" onclick="OpsForecast.layer('heat',this)">${ICON.heat}<span>Risk heatmap</span></div>
              <div class="fcx-layer" data-l="rain" onclick="OpsForecast.layer('rain',this)">${ICON.rain}<span>Rainfall</span></div>
              <div class="fcx-layer" data-l="net" onclick="OpsForecast.layer('net',this)">${ICON.net}<span>Drainage network</span></div>
              <div class="fcx-layer active" data-l="prop" onclick="OpsForecast.layer('prop',this)">${ICON.prop}<span>Properties</span></div>
              <div class="fcx-layer" data-l="dev" onclick="OpsForecast.layer('dev',this)">${ICON.dev}<span>Sentinel devices</span></div>
              <div class="fcx-layer" data-l="team" onclick="OpsForecast.layer('team',this)">${ICON.team}<span>Teams</span></div>
              <div class="fcx-layer" data-l="inc" onclick="OpsForecast.layer('inc',this)">${ICON.inc}<span>Incidents</span></div>
            </div>
            <div class="fcx-legend"><span><span class="sw" style="background:#1f9d5b"></span>Low</span><span><span class="sw" style="background:#e08e12"></span>Medium</span><span><span class="sw" style="background:#d9463c"></span>High</span></div>
            <div id="fcx-inspector" class="fcx-inspector"></div>
          </div>
          <div class="fcx-side">${eventsCard}${confCard}</div>
        </div>
        ${charts}
        ${table}
      </div>`;

    renderInspector();
  }

  function renderInspector() {
    const el = document.getElementById('fcx-inspector');
    if (!el) return;
    const e = _sel;
    if (!e) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const cur = e.current_risk, pred = e.predicted_risk;
    const at = f => Math.round(cur + (pred - cur) * f);
    const cap = Math.max(0, 100 - cur);
    el.innerHTML = `
      <div class="fcx-insp-head"><span class="fcx-insp-name">${esc(e.name || e.property_id)}</span><span class="fcx-chip ${riskChipCls(pred)}">${riskLabel(pred)} risk</span><span class="fcx-insp-x" onclick="OpsForecast.deselect()">&times;</span></div>
      <div class="fcx-insp-b"><div class="fcx-insp-l">Current risk</div><div class="fcx-gauge"><span class="big" style="color:${riskColor(cur)}">${cur}</span>${ringMini(cur, riskHex(cur))}</div></div>
      <div class="fcx-insp-b"><div class="fcx-insp-l">Forecast risk</div><div class="fcx-hours"><div class="fcx-h"><div class="h">6h</div><div class="v" style="color:${riskColor(at(.25))}">${at(.25)}%</div></div><div class="fcx-h"><div class="h">12h</div><div class="v" style="color:${riskColor(at(.5))}">${at(.5)}%</div></div><div class="fcx-h"><div class="h">24h</div><div class="v" style="color:${riskColor(pred)}">${pred}%</div></div></div></div>
      <div class="fcx-insp-b"><div class="fcx-insp-l">Drain headroom</div><div class="fcx-cap"><div class="cap-row"><span>Capacity</span><span class="mono">${cap}%</span></div><div class="track"><div class="fill" style="width:${cap}%;background:${riskColor(cur)}"></div></div></div></div>
      <div class="fcx-insp-b"><div class="fcx-insp-l">Sentinels reporting</div><div style="font-size:var(--fs-sm);font-weight:700;color:var(--ink);">${e.sensor_count || 0} node${e.sensor_count === 1 ? '' : 's'} · ${e.data_coverage || 0}% coverage</div></div>
      <div class="fcx-insp-b"><div class="fcx-insp-l">Recommended action</div><div class="fcx-act">${e.recommendation_level === 'ok' ? '✓' : '!'} ${esc(e.recommendation || 'Monitor as usual')}</div></div>
      <button class="fcx-btn primary" style="width:100%;margin-top:12px;" onclick="OpsForecast.act()">Create preventive action</button>`;
  }

  function buildEvents(est, series) {
    const out = [];
    const rainVals = series.map(h => h.rainfall || 0);
    let peakI = 0; rainVals.forEach((v, i) => { if (v > rainVals[peakI]) peakI = i; });
    if (rainVals.length && rainVals[peakI] >= 5) out.push({ icon: ICON.rain, bg: 'rgba(217,70,60,.12)', color: '#d9463c', title: 'Heavy rain expected', desc: `${Math.round(rainVals[peakI])}mm forecast around +${peakI}h.`, time: `+${peakI}h` });
    const worst = est[0];
    if (worst && worst.predicted_risk >= 60) out.push({ icon: ICON.cap, bg: 'rgba(224,142,18,.12)', color: '#e08e12', title: 'Capacity threshold', desc: `${worst.name} forecast to reach ${worst.predicted_risk}% risk.`, time: 'soon' });
    const prev = est.filter(e => e.recommendation_level === 'warning');
    if (prev.length) out.push({ icon: ICON.inc, bg: 'rgba(224,142,18,.12)', color: '#e08e12', title: 'Preventive cleaning due', desc: `${prev.length} propert${prev.length === 1 ? 'y' : 'ies'} recommended for pre-cleaning.`, time: '12h' });
    const crit = est.filter(e => e.recommendation_level === 'critical');
    if (crit.length) out.push({ icon: ICON.crew, bg: 'rgba(28,184,232,.12)', color: '#1cb8e8', title: 'Crew recommended', desc: `Deploy crews to ${crit.slice(0, 2).map(e => e.name).join(', ')}${crit.length > 2 ? ' +' + (crit.length - 2) : ''}.`, time: 'now' });
    return out;
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
    L.tileLayer(tileUrl(), { subdomains: 'abcd', maxZoom: 19 }).addTo(_map);
    const pts = [];
    est.forEach(e => {
      const col = riskHex(e.predicted_risk);
      L.circle([e.latitude, e.longitude], { radius: 900, color: col, weight: 0, fillColor: col, fillOpacity: 0.18 }).addTo(_map);
      const s = 16 + Math.round(e.predicted_risk / 10);
      const icon = L.divIcon({ className: '', iconSize: [s, s], iconAnchor: [s / 2, s / 2],
        html: `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${col};border:2px solid #fff;box-shadow:0 1px 5px rgba(10,42,61,.35);display:flex;align-items:center;justify-content:center;color:#fff;font-size:9px;font-weight:800;">${e.predicted_risk}</div>` });
      const m = L.marker([e.latitude, e.longitude], { icon }).addTo(_map);
      m.on('click', () => { _sel = e; renderInspector(); });
      pts.push([e.latitude, e.longitude]);
    });
    if (pts.length) { try { _map.fitBounds(pts, { padding: [60, 60], maxZoom: 13 }); } catch (_) {} }
    if (window.ResizeObserver) new ResizeObserver(() => { try { _map.invalidateSize(); } catch (_) {} }).observe(holder);
  }

  // ── interactions ───────────────────────────────────────────────────────
  function setHorizon(h) { _horizon = h; _sel = null; render(_root); }
  function layer(key, elx) {
    if (elx) elx.classList.toggle('active');
    if (key !== 'heat' && key !== 'prop') OpsModal.toast('That map layer isn’t wired to live data yet.', 'watch');
  }
  function deselect() { _sel = null; renderInspector(); }
  function act() { OpsModal.toast('Preventive-action workflow isn’t wired to a backend yet.', 'watch'); }
  function open(i) { const e = (_fc.estates || [])[i]; if (e && typeof fgOpen === 'function') fgOpen('properties', e.property_id); }
  function back() { render(_root); }

  const STYLES = `<style>
    .fcx { display:flex; flex-direction:column; gap:16px; }
    .fcx-loading { padding:60px; text-align:center; color:var(--ink-3); }
    .fcx-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap; }
    .fcx-title { font-family:var(--ff-d); font-size:var(--fs-xl); font-weight:700; color:var(--ink); line-height:1.1; }
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
    .fcx-map-head { position:absolute; top:0; left:0; right:0; z-index:400; display:flex; align-items:center; justify-content:space-between; padding:14px 18px; background:linear-gradient(180deg,rgba(255,255,255,.85),transparent); pointer-events:none; }
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
    .fcx-inspector { position:absolute; top:52px; right:16px; bottom:16px; z-index:410; width:250px; background:var(--surface); border:1px solid var(--border); border-radius:14px; box-shadow:var(--sh-md); padding:15px; overflow-y:auto; }
    .fcx-insp-head { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
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
    .fcx-btn { font-size:var(--fs-sm); font-weight:600; padding:9px 14px; border-radius:9px; cursor:pointer; border:1px solid var(--border-2); background:var(--surface); color:var(--ink-2); }
    .fcx-btn.primary { background:var(--blue-hi); color:#fff; border:none; }

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

  return { render, setHorizon, layer, deselect, act, open, back };

})();
