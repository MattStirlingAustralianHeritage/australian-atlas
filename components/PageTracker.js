'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Drop-in pageview tracker. Place once in root layout.
 * Fires a single POST to /api/track on every navigation.
 * No NODE_ENV gate — tracks in all environments for verification.
 * Remove the development guard comment below once verified working.
 */
export default function PageTracker({ vertical = 'portal' }) {
  const pathname = usePathname()

  useEffect(() => {
    // Skip admin and vendor routes
    if (pathname.startsWith('/admin') || pathname.startsWith('/vendor')) return

    const device = /Mobi|Android/i.test(navigator.userAgent) ? 'mobile'
      : /Tablet|iPad/i.test(navigator.userAgent) ? 'tablet'
      : 'desktop'

    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vertical,
        path: pathname,
        referrer: document.referrer || null,
        device,
      }),
      keepalive: true,
    }).catch(() => {})
  }, [pathname, vertical])

  return null
}
