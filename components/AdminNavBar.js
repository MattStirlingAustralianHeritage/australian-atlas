'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

const PAGE_TITLES = {
  'listings-review': 'Listings Review',
  listings: 'Listing Editor',
  candidates: 'Candidate Review',
  analytics: 'Analytics',
  claims: 'Claims',
  completeness: 'Completeness',
  duplicates: 'Duplicates',
  editorial: 'Editorial',
  events: 'Events',
  health: 'Pipeline Health',
  insights: 'Search Insights',
  staleness: 'Staleness',
  trails: 'Trails',
  articles: 'Articles',
  'audit-review': 'Data Audit',
  notes: 'Notes',
}

export default function AdminNavBar() {
  const pathname = usePathname()

  // Don't show on /admin dashboard or /admin/login
  if (pathname === '/admin' || pathname === '/admin/login') return null

  const segment = pathname.replace('/admin/', '').split('/')[0]
  const title = PAGE_TITLES[segment] || segment.charAt(0).toUpperCase() + segment.slice(1)

  const [stats, setStats] = useState(null)
  const [session, setSession] = useState(null)

  // Fetch review stats on mount
  useEffect(() => {
    fetch('/api/admin/stats')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStats(d) })
      .catch(() => {})
  }, [])

  // Listen for real-time stats updates (dispatched by Listings Review)
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.stats) setStats(e.detail.stats)
      setSession(e.detail?.session ?? null)
    }
    window.addEventListener('admin-stats-update', handler)
    return () => window.removeEventListener('admin-stats-update', handler)
  }, [])

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '7px 24px',
      background: 'var(--color-cream, #FAF9F6)',
      borderBottom: '1px solid var(--color-border, #e5e5e5)',
      fontFamily: 'var(--font-body, system-ui)',
      fontSize: 12,
      position: 'sticky',
      top: 0,
      zIndex: 90,
    }}>
      <Link href="/admin" style={{
        color: 'var(--color-muted, #888)',
        textDecoration: 'none',
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}>
        &larr; Admin
      </Link>

      <span style={{
        color: 'var(--color-ink, #2D2A26)',
        fontWeight: 600,
        letterSpacing: '0.02em',
        fontSize: 11,
        textTransform: 'uppercase',
      }}>
        {title}
      </span>

      <span style={{
        color: 'var(--color-muted, #888)',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        minWidth: 100,
        textAlign: 'right',
      }}>
        {stats ? (
          <>
            <span style={{ color: 'var(--color-sage, #7A8B6F)', marginRight: 3 }}>&#10022;</span>
            {stats.humanised_count.toLocaleString()} / {stats.total_active_count.toLocaleString()} reviewed
            {session?.reviewed > 0 && (
              <span> &middot; {session.reviewed} this session</span>
            )}
            {session?.skipped > 0 && (
              <span> &middot; {session.skipped} skipped</span>
            )}
          </>
        ) : ''}
      </span>
    </div>
  )
}
