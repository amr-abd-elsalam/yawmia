// ═══════════════════════════════════════════════════════════════
// server/services/favorites.js — Employer Favorite Workers System
// ═══════════════════════════════════════════════════════════════
// CRUD for employer → worker favorites with secondary index.
// Enriched with worker public profile on list.
// Employer-only feature (enforced at handler level).
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import {
  atomicWrite, readJSON, deleteJSON, getRecordPath,
  getCollectionPath, listJSON,
  addToSetIndex, getFromSetIndex, removeFromSetIndex,
} from './database.js';
import { logger } from './logger.js';

const USER_FAVORITES_INDEX = config.DATABASE.indexFiles.userFavoritesIndex;

/**
 * Generate favorite record ID
 */
function generateId() {
  return 'fav_' + crypto.randomBytes(6).toString('hex');
}

/**
 * Add a worker to employer's favorites
 * @param {string} userId — employer ID
 * @param {string} favoriteUserId — worker ID to favorite
 * @param {string} [note] — optional note
 * @returns {Promise<{ ok: boolean, favorite?: object, error?: string, code?: string }>}
 */
export async function addFavorite(userId, favoriteUserId, note) {
  // 1. Feature flag
  if (!config.FAVORITES || !config.FAVORITES.enabled) {
    return { ok: false, error: 'خدمة المفضّلة غير مفعّلة', code: 'FAVORITES_DISABLED' };
  }

  // 2. Validate favoriteUserId
  if (!favoriteUserId || typeof favoriteUserId !== 'string') {
    return { ok: false, error: 'معرّف المستخدم المطلوب مطلوب', code: 'FAVORITE_USER_REQUIRED' };
  }

  // 3. Cannot favorite self
  if (userId === favoriteUserId) {
    return { ok: false, error: 'لا يمكنك إضافة نفسك للمفضّلة', code: 'CANNOT_FAVORITE_SELF' };
  }

  // 4. Target user exists
  const { findById } = await import('./users.js');
  const targetUser = await findById(favoriteUserId);
  if (!targetUser) {
    return { ok: false, error: 'المستخدم غير موجود', code: 'USER_NOT_FOUND' };
  }

  // 5. Check duplicate
  const existingIds = await getFromSetIndex(USER_FAVORITES_INDEX, userId);
  for (const favId of existingIds) {
    const existing = await readJSON(getRecordPath('favorites', favId));
    if (existing && existing.favoriteUserId === favoriteUserId) {
      return { ok: false, error: 'هذا المستخدم موجود في المفضّلة بالفعل', code: 'ALREADY_FAVORITE' };
    }
  }

  // 6. Max limit
  if (existingIds.length >= config.FAVORITES.maxPerUser) {
    return { ok: false, error: `وصلت للحد الأقصى (${config.FAVORITES.maxPerUser} مفضّلة)`, code: 'MAX_FAVORITES_REACHED' };
  }

  // 7. Create record
  const id = generateId();
  const now = new Date().toISOString();

  const favorite = {
    id,
    userId,
    favoriteUserId,
    note: (note && typeof note === 'string') ? note.trim().substring(0, 200) : null,
    createdAt: now,
  };

  const favPath = getRecordPath('favorites', id);
  await atomicWrite(favPath, favorite);

  // Update index
  await addToSetIndex(USER_FAVORITES_INDEX, userId, id);

  logger.info('Favorite added', { favoriteId: id, userId, favoriteUserId });

  return { ok: true, favorite };
}

/**
 * Remove a favorite
 * @param {string} favoriteId
 * @param {string} userId — ownership check
 * @returns {Promise<{ ok: boolean, error?: string, code?: string }>}
 */
export async function removeFavorite(favoriteId, userId) {
  const favPath = getRecordPath('favorites', favoriteId);
  const favorite = await readJSON(favPath);

  if (!favorite) {
    return { ok: false, error: 'المفضّلة غير موجودة', code: 'FAVORITE_NOT_FOUND' };
  }

  if (favorite.userId !== userId) {
    return { ok: false, error: 'مش مسموحلك تحذف هذه المفضّلة', code: 'NOT_FAVORITE_OWNER' };
  }

  await deleteJSON(favPath);
  await removeFromSetIndex(USER_FAVORITES_INDEX, userId, favoriteId);

  logger.info('Favorite removed', { favoriteId, userId });

  return { ok: true };
}

/**
 * List favorites for a user (enriched with target user profile)
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function listFavorites(userId) {
  const indexedIds = await getFromSetIndex(USER_FAVORITES_INDEX, userId);

  let favorites = [];

  if (indexedIds.length > 0) {
    for (const favId of indexedIds) {
      const fav = await readJSON(getRecordPath('favorites', favId));
      if (fav) favorites.push(fav);
    }
  } else {
    // Fallback: full scan
    const favsDir = getCollectionPath('favorites');
    const all = await listJSON(favsDir);
    favorites = all.filter(f => f.id && f.id.startsWith('fav_') && f.userId === userId);
  }

  // Sort newest first
  favorites.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Enrich with target user public profile
  const { findById } = await import('./users.js');
  const enriched = [];

  for (const fav of favorites) {
    let targetProfile = null;
    try {
      const user = await findById(fav.favoriteUserId);
      if (user) {
        targetProfile = {
          id: user.id,
          name: user.name || 'بدون اسم',
          governorate: user.governorate || '',
          categories: user.categories || [],
          rating: user.rating || { avg: 0, count: 0 },
          verificationStatus: user.verificationStatus || 'unverified',
        };
      }
    } catch (_) {
      // Non-blocking — missing user → null profile
    }

    enriched.push({
      ...fav,
      targetProfile: targetProfile || {
        id: fav.favoriteUserId,
        name: 'مستخدم محذوف',
        governorate: '',
        categories: [],
        rating: { avg: 0, count: 0 },
        verificationStatus: 'unverified',
      },
    });
  }

  return enriched;
}

/**
 * Check if a user is in the employer's favorites
 * @param {string} userId — employer ID
 * @param {string} favoriteUserId — target user ID
 * @returns {Promise<boolean>}
 */
export async function isFavorite(userId, favoriteUserId) {
  const indexedIds = await getFromSetIndex(USER_FAVORITES_INDEX, userId);

  for (const favId of indexedIds) {
    const fav = await readJSON(getRecordPath('favorites', favId));
    if (fav && fav.favoriteUserId === favoriteUserId) return true;
  }

  return false;
}
