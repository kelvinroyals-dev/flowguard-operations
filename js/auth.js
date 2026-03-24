/**
 * FlowGuard Operations Center — Authentication Module v3.2.1
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

  function getRole() {
    return getUser()?.role || null;
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

  function hasNavAccess(tabKey) {
    const role    = getRole();
    if (!role) return false;
    const allowed = CONFIG.NAV_ACCESS[role] || [];
    return allowed.includes(tabKey);
  }

  function getDefaultTab() {
    const role    = getRole();
    const allowed = CONFIG.NAV_ACCESS[role] || [];
    return allowed[0] || 'dashboard';
  }

  // ── SESSION MANAGEMENT ─────────────────────────────────────────────────

  function logout() {
    // Clear both stores — handles both persistent and session-only logins
    CONFIG.STORAGE_KEYS.forEach(k => {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });
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
    const role      = user.role || 'unknown';
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
    logout, install401Interceptor,
    updateUserInfo, getGreeting, getPersonalizedGreeting,
  };

})();
