// ═══════════════════════════════════════════════════════════════
// server/services/trust.js — Trust Score System
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

/**
 * Calculate trust score — pure function, no I/O
 * @param {{ ratingAvg: number, ratingCount: number, completedJobs: number, totalAssigned: number, confirmedReports: number, totalReports: number, accountAgeDays: number }} data
 * @returns {{ score: number, components: { ratingScore: number, completionScore: number, reportScore: number, accountAgeScore: number } }}
 */
export function calculateTrustScore(data) {
  const weights = config.TRUST.weights;

  // Attendance component (0–1)
  let attendanceScore;
  if (!data.totalAttendanceRecords || data.totalAttendanceRecords === 0) {
    attendanceScore = 0.5; // neutral
  } else {
    attendanceScore = (data.attendedDays || 0) / data.totalAttendanceRecords;
  }

  // Rating component (0–1)
  let ratingScore;
  if (data.ratingCount === 0) {
    ratingScore = 0.5; // neutral
  } else {
    ratingScore = data.ratingAvg / 5;
  }

  // Completion rate component (0–1)
  let completionScore;
  if (data.totalAssigned === 0) {
    completionScore = 0.5; // neutral
  } else {
    completionScore = data.completedJobs / data.totalAssigned;
  }

  // Report penalty component (0–1, where 1 = no reports)
  let reportScore;
  if (data.totalReports === 0) {
    reportScore = 1.0; // no penalty
  } else {
    reportScore = 1 - (data.confirmedReports / data.totalReports);
  }

  // Account age component (0–1, capped at accountAgeCap days)
  const cappedAge = Math.min(data.accountAgeDays, config.TRUST.accountAgeCap);
  const accountAgeScore = cappedAge / config.TRUST.accountAgeCap;

  // Weighted composite
  let score = 
    weights.ratingAvg * ratingScore +
    weights.completionRate * completionScore +
    (weights.attendanceRate || 0) * attendanceScore +
    weights.reportScore * reportScore +
    weights.accountAge * accountAgeScore;

  // Clamp to 0.0–1.0
  score = Math.max(0, Math.min(1, score));

  // Round to 2 decimal places
  score = Math.round(score * 100) / 100;

  return {
    score,
    components: {
      ratingScore: Math.round(ratingScore * 100) / 100,
      completionScore: Math.round(completionScore * 100) / 100,
      attendanceScore: Math.round(attendanceScore * 100) / 100,
      reportScore: Math.round(reportScore * 100) / 100,
      accountAgeScore: Math.round(accountAgeScore * 100) / 100,
    },
  };
}

/**
 * Get trust score for a user — gathers data from multiple services
 * @param {string} userId
 * @returns {Promise<{ score: number, components: object } | null>}
 */
export async function getUserTrustScore(userId) {
  // Dynamic imports to avoid circular dependencies
  const { findById } = await import('./users.js');
  const user = await findById(userId);
  if (!user) return null;

  // Gather rating data
  const ratingAvg = user.rating ? user.rating.avg : 0;
  const ratingCount = user.rating ? user.rating.count : 0;

  // Gather completion data
  let completedJobs = 0;
  let totalAssigned = 0;

  if (user.role === 'worker') {
    const { listByWorker } = await import('./applications.js');
    const apps = await listByWorker(userId);
    const acceptedApps = apps.filter(a => a.status === 'accepted');
    totalAssigned = acceptedApps.length;

    // Count how many of those jobs are completed
    const { findById: findJobById } = await import('./jobs.js');
    for (const app of acceptedApps) {
      const job = await findJobById(app.jobId);
      if (job && job.status === 'completed') {
        completedJobs++;
      }
    }
  } else if (user.role === 'employer') {
    // For employers, count their own jobs
    const { getFromSetIndex, readJSON: readJSONFn, getRecordPath: getRecordPathFn } = await import('./database.js');
    const employerJobIds = await getFromSetIndex(config.DATABASE.indexFiles.employerJobsIndex, userId);
    totalAssigned = employerJobIds.length;
    for (const jobId of employerJobIds) {
      const job = await readJSONFn(getRecordPathFn('jobs', jobId));
      if (job && job.status === 'completed') {
        completedJobs++;
      }
    }
  }

  // Gather attendance data (workers only)
  let totalAttendanceRecords = 0;
  let attendedDays = 0;

  if (user.role === 'worker') {
    try {
      const { listByWorker: listAttendanceByWorker } = await import('./attendance.js');
      const attendanceRecords = await listAttendanceByWorker(userId);
      totalAttendanceRecords = attendanceRecords.length;
      attendedDays = attendanceRecords.filter(r =>
        r.status === 'checked_in' || r.status === 'checked_out' || r.status === 'confirmed'
      ).length;
    } catch (_) {
      // Non-blocking — attendance data unavailable
    }
  }

  // Gather report data
  const { listByTarget } = await import('./reports.js');
  const reports = await listByTarget(userId);
  const totalReports = reports.length;
  const confirmedReports = reports.filter(r => r.status === 'action_taken').length;

  // Account age
  const accountAgeDays = Math.floor(
    (Date.now() - new Date(user.createdAt).getTime()) / (24 * 60 * 60 * 1000)
  );

  return calculateTrustScore({
    ratingAvg,
    ratingCount,
    completedJobs,
    totalAssigned,
    confirmedReports,
    totalReports,
    accountAgeDays,
    totalAttendanceRecords,
    attendedDays,
  });
}
