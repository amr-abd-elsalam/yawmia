#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/queue-drain.js — Ops Queue Due-Job Processing Loop (Phase 52/61.4)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/queue-drain.js --dry-run --json
//   node scripts/queue-drain.js --confirm --json [--max-cycles=20] [--delay-ms=500]
//
// Important:
//   This command is NOT stale-running recovery only.
//   In confirmed mode it imports queueWorkers and calls processDueJobs().
//   That means it can claim and process due pending queue jobs.
//   Do not run --confirm while a /mnt/j/yawmia server or queue worker is active.
//
// Phase 61.4:
//   --dry-run is strictly non-mutating.
//   --json emits machine-readable JSON only.
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
  const value = found.slice(prefix.length);
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const started = Date.now();
  const maxCycles = getArg('max-cycles', 20);
  const delayMs = getArg('delay-ms', 500);

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

  const queue = await import('../server/services/opsQueue.js');

  if (DRY_RUN) {
    const stats = await queue.getQueueStats();
    const result = {
      ok: true,
      dryRun: true,
      mutationPerformed: false,
      maxCycles,
      delayMs,
      totalClaimed: 0,
      byStatus: stats.byStatus || {},
      byType: stats.byType || {},
      totalActiveRecords: stats.totalActiveRecords || 0,
      summary: stats.summary || null,
      warnings: [
        'dry-run does not claim, recover, retry, complete, fail, or mutate queue jobs',
        'confirmed mode calls queueWorkers.processDueJobs() and can claim/process due pending jobs',
        'queue-drain is not stale-running recovery only',
        'do not run --confirm while a /mnt/j/yawmia server or queue worker is active',
      ],
      durationMs: Date.now() - started,
      completedAt: new Date().toISOString(),
    };

    if (JSON_OUT) {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('\n🧵 يوميّة Ops Queue Due-Job Processing Loop — Dry Run\n');
      console.log('   mutationPerformed: false');
      console.log('   warning: confirmed mode calls processDueJobs() and can claim/process due jobs');
      console.log('   warning: queue-drain is not stale-running recovery only');
      console.log(`   pending: ${result.byStatus.pending || 0}`);
      console.log(`   running: ${result.byStatus.running || 0}`);
      console.log(`   completed: ${result.byStatus.completed || 0}`);
      console.log(`   failed: ${result.byStatus.failed || 0}`);
      console.log(`   dead-letter: ${result.byStatus['dead-letter'] || 0}\n`);
    }

    return;
  }

  if (!JSON_OUT) {
    console.log('\n🧵 يوميّة Ops Queue Due-Job Processing Loop — CONFIRMED\n');
    console.log('   ⚠️ This will call queueWorkers.processDueJobs().');
    console.log('   ⚠️ It can claim and process due pending queue jobs.');
    console.log('   ⚠️ It is not stale-running recovery only.');
    console.log('   ⚠️ Do not run while a /mnt/j/yawmia server or queue worker is active.');
    console.log(`   maxCycles: ${maxCycles}`);
    console.log(`   delayMs: ${delayMs}`);
  }

  const workers = await import('../server/services/queueWorkers.js');

  let totalClaimed = 0;
  const cycles = [];

  for (let i = 0; i < maxCycles; i++) {
    const result = await workers.processDueJobs();
    totalClaimed += result.claimed || 0;

    const stats = await queue.getQueueStats();
    const pending = stats.byStatus?.pending || 0;
    const running = stats.byStatus?.running || 0;

    cycles.push({
      cycle: i + 1,
      claimed: result.claimed || 0,
      pending,
      running,
    });

    if (!JSON_OUT) {
      console.log(`   cycle ${i + 1}: claimed=${result.claimed || 0}, pending=${pending}, running=${running}`);
    }

    if (pending === 0 && running === 0) break;
    await sleep(delayMs);
  }

  await workers.stopQueueWorkers({ drainMs: 5000 }).catch(() => {});

  const finalStats = await queue.getQueueStats();

  const output = {
    ok: true,
    dryRun: false,
    mutationPerformed: totalClaimed > 0,
    maxCycles,
    delayMs,
    cycles,
    totalClaimed,
    byStatus: finalStats.byStatus || {},
    byType: finalStats.byType || {},
    totalActiveRecords: finalStats.totalActiveRecords || 0,
    summary: finalStats.summary || null,
    warnings: [
      'confirmed mode called queueWorkers.processDueJobs()',
      'this command can claim/process due pending jobs',
      'queue-drain is not stale-running recovery only',
      'do not run --confirm while a /mnt/j/yawmia server or queue worker is active',
    ],
    durationMs: Date.now() - started,
    completedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log('\n✅ Queue due-job processing loop complete');
    console.log('   note: this command called processDueJobs() and may have processed due jobs');
    console.log(`   totalClaimed: ${totalClaimed}`);
    console.log(`   pending: ${finalStats.byStatus?.pending || 0}`);
    console.log(`   running: ${finalStats.byStatus?.running || 0}`);
    console.log(`   completed: ${finalStats.byStatus?.completed || 0}`);
    console.log(`   failed: ${finalStats.byStatus?.failed || 0}`);
    console.log(`   dead-letter: ${finalStats.byStatus?.['dead-letter'] || 0}\n`);
  }
}

main().catch(err => {
  const payload = {
    ok: false,
    dryRun: DRY_RUN,
    mutationPerformed: false,
    error: err.message,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.error('\n❌ Queue drain failed:', err.message);
    if (err.stack) console.error(err.stack);
  }

  process.exit(1);
});
