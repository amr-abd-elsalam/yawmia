// ═══════════════════════════════════════════════════════════════
// server/services/auth.js — OTP Generation & Verification
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import { atomicWrite, readJSON, deleteJSON, getRecordPath, listJSON, getCollectionPath } from './database.js';
import { createSession } from './sessions.js';
import { findByPhone, create as createUser } from './users.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';
import { sendOtpMessage } from './messaging.js';

// ── Per-phone OTP rate limiting (in-memory) ──────────────────
const phoneOtpTracker = new Map();
const PHONE_OTP_WINDOW_MS = config.RATE_LIMIT.otpWindowMs;  // 5 minutes
const PHONE_OTP_MAX = config.RATE_LIMIT.otpMaxRequests;     // 5 per window

function isPhoneOtpRateLimited(phone) {
  const now = Date.now();
  const tracker = phoneOtpTracker.get(phone);
  if (!tracker) return false;
  // Clean old entries
  const recent = tracker.filter(ts => now - ts < PHONE_OTP_WINDOW_MS);
  phoneOtpTracker.set(phone, recent);
  return recent.length >= PHONE_OTP_MAX;
}

function recordPhoneOtp(phone) {
  const now = Date.now();
  if (!phoneOtpTracker.has(phone)) {
    phoneOtpTracker.set(phone, []);
  }
  phoneOtpTracker.get(phone).push(now);
}

// Cleanup stale entries periodically (every 10 minutes)
const phoneOtpCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [phone, timestamps] of phoneOtpTracker) {
    const recent = timestamps.filter(ts => now - ts < PHONE_OTP_WINDOW_MS);
    if (recent.length === 0) {
      phoneOtpTracker.delete(phone);
    } else {
      phoneOtpTracker.set(phone, recent);
    }
  }
}, 10 * 60 * 1000);
if (phoneOtpCleanupTimer.unref) phoneOtpCleanupTimer.unref();

/**
 * Generate a random OTP
 * @returns {string} e.g. "1234"
 */
export function generateOtp() {
  const length = config.AUTH.otpLength;
  const max = Math.pow(10, length);
  const min = Math.pow(10, length - 1);
  const num = crypto.randomInt(min, max);
  return String(num);
}

/**
 * Send OTP to phone (mock in Phase 1)
 */
export async function sendOtp(phone, role) {
  // Per-phone rate limiting
  if (isPhoneOtpRateLimited(phone)) {
    return {
      ok: false,
      error: 'تم تجاوز الحد المسموح من طلبات كود التحقق لهذا الرقم. حاول بعد قليل.',
      code: 'PHONE_OTP_RATE_LIMITED',
    };
  }
  recordPhoneOtp(phone);

  const otp = generateOtp();
  const now = new Date();

  const otpData = {
    phone,
    otp,
    role,
    attempts: 0,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + config.AUTH.otpExpiryMs).toISOString(),
  };

  const otpPath = getRecordPath('otp', phone);
  await atomicWrite(otpPath, otpData);

  // Send OTP via messaging (WhatsApp → SMS → mock based on config)
  const msgResult = await sendOtpMessage(phone, otp);
  if (!msgResult.ok) {
    logger.warn('OTP message delivery failed — OTP still saved for verification', {
      phone, channel: msgResult.channel, error: msgResult.error,
    });
  }
  logger.info('OTP processed', {
    phone, role,
    channel: msgResult.channel,
    delivered: msgResult.ok,
    fallbackUsed: msgResult.fallbackUsed || false,
  });

  eventBus.emit('otp:sent', { phone, role });

  return { ok: true, message: 'تم إرسال كود التحقق' };
}

/**
 * Verify OTP and create session
 */
export async function verifyOtp(phone, otp) {
  const otpPath = getRecordPath('otp', phone);
  const otpData = await readJSON(otpPath);

  if (!otpData) {
    return { ok: false, error: 'لم يتم إرسال كود لهذا الرقم', code: 'OTP_NOT_FOUND' };
  }

  // Check expiry
  if (new Date() > new Date(otpData.expiresAt)) {
    await deleteJSON(otpPath);
    return { ok: false, error: 'كود التحقق انتهت صلاحيته', code: 'OTP_EXPIRED' };
  }

  // Check max attempts
  if (otpData.attempts >= config.AUTH.maxOtpAttempts) {
    await deleteJSON(otpPath);
    return { ok: false, error: 'تم تجاوز الحد الأقصى من المحاولات', code: 'OTP_MAX_ATTEMPTS' };
  }

  // Check OTP
  if (otpData.otp !== otp) {
    otpData.attempts += 1;
    await atomicWrite(otpPath, otpData);
    return {
      ok: false,
      error: 'كود التحقق غير صحيح',
      code: 'OTP_INVALID',
      attemptsLeft: config.AUTH.maxOtpAttempts - otpData.attempts,
    };
  }

  // OTP is correct — delete it
  await deleteJSON(otpPath);

  // Find or create user
  let user = await findByPhone(phone);
  if (!user) {
    user = await createUser(phone, otpData.role);
    eventBus.emit('user:created', { userId: user.id, phone, role: otpData.role });
  }

  // Create session
  const session = await createSession(user.id, user.role);

  eventBus.emit('session:created', { userId: user.id, token: session.token });

  logger.info('OTP verified successfully', { phone, userId: user.id });

  return {
    ok: true,
    token: session.token,
    user: {
      id: user.id,
      phone: user.phone,
      role: user.role,
      name: user.name,
      governorate: user.governorate,
    },
  };
}

/**
 * Clean expired OTP files (startup + periodic)
 * @returns {Promise<number>} count of cleaned OTP files
 */
export async function cleanExpiredOtps() {
  const otpDir = getCollectionPath('otp');
  const allOtps = await listJSON(otpDir);
  const now = new Date();
  let cleaned = 0;

  for (const otpData of allOtps) {
    if (otpData.expiresAt && new Date(otpData.expiresAt) < now) {
      const otpPath = getRecordPath('otp', otpData.phone);
      await deleteJSON(otpPath);
      cleaned++;
    }
  }

  return cleaned;
}
