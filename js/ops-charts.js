/* FlowGuard chart language. No dependencies, remote scripts, or data writes. */
const OpsCharts = (() => {
  let sequence=0;
  const mounted=new Map();let observer;
  const esc=value=>OpsModal.escape(value);
  const number=value=>OpsModal.reading(value,0);
  const tint=value=>/^(?:var\(--[\w-]+\)|#[\da-f]{3,8})$/i.test(value||'')?value:'var(--blue-hi)';
  const fmt=value=>Number.isInteger(value)?String(value):Number(value.toFixed(2)).toString();
  function segments(points) {
    const result=[];let part=[];
    for(const point of points){if(point){part.push(point);}else if(part.length){result.push(part);part=[];}}
    if(part.length)result.push(part);return result;
  }
  // Bounded cubic handles: smooth transitions never overshoot either reading.
  function curve(points) {
    if(!points.length)return '';
    let d=`M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],dx=(b.x-a.x)/3;
      const lo=Math.min(a.y,b.y),hi=Math.max(a.y,b.y);
      const slope=(index)=>{
        if(index===0||index===points.length-1)return 0;
        const p=points[index-1],q=points[index],r=points[index+1];
        const left=(q.y-p.y)/(q.x-p.x),right=(r.y-q.y)/(r.x-q.x);
        return left*right<=0?0:2*left*right/(left+right);
      };
      const clamp=v=>Math.min(hi,Math.max(lo,v));
      d+=` C${(a.x+dx).toFixed(1)},${clamp(a.y+slope(i-1)*dx).toFixed(1)} ${(b.x-dx).toFixed(1)},${clamp(b.y-slope(i)*dx).toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
    }
    return d;
  }
  function series(values,opt={}) {
    if(!Array.isArray(values)||opt.available===false)return OpsModal.textBlock('Chart unavailable','The source series was not supplied.');
    if(!values.length)return OpsModal.textBlock('No readings returned','This series contains no readings.');
    const floor=Number.isFinite(opt.yMin)?opt.yMin:0;
    const valid=values.map(v=>OpsModal.reading(v,floor));
    const cap=opt.yMax||Math.max(1,...valid.filter(v=>v!==null))*1.15;
    if(cap<=floor||opt.type==='bar'&&floor<0)return OpsModal.textBlock('Chart unavailable','Unsupported axis range.');
    const data=valid.map(v=>v!==null&&v<=cap?v:null);
    if(data.every(v=>v===null))return OpsModal.textBlock('Chart unavailable','No valid readings were supplied.');
    const mini=opt.mini===true,bar=opt.type==='bar';
    const W=Number.isFinite(opt.width)&&opt.width>=120?opt.width:600;
    const H=Number.isFinite(opt.height)&&opt.height>=36?opt.height:240;
    const pl=mini?4:38,pr=mini?4:16,pt=mini?5:18,pb=mini?5:30;
    const iw=W-pl-pr,ih=H-pt-pb,n=data.length,accent=tint(opt.color),id='fg-chart-'+(++sequence);
    const x=i=>pl+(bar?(i+.5)/n:n===1?.5:i/(n-1))*iw;
    const y=v=>pt+ih-(v-floor)/(cap-floor)*ih;
    const points=data.map((value,i)=>value===null?null:{x:x(i),y:y(value),value,index:i});
    const parts=segments(points),last=points.filter(Boolean).at(-1);
    const ticks=opt.ticks||[0,.25,.5,.75,1].map(v=>floor+v*(cap-floor));
    const grid=mini?'':ticks.filter((t,i,a)=>Number.isFinite(t)&&t>=floor&&t<=cap&&a.indexOf(t)===i).map(t=>`<g class="fg-chart-axis"><line x1="${pl}" x2="${W-pr}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/><text x="${pl-10}" y="${(y(t)+4).toFixed(1)}" text-anchor="end">${esc(fmt(t))}</text></g>`).join('');
    const labels=opt.xLabels||[];
    const axis=mini?'':labels.map((label,i)=>`<text class="fg-chart-x" x="${(pl+(labels.length===1?.5:i/(labels.length-1))*iw).toFixed(1)}" y="${H-6}" text-anchor="${i===0?'start':i===labels.length-1?'end':'middle'}">${esc(label)}</text>`).join('');
    const defs=`<defs><linearGradient id="${id}-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${accent}" stop-opacity=".24"/><stop offset="100%" stop-color="${accent}" stop-opacity="0"/></linearGradient><linearGradient id="${id}-bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${accent}"/><stop offset="100%" stop-color="${accent}" stop-opacity=".35"/></linearGradient></defs>`;
    const plots=bar?points.filter(Boolean).map(p=>{
      const bw=Math.min(mini?9:22,iw/n*.62),future=opt.forecast?.[p.index]===true;
      return `<rect class="fg-chart-column${future?' is-projected':''}" x="${(p.x-bw/2).toFixed(1)}" y="${p.y.toFixed(1)}" width="${bw.toFixed(1)}" height="${(pt+ih-p.y).toFixed(1)}" rx="${Math.min(5,bw/2)}" fill="url(#${id}-bar)"/>`;
    }).join(''):parts.map(part=>{
      const path=curve(part),area=path+` L${part.at(-1).x.toFixed(1)},${pt+ih} L${part[0].x.toFixed(1)},${pt+ih} Z`;
      return `<path class="fg-chart-area" d="${area}" fill="url(#${id}-area)"/><path class="fg-chart-line" d="${path}" stroke="${accent}"/>${part.length===1?`<circle cx="${part[0].x}" cy="${part[0].y}" r="3" fill="${accent}"/>`:''}`;
    }).join('')+`<circle class="fg-chart-end-halo" cx="${last.x}" cy="${last.y}" r="7" fill="${accent}"/><circle class="fg-chart-end" cx="${last.x}" cy="${last.y}" r="3" fill="${accent}"/>`;
    const reference=number(opt.reference);
    const ref=mini||reference===null||reference>cap?'':`<g class="fg-chart-reference"><line x1="${pl}" x2="${W-pr}" y1="${y(reference)}" y2="${y(reference)}"/><text x="${W-pr}" y="${y(reference)-7}" text-anchor="end">${esc(opt.referenceLabel||fmt(reference))}</text></g>`;
    const hits=mini?'':points.filter(Boolean).map((p,i)=>{
      const label=opt.pointLabels?.[p.index]||`Reading ${p.index+1}`;
      const note=opt.forecast?.[p.index]===true?'Forecast':opt.forecast?(opt.pastLabel||'Observed'):opt.note||'';
      const detail=fmt(p.value)+(opt.unit?' '+opt.unit:'');
      return `<g class="fg-chart-hit" tabindex="${i===0?0:-1}" role="img" aria-label="${esc(label+' · '+detail+' · '+note)}" data-chart-label="${esc(label)}" data-chart-value="${esc(detail)}" data-chart-note="${esc(note)}"><line class="fg-chart-guide" x1="${p.x}" x2="${p.x}" y1="${pt}" y2="${pt+ih}"/><circle class="fg-chart-active-dot" cx="${p.x}" cy="${p.y}" r="4" fill="${accent}"/><rect x="${Math.max(pl,p.x-iw/n/2)}" y="${pt}" width="${iw/n}" height="${ih}" fill="transparent"/></g>`;
    }).join('');
    return `<div class="fg-chart-shell${mini?' is-mini':''}" style="--chart-accent:${accent}"><svg role="${mini?'img':'group'}" aria-label="${esc(opt.label||'Recorded values')}" viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="none">${defs}${grid}${ref}${plots}${axis}${hits}</svg>${mini?'':'<div class="fg-chart-tooltip" role="status" hidden></div>'}</div>`;
  }
  function donut(items,total,label='Estates') {
    const supplied=Array.isArray(items)?items.filter(s=>number(s.v)!==null&&s.v>0):[];
    if(OpsModal.count(total)===null||total===0||supplied.reduce((sum,s)=>sum+Number(s.v),0)>total)return OpsModal.textBlock('Distribution unavailable','Valid assessed-record counts were not supplied.');
    let offset=0;const radius=53,c=2*Math.PI*radius;
    const arcs=supplied.map(s=>{
      const length=Math.min(1,s.v/total)*c,visible=Math.max(0,length-4);
      const arc=`<circle cx="72" cy="72" r="${radius}" fill="none" stroke="${tint(s.color)}" stroke-width="11" stroke-linecap="round" stroke-dasharray="${visible} ${c-visible}" stroke-dashoffset="${-offset}" transform="rotate(-90 72 72)"/>`;
      offset+=length;return arc;
    }).join('');
    return `<div class="fg-chart-donut"><svg role="img" aria-label="${esc('Distribution across '+total+' '+label)}" viewBox="0 0 144 144"><circle cx="72" cy="72" r="${radius}" fill="none" stroke="var(--surface-3)" stroke-width="11"/>${arcs}</svg><div><strong>${esc(total)}</strong><span>${esc(label)}</span></div></div>`;
  }
  function tooltip(hit) {
    const shell=hit.closest('.fg-chart-shell'),tip=shell?.querySelector('.fg-chart-tooltip');
    if(!tip)return;
    const label=document.createElement('span'),value=document.createElement('strong'),note=document.createElement('small');
    label.textContent=hit.dataset.chartLabel;value.textContent=hit.dataset.chartValue;note.textContent=hit.dataset.chartNote;
    tip.replaceChildren(label,value,note);tip.hidden=false;
    const a=hit.getBoundingClientRect(),b=shell.getBoundingClientRect();
    const scale=b.width>0?shell.clientWidth/b.width:1;
    tip.style.left=Math.max(8,Math.min(shell.clientWidth-152,(a.left-b.left+a.width/2)*scale-72))+'px';
  }
  function ring(value,color) {
    const v=OpsModal.reading(value,0,100);
    if(v===null)return '<span class="fg-chart-unavailable">Not supplied</span>';
    const c=2*Math.PI*15;
    return `<svg class="fg-chart-ring" role="img" aria-label="${esc(v+' / 100')}" viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="20" r="15" fill="none" stroke="var(--surface-3)" stroke-width="3"/><circle cx="20" cy="20" r="15" fill="none" stroke="${tint(color)}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${v/100*c} ${c}" transform="rotate(-90 20 20)"/></svg>`;
  }
  function mount(element,values,opt={}) {
    if(!element)return;
    for(const [node] of mounted){if(!node.isConnected){observer?.unobserve(node);mounted.delete(node);}}
    const redraw=()=>{
      const rect=element.getBoundingClientRect();if(rect.width<120||rect.height<36)return;
      element.innerHTML=series(values,{...opt,width:rect.width,height:rect.height});
    };
    mounted.set(element,redraw);redraw();
    if(typeof ResizeObserver!=='undefined'){
      if(!observer)observer=new ResizeObserver(entries=>entries.forEach(entry=>mounted.get(entry.target)?.()));
      observer.observe(element);
    }
  }
  if(typeof document!=='undefined'&&document.addEventListener){
    document.addEventListener('pointerover',e=>{const hit=e.target.closest?.('.fg-chart-hit');if(hit)tooltip(hit);});
    document.addEventListener('focusin',e=>{const hit=e.target.closest?.('.fg-chart-hit');if(hit)tooltip(hit);});
    document.addEventListener('pointerout',e=>{const shell=e.target.closest?.('.fg-chart-shell');if(shell&&!shell.contains(e.relatedTarget)){const tip=shell.querySelector('.fg-chart-tooltip');if(tip)tip.hidden=true;}});
    document.addEventListener('focusout',e=>{const shell=e.target.closest?.('.fg-chart-shell');if(shell&&!shell.contains(e.relatedTarget)){const tip=shell.querySelector('.fg-chart-tooltip');if(tip)tip.hidden=true;}});
    document.addEventListener('keydown',e=>{
      const hit=e.target.closest?.('.fg-chart-hit');if(!hit)return;
      const shell=hit.closest('.fg-chart-shell');
      if(e.key==='Escape'){const tip=shell.querySelector('.fg-chart-tooltip');if(tip)tip.hidden=true;return;}
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      const all=[...shell.querySelectorAll('.fg-chart-hit')],i=all.indexOf(hit);
      const next=e.key==='Home'?0:e.key==='End'?all.length-1:Math.max(0,Math.min(all.length-1,i+(e.key==='ArrowRight'?1:-1)));
      e.preventDefault();hit.setAttribute('tabindex','-1');all[next].setAttribute('tabindex','0');all[next].focus();
    });
  }
  return {series,donut,curve,mount,ring};
})();
