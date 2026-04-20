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
