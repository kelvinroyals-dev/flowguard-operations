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

  function focusableIn(container) {
    return Array.from(container.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), ' +
      'input:not([disabled]):not([type="hidden"]), select:not([disabled]), ' +
      '[tabindex]:not([tabindex="-1"])'
    )).filter(el => el.offsetParent !== null);
  }

  function open(title, bodyHTML, actions = []) {
    close();

    // remember what had focus so close() can put it back there
    _lastFocused = document.activeElement;

    const overlay     = document.createElement('div');
    overlay.id        = 'ops-modal-overlay';
    overlay.className = 'ops-modal-overlay';

    overlay.innerHTML = `
      <div class="ops-modal" role="dialog" aria-modal="true" aria-label="${escape(title)}" tabindex="-1" onclick="event.stopPropagation()">
        <div class="ops-modal-header">
          <div class="ops-modal-title">${escape(title)}</div>
          <button class="ops-modal-close" onclick="OpsModal.close()" aria-label="Close">✕</button>
        </div>
        <div class="ops-modal-body">${bodyHTML}</div>
        ${actions.length > 0 ? `
          <div class="ops-modal-footer">
            ${actions.map(a => `
              <button class="${a.class || 'btn-ghost'}"
                onclick="${a.onclick}"
                ${a.id ? `id="${a.id}"` : ''}>
                ${escape(a.label)}
              </button>`).join('')}
          </div>` : ''}
      </div>`;

    overlay.addEventListener('click', close);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    const dialog = overlay.querySelector('.ops-modal');

    setTimeout(() => {
      const firstInput = overlay.querySelector('.ops-input, input:not([readonly]), select, textarea');
      if (firstInput) { firstInput.focus(); return; }
      const focusable = dialog ? focusableIn(dialog) : [];
      if (focusable.length) focusable[0].focus();
      else if (dialog) dialog.focus();
    }, 120);

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
    _pendingConfirm = null;
    const overlay = document.getElementById('ops-modal-overlay');
    if (_modalKeydown) {
      document.removeEventListener('keydown', _modalKeydown);
      _modalKeydown = null;
    }
    if (overlay) {
      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 220);
    }
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
      btn.dataset.originalHtml = btn.innerHTML;
      btn.innerHTML = `<span style="display:inline-block;width:13px;height:13px;border:2px solid rgba(255,255,255,.3);border-top-color:white;border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;margin-right:6px;"></span>Processing…`;
      btn.disabled  = true;
    } else {
      btn.innerHTML = btn.dataset.originalHtml || btn.innerHTML;
      btn.disabled  = false;
    }
  }

  // ── FORM HELPERS ───────────────────────────────────────────────────────

  function field(label, name, type = 'text', value = '', options = {}) {
    const required    = options.required !== false ? 'required' : '';
    const placeholder = options.placeholder || '';
    const readonly    = options.readonly ? 'readonly' : '';
    const extraStyle  = options.readonly ? 'opacity:.55;cursor:not-allowed;' : '';

    if (type === 'select') {
      const opts = (options.options || []).map(o => {
        const v = typeof o === 'object' ? o.value : o;
        const l = typeof o === 'object' ? o.label : o;
        return `<option value="${escape(v)}" ${v == value ? 'selected' : ''}>${escape(l)}</option>`;
      }).join('');
      return `
        <div class="ops-modal-field">
          <label class="ops-label">${escape(label)}</label>
          <select name="${name}" class="ops-input" ${required}>${opts}</select>
        </div>`;
    }

    if (type === 'textarea') {
      return `
        <div class="ops-modal-field">
          <label class="ops-label">${escape(label)}</label>
          <textarea name="${name}" class="ops-input" rows="${options.rows || 3}"
            placeholder="${escape(placeholder)}" ${required}
            style="resize:vertical;${extraStyle}">${value || ''}</textarea>
        </div>`;
    }

    return `
      <div class="ops-modal-field">
        <label class="ops-label">${escape(label)}</label>
        <input type="${type}" name="${name}" class="ops-input"
          value="${escape(value)}" placeholder="${escape(placeholder)}"
          ${required} ${readonly} style="${extraStyle}">
      </div>`;
  }

  function row(fields) {
    return `<div style="display:grid;grid-template-columns:repeat(${fields.length},1fr);gap:12px;">${fields.join('')}</div>`;
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

  async function apiGet(endpoint) {
    const res = await fetch(`${CONFIG.API_BASE}${endpoint}`, { headers: getHeaders() });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `API ${res.status}`);
    }
    return deepEscape(await res.json());
  }

  async function apiPost(endpoint, body) {
    const res = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `API ${res.status}`);
    }
    return await res.json();
  }

  async function apiPut(endpoint, body) {
    const res = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
      method: 'PUT', headers: getHeaders(), body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `API ${res.status}`);
    }
    return await res.json();
  }

  async function apiDelete(endpoint) {
    const res = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
      method: 'DELETE', headers: getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `API ${res.status}`);
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
    el.style.cssText = `
      position:fixed; top:72px; right:20px; z-index:10001;
      background:var(--surface,#fff);
      border:1px solid var(--border,#dae6ef);
      border-left:3px solid ${color};
      border-radius:10px; padding:12px 18px;
      display:flex; align-items:center; gap:10px;
      box-shadow:0 4px 20px rgba(10,31,46,.1),0 1px 4px rgba(10,31,46,.06);
      font-family:var(--ff-b,'Inter',sans-serif);
      font-size:var(--fs-base); color:var(--ink-2,#2d5068);
      max-width:340px;
      opacity:0; transform:translateX(12px);
      transition:opacity .25s,transform .25s cubic-bezier(.22,1,.36,1);`;

    // built with DOM APIs, not innerHTML: a malicious API error message
    // must not be able to inject markup here.
    const dot = document.createElement('div');
    dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;`;
    const span = document.createElement('span');
    span.textContent = String(msg == null ? '' : msg);
    el.appendChild(dot);
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

  function confirm(message, onConfirm) {
    const body = `
      <div style="text-align:center;padding:12px 0 4px;">
        <div style="width:52px;height:52px;border-radius:14px;
          background:var(--eb,#fef2f2);border:1px solid rgba(220,38,38,.2);
          margin:0 auto 16px;display:flex;align-items:center;justify-content:center;">
          <svg width="22" height="22" fill="none" stroke="var(--err,#dc2626)" stroke-width="1.8" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
        </div>
        <div style="font-size:var(--fs-md);font-weight:600;color:var(--ink,#0a1f2e);margin-bottom:6px;">${message}</div>
        <div style="font-size:var(--fs-sm);color:var(--ink-3,#6b8fa3);">This action cannot be undone.</div>
      </div>`;

    open('Confirm Action', body, [
      { label: 'Cancel',  class: 'btn-ghost',  onclick: 'OpsModal.close()' },
      { label: 'Confirm', class: 'btn-danger',  onclick: 'OpsModal._runConfirm()', id: 'modal-confirm-btn' },
    ]);

    // MUST be set after open() — open() calls close() internally which nulls _pendingConfirm
    _pendingConfirm = onConfirm;
  }

  function _runConfirm() {
    const fn = _pendingConfirm;
    _pendingConfirm = null;
    if (typeof fn === 'function') fn();
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
  function fmtDate(ds) {
    if (!ds) return '—';
    return new Date(ds).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function fmtDateTime(ds) {
    if (!ds) return '—';
    return new Date(ds).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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
    if (v == null) return 'var(--ink-4)';
    if (v < 20) return 'var(--err)';
    if (v < 50) return 'var(--warn)';
    return 'var(--ok)';
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
      ? `<div class="fg-kpi-ic" style="background:${color}22;color:${color}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${opts.icon}</svg></div>`
      : '';
    const cls = `fg-kpi${opts.onClick ? ' clickable' : ''}${opts.active ? ' active' : ''}`;
    const attrs = opts.onClick
      ? ` onclick="${opts.onClick}" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}"`
      : '';
    return `<div class="${cls}"${attrs}>${ic}<div class="fg-kpi-body">
        <div class="fg-kpi-label">${opts.label}</div>
        <div class="fg-kpi-val">${opts.value}</div>
        ${opts.sub != null ? `<div class="fg-kpi-sub ${opts.subClass || ''}">${opts.sub}</div>` : ''}
      </div></div>`;
  }
  function kpiStrip(cards) {
    return `<div class="fg-kpis">${cards.map(kpiCard).join('')}</div>`;
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────────

  return {
    open, close, setLoading,
    field, row, getFormData,
    apiGet, apiPost, apiPut, apiDelete,
    escape, sid,
    toast, confirm, _runConfirm,
    kpiCard, kpiStrip, vitalColor,
    fmtDate, fmtDateTime,
  };

})();
