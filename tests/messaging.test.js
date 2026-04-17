// tests/messaging.test.js
// ═══════════════════════════════════════════════════════════════
// Messaging Service Tests (~12 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// We need a temp directory for file-based DB (messaging imports config → database chain)
let tmpDir;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-messaging-test-'));
  const dirs = ['users', 'sessions', 'jobs', 'applications', 'otp', 'notifications', 'ratings'];
  for (const d of dirs) {
    await mkdir(join(tmpDir, d), { recursive: true });
  }
  process.env.YAWMIA_DATA_PATH = tmpDir;
});

after(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

// Dynamic imports so they use the patched env
let sendOtpMessage;
let sendWhatsAppOtp;
let sendSmsOtp;

before(async () => {
  const messagingMod = await import('../server/services/messaging.js');
  sendOtpMessage = messagingMod.sendOtpMessage;

  const whatsappMod = await import('../server/services/channels/whatsapp.js');
  sendWhatsAppOtp = whatsappMod.sendWhatsAppOtp;

  const smsMod = await import('../server/services/channels/sms.js');
  sendSmsOtp = smsMod.sendSmsOtp;
});

describe('Messaging Service', () => {

  describe('Mock Mode (MESSAGING.enabled = false)', () => {

    it('M-01: sendOtpMessage returns { ok: true, channel: "mock" } when messaging disabled', async () => {
      const result = await sendOtpMessage('01012345678', '1234');
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.channel, 'mock');
    });

    it('M-02: Mock adapter returns a messageId starting with "mock_"', async () => {
      const result = await sendOtpMessage('01012345678', '5678');
      assert.ok(result.messageId, 'should have messageId');
      assert.ok(result.messageId.startsWith('mock_'), `messageId should start with "mock_", got "${result.messageId}"`);
    });

    it('M-03: Response includes "channel" field', async () => {
      const result = await sendOtpMessage('01012345678', '1234');
      assert.ok('channel' in result, 'response should have channel field');
      assert.strictEqual(typeof result.channel, 'string');
    });

    it('M-04: Response includes "fallbackUsed" field (boolean)', async () => {
      const result = await sendOtpMessage('01012345678', '1234');
      assert.ok('fallbackUsed' in result, 'response should have fallbackUsed field');
      assert.strictEqual(typeof result.fallbackUsed, 'boolean');
      assert.strictEqual(result.fallbackUsed, false);
    });

    it('M-05: sendOtpMessage handles various Egyptian phone formats', async () => {
      const phones = ['01012345678', '01112345678', '01212345678', '01512345678'];
      for (const phone of phones) {
        const result = await sendOtpMessage(phone, '1234');
        assert.strictEqual(result.ok, true, `should handle ${phone}`);
        assert.strictEqual(result.channel, 'mock');
      }
    });

    it('M-06: sendOtpMessage handles different OTP lengths', async () => {
      const otps = ['1234', '123456'];
      for (const otp of otps) {
        const result = await sendOtpMessage('01012345678', otp);
        assert.strictEqual(result.ok, true, `should handle OTP length ${otp.length}`);
      }
    });
  });

  describe('WhatsApp Adapter', () => {

    it('M-07: sendWhatsAppOtp is exported as function', () => {
      assert.strictEqual(typeof sendWhatsAppOtp, 'function');
    });

    it('M-08: sendWhatsAppOtp returns { ok: false, channel: "whatsapp" } when env vars missing', async () => {
      // Ensure env vars are not set
      const origPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      const origToken = process.env.WHATSAPP_ACCESS_TOKEN;
      delete process.env.WHATSAPP_PHONE_NUMBER_ID;
      delete process.env.WHATSAPP_ACCESS_TOKEN;

      try {
        const result = await sendWhatsAppOtp('01012345678', '1234');
        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.channel, 'whatsapp');
        assert.ok(result.error, 'should have error message');
      } finally {
        // Restore
        if (origPhoneId) process.env.WHATSAPP_PHONE_NUMBER_ID = origPhoneId;
        if (origToken) process.env.WHATSAPP_ACCESS_TOKEN = origToken;
      }
    });

    it('M-09: sendWhatsAppOtp returns channel: "whatsapp" in response', async () => {
      const result = await sendWhatsAppOtp('01012345678', '1234');
      assert.strictEqual(result.channel, 'whatsapp');
    });
  });

  describe('SMS Adapter', () => {

    it('M-10: sendSmsOtp is exported as function', () => {
      assert.strictEqual(typeof sendSmsOtp, 'function');
    });

    it('M-11: sendSmsOtp returns { ok: false, channel: "sms" } when env vars missing', async () => {
      // Ensure env vars are not set
      const origKey = process.env.INFOBIP_API_KEY;
      const origUrl = process.env.INFOBIP_BASE_URL;
      delete process.env.INFOBIP_API_KEY;
      delete process.env.INFOBIP_BASE_URL;

      try {
        const result = await sendSmsOtp('01012345678', '1234');
        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.channel, 'sms');
        assert.ok(result.error, 'should have error message');
      } finally {
        // Restore
        if (origKey) process.env.INFOBIP_API_KEY = origKey;
        if (origUrl) process.env.INFOBIP_BASE_URL = origUrl;
      }
    });

    it('M-12: sendSmsOtp returns channel: "sms" in response', async () => {
      const result = await sendSmsOtp('01012345678', '1234');
      assert.strictEqual(result.channel, 'sms');
    });
  });
});
