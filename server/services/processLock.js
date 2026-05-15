// ═══════════════════════════════════════════════════════════════
// server/services/processLock.js — File-Backed Process Locks (Phase 54)
// ═══════════════════════════════════════════════════════════════
// Lightweight process/file lock for single-writer discipline.
// Not distributed consensus; intended for single VPS/shared filesystem guardrails.
// ═══════════════════════════════════════════════════════════════

import os from 'node:os';
import config from '../../config.js';
import {
  atomicWrite,
  readJSON,
  deleteJSON,
  getRecordPath,
  getCollectionPath,
  listJSON,
  isValidId,
} from './database.js';
import { withLock } from './resourceLock.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';
import { getInstanceId } from './instanceMode.js';

/** @type {Map<string, NodeJS.Timeout>} */
const heartbeatTimers = new Map();

function cfg() {
  return config.PROCESS_LOCKS || {};
}

function nowIso() {
  return new Date().toISOString();
}

function lockPath(lockName) {
  if (!isValidId(lockName)) {
    throw new Error(`Invalid process lock name: ${lockName}`);
  }
  return getRecordPath('ops_locks', lockName);
}

function expiresAtFromNow() {
  const staleAfterMs = cfg().staleAfterMs || (2 * 60 * 1000);
  return new Date(Date.now() + staleAfterMs).toISOString();
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined) continue;
    if (typeof value === 'string') out[key] = value.slice(0, 500);
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null) out[key] = value;
    else {
      try {
        out[key] = JSON.stringify(value).slice(0, 500);
      } catch (_) {
        out[key] = '[unserializable]';
      }
    }
  }
  return out;
}

export function isLockStale(lock) {
  if (!lock) return true;

  const expiresMs = lock.expiresAt ? new Date(lock.expiresAt).getTime() : 0;
  if (expiresMs > 0 && Date.now() > expiresMs) return true;

  const heartbeatMs = lock.heartbeatAt ? new Date(lock.heartbeatAt).getTime() : 0;
  const staleAfterMs = cfg().staleAfterMs || (2 * 60 * 1000);

  if (heartbeatMs > 0 && Date.now() - heartbeatMs > staleAfterMs) return true;

  return false;
}

export async function getProcessLock(lockName) {
  if (!lockName || typeof lockName !== 'string') return null;
  try {
    return await readJSON(lockPath(lockName));
  } catch (err) {
    logger.warn('processLock: getProcessLock failed', { lockName, error: err.message });
    return null;
  }
}

export async function listProcessLocks() {
  try {
    const dir = getCollectionPath('ops_locks');
    const locks = await listJSON(dir);
    return locks
      .filter(l => l && l.lockName)
      .map(l => ({ ...l, stale: isLockStale(l) }))
      .sort((a, b) => String(a.lockName).localeCompare(String(b.lockName)));
  } catch (err) {
    logger.warn('processLock: listProcessLocks failed', { error: err.message });
    return [];
  }
}

export async function acquireProcessLock(lockName, options = {}) {
  if (!cfg().enabled) {
    return {
      ok: true,
      disabled: true,
      lock: null,
      ownerId: options.ownerId || getInstanceId(),
    };
  }

  if (!lockName || typeof lockName !== 'string' || !isValidId(lockName)) {
    return { ok: false, code: 'INVALID_LOCK_NAME', error: 'Invalid lock name' };
  }

  const ownerId = options.ownerId || getInstanceId();
  const metadata = sanitizeMetadata(options.metadata || {});
  const autoRecover = options.autoRecoverStaleLocks !== undefined
    ? !!options.autoRecoverStaleLocks
    : cfg().autoRecoverStaleLocks !== false;

  return withLock(`process-lock:${lockName}`, async () => {
    const filePath = lockPath(lockName);
    const existing = await readJSON(filePath);

    const now = nowIso();

    if (!existing || existing.ownerId === ownerId || (autoRecover && isLockStale(existing))) {
      const recovered = !!(existing && existing.ownerId !== ownerId && isLockStale(existing));

      const lock = {
        lockName,
        ownerId,
        pid: process.pid,
        hostname: os.hostname(),
        acquiredAt: existing && existing.ownerId === ownerId ? (existing.acquiredAt || now) : now,
        heartbeatAt: now,
        expiresAt: expiresAtFromNow(),
        metadata,
        updatedAt: now,
      };

      await atomicWrite(filePath, lock);

      eventBus.emit(recovered ? 'process_lock:stale_recovered' : 'process_lock:acquired', {
        lockName,
        ownerId,
        previousOwnerId: existing ? existing.ownerId : null,
        timestamp: now,
      });

      return { ok: true, lock, recovered };
    }

    eventBus.emit('process_lock:acquire_failed', {
      lockName,
      ownerId,
      currentOwnerId: existing.ownerId,
      stale: isLockStale(existing),
      timestamp: now,
    });

    return {
      ok: false,
      code: 'LOCK_HELD',
      error: 'Process lock is held by another owner',
      lock: existing,
    };
  });
}

export async function renewProcessLock(lockName, ownerId) {
  if (!cfg().enabled) return { ok: true, disabled: true };

  if (!lockName || !ownerId) {
    return { ok: false, code: 'INVALID_RENEW_REQUEST' };
  }

  return withLock(`process-lock:${lockName}`, async () => {
    const filePath = lockPath(lockName);
    const lock = await readJSON(filePath);

    if (!lock) {
      return { ok: false, code: 'LOCK_NOT_FOUND' };
    }

    if (lock.ownerId !== ownerId) {
      return { ok: false, code: 'LOCK_NOT_OWNER', lock };
    }

    const now = nowIso();
    lock.heartbeatAt = now;
    lock.expiresAt = expiresAtFromNow();
    lock.updatedAt = now;

    await atomicWrite(filePath, lock);

    eventBus.emit('process_lock:heartbeat', {
      lockName,
      ownerId,
      timestamp: now,
    });

    return { ok: true, lock };
  });
}

export async function releaseProcessLock(lockName, ownerId) {
  if (!cfg().enabled) return { ok: true, disabled: true };

  if (!lockName || !ownerId) {
    return { ok: false, code: 'INVALID_RELEASE_REQUEST' };
  }

  return withLock(`process-lock:${lockName}`, async () => {
    const filePath = lockPath(lockName);
    const lock = await readJSON(filePath);

    if (!lock) {
      return { ok: true, released: false, code: 'LOCK_NOT_FOUND' };
    }

    if (lock.ownerId !== ownerId) {
      return { ok: false, code: 'LOCK_NOT_OWNER', lock };
    }

    stopLockHeartbeat(lockName);
    await deleteJSON(filePath);

    eventBus.emit('process_lock:released', {
      lockName,
      ownerId,
      timestamp: nowIso(),
    });

    return { ok: true, released: true };
  });
}

export function startLockHeartbeat(lockName, ownerId, options = {}) {
  if (!cfg().enabled) return null;
  if (!lockName || !ownerId) return null;

  stopLockHeartbeat(lockName);

  const intervalMs = options.heartbeatMs || cfg().heartbeatMs || 30000;

  const timer = setInterval(() => {
    renewProcessLock(lockName, ownerId).catch(err => {
      logger.warn('processLock: heartbeat failed', {
        lockName,
        ownerId,
        error: err.message,
      });
    });
  }, intervalMs);

  if (timer.unref) timer.unref();

  heartbeatTimers.set(lockName, timer);
  return timer;
}

export function stopLockHeartbeat(lockName) {
  const timer = heartbeatTimers.get(lockName);
  if (timer) {
    clearInterval(timer);
    heartbeatTimers.delete(lockName);
  }
}

export async function forceReleaseLock(lockName, adminId) {
  if (!cfg().enabled) return { ok: true, disabled: true };

  if (!lockName || typeof lockName !== 'string' || !isValidId(lockName)) {
    return { ok: false, code: 'INVALID_LOCK_NAME' };
  }

  return withLock(`process-lock:${lockName}`, async () => {
    const filePath = lockPath(lockName);
    const existing = await readJSON(filePath);

    stopLockHeartbeat(lockName);

    if (existing) {
      await deleteJSON(filePath);
    }

    eventBus.emit('process_lock:force_released', {
      lockName,
      previousOwnerId: existing ? existing.ownerId : null,
      adminId: adminId || 'admin_token',
      timestamp: nowIso(),
    });

    return { ok: true, released: !!existing, previousLock: existing || null };
  });
}

export const _testHelpers = {
  heartbeatTimers,
  stopAllHeartbeats: () => {
    for (const lockName of Array.from(heartbeatTimers.keys())) {
      stopLockHeartbeat(lockName);
    }
  },
  lockPath,
};
