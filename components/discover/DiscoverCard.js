'use client'

import { useState, useMemo } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import Link from 'next/link'
import { VERTICAL_CARD_TOKENS, VERTICAL_ACCENTS } from '@/lib/verticalUrl'
import { localizeVerticalKicker, localizeSubcategory } from '@/lib/i18n/listingLabels'
import { getCardImage } from '@/lib/discover/cardImage'
import { buildContours } from '@/lib/discover/contours'
import OptimizedImage from '@/components/OptimizedImage'

/* ── Terrain motif — seeded topographic contours, unique per listing ──
   The Atlas is a typographic network (heroes are rare), so the tinted card IS
   the composition. Contour lines seeded from the listing id give every place
   its own quiet "terrain" — shared generator in lib/discover/contours.js. */

function TerrainMotif({ seed, color }) {
  const rings = useMemo(() => buildContours(String(seed)), [seed])
  return (
    <svg
      className="dd-terrain"
      viewBox="0 0 420 460"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {rings.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={color} strokeWidth="1" strokeOpacity={0.085} />
      ))}
    </svg>
  )
}

/** First sentence of the description, trimmed to a hook length. */
function getHook(text) {
  if (!text) return ''
  const match = text.match(/^(.+?[.!?])(\s|$)/)
  const first = match ? match[1] : text
  if (first.length > 150) return first.slice(0, 150).trim() + '…'
  return first
}

/** sub_type → a readable category label (native data, no AI). */
function formatCategory(subType) {
  if (!subType) return ''
  return subType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** #rrggbb → rgba(), for the vertical-tinted photo scrim. */
function tint(hex, alpha) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

const PRESENCE_KEYS = {
  by_appointment: 'presenceByAppointment',
  markets: 'presenceMarkets',
  mobile: 'presenceMobile',
  online: 'presenceOnline',
  seasonal: 'presenceSeasonal',
}

/**
 * DiscoverCard — the floating card. Photography-first: when the listing's hero
 * passes the standard image gates (approved host + moderation veto, via
 * getCardImage) it renders full-bleed under a vertical-tinted scrim; otherwise
 * the typographic tinted card renders (watermark initial + dot grid). Purely
 * presentational apart from a self-contained "More" info panel that reveals
 * the listing's own fields — native data only, no AI. The deck owns gestures,
 * advancement, and the action row.
 *
 * Props:
 *   listing  – { name, slug, vertical, sub_type, description, suburb, region,
 *                state, hero_image_url?, image_moderation_status?, presence_type? }
 *   variant  – 'fullscreen' | 'band'
 *   hint     – true when rendered as a faint next-card behind the active one
 */
export default function DiscoverCard({ listing, variant = 'fullscreen', hint = false }) {
  const t = useTranslations('discover')
  const locale = useLocale()
  const [showInfo, setShowInfo] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)
  const tokens = VERTICAL_CARD_TOKENS[listing.vertical] || VERTICAL_CARD_TOKENS.portal
  const kicker = localizeVerticalKicker(listing.vertical, tokens.label, locale)
  const accent = VERTICAL_ACCENTS[listing.vertical] || tokens.bg
  const hook = getHook(listing.description)
  const locParts = [listing.suburb, listing.region, listing.state]
    .filter(Boolean)
    .filter((p, i, arr) => i === 0 || p.toLowerCase() !== arr[i - 1].toLowerCase())
  const breadcrumb = locParts.join(' · ')
  const initial = (listing.name || '?').trim()[0]?.toUpperCase() || '?'
  // Localize the subcategory shown in the info panel on /ko (English is
  // byte-identical): Korean label for the raw sub_type, else the English one.
  const category = localizeSubcategory(listing.sub_type, formatCategory(listing.sub_type), locale)
  const presence = listing.presence_type && listing.presence_type !== 'permanent'
    ? (PRESENCE_KEYS[listing.presence_type] ? t(PRESENCE_KEYS[listing.presence_type]) : null)
    : null
  const photo = !imgFailed ? getCardImage(listing) : null

  // Offer "More" only when there's genuinely more than the hook (or a category
  // worth surfacing). Never on the faint hint card.
  const hasMore = !hint && (
    !!category ||
    !!presence ||
    (!!listing.description && listing.description.trim().length > hook.length + 8)
  )

  return (
    <article
      className={[
        'dd-card',
        variant === 'band' ? 'dd-card--band' : '',
        photo ? 'dd-card--photo' : '',
        !hint ? 'dd-enter' : '',
      ].filter(Boolean).join(' ')}
      style={{ background: tokens.bg, color: tokens.text }}
      aria-hidden={hint ? 'true' : undefined}
    >
      {photo ? (
        <>
          {/* Full-bleed hero. Decorative (name is the heading below); Supabase
              sources ride next/image → AVIF/WebP resized to the card, external
              approved hosts pass through. A dead source falls back to the
              typographic card via onFinalError. */}
          <OptimizedImage
            src={photo}
            alt=""
            className="dd-photo"
            sizes="(max-width: 480px) 92vw, 420px"
            priority={!hint}
            draggable={false}
            onFinalError={() => setImgFailed(true)}
          />
          {/* Vertical-tinted scrim: brand ground rises from the base so the
              type sits in the vertical's colour, photo breathing above. */}
          <div
            className="dd-photo-scrim"
            aria-hidden="true"
            style={{
              background: [
                `linear-gradient(to top, ${tint(tokens.bg, 0.96)} 0%, ${tint(tokens.bg, 0.82)} 26%, ${tint(tokens.bg, 0.35)} 52%, rgba(12, 10, 8, 0.08) 72%, rgba(12, 10, 8, 0.18) 100%)`,
              ].join(', '),
            }}
          />
        </>
      ) : (
        <>
          {/* Dot-grid texture — network-consistent (matches TypographicCard). */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `radial-gradient(circle, ${tokens.text} 1px, transparent 1px)`,
              backgroundSize: '16px 16px',
              opacity: 0.045,
              pointerEvents: 'none',
            }}
          />

          {/* This place's own terrain — seeded contour lines, atlas motif. */}
          <TerrainMotif seed={listing.id || listing.slug} color={tokens.text} />

          {/* Soft cartographic lighting: a high corner glow + grounded base. */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'radial-gradient(110% 90% at 18% 0%, rgba(255,252,245,0.10) 0%, rgba(255,252,245,0.03) 38%, transparent 60%), linear-gradient(to top, rgba(10, 8, 6, 0.22) 0%, transparent 42%)',
              pointerEvents: 'none',
            }}
          />

          {/* Quiet watermark initial. */}
          <span className="dd-watermark" style={{ color: tokens.text, opacity: 0.07 }} aria-hidden="true">
            {initial}
          </span>
        </>
      )}

      {hasMore && (
        <button
          type="button"
          className="dd-more-tab"
          onClick={() => setShowInfo(true)}
          aria-label={t('moreAbout', { name: listing.name })}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5" /><path d="M12 8h.01" />
          </svg>
          {t('more')}
        </button>
      )}

      <div className={`dd-card-body${photo ? ' dd-card-body--photo' : ''}`}>
        <span className="dd-tag" style={{ background: accent, color: '#fff' }}>
          {kicker}
        </span>

        <h2 className="dd-name">{listing.name}</h2>

        {hook && <p className="dd-hook">{hook}</p>}

        {breadcrumb && <p className="dd-breadcrumb">{breadcrumb}</p>}

        {/* View listing — opens the portal detail page. */}
        {!hint ? (
          <Link
            href={`/place/${listing.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="dd-view"
            style={{ color: tokens.text }}
          >
            {t('viewListing')}
            <svg className="dd-view-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="M12 5l7 7-7 7" />
            </svg>
          </Link>
        ) : (
          <span className="dd-view" style={{ color: tokens.text }} aria-hidden="true">{t('viewListing')}</span>
        )}
      </div>

      {/* Info panel — the listing's own fields, no AI. */}
      {showInfo && !hint && (
        <div className="dd-info-panel" style={{ color: tokens.text }}>
          <button type="button" className="dd-info-close" onClick={() => setShowInfo(false)} aria-label={t('closeDetails')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
          {category && <p className="dd-info-cat">{kicker} · {category}</p>}
          {!category && <p className="dd-info-cat">{kicker}</p>}
          <h3 className="dd-info-name">{listing.name}</h3>
          <p className="dd-info-desc">{listing.description}</p>
          <div className="dd-info-meta">
            {breadcrumb && <span className="dd-info-row">{breadcrumb}</span>}
            {presence && <span className="dd-info-row">{presence}</span>}
          </div>
        </div>
      )}
    </article>
  )
}
