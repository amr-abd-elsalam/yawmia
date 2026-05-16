#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/repair-queue.js — Queue Repair CLI (Phase 55)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/repair-queue.js
// Rebuilds queue summary/location index and verifies result.
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

async function main() {
  console.log('\n🔧 يوميّة Queue Repair\n');

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { repairQueueStorage } = await import('../server/services/queueHealthVerify.js');

  const result = await repairQueueStorage();

  console.log(`Before: ${result.before?.status || 'unknown'}`);
  console.log(`After:  ${result.after?.status || 'unknown'}`);
  console.log(`Duration: ${result.durationMs || 0}ms`);

  if (result.summary) {
    console.log(`Summary locations: ${result.summary.locationCount || 0}`);
    console.log(`Legacy records: ${result.summary.legacyRecords || 0}`);
  }

  if (!result.ok) {
    console.log('\n❌ Queue repair completed with remaining errors');
    for (const e of result.after?.errors || []) {
      console.log(`  - ${e}`);
    }
    process.exit(1);
  }

  console.log('\n✅ Queue repair complete\n');
}

main().catch(err => {
  console.error('\n❌ Queue repair failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
