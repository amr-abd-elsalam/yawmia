#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/queue-drain.js — Ops Queue Drain Utility (Phase 52)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/queue-drain.js [--max-cycles=20] [--delay-ms=500]
// Processes due queue jobs without starting the HTTP server.
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

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
  const maxCycles = getArg('max-cycles', 20);
  const delayMs = getArg('delay-ms', 500);

  console.log('\n🧵 يوميّة Ops Queue Drain\n');
  console.log(`   maxCycles: ${maxCycles}`);
  console.log(`   delayMs: ${delayMs}`);

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const workers = await import('../server/services/queueWorkers.js');
  const queue = await import('../server/services/opsQueue.js');

  let totalClaimed = 0;

  for (let i = 0; i < maxCycles; i++) {
    const result = await workers.processDueJobs();
    totalClaimed += result.claimed || 0;

    const stats = await queue.getQueueStats();
    const pending = stats.byStatus?.pending || 0;
    const running = stats.byStatus?.running || 0;

    console.log(`   cycle ${i + 1}: claimed=${result.claimed || 0}, pending=${pending}, running=${running}`);

    if (pending === 0 && running === 0) break;
    await sleep(delayMs);
  }

  await workers.stopQueueWorkers({ drainMs: 5000 }).catch(() => {});

  const finalStats = await queue.getQueueStats();

  console.log('\n✅ Queue drain complete');
  console.log(`   totalClaimed: ${totalClaimed}`);
  console.log(`   pending: ${finalStats.byStatus?.pending || 0}`);
  console.log(`   running: ${finalStats.byStatus?.running || 0}`);
  console.log(`   completed: ${finalStats.byStatus?.completed || 0}`);
  console.log(`   failed: ${finalStats.byStatus?.failed || 0}`);
  console.log(`   dead-letter: ${finalStats.byStatus?.['dead-letter'] || 0}\n`);
}

main().catch(err => {
  console.error('\n❌ Queue drain failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
