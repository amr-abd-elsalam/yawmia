#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/verify-privacy-governance.js — Privacy Governance Verification (Phase 58)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/verify-privacy-governance.js
//   node scripts/verify-privacy-governance.js --json
//   node scripts/verify-privacy-governance.js --strict
// ═══════════════════════════════════════════════════════════════

import { access, constants } from 'node:fs/promises';

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

async function exists(path) {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch (_) {
    return false;
  }
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
  const { initDatabase, getCollectionPath } = await import('../server/services/database.js');
  await initDatabase();

  const checks = [];

  const docs = [
    'docs/privacy/PRIVACY_DATA_MAP.md',
    'docs/governance/PRIVACY_REQUEST_RUNBOOK.md',
    'docs/governance/DATA_GOVERNANCE_RUNBOOK.md',
  ];

  for (const d of docs) {
    const ok = await exists(d);
    checks.push(check(
      `doc:${d}`,
      ok ? 'pass' : 'fail',
      ok ? `${d} exists` : `${d} is missing`,
      { path: d },
      ok ? null : `Create ${d}`
    ));
  }

  const pr = config.PRIVACY_REQUESTS || {};
  checks.push(check(
    'privacy_requests_enabled',
    pr.enabled ? 'pass' : 'fail',
    pr.enabled ? 'PRIVACY_REQUESTS is enabled' : 'PRIVACY_REQUESTS is disabled'
  ));

  checks.push(check(
    'privacy_export_enabled',
    pr.exportEnabled ? 'pass' : 'fail',
    pr.exportEnabled ? 'Privacy export workflow is enabled' : 'Privacy export workflow is disabled'
  ));

  checks.push(check(
    'privacy_anonymize_enabled',
    pr.anonymizeEnabled ? 'pass' : 'fail',
    pr.anonymizeEnabled ? 'Privacy anonymization workflow is enabled' : 'Privacy anonymization workflow is disabled'
  ));

  const dirs = ['privacy_requests', 'ops_reviews', 'postmortems', 'admin_approvals'];
  for (const dirName of dirs) {
    let ok = false;
    let fullPath = '';
    try {
      fullPath = getCollectionPath(dirName);
      ok = await exists(fullPath);
    } catch (_) {
      ok = false;
    }

    checks.push(check(
      `dir:${dirName}`,
      ok ? 'pass' : 'fail',
      ok ? `${dirName} directory exists` : `${dirName} directory missing`,
      { fullPath }
    ));
  }

  const scripts = [
    'scripts/export-user-data.js',
    'scripts/anonymize-user-data.js',
    'scripts/verify-privacy-governance.js',
  ];

  for (const s of scripts) {
    const ok = await exists(s);
    checks.push(check(
      `script:${s}`,
      ok ? 'pass' : 'fail',
      ok ? `${s} exists` : `${s} is missing`,
      { path: s }
    ));
  }

  checks.push(check(
    'verification_image_policy',
    pr.deleteVerificationImagesOnAnonymize ? 'pass' : 'warn',
    pr.deleteVerificationImagesOnAnonymize
      ? 'Verification image refs are configured for deletion on anonymization'
      : 'Verification image deletion on anonymization is disabled',
    { deleteVerificationImagesOnAnonymize: !!pr.deleteVerificationImagesOnAnonymize }
  ));

  checks.push(check(
    'sessions_delete_policy',
    pr.deleteSessionsOnAnonymize !== false ? 'pass' : 'warn',
    pr.deleteSessionsOnAnonymize !== false
      ? 'Sessions will be destroyed on anonymization'
      : 'Session deletion on anonymization is disabled',
    { deleteSessionsOnAnonymize: pr.deleteSessionsOnAnonymize !== false }
  ));

  checks.push(check(
    'request_retention',
    Number(pr.requestRetentionDays || 0) > 0 ? 'pass' : 'warn',
    Number(pr.requestRetentionDays || 0) > 0
      ? `Privacy request retention configured: ${pr.requestRetentionDays} days`
      : 'Privacy request retention is not configured',
    { requestRetentionDays: pr.requestRetentionDays || null }
  ));

  checks.push(check(
    'audit_logging_available',
    config.AUDIT?.enabled ? 'pass' : 'fail',
    config.AUDIT?.enabled ? 'Audit logging is enabled' : 'Audit logging is disabled'
  ));

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
    console.log('\n🔐 يوميّة Privacy Governance Verification\n');
    console.log(`Strict: ${STRICT ? 'yes' : 'no'}`);
    console.log(`Summary: pass=${summary.pass}, warn=${summary.warn}, fail=${summary.fail}\n`);

    for (const c of checks) {
      const icon = c.status === 'pass' ? '✅' : c.status === 'warn' ? '⚠️' : '❌';
      console.log(`${icon} ${c.id}: ${c.message}`);
      if (c.recommendation) console.log(`   → ${c.recommendation}`);
    }

    console.log(result.ok ? '\n✅ Privacy governance verification passed\n' : '\n❌ Privacy governance verification failed\n');
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
    console.error('\n❌ Privacy governance verification failed:', err.message);
    if (err.stack) console.error(err.stack);
  }
  process.exit(1);
});
