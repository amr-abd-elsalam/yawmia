#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/measure-storage-pressure.js — Storage Pressure Report (Phase 59)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/measure-storage-pressure.js
//   node scripts/measure-storage-pressure.js --json
//   node scripts/measure-storage-pressure.js --deep
//   node scripts/measure-storage-pressure.js --collection=jobs
//
// Default scan is shallow and persists a snapshot.
// --persist is accepted explicitly for runbook compatibility.
// --no-persist disables persistence.
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const JSON_OUT = process.argv.includes('--json');
const DEEP = process.argv.includes('--deep');
const PERSIST = process.argv.includes('--persist');
const NO_PERSIST = process.argv.includes('--no-persist') ? true : false;

function getArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

function printTopCollections(collections = {}) {
  const rows = Object.values(collections)
    .filter(c => c && c.collection)
    .sort((a, b) => (b.fileCount || 0) - (a.fileCount || 0))
    .slice(0, 10);

  if (rows.length === 0) {
    console.log('No collections scanned.');
    return;
  }

  for (const c of rows) {
    console.log(`  ${c.collection}: files=${c.fileCount || 0}, size=${c.totalSizeKB || 0}KB, largest=${c.largestJsonKB || 0}KB`);
  }
}

function printRecommendations(recommendations = []) {
  if (!recommendations.length) {
    console.log('  ✅ لا توجد إجراءات مقترحة حالياً');
    return;
  }

  for (const r of recommendations.slice(0, 10)) {
    const icon = r.severity === 'critical' ? '🚨' : r.severity === 'warning' ? '⚠️' : 'ℹ️';
    console.log(`  ${icon} ${r.label}`);
    if (r.command) console.log(`     ${r.command}`);
    if (r.reason) console.log(`     ${r.reason}`);
  }
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

  const { getStoragePressure } = await import('../server/services/storagePressure.js');

  const result = await getStoragePressure({
    force: true,
    persist: !NO_PERSIST,
    deep: DEEP,
    collection: collection || undefined,
  });

  if (JSON_OUT) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.log(JSON.stringify({
      ok: result.status !== 'critical',
      storagePressure: result,
    }, null, 2));
    return;
  }

  console.log('\n🧭 يوميّة Storage Pressure\n');
  console.log(`Snapshot: ${result.id || '-'}`);
  console.log(`Status: ${result.status || 'unknown'}`);
  console.log(`Mode: ${result.mode || 'shallow'}`);
  console.log(`Persisted: ${NO_PERSIST ? 'no' : 'yes'}`);
  console.log(`Scanned files: ${result.scannedFiles || 0}`);
  console.log(`Duration: ${result.durationMs || 0}ms`);

  if (collection) {
    console.log(`Collection: ${collection}`);
  }

  console.log('\n── Summary ──');
  const summary = result.summary || {};
  console.log(`Total files: ${summary.totalFiles || 0}`);
  console.log(`Total size: ${summary.totalSizeKB || 0} KB`);
  console.log(`Largest JSON: ${summary.largestJsonKB || 0} KB`);
  console.log(`Stale tmp files: ${summary.staleTmpCount || 0}`);

  console.log('\n── Top Collections ──');
  printTopCollections(result.collections || {});

  if (result.criticals && result.criticals.length > 0) {
    console.log('\n── Criticals ──');
    for (const c of result.criticals.slice(0, 20)) {
      console.log(`  ❌ ${c.code || 'CRITICAL'}: ${c.message || ''}`);
      if (c.recommendation) console.log(`     ${c.recommendation}`);
    }
  }

  if (result.warnings && result.warnings.length > 0) {
    console.log('\n── Warnings ──');
    for (const w of result.warnings.slice(0, 20)) {
      console.log(`  ⚠️ ${w.code || 'WARNING'}: ${w.message || ''}`);
      if (w.recommendation) console.log(`     ${w.recommendation}`);
    }
  }

  console.log('\n── Recommended Actions ──');
  printRecommendations(result.recommendations || []);

  console.log('\n✅ Storage pressure measurement complete\n');
}

main().catch(err => {
  if (JSON_OUT) {
    console.log(JSON.stringify({
      ok: false,
      error: err.message,
      generatedAt: new Date().toISOString(),
    }, null, 2));
  } else {
    console.error('\n❌ Storage pressure measurement failed:', err.message);
    if (err.stack) console.error(err.stack);
  }
  process.exit(1);
});
