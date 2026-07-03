'use client'

import { useTranslations, useLocale } from 'next-intl'
import { TypographicCard, VERTICAL_TOKENS } from '@/components/ListingCard'
import VerticalBadge, { VERTICAL_STYLES } from '@/components/VerticalBadge'
import { isApprovedImageSource, isHeroDisplayable } from '@/lib/image-utils'
import { getListingRegion } from '@/lib/regions'
import { VERTICAL_MUTED } from '@/lib/verticalUrl'
import { localizeVerticalKicker, localizeSubcategory } from '@/lib/i18n/listingLabels'

// ============================================================
// SearchResultCard — the search-surface result unit.
//
// Search needs more information scent than the site-wide ListingCard
// (which is a pure visual tile): every result here carries its category,
// locality, a query-highlighted description snippet, cross-atlas chips
// and distance — the data a searcher scans before committing to a click.
// Three variants share one data contract:
//   grid    — media tile + info block (the default results grid)
//   list    — ranked editorial index row (fast vertical scanning)
//   compact — tight row for the map split-view column
// ============================================================

// Significant query terms (drop short/stop-ish words) for snippet matching.
export function queryTerms(q) {
  return [...new Set((q || '').toLowerCase().match(/[a-z0-9]{3,}/g) || [])]
}

// Build a description excerpt CENTRED on the first matching query term, so a
// match in sentence 3 isn't hidden behind the opening chars.
export function buildSnippet(desc, terms, maxLen = 170) {
  const text = (desc || '').trim()
  if (!text) return ''
  let firstIdx = -1
  if (terms.length) {
    const lower = text.toLowerCase()
    for (const t of terms) {
      const i = lower.indexOf(t)
      if (i >= 0 && (firstIdx < 0 || i < firstIdx)) firstIdx = i
    }
  }
  if (firstIdx <= maxLen - 40) {
    return text.length > maxLen ? text.slice(0, maxLen).replace(/\s+\S*$/, '') + '…' : text
  }
  let start = Math.max(0, firstIdx - 60)
  const sp = text.indexOf(' ', start)
  if (sp >= 0 && sp < start + 20) start = sp + 1
  let out = text.slice(start, start + maxLen)
  if (start + maxLen < text.length) out = out.replace(/\s+\S*$/, '') + '…'
  return '…' + out
}

// Render a snippet with matched terms bolded (terms are [a-z0-9]+ → regex-safe).
export function highlightTerms(text, terms) {
  if (!text || !terms.length) return text
  const re = new RegExp('(' + terms.join('|') + ')', 'ig')
  return text.split(re).map((part, i) =>
    terms.includes(part.toLowerCase())
      ? <strong key={i} style={{ fontWeight: 600, color: 'var(--color-ink)', opacity: 1 }}>{part}</strong>
      : part
  )
}

function fmtCategory(cat) {
  if (!cat) return null
  return String(cat).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDistance(km) {
  if (km == null || !isFinite(km)) return null
  if (km < 1) return `${Math.max(50, Math.round(km * 1000 / 50) * 50)} m`
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}

// De-duplicated "Suburb · Region · State" locality line.
function localityLine(listing) {
  const region = getListingRegion(listing)
  return [listing.suburb, region?.name, listing.state]
    .filter(Boolean)
    .filter((v, i, a) => a.findIndex((x) => String(x).toLowerCase() === String(v).toLowerCase()) === i)
    .join(' · ')
}

// Small cross-atlas chips: "Also in Craft" etc (data: also_in from dedupe).
function AlsoInChips({ alsoIn }) {
  const t = useTranslations('search')
  const locale = useLocale()
  if (!Array.isArray(alsoIn) || alsoIn.length === 0) return null
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {alsoIn.map((v) => {
        const vs = VERTICAL_STYLES[v]
        if (!vs) return null
        const vsLabel = localizeVerticalKicker(v, vs.label, locale)
        return (
          <span key={v} title={t('alsoListedIn', { atlas: vsLabel })} style={{
            fontFamily: 'var(--font-body)', fontSize: 9.5, fontWeight: 600,
            letterSpacing: '0.04em', padding: '2px 7px', borderRadius: 100,
            background: vs.bg, color: vs.text, whiteSpace: 'nowrap',
          }}>
            +{vsLabel}
          </span>
        )
      })}
    </span>
  )
}

function DistanceChip({ km, inline = false }) {
  const t = useTranslations('search')
  const label = formatDistance(km)
  if (!label) return null
  return (
    <span
      title={t('distanceAway', { distance: label })}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: inline ? '1px 7px 1px 5px' : '4px 9px 4px 7px', borderRadius: 100,
        background: inline ? 'var(--color-cream)' : 'rgba(255,255,255,0.92)',
        ...(inline ? { border: '1px solid var(--color-border)' } : {
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.06)',
        }),
        fontFamily: 'var(--font-body)', fontSize: '10.5px', fontWeight: 600,
        letterSpacing: '0.01em', color: '#2A2925', lineHeight: 1.5, whiteSpace: 'nowrap',
      }}
    >
      <svg width="10" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="var(--color-accent, #C4603A)" />
        <circle cx="12" cy="9" r="2.6" fill="#fff" />
      </svg>
      {label}
    </span>
  )
}

// Square typographic thumbnail for list/compact rows — vertical ground with a
// display-serif initial (the network's ghost-initial device at stamp size).
function ThumbSquare({ listing, size = 76 }) {
  const tokens = VERTICAL_TOKENS[listing.vertical] || VERTICAL_TOKENS.portal
  const hasImg = listing.hero_image_url && isApprovedImageSource(listing.hero_image_url) && isHeroDisplayable(listing)
  if (hasImg) {
    return (
      <div style={{ width: size, height: size, borderRadius: 'var(--radius-sm)', overflow: 'hidden', flexShrink: 0 }}>
        <img src={listing.hero_image_url} alt="" loading="lazy" decoding="async"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    )
  }
  return (
    <div aria-hidden="true" style={{
      width: size, height: size, borderRadius: 'var(--radius-sm)', flexShrink: 0,
      background: tokens.bg, color: tokens.text, position: 'relative', overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `radial-gradient(circle, ${tokens.text} 1px, transparent 1px)`,
        backgroundSize: '12px 12px', opacity: 0.1, pointerEvents: 'none',
      }} />
      <span style={{
        fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 400,
        fontSize: size * 0.5, lineHeight: 1, opacity: 0.9, userSelect: 'none',
      }}>
        {(listing.name || '?').trim().charAt(0).toUpperCase()}
      </span>
    </div>
  )
}

function CurationBadge({ listing, overlay = false }) {
  const t = useTranslations('search')
  const isSelect = listing.editors_pick
  const isFeat = !isSelect && listing.is_featured && listing.is_claimed
  if (!isSelect && !isFeat) return null
  return (
    <span style={{
      ...(overlay ? { position: 'absolute', top: 10, right: 10, zIndex: 3 } : {}),
      fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 500,
      padding: '3px 9px', borderRadius: 100, color: '#fff', whiteSpace: 'nowrap',
      background: isSelect ? 'var(--color-ink)' : 'var(--color-accent)',
    }}>
      {isSelect ? t('atlasSelect') : t('featured')}
    </span>
  )
}

/**
 * @param {object} props
 * @param {object} props.listing — search row (hybrid RPC shape + also_in)
 * @param {string} props.query — current query (snippet highlighting)
 * @param {number|null} props.distanceKm
 * @param {'grid'|'list'|'compact'} props.variant
 * @param {number|null} props.rank — 1-based rank shown in list variant
 * @param {boolean} props.active — hover-synced with the map pin
 * @param {(id: string|null) => void} props.onHover
 * @param {() => void} props.onClick — click tracking (never blocks navigation)
 */
export default function SearchResultCard({
  listing, query = '', distanceKm = null,
  variant = 'grid', rank = null, active = false,
  onHover, onClick,
}) {
  const locale = useLocale()
  const tokens = VERTICAL_TOKENS[listing.vertical] || VERTICAL_TOKENS.portal
  const muted = VERTICAL_MUTED[listing.vertical] || 'var(--color-muted)'
  // Localize the subcategory eyebrow on /ko (English is byte-identical): resolve
  // the raw sub_type to a Korean label, falling back to fmtCategory()'s English.
  const category = localizeSubcategory(listing.sub_type, fmtCategory(listing.sub_type), locale)
  const loc = localityLine(listing)
  const terms = queryTerms(query)
  const snippet = buildSnippet(listing.description, terms, variant === 'grid' ? 150 : 170)
  const hoverProps = onHover
    ? { onMouseEnter: () => onHover(listing.id), onMouseLeave: () => onHover(null) }
    : {}

  // ── List + compact: editorial index rows ─────────────────────────────────
  if (variant === 'list' || variant === 'compact') {
    const compact = variant === 'compact'
    return (
      <a
        href={`/place/${listing.slug}`}
        {...(onClick ? { onClick } : {})}
        {...hoverProps}
        className="group block"
        data-listing-id={listing.id}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: compact ? 12 : 16,
          padding: compact ? '10px 10px' : '16px 14px',
          borderRadius: 'var(--radius-card)',
          border: active ? '1px solid var(--color-gold)' : '1px solid transparent',
          background: active ? '#fff' : 'transparent',
          boxShadow: active ? 'var(--shadow-sm)' : 'none',
          textDecoration: 'none',
          transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
        }}
      >
        {rank != null && !compact && (
          <span aria-hidden="true" style={{
            fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 400,
            fontSize: 15, color: 'var(--color-muted)', opacity: 0.7,
            minWidth: 24, textAlign: 'right', paddingTop: 4, flexShrink: 0,
          }}>
            {rank}
          </span>
        )}
        <ThumbSquare listing={listing} size={compact ? 54 : 76} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <h3 className="group-hover:underline" style={{
              fontFamily: 'var(--font-display)', fontWeight: 400,
              fontSize: compact ? 15.5 : 19, lineHeight: 1.22,
              color: 'var(--color-ink)', margin: 0,
              textUnderlineOffset: 3, textDecorationThickness: 1,
            }}>
              {listing.name}
            </h3>
            <CurationBadge listing={listing} />
          </div>
          {(category || loc) && (
            <p style={{
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: compact ? 10 : 11,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              color: muted, margin: '4px 0 0', lineHeight: 1.45,
              overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: compact ? 'nowrap' : 'normal',
            }}>
              {[category, loc].filter(Boolean).join('  ·  ')}
            </p>
          )}
          {!compact && snippet && (
            <p style={{
              fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 13.5,
              color: 'var(--color-ink)', opacity: 0.78, margin: '7px 0 0', lineHeight: 1.55,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {highlightTerms(snippet, terms)}
            </p>
          )}
          {(compact || (listing.also_in && listing.also_in.length > 0)) && (
            <p style={{ margin: compact ? '5px 0 0' : '8px 0 0', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {compact && <DistanceChip km={distanceKm} inline />}
              <AlsoInChips alsoIn={listing.also_in} />
            </p>
          )}
        </div>
        {!compact && (
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, paddingTop: 4 }}>
            <VerticalBadge vertical={listing.vertical} size="sm" />
            <DistanceChip km={distanceKm} inline />
          </div>
        )}
      </a>
    )
  }

  // ── Grid: media tile + info block ────────────────────────────────────────
  const hasImg = listing.hero_image_url && isApprovedImageSource(listing.hero_image_url) && isHeroDisplayable(listing)
  return (
    <a
      href={`/place/${listing.slug}`}
      {...(onClick ? { onClick } : {})}
      {...hoverProps}
      className="group listing-card block overflow-hidden"
      data-listing-id={listing.id}
      style={{
        borderRadius: 'var(--radius-card)',
        border: active ? '1px solid var(--color-gold)' : '0.5px solid var(--color-border)',
        background: '#fff', position: 'relative', textDecoration: 'none',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ position: 'relative' }}>
        {hasImg ? (
          <div style={{ aspectRatio: '16/10', overflow: 'hidden', position: 'relative' }}>
            <img
              src={listing.hero_image_url} alt={listing.name} loading="lazy" decoding="async"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, transparent 45%)',
            }} />
          </div>
        ) : (
          <TypographicCard
            name={listing.name}
            vertical={listing.vertical}
            category={listing.sub_type}
            region={getListingRegion(listing)?.name}
            state={listing.state}
            aspectRatio="16/10"
            showVerticalTag={true}
            mobile={listing.presence_type === 'mobile'}
            locale={locale}
          />
        )}
        <CurationBadge listing={listing} overlay />
        <div style={{ position: 'absolute', bottom: 10, left: 10, zIndex: 3 }}>
          <VerticalBadge vertical={listing.vertical} size="sm" />
        </div>
        {distanceKm != null && (
          <div style={{ position: 'absolute', bottom: 10, right: 10, zIndex: 3 }}>
            <DistanceChip km={distanceKm} />
          </div>
        )}
      </div>

      <div style={{ padding: '0.85rem 1rem 1rem', flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {hasImg && (
          <h3 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 18,
            lineHeight: 1.22, color: 'var(--color-ink)', margin: '0 0 5px',
          }}>
            {listing.name}
          </h3>
        )}
        {(category || loc) && (
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 10.5,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            color: muted, margin: 0, lineHeight: 1.5,
          }}>
            {[category, loc].filter(Boolean).join('  ·  ')}
          </p>
        )}
        {snippet && (
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 13,
            color: 'var(--color-ink)', opacity: 0.78, margin: '7px 0 0', lineHeight: 1.55,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {highlightTerms(snippet, terms)}
          </p>
        )}
        {listing.also_in && listing.also_in.length > 0 && (
          <p style={{ margin: '9px 0 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <AlsoInChips alsoIn={listing.also_in} />
          </p>
        )}
      </div>
    </a>
  )
}
