'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ClaimWelcomePopup — a once-per-operator coach-mark that fires the first time a
// newly-claimed operator browses the main site.
//
// After claiming, operators often don't realise there's a permanent shortcut to
// their dashboard sitting in the top bar — the green "Manage listings" button.
// The first time they land on any public page as a claimed operator, we point at
// it: a small card anchored top-right (under the button), a faithful replica of
// the button so they'll recognise it, and a direct link into the dashboard.
//
// Gating:
//   • Only for claimed operators (profile.role === 'vendor', or a claimed
//     vendor_vertical). Admins are never nagged.
//   • Once per operator, ever (localStorage, keyed by user id).
//   • Never on the dashboard / claim / auth routes — there it's redundant.
// A soft scrim dims the page *below* the sticky nav (z-50), so the real button
// stays lit while everything else recedes.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getAuthSupabase } from '@/lib/supabase/auth-clients'

const SEEN_KEY_BASE = 'atlas:site:manage-intro:v1'

// Routes where the coach-mark would be redundant or intrusive.
const SUPPRESSED_PREFIXES = ['/dashboard', '/claim', '/login', '/account', '/admin', '/auth']

function isSuppressed(pathname) {
  if (!pathname) return false
  return SUPPRESSED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

// A pixel-faithful copy of the nav's "Manage listings" pill (see components/Nav.js),
// so the operator recognises the real thing up in the bar.
function ManageListingsReplica() {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 14px',
        borderRadius: 6,
        background: 'var(--color-sage, #5f8a7e)',
        color: '#fff',
        fontFamily: 'var(--font-body, system-ui)',
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        boxShadow: '0 0 0 4px rgba(95,138,126,0.18)',
      }}
    >
      Manage listings
    </span>
  )
}

export default function ClaimWelcomePopup() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [userId, setUserId] = useState(null)

  // Resolve whether the visitor is a claimed operator who hasn't seen this yet.
  useEffect(() => {
    if (isSuppressed(pathname)) return
    let active = true

    async function resolve() {
      try {
        const supabase = getAuthSupabase()
        const { data: { user } } = await supabase.auth.getUser()
        if (!active || !user) return

        const res = await fetch('/api/auth/profile')
        if (!active || !res.ok) return
        const { profile } = await res.json()
        if (!active || !profile) return

        // Claimed operators only — never admins.
        const claimedVertical = Object.values(profile.vendor_verticals || {}).some(Boolean)
        const isOperator = profile.role === 'vendor' || claimedVertical
        if (profile.role === 'admin' || !isOperator) return

        const seenKey = `${SEEN_KEY_BASE}:${user.id}`
        let seen = false
        try { seen = localStorage.getItem(seenKey) === '1' } catch { /* storage off */ }
        if (seen) return

        setUserId(user.id)
        setOpen(true)
      } catch { /* not signed in / offline — show nothing */ }
    }

    resolve()
    return () => { active = false }
    // Re-check when navigating from a suppressed route onto a public one.
  }, [pathname])

  const dismiss = useCallback(() => {
    if (userId) {
      try { localStorage.setItem(`${SEEN_KEY_BASE}:${userId}`, '1') } catch { /* ignore */ }
    }
    setOpen(false)
  }, [userId])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') dismiss() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, dismiss])

  if (!open) return null

  return (
    <>
      <style>{`
        @keyframes claimWelcomeRise {
          from { opacity: 0; transform: translateY(-8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes claimWelcomeCaret {
          0%, 100% { transform: translateY(0) rotate(45deg); }
          50%      { transform: translateY(-3px) rotate(45deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .claim-welcome-card, .claim-welcome-caret { animation: none !important; }
        }
      `}</style>

      {/* Soft scrim BELOW the sticky nav (z-50) so the real button stays lit. */}
      <div
        onClick={dismiss}
        aria-hidden
        style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(20,18,14,0.34)' }}
      />

      {/* Coach-mark card, anchored top-right under the nav button. */}
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="claim-welcome-heading"
        className="claim-welcome-card"
        style={{
          position: 'fixed',
          top: 62,
          right: 14,
          zIndex: 900,
          width: 'min(360px, calc(100vw - 28px))',
          background: '#fff',
          borderRadius: 14,
          border: '1px solid var(--color-border, #e9e4da)',
          boxShadow: '0 24px 60px rgba(28,24,20,0.28)',
          padding: '20px 20px 18px',
          animation: 'claimWelcomeRise 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* Up-caret pointing at the top bar */}
        <span
          aria-hidden
          className="claim-welcome-caret"
          style={{
            position: 'absolute',
            top: -6,
            right: 44,
            width: 12,
            height: 12,
            background: '#fff',
            borderLeft: '1px solid var(--color-border, #e9e4da)',
            borderTop: '1px solid var(--color-border, #e9e4da)',
            transform: 'rotate(45deg)',
            animation: 'claimWelcomeCaret 1.8s ease-in-out infinite',
          }}
        />

        {/* Close */}
        <button
          onClick={dismiss}
          aria-label="Close"
          style={{
            position: 'absolute', top: 12, right: 12, width: 28, height: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', borderRadius: 8, background: 'transparent',
            color: 'var(--color-muted, #8a8378)', cursor: 'pointer',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        {/* Eyebrow */}
        <p style={{
          fontFamily: 'var(--font-body, system-ui)', fontSize: 10, fontWeight: 700,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--color-sage, #5f8a7e)', margin: '0 0 8px',
        }}>
          You’re all set
        </p>

        {/* Heading */}
        <h2
          id="claim-welcome-heading"
          style={{
            fontFamily: 'var(--font-display, Georgia)', fontWeight: 400,
            fontSize: '1.35rem', lineHeight: 1.2, color: 'var(--color-ink, #2D2A26)',
            margin: '0 0 12px',
          }}
        >
          Manage your listing any time
        </h2>

        {/* The button they should look for */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
          borderRadius: 10, background: 'var(--color-cream, #FAF8F5)',
          border: '1px solid var(--color-border, #e9e4da)', marginBottom: 14,
        }}>
          <ManageListingsReplica />
          <span style={{
            fontFamily: 'var(--font-body, system-ui)', fontSize: 12, lineHeight: 1.35,
            color: 'var(--color-muted, #6f695f)',
          }}>
            Up in the top bar &mdash; on every page
          </span>
        </div>

        {/* Copy */}
        <p style={{
          fontFamily: 'var(--font-body, system-ui)', fontSize: 13.5, fontWeight: 300,
          lineHeight: 1.55, color: 'var(--color-muted, #6f695f)', margin: '0 0 18px',
        }}>
          Tap it to open your <strong style={{ fontWeight: 600, color: 'var(--color-ink, #2D2A26)' }}>Operator Dashboard</strong> —
          update your photos, hours and details, and see who’s finding you. On a phone, open the menu (top-right) and choose Manage listings.
        </p>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link
            href="/dashboard"
            onClick={dismiss}
            style={{
              flex: 1, textAlign: 'center', padding: '11px 16px', borderRadius: 9,
              background: 'var(--color-ink, #2D2A26)', color: '#fff',
              fontFamily: 'var(--font-body, system-ui)', fontSize: 13, fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Open my dashboard &rarr;
          </Link>
          <button
            onClick={dismiss}
            style={{
              padding: '11px 18px', borderRadius: 9, background: 'transparent',
              color: 'var(--color-muted, #6f695f)', border: '1px solid var(--color-border, #e9e4da)',
              fontFamily: 'var(--font-body, system-ui)', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </>
  )
}
