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
    const F = (label, ctrl, sub) => `<div class="set-field-row"><div class="set-flabel">${label}${sub?`<span class="sub">${sub}</span>`:''}</div><div>${ctrl}</div></div>`;
    const ctl = f => {
      if (f.t === 'select') return `<select class="set-input" ${f.id?`id="${f.id}"`:''}>${(f.opts||[]).map(o=>`<option>${o}</option>`).join('')}</select>`;
      if (f.t === 'textarea') return `<textarea class="set-input" rows="3" ${f.id?`id="${f.id}"`:''} style="resize:vertical;"></textarea>`;
      return `<input class="set-input" ${f.id?`id="${f.id}"`:''} type="${f.t||'text'}"${f.ph?` placeholder="${f.ph}"`:''}>`;
    };
    const flds = list => (list||[]).map(f => F(f.l, ctl(f), f.sub)).join('');
    const tog = o => `<label class="set-switch"><input type="checkbox" ${o&&o.id?`id="${o.id}"`:''}${o&&o.on?' checked':''}><span></span></label>`;
    const togs = list => (list||[]).map(t => F(t.l, tog(t), t.sub)).join('');
    const btn = (l, primary) => {
      const oc = /^save$/i.test(l) ? 'OpsSettings.save()' : /reset|restore defaults/i.test(l) ? 'OpsSettings.reset()' : /^cancel$/i.test(l) ? "reloadTab('settings')" : `OpsSettings.na('${l.replace(/'/g,'')}')`;
      return `<button class="set-btn${primary?' primary':''}" onclick="${oc}">${l}</button>`;
    };
    const btns = list => list && list.length ? `<div class="set-savebar">${list.map(b => btn(b[0], b[1])).join('')}</div>` : '';
    const note = t => `<div class="set-sub2">${t}</div>`;

    // Permissions matrix
    const MODULES = ['Dashboard','Network','Assets','Properties','Clients','Billing','Devices','Reports','Teams','Field Reports','Settings'];
    const PERMS = ['View','Create','Edit','Delete','Export','Approve','Assign','Manage'];
    const permMatrix = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
        <span class="set-flabel" style="font-weight:600;">Role</span>
        <select class="set-input" style="width:220px;"><option>Operations Manager</option><option>Dispatcher</option><option>Field Lead</option><option>Finance</option><option>Viewer</option></select>
      </div>
      <div style="overflow-x:auto;"><table class="set-matrix">
        <thead><tr><th>Module</th>${PERMS.map(p=>`<th>${p}</th>`).join('')}</tr></thead>
        <tbody>${MODULES.map(m=>`<tr><td>${m}</td>${PERMS.map(()=>`<td><input type="checkbox"></td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>`;

    // Notification channels list
    const chanRow = (name, icon, sub, id) => `<div class="set-row"><div class="set-row-main"><div class="set-row-ic">${icon}</div><div><div class="set-row-name">${name}</div><div class="set-row-sub">${sub}</div></div></div><div class="set-row-right">${tog(id?{id}:{})}</div></div>`;
    const iMail='✉', iChat='💬';
    const channels = `
      ${chanRow('Email','✉','SMTP · transactional + alerts','s-email-alerts')}
      ${chanRow('SMS','📱','Critical alerts to on-call','s-sms-alerts')}
      ${chanRow('WhatsApp','🟢','Business API — not connected')}
      ${chanRow('Push notification','🔔','In-app + mobile')}
      ${chanRow('Slack','#','Ops channel webhook')}
      ${chanRow('Microsoft Teams','▦','Incident channel')}
      ${chanRow('Voice call','📞','Escalation calls')}`;

    // Email templates
    const TEMPLATES = ['Welcome','Password Reset','Invoice','Maintenance Reminder','Incident Alert','Weekly Report','Monthly Report','SLA Breach','Device Offline'];
    const templates = TEMPLATES.map(t=>`<div class="set-row"><div class="set-row-main"><div class="set-row-ic">✉</div><div class="set-row-name">${t}</div></div><div class="set-row-right"><button class="set-btn" onclick="OpsSettings.na('Preview')">Preview</button><button class="set-btn" onclick="OpsSettings.na('Send test')">Send test</button></div></div>`).join('');

    // Integrations
    const SERVICES = [['Weather API','Connected','on'],['Maps API','Connected','on'],['Payment Gateway','Not connected',''],['CRM','Not connected',''],['ERP','Not connected',''],['GIS','Not connected',''],['SSO','Not connected',''],['Monitoring','Not connected','']];
    const integrations = SERVICES.map(([n,st,on])=>`<div class="set-row"><div class="set-row-main"><div class="set-row-ic">🔌</div><div><div class="set-row-name">${n}</div><div class="set-row-sub">${st}</div></div></div><div class="set-row-right"><span class="set-tag ${on}">${on?'Active':'Off'}</span><button class="set-btn" onclick="OpsSettings.na('${on?'Disconnect':'Connect'}')">${on?'Disconnect':'Connect'}</button></div></div>`).join('');

    // API keys sample table
    const apiKeys = `<div style="overflow-x:auto;"><table class="set-matrix" style="text-align:left;">
      <thead><tr><th style="text-align:left;">Key name</th><th style="text-align:left;">Key</th><th style="text-align:left;">Scope</th><th style="text-align:left;">Last used</th><th></th></tr></thead>
      <tbody>
        <tr><td>Ingest key</td><td><span class="set-mono">fg_live_••••7a2c</span></td><td>write:telemetry</td><td>2h ago</td><td style="text-align:right;"><button class="set-btn" onclick="OpsSettings.na('Revoke')">Revoke</button></td></tr>
        <tr><td>Read-only export</td><td><span class="set-mono">fg_live_••••0f19</span></td><td>read:all</td><td>4d ago</td><td style="text-align:right;"><button class="set-btn" onclick="OpsSettings.na('Revoke')">Revoke</button></td></tr>
      </tbody></table></div>`;

    // Webhook events
    const EVENTS = ['Device Online','Device Offline','Alert Created','Alert Resolved','Work Order Created','Work Order Completed','Invoice Paid','Report Generated'];
    const webhookEvents = `<div class="set-field-row"><div class="set-flabel">Event types<span class="sub">Which events POST to the URL</span></div><div style="display:flex;flex-wrap:wrap;gap:10px 18px;">${EVENTS.map(e=>`<label style="display:inline-flex;align-items:center;gap:6px;font-size:var(--fs-sm);color:var(--ink-2);"><input type="checkbox" style="width:15px;height:15px;accent-color:var(--blue-hi);">${e}</label>`).join('')}</div></div>`;

    // Subscription usage
    const usage = (label, used, total, pct) => `<div class="set-field-row"><div class="set-flabel">${label}</div><div><div style="display:flex;justify-content:space-between;font-size:var(--fs-xs);color:var(--ink-2);margin-bottom:5px;"><span>${used}</span><span style="color:var(--ink-3);">of ${total}</span></div><div class="set-usage"><i style="width:${pct}%;"></i></div></div></div>`;
    const subUsage = usage('Seats used','18 seats','25 seats',72) + usage('Devices','5 devices','50 devices',10) + usage('Storage','2.1 GB','20 GB',11) + usage('API usage (month)','48k calls','250k calls',19);

    const SECTIONS = [
      { g:'General', k:'company', label:'Company profile', b:'partial',
        fields:[
          {l:'Company name', id:'s-company-name'}, {l:'Legal name'}, {l:'Registration number'}, {l:'Tax ID'},
          {l:'Industry', t:'select', opts:['Facilities management','Real estate','Government','Utilities','Other']},
          {l:'Company email', id:'s-contact-email', t:'email'}, {l:'Phone number', id:'s-contact-phone'},
          {l:'Website', ph:'https://'}, {l:'Address'}, {l:'Country', t:'select', opts:['Nigeria','Ghana','Kenya','South Africa']},
          {l:'State'}, {l:'Time zone', id:'s-timezone', ph:'Africa/Lagos'},
          {l:'Currency', t:'select', opts:['NGN — Naira','USD — Dollar','GHS — Cedi','KES — Shilling']}, {l:'Business hours', ph:'Mon–Fri 08:00–17:00'},
        ],
        custom:`<div class="set-field-row"><div class="set-flabel">Logo</div><div style="display:flex;align-items:center;gap:12px;"><div style="width:64px;height:40px;border-radius:8px;background:var(--ink);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;">FG</div><button class="set-btn" onclick="OpsSettings.na('Upload logo')">Upload logo</button></div></div>
        <div class="set-field-row"><div class="set-flabel">Favicon</div><div style="display:flex;align-items:center;gap:12px;"><div style="width:32px;height:32px;border-radius:8px;background:var(--surface-2);display:flex;align-items:center;justify-content:center;">◆</div><button class="set-btn" onclick="OpsSettings.na('Upload favicon')">Upload favicon</button></div></div>`,
        toggles:[{l:'Show company branding'},{l:'Enable white label'},{l:'Display support contact'}],
        buttons:[['Preview portal'],['Cancel'],['Save',true]] },

      { g:'General', k:'branding', label:'Branding', b:'no',
        note:'Not persisted yet — a branding table would store these; today logo/theme ship in code.',
        fields:[{l:'Logo'},{l:'Icon'},{l:'Company name'},{l:'Primary colour', ph:'#16a8d3'},{l:'Secondary colour', ph:'#0d7fa0'},{l:'Accent colour', ph:'#1f9d5b'},{l:'Font', t:'select', opts:['Plus Jakarta Sans','Inter','System']},{l:'Login background'},{l:'Email header image'},{l:'Portal URL'}],
        toggles:[{l:'White label'},{l:'Show “Powered by FlowGuard”', on:true},{l:'Custom login screen'},{l:'Custom emails'}],
        buttons:[['Preview'],['Restore defaults'],['Publish',true]] },

      { g:'General', k:'prefs', label:'Preferences', b:'no',
        note:'UI-only for now — a per-user/workspace preferences table would persist these.',
        fields:[{l:'Default landing page', t:'select', opts:['Situation','Network','Properties','Devices']},{l:'Default map zoom', t:'number'},{l:'Default region'},{l:'Default language', t:'select', opts:['English','French']},{l:'Date format', t:'select', opts:['DD MMM YYYY','MM/DD/YYYY','YYYY-MM-DD']},{l:'Time format', t:'select', opts:['24-hour','12-hour']},{l:'Distance units', t:'select', opts:['Metric (km)','Imperial (mi)']},{l:'Temperature units', t:'select', opts:['Celsius','Fahrenheit']}],
        toggles:[{l:'Compact mode'},{l:'Animations', on:true},{l:'Live updates', on:true},{l:'Auto refresh', on:true},{l:'Sound alerts'},{l:'High-contrast mode'}],
        buttons:[['Restore defaults'],['Save',true]] },

      { g:'Access', k:'users', label:'Users & roles', b:'partial',
        note:'Staff accounts live in the users table and are fully managed in Team Members. Roles below are a reference.',
        fields:[{l:'Full name'},{l:'Email', t:'email'},{l:'Phone'},{l:'Employee ID'},{l:'Department'},{l:'Team', t:'select', opts:['—','Field Team A','Field Team B']},{l:'Role', t:'select', opts:['Operations Manager','Dispatcher','Field Lead','Finance','Viewer']},{l:'Manager'}],
        toggles:[{l:'Active', on:true},{l:'Force password change'},{l:'Require MFA'},{l:'API access'}],
        buttons:[['Open Team Members'],['Add user'],['Export'],['Send invite',true]] },

      { g:'Access', k:'perms', label:'Permissions', b:'no',
        note:'Roles are code-defined today; this matrix shows the model a permissions table would drive.',
        custom:permMatrix,
        buttons:[['Copy from role'],['Reset'],['Save',true]] },

      { g:'Access', k:'teams', label:'Teams', b:'partial',
        note:'Field teams live in field_teams and are managed in the Teams module.',
        fields:[{l:'Team name'},{l:'Supervisor'},{l:'Members', t:'number'},{l:'Vehicle'},{l:'Region'},{l:'Working hours'},{l:'Emergency contact'}],
        toggles:[{l:'Available', on:true},{l:'Emergency response team'},{l:'On duty'}],
        buttons:[['Open Teams'],['Assign members'],['Archive'],['Create team',true]] },

      { g:'Operations', k:'devicetypes', label:'Device types', b:'no',
        note:'Device variants are inferred per sensor today; a device-type catalogue would live here.',
        fields:[{l:'Device name'},{l:'Model'},{l:'Manufacturer'},{l:'Firmware version'},{l:'Sensor types'},{l:'Battery capacity'},{l:'Connectivity', t:'select', opts:['Cellular','LoRa','Hybrid']},{l:'Sampling interval'},{l:'Sleep interval'}],
        toggles:[{l:'Active', on:true},{l:'Supports OTA updates', on:true},{l:'GPS enabled'},{l:'Camera enabled'}],
        buttons:[['Duplicate'],['Archive'],['Add device type',true]] },

      { g:'Operations', k:'alerts', label:'Alert rules', b:'partial',
        note:'Global thresholds below are saved to /settings. The rule builder is scaffolding for a future alert_rules table.',
        fields:[
          {l:'Critical threshold', id:'s-threshold-critical', t:'number', sub:'Water level % → critical'},
          {l:'Warning threshold', id:'s-threshold-warning', t:'number', sub:'Water level % → warning'},
          {l:'Escalation time', id:'s-escalation-time', t:'number', sub:'Minutes before escalation'},
          {l:'Response SLA', id:'s-response-sla', t:'number', sub:'Target response minutes'},
          {l:'Rule name'}, {l:'Alert category', t:'select', opts:['Water level','Battery','Silt','Connectivity','Flood']},
          {l:'Trigger'}, {l:'Severity', t:'select', opts:['Critical','High','Moderate','Low']},
          {l:'Assigned team', t:'select', opts:['—','Field Team A','Field Team B']}, {l:'Notification group'},
        ],
        toggles:[{l:'Enabled', on:true},{l:'Auto assign'},{l:'Repeat notifications'},{l:'Auto resolve'}],
        buttons:[['Test rule'],['Duplicate'],['Disable'],['Create rule',true]] },

      { g:'Operations', k:'mainttpl', label:'Maintenance templates', b:'no',
        note:'No template store yet — work orders are created ad-hoc.',
        fields:[{l:'Template name'},{l:'Category', t:'select', opts:['Silt clearing','Enzyme refill','Node repair','Inspection']},{l:'Estimated duration'},{l:'Priority', t:'select', opts:['Low','Normal','High','Urgent']},{l:'Checklist', t:'textarea'},{l:'Required tools'},{l:'Required PPE'},{l:'Instructions', t:'textarea'}],
        toggles:[{l:'Active', on:true},{l:'Mandatory checklist'}],
        buttons:[['Duplicate'],['Archive'],['Create',true]] },

      { g:'Billing', k:'billingset', label:'Billing settings', b:'partial',
        note:'Invoices/quotes are managed in Billing. These defaults would drive generation.',
        fields:[{l:'Currency', t:'select', opts:['NGN','USD','GHS','KES']},{l:'Tax rate', t:'number', ph:'7.5'},{l:'Invoice prefix', ph:'INV-'},{l:'Invoice due days', t:'number', ph:'30'},{l:'Late fee', t:'number'},{l:'Default payment terms'},{l:'Bank details', t:'textarea'}],
        toggles:[{l:'Auto-generate invoice'},{l:'Auto-send invoice'},{l:'Charge late fees'},{l:'Enable VAT', on:true}],
        buttons:[['Preview invoice'],['Open Billing'],['Save',true]] },

      { g:'Billing', k:'subs', label:'Subscription & licensing', b:'no',
        note:'Plan and usage shown for reference — not modelled in the schema yet.',
        fields:[{l:'Plan', t:'select', opts:['Growth','Scale','Enterprise']},{l:'License key'},{l:'Organization ID'},{l:'Subscription status'},{l:'Renewal date', t:'date'},{l:'Billing cycle', t:'select', opts:['Monthly','Annual']}],
        custom:subUsage,
        toggles:[{l:'Auto renew', on:true},{l:'Usage alerts', on:true},{l:'Overage protection'}],
        buttons:[['Download invoice'],['Contact sales'],['Manage billing'],['Renew license'],['Upgrade plan',true]] },

      { g:'Notifications', k:'notifs', label:'Notification channels', b:'partial',
        note:'Email and SMS toggles + alert contacts below are saved to /settings.',
        custom:channels,
        fields:[{l:'Alert email', id:'s-alert-email', t:'email'},{l:'Alert phone', id:'s-alert-phone'},{l:'Provider'},{l:'Sender name'},{l:'API credentials', t:'password'},{l:'Retry attempts', t:'number'}],
        toggles:[{l:'Weekly digest', id:'s-weekly-digest'},{l:'Enable quiet hours'},{l:'Retry failed messages', on:true}],
        buttons:[['Test notification'],['Save',true]] },

      { g:'Notifications', k:'emailtpl', label:'Email templates', b:'no',
        note:'Notification copy is code-defined; an editable template store would live here.',
        custom:templates,
        buttons:[['Duplicate'],['Reset'],['Send test email',true]] },

      { g:'Developer', k:'integrations', label:'Integrations', b:'no',
        note:'Weather and Maps are live; the rest are placeholders for an integrations registry.',
        custom:integrations,
        fields:[{l:'Service name'},{l:'API key', t:'password'},{l:'Secret', t:'password'},{l:'Endpoint'}],
        buttons:[['Test connection'],['Connect',true]] },

      { g:'Developer', k:'apikeys', label:'API keys', b:'no',
        note:'Illustrative — programmatic keys are not issued from this workspace yet.',
        custom:apiKeys,
        fields:[{l:'Key name'},{l:'Scope', t:'select', opts:['read:all','write:telemetry','admin']},{l:'Expiry', t:'date'}],
        toggles:[{l:'Active', on:true},{l:'Read only'},{l:'Never expires'}],
        buttons:[['Regenerate'],['Revoke'],['Generate',true]] },

      { g:'Developer', k:'webhooks', label:'Webhooks', b:'no',
        note:'Outbound webhooks are not wired yet.',
        fields:[{l:'Name'},{l:'URL', ph:'https://'},{l:'Secret', t:'password'},{l:'Retry count', t:'number'}],
        custom:webhookEvents,
        toggles:[{l:'Enabled'},{l:'Verify signature', on:true},{l:'Retry failed deliveries', on:true}],
        buttons:[['Test'],['Disable'],['Save',true]] },

      { g:'System', k:'security', label:'Security', b:'no',
        note:'Sessions are JWT-based; these controls are not persisted as settings yet.',
        fields:[{l:'Password policy', t:'select', opts:['Standard','Strong','Very strong']},{l:'Session timeout', t:'select', opts:['30 min','1 hour','8 hours']},{l:'Allowed domains'},{l:'Allowed IPs'},{l:'Login attempts', t:'number'},{l:'Password expiry', t:'select', opts:['Never','90 days','60 days','30 days']},{l:'MFA method', t:'select', opts:['Authenticator app','SMS','Email']}],
        toggles:[{l:'Force MFA'},{l:'SSO'},{l:'Password expiration'},{l:'Device trust'},{l:'IP restriction'},{l:'Audit all changes', on:true}],
        buttons:[['Force logout all users'],['Save',true]] },

      { g:'System', k:'audit', label:'Audit', b:'partial',
        note:'Every ops action is written to audit_log and viewable in the Audit module.',
        fields:[{l:'Log retention', t:'select', opts:['90 days','180 days','1 year','Forever']},{l:'Export schedule', t:'select', opts:['Off','Weekly','Monthly']},{l:'Storage location'}],
        toggles:[{l:'Enable audit logging', on:true},{l:'Track login events', on:true},{l:'Track API calls'},{l:'Track configuration changes', on:true}],
        buttons:[['Clear old logs'],['Open Audit log'],['Export logs',true]] },

      { g:'System', k:'backup', label:'Backup & data retention', b:'no',
        note:'Backups run at the database layer today, not from the app.',
        fields:[{l:'Backup frequency', t:'select', opts:['Hourly','Daily','Weekly']},{l:'Backup time'},{l:'Retention period', t:'select', opts:['7 days','30 days','90 days','1 year']},{l:'Storage location'},{l:'Archive after'},{l:'Delete after'}],
        toggles:[{l:'Automatic backup', on:true},{l:'Encrypt backup', on:true},{l:'Verify backup', on:true},{l:'Geo redundancy'}],
        buttons:[['Restore backup'],['Download backup'],['View backup history'],['Run backup now',true]] },
    ];

    let nav = '', lastG = '';
    SECTIONS.forEach(s => {
      if (s.g !== lastG) { nav += `<div class="set-group">${s.g}</div>`; lastG = s.g; }
      nav += `<div class="set-item${s.k === _active ? ' active' : ''}" id="set-item-${s.k}" onclick="OpsSettings.section('${s.k}')">${s.label}<span class="set-dot ${s.b}"></span></div>`;
    });
    const chip = b => `<span class="set-chip ${b}">${b === 'yes' ? 'Backed by a table' : b === 'partial' ? 'Partial / indirect' : 'Not backed yet'}</span>`;
    const panels = SECTIONS.map(s => `<div class="set-panel${s.k === _active ? ' active' : ''}" id="set-panel-${s.k}"><div class="set-panel-head"><h2>${s.label}</h2>${chip(s.b)}</div>${s.note?note(s.note):''}${s.custom&&!s.fields?s.custom:''}${flds(s.fields)}${s.custom&&s.fields?s.custom:''}${togs(s.toggles)}${btns(s.buttons)}</div>`).join('');

    container.innerHTML = `
      ${SET_STYLE}
      <style>
        .set-mono{font-family:var(--ff-m);font-size:var(--fs-xs);}
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
        .set-usage{height:7px;border-radius:5px;background:var(--surface-2);overflow:hidden;}
        .set-usage i{display:block;height:100%;background:var(--blue-hi);}
        .set-sub2{font-size:var(--fs-xs);color:var(--ink-3);line-height:1.5;margin:-2px 0 12px;max-width:640px;}
      </style>
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
          </div>
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

  return { render, section, na, save, reset, toggleDemo };

})();
