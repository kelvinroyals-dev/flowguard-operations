/**
 * FlowGuard Operations Center — Modal & API Utility
 * ─────────────────────────────────────────────────────
 * Shared modal system, API helpers, toast, and form utilities
 * used by all CRUD modules.
 *
 * Depends on: config.js, auth.js (must load first)
 *
 * CHANGE LOG (v3.2.0):
 *  • API_BASE now reads from CONFIG.API_BASE — no more local hardcoding
 *  • confirm() duplicate 'class' key bug fixed
 *  • toast() uses CONFIG.APP_NAME for aria-label
 */

const OpsModal = (function () {

  // ── API HELPERS ────────────────────────────────────────────────────────

  function getHeaders() {
    return {
      'Authorization': `Bearer ${Auth.getToken()}`,
      'Content-Type':  'application/json',
    };
  }

  async function apiGet(endpoint) {
    const res = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    return res.json();
  }

  async function apiPost(endpoint, body) {
    const res = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
      method:  'POST',
      headers: getHeaders(),
      body:    JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `API returned ${res.status}`);
    }
    return res.json();
  }

  async function apiPut(endpoint, body) {
    const res = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
      method:  'PUT',
      headers: getHeaders(),
      body:    JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `API returned ${res.status}`);
    }
    return res.json();
  }

  async function apiDelete(endpoint) {
    const res = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
      method:  'DELETE',
      headers: getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `API returned ${res.status}`);
    }
    return res.json();
  }

  // ── MODAL CORE ─────────────────────────────────────────────────────────

  function open(title, bodyHTML, actions = []) {
    close(); // Dismiss any existing modal first

    const overlay = document.createElement('div');
    overlay.id        = 'ops-modal-overlay';
    overlay.className = 'ops-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', title);

    overlay.innerHTML = `
      <div class="ops-modal" onclick="event.stopPropagation()">
        <div class="ops-modal-header">
          <div class="ops-modal-title">${title}</div>
          <button class="ops-modal-close" onclick="OpsModal.close()" aria-label="Close dialog">✕</button>
        </div>
        <div class="ops-modal-body">${bodyHTML}</div>
        ${actions.length > 0 ? `
          <div class="ops-modal-footer">
            ${actions.map(a => `
              <button
                class="${a.class || 'btn-ghost'}"
                onclick="${a.onclick}"
                ${a.id ? `id="${a.id}"` : ''}
              >${a.label}</button>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;

    overlay.addEventListener('click', close);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    // Focus first interactive element after transition
    setTimeout(() => {
      const first = overlay.querySelector('input, select, textarea, button:not(.ops-modal-close)');
      if (first) first.focus();
    }, 100);
  }

  function close() {
    const overlay = document.getElementById('ops-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 200);
  }

  function setLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (loading) {
      btn.dataset.originalText = btn.textContent;
      btn.textContent          = 'Processing…';
      btn.disabled             = true;
      btn.style.opacity        = '0.6';
    } else {
      btn.textContent   = btn.dataset.originalText || 'Submit';
      btn.disabled      = false;
      btn.style.opacity = '1';
    }
  }

  // ── FORM HELPERS ───────────────────────────────────────────────────────

  function field(label, name, type = 'text', value = '', options = {}) {
    const required    = options.required !== false ? 'required' : '';
    const placeholder = options.placeholder || '';
    const readonly    = options.readonly ? 'readonly' : '';
    const extraStyle  = options.readonly ? 'opacity:0.6;cursor:not-allowed;' : '';

    if (type === 'select') {
      const opts = (options.options || []).map(o => {
        const v       = typeof o === 'object' ? o.value : o;
        const l       = typeof o === 'object' ? o.label  : o;
        const sel     = v === value ? 'selected' : '';
        return `<option value="${v}" ${sel}>${l}</option>`;
      }).join('');
      return `
        <div class="ops-modal-field">
          <label class="ops-label" for="field-${name}">${label}</label>
          <select id="field-${name}" name="${name}" class="ops-input" ${required}>${opts}</select>
        </div>
      `;
    }

    if (type === 'textarea') {
      return `
        <div class="ops-modal-field">
          <label class="ops-label" for="field-${name}">${label}</label>
          <textarea
            id="field-${name}" name="${name}" class="ops-input"
            rows="${options.rows || 3}" placeholder="${placeholder}"
            ${required} style="resize:vertical;${extraStyle}"
          >${value}</textarea>
        </div>
      `;
    }

    return `
      <div class="ops-modal-field">
        <label class="ops-label" for="field-${name}">${label}</label>
        <input
          id="field-${name}" type="${type}" name="${name}" class="ops-input"
          value="${value}" placeholder="${placeholder}"
          ${required} ${readonly} style="${extraStyle}"
        >
      </div>
    `;
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
      if (el.type === 'number')   data[el.name] = el.value ? parseFloat(el.value) : null;
      else if (el.type === 'checkbox') data[el.name] = el.checked;
      else                        data[el.name] = el.value;
    });
    return data;
  }

  // ── TOAST ──────────────────────────────────────────────────────────────

  function toast(msg, type = 'nominal') {
    const existing = document.querySelectorAll('.ops-toast');
    existing.forEach(t => t.remove());

    const t = document.createElement('div');
    t.className = 'ops-toast';
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');

    const colors = {
      nominal:  { bg: 'var(--status-success-bg)',  border: 'var(--status-success)',  dot: 'var(--status-success)'  },
      watch:    { bg: 'var(--status-warning-bg)',  border: 'var(--status-warning)',  dot: 'var(--status-warning)'  },
      warning:  { bg: 'var(--status-caution-bg)',  border: 'var(--status-caution)',  dot: 'var(--status-caution)'  },
      critical: { bg: 'var(--status-danger-bg)',   border: 'var(--status-danger)',   dot: 'var(--status-danger)'   },
      error:    { bg: 'var(--status-danger-bg)',   border: 'var(--status-danger)',   dot: 'var(--status-danger)'   },
      success:  { bg: 'var(--status-success-bg)',  border: 'var(--status-success)',  dot: 'var(--status-success)'  },
    };

    const c = colors[type] || colors.nominal;
    t.style.cssText = `
      position: fixed;
      top: 72px;
      right: 20px;
      background: var(--surface-1);
      border: 1px solid ${c.border};
      border-left: 3px solid ${c.dot};
      padding: 12px 16px;
      border-radius: var(--radius);
      display: flex;
      align-items: center;
      gap: 10px;
      z-index: 10001;
      opacity: 0;
      transition: opacity 0.25s, transform 0.25s;
      transform: translateY(-6px);
      box-shadow: var(--shadow-md);
      min-width: 240px;
      max-width: 360px;
    `;

    t.innerHTML = `
      <span style="font-size: 12px; color: var(--text-primary); font-family: var(--ff-body);">${msg}</span>
    `;

    document.body.appendChild(t);
    requestAnimationFrame(() => {
      t.style.opacity   = '1';
      t.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      t.style.opacity   = '0';
      t.style.transform = 'translateY(-6px)';
      setTimeout(() => t.remove(), 300);
    }, 3500);
  }

  // ── CONFIRM DIALOG ─────────────────────────────────────────────────────

  function confirm(message, onConfirm) {
    const body = `
      <div style="text-align:center; padding:12px 0;">
        <div style="
          width: 48px; height: 48px;
          background: var(--status-danger-bg);
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 16px;
        ">
          <svg width="22" height="22" fill="none" stroke="var(--status-danger)" stroke-width="1.8" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
        </div>
        <div style="font-size:14px; color:var(--text-primary); font-weight:600; margin-bottom:6px;">${message}</div>
        <div style="font-size:12px; color:var(--text-muted);">This action cannot be undone.</div>
      </div>
    `;

    open('Confirm Action', body, [
      { label: 'Cancel',    class: 'btn-ghost',   onclick: 'OpsModal.close()' },
      { label: 'Confirm',   class: 'btn-danger',  onclick: `(${onConfirm.toString()})()`, id: 'modal-confirm-btn' },
    ]);
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────────

  return {
    open, close, setLoading,
    field, row, getFormData,
    apiGet, apiPost, apiPut, apiDelete,
    toast, confirm,
  };

})();
