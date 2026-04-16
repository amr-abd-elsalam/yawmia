// tests/jobs.test.js
// ═══════════════════════════════════════════════════════════════
// Job Service Tests (~15 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpDir;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-jobs-test-'));
  const dirs = ['users', 'sessions', 'jobs', 'applications', 'otp'];
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
  title: 'جمع محصول قمح',
  category: 'farming',
  governorate: 'fayoum',
  workersNeeded: 20,
  dailyWage: 250,
  startDate: '2026-04-20',
  durationDays: 3,
  description: 'محتاج 20 شخص لجمع قمح في الفيوم',
};

describe('Jobs Service', () => {

  describe('calculateFees', () => {
    it('J-01: calculates totalCost correctly', () => {
      const { totalCost } = jobService.calculateFees(20, 250, 3);
      assert.strictEqual(totalCost, 15000);
    });

    it('J-02: calculates platformFee correctly (15%)', () => {
      const { platformFee } = jobService.calculateFees(20, 250, 3);
      assert.strictEqual(platformFee, 2250);
    });

    it('J-03: handles single worker/day', () => {
      const { totalCost, platformFee } = jobService.calculateFees(1, 150, 1);
      assert.strictEqual(totalCost, 150);
      assert.strictEqual(platformFee, Math.round(150 * 0.15));
    });
  });

  describe('create', () => {
    it('J-04: creates job with correct fields', async () => {
      const job = await jobService.create('usr_emp001', sampleJob);
      assert.ok(job.id);
      assert.ok(job.id.startsWith('job_'));
      assert.strictEqual(job.employerId, 'usr_emp001');
      assert.strictEqual(job.title, 'جمع محصول قمح');
      assert.strictEqual(job.category, 'farming');
      assert.strictEqual(job.governorate, 'fayoum');
      assert.strictEqual(job.workersNeeded, 20);
      assert.strictEqual(job.workersAccepted, 0);
      assert.strictEqual(job.dailyWage, 250);
      assert.strictEqual(job.status, 'open');
      assert.strictEqual(job.totalCost, 15000);
      assert.strictEqual(job.platformFee, 2250);
    });

    it('J-05: job has expiry time', async () => {
      const job = await jobService.create('usr_emp002', sampleJob);
      assert.ok(job.expiresAt);
      const expiresAt = new Date(job.expiresAt);
      const createdAt = new Date(job.createdAt);
      const diffHours = (expiresAt - createdAt) / (1000 * 60 * 60);
      assert.ok(diffHours >= 71 && diffHours <= 73, `expiry should be ~72h, got ${diffHours}h`);
    });

    it('J-06: job is persisted to file', async () => {
      const job = await jobService.create('usr_emp003', sampleJob);
      const data = await db.readJSON(db.getRecordPath('jobs', job.id));
      assert.ok(data);
      assert.strictEqual(data.title, 'جمع محصول قمح');
    });
  });

  describe('findById', () => {
    it('J-07: finds existing job', async () => {
      const job = await jobService.create('usr_emp004', sampleJob);
      const found = await jobService.findById(job.id);
      assert.ok(found);
      assert.strictEqual(found.id, job.id);
    });

    it('J-08: returns null for non-existent job', async () => {
      const result = await jobService.findById('job_nonexistent');
      assert.strictEqual(result, null);
    });
  });

  describe('list', () => {
    it('J-09: lists open jobs', async () => {
      const jobs = await jobService.list();
      assert.ok(Array.isArray(jobs));
      // All listed jobs should be open
      for (const j of jobs) {
        assert.strictEqual(j.status, 'open');
      }
    });

    it('J-10: filters by governorate', async () => {
      await jobService.create('usr_emp005', { ...sampleJob, governorate: 'cairo' });
      const jobs = await jobService.list({ governorate: 'cairo' });
      for (const j of jobs) {
        assert.strictEqual(j.governorate, 'cairo');
      }
    });

    it('J-11: filters by category', async () => {
      await jobService.create('usr_emp006', { ...sampleJob, category: 'construction' });
      const jobs = await jobService.list({ category: 'construction' });
      for (const j of jobs) {
        assert.strictEqual(j.category, 'construction');
      }
    });

    it('J-12: jobs sorted by newest first', async () => {
      const jobs = await jobService.list();
      for (let i = 1; i < jobs.length; i++) {
        assert.ok(new Date(jobs[i - 1].createdAt) >= new Date(jobs[i].createdAt));
      }
    });
  });

  describe('updateStatus', () => {
    it('J-13: updates job status', async () => {
      const job = await jobService.create('usr_emp007', sampleJob);
      const updated = await jobService.updateStatus(job.id, 'cancelled');
      assert.strictEqual(updated.status, 'cancelled');
    });

    it('J-14: returns null for non-existent job', async () => {
      const result = await jobService.updateStatus('job_nope', 'cancelled');
      assert.strictEqual(result, null);
    });
  });

  describe('incrementAccepted', () => {
    it('J-15: increments workersAccepted count', async () => {
      const job = await jobService.create('usr_emp008', { ...sampleJob, workersNeeded: 2 });
      const updated = await jobService.incrementAccepted(job.id);
      assert.strictEqual(updated.workersAccepted, 1);
      assert.strictEqual(updated.status, 'open');
    });

    it('J-16: auto-fills when all workers accepted', async () => {
      const job = await jobService.create('usr_emp009', { ...sampleJob, workersNeeded: 1 });
      const updated = await jobService.incrementAccepted(job.id);
      assert.strictEqual(updated.workersAccepted, 1);
      assert.strictEqual(updated.status, 'filled');
    });
  });
});
