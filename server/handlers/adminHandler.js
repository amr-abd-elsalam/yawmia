// ═══════════════════════════════════════════════════════════════
// server/handlers/adminHandler.js — Admin Endpoints
// ═══════════════════════════════════════════════════════════════

import { countByRole, listAll as listAllUsers, banUser, unbanUser } from '../services/users.js';
import { countByStatus as jobCounts, listAll as listAllJobs } from '../services/jobs.js';
import { countByStatus as appCounts } from '../services/applications.js';
import { getFinancialSummary, countByStatus as countPaymentsByStatus } from '../services/payments.js';
import { logAction } from '../services/auditLog.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * GET /api/admin/stats
 * Requires: admin
 */
export async function handleAdminStats(req, res) {
  try {
    const users = await countByRole();
    const jobs = await jobCounts();
    const applications = await appCounts();
    const payments = await countPaymentsByStatus();
    const financials = await getFinancialSummary();

    return sendJSON(res, 200, {
      ok: true,
      stats: { users, jobs, applications, payments, financials },
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب الإحصائيات', code: 'STATS_ERROR' });
  }
}

/**
 * GET /api/admin/users
 * Requires: admin
 * Supports: ?page=1&limit=20
 */
export async function handleAdminUsers(req, res) {
  try {
    const users = await listAllUsers();
    // Strip sensitive data
    const safeUsers = users.map(u => ({
      id: u.id,
      phone: u.phone,
      role: u.role,
      name: u.name,
      governorate: u.governorate,
      status: u.status,
      bannedAt: u.bannedAt || null,
      banReason: u.banReason || null,
      createdAt: u.createdAt,
    }));

    // Sort: newest first
    safeUsers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const total = safeUsers.length;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const totalPages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;
    const paginatedUsers = safeUsers.slice(offset, offset + limit);

    return sendJSON(res, 200, { ok: true, users: paginatedUsers, count: paginatedUsers.length, total, page, totalPages, limit });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب المستخدمين', code: 'LIST_USERS_ERROR' });
  }
}

/**
 * GET /api/admin/jobs
 * Requires: admin
 * Supports: ?page=1&limit=20
 */
export async function handleAdminJobs(req, res) {
  try {
    const allJobs = await listAllJobs();

    // Sort: newest first
    allJobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const total = allJobs.length;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const totalPages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;
    const jobs = allJobs.slice(offset, offset + limit);

    return sendJSON(res, 200, { ok: true, jobs, count: jobs.length, total, page, totalPages, limit });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب الفرص', code: 'LIST_JOBS_ERROR' });
  }
}

/**
 * PUT /api/admin/users/:id/status
 * Body: { status: 'active' | 'banned', reason?: string }
 * Requires: requireAdmin
 */
export async function handleAdminUpdateUserStatus(req, res) {
  try {
    const userId = req.params.id;
    const body = req.body || {};
    const newStatus = body.status;

    if (!newStatus || !['active', 'banned'].includes(newStatus)) {
      return sendJSON(res, 400, { error: 'الحالة لازم تكون active أو banned', code: 'INVALID_STATUS' });
    }

    let user;
    if (newStatus === 'banned') {
      const reason = (body.reason || '').trim();
      user = await banUser(userId, reason);
    } else {
      user = await unbanUser(userId);
    }

    if (!user) {
      return sendJSON(res, 404, { error: 'المستخدم غير موجود أو لا يمكن تعديله', code: 'USER_NOT_FOUND' });
    }

    // Audit log (fire-and-forget)
    logAction({
      adminId: req.user?.id || 'admin_token',
      action: newStatus === 'banned' ? 'user_banned' : 'user_unbanned',
      targetType: 'user',
      targetId: userId,
      details: { reason: body.reason || null },
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, user });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في تحديث حالة المستخدم', code: 'UPDATE_USER_STATUS_ERROR' });
  }
}

// ═══════════════════════════════════════════════════════════════
// Phase 44 — Admin Direct Offers Operations Console
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/admin/direct-offers/dashboard?from=&to=
 * Unified dashboard — funnel + topEmployers + topWorkers + declineReasons.
 * Requires: requireAdmin
 */
export async function handleAdminDirectOffersDashboard(req, res) {
  try {
    const {
      getPlatformOfferFunnel,
      getTopEmployersByAcceptance,
      getTopWorkersByAcceptance,
      getDeclineReasonsBreakdown,
    } = await import('../services/directOfferAnalytics.js');

    const from = req.query.from || undefined;
    const to = req.query.to || undefined;

    const [funnel, topEmployers, topWorkers, declineReasons] = await Promise.all([
      getPlatformOfferFunnel({ from, to }),
      getTopEmployersByAcceptance({ from, to, limit: 10 }),
      getTopWorkersByAcceptance({ from, to, limit: 10 }),
      getDeclineReasonsBreakdown({ from, to }),
    ]);

    return sendJSON(res, 200, {
      ok: true,
      period: { from: from || null, to: to || null },
      funnel,
      topEmployers,
      topWorkers,
      declineReasons,
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب dashboard العروض', code: 'OFFERS_DASHBOARD_ERROR' });
  }
}

/**
 * GET /api/admin/direct-offers/funnel?from=&to=
 * Lightweight funnel-only endpoint (cheaper than full dashboard).
 * Requires: requireAdmin
 */
export async function handleAdminDirectOffersFunnel(req, res) {
  try {
    const { getPlatformOfferFunnel } = await import('../services/directOfferAnalytics.js');
    const funnel = await getPlatformOfferFunnel({
      from: req.query.from || undefined,
      to: req.query.to || undefined,
    });
    return sendJSON(res, 200, { ok: true, funnel });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب funnel', code: 'FUNNEL_ERROR' });
  }
}

/**
 * GET /api/admin/direct-offers/decline-reasons?from=&to=
 * Lightweight decline reasons aggregation.
 * Requires: requireAdmin
 */
export async function handleAdminDeclineReasons(req, res) {
  try {
    const { getDeclineReasonsBreakdown } = await import('../services/directOfferAnalytics.js');
    const result = await getDeclineReasonsBreakdown({
      from: req.query.from || undefined,
      to: req.query.to || undefined,
    });
    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب أسباب الرفض', code: 'DECLINE_REASONS_ERROR' });
  }
}

/**
 * GET /api/admin/direct-offers/abuse
 * Run abuse detection rules + return flagged signals.
 * Human-in-the-loop: admin reviews flags + decides (no auto-ban).
 * Requires: requireAdmin
 */
export async function handleAdminAbuseSignals(req, res) {
  try {
    const { detectAbuse } = await import('../services/offerAbuseDetector.js');
    const result = await detectAbuse();
    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في كشف الإساءة', code: 'ABUSE_DETECTION_ERROR' });
  }
}

// ═══════════════════════════════════════════════════════════════
// Phase 45 — Admin Abuse Flag Review Workflow
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/admin/abuse-flags/:id/history
 * Returns full review state for a flag fingerprint.
 * Requires: requireAdmin
 */
export async function handleAdminFlagReviewHistory(req, res) {
  try {
    const { getReviewState } = await import('../services/abuseFlagReview.js');
    const fingerprint = req.params.id;
    const state = await getReviewState(fingerprint);
    if (!state) {
      return sendJSON(res, 404, { error: 'الإشارة غير موجودة', code: 'FLAG_NOT_FOUND' });
    }
    return sendJSON(res, 200, { ok: true, reviewState: state });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب سجل المراجعة', code: 'HISTORY_ERROR' });
  }
}

/**
 * POST /api/admin/abuse-flags/:id/review
 * Body: { decision, note?, snoozeDays? }
 * decision: 'dismissed' | 'snoozed' | 'actioned'
 * Requires: requireAdmin
 */
export async function handleAdminFlagReview(req, res) {
  try {
    const { recordReview, getReviewState } = await import('../services/abuseFlagReview.js');
    const { logAction } = await import('../services/auditLog.js');

    const fingerprint = req.params.id;
    const body = req.body || {};
    const { decision, note, snoozeDays } = body;

    const validDecisions = ['dismissed', 'snoozed', 'actioned'];
    if (!validDecisions.includes(decision)) {
      return sendJSON(res, 400, {
        error: 'القرار غير صالح. القرارات المسموحة: dismissed, snoozed, actioned',
        code: 'INVALID_DECISION',
      });
    }

    if (decision === 'snoozed') {
      const days = parseInt(snoozeDays);
      if (!days || days < 1 || days > 365) {
        return sendJSON(res, 400, {
          error: 'مدة التأجيل لازم تكون بين 1 و 365 يوم',
          code: 'INVALID_SNOOZE_DAYS',
        });
      }
    }

    if (note && (typeof note !== 'string' || note.length > 500)) {
      return sendJSON(res, 400, {
        error: 'الملاحظة لا تتجاوز 500 حرف',
        code: 'NOTE_TOO_LONG',
      });
    }

    // Load existing flag state
    const existingFlag = await getReviewState(fingerprint);
    if (!existingFlag) {
      return sendJSON(res, 404, { error: 'الإشارة غير موجودة', code: 'FLAG_NOT_FOUND' });
    }

    const adminId = req.user?.id || 'admin_token';
    const result = await recordReview({
      flag: existingFlag,
      adminId,
      decision,
      note: note || null,
      snoozeDays: decision === 'snoozed' ? parseInt(snoozeDays) : null,
    });

    // Audit log (fire-and-forget)
    logAction({
      adminId,
      action: 'abuse_flag_reviewed',
      targetType: 'abuse_flag',
      targetId: fingerprint,
      details: { decision, snoozeDays: decision === 'snoozed' ? parseInt(snoozeDays) : null, note: note || null },
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, reviewState: result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في تسجيل المراجعة', code: 'REVIEW_ERROR' });
  }
}

/**
 * POST /api/admin/abuse-flags/:id/warn
 * Body: { message }
 * Sends admin warning notification + Web Push + audit log + records as 'warning' review.
 * Rate limited per user (max 3 warnings per week).
 * Requires: requireAdmin
 */
export async function handleSendAbuseWarning(req, res) {
  try {
    const { getReviewState, recordReview } = await import('../services/abuseFlagReview.js');
    const { createNotification, listByUser } = await import('../services/notifications.js');
    const { sendPush } = await import('../services/webpush.js');
    const { logAction } = await import('../services/auditLog.js');
    const config = (await import('../../config.js')).default;

    const fingerprint = req.params.id;
    const body = req.body || {};
    const message = body.message;

    if (!message || typeof message !== 'string') {
      return sendJSON(res, 400, { error: 'نص الرسالة مطلوب', code: 'INVALID_MESSAGE' });
    }
    const trimmed = message.trim();
    if (trimmed.length < 3 || trimmed.length > 500) {
      return sendJSON(res, 400, {
        error: 'الرسالة لازم تكون بين 3 و 500 حرف',
        code: 'INVALID_MESSAGE',
      });
    }

    const flag = await getReviewState(fingerprint);
    if (!flag) {
      return sendJSON(res, 404, { error: 'الإشارة غير موجودة', code: 'FLAG_NOT_FOUND' });
    }

    // Determine target user (worker for offer-bombing, employer otherwise)
    const targetUserId = flag.flagType === 'worker_offer_bombing' ? flag.workerId : flag.employerId;
    if (!targetUserId) {
      return sendJSON(res, 400, { error: 'لا يمكن تحديد المستخدم المستهدف', code: 'NO_TARGET_USER' });
    }

    // Rate limit check — max N warnings per user per week
    const maxWarnings = (config.DIRECT_OFFERS && config.DIRECT_OFFERS.abuse && config.DIRECT_OFFERS.abuse.maxWarningsPerUserPerWeek) || 3;
    try {
      const userNotifs = await listByUser(targetUserId, { limit: 100, offset: 0 });
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const recentWarnings = (userNotifs.items || []).filter(n =>
        n.type === 'admin_warning' && new Date(n.createdAt).getTime() >= weekAgo
      ).length;
      if (recentWarnings >= maxWarnings) {
        return sendJSON(res, 429, {
          error: `وصل المستخدم للحد الأقصى من التحذيرات الأسبوعية (${maxWarnings})`,
          code: 'WARNING_RATE_LIMITED',
        });
      }
    } catch (_) { /* on rate-check error, allow send */ }

    const adminId = req.user?.id || 'admin_token';

    // Send notification
    await createNotification(targetUserId, 'admin_warning', trimmed, {
      flagType: flag.flagType,
      severity: 'warning',
      fromAdmin: adminId,
      fingerprint,
    });

    // Web Push (fire-and-forget)
    sendPush(targetUserId, {
      title: 'تنبيه من إدارة المنصة',
      body: trimmed,
      icon: '/assets/img/icon-192.png',
      url: '/dashboard.html',
    }).catch(() => {});

    // Record in flag review history (decision='warning', does NOT change currentStatus)
    await recordReview({
      flag,
      adminId,
      decision: 'warning',
      note: trimmed,
    });

    // Audit log (fire-and-forget)
    logAction({
      adminId,
      action: 'abuse_warning_sent',
      targetType: 'user',
      targetId: targetUserId,
      details: { fingerprint, flagType: flag.flagType, message: trimmed },
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, targetUserId });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إرسال التحذير', code: 'WARNING_ERROR' });
  }
}
