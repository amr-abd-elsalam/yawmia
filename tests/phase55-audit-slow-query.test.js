import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase55-audit-slow-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const database = await import(`../server/services/database.js?x=${Date.now()}`);
  await database.initDatabase();

  const auditIndex = await import(`../server/services/auditLogIndex.js?x=${Date.now()}`);

  return { dir, auditIndex };
}

test('Phase 55: slow audit query telemetry can be recorded and listed', async () => {
  const { dir, auditIndex } = await setup();

  try {
    await auditIndex.recordSlowAuditQuery({
      durationMs: 1500,
      indexed: false,
      fallbackUsed: true,
      fallbackReason: 'candidate_cap_exceeded',
      candidateCount: 9999,
      resultCount: 10,
      filters: { q: 'test' },
    });

    const result = await auditIndex.getSlowAuditQueries({ limit: 10 });

    assert.equal(result.total, 1);
    assert.equal(result.entries[0].durationMs, 1500);
    assert.equal(result.entries[0].fallbackReason, 'candidate_cap_exceeded');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
