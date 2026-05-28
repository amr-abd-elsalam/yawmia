import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const SCRIPT = 'scripts/phase61-1-remediation-status.js';

test('Phase 61.3 remediation status treats unavailable JSON health as warning-only', async () => {
  const raw = await readFile(SCRIPT, 'utf-8');

  assert.match(
    raw,
    /if \(!json\?\.parsed\) \{[\s\S]*warnings\.push\(\{[\s\S]*code: 'JSON_HEALTH_UNAVAILABLE'/,
  );

  assert.match(
    raw,
    /else if \(json\.parsed\.critical > 0 \|\| json\.parsed\.nullByte > 0 \|\| json\.parsed\.invalid > 0\) \{[\s\S]*blockers\.push\(\{[\s\S]*code: 'DATA_INTEGRITY_BLOCKED'/,
  );
});

test('Phase 61.3 remediation status treats unavailable NUL-byte scan as warning-only', async () => {
  const raw = await readFile(SCRIPT, 'utf-8');

  assert.match(
    raw,
    /if \(!nul\?\.parsed\) \{[\s\S]*warnings\.push\(\{[\s\S]*code: 'NULL_BYTE_SCAN_UNAVAILABLE'/,
  );

  assert.match(
    raw,
    /else if \(\(nul\.parsed\.nulFileCount \|\| 0\) > 0\) \{[\s\S]*blockers\.push\(\{[\s\S]*code: 'NULL_BYTE_JSON_BLOCKED'/,
  );
});

test('Phase 61.3 remediation status keeps queue summary mismatch as blocker', async () => {
  const raw = await readFile(SCRIPT, 'utf-8');

  assert.match(
    raw,
    /if \(!qParsed \|\| actualMismatches\.length > 0 \|\| summaryMismatches\.length > 0\) \{[\s\S]*blockers\.push\(\{[\s\S]*code: 'QUEUE_SUMMARY_MISMATCH'/,
  );
});

test('Phase 61.3 remediation status clamps child duration to non-negative', async () => {
  const raw = await readFile(SCRIPT, 'utf-8');

  assert.match(
    raw,
    /durationMs: Math\.max\(0, Date\.now\(\) - started\),/,
  );
});
