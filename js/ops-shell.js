document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-fg-icon]').forEach(placeholder=>{
    const size=Number(placeholder.dataset.fgSize);
    const holder=document.createElement('template');
    holder.innerHTML=OpsModal.icon(placeholder.dataset.fgIcon,size);
    const vector=holder.content.firstElementChild;
    for(const attribute of ['id','class','style'])if(placeholder.hasAttribute(attribute))vector.setAttribute(attribute,placeholder.getAttribute(attribute));
    placeholder.replaceWith(vector);
  });
  const nav = document.querySelector('.tnav');
  // Reuse the existing gated navigation controls, preserving permissions and badges.
  const navMenu = nav.querySelector('.tnav-menu');
  if (!document.getElementById('nav-settings') && Auth.hasNavAccess('settings')) {
    const settings = document.createElement('button');
    settings.type='button'; settings.id='nav-settings'; settings.className='tnav-item';
    settings.textContent='Settings'; settings.addEventListener('click',()=>switchTab('settings'));
    navMenu.append(settings);
  }
  const groups = [
    ['Monitor', ['situation', 'network', 'sensors']],
    ['Respond', ['alerts', 'jobs', 'teams', 'field-reports', 'support']],
    ['Plan & analyse', ['forecast', 'reports', 'sla']],
    ['Portfolio', ['dashboard', 'properties', 'assets', 'clients', 'billing']],
    ['Administration', ['team-members', 'providers', 'audit', 'settings']],
  ];
  const controls = new Map(groups.flatMap(([, names]) => names).map(name => [name, document.getElementById(`nav-${name}`)]));
  const fragment = document.createDocumentFragment();
  // One vector owner for every navigation and operational record identity.
  controls.forEach((button,name) => {
    if (!button) return;
    const icon=OpsSpatial.icon(name).replace('<svg ','<svg class="tnav-ic" ');
    const old=button.querySelector('svg');
    if(old) old.outerHTML=icon;
    else button.insertAdjacentHTML('afterbegin',icon);
  });
  groups.forEach(([label, names]) => {
    const collapsed = !['Monitor','Respond'].includes(label);
    const section = document.createElement(collapsed ? 'details' : 'div'); section.className = 'tnav-section';
    const heading = document.createElement(collapsed ? 'summary' : 'div'); heading.className = 'tnav-sec'; heading.textContent = label;
    section.append(heading);
    names.forEach(name => {
      const button = controls.get(name); if (!button) return;
      button.classList.remove('tnav-link'); button.classList.add('tnav-item');
      section.append(button);
    });
    fragment.append(section);
  });
  navMenu.replaceChildren(fragment);
  const labels = OpsModal.moduleTitles;
  Object.entries(labels).forEach(([name, label]) => {
    const button = controls.get(name);
    if (button) [...button.childNodes].filter(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim()).forEach(n => { n.textContent = label; });
  });
  const crumb = document.createElement('div');
  crumb.className = 'ops-breadcrumb';
  crumb.innerHTML = '<span>Operations</span><span>/</span><strong id="ops-workspace-label">Command centre</strong>';
  const greeting = document.createElement('div');
  greeting.className = 'ops-greeting';
  const greetingTitle = document.createElement('h2');
  const greetingDate = document.createElement('p');
  const operator = Auth.getUser();
  const firstName = (operator?.full_name || operator?.fullName || 'there').trim().split(/\s+/)[0];
  const updateGreeting = () => {
    const hour = Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Lagos',hour:'numeric',hourCycle:'h23'}).format(new Date()));
    greetingTitle.textContent = 'Good '+(hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening')+', '+firstName+'.';
    greetingDate.textContent = new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Lagos',weekday:'long',day:'numeric',month:'long'}).format(new Date())+' · WAT';
  };
  updateGreeting();
  setInterval(updateGreeting,60000);
  greeting.append(greetingTitle,greetingDate,crumb);
  document.querySelector('.opsbar').prepend(greeting);
  const scope = document.querySelector('.opsbar-scope');
  scope.title = 'Open the estate portfolio';
  scope.firstChild.textContent = 'Estate portfolio ';
  scope.querySelector('svg')?.remove();
  scope.addEventListener('click', () => switchTab('properties'));
  const sections = {
    situation: 'Monitor / Command centre', alerts: 'Respond / Incident management', network: 'Monitor / Network intelligence', sensors: 'Monitor / Device fleet',
    jobs: 'Respond / Services', teams: 'Respond / Field coordination', 'field-reports': 'Respond / Inspection evidence',
    forecast: 'Intelligence / Risk forecast', maintenance: 'Respond / Services', properties: 'Portfolio / Estates', assets: 'Portfolio / Asset registry',
    clients: 'Portfolio / Clients', billing: 'Commercial / Billing', reports: 'Intelligence / Reporting', sla: 'Intelligence / Service performance',
    audit: 'Governance / Activity log', support: 'Respond / Client support', providers: 'Resources / Service providers', 'team-members': 'Resources / Field staff',
    settings: 'Governance / Administration', dashboard: 'Portfolio / Overview'
  };
  const enhanceLists = active => {
    active.querySelectorAll('.lv-scroll').forEach(scroll=>scroll.classList.toggle('has-overflow',scroll.scrollWidth > scroll.clientWidth + 1));
  };
  // Keep list context in memory only: never put operational searches in storage.
  const listStates = new Map();
  const returning = new Set();
  const listControls = root => [...root.querySelectorAll('.lv-toolbar input,.lv-toolbar select')];
  const captureList = root => {
    if (!root || root.querySelector('.fgd-header')) return;
    const old = listStates.get(root.id) || {};
    listStates.set(root.id, {...old, controls:listControls(root).map(el=>({id:el.id,value:el.value})), pages:FGPaginator.snapshot(root), scroll:document.querySelector('.app-neon > .content')?.scrollTop || 0});
  };
  document.addEventListener('input', event => {
    if (event.target.closest('.lv-toolbar')) captureList(event.target.closest('.tab-content'));
  });
  document.addEventListener('change', event => {
    if (event.target.closest('.lv-toolbar')) captureList(event.target.closest('.tab-content'));
  });
  // Action popovers are transient, unlike record/context disclosures.
  // Dismiss on selection or outside interaction so they do not obscure rows.
  const popoverSelector = 'details.fg-action-menu[open],details.fleet-management[open]';
  document.addEventListener('click', event => {
    document.querySelectorAll(popoverSelector).forEach(menu => {
      if(!menu.contains(event.target) || event.target.closest('button,a')) menu.open=false;
    });
  },true);
  document.addEventListener('keydown', event => {
    if(event.key!=='Escape' || document.getElementById('ops-modal-overlay'))return;
    const menus=[...document.querySelectorAll(popoverSelector)];
    if(!menus.length)return;
    menus.forEach(menu=>menu.open=false);
    menus[menus.length-1].querySelector('summary')?.focus();
    event.preventDefault();
  });
  document.addEventListener('click', event => {
    const row = event.target.closest('tr.clickable');
    const root = row?.closest('.tab-content');
    if (!root || event.target.closest('a')) return;
    captureList(root);
    const state = listStates.get(root.id);
    if (state) state.record = row.getAttribute('onclick');
  }, true);
  const restoreContext = root => {
    if (!returning.has(root.id)) return;
    const state = listStates.get(root.id);
    const controls = listControls(root);
    // Wait for the asynchronously loaded list, not just its loading toolbar.
    if (!state || !controls.length || !root.querySelector('table,.fgd-empty,.fg-state')) return;
    if (root.querySelector('.fg-loading')) return;
    returning.delete(root.id);
    state.controls.forEach((saved,index)=>{
      const control = saved.id ? controls.find(el=>el.id === saved.id) : controls[index];
      if (!control) return;
      control.value = saved.value;
      control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input',{bubbles:true}));
    });
    requestAnimationFrame(()=>{
      FGPaginator.restore(root, state.pages);
      enhanceLists(root);
      const row = [...root.querySelectorAll('tr.clickable')].find(el=>el.getAttribute('onclick') === state.record);
      row?.querySelector('.record-link,button,a')?.focus({preventScroll:true});
      const scroller = document.querySelector('.app-neon > .content');
      if (scroller) scroller.scrollTop = state.scroll;
    });
  };
  window.OpsShell = { restoreList(name) {
    const root = name ? document.getElementById('content-' + name) : document.querySelector('.tab-content.active');
    if (root && listStates.has(root.id)) returning.add(root.id);
  }, refresh(name, title) {
    const formPage = document.querySelector('.ops-form-page');
    if (formPage && formPage.closest('.tab-content')?.id !== 'content-'+name) OpsModal.close();
    document.getElementById('ops-workspace-label').textContent = labels[name] || title;
    let geographyNote=document.getElementById('ops-geography-context');
    if(!geographyNote){geographyNote=document.createElement('span');geographyNote.id='ops-geography-context';geographyNote.className='fg-weather-context';crumb.appendChild(geographyNote);}
    geographyNote.textContent=typeof OpsGeography!=='undefined'&&OpsGeography.query()?(['situation','forecast','properties'].includes(name)?' · Filtered estate scope':' · This workspace is not geographically filtered'):'';
    const active = document.getElementById(`content-${name}`);
    if (active) { enhanceLists(active); restoreContext(active); }
    if (active && !active.querySelector(':scope > .workspace-eyebrow')) {
      const eyebrow = document.createElement('div');
      eyebrow.className = 'workspace-eyebrow';
      eyebrow.textContent = sections[name] || 'Operations / Workspace';
      active.prepend(eyebrow);
    }
    nav.querySelectorAll('[id^="nav-"]').forEach(b => {
      if (b.id === `nav-${name === 'maintenance' ? 'jobs' : name}`) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    nav.querySelectorAll('.tnav-section').forEach(section => {
      section.hidden = ![...section.querySelectorAll('button')].some(b => b.style.display !== 'none' && !b.hidden);
      if (section.tagName === 'DETAILS' && section.querySelector('[aria-current="page"]')) section.open = true;
    });
    const group = document.getElementById(`nav-${name}`)?.closest('.tnav-grp');
    if (group) { group.classList.add('is-open'); group.querySelector(':scope > button')?.setAttribute('aria-expanded', 'true'); }
  }};
  let currentRecord;
  // A newly opened record starts at its identity, not the previous list/tab scroll.
  // Switching tabs retains the mounted record and its per-panel scroll/drafts.
  // Module rendering replaces its contents asynchronously; keep its section label.
  document.querySelectorAll('.tab-content').forEach(container => new MutationObserver(() => {
    if (container.classList.contains('active') && container.children.length) {
      const name = container.id.replace('content-', '');
      OpsShell.refresh(name, document.getElementById('opsbar-title').textContent);
      const record=container.querySelector('.fgd');
      if(record!==currentRecord){currentRecord=record;if(record){const scroller=document.querySelector('.app-neon > .content');if(scroller)scroller.scrollTop=0;}}
    }
  }).observe(container, { childList: true, subtree:true }));
  nav.querySelectorAll('[role="button"]').forEach(control => control.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); control.click(); }
  }));
  const menuToggle = document.createElement('button');
  menuToggle.type = 'button';
  menuToggle.className = 'ops-menu-toggle';
  menuToggle.textContent = 'Menu';
  menuToggle.setAttribute('aria-expanded', 'false');
  document.querySelector('.tnav-menu').id = 'ops-main-menu';
  menuToggle.setAttribute('aria-controls', 'ops-main-menu');
  document.querySelector('.tnav-brand').after(menuToggle);
  menuToggle.addEventListener('click', () => {
    const open = nav.classList.toggle('menu-open');
    menuToggle.setAttribute('aria-expanded', String(open));
  });
  nav.querySelectorAll('[id^="nav-"]').forEach(button => button.addEventListener('click', () => {
    nav.classList.remove('menu-open');
    menuToggle.setAttribute('aria-expanded', 'false');
  }));
  const user = Auth.getUser();
  document.getElementById('tb-avatar').textContent = (user?.full_name || user?.fullName || 'User').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
  // These controls stay visible across all modules, outside the scrolling menu.
  const accountControls = document.createElement('div');
  accountControls.className = 'ops-account-controls';
  accountControls.append(document.getElementById('ntf-wrap'),nav.querySelector('.tnav-theme'),nav.querySelector('.tnav-user'));
  document.querySelector('.opsbar').append(accountControls);
  document.querySelectorAll('.tnav-grp').forEach((group, index) => {
    const old = group.querySelector(':scope > .tnav-item');
    const trigger = document.createElement('button');
    trigger.className = old.className;
    trigger.type = 'button';
    trigger.innerHTML = old.innerHTML;
    const groupLabels = { Assets: 'Portfolio', Reports: 'Intelligence', More: 'Resources' };
    trigger.childNodes.forEach(node => { if (node.nodeType === Node.TEXT_NODE && groupLabels[node.textContent.trim()]) node.textContent = groupLabels[node.textContent.trim()]; });
    trigger.setAttribute('aria-expanded', 'false');
    const menu = group.querySelector('.tnav-drop');
    menu.id = `ops-nav-group-${index}`;
    trigger.setAttribute('aria-controls', menu.id);
    old.replaceWith(trigger);
    trigger.addEventListener('click', () => {
      const open = trigger.getAttribute('aria-expanded') === 'true';
      trigger.setAttribute('aria-expanded', String(!open));
      group.classList.toggle('is-open', !open);
    });
  });
});
