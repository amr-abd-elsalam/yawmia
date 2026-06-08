# يوميّة (Yawmia) v0.57.0 — Part 3: Middleware (7) + Handlers (11)
> Auto-generated: 2026-06-08T19:16:32.711Z
> Files in this part: 45

## Files
1. `server/handlers/adminHandler.js`
2. `server/handlers/adminSseHandler.js`
3. `server/handlers/alertsHandler.js`
4. `server/handlers/analyticsHandler.js`
5. `server/handlers/applicationsHandler.js`
6. `server/handlers/attendanceHandler.js`
7. `server/handlers/authHandler.js`
8. `server/handlers/availabilityAdHandler.js`
9. `server/handlers/availabilityHandler.js`
10. `server/handlers/directOfferHandler.js`
11. `server/handlers/externalizationDecisionHandler.js`
12. `server/handlers/favoritesHandler.js`
13. `server/handlers/governanceHandler.js`
14. `server/handlers/imageHandler.js`
15. `server/handlers/jobsHandler.js`
16. `server/handlers/liveFeedHandler.js`
17. `server/handlers/marketplaceIntelligenceHandler.js`
18. `server/handlers/messagesHandler.js`
19. `server/handlers/notificationsHandler.js`
20. `server/handlers/paymentsHandler.js`
21. `server/handlers/phase61Handler.js`
22. `server/handlers/presenceHandler.js`
23. `server/handlers/productionOpsHandler.js`
24. `server/handlers/profileTasksHandler.js`
25. `server/handlers/pushHandler.js`
26. `server/handlers/queueHandler.js`
27. `server/handlers/ratingsHandler.js`
28. `server/handlers/reportsHandler.js`
29. `server/handlers/scaleHygieneHandler.js`
30. `server/handlers/sseHandler.js`
31. `server/handlers/storagePressureHandler.js`
32. `server/handlers/trustCalibrationHandler.js`
33. `server/handlers/verificationHandler.js`
34. `server/handlers/workerDiscoveryHandler.js`
35. `server/handlers/workroomHandler.js`
36. `server/middleware/auth.js`
37. `server/middleware/bodyParser.js`
38. `server/middleware/cors.js`
39. `server/middleware/maintenance.js`
40. `server/middleware/rateLimit.js`
41. `server/middleware/readOnlyReplica.js`
42. `server/middleware/requestId.js`
43. `server/middleware/security.js`
44. `server/middleware/static.js`
45. `server/middleware/timing.js`

---

## `server/handlers/adminHandler.js`

```javascript
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
      queued: !!result.queued,
      deliveries: result.deliveries || [],
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
    if (req.query.async === '1' || req.query.async === 'true') {
      const { enqueueJob } = await import('../services/opsQueue.js');

      const enqueueResult = await enqueueJob({
        type: 'audit_index_rebuild',
        priority: 'high',
        payload: { options: {} },
        idempotencyKey: 'heavy:audit_index_rebuild:global',
        createdBy: req.user?.id || 'admin_token',
      });

      if (!enqueueResult.ok) {
        return sendJSON(res, 500, { error: enqueueResult.error || 'تعذّر إضافة المهمة للطابور', code: 'QUEUE_ENQUEUE_ERROR' });
      }

      logAction({
        adminId: req.user?.id || 'admin_token',
        action: 'audit_index_rebuild_queued',
        targetType: 'audit_index',
        targetId: 'audit_index',
        details: { queueJobId: enqueueResult.job.id, deduped: !!enqueueResult.deduped },
        ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
      }).catch(() => {});

      return sendJSON(res, 202, {
        ok: true,
        queued: true,
        queueJobId: enqueueResult.job.id,
        job: enqueueResult.job,
        deduped: !!enqueueResult.deduped,
      });
    }

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
    if (req.query.async === '1' || req.query.async === 'true') {
      const { enqueueJob } = await import('../services/opsQueue.js');

      const enqueueResult = await enqueueJob({
        type: 'counter_compaction',
        priority: 'high',
        payload: { options: req.body || {} },
        idempotencyKey: 'heavy:counter_compaction:global',
        createdBy: req.user?.id || 'admin_token',
      });

      if (!enqueueResult.ok) {
        return sendJSON(res, 500, { error: enqueueResult.error || 'تعذّر إضافة المهمة للطابور', code: 'QUEUE_ENQUEUE_ERROR' });
      }

      logAction({
        adminId: req.user?.id || 'admin_token',
        action: 'counters_compaction_queued',
        targetType: 'counters',
        targetId: 'direct_offer_counters',
        details: { queueJobId: enqueueResult.job.id, deduped: !!enqueueResult.deduped },
        ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
      }).catch(() => {});

      return sendJSON(res, 202, {
        ok: true,
        queued: true,
        queueJobId: enqueueResult.job.id,
        job: enqueueResult.job,
        deduped: !!enqueueResult.deduped,
      });
    }

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

/**
 * POST /api/admin/counters/rebuild?async=1
 * Phase 52 — Queue-based direct offer counter rebuild.
 */
export async function handleAdminRebuildCounters(req, res) {
  try {
    if (req.query.async === '1' || req.query.async === 'true') {
      const { enqueueJob } = await import('../services/opsQueue.js');

      const enqueueResult = await enqueueJob({
        type: 'counter_rebuild',
        priority: 'critical',
        payload: { reason: 'admin_requested' },
        idempotencyKey: 'heavy:counter_rebuild:global',
        createdBy: req.user?.id || 'admin_token',
      });

      if (!enqueueResult.ok) {
        return sendJSON(res, 500, { error: enqueueResult.error || 'تعذّر إضافة المهمة للطابور', code: 'QUEUE_ENQUEUE_ERROR' });
      }

      logAction({
        adminId: req.user?.id || 'admin_token',
        action: 'counters_rebuild_queued',
        targetType: 'counters',
        targetId: 'direct_offer_counters',
        details: { queueJobId: enqueueResult.job.id, deduped: !!enqueueResult.deduped },
        ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
      }).catch(() => {});

      return sendJSON(res, 202, {
        ok: true,
        queued: true,
        queueJobId: enqueueResult.job.id,
        job: enqueueResult.job,
        deduped: !!enqueueResult.deduped,
      });
    }

    const { rebuildCounters } = await import('../services/directOfferCounters.js');
    const result = await rebuildCounters();

    logAction({
      adminId: req.user?.id || 'admin_token',
      action: 'counters_rebuilt',
      targetType: 'counters',
      targetId: 'direct_offer_counters',
      details: result,
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إعادة بناء العدادات', code: 'COUNTER_REBUILD_ERROR' });
  }
}

// ═══════════════════════════════════════════════════════════════
// Phase 51 — Predictive Abuse Intelligence Admin Handlers
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/admin/predictive-abuse/dashboard
 * Admin predictive risk dashboard.
 */
export async function handleAdminPredictiveAbuseDashboard(req, res) {
  try {
    const { getPredictiveDashboard } = await import('../services/predictiveAbuse.js');

    const result = await getPredictiveDashboard({
      status: req.query.status || 'active',
      limit: parseInt(req.query.limit) || 20,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب لوحة المخاطر التنبؤية', code: 'PREDICTIVE_DASHBOARD_ERROR' });
  }
}

/**
 * GET /api/admin/predictive-abuse/signals
 * List predictive signals with filters.
 */
export async function handleAdminPredictiveAbuseSignals(req, res) {
  try {
    const { listPredictiveSignals } = await import('../services/predictiveAbuse.js');

    const result = await listPredictiveSignals({
      status: req.query.status || undefined,
      severity: req.query.severity || undefined,
      riskType: req.query.riskType || undefined,
      entityId: req.query.entityId || undefined,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب إشارات المخاطر', code: 'PREDICTIVE_SIGNALS_ERROR' });
  }
}

/**
 * POST /api/admin/predictive-abuse/run-scan
 * Force-run predictive scan.
 */
export async function handleAdminRunPredictiveAbuseScan(req, res) {
  try {
    if (req.query.async === '1' || req.query.async === 'true') {
      const { enqueueJob } = await import('../services/opsQueue.js');

      const enqueueResult = await enqueueJob({
        type: 'predictive_scan',
        priority: 'high',
        payload: { force: true, persist: true },
        idempotencyKey: `predictive_scan:manual:${req.user?.id || 'admin_token'}:${new Date().toISOString().slice(0, 16)}`,
        createdBy: req.user?.id || 'admin_token',
      });

      if (!enqueueResult.ok) {
        return sendJSON(res, 500, { error: enqueueResult.error || 'تعذّر إضافة الفحص للطابور', code: 'QUEUE_ENQUEUE_ERROR' });
      }

      logAction({
        adminId: req.user?.id || 'admin_token',
        action: 'predictive_abuse_scan_queued',
        targetType: 'predictive_abuse',
        targetId: 'scan',
        details: { queueJobId: enqueueResult.job.id, deduped: !!enqueueResult.deduped },
        ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
      }).catch(() => {});

      return sendJSON(res, 202, {
        ok: true,
        queued: true,
        queueJobId: enqueueResult.job.id,
        job: enqueueResult.job,
        deduped: !!enqueueResult.deduped,
      });
    }

    const { runPredictiveScan } = await import('../services/predictiveAbuse.js');

    const result = await runPredictiveScan({ force: true, persist: true });

    logAction({
      adminId: req.user?.id || 'admin_token',
      action: 'predictive_abuse_scan_run',
      targetType: 'predictive_abuse',
      targetId: 'scan',
      details: {
        signalCount: result.signalCount || 0,
        created: result.created || 0,
        updated: result.updated || 0,
        scannedOffers: result.scannedOffers || 0,
        durationMs: result.durationMs || 0,
      },
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في تشغيل فحص المخاطر', code: 'PREDICTIVE_SCAN_ERROR' });
  }
}

/**
 * POST /api/admin/predictive-abuse/signals/:id/dismiss
 * Body: { note? }
 */
export async function handleAdminDismissPredictiveSignal(req, res) {
  try {
    const { dismissSignal } = await import('../services/predictiveAbuse.js');

    const signalId = req.params.id;
    const note = req.body && typeof req.body.note === 'string'
      ? req.body.note.trim().slice(0, 500)
      : null;

    const adminId = req.user?.id || 'admin_token';
    const result = await dismissSignal(signalId, adminId, note);

    if (!result.ok) {
      const status = result.code === 'SIGNAL_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, { error: result.error, code: result.code });
    }

    logAction({
      adminId,
      action: 'predictive_signal_dismissed',
      targetType: 'predictive_signal',
      targetId: signalId,
      details: { note },
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, signal: result.signal });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في رفض الإشارة', code: 'PREDICTIVE_DISMISS_ERROR' });
  }
}

/**
 * POST /api/admin/predictive-abuse/signals/:id/escalate
 * Body: { note? }
 */
export async function handleAdminEscalatePredictiveSignal(req, res) {
  try {
    const { escalateSignal } = await import('../services/predictiveAbuse.js');

    const signalId = req.params.id;
    const note = req.body && typeof req.body.note === 'string'
      ? req.body.note.trim().slice(0, 500)
      : null;

    const adminId = req.user?.id || 'admin_token';
    const result = await escalateSignal(signalId, adminId, note);

    if (!result.ok) {
      const status = result.code === 'SIGNAL_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, { error: result.error, code: result.code });
    }

    logAction({
      adminId,
      action: 'predictive_signal_escalated',
      targetType: 'predictive_signal',
      targetId: signalId,
      details: { note, severity: result.signal?.severity, riskScore: result.signal?.riskScore },
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, signal: result.signal });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في تصعيد الإشارة', code: 'PREDICTIVE_ESCALATE_ERROR' });
  }
}

// ═══════════════════════════════════════════════════════════════
// Phase 51 — Trust Score V2 + Admin Decision Quality Handlers
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/admin/users/:id/trust-v2
 * Admin-rich Trust Score V2.
 */
export async function handleAdminUserTrustV2(req, res) {
  try {
    const { getTrustScoreV2 } = await import('../services/trustScoreV2.js');

    const result = await getTrustScoreV2(req.params.id, {
      admin: true,
      force: req.query.force === '1' || req.query.force === 'true',
    });

    if (!result) {
      return sendJSON(res, 404, { error: 'المستخدم غير موجود', code: 'USER_NOT_FOUND' });
    }

    return sendJSON(res, 200, { ok: true, trust: result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في حساب مؤشر الثقة V2', code: 'TRUST_V2_ADMIN_ERROR' });
  }
}

/**
 * GET /api/admin/trust/decision-quality?from=&to=&adminId=
 * Admin decision quality dashboard.
 */
export async function handleAdminTrustDecisionQuality(req, res) {
  try {
    const { getDecisionQuality } = await import('../services/adminDecisionAnalytics.js');

    const result = await getDecisionQuality({
      from: req.query.from || undefined,
      to: req.query.to || undefined,
      adminId: req.query.adminId || undefined,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب جودة قرارات الأدمن', code: 'DECISION_QUALITY_ERROR' });
  }
}

/**
 * GET /api/admin/trust/backlog-priority
 * Prioritized review queue.
 */
export async function handleAdminTrustBacklogPriority(req, res) {
  try {
    const { getBacklogPriority } = await import('../services/adminDecisionAnalytics.js');

    const result = await getBacklogPriority({
      limit: parseInt(req.query.limit) || 50,
      includeAbuseFlags: req.query.includeAbuseFlags === 'false' ? false : true,
      includePredictiveSignals: req.query.includePredictiveSignals === 'false' ? false : true,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب أولوية المراجعة', code: 'BACKLOG_PRIORITY_ERROR' });
  }
}
```

---

## `server/handlers/adminSseHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/adminSseHandler.js — Admin SSE Channel (Phase 48)
// ═══════════════════════════════════════════════════════════════
// Self-authenticated SSE for admin events.
// Token via X-Admin-Token header OR ?token= / ?_token= query param.
// Subscribed events:
//   - abuse_flag:snooze_expiring (Phase 47)
//   - abuse_flag:snooze_expired (Phase 47)
//   - abuse_flag:detected_high_severity (Phase 48)
//   - direct_offer:abuse_threshold_crossed (Phase 49)
//   - counters:auto_rebuild_triggered (Phase 48)
//   - csv_export:progress (Phase 49)
//   - predictive_abuse:signal_created (Phase 51)
//   - predictive_abuse:signal_escalated (Phase 51)
//   - predictive_abuse:scan_failed (Phase 51)
//   - ops_queue:job_failed (Phase 52)
//   - ops_queue:job_dead_lettered (Phase 52)
//   - alert_delivery:failed (Phase 52)
//   - alert_delivery:dead_lettered (Phase 52)
//   - export:job_completed (Phase 52)
//   - export:job_failed (Phase 52)
// In-memory connection map per admin, lazy event listener registration.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { eventBus } from '../services/eventBus.js';
import { formatSSE } from '../services/sseManager.js';
import { logger } from '../services/logger.js';

/** @type {Map<string, Set<{ res: any, connectedAt: number }>>} */
const adminConnections = new Map();

const SUBSCRIBED_EVENTS = [
  'abuse_flag:snooze_expiring',
  'abuse_flag:snooze_expired',
  'abuse_flag:detected_high_severity',
  'direct_offer:abuse_threshold_crossed',
  'counters:auto_rebuild_triggered',
  'csv_export:progress', // Phase 49 — streaming CSV export progress
  // Phase 51 — Predictive Abuse Intelligence
  'predictive_abuse:signal_created',
  'predictive_abuse:signal_escalated',
  'predictive_abuse:scan_failed',

  // Phase 52 — Persistent Ops Queue + Alert Delivery
  'ops_queue:job_failed',
  'ops_queue:job_dead_lettered',
  'alert_delivery:failed',
  'alert_delivery:dead_lettered',
  'export:job_completed',
  'export:job_failed',
  'workroom:template_used',

  // Phase 54 — Production Ops
  'ops_rollup:captured',
  'ops_slo:violated',
  'incident:opened',
  'incident:event_appended',
  'incident:resolved',
  'backup_restore_drill:started',
  'backup_restore_drill:passed',
  'backup_restore_drill:failed',
  'process_lock:stale_recovered',
  'process_lock:acquire_failed',
  'scheduler:job_failed',
  'scheduler:job_queued',
  'maintenance:enabled',
  'maintenance:disabled',

  // Phase 55 — Scale Hygiene
  'ops_queue:summary_updated',
  'ops_queue:record_moved',
  'ops_queue:legacy_record_detected',
  'queue:compaction_started',
  'queue:compaction_completed',
  'queue:compaction_failed',
  'queue:idempotency_cleanup_completed',
  'queue:slow_jobs_detected',
  'queue:health_verified',
  'queue:repair_completed',
  'queue:summary_rebuilt',

  'workroom_hygiene:inspection_completed',
  'workroom_hygiene:compaction_completed',
  'workroom_hygiene:attachment_cleanup_completed',
  'workroom_hygiene:warning_detected',
  'workroom_search:verified',
  'workroom_search:repair_completed',

  'audit_index:token_compaction_completed',
  'trust_retention:rollup_created',
  'predictive_archive_index:rebuilt',
  'scheduler:run_history_recorded',
  'scheduler:history_cleanup_completed',

  // Phase 56 — Marketplace/Product Intelligence
  'marketplace_intelligence:rollup_captured',
  'search_analytics:rollup_completed',
  'activation_funnel:rollup_completed',
  'workroom_adoption:rollup_completed',
  'payment_dispute_analytics:rollup_completed',

  // Phase 58 — Governance / Privacy / RBAC
  'admin_approval:created',
  'admin_approval:approved',
  'admin_approval:rejected',
  'admin_approval:expired',
  'admin_approval:consumed',
  'privacy_request:created',
  'privacy_request:queued',
  'privacy_request:completed',
  'privacy_request:failed',
  'privacy_request:cancelled',
  'ops_review:created',
  'ops_review:completed',
  'postmortem:created',
  'postmortem:updated',
  'postmortem:action_item_added',
  'postmortem:action_item_updated',
];

let listenersRegistered = false;

/**
 * Lazy register EventBus listeners on first admin connection.
 * Idempotent — guarded by listenersRegistered flag.
 */
function registerEventListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;
  for (const eventName of SUBSCRIBED_EVENTS) {
    eventBus.on(eventName, (data) => broadcastToAdmins(eventName, data));
  }
  logger.info('Admin SSE: event listeners registered', { count: SUBSCRIBED_EVENTS.length });
}

/**
 * Broadcast an event to all connected admins.
 * Fire-and-forget per connection — write errors silently ignored.
 *
 * @param {string} eventType
 * @param {*} data
 */
function broadcastToAdmins(eventType, data) {
  const eventId = `adm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const msg = formatSSE(eventType, data, eventId);
  for (const [, conns] of adminConnections) {
    for (const entry of conns) {
      try {
        if (!entry.res.writableEnded && !entry.res.destroyed) {
          entry.res.write(msg);
        }
      } catch (_) { /* ignore write errors */ }
    }
  }
}

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function envFlag(name) {
  return process.env[name] === 'true' || process.env[name] === '1';
}

function isAdminSseQueryTokenAllowed() {
  // ADMIN_QUERY_TOKEN_ENABLED is an unsafe umbrella legacy override.
  // ADMIN_SSE_QUERY_TOKEN_ENABLED is the narrower legacy override for EventSource.
  return envFlag('ADMIN_QUERY_TOKEN_ENABLED') || envFlag('ADMIN_SSE_QUERY_TOKEN_ENABLED');
}

/**
 * GET /api/admin/events
 * Self-authenticated SSE endpoint for admin events.
 * Auth: X-Admin-Token header OR ?token= / ?_token= query param.
 */
export async function handleAdminEventStream(req, res) {
  // ── Auth ──
  const headerAdminToken = req.headers['x-admin-token'];
  const queryAdminToken = req.query ? (req.query.token || req.query._token) : null;

  if (queryAdminToken && queryAdminToken === process.env.ADMIN_TOKEN && !isAdminSseQueryTokenAllowed()) {
    return sendJSON(res, 401, {
      error: 'Admin SSE query-token authentication is disabled',
      code: 'ADMIN_SSE_QUERY_TOKEN_DISABLED',
    });
  }

  const adminToken = headerAdminToken || (
    isAdminSseQueryTokenAllowed() ? queryAdminToken : null
  );

  const isValidAdmin =
    (adminToken && adminToken === process.env.ADMIN_TOKEN) ||
    (req.user && req.user.role === 'admin');

  if (!isValidAdmin) {
    return sendJSON(res, 401, { error: 'صلاحيات الأدمن مطلوبة', code: 'ADMIN_REQUIRED' });
  }

  const adminId = (req.user && req.user.id) || 'admin_token';

  // ── Lazy register listeners on first connection ──
  registerEventListeners();

  // ── Write SSE headers ──
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (req.socket) req.socket.setTimeout(0);

  // ── Suggest retry interval ──
  const retryMs = (config.SSE && config.SSE.reconnectMs) || 5000;
  res.write(`retry: ${retryMs}\n\n`);

  // ── Send init event ──
  res.write(formatSSE(
    'init',
    { adminId, subscribedEvents: SUBSCRIBED_EVENTS },
    'adm-init-' + Date.now()
  ));

  // ── Register connection ──
  if (!adminConnections.has(adminId)) {
    adminConnections.set(adminId, new Set());
  }
  const entry = { res, connectedAt: Date.now() };
  adminConnections.get(adminId).add(entry);

  // Phase 49 — Per-connection heartbeat.
  // Keeps admin SSE alive behind load balancers with ~60s idle timeout.
  const heartbeatTimer = setInterval(() => {
    try {
      if (!entry.res.writableEnded && !entry.res.destroyed) {
        entry.res.write(': heartbeat\n\n');
      } else {
        clearInterval(heartbeatTimer);
      }
    } catch (_) {
      clearInterval(heartbeatTimer);
    }
  }, 30000);
  if (heartbeatTimer.unref) heartbeatTimer.unref();

  // ── Cleanup on close ──
  res.on('close', () => {
    clearInterval(heartbeatTimer);
    const conns = adminConnections.get(adminId);
    if (conns) {
      conns.delete(entry);
      if (conns.size === 0) adminConnections.delete(adminId);
    }
  });
}

/**
 * Get aggregate admin connection stats.
 * @returns {{ admins: number, totalConnections: number }}
 */
export function getAdminConnectionStats() {
  let total = 0;
  for (const [, conns] of adminConnections) total += conns.size;
  return { admins: adminConnections.size, totalConnections: total };
}

// Test helpers
export const _testHelpers = {
  adminConnections,
  SUBSCRIBED_EVENTS,
  broadcastToAdmins,
  envFlag,
  isAdminSseQueryTokenAllowed,
  resetState: () => {
    adminConnections.clear();
    listenersRegistered = false;
  },
};
```

---

## `server/handlers/alertsHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/alertsHandler.js — Job Alert API Handlers
// ═══════════════════════════════════════════════════════════════

import { createAlert, listByUser, deleteAlert, toggleAlert } from '../services/jobAlerts.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const ERROR_STATUS = {
  ALERTS_DISABLED: 503,
  NAME_REQUIRED: 400,
  CRITERIA_REQUIRED: 400,
  CATEGORIES_REQUIRED: 400,
  INVALID_CATEGORY: 400,
  INVALID_GOVERNORATE: 400,
  INVALID_MIN_WAGE: 400,
  INVALID_MAX_WAGE: 400,
  INVALID_WAGE_RANGE: 400,
  MAX_ALERTS_REACHED: 429,
  ALERT_NOT_FOUND: 404,
  NOT_ALERT_OWNER: 403,
};

function errorStatus(code) {
  return ERROR_STATUS[code] || 400;
}

/**
 * POST /api/alerts
 * Create a new job alert
 * Requires: requireAuth
 */
export async function handleCreateAlert(req, res) {
  try {
    const body = req.body || {};
    const result = await createAlert(req.user.id, {
      name: body.name,
      criteria: body.criteria,
    });

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 201, { ok: true, alert: result.alert });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/alerts
 * List my job alerts
 * Requires: requireAuth
 */
export async function handleListMyAlerts(req, res) {
  try {
    const alerts = await listByUser(req.user.id);
    sendJSON(res, 200, { ok: true, alerts, count: alerts.length });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * DELETE /api/alerts/:id
 * Delete a job alert
 * Requires: requireAuth
 */
export async function handleDeleteAlert(req, res) {
  try {
    const alertId = req.params.id;
    const result = await deleteAlert(alertId, req.user.id);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 200, { ok: true });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * PUT /api/alerts/:id
 * Toggle alert enabled/disabled
 * Requires: requireAuth
 */
export async function handleToggleAlert(req, res) {
  try {
    const alertId = req.params.id;
    const body = req.body || {};

    if (typeof body.enabled !== 'boolean') {
      return sendJSON(res, 400, { error: 'الحقل enabled مطلوب (true أو false)', code: 'ENABLED_REQUIRED' });
    }

    const result = await toggleAlert(alertId, req.user.id, body.enabled);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 200, { ok: true, alert: result.alert });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}
```

---

## `server/handlers/analyticsHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/analyticsHandler.js — Analytics, Export, Monitoring
// ═══════════════════════════════════════════════════════════════

import { getEmployerAnalytics, getWorkerAnalytics, getPlatformAnalytics } from '../services/analytics.js';
import { exportPaymentsCSV, exportJobsCSV, exportUsersCSV, generateReceipt } from '../services/financialExport.js';
import { getSnapshots, checkThresholds } from '../services/monitor.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendCSV(res, csv, filename) {
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': Buffer.byteLength(csv, 'utf-8'),
  });
  res.end(csv);
}

function parseDateRange(query) {
  const from = query.from || '';
  const to = query.to || '';
  return { from: from || undefined, to: to || undefined };
}

// ── Analytics Endpoints ──────────────────────────────────────

/**
 * GET /api/analytics/employer
 */
export async function handleEmployerAnalytics(req, res) {
  try {
    const { from, to } = parseDateRange(req.query);
    const analytics = await getEmployerAnalytics(req.user.id, { from, to });
    sendJSON(res, 200, { ok: true, analytics });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في جلب التحليلات', code: 'ANALYTICS_ERROR' });
  }
}

/**
 * GET /api/analytics/worker
 */
export async function handleWorkerAnalytics(req, res) {
  try {
    const { from, to } = parseDateRange(req.query);
    const analytics = await getWorkerAnalytics(req.user.id, { from, to });
    sendJSON(res, 200, { ok: true, analytics });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في جلب التحليلات', code: 'ANALYTICS_ERROR' });
  }
}

/**
 * GET /api/admin/analytics
 */
export async function handlePlatformAnalytics(req, res) {
  try {
    const { from, to } = parseDateRange(req.query);
    const analytics = await getPlatformAnalytics({ from, to });
    sendJSON(res, 200, { ok: true, analytics });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في جلب تحليلات المنصة', code: 'PLATFORM_ANALYTICS_ERROR' });
  }
}

// ── Export Endpoints ─────────────────────────────────────────

/**
 * GET /api/admin/export/payments
 */
export async function handleExportPayments(req, res) {
  try {
    const filters = {
      from: req.query.from,
      to: req.query.to,
      status: req.query.status,
    };
    const result = await exportPaymentsCSV(filters);
    sendCSV(res, result.csv, result.filename);
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في تصدير المدفوعات', code: 'EXPORT_ERROR' });
  }
}

/**
 * GET /api/admin/export/jobs
 */
export async function handleExportJobs(req, res) {
  try {
    const filters = {
      from: req.query.from,
      to: req.query.to,
      status: req.query.status,
      governorate: req.query.governorate,
      category: req.query.category,
    };
    const result = await exportJobsCSV(filters);
    sendCSV(res, result.csv, result.filename);
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في تصدير الفرص', code: 'EXPORT_ERROR' });
  }
}

/**
 * GET /api/admin/export/users
 */
export async function handleExportUsers(req, res) {
  try {
    const filters = {
      role: req.query.role,
      status: req.query.status,
      governorate: req.query.governorate,
      from: req.query.from,
      to: req.query.to,
    };
    const result = await exportUsersCSV(filters);
    sendCSV(res, result.csv, result.filename);
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في تصدير المستخدمين', code: 'EXPORT_ERROR' });
  }
}

/**
 * GET /api/employer/export/payments — employer-scoped
 */
export async function handleEmployerExportPayments(req, res) {
  try {
    const filters = {
      employerId: req.user.id,
      from: req.query.from,
      to: req.query.to,
    };
    const result = await exportPaymentsCSV(filters);
    sendCSV(res, result.csv, result.filename);
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في تصدير المدفوعات', code: 'EXPORT_ERROR' });
  }
}

// ── Receipt Endpoint ─────────────────────────────────────────

/**
 * GET /api/jobs/:id/receipt
 */
export async function handleGetReceipt(req, res) {
  try {
    const jobId = req.params.id;

    // Load job to verify access
    const { findById: findJob } = await import('../services/jobs.js');
    const job = await findJob(jobId);
    if (!job) {
      return sendJSON(res, 404, { error: 'الفرصة غير موجودة', code: 'JOB_NOT_FOUND' });
    }

    // Job must be completed
    if (job.status !== 'completed') {
      return sendJSON(res, 400, { error: 'الفرصة لازم تكون مكتملة', code: 'JOB_NOT_COMPLETED' });
    }

    // Access check: employer who owns job OR accepted worker
    const userId = req.user.id;
    let allowed = false;

    if (job.employerId === userId) {
      allowed = true;
    } else {
      const { listByJob: listApps } = await import('../services/applications.js');
      const apps = await listApps(jobId);
      allowed = apps.some(a => a.workerId === userId && a.status === 'accepted');
    }

    if (!allowed) {
      return sendJSON(res, 403, { error: 'مش مسموحلك تشوف إيصال هذه الفرصة', code: 'NOT_AUTHORIZED' });
    }

    // Find payment for this job
    const { listByJob: listPayments } = await import('../services/payments.js');
    const payments = await listPayments(jobId);
    if (payments.length === 0) {
      return sendJSON(res, 404, { error: 'لا يوجد سجل دفع لهذه الفرصة', code: 'PAYMENT_NOT_FOUND' });
    }

    const receipt = await generateReceipt(payments[0].id);
    if (!receipt) {
      return sendJSON(res, 500, { error: 'خطأ في إنشاء الإيصال', code: 'RECEIPT_ERROR' });
    }

    sendJSON(res, 200, { ok: true, receipt });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في جلب الإيصال', code: 'RECEIPT_ERROR' });
  }
}

// ── Monitoring Endpoints ─────────────────────────────────────

/**
 * GET /api/admin/monitoring
 */
export async function handleGetMonitoring(req, res) {
  try {
    const options = {
      from: req.query.from,
      to: req.query.to,
      limit: parseInt(req.query.limit) || 24,
    };
    const snapshots = await getSnapshots(options);
    sendJSON(res, 200, { ok: true, snapshots, count: snapshots.length });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في جلب بيانات المراقبة', code: 'MONITORING_ERROR' });
  }
}

/**
 * GET /api/admin/monitoring/latest
 */
export async function handleGetLatestSnapshot(req, res) {
  try {
    const snapshots = await getSnapshots({ limit: 1 });
    if (snapshots.length === 0) {
      return sendJSON(res, 200, { ok: true, snapshot: null, alerts: [] });
    }
    const snapshot = snapshots[0];
    const alerts = checkThresholds(snapshot);
    sendJSON(res, 200, { ok: true, snapshot, alerts });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في جلب آخر snapshot', code: 'MONITORING_ERROR' });
  }
}

/**
 * GET /api/admin/errors
 */
export async function handleGetErrors(req, res) {
  try {
    const { getErrorSummary } = await import('../services/errorAggregator.js');
    const summary = getErrorSummary();
    sendJSON(res, 200, { ok: true, ...summary });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في جلب ملخص الأخطاء', code: 'ERROR_SUMMARY_ERROR' });
  }
}
```

---

## `server/handlers/applicationsHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/applicationsHandler.js — Application Endpoints
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { apply, accept, reject, listByJob, listByWorker, withdraw, countTodayByWorker, workerConfirm, workerDecline } from '../services/applications.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * POST /api/jobs/:id/apply
 * Requires: auth (worker)
 */
export async function handleApplyToJob(req, res) {
  const jobId = req.params.id;
  const workerId = req.user.id;

  // Daily limit enforcement (non-blocking — allows on count failure)
  try {
    const todayCount = await countTodayByWorker(workerId);
    if (todayCount >= config.LIMITS.maxApplicationsPerWorkerPerDay) {
      return sendJSON(res, 429, { error: 'وصلت للحد الأقصى للتقديم على الفرص اليوم', code: 'DAILY_APPLICATION_LIMIT' });
    }
  } catch (_) {
    // Non-blocking: allow action if count check fails
  }

  try {
    const result = await apply(jobId, workerId);
    if (!result.ok) {
      return sendJSON(res, 400, result);
    }
    return sendJSON(res, 201, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في التقديم على الفرصة', code: 'APPLY_ERROR' });
  }
}

/**
 * POST /api/jobs/:id/accept
 * Body: { applicationId }
 * Requires: auth (employer, owns job)
 */
export async function handleAcceptWorker(req, res) {
  const { applicationId } = req.body || {};

  if (!applicationId) {
    return sendJSON(res, 400, { error: 'معرّف الطلب مطلوب', code: 'MISSING_APPLICATION_ID' });
  }

  try {
    const result = await accept(applicationId, req.user.id);
    if (!result.ok) {
      return sendJSON(res, 400, result);
    }
    return sendJSON(res, 200, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في قبول العامل', code: 'ACCEPT_ERROR' });
  }
}

/**
 * POST /api/jobs/:id/reject
 * Body: { applicationId }
 * Requires: auth (employer, owns job)
 */
export async function handleRejectWorker(req, res) {
  const { applicationId } = req.body || {};

  if (!applicationId) {
    return sendJSON(res, 400, { error: 'معرّف الطلب مطلوب', code: 'MISSING_APPLICATION_ID' });
  }

  try {
    const result = await reject(applicationId, req.user.id);
    if (!result.ok) {
      return sendJSON(res, 400, result);
    }
    return sendJSON(res, 200, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في رفض العامل', code: 'REJECT_ERROR' });
  }
}

/**
 * GET /api/jobs/:id/applications
 * Requires: auth (employer, owns job)
 * Returns: enriched applications with worker info
 */
export async function handleListJobApplications(req, res) {
  const jobId = req.params.id;

  try {
    // Dynamic imports to avoid circular dependencies
    const { findById: findJobById } = await import('../services/jobs.js');
    const { findById: findUserById } = await import('../services/users.js');

    const job = await findJobById(jobId);
    if (!job) {
      return sendJSON(res, 404, { error: 'الفرصة غير موجودة', code: 'JOB_NOT_FOUND' });
    }

    // Ownership check
    if (job.employerId !== req.user.id) {
      return sendJSON(res, 403, { error: 'مش مسموحلك تشوف طلبات هذه الفرصة', code: 'NOT_JOB_OWNER' });
    }

    const applications = await listByJob(jobId);

    // Enrich with worker info
    const enriched = [];
    for (const app of applications) {
      const worker = await findUserById(app.workerId);
      enriched.push({
        ...app,
        worker: worker ? {
          id: worker.id,
          name: worker.name || 'بدون اسم',
          phone: worker.phone,
          governorate: worker.governorate || '',
          categories: worker.categories || [],
          rating: worker.rating || { avg: 0, count: 0 },
          verificationStatus: worker.verificationStatus || 'unverified',
        } : { id: app.workerId, name: 'مستخدم محذوف', phone: '', governorate: '', categories: [], rating: { avg: 0, count: 0 }, verificationStatus: 'unverified' },
      });
    }

    return sendJSON(res, 200, { ok: true, applications: enriched, count: enriched.length });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب طلبات الفرصة', code: 'LIST_JOB_APPS_ERROR' });
  }
}

/**
 * GET /api/applications/mine
 * Requires: auth (worker)
 * Returns: worker's applications enriched with job info
 */
export async function handleListMyApplications(req, res) {
  try {
    const { findById: findJobById } = await import('../services/jobs.js');

    const applications = await listByWorker(req.user.id);

    // Sort by newest first
    applications.sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));

    // Enrich with job info
    const enriched = [];
    for (const app of applications) {
      const job = await findJobById(app.jobId);
      enriched.push({
        ...app,
        job: job ? {
          id: job.id,
          title: job.title,
          category: job.category,
          governorate: job.governorate,
          dailyWage: job.dailyWage,
          status: job.status,
          employerId: job.employerId,
          startDate: job.startDate,
          durationDays: job.durationDays,
        } : null,
      });
    }

    return sendJSON(res, 200, { ok: true, applications: enriched, count: enriched.length });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب طلباتك', code: 'LIST_MY_APPS_ERROR' });
  }
}

/**
 * POST /api/applications/:id/withdraw
 * Requires: auth (worker, owns application, status=pending)
 */
export async function handleWithdrawApplication(req, res) {
  const applicationId = req.params.id;

  try {
    const result = await withdraw(applicationId, req.user.id);
    if (!result.ok) {
      const status = result.code === 'APPLICATION_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, result);
    }
    return sendJSON(res, 200, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في سحب الطلب', code: 'WITHDRAW_ERROR' });
  }
}

/**
 * POST /api/applications/:id/confirm
 * Worker confirms acceptance (two-phase)
 * Requires: auth (worker)
 */
export async function handleWorkerConfirm(req, res) {
  const applicationId = req.params.id;

  try {
    const result = await workerConfirm(applicationId, req.user.id);
    if (!result.ok) {
      const statusMap = { APPLICATION_NOT_FOUND: 404, NOT_APPLICATION_OWNER: 403, INVALID_STATUS: 400, DEADLINE_PASSED: 400 };
      const status = statusMap[result.code] || 400;
      return sendJSON(res, status, result);
    }
    return sendJSON(res, 200, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في تأكيد الطلب', code: 'CONFIRM_ERROR' });
  }
}

/**
 * POST /api/applications/:id/decline
 * Worker declines acceptance (two-phase)
 * Requires: auth (worker)
 */
export async function handleWorkerDecline(req, res) {
  const applicationId = req.params.id;

  try {
    const result = await workerDecline(applicationId, req.user.id);
    if (!result.ok) {
      const statusMap = { APPLICATION_NOT_FOUND: 404, NOT_APPLICATION_OWNER: 403, INVALID_STATUS: 400 };
      const status = statusMap[result.code] || 400;
      return sendJSON(res, status, result);
    }
    return sendJSON(res, 200, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في رفض الطلب', code: 'DECLINE_ERROR' });
  }
}
```

---

## `server/handlers/attendanceHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/attendanceHandler.js — Attendance API Handlers
// ═══════════════════════════════════════════════════════════════

import {
  checkIn, checkOut, confirmAttendance, reportNoShow,
  listByJob, getJobSummary,
} from '../services/attendance.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Error code → HTTP status mapping
 */
const ERROR_STATUS = {
  ATTENDANCE_DISABLED: 503,
  MANUAL_CHECKIN_DISABLED: 503,
  JOB_NOT_FOUND: 404,
  JOB_NOT_IN_PROGRESS: 400,
  NOT_ACCEPTED_WORKER: 403,
  ALREADY_CHECKED_IN: 409,
  GPS_REQUIRED: 400,
  TOO_FAR_FROM_JOB: 400,
  NOT_CHECKED_IN: 400,
  INVALID_ATTENDANCE_STATUS: 400,
  ATTENDANCE_NOT_FOUND: 404,
  NOT_JOB_OWNER: 403,
  ALREADY_CONFIRMED: 409,
  NOT_ACCEPTED_WORKER: 400,
  WORKER_ALREADY_CHECKED_IN: 409,
};

function errorStatus(code) {
  return ERROR_STATUS[code] || 400;
}

/**
 * POST /api/jobs/:id/checkin — Worker GPS check-in
 */
export async function handleCheckIn(req, res) {
  try {
    const jobId = req.params.id;
    const workerId = req.user.id;
    const body = req.body || {};

    const result = await checkIn(jobId, workerId, {
      lat: typeof body.lat === 'number' ? body.lat : undefined,
      lng: typeof body.lng === 'number' ? body.lng : undefined,
    });

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 201, { ok: true, attendance: result.attendance });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * POST /api/jobs/:id/checkout — Worker check-out
 */
export async function handleCheckOut(req, res) {
  try {
    const jobId = req.params.id;
    const workerId = req.user.id;
    const body = req.body || {};

    const result = await checkOut(jobId, workerId, {
      lat: typeof body.lat === 'number' ? body.lat : undefined,
      lng: typeof body.lng === 'number' ? body.lng : undefined,
    });

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 200, { ok: true, attendance: result.attendance });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * POST /api/attendance/:id/confirm — Employer confirms attendance
 */
export async function handleConfirmAttendance(req, res) {
  try {
    const attendanceId = req.params.id;
    const employerId = req.user.id;

    const result = await confirmAttendance(attendanceId, employerId);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 200, { ok: true, attendance: result.attendance });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * POST /api/jobs/:id/no-show — Employer reports worker absence
 */
export async function handleReportNoShow(req, res) {
  try {
    const jobId = req.params.id;
    const employerId = req.user.id;
    const body = req.body || {};

    if (!body.workerId || typeof body.workerId !== 'string') {
      return sendJSON(res, 400, { error: 'معرّف العامل مطلوب', code: 'WORKER_ID_REQUIRED' });
    }

    const result = await reportNoShow(jobId, body.workerId, employerId);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 201, { ok: true, attendance: result.attendance });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * POST /api/jobs/:id/manual-checkin — Employer manual check-in for worker
 */
export async function handleEmployerCheckIn(req, res) {
  try {
    const jobId = req.params.id;
    const employerId = req.user.id;
    const body = req.body || {};

    if (!body.workerId || typeof body.workerId !== 'string') {
      return sendJSON(res, 400, { error: 'معرّف العامل مطلوب', code: 'WORKER_ID_REQUIRED' });
    }

    const { employerCheckIn } = await import('../services/attendance.js');
    const result = await employerCheckIn(jobId, body.workerId, employerId);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 201, { ok: true, attendance: result.attendance });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/jobs/:id/attendance — List attendance records for a job
 */
export async function handleListJobAttendance(req, res) {
  try {
    const jobId = req.params.id;
    const date = req.query.date || undefined;

    const records = await listByJob(jobId, { date });

    sendJSON(res, 200, { ok: true, records, total: records.length });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/jobs/:id/attendance/summary — Attendance summary for a job
 */
export async function handleJobAttendanceSummary(req, res) {
  try {
    const jobId = req.params.id;

    const summary = await getJobSummary(jobId);

    sendJSON(res, 200, { ok: true, summary });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}
```

---

## `server/handlers/authHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/authHandler.js — Auth Endpoints
// ═══════════════════════════════════════════════════════════════

import { sendOtp, verifyOtp } from '../services/auth.js';
import { update as updateUser, findById } from '../services/users.js';
import { destroySession } from '../services/sessions.js';
import { validatePhone, validateOtp, validateRole, validateProfileFields, validateLatitude, validateLongitude } from '../services/validators.js';
import { sanitizeFields } from '../services/sanitizer.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * POST /api/auth/send-otp
 * Body: { phone, role }
 */
export async function handleSendOtp(req, res) {
  const { phone, role } = req.body || {};

  const phoneResult = validatePhone(phone);
  if (!phoneResult.valid) {
    return sendJSON(res, 400, { error: phoneResult.error, code: 'INVALID_PHONE' });
  }

  const roleResult = validateRole(role);
  if (!roleResult.valid) {
    return sendJSON(res, 400, { error: roleResult.error, code: 'INVALID_ROLE' });
  }

  // Don't allow admin registration via OTP
  if (role === 'admin') {
    return sendJSON(res, 403, { error: 'لا يمكن تسجيل حساب أدمن من هنا', code: 'ADMIN_REGISTRATION_FORBIDDEN' });
  }

  try {
    const result = await sendOtp(phone, role);
    if (!result.ok) {
      const statusCode = result.code === 'PHONE_OTP_RATE_LIMITED' ? 429 : 400;
      return sendJSON(res, statusCode, result);
    }
    return sendJSON(res, 200, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إرسال الكود', code: 'OTP_SEND_ERROR' });
  }
}

/**
 * POST /api/auth/verify-otp
 * Body: { phone, otp }
 */
export async function handleVerifyOtp(req, res) {
  const { phone, otp } = req.body || {};

  const phoneResult = validatePhone(phone);
  if (!phoneResult.valid) {
    return sendJSON(res, 400, { error: phoneResult.error, code: 'INVALID_PHONE' });
  }

  const otpResult = validateOtp(otp);
  if (!otpResult.valid) {
    return sendJSON(res, 400, { error: otpResult.error, code: 'INVALID_OTP' });
  }

  try {
    // Extract metadata for session tracking
    const sessionMetadata = {
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || '',
    };
    const result = await verifyOtp(phone, otp, sessionMetadata);
    if (!result.ok) {
      return sendJSON(res, 401, result);
    }
    return sendJSON(res, 200, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في التحقق من الكود', code: 'OTP_VERIFY_ERROR' });
  }
}

/**
 * GET /api/auth/me
 * Requires: auth token
 */
export async function handleGetMe(req, res) {
  const user = req.user;

  // Calculate profile completeness
  let profileCompleteness = null;
  try {
    const { calculateCompleteness } = await import('../services/profileCompleteness.js');
    profileCompleteness = calculateCompleteness(user);
  } catch (_) {
    // Non-blocking — completeness is optional enrichment
  }

  return sendJSON(res, 200, {
    ok: true,
    user: {
      id: user.id,
      phone: user.phone,
      role: user.role,
      name: user.name,
      governorate: user.governorate,
      categories: user.categories,
      lat: user.lat || null,
      lng: user.lng || null,
      rating: user.rating,
      status: user.status,
      notificationPreferences: user.notificationPreferences || null,
      availability: user.availability || null,
      createdAt: user.createdAt,
      profileCompleteness: profileCompleteness,
    },
  });
}

/**
 * PUT /api/auth/profile
 * Body: { name?, governorate?, categories? }
 * Requires: auth token
 */
export async function handleUpdateProfile(req, res) {
  const userId = req.user.id;
  const body = req.body || {};

  const result = validateProfileFields(body, req.user.role);
  if (!result.valid) {
    return sendJSON(res, 400, { error: result.errors.join('. '), code: 'INVALID_PROFILE' });
  }

  // Sanitize + build update fields
  const sanitized = sanitizeFields(body, ['name']);
  const updateFields = {};
  if (sanitized.name !== undefined) updateFields.name = sanitized.name.trim();
  if (body.governorate !== undefined) updateFields.governorate = body.governorate;
  if (body.categories !== undefined) updateFields.categories = body.categories;

  // Validate and add lat/lng if provided
  if (body.lat !== undefined && body.lat !== null && body.lat !== '') {
    const latResult = validateLatitude(body.lat);
    if (!latResult.valid) {
      return sendJSON(res, 400, { error: latResult.error, code: 'INVALID_LATITUDE' });
    }
    updateFields.lat = latResult.value;
  }
  if (body.lng !== undefined && body.lng !== null && body.lng !== '') {
    const lngResult = validateLongitude(body.lng);
    if (!lngResult.valid) {
      return sendJSON(res, 400, { error: lngResult.error, code: 'INVALID_LONGITUDE' });
    }
    updateFields.lng = lngResult.value;
  }

  // Handle availability update (workers only)
  if (body.availability && typeof body.availability === 'object' && req.user.role === 'worker') {
    const currentAvailability = req.user.availability || {};
    const updatedAvailability = {
      available: typeof body.availability.available === 'boolean'
        ? body.availability.available
        : (currentAvailability.available !== undefined ? currentAvailability.available : true),
      availableFrom: body.availability.availableFrom || currentAvailability.availableFrom || null,
      availableUntil: body.availability.availableUntil || currentAvailability.availableUntil || null,
      updatedAt: new Date().toISOString(),
    };
    updateFields.availability = updatedAvailability;
  }

  // Handle notification preferences update
  if (body.notificationPreferences && typeof body.notificationPreferences === 'object') {
    const { updateNotificationPreferences } = await import('../services/users.js');
    const prefsResult = await updateNotificationPreferences(userId, body.notificationPreferences);
    if (prefsResult) {
      if (Object.keys(updateFields).length === 0) {
        return sendJSON(res, 200, {
          ok: true,
          user: {
            id: prefsResult.id,
            phone: prefsResult.phone,
            role: prefsResult.role,
            name: prefsResult.name,
            governorate: prefsResult.governorate,
            categories: prefsResult.categories,
            lat: prefsResult.lat || null,
            lng: prefsResult.lng || null,
            rating: prefsResult.rating,
            status: prefsResult.status,
            notificationPreferences: prefsResult.notificationPreferences || null,
          },
        });
      }
    }
  }

  if (Object.keys(updateFields).length === 0) {
    return sendJSON(res, 400, { error: 'لا توجد بيانات للتحديث', code: 'NO_FIELDS' });
  }

  try {
    const updatedUser = await updateUser(userId, updateFields);
    if (!updatedUser) {
      return sendJSON(res, 404, { error: 'المستخدم غير موجود', code: 'USER_NOT_FOUND' });
    }
    return sendJSON(res, 200, {
      ok: true,
      user: {
        id: updatedUser.id,
        phone: updatedUser.phone,
        role: updatedUser.role,
        name: updatedUser.name,
        governorate: updatedUser.governorate,
        categories: updatedUser.categories,
        lat: updatedUser.lat || null,
        lng: updatedUser.lng || null,
        rating: updatedUser.rating,
        status: updatedUser.status,
        notificationPreferences: updatedUser.notificationPreferences || null,
      },
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في تحديث البيانات', code: 'UPDATE_ERROR' });
  }
}

/**
 * POST /api/auth/logout
 * Requires: auth token
 */
export async function handleLogout(req, res) {
  try {
    await destroySession(req.session.token);
    return sendJSON(res, 200, { ok: true, message: 'تم تسجيل الخروج' });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في تسجيل الخروج', code: 'LOGOUT_ERROR' });
  }
}

/**
 * POST /api/auth/logout-all — Destroy all sessions for the current user
 */
export async function handleLogoutAll(req, res) {
  try {
    const { destroyAllByUser } = await import('../services/sessions.js');
    const destroyed = await destroyAllByUser(req.user.id);

    return sendJSON(res, 200, {
      ok: true,
      message: 'تم تسجيل الخروج من كل الأجهزة',
      sessionsDestroyed: destroyed,
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * POST /api/auth/accept-terms
 * Accept terms of service
 * Requires: auth token
 */
export async function handleAcceptTerms(req, res) {
  try {
    const { default: config } = await import('../../config.js');
    const { acceptTerms } = await import('../services/users.js');

    const updatedUser = await acceptTerms(req.user.id, config.TRUST.termsVersion);
    if (!updatedUser) {
      return sendJSON(res, 404, { error: 'المستخدم غير موجود', code: 'USER_NOT_FOUND' });
    }

    return sendJSON(res, 200, {
      ok: true,
      message: 'تم قبول الشروط والأحكام',
      termsVersion: updatedUser.termsVersion,
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ داخلي', code: 'INTERNAL_ERROR' });
  }
}

/**
 * DELETE /api/auth/account
 * Soft-delete user account
 * Requires: auth token
 */
export async function handleDeleteAccount(req, res) {
  try {
    const { softDelete } = await import('../services/users.js');
    const { destroyAllByUser } = await import('../services/sessions.js');

    const deletedUser = await softDelete(req.user.id);
    if (!deletedUser) {
      return sendJSON(res, 400, { error: 'لا يمكن حذف هذا الحساب', code: 'DELETE_FAILED' });
    }

    // Destroy all sessions (fire-and-forget)
    await destroyAllByUser(req.user.id).catch(() => {});

    return sendJSON(res, 200, {
      ok: true,
      message: 'تم حذف الحساب. بياناتك هتتحذف نهائياً خلال 90 يوم.',
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في حذف الحساب', code: 'DELETE_ACCOUNT_ERROR' });
  }
}
```

---

## `server/handlers/availabilityAdHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/availabilityAdHandler.js — Ad CRUD Endpoints
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import {
  createAd, withdrawAd, findById, listByWorker,
  incrementViewCount, getStats,
} from '../services/availabilityAd.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const ERROR_STATUS = {
  ADS_DISABLED: 503,
  INVALID_FIELDS: 400,
  INVALID_CATEGORIES: 400,
  INVALID_GOVERNORATE: 400,
  INVALID_GEO: 400,
  INVALID_RADIUS: 400,
  INVALID_WAGE_RANGE: 400,
  INVALID_TIME_WINDOW: 400,
  NOTES_TOO_LONG: 400,
  DAILY_AD_LIMIT: 429,
  AD_NOT_FOUND: 404,
  NOT_OWNER: 403,
  INVALID_STATUS: 400,
};

function errorStatus(code) {
  return ERROR_STATUS[code] || 400;
}

/**
 * POST /api/availability-ads
 * Body: { categories, governorate, lat, lng, radiusKm, minDailyWage, maxDailyWage, availableFrom, availableUntil, notes? }
 * Requires: requireAuth + requireRole('worker')
 */
export async function handleCreateAd(req, res) {
  try {
    const workerId = req.user.id;
    const body = req.body || {};

    const result = await createAd(workerId, {
      categories: body.categories,
      governorate: body.governorate,
      lat: body.lat,
      lng: body.lng,
      radiusKm: body.radiusKm,
      minDailyWage: body.minDailyWage,
      maxDailyWage: body.maxDailyWage,
      availableFrom: body.availableFrom,
      availableUntil: body.availableUntil,
      notes: body.notes,
    });

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 201, { ok: true, ad: result.ad });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/availability-ads/mine
 * Lists worker's own ads (all statuses, newest first)
 * Requires: requireAuth + requireRole('worker')
 */
export async function handleListMyAds(req, res) {
  try {
    const workerId = req.user.id;
    const ads = await listByWorker(workerId);
    sendJSON(res, 200, { ok: true, ads, count: ads.length });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * DELETE /api/availability-ads/:id
 * Withdraw an active ad
 * Requires: requireAuth + requireRole('worker')
 */
export async function handleWithdrawAd(req, res) {
  try {
    const adId = req.params.id;
    const workerId = req.user.id;

    const result = await withdrawAd(adId, workerId);
    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 200, { ok: true, ad: result.ad });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/availability-ads/:id
 * View a single ad. If viewer is an employer, increments viewCount.
 * Requires: requireAuth
 */
export async function handleGetAd(req, res) {
  try {
    const adId = req.params.id;
    const ad = await findById(adId);

    if (!ad) {
      return sendJSON(res, 404, { error: 'الإعلان غير موجود', code: 'AD_NOT_FOUND' });
    }

    // Increment viewCount if viewer is an employer (not the ad owner)
    if (req.user && req.user.role === 'employer' && req.user.id !== ad.workerId) {
      incrementViewCount(adId).catch(() => { /* fire-and-forget */ });
    }

    sendJSON(res, 200, { ok: true, ad });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/admin/availability-ads/stats
 * Admin stats endpoint
 * Requires: requireAdmin
 */
export async function handleAdStats(req, res) {
  try {
    const stats = await getStats();
    sendJSON(res, 200, { ok: true, stats });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في جلب إحصائيات الإعلانات', code: 'AD_STATS_ERROR' });
  }
}
```

---

## `server/handlers/availabilityHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/availabilityHandler.js — Availability Windows CRUD
// ═══════════════════════════════════════════════════════════════

import { createWindow, listByUser, deleteWindow } from '../services/availabilityWindow.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const ERROR_STATUS = {
  WINDOWS_DISABLED: 503,
  INVALID_FIELDS: 400,
  INVALID_TYPE: 400,
  DAYS_REQUIRED: 400,
  INVALID_DAYS: 400,
  INVALID_START_HOUR: 400,
  INVALID_END_HOUR: 400,
  INVALID_HOUR_RANGE: 400,
  START_AT_REQUIRED: 400,
  END_AT_REQUIRED: 400,
  INVALID_DATE_FORMAT: 400,
  INVALID_TIME_RANGE: 400,
  MAX_WINDOWS_REACHED: 429,
  WINDOW_NOT_FOUND: 404,
  NOT_WINDOW_OWNER: 403,
};

function errorStatus(code) {
  return ERROR_STATUS[code] || 400;
}

/**
 * POST /api/availability/windows
 * Body: { type, daysOfWeek?, startHour?, endHour?, startAt?, endAt?, enabled? }
 * Requires: requireAuth + requireRole('worker')
 */
export async function handleCreateWindow(req, res) {
  try {
    const userId = req.user.id;
    const body = req.body || {};
    const result = await createWindow(userId, body);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 201, { ok: true, window: result.window });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/availability/windows
 * Requires: requireAuth + requireRole('worker')
 */
export async function handleListWindows(req, res) {
  try {
    const userId = req.user.id;
    const windows = await listByUser(userId);
    sendJSON(res, 200, { ok: true, windows, count: windows.length });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * DELETE /api/availability/windows/:id
 * Requires: requireAuth + requireRole('worker')
 */
export async function handleDeleteWindow(req, res) {
  try {
    const userId = req.user.id;
    const windowId = req.params.id;
    const result = await deleteWindow(windowId, userId);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 200, { ok: true });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}
```

---

## `server/handlers/directOfferHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/directOfferHandler.js — Direct Offer Endpoints
// ═══════════════════════════════════════════════════════════════

import {
  create, tryAccept, decline, withdraw, findById, listByEmployer, listByWorker,
  redactOfferForViewer, getEmployerOfferStats, getWorkerOfferStats,
} from '../services/directOffer.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const ERROR_STATUS = {
  OFFERS_DISABLED: 503,
  SELF_OFFER: 400,
  INVALID_EMPLOYER: 403,
  INVALID_WORKER: 404,
  INVALID_FIELDS: 400,
  INVALID_CATEGORY: 400,
  INVALID_GOVERNORATE: 400,
  INVALID_WAGE: 400,
  INVALID_START_DATE: 400,
  INVALID_DURATION: 400,
  MESSAGE_TOO_LONG: 400,
  CONTENT_BLOCKED: 400,
  EMPLOYER_PENDING_CAP: 429,
  WORKER_PENDING_CAP: 429,
  EMPLOYER_DAILY_CAP: 429,
  DUPLICATE_PENDING: 409,
  INVALID_AD: 400,
  OFFER_NOT_FOUND: 404,
  NOT_OFFER_RECIPIENT: 403,
  NOT_OFFER_OWNER: 403,
  OFFER_NOT_PENDING: 409,
  OFFER_EXPIRED: 410,
  USER_DELETED: 410,
  JOB_CREATION_FAILED: 500,
  APP_CREATION_FAILED: 500,
  INVALID_REASON: 400,
};

function errorStatus(code) {
  return ERROR_STATUS[code] || 400;
}

/**
 * POST /api/direct-offers
 * Body: { workerId, adId?, category, governorate, proposedDailyWage, proposedStartDate, proposedDurationDays?, message? }
 * Requires: requireAuth + requireRole('employer')
 */
export async function handleCreateOffer(req, res) {
  try {
    const employerId = req.user.id;
    const body = req.body || {};

    if (!body.workerId || typeof body.workerId !== 'string') {
      return sendJSON(res, 400, { error: 'معرّف العامل مطلوب', code: 'WORKER_ID_REQUIRED' });
    }

    const result = await create(employerId, body.workerId, {
      adId: body.adId || null,
      category: body.category,
      governorate: body.governorate,
      proposedDailyWage: body.proposedDailyWage,
      proposedStartDate: body.proposedStartDate,
      proposedDurationDays: body.proposedDurationDays,
      message: body.message,
    });

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 201, { ok: true, offer: result.offer });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * POST /api/direct-offers/:id/accept
 * Requires: requireAuth + requireRole('worker')
 */
export async function handleAcceptOffer(req, res) {
  try {
    const offerId = req.params.id;
    const workerId = req.user.id;

    const result = await tryAccept(offerId, workerId);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 200, { ok: true, offer: result.offer, jobId: result.jobId });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * POST /api/direct-offers/:id/decline
 * Body: { reason? }
 * Requires: requireAuth + requireRole('worker')
 */
export async function handleDeclineOffer(req, res) {
  try {
    const offerId = req.params.id;
    const workerId = req.user.id;
    const body = req.body || {};

    const result = await decline(offerId, workerId, body.reason);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 200, { ok: true, offer: result.offer });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * DELETE /api/direct-offers/:id
 * Employer withdraws a pending offer.
 * Requires: requireAuth + requireRole('employer')
 */
export async function handleWithdrawOffer(req, res) {
  try {
    const offerId = req.params.id;
    const employerId = req.user.id;

    const result = await withdraw(offerId, employerId);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 200, { ok: true, offer: result.offer });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/direct-offers/mine?status=pending&limit=20&offset=0
 * Role-aware: employer sees their sent offers, worker sees their received offers.
 * Requires: requireAuth (any role)
 */
export async function handleListMyOffers(req, res) {
  try {
    const user = req.user;
    const status = req.query.status || undefined;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    let result;
    if (user.role === 'employer') {
      result = await listByEmployer(user.id, { status, limit, offset });
    } else if (user.role === 'worker') {
      result = await listByWorker(user.id, { status, limit, offset });
    } else {
      return sendJSON(res, 403, { error: 'غير مسموح', code: 'FORBIDDEN' });
    }

    sendJSON(res, 200, { ok: true, ...result, role: user.role });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/direct-offers/:id
 * Get a single offer (redacted per viewer).
 * Requires: requireAuth (must be involved party)
 */
export async function handleGetOffer(req, res) {
  try {
    const offerId = req.params.id;
    const userId = req.user.id;

    // Phase 45: pass userId to enable viewedAt tracking when worker first views pending offer
    const offer = await findById(offerId, userId);
    if (!offer) {
      return sendJSON(res, 404, { error: 'العرض غير موجود', code: 'OFFER_NOT_FOUND' });
    }

    // Authorization: must be employer or worker on this offer
    if (offer.employerId !== userId && offer.workerId !== userId) {
      return sendJSON(res, 403, { error: 'مش مسموحلك تشوف هذا العرض', code: 'NOT_AUTHORIZED' });
    }

    sendJSON(res, 200, { ok: true, offer: redactOfferForViewer(offer, userId) });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * Phase 43 — GET /api/direct-offers/stats/employer?from=&to=
 * Returns aggregated direct offer stats for the authenticated employer.
 * Requires: requireAuth + requireRole('employer')
 */
export async function handleEmployerOfferStats(req, res) {
  try {
    const employerId = req.user.id;
    const options = {};
    if (req.query.from) options.from = req.query.from;
    if (req.query.to) options.to = req.query.to;

    const stats = await getEmployerOfferStats(employerId, options);
    sendJSON(res, 200, { ok: true, stats });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في جلب الإحصائيات', code: 'STATS_ERROR' });
  }
}

/**
 * Phase 43 — GET /api/direct-offers/stats/worker?from=&to=
 * Returns aggregated direct offer stats for the authenticated worker.
 * Requires: requireAuth + requireRole('worker')
 */
export async function handleWorkerOfferStats(req, res) {
  try {
    const workerId = req.user.id;
    const options = {};
    if (req.query.from) options.from = req.query.from;
    if (req.query.to) options.to = req.query.to;

    const stats = await getWorkerOfferStats(workerId, options);
    sendJSON(res, 200, { ok: true, stats });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في جلب الإحصائيات', code: 'STATS_ERROR' });
  }
}
```

---

## `server/handlers/externalizationDecisionHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/externalizationDecisionHandler.js — Phase 60 Admin APIs
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

function audit(req, action, targetType, targetId, details = {}) {
  logAction({
    adminId: adminId(req),
    action,
    targetType,
    targetId,
    details,
    ip: requestIp(req),
  }).catch(() => {});
}

export async function handleGetExternalizationDecision(req, res) {
  try {
    const { getExternalizationDecisionReport } = await import('../services/externalizationDecision.js');
    const report = await getExternalizationDecisionReport({
      allowPilotCandidate: false,
    });

    return sendJSON(res, 200, {
      ok: true,
      decision: report,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب قرار Phase 60',
      code: 'EXTERNALIZATION_DECISION_ERROR',
    });
  }
}

export async function handleCaptureExternalizationDecision(req, res) {
  try {
    const { captureExternalizationDecisionSnapshot } = await import('../services/externalizationDecision.js');

    const result = await captureExternalizationDecisionSnapshot({
      allowPilotCandidate: false,
    });

    if (!result.ok) {
      return sendJSON(res, 503, {
        error: 'خدمة قرار النقل غير مفعلة',
        code: 'EXTERNALIZATION_DECISION_DISABLED',
      });
    }

    audit(req, 'externalization_decision_captured', 'externalization_decision', result.decision.id, {
      status: result.decision.status,
      implementationAllowed: result.decision.implementationAllowed,
      candidateCount: Array.isArray(result.decision.candidates) ? result.decision.candidates.length : 0,
    });

    return sendJSON(res, 201, {
      ok: true,
      decision: result.decision,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في حفظ قرار Phase 60',
      code: 'EXTERNALIZATION_DECISION_CAPTURE_ERROR',
    });
  }
}

export async function handleListExternalizationDecisionSnapshots(req, res) {
  try {
    const { listExternalizationDecisionSnapshots } = await import('../services/externalizationDecision.js');

    const result = await listExternalizationDecisionSnapshots({
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, {
      ok: true,
      ...result,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب سجل قرارات Phase 60',
      code: 'EXTERNALIZATION_DECISION_LIST_ERROR',
    });
  }
}

export async function handleValidateMigrationSnapshot(req, res) {
  try {
    const { validateMigrationSnapshot } = await import('../services/migrationSnapshotValidation.js');

    const body = req.body || {};
    const snapshotPath = body.snapshotPath || body.snapshot || req.query.snapshot;

    if (!snapshotPath || typeof snapshotPath !== 'string') {
      return sendJSON(res, 400, {
        error: 'snapshotPath مطلوب',
        code: 'SNAPSHOT_PATH_REQUIRED',
      });
    }

    const report = await validateMigrationSnapshot(snapshotPath, {
      strict: req.query.strict === '1' || req.query.strict === 'true' || body.strict === true,
    });

    audit(req, 'migration_snapshot_validated', 'migration_snapshot', snapshotPath, {
      status: report.status,
      errorCount: report.errors.length,
      warningCount: report.warnings.length,
    });

    return sendJSON(res, report.ok ? 200 : 400, {
      ok: report.ok,
      validation: report,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تحقق migration snapshot',
      code: 'MIGRATION_SNAPSHOT_VALIDATE_ERROR',
    });
  }
}

export async function handleRunMigrationRehearsal(req, res) {
  try {
    const body = req.body || {};
    const snapshotPath = body.snapshotPath || body.snapshot || req.query.snapshot;

    if (!snapshotPath) {
      return sendJSON(res, 400, {
        error: 'Phase 60 rehearsal يحتاج snapshotPath في هذه الدفعة. استخدم export-migration-snapshot أولاً.',
        code: 'SNAPSHOT_PATH_REQUIRED',
      });
    }

    const { validateMigrationSnapshot } = await import('../services/migrationSnapshotValidation.js');
    const validation = await validateMigrationSnapshot(snapshotPath, {
      strict: body.strict === true || req.query.strict === '1' || req.query.strict === 'true',
    });

    const report = {
      ok: validation.ok,
      status: validation.ok ? (validation.warnings.length > 0 ? 'warning' : 'passed') : 'failed',
      phase: 60,
      rehearsalType: 'validation_only',
      sourceDataMutated: false,
      externalDbConnected: false,
      snapshotPath,
      validation,
      generatedAt: new Date().toISOString(),
      notes: [
        'هذه الدفعة تنفذ rehearsal آمن قائم على validation فقط.',
        'لا يوجد اتصال بأي DB خارجي.',
        'لا يتم تعديل source data.',
      ],
    };

    audit(req, 'migration_rehearsal_run', 'migration_rehearsal', snapshotPath, {
      status: report.status,
      validationStatus: validation.status,
    });

    return sendJSON(res, validation.ok ? 200 : 400, {
      ok: validation.ok,
      rehearsal: report,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تشغيل تدريب الهجرة',
      code: 'MIGRATION_REHEARSAL_ERROR',
    });
  }
}

export async function handleBenchmarkHistory(req, res) {
  try {
    const { listBenchmarkResults, getLatestBenchmarkResult } = await import('../services/benchmarkHistory.js');

    const [list, latest] = await Promise.all([
      listBenchmarkResults({
        status: req.query.status || undefined,
        limit: parseInt(req.query.limit) || 20,
        offset: parseInt(req.query.offset) || 0,
      }),
      getLatestBenchmarkResult(),
    ]);

    return sendJSON(res, 200, {
      ok: true,
      latest,
      ...list,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب سجل Benchmarks',
      code: 'BENCHMARK_HISTORY_ERROR',
    });
  }
}
```

---

## `server/handlers/favoritesHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/favoritesHandler.js — Favorites API Handlers
// ═══════════════════════════════════════════════════════════════

import { addFavorite, removeFavorite, listFavorites, isFavorite } from '../services/favorites.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const ERROR_STATUS = {
  FAVORITES_DISABLED: 503,
  FAVORITE_USER_REQUIRED: 400,
  CANNOT_FAVORITE_SELF: 400,
  USER_NOT_FOUND: 404,
  ALREADY_FAVORITE: 409,
  MAX_FAVORITES_REACHED: 429,
  FAVORITE_NOT_FOUND: 404,
  NOT_FAVORITE_OWNER: 403,
};

function errorStatus(code) {
  return ERROR_STATUS[code] || 400;
}

/**
 * POST /api/favorites
 * Add a worker to favorites
 * Requires: requireAuth + requireRole('employer')
 */
export async function handleAddFavorite(req, res) {
  try {
    const body = req.body || {};
    const result = await addFavorite(req.user.id, body.favoriteUserId, body.note);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 201, { ok: true, favorite: result.favorite });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * DELETE /api/favorites/:id
 * Remove a favorite
 * Requires: requireAuth + requireRole('employer')
 */
export async function handleRemoveFavorite(req, res) {
  try {
    const favoriteId = req.params.id;
    const result = await removeFavorite(favoriteId, req.user.id);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 200, { ok: true });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/favorites
 * List favorites with enrichment
 * Requires: requireAuth + requireRole('employer')
 */
export async function handleListFavorites(req, res) {
  try {
    const favorites = await listFavorites(req.user.id);
    sendJSON(res, 200, { ok: true, favorites, count: favorites.length });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/favorites/check/:userId
 * Check if a user is favorited
 * Requires: requireAuth + requireRole('employer')
 */
export async function handleCheckFavorite(req, res) {
  try {
    const targetUserId = req.params.id;
    const result = await isFavorite(req.user.id, targetUserId);
    sendJSON(res, 200, { ok: true, isFavorite: result });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}
```

---

## `server/handlers/governanceHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/governanceHandler.js — Governance Admin APIs (Phase 58)
// ═══════════════════════════════════════════════════════════════
// Admin RBAC, approvals, privacy requests, ops review records,
// and incident postmortems.
// ═══════════════════════════════════════════════════════════════

import { logAction } from '../services/auditLog.js';
import {
  getAdminRole,
  getRbacMatrix,
  listRoleCapabilities,
} from '../services/adminRbac.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function adminId(req) {
  return req.user?.id || 'admin_token';
}

function adminRole(req) {
  return req.adminRole || getAdminRole(req);
}

function requestIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
}

function safeNote(value, max = 1000) {
  if (!value || typeof value !== 'string') return null;
  return value.trim().slice(0, max) || null;
}

function audit(req, action, targetType, targetId, details = {}) {
  logAction({
    adminId: adminId(req),
    action,
    targetType,
    targetId,
    details,
    ip: requestIp(req),
  }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════
// RBAC
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/admin/rbac/matrix
 */
export async function handleAdminRbacMatrix(req, res) {
  try {
    return sendJSON(res, 200, {
      ok: true,
      rbac: getRbacMatrix(),
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب نموذج صلاحيات الأدمن',
      code: 'RBAC_MATRIX_ERROR',
    });
  }
}

/**
 * GET /api/admin/rbac/me
 */
export async function handleAdminRbacMe(req, res) {
  try {
    const role = adminRole(req);
    return sendJSON(res, 200, {
      ok: true,
      role,
      capabilities: listRoleCapabilities(role),
      isTokenAdmin: !!(req.isAdmin && !req.user),
      userId: req.user?.id || null,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب صلاحيات الأدمن الحالية',
      code: 'RBAC_ME_ERROR',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Admin Approvals
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/admin/approvals
 */
export async function handleListApprovals(req, res) {
  try {
    const { listApprovals } = await import('../services/adminApprovals.js');

    const result = await listApprovals({
      status: req.query.status || undefined,
      action: req.query.action || undefined,
      targetId: req.query.targetId || undefined,
      requestedBy: req.query.requestedBy || undefined,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب موافقات إجراءات الأدمن',
      code: 'APPROVALS_LIST_ERROR',
    });
  }
}

/**
 * POST /api/admin/approvals
 * Body: { action, targetType, targetId, reason, payload? }
 */
export async function handleCreateApproval(req, res) {
  try {
    const { createApprovalRequest } = await import('../services/adminApprovals.js');

    const body = req.body || {};
    const result = await createApprovalRequest({
      action: body.action,
      targetType: body.targetType || 'unknown',
      targetId: body.targetId || 'unknown',
      requestedBy: adminId(req),
      reason: body.reason || null,
      payload: body.payload || {},
    });

    if (!result.ok) {
      return sendJSON(res, 400, {
        error: result.error || result.code,
        code: result.code || 'APPROVAL_CREATE_FAILED',
      });
    }

    audit(req, 'admin_approval_created', 'admin_approval', result.approval.id, {
      action: result.approval.action,
      targetType: result.approval.targetType,
      targetId: result.approval.targetId,
    });

    return sendJSON(res, 201, {
      ok: true,
      approval: result.approval,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في إنشاء طلب الموافقة',
      code: 'APPROVAL_CREATE_ERROR',
    });
  }
}

/**
 * POST /api/admin/approvals/:id/approve
 * Body: { note? }
 */
export async function handleApproveApproval(req, res) {
  try {
    const { approveRequest } = await import('../services/adminApprovals.js');

    const result = await approveRequest(
      req.params.id,
      adminId(req),
      safeNote(req.body?.note)
    );

    if (!result.ok) {
      const status = result.code === 'APPROVAL_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, {
        error: result.error || result.code,
        code: result.code || 'APPROVAL_APPROVE_FAILED',
      });
    }

    audit(req, 'admin_approval_approved', 'admin_approval', req.params.id, {
      action: result.approval.action,
      targetId: result.approval.targetId,
    });

    return sendJSON(res, 200, {
      ok: true,
      approval: result.approval,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في الموافقة على الطلب',
      code: 'APPROVAL_APPROVE_ERROR',
    });
  }
}

/**
 * POST /api/admin/approvals/:id/reject
 * Body: { note? }
 */
export async function handleRejectApproval(req, res) {
  try {
    const { rejectRequest } = await import('../services/adminApprovals.js');

    const result = await rejectRequest(
      req.params.id,
      adminId(req),
      safeNote(req.body?.note)
    );

    if (!result.ok) {
      const status = result.code === 'APPROVAL_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, {
        error: result.error || result.code,
        code: result.code || 'APPROVAL_REJECT_FAILED',
      });
    }

    audit(req, 'admin_approval_rejected', 'admin_approval', req.params.id, {
      action: result.approval.action,
      targetId: result.approval.targetId,
    });

    return sendJSON(res, 200, {
      ok: true,
      approval: result.approval,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في رفض طلب الموافقة',
      code: 'APPROVAL_REJECT_ERROR',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Privacy Requests
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/admin/privacy/requests
 */
export async function handleListPrivacyRequests(req, res) {
  try {
    const { listPrivacyRequests } = await import('../services/privacyRequests.js');

    const result = await listPrivacyRequests({
      status: req.query.status || undefined,
      type: req.query.type || undefined,
      userId: req.query.userId || undefined,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب طلبات الخصوصية',
      code: 'PRIVACY_REQUESTS_LIST_ERROR',
    });
  }
}

/**
 * POST /api/admin/privacy/requests
 * Body: { type, userId, reason?, approvalId? }
 */
export async function handleCreatePrivacyRequest(req, res) {
  try {
    const { createPrivacyRequest } = await import('../services/privacyRequests.js');

    const body = req.body || {};
    const result = await createPrivacyRequest({
      type: body.type,
      userId: body.userId,
      requestedBy: adminId(req),
      reason: body.reason || null,
      approvalId: body.approvalId || null,
    });

    if (!result.ok) {
      return sendJSON(res, 400, {
        error: result.error || result.code,
        code: result.code || 'PRIVACY_REQUEST_CREATE_FAILED',
      });
    }

    audit(req, 'privacy_request_created', 'privacy_request', result.request.id, {
      type: result.request.type,
      userId: result.request.userId,
    });

    return sendJSON(res, 201, {
      ok: true,
      request: result.request,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في إنشاء طلب الخصوصية',
      code: 'PRIVACY_REQUEST_CREATE_ERROR',
    });
  }
}

/**
 * GET /api/admin/privacy/requests/:id
 */
export async function handleGetPrivacyRequest(req, res) {
  try {
    const { getPrivacyRequest } = await import('../services/privacyRequests.js');

    const request = await getPrivacyRequest(req.params.id);
    if (!request) {
      return sendJSON(res, 404, {
        error: 'طلب الخصوصية غير موجود',
        code: 'PRIVACY_REQUEST_NOT_FOUND',
      });
    }

    return sendJSON(res, 200, { ok: true, request });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب طلب الخصوصية',
      code: 'PRIVACY_REQUEST_GET_ERROR',
    });
  }
}

/**
 * POST /api/admin/privacy/requests/:id/export
 */
export async function handleQueuePrivacyExport(req, res) {
  try {
    const { queuePrivacyExport } = await import('../services/privacyRequests.js');

    const result = await queuePrivacyExport(req.params.id, adminId(req));

    if (!result.ok) {
      const status = result.code === 'PRIVACY_REQUEST_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, {
        error: result.error || result.code,
        code: result.code || 'PRIVACY_EXPORT_QUEUE_FAILED',
      });
    }

    audit(req, 'privacy_export_queued', 'privacy_request', req.params.id, {
      queueJobId: result.queueJob?.id || null,
      userId: result.request?.userId || null,
    });

    return sendJSON(res, 202, {
      ok: true,
      queued: true,
      request: result.request,
      queueJobId: result.queueJob?.id || null,
      queueJob: result.queueJob || null,
      deduped: !!result.deduped,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في وضع تصدير بيانات المستخدم في الطابور',
      code: 'PRIVACY_EXPORT_QUEUE_ERROR',
    });
  }
}

/**
 * POST /api/admin/privacy/requests/:id/anonymize
 * Body: { approvalId }
 */
export async function handleQueuePrivacyAnonymize(req, res) {
  try {
    const { queueUserAnonymization } = await import('../services/privacyRequests.js');

    const result = await queueUserAnonymization(
      req.params.id,
      adminId(req),
      req.body?.approvalId || null
    );

    if (!result.ok) {
      const status = result.code === 'PRIVACY_REQUEST_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, {
        error: result.error || result.code,
        code: result.code || 'PRIVACY_ANONYMIZE_QUEUE_FAILED',
      });
    }

    audit(req, 'privacy_anonymization_queued', 'privacy_request', req.params.id, {
      queueJobId: result.queueJob?.id || null,
      userId: result.request?.userId || null,
      approvalId: result.request?.approvalId || null,
    });

    return sendJSON(res, 202, {
      ok: true,
      queued: true,
      request: result.request,
      queueJobId: result.queueJob?.id || null,
      queueJob: result.queueJob || null,
      deduped: !!result.deduped,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في وضع إخفاء بيانات المستخدم في الطابور',
      code: 'PRIVACY_ANONYMIZE_QUEUE_ERROR',
    });
  }
}

/**
 * POST /api/admin/privacy/requests/:id/anonymize-preview
 * Returns anonymization preview for request.userId.
 */
export async function handlePreviewPrivacyAnonymize(req, res) {
  try {
    const { getPrivacyRequest } = await import('../services/privacyRequests.js');
    const { previewUserAnonymization } = await import('../services/userAnonymization.js');

    const request = await getPrivacyRequest(req.params.id);
    if (!request) {
      return sendJSON(res, 404, {
        error: 'طلب الخصوصية غير موجود',
        code: 'PRIVACY_REQUEST_NOT_FOUND',
      });
    }

    if (request.type !== 'user_anonymization') {
      return sendJSON(res, 400, {
        error: 'هذا الطلب ليس طلب إخفاء بيانات',
        code: 'INVALID_REQUEST_TYPE',
      });
    }

    const preview = await previewUserAnonymization(request.userId, {
      requestId: request.id,
    });

    if (!preview.ok) {
      return sendJSON(res, 400, {
        error: preview.error || preview.code,
        code: preview.code || 'ANONYMIZATION_PREVIEW_FAILED',
      });
    }

    audit(req, 'privacy_anonymization_previewed', 'privacy_request', req.params.id, {
      userId: request.userId,
      counts: preview.counts || {},
    });

    return sendJSON(res, 200, {
      ok: true,
      preview,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في معاينة إخفاء البيانات',
      code: 'PRIVACY_ANONYMIZE_PREVIEW_ERROR',
    });
  }
}

/**
 * POST /api/admin/privacy/requests/:id/cancel
 */
export async function handleCancelPrivacyRequest(req, res) {
  try {
    const { cancelPrivacyRequest } = await import('../services/privacyRequests.js');

    const result = await cancelPrivacyRequest(req.params.id, adminId(req));

    if (!result.ok) {
      const status = result.code === 'PRIVACY_REQUEST_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, {
        error: result.error || result.code,
        code: result.code || 'PRIVACY_REQUEST_CANCEL_FAILED',
      });
    }

    audit(req, 'privacy_request_cancelled', 'privacy_request', req.params.id, {
      type: result.request?.type || null,
      userId: result.request?.userId || null,
    });

    return sendJSON(res, 200, {
      ok: true,
      request: result.request,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في إلغاء طلب الخصوصية',
      code: 'PRIVACY_REQUEST_CANCEL_ERROR',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Ops Review Records
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/admin/ops/reviews
 */
export async function handleListOpsReviews(req, res) {
  try {
    const { listReviewRecords } = await import('../services/opsReviewRecords.js');

    const result = await listReviewRecords({
      type: req.query.type || undefined,
      status: req.query.status || undefined,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب مراجعات التشغيل',
      code: 'OPS_REVIEWS_LIST_ERROR',
    });
  }
}

/**
 * POST /api/admin/ops/reviews
 */
export async function handleCreateOpsReview(req, res) {
  try {
    const { createReviewRecord } = await import('../services/opsReviewRecords.js');

    const body = req.body || {};
    const result = await createReviewRecord({
      type: body.type,
      title: body.title || body.type,
      summary: body.summary || '',
      findings: body.findings || [],
      actions: body.actions || [],
      refs: body.refs || {},
      createdBy: adminId(req),
      status: body.status || 'draft',
    });

    if (!result.ok) {
      return sendJSON(res, 400, {
        error: result.error || result.code,
        code: result.code || 'OPS_REVIEW_CREATE_FAILED',
      });
    }

    audit(req, 'ops_review_created', 'ops_review', result.review.id, {
      type: result.review.type,
      status: result.review.status,
    });

    return sendJSON(res, 201, {
      ok: true,
      review: result.review,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في إنشاء مراجعة تشغيل',
      code: 'OPS_REVIEW_CREATE_ERROR',
    });
  }
}

/**
 * GET /api/admin/ops/reviews/:id
 */
export async function handleGetOpsReview(req, res) {
  try {
    const { getReviewRecord } = await import('../services/opsReviewRecords.js');

    const review = await getReviewRecord(req.params.id);
    if (!review) {
      return sendJSON(res, 404, {
        error: 'مراجعة التشغيل غير موجودة',
        code: 'OPS_REVIEW_NOT_FOUND',
      });
    }

    return sendJSON(res, 200, { ok: true, review });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب مراجعة التشغيل',
      code: 'OPS_REVIEW_GET_ERROR',
    });
  }
}

/**
 * POST /api/admin/ops/reviews/:id/complete
 */
export async function handleCompleteOpsReview(req, res) {
  try {
    const { completeReviewRecord } = await import('../services/opsReviewRecords.js');

    const result = await completeReviewRecord(req.params.id, {
      ...req.body,
      completedBy: adminId(req),
    });

    if (!result.ok) {
      const status = result.code === 'REVIEW_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, {
        error: result.error || result.code,
        code: result.code || 'OPS_REVIEW_COMPLETE_FAILED',
      });
    }

    audit(req, 'ops_review_completed', 'ops_review', req.params.id, {
      type: result.review.type,
    });

    return sendJSON(res, 200, {
      ok: true,
      review: result.review,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في إكمال مراجعة التشغيل',
      code: 'OPS_REVIEW_COMPLETE_ERROR',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Postmortems
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/admin/incidents/:id/postmortem
 */
export async function handleGetIncidentPostmortem(req, res) {
  try {
    const { getPostmortemByIncident } = await import('../services/postmortemRecords.js');

    const postmortem = await getPostmortemByIncident(req.params.id);
    return sendJSON(res, 200, {
      ok: true,
      postmortem: postmortem || null,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب Postmortem للحادث',
      code: 'POSTMORTEM_GET_BY_INCIDENT_ERROR',
    });
  }
}

/**
 * POST /api/admin/incidents/:id/postmortem
 */
export async function handleCreateIncidentPostmortem(req, res) {
  try {
    const { getIncident } = await import('../services/incidentTimeline.js');
    const { createPostmortem } = await import('../services/postmortemRecords.js');

    const incident = await getIncident(req.params.id);
    if (!incident) {
      return sendJSON(res, 404, {
        error: 'الحادث غير موجود',
        code: 'INCIDENT_NOT_FOUND',
      });
    }

    const body = req.body || {};
    const result = await createPostmortem({
      incidentId: req.params.id,
      severity: incident.severity || body.severity || null,
      summary: body.summary || incident.title || '',
      impact: body.impact || '',
      timeline: body.timeline || [],
      rootCause: body.rootCause || '',
      whatWentWell: body.whatWentWell || '',
      whatWentWrong: body.whatWentWrong || '',
      detection: body.detection || '',
      resolution: body.resolution || incident.resolutionNote || '',
      prevention: body.prevention || '',
      actionItems: body.actionItems || [],
      createdBy: adminId(req),
    });

    if (!result.ok) {
      return sendJSON(res, 400, {
        error: result.error || result.code,
        code: result.code || 'POSTMORTEM_CREATE_FAILED',
      });
    }

    audit(req, 'postmortem_created', 'incident', req.params.id, {
      postmortemId: result.postmortem.id,
    });

    return sendJSON(res, 201, {
      ok: true,
      postmortem: result.postmortem,
      alreadyExists: !!result.alreadyExists,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في إنشاء Postmortem',
      code: 'POSTMORTEM_CREATE_ERROR',
    });
  }
}

/**
 * PUT /api/admin/postmortems/:id
 */
export async function handleUpdatePostmortem(req, res) {
  try {
    const { updatePostmortem } = await import('../services/postmortemRecords.js');

    const result = await updatePostmortem(req.params.id, {
      ...(req.body || {}),
      updatedBy: adminId(req),
    });

    if (!result.ok) {
      const status = result.code === 'POSTMORTEM_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, {
        error: result.error || result.code,
        code: result.code || 'POSTMORTEM_UPDATE_FAILED',
      });
    }

    audit(req, 'postmortem_updated', 'postmortem', req.params.id, {
      status: result.postmortem.status,
      incidentId: result.postmortem.incidentId,
    });

    return sendJSON(res, 200, {
      ok: true,
      postmortem: result.postmortem,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تحديث Postmortem',
      code: 'POSTMORTEM_UPDATE_ERROR',
    });
  }
}

/**
 * GET /api/admin/postmortems
 */
export async function handleListPostmortems(req, res) {
  try {
    const { listPostmortems } = await import('../services/postmortemRecords.js');

    const result = await listPostmortems({
      incidentId: req.query.incidentId || undefined,
      status: req.query.status || undefined,
      severity: req.query.severity || undefined,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب Postmortems',
      code: 'POSTMORTEMS_LIST_ERROR',
    });
  }
}
```

---

## `server/handlers/imageHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/imageHandler.js — Image Serving Endpoint
// ═══════════════════════════════════════════════════════════════

import { getImage } from '../services/imageStore.js';

/**
 * GET /api/images/:ref
 * Serves a stored image as binary with correct Content-Type
 * Requires: requireAuth
 */
export async function handleGetImage(req, res) {
  const imageRef = req.params.id; // router uses :id param

  if (!imageRef || !imageRef.startsWith('img_')) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'معرّف الصورة غير صالح', code: 'INVALID_IMAGE_REF' }));
    return;
  }

  try {
    const result = await getImage(imageRef);

    if (!result || !result.ok) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'الصورة غير موجودة', code: 'IMAGE_NOT_FOUND' }));
      return;
    }

    res.writeHead(200, {
      'Content-Type': result.contentType,
      'Content-Length': result.buffer.length,
      'Cache-Control': 'private, max-age=86400',
    });
    res.end(result.buffer);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'خطأ في جلب الصورة', code: 'IMAGE_ERROR' }));
  }
}
```

---

## `server/handlers/jobsHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/jobsHandler.js — Job Endpoints
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { create, findById, list, listAll, startJob, completeJob, cancelJob, countTodayByEmployer, renewJob, duplicateJob } from '../services/jobs.js';
import { validateJobFields, validateLatitude, validateLongitude, validateUrgency } from '../services/validators.js';
import { sanitizeFields } from '../services/sanitizer.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * POST /api/jobs
 * Requires: auth (employer)
 */
export async function handleCreateJob(req, res) {
  const body = req.body || {};

  const result = validateJobFields(body);
  if (!result.valid) {
    return sendJSON(res, 400, { error: result.errors.join('. '), code: 'INVALID_JOB' });
  }

  // Daily limit enforcement (non-blocking — allows on count failure)
  try {
    const todayCount = await countTodayByEmployer(req.user.id);
    if (todayCount >= config.LIMITS.maxJobsPerEmployerPerDay) {
      return sendJSON(res, 429, { error: 'وصلت للحد الأقصى لنشر الفرص اليوم', code: 'DAILY_JOB_LIMIT' });
    }
  } catch (_) {
    // Non-blocking: allow action if count check fails
  }

  try {
    const sanitized = sanitizeFields(body, ['title', 'description', 'location', 'area', 'address', 'landmark', 'locationNotes']);

    // Content filter check
    if (config.CONTENT_FILTER && config.CONTENT_FILTER.enabled && config.CONTENT_FILTER.checkJobDescription) {
      try {
        const { checkContent } = await import('../services/contentFilter.js');
        const combinedText = (sanitized.title || '') + ' ' + (sanitized.description || '');
        const filterResult = checkContent(combinedText);
        if (!filterResult.safe) {
          return sendJSON(res, 400, {
            error: 'المحتوى يحتوي على كلمات غير مسموحة أو أرقام تليفون. يُرجى تعديل النص.',
            code: 'CONTENT_BLOCKED',
            flaggedTerms: filterResult.flaggedTerms,
          });
        }
      } catch (_) {
        // Content filter failure is non-blocking — allow creation
      }
    }

    // Phase 61.4B — Address-first location UX fields
    const locationTextLimits = {
      location: 200,
      area: 80,
      address: 250,
      landmark: 120,
      locationNotes: 300,
    };

    for (const [field, maxLen] of Object.entries(locationTextLimits)) {
      if (sanitized[field] !== undefined && sanitized[field] !== null) {
        if (typeof sanitized[field] !== 'string') {
          return sendJSON(res, 400, { error: 'بيانات الموقع غير صالحة', code: 'INVALID_LOCATION_FIELD', field });
        }
        sanitized[field] = sanitized[field].trim();
        if (sanitized[field].length > maxLen) {
          return sendJSON(res, 400, {
            error: `حقل الموقع "${field}" لا يتجاوز ${maxLen} حرف`,
            code: 'LOCATION_FIELD_TOO_LONG',
            field,
          });
        }
        if (sanitized[field].length === 0) {
          sanitized[field] = null;
        }
      }
    }

    // Backward-compatible summary: keep location useful for old clients.
    if (!sanitized.location && (sanitized.address || sanitized.area || sanitized.landmark)) {
      sanitized.location = [sanitized.address, sanitized.area, sanitized.landmark]
        .filter(Boolean)
        .join(' — ');
    }

    // Validate lat/lng if provided
    if (sanitized.lat !== undefined && sanitized.lat !== null && sanitized.lat !== '') {
      const latResult = validateLatitude(sanitized.lat);
      if (!latResult.valid) {
        return sendJSON(res, 400, { error: latResult.error, code: 'INVALID_LATITUDE' });
      }
      sanitized.lat = latResult.value;
    }
    if (sanitized.lng !== undefined && sanitized.lng !== null && sanitized.lng !== '') {
      const lngResult = validateLongitude(sanitized.lng);
      if (!lngResult.valid) {
        return sendJSON(res, 400, { error: lngResult.error, code: 'INVALID_LONGITUDE' });
      }
      sanitized.lng = lngResult.value;
    }

    // Urgency handling
    if (body.urgency) {
      const urgResult = validateUrgency(body.urgency);
      if (!urgResult.valid) {
        return sendJSON(res, 400, { error: urgResult.error, code: 'INVALID_URGENCY' });
      }
      sanitized.urgency = body.urgency;
    }

    // Immediate jobs: auto-set startDate + default durationDays
    if (body.urgency === 'immediate') {
      if (!sanitized.startDate) {
        const egyptNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
        sanitized.startDate = egyptNow.toISOString().split('T')[0];
      }
      if (!sanitized.durationDays || typeof sanitized.durationDays !== 'number') {
        sanitized.durationDays = 1;
      }
    }

    const job = await create(req.user.id, sanitized);
    return sendJSON(res, 201, { ok: true, job });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إنشاء الفرصة', code: 'CREATE_JOB_ERROR' });
  }
}

/**
 * GET /api/jobs
 * Public — with optional filters: ?governorate=cairo&category=farming&status=open
 * Supports pagination: ?page=1&limit=20
 */
export async function handleListJobs(req, res) {
  const filters = {};
  if (req.query.governorate) filters.governorate = req.query.governorate;
  if (req.query.category) filters.category = req.query.category;
  if (req.query.status) filters.status = req.query.status;
  if (req.query.search) filters.search = req.query.search;
  if (req.query.sort) filters.sort = req.query.sort;
  if (req.query.lat) filters.lat = req.query.lat;
  if (req.query.lng) filters.lng = req.query.lng;
  if (req.query.radius) filters.radius = req.query.radius;
  if (req.query.categories) filters.categories = req.query.categories;
  if (req.query.minWage) filters.minWage = req.query.minWage;
  if (req.query.maxWage) filters.maxWage = req.query.maxWage;
  if (req.query.startDateFrom) filters.startDateFrom = req.query.startDateFrom;
  if (req.query.startDateTo) filters.startDateTo = req.query.startDateTo;
  if (req.query.urgency) filters.urgency = req.query.urgency;

  try {
    const allJobs = await list(filters);
    const total = allJobs.length;

    // Pagination
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const totalPages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;
    const jobs = allJobs.slice(offset, offset + limit);

    return sendJSON(res, 200, {
      ok: true,
      jobs,
      count: jobs.length,
      total,
      page,
      totalPages,
      limit,
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب الفرص', code: 'LIST_JOBS_ERROR' });
  }
}

/**
 * GET /api/jobs/:id
 * Public
 */
export async function handleGetJob(req, res) {
  const jobId = req.params.id;

  try {
    const job = await findById(jobId);
    if (!job) {
      return sendJSON(res, 404, { error: 'الفرصة غير موجودة', code: 'JOB_NOT_FOUND' });
    }
    return sendJSON(res, 200, { ok: true, job });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب الفرصة', code: 'GET_JOB_ERROR' });
  }
}

/**
 * POST /api/jobs/:id/start
 * Requires: auth (employer, owns job, status=filled)
 */
export async function handleStartJob(req, res) {
  const jobId = req.params.id;

  try {
    const result = await startJob(jobId, req.user.id);
    if (!result.ok) {
      const status = result.code === 'JOB_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, result);
    }
    return sendJSON(res, 200, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في بدء الفرصة', code: 'START_JOB_ERROR' });
  }
}

/**
 * POST /api/jobs/:id/complete
 * Requires: auth (employer, owns job, status=in_progress)
 */
export async function handleCompleteJob(req, res) {
  const jobId = req.params.id;

  try {
    const result = await completeJob(jobId, req.user.id);
    if (!result.ok) {
      const status = result.code === 'JOB_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, result);
    }
    return sendJSON(res, 200, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إنهاء الفرصة', code: 'COMPLETE_JOB_ERROR' });
  }
}

/**
 * POST /api/jobs/:id/cancel
 * Requires: auth (employer, owns job, status=open)
 */
export async function handleCancelJob(req, res) {
  const jobId = req.params.id;

  try {
    const result = await cancelJob(jobId, req.user.id);
    if (!result.ok) {
      const status = result.code === 'JOB_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, result);
    }
    return sendJSON(res, 200, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إلغاء الفرصة', code: 'CANCEL_JOB_ERROR' });
  }
}

/**
 * GET /api/jobs/mine
 * Requires: auth (employer)
 * Returns: all jobs by the employer (all statuses, paginated)
 */
export async function handleListMyJobs(req, res) {
  try {
    let myJobs;

    // Try index-accelerated lookup first (employer-jobs index)
    try {
      const { getFromSetIndex, readJSON, getRecordPath } = await import('../services/database.js');
      const employerJobsIndex = config.DATABASE.indexFiles.employerJobsIndex;
      const jobIds = await getFromSetIndex(employerJobsIndex, req.user.id);
      if (jobIds.length > 0) {
        const results = [];
        for (const jobId of jobIds) {
          const job = await readJSON(getRecordPath('jobs', jobId));
          if (job) results.push(job);
        }
        myJobs = results;
      }
    } catch (_) {
      // Fallback below
    }

    // Fallback: full scan (backward compatibility)
    if (!myJobs) {
      const allJobs = await listAll();
      myJobs = allJobs.filter(j => j.employerId === req.user.id);
    }

    // Sort: newest first
    myJobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const total = myJobs.length;

    // Pagination (same pattern as handleListJobs)
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const totalPages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;
    const jobs = myJobs.slice(offset, offset + limit);

    // Optional enrichment: pending applications count
    if (req.query.enrich === 'applications') {
      try {
        const { listByJob: listAppsByJob } = await import('../services/applications.js');
        for (const job of jobs) {
          const apps = await listAppsByJob(job.id);
          job.pendingApplicationsCount = apps.filter(a => a.status === 'pending').length;
        }
      } catch (_) {
        // Non-blocking: enrichment failure doesn't break the response
      }
    }

    return sendJSON(res, 200, {
      ok: true,
      jobs,
      count: jobs.length,
      total,
      page,
      totalPages,
      limit,
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب فرصك', code: 'LIST_MY_JOBS_ERROR' });
  }
}

/**
 * GET /api/jobs/nearby
 * Requires: auth (worker)
 * Returns: nearby jobs based on worker's saved location or governorate center
 */
export async function handleNearbyJobs(req, res) {
  const user = req.user;

  try {
    const { resolveCoordinates } = await import('../services/geo.js');
    const coords = resolveCoordinates({
      lat: user.lat,
      lng: user.lng,
      governorate: user.governorate,
    });

    if (!coords) {
      return sendJSON(res, 400, {
        error: 'حدّد موقعك في الملف الشخصي عشان تشوف الفرص القريبة',
        code: 'LOCATION_REQUIRED',
      });
    }

    const radius = Math.min(
      Number(req.query.radius) || config.GEOLOCATION.defaultRadiusKm,
      config.GEOLOCATION.maxRadiusKm
    );
    const category = req.query.category || undefined;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));

    const allJobs = await list({
      status: 'open',
      category,
      lat: coords.lat,
      lng: coords.lng,
      radius,
    });

    const total = allJobs.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const start = (page - 1) * limit;
    const paginatedJobs = allJobs.slice(start, start + limit);

    return sendJSON(res, 200, {
      ok: true,
      jobs: paginatedJobs,
      count: paginatedJobs.length,
      total,
      page,
      totalPages,
      limit,
      location: { lat: coords.lat, lng: coords.lng, radius },
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب الفرص القريبة', code: 'NEARBY_JOBS_ERROR' });
  }
}

/**
 * POST /api/jobs/:id/renew
 * Requires: auth (employer, owns job, status=expired|cancelled)
 */
export async function handleRenewJob(req, res) {
  const jobId = req.params.id;

  try {
    const result = await renewJob(jobId, req.user.id);
    if (!result.ok) {
      const statusMap = {
        RENEWAL_DISABLED: 503,
        JOB_NOT_FOUND: 404,
        NOT_JOB_OWNER: 403,
        INVALID_STATUS_FOR_RENEWAL: 400,
        MAX_RENEWALS_REACHED: 400,
        DAILY_JOB_LIMIT: 429,
      };
      const status = statusMap[result.code] || 400;
      return sendJSON(res, status, result);
    }
    return sendJSON(res, 200, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في تجديد الفرصة', code: 'RENEW_JOB_ERROR' });
  }
}

/**
 * POST /api/jobs/:id/duplicate
 * Duplicate an existing job (copies content, resets lifecycle)
 * Requires: auth (employer, owns job)
 */
export async function handleDuplicateJob(req, res) {
  const jobId = req.params.id;

  try {
    const result = await duplicateJob(jobId, req.user.id);
    if (!result.ok) {
      const statusMap = {
        JOB_NOT_FOUND: 404,
        NOT_JOB_OWNER: 403,
        DAILY_JOB_LIMIT: 429,
      };
      const status = statusMap[result.code] || 400;
      return sendJSON(res, status, result);
    }
    return sendJSON(res, 201, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في نسخ الفرصة', code: 'DUPLICATE_JOB_ERROR' });
  }
}
```

---

## `server/handlers/liveFeedHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/liveFeedHandler.js — Live Feed SSE + Instant Accept
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { registerConnection, getInitialDump } from '../services/liveFeed.js';
import { tryAccept, findPendingByJob } from '../services/instantMatch.js';
import { formatSSE } from '../services/sseManager.js';
import { verifySession } from '../services/sessions.js';
import { findById as findUser } from '../services/users.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * GET /api/jobs/live-feed?token=...&governorate=X&category=Y&lat=...&lng=...&radius=...
 * Self-authenticated SSE endpoint (worker only).
 */
export async function handleLiveFeedStream(req, res) {
  // Feature flag
  if (!config.LIVE_FEED || !config.LIVE_FEED.enabled) {
    return sendJSON(res, 503, { error: 'خلاصة الفرص الحية غير مفعّلة', code: 'LIVE_FEED_DISABLED' });
  }

  // Self-auth (token via Authorization header OR query param)
  let token = null;
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }
  if (!token) {
    return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً', code: 'AUTH_REQUIRED' });
  }

  const session = await verifySession(token);
  if (!session) {
    return sendJSON(res, 401, { error: 'الجلسة انتهت أو غير صالحة', code: 'SESSION_INVALID' });
  }

  const user = await findUser(session.userId);
  if (!user) {
    return sendJSON(res, 401, { error: 'المستخدم غير موجود', code: 'USER_NOT_FOUND' });
  }
  if (user.status !== 'active') {
    return sendJSON(res, 403, { error: 'الحساب غير نشط', code: 'ACCOUNT_INACTIVE' });
  }
  if (user.role !== 'worker') {
    return sendJSON(res, 403, { error: 'متاحة للعمال فقط', code: 'WORKER_ONLY' });
  }

  // Parse filters from query
  const filters = {
    governorate: req.query.governorate || user.governorate || null,
    categories: req.query.category
      ? [req.query.category]
      : (Array.isArray(user.categories) && user.categories.length > 0 ? user.categories : null),
    lat: req.query.lat ? parseFloat(req.query.lat) : (typeof user.lat === 'number' ? user.lat : null),
    lng: req.query.lng ? parseFloat(req.query.lng) : (typeof user.lng === 'number' ? user.lng : null),
    radiusKm: req.query.radius ? parseFloat(req.query.radius) : config.LIVE_FEED.maxRadiusKm,
  };

  // ── Auth passed — write SSE headers ──
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  if (req.socket) {
    req.socket.setTimeout(0);
  }

  // Suggest retry interval
  res.write(`retry: ${(config.SSE && config.SSE.reconnectMs) || 5000}\n\n`);

  // Send initial dump
  let initialJobs = [];
  try {
    initialJobs = await getInitialDump(user.id, filters);
  } catch (_) { /* non-blocking */ }

  res.write(formatSSE('init', { jobs: initialJobs, filters: { ...filters }, userId: user.id }));

  // Register connection
  registerConnection(user.id, res, filters);
}

/**
 * POST /api/jobs/:id/instant-accept
 * Body: { matchId? } — if omitted, finds pending match for the job
 * Requires: requireAuth + requireRole('worker')
 */
export async function handleInstantAccept(req, res) {
  try {
    const workerId = req.user.id;
    const jobId = req.params.id;
    const body = req.body || {};

    let matchId = body.matchId;
    if (!matchId) {
      // Auto-resolve: find pending match for this job
      const pending = await findPendingByJob(jobId);
      if (!pending) {
        return sendJSON(res, 404, { error: 'مفيش عرض فوري لهذه الفرصة', code: 'NO_PENDING_MATCH' });
      }
      matchId = pending.id;
    }

    const result = await tryAccept(matchId, workerId);

    if (!result.ok) {
      const statusMap = {
        MATCH_NOT_FOUND: 404,
        TOO_LATE: 409,
        EXPIRED: 410,
        INVALID_STATUS: 400,
        NOT_CANDIDATE: 403,
        ACCEPT_FAILED: 500,
      };
      const code = result.code || 'ACCEPT_FAILED';
      const labels = {
        MATCH_NOT_FOUND: 'العرض غير موجود',
        TOO_LATE: 'حد آخر سبقك ⚡',
        EXPIRED: 'انتهت مهلة العرض',
        INVALID_STATUS: 'حالة العرض غير صالحة',
        NOT_CANDIDATE: 'مش ضمن المرشحين لهذا العرض',
        ACCEPT_FAILED: 'تعذّر قبول العرض',
      };
      return sendJSON(res, statusMap[code] || 400, { error: labels[code] || 'خطأ في القبول', code });
    }

    sendJSON(res, 200, { ok: true, application: result.application, jobId: result.jobId });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}
```

---

## `server/handlers/marketplaceIntelligenceHandler.js`

```javascript
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
```

---

## `server/handlers/messagesHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/messagesHandler.js — Messaging API Handlers
// ═══════════════════════════════════════════════════════════════

import {
  sendMessage, broadcastMessage, listByJob, markAsRead,
  markAllAsRead, countUnread, canMessage,
} from '../services/messages.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const ERROR_STATUS = {
  MESSAGES_DISABLED: 503,
  JOB_NOT_FOUND: 404,
  JOB_STATUS_NOT_ELIGIBLE: 400,
  NOT_INVOLVED: 403,
  TEXT_REQUIRED: 400,
  TEXT_TOO_LONG: 400,
  RECIPIENT_REQUIRED: 400,
  RECIPIENT_NOT_INVOLVED: 400,
  CANNOT_MESSAGE_SELF: 400,
  DAILY_MESSAGE_LIMIT: 429,
  BROADCAST_DISABLED: 503,
  NOT_JOB_OWNER: 403,
  NO_ACCEPTED_WORKERS: 400,
  MESSAGE_NOT_FOUND: 404,
  NOT_MESSAGE_RECIPIENT: 403,
};

function errorStatus(code) {
  return ERROR_STATUS[code] || 400;
}

/**
 * POST /api/jobs/:id/messages
 * Send a message to a specific user on a job
 * Requires: requireAuth
 */
export async function handleSendMessage(req, res) {
  try {
    const jobId = req.params.id;
    const senderId = req.user.id;
    const body = req.body || {};

    const result = await sendMessage(jobId, senderId, {
      recipientId: body.recipientId,
      text: body.text,
    });

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 201, { ok: true, message: result.message });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * POST /api/jobs/:id/messages/broadcast
 * Broadcast a message to all accepted workers on a job
 * Requires: requireAuth + requireRole('employer')
 */
export async function handleBroadcastMessage(req, res) {
  try {
    const jobId = req.params.id;
    const employerId = req.user.id;
    const body = req.body || {};

    const result = await broadcastMessage(jobId, employerId, body.text);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 201, { ok: true, message: result.message });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/jobs/:id/messages
 * List messages for a job (only messages the user can see)
 * Requires: requireAuth
 */
export async function handleListJobMessages(req, res) {
  try {
    const jobId = req.params.id;
    const userId = req.user.id;

    // Verify user is involved
    const check = await canMessage(jobId, userId);
    if (!check.allowed) {
      return sendJSON(res, errorStatus(check.code), { error: check.error, code: check.code });
    }

    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = Math.max(0, parseInt(req.query.offset) || 0);

    const result = await listByJob(jobId, userId, { limit, offset });

    sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/messages/unread-count
 * Get total unread message count for the authenticated user
 * Requires: requireAuth
 */
export async function handleGetUnreadCount(req, res) {
  try {
    const count = await countUnread(req.user.id);
    sendJSON(res, 200, { ok: true, unread: count });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * POST /api/messages/:id/read
 * Mark a single message as read
 * Requires: requireAuth
 */
export async function handleMarkMessageRead(req, res) {
  try {
    const messageId = req.params.id;
    const userId = req.user.id;

    const result = await markAsRead(messageId, userId);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 200, { ok: true, message: result.message });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * POST /api/jobs/:id/messages/read-all
 * Mark all messages in a job as read for the authenticated user
 * Requires: requireAuth
 */
export async function handleMarkAllJobMessagesRead(req, res) {
  try {
    const jobId = req.params.id;
    const userId = req.user.id;

    const result = await markAllAsRead(jobId, userId);

    sendJSON(res, 200, result);
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}
```

---

## `server/handlers/notificationsHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/notificationsHandler.js — Notification Endpoints
// ═══════════════════════════════════════════════════════════════

import { listByUser, markAsRead, markAllAsRead, findById } from '../services/notifications.js';
import { recordNotificationActionClick } from '../services/notificationConversionMetrics.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * GET /api/notifications
 * Requires: auth
 * Query: ?limit=20&offset=0
 */
export async function handleListNotifications(req, res) {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = Math.max(0, parseInt(req.query.offset) || 0);

  try {
    const result = await listByUser(req.user.id, { limit, offset });
    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب الإشعارات', code: 'LIST_NOTIFICATIONS_ERROR' });
  }
}

/**
 * POST /api/notifications/:id/read
 * Requires: auth
 */
export async function handleMarkAsRead(req, res) {
  const notificationId = req.params.id;

  try {
    const result = await markAsRead(notificationId, req.user.id);
    if (!result.ok) {
      const status = result.code === 'NOTIFICATION_NOT_FOUND' ? 404 : 403;
      return sendJSON(res, status, result);
    }
    return sendJSON(res, 200, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في تحديث الإشعار', code: 'MARK_READ_ERROR' });
  }
}

/**
 * POST /api/notifications/read-all
 * Requires: auth
 */
export async function handleMarkAllAsRead(req, res) {
  try {
    const result = await markAllAsRead(req.user.id);
    return sendJSON(res, 200, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في تحديث الإشعارات', code: 'MARK_ALL_READ_ERROR' });
  }
}

/**
 * POST /api/notifications/:id/action-click
 * Phase 56 — Fire-and-forget notification action click tracking.
 * Requires: auth
 */
export async function handleNotificationActionClick(req, res) {
  const notificationId = req.params.id;

  try {
    const notification = await findById(notificationId);

    if (!notification) {
      return sendJSON(res, 404, {
        error: 'الإشعار غير موجود',
        code: 'NOTIFICATION_NOT_FOUND',
      });
    }

    if (notification.userId !== req.user.id) {
      return sendJSON(res, 403, {
        error: 'مش مسموحلك تسجل هذا الإجراء',
        code: 'NOT_NOTIFICATION_OWNER',
      });
    }

    const actionType = notification.action && notification.action.type
      ? notification.action.type
      : 'default';

    await recordNotificationActionClick({
      notificationType: notification.type || 'unknown',
      actionType,
      userRole: req.user.role || 'unknown',
      timestamp: new Date().toISOString(),
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true });
  } catch (err) {
    // Tracking endpoint must never block UX.
    return sendJSON(res, 200, { ok: true });
  }
}
```

---

## `server/handlers/paymentsHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/paymentsHandler.js — Payment Endpoint Handlers
// ═══════════════════════════════════════════════════════════════

import { createPayment, confirmPayment, completePayment, disputePayment, findById, listByJob, getFinancialSummary } from '../services/payments.js';
import { sanitizeText } from '../services/sanitizer.js';
import { logAction } from '../services/auditLog.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * POST /api/jobs/:id/payment
 * Create payment record for a completed job
 * Requires: requireAuth + requireRole('employer')
 */
export async function handleCreatePayment(req, res) {
  try {
    const jobId = req.params.id;
    const employerId = req.user.id;
    const body = req.body || {};

    const options = {};
    if (body.method) options.method = body.method;
    if (body.notes) options.notes = sanitizeText(body.notes);

    const result = await createPayment(jobId, employerId, options);
    if (!result.ok) {
      const statusMap = {
        PAYMENTS_DISABLED: 400,
        JOB_NOT_FOUND: 404,
        JOB_NOT_COMPLETED: 400,
        NOT_JOB_OWNER: 403,
        PAYMENT_EXISTS: 409,
        INVALID_PAYMENT_METHOD: 400,
      };
      const status = statusMap[result.code] || 400;
      return sendJSON(res, status, { error: result.error, code: result.code });
    }

    return sendJSON(res, 201, { ok: true, payment: result.payment });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إنشاء سجل الدفع', code: 'CREATE_PAYMENT_ERROR' });
  }
}

/**
 * GET /api/jobs/:id/payment
 * Get payment info for a job
 * Requires: requireAuth
 */
export async function handleGetJobPayment(req, res) {
  try {
    const jobId = req.params.id;
    const payments = await listByJob(jobId);

    if (payments.length === 0) {
      return sendJSON(res, 404, { error: 'لا يوجد سجل دفع لهذه الفرصة', code: 'PAYMENT_NOT_FOUND' });
    }

    return sendJSON(res, 200, { ok: true, payment: payments[0] });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب سجل الدفع', code: 'GET_PAYMENT_ERROR' });
  }
}

/**
 * POST /api/payments/:id/confirm
 * Employer confirms cash payment
 * Requires: requireAuth + requireRole('employer')
 */
export async function handleConfirmPayment(req, res) {
  try {
    const paymentId = req.params.id;
    const employerId = req.user.id;

    const result = await confirmPayment(paymentId, employerId);
    if (!result.ok) {
      const statusMap = {
        PAYMENT_NOT_FOUND: 404,
        NOT_PAYMENT_OWNER: 403,
        INVALID_PAYMENT_STATUS: 400,
      };
      const status = statusMap[result.code] || 400;
      return sendJSON(res, status, { error: result.error, code: result.code });
    }

    return sendJSON(res, 200, { ok: true, payment: result.payment });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في تأكيد الدفع', code: 'CONFIRM_PAYMENT_ERROR' });
  }
}

/**
 * POST /api/payments/:id/dispute
 * Raise dispute on a payment
 * Requires: requireAuth (employer or accepted worker)
 */
export async function handleDisputePayment(req, res) {
  try {
    const paymentId = req.params.id;
    const userId = req.user.id;
    const body = req.body || {};

    let reason = body.reason || '';
    reason = sanitizeText(reason);

    if (!reason || reason.length < 5) {
      return sendJSON(res, 400, { error: 'سبب النزاع لازم يكون 5 حروف على الأقل', code: 'INVALID_DISPUTE_REASON' });
    }

    const result = await disputePayment(paymentId, userId, reason);
    if (!result.ok) {
      const statusMap = {
        PAYMENT_NOT_FOUND: 404,
        PAYMENT_ALREADY_COMPLETED: 400,
        ALREADY_DISPUTED: 400,
        DISPUTE_WINDOW_CLOSED: 400,
        NOT_INVOLVED: 403,
      };
      const status = statusMap[result.code] || 400;
      return sendJSON(res, status, { error: result.error, code: result.code });
    }

    return sendJSON(res, 200, { ok: true, payment: result.payment });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في فتح النزاع', code: 'DISPUTE_PAYMENT_ERROR' });
  }
}

/**
 * GET /api/admin/financial-summary
 * Admin financial overview
 * Requires: requireAdmin
 */
export async function handleAdminFinancialSummary(req, res) {
  try {
    const summary = await getFinancialSummary();
    return sendJSON(res, 200, { ok: true, summary });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب الملخص المالي', code: 'FINANCIAL_SUMMARY_ERROR' });
  }
}

/**
 * POST /api/admin/payments/:id/complete
 * Admin finalizes a payment
 * Requires: requireAdmin
 */
export async function handleAdminCompletePayment(req, res) {
  try {
    const paymentId = req.params.id;

    const result = await completePayment(paymentId);
    if (!result.ok) {
      const statusMap = {
        PAYMENT_NOT_FOUND: 404,
        INVALID_PAYMENT_STATUS: 400,
      };
      const status = statusMap[result.code] || 400;
      return sendJSON(res, status, { error: result.error, code: result.code });
    }

    // Audit log (fire-and-forget)
    logAction({
      adminId: req.user?.id || 'admin_token',
      action: 'payment_completed',
      targetType: 'payment',
      targetId: paymentId,
      details: { jobId: result.payment?.jobId },
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, payment: result.payment });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إنهاء الدفعة', code: 'COMPLETE_PAYMENT_ERROR' });
  }
}
```

---

## `server/handlers/phase61Handler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/phase61Handler.js — Phase 61 Admin APIs
// ═══════════════════════════════════════════════════════════════
// Evidence cadence, pilot gate, rollback rehearsal,
// and repository contract readiness.
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

function audit(req, action, targetType, targetId, details = {}) {
  logAction({
    adminId: adminId(req),
    action,
    targetType,
    targetId,
    details,
    ip: requestIp(req),
  }).catch(() => {});
}

function parseBool(value) {
  return value === true || value === '1' || value === 'true';
}

export async function handleGetPhase61Evidence(req, res) {
  try {
    const { getEvidenceCadenceStatus } = await import('../services/phase61EvidenceCadence.js');
    const evidence = await getEvidenceCadenceStatus();
    return sendJSON(res, 200, { ok: true, evidence });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب إيقاع الأدلة Phase 61',
      code: 'PHASE61_EVIDENCE_ERROR',
    });
  }
}

export async function handleCapturePhase61Evidence(req, res) {
  try {
    const { captureEvidenceCadenceSnapshot } = await import('../services/phase61EvidenceCadence.js');
    const result = await captureEvidenceCadenceSnapshot();

    if (!result.ok) {
      return sendJSON(res, 503, {
        error: 'Phase 61 Evidence Cadence غير مفعّل',
        code: 'PHASE61_EVIDENCE_DISABLED',
      });
    }

    audit(req, 'phase61_evidence_captured', 'phase61_evidence', result.evidence.id, {
      status: result.evidence.status,
      warningCount: result.evidence.warnings?.length || 0,
      blockerCount: result.evidence.blockers?.length || 0,
    });

    return sendJSON(res, 201, { ok: true, evidence: result.evidence });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في حفظ لقطة Evidence Cadence',
      code: 'PHASE61_EVIDENCE_CAPTURE_ERROR',
    });
  }
}

export async function handleListPhase61EvidenceSnapshots(req, res) {
  try {
    const { listEvidenceCadenceSnapshots } = await import('../services/phase61EvidenceCadence.js');
    const result = await listEvidenceCadenceSnapshots({
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });
    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب سجل Evidence Cadence',
      code: 'PHASE61_EVIDENCE_LIST_ERROR',
    });
  }
}

export async function handleGetPilotDecisionGate(req, res) {
  try {
    const { getPilotDecisionGate } = await import('../services/pilotDecisionGate.js');
    const gate = await getPilotDecisionGate({
      candidate: req.query.candidate || undefined,
      approvalId: req.query.approvalId || undefined,
    });
    return sendJSON(res, 200, { ok: true, gate });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب بوابة Pilot',
      code: 'PILOT_GATE_ERROR',
    });
  }
}

export async function handleCapturePilotDecisionGate(req, res) {
  try {
    const { capturePilotDecisionSnapshot } = await import('../services/pilotDecisionGate.js');
    const body = req.body || {};

    const result = await capturePilotDecisionSnapshot({
      candidate: body.candidate || req.query.candidate || undefined,
      approvalId: body.approvalId || req.query.approvalId || undefined,
    });

    if (!result.ok) {
      return sendJSON(res, 503, {
        error: 'Pilot Gate غير مفعّل',
        code: 'PILOT_GATE_DISABLED',
      });
    }

    audit(req, 'phase61_pilot_gate_captured', 'pilot_gate', result.gate.id, {
      candidate: result.gate.candidate,
      pilotAllowed: result.gate.pilotAllowed,
      blockerCount: result.gate.blockers?.length || 0,
    });

    return sendJSON(res, 201, { ok: true, gate: result.gate });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في حفظ بوابة Pilot',
      code: 'PILOT_GATE_CAPTURE_ERROR',
    });
  }
}

export async function handleRunRollbackRehearsal(req, res) {
  try {
    const { runRollbackRehearsal } = await import('../services/rollbackRehearsal.js');
    const body = req.body || {};

    const result = await runRollbackRehearsal({
      backupReference: body.backupReference || undefined,
      snapshotReference: body.snapshotReference || undefined,
      dryRun: parseBool(body.dryRun) || parseBool(req.query.dryRun),
      persist: body.persist === false ? false : true,
      confirm: parseBool(body.confirm) || parseBool(req.query.confirm),
    });

    if (!result.rehearsal) {
      return sendJSON(res, 503, {
        error: 'Rollback rehearsal غير مفعّل',
        code: 'ROLLBACK_REHEARSAL_DISABLED',
      });
    }

    audit(req, 'rollback_rehearsal_run', 'rollback_rehearsal', result.rehearsal.id, {
      status: result.rehearsal.status,
      blockerCount: result.rehearsal.blockers?.length || 0,
      sourceDataMutated: result.rehearsal.sourceDataMutated,
      externalDbConnected: result.rehearsal.externalDbConnected,
    });

    return sendJSON(res, result.ok ? 200 : 400, {
      ok: result.ok,
      rehearsal: result.rehearsal,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تشغيل تدريب الرجوع',
      code: 'ROLLBACK_REHEARSAL_ERROR',
    });
  }
}

export async function handleListRollbackRehearsals(req, res) {
  try {
    const { listRollbackRehearsals, getLatestRollbackRehearsal } = await import('../services/rollbackRehearsal.js');
    const [list, latest] = await Promise.all([
      listRollbackRehearsals({
        status: req.query.status || undefined,
        limit: parseInt(req.query.limit) || 20,
        offset: parseInt(req.query.offset) || 0,
      }),
      getLatestRollbackRehearsal(),
    ]);

    return sendJSON(res, 200, { ok: true, latest, ...list });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب سجل تدريبات الرجوع',
      code: 'ROLLBACK_REHEARSAL_LIST_ERROR',
    });
  }
}

export async function handleGetRollbackRehearsal(req, res) {
  try {
    const { getRollbackRehearsal } = await import('../services/rollbackRehearsal.js');
    const rehearsal = await getRollbackRehearsal(req.params.id);

    if (!rehearsal) {
      return sendJSON(res, 404, {
        error: 'تدريب الرجوع غير موجود',
        code: 'ROLLBACK_REHEARSAL_NOT_FOUND',
      });
    }

    return sendJSON(res, 200, { ok: true, rehearsal });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب تدريب الرجوع',
      code: 'ROLLBACK_REHEARSAL_GET_ERROR',
    });
  }
}

export async function handleRepositoryContracts(req, res) {
  try {
    const { getRepositoryContractReadiness } = await import('../services/repositoryContractReport.js');
    const report = await getRepositoryContractReadiness();
    return sendJSON(res, 200, { ok: true, repositoryContracts: report });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب عقود Repository',
      code: 'REPOSITORY_CONTRACTS_ERROR',
    });
  }
}
```

---

## `server/handlers/presenceHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/presenceHandler.js — Heartbeat + Online Workers
// ═══════════════════════════════════════════════════════════════

import { recordHeartbeat, countOnlineByFilters } from '../services/presenceService.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * POST /api/presence/heartbeat
 * Body: { lat?, lng?, acceptingJobs?, sessionId? }
 * Requires: requireAuth + requireRole('worker')
 */
export async function handleHeartbeat(req, res) {
  try {
    const userId = req.user.id;
    const body = req.body || {};

    const result = recordHeartbeat(userId, {
      lat: typeof body.lat === 'number' ? body.lat : undefined,
      lng: typeof body.lng === 'number' ? body.lng : undefined,
      acceptingJobs: typeof body.acceptingJobs === 'boolean' ? body.acceptingJobs : undefined,
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : (req.session && req.session.token) || undefined,
    });

    if (!result.ok) {
      return sendJSON(res, 503, { error: 'خدمة الحضور اللحظي غير مفعّلة', code: 'PRESENCE_DISABLED' });
    }

    sendJSON(res, 200, {
      ok: true,
      status: result.status || 'online',
      throttled: !!result.throttled,
    });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/workers/online-count?governorate=X&category=Y
 * Requires: requireAuth (any authenticated user)
 */
export async function handleOnlineCount(req, res) {
  try {
    const filters = { acceptingJobs: true, includeAway: false };
    if (req.query.governorate) filters.governorate = req.query.governorate;
    if (req.query.category) filters.categories = [req.query.category];

    const count = await countOnlineByFilters(filters);
    sendJSON(res, 200, { ok: true, count });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}
```

---

## `server/handlers/productionOpsHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/productionOpsHandler.js — Production Ops Admin APIs (Phase 54)
// ═══════════════════════════════════════════════════════════════
// Admin-only production operations endpoints:
// - readiness
// - instance mode
// - process locks
// - scheduler registry
// - ops rollups/SLO
// - incidents
// - backup restore drills
// - maintenance mode
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

// ═══════════════════════════════════════════════════════════════
// Production Readiness + Instance Mode
// ═══════════════════════════════════════════════════════════════

export async function handleProductionReadiness(req, res) {
  try {
    const { getProductionReadiness } = await import('../services/productionReadiness.js');
    const result = await getProductionReadiness();
    return sendJSON(res, 200, { ok: true, readiness: result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في فحص جاهزية الإنتاج',
      code: 'PRODUCTION_READINESS_ERROR',
    });
  }
}

/**
 * GET /api/admin/production/deployment-gate
 * Phase 57 — lightweight deployment gate for admin UI/scripts.
 */
export async function handleDeploymentGate(req, res) {
  try {
    const { getProductionReadiness } = await import('../services/productionReadiness.js');
    const { getScaleHygieneOverview } = await import('../services/scaleHygiene.js');
    const { getMarketplaceRollupFreshness } = await import('../services/marketplaceIntelligenceRollups.js');
    const { getLatestRestoreDrillFreshness } = await import('../services/backupRestoreDrill.js');

    const [readiness, scale, marketplace, restoreDrill] = await Promise.all([
      getProductionReadiness(),
      getScaleHygieneOverview().catch(err => ({ error: err.message, recommendedActions: [] })),
      getMarketplaceRollupFreshness().catch(err => ({ error: err.message })),
      getLatestRestoreDrillFreshness().catch(err => ({ error: err.message })),
    ]);

    const checks = readiness.checks || [];
    const failCount = checks.filter(c => c.status === 'fail').length;
    const warnCount = checks.filter(c => c.status === 'warn').length;

    const recommendedActions = [
      ...(scale.recommendedActions || []),
    ];

    if (marketplace.enabled && marketplace.stale) {
      recommendedActions.push({
        id: 'marketplace_rollup_run',
        label: 'تحديث ملخص ذكاء السوق',
        severity: 'warning',
        command: 'node scripts/rollup-product-intelligence.js',
        adminRoute: '/api/admin/marketplace-intelligence/rollup/run',
        reason: 'Marketplace rollup is stale or missing.',
      });
    }

    if (restoreDrill.enabled && (!restoreDrill.latest || !restoreDrill.fresh || !restoreDrill.passed)) {
      recommendedActions.push({
        id: 'restore_drill_run',
        label: 'تشغيل Restore Drill',
        severity: restoreDrill.latest && !restoreDrill.passed ? 'critical' : 'warning',
        command: 'node scripts/run-backup-restore-drill.js',
        adminRoute: '/api/admin/backups/restore-drill',
        reason: 'Latest restore drill is missing, stale, or failing.',
      });
    }

    return sendJSON(res, 200, {
      ok: failCount === 0,
      status: failCount > 0 ? 'blocked' : (warnCount > 0 ? 'warnings' : 'ready'),
      generatedAt: new Date().toISOString(),
      readiness,
      marketplace,
      restoreDrill,
      scaleSummary: {
        status: scale.status || 'unknown',
        warningCount: scale.warningCount || 0,
      },
      recommendedActions: recommendedActions.slice(0, 12),
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب Deployment Gate',
      code: 'DEPLOYMENT_GATE_ERROR',
    });
  }
}

/**
 * GET /api/admin/production/scheduler-cadence
 * Phase 57 — scheduler cadence visibility.
 */
export async function handleSchedulerCadence(req, res) {
  try {
    const { registerDefaultSchedulerJobs, getSchedulerCadenceReport } = await import('../services/schedulerRegistry.js');

    await registerDefaultSchedulerJobs().catch(() => {});
    const report = await getSchedulerCadenceReport();

    return sendJSON(res, 200, { ok: true, report });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب تقرير الجدولة',
      code: 'SCHEDULER_CADENCE_ERROR',
    });
  }
}

/**
 * GET /api/admin/production/ops-review
 * Phase 57 — compact weekly-review style summary for admin UI.
 */
export async function handleOpsReview(req, res) {
  try {
    const { getProductionReadiness } = await import('../services/productionReadiness.js');
    const { getQueueStats } = await import('../services/opsQueue.js');
    const { computeOpsSlo } = await import('../services/metricsRollups.js');
    const { getScaleHygieneOverview } = await import('../services/scaleHygiene.js');
    const { getMarketplaceIntelligenceDashboard } = await import('../services/marketplaceIntelligenceRollups.js');
    const { getPredictivePrecisionStats } = await import('../services/predictiveSignalRetention.js');
    const { getPaymentDisputeAnalytics } = await import('../services/paymentDisputeAnalytics.js');

    const [
      readiness,
      queue,
      slo,
      scale,
      marketplace,
      predictivePrecision,
      paymentDisputes,
    ] = await Promise.all([
      getProductionReadiness().catch(err => ({ error: err.message })),
      getQueueStats().catch(err => ({ error: err.message })),
      computeOpsSlo().catch(err => ({ error: err.message, violations: [] })),
      getScaleHygieneOverview().catch(err => ({ error: err.message, recommendedActions: [] })),
      getMarketplaceIntelligenceDashboard().catch(err => ({ error: err.message })),
      getPredictivePrecisionStats().catch(err => ({ error: err.message })),
      getPaymentDisputeAnalytics().catch(err => ({ error: err.message })),
    ]);

    return sendJSON(res, 200, {
      ok: true,
      generatedAt: new Date().toISOString(),
      summary: {
        readinessStatus: readiness.status || 'unknown',
        queueDeadLetter: queue.byStatus?.['dead-letter'] || queue.deadLetter || 0,
        opsSloViolations: (slo.violations || []).length,
        scaleStatus: scale.status || 'unknown',
        marketplaceWarnings: marketplace.summary?.warningCount || 0,
        predictivePrecisionRate: predictivePrecision.precisionRate || 0,
        paymentDisputeRate: paymentDisputes.totals?.disputeRate || 0,
      },
      recommendedActions: scale.recommendedActions || [],
      readiness,
      queue,
      slo,
      scale,
      marketplace,
      predictivePrecision,
      paymentDisputes,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب مراجعة التشغيل',
      code: 'OPS_REVIEW_ERROR',
    });
  }
}

export async function handleInstanceMode(req, res) {
  try {
    const { getInstanceInfo } = await import('../services/instanceMode.js');
    const { getWorkerStats } = await import('../services/queueWorkers.js');

    return sendJSON(res, 200, {
      ok: true,
      instance: getInstanceInfo(),
      queueWorker: getWorkerStats(),
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب وضع التشغيل',
      code: 'INSTANCE_MODE_ERROR',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Process Locks
// ═══════════════════════════════════════════════════════════════

export async function handleProcessLocks(req, res) {
  try {
    const { listProcessLocks } = await import('../services/processLock.js');
    const locks = await listProcessLocks();

    return sendJSON(res, 200, {
      ok: true,
      locks,
      total: locks.length,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب أقفال العمليات',
      code: 'PROCESS_LOCKS_ERROR',
    });
  }
}

export async function handleReleaseProcessLock(req, res) {
  try {
    const lockName = req.params.name;
    const { forceReleaseLock } = await import('../services/processLock.js');

    const result = await forceReleaseLock(lockName, adminId(req));

    if (!result.ok) {
      return sendJSON(res, 400, {
        error: result.error || result.code || 'تعذّر تحرير القفل',
        code: result.code || 'LOCK_RELEASE_FAILED',
      });
    }

    logAction({
      adminId: adminId(req),
      action: 'process_lock_force_released',
      targetType: 'process_lock',
      targetId: lockName,
      details: {
        released: !!result.released,
        previousOwnerId: result.previousLock?.ownerId || null,
      },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 200, {
      ok: true,
      released: !!result.released,
      previousLock: result.previousLock || null,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تحرير القفل',
      code: 'PROCESS_LOCK_RELEASE_ERROR',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Scheduler Registry
// ═══════════════════════════════════════════════════════════════

export async function handleListSchedulers(req, res) {
  try {
    const { registerDefaultSchedulerJobs, listSchedulerJobs } = await import('../services/schedulerRegistry.js');

    // Ensure default records exist for visibility.
    await registerDefaultSchedulerJobs().catch(() => {});

    const schedulers = await listSchedulerJobs();

    return sendJSON(res, 200, {
      ok: true,
      schedulers,
      total: schedulers.length,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب سجل الجدولة',
      code: 'SCHEDULERS_LIST_ERROR',
    });
  }
}

export async function handleGetScheduler(req, res) {
  try {
    const { registerDefaultSchedulerJobs, getSchedulerJob } = await import('../services/schedulerRegistry.js');

    await registerDefaultSchedulerJobs().catch(() => {});

    const scheduler = await getSchedulerJob(req.params.name);
    if (!scheduler) {
      return sendJSON(res, 404, {
        error: 'مهمة الجدولة غير موجودة',
        code: 'SCHEDULER_NOT_FOUND',
      });
    }

    return sendJSON(res, 200, { ok: true, scheduler });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب مهمة الجدولة',
      code: 'SCHEDULER_GET_ERROR',
    });
  }
}

export async function handleRunSchedulerNow(req, res) {
  try {
    const { registerDefaultSchedulerJobs, runSchedulerJobNow } = await import('../services/schedulerRegistry.js');

    await registerDefaultSchedulerJobs().catch(() => {});

    const body = req.body || {};
    const result = await runSchedulerJobNow(req.params.name, {
      createdBy: adminId(req),
      force: parseBool(body.force) || parseBool(req.query.force),
      payload: body.payload || undefined,
      priority: body.priority || undefined,
    });

    if (!result.ok) {
      const statusMap = {
        SCHEDULER_NOT_FOUND: 404,
        SCHEDULER_DISABLED: 400,
        LEASE_HELD: 409,
        QUEUE_ENQUEUE_FAILED: 500,
        SCHEDULERS_DISABLED_BY_INSTANCE_MODE: 403,
      };
      return sendJSON(res, statusMap[result.code] || 400, {
        error: result.error || result.code || 'تعذّر تشغيل مهمة الجدولة',
        code: result.code || 'SCHEDULER_RUN_FAILED',
        details: result,
      });
    }

    logAction({
      adminId: adminId(req),
      action: 'scheduler_manual_run',
      targetType: 'scheduler',
      targetId: req.params.name,
      details: {
        queueJobId: result.queueJob?.id || null,
        deduped: !!result.deduped,
      },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 202, {
      ok: true,
      queued: true,
      queueJob: result.queueJob,
      scheduler: result.scheduler,
      deduped: !!result.deduped,
      idempotencyKey: result.idempotencyKey,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تشغيل مهمة الجدولة',
      code: 'SCHEDULER_RUN_ERROR',
    });
  }
}

export async function handleEnableScheduler(req, res) {
  return setSchedulerEnabled(req, res, true);
}

export async function handleDisableScheduler(req, res) {
  return setSchedulerEnabled(req, res, false);
}

async function setSchedulerEnabled(req, res, enabled) {
  try {
    const { enableSchedulerJob } = await import('../services/schedulerRegistry.js');
    const result = await enableSchedulerJob(req.params.name, enabled);

    if (!result.ok) {
      const status = result.code === 'SCHEDULER_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, {
        error: result.error || result.code || 'تعذّر تحديث حالة الجدولة',
        code: result.code || 'SCHEDULER_UPDATE_FAILED',
      });
    }

    logAction({
      adminId: adminId(req),
      action: enabled ? 'scheduler_enabled' : 'scheduler_disabled',
      targetType: 'scheduler',
      targetId: req.params.name,
      details: { enabled },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 200, {
      ok: true,
      scheduler: result.record,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تحديث حالة الجدولة',
      code: 'SCHEDULER_ENABLE_DISABLE_ERROR',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Ops Rollups / SLO
// ═══════════════════════════════════════════════════════════════

export async function handleOpsRollups(req, res) {
  try {
    const { listOpsRollups, captureOpsRollup } = await import('../services/metricsRollups.js');

    if (parseBool(req.query.capture)) {
      await captureOpsRollup({ reason: 'admin_requested' }).catch(() => {});
    }

    const result = await listOpsRollups({
      from: req.query.from || undefined,
      to: req.query.to || undefined,
      limit: parseInt(req.query.limit) || 24,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب rollups التشغيل',
      code: 'OPS_ROLLUPS_ERROR',
    });
  }
}

export async function handleOpsSlo(req, res) {
  try {
    const { computeOpsSlo, captureOpsRollup } = await import('../services/metricsRollups.js');

    if (parseBool(req.query.refresh)) {
      await captureOpsRollup({ reason: 'admin_requested' }).catch(() => {});
    }

    const result = await computeOpsSlo();
    return sendJSON(res, 200, { ok: true, slo: result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب SLO التشغيل',
      code: 'OPS_SLO_ERROR',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Incidents
// ═══════════════════════════════════════════════════════════════

export async function handleListIncidents(req, res) {
  try {
    const { listIncidents } = await import('../services/incidentTimeline.js');

    const result = await listIncidents({
      status: req.query.status || undefined,
      severity: req.query.severity || undefined,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب الحوادث التشغيلية',
      code: 'INCIDENTS_LIST_ERROR',
    });
  }
}

export async function handleGetIncident(req, res) {
  try {
    const { getIncident } = await import('../services/incidentTimeline.js');

    const incident = await getIncident(req.params.id);
    if (!incident) {
      return sendJSON(res, 404, {
        error: 'الحادث غير موجود',
        code: 'INCIDENT_NOT_FOUND',
      });
    }

    return sendJSON(res, 200, { ok: true, incident });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب الحادث',
      code: 'INCIDENT_GET_ERROR',
    });
  }
}

export async function handleResolveIncident(req, res) {
  try {
    const { resolveIncident } = await import('../services/incidentTimeline.js');

    const note = req.body && typeof req.body.note === 'string'
      ? req.body.note.trim().slice(0, 1000)
      : null;

    const result = await resolveIncident(req.params.id, adminId(req), note);

    if (!result.ok) {
      const status = result.code === 'INCIDENT_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, {
        error: result.error || result.code || 'تعذّر حل الحادث',
        code: result.code || 'INCIDENT_RESOLVE_FAILED',
      });
    }

    logAction({
      adminId: adminId(req),
      action: 'incident_resolved',
      targetType: 'incident',
      targetId: req.params.id,
      details: { note },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, incident: result.incident });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في حل الحادث',
      code: 'INCIDENT_RESOLVE_ERROR',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Backup Restore Drills
// ═══════════════════════════════════════════════════════════════

export async function handleRunBackupRestoreDrill(req, res) {
  try {
    const { enqueueJob } = await import('../services/opsQueue.js');

    const body = req.body || {};
    const minuteBucket = new Date().toISOString().slice(0, 16);

    const enqueueResult = await enqueueJob({
      type: 'backup_restore_drill',
      priority: body.priority || 'normal',
      payload: {
        options: {
          backupPath: body.backupPath || undefined,
          keepRestoreTarget: parseBool(body.keepRestoreTarget),
          reason: 'admin_requested',
        },
      },
      idempotencyKey: `backup_restore_drill:manual:${adminId(req)}:${minuteBucket}`,
      createdBy: adminId(req),
    });

    if (!enqueueResult.ok) {
      return sendJSON(res, 500, {
        error: enqueueResult.error || 'تعذّر إضافة Restore Drill للطابور',
        code: 'BACKUP_RESTORE_DRILL_QUEUE_ERROR',
      });
    }

    logAction({
      adminId: adminId(req),
      action: 'backup_restore_drill_queued',
      targetType: 'backup_restore_drill',
      targetId: enqueueResult.job.id,
      details: {
        queueJobId: enqueueResult.job.id,
        deduped: !!enqueueResult.deduped,
        backupPathProvided: !!body.backupPath,
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
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تشغيل Restore Drill',
      code: 'BACKUP_RESTORE_DRILL_ERROR',
    });
  }
}

export async function handleListBackupRestoreDrills(req, res) {
  try {
    const { listRestoreDrills } = await import('../services/backupRestoreDrill.js');

    const result = await listRestoreDrills({
      status: req.query.status || undefined,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب Restore Drills',
      code: 'BACKUP_RESTORE_DRILLS_LIST_ERROR',
    });
  }
}

export async function handleGetBackupRestoreDrill(req, res) {
  try {
    const { getRestoreDrill } = await import('../services/backupRestoreDrill.js');

    const drill = await getRestoreDrill(req.params.id);
    if (!drill) {
      return sendJSON(res, 404, {
        error: 'Restore Drill غير موجود',
        code: 'BACKUP_RESTORE_DRILL_NOT_FOUND',
      });
    }

    return sendJSON(res, 200, { ok: true, drill });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب Restore Drill',
      code: 'BACKUP_RESTORE_DRILL_GET_ERROR',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Maintenance Mode
// ═══════════════════════════════════════════════════════════════

export async function handleGetMaintenanceMode(req, res) {
  try {
    const { getMaintenanceMode } = await import('../services/maintenanceMode.js');
    const maintenance = await getMaintenanceMode();

    return sendJSON(res, 200, { ok: true, maintenance });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب وضع الصيانة',
      code: 'MAINTENANCE_GET_ERROR',
    });
  }
}

export async function handleEnableMaintenanceMode(req, res) {
  try {
    const { enableMaintenanceMode } = await import('../services/maintenanceMode.js');

    const message = req.body && typeof req.body.message === 'string'
      ? req.body.message.trim().slice(0, 500)
      : undefined;

    const result = await enableMaintenanceMode(adminId(req), message);

    if (!result.ok) {
      return sendJSON(res, 400, {
        error: result.error || result.code || 'تعذّر تفعيل وضع الصيانة',
        code: result.code || 'MAINTENANCE_ENABLE_FAILED',
      });
    }

    logAction({
      adminId: adminId(req),
      action: 'maintenance_enabled',
      targetType: 'maintenance',
      targetId: 'maintenance',
      details: { message: result.maintenance.message },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, maintenance: result.maintenance });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تفعيل وضع الصيانة',
      code: 'MAINTENANCE_ENABLE_ERROR',
    });
  }
}

export async function handleDisableMaintenanceMode(req, res) {
  try {
    const { disableMaintenanceMode } = await import('../services/maintenanceMode.js');

    const result = await disableMaintenanceMode(adminId(req));

    if (!result.ok) {
      return sendJSON(res, 400, {
        error: result.error || result.code || 'تعذّر تعطيل وضع الصيانة',
        code: result.code || 'MAINTENANCE_DISABLE_FAILED',
      });
    }

    logAction({
      adminId: adminId(req),
      action: 'maintenance_disabled',
      targetType: 'maintenance',
      targetId: 'maintenance',
      details: {},
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, maintenance: result.maintenance });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تعطيل وضع الصيانة',
      code: 'MAINTENANCE_DISABLE_ERROR',
    });
  }
}
```

---

## `server/handlers/profileTasksHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/profileTasksHandler.js — Profile Tasks API (Phase 53)
// ═══════════════════════════════════════════════════════════════

import { getProfileTasks } from '../services/profileTasks.js';
import { recordProfileTaskClicked } from '../services/activationFunnelMetrics.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * GET /api/profile/tasks
 * Requires: requireAuth
 */
export async function handleGetProfileTasks(req, res) {
  try {
    const result = await getProfileTasks(req.user.id);

    return sendJSON(res, 200, {
      ok: true,
      enabled: result.enabled !== false,
      completionScore: result.completionScore || 0,
      missing: result.missing || [],
      tasks: result.tasks || [],
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب مهام إكمال الملف الشخصي',
      code: 'PROFILE_TASKS_ERROR',
    });
  }
}

/**
 * POST /api/profile/tasks/:id/click
 * Phase 56 — fire-and-forget profile task click tracking.
 * Requires: requireAuth
 */
export async function handleProfileTaskClick(req, res) {
  try {
    const taskId = req.params.id;

    await recordProfileTaskClicked({
      userId: req.user.id,
      role: req.user.role,
      taskId,
      timestamp: new Date().toISOString(),
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true });
  } catch (err) {
    return sendJSON(res, 200, { ok: true });
  }
}
```

---

## `server/handlers/pushHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/pushHandler.js — Push Subscription Handlers
// ═══════════════════════════════════════════════════════════════

import { subscribe, unsubscribe } from '../services/webpush.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * POST /api/push/subscribe
 * Register a push subscription
 * Requires: requireAuth
 * Body: { endpoint, keys: { p256dh, auth } }
 */
export async function handlePushSubscribe(req, res) {
  try {
    const userId = req.user.id;
    const body = req.body || {};
    const userAgent = req.headers['user-agent'] || '';

    const result = await subscribe(userId, {
      endpoint: body.endpoint,
      keys: body.keys,
    }, userAgent);

    if (!result.ok) {
      const statusMap = {
        PUSH_DISABLED: 503,
        INVALID_SUBSCRIPTION: 400,
      };
      const status = statusMap[result.code] || 400;
      return sendJSON(res, status, { error: result.error, code: result.code });
    }

    sendJSON(res, 201, { ok: true, subscriptionId: result.subscription.id });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * DELETE /api/push/subscribe
 * Remove a push subscription
 * Requires: requireAuth
 * Body: { endpoint }
 */
export async function handlePushUnsubscribe(req, res) {
  try {
    const userId = req.user.id;
    const body = req.body || {};

    const result = await unsubscribe(userId, body.endpoint);

    if (!result.ok) {
      return sendJSON(res, 400, { error: result.error, code: result.code });
    }

    sendJSON(res, 200, { ok: true });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}
```

---

## `server/handlers/queueHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/queueHandler.js — Ops Queue + Alert Delivery Admin APIs (Phase 52)
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

// ═══════════════════════════════════════════════════════════════
// Ops Queue
// ═══════════════════════════════════════════════════════════════

export async function handleAdminQueueStats(req, res) {
  try {
    const { getQueueStats } = await import('../services/opsQueue.js');
    const { getWorkerStats } = await import('../services/queueWorkers.js');

    const stats = await getQueueStats();
    const workers = getWorkerStats();

    return sendJSON(res, 200, { ok: true, stats, workers });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب حالة الطابور', code: 'QUEUE_STATS_ERROR' });
  }
}

export async function handleAdminQueueJobs(req, res) {
  try {
    const { listJobs } = await import('../services/opsQueue.js');

    const result = await listJobs({
      status: req.query.status || undefined,
      type: req.query.type || undefined,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب وظائف الطابور', code: 'QUEUE_JOBS_ERROR' });
  }
}

export async function handleAdminQueueJobDetail(req, res) {
  try {
    const { getJob } = await import('../services/opsQueue.js');

    const job = await getJob(req.params.id);
    if (!job) {
      return sendJSON(res, 404, { error: 'وظيفة الطابور غير موجودة', code: 'QUEUE_JOB_NOT_FOUND' });
    }

    return sendJSON(res, 200, { ok: true, job });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب وظيفة الطابور', code: 'QUEUE_JOB_DETAIL_ERROR' });
  }
}

export async function handleAdminRetryQueueJob(req, res) {
  try {
    const { retryJob } = await import('../services/opsQueue.js');

    const result = await retryJob(req.params.id, {
      resetAttempts: req.body?.resetAttempts !== false,
    });

    if (!result.ok) {
      const status = result.error === 'JOB_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, { error: result.error, code: result.error });
    }

    logAction({
      adminId: adminId(req),
      action: 'ops_queue_job_retried',
      targetType: 'ops_queue_job',
      targetId: req.params.id,
      details: { resetAttempts: req.body?.resetAttempts !== false },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, job: result.job });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إعادة تشغيل وظيفة الطابور', code: 'QUEUE_JOB_RETRY_ERROR' });
  }
}

export async function handleAdminCancelQueueJob(req, res) {
  try {
    const { cancelJob } = await import('../services/opsQueue.js');

    const reason = req.body && typeof req.body.reason === 'string'
      ? req.body.reason.slice(0, 500)
      : 'cancelled_by_admin';

    const result = await cancelJob(req.params.id, reason);

    if (!result.ok) {
      const status = result.error === 'JOB_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, { error: result.error, code: result.error });
    }

    logAction({
      adminId: adminId(req),
      action: 'ops_queue_job_cancelled',
      targetType: 'ops_queue_job',
      targetId: req.params.id,
      details: { reason },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, job: result.job });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إلغاء وظيفة الطابور', code: 'QUEUE_JOB_CANCEL_ERROR' });
  }
}

export async function handleAdminDeadLetterJobs(req, res) {
  try {
    const { listJobs } = await import('../services/opsQueue.js');

    const result = await listJobs({
      status: 'dead-letter',
      deadLetter: true,
      type: req.query.type || undefined,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب Dead Letter Queue', code: 'QUEUE_DLQ_ERROR' });
  }
}

export async function handleAdminRetryDeadLetterJob(req, res) {
  // Same retryJob implementation supports active/dead-letter source.
  return handleAdminRetryQueueJob(req, res);
}

// ═══════════════════════════════════════════════════════════════
// Alert Deliveries
// ═══════════════════════════════════════════════════════════════

export async function handleAdminAlertDeliveries(req, res) {
  try {
    const { listDeliveries } = await import('../services/alertDeliveryHistory.js');

    const result = await listDeliveries({
      status: req.query.status || undefined,
      channel: req.query.channel || undefined,
      eventType: req.query.eventType || undefined,
      severity: req.query.severity || undefined,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب سجل تسليم التنبيهات', code: 'ALERT_DELIVERIES_ERROR' });
  }
}

export async function handleAdminAlertDeliveryDetail(req, res) {
  try {
    const { getDelivery } = await import('../services/alertDeliveryHistory.js');

    const delivery = await getDelivery(req.params.id);
    if (!delivery) {
      return sendJSON(res, 404, { error: 'سجل التسليم غير موجود', code: 'DELIVERY_NOT_FOUND' });
    }

    return sendJSON(res, 200, { ok: true, delivery });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب سجل التسليم', code: 'ALERT_DELIVERY_DETAIL_ERROR' });
  }
}

export async function handleAdminRetryAlertDelivery(req, res) {
  try {
    const { retryDelivery } = await import('../services/alertDeliveryHistory.js');

    const result = await retryDelivery(req.params.id, adminId(req));

    if (!result.ok) {
      const status = result.error === 'DELIVERY_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, { error: result.error, code: result.error });
    }

    logAction({
      adminId: adminId(req),
      action: 'alert_delivery_retried',
      targetType: 'alert_delivery',
      targetId: req.params.id,
      details: { queueJobId: result.queueJob?.id || result.delivery?.queueJobId || null },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 200, {
      ok: true,
      delivery: result.delivery,
      queueJob: result.queueJob,
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إعادة إرسال التنبيه', code: 'ALERT_DELIVERY_RETRY_ERROR' });
  }
}

export async function handleAdminAlertDeliveryHealth(req, res) {
  try {
    const { getAlertDeliveryStats } = await import('../services/alertDeliveryHistory.js');
    const stats = await getAlertDeliveryStats();
    return sendJSON(res, 200, { ok: true, stats });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب صحة تسليم التنبيهات', code: 'ALERT_DELIVERY_HEALTH_ERROR' });
  }
}

// ═══════════════════════════════════════════════════════════════
// Async Audit Export
// ═══════════════════════════════════════════════════════════════

export async function handleAdminCreateAuditExportJob(req, res) {
  try {
    const { createExport, updateExportProgress } = await import('../services/exportRegistry.js');
    const { enqueueJob } = await import('../services/opsQueue.js');
    const { getCollectionPath } = await import('../services/database.js');
    const { readdir } = await import('node:fs/promises');

    const body = req.body || {};
    const filters = {
      from: body.from || req.query.from || undefined,
      to: body.to || req.query.to || undefined,
      action: body.action || req.query.action || undefined,
    };

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

    const exportRecord = await createExport({
      type: 'audit_csv',
      filters,
      requestedBy: adminId(req),
      totalEstimate,
    });

    if (!exportRecord) {
      return sendJSON(res, 503, { error: 'سجل التصديرات غير مفعّل', code: 'EXPORTS_DISABLED' });
    }

    await updateExportProgress(exportRecord.id, {
      status: 'pending',
      rowsProcessed: 0,
      totalEstimate,
    }).catch(() => {});

    const enqueueResult = await enqueueJob({
      type: 'audit_csv_export',
      priority: 'normal',
      payload: {
        exportId: exportRecord.id,
        filters,
      },
      // Phase 52: one queue job per export record.
      // Dedupe-by-filters would orphan newly-created export records unless done before createExport().
      idempotencyKey: `audit_csv_export:${exportRecord.id}`,
      createdBy: adminId(req),
    });

    if (!enqueueResult.ok) {
      try {
        const { failExport } = await import('../services/exportRegistry.js');
        await failExport(exportRecord.id, enqueueResult.error || 'EXPORT_QUEUE_ERROR');
      } catch (_) { /* non-fatal */ }

      return sendJSON(res, 500, { error: enqueueResult.error || 'تعذّر إضافة التصدير للطابور', code: 'EXPORT_QUEUE_ERROR' });
    }

    logAction({
      adminId: adminId(req),
      action: 'async_audit_export_created',
      targetType: 'export',
      targetId: exportRecord.id,
      details: {
        filters,
        queueJobId: enqueueResult.job.id,
        deduped: !!enqueueResult.deduped,
      },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 202, {
      ok: true,
      exportId: exportRecord.id,
      queueJobId: enqueueResult.job.id,
      export: exportRecord,
      job: enqueueResult.job,
      deduped: !!enqueueResult.deduped,
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إنشاء تصدير بالخلفية', code: 'ASYNC_EXPORT_CREATE_ERROR' });
  }
}
```

---

## `server/handlers/ratingsHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/ratingsHandler.js — Rating API Handlers
// ═══════════════════════════════════════════════════════════════

import { submitRating, listByJob, listByUser, getUserRatingSummary, getPendingRatings } from '../services/ratings.js';
import { sanitizeText } from '../services/sanitizer.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * POST /api/jobs/:id/rate
 * Submit a rating for a completed job (requireAuth)
 */
export async function handleSubmitRating(req, res) {
  try {
    const jobId = req.params.id;
    const fromUserId = req.user.id;
    const body = req.body || {};

    if (!body.toUserId) {
      return sendJSON(res, 400, { error: 'يجب تحديد المستخدم المُقيَّم', code: 'MISSING_TARGET_USER' });
    }

    const result = await submitRating(jobId, fromUserId, {
      toUserId: body.toUserId,
      stars: body.stars,
      comment: sanitizeText(body.comment),
    });

    if (!result.ok) {
      const notFoundCodes = ['JOB_NOT_FOUND', 'USER_NOT_FOUND'];
      const statusCode = notFoundCodes.includes(result.code) ? 404 : 400;
      return sendJSON(res, statusCode, { error: result.error, code: result.code });
    }

    return sendJSON(res, 201, { ok: true, rating: result.rating });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/jobs/:id/ratings
 * List all ratings for a job (public)
 */
export async function handleListJobRatings(req, res) {
  try {
    const jobId = req.params.id;
    const ratings = await listByJob(jobId);
    return sendJSON(res, 200, { ok: true, ratings, count: ratings.length });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/users/:id/ratings
 * List ratings received by a user (public, paginated)
 */
export async function handleListUserRatings(req, res) {
  try {
    const userId = req.params.id;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const result = await listByUser(userId, { limit, offset });
    return sendJSON(res, 200, { ok: true, items: result.items, total: result.total, limit: result.limit, offset: result.offset });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/users/:id/rating-summary
 * Get rating summary for a user (public)
 */
export async function handleUserRatingSummary(req, res) {
  try {
    const userId = req.params.id;
    const summary = await getUserRatingSummary(userId);
    return sendJSON(res, 200, { ok: true, avg: summary.avg, count: summary.count, distribution: summary.distribution });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/ratings/pending
 * Get pending ratings for the current user (max 3)
 * Requires: requireAuth
 */
export async function handleGetPendingRatings(req, res) {
  try {
    const pending = await getPendingRatings(req.user.id);
    return sendJSON(res, 200, { ok: true, pending });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}
```

---

## `server/handlers/reportsHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/reportsHandler.js — Report & Trust Endpoints
// ═══════════════════════════════════════════════════════════════

import { createReport, listPending, listAll, reviewReport, findById } from '../services/reports.js';
import { getUserTrustScore } from '../services/trust.js';
import { sanitizeText } from '../services/sanitizer.js';
import { logAction } from '../services/auditLog.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * POST /api/reports
 * Create a new report
 * Requires: auth token
 */
export async function handleCreateReport(req, res) {
  try {
    const body = req.body || {};
    const reporterId = req.user.id;
    const targetId = body.targetId;
    const type = body.type;
    const reason = sanitizeText(body.reason || '');
    const jobId = body.jobId || null;

    const result = await createReport(reporterId, targetId, { type, reason, jobId });

    if (!result.ok) {
      const statusMap = {
        REPORTS_DISABLED: 400,
        CANNOT_REPORT_SELF: 400,
        INVALID_REPORT_TYPE: 400,
        REASON_REQUIRED: 400,
        REASON_TOO_SHORT: 400,
        REASON_TOO_LONG: 400,
        TARGET_NOT_FOUND: 404,
        DAILY_REPORT_LIMIT: 429,
        DUPLICATE_REPORT: 409,
      };
      const statusCode = statusMap[result.code] || 400;
      return sendJSON(res, statusCode, { error: result.error, code: result.code });
    }

    return sendJSON(res, 201, { ok: true, report: result.report });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إنشاء البلاغ', code: 'CREATE_REPORT_ERROR' });
  }
}

/**
 * GET /api/admin/reports
 * List reports (paginated, filterable by status)
 * Requires: admin
 */
export async function handleAdminListReports(req, res) {
  try {
    const statusFilter = req.query.status || '';
    let reports;

    if (statusFilter === 'pending') {
      reports = await listPending();
    } else if (statusFilter) {
      const all = await listAll();
      reports = all.filter(r => r.status === statusFilter);
    } else {
      reports = await listAll();
    }

    const total = reports.length;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const totalPages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;
    const paginatedReports = reports.slice(offset, offset + limit);

    return sendJSON(res, 200, {
      ok: true,
      reports: paginatedReports,
      count: paginatedReports.length,
      total,
      page,
      totalPages,
      limit,
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب البلاغات', code: 'LIST_REPORTS_ERROR' });
  }
}

/**
 * PUT /api/admin/reports/:id
 * Review a report
 * Requires: admin
 */
export async function handleAdminReviewReport(req, res) {
  try {
    const reportId = req.params.id;
    const body = req.body || {};
    const status = body.status;
    const adminNotes = sanitizeText(body.adminNotes || '');

    const result = await reviewReport(reportId, { status, adminNotes });

    if (!result.ok) {
      const statusMap = {
        REPORT_NOT_FOUND: 404,
        INVALID_REPORT_STATUS: 400,
      };
      const statusCode = statusMap[result.code] || 400;
      return sendJSON(res, statusCode, { error: result.error, code: result.code });
    }

    // Audit log (fire-and-forget)
    logAction({
      adminId: req.user?.id || 'admin_token',
      action: 'report_reviewed',
      targetType: 'report',
      targetId: reportId,
      details: { status, adminNotes },
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, report: result.report });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في مراجعة البلاغ', code: 'REVIEW_REPORT_ERROR' });
  }
}

/**
 * GET /api/users/:id/trust-score
 * Get trust score for a user
 * Public endpoint
 */
export async function handleGetTrustScore(req, res) {
  try {
    const userId = req.params.id;
    const result = await getUserTrustScore(userId);

    if (!result) {
      return sendJSON(res, 404, { error: 'المستخدم غير موجود', code: 'USER_NOT_FOUND' });
    }

    return sendJSON(res, 200, {
      ok: true,
      score: result.score,
      components: result.components,
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في حساب مؤشر الثقة', code: 'TRUST_SCORE_ERROR' });
  }
}

/**
 * GET /api/users/:id/trust-v2
 * Public-safe Trust Score V2.
 * No PII, no admin notes, no raw abuse details.
 */
export async function handleGetTrustScoreV2(req, res) {
  try {
    const userId = req.params.id;
    const { getTrustScoreV2 } = await import('../services/trustScoreV2.js');

    const result = await getTrustScoreV2(userId, {
      admin: false,
      force: req.query.force === '1' || req.query.force === 'true',
    });

    if (!result) {
      return sendJSON(res, 404, { error: 'المستخدم غير موجود', code: 'USER_NOT_FOUND' });
    }

    return sendJSON(res, 200, {
      ok: true,
      trust: result,
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في حساب مؤشر الثقة V2', code: 'TRUST_SCORE_V2_ERROR' });
  }
}
```

---

## `server/handlers/scaleHygieneHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/scaleHygieneHandler.js — Scale Hygiene Admin APIs (Phase 55)
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

async function enqueueOrRun(req, res, {
  asyncJobType,
  idempotencyKey,
  priority = 'normal',
  payload = {},
  syncFn,
  auditAction,
  auditTargetType,
  auditTargetId,
}) {
  const useAsync = parseBool(req.query.async);

  if (useAsync) {
    const { enqueueJob } = await import('../services/opsQueue.js');

    const enqueueResult = await enqueueJob({
      type: asyncJobType,
      priority,
      payload,
      idempotencyKey,
      createdBy: adminId(req),
    });

    if (!enqueueResult.ok) {
      return sendJSON(res, 500, {
        error: enqueueResult.error || 'تعذّر إضافة المهمة للطابور',
        code: 'QUEUE_ENQUEUE_ERROR',
      });
    }

    logAction({
      adminId: adminId(req),
      action: auditAction + '_queued',
      targetType: auditTargetType,
      targetId: auditTargetId,
      details: {
        queueJobId: enqueueResult.job.id,
        deduped: !!enqueueResult.deduped,
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

  const result = await syncFn();

  logAction({
    adminId: adminId(req),
    action: auditAction,
    targetType: auditTargetType,
    targetId: auditTargetId,
    details: result,
    ip: requestIp(req),
  }).catch(() => {});

  return sendJSON(res, 200, { ok: true, ...result });
}

export async function handleScaleHygieneOverview(req, res) {
  try {
    const { getScaleHygieneOverview } = await import('../services/scaleHygiene.js');

    // Phase 61.1:
    // Admin HTTP overview must be fast and artifact/summary based.
    // Heavy scans remain script/queue/manual.
    //
    // Phase 61.1 hardening:
    // Smoke/readiness paths must never hang behind a slow artifact reader,
    // stale lock, or accidental expensive dependency. If lightweight overview
    // does not finish quickly, return a degraded advisory response instead of
    // timing out the deploy smoke test.
    const timeoutMs = Math.min(4000, Math.max(500, parseInt(req.query.timeoutMs) || 3500));

    const overview = await Promise.race([
      getScaleHygieneOverview({ lightweight: true }),
      new Promise(resolve => setTimeout(() => resolve({
        enabled: true,
        generatedAt: new Date().toISOString(),
        status: 'warning',
        degraded: true,
        timeoutMs,
        warnings: [
          {
            source: 'scale_hygiene',
            level: 'warning',
            message: 'Scale hygiene lightweight overview timed out and returned degraded smoke-safe response',
            details: {
              timeoutMs,
              recommendation: 'Run node scripts/measure-storage-pressure.js --json --persist and inspect server logs.',
            },
          },
        ],
        recommendedActions: [
          {
            id: 'scale_hygiene_overview_timeout',
            label: 'راجع Scale Hygiene HTTP overview',
            severity: 'warning',
            command: 'node scripts/measure-storage-pressure.js --json --persist',
            adminRoute: '/api/admin/scale-hygiene/overview',
            reason: 'Lightweight scale hygiene overview exceeded the smoke-safe timeout.',
          },
        ],
      }), timeoutMs)),
    ]);

    return sendJSON(res, 200, { ok: true, overview });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب نظافة التوسع', code: 'SCALE_HYGIENE_ERROR' });
  }
}

export async function handleQueueHealth(req, res) {
  try {
    const { verifyQueueHealth } = await import('../services/queueHealthVerify.js');
    const health = await verifyQueueHealth();
    return sendJSON(res, 200, { ok: true, health });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في فحص Queue', code: 'QUEUE_HEALTH_ERROR' });
  }
}

export async function handleQueueVerify(req, res) {
  try {
    return enqueueOrRun(req, res, {
      asyncJobType: 'queue_verify',
      priority: 'normal',
      payload: { options: req.body || {} },
      idempotencyKey: `queue_verify:manual:${adminId(req)}:${new Date().toISOString().slice(0, 16)}`,
      syncFn: async () => {
        const { verifyQueueHealth } = await import('../services/queueHealthVerify.js');
        return await verifyQueueHealth(req.body?.options || {});
      },
      auditAction: 'queue_verify',
      auditTargetType: 'queue',
      auditTargetId: 'queue',
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في فحص Queue', code: 'QUEUE_VERIFY_ERROR' });
  }
}

export async function handleQueueCompact(req, res) {
  try {
    return enqueueOrRun(req, res, {
      asyncJobType: 'queue_compaction',
      priority: 'low',
      payload: { options: req.body || {} },
      idempotencyKey: `queue_compaction:manual:${adminId(req)}:${new Date().toISOString().slice(0, 16)}`,
      syncFn: async () => {
        const { compactQueue } = await import('../services/queueCompaction.js');
        return await compactQueue(req.body || {});
      },
      auditAction: 'queue_compaction',
      auditTargetType: 'queue',
      auditTargetId: 'queue',
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في ضغط Queue', code: 'QUEUE_COMPACT_ERROR' });
  }
}

export async function handleQueueRepair(req, res) {
  try {
    return enqueueOrRun(req, res, {
      asyncJobType: 'queue_repair',
      priority: 'high',
      payload: { options: req.body || {} },
      idempotencyKey: `queue_repair:manual:${adminId(req)}:${new Date().toISOString().slice(0, 16)}`,
      syncFn: async () => {
        const { repairQueueStorage } = await import('../services/queueHealthVerify.js');
        return await repairQueueStorage(req.body || {});
      },
      auditAction: 'queue_repair',
      auditTargetType: 'queue',
      auditTargetId: 'queue',
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إصلاح Queue', code: 'QUEUE_REPAIR_ERROR' });
  }
}

export async function handleWorkroomHygieneOverview(req, res) {
  try {
    const { getWorkroomHygieneOverview } = await import('../services/workroomHygiene.js');
    const overview = await getWorkroomHygieneOverview({ limit: parseInt(req.query.limit) || 200 });
    return sendJSON(res, 200, { ok: true, overview });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب نظافة Workrooms', code: 'WORKROOM_HYGIENE_ERROR' });
  }
}

export async function handleWorkroomCompact(req, res) {
  try {
    return enqueueOrRun(req, res, {
      asyncJobType: 'workroom_hygiene_compaction',
      priority: 'low',
      payload: { jobId: req.body?.jobId || null, options: req.body || {} },
      idempotencyKey: `workroom_hygiene_compaction:manual:${adminId(req)}:${new Date().toISOString().slice(0, 16)}`,
      syncFn: async () => {
        const { compactAllWorkrooms, compactWorkroom } = await import('../services/workroomHygiene.js');
        if (req.body?.jobId) return await compactWorkroom(req.body.jobId, req.body || {});
        return await compactAllWorkrooms(req.body || {});
      },
      auditAction: 'workroom_hygiene_compaction',
      auditTargetType: 'workroom_hygiene',
      auditTargetId: req.body?.jobId || 'all',
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في ضغط Workrooms', code: 'WORKROOM_COMPACT_ERROR' });
  }
}

export async function handleWorkroomVerifyIndexes(req, res) {
  try {
    return enqueueOrRun(req, res, {
      asyncJobType: 'workroom_search_verify',
      priority: 'normal',
      payload: { jobId: req.body?.jobId || null, repair: !!req.body?.repair, options: req.body || {} },
      idempotencyKey: `workroom_search_verify:manual:${adminId(req)}:${new Date().toISOString().slice(0, 16)}`,
      syncFn: async () => {
        const mod = await import('../services/workroomIndexHealth.js');
        if (req.body?.jobId && req.body?.repair) return await mod.repairWorkroomSearchIndex(req.body.jobId);
        if (req.body?.jobId) return await mod.verifyWorkroomSearchIndex(req.body.jobId, req.body || {});
        return await mod.verifyAllWorkroomSearchIndexes(req.body || {});
      },
      auditAction: 'workroom_search_verify',
      auditTargetType: 'workroom_search',
      auditTargetId: req.body?.jobId || 'all',
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في فحص Workroom indexes', code: 'WORKROOM_VERIFY_ERROR' });
  }
}

export async function handleWorkroomCleanupAttachments(req, res) {
  try {
    return enqueueOrRun(req, res, {
      asyncJobType: 'workroom_attachment_cleanup',
      priority: 'low',
      payload: { options: req.body || {} },
      idempotencyKey: `workroom_attachment_cleanup:manual:${adminId(req)}:${new Date().toISOString().slice(0, 16)}`,
      syncFn: async () => {
        const { cleanupOrphanAttachments } = await import('../services/workroomHygiene.js');
        return await cleanupOrphanAttachments(req.body || {});
      },
      auditAction: 'workroom_attachment_cleanup',
      auditTargetType: 'workroom_attachments',
      auditTargetId: 'all',
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في تنظيف المرفقات', code: 'ATTACHMENT_CLEANUP_ERROR' });
  }
}

export async function handleTrustRollups(req, res) {
  try {
    const { listTrustSnapshotRollups, getTrustRetentionStats } = await import('../services/trustSnapshotRollups.js');

    const [rollups, stats] = await Promise.all([
      listTrustSnapshotRollups({
        limit: parseInt(req.query.limit) || 20,
        offset: parseInt(req.query.offset) || 0,
      }),
      getTrustRetentionStats(),
    ]);

    return sendJSON(res, 200, { ok: true, stats, ...rollups });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب Trust Rollups', code: 'TRUST_ROLLUPS_ERROR' });
  }
}

export async function handleRunTrustRollup(req, res) {
  try {
    return enqueueOrRun(req, res, {
      asyncJobType: 'trust_snapshot_rollup',
      priority: 'low',
      payload: { options: req.body || {} },
      idempotencyKey: `trust_snapshot_rollup:manual:${adminId(req)}:${new Date().toISOString().slice(0, 16)}`,
      syncFn: async () => {
        const { runTrustRetention } = await import('../services/trustSnapshotRollups.js');
        return await runTrustRetention(req.body || {});
      },
      auditAction: 'trust_snapshot_rollup',
      auditTargetType: 'trust_retention',
      auditTargetId: req.body?.month || 'current',
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في تشغيل Trust Rollup', code: 'TRUST_ROLLUP_RUN_ERROR' });
  }
}

export async function handlePredictiveArchiveIndexStatus(req, res) {
  try {
    const { getPredictiveArchiveIndexStats } = await import('../services/predictiveArchiveIndex.js');
    const stats = await getPredictiveArchiveIndexStats();
    return sendJSON(res, 200, { ok: true, stats });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب فهرس أرشيف المخاطر', code: 'PREDICTIVE_ARCHIVE_INDEX_ERROR' });
  }
}

export async function handleRebuildPredictiveArchiveIndex(req, res) {
  try {
    return enqueueOrRun(req, res, {
      asyncJobType: 'predictive_archive_index_rebuild',
      priority: 'low',
      payload: { options: req.body || {} },
      idempotencyKey: `predictive_archive_index_rebuild:manual:${adminId(req)}:${new Date().toISOString().slice(0, 16)}`,
      syncFn: async () => {
        const { rebuildPredictiveArchiveIndex } = await import('../services/predictiveArchiveIndex.js');
        return await rebuildPredictiveArchiveIndex(req.body || {});
      },
      auditAction: 'predictive_archive_index_rebuild',
      auditTargetType: 'predictive_archive_index',
      auditTargetId: 'predictive_archive_index',
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إعادة بناء فهرس أرشيف المخاطر', code: 'PREDICTIVE_ARCHIVE_REBUILD_ERROR' });
  }
}

export async function handleSchedulerHistory(req, res) {
  try {
    const { listSchedulerRuns } = await import('../services/schedulerRunHistory.js');
    const result = await listSchedulerRuns(req.params.name, {
      month: req.query.month || undefined,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب سجل تشغيل الجدولة', code: 'SCHEDULER_HISTORY_ERROR' });
  }
}
```

---

## `server/handlers/sseHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/sseHandler.js — SSE Notification Stream
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { addConnection, formatSSE } from '../services/sseManager.js';
import { countUnread } from '../services/notifications.js';
import { verifySession } from '../services/sessions.js';
import { findById } from '../services/users.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * GET /api/notifications/stream
 * Self-authenticated SSE endpoint
 * Token via Authorization: Bearer <token> OR ?token= query param
 */
export async function handleNotificationStream(req, res) {
  // ── Feature flag check ──
  if (!config.SSE.enabled) {
    return sendJSON(res, 503, { error: 'خدمة الإشعارات الفورية غير مفعّلة', code: 'SSE_DISABLED' });
  }

  // ── Self-authentication (must happen BEFORE writing SSE headers) ──
  let token = null;

  // Try Authorization header first
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  // Fallback: query parameter
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً', code: 'AUTH_REQUIRED' });
  }

  // Verify session
  const session = await verifySession(token);
  if (!session) {
    return sendJSON(res, 401, { error: 'الجلسة انتهت أو غير صالحة', code: 'SESSION_INVALID' });
  }

  // Load user
  const user = await findById(session.userId);
  if (!user) {
    return sendJSON(res, 401, { error: 'المستخدم غير موجود', code: 'USER_NOT_FOUND' });
  }

  if (user.status === 'banned') {
    return sendJSON(res, 403, { error: 'تم حظر حسابك', code: 'USER_BANNED' });
  }

  if (user.status === 'deleted') {
    return sendJSON(res, 403, { error: 'تم حذف هذا الحساب', code: 'ACCOUNT_DELETED' });
  }

  if (user.status !== 'active') {
    return sendJSON(res, 403, { error: 'الحساب موقوف', code: 'ACCOUNT_SUSPENDED' });
  }

  // ── Auth passed — write SSE headers ──

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',  // Disable nginx buffering
  });

  // ── Bypass request timeout for SSE connections ──
  if (req.socket) {
    req.socket.setTimeout(0);
  }

  // ── Send retry interval suggestion ──
  res.write(`retry: ${config.SSE.reconnectMs}\n\n`);

  // ── Send init event with unread count ──
  let unreadCount = 0;
  try {
    unreadCount = await countUnread(user.id);
  } catch (_) {
    // Non-blocking
  }

  res.write(formatSSE('init', { unreadCount, userId: user.id }));

  // ── Register connection ──
  const lastEventId = req.headers['last-event-id'] || null;
  addConnection(user.id, res, lastEventId);

  // ── Replay missed events (if reconnecting with last-event-id) ──
  if (lastEventId) {
    try {
      const { getEventsSince } = await import('../services/eventReplayBuffer.js');
      const missedEvents = getEventsSince(user.id, lastEventId);
      for (const evt of missedEvents) {
        try {
          if (!res.writableEnded && !res.destroyed) {
            res.write(formatSSE(evt.event, evt.data, evt.id));
          }
        } catch (_) { /* ignore write errors */ }
      }
    } catch (_) {
      // Replay buffer unavailable — degrade gracefully
    }
  }
}
```

---

## `server/handlers/storagePressureHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/storagePressureHandler.js — Phase 59 Admin APIs
// ═══════════════════════════════════════════════════════════════
// Admin handlers for:
// - storage pressure
// - scale thresholds
// - externalization readiness
// - multi-instance boundary
//
// All responses are advisory/additive.
// No external DB/search/queue implementation.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
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

function audit(req, action, targetType, targetId, details = {}) {
  logAction({
    adminId: adminId(req),
    action,
    targetType,
    targetId,
    details,
    ip: requestIp(req),
  }).catch(() => {});
}

/**
 * GET /api/admin/storage-pressure
 */
export async function handleGetStoragePressure(req, res) {
  try {
    const { getStoragePressure } = await import('../services/storagePressure.js');

    const result = await getStoragePressure({
      force: parseBool(req.query.force),
      deep: parseBool(req.query.deep),
      collection: req.query.collection || undefined,
      persist: req.query.persist === 'false' ? false : true,
    });

    return sendJSON(res, 200, {
      ok: true,
      storagePressure: result,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب ضغط التخزين',
      code: 'STORAGE_PRESSURE_ERROR',
    });
  }
}

/**
 * POST /api/admin/storage-pressure/capture
 */
export async function handleCaptureStoragePressure(req, res) {
  try {
    const { captureStoragePressureSnapshot } = await import('../services/storagePressure.js');

    const body = req.body || {};
    const result = await captureStoragePressureSnapshot({
      deep: parseBool(body.deep) || parseBool(req.query.deep),
      collection: body.collection || req.query.collection || undefined,
      sampleJsonParseCount: body.sampleJsonParseCount,
    });

    audit(req, 'storage_pressure_captured', 'storage_pressure', result.id || 'snapshot', {
      status: result.status,
      mode: result.mode,
      scannedFiles: result.scannedFiles || 0,
      warningCount: Array.isArray(result.warnings) ? result.warnings.length : 0,
      criticalCount: Array.isArray(result.criticals) ? result.criticals.length : 0,
    });

    return sendJSON(res, 201, {
      ok: true,
      storagePressure: result,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في إنشاء قياس ضغط التخزين',
      code: 'STORAGE_PRESSURE_CAPTURE_ERROR',
    });
  }
}

/**
 * GET /api/admin/storage-pressure/snapshots
 */
export async function handleListStoragePressureSnapshots(req, res) {
  try {
    const { listStoragePressureSnapshots } = await import('../services/storagePressure.js');

    const result = await listStoragePressureSnapshots({
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, {
      ok: true,
      ...result,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب قياسات ضغط التخزين',
      code: 'STORAGE_PRESSURE_SNAPSHOTS_ERROR',
    });
  }
}

/**
 * GET /api/admin/scale-thresholds
 */
export async function handleGetScaleThresholds(req, res) {
  try {
    const { getScaleThresholdConfig } = await import('../services/scaleThresholds.js');

    return sendJSON(res, 200, {
      ok: true,
      scaleLimits: getScaleThresholdConfig(),
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب حدود التوسع',
      code: 'SCALE_THRESHOLDS_ERROR',
    });
  }
}

/**
 * POST /api/admin/scale-thresholds/verify
 */
export async function handleVerifyScaleThresholds(req, res) {
  try {
    const { verifyScaleThresholds } = await import('../services/scaleThresholds.js');

    const body = req.body || {};
    const result = await verifyScaleThresholds({
      deep: parseBool(body.deep) || parseBool(req.query.deep),
      persist: body.persist === false ? false : true,
    });

    audit(req, 'scale_thresholds_verified', 'scale_thresholds', 'phase59', {
      status: result.status,
      warningCount: Array.isArray(result.warnings) ? result.warnings.length : 0,
      criticalCount: Array.isArray(result.criticals) ? result.criticals.length : 0,
    });

    return sendJSON(res, 200, {
      ok: true,
      verification: result,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في التحقق من حدود التوسع',
      code: 'SCALE_THRESHOLDS_VERIFY_ERROR',
    });
  }
}

/**
 * GET /api/admin/externalization/readiness
 */
export async function handleExternalizationReadiness(req, res) {
  try {
    const { getExternalizationReadiness } = await import('../services/externalizationReadiness.js');

    const result = await getExternalizationReadiness({
      captureIfMissing: parseBool(req.query.captureIfMissing),
      loadPressure: req.query.loadPressure === 'false' ? false : true,
    });

    return sendJSON(res, 200, {
      ok: true,
      readiness: result,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب جاهزية النقل المستقبلي',
      code: 'EXTERNALIZATION_READINESS_ERROR',
    });
  }
}

/**
 * GET /api/admin/production/multi-instance-boundary
 */
export async function handleMultiInstanceBoundary(req, res) {
  try {
    const { getInstanceInfo } = await import('../services/instanceMode.js');

    const instance = getInstanceInfo();

    return sendJSON(res, 200, {
      ok: true,
      boundary: {
        enabled: !!(config.MULTI_INSTANCE_BOUNDARY && config.MULTI_INSTANCE_BOUNDARY.enabled),
        phase: 59,
        implementationAllowed: {
          multiWriterProduction: false,
          distributedLocks: false,
          externalQueue: false,
          eventBusBridge: false,
          sseFanout: false,
        },
        currentInstance: instance,
        supportedModes: [
          {
            mode: 'single_writer',
            productionSafe: true,
            writesAllowed: true,
            queueWorkersAllowed: true,
            schedulersAllowed: true,
            notes: 'Production must run exactly one writer instance.',
          },
          {
            mode: 'read_only_replica',
            productionSafe: true,
            writesAllowed: false,
            queueWorkersAllowed: false,
            schedulersAllowed: false,
            notes: 'Read-only API serving only. Write methods are blocked by readOnlyReplicaMiddleware.',
          },
          {
            mode: 'experimental_multi_instance',
            productionSafe: false,
            writesAllowed: false,
            queueWorkersAllowed: false,
            schedulersAllowed: false,
            notes: 'Development experiment only. Not safe for production multi-writer.',
          },
        ],
        safeReadOnlyApis: [
          'GET /api/health',
          'GET /api/config',
          'GET /api/docs',
          'GET /api/jobs',
          'GET /api/jobs/:id',
          'GET /api/users/:id/public-profile',
          'GET /api/admin/storage-pressure',
          'GET /api/admin/externalization/readiness',
          'GET /api/admin/production/readiness',
          'GET /api/admin/scale-hygiene/overview',
        ],
        unsafeWriterApis: [
          'POST /api/auth/send-otp',
          'POST /api/auth/verify-otp',
          'POST /api/jobs',
          'POST /api/jobs/:id/apply',
          'POST /api/jobs/:id/accept',
          'POST /api/direct-offers',
          'POST /api/direct-offers/:id/accept',
          'POST /api/workrooms/:id/messages',
          'POST /api/admin/*',
          'PUT /api/*',
          'PATCH /api/*',
          'DELETE /api/*',
        ],
        limitations: [
          'File-backed process locks are guardrails, not distributed consensus.',
          'EventBus is in-memory and single-process.',
          'Admin SSE is single-instance.',
          'User SSE/live feed connections are per process.',
          'Queue workers and schedulers require single-writer discipline.',
          'Do not run PM2 cluster mode.',
          'Do not run multiple writers against the same writable data path.',
        ],
        phase60Requirements: [
          'external database',
          'external queue',
          'event bridge/pub-sub',
          'SSE fanout',
          'distributed scheduler/leader election',
          'migration snapshot and rollback plan',
        ],
      },
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب حدود التشغيل متعدد النسخ',
      code: 'MULTI_INSTANCE_BOUNDARY_ERROR',
    });
  }
}
```

---

## `server/handlers/trustCalibrationHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/trustCalibrationHandler.js — Trust Calibration Admin APIs (Phase 53)
// ═══════════════════════════════════════════════════════════════
// Admin-only endpoints for Trust Score V2 calibration:
//   - dashboard
//   - snapshots
//   - queue snapshot batch
//   - queue/generate calibration report
//
// No automatic trust weight changes.
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

/**
 * GET /api/admin/trust/calibration/dashboard
 */
export async function handleAdminTrustCalibrationDashboard(req, res) {
  try {
    const { getCalibrationDashboard } = await import('../services/trustCalibration.js');

    const result = await getCalibrationDashboard({
      role: req.query.role || undefined,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب لوحة معايرة الثقة',
      code: 'TRUST_CALIBRATION_DASHBOARD_ERROR',
    });
  }
}

/**
 * GET /api/admin/trust/snapshots?userId=&role=&from=&to=&limit=&offset=
 */
export async function handleAdminTrustSnapshots(req, res) {
  try {
    const { listTrustSnapshots } = await import('../services/trustCalibration.js');

    const result = await listTrustSnapshots({
      userId: req.query.userId || undefined,
      role: req.query.role || undefined,
      from: req.query.from || undefined,
      to: req.query.to || undefined,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب snapshots الثقة',
      code: 'TRUST_SNAPSHOTS_ERROR',
    });
  }
}

/**
 * POST /api/admin/trust/calibration/snapshot-batch?async=1
 * Body: { role?, limit?, force? }
 */
export async function handleAdminRunTrustSnapshotBatch(req, res) {
  try {
    const body = req.body || {};
    const useAsync = parseBool(req.query.async);

    if (useAsync) {
      const { enqueueJob } = await import('../services/opsQueue.js');

      const minuteBucket = new Date().toISOString().slice(0, 16);
      const role = body.role || req.query.role || 'all';

      const enqueueResult = await enqueueJob({
        type: 'trust_snapshot_batch',
        priority: 'normal',
        payload: {
          role: body.role || req.query.role || undefined,
          limit: body.limit ? parseInt(body.limit) : undefined,
          force: parseBool(body.force),
          reason: 'admin_requested',
        },
        idempotencyKey: `trust_snapshot_batch:manual:${adminId(req)}:${role}:${minuteBucket}`,
        createdBy: adminId(req),
      });

      if (!enqueueResult.ok) {
        return sendJSON(res, 500, {
          error: enqueueResult.error || 'تعذّر إضافة snapshot batch للطابور',
          code: 'QUEUE_ENQUEUE_ERROR',
        });
      }

      logAction({
        adminId: adminId(req),
        action: 'trust_snapshot_batch_queued',
        targetType: 'trust_calibration',
        targetId: 'snapshot_batch',
        details: {
          queueJobId: enqueueResult.job.id,
          deduped: !!enqueueResult.deduped,
          role: body.role || req.query.role || null,
          limit: body.limit || null,
          force: parseBool(body.force),
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

    const { createSnapshotsForActiveUsers } = await import('../services/trustCalibration.js');

    const result = await createSnapshotsForActiveUsers({
      role: body.role || req.query.role || undefined,
      limit: body.limit ? parseInt(body.limit) : undefined,
      force: parseBool(body.force),
      reason: 'admin_requested',
    });

    logAction({
      adminId: adminId(req),
      action: 'trust_snapshot_batch_run',
      targetType: 'trust_calibration',
      targetId: 'snapshot_batch',
      details: {
        scanned: result.scanned || 0,
        created: result.created || 0,
        deduped: result.deduped || 0,
        failed: result.failed || 0,
      },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تشغيل snapshot batch',
      code: 'TRUST_SNAPSHOT_BATCH_ERROR',
    });
  }
}

/**
 * POST /api/admin/trust/calibration/report?async=1
 * Body: { from?, to?, role?, outcomeWindowDays? }
 */
export async function handleAdminRunTrustCalibrationReport(req, res) {
  try {
    const body = req.body || {};
    const useAsync = parseBool(req.query.async);

    const from = body.from || req.query.from || undefined;
    const to = body.to || req.query.to || undefined;
    const role = body.role || req.query.role || undefined;
    const outcomeWindowDays = body.outcomeWindowDays
      ? parseInt(body.outcomeWindowDays)
      : (req.query.outcomeWindowDays ? parseInt(req.query.outcomeWindowDays) : undefined);

    if (useAsync) {
      const { enqueueJob } = await import('../services/opsQueue.js');

      const fromKey = from || 'default_from';
      const toKey = to || 'default_to';
      const roleKey = role || 'all';

      const enqueueResult = await enqueueJob({
        type: 'trust_calibration_report',
        priority: 'normal',
        payload: {
          from,
          to,
          role,
          outcomeWindowDays,
          persist: true,
        },
        idempotencyKey: `trust_calibration_report:${fromKey}:${toKey}:${roleKey}:${outcomeWindowDays || 'default'}`,
        createdBy: adminId(req),
      });

      if (!enqueueResult.ok) {
        return sendJSON(res, 500, {
          error: enqueueResult.error || 'تعذّر إضافة تقرير المعايرة للطابور',
          code: 'QUEUE_ENQUEUE_ERROR',
        });
      }

      logAction({
        adminId: adminId(req),
        action: 'trust_calibration_report_queued',
        targetType: 'trust_calibration',
        targetId: 'report',
        details: {
          queueJobId: enqueueResult.job.id,
          deduped: !!enqueueResult.deduped,
          from,
          to,
          role,
          outcomeWindowDays,
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

    const { generateCalibrationReport } = await import('../services/trustCalibration.js');

    const result = await generateCalibrationReport({
      from,
      to,
      role,
      outcomeWindowDays,
      persist: true,
    });

    if (!result.ok) {
      return sendJSON(res, 400, {
        error: result.error || 'تعذّر إنشاء التقرير',
        code: result.code || 'TRUST_CALIBRATION_REPORT_FAILED',
      });
    }

    logAction({
      adminId: adminId(req),
      action: 'trust_calibration_report_run',
      targetType: 'trust_calibration',
      targetId: result.report?.id || 'report',
      details: {
        sampleCount: result.report?.sampleCount || 0,
        driftWarningCount: result.report?.driftWarnings?.length || 0,
        from,
        to,
        role,
        outcomeWindowDays,
      },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, report: result.report });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في إنشاء تقرير معايرة الثقة',
      code: 'TRUST_CALIBRATION_REPORT_ERROR',
    });
  }
}


// ═══════════════════════════════════════════════════════════════
// Phase 53 — Predictive Signal Precision + Retention Admin APIs
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/admin/predictive-abuse/precision
 */
export async function handleAdminPredictivePrecision(req, res) {
  try {
    const { getPredictivePrecisionStats } = await import('../services/predictiveSignalRetention.js');

    const stats = await getPredictivePrecisionStats({
      from: req.query.from || undefined,
      to: req.query.to || undefined,
    });

    return sendJSON(res, 200, { ok: true, stats });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب دقة إشارات المخاطر',
      code: 'PREDICTIVE_PRECISION_ERROR',
    });
  }
}

/**
 * POST /api/admin/predictive-abuse/retention/run?async=1
 */
export async function handleAdminRunPredictiveSignalRetention(req, res) {
  try {
    const useAsync = parseBool(req.query.async);
    const body = req.body || {};

    if (useAsync) {
      const { enqueueJob } = await import('../services/opsQueue.js');

      const minuteBucket = new Date().toISOString().slice(0, 16);

      const enqueueResult = await enqueueJob({
        type: 'predictive_signal_retention',
        priority: 'normal',
        payload: {
          options: {
            force: parseBool(body.force),
            reason: 'admin_requested',
          },
        },
        idempotencyKey: `predictive_signal_retention:manual:${adminId(req)}:${minuteBucket}`,
        createdBy: adminId(req),
      });

      if (!enqueueResult.ok) {
        return sendJSON(res, 500, {
          error: enqueueResult.error || 'تعذّر إضافة retention للطابور',
          code: 'QUEUE_ENQUEUE_ERROR',
        });
      }

      logAction({
        adminId: adminId(req),
        action: 'predictive_signal_retention_queued',
        targetType: 'predictive_signal_retention',
        targetId: 'retention',
        details: {
          queueJobId: enqueueResult.job.id,
          deduped: !!enqueueResult.deduped,
          force: parseBool(body.force),
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

    const { runPredictiveSignalRetention } = await import('../services/predictiveSignalRetention.js');
    const result = await runPredictiveSignalRetention({
      force: parseBool(body.force),
      reason: 'admin_requested',
    });

    if (!result.ok) {
      return sendJSON(res, 400, {
        error: result.error || result.code || 'تعذّر تشغيل retention',
        code: result.code || 'PREDICTIVE_RETENTION_FAILED',
      });
    }

    logAction({
      adminId: adminId(req),
      action: 'predictive_signal_retention_run',
      targetType: 'predictive_signal_retention',
      targetId: 'retention',
      details: {
        scanned: result.scanned,
        archived: result.archived,
        skipped: result.skipped,
        failed: result.failed,
      },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تشغيل retention لإشارات المخاطر',
      code: 'PREDICTIVE_RETENTION_ERROR',
    });
  }
}

/**
 * POST /api/admin/predictive-abuse/signals/:id/false-positive
 * Body: { note? }
 */
export async function handleAdminMarkPredictiveFalsePositive(req, res) {
  try {
    const { markSignalFalsePositive } = await import('../services/predictiveAbuse.js');

    const signalId = req.params.id;
    const note = req.body && typeof req.body.note === 'string'
      ? req.body.note.trim().slice(0, 500)
      : null;

    const result = await markSignalFalsePositive(signalId, adminId(req), note);

    if (!result.ok) {
      const status = result.code === 'SIGNAL_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, { error: result.error, code: result.code });
    }

    logAction({
      adminId: adminId(req),
      action: 'predictive_signal_false_positive',
      targetType: 'predictive_signal',
      targetId: signalId,
      details: { note },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, signal: result.signal });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تعليم الإشارة كـ False Positive',
      code: 'PREDICTIVE_FALSE_POSITIVE_ERROR',
    });
  }
}

/**
 * POST /api/admin/predictive-abuse/signals/:id/confirm
 * Body: { note? }
 */
export async function handleAdminMarkPredictiveConfirmed(req, res) {
  try {
    const { markSignalConfirmed } = await import('../services/predictiveAbuse.js');

    const signalId = req.params.id;
    const note = req.body && typeof req.body.note === 'string'
      ? req.body.note.trim().slice(0, 500)
      : null;

    const result = await markSignalConfirmed(signalId, adminId(req), note);

    if (!result.ok) {
      const status = result.code === 'SIGNAL_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, { error: result.error, code: result.code });
    }

    logAction({
      adminId: adminId(req),
      action: 'predictive_signal_confirmed',
      targetType: 'predictive_signal',
      targetId: signalId,
      details: { note },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, signal: result.signal });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تأكيد الإشارة',
      code: 'PREDICTIVE_CONFIRM_ERROR',
    });
  }
}
```

---

## `server/handlers/verificationHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/verificationHandler.js — Verification API Handlers
// ═══════════════════════════════════════════════════════════════

import { submitVerification, reviewVerification, listByUser, listAll } from '../services/verification.js';
import { sanitizeText } from '../services/sanitizer.js';
import { logAction } from '../services/auditLog.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * POST /api/auth/verify-identity
 * Submit identity verification (requireAuth)
 */
export async function handleSubmitVerification(req, res) {
  const { nationalIdImage, selfieImage } = req.body || {};

  try {
    const result = await submitVerification(req.user.id, { nationalIdImage, selfieImage });

    if (!result.ok) {
      const statusMap = {
        VERIFICATION_DISABLED: 400,
        IMAGE_REQUIRED: 400,
        IMAGE_TOO_LARGE: 400,
        USER_NOT_FOUND: 404,
        ALREADY_VERIFIED: 409,
        ALREADY_PENDING: 409,
        COOLDOWN_ACTIVE: 429,
        DAILY_VERIFICATION_LIMIT: 429,
      };
      const httpStatus = statusMap[result.code] || 400;
      return sendJSON(res, httpStatus, result);
    }

    return sendJSON(res, 201, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في تقديم طلب التحقق', code: 'VERIFICATION_SUBMIT_ERROR' });
  }
}

/**
 * GET /api/auth/verification-status
 * Get current user's verification status (requireAuth)
 */
export async function handleGetVerificationStatus(req, res) {
  try {
    const submissions = await listByUser(req.user.id);
    const latestSubmission = submissions.length > 0 ? submissions[0] : null;

    // Get fresh user data for verificationStatus
    const { findById } = await import('../services/users.js');
    const user = await findById(req.user.id);
    const verificationStatus = user ? (user.verificationStatus || 'unverified') : 'unverified';

    return sendJSON(res, 200, {
      ok: true,
      verificationStatus,
      latestSubmission: latestSubmission ? {
        id: latestSubmission.id,
        status: latestSubmission.status,
        adminNotes: latestSubmission.adminNotes,
        createdAt: latestSubmission.createdAt,
        reviewedAt: latestSubmission.reviewedAt,
      } : null,
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب حالة التحقق', code: 'VERIFICATION_STATUS_ERROR' });
  }
}

/**
 * GET /api/users/:id/public-profile
 * Public profile view (no auth required)
 */
export async function handleGetPublicProfile(req, res) {
  const userId = req.params.id;

  try {
    const { findById } = await import('../services/users.js');
    const user = await findById(userId);

    if (!user) {
      return sendJSON(res, 404, { error: 'المستخدم غير موجود', code: 'USER_NOT_FOUND' });
    }

    if (user.status === 'deleted') {
      return sendJSON(res, 404, { error: 'المستخدم غير موجود', code: 'USER_NOT_FOUND' });
    }

    // Build safe profile — NEVER expose phone, images, lat/lng, preferences
    const profile = {
      id: user.id,
      name: user.name || 'بدون اسم',
      role: user.role,
      governorate: user.governorate || '',
      categories: user.categories || [],
      rating: user.rating || { avg: 0, count: 0 },
      verificationStatus: user.verificationStatus || 'unverified',
      memberSince: user.createdAt,
    };

    // Optionally add trustScore (non-blocking)
    try {
      const { getUserTrustScore } = await import('../services/trust.js');
      const trustResult = await getUserTrustScore(userId);
      if (trustResult) {
        profile.trustScore = trustResult.score;
        profile.trustComponents = trustResult.components;
      }
    } catch (_) {
      // Non-blocking — trust score is optional
    }

    return sendJSON(res, 200, { ok: true, profile });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب البروفايل', code: 'PUBLIC_PROFILE_ERROR' });
  }
}

/**
 * GET /api/admin/verifications
 * List verifications with pagination + status filter (requireAdmin)
 */
export async function handleAdminListVerifications(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status || undefined;

    const result = await listAll({ page, limit, status });
    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب طلبات التحقق', code: 'ADMIN_VERIFICATIONS_ERROR' });
  }
}

/**
 * PUT /api/admin/verifications/:id
 * Admin reviews a verification request (requireAdmin)
 */
export async function handleAdminReviewVerification(req, res) {
  const verificationId = req.params.id;
  const { status, adminNotes } = req.body || {};

  try {
    const sanitizedNotes = adminNotes ? sanitizeText(adminNotes) : undefined;

    const result = await reviewVerification(verificationId, {
      status,
      adminNotes: sanitizedNotes,
      reviewedBy: 'admin',
    });

    if (!result.ok) {
      const statusMap = {
        VERIFICATION_NOT_FOUND: 404,
        ALREADY_REVIEWED: 409,
        INVALID_VERIFICATION_STATUS: 400,
      };
      const httpStatus = statusMap[result.code] || 400;
      return sendJSON(res, httpStatus, result);
    }

    // Audit log (fire-and-forget)
    logAction({
      adminId: req.user?.id || 'admin_token',
      action: 'verification_reviewed',
      targetType: 'verification',
      targetId: verificationId,
      details: { status, adminNotes: sanitizedNotes },
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
    }).catch(() => {});

    return sendJSON(res, 200, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في مراجعة طلب التحقق', code: 'ADMIN_REVIEW_ERROR' });
  }
}
```

---

## `server/handlers/workerDiscoveryHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/workerDiscoveryHandler.js — Talent Discovery Endpoints
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { discoverWorkers, getWorkerCard } from '../services/workerDiscovery.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * GET /api/workers/discover?lat=&lng=&radius=&category=&minWage=&maxWage=&governorate=&sortBy=&limit=&offset=
 * Returns 3-tier worker pool with composite scoring + privacy-first cards.
 * Requires: requireAuth + requireRole('employer')
 */
export async function handleDiscoverWorkers(req, res) {
  try {
    if (!config.WORKER_DISCOVERY || !config.WORKER_DISCOVERY.enabled) {
      return sendJSON(res, 503, { error: 'اكتشاف العمال غير مفعّل', code: 'DISCOVERY_DISABLED' });
    }

    const q = req.query || {};

    // Parse coordinates
    let lat;
    let lng;
    if (q.lat !== undefined && q.lat !== '') {
      lat = parseFloat(q.lat);
      if (isNaN(lat)) {
        return sendJSON(res, 400, { error: 'lat غير صالح', code: 'INVALID_LAT' });
      }
    }
    if (q.lng !== undefined && q.lng !== '') {
      lng = parseFloat(q.lng);
      if (isNaN(lng)) {
        return sendJSON(res, 400, { error: 'lng غير صالح', code: 'INVALID_LNG' });
      }
    }

    // Fall back to employer's stored location if not provided
    if (lat === undefined || lng === undefined) {
      const user = req.user;
      if (typeof user.lat === 'number' && typeof user.lng === 'number') {
        lat = user.lat;
        lng = user.lng;
      } else {
        // Resolve from governorate
        try {
          const { resolveCoordinates } = await import('../services/geo.js');
          const coords = resolveCoordinates({ governorate: user.governorate });
          if (coords) {
            lat = coords.lat;
            lng = coords.lng;
          }
        } catch (_) { /* non-blocking */ }
      }
    }

    const radiusKm = q.radius !== undefined && q.radius !== ''
      ? Math.min(parseFloat(q.radius) || config.WORKER_DISCOVERY.defaultRadiusKm, config.WORKER_DISCOVERY.maxRadiusKm)
      : config.WORKER_DISCOVERY.defaultRadiusKm;

    const categories = [];
    if (q.category) categories.push(q.category);
    if (q.categories && typeof q.categories === 'string') {
      const parts = q.categories.split(',').map(s => s.trim()).filter(Boolean);
      for (const p of parts) {
        if (!categories.includes(p)) categories.push(p);
      }
    }

    const options = {
      lat,
      lng,
      radiusKm,
      categories: categories.length > 0 ? categories : undefined,
      governorate: q.governorate || undefined,
      minWage: q.minWage !== undefined && q.minWage !== '' ? parseFloat(q.minWage) : undefined,
      maxWage: q.maxWage !== undefined && q.maxWage !== '' ? parseFloat(q.maxWage) : undefined,
      sortBy: q.sortBy || 'composite',
      limit: q.limit !== undefined && q.limit !== '' ? Math.min(parseInt(q.limit) || 20, 50) : 20,
      offset: q.offset !== undefined && q.offset !== '' ? Math.max(parseInt(q.offset) || 0, 0) : 0,
      employerId: req.user.id,
    };

    const result = await discoverWorkers(options);
    sendJSON(res, 200, {
      ok: true,
      workers: result.workers,
      total: result.total,
      filters: {
        lat: options.lat || null,
        lng: options.lng || null,
        radiusKm: options.radiusKm,
        categories: options.categories || null,
        governorate: options.governorate || null,
      },
    });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في اكتشاف العمال', code: 'DISCOVER_ERROR' });
  }
}

/**
 * GET /api/workers/:id/card
 * Returns a privacy-first worker card.
 * Requires: requireAuth (any role)
 */
export async function handleGetWorkerCard(req, res) {
  try {
    const workerId = req.params.id;
    const card = await getWorkerCard(workerId);

    if (!card) {
      return sendJSON(res, 404, { error: 'العامل غير موجود', code: 'WORKER_NOT_FOUND' });
    }

    sendJSON(res, 200, { ok: true, card });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في جلب بيانات العامل', code: 'CARD_ERROR' });
  }
}

/**
 * POST /api/workers/:id/quick-offer
 * Phase 42: real implementation — delegates to directOffer.create().
 * Body: { adId?, category, governorate, proposedDailyWage, proposedStartDate, proposedDurationDays?, message? }
 * Requires: requireAuth + requireRole('employer')
 */
export async function handleQuickOffer(req, res) {
  try {
    const employerId = req.user.id;
    const workerId = req.params.id;
    const body = req.body || {};

    if (!body.category || !body.governorate || typeof body.proposedDailyWage !== 'number' || !body.proposedStartDate) {
      return sendJSON(res, 400, { error: 'بيانات العرض غير مكتملة', code: 'INVALID_OFFER_FIELDS' });
    }

    const { create } = await import('../services/directOffer.js');
    const result = await create(employerId, workerId, {
      adId: body.adId || null,
      category: body.category,
      governorate: body.governorate,
      proposedDailyWage: body.proposedDailyWage,
      proposedStartDate: body.proposedStartDate,
      proposedDurationDays: body.proposedDurationDays || 1,
      message: body.message || null,
    });

    if (!result.ok) {
      const statusMap = {
        OFFERS_DISABLED: 503,
        SELF_OFFER: 400,
        INVALID_EMPLOYER: 403,
        INVALID_WORKER: 404,
        INVALID_FIELDS: 400,
        INVALID_CATEGORY: 400,
        INVALID_GOVERNORATE: 400,
        INVALID_WAGE: 400,
        INVALID_START_DATE: 400,
        INVALID_DURATION: 400,
        MESSAGE_TOO_LONG: 400,
        CONTENT_BLOCKED: 400,
        EMPLOYER_PENDING_CAP: 429,
        WORKER_PENDING_CAP: 429,
        EMPLOYER_DAILY_CAP: 429,
        DUPLICATE_PENDING: 409,
        INVALID_AD: 400,
      };
      const status = statusMap[result.code] || 400;
      return sendJSON(res, status, { error: result.error, code: result.code });
    }

    sendJSON(res, 201, { ok: true, offer: result.offer });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}
```

---

## `server/handlers/workroomHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/workroomHandler.js — Workroom API Handlers (Phase 51)
// ═══════════════════════════════════════════════════════════════
// Job-scoped workroom endpoints.
// Builds on existing messages service without breaking old APIs.
// ═══════════════════════════════════════════════════════════════

import {
  getUserWorkrooms,
  getWorkroom,
  listWorkroomMessages,
  sendWorkroomMessage,
  markWorkroomRead,
  getWorkroomTimeline,
  getWorkroomSummary,
  resolveWorkroomAccess,
} from '../services/workroom.js';
import { eventBus } from '../services/eventBus.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const ERROR_STATUS = {
  WORKROOM_DISABLED: 503,
  INVALID_REQUEST: 400,
  JOB_NOT_FOUND: 404,
  WORKROOM_NOT_AVAILABLE: 400,
  NOT_WORKROOM_PARTICIPANT: 403,
  TEXT_REQUIRED: 400,
  TEXT_TOO_LONG: 400,
  RECIPIENT_REQUIRED: 400,
  RECIPIENT_NOT_INVOLVED: 403,
  CANNOT_MESSAGE_SELF: 400,
  DAILY_MESSAGE_LIMIT: 429,
  CONTENT_BLOCKED: 400,
  MESSAGES_DISABLED: 503,
  JOB_STATUS_NOT_ELIGIBLE: 400,
  NOT_INVOLVED: 403,
  RECIPIENT_NOT_INVOLVED: 403,
  READ_RECEIPTS_DISABLED: 503,
  MESSAGE_NOT_FOUND: 404,
  QUERY_TOO_SHORT: 400,
  PINS_DISABLED: 503,
  PIN_FORBIDDEN: 403,
  MAX_PINS_REACHED: 429,
  CHECKLIST_DISABLED: 503,
  CHECKLIST_FORBIDDEN: 403,
  CHECKLIST_ITEM_NOT_FOUND: 404,
  MAX_CHECKLIST_ITEMS: 429,
  INVALID_ASSIGNEE: 400,
  INVALID_STATUS: 400,
  ATTACHMENTS_DISABLED: 503,
  INVALID_ATTACHMENT: 400,
  ATTACHMENT_STORE_FAILED: 400,
  MAX_ATTACHMENTS_EXCEEDED: 400,
  INVALID_ATTACHMENTS: 400,
};

function errorStatus(code) {
  return ERROR_STATUS[code] || 400;
}

/**
 * GET /api/workrooms
 * List current user's workrooms.
 * Requires: requireAuth
 */
export async function handleListWorkrooms(req, res) {
  try {
    const result = await getUserWorkrooms(req.user.id, {
      status: req.query.status || undefined,
      activeOnly: req.query.activeOnly === 'false' ? false : true,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب مساحات العمل', code: 'WORKROOM_LIST_ERROR' });
  }
}

/**
 * GET /api/workrooms/:id
 * Get one workroom by jobId.
 * Requires: requireAuth
 */
export async function handleGetWorkroom(req, res) {
  try {
    const jobId = req.params.id;
    const result = await getWorkroom(jobId, req.user.id);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    try {
      eventBus.emit('workroom:opened', {
        jobId,
        userId: req.user.id,
        role: result.workroom?.userRoleInWorkroom || req.user.role,
        timestamp: new Date().toISOString(),
      });
    } catch (_) {}

    return sendJSON(res, 200, { ok: true, workroom: result.workroom });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب مساحة العمل', code: 'WORKROOM_GET_ERROR' });
  }
}

/**
 * GET /api/workrooms/:id/messages
 * List workroom messages.
 * Requires: requireAuth
 */
export async function handleListWorkroomMessages(req, res) {
  try {
    const jobId = req.params.id;
    const result = await listWorkroomMessages(jobId, req.user.id, {
      limit: Math.min(100, Math.max(1, parseInt(req.query.limit) || 50)),
      offset: Math.max(0, parseInt(req.query.offset) || 0),
    });

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    return sendJSON(res, 200, {
      ok: true,
      items: result.items || [],
      total: result.total || 0,
      limit: result.limit || 50,
      offset: result.offset || 0,
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب رسائل مساحة العمل', code: 'WORKROOM_MESSAGES_ERROR' });
  }
}

/**
 * POST /api/workrooms/:id/messages
 * Body: { text, recipientId?, templateKey? }
 * Requires: requireAuth
 */
export async function handleSendWorkroomMessage(req, res) {
  try {
    const jobId = req.params.id;
    const body = req.body || {};

    const result = await sendWorkroomMessage(jobId, req.user.id, {
      text: body.text,
      recipientId: body.recipientId || null,
      templateKey: body.templateKey || null,
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
    });

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    try {
      eventBus.emit('workroom:message_sent', {
        jobId,
        userId: req.user.id,
        senderId: req.user.id,
        role: result.message?.senderRole || req.user.role,
        messageId: result.message?.id || null,
        hasAttachments: Array.isArray(result.message?.attachments) && result.message.attachments.length > 0,
        templateKey: result.message?.templateKey || null,
        timestamp: new Date().toISOString(),
      });
    } catch (_) {}

    return sendJSON(res, 201, { ok: true, message: result.message });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إرسال رسالة مساحة العمل', code: 'WORKROOM_SEND_ERROR' });
  }
}

/**
 * POST /api/workrooms/:id/messages/read-all
 * Mark all workroom messages as read for current user.
 * Requires: requireAuth
 */
export async function handleMarkWorkroomRead(req, res) {
  try {
    const jobId = req.params.id;
    const result = await markWorkroomRead(jobId, req.user.id);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    return sendJSON(res, 200, { ok: true, count: result.count || 0 });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في تحديث قراءة الرسائل', code: 'WORKROOM_READ_ERROR' });
  }
}

/**
 * GET /api/workrooms/:id/timeline
 * Get workroom timeline.
 * Requires: requireAuth
 */
export async function handleGetWorkroomTimeline(req, res) {
  try {
    const jobId = req.params.id;
    const result = await getWorkroomTimeline(jobId, req.user.id, {
      limit: Math.min(500, Math.max(1, parseInt(req.query.limit) || 200)),
      type: req.query.type || undefined,
    });

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    try {
      eventBus.emit('workroom:timeline_viewed', {
        jobId,
        userId: req.user.id,
        role: req.user.role,
        total: result.total || 0,
        timestamp: new Date().toISOString(),
      });
    } catch (_) {}

    return sendJSON(res, 200, {
      ok: true,
      timeline: result.timeline || [],
      total: result.total || 0,
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب سجل مساحة العمل', code: 'WORKROOM_TIMELINE_ERROR' });
  }
}


/**
 * GET /api/workrooms/:id/search?q=&limit=
 * Search visible workroom messages.
 * Requires: requireAuth
 */
export async function handleSearchWorkroomMessages(req, res) {
  try {
    const jobId = req.params.id;
    const q = req.query.q || '';

    if (!q || String(q).trim().length < 2) {
      return sendJSON(res, 400, { error: 'كلمة البحث لازم تكون حرفين على الأقل', code: 'QUERY_TOO_SHORT' });
    }

    const access = await resolveWorkroomAccess(jobId, req.user.id);
    if (!access.allowed) {
      return sendJSON(res, errorStatus(access.code), { error: access.error, code: access.code });
    }

    const { searchWorkroomMessages } = await import('../services/workroomSearch.js');

    const result = await searchWorkroomMessages(jobId, q, {
      userId: req.user.id,
      limit: parseInt(req.query.limit) || 50,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في البحث داخل مساحة العمل', code: 'WORKROOM_SEARCH_ERROR' });
  }
}

/**
 * GET /api/workrooms/:id/read-receipts
 * Get read receipts for the workroom.
 * Requires: requireAuth
 */
export async function handleGetWorkroomReadReceipts(req, res) {
  try {
    const jobId = req.params.id;

    const access = await resolveWorkroomAccess(jobId, req.user.id);
    if (!access.allowed) {
      return sendJSON(res, errorStatus(access.code), { error: access.error, code: access.code });
    }

    const { getReadReceipts } = await import('../services/workroomReceipts.js');
    const receipts = await getReadReceipts(jobId);

    return sendJSON(res, 200, { ok: true, receipts });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب قراءات الرسائل', code: 'WORKROOM_RECEIPTS_ERROR' });
  }
}

/**
 * POST /api/workrooms/:id/messages/:messageId/read
 * Mark a single message as read in the workroom receipts sidecar.
 * Requires: requireAuth
 */
export async function handleMarkWorkroomMessageRead(req, res) {
  try {
    const jobId = req.params.id;
    const messageId = req.params.messageId;

    const { markMessageRead } = await import('../services/workroomReceipts.js');
    const result = await markMessageRead(jobId, messageId, req.user.id);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    const code = err.code || 'WORKROOM_MESSAGE_READ_ERROR';
    return sendJSON(res, errorStatus(code), { error: err.message || 'خطأ في تعليم الرسالة كمقروءة', code });
  }
}


/**
 * GET /api/workrooms/:id/pins
 */
export async function handleListWorkroomPins(req, res) {
  try {
    const { listPins } = await import('../services/workroomPins.js');
    const result = await listPins(req.params.id, req.user.id);
    return sendJSON(res, 200, { ok: true, pins: result.pins || [], total: result.total || 0 });
  } catch (err) {
    const code = err.code || 'WORKROOM_PINS_ERROR';
    return sendJSON(res, errorStatus(code), { error: err.message || 'خطأ في جلب الرسائل المثبتة', code });
  }
}

/**
 * POST /api/workrooms/:id/pins
 * Body: { messageId, note? }
 */
export async function handlePinWorkroomMessage(req, res) {
  try {
    const { pinMessage } = await import('../services/workroomPins.js');
    const body = req.body || {};
    const messageId = body.messageId;

    if (!messageId || typeof messageId !== 'string') {
      return sendJSON(res, 400, { error: 'معرّف الرسالة مطلوب', code: 'MESSAGE_ID_REQUIRED' });
    }

    const result = await pinMessage(req.params.id, messageId, req.user.id, body.note || null);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    try {
      eventBus.emit('workroom:message_pinned', {
        jobId: req.params.id,
        userId: req.user.id,
        role: req.user.role,
        messageId,
        idempotent: !!result.idempotent,
        timestamp: new Date().toISOString(),
      });
    } catch (_) {}

    return sendJSON(res, 201, { ok: true, pin: result.pin, idempotent: !!result.idempotent });
  } catch (err) {
    const code = err.code || 'WORKROOM_PIN_ERROR';
    return sendJSON(res, errorStatus(code), { error: err.message || 'خطأ في تثبيت الرسالة', code });
  }
}

/**
 * DELETE /api/workrooms/:id/pins/:messageId
 */
export async function handleUnpinWorkroomMessage(req, res) {
  try {
    const { unpinMessage } = await import('../services/workroomPins.js');
    const result = await unpinMessage(req.params.id, req.params.messageId, req.user.id);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    return sendJSON(res, 200, { ok: true, removed: !!result.removed });
  } catch (err) {
    const code = err.code || 'WORKROOM_UNPIN_ERROR';
    return sendJSON(res, errorStatus(code), { error: err.message || 'خطأ في إلغاء تثبيت الرسالة', code });
  }
}

/**
 * GET /api/workrooms/:id/checklist
 */
export async function handleGetWorkroomChecklist(req, res) {
  try {
    const { getChecklist } = await import('../services/workroomChecklist.js');
    const result = await getChecklist(req.params.id, req.user.id);
    return sendJSON(res, 200, { ok: true, checklist: result.checklist });
  } catch (err) {
    const code = err.code || 'WORKROOM_CHECKLIST_ERROR';
    return sendJSON(res, errorStatus(code), { error: err.message || 'خطأ في جلب قائمة المهام', code });
  }
}

/**
 * POST /api/workrooms/:id/checklist
 * Body: { text, assignedTo? }
 */
export async function handleCreateWorkroomChecklistItem(req, res) {
  try {
    const { createChecklistItem } = await import('../services/workroomChecklist.js');
    const result = await createChecklistItem(req.params.id, req.user.id, req.body || {});

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    try {
      eventBus.emit('workroom:checklist_item_created', {
        jobId: req.params.id,
        userId: req.user.id,
        role: req.user.role,
        itemId: result.item?.id || null,
        timestamp: new Date().toISOString(),
      });
    } catch (_) {}

    return sendJSON(res, 201, { ok: true, item: result.item });
  } catch (err) {
    const code = err.code || 'WORKROOM_CHECKLIST_CREATE_ERROR';
    return sendJSON(res, errorStatus(code), { error: err.message || 'خطأ في إنشاء المهمة', code });
  }
}

/**
 * PUT /api/workrooms/:id/checklist/:itemId
 * Body: { text?, status?, assignedTo? }
 */
export async function handleUpdateWorkroomChecklistItem(req, res) {
  try {
    const { updateChecklistItem } = await import('../services/workroomChecklist.js');
    const result = await updateChecklistItem(req.params.id, req.params.itemId, req.user.id, req.body || {});

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    try {
      if (result.item && result.item.status === 'completed') {
        eventBus.emit('workroom:checklist_item_completed', {
          jobId: req.params.id,
          userId: req.user.id,
          role: req.user.role,
          itemId: result.item.id || req.params.itemId,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (_) {}

    return sendJSON(res, 200, { ok: true, item: result.item });
  } catch (err) {
    const code = err.code || 'WORKROOM_CHECKLIST_UPDATE_ERROR';
    return sendJSON(res, errorStatus(code), { error: err.message || 'خطأ في تحديث المهمة', code });
  }
}

/**
 * DELETE /api/workrooms/:id/checklist/:itemId
 */
export async function handleDeleteWorkroomChecklistItem(req, res) {
  try {
    const { deleteChecklistItem } = await import('../services/workroomChecklist.js');
    const result = await deleteChecklistItem(req.params.id, req.params.itemId, req.user.id);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    return sendJSON(res, 200, { ok: true, deleted: true });
  } catch (err) {
    const code = err.code || 'WORKROOM_CHECKLIST_DELETE_ERROR';
    return sendJSON(res, errorStatus(code), { error: err.message || 'خطأ في حذف المهمة', code });
  }
}


/**
 * POST /api/workrooms/:id/attachments
 * Body: { dataUri, caption?, clientName? }
 * Requires: requireAuth
 */
export async function handleUploadWorkroomAttachment(req, res) {
  try {
    const jobId = req.params.id;
    const body = req.body || {};

    if (!body.dataUri || typeof body.dataUri !== 'string') {
      return sendJSON(res, 400, { error: 'بيانات المرفق مطلوبة', code: 'INVALID_ATTACHMENT' });
    }

    const { storeWorkroomAttachment } = await import('../services/workroomAttachments.js');

    const result = await storeWorkroomAttachment(jobId, req.user.id, body.dataUri, {
      caption: body.caption || null,
      clientName: body.clientName || null,
      purpose: 'workroom_attachment',
    });

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    try {
      eventBus.emit('workroom:attachment_uploaded', {
        jobId,
        userId: req.user.id,
        role: req.user.role,
        attachmentType: result.attachment?.type || 'image',
        timestamp: new Date().toISOString(),
      });
    } catch (_) {}

    return sendJSON(res, 201, { ok: true, attachment: result.attachment });
  } catch (err) {
    const code = err.code || 'WORKROOM_ATTACHMENT_ERROR';
    return sendJSON(res, errorStatus(code), { error: err.message || 'خطأ في رفع المرفق', code });
  }
}

/**
 * GET /api/workrooms/:id/summary
 * Requires: requireAuth
 */
export async function handleGetWorkroomSummary(req, res) {
  try {
    const result = await getWorkroomSummary(req.params.id, req.user.id);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    return sendJSON(res, 200, { ok: true, summary: result.summary });
  } catch (err) {
    const code = err.code || 'WORKROOM_SUMMARY_ERROR';
    return sendJSON(res, errorStatus(code), { error: err.message || 'خطأ في جلب ملخص مساحة العمل', code });
  }
}
```

---

## `server/middleware/auth.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/middleware/auth.js — Auth Middleware
// ═══════════════════════════════════════════════════════════════

import { verifySession } from '../services/sessions.js';
import { findById } from '../services/users.js';
import { checkUserRateLimit } from './rateLimit.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function envFlag(name) {
  return process.env[name] === 'true' || process.env[name] === '1';
}

function isAdminQueryTokenAllowed(req) {
  if (!req || !req.query) return false;

  // Umbrella legacy override. Keep false by default.
  if (envFlag('ADMIN_QUERY_TOKEN_ENABLED')) return true;

  const isDownloadRoute =
    req.method === 'GET' &&
    (
      req.pathname === '/api/admin/audit-log/export' ||
      req.pathname.startsWith('/api/admin/export/') ||
      (req.pathname.startsWith('/api/admin/exports/') && req.pathname.endsWith('/download'))
    );

  return isDownloadRoute && envFlag('ADMIN_DOWNLOAD_QUERY_TOKEN_ENABLED');
}

/**
 * requireAuth middleware
 * Reads Authorization: Bearer <token>
 * Sets req.user and req.session
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً', code: 'AUTH_REQUIRED' });
  }

  verifySession(token)
    .then((session) => {
      if (!session) {
        return sendJSON(res, 401, { error: 'الجلسة انتهت أو غير صالحة', code: 'SESSION_INVALID' });
      }
      return findById(session.userId).then((user) => {
        if (!user) {
          return sendJSON(res, 401, { error: 'المستخدم غير موجود', code: 'USER_NOT_FOUND' });
        }
        if (user.status === 'banned') {
          return sendJSON(res, 403, { error: 'تم حظر حسابك. تواصل مع الدعم.', code: 'USER_BANNED' });
        }
        if (user.status === 'deleted') {
          return sendJSON(res, 403, { error: 'تم حذف هذا الحساب', code: 'ACCOUNT_DELETED' });
        }
        if (user.status !== 'active') {
          return sendJSON(res, 403, { error: 'الحساب موقوف', code: 'ACCOUNT_SUSPENDED' });
        }
        req.user = user;
        req.session = session;

        // Phase 50: enforce per-user rate limit after authentication.
        if (!checkUserRateLimit(req, res)) return;

        next();
      });
    })
    .catch((err) => {
      sendJSON(res, 500, { error: 'خطأ في التحقق من الجلسة', code: 'AUTH_ERROR' });
    });
}

/**
 * requireRole middleware factory
 * Must be used after requireAuth
 */
export function requireRole(role) {
  return function (req, res, next) {
    if (!req.user) {
      return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً', code: 'AUTH_REQUIRED' });
    }
    if (req.user.role !== role) {
      return sendJSON(res, 403, { error: 'غير مسموح بهذا الإجراء', code: 'FORBIDDEN' });
    }
    next();
  };
}

/**
 * requireAdmin middleware
 * Checks either admin role via session or ADMIN_TOKEN
 */
export function requireAdmin(req, res, next) {
  // Check via ADMIN_TOKEN header
  const adminToken = req.headers['x-admin-token'];
  if (adminToken && adminToken === process.env.ADMIN_TOKEN) {
    req.isAdmin = true;
    return next();
  }

  // Patch 38: query-string admin tokens are disabled by default.
  // They can leak via logs, browser history, referrers, reverse proxies, analytics,
  // screenshots, and browser extensions.
  //
  // Temporary legacy override:
  //   ADMIN_QUERY_TOKEN_ENABLED=true              => allow all legacy query-token admin paths
  //   ADMIN_DOWNLOAD_QUERY_TOKEN_ENABLED=true     => allow only direct-download query-token paths
  //
  // Preferred temporary path: X-Admin-Token header.
  // Future path: real admin sessions + short-lived signed download tokens.
  const queryToken = req.query && (req.query.token || req.query._token);
  if (queryToken && queryToken === process.env.ADMIN_TOKEN && isAdminQueryTokenAllowed(req)) {
    req.isAdmin = true;
    return next();
  }

  if (queryToken && queryToken === process.env.ADMIN_TOKEN && !isAdminQueryTokenAllowed(req)) {
    return sendJSON(res, 401, {
      error: 'Admin query-token authentication is disabled',
      code: 'ADMIN_QUERY_TOKEN_DISABLED',
    });
  }

  // Check via session (admin role)
  if (req.user && req.user.role === 'admin') {
    req.isAdmin = true;
    return next();
  }

  // If not authenticated at all, try auth first
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return sendJSON(res, 401, { error: 'صلاحيات الأدمن مطلوبة', code: 'ADMIN_REQUIRED' });
  }

  verifySession(token)
    .then((session) => {
      if (!session) {
        return sendJSON(res, 401, { error: 'الجلسة غير صالحة', code: 'SESSION_INVALID' });
      }
      return findById(session.userId).then((user) => {
        if (!user || user.role !== 'admin') {
          return sendJSON(res, 403, { error: 'صلاحيات الأدمن مطلوبة', code: 'ADMIN_REQUIRED' });
        }
        req.user = user;
        req.session = session;
        req.isAdmin = true;
        next();
      });
    })
    .catch(() => {
      sendJSON(res, 500, { error: 'خطأ في التحقق', code: 'AUTH_ERROR' });
    });
}

export { requireCapability } from '../services/adminRbac.js';
```

---

## `server/middleware/bodyParser.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/middleware/bodyParser.js — JSON Body Parser
// ═══════════════════════════════════════════════════════════════

const MAX_BODY_SIZE = 4 * 1024 * 1024; // 4MB (supports base64 image upload for verification)

export function bodyParserMiddleware(req, res, next) {
  const method = req.method;
  if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') {
    req.body = {};
    return next();
  }

  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    req.body = {};
    return next();
  }

  let body = '';
  let size = 0;

  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY_SIZE) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'حجم الطلب كبير جداً', code: 'BODY_TOO_LARGE' }));
      req.destroy();
      return;
    }
    body += chunk;
  });

  req.on('end', () => {
    if (res.writableEnded) return;

    if (!body) {
      req.body = {};
      return next();
    }

    try {
      req.body = JSON.parse(body);
      next();
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'JSON غير صحيح', code: 'INVALID_JSON' }));
    }
  });

  req.on('error', (err) => {
    if (!res.writableEnded) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'خطأ في قراءة الطلب', code: 'READ_ERROR' }));
    }
  });
}
```

---

## `server/middleware/cors.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/middleware/cors.js — CORS Headers (Config-Driven)
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

export function corsMiddleware(req, res, next) {
  const allowedOrigins = config.SECURITY.allowedOrigins;
  const origin = req.headers.origin;

  if (allowedOrigins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  next();
}
```

---

## `server/middleware/maintenance.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/middleware/maintenance.js — Maintenance Guard (Phase 54)
// ═══════════════════════════════════════════════════════════════
// Optional middleware. No-op unless MAINTENANCE_MODE.enabled=true and
// data/ops/maintenance.json has enabled=true.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export function maintenanceMiddleware(req, res, next) {
  import('../services/maintenanceMode.js')
    .then(async ({ getMaintenanceMode, isRouteAllowedDuringMaintenance, isFeatureEnabled }) => {
      // Phase 55 hotfix:
      // MAINTENANCE_MODE_ENABLED=true must work even when config.MAINTENANCE_MODE.enabled=false.
      // The service is the source of truth for env override behavior.
      if (!isFeatureEnabled()) {
        return next();
      }

      const state = await getMaintenanceMode();

      if (!state || !state.enabled) {
        return next();
      }

      if (isRouteAllowedDuringMaintenance(req)) {
        return next();
      }

      return sendJSON(res, 503, {
        error: state.message || config.MAINTENANCE_MODE.message,
        code: 'MAINTENANCE_MODE',
        maintenance: true,
      });
    })
    .catch(() => {
      // Fail-open if maintenance check itself fails.
      next();
    });
}
```

---

## `server/middleware/rateLimit.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/middleware/rateLimit.js — In-memory Rate Limiter
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

/** @type {Map<string, { count: number, resetAt: number }>} */
const store = new Map();

// Cleanup interval — every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let cleanupTimer = null;

function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) {
        store.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);
  // Don't prevent process exit
  if (cleanupTimer.unref) cleanupTimer.unref();
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';
}

function sendRateLimit(res, statusCode, payload, extraHeaders = {}) {
  if (res.writableEnded) return;
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function consumeBucket(key, maxRequests, windowMs, now = Date.now()) {
  let entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }

  entry.count++;

  return {
    allowed: entry.count <= maxRequests,
    count: entry.count,
    remaining: Math.max(0, maxRequests - entry.count),
    resetAt: entry.resetAt,
  };
}

function setRateLimitHeaders(res, prefix, limit, result) {
  if (!res || res.headersSent) return;
  res.setHeader(`${prefix}-Limit`, String(limit));
  res.setHeader(`${prefix}-Remaining`, String(result.remaining));
  res.setHeader(`${prefix}-Reset`, String(Math.ceil(result.resetAt / 1000)));
}

function isWriteMethod(method) {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

function isAlwaysAllowedRequest(req) {
  if (!req || !req.pathname) return false;
  if (req.method === 'OPTIONS') return true;
  return req.pathname === '/api/health' ||
    req.pathname === '/api/config' ||
    req.pathname === '/api/docs';
}

function isSseEndpoint(req) {
  if (!req || req.method !== 'GET') return false;
  return req.pathname === '/api/notifications/stream' ||
    req.pathname === '/api/jobs/live-feed' ||
    req.pathname === '/api/admin/events';
}

function isPresenceHeartbeat(req) {
  return !!(
    req &&
    req.method === 'POST' &&
    req.pathname === '/api/presence/heartbeat'
  );
}

function isOtpSendEndpoint(req) {
  return !!(
    req &&
    req.method === 'POST' &&
    req.pathname === '/api/auth/send-otp'
  );
}

function isOtpVerifyEndpoint(req) {
  return !!(
    req &&
    req.method === 'POST' &&
    req.pathname === '/api/auth/verify-otp'
  );
}

function isAdminWriteRequest(req) {
  return !!(
    req &&
    req.pathname &&
    req.pathname.startsWith('/api/admin/') &&
    req.method !== 'GET'
  );
}

function isAdminReadRequest(req) {
  return !!(
    req &&
    req.method === 'GET' &&
    req.pathname &&
    req.pathname.startsWith('/api/admin/')
  );
}

function isBackgroundReadRequest(req) {
  if (!req || req.method !== 'GET' || !req.pathname) return false;

  const path = req.pathname;

  if (
    path === '/api/auth/me' ||
    path === '/api/notifications' ||
    path === '/api/messages/unread-count' ||
    path === '/api/profile/tasks' ||
    path === '/api/jobs' ||
    path === '/api/jobs/mine' ||
    path === '/api/jobs/nearby' ||
    path === '/api/applications/mine' ||
    path === '/api/direct-offers/mine' ||
    path === '/api/direct-offers/stats/employer' ||
    path === '/api/direct-offers/stats/worker' ||
    path === '/api/alerts' ||
    path === '/api/availability/windows' ||
    path === '/api/availability-ads/mine' ||
    path === '/api/workers/online-count' ||
    path === '/api/workers/discover' ||
    path === '/api/favorites' ||
    path === '/api/ratings/pending' ||
    path === '/api/analytics/employer' ||
    path === '/api/analytics/worker'
  ) {
    return true;
  }

  if (path.startsWith('/api/workrooms')) return true;
  if (path.startsWith('/api/jobs/') && (
    path.endsWith('/messages') ||
    path.endsWith('/applications') ||
    path.endsWith('/attendance') ||
    path.endsWith('/attendance/summary') ||
    path.endsWith('/payment') ||
    path.endsWith('/receipt') ||
    path.endsWith('/ratings')
  )) return true;

  if (path.startsWith('/api/users/') && (
    path.endsWith('/ratings') ||
    path.endsWith('/rating-summary') ||
    path.endsWith('/trust-score') ||
    path.endsWith('/trust-v2') ||
    path.endsWith('/public-profile')
  )) return true;

  return false;
}

function isLowRiskWriteRequest(req) {
  if (!req || !isWriteMethod(req.method) || !req.pathname) return false;

  const path = req.pathname;

  if (
    path === '/api/notifications/read-all' ||
    path === '/api/push/subscribe'
  ) {
    return true;
  }

  if (path.startsWith('/api/notifications/') && (
    path.endsWith('/read') ||
    path.endsWith('/action-click')
  )) return true;

  if (path.startsWith('/api/profile/tasks/') && path.endsWith('/click')) return true;
  if (path.startsWith('/api/jobs/') && path.endsWith('/messages/read-all')) return true;
  if (path.startsWith('/api/workrooms/') && path.endsWith('/messages/read-all')) return true;
  if (path.startsWith('/api/workrooms/') && path.includes('/messages/') && path.endsWith('/read')) return true;

  return false;
}

function isHighRiskWriteRequest(req) {
  if (!req || !isWriteMethod(req.method) || !req.pathname) return false;

  const path = req.pathname;

  if (
    path === '/api/jobs' ||
    path === '/api/direct-offers' ||
    path === '/api/reports'
  ) {
    return true;
  }

  if (path.startsWith('/api/jobs/') && (
    path.endsWith('/apply') ||
    path.endsWith('/accept') ||
    path.endsWith('/reject') ||
    path.endsWith('/start') ||
    path.endsWith('/complete') ||
    path.endsWith('/cancel') ||
    path.endsWith('/renew') ||
    path.endsWith('/duplicate') ||
    path.endsWith('/payment') ||
    path.endsWith('/rate')
  )) return true;

  if (path.startsWith('/api/direct-offers/') && (
    path.endsWith('/accept') ||
    path.endsWith('/decline') ||
    req.method === 'DELETE'
  )) return true;

  if (path.startsWith('/api/payments/') && (
    path.endsWith('/confirm') ||
    path.endsWith('/dispute')
  )) return true;

  if (path.startsWith('/api/applications/') && (
    path.endsWith('/withdraw') ||
    path.endsWith('/confirm') ||
    path.endsWith('/decline')
  )) return true;

  return false;
}

function isPenaltyEligibleRequest(req) {
  return isOtpSendEndpoint(req) ||
    isOtpVerifyEndpoint(req) ||
    isAdminWriteRequest(req) ||
    isHighRiskWriteRequest(req);
}

function softThrottleMessage() {
  return 'الاتصال سريع جدًا حاليًا. استنى ثواني وجرب تاني.';
}

function penaltyMessage() {
  return 'تم إيقاف الطلبات مؤقتًا بسبب محاولات كثيرة جدًا. حاول بعد دقائق.';
}

export function rateLimitMiddleware(req, res, next) {
  if (!config.RATE_LIMIT.enabled) return next();

  startCleanup();

  // Use IP as key (or forwarded IP)
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';

  const now = Date.now();

  if (isAlwaysAllowedRequest(req)) {
    return next();
  }

  // Penalty check must run BEFORE incrementing normal counters.
  const penaltyKey = `penalty:${ip}`;
  const penaltyEntry = store.get(penaltyKey);
  if (penaltyEntry && now < penaltyEntry.cooldownUntil) {
    const retryAfter = Math.ceil((penaltyEntry.cooldownUntil - now) / 1000);
    return sendRateLimit(res, 429, {
      error: penaltyMessage(),
      code: 'PENALTY_COOLDOWN',
      retryAfter,
    }, {
      'Retry-After': String(retryAfter),
    });
  }

  // SSE endpoints are long-lived connections. Do not count them like normal API requests.
  if (isSseEndpoint(req)) {
    const sseWindowMs = 5 * 60 * 1000;
    const sseMaxAttempts = config.RATE_LIMIT.sseMaxAttempts || 20;
    const result = consumeBucket(`sse:${ip}`, sseMaxAttempts, sseWindowMs, now);
    setRateLimitHeaders(res, 'X-RateLimit-SSE', sseMaxAttempts, result);

    if (!result.allowed) {
      return sendRateLimit(res, 429, {
        error: softThrottleMessage(),
        code: 'SSE_RATE_LIMITED',
      });
    }

    return next();
  }

  // Presence heartbeat already has its own service-level throttle.
  // Keep it out of global penalty to avoid punishing normal online status updates.
  if (isPresenceHeartbeat(req)) {
    const presenceWindowMs = 60000;
    const presenceMaxRequests = config.RATE_LIMIT.presenceMaxRequests || 120;
    const result = consumeBucket(`presence:${ip}`, presenceMaxRequests, presenceWindowMs, now);
    setRateLimitHeaders(res, 'X-RateLimit-Presence', presenceMaxRequests, result);

    if (!result.allowed) {
      return sendRateLimit(res, 429, {
        error: softThrottleMessage(),
        code: 'PRESENCE_RATE_LIMITED',
      });
    }

    return next();
  }

  // OTP-specific rate limiting remains strict and penalty-eligible.
  if (isOtpSendEndpoint(req)) {
    const otpWindowMs = config.RATE_LIMIT.otpWindowMs;
    const otpMaxRequests = config.RATE_LIMIT.otpMaxRequests;
    const result = consumeBucket(`otp:${ip}`, otpMaxRequests, otpWindowMs, now);
    setRateLimitHeaders(res, 'X-RateLimit-OTP', otpMaxRequests, result);

    if (!result.allowed) {
      recordViolation(ip);
      return sendRateLimit(res, 429, {
        error: 'تم تجاوز الحد المسموح من طلبات كود التحقق. حاول بعد قليل.',
        code: 'OTP_RATE_LIMITED',
      });
    }

    return next();
  }

  // OTP verify is auth-sensitive. Keep stricter than background traffic.
  if (isOtpVerifyEndpoint(req)) {
    const verifyWindowMs = config.RATE_LIMIT.otpWindowMs;
    const verifyMaxRequests = config.RATE_LIMIT.otpVerifyMaxRequests || 20;
    const result = consumeBucket(`otp_verify:${ip}`, verifyMaxRequests, verifyWindowMs, now);
    setRateLimitHeaders(res, 'X-RateLimit-OTP-Verify', verifyMaxRequests, result);

    if (!result.allowed) {
      recordViolation(ip);
      return sendRateLimit(res, 429, {
        error: 'محاولات التحقق كثيرة جدًا. حاول بعد قليل.',
        code: 'OTP_VERIFY_RATE_LIMITED',
      });
    }

    return next();
  }

  // Admin write-specific rate limiting remains strict and penalty-eligible.
  if (isAdminWriteRequest(req)) {
    const adminWindowMs = 60000;
    const adminMaxRequests = config.RATE_LIMIT.adminWriteMaxRequests || 10;
    const result = consumeBucket(`admin:${ip}`, adminMaxRequests, adminWindowMs, now);
    setRateLimitHeaders(res, 'X-RateLimit-Admin', adminMaxRequests, result);

    if (!result.allowed) {
      recordViolation(ip);
      return sendRateLimit(res, 429, {
        error: 'تم تجاوز الحد المسموح من عمليات الأدمن. حاول بعد قليل.',
        code: 'ADMIN_RATE_LIMITED',
      });
    }

    return next();
  }

  // Admin dashboards are read-heavy. Relax reads but do not make them penalty-eligible.
  if (isAdminReadRequest(req)) {
    const adminReadWindowMs = 60000;
    const adminReadMaxRequests = config.RATE_LIMIT.adminReadMaxRequests || 240;
    const result = consumeBucket(`admin_read:${ip}`, adminReadMaxRequests, adminReadWindowMs, now);
    setRateLimitHeaders(res, 'X-RateLimit-Admin-Read', adminReadMaxRequests, result);

    if (!result.allowed) {
      return sendRateLimit(res, 429, {
        error: softThrottleMessage(),
        code: 'ADMIN_READ_RATE_LIMITED',
      });
    }

    return next();
  }

  // High-risk marketplace writes stay protected and penalty-eligible.
  if (isHighRiskWriteRequest(req)) {
    const highRiskWindowMs = 60000;
    const highRiskMaxRequests = config.RATE_LIMIT.highRiskMaxRequests || 30;
    const result = consumeBucket(`high_risk:${ip}`, highRiskMaxRequests, highRiskWindowMs, now);
    setRateLimitHeaders(res, 'X-RateLimit-High-Risk', highRiskMaxRequests, result);

    if (!result.allowed) {
      recordViolation(ip);
      return sendRateLimit(res, 429, {
        error: config.RATE_LIMIT.message,
        code: 'HIGH_RISK_RATE_LIMITED',
      });
    }

    return next();
  }

  // Background reads are common in dashboard/workroom UX. Relax and do not penalize.
  if (isBackgroundReadRequest(req)) {
    const bgWindowMs = 60000;
    const bgMaxRequests = config.RATE_LIMIT.backgroundMaxRequests || 240;
    const result = consumeBucket(`background:${ip}`, bgMaxRequests, bgWindowMs, now);
    setRateLimitHeaders(res, 'X-RateLimit-Background', bgMaxRequests, result);

    if (!result.allowed) {
      return sendRateLimit(res, 429, {
        error: softThrottleMessage(),
        code: 'BACKGROUND_RATE_LIMITED',
      });
    }

    return next();
  }

  // Low-risk writes such as read receipts and analytics clicks should not cause penalties.
  if (isLowRiskWriteRequest(req)) {
    const lowRiskWindowMs = 60000;
    const lowRiskMaxRequests = config.RATE_LIMIT.lowRiskWriteMaxRequests || 120;
    const result = consumeBucket(`low_risk_write:${ip}`, lowRiskMaxRequests, lowRiskWindowMs, now);
    setRateLimitHeaders(res, 'X-RateLimit-Low-Risk-Write', lowRiskMaxRequests, result);

    if (!result.allowed) {
      return sendRateLimit(res, 429, {
        error: softThrottleMessage(),
        code: 'LOW_RISK_WRITE_RATE_LIMITED',
      });
    }

    return next();
  }

  // Fallback global limiter for unclassified routes.
  const windowMs = config.RATE_LIMIT.windowMs;
  const maxRequests = Math.max(config.RATE_LIMIT.maxRequests || 60, config.RATE_LIMIT.normalMaxRequests || 120);
  const result = consumeBucket(`global:${ip}`, maxRequests, windowMs, now);

  setRateLimitHeaders(res, 'X-RateLimit', maxRequests, result);

  if (!result.allowed) {
    if (isPenaltyEligibleRequest(req)) {
      recordViolation(ip);
    }

    return sendRateLimit(res, 429, {
      error: config.RATE_LIMIT.message,
      code: 'RATE_LIMITED',
    });
  }

  // ── Per-user rate limiting (authenticated endpoints only) ──
  if (config.RATE_LIMIT.perUserEnabled && req.user && req.user.id) {
    const userId = req.user.id;
    const userKey = `user:${userId}`;
    const userWindowMs = config.RATE_LIMIT.perUserWindowMs;
    const userMaxRequests = config.RATE_LIMIT.perUserMaxRequests;

    let userEntry = store.get(userKey);
    if (!userEntry || now > userEntry.resetAt) {
      userEntry = { count: 0, resetAt: now + userWindowMs };
      store.set(userKey, userEntry);
    }

    userEntry.count++;

    // Set per-user rate limit header
    res.setHeader('X-RateLimit-User-Remaining', String(Math.max(0, userMaxRequests - userEntry.count)));

    if (userEntry.count > userMaxRequests) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: config.RATE_LIMIT.message,
        code: 'USER_RATE_LIMITED',
      }));
      recordViolation(ip);
      return;
    }
  }

  next();
}

/**
 * Record a rate limit violation for penalty tracking.
 * @param {string} ip
 */
function recordViolation(ip) {
  const now = Date.now();
  const violationKey = `violations:${ip}`;
  const penaltyWindowMs = config.RATE_LIMIT.penaltyWindowMs;
  const penaltyThreshold = config.RATE_LIMIT.penaltyThreshold;
  const penaltyCooldownMs = config.RATE_LIMIT.penaltyCooldownMs;

  let violations = store.get(violationKey);
  if (!violations || now > violations.resetAt) {
    violations = { timestamps: [], resetAt: now + penaltyWindowMs };
    store.set(violationKey, violations);
  }

  violations.timestamps.push(now);

  // Clean old timestamps within window
  violations.timestamps = violations.timestamps.filter(ts => now - ts < penaltyWindowMs);

  // Check if threshold reached
  if (violations.timestamps.length >= penaltyThreshold) {
    const penaltyKey = `penalty:${ip}`;
    store.set(penaltyKey, {
      cooldownUntil: now + penaltyCooldownMs,
      resetAt: now + penaltyCooldownMs + 60000, // cleanup margin
    });
    // Reset violation counter
    store.delete(violationKey);
  }
}

/**
 * Check authenticated per-user rate limit.
 * Phase 50: global rateLimitMiddleware runs before route auth, so req.user is
 * usually unavailable there. requireAuth calls this after loading the user.
 *
 * @param {object} req
 * @param {object} res
 * @returns {boolean} true if allowed, false if response was sent
 */
export function checkUserRateLimit(req, res) {
  if (!config.RATE_LIMIT.enabled || !config.RATE_LIMIT.perUserEnabled) return true;
  if (!req.user || !req.user.id) return true;

  // Authenticated background UX routes should not consume the strict per-user bucket.
  // They are already handled by relaxed IP buckets in rateLimitMiddleware.
  if (
    isAlwaysAllowedRequest(req) ||
    isSseEndpoint(req) ||
    isPresenceHeartbeat(req) ||
    isBackgroundReadRequest(req) ||
    isLowRiskWriteRequest(req)
  ) {
    return true;
  }

  const now = Date.now();
  const userId = req.user.id;

  const isHighRisk = isHighRiskWriteRequest(req);
  const userKey = isHighRisk ? `user_high_risk:${userId}` : `user:${userId}`;
  const userWindowMs = config.RATE_LIMIT.perUserWindowMs;
  const userMaxRequests = isHighRisk
    ? (config.RATE_LIMIT.perUserHighRiskMaxRequests || 30)
    : config.RATE_LIMIT.perUserMaxRequests;

  const result = consumeBucket(userKey, userMaxRequests, userWindowMs, now);

  setRateLimitHeaders(res, 'X-RateLimit-User', userMaxRequests, result);

  if (!result.allowed) {
    sendRateLimit(res, 429, {
      error: isHighRisk ? config.RATE_LIMIT.message : softThrottleMessage(),
      code: isHighRisk ? 'USER_HIGH_RISK_RATE_LIMITED' : 'USER_RATE_LIMITED',
    });
    return false;
  }

  return true;
}

/**
 * Reset store — useful for testing
 */
export function resetRateLimit() {
  store.clear();
}
```

---

## `server/middleware/readOnlyReplica.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/middleware/readOnlyReplica.js — Read-Only Replica Write Guard (Phase 57)
// ═══════════════════════════════════════════════════════════════
// Blocks write APIs when INSTANCE_MODE=read_only_replica.
// Static files are served before global middleware, so they are unaffected.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { isReadOnlyReplica } from '../services/instanceMode.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function isWriteMethod(method) {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

function isAlwaysAllowed(req) {
  if (!req || !req.pathname) return false;

  if (req.method === 'OPTIONS') return true;

  if (config.READ_ONLY_REPLICA_GUARD?.allowHealthAndConfig) {
    if (req.pathname === '/api/health') return true;
    if (req.pathname === '/api/config') return true;
    if (req.pathname === '/api/docs') return true;
  }

  if (config.READ_ONLY_REPLICA_GUARD?.allowMaintenanceRead) {
    if (req.method === 'GET' && req.pathname === '/api/admin/maintenance') return true;
  }

  return false;
}

/**
 * Allow all GET requests on read-only replica.
 * This preserves public reads and admin read-only ops dashboards.
 */
function isAllowedRead(req) {
  if (!req || req.method !== 'GET') return false;
  if (!req.pathname || !req.pathname.startsWith('/api/')) return false;

  if (config.READ_ONLY_REPLICA_GUARD?.allowPublicReadApis) return true;
  if (config.READ_ONLY_REPLICA_GUARD?.allowAdminReadOnlyOps && req.pathname.startsWith('/api/admin/')) return true;

  return false;
}

export function readOnlyReplicaMiddleware(req, res, next) {
  const guard = config.READ_ONLY_REPLICA_GUARD || {};

  if (!guard.enabled || !guard.blockWriteApisInReadOnlyReplica) {
    return next();
  }

  if (!isReadOnlyReplica()) {
    return next();
  }

  if (isAlwaysAllowed(req)) {
    return next();
  }

  if (!isWriteMethod(req.method)) {
    if (isAllowedRead(req)) return next();
    return next();
  }

  return sendJSON(res, 403, {
    error: guard.message || 'هذه النسخة للقراءة فقط. حاول من النسخة الرئيسية.',
    code: 'READ_ONLY_REPLICA_WRITE_BLOCKED',
    readOnlyReplica: true,
  });
}

export const _testHelpers = {
  isWriteMethod,
  isAlwaysAllowed,
  isAllowedRead,
};
```

---

## `server/middleware/requestId.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/middleware/requestId.js — X-Request-Id
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';

export function requestIdMiddleware(req, res, next) {
  const id = crypto.randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}
```

---

## `server/middleware/security.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/middleware/security.js — Security Headers Middleware
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

/**
 * Apply configured security headers to a response.
 * Phase 50: exported so staticMiddleware can set headers even though static
 * files are served before the global middleware chain.
 */
export function applySecurityHeaders(res) {
  const headers = config.SECURITY.headers;

  if (headers.xContentTypeOptions) {
    res.setHeader('X-Content-Type-Options', headers.xContentTypeOptions);
  }
  if (headers.xFrameOptions) {
    res.setHeader('X-Frame-Options', headers.xFrameOptions);
  }
  if (headers.referrerPolicy) {
    res.setHeader('Referrer-Policy', headers.referrerPolicy);
  }
  if (headers.contentSecurityPolicy) {
    res.setHeader('Content-Security-Policy', headers.contentSecurityPolicy);
  }
}

/**
 * Adds security headers to every response
 */
export function securityMiddleware(req, res, next) {
  applySecurityHeaders(res);
  next();
}
```

---

## `server/middleware/static.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/middleware/static.js — Static File Serving Middleware
// ═══════════════════════════════════════════════════════════════

import { readFile, stat } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import config from '../../config.js';
import { applySecurityHeaders } from './security.js';

const STATIC_ROOT = resolve(config.STATIC.root);

/**
 * Static file serving middleware.
 * Serves files from frontend/ directory for non-API paths.
 * Falls through to next() for /api/* paths or when file is not found.
 */
export function staticMiddleware(req, res, next) {
  // Skip API routes — let them pass through to the API chain
  if (req.pathname.startsWith('/api/') || req.pathname === '/api') {
    return next();
  }

  serveStatic(req, res, next).catch(() => {
    next();
  });
}

async function serve404(res, next) {
  try {
    const notFoundPath = resolve(join(STATIC_ROOT, '404.html'));
    const content = await readFile(notFoundPath);
    applySecurityHeaders(res);
    res.writeHead(404, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': content.length,
    });
    res.end(content);
  } catch {
    next();
  }
}

async function serveStatic(req, res, next) {
  let urlPath = req.pathname;

  // Serve index file for root path
  if (urlPath === '/') {
    urlPath = '/' + config.STATIC.indexFile;
  }

  // Decode URI components
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(urlPath);
  } catch {
    return next();
  }

  // Resolve absolute path
  const filePath = resolve(join(STATIC_ROOT, decodedPath));

  // Directory traversal prevention — resolved path must start with STATIC_ROOT
  if (!filePath.startsWith(STATIC_ROOT)) {
    return next();
  }

  // Check if file exists
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return serve404(res, next);
    }
  } catch {
    return serve404(res, next);
  }

  // Determine Content-Type
  const ext = extname(filePath).toLowerCase();
  const contentType = config.STATIC.mimeTypes[ext] || 'application/octet-stream';

  // Read and serve file
  const content = await readFile(filePath);

  applySecurityHeaders(res);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': content.length,
    'Cache-Control': `public, max-age=${config.STATIC.maxAge}`,
  });
  res.end(content);
}
```

---

## `server/middleware/timing.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/middleware/timing.js — Request Timing + Metrics
// ═══════════════════════════════════════════════════════════════
// Measures response time, sets X-Response-Time header,
// logs slow requests (>500ms), tracks rolling metrics (p50/p95/p99).
// ═══════════════════════════════════════════════════════════════

import { logger } from '../services/logger.js';

const SLOW_THRESHOLD_MS = 500;
const MAX_ROLLING_WINDOW = 1000;

// ── In-memory state ──────────────────────────────────────────
let count = 0;
let totalMs = 0;
let errors = 0;
const times = [];

/**
 * Request timing middleware.
 * Hooks into res.end to measure total request duration.
 * Sets X-Response-Time header on every response.
 * Logs warning for slow requests (>500ms).
 * Updates in-memory metrics for /api/health consumption.
 *
 * Must be FIRST in the middleware chain to capture full lifecycle.
 * Non-blocking — calls next() immediately.
 */
export function timingMiddleware(req, res, next) {
  const start = process.hrtime.bigint();

  // Monkey-patch res.end to capture timing
  const originalEnd = res.end;
  res.end = function (...args) {
    const elapsed = Number(process.hrtime.bigint() - start) / 1e6; // nanoseconds → milliseconds
    const ms = Math.round(elapsed * 100) / 100;

    // Set header (only if headers not yet sent)
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', ms + 'ms');
    }

    // Update metrics
    count++;
    totalMs += ms;
    if (res.statusCode >= 500) errors++;

    // Rolling window for percentile calculation
    times.push(ms);
    if (times.length > MAX_ROLLING_WINDOW) {
      times.shift();
    }

    // Log slow requests
    if (ms > SLOW_THRESHOLD_MS) {
      logger.warn('Slow request detected', {
        method: req.method,
        path: req.pathname || req.url,
        statusCode: res.statusCode,
        duration: ms + 'ms',
      });
    }

    // Call original res.end
    return originalEnd.apply(this, args);
  };

  next();
}

/**
 * Get aggregated request metrics.
 * Percentiles calculated on-demand from rolling window.
 * @returns {{ count: number, avgMs: number, p50Ms: number, p95Ms: number, p99Ms: number, errorRate: string }}
 */
export function getMetrics() {
  if (count === 0) {
    return { count: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, errorRate: '0%' };
  }

  const avgMs = Math.round((totalMs / count) * 100) / 100;
  const errorRate = Math.round((errors / count) * 10000) / 100 + '%';

  // Sort a copy for percentile calculation
  const sorted = times.slice().sort((a, b) => a - b);
  const len = sorted.length;

  const p50Ms = len > 0 ? sorted[Math.floor(len * 0.5)] : 0;
  const p95Ms = len > 0 ? sorted[Math.floor(len * 0.95)] : 0;
  const p99Ms = len > 0 ? sorted[Math.min(Math.floor(len * 0.99), len - 1)] : 0;

  return {
    count,
    avgMs,
    p50Ms: Math.round(p50Ms * 100) / 100,
    p95Ms: Math.round(p95Ms * 100) / 100,
    p99Ms: Math.round(p99Ms * 100) / 100,
    errorRate,
  };
}

/**
 * Reset all metrics (for testing).
 */
export function resetMetrics() {
  count = 0;
  totalMs = 0;
  errors = 0;
  times.length = 0;
}
```

---
