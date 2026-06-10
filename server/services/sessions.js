// ═══════════════════════════════════════════════════════════════
// server/services/sessions.js — Session CRUD (file-based)
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
import { atomicWrite, readJSON, safeReadJSON, deleteJSON, listJSON, getRecordPath, getCollectionPath, isValidId } from './database.js';

const HASHED_SESSION_PREFIX = config.SESSIONS.hashIdPrefix || 'sth_';

export function getSessionHashSecret() {
  const explicit = process.env.SESSION_TOKEN_HASH_SECRET;

  if (explicit) return explicit;

  if (config.SESSIONS.requireHashSecretInProduction !== false && config.ENV && config.ENV.isProduction) {
    throw new Error('SESSION_TOKEN_HASH_SECRET is required in production');
  }

  // Development/test fallback only. Never acceptable as production secret.
  return process.env.ADMIN_TOKEN || 'yawmia-dev-session-token-hash-secret';
}

export function hashSessionToken(token) {
  return crypto
    .createHmac(config.SESSIONS.hashAlgorithm || 'sha256', getSessionHashSecret())
    .update(String(token || ''))
    .digest('hex');
}

export function sessionRecordIdForToken(token) {
  const len = Math.max(24, Number(config.SESSIONS.hashIdLength) || 48);
  return HASHED_SESSION_PREFIX + hashSessionToken(token).slice(0, len);
}

function hashedSessionPath(token) {
  return getRecordPath('sessions', sessionRecordIdForToken(token));
}

function legacyPlaintextReadEnabled() {
  return config.SESSIONS.legacyPlaintextReadEnabled !== false;
}

function legacySessionPath(token) {
  if (!legacyPlaintextReadEnabled()) return null;
  if (!isValidId(token)) return null;
  return getRecordPath('sessions', token);
}

function buildSessionRecord(token, userId, role, expiresAt, metadata) {
  const now = new Date().toISOString();
  const tokenHash = hashSessionToken(token);
  const id = sessionRecordIdForToken(token);

  const session = {
    id,
    tokenHash,
    userId,
    role,
    createdAt: now,
    expiresAt: expiresAt.toISOString(),
  };

  if (config.SESSIONS.trackMetadata && metadata) {
    session.ip = metadata.ip || null;
    session.userAgent = metadata.userAgent || null;
  }

  return session;
}

function attachRuntimeToken(session, token) {
  if (!session) return null;

  // Runtime compatibility only. This object is not persisted by sessions.js.
  return {
    ...session,
    token,
  };
}

async function migrateLegacySession(token, legacySession) {
  if (!legacySession || !legacySession.userId || !legacySession.expiresAt) return legacySession;

  const expiresAt = new Date(legacySession.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) return legacySession;

  const migrated = {
    id: sessionRecordIdForToken(token),
    tokenHash: hashSessionToken(token),
    userId: legacySession.userId,
    role: legacySession.role,
    createdAt: legacySession.createdAt || new Date().toISOString(),
    expiresAt: legacySession.expiresAt,
  };

  if (config.SESSIONS.trackMetadata) {
    if (legacySession.ip !== undefined) migrated.ip = legacySession.ip;
    if (legacySession.userAgent !== undefined) migrated.userAgent = legacySession.userAgent;
  }

  await atomicWrite(hashedSessionPath(token), migrated);

  const legacyPath = legacySessionPath(token);
  if (legacyPath) {
    await deleteJSON(legacyPath).catch(() => {});
  }

  return migrated;
}

/**
 * Create a new session
 */
export async function createSession(userId, role, metadata) {
  const token = 'ses_' + crypto.randomBytes(16).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.SESSIONS.ttlDays * 24 * 60 * 60 * 1000);

  const session = buildSessionRecord(token, userId, role, expiresAt, metadata);

  await atomicWrite(getRecordPath('sessions', session.id), session);

  return attachRuntimeToken(session, token);
}

/**
 * Rotate a session token — creates new session, destroys old.
 * New session is created FIRST to prevent auth failure window.
 * Graceful: if oldToken doesn't exist, just creates new.
 * @param {string} oldToken
 * @param {string} userId
 * @param {string} role
 * @param {object} [metadata] — { ip, userAgent }
 * @returns {Promise<object>} new session
 */
export async function rotateSession(oldToken, userId, role, metadata) {
  // Create new session first (no auth gap)
  const newSession = await createSession(userId, role, metadata);

  // Destroy old session (fire-and-forget)
  if (oldToken) {
    await destroySession(oldToken).catch(() => {});
  }

  return newSession;
}

/**
 * Verify a session token
 * @returns {object|null} session data or null if invalid/expired
 */
export async function verifySession(token) {
  if (!token || typeof token !== 'string') return null;

  const sessionPath = hashedSessionPath(token);
  let session = await safeReadJSON(sessionPath);

  if (!session && legacyPlaintextReadEnabled()) {
    const legacyPath = legacySessionPath(token);
    if (legacyPath) {
      const legacySession = await safeReadJSON(legacyPath);
      if (legacySession) {
        if (new Date() > new Date(legacySession.expiresAt)) {
          await deleteJSON(legacyPath).catch(() => {});
          return null;
        }

        session = await migrateLegacySession(token, legacySession);
      }
    }
  }

  if (!session) return null;

  if (session.token && session.token === token && !session.tokenHash) {
    session = await migrateLegacySession(token, session);
  }

  // Check expiry
  if (new Date() > new Date(session.expiresAt)) {
    await deleteJSON(getRecordPath('sessions', session.id || sessionRecordIdForToken(token))).catch(() => {});
    const legacyPath = legacySessionPath(token);
    if (legacyPath) await deleteJSON(legacyPath).catch(() => {});
    return null;
  }

  return attachRuntimeToken(session, token);
}

/**
 * Destroy a session
 */
export async function destroySession(token) {
  if (!token || typeof token !== 'string') return false;

  const deletedHashed = await deleteJSON(hashedSessionPath(token)).catch(() => false);

  let deletedLegacy = false;
  const legacyPath = legacySessionPath(token);
  if (legacyPath) {
    deletedLegacy = await deleteJSON(legacyPath).catch(() => false);
  }

  return !!(deletedHashed || deletedLegacy);
}

/**
 * Clean up expired sessions
 * Uses batch processing with event loop yielding to avoid blocking
 */
export async function cleanExpired() {
  const sessionsDir = getCollectionPath('sessions');

  let files;
  try {
    files = await readdir(sessionsDir);
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }

  const jsonFiles = files.filter(f =>
    f.endsWith('.json') &&
    !f.endsWith('.tmp') &&
    (f.startsWith(HASHED_SESSION_PREFIX) || f.startsWith('ses_'))
  );

  let cleaned = 0;
  const now = new Date();
  const BATCH_SIZE = 100;

  for (let i = 0; i < jsonFiles.length; i++) {
    const filePath = join(sessionsDir, jsonFiles[i]);
    const session = await readJSON(filePath);
    if (session && session.expiresAt && now > new Date(session.expiresAt)) {
      await deleteJSON(filePath);
      cleaned++;
    }

    // Yield to event loop every BATCH_SIZE files
    if ((i + 1) % BATCH_SIZE === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  return cleaned;
}

/**
 * Destroy all sessions for a specific user
 * @param {string} userId
 * @returns {Promise<number>} count of destroyed sessions
 */
export async function destroyAllByUser(userId) {
  const sessionsDir = getCollectionPath('sessions');
  const sessions = await listJSON(sessionsDir);
  let destroyed = 0;

  for (const session of sessions) {
    if (!session || session.userId !== userId) continue;

    let deleted = false;

    if (session.id && isValidId(session.id)) {
      deleted = await deleteJSON(getRecordPath('sessions', session.id)).catch(() => false);
    } else if (session.token && isValidId(session.token)) {
      deleted = await deleteJSON(getRecordPath('sessions', session.token)).catch(() => false);
    }

    if (deleted) destroyed++;
  }

  return destroyed;
}

export const _testHelpers = {
  HASHED_SESSION_PREFIX,
  getSessionHashSecret,
  hashSessionToken,
  sessionRecordIdForToken,
  legacyPlaintextReadEnabled,
  buildSessionRecord,
};
