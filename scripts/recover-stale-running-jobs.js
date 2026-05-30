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

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const JSON_OUT = process.argv.includes('--json');
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
    summary: {
      moveBackToPendingCandidates: staleJobs.filter(j => j.proposedAction === 'move_back_to_pending_after_review').length,
      deadLetterCandidates: staleJobs.filter(j => j.proposedAction === 'move_to_dead_letter_after_review').length,
      nonStaleRunningCount: nonStaleRunningJobs.length,
    },
    warnings: [
      'dry-run only: no queue records were mutated',
      'this script does not call queueWorkers.processDueJobs()',
      'this script does not claim pending jobs',
      'queue-drain must not be used as stale-running recovery',
      'stop active /mnt/j/yawmia server before any future recovery confirm workflow',
      'run repair-queue --dry-run after any future recovery mutation',
      ...(nonStaleRunningJobs.length > 0
        ? ['not all running jobs matched stale criteria in this dry-run; review nonStaleRunningJobs before designing recovery']
        : []),
    ],
    recommendedNextSteps: [
      'review staleRunningJobs list',
      'confirm no active /mnt/j/yawmia server or queue worker is running',
      'document recovery decision in an ops review',
      'only then implement/approve a confirm workflow if needed',
    ],
    durationMs: Date.now() - started,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    printJson(output);
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
