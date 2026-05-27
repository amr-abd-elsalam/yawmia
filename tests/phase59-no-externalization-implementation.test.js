import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

async function walk(dir, results = []) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'data') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, results);
    } else if (entry.isFile() && /\.(js|md|json)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

test('Phase 59 does not add external DB/search/queue dependencies', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf-8'));

  const deps = Object.keys(pkg.dependencies || {});
  assert.deepEqual(deps.sort(), ['dotenv']);

  const serialized = JSON.stringify(pkg);
  assert.ok(!serialized.includes('pg'));
  assert.ok(!serialized.includes('postgres'));
  assert.ok(!serialized.includes('redis'));
  assert.ok(!serialized.includes('ioredis'));
  assert.ok(!serialized.includes('elasticsearch'));
  assert.ok(!serialized.includes('opensearch'));
  assert.ok(!serialized.includes('bullmq'));
  assert.ok(!serialized.includes('amqplib'));
  assert.ok(!serialized.includes('kafkajs'));
});

test('Phase 59 service code does not implement external connection strings', async () => {
  const files = await walk('server');
  const suspicious = [];

  for (const file of files) {
    const raw = await readFile(file, 'utf-8');

    const patterns = [
      /postgres:\/\/|postgresql:\/\//i,
      /redis:\/\//i,
      /amqp:\/\//i,
      /new\s+Client\s*\(/,
      /createClient\s*\(\s*\{?\s*url:\s*process\.env\.REDIS/i,
      /Pool\s*\(\s*\{/,
    ];

    for (const pattern of patterns) {
      if (pattern.test(raw)) suspicious.push({ file, pattern: String(pattern) });
    }
  }

  assert.deepEqual(suspicious, []);
});

test('Externalization docs explicitly say Phase 59 is advisory-only', async () => {
  const raw = await readFile('docs/operations/EXTERNALIZATION_READINESS.md', 'utf-8');

  assert.ok(raw.includes('Phase 59 لا تنفذ'));
  assert.ok(raw.includes('Externalization is not Phase 59 implementation'));
  assert.ok(raw.includes('Do not implement PostgreSQL in Phase 59.'));
});
