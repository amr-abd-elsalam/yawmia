// ═══════════════════════════════════════════════════════════════
// tests/helpers/test-db.js — Test DB Helper
// ═══════════════════════════════════════════════════════════════

import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let tmpDir = null;
let originalBasePath = null;

/**
 * Create a temporary data directory for testing.
 * Patches config.DATABASE.basePath (we can't mutate frozen config,
 * so services accept an optional override).
 *
 * Returns the temp directory path.
 */
export async function setupTestDb() {
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-test-'));
  return tmpDir;
}

/**
 * Clean up the temporary directory
 */
export async function teardownTestDb() {
  if (tmpDir) {
    await rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
}

export function getTestDbPath() {
  return tmpDir;
}
