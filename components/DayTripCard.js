'use client'

import Link from 'next/link'

const VERTICAL_COLORS = {
  sba: '#C49A3C', fine_grounds: '#8A7055', collection: '#7A6B8A',
  craft: '#C1603A', rest: '#5A8A9A', field: '#4A7C59',
  corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

const VERTICAL_SHORT = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

function distanceLabel(km) {
  if (km < 1) return 'Under 1 km'
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}

function driveTimeLabel(mins) {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}hr ${m}min` : `${h}hr`
}

/**
 * Google Maps directions URL for a day's loop — base → stops → base.
 * Each stop is a waypoint; driving mode.
 */
function googleMapsDirectionsUrl(base, stops) {
  if (!base?.lat || !base?.lng || !stops?.length) return null
  const origin = `${base.lat},${base.lng}`
  const waypoints = stops.map(s => `${s.lat},${s.lng}`).join('|')
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${origin}&waypoints=${encodeURIComponent(waypoints)}&travelmode=driving`
}

/**
 * Mapbox static map URL showing base pin + day stops as a loop.
 * Uses light-v11 style — lightweight, no GL JS instance needed.
 */
function staticMapUrl(baseLat, baseLng, stops, token) {
  if (!token) return null
  const basePin = `pin-l-lodging+1B2631(${baseLng},${baseLat})`
  const stopPins = stops.map((s, i) => {
    const color = (VERTICAL_COLORS[s.vertical] || '#5F8A7E').replace('#', '')
    return `pin-s-${i + 1}+${color}(${s.lng},${s.lat})`
  }).join(',')
  return `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${basePin},${stopPins}/auto/580x240@2x?access_token=${token}&padding=50,50,50,50`
}

/**
 * Single day card in the day trip results.
 */
export default function DayTripCard({ day, base, mapboxToken }) {
  const mapUrl = base?.lat && base?.lng
    ? staticMapUrl(base.lat, base.lng, day.stops, mapboxToken)
    : null
  const gmapsUrl = googleMapsDirectionsUrl(base, day.stops)

  return (
    <div style={{
      borderRadius: 12,
      border: '1px solid var(--color-border)',
      overflow: 'hidden',
      background: '#fff',
    }}>
      {/* Static map */}
      {mapUrl && (
        <div style={{ width: '100%', height: 200, overflow: 'hidden', background: '#f0ede6' }}>
          <img
            src={mapUrl}
            alt={`Day ${day.day_number} route map`}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      )}

      {/* Day header */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{
            fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            color: 'var(--color-sage)',
          }}>
            Day {day.day_number}
          </span>
          {day.direction && (
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 400,
              color: 'var(--color-muted)', textTransform: 'capitalize',
            }}>
              Heading {day.direction}
            </span>
          )}
        </div>
        <h3 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 19,
          color: 'var(--color-ink)', margin: '0 0 8px', lineHeight: 1.3,
        }}>
          {day.theme}
        </h3>
        <div style={{
          fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 400,
          color: 'var(--color-muted)', display: 'flex', gap: 12,
        }}>
          <span>{Math.round(day.total_distance_km)} km loop</span>
          <span>{driveTimeLabel(day.estimated_drive_minutes)} driving</span>
          <span>{day.stops.length} stops</span>
        </div>
      </div>

      {/* Stops */}
      <div style={{ padding: '16px 20px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {day.stops.map((stop, i) => {
            const color = VERTICAL_COLORS[stop.vertical] || '#5F8A7E'
            return (
              <Link
                key={stop.listing_id}
                href={`/place/${stop.slug}`}
                style={{
                  display: 'flex', gap: 12, padding: '12px 14px',
                  borderRadius: 8, border: '1px solid var(--color-border)',
                  textDecoration: 'none', transition: 'border-color 0.15s',
                  background: 'var(--color-bg)',
                }}
                onMouseOver={(e) => e.currentTarget.style.borderColor = color}
                onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--color-border)'}
              >
                {/* Stop number */}
                <div style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: color, color: '#fff',
                  fontWeight: 700, fontSize: 11,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, marginTop: 1,
                  fontFamily: 'var(--font-body)',
                }}>
                  {i + 1}
                </div>

                {/* Stop info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 400,
                    color: 'var(--color-ink)', lineHeight: 1.3,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {stop.name}
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginTop: 3,
                  }}>
                    <span style={{
                      fontFamily: 'var(--font-body)', fontSize: 9, fontWeight: 700,
                      letterSpacing: '0.08em', textTransform: 'uppercase',
                      color,
                    }}>
                      {VERTICAL_SHORT[stop.vertical] || stop.vertical}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-body)', fontSize: 11,
                      color: 'var(--color-muted)',
                    }}>
                      {distanceLabel(stop.distance_from_base_km)} from base
                    </span>
                  </div>
                  {stop.description_snippet && (
                    <p style={{
                      fontFamily: 'var(--font-body)', fontSize: 12,
                      color: 'var(--color-muted)', lineHeight: 1.5,
                      margin: '4px 0 0',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>
                      {stop.description_snippet}
                    </p>
                  )}
                </div>

                {/* Hero image thumbnail */}
                {stop.hero_image_url && (
                  <div style={{
                    width: 56, height: 56, borderRadius: 6, overflow: 'hidden',
                    flexShrink: 0,
                  }}>
                    <img
                      src={stop.hero_image_url}
                      alt=""
                      loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Actions */}
      {gmapsUrl && (
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--color-border)',
          display: 'flex', gap: 16, flexWrap: 'wrap',
        }}>
          <a
            href={gmapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
              color: 'var(--color-muted)',
              textDecoration: 'none',
              transition: 'color 0.15s',
            }}
            onMouseOver={(e) => e.currentTarget.style.color = 'var(--color-ink)'}
            onMouseOut={(e) => e.currentTarget.style.color = 'var(--color-muted)'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            Open in Google Maps
          </a>
        </div>
      )}

      {/* Thin coverage notice */}
      {day.coverage === 'thin' && (
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--color-border)',
          fontFamily: 'var(--font-body)', fontSize: 12,
          color: 'var(--color-muted)', fontStyle: 'italic',
        }}>
          Limited coverage in this direction. We added nearby options to fill the day.
        </div>
      )}
    </div>
  )
}
