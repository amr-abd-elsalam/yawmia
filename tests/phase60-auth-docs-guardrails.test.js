import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DOC_PATHS = {
  'PHASE60_AUTH_PROVIDER_STRATEGY.md': 'docs/phases/phase60/PHASE60_AUTH_PROVIDER_STRATEGY.md',
  'PHASE60_AUTH_SECURITY_REVIEW.md': 'docs/phases/phase60/PHASE60_AUTH_SECURITY_REVIEW.md',
  'PHASE60_EGYPT_SENDER_ID_RUNBOOK.md': 'docs/phases/phase60/PHASE60_EGYPT_SENDER_ID_RUNBOOK.md',
};

async function readRootFile(fileName) {
  return await readFile(join(ROOT, DOC_PATHS[fileName] || fileName), 'utf-8');
}

async function listFilesRecursive(dir) {
  const out = [];

  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'data' || entry.name === 'backups') continue;
        await walk(full);
      } else {
        out.push(full);
      }
    }
  }

  await walk(dir);
  return out;
}

test('Auth provider strategy doc exists and keeps current file-backed OTP ownership', async () => {
  const text = await readRootFile('docs/phases/phase60/PHASE60_AUTH_PROVIDER_STRATEGY.md');

  assert.match(text, /Current provider: file-backed OTP/);
  assert.match(text, /auth\.js generates OTP/);
  assert.match(text, /auth\.js hashes OTP/);
  assert.match(text, /auth\.js creates Yawmia session/);
  assert.match(text, /Do not replace Yawmia sessions with provider sessions/);
  assert.match(text, /Do not make Firebase the Yawmia identity/);
  assert.match(text, /docs-first only/);
});

test('Auth security review doc preserves OTP hashing, expiry, attempts, and sessions', async () => {
  const text = await readRootFile('docs/phases/phase60/PHASE60_AUTH_SECURITY_REVIEW.md');

  assert.match(text, /hashed at rest/);
  assert.match(text, /deleted after successful verification/);
  assert.match(text, /attempt-limited/);
  assert.match(text, /rate-limited per phone/);
  assert.match(text, /rate-limited per IP/);
  assert.match(text, /Yawmia sessions must remain/);
  assert.match(text, /Do not replace these with provider sessions/);
});

test('Egypt sender id runbook forbids unofficial WhatsApp production auth', async () => {
  const text = await readRootFile('docs/phases/phase60/PHASE60_EGYPT_SENDER_ID_RUNBOOK.md');

  assert.match(text, /Infobip SMS adapter remains unchanged/);
  assert.match(text, /Meta WhatsApp Cloud API template adapter remains unchanged/);
  assert.match(text, /whatsapp-web\.js/);
  assert.match(text, /Baileys/);
  assert.match(text, /unofficial WhatsApp APIs/);
  assert.match(text, /Current recommendation/);
});

test('No unofficial WhatsApp dependencies are added', async () => {
  const pkg = JSON.parse(await readRootFile('package.json'));
  const allDeps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.optionalDependencies || {}),
  };

  const forbidden = [
    'whatsapp-web.js',
    'baileys',
    '@whiskeysockets/baileys',
    'firebase',
    'firebase-admin',
    'pg',
    'redis',
    'ioredis',
    'kafkajs',
    'amqplib',
    '@elastic/elasticsearch',
  ];

  for (const dep of forbidden) {
    assert.equal(Object.prototype.hasOwnProperty.call(allDeps, dep), false, `Forbidden dependency present: ${dep}`);
  }
});

test('No authProvider runtime seam is introduced by docs-only Phase 61.2', async () => {
  const files = await listFilesRecursive(ROOT);
  const authProviderFiles = files
    .map(file => file.replace(ROOT + '/', ''))
    .filter(file => file.endsWith('authProvider.js'));

  assert.deepEqual(authProviderFiles, []);
});
