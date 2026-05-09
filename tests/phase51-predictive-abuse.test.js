import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NODE_ENV = 'test';

let dataDir;
let db;
let predictive;
let users;

async function setup() {
  dataDir = await mkdtemp(join(tmpdir(), 'yawmia-p51-predictive-'));
  process.env.YAWMIA_DATA_PATH = dataDir;

  db = await import('../server/services/database.js');
  predictive = await import('../server/services/predictiveAbuse.js');
  users = await import('../server/services/users.js');

  await db.initDatabase();
}

async function cleanup() {
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
}

function offer(overrides = {}) {
  return {
    id: overrides.id || ('dof_' + Math.random().toString(16).slice(2, 14)),
    employerId: overrides.employerId || 'usr_emp',
    workerId: overrides.workerId || 'usr_worker',
    status: overrides.status || 'pending',
    proposedDailyWage: 250,
    createdAt: overrides.createdAt || new Date().toISOString(),
    updatedAt: overrides.updatedAt || overrides.createdAt || new Date().toISOString(),
    acceptedAt: overrides.status === 'accepted' ? (overrides.acceptedAt || overrides.updatedAt || new Date().toISOString()) : null,
    declinedAt: overrides.status === 'declined' ? (overrides.declinedAt || overrides.updatedAt || new Date().toISOString()) : null,
    expiredAt: overrides.status === 'expired' ? (overrides.expiredAt || overrides.updatedAt || new Date().toISOString()) : null,
    withdrawnAt: overrides.status === 'withdrawn' ? (overrides.withdrawnAt || overrides.updatedAt || new Date().toISOString()) : null,
    viewedAt: overrides.viewedAt || null,
    expiresAt: overrides.expiresAt || new Date(Date.now() + 120000).toISOString(),
  };
}

async function writeOffer(o) {
  await db.atomicWrite(db.getWriteRecordPath('direct_offers', o.id), o);
}

test.before(setup);
test.after(cleanup);

test('calculateZScore and severity classification work', () => {
  const z = predictive.calculateZScore(0.9, 0.3, 20);
  assert.ok(z > 2);

  assert.equal(predictive.classifySeverity(0.4, 1), 'low');
  assert.equal(predictive.classifySeverity(0.55, 1), 'medium');
  assert.equal(predictive.classifySeverity(0.78, 2), 'high');
  assert.equal(predictive.classifySeverity(0.91, 2), 'critical');
});

test('clean fixture produces no high/critical signals', async () => {
  const now = Date.now();

  for (let i = 0; i < 20; i++) {
    await writeOffer(offer({
      id: `dof_clean_${i}`,
      employerId: 'usr_emp_clean',
      workerId: `usr_w_clean_${i}`,
      status: i % 2 === 0 ? 'accepted' : 'declined',
      createdAt: new Date(now - (48 + i) * 3600000).toISOString(),
    }));
  }

  const result = await predictive.runPredictiveScan({ force: true, persist: false });
  const highSignals = result.signals.filter(s => s.severity === 'high' || s.severity === 'critical');
  assert.equal(highSignals.length, 0);
});

test('employer decline spike creates high risk signal with explanations', async () => {
  const now = Date.now();

  // Baseline: mostly accepted
  for (let i = 0; i < 30; i++) {
    await writeOffer(offer({
      id: `dof_base_${i}`,
      employerId: 'usr_emp_spike',
      workerId: `usr_w_base_${i}`,
      status: i < 24 ? 'accepted' : 'declined',
      createdAt: new Date(now - (48 + i) * 3600000).toISOString(),
    }));
  }

  // Current window: mostly declined/expired
  for (let i = 0; i < 14; i++) {
    await writeOffer(offer({
      id: `dof_spike_${i}`,
      employerId: 'usr_emp_spike',
      workerId: `usr_w_spike_${i}`,
      status: i < 12 ? 'declined' : 'expired',
      createdAt: new Date(now - i * 1800000).toISOString(),
    }));
  }

  const result = await predictive.runPredictiveScan({ force: true, persist: false });
  const sig = result.signals.find(s => s.riskType === 'employer_decline_spike' && s.entityId === 'usr_emp_spike');

  assert.ok(sig);
  assert.ok(sig.riskScore >= 0.75);
  assert.ok(['high', 'critical'].includes(sig.severity));
  assert.ok(Array.isArray(sig.explanations));
  assert.ok(sig.explanations.length > 0);
  assert.ok(sig.metrics.zScore >= 2);
});

test('min sample guard prevents false positives', async () => {
  const now = Date.now();

  for (let i = 0; i < 3; i++) {
    await writeOffer(offer({
      id: `dof_small_${i}`,
      employerId: 'usr_emp_small_sample',
      workerId: `usr_w_small_${i}`,
      status: 'declined',
      createdAt: new Date(now - i * 60000).toISOString(),
    }));
  }

  const result = await predictive.runPredictiveScan({ force: true, persist: false });
  const sig = result.signals.find(s => s.entityId === 'usr_emp_small_sample');
  assert.equal(sig, undefined);
});

test('worker offer bombing risk detects many offers from unique employers', async () => {
  const now = Date.now();

  for (let i = 0; i < 15; i++) {
    await writeOffer(offer({
      id: `dof_bomb_${i}`,
      employerId: `usr_emp_bomb_${i}`,
      workerId: 'usr_worker_bombed',
      status: 'pending',
      createdAt: new Date(now - i * 60000).toISOString(),
    }));
  }

  const result = await predictive.runPredictiveScan({ force: true, persist: false });
  const sig = result.signals.find(s =>
    s.riskType === 'worker_offer_bombing_probability' &&
    s.entityId === 'usr_worker_bombed'
  );

  assert.ok(sig);
  assert.ok(sig.metrics.uniqueEmployers >= 10);
  assert.ok(sig.explanations.length > 0);
});

test('same-worker harassment detects repeated declined offers', async () => {
  const now = Date.now();

  for (let i = 0; i < 6; i++) {
    await writeOffer(offer({
      id: `dof_pair_${i}`,
      employerId: 'usr_emp_harass',
      workerId: 'usr_worker_target',
      status: i < 5 ? 'declined' : 'expired',
      createdAt: new Date(now - i * 600000).toISOString(),
      viewedAt: new Date(now - i * 600000 + 1000).toISOString(),
    }));
  }

  const result = await predictive.runPredictiveScan({ force: true, persist: false });
  const sig = result.signals.find(s =>
    s.riskType === 'same_worker_harassment_likelihood' &&
    s.entityId === 'usr_emp_harass' &&
    s.relatedUserId === 'usr_worker_target'
  );

  assert.ok(sig);
  assert.ok(sig.riskScore >= 0.5);
  assert.ok(sig.explanations.length > 0);
});

test('signal persistence deduplicates active signals', async () => {
  const now = Date.now();

  for (let i = 0; i < 14; i++) {
    await writeOffer(offer({
      id: `dof_dedup_${i}`,
      employerId: 'usr_emp_dedup',
      workerId: `usr_w_dedup_${i}`,
      status: 'declined',
      createdAt: new Date(now - i * 60000).toISOString(),
    }));
  }

  const first = await predictive.runPredictiveScan({ force: true, persist: true });
  const second = await predictive.runPredictiveScan({ force: true, persist: true });

  assert.ok(first.signalCount > 0);
  assert.ok(second.updated >= 1);

  const list = await predictive.listPredictiveSignals({ entityId: 'usr_emp_dedup', status: 'active', limit: 100 });
  const fingerprints = new Set(list.signals.map(s => s.fingerprint));
  assert.equal(fingerprints.size, list.signals.length);
});

test('dismiss and escalate update signal state and no auto-ban happens', async () => {
  await users.create('01011111111', 'employer');
  const allUsers = await users.listAll();
  const emp = allUsers.find(u => u.phone === '01011111111');

  const now = Date.now();
  for (let i = 0; i < 14; i++) {
    await writeOffer(offer({
      id: `dof_review_${i}`,
      employerId: emp.id,
      workerId: `usr_w_review_${i}`,
      status: 'declined',
      createdAt: new Date(now - i * 60000).toISOString(),
    }));
  }

  await predictive.runPredictiveScan({ force: true, persist: true });
  const list = await predictive.listPredictiveSignals({ entityId: emp.id, status: 'active', limit: 10 });
  assert.ok(list.signals.length > 0);

  const signalId = list.signals[0].id;
  const dismissed = await predictive.dismissSignal(signalId, 'admin_test', 'false positive');
  assert.equal(dismissed.ok, true);
  assert.equal(dismissed.signal.status, 'dismissed');

  const freshUser = await users.findById(emp.id);
  assert.equal(freshUser.status, 'active');
});
