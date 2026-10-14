// ============================================
// OPS SETTINGS MODULE
// System configuration — save actually works
// ============================================

const OpsSettings = (function () {
  'use strict';

  let _settings = {};
  let _dirty    = false;
  let _loaded = false, _container = null;
  const canAdmin = () => { try { return ['admin','super_admin'].includes(Auth.getUser()?.role); } catch(_) { return false; } };

  function markDirty() {
    if (_dirty) return;
    _dirty = true;
    updateSettingsActions('Unsaved settings edits');
  }

  function markClean() {
    _dirty = false;
    updateSettingsActions('No unsaved settings edits');
  }
  function updateSettingsActions(message) {
    const note=document.getElementById('st-dirty-note');if(note)note.textContent=message;
    for(const id of ['st-save-btn','st-discard-btn']) {const button=document.getElementById(id);if(button)button.disabled=!_dirty || !_loaded || !canAdmin();}
  }

  let _active = 'profile';


  function render(container) {
    markClean();
    _container=container;_loaded=false;
    if(!['profile','users','alerts','notifs','integrations'].includes(_active))_active='profile';
    let U = {};
    try { U = Auth.getUser() || {}; } catch (e) {}
    const uInitials = (U.full_name || U.name || '?').split(' ').filter(Boolean).map(w=>w[0]).join('').toUpperCase().slice(0,2);

    const F = (label, ctrl, sub) => `<div class="set-field-row"><div class="set-flabel">${label}${sub?`<span class="sub">${sub}</span>`:''}</div><div>${ctrl.replace(/<(input|select|textarea)\b/,'<$1 aria-label="'+OpsModal.escape(label)+'"')}</div></div>`;
    const ctl = f => {
      const v = f.val != null ? ` value="${OpsModal.escape(f.val)}"` : '';
      const disabled = !f.id || f.ro ? ' disabled' : '';
      if (f.t === 'select') return `<select class="set-input"${disabled} ${f.id?`id="${f.id}"`:''}>${(f.opts||[]).map(o=>`<option>${o}</option>`).join('')}</select>`;
      if (f.t === 'textarea') return `<textarea class="set-input"${disabled} rows="3" ${f.id?`id="${f.id}"`:''} style="resize:vertical;"></textarea>`;
      return `<input class="set-input" ${f.id?`id="${f.id}"`:''} type="${f.t||'text'}"${v}${disabled}${f.ph?` placeholder="${f.ph}"`:''}>`;
    };
    const flds = list => (list||[]).map(f => F(f.l, ctl(f), f.sub)).join('');
    const tog = o => `<div class="set-toggle"><label class="set-switch"><input type="checkbox" ${o?.name?`aria-label="${OpsModal.escape(o.name)}"`:''} ${o&&o.id?`id="${o.id}" aria-describedby="${o.id}-state"`:'disabled'}${o&&o.on?' checked':''}><span></span></label>${o?.id?`<span class="set-value-state" id="${o.id}-state" hidden>Value not supplied</span>`:''}</div>`;
    const togs = list => (list||[]).map(t => F(t.l, tog(t), t.sub)).join('');
    const btn = (l, primary) => {
      const oc = /^save$/i.test(l) ? 'OpsSettings.save()' : /reset|restore defaults/i.test(l) ? 'OpsSettings.reset()' : /^cancel$/i.test(l) ? "reloadTab('settings')" : /staff/i.test(l) ? "switchTab('team-members')" : /teams$/i.test(l) ? "switchTab('teams')" : /audit/i.test(l) ? "switchTab('audit')" : /reports/i.test(l) ? "switchTab('reports')" : `OpsSettings.na('${l.replace(/'/g,'')}')`;
      const unavailable = oc.includes('.na(');
      return `<button class="set-btn fg-action${primary?' primary fg-action-primary':''}" ${unavailable || /^save$/i.test(l) && !canAdmin() ? 'disabled title="This control is unavailable or read-only for your role"' : `onclick="${oc}"`}>${l}</button>`;
    };
    const btns = list => list && list.length ? `<div class="set-savebar">${list.map(b => btn(b[0], b[1])).join('')}</div>` : '';
    const note = t => `<div class="set-sub2">${t}</div>`;

    const chanRow = (name, icon, sub, id) => `<div class="set-row"><div class="set-row-main"><div class="set-row-ic">${icon}</div><div><div class="set-row-name">${name}</div><div class="set-row-sub">${sub}</div></div></div><div class="set-row-right">${tog({id,name:name+' routing preference'})}</div></div>`;
    const channels = `
      ${chanRow('Email',OpsModal.entityIcon('mail'),'Email routing preference · not delivery health','s-email-alerts')}
      ${chanRow('Push',OpsModal.entityIcon('notification'),'Routing preference unavailable')}
      ${chanRow('SMS',OpsModal.entityIcon('phone'),'SMS routing preference · not delivery health','s-sms-alerts')}
      ${chanRow('WhatsApp',OpsModal.entityIcon('support'),'Channel configuration unavailable')}`;

    const NEVENTS = ['Incident created','Incident resolved','Device offline','Work order assigned','SLA breach','Report ready'];
    const eventsChecklist = `<fieldset class="fg-choice-group" disabled><legend>Event-specific routing — unavailable</legend><div>${NEVENTS.map(e=>`<label class="fg-choice"><input type="checkbox">${e}</label>`).join('')}</div></fieldset>`;

    const SERVICES = CONFIG.LOCAL_SANDBOX
      ? [['Weather provider','Read-only external weather; not a sandbox fixture','on'],['SMS gateway','Delivery disabled',''],['Email provider','Delivery disabled',''],['Maps provider','Read-only external map tiles','on'],['Internal APIs','Isolated loopback API · incomplete route coverage','on']]
      : [['Weather provider','Open-Meteo · health unverified','on'],['SMS gateway','Not connected',''],['Email provider','SMTP · health unverified','on'],['Maps provider','CARTO · health unverified','on'],['Internal APIs','api.flowguard.ng · health unverified','on']];
    const integrations = SERVICES.map(([n,st,on])=>`<div class="set-row"><div class="set-row-main"><div class="set-row-ic">${OpsModal.entityIcon('integration')}</div><div><div class="set-row-name">${n}</div><div class="set-row-sub">${st}</div></div></div><div class="set-row-right"><span class="set-tag">${on?'Configured dependency':'Not configured'}</span><button class="fg-action" disabled title="Connection testing is not available">Test</button></div></div>`).join('');

    const SECTIONS = [
      { g:'Account', k:'profile', label:'My profile', b:'no',note:'Account information is read-only here. Profile editing, password changes and MFA enrolment are not available in this portal.',
        custom:`<div class="set-field-row"><div class="set-flabel">Account identity</div><div class="set-avatar-lg">${OpsModal.escape(uInitials)}</div></div>`,
        fields:[
          {l:'Name', val:U.full_name||U.name||''},
          {l:'Email', t:'email', val:U.email||'', ro:true, sub:'Managed by your admin'},
          {l:'Phone', val:U.phone||''},
          {l:'Job title', val:U.job_title||''},
          {l:'Team', val:U.team_name||'', ro:true},
        ],
        },

      { g:'Access', k:'users', label:'Roles & permissions', b:'yes',
        note:'Staff accounts and invitations are managed in Staff. Administrators can review and change the supplied role permissions here; the API enforces saved changes.',
        custom:`<div id="set-perm-wrap"><div class="set-sub2">Open this section to load the permission model.</div></div>`,
        buttons:[['Open Staff']] },

      { g:'Operations', k:'alerts', label:'Operational rules', b:'partial',
        note:'Thresholds and response rules. Enabled controls can be saved. Disabled controls are unavailable.',
        fields:[
          {l:'Water level — critical', id:'s-threshold-critical', t:'number', sub:'% that raises a critical alert'},
          {l:'Water level — warning', id:'s-threshold-warning', t:'number', sub:'% that raises a warning'},
          {l:'Device offline threshold', ph:'Unavailable', sub:'Not configurable in this portal'},
          {l:'Weather thresholds', ph:'Unavailable', sub:'Not configurable in this portal'},
          {l:'Escalation time', id:'s-escalation-time', t:'number', sub:'Minutes before an alert escalates'},
          {l:'Response SLA', id:'s-response-sla', t:'number', sub:'Target minutes to respond'},
          {l:'Notification routing', t:'select', opts:['Unavailable']},
        ],
        buttons:[['Save',true]] },

      { g:'Delivery', k:'notifs', label:'Notifications', b:'partial',
        note:'Configure supported notification channels and alert contacts. Disabled controls are unavailable.',
        custom:channels,
        fields:[{l:'Notification email', id:'s-alert-email', t:'email'},{l:'Notification phone', id:'s-alert-phone'}],
        toggles:[{l:'Weekly digest', id:'s-weekly-digest'},{l:'Quiet hours', sub:'Mute non-critical at night'}],
        buttons:[['Test notification'],['Save',true]],
        after:eventsChecklist },

      { g:'System', k:'integrations', label:'Integrations', b:'partial',
        note:'Configured service dependencies. These labels do not confirm current connection health.',
        custom:integrations,
        buttons:[['Save',true]] },
    ];

    let nav = '', lastG = '';
    SECTIONS.forEach(s => {
      if (s.g !== lastG) { nav += `<div class="set-group">${s.g}</div>`; lastG = s.g; }
      nav += `<button type="button" class="set-item${s.k === _active ? ' active' : ''}" id="set-item-${s.k}" aria-current="${s.k === _active ? 'page' : 'false'}" onclick="OpsSettings.section('${s.k}')">${s.label}</button>`;
    });
    const chip = b => OpsModal.status('unknown',b === 'yes' ? (canAdmin()?'Administrative controls':'Administrator access required') : b === 'partial' ? 'Some controls unavailable' : 'Read-only information','neutral');
    const panels = SECTIONS.map(s => {
      const buttons = (s.buttons || []).filter(b => !/save|restore defaults/i.test(b[0]));
      return `<div class="set-panel${s.k === _active ? ' active' : ''}" id="set-panel-${s.k}"><div class="set-panel-head"><h2>${s.label}</h2>${chip(s.b)}</div>${s.note?note(s.note):''}${s.custom&&!s.fields?s.custom:''}${flds(s.fields)}${s.custom&&s.fields?s.custom:''}${togs(s.toggles)}${s.after||''}${btns(buttons)}</div>`;
    }).join('');

    container.innerHTML = `


      ${OpsModal.pageHeader({title:'Settings',subtitle:'Organisation configuration, permissions and operational policies'})}
      <div id="st-loading" style="padding:60px;text-align:center;color:var(--ink-3);"><div class="loading" style="margin:0 auto 12px;"></div>Loading…</div>
      <div id="st-body" style="display:none;">
        <div class="set-grid">
          <div class="set-nav">
            ${nav}
          </div>
          <div class="set-content"><div class="set-savebar" id="st-policy-actions" hidden><span class="set-saved" id="st-dirty-note" role="status">No unsaved settings edits</span><button class="fg-action fg-action-neutral" id="st-discard-btn" disabled onclick="OpsSettings.reset()">Discard edits</button><button class="primary fg-action fg-action-primary" id="st-save-btn" disabled onclick="OpsSettings.save()">Save settings</button></div>${panels}</div>
        </div>
      </div>`;

    updateClock();
    loadSettings();
  }

  function na(label) {
    OpsModal.toast((label ? label + ' — ' : '') + 'unavailable in this portal.', 'watch');
  }

  function section(k) {
    _active = k;
    document.querySelectorAll('.set-item').forEach(el => {
      const active = el.id === 'set-item-' + k;
      el.classList.toggle('active', active); el.setAttribute('aria-current', active ? 'page' : 'false');
    });
    document.querySelectorAll('.set-panel').forEach(el => el.classList.toggle('active', el.id === 'set-panel-' + k));
    const actions=document.getElementById('st-policy-actions');if(actions)actions.hidden=!['alerts','notifs'].includes(k);
    if (k === 'users' && !_perm) loadPermissions();
  }

  // ── Editable role permissions (persisted + API-enforced) ──
  let _perm = null, _permChanges = {}, _permBaseline={}, _permQuery='', _permRole='all';
  const ROLE_LABEL = { operations_manager: 'Ops Manager', dispatcher: 'Dispatcher', field_lead: 'Field Lead', analyst: 'Analyst', finance: 'Finance' };
  function permissionModel(response) {
    const model=OpsModal.readRecord(response,'Permission model');
    if(!Array.isArray(model.modules) || model.modules.some(m=>!m || typeof m.key!=='string' || typeof m.label!=='string') || !Array.isArray(model.actions) || model.actions.some(a=>typeof a!=='string' || !a) || !Array.isArray(model.roles) || model.roles.some(r=>typeof r!=='string' || !r) || !model.grants || typeof model.grants!=='object' || Array.isArray(model.grants))throw new Error('Permission collections were not supplied');
    return model;
  }

  async function loadPermissions(discardConfirmed=false) {
    if(Object.keys(_permChanges).length && !discardConfirmed) {OpsModal.confirm('Discard unsaved permission changes and reload the supplied model?',()=>{OpsModal.close();loadPermissions(true);});return;}
    const wrap = document.getElementById('set-perm-wrap');
    if (!wrap) return;
    wrap.innerHTML = '<div class="set-sub2">Loading permission model…</div>';
    try {
      _perm = permissionModel(await OpsModal.apiGet('/settings/permissions'));
      _permChanges = {};
      _permBaseline=JSON.parse(JSON.stringify(_perm.grants));
      if(_permRole!=='all' && !_perm.roles.includes(_permRole))_permRole='all';
      renderPermMatrix();
    } catch (err) {
      _perm=null;
      wrap.innerHTML = OpsModal.failure('Permission model',err,'OpsSettings.loadPermissions()');
    }
  }

  function renderPermMatrix() {
    const wrap = document.getElementById('set-perm-wrap');
    if (!wrap || !_perm) return;
    if(!_perm.modules.length || !_perm.roles.length || !_perm.actions.length) {wrap.innerHTML=OpsModal.emptyState('','No editable permissions returned','The supplied model has no editable module, action or role combinations.');return;}
    if(!document.getElementById('set-perm-table')) wrap.innerHTML=`${OpsModal.textBlock('Permission scope','View permits opening a module; Manage permits changing its records. Administrators retain full access. Supplied grants are API-enforced; unavailable grants cannot be edited.')}
      <div class="lv-toolbar"><div class="lv-search"><input aria-label="Search permission modules" placeholder="Search modules…" value="${OpsModal.escape(_permQuery)}" oninput="OpsSettings.filterPermissions('query',this.value)"></div><select class="um-filter" aria-label="Permission role scope" onchange="OpsSettings.filterPermissions('role',this.value)"><option value="all">All roles</option>${_perm.roles.map(role=>`<option value="${OpsModal.escape(role)}" ${_permRole===role?'selected':''}>${OpsModal.escape(ROLE_LABEL[role] || OpsModal.label(role))}</option>`).join('')}</select></div>
      <div class="set-savebar"><span class="set-saved" id="set-perm-saved" role="status">No unsaved changes</span><button class="fg-action" onclick="OpsSettings.loadPermissions()">Reload permissions</button><button class="primary fg-action fg-action-primary" id="set-perm-save-btn" disabled onclick="OpsSettings.savePermissions()">Save permissions</button></div><div id="set-perm-table"></div>`;
    const roles=_perm.roles.filter(role=>_permRole==='all' || _permRole===role);
    const modules=_perm.modules.filter(m=>(OpsModal.moduleTitles[m.key] || m.label || m.key).toLowerCase().includes(_permQuery.toLowerCase()));
    const rows = modules.map(m => {
      const moduleTitle=OpsModal.moduleTitles[m.key] || m.label;
      const cells = roles.map(role => `<td><div class="set-grants">${_perm.actions.map(a=>{
        const key=m.key+'.'+a;
        const grant=_perm.grants[role]?.[key], known=typeof grant==='boolean';
        return `<label class="fg-choice"><input type="checkbox" aria-label="${OpsModal.escape(OpsModal.label(role)+' · '+moduleTitle+' · '+OpsModal.label(a))}" ${grant===true ? 'checked' : ''} ${!known || !canAdmin() ? 'disabled' : ''} onchange="OpsSettings.togglePerm('${OpsModal.sid(role)}','${OpsModal.sid(key)}',this.checked)">${OpsModal.escape(OpsModal.label(a))}${known?'':' · Not supplied'}</label>`;
      }).join('')}</div></td>`).join('');
      return `<tr><th scope="row">${OpsModal.escape(moduleTitle)}</th>${cells}</tr>`;
    });
    document.getElementById('set-perm-table').innerHTML=rows.length ? `<div class="lv-scroll"><table class="lv-table set-matrix"><thead><tr><th scope="col">Module</th>${roles.map(r=>`<th scope="col">${OpsModal.escape(ROLE_LABEL[r] || OpsModal.label(r))}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div><div class="lv-source">${modules.length} of ${_perm.modules.length} returned modules · ${roles.length} role${roles.length===1?'':'s'} in view</div>` : OpsModal.emptyState('','No matching permission modules','Change the module search to review other supplied grants.');
    updatePermissionActions();
  }
  function filterPermissions(kind,value) {
    if(kind==='query')_permQuery=String(value || '');
    else if(kind==='role' && (value==='all' || _perm?.roles.includes(value)))_permRole=value;
    renderPermMatrix();
  }

  function togglePerm(role, key, val) {
    if(!canAdmin() || typeof _perm?.grants?.[role]?.[key]!=='boolean')return;
    if(_permBaseline[role]?.[key]===val)delete _permChanges[role+'|'+key];
    else _permChanges[role + '|' + key] = { role, permission_key: key, allowed: val };
    if (_perm && _perm.grants[role]) _perm.grants[role][key] = val;
    updatePermissionActions();
  }
  function updatePermissionActions() {
    const count=Object.keys(_permChanges).length;
    const state=document.getElementById('set-perm-saved');if(state)state.textContent=count?count+' pending change'+(count===1?'':'s'):'No unsaved changes';
    const save=document.getElementById('set-perm-save-btn');if(save)save.disabled=!count || !canAdmin();
  }

  async function savePermissions() {
    if(!canAdmin())return OpsModal.toast('Only administrators can change permissions','watch');
    const changes = Object.values(_permChanges || {});
    if (!changes.length) return OpsModal.toast('No changes to save', 'watch');
    OpsModal.confirm(`Apply ${changes.length} permission change${changes.length === 1 ? '' : 's'}? This changes what staff can view and manage.`, () => { OpsModal.close(); persistPermissions(changes); });
  }
  async function persistPermissions(changes) {
    if(!canAdmin())return;
    OpsModal.setLoading('set-perm-save-btn', true);
    try {
      _perm = permissionModel(await OpsModal.apiPut('/settings/permissions', { changes }));
      _permChanges = {};
      _permBaseline=JSON.parse(JSON.stringify(_perm.grants));
      OpsModal.setLoading('set-perm-save-btn', false);
      renderPermMatrix();
      OpsModal.toast('Permissions saved and enforced', 'nominal');
    } catch (err) {
      OpsModal.toast('Failed to save: ' + err.message, 'critical');
      OpsModal.setLoading('set-perm-save-btn', false);
    }
  }

  function updateClock() {
    const el = document.getElementById('st-time');
    if (el) el.textContent = OpsModal.fmtDateTime(new Date());
  }

  async function loadSettings() {
    try {
      const res = await OpsModal.apiGet('/settings');
      _settings = OpsModal.readRecord({data:res.data ?? res.settings},'Settings');
      populateForm(_settings);
      _loaded=true;
      const loading=document.getElementById('st-loading'),body=document.getElementById('st-body');
      if(loading)loading.style.display='none';if(body)body.style.display='block';
      // Attach change listeners AFTER form is visible
      attachDirtyListeners();
      updateSettingsActions('No unsaved settings edits');
      const actions=document.getElementById('st-policy-actions');if(actions)actions.hidden=!['alerts','notifs'].includes(_active);
      if(_active==='users')loadPermissions();
    } catch(err) { _settings={};_loaded=false;if(_container)_container.innerHTML=OpsModal.failure('Settings',err,"reloadTab('settings')",true); }
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
      if (!el) return;
      const known = el.type==='checkbox' ? typeof val==='boolean' : el.type==='number' ? (typeof val==='number' || typeof val==='string' && val.trim()!=='') && Number.isFinite(Number(val)) : val!==undefined;
      el.disabled=!canAdmin() || !known;
      const state=document.getElementById(id+'-state');if(state)state.hidden=known;
      el.title=known ? (canAdmin()?'':'Read-only for your role') : 'Value not supplied';
      if(!known){if(el.type==='checkbox'){el.checked=false;el.indeterminate=true;}else el.value='';return;}
      if (el.type === 'checkbox') {
        el.checked = val;el.indeterminate=false;
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
    setInput('s-threshold-critical', s.threshold_critical);
    setInput('s-threshold-warning',  s.threshold_warning);
    setInput('s-escalation-time',    s.escalation_minutes);
    setInput('s-response-sla',       s.sla_response_minutes);
    setInput('s-email-alerts',       s.email_alerts);
    setInput('s-sms-alerts',         s.sms_alerts);
    setInput('s-weekly-digest',      s.weekly_digest);
    setInput('s-alert-email',        s.alert_email);
    setInput('s-alert-phone',        s.alert_phone);
  }

  function collectForm() {
    const get = (id) => {
      const el = document.getElementById(id);
      if (!el || el.disabled) return undefined;
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
    if(!canAdmin() || !_loaded)return OpsModal.toast('Settings must be loaded and administrator access is required before saving','watch');
    const btn     = document.getElementById('st-save-btn');
    const data    = collectForm();
    for(const key of ['threshold_critical','threshold_warning','escalation_minutes','sla_response_minutes']) {
      if(data[key]===undefined)continue;
      if(typeof data[key]!=='number' || !Number.isFinite(data[key]) || data[key]<0 || key.startsWith('threshold_') && data[key]>100)return OpsModal.toast('Enter valid non-negative policy values; water-level thresholds must be between 0 and 100','watch');
    }
    if(data.threshold_warning!==undefined && data.threshold_critical!==undefined && data.threshold_warning>data.threshold_critical)return OpsModal.toast('The warning threshold cannot exceed the critical threshold','watch');

    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="loading" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></span>Saving…'; }

    try {
      _settings = OpsModal.readRecord(await OpsModal.apiPut('/settings', data),'Saved settings');
      populateForm(_settings);

      if (btn) btn.textContent='Save settings';
      markClean();
      updateSettingsActions('Settings saved');

    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent='Save settings'; }
      updateSettingsActions('Settings were not saved · edits retained');
      OpsModal.toast('Failed to save settings: ' + err.message, 'critical');
    }
  }

  function reset() {
    if(!canAdmin() || !_loaded)return OpsModal.toast('Settings must be loaded and administrator access is required before resetting','watch');
    OpsModal.confirm('Discard unsaved settings edits and restore the last loaded values?', function () {
      if(!canAdmin() || !_loaded)return;
      OpsModal.close();
      populateForm(_settings);
      markClean();
    },{title:'Discard settings edits',confirmLabel:'Discard edits',tone:'neutral',detail:'Saved settings are not changed.'});
  }

  function toggleDemo(checked) {
    // Demo mode deprecated v3.2.1 — no-op
    OpsModal.toast('Demo mode has been deprecated', 'watch');
  }

  function confirmLeave(next) {
    if (!_dirty && !Object.keys(_permChanges).length) return true;
    OpsModal.confirm('Leave settings and discard unsaved changes?', () => {
      OpsModal.close(); markClean(); _permChanges = {}; _perm = null; next();
    });
    return false;
  }
  window.addEventListener('beforeunload', event => {
    if (!_dirty && !Object.keys(_permChanges).length) return;
    event.preventDefault(); event.returnValue = '';
  });
  return { render, section, na, save, reset, toggleDemo, loadPermissions, renderPermMatrix, filterPermissions, togglePerm, savePermissions, confirmLeave };

})();
