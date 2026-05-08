#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/verify-audit-index.js — Audit Index Verify CLI (Phase 50)
// ═══════════════════════════════════════════════════════════════
// Usage: node scripts/verify-audit-index.js
// Exits 1 if audit index verification fails.
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

async function main() {
  console.log('\n🧪 يوميّة Audit Index Verify\n');

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { verifyAuditIndex, getAuditIndexStats } = await import('../server/services/auditLogIndex.js');

  const stats = await getAuditIndexStats();
  console.log(`   Status: ${stats.status}`);
  console.log(`   Records: ${stats.recordCount || 0}`);
  console.log(`   Last built: ${stats.lastBuiltAt || '-'}`);
  if (stats.stale) console.log(`   Stale reason: ${stats.staleReason || 'unknown'}`);

  const result = await verifyAuditIndex();

  if (!result.ok) {
    console.log(`\n❌ Verify failed — warnings: ${result.warnings.length}`);
    for (const w of result.warnings.slice(0, 20)) {
      console.log(`   - ${w}`);
    }
    process.exit(1);
  }

  console.log(`\n✅ Verify passed`);
  console.log(`   Checked: ${result.checked || 0}`);
  console.log(`   Total raw records: ${result.totalRecords || 0}\n`);
}

main().catch(err => {
  console.error('\n❌ Audit index verify failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
