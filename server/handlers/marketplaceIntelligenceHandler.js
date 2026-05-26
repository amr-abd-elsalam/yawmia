// ═══════════════════════════════════════════════════════════════
// server/handlers/marketplaceIntelligenceHandler.js — Marketplace Intelligence Admin APIs (Phase 56)
// ═══════════════════════════════════════════════════════════════
// Admin-only product/marketplace intelligence endpoints.
// No PII leakage.
// Heavy rollups support ?async=1.
// ═══════════════════════════════════════════════════════════════

import { logAction } from '../services/auditLog.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function adminId(req) {
  return req.user?.id || 'admin_token';
}

function requestIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
}

function parseBool(value) {
  return value === true || value === '1' || value === 'true';
}

function queryOptions(req) {
  return {
    from: req.query.from || undefined,
    to: req.query.to || undefined,
    month: req.query.month || undefined,
    day: req.query.day || undefined,
    limit: parseInt(req.query.limit) || undefined,
    groupBy: req.query.groupBy || undefined,
  };
}

/**
 * GET /api/admin/marketplace-intelligence/dashboard
 */
export async function handleMarketplaceIntelligenceDashboard(req, res) {
  try {
    const { getMarketplaceIntelligenceDashboard, listMarketplaceIntelligenceRollups } =
      await import('../services/marketplaceIntelligenceRollups.js');

    const [dashboard, rollups] = await Promise.all([
      getMarketplaceIntelligenceDashboard({ ...queryOptions(req), noCapture: true }),
      listMarketplaceIntelligenceRollups({ limit: 7 }),
    ]);

    return sendJSON(res, 200, {
      ok: true,
      dashboard,
      recentRollups: rollups.rollups || [],
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب ذكاء السوق',
      code: 'MARKETPLACE_INTELLIGENCE_DASHBOARD_ERROR',
    });
  }
}

/**
 * GET /api/admin/marketplace-intelligence/search
 */
export async function handleSearchAnalytics(req, res) {
  try {
    const { getSearchAnalytics } = await import('../services/searchAnalytics.js');
    const result = await getSearchAnalytics({
      month: req.query.month || undefined,
      scope: req.query.scope || undefined,
      limit: parseInt(req.query.limit) || 20,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب تحليلات البحث',
      code: 'SEARCH_ANALYTICS_ERROR',
    });
  }
}

/**
 * GET /api/admin/marketplace-intelligence/search/zero-results
 */
export async function handleZeroResultSearches(req, res) {
  try {
    const { getZeroResultQueries } = await import('../services/searchAnalytics.js');
    const result = await getZeroResultQueries({
      month: req.query.month || undefined,
      scope: req.query.scope || undefined,
      limit: parseInt(req.query.limit) || 20,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب عمليات البحث بدون نتائج',
      code: 'ZERO_RESULT_SEARCH_ERROR',
    });
  }
}

/**
 * GET /api/admin/marketplace-intelligence/activation-funnel
 */
export async function handleActivationFunnel(req, res) {
  try {
    const { getActivationFunnel } = await import('../services/activationFunnelMetrics.js');
    const result = await getActivationFunnel({
      month: req.query.month || undefined,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب Activation Funnel',
      code: 'ACTIVATION_FUNNEL_ERROR',
    });
  }
}

/**
 * GET /api/admin/marketplace-intelligence/notification-conversions
 */
export async function handleNotificationConversions(req, res) {
  try {
    const { getNotificationConversionMetrics } = await import('../services/notificationConversionMetrics.js');
    const result = await getNotificationConversionMetrics({
      month: req.query.month || undefined,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب تحويلات الإشعارات',
      code: 'NOTIFICATION_CONVERSIONS_ERROR',
    });
  }
}

/**
 * GET /api/admin/marketplace-intelligence/workroom-adoption
 */
export async function handleWorkroomAdoption(req, res) {
  try {
    const { getWorkroomAdoptionMetrics } = await import('../services/workroomAdoptionMetrics.js');
    const result = await getWorkroomAdoptionMetrics({
      month: req.query.month || undefined,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب استخدام Workroom',
      code: 'WORKROOM_ADOPTION_ERROR',
    });
  }
}

/**
 * GET /api/admin/marketplace-intelligence/payment-disputes
 */
export async function handlePaymentDisputeAnalytics(req, res) {
  try {
    const {
      getPaymentDisputeAnalytics,
      getPaymentDisputeTrend,
      getPaymentDisputeBreakdown,
    } = await import('../services/paymentDisputeAnalytics.js');

    const opts = queryOptions(req);

    const [analytics, trend, breakdown] = await Promise.all([
      getPaymentDisputeAnalytics(opts),
      getPaymentDisputeTrend(opts),
      getPaymentDisputeBreakdown(opts),
    ]);

    return sendJSON(res, 200, {
      ok: true,
      analytics,
      trend: trend.trend || [],
      breakdown,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب تحليلات نزاعات الدفع',
      code: 'PAYMENT_DISPUTE_ANALYTICS_ERROR',
    });
  }
}

/**
 * GET /api/admin/marketplace-intelligence/matching-quality
 */
export async function handleMatchingQuality(req, res) {
  try {
    const { getMatchingIntelligenceStats } = await import('../services/matchingIntelligence.js');
    const stats = await getMatchingIntelligenceStats();

    return sendJSON(res, 200, {
      ok: true,
      stats,
      safety: {
        noPunitiveAutomation: true,
        noAutoBan: true,
        explanationPolicy: 'positive_or_neutral_only',
      },
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب جودة المطابقة',
      code: 'MATCHING_QUALITY_ERROR',
    });
  }
}

/**
 * POST /api/admin/marketplace-intelligence/rollup/run?async=1
 */
export async function handleRunMarketplaceIntelligenceRollup(req, res) {
  try {
    const body = req.body || {};
    const day = body.day || req.query.day || new Date().toISOString().slice(0, 10);

    if (parseBool(req.query.async)) {
      const { enqueueJob } = await import('../services/opsQueue.js');

      const enqueueResult = await enqueueJob({
        type: 'marketplace_intelligence_rollup',
        priority: body.priority || 'normal',
        payload: {
          options: {
            day,
            from: body.from || req.query.from || undefined,
            to: body.to || req.query.to || undefined,
            reason: 'admin_requested',
          },
        },
        idempotencyKey: `marketplace_intelligence_rollup:manual:${adminId(req)}:${day}:${new Date().toISOString().slice(0, 16)}`,
        createdBy: adminId(req),
      });

      if (!enqueueResult.ok) {
        return sendJSON(res, 500, {
          error: enqueueResult.error || 'تعذّر إضافة Rollup للطابور',
          code: 'MARKETPLACE_ROLLUP_QUEUE_ERROR',
        });
      }

      logAction({
        adminId: adminId(req),
        action: 'marketplace_intelligence_rollup_queued',
        targetType: 'marketplace_intelligence',
        targetId: day,
        details: {
          queueJobId: enqueueResult.job.id,
          deduped: !!enqueueResult.deduped,
          day,
        },
        ip: requestIp(req),
      }).catch(() => {});

      return sendJSON(res, 202, {
        ok: true,
        queued: true,
        queueJobId: enqueueResult.job.id,
        job: enqueueResult.job,
        deduped: !!enqueueResult.deduped,
      });
    }

    const { captureMarketplaceIntelligenceRollup } = await import('../services/marketplaceIntelligenceRollups.js');

    const result = await captureMarketplaceIntelligenceRollup({
      day,
      from: body.from || req.query.from || undefined,
      to: body.to || req.query.to || undefined,
      reason: 'admin_requested',
    });

    logAction({
      adminId: adminId(req),
      action: 'marketplace_intelligence_rollup_run',
      targetType: 'marketplace_intelligence',
      targetId: day,
      details: {
        warningCount: result.health?.warningCount || 0,
        durationMs: result.durationMs || 0,
      },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, rollup: result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تشغيل Marketplace Intelligence Rollup',
      code: 'MARKETPLACE_ROLLUP_ERROR',
    });
  }
}
