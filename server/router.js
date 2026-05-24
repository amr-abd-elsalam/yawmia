// ═══════════════════════════════════════════════════════════════
// server/router.js — Central Route Registry
// ═══════════════════════════════════════════════════════════════

import config from '../config.js';
import { isValidId } from './services/database.js';
import { requireAuth, requireRole, requireAdmin, requireCapability } from './middleware/auth.js';
import { handleSendOtp, handleVerifyOtp, handleGetMe, handleUpdateProfile, handleLogout, handleLogoutAll, handleAcceptTerms, handleDeleteAccount } from './handlers/authHandler.js';
import { handleCreateJob, handleListJobs, handleGetJob, handleStartJob, handleCompleteJob, handleCancelJob, handleListMyJobs, handleNearbyJobs, handleRenewJob, handleDuplicateJob } from './handlers/jobsHandler.js';
import { handleApplyToJob, handleAcceptWorker, handleRejectWorker, handleListJobApplications, handleListMyApplications, handleWithdrawApplication, handleWorkerConfirm, handleWorkerDecline } from './handlers/applicationsHandler.js';
import {
  handleAdminStats,
  handleAdminUsers,
  handleAdminJobs,
  handleAdminUpdateUserStatus,
  handleAdminDirectOffersDashboard,
  handleAdminDirectOffersFunnel,
  handleAdminDeclineReasons,
  handleAdminAbuseSignals,
  handleAdminFlagReviewHistory,
  handleAdminFlagReview,
  handleSendAbuseWarning,
  // Phase 47 — Admin Operations Excellence
  handleAdminListFlagsByStatus,
  handleAdminSearchFlagsByNotes,
  handleAdminBulkFlagAction,
  handleAdminSnoozeExpiring,
  handleAdminUserWarningsRemaining,
  handleAdminAuditLogSearch,
  handleAdminAuditLogExport,
  // Phase 49 — Marketplace Trust Analytics + Admin Alerting
  handleAdminTrustResolutionTime,
  handleAdminTrustWarningConversion,
  handleAdminTrustPerAdmin,
  handleAdminTrustAbuseTrend,
  handleAdminTrustDashboard,
  handleAdminTestWebhook,
  // Phase 50 — Scale & Search Hygiene
  handleAdminAuditIndexStatus,
  handleAdminAuditIndexRebuild,
  handleAdminAuditIndexVerify,
  handleAdminListExports,
  handleAdminGetExport,
  handleAdminDownloadExport,
  handleAdminCancelExport,
  handleAdminCounterHygiene,
  handleAdminCompactCounters,
  handleAdminRebuildCounters,
  // Phase 51 — Predictive Trust Intelligence
  handleAdminPredictiveAbuseDashboard,
  handleAdminPredictiveAbuseSignals,
  handleAdminRunPredictiveAbuseScan,
  handleAdminDismissPredictiveSignal,
  handleAdminEscalatePredictiveSignal,
  handleAdminUserTrustV2,
  handleAdminTrustDecisionQuality,
  handleAdminTrustBacklogPriority,
} from './handlers/adminHandler.js';
import { handleAdminEventStream } from './handlers/adminSseHandler.js';
import {
  handleAdminTrustCalibrationDashboard,
  handleAdminTrustSnapshots,
  handleAdminRunTrustSnapshotBatch,
  handleAdminRunTrustCalibrationReport,
  handleAdminPredictivePrecision,
  handleAdminRunPredictiveSignalRetention,
  handleAdminMarkPredictiveFalsePositive,
  handleAdminMarkPredictiveConfirmed,
} from './handlers/trustCalibrationHandler.js';
import {
  handleAdminQueueStats,
  handleAdminQueueJobs,
  handleAdminQueueJobDetail,
  handleAdminRetryQueueJob,
  handleAdminCancelQueueJob,
  handleAdminDeadLetterJobs,
  handleAdminRetryDeadLetterJob,
  handleAdminAlertDeliveries,
  handleAdminAlertDeliveryDetail,
  handleAdminRetryAlertDelivery,
  handleAdminAlertDeliveryHealth,
  handleAdminCreateAuditExportJob,
} from './handlers/queueHandler.js';
import {
  handleProductionReadiness,
  handleDeploymentGate,
  handleSchedulerCadence,
  handleOpsReview,
  handleInstanceMode,
  handleProcessLocks,
  handleReleaseProcessLock,
  handleListSchedulers,
  handleGetScheduler,
  handleRunSchedulerNow,
  handleEnableScheduler,
  handleDisableScheduler,
  handleOpsRollups,
  handleOpsSlo,
  handleListIncidents,
  handleGetIncident,
  handleResolveIncident,
  handleRunBackupRestoreDrill,
  handleListBackupRestoreDrills,
  handleGetBackupRestoreDrill,
  handleGetMaintenanceMode,
  handleEnableMaintenanceMode,
  handleDisableMaintenanceMode,
} from './handlers/productionOpsHandler.js';
import {
  handleScaleHygieneOverview,
  handleQueueHealth,
  handleQueueVerify,
  handleQueueCompact,
  handleQueueRepair,
  handleWorkroomHygieneOverview,
  handleWorkroomCompact,
  handleWorkroomVerifyIndexes,
  handleWorkroomCleanupAttachments,
  handleTrustRollups,
  handleRunTrustRollup,
  handlePredictiveArchiveIndexStatus,
  handleRebuildPredictiveArchiveIndex,
  handleSchedulerHistory,
} from './handlers/scaleHygieneHandler.js';
import {
  handleGetStoragePressure,
  handleCaptureStoragePressure,
  handleListStoragePressureSnapshots,
  handleGetScaleThresholds,
  handleVerifyScaleThresholds,
  handleExternalizationReadiness,
  handleMultiInstanceBoundary,
} from './handlers/storagePressureHandler.js';
import {
  handleGetExternalizationDecision,
  handleCaptureExternalizationDecision,
  handleListExternalizationDecisionSnapshots,
  handleValidateMigrationSnapshot,
  handleRunMigrationRehearsal,
  handleBenchmarkHistory,
} from './handlers/externalizationDecisionHandler.js';
import {
  handleMarketplaceIntelligenceDashboard,
  handleSearchAnalytics,
  handleZeroResultSearches,
  handleActivationFunnel,
  handleNotificationConversions,
  handleWorkroomAdoption,
  handlePaymentDisputeAnalytics,
  handleMatchingQuality,
  handleRunMarketplaceIntelligenceRollup,
} from './handlers/marketplaceIntelligenceHandler.js';
import {
  handleAdminRbacMatrix,
  handleAdminRbacMe,
  handleListApprovals,
  handleCreateApproval,
  handleApproveApproval,
  handleRejectApproval,
  handleListPrivacyRequests,
  handleCreatePrivacyRequest,
  handleGetPrivacyRequest,
  handleQueuePrivacyExport,
  handleQueuePrivacyAnonymize,
  handlePreviewPrivacyAnonymize,
  handleCancelPrivacyRequest,
  handleListOpsReviews,
  handleCreateOpsReview,
  handleGetOpsReview,
  handleCompleteOpsReview,
  handleGetIncidentPostmortem,
  handleCreateIncidentPostmortem,
  handleUpdatePostmortem,
  handleListPostmortems,
} from './handlers/governanceHandler.js';
import { handleListNotifications, handleMarkAsRead, handleMarkAllAsRead, handleNotificationActionClick } from './handlers/notificationsHandler.js';
import { handleSubmitRating, handleListJobRatings, handleListUserRatings, handleUserRatingSummary, handleGetPendingRatings } from './handlers/ratingsHandler.js';
import { handleCreatePayment, handleConfirmPayment, handleAdminCompletePayment, handleDisputePayment, handleGetJobPayment, handleAdminFinancialSummary } from './handlers/paymentsHandler.js';
import { handleCreateReport, handleAdminListReports, handleAdminReviewReport, handleGetTrustScore, handleGetTrustScoreV2 } from './handlers/reportsHandler.js';
import { handleSubmitVerification, handleGetVerificationStatus, handleGetPublicProfile, handleAdminListVerifications, handleAdminReviewVerification } from './handlers/verificationHandler.js';
import { handleNotificationStream } from './handlers/sseHandler.js';
import { handleGetProfileTasks, handleProfileTaskClick } from './handlers/profileTasksHandler.js';
import { handleCheckIn, handleCheckOut, handleConfirmAttendance, handleReportNoShow, handleEmployerCheckIn, handleListJobAttendance, handleJobAttendanceSummary } from './handlers/attendanceHandler.js';
import { handleSendMessage, handleBroadcastMessage, handleListJobMessages, handleGetUnreadCount, handleMarkMessageRead, handleMarkAllJobMessagesRead } from './handlers/messagesHandler.js';
import { handlePushSubscribe, handlePushUnsubscribe } from './handlers/pushHandler.js';
import { handleCreateAlert, handleListMyAlerts, handleDeleteAlert, handleToggleAlert } from './handlers/alertsHandler.js';
import { handleAddFavorite, handleRemoveFavorite, handleListFavorites, handleCheckFavorite } from './handlers/favoritesHandler.js';
import { handleEmployerAnalytics, handleWorkerAnalytics, handlePlatformAnalytics, handleExportPayments, handleExportJobs, handleExportUsers, handleEmployerExportPayments, handleGetReceipt, handleGetMonitoring, handleGetLatestSnapshot, handleGetErrors } from './handlers/analyticsHandler.js';
import { handleGetImage } from './handlers/imageHandler.js';
import { handleHeartbeat, handleOnlineCount } from './handlers/presenceHandler.js';
import { handleCreateWindow, handleListWindows, handleDeleteWindow } from './handlers/availabilityHandler.js';
import { handleLiveFeedStream, handleInstantAccept } from './handlers/liveFeedHandler.js';
import { handleCreateAd, handleListMyAds, handleWithdrawAd, handleGetAd, handleAdStats } from './handlers/availabilityAdHandler.js';
import { handleDiscoverWorkers, handleGetWorkerCard, handleQuickOffer } from './handlers/workerDiscoveryHandler.js';
import {
  handleListWorkrooms,
  handleGetWorkroom,
  handleListWorkroomMessages,
  handleSendWorkroomMessage,
  handleMarkWorkroomRead,
  handleGetWorkroomTimeline,
  handleSearchWorkroomMessages,
  handleGetWorkroomReadReceipts,
  handleMarkWorkroomMessageRead,
  handleListWorkroomPins,
  handlePinWorkroomMessage,
  handleUnpinWorkroomMessage,
  handleGetWorkroomChecklist,
  handleCreateWorkroomChecklistItem,
  handleUpdateWorkroomChecklistItem,
  handleDeleteWorkroomChecklistItem,
  handleUploadWorkroomAttachment,
  handleGetWorkroomSummary,
} from './handlers/workroomHandler.js';
import { handleCreateOffer, handleAcceptOffer, handleDeclineOffer, handleWithdrawOffer, handleListMyOffers, handleGetOffer, handleEmployerOfferStats, handleWorkerOfferStats } from './handlers/directOfferHandler.js';
import { setupNotificationListeners } from './services/notifications.js';
import { logger } from './services/logger.js';
import { listActions } from './services/auditLog.js';
import { eventBus } from './services/eventBus.js';
import { clearAnalyticsCache } from './services/analytics.js';
import { clearCache as clearDirectOfferAnalyticsCache } from './services/directOfferAnalytics.js';
import * as directOfferCounters from './services/directOfferCounters.js';
import { debouncedClear } from './services/cacheDebouncer.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Route definition format:
 * { method, path, middlewares: [...], handler }
 *
 * Path supports :param patterns (e.g., /api/jobs/:id)
 */
const routes = [
  // ── Public Routes ──
  {
    method: 'GET', path: '/api/health', middlewares: [],
    handler: async (req, res) => {
      const mem = process.memoryUsage();
      const response = {
        status: 'ok',
        brand: config.BRAND.name,
        version: '0.56.0',
        environment: config.ENV ? config.ENV.current : 'development',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        memory: {
          heapUsedMB: +(mem.heapUsed / 1048576).toFixed(1),
          heapTotalMB: +(mem.heapTotal / 1048576).toFixed(1),
          rssMB: +(mem.rss / 1048576).toFixed(1),
        },
        node: process.version,
      };
      // SSE connection stats (non-blocking)
      try {
        const { getStats } = await import('./services/sseManager.js');
        const sseStats = getStats();
        response.connections = { sse: sseStats.totalConnections, sseUsers: sseStats.totalUsers };
      } catch (_) {
        response.connections = { sse: 0, sseUsers: 0 };
      }
      // Active lock count (non-blocking)
      try {
        const { getLockCount } = await import('./services/resourceLock.js');
        response.locks = { active: getLockCount() };
      } catch (_) {
        response.locks = { active: 0 };
      }
      // Cache stats (non-blocking)
      try {
        const { stats: cacheStats } = await import('./services/cache.js');
        response.cache = cacheStats();
      } catch (_) {
        response.cache = { hits: 0, misses: 0, size: 0, hitRate: '0%' };
      }
      // Request metrics (non-blocking)
      try {
        const { getMetrics } = await import('./middleware/timing.js');
        response.requestMetrics = getMetrics();
      } catch (_) {
        response.requestMetrics = { count: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, errorRate: '0%' };
      }
      // Index health (non-blocking)
      try {
        const { getHealthStatus } = await import('./services/indexHealth.js');
        response.indexHealth = getHealthStatus();
      } catch (_) {
        response.indexHealth = { lastCheck: null, status: 'unknown', warnings: 0 };
      }
      // Search index stats (non-blocking)
      try {
        const { getStats: searchIndexStats } = await import('./services/searchIndex.js');
        response.searchIndex = searchIndexStats();
      } catch (_) {
        response.searchIndex = { size: 0, lastBuilt: null };
      }
      // Phase 50 — Audit index stats (non-blocking)
      try {
        const { getAuditIndexStats } = await import('./services/auditLogIndex.js');
        response.auditIndex = await getAuditIndexStats();
      } catch (_) {
        response.auditIndex = { enabled: false, status: 'unknown', recordCount: 0, lastBuiltAt: null, stale: false };
      }
      // Phase 40 — Presence stats (non-blocking)
      try {
        const { getStats: presenceStats } = await import('./services/presenceService.js');
        response.presence = presenceStats();
      } catch (_) {
        response.presence = { online: 0, away: 0, offline: 0, total: 0 };
      }
      // Phase 40 — Instant match stats (non-blocking)
      try {
        const { getStats: instantMatchStats } = await import('./services/instantMatch.js');
        response.instantMatch = await instantMatchStats();
      } catch (_) {
        response.instantMatch = { activeAttempts: 0, successRateLastHour: 0 };
      }
      // Phase 40 — Live feed stats (non-blocking)
      try {
        const { getStats: liveFeedStats } = await import('./services/liveFeed.js');
        response.liveFeed = liveFeedStats();
      } catch (_) {
        response.liveFeed = { connections: 0, users: 0 };
      }
      // Phase 41 — Availability ads stats (non-blocking)
      try {
        const { getStats: adStats } = await import('./services/availabilityAd.js');
        response.availabilityAds = await adStats();
      } catch (_) {
        response.availabilityAds = { active: 0, totalToday: 0, expiredLastHour: 0, withdrawnLastHour: 0 };
      }
      // Phase 41 — Worker discovery stats (non-blocking)
      try {
        const { getStats: discoveryStats } = await import('./services/workerDiscovery.js');
        response.workerDiscovery = discoveryStats();
      } catch (_) {
        response.workerDiscovery = { tilesCached: 0, totalCachedItems: 0, cardsCached: 0 };
      }
      // Phase 42 — Direct offers stats (non-blocking)
      try {
        const { getStats: offerStats } = await import('./services/directOffer.js');
        response.directOffers = await offerStats();
      } catch (_) {
        response.directOffers = { activePending: 0, expiredLastHour: 0, acceptedLastHour: 0, declinedLastHour: 0 };
      }
      // Phase 50 — Export registry stats (non-blocking)
      try {
        const { getStats: exportStats } = await import('./services/exportRegistry.js');
        response.exports = exportStats();
      } catch (_) {
        response.exports = { enabled: false };
      }

      // Phase 52 — Ops queue stats (non-blocking)
      try {
        const { getQueueStats } = await import('./services/opsQueue.js');
        response.opsQueue = await getQueueStats();
      } catch (_) {
        response.opsQueue = { enabled: false, status: 'unknown' };
      }

      // Phase 52 — Alert delivery stats (non-blocking)
      try {
        const { getAlertDeliveryStats } = await import('./services/alertDeliveryHistory.js');
        response.alertDeliveries = await getAlertDeliveryStats();
      } catch (_) {
        response.alertDeliveries = { enabled: false, status: 'unknown' };
      }

      // Phase 54 — Instance mode visibility (non-blocking)
      try {
        const { getInstanceInfo } = await import('./services/instanceMode.js');
        response.instanceMode = getInstanceInfo();
      } catch (_) {
        response.instanceMode = { enabled: false, mode: 'unknown', warnings: [] };
      }

      // Phase 54 — Process locks visibility (non-blocking)
      try {
        const { listProcessLocks } = await import('./services/processLock.js');
        const locks = await listProcessLocks();
        response.processLocks = {
          total: locks.length,
          stale: locks.filter(l => l.stale).length,
          locks: locks.slice(0, 5).map(l => ({
            lockName: l.lockName,
            ownerId: l.ownerId,
            stale: !!l.stale,
            heartbeatAt: l.heartbeatAt || null,
            expiresAt: l.expiresAt || null,
          })),
        };
      } catch (_) {
        response.processLocks = { total: 0, stale: 0, locks: [] };
      }

      // Phase 54 — Scheduler registry visibility (non-blocking)
      try {
        const { listSchedulerJobs } = await import('./services/schedulerRegistry.js');
        const schedulers = await listSchedulerJobs();
        const staleMs = (config.OPS_METRICS_ROLLUPS && config.OPS_METRICS_ROLLUPS.slo && config.OPS_METRICS_ROLLUPS.slo.schedulerStaleWarningMs) || (2 * 60 * 60 * 1000);
        response.schedulers = {
          total: schedulers.length,
          enabled: schedulers.filter(s => s.enabled).length,
          failed: schedulers.filter(s => s.lastStatus === 'failed').length,
          stale: schedulers.filter(s => s.enabled && s.nextRunAt && (Date.now() - new Date(s.nextRunAt).getTime()) > staleMs).length,
        };
      } catch (_) {
        response.schedulers = { total: 0, enabled: 0, failed: 0, stale: 0 };
      }

      // Phase 54 — Latest ops rollup + SLO (non-blocking)
      try {
        const { computeOpsSlo } = await import('./services/metricsRollups.js');
        response.opsSlo = await computeOpsSlo();
      } catch (_) {
        response.opsSlo = { status: 'unknown', violations: [] };
      }

      // Phase 54 — Latest backup restore drill (non-blocking)
      try {
        const { listRestoreDrills } = await import('./services/backupRestoreDrill.js');
        const drills = await listRestoreDrills({ limit: 1 });
        response.backupRestoreDrill = {
          latest: drills.drills && drills.drills.length > 0 ? {
            id: drills.drills[0].id,
            status: drills.drills[0].status,
            completedAt: drills.drills[0].completedAt || null,
            durationMs: drills.drills[0].durationMs || 0,
            errorCount: Array.isArray(drills.drills[0].errors) ? drills.drills[0].errors.length : 0,
          } : null,
        };
      } catch (_) {
        response.backupRestoreDrill = { latest: null };
      }

      // Phase 51 — Predictive abuse stats (non-blocking)
      try {
        const { getPredictiveStats } = await import('./services/predictiveAbuse.js');
        response.predictiveAbuse = await getPredictiveStats();
      } catch (_) {
        response.predictiveAbuse = { enabled: false, totalSignals: 0, activeSignals: 0 };
      }

      // Phase 51 — Workroom stats (non-blocking)
      try {
        const { getWorkroomStats } = await import('./services/workroom.js');
        response.workrooms = await getWorkroomStats();
      } catch (_) {
        response.workrooms = { enabled: false, totalWorkrooms: 0 };
      }

      // Phase 51 — Trust Score V2 config visibility (non-blocking)
      response.trustScoreV2 = {
        enabled: !!(config.TRUST_SCORE_V2 && config.TRUST_SCORE_V2.enabled),
      };

      // Phase 45 — Counter file integrity + Phase 46 — File size monitoring (non-blocking)
      try {
        const counters = await directOfferCounters.readCounters();
        const now = Date.now();
        const lastUpdateMs = counters.lastUpdatedAt ? new Date(counters.lastUpdatedAt).getTime() : 0;
        const ageMs = lastUpdateMs > 0 ? (now - lastUpdateMs) : null;
        const totalOffers = counters.platform?.total || 0;
        const maxAge = (config.COUNTERS && config.COUNTERS.startupRebuildMaxAgeMs) || (24 * 60 * 60 * 1000);
        let status = 'healthy';
        if (totalOffers === 0 && lastUpdateMs === 0) {
          status = 'empty';
        } else if (ageMs !== null && ageMs > maxAge) {
          status = 'stale';
        }

        // Phase 46: counter file size visibility
        let fileSizeBytes = 0;
        try {
          fileSizeBytes = await directOfferCounters.getFileSize();
        } catch (_) { /* non-fatal */ }

        response.counters = {
          lastUpdatedAt: counters.lastUpdatedAt,
          lastRebuildAt: counters.lastRebuildAt,
          totalOffers,
          hourlyBucketsCount: Object.keys(counters.hourlyBuckets || {}).length,
          fileSizeBytes, // Phase 46
          status,
        };
      } catch (_) {
        response.counters = { lastUpdatedAt: null, lastRebuildAt: null, totalOffers: 0, hourlyBucketsCount: 0, fileSizeBytes: 0, status: 'corrupt' };
      }
      sendJSON(res, 200, response);
    },
  },
  {
    method: 'GET', path: '/api/config', middlewares: [],
    handler: (req, res) => {
      sendJSON(res, 200, {
        BRAND: config.BRAND,
        META: config.META,
        LABOR_CATEGORIES: config.LABOR_CATEGORIES,
        REGIONS: config.REGIONS,
        RATINGS: config.RATINGS,
        FINANCIALS: {
          platformFeePercent: config.FINANCIALS.platformFeePercent,
          minDailyWage: config.FINANCIALS.minDailyWage,
          maxDailyWage: config.FINANCIALS.maxDailyWage,
          compensationEnabled: config.FINANCIALS.compensationEnabled,
          paymentMethods: config.FINANCIALS.paymentMethods,
        },
        WEB_PUSH: {
          vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null,
        },
      });
    },
  },
  {
    method: 'GET', path: '/api/docs', middlewares: [],
    handler: (req, res) => {
      const docs = routes.map(r => ({
        method: r.method,
        path: r.path,
        auth: r.middlewares.some(m => m === requireAuth) ? 'required' : 'none',
        admin: r.middlewares.some(m => m === requireAdmin) ? true : false,
      }));
      sendJSON(res, 200, { ok: true, routes: docs, total: docs.length, version: '0.56.0' });
    },
  },

  // ── Auth Routes (Public) ──
  { method: 'POST', path: '/api/auth/send-otp', middlewares: [], handler: handleSendOtp },
  { method: 'POST', path: '/api/auth/verify-otp', middlewares: [], handler: handleVerifyOtp },

  // ── Auth Routes (Protected) ──
  { method: 'GET', path: '/api/auth/me', middlewares: [requireAuth], handler: handleGetMe },
  { method: 'PUT', path: '/api/auth/profile', middlewares: [requireAuth], handler: handleUpdateProfile },
  { method: 'GET', path: '/api/profile/tasks', middlewares: [requireAuth], handler: handleGetProfileTasks },
  { method: 'POST', path: '/api/profile/tasks/:id/click', middlewares: [requireAuth], handler: handleProfileTaskClick },
  { method: 'POST', path: '/api/auth/logout', middlewares: [requireAuth], handler: handleLogout },
  { method: 'POST', path: '/api/auth/logout-all', middlewares: [requireAuth], handler: handleLogoutAll },
  { method: 'POST', path: '/api/auth/accept-terms', middlewares: [requireAuth], handler: handleAcceptTerms },
  { method: 'DELETE', path: '/api/auth/account', middlewares: [requireAuth], handler: handleDeleteAccount },
  { method: 'POST', path: '/api/auth/verify-identity', middlewares: [requireAuth], handler: handleSubmitVerification },
  { method: 'GET', path: '/api/auth/verification-status', middlewares: [requireAuth], handler: handleGetVerificationStatus },

  // ── Analytics Routes ──
  { method: 'GET', path: '/api/analytics/employer', middlewares: [requireAuth, requireRole('employer')], handler: handleEmployerAnalytics },
  { method: 'GET', path: '/api/analytics/worker', middlewares: [requireAuth, requireRole('worker')], handler: handleWorkerAnalytics },

  // ── Employer Export Routes ──
  { method: 'GET', path: '/api/employer/export/payments', middlewares: [requireAuth, requireRole('employer')], handler: handleEmployerExportPayments },

  // ── Job Routes ──
  { method: 'POST', path: '/api/jobs', middlewares: [requireAuth, requireRole('employer')], handler: handleCreateJob },
  { method: 'GET', path: '/api/jobs', middlewares: [], handler: handleListJobs },
  { method: 'GET', path: '/api/jobs/mine', middlewares: [requireAuth, requireRole('employer')], handler: handleListMyJobs },
  { method: 'GET', path: '/api/jobs/nearby', middlewares: [requireAuth, requireRole('worker')], handler: handleNearbyJobs },
  { method: 'GET', path: '/api/jobs/live-feed', middlewares: [], handler: handleLiveFeedStream },
  { method: 'GET', path: '/api/jobs/:id', middlewares: [], handler: handleGetJob },
  { method: 'GET', path: '/api/jobs/:id/applications', middlewares: [requireAuth, requireRole('employer')], handler: handleListJobApplications },
  { method: 'POST', path: '/api/jobs/:id/apply', middlewares: [requireAuth, requireRole('worker')], handler: handleApplyToJob },
  { method: 'POST', path: '/api/jobs/:id/accept', middlewares: [requireAuth, requireRole('employer')], handler: handleAcceptWorker },
  { method: 'POST', path: '/api/jobs/:id/reject', middlewares: [requireAuth, requireRole('employer')], handler: handleRejectWorker },
  { method: 'POST', path: '/api/jobs/:id/start', middlewares: [requireAuth, requireRole('employer')], handler: handleStartJob },
  { method: 'POST', path: '/api/jobs/:id/complete', middlewares: [requireAuth, requireRole('employer')], handler: handleCompleteJob },
  { method: 'POST', path: '/api/jobs/:id/cancel', middlewares: [requireAuth, requireRole('employer')], handler: handleCancelJob },
  { method: 'POST', path: '/api/jobs/:id/renew', middlewares: [requireAuth, requireRole('employer')], handler: handleRenewJob },
  { method: 'POST', path: '/api/jobs/:id/duplicate', middlewares: [requireAuth, requireRole('employer')], handler: handleDuplicateJob },

  // ── Messaging Routes ──
  { method: 'POST', path: '/api/jobs/:id/messages/broadcast', middlewares: [requireAuth, requireRole('employer')], handler: handleBroadcastMessage },
  { method: 'POST', path: '/api/jobs/:id/messages/read-all', middlewares: [requireAuth], handler: handleMarkAllJobMessagesRead },
  { method: 'GET', path: '/api/jobs/:id/messages', middlewares: [requireAuth], handler: handleListJobMessages },
  { method: 'POST', path: '/api/jobs/:id/messages', middlewares: [requireAuth], handler: handleSendMessage },

  // ── Attendance Routes ──
  { method: 'POST', path: '/api/jobs/:id/checkin', middlewares: [requireAuth, requireRole('worker')], handler: handleCheckIn },
  { method: 'POST', path: '/api/jobs/:id/checkout', middlewares: [requireAuth, requireRole('worker')], handler: handleCheckOut },
  { method: 'POST', path: '/api/jobs/:id/no-show', middlewares: [requireAuth, requireRole('employer')], handler: handleReportNoShow },
  { method: 'POST', path: '/api/jobs/:id/manual-checkin', middlewares: [requireAuth, requireRole('employer')], handler: handleEmployerCheckIn },
  { method: 'GET', path: '/api/jobs/:id/attendance/summary', middlewares: [requireAuth], handler: handleJobAttendanceSummary },
  { method: 'GET', path: '/api/jobs/:id/attendance', middlewares: [requireAuth], handler: handleListJobAttendance },
  { method: 'POST', path: '/api/attendance/:id/confirm', middlewares: [requireAuth, requireRole('employer')], handler: handleConfirmAttendance },

  // ── Rating Routes ──
  { method: 'POST', path: '/api/jobs/:id/rate', middlewares: [requireAuth], handler: handleSubmitRating },
  { method: 'GET', path: '/api/jobs/:id/ratings', middlewares: [], handler: handleListJobRatings },
  { method: 'GET', path: '/api/users/:id/ratings', middlewares: [], handler: handleListUserRatings },
  { method: 'GET', path: '/api/users/:id/rating-summary', middlewares: [], handler: handleUserRatingSummary },
  { method: 'GET', path: '/api/users/:id/trust-score', middlewares: [], handler: handleGetTrustScore },
  { method: 'GET', path: '/api/users/:id/trust-v2', middlewares: [], handler: handleGetTrustScoreV2 },
  { method: 'GET', path: '/api/users/:id/public-profile', middlewares: [], handler: handleGetPublicProfile },

  // ── Report Routes ──
  { method: 'POST', path: '/api/reports', middlewares: [requireAuth], handler: handleCreateReport },

  // ── Notification Routes ──
  { method: 'GET', path: '/api/notifications', middlewares: [requireAuth], handler: handleListNotifications },
  { method: 'GET', path: '/api/notifications/stream', middlewares: [], handler: handleNotificationStream },
  { method: 'POST', path: '/api/notifications/read-all', middlewares: [requireAuth], handler: handleMarkAllAsRead },
  { method: 'POST', path: '/api/notifications/:id/action-click', middlewares: [requireAuth], handler: handleNotificationActionClick },
  { method: 'POST', path: '/api/notifications/:id/read', middlewares: [requireAuth], handler: handleMarkAsRead },

  // ── Message Unread Count ──
  { method: 'GET', path: '/api/messages/unread-count', middlewares: [requireAuth], handler: handleGetUnreadCount },
  { method: 'POST', path: '/api/messages/:id/read', middlewares: [requireAuth], handler: handleMarkMessageRead },

  // ── Push Subscription Routes ──
  { method: 'POST', path: '/api/push/subscribe', middlewares: [requireAuth], handler: handlePushSubscribe },
  { method: 'DELETE', path: '/api/push/subscribe', middlewares: [requireAuth], handler: handlePushUnsubscribe },

  // ── Alert Routes ──
  { method: 'POST', path: '/api/alerts', middlewares: [requireAuth], handler: handleCreateAlert },
  { method: 'GET', path: '/api/alerts', middlewares: [requireAuth], handler: handleListMyAlerts },
  { method: 'DELETE', path: '/api/alerts/:id', middlewares: [requireAuth], handler: handleDeleteAlert },
  { method: 'PUT', path: '/api/alerts/:id', middlewares: [requireAuth], handler: handleToggleAlert },

  // ── Favorite Routes ──
  { method: 'POST', path: '/api/favorites', middlewares: [requireAuth, requireRole('employer')], handler: handleAddFavorite },
  { method: 'GET', path: '/api/favorites', middlewares: [requireAuth, requireRole('employer')], handler: handleListFavorites },
  { method: 'GET', path: '/api/favorites/check/:id', middlewares: [requireAuth, requireRole('employer')], handler: handleCheckFavorite },
  { method: 'DELETE', path: '/api/favorites/:id', middlewares: [requireAuth, requireRole('employer')], handler: handleRemoveFavorite },

  // ── Image Route ──
  { method: 'GET', path: '/api/images/:id', middlewares: [requireAuth], handler: handleGetImage },

  // ── Phase 40 — Live Presence ──
  { method: 'POST', path: '/api/presence/heartbeat', middlewares: [requireAuth, requireRole('worker')], handler: handleHeartbeat },
  { method: 'GET', path: '/api/workers/online-count', middlewares: [requireAuth], handler: handleOnlineCount },

  // ── Phase 40 — Availability Windows ──
  { method: 'POST', path: '/api/availability/windows', middlewares: [requireAuth, requireRole('worker')], handler: handleCreateWindow },
  { method: 'GET', path: '/api/availability/windows', middlewares: [requireAuth, requireRole('worker')], handler: handleListWindows },
  { method: 'DELETE', path: '/api/availability/windows/:id', middlewares: [requireAuth, requireRole('worker')], handler: handleDeleteWindow },

  // ── Phase 40 — Instant Accept (live-feed moved earlier to avoid /:id conflict) ──
  { method: 'POST', path: '/api/jobs/:id/instant-accept', middlewares: [requireAuth, requireRole('worker')], handler: handleInstantAccept },

  // ── Phase 41 — Availability Ads (Worker) ──
  { method: 'POST', path: '/api/availability-ads', middlewares: [requireAuth, requireRole('worker')], handler: handleCreateAd },
  { method: 'GET', path: '/api/availability-ads/mine', middlewares: [requireAuth, requireRole('worker')], handler: handleListMyAds },
  { method: 'DELETE', path: '/api/availability-ads/:id', middlewares: [requireAuth, requireRole('worker')], handler: handleWithdrawAd },
  { method: 'GET', path: '/api/availability-ads/:id', middlewares: [requireAuth], handler: handleGetAd },

  // ── Phase 41 — Worker Discovery (Employer) ──
  { method: 'GET', path: '/api/workers/discover', middlewares: [requireAuth, requireRole('employer')], handler: handleDiscoverWorkers },
  { method: 'GET', path: '/api/workers/:id/card', middlewares: [requireAuth], handler: handleGetWorkerCard },
  { method: 'POST', path: '/api/workers/:id/quick-offer', middlewares: [requireAuth, requireRole('employer')], handler: handleQuickOffer },

  // ── Phase 41 — Admin Ad Stats ──
  { method: 'GET', path: '/api/admin/availability-ads/stats', middlewares: [requireAdmin], handler: handleAdStats },

  // ── Phase 42 — Direct Offers + Phase 43 stats ──
  { method: 'POST', path: '/api/direct-offers', middlewares: [requireAuth, requireRole('employer')], handler: handleCreateOffer },
  { method: 'GET', path: '/api/direct-offers/mine', middlewares: [requireAuth], handler: handleListMyOffers },
  { method: 'GET', path: '/api/direct-offers/stats/employer', middlewares: [requireAuth, requireRole('employer')], handler: handleEmployerOfferStats },
  { method: 'GET', path: '/api/direct-offers/stats/worker', middlewares: [requireAuth, requireRole('worker')], handler: handleWorkerOfferStats },
  { method: 'POST', path: '/api/direct-offers/:id/accept', middlewares: [requireAuth, requireRole('worker')], handler: handleAcceptOffer },
  { method: 'POST', path: '/api/direct-offers/:id/decline', middlewares: [requireAuth, requireRole('worker')], handler: handleDeclineOffer },
  { method: 'DELETE', path: '/api/direct-offers/:id', middlewares: [requireAuth, requireRole('employer')], handler: handleWithdrawOffer },
  { method: 'GET', path: '/api/direct-offers/:id', middlewares: [requireAuth], handler: handleGetOffer },

  // ── Phase 51/53 — Workroom Messaging + Collaboration V2 Routes ──
  { method: 'GET', path: '/api/workrooms', middlewares: [requireAuth], handler: handleListWorkrooms },

  // Phase 53 — specific Workroom V2 routes BEFORE generic /:id
  { method: 'GET', path: '/api/workrooms/:id/search', middlewares: [requireAuth], handler: handleSearchWorkroomMessages },
  { method: 'GET', path: '/api/workrooms/:id/read-receipts', middlewares: [requireAuth], handler: handleGetWorkroomReadReceipts },
  { method: 'POST', path: '/api/workrooms/:id/messages/:messageId/read', middlewares: [requireAuth], handler: handleMarkWorkroomMessageRead },
  { method: 'POST', path: '/api/workrooms/:id/attachments', middlewares: [requireAuth], handler: handleUploadWorkroomAttachment },
  { method: 'GET', path: '/api/workrooms/:id/summary', middlewares: [requireAuth], handler: handleGetWorkroomSummary },

  // Phase 53 — Pins
  { method: 'GET', path: '/api/workrooms/:id/pins', middlewares: [requireAuth], handler: handleListWorkroomPins },
  { method: 'POST', path: '/api/workrooms/:id/pins', middlewares: [requireAuth], handler: handlePinWorkroomMessage },
  { method: 'DELETE', path: '/api/workrooms/:id/pins/:messageId', middlewares: [requireAuth], handler: handleUnpinWorkroomMessage },

  // Phase 53 — Checklist
  { method: 'GET', path: '/api/workrooms/:id/checklist', middlewares: [requireAuth], handler: handleGetWorkroomChecklist },
  { method: 'POST', path: '/api/workrooms/:id/checklist', middlewares: [requireAuth], handler: handleCreateWorkroomChecklistItem },
  { method: 'PUT', path: '/api/workrooms/:id/checklist/:itemId', middlewares: [requireAuth], handler: handleUpdateWorkroomChecklistItem },
  { method: 'DELETE', path: '/api/workrooms/:id/checklist/:itemId', middlewares: [requireAuth], handler: handleDeleteWorkroomChecklistItem },

  // Phase 51 existing message routes
  { method: 'GET', path: '/api/workrooms/:id/messages', middlewares: [requireAuth], handler: handleListWorkroomMessages },
  { method: 'POST', path: '/api/workrooms/:id/messages/read-all', middlewares: [requireAuth], handler: handleMarkWorkroomRead },
  { method: 'POST', path: '/api/workrooms/:id/messages', middlewares: [requireAuth], handler: handleSendWorkroomMessage },
  { method: 'GET', path: '/api/workrooms/:id/timeline', middlewares: [requireAuth], handler: handleGetWorkroomTimeline },
  { method: 'GET', path: '/api/workrooms/:id', middlewares: [requireAuth], handler: handleGetWorkroom },

  // ── Rating Pending Route ──
  { method: 'GET', path: '/api/ratings/pending', middlewares: [requireAuth], handler: handleGetPendingRatings },

  // ── Application Management Routes ──
  { method: 'GET', path: '/api/applications/mine', middlewares: [requireAuth, requireRole('worker')], handler: handleListMyApplications },
  { method: 'POST', path: '/api/applications/:id/withdraw', middlewares: [requireAuth, requireRole('worker')], handler: handleWithdrawApplication },
  { method: 'POST', path: '/api/applications/:id/confirm', middlewares: [requireAuth, requireRole('worker')], handler: handleWorkerConfirm },
  { method: 'POST', path: '/api/applications/:id/decline', middlewares: [requireAuth, requireRole('worker')], handler: handleWorkerDecline },

  // ── Payment Routes ──
  { method: 'POST', path: '/api/jobs/:id/payment', middlewares: [requireAuth, requireRole('employer')], handler: handleCreatePayment },
  { method: 'GET', path: '/api/jobs/:id/payment', middlewares: [requireAuth], handler: handleGetJobPayment },
  { method: 'GET', path: '/api/jobs/:id/receipt', middlewares: [requireAuth], handler: handleGetReceipt },
  { method: 'POST', path: '/api/payments/:id/confirm', middlewares: [requireAuth, requireRole('employer')], handler: handleConfirmPayment },
  { method: 'POST', path: '/api/payments/:id/dispute', middlewares: [requireAuth], handler: handleDisputePayment },

  // ── Admin Routes ──
  { method: 'GET', path: '/api/admin/analytics', middlewares: [requireAdmin], handler: handlePlatformAnalytics },
  { method: 'GET', path: '/api/admin/export/payments', middlewares: [requireAdmin], handler: handleExportPayments },
  { method: 'GET', path: '/api/admin/export/jobs', middlewares: [requireAdmin], handler: handleExportJobs },
  { method: 'GET', path: '/api/admin/export/users', middlewares: [requireAdmin], handler: handleExportUsers },
  { method: 'GET', path: '/api/admin/monitoring', middlewares: [requireAdmin], handler: handleGetMonitoring },
  { method: 'GET', path: '/api/admin/monitoring/latest', middlewares: [requireAdmin], handler: handleGetLatestSnapshot },
  { method: 'GET', path: '/api/admin/errors', middlewares: [requireAdmin], handler: handleGetErrors },
  { method: 'GET', path: '/api/admin/stats', middlewares: [requireAdmin], handler: handleAdminStats },
  { method: 'GET', path: '/api/admin/users', middlewares: [requireAdmin], handler: handleAdminUsers },
  { method: 'GET', path: '/api/admin/jobs', middlewares: [requireAdmin], handler: handleAdminJobs },
  { method: 'GET', path: '/api/admin/financial-summary', middlewares: [requireAdmin], handler: handleAdminFinancialSummary },
  { method: 'POST', path: '/api/admin/payments/:id/complete', middlewares: [requireCapability('admin.payments.complete')], handler: handleAdminCompletePayment },
  { method: 'PUT', path: '/api/admin/users/:id/status', middlewares: [requireCapability('admin.users.status_limited')], handler: handleAdminUpdateUserStatus },
  { method: 'GET', path: '/api/admin/reports', middlewares: [requireAdmin], handler: handleAdminListReports },
  { method: 'PUT', path: '/api/admin/reports/:id', middlewares: [requireCapability('admin.reports.review')], handler: handleAdminReviewReport },
  { method: 'GET', path: '/api/admin/verifications', middlewares: [requireAdmin], handler: handleAdminListVerifications },
  { method: 'PUT', path: '/api/admin/verifications/:id', middlewares: [requireCapability('admin.verifications.review')], handler: handleAdminReviewVerification },

  // ── Admin Audit Log ──
  {
    method: 'GET', path: '/api/admin/audit-log', middlewares: [requireAdmin],
    handler: async (req, res) => {
      try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
        const filters = {};
        if (req.query.action) filters.action = req.query.action;
        if (req.query.targetType) filters.targetType = req.query.targetType;
        const result = await listActions({ page, limit, ...filters });
        sendJSON(res, 200, { ok: true, ...result });
      } catch (err) {
        sendJSON(res, 500, { error: 'خطأ في جلب سجل العمليات', code: 'AUDIT_LOG_ERROR' });
      }
    },
  },

  // ── Phase 44 — Admin Direct Offers Operations Console ──
  { method: 'GET', path: '/api/admin/direct-offers/dashboard', middlewares: [requireAdmin], handler: handleAdminDirectOffersDashboard },
  { method: 'GET', path: '/api/admin/direct-offers/funnel', middlewares: [requireAdmin], handler: handleAdminDirectOffersFunnel },
  { method: 'GET', path: '/api/admin/direct-offers/decline-reasons', middlewares: [requireAdmin], handler: handleAdminDeclineReasons },
  { method: 'GET', path: '/api/admin/direct-offers/abuse', middlewares: [requireAdmin], handler: handleAdminAbuseSignals },

  // ── Phase 47 — Admin Operations Excellence (BEFORE :id patterns) ──
  { method: 'GET', path: '/api/admin/abuse-flags', middlewares: [requireAdmin], handler: handleAdminListFlagsByStatus },
  { method: 'GET', path: '/api/admin/abuse-flags/search', middlewares: [requireAdmin], handler: handleAdminSearchFlagsByNotes },
  { method: 'POST', path: '/api/admin/abuse-flags/bulk-action', middlewares: [requireAdmin], handler: handleAdminBulkFlagAction },
  { method: 'GET', path: '/api/admin/abuse-flags/snooze-expiring', middlewares: [requireAdmin], handler: handleAdminSnoozeExpiring },
  { method: 'GET', path: '/api/admin/users/:id/warnings-remaining', middlewares: [requireAdmin], handler: handleAdminUserWarningsRemaining },
  { method: 'GET', path: '/api/admin/users/:id/trust-v2', middlewares: [requireAdmin], handler: handleAdminUserTrustV2 },
  { method: 'GET', path: '/api/admin/audit-log/search', middlewares: [requireAdmin], handler: handleAdminAuditLogSearch },
  { method: 'GET', path: '/api/admin/audit-log/export', middlewares: [requireCapability('admin.audit.export')], handler: handleAdminAuditLogExport },

  // ── Phase 48 — Admin SSE Channel (self-authenticated via header OR query token) ──
  { method: 'GET', path: '/api/admin/events', middlewares: [], handler: handleAdminEventStream },

  // ── Phase 53 — Trust Score V2 Calibration Admin APIs ──
  { method: 'GET', path: '/api/admin/trust/calibration/dashboard', middlewares: [requireAdmin], handler: handleAdminTrustCalibrationDashboard },
  { method: 'GET', path: '/api/admin/trust/snapshots', middlewares: [requireAdmin], handler: handleAdminTrustSnapshots },
  { method: 'POST', path: '/api/admin/trust/calibration/snapshot-batch', middlewares: [requireCapability('admin.trust.calibration')], handler: handleAdminRunTrustSnapshotBatch },
  { method: 'POST', path: '/api/admin/trust/calibration/report', middlewares: [requireCapability('admin.trust.calibration')], handler: handleAdminRunTrustCalibrationReport },

  // ── Phase 49 — Marketplace Trust Analytics + Multi-Channel Admin Alerting ──
  { method: 'GET', path: '/api/admin/trust/resolution-time', middlewares: [requireAdmin], handler: handleAdminTrustResolutionTime },
  { method: 'GET', path: '/api/admin/trust/warning-conversion', middlewares: [requireAdmin], handler: handleAdminTrustWarningConversion },
  { method: 'GET', path: '/api/admin/trust/per-admin', middlewares: [requireAdmin], handler: handleAdminTrustPerAdmin },
  { method: 'GET', path: '/api/admin/trust/abuse-trend', middlewares: [requireAdmin], handler: handleAdminTrustAbuseTrend },
  { method: 'GET', path: '/api/admin/trust/dashboard', middlewares: [requireAdmin], handler: handleAdminTrustDashboard },
  { method: 'POST', path: '/api/admin/alerts/test-webhook', middlewares: [requireAdmin], handler: handleAdminTestWebhook },

  // ── Phase 52 — Persistent Alert Delivery History ──
  { method: 'GET', path: '/api/admin/alerts/health', middlewares: [requireAdmin], handler: handleAdminAlertDeliveryHealth },
  { method: 'GET', path: '/api/admin/alerts/deliveries', middlewares: [requireAdmin], handler: handleAdminAlertDeliveries },
  { method: 'POST', path: '/api/admin/alerts/deliveries/:id/retry', middlewares: [requireAdmin], handler: handleAdminRetryAlertDelivery },
  { method: 'GET', path: '/api/admin/alerts/deliveries/:id', middlewares: [requireAdmin], handler: handleAdminAlertDeliveryDetail },

  // ── Phase 54 — Production Ops Hardening APIs ──
  { method: 'GET', path: '/api/admin/production/readiness', middlewares: [requireAdmin], handler: handleProductionReadiness },
  { method: 'GET', path: '/api/admin/production/deployment-gate', middlewares: [requireAdmin], handler: handleDeploymentGate },
  { method: 'GET', path: '/api/admin/production/scheduler-cadence', middlewares: [requireAdmin], handler: handleSchedulerCadence },
  { method: 'GET', path: '/api/admin/production/ops-review', middlewares: [requireAdmin], handler: handleOpsReview },
  { method: 'GET', path: '/api/admin/production/instance-mode', middlewares: [requireAdmin], handler: handleInstanceMode },
  { method: 'GET', path: '/api/admin/production/multi-instance-boundary', middlewares: [requireCapability('admin.ops.read')], handler: handleMultiInstanceBoundary },
  { method: 'GET', path: '/api/admin/production/process-locks', middlewares: [requireAdmin], handler: handleProcessLocks },
  { method: 'POST', path: '/api/admin/production/process-locks/:name/release', middlewares: [requireCapability('admin.locks.release')], handler: handleReleaseProcessLock },

  // ── Phase 58 — Governance / RBAC / Privacy / Reviews / Postmortems ──
  { method: 'GET', path: '/api/admin/rbac/matrix', middlewares: [requireCapability('admin.read')], handler: handleAdminRbacMatrix },
  { method: 'GET', path: '/api/admin/rbac/me', middlewares: [requireCapability('admin.read')], handler: handleAdminRbacMe },

  { method: 'GET', path: '/api/admin/approvals', middlewares: [requireCapability('admin.read')], handler: handleListApprovals },
  { method: 'POST', path: '/api/admin/approvals', middlewares: [requireCapability('admin.approvals.write')], handler: handleCreateApproval },
  { method: 'POST', path: '/api/admin/approvals/:id/approve', middlewares: [requireCapability('admin.approvals.write')], handler: handleApproveApproval },
  { method: 'POST', path: '/api/admin/approvals/:id/reject', middlewares: [requireCapability('admin.approvals.write')], handler: handleRejectApproval },

  { method: 'GET', path: '/api/admin/privacy/requests', middlewares: [requireCapability('admin.privacy.read')], handler: handleListPrivacyRequests },
  { method: 'POST', path: '/api/admin/privacy/requests', middlewares: [requireCapability('admin.privacy.write')], handler: handleCreatePrivacyRequest },
  { method: 'GET', path: '/api/admin/privacy/requests/:id', middlewares: [requireCapability('admin.privacy.read')], handler: handleGetPrivacyRequest },
  { method: 'POST', path: '/api/admin/privacy/requests/:id/export', middlewares: [requireCapability('admin.privacy.export')], handler: handleQueuePrivacyExport },
  { method: 'POST', path: '/api/admin/privacy/requests/:id/anonymize-preview', middlewares: [requireCapability('admin.privacy.read')], handler: handlePreviewPrivacyAnonymize },
  { method: 'POST', path: '/api/admin/privacy/requests/:id/anonymize', middlewares: [requireCapability('admin.privacy.anonymize')], handler: handleQueuePrivacyAnonymize },
  { method: 'POST', path: '/api/admin/privacy/requests/:id/cancel', middlewares: [requireCapability('admin.privacy.write')], handler: handleCancelPrivacyRequest },

  { method: 'GET', path: '/api/admin/ops/reviews', middlewares: [requireCapability('admin.ops.read')], handler: handleListOpsReviews },
  { method: 'POST', path: '/api/admin/ops/reviews', middlewares: [requireCapability('admin.ops.review')], handler: handleCreateOpsReview },
  { method: 'GET', path: '/api/admin/ops/reviews/:id', middlewares: [requireCapability('admin.ops.read')], handler: handleGetOpsReview },
  { method: 'POST', path: '/api/admin/ops/reviews/:id/complete', middlewares: [requireCapability('admin.ops.review')], handler: handleCompleteOpsReview },

  { method: 'GET', path: '/api/admin/incidents/:id/postmortem', middlewares: [requireCapability('admin.incidents.read')], handler: handleGetIncidentPostmortem },
  { method: 'POST', path: '/api/admin/incidents/:id/postmortem', middlewares: [requireCapability('admin.postmortems.write')], handler: handleCreateIncidentPostmortem },
  { method: 'PUT', path: '/api/admin/postmortems/:id', middlewares: [requireCapability('admin.postmortems.write')], handler: handleUpdatePostmortem },
  { method: 'GET', path: '/api/admin/postmortems', middlewares: [requireCapability('admin.incidents.read')], handler: handleListPostmortems },

  // ── Phase 56 — Marketplace Intelligence Admin APIs ──
  { method: 'GET', path: '/api/admin/marketplace-intelligence/dashboard', middlewares: [requireAdmin], handler: handleMarketplaceIntelligenceDashboard },
  { method: 'GET', path: '/api/admin/marketplace-intelligence/search', middlewares: [requireAdmin], handler: handleSearchAnalytics },
  { method: 'GET', path: '/api/admin/marketplace-intelligence/search/zero-results', middlewares: [requireAdmin], handler: handleZeroResultSearches },
  { method: 'GET', path: '/api/admin/marketplace-intelligence/activation-funnel', middlewares: [requireAdmin], handler: handleActivationFunnel },
  { method: 'GET', path: '/api/admin/marketplace-intelligence/notification-conversions', middlewares: [requireAdmin], handler: handleNotificationConversions },
  { method: 'GET', path: '/api/admin/marketplace-intelligence/workroom-adoption', middlewares: [requireAdmin], handler: handleWorkroomAdoption },
  { method: 'GET', path: '/api/admin/marketplace-intelligence/payment-disputes', middlewares: [requireAdmin], handler: handlePaymentDisputeAnalytics },
  { method: 'GET', path: '/api/admin/marketplace-intelligence/matching-quality', middlewares: [requireAdmin], handler: handleMatchingQuality },
  { method: 'POST', path: '/api/admin/marketplace-intelligence/rollup/run', middlewares: [requireAdmin], handler: handleRunMarketplaceIntelligenceRollup },

  // ── Phase 55 — Scale Hygiene Admin APIs ──
  { method: 'GET', path: '/api/admin/scale-hygiene/overview', middlewares: [requireAdmin], handler: handleScaleHygieneOverview },

  // ── Phase 59 — Storage Pressure + Scale Thresholds + Externalization Readiness ──
  { method: 'GET', path: '/api/admin/storage-pressure', middlewares: [requireCapability('admin.scale.read')], handler: handleGetStoragePressure },
  { method: 'POST', path: '/api/admin/storage-pressure/capture', middlewares: [requireCapability('admin.ops.review')], handler: handleCaptureStoragePressure },
  { method: 'GET', path: '/api/admin/storage-pressure/snapshots', middlewares: [requireCapability('admin.scale.read')], handler: handleListStoragePressureSnapshots },
  { method: 'GET', path: '/api/admin/scale-thresholds', middlewares: [requireCapability('admin.scale.read')], handler: handleGetScaleThresholds },
  { method: 'POST', path: '/api/admin/scale-thresholds/verify', middlewares: [requireCapability('admin.ops.review')], handler: handleVerifyScaleThresholds },
  { method: 'GET', path: '/api/admin/externalization/readiness', middlewares: [requireCapability('admin.scale.read')], handler: handleExternalizationReadiness },

  // ── Phase 60 — Evidence-Based Externalization Decision + Migration Rehearsal ──
  { method: 'GET', path: '/api/admin/externalization/decision', middlewares: [requireCapability('admin.scale.read')], handler: handleGetExternalizationDecision },
  { method: 'POST', path: '/api/admin/externalization/decision/capture', middlewares: [requireCapability('admin.ops.review')], handler: handleCaptureExternalizationDecision },
  { method: 'GET', path: '/api/admin/externalization/decision/snapshots', middlewares: [requireCapability('admin.scale.read')], handler: handleListExternalizationDecisionSnapshots },
  { method: 'POST', path: '/api/admin/migration-snapshots/validate', middlewares: [requireCapability('admin.ops.review')], handler: handleValidateMigrationSnapshot },
  { method: 'POST', path: '/api/admin/migration-rehearsal/run', middlewares: [requireCapability('admin.ops.review')], handler: handleRunMigrationRehearsal },
  { method: 'GET', path: '/api/admin/benchmarks/history', middlewares: [requireCapability('admin.scale.read')], handler: handleBenchmarkHistory },

  { method: 'GET', path: '/api/admin/queue/health', middlewares: [requireAdmin], handler: handleQueueHealth },
  { method: 'POST', path: '/api/admin/queue/verify', middlewares: [requireAdmin], handler: handleQueueVerify },
  { method: 'POST', path: '/api/admin/queue/compact', middlewares: [requireAdmin], handler: handleQueueCompact },
  { method: 'POST', path: '/api/admin/queue/repair', middlewares: [requireCapability('admin.queue.repair')], handler: handleQueueRepair },

  { method: 'GET', path: '/api/admin/workroom-hygiene/overview', middlewares: [requireAdmin], handler: handleWorkroomHygieneOverview },
  { method: 'POST', path: '/api/admin/workroom-hygiene/compact', middlewares: [requireAdmin], handler: handleWorkroomCompact },
  { method: 'POST', path: '/api/admin/workroom-hygiene/verify-indexes', middlewares: [requireAdmin], handler: handleWorkroomVerifyIndexes },
  { method: 'POST', path: '/api/admin/workroom-hygiene/cleanup-attachments', middlewares: [requireAdmin], handler: handleWorkroomCleanupAttachments },

  { method: 'GET', path: '/api/admin/trust/rollups', middlewares: [requireAdmin], handler: handleTrustRollups },
  { method: 'POST', path: '/api/admin/trust/rollups/run', middlewares: [requireAdmin], handler: handleRunTrustRollup },

  { method: 'GET', path: '/api/admin/predictive-abuse/archive-index/status', middlewares: [requireAdmin], handler: handlePredictiveArchiveIndexStatus },
  { method: 'POST', path: '/api/admin/predictive-abuse/archive-index/rebuild', middlewares: [requireAdmin], handler: handleRebuildPredictiveArchiveIndex },

  { method: 'GET', path: '/api/admin/schedulers/:name/history', middlewares: [requireAdmin], handler: handleSchedulerHistory },

  { method: 'GET', path: '/api/admin/schedulers', middlewares: [requireAdmin], handler: handleListSchedulers },
  { method: 'POST', path: '/api/admin/schedulers/:name/run', middlewares: [requireCapability('admin.schedulers.run')], handler: handleRunSchedulerNow },
  { method: 'POST', path: '/api/admin/schedulers/:name/enable', middlewares: [requireCapability('admin.schedulers.toggle')], handler: handleEnableScheduler },
  { method: 'POST', path: '/api/admin/schedulers/:name/disable', middlewares: [requireCapability('admin.schedulers.toggle')], handler: handleDisableScheduler },
  { method: 'GET', path: '/api/admin/schedulers/:name', middlewares: [requireAdmin], handler: handleGetScheduler },

  { method: 'GET', path: '/api/admin/ops/rollups', middlewares: [requireAdmin], handler: handleOpsRollups },
  { method: 'GET', path: '/api/admin/ops/slo', middlewares: [requireAdmin], handler: handleOpsSlo },

  { method: 'GET', path: '/api/admin/incidents', middlewares: [requireAdmin], handler: handleListIncidents },
  { method: 'POST', path: '/api/admin/incidents/:id/resolve', middlewares: [requireAdmin], handler: handleResolveIncident },
  { method: 'GET', path: '/api/admin/incidents/:id', middlewares: [requireAdmin], handler: handleGetIncident },

  { method: 'POST', path: '/api/admin/backups/restore-drill', middlewares: [requireAdmin], handler: handleRunBackupRestoreDrill },
  { method: 'GET', path: '/api/admin/backups/restore-drills', middlewares: [requireAdmin], handler: handleListBackupRestoreDrills },
  { method: 'GET', path: '/api/admin/backups/restore-drills/:id', middlewares: [requireAdmin], handler: handleGetBackupRestoreDrill },

  { method: 'GET', path: '/api/admin/maintenance', middlewares: [requireAdmin], handler: handleGetMaintenanceMode },
  { method: 'POST', path: '/api/admin/maintenance/enable', middlewares: [requireCapability('admin.maintenance.toggle')], handler: handleEnableMaintenanceMode },
  { method: 'POST', path: '/api/admin/maintenance/disable', middlewares: [requireCapability('admin.maintenance.toggle')], handler: handleDisableMaintenanceMode },

  // ── Phase 50 — Audit Indexed Search Admin Ops ──
  { method: 'GET', path: '/api/admin/audit-index/status', middlewares: [requireAdmin], handler: handleAdminAuditIndexStatus },
  { method: 'POST', path: '/api/admin/audit-index/rebuild', middlewares: [requireAdmin], handler: handleAdminAuditIndexRebuild },
  { method: 'POST', path: '/api/admin/audit-index/verify', middlewares: [requireAdmin], handler: handleAdminAuditIndexVerify },

  // ── Phase 52 — Persistent Ops Queue Admin APIs ──
  { method: 'GET', path: '/api/admin/ops-queue/stats', middlewares: [requireAdmin], handler: handleAdminQueueStats },
  { method: 'GET', path: '/api/admin/ops-queue/dead-letter', middlewares: [requireAdmin], handler: handleAdminDeadLetterJobs },
  { method: 'POST', path: '/api/admin/ops-queue/dead-letter/:id/retry', middlewares: [requireAdmin], handler: handleAdminRetryDeadLetterJob },
  { method: 'GET', path: '/api/admin/ops-queue/jobs', middlewares: [requireAdmin], handler: handleAdminQueueJobs },
  { method: 'POST', path: '/api/admin/ops-queue/jobs/:id/retry', middlewares: [requireAdmin], handler: handleAdminRetryQueueJob },
  { method: 'POST', path: '/api/admin/ops-queue/jobs/:id/cancel', middlewares: [requireAdmin], handler: handleAdminCancelQueueJob },
  { method: 'GET', path: '/api/admin/ops-queue/jobs/:id', middlewares: [requireAdmin], handler: handleAdminQueueJobDetail },

  // ── Phase 50/52 — Persistent Export Registry + Async Export Jobs ──
  { method: 'POST', path: '/api/admin/exports/audit-log', middlewares: [requireCapability('admin.audit.export')], handler: handleAdminCreateAuditExportJob },
  { method: 'GET', path: '/api/admin/exports', middlewares: [requireAdmin], handler: handleAdminListExports },
  { method: 'GET', path: '/api/admin/exports/:id/download', middlewares: [requireAdmin], handler: handleAdminDownloadExport },
  { method: 'POST', path: '/api/admin/exports/:id/cancel', middlewares: [requireAdmin], handler: handleAdminCancelExport },
  { method: 'GET', path: '/api/admin/exports/:id', middlewares: [requireAdmin], handler: handleAdminGetExport },

  // ── Phase 50 — Counter Hygiene ──
  { method: 'GET', path: '/api/admin/counters/hygiene', middlewares: [requireAdmin], handler: handleAdminCounterHygiene },
  { method: 'POST', path: '/api/admin/counters/compact', middlewares: [requireAdmin], handler: handleAdminCompactCounters },
  { method: 'POST', path: '/api/admin/counters/rebuild', middlewares: [requireAdmin], handler: handleAdminRebuildCounters },

  // ── Phase 51 — Predictive Abuse Intelligence ──
  { method: 'GET', path: '/api/admin/predictive-abuse/dashboard', middlewares: [requireAdmin], handler: handleAdminPredictiveAbuseDashboard },
  { method: 'GET', path: '/api/admin/predictive-abuse/signals', middlewares: [requireAdmin], handler: handleAdminPredictiveAbuseSignals },
  { method: 'GET', path: '/api/admin/predictive-abuse/precision', middlewares: [requireAdmin], handler: handleAdminPredictivePrecision },
  { method: 'POST', path: '/api/admin/predictive-abuse/run-scan', middlewares: [requireAdmin], handler: handleAdminRunPredictiveAbuseScan },
  { method: 'POST', path: '/api/admin/predictive-abuse/retention/run', middlewares: [requireAdmin], handler: handleAdminRunPredictiveSignalRetention },
  { method: 'POST', path: '/api/admin/predictive-abuse/signals/:id/false-positive', middlewares: [requireCapability('admin.predictive.review')], handler: handleAdminMarkPredictiveFalsePositive },
  { method: 'POST', path: '/api/admin/predictive-abuse/signals/:id/confirm', middlewares: [requireCapability('admin.predictive.review')], handler: handleAdminMarkPredictiveConfirmed },
  { method: 'POST', path: '/api/admin/predictive-abuse/signals/:id/dismiss', middlewares: [requireCapability('admin.predictive.review')], handler: handleAdminDismissPredictiveSignal },
  { method: 'POST', path: '/api/admin/predictive-abuse/signals/:id/escalate', middlewares: [requireCapability('admin.predictive.review')], handler: handleAdminEscalatePredictiveSignal },

  // ── Phase 51 — Admin Decision Quality ──
  { method: 'GET', path: '/api/admin/trust/decision-quality', middlewares: [requireAdmin], handler: handleAdminTrustDecisionQuality },
  { method: 'GET', path: '/api/admin/trust/backlog-priority', middlewares: [requireAdmin], handler: handleAdminTrustBacklogPriority },

  // ── Phase 45 — Admin Abuse Flag Review Workflow ──
  { method: 'GET', path: '/api/admin/abuse-flags/:id/history', middlewares: [requireAdmin], handler: handleAdminFlagReviewHistory },
  { method: 'POST', path: '/api/admin/abuse-flags/:id/review', middlewares: [requireAdmin], handler: handleAdminFlagReview },
  { method: 'POST', path: '/api/admin/abuse-flags/:id/warn', middlewares: [requireAdmin], handler: handleSendAbuseWarning },
];

/**
 * Match a path pattern like /api/jobs/:id/apply against /api/jobs/job_abc123/apply
 * Returns params object or null
 */
function matchPath(pattern, pathname) {
  const patternParts = pattern.split('/');
  const pathParts = pathname.split('/');

  if (patternParts.length !== pathParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

/**
 * Run an array of middleware functions in sequence
 */
function runMiddlewares(middlewares, req, res, done) {
  let idx = 0;
  function next(err) {
    if (err) {
      if (!res.writableEnded) {
        sendJSON(res, 500, { error: 'خطأ داخلي', code: 'INTERNAL_ERROR' });
      }
      return;
    }
    if (res.writableEnded) return;  // Middleware already responded
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

// Setup notification event listeners
setupNotificationListeners();

// Phase 41 — Setup ad matcher FIRST (must run before jobMatcher's broad notification)
// adMatcher writes to dedup map → jobMatcher reads it to skip already-notified workers
import { setupAdMatchListeners } from './services/adMatcher.js';
setupAdMatchListeners();

// Phase 41 — Setup worker discovery cache invalidation listeners
import { setupCacheInvalidation } from './services/workerDiscovery.js';
setupCacheInvalidation();

// Setup smart job matching (registers AFTER adMatcher so adMatcher's job:created listener fires first)
import { setupJobMatching } from './services/jobMatcher.js';
setupJobMatching();

import { setupJobAlerts } from './services/jobAlerts.js';
setupJobAlerts();

// Phase 40 — Setup instant match + live feed listeners
import { setupInstantMatchListeners } from './services/instantMatch.js';
setupInstantMatchListeners();

import { setupLiveFeedListeners } from './services/liveFeed.js';
setupLiveFeedListeners();

// Phase 43 — Setup direct offer reconciliation listener (5s delayed re-sync)
import { setupDirectOfferListeners } from './services/directOffer.js';
setupDirectOfferListeners();

// Phase 45 + Phase 46 — Counter applyEvent listeners (registered FIRST — before cache invalidation)
// Each direct_offer:* event triggers an incremental counter file update.
// Phase 46: uses applyEventBatched (synchronous push to in-memory queue + scheduled flush).
// Throughput: ~10 evt/sec → 100+ evt/sec sustained.
// Fire-and-forget: failures logged, scheduled rebuild (every 24h) catches drift.
if (config.COUNTERS && config.COUNTERS.enabled) {
  const counterEvents = ['direct_offer:created', 'direct_offer:accepted', 'direct_offer:declined', 'direct_offer:expired', 'direct_offer:withdrawn'];
  for (const eventName of counterEvents) {
    eventBus.on(eventName, (data) => {
      const eventType = eventName.split(':')[1];
      try {
        // Phase 46: use applyEventBatched (was applyEvent in Phase 45)
        directOfferCounters.applyEventBatched(eventType, data);
      } catch (err) {
        logger.warn('Phase 46: counter applyEventBatched failed', { eventName, error: err.message });
      }
    });
  }
  logger.info(`Direct offer counters: enabled (${counterEvents.length} event listeners, Phase 46 batched)`);
} else {
  logger.info('Direct offer counters: disabled via config');
}

// Phase 44 + 45 — Analytics cache invalidation (debounced, registered AFTER counter listeners)
// Listeners registered AFTER setupDirectOfferListeners + counter listeners to ensure proper event ordering.
// Phase 45: uses debouncedClear to prevent thundering herd during event bursts.
// Fire-and-forget: failure tolerated, TTL (5min) catches stale data eventually.
if (config.ANALYTICS && config.ANALYTICS.cacheInvalidationEnabled) {
  const invalidationEvents = config.ANALYTICS.cacheInvalidationEvents || [];
  for (const eventName of invalidationEvents) {
    eventBus.on(eventName, (data) => {
      try {
        // Per-employer analytics cache (if event payload has employerId)
        if (data && data.employerId) {
          debouncedClear(`emp:${data.employerId}`, () => {
            clearAnalyticsCache(`analytics:employer:${data.employerId}:`);
          });
        }
        // Per-worker analytics cache (if event payload has workerId)
        if (data && data.workerId) {
          debouncedClear(`wrk:${data.workerId}`, () => {
            clearAnalyticsCache(`analytics:worker:${data.workerId}:`);
          });
        }
        // Platform-wide analytics cache (always invalidate)
        debouncedClear('platform', () => {
          clearAnalyticsCache('analytics:platform:');
          clearDirectOfferAnalyticsCache();
        });
      } catch (_) { /* fire-and-forget */ }
    });
  }
  logger.info(`Analytics cache invalidation: enabled (${invalidationEvents.length} events, debounced)`);
} else {
  logger.info('Analytics cache invalidation: disabled via config');
}

/**
 * Creates the router function
 */
export function createRouter() {
  return function router(req, res) {
    const method = req.method;
    const pathname = req.pathname;
    const startTime = Date.now();

    // Find matching route
    for (const route of routes) {
      if (route.method !== method) continue;

      const params = matchPath(route.path, pathname);
      if (params === null) continue;

      // Attach params
      req.params = params;

      // Validate URL parameters (path traversal prevention)
      for (const [paramName, paramValue] of Object.entries(params)) {
        if (paramValue && !isValidId(paramValue)) {
          sendJSON(res, 400, { error: 'معرّف غير صالح', code: 'INVALID_ID', param: paramName });
          return;
        }
      }

      // Run route-specific middleware then handler
      runMiddlewares(route.middlewares, req, res, () => {
        Promise.resolve(route.handler(req, res)).catch((err) => {
          logger.error('Handler error', { error: err.message, path: pathname });
          if (!res.writableEnded) {
            sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
          }
          // Record error for aggregation (fire-and-forget)
          try {
            import('./services/errorAggregator.js').then(({ recordError }) => {
              recordError(pathname, 500, err.message);
            }).catch(() => {});
          } catch (_) { /* non-fatal */ }
        }).finally(() => {
          const duration = Date.now() - startTime;
          logger.request(req, res.statusCode, duration);
        });
      });

      return;
    }

    // No route matched — 404
    sendJSON(res, 404, { error: 'المسار غير موجود', code: 'NOT_FOUND' });
    const duration = Date.now() - startTime;
    logger.request(req, 404, duration);
  };
}
