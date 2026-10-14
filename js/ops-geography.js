const OpsGeography=(()=>{
 const keys=['state','city','property_id'];let sequence=0;
 function values(){const p=new URLSearchParams(location.search),v=Object.fromEntries(keys.map(k=>[k,p.get('geo_'+k)||'']));v.state=FGStates.canonical(v.state)||v.state;return v;}
 function query(){return new URLSearchParams(Object.entries(values()).filter(([,v])=>v)).toString();}
 function options(items,selected,placeholder){return '<option value="">'+OpsModal.escape(placeholder)+'</option>'+items.map(item=>'<option value="'+OpsModal.escape(item.value)+'"'+(item.value===selected?' selected':'')+'>'+OpsModal.escape(item.label)+'</option>').join('');}
 function form(){
  const v=values(),id='fg-geo-'+(++sequence),e=OpsModal.escape;
  const states=FGStates.names.map(s=>({value:s,label:s}));
  if(v.state&&!FGStates.canonical(v.state))states.push({value:v.state,label:v.state+' (legacy recorded value)'});
  setTimeout(()=>hydrate(document.getElementById(id)),0);
  return `<form id="${id}" class="fg-geography" onsubmit="event.preventDefault();OpsGeography.apply(this)">
   <label>State<select name="state" onchange="OpsGeography.change(this.form,'state')">${options(states,v.state,'All states')}</select></label>
   <label>City / locality<select name="city" onchange="OpsGeography.change(this.form,'city')">${options(v.city?[{value:v.city,label:v.city}]:[],v.city,'All registered localities')}</select></label>
   <label>Estate<select name="property_id">${options(v.property_id?[{value:v.property_id,label:'Loading selected estate…'}]:[],v.property_id,'All estates')}</select></label>
   <label>Find estate<input name="estate_search" type="search" maxlength="100" placeholder="Search estate names…" oninput="OpsGeography.search(this.form)"></label>
   <button class="fg-action" type="submit" data-geo-apply disabled>Apply scope</button><button class="fg-action" type="button" onclick="OpsGeography.clear()">Clear</button>
   <p class="fg-weather-context" data-geo-status role="status">Loading registered estate options…</p>
   <p class="fg-weather-context">Scope applies to Situation, Forecast and Estates. Localities are existing estate records, not verified LGAs or drainage catchments.</p></form>`;
 }
 async function hydrate(form){
  if(!form||!form.isConnected)return;
  const request={};form.geoRequest=request;
  const fields=form.elements,city=fields.city.value,id=fields.property_id.value,button=form.querySelector('[data-geo-apply]'),status=form.querySelector('[data-geo-status]');
  button.disabled=true;fields.city.disabled=true;fields.property_id.disabled=true;
  const params=new URLSearchParams({state:fields.state.value,city,property_id:id,q:fields.estate_search.value});
  try{
   const data=OpsModal.readRecord(await OpsModal.apiGet('/meta/estate-options?'+params.toString()),'Estate options');
   if(!form.isConnected||form.geoRequest!==request)return;
   if(!Array.isArray(data.cities)||!Array.isArray(data.estates))throw Error('Estate choices were not supplied');
   fields.city.innerHTML=options(data.cities.map(s=>({value:s,label:s})),city,'All registered localities');
   fields.property_id.innerHTML=options(data.estates.map(p=>({value:String(p.property_id),label:p.property_name+(p.city?' · '+p.city:'')})),id,'All estates');
   status.textContent=id&&!data.estates.some(p=>String(p.property_id)===id)?'The previous estate is not in this scope. Select an estate or apply to all returned estates.':data.has_more?'Showing 100 estates. Choose a locality or search by name to narrow the dropdown.':data.cities_more?'Choose a state to narrow the registered localities.':data.estates.length+' estate choices in this scope.';
   fields.city.disabled=false;fields.property_id.disabled=false;button.disabled=false;
  }catch(_){if(form.isConnected&&form.geoRequest===request)status.textContent='Estate choices unavailable. Clear the scope or retry by selecting a state.';}
 }
 function change(form,key){if(key==='state')form.elements.city.value='';form.elements.property_id.value='';form.elements.estate_search.value='';hydrate(form);}
 function search(form){clearTimeout(form.geoTimer);form.geoTimer=setTimeout(()=>hydrate(form),250);}
 function apply(form){
  const url=new URL(location.href);
  for(const k of keys){let v=form.elements[k].value.trim();if(k==='state'&&v){v=FGStates.canonical(v);if(!v)return OpsModal.toast('Select a recognised state','watch');}if(v.length>120)return OpsModal.toast('Geography filter is too long','watch');if(v)url.searchParams.set('geo_'+k,v);else url.searchParams.delete('geo_'+k);}
  history.replaceState(null,'',url.href);reloadTab(location.hash.slice(1).split('/')[0]||'situation');
 }
 function clear(){const url=new URL(location.href);for(const k of keys)url.searchParams.delete('geo_'+k);history.replaceState(null,'',url.href);reloadTab(location.hash.slice(1).split('/')[0]||'situation');}
 return {query,form,apply,clear,values,hydrate,change,search};
})();
