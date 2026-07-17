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

  let _active = 'profile';

  const SET_STYLE = `<style>
    .set-crumb{font-size:var(--fs-2xs);color:var(--ink-3);font-weight:700;letter-spacing:.6px;margin-bottom:10px;}
    .set-header{display:flex;align-items:center;gap:14px;margin-bottom:16px;flex-wrap:wrap;}
    .set-back{display:inline-flex;align-items:center;gap:6px;font-size:var(--fs-sm);font-weight:600;color:var(--ink-2);background:var(--surface-2);border:1px solid var(--border);border-radius:9px;padding:8px 13px;cursor:pointer;}
    .set-back:hover{color:var(--ink);border-color:var(--border-2);}
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
    let U = {};
    try { U = JSON.parse(sessionStorage.getItem('user') || localStorage.getItem('user') || '{}'); } catch (e) {}
    const isAdmin = ['admin','super_admin','operations_manager'].includes(U.role);
    const uInitials = (U.full_name || U.name || '?').split(' ').filter(Boolean).map(w=>w[0]).join('').toUpperCase().slice(0,2);

    const F = (label, ctrl, sub) => `<div class="set-field-row"><div class="set-flabel">${label}${sub?`<span class="sub">${sub}</span>`:''}</div><div>${ctrl}</div></div>`;
    const ctl = f => {
      const v = f.val != null ? ` value="${String(f.val).replace(/"/g,'&quot;')}"` : '';
      if (f.t === 'select') return `<select class="set-input" ${f.id?`id="${f.id}"`:''}>${(f.opts||[]).map(o=>`<option>${o}</option>`).join('')}</select>`;
      if (f.t === 'textarea') return `<textarea class="set-input" rows="3" ${f.id?`id="${f.id}"`:''} style="resize:vertical;"></textarea>`;
      return `<input class="set-input" ${f.id?`id="${f.id}"`:''} type="${f.t||'text'}"${v}${f.ro?' disabled':''}${f.ph?` placeholder="${f.ph}"`:''}>`;
    };
    const flds = list => (list||[]).map(f => F(f.l, ctl(f), f.sub)).join('');
    const tog = o => `<label class="set-switch"><input type="checkbox" ${o&&o.id?`id="${o.id}"`:''}${o&&o.on?' checked':''}><span></span></label>`;
    const togs = list => (list||[]).map(t => F(t.l, tog(t), t.sub)).join('');
    const btn = (l, primary) => {
      const oc = /^save$/i.test(l) ? 'OpsSettings.save()' : /reset|restore defaults/i.test(l) ? 'OpsSettings.reset()' : /^cancel$/i.test(l) ? "reloadTab('settings')" : /team members/i.test(l) ? "switchTab('team-members')" : /teams$/i.test(l) ? "switchTab('teams')" : /audit/i.test(l) ? "switchTab('audit')" : /reports/i.test(l) ? "switchTab('reports')" : `OpsSettings.na('${l.replace(/'/g,'')}')`;
      return `<button class="set-btn${primary?' primary':''}" onclick="${oc}">${l}</button>`;
    };
    const btns = list => list && list.length ? `<div class="set-savebar">${list.map(b => btn(b[0], b[1])).join('')}</div>` : '';
    const note = t => `<div class="set-sub2">${t}</div>`;

    // Read-only role/permission reference, built from the REAL role model that
    // Team Members enforces (OpsUserManagement.ROLE_CONFIG) — a single source of
    // truth, so this never drifts from the actual roles. Access is role-based:
    // there is no per-module permission editor to persist to.
    const ROLES = (typeof OpsUserManagement !== 'undefined' && OpsUserManagement.ROLE_CONFIG) ? OpsUserManagement.ROLE_CONFIG : null;
    const seen = new Set();
    const rolesRef = ROLES
      ? Object.keys(ROLES).map(key => {
          const r = ROLES[key];
          if (seen.has(r.label)) return '';   // collapse admin/super_admin duplicates
          seen.add(r.label);
          return `<div class="set-row" style="align-items:flex-start;gap:14px;">
            <div class="set-row-main" style="flex:0 0 auto;">
              <span style="display:inline-flex;align-items:center;padding:3px 11px;border-radius:20px;font-size:var(--fs-xs);font-weight:700;background:${r.bg};color:${r.color};white-space:nowrap;">${r.label}</span>
            </div>
            <div style="flex:1;font-size:var(--fs-sm);color:var(--ink-2);line-height:1.55;text-align:right;">${(r.perms || []).join(' · ') || '—'}</div>
          </div>`;
        }).join('')
      : '<div class="set-sub2">Role model unavailable — open Team Members once to load it.</div>';

    const chanRow = (name, icon, sub, id) => `<div class="set-row"><div class="set-row-main"><div class="set-row-ic">${icon}</div><div><div class="set-row-name">${name}</div><div class="set-row-sub">${sub}</div></div></div><div class="set-row-right">${tog(id?{id}:{})}</div></div>`;
    const channels = `
      ${chanRow('Email','✉','SMTP · alerts + digests','s-email-alerts')}
      ${chanRow('Push','🔔','In-app + mobile')}
      ${chanRow('SMS','📱','Critical alerts to on-call','s-sms-alerts')}
      ${chanRow('WhatsApp','🟢','Business API — not connected')}`;

    const NEVENTS = ['Alert created','Alert resolved','Device offline','Work order assigned','SLA breach','Report ready'];
    const eventsChecklist = `<div class="set-field-row"><div class="set-flabel">Notify me about<span class="sub">Which events reach you</span></div><div style="display:flex;flex-wrap:wrap;gap:10px 18px;">${NEVENTS.map((e,i)=>`<label style="display:inline-flex;align-items:center;gap:6px;font-size:var(--fs-sm);color:var(--ink-2);"><input type="checkbox" ${i<3?'checked':''} style="width:15px;height:15px;accent-color:var(--blue-hi);">${e}</label>`).join('')}</div></div>`;

    const SERVICES = [['Weather provider','Open-Meteo · connected','on'],['SMS gateway','Not connected',''],['Email provider','SMTP · connected','on'],['Maps provider','CARTO · connected','on'],['Internal APIs','api.flowguard.ng','on']];
    const integrations = SERVICES.map(([n,st,on])=>`<div class="set-row"><div class="set-row-main"><div class="set-row-ic">🔌</div><div><div class="set-row-name">${n}</div><div class="set-row-sub">${st}</div></div></div><div class="set-row-right"><span class="set-tag ${on}">${on?'Active':'Off'}</span><button class="set-btn" onclick="OpsSettings.na('${on?'Test connection':'Connect'}')">${on?'Test':'Connect'}</button></div></div>`).join('');

    const SECTIONS = [
      { g:'Account', k:'profile', label:'My profile', b:'partial',
        custom:`<div class="set-field-row"><div class="set-flabel">Photo</div><div style="display:flex;align-items:center;gap:12px;"><div class="set-avatar-lg">${uInitials}</div><button class="set-btn" onclick="OpsSettings.na('Upload photo')">Upload photo</button></div></div>`,
        fields:[
          {l:'Name', val:U.full_name||U.name||''},
          {l:'Email', t:'email', val:U.email||'', ro:true, sub:'Managed by your admin'},
          {l:'Phone', val:U.phone||''},
          {l:'Job title', val:U.job_title||''},
          {l:'Team', val:U.team_name||'', ro:true},
        ],
        toggles:[{l:'Multi-factor authentication (MFA)', sub:'Protect your login with a second factor'}],
        buttons:[['Change password'],['Save',true]] },

      { g:'Access', k:'users', label:'User management', b:'ok',
        note:'Staff accounts, invites and team assignments are managed in Team Members. Here you set what each role can see and change — saved to the server and enforced by the API.',
        custom:`<div style="font-size:var(--fs-2xs);font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:var(--ink-3);margin:2px 0 10px;">Roles &amp; permissions</div><div id="set-perm-wrap"><div class="set-sub2">Loading permission model…</div></div>`,
        buttons:[['Open Team Members']] },

      { g:'Access', k:'teams', label:'Teams', b:'partial',
        note:'Field teams and members live in field_teams and are managed in the Teams module.',
        fields:[{l:'Team name'},{l:'Supervisor'},{l:'Members', t:'number'},{l:'Coverage area'},{l:'Shift assignment', t:'select', opts:['Day','Night','Rotating']}],
        toggles:[{l:'Available', on:true},{l:'On duty'}],
        buttons:[['Open Teams'],['Assign members'],['Create team',true]] },

      { g:'Operations', k:'devices', label:'Devices', b:'no',
        note:'System-wide device behaviour. Not persisted as settings yet — these would drive fleet defaults.',
        fields:[{l:'Offline timeout', ph:'6 hours', sub:'No telemetry before a node is marked offline'},{l:'Heartbeat interval', ph:'15 min'},{l:'Sampling interval', ph:'5 min'},{l:'Firmware rollout', t:'select', opts:['Manual','Staged','Immediate']},{l:'Calibration defaults'}],
        buttons:[['Save',true]] },

      { g:'Operations', k:'alerts', label:'Alerts', b:'partial',
        note:'Global alert rules. Thresholds, escalation and SLA below are saved to /settings.',
        fields:[
          {l:'Water level — critical', id:'s-threshold-critical', t:'number', sub:'% that raises a critical alert'},
          {l:'Water level — warning', id:'s-threshold-warning', t:'number', sub:'% that raises a warning'},
          {l:'Device offline threshold', ph:'6 hours', sub:'When to alert on a silent node'},
          {l:'Weather thresholds', ph:'Heavy rain / storm', sub:'Trigger conditions from the weather feed'},
          {l:'Escalation time', id:'s-escalation-time', t:'number', sub:'Minutes before an alert escalates'},
          {l:'Response SLA', id:'s-response-sla', t:'number', sub:'Target minutes to respond'},
          {l:'Notification routing', t:'select', opts:['On-call team','All ops','Assigned team']},
        ],
        buttons:[['Save',true]] },

      { g:'Operations', k:'map', label:'Map', b:'no',
        note:'Default map presentation for the operational view.',
        fields:[{l:'Default map', t:'select', opts:['CARTO Light','CARTO Dark','OpenStreetMap']},{l:'Layer defaults', t:'select', opts:['Sensors + assets','Sensors only','Heatmap']},{l:'Labels', t:'select', opts:['On','Off','On hover']},{l:'Measurement units', t:'select', opts:['Metric (km)','Imperial (mi)']},{l:'Coordinate format', t:'select', opts:['Decimal degrees','DMS']}],
        buttons:[['Restore defaults'],['Save',true]] },

      { g:'Delivery', k:'notifs', label:'Notifications', b:'partial',
        note:'Personal and system notifications. Channels and alert contacts below are saved to /settings.',
        custom:channels,
        fields:[{l:'Alert email', id:'s-alert-email', t:'email'},{l:'Alert phone', id:'s-alert-phone'}],
        toggles:[{l:'Weekly digest', id:'s-weekly-digest'},{l:'Quiet hours', sub:'Mute non-critical at night'}],
        buttons:[['Test notification'],['Save',true]],
        after:eventsChecklist },

      { g:'Delivery', k:'reports', label:'Reports', b:'no',
        note:'Reporting defaults. Report generation lives in the Reports module.',
        fields:[{l:'Report templates', t:'select', opts:['Daily operations','Weekly performance','Financial']},{l:'Export defaults', t:'select', opts:['PDF','CSV','XLSX']},{l:'Scheduled reports', t:'select', opts:['Off','Weekly','Monthly']}],
        buttons:[['Open Reports'],['Save',true]] },

      { g:'System', k:'security', label:'Security', b:'no',
        note:'Sessions are JWT-based today; these controls are not persisted as settings yet.',
        fields:[{l:'Password policy', t:'select', opts:['Standard','Strong','Very strong']},{l:'MFA policy', t:'select', opts:['Optional','Required for admins','Required for all']},{l:'Session timeout', t:'select', opts:['30 min','1 hour','8 hours']},{l:'IP restrictions'},{l:'Audit retention', t:'select', opts:['90 days','180 days','1 year','Forever']}],
        buttons:[['Force logout all users'],['Save',true]] },

      { g:'System', k:'integrations', label:'Integrations', b:'partial',
        note:'What FlowGuard actually talks to. Weather, email and maps are live.',
        custom:integrations,
        buttons:[['Save',true]] },
    ];

    let nav = '', lastG = '';
    SECTIONS.forEach(s => {
      if (s.g !== lastG) { nav += `<div class="set-group">${s.g}</div>`; lastG = s.g; }
      nav += `<div class="set-item${s.k === _active ? ' active' : ''}" id="set-item-${s.k}" onclick="OpsSettings.section('${s.k}')">${s.label}<span class="set-dot ${s.b}"></span></div>`;
    });
    const chip = b => `<span class="set-chip ${b}">${b === 'yes' ? 'Backed by a table' : b === 'partial' ? 'Partial / indirect' : 'Not backed yet'}</span>`;
    const panels = SECTIONS.map(s => `<div class="set-panel${s.k === _active ? ' active' : ''}" id="set-panel-${s.k}"><div class="set-panel-head"><h2>${s.label}</h2>${chip(s.b)}</div>${s.note?note(s.note):''}${s.custom&&!s.fields?s.custom:''}${flds(s.fields)}${s.custom&&s.fields?s.custom:''}${togs(s.toggles)}${s.after||''}${btns(s.buttons)}</div>`).join('');

    container.innerHTML = `
      ${SET_STYLE}
      <style>
        .set-mono{font-family:var(--ff-m);font-size:var(--fs-xs);}
        .set-avatar-lg{width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,var(--blue-hi),var(--blue-dim));color:#fff;font-weight:700;font-family:var(--ff-m);display:flex;align-items:center;justify-content:center;}
        .set-matrix{width:100%;border-collapse:collapse;font-size:var(--fs-sm);}
        .set-matrix th{text-align:center;font-size:var(--fs-2xs);text-transform:uppercase;letter-spacing:.4px;color:var(--ink-3);font-weight:700;padding:0 6px 10px;border-bottom:1px solid var(--border-2);white-space:nowrap;}
        .set-matrix th:first-child{text-align:left;}
        .set-matrix td{padding:10px 6px;border-bottom:1px solid var(--border);text-align:center;color:var(--ink-2);}
        .set-matrix td:first-child{text-align:left;font-weight:600;color:var(--ink);}
        .set-matrix tr:last-child td{border-bottom:none;}
        .set-matrix input[type=checkbox]{width:15px;height:15px;accent-color:var(--blue-hi);cursor:pointer;}
        .set-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);}
        .set-row:last-child{border-bottom:none;}
        .set-row-main{display:flex;align-items:center;gap:12px;min-width:0;}
        .set-row-ic{width:32px;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:var(--surface-2);flex-shrink:0;}
        .set-row-name{font-size:var(--fs-sm);font-weight:600;color:var(--ink);}
        .set-row-sub{font-size:var(--fs-2xs);color:var(--ink-3);margin-top:1px;}
        .set-row-right{display:flex;align-items:center;gap:10px;flex-shrink:0;}
        .set-tag{font-size:var(--fs-2xs);font-weight:700;padding:2px 9px;border-radius:20px;background:var(--surface-2);color:var(--ink-3);}
        .set-tag.on{background:rgba(31,157,91,.12);color:var(--ok);}
        .set-sub2{font-size:var(--fs-xs);color:var(--ink-3);line-height:1.5;margin:-2px 0 12px;max-width:640px;}
      </style>
      <div class="set-crumb"><span class="lnk" onclick="switchTab('dashboard')" style="cursor:pointer;color:var(--ink-2);font-weight:700;">Situation</span><span style="opacity:.5;"> / </span>ADMINISTRATION</div>
      <div class="set-header">
        <button class="set-back" onclick="switchTab('dashboard')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>Back to Situation</button>
        <div><div class="set-title">Administration</div><div class="set-sub">${SECTIONS.length} sections · users, teams, devices, alerts and system config</div></div>
      </div>
      <div id="st-loading" style="padding:60px;text-align:center;color:var(--ink-3);"><div class="loading" style="margin:0 auto 12px;"></div>Loading…</div>
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
          <div class="set-content">${panels}</div>
        </div>
      </div>`;

    updateClock();
    loadSettings();
  }

  function na(label) {
    OpsModal.toast((label ? label + ' — ' : '') + 'not wired to a backend yet.', 'watch');
  }

  function section(k) {
    _active = k;
    document.querySelectorAll('.set-item').forEach(el => el.classList.toggle('active', el.id === 'set-item-' + k));
    document.querySelectorAll('.set-panel').forEach(el => el.classList.toggle('active', el.id === 'set-panel-' + k));
    if (k === 'users' && !_perm) loadPermissions();
  }

  // ── Editable role permissions (persisted + API-enforced) ──
  let _perm = null, _permChanges = {};
  const ROLE_LABEL = { operations_manager: 'Ops Manager', dispatcher: 'Dispatcher', field_lead: 'Field Lead', analyst: 'Analyst', finance: 'Finance' };
  const escp = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function loadPermissions() {
    const wrap = document.getElementById('set-perm-wrap');
    if (!wrap) return;
    wrap.innerHTML = '<div class="set-sub2">Loading permission model…</div>';
    try {
      _perm = (await OpsModal.apiGet('/settings/permissions')).data;
      _permChanges = {};
      renderPermMatrix();
    } catch (err) {
      const denied = /403/.test(err.message || '');
      wrap.innerHTML = `<div class="set-sub2">${denied ? 'Only admins can view and edit the permission model.' : 'Failed to load permissions: ' + escp(err.message)}</div>`;
    }
  }

  function renderPermMatrix() {
    const wrap = document.getElementById('set-perm-wrap');
    if (!wrap || !_perm) return;
    const rows = [];
    _perm.modules.forEach(m => _perm.actions.forEach(a => {
      const key = m.key + '.' + a;
      const cells = _perm.roles.map(role => {
        const val = !!(_perm.grants[role] && _perm.grants[role][key]);
        return `<td style="text-align:center;"><input type="checkbox" ${val ? 'checked' : ''} onchange="OpsSettings.togglePerm('${role}','${key}',this.checked)"></td>`;
      }).join('');
      rows.push(`<tr><td style="white-space:nowrap;">${m.label} · <span style="color:var(--ink-3);text-transform:capitalize;">${a}</span></td>${cells}</tr>`);
    }));
    wrap.innerHTML = `
      <div style="font-size:var(--fs-xs);color:var(--ink-3);margin-bottom:10px;line-height:1.5;">Admins always have full access (not editable). <b>View</b> = can open the module; <b>Manage</b> = can create/change within it. Saved changes are enforced by the API.</div>
      <div style="overflow-x:auto;"><table class="set-matrix">
        <thead><tr><th>Permission</th>${_perm.roles.map(r => `<th>${ROLE_LABEL[r] || r}</th>`).join('')}</tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table></div>
      <div class="set-savebar"><span class="set-saved" id="set-perm-saved">Saved</span><button class="set-btn" onclick="OpsSettings.loadPermissions()">Reset</button><button class="set-btn primary" id="set-perm-save-btn" onclick="OpsSettings.savePermissions()">Save permissions</button></div>`;
  }

  function togglePerm(role, key, val) {
    _permChanges[role + '|' + key] = { role, permission_key: key, allowed: val };
    if (_perm && _perm.grants[role]) _perm.grants[role][key] = val;
  }

  async function savePermissions() {
    const changes = Object.values(_permChanges || {});
    if (!changes.length) return OpsModal.toast('No changes to save', 'watch');
    OpsModal.setLoading('set-perm-save-btn', true);
    try {
      _perm = (await OpsModal.apiPut('/settings/permissions', { changes })).data;
      _permChanges = {};
      renderPermMatrix();
      OpsModal.toast('Permissions saved and enforced', 'nominal');
    } catch (err) {
      OpsModal.toast('Failed to save: ' + err.message, 'critical');
      OpsModal.setLoading('set-perm-save-btn', false);
    }
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

  return { render, section, na, save, reset, toggleDemo, loadPermissions, renderPermMatrix, togglePerm, savePermissions };

})();
