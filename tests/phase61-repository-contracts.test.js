import test from 'node:test';
import assert from 'node:assert/strict';

test('Phase 61 repository contract matrix preserves file-backed source and disables runtime switch', async () => {
  const svc = await import('../server/services/repositoryContractReport.js?repo=' + Date.now());

  const matrix = svc.getRepositoryContractMatrix();

  assert.equal(matrix.enabled, true);
  assert.equal(matrix.phase, 61);
  assert.equal(matrix.docsOnly, true);
  assert.equal(matrix.runtimeSwitchEnabled, false);
  assert.equal(matrix.fileBackedSourceOfTruth, true);
  assert.equal(matrix.externalAdapterImplemented, false);

  const names = matrix.candidates.map(c => c.name);
  assert.ok(names.includes('UserRepository'));
  assert.ok(names.includes('JobRepository'));
  assert.ok(names.includes('QueueRepository'));
  assert.ok(names.includes('AuditRepository'));
  assert.ok(names.includes('ImageObjectStore'));

  const queue = matrix.candidates.find(c => c.name === 'QueueRepository');
  assert.ok(queue.guarantees.some(g => g.includes('idempotency')));
});

test('Phase 61 repository contract readiness is JSON-safe', async () => {
  const svc = await import('../server/services/repositoryContractReport.js?repo2=' + Date.now());
  const report = await svc.getRepositoryContractReadiness();

  assert.equal(report.phase, 61);
  assert.equal(report.runtimeSwitchEnabled, false);
  assert.equal(report.fileBackedSourceOfTruth, true);
  assert.equal(report.externalAdapterImplemented, false);
  assert.ok(Array.isArray(report.matrix));
  assert.ok(Array.isArray(report.recommendations));
});
