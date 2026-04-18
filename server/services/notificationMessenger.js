// ═══════════════════════════════════════════════════════════════
// server/services/notificationMessenger.js — Notification Delivery Pipeline
// ═══════════════════════════════════════════════════════════════
// 7-step pipeline: feature flag → event criticality → user preferences →
// channel availability → per-user cooldown → daily limit → send
// NEVER throws — all errors caught internally (fire-and-forget safe)
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { logger } from './logger.js';

// ── In-memory state ──────────────────────────────────────────

/** @type {Map<string, number>} userId → lastSentTimestamp */
const userCooldowns = new Map();

/** @type {Map<string, number>} userId → todayMessageCount */
const userDailyCounts = new Map();

/** @type {string|null} last reset date string (Egypt timezone) */
let lastResetDate = null;

// ── Internal helpers ─────────────────────────────────────────

/**
 * Get current date string in Egypt timezone (UTC+2)
 * @returns {string} e.g. "2026-04-18"
 */
function getEgyptDateString() {
  const now = new Date();
  const egyptMs = now.getTime() + (2 * 60 * 60 * 1000);
  const egyptDate = new Date(egyptMs);
  const y = egyptDate.getUTCFullYear();
  const m = String(egyptDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(egyptDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Check if user is within cooldown period
 * @param {string} userId
 * @returns {boolean} true if cooled down (can send), false if still in cooldown
 */
function isCooledDown(userId) {
  const last = userCooldowns.get(userId);
  if (!last) return true;
  return (Date.now() - last) >= config.NOTIFICATION_MESSAGING.cooldownMs;
}

/**
 * Record a successful send for cooldown + daily tracking
 * @param {string} userId
 */
function recordSend(userId) {
  userCooldowns.set(userId, Date.now());
  const current = userDailyCounts.get(userId) || 0;
  userDailyCounts.set(userId, current + 1);
}

/**
 * Check if user is within daily message limit
 * @param {string} userId
 * @returns {boolean} true if under limit (can send), false if limit reached
 */
function checkDailyLimit(userId) {
  // Reset counters if Egypt date has changed
  const today = getEgyptDateString();
  if (lastResetDate !== today) {
    userDailyCounts.clear();
    lastResetDate = today;
  }

  const count = userDailyCounts.get(userId) || 0;
  return count < config.NOTIFICATION_MESSAGING.maxDailyMessagesPerUser;
}

/**
 * Resolve notification preferences from user record or config defaults
 * @param {object|null} user
 * @returns {{ inApp: boolean, whatsapp: boolean, sms: boolean }}
 */
function resolvePreferences(user) {
  if (user && user.notificationPreferences) {
    return {
      inApp: true, // always true
      whatsapp: user.notificationPreferences.whatsapp ?? config.NOTIFICATION_MESSAGING.defaultPreferences.whatsapp,
      sms: user.notificationPreferences.sms ?? config.NOTIFICATION_MESSAGING.defaultPreferences.sms,
    };
  }
  return { ...config.NOTIFICATION_MESSAGING.defaultPreferences };
}

// ── Cooldown cleanup timer ───────────────────────────────────
// Every 10 minutes, remove stale cooldown entries
const cleanupTimer = setInterval(() => {
  const cutoff = Date.now() - (config.NOTIFICATION_MESSAGING.cooldownMs * 2);
  for (const [userId, timestamp] of userCooldowns) {
    if (timestamp < cutoff) {
      userCooldowns.delete(userId);
    }
  }
}, 10 * 60 * 1000);
if (cleanupTimer.unref) cleanupTimer.unref();

// ── Main export ──────────────────────────────────────────────

/**
 * Send a notification message via WhatsApp/SMS for critical events
 *
 * 7-step pipeline:
 * 1. Feature flag check
 * 2. Event criticality check
 * 3. User preferences resolution
 * 4. Channel determination
 * 5. Cooldown check
 * 6. Daily limit check
 * 7. Send via messaging.js sendMessage()
 *
 * @param {{ userId: string, phone: string, eventType: string, message: string, user?: object }} params
 * @returns {Promise<{ sent: boolean, channel?: string, reason?: string }>}
 */
export async function sendNotificationMessage(params) {
  try {
    const { userId, phone, eventType, message, user } = params || {};

    // Step 1: Feature flag
    if (!config.NOTIFICATION_MESSAGING.enabled) {
      return { sent: false, reason: 'notification_messaging_disabled' };
    }

    // Step 2: Event criticality
    if (!eventType || !config.NOTIFICATION_MESSAGING.criticalEvents[eventType]) {
      return { sent: false, reason: 'event_not_critical' };
    }

    // Step 3: User preferences
    const prefs = resolvePreferences(user);

    // Step 4: Channel determination
    // WhatsApp free-form requires 24h window — Phase 13 routes to SMS
    // SMS is the reliable channel for non-OTP notifications
    let selectedChannel = null;
    if (prefs.sms) {
      selectedChannel = 'sms';
    } else if (prefs.whatsapp) {
      // WhatsApp templates not yet implemented — fallback to SMS if available
      selectedChannel = 'sms';
    }

    if (!selectedChannel) {
      return { sent: false, reason: 'no_channel_available' };
    }

    // Step 5: Cooldown check
    if (!userId || !isCooledDown(userId)) {
      return { sent: false, reason: 'cooldown_active' };
    }

    // Step 6: Daily limit check
    if (!checkDailyLimit(userId)) {
      return { sent: false, reason: 'daily_limit_reached' };
    }

    // Step 7: Send via messaging.js sendMessage()
    if (!phone) {
      return { sent: false, reason: 'no_phone' };
    }

    const { sendMessage } = await import('./messaging.js');
    const result = await sendMessage(phone, message, { channel: selectedChannel });

    if (result && result.ok) {
      recordSend(userId);
      logger.info('Notification message sent', {
        userId,
        eventType,
        channel: result.channel,
      });
      return { sent: true, channel: result.channel };
    }

    return { sent: false, reason: 'send_failed' };
  } catch (err) {
    // NEVER throw — fire-and-forget safe
    logger.warn('Notification message error', {
      error: err.message,
      userId: params?.userId,
      eventType: params?.eventType,
    });
    return { sent: false, reason: 'internal_error' };
  }
}
