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
import { useTranslations } from 'next-intl'

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

/* ─── Meal-slot eyebrow label keys (translated at render) ────────────── */
const MEAL_SLOT_KEYS = {
  coffee: 'mealSlotCoffee',
  lunch: 'mealSlotLunch',
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
  const t = useTranslations('plan')
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
    if (km >= 1) distLabel = t('kmFromPrevious', { distance: Math.round(km) })
    else distLabel = t('mFromPrevious', { distance: Math.round(km * 1000) })
  }

  const numeral = String(index + 1).padStart(2, '0')
  const mealLabel = MEAL_SLOT_KEYS[stop.meal_slot] ? t(MEAL_SLOT_KEYS[stop.meal_slot]) : null

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
          color: 'var(--color-gold)',
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
          color: 'var(--color-gold)',
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
function RestGlyph({ size = 14, color = REST_ACCENT }) {
  // Crescent moon — "stay the night".
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function AccommodationEyebrow({ everyNight }) {
  const t = useTranslations('plan')
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12,
      fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 700,
      letterSpacing: '0.16em', textTransform: 'uppercase', color: REST_ACCENT,
    }}>
      <RestGlyph />
      <span>{everyNight ? t('whereYoullStayEveryNight') : t('whereYoullStay')}</span>
    </div>
  )
}

function DayAccommodation({ day, chosen, keepForAll, onChoose, onClear, onToggleKeepForAll }) {
  const t = useTranslations('plan')
  const [open, setOpen] = useState(false)
  const options = day.accommodation_options || []

  // Nothing to offer and nothing chosen (e.g. older shared trips that predate
  // this feature) — render no accommodation UI at all.
  if (!chosen && options.length === 0) return null

  const wrapStyle = {
    marginTop: 20,
    paddingTop: 22,
    borderTop: '1px solid rgba(28,26,23,0.1)',
  }

  // ── Chosen state ───────────────────────────────────────────────────
  if (chosen) {
    return (
      <div style={wrapStyle}>
        <AccommodationEyebrow everyNight={keepForAll} />
        <div style={{
          background: 'linear-gradient(180deg, #F1ECE4 0%, #EBE4D9 100%)',
          border: '1px solid rgba(138,90,107,0.18)',
          borderLeft: `3px solid ${REST_ACCENT}`,
          borderRadius: 10,
          padding: '16px 18px',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div>
              {chosen.slug ? (
                <Link href={`/place/${chosen.slug}`} style={{
                  fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400,
                  color: 'var(--color-ink, #1C1A17)', textDecoration: 'none', lineHeight: 1.25,
                }}>
                  {chosen.name}
                </Link>
              ) : (
                <span style={{
                  fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400,
                  color: 'var(--color-ink, #1C1A17)', lineHeight: 1.25,
                }}>
                  {chosen.name}
                </span>
              )}
              {(chosen.sub_type || chosen.suburb) && (
                <div style={{
                  fontFamily: 'var(--font-body)', fontSize: 12.5,
                  color: 'var(--color-muted, #6B6760)', marginTop: 3,
                }}>
                  {[prettySubtype(chosen.sub_type), chosen.suburb].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: 9.5, fontWeight: 700,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: REST_ACCENT, background: 'rgba(138,90,107,0.12)',
              padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap',
            }}>
              {t('restBadge')}
            </span>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginTop: 14,
            paddingTop: 12, borderTop: '1px solid rgba(138,90,107,0.15)', flexWrap: 'wrap',
          }}>
            <button onClick={() => { onClear(); setOpen(true) }} style={pillBtnStyle}>{t('change')}</button>
            <button onClick={onClear} style={pillBtnStyle}>{t('remove')}</button>
            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, marginLeft: 'auto',
              fontFamily: 'var(--font-body)', fontSize: 12.5,
              color: keepForAll ? REST_ACCENT : 'var(--color-muted, #6B6760)',
              fontWeight: keepForAll ? 600 : 400, cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={!!keepForAll}
                onChange={(e) => onToggleKeepForAll(e.target.checked)}
                style={{ accentColor: REST_ACCENT, cursor: 'pointer', width: 15, height: 15 }}
              />
              {t('stayHereEveryNight')}
            </label>
          </div>
        </div>
      </div>
    )
  }

  // ── Empty state — invitation + options ─────────────────────────────
  return (
    <div style={wrapStyle}>
      <AccommodationEyebrow everyNight={false} />
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
            fontFamily: 'var(--font-body)',
            background: 'rgba(138,90,107,0.05)',
            border: '1px dashed rgba(138,90,107,0.4)',
            borderRadius: 10, padding: '14px 18px', cursor: 'pointer',
            transition: 'background 0.18s ease, border-color 0.18s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(138,90,107,0.09)'; e.currentTarget.style.borderColor = 'rgba(138,90,107,0.6)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(138,90,107,0.05)'; e.currentTarget.style.borderColor = 'rgba(138,90,107,0.4)' }}
        >
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, borderRadius: 999, flexShrink: 0,
            background: 'rgba(138,90,107,0.13)', color: REST_ACCENT,
            fontSize: 20, fontWeight: 300, lineHeight: 1, paddingBottom: 2,
          }}>+</span>
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink, #1C1A17)' }}>
              {t('addSomewhereToStay')}
            </span>
            <span style={{ fontSize: 12, color: 'var(--color-muted, #6B6760)', marginTop: 1 }}>
              {t('independentPlacesNearby', { count: options.length })}
            </span>
          </span>
        </button>
      ) : (
        <div style={{
          border: '1px solid var(--color-border, rgba(28,26,23,0.12))',
          borderRadius: 10, overflow: 'hidden', background: '#fff',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px', background: 'rgba(138,90,107,0.05)',
            borderBottom: '1px solid rgba(28,26,23,0.08)',
          }}>
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.14em', textTransform: 'uppercase', color: REST_ACCENT,
            }}>
              {t('placesToStayNearby')}
            </span>
            <button onClick={() => setOpen(false)} style={pillBtnStyle}>{t('close')}</button>
          </div>
          <div>
            {options.map((opt, i) => (
              <button
                key={opt.listing_id}
                onClick={() => { onChoose(opt); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  width: '100%', textAlign: 'left', padding: '13px 16px',
                  background: 'transparent', cursor: 'pointer', border: 'none',
                  borderTop: i === 0 ? 'none' : '1px solid rgba(28,26,23,0.06)',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(138,90,107,0.06)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{
                    fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
                    color: 'var(--color-ink, #1C1A17)',
                  }}>
                    {opt.name}
                  </span>
                  {(opt.sub_type || opt.suburb) && (
                    <span style={{
                      fontFamily: 'var(--font-body)', fontSize: 12,
                      color: 'var(--color-muted, #6B6760)', marginTop: 1,
                    }}>
                      {[prettySubtype(opt.sub_type), opt.suburb].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                <span style={{
                  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: REST_ACCENT, whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {t('select')}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const pillBtnStyle = {
  fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
  color: 'var(--color-ink, #1C1A17)', background: '#fff',
  border: '1px solid var(--color-border, rgba(28,26,23,0.16))',
  borderRadius: 999, padding: '5px 14px', cursor: 'pointer',
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
  const t = useTranslations('plan')
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
                alt={t('mapForDay', { heading: day.heading })}
                loading={dayIdx === 0 ? 'eager' : 'lazy'}
                style={{
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                  minHeight: 160,
                  background: '#E8E2D6',
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
