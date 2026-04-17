// ═══════════════════════════════════════════════════════════════
// server/services/channels/whatsapp.js — WhatsApp Cloud API Adapter
// ═══════════════════════════════════════════════════════════════
// Sends OTP via Meta WhatsApp Cloud API authentication template
// Template: yawmia_otp (pre-approved, with copy code button)
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
 * Send OTP via WhatsApp Cloud API authentication template
 * @param {string} phone — Egyptian local format (01...)
 * @param {string} otp — the OTP code
 * @returns {Promise<{ok: boolean, channel: string, messageId?: string, error?: string}>}
 */
export async function sendWhatsAppOtp(phone, otp) {
  const channel = 'whatsapp';

  // ── Check config ──
  if (!config.MESSAGING.whatsapp.enabled) {
    return { ok: false, channel, error: 'WhatsApp channel is disabled in config' };
  }

  // ── Check env vars ──
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    logger.error('WhatsApp env vars missing', {
      hasPhoneNumberId: !!phoneNumberId,
      hasAccessToken: !!accessToken,
    });
    return { ok: false, channel, error: 'WhatsApp credentials not configured' };
  }

  // ── Build payload ──
  const whatsappConfig = config.MESSAGING.whatsapp;
  const internationalPhone = toInternational(phone);

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: internationalPhone,
    type: 'template',
    template: {
      name: whatsappConfig.templateName,
      language: { code: whatsappConfig.templateLanguage },
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: otp }],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: otp }],
        },
      ],
    },
  };

  // ── Send request ──
  const url = `https://graph.facebook.com/${whatsappConfig.apiVersion}/${phoneNumberId}/messages`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    const data = await response.json();

    // ── Success ──
    if (response.ok && data.messages && data.messages.length > 0) {
      const messageId = data.messages[0].id;
      logger.info('WhatsApp OTP sent successfully', {
        phone: internationalPhone,
        messageId,
      });
      return { ok: true, channel, messageId };
    }

    // ── Meta API error ──
    const errorCode = data.error?.code;
    const errorMessage = data.error?.message || 'Unknown WhatsApp API error';

    // Error 131026: user not on WhatsApp
    if (errorCode === 131026) {
      logger.warn('User not on WhatsApp — will fallback', {
        phone: internationalPhone,
        errorCode,
      });
      return { ok: false, channel, error: 'User not on WhatsApp' };
    }

    // Error 131047: template not approved
    if (errorCode === 131047) {
      logger.error('WhatsApp template not approved', {
        templateName: whatsappConfig.templateName,
        errorCode,
      });
      return { ok: false, channel, error: 'Template not approved' };
    }

    // Other Meta errors
    logger.error('WhatsApp API error', {
      phone: internationalPhone,
      statusCode: response.status,
      errorCode,
      errorMessage,
    });
    return { ok: false, channel, error: errorMessage };

  } catch (err) {
    // Network / timeout errors
    logger.error('WhatsApp request failed', {
      phone: internationalPhone,
      error: err.message,
      isTimeout: err.name === 'TimeoutError',
    });
    return { ok: false, channel, error: err.message };
  }
}
