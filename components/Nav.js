'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { getAuthSupabase } from '@/lib/supabase/auth-clients'

export default function Nav() {
  const [user, setUser] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const supabase = getAuthSupabase()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navLinks = [
    { href: '/explore', label: 'Explore' },
    { href: '/map', label: 'Map' },
    { href: '/trails', label: 'Trails' },
    { href: '/collections', label: 'Collections' },
    { href: '/journal', label: 'Journal' },
    { href: '/regions', label: 'Regions' },
    { href: '/events', label: 'Events' },
    { href: '/atlas-index', label: 'Index' },
    { href: '/for-councils', label: 'For Councils' },
    { href: '/operators', label: 'For Operators' },
    { href: '/search', label: 'Search' },
  ]

  const linkStyle = {
    fontFamily: 'var(--font-body)',
    fontWeight: 400,
    fontSize: '13px',
    color: 'var(--color-muted)',
    textDecoration: 'none',
    transition: 'color 0.15s',
  }

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || ''
  const initials = displayName
    ? displayName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()
    : '?'

  return (
    <nav
      className="sticky top-0 z-50 bg-[var(--color-bg)]"
      style={{ borderBottom: '0.5px solid var(--color-border)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between" style={{ height: '52px' }}>
        <Link
          href="/"
          className="tracking-tight"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: '17px',
            color: 'var(--color-ink)',
          }}
        >
          Australian Atlas
        </Link>
        <div className="flex items-center gap-6">
          {navLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="hover:text-[var(--color-ink)] transition-colors hidden sm:inline"
              style={linkStyle}
            >
              {link.label}
            </Link>
          ))}

          {/* Mobile hamburger */}
          <button
            className="sm:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              color: 'var(--color-ink)',
            }}
          >
            {mobileMenuOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18" /><path d="M6 6l12 12" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12h18" /><path d="M3 6h18" /><path d="M3 18h18" />
              </svg>
            )}
          </button>

          {/* Auth state */}
          {user ? (
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'var(--color-sage)',
                  border: 'none',
                  color: '#fff',
                  fontFamily: 'var(--font-body)',
                  fontSize: '12px',
                  fontWeight: 600,
                  letterSpacing: '0.03em',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'opacity 0.15s',
                }}
                onMouseOver={(e) => e.currentTarget.style.opacity = '0.85'}
                onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
                title={displayName || user.email}
              >
                {initials}
              </button>

              {menuOpen && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '0.5rem',
                  width: '200px',
                  background: '#fff',
                  borderRadius: '10px',
                  border: '1px solid var(--color-border)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                  overflow: 'hidden',
                  zIndex: 100,
                }}>
                  {/* User info */}
                  <div style={{
                    padding: '0.75rem 1rem',
                    borderBottom: '1px solid var(--color-border)',
                  }}>
                    <p style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      color: 'var(--color-ink)',
                      margin: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {displayName}
                    </p>
                    <p style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.75rem',
                      color: 'var(--color-muted)',
                      margin: '0.125rem 0 0',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {user.email}
                    </p>
                  </div>

                  {/* Menu items */}
                  <div style={{ padding: '0.375rem 0' }}>
                    <DropdownLink href="/account" label="My Account" onClick={() => setMenuOpen(false)} />
                    <DropdownLink href="/account/saved" label="Saved places" onClick={() => setMenuOpen(false)} />
                    <DropdownLink href="/account/trails" label="My trails" onClick={() => setMenuOpen(false)} />
                  </div>

                  <div style={{ borderTop: '1px solid var(--color-border)', padding: '0.375rem 0' }}>
                    <button
                      onClick={async () => {
                        setMenuOpen(false)
                        await supabase.auth.signOut()
                        window.location.href = '/'
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '0.5rem 1rem',
                        background: 'none',
                        border: 'none',
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.825rem',
                        color: 'var(--color-muted)',
                        cursor: 'pointer',
                      }}
                      onMouseOver={(e) => e.currentTarget.style.background = 'var(--color-cream)'}
                      onMouseOut={(e) => e.currentTarget.style.background = 'none'}
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="hover:text-[var(--color-ink)] transition-colors"
              style={linkStyle}
            >
              Sign In
            </Link>
          )}
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div
          className="sm:hidden"
          style={{
            borderTop: '1px solid var(--color-border)',
            background: 'var(--color-bg)',
            padding: '0.5rem 0',
          }}
        >
          {navLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              style={{
                display: 'block',
                padding: '0.625rem 1.5rem',
                fontFamily: 'var(--font-body)',
                fontWeight: 400,
                fontSize: '14px',
                color: 'var(--color-ink)',
                textDecoration: 'none',
              }}
            >
              {link.label}
            </Link>
          ))}
          {!user && (
            <Link
              href="/login"
              onClick={() => setMobileMenuOpen(false)}
              style={{
                display: 'block',
                padding: '0.625rem 1.5rem',
                fontFamily: 'var(--font-body)',
                fontWeight: 400,
                fontSize: '14px',
                color: 'var(--color-muted)',
                textDecoration: 'none',
                borderTop: '1px solid var(--color-border)',
                marginTop: '0.25rem',
                paddingTop: '0.75rem',
              }}
            >
              Sign In
            </Link>
          )}
        </div>
      )}
    </nav>
  )
}

function DropdownLink({ href, label, onClick }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      style={{
        display: 'block',
        padding: '0.5rem 1rem',
        fontFamily: 'var(--font-body)',
        fontSize: '0.825rem',
        color: 'var(--color-ink)',
        textDecoration: 'none',
        transition: 'background 0.1s',
      }}
      onMouseOver={(e) => e.currentTarget.style.background = 'var(--color-cream)'}
      onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
    >
      {label}
    </Link>
  )
}
