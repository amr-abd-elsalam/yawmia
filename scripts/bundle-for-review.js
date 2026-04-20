#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/bundle-for-review.js
// يجمع كل ملفات المشروع في 4 ملفات للمراجعة
// Usage: node scripts/bundle-for-review.js
// Output: CODEBASE_PART1.md ... CODEBASE_PART4.md
// ═══════════════════════════════════════════════════════════════

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

const IGNORE = new Set([
  'node_modules', '.git', 'data', 'backups', 'test-backups',
  '.env', 'package-lock.json', '.DS_Store', 'Thumbs.db',
  'cloudflared.deb', 'tests',
]);

const IGNORE_FILES = new Set([
  'CODEBASE_PART1.md', 'CODEBASE_PART2.md',
  'CODEBASE_PART3.md', 'CODEBASE_PART4.md',
]);

const IGNORE_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp',
  '.woff', '.woff2', '.ttf', '.svg', '.log', '.tmp', '.deb',
]);

// ── التقسيم المنطقي ──
const PART_RULES = [
  {
    file: 'CODEBASE_PART1.md',
    title: 'Part 1: Config + Server Core + Router',
    match: (f) => [
      'config.js', 'package.json', 'server.js',
      '.env.example', '.gitignore',
      'server/router.js',
    ].includes(f),
  },
  {
    file: 'CODEBASE_PART2.md',
    title: 'Part 2: Backend Services (21 services + 2 adapters)',
    match: (f) => f.startsWith('server/services/'),
  },
  {
    file: 'CODEBASE_PART3.md',
    title: 'Part 3: Middleware (7) + Handlers (11)',
    match: (f) => f.startsWith('server/middleware/') || f.startsWith('server/handlers/'),
  },
  {
    file: 'CODEBASE_PART4.md',
    title: 'Part 4: Frontend + PWA + Scripts',
    match: (f) => f.startsWith('frontend/') || f.startsWith('scripts/'),
  },
];

function getLanguage(filePath) {
  const ext = extname(filePath).toLowerCase();
  return { '.js': 'javascript', '.json': 'json', '.html': 'html', '.css': 'css', '.sh': 'bash' }[ext] || 'text';
}

async function collectFiles(dir, base = ROOT) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (IGNORE.has(entry.name) || IGNORE_FILES.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    const relPath = relative(base, fullPath);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath, base));
    } else if (entry.isFile()) {
      if (IGNORE_EXT.has(extname(entry.name).toLowerCase())) continue;
      files.push(relPath);
    }
  }
  return files;
}

async function main() {
  console.log('📦 جاري تجميع ملفات المشروع...');

  const allFiles = (await collectFiles(ROOT)).sort();

  let version = '?';
  try {
    const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf-8'));
    version = pkg.version;
  } catch (_) {}

  let totalFiles = 0;

  for (const part of PART_RULES) {
    const partFiles = allFiles.filter(f => part.match(f));
    if (partFiles.length === 0) continue;

    const lines = [];
    lines.push(`# يوميّة (Yawmia) v${version} — ${part.title}`);
    lines.push(`> Auto-generated: ${new Date().toISOString()}`);
    lines.push(`> Files in this part: ${partFiles.length}`);
    lines.push('');

    // Table of contents
    lines.push('## Files');
    partFiles.forEach((f, i) => lines.push(`${i + 1}. \`${f}\``));
    lines.push('');
    lines.push('---');
    lines.push('');

    for (const filePath of partFiles) {
      try {
        const content = await readFile(join(ROOT, filePath), 'utf-8');
        lines.push(`## \`${filePath}\``);
        lines.push('');
        lines.push(`\`\`\`${getLanguage(filePath)}`);
        lines.push(content.trimEnd());
        lines.push('```');
        lines.push('');
        lines.push('---');
        lines.push('');
      } catch (err) {
        lines.push(`## \`${filePath}\``);
        lines.push(`> ⚠️ Error: ${err.message}`);
        lines.push('---');
        lines.push('');
      }
    }

    const outputPath = join(ROOT, part.file);
    await writeFile(outputPath, lines.join('\n'), 'utf-8');
    const sizeKB = (Buffer.byteLength(lines.join('\n')) / 1024).toFixed(1);
    console.log(`  ✅ ${part.file} — ${partFiles.length} files (${sizeKB} KB)`);
    totalFiles += partFiles.length;
  }

  // Catch unmatched files
  const matched = new Set();
  for (const part of PART_RULES) {
    allFiles.filter(f => part.match(f)).forEach(f => matched.add(f));
  }
  const unmatched = allFiles.filter(f => !matched.has(f));
  if (unmatched.length > 0) {
    console.log(`  ⚠️ Unmatched files (not in any part): ${unmatched.join(', ')}`);
  }

  console.log(`\n📊 Total: ${totalFiles} files across ${PART_RULES.length} parts`);
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
