// ═══════════════════════════════════════════════════════════════
// server/services/snoozeReminders.js — Snooze Expiry Reminders (Phase 47)
// ═══════════════════════════════════════════════════════════════
// Scheduled scanner: finds flags with snoozeUntil approaching expiry,
// sends notification to all admin users.
// Idempotent — uses lastReminderSentAt field to prevent duplicate alerts.
//
// Plus separate detectExpiredSnoozes() emitting abuse_flag:snooze_expired event.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { listAllReviewStates } from './abuseFlagReview.js';
import { atomicWrite, getRecordPath } from './database.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';

let scanTimer = null;

/**
 * Scan all snoozed flags for upcoming expiry.
 * Sends 'admin_alert' notification to all admins for flags within reminder window.
 * Idempotent: uses lastReminderSentAt field on review state.
 *
 * @returns {Promise<{ scanned: number, alertsSent: number }>}
 */
export async function scanSnoozeExpiries() {
  if (!config.ADMIN_OPERATIONS || !config.ADMIN_OPERATIONS.snoozeReminderEnabled) {
    return { scanned: 0, alertsSent: 0 };
  }

  const reminderHours = config.ADMIN_OPERATIONS.snoozeReminderHoursBefore || 24;
  const reminderWindowMs = reminderHours * 60 * 60 * 1000;
  const now = Date.now();

  let scanned = 0;
  let alertsSent = 0;

  try {
    const states = await listAllReviewStates();
    for (const state of states) {
      scanned++;

      if (state.currentStatus !== 'snoozed') continue;
      if (!state.snoozeUntil) continue;

      const snoozeMs = new Date(state.snoozeUntil).getTime();
      const timeUntilExpiry = snoozeMs - now;

      // Within reminder window AND not already alerted for this snooze period
      if (timeUntilExpiry > 0 && timeUntilExpiry <= reminderWindowMs) {
        const lastReminderMs = state.lastReminderSentAt
          ? new Date(state.lastReminderSentAt).getTime()
          : 0;

        // Find when current snooze was set (last 'snoozed' decision in reviews[])
        const lastSnoozeReview = state.reviews && state.reviews.length > 0
          ? state.reviews.filter(r => r.decision === 'snoozed').pop()
          : null;
        if (!lastSnoozeReview) continue;
        const snoozeSetAtMs = new Date(lastSnoozeReview.createdAt).getTime();

        // Only send if no reminder sent AFTER snooze was set (idempotent per snooze period)
        if (lastReminderMs > snoozeSetAtMs) continue;

        // Send alert (per-flag isolation)
        try {
          await sendAdminAlert(state, timeUntilExpiry);
          state.lastReminderSentAt = new Date().toISOString();
          await atomicWrite(getRecordPath('abuse_flag_reviews', state.fingerprint), state);
          alertsSent++;
        } catch (err) {
          logger.warn('snoozeReminders: alert/update failed', {
            fingerprint: state.fingerprint,
            error: err.message,
          });
        }
      }
    }
  } catch (err) {
    logger.warn('snoozeReminders: scan failed', { error: err.message });
  }

  if (alertsSent > 0) {
    logger.info('snoozeReminders: scan complete', { scanned, alertsSent });
  }

  return { scanned, alertsSent };
}

/**
 * Send admin notification + emit event for a flag with approaching snooze expiry.
 * Internal helper.
 */
async function sendAdminAlert(state, timeUntilExpiry) {
  const hoursUntilExpiry = Math.round(timeUntilExpiry / (60 * 60 * 1000));

  // Find all active admin users
  const { listAll: listAllUsers } = await import('./users.js');
  const users = await listAllUsers();
  const admins = users.filter(u => u.role === 'admin' && u.status === 'active');
  if (admins.length === 0) return;

  const flagTypeLabels = {
    same_worker_spam: 'spam لنفس العامل',
    high_decline_employer: 'صاحب عمل بنسبة رفض عالية',
    worker_offer_bombing: 'استهداف عامل بعروض كثيرة',
  };

  const message = `⏰ تنبيه: snooze flag (${flagTypeLabels[state.flagType] || state.flagType}) هينتهي خلال ${hoursUntilExpiry} ساعة. مراجعة مطلوبة.`;

  const { createNotification } = await import('./notifications.js');
  for (const admin of admins) {
    try {
      await createNotification(
        admin.id,
        'admin_alert',
        message,
        {
          fingerprint: state.fingerprint,
          flagType: state.flagType,
          snoozeUntil: state.snoozeUntil,
          hoursUntilExpiry,
        }
      );
    } catch (err) {
      logger.warn('snoozeReminders: createNotification failed', {
        adminId: admin.id,
        error: err.message,
      });
    }
  }

  // Emit event for downstream UI integration (Phase 48 SSE potential)
  eventBus.emit('abuse_flag:snooze_expiring', {
    fingerprint: state.fingerprint,
    flagType: state.flagType,
    hoursUntilExpiry,
  });
}

/**
 * Detect already-expired snoozes that haven't been processed yet.
 * Emits 'abuse_flag:snooze_expired' event for each.
 * Note: isCurrentlySnoozed (lazy expiry) eventually transitions these to 'active'.
 * This function is for proactive transition signaling.
 *
 * @returns {Promise<number>} count of expired snoozes detected
 */
export async function detectExpiredSnoozes() {
  if (!config.ADMIN_OPERATIONS || !config.ADMIN_OPERATIONS.snoozeReminderEnabled) {
    return 0;
  }

  let count = 0;
  try {
    const states = await listAllReviewStates();
    const nowMs = Date.now();
    for (const state of states) {
      if (state.currentStatus !== 'snoozed') continue;
      if (!state.snoozeUntil) continue;
      const snoozeMs = new Date(state.snoozeUntil).getTime();
      if (nowMs >= snoozeMs) {
        eventBus.emit('abuse_flag:snooze_expired', {
          fingerprint: state.fingerprint,
          flagType: state.flagType,
          employerId: state.employerId,
          workerId: state.workerId,
        });
        count++;
      }
    }
  } catch (err) {
    logger.warn('detectExpiredSnoozes: scan failed', { error: err.message });
  }
  return count;
}

/**
 * Start the scheduled scanner.
 * Called from server.js on startup.
 */
export function start() {
  if (scanTimer) return;
  if (!config.ADMIN_OPERATIONS || !config.ADMIN_OPERATIONS.snoozeReminderEnabled) {
    logger.info('snoozeReminders: disabled via config');
    return;
  }

  const intervalMs = config.ADMIN_OPERATIONS.snoozeReminderCheckIntervalMs || (60 * 60 * 1000);

  scanTimer = setInterval(() => {
    Promise.all([
      scanSnoozeExpiries(),
      detectExpiredSnoozes(),
    ]).catch(err => {
      logger.warn('snoozeReminders: timer error', { error: err.message });
    });
  }, intervalMs);

  if (scanTimer.unref) scanTimer.unref();
  logger.info(`snoozeReminders: scanner started (every ${intervalMs / 60000} min)`);
}

/**
 * Stop the scheduled scanner (test cleanup).
 */
export function stop() {
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
  }
}

// Test helpers
export const _testHelpers = {
  scanSnoozeExpiries,
  detectExpiredSnoozes,
  sendAdminAlert,
};
