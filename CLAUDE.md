# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

No build step, no bundler, no `package.json`. This is a static multi-page vanilla JS site.

- Preview locally: serve the directory with any static file server, e.g. `npx serve .` or `python3 -m http.server`, then open `index.html`, `login.html`, or `field.html`.
- No test suite and no linter are configured in this repo.
- Deployment is Netlify (see `_headers`); there is no `netlify.toml`, so Netlify uses default settings (publish = root).
- Cache-busting is manual: script tags in `index.html` are versioned with a `?v=secN` query string. Bump that string when changing a JS file that must bypass browser/CDN cache.

## Architecture

This is the **Operations Portal** (internal staff dashboard) for FlowGuard, a drainage-monitoring product. A separate, independently deployed repo (`flowguard-frontend` / "Client Portal") serves the customer-facing app; both talk to the same backend.

- **No framework.** Each `js/ops-*.js` file is a self-contained IIFE module, one per nav tab: dashboard, clients, properties, assets, network, sensors, teams, team-members, field-reports, alerts-reports, billing, sla, audit, settings, user-management.
- **Load order matters.** `index.html` loads scripts in a fixed sequence: `config.js` → `auth.js` → `ops-modal.js` → `fg-paginator.js` → then every feature module. Each feature module assumes `CONFIG` and `OpsModal` already exist.
- **`js/config.js`** is the single source of truth for `API_BASE`, brand colors, and role-based nav access (`NAV_ACCESS`, `ROLE_LABELS`). Never hardcode the API base or a role's allowed tabs anywhere else — change it only here.
- **`js/auth.js`** (`Auth` module): token/user lookup checks `sessionStorage` before `localStorage` (session = "keep me signed in" unchecked; local = checked). `logout()` clears both storages *and* Cache Storage — field handsets are shared between crew members, so stale cached API responses under a previous user's session must not survive a logout. `install401Interceptor()` patches `window.fetch` once at boot to force-logout on any 401 globally.
- **`js/ops-modal.js`** (`OpsModal` module) is shared by every feature module: modal rendering, toast/confirm UI, `getHeaders()` for authenticated requests, and an `escape()` helper. Every feature module renders server data into `innerHTML` — always pass untrusted strings through `escape()` first (error/toast text uses `textContent` instead and is exempt). The JWT lives in `localStorage`, so an XSS here is a token-theft chain, not just a cosmetic bug.
- **Role-based access** is enforced via `CONFIG.NAV_ACCESS`: `admin`/`super_admin` (full access), `operations_manager`, `dispatcher`, `field_lead`, `analyst`, `finance` — each mapped to a distinct set of allowed tab keys. Both nav rendering and tab-level guarding key off `Auth.hasNavAccess(tabKey)`.
- **`field.html` + `field-sw.js` + `manifest.json`** form a separate installable PWA scoped to `/field.html`, for field crews doing incident response — independent of the `ops-*.js` dashboard modules and not gated by the same nav system.
- **Backend**: `https://api.flowguard.ng/api/v1`, not in this repo.
- **CSP**: `_headers` locks `script-src`/`style-src`/`connect-src` down to self plus a small allowlist (unpkg, Google Fonts, api.flowguard.ng, CARTO/OSM map tiles). New third-party scripts or API hosts need a `_headers` update or they'll be silently blocked in production.

## UI / module design convention (MANDATORY — do not deviate)

Every new `ops-*.js` tab MUST reuse the established list/detail chrome. Benchmark against a mature core module — **`ops-maintenance.js`** is the canonical reference — NOT against whatever module happens to be most recent. (Getting this wrong once: the first Service Providers + Jobs modules used bespoke pill-chips, a solid-fill action button, and a bare empty box, and looked nothing like the rest of the app.)

A list view has, in this order:
1. A header row: `<h2>` title (`--fs-xl`, weight 700) + a one-line `<span>` subtitle (`--fs-xs`, `--ink-3`). Any primary action is a **ghost/outlined** button on the right (border `--blue-dim`, background `--neon-trace`, text `--blue-hi`, fills on hover) — never a solid-fill button.
2. A single bordered panel: `.lv-wrap` containing `.lv-toolbar` → `.lv-search` (magnifier icon + input) on the left and `.lv-toolbar-right` → `select.um-filter` on the right. Filters are a **dropdown**, not free-floating chips.
3. A `.lv-scroll` > `table.lv-table` with UPPERCASE column headers and `tr.clickable` rows. Status is a `.lv-status` pill (`.ok` / `.warn` / `.danger` / `.neutral`). Priority uses the inline colored-token span pattern from `ops-maintenance.js`.
4. Empty states via `OpsModal.emptyState(icon, title, sub)`.

Detail views use the shared **`OpsModal.detailShell({...})`** (fgd-* layout) with `OpsModal.fact()` rows and `.lv-status`/`fgd-chip` pills — the same shell Properties/Clients/Assets/Reports/Teams use. Do not build a one-off detail card.

Always use design tokens, never literals: type scale `--fs-2xs … --fs-xl`, colors `--ink/-2/-3/-4`, `--surface/-2/-3`, `--border`, semantic `--ok/--warn/--caut/--err`, `--blue-hi/--blue-dim`, fonts `--ff-b/--ff-d/--ff-m`. These are defined for both light and dark `:root`, so using them gives correct theming for free. Reuse `OpsModal` helpers (`field`, `row`, `getFormData`, `link`, `sid`, `kpiStrip`, `toast`, `confirm`) rather than re-implementing form inputs, links, or toasts.
