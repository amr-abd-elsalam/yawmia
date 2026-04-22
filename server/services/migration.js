// ═══════════════════════════════════════════════════════════════
// server/services/migration.js — Schema Migration System
// ═══════════════════════════════════════════════════════════════
// Forward-only, idempotent migrations. No rollback.
// Tracks state in data/migration.json.
// Built-in migrations array — add new migrations at the end.
// ═══════════════════════════════════════════════════════════════

import { join } from 'node:path';
import config from '../../config.js';
import { atomicWrite, readJSON, getCollectionPath, listJSON, getRecordPath } from './database.js';
import { logger } from './logger.js';

const BASE_PATH = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;

/**
 * Get migration state file path
 * @returns {string}
 */
function getMigrationFilePath() {
  const fileName = (config.MIGRATION && config.MIGRATION.dataFile) || 'migration.json';
  return join(BASE_PATH, fileName);
}

/**
 * Read current migration state
 * @returns {Promise<{ version: number, appliedAt: string|null, migrations: object[] }>}
 */
async function readState() {
  const filePath = getMigrationFilePath();
  const state = await readJSON(filePath);
  return state || { version: 0, appliedAt: null, migrations: [] };
}

/**
 * Write migration state atomically
 * @param {object} state
 */
async function writeState(state) {
  const filePath = getMigrationFilePath();
  await atomicWrite(filePath, state);
}

/**
 * Get current schema version (0 = fresh system, no migrations applied)
 * @returns {Promise<number>}
 */
export async function getCurrentVersion() {
  const state = await readState();
  return state.version;
}

// ═══════════════════════════════════════════════════════════════
// Built-in Migrations
// ═══════════════════════════════════════════════════════════════

const builtInMigrations = [
  {
    version: 1,
    name: 'Ensure availability field on all users',
    up: async () => {
      const usersDir = getCollectionPath('users');
      const allUsers = await listJSON(usersDir);
      const users = allUsers.filter(u => u.id && u.id.startsWith('usr_'));

      let updated = 0;
      const now = new Date().toISOString();

      for (const user of users) {
        if (!user.availability) {
          user.availability = {
            available: (config.WORKER_AVAILABILITY && config.WORKER_AVAILABILITY.defaultAvailable !== undefined)
              ? config.WORKER_AVAILABILITY.defaultAvailable : true,
            availableFrom: null,
            availableUntil: null,
            updatedAt: now,
          };
          const userPath = getRecordPath('users', user.id);
          await atomicWrite(userPath, user);
          updated++;
        }
      }

      if (updated > 0) {
        logger.info(`Migration v1: added availability to ${updated} users`);
      }
    },
  },
];

/**
 * Run all pending migrations in order
 * Forward-only — stops on first failure
 * Idempotent — skips already-applied migrations
 *
 * @returns {Promise<{ applied: number, current: number }>}
 */
export async function runMigrations() {
  // Feature flag check
  if (!config.MIGRATION || !config.MIGRATION.enabled) {
    return { applied: 0, current: 0 };
  }

  const state = await readState();
  const currentVersion = state.version;

  // Filter pending migrations (higher version than current)
  const pending = builtInMigrations
    .filter(m => m.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  if (pending.length === 0) {
    return { applied: 0, current: currentVersion };
  }

  logger.info(`Migration: ${pending.length} pending migration(s) from v${currentVersion}`);

  let applied = 0;

  for (const migration of pending) {
    try {
      logger.info(`Migration: running v${migration.version} — ${migration.name}`);
      await migration.up();

      // Update state atomically after each successful migration
      state.version = migration.version;
      state.appliedAt = new Date().toISOString();
      state.migrations.push({
        version: migration.version,
        name: migration.name,
        appliedAt: new Date().toISOString(),
      });
      await writeState(state);

      applied++;
      logger.info(`Migration: v${migration.version} applied successfully`);
    } catch (err) {
      // Stop on first failure — no partial state
      logger.error(`Migration: v${migration.version} FAILED — stopping`, { error: err.message });
      throw err;
    }
  }

  return { applied, current: state.version };
}
