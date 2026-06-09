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

test('createSession persists raw bearer token in session JSON and filename', async (t) => {
  const { database } = await setupIsolatedDataPath(t);
  const sessions = await importFresh('../../server/services/sessions.js');

  const session = await sessions.createSession('usr_plaintext_session_owner', 'worker', {
    ip: '127.0.0.1',
    userAgent: 'session-token-storage-characterization-test',
  });

  assert.match(
    session.token,
    /^ses_[a-f0-9]{32}$/,
    'session token is a raw bearer credential returned to the client'
  );

  const sessionPath = database.getRecordPath('sessions', session.token);

  assert.equal(
    basename(sessionPath),
    `${session.token}.json`,
    'session filename is derived from the raw bearer token'
  );

  const stored = await database.readJSON(sessionPath);

  assert.ok(stored, 'session JSON should be persisted');
  assert.equal(
    stored.token,
    session.token,
    'session JSON stores the raw bearer token as plaintext'
  );

  assert.equal(stored.userId, 'usr_plaintext_session_owner');
  assert.equal(stored.role, 'worker');
  assert.equal(stored.ip, '127.0.0.1');
  assert.equal(stored.userAgent, 'session-token-storage-characterization-test');

  const verified = await sessions.verifySession(session.token);

  assert.ok(verified, 'verifySession accepts the raw bearer token');
  assert.equal(
    verified.token,
    session.token,
    'verifySession returns a session object containing the raw bearer token'
  );

  const destroyed = await sessions.destroySession(session.token);
  assert.equal(
    destroyed,
    true,
    'destroySession deletes by raw bearer token'
  );

  const afterDestroy = await database.readJSON(sessionPath);
  assert.equal(afterDestroy, null);
});

test('destroyAllByUser relies on stored plaintext session.token values', async (t) => {
  const { database } = await setupIsolatedDataPath(t);
  const sessions = await importFresh('../../server/services/sessions.js');

  const userId = 'usr_destroy_all_plaintext_owner';

  const sessionA = await sessions.createSession(userId, 'worker', {
    ip: '127.0.0.1',
    userAgent: 'device-a',
  });

  const sessionB = await sessions.createSession(userId, 'worker', {
    ip: '127.0.0.2',
    userAgent: 'device-b',
  });

  assert.notEqual(sessionA.token, sessionB.token);

  const sessionsDir = database.getCollectionPath('sessions');
  const storedBefore = await database.listJSON(sessionsDir);

  const storedTokens = storedBefore
    .filter(s => s && s.userId === userId)
    .map(s => s.token)
    .sort();

  assert.deepEqual(
    storedTokens,
    [sessionA.token, sessionB.token].sort(),
    'listing session files exposes raw bearer tokens at rest'
  );

  const destroyed = await sessions.destroyAllByUser(userId);
  assert.equal(destroyed, 2);

  const storedAfter = await database.listJSON(sessionsDir);
  const remainingForUser = storedAfter.filter(s => s && s.userId === userId);

  assert.equal(
    remainingForUser.length,
    0,
    'destroyAllByUser deletes sessions by reading stored raw token values'
  );
});

test('session service source uses raw token lookup and has no token hashing at rest', async () => {
  const { default: config } = await importFresh('../../config.js');

  const sessionsSource = await readFile(
    new URL('../../server/services/sessions.js', import.meta.url),
    'utf-8'
  );

  assert.match(
    sessionsSource,
    /const token = 'ses_' \+ crypto\.randomBytes\(16\)\.toString\('hex'\);/,
    'createSession generates a raw ses_* bearer token'
  );

  assert.match(
    sessionsSource,
    /const session = \{\s*token,/s,
    'session object persists token as a top-level field'
  );

  assert.match(
    sessionsSource,
    /const sessionPath = getRecordPath\('sessions', token\);/,
    'session path is derived from raw token'
  );

  assert.match(
    sessionsSource,
    /const session = await safeReadJSON\(sessionPath\);/,
    'verifySession reads session JSON by raw token path'
  );

  assert.match(
    sessionsSource,
    /return await deleteJSON\(sessionPath\);/,
    'destroySession deletes session JSON by raw token path'
  );

  assert.match(
    sessionsSource,
    /f\.startsWith\('ses_'\)/,
    'session cleanup scans raw-token-style filenames'
  );

  assert.match(
    sessionsSource,
    /getRecordPath\('sessions', session\.token\)/,
    'cleanup/destroy-all paths rely on stored session.token'
  );

  assert.equal(
    sessionsSource.includes('tokenHash'),
    false,
    'current session service has no tokenHash field'
  );

  assert.equal(
    sessionsSource.includes('createHash'),
    false,
    'current session service does not hash session tokens at rest'
  );

  assert.equal(
    sessionsSource.includes('createHmac'),
    false,
    'current session service does not use HMAC for session token lookup'
  );

  assert.equal(
    config.SESSIONS.hashTokensAtRest,
    undefined,
    'current config exposes no session-token-at-rest hashing switch'
  );
});
