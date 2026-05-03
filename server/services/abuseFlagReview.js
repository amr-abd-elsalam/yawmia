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

// Test helpers
export const _testHelpers = {
  buildInitialState,
};
