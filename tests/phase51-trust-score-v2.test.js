import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NODE_ENV = 'test';

let dataDir;
let trustV2;
let db;

async function setup() {
  dataDir = await mkdtemp(join(tmpdir(), 'yawmia-p51-trustv2-'));
  process.env.YAWMIA_DATA_PATH = dataDir;

  db = await import('../server/services/database.js');
  trustV2 = await import('../server/services/trustScoreV2.js');

  await db.initDatabase();
}

async function cleanup() {
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
}

async function writeUser(user) {
  await db.atomicWrite(db.getRecordPath('users', user.id), user);
}

async function writeRecord(collection, id, data) {
  await db.atomicWrite(db.getWriteRecordPath(collection, id), data);
}

test.before(setup);
test.after(cleanup);

test('rating confidence with low count does not over-inflate score', () => {
  const lowCount = trustV2.calculateRatingConfidence(5, 1, 5);
  const highCount = trustV2.calculateRatingConfidence(5, 10, 5);

  assert.ok(lowCount < highCount);
  assert.ok(lowCount < 1);
  assert.equal(highCount, 1);
});

test('worker perfect reliability score is high', () => {
  const result = trustV2.calculateWorkerTrustScore({
    ratingAvg: 4.8,
    ratingCount: 10,
    totalAcceptedJobs: 10,
    completedJobs: 10,
    totalAttendanceRecords: 10,
    attendedDays: 10,
    confirmedReports: 0,
    activeFlags: 0,
    warnings: 0,
    predictiveSignals: 0,
    verificationStatus: 'verified',
    accountAgeDays: 365,
    profileCompletenessScore: 100,
  });

  assert.ok(result.score >= 0.85);
  assert.equal(result.grade, 'excellent');
});

test('worker repeated no-show lowers attendanceReliability', () => {
  const result = trustV2.calculateWorkerTrustScore({
    ratingAvg: 4.5,
    ratingCount: 10,
    totalAcceptedJobs: 10,
    completedJobs: 8,
    totalAttendanceRecords: 10,
    attendedDays: 4,
    confirmedReports: 0,
    activeFlags: 0,
    warnings: 0,
    predictiveSignals: 0,
    verificationStatus: 'verified',
    accountAgeDays: 120,
    profileCompletenessScore: 90,
  });

  assert.ok(result.components.attendanceReliability < 0.5);
  assert.ok(result.score < 0.85);
});

test('employer payment disputes lower score', () => {
  const clean = trustV2.calculateEmployerTrustScore({
    ratingAvg: 4.7,
    ratingCount: 10,
    totalJobs: 10,
    cancelledJobs: 0,
    totalPayments: 10,
    completedPayments: 10,
    employerConfirmedPayments: 0,
    disputedPayments: 0,
    totalDirectOffers: 20,
    directOfferAcceptRate: 75,
    directOfferNegativeRate: 20,
    confirmedReports: 0,
    activeFlags: 0,
    warnings: 0,
    predictiveSignals: 0,
    verificationStatus: 'verified',
    accountAgeDays: 365,
  });

  const disputed = trustV2.calculateEmployerTrustScore({
    ratingAvg: 4.7,
    ratingCount: 10,
    totalJobs: 10,
    cancelledJobs: 0,
    totalPayments: 10,
    completedPayments: 3,
    employerConfirmedPayments: 0,
    disputedPayments: 6,
    totalDirectOffers: 20,
    directOfferAcceptRate: 75,
    directOfferNegativeRate: 20,
    confirmedReports: 0,
    activeFlags: 0,
    warnings: 0,
    predictiveSignals: 0,
    verificationStatus: 'verified',
    accountAgeDays: 365,
  });

  assert.ok(disputed.components.disputeRate < clean.components.disputeRate);
  assert.ok(disputed.score < clean.score);
});

test('employer cancellations lower score', () => {
  const result = trustV2.calculateEmployerTrustScore({
    ratingAvg: 4.5,
    ratingCount: 8,
    totalJobs: 10,
    cancelledJobs: 6,
    totalPayments: 5,
    completedPayments: 5,
    disputedPayments: 0,
    totalDirectOffers: 10,
    directOfferAcceptRate: 70,
    directOfferNegativeRate: 20,
    confirmedReports: 0,
    activeFlags: 0,
    warnings: 0,
    predictiveSignals: 0,
    verificationStatus: 'verified',
    accountAgeDays: 200,
  });

  assert.ok(result.components.cancellationRate < 0.5);
  assert.ok(result.score < 0.85);
});

test('verification increases score', () => {
  const base = {
    ratingAvg: 4,
    ratingCount: 5,
    totalAcceptedJobs: 5,
    completedJobs: 4,
    totalAttendanceRecords: 5,
    attendedDays: 4,
    confirmedReports: 0,
    activeFlags: 0,
    warnings: 0,
    predictiveSignals: 0,
    accountAgeDays: 100,
    profileCompletenessScore: 80,
  };

  const unverified = trustV2.calculateWorkerTrustScore({ ...base, verificationStatus: 'unverified' });
  const verified = trustV2.calculateWorkerTrustScore({ ...base, verificationStatus: 'verified' });

  assert.ok(verified.score > unverified.score);
});

test('abuse flags/warnings lower abusePenalty', () => {
  const clean = trustV2.calculateAbusePenalty({});
  const risky = trustV2.calculateAbusePenalty({
    confirmedReports: 2,
    activeFlags: 2,
    warnings: 2,
    predictiveSignals: 2,
  });

  assert.ok(risky < clean);
});

test('deterministic output for same input', () => {
  const input = {
    ratingAvg: 4.2,
    ratingCount: 6,
    totalAcceptedJobs: 6,
    completedJobs: 5,
    totalAttendanceRecords: 6,
    attendedDays: 5,
    confirmedReports: 0,
    activeFlags: 1,
    warnings: 0,
    predictiveSignals: 0,
    verificationStatus: 'verified',
    accountAgeDays: 100,
    profileCompletenessScore: 80,
  };

  const a = trustV2.calculateWorkerTrustScore(input);
  const b = trustV2.calculateWorkerTrustScore(input);

  assert.deepEqual(a, b);
});

test('public response does not leak PII while admin response has raw metrics', async () => {
  const user = {
    id: 'usr_worker_public',
    phone: '01022222222',
    role: 'worker',
    name: 'Worker Public',
    status: 'active',
    governorate: 'cairo',
    categories: ['cleaning'],
    rating: { avg: 5, count: 1 },
    verificationStatus: 'verified',
    createdAt: new Date(Date.now() - 100 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await writeUser(user);

  const pub = await trustV2.getTrustScoreV2(user.id, { admin: false, force: true });
  const admin = await trustV2.getTrustScoreV2(user.id, { admin: true, force: true });

  assert.equal(pub.userId, user.id);
  assert.equal(pub.phone, undefined);
  assert.equal(pub.rawMetrics, undefined);
  assert.ok(Array.isArray(pub.explanations));

  assert.ok(admin.rawMetrics);
  assert.ok(Array.isArray(admin.adminExplanations));
});
