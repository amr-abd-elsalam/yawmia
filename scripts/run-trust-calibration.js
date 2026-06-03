#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/run-trust-calibration.js — Trust Calibration CLI (Phase 53/61.4)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/run-trust-calibration.js --snapshots --dry-run --json [--role=worker] [--limit=100] [--force]
//   node scripts/run-trust-calibration.js --snapshots --confirm --json [--role=worker] [--limit=100] [--force]
//   node scripts/run-trust-calibration.js --report --dry-run --json [--from=ISO] [--to=ISO] [--role=worker]
//   node scripts/run-trust-calibration.js --report --confirm --json [--from=ISO] [--to=ISO] [--role=worker]
//
// Safety:
//   - Default is dry-run.
//   - Mutation/persist requires --confirm.
//   - --json emits machine-readable output.
//   - Confirmed mode writes trust calibration snapshot/report artifacts.
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const CONFIRM = process.argv.includes('--confirm');
const DRY_RUN = process.argv.includes('--dry-run') || !CONFIRM;
const JSON_OUT = process.argv.includes('--json');

function getArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

function printJson(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function buildConfirmCommand({ runSnapshots, runReport, role, limit, force, from, to }) {
  const parts = ['node scripts/run-trust-calibration.js', '--confirm', '--json'];
  if (runSnapshots) parts.push('--snapshots');
  if (runReport) parts.push('--report');
  if (role) parts.push(`--role=${role}`);
  if (limit) parts.push(`--limit=${limit}`);
  if (force) parts.push('--force');
  if (from) parts.push(`--from=${from}`);
  if (to) parts.push(`--to=${to}`);
  return parts.join(' ');
}

async function main() {
  const started = Date.now();
  const runSnapshots = process.argv.includes('--snapshots');
  const runReport = process.argv.includes('--report');
  const force = process.argv.includes('--force');
  const role = getArg('role', '') || undefined;
  const limitRaw = getArg('limit', '');
  const limit = limitRaw ? parseInt(limitRaw) : undefined;
  const from = getArg('from', '') || undefined;
  const to = getArg('to', '') || undefined;

  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };

  if (JSON_OUT) {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  }

  if (!runSnapshots && !runReport) {
    const output = {
      ok: false,
      dryRun: DRY_RUN,
      confirm: CONFIRM,
      mutationPerformed: false,
      sourceDataMutated: false,
      code: 'MODE_REQUIRED',
      error: 'Choose --snapshots or --report',
      generatedAt: new Date().toISOString(),
    };

    if (JSON_OUT) {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      printJson(output);
    } else {
      console.error('❌ Choose --snapshots or --report');
    }

    process.exit(1);
  }

  const confirmCommand = buildConfirmCommand({
    runSnapshots,
    runReport,
    role,
    limit,
    force,
    from,
    to,
  });

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  if (DRY_RUN) {
    const output = {
      ok: true,
      dryRun: true,
      confirm: CONFIRM,
      mutationPerformed: false,
      sourceDataMutated: false,
      artifactMutated: false,
      mode: runSnapshots ? 'snapshots' : 'report',
      options: {
        role: role || null,
        limit: limit || null,
        force,
        from: from || null,
        to: to || null,
      },
      plannedAction: runSnapshots
        ? 'create Trust Score V2 snapshots for active users'
        : 'generate and persist trust calibration report',
      confirmCommand,
      warnings: [
        'dry-run does not create trust snapshots or reports',
        'confirmed mode writes trust calibration artifacts only',
        'source user/job/payment/message data remains unchanged',
      ],
      durationMs: Date.now() - started,
      completedAt: new Date().toISOString(),
    };

    if (JSON_OUT) {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      printJson(output);
    } else {
      console.log('\n🎯 يوميّة Trust Calibration CLI — DRY RUN\n');
      console.log(`   mode: ${output.mode}`);
      console.log('   mutationPerformed: false');
      console.log('\nTo run calibration:');
      console.log(`   ${confirmCommand}\n`);
    }

    return;
  }

  if (!JSON_OUT) {
    console.log('\n🎯 يوميّة Trust Calibration CLI — CONFIRMED\n');
  }

  const trustCalibration = await import('../server/services/trustCalibration.js');

  let result = null;

  if (runSnapshots) {
    result = await trustCalibration.createSnapshotsForActiveUsers({
      role,
      limit,
      force,
      reason: 'cli',
    });
  }

  if (runReport) {
    result = await trustCalibration.generateCalibrationReport({
      from,
      to,
      role,
      persist: true,
    });

    if (!result.ok) {
      const output = {
        ok: false,
        dryRun: false,
        confirm: true,
        mutationPerformed: false,
        sourceDataMutated: false,
        artifactMutated: false,
        mode: 'report',
        error: result.error || result.code,
        result,
        durationMs: Date.now() - started,
        completedAt: new Date().toISOString(),
      };

      if (JSON_OUT) {
        console.log = originalConsole.log;
        console.warn = originalConsole.warn;
        console.error = originalConsole.error;
        printJson(output);
      } else {
        console.error('❌ Report failed:', result.error || result.code);
      }

      process.exit(1);
    }
  }

  const output = {
    ok: true,
    dryRun: false,
    confirm: true,
    mutationPerformed: true,
    sourceDataMutated: false,
    artifactMutated: true,
    mode: runSnapshots ? 'snapshots' : 'report',
    result,
    durationMs: Date.now() - started,
    completedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    printJson(output);
    return;
  }

  if (runSnapshots) {
    console.log('\n✅ Snapshot batch complete');
    console.log(`   scanned: ${result.scanned || 0}`);
    console.log(`   created: ${result.created || 0}`);
    console.log(`   deduped: ${result.deduped || 0}`);
    console.log(`   failed: ${result.failed || 0}`);
    console.log(`   duration: ${result.durationMs || 0}ms\n`);
  }

  if (runReport) {
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
  const payload = {
    ok: false,
    dryRun: DRY_RUN,
    confirm: CONFIRM,
    mutationPerformed: false,
    sourceDataMutated: false,
    artifactMutated: false,
    error: err.message,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    printJson(payload);
  } else {
    console.error('\n❌ Trust calibration CLI failed:', err.message);
    if (err.stack) console.error(err.stack);
  }

  process.exit(1);
});
