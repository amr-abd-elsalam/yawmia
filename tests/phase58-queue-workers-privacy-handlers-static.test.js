import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('queueWorkers registers Phase 58 privacy handlers', async () => {
  const raw = await readFile('server/services/queueWorkers.js', 'utf-8');

  assert.match(raw, /privacy_user_data_export/);
  assert.match(raw, /privacy_user_anonymization/);
  assert.match(raw, /handlePrivacyUserDataExportJob/);
  assert.match(raw, /handlePrivacyUserAnonymizationJob/);
});

test('privacy queue handlers complete or fail privacy requests', async () => {
  const raw = await readFile('server/services/queueWorkers.js', 'utf-8');

  assert.match(raw, /completePrivacyRequest/);
  assert.match(raw, /failPrivacyRequest/);
  assert.match(raw, /persistUserDataExport/);
  assert.match(raw, /anonymizeUserData/);
  assert.match(raw, /consumeApproval/);
});
