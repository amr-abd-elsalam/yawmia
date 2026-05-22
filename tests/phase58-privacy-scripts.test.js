import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function parseJson(stdout) {
  const raw = String(stdout || '').trim();
  try {
    return JSON.parse(raw);
  } catch (_) {}

  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return JSON.parse(raw.slice(first, last + 1));
  }

  throw new Error('Could not parse JSON stdout');
}

async function setupTempDb(prefix) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  process.env.YAWMIA_DATA_PATH = dir;

  const db = await import(`../server/services/database.js?script=${Date.now()}${Math.random()}`);
  await db.initDatabase();

  return { dir, db };
}

test('verify-admin-rbac.js --json outputs valid JSON', () => {
  const proc = spawnSync(process.execPath, ['scripts/verify-admin-rbac.js', '--json'], {
    env: {
      ...process.env,
      ADMIN_TOKEN: 'test-token',
      NODE_ENV: 'development',
    },
    encoding: 'utf-8',
  });

  assert.equal(proc.status, 0, proc.stderr);
  const parsed = parseJson(proc.stdout);
  assert.equal(typeof parsed.ok, 'boolean');
  assert.ok(parsed.summary);
});

test('verify-privacy-governance.js --json outputs valid JSON', async () => {
  const { dir } = await setupTempDb('yawmia-phase58-privacy-script-');

  try {
    const proc = spawnSync(process.execPath, ['scripts/verify-privacy-governance.js', '--json'], {
      env: {
        ...process.env,
        YAWMIA_DATA_PATH: dir,
        ADMIN_TOKEN: 'test-token',
        NODE_ENV: 'development',
      },
      encoding: 'utf-8',
    });

    assert.equal(proc.status, 0, proc.stderr);
    const parsed = parseJson(proc.stdout);
    assert.equal(typeof parsed.ok, 'boolean');
    assert.ok(parsed.summary);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('export-user-data.js exports valid JSON for user', async () => {
  const { dir, db } = await setupTempDb('yawmia-phase58-export-script-');

  try {
    const userId = 'usr_script_export';
    const now = new Date().toISOString();

    await db.atomicWrite(db.getRecordPath('users', userId), {
      id: userId,
      phone: '01012345678',
      role: 'worker',
      name: 'Script User',
      status: 'active',
      createdAt: now,
    });

    const proc = spawnSync(process.execPath, ['scripts/export-user-data.js', `--userId=${userId}`], {
      env: {
        ...process.env,
        YAWMIA_DATA_PATH: dir,
        ADMIN_TOKEN: 'test-token',
      },
      encoding: 'utf-8',
    });

    assert.equal(proc.status, 0, proc.stderr);

    const parsed = parseJson(proc.stdout);
    assert.equal(parsed.userId, userId);
    assert.equal(parsed.user.phone, '01012345678');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('anonymize-user-data.js --dry-run does not mutate user', async () => {
  const { dir, db } = await setupTempDb('yawmia-phase58-anon-script-');

  try {
    const userId = 'usr_script_anon';
    const now = new Date().toISOString();

    await db.atomicWrite(db.getRecordPath('users', userId), {
      id: userId,
      phone: '01012345678',
      role: 'worker',
      name: 'Script User',
      governorate: 'cairo',
      lat: 30,
      lng: 31,
      status: 'active',
      createdAt: now,
    });

    const proc = spawnSync(process.execPath, ['scripts/anonymize-user-data.js', `--userId=${userId}`, '--dry-run'], {
      env: {
        ...process.env,
        YAWMIA_DATA_PATH: dir,
        ADMIN_TOKEN: 'test-token',
      },
      encoding: 'utf-8',
    });

    assert.equal(proc.status, 0, proc.stderr);

    const user = await db.readJSON(db.getRecordPath('users', userId));
    assert.equal(user.phone, '01012345678');
    assert.equal(user.name, 'Script User');
    assert.equal(user.status, 'active');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('anonymize-user-data.js --confirm mutates expected fields', async () => {
  const { dir, db } = await setupTempDb('yawmia-phase58-anon-confirm-script-');

  try {
    const userId = 'usr_script_anon_confirm';
    const now = new Date().toISOString();

    await db.atomicWrite(db.getRecordPath('users', userId), {
      id: userId,
      phone: '01012345678',
      role: 'worker',
      name: 'Script User',
      governorate: 'cairo',
      lat: 30,
      lng: 31,
      categories: ['cleaning'],
      status: 'active',
      createdAt: now,
    });

    const proc = spawnSync(process.execPath, ['scripts/anonymize-user-data.js', `--userId=${userId}`, '--confirm'], {
      env: {
        ...process.env,
        YAWMIA_DATA_PATH: dir,
        ADMIN_TOKEN: 'test-token',
      },
      encoding: 'utf-8',
    });

    assert.equal(proc.status, 0, proc.stderr);

    const user = await db.readJSON(db.getRecordPath('users', userId));
    assert.equal(user.name, 'مستخدم محذوف');
    assert.equal(user.status, 'anonymized');
    assert.equal(user.governorate, null);
    assert.equal(user.lat, null);
    assert.equal(user.lng, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
