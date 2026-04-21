#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/repair-indexes.js — يوميّة: Index Repair Utility
// ═══════════════════════════════════════════════════════════════
// Usage: node scripts/repair-indexes.js [--dry-run]
// Rebuilds all secondary indexes from source record files
// ═══════════════════════════════════════════════════════════════

import { readdir, readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const DATA_DIR = process.env.YAWMIA_DATA_PATH || './data';
const DRY_RUN = process.argv.includes('--dry-run');

async function readJSON(filePath) {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function atomicWrite(filePath, data) {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tmpPath = filePath + '.tmp';
  await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  await rename(tmpPath, filePath);
}

async function listRecords(dir, prefix) {
  try {
    const files = await readdir(dir);
    const results = [];
    for (const f of files) {
      if (f.startsWith(prefix) && f.endsWith('.json')) {
        const data = await readJSON(join(dir, f));
        if (data) results.push(data);
      }
    }
    return results;
  } catch {
    return [];
  }
}

async function repair() {
  console.log(`🔧 يوميّة Index Repair${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log(`   Data: ${DATA_DIR}\n`);

  let totalFixed = 0;

  // 1. Phone Index (users/phone-index.json)
  console.log('1️⃣  Phone Index...');
  const users = await listRecords(join(DATA_DIR, 'users'), 'usr_');
  const phoneIndex = {};
  for (const user of users) {
    if (user.phone && user.id) phoneIndex[user.phone] = user.id;
  }
  const existingPhoneIndex = await readJSON(join(DATA_DIR, 'users/phone-index.json')) || {};
  const phoneIndexChanged = JSON.stringify(phoneIndex) !== JSON.stringify(existingPhoneIndex);
  if (phoneIndexChanged) {
    console.log(`   ⚠️  Phone index needs repair (${Object.keys(phoneIndex).length} entries)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'users/phone-index.json'), phoneIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ Phone index OK (${Object.keys(phoneIndex).length} entries)`);
  }

  // 2. Jobs Index (jobs/index.json)
  console.log('2️⃣  Jobs Index...');
  const jobs = await listRecords(join(DATA_DIR, 'jobs'), 'job_');
  const jobsIndex = {};
  for (const job of jobs) {
    jobsIndex[job.id] = {
      id: job.id,
      employerId: job.employerId,
      category: job.category,
      governorate: job.governorate,
      status: job.status,
      createdAt: job.createdAt,
    };
  }
  const existingJobsIndex = await readJSON(join(DATA_DIR, 'jobs/index.json')) || {};
  const jobsIndexChanged = JSON.stringify(jobsIndex) !== JSON.stringify(existingJobsIndex);
  if (jobsIndexChanged) {
    console.log(`   ⚠️  Jobs index needs repair (${Object.keys(jobsIndex).length} entries)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'jobs/index.json'), jobsIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ Jobs index OK (${Object.keys(jobsIndex).length} entries)`);
  }

  // 3. Employer-Jobs Index (jobs/employer-index.json)
  console.log('3️⃣  Employer-Jobs Index...');
  const employerJobsIndex = {};
  for (const job of jobs) {
    if (!employerJobsIndex[job.employerId]) employerJobsIndex[job.employerId] = [];
    employerJobsIndex[job.employerId].push(job.id);
  }
  const existingEmpIndex = await readJSON(join(DATA_DIR, 'jobs/employer-index.json')) || {};
  const empIndexChanged = JSON.stringify(employerJobsIndex) !== JSON.stringify(existingEmpIndex);
  if (empIndexChanged) {
    console.log(`   ⚠️  Employer-Jobs index needs repair (${Object.keys(employerJobsIndex).length} employers)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'jobs/employer-index.json'), employerJobsIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ Employer-Jobs index OK (${Object.keys(employerJobsIndex).length} employers)`);
  }

  // 4. Worker-Apps Index (applications/worker-index.json)
  console.log('4️⃣  Worker-Apps Index...');
  const apps = await listRecords(join(DATA_DIR, 'applications'), 'app_');
  const workerAppsIndex = {};
  for (const app of apps) {
    if (!workerAppsIndex[app.workerId]) workerAppsIndex[app.workerId] = [];
    workerAppsIndex[app.workerId].push(app.id);
  }
  const existingWorkerIndex = await readJSON(join(DATA_DIR, 'applications/worker-index.json')) || {};
  const workerIndexChanged = JSON.stringify(workerAppsIndex) !== JSON.stringify(existingWorkerIndex);
  if (workerIndexChanged) {
    console.log(`   ⚠️  Worker-Apps index needs repair (${Object.keys(workerAppsIndex).length} workers)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'applications/worker-index.json'), workerAppsIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ Worker-Apps index OK (${Object.keys(workerAppsIndex).length} workers)`);
  }

  // 5. Job-Apps Index (applications/job-index.json)
  console.log('5️⃣  Job-Apps Index...');
  const jobAppsIndex = {};
  for (const app of apps) {
    if (!jobAppsIndex[app.jobId]) jobAppsIndex[app.jobId] = [];
    jobAppsIndex[app.jobId].push(app.id);
  }
  const existingJobAppsIndex = await readJSON(join(DATA_DIR, 'applications/job-index.json')) || {};
  const jobAppsIndexChanged = JSON.stringify(jobAppsIndex) !== JSON.stringify(existingJobAppsIndex);
  if (jobAppsIndexChanged) {
    console.log(`   ⚠️  Job-Apps index needs repair (${Object.keys(jobAppsIndex).length} jobs)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'applications/job-index.json'), jobAppsIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ Job-Apps index OK (${Object.keys(jobAppsIndex).length} jobs)`);
  }

  // 6. User-Notifications Index (notifications/user-index.json)
  console.log('6️⃣  User-Notifications Index...');
  const notifs = await listRecords(join(DATA_DIR, 'notifications'), 'ntf_');
  const userNtfIndex = {};
  for (const ntf of notifs) {
    if (!userNtfIndex[ntf.userId]) userNtfIndex[ntf.userId] = [];
    userNtfIndex[ntf.userId].push(ntf.id);
  }
  const existingNtfIndex = await readJSON(join(DATA_DIR, 'notifications/user-index.json')) || {};
  const ntfIndexChanged = JSON.stringify(userNtfIndex) !== JSON.stringify(existingNtfIndex);
  if (ntfIndexChanged) {
    console.log(`   ⚠️  User-Notifications index needs repair (${Object.keys(userNtfIndex).length} users)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'notifications/user-index.json'), userNtfIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ User-Notifications index OK (${Object.keys(userNtfIndex).length} users)`);
  }

  // 7. Job-Payments Index (payments/job-index.json)
  console.log('7️⃣  Job-Payments Index...');
  const payments = await listRecords(join(DATA_DIR, 'payments'), 'pay_');
  const jobPaymentsIndex = {};
  for (const pay of payments) {
    if (!jobPaymentsIndex[pay.jobId]) jobPaymentsIndex[pay.jobId] = [];
    jobPaymentsIndex[pay.jobId].push(pay.id);
  }
  const existingPaymentsIndex = await readJSON(join(DATA_DIR, 'payments/job-index.json')) || {};
  const paymentsIndexChanged = JSON.stringify(jobPaymentsIndex) !== JSON.stringify(existingPaymentsIndex);
  if (paymentsIndexChanged) {
    console.log(`   ⚠️  Job-Payments index needs repair (${Object.keys(jobPaymentsIndex).length} jobs)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'payments/job-index.json'), jobPaymentsIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ Job-Payments index OK (${Object.keys(jobPaymentsIndex).length} jobs)`);
  }

  // 8. Target-Reports Index (reports/target-index.json)
  console.log('8️⃣  Target-Reports Index...');
  const reports = await listRecords(join(DATA_DIR, 'reports'), 'rpt_');
  const targetReportsIndex = {};
  for (const rpt of reports) {
    if (!targetReportsIndex[rpt.targetId]) targetReportsIndex[rpt.targetId] = [];
    targetReportsIndex[rpt.targetId].push(rpt.id);
  }
  const existingTargetIndex = await readJSON(join(DATA_DIR, 'reports/target-index.json')) || {};
  const targetIndexChanged = JSON.stringify(targetReportsIndex) !== JSON.stringify(existingTargetIndex);
  if (targetIndexChanged) {
    console.log(`   ⚠️  Target-Reports index needs repair (${Object.keys(targetReportsIndex).length} targets)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'reports/target-index.json'), targetReportsIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ Target-Reports index OK (${Object.keys(targetReportsIndex).length} targets)`);
  }

  // 9. Reporter-Reports Index (reports/reporter-index.json)
  console.log('9️⃣  Reporter-Reports Index...');
  const reporterReportsIndex = {};
  for (const rpt of reports) {
    if (!reporterReportsIndex[rpt.reporterId]) reporterReportsIndex[rpt.reporterId] = [];
    reporterReportsIndex[rpt.reporterId].push(rpt.id);
  }
  const existingReporterIndex = await readJSON(join(DATA_DIR, 'reports/reporter-index.json')) || {};
  const reporterIndexChanged = JSON.stringify(reporterReportsIndex) !== JSON.stringify(existingReporterIndex);
  if (reporterIndexChanged) {
    console.log(`   ⚠️  Reporter-Reports index needs repair (${Object.keys(reporterReportsIndex).length} reporters)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'reports/reporter-index.json'), reporterReportsIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ Reporter-Reports index OK (${Object.keys(reporterReportsIndex).length} reporters)`);
  }

  // 10. User-Verifications Index (verifications/user-index.json)
  console.log('🔟 User-Verifications Index...');
  const verifications = await listRecords(join(DATA_DIR, 'verifications'), 'vrf_');
  const userVerificationsIndex = {};
  for (const vrf of verifications) {
    if (!userVerificationsIndex[vrf.userId]) userVerificationsIndex[vrf.userId] = [];
    userVerificationsIndex[vrf.userId].push(vrf.id);
  }
  const existingVrfIndex = await readJSON(join(DATA_DIR, 'verifications/user-index.json')) || {};
  const vrfIndexChanged = JSON.stringify(userVerificationsIndex) !== JSON.stringify(existingVrfIndex);
  if (vrfIndexChanged) {
    console.log(`   ⚠️  User-Verifications index needs repair (${Object.keys(userVerificationsIndex).length} users)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'verifications/user-index.json'), userVerificationsIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ User-Verifications index OK (${Object.keys(userVerificationsIndex).length} users)`);
  }

  // 11. Job-Attendance Index (attendance/job-index.json)
  console.log('1️⃣1️⃣ Job-Attendance Index...');
  const attendanceRecords = await listRecords(join(DATA_DIR, 'attendance'), 'att_');
  const jobAttendanceIndex = {};
  for (const att of attendanceRecords) {
    if (!jobAttendanceIndex[att.jobId]) jobAttendanceIndex[att.jobId] = [];
    jobAttendanceIndex[att.jobId].push(att.id);
  }
  const existingJobAttIndex = await readJSON(join(DATA_DIR, 'attendance/job-index.json')) || {};
  const jobAttIndexChanged = JSON.stringify(jobAttendanceIndex) !== JSON.stringify(existingJobAttIndex);
  if (jobAttIndexChanged) {
    console.log(`   ⚠️  Job-Attendance index needs repair (${Object.keys(jobAttendanceIndex).length} jobs)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'attendance/job-index.json'), jobAttendanceIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ Job-Attendance index OK (${Object.keys(jobAttendanceIndex).length} jobs)`);
  }

  // 12. Worker-Attendance Index (attendance/worker-index.json)
  console.log('1️⃣2️⃣ Worker-Attendance Index...');
  const workerAttendanceIndex = {};
  for (const att of attendanceRecords) {
    if (!workerAttendanceIndex[att.workerId]) workerAttendanceIndex[att.workerId] = [];
    workerAttendanceIndex[att.workerId].push(att.id);
  }
  const existingWorkerAttIndex = await readJSON(join(DATA_DIR, 'attendance/worker-index.json')) || {};
  const workerAttIndexChanged = JSON.stringify(workerAttendanceIndex) !== JSON.stringify(existingWorkerAttIndex);
  if (workerAttIndexChanged) {
    console.log(`   ⚠️  Worker-Attendance index needs repair (${Object.keys(workerAttendanceIndex).length} workers)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'attendance/worker-index.json'), workerAttendanceIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ Worker-Attendance index OK (${Object.keys(workerAttendanceIndex).length} workers)`);
  }

  // 13. Message-Job Index (messages/job-index.json)
  console.log('1️⃣3️⃣ Message-Job Index...');
  const messages = await listRecords(join(DATA_DIR, 'messages'), 'msg_');
  const messageJobIndex = {};
  for (const msg of messages) {
    if (!messageJobIndex[msg.jobId]) messageJobIndex[msg.jobId] = [];
    messageJobIndex[msg.jobId].push(msg.id);
  }
  const existingMsgJobIndex = await readJSON(join(DATA_DIR, 'messages/job-index.json')) || {};
  const msgJobIndexChanged = JSON.stringify(messageJobIndex) !== JSON.stringify(existingMsgJobIndex);
  if (msgJobIndexChanged) {
    console.log(`   ⚠️  Message-Job index needs repair (${Object.keys(messageJobIndex).length} jobs)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'messages/job-index.json'), messageJobIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ Message-Job index OK (${Object.keys(messageJobIndex).length} jobs)`);
  }

  // 14. Message-User Index (messages/user-index.json)
  console.log('1️⃣4️⃣ Message-User Index...');
  const messageUserIndex = {};
  for (const msg of messages) {
    if (msg.recipientId) {
      if (!messageUserIndex[msg.recipientId]) messageUserIndex[msg.recipientId] = [];
      messageUserIndex[msg.recipientId].push(msg.id);
    }
    // For broadcasts (recipientId: null), we'd need to resolve accepted workers — skip in repair
  }
  const existingMsgUserIndex = await readJSON(join(DATA_DIR, 'messages/user-index.json')) || {};
  const msgUserIndexChanged = JSON.stringify(messageUserIndex) !== JSON.stringify(existingMsgUserIndex);
  if (msgUserIndexChanged) {
    console.log(`   ⚠️  Message-User index needs repair (${Object.keys(messageUserIndex).length} users)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'messages/user-index.json'), messageUserIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ Message-User index OK (${Object.keys(messageUserIndex).length} users)`);
  }

  // 15. Push-User Index (push_subscriptions/user-index.json)
  console.log('1️⃣5️⃣ Push-User Index...');
  const pushSubs = await listRecords(join(DATA_DIR, 'push_subscriptions'), 'psub_');
  const pushUserIndex = {};
  for (const sub of pushSubs) {
    if (!pushUserIndex[sub.userId]) pushUserIndex[sub.userId] = [];
    pushUserIndex[sub.userId].push(sub.id);
  }
  const existingPushIndex = await readJSON(join(DATA_DIR, 'push_subscriptions/user-index.json')) || {};
  const pushIndexChanged = JSON.stringify(pushUserIndex) !== JSON.stringify(existingPushIndex);
  if (pushIndexChanged) {
    console.log(`   ⚠️  Push-User index needs repair (${Object.keys(pushUserIndex).length} users)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'push_subscriptions/user-index.json'), pushUserIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ Push-User index OK (${Object.keys(pushUserIndex).length} users)`);
  }

  console.log(`\n${DRY_RUN ? '📋' : '✅'} Done! ${totalFixed} indexes ${DRY_RUN ? 'would be ' : ''}repaired/rebuilt.`);
}

repair().catch(err => {
  console.error('❌ Repair failed:', err.message);
  process.exit(1);
});
