#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/verify-scale-thresholds.js — Scale Threshold Verification (Phase 59)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/verify-scale-thresholds.js
//   node scripts/verify-scale-thresholds.js --json
//   node scripts/verify-scale-thresholds.js --strict
//   node scripts/verify-scale-thresholds.js --fail-on-warning
//   node scripts/verify-scale-thresholds.js --deep
//   node scripts/verify-scale-thresholds.js --latest-only
//
// Default scan is shallow. Deep scan requires --deep.
// Phase 61.1: --latest-only reads persisted artifacts only and never scans.
// Exits 1 on critical in --strict mode, or on warning with --fail-on-warning.
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const JSON_OUT = process.argv.includes('--json');
const STRICT = process.argv.includes('--strict');
const FAIL_ON_WARNING = process.argv.includes('--fail-on-warning');
const DEEP = process.argv.includes('--deep');
const LATEST_ONLY = process.argv.includes('--latest-only');

function getArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

async function main() {
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

  const collection = getArg('collection', '');

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const storagePressure = await import('../server/services/storagePressure.js');
  const { verifyScaleThresholds } = await import('../server/services/scaleThresholds.js');

  let pressureSnapshot = null;

  if (LATEST_ONLY) {
    pressureSnapshot = storagePressure.getLatestStoragePressureSnapshot
      ? await storagePressure.getLatestStoragePressureSnapshot().catch(() => null)
      : null;
  } else {
    pressureSnapshot = await storagePressure.getStoragePressure({
      force: true,
      persist: false,
      deep: DEEP,
      collection: collection || undefined,
    });
  }

  const verification = await verifyScaleThresholds({
    pressureSnapshot,
    persist: false,
    deep: DEEP,
    latestOnly: LATEST_ONLY,
  });

  const warningCount = Array.isArray(verification.warnings) ? verification.warnings.length : 0;
  const criticalCount = Array.isArray(verification.criticals) ? verification.criticals.length : 0;

  const result = {
    ok: criticalCount === 0 && (!FAIL_ON_WARNING || warningCount === 0) && (!STRICT || criticalCount === 0),
    status: verification.status || 'ok',
    strict: STRICT,
    failOnWarning: FAIL_ON_WARNING,
    deep: DEEP,
    latestOnly: LATEST_ONLY,
    collection: collection || null,
    generatedAt: new Date().toISOString(),
    summary: {
      warnings: warningCount,
      criticals: criticalCount,
      recommendations: Array.isArray(verification.recommendations) ? verification.recommendations.length : 0,
      scannedFiles: pressureSnapshot ? (pressureSnapshot.scannedFiles || 0) : 0,
      scanMode: LATEST_ONLY ? 'latest-only' : (pressureSnapshot ? (pressureSnapshot.mode || 'shallow') : 'unavailable'),
      scanDurationMs: LATEST_ONLY ? 0 : (pressureSnapshot ? (pressureSnapshot.durationMs || 0) : 0),
    },
    warnings: verification.warnings || [],
    criticals: verification.criticals || [],
    recommendations: verification.recommendations || [],
    snapshot: pressureSnapshot ? {
      id: pressureSnapshot.id || null,
      timestamp: pressureSnapshot.timestamp || null,
      status: pressureSnapshot.status || null,
      mode: LATEST_ONLY ? 'latest-only' : (pressureSnapshot.mode || 'shallow'),
      truncated: !!pressureSnapshot.truncated,
      scannedFiles: pressureSnapshot.scannedFiles || 0,
      durationMs: LATEST_ONLY ? 0 : (pressureSnapshot.durationMs || 0),
    } : null,
  };

  if (JSON_OUT) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('\n📏 يوميّة Scale Threshold Verification\n');
    console.log(`Status: ${result.status}`);
    console.log(`Strict: ${STRICT ? 'yes' : 'no'}`);
    console.log(`Fail on warning: ${FAIL_ON_WARNING ? 'yes' : 'no'}`);
    console.log(`Scan mode: ${result.summary.scanMode}`);
    console.log(`Latest only: ${LATEST_ONLY ? 'yes' : 'no'}`);
    console.log(`Scanned files: ${result.summary.scannedFiles}`);
    console.log(`Warnings: ${warningCount}`);
    console.log(`Criticals: ${criticalCount}\n`);

    if (criticalCount > 0) {
      console.log('── Criticals ──');
      for (const c of result.criticals.slice(0, 20)) {
        console.log(`❌ ${c.code || 'CRITICAL'}: ${c.message || ''}`);
        if (c.recommendation) console.log(`   → ${c.recommendation}`);
      }
      console.log('');
    }

    if (warningCount > 0) {
      console.log('── Warnings ──');
      for (const w of result.warnings.slice(0, 20)) {
        console.log(`⚠️ ${w.code || 'WARNING'}: ${w.message || ''}`);
        if (w.recommendation) console.log(`   → ${w.recommendation}`);
      }
      console.log('');
    }

    if (result.recommendations.length > 0) {
      console.log('── Recommended Actions ──');
      for (const action of result.recommendations.slice(0, 10)) {
        console.log(`• ${action.label}`);
        if (action.command) console.log(`  ${action.command}`);
        if (action.reason) console.log(`  ${action.reason}`);
      }
      console.log('');
    }

    console.log(result.ok ? '✅ Scale thresholds acceptable\n' : '❌ Scale thresholds require action\n');
  }

  if (!result.ok) process.exit(1);
}

main().catch(err => {
  const payload = {
    ok: false,
    status: 'critical',
    error: err.message,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.error('\n❌ Scale threshold verification failed:', err.message);
    if (err.stack) console.error(err.stack);
  }

  process.exit(1);
});
