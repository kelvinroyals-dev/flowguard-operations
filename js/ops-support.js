/* ══════════════════════════════════════════════════════════════
   FlowGuard Ops — SUPPORT INBOX
   Client-raised support tickets (no work_type) that used to have no
   ops-side home. List → conversation thread → reply / resolve.
   ══════════════════════════════════════════════════════════════ */
const OpsSupport = (function () {
  'use strict';
  let _container = null, _rows = [], _filter = 'all', _term = '', _cur = null;
  const _drafts = new Map();
  function draft(id, text) { _drafts.set(String(id), text); }

  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const canManage = () => (typeof Auth !== 'undefined' && Auth.can) ? Auth.can('support.manage') : true;
  const openStatus = s => !['resolved', 'closed'].includes(String(s || '').toLowerCase());
  const statusCls = s => OpsModal.statusTone(s,'support');
  const timeAgo = d => OpsModal.relativeTime(d);
  const lastActivity = t => [t.updated_at,t.last_message_at,t.created_at,...(Array.isArray(t.messages)?t.messages.map(m=>m.created_at):[])].filter(Boolean).map(v=>new Date(v).getTime()).filter(Number.isFinite).sort((a,b)=>b-a)[0] || null;


  function render(container) {
    _container = container; _cur = null;
    container.innerHTML = `
      ${OpsModal.pageHeader({title:'Client support',subtitle:'Questions, requests and payment notifications from your accounts'})}
      <div class="lv-wrap">
        <div class="lv-toolbar">
          <div class="lv-search">${OpsModal.actionIcon("search")}
            <input id="sup-search" aria-label="Search support requests" placeholder="Search support requests…" oninput="OpsSupport.search(this.value)"></div>
          <div class="lv-toolbar-right">
            <span id="sup-count" class="fg-result-count" aria-live="polite"></span>
            <select aria-label="Support request state" class="um-filter" onchange="OpsSupport.setFilter(this.value)">
              <option value="all" selected>All statuses</option>
              <option value="open">Open</option>
              <option value="waiting">Awaiting response</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
        </div>
        <div id="sup-body">${OpsModal.loading('Loading support requests…')}</div>
      </div>`;
    load();
  }

  async function load() {
    try {
      const res = await OpsModal.apiGet('/tickets/support');
      _rows = OpsModal.readArray(res,'Support request feed');
      OpsModal.updateNavCount('support',OpsModal.scopeCount(_rows,'support'));
      const c = document.getElementById('sup-count');
      const open = _rows.filter(r => openStatus(r.status)).length;
      if (c) c.textContent = `${open} open · ${_rows.length} requests returned`;
      applyFilter();
    } catch (err) {
      OpsModal.updateNavCount('support',null);
      const b = document.getElementById('sup-body');
      if (b) b.innerHTML = OpsModal.failure('Client support',err,"reloadTab('support')",false);
    }
  }

  function setFilter(f) { _filter = f; ['open', 'resolved', 'all'].forEach(k => { const e = document.getElementById('supf-' + k); if (e) e.classList.toggle('active', k === f); }); applyFilter(); }
  function search(q) { _term = (q || '').trim().toLowerCase(); applyFilter(); }

  function applyFilter() {
    let rows = _rows;
    if (_filter === 'open') rows = rows.filter(r => openStatus(r.status));
    else if (_filter === 'waiting') rows=rows.filter(r=>r.needs_response===true);
    else if (_filter === 'resolved') rows = rows.filter(r => !openStatus(r.status));
    if (_term) rows = rows.filter(r => `${r.ticket_id} ${r.client_name || ''} ${r.title || ''} ${r.property_name || ''}`.toLowerCase().includes(_term));
    FGPaginator.create(rows,{pageSize:25,containerId:'sup-body'}).render(renderTable);
  }

  function prioPill(p) {
    return OpsModal.status(p || 'unknown',null,null,'priority');
  }

  function renderTable(rows) {
    const el = document.getElementById('sup-body'); if (!el) return;
    if (!rows.length) { el.innerHTML = OpsModal.emptyState('',_term || _filter!=='all'?'No matching support requests':'No support requests returned',_term || _filter!=='all'?'Adjust the search or filters to review the full inbox.':'No support requests were returned by this feed.'); return; }
    const L = OpsModal.link;
    el.innerHTML = `<div class="lv-scroll"><table class="lv-table fg-mobile-cards">
      <thead><tr><th scope="col" style="width:30%">Request</th><th scope="col" style="width:23%">Client / estate</th><th scope="col" style="width:20%">Response</th><th scope="col">Status / priority</th><th scope="col">Last activity</th></tr></thead>
      <tbody>${rows.map(r => `<tr class="clickable${r.needs_response ? ' sup-unread' : ''}" onclick="OpsSupport.open('${r.ticket_id}')">
        <td data-label="Request">
          <div class="lv-name-cell">
            <div class="lv-avatar" aria-hidden="true">${OpsModal.entityIcon('support')}</div>
            <div style="min-width:0;"><button type="button" class="record-link lv-name" onclick="event.stopPropagation();OpsSupport.open('${r.ticket_id}')">${esc(r.subject || r.title || 'Untitled request')}</button><span class="lv-source">${esc(r.ticket_id)} · ${esc(OpsModal.label(r.category || OpsModal.missing.absent))}</span></div>
          </div>
        </td>
        <td data-label="Client / estate"><span class="fg-cell-copy">${r.user_id ? L('clients', r.user_id, r.client_name || 'Client') : esc(r.client_name || '—')}</span><span class="lv-source">${esc(r.property_name || 'Estate not supplied')}</span></td>
        <td data-label="Response">${r.needs_response === true ? '<span class="lv-status warn">Awaiting response</span><span class="lv-source">Waiting since '+timeAgo(r.response_wait_since)+'</span>' : r.needs_response === false ? 'No response flagged' : 'Not supplied'}</td>
        <td data-label="Status / priority">${OpsModal.status(r.status,null,null,'support')}<div class="lv-source">${esc(OpsModal.label(r.priority || 'Unknown'))} priority</div></td>
        <td data-label="Last activity" class="lv-mono">${timeAgo(lastActivity(r))}</td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  function back() { if (_container) render(_container); }

  async function open(id) {
    if (!_container) return;
    _container.innerHTML = OpsModal.loading('Loading conversation…');
    try {
      const t = OpsModal.readRecord(await OpsModal.apiGet('/tickets/' + id),'Support request');
      _cur = t;
      renderThread(t);
    } catch (err) {
      _container.innerHTML = OpsModal.recordFailure('Support ticket', err, `OpsSupport.open('${OpsModal.sid(id)}')`, 'OpsSupport.back()');
    }
  }

  function renderThread(t) {
    const meta = {...t,...(_rows.find(r => r.ticket_id === t.ticket_id) || {})};
    const msgs = Array.isArray(t.messages) ? t.messages.filter((m,index)=>!(index===0 && m.author_type==='client' && m.message===t.description && m.created_at===t.created_at)) : null;
    const bubbles = !msgs ? '<div class="capability-note">Message history was not supplied; this is not an empty conversation.</div>' : msgs.length ? msgs.map(m => OpsModal.message({side:['internal','support','ops','system'].includes(m.author_type)?'staff':'external',author:m.author_name || (m.author_type==='client'?'Client':null),body:m.message,createdAt:m.created_at})).join('') : OpsModal.emptyState('','No follow-up messages returned',t.description?'The original request is shown above.':'No original request was supplied.');
    const F = OpsModal.fact;
    // Payment-notification tickets reference an invoice — deep-link finance to it.
    const invMatch = `${t.subject || ''} ${t.title || ''} ${t.description || ''}`.match(/INV-(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|\d{4}-\d+)(?![A-Za-z0-9-])/i);
    const invId = invMatch ? invMatch[0] : null;
    const primaryBtn = window.FG_LOCAL_PREVIEW ? 'disabled aria-describedby="sup-preview-note"' : '';
    const open_ = openStatus(t.status);

    const convo = `
      <div class="fg-message-thread">
        ${t.description ? OpsModal.message({side:'external',author:meta.client_name || 'Client',original:true,body:t.description,createdAt:t.created_at}) : ''}
        ${bubbles}
      </div>
      ${canManage() ? `<div class="sup-reply">
        <textarea id="sup-reply-txt" aria-label="Reply to client" placeholder="Write a reply to the client…" oninput="OpsSupport.draft('${OpsModal.sid(t.ticket_id)}',this.value)">${esc(_drafts.get(String(t.ticket_id)) || '')}</textarea>
        <div class="capability-note" id="sup-preview-note">${window.FG_LOCAL_PREVIEW ? 'Local design preview: replies cannot be sent. ' : ''}Unsent replies stay in this browser tab while you navigate. They are not saved to the server and will be lost on refresh.</div>
        <div class="sup-reply-bar"><button class="fg-action fg-action-primary" ${primaryBtn} id="sup-reply-btn" onclick="OpsSupport.reply('${t.ticket_id}')">Send reply</button></div>
      </div>` : `<div class="capability-note">You have read-only access to support. Reply and resolution actions are unavailable for your role.</div>`}`;

    const sidebar = `
      <div class="fgd-card"><div class="fgd-card-head"><h2>Details</h2></div>
        ${F('Client', meta.client_name ? esc(meta.client_name) : OpsModal.missing.absent)}
        ${F('Email', meta.client_email ? esc(meta.client_email) : OpsModal.missing.absent)}
        ${F('Estate', meta.property_name ? OpsModal.link('properties', t.property_id, esc(meta.property_name)) : (t.property_id ? esc(t.property_id) : t.property_id === null ? OpsModal.missing.unlinked : OpsModal.missing.absent))}
        ${F('Category', esc(OpsModal.label(t.type || t.category || OpsModal.missing.absent)))}
        ${F('Opened', OpsModal.fmtDateTime(t.created_at))}
        ${invId ? F('Invoice', OpsModal.link('billing', invId, esc(invId))) : ''}
      </div>
      ${invId ? `<div class="fgd-card"><div class="fgd-card-head"><h2>Related invoice</h2></div><button class="fg-action" style="width:100%" onclick="fgOpen('billing','${OpsModal.sid(invId)}')">Open invoice ${esc(invId)} →</button></div>` : ''}`;

    _container.innerHTML = OpsModal.detailShell({
      back: 'OpsSupport.back()',
      crumbRoot: 'Client support',
      title: esc(t.subject || t.title || 'Support ticket'),
      avatar: { text: OpsModal.entityIcon('support') },
      chips: [
        { cls: statusCls(t.status), dot: true, label: esc(OpsModal.label(t.status || 'Unknown')) },
        t.priority ? { cls: OpsModal.statusTone(t.priority,'priority'), label: esc(OpsModal.label(t.priority)) + ' priority' } : null,
      ].filter(Boolean),
      meta: [['Request reference', esc(t.ticket_id)]],
      decision:[['Response owner',t.assigned_to_name || t.assigned_team_name || 'Not supplied'],['Last activity',OpsModal.fmtDateTime(lastActivity(t))],['Next step',['resolved','closed'].includes(t.status)?'Review recorded resolution':'Reply to the client or prepare field work']],
      actions: `${typeof Auth!=='undefined' && Auth.can('jobs.manage') && Auth.hasNavAccess('jobs') ? `<button class="fg-action" onclick="OpsSupport.prepareWork('${OpsModal.sid(t.ticket_id)}')">Prepare work order</button>` : ''}${canManage() && open_ ? `<button class="fg-action" ${primaryBtn} onclick="OpsSupport.resolve('${OpsModal.sid(t.ticket_id)}')">Mark resolved</button>` : ''}${canManage() && !open_ ? `<button class="fg-action" onclick="OpsSupport.reopen('${OpsModal.sid(t.ticket_id)}')">Reopen</button>` : ''}`,
      sections: [
        { id: 'conversation', title: 'Conversation', body: convo },
        { id: 'work',title:'Linked work orders',body:Array.isArray(t.linked_work_orders) ? t.linked_work_orders.length ? t.linked_work_orders.map(j=>`<div class="fg-timeline-row"><div class="fg-timeline-icon">${OpsModal.entityIcon('jobs')}</div><div><div class="fg-timeline-title">${OpsModal.link('jobs',j.id,j.title || 'Work order')}</div><div class="fg-timeline-meta">${esc(j.reference || 'Reference not supplied')}</div></div>${OpsModal.status(j.status || 'unknown',null,null,'workorder')}</div>`).join('') : OpsModal.emptyState('','No work-order links returned','Preparing a draft creates nothing until you confirm it.') : '<div class="capability-note">Linked work orders were not supplied.</div>' },
      ],
      sidebar,
    });
  }

  async function reply(id) {
    if (window.FG_LOCAL_PREVIEW) return OpsModal.toast('Replies cannot be sent from the local design preview','watch');
    if (!canManage()) return OpsModal.toast('You have read-only access to support','watch');
    const txt = (document.getElementById('sup-reply-txt') || {}).value || '';
    if (!txt.trim()) return OpsModal.toast('Write a message first', 'watch');
    OpsModal.setLoading('sup-reply-btn', true);
    try {
      await OpsModal.apiPost('/tickets/' + id + '/reply', { message: txt.trim() });
      _drafts.delete(String(id));
      OpsModal.toast('Reply sent', 'nominal');
      open(id);
    } catch (err) { OpsModal.toast('Failed: ' + err.message, 'critical'); OpsModal.setLoading('sup-reply-btn', false); }
  }
  async function resolve(id) { await setStatus(id, 'resolved', 'Ticket resolved'); }
  async function reopen(id) { await setStatus(id, 'in_progress', 'Ticket reopened'); }
  async function setStatus(id, status, msg) {
    if (!canManage()) return OpsModal.toast('You have read-only access to support','watch');
    try { await OpsModal.apiPut('/tickets/' + id + '/support-status', { status }); OpsModal.toast(msg, 'nominal'); open(id); }
    catch (err) { OpsModal.toast('Failed: ' + err.message, 'critical'); }
  }

  function prepareWork(id) {
    if (!_cur || String(_cur.ticket_id)!==String(id) || !Auth.can('jobs.manage') || !Auth.hasNavAccess('jobs')) return OpsModal.toast('Open an authorised support request before preparing work','watch');
    return OpsJobs.newJob({source:'support',source_ticket_id:_cur.ticket_id,property_id:_cur.property_id,title:'Follow up: '+(_cur.subject || _cur.title || 'Support request'),description:_cur.description || ''});
  }
  return { render, setFilter, search, open, back, reply, resolve, reopen, draft, prepareWork };
})();
