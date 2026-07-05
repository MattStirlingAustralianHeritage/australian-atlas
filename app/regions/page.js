import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getTranslations, getLocale } from 'next-intl/server'
import RegionMapCard from '@/components/RegionMapCard'

export const revalidate = 3600

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

export async function generateMetadata() {
  const locale = await getLocale()
  return {
    title: {
      en: 'Regions — Australian Atlas',
      ko: '지역 — 오스트레일리안 아틀라스',
      zh: '地区 — Australian Atlas',
    }[locale] || 'Regions — Australian Atlas',
    description: {
      en: 'Explore Australian regions across every state — wineries, makers, galleries, stays, and independent places worth the drive.',
      ko: '오스트레일리아 전역의 지역을 둘러보세요 — 와이너리, 메이커, 갤러리, 숙소, 그리고 찾아갈 가치가 있는 독립 장소들.',
      zh: '探索澳大利亚各州的地区 — 酒庄、手作人、画廊、住宿，以及值得专程前往的独立好去处。',
    }[locale] || 'Explore Australian regions across every state — wineries, makers, galleries, stays, and independent places worth the drive.',
  }
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
  const t = await getTranslations('regions')
  const regions = await getRegions()

  // Group by state
  const byState = {}
  for (const r of regions) {
    if (!byState[r.state]) byState[r.state] = []
    byState[r.state].push(r)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* Page masthead — cream, contrasts with dark cards */}
      <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '0 1.5rem' }}>
        <div className="page-masthead" style={{ paddingBottom: 0 }}>
          <p className="section-dateline">{t('kicker')}</p>
          <h1 className="masthead-title">{t('title')}</h1>
          <p className="masthead-sub">{t('subtitle')}</p>
        </div>
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
                  {t('regionCount', { count: stateRegions.length })}
                </span>
              </div>

              {/* Cards grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '1.25rem',
                  paddingTop: '16px',
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
