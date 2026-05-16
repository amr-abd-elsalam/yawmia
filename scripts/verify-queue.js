#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/verify-queue.js — Queue Health Verify CLI (Phase 55)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/verify-queue.js
// Exits 1 on errors.
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

async function main() {
  console.log('\n🧪 يوميّة Queue Health Verify\n');

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { verifyQueueHealth } = await import('../server/services/queueHealthVerify.js');

  const result = await verifyQueueHealth({ fullScan: true });

  console.log(`Status: ${result.status}`);
  console.log(`Parsed records: ${result.details?.parsedRecords || 0}`);
  console.log(`Warnings: ${(result.warnings || []).length}`);
  console.log(`Errors: ${(result.errors || []).length}`);
  console.log(`Duration: ${result.durationMs || 0}ms\n`);

  if (result.warnings && result.warnings.length > 0) {
    console.log('Warnings:');
    for (const w of result.warnings.slice(0, 20)) {
      console.log(`  ⚠️ ${w}`);
    }
    console.log('');
  }

  if (result.errors && result.errors.length > 0) {
    console.log('Errors:');
    for (const e of result.errors.slice(0, 20)) {
      console.log(`  ❌ ${e}`);
    }
    console.log('');
    process.exit(1);
  }

  console.log('✅ Queue verify complete\n');
}

main().catch(err => {
  console.error('\n❌ Queue verify failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
