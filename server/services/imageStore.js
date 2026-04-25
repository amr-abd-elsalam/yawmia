// ═══════════════════════════════════════════════════════════════
// server/services/imageStore.js — Content-Addressed Binary Image Store
// ═══════════════════════════════════════════════════════════════
// Stores images as binary files with SHA-256 hash filenames.
// Hash-prefix bucketing (2-char) prevents large flat directories.
// Metadata stored alongside binary in {hash}.meta.json.
// Deduplication: same image → same hash → one file on disk.
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import { writeFile, readFile, unlink, mkdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import config from '../../config.js';
import { logger } from './logger.js';

const IMAGE_BASE = process.env.YAWMIA_DATA_PATH
  ? join(process.env.YAWMIA_DATA_PATH, 'images')
  : (config.IMAGE_STORAGE ? config.IMAGE_STORAGE.basePath : './data/images');

/**
 * Parse a base64 data URI into buffer + content type
 * @param {string} dataUri — e.g. 'data:image/jpeg;base64,/9j/4AAQ...'
 * @returns {{ buffer: Buffer, contentType: string } | null}
 */
function parseDataUri(dataUri) {
  if (!dataUri || typeof dataUri !== 'string') return null;

  // Handle both data URI and raw base64
  let contentType = 'image/jpeg'; // default
  let base64Data = dataUri;

  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/s);
  if (match) {
    contentType = match[1];
    base64Data = match[2];
  }

  try {
    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length === 0) return null;
    return { buffer, contentType };
  } catch {
    return null;
  }
}

/**
 * Get file extension from content type
 * @param {string} contentType
 * @returns {string}
 */
function getExtension(contentType) {
  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  return map[contentType] || 'bin';
}

/**
 * Get bucket directory and file paths for a hash
 * @param {string} hash — full SHA-256 hex string
 * @param {string} ext — file extension
 * @returns {{ bucketDir: string, binaryPath: string, metaPath: string }}
 */
function getImagePaths(hash, ext) {
  const prefixLen = (config.IMAGE_STORAGE && config.IMAGE_STORAGE.bucketPrefixLength) || 2;
  const bucket = hash.substring(0, prefixLen);
  const bucketDir = join(IMAGE_BASE, bucket);
  return {
    bucketDir,
    binaryPath: join(bucketDir, `${hash}.${ext}`),
    metaPath: join(bucketDir, `${hash}.meta.json`),
  };
}

/**
 * Store an image from a base64 data URI
 * Content-addressed: SHA-256 hash → filename. Duplicate = no-op (returns existing ref).
 *
 * @param {string} base64DataUri — base64 data URI string
 * @param {{ uploadedBy?: string, purpose?: string }} metadata — optional metadata
 * @returns {Promise<{ ok: boolean, imageRef?: string, hash?: string, contentType?: string, sizeBytes?: number, error?: string, code?: string }>}
 */
export async function storeImage(base64DataUri, metadata = {}) {
  // Feature flag
  if (!config.IMAGE_STORAGE || !config.IMAGE_STORAGE.enabled) {
    return { ok: false, error: 'خدمة تخزين الصور غير مفعّلة', code: 'IMAGE_STORAGE_DISABLED' };
  }

  // Parse data URI
  const parsed = parseDataUri(base64DataUri);
  if (!parsed) {
    return { ok: false, error: 'بيانات الصورة غير صالحة', code: 'INVALID_IMAGE_DATA' };
  }

  const { buffer, contentType } = parsed;

  // Type validation
  const allowedTypes = config.IMAGE_STORAGE.allowedTypes || ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(contentType)) {
    return { ok: false, error: 'نوع الصورة غير مسموح', code: 'INVALID_IMAGE_TYPE' };
  }

  // Size validation
  const maxSize = config.IMAGE_STORAGE.maxSizeBytes || (2 * 1024 * 1024);
  if (buffer.length > maxSize) {
    return { ok: false, error: 'حجم الصورة أكبر من الحد المسموح', code: 'IMAGE_TOO_LARGE' };
  }

  // Compute SHA-256 hash
  const algorithm = config.IMAGE_STORAGE.hashAlgorithm || 'sha256';
  const hash = crypto.createHash(algorithm).update(buffer).digest('hex');
  const ext = getExtension(contentType);
  const imageRef = 'img_' + hash.substring(0, 8);

  const { bucketDir, binaryPath, metaPath } = getImagePaths(hash, ext);

  // Check if already exists (deduplication)
  try {
    await stat(binaryPath);
    // File exists — return existing ref (no duplicate write)
    return { ok: true, imageRef, hash, contentType, sizeBytes: buffer.length };
  } catch {
    // File doesn't exist — proceed with write
  }

  // Write binary file
  await mkdir(bucketDir, { recursive: true });
  await writeFile(binaryPath, buffer);

  // Write metadata file
  const meta = {
    ref: imageRef,
    hash,
    contentType,
    sizeBytes: buffer.length,
    uploadedBy: metadata.uploadedBy || null,
    uploadedAt: new Date().toISOString(),
    purpose: metadata.purpose || null,
  };
  await writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

  logger.info('Image stored', { imageRef, hash: hash.substring(0, 16), contentType, sizeBytes: buffer.length });

  return { ok: true, imageRef, hash, contentType, sizeBytes: buffer.length };
}

/**
 * Get an image by reference
 * @param {string} imageRef — e.g. 'img_a1b2c3d4'
 * @returns {Promise<{ ok: boolean, buffer?: Buffer, contentType?: string, metadata?: object, error?: string } | null>}
 */
export async function getImage(imageRef) {
  if (!imageRef || typeof imageRef !== 'string' || !imageRef.startsWith('img_')) {
    return null;
  }

  const hashPrefix = imageRef.substring(4); // Remove 'img_' prefix
  const prefixLen = (config.IMAGE_STORAGE && config.IMAGE_STORAGE.bucketPrefixLength) || 2;
  const bucket = hashPrefix.substring(0, prefixLen);
  const bucketDir = join(IMAGE_BASE, bucket);

  // Find file matching hash prefix in bucket
  try {
    const { readdir: readdirFs } = await import('node:fs/promises');
    const files = await readdirFs(bucketDir);
    const metaFile = files.find(f => f.startsWith(hashPrefix) && f.endsWith('.meta.json'));
    if (!metaFile) return null;

    const metaPath = join(bucketDir, metaFile);
    const metaRaw = await readFile(metaPath, 'utf-8');
    const meta = JSON.parse(metaRaw);

    const ext = getExtension(meta.contentType);
    const binaryPath = join(bucketDir, `${meta.hash}.${ext}`);
    const buffer = await readFile(binaryPath);

    return { ok: true, buffer, contentType: meta.contentType, metadata: meta };
  } catch {
    return null;
  }
}

/**
 * Delete an image by reference
 * @param {string} imageRef
 * @returns {Promise<boolean>}
 */
export async function deleteImage(imageRef) {
  if (!imageRef || !imageRef.startsWith('img_')) return false;

  const result = await getImage(imageRef);
  if (!result || !result.ok) return false;

  const hash = result.metadata.hash;
  const ext = getExtension(result.metadata.contentType);
  const { binaryPath, metaPath } = getImagePaths(hash, ext);

  try { await unlink(binaryPath); } catch { /* non-fatal */ }
  try { await unlink(metaPath); } catch { /* non-fatal */ }

  return true;
}

/**
 * Check if an image exists
 * @param {string} imageRef
 * @returns {Promise<boolean>}
 */
export async function imageExists(imageRef) {
  const result = await getImage(imageRef);
  return !!(result && result.ok);
}
