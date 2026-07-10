'use client'

// ─────────────────────────────────────────────────────────────────────────────
// DualListingPopup — a first-visit welcome that shows operators their listing
// lives in TWO places across the network.
//
// You manage a listing here on the PORTAL (Australian Atlas — the whole-network
// guide). The very same listing also has its own home on the standalone atlas
// for its category: a distillery on Small Batch Atlas, a bakery on Table Atlas,
// a roaster on Fine Grounds Atlas, and so on. It's one record — every edit made
// here on the dashboard flows through to the vertical site automatically. New
// operators don't realise this, so the first time they land on the dashboard we
// surface it, gently, once.
//
// Gating: shown once per operator (localStorage, keyed by user id). The vertical
// site is the listing's own source, so getVerticalUrl() always resolves to a
// live page — no 404 risk.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'
import {
  getVerticalLabel,
  getVerticalBadge,
  getVerticalTagline,
  getVerticalBrandColour,
  getVerticalUrl,
} from '@/lib/verticalUrl'

const SEEN_KEY_BASE = 'atlas:dashboard:two-homes-intro:v1'
const PORTAL_LABEL = 'Australian Atlas'
const PORTAL_COLOUR = 'var(--color-ink, #2D2A26)'

function lowerFirst(s) {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s
}

// Deep-link to the venue's page on its own vertical site. Fine Grounds splits
// roasters vs cafes, so pass the hint through when we have it.
function verticalHref(listing) {
  const meta = listing.sub_type === 'cafe' ? { entity_type: 'cafe' } : {}
  return getVerticalUrl(listing.vertical, listing.slug, meta)
}

function AtlasChip({ colour, label, solid = false }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 9px 3px 8px',
        borderRadius: 100,
        background: solid ? '#fff' : 'transparent',
        border: `1px solid ${solid ? 'var(--color-border, #e9e4da)' : 'transparent'}`,
        fontFamily: 'var(--font-body, system-ui)',
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'var(--color-ink, #2D2A26)',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: colour, flexShrink: 0 }} />
      {label}
    </span>
  )
}

// One connective row: the portal node linked to the vertical node, the venue's
// name, then a tappable link out to its listing on the vertical site.
function TwoHomesRow({ listing, onNavigate }) {
  const vertColour = getVerticalBrandColour(listing.vertical) || 'var(--color-sage, #5f8a7e)'

  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 10,
        background: 'var(--color-cream, #FAF8F5)',
        border: '1px solid var(--color-border, #e9e4da)',
      }}
    >
      {/* Node chain: Australian Atlas ─ [vertical] */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <AtlasChip colour={PORTAL_COLOUR} label={PORTAL_LABEL} solid />
        <span aria-hidden style={{ width: 16, height: 1, background: 'var(--color-border, #d9d2c6)' }} />
        <AtlasChip colour={vertColour} label={getVerticalBadge(listing.vertical)} />
      </div>

      <p
        style={{
          fontFamily: 'var(--font-body, system-ui)',
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--color-ink, #2D2A26)',
          margin: '0 0 8px',
          lineHeight: 1.4,
        }}
      >
        {listing.name}
      </p>

      <a
        href={verticalHref(listing)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNavigate}
        style={{
          fontFamily: 'var(--font-body, system-ui)',
          fontSize: 13,
          fontWeight: 500,
          color: vertColour,
          textDecoration: 'none',
          lineHeight: 1.35,
        }}
      >
        View on {getVerticalLabel(listing.vertical)} &rarr;
        <span
          style={{
            display: 'block',
            fontWeight: 400,
            fontSize: 11.5,
            color: 'var(--color-muted, #8a8378)',
            marginTop: 1,
          }}
        >
          {getVerticalTagline(listing.vertical)}
        </span>
      </a>
    </div>
  )
}

export default function DualListingPopup({ listings, userId }) {
  const [open, setOpen] = useState(false)

  // Every claimed listing lives in two places: here on the portal, and on the
  // standalone atlas for its category. Only include ones we can deep-link to
  // (skips any listing on an unknown/unconfigured vertical).
  const items = (listings || []).filter(
    (l) => l && l.vertical && l.slug && getVerticalUrl(l.vertical, l.slug) !== '#'
  )
  const count = items.length
  const seenKey = userId ? `${SEEN_KEY_BASE}:${userId}` : SEEN_KEY_BASE

  useEffect(() => {
    if (count === 0) return
    let seen = false
    try {
      seen = localStorage.getItem(seenKey) === '1'
    } catch {
      /* private mode / storage disabled — show once per mount rather than never */
    }
    if (!seen) setOpen(true)
  }, [count, seenKey])

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(seenKey, '1')
    } catch {
      /* ignore — dismissal still closes for this session */
    }
    setOpen(false)
  }, [seenKey])

  // Esc to close, like the network's other modals.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, dismiss])

  if (!open || count === 0) return null

  const single = count === 1 ? items[0] : null
  const glyphColour = single ? getVerticalBrandColour(single.vertical) || 'var(--color-sage, #5f8a7e)' : 'var(--color-sage, #5f8a7e)'

  // Copy adapts to one listing vs several.
  let heading
  let intro
  if (single) {
    const vertLabel = getVerticalLabel(single.vertical)
    heading = `${single.name} is on ${PORTAL_LABEL} and ${vertLabel}`
    intro = (
      <>
        You manage it here on <strong style={{ fontWeight: 600, color: 'var(--color-ink, #2D2A26)' }}>{PORTAL_LABEL}</strong>{' '}
        &mdash; our guide to independent places of every kind. The same listing also has its own home on{' '}
        <strong style={{ fontWeight: 600, color: 'var(--color-ink, #2D2A26)' }}>{vertLabel}</strong>, the dedicated guide
        to {lowerFirst(getVerticalTagline(single.vertical))}. It&rsquo;s a single listing &mdash; every edit you make here,
        from hours to photos, appears in both places automatically.
      </>
    )
  } else {
    heading = 'Each of your listings has two homes'
    intro = (
      <>
        You manage everything here on <strong style={{ fontWeight: 600, color: 'var(--color-ink, #2D2A26)' }}>{PORTAL_LABEL}</strong>{' '}
        &mdash; our guide to independent places of every kind. Each listing also has its own home on the atlas for its
        category. It&rsquo;s one set of details: every edit you make here appears in both places automatically.
      </>
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dual-listing-heading"
      onClick={dismiss}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(28,24,20,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <style>{`
        @keyframes dualListingRise {
          from { opacity: 0; transform: translateY(10px) scale(0.985); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .dual-listing-card { animation: none !important; }
        }
      `}</style>

      <div
        className="dual-listing-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          background: '#fff',
          borderRadius: 16,
          padding: '30px 26px 24px',
          maxWidth: 480,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 24px 60px rgba(28,24,20,0.28)',
          animation: 'dualListingRise 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* Close */}
        <button
          onClick={dismiss}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 30,
            height: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            borderRadius: 8,
            background: 'transparent',
            color: 'var(--color-muted, #8a8378)',
            cursor: 'pointer',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        {/* Network glyph — two linked nodes (portal + vertical) */}
        <div style={{ marginBottom: 16 }} aria-hidden>
          <svg width="44" height="26" viewBox="0 0 44 26" fill="none">
            <line x1="13" y1="13" x2="31" y2="13" stroke="var(--color-sage, #5f8a7e)" strokeWidth="1.5" />
            <circle cx="11" cy="13" r="7" fill="var(--color-ink, #2D2A26)" />
            <circle cx="33" cy="13" r="7" fill="#fff" stroke={glyphColour} strokeWidth="1.75" />
            <circle cx="33" cy="13" r="3" fill={glyphColour} />
          </svg>
        </div>

        {/* Eyebrow */}
        <p
          style={{
            fontFamily: 'var(--font-body, system-ui)',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--color-sage, #5f8a7e)',
            margin: '0 0 8px',
          }}
        >
          One listing, two homes
        </p>

        {/* Heading */}
        <h2
          id="dual-listing-heading"
          style={{
            fontFamily: 'var(--font-display, Georgia)',
            fontWeight: 400,
            fontSize: '1.5rem',
            lineHeight: 1.2,
            color: 'var(--color-ink, #2D2A26)',
            margin: '0 0 12px',
          }}
        >
          {heading}
        </h2>

        {/* Intro */}
        <p
          style={{
            fontFamily: 'var(--font-body, system-ui)',
            fontSize: 14,
            fontWeight: 300,
            lineHeight: 1.6,
            color: 'var(--color-muted, #6f695f)',
            margin: '0 0 18px',
          }}
        >
          {intro}
        </p>

        {/* Two-homes rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
          {items.map((listing) => (
            <TwoHomesRow key={listing.id} listing={listing} onNavigate={dismiss} />
          ))}
        </div>

        {/* Primary action */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
          {single && (
            <a
              href={verticalHref(single)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={dismiss}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '11px 18px',
                borderRadius: 8,
                background: 'var(--color-ink, #2D2A26)',
                color: '#fff',
                fontFamily: 'var(--font-body, system-ui)',
                fontSize: 13,
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              See it on {getVerticalLabel(single.vertical)} &rarr;
            </a>
          )}
          <button
            onClick={dismiss}
            style={{
              padding: '11px 20px',
              borderRadius: 8,
              background: 'transparent',
              color: 'var(--color-muted, #6f695f)',
              border: '1px solid var(--color-border, #e9e4da)',
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
