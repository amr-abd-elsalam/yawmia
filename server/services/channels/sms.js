// ═══════════════════════════════════════════════════════════════
// server/services/channels/sms.js — Infobip SMS Adapter
// ═══════════════════════════════════════════════════════════════
// Sends OTP via Infobip SMS gateway (fallback channel)
// ═══════════════════════════════════════════════════════════════

import config from '../../../config.js';
import { logger } from '../logger.js';

/**
 * Convert Egyptian local phone to international format
 * 01012345678 → 2001012345678
 * @param {string} phone — Egyptian local (01...)
 * @returns {string} — International (201...)
 */
function toInternational(phone) {
  return phone.startsWith('0') ? '20' + phone.slice(1) : phone;
}

/**
 * Send OTP via Infobip SMS
 * @param {string} phone — Egyptian local format (01...)
 * @param {string} otp — the OTP code
 * @returns {Promise<{ok: boolean, channel: string, messageId?: string, error?: string}>}
 */
export async function sendSmsOtp(phone, otp) {
  const channel = 'sms';

  // ── Check config ──
  if (!config.MESSAGING.sms.enabled) {
    return { ok: false, channel, error: 'SMS channel is disabled in config' };
  }

  // ── Check env vars ──
  const apiKey = process.env.INFOBIP_API_KEY;
  const baseUrl = process.env.INFOBIP_BASE_URL;

  if (!apiKey || !baseUrl) {
    logger.error('Infobip env vars missing', {
      hasApiKey: !!apiKey,
      hasBaseUrl: !!baseUrl,
    });
    return { ok: false, channel, error: 'Infobip credentials not configured' };
  }

  // ── Build payload ──
  const senderId = process.env.INFOBIP_SENDER || config.MESSAGING.sms.senderId;
  const internationalPhone = toInternational(phone);
  const messageText = `يوميّة: كود التحقق الخاص بك هو ${otp}. صالح لمدة 5 دقائق.`;

  const payload = {
    messages: [
      {
        destinations: [{ to: internationalPhone }],
        from: senderId,
        text: messageText,
      },
    ],
  };

  // ── Send request ──
  const url = `${baseUrl}/sms/2/text/advanced`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `App ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    const data = await response.json();

    // ── Success ──
    if (response.ok && data.messages && data.messages.length > 0) {
      const msg = data.messages[0];
      const messageId = msg.messageId || msg.id || 'unknown';
      const status = msg.status?.name || 'unknown';

      logger.info('SMS OTP sent successfully', {
        phone: internationalPhone,
        messageId,
        status,
      });
      return { ok: true, channel, messageId };
    }

    // ── Infobip error ──
    const errorMessage = data.requestError?.serviceException?.text
      || data.requestError?.policyException?.text
      || 'Unknown Infobip API error';

    logger.error('Infobip SMS API error', {
      phone: internationalPhone,
      statusCode: response.status,
      errorMessage,
    });
    return { ok: false, channel, error: errorMessage };

  } catch (err) {
    // Network / timeout errors
    logger.error('Infobip SMS request failed', {
      phone: internationalPhone,
      error: err.message,
      isTimeout: err.name === 'TimeoutError',
    });
    return { ok: false, channel, error: err.message };
  }
}
