// ═══════════════════════════════════════════════════════════════
// server/services/applicationStatus.js — Application Status Helpers (Phase 55)
// ═══════════════════════════════════════════════════════════════
// Centralized lifecycle helpers.
// Fixes accepted-equivalent semantics without migrating old records.
// ═══════════════════════════════════════════════════════════════

const ACCEPTED_EQUIVALENT_STATUSES = new Set([
  'accepted',
  'worker_confirmed',
]);

const PENDING_STATUSES = new Set([
  'pending',
]);

const TERMINAL_STATUSES = new Set([
  'rejected',
  'withdrawn',
  'worker_declined',
]);

/**
 * Accepted-equivalent means the worker is allowed to participate in the job flow:
 * - attendance
 * - messaging
 * - workroom
 * - payment dispute access
 * - rating eligibility
 *
 * @param {string} status
 * @returns {boolean}
 */
export function isAcceptedApplicationStatus(status) {
  return ACCEPTED_EQUIVALENT_STATUSES.has(status);
}

/**
 * Pending means the employer has not responded yet.
 *
 * @param {string} status
 * @returns {boolean}
 */
export function isPendingApplicationStatus(status) {
  return PENDING_STATUSES.has(status);
}

/**
 * Terminal statuses no longer represent active participation.
 *
 * @param {string} status
 * @returns {boolean}
 */
export function isTerminalApplicationStatus(status) {
  return TERMINAL_STATUSES.has(status);
}

export const _testHelpers = {
  ACCEPTED_EQUIVALENT_STATUSES,
  PENDING_STATUSES,
  TERMINAL_STATUSES,
};
