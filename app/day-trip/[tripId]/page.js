import { cache } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import DayTripCard from '@/components/DayTripCard'

export const revalidate = 3600

const getTrip = cache(async function getTrip(tripId) {
  const sb = getSupabaseAdmin()

  // Load all trail rows sharing this trip_id
  const { data: trails, error } = await sb
    .from('trails')
    .select('id, title, trip_id, base_listing_id, day_number, day_theme, total_distance_km, estimated_drive_minutes, region, created_at')
    .eq('trip_id', tripId)
    .in('visibility', ['link', 'public'])
    .order('day_number', { ascending: true })

  if (error || !trails || trails.length === 0) return null

  // Load the base listing
  const baseListingId = trails[0].base_listing_id
  let base = null
  if (baseListingId) {
    const { data: listing } = await sb
      .from('listings')
      .select('id, name, slug, lat, lng, region, state, vertical')
      .eq('id', baseListingId)
      .single()
    base = listing
  }

  // Load stops for each trail
  const trailIds = trails.map(t => t.id)
  const { data: allStops } = await sb
    .from('trail_stops')
    .select('id, trail_id, listing_id, vertical, venue_name, venue_lat, venue_lng, venue_image_url, order_index, notes, distance_from_base_km, bearing_from_base_deg, listings(slug)')
    .in('trail_id', trailIds)
    .order('order_index', { ascending: true })

  // Group stops by trail_id
  const stopsByTrail = {}
  for (const stop of (allStops || [])) {
    if (!stopsByTrail[stop.trail_id]) stopsByTrail[stop.trail_id] = []
    stopsByTrail[stop.trail_id].push(stop)
  }

  // Assemble days
  const days = trails.map(trail => ({
    day_number: trail.day_number,
    theme: trail.day_theme || trail.title,
    total_distance_km: trail.total_distance_km || 0,
    estimated_drive_minutes: trail.estimated_drive_minutes || 0,
    direction: null,
    stops: (stopsByTrail[trail.id] || []).map(stop => ({
      listing_id: stop.listing_id,
      name: stop.venue_name,
      slug: stop.listings?.slug || null,
      lat: stop.venue_lat,
      lng: stop.venue_lng,
      vertical: stop.vertical,
      hero_image_url: stop.venue_image_url,
      description_snippet: stop.notes,
      distance_from_base_km: stop.distance_from_base_km || 0,
      bearing_from_base_deg: stop.bearing_from_base_deg || 0,
    })),
  }))

  return { trails, days, base, region: trails[0].region }
})

export async function generateMetadata({ params }) {
  const { tripId } = await params
  const trip = await getTrip(tripId)
  if (!trip) return {}

  const baseName = trip.base?.name || 'your base'
  const dayCount = trip.days.length
  const stopCount = trip.days.reduce((n, d) => n + d.stops.length, 0)

  return {
    title: `${dayCount} days from ${baseName} | Australian Atlas`,
    description: `${dayCount} day trips, ${stopCount} stops — explore from ${baseName} across the Australian Atlas network.`,
    openGraph: {
      title: `${dayCount} days from ${baseName}`,
      description: `${dayCount} day trips, ${stopCount} stops — explore from ${baseName}.`,
      url: `https://australianatlas.com.au/day-trip/${tripId}`,
      siteName: 'Australian Atlas',
      locale: 'en_AU',
      type: 'article',
    },
    alternates: {
      canonical: `https://australianatlas.com.au/day-trip/${tripId}`,
    },
  }
}

export default async function DayTripPage({ params }) {
  const { tripId } = await params
  const trip = await getTrip(tripId)
  if (!trip) notFound()

  const { days, base } = trip
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
  const baseName = base?.name || 'your accommodation'
  const totalStops = days.reduce((n, d) => n + d.stops.length, 0)

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* Hero */}
      <section style={{
        background: '#1c1a17',
        padding: '72px 24px 56px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        position: 'relative', overflow: 'hidden',
      }}>
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
            Stay here, explore from here
            {trip.region ? ` \u00b7 ${trip.region}` : ''}
          </div>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(28px, 4vw, 48px)',
            fontWeight: 400, color: '#fff',
            lineHeight: 1.15, marginBottom: 20,
          }}>
            {days.length} days from {baseName}
          </h1>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            fontSize: 13, color: 'rgba(255,255,255,0.45)',
            fontFamily: 'var(--font-body)', flexWrap: 'wrap',
          }}>
            <span>{days.length} day{days.length !== 1 ? 's' : ''}</span>
            <span style={{ opacity: 0.3 }}>|</span>
            <span>{totalStops} stops</span>
            {base && (
              <>
                <span style={{ opacity: 0.3 }}>|</span>
                <span>Based at {baseName}</span>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Base listing link */}
      {base?.slug && (
        <section style={{
          background: 'var(--color-cream)',
          borderBottom: '1px solid var(--color-border)',
        }}>
          <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
                color: 'var(--color-muted)', fontFamily: 'var(--font-body)', fontWeight: 600,
              }}>
                Your base
              </span>
              <Link
                href={`/place/${base.slug}`}
                style={{
                  fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 400,
                  color: 'var(--color-ink)', textDecoration: 'none',
                }}
              >
                {base.name} &rarr;
              </Link>
              {base.region && (
                <span style={{
                  fontSize: 12, color: 'var(--color-muted)',
                  fontFamily: 'var(--font-body)',
                }}>
                  {base.region}{base.state ? `, ${base.state}` : ''}
                </span>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Day cards */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '48px 24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {days.map(day => (
            <DayTripCard
              key={day.day_number}
              day={day}
              base={base ? { lat: base.lat, lng: base.lng } : null}
              mapboxToken={mapboxToken}
            />
          ))}
        </div>
      </div>

      {/* CTA */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '24px 24px 80px' }}>
        <div style={{
          borderTop: '1px solid var(--color-border)', paddingTop: 48,
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
            color: 'var(--color-muted)', marginBottom: 12,
            fontFamily: 'var(--font-body)',
          }}>
            Planning a trip?
          </div>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(20px, 3vw, 28px)',
            fontWeight: 400, color: 'var(--color-ink)',
            marginBottom: 24, lineHeight: 1.2,
          }}>
            Discover more places to stay
          </h2>
          <p style={{
            fontSize: 14, color: 'var(--color-muted)', lineHeight: 1.7,
            fontFamily: 'var(--font-body)',
            maxWidth: 440, margin: '0 auto 32px',
          }}>
            Find independently run accommodation across Australia and plan day trips from any base.
          </p>
          <Link
            href="/explore?vertical=rest"
            style={{
              display: 'inline-block', padding: '14px 32px',
              background: 'var(--color-ink)', color: '#fff',
              textDecoration: 'none', fontSize: 12, fontWeight: 600,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              fontFamily: 'var(--font-body)', borderRadius: 2,
            }}
          >
            Browse Rest Atlas
          </Link>
        </div>
      </section>
    </div>
  )
}
