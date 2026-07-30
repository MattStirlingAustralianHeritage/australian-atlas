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

// Every capability named in the pitch below is one an unpaid claim genuinely
// cannot reach, each behind isListingPaid on the server:
//   own photograph, gallery, video   → app/api/dashboard/listing/route.js
//                                      (anything outside FREE_TIER_FIELDS),
//                                      lib/listing-gallery.js
//   your account of what you make    → app/api/dashboard/description/route.js
//   offers and awards                → app/api/dashboard/offers|awards/route.js
//   who is searching for you         → app/api/dashboard/demand/route.js
//
// Two claims that used to sit here were NOT paid features and have been cut:
// editing website / phone / opening hours is FREE_TIER_FIELDS, and Listing
// Insights (/api/dashboard/stats) has no paid gate at all. Selling what the
// free claim already includes is worse than selling nothing. Anything added
// here must be traceable to a gate in the list above.

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
          {/* Left: the pitch */}
          <div style={{ flex: '1 1 300px', minWidth: 260 }}>
            <h2 style={{
              fontFamily: 'var(--font-display, Georgia)', fontWeight: 400,
              fontSize: 'clamp(1.35rem, 2.6vw, 1.7rem)', lineHeight: 1.15,
              color: 'var(--color-ink, #2D2A26)', margin: '0 0 8px',
            }}>
              Your listing, in your words
            </h2>
            <p style={{
              fontFamily: 'var(--font-body, system-ui)', fontSize: 14, fontWeight: 300,
              lineHeight: 1.6, color: 'var(--color-muted, #6f695f)', margin: 0, maxWidth: 460,
            }}>
              A free claim keeps your facts right. Website, phone, opening hours. Standard is where the
              listing becomes yours: your own photograph in place of the type card, a gallery and video,
              your account of what you make, your offers and awards, and the data on who is searching for you.
            </p>
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
