const OpsEstateMonitoring=(()=>{
 const e=v=>OpsModal.escape(v),num=v=>v!=null&&typeof v!=='boolean'&&String(v).trim()!==''&&Number.isFinite(Number(v))?Number(v):null;
 const value=(v,unit)=>num(v)===null||unit!=='°C'&&num(v)<0||unit==='%'&&num(v)>100?'Unavailable':e(Number(v).toFixed(1))+' '+unit;
 async function mount(target,record){
  if(!target)return;const request={};target.request=request;target.innerHTML='<p role="status">Loading estate monitoring…</p>';
  try{
   const data=OpsModal.readRecord(await OpsModal.apiGet('/properties/'+encodeURIComponent(record.property_id)+'/monitoring-summary'),'Estate monitoring');
   if(!target.isConnected||target.request!==request)return;
   if(!Array.isArray(data.devices)||!Array.isArray(data.history))throw Error('Monitoring feeds were not supplied.');
   const devices=data.devices;
   target.innerHTML=`<p class="fg-weather-context">${e(data.reporting)} / ${e(data.total)} devices have valid water readings within ${e(data.freshness_minutes)} minutes. Registry activity is not proof of connectivity.</p><div class="lv-scroll"><table class="lv-table"><thead><tr><th>Device</th><th>Latest water</th><th>Latest silt</th><th>Temperature</th><th>Registry battery</th><th>Reading time</th><th>Freshness</th></tr></thead><tbody>${devices.map(d=>`<tr><td>${OpsModal.link('sensors',d.sensor_id,d.name||d.sensor_id)}</td><td>${value(d.water_level_percent,'%')}</td><td>${value(d.silt_depth_mm,'mm')}</td><td>${value(d.temperature,'°C')}</td><td>${value(d.battery_voltage,'V')}</td><td>${OpsModal.fmtDateTime(d.reading_at)}</td><td>${d.reporting?'Recent valid reading':'Stale, invalid or missing'}</td></tr>`).join('')}</tbody></table></div><p class="fg-weather-context">Values above are latest recorded values, not necessarily current. Flow units and configured thresholds are not supplied; no flow chart or threshold is invented. Battery voltage is not battery capacity.</p>${devices.length?`<label class="fg-weather-select">Device history<select aria-label="Device history">${devices.map(d=>`<option value="${e(d.sensor_id)}">${e(d.name||d.sensor_id)}</option>`).join('')}</select></label><div class="estate-metric-charts"><section><h3>Water level · hourly maximum</h3><div class="fg-weather-chart" data-water></div></section><section><h3>Silt depth · hourly maximum</h3><div class="fg-weather-chart" data-silt></div></section><section><h3>Temperature · hourly maximum</h3><div class="fg-weather-chart" data-temperature></div></section></div>`:OpsModal.emptyState('','No linked devices','No monitoring devices were returned for this estate.')}`;
   if(!devices.length)return;
   const draw=id=>{
    const end=Math.floor(Date.now()/3600000)*3600000,times=Array.from({length:24},(_,i)=>end-(23-i)*3600000);
    const rows=new Map(data.history.filter(h=>String(h.sensor_id)===String(id)).map(h=>[new Date(h.time).getTime(),h]));
    const labels=times.map(t=>new Date(t).toLocaleTimeString('en-GB',{timeZone:'Africa/Lagos',hour:'2-digit',minute:'2-digit'})+' WAT');
    for(const [selector,key,unit,max] of [['[data-water]','water_level_percent','%',100],['[data-silt]','silt_depth_mm','mm',undefined],['[data-temperature]','temperature','°C',undefined]]){
      const values=times.map(t=>num(rows.get(t)?.[key]));
      const supplied=values.filter(v=>v!==null);
      OpsCharts.mount(target.querySelector(selector),values,{label:key,unit,yMin:key==='temperature'&&supplied.length?Math.floor(Math.min(...supplied)-2):0,yMax:max,color:'var(--chart-rain)',pointLabels:labels,xLabels:labels.filter((_,i)=>i%6===0)});
    }
   };target.querySelector('select').addEventListener('change',event=>draw(event.target.value));draw(devices[0].sensor_id);
  }catch(err){if(target.isConnected&&target.request===request)target.innerHTML=OpsModal.emptyState('','Monitoring unavailable',err.message);}
 }
 return {mount};
})();
