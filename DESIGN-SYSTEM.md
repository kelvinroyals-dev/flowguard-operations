# FlowGuard Ops — Shared Design System

One source of truth for tokens and components, so every module looks the same
without redesigning each screen. Defined in `index.html` (`<style id="fg-ds">`)
and `js/fg-ui.js` (`window.FGUI`).

## Tokens (CSS variables, global `:root`)

| Purpose | Token | Value |
|---|---|---|
| Page background | `--fg-bg` | `#111214` |
| Sidebar / toolbar | `--fg-chrome` | `#18191b` |
| Card | `--fg-card` | `#1c1d20` |
| Border / divider | `--fg-line` | `#34363b` |
| Primary text | `--fg-t1` | `#f0f1f2` |
| Secondary text | `--fg-t2` | `#b5b8be` |
| Muted text | `--fg-t3` / `--fg-t4` | `#8b909a` / `#6c727c` |
| Action (links, buttons, selected) | `--fg-blue` | `#5379ff` |
| Severity | `--fg-crit` `--fg-high` `--fg-mod` `--fg-ok` | red / orange / amber / green |
| Unknown | `--fg-neutral` | `#8b9099` (always paired with the word "Unknown") |
| Spacing scale | `--fg-s1..s6` | 4 / 8 / 12 / 16 / 24 / 32 |
| Radius | `--fg-r` / `--fg-r-s` | 9px / 7px |
| Font | Inter (portal-wide), JetBrains Mono for numerics |

## Component classes (`.fgc-*`)

`fgc-card`, `fgc-panel`, `fgc-h1`, `fgc-sub`, `fgc-k` (uppercase label),
`fgc-link`, `fgc-btn` (+`.ghost`), `fgc-status` (dot+label), `fgc-seg`
(segmented filter), `fgc-table`, `fgc-empty`, `fgc-div`.

## JS builders (`FGUI`)

```js
FGUI.status('critical', 'Critical')          // dot + word (never colour-only)
FGUI.emptyState('No critical estates', { label:'View all', onClick })  // {html, wire}
FGUI.segmented({ key:'estate-risk', options:[{value:'all',label:'All',count:7}], onChange })
                                              // remembers selection per key across re-renders
FGUI.fmt(12000)                               // "12,000" (tabular)
FGUI.sparkline(series, { unit:'%' })          // neutral line + hover value
FGUI.bars(series, { unit:' mm' })             // neutral bars + hover value
```

`emptyState` and `segmented` return `{ html, wire(root) }` — insert `html`, then
call `wire(container)` once to attach handlers.

## Behaviour baked in

- **Filter memory:** `FGUI.segmented` remembers its selection by `key` for the
  session, so returning to a module keeps its filter.
- **Scroll memory:** `switchTab` saves/restores each module's scroll position.
- **Colour rule:** severity/status colour always accompanies text or an icon,
  never colour alone. Missing data renders as Unknown/Unavailable/"—", not `0`.

## Adopting in a module

Replace bespoke card/table/filter/empty markup with the classes and builders
above. The Overview module (`ops-dashboard.js`) is the reference consumer — its
`.ovx` tokens all resolve to the `--fg-*` variables.
