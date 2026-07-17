/**
 * FlowGuard Operations Center — Global Configuration v3.2.1
 * ─────────────────────────────────────────────────────────────
 * Single source of truth for environment, role access, and constants.
 *
 * TO CHANGE ENVIRONMENT: update API_BASE only. Never hardcode elsewhere.
 *
 * Changes v3.2.1:
 *  • admin role alias added to NAV_ACCESS and ROLE_LABELS
 *  • ops_demo_mode removed from STORAGE_KEYS — demo mode deprecated
 *  • APP_VERSION bumped
 */

const CONFIG = Object.freeze({

  // ── API ──────────────────────────────────────────────────────────────
  API_BASE:    'https://api.flowguard.ng/api/v1',
  APP_NAME:    'FlowGuard Ops',
  APP_VERSION: 'v3.2.1',

  // ── BRAND (from flowguard_mark_B_brand_colours.svg) ──────────────────
  BRAND: Object.freeze({
    navy:      '#0a2a3d',
    blue:      '#16a8d3',
    blueLight: '#1cb8e8',
    amber:     '#f5a623',
    teal:      '#0d7fa0',
    sky:       '#cceeff',
  }),

  // ── AVATAR / IDENTITY COLORS ───────────────────────────────────────────
  // Shared hash-based palette for avatar initials (users, teams, team
  // members). Used by ops-user-management.js and ops-teams.js — keep this
  // as the one definition rather than re-declaring the array per module.
  AVATAR_COLORS: Object.freeze(['#0a2a3d','#0d7fa0','#16a8d3','#0a8a6a','#7c3aed','#b45309']),

  // ── ROLE-BASED NAV ACCESS ─────────────────────────────────────────────
  // To grant a role access to a new tab: add the key here only.
  // 'admin' is an API alias for 'super_admin'.
  NAV_ACCESS: Object.freeze({
    admin:              ['dashboard','alerts','clients','properties','assets','network','sensors','teams','team-members','field-reports','maintenance','support','forecast','reports','billing','sla','audit','settings'],
    super_admin:        ['dashboard','alerts','clients','properties','assets','network','sensors','teams','team-members','field-reports','maintenance','support','forecast','reports','billing','sla','audit','settings'],
    operations_manager: ['dashboard','alerts','clients','properties','assets','network','sensors','teams','field-reports','maintenance','support','forecast','reports','billing','sla'],
    dispatcher:         ['dashboard','alerts','assets','network','sensors','teams','field-reports','maintenance','support','forecast'],
    field_lead:         ['dashboard','alerts','assets','network','sensors','field-reports','maintenance','forecast'],
    analyst:            ['dashboard','field-reports','forecast','reports','billing','sla','audit'],
    finance:            ['dashboard','clients','reports','billing','support'],
  }),

  // ── ROLE DISPLAY LABELS ───────────────────────────────────────────────
  ROLE_LABELS: Object.freeze({
    admin:              'Admin',
    super_admin:        'Super Admin',
    operations_manager: 'Operations Manager',
    dispatcher:         'Dispatcher',
    field_lead:         'Field Lead',
    analyst:            'Analyst',
    finance:            'Finance',
  }),

  // ── SESSION STORAGE KEYS ──────────────────────────────────────────────
  // Auth.logout() removes exactly these from BOTH localStorage and sessionStorage.
  // demo mode removed — deprecated.
  STORAGE_KEYS: Object.freeze(['token', 'user']),

});
