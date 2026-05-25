#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/repair-queue.js — Queue Repair CLI (Phase 55 + Phase 61.1)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/repair-queue.js --dry-run --json
//   node scripts/repair-queue.js --confirm --json
//
// Phase 61.1:
//   Default is dry-run unless --confirm is explicitly passed.
//   Repair mutates queue summary/location index only when confirmed.
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const JSON_OUT = process.argv.includes('--json');
const CONFIRM = process.argv.includes('--confirm');
const DRY_RUN = process.argv.includes('--dry-run') || !CONFIRM;

function printHuman(result) {
  console.log(`\n🔧 يوميّة Queue Repair${result.dryRun ? ' (DRY RUN)' : ' (CONFIRMED)'}\n`);

  console.log(`Mutation performed: ${result.mutationPerformed ? 'yes' : 'no'}`);
  console.log(`Before: ${result.before?.status || 'unknown'}`);
  console.log(`After:  ${result.after?.status || (result.dryRun ? 'not-run' : 'unknown')}`);
  console.log(`Duration: ${result.durationMs || 0}ms`);

  if (result.summary) {
    console.log(`Summary locations: ${result.summary.locationCount || 0}`);
    console.log(`Legacy records: ${result.summary.legacyRecords || 0}`);
  }

  if (result.repairPlan && Array.isArray(result.repairPlan.actions)) {
    console.log('\nRepair plan:');
    for (const action of result.repairPlan.actions) {
      console.log(`  - ${action.type}: ${action.reason || ''}`);
    }
  }

  if (result.repairPlan && Array.isArray(result.repairPlan.risks) && result.repairPlan.risks.length > 0) {
    console.log('\nRisks / notes:');
    for (const risk of result.repairPlan.risks) {
      console.log(`  ⚠️ ${risk}`);
    }
  }

  if (!result.ok) {
    console.log('\n❌ Queue repair verification has remaining errors');
    for (const e of result.after?.errors || result.before?.errors || []) {
      console.log(`  - ${e}`);
    }
    return;
  }

  console.log(result.dryRun
    ? '\n✅ Queue repair dry-run complete. Re-run with --confirm to mutate summary.\n'
    : '\n✅ Queue repair complete\n'
  );
}

async function main() {
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { repairQueueStorage } = await import('../server/services/queueHealthVerify.js');

  const result = await repairQueueStorage({
    dryRun: DRY_RUN,
  });

  if (JSON_OUT) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }

  if (!result.ok) process.exit(1);
}

main().catch(err => {
  const failure = {
    ok: false,
    dryRun: DRY_RUN,
    error: err.message,
    stack: err.stack,
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(failure, null, 2));
  } else {
    console.error('\n❌ Queue repair failed:', err.message);
    if (err.stack) console.error(err.stack);
  }

  process.exit(1);
});
