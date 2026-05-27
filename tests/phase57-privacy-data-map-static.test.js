import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('PRIVACY_DATA_MAP documents core collections and PII posture', async () => {
  const md = await readFile(new URL('../docs/privacy/PRIVACY_DATA_MAP.md', import.meta.url), 'utf-8');

  const collections = [
    'users',
    'sessions',
    'jobs',
    'applications',
    'attendance',
    'messages',
    'workrooms',
    'payments',
    'reports',
    'verifications',
    'images',
    'notifications',
    'audit',
    'predictive_signals',
    'metrics',
    'exports',
    'ops_queue',
    'alert_deliveries',
  ];

  for (const name of collections) {
    assert.match(md, new RegExp(`## ${name}`));
  }

  assert.match(md, /PII/);
  assert.match(md, /Phase 58/);
});
