// ════════════════════════════════════════════════════════════════════════
//  FlowGuard shared UI component builders (FGUI)
//  One card, table, status indicator, filter bar, empty state, detail panel,
//  chart — used across every module so pages don't re-invent styling.
//  Pairs with the .fgc-* classes + --fg-* tokens defined in index.html.
// ════════════════════════════════════════════════════════════════════════
window.FGUI = (function () {
  const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const SEV = { critical: 'var(--fg-crit)', high: 'var(--fg-high)', moderate: 'var(--fg-mod)', mod: 'var(--fg-mod)', ok: 'var(--fg-ok)', low: 'var(--fg-neutral)', unknown: 'var(--fg-neutral)', neutral: 'var(--fg-neutral)', info: 'var(--fg-blue)' };
  const color = t => SEV[t] || t || 'var(--fg-neutral)';

  // status dot + word — colour always paired with text (never colour-only)
  function status(tone, label) {
    return `<span class="fgc-status"><span class="dot" style="background:${color(tone)}"></span>${esc(label)}</span>`;
  }

  // empty state that explains WHY and offers a way back
  function emptyState(message, action) {
    const btn = action ? ` <button class="fgc-link" data-fgaction="1">${esc(action.label)}</button>` : '';
    const html = `<div class="fgc-empty">${esc(message)}${btn}</div>`;
    if (action && action.onClick) {
      // caller wires via delegation; expose the handler on a returned node builder
      return { html, wire: (root) => { const b = root.querySelector('[data-fgaction]'); if (b) b.addEventListener('click', action.onClick); } };
    }
    return html;
  }

  // segmented filter bar with per-key memory (survives re-render within a session)
  const _segMem = {};
  function segmented(opts) {
    // opts: { key, options:[{value,label,count}], value, onChange }
    const sel = _segMem[opts.key] != null ? _segMem[opts.key] : (opts.value != null ? opts.value : (opts.options[0] && opts.options[0].value));
    const html = `<div class="fgc-seg" data-seg="${esc(opts.key)}">${opts.options.map(o =>
      `<button data-v="${esc(o.value)}"${o.value === sel ? ' class="active"' : ''}>${esc(o.label)}${o.count != null ? `<span class="c">${o.count}</span>` : ''}</button>`).join('')}</div>`;
    return {
      html, value: sel,
      wire(root) {
        const seg = root.querySelector(`.fgc-seg[data-seg="${opts.key}"]`);
        if (!seg) return;
        seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
          seg.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
          _segMem[opts.key] = b.dataset.v;
          if (opts.onChange) opts.onChange(b.dataset.v);
        }));
      },
    };
  }
  function segValue(key, fallback) { return _segMem[key] != null ? _segMem[key] : fallback; }

  const fmt = n => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-US');

  // neutral sparkline / bars (colour reserved for the highlighted series)
  function sparkline(series, opts) {
    opts = opts || {}; const color = opts.color || 'var(--fg-t2)', unit = opts.unit || '';
    if (!series || series.length < 2) series = [0, 0];
    const w = opts.w || 130, h = opts.h || 52, p = 3, max = Math.max(...series, 1), min = Math.min(...series, 0), rng = (max - min) || 1;
    const pts = series.map((v, i) => `${(p + i * (w - 2 * p) / (series.length - 1)).toFixed(1)},${(h - p - ((v - min) / rng) * (h - 2 * p)).toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:${w}px;height:${h}px"><title>Latest ${series[series.length - 1]}${unit} · range ${min}–${max}${unit}</title><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  }
  function bars(series, opts) {
    opts = opts || {}; const color = opts.color || 'var(--fg-neutral)', unit = opts.unit || '';
    if (!series || !series.length) series = [0];
    const w = opts.w || 130, h = opts.h || 52, n = series.length, gap = 2, bw = Math.max(1, (w - gap * (n - 1)) / n), max = Math.max(...series, 1);
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:${w}px;height:${h}px">${series.map((v, i) => { const bh = Math.max(1.5, (v / max) * (h - 3)); return `<rect x="${(i * (bw + gap)).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1" fill="${color}"><title>${v}${unit}</title></rect>`; }).join('')}</svg>`;
  }

  return { esc, color, status, emptyState, segmented, segValue, fmt, sparkline, bars };
})();
