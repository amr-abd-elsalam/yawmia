// ═══════════════════════════════════════════════════════════════
// server/handlers/profileTasksHandler.js — Profile Tasks API (Phase 53)
// ═══════════════════════════════════════════════════════════════

import { getProfileTasks } from '../services/profileTasks.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * GET /api/profile/tasks
 * Requires: requireAuth
 */
export async function handleGetProfileTasks(req, res) {
  try {
    const result = await getProfileTasks(req.user.id);

    return sendJSON(res, 200, {
      ok: true,
      enabled: result.enabled !== false,
      completionScore: result.completionScore || 0,
      missing: result.missing || [],
      tasks: result.tasks || [],
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب مهام إكمال الملف الشخصي',
      code: 'PROFILE_TASKS_ERROR',
    });
  }
}
