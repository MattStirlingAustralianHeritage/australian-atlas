'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { getAuthSupabase } from '@/lib/supabase/auth-clients'
import { getVerticalFeatures } from '@/lib/vertical-features'
import { getVerticalBadge } from '@/lib/verticalUrl'
import { getDashboardToken } from '@/lib/dashboard-token'
import { FeatureGuideModal, hasGuide, loadSeen, persistSeen } from './FeatureGuide'
import './dashboard-shell.css'

const AuthContext = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within the dashboard layout')
  return ctx
}

/**
 * Nav, grouped so the rail reads as a short list of places rather than eleven
 * equal-weight links. `group` starts a new titled block; collapsed, those
 * titles are replaced by a hairline rule (see dashboard-shell.css).
 */
const NAV_ITEMS = [
  { label: 'Overview', href: '/dashboard', icon: 'home' },
  { label: 'My Listings', href: '/dashboard/listings', icon: 'list' },

  { group: 'Your listing' },
  { label: 'Your Description', href: '/dashboard/description', icon: 'doc' },
  { label: 'Listing Insights', href: '/dashboard/analytics', icon: 'chart' },
  { label: 'Producer Picks', href: '/dashboard/picks', icon: 'star', picksOnly: true },
  { label: 'Suggested Trail', href: '/dashboard/trail', icon: 'route' },

  { group: 'Reach' },
  { label: 'Editorial', href: '/dashboard/editorial', icon: 'pen' },
  { label: 'Embed Kit', href: '/dashboard/embed', icon: 'code' },
  { label: 'Travel Trade', href: '/dashboard/trade', icon: 'briefcase' },
  { label: 'Recommend a Listing', href: '/dashboard/recommend', icon: 'plus' },

  { group: 'Account' },
  { label: 'Subscription', href: '/dashboard/subscription', icon: 'card' },
]

const PICKS_VERTICALS = new Set(['sba', 'fine_grounds', 'rest'])

const PIN_KEY = 'aa-dash-rail-pinned'

function NavIcon({ type, size = 19 }) {
  const s = { width: size, height: size, strokeWidth: 1.5, stroke: 'currentColor', fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }
  switch (type) {
    case 'home':
      return <svg {...s} viewBox="0 0 24 24"><path d="M3 10.5L12 3l9 7.5" /><path d="M5 9.8V20a1 1 0 001 1h12a1 1 0 001-1V9.8" /><path d="M9.5 21v-6h5v6" /></svg>
    case 'list':
      return <svg {...s} viewBox="0 0 24 24"><path d="M9 5h11M9 12h11M9 19h11M5 5h.01M5 12h.01M5 19h.01" /></svg>
    case 'chart':
      return <svg {...s} viewBox="0 0 24 24"><path d="M4 20h16" /><path d="M6 20v-6M11 20V8M16 20v-9M21 20V5" /></svg>
    case 'star':
      return <svg {...s} viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.65l5.9-.85L12 3.5z" /></svg>
    case 'pen':
      return <svg {...s} viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5" /><path d="M17.6 3.6a2 2 0 012.8 2.8L11.8 15H9v-2.8l8.6-8.6z" /></svg>
    case 'route':
      return <svg {...s} viewBox="0 0 24 24"><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h6a4 4 0 004-4V9m-12 6V9a4 4 0 014-4h2" /></svg>
    case 'code':
      return <svg {...s} viewBox="0 0 24 24"><path d="M9 17l-5-5 5-5M15 7l5 5-5 5" /></svg>
    case 'briefcase':
      return <svg {...s} viewBox="0 0 24 24"><rect x="3" y="7.5" width="18" height="12.5" rx="2" /><path d="M9 7.5V6a2 2 0 012-2h2a2 2 0 012 2v1.5" /><path d="M3 13h18" /></svg>
    case 'plus':
      return <svg {...s} viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
    case 'doc':
      return <svg {...s} viewBox="0 0 24 24"><path d="M9 12h6m-6 4h6m2 4H7a2 2 0 01-2-2V6a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V18a2 2 0 01-2 2z" /></svg>
    case 'card':
      return <svg {...s} viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h2" /></svg>
    case 'logout':
      return <svg {...s} viewBox="0 0 24 24"><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h5a2 2 0 012 2v1" /></svg>
    case 'menu':
      return <svg {...s} viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
    case 'close':
      return <svg {...s} viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
    default:
      return null
  }
}

export default function DashboardLayout({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  // Rail state. `pinned` keeps it open permanently (the hamburger, remembered
  // across visits); `drawer` is the mobile off-canvas open/closed flag. On
  // desktop, hover/focus expansion is pure CSS — no React state, so moving the
  // pointer across the rail never re-renders the page beneath it.
  const [pinned, setPinned] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [vendorVerticals, setVendorVerticals] = useState({})
  // The operator's owned listings — the thing this whole dashboard is about.
  // Fetched once here (canonical listing_claims source via /api/dashboard) and
  // shared with every page through context, so the sidebar, My Listings, and any
  // other surface all speak about the same listing instead of diverging.
  const [listings, setListings] = useState([])
  const [listingsLoading, setListingsLoading] = useState(true)
  // Identity from the shared JWT (role, verticals) — decoded once here so pages
  // don't each re-fetch and re-parse the token.
  const [dashUser, setDashUser] = useState(null)
  // Per-listing live stats ({ [listingId]: stats }) — fetched once for the whole
  // dashboard session and shared, instead of every page re-requesting them.
  const [stats, setStats] = useState({})
  const [statsLoading, setStatsLoading] = useState(true)
  const [listingsError, setListingsError] = useState(null)
  // Feature-guide state: which dashboard tools this operator has already opened
  // (so their "!" badges are cleared), whether we've read that from storage yet
  // (avoids a flash of every badge before localStorage loads), and the guide
  // currently being walked through.
  const [seen, setSeen] = useState(() => new Set())
  const [seenLoaded, setSeenLoaded] = useState(false)
  const [activeGuide, setActiveGuide] = useState(null)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = getAuthSupabase()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setLoading(false)
    })

    getDashboardToken().then(token => {
      if (!token) { setListingsLoading(false); setStatsLoading(false); return }
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        setVendorVerticals(payload.verticals || {})
        setDashUser({
          id: payload.sub,
          email: payload.email,
          name: payload.name,
          role: payload.role,
          verticals: payload.verticals || {},
        })
      } catch { /* silent */ }

      fetch('/api/dashboard', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => (r.ok ? r.json() : Promise.reject(new Error('dashboard fetch failed'))))
        .then(data => {
          if (data?.error) throw new Error(data.error)
          setListings(data?.listings || [])
        })
        .catch((err) => {
          setListingsError(err?.message || 'Failed to load your listings')
        })
        .finally(() => setListingsLoading(false))

      // Stats for every owned listing in ONE request, fired in parallel with
      // the listings fetch (the server derives ownership itself). Replaces the
      // old per-listing fan-out — one request per listing, each rescanning the
      // pageviews table — that made an admin dashboard load fire ~30 requests.
      fetch('/api/dashboard/stats/batch', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (data?.stats) setStats(data.stats)
        })
        .catch(() => { /* cards render with placeholders when stats fail */ })
        .finally(() => setStatsLoading(false))
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Restore the pinned preference after mount (never during render — the server
  // has no localStorage, and reading it inline would hydrate-mismatch).
  useEffect(() => {
    try {
      if (window.localStorage.getItem(PIN_KEY) === '1') setPinned(true)
    } catch { /* private mode — default to the collapsed rail */ }
  }, [])

  function togglePinned() {
    setPinned(prev => {
      const next = !prev
      try { window.localStorage.setItem(PIN_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  // Load this operator's "already opened" set once we know who they are.
  useEffect(() => {
    if (!user) return
    setSeen(loadSeen(user.id))
    setSeenLoaded(true)
  }, [user?.id])

  // Close the mobile drawer whenever navigation lands somewhere new.
  useEffect(() => { setDrawer(false) }, [pathname])

  // First-click walkthrough: the moment the operator lands on a tool's page they
  // haven't opened before, surface its guide. Works no matter how they arrived
  // (sidebar, a button on Overview, a direct link). Closing it marks the tool
  // seen, so it never re-opens and its badge clears.
  useEffect(() => {
    if (!seenLoaded || activeGuide) return
    if (hasGuide(pathname) && !seen.has(pathname)) setActiveGuide(pathname)
  }, [pathname, seenLoaded, seen, activeGuide])

  function handleGuideClose() {
    if (activeGuide) {
      setSeen(prev => {
        const next = new Set(prev)
        next.add(activeGuide)
        persistSeen(user?.id, next)
        return next
      })
    }
    setActiveGuide(null)
  }

  // The amber dot only ever marks a tool the operator hasn't opened. The
  // Overview itself is where they land, so it's never badged (its welcome guide
  // auto-opens on the first visit instead).
  function showBadge(href) {
    return seenLoaded && href !== '/dashboard' && hasGuide(href) && !seen.has(href)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  function isActive(href) {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-cream)' }}>
        <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>Loading…</p>
      </div>
    )
  }

  const activeVerts = Object.entries(vendorVerticals).filter(([, v]) => v).map(([k]) => k)
  const venue = listings[0]

  const navItems = NAV_ITEMS.filter(item => {
    if (!item.picksOnly) return true
    return activeVerts.some(v => PICKS_VERTICALS.has(v)) || activeVerts.length === 0
  })

  return (
    <AuthContext.Provider value={{ user, supabase, listings, listingsLoading, listingsError, dashUser, stats, statsLoading }}>
      <div className="aa-shell" data-pinned={pinned ? 'true' : 'false'} data-drawer={drawer ? 'true' : 'false'}>

        {/* Mobile: tapping outside the drawer closes it. */}
        <div className="aa-rail-scrim" onClick={() => setDrawer(false)} aria-hidden="true" />

        {/* Mobile: the button that opens the drawer. Hidden on desktop, where
            the rail is always visible as a 72px strip. */}
        <button
          type="button"
          className="md:hidden"
          onClick={() => setDrawer(true)}
          aria-label="Open dashboard menu"
          style={{
            position: 'fixed', top: '1rem', left: '1rem', zIndex: 50,
            width: 42, height: 42, borderRadius: 10,
            background: 'var(--color-ink)', border: 'none', color: '#fff',
            display: drawer ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
          }}
        >
          <NavIcon type="menu" size={20} />
        </button>

        {/* ── The rail ── */}
        <nav className="aa-rail" aria-label="Dashboard">
          {/* Pin toggle — the hamburger. On mobile it closes the drawer instead,
              since there the rail is already full width. */}
          <div style={{ padding: '10px 0 2px' }}>
            <button
              type="button"
              className="aa-nav-item"
              onClick={() => (drawer ? setDrawer(false) : togglePinned())}
              aria-pressed={pinned}
              title={pinned ? 'Unpin menu' : 'Keep menu open'}
            >
              <span className="aa-nav-icon">
                <NavIcon type={drawer ? 'close' : 'menu'} size={20} />
              </span>
              <span className="aa-nav-label aa-rail-wide" style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', color: '#fff' }}>
                Australian Atlas
              </span>
            </button>
          </div>

          {/* Managed venue — anchors the rail to the place being managed, so the
              nav reads as "this listing's tools". Collapsed it's just the
              venue's initial, which is enough to know whose dashboard this is. */}
          {!listingsLoading && venue && (
            <Link href={`/dashboard/listings/${venue.id}/edit`} className="aa-venue" title={venue.name}>
              <span className="aa-venue-mark">
                <span>{(venue.name || '?').trim().charAt(0).toUpperCase()}</span>
              </span>
              <span className="aa-rail-wide" style={{ minWidth: 0, paddingRight: 12 }}>
                <span style={{
                  display: 'block', fontFamily: 'var(--font-display)', fontSize: '0.88rem',
                  color: '#fff', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {venue.name}
                </span>
                <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: '0.68rem', color: 'var(--color-sage)', lineHeight: 1.4 }}>
                  {getVerticalBadge(venue.vertical)}
                  {listings.length > 1 && (
                    <span style={{ color: 'rgba(255,255,255,0.42)' }}> · +{listings.length - 1} more</span>
                  )}
                </span>
              </span>
            </Link>
          )}

          <div style={{ flex: 1, paddingBottom: 8 }}>
            {navItems.map((item, i) => {
              if (item.group) {
                return (
                  <div key={`g-${i}`}>
                    <div className="aa-nav-rule" />
                    <div className="aa-nav-group aa-rail-wide" style={{ marginTop: -19 }}>{item.group}</div>
                  </div>
                )
              }

              const active = isActive(item.href)
              let label = item.label
              if (item.picksOnly) {
                const picksVert = activeVerts.find(v => PICKS_VERTICALS.has(v))
                if (picksVert) {
                  const vf = getVerticalFeatures(picksVert)
                  if (vf.picksLabel) label = vf.picksLabel
                }
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="aa-nav-item"
                  data-active={active ? 'true' : 'false'}
                  title={label}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className="aa-nav-icon"><NavIcon type={item.icon} /></span>
                  <span className="aa-nav-label aa-rail-wide">{label}</span>
                  {showBadge(item.href) && (
                    <>
                      <span className="aa-nav-dot" aria-hidden="true" />
                      <span className="aa-rail-wide" style={{ paddingRight: 14, color: 'var(--color-gold)', fontSize: '1.1rem', lineHeight: 1 }} aria-label="Not opened yet">•</span>
                    </>
                  )}
                </Link>
              )
            })}
          </div>

          <div style={{ paddingBottom: 12 }}>
            <div className="aa-nav-rule" style={{ opacity: 1 }} />
            <button type="button" className="aa-nav-item" onClick={handleSignOut} title="Log out">
              <span className="aa-nav-icon"><NavIcon type="logout" /></span>
              <span className="aa-nav-label aa-rail-wide">Log out</span>
            </button>
            {user && (
              <div className="aa-rail-wide" style={{
                padding: '6px 20px 0', fontFamily: 'var(--font-body)', fontSize: '0.7rem',
                color: 'rgba(255,255,255,0.35)', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {user.email}
              </div>
            )}
          </div>
        </nav>

        {/* ── Main column ── */}
        <div className="aa-main">
          <div className="aa-main-inner">
            {children}
          </div>
        </div>

        {/* First-click feature walkthrough — overlays everything */}
        {activeGuide && (
          <FeatureGuideModal guideKey={activeGuide} onClose={handleGuideClose} />
        )}
      </div>
    </AuthContext.Provider>
  )
}
