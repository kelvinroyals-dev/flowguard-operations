/* Services owns navigation, not a second copy of work records or permissions.
 * Keep jobs and legacy ticket namespaces distinct until a backend migration exists. */
const OpsServices = (() => {
  let view='jobs';
  const allowed = route => ['jobs','maintenance','requests','plans'].includes(route) && Auth.hasNavAccess(['requests','plans'].includes(route)?'jobs':route);
  function open(route) {
    const destination = route || (allowed('jobs') ? 'jobs' : 'maintenance');
    if (!allowed(destination)) return OpsModal.toast('You do not have access to this service view', 'watch');
    if (!OpsModal.confirmLeave()) return;
    if (document.querySelector('.ops-form-page')) OpsModal.close();
    view=destination;
    const owner=['requests','plans'].includes(destination)?'jobs':destination;
    const current=typeof document!=='undefined'?document.getElementById('content-'+owner):null;
    // Workspace switches share one owner tab. Do not let the shell's short
    // same-tab deduplication window swallow a different Services view.
    if(owner==='jobs'&&current?.classList.contains('active')&&typeof OpsJobs!=='undefined')return OpsJobs.render(current);
    switchTab(owner);
  }
  function navigation(route) {
    return OpsModal.workspace({name:'Services views',value:route,handler:'OpsServices.open',
      options:[['requests','Service requests'],['jobs','Provider work orders'],['plans','Recurring plans'],['maintenance','Legacy records']].filter(([key])=>allowed(key))});
  }
  return { open, navigation, allowed, currentView:()=>view, selectView:route=>{if(allowed(route))view=route;} };
})();
