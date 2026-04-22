// ═══════════════════════════════════════════════════════════════
// server/services/sessions.js — Session CRUD (file-based)
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import { atomicWrite, readJSON, safeReadJSON, deleteJSON, listJSON, getRecordPath, getCollectionPath } from './database.js';

/**
 * Create a new session
 */
export async function createSession(userId, role) {
  const token = 'ses_' + crypto.randomBytes(16).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.SESSIONS.ttlDays * 24 * 60 * 60 * 1000);

  const session = {
    token,
    userId,
    role,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  const sessionPath = getRecordPath('sessions', token);
  await atomicWrite(sessionPath, session);

  return session;
}

/**
 * Verify a session token
 * @returns {object|null} session data or null if invalid/expired
 */
export async function verifySession(token) {
  if (!token || typeof token !== 'string') return null;

  const sessionPath = getRecordPath('sessions', token);
  const session = await safeReadJSON(sessionPath);

  if (!session) return null;

  // Check expiry
  if (new Date() > new Date(session.expiresAt)) {
    await deleteJSON(sessionPath);
    return null;
  }

  return session;
}

/**
 * Destroy a session
 */
export async function destroySession(token) {
  const sessionPath = getRecordPath('sessions', token);
  return await deleteJSON(sessionPath);
}

/**
 * Clean up expired sessions
 * Uses batch processing with event loop yielding to avoid blocking
 */
export async function cleanExpired() {
  const sessionsDir = getCollectionPath('sessions');

  let files;
  try {
    const { readdir } = await import('node:fs/promises');
    files = await readdir(sessionsDir);
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }

  const jsonFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.tmp') && f.startsWith('ses_'));
  let cleaned = 0;
  const now = new Date();
  const BATCH_SIZE = 100;
  const { join: joinPath } = await import('node:path');

  for (let i = 0; i < jsonFiles.length; i++) {
    const session = await readJSON(joinPath(sessionsDir, jsonFiles[i]));
    if (session && now > new Date(session.expiresAt)) {
      const sessionPath = getRecordPath('sessions', session.token);
      await deleteJSON(sessionPath);
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
    if (session.userId === userId) {
      const sessionPath = getRecordPath('sessions', session.token);
      await deleteJSON(sessionPath);
      destroyed++;
    }
  }

  return destroyed;
}
