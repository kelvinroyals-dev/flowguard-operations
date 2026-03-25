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

  function open(title, bodyHTML, actions = []) {
    close();

    const overlay     = document.createElement('div');
    overlay.id        = 'ops-modal-overlay';
    overlay.className = 'ops-modal-overlay';

    overlay.innerHTML = `
      <div class="ops-modal" role="dialog" aria-modal="true" aria-label="${title}" onclick="event.stopPropagation()">
        <div class="ops-modal-header">
          <div class="ops-modal-title">${title}</div>
          <button class="ops-modal-close" onclick="OpsModal.close()" aria-label="Close">✕</button>
        </div>
        <div class="ops-modal-body">${bodyHTML}</div>
        ${actions.length > 0 ? `
          <div class="ops-modal-footer">
            ${actions.map(a => `
              <button class="${a.class || 'btn-ghost'}"
                onclick="${a.onclick}"
                ${a.id ? `id="${a.id}"` : ''}>
                ${a.label}
              </button>`).join('')}
          </div>` : ''}
      </div>`;

    overlay.addEventListener('click', close);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    setTimeout(() => {
      const first = overlay.querySelector('.ops-input, input:not([readonly]), select, textarea');
      if (first) first.focus();
    }, 120);
  }

  function close() {
    _pendingConfirm = null;
    const overlay = document.getElementById('ops-modal-overlay');
    if (overlay) {
      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 220);
    }
  }

  function setLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
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
        return `<option value="${v}" ${v == value ? 'selected' : ''}>${l}</option>`;
      }).join('');
      return `
        <div class="ops-modal-field">
          <label class="ops-label">${label}</label>
          <select name="${name}" class="ops-input" ${required}>${opts}</select>
        </div>`;
    }

    if (type === 'textarea') {
      return `
        <div class="ops-modal-field">
          <label class="ops-label">${label}</label>
          <textarea name="${name}" class="ops-input" rows="${options.rows || 3}"
            placeholder="${placeholder}" ${required}
            style="resize:vertical;${extraStyle}">${value || ''}</textarea>
        </div>`;
    }

    return `
      <div class="ops-modal-field">
        <label class="ops-label">${label}</label>
        <input type="${type}" name="${name}" class="ops-input"
          value="${value || ''}" placeholder="${placeholder}"
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

  async function apiGet(endpoint) {
    const res = await fetch(`${CONFIG.API_BASE}${endpoint}`, { headers: getHeaders() });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `API ${res.status}`);
    }
    return await res.json();
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
  };

  function toast(msg, type = 'nominal') {
    document.querySelectorAll('.fg-toast').forEach(t => t.remove());

    const color = TOAST_COLORS[type] || TOAST_COLORS.nominal;
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
      font-family:var(--ff-b,'Figtree',sans-serif);
      font-size:.83rem; color:var(--ink-2,#2d5068);
      max-width:340px;
      opacity:0; transform:translateX(12px);
      transition:opacity .25s,transform .25s cubic-bezier(.22,1,.36,1);`;

    el.innerHTML = `
      <div style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></div>
      <span>${msg}</span>`;

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
        <div style="font-size:.9rem;font-weight:600;color:var(--ink,#0a1f2e);margin-bottom:6px;">${message}</div>
        <div style="font-size:.78rem;color:var(--ink-3,#6b8fa3);">This action cannot be undone.</div>
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

  // ── PUBLIC API ─────────────────────────────────────────────────────────

  return {
    open, close, setLoading,
    field, row, getFormData,
    apiGet, apiPost, apiPut, apiDelete,
    toast, confirm, _runConfirm,
  };

})();
