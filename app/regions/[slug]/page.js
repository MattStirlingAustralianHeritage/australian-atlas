import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import ListingCard from '@/components/ListingCard'
import RegionMap from '@/components/RegionMap'
import { getVerticalBadge } from '@/lib/verticalUrl'
import { VERTICAL_STYLES } from '@/components/VerticalBadge'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const VERTICAL_ORDER = ['sba', 'fine_grounds', 'collection', 'craft', 'rest', 'field', 'corner', 'found', 'table']

const VERTICAL_LABELS = {
  sba: 'Small Batch',
  fine_grounds: 'Fine Grounds',
  collection: 'Collections',
  craft: 'Craft',
  rest: 'Rest',
  field: 'Field',
  corner: 'Corner',
  found: 'Found',
  table: 'Table',
}

const VERTICAL_COLORS = {
  sba: '#C49A3C',
  fine_grounds: '#8A7055',
  collection: '#7A6B8A',
  craft: '#C1603A',
  rest: '#5A8A9A',
  field: '#4A7C59',
  corner: '#5F8A7E',
  found: '#D4956A',
  table: '#C4634F',
}

const STATE_LABELS = {
  VIC: 'Victoria', NSW: 'New South Wales', QLD: 'Queensland', SA: 'South Australia',
  WA: 'Western Australia', TAS: 'Tasmania', ACT: 'Australian Capital Territory', NT: 'Northern Territory',
}

const MAPBOX_STYLE = 'mapbox/light-v11'
const MAX_EDITORIAL_WORDS = 250

async function getRegion(slug) {
  const sb = getSupabaseAdmin()
  const { data } = await sb.from('regions').select('*').eq('slug', slug).single()
  return data
}

// Approximate bounding box size (in degrees) from map zoom level
function zoomToRadiusDeg(zoom) {
  const lookup = { 6: 3.0, 7: 1.5, 8: 0.75, 9: 0.5, 10: 0.3, 11: 0.15, 12: 0.08 }
  return lookup[zoom] || 0.5
}

async function getRegionListings(region) {
  const sb = getSupabaseAdmin()

  // Primary: geographic bounding box from region center coordinates
  if (region.center_lat && region.center_lng) {
    const radius = zoomToRadiusDeg(region.map_zoom || 9)
    const { data } = await sb
      .from('listings')
      .select('id, vertical, name, slug, description, region, state, lat, lng, hero_image_url, is_featured, is_claimed, website')
      .eq('status', 'active')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .gte('lat', region.center_lat - radius)
      .lte('lat', region.center_lat + radius)
      .gte('lng', region.center_lng - radius)
      .lte('lng', region.center_lng + radius)
      .order('is_featured', { ascending: false })
      .order('name')
      .limit(200)
    if (data && data.length > 0) return data
  }

  // Fallback: text match on region name + state (for regions without coordinates)
  const regionName = region.name
  let query = sb
    .from('listings')
    .select('id, vertical, name, slug, description, region, state, lat, lng, hero_image_url, is_featured, is_claimed, website')
    .eq('status', 'active')

  if (region.state) {
    query = query.eq('state', region.state)
  }

  // Try matching on region column or address
  query = query.or(`region.ilike.%${regionName}%,address.ilike.%${regionName}%`)

  const { data } = await query
    .order('is_featured', { ascending: false })
    .order('name')
    .limit(200)
  return data || []
}

// Truncate editorial text to MAX_EDITORIAL_WORDS as a safety net
function truncateEditorial(text) {
  if (!text) return null
  const words = text.split(/\s+/)
  if (words.length <= MAX_EDITORIAL_WORDS) return text
  // Find the end of the last complete sentence within the limit
  const truncated = words.slice(0, MAX_EDITORIAL_WORDS).join(' ')
  const lastPeriod = truncated.lastIndexOf('.')
  if (lastPeriod > truncated.length * 0.5) {
    return truncated.substring(0, lastPeriod + 1)
  }
  return truncated + '…'
}

// Generate hero Mapbox static URL from stored coordinates
function getHeroMapUrl(region) {
  if (region.hero_image_url) return region.hero_image_url
  if (!region.center_lat || !region.center_lng) return null
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const zoom = (region.map_zoom || 9) - 1
  return `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/static/${region.center_lng},${region.center_lat},${zoom},0/1280x500@2x?access_token=${token}`
}

export async function generateMetadata({ params }) {
  const { slug } = await params
  const region = await getRegion(slug)
  if (!region) return { title: 'Region not found' }
  return {
    title: `${region.name}, ${STATE_LABELS[region.state] || region.state} — Australian Atlas`,
    description: region.description || `Discover independent places in ${region.name}`,
  }
}

export default async function RegionPage({ params }) {
  const { slug } = await params
  const region = await getRegion(slug)
  if (!region) notFound()

  const listings = await getRegionListings(region)

  // Group by vertical
  const grouped = {}
  for (const l of listings) {
    if (!grouped[l.vertical]) grouped[l.vertical] = []
    grouped[l.vertical].push(l)
  }

  const verticalCounts = {}
  for (const l of listings) {
    verticalCounts[l.vertical] = (verticalCounts[l.vertical] || 0) + 1
  }

  const activeVerticals = VERTICAL_ORDER.filter(v => grouped[v]?.length > 0)

  // Collect map points
  const mapPoints = listings
    .filter(l => l.lat && l.lng)
    .map(l => ({ lat: l.lat, lng: l.lng, name: l.name, vertical: l.vertical }))

  // Get editorial content — truncated to 250 words
  const rawEditorial = region.long_description || region.generated_intro
  const editorial = truncateEditorial(rawEditorial)

  const heroUrl = getHeroMapUrl(region)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* Hero — full-width Mapbox static map */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 'clamp(280px, 40vh, 420px)',
          backgroundColor: region.hero_color || '#2D2A26',
          overflow: 'hidden',
        }}
      >
        {heroUrl && (
          <img
            src={heroUrl}
            alt={`Map of ${region.name}`}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center',
            }}
          />
        )}

        {/* Subtle bottom gradient for text legibility */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.05) 40%, transparent 70%)',
          }}
        />

        {/* Region name + state pill */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: 'clamp(1.25rem, 3vw, 2.5rem)',
            maxWidth: '72rem',
            margin: '0 auto',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
              fontSize: '10.5px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#fff',
              background: 'rgba(255,255,255,0.15)',
              backdropFilter: 'blur(8px)',
              padding: '0.25rem 0.625rem',
              borderRadius: '100px',
              marginBottom: '0.625rem',
            }}
          >
            {STATE_LABELS[region.state] || region.state}
          </span>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              fontSize: 'clamp(1.75rem, 4.5vw, 2.75rem)',
              color: '#fff',
              lineHeight: 1.1,
              margin: 0,
            }}
          >
            {region.name}
          </h1>
        </div>
      </div>

      {/* Region header section — description + vertical pills */}
      <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '0 1.5rem' }}>
        <div
          style={{
            padding: '1.5rem 0 1.75rem',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          {/* Breadcrumb */}
          <nav
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 300,
              fontSize: '12px',
              color: 'var(--color-muted)',
              marginBottom: '1rem',
            }}
          >
            <Link href="/regions" style={{ color: 'var(--color-muted)', textDecoration: 'none' }}>Regions</Link>
            <span style={{ margin: '0 0.5rem' }}>/</span>
            <span style={{ color: 'var(--color-ink)' }}>{region.name}</span>
          </nav>

          {/* Description */}
          {region.description && (
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 400,
                fontSize: '1rem',
                color: 'var(--color-ink)',
                lineHeight: 1.6,
                margin: '0 0 1.25rem',
                maxWidth: '42rem',
              }}
            >
              {region.description}
            </p>
          )}

          {/* Vertical breakdown pills — clickable filters */}
          {Object.keys(verticalCounts).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {Object.entries(verticalCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([v, count]) => {
                  const vs = VERTICAL_STYLES[v]
                  return (
                    <a
                      key={v}
                      href={`#vertical-${v}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        padding: '0.375rem 0.75rem',
                        borderRadius: '100px',
                        backgroundColor: vs?.bg || '#F1EFE8',
                        color: vs?.text || '#5F5E5A',
                        fontFamily: 'var(--font-body)',
                        fontWeight: 400,
                        fontSize: '12px',
                        textDecoration: 'none',
                        transition: 'opacity 0.15s',
                      }}
                    >
                      {vs?.label || getVerticalBadge(v)} <strong style={{ fontWeight: 600 }}>{count}</strong>
                    </a>
                  )
                })}
            </div>
          )}
        </div>

        {/* Editorial prose — capped at 250 words */}
        {editorial && (
          <div
            style={{
              maxWidth: '38rem',
              padding: '2rem 0 1.75rem',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            {editorial.split('\n\n').map((paragraph, i) => (
              <p
                key={i}
                style={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: 300,
                  fontSize: '15px',
                  lineHeight: 1.75,
                  color: 'var(--color-ink)',
                  marginBottom: '1rem',
                }}
              >
                {paragraph}
              </p>
            ))}
          </div>
        )}

        {/* Listings grouped by vertical — the product */}
        {listings.length > 0 ? (
          <div style={{ paddingBottom: '4rem' }}>
            {activeVerticals.map((vertical, idx) => {
              const items = grouped[vertical]
              const label = VERTICAL_LABELS[vertical] || vertical
              const color = VERTICAL_COLORS[vertical] || 'var(--color-muted)'

              return (
                <section key={vertical} id={`vertical-${vertical}`} style={{ marginTop: idx === 0 ? '1.75rem' : '2.5rem' }}>
                  {/* Section header */}
                  <div
                    style={{
                      borderTop: '1px solid var(--color-border)',
                      paddingTop: '1.25rem',
                      marginBottom: '1.25rem',
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: '0.5rem',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '11px',
                        fontWeight: 600,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: color,
                      }}
                    >
                      {label}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '11px',
                        fontWeight: 400,
                        color: color,
                        opacity: 0.7,
                      }}
                    >
                      &middot; {items.length} {items.length === 1 ? 'listing' : 'listings'}
                    </span>
                  </div>

                  {/* Grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                      gap: '1.25rem',
                    }}
                  >
                    {items.map(listing => (
                      <ListingCard key={listing.id} listing={listing} />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '4rem 0' }}>
            <p style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-body)', fontSize: '15px' }}>
              No listings synced for this region yet.
            </p>
            <p style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-body)', fontSize: '13px', marginTop: '0.5rem' }}>
              Listings will appear here once the next sync completes.
            </p>
          </div>
        )}

        {/* Map — after listings for regions with points */}
        {mapPoints.length > 0 && (
          <div style={{ margin: '0 0 4rem', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
            <RegionMap points={mapPoints} regionName={region.name} />
          </div>
        )}
      </div>
    </div>
  )
}
