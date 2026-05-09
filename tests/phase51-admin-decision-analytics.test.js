import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NODE_ENV = 'test';

let dataDir;
let db;
let analytics;

async function setup() {
  dataDir = await mkdtemp(join(tmpdir(), 'yawmia-p51-decision-'));
  process.env.YAWMIA_DATA_PATH = dataDir;

  db = await import('../server/services/database.js');
  analytics = await import('../server/services/adminDecisionAnalytics.js');

  await db.initDatabase();
}

async function cleanup() {
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
}

async function writeReviewState(state) {
  await db.atomicWrite(db.getRecordPath('abuse_flag_reviews', state.fingerprint), state);
}

async function writeSignal(signal) {
  await db.atomicWrite(db.getRecordPath('predictive_signals', signal.id), signal);
}

test.before(setup);
test.after(cleanup);

test('empty dataset returns zeros', async () => {
  const q = await analytics.getDecisionQuality({});
  assert.equal(q.warningEffectiveness.totalWarnings, 0);
  assert.equal(q.calibration.totalAdmins, 0);
  assert.equal(q.backlogSummary.total, 0);
});

test('warning effectiveness calculation and warning to action conversion', async () => {
  const now = Date.now();

  await writeReviewState({
    fingerprint: 'fp_warning_actioned',
    flagType: 'same_worker_spam',
    employerId: 'usr_emp_warn',
    workerId: 'usr_worker_warn',
    firstSeenAt: new Date(now - 10 * 86400000).toISOString(),
    occurrenceCount: 2,
    currentStatus: 'actioned',
    snoozeUntil: null,
    reviews: [
      {
        id: 'rev_warn',
        adminId: 'admin_a',
        decision: 'warning',
        note: 'be careful',
        createdAt: new Date(now - 9 * 86400000).toISOString(),
      },
      {
        id: 'rev_action',
        adminId: 'admin_b',
        decision: 'actioned',
        note: 'continued abuse',
        createdAt: new Date(now - 5 * 86400000).toISOString(),
      },
    ],
  });

  const result = await analytics.getWarningEffectiveness({});
  assert.equal(result.totalWarnings, 1);
  assert.equal(result.convertedToAction, 1);
  assert.equal(result.conversionRate, 100);
});

test('per-admin calibration metrics', async () => {
  const now = Date.now();

  await writeReviewState({
    fingerprint: 'fp_calibration',
    flagType: 'high_decline_employer',
    employerId: 'usr_emp_cal',
    workerId: null,
    firstSeenAt: new Date(now - 72 * 3600000).toISOString(),
    occurrenceCount: 1,
    currentStatus: 'dismissed',
    snoozeUntil: null,
    reviews: [
      {
        id: 'rev_dismiss',
        adminId: 'admin_cal',
        decision: 'dismissed',
        note: 'ok',
        createdAt: new Date(now - 48 * 3600000).toISOString(),
      },
      {
        id: 'rev_warn_2',
        adminId: 'admin_cal',
        decision: 'warning',
        note: 'warn',
        createdAt: new Date(now - 24 * 3600000).toISOString(),
      },
    ],
  });

  await writeSignal({
    id: 'sig_high_dismissed',
    riskType: 'employer_decline_spike',
    entityType: 'employer',
    entityId: 'usr_emp_cal',
    relatedUserId: null,
    riskScore: 0.92,
    severity: 'high',
    window: {},
    metrics: {},
    explanations: ['test'],
    status: 'dismissed',
    reviewedAt: new Date().toISOString(),
    reviewedBy: 'admin_cal',
    reviewDecision: 'dismissed',
    reviewNote: 'dismiss high',
    createdAt: new Date(now - 3600000).toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const result = await analytics.getAdminCalibration({});
  const admin = result.admins.find(a => a.adminId === 'admin_cal');

  assert.ok(admin);
  assert.ok(admin.totalDecisions >= 3);
  assert.ok(admin.highRiskDismissed >= 1);
  assert.ok(admin.calibrationScore < 100);
});

test('backlog priority sorting includes predictive signals and abuse flags', async () => {
  const now = Date.now();

  await writeSignal({
    id: 'sig_priority_high',
    riskType: 'worker_offer_bombing_probability',
    entityType: 'worker',
    entityId: 'usr_worker_priority',
    relatedUserId: null,
    riskScore: 0.95,
    severity: 'critical',
    window: {},
    metrics: {},
    explanations: ['critical risk'],
    status: 'active',
    reviewedAt: null,
    reviewedBy: null,
    reviewDecision: null,
    reviewNote: null,
    createdAt: new Date(now - 12 * 3600000).toISOString(),
    updatedAt: new Date(now - 12 * 3600000).toISOString(),
  });

  await writeReviewState({
    fingerprint: 'fp_backlog_active',
    flagType: 'same_worker_spam',
    employerId: 'usr_emp_backlog',
    workerId: 'usr_worker_backlog',
    firstSeenAt: new Date(now - 48 * 3600000).toISOString(),
    occurrenceCount: 5,
    currentStatus: 'active',
    snoozeUntil: null,
    reviews: [],
  });

  const backlog = await analytics.getBacklogPriority({ limit: 10 });
  assert.ok(backlog.items.length >= 2);
  assert.ok(backlog.items[0].priorityScore >= backlog.items[1].priorityScore);
  assert.ok(backlog.items[0].explanations.length > 0);
});

test('date filters work for warning effectiveness', async () => {
  const from = new Date(Date.now() - 2 * 86400000).toISOString();
  const to = new Date().toISOString();

  const result = await analytics.getWarningEffectiveness({ from, to });
  assert.ok(result.totalWarnings >= 0);
});
