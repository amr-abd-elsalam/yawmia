// ═══════════════════════════════════════════════════════════════
// server/services/resourceLock.js — In-Memory Mutex per Resource Key
// ═══════════════════════════════════════════════════════════════

/**
 * In-memory mutex map: key → Promise chain
 * Same key → serialized (waits for previous)
 * Different keys → fully concurrent
 * Lock released on success OR error (finally block)
 * Auto-cleanup after last operation per key
 * No deadlock risk (no nested locks on same key)
 * In-memory only — server restart clears all locks
 */
const locks = new Map();

/**
 * Execute fn() with exclusive access to the given resource key.
 * Concurrent calls with the SAME key are serialized.
 * Calls with DIFFERENT keys run concurrently.
 *
 * @param {string} key — resource identifier (e.g. 'apply:job_abc:usr_xyz')
 * @param {Function} fn — async function to execute under lock
 * @returns {Promise<*>} — result of fn()
 */
export function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();

  let releaseLock;
  const current = new Promise((resolve) => {
    releaseLock = resolve;
  });

  // Chain: wait for previous → run fn → release
  const execution = prev.then(async () => {
    try {
      return await fn();
    } finally {
      // Auto-cleanup: if this is still the current promise for this key, remove it
      if (locks.get(key) === current) {
        locks.delete(key);
      }
      releaseLock();
    }
  });

  // Store the release promise (not the execution) as the chain link
  locks.set(key, current);

  return execution;
}

/**
 * Get count of active lock keys (for monitoring/testing)
 * @returns {number}
 */
export function getLockCount() {
  return locks.size;
}

/**
 * Clear all locks (testing only)
 */
export function clearLocks() {
  locks.clear();
}
