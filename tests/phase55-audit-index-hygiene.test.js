import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase55-audit-hygiene-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const database = await import(`../server/services/database.js?x=${Date.now()}`);
  await database.initDatabase();

  const auditLog = await import(`../server/services/auditLog.js?x=${Date.now()}`);
  const auditIndex = await import(`../server/services/auditLogIndex.js?x=${Date.now()}`);

  return { dir, database, auditLog, auditIndex };
}

test('Phase 55: audit index hygiene stats include token index metrics', async () => {
  const { dir, auditLog, auditIndex } = await setup();

  try {
    await auditLog.logAction({
      adminId: 'admin_test',
      action: 'user_banned',
      targetType: 'user',
      targetId: 'usr_test',
      details: { reason: 'phase55 token hygiene' },
      ip: '127.0.0.1',
    });

    await auditIndex.rebuildAuditIndex();

    const stats = await auditIndex.getAuditIndexHygieneStats();

    assert.equal(stats.enabled, true);
    assert.equal(typeof stats.tokenIndex.fileCount, 'number');
    assert.equal(typeof stats.tokenIndex.totalSizeBytes, 'number');
    assert.equal(Array.isArray(stats.tokenIndex.largestTokenFiles), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
