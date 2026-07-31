'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import LocalizedLink from '@/components/LocalizedLink'
import { subTypeLabel } from '@/lib/subTypeLabels'
import { getVerticalBadge, VERTICAL_ACCENTS, VERTICAL_CARD_TOKENS } from '@/lib/verticalUrl'
import { localizeVerticalKicker } from '@/lib/i18n/listingLabels'
import { Coffee, Wine, UtensilsCrossed, BedDouble, Mountain, Compass, Hammer, Landmark, ShoppingBag, Clock, BadgeCheck } from 'lucide-react'

const GOLD = 'var(--color-gold)'

const VERTICAL_ICONS = {
  fine_grounds: Coffee, sba: Wine, table: UtensilsCrossed, rest: BedDouble,
  field: Mountain, way: Compass, craft: Hammer, collection: Landmark,
  corner: ShoppingBag, found: Clock,
}

// ─────────────────────────────────────────────────────────────────
// The worked day as ONE ROW of slim panels — the 1×6 alternative to
// the flip-card grid. Hovering (or focusing, or tapping on touch) a
// panel expands it in place, easing the others aside, and the
// listing's own writing fades in. Below ~880px the row becomes a
// vertical accordion: collapsed bars that open on tap. Same data,
// same claimed corona + tick, same CTAs as the grid variant.
// ─────────────────────────────────────────────────────────────────
export default function HomeDayStrip({ day, regionsCount }) {
  const t = useTranslations('home')
  const locale = useLocale()
  const [openId, setOpenId] = useState(null)
  const touchRef = useRef(false)

  useEffect(() => {
    touchRef.current = window.matchMedia('(hover: none)').matches
  }, [])

  if (!day) return null
  const stops = day.stops || []

  const regionLinks = {
    itinerary: day.regionSlug ? `/itinerary?region=${day.regionSlug}` : '/itinerary',
    region: day.regionSlug ? `/regions/${day.regionSlug}` : null,
  }

  return (
    <div>
      {/* ── Masthead: the day's region, named ── */}
      <div style={{ maxWidth: '640px', marginBottom: '34px' }}>
        <p className="section-dateline" style={{ marginBottom: '14px' }}>
          {t('dayKicker')}
        </p>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400,
          fontSize: 'clamp(26px, 3.4vw, 44px)', color: 'var(--color-ink)', lineHeight: 1.1,
          margin: 0,
        }}>
          {t('dayTitle', { region: day.region })}
        </h2>
        <p className="mt-3" style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15.5px',
          color: 'var(--color-muted)', margin: '12px 0 0', lineHeight: 1.65, maxWidth: '58ch',
        }}>
          {t('dayIntroStrip')}
        </p>
      </div>

      {/* ── The six stops as one expanding row ── */}
      <ol className="day-strip" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {stops.map((stop, si) => {
          const tokens = VERTICAL_CARD_TOKENS[stop.vertical] || VERTICAL_CARD_TOKENS.portal
          const StopIcon = VERTICAL_ICONS[stop.vertical] || Compass
          const kind = subTypeLabel(stop.vertical, stop.sub_type) ||
            localizeVerticalKicker(stop.vertical, getVerticalBadge(stop.vertical), locale)
          const open = openId === stop.id
          return (
            <li
              key={stop.id}
              className={`day-strip-panel${open ? ' is-open' : ''}${stop.is_claimed ? ' is-claimed' : ''}`}
              style={{ background: tokens.bg, color: tokens.text }}
              onClick={() => { if (touchRef.current) setOpenId(open ? null : stop.id) }}
            >
              {stop.hero_image_url && (
                <>
                  {/* A dead image URL falls back to the typographic
                      ground rather than a broken-image glyph. */}
                  <img
                    src={stop.hero_image_url}
                    alt=""
                    loading="lazy"
                    className="day-strip-photo"
                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                  />
                  <span aria-hidden="true" className="day-strip-scrim" />
                </>
              )}
              <span aria-hidden="true" className="day-strip-star">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6L12 0z" />
                </svg>
              </span>
              <div className="day-strip-top">
                <span className="day-flip-num" aria-hidden="true">{si + 1}</span>
                <span className="day-strip-slot">{t(stop.labelKey)}</span>
                {stop.is_claimed && (
                  <span
                    className="day-claimed-chip"
                    role="img"
                    aria-label={t('dayClaimedChip')}
                    title={t('dayClaimedChip')}
                  >
                    <BadgeCheck size={14} strokeWidth={2.2} aria-hidden="true" />
                  </span>
                )}
              </div>
              <div className="day-strip-foot">
                <h3 className="day-strip-name">{stop.name}</h3>
                <p className="day-strip-kind">
                  <StopIcon size={12} strokeWidth={1.8} aria-hidden="true" />
                  {[kind, stop.suburb].filter(Boolean).join(' · ')}
                </p>
                {/* The listing's own writing, revealed by the expansion.
                    Verbatim, clamped, never rewritten. */}
                <div className="day-strip-more">
                  <p className="day-strip-desc">{stop.description}</p>
                  <LocalizedLink href={`/place/${stop.slug}`} className="day-strip-link">
                    {t('dayViewListing')} <span aria-hidden="true">&rarr;</span>
                  </LocalizedLink>
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      {/* ── The close: build your own, see the region, the claim aside ── */}
      <div className="flex flex-wrap items-center justify-between" style={{ gap: '18px', marginTop: '30px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <LocalizedLink href={regionLinks.itinerary} className="trail-cta">
            <svg className="trail-cta-route" width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="4.6" cy="19.2" r="2" fill="#C49A3C" opacity="0.85" />
              <path
                className="trail-cta-line"
                d="M6.4 17.4 C 10.8 13.6, 8.2 10.2, 12.6 8.2 C 15.6 6.8, 17.2 8.6, 18.4 5.8"
                stroke="#C49A3C" strokeWidth="1.6" strokeLinecap="round"
              />
              <circle cx="19" cy="4.4" r="2.7" fill="#C49A3C" />
              <circle cx="19" cy="4.4" r="1" fill="#1C1A17" />
            </svg>
            {t('tripBuildYourOwn')}
            <svg className="trail-cta-arrow" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14" />
              <path d="M12 5l7 7-7 7" />
            </svg>
          </LocalizedLink>
          {regionLinks.region && (
            <LocalizedLink href={regionLinks.region} className="hover:opacity-80 transition-opacity" style={{
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px',
              color: 'var(--color-ink)', borderBottom: '1px solid var(--color-gold)', paddingBottom: 1,
            }}>
              {t('clusterSeeRegion')} <span style={{ color: GOLD }}>&rarr;</span>
            </LocalizedLink>
          )}
          <LocalizedLink href="/regions" className="hover:opacity-80 transition-opacity" style={{
            fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px',
            color: 'var(--color-ink)', borderBottom: '1px solid var(--color-gold)', paddingBottom: 1,
          }}>
            {regionsCount ? t('dayOneOfMany', { count: regionsCount }) : t('clusterAllRegions')} <span style={{ color: GOLD }}>&rarr;</span>
          </LocalizedLink>
        </div>

        {/* The quiet sell: the gold-ringed panels above are operator-
            managed listings; here is where an operator starts. */}
        <LocalizedLink href="/for-venues" className="day-claim-aside hover:opacity-80 transition-opacity">
          <BadgeCheck size={13} strokeWidth={2} aria-hidden="true" style={{ color: GOLD, flexShrink: 0 }} />
          {t('dayClaimAside')}
        </LocalizedLink>
      </div>
    </div>
  )
}
