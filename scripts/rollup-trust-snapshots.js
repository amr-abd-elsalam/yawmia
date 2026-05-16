#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/rollup-trust-snapshots.js — Trust Rollup CLI (Phase 55)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/rollup-trust-snapshots.js [--month=YYYY-MM]
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

function getArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

async function main() {
  const month = getArg('month', '');

  console.log('\n🎯 يوميّة Trust Snapshot Rollup\n');

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { createTrustSnapshotRollup, cleanupOldTrustSnapshots, cleanupOldCalibrationReports } =
    await import('../server/services/trustSnapshotRollups.js');

  const rollup = await createTrustSnapshotRollup({ month: month || undefined });
  const snapshots = await cleanupOldTrustSnapshots();
  const reports = await cleanupOldCalibrationReports();

  if (rollup.skipped) {
    console.log(`⚠️ Skipped: ${rollup.reason}`);
    process.exit(0);
  }

  console.log('✅ Trust rollup complete');
  console.log(`   month: ${rollup.rollup?.month || month || 'current'}`);
  console.log(`   snapshots: ${rollup.rollup?.snapshotCount || 0}`);
  console.log(`   avgScore: ${rollup.rollup?.avgScore || 0}`);
  console.log(`   old snapshots cleaned: ${snapshots.cleaned || 0}`);
  console.log(`   old reports cleaned: ${reports.cleaned || 0}\n`);
}

main().catch(err => {
  console.error('\n❌ Trust rollup failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
