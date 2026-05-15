// ═══════════════════════════════════════════════════════════════
// server/services/instanceMode.js — Instance Mode Awareness (Phase 54)
// ═══════════════════════════════════════════════════════════════
// Centralizes deployment-mode decisions for file-based production ops.
//
// Modes:
//   - single_writer: one writer instance, queue workers + schedulers allowed
//   - read_only_replica: no queue workers, no schedulers, write APIs should be blocked
//   - experimental_multi_instance: explicit unsafe/experimental mode warning
//
// This is readiness/guarding, not full distributed clustering.
// ═══════════════════════════════════════════════════════════════

import os from 'node:os';
import config from '../../config.js';

const VALID_MODES = new Set([
  'single_writer',
  'read_only_replica',
  'experimental_multi_instance',
]);

let cachedInstanceId = null;

function cfg() {
  return config.INSTANCE_MODE || {};
}

export function getInstanceId() {
  if (process.env.INSTANCE_ID) return process.env.INSTANCE_ID;

  if (cfg().instanceId) return cfg().instanceId;

  if (!cachedInstanceId) {
    const host = os.hostname()
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .slice(0, 48) || 'host';

    cachedInstanceId = `instance_${host}_${process.pid}`;
  }

  return cachedInstanceId;
}

export function getInstanceMode() {
  const raw = process.env.INSTANCE_MODE || cfg().mode || 'single_writer';
  return VALID_MODES.has(raw) ? raw : 'single_writer';
}

export function isSingleWriter() {
  return getInstanceMode() === 'single_writer';
}

export function isReadOnlyReplica() {
  return getInstanceMode() === 'read_only_replica';
}

export function canRunQueueWorkers() {
  if (!cfg().enabled) return true;
  if (isReadOnlyReplica()) return false;
  if (getInstanceMode() === 'experimental_multi_instance') {
    return cfg().allowQueueWorkers === true;
  }
  return cfg().allowQueueWorkers !== false;
}

export function canRunSchedulers() {
  if (!cfg().enabled) return true;
  if (isReadOnlyReplica()) return false;
  if (getInstanceMode() === 'experimental_multi_instance') {
    return cfg().allowSchedulers === true;
  }
  return cfg().allowSchedulers !== false;
}

export function canServeAdminSse() {
  if (!cfg().enabled) return true;
  if (isReadOnlyReplica()) return cfg().allowAdminSse === true;
  return cfg().allowAdminSse !== false;
}

export function getInstanceWarnings() {
  const warnings = [];
  const mode = getInstanceMode();

  if (!cfg().enabled) {
    warnings.push({
      code: 'INSTANCE_MODE_DISABLED',
      level: 'warn',
      message: 'INSTANCE_MODE is disabled; deployment safety guards are reduced.',
    });
  }

  if (!VALID_MODES.has(process.env.INSTANCE_MODE || cfg().mode || 'single_writer')) {
    warnings.push({
      code: 'UNKNOWN_INSTANCE_MODE',
      level: 'warn',
      message: 'Unknown INSTANCE_MODE value; falling back to single_writer.',
    });
  }

  if (config.ENV && config.ENV.isProduction && mode === 'experimental_multi_instance') {
    warnings.push({
      code: 'EXPERIMENTAL_MULTI_INSTANCE_IN_PRODUCTION',
      level: 'critical',
      message: 'experimental_multi_instance is not safe for production with file-based storage.',
    });
  }

  if (config.ENV && config.ENV.isProduction && mode === 'single_writer' && config.INSTANCE_MODE?.warnOnUnsafeMultiInstance) {
    warnings.push({
      code: 'SINGLE_WRITER_REQUIRED',
      level: 'info',
      message: 'Production must run exactly one writer instance for queue workers and schedulers.',
    });
  }

  if (isReadOnlyReplica()) {
    warnings.push({
      code: 'READ_ONLY_REPLICA',
      level: 'info',
      message: 'This instance is read-only: queue workers and schedulers are disabled.',
    });
  }

  return warnings;
}

export function getInstanceInfo() {
  return {
    enabled: !!cfg().enabled,
    instanceId: getInstanceId(),
    mode: getInstanceMode(),
    isSingleWriter: isSingleWriter(),
    isReadOnlyReplica: isReadOnlyReplica(),
    canRunQueueWorkers: canRunQueueWorkers(),
    canRunSchedulers: canRunSchedulers(),
    canServeAdminSse: canServeAdminSse(),
    pid: process.pid,
    hostname: os.hostname(),
    environment: config.ENV ? config.ENV.current : (process.env.NODE_ENV || 'development'),
    warnings: getInstanceWarnings(),
  };
}

export const _testHelpers = {
  resetInstanceIdCache: () => { cachedInstanceId = null; },
  VALID_MODES,
};
