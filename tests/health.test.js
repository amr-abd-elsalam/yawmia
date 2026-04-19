// tests/health.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 1 — Basic Health & Config Tests
// ═══════════════════════════════════════════════════════════════

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import config from '../config.js';

describe('Config — Basic Structure', () => {

  it('T-01: config has BRAND section with required fields', () => {
    assert.ok(config.BRAND, 'BRAND section should exist');
    assert.strictEqual(typeof config.BRAND.name, 'string');
    assert.strictEqual(typeof config.BRAND.nameEn, 'string');
    assert.strictEqual(typeof config.BRAND.tagline, 'string');
    assert.strictEqual(typeof config.BRAND.primaryColor, 'string');
  });

  it('T-02: config has META section', () => {
    assert.ok(config.META, 'META section should exist');
    assert.strictEqual(config.META.lang, 'ar');
    assert.strictEqual(config.META.dir, 'rtl');
  });

  it('T-03: config has LABOR_CATEGORIES with at least 5 categories', () => {
    assert.ok(Array.isArray(config.LABOR_CATEGORIES));
    assert.ok(config.LABOR_CATEGORIES.length >= 5,
      `expected at least 5 categories, got ${config.LABOR_CATEGORIES.length}`);
  });

  it('T-04: each labor category has id, label, icon', () => {
    for (const cat of config.LABOR_CATEGORIES) {
      assert.strictEqual(typeof cat.id, 'string', `category should have string id`);
      assert.strictEqual(typeof cat.label, 'string', `category ${cat.id} should have label`);
      assert.strictEqual(typeof cat.icon, 'string', `category ${cat.id} should have icon`);
    }
  });

  it('T-05: config has REGIONS with governorates', () => {
    assert.ok(config.REGIONS, 'REGIONS should exist');
    assert.ok(Array.isArray(config.REGIONS.governorates));
    assert.ok(config.REGIONS.governorates.length >= 20,
      `expected at least 20 governorates, got ${config.REGIONS.governorates.length}`);
  });

  it('T-06: config has FINANCIALS with valid fee percentage', () => {
    assert.ok(config.FINANCIALS);
    assert.strictEqual(typeof config.FINANCIALS.platformFeePercent, 'number');
    assert.ok(config.FINANCIALS.platformFeePercent > 0 && config.FINANCIALS.platformFeePercent <= 30,
      `fee should be 1-30%, got ${config.FINANCIALS.platformFeePercent}`);
  });

  it('T-07: config has AUTH with roles', () => {
    assert.ok(config.AUTH);
    assert.ok(Array.isArray(config.AUTH.roles));
    assert.ok(config.AUTH.roles.includes('worker'));
    assert.ok(config.AUTH.roles.includes('employer'));
    assert.ok(config.AUTH.roles.includes('admin'));
  });

  it('T-08: config has JOBS with valid limits', () => {
    assert.ok(config.JOBS);
    assert.ok(config.JOBS.maxWorkersPerJob >= 1);
    assert.ok(config.JOBS.maxDistanceKm > 0);
  });

  it('T-09: config is frozen (immutable)', () => {
    assert.throws(() => {
      config.BRAND.name = 'hacked';
    }, TypeError, 'config should be frozen');
  });

  it('T-10: config has NOTIFICATIONS section', () => {
    assert.ok(config.NOTIFICATIONS);
    assert.strictEqual(config.NOTIFICATIONS.enabled, true);
    assert.ok(Array.isArray(config.NOTIFICATIONS.channels));
  });

  it('T-11: FINANCIALS has compensation settings', () => {
    assert.strictEqual(config.FINANCIALS.compensationEnabled, true);
    assert.ok(config.FINANCIALS.compensationDailyRate > 0);
    assert.ok(config.FINANCIALS.compensationDailyRate <= 1);
    assert.ok(config.FINANCIALS.maxCompensationDays > 0);
  });

  it('T-12: config has 31 sections', () => {
    const keys = Object.keys(config);
    assert.strictEqual(keys.length, 31, `expected 31 config sections, got ${keys.length}: ${keys.join(', ')}`);
  });

  it('T-13: config has DATABASE section', () => {
    assert.ok(config.DATABASE, 'DATABASE section should exist');
    assert.strictEqual(typeof config.DATABASE.basePath, 'string');
    assert.ok(config.DATABASE.dirs);
    assert.ok(config.DATABASE.dirs.users);
    assert.ok(config.DATABASE.dirs.sessions);
    assert.ok(config.DATABASE.dirs.jobs);
  });

  it('T-14: config has VALIDATION section', () => {
    assert.ok(config.VALIDATION, 'VALIDATION section should exist');
    assert.strictEqual(typeof config.VALIDATION.phoneRegex, 'string');
    assert.ok(config.VALIDATION.nameMinLength >= 1);
    assert.ok(config.VALIDATION.nameMaxLength >= 10);
  });

  it('T-15: config has RATE_LIMIT section', () => {
    assert.ok(config.RATE_LIMIT, 'RATE_LIMIT section should exist');
    assert.strictEqual(typeof config.RATE_LIMIT.enabled, 'boolean');
    assert.ok(config.RATE_LIMIT.windowMs > 0);
    assert.ok(config.RATE_LIMIT.maxRequests > 0);
  });

});
