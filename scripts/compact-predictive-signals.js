#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/compact-predictive-signals.js — Predictive Signal Retention CLI (Phase 53)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/compact-predictive-signals.js [--force]
// Archives old resolved predictive signals.
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

async function main() {
  const force = process.argv.includes('--force');

  console.log(`\n🧹 يوميّة Predictive Signal Retention${force ? ' (FORCE)' : ''}\n`);

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { runPredictiveSignalRetention, getPredictivePrecisionStats } =
    await import('../server/services/predictiveSignalRetention.js');

  const before = await getPredictivePrecisionStats();

  console.log('Before:');
  console.log(`   total: ${before.total || 0}`);
  console.log(`   active: ${before.byStatus?.active || 0}`);
  console.log(`   confirmed: ${before.byStatus?.confirmed || 0}`);
  console.log(`   false_positive: ${before.byStatus?.false_positive || 0}`);

  const result = await runPredictiveSignalRetention({
    force,
    reason: 'cli',
  });

  if (!result.ok) {
    console.error('\n❌ Retention failed:', result.error || result.code);
    process.exit(1);
  }

  console.log('\n✅ Retention complete');
  console.log(`   scanned: ${result.scanned || 0}`);
  console.log(`   archived: ${result.archived || 0}`);
  console.log(`   skipped: ${result.skipped || 0}`);
  console.log(`   failed: ${result.failed || 0}`);
  console.log(`   duration: ${result.durationMs || 0}ms\n`);

  const after = await getPredictivePrecisionStats();

  console.log('After:');
  console.log(`   total: ${after.total || 0}`);
  console.log(`   active: ${after.byStatus?.active || 0}`);
  console.log(`   confirmed: ${after.byStatus?.confirmed || 0}`);
  console.log(`   false_positive: ${after.byStatus?.false_positive || 0}\n`);
}

main().catch(err => {
  console.error('\n❌ Predictive signal retention failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
