#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/phase61-1-remediation-status.js
// Phase 61.1 — Read-only remediation status aggregator
// ═══════════════════════════════════════════════════════════════
// Runs safe diagnostics only:
// - verify-data-json
// - find-null-json-files
// - verify-queue
// - repair-queue dry-run
// - verify-scale-thresholds latest-only
// - postdeploy-smoke optional if --smoke
// - pilot gate
//
// No mutation.
// No external DB.
// No external queue.
// No external search.
// ═══════════════════════════════════════════════════════════════

import { spawnSync } from 'node:child_process';

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const JSON_OUT = process.argv.includes('--json');
const INCLUDE_SMOKE = process.argv.includes('--smoke');
const CHILD_TIMEOUT_MS = Number.parseInt(process.env.PHASE61_1_STATUS_TIMEOUT_MS || '90000', 10);

function parseJson(stdout) {
  if (!stdout) return null;

  try {
    return JSON.parse(stdout);
  } catch (_) {}

  const first = stdout.indexOf('{');
  const last = stdout.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(stdout.slice(first, last + 1));
    } catch (_) {}
  }

  return null;
}

function run(name, script, args = []) {
  const started = Date.now();
  const proc = spawnSync(process.execPath, [script, ...args], {
    env: process.env,
    encoding: 'utf-8',
    timeout: CHILD_TIMEOUT_MS,
  });

  const parsed = parseJson(proc.stdout);

  return {
    name,
    script,
    args,
    ok: proc.status === 0,
    status: proc.status,
    durationMs: Math.max(0, Date.now() - started),
    timedOut: proc.error?.code === 'ETIMEDOUT',
    error: proc.error?.message || null,
    parsed,
    stdoutTail: parsed ? undefined : String(proc.stdout || '').slice(-1000),
    stderrTail: String(proc.stderr || '').slice(-1000),
  };
}

function checkStatus(results) {
  const blockers = [];
  const warnings = [];

  const json = results.find(r => r.name === 'json_health');
  if (!json?.parsed) {
    warnings.push({
      code: 'JSON_HEALTH_UNAVAILABLE',
      message: json?.timedOut
        ? 'JSON health scan timed out inside remediation aggregator. Run it directly with a larger timeout before conclusions.'
        : 'JSON health scan did not produce parseable output.',
      command: 'node scripts/verify-data-json.js --strict --json',
    });
  } else if (json.parsed.critical > 0 || json.parsed.nullByte > 0 || json.parsed.invalid > 0) {
    blockers.push({
      code: 'DATA_INTEGRITY_BLOCKED',
      message: 'JSON corruption or null-byte files need remediation before clean evidence.',
      command: 'node scripts/verify-data-json.js --strict --json && node scripts/quarantine-corrupt-json.js --dry-run --json',
    });
  }

  const nul = results.find(r => r.name === 'null_byte_scan');
  if (!nul?.parsed) {
    warnings.push({
      code: 'NULL_BYTE_SCAN_UNAVAILABLE',
      message: nul?.timedOut
        ? 'NUL-byte scan timed out inside remediation aggregator. Run it directly with a larger timeout before conclusions.'
        : 'NUL-byte scan did not produce parseable output.',
      command: 'node scripts/find-null-json-files.js --json',
    });
  } else if ((nul.parsed.nulFileCount || 0) > 0) {
    blockers.push({
      code: 'NULL_BYTE_JSON_BLOCKED',
      message: 'NUL-byte JSON files detected.',
      command: 'node scripts/find-null-json-files.js --json',
    });
  }

  const queue = results.find(r => r.name === 'queue_verify');
  const qParsed = queue?.parsed;
  const actualMismatches = qParsed?.details?.actualFileMismatches || [];
  const summaryMismatches = qParsed?.details?.summaryMismatches || [];

  if (!qParsed || actualMismatches.length > 0 || summaryMismatches.length > 0) {
    blockers.push({
      code: 'QUEUE_SUMMARY_MISMATCH',
      message: 'Queue summary/location index does not match actual queue files.',
      command: 'node scripts/repair-queue.js --dry-run --json',
    });
  }

  const repair = results.find(r => r.name === 'queue_repair_dry_run');
  if (!repair?.parsed) {
    warnings.push({
      code: 'QUEUE_REPAIR_DRY_RUN_UNAVAILABLE',
      message: 'Queue repair dry-run did not produce parseable output.',
      command: 'node scripts/repair-queue.js --dry-run --json',
    });
  }

  const staleRecovery = results.find(r => r.name === 'stale_running_recovery_dry_run');
  if (!staleRecovery?.parsed) {
    warnings.push({
      code: 'STALE_RUNNING_RECOVERY_DRY_RUN_UNAVAILABLE',
      message: 'Stale running recovery dry-run did not produce parseable output.',
      command: 'node scripts/recover-stale-running-jobs.js --dry-run --json --summary-only',
    });
  } else if ((staleRecovery.parsed.staleRunningCount || 0) > 0) {
    warnings.push({
      code: 'STALE_RUNNING_JOBS_REQUIRE_REVIEW',
      message: `${staleRecovery.parsed.staleRunningCount} stale running job(s) require dry-run review before any recovery workflow.`,
      command: 'node scripts/recover-stale-running-jobs.js --dry-run --json --summary-only',
    });
  }

  if (staleRecovery?.parsed && (staleRecovery.parsed.nonStaleRunningCount || 0) > 0) {
    blockers.push({
      code: 'ACTIVE_QUEUE_WORKER_LIKELY',
      message: `${staleRecovery.parsed.nonStaleRunningCount} non-stale running job(s) detected. Treat as active worker/server evidence until quiet snapshots prove leases stopped refreshing.`,
      command: 'node scripts/recover-stale-running-jobs.js --dry-run --json --summary-only',
    });
  }

  if (staleRecovery?.parsed?.pm2ManagedLikely) {
    blockers.push({
      code: 'PM2_MANAGED_YAWMIA_ACTIVE',
      message: 'PM2-managed Yawmia appears active. Stop the confirmed PM2 app before any queue mutation.',
      command: 'pm2 jlist && pm2 describe <confirmed-yawmia-app> && pm2 stop <confirmed-yawmia-app>',
    });
  }

  const predictiveInspect = results.find(r => r.name === 'predictive_scan_queue_inspect');
  if (!predictiveInspect?.parsed) {
    warnings.push({
      code: 'PREDICTIVE_SCAN_INSPECTION_UNAVAILABLE',
      message: 'Predictive scan queue inspection did not produce parseable output.',
      command: 'node scripts/inspect-predictive-scan-queue.js --json',
    });
  } else if ((predictiveInspect.parsed.staleRunningCount || 0) > 0) {
    warnings.push({
      code: 'PREDICTIVE_SCAN_STALE_RUNNING_REVIEW',
      message: `${predictiveInspect.parsed.staleRunningCount} predictive_scan running job(s) are stale. Do not requeue blindly before flood review.`,
      command: 'node scripts/inspect-predictive-scan-queue.js --json',
    });
  }

  const scale = results.find(r => r.name === 'scale_thresholds_latest');
  if (!scale?.parsed) {
    warnings.push({
      code: 'SCALE_THRESHOLDS_UNAVAILABLE',
      message: 'Scale threshold latest-only evaluation unavailable.',
      command: 'node scripts/verify-scale-thresholds.js --json --latest-only',
    });
  } else if (scale.parsed.status === 'critical') {
    warnings.push({
      code: 'SCALE_THRESHOLDS_CRITICAL_ARTIFACT',
      message: 'Latest scale threshold artifact is critical; recapture after data/queue repair.',
      command: 'node scripts/measure-storage-pressure.js --json --persist && node scripts/verify-scale-thresholds.js --latest-only --persist --json',
    });
  }

  const gate = results.find(r => r.name === 'pilot_gate');
  if (gate?.parsed?.gate?.implementationAllowed === true || gate?.parsed?.implementationAllowed === true) {
    blockers.push({
      code: 'PILOT_GATE_UNEXPECTEDLY_OPEN',
      message: 'Pilot gate unexpectedly allows implementation.',
      command: 'node scripts/evaluate-pilot-gate.js --json',
    });
  }

  const smoke = results.find(r => r.name === 'postdeploy_smoke');
  if (INCLUDE_SMOKE && (!smoke?.parsed || smoke.parsed.ok !== true)) {
    warnings.push({
      code: 'SMOKE_FAILED',
      message: 'Postdeploy smoke did not pass.',
      command: 'node scripts/postdeploy-smoke.js --json --admin-timeout-ms=3500',
    });
  }

  let status = 'healthy';
  if (blockers.length > 0) status = 'blocked';
  else if (warnings.length > 0) status = 'warnings';

  return { status, blockers, warnings };
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

  const checks = [
    run('json_health', 'scripts/verify-data-json.js', ['--json']),
    run('null_byte_scan', 'scripts/find-null-json-files.js', ['--json']),
    run('queue_verify', 'scripts/verify-queue.js', ['--json']),
    run('queue_repair_dry_run', 'scripts/repair-queue.js', ['--dry-run', '--json']),
    run('stale_running_recovery_dry_run', 'scripts/recover-stale-running-jobs.js', ['--dry-run', '--json']),
    run('predictive_scan_queue_inspect', 'scripts/inspect-predictive-scan-queue.js', ['--json']),
    run('scale_thresholds_latest', 'scripts/verify-scale-thresholds.js', ['--json', '--latest-only']),
    run('pilot_gate', 'scripts/evaluate-pilot-gate.js', ['--json']),
  ];

  if (INCLUDE_SMOKE) {
    checks.push(run('postdeploy_smoke', 'scripts/postdeploy-smoke.js', ['--json', '--admin-timeout-ms=3500']));
  }

  const status = checkStatus(checks);

  const result = {
    ok: status.blockers.length === 0,
    status: status.status,
    generatedAt: new Date().toISOString(),
    noExternalization: true,
    noPilot: true,
    blockers: status.blockers,
    warnings: status.warnings,
    checks: checks.map(c => ({
      name: c.name,
      ok: c.ok,
      status: c.status,
      durationMs: c.durationMs,
      timedOut: c.timedOut,
      error: c.error,
      parsed: c.parsed ? summarizeParsed(c.name, c.parsed) : null,
      stdoutTail: c.stdoutTail,
      stderrTail: c.stderrTail,
    })),
    recommendedSequence: [
      'node scripts/verify-data-json.js --strict --json',
      'node scripts/find-null-json-files.js --json',
      'node scripts/verify-queue.js --json',
      'node scripts/repair-queue.js --dry-run --json',
      'node scripts/recover-stale-running-jobs.js --dry-run --json',
      'node scripts/inspect-predictive-scan-queue.js --json',
      'node scripts/phase61-1-remediation-status.js --json'
    ],
    safeDiagnostics: [
      'node scripts/verify-data-json.js --strict --json',
      'node scripts/find-null-json-files.js --json',
      'node scripts/verify-queue.js --json',
      'node scripts/repair-queue.js --dry-run --json',
      'node scripts/recover-stale-running-jobs.js --dry-run --json',
      'node scripts/inspect-predictive-scan-queue.js --json'
    ],
    evidenceAfterQueueReview: [
      'node scripts/measure-storage-pressure.js --json --persist',
      'node scripts/verify-scale-thresholds.js --latest-only --persist --json',
      'node scripts/benchmark-file-paths.js --json --persist',
      'node scripts/capture-phase61-evidence.js --persist --json',
      'node scripts/evaluate-pilot-gate.js --json'
    ],
    confirmOnlyAfterApproval: [
      'node scripts/repair-queue.js --confirm --json --approval-id=<approved-id>',
      'node scripts/compact-queue.js --confirm --json'
    ],
    forbiddenWithoutNewApproval: [
      'node scripts/queue-drain.js --confirm --json',
      'node scripts/reset-dev-data.js --confirm --reinit --json',
      'node scripts/quarantine-corrupt-json.js --confirm --json',
      'node scripts/recover-stale-running-jobs.js --confirm --json',
      'node scripts/repair-queue.js --confirm --json'
    ],
  };

  if (JSON_OUT) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('\n🧭 Phase 61.1 Remediation Status\n');
  console.log(`Status: ${result.status}`);
  console.log(`Blockers: ${result.blockers.length}`);
  console.log(`Warnings: ${result.warnings.length}\n`);

  for (const b of result.blockers) {
    console.log(`❌ ${b.code}: ${b.message}`);
    console.log(`   ${b.command}`);
  }

  for (const w of result.warnings) {
    console.log(`⚠️ ${w.code}: ${w.message}`);
    console.log(`   ${w.command}`);
  }

  if (result.blockers.length === 0 && result.warnings.length === 0) {
    console.log('✅ No current Phase 61.1 blockers detected by safe diagnostics.');
  }

  console.log('\nNo PostgreSQL. No external queue. No external search. No Pilot.\n');

  if (!result.ok) process.exit(1);
}

function summarizeParsed(name, parsed) {
  if (name === 'json_health') {
    return {
      ok: parsed.ok,
      scanned: parsed.scanned,
      critical: parsed.critical,
      invalid: parsed.invalid,
      nullByte: parsed.nullByte,
      zeroByte: parsed.zeroByte,
    };
  }

  if (name === 'null_byte_scan') {
    return {
      ok: parsed.ok,
      scannedFiles: parsed.scannedFiles,
      nulFileCount: parsed.nulFileCount,
    };
  }

  if (name === 'queue_verify') {
    return {
      ok: parsed.ok,
      status: parsed.status,
      warnings: parsed.warnings?.length || 0,
      errors: parsed.errors?.length || 0,
      summaryMismatches: parsed.details?.summaryMismatches?.length || 0,
      actualFileMismatches: parsed.details?.actualFileMismatches?.length || 0,
      actualFilesByStatus: parsed.details?.actualFilesByStatus?.byStatus || null,
    };
  }

  if (name === 'queue_repair_dry_run') {
    return {
      ok: parsed.ok,
      dryRun: parsed.dryRun,
      mutationPerformed: parsed.mutationPerformed,
      actions: parsed.repairPlan?.actions?.length || 0,
    };
  }

  if (name === 'stale_running_recovery_dry_run') {
    return {
      ok: parsed.ok,
      dryRun: parsed.dryRun,
      mutationPerformed: parsed.mutationPerformed,
      confirmImplemented: parsed.confirmImplemented,
      scannedRunning: parsed.scannedRunning || 0,
      staleRunningCount: parsed.staleRunningCount || 0,
      nonStaleRunningCount: parsed.nonStaleRunningCount || 0,
      activeWorkerLikely: !!parsed.activeWorkerLikely,
      pm2ManagedLikely: !!parsed.pm2ManagedLikely,
      confirmPreflightAllowed: parsed.confirmPreflightAllowed === true,
      lockOwnerCount: parsed.summary?.lockOwnerCount || 0,
      runningJobsByLockOwner: Array.isArray(parsed.runningJobsByLockOwner)
        ? parsed.runningJobsByLockOwner.map(o => ({
            lockedBy: o.lockedBy,
            pid: o.pid,
            total: o.total,
            stale: o.stale,
            nonStale: o.nonStale,
            activeYawmiaServerLikely: !!o.activeYawmiaServerLikely,
            pm2ManagedLikely: !!o.pm2ManagedLikely,
            pm2App: o.pm2App ? {
              name: o.pm2App.name,
              pm_id: o.pm2App.pm_id,
              pid: o.pm2App.pid,
              status: o.pm2App.status,
              pm_cwd: o.pm2App.pm_cwd,
              pm_exec_path: o.pm2App.pm_exec_path,
            } : null,
          }))
        : [],
      moveBackToPendingCandidates: parsed.summary?.moveBackToPendingCandidates || 0,
      deadLetterCandidates: parsed.summary?.deadLetterCandidates || 0,
    };
  }

  if (name === 'predictive_scan_queue_inspect') {
    return {
      ok: parsed.ok,
      readOnly: parsed.readOnly,
      mutationPerformed: parsed.mutationPerformed,
      totalPredictiveScanJobs: parsed.totalPredictiveScanJobs || 0,
      byStatus: parsed.byStatus || {},
      staleRunningCount: parsed.staleRunningCount || 0,
      nonStaleRunningCount: parsed.nonStaleRunningCount || 0,
      dualSchedulingRisk: !!parsed.dualSchedulingRisk,
      expiredPredictiveScanIdempotencyKeys: parsed.idempotency?.expiredPredictiveScanKeys || 0,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.length : 0,
    };
  }

  if (name === 'scale_thresholds_latest') {
    return {
      ok: parsed.ok,
      status: parsed.status,
      latestOnly: parsed.latestOnly,
      warnings: parsed.summary?.warnings || 0,
      criticals: parsed.summary?.criticals || 0,
    };
  }

  if (name === 'pilot_gate') {
    return {
      ok: parsed.ok,
      pilotAllowed: parsed.gate?.pilotAllowed ?? parsed.pilotAllowed,
      implementationAllowed: parsed.gate?.implementationAllowed ?? parsed.implementationAllowed,
      blockerCount: parsed.gate?.blockers?.length || parsed.blockers?.length || 0,
    };
  }

  if (name === 'postdeploy_smoke') {
    return {
      ok: parsed.ok,
      failed: parsed.failed?.length || 0,
      timeoutMs: parsed.timeoutMs,
      adminTimeoutMs: parsed.adminTimeoutMs,
    };
  }

  return parsed;
}

main().catch(err => {
  const failure = {
    ok: false,
    status: 'failed',
    error: err.message,
    stack: err.stack,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) console.log(JSON.stringify(failure, null, 2));
  else {
    console.error('\n❌ Phase 61.1 status failed:', err.message);
    if (err.stack) console.error(err.stack);
  }

  process.exit(1);
});
