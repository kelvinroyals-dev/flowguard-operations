/**
 * FlowGuard Operations Center — Modal & API Utility v3.2.1
 * ──────────────────────────────────────────────────────────
 * Shared by all tab modules.
 *
 * Changes v3.2.1:
 *  • API_BASE now reads from CONFIG.API_BASE — no hardcoded URL
 *  • getToken() checks sessionStorage first (non-persistent login fix)
 *  • Toast uses new light-theme CSS tokens, slides in from right
 *  • confirm uses new design tokens, no duplicate class bug
 *  • setLoading renders a spinner instead of plain text
 *
 * Depends on: config.js (must load first)
 */

const OpsModal = (function () {

  // Shared structural styles: css/shared-structure.css.

  // ── AUTH ───────────────────────────────────────────────────────────────

  function getToken() {
    return sessionStorage.getItem('token') || localStorage.getItem('token') || null;
  }

  function getHeaders() {
    return {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type':  'application/json',
    };
  }

  // ── MODAL CORE ─────────────────────────────────────────────────────────

  /* ── XSS ──────────────────────────────────────────────────────────────
     Everything below renders SERVER data into innerHTML. Alert descriptions,
     client names, error strings — all attacker-influencable. Unescaped, a
     field value like  <img src=x onerror=...>  executes, and since the JWT
     lives in localStorage, that is a token-theft chain, not a cosmetic bug.
     escape() is applied at every sink. Error/toast text uses textContent. */
  function escape(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── FOCUS MANAGEMENT ───────────────────────────────────────────────────
  // The modal used to set role="dialog" and an initial focus and stop there:
  // no Escape-to-close, no focus trap (Tab could walk out into the page
  // behind the overlay), and closing dropped focus back to <body> instead of
  // wherever the user was before opening it. All three are real keyboard/
  // screen-reader blockers, not polish.
  let _lastFocused    = null;
  let _modalKeydown   = null;
  let _modalBackgrounds=[];
  let _pageBackgrounds=[];
  let _pageDirty=false;
  window.addEventListener?.('beforeunload',event=>{
    if(_pageDirty){event.preventDefault();event.returnValue='';}
  });
  function confirmLeave() {
    if (document.getElementById('ops-modal-overlay')?.dataset?.busy === 'true') {
      toast('Please wait for the current action to finish.', 'watch');
      return false;
    }
    return !_pageDirty || window.confirm('Discard your unsaved changes?');
  }
  function requestClose() {
    if (confirmLeave()) close();
  }

  function focusableIn(container) {
    return Array.from(container.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), ' +
      'input:not([disabled]):not([type="hidden"]), select:not([disabled]), ' +
      '[tabindex]:not([tabindex="-1"])'
    )).filter(el => el.offsetParent !== null);
  }

  function open(title, bodyHTML, actions = [], options = {}) {
    close();

    // remember what had focus so close() can put it back there
    _lastFocused = document.activeElement;
    const pageHost = !options.dialog && document.querySelector('.tab-content.active');
    _modalBackgrounds=pageHost ? [] : Array.from(document.querySelectorAll?.('.app-neon,[role="dialog"]') || []).map(element=>({element,inert:!!element.inert}));
    _modalBackgrounds.forEach(({element})=>{element.inert=true;});

    const overlay     = document.createElement('div');
    overlay.id        = 'ops-modal-overlay';
    overlay.className = pageHost ? 'ops-form-page' : 'ops-modal-overlay';

    overlay.innerHTML = `
      <div class="ops-modal" role="${pageHost ? 'region' : 'dialog'}" ${pageHost ? '' : 'aria-modal="true"'} aria-label="${escape(title)}" tabindex="-1" onclick="event.stopPropagation()">
        <div class="ops-modal-header">
          <h2 class="ops-modal-title">${escape(title)}</h2>
          <button class="ops-modal-close" onclick="OpsModal.requestClose()" aria-label="${pageHost ? 'Back to record' : 'Close'}">${pageHost ? '← Back' : '✕'}</button>
        </div>
        <div class="ops-modal-body">${bodyHTML}</div>
        ${actions.length > 0 ? `
          <div class="ops-modal-footer">
            ${actionMarkup(actions.map(a => `
              <button class="fg-action ${a.intent==='secondary' || /\b(?:btn-ghost|fg-action-neutral)\b/.test(a.class || '') || a.onclick?.trim()==='OpsModal.close()' ? 'fg-action-neutral' : ''} ${a.intent==='primary' || /\b(?:btn-primary|primary|fg-action-primary)\b/.test(a.class || '') ? 'fg-action-primary' : ''} ${a.intent==='danger' || /\b(?:btn-danger|danger)\b/.test(a.class || '') ? 'danger' : ''}"
                onclick="${pageHost && (a.label==='Cancel' || a.onclick?.trim()==='OpsModal.close()') ? 'OpsModal.requestClose()' : a.onclick}"
                ${a.disabled ? 'disabled' : ''}
                ${a.id ? `id="${a.id}"` : ''}>
                ${escape(a.label)}
              </button>`).join(''))}
          </div>` : ''}
      </div>`;

    // Page editors use divs rather than native forms. Validate before inline saves.
    overlay.addEventListener('click', event => {
      const button = event.target.closest?.('.ops-modal-footer button');
      if (!button || /^(Cancel|Close|Back)$/i.test(button.textContent.trim())) return;
      const invalid = Array.from(overlay.querySelectorAll('input,select,textarea'))
        .find(field => !field.disabled && field.checkValidity && !field.checkValidity());
      if (invalid) {
        event.preventDefault(); event.stopImmediatePropagation();
        invalid.reportValidity(); invalid.focus();
      }
    }, true);
    overlay.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing || event.target.tagName !== 'INPUT') return;
      const submit = overlay.querySelector('.ops-modal-footer button:last-child');
      if (submit && !submit.disabled) { event.preventDefault(); submit.click(); }
    });

    if (pageHost) {
      overlay.addEventListener('input',()=>{_pageDirty=true;});
      overlay.addEventListener('change',()=>{_pageDirty=true;});
      _pageBackgrounds=Array.from(pageHost.children).map(element=>({element,hidden:element.hidden}));
      _pageBackgrounds.forEach(({element})=>{element.hidden=true;});
      pageHost.appendChild(overlay);
      const scroller=document.querySelector('.app-neon > .content');
      if(scroller)scroller.scrollTop=0;
    } else {
      overlay.addEventListener('click', close);
      document.body.appendChild(overlay);
    }
    requestAnimationFrame(() => { if (document.contains(overlay)) overlay.classList.add('visible'); });

    const dialog = overlay.querySelector('.ops-modal');

    setTimeout(() => {
      if (!document.contains(overlay)) return;
      const firstInput = overlay.querySelector('.ops-input, input:not([readonly]), select, textarea');
      if (firstInput) { firstInput.focus(); return; }
      const focusable = dialog ? focusableIn(dialog) : [];
      if (focusable.length) focusable[0].focus();
      else if (dialog) dialog.focus();
    }, 120);
    // Page editing keeps navigation and the account bar available.
    // Only confirmations isolate the background and trap keyboard focus.
    if (pageHost) return;

    // Escape closes the modal; Tab/Shift+Tab is trapped inside it so
    // keyboard navigation can't walk into the page underneath while it's open.
    _modalKeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab' || !dialog) return;
      const focusable = focusableIn(dialog);
      if (!focusable.length) { e.preventDefault(); return; }
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', _modalKeydown);
  }

  function close() {
    _pageDirty=false;
    _pendingConfirm = null;
    const overlay = document.getElementById('ops-modal-overlay');
    if (_modalKeydown) {
      document.removeEventListener('keydown', _modalKeydown);
      _modalKeydown = null;
    }
    if (overlay) {
      // Detach synchronously: reopening must not leave duplicate dialog/field
      // IDs or a closing focus trap available to async loaders and assistive tech.
      overlay.remove();
    }
    _pageBackgrounds.forEach(({element,hidden})=>{element.hidden=hidden;});
    _pageBackgrounds=[];
    _modalBackgrounds.forEach(({element,inert})=>{element.inert=inert;});
    _modalBackgrounds=[];
    // return focus to whatever opened the modal (a button, a card, etc.)
    // instead of leaving it to fall back to <body>
    if (_lastFocused && typeof _lastFocused.focus === 'function' && document.contains(_lastFocused)) {
      _lastFocused.focus();
    }
    _lastFocused = null;
  }

  function setLoading(btnId, loading) {
    // Tolerate setLoading(true|false): the common case is "the modal is busy",
    // and the modal knows which button is its primary. The old contract silently
    // no-opped on a boolean, leaving buttons live — a double-click fired a
    // duplicate dispatch, which in this product means two crews sent to one job.
    if (typeof btnId === 'boolean') {
      loading = btnId;
      const overlay = document.getElementById('ops-modal-overlay');
      const primary = overlay && overlay.querySelector('.ops-modal-footer button:last-child');
      if (!primary) return;
      return applyLoading(primary, loading);
    }
    const btn = document.getElementById(btnId);
    if (!btn) return;
    return applyLoading(btn, loading);
  }

  function applyLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
      if (btn.dataset.loading === 'true') return;
      btn.dataset.loading = 'true';
      btn.dataset.originalHtml = btn.innerHTML;
      btn.innerHTML = '<span class="fg-action-spinner" aria-hidden="true"></span>Processing…';
      btn.disabled  = true;
    } else {
      btn.innerHTML = btn.dataset.originalHtml || btn.innerHTML;
      btn.disabled  = false;
      delete btn.dataset.loading;
    }
    const overlay = document.getElementById('ops-modal-overlay');
    if (overlay?.dataset) overlay.dataset.busy = loading ? 'true' : 'false';
  }

  // ── RELATIONSHIP LINK ──────────────────────────────────────────────────
  // Renders a related record as a bold, clickable cross-module link. Clicking
  // switches to `tab` and opens the record by id in its own module.
  // `label` is inserted as-is (apiGet values are already HTML-escaped).
  function link(tab, id, label, opts = {}) {
    const text = (label == null || label === '') ? '—' : label;
    if (id == null || id === '' || text === '—') {
      return `<span class="fg-link-none">${opts.text === 'raw' ? escape(text) : text}</span>`;
    }
    const handler = `fgOpen(${JSON.stringify(String(tab))},${JSON.stringify(String(id))})`;
    const cls = 'fg-link' + (opts.block ? ' fg-link-block' : '');
    return `<a class="${cls}" href="#${escape(tab)}/${escape(encodeURIComponent(String(id)))}"`
      + ` onclick="${escape('event.stopPropagation();if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();'+handler)}"`
      + ` onkeydown="${escape("if(event.key==='Enter'){event.preventDefault();event.stopPropagation();"+handler+'}')}">${opts.text === 'raw' ? escape(text) : text}</a>`;
  }

  // ── FORM HELPERS ───────────────────────────────────────────────────────

  let fieldSequence = 0;
  function field(fieldLabel, name, type = 'text', value = '', options = {}) {
    const fieldId = 'ops-field-' + (++fieldSequence);
    const disabled = options.disabled ? 'disabled' : '';
    const required    = options.required !== false ? 'required' : '';
    const placeholder = options.placeholder || '';
    const readonly    = options.readonly ? 'readonly' : '';
    const extraStyle  = options.readonly ? 'cursor:default;' : '';
    const numericAttributes = type === 'number' ? ['min','max','step'].filter(key=>options[key]!=null).map(key=>`${key}="${escape(options[key])}"`).join(' ') : '';

    if (type === 'select') {
      const opts = (options.options || []).map(o => {
        const v = typeof o === 'object' ? o.value : o;
        const l = typeof o === 'object' ? o.label : /^[a-z][a-z0-9_-]*$/.test(String(o)) ? label(o) : o;
        return `<option value="${escape(v)}" ${v == value ? 'selected' : ''}>${escape(l)}</option>`;
      }).join('');
      return `
        <div class="ops-modal-field">
          <label class="ops-label" for="${fieldId}">${escape(fieldLabel)}</label>
          <select id="${fieldId}" name="${escape(name)}" class="ops-input" ${required} ${disabled}>${opts}</select>
        </div>`;
    }

    if (type === 'textarea') {
      return `
        <div class="ops-modal-field">
          <label class="ops-label" for="${fieldId}">${escape(fieldLabel)}</label>
          <textarea id="${fieldId}" name="${escape(name)}" class="ops-input" rows="${escape(options.rows || 3)}"
            placeholder="${escape(placeholder)}" ${required} ${readonly} ${disabled}
            style="resize:vertical;${extraStyle}">${escape(value)}</textarea>
        </div>`;
    }

    return `
      <div class="ops-modal-field">
        <label class="ops-label" for="${fieldId}">${escape(fieldLabel)}</label>
        <input id="${fieldId}" type="${escape(type)}" name="${escape(name)}" class="ops-input"
          value="${escape(value)}" placeholder="${escape(placeholder)}"
          ${required} ${readonly} ${disabled} ${numericAttributes} style="${extraStyle}">
      </div>`;
  }

  function row(fields,columns=fields.length) {
    const count=Number.isInteger(columns) && columns>0?columns:fields.length;
    return `<div class="ops-modal-row" style="--field-columns:${count}">${fields.join('')}</div>`;
  }

  function getFormData(containerSelector) {
    const container = containerSelector
      ? document.querySelector(containerSelector)
      : document.querySelector('.ops-modal-body');
    const data = {};
    if (!container) return data;

    container.querySelectorAll('input, select, textarea').forEach(el => {
      if (!el.name) return;
      if (el.type === 'number')        data[el.name] = el.value !== '' ? Number(el.value) : null;
      else if (el.type === 'checkbox') data[el.name] = el.checked;
      else                             data[el.name] = el.value;
    });
    return data;
  }

  // ── API HELPERS ────────────────────────────────────────────────────────

  /* ── Defence in depth: sanitise at the API boundary ────────────────────
     Twelve modules render server data into innerHTML. Escaping each of ~80
     sinks by hand guarantees one gets missed, and one miss is a stolen JWT
     (tokens live in localStorage). So every string that arrives from the API
     is HTML-escaped HERE, once, before any module can touch it.

     Safe by construction: escaped entities decode correctly when parsed as
     HTML (innerHTML, attribute values), so "O'Brien" still displays as
     O'Brien — it simply can no longer close a tag or an attribute.

     Enum-ish values (status, severity, ids) contain no special characters,
     so comparisons and filters are unaffected. */
  const SKIP_ESCAPE = new Set(['created_at', 'updated_at', 'time', 'occurred_at',
    'reading_time', 'last_ping', 'recorded_at', 'breach_start', 'breach_end']);

  function deepEscape(node, key) {
    if (typeof node === 'string') {
      return SKIP_ESCAPE.has(key) ? node : escape(node);
    }
    if (Array.isArray(node)) return node.map(v => deepEscape(v, key));
    if (node && typeof node === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(node)) out[k] = deepEscape(v, k);
      return out;
    }
    return node;   // numbers, booleans, null pass through untouched
  }

  /* Values embedded inside inline handlers — onclick="X.go('${id}')" — are
     NOT protected by HTML escaping: the browser decodes entities BEFORE the
     JS is parsed, so &#39; becomes a real quote and can still break out of
     the string. These slots only ever carry identifiers, so restrict them to
     an identifier charset. Anything else is dropped, not escaped. */
  function sid(v) {
    return String(v == null ? '' : v).replace(/[^A-Za-z0-9_\-.:]/g, '');
  }

  // Legacy modules retain pre-escaped responses until every sink is audited.
  // Audited modules may request raw text and escape exactly at HTML sinks;
  // native textContent/value, search and form state must receive original text.
  async function apiGet(endpoint,options={}) {
    const res = await fetch(`${CONFIG.API_BASE}${endpoint}`, { headers: getHeaders() });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw Object.assign(new Error(body.error || `API ${res.status}`),{status:res.status});
    }
    const data=await res.json();
    return options.text==='raw' ? data : deepEscape(data);
  }

  async function apiPost(endpoint, body) {
    const res = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw Object.assign(new Error(err.error || `API ${res.status}`),{status:res.status});
    }
    return await res.json();
  }

  async function apiPut(endpoint, body) {
    const res = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
      method: 'PUT', headers: getHeaders(), body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw Object.assign(new Error(err.error || `API ${res.status}`),{status:res.status});
    }
    return await res.json();
  }

  async function apiDelete(endpoint) {
    const res = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
      method: 'DELETE', headers: getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw Object.assign(new Error(err.error || `API ${res.status}`),{status:res.status});
    }
    return await res.json();
  }

  // ── TOAST ──────────────────────────────────────────────────────────────

  const TOAST_COLORS = {
    nominal:  'var(--ok,#0a8a6a)',
    watch:    'var(--warn,#b45309)',
    warning:  'var(--caut,#c2410c)',
    critical: 'var(--err,#dc2626)',
    // Aliases. Modules were calling toast(msg,'error') and toast(msg,'success');
    // neither existed, so BOTH fell through to green — a failed dispatch looked
    // like a successful one. Accept them rather than let an unknown type
    // silently render as success.
    success:  'var(--ok,#0a8a6a)',
    error:    'var(--err,#dc2626)',
    info:     'var(--blue,#0891b2)',
  };

  function toast(msg, type = 'nominal') {
    document.querySelectorAll('.fg-toast').forEach(t => t.remove());

    // an unrecognised type is a bug, not a success — fail loud, not green
    const color = TOAST_COLORS[type] || TOAST_COLORS.info;
    const el    = document.createElement('div');
    el.className = 'fg-toast';
    el.style.setProperty('--toast-tone',color);

    // built with DOM APIs, not innerHTML: a malicious API error message
    // must not be able to inject markup here.
    const ic = document.createElement('div');
    ic.className = 'fg-toast-ic';
    // trusted, built-in glyph markup (not user data) — safe to set as innerHTML
    ic.innerHTML = icon(['nominal','success','watch','warning','critical','error','info'].includes(type)?type:'info',19);
    const span = document.createElement('span');
    span.textContent = String(msg == null ? '' : msg);
    el.appendChild(ic);
    el.appendChild(span);

    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity   = '1';
      el.style.transform = 'translateX(0)';
    });
    setTimeout(() => {
      el.style.opacity   = '0';
      el.style.transform = 'translateX(12px)';
      setTimeout(() => el.remove(), 280);
    }, 3200);
  }

  // ── CONFIRM DIALOG ─────────────────────────────────────────────────────
  //
  // FIX: previously used (onConfirm.toString())() as the onclick string.
  // That serializes the function, breaking all closure variables — they
  // resolve against the element's own scope and the button's id="modal-confirm-btn"
  // ends up as the value of any variable named `id`, `teamId`, etc.
  //
  // Fix: store the callback in _pendingConfirm and call it via _runConfirm().
  // Closures are preserved because the function is never serialized.

  let _pendingConfirm = null;

  function confirm(message, onConfirm, options={}) {
    const neutral=options.tone==='neutral';
    const body = `
      <div style="text-align:center;padding:12px 0 4px;">
        <div class="fg-confirm-icon${neutral?' neutral':''}">${entityIcon('incident')}</div>
        <div style="font-size:var(--fs-md);font-weight:600;color:var(--ink,#1c1d20);margin-bottom:6px;">${escape(message)}</div>
        <div style="font-size:var(--fs-sm);color:var(--ink-3,#8b909a);">${escape(options.detail || 'Review the stated consequence before confirming.')}</div>
      </div>`;

    open(options.title || 'Confirm action', body, [
      { label: 'Cancel',  class: 'btn-ghost',  onclick: 'OpsModal.close()' },
      { label: options.confirmLabel || 'Confirm', class: neutral?'btn-primary':'btn-danger', onclick: 'OpsModal._runConfirm()', id: 'modal-confirm-btn' },
    ], {dialog:true});

    // MUST be set after open() — open() calls close() internally which nulls _pendingConfirm
    _pendingConfirm = onConfirm;
  }

  async function _runConfirm() {
    const fn = _pendingConfirm;
    if (typeof fn !== 'function') return;
    const overlay = document.getElementById('ops-modal-overlay');
    _pendingConfirm = null;
    setLoading('modal-confirm-btn', true);
    try {
      await fn();
      if (overlay && document.getElementById('ops-modal-overlay') === overlay) close();
    } catch (error) {
      if (overlay && document.getElementById('ops-modal-overlay') === overlay) {
        _pendingConfirm = fn;
        setLoading('modal-confirm-btn', false);
      }
      toast(error.message || 'The action could not be completed. Please retry.', 'error');
    }
  }

  // ── SHARED DATE/TIME FORMATTING ───────────────────────────────────────
  // Most record dates already used en-GB day/month/year consistently
  // (Joined, Submitted, Due…). But a handful of fields — Alert "Reported",
  // Audit "Timestamp", Client "Last Login", the map popup's "Reported"/
  // "Last ping" — called toLocaleString()/toLocaleTimeString() with no
  // locale argument, which renders in whatever locale the *browser* is
  // set to. Two ops staff on the same screen, one with a US-locale
  // browser and one with en-GB, would see the same timestamp as
  // "7/15/2026, 10:30 PM" on one machine and "15/07/2026, 22:30" on the
  // other — for a Lagos-based team that's a real inconsistency, not just
  // a style nit. These two helpers are the one place absolute dates and
  // date+times get formatted; always en-GB (day before month, like every
  // other date already in the app), always explicit.
  function suppliedDate(ds) {
    if(ds==null || ds==='' || typeof ds==='boolean' || Array.isArray(ds)) return null;
    const date=new Date(ds);
    if(!Number.isFinite(date.getTime())) return null;
    if(typeof ds==='string' && /^\d{4}-\d{2}-\d{2}$/.test(ds) && date.toISOString().slice(0,10)!==ds) return null;
    return date;
  }
  function fmtDate(ds) {
    const date=suppliedDate(ds);
    if(!date) return ds==null || ds==='' ? missing.absent : missing.unknown;
    return date.toLocaleDateString('en-GB', { timeZone:'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric' });
  }
  function fmtDateTime(ds) {
    const date=suppliedDate(ds);
    if(!date) return ds==null || ds==='' ? missing.absent : missing.unknown;
    if(typeof ds==='string' && /^\d{4}-\d{2}-\d{2}$/.test(ds)) return fmtDate(ds);
    return date.toLocaleString('en-GB', { timeZone:'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WAT';
  }
  function money(value,currency) {
    if (!['number','string'].includes(typeof value) || String(value).trim() === '' || !Number.isFinite(Number(value))) return 'Not supplied';
    const code=/^[A-Z]{3}$/.test(String(currency || '')) ? currency : 'Currency not supplied';
    return `${code} ${Number(value).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  }

  // Plain text in headings is escaped here; actions are trusted module markup.
  function pageHeader(o) {
    return `<header class="fg-page-header"><div><h1 class="fg-page-title">${escape(o.title || '')}</h1>${o.subtitle ? `<p class="fg-page-sub"${o.subtitleId ? ` id="${escape(o.subtitleId)}"` : ''}>${escape(o.subtitle)}</p>` : ''}</div>${o.actions ? `<div class="fg-page-actions">${actionMarkup(o.actions)}</div>` : ''}</header>`;
  }
  // Single vector owner: semantic entities, actions, navigation and feedback.
  const glyphs = {
    'sentinel-map':'<path d="m5 7 2-4h12l-2 4H5zM8 3l-1 4m5-4-1 4m5-4-1 4M19 3V1M6 9h11v12H6zM9 21v2"/><circle cx="9" cy="12" r="1"/><circle cx="14" cy="12" r="1"/><path d="M9 17h5"/>',
    'estate-map':'<path d="M3 21V8l8-4v17M11 10l10-3v14M2 21h20M6 9v2m0 3v2m9-4v2m3-3v2M7 21v-3h2v3m6 0v-4h3v4"/>',
    'incident-map':'<path d="M12 2s7 8 7 13a7 7 0 0 1-14 0c0-5 7-13 7-13zM12 9v5M12 17h.01"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon:'<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    chevron:'<path d="m6 9 6 6 6-6"/>',
    arrow:'<path d="M5 12h14m-7-7 7 7-7 7"/>',
    create:'<path d="M12 5v14M5 12h14"/>',refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 8a8 8 0 0 1 13-3l2 2M4 17l2 2a8 8 0 0 0 13-3"/>',edit:'<path d="m16 3 5 5-12 12-6 1 1-6L16 3zM13 6l5 5"/>',download:'<path d="M12 3v12M7 10l5 5 5-5M4 16v5h16v-5"/>',verify:'<path d="m5 12 4 4L19 6"/>',dispatch:'<path d="m3 3 18 9-18 9 4-9-4-9zM7 12h14"/>',delete:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',

    nominal:  '<circle cx="12" cy="12" r="10"/><path d="M7.5 12.5l3 3 6-6.5"/>',
    success:  '<circle cx="12" cy="12" r="10"/><path d="M7.5 12.5l3 3 6-6.5"/>',
    watch:    '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    warning:  '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    critical: '<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>',
    error:    '<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>',
    info:     '<circle cx="12" cy="12" r="10"/><path d="M12 11v5M12 8h.01"/>',
    rain:'<path d="M7 15a4.5 4.5 0 0 1-.5-8.97 5.5 5.5 0 0 1 10.6 1.4A4 4 0 0 1 17 15H7zM8 18l-.5 2.5M12 18l-.5 3M16 18l-.5 2.5"/>',
    calendar:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    analytics:'<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/>',
    driver:'<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M7 20h10M9 16v4M15 16v4"/>',
    firmware:'<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',
    close:'<path d="m6 18 12-12M6 6l12 12"/>',
    more:'<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
    document:'<path d="M14 2H6v20h12V6l-4-4zM14 2v4h4M9 11h6M9 15h6"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    payment:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    integration:'<path d="M8 3v5M16 3v5M6 8h12v4a6 6 0 0 1-12 0zM12 18v4"/>',
    mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
    notification:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M9.5 20a2.6 2.6 0 0 0 5 0M12 2V1"/>',
    phone:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/>',
    estate:'<path d="M3 10 12 3l9 7M5 9v12h14V9M9 21v-7h6v7"/>',
    asset:'<path d="M3 8c3 3 6-3 9 0s6-3 9 0M3 16c3 3 6-3 9 0s6-3 9 0"/>',
    device:'<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
    incident:'<path d="m12 3 10 18H2L12 3zM12 9v5M12 17h.01"/>',
    crew:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v3"/>',
    link:'<path d="M8 12h8M9 7H7a5 5 0 0 0 0 10h2M15 7h2a5 5 0 0 1 0 10h-2"/>',
    water:'<path d="M12 3s7 8 7 12a7 7 0 0 1-14 0c0-4 7-12 7-12z"/>',
    outfall:'<path d="M3 12h12M10 7l5 5-5 5M20 4v16"/>',
    structure:'<path d="M3 21V9l9-6 9 6v12M3 13h18M7 21v-8m5 8v-8m5 8v-8M1 21h22"/>',
    pump:'<circle cx="12" cy="12" r="8"/><path d="M12 4v8l6 4M12 12l-6 4"/>',
    culvert:'<path d="M4 21v-9a8 8 0 0 1 16 0v9M4 21h16M9 21v-9M15 21v-9"/>',
    gate:'<path d="M4 3v18M20 3v18M4 8h16M4 16h16M9 8v8M15 8v8"/>',
    maintenance:'<path d="M14 6a5 5 0 0 0-6 6L3 17a3 3 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-4-4 3-3z"/>',
    workorder:'<path d="M8 4H5v17h14V4h-3M8 2h8v4H8zM8 11h8M8 16h6"/>',
    billing:'<path d="M5 2h14v20l-3-2-4 2-4-2-3 2zM8 7h8M8 11h8M8 15h5"/>',
    support:'<path d="M21 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 19 0z"/><path d="M7 10h10M7 14h6"/>',
    provider:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12h18M10 12v3h4v-3"/>',
    client:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    report:'<path d="M14 2H6v20h12V6l-4-4zM14 2v4h4M9 17v-3M12 17v-6M15 17v-4"/>',
    fieldreport:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 2v6h6M9 13h6M9 17h6"/>',
    forecast:'<path d="M3 18 9 12l4 4 8-12M15 4h6v6"/>',
    situation:'<path d="M2 12h5l3-8 4 16 3-8h5"/>',
    sla:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    dashboard:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    audit:'<path d="M8 4H5v17h14V4h-3M8 2h8v4H8zM8 11h8M8 16h6"/>',
    settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>'
  };
  const aliases={property:'estate',properties:'estate',sensors:'device',sensor:'device',primary:'asset',secondary:'asset',tertiary:'asset',waterbody:'water',network:'link',assets:'asset',teams:'crew',alerts:'incident',jobs:'workorder',reports:'report','field-reports':'fieldreport',providers:'provider',clients:'client','team-members':'crew'};
  function icon(kind,size) {
    const iconSize=[14,15,16,18,19,20,22,24,36,40].includes(size) ? size : 18;
    const dimensions=` width="${iconSize}" height="${iconSize}"`;
    return `<svg viewBox="0 0 24 24"${dimensions} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyphs[aliases[kind] || kind] || glyphs.asset}</svg>`;
  }
  function actionIcon(kind) { return ['search','create','refresh','edit','download','verify','dispatch','delete'].includes(kind) ? icon(kind,18) : ''; }
  function actionMarkup(html) {
    return html.replace(/(<button\b[^>]*>)([\s\S]*?)(<\/button>)/g,(whole,start,content,end)=>{
      const text=content.replace(/<[^>]*>/g,'').trim().replace(/^\+\s*/,'');
      const kind=/^(?:create|register|invite|schedule|prepare|plan)\b/i.test(text)?'create':/^(?:refresh|retry)\b/i.test(text)?'refresh':/^edit\b/i.test(text)?'edit':/^(?:download|export)\b/i.test(text)?'download':/^(?:verify|mark complete|approve)\b/i.test(text)?'verify':/^dispatch\b/i.test(text)?'dispatch':/^delete\b/i.test(text)?'delete':null;
      if(!kind) return start+content+end;
      return start+actionIcon(kind)+content.replace(/<svg\b[\s\S]*?<\/svg>/g,'').replace(/^\s*\+\s*/,'')+end;
    });
  }
  function workspace(o) {
    return `<nav class="fg-workspace" aria-label="${escape(o.name)}">${o.options.map(([value,title])=>`<button type="button" data-workspace="${escape(value)}" aria-pressed="${value===o.value}" onclick="${o.handler}('${sid(value)}')">${escape(title)}</button>`).join('')}</nav>`;
  }
  function label(value) {
    const text=String(value ?? '').replace(/[_-]+/g,' ').trim();
    return text ? (text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()).replace(/\b(?:sla|mrr|eta|api|mqtt|ota|pwa|csv|pdf|ngn|gps|json|hmac|usd|gbp|eur|ip|rma)\b/gi,word=>word.toUpperCase()) : 'Not supplied';
  }
  function relativeTime(value,now=Date.now()) {
    if(value==null || value==='') return missing.absent;
    const date=suppliedDate(value);if(!date) return 'Unknown';
    if(typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return fmtDate(value);
    const timestamp=date.getTime();
    const delta=now-timestamp,seconds=Math.floor(Math.abs(delta)/1000);
    if(seconds<60) return delta<0 ? 'In less than a minute' : 'Just now';
    const compact=seconds<3600?`${Math.floor(seconds/60)}m`:seconds<86400?`${Math.floor(seconds/3600)}h`:`${Math.floor(seconds/86400)}d`;
    return delta<0 ? `In ${compact}` : `${compact} ago`;
  }
  function provenance(fields,note='') {
    return `<section class="fg-provenance" aria-label="Data context"><dl>${fields.map(([key,value])=>`<div><dt>${escape(key)}</dt><dd>${escape(value == null || value === '' ? missing.absent : value)}</dd></div>`).join('')}</dl>${note ? `<details class="fg-data-help"><summary>About this data</summary><p>${escape(note)}</p></details>` : ''}</section>`;
  }
  // Date-only obligations are due for the whole WAT calendar day. Missing or
  // invalid dates cannot establish an overdue state.
  function pastDue(value,now=Date.now()) {
    if (value == null || value === '' || typeof value === 'boolean') return false;
    const text=String(value);
    const dateOnly=/^\d{4}-\d{2}-\d{2}$/.test(text);
    const calendar=dateOnly?Date.parse(text+'T00:00:00Z'):null;
    if (dateOnly && (!Number.isFinite(calendar)||new Date(calendar).toISOString().slice(0,10)!==text)) return false;
    const deadline=dateOnly?Date.parse(text+'T23:59:59.999+01:00'):Date.parse(text);
    return Number.isFinite(deadline) && Number.isFinite(Number(now)) && deadline<Number(now);
  }
  // Controlled missing-state dictionary; these conditions must not be conflated.
  const missing = Object.freeze({ absent:'Not supplied', unknown:'Unknown', unavailable:'Unavailable', unlinked:'Not linked', unassessed:'Not assessed', empty:'No records', pending:'Pending' });
  const moduleTitles=Object.freeze({situation:'Command centre',network:'Network map',sensors:'Device fleet',devices:'Device fleet',alerts:'Incidents',jobs:'Services',teams:'Teams','field-reports':'Field reports',support:'Client support',forecast:'Risk forecast',maintenance:'Services',reports:'Reports',sla:'Service performance',dashboard:'Portfolio health',properties:'Estates',assets:'Assets',clients:'Clients',billing:'Billing','team-members':'Staff',providers:'Service providers',audit:'Activity log',settings:'Settings',administration:'Administration'});
  function permissionLabel(key) {
    const parts=String(key ?? '').split('.');
    const moduleKey=parts.shift().replace(/_/g,'-');
    const title=moduleTitles[moduleKey] || label(moduleKey);
    return parts.length ? title+' · '+parts.map(label).join(' · ') : title;
  }
  function failure(title,error,retry,page=false) {
    const denied=error?.status===403 || /\b403\b/.test(error?.message || '');
    return (page ? pageHeader({title,subtitle:'Review operational records and their current availability'}) : '') + `<section class="fg-state" role="alert"><h2>${denied ? 'Access restricted' : escape(title) + ' unavailable'}</h2><p>${denied ? 'Your role does not allow access to these records. Ask an administrator to review your access.' : 'The records could not be loaded. This is not an empty result; retry to restore this view.'}</p>${!denied && retry ? `<button class="fg-action" onclick="${retry}">Retry</button>` : ''}${error?.message ? `<details><summary>Diagnostic details</summary><p>${escape(error.message)}</p></details>` : ''}</section>`;
  }
  const count = value => (typeof value==='number' || typeof value==='string' && value.trim()!=='') && Number.isSafeInteger(Number(value)) && Number(value)>=0 ? Number(value) : null;
  function reading(value,min=-Infinity,max=Infinity) {
    if (!['number','string'].includes(typeof value) || String(value).trim()==='') return null;
    const n=Number(value);
    return Number.isFinite(n) && n>=min && n<=max ? n : null;
  }
  const navScopes=Object.freeze({alerts:'Returned incidents not marked resolved, closed, dismissed or cancelled', 'field-reports':'Returned field reports submitted for review',support:'Returned support requests not marked resolved or closed'});
  function scopeCount(rows,kind) {
    if(!Array.isArray(rows) || rows.some(row=>!row || typeof row!=='object' || Array.isArray(row)))return null;
    if(kind==='field-reports')return rows.filter(row=>String(row.status || '').toLowerCase()==='submitted').length;
    const closed=kind==='alerts'?['resolved','closed','dismissed','cancelled']:kind==='support'?['resolved','closed']:null;
    return closed ? rows.filter(row=>!closed.includes(String(row.status || '').toLowerCase())).length : null;
  }
  function updateNavCount(kind,value) {
    if(typeof document==='undefined')return;
    const badge=document.getElementById('nav-badge-'+kind),nav=document.getElementById('nav-'+kind),n=count(value);
    const description=navScopes[kind] || 'Returned records';
    if(badge){badge.textContent=n===null?'?':String(n);badge.style.display=n===0?'none':'inline-flex';badge.setAttribute('aria-hidden','true');badge.setAttribute('data-availability',n===null?'unavailable':'known');}
    if(nav){nav.title=n===null?description+' · count unavailable':n+' · '+description+' · not a complete platform total';nav.setAttribute('aria-description',nav.title);}
  }
  function readArray(response,label='Record feed',keys=['data']) {
    if(Array.isArray(response)) return response;
    for(const key of keys) {
      const value=response?.[key];
      if(value==null) continue;
      if(Array.isArray(value)) return value;
      throw new Error(label+' is unavailable: a record list was not supplied.');
    }
    throw new Error(label+' is unavailable: a record list was not supplied.');
  }
  function readRecord(response,label='Record',key='data') {
    const value=response?.[key];
    if(value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).length) return value;
    throw new Error(label+' is unavailable: record details were not supplied.');
  }
  function recordFailure(title,error,retry,back) {
    return pageHeader({title,subtitle:'Record availability',actions:`<button type="button" class="fg-action" onclick="${back}">Back to list</button>`})+failure(title,error,retry);
  }
  const statusRegistry = Object.freeze(Object.fromEntries(Object.entries({
    workflow:{verified:'ok',resolved:'ok',completed:'ok',paid:'ok',active:'ok',approved:'ok',sent_to_client:'ok',critical:'danger',high:'danger',failed:'danger',rejected:'danger',suspended:'danger',overdue:'danger',pending:'warn',awaiting_review:'warn',submitted:'warn',under_review:'warn',scheduled:'neutral',draft:'neutral',cancelled:'neutral',offline:'neutral',in_progress:'neutral',dispatched:'neutral',en_route:'neutral'},
    estate:{submitted:'warn',inspection_scheduled:'neutral',inspection_ongoing:'neutral',report_ready:'warn',quote_sent:'neutral',payment_pending:'warn',payment_completed:'ok',deployment_scheduled:'neutral',active:'ok',suspended:'danger',cancelled:'neutral'},
    support:{new:'warn',open:'warn',pending:'warn',in_progress:'neutral',resolved:'ok',closed:'ok',cancelled:'neutral'},
    maintenance:{scheduled:'neutral',in_progress:'neutral',resolved:'ok',closed:'ok',completed:'ok',cancelled:'neutral'},
    workorder:{draft:'neutral',dispatched:'neutral',accepted:'neutral',en_route:'neutral',in_progress:'neutral',completed:'warn',verified:'ok',declined:'danger',rejected:'danger',cancelled:'neutral'},
    provider:{pending:'warn',active:'ok',rejected:'danger',suspended:'danger'},
    condition:{good:'ok',fair:'warn',degraded:'warn',poor:'caution',restricted:'danger',blocked:'danger',critical:'danger'},
    priority:{low:'neutral',normal:'neutral',medium:'warn',high:'warn',urgent:'danger',critical:'danger'},
    severity:{low:'neutral',minor:'neutral',medium:'warn',moderate:'warn',elevated:'warn',high:'caution',critical:'danger'},
    risk:{low:'ok',moderate:'warn',medium:'warn',elevated:'warn',high:'caution',critical:'danger'},
    crew:{available:'ok',on_site:'ok',en_route:'warn',returning:'warn',idle:'neutral'},
    payment:{paid:'ok',overdue:'danger',failed:'danger',partial:'warn',unpaid:'neutral',pending:'neutral'},
    ledger:{successful:'ok',pending:'neutral',processing:'neutral',failed:'danger',refunded:'neutral'},
    device:{online:'ok',degraded:'warn',offline:'neutral',maintenance:'neutral'},
    sensordata:{ok:'ok',stale:'warn',frozen:'warn',implausible:'danger',unknown:'neutral'},
    telemetryinput:{partial:'warn',unknown:'neutral'},
    drainage:{normal:'ok',elevated:'warn',high:'caution',critical:'danger',unknown:'neutral'},
    command:{queued:'neutral',pending:'neutral',delivered:'neutral',acknowledged:'ok',failed:'danger',cancelled:'neutral',expired:'caution'},
    rollout:{active:'warn',paused:'neutral',completed:'ok',rolled_back:'danger',cancelled:'neutral'},
    account:{active:'ok',invited:'warn',suspended:'danger',inactive:'neutral'},
    grant:{allowed:'ok',denied:'neutral',unknown:'neutral'},
    audit:{success:'ok',succeeded:'ok',completed:'ok',allowed:'ok',failed:'danger',failure:'danger',denied:'danger',blocked:'danger',error:'danger'},
    review:{acknowledged:'ok',pending:'warn'},
    integrity:{warning:'warn',critical:'danger'},
    recommendation:{critical:'danger',warning:'warn',monitoring:'neutral',normal:'neutral',low:'neutral'},
    incident:{active:'neutral',acknowledged:'neutral',resolved:'ok',closed:'ok'},
  }).map(([domain,values])=>[domain,Object.freeze(values)])));
  function statusTone(value,domain='workflow') {
    return statusRegistry[domain]?.[String(value ?? '').toLowerCase()] || 'neutral';
  }
  function status(value,displayLabel,contextTone,domain='workflow') {
    const key=String(value ?? '').toLowerCase();
    const display=['severity','risk'].includes(domain) && key==='medium'?'Moderate':domain==='severity'&&key==='minor'?'Low':label(value);
    return detailPill(escape(displayLabel || display),['ok','warn','caution','danger','neutral'].includes(contextTone)?contextTone:statusTone(key,domain));
  }
  function entityIcon(kind) { return icon(kind); }
  function recordActions(html) {
    html=actionMarkup(html);
    // Header actions are a component input, not a post-render DOM repair.
    // Give dynamically constructed actions the same native control contract.
    html=html.replace(/<button\b([^>]*)>/g,(whole,attributes)=>{
      if(/\bfg-action\b/.test(attributes)) return whole;
      const primary=/class="[^"]*\b(?:btn-primary|primary)\b/.test(attributes);
      const danger=/class="[^"]*\b(?:btn-danger|danger)\b/.test(attributes);
      const secondary=/class="[^"]*\b(?:btn-ghost|fg-action-neutral)\b/.test(attributes);
      const classes='fg-action'+(primary?' fg-action-primary':'')+(danger?' danger':'')+(secondary?' fg-action-neutral':'');
      return '<button'+(/class="/.test(attributes)?attributes.replace('class="','class="'+classes+' '):attributes+' class="'+classes+'"')+'>';
    });
    const buttons=html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) || [];
    // Preserve arbitrary custom markup; only group a plain sequence of actions.
    if(!buttons.length || html.replace(/<button\b[^>]*>[\s\S]*?<\/button>/g,'').trim()) return html;
    buttons.sort((a,b)=>Number(/class="[^"]*\bprimary\b|fg-action-primary/.test(b))-Number(/class="[^"]*\bprimary\b|fg-action-primary/.test(a)));
    const safe=buttons.filter(b=>!(/class="[^"]*\b(?:danger|btn-danger)\b/.test(b)));
    const visible=safe.slice(0,2), overflow=buttons.filter(b=>!visible.includes(b));
    return visible.join('') + (overflow.length ? `<details class="fg-action-menu"><summary>More actions</summary><div class="fg-action-menu-items">${overflow.join('')}</div></details>` : '');
  }

  // ── SHARED DETAIL-SCREEN SHELL (fgd-*) ────────────────────────────────
  // Desktop hides the disclosure control, so it must always expose metadata.
  // Keep this in sync across actual breakpoint changes, not just first render.
  const recordBreakpoint = typeof window!=='undefined' ? window.matchMedia?.('(max-width:600px)') : null;
  recordBreakpoint?.addEventListener('change',event=>{
    document.querySelectorAll('.fgd-meta-disclosure').forEach(el=>{el.open=!event.matches;});
  });
  // Every module's detail page renders the same two-column glass layout via
  // this one builder, so Properties / Clients / Assets / Reports / Teams /
  // Members / Field-reports all match. Styling is injected above (fgd-*).
  //   opts: { back (JS onclick string), crumbRoot, title, avatar {text,bg},
  //           chips [{cls,label,dot}], meta [[k,v],…], actions (html),
  //           note (html), sections [{id,title,meta,body}], sidebar (html) }
  let recordSequence=0;
  const recordTabPositions=new WeakMap();
  function selectRecordTab(root,id,focus=false) {
    if(!root)return;
    const tabs=[...root.querySelectorAll('.fgd-secnav [role="tab"]')];
    const tab=tabs.find(t=>t.dataset.section===id);
    if(!tab)return;
    const scroller=root.closest('.content');
    const positions=recordTabPositions.get(root) || new Map();
    const previous=tabs.find(t=>t.getAttribute('aria-selected')==='true');
    if(scroller && previous)positions.set(previous.dataset.section,scroller.scrollTop);
    recordTabPositions.set(root,positions);
    tabs.forEach(t=>{const selected=t===tab;t.setAttribute('aria-selected',String(selected));t.tabIndex=selected?0:-1;});
    root.querySelectorAll('.fgd-main > [role="tabpanel"]').forEach(panel=>{panel.hidden=panel.dataset.section!==id;});
    if(focus)tab.focus({preventScroll:true});
    if(scroller){const top=scroller.scrollTop+root.querySelector('.fgd-secnav').getBoundingClientRect().top-scroller.getBoundingClientRect().top;scroller.scrollTop=positions.get(id) ?? Math.min(scroller.scrollTop,Math.max(0,top-12));}
    window.requestAnimationFrame?.(()=>window.dispatchEvent(new Event('resize')));
  }
  if(typeof document!=='undefined')document.addEventListener?.('keydown',event=>{
    const tab=event.target.closest?.('.fgd-secnav [role="tab"]');if(!tab)return;
    const tabs=[...tab.parentElement.querySelectorAll('[role="tab"]')];
    const index=tabs.indexOf(tab);
    const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;
    if(next===null)return;event.preventDefault();selectRecordTab(tab.closest('.fgd'),tabs[next].dataset.section,true);
  });
  function detailShell(o) {
    const recordId='record-'+(++recordSequence);
    const chips = (o.chips || []).filter(Boolean).map(c =>
      `<span class="fgd-chip ${c.cls || 'neutral'}">${c.dot ? '<span class="dot"></span>' : ''}${c.label}</span>`).join('');
    const meta = (o.meta || []).filter(m => m && m[1] != null && m[1] !== '').map(m =>
      `<span><b>${m[0]}</b> ${m[1]}</span>`).join('');
    const avatar = o.avatar
      ? `<div class="fgd-avatar" aria-hidden="true">${o.avatar.text || ''}</div>` : '';
    const sections = (o.sections || []).map(section=>({...section}));
    if(o.note)sections.push({id:'context',title:'About this record',body:o.note});
    const nav = sections.map((s, i) =>
      `<button type="button" role="tab" id="${recordId}-tab-${i}" aria-controls="${recordId}-panel-${i}" aria-selected="${i===0}" tabindex="${i===0?0:-1}" data-section="${escape(s.id)}" onclick="OpsModal.selectRecordTab(this.closest('.fgd'),this.dataset.section)">${s.title}</button>`).join('');
    // Legacy modules also supply bare tables. Bound each table independently so
    // a wide related-record feed cannot widen the record or its mobile chrome.
    // An existing outer lv-scroll remains harmless: only the inner region scrolls.
    const tableScroll=body=>String(body??'').replace(/<table\b[\s\S]*?<\/table>/gi,table=>`<div class="lv-scroll fg-record-table-scroll">${table}</div>`);
    const cards=sections.map((s,i)=>`<section class="fgd-card" role="tabpanel" id="${recordId}-panel-${i}" aria-labelledby="${recordId}-tab-${i}" data-section="${escape(s.id)}" tabindex="0" ${i?'hidden':''}><div class="fgd-card-head"><h2>${s.title}</h2></div><div class="fgd-card-body">${tableScroll(s.body)}</div></section>`).join('');
    return `
      <div class="fgd">
        <div class="fgd-crumb"><button type="button" aria-label="Back to ${escape(o.crumbRoot || 'list')}" onclick="if(window.OpsShell)OpsShell.restoreList();${o.back || ''};if(!this.isConnected&amp;&amp;window.fgListRoute)window.fgListRoute()">${icon('arrow',18)}<span>← ${escape(o.crumbRoot || 'Back to list')}</span></button></div>
        <div class="fgd-card fgd-header">
          ${avatar}
          <div class="fgd-header-main">
            <div class="fgd-header-top"><h1 class="fgd-title">${o.title || ''}</h1>${chips}</div>
            ${o.reference ? `<div class="fgd-reference">${escape(o.reference)}</div>` : ''}
            ${meta ? `<details class="fgd-meta-disclosure" ${typeof window === 'undefined' || !window.matchMedia?.('(max-width:600px)').matches ? 'open' : ''}><summary>Record context</summary><div class="fgd-meta">${meta}</div></details>` : ''}
          </div>
          ${o.actions ? `<div class="fgd-actions">${recordActions(o.actions)}</div>` : ''}
        </div>
        ${o.decision ? `<dl class="fg-decision">${o.decision.filter(Boolean).map(([key,value])=>`<div><dt>${escape(key)}</dt><dd>${escape(value == null || value === '' ? missing.absent : value)}</dd></div>`).join('')}</dl>` : ''}
        ${sections.length?`<div class="fgd-secnav" role="tablist" aria-label="Record sections">${nav}</div>`:''}
        <div class="fgd-grid">
          <div class="fgd-main">${cards}</div>
          ${o.sidebar ? `<div class="fgd-side">${o.sidebar}</div>` : ''}
        </div>
      </div>`;
  }
  function fact(k, v) { return `<div class="fgd-fact"><span class="k">${k}</span><span class="v">${v == null || v === '' ? missing.absent : v==='—' ? `<span class="fg-missing" title="${missing.absent}" aria-label="${missing.absent}">—</span>` : v}</span></div>`; }
  function textBlock(title,value) { return `<div class="fg-narrative"><h3>${escape(title)}</h3><p>${escape(value == null || value === '' ? missing.absent : value)}</p></div>`; }
  function message(o) {
    const author=o.author || 'Author not supplied';
    return `<article class="fg-thread-message ${o.side==='staff'?'fg-thread-staff':'fg-thread-external'}" aria-label="${escape(author)}"><div class="fg-thread-author">${escape(author)}${o.original?' · original request':''}</div><p>${escape(o.body == null || o.body==='' ? missing.absent : o.body)}</p><time>${fmtDateTime(o.createdAt)}</time></article>`;
  }
  function detailPill(label, cls) { return `<span class="fgd-pill ${cls || 'secondary'}">${label}</span>`; }
  function emptyState(icon, title, sub, options={}) { return `<div class="fgd-empty${options.compact ? ' fg-state-compact' : ''}">${icon || ''}<div class="t">${escape(title)}</div>${sub ? `<div class="s">${escape(sub)}</div>` : ''}</div>`; }
  function loading(title='Loading records…') { return `<div class="fg-loading" role="status"><span class="fg-action-spinner" aria-hidden="true"></span><span>${escape(title)}</span></div>`; }
  // Evidence is only shown when supplied. Missing payloads are not empty records.
  function evidence(items, emptyLabel = 'No evidence attached') {
    if (!Array.isArray(items)) return '<div class="capability-note">Evidence was not supplied with this record.</div>';
    if (!items.length) return `<div class="capability-note">${escape(emptyLabel)}</div>`;
    return `<div class="evidence-links">${items.map((item, i) => {
      const entry = typeof item === 'string' ? { url:item } : (item || {});
      const raw = entry.url || entry.file_url || entry.photo_url || entry.storage_url;
      const filename = escape(entry.name || entry.filename || `Evidence ${i + 1}`);
      const metadata=[entry.kind ? label(entry.kind) : entry.mime_type,entry.captured_at ? 'Captured ' + fmtDateTime(entry.captured_at) : null,entry.created_at ? 'Uploaded ' + fmtDateTime(entry.created_at) : null].filter(Boolean).map(escape).join(' · ');
      const context=(entry.caption ? `<p>${escape(entry.caption)}</p>` : '')+(metadata ? `<div class="fg-evidence-meta">${metadata}</div>` : '<div class="fg-evidence-meta">Capture and upload details not supplied</div>');
      const unavailable=()=>`<article class="fg-evidence"><span>${filename} · Link unavailable</span>${context}</article>`;
      try {
        const url = new URL(raw, location.href);
        if (typeof raw !== 'string' || !raw.trim() || !['http:', 'https:'].includes(url.protocol)) return unavailable();
        return `<article class="fg-evidence"><a href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">${filename} ↗</a>${context}</article>`;
      } catch (_) { return unavailable(); }
    }).join('')}</div>`;
  }
  function evidenceGroup(groups) {
    return groups.map(([title,items])=>`<div class="fg-evidence-group"><h3>${escape(title)}</h3>${evidence(items)}</div>`).join('');
  }
  // Populated groups stay visible even when another constituent feed is absent.
  // Collapse only non-working sections, preserving returned-empty vs unknown.
  function collectionState(...groups) {
    if(groups.some(items=>Array.isArray(items) && items.length>0)) return null;
    return groups.every(Array.isArray) ? 'empty' : 'unavailable';
  }

  // ── SHARED VITAL-SIGN COLOR THRESHOLDS ────────────────────────────────
  // Battery % and signal % are both "lower = worse" gauges. Three separate
  // copies of this banding used to exist (Sentinel's vitColor(), and two
  // different inline versions on the dashboard) with different thresholds
  // and even different "healthy" colors (green in one, neutral grey in
  // another) — so a 47% battery read fine on one screen and unremarkably
  // grey on another, and neither flagged it as low. One scale, applied
  // everywhere a battery or signal percentage renders: <20% critical,
  // 20–49% low, 50%+ healthy.
  function vitalColor(v) {
    if (reading(v,0,100)===null) return 'var(--ink-3)';
    if (v < 20) return 'var(--err)';
    if (v < 50) return 'var(--warn)';
    return 'var(--ok)';
  }
  // A raw level percentage is not a severity assessment: site/profile thresholds
  // vary. Drainage-state badges carry the supplied assessment independently.
  function waterLevelColor(v,trusted=false) {
    if(trusted!==true || reading(v,0,100)===null) return 'var(--ink-3)';
    return 'var(--ink)';
  }

  // ── SHARED KPI STRIP ───────────────────────────────────────────────────
  // One card design for every module (Dashboard/Sentinel/Properties/Clients/
  // Alerts used to each invent their own — icon+sentence-case vs uppercase+
  // border vs uppercase+colored numerals). CSS lives once in index.html as
  // .fg-kpis/.fg-kpi. Renders a row of stat cards from plain data so no
  // module needs its own markup for "label, big number, optional sub-line".
  //   opts: { icon (inner SVG path markup, optional), color (CSS color,
  //           used for icon tint), label, value, sub (optional), subClass
  //           ('ok'|'warn'|'err', optional), onClick (JS string, optional),
  //           active (bool, optional — highlights as the current filter) }
  function kpiCard(opts) {
    const color = opts.color || 'var(--blue-hi)';
    const ic = opts.icon
      ? `<div class="fg-kpi-ic" style="background:var(--surface-2);color:${color}">${/^\s*<svg\b/.test(opts.icon) ? opts.icon : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${opts.icon}</svg>`}</div>`
      : '';
    const cls = `fg-kpi fg-metric${opts.onClick ? ' clickable' : ''}${opts.active ? ' active' : ''}`;
    const attrs = opts.onClick
      ? ` type="button" onclick="${opts.onClick}" aria-pressed="${Boolean(opts.active)}"`
      : '';
    const tag=opts.onClick?'button':'div';
    return `<${tag} class="${cls}"${attrs}>${ic}<div class="fg-kpi-body">
        <div class="fg-kpi-label fg-metric-label">${opts.label}</div>
        <div class="fg-kpi-val fg-metric-value">${opts.value}</div>
        ${opts.sub != null ? `<div class="fg-kpi-sub ${opts.subClass || ''}">${opts.sub}</div>` : ''}
      </div></${tag}>`;
  }
  function kpiStrip(cards) {
    return `<div class="fg-kpis fg-metrics">${cards.map(kpiCard).join('')}</div>`;
  }

  // Div-icon markers are not native buttons. Activate their click behavior
  // on keydown, including Space, without relying on legacy keypress events.
  function keyboardMarker(marker) {
    const bound=new WeakSet();
    const bind=()=>{
      const element=marker.getElement(); if (!element || bound.has(element)) return;
      bound.add(element);
      element.setAttribute('aria-label',marker.options.title || 'Map record');
      element.addEventListener('keydown',event=>{
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault(); event.stopPropagation();
        marker.fire('click',{latlng:marker.getLatLng()});
      });
    };
    marker.on('add',bind);
    bind();
    return marker;
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────────

  return {
    open, close, requestClose, confirmLeave, setLoading, collectionState, loading, selectRecordTab,
    field, row, link, getFormData,
    pageHeader, workspace, moduleTitles, permissionLabel, label, relativeTime, provenance, status, statusTone, missing, failure, count, reading, scopeCount, updateNavCount, readArray, readRecord, recordFailure, icon, actionIcon, actionMarkup, entityIcon, detailShell, fact, textBlock, message, detailPill, emptyState, evidence, evidenceGroup,
    apiGet, apiPost, apiPut, apiDelete,
    escape, sid,
    toast, confirm, _runConfirm,
    kpiCard, kpiStrip, vitalColor, waterLevelColor,
    suppliedDate, fmtDate, fmtDateTime, money, pastDue, keyboardMarker,
  };

})();
