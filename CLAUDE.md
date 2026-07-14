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
