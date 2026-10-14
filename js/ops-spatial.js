/* Shared spatial language. Geometry identifies the entity; colour identifies state.
   Callers retain their own layers, data sources and selection behaviour. */
const OpsSpatial = (() => {
  'use strict';
  function assetKind(type) { return /pond|tank|basin/.test(type || '')?'water':/pump/.test(type || '')?'pump':/culvert|chamber|manhole/.test(type || '')?'culvert':/outfall/.test(type || '')?'outfall':/gate/.test(type || '')?'gate':'asset'; }
  function icon(kind,size) { return OpsModal.icon(kind,size); }
  function tone(value,domain) {
    if(domain) { const semantic=OpsModal.statusTone(value,domain); return ({danger:'err',caution:'caut'})[semantic] || semantic; }
    const key=String(value ?? 'unknown').toLowerCase();
    return ({low:'ok',good:'ok',active:'ok',moderate:'warn',medium:'warn',fair:'warn',elevated:'warn',poor:'caut',high:'caut',critical:'err',offline:'neutral',unknown:'neutral'})[key] || 'neutral';
  }
  function color(value,domain) { return `var(--${{ok:'ok',warn:'warn',caut:'caut',err:'err',neutral:'ink-3'}[tone(value,domain)]})`; }
  function risk(value) {
    if(!['number','string'].includes(typeof value) || String(value).trim()==='' || !Number.isFinite(Number(value)) || Number(value)<0 || Number(value)>100) return 'unknown';
    const n=Number(value); return n>=80?'critical':n>=60?'high':n>=45?'elevated':n>=25?'moderate':'low';
  }
  function marker(kind, options={}) {
    const size=44;
    // Colour is a controlled caller token; never accept arbitrary record content here.
    const tint=/^(#[\da-f]{3,8}|var\(--[\w-]+\))$/i.test(options.color || '') ? options.color : color(options.state);
    const mapKind=({estate:'estate-map',property:'estate-map',properties:'estate-map',device:'sentinel-map',sensor:'sentinel-map',sensors:'sentinel-map',incident:'incident-map'})[kind] || kind;
    return L.divIcon({className:'fg-map-icon',iconSize:[size,size],iconAnchor:[size/2,size/2],html:`<span class="fg-map-symbol ${options.attention?'attention':''} ${options.estimated?'estimated':''}" style="--marker-tone:${tint}">${icon(mapKind,16)}</span>`});
  }
  function legend(label='Risk') {
    return `<div class="fg-map-legend" aria-label="Map risk legend"><strong>${OpsModal.escape(label)}</strong>${['low','moderate','elevated','high','critical','unknown'].map(state=>`<span><i style="--marker-tone:${color(state)}"></i>${OpsModal.label(state)}</span>`).join('')}<span class="fg-map-key">Dashed: estimated · dot: attention</span></div>`;
  }
  function layerButton({kind,label,on,onclick,extra='',disabled=true,available=true}) {
    return `<button type="button" class="fg-map-layer ${on?'active':''}" data-kind="${OpsModal.escape(kind)}" aria-pressed="${Boolean(on)}" ${disabled || !available?'disabled':''} ${!available?'data-unavailable="true"':''} ${extra} onclick="${onclick}"><span class="fg-layer-check" aria-hidden="true"></span>${icon(kind)}<span>${OpsModal.escape(label)}</span></button>`;
  }
  function ready(root) { root?.querySelectorAll('.fg-map-layer').forEach(button=>{button.disabled=button.hasAttribute('data-unavailable');}); }
  function layerPanel(body,className='',options={}) {
    const open=!options.collapsed && (typeof window==='undefined' || !window.matchMedia?.('(max-width:600px)').matches);
    return `<details class="fg-map-layers ${OpsModal.escape(className)}" ${open?'open':''}><summary>Map layers</summary><div class="fg-map-layer-list">${body}</div></details>`;
  }
  return {icon,assetKind,tone,color,risk,marker,legend,layerButton,layerPanel,ready};
})();
