// tests/sessions.test.js
// ═══════════════════════════════════════════════════════════════
// Session Service Tests (~10 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpDir;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-session-test-'));
  const dirs = ['users', 'sessions', 'jobs', 'applications', 'otp'];
  for (const d of dirs) {
    await mkdir(join(tmpDir, d), { recursive: true });
  }
  process.env.YAWMIA_DATA_PATH = tmpDir;
});

after(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

let createSession, verifySession, destroySession, cleanExpired;
let db;

before(async () => {
  const mod = await import('../server/services/sessions.js');
  createSession = mod.createSession;
  verifySession = mod.verifySession;
  destroySession = mod.destroySession;
  cleanExpired = mod.cleanExpired;
  db = await import('../server/services/database.js');
});

describe('Sessions Service', () => {

  it('S-01: creates session with valid token format', async () => {
    const session = await createSession('usr_abc123', 'worker');
    assert.ok(session.token);
    assert.ok(session.token.startsWith('ses_'));
    assert.strictEqual(session.userId, 'usr_abc123');
    assert.strictEqual(session.role, 'worker');
    assert.ok(session.createdAt);
    assert.ok(session.expiresAt);
  });

  it('S-02: session file is persisted', async () => {
    const session = await createSession('usr_def456', 'employer');
    const data = await db.readJSON(db.getRecordPath('sessions', session.token));
    assert.ok(data);
    assert.strictEqual(data.userId, 'usr_def456');
  });

  it('S-03: verifies valid session', async () => {
    const session = await createSession('usr_ghi789', 'worker');
    const verified = await verifySession(session.token);
    assert.ok(verified);
    assert.strictEqual(verified.userId, 'usr_ghi789');
    assert.strictEqual(verified.role, 'worker');
  });

  it('S-04: returns null for non-existent token', async () => {
    const result = await verifySession('ses_nonexistent1234567890123456');
    assert.strictEqual(result, null);
  });

  it('S-05: returns null for empty/null token', async () => {
    assert.strictEqual(await verifySession(''), null);
    assert.strictEqual(await verifySession(null), null);
  });

  it('S-06: returns null for expired session', async () => {
    const session = await createSession('usr_expired01', 'worker');
    // Manually expire the session
    const sessionPath = db.getRecordPath('sessions', session.token);
    const data = await db.readJSON(sessionPath);
    data.expiresAt = new Date(Date.now() - 1000).toISOString();
    await db.atomicWrite(sessionPath, data);

    const result = await verifySession(session.token);
    assert.strictEqual(result, null);
  });

  it('S-07: destroys session', async () => {
    const session = await createSession('usr_destroy01', 'employer');
    const destroyed = await destroySession(session.token);
    assert.strictEqual(destroyed, true);

    const result = await verifySession(session.token);
    assert.strictEqual(result, null);
  });

  it('S-08: destroy returns false for non-existent session', async () => {
    const result = await destroySession('ses_doesnotexist12345678901234');
    assert.strictEqual(result, false);
  });

  it('S-09: session expires after TTL', async () => {
    const session = await createSession('usr_ttl01', 'worker');
    const data = await db.readJSON(db.getRecordPath('sessions', session.token));
    const expiresAt = new Date(data.expiresAt);
    const createdAt = new Date(data.createdAt);
    const diffDays = (expiresAt - createdAt) / (1000 * 60 * 60 * 24);
    assert.ok(diffDays >= 29 && diffDays <= 31, `TTL should be ~30 days, got ${diffDays}`);
  });

  it('S-10: cleanExpired removes expired sessions', async () => {
    // Create an expired session
    const session = await createSession('usr_cleanup01', 'worker');
    const sessionPath = db.getRecordPath('sessions', session.token);
    const data = await db.readJSON(sessionPath);
    data.expiresAt = new Date(Date.now() - 1000).toISOString();
    await db.atomicWrite(sessionPath, data);

    const cleaned = await cleanExpired();
    assert.ok(cleaned >= 1);
  });
});
