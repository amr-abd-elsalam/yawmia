import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const DOCS_DIR = join(ROOT, 'docs');
const REALITY_CHECK_PATH = join(ROOT, 'docs', 'operations', 'DOCS_REALITY_CHECK.md');
const DOCS_README_PATH = join(ROOT, 'docs', 'README.md');

async function walkMarkdownFiles(dir, prefix = 'docs') {
  const entries = await readdir(dir, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const full = join(dir, entry.name);
    const rel = `${prefix}/${entry.name}`;

    if (entry.isDirectory()) {
      const nested = await walkMarkdownFiles(full, rel);
      results.push(...nested);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(rel.replace(/\\/g, '/'));
    }
  }

  return results.sort();
}

test('DOCS_REALITY_CHECK.md mentions every docs/**/*.md file', async () => {
  const [docs, realityCheck] = await Promise.all([
    walkMarkdownFiles(DOCS_DIR),
    readFile(REALITY_CHECK_PATH, 'utf-8'),
  ]);

  assert.ok(docs.length > 0, 'expected docs/**/*.md files to exist');

  const missing = docs.filter(docPath => !realityCheck.includes(`\`${docPath}\``));

  assert.deepEqual(
    missing,
    [],
    `Every docs/**/*.md file must be cataloged in DOCS_REALITY_CHECK.md. Missing: ${missing.join(', ')}`
  );
});

test('DOCS_REALITY_CHECK.md includes docs governance sections', async () => {
  const realityCheck = await readFile(REALITY_CHECK_PATH, 'utf-8');

  const requiredSections = [
    '## Purpose',
    '## Documentation Classes',
    '## Maintenance Rules',
    '## Top-Level Documentation',
    '## Operations Docs',
    '## Phase 60 Docs',
    '## Phase 61 Docs',
    '## Phase 61.2 Docs',
    '## Docs Duplication / Drift Watchlist',
    '## Canonical Docs Recommended Index',
    '## Final Position',
  ];

  for (const section of requiredSections) {
    assert.ok(realityCheck.includes(section), `Missing docs reality section: ${section}`);
  }
});

test('docs/README.md links to DOCS_REALITY_CHECK.md', async () => {
  const readme = await readFile(DOCS_README_PATH, 'utf-8');

  assert.ok(
    readme.includes('docs/operations/DOCS_REALITY_CHECK.md'),
    'docs/README.md must link to DOCS_REALITY_CHECK.md'
  );
});

test('architecture systems catalog is linked from docs index and reality check', async () => {
  const [readme, realityCheck] = await Promise.all([
    readFile(DOCS_README_PATH, 'utf-8'),
    readFile(REALITY_CHECK_PATH, 'utf-8'),
  ]);

  assert.ok(
    readme.includes('docs/architecture/SYSTEMS_CATALOG.md'),
    'docs/README.md must link to docs/architecture/SYSTEMS_CATALOG.md'
  );

  assert.ok(
    realityCheck.includes('`docs/architecture/SYSTEMS_CATALOG.md`'),
    'DOCS_REALITY_CHECK.md must catalog docs/architecture/SYSTEMS_CATALOG.md'
  );

  assert.ok(
    realityCheck.includes('Architecture / system inventory baseline'),
    'DOCS_REALITY_CHECK.md must describe SYSTEMS_CATALOG.md as architecture/system inventory baseline'
  );

  assert.ok(
    realityCheck.includes('Canonical architecture reference'),
    'DOCS_REALITY_CHECK.md must classify SYSTEMS_CATALOG.md as canonical architecture reference'
  );
});

test('architecture data catalog is linked from docs index and reality check', async () => {
  const [readme, realityCheck] = await Promise.all([
    readFile(DOCS_README_PATH, 'utf-8'),
    readFile(REALITY_CHECK_PATH, 'utf-8'),
  ]);

  assert.ok(
    readme.includes('docs/architecture/DATA_CATALOG.md'),
    'docs/README.md must link to docs/architecture/DATA_CATALOG.md'
  );

  assert.ok(
    readme.includes('DATA_CATALOG.md'),
    'docs/README.md must mention DATA_CATALOG.md'
  );

  assert.ok(
    realityCheck.includes('`docs/architecture/DATA_CATALOG.md`'),
    'DOCS_REALITY_CHECK.md must catalog docs/architecture/DATA_CATALOG.md'
  );

  assert.ok(
    realityCheck.includes('Collection-level data architecture inventory'),
    'DOCS_REALITY_CHECK.md must describe DATA_CATALOG.md as collection-level data architecture inventory'
  );

  assert.ok(
    realityCheck.includes('Canonical data architecture reference'),
    'DOCS_REALITY_CHECK.md must classify DATA_CATALOG.md as Canonical Reference'
  );
});

test('architecture server catalog is linked from docs index and reality check', async () => {
  const [readme, realityCheck] = await Promise.all([
    readFile(DOCS_README_PATH, 'utf-8'),
    readFile(REALITY_CHECK_PATH, 'utf-8'),
  ]);

  assert.ok(
    readme.includes('docs/architecture/SERVER_CATALOG.md'),
    'docs/README.md must link to docs/architecture/SERVER_CATALOG.md'
  );

  assert.ok(
    readme.includes('SERVER_CATALOG.md'),
    'docs/README.md must mention SERVER_CATALOG.md'
  );

  assert.ok(
    realityCheck.includes('`docs/architecture/SERVER_CATALOG.md`'),
    'DOCS_REALITY_CHECK.md must catalog docs/architecture/SERVER_CATALOG.md'
  );

  assert.ok(
    realityCheck.includes('Server/runtime lifecycle architecture inventory'),
    'DOCS_REALITY_CHECK.md must describe SERVER_CATALOG.md as server/runtime lifecycle architecture inventory'
  );

  assert.ok(
    realityCheck.includes('Canonical server/runtime lifecycle architecture reference'),
    'DOCS_REALITY_CHECK.md must classify SERVER_CATALOG.md as Canonical Reference'
  );
});

test('events catalog is linked from docs index and reality check', async () => {
  const [readme, realityCheck] = await Promise.all([
    readFile(DOCS_README_PATH, 'utf-8'),
    readFile(REALITY_CHECK_PATH, 'utf-8'),
  ]);

  assert.ok(
    readme.includes('docs/architecture/EVENTS_CATALOG.md'),
    'docs/README.md must link to docs/architecture/EVENTS_CATALOG.md'
  );

  assert.ok(
    realityCheck.includes('`docs/architecture/EVENTS_CATALOG.md`'),
    'DOCS_REALITY_CHECK.md must catalog docs/architecture/EVENTS_CATALOG.md'
  );

  assert.ok(
    realityCheck.includes('EventBus/events/fanout architecture inventory'),
    'DOCS_REALITY_CHECK.md must describe EVENTS_CATALOG.md as EventBus/events/fanout architecture inventory'
  );

  assert.ok(
    realityCheck.includes('Canonical EventBus/events/fanout architecture reference'),
    'DOCS_REALITY_CHECK.md must classify EVENTS_CATALOG.md as Canonical Reference'
  );
});
