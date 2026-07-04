'use client'
import { useTranslations, useLocale } from 'next-intl'
import { getVerticalBadge, getVerticalBrandColour, VERTICAL_CARD_BG } from '@/lib/verticalUrl'
import { SUB_TYPE_LABELS } from '@/lib/subTypeLabels'
import { localizeSubcategory } from '@/lib/i18n/listingLabels'

const GOLD = '#c8943a'

/**
 * The selected-venue card — replaces the stock Mapbox popup on /map.
 *
 * variant 'anchored': rendered into a Mapbox marker element (portal), so the
 *   map engine keeps it glued to the pin through pan/zoom. A small diamond
 *   tip points back at the pin.
 * variant 'docked': fixed to the bottom of the viewport on mobile — the
 *   Google Maps pattern; the map stays pannable behind it.
 */
export default function MapPreviewCard({ listing, meta, variant = 'anchored', onClose, onVisit, inTrail = false, onAddToTrail = null }) {
  const t = useTranslations('map')
  const locale = useLocale()
  const color = getVerticalBrandColour(listing.vertical) || '#5f8a7e'
  const ground = VERTICAL_CARD_BG[listing.vertical] || '#0f0e0c'
  const subTypes = SUB_TYPE_LABELS[listing.vertical] || {}
  // Localize the subcategory tag on /ko (English is byte-identical): resolve the
  // raw sub_type to a Korean label, falling back to the curated English label.
  const enSubLabel = subTypes[listing.sub_type] || null
  const subLabel = enSubLabel ? localizeSubcategory(listing.sub_type, enSubLabel, locale) : null
  const locality = [meta?.suburb || listing.region, listing.state].filter(Boolean).join(', ')
  const desc = listing.description
    ? (listing.description.length > 130 ? listing.description.slice(0, 130).trimEnd() + '…' : listing.description)
    : ''
  const image = meta?.image || null

  return (
    <div
      role="dialog"
      aria-label={listing.name}
      style={{
        width: variant === 'anchored' ? 296 : '100%',
        background: '#FBF9F4',
        borderRadius: 12,
        border: '1px solid rgba(28,26,23,0.10)',
        boxShadow: '0 10px 34px rgba(28,26,23,0.18)',
        overflow: 'hidden',
        position: 'relative',
        fontFamily: 'var(--font-sans)',
        pointerEvents: 'auto',
      }}
    >
      {/* Image, or a typographic ground band in the vertical's dark colour */}
      {image ? (
        <div style={{ height: 128, background: '#EFE9E1' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
      ) : (
        <div style={{
          height: 44, background: ground, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 8,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#FAF8F4', opacity: 0.92 }}>
            {getVerticalBadge(listing.vertical)}{subLabel ? ` — ${subLabel}` : ''}
          </span>
          {listing.is_featured && <span style={{ marginLeft: 'auto', color: GOLD, fontSize: 11 }}>★</span>}
        </div>
      )}

      <button onClick={onClose} aria-label={t('close')} style={{
        position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%',
        background: 'rgba(251,249,244,0.94)', border: '1px solid rgba(28,26,23,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        boxShadow: '0 1px 5px rgba(0,0,0,0.12)',
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B6760" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>

      <div style={{ padding: '11px 14px 13px' }}>
        {image && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, background: `${color}16`,
              border: `1px solid ${color}30`, padding: '2px 8px', borderRadius: 3,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color }}>
                {getVerticalBadge(listing.vertical)}{subLabel ? ` · ${subLabel}` : ''}
              </span>
            </span>
            {listing.is_featured && (
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: GOLD }}>★ {t('featured')}</span>
            )}
          </div>
        )}
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, lineHeight: 1.2, color: 'var(--color-ink)', letterSpacing: '-0.01em' }}>
          {listing.name}
        </div>
        {locality && (
          <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 3 }}>
            {locality}
            {meta?.editors_pick && <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}> · {t('editorsPick')}</span>}
          </div>
        )}
        {desc && (
          <div style={{ fontSize: 12, lineHeight: 1.5, color: '#5a544b', marginTop: 7 }}>{desc}</div>
        )}
        <div style={{ display: 'flex', gap: 7, marginTop: 11 }}>
          <a
            href={`/place/${listing.slug}`}
            onClick={() => onVisit?.(listing)}
            style={{
              flex: 1, display: 'block', padding: '8px 0', textAlign: 'center',
              background: 'var(--color-ink)', color: 'var(--color-cream)', textDecoration: 'none',
              fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', borderRadius: 6,
            }}
          >
            {t('viewListing')} →
          </a>
          {onAddToTrail && (
            <button
              onClick={() => onAddToTrail(listing)}
              style={{
                flex: 1, padding: '8px 0', textAlign: 'center', cursor: 'pointer',
                background: inTrail ? 'rgba(95,138,126,0.12)' : '#fff',
                border: '1px solid #5f8a7e', color: '#4a6e63', borderRadius: 6,
                fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
                fontFamily: 'var(--font-sans)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
            >
              {inTrail
                ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>{t('trailOnTrail')}</>
                : <>＋ {t('trailAddShort')}</>}
            </button>
          )}
        </div>
      </div>

      {variant === 'anchored' && (
        <span aria-hidden="true" style={{
          position: 'absolute', left: '50%', bottom: -6, width: 12, height: 12,
          transform: 'translateX(-50%) rotate(45deg)',
          background: '#FBF9F4', borderRight: '1px solid rgba(28,26,23,0.10)', borderBottom: '1px solid rgba(28,26,23,0.10)',
          boxShadow: '3px 3px 6px rgba(28,26,23,0.06)',
        }} />
      )}
    </div>
  )
}
