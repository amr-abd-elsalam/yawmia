import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTempDb() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase58-anon-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const db = await import(`../server/services/database.js?anon=${Date.now()}`);
  await db.initDatabase();

  return { dir, db };
}

test('anonymization preview does not mutate user', async () => {
  const { dir, db } = await setupTempDb();

  try {
    const userId = 'usr_anon_preview';
    const now = new Date().toISOString();

    await db.atomicWrite(db.getRecordPath('users', userId), {
      id: userId,
      phone: '01012345678',
      role: 'worker',
      name: 'Original Name',
      governorate: 'cairo',
      categories: ['cleaning'],
      lat: 30,
      lng: 31,
      status: 'active',
      createdAt: now,
    });

    const anon = await import(`../server/services/userAnonymization.js?preview=${Date.now()}`);
    const preview = await anon.previewUserAnonymization(userId);

    assert.equal(preview.ok, true);
    assert.equal(preview.dryRun, true);

    const user = await db.readJSON(db.getRecordPath('users', userId));
    assert.equal(user.phone, '01012345678');
    assert.equal(user.name, 'Original Name');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('anonymization confirm removes phone/name/location and destroys sessions', async () => {
  const { dir, db } = await setupTempDb();

  try {
    const userId = 'usr_anon_confirm';
    const now = new Date().toISOString();

    await db.atomicWrite(db.getRecordPath('users', userId), {
      id: userId,
      phone: '01012345678',
      role: 'worker',
      name: 'Original Name',
      governorate: 'cairo',
      categories: ['cleaning'],
      lat: 30,
      lng: 31,
      status: 'active',
      createdAt: now,
    });

    await db.atomicWrite(db.getRecordPath('sessions', 'ses_anon'), {
      token: 'ses_anon',
      userId,
      role: 'worker',
      createdAt: now,
      expiresAt: new Date(Date.now() + 100000).toISOString(),
    });

    await db.atomicWrite(db.getRecordPath('verifications', 'vrf_anon'), {
      id: 'vrf_anon',
      userId,
      status: 'pending',
      nationalIdImageRef: 'img_abc',
      selfieImageRef: 'img_def',
      createdAt: now,
    });

    const anon = await import(`../server/services/userAnonymization.js?confirm=${Date.now()}`);
    const result = await anon.anonymizeUserData(userId, { dryRun: false });

    assert.equal(result.ok, true);

    const user = await db.readJSON(db.getRecordPath('users', userId));
    assert.equal(user.status, 'anonymized');
    assert.equal(user.name, 'مستخدم محذوف');
    assert.equal(user.governorate, null);
    assert.equal(user.lat, null);
    assert.equal(user.lng, null);
    assert.equal(user.categories.length, 0);

    const session = await db.readJSON(db.getRecordPath('sessions', 'ses_anon'));
    assert.equal(session, null);

    const vrf = await db.readJSON(db.getRecordPath('verifications', 'vrf_anon'));
    assert.equal(vrf.nationalIdImageRef, null);
    assert.equal(vrf.selfieImageRef, null);

    const again = await anon.anonymizeUserData(userId, { dryRun: false });
    assert.equal(again.ok, true);
    assert.equal(again.idempotent, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
