// ═══════════════════════════════════════════════════════════════
// server/middleware/bodyParser.js — JSON Body Parser
// ═══════════════════════════════════════════════════════════════

const MAX_BODY_SIZE = 1024 * 100; // 100KB

export function bodyParserMiddleware(req, res, next) {
  const method = req.method;
  if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') {
    req.body = {};
    return next();
  }

  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    req.body = {};
    return next();
  }

  let body = '';
  let size = 0;

  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY_SIZE) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'حجم الطلب كبير جداً', code: 'BODY_TOO_LARGE' }));
      req.destroy();
      return;
    }
    body += chunk;
  });

  req.on('end', () => {
    if (res.writableEnded) return;

    if (!body) {
      req.body = {};
      return next();
    }

    try {
      req.body = JSON.parse(body);
      next();
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'JSON غير صحيح', code: 'INVALID_JSON' }));
    }
  });

  req.on('error', (err) => {
    if (!res.writableEnded) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'خطأ في قراءة الطلب', code: 'READ_ERROR' }));
    }
  });
}
