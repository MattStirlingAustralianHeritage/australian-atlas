'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Drop-in pageview tracker. Place once in root layout.
 * Fires a single POST to /api/track on every navigation.
 * Generates a stable anonymous visitor ID (UUID in localStorage)
 * for unique visitor counting — no PII, no cookies.
 */
export default function PageTracker({ vertical = 'portal' }) {
  const pathname = usePathname()

  useEffect(() => {
    // Skip admin and vendor routes
    if (pathname.startsWith('/admin') || pathname.startsWith('/vendor')) return

    const device = /Mobi|Android/i.test(navigator.userAgent) ? 'mobile'
      : /Tablet|iPad/i.test(navigator.userAgent) ? 'tablet'
      : 'desktop'

    // Stable anonymous visitor ID — persists across sessions, no PII
    let visitorId = null
    try {
      visitorId = localStorage.getItem('atlas_vid')
      if (!visitorId) {
        visitorId = crypto.randomUUID()
        localStorage.setItem('atlas_vid', visitorId)
      }
    } catch {
      // Private browsing or localStorage blocked — visitor_id will be null
    }

    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vertical,
        path: pathname,
        referrer: document.referrer || null,
        device,
        visitor_id: visitorId,
      }),
      keepalive: true,
    }).catch(() => {})
  }, [pathname, vertical])

  return null
}
