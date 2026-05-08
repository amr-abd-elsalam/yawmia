import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tempDir;
let db;
let logAction;
let auditIdx;
let auditSearch;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'yawmia-phase50-audit-'));
  process.env.YAWMIA_DATA_PATH = tempDir;

  db = await import('../server/services/database.js?phase50auditdb=' + Date.now());
  await db.initDatabase();

  ({ logAction } = await import('../server/services/auditLog.js?phase50auditlog=' + Date.now()));
  auditIdx = await import('../server/services/auditLogIndex.js?phase50auditidx=' + Date.now());
  auditSearch = await import('../server/services/auditLogSearch.js?phase50auditsearch=' + Date.now());
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
  delete process.env.YAWMIA_DATA_PATH;
});

test('Phase 50: audit index rebuild/search/verify basic flow', async () => {
  await logAction({
    adminId: 'adm_one',
    action: 'user_banned',
    targetType: 'user',
    targetId: 'usr_a',
    details: { reason: 'spam worker offers' },
    ip: '127.0.0.1',
  });

  await logAction({
    adminId: 'adm_two',
    action: 'payment_completed',
    targetType: 'payment',
    targetId: 'pay_a',
    details: { amount: 500 },
    ip: '127.0.0.1',
  });

  const rebuild = await auditIdx.rebuildAuditIndex();
  assert.ok(rebuild.indexed >= 2);

  const status = await auditIdx.getAuditIndexStats();
  assert.equal(status.status, 'healthy');
  assert.ok(status.recordCount >= 2);

  const byAction = await auditSearch.searchActions({ action: 'user_banned', limit: 10 });
  assert.equal(byAction.indexed, true);
  assert.equal(byAction.fallbackUsed, false);
  assert.equal(byAction.entries.length, 1);
  assert.equal(byAction.entries[0].action, 'user_banned');

  const byQ = await auditSearch.searchActions({ q: 'spam', limit: 10 });
  assert.equal(byQ.indexed, true);
  assert.equal(byQ.entries.length, 1);
  assert.equal(byQ.entries[0].targetId, 'usr_a');

  const verify = await auditIdx.verifyAuditIndex({ sampleSize: 10 });
  assert.equal(verify.ok, true);
});

test('Phase 50: audit search falls back to full scan when index is stale', async () => {
  await logAction({
    adminId: 'adm_fallback',
    action: 'verification_reviewed',
    targetType: 'verification',
    targetId: 'vrf_a',
    details: { status: 'verified' },
    ip: '127.0.0.1',
  });

  await auditIdx.markAuditIndexStale('test_stale');

  const result = await auditSearch.searchActions({
    action: 'verification_reviewed',
    limit: 10,
  });

  assert.equal(result.indexed, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].targetId, 'vrf_a');

  // Restore healthy index for any later tests in same process.
  await auditIdx.rebuildAuditIndex();
});
