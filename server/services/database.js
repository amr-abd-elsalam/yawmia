// ═══════════════════════════════════════════════════════════════
// server/services/database.js — File-based DB with atomic writes
// ═══════════════════════════════════════════════════════════════

import { readFile, writeFile, rename, unlink, readdir, mkdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import config from '../../config.js';

// Allow override via env variable (for testing with temp directories)
const BASE_PATH = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;
const ENCODING = config.DATABASE.encoding;

/**
 * Initialize all database directories
 */
export async function initDatabase() {
  const dirs = Object.values(config.DATABASE.dirs);
  for (const dir of dirs) {
    const fullPath = join(BASE_PATH, dir);
    await mkdir(fullPath, { recursive: true });
  }
}

/**
 * Atomic write — write to .tmp then rename
 */
export async function atomicWrite(filePath, data) {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tmpPath = filePath + '.tmp';
  await writeFile(tmpPath, JSON.stringify(data, null, 2), ENCODING);
  await rename(tmpPath, filePath);
}

/**
 * Read JSON file — returns null if not found
 */
export async function readJSON(filePath) {
  try {
    const raw = await readFile(filePath, ENCODING);
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Safe Read JSON — attempts recovery from .tmp backup on corrupted JSON
 * Use for critical paths (users, jobs, payments) where data loss is unacceptable.
 * Falls back to readJSON behavior for ENOENT. Re-throws non-parse, non-ENOENT errors.
 *
 * @param {string} filePath
 * @returns {Promise<object|null>}
 */
export async function safeReadJSON(filePath) {
  try {
    const raw = await readFile(filePath, ENCODING);
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    if (err instanceof SyntaxError) {
      // Corrupted JSON — attempt recovery from .tmp backup
      const tmpPath = filePath + '.tmp';
      try {
        const tmpRaw = await readFile(tmpPath, ENCODING);
        const data = JSON.parse(tmpRaw);
        // Restore from .tmp — overwrite corrupted file
        await writeFile(filePath, tmpRaw, ENCODING);
        // Log recovery (dynamic import to avoid circular dependency)
        try {
          const { logger } = await import('./logger.js');
          logger.warn('Recovered corrupted JSON from .tmp', { filePath });
        } catch (_) { /* logging failure is non-fatal */ }
        return data;
      } catch {
        // .tmp also missing or corrupted — unrecoverable
        try {
          const { logger } = await import('./logger.js');
          logger.error('Unrecoverable corrupted JSON', { filePath, error: err.message });
        } catch (_) { /* logging failure is non-fatal */ }
        return null;
      }
    }
    throw err;
  }
}

/**
 * Delete a JSON file — ignores ENOENT
 */
export async function deleteJSON(filePath) {
  try {
    await unlink(filePath);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

/**
 * Check if file exists
 */
export async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * List all JSON files in a directory
 */
export async function listJSON(dirPath) {
  try {
    const files = await readdir(dirPath);
    const jsonFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.tmp'));
    const results = [];
    for (const file of jsonFiles) {
      const data = await readJSON(join(dirPath, file));
      if (data) results.push(data);
    }
    return results;
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

/**
 * Read or create an index file
 */
export async function readIndex(indexName) {
  const filePath = join(BASE_PATH, config.DATABASE.indexFiles[indexName]);
  return (await readJSON(filePath)) || {};
}

/**
 * Write an index file (atomic)
 */
export async function writeIndex(indexName, data) {
  const filePath = join(BASE_PATH, config.DATABASE.indexFiles[indexName]);
  await atomicWrite(filePath, data);
}

/**
 * Get full path for a record
 */
export function getRecordPath(collection, id) {
  const dir = config.DATABASE.dirs[collection];
  if (!dir) throw new Error(`Unknown collection: ${collection}`);
  return join(BASE_PATH, dir, `${id}.json`);
}

/**
 * Get full directory path for a collection
 */
export function getCollectionPath(collection) {
  const dir = config.DATABASE.dirs[collection];
  if (!dir) throw new Error(`Unknown collection: ${collection}`);
  return join(BASE_PATH, dir);
}

// ═══════════════════════════════════════════════════════════════
// Secondary Set-Based Index Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Read a set-based index file — returns {} if not found
 * @param {string} relativePath — path relative to BASE_PATH (e.g. 'applications/worker-index.json')
 */
export async function readSetIndex(relativePath) {
  const filePath = join(BASE_PATH, relativePath);
  return (await readJSON(filePath)) || {};
}

/**
 * Write a set-based index file atomically
 * @param {string} relativePath — path relative to BASE_PATH
 * @param {object} data — the full index object
 */
export async function writeSetIndex(relativePath, data) {
  const filePath = join(BASE_PATH, relativePath);
  await atomicWrite(filePath, data);
}

/**
 * Add an ID to a key's set in a set-based index (no duplicates)
 * @param {string} relativePath — path relative to BASE_PATH
 * @param {string} key — the grouping key (e.g. workerId, jobId)
 * @param {string} id — the record ID to add
 */
export async function addToSetIndex(relativePath, key, id) {
  const index = await readSetIndex(relativePath);
  if (!index[key]) {
    index[key] = [];
  }
  if (!index[key].includes(id)) {
    index[key].push(id);
  }
  await writeSetIndex(relativePath, index);
}

/**
 * Remove an ID from a key's set in a set-based index
 * Deletes the key entirely if the array becomes empty
 * @param {string} relativePath — path relative to BASE_PATH
 * @param {string} key — the grouping key
 * @param {string} id — the record ID to remove
 */
export async function removeFromSetIndex(relativePath, key, id) {
  const index = await readSetIndex(relativePath);
  if (!index[key]) return;
  index[key] = index[key].filter(item => item !== id);
  if (index[key].length === 0) {
    delete index[key];
  }
  await writeSetIndex(relativePath, index);
}

/**
 * Get all IDs for a key from a set-based index
 * Returns [] if key doesn't exist
 * @param {string} relativePath — path relative to BASE_PATH
 * @param {string} key — the grouping key
 * @returns {Promise<string[]>}
 */
export async function getFromSetIndex(relativePath, key) {
  const index = await readSetIndex(relativePath);
  return index[key] || [];
}
