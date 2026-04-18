// ═══════════════════════════════════════════════════════════════
// server/services/geo.js — Geolocation Utilities
// Pure math — no external APIs, no database access
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

const EARTH_RADIUS_KM = config.GEOLOCATION.earthRadiusKm;
const GOVERNORATE_CENTERS = config.GEOLOCATION.governorateCenters;

/**
 * Convert degrees to radians
 * @param {number} deg
 * @returns {number}
 */
function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Calculate great-circle distance between two lat/lng points using Haversine formula
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number} distance in km, rounded to 1 decimal place
 */
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = EARTH_RADIUS_KM * c;
  return Math.round(distance * 10) / 10;
}

/**
 * Check if lat/lng are valid numbers in general range
 * @param {*} lat
 * @param {*} lng
 * @returns {boolean}
 */
export function isValidCoordinate(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (isNaN(lat) || isNaN(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

/**
 * Resolve coordinates from explicit lat/lng or governorate center fallback
 * @param {{ lat?: number, lng?: number, governorate?: string }} location
 * @returns {{ lat: number, lng: number } | null}
 */
export function resolveCoordinates(location) {
  if (!location) return null;

  // Try explicit lat/lng first
  if (typeof location.lat === 'number' && typeof location.lng === 'number' &&
      !isNaN(location.lat) && !isNaN(location.lng)) {
    return { lat: location.lat, lng: location.lng };
  }

  // Fallback to governorate center
  if (location.governorate && GOVERNORATE_CENTERS[location.governorate]) {
    const center = GOVERNORATE_CENTERS[location.governorate];
    return { lat: center.lat, lng: center.lng };
  }

  return null;
}

/**
 * Filter and sort items by proximity to a reference point
 * Each item should have { lat?, lng?, governorate? } fields
 * @param {Array} items - array of objects with location data
 * @param {number} refLat - reference latitude
 * @param {number} refLng - reference longitude
 * @param {number} radiusKm - maximum distance in km
 * @returns {Array<{ item: object, distance: number }>} sorted by distance (nearest first)
 */
export function filterByProximity(items, refLat, refLng, radiusKm) {
  const results = [];

  for (const item of items) {
    const coords = resolveCoordinates({
      lat: item.lat,
      lng: item.lng,
      governorate: item.governorate,
    });

    if (!coords) continue; // Skip items with no resolvable location

    const distance = haversineDistance(refLat, refLng, coords.lat, coords.lng);

    if (distance <= radiusKm) {
      results.push({ item, distance });
    }
  }

  // Sort by distance (nearest first)
  results.sort((a, b) => a.distance - b.distance);

  return results;
}

/**
 * Get Egypt timezone offset in milliseconds
 * Egypt abolished DST in 2014 — always UTC+2
 * @returns {number} 7200000 (2 hours in ms)
 */
export function getEgyptTimezoneOffsetMs() {
  return 2 * 60 * 60 * 1000; // 7200000
}

/**
 * Get today's midnight in Egypt timezone (UTC+2) as a UTC Date
 * Egypt abolished DST in 2014 — always UTC+2, no edge cases
 *
 * Example: if now is 2026-04-17 15:00 UTC → Egypt is 17:00
 *   → Egypt midnight was 2026-04-17 00:00 EGY = 2026-04-16 22:00 UTC
 *   → Returns Date('2026-04-16T22:00:00.000Z')
 *
 * @returns {Date}
 */
export function getEgyptMidnight() {
  const now = new Date();
  const offsetMs = getEgyptTimezoneOffsetMs();

  // Get current time in Egypt
  const egyptTime = new Date(now.getTime() + offsetMs);

  // Get midnight in Egypt (set H/M/S/MS to 0 in Egypt time)
  const egyptMidnight = new Date(Date.UTC(
    egyptTime.getUTCFullYear(),
    egyptTime.getUTCMonth(),
    egyptTime.getUTCDate(),
    0, 0, 0, 0
  ));

  // Convert back to UTC by subtracting the offset
  return new Date(egyptMidnight.getTime() - offsetMs);
}
