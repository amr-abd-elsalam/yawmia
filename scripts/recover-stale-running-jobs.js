#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/recover-stale-running-jobs.js
// Phase 61.4 — Stale Running Queue Jobs Dry-Run Auditor
// ═══════════════════════════════════════════════════════════════
// Purpose:
//   Inspect stale running queue jobs safely without processing due jobs.
//
// Safety:
//   - Default is dry-run.
//   - --confirm is intentionally NOT implemented in this phase.
//   - Does not call queueWorkers.processDueJobs().
//   - Does not claim pending jobs.
//   - Does not mutate queue records.
//   - Does not write summary/location indexes.
//   - Does not delete/archive/complete/fail/retry jobs.
//
// Usage:
//   node scripts/recover-stale-running-jobs.js --json
//   node scripts/recover-stale-running-jobs.js --dry-run --json
//
// If --confirm is passed:
//   exits with CONFIRM_NOT_IMPLEMENTED and mutationPerformed:false.
// ═══════════════════════════════════════════════════════════════

import { readFileSync, readlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const JSON_OUT = process.argv.includes('--json');
const SUMMARY_ONLY = process.argv.includes('--summary-only') || process.argv.includes('--compact');
const CONFIRM = process.argv.includes('--confirm');
const DRY_RUN = process.argv.includes('--dry-run') || !CONFIRM;

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  if (!found) return fallback;
  const value = found.slice(prefix.length);
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function printJson(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function relativePath(filePath, basePath) {
  if (!filePath || typeof filePath !== 'string') return null;
  if (filePath.startsWith(basePath + '/')) return filePath.slice(basePath.length + 1);
  return filePath;
}

function parseMs(iso) {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function extractPidFromWorkerId(workerId) {
  if (!workerId || typeof workerId !== 'string') return null;
  const match = workerId.match(/^queue_worker_(\d+)_/);
  if (!match) return null;
  const pid = Number(match[1]);
  return Number.isFinite(pid) ? pid : null;
}

function readProcessInfo(pid) {
  if (!pid) return {
    pid: null,
    exists: false,
    cwd: null,
    cmdline: null,
    cwdMatchesProject: false,
    cmdlineMatchesYawmiaServer: false,
    yawmiaServerLikely: false,
  };

  let cwd = null;
  let cmdline = null;

  try {
    cwd = readlinkSync(`/proc/${pid}/cwd`);
  } catch (_) {
    cwd = null;
  }

  try {
    cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf-8')
      .replace(/\0/g, ' ')
      .trim();
  } catch (_) {
    cmdline = null;
  }

  const projectCwd = process.cwd();
  const cwdMatchesProject = !!(
    cwd &&
    (
      cwd === projectCwd ||
      cwd === '/mnt/j/yawmia' ||
      cwd.endsWith('/yawmia')
    )
  );

  const cmdlineMatchesYawmiaServer = !!(
    cmdline &&
    cmdline.includes('server.js') &&
    (
      cmdline.includes('/mnt/j/yawmia') ||
      cwdMatchesProject
    )
  );

  return {
    pid,
    exists: !!(cwd || cmdline),
    cwd,
    cmdline,
    cwdMatchesProject,
    cmdlineMatchesYawmiaServer,
    yawmiaServerLikely: !!(cwdMatchesProject && cmdlineMatchesYawmiaServer),
  };
}

function readPm2Jlist() {
  const result = spawnSync('pm2', ['jlist'], {
    encoding: 'utf-8',
    timeout: 5000,
  });

  if (result.error) {
    return {
      available: false,
      error: result.error.message,
      apps: [],
    };
  }

  if (result.status !== 0) {
    return {
      available: false,
      error: result.stderr || `pm2 jlist exited with ${result.status}`,
      apps: [],
    };
  }

  try {
    const raw = JSON.parse(result.stdout || '[]');
    const apps = raw.map(app => ({
      name: app.name || null,
      pm_id: app.pm_id,
      pid: app.pid || null,
      status: app.pm2_env?.status || null,
      restart_time: app.pm2_env?.restart_time || 0,
      autorestart: app.pm2_env?.autorestart,
      watch: app.pm2_env?.watch,
      pm_cwd: app.pm2_env?.pm_cwd || null,
      pm_exec_path: app.pm2_env?.pm_exec_path || null,
      script: app.pm2_env?.pm_exec_path || app.pm2_env?.pm_exec_interpreter || null,
      node_version: app.pm2_env?.node_version || null,
    }));

    return { available: true, error: null, apps };
  } catch (err) {
    return {
      available: false,
      error: `PM2 JSON parse failed: ${err.message}`,
      apps: [],
    };
  }
}

function isYawmiaPm2App(app) {
  if (!app || typeof app !== 'object') return false;

  const cwd = app.pm_cwd || '';
  const execPath = app.pm_exec_path || '';

  return !!(
    cwd === '/mnt/j/yawmia' ||
    cwd.endsWith('/yawmia') ||
    execPath === '/mnt/j/yawmia/server.js' ||
    (execPath.endsWith('/server.js') && cwd.endsWith('/yawmia'))
  );
}

function listYawmiaPm2Apps(pm2) {
  if (!pm2 || !Array.isArray(pm2.apps)) return [];
  return pm2.apps.filter(isYawmiaPm2App);
}

function correlatePm2AppForPid(pid, pm2) {
  if (!pid || !pm2 || !Array.isArray(pm2.apps)) return null;

  return pm2.apps.find(app => Number(app.pid) === Number(pid)) || null;
}

function summarizeLockOwners(staleJobs, nonStaleRunningJobs) {
  const pm2 = readPm2Jlist();
  const yawmiaPm2Apps = listYawmiaPm2Apps(pm2);
  const owners = new Map();

  function ensure(owner) {
    const key = owner || 'unknown';
    if (!owners.has(key)) {
      const pid = extractPidFromWorkerId(key);
      const processInfo = readProcessInfo(pid);
      const pm2App = correlatePm2AppForPid(pid, pm2);

      owners.set(key, {
        lockedBy: key,
        pid,
        total: 0,
        stale: 0,
        nonStale: 0,
        processInfo,
        pm2App,
        activeYawmiaServerLikely: !!processInfo.yawmiaServerLikely,
        pm2ManagedLikely: !!(
          pm2App &&
          ['online', 'launching', 'stopping'].includes(pm2App.status)
        ),
      });
    }
    return owners.get(key);
  }

  for (const job of staleJobs) {
    const row = ensure(job.lockedBy);
    row.total++;
    row.stale++;
  }

  for (const job of nonStaleRunningJobs) {
    const row = ensure(job.lockedBy);
    row.total++;
    row.nonStale++;
  }

  return {
    pm2: {
      ...pm2,
      yawmiaApps: yawmiaPm2Apps,
    },
    owners: Array.from(owners.values()).sort((a, b) =>
      b.nonStale - a.nonStale ||
      b.stale - a.stale ||
      String(a.lockedBy).localeCompare(String(b.lockedBy))
    ),
  };
}

function classifyRunningJob(job, config) {
  const at = Date.now();
  const staleRunningMs = config.OPS_QUEUE?.staleRunningMs || (10 * 60 * 1000);

  const leaseUntilMs = parseMs(job.leaseUntil);
  const updatedAtMs = parseMs(job.updatedAt);

  const leaseExpired = leaseUntilMs > 0 && leaseUntilMs < at;
  const updatedAtStale = updatedAtMs > 0 && (at - updatedAtMs) > staleRunningMs;

  const staleReasons = [];
  if (leaseExpired) staleReasons.push('leaseUntil_expired');
  if (updatedAtStale) staleReasons.push('updatedAt_exceeds_staleRunningMs');

  return {
    stale: staleReasons.length > 0,
    staleReasons,
    leaseExpired,
    updatedAtStale,
    leaseAgeMs: leaseUntilMs > 0 ? Math.max(0, at - leaseUntilMs) : null,
    updatedAgeMs: updatedAtMs > 0 ? Math.max(0, at - updatedAtMs) : null,
    staleRunningMs,
  };
}

function proposedActionFor(job, maxAttemptsFallback) {
  const attempts = Number(job.attempts || 0);
  const maxAttempts = Number(job.maxAttempts || maxAttemptsFallback || 5);

  if (attempts >= maxAttempts) {
    return {
      action: 'move_to_dead_letter_after_review',
      reason: 'attempts reached maxAttempts; do not retry blindly',
    };
  }

  return {
    action: 'move_back_to_pending_after_review',
    reason: 'lease is stale; eligible for explicit recovery workflow after review',
  };
}

function summarizeBy(rows, field) {
  const result = {};
  for (const row of rows || []) {
    const key = row && row[field] ? String(row[field]) : 'unknown';
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function summarizeAttempts(rows) {
  const buckets = {
    '0': 0,
    '1': 0,
    '2': 0,
    '3': 0,
    '4_plus': 0,
    maxed: 0,
  };

  for (const row of rows || []) {
    const attempts = Number(row.attempts || 0);
    const maxAttempts = Number(row.maxAttempts || 5);

    if (attempts >= maxAttempts) {
      buckets.maxed++;
    } else if (attempts >= 4) {
      buckets['4_plus']++;
    } else {
      buckets[String(attempts)] = (buckets[String(attempts)] || 0) + 1;
    }
  }

  return buckets;
}

function compactOutput(output) {
  if (!output || typeof output !== 'object') return output;

  return {
    ok: output.ok,
    dryRun: output.dryRun,
    mutationPerformed: output.mutationPerformed,
    confirmImplemented: output.confirmImplemented,
    scannedRunning: output.scannedRunning,
    staleRunningCount: output.staleRunningCount,
    nonStaleRunningCount: output.nonStaleRunningCount,
    activeWorkerLikely: output.activeWorkerLikely,
    pm2ManagedLikely: output.pm2ManagedLikely,
    confirmPreflightAllowed: output.confirmPreflightAllowed,
    confirmPreflightBlockers: output.confirmPreflightBlockers || [],
    summary: output.summary || {},
    staleRunningByType: output.summary?.staleRunningByType || {},
    nonStaleRunningByType: output.summary?.nonStaleRunningByType || {},
    staleRunningAttempts: output.summary?.staleRunningAttempts || {},
    predictiveScanSummary: output.summary?.predictiveScanSummary || {},
    runningJobsByLockOwner: (output.runningJobsByLockOwner || []).map(o => ({
      lockedBy: o.lockedBy,
      pid: o.pid,
      total: o.total,
      stale: o.stale,
      nonStale: o.nonStale,
      processExists: !!(o.processInfo && o.processInfo.exists),
      cwd: o.processInfo ? o.processInfo.cwd : null,
      cmdline: o.processInfo ? o.processInfo.cmdline : null,
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
    })),
    pm2Correlation: output.pm2Correlation ? {
      available: output.pm2Correlation.available,
      error: output.pm2Correlation.error,
      yawmiaApps: output.pm2Correlation.yawmiaApps || [],
      matchedApps: output.pm2Correlation.matchedApps || [],
    } : null,
    staleSample: (output.staleRunningJobs || []).slice(0, 5).map(j => ({
      jobId: j.jobId,
      type: j.type,
      lockedBy: j.lockedBy,
      leaseUntil: j.leaseUntil,
      updatedAt: j.updatedAt,
      staleReasons: j.staleReasons,
      proposedAction: j.proposedAction,
      path: j.path,
    })),
    nonStaleSample: (output.nonStaleRunningJobs || []).slice(0, 5).map(j => ({
      jobId: j.jobId,
      type: j.type,
      lockedBy: j.lockedBy,
      leaseUntil: j.leaseUntil,
      updatedAt: j.updatedAt,
      staleReasons: j.staleReasons,
      proposedAction: j.proposedAction,
      path: j.path,
    })),
    warnings: output.warnings || [],
    recommendedNextSteps: output.recommendedNextSteps || [],
    durationMs: output.durationMs,
    generatedAt: output.generatedAt,
  };
}

async function main() {
  const started = Date.now();
  const maxMonths = getArg('max-months', 120);

  if (CONFIRM) {
    const output = {
      ok: false,
      dryRun: false,
      mutationPerformed: false,
      code: 'CONFIRM_NOT_IMPLEMENTED',
      error: 'Stale running recovery confirm is intentionally not implemented in Phase 61.4. Use dry-run output for review only.',
      warnings: [
        'no queue mutation performed',
        'do not use queue-drain as stale-running recovery',
        'design confirm workflow only after dry-run review and explicit approval',
      ],
      generatedAt: new Date().toISOString(),
    };

    if (JSON_OUT) {
      printJson(output);
    } else {
      console.error('\n❌ CONFIRM_NOT_IMPLEMENTED');
      console.error('   Stale running recovery confirm is intentionally not implemented.');
      console.error('   Use --dry-run --json and review the plan first.\n');
    }

    process.exit(2);
  }

  const { default: config } = await import('../config.js');
  const { initDatabase } = await import('../server/services/database.js');
  const {
    listQueueRecords,
    getQueuePathByStatus,
  } = await import('../server/services/queueStorageIndex.js');
  // Intentionally do not import queueWorkers or call processDueJobs().
  // Local classification mirrors lease/update staleness while exposing reasons.

  await initDatabase();

  const basePath = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;
  const maxAttemptsFallback = config.OPS_QUEUE?.maxAttempts || 5;

  const runningJobs = await listQueueRecords({
    status: 'running',
    maxMonths,
  });

  const staleJobs = [];
  const nonStaleRunningJobs = [];

  for (const job of runningJobs) {
    if (!job || !job.id || job.status !== 'running') continue;

    let filePath = null;
    try {
      filePath = getQueuePathByStatus(job.status, job.id, job.createdAt || job.updatedAt);
    } catch (_) {
      filePath = null;
    }

    const classification = classifyRunningJob(job, config);
    const proposal = proposedActionFor(job, maxAttemptsFallback);

    const row = {
      jobId: job.id,
      type: job.type || null,
      status: job.status,
      attempts: Number(job.attempts || 0),
      maxAttempts: Number(job.maxAttempts || maxAttemptsFallback),
      lockedBy: job.lockedBy || null,
      leaseUntil: job.leaseUntil || null,
      updatedAt: job.updatedAt || null,
      nextRunAt: job.nextRunAt || null,
      createdAt: job.createdAt || null,
      path: relativePath(filePath, basePath),
      stale: classification.stale,
      staleReasons: classification.staleReasons,
      leaseExpired: classification.leaseExpired,
      updatedAtStale: classification.updatedAtStale,
      leaseAgeMs: classification.leaseAgeMs,
      updatedAgeMs: classification.updatedAgeMs,
      staleRunningMs: classification.staleRunningMs,
      proposedAction: classification.stale ? proposal.action : 'no_action_in_dry_run',
      proposedReason: classification.stale ? proposal.reason : 'running job did not match stale criteria in this dry-run',
    };

    if (classification.stale) {
      staleJobs.push(row);
    } else {
      nonStaleRunningJobs.push(row);
    }
  }

  staleJobs.sort((a, b) =>
    String(a.updatedAt || '').localeCompare(String(b.updatedAt || '')) ||
    String(a.jobId).localeCompare(String(b.jobId))
  );

  nonStaleRunningJobs.sort((a, b) =>
    String(a.updatedAt || '').localeCompare(String(b.updatedAt || '')) ||
    String(a.jobId).localeCompare(String(b.jobId))
  );

  const ownerSummary = summarizeLockOwners(staleJobs, nonStaleRunningJobs);
  const runningJobsByLockOwner = ownerSummary.owners;

  const staleRunningByType = summarizeBy(staleJobs, 'type');
  const nonStaleRunningByType = summarizeBy(nonStaleRunningJobs, 'type');
  const staleRunningAttempts = summarizeAttempts(staleJobs);

  const predictiveScanSummary = {
    staleRunning: staleJobs.filter(j => j.type === 'predictive_scan').length,
    nonStaleRunning: nonStaleRunningJobs.filter(j => j.type === 'predictive_scan').length,
    moveBackToPendingCandidates: staleJobs.filter(j => j.type === 'predictive_scan' && j.proposedAction === 'move_back_to_pending_after_review').length,
    deadLetterCandidates: staleJobs.filter(j => j.type === 'predictive_scan' && j.proposedAction === 'move_to_dead_letter_after_review').length,
    lockOwners: runningJobsByLockOwner
      .filter(o => staleJobs.some(j => j.type === 'predictive_scan' && j.lockedBy === o.lockedBy))
      .map(o => ({
        lockedBy: o.lockedBy,
        pid: o.pid,
        stale: o.stale,
        nonStale: o.nonStale,
        processExists: !!(o.processInfo && o.processInfo.exists),
        activeYawmiaServerLikely: !!o.activeYawmiaServerLikely,
        pm2ManagedLikely: !!o.pm2ManagedLikely,
      })),
  };

  const activeWorkerLikely = nonStaleRunningJobs.length > 0 ||
    runningJobsByLockOwner.some(o => o.activeYawmiaServerLikely);

  const pm2ManagedLikely = runningJobsByLockOwner.some(o => o.pm2ManagedLikely);

  const output = {
    ok: true,
    dryRun: true,
    mutationPerformed: false,
    confirmImplemented: false,
    scannedRunning: runningJobs.filter(j => j && j.id).length,
    staleRunningCount: staleJobs.length,
    nonStaleRunningCount: nonStaleRunningJobs.length,
    staleRunningJobs: staleJobs,
    nonStaleRunningJobs,
    runningJobsByLockOwner,
    processCorrelation: runningJobsByLockOwner.map(o => ({
      lockedBy: o.lockedBy,
      pid: o.pid,
      processInfo: o.processInfo,
    })),
    pm2Correlation: {
      available: ownerSummary.pm2.available,
      error: ownerSummary.pm2.error,
      yawmiaApps: ownerSummary.pm2.yawmiaApps || [],
      matchedApps: runningJobsByLockOwner
        .filter(o => o.pm2App)
        .map(o => ({
          lockedBy: o.lockedBy,
          pid: o.pid,
          pm2App: o.pm2App,
        })),
    },
    activeWorkerLikely,
    pm2ManagedLikely,
    confirmPreflightAllowed: false,
    confirmPreflightBlockers: [
      ...(activeWorkerLikely ? [{
        code: 'ACTIVE_QUEUE_WORKER_LIKELY',
        message: 'nonStaleRunningJobs or process correlation indicate an active queue worker/server',
      }] : []),
      ...(pm2ManagedLikely ? [{
        code: 'PM2_MANAGED_YAWMIA_ACTIVE',
        message: 'PM2 appears to manage an online Yawmia server/queue worker',
      }] : []),
      {
        code: 'CONFIRM_NOT_IMPLEMENTED',
        message: 'stale running recovery confirm is intentionally not implemented in Phase 61.4',
      },
    ],
    summary: {
      moveBackToPendingCandidates: staleJobs.filter(j => j.proposedAction === 'move_back_to_pending_after_review').length,
      deadLetterCandidates: staleJobs.filter(j => j.proposedAction === 'move_to_dead_letter_after_review').length,
      nonStaleRunningCount: nonStaleRunningJobs.length,
      activeWorkerLikely,
      pm2ManagedLikely,
      lockOwnerCount: runningJobsByLockOwner.length,
      staleRunningByType,
      nonStaleRunningByType,
      staleRunningAttempts,
      predictiveScanSummary,
    },
    warnings: [
      'dry-run only: no queue records were mutated',
      'this script does not call queueWorkers.processDueJobs()',
      'this script does not claim pending jobs',
      'queue-drain must not be used as stale-running recovery',
      'stop active /mnt/j/yawmia server before any future recovery confirm workflow',
      'if PM2 manages Yawmia, stop it with pm2 stop <confirmed-app>, not direct PID kill',
      'run quiet dry-run snapshots after PM2 stop to confirm leases stop refreshing',
      'run repair-queue --dry-run after any future recovery mutation',
      ...(predictiveScanSummary.staleRunning > 0
        ? ['predictive_scan stale running jobs detected; do not move them back to pending blindly before flood review']
        : []),
      ...(nonStaleRunningJobs.length > 0
        ? ['not all running jobs matched stale criteria in this dry-run; treat nonStaleRunningCount as active worker evidence until proven otherwise']
        : []),
      ...(pm2ManagedLikely
        ? ['PM2-managed Yawmia appears active; no queue mutation is safe until PM2 app is stopped and quiet snapshots are captured']
        : []),
    ],
    recommendedNextSteps: [
      'review staleRunningJobs list',
      'review staleRunningByType and predictiveScanSummary before any recovery decision',
      'confirm no active /mnt/j/yawmia server or queue worker is running',
      'document recovery decision in an ops review',
      'only then implement/approve a confirm workflow if needed',
    ],
    durationMs: Date.now() - started,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    printJson(SUMMARY_ONLY ? compactOutput(output) : output);
    return;
  }

  console.log('\n🧯 يوميّة Stale Running Queue Recovery — Dry Run\n');
  console.log('   mutationPerformed: false');
  console.log('   confirmImplemented: false');
  console.log('   processDueJobs called: no');
  console.log(`   scannedRunning: ${output.scannedRunning}`);
  console.log(`   staleRunningCount: ${output.staleRunningCount}`);
  console.log(`   nonStaleRunningCount: ${output.nonStaleRunningCount}`);
  console.log(`   moveBackToPendingCandidates: ${output.summary.moveBackToPendingCandidates}`);
  console.log(`   deadLetterCandidates: ${output.summary.deadLetterCandidates}`);
  console.log('\n⚠️  Do not use queue-drain as stale-running recovery.\n');
}

main().catch(err => {
  const failure = {
    ok: false,
    dryRun: DRY_RUN,
    mutationPerformed: false,
    error: err.message,
    stack: err.stack,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    printJson(failure);
  } else {
    console.error('\n❌ Stale running recovery dry-run failed:', err.message);
    if (err.stack) console.error(err.stack);
  }

  process.exit(1);
});
