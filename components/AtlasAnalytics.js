'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const VERTICAL = 'portal'

/**
 * Drop-in analytics tracker for Atlas Network verticals.
 * Place in the root layout to automatically track pageviews.
 * Data is sent to the Australian Atlas analytics ingest endpoint.
 */
export default function AtlasAnalytics() {
  const pathname = usePathname()

  useEffect(() => {
    // Don't track in development
    if (process.env.NODE_ENV === 'development') return
    // Don't track admin/vendor pages
    if (pathname.startsWith('/admin') || pathname.startsWith('/vendor')) return

    const deviceType = /Mobi|Android/i.test(navigator.userAgent)
      ? 'mobile'
      : /Tablet|iPad/i.test(navigator.userAgent)
        ? 'tablet'
        : 'desktop'

    // Fire and forget — don't await, don't handle errors
    fetch(`/api/analytics/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vertical: VERTICAL,
        page_path: pathname,
        event_type: 'pageview',
        referrer: document.referrer || null,
        device_type: deviceType,
      }),
      keepalive: true,
    }).catch(() => {})
  }, [pathname])

  return null
}
