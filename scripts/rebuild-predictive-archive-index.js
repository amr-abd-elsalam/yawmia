#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/rebuild-predictive-archive-index.js — Predictive Archive Index CLI (Phase 55)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/rebuild-predictive-archive-index.js
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

async function main() {
  console.log('\n🧠 يوميّة Predictive Archive Index Rebuild\n');

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { rebuildPredictiveArchiveIndex, getPredictiveArchiveIndexStats } =
    await import('../server/services/predictiveArchiveIndex.js');

  const result = await rebuildPredictiveArchiveIndex();

  if (result.skipped) {
    console.log(`⚠️ Skipped: ${result.reason}`);
    process.exit(0);
  }

  const stats = await getPredictiveArchiveIndexStats();

  console.log('✅ Predictive archive index rebuilt');
  console.log(`   archivedSignals: ${result.archivedSignals || 0}`);
  console.log(`   scannedArchives: ${result.scannedArchives || 0}`);
  console.log(`   riskTypes: ${result.riskTypeCount || 0}`);
  console.log(`   statuses: ${result.statusCount || 0}`);
  console.log(`   months: ${result.monthCount || 0}`);
  console.log(`   duration: ${result.durationMs || 0}ms`);
  console.log(`   status: ${stats.status}\n`);
}

main().catch(err => {
  console.error('\n❌ Predictive archive index rebuild failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
