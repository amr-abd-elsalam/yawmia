// tests/job-cancel.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 5 — Job Cancellation + Search + Sort Tests
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import config from '../config.js';

let tmpDir;

describe('Job Cancellation + Search + Sort', () => {

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-cancel-'));
    process.env.YAWMIA_DATA_PATH = tmpDir;

    // Create all required directories
    for (const dir of Object.values(config.DATABASE.dirs)) {
      await mkdir(join(tmpDir, dir), { recursive: true });
    }
  });

  after(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  // Helper: create a user directly
  async function createUser(role, phone) {
    const { create: createUserFn } = await import('../server/services/users.js');
    return await createUserFn(phone, role);
  }

  // Helper: create an open job
  async function createOpenJob(employerId, overrides = {}) {
    const { create } = await import('../server/services/jobs.js');
    return await create(employerId, {
      title: overrides.title || 'فرصة بناء تجريبية',
      category: overrides.category || 'construction',
      governorate: overrides.governorate || 'cairo',
      workersNeeded: overrides.workersNeeded || 5,
      dailyWage: overrides.dailyWage || 250,
      startDate: overrides.startDate || '2026-06-01',
      durationDays: overrides.durationDays || 3,
      description: overrides.description || 'وصف الفرصة',
    });
  }

  it('C-01: Cancel open job (success)', async () => {
    const { cancelJob } = await import('../server/services/jobs.js');
    const employer = await createUser('employer', '01011111111');
    const job = await createOpenJob(employer.id);

    const result = await cancelJob(job.id, employer.id);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.job.status, 'cancelled');
    assert.ok(result.job.cancelledAt, 'cancelledAt should be set');
  });

  it('C-02: Cancel non-existent job', async () => {
    const { cancelJob } = await import('../server/services/jobs.js');
    const employer = await createUser('employer', '01022222222');

    const result = await cancelJob('job_nonexistent', employer.id);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'JOB_NOT_FOUND');
  });

  it('C-03: Cancel by non-owner', async () => {
    const { cancelJob } = await import('../server/services/jobs.js');
    const employer1 = await createUser('employer', '01033333333');
    const employer2 = await createUser('employer', '01044444444');
    const job = await createOpenJob(employer1.id);

    const result = await cancelJob(job.id, employer2.id);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'NOT_JOB_OWNER');
  });

  it('C-04: Cancel filled job', async () => {
    const { cancelJob, updateStatus } = await import('../server/services/jobs.js');
    const employer = await createUser('employer', '01055555555');
    const job = await createOpenJob(employer.id);
    await updateStatus(job.id, 'filled');

    const result = await cancelJob(job.id, employer.id);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'INVALID_STATUS');
  });

  it('C-05: Cancel in_progress job', async () => {
    const { cancelJob, updateStatus } = await import('../server/services/jobs.js');
    const employer = await createUser('employer', '01066666666');
    const job = await createOpenJob(employer.id);
    await updateStatus(job.id, 'filled');
    await updateStatus(job.id, 'in_progress');

    const result = await cancelJob(job.id, employer.id);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'INVALID_STATUS');
  });

  it('C-06: Cancel completed job', async () => {
    const { cancelJob, updateStatus } = await import('../server/services/jobs.js');
    const employer = await createUser('employer', '01077777777');
    const job = await createOpenJob(employer.id);
    await updateStatus(job.id, 'filled');
    await updateStatus(job.id, 'in_progress');
    await updateStatus(job.id, 'completed');

    const result = await cancelJob(job.id, employer.id);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'INVALID_STATUS');
  });

  it('C-07: Cancel already cancelled job', async () => {
    const { cancelJob } = await import('../server/services/jobs.js');
    const employer = await createUser('employer', '01088888888');
    const job = await createOpenJob(employer.id);

    // Cancel first time
    await cancelJob(job.id, employer.id);

    // Cancel again
    const result = await cancelJob(job.id, employer.id);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'INVALID_STATUS');
  });

  it('C-08: Cancel expired job', async () => {
    const { cancelJob, updateStatus } = await import('../server/services/jobs.js');
    const employer = await createUser('employer', '01099999999');
    const job = await createOpenJob(employer.id);
    await updateStatus(job.id, 'expired');

    const result = await cancelJob(job.id, employer.id);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'INVALID_STATUS');
  });

  it('C-09: Search filter returns matching jobs (title match)', async () => {
    const { list } = await import('../server/services/jobs.js');
    const employer = await createUser('employer', '01111111111');
    await createOpenJob(employer.id, { title: 'فرصة زراعة قمح', dailyWage: 200 });
    await createOpenJob(employer.id, { title: 'فرصة بناء عمارة', dailyWage: 300 });

    const results = await list({ search: 'زراعة' });
    assert.ok(results.length >= 1, 'Should find at least 1 result');
    assert.ok(results.every(j => j.title.includes('زراعة') || (j.description || '').includes('زراعة')),
      'All results should match search term');
  });

  it('C-10: Search filter is case-insensitive', async () => {
    const { list } = await import('../server/services/jobs.js');
    const employer = await createUser('employer', '01222222222');
    await createOpenJob(employer.id, { title: 'Construction Work', dailyWage: 250, description: 'English description' });

    const results = await list({ search: 'construction' });
    assert.ok(results.length >= 1, 'Should find result with case-insensitive search');
  });

  it('C-11: Sort by wage_high returns highest first', async () => {
    const { list } = await import('../server/services/jobs.js');
    const employer = await createUser('employer', '01333333333');
    await createOpenJob(employer.id, { title: 'فرصة أجر منخفض', dailyWage: 150 });
    await createOpenJob(employer.id, { title: 'فرصة أجر عالي', dailyWage: 500 });
    await createOpenJob(employer.id, { title: 'فرصة أجر متوسط', dailyWage: 300 });

    const results = await list({ sort: 'wage_high' });
    assert.ok(results.length >= 3, 'Should have at least 3 jobs');
    // First should have highest wage
    assert.ok(results[0].dailyWage >= results[1].dailyWage, 'First job should have highest or equal wage');
  });

  it('C-12: Sort by wage_low returns lowest first', async () => {
    const { list } = await import('../server/services/jobs.js');

    const results = await list({ sort: 'wage_low' });
    assert.ok(results.length >= 2, 'Should have at least 2 jobs');
    // First should have lowest wage
    assert.ok(results[0].dailyWage <= results[1].dailyWage, 'First job should have lowest or equal wage');
  });

});
