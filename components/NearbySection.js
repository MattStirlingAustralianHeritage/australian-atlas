'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
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

function distanceLabel(km) {
  if (km < 1) return 'Under 1 km'
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}

// variant: 'standalone' (its own homepage band — legacy) | 'embedded' (a column
// inside the "Make it yours" band: compact card chrome, h3-level headings, no
// <section> wrapper of its own).
export default function NearbySection({ variant = 'standalone' }) {
  const embedded = variant === 'embedded'
  const { location, status, detectLocation, isReady } = useLocation()
  const [listings, setListings] = useState(null)
  const [nearbyRegion, setNearbyRegion] = useState(null)
  const [radiusUsed, setRadiusUsed] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const fetchedRef = useRef(null) // track which coords we've fetched for
  const scrollRef = useRef(null)

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
            Worth finding nearby
          </h3>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '14.5px',
            lineHeight: 1.6, color: 'var(--color-muted)', marginBottom: '20px', maxWidth: '42ch',
          }}>
            Share your location and the Atlas surfaces the independent places within reach — the roaster, the maker, the walk you didn&apos;t know was there.
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
            Use my location
          </button>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '12px',
            color: 'var(--color-muted)', marginTop: '14px', marginBottom: 0,
          }}>
            Or browse by suburb on <Link href="/near-me" style={{ color: GOLD, textDecoration: 'none', fontWeight: 500 }}>the near-me page &rarr;</Link>
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
            Worth finding nearby
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px',
            color: 'var(--color-muted)', marginBottom: '28px',
          }}>
            See independent places close to where you are.
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
            Use my location
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
            Finding places near you…
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
            Finding places near you...
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
            Worth finding nearby
          </h3>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '14.5px',
            lineHeight: 1.6, color: 'var(--color-muted)', marginBottom: '16px', maxWidth: '42ch',
          }}>
            We couldn&apos;t place you — but you can browse what&apos;s close by suburb instead.
          </p>
          <Link href="/near-me" style={{
            fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13.5px',
            color: GOLD, textDecoration: 'none',
          }}>
            Open the near-me page &rarr;
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
            Loading nearby places…
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
            Worth finding nearby
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px',
            color: 'var(--color-muted)',
          }}>
            Loading nearby places...
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
            Worth finding nearby
          </h3>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '14.5px',
            lineHeight: 1.6, color: 'var(--color-muted)', marginBottom: '16px', maxWidth: '42ch',
          }}>
            Nothing close enough just yet — the wider hunt lives on the near-me page.
          </p>
          <Link href="/near-me" style={{
            fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13.5px',
            color: GOLD, textDecoration: 'none',
          }}>
            Open the near-me page &rarr;
          </Link>
        </div>
      )
    }
    return null // Gracefully collapse
  }

  // ── Build header text ──
  const headerText = location?.name
    ? `Worth finding near ${location.name}`
    : 'Worth finding nearby'

  const subText = radiusUsed
    ? `Independent places within ${radiusUsed} km`
    : 'Independent places close to you'

  if (embedded) {
    return (
      <div style={{ minWidth: 0 }}>
        <div style={{ marginBottom: '20px' }}>
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
              See all &rarr;
            </Link>
          </div>
        </div>
        <div
          className="nearby-scroll"
          style={{
            display: 'flex', gap: '14px', overflowX: 'auto',
            scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch',
            paddingBottom: '8px', marginInline: '-6px', paddingInline: '6px',
            scrollbarWidth: 'thin', scrollbarColor: 'var(--color-border) transparent',
          }}
        >
          {listings.map((listing) => {
            const bg = VERTICAL_CARD_COLORS[listing.vertical] || '#333'
            return (
              <Link
                key={listing.id}
                href={`/place/${listing.slug}`}
                className="listing-card group block flex-shrink-0 overflow-hidden"
                style={{
                  width: 'clamp(230px, 30vw, 260px)',
                  scrollSnapAlign: 'start',
                  background: listing.image_url ? '#1A1A1A' : bg,
                  border: '1px solid transparent',
                  borderRadius: 'var(--radius-card)',
                }}
              >
                {listing.image_url && (
                  <div className="overflow-hidden" style={{ height: '120px' }}>
                    <img
                      src={listing.image_url}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700"
                    />
                  </div>
                )}
                <div style={{ padding: '14px 16px 18px' }}>
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
                        {distanceLabel(listing.distance_km)}
                      </span>
                    )}
                  </div>
                  <h4 style={{
                    fontFamily: 'var(--font-display)', fontWeight: 400,
                    fontSize: '16px', lineHeight: 1.3,
                    color: '#FAF8F4', margin: 0,
                  }}>
                    {listing.name}
                  </h4>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <section style={{ paddingBlock: '72px' }}>
      <div className="max-w-6xl mx-auto px-6 sm:px-12">
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <p className="section-dateline" style={{ marginBottom: '14px' }}>Near you</p>
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
              See all &rarr;
            </Link>
          </div>
        </div>

        {/* Horizontal scroll strip */}
        <div
          ref={scrollRef}
          className="nearby-scroll"
          style={{
            display: 'flex',
            gap: '16px',
            overflowX: 'auto',
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
            paddingBottom: '8px',
            marginInline: '-6px',
            paddingInline: '6px',
          }}
        >
          {listings.map((listing) => {
            const bg = VERTICAL_CARD_COLORS[listing.vertical] || '#333'
            return (
              <Link
                key={listing.id}
                href={`/place/${listing.slug}`}
                className="listing-card group block flex-shrink-0 overflow-hidden"
                style={{
                  width: 'clamp(260px, 40vw, 300px)',
                  scrollSnapAlign: 'start',
                  background: listing.image_url ? '#1A1A1A' : bg,
                  border: '1px solid transparent',
                  borderRadius: 'var(--radius-card)',
                }}
              >
                {listing.image_url && (
                  <div className="overflow-hidden" style={{ height: '140px' }}>
                    <img
                      src={listing.image_url}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700"
                    />
                  </div>
                )}
                <div style={{ padding: '16px 16px 20px' }}>
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
                        {distanceLabel(listing.distance_km)}
                      </span>
                    )}
                  </div>
                  <h3 style={{
                    fontFamily: 'var(--font-display)', fontWeight: 400,
                    fontSize: '17px', lineHeight: 1.3,
                    color: '#FAF8F4', margin: 0,
                  }}>
                    {listing.name}
                  </h3>
                  {(() => {
                    const r = getListingRegion(listing)
                    return r && (
                      <p style={{
                        fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '12px',
                        color: 'rgba(250,248,244,0.4)', marginTop: '4px', margin: '4px 0 0',
                      }}>
                        {r.name}
                      </p>
                    )
                  })()}
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      <style jsx>{`
        .nearby-scroll::-webkit-scrollbar {
          height: 4px;
        }
        .nearby-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .nearby-scroll::-webkit-scrollbar-thumb {
          background: var(--color-border);
          border-radius: 4px;
        }
        .nearby-scroll {
          scrollbar-width: thin;
          scrollbar-color: var(--color-border) transparent;
        }
      `}</style>
    </section>
  )
}
