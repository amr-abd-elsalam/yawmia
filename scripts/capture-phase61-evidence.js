#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/capture-phase61-evidence.js — Phase 61 Evidence Cadence
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg === '--persist') args.persist = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/capture-phase61-evidence.js
  node scripts/capture-phase61-evidence.js --json
  node scripts/capture-phase61-evidence.js --persist
  node scripts/capture-phase61-evidence.js --json --persist

Reads latest persisted evidence only.
Does not run benchmarks.
Does not run storage pressure scans.
Does not mutate source data.
`);
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

try {
  const originalConsole = { log: console.log, warn: console.warn, error: console.error };
  if (args.json) {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  }

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const service = await import('../server/services/phase61EvidenceCadence.js');

  const result = args.persist
    ? await service.captureEvidenceCadenceSnapshot()
    : { ok: true, evidence: await service.getEvidenceCadenceStatus() };

  if (args.json) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.log(JSON.stringify(result, null, 2));
  } else {
    const evidence = result.evidence || result.report || {};
    console.log('\n📊 Phase 61 Evidence Cadence\n');
    console.log(`Status: ${evidence.status || 'unknown'}`);
    console.log(`Warnings: ${(evidence.warnings || []).length}`);
    console.log(`Blockers: ${(evidence.blockers || []).length}`);
    if (result.evidence && result.evidence.id) console.log(`Snapshot: ${result.evidence.id}`);

    const benchmark = evidence.latest && evidence.latest.benchmark;
    if (benchmark && benchmark.evidenceUsable === false) {
      console.log('Benchmark evidence usable: no');
      if (benchmark.corruptionSuspected) console.log('Benchmark note: JSON corruption suspected');
    }
    console.log('\nRecommendations:');
    for (const r of evidence.recommendations || []) {
      console.log(`- ${r.label}${r.command ? ` → ${r.command}` : ''}`);
    }
    console.log('');
  }

  process.exit(result.ok ? 0 : 1);
} catch (err) {
  const out = {
    ok: false,
    error: err.message,
    generatedAt: new Date().toISOString(),
  };
  if (args.json) console.log(JSON.stringify(out, null, 2));
  else console.error(err);
  process.exit(1);
}
