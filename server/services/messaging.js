// ═══════════════════════════════════════════════════════════════
// server/services/messaging.js — Multi-Channel OTP Messaging Router
// ═══════════════════════════════════════════════════════════════
// Strategy: preferred channel → fallback channel → error
// Default (enabled=false): mock adapter (console.log)
// Production: WhatsApp primary → SMS fallback
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { sendWhatsAppOtp } from './channels/whatsapp.js';
import { sendSmsOtp } from './channels/sms.js';
import { logger } from './logger.js';

// ── Mock Adapter ─────────────────────────────────────────────

/**
 * Mock OTP adapter — logs to console (development/testing)
 * @param {string} phone — Egyptian local format (01...)
 * @param {string} otp
 * @returns {Promise<{ok: boolean, channel: string, messageId: string, fallbackUsed: boolean}>}
 */
async function sendMockOtp(phone, otp) {
  console.log(`📱 OTP [MOCK] to ${phone}: ${otp}`);
  return {
    ok: true,
    channel: 'mock',
    messageId: `mock_${Date.now()}`,
    fallbackUsed: false,
  };
}

// ── Channel Registry ─────────────────────────────────────────

const adapters = {
  whatsapp: sendWhatsAppOtp,
  sms: sendSmsOtp,
  mock: sendMockOtp,
};

// ── Messaging Router ─────────────────────────────────────────

/**
 * Send OTP message via configured channels (preferred → fallback → error)
 * @param {string} phone — Egyptian local format (01...)
 * @param {string} otp — the OTP code
 * @returns {Promise<{ok: boolean, channel: string, messageId?: string, error?: string, fallbackUsed: boolean}>}
 */
export async function sendOtpMessage(phone, otp) {
  // ── Mock mode (development) ──
  if (!config.MESSAGING.enabled) {
    return sendMockOtp(phone, otp);
  }

  // ── Production: try preferred channel ──
  const preferredChannel = config.MESSAGING.preferredChannel;
  const fallbackChannel = config.MESSAGING.fallbackChannel;

  const preferredAdapter = adapters[preferredChannel];
  if (preferredAdapter) {
    try {
      const result = await preferredAdapter(phone, otp);
      if (result.ok) {
        return { ...result, fallbackUsed: false };
      }
      // Preferred failed — log and continue to fallback
      logger.warn('Preferred messaging channel failed', {
        channel: preferredChannel,
        phone,
        error: result.error || 'unknown',
      });
    } catch (err) {
      logger.error('Preferred messaging channel threw error', {
        channel: preferredChannel,
        phone,
        error: err.message,
      });
    }
  }

  // ── Fallback channel ──
  if (fallbackChannel) {
    const fallbackAdapter = adapters[fallbackChannel];
    if (fallbackAdapter) {
      try {
        const result = await fallbackAdapter(phone, otp);
        if (result.ok) {
          return { ...result, fallbackUsed: true };
        }
        logger.warn('Fallback messaging channel failed', {
          channel: fallbackChannel,
          phone,
          error: result.error || 'unknown',
        });
      } catch (err) {
        logger.error('Fallback messaging channel threw error', {
          channel: fallbackChannel,
          phone,
          error: err.message,
        });
      }
    }
  }

  // ── All channels failed ──
  logger.error('All messaging channels failed — OTP still saved for verification', { phone });
  return {
    ok: false,
    channel: 'none',
    error: 'All messaging channels failed',
    fallbackUsed: !!fallbackChannel,
  };
}
