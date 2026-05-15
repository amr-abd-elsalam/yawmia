import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../config.js';

test('Phase 54 config dirs are registered', () => {
  const dirs = config.DATABASE.dirs;

  assert.equal(dirs.ops_locks, 'ops_locks');
  assert.equal(dirs.scheduler, 'scheduler');
  assert.equal(dirs.ops_rollups, 'metrics/ops-rollups');
  assert.equal(dirs.incidents, 'metrics/incidents');
  assert.equal(dirs.backup_restore_drills, 'metrics/backup-restore-drills');
  assert.equal(dirs.ops, 'ops');
});

test('Phase 54 config sections exist', () => {
  assert.ok(config.INSTANCE_MODE);
  assert.ok(config.PROCESS_LOCKS);
  assert.ok(config.SCHEDULER_REGISTRY);
  assert.ok(config.OPS_METRICS_ROLLUPS);
  assert.ok(config.INCIDENT_TIMELINE);
  assert.ok(config.BACKUP_RESTORE_DRILL);
  assert.ok(config.MAINTENANCE_MODE);
  assert.ok(config.PRODUCTION_READINESS);
});
