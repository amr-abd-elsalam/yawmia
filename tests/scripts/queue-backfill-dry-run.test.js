// ═══════════════════════════════════════════════════════════════
// tests/scripts/queue-backfill-dry-run.test.js
// Patch 63 — Queue Backfill Dry-run Script Characterization
// ═══════════════════════════════════════════════════════════════
// Safety:
//   - temp data path only
//   - no ./data mutation
//   - no server.js import
//   - no queue worker execution
//   - no scheduler execution
//   - no DB writes
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const SCRIPT_PATH = resolve('scripts/queue-backfill-dry-run.js');

async function writeJson(filePath, data) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

async function writeText(filePath, text) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, text, 'utf-8');
}

async function snapshotDir(root) {
  const result = {};

  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }

    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const raw = await readFile(full);
        result[full.slice(root.length + 1).replace(/\\/g, '/')] = raw.toString('utf-8');
      }
    }
  }

  await walk(root);
  return result;
}

function runScript(args, options = {}) {
  const proc = spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      ...(options.env || {}),
    },
  });

  let parsed = null;
  try {
    parsed = JSON.parse(proc.stdout);
  } catch (_) {}

  return {
    status: proc.status,
    stdout: proc.stdout,
    stderr: proc.stderr,
    parsed,
  };
}

async function createTempDataPath() {
  return await mkdtemp(join(tmpdir(), 'yawmia-queue-backfill-dry-run-'));
}

function baseJob(patch = {}) {
  const now = new Date().toISOString();
  return {
    id: patch.id || 'q_test',
    type: patch.type || 'audit_csv_export',
    status: patch.status || 'pending',
    priority: patch.priority || 'normal',
    priorityWeight: patch.priorityWeight || 50,
    payload: patch.payload || { exportId: 'exp_test' },
    idempotencyKey: patch.idempotencyKey || null,
    attempts: patch.attempts || 0,
    maxAttempts: patch.maxAttempts || 5,
    backoffMs: patch.backoffMs || 30000,
    nextRunAt: patch.nextRunAt || now,
    leaseUntil: patch.leaseUntil || null,
    lockedBy: patch.lockedBy || null,
    lastError: patch.lastError || null,
    result: patch.result || null,
    cancelRequested: patch.cancelRequested || false,
    createdBy: patch.createdBy || 'test',
    createdAt: patch.createdAt || now,
    updatedAt: patch.updatedAt || now,
    startedAt: patch.startedAt || null,
    completedAt: patch.completedAt || null,
    failedAt: patch.failedAt || null,
    deadLetteredAt: patch.deadLetteredAt || null,
    cancelledAt: patch.cancelledAt || null,
  };
}

test('queue backfill dry-run rejects forbidden mutation flags', async () => {
  const basePath = await createTempDataPath();

  const result = runScript([
    '--json',
    '--base-path',
    basePath,
    '--confirm',
  ]);

  assert.equal(result.status, 2);
  assert.ok(result.parsed);
  assert.equal(result.parsed.ok, false);
  assert.equal(result.parsed.mutationPerformed, false);
  assert.equal(result.parsed.code, 'FORBIDDEN_MUTATION_FLAG');
  assert.deepEqual(result.parsed.forbiddenFlags, ['--confirm']);
});

test('queue backfill dry-run returns stable empty report shape', async () => {
  const basePath = await createTempDataPath();

  const result = runScript([
    '--json',
    '--base-path',
    basePath,
  ]);

  assert.equal(result.status, 0);
  assert.ok(result.parsed);

  const report = result.parsed;

  assert.equal(report.ok, true);
  assert.equal(report.mode, 'dry-run');
  assert.equal(report.mutationPerformed, false);
  assert.equal(report.basePath, resolve(basePath));

  const requiredKeys = [
    'scannedFileCount',
    'scannedJobFileCount',
    'scannedIdempotencyFileCount',
    'validJobCount',
    'corruptJobCount',
    'duplicateJobIdCount',
    'statusCounts',
    'physicalStatusCounts',
    'typeCounts',
    'runningJobCount',
    'activeRunningJobCount',
    'staleRunningJobCount',
    'invalidRunningJobCount',
    'deadLetterCount',
    'idempotencyRecordCount',
    'validIdempotencyRecordCount',
    'orphanIdempotencyRecordCount',
    'duplicateIdempotencyKeyCount',
    'expiredIdempotencyRecordCount',
    'summary',
    'wouldInsertJobCount',
    'wouldInsertAttemptCount',
    'wouldInsertIdempotencyCount',
    'wouldSkipJobCount',
    'warnings',
    'errors',
    'recommendations',
  ];

  for (const key of requiredKeys) {
    assert.ok(key in report, `missing report key: ${key}`);
  }

  assert.equal(report.summary.summaryPresent, false);
  assert.equal(report.summary.summaryMismatchCount, 0);
});

test('queue backfill dry-run scans legacy, segmented, corrupt, running, idempotency, and summary drift without mutation', async () => {
  const basePath = await createTempDataPath();
  const now = Date.now();

  const future = new Date(now + 60 * 60 * 1000).toISOString();
  const past = new Date(now - 60 * 60 * 1000).toISOString();
  const oldUpdated = new Date(now - 60 * 60 * 1000).toISOString();

  await writeJson(join(basePath, 'ops_queue', 'q_legacy.json'), baseJob({
    id: 'q_legacy',
    status: 'pending',
    type: 'audit_csv_export',
    attempts: 1,
  }));

  await writeJson(join(basePath, 'ops_queue', 'pending', '2026-06', 'q_segmented.json'), baseJob({
    id: 'q_segmented',
    status: 'pending',
    type: 'counter_rebuild',
  }));

  await writeJson(join(basePath, 'ops_queue', 'q_duplicate.json'), baseJob({
    id: 'q_duplicate',
    status: 'pending',
    type: 'audit_csv_export',
    updatedAt: '2026-06-01T00:00:00.000Z',
  }));

  await writeJson(join(basePath, 'ops_queue', 'completed', '2026-06', 'q_duplicate.json'), baseJob({
    id: 'q_duplicate',
    status: 'completed',
    type: 'audit_csv_export',
    updatedAt: '2026-06-02T00:00:00.000Z',
    completedAt: '2026-06-02T00:00:00.000Z',
  }));

  await writeJson(join(basePath, 'ops_queue', 'running', '2026-06', 'q_active.json'), baseJob({
    id: 'q_active',
    status: 'running',
    type: 'counter_compaction',
    leaseUntil: future,
    lockedBy: 'worker_a',
    updatedAt: new Date(now).toISOString(),
  }));

  await writeJson(join(basePath, 'ops_queue', 'running', '2026-06', 'q_stale.json'), baseJob({
    id: 'q_stale',
    status: 'running',
    type: 'counter_compaction',
    leaseUntil: past,
    lockedBy: 'worker_b',
    updatedAt: oldUpdated,
  }));

  await writeJson(join(basePath, 'ops_queue', 'running', '2026-06', 'q_invalid_running.json'), baseJob({
    id: 'q_invalid_running',
    status: 'running',
    type: 'counter_compaction',
    leaseUntil: null,
    lockedBy: null,
  }));

  await writeJson(join(basePath, 'ops_queue', 'failed', '2026-06', 'q_unknown_type.json'), baseJob({
    id: 'q_unknown_type',
    status: 'failed',
    type: 'unknown_future_handler',
  }));

  await writeJson(join(basePath, 'ops_queue', 'failed', '2026-06', 'q_unknown_status.json'), baseJob({
    id: 'q_unknown_status',
    status: 'paused',
    type: 'audit_csv_export',
  }));

  await writeJson(join(basePath, 'ops_queue', 'pending', '2026-06', 'q_oversized.json'), baseJob({
    id: 'q_oversized',
    status: 'pending',
    type: 'audit_csv_export',
    payload: { text: 'x'.repeat(300 * 1024) },
  }));

  await writeJson(join(basePath, 'ops_queue', 'dead-letter', 'q_dlq_legacy.json'), baseJob({
    id: 'q_dlq_legacy',
    status: 'dead-letter',
    type: 'audit_csv_export',
    deadLetteredAt: new Date(now).toISOString(),
  }));

  await writeJson(join(basePath, 'ops_queue', 'dead-letter', '2026-06', 'q_dlq_segmented.json'), baseJob({
    id: 'q_dlq_segmented',
    status: 'dead-letter',
    type: 'audit_csv_export',
    deadLetteredAt: new Date(now).toISOString(),
  }));

  await writeText(
    join(basePath, 'ops_queue', 'pending', '2026-06', 'q_corrupt.json'),
    '{ not valid json'
  );

  await writeJson(join(basePath, 'ops_queue', 'idempotency', 'idem_valid.json'), {
    keyHash: 'hash_valid',
    idempotencyKey: 'valid-key',
    jobId: 'q_segmented',
    createdAt: new Date(now).toISOString(),
    expiresAt: future,
  });

  await writeJson(join(basePath, 'ops_queue', 'idempotency', 'idem_orphan.json'), {
    keyHash: 'hash_orphan',
    idempotencyKey: 'orphan-key',
    jobId: 'q_missing',
    createdAt: new Date(now).toISOString(),
    expiresAt: future,
  });

  await writeJson(join(basePath, 'ops_queue', 'idempotency', 'idem_expired.json'), {
    keyHash: 'hash_expired',
    idempotencyKey: 'expired-key',
    jobId: 'q_legacy',
    createdAt: past,
    expiresAt: past,
  });

  await writeJson(join(basePath, 'ops_queue', 'idempotency', 'idem_dup_a.json'), {
    keyHash: 'hash_dup_a',
    idempotencyKey: 'duplicate-key',
    jobId: 'q_legacy',
    createdAt: new Date(now).toISOString(),
    expiresAt: future,
  });

  await writeJson(join(basePath, 'ops_queue', 'idempotency', 'idem_dup_b.json'), {
    keyHash: 'hash_dup_b',
    idempotencyKey: 'duplicate-key',
    jobId: 'q_segmented',
    createdAt: new Date(now).toISOString(),
    expiresAt: future,
  });

  await writeJson(join(basePath, 'metrics', 'queue', 'summary.json'), {
    version: 1,
    stale: false,
    byStatus: {
      pending: 999,
      running: 999,
    },
    byType: {},
    locations: {
      q_segmented: {
        jobId: 'q_segmented',
        status: 'running',
        path: 'ops_queue/pending/2026-06/q_segmented.json',
      },
      q_missing_summary: {
        jobId: 'q_missing_summary',
        status: 'pending',
        path: 'ops_queue/pending/2026-06/q_missing_summary.json',
      },
    },
  });

  const before = await snapshotDir(basePath);

  const result = runScript([
    '--json',
    '--include-previews',
    '--max-preview',
    '50',
    '--base-path',
    basePath,
  ]);

  const after = await snapshotDir(basePath);

  assert.equal(result.status, 1);
  assert.ok(result.parsed);

  const report = result.parsed;

  assert.equal(report.mode, 'dry-run');
  assert.equal(report.mutationPerformed, false);
  assert.deepEqual(after, before, 'dry-run must not mutate source files');

  assert.equal(report.scannedJobFileCount, 13);
  assert.equal(report.scannedIdempotencyFileCount, 5);
  assert.equal(report.corruptJobCount, 1);
  assert.equal(report.duplicateJobIdCount, 1);

  assert.equal(report.runningJobCount, 3);
  assert.equal(report.activeRunningJobCount, 1);
  assert.equal(report.staleRunningJobCount, 1);
  assert.equal(report.invalidRunningJobCount, 1);
  assert.equal(report.skippedActiveRunningCount, 1);

  assert.equal(report.deadLetterCount, 2);
  assert.equal(report.unknownTypeCount, 1);
  assert.equal(report.unknownStatusCount, 1);
  assert.equal(report.oversizedPayloadCount, 1);

  assert.equal(report.idempotencyRecordCount, 5);
  assert.equal(report.validIdempotencyRecordCount, 5);
  assert.equal(report.orphanIdempotencyRecordCount, 1);
  assert.equal(report.duplicateIdempotencyKeyCount, 1);
  assert.equal(report.expiredIdempotencyRecordCount, 1);

  assert.equal(report.summary.summaryPresent, true);
  assert.equal(report.summary.summaryStale, true);
  assert.ok(report.summary.summaryMismatchCount >= 1);

  assert.ok(report.wouldInsertJobCount >= 1);
  assert.ok(report.wouldSkipJobCount >= 1);
  assert.ok(report.wouldInsertAttemptCount >= 1);
  assert.ok(report.wouldInsertIdempotencyCount >= 1);

  assert.ok(Array.isArray(report.errors));
  assert.ok(Array.isArray(report.warnings));
  assert.ok(Array.isArray(report.recommendations));

  assert.ok(report.previews);
  assert.ok(report.previews.corruptFiles.length >= 1);
  assert.ok(report.previews.duplicateJobIds.length >= 1);
  assert.ok(report.previews.activeRunningJobs.length >= 1);
  assert.ok(report.previews.staleRunningJobs.length >= 1);
  assert.ok(report.previews.orphanIdempotencyRecords.length >= 1);
  assert.ok(report.previews.duplicateIdempotencyKeys.length >= 1);
  assert.ok(report.previews.summaryMismatches.length >= 1);
});

test('queue backfill dry-run source remains runtime-neutral and does not import queue workers or schedulers', async () => {
  const source = await readFile(SCRIPT_PATH, 'utf-8');

  const forbiddenSnippets = [
    '../server.js',
    '../server/router.js',
    '../server/services/queueWorkers.js',
    '../server/services/schedulerRegistry.js',
    '../server/services/opsQueue.js',
    '../server/services/queueStorageIndex.js',
    '../server/services/database.js',
    '../server/services/processLock.js',
    '../server/services/resourceLock.js',
    'startQueueWorkers',
    'processDueJobs',
    'claimNextJobs',
    'repairQueueStorage',
    'compactQueue',
    'recoverStaleRunningJobs',
    'enqueueJob',
    'completeJob(',
    'failJob(',
    'cancelJob(',
    'retryJob(',
    'atomicWrite',
    'writeFile(',
    'appendFile',
    'unlink(',
    'rm(',
    'rename(',
    'mkdir(',
  ];

  for (const snippet of forbiddenSnippets) {
    assert.equal(
      source.includes(snippet),
      false,
      `dry-run script must not include runtime/mutation snippet: ${snippet}`
    );
  }

  assert.equal(source.includes('FORBIDDEN_MUTATION_FLAG'), true);
  assert.equal(source.includes('--confirm'), true);
  assert.equal(source.includes('mutationPerformed: false'), true);
});

test('queue backfill dry-run supports bounded previews', async () => {
  const basePath = await createTempDataPath();

  await writeText(join(basePath, 'ops_queue', 'pending', '2026-06', 'q_bad_a.json'), '{ bad a');
  await writeText(join(basePath, 'ops_queue', 'pending', '2026-06', 'q_bad_b.json'), '{ bad b');
  await writeText(join(basePath, 'ops_queue', 'pending', '2026-06', 'q_bad_c.json'), '{ bad c');

  const result = runScript([
    '--json',
    '--include-previews',
    '--max-preview=2',
    '--base-path',
    basePath,
  ]);

  assert.equal(result.status, 1);
  assert.ok(result.parsed);
  assert.equal(result.parsed.corruptJobCount, 3);
  assert.ok(result.parsed.previews);
  assert.equal(result.parsed.previews.corruptFiles.length, 2);
});

test('queue backfill dry-run honors YAWMIA_DATA_PATH when base path is not passed', async () => {
  const basePath = await createTempDataPath();

  await writeJson(join(basePath, 'ops_queue', 'q_env_path.json'), baseJob({
    id: 'q_env_path',
    status: 'pending',
    type: 'audit_csv_export',
  }));

  const result = runScript([
    '--json',
  ], {
    env: {
      YAWMIA_DATA_PATH: basePath,
    },
  });

  assert.equal(result.status, 0);
  assert.ok(result.parsed);
  assert.equal(result.parsed.basePath, resolve(basePath));
  assert.equal(result.parsed.validJobCount, 1);
  assert.equal(result.parsed.wouldInsertJobCount, 1);
});
