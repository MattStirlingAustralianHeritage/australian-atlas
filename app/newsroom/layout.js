'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { PRESS_CONTACT_EMAIL } from '@/lib/press/config'

// The Newsroom shell — the council dashboard chrome (dark fixed sidebar,
// stripped site nav/footer) with press navigation. Standalone pages
// (login / enquire / the public example fact sheet) skip the shell.

const PressContext = createContext(null)

export function usePress() {
  const ctx = useContext(PressContext)
  if (!ctx) throw new Error('usePress must be used within the newsroom layout')
  return ctx
}

const NAV_GROUPS = [
  {
    label: null,
    items: [{ label: 'Newsdesk', href: '/newsroom', icon: 'news' }],
  },
  {
    label: 'Coverage',
    items: [
      { label: 'Your regions', href: '/newsroom/regions', icon: 'map' },
      { label: 'Events', href: '/newsroom/events', icon: 'calendar' },
      { label: 'Story leads', href: '/newsroom/leads', icon: 'bulb' },
    ],
  },
  {
    label: 'Resources',
    items: [
      { label: 'Data room', href: '/newsroom/data', icon: 'database' },
      { label: 'Media kit', href: '/newsroom/media-kit', icon: 'folder' },
      { label: 'Requests', href: '/newsroom/requests', icon: 'inbox' },
    ],
  },
  {
    label: 'Account',
    items: [
      { label: 'Settings', href: '/newsroom/settings', icon: 'cog' },
    ],
  },
]

function NavIcon({ type, size = 17 }) {
  const s = { width: size, height: size, strokeWidth: 1.6, stroke: 'currentColor', fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }
  switch (type) {
    case 'news':
      return <svg {...s} viewBox="0 0 24 24"><path d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"/></svg>
    case 'map':
      return <svg {...s} viewBox="0 0 24 24"><path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>
    case 'calendar':
      return <svg {...s} viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
    case 'bulb':
      return <svg {...s} viewBox="0 0 24 24"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
    case 'database':
      return <svg {...s} viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.657 3.582 3 8 3s8-1.343 8-3V5"/><path d="M4 11v6c0 1.657 3.582 3 8 3s8-1.343 8-3v-6"/></svg>
    case 'folder':
      return <svg {...s} viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
    case 'inbox':
      return <svg {...s} viewBox="0 0 24 24"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
    case 'cog':
      return <svg {...s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
    case 'chat':
      return <svg {...s} viewBox="0 0 24 24"><path d="M8 12h8m-8-4h5m-5 8h.01M21 12a8 8 0 01-11.6 7.13L4 20l1.07-4.4A8 8 0 1121 12z"/></svg>
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

export default function NewsroomLayout({ children }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  const isStandalone =
    pathname === '/newsroom/login' ||
    pathname === '/newsroom/enquire' ||
    pathname === '/newsroom/example'

  useEffect(() => {
    if (isStandalone) return
    fetch('/api/press/data?view=overview')
      .then(r => {
        if (r.status === 401) {
          router.push('/newsroom/login')
          return null
        }
        return r.json()
      })
      .then(d => {
        if (d) setData(d)
        setLoading(false)
      })
      .catch(() => {
        router.push('/newsroom/login')
      })
  }, [isStandalone])

  if (isStandalone) {
    return children
  }

  async function handleLogout() {
    await fetch('/api/press/auth', { method: 'DELETE' })
    router.push('/newsroom/login')
  }

  function isActive(href) {
    if (href === '/newsroom') return pathname === '/newsroom'
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
            Opening the newsroom…
          </p>
        </div>
      </div>
    )
  }

  const press = data?.press

  if (!press) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)', padding: '1.5rem' }}>
        <div style={{ textAlign: 'center', background: '#fff', border: '1px solid var(--color-border)', borderRadius: 14, padding: '2rem 2.5rem', maxWidth: 420 }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--color-ink)', margin: '0 0 0.5rem' }}>
            We couldn&apos;t open the newsroom
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
            Australian Atlas · Newsroom
          </p>
        </Link>
        <div style={{ marginTop: '0.9rem' }}>
          <p style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.02rem',
            fontWeight: 450,
            color: '#faf8f5',
            margin: '0 0 0.15rem',
            lineHeight: 1.25,
          }}>
            {press.outlet}
          </p>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.74rem',
            color: 'rgba(250,248,245,0.55)',
            margin: '0 0 0.5rem',
          }}>
            {press.name}
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
            Press beta
          </span>
        </div>
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

      {/* Press desk contact + logout */}
      <div style={{ padding: '0 1.1rem 1.4rem' }}>
        <a
          href={`mailto:${PRESS_CONTACT_EMAIL}`}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.6rem',
            margin: '0 0 0.75rem', padding: '0.7rem 0.85rem',
            borderRadius: 10, textDecoration: 'none',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <span style={{ color: '#a8c5bc', display: 'flex' }}><NavIcon type="chat" size={16} /></span>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'rgba(250,248,245,0.85)', lineHeight: 1.35 }}>
            On deadline? Email the press desk — same-day reply
          </span>
        </a>
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
    <PressContext.Provider value={{
      press,
      regions: data?.regions || [],
      network: data?.network || null,
      signals: data?.signals || [],
      recentAdditions: data?.recentAdditions || [],
      recentAdditionsCount: data?.recentAdditionsCount || 0,
      upcomingEvents: data?.upcomingEvents || [],
      leads: data?.leads || [],
    }}>
      {/* App shell, not a marketing page: strip the site nav/footer (the
          council/embed scoped-CSS pattern — SSR-safe, no flash). */}
      <style>{`nav.sticky, footer, a.skip-link { display: none !important; }`}</style>
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
        {/* Desktop sidebar */}
        <div className="hidden md:block" style={{ position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 40 }}>
          {sidebar}
        </div>

        {/* Mobile hamburger — display is class-driven (flex / md:hidden). */}
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
    </PressContext.Provider>
  )
}
