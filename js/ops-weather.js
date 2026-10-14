/* Estate-scoped weather estimates; never a substitute for a rain gauge. */
const OpsWeather=(()=>{
  const cache=new Map(),pending=new Map();
  const coord=v=>v!==null&&v!==undefined&&v!==''&&typeof v!=='boolean'&&String(v).trim()!==''&&Number.isFinite(Number(v))?Number(v):null;
  function location(record){const lat=coord(record?.latitude),lon=coord(record?.longitude);return lat!==null&&lon!==null&&Math.abs(lat)<=90&&Math.abs(lon)<=180?{lat,lon}:null;}
  const time=v=>typeof v==='string'?Date.parse(/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(v)?v+'+01:00':v):NaN;
  const reading=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
  const amount=v=>reading(v)===null?'Unavailable':v>0&&v<.1?'<0.1':v.toFixed(1);
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
    return `<div class="fg-weather-stats">${[['Last 24 completed hours',wx.last24],['Latest completed hour',wx.latest],['Next 6 hours · forecast',wx.next6]].map(([label,value])=>`<div><span>${label}</span><strong>${e(amount(value))}${value===null?'':' <small>mm</small>'}</strong></div>`).join('')}</div><p class="fg-weather-context">Open-Meteo model estimate · not measured rainfall. Period ends ${e(OpsModal.fmtDateTime(wx.windowEnd))}. Retrieved ${e(OpsModal.fmtDateTime(wx.fetchedAt))}.</p><p class="fg-weather-context">Requested ${wx.point.lat.toFixed(4)}, ${wx.point.lon.toFixed(4)} · grid ${wx.grid.lat.toFixed(4)}, ${wx.grid.lon.toFixed(4)} (${wx.gridDistanceKm.toFixed(1)} km away). ${wx.gridDistanceKm>10?'Grid is far from the estate; local rain may differ substantially.':'Local showers may differ from this grid estimate.'} Missing hours make totals unavailable. ${wx.locationVerified===false?'Estate coordinates have not been verified. ':''}${wx.historyAvailable===false?'Weather history storage is unavailable.':''}</p>`;
  }
  async function mount(target,record){
    if(!target)return;const stamp={};target.weatherRequest=stamp;
    target.innerHTML='<p class="fg-weather-context" role="status">Loading estate weather estimate…</p>';
    try{const wx=await load(record);if(!target.isConnected||target.weatherRequest!==stamp)return;
      target.innerHTML=summary(wx)+'<div class="fg-weather-chart"></div><p class="fg-weather-context">Solid bars: past-hour estimates · faded bars: forecast. No estimate confirms flooding.</p>';
      const labels=wx.hrs.map(h=>new Date(h.t).toLocaleTimeString('en-GB',{timeZone:'Africa/Lagos',hour:'2-digit',minute:'2-digit'})+' WAT');
      OpsCharts.mount(target.querySelector('.fg-weather-chart'),wx.hrs.map(h=>h.v),{type:'bar',pastLabel:'Past-hour estimate',color:'var(--chart-rain)',unit:'mm',label:'Estate hourly rainfall estimate',pointLabels:labels,xLabels:labels.filter((_,i)=>i%6===0),forecast:wx.hrs.map(h=>h.future)});
    }catch(err){if(target.isConnected&&target.weatherRequest===stamp)target.innerHTML=OpsModal.emptyState('','Weather unavailable',err.message+' Missing rainfall is not zero rainfall.');}
  }
  return {location,time,amount,parse,load,summary,mount};
})();
