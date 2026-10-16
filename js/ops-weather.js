/* Estate-scoped weather estimates; never a substitute for a rain gauge. */
const OpsWeather=(()=>{
  const cache=new Map(),pending=new Map();
  const coord=v=>v!==null&&v!==undefined&&v!==''&&typeof v!=='boolean'&&String(v).trim()!==''&&Number.isFinite(Number(v))?Number(v):null;
  function location(record){const lat=coord(record?.latitude),lon=coord(record?.longitude);return lat!==null&&lon!==null&&Math.abs(lat)<=90&&Math.abs(lon)<=180?{lat,lon}:null;}
  const time=v=>typeof v==='string'?Date.parse(/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(v)?v+'+01:00':v):NaN;
  const reading=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
  const amount=v=>reading(v)===null?'Unavailable':v===0?'0.0':v<.001?'<0.001':Number(v.toFixed(3)).toString();
  function errorDescription(error){
    const reason=String(error?.message||'Estate weather is unavailable.').replace(/\s*Missing rainfall is not zero(?: rainfall)?\./gi,'').trim();
    return (reason||'Estate weather is unavailable.')+' Missing rainfall is not zero rainfall.';
  }
  function parse(j,point,now=Date.now()){
    if(j.hourly_units?.precipitation&&j.hourly_units.precipitation!=='mm')throw new Error('Weather precipitation units are not millimetres.');
    const times=j.hourly?.time,values=j.hourly?.precipitation;
    if(!Array.isArray(times)||!Array.isArray(values)||times.length!==values.length||!times.length)throw new Error('Hourly weather data was not supplied.');
    const stamps=times.map(time);
    if(stamps.some((t,i)=>!Number.isFinite(t)||i&&t-stamps[i-1]!==3600000))throw new Error('Hourly weather timestamps are invalid or incomplete.');
    const end=stamps.filter(t=>t<=now).length;
    if(!end||now-stamps[end-1]>=3600000)throw new Error('Weather coverage is out of date.');
    const sum=(from,to)=>{const slice=values.slice(from,to);return from<0||slice.length!==to-from||slice.some(v=>reading(v)===null)?null:Number(slice.reduce((a,b)=>a+b,0).toFixed(3));};
    const returned=location(j);
    if(!returned)throw new Error('Weather grid location was not supplied.');
    const rad=x=>x*Math.PI/180,dlat=rad(returned.lat-point.lat),dlon=rad(returned.lon-point.lon);
    const a=Math.sin(dlat/2)**2+Math.cos(rad(point.lat))*Math.cos(rad(returned.lat))*Math.sin(dlon/2)**2;
    return {last24:sum(end-24,end),prev24:sum(end-48,end-24),next6:sum(end,end+6),latest:reading(values[end-1]),windowEnd:new Date(stamps[end-1]).toISOString(),fetchedAt:new Date(now).toISOString(),point,grid:returned,gridDistanceKm:6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a))),hrs:stamps.map((t,i)=>({t:new Date(t).toISOString(),v:reading(values[i]),future:i>=end})).slice(Math.max(0,end-24),end+6)};
  }
  async function load(record,{refresh=false}={}){
    const point=location(record);if(!point)throw new Error('Estate coordinates are missing or invalid. Add a verified estate map location.');
    if(typeof window!=='undefined'&&!window.FG_LOCAL_PREVIEW&&typeof OpsModal!=='undefined'){
      if(!record.property_id)throw new Error('Estate reference is missing.');
      const wx=OpsModal.readRecord(await OpsModal.apiGet('/properties/'+encodeURIComponent(record.property_id)+'/weather'),'Estate weather');
      if(!location({latitude:wx.point?.lat,longitude:wx.point?.lon})||!location({latitude:wx.grid?.lat,longitude:wx.grid?.lon})||!Array.isArray(wx.hrs))throw new Error('Malformed estate weather response.');
      return wx;
    }
    if(typeof CONFIG!=='undefined'&&CONFIG.LOCAL_SANDBOX)throw new Error('Weather is disabled in the isolated workflow sandbox.');
    const key=point.lat+','+point.lon,hit=cache.get(key);
    if(!refresh&&hit&&Date.now()-hit.saved<300000)return hit.value;
    if(pending.has(key))return pending.get(key);
    const promise=(async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
      try{
        const url='https://api.open-meteo.com/v1/forecast?latitude='+point.lat+'&longitude='+point.lon+'&hourly=precipitation&precipitation_unit=mm&past_hours=48&forecast_hours=7&timezone=Africa%2FLagos&cell_selection=nearest';
        const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw new Error('Weather provider unavailable ('+response.status+').');
        const value=parse(await response.json(),point);cache.set(key,{saved:Date.now(),value});if(cache.size>128)cache.delete(cache.keys().next().value);return value;
      }finally{clearTimeout(timer);pending.delete(key);}
    })();pending.set(key,promise);return promise;
  }
  function summary(wx){
    const e=OpsModal.escape;
    const source=wx.provider==='weatherapi'?'<a href="https://www.weatherapi.com/" target="_blank" rel="noopener noreferrer">WeatherAPI.com</a>':e(wx.source||'Open-Meteo');
    const date=d=>/^\d{4}-\d\d-\d\d$/.test(d||'')?new Date(d+'T12:00:00+01:00').toLocaleDateString('en-GB',{timeZone:'Africa/Lagos',day:'numeric',month:'short'}):'Yesterday';
    const archive=wx.provider==='weatherapi',history=wx.history;
    const stats=[
      [archive?'Yesterday'+(history?.date?' · '+date(history.date):''):'Last 24 completed hours',archive?history?.total:wx.last24,archive?(history?history.available+'/24 historical hours':'Historical hours unavailable'):'Completed-hour window'],
      ['Latest completed hour',wx.latest,'Estimate · not a live rain gauge'],
      ['Next 6 hours',wx.next6,wx.coverage?.forecast6?wx.coverage.forecast6.available+'/6 forecast hours':'Forecast estimate'],
    ];
    const point=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)?p.lat.toFixed(4)+', '+p.lon.toFixed(4):'Unavailable';
    const mismatch=history&&wx.historyLocationMatchesForecast===false;
    const coverage=wx.coverage?.past24;
    const explanation=wx.historyFailure?.message;
    return `<div class="fg-weather-stats">${stats.map(([label,value,note])=>`<div><span>${e(label)}</span><strong>${e(amount(value))}${reading(value)===null?'':' <small>mm</small>'}</strong><span class="fg-weather-stat-note">${e(note)}</span></div>`).join('')}</div><p class="fg-weather-context">${source} · model estimates, not onsite measurements · updated ${e(OpsModal.fmtDateTime(wx.fetchedAt))}.</p>${explanation?`<p class="fg-weather-coverage" role="status">${e(explanation)}${history?' '+e(history.available)+'/24 historical hours available.':''}</p>`:''}${mismatch?'<p class="fg-weather-coverage">History and forecast use different provider locations. They are shown separately, not combined into a rolling total.</p>':''}<details class="fg-weather-details"><summary>Source & coverage</summary><div><p>Estate coordinates: ${e(point(wx.point))}. ${wx.locationVerified===false?'Estate location is not verified.':''}</p><p>Forecast location: ${e(point(wx.grid))}${Number.isFinite(wx.gridDistanceKm)?' · '+wx.gridDistanceKm.toFixed(1)+' km from estate':''}.</p>${history?`<p>Historical location: ${e(point(history.grid))} · ${e(history.date)} · ${e(history.available)}/24 hours.</p>`:''}<p>Rolling 24-hour total: ${e(amount(wx.last24))}${reading(wx.last24)===null?'':' mm'}${coverage?' · '+e(coverage.available)+'/24 comparable hours':''}. ${e(wx.rolling24Reason?.message||'')}</p><p>Completed-hour window ends ${e(OpsModal.fmtDateTime(wx.windowEnd))}. Missing hours are not zero. ${wx.persistencePolicy==='memory_only'?'Provider responses use short-lived caching; portal snapshots are not archived.':''}</p></div></details><p class="fg-weather-context fg-weather-safety">Weather is general guidance and may be inaccurate locally. For safety or emergencies, consult official meteorological services, relevant authorities and local checks—not this estimate alone.</p>`;
  }
  function chartModels(wx){
    if(wx.provider==='weatherapi')return [
      {label:wx.history?.date?'Yesterday · '+wx.history.date:'Yesterday · historical estimate',hours:wx.history?.hrs||[],expected:24,future:false},
      {label:'Next 6 hours · forecast',hours:(wx.forecast||[]).slice(0,6),expected:6,future:true},
    ];
    return [{label:'Hourly rainfall estimates',hours:wx.hrs||[],expected:(wx.hrs||[]).length,future:null}];
  }
  function chartScale(values){
    const peak=Math.max(0,...values.map(reading).filter(v=>v!==null));
    if(!peak)return 1;
    const target=peak*1.15,power=10**Math.floor(Math.log10(target)),fraction=target/power;
    return Number((([1,2,2.5,5,10].find(v=>v>=fraction)||10)*power).toPrecision(8));
  }
  function render(target,wx){
    if(!target)return;
    const e=OpsModal.escape,models=chartModels(wx);
    target.innerHTML=summary(wx)+'<div class="fg-weather-plots">'+models.map((model,index)=>{
      const values=model.hours.map(h=>reading(h.v)),known=values.filter(v=>v!==null),peak=known.length?Math.max(...known):null;
      const state=!known.length?'No hourly estimates supplied.':peak===0?(known.length===model.expected?'All '+known.length+' supplied hours are zero in this estimate.':'Only '+known.length+'/'+model.expected+' hours supplied. Those hours are zero; the missing hours are unknown.'):null;
      return `<section class="fg-weather-plot"><div class="fg-weather-plot-title"><h3>${e(model.label)}</h3><span>${known.length}/${model.expected} hours</span></div>${state?`<div class="fg-weather-zero" role="status">${e(state)}</div>`:`<p class="fg-weather-context">Peak ${e(amount(peak))} mm · gaps are unavailable hours.</p><div class="fg-weather-chart" data-weather-plot="${index}"></div>`}</section>`;
    }).join('')+'</div>';
    models.forEach((model,index)=>{
      const element=target.querySelector('[data-weather-plot="'+index+'"]');if(!element)return;
      if(typeof OpsCharts==='undefined'){element.innerHTML='<p class="fg-weather-context">Chart unavailable. The summary above remains valid.</p>';return;}
      const values=model.hours.map(h=>reading(h.v)),max=chartScale(values);
      const label=h=>{
        const start=new Date(h.start||h.t),end=new Date(h.t);
        const format=d=>Number.isFinite(d.getTime())?d.toLocaleTimeString('en-GB',{timeZone:'Africa/Lagos',hour:'2-digit',minute:'2-digit'}):'Unavailable';
        const date=Number.isFinite(start.getTime())?start.toLocaleDateString('en-GB',{timeZone:'Africa/Lagos',day:'numeric',month:'short'})+' ':'';
        return date+format(start)+(h.start?'–'+format(end):'')+' WAT';
      };
      const labels=model.hours.map(label),positions=[0,Math.floor((labels.length-1)/2),labels.length-1].filter((v,i,a)=>v>=0&&a.indexOf(v)===i);
      const shortLabels=model.hours.map(h=>new Date(h.start||h.t).toLocaleTimeString('en-GB',{timeZone:'Africa/Lagos',hour:'2-digit',minute:'2-digit'}));
      OpsCharts.mount(element,values,{type:'bar',pastLabel:'Archive estimate',color:'var(--chart-rain)',unit:'mm',label:model.label,pointLabels:labels,xLabels:positions.map(i=>shortLabels[i]),forecast:model.hours.map(h=>model.future===null?h.future===true:model.future),yMax:max,ticks:[0,max/2,max],format:amount,axisFormat:v=>Number(v.toPrecision(4)).toString(),zeroMarkers:true});
    });
  }
  async function mount(target,record){
    if(!target)return;const stamp={};target.weatherRequest=stamp;
    target.innerHTML='<p class="fg-weather-context" role="status">Loading estate weather estimate…</p>';
    try{const wx=await load(record);if(!target.isConnected||target.weatherRequest!==stamp)return;
      render(target,wx);
    }catch(err){if(target.isConnected&&target.weatherRequest===stamp)target.innerHTML=OpsModal.emptyState('','Weather unavailable',errorDescription(err));}
  }
  return {location,time,amount,errorDescription,parse,load,summary,chartModels,chartScale,render,mount};
})();
