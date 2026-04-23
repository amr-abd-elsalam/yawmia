// tests/job-lifecycle.test.js
// ═══════════════════════════════════════════════════════════════
// Job Lifecycle Tests (~11 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpDir;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-lifecycle-test-'));
  const dirs = ['users', 'sessions', 'jobs', 'applications', 'otp', 'notifications'];
  for (const d of dirs) {
    await mkdir(join(tmpDir, d), { recursive: true });
  }
  process.env.YAWMIA_DATA_PATH = tmpDir;
});

after(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

let jobService, db;

before(async () => {
  jobService = await import('../server/services/jobs.js');
  db = await import('../server/services/database.js');
});

const sampleJob = {
  title: 'فرصة لاختبار الدورة الكاملة',
  category: 'farming',
  governorate: 'fayoum',
  workersNeeded: 1,
  dailyWage: 250,
  startDate: '2027-01-15',
  durationDays: 3,
};

describe('Job Lifecycle', () => {

  // ── Start Job ─────────────────────────────────────────────
  describe('startJob', () => {
    it('LC-01: starts filled job → in_progress', async () => {
      const job = await jobService.create('usr_emp_lc1', sampleJob);
      await jobService.incrementAccepted(job.id); // auto-fills (workersNeeded=1)
      const result = await jobService.startJob(job.id, 'usr_emp_lc1');
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.job.status, 'in_progress');
      assert.ok(result.job.startedAt);
    });

    it('LC-02: rejects start for non-filled job', async () => {
      const job = await jobService.create('usr_emp_lc2', sampleJob);
      const result = await jobService.startJob(job.id, 'usr_emp_lc2');
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.code, 'INVALID_STATUS');
    });

    it('LC-03: rejects start by non-owner', async () => {
      const job = await jobService.create('usr_emp_lc3', sampleJob);
      await jobService.incrementAccepted(job.id);
      const result = await jobService.startJob(job.id, 'usr_other');
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.code, 'NOT_JOB_OWNER');
    });

    it('LC-04: rejects start for non-existent job', async () => {
      const result = await jobService.startJob('job_nonexist', 'usr_any');
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.code, 'JOB_NOT_FOUND');
    });
  });

  // ── Complete Job ──────────────────────────────────────────
  describe('completeJob', () => {
    it('LC-05: completes in_progress job → completed', async () => {
      const job = await jobService.create('usr_emp_lc5', sampleJob);
      await jobService.incrementAccepted(job.id);
      await jobService.startJob(job.id, 'usr_emp_lc5');
      const result = await jobService.completeJob(job.id, 'usr_emp_lc5');
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.job.status, 'completed');
      assert.ok(result.job.completedAt);
    });

    it('LC-06: rejects complete for non-in_progress job', async () => {
      const job = await jobService.create('usr_emp_lc6', sampleJob);
      const result = await jobService.completeJob(job.id, 'usr_emp_lc6');
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.code, 'INVALID_STATUS');
    });

    it('LC-07: rejects complete by non-owner', async () => {
      const job = await jobService.create('usr_emp_lc7', sampleJob);
      await jobService.incrementAccepted(job.id);
      await jobService.startJob(job.id, 'usr_emp_lc7');
      const result = await jobService.completeJob(job.id, 'usr_other');
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.code, 'NOT_JOB_OWNER');
    });
  });

  // ── Expiry ────────────────────────────────────────────────
  describe('Expiry', () => {
    it('LC-08: findById lazy-expires an overdue open job', async () => {
      const job = await jobService.create('usr_emp_lc8', sampleJob);
      // Manually set expiresAt to past
      const jobPath = db.getRecordPath('jobs', job.id);
      const data = await db.readJSON(jobPath);
      data.expiresAt = new Date(Date.now() - 1000).toISOString();
      await db.atomicWrite(jobPath, data);

      const found = await jobService.findById(job.id);
      assert.strictEqual(found.status, 'expired');
    });

    it('LC-09: findById does not expire non-open jobs', async () => {
      const job = await jobService.create('usr_emp_lc9', sampleJob);
      await jobService.incrementAccepted(job.id); // now status=filled
      // Manually set expiresAt to past
      const jobPath = db.getRecordPath('jobs', job.id);
      const data = await db.readJSON(jobPath);
      data.expiresAt = new Date(Date.now() - 1000).toISOString();
      await db.atomicWrite(jobPath, data);

      const found = await jobService.findById(job.id);
      assert.strictEqual(found.status, 'filled'); // not expired because status was 'filled'
    });

    it('LC-10: enforceExpiredJobs expires all overdue open jobs', async () => {
      const job1 = await jobService.create('usr_emp_lc10', sampleJob);
      const job2 = await jobService.create('usr_emp_lc10b', sampleJob);
      // Manually set both to past
      for (const j of [job1, job2]) {
        const jobPath = db.getRecordPath('jobs', j.id);
        const data = await db.readJSON(jobPath);
        data.expiresAt = new Date(Date.now() - 1000).toISOString();
        await db.atomicWrite(jobPath, data);
      }

      const count = await jobService.enforceExpiredJobs();
      assert.ok(count >= 2);

      const found1 = await jobService.findById(job1.id);
      const found2 = await jobService.findById(job2.id);
      assert.strictEqual(found1.status, 'expired');
      assert.strictEqual(found2.status, 'expired');
    });

    it('LC-11: countByStatus includes in_progress and completed', async () => {
      const counts = await jobService.countByStatus();
      assert.strictEqual(typeof counts.in_progress, 'number');
      assert.strictEqual(typeof counts.completed, 'number');
      assert.strictEqual(typeof counts.open, 'number');
      assert.strictEqual(typeof counts.filled, 'number');
      assert.strictEqual(typeof counts.expired, 'number');
      assert.strictEqual(typeof counts.cancelled, 'number');
      assert.strictEqual(typeof counts.total, 'number');
    });
  });
});
