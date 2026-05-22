import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTempDb() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase58-export-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const db = await import(`../server/services/database.js?export=${Date.now()}`);
  await db.initDatabase();

  return { dir, db };
}

test('user data export excludes session tokens and raw identity images', async () => {
  const { dir, db } = await setupTempDb();

  try {
    const userId = 'usr_export';
    const otherUserId = 'usr_other';
    const now = new Date().toISOString();

    await db.atomicWrite(db.getRecordPath('users', userId), {
      id: userId,
      phone: '01012345678',
      role: 'worker',
      name: 'Worker Name',
      governorate: 'cairo',
      categories: ['cleaning'],
      lat: 30,
      lng: 31,
      rating: { avg: 0, count: 0 },
      status: 'active',
      createdAt: now,
    });

    await db.atomicWrite(db.getRecordPath('users', otherUserId), {
      id: otherUserId,
      phone: '01099999999',
      role: 'employer',
      name: 'Employer Name',
      status: 'active',
      createdAt: now,
    });

    await db.atomicWrite(db.getRecordPath('sessions', 'ses_secret'), {
      token: 'ses_secret',
      userId,
      role: 'worker',
      ip: '127.0.0.1',
      userAgent: 'test',
      createdAt: now,
      expiresAt: new Date(Date.now() + 100000).toISOString(),
    });

    await db.atomicWrite(db.getRecordPath('verifications', 'vrf_export'), {
      id: 'vrf_export',
      userId,
      status: 'pending',
      nationalIdImageRef: 'img_secret',
      selfieImage: 'data:image/png;base64,secret',
      createdAt: now,
    });

    await db.atomicWrite(db.getWriteRecordPath('direct_offers', 'dof_export'), {
      id: 'dof_export',
      employerId: otherUserId,
      workerId: userId,
      status: 'accepted',
      revealedToWorker: {
        employerId: otherUserId,
        employerName: 'Employer Name',
        employerPhone: '01099999999',
      },
      revealedToEmployer: {
        workerId: userId,
        workerName: 'Worker Name',
        workerPhone: '01012345678',
      },
      createdAt: now,
      updatedAt: now,
    });

    const exporter = await import(`../server/services/userDataExport.js?export=${Date.now()}`);
    const result = await exporter.generateUserDataExport(userId);

    assert.equal(result.ok, true);

    const json = JSON.stringify(result.export);

    assert.match(json, /"token":"\[redacted\]"/);
    assert.doesNotMatch(json, /ses_secret/);
    assert.doesNotMatch(json, /data:image\/png;base64,secret/);
    assert.doesNotMatch(json, /img_secret/);

    // Third-party employer phone should be redacted.
    assert.doesNotMatch(json, /01099999999/);

    // Own phone can appear in own profile export.
    assert.match(json, /01012345678/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('persist user data export writes JSON file', async () => {
  const { dir, db } = await setupTempDb();

  try {
    const userId = 'usr_export_persist';
    const now = new Date().toISOString();

    await db.atomicWrite(db.getRecordPath('users', userId), {
      id: userId,
      phone: '01012345678',
      role: 'worker',
      name: 'Worker',
      status: 'active',
      createdAt: now,
    });

    const exporter = await import(`../server/services/userDataExport.js?persist=${Date.now()}`);
    const result = await exporter.persistUserDataExport('prq_test', userId);

    assert.equal(result.ok, true);
    assert.ok(result.filePath.endsWith('prq_test-export.json'));

    const raw = await readFile(result.filePath, 'utf-8');
    const parsed = JSON.parse(raw);

    assert.equal(parsed.userId, userId);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
