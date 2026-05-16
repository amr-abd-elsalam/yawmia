import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase55-audit-token-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const database = await import(`../server/services/database.js?x=${Date.now()}`);
  await database.initDatabase();

  const auditLog = await import(`../server/services/auditLog.js?x=${Date.now()}`);
  const auditIndex = await import(`../server/services/auditLogIndex.js?x=${Date.now()}`);

  return { dir, database, auditLog, auditIndex };
}

test('Phase 55: audit token compaction runs safely', async () => {
  const { dir, auditLog, auditIndex } = await setup();

  try {
    const rec = await auditLog.logAction({
      adminId: 'admin_test',
      action: 'user_banned',
      targetType: 'user',
      targetId: 'usr_token_compact',
      details: { reason: 'duplicate duplicate duplicate' },
      ip: '127.0.0.1',
    });

    await auditIndex.rebuildAuditIndex();

    const result = await auditIndex.compactAuditTokenIndex();

    assert.equal(result.ok, true);
    assert.equal(result.scannedFiles >= 0, true);

    const search = await auditIndex.searchAuditIndex({ q: 'duplicate', limit: 10 });
    assert.equal(search.fallbackRequired, undefined);
    assert.equal(Array.isArray(search.entries), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
