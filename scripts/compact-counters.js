#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/compact-counters.js — Counter Compaction CLI (Phase 50/61)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/compact-counters.js --dry-run --json
//   node scripts/compact-counters.js --confirm --json
//
// Default is DRY-RUN. Mutation requires --confirm.
// Compacts derived direct-offer counter file only; does not mutate source offers.
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const JSON_OUT = process.argv.includes('--json');
const CONFIRM = process.argv.includes('--confirm');
const DRY_RUN = process.argv.includes('--dry-run') || !CONFIRM;

function printHuman(result) {
  console.log(`\n🧹 يوميّة Counter Compaction ${result.dryRun ? '(DRY RUN)' : '(CONFIRMED)'}\n`);
  console.log(`Mutation performed: ${result.mutationPerformed ? 'yes' : 'no'}`);
  console.log(`Counter file size: ${result.fileSizeMB} MB`);

  if (result.dryRun) {
    console.log('\nNo files changed.');
    console.log('To compact derived counter file:');
    console.log('  node scripts/compact-counters.js --confirm --json');
  } else if (result.skipped) {
    console.log(`\n⚠️ Skipped: ${result.reason}`);
  } else {
    console.log('\n✅ Compaction complete');
    console.log(`Before: ${result.beforeSizeMB} MB`);
    console.log(`After:  ${result.afterSizeMB} MB`);
    console.log(`Removed platform buckets: ${result.removedPlatformBuckets || 0}`);
    console.log(`Removed employer buckets: ${result.removedEmployerBuckets || 0}`);
    console.log(`Removed worker buckets: ${result.removedWorkerBuckets || 0}`);
    console.log(`Archived employers: ${result.archivedEmployers || 0}`);
    console.log(`Archived workers: ${result.archivedWorkers || 0}`);
    console.log(`Duration: ${result.durationMs || 0}ms`);
  }

  console.log('');
}

async function main() {
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const counters = await import('../server/services/directOfferCounters.js');
  const sizeBytes = await counters.getFileSize();
  const fileSizeMB = +(sizeBytes / 1048576).toFixed(2);

  if (DRY_RUN) {
    const result = {
      ok: true,
      dryRun: true,
      confirm: false,
      mutationPerformed: false,
      script: 'scripts/compact-counters.js',
      scope: 'derived_direct_offer_counter_file',
      fileSizeBytes: sizeBytes,
      fileSizeMB,
      plannedActions: [
        'forceFlush pending direct-offer counter events',
        'prune old hourly buckets',
        'archive inactive employer/worker counter entities when configured',
        'rewrite derived counter file atomically',
      ],
      warnings: [
        'This mutates a derived runtime artifact, not source direct_offers records.',
        'Run with --confirm only during low-traffic windows or via ops queue/admin UI.',
      ],
      confirmCommand: 'node scripts/compact-counters.js --confirm --json',
      generatedAt: new Date().toISOString(),
    };

    if (JSON_OUT) console.log(JSON.stringify(result, null, 2));
    else printHuman(result);
    return;
  }

  const { compactCounters } = await import('../server/services/counterCompaction.js');

  const compactResult = await compactCounters();
  const beforeSizeMB = +((compactResult.beforeSizeBytes || 0) / 1048576).toFixed(2);
  const afterSizeMB = +((compactResult.afterSizeBytes || 0) / 1048576).toFixed(2);

  const result = {
    ok: compactResult.ok !== false,
    dryRun: false,
    confirm: true,
    mutationPerformed: true,
    script: 'scripts/compact-counters.js',
    scope: 'derived_direct_offer_counter_file',
    fileSizeBytes: await counters.getFileSize(),
    fileSizeMB: +((await counters.getFileSize()) / 1048576).toFixed(2),
    beforeSizeMB,
    afterSizeMB,
    ...compactResult,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) console.log(JSON.stringify(result, null, 2));
  else printHuman(result);
}

main().catch(err => {
  const failure = {
    ok: false,
    dryRun: DRY_RUN,
    confirm: CONFIRM,
    mutationPerformed: false,
    script: 'scripts/compact-counters.js',
    error: err && err.message ? err.message : String(err),
    stack: err && err.stack ? err.stack : null,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) console.log(JSON.stringify(failure, null, 2));
  else {
    console.error('\n❌ Counter compaction failed:', failure.error);
    if (failure.stack) console.error(failure.stack);
  }

  process.exit(1);
});
