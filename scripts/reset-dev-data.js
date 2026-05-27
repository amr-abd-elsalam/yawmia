#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/reset-dev-data.js — Phase 61.3 Safe Development Data Reset
// ═══════════════════════════════════════════════════════════════
// Dry-run first, confirm-required reset workflow for experimental local data.
//
// Default behavior:
//   - DRY RUN only
//   - lists target paths
//   - does not delete anything
//
// Mutating behavior:
//   - requires --confirm
//   - refuses NODE_ENV=production by default
//   - backups/logs are opt-in only
//   - can reinitialize data directories with --reinit
//
// Usage:
//   node scripts/reset-dev-data.js --dry-run --json
//   node scripts/reset-dev-data.js --confirm --json
//   node scripts/reset-dev-data.js --confirm --include-logs --json
//   node scripts/reset-dev-data.js --confirm --include-backups --json
//   node scripts/reset-dev-data.js --confirm --reinit --json
// ═══════════════════════════════════════════════════════════════

import { rm, stat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const ARGS = new Set(process.argv.slice(2));

const JSON_OUT = ARGS.has('--json');
const CONFIRM = ARGS.has('--confirm');
const DRY_RUN = ARGS.has('--dry-run') || !CONFIRM;
const INCLUDE_BACKUPS = ARGS.has('--include-backups');
const INCLUDE_LOGS = ARGS.has('--include-logs');
const REINIT = ARGS.has('--reinit');
const ALLOW_PRODUCTION = ARGS.has('--allow-production');
const CONFIRM_PRODUCTION_RESET = ARGS.has('--confirm-production-reset');

const ROOT = resolve(process.cwd());
const NODE_ENV = process.env.NODE_ENV || 'development';
const DATA_PATH = resolve(process.env.YAWMIA_DATA_PATH || './data');

const PROTECTED_NAMES = new Set([
  '.git',
  '.github',
  'node_modules',
  'server',
  'frontend',
  'scripts',
  'tests',
  'deploy',
  'docs',
  'config.js',
  'server.js',
  'package.json',
  'package-lock.json',
  '.env.example',
  '.gitignore',
]);

function rel(path) {
  const r = relative(ROOT, path).replace(/\\/g, '/');
  return r || '.';
}

function pathInsideRoot(path) {
  const r = relative(ROOT, path);
  return r && !r.startsWith('..') && !resolve(path).startsWith('..');
}

function isProtectedPath(path) {
  const name = rel(path).split('/')[0];
  return PROTECTED_NAMES.has(name);
}

function buildTargets() {
  const targets = [
    {
      key: 'data',
      path: DATA_PATH,
      included: true,
      reason: 'file-backed runtime/dev data',
    },
    {
      key: 'test-backups',
      path: resolve(ROOT, 'test-backups'),
      included: true,
      reason: 'restore drill and test backup artifacts',
    },
    {
      key: 'migration-snapshots',
      path: resolve(ROOT, 'migration-snapshots'),
      included: true,
      reason: 'migration snapshot rehearsal artifacts',
    },
    {
      key: 'logs',
      path: resolve(ROOT, 'logs'),
      included: INCLUDE_LOGS,
      reason: INCLUDE_LOGS ? 'logs explicitly included' : 'logs require --include-logs',
    },
    {
      key: 'backups',
      path: resolve(ROOT, 'backups'),
      included: INCLUDE_BACKUPS,
      reason: INCLUDE_BACKUPS ? 'backups explicitly included' : 'backups require --include-backups',
    },
  ];

  return targets;
}

async function pathStatus(path) {
  try {
    const st = await stat(path);
    return {
      exists: true,
      isDirectory: st.isDirectory(),
      isFile: st.isFile(),
      sizeBytes: st.size,
    };
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return {
        exists: false,
        isDirectory: false,
        isFile: false,
        sizeBytes: 0,
      };
    }

    return {
      exists: false,
      isDirectory: false,
      isFile: false,
      sizeBytes: 0,
      error: err && err.message ? err.message : String(err),
    };
  }
}

function assertSafeTarget(target) {
  if (!target.included) return null;

  if (!pathInsideRoot(target.path) && target.key !== 'data') {
    return {
      code: 'TARGET_OUTSIDE_REPO',
      target: target.key,
      path: target.path,
      message: 'Refusing to delete a path outside repository root.',
    };
  }

  if (isProtectedPath(target.path)) {
    return {
      code: 'PROTECTED_PATH',
      target: target.key,
      path: target.path,
      message: 'Refusing to delete source/protected path.',
    };
  }

  if (target.path === ROOT || target.path === resolve(ROOT, '.')) {
    return {
      code: 'ROOT_DELETE_REFUSED',
      target: target.key,
      path: target.path,
      message: 'Refusing to delete repository root.',
    };
  }

  return null;
}

async function buildPlan() {
  const targets = buildTargets();
  const planned = [];
  const skipped = [];
  const blockers = [];

  for (const target of targets) {
    const status = await pathStatus(target.path);
    const safetyIssue = assertSafeTarget(target);

    const row = {
      key: target.key,
      path: target.path,
      relativePath: rel(target.path),
      included: !!target.included,
      reason: target.reason,
      exists: status.exists,
      isDirectory: status.isDirectory,
      isFile: status.isFile,
      sizeBytes: status.sizeBytes,
      error: status.error || null,
    };

    if (safetyIssue) {
      blockers.push(safetyIssue);
      skipped.push({
        ...row,
        skippedReason: safetyIssue.code,
      });
      continue;
    }

    if (!target.included) {
      skipped.push({
        ...row,
        skippedReason: 'not_included',
      });
      continue;
    }

    planned.push(row);
  }

  if (NODE_ENV === 'production' && CONFIRM && (!ALLOW_PRODUCTION || !CONFIRM_PRODUCTION_RESET)) {
    blockers.push({
      code: 'PRODUCTION_RESET_BLOCKED',
      message: 'NODE_ENV=production reset requires both --allow-production and --confirm-production-reset.',
    });
  }

  return {
    root: ROOT,
    nodeEnv: NODE_ENV,
    dataPath: DATA_PATH,
    dryRun: DRY_RUN,
    confirm: CONFIRM,
    includeBackups: INCLUDE_BACKUPS,
    includeLogs: INCLUDE_LOGS,
    reinit: REINIT,
    planned,
    skipped,
    blockers,
  };
}

async function performDeletion(plan) {
  const deleted = [];
  const failed = [];

  for (const target of plan.planned) {
    if (!target.exists) {
      deleted.push({
        ...target,
        deleted: false,
        reason: 'path_missing',
      });
      continue;
    }

    try {
      await rm(target.path, { recursive: true, force: true });
      deleted.push({
        ...target,
        deleted: true,
      });
    } catch (err) {
      failed.push({
        ...target,
        deleted: false,
        error: err && err.message ? err.message : String(err),
      });
    }
  }

  return { deleted, failed };
}

async function maybeReinit(result) {
  if (!REINIT || DRY_RUN || result.failed.length > 0) {
    return {
      requested: REINIT,
      performed: false,
    };
  }

  try {
    const { initDatabase } = await import('../server/services/database.js');
    await initDatabase();

    return {
      requested: true,
      performed: true,
      ok: true,
    };
  } catch (err) {
    return {
      requested: true,
      performed: false,
      ok: false,
      error: err && err.message ? err.message : String(err),
    };
  }
}

function printHuman(result) {
  console.log(`\n🧹 Yawmia Safe Development Data Reset ${result.dryRun ? '(DRY RUN)' : '(CONFIRMED)'}\n`);

  console.log(`Root: ${result.root}`);
  console.log(`NODE_ENV: ${result.nodeEnv}`);
  console.log(`Data path: ${result.dataPath}`);
  console.log(`Mutation performed: ${result.mutationPerformed ? 'yes' : 'no'}`);
  console.log('');

  if (result.blockers.length > 0) {
    console.log('Blockers:');
    for (const blocker of result.blockers) {
      console.log(`  ❌ ${blocker.code}: ${blocker.message}`);
    }
    console.log('');
  }

  console.log('Planned targets:');
  if (result.planned.length === 0) {
    console.log('  - none');
  } else {
    for (const target of result.planned) {
      console.log(`  - ${target.relativePath} exists=${target.exists ? 'yes' : 'no'} reason=${target.reason}`);
    }
  }

  if (result.skipped.length > 0) {
    console.log('\nSkipped targets:');
    for (const target of result.skipped) {
      console.log(`  - ${target.relativePath} skipped=${target.skippedReason} reason=${target.reason}`);
    }
  }

  if (result.deleted.length > 0) {
    console.log('\nDeletion results:');
    for (const item of result.deleted) {
      console.log(`  - ${item.relativePath}: ${item.deleted ? 'deleted' : item.reason || 'skipped'}`);
    }
  }

  if (result.failed.length > 0) {
    console.log('\nFailures:');
    for (const item of result.failed) {
      console.log(`  ❌ ${item.relativePath}: ${item.error}`);
    }
  }

  if (result.dryRun) {
    console.log('\n✅ Dry-run complete. No files were deleted.');
    console.log('Re-run with --confirm to delete included targets.');
  } else if (result.ok) {
    console.log('\n✅ Reset complete.');
  } else {
    console.log('\n❌ Reset finished with errors.');
  }

  console.log('');
}

async function main() {
  const started = Date.now();
  const plan = await buildPlan();

  let deletion = {
    deleted: [],
    failed: [],
  };

  if (!DRY_RUN && plan.blockers.length === 0) {
    deletion = await performDeletion(plan);
  }

  const reinitResult = await maybeReinit(deletion);

  const result = {
    ok: plan.blockers.length === 0 && deletion.failed.length === 0 && (!reinitResult.requested || reinitResult.ok !== false),
    dryRun: DRY_RUN,
    confirm: CONFIRM,
    mutationPerformed: !DRY_RUN && deletion.deleted.some(d => d.deleted),
    root: plan.root,
    nodeEnv: plan.nodeEnv,
    dataPath: plan.dataPath,
    includeBackups: plan.includeBackups,
    includeLogs: plan.includeLogs,
    reinit: reinitResult,
    planned: plan.planned,
    skipped: plan.skipped,
    blockers: plan.blockers,
    deleted: deletion.deleted,
    failed: deletion.failed,
    protected: Array.from(PROTECTED_NAMES).sort(),
    nextRecommendedCommands: [
      'node scripts/migrate.js',
      'node scripts/verify-data-json.js --strict --json',
      'node scripts/find-null-json-files.js --json',
      'node scripts/verify-queue.js --json',
      'node scripts/phase61-1-remediation-status.js --json',
      'node scripts/measure-storage-pressure.js --json --persist',
      'node scripts/verify-scale-thresholds.js --latest-only --persist --json',
      'node scripts/benchmark-file-paths.js --json --persist',
      'node scripts/capture-externalization-decision.js --persist --json',
      'node scripts/capture-phase61-evidence.js --persist --json',
      'node scripts/evaluate-pilot-gate.js --json',
    ],
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }

  if (!result.ok) process.exit(1);
}

main().catch(err => {
  const failure = {
    ok: false,
    dryRun: DRY_RUN,
    confirm: CONFIRM,
    mutationPerformed: false,
    error: err && err.message ? err.message : String(err),
    stack: err && err.stack ? err.stack : null,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(failure, null, 2));
  } else {
    console.error('\n❌ reset-dev-data failed:', failure.error);
    if (failure.stack) console.error(failure.stack);
  }

  process.exit(1);
});
