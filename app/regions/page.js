import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

const STATE_ORDER = ['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']

const STATE_LABELS = {
  VIC: 'Victoria',
  NSW: 'New South Wales',
  QLD: 'Queensland',
  SA: 'South Australia',
  WA: 'Western Australia',
  TAS: 'Tasmania',
  ACT: 'Australian Capital Territory',
  NT: 'Northern Territory',
}

// Fallback image for regions without a hero image
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1506197603052-3cc9c3a201bd?w=800&q=80'

export const metadata = {
  title: 'Regions — Australian Atlas',
  description: 'Explore Australian regions across every state — wineries, makers, galleries, stays, and independent places worth the drive.',
}

async function getRegions() {
  try {
    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('regions')
      .select('id, name, slug, state, description, listing_count, hero_image_url, hero_color')
      .order('state')
      .order('name')
    return data || []
  } catch {
    return []
  }
}

export default async function RegionsPage() {
  const regions = await getRegions()

  // Group by state
  const byState = {}
  for (const r of regions) {
    if (!byState[r.state]) byState[r.state] = []
    byState[r.state].push(r)
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Hero header */}
      <div
        style={{
          background: 'var(--color-ink)',
          padding: '4rem 1.5rem 3.5rem',
        }}
      >
        <div style={{ maxWidth: '72rem', margin: '0 auto' }}>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
              fontSize: '11px',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--color-accent)',
              marginBottom: '0.75rem',
            }}
          >
            Explore by region
          </p>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              fontSize: 'clamp(2rem, 4vw, 3rem)',
              color: '#fff',
              lineHeight: 1.15,
              maxWidth: '36rem',
            }}
          >
            Every region tells a different story
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 300,
              fontSize: '15px',
              color: 'rgba(255,255,255,0.6)',
              marginTop: '1rem',
              maxWidth: '40rem',
              lineHeight: 1.6,
            }}
          >
            From cool-climate wine country to subtropical hinterlands — discover what makes each corner of Australia distinctive, through the independent places we&rsquo;ve mapped across the network.
          </p>
        </div>
      </div>

      {/* Region grid grouped by state */}
      <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '3rem 1.5rem 4rem' }}>
        {STATE_ORDER.filter(s => byState[s]).map(state => (
          <section key={state} style={{ marginBottom: '3.5rem' }}>
            {/* State header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '0.75rem',
                borderBottom: '1px solid var(--color-border)',
                paddingBottom: '0.75rem',
                marginBottom: '1.5rem',
              }}
            >
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 400,
                  fontSize: '1.5rem',
                  color: 'var(--color-ink)',
                  margin: 0,
                }}
              >
                {STATE_LABELS[state]}
              </h2>
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '12px',
                  fontWeight: 400,
                  color: 'var(--color-muted)',
                }}
              >
                {byState[state].length} {byState[state].length === 1 ? 'region' : 'regions'}
              </span>
            </div>

            {/* Cards grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '1.25rem',
              }}
            >
              {byState[state].map(region => (
                <RegionCard key={region.id} region={region} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function RegionCard({ region }) {
  const imgUrl = region.hero_image_url || FALLBACK_IMAGE
  const bgColor = region.hero_color || '#2D2A26'

  return (
    <Link
      href={`/regions/${region.slug}`}
      style={{
        display: 'block',
        borderRadius: '10px',
        overflow: 'hidden',
        position: 'relative',
        aspectRatio: '16 / 10',
        backgroundColor: bgColor,
        textDecoration: 'none',
      }}
    >
      {/* Image */}
      <img
        src={imgUrl}
        alt={region.name}
        loading="lazy"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transition: 'transform 0.5s ease',
        }}
        onMouseOver="this.style.transform='scale(1.04)'"
        onMouseOut="this.style.transform='scale(1)'"
      />

      {/* Gradient overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.15) 50%, transparent 100%)',
        }}
      />

      {/* Content */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '1.25rem',
        }}
      >
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: '1.25rem',
            color: '#fff',
            lineHeight: 1.2,
            margin: 0,
          }}
        >
          {region.name}
        </h3>

        {region.description && (
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 300,
              fontSize: '13px',
              color: 'rgba(255,255,255,0.7)',
              lineHeight: 1.5,
              marginTop: '0.375rem',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {region.description}
          </p>
        )}

        {region.listing_count > 0 && (
          <span
            style={{
              display: 'inline-block',
              marginTop: '0.5rem',
              fontSize: '11px',
              fontWeight: 500,
              fontFamily: 'var(--font-body)',
              color: 'rgba(255,255,255,0.85)',
              background: 'rgba(255,255,255,0.15)',
              backdropFilter: 'blur(8px)',
              padding: '0.25rem 0.625rem',
              borderRadius: '100px',
            }}
          >
            {region.listing_count} listings
          </span>
        )}
      </div>
    </Link>
  )
}
