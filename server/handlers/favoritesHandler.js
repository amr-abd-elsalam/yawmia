// ═══════════════════════════════════════════════════════════════
// server/handlers/favoritesHandler.js — Favorites API Handlers
// ═══════════════════════════════════════════════════════════════

import { addFavorite, removeFavorite, listFavorites, isFavorite } from '../services/favorites.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const ERROR_STATUS = {
  FAVORITES_DISABLED: 503,
  FAVORITE_USER_REQUIRED: 400,
  CANNOT_FAVORITE_SELF: 400,
  USER_NOT_FOUND: 404,
  ALREADY_FAVORITE: 409,
  MAX_FAVORITES_REACHED: 429,
  FAVORITE_NOT_FOUND: 404,
  NOT_FAVORITE_OWNER: 403,
};

function errorStatus(code) {
  return ERROR_STATUS[code] || 400;
}

/**
 * POST /api/favorites
 * Add a worker to favorites
 * Requires: requireAuth + requireRole('employer')
 */
export async function handleAddFavorite(req, res) {
  try {
    const body = req.body || {};
    const result = await addFavorite(req.user.id, body.favoriteUserId, body.note);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 201, { ok: true, favorite: result.favorite });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * DELETE /api/favorites/:id
 * Remove a favorite
 * Requires: requireAuth + requireRole('employer')
 */
export async function handleRemoveFavorite(req, res) {
  try {
    const favoriteId = req.params.id;
    const result = await removeFavorite(favoriteId, req.user.id);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 200, { ok: true });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/favorites
 * List favorites with enrichment
 * Requires: requireAuth + requireRole('employer')
 */
export async function handleListFavorites(req, res) {
  try {
    const favorites = await listFavorites(req.user.id);
    sendJSON(res, 200, { ok: true, favorites, count: favorites.length });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/favorites/check/:userId
 * Check if a user is favorited
 * Requires: requireAuth + requireRole('employer')
 */
export async function handleCheckFavorite(req, res) {
  try {
    const targetUserId = req.params.id;
    const result = await isFavorite(req.user.id, targetUserId);
    sendJSON(res, 200, { ok: true, isFavorite: result });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}
