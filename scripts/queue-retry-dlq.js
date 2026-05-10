#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/queue-retry-dlq.js — Retry Dead-Letter Queue Jobs (Phase 52)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/queue-retry-dlq.js [--type=job_type] [--limit=50] [--dry-run]
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const type = getArg('type', '');
  const limit = Number(getArg('limit', '50')) || 50;

  console.log(`\n♻️ يوميّة DLQ Retry${dryRun ? ' (DRY RUN)' : ''}\n`);

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

  if (jobs.length === 0) {
    console.log('✅ No dead-letter jobs found.\n');
    return;
  }

  console.log(`   Found: ${jobs.length} dead-letter job(s)`);

  let retried = 0;
  for (const job of jobs) {
    console.log(`   - ${job.id} (${job.type}) attempts=${job.attempts}/${job.maxAttempts}`);

    if (!dryRun) {
      const retry = await retryJob(job.id, { resetAttempts: true });
      if (retry.ok) retried++;
    }
  }

  if (dryRun) {
    console.log('\n📋 Dry run complete — no jobs retried.\n');
  } else {
    console.log(`\n✅ Retried ${retried} job(s).\n`);
  }
}

main().catch(err => {
  console.error('\n❌ DLQ retry failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
