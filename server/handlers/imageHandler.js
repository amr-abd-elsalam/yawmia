// ═══════════════════════════════════════════════════════════════
// server/handlers/imageHandler.js — Image Serving Endpoint
// ═══════════════════════════════════════════════════════════════

import { getImage } from '../services/imageStore.js';

/**
 * GET /api/images/:ref
 * Serves a stored image as binary with correct Content-Type
 * Requires: requireAuth
 */
export async function handleGetImage(req, res) {
  const imageRef = req.params.id; // router uses :id param

  if (!imageRef || !imageRef.startsWith('img_')) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'معرّف الصورة غير صالح', code: 'INVALID_IMAGE_REF' }));
    return;
  }

  try {
    const result = await getImage(imageRef);

    if (!result || !result.ok) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'الصورة غير موجودة', code: 'IMAGE_NOT_FOUND' }));
      return;
    }

    res.writeHead(200, {
      'Content-Type': result.contentType,
      'Content-Length': result.buffer.length,
      'Cache-Control': 'private, max-age=86400',
    });
    res.end(result.buffer);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'خطأ في جلب الصورة', code: 'IMAGE_ERROR' }));
  }
}
