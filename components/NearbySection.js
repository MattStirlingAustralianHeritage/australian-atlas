'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useLocation } from './LocationProvider'
import { getListingRegion } from '@/lib/regions'

const GOLD = 'var(--color-gold)'

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

import { VERTICAL_CARD_BG } from '@/lib/verticalUrl'

const VERTICAL_CARD_COLORS = VERTICAL_CARD_BG

function distanceLabel(km, t) {
  if (km < 1) return t('underOneKm')
  if (km < 10) return t('km', { distance: km.toFixed(1) })
  return t('km', { distance: Math.round(km) })
}

function NearbyCard({ listing, t, compact }) {
  const bg = VERTICAL_CARD_COLORS[listing.vertical] || '#333'
  const Heading = compact ? 'h4' : 'h3'
  return (
    <Link
      href={`/place/${listing.slug}`}
      className="listing-card group block flex-shrink-0 overflow-hidden"
      style={{
        width: compact ? 'clamp(230px, 30vw, 260px)' : 'clamp(260px, 40vw, 300px)',
        scrollSnapAlign: 'start',
        background: listing.image_url ? '#1A1A1A' : bg,
        border: '1px solid transparent',
        borderRadius: 'var(--radius-card)',
      }}
    >
      {listing.image_url && (
        <div className="overflow-hidden" style={{ height: compact ? '120px' : '140px' }}>
          <img
            src={listing.image_url}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700"
          />
        </div>
      )}
      <div style={{ padding: compact ? '14px 16px 18px' : '16px 16px 20px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '6px',
        }}>
          <span style={{
            fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            color: listing.image_url ? GOLD : 'rgba(250,248,244,0.5)',
          }}>
            {VERTICAL_LABELS[listing.vertical] || listing.vertical}
          </span>
          {listing.distance_km != null && (
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 400,
              color: 'rgba(250,248,244,0.4)',
            }}>
              {distanceLabel(listing.distance_km, t)}
            </span>
          )}
        </div>
        <Heading style={{
          fontFamily: 'var(--font-display)', fontWeight: 400,
          fontSize: compact ? '16px' : '17px', lineHeight: 1.3,
          color: '#FAF8F4', margin: 0,
        }}>
          {listing.name}
        </Heading>
        {!compact && (() => {
          const r = getListingRegion(listing)
          return r && (
            <p style={{
              fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '12px',
              color: 'rgba(250,248,244,0.4)', margin: '4px 0 0',
            }}>
              {r.name}
            </p>
          )
        })()}
      </div>
    </Link>
  )
}

// Arrow-navigable card strip shared by both variants. Same chrome as
// MoreInRow: arrows sit beside the heading, only render once the track
// actually overflows, each disables at its end, and they hide on phones
// where the peeking next card signals swipe. Snapping is `proximity`
// (not `mandatory`) so trackpad scrolls glide instead of lurching between
// snap points, and overscroll is contained so hitting either end doesn't
// chain into the page or the browser's back gesture.
function NearbyStrip({ listings, t, compact, header, headerMargin }) {
  const trackRef = useRef(null)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(false)

  const sync = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    setCanPrev(scrollLeft > 2)
    setCanNext(scrollLeft + clientWidth < scrollWidth - 2)
  }, [])

  // Re-measure after every render so the arrows stay correct when the card
  // set changes without a remount. sync() only setStates on a real change,
  // so this settles immediately rather than looping.
  useEffect(() => { sync() })

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    el.addEventListener('scroll', sync, { passive: true })
    window.addEventListener('resize', sync)
    return () => {
      el.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
    }
  }, [sync])

  const page = (direction) => {
    const el = trackRef.current
    if (!el) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({ left: direction * Math.max(el.clientWidth * 0.85, 260), behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  const showArrows = canPrev || canNext

  return (
    <div style={{ minWidth: 0 }}>
      <style>{`
        .nearby-track {
          display: flex;
          overflow-x: auto;
          scroll-snap-type: x proximity;
          overscroll-behavior-x: contain;
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
          padding: 6px;
          margin: -6px;
          scroll-padding-inline: 6px;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .nearby-track::-webkit-scrollbar { display: none; }
        @media (prefers-reduced-motion: reduce) {
          .nearby-track { scroll-behavior: auto; }
        }
        .nearby-arrow {
          width: 36px;
          height: 36px;
          border-radius: 9999px;
          border: 1px solid var(--color-border);
          background: var(--color-card-bg, #fff);
          color: var(--color-ink);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          line-height: 1;
          padding-bottom: 2px;
          box-shadow: 0 1px 6px rgba(0,0,0,0.08);
          cursor: pointer;
          transition: opacity .2s ease, background .2s ease, border-color .2s ease, color .2s ease;
        }
        .nearby-arrow:hover:not(:disabled) {
          background: var(--color-accent);
          border-color: var(--color-accent);
          color: #fff;
        }
        .nearby-arrow:disabled { opacity: .3; cursor: default; }
        .nearby-arrows { display: flex; gap: 8px; flex: 0 0 auto; }
        /* On phones the peeking next card signals swipe; arrows would crowd
           the heading, so hide them and let the native gesture do the work. */
        @media (max-width: 639px) { .nearby-arrows { display: none; } }
      `}</style>

      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: '16px', marginBottom: headerMargin,
      }}>
        <div style={{ minWidth: 0 }}>{header}</div>
        {showArrows && (
          <div className="nearby-arrows">
            <button
              type="button"
              className="nearby-arrow"
              aria-label={t('scrollBackNearby')}
              onClick={() => page(-1)}
              disabled={!canPrev}
            >
              ‹
            </button>
            <button
              type="button"
              className="nearby-arrow"
              aria-label={t('scrollForwardNearby')}
              onClick={() => page(1)}
              disabled={!canNext}
            >
              ›
            </button>
          </div>
        )}
      </div>

      <div ref={trackRef} className="nearby-track" style={{ gap: compact ? '14px' : '16px' }}>
        {listings.map((listing) => (
          <NearbyCard key={listing.id} listing={listing} t={t} compact={compact} />
        ))}
      </div>
    </div>
  )
}

// variant: 'standalone' (its own homepage band — legacy) | 'embedded' (a column
// inside the "Make it yours" band: compact card chrome, h3-level headings, no
// <section> wrapper of its own).
export default function NearbySection({ variant = 'standalone' }) {
  const t = useTranslations('cards')
  const embedded = variant === 'embedded'
  const { location, status, detectLocation, isReady } = useLocation()
  const [listings, setListings] = useState(null)
  const [nearbyRegion, setNearbyRegion] = useState(null)
  const [radiusUsed, setRadiusUsed] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const fetchedRef = useRef(null) // track which coords we've fetched for

  // Fetch nearby listings when location becomes available
  useEffect(() => {
    if (!isReady || !location) return

    // Don't refetch for same coords
    const coordKey = `${location.lat.toFixed(4)},${location.lng.toFixed(4)}`
    if (fetchedRef.current === coordKey) return
    fetchedRef.current = coordKey

    setLoading(true)
    setError(false)

    const url = `/api/nearby?lat=${location.lat}&lng=${location.lng}&limit=6&adaptive=true&min_results=6&max_per_vertical=2`

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          console.error('[Atlas Nearby] API error:', data.error)
        }
        setListings(data.listings || [])
        setNearbyRegion(data.region || null)
        setRadiusUsed(data.radius_used || null)
        setLoading(false)
      })
      .catch((err) => {
        console.error('[Atlas Nearby] Fetch failed:', err)
        setError(true)
        setLoading(false)
      })
  }, [isReady, location])

  // ── Not detected yet: show prompt ──
  if (status === 'idle') {
    if (embedded) {
      return (
        <div style={{
          background: '#FFFFFF', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)', padding: '30px 28px',
        }}>
          <h3 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400,
            fontSize: 'clamp(21px, 2.2vw, 26px)', color: 'var(--color-ink)',
            marginBottom: '8px',
          }}>
            {t('worthFindingNearby')}
          </h3>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '14.5px',
            lineHeight: 1.6, color: 'var(--color-muted)', marginBottom: '20px', maxWidth: '42ch',
          }}>
            {t('nearbyPromptBody')}
          </p>
          <button
            onClick={detectLocation}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full hover:opacity-90 transition-opacity"
            style={{
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13.5px',
              background: 'var(--color-ink)', color: '#FAF8F4',
              border: 'none', cursor: 'pointer',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
            </svg>
            {t('useMyLocation')}
          </button>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '12px',
            color: 'var(--color-muted)', marginTop: '14px', marginBottom: 0,
          }}>
            {t.rich('orBrowseBySuburb', {
              link: (chunks) => (
                <Link href="/near-me" style={{ color: GOLD, textDecoration: 'none', fontWeight: 500 }}>{chunks}</Link>
              ),
            })}
          </p>
        </div>
      )
    }
    return (
      <section style={{ paddingBlock: '64px' }}>
        <div className="max-w-5xl mx-auto px-6 sm:px-12 text-center">
          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400,
            fontSize: 'clamp(24px, 3vw, 36px)', color: 'var(--color-ink)',
            marginBottom: '12px',
          }}>
            {t('worthFindingNearby')}
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px',
            color: 'var(--color-muted)', marginBottom: '28px',
          }}>
            {t('seeIndependentPlaces')}
          </p>
          <button
            onClick={detectLocation}
            className="inline-flex items-center gap-2 px-7 py-3 rounded-full hover:opacity-90 transition-opacity"
            style={{
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '14px',
              background: 'var(--color-ink)', color: '#FAF8F4',
              border: 'none', cursor: 'pointer',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
            </svg>
            {t('useMyLocation')}
          </button>
        </div>
      </section>
    )
  }

  // ── Detecting ──
  if (status === 'detecting') {
    if (embedded) {
      return (
        <div style={{
          background: '#FFFFFF', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)', padding: '30px 28px',
        }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '14.5px',
            color: 'var(--color-muted)', margin: 0,
          }}>
            {t('findingPlacesNearYou')}
          </p>
        </div>
      )
    }
    return (
      <section style={{ paddingBlock: '64px' }}>
        <div className="max-w-5xl mx-auto px-6 sm:px-12 text-center">
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px',
            color: 'var(--color-muted)',
          }}>
            {t('findingPlacesNearYou')}
          </p>
        </div>
      </section>
    )
  }

  // ── Denied / overseas / unavailable ──
  if (status === 'denied' || status === 'overseas' || status === 'unavailable') {
    if (embedded) {
      // Keep the column composed and still useful: point at the suburb browser.
      return (
        <div style={{
          background: '#FFFFFF', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)', padding: '30px 28px',
        }}>
          <h3 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400,
            fontSize: 'clamp(21px, 2.2vw, 26px)', color: 'var(--color-ink)',
            marginBottom: '8px',
          }}>
            {t('worthFindingNearby')}
          </h3>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '14.5px',
            lineHeight: 1.6, color: 'var(--color-muted)', marginBottom: '16px', maxWidth: '42ch',
          }}>
            {t('couldntPlaceYou')}
          </p>
          <Link href="/near-me" style={{
            fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13.5px',
            color: GOLD, textDecoration: 'none',
          }}>
            {t('openNearMePage')}
          </Link>
        </div>
      )
    }
    return null // Gracefully hide — don't nag
  }

  // ── Loading nearby data ──
  if (loading) {
    if (embedded) {
      return (
        <div style={{
          background: '#FFFFFF', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)', padding: '30px 28px',
        }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '14.5px',
            color: 'var(--color-muted)', margin: 0,
          }}>
            {t('loadingNearbyPlaces')}
          </p>
        </div>
      )
    }
    return (
      <section style={{ paddingBlock: '64px' }}>
        <div className="max-w-5xl mx-auto px-6 sm:px-12 text-center">
          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400,
            fontSize: 'clamp(24px, 3vw, 36px)', color: 'var(--color-ink)',
            marginBottom: '12px',
          }}>
            {t('worthFindingNearby')}
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px',
            color: 'var(--color-muted)',
          }}>
            {t('loadingNearbyPlaces')}
          </p>
        </div>
      </section>
    )
  }

  // ── Error or no results ──
  if (error || !listings || listings.length === 0) {
    if (embedded) {
      return (
        <div style={{
          background: '#FFFFFF', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)', padding: '30px 28px',
        }}>
          <h3 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400,
            fontSize: 'clamp(21px, 2.2vw, 26px)', color: 'var(--color-ink)',
            marginBottom: '8px',
          }}>
            {t('worthFindingNearby')}
          </h3>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '14.5px',
            lineHeight: 1.6, color: 'var(--color-muted)', marginBottom: '16px', maxWidth: '42ch',
          }}>
            {t('nothingCloseEnough')}
          </p>
          <Link href="/near-me" style={{
            fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13.5px',
            color: GOLD, textDecoration: 'none',
          }}>
            {t('openNearMePage')}
          </Link>
        </div>
      )
    }
    return null // Gracefully collapse
  }

  // ── Build header text ──
  const headerText = location?.name
    ? t('worthFindingNear', { town: location.name })
    : t('worthFindingNearby')

  const subText = radiusUsed
    ? t('independentPlacesWithin', { radius: radiusUsed })
    : t('independentPlacesCloseToYou')

  if (embedded) {
    return (
      <NearbyStrip
        listings={listings}
        t={t}
        compact
        headerMargin="20px"
        header={
          <>
            <h3 style={{
              fontFamily: 'var(--font-display)', fontWeight: 400,
              fontSize: 'clamp(21px, 2.2vw, 26px)', color: 'var(--color-ink)',
              marginBottom: '6px',
            }}>
              {headerText}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '13.5px',
                color: 'var(--color-muted)', margin: 0,
              }}>
                {subText}
              </p>
              <Link
                href={`/near-me`}
                style={{
                  fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px',
                  color: GOLD, textDecoration: 'none',
                }}
              >
                {t('seeAll')}
              </Link>
            </div>
          </>
        }
      />
    )
  }

  return (
    <section style={{ paddingBlock: '72px' }}>
      <div className="max-w-6xl mx-auto px-6 sm:px-12">
        <NearbyStrip
          listings={listings}
          t={t}
          compact={false}
          headerMargin="32px"
          header={
            <>
              <p className="section-dateline" style={{ marginBottom: '14px' }}>{t('nearYou')}</p>
              <h2 style={{
                fontFamily: 'var(--font-display)', fontWeight: 400,
                fontSize: 'clamp(26px, 3.2vw, 40px)', color: 'var(--color-ink)',
                marginBottom: '8px', lineHeight: 1.1,
              }}>
                {headerText}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <p style={{
                  fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px',
                  color: 'var(--color-muted)', margin: 0,
                }}>
                  {subText}
                </p>
                <Link
                  href={`/near-me`}
                  style={{
                    fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px',
                    color: GOLD, textDecoration: 'none',
                  }}
                >
                  {t('seeAll')}
                </Link>
              </div>
            </>
          }
        />
      </div>
    </section>
  )
}
