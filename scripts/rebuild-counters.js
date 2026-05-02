#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/rebuild-counters.js — يوميّة: Counter Rebuild CLI (Phase 45)
// ═══════════════════════════════════════════════════════════════
// Usage: node scripts/rebuild-counters.js
// Disaster recovery — rebuild direct offer counter file from raw offers.
// Locked via withLock — won't conflict with active applyEvent calls.
// ═══════════════════════════════════════════════════════════════

// Load env
try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {
  // dotenv not installed — use process.env directly
}

async function main() {
  console.log('\n🔄 يوميّة Counter Rebuild\n');

  // Initialize database directories first
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { rebuildCounters } = await import('../server/services/directOfferCounters.js');

  console.log('   Starting rebuild...');
  const startTs = Date.now();

  try {
    const result = await rebuildCounters();
    const durationMs = Date.now() - startTs;

    if (result.skipped) {
      console.log(`\n⚠️  Rebuild skipped — last rebuild was too recent.`);
      console.log(`   Current state: ${result.offerCount} offers, ${result.employerCount} employers, ${result.workerCount} workers\n`);
    } else {
      console.log(`\n✅ Rebuild complete in ${durationMs}ms`);
      console.log(`   Offers tracked: ${result.offerCount}`);
      console.log(`   Employers: ${result.employerCount}`);
      console.log(`   Workers: ${result.workerCount}\n`);
    }

    process.exit(0);
  } catch (err) {
    console.error(`\n❌ Rebuild failed: ${err.message}\n`);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
