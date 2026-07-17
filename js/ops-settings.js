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

  let _active = 'company';

  const SET_STYLE = `<style>
    .set-crumb{font-size:var(--fs-2xs);color:var(--ink-3);font-weight:700;letter-spacing:.6px;margin-bottom:10px;}
    .set-header{display:flex;align-items:flex-start;gap:16px;margin-bottom:16px;flex-wrap:wrap;}
    .set-title{font-family:var(--ff-d);font-size:var(--fs-xl);font-weight:700;color:var(--ink);line-height:1.1;}
    .set-sub{font-size:var(--fs-sm);color:var(--ink-3);margin-top:3px;}
    .set-grid{display:grid;grid-template-columns:262px 1fr;gap:16px;align-items:start;}
    @media(max-width:820px){.set-grid{grid-template-columns:1fr;}}
    .set-nav{background:var(--surface);border:1px solid var(--border);border-radius:16px;box-shadow:var(--sh-xs);padding:12px 10px;position:sticky;top:6px;}
    .set-group{font-size:var(--fs-2xs);text-transform:uppercase;letter-spacing:1px;color:var(--ink-3);padding:14px 12px 6px;font-weight:700;}
    .set-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:9px;font-size:var(--fs-sm);color:var(--ink-2);cursor:pointer;}
    .set-item:hover{background:var(--surface-2);}
    .set-item.active{background:var(--surface-2);color:var(--ink);font-weight:700;}
    .set-dot{width:6px;height:6px;border-radius:50%;margin-left:auto;flex-shrink:0;}
    .set-dot.yes{background:var(--ok);}
    .set-dot.partial{background:var(--warn);}
    .set-dot.no{background:var(--err);opacity:.5;}
    .set-legend{display:flex;flex-wrap:wrap;gap:12px;font-size:var(--fs-2xs);color:var(--ink-3);padding:12px 12px 4px;border-top:1px solid var(--border);margin-top:8px;}
    .set-legend span{display:inline-flex;align-items:center;gap:5px;}
    .set-legend .sw{width:7px;height:7px;border-radius:50%;}
    .set-content{display:flex;flex-direction:column;gap:16px;min-width:0;}
    .set-panel{display:none;background:var(--surface);border:1px solid var(--border);border-radius:16px;box-shadow:var(--sh-xs);padding:20px 22px;}
    .set-panel.active{display:block;}
    .set-panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px;}
    .set-panel-head h2{font-family:var(--ff-d);font-size:var(--fs-md);font-weight:700;color:var(--ink);}
    .set-chip{font-size:var(--fs-2xs);font-weight:700;padding:3px 9px;border-radius:20px;white-space:nowrap;}
    .set-chip.yes{background:rgba(31,157,91,.12);color:var(--ok);}
    .set-chip.partial{background:rgba(224,142,18,.12);color:var(--warn);}
    .set-chip.no{background:rgba(217,70,60,.12);color:var(--err);}
    .set-field-row{display:grid;grid-template-columns:200px 1fr;gap:16px;align-items:center;padding:13px 0;border-bottom:1px solid var(--border);}
    .set-field-row:last-child{border-bottom:none;}
    .set-flabel{font-size:var(--fs-sm);color:var(--ink-2);font-weight:600;}
    .set-flabel .sub{display:block;font-size:var(--fs-2xs);color:var(--ink-3);font-weight:500;margin-top:2px;line-height:1.4;}
    .set-input{font-size:var(--fs-sm);padding:9px 12px;border-radius:9px;border:1px solid var(--border-2);background:var(--surface);color:var(--ink);width:100%;font-family:var(--ff-b);outline:none;}
    .set-input:focus{border-color:var(--blue-hi);}
    .set-switch{position:relative;display:inline-block;width:38px;height:22px;}
    .set-switch input{opacity:0;width:0;height:0;}
    .set-switch span{position:absolute;inset:0;border-radius:20px;background:var(--surface-2);border:1px solid var(--border-2);cursor:pointer;transition:.15s;}
    .set-switch span::before{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--blue-hi);transition:.15s;}
    .set-switch input:checked + span{background:rgba(31,157,91,.15);border-color:rgba(31,157,91,.35);}
    .set-switch input:checked + span::before{left:18px;background:var(--ok);}
    .set-empty{display:flex;flex-direction:column;align-items:flex-start;gap:9px;padding:12px 0 4px;}
    .set-empty-t{font-size:var(--fs-sm);font-weight:700;color:var(--ink-2);}
    .set-empty-s{font-size:var(--fs-xs);color:var(--ink-3);line-height:1.6;max-width:560px;}
    .set-btn{font-size:var(--fs-sm);font-weight:600;padding:8px 14px;border-radius:9px;cursor:pointer;border:1px solid var(--border-2);color:var(--ink-2);background:var(--surface);}
    .set-btn:hover{border-color:var(--ink-4);color:var(--ink);}
    .set-btn.primary{background:var(--blue-hi);color:#fff;border:none;}
    .set-savebar{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:14px 0 2px;}
    .set-saved{color:var(--ok);font-size:var(--fs-sm);font-weight:700;opacity:0;transition:opacity .2s;margin-right:auto;}
  </style>`;

  function render(container) {
    const F = (label, sub, ctrl) => `<div class="set-field-row"><div class="set-flabel">${label}${sub ? `<span class="sub">${sub}</span>` : ''}</div><div>${ctrl}</div></div>`;
    const inp = (id, type, ph) => `<input class="set-input" id="${id}" type="${type || 'text'}"${ph ? ` placeholder="${ph}"` : ''}>`;
    const tog = id => `<label class="set-switch"><input type="checkbox" id="${id}"><span></span></label>`;
    const gap = (t, s, tab, lbl) => `<div class="set-empty"><div class="set-empty-t">${t}</div><div class="set-empty-s">${s}</div>${tab ? `<button class="set-btn" onclick="switchTab('${tab}')">${lbl} →</button>` : ''}</div>`;

    const SECTIONS = [
      { g:'General', k:'company', label:'Company profile', b:'yes', body:
        F('Company name','Shown on reports and the client portal', inp('s-company-name')) +
        F('Support email','', inp('s-contact-email','email')) +
        F('Support phone','', inp('s-contact-phone')) +
        F('Timezone','Used for all timestamps', inp('s-timezone','text','Africa/Lagos')) },
      { g:'General', k:'branding', label:'Branding', b:'partial', body:
        gap('Logo and theme live in code','The FlowGuard mark and neon-center theme ship as static assets and CSS tokens, not database rows — changing them is a code deploy, not a saved setting.') },
      { g:'General', k:'prefs', label:'Preferences', b:'no', body:
        gap('No preferences table yet','Business hours, default currency and display options are not persisted anywhere — a per-workspace preferences table would be needed to store them.') },
      { g:'Access', k:'users', label:'Users & roles', b:'partial', body:
        gap('Managed in Team Members','Staff accounts and their roles live in the users table and are edited from the Team Members module.','team-members','Open Team Members') },
      { g:'Access', k:'perms', label:'Permissions', b:'no', body:
        gap('Roles are defined in code','Role permission sets are hard-coded, not a database table. You can see what each role can do when assigning it to a member.','team-members','Open Team Members') },
      { g:'Access', k:'teams', label:'Teams', b:'partial', body:
        gap('Managed in Teams','Field teams and their members live in field_teams and are edited from the Teams module.','teams','Open Teams') },
      { g:'Operations', k:'devicetypes', label:'Device types', b:'no', body:
        gap('No device-type catalogue','Device variants are inferred from each sensor row; there is no separate device-type table to configure.') },
      { g:'Operations', k:'alerts', label:'Alert rules', b:'yes', body:
        F('Critical threshold','Water level % that raises a critical alert', inp('s-threshold-critical','number')) +
        F('Warning threshold','Water level % that raises a warning', inp('s-threshold-warning','number')) +
        F('Escalation time','Minutes before an unacknowledged alert escalates', inp('s-escalation-time','number')) +
        F('Response SLA','Target minutes to respond to a critical alert', inp('s-response-sla','number')) },
      { g:'Operations', k:'mainttpl', label:'Maintenance templates', b:'no', body:
        gap('No templates table','Work orders are created ad-hoc; there is no reusable maintenance-template table yet.') },
      { g:'Billing', k:'billingset', label:'Billing settings', b:'partial', body:
        gap('Managed in Billing','Invoices and quotes are handled in the Billing module; there is no separate billing-config table.','billing','Open Billing') },
      { g:'Billing', k:'subs', label:'Subscription & licensing', b:'no', body:
        gap('No licensing table','Plan tiers and seat limits are not modelled in the schema yet.') },
      { g:'Notifications', k:'notifs', label:'Notification channels', b:'yes', body:
        F('Email alerts','Send alert emails to ops', tog('s-email-alerts')) +
        F('SMS alerts','Send SMS for critical alerts', tog('s-sms-alerts')) +
        F('Weekly digest','Send a weekly summary email', tog('s-weekly-digest')) +
        F('Alert email','Address alert emails are sent to', inp('s-alert-email','email')) +
        F('Alert phone','Number for SMS alerts', inp('s-alert-phone')) },
      { g:'Notifications', k:'emailtpl', label:'Email templates', b:'no', body:
        gap('No templates table','Notification copy is defined in code; there is no editable email-template store yet.') },
      { g:'Developer', k:'integrations', label:'Integrations', b:'no', body:
        gap('No integrations registry','Third-party integrations are not modelled in the schema.') },
      { g:'Developer', k:'apikeys', label:'API keys', b:'no', body:
        gap('No API-key store','Programmatic access keys are not issued from this workspace yet.') },
      { g:'Developer', k:'webhooks', label:'Webhooks', b:'no', body:
        gap('No webhooks table','Outbound webhooks are not configurable yet.') },
      { g:'System', k:'security', label:'Security', b:'partial', body:
        F('Two-factor required','Display only — not enforced by the backend yet', tog('s-2fa')) +
        gap('Session & password policy','Sessions are JWT-based; password and session-policy controls are not stored as settings yet.') },
      { g:'System', k:'audit', label:'Audit', b:'partial', body:
        gap('View the audit log','Every ops action is written to audit_log and viewable in the Audit module.','audit','Open Audit log') },
      { g:'System', k:'backup', label:'Backup & data retention', b:'no', body:
        gap('No retention config','Backups are handled at the database layer, not as an in-app setting.') },
    ];

    let nav = '', lastG = '';
    SECTIONS.forEach(s => {
      if (s.g !== lastG) { nav += `<div class="set-group">${s.g}</div>`; lastG = s.g; }
      nav += `<div class="set-item${s.k === _active ? ' active' : ''}" id="set-item-${s.k}" onclick="OpsSettings.section('${s.k}')">${s.label}<span class="set-dot ${s.b}"></span></div>`;
    });
    const chip = b => `<span class="set-chip ${b}">${b === 'yes' ? 'Backed by a table' : b === 'partial' ? 'Partial / indirect' : 'Not backed yet'}</span>`;
    const panels = SECTIONS.map(s => `<div class="set-panel${s.k === _active ? ' active' : ''}" id="set-panel-${s.k}"><div class="set-panel-head"><h2>${s.label}</h2>${chip(s.b)}</div>${s.body}</div>`).join('');

    container.innerHTML = `
      ${SET_STYLE}
      <div class="set-crumb">SETTINGS</div>
      <div class="set-header"><div><div class="set-title">Settings</div><div class="set-sub">${SECTIONS.length} sections · workspace configuration</div></div></div>
      <div id="st-loading" style="padding:60px;text-align:center;color:var(--ink-3);"><div class="loading" style="margin:0 auto 12px;"></div>Loading settings…</div>
      <div id="st-body" style="display:none;">
        <div class="set-grid">
          <div class="set-nav">
            ${nav}
            <div class="set-legend">
              <span><span class="sw" style="background:var(--ok);"></span>Backed by a table</span>
              <span><span class="sw" style="background:var(--warn);"></span>Partial / indirect</span>
              <span><span class="sw" style="background:var(--err);opacity:.5;"></span>Not backed yet</span>
            </div>
          </div>
          <div class="set-content">
            ${panels}
            <div class="set-savebar">
              <span class="set-saved" id="st-saved-msg">Saved ✓</span>
              <button class="set-btn" onclick="OpsSettings.reset()">Reset to defaults</button>
              <button class="set-btn primary" id="st-save-btn" onclick="OpsSettings.save()">Save settings</button>
            </div>
          </div>
        </div>
      </div>`;

    updateClock();
    loadSettings();
  }

  function section(k) {
    _active = k;
    document.querySelectorAll('.set-item').forEach(el => el.classList.toggle('active', el.id === 'set-item-' + k));
    document.querySelectorAll('.set-panel').forEach(el => el.classList.toggle('active', el.id === 'set-panel-' + k));
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

  return { render, section, save, reset, toggleDemo };

})();
