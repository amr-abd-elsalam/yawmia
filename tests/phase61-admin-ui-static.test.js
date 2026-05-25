import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Phase 61 admin UI sections exist with Arabic microcopy', async () => {
  const html = await readFile('./frontend/admin.html', 'utf-8');

  assert.match(html, /id="phase61EvidenceSection"/);
  assert.match(html, /id="pilotGateSection"/);
  assert.match(html, /id="rollbackRehearsalSection"/);
  assert.match(html, /id="repositoryContractsSection"/);

  assert.match(html, /تشغيل الأدلة/);
  assert.match(html, /بوابة Pilot/);
  assert.match(html, /تدريب الرجوع/);
  assert.match(html, /عقود Repository/);
  assert.match(html, /لا يوجد نقل تلقائي/);
  assert.match(html, /لماذا Pilot غير مسموح/);
});

test('Phase 61 admin JS exports functions', async () => {
  const js = await readFile('./frontend/assets/js/admin.js', 'utf-8');

  const names = [
    'loadPhase61Evidence',
    'capturePhase61Evidence',
    'renderPhase61EvidenceSummary',
    'renderPhase61EvidenceDetails',
    'loadPilotGate',
    'capturePilotGate',
    'renderPilotGateSummary',
    'renderPilotGateBlockers',
    'loadRollbackRehearsal',
    'runRollbackRehearsal',
    'renderRollbackRehearsalStatus',
    'loadRepositoryContracts',
    'renderRepositoryContracts',
  ];

  for (const name of names) {
    assert.match(js, new RegExp(name + ':\\s*' + name));
  }

  assert.doesNotMatch(js, /https?:\/\/(?!yowmia\.com|yawmia\.com)/i);
});

test('Phase 61 CSS classes exist', async () => {
  const css = await readFile('./frontend/assets/css/style.css', 'utf-8');

  const classes = [
    '.phase61-evidence-card',
    '.phase61-evidence-card--fresh',
    '.phase61-evidence-card--stale',
    '.phase61-evidence-card--missing',
    '.phase61-evidence-card--critical',
    '.pilot-gate-card',
    '.pilot-gate-card--blocked',
    '.pilot-gate-card--ready',
    '.pilot-gate-card--warning',
    '.rollback-rehearsal-card',
    '.rollback-rehearsal-card--passed',
    '.rollback-rehearsal-card--warning',
    '.rollback-rehearsal-card--failed',
    '.repository-contract-card',
    '.repository-contract-status-badge',
    '.repository-contract-status-badge--ok',
    '.repository-contract-status-badge--warning',
    '.repository-contract-status-badge--missing',
  ];

  for (const cls of classes) {
    assert.ok(css.includes(cls), `Missing CSS class ${cls}`);
  }
});
