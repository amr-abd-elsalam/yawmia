import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Phase 61 keeps dependency discipline', async () => {
  const pkg = JSON.parse(await readFile('./package.json', 'utf-8'));

  assert.deepEqual(Object.keys(pkg.dependencies || {}), ['dotenv']);
  assert.equal(pkg.devDependencies, undefined);

  const all = [
    './server/services/phase61EvidenceCadence.js',
    './server/services/pilotDecisionGate.js',
    './server/services/rollbackRehearsal.js',
    './server/services/repositoryContractReport.js',
  ];

  for (const path of all) {
    const raw = await readFile(path, 'utf-8');
    assert.doesNotMatch(raw, /from\s+['"]express['"]/);
    assert.doesNotMatch(raw, /from\s+['"]fastify['"]/);
    assert.doesNotMatch(raw, /from\s+['"]koa['"]/);
    assert.doesNotMatch(raw, /postgres|pg\.|redis|ioredis|elastic|opensearch|kafka|rabbitmq/i);
  }
});
