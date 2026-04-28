// ═══════════════════════════════════════════════════════════════
// server/services/migration.js — Schema Migration System
// ═══════════════════════════════════════════════════════════════
// Forward-only, idempotent migrations. No rollback.
// Tracks state in data/migration.json.
// Built-in migrations array — add new migrations at the end.
// ═══════════════════════════════════════════════════════════════

import { join } from 'node:path';
import { readdir, rename as renameFile, readFile as readFileRaw, mkdir } from 'node:fs/promises';
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
  {
    version: 2,
    name: 'Shard high-volume collections + extract verification images',
    up: async () => {
      const BATCH_SIZE = 100;
      const shardedCollections = (config.SHARDING && config.SHARDING.enabled)
        ? (config.SHARDING.collections || [])
        : [];

      if (shardedCollections.length === 0) {
        logger.info('Migration v2: sharding disabled — skipping file moves');
      }

      // Part 1: Move flat files to monthly shard subdirectories
      for (const collection of shardedCollections) {
        const dir = config.DATABASE.dirs[collection];
        if (!dir) continue;
        const collectionPath = join(BASE_PATH, dir);

        let files;
        try {
          files = await readdir(collectionPath);
        } catch { continue; }

        // Get prefix for this collection's records
        const prefixMap = {
          jobs: 'job_', applications: 'app_', notifications: 'ntf_',
          attendance: 'att_', messages: 'msg_', ratings: 'rtg_', payments: 'pay_',
        };
        const prefix = prefixMap[collection] || '';
        const recordFiles = files.filter(f =>
          f.startsWith(prefix) && f.endsWith('.json') && !f.endsWith('.tmp')
        );

        let moved = 0;
        for (let i = 0; i < recordFiles.length; i++) {
          const fileName = recordFiles[i];
          const sourcePath = join(collectionPath, fileName);

          try {
            const raw = await readFileRaw(sourcePath, 'utf-8');
            const record = JSON.parse(raw);
            const createdAt = record.createdAt || record.appliedAt || new Date().toISOString();
            const date = new Date(createdAt);
            const egyptMs = date.getTime() + (2 * 60 * 60 * 1000);
            const egyptDate = new Date(egyptMs);
            const shard = `${egyptDate.getUTCFullYear()}-${String(egyptDate.getUTCMonth() + 1).padStart(2, '0')}`;

            const shardDir = join(collectionPath, shard);
            await mkdir(shardDir, { recursive: true });
            const destPath = join(shardDir, fileName);

            // Only move if dest doesn't already exist
            try {
              await readFileRaw(destPath);
              // Already exists in shard — skip (idempotent)
            } catch {
              await renameFile(sourcePath, destPath);
              moved++;
            }
          } catch {
            // Skip individual file errors — non-fatal
          }

          // Yield every BATCH_SIZE files
          if ((i + 1) % BATCH_SIZE === 0) {
            await new Promise(resolve => setImmediate(resolve));
          }
        }

        if (moved > 0) {
          logger.info(`Migration v2: moved ${moved} ${collection} files to shards`);
        }
      }

      // Part 2: Extract verification images to imageStore
      if (config.IMAGE_STORAGE && config.IMAGE_STORAGE.enabled) {
        try {
          const { storeImage } = await import('./imageStore.js');
          const vrfDir = getCollectionPath('verifications');
          const allVrfs = await listJSON(vrfDir);
          const vrfs = allVrfs.filter(v => v.id && v.id.startsWith('vrf_'));
          let extracted = 0;

          for (let i = 0; i < vrfs.length; i++) {
            const vrf = vrfs[i];
            let changed = false;

            // Extract nationalIdImage
            if (vrf.nationalIdImage && !vrf.nationalIdImageRef) {
              try {
                const result = await storeImage(vrf.nationalIdImage, {
                  uploadedBy: vrf.userId,
                  purpose: 'national_id',
                });
                if (result.ok) {
                  vrf.nationalIdImageRef = result.imageRef;
                  vrf.nationalIdImage = null;
                  changed = true;
                }
              } catch { /* non-fatal */ }
            }

            // Extract selfieImage
            if (vrf.selfieImage && !vrf.selfieImageRef) {
              try {
                const result = await storeImage(vrf.selfieImage, {
                  uploadedBy: vrf.userId,
                  purpose: 'selfie',
                });
                if (result.ok) {
                  vrf.selfieImageRef = result.imageRef;
                  vrf.selfieImage = null;
                  changed = true;
                }
              } catch { /* non-fatal */ }
            }

            if (changed) {
              const vrfPath = getRecordPath('verifications', vrf.id);
              await atomicWrite(vrfPath, vrf);
              extracted++;
            }

            if ((i + 1) % BATCH_SIZE === 0) {
              await new Promise(resolve => setImmediate(resolve));
            }
          }

          if (extracted > 0) {
            logger.info(`Migration v2: extracted images from ${extracted} verification records`);
          }
        } catch (err) {
          logger.warn('Migration v2: image extraction error (non-fatal)', { error: err.message });
        }
      }
    },
  },
  {
    version: 3,
    name: 'Initialize availability_windows + instant_matches collections',
    up: async () => {
      // Greenfield: initDatabase() (called at server startup) creates the new
      // directories from config.DATABASE.dirs. No data migration needed —
      // these are entirely new collections introduced by Phase 40.
      // Idempotent: re-running this migration is a no-op.
      logger.info('Migration v3: greenfield collections registered (availability_windows + instant_matches)');
    },
  },
  {
    version: 4,
    name: 'Initialize availability_ads collection (Phase 41 Talent Exchange)',
    up: async () => {
      // Greenfield: initDatabase() (called at server startup) creates the new
      // directory + monthly shard from config.DATABASE.dirs + SHARDING.collections.
      // No data migration needed — availability_ads is a new collection introduced
      // by Phase 41 (Talent Exchange Foundation).
      // Idempotent: re-running this migration is a no-op.
      logger.info('Migration v4: greenfield availability_ads collection registered (Phase 41)');
    },
  },
  {
    version: 5,
    name: 'Initialize direct_offers collection (Phase 42 Direct Offers Activation)',
    up: async () => {
      // Greenfield: initDatabase() (called at server startup) creates the new
      // directory + monthly shard from config.DATABASE.dirs + SHARDING.collections.
      // No data migration needed — direct_offers is a new collection introduced
      // by Phase 42 (Direct Offers Activation — Talent Exchange loop closure).
      // Idempotent: re-running this migration is a no-op.
      logger.info('Migration v5: greenfield direct_offers collection registered (Phase 42)');
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
