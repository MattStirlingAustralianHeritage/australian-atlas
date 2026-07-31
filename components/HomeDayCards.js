'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import LocalizedLink from '@/components/LocalizedLink'
import { subTypeLabel } from '@/lib/subTypeLabels'
import { getVerticalBadge, VERTICAL_ACCENTS, VERTICAL_CARD_TOKENS } from '@/lib/verticalUrl'
import { localizeVerticalKicker } from '@/lib/i18n/listingLabels'
import { Coffee, Wine, UtensilsCrossed, BedDouble, Mountain, Compass, Hammer, Landmark, ShoppingBag, Clock, BadgeCheck, Sunrise, Sun, SunMedium, SunDim, Sunset, Moon } from 'lucide-react'

const GOLD = 'var(--color-gold)'

const VERTICAL_ICONS = {
  fine_grounds: Coffee, sba: Wine, table: UtensilsCrossed, rest: BedDouble,
  field: Mountain, way: Compass, craft: Hammer, collection: Landmark,
  corner: ShoppingBag, found: Clock,
}

// Where the sun sits at each slot: the day's clock, drawn instead of
// told. Rides on the cards' time labels and anchors the rail above
// the grid, so the six stops read as one arc from dawn to night.
const SLOT_TIME_ICONS = {
  morning: Sunrise,
  midmorning: SunMedium,
  midday: Sun,
  afternoon: SunDim,
  tasting: Sunset,
  stay: Moon,
}

// ─────────────────────────────────────────────────────────────────
// The worked day: "A day in {region}", six (or five) real stops
// dealt as cards in visiting order. ONE day per visit — no carousel;
// the region changes on the hour, server-side (lib/home/dayBuilder).
// Hovering (or focusing, or tapping on touch) a card flips it to the
// listing's own writing, verbatim, with a link to its /place page.
// ─────────────────────────────────────────────────────────────────
export default function HomeDayCards({ day, regionsCount }) {
  const t = useTranslations('home')
  const locale = useLocale()
  const [flippedId, setFlippedId] = useState(null)
  // The rail and the grid light each other: pointing at a station
  // lifts its card, pointing at a card swells its station.
  const [litId, setLitId] = useState(null)
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
          {t('dayIntro')}
        </p>
      </div>

      {/* ── The day rail: dawn to night as one line ── */}
      {/* The timeline the grid can't draw on its own: the six stops as
          stations on a hairline that runs sunrise-gold to night-navy,
          each dot wearing its card's ground colour. Decorative — the
          cards below carry the same numbers and labels for readers and
          screen readers — so the whole rail is aria-hidden. */}
      <div className="day-rail" aria-hidden="true">
        <Sunrise size={15} strokeWidth={1.8} className="day-rail-cap" style={{ color: GOLD }} />
        {stops.map((stop, si) => {
          const tokens = VERTICAL_CARD_TOKENS[stop.vertical] || VERTICAL_CARD_TOKENS.portal
          return (
            <span
              key={stop.id}
              className={`day-rail-station${litId === stop.id ? ' is-lit' : ''}`}
              onMouseEnter={() => setLitId(stop.id)}
              onMouseLeave={() => setLitId(null)}
            >
              <span className="day-rail-dot" style={{ background: tokens.bg }}>{si + 1}</span>
              <span className="day-rail-label">{t(stop.labelKey)}</span>
            </span>
          )
        })}
        <Moon size={14} strokeWidth={1.8} className="day-rail-cap" style={{ color: '#143452' }} />
      </div>

      {/* ── The stops, dealt as flip cards in day order ── */}
      <ol className="day-hand" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {stops.map((stop, si) => {
          const tokens = VERTICAL_CARD_TOKENS[stop.vertical] || VERTICAL_CARD_TOKENS.portal
          const StopIcon = VERTICAL_ICONS[stop.vertical] || Compass
          const kind = subTypeLabel(stop.vertical, stop.sub_type) ||
            localizeVerticalKicker(stop.vertical, getVerticalBadge(stop.vertical), locale)
          const TimeIcon = SLOT_TIME_ICONS[stop.slot]
          const flipped = flippedId === stop.id
          return (
            <li key={stop.id} className="day-flip-seat">
              <div
                className={`day-flip${flipped ? ' is-flipped' : ''}${stop.is_claimed ? ' is-claimed' : ''}${litId === stop.id ? ' is-lit' : ''}`}
                onClick={() => { if (touchRef.current) setFlippedId(flipped ? null : stop.id) }}
                onMouseEnter={() => setLitId(stop.id)}
                onMouseLeave={() => setLitId(null)}
              >
                <div className="day-flip-inner">
                  {/* Front: the stop as a poster — photograph when the
                      listing carries one, its vertical's ground when not. */}
                  <div className="day-flip-front" style={{ background: tokens.bg, color: tokens.text }}>
                    {stop.hero_image_url && (
                      <>
                        {/* A dead image URL falls back to the typographic
                            ground rather than a broken-image glyph. */}
                        <img
                          src={stop.hero_image_url}
                          alt=""
                          loading="lazy"
                          className="day-flip-photo"
                          onError={(e) => { e.currentTarget.style.display = 'none' }}
                        />
                        <span aria-hidden="true" className="day-flip-scrim" />
                      </>
                    )}
                    <span aria-hidden="true" className="day-flip-star">
                      <svg width="72" height="72" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6L12 0z" />
                      </svg>
                    </span>
                    <div className="day-flip-front-top">
                      <span className="day-flip-num" aria-hidden="true">{si + 1}</span>
                      {TimeIcon && (
                        <TimeIcon size={12} strokeWidth={1.8} aria-hidden="true" style={{ opacity: 0.85, flexShrink: 0 }} />
                      )}
                      <span className="day-flip-slot">{t(stop.labelKey)}</span>
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
                    <div className="day-flip-front-foot">
                      <h3 className="day-flip-name">{stop.name}</h3>
                      <p className="day-flip-kind">
                        <StopIcon size={12} strokeWidth={1.8} aria-hidden="true" />
                        {[kind, stop.suburb].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>

                  {/* Back: the listing's own writing, exactly as it appears
                      on /place/[slug]. Clamped visually, never rewritten. */}
                  <div className="day-flip-back">
                    <p className="day-flip-back-kicker" style={{ color: VERTICAL_ACCENTS[stop.vertical] || GOLD }}>
                      {t(stop.labelKey)} · {kind}
                    </p>
                    <h3 className="day-flip-back-name">{stop.name}</h3>
                    <p className="day-flip-back-desc">{stop.description}</p>
                    <LocalizedLink href={`/place/${stop.slug}`} className="day-flip-back-link">
                      {t('dayViewListing')} <span aria-hidden="true">&rarr;</span>
                    </LocalizedLink>
                  </div>
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

        {/* The quiet sell: the gold-ringed cards above are operator-
            managed listings; here is where an operator starts. */}
        <LocalizedLink href="/for-venues" className="day-claim-aside hover:opacity-80 transition-opacity">
          <BadgeCheck size={13} strokeWidth={2} aria-hidden="true" style={{ color: GOLD, flexShrink: 0 }} />
          {t('dayClaimAside')}
        </LocalizedLink>
      </div>
    </div>
  )
}
