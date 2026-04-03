import { getSupabaseAdmin } from '@/lib/supabase/clients'
import RegionMapCard from '@/components/RegionMapCard'

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
      .select('id, name, slug, state, listing_count, center_lat, center_lng, map_zoom')
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
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* Page header — cream, contrasts with dark cards */}
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
        {STATE_ORDER.filter(s => byState[s]).map(state => {
          const stateRegions = byState[state]
          const isOrphan = stateRegions.length % 3 === 1
          return (
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
                  {stateRegions.length} {stateRegions.length === 1 ? 'region' : 'regions'}
                </span>
              </div>

              {/* Cards grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '1.25rem',
                }}
                className="regions-grid"
              >
                {stateRegions.map((region, idx) => (
                  <RegionMapCard
                    key={region.id}
                    region={region}
                    isOrphanLast={isOrphan && idx === stateRegions.length - 1}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      <style>{`
        .region-map-card:hover {
          transform: scale(1.02);
          border-color: rgba(184, 134, 43, 0.4) !important;
        }
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
