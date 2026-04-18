// tests/geo.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 10 — Geolocation Service Tests (~23 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineDistance,
  isValidCoordinate,
  resolveCoordinates,
  filterByProximity,
  getEgyptTimezoneOffsetMs,
  getEgyptMidnight,
} from '../server/services/geo.js';
import config from '../config.js';

// ── Haversine Distance ────────────────────────────────────────

describe('Haversine Distance', () => {

  it('GEO-01: Cairo to Giza is approximately 3-6 km', () => {
    // Cairo center: 30.0444, 31.2357
    // Giza center: 30.0131, 31.2089
    const distance = haversineDistance(30.0444, 31.2357, 30.0131, 31.2089);
    assert.ok(distance > 3 && distance < 6,
      `expected Cairo-Giza distance 3-6 km, got ${distance}`);
  });

  it('GEO-02: Cairo to Alexandria is approximately 170-200 km', () => {
    // Cairo: 30.0444, 31.2357
    // Alex: 31.2001, 29.9187
    const distance = haversineDistance(30.0444, 31.2357, 31.2001, 29.9187);
    assert.ok(distance > 170 && distance < 200,
      `expected Cairo-Alex distance 170-200 km, got ${distance}`);
  });

  it('GEO-03: Distance of same point is 0', () => {
    const distance = haversineDistance(30.0444, 31.2357, 30.0444, 31.2357);
    assert.strictEqual(distance, 0);
  });

  it('GEO-04: Large distance (Cairo to far south)', () => {
    // Cairo to Aswan (~830 km)
    const distance = haversineDistance(30.0444, 31.2357, 24.0889, 32.8998);
    assert.ok(distance > 600, `expected > 600 km, got ${distance}`);
  });

  it('GEO-05: Returns a number with at most 1 decimal', () => {
    const distance = haversineDistance(30.0444, 31.2357, 30.0131, 31.2089);
    assert.strictEqual(typeof distance, 'number');
    // Check it has at most 1 decimal place
    const str = String(distance);
    const parts = str.split('.');
    if (parts.length === 2) {
      assert.ok(parts[1].length <= 1, `expected at most 1 decimal, got ${str}`);
    }
  });

});

// ── isValidCoordinate ─────────────────────────────────────────

describe('isValidCoordinate', () => {

  it('GEO-06: Valid coordinates (30, 31) return true', () => {
    assert.strictEqual(isValidCoordinate(30, 31), true);
  });

  it('GEO-07: Non-numeric values return false', () => {
    assert.strictEqual(isValidCoordinate('abc', 31), false);
    assert.strictEqual(isValidCoordinate(30, 'xyz'), false);
  });

  it('GEO-08: Out-of-range latitude (91) returns false', () => {
    assert.strictEqual(isValidCoordinate(91, 31), false);
  });

  it('GEO-09: Out-of-range longitude (181) returns false', () => {
    assert.strictEqual(isValidCoordinate(30, 181), false);
  });

  it('GEO-10: NaN values return false', () => {
    assert.strictEqual(isValidCoordinate(NaN, 31), false);
    assert.strictEqual(isValidCoordinate(30, NaN), false);
  });

  it('GEO-11: Edge values (90, 180) return true', () => {
    assert.strictEqual(isValidCoordinate(90, 180), true);
    assert.strictEqual(isValidCoordinate(-90, -180), true);
  });

});

// ── resolveCoordinates ────────────────────────────────────────

describe('resolveCoordinates', () => {

  it('GEO-12: Explicit lat/lng are returned as-is', () => {
    const result = resolveCoordinates({ lat: 30.0, lng: 31.0 });
    assert.deepStrictEqual(result, { lat: 30.0, lng: 31.0 });
  });

  it('GEO-13: Governorate fallback returns center for cairo', () => {
    const result = resolveCoordinates({ governorate: 'cairo' });
    const center = config.GEOLOCATION.governorateCenters.cairo;
    assert.deepStrictEqual(result, { lat: center.lat, lng: center.lng });
  });

  it('GEO-14: Explicit lat/lng overrides governorate', () => {
    const result = resolveCoordinates({ lat: 29.0, lng: 30.0, governorate: 'cairo' });
    assert.deepStrictEqual(result, { lat: 29.0, lng: 30.0 });
  });

  it('GEO-15: Null input returns null', () => {
    assert.strictEqual(resolveCoordinates(null), null);
    assert.strictEqual(resolveCoordinates(undefined), null);
  });

  it('GEO-16: Unknown governorate with no lat/lng returns null', () => {
    const result = resolveCoordinates({ governorate: 'unknown_place' });
    assert.strictEqual(result, null);
  });

});

// ── filterByProximity ─────────────────────────────────────────

describe('filterByProximity', () => {

  it('GEO-17: Filters items within radius, excludes far items', () => {
    const items = [
      { id: 'near', lat: 30.05, lng: 31.24 },          // ~1 km from Cairo center
      { id: 'far', lat: 31.2001, lng: 29.9187 },        // Alexandria (~183 km)
    ];
    const results = filterByProximity(items, 30.0444, 31.2357, 30);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].item.id, 'near');
  });

  it('GEO-18: Results sorted by distance (nearest first)', () => {
    const items = [
      { id: 'medium', lat: 30.1, lng: 31.3 },           // ~9 km
      { id: 'near', lat: 30.05, lng: 31.24 },            // ~1 km
      { id: 'far-ish', lat: 30.2, lng: 31.4 },           // ~23 km
    ];
    const results = filterByProximity(items, 30.0444, 31.2357, 50);
    assert.strictEqual(results.length, 3);
    assert.ok(results[0].distance <= results[1].distance,
      `first (${results[0].distance}) should be <= second (${results[1].distance})`);
    assert.ok(results[1].distance <= results[2].distance,
      `second (${results[1].distance}) should be <= third (${results[2].distance})`);
  });

  it('GEO-19: Empty result when no items in range', () => {
    const items = [
      { id: 'far', lat: 31.2001, lng: 29.9187 },  // Alexandria
    ];
    const results = filterByProximity(items, 30.0444, 31.2357, 5); // 5 km radius
    assert.strictEqual(results.length, 0);
  });

  it('GEO-20: Items with governorate fallback are resolved and filtered', () => {
    const items = [
      { id: 'gov-only', governorate: 'giza' },    // Giza center ~4.3 km from Cairo
      { id: 'no-loc' },                            // No location at all
    ];
    const results = filterByProximity(items, 30.0444, 31.2357, 10);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].item.id, 'gov-only');
  });

});

// ── Egypt Timezone ────────────────────────────────────────────

describe('Egypt Timezone', () => {

  it('GEO-21: Egypt timezone offset is 2 hours (7200000 ms)', () => {
    assert.strictEqual(getEgyptTimezoneOffsetMs(), 7200000);
  });

  it('GEO-22: Egypt midnight is in the past or exactly now', () => {
    const midnight = getEgyptMidnight();
    const now = new Date();
    assert.ok(midnight <= now, 'midnight should be in the past or now');
  });

  it('GEO-23: Egypt midnight is within last 24 hours', () => {
    const midnight = getEgyptMidnight();
    const now = new Date();
    const diff = now.getTime() - midnight.getTime();
    assert.ok(diff >= 0 && diff < 24 * 60 * 60 * 1000,
      `midnight should be within last 24h, diff was ${diff}ms`);
  });

});
