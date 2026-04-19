// ═══════════════════════════════════════════════════════════════
// server/services/attendance.js — Worker Attendance & GPS Check-in
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import {
  atomicWrite, readJSON, getRecordPath, getCollectionPath,
  listJSON, addToSetIndex, getFromSetIndex,
} from './database.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';

const JOB_ATTENDANCE_INDEX = config.DATABASE.indexFiles.jobAttendanceIndex;
const WORKER_ATTENDANCE_INDEX = config.DATABASE.indexFiles.workerAttendanceIndex;

/**
 * Generate attendance record ID
 */
function generateId() {
  return 'att_' + crypto.randomBytes(6).toString('hex');
}

/**
 * Get Egypt date string (YYYY-MM-DD) from a UTC Date
 */
function getEgyptDateString(utcDate) {
  const offsetMs = 2 * 60 * 60 * 1000; // UTC+2
  const egyptTime = new Date(utcDate.getTime() + offsetMs);
  const y = egyptTime.getUTCFullYear();
  const m = String(egyptTime.getUTCMonth() + 1).padStart(2, '0');
  const d = String(egyptTime.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Find today's attendance record for a specific worker on a specific job
 * @param {string} jobId
 * @param {string} workerId
 * @param {Date} todayMidnight — Egypt midnight as UTC Date
 * @returns {Promise<object|null>}
 */
async function findTodayRecord(jobId, workerId, todayMidnight) {
  // Try index-accelerated lookup
  const indexedIds = await getFromSetIndex(JOB_ATTENDANCE_INDEX, jobId);
  if (indexedIds.length > 0) {
    for (const attId of indexedIds) {
      const record = await readJSON(getRecordPath('attendance', attId));
      if (record && record.workerId === workerId && new Date(record.createdAt) >= todayMidnight) {
        return record;
      }
    }
    return null;
  }

  // Fallback: full scan
  const attDir = getCollectionPath('attendance');
  const all = await listJSON(attDir);
  return all.find(a =>
    a.jobId === jobId &&
    a.workerId === workerId &&
    new Date(a.createdAt) >= todayMidnight
  ) || null;
}

/**
 * Worker GPS-verified check-in
 * @param {string} jobId
 * @param {string} workerId
 * @param {{ lat?: number, lng?: number }} coords
 * @returns {Promise<{ ok: boolean, attendance?: object, error?: string, code?: string }>}
 */
export async function checkIn(jobId, workerId, coords = {}) {
  // 1. Feature flag
  if (!config.ATTENDANCE || !config.ATTENDANCE.enabled) {
    return { ok: false, error: 'نظام الحضور غير مفعّل حالياً', code: 'ATTENDANCE_DISABLED' };
  }

  // 2. Job exists & in_progress
  const { findById: findJob } = await import('./jobs.js');
  const job = await findJob(jobId);
  if (!job) {
    return { ok: false, error: 'الفرصة غير موجودة', code: 'JOB_NOT_FOUND' };
  }
  if (job.status !== 'in_progress') {
    return { ok: false, error: 'الفرصة مش في حالة تنفيذ', code: 'JOB_NOT_IN_PROGRESS' };
  }

  // 3. Worker is accepted on this job
  const { listByJob: listApps } = await import('./applications.js');
  const apps = await listApps(jobId);
  const accepted = apps.find(a => a.workerId === workerId && a.status === 'accepted');
  if (!accepted) {
    return { ok: false, error: 'أنت مش مقبول في هذه الفرصة', code: 'NOT_ACCEPTED_WORKER' };
  }

  // 4. No duplicate today
  const { getEgyptMidnight } = await import('./geo.js');
  const todayMidnight = getEgyptMidnight();
  const existing = await findTodayRecord(jobId, workerId, todayMidnight);

  if (existing) {
    // Allow override if no_show → checked_in (worker arrives late)
    if (existing.status === 'no_show') {
      const now = new Date();
      existing.status = 'checked_in';
      existing.checkInAt = now.toISOString();
      existing.checkInLat = (typeof coords.lat === 'number') ? coords.lat : null;
      existing.checkInLng = (typeof coords.lng === 'number') ? coords.lng : null;
      await atomicWrite(getRecordPath('attendance', existing.id), existing);

      eventBus.emit('attendance:checkin', {
        attendanceId: existing.id,
        jobId,
        workerId,
        employerId: job.employerId,
      });

      return { ok: true, attendance: existing };
    }
    return { ok: false, error: 'أنت سجلت حضورك النهارده بالفعل', code: 'ALREADY_CHECKED_IN' };
  }

  // 5. GPS proximity check
  if (config.ATTENDANCE.requireGpsForCheckIn) {
    if (typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
      return { ok: false, error: 'موقعك الجغرافي مطلوب لتسجيل الحضور', code: 'GPS_REQUIRED' };
    }

    const { haversineDistance, resolveCoordinates } = await import('./geo.js');
    const jobCoords = resolveCoordinates({
      lat: job.lat,
      lng: job.lng,
      governorate: job.governorate,
    });

    if (jobCoords) {
      const distance = haversineDistance(coords.lat, coords.lng, jobCoords.lat, jobCoords.lng);
      if (distance > config.ATTENDANCE.checkInRadiusKm) {
        return {
          ok: false,
          error: `أنت بعيد عن موقع العمل (${distance} كم). لازم تكون في نطاق ${config.ATTENDANCE.checkInRadiusKm} كم`,
          code: 'TOO_FAR_FROM_JOB',
        };
      }
    }
  }

  // ── Create attendance record ──
  const now = new Date();
  const id = generateId();
  const attendance = {
    id,
    jobId,
    workerId,
    employerId: job.employerId,
    date: getEgyptDateString(now),
    status: 'checked_in',
    checkInAt: now.toISOString(),
    checkInLat: (typeof coords.lat === 'number') ? coords.lat : null,
    checkInLng: (typeof coords.lng === 'number') ? coords.lng : null,
    checkOutAt: null,
    checkOutLat: null,
    checkOutLng: null,
    hoursWorked: null,
    employerConfirmed: false,
    employerConfirmedAt: null,
    noShowReportedBy: null,
    noShowReportedAt: null,
    createdAt: now.toISOString(),
  };

  await atomicWrite(getRecordPath('attendance', id), attendance);

  // Update indexes
  await addToSetIndex(JOB_ATTENDANCE_INDEX, jobId, id);
  await addToSetIndex(WORKER_ATTENDANCE_INDEX, workerId, id);

  eventBus.emit('attendance:checkin', {
    attendanceId: id,
    jobId,
    workerId,
    employerId: job.employerId,
  });

  return { ok: true, attendance };
}

/**
 * Worker check-out
 * @param {string} jobId
 * @param {string} workerId
 * @param {{ lat?: number, lng?: number }} coords
 * @returns {Promise<{ ok: boolean, attendance?: object, error?: string, code?: string }>}
 */
export async function checkOut(jobId, workerId, coords = {}) {
  // 1. Feature flag
  if (!config.ATTENDANCE || !config.ATTENDANCE.enabled) {
    return { ok: false, error: 'نظام الحضور غير مفعّل حالياً', code: 'ATTENDANCE_DISABLED' };
  }

  // 2. Find today's record
  const { getEgyptMidnight } = await import('./geo.js');
  const todayMidnight = getEgyptMidnight();
  const record = await findTodayRecord(jobId, workerId, todayMidnight);

  if (!record) {
    return { ok: false, error: 'مفيش سجل حضور ليك النهارده', code: 'NOT_CHECKED_IN' };
  }

  if (record.status !== 'checked_in') {
    return { ok: false, error: 'حالة الحضور مش مناسبة للانصراف', code: 'INVALID_ATTENDANCE_STATUS' };
  }

  // 3. Calculate hours worked
  const now = new Date();
  const checkInTime = new Date(record.checkInAt);
  const hoursWorked = Math.round(((now.getTime() - checkInTime.getTime()) / (1000 * 60 * 60)) * 10) / 10;

  // 4. Update record
  record.status = 'checked_out';
  record.checkOutAt = now.toISOString();
  record.checkOutLat = (typeof coords.lat === 'number') ? coords.lat : null;
  record.checkOutLng = (typeof coords.lng === 'number') ? coords.lng : null;
  record.hoursWorked = hoursWorked;

  await atomicWrite(getRecordPath('attendance', record.id), record);

  eventBus.emit('attendance:checkout', {
    attendanceId: record.id,
    jobId,
    workerId,
    hoursWorked,
  });

  return { ok: true, attendance: record };
}

/**
 * Employer confirms attendance
 * @param {string} attendanceId
 * @param {string} employerId
 * @returns {Promise<{ ok: boolean, attendance?: object, error?: string, code?: string }>}
 */
export async function confirmAttendance(attendanceId, employerId) {
  // 1. Feature flag
  if (!config.ATTENDANCE || !config.ATTENDANCE.enabled) {
    return { ok: false, error: 'نظام الحضور غير مفعّل حالياً', code: 'ATTENDANCE_DISABLED' };
  }

  // 2. Record exists
  const record = await findById(attendanceId);
  if (!record) {
    return { ok: false, error: 'سجل الحضور غير موجود', code: 'ATTENDANCE_NOT_FOUND' };
  }

  // 3. Employer owns job
  if (record.employerId !== employerId) {
    return { ok: false, error: 'مش مسموحلك تأكد حضور هذا العامل', code: 'NOT_JOB_OWNER' };
  }

  // 4. Valid status for confirmation
  if (record.status !== 'checked_in' && record.status !== 'checked_out') {
    return { ok: false, error: 'حالة الحضور مش مناسبة للتأكيد', code: 'INVALID_ATTENDANCE_STATUS' };
  }

  // 5. Not already confirmed
  if (record.employerConfirmed) {
    return { ok: false, error: 'تم تأكيد الحضور بالفعل', code: 'ALREADY_CONFIRMED' };
  }

  // 6. Update
  record.status = 'confirmed';
  record.employerConfirmed = true;
  record.employerConfirmedAt = new Date().toISOString();

  await atomicWrite(getRecordPath('attendance', record.id), record);

  eventBus.emit('attendance:confirmed', {
    attendanceId: record.id,
    jobId: record.jobId,
    workerId: record.workerId,
    employerId,
  });

  return { ok: true, attendance: record };
}

/**
 * Employer reports worker no-show
 * @param {string} jobId
 * @param {string} workerId
 * @param {string} reportedBy — employer ID
 * @returns {Promise<{ ok: boolean, attendance?: object, error?: string, code?: string }>}
 */
export async function reportNoShow(jobId, workerId, reportedBy) {
  // 1. Feature flag
  if (!config.ATTENDANCE || !config.ATTENDANCE.enabled) {
    return { ok: false, error: 'نظام الحضور غير مفعّل حالياً', code: 'ATTENDANCE_DISABLED' };
  }

  // 2. Job exists
  const { findById: findJob } = await import('./jobs.js');
  const job = await findJob(jobId);
  if (!job) {
    return { ok: false, error: 'الفرصة غير موجودة', code: 'JOB_NOT_FOUND' };
  }

  // 3. Reporter is job employer
  if (job.employerId !== reportedBy) {
    return { ok: false, error: 'مش مسموحلك تبلّغ عن غياب في هذه الفرصة', code: 'NOT_JOB_OWNER' };
  }

  // 4. Worker is accepted on the job
  const { listByJob: listApps } = await import('./applications.js');
  const apps = await listApps(jobId);
  const accepted = apps.find(a => a.workerId === workerId && a.status === 'accepted');
  if (!accepted) {
    return { ok: false, error: 'العامل مش مقبول في هذه الفرصة', code: 'NOT_ACCEPTED_WORKER' };
  }

  // 5. Check if worker already checked in today
  const { getEgyptMidnight } = await import('./geo.js');
  const todayMidnight = getEgyptMidnight();
  const existing = await findTodayRecord(jobId, workerId, todayMidnight);

  if (existing && (existing.status === 'checked_in' || existing.status === 'checked_out' || existing.status === 'confirmed')) {
    return { ok: false, error: 'العامل سجّل حضوره بالفعل النهارده', code: 'WORKER_ALREADY_CHECKED_IN' };
  }

  // If existing no_show record → return it (already reported)
  if (existing && existing.status === 'no_show') {
    return { ok: true, attendance: existing };
  }

  // 6. Create no_show record
  const now = new Date();
  const id = generateId();
  const attendance = {
    id,
    jobId,
    workerId,
    employerId: job.employerId,
    date: getEgyptDateString(now),
    status: 'no_show',
    checkInAt: null,
    checkInLat: null,
    checkInLng: null,
    checkOutAt: null,
    checkOutLat: null,
    checkOutLng: null,
    hoursWorked: null,
    employerConfirmed: false,
    employerConfirmedAt: null,
    noShowReportedBy: reportedBy,
    noShowReportedAt: now.toISOString(),
    createdAt: now.toISOString(),
  };

  await atomicWrite(getRecordPath('attendance', id), attendance);

  // Update indexes
  await addToSetIndex(JOB_ATTENDANCE_INDEX, jobId, id);
  await addToSetIndex(WORKER_ATTENDANCE_INDEX, workerId, id);

  eventBus.emit('attendance:noshow', {
    attendanceId: id,
    jobId,
    workerId,
    reportedBy,
  });

  return { ok: true, attendance };
}

/**
 * List attendance records for a job (index-accelerated)
 * @param {string} jobId
 * @param {{ date?: string }} options — optional YYYY-MM-DD date filter
 * @returns {Promise<object[]>}
 */
export async function listByJob(jobId, options = {}) {
  let records;

  // Try index-accelerated lookup
  const indexedIds = await getFromSetIndex(JOB_ATTENDANCE_INDEX, jobId);
  if (indexedIds.length > 0) {
    const results = [];
    for (const attId of indexedIds) {
      const record = await readJSON(getRecordPath('attendance', attId));
      if (record) results.push(record);
    }
    records = results;
  } else {
    // Fallback: full scan
    const attDir = getCollectionPath('attendance');
    const all = await listJSON(attDir);
    records = all.filter(a => a.jobId === jobId);
  }

  // Optional date filter
  if (options.date) {
    records = records.filter(r => r.date === options.date);
  }

  // Sort newest first
  records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return records;
}

/**
 * List attendance records for a worker (index-accelerated)
 * @param {string} workerId
 * @returns {Promise<object[]>}
 */
export async function listByWorker(workerId) {
  let records;

  // Try index-accelerated lookup
  const indexedIds = await getFromSetIndex(WORKER_ATTENDANCE_INDEX, workerId);
  if (indexedIds.length > 0) {
    const results = [];
    for (const attId of indexedIds) {
      const record = await readJSON(getRecordPath('attendance', attId));
      if (record) results.push(record);
    }
    records = results;
  } else {
    // Fallback: full scan
    const attDir = getCollectionPath('attendance');
    const all = await listJSON(attDir);
    records = all.filter(a => a.workerId === workerId);
  }

  // Sort newest first
  records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return records;
}

/**
 * Get aggregated attendance summary for a job
 * @param {string} jobId
 * @returns {Promise<object>}
 */
export async function getJobSummary(jobId) {
  const records = await listByJob(jobId);

  const uniqueDates = new Set(records.map(r => r.date));
  const noShowCount = records.filter(r => r.status === 'no_show').length;
  const confirmedCount = records.filter(r => r.status === 'confirmed' || r.employerConfirmed).length;
  const checkedInCount = records.filter(r => r.status === 'checked_in' || r.status === 'checked_out' || r.status === 'confirmed').length;
  const totalHours = records.reduce((sum, r) => sum + (r.hoursWorked || 0), 0);

  // Attendance by worker
  const attendanceByWorker = {};
  for (const record of records) {
    if (!attendanceByWorker[record.workerId]) {
      attendanceByWorker[record.workerId] = {
        workerId: record.workerId,
        totalRecords: 0,
        checkedIn: 0,
        noShows: 0,
        confirmed: 0,
        totalHours: 0,
      };
    }
    const w = attendanceByWorker[record.workerId];
    w.totalRecords++;
    if (record.status === 'no_show') w.noShows++;
    if (record.status === 'checked_in' || record.status === 'checked_out' || record.status === 'confirmed') w.checkedIn++;
    if (record.status === 'confirmed' || record.employerConfirmed) w.confirmed++;
    w.totalHours = Math.round((w.totalHours + (record.hoursWorked || 0)) * 10) / 10;
  }

  return {
    jobId,
    totalDays: uniqueDates.size,
    totalRecords: records.length,
    checkedInCount,
    noShowCount,
    confirmedCount,
    totalHours: Math.round(totalHours * 10) / 10,
    attendanceByWorker,
  };
}

/**
 * Find attendance record by ID
 * @param {string} attendanceId
 * @returns {Promise<object|null>}
 */
export async function findById(attendanceId) {
  return await readJSON(getRecordPath('attendance', attendanceId));
}
