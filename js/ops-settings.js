// ============================================
// OPS SETTINGS MODULE
// System configuration — save actually works
// ============================================

const OpsSettings = (function () {
  'use strict';

  let _settings = {};
  let _dirty    = false;

  function markDirty() {
    if (_dirty) return;
    _dirty = true;
    const btn = document.getElementById('st-save-btn');
    if (btn) {
      btn.style.background  = 'var(--blue, #16a8d3)';
      btn.style.boxShadow   = '0 4px 14px rgba(22,168,211,.35)';
    }
    const note = document.getElementById('st-dirty-note');
    if (note) note.style.display = 'flex';
  }

  function markClean() {
    _dirty = false;
    const btn = document.getElementById('st-save-btn');
    if (btn) {
      btn.style.background = '';
      btn.style.boxShadow  = '';
    }
    const note = document.getElementById('st-dirty-note');
    if (note) note.style.display = 'none';
  }

  function render(container) {
    container.innerHTML = `
      <style>
        .st-header {
          margin-bottom: 24px;
        }

        .st-header-title {
          font-family: var(--ff-d, 'Space Grotesk', sans-serif);
          font-size: 1.3rem; font-weight: 800;
          color: var(--ink, #0a1f2e); letter-spacing: -.02em; margin-bottom: 3px;
        }

        .st-header-sub { font-size: .8rem; color: var(--ink-3, #6b8fa3); }

        .st-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px;
          margin-bottom: 18px;
        }

        .st-card {
          background: var(--surface, #fff);
          border: 1px solid var(--border, #dae6ef);
          border-radius: var(--r, 14px);
          overflow: hidden;
          box-shadow: var(--sh-xs);
        }

        .st-card-head {
          padding: 14px 20px;
          border-bottom: 1px solid var(--border, #dae6ef);
          display: flex; align-items: center; gap: 10px;
        }

        .st-card-icon {
          width: 30px; height: 30px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }

        .st-card-title {
          font-family: var(--ff-d, 'Space Grotesk', sans-serif);
          font-size: .88rem; font-weight: 700; color: var(--ink, #0a1f2e);
        }

        .st-card-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 14px; }

        /* Field */
        .st-field { display: flex; flex-direction: column; gap: 6px; }

        .st-label {
          font-size: .67rem; font-weight: 700;
          letter-spacing: 1px; text-transform: uppercase;
          color: var(--ink-3, #6b8fa3);
        }

        .st-input {
          padding: 9px 12px;
          border: 1px solid var(--border, #dae6ef);
          border-radius: var(--rs, 9px);
          background: var(--surface-2, #f7fafc);
          font-family: var(--ff-b, 'Inter', sans-serif);
          font-size: .85rem; color: var(--ink, #0a1f2e);
          outline: none; transition: all .2s; width: 100%;
        }

        .st-input:focus {
          border-color: var(--blue, #16a8d3);
          background: var(--surface, #fff);
          box-shadow: 0 0 0 3px rgba(22,168,211,.1);
        }

        .st-input[type="number"] { font-family: var(--ff-m, 'JetBrains Mono', monospace); }

        /* Toggle row */
        .st-toggle-row {
          display: flex; align-items: center;
          justify-content: space-between;
          padding: 12px 14px;
          background: var(--surface-2, #f7fafc);
          border-radius: var(--rs, 9px);
          border: 1px solid var(--border, #dae6ef);
          transition: background .15s;
        }

        .st-toggle-row:hover { background: var(--surface-h, #eaf4f9); }

        .st-toggle-left { flex: 1; min-width: 0; }

        .st-toggle-name {
          font-size: .84rem; font-weight: 600;
          color: var(--ink, #0a1f2e); margin-bottom: 2px;
        }

        .st-toggle-desc {
          font-size: .74rem; color: var(--ink-3, #6b8fa3);
        }

        /* iOS-style toggle */
        .st-toggle-wrap {
          position: relative;
          width: 42px; height: 24px;
          flex-shrink: 0; cursor: pointer;
        }

        .st-toggle-input {
          position: absolute; opacity: 0;
          width: 0; height: 0;
        }

        .st-toggle-track {
          position: absolute; inset: 0;
          background: var(--border-2, #b8d0de);
          border-radius: 24px;
          transition: background .25s;
        }

        .st-toggle-input:checked ~ .st-toggle-track {
          background: var(--ok, #0a8a6a);
        }

        .st-toggle-input:focus-visible ~ .st-toggle-track {
          outline: 2px solid var(--blue, #16a8d3);
          outline-offset: 2px;
        }

        .st-toggle-thumb {
          position: absolute;
          width: 18px; height: 18px;
          top: 3px; left: 3px;
          background: var(--surface);
          border-radius: 50%;
          box-shadow: 0 1px 4px rgba(0,0,0,.15);
          transition: transform .25s cubic-bezier(.22,1,.36,1);
          pointer-events: none;
        }

        .st-toggle-input:checked ~ .st-toggle-thumb {
          transform: translateX(18px);
        }

        /* Threshold slider */
        .st-threshold {
          display: flex; align-items: center; gap: 12px;
        }

        .st-threshold-val {
          font-family: var(--ff-d, 'Space Grotesk', sans-serif);
          font-size: 1.1rem; font-weight: 800;
          color: var(--ink, #0a1f2e);
          min-width: 44px; text-align: right;
        }

        .st-range {
          flex: 1; appearance: none;
          height: 4px; border-radius: 2px;
          outline: none; cursor: pointer;
          background: var(--border, #dae6ef);
          transition: background .2s;
        }

        .st-range::-webkit-slider-thumb {
          appearance: none;
          width: 18px; height: 18px;
          border-radius: 50%;
          background: var(--navy, #0a2a3d);
          border: 2px solid white;
          box-shadow: 0 1px 4px rgba(10,42,61,.25);
          cursor: pointer;
        }

        .st-range::-moz-range-thumb {
          width: 18px; height: 18px;
          border-radius: 50%;
          background: var(--navy, #0a2a3d);
          border: 2px solid white;
          box-shadow: 0 1px 4px rgba(10,42,61,.25);
          cursor: pointer;
        }

        /* Save bar */
        .st-save-bar {
          background: var(--surface, #fff);
          border: 1px solid var(--border, #dae6ef);
          border-radius: var(--r, 14px);
          padding: 16px 20px;
          display: flex; align-items: center;
          justify-content: space-between;
          box-shadow: var(--sh-xs);
        }

        .st-save-note {
          font-size: .8rem; color: var(--ink-3, #6b8fa3);
        }

        .st-save-note strong { color: var(--ink-2, #2d5068); }

        /* Version info */
        .st-version-card {
          background: var(--navy-deep, #050f18);
          border-radius: var(--r, 14px);
          padding: 20px 24px;
          display: flex; align-items: center;
          justify-content: space-between;
          margin-bottom: 18px;
          position: relative; overflow: hidden;
        }

        .st-version-card::before {
          content: '';
          position: absolute; inset: 0;
          background: radial-gradient(ellipse 80% 70% at 100% 100%, rgba(22,168,211,.12) 0%, transparent 55%);
          pointer-events: none;
        }

        .st-version-label {
          font-size: .62rem; font-weight: 700;
          letter-spacing: 2px; text-transform: uppercase;
          color: rgba(255,255,255,.3); margin-bottom: 4px;
        }

        .st-version-val {
          font-family: var(--ff-m, 'JetBrains Mono', monospace);
          font-size: .88rem; color: rgba(255,255,255,.85);
        }

        .st-status-row {
          display: flex; align-items: center; gap: 6px;
          font-size: .72rem; color: rgba(255,255,255,.45);
          font-family: var(--ff-m, 'JetBrains Mono', monospace);
        }

        .st-status-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--ok, #0a8a6a);
          animation: stPulse 2.5s ease-in-out infinite;
        }

        @keyframes stPulse { 0%,100%{opacity:1;} 50%{opacity:.35;} }
      </style>

      <div class="st-header">
        <div class="st-header-title">Settings</div>
        <div class="st-header-sub">Configure system preferences, thresholds, and notifications</div>
      </div>

      <!-- Version banner -->
      <div class="st-version-card">
        <div>
          <div class="st-version-label">Portal Build</div>
          <div class="st-version-val">FlowGuard Ops &nbsp;·&nbsp; v3.2.0</div>
        </div>
        <div style="text-align:right;">
          <div class="st-status-row" style="justify-content:flex-end;margin-bottom:4px;">
            <div class="st-status-dot"></div>
            All systems operational
          </div>
          <div style="font-size:.68rem;color:rgba(255,255,255,.25);font-family:var(--ff-m);">api.flowguard.ng · <span id="st-time"></span></div>
        </div>
      </div>

      <div id="st-loading" style="padding:48px;text-align:center;color:var(--ink-3);">
        <div class="loading" style="margin:0 auto 12px;"></div>
        <div style="font-size:.82rem;">Loading settings…</div>
      </div>

      <div id="st-body" style="display:none;">

        <div class="st-grid">

          <!-- Company Info -->
          <div class="st-card">
            <div class="st-card-head">
              <div class="st-card-icon" style="background:rgba(10,42,61,.07);">
                <svg width="14" height="14" fill="none" stroke="var(--navy)" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
              </div>
              <div class="st-card-title">Company Information</div>
            </div>
            <div class="st-card-body">
              <div class="st-field">
                <label class="st-label" for="s-company-name">Company Name</label>
                <input class="st-input" id="s-company-name" name="company_name" type="text" placeholder="FlowGuard Solutions">
              </div>
              <div class="st-field">
                <label class="st-label" for="s-contact-email">Contact Email</label>
                <input class="st-input" id="s-contact-email" name="contact_email" type="email" placeholder="ops@yourcompany.com">
              </div>
              <div class="st-field">
                <label class="st-label" for="s-contact-phone">Contact Phone</label>
                <input class="st-input" id="s-contact-phone" name="contact_phone" type="text" placeholder="+234…">
              </div>
              <div class="st-field">
                <label class="st-label" for="s-timezone">Timezone</label>
                <select class="st-input" id="s-timezone" name="timezone">
                  <option value="Africa/Lagos">Africa/Lagos (WAT, UTC+1)</option>
                  <option value="Africa/Nairobi">Africa/Nairobi (EAT, UTC+3)</option>
                  <option value="Africa/Accra">Africa/Accra (GMT, UTC+0)</option>
                  <option value="Europe/London">Europe/London (GMT/BST)</option>
                  <option value="America/New_York">America/New_York (ET)</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Alert Thresholds -->
          <div class="st-card">
            <div class="st-card-head">
              <div class="st-card-icon" style="background:var(--eb, #fef2f2);">
                <svg width="14" height="14" fill="none" stroke="var(--err)" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
              </div>
              <div class="st-card-title">Alert Thresholds</div>
            </div>
            <div class="st-card-body">

              <div class="st-field">
                <label class="st-label">Critical Water Level (%)</label>
                <div class="st-threshold">
                  <input class="st-range" id="s-threshold-critical" name="threshold_critical"
                    type="range" min="50" max="100" step="1" value="90"
                    oninput="document.getElementById('s-threshold-critical-val').textContent=this.value+'%'">
                  <span class="st-threshold-val" id="s-threshold-critical-val">90%</span>
                </div>
              </div>

              <div class="st-field">
                <label class="st-label">Warning Water Level (%)</label>
                <div class="st-threshold">
                  <input class="st-range" id="s-threshold-warning" name="threshold_warning"
                    type="range" min="30" max="90" step="1" value="70"
                    oninput="document.getElementById('s-threshold-warning-val').textContent=this.value+'%'">
                  <span class="st-threshold-val" id="s-threshold-warning-val">70%</span>
                </div>
              </div>

              <div class="st-field">
                <label class="st-label" for="s-escalation-time">Auto-Escalation Time (minutes)</label>
                <input class="st-input" id="s-escalation-time" name="escalation_minutes"
                  type="number" min="5" max="120" placeholder="30">
              </div>

              <div class="st-field">
                <label class="st-label" for="s-response-sla">SLA Response Target (minutes)</label>
                <input class="st-input" id="s-response-sla" name="sla_response_minutes"
                  type="number" min="10" max="240" placeholder="60">
              </div>

            </div>
          </div>

          <!-- Notifications -->
          <div class="st-card">
            <div class="st-card-head">
              <div class="st-card-icon" style="background:rgba(22,168,211,.08);">
                <svg width="14" height="14" fill="none" stroke="var(--blue)" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
              </div>
              <div class="st-card-title">Notifications</div>
            </div>
            <div class="st-card-body">

              <div class="st-toggle-row">
                <div class="st-toggle-left">
                  <div class="st-toggle-name">Email Alerts</div>
                  <div class="st-toggle-desc">Send critical alerts via email</div>
                </div>
                <label class="st-toggle-wrap">
                  <input class="st-toggle-input" id="s-email-alerts" name="email_alerts" type="checkbox" checked>
                  <div class="st-toggle-track"></div>
                  <div class="st-toggle-thumb"></div>
                </label>
              </div>

              <div class="st-toggle-row">
                <div class="st-toggle-left">
                  <div class="st-toggle-name">SMS Alerts</div>
                  <div class="st-toggle-desc">Critical alerts via SMS to on-call number</div>
                </div>
                <label class="st-toggle-wrap">
                  <input class="st-toggle-input" id="s-sms-alerts" name="sms_alerts" type="checkbox" checked>
                  <div class="st-toggle-track"></div>
                  <div class="st-toggle-thumb"></div>
                </label>
              </div>

              <div class="st-toggle-row">
                <div class="st-toggle-left">
                  <div class="st-toggle-name">Weekly Digest</div>
                  <div class="st-toggle-desc">Automated weekly performance email</div>
                </div>
                <label class="st-toggle-wrap">
                  <input class="st-toggle-input" id="s-weekly-digest" name="weekly_digest" type="checkbox">
                  <div class="st-toggle-track"></div>
                  <div class="st-toggle-thumb"></div>
                </label>
              </div>

              <div class="st-field">
                <label class="st-label" for="s-alert-email">Alert Recipient Email</label>
                <input class="st-input" id="s-alert-email" name="alert_email" type="email" placeholder="alerts@yourcompany.com">
              </div>

              <div class="st-field">
                <label class="st-label" for="s-alert-phone">SMS Alert Number</label>
                <input class="st-input" id="s-alert-phone" name="alert_phone" type="text" placeholder="+234…">
              </div>

            </div>
          </div>

          <!-- Development -->
          <div class="st-card">
            <div class="st-card-head">
              <div class="st-card-icon" style="background:var(--amber-bg, rgba(245,166,35,.09));">
                <svg width="14" height="14" fill="none" stroke="var(--amber)" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              </div>
              <div class="st-card-title">Development</div>
            </div>
            <div class="st-card-body">

              <div class="st-field">
                <label class="st-label">API Base URL</label>
                <input class="st-input" type="text" value="${typeof CONFIG !== 'undefined' ? CONFIG.API_BASE : '—'}" readonly style="opacity:.6;cursor:not-allowed;font-family:var(--ff-m);font-size:.76rem;">
              </div>

              <div class="st-field">
                <label class="st-label">Portal Version</label>
                <input class="st-input" type="text" value="${typeof CONFIG !== 'undefined' ? CONFIG.APP_VERSION : 'v3.2.0'}" readonly style="opacity:.6;cursor:not-allowed;font-family:var(--ff-m);">
              </div>

            </div>
          </div>

        </div>

        <!-- Save bar -->
        <div class="st-save-bar">
          <div class="st-save-note">
            Settings are saved to <strong>api.flowguard.ng</strong> and take effect immediately.
          </div>
          <div style="display:flex;gap:10px;align-items:center;">
            <span id="st-dirty-note" style="display:none;align-items:center;gap:6px;font-size:.78rem;color:var(--warn);font-weight:600;">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Unsaved changes
            </span>
            <span id="st-saved-msg" style="font-size:.78rem;color:var(--ok);font-weight:600;opacity:0;transition:opacity .3s;">✓ Saved</span>
            <button class="btn-ghost" onclick="OpsSettings.reset()" style="font-size:.8rem;">Reset to Defaults</button>
            <button class="btn-primary" id="st-save-btn" onclick="OpsSettings.save()">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
              Save Settings
            </button>
          </div>
        </div>

      </div>
    `;

    updateClock();
    loadSettings();
  }

  function updateClock() {
    const el = document.getElementById('st-time');
    if (el) el.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  async function loadSettings() {
    try {
      const res = await OpsModal.apiGet('/settings');
      _settings = res.data || res.settings || {};
      populateForm(_settings);
    } catch {
      _settings = {};
    } finally {
      document.getElementById('st-loading').style.display = 'none';
      document.getElementById('st-body').style.display    = 'block';
      // Attach change listeners AFTER form is visible
      attachDirtyListeners();
    }
  }

  function attachDirtyListeners() {
    const body = document.getElementById('st-body');
    if (!body) return;
    // All inputs, selects, textareas, checkboxes trigger dirty
    body.querySelectorAll('input, select, textarea').forEach(el => {
      const ev = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(ev, markDirty, { once: false });
    });
  }

  function populateForm(s) {
    const setInput = (id, val) => {
      const el = document.getElementById(id);
      if (!el || val == null) return;
      if (el.type === 'checkbox') {
        el.checked = Boolean(val);
      } else if (el.type === 'range') {
        el.value = val;
        // Update the display value
        const display = document.getElementById(id + '-val');
        if (display) display.textContent = val + '%';
      } else {
        el.value = val;
      }
    };

    setInput('s-company-name',      s.company_name);
    setInput('s-contact-email',     s.contact_email);
    setInput('s-contact-phone',     s.contact_phone);
    setInput('s-timezone',          s.timezone);
    setInput('s-threshold-critical', s.threshold_critical || 90);
    setInput('s-threshold-warning',  s.threshold_warning  || 70);
    setInput('s-escalation-time',    s.escalation_minutes);
    setInput('s-response-sla',       s.sla_response_minutes);
    setInput('s-email-alerts',       s.email_alerts !== false);
    setInput('s-sms-alerts',         s.sms_alerts   !== false);
    setInput('s-weekly-digest',      s.weekly_digest);
    setInput('s-alert-email',        s.alert_email);
    setInput('s-alert-phone',        s.alert_phone);
  }

  function collectForm() {
    const get = (id) => {
      const el = document.getElementById(id);
      if (!el) return undefined;
      if (el.type === 'checkbox') return el.checked;
      if (el.type === 'number' || el.type === 'range') return el.value ? Number(el.value) : null;
      return el.value || null;
    };

    return {
      company_name:         get('s-company-name'),
      contact_email:        get('s-contact-email'),
      contact_phone:        get('s-contact-phone'),
      timezone:             get('s-timezone'),
      threshold_critical:   get('s-threshold-critical'),
      threshold_warning:    get('s-threshold-warning'),
      escalation_minutes:   get('s-escalation-time'),
      sla_response_minutes: get('s-response-sla'),
      email_alerts:         get('s-email-alerts'),
      sms_alerts:           get('s-sms-alerts'),
      weekly_digest:        get('s-weekly-digest'),
      alert_email:          get('s-alert-email'),
      alert_phone:          get('s-alert-phone'),
    };
  }

  async function save() {
    const btn     = document.getElementById('st-save-btn');
    const savedEl = document.getElementById('st-saved-msg');
    const data    = collectForm();

    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="loading" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></span>Saving…'; }

    try {
      await OpsModal.apiPut('/settings', data);
      _settings = { ..._settings, ...data };

      if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg> Save Settings'; }
      if (savedEl) { savedEl.style.opacity = '1'; setTimeout(() => { savedEl.style.opacity = '0'; }, 2500); }
      markClean();

    } catch (err) {
      if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg> Save Settings'; }
      OpsModal.toast('Failed to save settings: ' + err.message, 'critical');
    }
  }

  function reset() {
    OpsModal.confirm('Reset all settings to defaults?', async function () {
      OpsModal.close();
      const defaults = {
        threshold_critical:   90,
        threshold_warning:    70,
        escalation_minutes:   30,
        sla_response_minutes: 60,
        email_alerts:         true,
        sms_alerts:           true,
        weekly_digest:        false,
      };
      populateForm(defaults);
      markClean();
      OpsModal.toast('Settings reset to defaults — click Save to apply', 'watch');
    });
  }

  function toggleDemo(checked) {
    // Demo mode deprecated v3.2.1 — no-op
    OpsModal.toast('Demo mode has been deprecated', 'watch');
  }

  return { render, save, reset, toggleDemo };

})();
