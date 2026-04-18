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

// ── Generic Text Message Delivery ────────────────────────────

/**
 * Send a generic text message (non-OTP) via preferred channel
 * Used for notification messages (application accepted, job filled, etc.)
 *
 * NOTE: sendSmsOtp() in sms.js constructs OTP message internally,
 * so for arbitrary text we build the Infobip payload directly here.
 * WhatsApp free-form messages require 24h conversation window —
 * template-based notifications are a future enhancement.
 *
 * @param {string} phone — Egyptian phone number (01xxx)
 * @param {string} message — Arabic text message
 * @param {{ channel?: string }} options — optional preferred channel override
 * @returns {Promise<{ ok: boolean, channel: string, messageId?: string, error?: string }>}
 */
export async function sendMessage(phone, message, options = {}) {
  // Mock mode (development/testing)
  if (!config.MESSAGING.enabled) {
    console.log(`📩 NOTIFICATION [MOCK] to ${phone}: ${message}`);
    return { ok: true, channel: 'mock', messageId: 'mock_' + Date.now() };
  }

  // Try SMS (the reliable channel for non-OTP text messages)
  const wantSms = options.channel === 'sms' || config.MESSAGING.preferredChannel === 'sms' || config.MESSAGING.fallbackChannel === 'sms';
  if (wantSms && config.MESSAGING.sms.enabled) {
    try {
      const apiKey = process.env.INFOBIP_API_KEY;
      const baseUrl = process.env.INFOBIP_BASE_URL;
      if (apiKey && baseUrl) {
        const senderId = process.env.INFOBIP_SENDER || config.MESSAGING.sms.senderId;
        const internationalPhone = phone.startsWith('0') ? '20' + phone.slice(1) : phone;
        const payload = {
          messages: [{
            destinations: [{ to: internationalPhone }],
            from: senderId,
            text: message,
          }],
        };
        const response = await fetch(`${baseUrl}/sms/2/text/advanced`, {
          method: 'POST',
          headers: {
            'Authorization': `App ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15000),
        });
        const data = await response.json();
        if (response.ok && data.messages && data.messages.length > 0) {
          const msg = data.messages[0];
          return { ok: true, channel: 'sms', messageId: msg.messageId || msg.id || 'unknown' };
        }
      }
    } catch (err) {
      logger.warn('SMS notification send failed', { phone, error: err.message });
    }
  }

  // Fallback to mock
  console.log(`📩 NOTIFICATION [MOCK-FALLBACK] to ${phone}: ${message}`);
  return { ok: true, channel: 'mock', messageId: 'mock_fallback_' + Date.now() };
}
