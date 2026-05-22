import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('privacy anonymization preview route and UI exist', async () => {
  const router = await readFile('server/router.js', 'utf-8');
  const handler = await readFile('server/handlers/governanceHandler.js', 'utf-8');
  const adminJs = await readFile('frontend/assets/js/admin.js', 'utf-8');

  assert.match(router, /\/api\/admin\/privacy\/requests\/:id\/anonymize-preview/);
  assert.match(handler, /handlePreviewPrivacyAnonymize/);
  assert.match(adminJs, /previewPrivacyAnonymize/);
  assert.match(adminJs, /معاينة إخفاء البيانات/);
});

test('admin SSE subscribes to Phase 58 governance events', async () => {
  const raw = await readFile('server/handlers/adminSseHandler.js', 'utf-8');

  const events = [
    'admin_approval:created',
    'admin_approval:approved',
    'privacy_request:created',
    'privacy_request:completed',
    'ops_review:completed',
    'postmortem:created',
  ];

  for (const eventName of events) {
    assert.ok(raw.includes(eventName), `Missing SSE event: ${eventName}`);
  }
});

test('deployment runbook mentions Phase 58 governance checks', async () => {
  const raw = await readFile('DEPLOYMENT_RUNBOOK.md', 'utf-8');

  assert.match(raw, /verify-admin-rbac\.js --strict/);
  assert.match(raw, /verify-privacy-governance\.js --strict/);
  assert.match(raw, /ADMIN_RBAC\.enabled=true/);
  assert.match(raw, /POSTMORTEMS\.requireForCriticalIncidents=true/);
});
