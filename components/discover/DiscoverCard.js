'use client'

import Link from 'next/link'
import { VERTICAL_CARD_TOKENS, VERTICAL_ACCENTS } from '@/lib/verticalUrl'

/** First sentence of the description, trimmed to a hook length. */
function getHook(text) {
  if (!text) return ''
  const match = text.match(/^(.+?[.!?])(\s|$)/)
  const first = match ? match[1] : text
  if (first.length > 150) return first.slice(0, 150).trim() + '…'
  return first
}

/**
 * DiscoverCard — the floating, vertical-tinted card. Purely presentational;
 * the deck owns gestures, advancement, and the action row. Each card inherits
 * its vertical's typographic-card tint (the same tokens unclaimed cards use),
 * so moving through the deck reads as moving through the ten verticals.
 *
 * Props:
 *   listing  – { name, slug, vertical, description, suburb, region, state }
 *   variant  – 'fullscreen' | 'band'
 *   hint     – true when rendered as the faint next-card behind the active one
 */
export default function DiscoverCard({ listing, variant = 'fullscreen', hint = false }) {
  const tokens = VERTICAL_CARD_TOKENS[listing.vertical] || VERTICAL_CARD_TOKENS.portal
  const accent = VERTICAL_ACCENTS[listing.vertical] || tokens.bg
  const hook = getHook(listing.description)
  const breadcrumb = [listing.suburb, listing.region, listing.state].filter(Boolean).join(' · ')
  const initial = (listing.name || '?').trim()[0]?.toUpperCase() || '?'

  return (
    <article
      className={`dd-card${variant === 'band' ? ' dd-card--band' : ''}`}
      style={{ background: tokens.bg, color: tokens.text }}
      aria-hidden={hint ? 'true' : undefined}
    >
      {/* Dot-grid texture — network-consistent (matches TypographicCard). */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `radial-gradient(circle, ${tokens.text} 1px, transparent 1px)`,
          backgroundSize: '16px 16px',
          opacity: 0.06,
          pointerEvents: 'none',
        }}
      />

      {/* Quiet watermark initial. */}
      <span className="dd-watermark" style={{ color: tokens.text, opacity: 0.07 }} aria-hidden="true">
        {initial}
      </span>

      <div className="dd-card-body">
        <span className="dd-tag" style={{ background: accent, color: '#fff' }}>
          {tokens.label}
        </span>

        <h2 className="dd-name">{listing.name}</h2>

        {hook && <p className="dd-hook">{hook}</p>}

        {breadcrumb && <p className="dd-breadcrumb">{breadcrumb}</p>}

        {/* View listing — opens the portal detail page. Disabled visually on
            the hinted card so it isn't a tab target behind the active card. */}
        {!hint ? (
          <Link
            href={`/place/${listing.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="dd-view"
            style={{ color: tokens.text }}
          >
            View listing
            <svg className="dd-view-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="M12 5l7 7-7 7" />
            </svg>
          </Link>
        ) : (
          <span className="dd-view" style={{ color: tokens.text }} aria-hidden="true">View listing</span>
        )}
      </div>
    </article>
  )
}
