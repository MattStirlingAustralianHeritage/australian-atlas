'use client'

// ─────────────────────────────────────────────────────────────────────────────
// UpgradeBanner — the fast, benefits-forward path from a free claim to Standard.
//
// A claimed-but-unpaid operator lands on their dashboard and, today, has to
// notice a small "Editing locked" note on a card, click into the listing, read
// the challenge, and only then reach a Pay button. This banner collapses that
// to a single click: it names the benefits up front and starts secure Stripe
// checkout for the operator's listing directly from the Overview.
//
// Truthful by design (see the /for-venues "ranking is never for sale" plank):
// Standard unlocks management, presence and insight — never placement. We say so.
//
// Self-gates: renders only when the operator has at least one unpaid listing and
// is not an admin. Targets the first unpaid listing for one-click checkout; any
// others are still upgradeable from their own cards below.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { getDashboardToken } from '@/lib/dashboard-token'
import { getVerticalBrandColour, getVerticalLabel } from '@/lib/verticalUrl'

const STANDARD_PRICE = '$295/year'

// The concrete things a Standard listing unlocks. Kept honest and specific so
// the value is obvious at a glance — no vague "premium" language, no placement.
const BENEFITS = [
  { icon: 'pencil', text: 'Edit your website, phone & opening hours' },
  { icon: 'photo', text: 'Add a cover photo and full gallery' },
  { icon: 'megaphone', text: 'Publish highlights & what’s on' },
  { icon: 'chart', text: 'Listing Insights — views, searches & saves' },
]

function BenefitIcon({ type }) {
  const p = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }
  switch (type) {
    case 'pencil':
      return <svg {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
    case 'photo':
      return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
    case 'megaphone':
      return <svg {...p}><path d="M3 11l18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>
    case 'chart':
      return <svg {...p}><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="12" y="8" width="3" height="10" /><rect x="17" y="5" width="3" height="13" /></svg>
    default:
      return null
  }
}

export default function UpgradeBanner({ listings, isAdmin }) {
  const [upgrading, setUpgrading] = useState(false)
  const [error, setError] = useState(null)

  // Never nag an admin, and only surface when there's an unpaid listing to sell.
  const unpaid = (listings || []).filter((l) => l && !l.paid)
  if (isAdmin || unpaid.length === 0) return null

  const target = unpaid[0]
  const accent = getVerticalBrandColour(target.vertical) || 'var(--color-sage, #5f8a7e)'
  const many = unpaid.length > 1

  async function handleUpgrade() {
    setUpgrading(true)
    setError(null)
    try {
      const token = await getDashboardToken()
      if (!token) {
        setError('Please sign in again to upgrade.')
        setUpgrading(false)
        return
      }
      const res = await fetch('/api/stripe/upgrade-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ listing_id: target.id }),
      })
      let d = {}
      try { d = await res.json() } catch { /* non-JSON error body */ }
      if (res.ok && d.url) {
        window.location.href = d.url
        return
      }
      setError(d.error || 'We couldn’t start payment. Please try again, or email listings@australianatlas.com.au.')
    } catch {
      setError('We couldn’t start payment. Please check your connection and try again.')
    } finally {
      setUpgrading(false)
    }
  }

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 16,
        border: '1px solid var(--color-border, #e9e4da)',
        background: 'linear-gradient(180deg, #fff 0%, var(--color-cream, #FAF8F5) 100%)',
        boxShadow: '0 1px 2px rgba(28,24,20,0.04), 0 14px 34px rgba(28,24,20,0.06)',
      }}
    >
      {/* Accent hairline in the listing's own vertical colour */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: accent }} aria-hidden />

      <div style={{ padding: 'clamp(20px, 3.5vw, 28px)' }}>
        {/* Eyebrow */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ display: 'inline-flex', color: accent }} aria-hidden>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V8a5 5 0 0 1 9.9-1" />
            </svg>
          </span>
          <span style={{
            fontFamily: 'var(--font-body, system-ui)', fontSize: 10.5, fontWeight: 700,
            letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-muted, #8a8378)',
          }}>
            Standard plan &middot; {STANDARD_PRICE}
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(16px, 3vw, 36px)', alignItems: 'flex-start' }}>
          {/* Left: pitch + benefits */}
          <div style={{ flex: '1 1 300px', minWidth: 260 }}>
            <h2 style={{
              fontFamily: 'var(--font-display, Georgia)', fontWeight: 400,
              fontSize: 'clamp(1.35rem, 2.6vw, 1.7rem)', lineHeight: 1.15,
              color: 'var(--color-ink, #2D2A26)', margin: '0 0 8px',
            }}>
              Take charge of {many ? 'your listings' : target.name}
            </h2>
            <p style={{
              fontFamily: 'var(--font-body, system-ui)', fontSize: 14, fontWeight: 300,
              lineHeight: 1.55, color: 'var(--color-muted, #6f695f)', margin: '0 0 18px', maxWidth: 440,
            }}>
              Your claim is verified and {many ? 'your listings are' : `${target.name} is`} live across the Atlas
              network. Activate Standard to manage {many ? 'them' : 'it'} in full — and see who’s finding you.
            </p>

            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px 18px' }}>
              {BENEFITS.map((b) => (
                <li key={b.text} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                  <span style={{ color: accent, flexShrink: 0, marginTop: 1, display: 'inline-flex' }} aria-hidden><BenefitIcon type={b.icon} /></span>
                  <span style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 13.5, lineHeight: 1.35, color: 'var(--color-ink, #2D2A26)' }}>{b.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right: action */}
          <div style={{ flex: '0 1 260px', minWidth: 220, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{
              borderRadius: 12, border: '1px solid var(--color-border, #e9e4da)', background: '#fff',
              padding: '16px 16px 18px', textAlign: 'center',
            }}>
              <p style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 12, color: 'var(--color-muted, #8a8378)', margin: '0 0 2px' }}>
                One listing, one plan
              </p>
              <p style={{ fontFamily: 'var(--font-display, Georgia)', fontSize: '1.8rem', fontWeight: 400, color: 'var(--color-ink, #2D2A26)', margin: '0 0 2px', lineHeight: 1 }}>
                $295<span style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 13, color: 'var(--color-muted, #8a8378)', fontWeight: 400 }}>/year</span>
              </p>
              <p style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 11.5, color: 'var(--color-muted, #8a8378)', margin: '0 0 14px' }}>
                about $25 a month
              </p>
              <button
                type="button"
                onClick={handleUpgrade}
                disabled={upgrading}
                style={{
                  width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '13px 18px', borderRadius: 10, border: 'none',
                  background: 'var(--color-ink, #2D2A26)', color: '#fff',
                  fontFamily: 'var(--font-body, system-ui)', fontSize: 14, fontWeight: 600,
                  cursor: upgrading ? 'wait' : 'pointer', opacity: upgrading ? 0.72 : 1, transition: 'opacity 0.15s',
                }}
              >
                {upgrading ? 'Starting secure checkout…' : (
                  <>
                    Upgrade now
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </>
                )}
              </button>
              <p style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 11, color: 'var(--color-muted, #8a8378)', margin: '10px 0 0', lineHeight: 1.4 }}>
                Secure payment via Stripe · cancel anytime
              </p>
            </div>
            {many && (
              <p style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 11.5, color: 'var(--color-muted, #8a8378)', margin: 0, textAlign: 'center', lineHeight: 1.4 }}>
                Applies to <strong style={{ fontWeight: 600, color: 'var(--color-ink, #2D2A26)' }}>{target.name}</strong>{' '}
                ({getVerticalLabel(target.vertical)}). Upgrade your other {unpaid.length - 1} listing{unpaid.length - 1 === 1 ? '' : 's'} from {unpaid.length - 1 === 1 ? 'its' : 'their'} card{unpaid.length - 1 === 1 ? '' : 's'} below.
              </p>
            )}
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontFamily: 'var(--font-body, system-ui)', fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Trust line: substance, never placement. */}
        <p style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 11.5, color: 'var(--color-muted, #8a8378)', margin: '16px 0 0', lineHeight: 1.5, opacity: 0.9 }}>
          Standard unlocks management, presence and insight — not placement. Your ranking is never for sale.
        </p>
      </div>
    </div>
  )
}
