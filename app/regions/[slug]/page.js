import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import RegionMapHero from '@/components/RegionMapHero'

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

const VERTICAL_DESCRIPTIONS = {
  sba: 'Distilleries, wineries, and artisan producers',
  collection: 'Galleries, museums, and cultural collections',
  craft: 'Makers, studios, and artisan workshops',
  fine_grounds: 'Specialty coffee roasters',
  rest: 'Boutique stays and unique accommodation',
  field: 'Nature experiences and outdoor places',
  corner: 'Independent shops and curated retail',
  found: 'Vintage, antique, and secondhand finds',
  table: 'Independent dining and food producers',
}

const VERTICAL_URLS = {
  sba: 'https://smallbatchatlas.com.au/venue',
  collection: 'https://collectionatlas.com.au/venue',
  craft: 'https://craftatlas.com.au/venue',
  fine_grounds: 'https://finegroundsatlas.com.au/roasters',
  rest: 'https://restatlas.com.au/stay',
  field: 'https://fieldatlas.com.au/places',
  corner: 'https://corneratlas.com.au/shops',
  found: 'https://foundatlas.com.au/shops',
  table: 'https://tableatlas.com.au/listings',
}

const STATE_LABELS = {
  VIC: 'Victoria', NSW: 'New South Wales', QLD: 'Queensland', SA: 'South Australia',
  WA: 'Western Australia', TAS: 'Tasmania', ACT: 'Australian Capital Territory', NT: 'Northern Territory',
}

const MAX_EDITORIAL_WORDS = 250
const MAX_PER_SECTION = 6

async function getRegion(slug) {
  const sb = getSupabaseAdmin()
  const { data } = await sb.from('regions').select('*').eq('slug', slug).single()
  return data
}

async function getRegionNarrative(regionId) {
  if (!regionId) return null
  const sb = getSupabaseAdmin()
  const { data } = await sb.from('region_narratives').select('*').eq('region_id', regionId).single()
  return data
}

function zoomToRadiusDeg(zoom) {
  const lookup = { 6: 3.0, 7: 1.5, 8: 0.75, 9: 0.5, 10: 0.3, 11: 0.15, 12: 0.08 }
  return lookup[zoom] || 0.5
}

async function getRegionListings(region) {
  const sb = getSupabaseAdmin()

  if (region.center_lat && region.center_lng) {
    const radius = zoomToRadiusDeg(region.map_zoom || 9)
    const { data } = await sb
      .from('listings')
      .select('id, vertical, source_id, name, slug, description, region, state, lat, lng, hero_image_url, is_featured, is_claimed, editors_pick, website')
      .eq('status', 'active')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .gte('lat', region.center_lat - radius)
      .lte('lat', region.center_lat + radius)
      .gte('lng', region.center_lng - radius)
      .lte('lng', region.center_lng + radius)
      .order('editors_pick', { ascending: false })
      .order('is_featured', { ascending: false })
      .order('name')
      .limit(200)
    if (data && data.length > 0) return data
  }

  const regionName = region.name
  let query = sb
    .from('listings')
    .select('id, vertical, source_id, name, slug, description, region, state, lat, lng, hero_image_url, is_featured, is_claimed, editors_pick, website')
    .eq('status', 'active')

  if (region.state) query = query.eq('state', region.state)
  query = query.or(`region.ilike.%${regionName}%,address.ilike.%${regionName}%`)

  const { data } = await query
    .order('editors_pick', { ascending: false })
    .order('is_featured', { ascending: false })
    .order('name')
    .limit(200)
  return data || []
}

function truncateEditorial(text) {
  if (!text) return null
  const words = text.split(/\s+/)
  if (words.length <= MAX_EDITORIAL_WORDS) return text
  const truncated = words.slice(0, MAX_EDITORIAL_WORDS).join(' ')
  const lastPeriod = truncated.lastIndexOf('.')
  if (lastPeriod > truncated.length * 0.5) return truncated.substring(0, lastPeriod + 1)
  return truncated + '\u2026'
}

function truncateDescription(text, max = 100) {
  if (!text) return null
  if (text.length <= max) return text
  const cut = text.substring(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > max * 0.5 ? cut.substring(0, lastSpace) : cut) + '\u2026'
}

export async function generateMetadata({ params }) {
  const { slug } = await params
  const region = await getRegion(slug)
  if (!region) return { title: 'Region not found' }
  return {
    title: `${region.name}, ${STATE_LABELS[region.state] || region.state} \u2014 Australian Atlas`,
    description: region.description || `Discover independent places in ${region.name}`,
  }
}

export default async function RegionPage({ params }) {
  const { slug } = await params
  const region = await getRegion(slug)
  if (!region) notFound()

  const [listings, narrative] = await Promise.all([
    getRegionListings(region),
    getRegionNarrative(region.id),
  ])

  // Group by vertical
  const grouped = {}
  const verticalCounts = {}
  for (const l of listings) {
    if (!grouped[l.vertical]) grouped[l.vertical] = []
    grouped[l.vertical].push(l)
    verticalCounts[l.vertical] = (verticalCounts[l.vertical] || 0) + 1
  }

  const activeVerticals = VERTICAL_ORDER.filter(v => grouped[v]?.length > 0)

  // Map points — include slug for popup links
  const mapPoints = listings
    .filter(l => l.lat && l.lng)
    .map(l => ({ lat: l.lat, lng: l.lng, name: l.name, vertical: l.vertical, slug: l.slug }))

  const rawEditorial = region.long_description || region.generated_intro
  const editorial = truncateEditorial(rawEditorial)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg, #fff)' }}>

      {/* ── 1. INTERACTIVE MAP HERO ────────────────────── */}
      <RegionMapHero
        points={mapPoints}
        regionName={region.name}
        stateName={STATE_LABELS[region.state] || region.state}
        centerLat={region.center_lat}
        centerLng={region.center_lng}
        zoom={region.map_zoom}
      />

      <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '0 1.5rem' }}>

        {/* Breadcrumb */}
        <nav
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 300,
            fontSize: '12px',
            color: 'var(--color-muted)',
            padding: '1.25rem 0',
          }}
        >
          <Link href="/regions" style={{ color: 'var(--color-muted)', textDecoration: 'none' }}>Regions</Link>
          <span style={{ margin: '0 0.5rem' }}>/</span>
          <span style={{ color: 'var(--color-ink)' }}>{region.name}</span>
        </nav>

        {/* ── 3. VERTICAL ANCHOR PILLS ──────────────────── */}
        {Object.keys(verticalCounts).length > 0 && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            paddingBottom: '1.5rem',
            borderBottom: '1px solid var(--color-border)',
          }}>
            {activeVerticals.map(v => {
              const color = VERTICAL_COLORS[v] || '#888'
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
                    backgroundColor: `${color}14`,
                    color: color,
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500,
                    fontSize: '12px',
                    textDecoration: 'none',
                    transition: 'opacity 0.15s',
                  }}
                >
                  {VERTICAL_LABELS[v] || v} <strong style={{ fontWeight: 700 }}>{verticalCounts[v]}</strong>
                </a>
              )
            })}
          </div>
        )}

        {/* ── 2. EDITORIAL NARRATIVE SECTION ─────────────── */}
        {(editorial || narrative) && (
          <div
            style={{
              maxWidth: '720px',
              padding: '3.5rem 0 3rem',
              margin: '0 auto',
            }}
          >
            {/* Main editorial text */}
            {editorial && (
              <div style={{ marginBottom: narrative ? '2.5rem' : 0 }}>
                {editorial.split('\n\n').map((paragraph, i) => (
                  <p
                    key={i}
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 300,
                      fontSize: '18px',
                      lineHeight: 1.8,
                      color: 'var(--color-ink)',
                      marginBottom: '1rem',
                    }}
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            )}

            {/* Narrative enrichment */}
            {narrative && (
              <>
                {narrative.editorial_overview && !editorial && (
                  <p
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 300,
                      fontSize: '18px',
                      lineHeight: 1.8,
                      color: 'var(--color-ink)',
                      marginBottom: '2.5rem',
                    }}
                  >
                    {narrative.editorial_overview}
                  </p>
                )}

                {/* Best time + What sets it apart */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: '2rem',
                    marginBottom: '2rem',
                  }}
                >
                  {narrative.best_time_to_visit && (
                    <div>
                      <h2 style={{
                        fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600,
                        letterSpacing: '0.1em', textTransform: 'uppercase',
                        color: 'var(--color-muted)', marginBottom: '0.75rem',
                      }}>
                        Best time to visit
                      </h2>
                      <p style={{
                        fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px',
                        lineHeight: 1.7, color: 'var(--color-ink)', margin: 0,
                      }}>
                        {narrative.best_time_to_visit}
                      </p>
                    </div>
                  )}
                  {narrative.what_makes_distinct && (
                    <div>
                      <h2 style={{
                        fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600,
                        letterSpacing: '0.1em', textTransform: 'uppercase',
                        color: 'var(--color-muted)', marginBottom: '0.75rem',
                      }}>
                        What sets it apart
                      </h2>
                      <p style={{
                        fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px',
                        lineHeight: 1.7, color: 'var(--color-ink)', margin: 0,
                      }}>
                        {narrative.what_makes_distinct}
                      </p>
                    </div>
                  )}
                </div>

                {/* Vertical highlights */}
                {narrative.vertical_highlights && narrative.vertical_highlights.length > 0 && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h2 style={{
                      fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600,
                      letterSpacing: '0.1em', textTransform: 'uppercase',
                      color: 'var(--color-muted)', marginBottom: '0.75rem',
                    }}>
                      Highlights
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                      {narrative.vertical_highlights.map((h, i) => {
                        const color = VERTICAL_COLORS[h.vertical] || 'var(--color-muted)'
                        return (
                          <div key={i} style={{
                            display: 'flex', alignItems: 'baseline', gap: '0.5rem',
                            fontFamily: 'var(--font-body)', fontSize: '14px', lineHeight: 1.6,
                          }}>
                            <span style={{
                              fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em',
                              textTransform: 'uppercase', color: color, flexShrink: 0,
                            }}>
                              {VERTICAL_LABELS[h.vertical] || h.vertical}
                            </span>
                            <span style={{ color: 'var(--color-ink)', fontWeight: 400 }}>{h.listing_name}</span>
                            {h.note && <span style={{ color: 'var(--color-muted)', fontWeight: 300 }}>&mdash; {h.note}</span>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Provenance */}
                <p style={{
                  fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 400,
                  color: 'var(--color-muted)', marginTop: '1.5rem',
                  paddingTop: '1rem', borderTop: '1px solid var(--color-border)',
                }}>
                  Generated from {narrative.listing_count_at_generation || listings.length} verified listing{(narrative.listing_count_at_generation || listings.length) !== 1 ? 's' : ''}
                  {narrative.generated_at && (
                    <> &middot; Last updated {new Date(narrative.generated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</>
                  )}
                </p>
              </>
            )}

            {/* Provenance if no narrative but has editorial */}
            {editorial && !narrative && (
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 400,
                color: 'var(--color-muted)', marginTop: '0.5rem',
              }}>
                Generated from {listings.length} verified listing{listings.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        )}

        {/* ── 3 + 4. VERTICAL SECTIONS WITH LISTING CARDS ── */}
        {listings.length > 0 ? (
          <div style={{ paddingBottom: '3rem' }}>
            {activeVerticals.map((vertical, idx) => {
              const items = grouped[vertical]
              const label = VERTICAL_LABELS[vertical] || vertical
              const color = VERTICAL_COLORS[vertical] || '#888'
              const desc = VERTICAL_DESCRIPTIONS[vertical] || ''
              const shown = items.slice(0, MAX_PER_SECTION)
              const hasMore = items.length > MAX_PER_SECTION

              return (
                <section key={vertical} id={`vertical-${vertical}`} style={{ marginTop: idx === 0 ? '1rem' : '3rem' }}>
                  {/* Section header */}
                  <div style={{ marginBottom: '1.25rem' }}>
                    <h2 style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 400,
                      fontSize: '1.5rem',
                      color: 'var(--color-ink)',
                      margin: '0 0 0.25rem',
                    }}>
                      {label}
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
                      <span style={{
                        fontFamily: 'var(--font-body)', fontSize: '13px',
                        fontWeight: 400, color: 'var(--color-muted)',
                      }}>
                        {desc}
                      </span>
                      <span style={{
                        fontFamily: 'var(--font-body)', fontSize: '12px',
                        fontWeight: 500, color: color,
                      }}>
                        {items.length} listing{items.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  {/* Card grid */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: '1rem',
                  }}>
                    {shown.map(listing => {
                      const baseUrl = VERTICAL_URLS[vertical] || '#'
                      const href = listing.slug ? `${baseUrl}/${listing.slug}` : '#'
                      const desc = truncateDescription(listing.description)

                      return (
                        <a
                          key={listing.id}
                          href={href}
                          target="_blank"
                          rel="noopener"
                          style={{
                            display: 'block',
                            padding: '1.25rem 1.5rem',
                            borderRadius: '10px',
                            background: color,
                            textDecoration: 'none',
                            transition: 'transform 0.15s, box-shadow 0.15s',
                            minHeight: '120px',
                          }}
                        >
                          <h3 style={{
                            fontFamily: 'var(--font-display)',
                            fontWeight: 400,
                            fontSize: '1.125rem',
                            color: '#fff',
                            margin: '0 0 0.375rem',
                            lineHeight: 1.3,
                          }}>
                            {listing.name}
                          </h3>
                          <p style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: '12px',
                            fontWeight: 400,
                            color: 'rgba(255,255,255,0.7)',
                            margin: '0 0 0.5rem',
                          }}>
                            {[listing.region, listing.state].filter(Boolean).join(', ')}
                          </p>
                          {desc && (
                            <p style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: '13px',
                              fontWeight: 300,
                              color: 'rgba(255,255,255,0.85)',
                              lineHeight: 1.5,
                              margin: 0,
                            }}>
                              {desc}
                            </p>
                          )}
                        </a>
                      )
                    })}
                  </div>

                  {/* View all link */}
                  {hasMore && (
                    <p style={{ marginTop: '0.875rem' }}>
                      <a
                        href={`/map?vertical=${vertical}&region=${encodeURIComponent(region.name)}`}
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: '13px',
                          fontWeight: 500,
                          color: color,
                          textDecoration: 'none',
                        }}
                      >
                        View all {items.length} listings &rarr;
                      </a>
                    </p>
                  )}
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

        {/* ── 5. TRAIL PROMPT ──────────────────────────── */}
        <div
          style={{
            margin: '1rem 0 4rem',
            padding: '2.5rem',
            borderRadius: '14px',
            background: '#FAF8F5',
            border: '1px solid var(--color-border)',
            textAlign: 'center',
          }}
        >
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: 'clamp(1.25rem, 3vw, 1.75rem)',
            color: 'var(--color-ink)',
            margin: '0 0 0.5rem',
          }}>
            Planning a trip to {region.name}?
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 300,
            fontSize: '15px',
            color: 'var(--color-muted)',
            maxWidth: '480px',
            margin: '0 auto 1.5rem',
            lineHeight: 1.6,
          }}>
            Build a day-by-day itinerary from verified venues across all nine atlases.
          </p>
          <a
            href={`/itinerary?q=${encodeURIComponent(`Day trip to ${region.name}`)}`}
            style={{
              display: 'inline-block',
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
              fontSize: '14px',
              padding: '0.75rem 2rem',
              borderRadius: '8px',
              background: 'var(--color-ink, #2D2A26)',
              color: '#fff',
              textDecoration: 'none',
              transition: 'opacity 0.15s',
            }}
          >
            Build trail &rarr;
          </a>
        </div>
      </div>
    </div>
  )
}
