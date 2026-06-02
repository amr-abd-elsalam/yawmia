#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/rebuild-counters.js — Direct Offer Counter Rebuild CLI
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/rebuild-counters.js --dry-run --json
//   node scripts/rebuild-counters.js --confirm --json
//
// Default is DRY-RUN. Mutation requires --confirm.
// Rebuilds derived direct-offer counter file from raw direct_offers.
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const JSON_OUT = process.argv.includes('--json');
const CONFIRM = process.argv.includes('--confirm');
const DRY_RUN = process.argv.includes('--dry-run') || !CONFIRM;

function printHuman(result) {
  console.log(`\n🔄 يوميّة Counter Rebuild ${result.dryRun ? '(DRY RUN)' : '(CONFIRMED)'}\n`);
  console.log(`Mutation performed: ${result.mutationPerformed ? 'yes' : 'no'}`);
  console.log(`Current counter file size: ${result.fileSizeMB || 0} MB`);

  if (result.dryRun) {
    console.log('\nNo files changed.');
    console.log(`Current total offers in counter file: ${result.currentCounterTotals?.totalOffers || 0}`);
    console.log('To rebuild derived counter file:');
    console.log('  node scripts/rebuild-counters.js --confirm --json');
  } else if (result.skipped) {
    console.log('\n⚠️ Rebuild skipped — last rebuild was too recent.');
    console.log(`Offers tracked: ${result.offerCount || 0}`);
  } else {
    console.log('\n✅ Rebuild complete');
    console.log(`Offers tracked: ${result.offerCount || 0}`);
    console.log(`Employers: ${result.employerCount || 0}`);
    console.log(`Workers: ${result.workerCount || 0}`);
    console.log(`Duration: ${result.durationMs || 0}ms`);
  }

  console.log('');
}

async function main() {
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const counters = await import('../server/services/directOfferCounters.js');
  const current = await counters.readCounters();
  const sizeBytes = await counters.getFileSize();

  if (DRY_RUN) {
    const result = {
      ok: true,
      dryRun: true,
      confirm: false,
      mutationPerformed: false,
      script: 'scripts/rebuild-counters.js',
      scope: 'derived_direct_offer_counter_file',
      fileSizeBytes: sizeBytes,
      fileSizeMB: +(sizeBytes / 1048576).toFixed(2),
      currentCounterTotals: {
        totalOffers: current.platform?.total || 0,
        pending: current.platform?.pending || 0,
        accepted: current.platform?.accepted || 0,
        declined: current.platform?.declined || 0,
        expired: current.platform?.expired || 0,
        withdrawn: current.platform?.withdrawn || 0,
        employers: Object.keys(current.byEmployer || {}).length,
        workers: Object.keys(current.byWorker || {}).length,
      },
      plannedActions: [
        'full scan raw direct_offers records',
        'recompute platform/employer/worker counters',
        'rewrite derived counter file atomically',
      ],
      warnings: [
        'This mutates a derived analytics artifact, not source direct_offers records.',
        'Prefer admin queue job counter_rebuild for production when server is running.',
      ],
      confirmCommand: 'node scripts/rebuild-counters.js --confirm --json',
      generatedAt: new Date().toISOString(),
    };

    if (JSON_OUT) console.log(JSON.stringify(result, null, 2));
    else printHuman(result);
    return;
  }

  const started = Date.now();
  const rebuildResult = await counters.rebuildCounters();

  const result = {
    ok: true,
    dryRun: false,
    confirm: true,
    mutationPerformed: !rebuildResult.skipped,
    script: 'scripts/rebuild-counters.js',
    scope: 'derived_direct_offer_counter_file',
    fileSizeBytes: await counters.getFileSize(),
    fileSizeMB: +((await counters.getFileSize()) / 1048576).toFixed(2),
    durationMs: rebuildResult.durationMs || (Date.now() - started),
    ...rebuildResult,
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
    script: 'scripts/rebuild-counters.js',
    error: err && err.message ? err.message : String(err),
    stack: err && err.stack ? err.stack : null,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) console.log(JSON.stringify(failure, null, 2));
  else {
    console.error('\n❌ Counter rebuild failed:', failure.error);
    if (failure.stack) console.error(failure.stack);
  }

  process.exit(1);
});
