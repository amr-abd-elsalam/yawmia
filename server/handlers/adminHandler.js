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

// ═══════════════════════════════════════════════════════════════
// Phase 47 — Admin Operations Excellence Handlers (7)
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/admin/abuse-flags?status=active|snoozed|dismissed|actioned
 * Phase 47 — filtered list of abuse flags by current status.
 * Requires: requireAdmin
 */
export async function handleAdminListFlagsByStatus(req, res) {
  try {
    const { listByStatus } = await import('../services/abuseFlagReview.js');
    const status = req.query.status || 'active';
    const flags = await listByStatus(status);
    return sendJSON(res, 200, { ok: true, flags, count: flags.length, status });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب الإشارات', code: 'LIST_FLAGS_ERROR' });
  }
}

/**
 * GET /api/admin/abuse-flags/search?notes=...
 * Phase 47 — search review states by admin notes content.
 * Requires: requireAdmin
 */
export async function handleAdminSearchFlagsByNotes(req, res) {
  try {
    const { searchByNotes } = await import('../services/abuseFlagReview.js');
    const q = req.query.notes || '';
    if (!q || q.length < 2) {
      return sendJSON(res, 400, { error: 'الاستعلام لازم يكون حرفين على الأقل', code: 'QUERY_TOO_SHORT' });
    }
    const flags = await searchByNotes(q);
    return sendJSON(res, 200, { ok: true, flags, count: flags.length, query: q });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في البحث', code: 'SEARCH_ERROR' });
  }
}

/**
 * POST /api/admin/abuse-flags/bulk-action
 * Body: { fingerprints: [], decision, note?, snoozeDays? }
 * Phase 47 — atomic per-flag bulk update.
 * Requires: requireAdmin
 */
export async function handleAdminBulkFlagAction(req, res) {
  try {
    const { bulkUpdate } = await import('../services/abuseFlagReview.js');
    const { logAction } = await import('../services/auditLog.js');
    const body = req.body || {};
    const { fingerprints, decision, note, snoozeDays } = body;

    if (!Array.isArray(fingerprints) || fingerprints.length === 0) {
      return sendJSON(res, 400, {
        error: 'قائمة fingerprints مطلوبة',
        code: 'FINGERPRINTS_REQUIRED',
      });
    }

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

    const adminId = req.user?.id || 'admin_token';
    let result;
    try {
      result = await bulkUpdate({
        fingerprints,
        adminId,
        decision,
        note: note || null,
        snoozeDays: decision === 'snoozed' ? parseInt(snoozeDays) : null,
      });
    } catch (err) {
      // bulkUpdate throws on max-flags exceeded
      return sendJSON(res, 400, { error: err.message, code: 'BULK_LIMIT_EXCEEDED' });
    }

    // Audit log (fire-and-forget)
    logAction({
      adminId,
      action: 'abuse_flags_bulk_action',
      targetType: 'abuse_flags',
      targetId: 'bulk',
      details: {
        fingerprintCount: fingerprints.length,
        decision,
        succeeded: result.succeeded.length,
        failed: result.failed.length,
      },
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
    }).catch(() => {});

    return sendJSON(res, 200, {
      ok: true,
      succeeded: result.succeeded.length,
      failed: result.failed.length,
      details: { failed: result.failed },
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في العملية الجماعية', code: 'BULK_ACTION_ERROR' });
  }
}

/**
 * GET /api/admin/abuse-flags/snooze-expiring?days=7
 * Phase 47 — flags with snooze approaching expiry.
 * Requires: requireAdmin
 */
export async function handleAdminSnoozeExpiring(req, res) {
  try {
    const { getSnoozeExpiringSoon } = await import('../services/abuseFlagReview.js');
    const days = parseInt(req.query.days) || 7;
    const hoursWindow = days * 24;
    const flags = await getSnoozeExpiringSoon(hoursWindow);
    return sendJSON(res, 200, { ok: true, flags, count: flags.length });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب البيانات', code: 'SNOOZE_EXPIRING_ERROR' });
  }
}

/**
 * GET /api/admin/users/:id/warnings-remaining
 * Phase 47 — visibility for admin warning rate limit.
 * Requires: requireAdmin
 */
export async function handleAdminUserWarningsRemaining(req, res) {
  try {
    const { getRemainingWarnings } = await import('../services/abuseFlagReview.js');
    const userId = req.params.id;
    const result = await getRemainingWarnings(userId);
    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ', code: 'WARNINGS_ERROR' });
  }
}

/**
 * GET /api/admin/audit-log/search?q=&action=&adminId=&targetType=&from=&to=&limit=&cursor=
 * Phase 47 — full-text search + combined filters on audit log.
 * Phase 48 — cursor pagination support added.
 * Requires: requireAdmin
 */
export async function handleAdminAuditLogSearch(req, res) {
  try {
    const { searchActions } = await import('../services/auditLogSearch.js');
    const result = await searchActions({
      q: req.query.q,
      action: req.query.action,
      adminId: req.query.adminId,
      targetType: req.query.targetType,
      from: req.query.from,
      to: req.query.to,
      limit: parseInt(req.query.limit) || 50,
      cursor: req.query.cursor,  // Phase 48
    });
    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في البحث', code: 'AUDIT_SEARCH_ERROR' });
  }
}

/**
 * GET /api/admin/audit-log/export?from=&to=&action=
 * Phase 47 — CSV export with UTF-8 BOM for Arabic Excel.
 * Phase 48 — Streaming export for memory-efficient large datasets (up to 100K rows).
 * Requires: requireAdmin
 */
export async function handleAdminAuditLogExport(req, res) {
  try {
    const { createCsvExportStream } = await import('../services/auditLogSearch.js');
    const { startExport } = await import('../services/csvExportProgress.js');
    const {
      createExport,
      updateExportProgress,
      failExport,
      getExportCsvAbsolutePath,
    } = await import('../services/exportRegistry.js');
    const { logger } = await import('../services/logger.js');
    const { getCollectionPath } = await import('../services/database.js');
    const { readdir } = await import('node:fs/promises');

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `audit-log-${dateStr}.csv`;

    const filters = {
      from: req.query.from || undefined,
      to: req.query.to || undefined,
      action: req.query.action || undefined,
    };

    // Fast estimate: file count only, no JSON reads. Filters may reduce actual rows.
    let totalEstimate = 0;
    try {
      const auditDir = getCollectionPath('audit');
      const files = await readdir(auditDir);
      totalEstimate = files.filter(f =>
        f.startsWith('aud_') && f.endsWith('.json') && !f.endsWith('.tmp')
      ).length;
    } catch (_) {
      totalEstimate = 0;
    }

    const requestedBy = req.user?.id || 'admin_token';
    const exportRecord = await createExport({
      type: 'audit_csv',
      filters,
      requestedBy,
      totalEstimate,
    });

    const exportId = exportRecord?.id || ('exp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));

    startExport(exportId, totalEstimate);
    await updateExportProgress(exportId, {
      status: 'running',
      startedAt: new Date().toISOString(),
      rowsProcessed: 0,
    }).catch(() => {});

    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Transfer-Encoding': 'chunked',
      'X-Export-Id': exportId,
    });

    const stream = createCsvExportStream({
      from: filters.from,
      to: filters.to,
      action: filters.action,
      exportId,
      persistFilePath: exportRecord && exportRecord.filePath ? getExportCsvAbsolutePath(exportId) : null,
    });

    stream.on('error', (err) => {
      logger.error('CSV stream error', { error: err.message, exportId });
      failExport(exportId, err.message).catch(() => {});
      if (!res.writableEnded) {
        try { res.end(); } catch (_) {}
      }
    });

    stream.pipe(res);
  } catch (err) {
    if (!res.writableEnded) {
      return sendJSON(res, 500, { error: 'خطأ في التصدير', code: 'AUDIT_EXPORT_ERROR' });
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Phase 49 — Marketplace Trust Analytics + Admin Alerting
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/admin/trust/resolution-time?from=&to=&flagType=
 * Admin-only trust analytics: avg/p50/p95 resolution time.
 */
export async function handleAdminTrustResolutionTime(req, res) {
  try {
    const { getAvgResolutionTime } = await import('../services/trustAnalytics.js');
    const result = await getAvgResolutionTime({
      from: req.query.from || undefined,
      to: req.query.to || undefined,
      flagType: req.query.flagType || undefined,
    });
    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب متوسط وقت الحل', code: 'TRUST_RESOLUTION_ERROR' });
  }
}

/**
 * GET /api/admin/trust/warning-conversion?from=&to=
 * Admin-only trust analytics: warning → actioned conversion rate.
 */
export async function handleAdminTrustWarningConversion(req, res) {
  try {
    const { getWarningConversionRate } = await import('../services/trustAnalytics.js');
    const result = await getWarningConversionRate({
      from: req.query.from || undefined,
      to: req.query.to || undefined,
    });
    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب معدل التحويل', code: 'TRUST_WARNING_CONVERSION_ERROR' });
  }
}

/**
 * GET /api/admin/trust/per-admin?from=&to=
 * Admin-only trust analytics: per-admin productivity.
 */
export async function handleAdminTrustPerAdmin(req, res) {
  try {
    const { getPerAdminProductivity } = await import('../services/trustAnalytics.js');
    const result = await getPerAdminProductivity({
      from: req.query.from || undefined,
      to: req.query.to || undefined,
    });
    return sendJSON(res, 200, { ok: true, admins: result, count: result.length });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب إنتاجية الأدمن', code: 'TRUST_PER_ADMIN_ERROR' });
  }
}

/**
 * GET /api/admin/trust/abuse-trend?from=&to=
 * Admin-only trust analytics: daily abuse trend.
 */
export async function handleAdminTrustAbuseTrend(req, res) {
  try {
    const { getAbuseTrend } = await import('../services/trustAnalytics.js');
    const result = await getAbuseTrend({
      from: req.query.from || undefined,
      to: req.query.to || undefined,
    });
    return sendJSON(res, 200, { ok: true, trend: result, count: result.length });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب اتجاه الإساءة', code: 'TRUST_ABUSE_TREND_ERROR' });
  }
}

/**
 * GET /api/admin/trust/dashboard?from=&to=
 * Unified trust analytics dashboard endpoint.
 */
export async function handleAdminTrustDashboard(req, res) {
  try {
    const { getTrustDashboard } = await import('../services/trustAnalytics.js');
    const result = await getTrustDashboard({
      from: req.query.from || undefined,
      to: req.query.to || undefined,
    });

    return sendJSON(res, 200, {
      ok: true,
      period: {
        from: req.query.from || null,
        to: req.query.to || null,
      },
      ...result,
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب Dashboard الثقة', code: 'TRUST_DASHBOARD_ERROR' });
  }
}

/**
 * POST /api/admin/alerts/test-webhook
 * Sends a test alert through configured admin alert channels.
 */
export async function handleAdminTestWebhook(req, res) {
  try {
    const { deliverAdminAlert } = await import('../services/adminAlertChannels.js');

    const result = await deliverAdminAlert({
      type: 'test',
      severity: 'medium',
      data: {
        message: 'اختبار Webhook من لوحة تحكم يوميّة',
        summary: 'Yawmia admin webhook test',
        requestedBy: req.user?.id || 'admin_token',
      },
      timestamp: new Date().toISOString(),
    });

    return sendJSON(res, 200, {
      ok: true,
      delivered: !!result.delivered,
      rateLimited: !!result.rateLimited,
      results: result.results || [],
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في اختبار Webhook', code: 'WEBHOOK_TEST_ERROR' });
  }
}

// ═══════════════════════════════════════════════════════════════
// Phase 50 — Audit Index + Export Registry + Counter Hygiene
// ═══════════════════════════════════════════════════════════════

export async function handleAdminAuditIndexStatus(req, res) {
  try {
    const { getAuditIndexStats } = await import('../services/auditLogIndex.js');
    const stats = await getAuditIndexStats();
    return sendJSON(res, 200, { ok: true, auditIndex: stats });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب حالة فهرس سجل العمليات', code: 'AUDIT_INDEX_STATUS_ERROR' });
  }
}

export async function handleAdminAuditIndexRebuild(req, res) {
  try {
    const { rebuildAuditIndex } = await import('../services/auditLogIndex.js');
    const result = await rebuildAuditIndex();

    logAction({
      adminId: req.user?.id || 'admin_token',
      action: 'audit_index_rebuilt',
      targetType: 'audit_index',
      targetId: 'audit_index',
      details: result,
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إعادة بناء الفهرس', code: 'AUDIT_INDEX_REBUILD_ERROR' });
  }
}

export async function handleAdminAuditIndexVerify(req, res) {
  try {
    const { verifyAuditIndex } = await import('../services/auditLogIndex.js');
    const result = await verifyAuditIndex();
    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في فحص الفهرس', code: 'AUDIT_INDEX_VERIFY_ERROR' });
  }
}

export async function handleAdminListExports(req, res) {
  try {
    const { listExports } = await import('../services/exportRegistry.js');
    const result = await listExports({
      status: req.query.status || undefined,
      type: req.query.type || undefined,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });
    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب سجل التصديرات', code: 'EXPORTS_LIST_ERROR' });
  }
}

export async function handleAdminGetExport(req, res) {
  try {
    const { getExport, exportFileExists } = await import('../services/exportRegistry.js');
    const exportId = req.params.id;
    const exp = await getExport(exportId);
    if (!exp) {
      return sendJSON(res, 404, { error: 'التصدير غير موجود', code: 'EXPORT_NOT_FOUND' });
    }
    const fileExists = await exportFileExists(exportId);
    return sendJSON(res, 200, { ok: true, export: { ...exp, fileExists } });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب التصدير', code: 'EXPORT_GET_ERROR' });
  }
}

export async function handleAdminDownloadExport(req, res) {
  try {
    const { getExport, getExportCsvAbsolutePath, exportFileExists } = await import('../services/exportRegistry.js');
    const { createReadStream } = await import('node:fs');
    const exportId = req.params.id;

    const exp = await getExport(exportId);
    if (!exp) {
      return sendJSON(res, 404, { error: 'التصدير غير موجود', code: 'EXPORT_NOT_FOUND' });
    }
    if (exp.status !== 'completed') {
      return sendJSON(res, 400, { error: 'التصدير لم يكتمل بعد', code: 'EXPORT_NOT_COMPLETED' });
    }

    const exists = await exportFileExists(exportId);
    if (!exists) {
      return sendJSON(res, 404, { error: 'ملف التصدير غير موجود أو انتهت صلاحيته', code: 'EXPORT_FILE_NOT_FOUND' });
    }

    const filename = `${exportId}.csv`;
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });

    createReadStream(getExportCsvAbsolutePath(exportId)).pipe(res);
  } catch (err) {
    if (!res.writableEnded) {
      return sendJSON(res, 500, { error: 'خطأ في تحميل التصدير', code: 'EXPORT_DOWNLOAD_ERROR' });
    }
  }
}

export async function handleAdminCancelExport(req, res) {
  try {
    const { cancelExport } = await import('../services/exportRegistry.js');
    const exportId = req.params.id;
    const result = await cancelExport(exportId, req.user?.id || 'admin_token');

    if (!result.ok) {
      const status = result.error === 'EXPORT_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, { error: result.error, code: result.error });
    }

    return sendJSON(res, 200, { ok: true, export: result.export });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إلغاء التصدير', code: 'EXPORT_CANCEL_ERROR' });
  }
}

export async function handleAdminCounterHygiene(req, res) {
  try {
    const { getLastCompactionStats } = await import('../services/counterCompaction.js');
    const counters = await import('../services/directOfferCounters.js');

    const sizeBytes = await counters.getFileSize();
    return sendJSON(res, 200, {
      ok: true,
      fileSizeBytes: sizeBytes,
      fileSizeMB: +(sizeBytes / 1048576).toFixed(2),
      lastCompaction: getLastCompactionStats(),
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب حالة العدادات', code: 'COUNTER_HYGIENE_ERROR' });
  }
}

export async function handleAdminCompactCounters(req, res) {
  try {
    const { compactCounters } = await import('../services/counterCompaction.js');
    const result = await compactCounters();

    logAction({
      adminId: req.user?.id || 'admin_token',
      action: 'counters_compacted',
      targetType: 'counters',
      targetId: 'direct_offer_counters',
      details: result,
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في ضغط العدادات', code: 'COUNTER_COMPACT_ERROR' });
  }
}
