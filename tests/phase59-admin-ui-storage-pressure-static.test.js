import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('admin.html contains Phase 59 storage pressure and externalization sections', async () => {
  const html = await readFile('frontend/admin.html', 'utf-8');

  assert.ok(html.includes('storagePressureSection'));
  assert.ok(html.includes('externalizationReadinessSection'));
  assert.ok(html.includes('multiInstanceBoundarySection'));

  assert.ok(html.includes('ضغط التخزين'));
  assert.ok(html.includes('حدود التوسع'));
  assert.ok(html.includes('جاهزية النقل'));
  assert.ok(html.includes('نسخة قراءة فقط') || html.includes('قراءة فقط'));
  assert.ok(html.includes('Phase 60'));
});

test('admin.js exports Phase 59 functions and preserves old functions', async () => {
  const js = await readFile('frontend/assets/js/admin.js', 'utf-8');

  const phase59 = [
    'loadStoragePressure',
    'captureStoragePressure',
    'loadScaleThresholds',
    'verifyScaleThresholds',
    'loadExternalizationReadiness',
    'loadMultiInstanceBoundary',
    'renderStoragePressureSummary',
    'renderStoragePressureRecommendations',
    'renderExternalizationCandidates',
  ];

  for (const fn of phase59) {
    assert.ok(js.includes(`${fn}: ${fn}`), `${fn} must be exported`);
  }

  // Regression: old core admin functions remain exported.
  assert.ok(js.includes('loadScaleHygiene: loadScaleHygiene'));
  assert.ok(js.includes('loadOpsQueueStats: loadOpsQueueStats'));
  assert.ok(js.includes('loadGovernanceDashboard: loadGovernanceDashboard'));
});

test('style.css contains Phase 59 pressure classes', async () => {
  const css = await readFile('frontend/assets/css/style.css', 'utf-8');

  const classes = [
    '.storage-pressure-card',
    '.storage-pressure-card--ok',
    '.storage-pressure-card--warning',
    '.storage-pressure-card--critical',
    '.storage-pressure-meter',
    '.storage-pressure-meter__fill',
    '.externalization-candidate-card',
    '.externalization-candidate-card--ready',
    '.externalization-candidate-card--watch',
    '.scale-threshold-badge',
    '.scale-threshold-badge--ok',
    '.scale-threshold-badge--warning',
    '.scale-threshold-badge--critical',
  ];

  for (const cls of classes) {
    assert.ok(css.includes(cls), `${cls} must exist`);
  }
});
