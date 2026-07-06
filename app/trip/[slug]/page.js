import { cache } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSupabase } from '@/lib/supabase/clients'
import { TripRender, StaysOnlyRender } from '@/components/PlanAStayTripRender'
import { VERTICAL_MUTED } from '@/lib/verticalUrl'

export const revalidate = 3600

const VERTICAL_COLORS = VERTICAL_MUTED

const VERTICAL_NAMES = {
  sba: 'Small Batch',
  collection: 'Culture',
  craft: 'Craft',
  fine_grounds: 'Fine Grounds',
  rest: 'Rest',
  field: 'Field',
  corner: 'Corner',
  found: 'Found',
  table: 'Table',
}

/* ─── Plan-a-Stay trip lookup (checked first) ────────────────────────── */
/* Trips shared before 2026-06-05 stored day map URLs on the old custom
   style, which the Static Images API renders as a near-empty dark canvas.
   Swap to light-v11 at read time (pins/bounds/token are style-agnostic) so
   legacy shares render — and unfurl — with a legible map. */
const LEGACY_MAP_STYLE = 'styles/v1/mattstirlingaustralianheritage/cmn32b0iz003401swccb7d21k/static/'

function normaliseLegacyMapUrls(row) {
  if (!row?.trip?.days) return row
  for (const day of row.trip.days) {
    if (typeof day.map_url === 'string' && day.map_url.includes(LEGACY_MAP_STYLE)) {
      day.map_url = day.map_url.replace(LEGACY_MAP_STYLE, 'styles/v1/mapbox/light-v11/static/')
    }
  }
  return row
}

const getPlanAStayTrip = cache(async function getPlanAStayTrip(slug) {
  const sb = getSupabase()
  const { data } = await sb
    .from('plan_a_stay_trips')
    .select('id, share_slug, trip, stays_only, answers, is_public')
    .eq('share_slug', slug)
    .eq('is_public', true)
    .maybeSingle()
  return normaliseLegacyMapUrls(data)
})

/* ─── Road trip lookup (v1 fallback) ──────────────────────────────────── */
const getTrip = cache(async function getTrip(slug) {
  const sb = getSupabase()
  const { data } = await sb
    .from('road_trips')
    .select('*')
    .eq('slug', slug)
    .single()
  return data
})

/* Road trips store no rendered map, so the unfurl image is a static map
   built from the stored stops at metadata time — numbered pins on
   light-v11, 720×300@2x (1440×600, the large-card aspect band). */
function roadTripMapImage(trip) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token) return null
  const days = trip?.days || []
  const day = days.find(d => (d.stops || d.listings || []).filter(s => s.lat != null && s.lng != null).length >= 2) || days[0]
  const stops = (day?.stops || day?.listings || [])
    .filter(s => s.lat != null && s.lng != null)
    .slice(0, 10)
  if (stops.length < 2) return null
  const markers = stops.map((s, i) => `pin-s-${i + 1}+C4973B(${s.lng},${s.lat})`).join(',')
  return `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${markers}/auto/720x300@2x?access_token=${token}&padding=56`
}

export async function generateMetadata({ params }) {
  const { slug } = await params
  const t = await getTranslations('tripShare')

  // Check plan-a-stay first
  const pasTrip = await getPlanAStayTrip(slug)
  if (pasTrip) {
    const title = pasTrip.trip?.title || t('staysTitleFallback', { region: pasTrip.answers?.region || t('regionFallback') })
    const intro = pasTrip.trip?.intro || t('staysIntroFallback', { region: pasTrip.answers?.region || t('australiaFallback') })
    // Unfurl with the day-one route map (already rendered + stored with the
    // trip) so a pasted link shows the trip, not a bare text card. 720×300@2x
    // static maps are 1440×600 — right in the large-card aspect band.
    const mapImage = (pasTrip.trip?.days || []).find(d => d.map_url)?.map_url || null
    return {
      title: t('metaTitle', { title }),
      description: intro,
      openGraph: {
        title,
        description: intro,
        url: `https://www.australianatlas.com.au/trip/${slug}`,
        siteName: 'Australian Atlas',
        locale: 'en_AU',
        type: 'article',
        ...(mapImage ? { images: [{ url: mapImage, width: 1440, height: 600 }] } : {}),
      },
      ...(mapImage ? { twitter: { card: 'summary_large_image', images: [mapImage] } } : {}),
      alternates: {
        canonical: `https://www.australianatlas.com.au/trip/${slug}`,
      },
    }
  }

  // Fall back to road trip
  const trip = await getTrip(slug)
  if (!trip) return {}
  const description = trip.intro || t('roadTripIntroFallback', { start: trip.start_name, end: trip.end_name })
  const mapImage = roadTripMapImage(trip)
  return {
    title: t('metaTitle', { title: trip.title }),
    description,
    openGraph: {
      title: trip.title,
      description,
      url: `https://www.australianatlas.com.au/trip/${slug}`,
      siteName: 'Australian Atlas',
      locale: 'en_AU',
      type: 'article',
      ...(mapImage ? { images: [{ url: mapImage, width: 1440, height: 600 }] } : {}),
    },
    ...(mapImage ? { twitter: { card: 'summary_large_image', images: [mapImage] } } : {}),
    alternates: {
      canonical: `https://www.australianatlas.com.au/trip/${slug}`,
    },
  }
}

/** Format km into a readable string */
function formatDistance(km, t) {
  if (!km) return null
  return km >= 1000 ? t('distanceThousandsKm', { km: (km / 1000).toFixed(1) }) : t('distanceKm', { km: Math.round(km) })
}

/** Format minutes into hours + minutes */
function formatDuration(minutes, t) {
  if (!minutes) return null
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return t('minutesShort', { min: m })
  if (m === 0) return t('hoursShort', { h })
  return `${t('hoursShort', { h })} ${t('minutesShort', { min: m })}`
}

/** Count all stops across days */
function countStops(days) {
  if (!days || !Array.isArray(days)) return 0
  return days.reduce((sum, day) => {
    const stops = day.stops || day.listings || []
    return sum + stops.length
  }, 0)
}

/** Check if the trip is single-day */
function isSingleDay(days) {
  return days && days.length === 1
}

export default async function TripPage({ params }) {
  const { slug } = await params
  const t = await getTranslations('tripShare')

  // ── Plan-a-Stay trip (checked first) ──────────────────────────────
  const pasTrip = await getPlanAStayTrip(slug)
  if (pasTrip) {
    return <PlanAStayPage pasTrip={pasTrip} slug={slug} t={t} />
  }

  // ── Road trip (v1 fallback) ───────────────────────────────────────
  const trip = await getTrip(slug)
  if (!trip) notFound()

  const days = trip.days || []
  const totalStops = countStops(days)
  const singleDay = isSingleDay(days)

  return (
    <div style={{ background: '#F8F6F1', minHeight: '100vh' }}>

      {/* Hero */}
      <section style={{
        background: '#1c1a17',
        padding: '72px 24px 56px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Dot grid texture */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, #f0ece4 1px, transparent 1px)',
          backgroundSize: '16px 16px', opacity: 0.06, pointerEvents: 'none',
        }} />
        <div style={{ maxWidth: 900, margin: '0 auto', position: 'relative' }}>
          <div style={{
            fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.4)', marginBottom: 14,
            fontFamily: 'var(--font-body)',
          }}>
            {t('routeKicker', { start: trip.start_name, end: trip.end_name })}
          </div>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(28px, 4vw, 48px)',
            fontWeight: 400,
            color: '#fff',
            lineHeight: 1.15,
            marginBottom: 20,
          }}>
            {trip.title}
          </h1>

          {/* Route stats */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            fontSize: 13, color: 'rgba(255,255,255,0.45)',
            fontFamily: 'var(--font-body)', flexWrap: 'wrap',
          }}>
            {formatDistance(trip.route_distance_km, t) && (
              <span>{formatDistance(trip.route_distance_km, t)}</span>
            )}
            {formatDuration(trip.route_duration_minutes, t) && (
              <>
                <span style={{ opacity: 0.3 }}>|</span>
                <span>{t('driveDuration', { duration: formatDuration(trip.route_duration_minutes, t) })}</span>
              </>
            )}
            {totalStops > 0 && (
              <>
                <span style={{ opacity: 0.3 }}>|</span>
                <span>{t('stopsCount', { count: totalStops })}</span>
              </>
            )}
            {days.length > 1 && (
              <>
                <span style={{ opacity: 0.3 }}>|</span>
                <span>{t('daysCount', { count: days.length })}</span>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Editorial intro */}
      {trip.intro && (
        <section style={{
          background: '#F3F0EA',
          borderBottom: '1px solid rgba(108,103,96,0.12)',
        }}>
          <div style={{ maxWidth: 700, margin: '0 auto', padding: '48px 24px' }}>
            <p style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(17px, 2.5vw, 20px)',
              fontWeight: 400,
              color: '#1C1A17',
              lineHeight: 1.75,
              fontStyle: 'italic',
              margin: 0,
            }}>
              {trip.intro}
            </p>
          </div>
        </section>
      )}

      {/* Stops */}
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '48px 24px 24px' }}>
        {singleDay ? (
          <StopList stops={days[0].stops || days[0].listings || []} t={t} />
        ) : (
          days.map((day, dayIndex) => (
            <DaySection key={dayIndex} day={day} dayIndex={dayIndex} isLast={dayIndex === days.length - 1} t={t} />
          ))
        )}
      </div>

      {/* CTA */}
      <section style={{
        maxWidth: 700, margin: '0 auto',
        padding: '24px 24px 80px',
      }}>
        <div style={{
          borderTop: '1px solid rgba(108,103,96,0.12)',
          paddingTop: 48,
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
            color: '#6B6760', marginBottom: 12,
            fontFamily: 'var(--font-body)',
          }}>
            {t('inspiredKicker')}
          </div>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(20px, 3vw, 28px)',
            fontWeight: 400,
            color: '#1C1A17',
            marginBottom: 24,
            lineHeight: 1.2,
          }}>
            {t('planYourOwnRoadTrip')}
          </h2>
          <p style={{
            fontSize: 14, color: '#6B6760', lineHeight: 1.7,
            fontFamily: 'var(--font-body)',
            maxWidth: 440, margin: '0 auto 32px',
          }}>
            {t('planYourOwnRoadTripBody')}
          </p>
          <Link
            href="/on-this-road"
            style={{
              display: 'inline-block',
              padding: '14px 32px',
              background: '#1C1A17',
              color: '#F8F6F1',
              textDecoration: 'none',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-body)',
              borderRadius: 2,
            }}
          >
            {t('planATrip')}
          </Link>
        </div>
      </section>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   Plan-a-Stay shared trip page
   ═══════════════════════════════════════════════════════════════════════ */
function PlanAStayPage({ pasTrip, slug, t }) {
  const region = pasTrip.answers?.region || 'Australia'

  return (
    <div style={{ background: '#F8F6F1', minHeight: '100vh' }}>
      {/* Minimal header bar */}
      <div style={{
        padding: '20px 24px',
        borderBottom: '1px solid var(--color-border, rgba(28,26,23,0.12))',
      }}>
        <div style={{
          maxWidth: 720,
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <Link
            href="/"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 14,
              color: 'var(--color-ink, #1C1A17)',
              textDecoration: 'none',
              opacity: 0.6,
            }}
          >
            Australian Atlas
          </Link>
          <Link
            href="/plan-a-stay-v2"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--color-ink, #1C1A17)',
              textDecoration: 'none',
              padding: '6px 16px',
              border: '1px solid var(--color-border, rgba(28,26,23,0.12))',
              borderRadius: 6,
            }}
          >
            {t('planYourOwn')}
          </Link>
        </div>
      </div>

      <div style={{ padding: '0 24px' }}>
        {/* Stays-only */}
        {pasTrip.stays_only ? (
          <StaysOnlyRender staysOnly={pasTrip.stays_only} />
        ) : pasTrip.trip ? (
          <TripRender trip={pasTrip.trip} />
        ) : (
          <div style={{ padding: '64px 0', textAlign: 'center' }}>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: 15,
              color: 'var(--color-muted, #6B6760)',
            }}>
              {t('tripUnavailable')}
            </p>
          </div>
        )}
      </div>

      {/* CTA */}
      <section style={{
        maxWidth: 520, margin: '0 auto',
        padding: '0 24px 80px',
      }}>
        <div style={{
          borderTop: '1px solid rgba(108,103,96,0.12)',
          paddingTop: 40,
          textAlign: 'center',
        }}>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--color-muted, #6B6760)',
            lineHeight: 1.6,
            marginBottom: 20,
          }}>
            {t('builtWithPlanAStay')}
          </p>
          <Link
            href="/plan-a-stay-v2"
            style={{
              display: 'inline-block',
              padding: '12px 28px',
              background: 'var(--color-ink, #1C1A17)',
              color: '#F8F6F1',
              textDecoration: 'none',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-body)',
              borderRadius: 4,
            }}
          >
            {t('planYourOwnStay')}
          </Link>
        </div>
      </section>
    </div>
  )
}


/* ---------- Day section (multi-day trips) ---------- */

function DaySection({ day, dayIndex, isLast, t }) {
  const stops = day.stops || day.listings || []
  const dayLabel = day.label || t('dayLabel', { n: dayIndex + 1 })

  return (
    <div style={{ marginBottom: isLast ? 0 : 48 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 24,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: '#1C1A17', color: '#F8F6F1',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700,
          fontFamily: 'var(--font-body)',
        }}>
          {dayIndex + 1}
        </div>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22, fontWeight: 400,
          color: '#1C1A17', margin: 0,
        }}>
          {dayLabel}
        </h2>
        {day.overnight_location && (
          <span style={{
            fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: '#8a5a6b', fontFamily: 'var(--font-body)', fontWeight: 600,
            background: 'rgba(138,90,107,0.08)', padding: '3px 10px', borderRadius: 3,
            marginLeft: 'auto',
          }}>
            {t('stayAt', { location: day.overnight_location })}
          </span>
        )}
      </div>
      <StopList stops={stops} t={t} />
    </div>
  )
}

/* ---------- Stop list ---------- */

function StopList({ stops, t }) {
  if (!stops || stops.length === 0) {
    return (
      <p style={{ fontSize: 14, color: '#6B6760', fontFamily: 'var(--font-body)' }}>
        {t('noStopsOnLeg')}
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {stops.map((stop, index) => (
        <StopCard
          key={stop.listing_id || stop.slug || index}
          stop={stop}
          index={index}
          isLast={index === stops.length - 1}
          t={t}
        />
      ))}
    </div>
  )
}

/* ---------- Individual stop card ---------- */

function StopCard({ stop, index, isLast, t }) {
  const vertical = stop.vertical || null
  const verticalColor = VERTICAL_COLORS[vertical] || '#6B6760'
  const verticalName = VERTICAL_NAMES[vertical] || null
  const isOvernight = stop.is_overnight || stop.overnight || false
  const heroImage = stop.hero_image_url || stop.image_url || null
  const stopSlug = stop.slug || null
  const reason = stop.reason || stop.notes || stop.description || null

  return (
    <div style={{ display: 'flex', gap: 16, position: 'relative', paddingBottom: isLast ? 0 : 24 }}>
      {/* Connecting line */}
      {!isLast && (
        <div style={{
          position: 'absolute', left: 17, top: 42,
          width: 1, height: 'calc(100% - 18px)',
          background: 'rgba(108,103,96,0.15)',
        }} />
      )}

      {/* Number badge */}
      <div style={{
        flexShrink: 0, width: 36, height: 36, borderRadius: '50%',
        background: verticalColor, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 13, zIndex: 1, marginTop: 4,
        fontFamily: 'var(--font-body)',
      }}>
        {index + 1}
      </div>

      {/* Card */}
      <div style={{
        flex: 1,
        background: isOvernight ? '#EDEAE4' : '#fff',
        border: '1px solid rgba(108,103,96,0.12)',
        borderRadius: 3,
        overflow: 'hidden',
      }}>
        {/* Hero thumbnail */}
        {heroImage && (
          <div style={{ aspectRatio: '16/7', overflow: 'hidden' }}>
            <img
              src={heroImage}
              alt={stop.listing_name || stop.name || ''}
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        )}

        <div style={{ padding: '16px 20px' }}>
          {/* Top row: name + vertical badge */}
          <div style={{
            display: 'flex', alignItems: 'flex-start',
            justifyContent: 'space-between', gap: 8,
            marginBottom: reason ? 8 : 0,
          }}>
            <div>
              {stopSlug ? (
                <Link
                  href={`/place/${stopSlug}`}
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 18, fontWeight: 400,
                    color: '#1C1A17', textDecoration: 'none',
                  }}
                >
                  {stop.listing_name || stop.name}
                </Link>
              ) : (
                <span style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 18, fontWeight: 400,
                  color: '#1C1A17',
                }}>
                  {stop.listing_name || stop.name}
                </span>
              )}

              {/* Overnight badge */}
              {isOvernight && (
                <span style={{
                  display: 'inline-block',
                  marginLeft: 10,
                  fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase',
                  fontFamily: 'var(--font-body)', fontWeight: 600,
                  color: '#8a5a6b',
                  background: 'rgba(138,90,107,0.1)',
                  padding: '2px 8px', borderRadius: 3,
                  verticalAlign: 'middle',
                }}>
                  {t('stayTonight')}
                </span>
              )}
            </div>

            {verticalName && (
              <span style={{
                fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
                fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
                marginTop: 4, fontWeight: 600,
                color: verticalColor,
                background: `${verticalColor}12`,
                padding: '2px 8px', borderRadius: 3,
              }}>
                {verticalName}
              </span>
            )}
          </div>

          {/* Reason / notes */}
          {reason && (
            <p style={{
              fontSize: 13, color: '#6B6760', lineHeight: 1.65,
              fontFamily: 'var(--font-body)', fontStyle: 'italic',
              margin: 0,
              borderTop: '1px solid rgba(108,103,96,0.08)',
              paddingTop: 10, marginTop: 6,
            }}>
              {reason}
            </p>
          )}

          {/* View listing link */}
          {stopSlug && (
            <Link
              href={`/place/${stopSlug}`}
              style={{
                display: 'inline-block', marginTop: 12,
                fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: verticalColor,
                textDecoration: 'none', fontFamily: 'var(--font-body)',
              }}
            >
              {t('viewListing')} &rarr;
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
