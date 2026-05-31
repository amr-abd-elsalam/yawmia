#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/repair-queue.js — Queue Repair CLI (Phase 55 + Phase 61.1)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/repair-queue.js --dry-run --json
//   node scripts/repair-queue.js --confirm --json
//
// Phase 61.1:
//   Default is dry-run unless --confirm is explicitly passed.
//   Repair mutates queue summary/location index only when confirmed.
// ═══════════════════════════════════════════════════════════════

import { readFileSync, readlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const JSON_OUT = process.argv.includes('--json');
const CONFIRM = process.argv.includes('--confirm');
const DRY_RUN = process.argv.includes('--dry-run') || !CONFIRM;
const APPROVAL_ID_ARG = (process.argv.find(a => a.startsWith('--approval-id=')) || '').slice('--approval-id='.length);
const APPROVAL_ID = APPROVAL_ID_ARG || process.env.QUEUE_REPAIR_APPROVAL_ID || '';

function parseJson(stdout) {
  if (!stdout) return null;

  try {
    return JSON.parse(stdout);
  } catch (_) {}

  const first = stdout.indexOf('{');
  const last = stdout.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(stdout.slice(first, last + 1));
    } catch (_) {}
  }

  return null;
}

function readProcessInfo(pid) {
  let cwd = null;
  let cmdline = null;

  try {
    cwd = readlinkSync(`/proc/${pid}/cwd`);
  } catch (_) {
    cwd = null;
  }

  try {
    cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf-8')
      .replace(/\0/g, ' ')
      .trim();
  } catch (_) {
    cmdline = null;
  }

  const cwdMatchesYawmia = !!(
    cwd &&
    (
      cwd === '/mnt/j/yawmia' ||
      cwd === process.cwd() ||
      cwd.endsWith('/yawmia')
    )
  );

  const cmdlineMatchesYawmiaServer = !!(
    cmdline &&
    cmdline.includes('server.js') &&
    (
      cmdline.includes('/mnt/j/yawmia') ||
      cwdMatchesYawmia
    )
  );

  return {
    pid,
    exists: !!(cwd || cmdline),
    cwd,
    cmdline,
    cwdMatchesYawmia,
    cmdlineMatchesYawmiaServer,
    yawmiaServerLikely: !!(cwdMatchesYawmia && cmdlineMatchesYawmiaServer),
  };
}

function discoverYawmiaServerProcesses() {
  const result = spawnSync('pgrep', ['-af', 'node|server.js|queue|scheduler|yawmia'], {
    encoding: 'utf-8',
    timeout: 5000,
  });

  if (result.error || result.status > 1) {
    return {
      available: false,
      error: result.error?.message || result.stderr || 'pgrep failed',
      processes: [],
    };
  }

  const rows = String(result.stdout || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const processes = [];

  for (const row of rows) {
    const pid = Number(row.split(/\s+/)[0]);
    if (!Number.isFinite(pid)) continue;
    if (pid === process.pid) continue;

    const info = readProcessInfo(pid);
    if (info.yawmiaServerLikely) {
      processes.push(info);
    }
  }

  return {
    available: true,
    error: null,
    processes,
  };
}

function discoverPm2YawmiaApps() {
  const result = spawnSync('pm2', ['jlist'], {
    encoding: 'utf-8',
    timeout: 5000,
  });

  if (result.error) {
    return {
      available: false,
      error: result.error.message,
      apps: [],
    };
  }

  if (result.status !== 0) {
    return {
      available: false,
      error: result.stderr || `pm2 jlist exited with ${result.status}`,
      apps: [],
    };
  }

  try {
    const raw = JSON.parse(result.stdout || '[]');

    const apps = raw
      .map(app => ({
        name: app.name || null,
        pm_id: app.pm_id,
        pid: app.pid || null,
        status: app.pm2_env?.status || null,
        restart_time: app.pm2_env?.restart_time || 0,
        autorestart: app.pm2_env?.autorestart,
        watch: app.pm2_env?.watch,
        pm_cwd: app.pm2_env?.pm_cwd || null,
        pm_exec_path: app.pm2_env?.pm_exec_path || null,
      }))
      .filter(app => {
        const cwd = app.pm_cwd || '';
        const execPath = app.pm_exec_path || '';
        return (
          cwd === '/mnt/j/yawmia' ||
          cwd.endsWith('/yawmia') ||
          execPath.includes('/mnt/j/yawmia/server.js') ||
          (execPath.endsWith('/server.js') && cwd.endsWith('/yawmia'))
        );
      });

    return {
      available: true,
      error: null,
      apps,
    };
  } catch (err) {
    return {
      available: false,
      error: `PM2 JSON parse failed: ${err.message}`,
      apps: [],
    };
  }
}

function runStaleRunningPreflight() {
  const proc = spawnSync(process.execPath, [
    'scripts/recover-stale-running-jobs.js',
    '--dry-run',
    '--json',
    '--summary-only',
  ], {
    env: process.env,
    encoding: 'utf-8',
    timeout: 30000,
  });

  const parsed = parseJson(proc.stdout);

  return {
    ok: proc.status === 0 && !!parsed && parsed.ok === true,
    status: proc.status,
    timedOut: proc.error?.code === 'ETIMEDOUT',
    error: proc.error?.message || null,
    parsed,
    stderrTail: String(proc.stderr || '').slice(-1000),
  };
}

function buildConfirmPreflight() {
  const blockers = [];

  const processDiscovery = discoverYawmiaServerProcesses();
  const pm2Discovery = discoverPm2YawmiaApps();
  const staleRunningPreflight = runStaleRunningPreflight();

  const activeProcesses = processDiscovery.processes || [];
  const onlinePm2Apps = (pm2Discovery.apps || []).filter(app =>
    ['online', 'launching', 'stopping'].includes(app.status)
  );

  if (!APPROVAL_ID || !APPROVAL_ID.startsWith('apr_')) {
    blockers.push({
      code: 'QUEUE_REPAIR_APPROVAL_REQUIRED',
      message: 'repair-queue --confirm requires --approval-id=apr_... or QUEUE_REPAIR_APPROVAL_ID=apr_...',
    });
  }

  if (activeProcesses.length > 0) {
    blockers.push({
      code: 'ACTIVE_YAWMIA_SERVER_PROCESS',
      message: 'Active /mnt/j/yawmia server.js process detected',
      processes: activeProcesses,
    });
  }

  if (onlinePm2Apps.length > 0) {
    blockers.push({
      code: 'PM2_MANAGED_YAWMIA_ACTIVE',
      message: 'PM2-managed Yawmia app appears online; stop it through PM2 before repair confirm',
      apps: onlinePm2Apps,
    });
  }

  if (!staleRunningPreflight.ok) {
    blockers.push({
      code: 'STALE_RUNNING_PREFLIGHT_UNAVAILABLE',
      message: 'Could not obtain stale-running dry-run proof before repair confirm',
      status: staleRunningPreflight.status,
      error: staleRunningPreflight.error,
      stderrTail: staleRunningPreflight.stderrTail,
    });
  } else {
    const parsed = staleRunningPreflight.parsed || {};

    if ((parsed.nonStaleRunningCount || 0) > 0) {
      blockers.push({
        code: 'NON_STALE_RUNNING_JOBS_PRESENT',
        message: 'Non-stale running jobs detected. Treat as active worker/server evidence.',
        nonStaleRunningCount: parsed.nonStaleRunningCount,
      });
    }

    if (parsed.activeWorkerLikely) {
      blockers.push({
        code: 'ACTIVE_QUEUE_WORKER_LIKELY',
        message: 'Stale-running dry-run indicates active queue worker/server likelihood.',
      });
    }

    if (parsed.pm2ManagedLikely) {
      blockers.push({
        code: 'PM2_MANAGED_YAWMIA_ACTIVE_BY_STALE_PREFLIGHT',
        message: 'Stale-running dry-run indicates PM2-managed Yawmia is active.',
      });
    }
  }

  return {
    allowed: blockers.length === 0,
    blockers,
    approvalId: APPROVAL_ID || null,
    processDiscovery,
    pm2Discovery,
    staleRunningPreflight: staleRunningPreflight.parsed ? {
      ok: staleRunningPreflight.ok,
      staleRunningCount: staleRunningPreflight.parsed.staleRunningCount || 0,
      nonStaleRunningCount: staleRunningPreflight.parsed.nonStaleRunningCount || 0,
      activeWorkerLikely: !!staleRunningPreflight.parsed.activeWorkerLikely,
      pm2ManagedLikely: !!staleRunningPreflight.parsed.pm2ManagedLikely,
      lockOwnerCount: staleRunningPreflight.parsed.summary?.lockOwnerCount || 0,
      runningJobsByLockOwner: staleRunningPreflight.parsed.runningJobsByLockOwner || [],
    } : {
      ok: false,
      status: staleRunningPreflight.status,
      timedOut: staleRunningPreflight.timedOut,
      error: staleRunningPreflight.error,
    },
    requiredAction: blockers.length > 0
      ? 'capture quiet PM2/process proof, stale-running dry-run proof, and provide explicit approval id'
      : null,
  };
}

function printHuman(result) {
  console.log(`\n🔧 يوميّة Queue Repair${result.dryRun ? ' (DRY RUN)' : ' (CONFIRMED)'}\n`);

  console.log(`Mutation performed: ${result.mutationPerformed ? 'yes' : 'no'}`);
  console.log(`Before: ${result.before?.status || 'unknown'}`);
  console.log(`After:  ${result.after?.status || (result.dryRun ? 'not-run' : 'unknown')}`);
  console.log(`Duration: ${result.durationMs || 0}ms`);

  if (result.summary) {
    console.log(`Summary locations: ${result.summary.locationCount || 0}`);
    console.log(`Legacy records: ${result.summary.legacyRecords || 0}`);
  }

  if (result.repairPlan && Array.isArray(result.repairPlan.actions)) {
    console.log('\nRepair plan:');
    for (const action of result.repairPlan.actions) {
      console.log(`  - ${action.type}: ${action.reason || ''}`);
    }
  }

  if (result.repairPlan && Array.isArray(result.repairPlan.risks) && result.repairPlan.risks.length > 0) {
    console.log('\nRisks / notes:');
    for (const risk of result.repairPlan.risks) {
      console.log(`  ⚠️ ${risk}`);
    }
  }

  if (!result.ok) {
    console.log('\n❌ Queue repair verification has remaining errors');
    for (const e of result.after?.errors || result.before?.errors || []) {
      console.log(`  - ${e}`);
    }
    return;
  }

  console.log(result.dryRun
    ? '\n✅ Queue repair dry-run complete. Re-run with --confirm to mutate summary.\n'
    : '\n✅ Queue repair complete\n'
  );
}

async function main() {
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const confirmPreflight = CONFIRM ? buildConfirmPreflight() : null;

  if (CONFIRM && !confirmPreflight.allowed) {
    const output = {
      ok: false,
      dryRun: false,
      mutationPerformed: false,
      code: 'CONFIRM_PREFLIGHT_BLOCKED',
      error: 'repair-queue --confirm refused because approval/quiet-state preflight failed',
      confirmPreflightAllowed: false,
      confirmPreflight,
      warnings: [
        'repair-queue --confirm is intended to rebuild queue summary/location index only',
        'repair-queue --confirm is not stale-running recovery',
        'repair-queue --confirm must not run while Yawmia server/queue worker is active',
        'repair-queue --confirm requires explicit approval id',
        'run repair-queue --dry-run --json first and preserve evidence',
      ],
      generatedAt: new Date().toISOString(),
    };

    if (JSON_OUT) {
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.error('\n❌ repair-queue --confirm blocked by preflight\n');
      for (const blocker of confirmPreflight.blockers) {
        console.error(`  - ${blocker.code}: ${blocker.message}`);
      }
      console.error('\nRun dry-run diagnostics and provide explicit approval before confirm.\n');
    }

    process.exit(3);
  }

  const { repairQueueStorage } = await import('../server/services/queueHealthVerify.js');

  const result = await repairQueueStorage({
    dryRun: DRY_RUN,
  });

  if (confirmPreflight) {
    result.confirmPreflightAllowed = confirmPreflight.allowed;
    result.confirmPreflight = confirmPreflight;
    result.approvalId = APPROVAL_ID || null;
    result.approvalRequired = true;
  }

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
    error: err.message,
    stack: err.stack,
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(failure, null, 2));
  } else {
    console.error('\n❌ Queue repair failed:', err.message);
    if (err.stack) console.error(err.stack);
  }

  process.exit(1);
});
