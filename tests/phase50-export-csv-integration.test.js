import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Phase 50: audit CSV stream updates persistent export registry', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'yawmia-phase50-csv-registry-'));
  process.env.YAWMIA_DATA_PATH = tempDir;

  try {
    const db = await import('../server/services/database.js?phase50csv=' + Date.now());
    await db.initDatabase();

    const { logAction } = await import('../server/services/auditLog.js?phase50csv=' + Date.now());
    const registry = await import('../server/services/exportRegistry.js?phase50csv=' + Date.now());
    const { createCsvExportStream } = await import('../server/services/auditLogSearch.js?phase50csv=' + Date.now());

    await logAction({
      adminId: 'adm_csv',
      action: 'user_banned',
      targetType: 'user',
      targetId: 'usr_csv',
      details: { reason: 'csv integration' },
      ip: '127.0.0.1',
    });

    const exp = await registry.createExport({
      type: 'audit_csv',
      filters: { action: 'user_banned' },
      requestedBy: 'adm_csv',
      totalEstimate: 1,
    });

    const chunks = [];
    const stream = createCsvExportStream({
      action: 'user_banned',
      exportId: exp.id,
      persistFilePath: registry.getExportCsvAbsolutePath(exp.id),
    });

    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    const csv = chunks.join('');
    assert.match(csv, /user_banned/);

    const final = await registry.getExport(exp.id);
    assert.equal(final.status, 'completed');
    assert.equal(final.percentage, 100);
    assert.equal(await registry.exportFileExists(exp.id), true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    delete process.env.YAWMIA_DATA_PATH;
  }
});
