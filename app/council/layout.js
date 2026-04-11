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

const TIER_LABELS = {
  explorer: 'Explorer',
  partner: 'Partner',
  enterprise: 'Enterprise',
}

const TIER_COLORS = {
  explorer: { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe' },
  partner: { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0' },
  enterprise: { bg: '#fffbeb', text: '#92400e', border: '#fde68a' },
}

const NAV_ITEMS = [
  { label: 'Overview', href: '/council', icon: 'home' },
  { label: 'Region', href: '/council/region', icon: 'map' },
  { label: 'Listings', href: '/council/listings', icon: 'list' },
  { label: 'Analytics', href: '/council/analytics', icon: 'chart', minTier: 'partner' },
  { label: 'Content', href: '/council/content', icon: 'pen', minTier: 'partner' },
]

function NavIcon({ type, size = 18 }) {
  const s = { width: size, height: size, strokeWidth: 1.5, stroke: 'currentColor', fill: 'none' }
  switch (type) {
    case 'home':
      return <svg {...s} viewBox="0 0 24 24"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z"/></svg>
    case 'map':
      return <svg {...s} viewBox="0 0 24 24"><path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>
    case 'list':
      return <svg {...s} viewBox="0 0 24 24"><path d="M9 5h11M9 12h11M9 19h11M5 5h.01M5 12h.01M5 19h.01"/></svg>
    case 'chart':
      return <svg {...s} viewBox="0 0 24 24"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0h6m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
    case 'pen':
      return <svg {...s} viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
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

  // Skip layout for login page
  if (pathname === '/council/login' || pathname === '/council/enquire') {
    return children
  }

  useEffect(() => {
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
  }, [])

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
        <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>Loading...</p>
      </div>
    )
  }

  const council = data?.council
  const tier = council?.tier || 'explorer'
  const tierColor = TIER_COLORS[tier]

  const sidebar = (
    <div style={{
      width: '240px',
      minHeight: '100vh',
      background: 'var(--color-ink)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Brand */}
      <div style={{ padding: '1.5rem 1.25rem 0.75rem' }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <p style={{
            fontFamily: 'var(--font-display)',
            fontSize: '0.8rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.5)',
            margin: 0,
          }}>
            Australian Atlas
          </p>
        </Link>
        {council && (
          <>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.85rem',
              fontWeight: 500,
              color: '#fff',
              margin: '0.75rem 0 0.375rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {council.name}
            </p>
            <span style={{
              display: 'inline-block',
              padding: '0.15rem 0.5rem',
              borderRadius: '999px',
              fontSize: '0.65rem',
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              background: tierColor.bg,
              color: tierColor.text,
            }}>
              {TIER_LABELS[tier]}
            </span>
          </>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '1rem 0' }}>
        {NAV_ITEMS.map((item) => {
          // Hide items above tier
          if (item.minTier === 'partner' && tier === 'explorer') return null

          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.625rem 1.25rem',
                textDecoration: 'none',
                fontFamily: 'var(--font-body)',
                fontSize: '0.9rem',
                color: active ? '#fff' : 'rgba(255,255,255,0.55)',
                borderLeft: active ? '3px solid var(--color-sage)' : '3px solid transparent',
                background: active ? 'rgba(255,255,255,0.05)' : 'transparent',
                transition: 'all 0.15s',
              }}
            >
              <NavIcon type={item.icon} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div style={{ padding: '0 1.25rem' }}>
        <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0.5rem 0' }} />
      </div>
      <div style={{ padding: '0.5rem 0 1.5rem' }}>
        <button
          onClick={handleLogout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            width: '100%',
            padding: '0.625rem 1.25rem',
            background: 'none',
            border: 'none',
            fontFamily: 'var(--font-body)',
            fontSize: '0.9rem',
            color: 'rgba(255,255,255,0.55)',
            cursor: 'pointer',
            textAlign: 'left',
            borderLeft: '3px solid transparent',
          }}
        >
          <NavIcon type="logout" />
          Log out
        </button>
      </div>
    </div>
  )

  return (
    <CouncilContext.Provider value={{ council, regions: data?.regions || [], stats: data?.stats || {}, refetch: () => {} }}>
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
        {/* Desktop sidebar */}
        <div className="hidden md:block" style={{ position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 40 }}>
          {sidebar}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            position: 'fixed',
            top: '1rem',
            left: '1rem',
            zIndex: 50,
            width: '40px',
            height: '40px',
            borderRadius: '8px',
            background: 'var(--color-ink)',
            border: 'none',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
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
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }}
            />
            <div className="md:hidden" style={{ position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 45 }}>
              {sidebar}
            </div>
          </>
        )}

        {/* Main content */}
        <div style={{ flex: 1, minHeight: '100vh', overflowY: 'auto' }} className="md:ml-[240px]">
          <div style={{ padding: '2rem', maxWidth: '1100px' }} className="pt-16 md:pt-8">
            {children}
          </div>
        </div>
      </div>
    </CouncilContext.Provider>
  )
}
