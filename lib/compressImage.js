/**
 * Client-side image downscale + recompress for operator uploads.
 *
 * WHY: operator photo uploads (cover, gallery, event hero) POST the raw file to
 * /api/dashboard/listing/upload. Vercel's serverless functions reject any request
 * body over ~4.5MB *before the handler runs*, returning a plain-text 413. The
 * browser then fails to parse that as JSON and the operator sees only a generic
 * "Upload failed" — even though the upload route advertises an 8MB cap. Modern
 * phone photos are routinely 5–15MB, so a large share of real uploads failed.
 *
 * This shrinks images to a sane max dimension and re-encodes as JPEG under a byte
 * budget that sits comfortably below the platform limit. It is defensive: any
 * failure (decode error, unsupported type, already-small file) returns the
 * original File untouched, so we never make an upload worse than before.
 *
 * Browser-only — call from event handlers in client components.
 */

const MAX_DIMENSION = 2400 // px on the longest edge — plenty for hero/gallery display
const TARGET_BYTES = 3.5 * 1024 * 1024 // stay well under Vercel's ~4.5MB body limit
const MIN_QUALITY = 0.5
const START_QUALITY = 0.85

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    if (canvas.toBlob) {
      canvas.toBlob((b) => resolve(b), type, quality)
      return
    }
    // Safari < 14 / very old engines: fall back to toDataURL.
    try {
      const dataUrl = canvas.toDataURL(type, quality)
      const [head, b64] = dataUrl.split(',')
      const mime = (head.match(/:(.*?);/) || [])[1] || type
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      resolve(new Blob([bytes], { type: mime }))
    } catch {
      resolve(null)
    }
  })
}

async function decode(file) {
  // createImageBitmap is fast and honours EXIF orientation where supported.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Fall through to the <img> path (e.g. orientation option unsupported).
    }
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e) }
    img.src = url
  })
}

function renameToJpg(name) {
  const base = (name || 'photo').replace(/\.[^./\\]+$/, '')
  return `${base || 'photo'}.jpg`
}

/**
 * Returns a File ready to upload: the original if it's already small or can't be
 * processed, otherwise a downscaled JPEG comfortably under the body-size limit.
 */
export async function compressImage(file, opts = {}) {
  if (!file || typeof window === 'undefined') return file
  const type = file.type || ''
  // Only raster photos we can safely re-encode. GIFs (animation) and SVGs are
  // left alone; they're small and rarely operator uploads anyway.
  if (!type.startsWith('image/') || type === 'image/gif' || type === 'image/svg+xml') {
    return file
  }

  const maxDimension = opts.maxDimension || MAX_DIMENSION
  const targetBytes = opts.targetBytes || TARGET_BYTES

  let src
  try {
    src = await decode(file)
  } catch {
    return file // undecodable — let the server reject it with a real message
  }

  try {
    const srcW = src.width || src.naturalWidth
    const srcH = src.height || src.naturalHeight
    if (!srcW || !srcH) return file

    // Already small enough on both bytes and dimensions: upload as-is, no re-encode.
    if (file.size <= targetBytes && Math.max(srcW, srcH) <= maxDimension) return file

    const scale = Math.min(1, maxDimension / Math.max(srcW, srcH))
    const w = Math.max(1, Math.round(srcW * scale))
    const h = Math.max(1, Math.round(srcH * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    // White matte so transparency (PNG) doesn't turn black under JPEG.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(src, 0, 0, w, h)

    let quality = START_QUALITY
    let blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    while (blob && blob.size > targetBytes && quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, Math.round((quality - 0.1) * 100) / 100)
      blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    }

    if (!blob || blob.size >= file.size) return file // no win — keep original

    return new File([blob], renameToJpg(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified || undefined,
    })
  } catch {
    return file
  } finally {
    if (src && typeof src.close === 'function') src.close() // release ImageBitmap
  }
}
