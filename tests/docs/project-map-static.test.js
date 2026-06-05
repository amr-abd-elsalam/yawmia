import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const PROJECT_MAP_PATH = join(ROOT, 'docs', 'architecture', 'PROJECT_MAP.md');

test('PROJECT_MAP.md exists', async () => {
  const st = await stat(PROJECT_MAP_PATH);
  assert.ok(st.isFile(), 'docs/architecture/PROJECT_MAP.md must exist');
});

test('PROJECT_MAP.md documents required architecture posture and maps', async () => {
  const doc = await readFile(PROJECT_MAP_PATH, 'utf-8');

  const requiredPhrases = [
    'v0.57.0',
    'Native Node.js 20+ ESM',
    'native http',
    'zero-framework',
    'file-backed JSON source of truth',
    'documentation-only',
    'not runtime authority',
    'How To Use This Documentation Set',
    'Documentation Update Scope Rules',
    'Do not update every catalog for every small change',
    'Start with',
    'Update the narrowest relevant doc',
    'source files are the source of truth',
    'Source of Truth vs Generated Review Bundles',
    'Repository Top-Level Map',
    'Backend Runtime Map',
    'Router / Handler / Middleware Map',
    'Service Layer Map',
    'Data / Storage Map',
    'Event / Fanout Map',
    'Frontend / PWA Map',
    'Scripts / Ops Tooling Map',
    'Tests Map',
    'Documentation Map',
    'Governance / Privacy Map',
    'Phase 59 / 60 / 61 Advisory Map',
    'Safe Review Workflow',
    'Safe Git / Bundle Workflow',
    'What Not To Do',
    'Final Safety Position',
    'CODEBASE_PART1.md',
    'CODEBASE_PART2.md',
    'CODEBASE_PART3.md',
    'CODEBASE_PART4.md',
    'server.js',
    'server/router.js',
    'server/services',
    'server/handlers',
    'server/middleware',
    'frontend',
    'scripts',
    'tests',
    'docs',
    'SYSTEMS_CATALOG.md',
    'DATA_CATALOG.md',
    'SERVER_CATALOG.md',
    'EVENTS_CATALOG.md',
    'ROUTES_CATALOG.md',
    'SCRIPTS_CATALOG.md',
    'DOCS_REALITY_CHECK.md',
    'no PostgreSQL',
    'no Redis',
    'no external queue',
    'no external search',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(
      doc.includes(phrase),
      `PROJECT_MAP.md must include required phrase: ${phrase}`
    );
  }
});

test('PROJECT_MAP.md preserves documentation-only safety posture', async () => {
  const doc = await readFile(PROJECT_MAP_PATH, 'utf-8');

  const requiredSafetyLines = [
    'No runtime change.',
    'No deletion.',
    'No reset.',
    'No confirmed mutation.',
    'No production queue mutation.',
    'No scheduler mutation.',
    'No PM2 restart/start/save.',
    'No index repair execution.',
    'No notification quarantine execution.',
    'No migration execution.',
    'No router refactor.',
    'No middleware refactor.',
    'No handler rewrite.',
    'No service rewrite.',
    'No auth weakening.',
    'No RBAC weakening.',
    'No EventBus refactor.',
    'No SSE fanout implementation.',
    'No external pub/sub.',
    'No externalization.',
    'No PostgreSQL.',
    'No Redis.',
    'No external queue.',
    'No external search.',
    'No new dependencies.',
    'No version/cache change.',
    'PROJECT_MAP.md is documentation-only.',
    'PROJECT_MAP.md is not runtime authority.',
  ];

  for (const line of requiredSafetyLines) {
    assert.ok(
      doc.includes(line),
      `PROJECT_MAP.md must preserve final safety line: ${line}`
    );
  }
});
