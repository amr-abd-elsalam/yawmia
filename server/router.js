// ═══════════════════════════════════════════════════════════════
// server/router.js — Central Route Registry
// ═══════════════════════════════════════════════════════════════

import config from '../config.js';
import { isValidId } from './services/database.js';
import { requireAuth, requireRole, requireAdmin } from './middleware/auth.js';
import { handleSendOtp, handleVerifyOtp, handleGetMe, handleUpdateProfile, handleLogout, handleLogoutAll, handleAcceptTerms, handleDeleteAccount } from './handlers/authHandler.js';
import { handleCreateJob, handleListJobs, handleGetJob, handleStartJob, handleCompleteJob, handleCancelJob, handleListMyJobs, handleNearbyJobs, handleRenewJob, handleDuplicateJob } from './handlers/jobsHandler.js';
import { handleApplyToJob, handleAcceptWorker, handleRejectWorker, handleListJobApplications, handleListMyApplications, handleWithdrawApplication, handleWorkerConfirm, handleWorkerDecline } from './handlers/applicationsHandler.js';
import { handleAdminStats, handleAdminUsers, handleAdminJobs, handleAdminUpdateUserStatus } from './handlers/adminHandler.js';
import { handleListNotifications, handleMarkAsRead, handleMarkAllAsRead } from './handlers/notificationsHandler.js';
import { handleSubmitRating, handleListJobRatings, handleListUserRatings, handleUserRatingSummary, handleGetPendingRatings } from './handlers/ratingsHandler.js';
import { handleCreatePayment, handleConfirmPayment, handleAdminCompletePayment, handleDisputePayment, handleGetJobPayment, handleAdminFinancialSummary } from './handlers/paymentsHandler.js';
import { handleCreateReport, handleAdminListReports, handleAdminReviewReport, handleGetTrustScore } from './handlers/reportsHandler.js';
import { handleSubmitVerification, handleGetVerificationStatus, handleGetPublicProfile, handleAdminListVerifications, handleAdminReviewVerification } from './handlers/verificationHandler.js';
import { handleNotificationStream } from './handlers/sseHandler.js';
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
import { handleCreateOffer, handleAcceptOffer, handleDeclineOffer, handleWithdrawOffer, handleListMyOffers, handleGetOffer } from './handlers/directOfferHandler.js';
import { setupNotificationListeners } from './services/notifications.js';
import { logger } from './services/logger.js';
import { listActions } from './services/auditLog.js';

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
        version: '0.38.0',
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
      sendJSON(res, 200, { ok: true, routes: docs, total: docs.length, version: '0.38.0' });
    },
  },

  // ── Auth Routes (Public) ──
  { method: 'POST', path: '/api/auth/send-otp', middlewares: [], handler: handleSendOtp },
  { method: 'POST', path: '/api/auth/verify-otp', middlewares: [], handler: handleVerifyOtp },

  // ── Auth Routes (Protected) ──
  { method: 'GET', path: '/api/auth/me', middlewares: [requireAuth], handler: handleGetMe },
  { method: 'PUT', path: '/api/auth/profile', middlewares: [requireAuth], handler: handleUpdateProfile },
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
  { method: 'GET', path: '/api/users/:id/public-profile', middlewares: [], handler: handleGetPublicProfile },

  // ── Report Routes ──
  { method: 'POST', path: '/api/reports', middlewares: [requireAuth], handler: handleCreateReport },

  // ── Notification Routes ──
  { method: 'GET', path: '/api/notifications', middlewares: [requireAuth], handler: handleListNotifications },
  { method: 'GET', path: '/api/notifications/stream', middlewares: [], handler: handleNotificationStream },
  { method: 'POST', path: '/api/notifications/read-all', middlewares: [requireAuth], handler: handleMarkAllAsRead },
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

  // ── Phase 40 — Live Feed + Instant Accept ──
  { method: 'GET', path: '/api/jobs/live-feed', middlewares: [], handler: handleLiveFeedStream },
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

  // ── Phase 42 — Direct Offers ──
  { method: 'POST', path: '/api/direct-offers', middlewares: [requireAuth, requireRole('employer')], handler: handleCreateOffer },
  { method: 'GET', path: '/api/direct-offers/mine', middlewares: [requireAuth], handler: handleListMyOffers },
  { method: 'POST', path: '/api/direct-offers/:id/accept', middlewares: [requireAuth, requireRole('worker')], handler: handleAcceptOffer },
  { method: 'POST', path: '/api/direct-offers/:id/decline', middlewares: [requireAuth, requireRole('worker')], handler: handleDeclineOffer },
  { method: 'DELETE', path: '/api/direct-offers/:id', middlewares: [requireAuth, requireRole('employer')], handler: handleWithdrawOffer },
  { method: 'GET', path: '/api/direct-offers/:id', middlewares: [requireAuth], handler: handleGetOffer },

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
  { method: 'POST', path: '/api/admin/payments/:id/complete', middlewares: [requireAdmin], handler: handleAdminCompletePayment },
  { method: 'PUT', path: '/api/admin/users/:id/status', middlewares: [requireAdmin], handler: handleAdminUpdateUserStatus },
  { method: 'GET', path: '/api/admin/reports', middlewares: [requireAdmin], handler: handleAdminListReports },
  { method: 'PUT', path: '/api/admin/reports/:id', middlewares: [requireAdmin], handler: handleAdminReviewReport },
  { method: 'GET', path: '/api/admin/verifications', middlewares: [requireAdmin], handler: handleAdminListVerifications },
  { method: 'PUT', path: '/api/admin/verifications/:id', middlewares: [requireAdmin], handler: handleAdminReviewVerification },

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
      if (params.id && !isValidId(params.id)) {
        sendJSON(res, 400, { error: 'معرّف غير صالح', code: 'INVALID_ID' });
        return;
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
