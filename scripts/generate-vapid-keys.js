#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/generate-vapid-keys.js — VAPID Key Pair Generation
// ═══════════════════════════════════════════════════════════════
// Usage: node scripts/generate-vapid-keys.js
// Generates P-256 ECDH key pair for Web Push VAPID authentication
// Output: base64url-encoded keys ready for .env file
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';

function base64urlEncode(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Generate P-256 (prime256v1) key pair
const ecdh = crypto.createECDH('prime256v1');
ecdh.generateKeys();

const publicKey = ecdh.getPublicKey(); // 65 bytes uncompressed (0x04 || x || y)
const privateKey = ecdh.getPrivateKey(); // 32 bytes

const publicKeyB64 = base64urlEncode(publicKey);
const privateKeyB64 = base64urlEncode(privateKey);

console.log('\n🔑 VAPID Key Pair Generated (P-256)\n');
console.log('Add these to your .env file:\n');
console.log(`VAPID_PUBLIC_KEY=${publicKeyB64}`);
console.log(`VAPID_PRIVATE_KEY=${privateKeyB64}`);
console.log('\n⚠️  Keep VAPID_PRIVATE_KEY secret! Never commit it to git.');
console.log('⚠️  If you regenerate keys, all existing push subscriptions will become invalid.\n');
