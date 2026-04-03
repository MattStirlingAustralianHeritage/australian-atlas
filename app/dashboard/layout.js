'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { getAuthSupabase } from '@/lib/supabase/auth-clients'

const AuthContext = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within the dashboard layout')
  return ctx
}

const NAV_ITEMS = [
  { label: 'Overview', href: '/dashboard', icon: 'home' },
  { label: 'My Listings', href: '/dashboard/listings', icon: 'list' },
  { label: 'Analytics', href: '/dashboard/analytics', icon: 'chart' },
  { label: 'Producer Picks', href: '/dashboard/picks', icon: 'star' },
  { label: 'Editorial', href: '/dashboard/editorial', icon: 'pen' },
  { label: 'Subscription', href: '/dashboard/subscription', icon: 'card' },
]

function NavIcon({ type, size = 18 }) {
  const s = { width: size, height: size, strokeWidth: 1.5, stroke: 'currentColor', fill: 'none' }
  switch (type) {
    case 'home':
      return <svg {...s} viewBox="0 0 24 24"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z"/></svg>
    case 'list':
      return <svg {...s} viewBox="0 0 24 24"><path d="M9 5h11M9 12h11M9 19h11M5 5h.01M5 12h.01M5 19h.01"/></svg>
    case 'chart':
      return <svg {...s} viewBox="0 0 24 24"><path d="M9 19V13a1 1 0 011-1h4a1 1 0 011 1v6M3 19h18M5 19V9l7-5 7 5v10"/></svg>
    case 'star':
      return <svg {...s} viewBox="0 0 24 24"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674h4.914c.969 0 1.371 1.24.588 1.81l-3.976 2.888 1.519 4.674c.3.922-.755 1.688-1.538 1.118L12 15.203l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.519-4.674-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914l1.519-4.674z"/></svg>
    case 'pen':
      return <svg {...s} viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
    case 'card':
      return <svg {...s} viewBox="0 0 24 24"><path d="M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
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

export default function DashboardLayout({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = getAuthSupabase()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

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
        <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--color-muted)' }}>Loading...</p>
      </div>
    )
  }

  const sidebar = (
    <div style={{
      width: '220px',
      minHeight: '100vh',
      background: 'var(--color-ink)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Brand */}
      <div style={{ padding: '1.5rem 1.25rem 1rem' }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <p style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '0.8rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.5)',
            margin: 0,
          }}>
            Australian Atlas
          </p>
        </Link>
        {user && (
          <p style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.8rem',
            color: 'rgba(255,255,255,0.4)',
            margin: '0.5rem 0 0',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {user.email}
          </p>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '0.5rem 0' }}>
        {NAV_ITEMS.map((item) => {
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
                fontFamily: 'var(--font-sans)',
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

      {/* Divider + Logout */}
      <div style={{ padding: '0 1.25rem' }}>
        <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0.5rem 0' }} />
      </div>
      <div style={{ padding: '0.5rem 0 1.5rem' }}>
        <button
          onClick={handleSignOut}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            width: '100%',
            padding: '0.625rem 1.25rem',
            background: 'none',
            border: 'none',
            fontFamily: 'var(--font-sans)',
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
    <AuthContext.Provider value={{ user, supabase }}>
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-cream)' }}>
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

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <>
            <div
              className="md:hidden"
              onClick={() => setSidebarOpen(false)}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.4)',
                zIndex: 40,
              }}
            />
            <div className="md:hidden" style={{ position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 45 }}>
              {sidebar}
            </div>
          </>
        )}

        {/* Main content */}
        <div
          style={{
            flex: 1,
            minHeight: '100vh',
            overflowY: 'auto',
          }}
          className="md:ml-[220px]"
        >
          <div style={{ padding: '2rem', maxWidth: '1100px' }} className="pt-16 md:pt-8">
            {children}
          </div>
        </div>
      </div>
    </AuthContext.Provider>
  )
}
