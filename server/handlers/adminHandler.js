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
