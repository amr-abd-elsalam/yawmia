import test from 'node:test';
import assert from 'node:assert/strict';

async function loadFreshInstanceMode(query = Date.now()) {
  return await import(`../server/services/instanceMode.js?x=${query}`);
}

test('default instance mode is single_writer', async () => {
  const oldMode = process.env.INSTANCE_MODE;
  const oldId = process.env.INSTANCE_ID;

  delete process.env.INSTANCE_MODE;
  delete process.env.INSTANCE_ID;

  const mod = await loadFreshInstanceMode('default');
  mod._testHelpers.resetInstanceIdCache();

  assert.equal(mod.getInstanceMode(), 'single_writer');
  assert.equal(mod.isSingleWriter(), true);
  assert.equal(mod.isReadOnlyReplica(), false);

  process.env.INSTANCE_MODE = oldMode;
  process.env.INSTANCE_ID = oldId;
});

test('INSTANCE_ID env wins', async () => {
  const oldId = process.env.INSTANCE_ID;
  process.env.INSTANCE_ID = 'instance_test_env';

  const mod = await loadFreshInstanceMode('env-id');
  mod._testHelpers.resetInstanceIdCache();

  assert.equal(mod.getInstanceId(), 'instance_test_env');

  if (oldId === undefined) delete process.env.INSTANCE_ID;
  else process.env.INSTANCE_ID = oldId;
});

test('read_only_replica disables queue workers and schedulers', async () => {
  const oldMode = process.env.INSTANCE_MODE;
  process.env.INSTANCE_MODE = 'read_only_replica';

  const mod = await loadFreshInstanceMode('readonly');

  assert.equal(mod.isReadOnlyReplica(), true);
  assert.equal(mod.canRunQueueWorkers(), false);
  assert.equal(mod.canRunSchedulers(), false);

  if (oldMode === undefined) delete process.env.INSTANCE_MODE;
  else process.env.INSTANCE_MODE = oldMode;
});

test('experimental mode returns production-style warning shape', async () => {
  const oldMode = process.env.INSTANCE_MODE;
  process.env.INSTANCE_MODE = 'experimental_multi_instance';

  const mod = await loadFreshInstanceMode('experimental');
  const info = mod.getInstanceInfo();

  assert.equal(info.mode, 'experimental_multi_instance');
  assert.ok(Array.isArray(info.warnings));
  assert.equal(Object.prototype.hasOwnProperty.call(info, 'instanceId'), true);

  if (oldMode === undefined) delete process.env.INSTANCE_MODE;
  else process.env.INSTANCE_MODE = oldMode;
});
