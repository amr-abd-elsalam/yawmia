// ═══════════════════════════════════════════════════════════════
// tests/phase30-resilience.test.js — Phase 30 Tests
// Data Resilience + Content Safety + Search Performance + Expiry Warnings
// ═══════════════════════════════════════════════════════════════

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

function readSource(relPath) {
  return readFile(join(ROOT, relPath), 'utf-8');
}

// ═══════════════════════════════════════════════════════════════
// Migration System
// ═══════════════════════════════════════════════════════════════

describe('Phase 30 — Migration System', () => {
  it('P30-01: migration.js exports getCurrentVersion', async () => {
    const mod = await import('../server/services/migration.js');
    assert.equal(typeof mod.getCurrentVersion, 'function');
  });

  it('P30-02: migration.js exports runMigrations', async () => {
    const mod = await import('../server/services/migration.js');
    assert.equal(typeof mod.runMigrations, 'function');
  });

  it('P30-03: getCurrentVersion returns number', async () => {
    const mod = await import('../server/services/migration.js');
    const version = await mod.getCurrentVersion();
    assert.equal(typeof version, 'number');
  });

  it('P30-04: migration.json uses atomicWrite', async () => {
    const src = await readSource('server/services/migration.js');
    assert.ok(src.includes('atomicWrite'), 'migration.js should use atomicWrite');
  });

  it('P30-09: config has MIGRATION section', async () => {
    const config = (await import('../config.js')).default;
    assert.ok(config.MIGRATION, 'config.MIGRATION should exist');
    assert.equal(config.MIGRATION.enabled, true);
    assert.equal(config.MIGRATION.dataFile, 'migration.json');
  });

  it('P30-10: config.MIGRATION.runOnStartup is true', async () => {
    const config = (await import('../config.js')).default;
    assert.equal(config.MIGRATION.runOnStartup, true);
  });

  it('P30-11: server.js calls runMigrations at startup', async () => {
    const src = await readSource('server.js');
    assert.ok(src.includes('runMigrations'), 'server.js should call runMigrations');
  });

  it('P30-12: scripts/migrate.js exists', async () => {
    const src = await readSource('scripts/migrate.js');
    assert.ok(src.includes('runMigrations'), 'migrate.js should import runMigrations');
  });

  it('P30-06: v1 migration adds availability to users', async () => {
    const src = await readSource('server/services/migration.js');
    assert.ok(src.includes('availability'), 'v1 migration should handle availability field');
    assert.ok(src.includes('usr_'), 'v1 migration should filter user files');
  });

  it('P30-07: v1 migration checks before overwrite (idempotent)', async () => {
    const src = await readSource('server/services/migration.js');
    assert.ok(src.includes('!user.availability') || src.includes('if (!user.availability'), 'v1 migration should check if availability already exists');
  });
});

// ═══════════════════════════════════════════════════════════════
// Content Filter
// ═══════════════════════════════════════════════════════════════

describe('Phase 30 — Content Filter', () => {
  it('P30-13: contentFilter.js exports checkContent', async () => {
    const mod = await import('../server/services/contentFilter.js');
    assert.equal(typeof mod.checkContent, 'function');
  });

  it('P30-14: contentFilter.js exports isContentSafe', async () => {
    const mod = await import('../server/services/contentFilter.js');
    assert.equal(typeof mod.isContentSafe, 'function');
  });

  it('P30-15: clean text returns safe=true, score=0', async () => {
    const { checkContent } = await import('../server/services/contentFilter.js');
    const result = checkContent('عامل بناء محترف في القاهرة');
    assert.equal(result.safe, true);
    assert.equal(result.score, 0);
    assert.equal(result.flaggedTerms.length, 0);
  });

  it('P30-17: phone number detected with high score', async () => {
    const { checkContent } = await import('../server/services/contentFilter.js');
    const result = checkContent('اتصل بي 01012345678');
    assert.ok(result.score >= 0.7, `Phone score should be >= 0.7, got ${result.score}`);
    assert.ok(result.flaggedTerms.length > 0);
  });

  it('P30-19: Arabic normalized matching works', async () => {
    const { checkContent } = await import('../server/services/contentFilter.js');
    // Test with diacritics (should still match normalized blocklist)
    const result = checkContent('هذا تَحَرُّش واضح');
    assert.ok(result.score > 0, 'Diacritics should not prevent matching');
  });

  it('P30-21: empty/null text returns safe=true', async () => {
    const { checkContent } = await import('../server/services/contentFilter.js');
    assert.equal(checkContent('').safe, true);
    assert.equal(checkContent(null).safe, true);
    assert.equal(checkContent(undefined).safe, true);
  });

  it('P30-22: score is between 0.0 and 1.0', async () => {
    const { checkContent } = await import('../server/services/contentFilter.js');
    const result = checkContent('نصاب محتال تحرش واتساب 01012345678');
    assert.ok(result.score >= 0, 'Score should be >= 0');
    assert.ok(result.score <= 1.0, 'Score should be <= 1.0');
  });

  it('P30-23: flaggedTerms populated on match', async () => {
    const { checkContent } = await import('../server/services/contentFilter.js');
    const result = checkContent('واتساب رقمي');
    assert.ok(Array.isArray(result.flaggedTerms));
    assert.ok(result.flaggedTerms.length > 0);
  });

  it('P30-24: messages.js sendMessage uses content filter', async () => {
    const src = await readSource('server/services/messages.js');
    assert.ok(src.includes('isContentSafe') || src.includes('contentFilter'), 'sendMessage should use content filter');
  });

  it('P30-25: messages.js broadcastMessage uses content filter', async () => {
    const src = await readSource('server/services/messages.js');
    const broadcastSection = src.split('broadcastMessage')[1] || '';
    assert.ok(broadcastSection.includes('isContentSafe') || broadcastSection.includes('contentFilter'), 'broadcastMessage should use content filter');
  });

  it('P30-26: jobsHandler.js handleCreateJob uses content filter', async () => {
    const src = await readSource('server/handlers/jobsHandler.js');
    assert.ok(src.includes('checkContent') || src.includes('contentFilter'), 'handleCreateJob should use content filter');
  });

  it('P30-27: config has CONTENT_FILTER section', async () => {
    const config = (await import('../config.js')).default;
    assert.ok(config.CONTENT_FILTER, 'config.CONTENT_FILTER should exist');
    assert.equal(config.CONTENT_FILTER.blockThreshold, 0.7);
    assert.equal(config.CONTENT_FILTER.checkReportReason, false);
  });

  it('P30-18: multiple terms increase score', async () => {
    const { checkContent } = await import('../server/services/contentFilter.js');
    const single = checkContent('نصاب');
    const multiple = checkContent('نصاب محتال تهديد');
    assert.ok(multiple.score > single.score, 'Multiple terms should increase score');
  });
});

// ═══════════════════════════════════════════════════════════════
// Search Index
// ═══════════════════════════════════════════════════════════════

describe('Phase 30 — Search Index', () => {
  it('P30-28: searchIndex.js exports buildIndex', async () => {
    const mod = await import('../server/services/searchIndex.js');
    assert.equal(typeof mod.buildIndex, 'function');
  });

  it('P30-29: searchIndex.js exports addToIndex', async () => {
    const mod = await import('../server/services/searchIndex.js');
    assert.equal(typeof mod.addToIndex, 'function');
  });

  it('P30-30: searchIndex.js exports removeFromIndex', async () => {
    const mod = await import('../server/services/searchIndex.js');
    assert.equal(typeof mod.removeFromIndex, 'function');
  });

  it('P30-31: searchIndex.js exports updateStatus', async () => {
    const mod = await import('../server/services/searchIndex.js');
    assert.equal(typeof mod.updateStatus, 'function');
  });

  it('P30-32: searchIndex.js exports search', async () => {
    const mod = await import('../server/services/searchIndex.js');
    assert.equal(typeof mod.search, 'function');
  });

  it('P30-33: searchIndex.js exports getStats', async () => {
    const mod = await import('../server/services/searchIndex.js');
    assert.equal(typeof mod.getStats, 'function');
  });

  it('P30-34: search finds by normalized title', async () => {
    const { addToIndex, search } = await import('../server/services/searchIndex.js');
    const { normalizeArabic } = await import('../server/services/arabicNormalizer.js');
    addToIndex({ id: 'test_job_1', title: 'جمع محصول قمح', description: '', status: 'open', category: 'farming', governorate: 'cairo', dailyWage: 200, createdAt: new Date().toISOString() });
    const results = search(normalizeArabic('قمح'), { status: 'open' });
    assert.ok(results.includes('test_job_1'));
  });

  it('P30-35: search finds by normalized description', async () => {
    const { addToIndex, search } = await import('../server/services/searchIndex.js');
    const { normalizeArabic } = await import('../server/services/arabicNormalizer.js');
    addToIndex({ id: 'test_job_2', title: 'فرصة عمل', description: 'نحتاج عمال بناء وتشييد', status: 'open', category: 'construction', governorate: 'giza', dailyWage: 300, createdAt: new Date().toISOString() });
    const results = search(normalizeArabic('بناء'), { status: 'open' });
    assert.ok(results.includes('test_job_2'));
  });

  it('P30-36: search respects status filter', async () => {
    const { addToIndex, search } = await import('../server/services/searchIndex.js');
    const { normalizeArabic } = await import('../server/services/arabicNormalizer.js');
    addToIndex({ id: 'test_job_3', title: 'فرصة مغلقة', description: 'قمح', status: 'expired', category: 'farming', governorate: 'cairo', dailyWage: 200, createdAt: new Date().toISOString() });
    const results = search(normalizeArabic('قمح'), { status: 'open' });
    assert.ok(!results.includes('test_job_3'), 'Expired job should not match status=open');
  });

  it('P30-37: search respects category filter', async () => {
    const { search } = await import('../server/services/searchIndex.js');
    const { normalizeArabic } = await import('../server/services/arabicNormalizer.js');
    const results = search(normalizeArabic('قمح'), { status: 'open', category: 'construction' });
    assert.ok(!results.includes('test_job_1'), 'Farming job should not match construction category');
  });

  it('P30-38: addToIndex makes job searchable', async () => {
    const { addToIndex, search } = await import('../server/services/searchIndex.js');
    const { normalizeArabic } = await import('../server/services/arabicNormalizer.js');
    addToIndex({ id: 'test_job_4', title: 'دهانات وتشطيبات', description: '', status: 'open', category: 'painting', governorate: 'alex', dailyWage: 250, createdAt: new Date().toISOString() });
    const results = search(normalizeArabic('دهانات'), { status: 'open' });
    assert.ok(results.includes('test_job_4'));
  });

  it('P30-39: removeFromIndex removes from results', async () => {
    const { removeFromIndex, search } = await import('../server/services/searchIndex.js');
    const { normalizeArabic } = await import('../server/services/arabicNormalizer.js');
    removeFromIndex('test_job_4');
    const results = search(normalizeArabic('دهانات'), { status: 'open' });
    assert.ok(!results.includes('test_job_4'));
  });

  it('P30-40: getStats returns correct size', async () => {
    const { getStats } = await import('../server/services/searchIndex.js');
    const stats = getStats();
    assert.equal(typeof stats.size, 'number');
    assert.ok(stats.size >= 0);
  });

  it('P30-41: empty query returns empty results', async () => {
    const { search } = await import('../server/services/searchIndex.js');
    const results = search('', {});
    assert.equal(results.length, 0);
  });

  it('P30-42: config has SEARCH_INDEX section', async () => {
    const config = (await import('../config.js')).default;
    assert.ok(config.SEARCH_INDEX, 'config.SEARCH_INDEX should exist');
    assert.equal(config.SEARCH_INDEX.rebuildIntervalMs, 3600000);
  });

  it('P30-43: jobs.js list() uses searchIndex when enabled', async () => {
    const src = await readSource('server/services/jobs.js');
    assert.ok(src.includes('searchIndex') || src.includes('searchIndexQuery'), 'jobs.js list should use search index');
  });

  it('P30-44: jobs.js list() falls back to full scan when disabled', async () => {
    const src = await readSource('server/services/jobs.js');
    assert.ok(src.includes('searchHandled') || src.includes('fallback'), 'jobs.js should have fallback behavior');
  });
});

// ═══════════════════════════════════════════════════════════════
// safeReadJSON Adoption
// ═══════════════════════════════════════════════════════════════

describe('Phase 30 — safeReadJSON Adoption', () => {
  it('P30-45: users.js findById uses safeReadJSON', async () => {
    const src = await readSource('server/services/users.js');
    assert.ok(src.includes('safeReadJSON(userPath)'), 'users.js findById should use safeReadJSON');
  });

  it('P30-46: sessions.js verifySession uses safeReadJSON', async () => {
    const src = await readSource('server/services/sessions.js');
    assert.ok(src.includes('safeReadJSON(sessionPath)'), 'sessions.js verifySession should use safeReadJSON');
  });

  it('P30-47: payments.js findById uses safeReadJSON', async () => {
    const src = await readSource('server/services/payments.js');
    assert.ok(src.includes('safeReadJSON(paymentPath)'), 'payments.js findById should use safeReadJSON');
  });

  it('P30-48: jobs.js findById uses safeReadJSON', async () => {
    const src = await readSource('server/services/jobs.js');
    assert.ok(src.includes('safeReadJSON(jobPath)'), 'jobs.js findById should use safeReadJSON');
  });

  it('P30-49: safeReadJSON is imported in users.js', async () => {
    const src = await readSource('server/services/users.js');
    assert.ok(src.includes('safeReadJSON') && src.includes('from \'./database.js\''), 'users.js should import safeReadJSON');
  });

  it('P30-50: safeReadJSON is imported in sessions.js', async () => {
    const src = await readSource('server/services/sessions.js');
    assert.ok(src.includes('safeReadJSON') && src.includes('from \'./database.js\''), 'sessions.js should import safeReadJSON');
  });
});

// ═══════════════════════════════════════════════════════════════
// Expiry Warnings
// ═══════════════════════════════════════════════════════════════

describe('Phase 30 — Expiry Warnings', () => {
  it('P30-51: jobs.js exports checkExpiryWarnings', async () => {
    const mod = await import('../server/services/jobs.js');
    assert.equal(typeof mod.checkExpiryWarnings, 'function');
  });

  it('P30-52: checkExpiryWarnings finds jobs within 24h of expiry', async () => {
    const src = await readSource('server/services/jobs.js');
    assert.ok(src.includes('24 * 60 * 60 * 1000') || src.includes('warningWindowMs'), 'Should check 24-hour window');
  });

  it('P30-53: checkExpiryWarnings sets expiryWarningNotified flag', async () => {
    const src = await readSource('server/services/jobs.js');
    assert.ok(src.includes('expiryWarningNotified'), 'Should set expiryWarningNotified flag');
  });

  it('P30-54: checkExpiryWarnings emits job:expiry_warning event', async () => {
    const src = await readSource('server/services/jobs.js');
    assert.ok(src.includes("'job:expiry_warning'"), 'Should emit job:expiry_warning event');
  });

  it('P30-55: no duplicate warnings (expiryWarningNotified check)', async () => {
    const src = await readSource('server/services/jobs.js');
    const fnSrc = src.split('checkExpiryWarnings')[1] || '';
    assert.ok(fnSrc.includes('expiryWarningNotified'), 'Should check expiryWarningNotified to prevent duplicates');
  });

  it('P30-56: notifications.js has expiry_warning listener', async () => {
    const src = await readSource('server/services/notifications.js');
    assert.ok(src.includes("'job:expiry_warning'"), 'notifications.js should listen to job:expiry_warning');
  });

  it('P30-57: server.js calls checkExpiryWarnings in periodic cleanup', async () => {
    const src = await readSource('server.js');
    assert.ok(src.includes('checkExpiryWarnings'), 'server.js should call checkExpiryWarnings');
  });

  it('P30-58: only open jobs get warnings', async () => {
    const src = await readSource('server/services/jobs.js');
    const fnSrc = src.split('checkExpiryWarnings')[1] || '';
    assert.ok(fnSrc.includes("status !== 'open'") || fnSrc.includes("status === 'open'"), 'Should only warn for open jobs');
  });
});

// ═══════════════════════════════════════════════════════════════
// Version
// ═══════════════════════════════════════════════════════════════

describe('Phase 30 — Version', () => {
  it('P30-59: package.json version is 0.27.0', async () => {
    const pkg = JSON.parse(await readSource('package.json'));
    assert.equal(pkg.version, '0.34.0');
  });

  it('P30-60: config PWA cacheName is yawmia-v0.27.0', async () => {
    const config = (await import('../config.js')).default;
    assert.equal(config.PWA.cacheName, 'yawmia-v0.34.0');
  });

  it('P30-61: sw.js CACHE_NAME is yawmia-v0.27.0', async () => {
    const src = await readSource('frontend/sw.js');
    assert.ok(src.includes("'yawmia-v0.34.0'"), 'sw.js should use v0.27.0 cache name');
  });

  it('P30-62: config has 43 sections', async () => {
    const config = (await import('../config.js')).default;
    // Count top-level keys (sections)
    const keys = Object.keys(config);
    assert.equal(keys.length, 50, `Expected 43 config sections, got ${keys.length}: ${keys.join(', ')}`);
  });
});
