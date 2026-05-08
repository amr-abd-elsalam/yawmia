import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Phase 50: audit index path safety sanitizes unsafe components', async () => {
  const mod = await import('../server/services/auditLogIndex.js?phase50edgesafe=' + Date.now());
  const h = mod._testHelpers;

  assert.equal(h.safeSegment('../x'), 'x');
  assert.equal(h.safeSegment('a/b\\c'), 'a_b_c');
  assert.ok(h.safeSegment('<script>alert(1)</script>').length > 0);
  assert.ok(h.safeSegment('x'.repeat(200)).length <= 96);
});

test('Phase 50: audit tokenization caps token count', async () => {
  const mod = await import('../server/services/auditLogIndex.js?phase50edgetoken=' + Date.now());
  const h = mod._testHelpers;

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
  const tempDir = await mkdtemp(join(tmpdir(), 'yawmia-phase50-audit-idempotent-'));
  process.env.YAWMIA_DATA_PATH = tempDir;

  try {
    const db = await import('../server/services/database.js?phase50auditidem=' + Date.now());
    await db.initDatabase();

    const { logAction } = await import('../server/services/auditLog.js?phase50auditidem=' + Date.now());
    const idx = await import('../server/services/auditLogIndex.js?phase50auditidem=' + Date.now());

    await logAction({
      adminId: 'adm_idem',
      action: 'report_reviewed',
      targetType: 'report',
      targetId: 'rpt_1',
      details: { status: 'dismissed' },
      ip: '127.0.0.1',
    });

    const first = await idx.rebuildAuditIndex();
    const stats1 = await idx.getAuditIndexStats();

    const second = await idx.rebuildAuditIndex();
    const stats2 = await idx.getAuditIndexStats();

    assert.equal(first.indexed, 1);
    assert.equal(second.indexed, 1);
    assert.equal(stats1.recordCount, 1);
    assert.equal(stats2.recordCount, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    delete process.env.YAWMIA_DATA_PATH;
  }
});
