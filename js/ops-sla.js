// ============================================
// OPS SLA TRACKER MODULE v1.0.0
// Per-client SLA compliance, breach detection,
// response time analytics
//
// API contracts expected:
//   GET /sla/summary   → { overall_compliance, avg_response_min, breaches_this_month,
//                          resolved_on_time, total_incidents,
//                          clients: [{ client_id, client_name, compliance_pct,
//                                      avg_response_min, breaches, sla_target_min }] }
//   GET /sla/breaches  → { data: [Breach] }
//   POST /sla/breaches/:id/acknowledge
// ============================================

const OpsSLA = (function () {
  'use strict';

  let _clients  = [];
  let _breaches = [];
  let _pg       = null;
  let _container = null;
  let _term = '', _coverage = 'all';
  const _dash = v => (v == null || v === '') ? OpsModal.missing.absent : v;
  const esc = v => OpsModal.escape(v);
  const validPercent = value => value == null || value === '' || typeof value === 'boolean' || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100 ? null : Number(value);
  const reportedMetric = c => ({value:validPercent(c.uptime), name:'Reported uptime'});

  function render(container) {
    _container = container;
    container.innerHTML = `


      ${OpsModal.pageHeader({title:'Service performance',subtitle:'Review reported service metrics and recorded breaches'})}
      <div class="sla-kpis">
        <div class="sla-kpi green">
          <div class="sla-kpi-label">Recorded uptime</div>
          <div class="sla-kpi-val green" id="sla-compliance">—</div>
          <div class="sla-kpi-sub">Current month · recorded average</div>
        </div>
        <div class="sla-kpi blue">
          <div class="sla-kpi-label">Average response time</div>
          <div class="sla-kpi-val" id="sla-response">—</div>
          <div class="sla-kpi-sub">Current month · reported minutes</div>
        </div>
        <div class="sla-kpi red">
          <div class="sla-kpi-label">Recorded breaches</div>
          <div class="sla-kpi-val red" id="sla-breaches">—</div>
          <div class="sla-kpi-sub" id="sla-breach-sub">Unacknowledged</div>
        </div>
      </div>

      <div class="sla-grid">
        <!-- Per-client compliance table -->
        <div class="sla-card">
          <div class="sla-card-head">
            <h2 class="sla-card-title">Client service metrics</h2>
          </div>
          <div class="lv-toolbar"><div class="lv-search"><input aria-label="Search service-performance clients" placeholder="Search clients…" value="${esc(_term)}" oninput="OpsSLA.filterClients(this.value)"></div><div class="lv-toolbar-right"><select class="um-filter" aria-label="Service metric coverage" onchange="OpsSLA.filterClients(null,this.value)"><option value="all" ${_coverage==='all'?'selected':''}>All clients</option><option value="recorded" ${_coverage==='recorded'?'selected':''}>With recorded uptime</option><option value="missing" ${_coverage==='missing'?'selected':''}>Uptime not supplied</option></select></div></div>
          <div id="sla-client-body">
            <div style="padding:48px;text-align:center;color:var(--ink-3);">
              <div class="loading" style="margin:0 auto 12px;"></div>
              <div style="font-size:var(--fs-base);">Loading…</div>
            </div>
          </div>
        </div>

        <!-- Active breaches -->
        <div class="sla-breach-card">
          <div class="sla-breach-head">
            ${OpsModal.entityIcon('incident')}
            <div class="sla-breach-title">Breach review</div>
          </div>
          <div id="sla-breach-list">
            <div style="padding:28px;text-align:center;color:var(--ink-3);font-size:var(--fs-base);">Loading…</div>
          </div>
        </div>
      </div>

      <!-- Full breach log -->
      <div class="sla-card">
        <div class="sla-card-head">
          <div class="sla-card-title">Breach history</div>
          <button class="fg-action" onclick="reloadTab('sla')">${OpsModal.actionIcon('refresh')}Refresh</button>
        </div>
        <div id="sla-breach-table">
          <div style="padding:32px;text-align:center;color:var(--ink-3);font-size:var(--fs-base);">Loading…</div>
        </div>
      </div>
      ${OpsModal.provenance([['Reporting period','Current calendar month'],['History scope','Includes earlier periods'],['Aggregation','Unweighted monthly means'],['Contract assessment','Unavailable']], 'Means are not event-weighted results. Missing records are not 100% uptime. Contract thresholds and eligible-event counts are not supplied, so contractual compliance and on-time resolution remain unassessed.')}
    `;

    loadAll();
  }

  // ── DATA ──────────────────────────────────────────────────────────────

  async function loadAll() {
    try {
      const [summaryRes, breachRes] = await Promise.all([
        OpsModal.apiGet('/sla/summary'),
        OpsModal.apiGet('/sla/breaches'),
      ]);

      const s = summaryRes.data || {};
      if (!Array.isArray(s.clients) || !Array.isArray(breachRes.data || breachRes.breaches)) throw new Error('Service-performance records were not supplied');
      _clients  = s.clients;
      _breaches = breachRes.data || breachRes.breaches;

      renderKPIs(s);
      renderClientTable(_clients);
      renderBreachList(_breaches.filter(b => !b.acknowledged_at));
      renderBreachHistory(_breaches);

    } catch (err) {
      ['sla-client-body','sla-breach-list','sla-breach-table'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = OpsModal.failure('Service performance',err,"reloadTab('sla')");
      });
    }
  }

  // ── KPI CARDS ─────────────────────────────────────────────────────────

  function renderKPIs(d) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const compliance = validPercent(d.overall_uptime);
    set('sla-compliance', compliance != null ? compliance + '%' : 'Not supplied');
    set('sla-response',   d.avg_response_min   != null ? d.avg_response_min + ' min' : OpsModal.missing.absent);
    set('sla-resolved',   d.resolved_on_time   != null ? d.resolved_on_time : OpsModal.missing.absent);
    set('sla-breaches',   d.breaches_this_month != null ? d.breaches_this_month : OpsModal.missing.absent);
    const unack = _breaches.filter(b => !b.acknowledged_at).length;
    set('sla-breach-sub', unack > 0 ? `${unack} rows without reported acknowledgement` : 'No unacknowledged rows returned');
  }

  // ── PER-CLIENT TABLE ──────────────────────────────────────────────────

  function renderClientTable(clients) {
    const el = document.getElementById('sla-client-body');
    if (!el) return;
    clients = (clients || []).filter(c=>String(c.client_name || '').toLowerCase().includes(_term.toLowerCase()) && (_coverage==='all' || (_coverage==='recorded' ? reportedMetric(c).value!=null : reportedMetric(c).value==null)));

    if (!clients || clients.length === 0) {
      el.innerHTML = OpsModal.emptyState(OpsModal.entityIcon('sla'),_clients.length?'No matching service records':'No client service records returned',_clients.length?'Change the search or reported-coverage filter to review other clients.':'No client service-performance records were returned by this feed. Missing records do not establish compliance.');
      return;
    }

    FGPaginator.create(clients,{pageSize:25,containerId:'sla-client-body'}).render(renderClientRows);
  }
  function renderClientRows(clients) {
    const el=document.getElementById('sla-client-body'); if(!el) return;
    el.innerHTML = `
      <div class="lv-scroll">
        <table class="lv-table">
          <thead>
            <tr>
              <th scope="col">Client</th><th scope="col">Estate</th><th scope="col">SLA</th><th scope="col">Response Time</th>
              <th scope="col">Resolution Time</th><th scope="col" style="min-width:140px;">Reported metric</th><th scope="col">Contract assessment</th>
            </tr>
          </thead>
          <tbody>
            ${clients.map(c => {
              const metric = reportedMetric(c), pct = metric.value;
              const barColor = 'var(--blue-hi)', label = 'Not assessed';
              const cid = OpsModal.sid(c.client_id);
              return `<tr class="clickable" onclick="OpsSLA.open('${cid}')">
                <td class="strong"><button class="record-link lv-name" type="button" onclick="event.stopPropagation();OpsSLA.open('${cid}')">${esc(c.client_name || 'Unnamed client')}</button></td>
                <td style="font-size:var(--fs-sm);"><span class="fg-cell-copy">${esc(_dash(c.property_name))}</span></td>
                <td>${esc(c.sla_target_min != null ? c.sla_target_min + ' min' : OpsModal.missing.absent)}</td>
                <td>${esc(c.avg_response_min != null ? c.avg_response_min + ' min' : OpsModal.missing.absent)}</td>
                <td>${esc(c.avg_resolution_min != null ? c.avg_resolution_min + ' min' : OpsModal.missing.absent)}</td>
                <td>
                  <div style="font-size:var(--fs-base);font-weight:700;color:${pct == null ? 'var(--ink-3)' : barColor};margin-bottom:3px;">${pct == null ? 'Not supplied' : pct + '% · ' + metric.name}</div>
                  ${pct == null ? '' : `<div class="sla-bar-track"><div class="sla-bar-fill" style="width:${Math.max(0, Math.min(100, pct))}%;background:${barColor};"></div></div>`}
                </td>
                <td>${OpsModal.status('unknown',label,null,'account')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function back() { if (_container) render(_container); }
  function filterClients(term,coverage) {if(term!=null)_term=term;if(coverage!=null)_coverage=coverage;renderClientTable(_clients);}

  // ── FULL DETAIL SCREEN (no pop-up) ──
  function open(clientId) {
    const c = _clients.find(x => String(x.client_id) === String(clientId));
    if (!c || !_container) return;
    const metric = reportedMetric(c), pct = metric.value;
    const label = 'Contract assessment unavailable';
    const clientBreaches = _breaches.filter(b => String(b.client_id) === String(clientId));
    const f = OpsModal.fact;

    const details = `<div class="fg-facts-grid">
      ${f('Client', esc(c.client_name || OpsModal.missing.absent))}
      ${f('Estate', esc(_dash(c.property_name)))}
      ${f('SLA target', c.sla_target_min == null ? 'Not supplied' : esc(c.sla_target_min + ' min'))}
      ${f('Response time', esc(c.avg_response_min != null ? c.avg_response_min + ' min' : 'Not supplied'))}
      ${f('Resolution time', esc(c.avg_resolution_min != null ? c.avg_resolution_min + ' min' : 'Not supplied'))}
      ${f(metric.name, pct == null ? 'Not supplied' : pct + '%')}
      ${f('Reporting period', c.reporting_period ? esc(c.reporting_period.start + ' to ' + c.reporting_period.end_exclusive + ' (end exclusive)') : 'Not supplied')}
      ${f('Eligible events', esc(c.eligible_count ?? 'Not supplied'))}
      ${f('Recorded aggregates', esc(c.record_count ?? 'Not supplied'))}
      ${f('Reported breaches', esc(c.breaches ?? 'Not supplied'))}
      ${f('Contract assessment', OpsModal.status('unknown',label,null,'account'))}
    </div>`;

    const breachTable = clientBreaches.length ? `
      <div class="lv-scroll"><table class="lv-table"><thead><tr><th scope="col">Month</th><th scope="col">Breaches</th><th scope="col">Acknowledged</th></tr></thead>
      <tbody>${clientBreaches.map(b => `<tr><td>${esc(_dash(b.month))}</td><td>${esc(b.breaches ?? b.breach_count ?? OpsModal.missing.absent)}</td><td>${b.acknowledged_at ? OpsModal.fmtDateTime(b.acknowledged_at) : OpsModal.missing.absent}</td></tr>`).join('')}</tbody></table></div>` : OpsModal.emptyState('','No matching breach rows returned','This does not establish zero breaches; some history rows lack a client link.');

    _container.innerHTML = OpsModal.detailShell({
      back:'OpsSLA.back()',crumbRoot:'Service performance',title:OpsModal.escape(c.client_name || 'Client'),
      chips:[{label,cls:'neutral'}],
      decision:[['Contract assessment','Unavailable'],['Reported metric',metric.name],['Next step','Confirm the reporting period, eligible events and service terms']],
      note:'Acknowledging a breach records review; it does not resolve the incident or restore compliance. Assessment requires a defined reporting period and eligible event count.',
      sections:[{id:'details',title:'Service commitments & results',body:details},{id:'breaches',title:'Recorded breaches',body:breachTable}],
    });
  }

  // ── ACTIVE BREACHES ───────────────────────────────────────────────────

  function renderBreachList(breaches) {
    const el = document.getElementById('sla-breach-list');
    if (!el) return;

    if (!breaches || breaches.length === 0) {
      el.innerHTML = OpsModal.emptyState(OpsModal.entityIcon('sla'),'No breach rows awaiting review returned','This review queue is empty. It does not establish complete breach history or contractual compliance.');
      return;
    }

    el.innerHTML = breaches.slice(0, 8).map(b => {
      const id      = OpsModal.sid(b.breach_id || b.id);
      const overMin = b.response_time_min && b.sla_target_min ? b.response_time_min - b.sla_target_min : null;
      return `
        <div class="sla-breach-item">
          <div class="sla-breach-top">
            <span class="sla-breach-name">${esc(b.client_name || OpsModal.label(b.alert_type || 'Recorded aggregate'))}</span>
            ${overMin != null ? `<span class="sla-breach-delta">+${overMin}m over</span>` : ''}
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div class="sla-breach-meta">${esc(OpsModal.label(b.alert_type || 'Recorded aggregate'))} ${b.occurred_at ? '· ' + fmtRelTime(b.occurred_at) : b.month ? '· ' + esc(fmtDate(b.month)) : ''}</div>
            ${Auth.can('sla.manage') ? `<button class="fg-action" onclick="OpsSLA.acknowledge('${id}')">Review aggregate</button>` : '<span class="lv-status neutral">Read only</span>'}
          </div>
        </div>`;
    }).join('');
  }

  // ── BREACH HISTORY TABLE ──────────────────────────────────────────────

  function renderBreachHistory(breaches) {
    const el = document.getElementById('sla-breach-table');
    if (!el) return;

    if (!breaches || breaches.length === 0) {
      el.innerHTML = OpsModal.emptyState(OpsModal.entityIcon('sla'),'No breach history returned','No history rows were returned by this feed. This does not establish complete coverage or contractual compliance.');
      return;
    }

    _pg = FGPaginator.create(breaches, { pageSize: 20, containerId: 'sla-breach-table' });
    _pg.render(items => {
      const tableEl = document.getElementById('sla-breach-table');
      if (!tableEl) return;
      tableEl.innerHTML = `
        <div class="lv-scroll">
          <table class="lv-table">
            <thead>
              <tr>
                <th scope="col">Client</th>
                <th scope="col">Incident type</th>
                <th scope="col">Target</th>
                <th scope="col">Reported response</th>
                <th scope="col">Overage</th>
                <th scope="col">Occurred</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(b => {
                const validMinutes=v=>(typeof v==='number' || typeof v==='string' && v.trim()!=='') && Number.isFinite(Number(v)) && Number(v)>=0;
                const overMin = validMinutes(b.response_time_min) && validMinutes(b.sla_target_min) ? Number(b.response_time_min)-Number(b.sla_target_min) : null;
                const acknowledged=b.acknowledged_at && Number.isFinite(new Date(b.acknowledged_at).getTime());
                return `<tr>
                  <td class="strong">${esc(b.client_name || OpsModal.missing.absent)}</td>
                  <td>${esc(OpsModal.label(b.alert_type || 'Recorded aggregate'))}</td>
                  <td>${esc(b.sla_target_min != null ? b.sla_target_min + ' min' : OpsModal.missing.absent)}</td>
                  <td>${esc(b.response_time_min != null ? b.response_time_min + ' min' : OpsModal.missing.absent)}</td>
                  <td style="font-variant-numeric:tabular-nums;font-size:var(--fs-sm);color:${overMin > 0 ? 'var(--err)' : 'var(--ink-3)'};font-weight:700;">
                    ${overMin == null ? 'Not supplied' : (overMin>0?'+':'')+overMin+' min'}
                  </td>
                  <td style="font-size:var(--fs-sm);">${fmtDate(b.occurred_at || b.month)}</td>
                  <td>
                    ${OpsModal.status(acknowledged?'acknowledged':'unknown',acknowledged?'Acknowledged':'Acknowledgement not reported',null,'review')}
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
    });
  }

  // ── ACTIONS ───────────────────────────────────────────────────────────

  async function acknowledge(id) {
    if (!Auth.hasNavAccess('sla') || !Auth.can('sla.manage')) return OpsModal.toast('You do not have permission to review service performance', 'watch');
    OpsModal.confirm('Acknowledge this monthly breach aggregate? This records review only; incidents, evidence and contractual results are unchanged.', async () => {
    OpsModal.close();
    if (!Auth.can('sla.manage')) return OpsModal.toast('Review permission unavailable', 'watch');
    try {
      const result = await OpsModal.apiPost(`/sla/breaches/${id}/acknowledge`, {});
      if (!result?.data?.acknowledged_at) throw new Error('The server did not confirm a saved acknowledgement');
      OpsModal.toast('Aggregate review saved', 'nominal');
      reloadTab('sla');
    } catch (err) {
      OpsModal.toast('Failed: ' + err.message, 'critical');
    }
    }, {tone:'neutral',title:'Record service-performance review',confirmLabel:'Acknowledge review',detail:'This saves a review acknowledgement; it does not resolve a breach or change contractual results.'});
  }

  // ── HELPERS ───────────────────────────────────────────────────────────

  function fmtDate(ds) { return OpsModal.fmtDate(ds); }

  function fmtRelTime(ds) { return OpsModal.relativeTime(ds); }

  return { render, acknowledge, open, back, filterClients };

})();
