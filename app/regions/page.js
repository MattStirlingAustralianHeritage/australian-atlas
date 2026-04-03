import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

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

export const metadata = {
  title: 'Regions — Australian Atlas',
  description: 'Explore Australian regions across every state — wineries, makers, galleries, stays, and independent places worth the drive.',
}

async function getRegions() {
  try {
    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('regions')
      .select('id, name, slug, state, listing_count, hero_image_url, hero_image_card_url, hero_color')
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

  const totalListings = regions.reduce((sum, r) => sum + (r.listing_count || 0), 0)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* Page header — clean, consistent with Search/Explore */}
      <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '3rem 1.5rem 0' }}>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: '11px',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--color-muted)',
            marginBottom: '0.5rem',
          }}
        >
          Explore by region
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)',
            color: 'var(--color-ink)',
            lineHeight: 1.15,
            margin: 0,
          }}
        >
          Regions
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 300,
            fontSize: '15px',
            color: 'var(--color-muted)',
            marginTop: '0.625rem',
            maxWidth: '36rem',
            lineHeight: 1.6,
          }}
        >
          Independent places across Australia, mapped by region.
        </p>
      </div>

      {/* Region grid grouped by state */}
      <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '2.5rem 1.5rem 4rem' }}>
        {STATE_ORDER.filter(s => byState[s]).map(state => (
          <section key={state} style={{ marginBottom: '3rem' }}>
            {/* State header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '0.75rem',
                borderBottom: '1px solid var(--color-border)',
                paddingBottom: '0.75rem',
                marginBottom: '1.25rem',
              }}
            >
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 400,
                  fontSize: '1.35rem',
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

            {/* Cards grid — fixed 3 columns */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '1.25rem',
              }}
              className="regions-grid"
            >
              {byState[state].map(region => (
                <RegionCard key={region.id} region={region} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .regions-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 480px) {
          .regions-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}

function RegionCard({ region }) {
  const imgUrl = region.hero_image_card_url || region.hero_image_url
  const bgColor = region.hero_color || '#2D2A26'

  return (
    <Link
      href={`/regions/${region.slug}`}
      className="region-card"
      style={{
        display: 'block',
        borderRadius: '10px',
        overflow: 'hidden',
        position: 'relative',
        aspectRatio: '3 / 2',
        backgroundColor: bgColor,
        textDecoration: 'none',
      }}
    >
      {/* Image */}
      {imgUrl && (
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
        />
      )}

      {/* Subtle gradient — bottom only */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.08) 50%, transparent 100%)',
          transition: 'background 0.3s ease',
        }}
        className="region-card-overlay"
      />

      {/* Content — name, state, count */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '1rem 1.125rem',
        }}
      >
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: '1.125rem',
            color: '#fff',
            lineHeight: 1.2,
            margin: 0,
          }}
        >
          {region.name}
        </h3>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '0.375rem',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 400,
              fontSize: '11.5px',
              color: 'rgba(255,255,255,0.65)',
              letterSpacing: '0.02em',
            }}
          >
            {STATE_LABELS[region.state]?.split(' ')[0] || region.state}
          </span>

          {region.listing_count > 0 && (
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 500,
                fontSize: '11px',
                color: 'rgba(255,255,255,0.8)',
                background: 'rgba(255,255,255,0.12)',
                backdropFilter: 'blur(6px)',
                padding: '0.2rem 0.5rem',
                borderRadius: '100px',
              }}
            >
              {region.listing_count}
            </span>
          )}
        </div>
      </div>

      {/* Hover explore arrow */}
      <div
        className="region-card-explore"
        style={{
          position: 'absolute',
          top: '0.75rem',
          right: '0.75rem',
          opacity: 0,
          transition: 'opacity 0.2s ease',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: '11px',
            color: '#fff',
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(8px)',
            padding: '0.3rem 0.625rem',
            borderRadius: '100px',
          }}
        >
          Explore →
        </span>
      </div>

      <style>{`
        .region-card:hover img {
          transform: scale(1.04);
        }
        .region-card:hover .region-card-explore {
          opacity: 1 !important;
        }
        .region-card:hover .region-card-overlay {
          background: linear-gradient(to top, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.04) 100%) !important;
        }
      `}</style>
    </Link>
  )
}
