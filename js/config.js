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

  // ── ROLE-BASED NAV ACCESS ─────────────────────────────────────────────
  // To grant a role access to a new tab: add the key here only.
  // 'admin' is an API alias for 'super_admin'.
  NAV_ACCESS: Object.freeze({
    admin:              ['dashboard','alerts','clients','properties','assets','sensors','teams','team-members','field-reports','reports','billing','sla','audit','settings'],
    super_admin:        ['dashboard','alerts','clients','properties','assets','sensors','teams','team-members','field-reports','reports','billing','sla','audit','settings'],
    operations_manager: ['dashboard','alerts','clients','properties','assets','sensors','teams','field-reports','reports','billing','sla'],
    dispatcher:         ['dashboard','alerts','assets','sensors','teams','field-reports'],
    field_lead:         ['dashboard','alerts','assets','sensors','field-reports'],
    analyst:            ['dashboard','field-reports','reports','billing','sla','audit'],
    finance:            ['dashboard','clients','reports','billing'],
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
