#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/benchmark-file-paths.js — File Path Benchmarks (Phase 59)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/benchmark-file-paths.js
//   node scripts/benchmark-file-paths.js --json
//   node scripts/benchmark-file-paths.js --sample=100
//   node scripts/benchmark-file-paths.js --include-heavy
//   node scripts/benchmark-file-paths.js --json --persist
//
// Default is read-only and avoids destructive operations.
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const JSON_OUT = process.argv.includes('--json');
const INCLUDE_HEAVY = process.argv.includes('--include-heavy');
const PERSIST = process.argv.includes('--persist');

function getArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

const SAMPLE = Math.max(1, Math.min(1000, parseInt(getArg('sample', '10')) || 10));

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return Math.round(sorted[idx] * 100) / 100;
}

function summarize(times) {
  if (!times.length) {
    return { count: 0, avgMs: 0, minMs: 0, maxMs: 0, p50Ms: 0, p95Ms: 0 };
  }

  const total = times.reduce((sum, x) => sum + x, 0);
  return {
    count: times.length,
    avgMs: Math.round((total / times.length) * 100) / 100,
    minMs: Math.round(Math.min(...times) * 100) / 100,
    maxMs: Math.round(Math.max(...times) * 100) / 100,
    p50Ms: percentile(times, 0.5),
    p95Ms: percentile(times, 0.95),
  };
}

async function bench(label, fn, iterations = SAMPLE) {
  const times = [];
  let skipped = false;
  let skipReason = null;
  let error = null;

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    try {
      const result = await fn(i);
      if (result && result.skipped) {
        skipped = true;
        skipReason = result.reason || 'skipped';
        break;
      }
      times.push(performance.now() - start);
    } catch (err) {
      error = err.message;
      break;
    }
  }

  return {
    label,
    skipped,
    skipReason,
    error,
    ...summarize(times),
  };
}

async function getFirstRecord(collection, prefix) {
  try {
    const { getCollectionPath, listJSON } = await import('../server/services/database.js');
    const rows = await listJSON(getCollectionPath(collection), {
      ...(prefix ? { prefix } : {}),
      tolerateCorrupt: true,
    });
    return rows.find(r => r && r.id) || null;
  } catch (_) {
    return null;
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

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const results = [];

  const firstUser = await getFirstRecord('users', 'usr_');
  const firstJob = await getFirstRecord('jobs', 'job_');
  const firstWorkroom = await getFirstRecord('workrooms', null);

  results.push(await bench('read user by id', async () => {
    if (!firstUser) return { skipped: true, reason: 'no users' };
    const { findById } = await import('../server/services/users.js');
    await findById(firstUser.id);
  }));

  results.push(await bench('read job by id', async () => {
    if (!firstJob) return { skipped: true, reason: 'no jobs' };
    const { findById } = await import('../server/services/jobs.js');
    await findById(firstJob.id);
  }));

  results.push(await bench('list jobs open', async () => {
    const { list } = await import('../server/services/jobs.js');
    await list({ status: 'open' });
  }, Math.max(1, Math.min(SAMPLE, 20))));

  results.push(await bench('query jobs index', async () => {
    try {
      const { queryJobs, getStats } = await import('../server/services/queryIndex.js');
      const stats = getStats();
      if (!stats || stats.totalJobs === 0) return { skipped: true, reason: 'query index empty' };
      queryJobs({ status: 'open' });
    } catch (_) {
      return { skipped: true, reason: 'query index unavailable' };
    }
  }));

  results.push(await bench('audit indexed search', async () => {
    const { searchActions } = await import('../server/services/auditLogSearch.js');
    await searchActions({ limit: 20 });
  }, Math.max(1, Math.min(SAMPLE, 20))));

  if (INCLUDE_HEAVY) {
    results.push(await bench('audit full fallback search', async () => {
      const mod = await import('../server/services/auditLogSearch.js');
      if (!mod._testHelpers || !mod._testHelpers.fullScanSearchActions) {
        return { skipped: true, reason: 'fallback helper unavailable' };
      }
      await mod._testHelpers.fullScanSearchActions({ limit: 20 });
    }, Math.max(1, Math.min(SAMPLE, 5))));
  }

  results.push(await bench('queue list pending', async () => {
    const { listJobs } = await import('../server/services/opsQueue.js');
    await listJobs({ status: 'pending', limit: 20 });
  }));

  results.push(await bench('queue stats', async () => {
    const { getQueueStats } = await import('../server/services/opsQueue.js');
    await getQueueStats();
  }));

  results.push(await bench('workroom search', async () => {
    if (!firstWorkroom || !firstWorkroom.jobId) return { skipped: true, reason: 'no workrooms' };
    try {
      const { searchWorkroomMessages } = await import('../server/services/workroomSearch.js');
      await searchWorkroomMessages(firstWorkroom.jobId, 'test', { limit: 20 });
    } catch (_) {
      return { skipped: true, reason: 'workroom search unavailable' };
    }
  }, Math.max(1, Math.min(SAMPLE, 10))));

  results.push(await bench('search relevance query', async () => {
    const { list } = await import('../server/services/jobs.js');
    await list({ status: 'open', search: 'عامل' });
  }, Math.max(1, Math.min(SAMPLE, 10))));

  results.push(await bench('export registry list', async () => {
    const { listExports } = await import('../server/services/exportRegistry.js');
    await listExports({ limit: 20 });
  }));

  results.push(await bench('privacy request list', async () => {
    try {
      const { listPrivacyRequests } = await import('../server/services/privacyRequests.js');
      await listPrivacyRequests({ limit: 20 });
    } catch (_) {
      return { skipped: true, reason: 'privacy request service unavailable' };
    }
  }));

  results.push(await bench('admin approval list', async () => {
    const { listApprovals } = await import('../server/services/adminApprovals.js');
    await listApprovals({ limit: 20 });
  }));

  if (INCLUDE_HEAVY) {
    results.push(await bench('storage pressure shallow scan', async () => {
      const { getStoragePressure } = await import('../server/services/storagePressure.js');
      await getStoragePressure({ force: true, persist: false });
    }, Math.max(1, Math.min(SAMPLE, 3))));
  } else {
    results.push({
      label: 'storage pressure shallow scan',
      skipped: true,
      skipReason: 'heavy scan skipped by default; use --include-heavy',
      error: null,
      count: 0,
      avgMs: 0,
      minMs: 0,
      maxMs: 0,
      p50Ms: 0,
      p95Ms: 0,
    });
  }

  const warningThresholdMs = 1000;
  const criticalThresholdMs = 3000;
  const errorRows = results.filter(r => !!r.error);
  const warningRows = results.filter(r => !r.skipped && !r.error && (r.p95Ms || 0) >= warningThresholdMs && (r.p95Ms || 0) < criticalThresholdMs);
  const criticalRows = results.filter(r => !r.skipped && !r.error && (r.p95Ms || 0) >= criticalThresholdMs);
  const worst = results
    .filter(r => !r.skipped && !r.error)
    .sort((a, b) => (b.p95Ms || 0) - (a.p95Ms || 0))[0] || null;

  const corruptionSuspected = errorRows.some(r =>
    /json|unexpected token|\\u0000|nul|null byte|parse/i.test(String(r.error || ''))
  );

  const evidenceUsable = errorRows.length === 0 && !corruptionSuspected;

  const evidenceNotes = [];
  if (!evidenceUsable) {
    evidenceNotes.push('Benchmark contains errors; do not use as externalization evidence until data integrity is repaired.');
  }
  if (corruptionSuspected) {
    evidenceNotes.push('JSON corruption is suspected from benchmark errors.');
  }
  if (!INCLUDE_HEAVY) {
    evidenceNotes.push('Heavy storage pressure scan skipped by default. Use --include-heavy for manual/off-peak measurement.');
  }

  const output = {
    id: 'bmk_' + Date.now().toString(36),
    ok: errorRows.length === 0,
    evidenceUsable,
    corruptionSuspected,
    evidenceNotes,
    timestamp: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    version: '0.57.0',
    sample: SAMPLE,
    includeHeavy: INCLUDE_HEAVY,
    persisted: false,
    dataPath: process.env.YAWMIA_DATA_PATH || './data',
    summary: {
      p95WorstPath: worst ? worst.label : null,
      p95WorstMs: worst ? worst.p95Ms : 0,
      warningCount: warningRows.length,
      criticalCount: criticalRows.length,
      errorCount: errorRows.length,
      errorPaths: errorRows.map(r => r.label),
      evidenceUsable,
      corruptionSuspected,
    },
    results,
  };

  if (PERSIST) {
    try {
      const { persistBenchmarkResult } = await import('../server/services/benchmarkHistory.js');
      const persisted = await persistBenchmarkResult(output, { source: 'benchmark-file-paths' });
      output.persisted = !!(persisted && persisted.ok);
      output.persistedId = persisted && persisted.benchmark ? persisted.benchmark.id : null;
    } catch (err) {
      output.persisted = false;
      output.persistError = err.message;
      output.ok = false;
      output.evidenceUsable = false;
      output.evidenceNotes.push('Benchmark persistence failed; artifact should not be used as evidence.');
    }
  }

  if (JSON_OUT) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log('\n⏱ يوميّة File Path Benchmarks\n');
    console.log(`Sample: ${SAMPLE}`);
    console.log(`Include heavy: ${INCLUDE_HEAVY ? 'yes' : 'no'}`);
    console.log(`Persist: ${PERSIST ? 'yes' : 'no'}\n`);

    for (const r of results) {
      if (r.skipped) {
        console.log(`  ${r.label}: skipped (${r.skipReason})`);
      } else if (r.error) {
        console.log(`  ${r.label}: ERROR ${r.error}`);
      } else {
        console.log(`  ${r.label}: avg=${r.avgMs}ms p50=${r.p50Ms}ms p95=${r.p95Ms}ms min=${r.minMs}ms max=${r.maxMs}ms`);
      }
    }

    console.log('\nSummary:');
    console.log(`  Worst p95: ${output.summary.p95WorstPath || '-'} (${output.summary.p95WorstMs || 0}ms)`);
    console.log(`  Warnings: ${output.summary.warningCount}`);
    console.log(`  Criticals: ${output.summary.criticalCount}`);
    console.log(`  Errors: ${output.summary.errorCount}`);
    console.log(`  Evidence usable: ${output.evidenceUsable ? 'yes' : 'no'}`);
    if (output.evidenceNotes.length > 0) {
      console.log('  Evidence notes:');
      for (const note of output.evidenceNotes) console.log(`    - ${note}`);
    }
    if (PERSIST) console.log(`  Persisted: ${output.persisted ? output.persistedId : 'no'}`);

    console.log('\n✅ Benchmark complete\n');
  }

  if (!output.ok) process.exit(1);
}

main().catch(err => {
  const payload = {
    ok: false,
    error: err.message,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.error('\n❌ Benchmark failed:', err.message);
    if (err.stack) console.error(err.stack);
  }

  process.exit(1);
});
