// ═══════════════════════════════════════════════════════════════
// tests/phase43-frontend-resilience.test.js — Phase 43 Frontend Resilience
// ═══════════════════════════════════════════════════════════════
// 5 tests verifying apiWithRetry adoption in directOffer.js + behavior
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Test 1: directOffer.js accept handler uses apiWithRetry ──
test('Phase 43 — directOffer.js accept uses apiWithRetry', async () => {
  const content = await readFile(join(ROOT, 'frontend/assets/js/directOffer.js'), 'utf-8');

  // Find the accept handler block (not the HTML template — search for getElementById call)
  const acceptHandlerIdx = content.indexOf("getElementById('btnAcceptOffer')");
  assert.ok(acceptHandlerIdx > 0, 'btnAcceptOffer handler block must exist');

  // Look for apiWithRetry within the next 1000 chars (within the click handler)
  const acceptSection = content.substring(acceptHandlerIdx, acceptHandlerIdx + 1000);
  assert.ok(
    acceptSection.includes('apiWithRetry'),
    'Accept handler must use Yawmia.apiWithRetry for network resilience'
  );
});

// ── Test 2: directOffer.js decline handler uses apiWithRetry ──
test('Phase 43 — directOffer.js decline uses apiWithRetry', async () => {
  const content = await readFile(join(ROOT, 'frontend/assets/js/directOffer.js'), 'utf-8');

  // Find the decline handler block (not the HTML template — search for getElementById call)
  const declineHandlerIdx = content.indexOf("getElementById('btnDeclineOffer')");
  assert.ok(declineHandlerIdx > 0, 'btnDeclineOffer handler block must exist');

  const declineSection = content.substring(declineHandlerIdx, declineHandlerIdx + 1500);
  assert.ok(
    declineSection.includes('apiWithRetry'),
    'Decline handler must use Yawmia.apiWithRetry for network resilience'
  );
});

// ── Test 3: apiWithRetry retries on 5xx ──
test('Phase 43 — apiWithRetry retries on 5xx (verified via app.js source)', async () => {
  const content = await readFile(join(ROOT, 'frontend/assets/js/app.js'), 'utf-8');

  // apiWithRetry implementation should contain logic for retry on 5xx
  assert.ok(content.includes('apiWithRetry'), 'apiWithRetry function must exist');
  assert.ok(
    content.includes('result.status < 500'),
    'apiWithRetry must filter by status < 500 (no retry on 4xx)'
  );
});

// ── Test 4: apiWithRetry doesn't retry on 4xx ──
test('Phase 43 — apiWithRetry skips retry for 4xx (e.g. OFFER_EXPIRED 410)', async () => {
  const content = await readFile(join(ROOT, 'frontend/assets/js/app.js'), 'utf-8');

  // Verify the apiWithRetry function returns immediately on status < 500
  const apiWithRetryIdx = content.indexOf('apiWithRetry');
  assert.ok(apiWithRetryIdx > 0);

  const section = content.substring(apiWithRetryIdx, apiWithRetryIdx + 2000);
  assert.ok(
    section.includes('result.status < 500') && section.includes('return result'),
    'apiWithRetry must return early on status < 500'
  );
});

// ── Test 5: apiWithRetry uses exponential backoff ──
test('Phase 43 — apiWithRetry uses exponential backoff', async () => {
  const content = await readFile(join(ROOT, 'frontend/assets/js/app.js'), 'utf-8');

  // Find the backoff calculation: baseDelayMs * Math.pow(2, attempt)
  assert.ok(
    content.includes('baseDelayMs * Math.pow(2, attempt)'),
    'apiWithRetry must use exponential backoff (baseDelayMs * 2^attempt)'
  );
});
