import { getTranslations, getLocale } from 'next-intl/server'
import { getLiveRegionsCached } from '@/lib/regions/liveRegions'
import { localizeRegionName } from '@/lib/i18n/listingLabels'
import { getRegionVerticalMixCached, regionCardChips } from '@/lib/regions/verticalMix'
import RegionIndexCard from '@/components/RegionIndexCard'

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
    return await getLiveRegionsCached()
  } catch {
    return []
  }
}

export default async function RegionsPage() {
  const t = await getTranslations('regions')
  const locale = await getLocale()
  const regions = await getRegions()
  let verticalMix = {}
  try {
    verticalMix = await getRegionVerticalMixCached()
  } catch { /* cards render without category chips */ }

  // Group by state
  const byState = {}
  for (const r of regions) {
    if (!byState[r.state]) byState[r.state] = []
    byState[r.state].push(r)
  }
  const presentStates = STATE_ORDER.filter(s => byState[s])
  const totalPlaces = regions.reduce((sum, r) => sum + (r.listing_count || 0), 0)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* Page masthead — cream, contrasts with dark cards */}
      <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '0 1.5rem' }}>
        <div className="page-masthead" style={{ paddingBottom: 0 }}>
          <p className="section-dateline">{t('kicker')}</p>
          <h1 className="masthead-title">{t('title')}</h1>
          <p className="masthead-sub">{t('subtitle')}</p>
          {regions.length > 0 && (
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 400,
                fontSize: '13px',
                color: 'var(--color-muted)',
                margin: '0.75rem 0 0',
              }}
            >
              {t('indexStats', { regions: regions.length, places: totalPlaces })}
            </p>
          )}
        </div>
      </div>

      {/* State jump nav */}
      {presentStates.length > 1 && (
        <nav
          aria-label={t('stateNavAria')}
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            background: 'color-mix(in srgb, var(--color-bg) 88%, transparent)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            borderBottom: '1px solid var(--color-border)',
            marginTop: '1.75rem',
          }}
        >
          <div
            className="regions-state-nav"
            style={{
              maxWidth: '72rem',
              margin: '0 auto',
              padding: '0.6rem 1.5rem',
              display: 'flex',
              gap: '0.4rem',
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {presentStates.map(state => (
              <a
                key={state}
                href={`#state-${state.toLowerCase()}`}
                style={{
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.35rem 0.8rem',
                  borderRadius: '100px',
                  border: '1px solid var(--color-border)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '12.5px',
                  fontWeight: 500,
                  color: 'var(--color-ink)',
                  textDecoration: 'none',
                  background: 'transparent',
                  whiteSpace: 'nowrap',
                }}
              >
                {STATE_LABELS[state]}
                <span style={{ color: 'var(--color-muted)', fontWeight: 400 }}>
                  {byState[state].length}
                </span>
              </a>
            ))}
          </div>
        </nav>
      )}

      {/* Region grid grouped by state */}
      <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '2.5rem 1.5rem 4rem' }}>
        {presentStates.map(state => {
          const stateRegions = byState[state]
          const statePlaces = stateRegions.reduce((sum, r) => sum + (r.listing_count || 0), 0)
          return (
            <section
              key={state}
              id={`state-${state.toLowerCase()}`}
              style={{ marginBottom: '3rem', scrollMarginTop: '4.5rem' }}
            >
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
                  {' · '}
                  {t('placeCount', { count: statePlaces })}
                </span>
              </div>

              {/* Cards grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '1.1rem',
                  paddingTop: '4px',
                }}
                className="regions-grid"
              >
                {stateRegions.map(region => (
                  <RegionIndexCard
                    key={region.id}
                    region={{ ...region, name: localizeRegionName(region.name, locale) }}
                    chips={regionCardChips(region, verticalMix, locale)}
                    placeLabel={t('placeCount', { count: region.listing_count || 0 })}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      <style>{`
        .region-index-card:hover {
          transform: translateY(-2px);
          border-color: rgba(184, 134, 43, 0.55) !important;
          box-shadow: 0 6px 18px rgba(40, 30, 15, 0.08);
        }
        .regions-state-nav {
          scrollbar-width: none;
        }
        .regions-state-nav::-webkit-scrollbar {
          display: none;
        }
        .regions-state-nav a:hover {
          border-color: rgba(184, 134, 43, 0.5);
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
