/* ══════════════════════════════════════════════════════════════
   FlowGuard Ops — AI RISK FORECAST
   IMPORTANT — read before touching the numbers on this screen:
   this is NOT a trained machine-learning model. It's a documented,
   rule-based blend of (1) each estate's current sensor-derived risk
   and (2) an Open-Meteo rainfall forecast for Lagos, weighted 55/45
   (see backend/utils/riskForecast.js). Every label on this screen
   says so explicitly — "Model Confidence" would be a lie, so this
   shows "Data Coverage" (how many Sentinels are actually reporting)
   instead. Don't add fabricated confidence intervals, historical
   accuracy claims, or anything else this system doesn't actually
   compute.
   ══════════════════════════════════════════════════════════════ */
const OpsForecast = (function () {
  let _horizon = 'tomorrow';
  let _data = null;

  async function render(container) {
    container.innerHTML = styles() + shell();
    await load();
  }

  async function load() {
    const body = document.getElementById('fc-body');
    try {
      const res = await OpsModal.apiGet(`/forecast?horizon=${_horizon}`);
      _data = res.data;
      draw();
    } catch (err) {
      if (body) body.innerHTML = `<div class="fc-empty">Couldn't build the forecast — ${esc(err.message || 'network error')}.</div>`;
    }
  }

  function setHorizon(h) {
    if (h === _horizon) return;
    _horizon = h;
    document.querySelectorAll('.fc-htab').forEach(b => b.classList.toggle('active', b.dataset.h === h));
    const body = document.getElementById('fc-body');
    if (body) body.innerHTML = '<div class="fc-empty">Rebuilding the forecast…</div>';
    load();
  }

  function draw() {
    const body = document.getElementById('fc-body');
    if (!body || !_data) return;
    const d = _data;
    const estates = d.estates || [];
    const avgPredicted = estates.length ? Math.round(estates.reduce((s, e) => s + e.predicted_risk, 0) / estates.length) : null;
    const avgCurrent = estates.length ? Math.round(estates.reduce((s, e) => s + e.current_risk, 0) / estates.length) : null;
    const avgCoverage = estates.length ? Math.round(estates.reduce((s, e) => s + e.data_coverage, 0) / estates.length) : null;
    const worst = estates.length ? estates[0] : null; // already sorted desc by predicted_risk
    const trendDelta = avgPredicted != null && avgCurrent != null ? avgPredicted - avgCurrent : null;

    body.innerHTML = `
      <div class="fc-method">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        <div>
          <b>Not a trained model.</b> ${esc(d.method)}
          ${!d.has_rainfall_data ? ' <span class="fc-warn-inline">Rainfall forecast unavailable right now — showing sensor-only risk.</span>' : ''}
        </div>
      </div>

      <div class="fc-kpis">
        ${OpsModal.kpiStrip([
          { label: `Network Risk (${_horizon === 'today' ? 'Today' : 'Tomorrow'})`, value: avgPredicted != null ? avgPredicted : '—',
            sub: trendDelta != null ? (trendDelta > 0 ? `+${trendDelta} vs current` : trendDelta < 0 ? `${trendDelta} vs current` : 'No change vs current') : '—',
            subClass: trendDelta > 5 ? 'err' : trendDelta < -5 ? 'ok' : '' },
          { label: 'Current Network Risk', value: avgCurrent != null ? avgCurrent : '—', sub: 'Live sensor readings' },
          { label: 'Forecast Rainfall', value: d.has_rainfall_data ? `${d.cumulative_rain_mm} mm` : '—', sub: d.has_rainfall_data ? `Lagos, next ${_horizon === 'today' ? '24h' : '24-48h'}` : 'Forecast unavailable' },
          { label: 'Avg. Data Coverage', value: avgCoverage != null ? `${avgCoverage}%` : '—', sub: 'Sentinels reporting, not statistical confidence' },
        ])}
      </div>

      ${worst && worst.predicted_risk >= 50 ? `
        <div class="fc-alert-band ${worst.predicted_risk >= 70 ? 'critical' : 'warn'}">
          <b>${esc(worst.name)}</b> has the highest projected risk (${worst.predicted_risk}/100) — ${esc(worst.recommendation)}
        </div>` : ''}

      <div class="fc-chart-card">
        <div class="fc-card-h">Network Risk Index — ${_horizon === 'today' ? 'next 24h' : '24–48h out'}</div>
        ${d.series && d.series.length ? seriesChart(d.series) : '<div class="fc-chart-empty">No hourly rainfall series available for this window.</div>'}
      </div>

      <div class="fc-table-card">
        <div class="fc-card-h">Estate-Level Forecast</div>
        <table class="fc-table">
          <thead><tr>
            <th>Estate</th><th>Current</th><th>Predicted</th><th>Δ</th><th>Coverage</th><th>Recommendation</th>
          </tr></thead>
          <tbody>
            ${estates.length ? estates.map(estateRow).join('') : `<tr><td colspan="6" class="fc-table-empty">No estates have recent sensor readings to project from.</td></tr>`}
          </tbody>
        </table>
      </div>`;
  }

  function estateRow(e) {
    const rc = e.predicted_risk >= 70 ? 'var(--err)' : e.predicted_risk >= 50 ? 'var(--warn)' : 'var(--ok)';
    const deltaCol = e.delta > 5 ? 'var(--err)' : e.delta < -5 ? 'var(--ok)' : 'var(--ink-3)';
    const recCol = e.recommendation_level === 'critical' ? 'var(--err)' : e.recommendation_level === 'warning' ? 'var(--warn)' : 'var(--ink-3)';
    return `
      <tr>
        <td><b>${esc(e.name)}</b></td>
        <td class="fc-num">${e.current_risk}</td>
        <td class="fc-num"><span class="fc-risk-pill" style="color:${rc};background:${rc}18;">${e.predicted_risk}</span></td>
        <td class="fc-num" style="color:${deltaCol};">${e.delta > 0 ? '+' : ''}${e.delta}</td>
        <td class="fc-num">${e.data_coverage}%</td>
        <td style="color:${recCol};font-weight:600;">${esc(e.recommendation)}</td>
      </tr>`;
  }

  function seriesChart(series) {
    const w = 900, h = 160, pad = 28;
    const max = Math.max(100, ...series.map(s => s.risk));
    const stepX = (w - pad * 2) / Math.max(1, series.length - 1);
    const pts = series.map((s, i) => {
      const x = pad + i * stepX;
      const y = h - pad - (s.risk / max) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const area = `${pad},${h - pad} ${pts} ${(pad + (series.length - 1) * stepX).toFixed(1)},${h - pad}`;
    const rainMax = Math.max(1, ...series.map(s => s.rainfall));
    const bars = series.map((s, i) => {
      const x = pad + i * stepX;
      const bh = (s.rainfall / rainMax) * (h - pad * 2) * 0.35;
      return `<rect x="${(x - 1.5).toFixed(1)}" y="${(h - pad - bh).toFixed(1)}" width="3" height="${bh.toFixed(1)}" fill="var(--blue-dim)" opacity=".45"/>`;
    }).join('');
    return `
      <svg viewBox="0 0 ${w} ${h}" class="fc-svg" preserveAspectRatio="none">
        ${bars}
        <polygon points="${area}" fill="var(--blue-dim)" opacity=".12"/>
        <polyline points="${pts}" fill="none" stroke="var(--blue-hi)" stroke-width="2"/>
      </svg>
      <div class="fc-chart-legend"><span><i style="background:var(--blue-hi)"></i>Risk index</span><span><i style="background:var(--blue-dim);opacity:.45"></i>Forecast rainfall</span></div>`;
  }

  function shell() {
    return `
      <div class="fc-head">
        <div class="fc-head-title">
          <h2>AI Risk Forecast</h2>
          <span>Rule-based projection, not a trained model — see methodology note below</span>
        </div>
        <div class="fc-htabs">
          <button class="fc-htab active" data-h="today" onclick="OpsForecast.setHorizon('today')">Today</button>
          <button class="fc-htab" data-h="tomorrow" onclick="OpsForecast.setHorizon('tomorrow')">Tomorrow</button>
          <button class="fc-htab disabled" disabled title="Not available — this projection only extends 48h ahead">48H</button>
          <button class="fc-htab disabled" disabled title="Not available — this projection only extends 48h ahead">7 Days</button>
          <button class="fc-htab disabled" disabled title="Not available — this projection only extends 48h ahead">30 Days</button>
        </div>
      </div>
      <div id="fc-body"><div class="fc-empty">Building the forecast…</div></div>`;
  }

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function styles() {
    return `<style>
      .fc-head { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom:14px; flex-wrap:wrap; }
      .fc-head-title h2 { margin:0; font-size:var(--fs-xl); font-weight:700; color:var(--ink); }
      .fc-head-title span { font-size:var(--fs-xs); color:var(--ink-3); }
      .fc-htabs { display:flex; gap:4px; background:var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:3px; }
      .fc-htab { padding:7px 14px; border-radius:7px; border:none; background:transparent; color:var(--ink-3); font-size:var(--fs-xs); font-weight:700; font-family:var(--ff-b); cursor:pointer; }
      .fc-htab.active { background:var(--surface); color:var(--blue-hi); box-shadow:var(--sh-xs); }
      .fc-htab.disabled { opacity:.4; cursor:not-allowed; }

      .fc-method { display:flex; align-items:flex-start; gap:10px; background:var(--neon-trace); border:1px solid var(--blue-dim); border-radius:11px; padding:12px 14px; margin-bottom:14px; font-size:var(--fs-xs); color:var(--ink-2); line-height:1.6; }
      .fc-method svg { width:16px; height:16px; flex-shrink:0; margin-top:1px; color:var(--blue-hi); }
      .fc-method b { color:var(--ink); }
      .fc-warn-inline { color:var(--warn); font-weight:600; }

      .fc-kpis { margin-bottom:14px; }

      .fc-alert-band { padding:11px 15px; border-radius:11px; font-size:var(--fs-sm); margin-bottom:14px; }
      .fc-alert-band.warn { background:var(--wb); border:1px solid var(--warn); color:var(--warn); }
      .fc-alert-band.critical { background:var(--eb); border:1px solid var(--err); color:var(--err); }
      .fc-alert-band b { color:inherit; }

      .fc-chart-card, .fc-table-card { background:var(--surface); border:1px solid var(--border); border-radius:13px; overflow:hidden; margin-bottom:14px; }
      .fc-card-h { padding:12px 15px; border-bottom:1px solid var(--border); font-size:var(--fs-xs); font-weight:700; letter-spacing:.6px; text-transform:uppercase; color:var(--ink-3); }
      .fc-svg { width:100%; height:160px; display:block; }
      .fc-chart-empty { padding:30px; text-align:center; color:var(--ink-3); font-size:var(--fs-sm); }
      .fc-chart-legend { display:flex; gap:16px; padding:8px 15px 12px; font-size:var(--fs-2xs); color:var(--ink-3); }
      .fc-chart-legend span { display:inline-flex; align-items:center; gap:5px; }
      .fc-chart-legend i { width:8px; height:8px; border-radius:2px; display:inline-block; }

      .fc-table { width:100%; border-collapse:collapse; }
      .fc-table th { text-align:left; padding:9px 15px; font-size:var(--fs-2xs); font-weight:700; letter-spacing:.5px; text-transform:uppercase; color:var(--ink-3); border-bottom:1px solid var(--border); background:var(--surface-2); }
      .fc-table td { padding:10px 15px; font-size:var(--fs-sm); color:var(--ink-2); border-bottom:1px solid var(--border); }
      .fc-table tr:last-child td { border-bottom:none; }
      .fc-num { font-family:var(--ff-m); }
      .fc-risk-pill { padding:2px 9px; border-radius:100px; font-weight:700; }
      .fc-table-empty { text-align:center; color:var(--ink-3); padding:24px; }

      .fc-empty { padding:40px; text-align:center; color:var(--ink-3); font-size:var(--fs-base); line-height:1.7; background:var(--surface); border:1px solid var(--border); border-radius:14px; }
    </style>`;
  }

  return { render, setHorizon };
})();
