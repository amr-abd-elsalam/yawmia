#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/queue-retry-dlq.js — Retry Dead-Letter Queue Jobs (Phase 52/61.4)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/queue-retry-dlq.js --dry-run --json [--type=job_type] [--limit=50]
//   node scripts/queue-retry-dlq.js --confirm --json [--type=job_type] [--limit=50]
//
// Safety:
//   - Default is dry-run.
//   - Mutation requires --confirm.
//   - --json emits machine-readable output.
//   - Confirmed mode mutates queue records by calling opsQueue.retryJob().
//   - No queue jobs are retried unless --confirm is present.
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const CONFIRM = process.argv.includes('--confirm');
const DRY_RUN = process.argv.includes('--dry-run') || !CONFIRM;
const JSON_OUT = process.argv.includes('--json');

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

function toPositiveInt(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}

function buildConfirmCommand({ type, limit }) {
  const parts = ['node scripts/queue-retry-dlq.js', '--confirm', '--json'];
  if (type) parts.push(`--type=${type}`);
  if (limit) parts.push(`--limit=${limit}`);
  return parts.join(' ');
}

function printJson(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

async function main() {
  const started = Date.now();
  const type = getArg('type', '');
  const limit = toPositiveInt(getArg('limit', '50'), 50, 500);

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

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { listJobs, retryJob } = await import('../server/services/opsQueue.js');

  const result = await listJobs({
    deadLetter: true,
    status: 'dead-letter',
    type: type || undefined,
    limit,
    offset: 0,
  });

  const jobs = result.jobs || [];
  const confirmCommand = buildConfirmCommand({ type, limit });

  if (!JSON_OUT) {
    console.log(`\n♻️ يوميّة DLQ Retry${DRY_RUN ? ' — DRY RUN' : ' — CONFIRMED'}\n`);
    console.log(`   type: ${type || 'all'}`);
    console.log(`   limit: ${limit}`);
    console.log(`   found: ${jobs.length}`);
  }

  let retried = 0;
  const retriedJobs = [];
  const failedJobs = [];
  const plannedJobs = [];

  for (const job of jobs) {
    const row = {
      id: job.id,
      type: job.type || null,
      status: job.status || null,
      attempts: job.attempts || 0,
      maxAttempts: job.maxAttempts || 0,
      createdAt: job.createdAt || null,
      updatedAt: job.updatedAt || null,
      lastError: job.lastError || null,
    };

    plannedJobs.push(row);

    if (!JSON_OUT) {
      console.log(`   - ${job.id} (${job.type}) attempts=${job.attempts}/${job.maxAttempts}`);
    }

    if (!DRY_RUN) {
      try {
        const retry = await retryJob(job.id, { resetAttempts: true });
        if (retry && retry.ok) {
          retried++;
          retriedJobs.push({
            ...row,
            retried: true,
            newStatus: retry.job?.status || null,
            queueJobId: retry.job?.id || job.id,
          });
        } else {
          failedJobs.push({
            ...row,
            retried: false,
            error: retry?.error || 'RETRY_FAILED',
          });
        }
      } catch (err) {
        failedJobs.push({
          ...row,
          retried: false,
          error: err.message,
        });
      }
    }
  }

  const output = {
    ok: failedJobs.length === 0,
    dryRun: DRY_RUN,
    confirm: CONFIRM,
    mutationPerformed: !DRY_RUN && retried > 0,
    type: type || null,
    limit,
    found: jobs.length,
    planned: plannedJobs.length,
    retried,
    retriedJobs,
    failedJobs,
    plannedJobs: DRY_RUN ? plannedJobs : plannedJobs.slice(0, 20),
    confirmCommand: DRY_RUN && jobs.length > 0 ? confirmCommand : null,
    warnings: [
      'default mode is dry-run and does not mutate queue records',
      'confirmed mode calls opsQueue.retryJob() and mutates dead-letter queue state',
      'review plannedJobs before running --confirm',
      'do not use this script to drain due pending jobs; use queue-drain only under its separate incident procedure',
    ],
    durationMs: Date.now() - started,
    completedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    printJson(output);
    return;
  }

  if (DRY_RUN) {
    console.log('\n📋 Dry run complete — no jobs retried.');
    if (jobs.length > 0) {
      console.log(`   confirmCommand: ${confirmCommand}`);
    }
    console.log('');
  } else {
    console.log(`\n✅ Retried ${retried} job(s).`);
    if (failedJobs.length > 0) {
      console.log(`⚠️ Failed ${failedJobs.length} retry attempt(s).`);
    }
    console.log('');
  }

  if (!output.ok) {
    process.exit(1);
  }
}

main().catch(err => {
  const payload = {
    ok: false,
    dryRun: DRY_RUN,
    confirm: CONFIRM,
    mutationPerformed: false,
    error: err.message,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    printJson(payload);
  } else {
    console.error('\n❌ DLQ retry failed:', err.message);
    if (err.stack) console.error(err.stack);
  }

  process.exit(1);
});
