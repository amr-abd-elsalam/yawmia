#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/compact-workrooms.js — Workroom Hygiene CLI
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/compact-workrooms.js --dry-run --json
//   node scripts/compact-workrooms.js --confirm --json
//   node scripts/compact-workrooms.js --jobId=job_x --dry-run --json
//   node scripts/compact-workrooms.js --jobId=job_x --confirm --json
//
// Default is DRY-RUN. Mutation requires --confirm.
// Workroom compaction mutates derived/sidecar workroom artifacts only.
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const JSON_OUT = process.argv.includes('--json');
const CONFIRM = process.argv.includes('--confirm');
const DRY_RUN = process.argv.includes('--dry-run') || !CONFIRM;

function getArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

function printHuman(result) {
  console.log(`\n🧹 يوميّة Workroom Hygiene ${result.dryRun ? '(DRY RUN)' : '(CONFIRMED)'}\n`);
  console.log(`Mutation performed: ${result.mutationPerformed ? 'yes' : 'no'}`);
  if (result.jobId) console.log(`Job ID: ${result.jobId}`);

  if (result.dryRun) {
    console.log('\nNo files changed.');
    console.log('Planned actions:');
    for (const action of result.plannedActions || []) {
      console.log(`  - ${action}`);
    }
    console.log('\nTo compact workroom sidecars after review:');
    console.log(result.jobId
      ? `  node scripts/compact-workrooms.js --jobId=${result.jobId} --confirm --json`
      : '  node scripts/compact-workrooms.js --confirm --json'
    );
  } else if (result.skipped) {
    console.log(`\n⚠️ Skipped: ${result.reason}`);
  } else {
    console.log('\n✅ Workroom compaction complete');

    if (result.jobId) {
      console.log(`Receipts removed: ${result.receipts?.removed || 0}`);
      console.log(`Pins removed: ${result.pins?.removed || 0}`);
      console.log(`Checklist removed: ${result.checklist?.removed || 0}`);
    } else {
      console.log(`Scanned: ${result.scanned || 0}`);
      console.log(`Compacted: ${result.compacted || 0}`);
      console.log(`Failed: ${result.failed || 0}`);
      console.log(`Duration: ${result.durationMs || 0}ms`);
    }
  }

  console.log('');
}

async function main() {
  const jobId = getArg('jobId', '');

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  if (DRY_RUN) {
    const result = {
      ok: true,
      dryRun: true,
      confirm: false,
      mutationPerformed: false,
      script: 'scripts/compact-workrooms.js',
      scope: jobId ? 'single_workroom_sidecars' : 'all_workroom_sidecars',
      jobId: jobId || null,
      plannedActions: jobId ? [
        `inspect workroom sidecars for ${jobId}`,
        'compact receipts sidecar if above retention/size policy',
        'compact pins/checklist/timeline sidecars when configured',
        'rewrite derived workroom sidecars atomically',
      ] : [
        'scan workroom sidecar records',
        'compact receipts/pins/checklist/timeline sidecars when configured',
        'yield between batches',
        'rewrite derived workroom sidecars atomically',
      ],
      warnings: [
        'Dry-run intentionally does not call compaction service because current service mutates sidecars.',
        'Run with --confirm only after reviewing workroom hygiene overview.',
      ],
      confirmCommand: jobId
        ? `node scripts/compact-workrooms.js --jobId=${jobId} --confirm --json`
        : 'node scripts/compact-workrooms.js --confirm --json',
      generatedAt: new Date().toISOString(),
    };

    if (JSON_OUT) console.log(JSON.stringify(result, null, 2));
    else printHuman(result);
    return;
  }

  const { compactWorkroom, compactAllWorkrooms } = await import('../server/services/workroomHygiene.js');

  const serviceResult = jobId
    ? await compactWorkroom(jobId)
    : await compactAllWorkrooms();

  const result = {
    ok: serviceResult.ok !== false,
    dryRun: false,
    confirm: true,
    mutationPerformed: true,
    script: 'scripts/compact-workrooms.js',
    scope: jobId ? 'single_workroom_sidecars' : 'all_workroom_sidecars',
    jobId: jobId || null,
    ...serviceResult,
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
    script: 'scripts/compact-workrooms.js',
    error: err && err.message ? err.message : String(err),
    stack: err && err.stack ? err.stack : null,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) console.log(JSON.stringify(failure, null, 2));
  else {
    console.error('\n❌ Workroom compaction failed:', failure.error);
    if (failure.stack) console.error(failure.stack);
  }

  process.exit(1);
});
