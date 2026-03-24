/**
 * FlowGuard Operations Center — Authentication Module
 * ─────────────────────────────────────────────────────
 * Responsibilities:
 *  • Token storage and JWT expiry validation
 *  • Role-based nav access (reads CONFIG.NAV_ACCESS)
 *  • Targeted session cleanup on logout (no localStorage.clear)
 *  • 401 interceptor — auto-redirects expired sessions
 *  • UI helpers: user chip, greeting
 *
 * Depends on: config.js (must load first)
 */

const Auth = (function () {

  // ── STORAGE ────────────────────────────────────────────────────────────

  function getToken() {
    return localStorage.getItem('token');
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
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

  /**
   * Returns true if the current user's role is allowed to see the given tab.
   * @param {string} tabKey  - e.g. 'dashboard', 'clients', 'settings'
   */
  function hasNavAccess(tabKey) {
    const role    = getRole();
    if (!role) return false;
    const allowed = CONFIG.NAV_ACCESS[role] || [];
    return allowed.includes(tabKey);
  }

  /**
   * Returns the first tab the current user has access to.
   * Falls back to 'dashboard' (every role has it).
   */
  function getDefaultTab() {
    const role    = getRole();
    const allowed = CONFIG.NAV_ACCESS[role] || [];
    return allowed[0] || 'dashboard';
  }

  // ── SESSION MANAGEMENT ─────────────────────────────────────────────────

  /**
   * Clears only app-owned keys from localStorage, then redirects to login.
   * Never calls localStorage.clear() — that would wipe unrelated browser state.
   */
  function logout() {
    CONFIG.STORAGE_KEYS.forEach(k => localStorage.removeItem(k));
    window.location.href = 'login.html';
  }

  /**
   * Patches the global fetch to intercept 401 responses.
   *
   * When the server rejects a request with 401, the session has expired
   * or the token is invalid. We log the user out immediately rather than
   * letting them sit on a broken page with cryptic "Failed to load" errors.
   *
   * Call this once at app boot, before any API calls are made.
   */
  function install401Interceptor() {
    const _originalFetch = window.fetch;

    window.fetch = async function (...args) {
      const response = await _originalFetch(...args);

      if (response.status === 401) {
        // Small delay so any pending UI can settle before redirect
        setTimeout(() => logout(), 100);
      }

      return response;
    };
  }

  // ── UI HELPERS ─────────────────────────────────────────────────────────

  /**
   * Populates user-facing elements in the shell with logged-in user data.
   * Safe to call multiple times — silently skips missing elements.
   */
  function updateUserInfo() {
    const user = getUser();
    if (!user) return;

    const fullName  = user.fullName || user.full_name || 'User';
    const firstName = fullName.split(' ')[0];
    const initials  = fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const role      = user.role || 'unknown';
    const roleLabel = CONFIG.ROLE_LABELS[role] || role.replace(/_/g, ' ');

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    set('user-name',       firstName);
    set('user-full-name',  fullName);
    set('user-avatar',     initials);
    set('user-role',       roleLabel);
    set('user-email',      user.email || '');
  }

  function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }

  function getPersonalizedGreeting() {
    const firstName = getUser()?.fullName?.split(' ')[0]
                   || getUser()?.full_name?.split(' ')[0]
                   || 'there';
    return `${getGreeting()}, ${firstName}`;
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────────

  return {
    getToken,
    getUser,
    getRole,
    isAuthenticated,
    hasNavAccess,
    getDefaultTab,
    logout,
    install401Interceptor,
    updateUserInfo,
    getGreeting,
    getPersonalizedGreeting,
  };

})();
