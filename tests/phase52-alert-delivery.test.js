import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dataDir;
let db;
let queueWorkers;
let deliveries;
let server;
let webhookUrl;
let received = [];
let failMode = false;

async function waitForDeliveryStatus(deliveryId, expectedStatus, timeoutMs = 5000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const delivery = await deliveries.getDelivery(deliveryId);
    if (delivery && delivery.status === expectedStatus) return delivery;
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return await deliveries.getDelivery(deliveryId);
}

test.before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'yawmia-phase52-alert-'));
  process.env.YAWMIA_DATA_PATH = dataDir;
  process.env.ADMIN_ALERT_CHANNELS_ENABLED = 'true';

  server = createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      received.push({ url: req.url, body });
      if (failMode) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      }
    });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  webhookUrl = `http://127.0.0.1:${addr.port}/webhook`;
  process.env.ADMIN_ALERT_WEBHOOK_URL = webhookUrl;

  db = await import('../server/services/database.js');
  await db.initDatabase();

  queueWorkers = await import('../server/services/queueWorkers.js');
  deliveries = await import('../server/services/alertDeliveryHistory.js');
});

test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  delete process.env.ADMIN_ALERT_WEBHOOK_URL;
  delete process.env.ADMIN_ALERT_CHANNELS_ENABLED;
  await rm(dataDir, { recursive: true, force: true });
});

test('deliverAdminAlert enqueues persistent webhook delivery', async () => {
  const alerts = await import('../server/services/adminAlertChannels.js');

  const result = await alerts.deliverAdminAlert({
    type: 'counters:file_size_critical',
    severity: 'high',
    data: {
      summary: 'counter file critical test',
      sizeMB: 99,
      fingerprint: 'phase52-alert-test-1',
    },
  });

  assert.equal(result.queued, true);
  assert.equal(result.delivered, false);
  assert.equal(result.deliveries.length, 1);
  assert.equal(result.results[0].queued, true);

  const delivery = await deliveries.getDelivery(result.deliveries[0].id);
  assert.equal(delivery.status, 'queued');
  assert.equal(delivery.channel, 'webhook');
  assert.ok(delivery.queueJobId);
});

test('webhook queue job success marks delivery delivered', async () => {
  received = [];
  failMode = false;

  const list = await deliveries.listDeliveries({ status: 'queued', limit: 1 });
  assert.equal(list.deliveries.length >= 1, true);

  await queueWorkers.processDueJobs();
  await new Promise(resolve => setTimeout(resolve, 250));

  const delivery = await deliveries.getDelivery(list.deliveries[0].id);
  assert.equal(delivery.status, 'delivered');
  assert.equal(delivery.attempts.length >= 1, true);
  assert.equal(delivery.attempts[0].ok, true);
  assert.equal(received.length >= 1, true);
});

test('webhook failure records attempt and schedules retry', async () => {
  received = [];
  failMode = true;

  const alerts = await import('../server/services/adminAlertChannels.js');

  const result = await alerts.deliverAdminAlert({
    type: 'counters:file_size_critical',
    severity: 'high',
    data: {
      summary: 'counter file critical failure',
      sizeMB: 100,
      fingerprint: 'phase52-alert-test-fail',
    },
  });

  assert.equal(result.queued, true);

  await queueWorkers.processDueJobs();

  const delivery = await waitForDeliveryStatus(result.deliveries[0].id, 'failed', 6000);
  assert.equal(delivery.status, 'failed');
  assert.equal(delivery.attempts.length, 1);
  assert.equal(delivery.attempts[0].ok, false);

  const queue = await import('../server/services/opsQueue.js');
  const job = await queue.getJob(delivery.queueJobId);
  assert.equal(job.status, 'pending');
  assert.match(job.lastError || '', /HTTP 500|Webhook failed|fetch failed|failed/i);
});

test('manual retry creates new queue job for failed delivery', async () => {
  const failed = await deliveries.listDeliveries({ status: 'failed', limit: 1 });
  assert.equal(failed.deliveries.length >= 1, true);

  const result = await deliveries.retryDelivery(failed.deliveries[0].id, 'admin_test');
  assert.equal(result.ok, true);
  assert.equal(result.delivery.status, 'queued');
  assert.ok(result.queueJob);
  assert.equal(result.queueJob.status, 'pending');
});

test('sync delivery path still works when requested', async () => {
  failMode = false;
  received = [];

  const alerts = await import('../server/services/adminAlertChannels.js');

  const result = await alerts.deliverAdminAlert({
    type: 'test',
    severity: 'medium',
    data: {
      summary: 'sync test',
      fingerprint: 'phase52-sync-test',
    },
  }, { sync: true });

  assert.equal(result.queued, false);
  assert.equal(result.delivered, true);
  assert.equal(received.length >= 1, true);
});

test('duplicate alert does not create orphan delivery for same identity', async () => {
  failMode = false;
  received = [];

  const alerts = await import('../server/services/adminAlertChannels.js');

  const first = await alerts.deliverAdminAlert({
    type: 'counters:file_size_critical',
    severity: 'high',
    data: {
      summary: 'same identity alert',
      sizeMB: 101,
      fingerprint: 'phase52-alert-dedupe',
    },
  });

  const second = await alerts.deliverAdminAlert({
    type: 'counters:file_size_critical',
    severity: 'high',
    data: {
      summary: 'same identity alert',
      sizeMB: 101,
      fingerprint: 'phase52-alert-dedupe',
    },
  });

  assert.equal(first.queued || first.delivered, true);
  assert.equal(second.results[0].deduped, true);
  assert.equal(second.deliveries[0].id, first.deliveries[0].id);
});
