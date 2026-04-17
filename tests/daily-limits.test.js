// ═══════════════════════════════════════════════════════════════
// tests/daily-limits.test.js — Daily Limits Enforcement Tests
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Set up temp directory BEFORE importing services
const tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-dlm-'));
process.env.YAWMIA_DATA_PATH = tmpDir;

// Import after env setup
const { initDatabase } = await import('../server/services/database.js');
const { eventBus } = await import('../server/services/eventBus.js');

// Remove all listeners to prevent notification side-effects
eventBus.clear();

const { countTodayByEmployer, create: createJob } = await import('../server/services/jobs.js');
const { countTodayByWorker, apply: applyToJob } = await import('../server/services/applications.js');

describe('Daily Limits — countTodayByEmployer', async () => {
  const employerId = 'usr_emp_daily_test';

  before(async () => {
    await initDatabase();
    eventBus.clear();
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  await it('D-01: countTodayByEmployer returns 0 initially', async () => {
    const count = await countTodayByEmployer(employerId);
    assert.equal(count, 0);
  });

  await it('D-02: countTodayByEmployer increments after job creation', async () => {
    await createJob(employerId, {
      title: 'فرصة اختبار يومي 1',
      category: 'farming',
      governorate: 'cairo',
      workersNeeded: 5,
      dailyWage: 200,
      startDate: '2026-05-01',
      durationDays: 3,
      description: 'اختبار حد يومي',
    });

    const count = await countTodayByEmployer(employerId);
    assert.equal(count, 1);
  });

  await it('D-03: countTodayByEmployer counts correctly after 2 jobs', async () => {
    await createJob(employerId, {
      title: 'فرصة اختبار يومي 2',
      category: 'construction',
      governorate: 'giza',
      workersNeeded: 3,
      dailyWage: 250,
      startDate: '2026-05-02',
      durationDays: 2,
      description: 'اختبار ثاني',
    });

    const count = await countTodayByEmployer(employerId);
    assert.equal(count, 2);
  });

  await it('D-06: countTodayByEmployer returns 0 for unknown employer', async () => {
    const count = await countTodayByEmployer('usr_unknown_employer');
    assert.equal(count, 0);
  });
});

describe('Daily Limits — countTodayByWorker', async () => {
  const workerId = 'usr_wrk_daily_test';
  const employerId2 = 'usr_emp_daily_test2';

  before(async () => {
    eventBus.clear();
  });

  await it('D-04: countTodayByWorker returns 0 initially', async () => {
    const count = await countTodayByWorker(workerId);
    assert.equal(count, 0);
  });

  await it('D-05: countTodayByWorker increments after application', async () => {
    // Create a job first so the worker can apply
    const job = await createJob(employerId2, {
      title: 'فرصة للعامل اليومي',
      category: 'loading',
      governorate: 'alex',
      workersNeeded: 10,
      dailyWage: 200,
      startDate: '2026-05-01',
      durationDays: 1,
      description: 'اختبار تقديم',
    });

    const result = await applyToJob(job.id, workerId);
    assert.equal(result.ok, true);

    const count = await countTodayByWorker(workerId);
    assert.equal(count, 1);
  });

  await it('D-07: countTodayByWorker returns 0 for unknown worker', async () => {
    const count = await countTodayByWorker('usr_unknown_worker');
    assert.equal(count, 0);
  });
});
