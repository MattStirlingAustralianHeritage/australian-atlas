'use client'

/* ═══════════════════════════════════════════════════════════════════════
   PlanAStayTripRender — shared presentational component
   ═══════════════════════════════════════════════════════════════════════
   Renders a plan-a-stay trip (normal or stays-only) for:
   1. The planner UI (OutputScreen in PlanAStayV2Client)
   2. The public share page (/trip/[slug])

   Mostly presentation. The one piece of state is accommodation: each day
   offers a "need somewhere to stay?" picker, and a chosen place can be kept
   across every night. Choices are surfaced via onAccommodationChange so the
   planner can fold them into a shared/saved trip.                        */

import Link from 'next/link'
import { useState, useEffect } from 'react'

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

/* ─── Meal-slot eyebrow labels ───────────────────────────────────────── */
const MEAL_SLOT_LABELS = {
  coffee: 'Morning coffee',
  lunch: 'Lunch',
}

const REST_ACCENT = '#8a5a6b'

const SUBTYPE_LABELS = {
  boutique_hotel: 'Boutique hotel',
  cottage: 'Cottage',
  glamping: 'Glamping',
  farm_stay: 'Farm stay',
}

function prettySubtype(s) {
  if (!s) return ''
  return SUBTYPE_LABELS[s] || s.replace(/_/g, ' ')
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

  const numeral = String(index + 1).padStart(2, '0')
  const mealLabel = MEAL_SLOT_LABELS[stop.meal_slot]

  return (
    <div style={{
      padding: '20px 0',
      background: 'transparent',
      borderBottom: '1px solid rgba(28,26,23,0.08)',
    }}>
      {mealLabel && (
        <div style={{
          marginLeft: 42,
          marginBottom: 6,
          fontFamily: 'var(--font-body)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: '#C4973B',
        }}>
          {mealLabel}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 6 }}>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: 14,
          color: 'var(--color-muted, #6B6760)',
          opacity: 0.4,
          minWidth: 28,
        }}>
          {numeral}
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 42, marginBottom: stop.description_excerpt ? 8 : 0 }}>
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
          marginLeft: 42,
        }}>
          {stop.description_excerpt}
        </p>
      )}
    </div>
  )
}


/* ─── Stays-only render ──────────────────────────────────────────────── */
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


/* ─── Day accommodation picker ───────────────────────────────────────── */
function DayAccommodation({ day, chosen, keepForAll, onChoose, onClear, onToggleKeepForAll }) {
  const [open, setOpen] = useState(false)
  const options = day.accommodation_options || []

  const labelStyle = {
    fontFamily: 'var(--font-body)',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: REST_ACCENT,
    marginBottom: 10,
  }

  const wrapStyle = {
    marginTop: 8,
    paddingTop: 18,
    borderTop: '1px dashed rgba(138,90,107,0.35)',
  }

  // ── Chosen state ───────────────────────────────────────────────────
  if (chosen) {
    return (
      <div style={wrapStyle}>
        <div style={labelStyle}>Where you{"'"}ll stay{keepForAll ? ' · every night' : ''}</div>
        <div style={{
          background: '#EDEAE4',
          border: '1px solid rgba(138,90,107,0.2)',
          borderRadius: 8,
          padding: '14px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <div>
              {chosen.slug ? (
                <Link href={`/place/${chosen.slug}`} style={{
                  fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 400,
                  color: 'var(--color-ink, #1C1A17)', textDecoration: 'none',
                }}>
                  {chosen.name}
                </Link>
              ) : (
                <span style={{
                  fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 400,
                  color: 'var(--color-ink, #1C1A17)',
                }}>
                  {chosen.name}
                </span>
              )}
              {(chosen.sub_type || chosen.suburb) && (
                <div style={{
                  fontFamily: 'var(--font-body)', fontSize: 12,
                  color: 'var(--color-muted, #6B6760)', marginTop: 2,
                }}>
                  {[prettySubtype(chosen.sub_type), chosen.suburb].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: REST_ACCENT, background: 'rgba(138,90,107,0.1)',
              padding: '2px 8px', borderRadius: 3, whiteSpace: 'nowrap',
            }}>
              Rest
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
            <button onClick={() => { onClear(); setOpen(true) }} style={textBtnStyle}>Change</button>
            <button onClick={onClear} style={textBtnStyle}>Remove</button>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto',
              fontFamily: 'var(--font-body)', fontSize: 12,
              color: 'var(--color-muted, #6B6760)', cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={!!keepForAll}
                onChange={(e) => onToggleKeepForAll(e.target.checked)}
                style={{ accentColor: REST_ACCENT, cursor: 'pointer' }}
              />
              Use this place every night
            </label>
          </div>
        </div>
      </div>
    )
  }

  // ── Empty state — prompt + options list ────────────────────────────
  return (
    <div style={wrapStyle}>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          disabled={options.length === 0}
          style={{
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
            color: options.length === 0 ? 'var(--color-muted, #6B6760)' : REST_ACCENT,
            background: 'transparent',
            border: `1px dashed ${options.length === 0 ? 'rgba(28,26,23,0.18)' : 'rgba(138,90,107,0.45)'}`,
            borderRadius: 8, padding: '10px 18px',
            cursor: options.length === 0 ? 'not-allowed' : 'pointer',
            opacity: options.length === 0 ? 0.6 : 1,
          }}
        >
          {options.length === 0 ? 'No stays listed nearby yet' : '+ Need somewhere to stay?'}
        </button>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ ...labelStyle, marginBottom: 0 }}>Places to stay nearby</div>
            <button onClick={() => setOpen(false)} style={textBtnStyle}>Hide</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {options.map(opt => (
              <button
                key={opt.listing_id}
                onClick={() => { onChoose(opt); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8,
                  width: '100%', textAlign: 'left',
                  padding: '12px 0', background: 'transparent', cursor: 'pointer',
                  border: 'none', borderBottom: '1px solid rgba(28,26,23,0.08)',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(138,90,107,0.04)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{
                  fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
                  color: 'var(--color-ink, #1C1A17)',
                }}>
                  {opt.name}
                </span>
                {(opt.sub_type || opt.suburb) && (
                  <span style={{
                    fontFamily: 'var(--font-body)', fontSize: 12,
                    color: 'var(--color-muted, #6B6760)', whiteSpace: 'nowrap',
                  }}>
                    {[prettySubtype(opt.sub_type), opt.suburb].filter(Boolean).join(' · ')}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const textBtnStyle = {
  fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
  color: 'var(--color-muted, #6B6760)', background: 'transparent',
  border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline',
}


/* ─── Accommodation state init from a (possibly saved) trip ──────────── */
function initAccommodation(days) {
  const byDay = {}
  for (const d of days || []) {
    if (d.accommodation) byDay[d.day_number] = d.accommodation
  }
  const dayNums = (days || []).map(d => d.day_number)
  const allSame =
    dayNums.length > 1 &&
    dayNums.every(n => byDay[n]) &&
    new Set(dayNums.map(n => byDay[n].listing_id)).size === 1
  return { byDay, keepForAll: allSame }
}


/* ─── Normal trip render ─────────────────────────────────────────────── */
export function TripRender({ trip, onAccommodationChange }) {
  const days = trip.days || []
  const initial = initAccommodation(days)
  const [accommodationByDay, setAccommodationByDay] = useState(initial.byDay)
  const [keepForAll, setKeepForAll] = useState(initial.keepForAll)

  // Surface choices to the parent (for share/save) whenever they change.
  useEffect(() => {
    if (onAccommodationChange) onAccommodationChange(accommodationByDay)
  }, [accommodationByDay, onAccommodationChange])

  function chooseForDay(dayNumber, stay) {
    setAccommodationByDay(prev => {
      if (keepForAll) {
        const next = {}
        for (const d of days) next[d.day_number] = stay
        return next
      }
      return { ...prev, [dayNumber]: stay }
    })
  }

  function clearForDay(dayNumber) {
    if (keepForAll) {
      setKeepForAll(false)
      setAccommodationByDay({})
      return
    }
    setAccommodationByDay(prev => {
      const next = { ...prev }
      delete next[dayNumber]
      return next
    })
  }

  function toggleKeepForAll(dayNumber, checked) {
    if (checked) {
      const stay = accommodationByDay[dayNumber]
      if (!stay) return
      const next = {}
      for (const d of days) next[d.day_number] = stay
      setAccommodationByDay(next)
      setKeepForAll(true)
    } else {
      setKeepForAll(false)
    }
  }

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
        fontSize: 'clamp(26px, 5vw, 40px)',
        color: 'var(--color-ink, #1C1A17)',
        lineHeight: 1.1,
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
      {days.map((day, dayIdx) => (
        <div key={day.day_number} style={{ marginBottom: 48 }}>
          {/* Day heading */}
          <h3 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: 24,
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {day.stops?.map((stop, stopIdx) => (
              <StopCard
                key={stop.listing_id}
                stop={stop}
                index={stopIdx}
                prevStop={stopIdx > 0 ? day.stops[stopIdx - 1] : null}
              />
            ))}
          </div>

          {/* Accommodation */}
          <DayAccommodation
            day={day}
            chosen={accommodationByDay[day.day_number] || null}
            keepForAll={keepForAll}
            onChoose={(stay) => chooseForDay(day.day_number, stay)}
            onClear={() => clearForDay(day.day_number)}
            onToggleKeepForAll={(checked) => toggleKeepForAll(day.day_number, checked)}
          />
        </div>
      ))}
    </div>
  )
}
