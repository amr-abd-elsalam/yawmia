#!/usr/bin/env node
// Deployment Gate (Phase 59) — scale, storage pressure, and externalization readiness checks remain advisory.
// ═══════════════════════════════════════════════════════════════
// scripts/predeploy-check.js — Deployment Gate (Phase 60)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   NODE_ENV=production node scripts/predeploy-check.js --strict
//   node scripts/predeploy-check.js --json
//
// Phase 59 adds:
// - scale threshold verification
// - storage pressure readiness
// - externalization readiness docs/scripts checks
// - no external DB/search/queue implementation discipline
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
  checks.push(mk('package_version', pkg.version === '0.57.0' ? 'pass' : 'fail', `package version is ${pkg.version}`, null, { expected: '0.57.0' }));

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
  const cacheOk = swRaw.includes(`CACHE_NAME = '${config.PWA.cacheName}'`) && config.PWA.cacheName === 'yawmia-v0.57.0';
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

  // Phase 61 — lightweight evidence/pilot/repository checks.
  try {
    const { getEvidenceCadenceStatus } = await import('../server/services/phase61EvidenceCadence.js');
    const evidence = await getEvidenceCadenceStatus();
    checks.push({
      id: 'phase61_evidence_cadence',
      status: evidence.status === 'fresh' ? 'pass' : 'warn',
      message: evidence.status === 'fresh'
        ? 'Phase 61 evidence cadence is fresh'
        : `Phase 61 evidence cadence is ${evidence.status}`,
      details: {
        warningCount: evidence.warnings?.length || 0,
        blockerCount: evidence.blockers?.length || 0,
      },
      recommendation: 'node scripts/capture-phase61-evidence.js --persist',
    });
  } catch (err) {
    checks.push({
      id: 'phase61_evidence_cadence',
      status: 'warn',
      message: 'Could not evaluate Phase 61 evidence cadence',
      details: { error: err.message },
    });
  }

  try {
    const { getPilotDecisionGate } = await import('../server/services/pilotDecisionGate.js');
    const gate = await getPilotDecisionGate();
    checks.push({
      id: 'phase61_pilot_gate',
      status: gate.implementationAllowed ? 'fail' : 'pass',
      message: gate.implementationAllowed
        ? 'Pilot gate unexpectedly allows implementation'
        : 'Pilot gate blocks external implementation by default',
      details: {
        pilotAllowed: !!gate.pilotAllowed,
        implementationAllowed: !!gate.implementationAllowed,
        blockerCount: gate.blockers?.length || 0,
      },
      recommendation: 'node scripts/evaluate-pilot-gate.js --json',
    });
  } catch (err) {
    checks.push({
      id: 'phase61_pilot_gate',
      status: 'warn',
      message: 'Could not evaluate pilot gate',
      details: { error: err.message },
    });
  }

  try {
    const { getRepositoryContractReadiness } = await import('../server/services/repositoryContractReport.js');
    const contracts = await getRepositoryContractReadiness();
    checks.push({
      id: 'phase61_repository_contracts',
      status: contracts.status === 'critical' ? 'fail' : (contracts.status === 'warning' ? 'warn' : 'pass'),
      message: 'Repository contract readiness checked',
      details: {
        status: contracts.status,
        runtimeSwitchEnabled: !!contracts.runtimeSwitchEnabled,
        externalAdapterImplemented: !!contracts.externalAdapterImplemented,
      },
      recommendation: 'node scripts/verify-repository-contracts.js --json',
    });
  } catch (err) {
    checks.push({
      id: 'phase61_repository_contracts',
      status: 'warn',
      message: 'Could not evaluate repository contracts',
      details: { error: err.message },
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
    checks.push(mk(
      'json_health',
      'warn',
      'Could not parse JSON health script output',
      'node scripts/verify-data-json.js --strict --json',
      {
        status: jsonHealth.status,
        timedOut: !!jsonHealth.timedOut,
        error: jsonHealth.error,
        stdoutTail: String(jsonHealth.stdout || '').slice(-500),
        stderrTail: String(jsonHealth.stderr || '').slice(-500),
      }
    ));
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
    checks.push(mk(
      'file_health',
      'warn',
      'Could not parse file health script output',
      'node scripts/verify-file-health.js --strict --json',
      {
        status: fileHealth.status,
        timedOut: !!fileHealth.timedOut,
        error: fileHealth.error,
        stdoutTail: String(fileHealth.stdout || '').slice(-500),
        stderrTail: String(fileHealth.stderr || '').slice(-500),
      }
    ));
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

  // Phase 59 — Scale thresholds / storage pressure verification.
  // Phase 61.1:
  // Predeploy must remain fast and must not trigger live storage pressure scans.
  // Use latest persisted artifact only. Missing/stale evidence is reported as warning/fail
  // by readiness/evidence checks, not remediated during predeploy.
  const scaleThresholds = runScript('scripts/verify-scale-thresholds.js', ['--json', '--latest-only', ...(STRICT ? ['--strict'] : [])]);
  if (scaleThresholds.parsed) {
    checks.push(mk(
      'scale_thresholds',
      scaleThresholds.parsed.status === 'critical'
        ? 'fail'
        : ((scaleThresholds.parsed.warnings || []).length > 0 ? 'warn' : 'pass'),
      scaleThresholds.parsed.status === 'critical'
        ? 'Scale thresholds have critical findings'
        : 'Scale thresholds verification completed',
      'node scripts/verify-scale-thresholds.js --strict --latest-only --persist',
      scaleThresholds.parsed
    ));
  } else {
    checks.push(mk(
      'scale_thresholds',
      'warn',
      'Could not parse scale threshold verification output',
      'node scripts/verify-scale-thresholds.js --json --latest-only --persist'
    ));
  }

  const phase59Docs = [
    'docs/operations/SCALE_LIMITS.md',
    'docs/operations/EXTERNALIZATION_READINESS.md',
    'docs/operations/MULTI_INSTANCE_BOUNDARY.md',
    'docs/operations/DATA_MIGRATION_FORMATS.md',
    'docs/operations/STORAGE_PRESSURE_RUNBOOK.md',
  ];

  for (const doc of phase59Docs) {
    try {
      await readFile(doc, 'utf-8');
      checks.push(mk(`phase59_doc:${doc}`, 'pass', `${doc} exists`));
    } catch (_) {
      checks.push(mk(
        `phase59_doc:${doc}`,
        STRICT ? 'fail' : 'warn',
        `${doc} is missing`,
        `Create ${doc}`
      ));
    }
  }

  const phase59Scripts = [
    'scripts/measure-storage-pressure.js',
    'scripts/benchmark-file-paths.js',
    'scripts/verify-scale-thresholds.js',
    'scripts/export-migration-snapshot.js',
  ];

  for (const script of phase59Scripts) {
    try {
      await readFile(script, 'utf-8');
      checks.push(mk(`phase59_script:${script}`, 'pass', `${script} exists`));
    } catch (_) {
      checks.push(mk(
        `phase59_script:${script}`,
        STRICT ? 'fail' : 'warn',
        `${script} is missing`,
        `Create ${script}`
      ));
    }
  }

  // Phase 60 — Evidence-based externalization decision + migration rehearsal.
  const phase60Docs = [
    'docs/phases/phase60/PHASE60_EXTERNALIZATION_DECISION.md',
    'docs/phases/phase60/PHASE60_MIGRATION_REHEARSAL.md',
    'docs/phases/phase60/PHASE60_ROLLBACK_PLAN.md',
    'docs/phases/phase60/PHASE60_REPOSITORY_BOUNDARIES.md',
    'docs/phases/phase60/PHASE60_EVENT_BRIDGE_DESIGN.md',
    'docs/phases/phase60/PHASE60_SSE_FANOUT_DESIGN.md',
    'docs/phases/phase60/PHASE60_OBJECT_STORAGE_DECISION.md',
    'docs/phases/phase60/PHASE60_EXTERNAL_QUEUE_DECISION.md',
    'docs/phases/phase60/PHASE60_EXTERNAL_SEARCH_DECISION.md',
  ];

  for (const doc of phase60Docs) {
    try {
      await readFile(doc, 'utf-8');
      checks.push(mk(`phase60_doc:${doc}`, 'pass', `${doc} exists`));
    } catch (_) {
      checks.push(mk(
        `phase60_doc:${doc}`,
        STRICT ? 'fail' : 'warn',
        `${doc} is missing`,
        `Create ${doc}`
      ));
    }
  }

  const phase60Scripts = [
    'scripts/validate-migration-snapshot.js',
    'scripts/run-migration-rehearsal.js',
    'scripts/capture-externalization-decision.js',
    'scripts/list-benchmark-history.js',
  ];

  for (const script of phase60Scripts) {
    try {
      await readFile(script, 'utf-8');
      checks.push(mk(`phase60_script:${script}`, 'pass', `${script} exists`));
    } catch (_) {
      checks.push(mk(
        `phase60_script:${script}`,
        STRICT ? 'fail' : 'warn',
        `${script} is missing`,
        `Create ${script}`
      ));
    }
  }

  try {
    const decision = runScript('scripts/capture-externalization-decision.js', ['--json']);
    if (decision.parsed) {
      checks.push(mk(
        'phase60_externalization_decision',
        decision.parsed.implementationAllowed === false ? 'pass' : 'fail',
        decision.parsed.implementationAllowed === false
          ? `Phase 60 decision is advisory (${decision.parsed.status || 'unknown'})`
          : 'Phase 60 decision unexpectedly allows implementation',
        'node scripts/capture-externalization-decision.js --json',
        {
          status: decision.parsed.status,
          implementationAllowed: decision.parsed.implementationAllowed,
        }
      ));
    } else {
      checks.push(mk(
        'phase60_externalization_decision',
        'warn',
        'Could not parse Phase 60 externalization decision output',
        'node scripts/capture-externalization-decision.js --json'
      ));
    }
  } catch (_) {
    checks.push(mk(
      'phase60_externalization_decision',
      'warn',
      'Could not run Phase 60 decision script',
      'node scripts/capture-externalization-decision.js --json'
    ));
  }

  try {
    const benchmarkHistory = runScript('scripts/list-benchmark-history.js', ['--json']);
    if (benchmarkHistory.parsed) {
      checks.push(mk(
        'phase60_benchmark_history',
        benchmarkHistory.parsed.total > 0 ? 'pass' : 'warn',
        benchmarkHistory.parsed.total > 0
          ? `${benchmarkHistory.parsed.total} benchmark artifact(s) available`
          : 'No benchmark history artifacts exist yet',
        'node scripts/benchmark-file-paths.js --json --persist',
        { total: benchmarkHistory.parsed.total || 0 }
      ));
    }
  } catch (_) {
    checks.push(mk(
      'phase60_benchmark_history',
      'warn',
      'Could not evaluate benchmark history',
      'node scripts/list-benchmark-history.js --json'
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
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({
      ok: false,
      error: err.message,
      stack: err.stack,
      generatedAt: new Date().toISOString(),
    }, null, 2));
  } else {
    console.error('\n❌ Predeploy check failed:', err.message);
    if (err.stack) console.error(err.stack);
  }
  process.exit(1);
});
