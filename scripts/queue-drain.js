#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/queue-drain.js — Ops Queue Due-Job Processing Loop (Phase 52/61.4)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/queue-drain.js --dry-run --json
//   node scripts/queue-drain.js --confirm --json [--max-cycles=20] [--delay-ms=500]
//
// Important:
//   This command is NOT stale-running recovery only.
//   In confirmed mode it imports queueWorkers and calls processDueJobs().
//   That means it can claim and process due pending queue jobs.
//   Do not run --confirm while a /mnt/j/yawmia server or queue worker is active.
//
// Phase 61.4:
//   --dry-run is strictly non-mutating.
//   --json emits machine-readable JSON only.
// ═══════════════════════════════════════════════════════════════

import { readFileSync, readlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const CONFIRM = process.argv.includes('--confirm');
const DRY_RUN = process.argv.includes('--dry-run') || !CONFIRM;
const JSON_OUT = process.argv.includes('--json');

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  if (!found) return fallback;
  const value = found.slice(prefix.length);
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

function buildConfirmPreflight() {
  const processDiscovery = discoverYawmiaServerProcesses();
  const pm2Discovery = discoverPm2YawmiaApps();

  const activeProcesses = processDiscovery.processes || [];
  const onlinePm2Apps = (pm2Discovery.apps || []).filter(app =>
    ['online', 'launching', 'stopping'].includes(app.status)
  );

  const blockers = [];

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
      message: 'PM2-managed Yawmia app appears online; stop it through PM2 before queue-drain confirm',
      apps: onlinePm2Apps,
    });
  }

  return {
    allowed: blockers.length === 0,
    blockers,
    processDiscovery,
    pm2Discovery,
    requiredAction: blockers.length > 0
      ? 'pm2 stop <confirmed-yawmia-app-name-or-id>, then capture quiet dry-run snapshots'
      : null,
  };
}

async function main() {
  const started = Date.now();
  const maxCycles = getArg('max-cycles', 20);
  const delayMs = getArg('delay-ms', 500);

  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };

  if (JSON_OUT) {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  }

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const queue = await import('../server/services/opsQueue.js');

  if (DRY_RUN) {
    const stats = await queue.getQueueStats();
    const confirmPreflight = buildConfirmPreflight();

    const result = {
      ok: true,
      dryRun: true,
      mutationPerformed: false,
      confirmPreflightAllowed: confirmPreflight.allowed,
      confirmPreflight,
      maxCycles,
      delayMs,
      totalClaimed: 0,
      byStatus: stats.byStatus || {},
      byType: stats.byType || {},
      totalActiveRecords: stats.totalActiveRecords || 0,
      summary: stats.summary || null,
      warnings: [
        'dry-run does not claim, recover, retry, complete, fail, or mutate queue jobs',
        'confirmed mode calls queueWorkers.processDueJobs() and can claim/process due pending jobs',
        'queue-drain is not stale-running recovery only',
        'do not run --confirm while a /mnt/j/yawmia server or queue worker is active',
      ],
      durationMs: Date.now() - started,
      completedAt: new Date().toISOString(),
    };

    if (JSON_OUT) {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('\n🧵 يوميّة Ops Queue Due-Job Processing Loop — Dry Run\n');
      console.log('   mutationPerformed: false');
      console.log('   warning: confirmed mode calls processDueJobs() and can claim/process due jobs');
      console.log('   warning: queue-drain is not stale-running recovery only');
      console.log(`   pending: ${result.byStatus.pending || 0}`);
      console.log(`   running: ${result.byStatus.running || 0}`);
      console.log(`   completed: ${result.byStatus.completed || 0}`);
      console.log(`   failed: ${result.byStatus.failed || 0}`);
      console.log(`   dead-letter: ${result.byStatus['dead-letter'] || 0}\n`);
    }

    return;
  }

  if (!JSON_OUT) {
    console.log('\n🧵 يوميّة Ops Queue Due-Job Processing Loop — CONFIRMED\n');
    console.log('   ⚠️ This will call queueWorkers.processDueJobs().');
    console.log('   ⚠️ It can claim and process due pending queue jobs.');
    console.log('   ⚠️ It is not stale-running recovery only.');
    console.log('   ⚠️ Do not run while a /mnt/j/yawmia server or queue worker is active.');
    console.log(`   maxCycles: ${maxCycles}`);
    console.log(`   delayMs: ${delayMs}`);
  }

  const confirmPreflight = buildConfirmPreflight();

  if (!confirmPreflight.allowed) {
    const output = {
      ok: false,
      dryRun: false,
      mutationPerformed: false,
      code: 'CONFIRM_PREFLIGHT_BLOCKED',
      error: 'queue-drain --confirm refused because an active Yawmia server/PM2-managed app was detected',
      confirmPreflightAllowed: false,
      confirmPreflight,
      warnings: [
        'queue-drain --confirm calls queueWorkers.processDueJobs()',
        'queue-drain --confirm can claim and process due pending jobs',
        'do not run queue-drain --confirm while /mnt/j/yawmia/server.js is active',
        'if PM2 manages Yawmia, stop the confirmed app with pm2 stop <app>, not direct PID kill',
      ],
      durationMs: Date.now() - started,
      completedAt: new Date().toISOString(),
    };

    if (JSON_OUT) {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.error('\n❌ queue-drain --confirm blocked by active worker preflight');
      for (const blocker of confirmPreflight.blockers) {
        console.error(`   ${blocker.code}: ${blocker.message}`);
      }
      console.error('\n   Stop confirmed Yawmia PM2 app first, then capture quiet dry-run snapshots.\n');
    }

    process.exit(3);
  }

  const workers = await import('../server/services/queueWorkers.js');

  let totalClaimed = 0;
  const cycles = [];

  for (let i = 0; i < maxCycles; i++) {
    const result = await workers.processDueJobs();
    totalClaimed += result.claimed || 0;

    const stats = await queue.getQueueStats();
    const pending = stats.byStatus?.pending || 0;
    const running = stats.byStatus?.running || 0;

    cycles.push({
      cycle: i + 1,
      claimed: result.claimed || 0,
      pending,
      running,
    });

    if (!JSON_OUT) {
      console.log(`   cycle ${i + 1}: claimed=${result.claimed || 0}, pending=${pending}, running=${running}`);
    }

    if (pending === 0 && running === 0) break;
    await sleep(delayMs);
  }

  await workers.stopQueueWorkers({ drainMs: 5000 }).catch(() => {});

  const finalStats = await queue.getQueueStats();

  const output = {
    ok: true,
    dryRun: false,
    mutationPerformed: totalClaimed > 0,
    maxCycles,
    delayMs,
    cycles,
    totalClaimed,
    byStatus: finalStats.byStatus || {},
    byType: finalStats.byType || {},
    totalActiveRecords: finalStats.totalActiveRecords || 0,
    summary: finalStats.summary || null,
    warnings: [
      'confirmed mode called queueWorkers.processDueJobs()',
      'this command can claim/process due pending jobs',
      'queue-drain is not stale-running recovery only',
      'do not run --confirm while a /mnt/j/yawmia server or queue worker is active',
    ],
    durationMs: Date.now() - started,
    completedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log('\n✅ Queue due-job processing loop complete');
    console.log('   note: this command called processDueJobs() and may have processed due jobs');
    console.log(`   totalClaimed: ${totalClaimed}`);
    console.log(`   pending: ${finalStats.byStatus?.pending || 0}`);
    console.log(`   running: ${finalStats.byStatus?.running || 0}`);
    console.log(`   completed: ${finalStats.byStatus?.completed || 0}`);
    console.log(`   failed: ${finalStats.byStatus?.failed || 0}`);
    console.log(`   dead-letter: ${finalStats.byStatus?.['dead-letter'] || 0}\n`);
  }
}

main().catch(err => {
  const payload = {
    ok: false,
    dryRun: DRY_RUN,
    mutationPerformed: false,
    error: err.message,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.error('\n❌ Queue drain failed:', err.message);
    if (err.stack) console.error(err.stack);
  }

  process.exit(1);
});
