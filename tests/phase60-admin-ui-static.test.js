import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('admin UI contains Phase 60 sections and Arabic microcopy', async () => {
  const html = await readFile('frontend/admin.html', 'utf-8');

  assert.match(html, /phase60DecisionSection/);
  assert.match(html, /migrationRehearsalSection/);
  assert.match(html, /benchmarkHistorySection/);
  assert.match(html, /قرار Phase 60/);
  assert.match(html, /تدريب الهجرة/);
  assert.match(html, /سجل Benchmarks/);
  assert.match(html, /لا يوجد PostgreSQL/);
});

test('admin.js exports Phase 60 functions', async () => {
  const js = await readFile('frontend/assets/js/admin.js', 'utf-8');

  assert.match(js, /loadPhase60Decision/);
  assert.match(js, /capturePhase60Decision/);
  assert.match(js, /validateMigrationSnapshot/);
  assert.match(js, /runMigrationRehearsal/);
  assert.match(js, /loadBenchmarkHistory/);
  assert.match(js, /renderBenchmarkHistory/);
});

test('Phase 60 CSS classes exist', async () => {
  const css = await readFile('frontend/assets/css/style.css', 'utf-8');

  assert.match(css, /\.phase60-decision-card/);
  assert.match(css, /\.migration-rehearsal-card/);
  assert.match(css, /\.benchmark-history-card/);
  assert.match(css, /\.benchmark-status-badge/);
});
