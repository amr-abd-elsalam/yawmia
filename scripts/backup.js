#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/backup.js — يوميّة: Data Backup Utility
// ═══════════════════════════════════════════════════════════════
// Usage: node scripts/backup.js [target-dir]
// Creates a timestamped copy of the data/ directory
// ═══════════════════════════════════════════════════════════════

import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const DATA_DIR = process.env.YAWMIA_DATA_PATH || './data';
const BACKUP_BASE = process.argv[2] || './backups';

async function backup() {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = join(BACKUP_BASE, `yawmia-backup-${timestamp}`);

  console.log(`📦 يوميّة Backup`);
  console.log(`   Source: ${DATA_DIR}`);
  console.log(`   Target: ${backupDir}`);

  // Check source exists
  try {
    await stat(DATA_DIR);
  } catch {
    console.error(`❌ Data directory not found: ${DATA_DIR}`);
    process.exit(1);
  }

  // Create backup
  await mkdir(backupDir, { recursive: true });
  await cp(DATA_DIR, backupDir, { recursive: true });

  // Count files
  let fileCount = 0;
  async function countFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await countFiles(join(dir, entry.name));
      } else if (entry.name.endsWith('.json') && !entry.name.endsWith('.tmp')) {
        fileCount++;
      }
    }
  }
  await countFiles(backupDir);

  console.log(`✅ Backup complete: ${fileCount} JSON files`);
  console.log(`   Location: ${backupDir}`);
}

backup().catch(err => {
  console.error('❌ Backup failed:', err.message);
  process.exit(1);
});
