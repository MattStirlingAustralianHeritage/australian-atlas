/**
 * Server-side image processing for user/operator uploads (sharp).
 *
 * Every uploaded image is run through this before it's stored. It:
 *   1. Validates by CONTENT (sharp decodes the bytes) — not the file extension,
 *      which is client-controlled and trivially spoofed. Non-images and SVG are
 *      rejected.
 *   2. Auto-orients from EXIF (`.rotate()`) so phone photos aren't sideways once
 *      metadata is dropped.
 *   3. Strips ALL metadata (sharp drops EXIF by default on re-encode) — removes
 *      operators' embedded GPS coordinates / device info, and neutralises any
 *      polyglot / embedded-payload tricks by fully re-encoding the pixels.
 *   4. Caps dimensions and re-encodes to a single canonical format (WebP).
 *
 * Used by both the direct-upload finalize route and the multipart fallback route
 * so the two paths produce identical, safe output.
 */

import crypto from 'node:crypto'
import sharp from 'sharp'

// Hard ceiling on the raw bytes we'll decode. The direct-upload path means this
// is no longer bounded by Vercel's request-body limit, so we set our own.
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024 // 25MB raw

// Formats sharp may decode FROM. SVG is deliberately excluded (stored-XSS vector)
// even though sharp can rasterise it.
const ALLOWED_INPUT_FORMATS = new Set(['jpeg', 'jpg', 'png', 'webp', 'gif', 'avif', 'tiff'])

const MAX_DIMENSION = 2400 // px on the longest edge
const WEBP_QUALITY = 82

export class ImageValidationError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'ImageValidationError'
    this.code = code || 'INVALID_IMAGE'
  }
}

/**
 * Validate + normalise an uploaded image buffer.
 * @param {Buffer} buffer raw uploaded bytes
 * @returns {Promise<{ buffer: Buffer, contentType: string, ext: string, width: number, height: number }>}
 * @throws {ImageValidationError} on oversized input, non-image bytes, or SVG.
 */
export async function processImage(buffer) {
  if (!buffer || !buffer.byteLength) {
    throw new ImageValidationError('Empty file.', 'EMPTY')
  }
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new ImageValidationError('Image is too large.', 'TOO_LARGE')
  }

  let meta
  try {
    meta = await sharp(buffer, { failOn: 'error' }).metadata()
  } catch {
    throw new ImageValidationError('That file is not a readable image.', 'NOT_AN_IMAGE')
  }

  const format = (meta.format || '').toLowerCase()
  if (!ALLOWED_INPUT_FORMATS.has(format)) {
    throw new ImageValidationError('That image format is not supported.', 'UNSUPPORTED_FORMAT')
  }

  let out
  try {
    out = await sharp(buffer, { failOn: 'error' })
      .rotate() // bake EXIF orientation into pixels before metadata is dropped
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true })
  } catch {
    throw new ImageValidationError('Could not process that image.', 'PROCESS_FAILED')
  }

  return {
    buffer: out.data,
    contentType: 'image/webp',
    ext: 'webp',
    width: out.info.width,
    height: out.info.height,
  }
}

/**
 * Content-addressed object name: identical processed bytes → identical key
 * (free dedup + perfect immutable caching). Returns just the basename.
 */
export function contentAddressedName(buffer, ext = 'webp') {
  const hash = crypto.createHash('sha256').update(buffer).digest('hex')
  return `${hash}.${ext}`
}
