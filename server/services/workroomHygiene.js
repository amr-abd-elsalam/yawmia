// ═══════════════════════════════════════════════════════════════
// server/services/workroomHygiene.js — Workroom Sidecar Hygiene (Phase 55)
// ═══════════════════════════════════════════════════════════════
// Inspects and compacts Workroom V2 sidecars:
//   - read receipts
//   - search indexes
//   - pins
//   - checklists
//   - attachments / imageStore orphan cleanup
//
// Conservative by design:
//   - no raw base64 is ever expected in messages
//   - attachments are deleted only if older than grace period and unreferenced
//   - sidecar compaction removes references to missing messages only
// ═══════════════════════════════════════════════════════════════

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import config from '../../config.js';
import {
  atomicWrite,
  readJSON,
  getRecordPath,
  getCollectionPath,
  listJSON,
  deleteJSON,
} from './database.js';
import { withLock } from './resourceLock.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';

const BASE_PATH = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;

let lastWorkroomHygieneStats = null;

function isEnabled() {
  return !!(config.WORKROOM_HYGIENE && config.WORKROOM_HYGIENE.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function parseMs(iso) {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

async function fileSizeBytes(filePath) {
  try {
    const s = await stat(filePath);
    return s.size;
  } catch (_) {
    return 0;
  }
}

function sidecarWarning(sizeBytes) {
  const kb = sizeBytes / 1024;
  const warning = config.WORKROOM_HYGIENE?.sidecarSizeWarningKB || 512;
  const critical = config.WORKROOM_HYGIENE?.sidecarSizeCriticalKB || 2048;

  if (kb >= critical) return 'critical';
  if (kb >= warning) return 'warning';
  return 'ok';
}

async function listMessagesForJob(jobId) {
  try {
    const dir = getCollectionPath('messages');
    const all = await listJSON(dir);
    return all.filter(m => m && m.id && m.id.startsWith('msg_') && m.jobId === jobId);
  } catch (_) {
    return [];
  }
}

async function listAllWorkroomJobIds() {
  const ids = new Set();

  try {
    const workrooms = await listJSON(getCollectionPath('workrooms'));
    for (const w of workrooms) {
      if (w && w.jobId) ids.add(w.jobId);
      else if (w && w.id && w.id.startsWith('job_')) ids.add(w.id);
    }
  } catch (_) {}

  try {
    const messages = await listJSON(getCollectionPath('messages'));
    for (const m of messages) {
      if (m && m.jobId && m.source === 'workroom') ids.add(m.jobId);
    }
  } catch (_) {}

  return Array.from(ids);
}

function collectMessageImageRefs(messages) {
  const refs = new Set();

  for (const msg of messages || []) {
    if (!msg || !Array.isArray(msg.attachments)) continue;

    for (const att of msg.attachments) {
      if (att && att.type === 'image' && att.imageRef) {
        refs.add(att.imageRef);
      }

      // Safety check: messages must not store raw base64.
      if (att && typeof att.dataUri === 'string') {
        refs.add('__RAW_BASE64_FOUND__');
      }
    }
  }

  return refs;
}

async function collectAllReferencedImageRefs() {
  const refs = new Set();

  // Workroom/message attachments.
  try {
    const messages = await listJSON(getCollectionPath('messages'));
    for (const ref of collectMessageImageRefs(messages)) {
      refs.add(ref);
    }
  } catch (_) {}

  // Verification image refs.
  try {
    const verifications = await listJSON(getCollectionPath('verifications'));
    for (const v of verifications) {
      if (v && v.nationalIdImageRef) refs.add(v.nationalIdImageRef);
      if (v && v.selfieImageRef) refs.add(v.selfieImageRef);
    }
  } catch (_) {}

  return refs;
}

/**
 * Inspect sidecar files for one workroom/job.
 *
 * @param {string} jobId
 */
export async function inspectWorkroomSidecars(jobId) {
  if (!isEnabled()) {
    return { enabled: false, jobId, warnings: [] };
  }

  if (!jobId || typeof jobId !== 'string') {
    return { enabled: true, jobId: null, warnings: [{ level: 'error', message: 'jobId required' }] };
  }

  const sidecars = [];
  const warnings = [];

  const sidecarDefs = [
    { kind: 'receipts', path: getRecordPath('workroom_receipts', jobId) },
    { kind: 'search_index', path: getRecordPath('workroom_search_indexes', jobId) },
    { kind: 'pins', path: getRecordPath('workroom_pins', jobId) },
    { kind: 'checklist', path: getRecordPath('workroom_checklists', jobId) },
  ];

  for (const def of sidecarDefs) {
    const size = await fileSizeBytes(def.path);
    const status = sidecarWarning(size);

    const item = {
      kind: def.kind,
      path: def.path.replace(BASE_PATH + '/', ''),
      exists: size > 0,
      sizeBytes: size,
      sizeKB: Math.round((size / 1024) * 10) / 10,
      status,
    };

    sidecars.push(item);

    if (status !== 'ok') {
      warnings.push({
        level: status,
        kind: def.kind,
        message: `${def.kind} sidecar is ${status}`,
        sizeKB: item.sizeKB,
      });
    }
  }

  const messages = await listMessagesForJob(jobId);
  const imageRefs = collectMessageImageRefs(messages);

  if (imageRefs.has('__RAW_BASE64_FOUND__')) {
    warnings.push({
      level: 'critical',
      kind: 'attachments',
      message: 'Raw base64 attachment data found in message JSON',
    });
    imageRefs.delete('__RAW_BASE64_FOUND__');
  }

  const result = {
    enabled: true,
    jobId,
    sidecars,
    messageCount: messages.length,
    attachmentRefs: imageRefs.size,
    warnings,
    inspectedAt: nowIso(),
  };

  eventBus.emit('workroom_hygiene:inspection_completed', {
    jobId,
    warningCount: warnings.length,
    timestamp: result.inspectedAt,
  });

  if (warnings.length > 0) {
    eventBus.emit('workroom_hygiene:warning_detected', {
      jobId,
      warnings: warnings.slice(0, 10),
      timestamp: result.inspectedAt,
    });
  }

  return result;
}

/**
 * Compact read receipts for one workroom:
 * - remove receipt entries for missing messages
 * - keep existing readBy shape for compatibility
 */
async function compactReceipts(jobId) {
  if (!config.WORKROOM_HYGIENE?.receiptCompactionEnabled) {
    return { skipped: true, reason: 'receipt_compaction_disabled', removed: 0 };
  }

  const filePath = getRecordPath('workroom_receipts', jobId);
  const receipts = await readJSON(filePath);
  if (!receipts || !receipts.messages) {
    return { skipped: false, removed: 0 };
  }

  const messages = await listMessagesForJob(jobId);
  const messageIds = new Set(messages.map(m => m.id));

  let removed = 0;

  for (const messageId of Object.keys(receipts.messages || {})) {
    if (!messageIds.has(messageId)) {
      delete receipts.messages[messageId];
      removed++;
    }
  }

  if (removed > 0) {
    receipts.updatedAt = nowIso();
    receipts.compactedAt = receipts.updatedAt;
    await atomicWrite(filePath, receipts);
  }

  return { removed };
}

/**
 * Compact pins sidecar:
 * - remove pins pointing to missing messages
 * - enforce max pinned messages
 */
async function compactPins(jobId) {
  const filePath = getRecordPath('workroom_pins', jobId);
  const pins = await readJSON(filePath);
  if (!pins) return { skipped: false, removed: 0 };

  const messages = await listMessagesForJob(jobId);
  const messageIds = new Set(messages.map(m => m.id));

  let list = Array.isArray(pins.pins) ? pins.pins : [];
  const before = list.length;

  list = list.filter(p => p && p.messageId && messageIds.has(p.messageId));

  const maxPins = config.WORKROOM_V2?.maxPinnedMessagesPerWorkroom || 5;
  list.sort((a, b) => new Date(b.pinnedAt || b.createdAt || 0) - new Date(a.pinnedAt || a.createdAt || 0));
  list = list.slice(0, maxPins);

  const removed = before - list.length;

  if (removed > 0) {
    pins.pins = list;
    pins.updatedAt = nowIso();
    pins.compactedAt = pins.updatedAt;
    await atomicWrite(filePath, pins);
  }

  return { removed };
}

/**
 * Compact checklist sidecar:
 * - enforce max items
 * - keep newest items first if oversized
 */
async function compactChecklist(jobId) {
  const filePath = getRecordPath('workroom_checklists', jobId);
  const checklist = await readJSON(filePath);
  if (!checklist) return { skipped: false, removed: 0 };

  let items = Array.isArray(checklist.items) ? checklist.items : [];
  const before = items.length;
  const maxItems = config.WORKROOM_V2?.maxChecklistItems || 30;

  items.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
  items = items.slice(0, maxItems);

  const removed = before - items.length;

  if (removed > 0) {
    checklist.items = items;
    checklist.updatedAt = nowIso();
    checklist.compactedAt = checklist.updatedAt;
    await atomicWrite(filePath, checklist);
  }

  return { removed };
}

/**
 * Compact one workroom sidecars.
 *
 * @param {string} jobId
 * @param {object} options
 */
export async function compactWorkroom(jobId, options = {}) {
  if (!isEnabled()) return { skipped: true, reason: 'disabled' };
  if (!jobId) return { ok: false, error: 'jobId required' };

  return withLock(`workroom-hygiene:${jobId}`, async () => {
    const before = await inspectWorkroomSidecars(jobId);

    const receipts = await compactReceipts(jobId);
    const pins = await compactPins(jobId);
    const checklist = await compactChecklist(jobId);

    const after = await inspectWorkroomSidecars(jobId);

    const result = {
      ok: true,
      jobId,
      before,
      after,
      receipts,
      pins,
      checklist,
      compactedAt: nowIso(),
    };

    eventBus.emit('workroom_hygiene:compaction_completed', {
      jobId,
      receiptsRemoved: receipts.removed || 0,
      pinsRemoved: pins.removed || 0,
      checklistRemoved: checklist.removed || 0,
      timestamp: result.compactedAt,
    });

    return result;
  });
}

/**
 * Compact all known workrooms.
 */
export async function compactAllWorkrooms(options = {}) {
  if (!isEnabled()) return { skipped: true, reason: 'disabled' };

  const started = Date.now();
  const jobIds = options.jobIds || await listAllWorkroomJobIds();

  let scanned = 0;
  let compacted = 0;
  let failed = 0;
  const failures = [];

  for (let i = 0; i < jobIds.length; i++) {
    const jobId = jobIds[i];
    scanned++;

    try {
      await compactWorkroom(jobId, options);
      compacted++;
    } catch (err) {
      failed++;
      failures.push({ jobId, error: err.message });
      logger.warn('workroomHygiene: compactWorkroom failed', { jobId, error: err.message });
    }

    if ((i + 1) % 50 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  const result = {
    ok: true,
    scanned,
    compacted,
    failed,
    failures: failures.slice(0, 20),
    durationMs: Date.now() - started,
    completedAt: nowIso(),
  };

  lastWorkroomHygieneStats = result;
  return result;
}

async function walkImageMetaFiles() {
  const base = process.env.YAWMIA_DATA_PATH
    ? join(process.env.YAWMIA_DATA_PATH, 'images')
    : (config.IMAGE_STORAGE ? config.IMAGE_STORAGE.basePath : './data/images');

  const results = [];

  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }

    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.meta.json')) {
        results.push(full);
      }
    }
  }

  await walk(base);
  return results;
}

/**
 * Cleanup orphan workroom attachments from imageStore.
 *
 * Conservative:
 * - only images with purpose='workroom_attachment'
 * - only if older than attachmentGraceHours
 * - only if imageRef is not referenced by messages/verifications
 */
export async function cleanupOrphanAttachments(options = {}) {
  if (!isEnabled()) return { skipped: true, reason: 'disabled' };

  if (!config.WORKROOM_HYGIENE?.attachmentOrphanCleanupEnabled) {
    return { skipped: true, reason: 'attachment_cleanup_disabled' };
  }

  const dryRun = !!options.dryRun;
  const graceHours = options.graceHours || config.WORKROOM_HYGIENE?.attachmentGraceHours || 24;
  const cutoffMs = Date.now() - graceHours * 60 * 60 * 1000;

  const refs = await collectAllReferencedImageRefs();
  const metaFiles = await walkImageMetaFiles();

  let scanned = 0;
  let orphanCandidates = 0;
  let deleted = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];

  const { deleteImage } = await import('./imageStore.js');

  for (let i = 0; i < metaFiles.length; i++) {
    const metaPath = metaFiles[i];
    scanned++;

    try {
      const meta = await readJSON(metaPath);
      if (!meta || !meta.ref) {
        skipped++;
        continue;
      }

      if (meta.purpose !== 'workroom_attachment') {
        skipped++;
        continue;
      }

      if (refs.has(meta.ref)) {
        skipped++;
        continue;
      }

      const uploadedMs = parseMs(meta.uploadedAt);
      if (!uploadedMs || uploadedMs > cutoffMs) {
        skipped++;
        continue;
      }

      orphanCandidates++;

      if (!dryRun) {
        const ok = await deleteImage(meta.ref);
        if (ok) deleted++;
      }
    } catch (err) {
      failed++;
      failures.push({ metaPath: metaPath.replace(BASE_PATH + '/', ''), error: err.message });
    }

    if ((i + 1) % 100 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  const result = {
    ok: true,
    scanned,
    orphanCandidates,
    deleted,
    skipped,
    failed,
    dryRun,
    graceHours,
    failures: failures.slice(0, 20),
    completedAt: nowIso(),
  };

  eventBus.emit('workroom_hygiene:attachment_cleanup_completed', {
    scanned,
    orphanCandidates,
    deleted,
    failed,
    timestamp: result.completedAt,
  });

  return result;
}

/**
 * Overview across workroom sidecars.
 */
export async function getWorkroomHygieneOverview(options = {}) {
  if (!isEnabled()) {
    return { enabled: false, warnings: [] };
  }

  const jobIds = (options.jobIds || await listAllWorkroomJobIds()).slice(0, options.limit || 200);

  let totalSidecarBytes = 0;
  let warningCount = 0;
  const warnings = [];
  const largestSidecars = [];

  for (let i = 0; i < jobIds.length; i++) {
    try {
      const inspection = await inspectWorkroomSidecars(jobIds[i]);

      for (const sidecar of inspection.sidecars || []) {
        totalSidecarBytes += sidecar.sizeBytes || 0;
        if ((sidecar.sizeBytes || 0) > 0) {
          largestSidecars.push({
            jobId: jobIds[i],
            kind: sidecar.kind,
            sizeBytes: sidecar.sizeBytes,
            sizeKB: sidecar.sizeKB,
            status: sidecar.status,
          });
        }
      }

      if (inspection.warnings && inspection.warnings.length > 0) {
        warningCount += inspection.warnings.length;
        for (const w of inspection.warnings.slice(0, 5)) {
          warnings.push({ jobId: jobIds[i], ...w });
        }
      }
    } catch (_) {}

    if ((i + 1) % 50 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  largestSidecars.sort((a, b) => b.sizeBytes - a.sizeBytes);

  return {
    enabled: true,
    inspectedWorkrooms: jobIds.length,
    totalSidecarBytes,
    totalSidecarKB: Math.round((totalSidecarBytes / 1024) * 10) / 10,
    warningCount,
    warnings: warnings.slice(0, 50),
    largestSidecars: largestSidecars.slice(0, 20),
    lastRun: lastWorkroomHygieneStats,
    generatedAt: nowIso(),
  };
}

export function getLastWorkroomHygieneStats() {
  return lastWorkroomHygieneStats;
}

export const _testHelpers = {
  isEnabled,
  parseMs,
  sidecarWarning,
  fileSizeBytes,
  listMessagesForJob,
  listAllWorkroomJobIds,
  collectMessageImageRefs,
  collectAllReferencedImageRefs,
  compactReceipts,
  compactPins,
  compactChecklist,
  walkImageMetaFiles,
};
