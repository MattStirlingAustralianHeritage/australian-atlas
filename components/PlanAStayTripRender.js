'use client'

/* ═══════════════════════════════════════════════════════════════════════
   PlanAStayTripRender — shared presentational component
   ═══════════════════════════════════════════════════════════════════════
   Renders a plan-a-stay trip (normal or stays-only) for:
   1. The planner UI (OutputScreen in PlanAStayV2Client)
   2. The public share page (/trip/[slug])

   Pure presentation — no fetch, no state mutation, no persistence.    */

import Link from 'next/link'

/* ─── Vertical badge labels ──────────────────────────────────────────── */
export const VERTICAL_LABELS = {
  craft: 'Craft',
  collection: 'Collection',
  table: 'Table',
  sba: 'SBA',
  rest: 'Rest',
  field: 'Field',
  found: 'Found',
  corner: 'Corner',
  fine_grounds: 'Fine Grounds',
  culture: 'Culture',
}


/* ─── Stop card ──────────────────────────────────────────────────────── */
export function StopCard({ stop, index, prevStop }) {
  // Compute distance from previous stop
  let distLabel = null
  if (prevStop) {
    const R = 6371
    const dLat = (stop.lat - prevStop.lat) * Math.PI / 180
    const dLng = (stop.lng - prevStop.lng) * Math.PI / 180
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(prevStop.lat * Math.PI / 180) * Math.cos(stop.lat * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2
    const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    if (km >= 1) distLabel = `${Math.round(km)}km from previous`
    else distLabel = `${Math.round(km * 1000)}m from previous`
  }

  return (
    <div style={{
      padding: '16px 20px',
      background: 'rgba(28, 26, 23, 0.02)',
      border: '1px solid var(--color-border, rgba(28,26,23,0.12))',
      borderRadius: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <span style={{
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--color-muted, #6B6760)',
          minWidth: 20,
        }}>
          {index + 1}
        </span>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          fontSize: 17,
          color: 'var(--color-ink, #1C1A17)',
          lineHeight: 1.3,
        }}>
          {stop.name}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 30, marginBottom: stop.description_excerpt ? 8 : 0 }}>
        <span style={{
          fontFamily: 'var(--font-body)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: '#C4973B',
        }}>
          {VERTICAL_LABELS[stop.vertical] || stop.vertical}
        </span>
        {stop.sub_type && (
          <span style={{
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            color: 'var(--color-muted, #6B6760)',
          }}>
            {stop.sub_type.replace(/_/g, ' ')}
          </span>
        )}
        {distLabel && (
          <span style={{
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            color: 'var(--color-muted, #6B6760)',
            opacity: 0.7,
          }}>
            · {distLabel}
          </span>
        )}
      </div>
      {stop.description_excerpt && (
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          color: 'var(--color-muted, #6B6760)',
          lineHeight: 1.5,
          margin: 0,
          marginLeft: 30,
        }}>
          {stop.description_excerpt}
        </p>
      )}
    </div>
  )
}


/* ─── Stays-only render ──────────────────────────────────────────────── */
const SUBTYPE_LABELS = {
  boutique_hotel: 'Boutique hotel',
  cottage: 'Cottage',
  glamping: 'Glamping',
  farm_stay: 'Farm stay',
}

export function StaysOnlyRender({ staysOnly }) {
  const so = staysOnly
  return (
    <div style={{ padding: '48px 0 96px', maxWidth: 520, margin: '0 auto' }}>
      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: 15,
        color: 'var(--color-ink, #1C1A17)',
        lineHeight: 1.6,
        marginBottom: 32,
      }}>
        {so.framing}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {so.stays.map(stay => (
          <a
            key={stay.id}
            href={`/place/${stay.slug}`}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
              padding: '14px 0',
              borderBottom: '1px solid var(--color-border, rgba(28,26,23,0.08))',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <span style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
              fontSize: 15,
              color: 'var(--color-ink, #1C1A17)',
            }}>
              {stay.name}
            </span>
            {(stay.sub_type || stay.suburb) && (
              <span style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                color: 'var(--color-muted, #6B6760)',
              }}>
                {[SUBTYPE_LABELS[stay.sub_type], stay.suburb].filter(Boolean).join(' · ')}
              </span>
            )}
          </a>
        ))}
      </div>

      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: 13,
        color: 'var(--color-muted, #6B6760)',
        lineHeight: 1.5,
        marginTop: 32,
        marginBottom: 0,
      }}>
        {so.redirect}
      </p>
    </div>
  )
}


/* ─── Normal trip render ─────────────────────────────────────────────── */
export function TripRender({ trip }) {
  return (
    <div style={{
      padding: '48px 0 96px',
      maxWidth: 720,
      margin: '0 auto',
    }}>
      {/* ── Title ─────────────────────────────────────────────── */}
      <h2 style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 400,
        fontSize: 'clamp(24px, 4.5vw, 34px)',
        color: 'var(--color-ink, #1C1A17)',
        lineHeight: 1.2,
        textAlign: 'center',
        marginBottom: 12,
      }}>
        {trip.title}
      </h2>

      {/* ── Intro ─────────────────────────────────────────────── */}
      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: 15,
        color: 'var(--color-muted, #6B6760)',
        lineHeight: 1.6,
        textAlign: 'center',
        marginBottom: trip.trip_disclosures?.length > 0 ? 16 : 40,
      }}>
        {trip.intro}
      </p>

      {/* ── Trip disclosures ──────────────────────────────────── */}
      {trip.trip_disclosures?.length > 0 && (
        <div style={{ marginBottom: 40, textAlign: 'center' }}>
          {trip.trip_disclosures.map((d, i) => (
            <p key={i} style={{
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              fontStyle: 'italic',
              color: 'var(--color-muted, #6B6760)',
              lineHeight: 1.5,
              margin: '4px 0',
            }}>
              {d}
            </p>
          ))}
        </div>
      )}

      {/* ── Days ──────────────────────────────────────────────── */}
      {trip.days?.map((day, dayIdx) => (
        <div key={day.day_number} style={{ marginBottom: 48 }}>
          {/* Day heading */}
          <h3 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: 22,
            color: 'var(--color-ink, #1C1A17)',
            lineHeight: 1.3,
            marginBottom: 4,
          }}>
            {day.heading}
          </h3>

          {/* Day theme */}
          {day.theme && (
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              fontStyle: 'italic',
              color: 'var(--color-muted, #6B6760)',
              lineHeight: 1.5,
              marginBottom: day.day_disclosures?.length > 0 ? 8 : 16,
            }}>
              {day.theme}
            </p>
          )}

          {/* Day disclosures */}
          {day.day_disclosures?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {day.day_disclosures.map((d, i) => (
                <p key={i} style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  color: 'var(--color-muted, #6B6760)',
                  lineHeight: 1.5,
                  margin: '2px 0',
                  opacity: 0.8,
                }}>
                  {d}
                </p>
              ))}
            </div>
          )}

          {/* Static map */}
          {day.map_url && (
            <div style={{
              marginBottom: 16,
              borderRadius: 10,
              overflow: 'hidden',
              border: '1px solid var(--color-border, rgba(28,26,23,0.12))',
            }}>
              <img
                src={day.map_url}
                alt={`Map for ${day.heading}`}
                loading={dayIdx === 0 ? 'eager' : 'lazy'}
                style={{
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                  minHeight: 160,
                  background: '#2d2a24',
                }}
              />
            </div>
          )}

          {/* Stop cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {day.stops?.map((stop, stopIdx) => (
              <StopCard
                key={stop.listing_id}
                stop={stop}
                index={stopIdx}
                prevStop={stopIdx > 0 ? day.stops[stopIdx - 1] : null}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
