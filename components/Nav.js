'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { getAuthSupabase } from '@/lib/supabase/auth-clients'
import { splitLocale } from '@/lib/i18n/config'
import LocalizedLink from './LocalizedLink'
import LanguageSwitcher from './LanguageSwitcher'
import LocationBar from './LocationBar'

export default function Nav() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const supabase = getAuthSupabase()

  useEffect(() => {
    let active = true

    async function loadProfile() {
      try {
        const res = await fetch('/api/auth/profile')
        if (!active) return
        setProfile(res.ok ? (await res.json()).profile ?? null : null)
      } catch {
        if (active) setProfile(null)
      }
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!active) return
      setUser(user)
      if (user) loadProfile()
      else setProfile(null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null
      setUser(nextUser)
      if (nextUser) loadProfile()
      else setProfile(null)
    })

    return () => { active = false; subscription.unsubscribe() }
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
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef(null)

  useEffect(() => {
    function handleMoreClick(e) {
      if (moreRef.current && !moreRef.current.contains(e.target)) {
        setMoreOpen(false)
      }
    }
    if (moreOpen) document.addEventListener('mousedown', handleMoreClick)
    return () => document.removeEventListener('mousedown', handleMoreClick)
  }, [moreOpen])

  // Escape dismisses any open menu
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        setMoreOpen(false)
        setMobileMenuOpen(false)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  const t = useTranslations('nav')
  const pathname = usePathname()
  // Compare against the unprefixed path so active state is correct under /ko.
  const { basePath } = splitLocale(pathname || '/')
  const isActive = (href) => basePath === href || (href !== '/' && basePath?.startsWith(href + '/'))

  const primaryLinks = [
    { href: '/explore', label: t('explore') },
    { href: '/map', label: t('map') },
    { href: '/regions', label: t('regions') },
    { href: '/journal', label: t('journal') },
    { href: '/search', label: t('search') },
    { href: '/discover', label: t('discover') },
  ]

  // The More menu is grouped: reader-facing discovery first, then the
  // partner/trade surfaces under their own small-caps label.
  const moreExploreLinks = [
    { href: '/near-me', label: t('nearMe') },
    { href: '/trails', label: t('trails') },
    { href: '/collections', label: t('collections') },
    { href: '/producer-picks', label: t('producerPicks') },
    { href: '/events', label: t('events') },
    { href: '/atlas-index', label: t('index') },
  ]
  const morePartnerLinks = [
    { href: '/for-councils', label: t('forCouncils') },
    { href: '/for-trade', label: t('forTrade') },
    { href: '/operators', label: t('forOperators') },
  ]
  const secondaryLinks = [...moreExploreLinks, ...morePartnerLinks]

  const navLinks = [...primaryLinks, ...secondaryLinks]

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

  // A claimed listing promotes the profile to the vendor role (and records the
  // vertical in vendor_verticals). Either signal means there's a listing to manage.
  const vendorVerticals = profile?.vendor_verticals || {}
  const canManageListings = profile?.role === 'vendor'
    || profile?.role === 'admin'
    || Object.values(vendorVerticals).some(Boolean)

  return (
    <nav
      className="sticky top-0 z-50"
      style={{
        borderBottom: '0.5px solid var(--color-border)',
        background: 'rgba(248, 246, 241, 0.88)',
        backdropFilter: 'saturate(180%) blur(12px)',
        WebkitBackdropFilter: 'saturate(180%) blur(12px)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between" style={{ height: '56px' }}>
        <LocalizedLink
          href="/"
          className="tracking-tight inline-flex items-center"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: '18px',
            color: 'var(--color-ink)',
            gap: '9px',
          }}
        >
          {/* Compass-star mark — the wordmark's quiet emblem, in the brand gold.
              A quarter-turn on hover: the compass swings, the name holds. */}
          <svg className="wordmark-star" width="15" height="15" viewBox="0 0 24 24" fill="var(--color-gold)" aria-hidden="true" style={{ flexShrink: 0, marginTop: '1px' }}>
            <path d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6L12 0z" />
          </svg>
          Australian Atlas
        </LocalizedLink>
        <div className="flex items-center gap-6">
          {primaryLinks.map(link => (
            <LocalizedLink
              key={link.href}
              href={link.href}
              className="nav-link hidden sm:inline"
              aria-current={isActive(link.href) ? 'page' : undefined}
            >
              {link.label}
            </LocalizedLink>
          ))}

          {/* More dropdown */}
          <div ref={moreRef} style={{ position: 'relative' }} className="hidden sm:block">
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              className="nav-link"
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                padding: 0,
              }}
            >
              {t('more')}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: moreOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {moreOpen && (
              <div className="nav-dropdown" role="menu" style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '0.625rem',
                width: '196px',
                background: 'var(--color-card-bg)',
                borderRadius: 'var(--radius-card)',
                border: '1px solid var(--color-border)',
                boxShadow: 'var(--shadow-md)',
                overflow: 'hidden',
                zIndex: 100,
                padding: '0.375rem 0 0.5rem',
              }}>
                <span className="nav-dropdown-label">{t('groupExplore')}</span>
                {moreExploreLinks.map(link => (
                  <LocalizedLink
                    key={link.href}
                    href={link.href}
                    onClick={() => setMoreOpen(false)}
                    className="nav-dropdown-item"
                    role="menuitem"
                  >
                    {link.label}
                  </LocalizedLink>
                ))}
                <div aria-hidden="true" style={{ borderTop: '1px solid var(--color-border)', margin: '0.4rem 0 0.15rem' }} />
                <span className="nav-dropdown-label">{t('groupPartners')}</span>
                {morePartnerLinks.map(link => (
                  <LocalizedLink
                    key={link.href}
                    href={link.href}
                    onClick={() => setMoreOpen(false)}
                    className="nav-dropdown-item"
                    role="menuitem"
                  >
                    {link.label}
                  </LocalizedLink>
                ))}
              </div>
            )}
          </div>

          {/* Location indicator (desktop) */}
          <div className="hidden sm:block" style={{ borderLeft: '1px solid var(--color-border)', paddingLeft: '12px' }}>
            <LocationBar />
          </div>

          {/* Language switcher (desktop) */}
          <div className="hidden sm:block">
            <LanguageSwitcher />
          </div>

          {/* Mobile hamburger */}
          {/* flex lives in the class list (not inline style) so sm:hidden can
              actually hide it — an inline display beat the utility before,
              leaving a phantom hamburger on desktop. */}
          <button
            className="flex sm:hidden items-center justify-center"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={t('toggleMenu')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '12px',
              minWidth: '44px',
              minHeight: '44px',
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

          {/* Manage listings — appears once a claim promotes the user to vendor */}
          {user && canManageListings && (
            <LocalizedLink
              href="/dashboard"
              className="hidden sm:inline-flex items-center"
              style={{
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '6px',
                background: 'var(--color-sage)',
                color: '#fff',
                fontFamily: 'var(--font-body)',
                fontSize: '12px',
                fontWeight: 500,
                letterSpacing: '0.02em',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                transition: 'opacity 0.15s',
              }}
              onMouseOver={(e) => e.currentTarget.style.opacity = '0.85'}
              onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
            >
              {t('manageListings')}
            </LocalizedLink>
          )}

          {/* Auth state */}
          {user ? (
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label={t('accountMenu')}
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
                <div className="nav-dropdown" style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '0.5rem',
                  width: '200px',
                  background: 'var(--color-card-bg)',
                  borderRadius: 'var(--radius-card)',
                  border: '1px solid var(--color-border)',
                  boxShadow: 'var(--shadow-md)',
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
                    {canManageListings && (
                      <DropdownLink href="/dashboard" label={t('manageListings')} accent onClick={() => setMenuOpen(false)} />
                    )}
                    <DropdownLink href="/account" label={t('myAccount')} onClick={() => setMenuOpen(false)} />
                    <DropdownLink href="/account/saved" label={t('savedPlaces')} onClick={() => setMenuOpen(false)} />
                    <DropdownLink href="/account/trails" label={t('myTrails')} onClick={() => setMenuOpen(false)} />
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
                      {t('signOut')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <LocalizedLink
              href="/login"
              className="transition-colors"
              style={{
                ...linkStyle,
                color: 'var(--color-ink)',
                border: '1px solid var(--color-border)',
                borderRadius: '999px',
                padding: '7px 16px',
                minHeight: 'unset',
                whiteSpace: 'nowrap',
                transition: 'border-color 0.15s ease, background 0.15s ease',
              }}
              onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--color-ink)' }}
              onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)' }}
            >
              {t('signIn')}
            </LocalizedLink>
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
          <div style={{ padding: '0.375rem 1.5rem 0.625rem' }}>
            <LanguageSwitcher align="left" />
          </div>
          {primaryLinks.map(link => (
            <LocalizedLink
              key={link.href}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              aria-current={isActive(link.href) ? 'page' : undefined}
              style={{
                display: 'block',
                padding: '0.625rem 1.5rem',
                fontFamily: 'var(--font-body)',
                fontWeight: isActive(link.href) ? 600 : 400,
                fontSize: '15px',
                color: 'var(--color-ink)',
                textDecoration: 'none',
              }}
            >
              {link.label}
            </LocalizedLink>
          ))}
          <div aria-hidden="true" style={{ borderTop: '1px solid var(--color-border)', margin: '0.5rem 1.5rem' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            {secondaryLinks.map(link => (
              <LocalizedLink
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  display: 'block',
                  padding: '0.55rem 1.5rem',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 400,
                  fontSize: '13.5px',
                  color: 'var(--color-muted)',
                  textDecoration: 'none',
                }}
              >
                {link.label}
              </LocalizedLink>
            ))}
          </div>
          {user && canManageListings && (
            <LocalizedLink
              href="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              style={{
                display: 'block',
                padding: '0.625rem 1.5rem',
                fontFamily: 'var(--font-body)',
                fontWeight: 600,
                fontSize: '14px',
                color: 'var(--color-sage)',
                textDecoration: 'none',
              }}
            >
              {t('manageListings')}
            </LocalizedLink>
          )}
          {!user && (
            <LocalizedLink
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
              {t('signIn')}
            </LocalizedLink>
          )}
        </div>
      )}
    </nav>
  )
}

function DropdownLink({ href, label, onClick, accent }) {
  return (
    <LocalizedLink
      href={href}
      onClick={onClick}
      className="nav-dropdown-item"
      style={accent ? { color: 'var(--color-sage)', fontWeight: 600 } : undefined}
    >
      {label}
    </LocalizedLink>
  )
}
