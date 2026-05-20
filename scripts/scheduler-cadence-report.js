#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/scheduler-cadence-report.js — Scheduler Cadence Report (Phase 57)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/scheduler-cadence-report.js
//   node scripts/scheduler-cadence-report.js --json
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const JSON_OUT = process.argv.includes('--json');

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

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const {
    registerDefaultSchedulerJobs,
    getSchedulerCadenceReport,
  } = await import('../server/services/schedulerRegistry.js');

  await registerDefaultSchedulerJobs().catch(() => {});

  const report = await getSchedulerCadenceReport();

  if (JSON_OUT) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('\n⏱ يوميّة Scheduler Cadence Report\n');
  console.log(`Enabled: ${report.enabled}`);
  console.log(`Total: ${report.total}`);
  console.log(`Enabled jobs: ${report.enabledCount}`);
  console.log(`Stale: ${report.staleCount}`);
  console.log(`Failed: ${report.failedCount}\n`);

  for (const s of report.schedulers || []) {
    const stale = s.stale ? ' ⚠️ STALE' : '';
    console.log(`- ${s.name}${stale}`);
    console.log(`  queueType: ${s.queueType}`);
    console.log(`  enabled: ${s.enabled}`);
    console.log(`  intervalMs: ${s.intervalMs}`);
    console.log(`  lastStatus: ${s.lastStatus || '-'}`);
    console.log(`  lastRunAt: ${s.lastRunAt || '-'}`);
    console.log(`  nextRunAt: ${s.nextRunAt || '-'}`);
    console.log(`  lastQueueJobId: ${s.lastQueueJobId || '-'}`);

    if (s.staleReasons && s.staleReasons.length > 0) {
      console.log(`  staleReasons: ${s.staleReasons.join(', ')}`);
    }

    if (s.historySummary) {
      console.log(`  history: recent=${s.historySummary.totalRecent}, failed=${s.historySummary.recentFailed}, queued=${s.historySummary.recentQueued}, skipped=${s.historySummary.recentSkipped}`);
    }

    console.log('');
  }

  if (report.staleCount > 0) {
    process.exitCode = 1;
  }
}

main().catch(err => {
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({
      enabled: false,
      ok: false,
      error: err.message,
      generatedAt: new Date().toISOString(),
      schedulers: [],
    }, null, 2));
  } else {
    console.error('\n❌ Scheduler cadence report failed:', err.message);
    if (err.stack) console.error(err.stack);
  }
  process.exit(1);
});
