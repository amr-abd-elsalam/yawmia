// ═══════════════════════════════════════════════════════════════
// tests/phase61-4-workroom-optimistic-static.test.js
// Phase 61.4A — Workroom optimistic send + live append guardrails
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  return await readFile(path, 'utf-8');
}

test('Phase 61.4A: workroom UI defines live append helpers', async () => {
  const raw = await read('frontend/assets/js/workroom.js');

  assert.match(raw, /function appendWorkroomMessageBubble\(msg, options\)/);
  assert.match(raw, /function appendOptimisticMessage\(text\)/);
  assert.match(raw, /function resolveOptimisticMessage\(tempId, message\)/);
  assert.match(raw, /function failOptimisticMessage\(tempId\)/);
  assert.match(raw, /messageBubbleExists\(messageId\)/);
});

test('Phase 61.4A: workroom optimistic send shows pending and sent states', async () => {
  const raw = await read('frontend/assets/js/workroom.js');

  assert.match(raw, /جاري الإرسال\.\.\./);
  assert.match(raw, /تم الإرسال/);
  assert.match(raw, /تعذّر إرسال الرسالة/);
  assert.match(raw, /var optimisticId = null;/);
  assert.match(raw, /appendOptimisticMessage\(text\)/);
  assert.match(raw, /resolveOptimisticMessage\(optimisticId, res\.data\.message\)/);
  assert.match(raw, /failOptimisticMessage\(optimisticId\)/);
});

test('Phase 61.4A: realtime incoming messages append without full reload', async () => {
  const raw = await read('frontend/assets/js/workroom.js');

  assert.match(raw, /window\.addEventListener\('yawmia:workroom-message'/);
  assert.match(raw, /appendWorkroomMessageBubble\(incoming, \{ forceScroll: true \}\)/);
  assert.match(raw, /If the message was already present, keep UI stable and avoid duplicate bubbles/);
});

test('Phase 61.4A: message bubble CSS has pending and failed states', async () => {
  const raw = await read('frontend/assets/css/style.css');

  assert.match(raw, /\.message-bubble--pending/);
  assert.match(raw, /\.message-bubble--failed/);
  assert.match(raw, /\.message-send-status--pending/);
  assert.match(raw, /\.message-send-status--sent/);
  assert.match(raw, /\.message-send-status--failed/);
});
