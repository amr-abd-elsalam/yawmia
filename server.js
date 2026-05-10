// ═══════════════════════════════════════════════════════════════
// server.js — يوميّة: Entry Point
// ═══════════════════════════════════════════════════════════════

import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

// Load env
try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {
  // dotenv not installed yet — use process.env directly
}

import config from './config.js';
import { createRouter } from './server/router.js';
import { corsMiddleware } from './server/middleware/cors.js';
import { securityMiddleware } from './server/middleware/security.js';
import { requestIdMiddleware } from './server/middleware/requestId.js';
import { bodyParserMiddleware } from './server/middleware/bodyParser.js';
import { rateLimitMiddleware } from './server/middleware/rateLimit.js';
import { timingMiddleware } from './server/middleware/timing.js';
import { logger } from './server/services/logger.js';
import { initDatabase } from './server/services/database.js';
import { staticMiddleware } from './server/middleware/static.js';
import { cleanExpired as cleanExpiredSessions } from './server/services/sessions.js';
import { enforceExpiredJobs, checkExpiryWarnings } from './server/services/jobs.js';
import { cleanExpiredOtps } from './server/services/auth.js';
import { cleanOldNotifications } from './server/services/notifications.js';
import { autoDetectNoShows } from './server/services/attendance.js';

const PORT = parseInt(process.env.PORT || '3002', 10);
const HOST = process.env.HOST || '0.0.0.0';

// ── Initialize Database Directories ──────────────────────────
await initDatabase();

// ── Run Schema Migrations ────────────────────────────────────
try {
  const { runMigrations } = await import('./server/services/migration.js');
  const migrationResult = await runMigrations();
  if (migrationResult.applied > 0) {
    logger.info(`Startup: applied ${migrationResult.applied} migration(s), schema now at v${migrationResult.current}`);
  }
} catch (err) {
  logger.warn('Startup: migration error', { error: err.message });
}

// ── Phase 50 — Audit Log Index Listener Registration ─────────
// Importing the module registers audit:logged/audit:deleted listeners.
// Optional rebuild is controlled by config.AUDIT_INDEX.rebuildOnStartup.
try {
  if (config.AUDIT_INDEX && config.AUDIT_INDEX.enabled) {
    const auditIdx = await import('./server/services/auditLogIndex.js');
    if (config.AUDIT_INDEX.rebuildOnStartup) {
      const result = await auditIdx.rebuildAuditIndex();
      logger.info('Startup: audit index rebuilt', result);
    } else {
      logger.info('Startup: audit index listeners registered');
    }
  }
} catch (err) {
  logger.warn('Startup: audit index init error', { error: err.message });
}

// ── Build Search Index (conditional — skip if recently built) ─
try {
  const searchIdx = await import('./server/services/searchIndex.js');
  const searchStats = searchIdx.getStats();
  const SKIP_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  if (searchStats.lastBuilt && (Date.now() - new Date(searchStats.lastBuilt).getTime()) < SKIP_THRESHOLD_MS) {
    logger.info('Startup: search index fresh — skipping rebuild');
  } else {
    await searchIdx.buildIndex();
    logger.info('Startup: search index built');
  }
} catch (err) {
  logger.warn('Startup: search index build error', { error: err.message });
}

// ── Build Query Index (conditional — skip if recently built) ─
try {
  const queryIdx = await import('./server/services/queryIndex.js');
  const queryStats = queryIdx.getStats();
  const SKIP_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  if (queryStats.lastBuilt && (Date.now() - new Date(queryStats.lastBuilt).getTime()) < SKIP_THRESHOLD_MS) {
    logger.info('Startup: query index fresh — skipping rebuild');
  } else {
    const qiCount = await queryIdx.buildAllIndexes();
    if (qiCount > 0) logger.info(`Startup: query index built (${qiCount} jobs)`);
  }
} catch (err) {
  logger.warn('Startup: query index build error', { error: err.message });
}

// ── Clean Stale .tmp Files (orphans from crashes) ────────────
try {
  const { cleanStaleTmpFiles } = await import('./server/services/database.js');
  const cleanedTmp = await cleanStaleTmpFiles();
  if (cleanedTmp > 0) logger.warn(`Startup: cleaned ${cleanedTmp} stale .tmp files`);
} catch (_) { /* non-fatal */ }

// ── Create Logs Directory ────────────────────────────────────
try {
  await mkdir(join('.', 'logs'), { recursive: true });
} catch (_) { /* logs dir creation failure is non-fatal */ }

// ── Startup Index Integrity Check (lightweight — warning only) ──
try {
  const { readJSON: readJSONCheck } = await import('./server/services/database.js');
  const { join: joinPath } = await import('node:path');
  const dataPath = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;

  const criticalIndexes = [
    { name: 'phone-index', path: config.DATABASE.indexFiles.phoneIndex },
    { name: 'jobs-index', path: config.DATABASE.indexFiles.jobsIndex },
  ];

  for (const idx of criticalIndexes) {
    const fullPath = joinPath(dataPath, idx.path);
    const data = await readJSONCheck(fullPath);
    if (!data) {
      logger.warn(`⚠️ Critical index missing: ${idx.name} (${idx.path}). Run: node scripts/repair-indexes.js`);
    }
  }
} catch (err) {
  logger.warn('Startup index check error', { error: err.message });
}

// ── Create Router ─────────────────────────────────────────────
const router = createRouter();

// ── Middleware Chain ───────────────────────────────────────────
function runMiddleware(middlewares, req, res, done) {
  let idx = 0;
  function next(err) {
    if (err) {
      logger.error('Middleware error', { error: err.message });
      if (!res.writableEnded) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' }));
      }
      return;
    }
    const mw = middlewares[idx++];
    if (!mw) return done();
    try {
      mw(req, res, next);
    } catch (e) {
      next(e);
    }
  }
  next();
}

const globalMiddleware = [
  timingMiddleware,
  corsMiddleware,
  securityMiddleware,
  requestIdMiddleware,
  rateLimitMiddleware,
  bodyParserMiddleware,
];

// ── HTTP Server ───────────────────────────────────────────────
const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  req.pathname = url.pathname;
  req.query = Object.fromEntries(url.searchParams);

  // Static file serving runs BEFORE the API middleware chain
  staticMiddleware(req, res, () => {
    runMiddleware(globalMiddleware, req, res, () => {
      router(req, res);
    });
  });
});

// ── Server Timeouts ───────────────────────────────────────────
server.requestTimeout = 30000;       // 30s max for entire request
server.headersTimeout = 10000;       // 10s max for headers
server.keepAliveTimeout = 65000;     // 65s keep-alive (> typical LB timeout of 60s)

// ── Startup Cleanup ───────────────────────────────────────────
try {
  const expiredSessions = await cleanExpiredSessions();
  if (expiredSessions > 0) logger.info(`Startup: cleaned ${expiredSessions} expired sessions`);
  const expiredJobs = await enforceExpiredJobs();
  if (expiredJobs > 0) logger.info(`Startup: enforced ${expiredJobs} expired jobs`);
  const expiredOtps = await cleanExpiredOtps();
  if (expiredOtps > 0) logger.info(`Startup: cleaned ${expiredOtps} expired OTPs`);
  const oldNotifs = await cleanOldNotifications();
  if (oldNotifs > 0) logger.info(`Startup: cleaned ${oldNotifs} old notifications`);
  const autoNoShows = await autoDetectNoShows();
  if (autoNoShows > 0) logger.info(`Startup: detected ${autoNoShows} auto no-shows`);
  const expiryWarnings = await checkExpiryWarnings();
  if (expiryWarnings > 0) logger.info(`Startup: sent ${expiryWarnings} expiry warning(s)`);
} catch (err) {
  logger.warn('Startup cleanup error', { error: err.message });
}

// ── Startup Index Health Check ────────────────────────────────
try {
  const { checkIndexHealth } = await import('./server/services/indexHealth.js');
  const healthResult = await checkIndexHealth();
  if (healthResult.warnings.length > 0) {
    logger.warn(`Startup: index health check found ${healthResult.warnings.length} warning(s). Run: node scripts/repair-indexes.js`);
  } else {
    logger.info('Startup: index health check passed');
  }
} catch (err) {
  logger.warn('Startup index health check error', { error: err.message });
}

// ── Periodic Cleanup (every 30 minutes) ───────────────────────
const CLEANUP_INTERVAL = 30 * 60 * 1000;
let cleanupCycleCount = 0;
const cleanupTimer = setInterval(async () => {
  try {
    await cleanExpiredSessions();
    await enforceExpiredJobs();
    await cleanExpiredOtps();
    await cleanOldNotifications();
    await autoDetectNoShows();

    // Phase 52 — Alert delivery history cleanup
    try {
      const { cleanupOldDeliveries } = await import('./server/services/alertDeliveryHistory.js');
      const cleanedDeliveries = await cleanupOldDeliveries();
      if (cleanedDeliveries > 0) logger.info(`Periodic: cleaned ${cleanedDeliveries} old alert delivery record(s)`);
    } catch (_) { /* non-fatal */ }

    // Expiry warnings (fire-and-forget)
    try {
      const { checkExpiryWarnings } = await import('./server/services/jobs.js');
      const warnings = await checkExpiryWarnings();
      if (warnings > 0) logger.info(`Periodic: sent ${warnings} expiry warning(s)`);
    } catch (_) { /* non-fatal */ }

    // Index health check every 12 cycles (= 6 hours)
    cleanupCycleCount++;

    // Search index + query index rebuild every 2 cycles (= every hour)
    if (cleanupCycleCount % 2 === 0) {
      try {
        const { buildIndex } = await import('./server/services/searchIndex.js');
        await buildIndex();
      } catch (_) { /* non-fatal */ }
      try {
        const { buildAllIndexes } = await import('./server/services/queryIndex.js');
        await buildAllIndexes();
      } catch (_) { /* non-fatal */ }
    }

    if (cleanupCycleCount % 12 === 0) {
      try {
        const { checkIndexHealth } = await import('./server/services/indexHealth.js');
        await checkIndexHealth();
      } catch (_) { /* non-fatal */ }

      // Monitoring snapshot cleanup (every 6 hours — same as index health)
      try {
        const { cleanOldSnapshots } = await import('./server/services/monitor.js');
        const cleanedSnapshots = await cleanOldSnapshots();
        if (cleanedSnapshots > 0) logger.info(`Periodic: cleaned ${cleanedSnapshots} old monitoring snapshot(s)`);
      } catch (_) { /* non-fatal */ }
    }
  } catch (err) {
    logger.warn('Periodic cleanup error', { error: err.message });
  }
}, CLEANUP_INTERVAL);
if (cleanupTimer.unref) cleanupTimer.unref();

// ── Phase 40 — Presence cleanup timer (every 60s) ─────────────
if (config.PRESENCE && config.PRESENCE.enabled) {
  const presenceTimer = setInterval(async () => {
    try {
      const { cleanupStale } = await import('./server/services/presenceService.js');
      cleanupStale();
    } catch (err) {
      logger.warn('Presence cleanup error', { error: err.message });
    }
  }, config.PRESENCE.cleanupIntervalMs);
  if (presenceTimer.unref) presenceTimer.unref();
}

// ── Phase 40 — Instant match cleanup timer (every 30s) ────────
if (config.INSTANT_MATCH && config.INSTANT_MATCH.enabled) {
  const instantMatchTimer = setInterval(async () => {
    try {
      const { cleanupExpired } = await import('./server/services/instantMatch.js');
      const count = await cleanupExpired();
      if (count > 0) logger.info(`Instant match: expired ${count} match(es)`);
    } catch (err) {
      logger.warn('Instant match cleanup error', { error: err.message });
    }
  }, config.INSTANT_MATCH.cleanupIntervalMs);
  if (instantMatchTimer.unref) instantMatchTimer.unref();
}

// ── Phase 41 — Availability ad expiration timer (every 5 min) ─
if (config.AVAILABILITY_ADS && config.AVAILABILITY_ADS.enabled) {
  const adExpirationTimer = setInterval(async () => {
    try {
      const { expireStaleAds } = await import('./server/services/availabilityAd.js');
      await expireStaleAds();
    } catch (err) {
      logger.warn('Ad expiration error', { error: err.message });
    }
  }, config.AVAILABILITY_ADS.expirationCheckIntervalMs || 5 * 60 * 1000);
  if (adExpirationTimer.unref) adExpirationTimer.unref();

  // Phase 41 — adMatcher dedup map cleanup timer (every 1 min)
  const adDedupCleanupTimer = setInterval(async () => {
    try {
      const { cleanupDedup } = await import('./server/services/adMatcher.js');
      cleanupDedup();
    } catch (err) {
      logger.warn('Ad dedup cleanup error', { error: err.message });
    }
  }, 60 * 1000);
  if (adDedupCleanupTimer.unref) adDedupCleanupTimer.unref();
}

// ── Phase 42 — Direct offer expiration timer (every 30s) ─────
if (config.DIRECT_OFFERS && config.DIRECT_OFFERS.enabled) {
  const directOfferTimer = setInterval(async () => {
    try {
      const { cleanupExpired } = await import('./server/services/directOffer.js');
      const count = await cleanupExpired();
      if (count > 0) logger.info(`Direct offers: expired ${count} offer(s)`);
    } catch (err) {
      logger.warn('Direct offer cleanup error', { error: err.message });
    }
  }, config.DIRECT_OFFERS.cleanupIntervalMs || 30 * 1000);
  if (directOfferTimer.unref) directOfferTimer.unref();
}

// ── Activity Summary Timer (separate — checks every hour if weekly digest is due) ──
if (config.ACTIVITY_SUMMARY && config.ACTIVITY_SUMMARY.enabled) {
  const summaryTimer = setInterval(async () => {
    try {
      const { sendWeeklySummaries } = await import('./server/services/activitySummary.js');
      const sent = await sendWeeklySummaries();
      if (sent > 0) logger.info(`Activity summary: sent ${sent} digest(s)`);
    } catch (err) {
      logger.warn('Activity summary error', { error: err.message });
    }
  }, config.ACTIVITY_SUMMARY.intervalCheckMs);
  if (summaryTimer.unref) summaryTimer.unref();
}

// ── Monitoring Snapshot Timer (separate — captures metrics every hour) ──
if (config.MONITORING && config.MONITORING.enabled) {
  const monitorTimer = setInterval(async () => {
    try {
      const { captureSnapshot, checkThresholds } = await import('./server/services/monitor.js');
      const snapshot = await captureSnapshot();
      const alerts = checkThresholds(snapshot);
      if (alerts.length > 0) {
        logger.warn('Monitoring threshold violation(s)', { count: alerts.length, alerts: alerts.slice(0, 3) });
      }
    } catch (err) {
      logger.warn('Monitoring snapshot error', { error: err.message });
    }
  }, config.MONITORING.snapshotIntervalMs);
  if (monitorTimer.unref) monitorTimer.unref();
}

// ── Phase 50 — Export Registry Cleanup Timer ────────────────
if (config.EXPORTS && config.EXPORTS.enabled) {
  const exportCleanupTimer = setInterval(async () => {
    try {
      const { cleanupExpiredExports } = await import('./server/services/exportRegistry.js');
      const cleaned = await cleanupExpiredExports();
      if (cleaned > 0) logger.info(`Exports: cleaned ${cleaned} expired export(s)`);
    } catch (err) {
      logger.warn('Export registry cleanup error', { error: err.message });
    }
  }, config.EXPORTS.cleanupIntervalMs || (60 * 60 * 1000));
  if (exportCleanupTimer.unref) exportCleanupTimer.unref();
}

// ── Backup Scheduler Timer (separate — checks hourly if backup is due) ──
if (config.BACKUP && config.BACKUP.enabled) {
  const backupTimer = setInterval(async () => {
    try {
      const { checkAndRunBackup } = await import('./server/services/backupScheduler.js');
      await checkAndRunBackup();
    } catch (err) {
      logger.warn('Backup scheduler error', { error: err.message });
    }
  }, 60 * 60 * 1000); // Check every hour
  if (backupTimer.unref) backupTimer.unref();
}

// ── Phase 47 — Snooze Reminders Scanner (admin operations excellence) ──
if (config.ADMIN_OPERATIONS && config.ADMIN_OPERATIONS.snoozeReminderEnabled) {
  try {
    const snoozeReminders = await import('./server/services/snoozeReminders.js');
    snoozeReminders.start();
  } catch (err) {
    logger.warn('Phase 47: snoozeReminders start failed', { error: err.message });
  }
}

// ── Phase 48 — Audit Log Retention Scanner ──
if (config.AUDIT_RETENTION && config.AUDIT_RETENTION.enabled) {
  try {
    const auditRetention = await import('./server/services/auditLogRetention.js');
    auditRetention.start();
  } catch (err) {
    logger.warn('Phase 48: auditLogRetention start failed', { error: err.message });
  }
}

// ── Phase 49 — Multi-Channel Admin Alerting ──
// Register alert listeners before scheduled detection starts so the first emitted
// threshold event can be delivered through webhook/email if enabled.
if (config.ADMIN_ALERT_CHANNELS && config.ADMIN_ALERT_CHANNELS.enabled) {
  try {
    const alertChannels = await import('./server/services/adminAlertChannels.js');
    alertChannels.registerListeners();
  } catch (err) {
    logger.warn('Phase 49: adminAlertChannels register failed', { error: err.message });
  }
}

// ── Phase 52 — Persistent Ops Queue Workers ────────────────
if (config.OPS_QUEUE && config.OPS_QUEUE.enabled && config.OPS_QUEUE.workerEnabled) {
  try {
    const queueWorkers = await import('./server/services/queueWorkers.js');
    queueWorkers.startQueueWorkers();
  } catch (err) {
    logger.warn('Phase 52: queueWorkers start failed', { error: err.message });
  }
}

// ── Phase 49 — Scheduled Abuse Detection Scanner ──
if (config.TRUST_ANALYTICS && config.TRUST_ANALYTICS.scheduledDetectionEnabled) {
  try {
    const scheduledDetection = await import('./server/services/scheduledAbuseDetection.js');
    scheduledDetection.start();
  } catch (err) {
    logger.warn('Phase 49: scheduledAbuseDetection start failed', { error: err.message });
  }
}

// ── Phase 51 — Scheduled Predictive Abuse Intelligence Scanner ──
if (config.PREDICTIVE_ABUSE && config.PREDICTIVE_ABUSE.enabled && config.PREDICTIVE_ABUSE.scheduledScanEnabled) {
  const predictiveScanTimer = setInterval(async () => {
    try {
      if (config.OPS_QUEUE && config.OPS_QUEUE.enabled) {
        const { enqueueJob } = await import('./server/services/opsQueue.js');
        const bucket = new Date().toISOString().slice(0, 16); // minute bucket
        const enqueueResult = await enqueueJob({
          type: 'predictive_scan',
          priority: 'normal',
          payload: { force: true, persist: true },
          idempotencyKey: `predictive_scan:scheduled:${bucket}`,
          createdBy: 'scheduler',
        });
        if (enqueueResult.ok && !enqueueResult.deduped) {
          logger.info('Phase 52: predictive abuse scan queued', { queueJobId: enqueueResult.job.id });
        }
      } else {
        const predictive = await import('./server/services/predictiveAbuse.js');
        const result = await predictive.runPredictiveScan({ persist: true });
        if (result && result.signalCount > 0) {
          logger.warn('Phase 51: predictive abuse scan detected signal(s)', {
            signalCount: result.signalCount,
            created: result.created || 0,
            updated: result.updated || 0,
          });
        }
      }
    } catch (err) {
      logger.warn('Phase 51/52: predictive abuse scan scheduling failed', {
        error: err && err.message ? err.message : String(err),
      });
    }
  }, config.PREDICTIVE_ABUSE.scanIntervalMs || (15 * 60 * 1000));
  if (predictiveScanTimer.unref) predictiveScanTimer.unref();

  logger.info('Phase 51: predictive abuse scanner scheduled', {
    intervalMs: config.PREDICTIVE_ABUSE.scanIntervalMs || (15 * 60 * 1000),
  });
}

// ── Phase 45 — Counter File Startup Integrity Check + Scheduled Rebuild ──
if (config.COUNTERS && config.COUNTERS.enabled) {
  // Startup integrity check (fire-and-forget — non-blocking)
  (async () => {
    try {
      const counters = await import('./server/services/directOfferCounters.js');
      const c = await counters.readCounters();
      const lastUpdateMs = c.lastUpdatedAt ? new Date(c.lastUpdatedAt).getTime() : 0;
      const totalOffers = c.platform?.total || 0;
      const maxAge = config.COUNTERS.startupRebuildMaxAgeMs || (24 * 60 * 60 * 1000);

      // Trigger rebuild if file is stale AND offers exist (empty system = healthy)
      if (totalOffers > 0 && lastUpdateMs > 0) {
        const ageMs = Date.now() - lastUpdateMs;
        if (ageMs > maxAge) {
          logger.warn('Startup: counter file stale — triggering rebuild', { ageHours: Math.round(ageMs / 3600000) });
          counters.rebuildCounters().catch(err => {
            logger.error('Startup rebuild failed', { error: err.message });
          });
        }
      } else if (totalOffers === 0 && lastUpdateMs === 0) {
        logger.info('Startup: counter file empty — no rebuild needed');
      }
    } catch (err) {
      // Counter file corrupt or missing — trigger rebuild
      logger.warn('Startup: counter file integrity check failed — triggering rebuild', { error: err.message });
      try {
        const counters = await import('./server/services/directOfferCounters.js');
        counters.rebuildCounters().catch(() => {});
      } catch (_) { /* non-fatal */ }
    }
  })();

  // Scheduled rebuild every 24h (defense in depth against drift)
  const rebuildIntervalMs = config.COUNTERS.rebuildIntervalMs || (24 * 60 * 60 * 1000);
  const counterRebuildTimer = setInterval(async () => {
    try {
      const counters = await import('./server/services/directOfferCounters.js');
      const result = await counters.rebuildCounters();
      if (!result.skipped) {
        logger.info('Counters: scheduled rebuild complete', result);
      }
    } catch (err) {
      logger.error('Counters: scheduled rebuild failed', { error: err.message });
    }
  }, rebuildIntervalMs);
  if (counterRebuildTimer.unref) counterRebuildTimer.unref();
}

// ── Start ─────────────────────────────────────────────────────
server.listen(PORT, HOST, () => {
  logger.info(`🟢 يوميّة — ${config.BRAND.tagline}`);
  logger.info(`   Server: http://${HOST}:${PORT}`);
  logger.info(`   Health: http://localhost:${PORT}/api/health`);
  logger.info(`   Config: http://localhost:${PORT}/api/config`);
});

// ── Graceful shutdown ─────────────────────────────────────────
async function gracefulShutdown(signal) {
  logger.info(`🔴 ${signal} received — shutting down gracefully...`);

  // 1. Stop accepting new connections
  server.close(() => {});

  // 2. Phase 52: Stop queue workers and drain active jobs briefly.
  try {
    const queueWorkers = await import('./server/services/queueWorkers.js');
    await queueWorkers.stopQueueWorkers({ drainMs: 5000 });
  } catch (err) {
    logger.warn('Phase 52: queueWorkers stop failed during shutdown', { error: err && err.message ? err.message : String(err) });
  }

  // 3. Phase 46: Flush counter batch + cache debouncer BEFORE SSE broadcast.
  //    Prevents data loss for events still in in-memory queues.
  try {
    const counters = await import('./server/services/directOfferCounters.js');
    await counters.forceFlush();
  } catch (err) {
    logger.warn('Phase 46: forceFlush failed during shutdown', { error: err && err.message ? err.message : String(err) });
  }

  try {
    const debouncer = await import('./server/services/cacheDebouncer.js');
    debouncer.flushPending();
  } catch (err) {
    logger.warn('Phase 46: flushPending failed during shutdown', { error: err && err.message ? err.message : String(err) });
  }

  // 3. Broadcast SSE shutdown event (fire-and-forget)
  try {
    const { broadcast } = await import('./server/services/sseManager.js');
    broadcast('shutdown', { reason: 'server_restart', message: 'السيرفر هيعيد التشغيل — هتتوصل تاني تلقائياً' });
  } catch (_) { /* SSE broadcast failure is non-fatal */ }

  // 4. Wait 1 second for pending writes to complete
  setTimeout(() => {
    logger.info('🔴 Shutdown complete');
    process.exit(0);
  }, 1000);

  // 5. Force exit after 10 seconds as safety net
  setTimeout(() => {
    logger.warn('🔴 Forced shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// ── Export for testing ────────────────────────────────────────
export { server, PORT, HOST };
