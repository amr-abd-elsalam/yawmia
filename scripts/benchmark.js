#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/benchmark.js — يوميّة: Performance Benchmark
// ═══════════════════════════════════════════════════════════════
// Usage: node scripts/benchmark.js
// Measures response times for key API endpoints
// Server must be running on PORT 3002 (or set PORT env)
// ═══════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3002;
const BASE = `http://localhost:${PORT}`;

async function measure(label, fn, iterations = 10) {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((s, t) => s + t, 0) / times.length;
  const p50 = times[Math.floor(times.length * 0.5)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const min = times[0];
  const max = times[times.length - 1];
  console.log(`  ${label}: avg=${avg.toFixed(1)}ms  p50=${p50.toFixed(1)}ms  p95=${p95.toFixed(1)}ms  min=${min.toFixed(1)}ms  max=${max.toFixed(1)}ms`);
}

async function main() {
  console.log(`\n📊 يوميّة Performance Benchmark`);
  console.log(`   Target: ${BASE}\n`);

  // Check server is running
  try {
    const res = await fetch(`${BASE}/api/health`);
    const data = await res.json();
    console.log(`   Server: ${data.status} (v${data.version})\n`);
  } catch {
    console.error(`❌ Server not reachable at ${BASE}`);
    console.error(`   Start server first: npm start`);
    process.exit(1);
  }

  console.log('── Health Endpoint ──');
  await measure('GET /api/health', () => fetch(`${BASE}/api/health`));

  console.log('── Config Endpoint ──');
  await measure('GET /api/config', () => fetch(`${BASE}/api/config`));

  console.log('── Job Listing ──');
  await measure('GET /api/jobs', () => fetch(`${BASE}/api/jobs`));
  await measure('GET /api/jobs?governorate=cairo', () => fetch(`${BASE}/api/jobs?governorate=cairo`));

  console.log('── Concurrent Requests ──');
  await measure('10 parallel /api/health', async () => {
    await Promise.all(Array.from({ length: 10 }, () => fetch(`${BASE}/api/health`)));
  }, 5);

  await measure('10 parallel /api/jobs', async () => {
    await Promise.all(Array.from({ length: 10 }, () => fetch(`${BASE}/api/jobs`)));
  }, 5);

  console.log('\n✅ Benchmark complete\n');
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
