// tests/applications.test.js
// ═══════════════════════════════════════════════════════════════
// Application Service Tests (~10 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpDir;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-apps-test-'));
  const dirs = ['users', 'sessions', 'jobs', 'applications', 'otp'];
  for (const d of dirs) {
    await mkdir(join(tmpDir, d), { recursive: true });
  }
  process.env.YAWMIA_DATA_PATH = tmpDir;
});

after(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

let appService, jobService;

before(async () => {
  appService = await import('../server/services/applications.js');
  jobService = await import('../server/services/jobs.js');
});

const sampleJob = {
  title: 'فرصة عمل تجريبية',
  category: 'farming',
  governorate: 'cairo',
  workersNeeded: 5,
  dailyWage: 200,
  startDate: '2026-04-25',
  durationDays: 2,
};

describe('Applications Service', () => {

  it('AP-01: worker can apply to open job', async () => {
    const job = await jobService.create('usr_emp100', sampleJob);
    const result = await appService.apply(job.id, 'usr_wrk100');
    assert.strictEqual(result.ok, true);
    assert.ok(result.application);
    assert.ok(result.application.id.startsWith('app_'));
    assert.strictEqual(result.application.status, 'pending');
    assert.strictEqual(result.application.jobId, job.id);
  });

  it('AP-02: rejects duplicate application', async () => {
    const job = await jobService.create('usr_emp101', sampleJob);
    await appService.apply(job.id, 'usr_wrk101');
    const result = await appService.apply(job.id, 'usr_wrk101');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'ALREADY_APPLIED');
  });

  it('AP-03: rejects application to non-existent job', async () => {
    const result = await appService.apply('job_doesnotexist', 'usr_wrk102');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'JOB_NOT_FOUND');
  });

  it('AP-04: rejects application to closed job', async () => {
    const job = await jobService.create('usr_emp102', sampleJob);
    await jobService.updateStatus(job.id, 'cancelled');
    const result = await appService.apply(job.id, 'usr_wrk103');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'JOB_NOT_OPEN');
  });

  it('AP-05: employer can accept application', async () => {
    const job = await jobService.create('usr_emp103', sampleJob);
    const applyResult = await appService.apply(job.id, 'usr_wrk104');
    const result = await appService.accept(applyResult.application.id, 'usr_emp103');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.application.status, 'accepted');
    assert.ok(result.application.respondedAt);
  });

  it('AP-06: accept increments job workersAccepted', async () => {
    const job = await jobService.create('usr_emp104', sampleJob);
    const applyResult = await appService.apply(job.id, 'usr_wrk105');
    await appService.accept(applyResult.application.id, 'usr_emp104');
    const updatedJob = await jobService.findById(job.id);
    assert.strictEqual(updatedJob.workersAccepted, 1);
  });

  it('AP-07: only job owner can accept', async () => {
    const job = await jobService.create('usr_emp105', sampleJob);
    const applyResult = await appService.apply(job.id, 'usr_wrk106');
    const result = await appService.accept(applyResult.application.id, 'usr_other');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'NOT_JOB_OWNER');
  });

  it('AP-08: employer can reject application', async () => {
    const job = await jobService.create('usr_emp106', sampleJob);
    const applyResult = await appService.apply(job.id, 'usr_wrk107');
    const result = await appService.reject(applyResult.application.id, 'usr_emp106');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.application.status, 'rejected');
  });

  it('AP-09: cannot accept already responded application', async () => {
    const job = await jobService.create('usr_emp107', sampleJob);
    const applyResult = await appService.apply(job.id, 'usr_wrk108');
    await appService.accept(applyResult.application.id, 'usr_emp107');
    const result = await appService.accept(applyResult.application.id, 'usr_emp107');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'ALREADY_RESPONDED');
  });

  it('AP-10: listByJob returns all applications for a job', async () => {
    const job = await jobService.create('usr_emp108', sampleJob);
    await appService.apply(job.id, 'usr_wrk200');
    await appService.apply(job.id, 'usr_wrk201');
    const apps = await appService.listByJob(job.id);
    assert.ok(apps.length >= 2);
  });

  it('AP-11: listByWorker returns all applications by a worker', async () => {
    const job1 = await jobService.create('usr_emp109', sampleJob);
    const job2 = await jobService.create('usr_emp110', sampleJob);
    await appService.apply(job1.id, 'usr_wrk300');
    await appService.apply(job2.id, 'usr_wrk300');
    const apps = await appService.listByWorker('usr_wrk300');
    assert.ok(apps.length >= 2);
  });
});
