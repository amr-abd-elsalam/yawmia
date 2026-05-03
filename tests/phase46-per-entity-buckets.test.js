// ═══════════════════════════════════════════════════════════════
// tests/phase46-per-entity-buckets.test.js — Phase 46 Per-Entity Buckets
// ═══════════════════════════════════════════════════════════════
// 12 tests for per-entity hourlyBuckets population + cleanup + date-range queries.
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let testDir;

async function setup() {
  testDir = await mkdtemp(join(tmpdir(), 'yawmia-p46-buckets-'));
  await mkdir(join(testDir, 'metrics'), { recursive: true });
  await mkdir(join(testDir, 'direct_offers'), { recursive: true });
  process.env.YAWMIA_DATA_PATH = testDir;
}

async function teardown() {
  delete process.env.YAWMIA_DATA_PATH;
  if (testDir) await rm(testDir, { recursive: true, force: true });
}

async function freshImport() {
  const url = new URL('../server/services/directOfferCounters.js?t=' + Date.now() + Math.random(), import.meta.url);
  return await import(url.href);
}

test('Phase 46 — applyEvent populates byEmployer[id].hourlyBuckets', async () => {
  await setup();
  try {
    const counters = await freshImport();
    counters._testHelpers.clearEventQueue();

    await counters.applyEvent('created', { offerId: 'dof_1', employerId: 'usr_e1', workerId: 'usr_w1' });

    const data = await counters.readCounters();
    const e = data.byEmployer['usr_e1'];
    assert.ok(e);
    assert.ok(e.hourlyBuckets, 'byEmployer.hourlyBuckets should be initialized lazily');
    const hourKey = Object.keys(e.hourlyBuckets)[0];
    assert.ok(hourKey, 'should have at least one hour key');
    assert.strictEqual(e.hourlyBuckets[hourKey].created, 1);
  } finally {
    await teardown();
  }
});

test('Phase 46 — applyEvent populates byWorker[id].hourlyBuckets', async () => {
  await setup();
  try {
    const counters = await freshImport();
    counters._testHelpers.clearEventQueue();

    await counters.applyEvent('created', { offerId: 'dof_1', employerId: 'usr_e1', workerId: 'usr_w1' });

    const data = await counters.readCounters();
    const w = data.byWorker['usr_w1'];
    assert.ok(w);
    assert.ok(w.hourlyBuckets, 'byWorker.hourlyBuckets should be initialized lazily');
    const hourKey = Object.keys(w.hourlyBuckets)[0];
    assert.strictEqual(w.hourlyBuckets[hourKey].created, 1);
  } finally {
    await teardown();
  }
});

test('Phase 46 — Multiple events per hour aggregate correctly', async () => {
  await setup();
  try {
    const counters = await freshImport();
    counters._testHelpers.clearEventQueue();

    await counters.applyEvent('created', { offerId: 'dof_1', employerId: 'usr_e1', workerId: 'usr_w1' });
    await counters.applyEvent('created', { offerId: 'dof_2', employerId: 'usr_e1', workerId: 'usr_w2' });
    await counters.applyEvent('accepted', { offerId: 'dof_1', employerId: 'usr_e1', workerId: 'usr_w1', responseMs: 30000 });

    const data = await counters.readCounters();
    const e = data.byEmployer['usr_e1'];
    const hourKey = Object.keys(e.hourlyBuckets)[0];
    assert.strictEqual(e.hourlyBuckets[hourKey].created, 2);
    assert.strictEqual(e.hourlyBuckets[hourKey].accepted, 1);
  } finally {
    await teardown();
  }
});

test('Phase 46 — applyEventToCounters helper: pure mutation', async () => {
  await setup();
  try {
    const counters = await freshImport();
    const c = counters._testHelpers.emptyCounters();
    const now = new Date();

    counters._testHelpers.applyEventToCounters(c, 'created', { offerId: 'dof_1', employerId: 'usr_e1', workerId: 'usr_w1' }, now);

    assert.strictEqual(c.platform.total, 1);
    assert.strictEqual(c.platform.pending, 1);
    assert.ok(c.byEmployer['usr_e1']);
    assert.ok(c.byEmployer['usr_e1'].hourlyBuckets);
  } finally {
    await teardown();
  }
});

test('Phase 46 — getTopEmployers without date filter (Phase 45 path)', async () => {
  await setup();
  try {
    const counters = await freshImport();
    counters._testHelpers.clearEventQueue();

    // Create 3 employers with varying acceptance rates
    for (let i = 0; i < 5; i++) {
      await counters.applyEvent('created', { offerId: `dof_e1_${i}`, employerId: 'usr_e1', workerId: `usr_w${i}` });
      await counters.applyEvent('accepted', { offerId: `dof_e1_${i}`, employerId: 'usr_e1', workerId: `usr_w${i}`, responseMs: 30000 });
    }
    for (let i = 0; i < 5; i++) {
      await counters.applyEvent('created', { offerId: `dof_e2_${i}`, employerId: 'usr_e2', workerId: `usr_w${i + 10}` });
      await counters.applyEvent('declined', { offerId: `dof_e2_${i}`, employerId: 'usr_e2', workerId: `usr_w${i + 10}`, responseMs: 60000, declinedReason: 'busy' });
    }

    const top = await counters.getTopEmployers({ limit: 10, minOffers: 3 });
    assert.ok(Array.isArray(top));
    assert.ok(top.length >= 1);

    const e1 = top.find(r => r.employerId === 'usr_e1');
    assert.ok(e1);
    assert.strictEqual(e1.acceptRate, 100);
  } finally {
    await teardown();
  }
});

test('Phase 46 — getTopEmployers with date filter uses bucket aggregation', async () => {
  await setup();
  try {
    const counters = await freshImport();
    counters._testHelpers.clearEventQueue();

    for (let i = 0; i < 5; i++) {
      await counters.applyEvent('created', { offerId: `dof_${i}`, employerId: 'usr_e1', workerId: `usr_w${i}` });
      await counters.applyEvent('accepted', { offerId: `dof_${i}`, employerId: 'usr_e1', workerId: `usr_w${i}`, responseMs: 30000 });
    }

    // Date range: last 24 hours
    const from = new Date(Date.now() - 86400000).toISOString();
    const to = new Date(Date.now() + 3600000).toISOString();

    const top = await counters.getTopEmployers({ limit: 10, minOffers: 3, from, to });
    assert.ok(Array.isArray(top));
    const e1 = top.find(r => r.employerId === 'usr_e1');
    assert.ok(e1);
    assert.strictEqual(e1.total, 5);
    assert.strictEqual(e1.accepted, 5);
    assert.strictEqual(e1.acceptRate, 100);
  } finally {
    await teardown();
  }
});

test('Phase 46 — getTopWorkers with date filter uses bucket aggregation', async () => {
  await setup();
  try {
    const counters = await freshImport();
    counters._testHelpers.clearEventQueue();

    for (let i = 0; i < 5; i++) {
      await counters.applyEvent('created', { offerId: `dof_${i}`, employerId: `usr_e${i}`, workerId: 'usr_w1' });
      await counters.applyEvent('accepted', { offerId: `dof_${i}`, employerId: `usr_e${i}`, workerId: 'usr_w1', responseMs: 30000 });
    }

    const from = new Date(Date.now() - 86400000).toISOString();
    const to = new Date(Date.now() + 3600000).toISOString();

    const top = await counters.getTopWorkers({ limit: 10, minOffers: 3, from, to });
    assert.ok(Array.isArray(top));
    const w1 = top.find(r => r.workerId === 'usr_w1');
    assert.ok(w1);
    assert.strictEqual(w1.total, 5);
    assert.strictEqual(w1.accepted, 5);
  } finally {
    await teardown();
  }
});

test('Phase 46 — Date range with no buckets returns empty', async () => {
  await setup();
  try {
    const counters = await freshImport();
    counters._testHelpers.clearEventQueue();

    await counters.applyEvent('created', { offerId: 'dof_1', employerId: 'usr_e1', workerId: 'usr_w1' });

    // Future date range
    const from = new Date(Date.now() + 86400000 * 7).toISOString();
    const to = new Date(Date.now() + 86400000 * 14).toISOString();

    const top = await counters.getTopEmployers({ limit: 10, minOffers: 1, from, to });
    assert.ok(Array.isArray(top));
    assert.strictEqual(top.length, 0);
  } finally {
    await teardown();
  }
});

test('Phase 46 — minOffers threshold respected with date range', async () => {
  await setup();
  try {
    const counters = await freshImport();
    counters._testHelpers.clearEventQueue();

    // Only 2 offers — below minOffers=3
    await counters.applyEvent('created', { offerId: 'dof_1', employerId: 'usr_e1', workerId: 'usr_w1' });
    await counters.applyEvent('created', { offerId: 'dof_2', employerId: 'usr_e1', workerId: 'usr_w2' });

    const from = new Date(Date.now() - 86400000).toISOString();
    const to = new Date(Date.now() + 3600000).toISOString();

    const top = await counters.getTopEmployers({ limit: 10, minOffers: 3, from, to });
    assert.strictEqual(top.length, 0);
  } finally {
    await teardown();
  }
});

test('Phase 46 — cleanupOldBuckets trims per-entity buckets', async () => {
  await setup();
  try {
    const counters = await freshImport();
    const c = counters._testHelpers.emptyCounters();

    // Inject old bucket (49h ago)
    const oldDate = new Date(Date.now() - 49 * 60 * 60 * 1000);
    const oldKey = counters._testHelpers.getHourKey(oldDate);
    c.byEmployer['usr_e1'] = {
      total: 5, accepted: 3, declined: 1, expired: 1, withdrawn: 0,
      totalResponseMs: 0, responseCount: 0, lastOfferAt: null,
      hourlyBuckets: {
        [oldKey]: { created: 5, accepted: 3, declined: 1, expired: 1, withdrawn: 0 },
      },
    };
    c.byWorker['usr_w1'] = {
      total: 5, accepted: 3, declined: 1, expired: 1, withdrawn: 0,
      totalResponseMs: 0, responseCount: 0,
      hourlyBuckets: {
        [oldKey]: { created: 5, accepted: 3, declined: 1, expired: 1, withdrawn: 0 },
      },
    };

    counters._testHelpers.cleanupOldBuckets(c);

    assert.strictEqual(Object.keys(c.byEmployer['usr_e1'].hourlyBuckets).length, 0);
    assert.strictEqual(Object.keys(c.byWorker['usr_w1'].hourlyBuckets).length, 0);
  } finally {
    await teardown();
  }
});

test('Phase 46 — Lazy migration: old counter file without hourlyBuckets continues working', async () => {
  await setup();
  try {
    const { atomicWrite } = await import('../server/services/database.js');

    const counters = await freshImport();
    const c = counters._testHelpers.emptyCounters();

    // Simulate Phase 45 counter file (no per-entity hourlyBuckets)
    c.byEmployer['usr_e1'] = {
      total: 5, accepted: 3, declined: 1, expired: 1, withdrawn: 0,
      totalResponseMs: 90000, responseCount: 3, lastOfferAt: new Date().toISOString(),
      // NO hourlyBuckets field
    };
    c.platform.total = 5;
    c.platform.accepted = 3;
    c.platform.declined = 1;
    c.platform.expired = 1;
    await atomicWrite(counters._testHelpers.getCounterFilePath(), c);

    // Apply new event — should lazily initialize hourlyBuckets
    await counters.applyEvent('accepted', { offerId: 'dof_new', employerId: 'usr_e1', workerId: 'usr_w_new', responseMs: 30000 });

    const data = await counters.readCounters();
    const e = data.byEmployer['usr_e1'];
    assert.ok(e.hourlyBuckets, 'lazy migration: hourlyBuckets should be initialized');
    assert.strictEqual(e.accepted, 4); // 3 + 1
  } finally {
    await teardown();
  }
});

test('Phase 46 — getTopEmployers without buckets falls through (Phase 45 path)', async () => {
  await setup();
  try {
    const { atomicWrite } = await import('../server/services/database.js');

    const counters = await freshImport();
    const c = counters._testHelpers.emptyCounters();

    // Phase 45-style counter (no per-entity hourlyBuckets)
    c.byEmployer['usr_e1'] = {
      total: 10, accepted: 7, declined: 2, expired: 1, withdrawn: 0,
      totalResponseMs: 0, responseCount: 0, lastOfferAt: null,
    };
    c.platform.total = 10;
    c.platform.accepted = 7;
    await atomicWrite(counters._testHelpers.getCounterFilePath(), c);

    // No-date filter call (Phase 45 path) — should work
    const top = await counters.getTopEmployers({ limit: 10, minOffers: 3 });
    assert.ok(Array.isArray(top));
    const e1 = top.find(r => r.employerId === 'usr_e1');
    assert.ok(e1);
    assert.strictEqual(e1.total, 10);
    assert.strictEqual(e1.accepted, 7);
    assert.strictEqual(e1.acceptRate, 70); // 7/10
  } finally {
    await teardown();
  }
});
