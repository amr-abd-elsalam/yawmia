// ═══════════════════════════════════════════════════════════════
// tests/e2e/session-token-storage-characterization.test.js
// Patch 48 — Session Token Storage Characterization
// ═══════════════════════════════════════════════════════════════
// Goal:
//   Characterize current session storage as plaintext bearer-token
//   storage at rest.
//
// Current runtime behavior:
//   - createSession() creates a raw bearer token like ses_xxx
//   - session JSON stores the raw token in session.token
//   - session filename/path is derived from the raw token
//   - verifySession(token) reads by raw token
//   - destroySession(token) deletes by raw token
//   - destroyAllByUser() relies on stored raw session.token values
//
// This test intentionally documents a production security gap.
// It must not be interpreted as production readiness proof.
//
// Safety:
//   - temp YAWMIA_DATA_PATH only
//   - no ./data mutation
//   - no server.js import
//   - no router.js import
//   - no queue workers
//   - no schedulers
//   - no external services
//   - no --confirm scripts
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';

let importCounter = 0;

async function importFresh(path) {
  importCounter++;
  return await import(`${path}?session-token-storage=${Date.now()}-${importCounter}`);
}

async function setupIsolatedDataPath(t) {
  const dataPath = await mkdtemp(join(tmpdir(), 'yawmia-session-token-storage-'));

  process.env.NODE_ENV = 'test';
  process.env.YAWMIA_DATA_PATH = dataPath;
  process.env.ADMIN_TOKEN = 'test-admin-token';

  const database = await importFresh('../../server/services/database.js');
  await database.initDatabase();

  t.after(async () => {
    delete process.env.YAWMIA_DATA_PATH;
    await rm(dataPath, { recursive: true, force: true });
  });

  return { dataPath, database };
}

test('createSession stores only tokenHash at rest while returning raw bearer token to client', async (t) => {
  const { database } = await setupIsolatedDataPath(t);
  const sessions = await importFresh('../../server/services/sessions.js');

  const session = await sessions.createSession('usr_hashed_session_owner', 'worker', {
    ip: '127.0.0.1',
    userAgent: 'session-token-hashing-runtime-hardening-test',
  });

  assert.match(
    session.token,
    /^ses_[a-f0-9]{32}$/,
    'session token remains a raw bearer credential returned to the client'
  );

  assert.match(
    session.id,
    /^sth_[a-f0-9]{48}$/,
    'session record id is derived from a token HMAC, not from the raw token'
  );

  const sessionPath = database.getRecordPath('sessions', session.id);

  assert.equal(
    basename(sessionPath),
    `${session.id}.json`,
    'session filename is hash-derived'
  );

  assert.notEqual(
    basename(sessionPath),
    `${session.token}.json`,
    'session filename must not be derived from raw bearer token'
  );

  const raw = await readFile(sessionPath, 'utf-8');
  assert.equal(
    raw.includes(session.token),
    false,
    'persisted session JSON must not contain raw bearer token'
  );

  const stored = await database.readJSON(sessionPath);

  assert.ok(stored, 'session JSON should be persisted');
  assert.equal(stored.id, session.id);
  assert.equal(stored.userId, 'usr_hashed_session_owner');
  assert.equal(stored.role, 'worker');
  assert.equal(stored.ip, '127.0.0.1');
  assert.equal(stored.userAgent, 'session-token-hashing-runtime-hardening-test');
  assert.equal(stored.token, undefined, 'session JSON must not store plaintext token');
  assert.match(stored.tokenHash, /^[a-f0-9]{64}$/);

  const verified = await sessions.verifySession(session.token);

  assert.ok(verified, 'verifySession accepts the raw bearer token');
  assert.equal(verified.userId, 'usr_hashed_session_owner');
  assert.equal(verified.id, session.id);
  assert.equal(
    verified.token,
    session.token,
    'verifySession may attach runtime token for compatibility without persisting it'
  );

  const destroyed = await sessions.destroySession(session.token);
  assert.equal(
    destroyed,
    true,
    'destroySession deletes by hashing incoming raw bearer token'
  );

  const afterDestroy = await database.readJSON(sessionPath);
  assert.equal(afterDestroy, null);
});

test('destroyAllByUser deletes hashed sessions without relying on stored plaintext tokens', async (t) => {
  const { database } = await setupIsolatedDataPath(t);
  const sessions = await importFresh('../../server/services/sessions.js');

  const userId = 'usr_destroy_all_hashed_owner';

  const sessionA = await sessions.createSession(userId, 'worker', {
    ip: '127.0.0.1',
    userAgent: 'device-a',
  });

  const sessionB = await sessions.createSession(userId, 'worker', {
    ip: '127.0.0.2',
    userAgent: 'device-b',
  });

  assert.notEqual(sessionA.token, sessionB.token);
  assert.notEqual(sessionA.id, sessionB.id);

  const sessionsDir = database.getCollectionPath('sessions');
  const storedBefore = await database.listJSON(sessionsDir);

  const storedForUser = storedBefore
    .filter(s => s && s.userId === userId)
    .sort((a, b) => a.id.localeCompare(b.id));

  assert.equal(storedForUser.length, 2);

  for (const stored of storedForUser) {
    assert.match(stored.id, /^sth_[a-f0-9]{48}$/);
    assert.match(stored.tokenHash, /^[a-f0-9]{64}$/);
    assert.equal(stored.token, undefined, 'stored session must not contain raw token');
  }

  const destroyed = await sessions.destroyAllByUser(userId);
  assert.equal(destroyed, 2);

  const storedAfter = await database.listJSON(sessionsDir);
  const remainingForUser = storedAfter.filter(s => s && s.userId === userId);

  assert.equal(
    remainingForUser.length,
    0,
    'destroyAllByUser deletes sessions by hashed session id'
  );
});

test('session service source hashes tokens at rest and keeps legacy read path temporary', async () => {
  const { default: config } = await importFresh('../../config.js');

  const sessionsSource = await readFile(
    new URL('../../server/services/sessions.js', import.meta.url),
    'utf-8'
  );

  assert.match(
    sessionsSource,
    /const token = 'ses_' \+ crypto\.randomBytes\(16\)\.toString\('hex'\);/,
    'createSession still generates a raw ses_* bearer token for the client'
  );

  assert.match(
    sessionsSource,
    /crypto\s*\.\s*createHmac\(/,
    'session service uses HMAC for session token hashing'
  );

  assert.match(
    sessionsSource,
    /tokenHash/,
    'session service persists tokenHash'
  );

  assert.match(
    sessionsSource,
    /sessionRecordIdForToken/,
    'session service derives record id from token hash'
  );

  assert.match(
    sessionsSource,
    /legacyPlaintextReadEnabled/,
    'session service keeps explicit temporary legacy plaintext migration path'
  );

  assert.equal(
    sessionsSource.includes('const sessionPath = getRecordPath(\'sessions\', token);'),
    false,
    'session path must not be derived from raw token'
  );

  assert.equal(
    sessionsSource.includes('const session = {\n    token,'),
    false,
    'session object must not persist token as a top-level stored field'
  );

  assert.equal(
    config.SESSIONS.hashTokensAtRest,
    true,
    'config enables session-token-at-rest hashing'
  );

  assert.equal(
    config.SESSIONS.requireHashSecretInProduction,
    true,
    'production requires SESSION_TOKEN_HASH_SECRET'
  );
});
