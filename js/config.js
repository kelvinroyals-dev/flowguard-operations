/**
 * FlowGuard Operations Center — Global Configuration
 * ─────────────────────────────────────────────────────
 * Single source of truth for environment, role access, and constants.
 *
 * TO CHANGE ENVIRONMENT: update API_BASE only.
 * Never hardcode API_BASE in any other file.
 */

const CONFIG = Object.freeze({

  // ── API ──────────────────────────────────────────────────────────────
  API_BASE: 'https://api.flowguard.ng/api/v1',

  // ── APP META ─────────────────────────────────────────────────────────
  APP_NAME:    'FlowGuard Ops',
  APP_VERSION: 'v3.2.0',
  // HQ_LABEL is intentionally not set here — location is pulled from the
  // authenticated user's organisation record, not hardcoded. FlowGuard is
  // a DaaS platform and can be deployed in any geography.

  // ── BRAND PALETTE (from flowguard_mark_B_brand_colours.svg) ──────────
  // These are reference-only — actual CSS vars live in index.html / login.html.
  // Documented here so future sessions can stay consistent.
  BRAND: {
    navy:      '#0a2a3d',   // deep navy — primary dark
    blue:      '#16a8d3',   // cyan-blue — primary accent
    blueLight: '#1cb8e8',   // bright highlight
    amber:     '#f5a623',   // amber-gold — secondary accent / alert
    teal:      '#0d7fa0',   // water teal — mid tone
    sky:       '#cceeff',   // pale sky — light fill
  },

  // ── ROLE-BASED NAV ACCESS ─────────────────────────────────────────────
  // Lists the tab keys each role may access.
  // To grant a role new access: add the key to its array here — nowhere else.
  NAV_ACCESS: {
    super_admin:        ['dashboard','alerts','clients','properties','teams','team-members','reports','settings'],
    operations_manager: ['dashboard','alerts','clients','properties','teams','reports'],
    dispatcher:         ['dashboard','alerts','teams'],
    field_lead:         ['dashboard','alerts'],
    analyst:            ['dashboard','reports'],
    finance:            ['dashboard','clients','reports'],
  },

  // ── ROLE DISPLAY LABELS ───────────────────────────────────────────────
  ROLE_LABELS: {
    super_admin:        'Super Admin',
    operations_manager: 'Operations Manager',
    dispatcher:         'Dispatcher',
    field_lead:         'Field Lead',
    analyst:            'Analyst',
    finance:            'Finance',
  },

  // ── SESSION STORAGE KEYS ──────────────────────────────────────────────
  // All keys written to localStorage by this app.
  // Auth.logout() removes exactly these keys — never calls localStorage.clear().
  STORAGE_KEYS: ['token', 'user', 'ops_demo_mode'],

});
