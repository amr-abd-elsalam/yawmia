#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/run-trust-calibration.js — Trust Calibration CLI (Phase 53)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/run-trust-calibration.js --snapshots [--role=worker] [--limit=100] [--force]
//   node scripts/run-trust-calibration.js --report [--from=ISO] [--to=ISO] [--role=worker]
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
  const runSnapshots = process.argv.includes('--snapshots');
  const runReport = process.argv.includes('--report');
  const force = process.argv.includes('--force');

  console.log('\n🎯 يوميّة Trust Calibration CLI\n');

  if (!runSnapshots && !runReport) {
    console.error('❌ Choose --snapshots or --report');
    process.exit(1);
  }

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const trustCalibration = await import('../server/services/trustCalibration.js');

  if (runSnapshots) {
    const role = getArg('role', '');
    const limitRaw = getArg('limit', '');
    const limit = limitRaw ? parseInt(limitRaw) : undefined;

    console.log('   Running snapshot batch...');
    const result = await trustCalibration.createSnapshotsForActiveUsers({
      role: role || undefined,
      limit,
      force,
      reason: 'cli',
    });

    console.log('\n✅ Snapshot batch complete');
    console.log(`   scanned: ${result.scanned || 0}`);
    console.log(`   created: ${result.created || 0}`);
    console.log(`   deduped: ${result.deduped || 0}`);
    console.log(`   failed: ${result.failed || 0}`);
    console.log(`   duration: ${result.durationMs || 0}ms\n`);
  }

  if (runReport) {
    const from = getArg('from', '') || undefined;
    const to = getArg('to', '') || undefined;
    const role = getArg('role', '') || undefined;

    console.log('   Generating calibration report...');
    const result = await trustCalibration.generateCalibrationReport({
      from,
      to,
      role,
      persist: true,
    });

    if (!result.ok) {
      console.error('❌ Report failed:', result.error || result.code);
      process.exit(1);
    }

    const report = result.report;

    console.log('\n✅ Calibration report complete');
    console.log(`   reportId: ${report.id}`);
    console.log(`   samples: ${report.sampleCount}`);
    console.log(`   drift warnings: ${(report.driftWarnings || []).length}`);
    console.log(`   duration: ${report.durationMs || 0}ms\n`);

    if (report.driftWarnings && report.driftWarnings.length > 0) {
      console.log('⚠️ Drift warnings:');
      for (const w of report.driftWarnings.slice(0, 10)) {
        console.log(`   - ${w.label}: score=${w.avgScore}, success=${w.avgSuccessRate}, delta=${w.delta}`);
      }
      console.log('');
    }
  }
}

main().catch(err => {
  console.error('\n❌ Trust calibration CLI failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
