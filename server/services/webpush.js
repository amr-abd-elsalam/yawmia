// ═══════════════════════════════════════════════════════════════
// server/services/webpush.js — Web Push Subscription + Delivery
// ═══════════════════════════════════════════════════════════════
// VAPID signing (RFC 8292) with node:crypto ECDSA P-256
// Payload encryption (RFC 8291) with ECDH + HKDF + AES-128-GCM
// Falls back to no-payload push if encryption fails
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import {
  atomicWrite, readJSON, deleteJSON, getRecordPath, getCollectionPath,
  listJSON, addToSetIndex, getFromSetIndex, readSetIndex, writeSetIndex,
} from './database.js';
import { logger } from './logger.js';

const PUSH_USER_INDEX = config.DATABASE.indexFiles.pushUserIndex;

// ── Base64URL helpers ────────────────────────────────────────

function base64urlEncode(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlDecode(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

// ── VAPID JWT signing ────────────────────────────────────────

/**
 * Create a VAPID JWT token for push service authentication
 * @param {string} audience — push service origin (e.g. https://fcm.googleapis.com)
 * @param {string} subject — contact URI (e.g. mailto:admin@yowmia.com)
 * @param {string} privateKeyBase64url — VAPID private key (base64url-encoded raw 32 bytes)
 * @returns {string} JWT token
 */
function createVapidJwt(audience, subject, privateKeyBase64url) {
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60, // 12 hours
    sub: subject,
  };

  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const unsignedToken = headerB64 + '.' + payloadB64;

  // Import private key as JWK for ECDSA signing
  const privateKeyRaw = base64urlDecode(privateKeyBase64url);

  // Build JWK for P-256 private key (raw 32-byte d parameter)
  const keyObj = crypto.createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: base64urlEncode(privateKeyRaw),
      // x and y are derived from d — but node:crypto needs them
      // We derive them by creating a key pair from the private key
      x: '', // placeholder — will use DER approach instead
      y: '',
    },
    format: 'jwk',
  });

  // Sign with ECDSA SHA-256
  const sign = crypto.createSign('SHA256');
  sign.update(unsignedToken);
  const derSignature = sign.sign(keyObj);

  // Convert DER signature to raw r||s (64 bytes) for JWT ES256
  const rawSig = derToRaw(derSignature);

  return unsignedToken + '.' + base64urlEncode(rawSig);
}

/**
 * Convert DER-encoded ECDSA signature to raw r||s format (64 bytes)
 */
function derToRaw(derSig) {
  // DER: 0x30 [len] 0x02 [rLen] [r] 0x02 [sLen] [s]
  let offset = 2; // skip 0x30 and total length
  if (derSig[offset] === 0x02) {
    const rLen = derSig[offset + 1];
    const rStart = offset + 2;
    let r = derSig.subarray(rStart, rStart + rLen);
    offset = rStart + rLen;

    const sLen = derSig[offset + 1];
    const sStart = offset + 2;
    let s = derSig.subarray(sStart, sStart + sLen);

    // Remove leading zero padding
    if (r.length === 33 && r[0] === 0) r = r.subarray(1);
    if (s.length === 33 && s[0] === 0) s = s.subarray(1);

    // Pad to 32 bytes each
    const raw = Buffer.alloc(64);
    r.copy(raw, 32 - r.length);
    s.copy(raw, 64 - s.length);
    return raw;
  }
  return derSig;
}

// ── VAPID key management ─────────────────────────────────────

/**
 * Build ECDSA private key object from raw base64url-encoded 32-byte private key
 * Uses PKCS8 DER encoding
 */
function buildPrivateKey(privateKeyB64url) {
  const rawKey = base64urlDecode(privateKeyB64url);

  // Generate an EC key pair and import just the private scalar
  // Node.js needs a full key — we build a JWK with x,y derived from d
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(rawKey);
  const publicKeyUncompressed = ecdh.getPublicKey(); // 65 bytes: 0x04 || x || y
  const x = publicKeyUncompressed.subarray(1, 33);
  const y = publicKeyUncompressed.subarray(33, 65);

  return crypto.createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: base64urlEncode(rawKey),
      x: base64urlEncode(x),
      y: base64urlEncode(y),
    },
    format: 'jwk',
  });
}

/**
 * Create VAPID Authorization header value
 * @param {string} endpoint — push service endpoint URL
 * @returns {{ authorization: string, cryptoKey: string } | null}
 */
function getVapidHeaders(endpoint) {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    return null;
  }

  try {
    const endpointUrl = new URL(endpoint);
    const audience = endpointUrl.origin;
    const subject = 'mailto:admin@yowmia.com';

    // Build private key object
    const keyObj = buildPrivateKey(privateKey);

    // Create JWT
    const now = Math.floor(Date.now() / 1000);
    const header = { typ: 'JWT', alg: 'ES256' };
    const payload = {
      aud: audience,
      exp: now + 12 * 60 * 60,
      sub: subject,
    };

    const headerB64 = base64urlEncode(JSON.stringify(header));
    const payloadB64 = base64urlEncode(JSON.stringify(payload));
    const unsignedToken = headerB64 + '.' + payloadB64;

    const sign = crypto.createSign('SHA256');
    sign.update(unsignedToken);
    const derSignature = sign.sign(keyObj);
    const rawSig = derToRaw(derSignature);

    const jwt = unsignedToken + '.' + base64urlEncode(rawSig);

    // Public key in uncompressed form (65 bytes)
    const pubKeyDecoded = base64urlDecode(publicKey);

    return {
      authorization: `vapid t=${jwt}, k=${publicKey}`,
      cryptoKey: undefined, // not needed with vapid scheme
    };
  } catch (err) {
    logger.error('VAPID header generation failed', { error: err.message });
    return null;
  }
}

// ── Payload encryption (RFC 8291 — simplified) ──────────────

/**
 * Encrypt push payload using RFC 8291 (aes128gcm)
 * @param {Buffer} userPublicKey — subscriber's p256dh key (65 bytes uncompressed)
 * @param {Buffer} userAuth — subscriber's auth secret (16 bytes)
 * @param {Buffer} payload — plaintext payload
 * @returns {Buffer|null} encrypted payload or null on failure
 */
function encryptPayload(userPublicKey, userAuth, payload) {
  try {
    // Generate ephemeral ECDH key pair
    const localKey = crypto.createECDH('prime256v1');
    localKey.generateKeys();
    const localPublicKey = localKey.getPublicKey(); // 65 bytes uncompressed

    // ECDH shared secret
    const sharedSecret = localKey.computeSecret(userPublicKey);

    // HKDF for auth info
    // auth_info = "WebPush: info" || 0x00 || ua_public || as_public
    const authInfo = Buffer.concat([
      Buffer.from('WebPush: info\0'),
      userPublicKey,
      localPublicKey,
    ]);

    // IKM = HKDF(auth, sharedSecret, authInfo, 32)
    const prk = crypto.createHmac('sha256', userAuth).update(sharedSecret).digest();
    const ikm = hkdfExpand(prk, authInfo, 32);

    // salt (random 16 bytes)
    const salt = crypto.randomBytes(16);

    // PRK for content encryption
    const contentPrk = crypto.createHmac('sha256', salt).update(ikm).digest();

    // CEK = HKDF-Expand(PRK, "Content-Encoding: aes128gcm" || 0x01, 16)
    const cekInfo = Buffer.from('Content-Encoding: aes128gcm\0\x01');
    const cek = hkdfExpand(contentPrk, cekInfo, 16);

    // Nonce = HKDF-Expand(PRK, "Content-Encoding: nonce" || 0x01, 12)
    const nonceInfo = Buffer.from('Content-Encoding: nonce\0\x01');
    const nonce = hkdfExpand(contentPrk, nonceInfo, 12);

    // Pad payload: payload || 0x02 (delimiter)
    const paddedPayload = Buffer.concat([payload, Buffer.from([2])]);

    // Encrypt with AES-128-GCM
    const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
    const encrypted = Buffer.concat([cipher.update(paddedPayload), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Build aes128gcm content coding header:
    // salt (16) || rs (4 bytes, uint32 BE) || idlen (1) || keyid (65) || encrypted || tag
    const rs = Buffer.alloc(4);
    rs.writeUInt32BE(4096, 0);
    const idlen = Buffer.from([65]); // length of localPublicKey

    return Buffer.concat([salt, rs, idlen, localPublicKey, encrypted, tag]);
  } catch (err) {
    logger.warn('Push payload encryption failed — will send without payload', { error: err.message });
    return null;
  }
}

/**
 * HKDF-Expand (SHA-256)
 */
function hkdfExpand(prk, info, length) {
  const hashLen = 32; // SHA-256
  const n = Math.ceil(length / hashLen);
  let prev = Buffer.alloc(0);
  const output = [];
  for (let i = 1; i <= n; i++) {
    const hmac = crypto.createHmac('sha256', prk);
    hmac.update(Buffer.concat([prev, info, Buffer.from([i])]));
    prev = hmac.digest();
    output.push(prev);
  }
  return Buffer.concat(output).subarray(0, length);
}

// ── Subscription CRUD ────────────────────────────────────────

/**
 * Register a push subscription for a user
 * @param {string} userId
 * @param {{ endpoint: string, keys: { p256dh: string, auth: string } }} subscription
 * @param {string} [userAgent]
 * @returns {Promise<{ ok: boolean, subscription?: object, error?: string, code?: string }>}
 */
export async function subscribe(userId, subscription, userAgent) {
  // 1. Feature flag
  if (!config.WEB_PUSH || !config.WEB_PUSH.enabled) {
    return { ok: false, error: 'إشعارات Push غير مفعّلة', code: 'PUSH_DISABLED' };
  }

  // 2. Validate subscription
  if (!subscription || !subscription.endpoint || !subscription.keys ||
      !subscription.keys.p256dh || !subscription.keys.auth) {
    return { ok: false, error: 'بيانات الاشتراك غير صالحة', code: 'INVALID_SUBSCRIPTION' };
  }

  // 3. Check for duplicate endpoint
  const existingIds = await getFromSetIndex(PUSH_USER_INDEX, userId);
  for (const subId of existingIds) {
    const existing = await readJSON(getRecordPath('push_subscriptions', subId));
    if (existing && existing.endpoint === subscription.endpoint) {
      // Update lastUsedAt and return existing
      existing.lastUsedAt = new Date().toISOString();
      await atomicWrite(getRecordPath('push_subscriptions', subId), existing);
      return { ok: true, subscription: existing };
    }
  }

  // 4. Enforce max subscriptions per user
  const maxSubs = config.WEB_PUSH.maxSubscriptionsPerUser || 5;
  if (existingIds.length >= maxSubs) {
    // Delete oldest
    let oldest = null;
    let oldestDate = null;
    for (const subId of existingIds) {
      const sub = await readJSON(getRecordPath('push_subscriptions', subId));
      if (sub) {
        const created = new Date(sub.createdAt);
        if (!oldestDate || created < oldestDate) {
          oldestDate = created;
          oldest = sub;
        }
      }
    }
    if (oldest) {
      await deleteJSON(getRecordPath('push_subscriptions', oldest.id));
      // Remove from index
      const index = await readSetIndex(PUSH_USER_INDEX);
      if (index[userId]) {
        index[userId] = index[userId].filter(id => id !== oldest.id);
        if (index[userId].length === 0) delete index[userId];
        await writeSetIndex(PUSH_USER_INDEX, index);
      }
    }
  }

  // 5. Create subscription record
  const id = 'psub_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();

  const record = {
    id,
    userId,
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    userAgent: userAgent || null,
    createdAt: now,
    lastUsedAt: now,
  };

  await atomicWrite(getRecordPath('push_subscriptions', id), record);
  await addToSetIndex(PUSH_USER_INDEX, userId, id);

  logger.info('Push subscription registered', { userId, subscriptionId: id });

  return { ok: true, subscription: record };
}

/**
 * Remove a push subscription by endpoint
 * @param {string} userId
 * @param {string} endpoint
 * @returns {Promise<{ ok: boolean }>}
 */
export async function unsubscribe(userId, endpoint) {
  if (!endpoint) {
    return { ok: false, error: 'الـ endpoint مطلوب', code: 'ENDPOINT_REQUIRED' };
  }

  const existingIds = await getFromSetIndex(PUSH_USER_INDEX, userId);

  for (const subId of existingIds) {
    const sub = await readJSON(getRecordPath('push_subscriptions', subId));
    if (sub && sub.endpoint === endpoint) {
      await deleteJSON(getRecordPath('push_subscriptions', subId));
      // Remove from index
      const index = await readSetIndex(PUSH_USER_INDEX);
      if (index[userId]) {
        index[userId] = index[userId].filter(id => id !== subId);
        if (index[userId].length === 0) delete index[userId];
        await writeSetIndex(PUSH_USER_INDEX, index);
      }
      logger.info('Push subscription removed', { userId, subscriptionId: subId });
      return { ok: true };
    }
  }

  return { ok: true }; // Already gone — idempotent
}

/**
 * Send push notification to all subscriptions of a user
 * Fire-and-forget — NEVER throws
 *
 * @param {string} userId
 * @param {{ title: string, body: string, icon?: string, url?: string }} data
 * @returns {Promise<{ sent: number, failed: number }>}
 */
export async function sendPush(userId, data) {
  try {
    if (!config.WEB_PUSH || !config.WEB_PUSH.enabled) {
      return { sent: 0, failed: 0 };
    }

    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return { sent: 0, failed: 0 };
    }

    const subIds = await getFromSetIndex(PUSH_USER_INDEX, userId);
    if (subIds.length === 0) return { sent: 0, failed: 0 };

    let sent = 0;
    let failed = 0;
    const expiredIds = [];

    for (const subId of subIds) {
      const sub = await readJSON(getRecordPath('push_subscriptions', subId));
      if (!sub) continue;

      try {
        const result = await deliverPush(sub, data);
        if (result.ok) {
          sent++;
          // Update lastUsedAt
          sub.lastUsedAt = new Date().toISOString();
          await atomicWrite(getRecordPath('push_subscriptions', subId), sub);
        } else if (result.gone) {
          // 410 Gone — subscription expired
          expiredIds.push(subId);
          failed++;
        } else {
          failed++;
        }
      } catch (_) {
        failed++;
      }
    }

    // Cleanup expired subscriptions
    if (expiredIds.length > 0) {
      for (const subId of expiredIds) {
        await deleteJSON(getRecordPath('push_subscriptions', subId)).catch(() => {});
      }
      // Batch update index
      const index = await readSetIndex(PUSH_USER_INDEX);
      if (index[userId]) {
        index[userId] = index[userId].filter(id => !expiredIds.includes(id));
        if (index[userId].length === 0) delete index[userId];
        await writeSetIndex(PUSH_USER_INDEX, index);
      }
      logger.info('Cleaned expired push subscriptions', { userId, count: expiredIds.length });
    }

    return { sent, failed };
  } catch (err) {
    // NEVER throw
    logger.warn('sendPush error', { userId, error: err.message });
    return { sent: 0, failed: 0 };
  }
}

/**
 * Send push notification to multiple users
 * Fire-and-forget — NEVER throws
 *
 * @param {string[]} userIds
 * @param {{ title: string, body: string, icon?: string, url?: string }} data
 * @returns {Promise<{ totalSent: number, totalFailed: number }>}
 */
export async function sendPushToMany(userIds, data) {
  let totalSent = 0;
  let totalFailed = 0;

  for (const userId of userIds) {
    const result = await sendPush(userId, data);
    totalSent += result.sent;
    totalFailed += result.failed;
  }

  return { totalSent, totalFailed };
}

/**
 * Deliver a push notification to a single subscription endpoint
 * @param {object} subscription — stored subscription record
 * @param {{ title: string, body: string, icon?: string, url?: string }} data
 * @returns {Promise<{ ok: boolean, gone?: boolean }>}
 */
async function deliverPush(subscription, data) {
  const vapidHeaders = getVapidHeaders(subscription.endpoint);
  if (!vapidHeaders) {
    return { ok: false };
  }

  const payloadJson = JSON.stringify({
    title: data.title || 'يوميّة',
    body: data.body || 'إشعار جديد',
    icon: data.icon || '/assets/img/icon-192.png',
    url: data.url || '/dashboard.html',
  });

  // Try payload encryption
  const headers = {
    'Authorization': vapidHeaders.authorization,
    'TTL': '86400', // 24 hours
  };

  let bodyBuffer = null;

  try {
    const userPublicKey = base64urlDecode(subscription.keys.p256dh);
    const userAuth = base64urlDecode(subscription.keys.auth);
    const encrypted = encryptPayload(userPublicKey, userAuth, Buffer.from(payloadJson));

    if (encrypted) {
      headers['Content-Type'] = 'application/octet-stream';
      headers['Content-Encoding'] = 'aes128gcm';
      headers['Content-Length'] = String(encrypted.length);
      bodyBuffer = encrypted;
    }
  } catch (_) {
    // Fallback: no payload
  }

  // If encryption failed, send without payload (Plan B)
  if (!bodyBuffer) {
    headers['Content-Length'] = '0';
  }

  try {
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers,
      body: bodyBuffer,
      signal: AbortSignal.timeout(15000),
    });

    if (response.status === 201 || response.status === 200) {
      return { ok: true };
    }

    if (response.status === 410 || response.status === 404) {
      // Subscription expired or not found
      return { ok: false, gone: true };
    }

    logger.warn('Push delivery failed', {
      endpoint: subscription.endpoint.substring(0, 60),
      status: response.status,
    });
    return { ok: false };
  } catch (err) {
    logger.warn('Push delivery error', {
      endpoint: subscription.endpoint.substring(0, 60),
      error: err.message,
    });
    return { ok: false };
  }
}
