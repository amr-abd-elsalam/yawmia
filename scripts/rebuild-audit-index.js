#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/rebuild-audit-index.js — Audit Index Rebuild CLI
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/rebuild-audit-index.js --dry-run --json
//   node scripts/rebuild-audit-index.js --confirm --json
//
// Default is DRY-RUN. Mutation requires --confirm.
// Rebuilds derived audit search indexes from raw aud_*.json records.
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const JSON_OUT = process.argv.includes('--json');
const CONFIRM = process.argv.includes('--confirm');
const DRY_RUN = process.argv.includes('--dry-run') || !CONFIRM;

function printHuman(result) {
  console.log(`\n🧭 يوميّة Audit Index Rebuild ${result.dryRun ? '(DRY RUN)' : '(CONFIRMED)'}\n`);
  console.log(`Mutation performed: ${result.mutationPerformed ? 'yes' : 'no'}`);

  if (result.before) {
    console.log(`Current status: ${result.before.status || 'unknown'}`);
    console.log(`Current records indexed: ${result.before.recordCount || 0}`);
  }

  if (result.dryRun) {
    console.log('\nNo files changed.');
    console.log('To rebuild derived audit index:');
    console.log('  node scripts/rebuild-audit-index.js --confirm --json');
  } else {
    console.log('\n✅ Rebuild complete');
    console.log(`Records indexed: ${result.indexed || 0}`);
    console.log(`Duration: ${result.durationMs || 0}ms`);
    console.log(`Verify warnings: ${(result.verify?.warnings || []).length}`);
  }

  console.log('');
}

async function main() {
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const auditIndex = await import('../server/services/auditLogIndex.js');
  const before = await auditIndex.getAuditIndexStats();

  if (DRY_RUN) {
    const result = {
      ok: true,
      dryRun: true,
      confirm: false,
      mutationPerformed: false,
      script: 'scripts/rebuild-audit-index.js',
      scope: 'derived_audit_search_index',
      before,
      plannedActions: [
        'scan raw aud_*.json records',
        'rebuild audit index files by action/admin/target/date/token',
        'write audit index meta.json',
      ],
      warnings: [
        'This mutates derived audit search indexes, not source audit log records.',
        'During production, prefer admin queue job audit_index_rebuild when possible.',
      ],
      confirmCommand: 'node scripts/rebuild-audit-index.js --confirm --json',
      generatedAt: new Date().toISOString(),
    };

    if (JSON_OUT) console.log(JSON.stringify(result, null, 2));
    else printHuman(result);
    return;
  }

  const rebuild = await auditIndex.rebuildAuditIndex();
  const verify = await auditIndex.verifyAuditIndex();
  const after = await auditIndex.getAuditIndexStats();

  const result = {
    ok: verify.ok !== false,
    dryRun: false,
    confirm: true,
    mutationPerformed: true,
    script: 'scripts/rebuild-audit-index.js',
    scope: 'derived_audit_search_index',
    before,
    after,
    verify,
    ...rebuild,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) console.log(JSON.stringify(result, null, 2));
  else printHuman(result);

  if (!result.ok) process.exit(1);
}

main().catch(err => {
  const failure = {
    ok: false,
    dryRun: DRY_RUN,
    confirm: CONFIRM,
    mutationPerformed: false,
    script: 'scripts/rebuild-audit-index.js',
    error: err && err.message ? err.message : String(err),
    stack: err && err.stack ? err.stack : null,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) console.log(JSON.stringify(failure, null, 2));
  else {
    console.error('\n❌ Audit index rebuild failed:', failure.error);
    if (failure.stack) console.error(failure.stack);
  }

  process.exit(1);
});
