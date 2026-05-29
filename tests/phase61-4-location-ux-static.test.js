// ═══════════════════════════════════════════════════════════════
// tests/phase61-4-location-ux-static.test.js
// Phase 61.4B — Location / Address / Directions UX Static Guardrails
// ═══════════════════════════════════════════════════════════════
// Guards:
// - address-first job publishing fields exist
// - raw lat/lng are not primary user-facing UX
// - directions use safe external URL strategy, no map SDK
// - backend keeps additive fields and sanitization
// - no new dependencies
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  return await readFile(path, 'utf-8');
}

test('Phase 61.4B backend stores additive address-first job location fields', async () => {
  const jobsService = await read('server/services/jobs.js');

  assert.match(jobsService, /area:\s*fields\.area\s*\|\|\s*null/);
  assert.match(jobsService, /address:\s*fields\.address\s*\|\|\s*null/);
  assert.match(jobsService, /landmark:\s*fields\.landmark\s*\|\|\s*null/);
  assert.match(jobsService, /locationNotes:\s*fields\.locationNotes\s*\|\|\s*null/);

  // Existing fields must remain for backward compatibility and attendance/proximity.
  assert.match(jobsService, /location:\s*fields\.location\s*\|\|\s*null/);
  assert.match(jobsService, /lat:\s*\(typeof fields\.lat === 'number'\)/);
  assert.match(jobsService, /lng:\s*\(typeof fields\.lng === 'number'\)/);
});

test('Phase 61.4B job create handler sanitizes location text fields', async () => {
  const handler = await read('server/handlers/jobsHandler.js');

  assert.match(handler, /sanitizeFields\(body,\s*\['title',\s*'description',\s*'location',\s*'area',\s*'address',\s*'landmark',\s*'locationNotes'\]\)/);
  assert.match(handler, /LOCATION_FIELD_TOO_LONG/);
  assert.match(handler, /INVALID_LOCATION_FIELD/);

  // Backward-compatible location summary should be preserved for old clients.
  assert.match(handler, /if \(!sanitized\.location && \(sanitized\.address \|\| sanitized\.area \|\| sanitized\.landmark\)\)/);
});

test('Phase 61.4B employer create-job UX is address-first and Arabic-first', async () => {
  const jobsJs = await read('frontend/assets/js/jobs.js');

  assert.match(jobsJs, /injectJobLocationFields/);
  assert.match(jobsJs, /المنطقة أو المركز/);
  assert.match(jobsJs, /عنوان مكان العمل/);
  assert.match(jobsJs, /علامة مميزة/);
  assert.match(jobsJs, /ملاحظات تساعد العامل يوصل بسهولة/);
  assert.match(jobsJs, /استخدم موقعي الحالي/);
  assert.match(jobsJs, /اكتب العنوان كما تقوله للعامل في الهاتف/);

  // Normal user UX should not require visible raw coordinate inputs.
  assert.match(jobsJs, /type="hidden" id="jobLat"/);
  assert.match(jobsJs, /type="hidden" id="jobLng"/);

  // UX-level guard: employer must provide address/area/landmark.
  assert.match(jobsJs, /اكتب عنوان مكان العمل أو المنطقة أو علامة مميزة/);
});

test('Phase 61.4B job detail provides directions and copy-address actions', async () => {
  const jobDetailJs = await read('frontend/assets/js/jobDetail.js');

  assert.match(jobDetailJs, /renderJobLocation\(job\)/);
  assert.match(jobDetailJs, /composeJobAddress/);
  assert.match(jobDetailJs, /buildDirectionsUrl/);
  assert.match(jobDetailJs, /copyTextToClipboard/);

  assert.match(jobDetailJs, /مكان العمل/);
  assert.match(jobDetailJs, /المنطقة أو المركز/);
  assert.match(jobDetailJs, /العنوان:/);
  assert.match(jobDetailJs, /علامة مميزة:/);
  assert.match(jobDetailJs, /ملاحظات الوصول:/);
  assert.match(jobDetailJs, /افتح الاتجاهات/);
  assert.match(jobDetailJs, /انسخ العنوان/);
  assert.match(jobDetailJs, /العنوان غير مكتمل/);
});

test('Phase 61.4B directions URL strategy uses no map SDK', async () => {
  const jobDetailJs = await read('frontend/assets/js/jobDetail.js');
  const packageJson = JSON.parse(await read('package.json'));

  // Safe URL-only strategy.
  assert.match(jobDetailJs, /https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/);
  assert.match(jobDetailJs, /https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
  assert.match(jobDetailJs, /encodeURIComponent/);

  const deps = packageJson.dependencies || {};
  const devDeps = packageJson.devDependencies || {};

  const forbiddenPackages = [
    '@googlemaps/js-api-loader',
    'google-map-react',
    'leaflet',
    'mapbox-gl',
    '@mapbox/mapbox-gl-js',
  ];

  for (const pkg of forbiddenPackages) {
    assert.equal(deps[pkg], undefined, `Forbidden map dependency found in dependencies: ${pkg}`);
    assert.equal(devDeps[pkg], undefined, `Forbidden map dependency found in devDependencies: ${pkg}`);
  }

  // Current architecture posture remains one production dependency: dotenv.
  assert.deepEqual(Object.keys(deps).sort(), ['dotenv']);
  assert.equal(Object.keys(devDeps).length, 0);
});

test('Phase 61.4B location CSS exists and preserves mobile-first touch targets', async () => {
  const css = await read('frontend/assets/css/style.css');

  assert.match(css, /Phase 61\.4B — Location \/ Address \/ Directions UX/);
  assert.match(css, /\.job-location-fields/);
  assert.match(css, /\.job-detail__location/);
  assert.match(css, /\.job-location-actions/);
  assert.match(css, /min-height:\s*44px/);
});
