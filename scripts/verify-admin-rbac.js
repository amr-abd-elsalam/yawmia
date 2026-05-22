#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/verify-admin-rbac.js — Admin RBAC Verification (Phase 58)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/verify-admin-rbac.js
//   node scripts/verify-admin-rbac.js --json
//   node scripts/verify-admin-rbac.js --strict
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const JSON_OUT = process.argv.includes('--json');
const STRICT = process.argv.includes('--strict');

function check(id, status, message, details = {}, recommendation = null) {
  const out = { id, status, message, details };
  if (recommendation) out.recommendation = recommendation;
  return out;
}

async function main() {
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };

  if (JSON_OUT) {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  }

  const config = (await import('../config.js')).default;

  const checks = [];
  const rbac = config.ADMIN_RBAC || {};
  const approvals = config.ADMIN_APPROVALS || {};

  checks.push(check(
    'admin_rbac_enabled',
    rbac.enabled ? 'pass' : 'fail',
    rbac.enabled ? 'ADMIN_RBAC is enabled' : 'ADMIN_RBAC is disabled'
  ));

  const roles = Array.isArray(rbac.roles) ? rbac.roles : [];
  const capabilities = rbac.capabilities || {};

  checks.push(check(
    'roles_defined',
    roles.length > 0 ? 'pass' : 'fail',
    roles.length > 0 ? `${roles.length} role(s) defined` : 'No admin roles defined',
    { roles }
  ));

  const superCaps = capabilities.super_admin || [];
  checks.push(check(
    'super_admin_wildcard',
    Array.isArray(superCaps) && superCaps.includes('*') ? 'pass' : 'fail',
    Array.isArray(superCaps) && superCaps.includes('*')
      ? 'super_admin has wildcard capability'
      : 'super_admin must include "*" capability'
  ));

  const unknownCapabilityRoles = Object.keys(capabilities).filter(r => !roles.includes(r));
  checks.push(check(
    'no_unknown_roles_in_capabilities',
    unknownCapabilityRoles.length === 0 ? 'pass' : 'fail',
    unknownCapabilityRoles.length === 0
      ? 'Capability matrix contains only known roles'
      : 'Capability matrix contains unknown roles',
    { unknownCapabilityRoles }
  ));

  const requiredCapabilities = [
    'admin.read',
    'admin.ops.read',
    'admin.queue.repair',
    'admin.schedulers.toggle',
    'admin.locks.release',
    'admin.maintenance.toggle',
    'admin.trust.read',
    'admin.predictive.review',
    'admin.trust.calibration',
    'admin.users.status_limited',
    'admin.verifications.review',
    'admin.payments.complete',
  ];

  const allCaps = new Set();
  for (const caps of Object.values(capabilities)) {
    if (Array.isArray(caps)) {
      for (const cap of caps) allCaps.add(cap);
    }
  }

  const missingRequiredCapabilities = requiredCapabilities.filter(cap => !allCaps.has(cap) && !superCaps.includes('*'));
  checks.push(check(
    'required_capabilities_present',
    missingRequiredCapabilities.length === 0 ? 'pass' : 'warn',
    missingRequiredCapabilities.length === 0
      ? 'Required capability names are present'
      : 'Some expected capability names are not explicitly present outside wildcard',
    { missingRequiredCapabilities }
  ));

  const dangerousActions = approvals.dangerousActions || [];
  checks.push(check(
    'dangerous_actions_mapped',
    approvals.enabled && dangerousActions.length > 0 ? 'pass' : 'fail',
    approvals.enabled && dangerousActions.length > 0
      ? `${dangerousActions.length} dangerous action(s) configured`
      : 'Dangerous action approvals are disabled or empty',
    { enabled: approvals.enabled, dangerousActions }
  ));

  const tokenRole = rbac.tokenRole || 'super_admin';
  checks.push(check(
    'token_role_known',
    roles.includes(tokenRole) ? 'pass' : 'fail',
    roles.includes(tokenRole) ? `ADMIN_TOKEN maps to ${tokenRole}` : `Unknown tokenRole: ${tokenRole}`,
    { tokenRole }
  ));

  if ((process.env.NODE_ENV || 'development') === 'production' && tokenRole === 'super_admin') {
    checks.push(check(
      'production_token_role_super_admin',
      'warn',
      'ADMIN_TOKEN maps to super_admin in production; rotate and restrict access',
      { tokenRole },
      'Do not share ADMIN_TOKEN broadly. Prefer session admin roles for daily work.'
    ));
  }

  const summary = {
    pass: checks.filter(c => c.status === 'pass').length,
    warn: checks.filter(c => c.status === 'warn').length,
    fail: checks.filter(c => c.status === 'fail').length,
  };

  const result = {
    ok: summary.fail === 0 && (!STRICT || summary.warn === 0),
    strict: STRICT,
    generatedAt: new Date().toISOString(),
    summary,
    checks,
  };

  if (JSON_OUT) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('\n🛡️ يوميّة Admin RBAC Verification\n');
    console.log(`Strict: ${STRICT ? 'yes' : 'no'}`);
    console.log(`Summary: pass=${summary.pass}, warn=${summary.warn}, fail=${summary.fail}\n`);

    for (const c of checks) {
      const icon = c.status === 'pass' ? '✅' : c.status === 'warn' ? '⚠️' : '❌';
      console.log(`${icon} ${c.id}: ${c.message}`);
      if (c.recommendation) console.log(`   → ${c.recommendation}`);
    }

    console.log(result.ok ? '\n✅ RBAC verification passed\n' : '\n❌ RBAC verification failed\n');
  }

  if (!result.ok) process.exit(1);
}

main().catch(err => {
  if (JSON_OUT) {
    console.log(JSON.stringify({
      ok: false,
      error: err.message,
      generatedAt: new Date().toISOString(),
    }, null, 2));
  } else {
    console.error('\n❌ RBAC verification failed:', err.message);
    if (err.stack) console.error(err.stack);
  }
  process.exit(1);
});
