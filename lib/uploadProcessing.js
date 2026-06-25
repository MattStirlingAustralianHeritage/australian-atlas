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

// Raster formats the Vercel sharp/libvips binary RELIABLY decodes. We deliberately
// exclude heif/avif: sharp.format reports input support for them on this binary,
// but the actual HEVC/AV1 decoders are absent, so a decode fails deep in
// processing (a confusing generic error) rather than at validation. Excluding
// them lets us reject HEIC/AVIF up front with a clear, actionable message (see
// below). The common iPhone case is already handled client-side — the browser
// converts HEIC→JPEG before upload — so this only affects HEIC that reaches the
// server raw (non-Safari). SVG is excluded too (stored-XSS vector). We still
// intersect with sharp.format as a guard.
const CANDIDATE_INPUT_FORMATS = ['jpeg', 'png', 'webp', 'gif', 'tiff']
const ALLOWED_INPUT_FORMATS = new Set(
  CANDIDATE_INPUT_FORMATS.filter((f) => sharp.format[f]?.input?.buffer)
)
// Formats we can identify but not decode here — used purely for a clearer message.
const UNDECODABLE_HINT_FORMATS = new Set(['heif', 'heic', 'avif'])

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
    const message = UNDECODABLE_HINT_FORMATS.has(format)
      ? 'iPhone/HEIC photos aren’t supported here yet — please upload a JPG, PNG or WebP. (On iPhone: Settings → Camera → Formats → “Most Compatible”, or save the photo as a JPG first.)'
      : 'That image format isn’t supported — please upload a JPG, PNG or WebP.'
    throw new ImageValidationError(message, 'UNSUPPORTED_FORMAT')
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
