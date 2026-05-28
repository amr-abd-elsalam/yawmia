// ═══════════════════════════════════════════════════════════════
// tests/phase61-4-messaging-realtime-static.test.js
// Phase 61.4A — Messaging / Workroom Realtime UX static guardrails
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  return await readFile(path, 'utf-8');
}

test('Phase 61.4A: new_message dedup uses messageId-aware context', async () => {
  const raw = await read('server/services/notifications.js');

  assert.match(raw, /function notificationDedupContextId\(type, meta\)/);
  assert.match(raw, /if \(type === 'new_message'\)/);
  assert.match(raw, /return meta\.messageId \|\| meta\.jobId \|\| '';/);
  assert.match(raw, /const contextId = notificationDedupContextId\(type, meta\);/);
});

test('Phase 61.4A: message events carry safe realtime payload fields', async () => {
  const raw = await read('server/services/messages.js');

  assert.match(raw, /eventBus\.emit\('message:created'/);
  assert.match(raw, /text: sanitized,/);
  assert.match(raw, /attachments: message\.attachments \|\| \[\],/);
  assert.match(raw, /createdAt: message\.createdAt,/);

  assert.match(raw, /eventBus\.emit\('message:broadcast'/);
  assert.match(raw, /senderRole: 'employer',/);
  assert.match(raw, /text: sanitized,/);
  assert.match(raw, /createdAt: message\.createdAt,/);
});

test('Phase 61.4A: notifications send direct workroom_message SSE and exact deep link', async () => {
  const raw = await read('server/services/notifications.js');

  assert.match(raw, /function buildWorkroomMessageActionUrl\(jobId\)/);
  assert.match(raw, /#workroom-messages/);
  assert.match(raw, /function sendRealtimeWorkroomMessage\(userId, data\)/);
  assert.match(raw, /sendToUser\(\s*userId,\s*'workroom_message'/s);
  assert.match(raw, /sendRealtimeWorkroomMessage\(data\.recipientId, data\);/);
  assert.match(raw, /sendRealtimeWorkroomMessage\(workerId, data\);/);
  assert.match(raw, /url: actionUrl,/);
});

test('Phase 61.4A: frontend app listens for workroom_message SSE', async () => {
  const raw = await read('frontend/assets/js/app.js');

  assert.match(raw, /sseConnection\.addEventListener\('workroom_message'/);
  assert.match(raw, /new CustomEvent\('yawmia:workroom-message'/);
  assert.match(raw, /function refreshMessageUnreadBadge\(\)/);
  assert.match(raw, /\/api\/messages\/unread-count/);
  assert.match(raw, /bottomWorkroomBadge/);
});

test('Phase 61.4A: workroom UI reacts to realtime message events', async () => {
  const raw = await read('frontend/assets/js/workroom.js');

  assert.match(raw, /window\.addEventListener\('yawmia:workroom-message'/);
  assert.match(raw, /var isCurrentWorkroom = currentJobId && incoming\.jobId === currentJobId;/);
  assert.match(raw, /loadMessages\(\);/);
  assert.match(raw, /رسالة جديدة — افتح المحادثة/);
});

test('Phase 61.4A: dashboard bottom nav has conversations entry and badge', async () => {
  const raw = await read('frontend/dashboard.html');

  assert.match(raw, /id="bottomNavWorkrooms"/);
  assert.match(raw, />المحادثات</);
  assert.match(raw, /id="bottomWorkroomBadge"/);
});
