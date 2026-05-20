import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('admin.html contains Phase 57 recommended action containers and help microcopy', async () => {
  const html = await readFile(new URL('../frontend/admin.html', import.meta.url), 'utf-8');

  assert.match(html, /opsRecommendedActions/);
  assert.match(html, /scaleRecommendedActions/);
  assert.match(html, /marketplaceRecommendedActions/);

  assert.match(html, /DLQ = وظائف فشلت بعد كل المحاولات/);
  assert.match(html, /SLO = مؤشر جودة التشغيل/);
  assert.match(html, /Rollup = ملخص دوري محفوظ/);
  assert.match(html, /Restore Drill = اختبار استعادة نسخة احتياطية/);
});

test('admin.js exports Phase 57 admin ops functions', async () => {
  const js = await readFile(new URL('../frontend/assets/js/admin.js', import.meta.url), 'utf-8');

  assert.match(js, /renderRecommendedActions/);
  assert.match(js, /loadDeploymentGate/);
  assert.match(js, /loadSchedulerCadence/);
  assert.match(js, /loadOpsWeeklyReview/);

  // Existing functions should remain exported.
  assert.match(js, /loadScaleHygiene/);
  assert.match(js, /loadMarketplaceIntelligence/);
  assert.match(js, /loadOpsQueueStats/);
  assert.match(js, /loadTrustDashboard/);
});

test('style.css contains Phase 57 recommended action classes', async () => {
  const css = await readFile(new URL('../frontend/assets/css/style.css', import.meta.url), 'utf-8');

  assert.match(css, /\.recommended-actions/);
  assert.match(css, /\.recommended-action-card/);
  assert.match(css, /\.recommended-action-card--warning/);
  assert.match(css, /\.recommended-action-card--critical/);
  assert.match(css, /\.runbook-link/);
  assert.match(css, /\.ops-help-text/);
  assert.match(css, /\.ops-command-chip/);
  assert.match(css, /\.deployment-gate-status/);
});
