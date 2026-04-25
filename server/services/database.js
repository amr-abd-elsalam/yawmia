// ═══════════════════════════════════════════════════════════════
// server/services/database.js — File-based DB with atomic writes
// ═══════════════════════════════════════════════════════════════

import { readFile, writeFile, rename, unlink, readdir, mkdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import config from '../../config.js';
import { get as cacheGet, set as cacheSet, invalidate as cacheInvalidate } from './cache.js';
import { withLock } from './resourceLock.js';

// Allow override via env variable (for testing with temp directories)
const BASE_PATH = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;
const ENCODING = config.DATABASE.encoding;

// ═══════════════════════════════════════════════════════════════
// Sharding Helpers
// ═══════════════════════════════════════════════════════════════

/** @type {Map<string, string>} recordId → shard subdir path (e.g. 'data/jobs/2026-04') */
const shardLocationCache = new Map();

/**
 * Check if sharding is enabled for a collection
 * @param {string} collection
 * @returns {boolean}
 */
function isShardedCollection(collection) {
  if (!config.SHARDING || !config.SHARDING.enabled) return false;
  return config.SHARDING.collections.includes(collection);
}

/**
 * Get current shard key (YYYY-MM in Egypt timezone UTC+2)
 * @returns {string} e.g. '2026-04'
 */
function getCurrentShard() {
  const now = new Date();
  const egyptMs = now.getTime() + (2 * 60 * 60 * 1000);
  const egyptDate = new Date(egyptMs);
  const y = egyptDate.getUTCFullYear();
  const m = String(egyptDate.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Enforce max entries in shard location cache
 */
function trimShardCache() {
  const max = (config.SHARDING && config.SHARDING.locationCacheMax) || 50000;
  if (shardLocationCache.size > max) {
    // Delete oldest entries (first inserted in Map)
    const excess = shardLocationCache.size - max;
    let count = 0;
    for (const key of shardLocationCache.keys()) {
      if (count >= excess) break;
      shardLocationCache.delete(key);
      count++;
    }
  }
}

/**
 * Get list of shard subdirectories for a collection (newest first)
 * @param {string} collectionDir — full path to collection root
 * @returns {Promise<string[]>} sorted shard names descending (e.g. ['2026-04', '2026-03', ...])
 */
async function getShardDirs(collectionDir) {
  try {
    const entries = await readdir(collectionDir, { withFileTypes: true });
    const shards = entries
      .filter(e => e.isDirectory() && /^\d{4}-\d{2}$/.test(e.name))
      .map(e => e.name)
      .sort()
      .reverse(); // newest first
    return shards;
  } catch {
    return [];
  }
}

/**
 * Initialize all database directories
 * Creates shard subdirectories for current month on sharded collections
 */
export async function initDatabase() {
  const dirs = Object.values(config.DATABASE.dirs);
  for (const dir of dirs) {
    const fullPath = join(BASE_PATH, dir);
    await mkdir(fullPath, { recursive: true });
  }

  // Create current month shard dirs for sharded collections
  if (config.SHARDING && config.SHARDING.enabled) {
    const currentShard = getCurrentShard();
    for (const collection of config.SHARDING.collections) {
      const dir = config.DATABASE.dirs[collection];
      if (dir) {
        const shardPath = join(BASE_PATH, dir, currentShard);
        await mkdir(shardPath, { recursive: true });
      }
    }
  }
}

/**
 * Atomic write — write to .tmp then rename
 * Invalidates cache after successful write
 */
export async function atomicWrite(filePath, data) {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tmpPath = filePath + '.tmp';
  await writeFile(tmpPath, JSON.stringify(data, null, 2), ENCODING);
  await rename(tmpPath, filePath);
  // Invalidate cache AFTER successful disk write
  cacheInvalidate(`file:${filePath}`);
}

/**
 * Read JSON file — returns null if not found
 * Integrates with in-memory cache for read acceleration
 * For sharded collections: if file not found at given path, scans shard subdirs
 */
export async function readJSON(filePath) {
  // Check cache first
  const cacheKey = `file:${filePath}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const raw = await readFile(filePath, ENCODING);
    const parsed = JSON.parse(raw);

    // Cache the result with appropriate TTL
    const ttl = resolveCacheTtl(filePath);
    if (ttl > 0) {
      cacheSet(cacheKey, parsed, ttl);
    }

    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') {
      // Shard fallback: if this looks like a flat path for a sharded collection,
      // scan shard subdirs to find the file
      const shardResult = await _shardFallbackRead(filePath);
      if (shardResult) return shardResult;
      return null;
    }
    throw err;
  }
}

/**
 * Shard fallback read — scans shard subdirs for a file not found at flat path
 * Only activates for sharded collections. Returns parsed JSON or null.
 * Updates shard location cache on hit.
 * @param {string} flatFilePath — the original flat path that returned ENOENT
 * @returns {Promise<object|null>}
 */
async function _shardFallbackRead(flatFilePath) {
  if (!config.SHARDING || !config.SHARDING.enabled) return null;

  // Extract collection and filename from flat path
  // flatFilePath format: BASE_PATH/collectionDir/id.json
  const fileName = flatFilePath.split('/').pop(); // e.g. 'job_abc123.json'
  if (!fileName || !fileName.endsWith('.json')) return null;

  // Determine which collection this belongs to
  let matchedCollection = null;
  let collectionDir = null;
  for (const [col, dir] of Object.entries(config.DATABASE.dirs)) {
    const colPath = join(BASE_PATH, dir);
    if (flatFilePath.startsWith(colPath + '/') && flatFilePath === join(colPath, fileName)) {
      matchedCollection = col;
      collectionDir = colPath;
      break;
    }
  }

  if (!matchedCollection || !isShardedCollection(matchedCollection)) return null;

  // Scan shard subdirs (newest first, limited by readScanMonths)
  const maxShards = (config.SHARDING.readScanMonths || 6);
  const shardDirs = await getShardDirs(collectionDir);

  for (let i = 0; i < Math.min(shardDirs.length, maxShards); i++) {
    const shardPath = join(collectionDir, shardDirs[i], fileName);
    try {
      const raw = await readFile(shardPath, ENCODING);
      const parsed = JSON.parse(raw);

      // Update shard location cache
      const id = fileName.replace('.json', '');
      shardLocationCache.set(`${matchedCollection}:${id}`, join(collectionDir, shardDirs[i]));
      trimShardCache();

      // Cache the result
      const cacheKey = `file:${shardPath}`;
      const ttl = resolveCacheTtl(shardPath);
      if (ttl > 0) {
        cacheSet(cacheKey, parsed, ttl);
      }

      return parsed;
    } catch {
      // Not in this shard — continue scanning
    }
  }

  return null;
}

/**
 * Resolve cache TTL based on file path
 * @param {string} filePath
 * @returns {number} TTL in ms (0 = don't cache)
 */
function resolveCacheTtl(filePath) {
  if (!config.CACHE || !config.CACHE.enabled) return 0;
  const ttl = config.CACHE.ttl;
  if (filePath.includes('/users/') && filePath.includes('phone-index')) return ttl.phoneIndex;
  if (filePath.includes('/users/')) return ttl.user;
  if (filePath.includes('/jobs/') && !filePath.includes('index.json') && !filePath.includes('employer-index')) return ttl.job;
  if (filePath.includes('/sessions/')) return ttl.session;
  return config.CACHE.defaultTtlMs;
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
 * Invalidates cache after successful delete
 */
export async function deleteJSON(filePath) {
  try {
    await unlink(filePath);
    // Invalidate cache AFTER successful disk delete
    cacheInvalidate(`file:${filePath}`);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}


/**
 * List all JSON files in a directory (shard-aware)
 * For sharded collections: also walks shard subdirectories
 * @param {string} dirPath
 * @param {{ prefix?: string }} [options] — optional prefix filter for filenames
 */
export async function listJSON(dirPath, options = {}) {
  try {
    const files = await readdir(dirPath);
    let jsonFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.tmp'));
    if (options.prefix) {
      jsonFiles = jsonFiles.filter(f => f.startsWith(options.prefix));
    }
    const results = [];
    for (const file of jsonFiles) {
      const data = await readJSON(join(dirPath, file));
      if (data) results.push(data);
    }

    // Walk shard subdirectories if they exist
    const shardDirs = await getShardDirs(dirPath);
    for (const shard of shardDirs) {
      const shardPath = join(dirPath, shard);
      try {
        const shardFiles = await readdir(shardPath);
        let shardJsonFiles = shardFiles.filter(f => f.endsWith('.json') && !f.endsWith('.tmp'));
        if (options.prefix) {
          shardJsonFiles = shardJsonFiles.filter(f => f.startsWith(options.prefix));
        }
        for (const file of shardJsonFiles) {
          const data = await readJSON(join(shardPath, file));
          if (data) results.push(data);
        }
      } catch {
        // Skip inaccessible shard dir
      }
    }

    return results;
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

/**
 * Paginated list of JSON files in a directory.
 * Reads ONLY the requested slice — O(k) disk reads instead of O(n).
 * @param {string} dirPath
 * @param {{ skip?: number, limit?: number, prefix?: string, sortDir?: 'asc'|'desc' }} [options]
 * @returns {Promise<{ items: object[], total: number }>}
 */
export async function paginatedListJSON(dirPath, options = {}) {
  const skip = Math.max(0, options.skip || 0);
  const limit = Math.max(0, typeof options.limit === 'number' ? options.limit : 20);
  const prefix = options.prefix || '';
  const sortDir = options.sortDir || 'desc';

  try {
    const files = await readdir(dirPath);
    let jsonFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.tmp'));
    if (prefix) {
      jsonFiles = jsonFiles.filter(f => f.startsWith(prefix));
    }

    // Sort by filename (lexicographic — crypto hex IDs are roughly chronological)
    jsonFiles.sort();
    if (sortDir === 'desc') {
      jsonFiles.reverse();
    }

    const total = jsonFiles.length;

    // Slice to requested page
    const sliced = jsonFiles.slice(skip, skip + limit);

    // Read only sliced files
    const items = [];
    for (const file of sliced) {
      const data = await readJSON(join(dirPath, file));
      if (data) items.push(data);
    }

    return { items, total };
  } catch (err) {
    if (err.code === 'ENOENT') return { items: [], total: 0 };
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
 * Validate a record ID for safe filesystem use.
 * Allows: alphanumeric, underscore, hyphen (covers all ID formats + phone numbers).
 * Rejects: path traversal (..), slashes, HTML/script, empty, null, too long.
 * @param {*} id
 * @returns {boolean}
 */
export function isValidId(id) {
  if (!id || typeof id !== 'string') return false;
  if (id.length > 100) return false;
  if (id.includes('..')) return false;
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

/**
 * Get full path for a record (shard-aware with cache)
 * For sharded collections: checks cache → returns cached shard path OR flat path as default.
 * readJSON handles async fallback scanning if file not found at returned path.
 * For non-sharded collections: returns flat path (unchanged behavior).
 */
export function getRecordPath(collection, id) {
  const dir = config.DATABASE.dirs[collection];
  if (!dir) throw new Error(`Unknown collection: ${collection}`);
  if (!isValidId(id)) throw new Error(`Invalid record ID: ${id}`);

  // Sharded collection: check location cache
  if (isShardedCollection(collection)) {
    const cacheKey = `${collection}:${id}`;
    const cachedDir = shardLocationCache.get(cacheKey);
    if (cachedDir) {
      return join(cachedDir, `${id}.json`);
    }
    // Cache miss: return flat path as default — readJSON will do shard scan
  }

  return join(BASE_PATH, dir, `${id}.json`);
}

/**
 * Get full path for WRITING a new record (always current month shard)
 * For sharded collections: returns path in current month subdirectory.
 * For non-sharded collections: returns flat path (same as getRecordPath).
 * USE ONLY for new record creation — updates should use getRecordPath.
 */
export function getWriteRecordPath(collection, id) {
  const dir = config.DATABASE.dirs[collection];
  if (!dir) throw new Error(`Unknown collection: ${collection}`);
  if (!isValidId(id)) throw new Error(`Invalid record ID: ${id}`);

  if (isShardedCollection(collection)) {
    const shard = getCurrentShard();
    const shardDir = join(BASE_PATH, dir, shard);
    // Update shard location cache
    shardLocationCache.set(`${collection}:${id}`, shardDir);
    trimShardCache();
    return join(shardDir, `${id}.json`);
  }

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
 * Serialized per index file via withLock to prevent concurrent write races
 * @param {string} relativePath — path relative to BASE_PATH
 * @param {string} key — the grouping key (e.g. workerId, jobId)
 * @param {string} id — the record ID to add
 */
export async function addToSetIndex(relativePath, key, id) {
  return withLock(`index:${relativePath}`, async () => {
    const index = await readSetIndex(relativePath);
    if (!index[key]) {
      index[key] = [];
    }
    if (!index[key].includes(id)) {
      index[key].push(id);
    }
    await writeSetIndex(relativePath, index);
  });
}

/**
 * Remove an ID from a key's set in a set-based index
 * Deletes the key entirely if the array becomes empty
 * Serialized per index file via withLock to prevent concurrent write races
 * @param {string} relativePath — path relative to BASE_PATH
 * @param {string} key — the grouping key
 * @param {string} id — the record ID to remove
 */
export async function removeFromSetIndex(relativePath, key, id) {
  return withLock(`index:${relativePath}`, async () => {
    const index = await readSetIndex(relativePath);
    if (!index[key]) return;
    index[key] = index[key].filter(item => item !== id);
    if (index[key].length === 0) {
      delete index[key];
    }
    await writeSetIndex(relativePath, index);
  });
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

// ═══════════════════════════════════════════════════════════════
// Stale .tmp File Cleanup
// ═══════════════════════════════════════════════════════════════

/**
 * Clean stale .tmp files from all data directories (shard-aware)
 * Orphan .tmp files older than 5 minutes are deleted (crash leftovers)
 * Fire-and-forget safe — logs warnings but never throws
 * @returns {Promise<number>} count of cleaned .tmp files
 */
export async function cleanStaleTmpFiles() {
  const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  const now = Date.now();
  let cleaned = 0;

  async function cleanDir(fullPath) {
    try {
      const entries = await readdir(fullPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && /^\d{4}-\d{2}$/.test(entry.name)) {
          // Recurse into shard subdirectories
          cleaned += await cleanDirFlat(join(fullPath, entry.name));
        } else if (entry.isFile() && entry.name.endsWith('.tmp')) {
          try {
            const filePath = join(fullPath, entry.name);
            const fileStat = await stat(filePath);
            const ageMs = now - fileStat.mtime.getTime();
            if (ageMs > STALE_THRESHOLD_MS) {
              await unlink(filePath);
              cleaned++;
              try {
                const { logger } = await import('./logger.js');
                logger.warn('Cleaned stale .tmp file', { file: filePath, ageMinutes: Math.round(ageMs / 60000) });
              } catch (_) { /* non-fatal */ }
            }
          } catch (_) { /* non-fatal */ }
        }
      }
    } catch (_) { /* non-fatal */ }
  }

  async function cleanDirFlat(fullPath) {
    let count = 0;
    try {
      const files = await readdir(fullPath);
      for (const file of files) {
        if (!file.endsWith('.tmp')) continue;
        try {
          const filePath = join(fullPath, file);
          const fileStat = await stat(filePath);
          const ageMs = now - fileStat.mtime.getTime();
          if (ageMs > STALE_THRESHOLD_MS) {
            await unlink(filePath);
            count++;
            try {
              const { logger } = await import('./logger.js');
              logger.warn('Cleaned stale .tmp file', { file: filePath, ageMinutes: Math.round(ageMs / 60000) });
            } catch (_) { /* non-fatal */ }
          }
        } catch (_) { /* non-fatal */ }
      }
    } catch (_) { /* non-fatal */ }
    return count;
  }

  const dirs = Object.values(config.DATABASE.dirs);
  for (const dir of dirs) {
    await cleanDir(join(BASE_PATH, dir));
  }

  return cleaned;
}

// ═══════════════════════════════════════════════════════════════
// Shard-Aware Directory Walking for Cleanup Operations
// ═══════════════════════════════════════════════════════════════

/**
 * Walk a collection directory and all its shard subdirs, yielding JSON filenames.
 * For use in cleanup operations that need to iterate all files.
 * @param {string} collectionDir — full path to collection root
 * @param {string} prefix — filename prefix filter (e.g. 'ntf_', 'job_')
 * @returns {Promise<Array<{ filePath: string, fileName: string }>>}
 */
export async function walkCollectionFiles(collectionDir, prefix) {
  const results = [];

  // Flat files in root
  try {
    const files = await readdir(collectionDir);
    for (const f of files) {
      if (f.startsWith(prefix) && f.endsWith('.json') && !f.endsWith('.tmp')) {
        results.push({ filePath: join(collectionDir, f), fileName: f });
      }
    }
  } catch { /* ENOENT or similar — non-fatal */ }

  // Shard subdirectories
  const shardDirs = await getShardDirs(collectionDir);
  for (const shard of shardDirs) {
    const shardPath = join(collectionDir, shard);
    try {
      const files = await readdir(shardPath);
      for (const f of files) {
        if (f.startsWith(prefix) && f.endsWith('.json') && !f.endsWith('.tmp')) {
          results.push({ filePath: join(shardPath, f), fileName: f });
        }
      }
    } catch { /* non-fatal */ }
  }

  return results;
}

/**
 * Clear the shard location cache (for testing)
 */
export function clearShardCache() {
  shardLocationCache.clear();
}

/**
 * Get shard location cache size (for monitoring)
 * @returns {number}
 */
export function getShardCacheSize() {
  return shardLocationCache.size;
}
