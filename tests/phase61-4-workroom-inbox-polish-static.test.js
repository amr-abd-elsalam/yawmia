// ═══════════════════════════════════════════════════════════════
// tests/phase61-4-workroom-inbox-polish-static.test.js
// Phase 61.4 — Workroom Inbox Polish Static Guardrails
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workroomJs = await readFile('frontend/assets/js/workroom.js', 'utf-8');
const appJs = await readFile('frontend/assets/js/app.js', 'utf-8');
const styleCss = await readFile('frontend/assets/css/style.css', 'utf-8');

test('Phase 61.4 workroom inbox uses conversations-first Arabic copy', () => {
  assert.match(workroomJs, /المحادثات/);
  assert.match(workroomJs, /افتح المحادثة/);
  assert.match(workroomJs, /آخر رسالة/);
});

test('Phase 61.4 workroom inbox renders unread badge and preview safely', () => {
  assert.match(workroomJs, /workroom-card__unread-badge/);
  assert.match(workroomJs, /lastMessagePreview/);
  assert.match(workroomJs, /lastMessageText/);
  assert.match(workroomJs, /workroom-card__preview/);
});

test('Phase 61.4 workroom read-all refreshes unread badge after marking messages read', () => {
  assert.match(workroomJs, /\/messages\/read-all/);
  assert.match(workroomJs, /refreshMessageUnreadBadge/);
  assert.match(workroomJs, /currentWorkroom\.unreadMessages = 0/);
});

test('Phase 61.4 app shows safe new-message toast outside the active conversation', () => {
  assert.match(appJs, /workroom_message/);
  assert.match(appJs, /isOwnMessage/);
  assert.match(appJs, /isSameWorkroomPage/);
  assert.match(appJs, /رسالة جديدة/);
  assert.match(appJs, /افتح المحادثة/);
});

test('Phase 61.4 failed optimistic messages expose retry affordance', () => {
  assert.match(workroomJs, /message-retry-btn/);
  assert.match(workroomJs, /أعد المحاولة/);
  assert.match(workroomJs, /تعذّر إرسال الرسالة/);
});

test('Phase 61.4 CSS contains inbox and failed retry styling', () => {
  assert.match(styleCss, /workroom-card__unread-badge/);
  assert.match(styleCss, /workroom-card__preview-row/);
  assert.match(styleCss, /message-retry-btn/);
});
