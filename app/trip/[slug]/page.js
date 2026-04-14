import { cache } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const revalidate = 3600

const VERTICAL_COLORS = {
  sba: '#6b3a2a',
  collection: '#5a6b7c',
  craft: '#7c6b5a',
  fine_grounds: '#5F8A7E',
  rest: '#8a5a6b',
  field: '#5a7c5a',
  corner: '#7c5a7c',
  found: '#5a7c6b',
  table: '#7c6b5a',
}

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

const getTrip = cache(async function getTrip(slug) {
  const sb = getSupabaseAdmin()
  const { data } = await sb
    .from('road_trips')
    .select('*')
    .eq('slug', slug)
    .single()
  return data
})

export async function generateMetadata({ params }) {
  const { slug } = await params
  const trip = await getTrip(slug)
  if (!trip) return {}
  const description = trip.intro || `A road trip from ${trip.start_name} to ${trip.end_name} via the Australian Atlas network.`
  return {
    title: `${trip.title} | Australian Atlas`,
    description,
    openGraph: {
      title: trip.title,
      description,
      url: `https://australianatlas.com.au/trip/${slug}`,
      siteName: 'Australian Atlas',
      locale: 'en_AU',
      type: 'article',
    },
    alternates: {
      canonical: `https://australianatlas.com.au/trip/${slug}`,
    },
  }
}

/** Format km into a readable string */
function formatDistance(km) {
  if (!km) return null
  return km >= 1000 ? `${(km / 1000).toFixed(1)}k km` : `${Math.round(km)} km`
}

/** Format minutes into hours + minutes */
function formatDuration(minutes) {
  if (!minutes) return null
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} hr`
  return `${h} hr ${m} min`
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
            {trip.start_name} to {trip.end_name}
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
            {formatDistance(trip.route_distance_km) && (
              <span>{formatDistance(trip.route_distance_km)}</span>
            )}
            {formatDuration(trip.route_duration_minutes) && (
              <>
                <span style={{ opacity: 0.3 }}>|</span>
                <span>{formatDuration(trip.route_duration_minutes)} drive</span>
              </>
            )}
            {totalStops > 0 && (
              <>
                <span style={{ opacity: 0.3 }}>|</span>
                <span>{totalStops} {totalStops === 1 ? 'stop' : 'stops'}</span>
              </>
            )}
            {days.length > 1 && (
              <>
                <span style={{ opacity: 0.3 }}>|</span>
                <span>{days.length} days</span>
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
          <StopList stops={days[0].stops || days[0].listings || []} />
        ) : (
          days.map((day, dayIndex) => (
            <DaySection key={dayIndex} day={day} dayIndex={dayIndex} isLast={dayIndex === days.length - 1} />
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
            Inspired?
          </div>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(20px, 3vw, 28px)',
            fontWeight: 400,
            color: '#1C1A17',
            marginBottom: 24,
            lineHeight: 1.2,
          }}>
            Plan your own road trip
          </h2>
          <p style={{
            fontSize: 14, color: '#6B6760', lineHeight: 1.7,
            fontFamily: 'var(--font-body)',
            maxWidth: 440, margin: '0 auto 32px',
          }}>
            Set your start and end points, choose your pace, and we will find
            the best independent stops along the way.
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
            Plan a trip
          </Link>
        </div>
      </section>
    </div>
  )
}

/* ---------- Day section (multi-day trips) ---------- */

function DaySection({ day, dayIndex, isLast }) {
  const stops = day.stops || day.listings || []
  const dayLabel = day.label || `Day ${dayIndex + 1}`

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
            Stay: {day.overnight_location}
          </span>
        )}
      </div>
      <StopList stops={stops} />
    </div>
  )
}

/* ---------- Stop list ---------- */

function StopList({ stops }) {
  if (!stops || stops.length === 0) {
    return (
      <p style={{ fontSize: 14, color: '#6B6760', fontFamily: 'var(--font-body)' }}>
        No stops on this leg.
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
        />
      ))}
    </div>
  )
}

/* ---------- Individual stop card ---------- */

function StopCard({ stop, index, isLast }) {
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
                  Stay tonight
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
              View listing &rarr;
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
