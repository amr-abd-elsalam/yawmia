// ═══════════════════════════════════════════════════════════════
// server/middleware/static.js — Static File Serving Middleware
// ═══════════════════════════════════════════════════════════════

import { readFile, stat } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import config from '../../config.js';

const STATIC_ROOT = resolve(config.STATIC.root);

/**
 * Static file serving middleware.
 * Serves files from frontend/ directory for non-API paths.
 * Falls through to next() for /api/* paths or when file is not found.
 */
export function staticMiddleware(req, res, next) {
  // Skip API routes — let them pass through to the API chain
  if (req.pathname.startsWith('/api/') || req.pathname === '/api') {
    return next();
  }

  serveStatic(req, res, next).catch(() => {
    next();
  });
}

async function serve404(res, next) {
  try {
    const notFoundPath = resolve(join(STATIC_ROOT, '404.html'));
    const content = await readFile(notFoundPath);
    res.writeHead(404, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': content.length,
    });
    res.end(content);
  } catch {
    next();
  }
}

async function serveStatic(req, res, next) {
  let urlPath = req.pathname;

  // Serve index file for root path
  if (urlPath === '/') {
    urlPath = '/' + config.STATIC.indexFile;
  }

  // Decode URI components
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(urlPath);
  } catch {
    return next();
  }

  // Resolve absolute path
  const filePath = resolve(join(STATIC_ROOT, decodedPath));

  // Directory traversal prevention — resolved path must start with STATIC_ROOT
  if (!filePath.startsWith(STATIC_ROOT)) {
    return next();
  }

  // Check if file exists
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return serve404(res, next);
    }
  } catch {
    return serve404(res, next);
  }

  // Determine Content-Type
  const ext = extname(filePath).toLowerCase();
  const contentType = config.STATIC.mimeTypes[ext] || 'application/octet-stream';

  // Read and serve file
  const content = await readFile(filePath);

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': content.length,
    'Cache-Control': `public, max-age=${config.STATIC.maxAge}`,
  });
  res.end(content);
}
