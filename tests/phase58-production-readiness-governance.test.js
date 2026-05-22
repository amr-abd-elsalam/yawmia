import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTempDb() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase58-readiness-'));
  process.env.YAWMIA_DATA_PATH = dir;
  process.env.ADMIN_TOKEN = 'test-admin-token';

  const db = await import(`../server/services/database.js?readiness=${Date.now()}`);
  await db.initDatabase();

  return { dir };
}

test('production readiness includes Phase 58 governance checks', async () => {
  const { dir } = await setupTempDb();

  try {
    const readiness = await import(`../server/services/productionReadiness.js?readiness=${Date.now()}`);
    const checks = await readiness.runReadinessChecks();

    const ids = new Set(checks.map(c => c.id));

    assert.ok(ids.has('admin_rbac_enabled'));
    assert.ok(ids.has('admin_rbac_runbook_exists'));
    assert.ok(ids.has('privacy_runbook_exists'));
    assert.ok(ids.has('postmortem_template_exists'));
    assert.ok(ids.has('data_governance_runbook_exists'));
    assert.ok(ids.has('privacy_requests_enabled'));
    assert.ok(ids.has('dangerous_actions_approval_configured'));
    assert.ok(ids.has('weekly_ops_review_fresh'));
    assert.ok(ids.has('critical_incidents_have_postmortem'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('production readiness classification remains additive and safe', async () => {
  const { dir } = await setupTempDb();

  try {
    const readiness = await import(`../server/services/productionReadiness.js?readiness2=${Date.now()}`);
    const result = await readiness.getProductionReadiness();

    assert.ok(result);
    assert.ok(Array.isArray(result.checks));
    assert.ok(result.summary);
    assert.ok(['ready', 'warnings', 'not_ready', 'disabled'].includes(result.status));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
