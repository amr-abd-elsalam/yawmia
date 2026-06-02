#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/cleanup-attachments.js — Workroom Attachment Cleanup CLI
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/cleanup-attachments.js --dry-run --json
//   node scripts/cleanup-attachments.js --confirm --json
//   node scripts/cleanup-attachments.js --dry-run --grace-hours=24 --json
//
// Default is DRY-RUN. Deleting orphan attachments requires --confirm.
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
  console.log(`\n🧼 يوميّة Attachment Cleanup ${result.dryRun ? '(DRY RUN)' : '(CONFIRMED)'}\n`);
  console.log(`Mutation performed: ${result.mutationPerformed ? 'yes' : 'no'}`);
  console.log(`Grace hours: ${result.graceHours ?? '-'}`);

  if (result.skipped) {
    console.log(`Skipped: ${result.reason}`);
  }

  console.log(`Scanned: ${result.scanned || 0}`);
  console.log(`Orphan candidates: ${result.orphanCandidates || 0}`);
  console.log(`Deleted: ${result.deleted || 0}`);
  console.log(`Skipped records: ${result.skippedCount || result.skipped || 0}`);
  console.log(`Failed: ${result.failed || 0}`);

  if (result.dryRun) {
    console.log('\nNo files changed.');
    console.log('To delete orphan attachment files after review:');
    console.log('  node scripts/cleanup-attachments.js --confirm --json');
  } else {
    console.log('\n✅ Attachment cleanup complete');
  }

  console.log('');
}

async function main() {
  const graceHoursRaw = getArg('grace-hours', '');
  const graceHours = graceHoursRaw ? parseInt(graceHoursRaw, 10) : undefined;

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { cleanupOrphanAttachments } = await import('../server/services/workroomHygiene.js');

  const serviceResult = await cleanupOrphanAttachments({
    dryRun: DRY_RUN,
    graceHours,
  });

  const result = {
    ok: serviceResult.ok !== false,
    dryRun: DRY_RUN,
    confirm: CONFIRM,
    mutationPerformed: !DRY_RUN && (serviceResult.deleted || 0) > 0,
    script: 'scripts/cleanup-attachments.js',
    scope: 'workroom_orphan_attachments',
    ...serviceResult,
    skippedCount: typeof serviceResult.skipped === 'number' ? serviceResult.skipped : 0,
    warnings: [
      ...(serviceResult.warnings || []),
      ...(DRY_RUN ? ['Dry-run only. No attachment files were deleted.'] : []),
    ],
    confirmCommand: 'node scripts/cleanup-attachments.js --confirm --json',
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
    script: 'scripts/cleanup-attachments.js',
    error: err && err.message ? err.message : String(err),
    stack: err && err.stack ? err.stack : null,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) console.log(JSON.stringify(failure, null, 2));
  else {
    console.error('\n❌ Attachment cleanup failed:', failure.error);
    if (failure.stack) console.error(failure.stack);
  }

  process.exit(1);
});
