// tests/phase15-sse-renew.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 15 — Server-Sent Events (SSE) + Real-Time Notifications + Job Renewal
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { EventEmitter } from 'node:events';

let tmpDir;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-phase15-'));
  const dirs = ['users', 'sessions', 'jobs', 'applications', 'otp', 'notifications', 'ratings', 'payments', 'reports', 'verifications', 'audit'];
  for (const d of dirs) {
    await mkdir(join(tmpDir, d), { recursive: true });
  }
  process.env.YAWMIA_DATA_PATH = tmpDir;
});

after(async () => {
  delete process.env.YAWMIA_DATA_PATH;
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

let config, db, userService, jobsService, appService, eventBus, sseManager, sseHandler;

before(async () => {
  config = (await import('../config.js')).default;
  db = await import('../server/services/database.js');
  userService = await import('../server/services/users.js');
  jobsService = await import('../server/services/jobs.js');
  appService = await import('../server/services/applications.js');
  eventBus = (await import('../server/services/eventBus.js')).eventBus;
  sseManager = await import('../server/services/sseManager.js');
  sseHandler = await import('../server/handlers/sseHandler.js');
  eventBus.clear();
});

after(() => {
  // Clean up SSE connections
  sseManager._connections.clear();
  if (eventBus) eventBus.clear();
});

// ── Helpers ─────────────────────────────────────────────────
let counter = 0;
async function createTestUser(role) {
  counter++;
  const phone = '0101500' + String(counter).padStart(4, '0');
  return await userService.create(phone, role);
}

/**
 * Create a mock HTTP response object for SSE testing
 */
function createMockRes() {
  const written = [];
  let ended = false;
  const emitter = new EventEmitter();
  return {
    _written: written,
    writableEnded: false,
    destroyed: false,
    write(data) {
      written.push(data);
      return true;
    },
    end() {
      ended = true;
      this.writableEnded = true;
      emitter.emit('close');
    },
    on(event, fn) {
      emitter.on(event, fn);
    },
    removeListener(event, fn) {
      emitter.removeListener(event, fn);
    },
  };
}

// ══════════════════════════════════════════════════════════════
// Config Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 15 — Config', () => {

  it('P15-01: Config has 38 sections', () => {
    const keys = Object.keys(config);
    assert.strictEqual(keys.length, 45, `expected 43 config sections, got ${keys.length}: ${keys.join(', ')}`);
  });

  it('P15-02: SSE section has correct fields', () => {
    assert.ok(config.SSE, 'SSE section should exist');
    assert.strictEqual(config.SSE.enabled, true);
    assert.strictEqual(config.SSE.heartbeatIntervalMs, 30000);
    assert.strictEqual(config.SSE.maxConnectionsPerUser, 3);
    assert.strictEqual(config.SSE.reconnectMs, 5000);
    assert.strictEqual(config.SSE.cleanupIntervalMs, 60000);
  });

  it('P15-03: JOB_RENEWAL section has correct fields', () => {
    assert.ok(config.JOB_RENEWAL, 'JOB_RENEWAL section should exist');
    assert.strictEqual(config.JOB_RENEWAL.enabled, true);
    assert.deepStrictEqual(config.JOB_RENEWAL.allowedFromStatuses, ['expired', 'cancelled']);
    assert.strictEqual(config.JOB_RENEWAL.renewalExpiryHours, 72);
    assert.strictEqual(config.JOB_RENEWAL.maxRenewalsPerJob, 3);
    assert.strictEqual(config.JOB_RENEWAL.resetApplications, false);
  });

  it('P15-04: SSE is frozen', () => {
    assert.strictEqual(Object.isFrozen(config.SSE), true, 'SSE config should be frozen');
    assert.throws(() => {
      config.SSE.enabled = false;
    }, TypeError, 'should not allow mutation');
  });

  it('P15-05: JOB_RENEWAL is frozen', () => {
    assert.strictEqual(Object.isFrozen(config.JOB_RENEWAL), true, 'JOB_RENEWAL config should be frozen');
    assert.throws(() => {
      config.JOB_RENEWAL.enabled = false;
    }, TypeError, 'should not allow mutation');
  });

  it('P15-06: PWA cacheName updated to v0.25.0', () => {
    assert.strictEqual(config.PWA.cacheName, 'yawmia-v0.28.0');
  });
});

// ══════════════════════════════════════════════════════════════
// SSE Manager Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 15 — SSE Manager', () => {

  it('P15-07: getStats returns zero initially', () => {
    sseManager._connections.clear();
    const stats = sseManager.getStats();
    assert.strictEqual(stats.totalUsers, 0);
    assert.strictEqual(stats.totalConnections, 0);
  });

  it('P15-08: addConnection registers user', () => {
    sseManager._connections.clear();
    const mockRes = createMockRes();
    sseManager.addConnection('usr_test1', mockRes);
    const stats = sseManager.getStats();
    assert.strictEqual(stats.totalUsers, 1);
    assert.strictEqual(stats.totalConnections, 1);
    sseManager._connections.clear();
  });

  it('P15-09: Multiple connections per user', () => {
    sseManager._connections.clear();
    const mockRes1 = createMockRes();
    const mockRes2 = createMockRes();
    sseManager.addConnection('usr_multi', mockRes1);
    sseManager.addConnection('usr_multi', mockRes2);
    const stats = sseManager.getStats();
    assert.strictEqual(stats.totalUsers, 1);
    assert.strictEqual(stats.totalConnections, 2);
    sseManager._connections.clear();
  });

  it('P15-10: maxConnectionsPerUser enforced (evict oldest)', () => {
    sseManager._connections.clear();
    const responses = [];
    // Add more than max (3) connections
    for (let i = 0; i < 5; i++) {
      const mockRes = createMockRes();
      mockRes._testId = i;
      responses.push(mockRes);
      sseManager.addConnection('usr_overflow', mockRes);
    }
    const stats = sseManager.getStats();
    assert.ok(stats.totalConnections <= config.SSE.maxConnectionsPerUser,
      `expected <= ${config.SSE.maxConnectionsPerUser} connections, got ${stats.totalConnections}`);
    sseManager._connections.clear();
  });

  it('P15-11: sendToUser writes SSE data', () => {
    sseManager._connections.clear();
    const mockRes = createMockRes();
    sseManager.addConnection('usr_send', mockRes);
    sseManager.sendToUser('usr_send', 'notification', { message: 'test' }, 'evt_1');
    assert.ok(mockRes._written.length > 0, 'should have written data');
    const combined = mockRes._written.join('');
    assert.ok(combined.includes('event: notification'), 'should contain event type');
    assert.ok(combined.includes('"message":"test"'), 'should contain data');
    assert.ok(combined.includes('id: evt_1'), 'should contain event id');
    sseManager._connections.clear();
  });

  it('P15-12: sendToUser to non-existent user does not throw', () => {
    sseManager._connections.clear();
    assert.doesNotThrow(() => {
      sseManager.sendToUser('usr_nonexistent', 'notification', { test: true });
    });
  });

  it('P15-13: disconnectUser closes all connections', () => {
    sseManager._connections.clear();
    const mockRes1 = createMockRes();
    const mockRes2 = createMockRes();
    sseManager.addConnection('usr_disc', mockRes1);
    sseManager.addConnection('usr_disc', mockRes2);
    sseManager.disconnectUser('usr_disc');
    const stats = sseManager.getStats();
    assert.strictEqual(stats.totalUsers, 0);
    assert.strictEqual(stats.totalConnections, 0);
    assert.strictEqual(mockRes1.writableEnded, true);
    assert.strictEqual(mockRes2.writableEnded, true);
  });

  it('P15-14: cleanupDeadConnections removes dead', () => {
    sseManager._connections.clear();
    const liveRes = createMockRes();
    const deadRes = createMockRes();
    deadRes.writableEnded = true; // Mark as dead
    sseManager.addConnection('usr_cleanup', liveRes);
    // Manually add dead connection
    sseManager._connections.get('usr_cleanup').add({ res: deadRes, connectedAt: Date.now(), lastEventId: null });
    assert.strictEqual(sseManager.getStats().totalConnections, 2);
    sseManager.cleanupDeadConnections();
    assert.strictEqual(sseManager.getStats().totalConnections, 1);
    sseManager._connections.clear();
  });

  it('P15-15: formatSSE includes event + data', () => {
    const result = sseManager.formatSSE('test_event', { key: 'value' });
    assert.ok(result.includes('event: test_event'));
    assert.ok(result.includes('data: '));
    assert.ok(result.includes('"key":"value"'));
    assert.ok(result.endsWith('\n\n'));
  });

  it('P15-16: formatSSE includes id when provided', () => {
    const result = sseManager.formatSSE('test_event', { key: 'value' }, 'evt_123');
    assert.ok(result.includes('id: evt_123'));
  });

  it('P15-17: broadcast sends to all users', () => {
    sseManager._connections.clear();
    const mockRes1 = createMockRes();
    const mockRes2 = createMockRes();
    sseManager.addConnection('usr_bc1', mockRes1);
    sseManager.addConnection('usr_bc2', mockRes2);
    sseManager.broadcast('announcement', { msg: 'hello' });
    assert.ok(mockRes1._written.length > 0, 'user 1 should receive broadcast');
    assert.ok(mockRes2._written.length > 0, 'user 2 should receive broadcast');
    sseManager._connections.clear();
  });

  it('P15-18: sendHeartbeat sends comment to all', () => {
    sseManager._connections.clear();
    const mockRes = createMockRes();
    sseManager.addConnection('usr_hb', mockRes);
    sseManager.sendHeartbeat();
    assert.ok(mockRes._written.length > 0);
    const combined = mockRes._written.join('');
    assert.ok(combined.includes(': heartbeat'), 'should contain heartbeat comment');
    sseManager._connections.clear();
  });
});

// ══════════════════════════════════════════════════════════════
// Job Renewal Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 15 — Job Renewal', () => {

  it('P15-19: renewJob function exported from jobs.js', () => {
    assert.strictEqual(typeof jobsService.renewJob, 'function');
  });

  it('P15-20: JOB_RENEWAL.allowedFromStatuses', () => {
    assert.deepStrictEqual(config.JOB_RENEWAL.allowedFromStatuses, ['expired', 'cancelled']);
  });

  it('P15-21: renewJob rejects non-allowed status', async () => {
    const employer = await createTestUser('employer');
    const job = await jobsService.create(employer.id, {
      title: 'فرصة حالة غلط',
      category: 'construction',
      governorate: 'cairo',
      workersNeeded: 1,
      dailyWage: 200,
      startDate: '2026-06-01',
      durationDays: 1,
    });
    // Job is 'open' — not in allowedFromStatuses
    const result = await jobsService.renewJob(job.id, employer.id);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'INVALID_STATUS_FOR_RENEWAL');
  });

  it('P15-22: renewJob rejects non-owner', async () => {
    const employer = await createTestUser('employer');
    const other = await createTestUser('employer');
    const job = await jobsService.create(employer.id, {
      title: 'فرصة ملك حد تاني',
      category: 'farming',
      governorate: 'giza',
      workersNeeded: 1,
      dailyWage: 150,
      startDate: '2026-06-01',
      durationDays: 1,
    });
    // Manually expire the job
    await jobsService.updateStatus(job.id, 'expired');
    const result = await jobsService.renewJob(job.id, other.id);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'NOT_JOB_OWNER');
  });

  it('P15-23: renewJob rejects max renewals exceeded', async () => {
    const employer = await createTestUser('employer');
    const job = await jobsService.create(employer.id, {
      title: 'فرصة تجديد كتير',
      category: 'loading',
      governorate: 'cairo',
      workersNeeded: 1,
      dailyWage: 200,
      startDate: '2026-06-01',
      durationDays: 1,
    });
    // Manually set expired + max renewals
    const jobPath = db.getRecordPath('jobs', job.id);
    const jobData = await db.readJSON(jobPath);
    jobData.status = 'expired';
    jobData.renewalCount = config.JOB_RENEWAL.maxRenewalsPerJob;
    await db.atomicWrite(jobPath, jobData);
    // Update index
    const jobsIndex = await db.readIndex('jobsIndex');
    if (jobsIndex[job.id]) {
      jobsIndex[job.id].status = 'expired';
      await db.writeIndex('jobsIndex', jobsIndex);
    }

    const result = await jobsService.renewJob(job.id, employer.id);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'MAX_RENEWALS_REACHED');
  });

  it('P15-24: renewJob resets status to open', async () => {
    const employer = await createTestUser('employer');
    const job = await jobsService.create(employer.id, {
      title: 'فرصة للتجديد',
      category: 'painting',
      governorate: 'alex',
      workersNeeded: 2,
      dailyWage: 300,
      startDate: '2026-06-01',
      durationDays: 3,
    });
    // Manually expire
    await jobsService.updateStatus(job.id, 'expired');
    const result = await jobsService.renewJob(job.id, employer.id);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.job.status, 'open');
  });

  it('P15-25: renewJob increments renewalCount', async () => {
    const employer = await createTestUser('employer');
    const job = await jobsService.create(employer.id, {
      title: 'فرصة عداد التجديد',
      category: 'cleaning',
      governorate: 'cairo',
      workersNeeded: 1,
      dailyWage: 200,
      startDate: '2026-06-01',
      durationDays: 1,
    });
    await jobsService.updateStatus(job.id, 'expired');
    const result = await jobsService.renewJob(job.id, employer.id);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.job.renewalCount, 1);
  });

  it('P15-26: renewJob sets new expiresAt in future', async () => {
    const employer = await createTestUser('employer');
    const job = await jobsService.create(employer.id, {
      title: 'فرصة تاريخ جديد',
      category: 'electrical',
      governorate: 'giza',
      workersNeeded: 1,
      dailyWage: 250,
      startDate: '2026-06-01',
      durationDays: 2,
    });
    await jobsService.updateStatus(job.id, 'cancelled');
    const result = await jobsService.renewJob(job.id, employer.id);
    assert.strictEqual(result.ok, true);
    assert.ok(new Date(result.job.expiresAt) > new Date(), 'expiresAt should be in the future');
  });
});

// ══════════════════════════════════════════════════════════════
// SSE Handler Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 15 — SSE Handler', () => {

  it('P15-27: handleNotificationStream function exported', () => {
    assert.strictEqual(typeof sseHandler.handleNotificationStream, 'function');
  });
});

// ══════════════════════════════════════════════════════════════
// Version Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 15 — Version', () => {

  it('P15-28: package.json version 0.25.0', async () => {
    const pkgPath = resolve('package.json');
    const raw = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw);
    assert.strictEqual(pkg.version, '0.28.0');
  });
});

// ══════════════════════════════════════════════════════════════
// Routes Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 15 — Routes', () => {

  it('P15-29: Router has 52 routes', async () => {
    // Read router.js and count route definitions
    const routerPath = resolve('server/router.js');
    const content = await readFile(routerPath, 'utf-8');
    const routeMatches = content.match(/\{\s*method:\s*'/g);
    assert.ok(routeMatches, 'should find route definitions');
    assert.strictEqual(routeMatches.length, 84, `expected 74 routes, got ${routeMatches.length}`);
  });
});

// ══════════════════════════════════════════════════════════════
// Events Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 15 — Events', () => {

  it('P15-30: renewJob emits job:renewed event', async () => {
    const employer = await createTestUser('employer');
    const job = await jobsService.create(employer.id, {
      title: 'فرصة حدث التجديد',
      category: 'security',
      governorate: 'cairo',
      workersNeeded: 1,
      dailyWage: 200,
      startDate: '2026-06-01',
      durationDays: 1,
    });
    await jobsService.updateStatus(job.id, 'expired');

    let eventData = null;
    const unsub = eventBus.on('job:renewed', (data) => { eventData = data; });
    await jobsService.renewJob(job.id, employer.id);
    unsub();

    assert.ok(eventData, 'job:renewed event should fire');
    assert.strictEqual(eventData.jobId, job.id);
    assert.strictEqual(eventData.employerId, employer.id);
    assert.ok(eventData.jobTitle);
  });
});
