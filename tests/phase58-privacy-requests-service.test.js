import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTempDb() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase58-privacy-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const db = await import(`../server/services/database.js?privacy=${Date.now()}`);
  await db.initDatabase();

  return { dir };
}

test('privacy request create/list/get/cancel lifecycle', async () => {
  const { dir } = await setupTempDb();

  try {
    const svc = await import(`../server/services/privacyRequests.js?privacy=${Date.now()}`);

    const created = await svc.createPrivacyRequest({
      type: 'user_data_export',
      userId: 'usr_abc',
      requestedBy: 'adm_1',
      reason: 'user requested export',
    });

    assert.equal(created.ok, true);
    assert.equal(created.request.status, 'requested');

    const got = await svc.getPrivacyRequest(created.request.id);
    assert.equal(got.id, created.request.id);

    const listed = await svc.listPrivacyRequests({ limit: 10 });
    assert.equal(listed.total, 1);
    assert.equal(listed.requests[0].id, created.request.id);

    const cancelled = await svc.cancelPrivacyRequest(created.request.id, 'adm_2');
    assert.equal(cancelled.ok, true);
    assert.equal(cancelled.request.status, 'cancelled');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('privacy request rejects invalid type', async () => {
  const { dir } = await setupTempDb();

  try {
    const svc = await import(`../server/services/privacyRequests.js?privacy2=${Date.now()}`);

    const result = await svc.createPrivacyRequest({
      type: 'not_real',
      userId: 'usr_abc',
      requestedBy: 'adm_1',
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'INVALID_PRIVACY_REQUEST_TYPE');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
