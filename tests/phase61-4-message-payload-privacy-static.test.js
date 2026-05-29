// ═══════════════════════════════════════════════════════════════
// tests/phase61-4-message-payload-privacy-static.test.js
// Phase 61.4 — Realtime Message Payload Privacy Guardrails
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const notificationsJs = await readFile('server/services/notifications.js', 'utf-8');
const messagesJs = await readFile('server/services/messages.js', 'utf-8');
const notificationActionsJs = await readFile('server/services/notificationActions.js', 'utf-8');

test('safeRealtimeMessagePayload exists and caps message text/preview', () => {
  assert.match(notificationsJs, /function safeRealtimeMessagePayload/);
  assert.match(notificationsJs, /text\.slice\(0, 500\)/);
  assert.match(notificationsJs, /preview/);
});

test('safe realtime message payload exposes attachment metadata only', () => {
  assert.match(notificationsJs, /attachments/);
  assert.match(notificationsJs, /imageRef/);
  assert.match(notificationsJs, /clientName/);
  assert.doesNotMatch(notificationsJs, /safeRealtimeMessagePayload[\s\S]*nationalIdImage/);
  assert.doesNotMatch(notificationsJs, /safeRealtimeMessagePayload[\s\S]*selfieImage/);
});

test('new_message notification dedup uses messageId before jobId fallback', () => {
  assert.match(notificationsJs, /if \(type === 'new_message'\)/);
  assert.match(notificationsJs, /return meta\.messageId \|\| meta\.jobId \|\| ''/);
});

test('message created event carries messageId and safe preview data', () => {
  assert.match(messagesJs, /eventBus\.emit\('message:created'/);
  assert.match(messagesJs, /messageId: id/);
  assert.match(messagesJs, /preview: sanitized\.substring\(0, 100\)/);
  assert.match(messagesJs, /attachments: message\.attachments \|\| \[\]/);
});

test('new_message action routes to exact workroom messages tab', () => {
  assert.match(notificationActionsJs, /case 'new_message':/);
  assert.match(notificationActionsJs, /workroom_messages/);
  assert.match(notificationActionsJs, /#workroom-messages/);
});
