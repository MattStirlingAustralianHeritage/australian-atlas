'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'

const OperatorContext = createContext(null)

export function useOperator() {
  const ctx = useContext(OperatorContext)
  if (!ctx) throw new Error('useOperator must be used within the operator layout')
  return ctx
}

const TIER_LABELS = {
  starter: 'Starter',
  pro: 'Pro',
  trial: 'Trial',
}

const TIER_COLORS = {
  starter: { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0' },
  pro: { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe' },
  trial: { bg: '#fffbeb', text: '#92400e', border: '#fde68a' },
}

const PUBLIC_PATHS = ['/operators', '/operators/register', '/operators/login']

const NAV_ITEMS = [
  { label: 'Overview', href: '/operators/dashboard', icon: 'home' },
  { label: 'Collections', href: '/operators/collections', icon: 'folder' },
  { label: 'Trails', href: '/operators/trails', icon: 'map' },
]

function NavIcon({ type, size = 18 }) {
  const s = { width: size, height: size, strokeWidth: 1.5, stroke: 'currentColor', fill: 'none' }
  switch (type) {
    case 'home':
      return <svg {...s} viewBox="0 0 24 24"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z"/></svg>
    case 'folder':
      return <svg {...s} viewBox="0 0 24 24"><path d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"/></svg>
    case 'map':
      return <svg {...s} viewBox="0 0 24 24"><path d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"/></svg>
    case 'billing':
      return <svg {...s} viewBox="0 0 24 24"><path d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"/></svg>
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

export default function OperatorLayout({ children }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showAccountMenu, setShowAccountMenu] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  // Don't show operator nav on public pages
  const isPublicPage = PUBLIC_PATHS.includes(pathname)
  // Also skip for share pages
  const isSharePage = pathname.startsWith('/operators/share/')

  if (isPublicPage || isSharePage) {
    return children
  }

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      const res = await fetch('/api/operators/data?view=overview')
      if (res.status === 401) {
        router.push('/operators/login')
        return
      }
      const d = await res.json()
      setData(d)
    } catch {
      router.push('/operators/login')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    try {
      const { getAuthSupabase } = await import('@/lib/supabase/auth-clients')
      const supabase = getAuthSupabase()
      await supabase.auth.signOut()
    } catch {}
    router.push('/operators/login')
  }

  function isActive(href) {
    if (href === '/operators/dashboard') return pathname === '/operators/dashboard'
    return pathname.startsWith(href)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
        <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>Loading...</p>
      </div>
    )
  }

  const operator = data?.operator
  const tier = operator?.tier || 'trial'
  const tierColor = TIER_COLORS[tier] || TIER_COLORS.trial

  // Pending approval state
  if (operator && !operator.approved) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--color-bg)', padding: '2rem',
      }}>
        <div style={{
          maxWidth: 480, textAlign: 'center', background: '#fff', borderRadius: 12,
          border: '1px solid var(--color-border)', padding: '3rem 2rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: '#fffbeb', border: '1px solid #fde68a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1.5rem',
          }}>
            <svg width="24" height="24" fill="none" stroke="#92400e" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400,
            color: 'var(--color-ink)', marginBottom: 12,
          }}>
            Approval pending
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
            color: 'var(--color-muted)', lineHeight: 1.6, marginBottom: 24,
          }}>
            Your operator account is being reviewed. We&apos;ll notify you at{' '}
            <strong style={{ color: 'var(--color-ink)' }}>{operator.contact_email}</strong>{' '}
            once your account has been approved.
          </p>
          <button
            onClick={handleLogout}
            style={{
              fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
              color: 'var(--color-sage)', background: 'none', border: 'none',
              cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3,
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

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
        {operator && (
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
              {operator.business_name}
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
              {TIER_LABELS[tier] || tier}
            </span>
          </>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '1rem 0' }}>
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

        {/* Account dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowAccountMenu(!showAccountMenu)}
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
            <NavIcon type="billing" />
            Account
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{
              marginLeft: 'auto',
              transform: showAccountMenu ? 'rotate(180deg)' : 'rotate(0)',
              transition: 'transform 0.15s',
            }}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {showAccountMenu && (
            <div style={{ padding: '0 0 0 2.75rem' }}>
              <a
                href="/api/operators/billing-portal"
                style={{
                  display: 'block',
                  padding: '0.4rem 1.25rem',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.8rem',
                  color: 'rgba(255,255,255,0.45)',
                  textDecoration: 'none',
                  transition: 'color 0.15s',
                }}
              >
                Billing portal
              </a>
            </div>
          )}
        </div>
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
    <OperatorContext.Provider value={{ operator, stats: data?.stats || {}, refetch: fetchData }}>
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
    </OperatorContext.Provider>
  )
}
