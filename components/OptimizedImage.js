'use client'

import { useState } from 'react'
import Image from 'next/image'

/**
 * Responsive, modern-format image for hero/cover slots.
 *
 * - Our own Supabase-hosted images go through next/image → AVIF/WebP + per-device
 *   resized variants (smaller payloads on mobile, better LCP).
 * - Approved EXTERNAL hosts (operator CDNs, Mapbox, etc.) pass straight through as
 *   a plain <img>, so we never have to allowlist every host in next.config and
 *   never risk a broken external hero.
 * - If the optimizer ever errors (e.g. quota), onError falls back to the original
 *   URL — the image degrades gracefully, it is never broken.
 *
 * Designed for a `position: relative` parent (uses next/image `fill`).
 */

function isOptimizable(src) {
  return typeof src === 'string' && /\/\/[^/]*\.supabase\.co\//.test(src)
}

export default function OptimizedImage({ src, alt = '', className, sizes = '100vw', priority = false }) {
  const [failed, setFailed] = useState(false)
  if (!src) return null

  if (failed || !isOptimizable(src)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={className} loading={priority ? 'eager' : 'lazy'} decoding="async" />
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      priority={priority}
      onError={() => setFailed(true)}
    />
  )
}
