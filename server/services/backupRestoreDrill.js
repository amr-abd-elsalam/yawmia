// ═══════════════════════════════════════════════════════════════
// server/services/backupRestoreDrill.js — Backup Restore Drill (Phase 54)
// ═══════════════════════════════════════════════════════════════
// Verifies latest/manual backup can be restored and parsed.
// Storage: data/metrics/backup-restore-drills/{brd_x}.json
// Restore target: config.BACKUP_RESTORE_DRILL.restoreTargetDir/{drillId}
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import { cp, readdir, readFile, rm, mkdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import config from '../../config.js';
import {
  atomicWrite,
  readJSON,
  deleteJSON,
  getRecordPath,
  getCollectionPath,
  listJSON,
} from './database.js';
import { logger } from './logger.js';
import { eventBus } from './eventBus.js';

function isEnabled() {
  return !!(config.BACKUP_RESTORE_DRILL && config.BACKUP_RESTORE_DRILL.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function generateId() {
  return 'brd_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

function drillPath(id) {
  return getRecordPath('backup_restore_drills', id);
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (_) {
    return false;
  }
}

async function findLatestBackup() {
  const targetDir = config.BACKUP?.targetDir || './backups';

  try {
    const entries = await readdir(targetDir, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory() && e.name.startsWith('yawmia-backup-'))
      .map(e => e.name)
      .sort()
      .reverse();

    if (dirs.length === 0) return null;
    return join(targetDir, dirs[0]);
  } catch (_) {
    return null;
  }
}

async function walkJsonFiles(root) {
  const results = [];

  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      results.push({ filePath: dir, error: err.message, unreadableDir: true });
      return;
    }

    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.tmp')) {
        results.push({ filePath: full });
      }
    }
  }

  await walk(root);
  return results;
}

async function verifyJsonParse(root, errors) {
  const files = await walkJsonFiles(root);
  let parsed = 0;

  for (let i = 0; i < files.length; i++) {
    const item = files[i];

    if (item.unreadableDir) {
      errors.push({ check: 'jsonParse', filePath: item.filePath, error: item.error });
      continue;
    }

    try {
      const raw = await readFile(item.filePath, 'utf-8');
      JSON.parse(raw);
      parsed++;
    } catch (err) {
      errors.push({
        check: 'jsonParse',
        filePath: item.filePath,
        error: err.message,
      });
    }

    if ((i + 1) % 250 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  return { totalJsonFiles: files.filter(f => !f.unreadableDir).length, parsed };
}

async function verifyCriticalIndexes(root, errors) {
  const required = [
    'users/phone-index.json',
    'jobs/index.json',
  ];

  let okCount = 0;

  for (const rel of required) {
    const filePath = join(root, rel);
    try {
      const raw = await readFile(filePath, 'utf-8');
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') {
        errors.push({ check: 'criticalIndexes', filePath, error: 'Index is not an object' });
      } else {
        okCount++;
      }
    } catch (err) {
      errors.push({ check: 'criticalIndexes', filePath, error: err.message });
    }
  }

  return { required: required.length, ok: okCount };
}

async function verifyMigrationState(root, errors) {
  const filePath = join(root, config.MIGRATION?.dataFile || 'migration.json');

  try {
    const raw = await readFile(filePath, 'utf-8');
    const data = JSON.parse(raw);
    if (!data || typeof data.version !== 'number') {
      errors.push({ check: 'migrationState', filePath, error: 'Invalid migration state' });
      return { ok: false, version: null };
    }
    return { ok: true, version: data.version };
  } catch (err) {
    errors.push({ check: 'migrationState', filePath, error: err.message });
    return { ok: false, version: null };
  }
}

async function countTopLevelCollections(root) {
  const counts = {};
  const dirs = config.DATABASE?.dirs || {};

  for (const [collection, rel] of Object.entries(dirs)) {
    const dir = join(root, rel);
    try {
      const files = await walkJsonFiles(dir);
      counts[collection] = files.filter(f => !f.unreadableDir).length;
    } catch (_) {
      counts[collection] = 0;
    }
  }

  return counts;
}

async function cleanupOldRestoreDrillRecords() {
  const retentionCount = config.BACKUP_RESTORE_DRILL?.retentionCount || 10;
  const rows = await listRestoreDrills({ limit: 1000, offset: 0 });
  const drills = rows.drills || [];

  if (drills.length <= retentionCount) return 0;

  const toDelete = drills.slice(retentionCount);
  let cleaned = 0;

  for (const d of toDelete) {
    try {
      await deleteJSON(drillPath(d.id));
      cleaned++;
    } catch (_) {}
  }

  return cleaned;
}

export async function runBackupRestoreDrill(options = {}) {
  if (!isEnabled()) {
    return { ok: false, disabled: true, code: 'BACKUP_RESTORE_DRILL_DISABLED' };
  }

  const id = options.id || generateId();
  const startedAt = nowIso();
  const startedMs = Date.now();
  const errors = [];

  const backupPath = options.backupPath || await findLatestBackup();

  const recordBase = {
    id,
    status: 'running',
    backupPath: backupPath || null,
    restorePath: null,
    startedAt,
    completedAt: null,
    durationMs: 0,
    checks: {
      jsonParse: false,
      criticalIndexes: false,
      migrationState: false,
    },
    counts: {},
    errors: [],
    createdAt: startedAt,
    updatedAt: startedAt,
  };

  await atomicWrite(drillPath(id), recordBase);

  eventBus.emit('backup_restore_drill:started', {
    drillId: id,
    backupPath: backupPath || null,
    timestamp: startedAt,
  });

  try {
    if (!backupPath) {
      errors.push({ check: 'backupPath', error: 'No backup directory found' });
      throw new Error('No backup directory found');
    }

    if (!await pathExists(backupPath)) {
      errors.push({ check: 'backupPath', backupPath, error: 'Backup path does not exist' });
      throw new Error('Backup path does not exist');
    }

    const restoreBase = options.restoreTargetDir || config.BACKUP_RESTORE_DRILL.restoreTargetDir || './test-backups/restore-drills';
    const restorePath = join(restoreBase, id);

    await rm(restorePath, { recursive: true, force: true }).catch(() => {});
    await mkdir(restorePath, { recursive: true });

    await cp(backupPath, restorePath, { recursive: true });

    const counts = {};

    if (config.BACKUP_RESTORE_DRILL.verifyJsonParse !== false) {
      const jsonResult = await verifyJsonParse(restorePath, errors);
      counts.jsonFiles = jsonResult.totalJsonFiles;
      counts.jsonParsed = jsonResult.parsed;
    }

    if (config.BACKUP_RESTORE_DRILL.verifyCriticalIndexes !== false) {
      counts.criticalIndexes = await verifyCriticalIndexes(restorePath, errors);
    }

    if (config.BACKUP_RESTORE_DRILL.verifyMigrationState !== false) {
      counts.migrationState = await verifyMigrationState(restorePath, errors);
    }

    counts.collections = await countTopLevelCollections(restorePath);

    const passed = errors.length === 0;

    const record = {
      ...recordBase,
      status: passed ? 'passed' : 'failed',
      restorePath,
      completedAt: nowIso(),
      durationMs: Date.now() - startedMs,
      checks: {
        jsonParse: !errors.some(e => e.check === 'jsonParse'),
        criticalIndexes: !errors.some(e => e.check === 'criticalIndexes'),
        migrationState: !errors.some(e => e.check === 'migrationState'),
      },
      counts,
      errors: errors.slice(0, 100),
      updatedAt: nowIso(),
    };

    await atomicWrite(drillPath(id), record);

    if (config.BACKUP_RESTORE_DRILL.cleanupRestoreTarget !== false && options.keepRestoreTarget !== true) {
      await rm(restorePath, { recursive: true, force: true }).catch(() => {});
      record.restorePathCleaned = true;
      await atomicWrite(drillPath(id), record);
    }

    await cleanupOldRestoreDrillRecords().catch(() => {});

    eventBus.emit(passed ? 'backup_restore_drill:passed' : 'backup_restore_drill:failed', {
      drillId: id,
      backupPath,
      errorCount: errors.length,
      timestamp: record.completedAt,
    });

    return { ok: passed, drill: record };
  } catch (err) {
    const failed = {
      ...recordBase,
      status: 'failed',
      completedAt: nowIso(),
      durationMs: Date.now() - startedMs,
      errors: errors.length > 0 ? errors.slice(0, 100) : [{ check: 'internal', error: err.message }],
      updatedAt: nowIso(),
    };

    await atomicWrite(drillPath(id), failed).catch(() => {});

    eventBus.emit('backup_restore_drill:failed', {
      drillId: id,
      backupPath: backupPath || null,
      error: err.message,
      timestamp: failed.completedAt,
    });

    logger.warn('backupRestoreDrill: failed', { drillId: id, error: err.message });

    return { ok: false, drill: failed, error: err.message };
  }
}

export async function listRestoreDrills(options = {}) {
  if (!isEnabled()) return { drills: [], total: 0, limit: 20, offset: 0 };

  const dir = getCollectionPath('backup_restore_drills');
  let rows = await listJSON(dir);
  rows = rows.filter(r => r && r.id && r.id.startsWith('brd_'));

  if (options.status) rows = rows.filter(r => r.status === options.status);

  rows.sort((a, b) => new Date(b.startedAt || b.createdAt) - new Date(a.startedAt || a.createdAt));

  const total = rows.length;
  const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 20));
  const offset = Math.max(0, parseInt(options.offset) || 0);

  return {
    drills: rows.slice(offset, offset + limit),
    total,
    limit,
    offset,
  };
}

export async function getRestoreDrill(drillId) {
  if (!drillId || typeof drillId !== 'string') return null;
  return await readJSON(drillPath(drillId));
}

export async function cleanupOldRestoreDrills() {
  return await cleanupOldRestoreDrillRecords();
}

export const _testHelpers = {
  generateId,
  findLatestBackup,
  walkJsonFiles,
  verifyJsonParse,
  verifyCriticalIndexes,
  verifyMigrationState,
  countTopLevelCollections,
  drillPath,
};
