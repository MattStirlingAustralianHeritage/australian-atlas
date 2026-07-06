'use client'

/* ═══════════════════════════════════════════════════════════════════════
   PlanAStayTripRender — shared presentational component
   ═══════════════════════════════════════════════════════════════════════
   Renders a plan-a-stay trip (normal or stays-only) for:
   1. The planner UI (OutputScreen in PlanAStayV2Client) — editable
   2. The public share page (/trip/[slug]) — read-only

   State lives here for the two visitor-adjustable layers:
   - accommodation: each day offers a "need somewhere to stay?" picker
   - the days themselves (editable mode only): stops can be swapped for a
     real alternate listing, removed, reordered, or added — every option
     comes from the `alternates` the assemble step attached, so nothing is
     ever invented client-side.
   Both layers are surfaced via onAccommodationChange / onDaysChange so the
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

const SUBTYPE_KEYS = {
  boutique_hotel: 'subtypeBoutiqueHotel',
  cottage: 'subtypeCottage',
  glamping: 'subtypeGlamping',
  farm_stay: 'subtypeFarmStay',
}

function prettySubtype(s, t) {
  if (!s) return ''
  const key = SUBTYPE_KEYS[s]
  return key && t ? t(key) : s.replace(/_/g, ' ')
}

/* ─── Distance / drive-time estimates ────────────────────────────────────
   All figures are straight-line haversine dressed with a standard 1.3
   winding factor and a 60 km/h regional average — always rendered with an
   "≈" so they read as the estimates they are, never as routed times.     */
const WINDING_FACTOR = 1.3
const DRIVE_KMH = 60
const WALK_CUTOFF_KM = 1.2
const WALK_MIN_PER_KM = 12

function haversineKm(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return 0
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function dayLegsKm(stops) {
  if (!stops || stops.length < 2) return 0
  let total = 0
  for (let i = 1; i < stops.length; i++) {
    total += haversineKm(stops[i - 1].lat, stops[i - 1].lng, stops[i].lat, stops[i].lng)
  }
  return total
}

function formatDriveTime(mins, t) {
  if (mins < 60) return t('timeMins', { mins })
  return t('timeHoursMins', { hours: Math.floor(mins / 60), mins: mins % 60 })
}

/* Estimated minutes for one leg; walk for short hops, drive otherwise. */
function legTimeLabel(km, t) {
  if (km < 0.05) return null
  if (km < WALK_CUTOFF_KM) {
    const mins = Math.max(1, Math.round(km * WALK_MIN_PER_KM))
    return t('legWalk', { mins })
  }
  const mins = Math.max(2, Math.round((km * WINDING_FACTOR / DRIVE_KMH) * 60))
  return t('legDrive', { mins })
}

/* ─── Client-side static map URL (mirror of the assemble builder) ────── */
const MAPBOX_STYLE = 'mapbox/light-v11'

function buildClientMapUrl(stops, width = 720, height = 300) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token || !stops || stops.length === 0) return null
  const markers = stops.map((stop, i) =>
    `pin-s-${i + 1}+C4973B(${stop.lng},${stop.lat})`
  ).join(',')
  if (stops.length === 1) {
    const s = stops[0]
    return `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/static/${markers}/${s.lng},${s.lat},12,0/${width}x${height}@2x?access_token=${token}&padding=48`
  }
  return `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/static/${markers}/auto/${width}x${height}@2x?access_token=${token}&padding=56`
}

/* ─── Google Maps directions URL for a day (stops in order + stay) ───── */
function googleMapsDayUrl(stops, accommodation) {
  const pts = (stops || [])
    .filter(s => s.lat != null && s.lng != null)
    .map(s => `${s.lat},${s.lng}`)
  if (accommodation && accommodation.lat != null && accommodation.lng != null) {
    pts.push(`${accommodation.lat},${accommodation.lng}`)
  }
  if (pts.length < 2) return null
  return `https://www.google.com/maps/dir/${pts.join('/')}`
}

/* ─── Photo thumbnail (renders nothing if absent or broken) ──────────── */
function StopThumb({ src, alt, size = 76 }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return null
  return (
    <img
      src={src}
      alt={alt || ''}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        objectFit: 'cover',
        flexShrink: 0,
        border: '1px solid rgba(28,26,23,0.08)',
        background: '#E8E2D6',
      }}
    />
  )
}

/* ─── Small editing pill button ──────────────────────────────────────── */
const editPillStyle = {
  fontFamily: 'var(--font-body)', fontSize: 11.5, fontWeight: 500,
  color: 'var(--color-muted, #6B6760)', background: 'transparent',
  border: '1px solid rgba(28,26,23,0.14)',
  borderRadius: 999, padding: '3px 11px', cursor: 'pointer', lineHeight: 1.5,
}

/* ─── Alternates panel (swap / add pickers share this) ───────────────── */
function AlternatesPanel({ title, options, onPick, onClose }) {
  const t = useTranslations('plan')
  return (
    <div style={{
      border: '1px solid var(--color-border, rgba(28,26,23,0.12))',
      borderRadius: 10, overflow: 'hidden', background: '#fff',
      marginTop: 12,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', background: 'rgba(196,151,59,0.06)',
        borderBottom: '1px solid rgba(28,26,23,0.08)',
      }}>
        <span style={{
          fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 700,
          letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-gold, #C4973B)',
        }}>
          {title}
        </span>
        <button onClick={onClose} style={editPillStyle}>{t('close')}</button>
      </div>
      <div>
        {options.map((opt, i) => (
          <button
            key={opt.listing_id}
            onClick={() => onPick(opt)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              width: '100%', textAlign: 'left', padding: '11px 16px',
              background: 'transparent', cursor: 'pointer', border: 'none',
              borderTop: i === 0 ? 'none' : '1px solid rgba(28,26,23,0.06)',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(196,151,59,0.06)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <StopThumb src={opt.image_url} alt="" size={44} />
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{
                  fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
                  color: 'var(--color-ink, #1C1A17)',
                }}>
                  {opt.name}
                </span>
                <span style={{
                  fontFamily: 'var(--font-body)', fontSize: 12,
                  color: 'var(--color-muted, #6B6760)', marginTop: 1,
                }}>
                  {[VERTICAL_LABELS[opt.vertical] || opt.vertical, opt.sub_type ? opt.sub_type.replace(/_/g, ' ') : null, opt.suburb]
                    .filter(Boolean).join(' · ')}
                </span>
              </span>
            </span>
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              color: 'var(--color-gold, #C4973B)', whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {t('select')}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ─── Stop card ──────────────────────────────────────────────────────── */
export function StopCard({
  stop, index, prevStop,
  editable = false, alternates = [],
  canMoveUp = false, canMoveDown = false,
  onSwap, onRemove, onMove,
}) {
  const t = useTranslations('plan')
  const [swapOpen, setSwapOpen] = useState(false)

  // Distance + estimated time from the previous stop
  let distLabel = null
  let timeLabel = null
  if (prevStop) {
    const km = haversineKm(prevStop.lat, prevStop.lng, stop.lat, stop.lng)
    if (km >= 1) distLabel = t('kmFromPrevious', { distance: Math.round(km) })
    else distLabel = t('mFromPrevious', { distance: Math.round(km * 1000) })
    timeLabel = legTimeLabel(km, t)
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
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: 14,
          color: 'var(--color-muted, #6B6760)',
          opacity: 0.4,
          minWidth: 28,
          lineHeight: 1.6,
        }}>
          {numeral}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: 6 }}>
            {stop.slug ? (
              <Link href={`/place/${stop.slug}`} style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 400,
                fontSize: 17,
                color: 'var(--color-ink, #1C1A17)',
                lineHeight: 1.3,
                textDecoration: 'none',
              }}>
                {stop.name}
              </Link>
            ) : (
              <span style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 400,
                fontSize: 17,
                color: 'var(--color-ink, #1C1A17)',
                lineHeight: 1.3,
              }}>
                {stop.name}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: stop.description_excerpt ? 8 : 0 }}>
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
                · {distLabel}{timeLabel ? ` · ${timeLabel}` : ''}
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
            }}>
              {stop.description_excerpt}
            </p>
          )}
          {editable && (
            <div className="pas-no-print" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {alternates.length > 0 && (
                <button onClick={() => setSwapOpen(v => !v)} style={editPillStyle}>
                  {t('swapStop')}
                </button>
              )}
              <button onClick={onRemove} style={editPillStyle}>{t('remove')}</button>
              {canMoveUp && (
                <button onClick={() => onMove(-1)} aria-label={t('moveEarlier')} style={editPillStyle}>↑</button>
              )}
              {canMoveDown && (
                <button onClick={() => onMove(1)} aria-label={t('moveLater')} style={editPillStyle}>↓</button>
              )}
            </div>
          )}
          {editable && swapOpen && alternates.length > 0 && (
            <AlternatesPanel
              title={t('swapPanelTitle', { name: stop.name })}
              options={alternates}
              onPick={(opt) => { setSwapOpen(false); onSwap(opt) }}
              onClose={() => setSwapOpen(false)}
            />
          )}
        </div>
        <StopThumb src={stop.image_url} alt={stop.name} />
      </div>
    </div>
  )
}


/* ─── Stays-only render ──────────────────────────────────────────────── */
export function StaysOnlyRender({ staysOnly }) {
  const t = useTranslations('plan')
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
                {[prettySubtype(stay.sub_type, t), stay.suburb].filter(Boolean).join(' · ')}
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
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, minWidth: 0 }}>
              <StopThumb src={chosen.image_url} alt={chosen.name} size={56} />
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
                    {[prettySubtype(chosen.sub_type, t), chosen.suburb].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
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

          <div className="pas-no-print" style={{
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
    <div className="pas-no-print" style={wrapStyle}>
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
                  width: '100%', textAlign: 'left', padding: '11px 16px',
                  background: 'transparent', cursor: 'pointer', border: 'none',
                  borderTop: i === 0 ? 'none' : '1px solid rgba(28,26,23,0.06)',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(138,90,107,0.06)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <StopThumb src={opt.image_url} alt="" size={44} />
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
                        {[prettySubtype(opt.sub_type, t), opt.suburb].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
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


/* ─── Day-editing helpers (pure) ─────────────────────────────────────── */
function bucketFor(stop) {
  if (stop.meal_slot === 'coffee') return 'coffee'
  if (stop.meal_slot === 'lunch') return 'lunch'
  return 'activities'
}

function cloneDays(days) {
  return days.map(d => ({
    ...d,
    stops: [...(d.stops || [])],
    alternates: d.alternates
      ? {
          activities: [...(d.alternates.activities || [])],
          coffee: [...(d.alternates.coffee || [])],
          lunch: [...(d.alternates.lunch || [])],
        }
      : d.alternates,
  }))
}

/* Once an alternate is placed anywhere, retire it from every day's offers. */
function retireAlternate(days, listingId) {
  for (const d of days) {
    if (!d.alternates) continue
    for (const key of ['activities', 'coffee', 'lunch']) {
      d.alternates[key] = (d.alternates[key] || []).filter(a => a.listing_id !== listingId)
    }
  }
}

/* A displaced stop becomes an alternate again — on its own day only. */
function returnToAlternates(day, stop) {
  if (!day.alternates) day.alternates = { activities: [], coffee: [], lunch: [] }
  const key = bucketFor(stop)
  if (!(day.alternates[key] || []).some(a => a.listing_id === stop.listing_id)) {
    day.alternates[key] = [stop, ...(day.alternates[key] || [])]
  }
}


/* ─── Normal trip render ─────────────────────────────────────────────── */
export function TripRender({ trip, onAccommodationChange, onDaysChange, editable = false }) {
  const t = useTranslations('plan')
  const [days, setDays] = useState(() => cloneDays(trip.days || []))
  const initial = initAccommodation(trip.days || [])
  const [accommodationByDay, setAccommodationByDay] = useState(initial.byDay)
  const [keepForAll, setKeepForAll] = useState(initial.keepForAll)

  // Surface choices to the parent (for share/save) whenever they change.
  useEffect(() => {
    if (onAccommodationChange) onAccommodationChange(accommodationByDay)
  }, [accommodationByDay, onAccommodationChange])

  useEffect(() => {
    if (onDaysChange) onDaysChange(days)
  }, [days, onDaysChange])

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

  /* ── Stop editing (swap / remove / add / reorder) ─────────────────── */
  function refreshDayMap(day) {
    const url = buildClientMapUrl(day.stops)
    if (url) day.map_url = url
    else if (day.stops.length === 0) day.map_url = null
  }

  function swapStop(dayNumber, stopIdx, alt) {
    setDays(prev => {
      const next = cloneDays(prev)
      const day = next.find(d => d.day_number === dayNumber)
      if (!day || !day.stops[stopIdx]) return prev
      const old = day.stops[stopIdx]
      retireAlternate(next, alt.listing_id)
      day.stops[stopIdx] = alt
      returnToAlternates(day, old)
      refreshDayMap(day)
      return next
    })
  }

  function removeStop(dayNumber, stopIdx) {
    setDays(prev => {
      const next = cloneDays(prev)
      const day = next.find(d => d.day_number === dayNumber)
      if (!day || !day.stops[stopIdx]) return prev
      const [old] = day.stops.splice(stopIdx, 1)
      returnToAlternates(day, old)
      refreshDayMap(day)
      return next
    })
  }

  function addStop(dayNumber, alt) {
    setDays(prev => {
      const next = cloneDays(prev)
      const day = next.find(d => d.day_number === dayNumber)
      if (!day) return prev
      retireAlternate(next, alt.listing_id)
      day.stops.push(alt)
      refreshDayMap(day)
      return next
    })
  }

  function moveStop(dayNumber, stopIdx, dir) {
    setDays(prev => {
      const next = cloneDays(prev)
      const day = next.find(d => d.day_number === dayNumber)
      if (!day) return prev
      const target = stopIdx + dir
      if (target < 0 || target >= day.stops.length) return prev
      const tmp = day.stops[stopIdx]
      day.stops[stopIdx] = day.stops[target]
      day.stops[target] = tmp
      refreshDayMap(day)
      return next
    })
  }

  /* ── Trip-level summary figures ───────────────────────────────────── */
  const totalStops = days.reduce((sum, d) => sum + (d.stops?.length || 0), 0)
  const totalRoadKm = Math.round(
    days.reduce((sum, d) => sum + dayLegsKm(d.stops), 0) * WINDING_FACTOR
  )

  return (
    <div className="pas-print-root" style={{
      padding: '48px 0 96px',
      maxWidth: 720,
      margin: '0 auto',
    }}>
      {/* Print: show only the trip, hide editing chrome */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .pas-print-root, .pas-print-root * { visibility: visible; }
          .pas-print-root { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
          .pas-no-print { display: none !important; }
        }
      `}</style>

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
        marginBottom: 16,
      }}>
        {trip.intro}
      </p>

      {/* ── Summary strip ─────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'baseline',
        gap: 10,
        flexWrap: 'wrap',
        fontFamily: 'var(--font-body)',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--color-muted, #6B6760)',
        marginBottom: trip.trip_disclosures?.length > 0 ? 16 : 40,
      }}>
        <span>{t('dayCount', { count: days.length })}</span>
        <span style={{ color: 'var(--color-gold, #C4973B)' }}>·</span>
        <span>{t('stopCount', { count: totalStops })}</span>
        {totalRoadKm >= 2 && (
          <>
            <span style={{ color: 'var(--color-gold, #C4973B)' }}>·</span>
            <span>{t('summaryDriving', { km: totalRoadKm })}</span>
          </>
        )}
      </div>

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
      {days.map((day, dayIdx) => {
        const dayKm = dayLegsKm(day.stops)
        const dayRoadKm = Math.round(dayKm * WINDING_FACTOR)
        const dayMins = Math.round((dayKm * WINDING_FACTOR / DRIVE_KMH) * 60)
        const gmapsUrl = googleMapsDayUrl(day.stops, accommodationByDay[day.day_number])
        const addOptions = (day.alternates?.activities || [])

        return (
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

            {/* Day theme + driving estimate */}
            {(day.theme || dayRoadKm >= 2) && (
              <p style={{
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                fontStyle: 'italic',
                color: 'var(--color-muted, #6B6760)',
                lineHeight: 1.5,
                marginBottom: day.day_disclosures?.length > 0 ? 8 : 16,
              }}>
                {day.theme}
                {dayRoadKm >= 2 && (
                  <span style={{ fontStyle: 'normal', opacity: 0.85 }}>
                    {day.theme ? ' ' : ''}{t('dayDriveMeta', { km: dayRoadKm, time: formatDriveTime(dayMins, t) })}
                  </span>
                )}
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
                  editable={editable}
                  alternates={editable ? (day.alternates?.[bucketFor(stop)] || []) : []}
                  canMoveUp={editable && stopIdx > 0}
                  canMoveDown={editable && stopIdx < day.stops.length - 1}
                  onSwap={(alt) => swapStop(day.day_number, stopIdx, alt)}
                  onRemove={() => removeStop(day.day_number, stopIdx)}
                  onMove={(dir) => moveStop(day.day_number, stopIdx, dir)}
                />
              ))}
            </div>

            {/* Add a stop (editable, when real alternates remain) */}
            {editable && addOptions.length > 0 && (
              <AddStopControl
                options={addOptions}
                onPick={(alt) => addStop(day.day_number, alt)}
              />
            )}

            {/* Open the day in Google Maps */}
            {gmapsUrl && (
              <div className="pas-no-print" style={{ marginTop: 14 }}>
                <a
                  href={gmapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 12.5,
                    fontWeight: 500,
                    color: 'var(--color-muted, #6B6760)',
                    textDecoration: 'none',
                    borderBottom: '1px solid rgba(28,26,23,0.2)',
                    paddingBottom: 1,
                  }}
                >
                  {t('openDayInGoogleMaps')} ↗
                </a>
              </div>
            )}

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
        )
      })}
    </div>
  )
}


/* ─── "Add a stop" affordance (editable days) ────────────────────────── */
function AddStopControl({ options, onPick }) {
  const t = useTranslations('plan')
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        className="pas-no-print"
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
          fontFamily: 'var(--font-body)',
          background: 'rgba(196,151,59,0.04)',
          border: '1px dashed rgba(196,151,59,0.45)',
          borderRadius: 10, padding: '12px 18px', cursor: 'pointer', marginTop: 14,
          transition: 'background 0.18s ease, border-color 0.18s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(196,151,59,0.08)'; e.currentTarget.style.borderColor = 'rgba(196,151,59,0.65)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(196,151,59,0.04)'; e.currentTarget.style.borderColor = 'rgba(196,151,59,0.45)' }}
      >
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 26, height: 26, borderRadius: 999, flexShrink: 0,
          background: 'rgba(196,151,59,0.14)', color: 'var(--color-gold, #C4973B)',
          fontSize: 18, fontWeight: 300, lineHeight: 1, paddingBottom: 2,
        }}>+</span>
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-ink, #1C1A17)' }}>
            {t('addAStop')}
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-muted, #6B6760)', marginTop: 1 }}>
            {t('addAStopNearby', { count: options.length })}
          </span>
        </span>
      </button>
    )
  }

  return (
    <div className="pas-no-print">
      <AlternatesPanel
        title={t('addAStop')}
        options={options}
        onPick={(opt) => { setOpen(false); onPick(opt) }}
        onClose={() => setOpen(false)}
      />
    </div>
  )
}
