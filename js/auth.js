/**
 * FlowGuard Operations Center — Authentication Module v3.3.0
 * ─────────────────────────────────────────────────────────────
 * Changes:
 *  • getToken() / getUser() check sessionStorage FIRST, then localStorage
 *    Fixes: non-persistent logins were always failing isAuthenticated()
 *  • Demo mode references removed — deprecated
 *
 * Depends on: config.js
 */

const Auth = (function () {

  // ── STORAGE ────────────────────────────────────────────────────────────
  // sessionStorage = "Keep me signed in" unchecked (tab-scoped)
  // localStorage   = "Keep me signed in" checked (persistent)

  function getToken() {
    return sessionStorage.getItem('token') || localStorage.getItem('token') || null;
  }

  function getUser() {
    try {
      const raw = sessionStorage.getItem('user') || localStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  // Canonical internal role keys must match CONFIG.NAV_ACCESS / ROLE_LABELS.
  // Older accounts and invites sometimes stored a role in a different shape
  // ("Operations Manager", "ops_manager", stray caps/spaces). Without this,
  // CONFIG.NAV_ACCESS[role] misses, falls back to [], and the user logs in to
  // an empty portal with zero tabs. normalizeRole() canonicalises the string so
  // a legitimate role never silently falls through.
  //
  // ROLE_ALIASES only maps KNOWN synonyms. It never fuzzy-matches, so an
  // unknown/unauthorised role stays unknown rather than being promoted into a
  // privileged one.
  const ROLE_ALIASES = {
    administrator:        'admin',
    superadmin:           'super_admin',
    super_administrator:  'super_admin',
    ops_manager:          'operations_manager',
    opsmanager:           'operations_manager',
    operationsmanager:    'operations_manager',
    operations_mgr:       'operations_manager',
    ops_mgr:              'operations_manager',
    operation_manager:    'operations_manager',
    fieldlead:            'field_lead',
    fieldteam:            'field_team',
  };

  // lower-case, trim, and collapse spaces/hyphens to underscores, then apply
  // the alias table. "Operations Manager", "operations-manager", " OPERATIONS_MANAGER "
  // all resolve to "operations_manager".
  function normalizeRole(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const key = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
    return ROLE_ALIASES[key] || key;
  }

  function getRole() {
    return normalizeRole(getUser()?.role);
  }

  // ── AUTH STATE ─────────────────────────────────────────────────────────

  function isAuthenticated() {
    const token = getToken();
    const user  = getUser();
    if (!token || !user) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }

  // ── ROLE / NAV ACCESS ──────────────────────────────────────────────────
  // Nav tab -> permission module. Once the editable permission model loads
  // (loadPermissions), nav access is driven by it; until then we fall back to
  // the static CONFIG.NAV_ACCESS role map so the app is never blank on boot.
  const TAB_MODULE = {
    dashboard: 'situation', network: 'network', maintenance: 'maintenance', alerts: 'alerts',
    assets: 'assets', properties: 'properties', clients: 'clients', billing: 'billing',
    'field-reports': 'field-reports', support: 'support', teams: 'teams', 'team-members': 'team-members',
    sensors: 'devices', reports: 'reports', forecast: 'forecast', audit: 'audit', settings: 'administration',
  };
  let _perms = null;   // effective permission map for the current user

  async function loadPermissions() {
    try {
      const base = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE) ? CONFIG.API_BASE : '/api/v1';
      const r = await fetch(base + '/settings/permissions/me', { headers: { Authorization: 'Bearer ' + getToken() } });
      if (!r.ok) return null;
      const j = await r.json();
      _perms = (j.data && j.data.permissions) || null;
      return _perms;
    } catch { return null; }
  }

  // Generic permission check for gating buttons/actions. Fail-open until the
  // model loads (the server still enforces writes regardless).
  function can(key) { return !_perms || _perms[key] !== false; }

  function hasNavAccess(tabKey) {
    const role = getRole();
    if (!role) return false;
    const mod = TAB_MODULE[tabKey];
    if (_perms && mod) return _perms[mod + '.view'] !== false;
    const allowed = CONFIG.NAV_ACCESS[role] || [];
    return allowed.includes(tabKey);
  }

  function getDefaultTab() {
    const role    = getRole();
    const allowed = CONFIG.NAV_ACCESS[role] || [];
    return allowed[0] || 'dashboard';
  }

  // ── SESSION MANAGEMENT ─────────────────────────────────────────────────

  async function logout() {
    // Clear both stores — handles both persistent and session-only logins
    CONFIG.STORAGE_KEYS.forEach(k => {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });

    // Dropping the token is not enough. The field PWA's service worker may
    // hold cached API responses, and crews share handsets — without this the
    // next person to open the app can be served the previous user's alerts,
    // properties and team data straight from cache.
    try {
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (_) { /* never block a logout */ }

    window.location.href = 'login.html';
  }

  /**
   * Patches window.fetch to intercept 401 responses globally.
   * Call once at app boot before any API calls are made.
   */
  function install401Interceptor() {
    const _orig = window.fetch;
    window.fetch = async function (...args) {
      const response = await _orig(...args);
      if (response.status === 401) {
        setTimeout(() => logout(), 100);
      }
      return response;
    };
  }

  // ── UI HELPERS ─────────────────────────────────────────────────────────

  function updateUserInfo() {
    const user = getUser();
    if (!user) return;

    const fullName  = user.fullName || user.full_name || 'User';
    const firstName = fullName.split(' ')[0];
    const initials  = fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const role      = getRole() || 'unknown';
    const roleLabel = CONFIG.ROLE_LABELS[role] || role.replace(/_/g, ' ');

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('user-name',   firstName);
    set('user-avatar', initials);
    set('user-role',   roleLabel);
    set('user-email',  user.email || '');
  }

  function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }

  function getPersonalizedGreeting() {
    const name = getUser()?.fullName?.split(' ')[0]
              || getUser()?.full_name?.split(' ')[0]
              || 'there';
    return `${getGreeting()}, ${name}`;
  }

  return {
    getToken, getUser, getRole,
    isAuthenticated, hasNavAccess, getDefaultTab,
    loadPermissions, can,
    logout, install401Interceptor,
    updateUserInfo, getGreeting, getPersonalizedGreeting,
  };

})();
