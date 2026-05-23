#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/predeploy-check.js — Deployment Gate (Phase 58)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   NODE_ENV=production node scripts/predeploy-check.js --strict
//   node scripts/predeploy-check.js --json
// ═══════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const STRICT = process.argv.includes('--strict');
const JSON_OUT = process.argv.includes('--json');
const PREDEPLOY_CHILD_TIMEOUT_MS = Number.parseInt(process.env.PREDEPLOY_CHILD_TIMEOUT_MS || '120000', 10);

function parsePossiblyNoisyJson(stdout) {
  if (!stdout) return null;

  try {
    return JSON.parse(stdout);
  } catch (_) {}

  const firstBrace = stdout.indexOf('{');
  const lastBrace = stdout.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(stdout.slice(firstBrace, lastBrace + 1));
    } catch (_) {}
  }

  return null;
}

function runScript(script, args = []) {
  const proc = spawnSync(process.execPath, [script, ...args], {
    env: process.env,
    encoding: 'utf-8',
    timeout: PREDEPLOY_CHILD_TIMEOUT_MS,
  });

  const parsed = parsePossiblyNoisyJson(proc.stdout);

  return {
    ok: proc.status === 0,
    status: proc.status,
    stdout: proc.stdout,
    stderr: proc.stderr,
    parsed,
    error: proc.error?.message || null,
    timedOut: proc.error?.code === 'ETIMEDOUT',
  };
}

function mk(id, status, message, recommendation = null, details = {}) {
  const out = { id, status, message, details };
  if (recommendation) out.recommendation = recommendation;
  return out;
}

async function main() {
  const checks = [];

  // Keep --json output machine-readable even if imported services log warnings.
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

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  // package/version/deps
  const pkg = JSON.parse(await readFile('package.json', 'utf-8'));
  checks.push(mk('package_version', pkg.version === '0.54.0' ? 'pass' : 'fail', `package version is ${pkg.version}`, null, { expected: '0.54.0' }));

  const deps = Object.keys(pkg.dependencies || {});
  const allowedDeps = new Set(['dotenv']);
  const extraDeps = deps.filter(d => !allowedDeps.has(d));
  checks.push(mk(
    'dependencies',
    extraDeps.length === 0 ? 'pass' : 'fail',
    extraDeps.length === 0 ? 'No new dependencies detected' : `Unexpected dependencies: ${extraDeps.join(', ')}`,
    null,
    { dependencies: deps }
  ));

  // PWA cache consistency
  const swRaw = await readFile('frontend/sw.js', 'utf-8').catch(() => '');
  const cacheOk = swRaw.includes(`CACHE_NAME = '${config.PWA.cacheName}'`) && config.PWA.cacheName === 'yawmia-v0.54.0';
  checks.push(mk(
    'pwa_cache',
    cacheOk ? 'pass' : 'fail',
    cacheOk ? 'PWA cache version is consistent' : 'PWA cache version mismatch',
    null,
    { configCache: config.PWA.cacheName }
  ));

  // Production readiness
  const { getProductionReadiness } = await import('../server/services/productionReadiness.js');
  const readiness = await getProductionReadiness();

  for (const c of readiness.checks || []) {
    checks.push({
      id: `readiness:${c.id}`,
      status: c.status,
      message: c.message,
      recommendation: c.recommendation || null,
      details: c.details || {},
    });
  }

  // JSON health
  const jsonHealth = runScript('scripts/verify-data-json.js', ['--json', ...(STRICT ? ['--strict'] : [])]);
  if (jsonHealth.parsed) {
    checks.push(mk(
      'json_health',
      jsonHealth.parsed.critical === 0 ? 'pass' : 'fail',
      jsonHealth.parsed.critical === 0 ? 'No critical JSON corruption detected' : `${jsonHealth.parsed.critical} critical JSON issue(s) detected`,
      'node scripts/verify-data-json.js --strict',
      jsonHealth.parsed
    ));
  } else {
    checks.push(mk('json_health', 'warn', 'Could not parse JSON health script output', 'node scripts/verify-data-json.js --strict'));
  }

  // File health
  const fileHealth = runScript('scripts/verify-file-health.js', ['--json', ...(STRICT ? ['--strict'] : [])]);
  if (fileHealth.parsed) {
    checks.push(mk(
      'file_health',
      fileHealth.parsed.critical === 0 ? 'pass' : 'fail',
      fileHealth.parsed.critical === 0 ? 'No critical file health issues detected' : `${fileHealth.parsed.critical} critical file issue(s) detected`,
      'node scripts/verify-file-health.js --strict',
      fileHealth.parsed
    ));
  } else {
    checks.push(mk('file_health', 'warn', 'Could not parse file health script output', 'node scripts/verify-file-health.js --strict'));
  }

  // Scheduler cadence
  const scheduler = runScript('scripts/scheduler-cadence-report.js', ['--json']);
  if (scheduler.parsed) {
    checks.push(mk(
      'scheduler_cadence',
      scheduler.parsed.staleCount > 0 ? 'warn' : 'pass',
      scheduler.parsed.staleCount > 0 ? `${scheduler.parsed.staleCount} stale scheduler(s)` : 'Scheduler cadence is healthy',
      'node scripts/scheduler-cadence-report.js',
      scheduler.parsed
    ));
  }

  // Phase 58 — Admin RBAC governance.
  const rbac = runScript('scripts/verify-admin-rbac.js', ['--json', ...(STRICT ? ['--strict'] : [])]);
  if (rbac.parsed) {
    checks.push(mk(
      'admin_rbac_governance',
      rbac.parsed.summary?.fail > 0 ? 'fail' : ((rbac.parsed.summary?.warn || 0) > 0 ? 'warn' : 'pass'),
      rbac.parsed.ok ? 'Admin RBAC governance is healthy' : 'Admin RBAC governance has issues',
      'node scripts/verify-admin-rbac.js --strict',
      rbac.parsed
    ));
  } else {
    checks.push(mk('admin_rbac_governance', 'warn', 'Could not parse admin RBAC verification output', 'node scripts/verify-admin-rbac.js --strict'));
  }

  // Phase 58 — Privacy governance.
  const privacyGov = runScript('scripts/verify-privacy-governance.js', ['--json', ...(STRICT ? ['--strict'] : [])]);
  if (privacyGov.parsed) {
    checks.push(mk(
      'privacy_governance',
      privacyGov.parsed.summary?.fail > 0 ? 'fail' : ((privacyGov.parsed.summary?.warn || 0) > 0 ? 'warn' : 'pass'),
      privacyGov.parsed.ok ? 'Privacy governance is healthy' : 'Privacy governance has issues',
      'node scripts/verify-privacy-governance.js --strict',
      privacyGov.parsed
    ));
  } else {
    checks.push(mk('privacy_governance', 'warn', 'Could not parse privacy governance verification output', 'node scripts/verify-privacy-governance.js --strict'));
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
    environment: config.ENV?.current || process.env.NODE_ENV || 'development',
    summary,
    checks,
  };

  if (JSON_OUT) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('\n🚦 يوميّة Predeploy Check\n');
    console.log(`Environment: ${result.environment}`);
    console.log(`Summary: pass=${summary.pass}, warn=${summary.warn}, fail=${summary.fail}\n`);

    for (const c of checks) {
      const icon = c.status === 'pass' ? '✅' : c.status === 'warn' ? '⚠️' : '❌';
      console.log(`${icon} ${c.id}: ${c.message}`);
      if (c.recommendation) console.log(`   → ${c.recommendation}`);
    }

    console.log(result.ok ? '\n✅ Predeploy gate passed\n' : '\n❌ Predeploy gate failed\n');
  }

  if (!result.ok) process.exit(1);
}

main().catch(err => {
  console.error('\n❌ Predeploy check failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
