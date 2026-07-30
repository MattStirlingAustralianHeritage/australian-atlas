'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Sectioned navigation for the admin console. Every /admin page gets this for
// free via app/admin/layout.js — the console stops being 40+ disconnected
// URLs. /admin/clusters is deliberately absent (migration 066 never applied;
// the page silently no-ops).
const SECTIONS = [
  {
    title: 'Listings',
    links: [
      ['/admin/listings', 'Listing editor'],
      ['/admin/activity', 'Operator activity'],
      ['/admin/candidates', 'Candidates'],
      ['/admin/listings-review', 'Listings review'],
      ['/admin/gate-review', 'Gate review'],
      ['/admin/duplicates', 'Duplicates'],
      ['/admin/staleness', 'Staleness'],
      ['/admin/completeness', 'Completeness'],
      ['/admin/dead-images', 'Dead images'],
      ['/admin/memories', 'Memories'],
    ],
  },
  {
    title: 'Commercial',
    links: [
      ['/admin/claims', 'Claims'],
      ['/admin/claim-remediation', 'Claim remediation'],
      ['/admin/access-doctor', 'Access doctor'],
      ['/admin/operators', 'Operators'],
      ['/admin/operator-descriptions', 'Operator descriptions'],
      ['/admin/councils', 'Councils'],
      ['/admin/press-applications', 'Press applications'],
      ['/admin/press', 'Press room'],
      ['/admin/press-outreach', 'Press outreach'],
      ['/admin/council-outreach', 'Council outreach'],
      ['/admin/trade-outreach', 'Trade outreach'],
      ['/admin/industry-outreach', 'Industry outreach'],
      ['/admin/trade-applications', 'Trade applications'],
      ['/admin/events', 'Events'],
      ['/admin/revenue', 'Revenue'],
    ],
  },
  {
    title: 'Content',
    links: [
      ['/admin/articles', 'Articles'],
      ['/admin/listing-pitches', 'Listing pitches'],
      ['/admin/trails', 'Trails'],
      ['/admin/editorial', 'Editorial queue'],
      ['/admin/pitches', 'Pitches'],
      ['/admin/interviews', 'Interviews'],
      ['/admin/social-queue', 'Social queue'],
      ['/admin/seo-content', 'SEO pages'],
      ['/admin/wikipedia-queue', 'Wikipedia'],
      ['/admin/heritage-crosslinks', 'Heritage links'],
    ],
  },
  {
    title: 'Quality',
    links: [
      ['/admin/voice-review', 'Voice review'],
      ['/admin/enrichment-review', 'Enrichment review'],
      ['/admin/enrichment-audit', 'Enrichment audit'],
      ['/admin/audit-review', 'Data audit'],
      ['/admin/quality-report', 'Quality report'],
      ['/admin/health', 'Pipeline health'],
      ['/admin/errors', 'Client errors'],
    ],
  },
  {
    title: 'Insight & ops',
    links: [
      ['/admin/analytics', 'Analytics'],
      ['/admin/insights', 'Search insights'],
      ['/admin/growth', 'Growth'],
      ['/admin/outreach', 'Outreach'],
      ['/admin/agents', 'Agents'],
      ['/admin/notes', 'Notes'],
    ],
  },
]

// The one link that carries an unseen counter, and where the browser remembers
// how far you'd read. Bump the key if the meaning of "seen" ever changes.
const ACTIVITY_HREF = '/admin/activity'
const SEEN_KEY = 'aa:admin:activity-seen-at'
const POLL_MS = 120000

export default function AdminSidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [unseen, setUnseen] = useState(0)

  // Close the mobile drawer on navigation.
  useEffect(() => { setOpen(false) }, [pathname])

  // Unseen-activity badge. "Seen" is a timestamp in localStorage, restamped
  // every time the console lands on the activity page itself — so the number is
  // "what's happened since you last looked", not a running total you can never
  // clear. Server clock, not the browser's: see the count route.
  const onActivity = pathname === ACTIVITY_HREF
  useEffect(() => {
    if (pathname === '/admin/login') return

    let cancelled = false

    async function poll() {
      // Don't spend a query on a background tab.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return

      let since = null
      try { since = window.localStorage.getItem(SEEN_KEY) } catch { /* private mode */ }

      try {
        const res = await fetch(
          `/api/admin/activity/count${since ? `?since=${encodeURIComponent(since)}` : ''}`,
          { cache: 'no-store', credentials: 'same-origin' },
        )
        if (!res.ok || cancelled) return
        const json = await res.json()
        if (cancelled) return

        if (onActivity) {
          // You're reading the feed right now — that IS the badge.
          if (json.now) { try { window.localStorage.setItem(SEEN_KEY, json.now) } catch { /* private mode */ } }
          setUnseen(0)
        } else {
          setUnseen(Number(json.count) || 0)
        }
      } catch {
        // The console works fine without a badge — never break the nav over it.
      }
    }

    poll()
    const timer = setInterval(poll, POLL_MS)
    document.addEventListener('visibilitychange', poll)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [pathname, onActivity])

  if (pathname === '/admin/login') return null

  const isActive = (href) => pathname === href || pathname.startsWith(href + '/')

  return (
    <>
      <button
        type="button"
        className="admin-sidebar-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 12h18M3 6h18M3 18h18" />
        </svg>
        Admin menu
      </button>

      <aside className={`admin-sidebar${open ? ' open' : ''}`} aria-label="Admin navigation">
        <Link href="/admin" className="admin-sidebar-brand">
          Australian Atlas
          <span>Console</span>
        </Link>

        <nav>
          <div className="admin-nav-section">
            <Link
              href="/admin"
              className="admin-nav-link"
              aria-current={pathname === '/admin' ? 'page' : undefined}
            >
              Dashboard
            </Link>
          </div>

          {SECTIONS.map(section => (
            <div key={section.title} className="admin-nav-section">
              <h5>{section.title}</h5>
              {section.links.map(([href, label]) => (
                <Link
                  key={href}
                  href={href}
                  className="admin-nav-link"
                  aria-current={isActive(href) ? 'page' : undefined}
                >
                  {label}
                  {href === ACTIVITY_HREF && unseen > 0 && (
                    <span
                      className="admin-nav-badge"
                      aria-label={`${unseen} new since you last looked`}
                    >
                      {unseen > 99 ? '99+' : unseen}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="admin-sidebar-foot">
          <a href="/" className="admin-nav-link">View site ↗</a>
          <a href="/admin/logout" className="admin-nav-link">Sign out</a>
        </div>
      </aside>
    </>
  )
}
