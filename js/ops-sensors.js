/* ══════════════════════════════════════════════════════════════
   FlowGuard Ops — Sentinel Nodes
   Fleet view of every deployed sensor node: status, battery,
   signal, silt, water level, last ping. Read-only registry.
   ══════════════════════════════════════════════════════════════ */
const OpsSensors = (function () {
  let _all = [];
  let _filter = 'all';
  let _q = '';

  async function render(container) {
    container.innerHTML = `
      <style>
        .sn-kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:14px; }
        .sn-toolbar { display:flex; gap:10px; align-items:center; margin-bottom:12px; flex-wrap:wrap; }
        .sn-chip { padding:6px 13px; border-radius:100px; border:1px solid var(--border-2); background:var(--surface); font-size:.68rem; font-weight:600; color:var(--ink-2); cursor:pointer; user-select:none; }
        .sn-chip.on { background:var(--neon-trace); border-color:var(--blue-dim); color:var(--blue-hi); }
        .sn-search { display:flex; align-items:center; gap:7px; background:var(--surface); border:1px solid var(--border-2); border-radius:9px; padding:7px 12px; width:240px; color:var(--ink-3); margin-left:auto; }
        .sn-search input { flex:1; min-width:0; background:transparent; border:none; outline:none; color:var(--ink); font-size:.76rem; font-family:var(--ff-b); }
        .sn-table-wrap { background:var(--surface); border:1px solid var(--border); border-radius:var(--r); overflow:auto; box-shadow:var(--sh-xs); }
        .sn-table { width:100%; border-collapse:collapse; font-size:.75rem; min-width:820px; }
        .sn-table th { text-align:left; font-size:.58rem; font-weight:800; letter-spacing:1px; text-transform:uppercase; color:var(--ink-3); padding:10px 13px; border-bottom:1px solid var(--border); white-space:nowrap; }
        .sn-table td { padding:10px 13px; border-bottom:1px solid var(--border); color:var(--ink-2); vertical-align:middle; }
        .sn-table tbody tr:last-child td { border-bottom:none; }
        .sn-table tbody tr:hover { background:var(--surface-h); }
        .sn-node { font-weight:600; color:var(--ink); }
        .sn-id { font-family:var(--ff-m); font-size:.64rem; color:var(--ink-3); }
        .sn-st { display:inline-flex; align-items:center; gap:6px; padding:3px 9px; border-radius:100px; font-size:.6rem; font-weight:800; letter-spacing:.6px; text-transform:uppercase; }
        .sn-st i { width:6px; height:6px; border-radius:50%; background:currentColor; box-shadow:0 0 5px currentColor; }
        .sn-bar { display:inline-block; width:52px; height:5px; border-radius:3px; background:var(--surface-3); vertical-align:middle; margin-right:7px; overflow:hidden; }
        .sn-bar i { display:block; height:100%; border-radius:3px; }
        .sn-mono { font-family:var(--ff-m); font-size:.7rem; }
        .sn-empty { padding:40px; text-align:center; color:var(--ink-3); font-size:.8rem; }
      </style>
      <div class="sn-kpis" id="sn-kpis"></div>
      <div class="sn-toolbar" id="sn-toolbar"></div>
      <div class="sn-table-wrap" id="sn-body"><div class="sn-empty">Loading node fleet…</div></div>
    `;
    await load();
  }

  async function load() {
    try {
      // real node fleet with latest readings (map-data's "sensors" are client sites)
      const r = await OpsModal.apiGet('/monitoring/sensors/all');
      _all = r.data || [];
      draw();
    } catch (err) {
      document.getElementById('sn-body').innerHTML =
        `<div class="sn-empty">Couldn't load the node fleet — ${err.message || 'network error'}.</div>`;
    }
  }

  function draw() {
    const el = document.getElementById('sn-body');
    const kp = document.getElementById('sn-kpis');
    const tb = document.getElementById('sn-toolbar');
    if (!el) return;

    const total = _all.length;
    const online = _all.filter(x => x.status === 'active').length;
    const maint = _all.filter(x => x.status === 'maintenance').length;
    const offline = total - online - maint;
    const battKnown = _all.some(x => x.battery_percent != null);
    const lowBatt = _all.filter(x => x.battery_percent != null && x.battery_percent < 20).length;

    kp.innerHTML = `
      <div class="ck"><div class="ck-label">Fleet size</div><div class="ck-val">${total}</div><div class="ck-sub">Deployed nodes</div></div>
      <div class="ck"><div class="ck-label">Online</div><div class="ck-val">${online}</div><div class="ck-sub ${online === total && total ? 'ok' : ''}">${total ? Math.round(online / total * 100) + '% reporting' : '—'}</div></div>
      <div class="ck"><div class="ck-label">Offline / maintenance</div><div class="ck-val">${offline + maint}</div><div class="ck-sub ${offline ? 'err' : ''}">${offline} offline · ${maint} maintenance</div></div>
      <div class="ck"><div class="ck-label">Low battery</div><div class="ck-val">${battKnown ? lowBatt : '—'}</div><div class="ck-sub ${lowBatt ? 'warn' : ''}">${battKnown ? 'Below 20%' : 'Not reported by fleet yet'}</div></div>
    `;

    const chips = [
      ['all', `All (${total})`], ['active', `Online (${online})`],
      ['offline', `Offline (${offline})`], ['maintenance', `Maintenance (${maint})`],
      ['lowbatt', `Low battery (${battKnown ? lowBatt : 0})`],
    ];
    tb.innerHTML = chips.map(([k, l]) =>
      `<span class="sn-chip ${_filter === k ? 'on' : ''}" onclick="OpsSensors.setFilter('${k}')">${l}</span>`).join('') + `
      <span class="sn-search">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input placeholder="Search nodes…" value="${_q.replace(/"/g, '&quot;')}" oninput="OpsSensors.setQuery(this.value)">
      </span>`;

    let rows = _all;
    if (_filter === 'active') rows = rows.filter(x => x.status === 'active');
    else if (_filter === 'offline') rows = rows.filter(x => x.status !== 'active' && x.status !== 'maintenance');
    else if (_filter === 'maintenance') rows = rows.filter(x => x.status === 'maintenance');
    else if (_filter === 'lowbatt') rows = rows.filter(x => x.battery_percent != null && x.battery_percent < 20);
    if (_q) {
      const q = _q.toLowerCase();
      rows = rows.filter(x => `${x.name || ''} ${x.sensor_id || ''} ${x.site_name || ''} ${x.client_name || ''} ${x.property_name || ''}`.toLowerCase().includes(q));
    }

    if (!rows.length) {
      el.innerHTML = `<div class="sn-empty">${total ? 'No nodes match this filter.' : 'No Sentinel nodes deployed yet — nodes appear here once registered against a client.'}</div>`;
      return;
    }

    const stChip = st => {
      const m = {
        active: ['var(--ok)', 'Online'],
        maintenance: ['var(--warn)', 'Maintenance'],
      };
      const [c, l] = m[st] || ['var(--err)', 'Offline'];
      return `<span class="sn-st" style="color:${c};background:${c}18;border:1px solid ${c}40"><i></i>${l}</span>`;
    };
    const bar = (v, warnAt, alertAt, invert) => {
      if (v == null) return '<span class="sn-mono">—</span>';
      const bad = invert ? v <= alertAt : v >= alertAt;
      const mid = invert ? v <= warnAt : v >= warnAt;
      const c = bad ? 'var(--err)' : mid ? 'var(--warn)' : 'var(--ok)';
      return `<span class="sn-bar"><i style="width:${Math.max(2, Math.min(100, v))}%;background:${c}"></i></span><span class="sn-mono">${v}%</span>`;
    };
    const rel = ts => {
      if (!ts) return '—';
      try {
        const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
        if (m < 1) return 'now';
        if (m < 60) return m + 'm ago';
        if (m < 1440) return Math.floor(m / 60) + 'h ago';
        return Math.floor(m / 1440) + 'd ago';
      } catch (_) { return '—'; }
    };

    el.innerHTML = `<table class="sn-table">
      <thead><tr>
        <th>Node</th><th>Deployment</th><th>Status</th><th>Water level</th>
        <th>Flow</th><th>Battery</th><th>Signal</th><th>Last ping</th>
      </tr></thead>
      <tbody>${rows.map(x => `
        <tr>
          <td><div class="sn-node">${esc(x.name || x.sensor_id || 'Node')}</div><div class="sn-id">${esc(x.sensor_id || '')}</div></td>
          <td>${esc(x.client_name || x.zone || '—')}</td>
          <td>${stChip(x.status)}</td>
          <td>${x.level != null ? bar(Math.round(x.level), 50, 70) : '<span class="sn-mono">—</span>'}</td>
          <td class="sn-mono">${x.flow_rate != null ? x.flow_rate.toFixed(1) + ' L/s' : '—'}</td>
          <td>${bar(x.battery_percent != null ? Math.round(x.battery_percent) : null, 40, 20, true)}</td>
          <td>${x.signal_strength != null ? bar(Math.round(x.signal_strength), 60, 35, true) : '<span class="sn-mono">—</span>'}</td>
          <td class="sn-mono">${rel(x.reading_time || x.last_ping)}</td>
        </tr>`).join('')}
      </tbody></table>`;
  }

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function setFilter(f) { _filter = f; draw(); }
  function setQuery(q) { _q = q; draw(); }

  return { render, setFilter, setQuery };
})();
