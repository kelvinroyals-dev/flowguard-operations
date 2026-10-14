const OpsServiceIntake=(()=>{
  let host,view='requests',revision=0,savingPlan=false;
  const esc=OpsModal.escape;
  const manage=()=>Auth.hasNavAccess('jobs')&&Auth.can('jobs.manage');
  async function render(container,kind){
    host=container;view=kind;const rev=++revision;
    container.innerHTML=OpsModal.pageHeader({title:'Services',subtitle:kind==='plans'?'Recurring plans prepare unassigned drafts for review. Providers execute service work.':'Client intake and routing. Direct-provider requests are visibility-only.',actions:kind==='plans'&&manage()?'<button class="fg-action fg-action-primary" onclick="OpsServiceIntake.newPlan()">Create recurring plan</button>':''})+OpsServices.navigation(kind)+'<div id="svc-body">'+OpsModal.loading('Loading services…')+'</div>';
    try{
      const r=await OpsModal.apiGet(kind==='plans'?'/service-plans':'/service-requests',{text:'raw'});
      if(rev!==revision||!container.isConnected||!container.querySelector('#svc-body'))return;
      if(!Array.isArray(r.data))throw new Error('Service records were not supplied');
      document.getElementById('svc-body').innerHTML=!r.data.length?OpsModal.emptyState('',kind==='plans'?'No recurring plans returned':'No service requests returned','New service requests originate in the Client Portal.'):`<div class="lv-wrap"><div class="lv-scroll"><table class="lv-table"><thead><tr><th>${kind==='plans'?'Plan':'Request'}</th><th>Estate</th><th>${kind==='plans'?'Next due':'Routing'}</th><th>Action</th></tr></thead><tbody>${r.data.map(x=>`<tr><td><strong>${esc(x.title)}</strong><div class="lv-sub">${esc(OpsModal.label(x.job_type))}</div></td><td>${OpsModal.link('properties',x.property_id,x.property_name||x.property_id,{text:'raw'})}</td><td>${kind==='plans'?esc(OpsModal.fmtDate(x.next_due)):x.route==='direct_provider'?'Direct provider · visibility only':'FlowGuard coordination'}</td><td>${kind==='plans'?(manage()?`<button class="fg-action" onclick="OpsServiceIntake.prepare('${OpsModal.sid(x.id)}','${OpsModal.sid(x.next_due)}')">Prepare due draft</button>`:'Read only'):`<button class="fg-action" onclick="OpsServiceIntake.openRequest('${OpsModal.sid(x.id)}')">View request</button>`}</td></tr>`).join('')}</tbody></table></div></div>`;
      const wrap=container.querySelector('.lv-wrap');
      if(wrap){
        const toolbar=document.createElement('div');toolbar.className='lv-toolbar';
        toolbar.innerHTML='<div class="lv-search">'+OpsModal.actionIcon('search')+'<input aria-label="Search service records" placeholder="Search service records…"></div>';
        const count=document.createElement('div');count.className='svc-list-footer';
        count.textContent=r.data.length+' returned records · Feed limited to 200';
        wrap.prepend(toolbar);wrap.append(count);
        const rows=Array.from(wrap.querySelectorAll('tbody tr'));
        toolbar.querySelector('input').addEventListener('input',event=>{let visible=0;for(const row of rows){row.hidden=!row.textContent.toLowerCase().includes(event.target.value.toLowerCase());if(!row.hidden)visible++;}count.textContent=visible+' matching records in the returned feed';});
        if(kind==='plans'&&manage())rows.forEach((row,i)=>{
          const x=r.data[i];const button=document.createElement('button');button.className='fg-action';button.textContent=x.active?'Pause plan':'Resume plan';button.addEventListener('click',()=>togglePlan(x.id,!x.active));
          const group=document.createElement('div');group.className='svc-plan-actions';group.append(...row.lastElementChild.childNodes,button);row.lastElementChild.append(group);
          const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
          if(!x.active||String(x.next_due).slice(0,10)>today)row.querySelector('button').disabled=true;
          if(!x.active)row.children[2].append(' · Paused');
        });
      }
    }catch(e){const body=container.querySelector('#svc-body');if(rev===revision&&container.isConnected&&body)body.innerHTML=OpsModal.failure('Services',e,"OpsServiceIntake.refresh()",false);}
  }
  async function openRequest(id){
    const rev=++revision,target=host;
    try{
      const x=(await OpsModal.apiGet('/service-requests/'+encodeURIComponent(id),{text:'raw'})).data;
      if(rev!==revision||target!==host||OpsServices.currentView()!=='requests'||!host?.isConnected||!host.classList.contains('active'))return;
      if(!x||x.id!==id)throw new Error('Request not found');
      const direct=x.route==='direct_provider';
      const actions=x.job_id?`<button class="fg-action" onclick="fgOpen('jobs','${OpsModal.sid(x.job_id)}')">Open linked work order</button>`:!direct&&manage()?`<button class="fg-action fg-action-primary" onclick="OpsServiceIntake.draft('${OpsModal.sid(id)}')">Prepare unassigned draft</button>`:'';
      host.innerHTML=OpsModal.detailShell({back:'OpsServiceIntake.refresh()',crumbRoot:'Services / Service requests',title:esc(x.title),actions,
        decision:[['Routing',direct?'Direct provider':'FlowGuard coordination'],['FlowGuard role',direct?'Visibility and record keeping only':'Review and coordinate provider work']],
        sections:[
          {id:'summary',title:'Request summary',body:`<p>${esc(x.description)}</p>${OpsModal.fact('Estate',OpsModal.link('properties',x.property_id,x.property_name||x.property_id,{text:'raw'}))}${x.service_provider_org_id?OpsModal.fact('Provider',OpsModal.link('providers',x.service_provider_org_id,x.provider_name||'Open provider',{text:'raw'})):''}`},
          {id:'progress',title:'Provider updates',body:x.events?.length?x.events.map(e=>`<article><strong>${esc(OpsModal.label(e.event_type))}</strong><p>${esc(e.note)}</p><small>${esc(OpsModal.fmtDateTime(e.created_at))}</small></article>`).join(''):OpsModal.emptyState('','No provider updates recorded','Provider-reported updates are not FlowGuard verification.',{compact:true})}
        ]});
    }catch(e){if(rev===revision&&target===host)OpsModal.toast(e.message,'error');}
  }
  function draft(id){
    if(!manage())return;
    OpsModal.confirm('Prepare an unassigned work-order draft for review?',async()=>{
      try{const r=await OpsModal.apiPost('/service-requests/'+encodeURIComponent(id)+'/draft',{});OpsModal.close();OpsJobs.openJob(r.data.job_id);}
      catch(e){OpsModal.toast(e.message,'error');}
    },{tone:'neutral',title:'Prepare provider work',confirmLabel:'Prepare draft',detail:'No provider will be assigned or dispatched.'});
  }
  function prepare(id,due){
    if(!manage())return;
    const dueOn=String(due).slice(0,10);
    OpsModal.confirm('Prepare the due occurrence as an unassigned draft?',async()=>{
      try{const r=await OpsModal.apiPost('/service-plans/'+encodeURIComponent(id)+'/prepare',{due_on:dueOn});OpsModal.close();OpsModal.toast(r.data.created?'Unassigned draft prepared':'No new due occurrence prepared','nominal');render(host,'plans');}
      catch(e){OpsModal.toast(e.message,'error');}
    },{tone:'neutral',title:'Prepare due service',confirmLabel:'Prepare draft',detail:'This does not dispatch a provider. Review the draft before assignment.'});
  }
  async function newPlan(){
    if(!manage())return;
    const target=host,rev=revision;
    try{
      const r=await OpsModal.apiGet('/properties/all',{text:'raw'});
      if(rev!==revision||target!==host||!host?.classList.contains('active')||OpsServices.currentView()!=='plans')return;
      if(!Array.isArray(r.data)||!r.data.length)return OpsModal.toast('No available estates were returned. Add an estate before creating a plan.','watch');
      OpsModal.open('Create recurring service plan',OpsModal.field('Title','title')+OpsModal.field('Estate','property_id','select','',{options:(r.data||[]).map(p=>({value:p.property_id,label:p.property_name||p.name||p.property_id}))})+OpsModal.field('Service','job_type','select','inspection',{options:['inspection','drain_cleaning','sensor_maintenance','repair','survey','other']})+OpsModal.field('Next due date','next_due','date')+OpsModal.field('Repeat every (days)','interval_days','number',30,{min:1,max:366,step:1})+OpsModal.field('Scope','description','textarea','',{required:false})+'<p>Due occurrences create unassigned drafts for review, never automatic dispatch.</p>',[{label:'Cancel',class:'btn-ghost',onclick:'OpsModal.close()'},{label:'Create plan',class:'btn-primary',onclick:'OpsServiceIntake.savePlan()'}]);
    }catch(e){OpsModal.toast(e.message,'error');}
  }
  async function savePlan(){
    if(!manage())return;
    if(savingPlan)return;
    const data=OpsModal.getFormData();data.interval_days=Number(data.interval_days);
    if(!data.title?.trim()||!data.property_id||!/^\d{4}-\d{2}-\d{2}$/.test(data.next_due||'')||!Number.isInteger(data.interval_days)||data.interval_days<1||data.interval_days>366)
      return OpsModal.toast('Enter a title, estate, due date and repeat interval from 1 to 366 days.','watch');
    savingPlan=true;OpsModal.setLoading(true);
    try{await OpsModal.apiPost('/service-plans',data);OpsModal.close();render(host,'plans');}
    catch(e){OpsModal.toast(e.message,'error');}
    finally{savingPlan=false;OpsModal.setLoading(false);}
  }
  function togglePlan(id,active){
    if(!manage())return;
    OpsModal.confirm(active?'Resume draft preparation for this recurring plan?':'Pause future draft preparation for this plan?',async()=>{
      try{await OpsModal.apiPost('/service-plans/'+encodeURIComponent(id)+'/active',{active});OpsModal.close();render(host,'plans');}
      catch(e){OpsModal.toast(e.message,'error');}
    },{tone:'neutral',title:active?'Resume recurring plan':'Pause recurring plan',confirmLabel:active?'Resume plan':'Pause plan',detail:'Existing work orders remain unchanged. No provider is dispatched.'});
  }
  return {render,refresh:()=>render(host,view),openRequest,draft,prepare,newPlan,savePlan};
})();
