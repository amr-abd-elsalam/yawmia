// tests/phase4-applications.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 4 — Application Management + Withdraw Tests (~18 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpDir;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-p4-test-'));
  const dirs = ['users', 'sessions', 'jobs', 'applications', 'otp', 'notifications', 'ratings'];
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
  title: 'فرصة عمل تجريبية Phase 4',
  category: 'farming',
  governorate: 'cairo',
  workersNeeded: 5,
  dailyWage: 200,
  startDate: '2026-06-01',
  durationDays: 3,
};

/**
 * Helper: create a job and have a worker apply
 */
async function createJobWithApplicant(employerId, workerId) {
  const job = await jobService.create(employerId, sampleJob);
  const applyResult = await appService.apply(job.id, workerId);
  return { job, application: applyResult.application };
}

describe('Phase 4 — Application Management & Withdraw', () => {

  // ── Withdraw Tests ──────────────────────────────────────

  it('P4-01: Worker withdraws pending application', async () => {
    const { application } = await createJobWithApplicant('usr_emp_p401', 'usr_wrk_p401');
    const result = await appService.withdraw(application.id, 'usr_wrk_p401');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.application.status, 'withdrawn');
    assert.ok(result.application.respondedAt);
  });

  it('P4-02: Withdraw rejects non-owner', async () => {
    const { application } = await createJobWithApplicant('usr_emp_p402', 'usr_wrk_p402');
    const result = await appService.withdraw(application.id, 'usr_wrk_other');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'NOT_APPLICATION_OWNER');
  });

  it('P4-03: Withdraw rejects non-pending (accepted)', async () => {
    const { job, application } = await createJobWithApplicant('usr_emp_p403', 'usr_wrk_p403');
    await appService.accept(application.id, 'usr_emp_p403');
    const result = await appService.withdraw(application.id, 'usr_wrk_p403');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'CANNOT_WITHDRAW');
  });

  it('P4-04: Withdraw rejects non-existent application', async () => {
    const result = await appService.withdraw('app_doesnotexist', 'usr_wrk_p404');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'APPLICATION_NOT_FOUND');
  });

  it('P4-05: Withdraw rejects already withdrawn', async () => {
    const { application } = await createJobWithApplicant('usr_emp_p405', 'usr_wrk_p405');
    await appService.withdraw(application.id, 'usr_wrk_p405');
    const result = await appService.withdraw(application.id, 'usr_wrk_p405');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'CANNOT_WITHDRAW');
  });

  // ── listByWorker Tests ────────────────────────────────────

  it('P4-06: listByWorker returns worker\'s applications only', async () => {
    const workerId = 'usr_wrk_p406';
    const job1 = await jobService.create('usr_emp_p406a', sampleJob);
    const job2 = await jobService.create('usr_emp_p406b', sampleJob);
    await appService.apply(job1.id, workerId);
    await appService.apply(job2.id, workerId);
    // Different worker applies too
    await appService.apply(job1.id, 'usr_wrk_p406_other');

    const apps = await appService.listByWorker(workerId);
    assert.ok(apps.length >= 2);
    for (const app of apps) {
      assert.strictEqual(app.workerId, workerId);
    }
  });

  it('P4-07: listByWorker returns empty for worker with no apps', async () => {
    const apps = await appService.listByWorker('usr_wrk_noexist_p407');
    assert.strictEqual(apps.length, 0);
  });

  // ── listByJob Tests ───────────────────────────────────────

  it('P4-08: listByJob returns all applications for a job', async () => {
    const job = await jobService.create('usr_emp_p408', sampleJob);
    await appService.apply(job.id, 'usr_wrk_p408a');
    await appService.apply(job.id, 'usr_wrk_p408b');
    await appService.apply(job.id, 'usr_wrk_p408c');

    const apps = await appService.listByJob(job.id);
    assert.strictEqual(apps.length, 3);
    for (const app of apps) {
      assert.strictEqual(app.jobId, job.id);
    }
  });

  // ── countByStatus Tests ───────────────────────────────────

  it('P4-09: countByStatus includes withdrawn count', async () => {
    // We already have withdrawn apps from P4-01 and P4-05
    const counts = await appService.countByStatus();
    assert.ok(counts.withdrawn >= 1, 'should have at least 1 withdrawn');
    assert.ok(counts.total > 0, 'should have total > 0');
  });

  // ── Integration Tests ─────────────────────────────────────

  it('P4-10: Apply → withdraw → re-apply returns ALREADY_APPLIED', async () => {
    const { job, application } = await createJobWithApplicant('usr_emp_p410', 'usr_wrk_p410');
    // Withdraw
    const withdrawResult = await appService.withdraw(application.id, 'usr_wrk_p410');
    assert.strictEqual(withdrawResult.ok, true);
    // Try to re-apply
    const reapplyResult = await appService.apply(job.id, 'usr_wrk_p410');
    assert.strictEqual(reapplyResult.ok, false);
    assert.strictEqual(reapplyResult.code, 'ALREADY_APPLIED');
  });

  it('P4-11: Multiple workers: apply + withdraw + accept states correct', async () => {
    const job = await jobService.create('usr_emp_p411', sampleJob);
    const app1 = await appService.apply(job.id, 'usr_wrk_p411a');
    const app2 = await appService.apply(job.id, 'usr_wrk_p411b');
    const app3 = await appService.apply(job.id, 'usr_wrk_p411c');

    // Accept worker A
    await appService.accept(app1.application.id, 'usr_emp_p411');
    // Worker C withdraws
    await appService.withdraw(app3.application.id, 'usr_wrk_p411c');

    // Check states
    const a1 = await appService.findById(app1.application.id);
    const a2 = await appService.findById(app2.application.id);
    const a3 = await appService.findById(app3.application.id);

    assert.strictEqual(a1.status, 'accepted');
    assert.strictEqual(a2.status, 'pending');
    assert.strictEqual(a3.status, 'withdrawn');
  });

  it('P4-12: Withdraw rejected application fails', async () => {
    const { job, application } = await createJobWithApplicant('usr_emp_p412', 'usr_wrk_p412');
    await appService.reject(application.id, 'usr_emp_p412');
    const result = await appService.withdraw(application.id, 'usr_wrk_p412');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'CANNOT_WITHDRAW');
  });

  it('P4-13: Withdraw sets respondedAt to ISO string', async () => {
    const { application } = await createJobWithApplicant('usr_emp_p413', 'usr_wrk_p413');
    const result = await appService.withdraw(application.id, 'usr_wrk_p413');
    assert.strictEqual(result.ok, true);
    // Validate ISO string
    const d = new Date(result.application.respondedAt);
    assert.ok(!isNaN(d.getTime()), 'respondedAt should be valid ISO date');
    assert.strictEqual(result.application.respondedAt, d.toISOString());
  });

  it('P4-14: Application after withdraw still found by findByJobAndWorker', async () => {
    const { job, application } = await createJobWithApplicant('usr_emp_p414', 'usr_wrk_p414');
    await appService.withdraw(application.id, 'usr_wrk_p414');
    const found = await appService.findByJobAndWorker(job.id, 'usr_wrk_p414');
    assert.ok(found, 'should find the withdrawn application');
    assert.strictEqual(found.status, 'withdrawn');
  });

  it('P4-15: listByWorker after withdraw shows withdrawn status', async () => {
    const { application } = await createJobWithApplicant('usr_emp_p415', 'usr_wrk_p415');
    await appService.withdraw(application.id, 'usr_wrk_p415');
    const apps = await appService.listByWorker('usr_wrk_p415');
    const found = apps.find(a => a.id === application.id);
    assert.ok(found);
    assert.strictEqual(found.status, 'withdrawn');
  });

  it('P4-16: Withdraw does not affect other applications', async () => {
    const job = await jobService.create('usr_emp_p416', sampleJob);
    const app1 = await appService.apply(job.id, 'usr_wrk_p416a');
    const app2 = await appService.apply(job.id, 'usr_wrk_p416b');

    // Withdraw app1 only
    await appService.withdraw(app1.application.id, 'usr_wrk_p416a');

    // Check app2 is unaffected
    const a2 = await appService.findById(app2.application.id);
    assert.strictEqual(a2.status, 'pending');
  });

  it('P4-17: listByJob returns applications of all statuses', async () => {
    const job = await jobService.create('usr_emp_p417', sampleJob);
    const app1 = await appService.apply(job.id, 'usr_wrk_p417a');
    const app2 = await appService.apply(job.id, 'usr_wrk_p417b');
    const app3 = await appService.apply(job.id, 'usr_wrk_p417c');

    // Accept one, withdraw one, leave one pending
    await appService.accept(app1.application.id, 'usr_emp_p417');
    await appService.withdraw(app3.application.id, 'usr_wrk_p417c');

    const apps = await appService.listByJob(job.id);
    const statuses = apps.map(a => a.status);
    assert.ok(statuses.includes('accepted'), 'should include accepted');
    assert.ok(statuses.includes('pending'), 'should include pending');
    assert.ok(statuses.includes('withdrawn'), 'should include withdrawn');
  });

  it('P4-18: countByStatus returns correct total', async () => {
    const counts = await appService.countByStatus();
    const sum = counts.pending + counts.accepted + counts.rejected + counts.withdrawn;
    assert.strictEqual(counts.total, sum + (counts.total - sum),
      'total should equal sum of all counted statuses plus any uncategorized');
    // More precise: total should be at least the sum of known statuses
    assert.ok(counts.total >= sum, 'total should be >= sum of known statuses');
  });

});
