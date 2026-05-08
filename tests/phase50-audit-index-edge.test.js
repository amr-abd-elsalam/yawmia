import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tempDir;
let db;
let auditIdx;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'yawmia-phase50-audit-edge-'));
  process.env.YAWMIA_DATA_PATH = tempDir;

  db = await import('../server/services/database.js?phase50edge=' + Date.now());
  await db.initDatabase();

  auditIdx = await import('../server/services/auditLogIndex.js?phase50edgeidx=' + Date.now());
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
  delete process.env.YAWMIA_DATA_PATH;
});

test('Phase 50: audit index path safety sanitizes unsafe components', () => {
  const h = auditIdx._testHelpers;

  assert.equal(h.safeSegment('../x'), 'x');
  assert.equal(h.safeSegment('a/b\\c'), 'a_b_c');
  assert.ok(h.safeSegment('<script>alert(1)</script>').length > 0);
  assert.ok(h.safeSegment('x'.repeat(200)).length <= 96);
});

test('Phase 50: audit tokenization caps token count', () => {
  const h = auditIdx._testHelpers;

  const record = {
    id: 'aud_token',
    action: 'test_action',
    adminId: 'adm',
    targetType: 'user',
    targetId: 'usr',
    ip: '127.0.0.1',
    details: Object.fromEntries(Array.from({ length: 200 }, (_, i) => ['k' + i, 'value' + i])),
    createdAt: new Date().toISOString(),
  };

  const tokens = h.tokenizeRecord(record);
  assert.ok(tokens.length <= 50);
});

test('Phase 50: audit index rebuild is idempotent', async () => {
  const { logAction } = await import('../server/services/auditLog.js?phase50edgeaudit=' + Date.now());

  await logAction({
    adminId: 'adm_idem',
    action: 'report_reviewed',
    targetType: 'report',
    targetId: 'rpt_1',
    details: { status: 'dismissed' },
    ip: '127.0.0.1',
  });

  const first = await auditIdx.rebuildAuditIndex();
  const stats1 = await auditIdx.getAuditIndexStats();

  const second = await auditIdx.rebuildAuditIndex();
  const stats2 = await auditIdx.getAuditIndexStats();

  assert.ok(first.indexed >= 1);
  assert.ok(second.indexed >= 1);
  assert.ok(stats1.recordCount >= 1);
  assert.equal(stats1.recordCount, stats2.recordCount);
});
