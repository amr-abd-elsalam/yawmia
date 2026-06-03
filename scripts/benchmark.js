#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/benchmark.js — يوميّة: Performance Benchmark
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/benchmark.js
//   node scripts/benchmark.js --json
//   node scripts/benchmark.js --iterations=10
//   node scripts/benchmark.js --base=http://localhost:3002
//
// Measures response times for key API endpoints.
// Server must be running on PORT 3002, or set PORT / --base.
// Read-only: does not mutate source data.
// ═══════════════════════════════════════════════════════════════

const JSON_OUT = process.argv.includes('--json');
const RUN_AUDIT_INDEX_BENCH = process.argv.includes('--audit-index');

function getArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

function getIntArg(name, fallback, max) {
  const raw = getArg(name, '');
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}

const PORT = process.env.PORT || 3002;
const BASE = getArg('base', '') || `http://localhost:${PORT}`;
const ITERATIONS = getIntArg('iterations', 10, 100);

function printJson(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

async function measure(label, fn, iterations = ITERATIONS) {
  const times = [];
  let ok = true;
  let error = null;

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    try {
      await fn();
      times.push(performance.now() - start);
    } catch (err) {
      ok = false;
      error = err.message;
      times.push(performance.now() - start);
    }
  }

  times.sort((a, b) => a - b);

  const avg = times.reduce((s, t) => s + t, 0) / times.length;
  const p50 = times[Math.floor(times.length * 0.5)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const min = times[0];
  const max = times[times.length - 1];

  const row = {
    label,
    ok,
    error,
    iterations,
    avgMs: Number(avg.toFixed(1)),
    p50Ms: Number(p50.toFixed(1)),
    p95Ms: Number(p95.toFixed(1)),
    minMs: Number(min.toFixed(1)),
    maxMs: Number(max.toFixed(1)),
  };

  if (!JSON_OUT) {
    console.log(`  ${label}: avg=${row.avgMs}ms  p50=${row.p50Ms}ms  p95=${row.p95Ms}ms  min=${row.minMs}ms  max=${row.maxMs}ms`);
  }

  return row;
}

async function main() {
  const started = Date.now();
  const results = [];
  let server = null;

  if (!JSON_OUT) {
    console.log(`\n📊 يوميّة Performance Benchmark`);
    console.log(`   Target: ${BASE}\n`);
  }

  // Check server is running
  try {
    const res = await fetch(`${BASE}/api/health`);
    server = await res.json();

    if (!JSON_OUT) {
      console.log(`   Server: ${server.status} (v${server.version})\n`);
    }
  } catch (err) {
    const output = {
      ok: false,
      dryRun: true,
      mutationPerformed: false,
      sourceDataMutated: false,
      target: BASE,
      error: `Server not reachable at ${BASE}`,
      hint: 'Start server first: npm start',
      generatedAt: new Date().toISOString(),
    };

    if (JSON_OUT) printJson(output);
    else {
      console.error(`❌ Server not reachable at ${BASE}`);
      console.error(`   Start server first: npm start`);
    }

    process.exit(1);
  }

  if (!JSON_OUT) console.log('── Health Endpoint ──');
  results.push(await measure('GET /api/health', () => fetch(`${BASE}/api/health`)));

  if (!JSON_OUT) console.log('── Config Endpoint ──');
  results.push(await measure('GET /api/config', () => fetch(`${BASE}/api/config`)));

  if (!JSON_OUT) console.log('── Job Listing ──');
  results.push(await measure('GET /api/jobs', () => fetch(`${BASE}/api/jobs`)));
  results.push(await measure('GET /api/jobs?governorate=cairo', () => fetch(`${BASE}/api/jobs?governorate=cairo`)));

  if (!JSON_OUT) console.log('── Concurrent Requests ──');
  results.push(await measure('10 parallel /api/health', async () => {
    await Promise.all(Array.from({ length: 10 }, () => fetch(`${BASE}/api/health`)));
  }, Math.min(ITERATIONS, 10)));

  results.push(await measure('10 parallel /api/jobs', async () => {
    await Promise.all(Array.from({ length: 10 }, () => fetch(`${BASE}/api/jobs`)));
  }, Math.min(ITERATIONS, 10)));

  if (RUN_AUDIT_INDEX_BENCH) {
    if (!JSON_OUT) console.log('── Phase 50 Audit Index Admin Search ──');

    const token = process.env.ADMIN_TOKEN;
    if (!token) {
      results.push({
        label: 'Phase 50 Audit Index Admin Search',
        ok: true,
        skipped: true,
        reason: 'ADMIN_TOKEN env required',
      });

      if (!JSON_OUT) {
        console.log('  Skipped: ADMIN_TOKEN env required');
      }
    } else {
      results.push(await measure('GET /api/admin/audit-log/search?action=user_banned', () =>
        fetch(`${BASE}/api/admin/audit-log/search?action=user_banned&limit=50`, {
          headers: { 'X-Admin-Token': token },
        })
      , Math.min(ITERATIONS, 10)));

      results.push(await measure('GET /api/admin/audit-index/status', () =>
        fetch(`${BASE}/api/admin/audit-index/status`, {
          headers: { 'X-Admin-Token': token },
        })
      , Math.min(ITERATIONS, 10)));
    }
  }

  const output = {
    ok: results.every(r => r.ok !== false),
    dryRun: true,
    mutationPerformed: false,
    sourceDataMutated: false,
    target: BASE,
    iterations: ITERATIONS,
    auditIndexBench: RUN_AUDIT_INDEX_BENCH,
    server,
    results,
    durationMs: Date.now() - started,
    completedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    printJson(output);
  } else {
    console.log('\n✅ Benchmark complete\n');
  }

  if (!output.ok) process.exit(1);
}

main().catch(err => {
  const output = {
    ok: false,
    dryRun: true,
    mutationPerformed: false,
    sourceDataMutated: false,
    error: err.message,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) printJson(output);
  else console.error('❌', err.message);

  process.exit(1);
});
