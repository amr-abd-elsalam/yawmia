// ═══════════════════════════════════════════════════════════════
// tests/scripts/benchmark-file-paths-evidence.test.js
// Patch 27 — Performance Evidence Under Larger File-backed Data
// ═══════════════════════════════════════════════════════════════
//
// Test-only confidence layer for file-backed performance evidence.
//
// Covers:
//   - benchmark-file-paths.js JSON evidence shape
//   - temp YAWMIA_DATA_PATH isolation
//   - larger temp file-backed seed
//   - job listing/search benchmark rows
//   - direct offer benchmark rows
//   - workroom/audit/queue benchmark smoke
//   - benchmark artifact persistence under temp data
//   - heavy storage pressure scan remains opt-in
//   - no externalization/pilot/runtime-switch approval from one benchmark
//
// Safety:
//   - temp YAWMIA_DATA_PATH only
//   - no real ./data mutation
//   - no server.js import
//   - no queue workers
//   - no schedulers
//   - no OTP weakening
//   - no external services
//   - no strict/flaky latency thresholds
//   - no dependencies
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execFileCb);

process.env.NODE_ENV = 'test';
process.env.ADMIN_TOKEN = 'test-admin-token';

const BENCHMARK_SCRIPT = fileURLToPath(
  new URL('../../scripts/benchmark-file-paths.js', import.meta.url)
);

async function setupTempDataPath(prefix = 'yawmia-benchmark-evidence-') {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  process.env.NODE_ENV = 'test';
  process.env.ADMIN_TOKEN = 'test-admin-token';
  process.env.YAWMIA_DATA_PATH = dir;
  return dir;
}

async function importFresh(path) {
  return await import(`${path}?t=${Date.now()}_${Math.random().toString(36).slice(2)}`);
}

function tomorrowDateString(offsetDays = 1) {
  return new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

async function seedBenchmarkData(tempDir) {
  process.env.NODE_ENV = 'test';
  process.env.ADMIN_TOKEN = 'test-admin-token';
  process.env.YAWMIA_DATA_PATH = tempDir;

  const database = await importFresh('../../server/services/database.js');
  await database.initDatabase();

  const users = await importFresh('../../server/services/users.js');
  const jobs = await importFresh('../../server/services/jobs.js');
  const applications = await importFresh('../../server/services/applications.js');
  const workroom = await importFresh('../../server/services/workroom.js');
  const directOffer = await importFresh('../../server/services/directOffer.js');
  const auditLog = await importFresh('../../server/services/auditLog.js');
  const opsQueue = await importFresh('../../server/services/opsQueue.js');

  const employers = [];
  const workers = [];

  for (let i = 0; i < 3; i++) {
    const user = await users.create(`01027${String(i).padStart(6, '0')}`, 'employer');
    const updated = await users.update(user.id, {
      name: `صاحب عمل Benchmark ${i}`,
      governorate: i % 2 === 0 ? 'cairo' : 'giza',
      lat: 30.0444 + i * 0.001,
      lng: 31.2357 + i * 0.001,
      termsAcceptedAt: new Date().toISOString(),
      termsVersion: '1.0',
      verificationStatus: 'verified',
    });
    employers.push(updated || user);
  }

  const categories = ['cleaning', 'construction', 'farming', 'loading'];

  for (let i = 0; i < 18; i++) {
    const user = await users.create(`01127${String(i).padStart(6, '0')}`, 'worker');
    const updated = await users.update(user.id, {
      name: `عامل Benchmark ${i}`,
      governorate: i % 2 === 0 ? 'cairo' : 'giza',
      categories: [categories[i % categories.length]],
      lat: 30.05 + i * 0.001,
      lng: 31.24 + i * 0.001,
      termsAcceptedAt: new Date().toISOString(),
      termsVersion: '1.0',
      verificationStatus: i % 3 === 0 ? 'verified' : 'unverified',
    });
    workers.push(updated || user);
  }

  const createdJobs = [];

  for (let i = 0; i < 50; i++) {
    const employer = employers[i % employers.length];
    const category = categories[i % categories.length];

    const job = await jobs.create(employer.id, {
      title: `فرصة Benchmark ${i} عامل ${category}`,
      category,
      governorate: i % 2 === 0 ? 'cairo' : 'giza',
      location: `موقع Benchmark ${i}`,
      area: `منطقة ${i}`,
      address: `عنوان Benchmark ${i}`,
      landmark: `علامة ${i}`,
      locationNotes: 'اتبع تعليمات الأمن عند الوصول',
      lat: 30.0444 + i * 0.0005,
      lng: 31.2357 + i * 0.0005,
      workersNeeded: 1,
      dailyWage: 200 + (i % 6) * 50,
      startDate: tomorrowDateString((i % 5) + 1),
      durationDays: 1 + (i % 3),
      description: `وصف فرصة Benchmark ${i} مع نص عربي قابل للبحث`,
      urgency: i % 10 === 0 ? 'urgent' : 'normal',
    });

    createdJobs.push(job);

    if (i < 14) {
      const worker = workers[i % workers.length];
      const app = await applications.apply(job.id, worker.id);
      assert.equal(app.ok, true, app.error || 'benchmark application should apply');

      const accepted = await applications.accept(app.application.id, employer.id);
      assert.equal(accepted.ok, true, accepted.error || 'benchmark application should accept');

      if (i < 10) {
        const started = await jobs.startJob(job.id, employer.id);
        assert.equal(started.ok, true, started.error || 'benchmark job should start');
      }

      if (i < 4) {
        const completed = await jobs.completeJob(job.id, employer.id);
        assert.equal(completed.ok, true, completed.error || 'benchmark job should complete');
      }
    }
  }

  const workroomJob = createdJobs.find(j => j.status === 'open') || createdJobs[0];
  const workroomEmployer = employers.find(e => e.id === workroomJob.employerId) || employers[0];
  const workroomWorker = workers[0];

  // Ensure a deterministic searchable workroom exists.
  const extraJob = await jobs.create(workroomEmployer.id, {
    title: 'فرصة Workroom Benchmark Search',
    category: 'cleaning',
    governorate: 'cairo',
    workersNeeded: 1,
    dailyWage: 300,
    startDate: tomorrowDateString(2),
    durationDays: 1,
    description: 'فرصة مخصصة لاختبار workroom search benchmark',
    area: 'مدينة نصر',
    address: 'عنوان بحث Workroom',
    landmark: 'بجوار نقطة اختبار',
  });

  const extraApp = await applications.apply(extraJob.id, workroomWorker.id);
  assert.equal(extraApp.ok, true);

  const extraAccept = await applications.accept(extraApp.application.id, workroomEmployer.id);
  assert.equal(extraAccept.ok, true);

  const extraStart = await jobs.startJob(extraJob.id, workroomEmployer.id);
  assert.equal(extraStart.ok, true);

  const message = await workroom.sendWorkroomMessage(extraJob.id, workroomEmployer.id, {
    recipientId: workroomWorker.id,
    text: 'test benchmark workroom search رسالة عربية قابلة للبحث',
    templateKey: 'benchmark_file_paths_evidence',
  });

  assert.equal(message.ok, true, message.error || 'benchmark workroom message should send');

  // Direct offers: mix lifecycle states but avoid duplicate pending pair conflicts.
  for (let i = 0; i < 12; i++) {
    const employer = employers[i % employers.length];
    const worker = workers[i];

    const offer = await directOffer.create(employer.id, worker.id, {
      category: worker.categories[0] || 'cleaning',
      governorate: worker.governorate || 'cairo',
      proposedDailyWage: 300 + (i % 4) * 25,
      proposedStartDate: tomorrowDateString((i % 4) + 1),
      proposedDurationDays: 1,
      message: `عرض Benchmark مباشر ${i}`,
    });

    assert.equal(offer.ok, true, offer.error || 'benchmark direct offer should create');

    if (i % 4 === 0) {
      const accepted = await directOffer.tryAccept(offer.offer.id, worker.id);
      assert.equal(accepted.ok, true, accepted.error || 'benchmark direct offer should accept');
    } else if (i % 4 === 1) {
      const declined = await directOffer.decline(offer.offer.id, worker.id, 'busy');
      assert.equal(declined.ok, true, declined.error || 'benchmark direct offer should decline');
    } else if (i % 4 === 2) {
      const withdrawn = await directOffer.withdraw(offer.offer.id, employer.id);
      assert.equal(withdrawn.ok, true, withdrawn.error || 'benchmark direct offer should withdraw');
    }
    // i % 4 === 3 remains pending intentionally.
  }

  for (let i = 0; i < 40; i++) {
    await auditLog.logAction({
      adminId: 'benchmark_admin',
      action: i % 2 === 0 ? 'benchmark_even_action' : 'benchmark_odd_action',
      targetType: 'benchmark',
      targetId: `target_${i}`,
      details: {
        index: i,
        note: `benchmark audit row ${i}`,
      },
      ip: '127.0.0.1',
    });
  }

  for (let i = 0; i < 10; i++) {
    await opsQueue.enqueueJob({
      type: 'benchmark_noop',
      priority: i % 3 === 0 ? 'high' : 'normal',
      payload: { index: i, purpose: 'benchmark evidence smoke' },
      idempotencyKey: `benchmark_noop:${i}`,
      createdBy: 'test',
    });
  }

  // Rebuild lightweight indexes under temp data so indexed benchmark rows have evidence.
  try {
    const queryIndex = await importFresh('../../server/services/queryIndex.js');
    await queryIndex.buildAllIndexes();
  } catch (_) {}

  try {
    const searchIndex = await importFresh('../../server/services/searchIndex.js');
    await searchIndex.buildIndex();
  } catch (_) {}

  try {
    const auditIndex = await importFresh('../../server/services/auditLogIndex.js');
    await auditIndex.rebuildAuditIndex({ batchSize: 50 });
  } catch (_) {}

  return {
    tempDir,
    employers,
    workers,
    jobs: createdJobs,
  };
}

async function runBenchmark(tempDir, args = []) {
  const { stdout, stderr } = await execFile(
    process.execPath,
    [BENCHMARK_SCRIPT, ...args],
    {
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ADMIN_TOKEN: 'test-admin-token',
        YAWMIA_DATA_PATH: tempDir,
      },
      timeout: 20000,
      maxBuffer: 1024 * 1024 * 10,
    }
  );

  assert.equal(stderr.trim(), '', `benchmark should not write stderr\n${stderr}`);

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    assert.fail(`benchmark stdout should be valid JSON\n${stdout}`);
  }

  return parsed;
}

function assertBenchmarkRowShape(row) {
  assert.equal(typeof row.label, 'string');
  assert.equal(typeof row.skipped, 'boolean');
  assert.ok('skipReason' in row);
  assert.ok('error' in row);

  assert.equal(typeof row.count, 'number');
  assert.equal(typeof row.avgMs, 'number');
  assert.equal(typeof row.minMs, 'number');
  assert.equal(typeof row.maxMs, 'number');
  assert.equal(typeof row.p50Ms, 'number');
  assert.equal(typeof row.p95Ms, 'number');

  if (!row.skipped && !row.error) {
    assert.ok(row.count > 0, `${row.label} should have count when not skipped/error`);
    assert.ok(row.avgMs >= 0, `${row.label} avgMs should be non-negative`);
    assert.ok(row.p50Ms >= 0, `${row.label} p50Ms should be non-negative`);
    assert.ok(row.p95Ms >= 0, `${row.label} p95Ms should be non-negative`);
  }
}

test('Patch 27: benchmark-file-paths emits usable JSON evidence shape under larger temp file-backed data', async (t) => {
  const tempDir = await setupTempDataPath();

  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  await seedBenchmarkData(tempDir);

  const output = await runBenchmark(tempDir, ['--json', '--sample=2']);

  assert.equal(output.version, '0.57.0');
  assert.equal(output.dataPath, tempDir);
  assert.equal(output.sample, 2);
  assert.equal(output.includeHeavy, false);
  assert.equal(output.persisted, false);

  assert.equal(typeof output.ok, 'boolean');
  assert.equal(typeof output.evidenceUsable, 'boolean');
  assert.equal(typeof output.corruptionSuspected, 'boolean');
  assert.ok(Array.isArray(output.evidenceNotes));
  assert.ok(Array.isArray(output.results));
  assert.ok(output.results.length > 0, 'benchmark should emit result rows');

  assert.ok(output.summary && typeof output.summary === 'object');
  assert.equal(typeof output.summary.warningCount, 'number');
  assert.equal(typeof output.summary.criticalCount, 'number');
  assert.equal(typeof output.summary.errorCount, 'number');
  assert.equal(typeof output.summary.evidenceUsable, 'boolean');
  assert.equal(typeof output.summary.corruptionSuspected, 'boolean');

  const labels = new Set(output.results.map(r => r.label));

  assert.ok(labels.has('read user by id'));
  assert.ok(labels.has('read job by id'));
  assert.ok(labels.has('list jobs open'));
  assert.ok(labels.has('audit indexed search'));
  assert.ok(labels.has('queue list pending'));
  assert.ok(labels.has('queue stats'));
  assert.ok(labels.has('workroom search'));
  assert.ok(labels.has('search relevance query'));
  assert.ok(labels.has('direct offer list by employer'));
  assert.ok(labels.has('direct offer employer stats'));
  assert.ok(labels.has('direct offer platform funnel'));
  assert.ok(labels.has('storage pressure shallow scan'));

  for (const row of output.results) {
    assertBenchmarkRowShape(row);
  }

  const heavyRow = output.results.find(r => r.label === 'storage pressure shallow scan');
  assert.ok(heavyRow, 'storage pressure row should exist');
  assert.equal(heavyRow.skipped, true, 'heavy storage pressure scan should be skipped by default');
  assert.match(
    heavyRow.skipReason || '',
    /include-heavy|heavy scan skipped/i,
    'storage pressure skip reason should mention include-heavy/heavy scan'
  );

  const serialized = JSON.stringify(output);
  assert.doesNotMatch(serialized, /"implementationAllowed"\s*:\s*true/);
  assert.doesNotMatch(serialized, /"pilotAllowed"\s*:\s*true/);
  assert.doesNotMatch(serialized, /"runtimeSwitchEnabled"\s*:\s*true/);
  assert.doesNotMatch(serialized, /PostgreSQL needed|Redis needed|external queue needed|external search needed/i);
});

test('Patch 27: benchmark-file-paths --persist writes benchmark artifact only under temp data path', async (t) => {
  const tempDir = await setupTempDataPath('yawmia-benchmark-persist-');

  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  await seedBenchmarkData(tempDir);

  const output = await runBenchmark(tempDir, ['--json', '--sample=1', '--persist']);

  assert.equal(output.version, '0.57.0');
  assert.equal(output.dataPath, tempDir);
  assert.equal(output.sample, 1);
  assert.equal(output.includeHeavy, false);
  assert.equal(typeof output.persisted, 'boolean');
  assert.equal(output.persisted, true, output.persistError || 'benchmark artifact should persist');
  assert.match(output.persistedId || '', /^bmk_/);

  const artifactPath = join(tempDir, 'metrics', 'benchmarks', `${output.persistedId}.json`);
  const artifact = JSON.parse(await readFile(artifactPath, 'utf-8'));

  assert.equal(artifact.id, output.persistedId);
  assert.equal(artifact.version, '0.57.0');
  assert.equal(artifact.kind, 'benchmark_history');
  assert.equal(artifact.source, 'benchmark-file-paths');
  assert.ok(artifact.summary && typeof artifact.summary === 'object');
  assert.ok(Array.isArray(artifact.results));

  const serialized = JSON.stringify(artifact);
  assert.doesNotMatch(serialized, /"implementationAllowed"\s*:\s*true/);
  assert.doesNotMatch(serialized, /"pilotAllowed"\s*:\s*true/);
  assert.doesNotMatch(serialized, /"runtimeSwitchEnabled"\s*:\s*true/);
});
