import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../config.js';

test('file health thresholds are ordered correctly', () => {
  assert.ok(config.FILE_HEALTH.staleTmpWarningMinutes < config.FILE_HEALTH.staleTmpCriticalMinutes);
  assert.ok(config.FILE_HEALTH.largeJsonWarningKB < config.FILE_HEALTH.largeJsonCriticalKB);
  assert.ok(config.FILE_HEALTH.embeddedBase64WarningKB > 0);
});
