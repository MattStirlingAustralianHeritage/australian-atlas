import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import ListingCard from '@/components/ListingCard'
import RegionMap from '@/components/RegionMap'
import { getVerticalBadge } from '@/lib/verticalUrl'
import { VERTICAL_STYLES } from '@/components/VerticalBadge'

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

async function getRegion(slug) {
  const sb = getSupabaseAdmin()
  const { data } = await sb.from('regions').select('*').eq('slug', slug).single()
  return data
}

async function getRegionListings(regionName) {
  const sb = getSupabaseAdmin()
  const { data } = await sb
    .from('listings')
    .select('id, vertical, name, slug, description, region, state, lat, lng, hero_image_url, is_featured, is_claimed, website')
    .eq('status', 'active')
    .ilike('region', `%${regionName}%`)
    .order('is_featured', { ascending: false })
    .order('name')
    .limit(200)
  return data || []
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

  const listings = await getRegionListings(region.name)

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

  // Get editorial content (prefer long_description, fall back to generated_intro)
  const editorial = region.long_description || region.generated_intro

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Hero section — full-width image */}
      {region.hero_image_url ? (
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: 'clamp(320px, 50vh, 520px)',
            backgroundColor: region.hero_color || '#2D2A26',
            overflow: 'hidden',
          }}
        >
          <img
            src={region.hero_image_url}
            alt={region.name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center 40%',
            }}
          />
          {/* Gradient overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.1) 40%, transparent 70%)',
            }}
          />
          {/* Region name over image */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              padding: 'clamp(1.5rem, 4vw, 3rem)',
              maxWidth: '72rem',
              margin: '0 auto',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 500,
                fontSize: '11px',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--color-accent)',
                marginBottom: '0.5rem',
              }}
            >
              {STATE_LABELS[region.state] || region.state}
            </p>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 400,
                fontStyle: 'italic',
                fontSize: 'clamp(2rem, 5vw, 3.25rem)',
                color: '#fff',
                lineHeight: 1.1,
                margin: 0,
              }}
            >
              {region.name}
            </h1>
          </div>
          {/* Image credit */}
          {region.hero_image_credit && (
            <span
              style={{
                position: 'absolute',
                bottom: '0.75rem',
                right: '1rem',
                fontSize: '10px',
                color: 'rgba(255,255,255,0.4)',
                fontFamily: 'var(--font-body)',
              }}
            >
              {region.hero_image_credit}
            </span>
          )}
        </div>
      ) : (
        /* Fallback: no hero image — typographic header */
        <div style={{ background: 'var(--color-ink)', padding: '4rem 1.5rem 3rem' }}>
          <div style={{ maxWidth: '72rem', margin: '0 auto' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-accent)', marginBottom: '0.5rem' }}>
              {STATE_LABELS[region.state] || region.state}
            </p>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontStyle: 'italic', fontSize: 'clamp(2rem, 5vw, 3.25rem)', color: '#fff', margin: 0 }}>
              {region.name}
            </h1>
          </div>
        </div>
      )}

      {/* Content area */}
      <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '0 1.5rem' }}>

        {/* Breadcrumb */}
        <nav style={{ padding: '1.25rem 0', fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '12px', color: 'var(--color-muted)' }}>
          <Link href="/regions" style={{ color: 'var(--color-muted)', textDecoration: 'none' }}>Regions</Link>
          <span style={{ margin: '0 0.5rem' }}>/</span>
          <Link href={`/regions?state=${region.state}`} style={{ color: 'var(--color-muted)', textDecoration: 'none' }}>{STATE_LABELS[region.state]}</Link>
          <span style={{ margin: '0 0.5rem' }}>/</span>
          <span style={{ color: 'var(--color-ink)' }}>{region.name}</span>
        </nav>

        {/* Tagline + vertical pills */}
        <div style={{ maxWidth: '40rem', paddingBottom: '2rem', borderBottom: '1px solid var(--color-border)' }}>
          {region.description && (
            <p style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '1.05rem', color: 'var(--color-ink)', lineHeight: 1.6, margin: '0 0 1.25rem' }}>
              {region.description}
            </p>
          )}

          {/* Vertical breakdown pills */}
          {Object.keys(verticalCounts).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {Object.entries(verticalCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([v, count]) => {
                  const vs = VERTICAL_STYLES[v]
                  return (
                    <span
                      key={v}
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
                      }}
                    >
                      {vs?.label || getVerticalBadge(v)} <strong style={{ fontWeight: 600 }}>{count}</strong>
                    </span>
                  )
                })}
            </div>
          )}
        </div>

        {/* Editorial prose */}
        {editorial && (
          <div
            style={{
              maxWidth: '38rem',
              padding: '2.5rem 0 2rem',
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
                  marginBottom: '1.25rem',
                }}
              >
                {paragraph}
              </p>
            ))}
          </div>
        )}

        {/* Map */}
        {mapPoints.length > 0 && (
          <div style={{ margin: '2.5rem 0', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
            <RegionMap points={mapPoints} regionName={region.name} />
          </div>
        )}

        {/* Listings grouped by vertical */}
        {listings.length > 0 ? (
          <div style={{ paddingBottom: '4rem' }}>
            {activeVerticals.map((vertical, idx) => {
              const items = grouped[vertical]
              const label = VERTICAL_LABELS[vertical] || vertical
              const color = VERTICAL_COLORS[vertical] || 'var(--color-muted)'

              return (
                <section key={vertical} style={{ marginTop: idx === 0 ? '2rem' : '2.5rem' }}>
                  {/* Section header */}
                  <div
                    style={{
                      borderTop: '1px solid var(--color-border)',
                      paddingTop: '1.5rem',
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
      </div>
    </div>
  )
}
