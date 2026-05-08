#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/rebuild-audit-index.js — Audit Index Rebuild CLI (Phase 50)
// ═══════════════════════════════════════════════════════════════
// Usage: node scripts/rebuild-audit-index.js
// Rebuilds filesystem audit indexes from raw aud_*.json records.
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

async function main() {
  console.log('\n🧭 يوميّة Audit Index Rebuild\n');

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { rebuildAuditIndex, verifyAuditIndex } = await import('../server/services/auditLogIndex.js');

  const started = Date.now();
  const result = await rebuildAuditIndex();

  console.log(`✅ Rebuild complete`);
  console.log(`   Records indexed: ${result.indexed || 0}`);
  console.log(`   Duration: ${result.durationMs || (Date.now() - started)}ms`);

  const verify = await verifyAuditIndex();
  if (verify.warnings && verify.warnings.length > 0) {
    console.log(`\n⚠️ Verify warnings: ${verify.warnings.length}`);
    for (const w of verify.warnings.slice(0, 10)) {
      console.log(`   - ${w}`);
    }
  } else {
    console.log('\n✅ Verify passed');
  }

  console.log('');
}

main().catch(err => {
  console.error('\n❌ Audit index rebuild failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
