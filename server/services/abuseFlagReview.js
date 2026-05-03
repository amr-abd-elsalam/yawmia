// ═══════════════════════════════════════════════════════════════
// server/services/abuseFlagReview.js — Abuse Flag Review State (Phase 45)
// ═══════════════════════════════════════════════════════════════
// Persistent review state per abuse flag fingerprint.
// Storage: data/abuse_flag_reviews/{fingerprint}.json (flat collection).
// Fingerprint = SHA256(flagType + employerId + workerId).
//
// Review decisions:
//   - 'dismissed' — admin reviewed and decided no action (currentStatus → 'dismissed')
//   - 'snoozed' — admin defers decision (currentStatus → 'snoozed', snoozeUntil set)
//   - 'warning' — admin sent warning (status unchanged — flag still active)
//   - 'actioned' — admin took definitive action e.g. ban (currentStatus → 'actioned')
//
// Snooze expiry is LAZY — checked on isCurrentlySnoozed call.
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import { atomicWrite, readJSON, getRecordPath, getCollectionPath, listJSON } from './database.js';
import { withLock } from './resourceLock.js';
import { logger } from './logger.js';

/**
 * Compute deterministic fingerprint for an abuse flag.
 * Same flag (type + entities) always produces same fingerprint.
 *
 * @param {object} flag — { type, employerId?, workerId? }
 * @returns {string} hex SHA256
 */
export function computeFingerprint(flag) {
  if (!flag || !flag.type) return '';
  const employerId = flag.employerId || '';
  const workerId = flag.workerId || '';
  const input = `${flag.type}:${employerId}:${workerId}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Read review state for a fingerprint.
 * @param {string} fingerprint
 * @returns {Promise<object|null>}
 */
export async function getReviewState(fingerprint) {
  if (!fingerprint || typeof fingerprint !== 'string') return null;
  try {
    return await readJSON(getRecordPath('abuse_flag_reviews', fingerprint));
  } catch (err) {
    logger.warn('abuseFlagReview: getReviewState failed', { fingerprint, error: err.message });
    return null;
  }
}

/**
 * Build initial review state from a flag.
 */
function buildInitialState(flag, fingerprint) {
  const now = new Date().toISOString();
  return {
    fingerprint,
    flagType: flag.type,
    employerId: flag.employerId || null,
    workerId: flag.workerId || null,
    firstSeenAt: now,
    occurrenceCount: 1,
    reviews: [],
    currentStatus: 'active', // 'active' | 'dismissed' | 'snoozed' | 'actioned'
    snoozeUntil: null,
  };
}

/**
 * Record a review decision.
 *
 * @param {object} params
 * @param {object} params.flag — flag object (from detectAbuse) OR existing reviewState
 * @param {string} params.adminId
 * @param {'dismissed'|'snoozed'|'warning'|'actioned'} params.decision
 * @param {string} [params.note]
 * @param {number} [params.snoozeDays]
 * @returns {Promise<object>} updated reviewState
 */
export async function recordReview({ flag, adminId, decision, note, snoozeDays }) {
  if (!flag) throw new Error('flag is required');
  if (!adminId) throw new Error('adminId is required');
  const validDecisions = ['dismissed', 'snoozed', 'warning', 'actioned'];
  if (!validDecisions.includes(decision)) {
    throw new Error(`Invalid decision: ${decision}`);
  }

  // Derive fingerprint — accept flag with/without precomputed fingerprint
  const fingerprint = flag.fingerprint || computeFingerprint(flag);
  if (!fingerprint) throw new Error('Could not compute fingerprint');

  return withLock(`abuse-review:${fingerprint}`, async () => {
    const filePath = getRecordPath('abuse_flag_reviews', fingerprint);
    let state = await readJSON(filePath);

    if (!state) {
      // Initial — flag must have type
      if (!flag.type && !flag.flagType) {
        throw new Error('Cannot create review state: flag missing type');
      }
      state = buildInitialState({
        type: flag.type || flag.flagType,
        employerId: flag.employerId,
        workerId: flag.workerId,
      }, fingerprint);
    }
    // Phase 46 fix: occurrenceCount is no longer auto-incremented on every review.
    // It now represents "abuse occurrences detected" — incremented by
    // incrementOccurrence() when detectAbuse re-detects the same fingerprint.
    // First detection sets occurrenceCount=1 in buildInitialState (preserved).

    const reviewId = 'rev_' + crypto.randomBytes(6).toString('hex');
    const now = new Date().toISOString();

    let snoozeUntil = null;
    if (decision === 'snoozed' && typeof snoozeDays === 'number' && snoozeDays > 0) {
      snoozeUntil = new Date(Date.now() + snoozeDays * 86400000).toISOString();
    }

    state.reviews.push({
      id: reviewId,
      adminId,
      decision,
      note: note || null,
      snoozeUntil,
      createdAt: now,
    });

    // Update currentStatus based on decision
    if (decision === 'dismissed') {
      state.currentStatus = 'dismissed';
      state.snoozeUntil = null;
    } else if (decision === 'snoozed') {
      state.currentStatus = 'snoozed';
      state.snoozeUntil = snoozeUntil;
    } else if (decision === 'actioned') {
      state.currentStatus = 'actioned';
      state.snoozeUntil = null;
    }
    // 'warning' does NOT change currentStatus — flag remains active

    await atomicWrite(filePath, state);
    return state;
  });
}

/**
 * Check if a flag fingerprint is currently snoozed.
 * Implements LAZY expiry: if snoozeUntil < now, updates state to 'active' and returns false.
 *
 * @param {string} fingerprint
 * @returns {Promise<boolean>}
 */
export async function isCurrentlySnoozed(fingerprint) {
  if (!fingerprint) return false;
  const state = await getReviewState(fingerprint);
  if (!state) return false;
  if (state.currentStatus !== 'snoozed') return false;
  if (!state.snoozeUntil) return false;

  const nowMs = Date.now();
  const snoozeMs = new Date(state.snoozeUntil).getTime();

  if (nowMs < snoozeMs) return true;

  // Snooze expired — lazy update (idempotent atomicWrite)
  state.currentStatus = 'active';
  state.snoozeUntil = null;
  try {
    await atomicWrite(getRecordPath('abuse_flag_reviews', fingerprint), state);
  } catch (err) {
    logger.warn('abuseFlagReview: lazy expiry write failed', { fingerprint, error: err.message });
  }
  return false;
}

/**
 * List all review states (admin/debugging).
 * @returns {Promise<object[]>}
 */
export async function listAllReviewStates() {
  try {
    const dir = getCollectionPath('abuse_flag_reviews');
    return await listJSON(dir);
  } catch (err) {
    logger.warn('abuseFlagReview: listAllReviewStates failed', { error: err.message });
    return [];
  }
}

/**
 * Phase 46: Increment occurrenceCount on re-detection.
 * Called by detectAbuse when same flag fingerprint is detected again
 * after a previous review state existed.
 *
 * Semantics: occurrenceCount = "abuse occurrences detected" (NOT review count).
 * No-op if no review state exists (first detection initializes via buildInitialState).
 *
 * @param {string} fingerprint
 * @returns {Promise<void>}
 */
export async function incrementOccurrence(fingerprint) {
  if (!fingerprint || typeof fingerprint !== 'string') return;

  return withLock(`abuse-review:${fingerprint}`, async () => {
    const filePath = getRecordPath('abuse_flag_reviews', fingerprint);
    const state = await readJSON(filePath);
    if (!state) return; // no review state yet — skip silently (first detection lives in detectAbuse output)

    state.occurrenceCount = (state.occurrenceCount || 0) + 1;

    try {
      await atomicWrite(filePath, state);
    } catch (err) {
      logger.warn('abuseFlagReview: incrementOccurrence write failed', { fingerprint, error: err.message });
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// Phase 47 — Admin Operations Excellence Extensions
// ═══════════════════════════════════════════════════════════════

/**
 * Phase 47: List review states filtered by current status.
 * For 'snoozed' status, applies lazy expiry verification (states with expired
 * snooze auto-transition to 'active' via isCurrentlySnoozed and are excluded).
 *
 * @param {string} status — 'active' | 'snoozed' | 'dismissed' | 'actioned'
 * @returns {Promise<object[]>} sorted by lastSeen descending (newest activity first)
 */
export async function listByStatus(status) {
  const validStatuses = ['active', 'snoozed', 'dismissed', 'actioned'];
  if (!validStatuses.includes(status)) return [];

  const all = await listAllReviewStates();
  const result = [];
  for (const state of all) {
    if (state.currentStatus !== status) continue;

    // For snoozed status, verify still snoozed (lazy expiry mutation possible)
    if (status === 'snoozed') {
      try {
        const stillSnoozed = await isCurrentlySnoozed(state.fingerprint);
        if (stillSnoozed) result.push(state);
      } catch (_) {
        // On error, include state (safer than excluding)
        result.push(state);
      }
    } else {
      result.push(state);
    }
  }

  // Sort by latest activity (last review createdAt OR firstSeenAt) descending
  result.sort((a, b) => {
    const aTime = a.reviews && a.reviews.length > 0
      ? new Date(a.reviews[a.reviews.length - 1].createdAt).getTime()
      : new Date(a.firstSeenAt).getTime();
    const bTime = b.reviews && b.reviews.length > 0
      ? new Date(b.reviews[b.reviews.length - 1].createdAt).getTime()
      : new Date(b.firstSeenAt).getTime();
    return bTime - aTime;
  });

  return result;
}

/**
 * Phase 47: Get remaining warnings count for a user this rolling 7-day window.
 * Used by frontend to display rate limit visibility before admin clicks "warn".
 *
 * @param {string} userId
 * @returns {Promise<{ used: number, max: number, remaining: number }>}
 */
export async function getRemainingWarnings(userId) {
  const cfg = (await import('../../config.js')).default;
  const max = (cfg.DIRECT_OFFERS && cfg.DIRECT_OFFERS.abuse && cfg.DIRECT_OFFERS.abuse.maxWarningsPerUserPerWeek) || 3;

  if (!userId) return { used: 0, max, remaining: max };

  try {
    const { listByUser } = await import('./notifications.js');
    const result = await listByUser(userId, { limit: 100, offset: 0 });
    const items = (result && result.items) || [];
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const used = items.filter(n =>
      n.type === 'admin_warning' &&
      new Date(n.createdAt).getTime() >= weekAgo
    ).length;
    return { used, max, remaining: Math.max(0, max - used) };
  } catch (err) {
    logger.warn('abuseFlagReview: getRemainingWarnings failed', { userId, error: err.message });
    return { used: 0, max, remaining: max };
  }
}

/**
 * Phase 47: Bulk update flag review states.
 * Atomic per-flag iteration (no all-or-nothing transaction — file-based limitation).
 * Returns succeeded[] and failed[] for granular result reporting.
 *
 * @param {object} params
 * @param {string[]} params.fingerprints — array of flag fingerprints
 * @param {string} params.adminId
 * @param {'dismissed'|'snoozed'|'actioned'} params.decision
 * @param {string} [params.note]
 * @param {number} [params.snoozeDays] — required when decision='snoozed'
 * @returns {Promise<{ succeeded: object[], failed: object[] }>}
 */
export async function bulkUpdate({ fingerprints, adminId, decision, note, snoozeDays }) {
  if (!Array.isArray(fingerprints) || fingerprints.length === 0) {
    return { succeeded: [], failed: [] };
  }

  const cfg = (await import('../../config.js')).default;
  const max = (cfg.ADMIN_OPERATIONS && cfg.ADMIN_OPERATIONS.bulkActionMaxFlags) || 50;
  if (fingerprints.length > max) {
    throw new Error(`Bulk action exceeds max ${max} flags`);
  }

  const succeeded = [];
  const failed = [];

  for (const fingerprint of fingerprints) {
    try {
      const existingState = await getReviewState(fingerprint);
      if (!existingState) {
        failed.push({ fingerprint, error: 'FLAG_NOT_FOUND' });
        continue;
      }

      const result = await recordReview({
        flag: existingState,
        adminId,
        decision,
        note: note || null,
        snoozeDays: decision === 'snoozed' ? snoozeDays : null,
      });
      succeeded.push({ fingerprint, reviewState: result });
    } catch (err) {
      failed.push({ fingerprint, error: err.message });
    }
  }

  return { succeeded, failed };
}

/**
 * Phase 47: Search review states by admin notes content.
 * Full-text case-insensitive substring match on reviews[].note field.
 * Attaches _matchingReview metadata for UI display.
 *
 * @param {string} query — minimum 2 characters
 * @returns {Promise<object[]>} sorted by matching review timestamp descending
 */
export async function searchByNotes(query) {
  if (!query || typeof query !== 'string') return [];
  const q = query.toLowerCase().trim();
  if (q.length < 2) return [];

  const all = await listAllReviewStates();
  const result = [];

  for (const state of all) {
    if (!state.reviews || state.reviews.length === 0) continue;

    // Find FIRST matching review (any review with note containing query)
    // Use slice().reverse() to find newest match first
    const reviewsNewestFirst = state.reviews.slice().reverse();
    const matchingReview = reviewsNewestFirst.find(r =>
      r.note && r.note.toLowerCase().includes(q)
    );
    if (matchingReview) {
      result.push({ ...state, _matchingReview: matchingReview });
    }
  }

  // Sort by matching review timestamp (newest first)
  result.sort((a, b) => {
    const aTime = new Date(a._matchingReview.createdAt).getTime();
    const bTime = new Date(b._matchingReview.createdAt).getTime();
    return bTime - aTime;
  });

  return result;
}

/**
 * Phase 47: Get flags with snooze approaching expiry within window.
 * Read-only — does NOT mutate state (unlike isCurrentlySnoozed).
 *
 * @param {number} hoursWindow — find flags expiring within this many hours
 * @returns {Promise<object[]>} sorted by closest expiry first
 */
export async function getSnoozeExpiringSoon(hoursWindow = 24) {
  const all = await listAllReviewStates();
  const nowMs = Date.now();
  const windowMs = hoursWindow * 60 * 60 * 1000;
  const result = [];

  for (const state of all) {
    if (state.currentStatus !== 'snoozed') continue;
    if (!state.snoozeUntil) continue;
    const snoozeMs = new Date(state.snoozeUntil).getTime();
    const timeUntil = snoozeMs - nowMs;
    if (timeUntil > 0 && timeUntil <= windowMs) {
      result.push({
        ...state,
        _hoursUntilExpiry: Math.round(timeUntil / (60 * 60 * 1000)),
      });
    }
  }

  // Sort by closest expiry first
  result.sort((a, b) => a._hoursUntilExpiry - b._hoursUntilExpiry);
  return result;
}

// Test helpers
export const _testHelpers = {
  buildInitialState,
  listByStatus,
  getRemainingWarnings,
  bulkUpdate,
  searchByNotes,
  getSnoozeExpiringSoon,
};
