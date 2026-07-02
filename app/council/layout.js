'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'

const CouncilContext = createContext(null)

export function useCouncil() {
  const ctx = useContext(CouncilContext)
  if (!ctx) throw new Error('useCouncil must be used within the council layout')
  return ctx
}

// Grouped navigation: the intelligence pages (what the council pays for) sit
// first-class next to the region administration pages.
const NAV_GROUPS = [
  {
    label: null,
    items: [{ label: 'Overview', href: '/council', icon: 'home' }],
  },
  {
    label: 'Intelligence',
    items: [
      { label: 'Analytics', href: '/council/analytics', icon: 'chart' },
      { label: 'Demand', href: '/council/demand', icon: 'search' },
      { label: 'Digital presence', href: '/council/presence', icon: 'signal' },
    ],
  },
  {
    label: 'Your region',
    items: [
      { label: 'Region', href: '/council/region', icon: 'map' },
      { label: 'Listings', href: '/council/listings', icon: 'list' },
      { label: 'Content', href: '/council/content', icon: 'pen' },
    ],
  },
  {
    label: 'Account',
    items: [
      { label: 'Feedback', href: '/council/feedback', icon: 'chat' },
      { label: 'Settings', href: '/council/settings', icon: 'cog' },
    ],
  },
]

function NavIcon({ type, size = 17 }) {
  const s = { width: size, height: size, strokeWidth: 1.6, stroke: 'currentColor', fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }
  switch (type) {
    case 'home':
      return <svg {...s} viewBox="0 0 24 24"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z"/></svg>
    case 'map':
      return <svg {...s} viewBox="0 0 24 24"><path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>
    case 'list':
      return <svg {...s} viewBox="0 0 24 24"><path d="M9 5h11M9 12h11M9 19h11M5 5h.01M5 12h.01M5 19h.01"/></svg>
    case 'chart':
      return <svg {...s} viewBox="0 0 24 24"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0h6m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
    case 'search':
      return <svg {...s} viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
    case 'signal':
      return <svg {...s} viewBox="0 0 24 24"><path d="M5 12.55a11 11 0 0114 0M8.5 15.5a6.5 6.5 0 017 0M12 19h.01"/></svg>
    case 'pen':
      return <svg {...s} viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
    case 'chat':
      return <svg {...s} viewBox="0 0 24 24"><path d="M8 12h8m-8-4h5m-5 8h.01M21 12a8 8 0 01-11.6 7.13L4 20l1.07-4.4A8 8 0 1121 12z"/></svg>
    case 'cog':
      return <svg {...s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
    case 'report':
      return <svg {...s} viewBox="0 0 24 24"><path d="M9 17v-4m3 4v-8m3 8v-2M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
    case 'logout':
      return <svg {...s} viewBox="0 0 24 24"><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h5a2 2 0 012 2v1"/></svg>
    case 'menu':
      return <svg {...s} viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
    case 'close':
      return <svg {...s} viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
    default:
      return null
  }
}

export default function CouncilLayout({ children }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  // Standalone pages skip the dashboard chrome (sidebar + auth fetch):
  // login/enquire, the public example, and the print-optimised region report.
  const isStandalone =
    pathname === '/council/login' ||
    pathname === '/council/enquire' ||
    pathname === '/council/example' ||
    /^\/council\/[^/]+\/report$/.test(pathname)

  useEffect(() => {
    if (isStandalone) return
    fetch('/api/council/data?view=overview')
      .then(r => {
        if (r.status === 401) {
          router.push('/council/login')
          return null
        }
        return r.json()
      })
      .then(d => {
        if (d) setData(d)
        setLoading(false)
      })
      .catch(() => {
        router.push('/council/login')
      })
  }, [isStandalone])

  if (isStandalone) {
    return children
  }

  async function handleLogout() {
    await fetch('/api/council/auth', { method: 'DELETE' })
    router.push('/council/login')
  }

  function isActive(href) {
    if (href === '/council') return pathname === '/council'
    return pathname.startsWith(href)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-muted)', margin: '0 0 0.5rem' }}>
            Australian Atlas
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-muted)', margin: 0 }}>
            Opening your dashboard…
          </p>
        </div>
      </div>
    )
  }

  const council = data?.council

  // Loaded but no council (transient fetch failure, non-401 API error): show a
  // recoverable state rather than a silently blank dashboard — every page
  // returns null without a council.
  if (!council) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)', padding: '1.5rem' }}>
        <div style={{ textAlign: 'center', background: '#fff', border: '1px solid var(--color-border)', borderRadius: 14, padding: '2rem 2.5rem', maxWidth: 420 }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--color-ink)', margin: '0 0 0.5rem' }}>
            We couldn&apos;t load your dashboard
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-muted)', lineHeight: 1.6, margin: '0 0 1.1rem' }}>
            Usually a hiccup — try again, or sign in afresh if it persists.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
              background: 'var(--color-ink)', color: 'var(--color-cream)', border: 'none',
              borderRadius: 10, padding: '0.55rem 1.3rem',
            }}
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  const regions = data?.regions || []
  const firstRegion = regions[0]

  const sidebar = (
    <div style={{
      width: 248,
      height: '100%',
      background: 'var(--color-ink)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflowY: 'auto',
    }}>
      {/* Brand + account */}
      <div style={{ padding: '1.6rem 1.7rem 0.9rem' }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <p style={{
            fontFamily: 'var(--font-display)',
            fontSize: '0.78rem',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'rgba(250,248,245,0.5)',
            margin: 0,
          }}>
            Australian Atlas
          </p>
        </Link>
        {council && (
          <div style={{ marginTop: '0.9rem' }}>
            {council.logo_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={council.logo_url}
                alt=""
                style={{ height: 30, width: 'auto', maxWidth: 170, marginBottom: '0.5rem', display: 'block', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' }}
              />
            ) : null}
            <p style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.02rem',
              fontWeight: 450,
              color: '#faf8f5',
              margin: '0 0 0.45rem',
              lineHeight: 1.25,
            }}>
              {council.name}
            </p>
            <span style={{
              display: 'inline-block',
              padding: '0.16rem 0.55rem',
              borderRadius: 999,
              fontSize: '0.62rem',
              fontFamily: 'var(--font-body)',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              background: 'rgba(95,138,126,0.3)',
              border: '1px solid rgba(95,138,126,0.55)',
              color: '#a8c5bc',
            }}>
              Founding partner
            </span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '0.4rem 0 1rem' }}>
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi}>
            {group.label && <p className="cnav-group" style={{ margin: 0 }}>{group.label}</p>}
            {group.items.map(item => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`cnav-item${isActive(item.href) ? ' active' : ''}`}
              >
                <NavIcon type={item.icon} />
                <span style={{ flex: 1 }}>{item.label}</span>
                <span className="cnav-dot" />
              </Link>
            ))}
          </div>
        ))}
      </nav>

      {/* Report shortcut + logout */}
      <div style={{ padding: '0 1.1rem 1.4rem' }}>
        {firstRegion && (
          <a
            href={`/council/${firstRegion.slug}/report`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.6rem',
              margin: '0 0 0.75rem', padding: '0.7rem 0.85rem',
              borderRadius: 10, textDecoration: 'none',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <span style={{ color: '#a8c5bc', display: 'flex' }}><NavIcon type="report" size={16} /></span>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'rgba(250,248,245,0.85)', lineHeight: 1.35 }}>
              Print-ready region report
            </span>
          </a>
        )}
        <button
          onClick={handleLogout}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.6rem',
            width: '100%', padding: '0.5rem 0.85rem',
            background: 'none', border: 'none', borderRadius: 9,
            fontFamily: 'var(--font-body)', fontSize: '0.85rem',
            color: 'rgba(250,248,245,0.55)', cursor: 'pointer', textAlign: 'left',
          }}
        >
          <NavIcon type="logout" size={16} />
          Log out
        </button>
      </div>
    </div>
  )

  return (
    <CouncilContext.Provider value={{ council, regions, stats: data?.stats || {}, activity: data?.activity || [], refetch: () => {} }}>
      {/* The dashboard is an app shell, not a marketing page: strip the site
          nav/footer (same scoped-CSS pattern as /embed — SSR-safe, no flash).
          Standalone pages (login/enquire/example/report) keep the site chrome. */}
      <style>{`nav.sticky, footer, a.skip-link { display: none !important; }`}</style>
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
        {/* Desktop sidebar */}
        <div className="hidden md:block" style={{ position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 40 }}>
          {sidebar}
        </div>

        {/* Mobile hamburger */}
        {/* display is class-driven (flex / md:hidden) — an inline display:flex
            would override md:hidden and leave the hamburger floating over the
            desktop sidebar. */}
        <button
          className="flex md:hidden items-center justify-center"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
          style={{
            position: 'fixed', top: '1rem', left: '1rem', zIndex: 50,
            width: 40, height: 40, borderRadius: 10,
            background: 'var(--color-ink)', border: 'none', color: '#fff',
            cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          <NavIcon type={sidebarOpen ? 'close' : 'menu'} size={20} />
        </button>

        {/* Mobile overlay */}
        {sidebarOpen && (
          <>
            <div
              className="md:hidden"
              onClick={() => setSidebarOpen(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 40 }}
            />
            <div className="md:hidden" style={{ position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 45 }}>
              {sidebar}
            </div>
          </>
        )}

        {/* Main content */}
        <div style={{ flex: 1, minHeight: '100vh', minWidth: 0 }} className="md:ml-[248px]">
          <div style={{ padding: '2.25rem 2rem 4rem', maxWidth: 1080, margin: '0 auto' }} className="pt-16 md:pt-9">
            {children}
          </div>
        </div>
      </div>
    </CouncilContext.Provider>
  )
}
