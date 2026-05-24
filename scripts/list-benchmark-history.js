#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/list-benchmark-history.js — Phase 60 Benchmark History
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

function parseArgs(argv) {
  const args = { limit: 20 };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('--limit=')) args.limit = parseInt(arg.slice('--limit='.length)) || 20;
  }
  return args;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/list-benchmark-history.js
  node scripts/list-benchmark-history.js --json
  node scripts/list-benchmark-history.js --limit=50
`);
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

try {
  const { listBenchmarkResults, getLatestBenchmarkResult } = await import('../server/services/benchmarkHistory.js');
  const [list, latest] = await Promise.all([
    listBenchmarkResults({ limit: args.limit, offset: 0 }),
    getLatestBenchmarkResult(),
  ]);

  const output = {
    ok: true,
    latest,
    ...list,
  };

  if (args.json) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`Benchmarks: ${output.total}`);
    if (latest) {
      console.log(`Latest: ${latest.id} — ${latest.status} — ${latest.timestamp}`);
    }
    for (const b of output.benchmarks || []) {
      console.log(`- ${b.id} | ${b.status} | warnings=${b.summary?.warningCount || 0} criticals=${b.summary?.criticalCount || 0}`);
    }
  }

  process.exit(0);
} catch (err) {
  const out = { ok: false, error: err.message };
  if (args.json) console.log(JSON.stringify(out, null, 2));
  else console.error(err);
  process.exit(1);
}
