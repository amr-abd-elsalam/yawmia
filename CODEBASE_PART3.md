# يوميّة (Yawmia) v0.22.0 — Part 3: Middleware (7) + Handlers (11)
> Auto-generated: 2026-04-21T21:14:55.498Z
> Files in this part: 20

## Files
1. `server/handlers/adminHandler.js`
2. `server/handlers/applicationsHandler.js`
3. `server/handlers/attendanceHandler.js`
4. `server/handlers/authHandler.js`
5. `server/handlers/jobsHandler.js`
6. `server/handlers/messagesHandler.js`
7. `server/handlers/notificationsHandler.js`
8. `server/handlers/paymentsHandler.js`
9. `server/handlers/pushHandler.js`
10. `server/handlers/ratingsHandler.js`
11. `server/handlers/reportsHandler.js`
12. `server/handlers/sseHandler.js`
13. `server/handlers/verificationHandler.js`
14. `server/middleware/auth.js`
15. `server/middleware/bodyParser.js`
16. `server/middleware/cors.js`
17. `server/middleware/rateLimit.js`
18. `server/middleware/requestId.js`
19. `server/middleware/security.js`
20. `server/middleware/static.js`

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
```

---

## `server/handlers/applicationsHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/applicationsHandler.js — Application Endpoints
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { apply, accept, reject, listByJob, listByWorker, withdraw, countTodayByWorker } from '../services/applications.js';

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
    const result = await verifyOtp(phone, otp);
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
      createdAt: user.createdAt,
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

## `server/handlers/jobsHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/jobsHandler.js — Job Endpoints
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { create, findById, list, listAll, startJob, completeJob, cancelJob, countTodayByEmployer, renewJob, duplicateJob } from '../services/jobs.js';
import { validateJobFields } from '../services/validators.js';
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
    const sanitized = sanitizeFields(body, ['title', 'description']);
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

import { listByUser, markAsRead, markAllAsRead } from '../services/notifications.js';

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

## `server/handlers/ratingsHandler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/handlers/ratingsHandler.js — Rating API Handlers
// ═══════════════════════════════════════════════════════════════

import { submitRating, listByJob, listByUser, getUserRatingSummary } from '../services/ratings.js';
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

## `server/middleware/auth.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/middleware/auth.js — Auth Middleware
// ═══════════════════════════════════════════════════════════════

import { verifySession } from '../services/sessions.js';
import { findById } from '../services/users.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
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
  if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') {
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

export function rateLimitMiddleware(req, res, next) {
  if (!config.RATE_LIMIT.enabled) return next();

  startCleanup();

  // Use IP as key (or forwarded IP)
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';

  const now = Date.now();
  const windowMs = config.RATE_LIMIT.windowMs;
  const maxRequests = config.RATE_LIMIT.maxRequests;

  const key = `global:${ip}`;
  let entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }

  entry.count++;

  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', String(maxRequests));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxRequests - entry.count)));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

  if (entry.count > maxRequests) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: config.RATE_LIMIT.message,
      code: 'RATE_LIMITED',
    }));
    return;
  }

  // OTP-specific rate limiting
  if (req.pathname === '/api/auth/send-otp' && req.method === 'POST') {
    const otpKey = `otp:${ip}`;
    const otpWindowMs = config.RATE_LIMIT.otpWindowMs;
    const otpMaxRequests = config.RATE_LIMIT.otpMaxRequests;

    let otpEntry = store.get(otpKey);
    if (!otpEntry || now > otpEntry.resetAt) {
      otpEntry = { count: 0, resetAt: now + otpWindowMs };
      store.set(otpKey, otpEntry);
    }

    otpEntry.count++;

    if (otpEntry.count > otpMaxRequests) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'تم تجاوز الحد المسموح من طلبات OTP. حاول بعد قليل.',
        code: 'OTP_RATE_LIMITED',
      }));
      return;
    }
  }

  next();
}

/**
 * Reset store — useful for testing
 */
export function resetRateLimit() {
  store.clear();
}
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
 * Adds security headers to every response
 */
export function securityMiddleware(req, res, next) {
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

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': content.length,
    'Cache-Control': `public, max-age=${config.STATIC.maxAge}`,
  });
  res.end(content);
}
```

---
