import { Suspense } from 'react'
import { getTranslations, getLocale } from 'next-intl/server'
import MapClient from '@/components/MapClient'
import { getPublicVerticals, isVerticalPublic } from '@/lib/verticalUrl'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const locale = await getLocale()
  return {
    title: {
      en: 'Map — Australian Atlas',
      ko: '지도 — 오스트레일리안 아틀라스',
      zh: '地图 — Australian Atlas',
    }[locale] || 'Map — Australian Atlas',
    description: {
      en: 'Explore every independent business across Australia on an interactive map. Filter by category, state, or search by name.',
      ko: '오스트레일리아 전역의 모든 독립 매장을 인터랙티브 지도에서 둘러보세요. 카테고리, 주로 필터링하거나 이름으로 검색하세요.',
      zh: '在交互式地图上探索澳大利亚各地的每一家独立商户。按类别、州筛选，或按名称搜索。',
    }[locale] || 'Explore every independent business across Australia on an interactive map. Filter by category, state, or search by name.',
  }
}

// Map from URL-friendly slugs to internal vertical keys
const VERTICAL_SLUG_MAP = {
  'small-batch': 'sba',
  'collections': 'collection',
  'craft': 'craft',
  'fine-grounds': 'fine_grounds',
  'rest': 'rest',
  'field': 'field',
  'corner': 'corner',
  'found': 'found',
  'table': 'table',
  'way': 'way',
}

export default async function MapPage({ searchParams }) {
  const t = await getTranslations('map')
  const params = await searchParams
  const verticalSlug = params?.vertical || ''
  const stateParam = params?.state || ''

  // Resolve slug to internal key. A slug for a gated (non-public) vertical
  // resolves to no filter, so a stale /map?vertical=way link can't pre-select
  // a vertical that has no pins or chip while Way is OFF.
  const resolvedVertical = VERTICAL_SLUG_MAP[verticalSlug] || (verticalSlug === 'all' ? 'all' : '')
  const initialVertical = resolvedVertical && resolvedVertical !== 'all' && !isVerticalPublic(resolvedVertical) ? '' : resolvedVertical
  const initialState = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT'].includes(stateParam?.toUpperCase())
    ? stateParam.toUpperCase()
    : ''

  // Optional centre/zoom from listing page "View on full map →" link.
  const lng = parseFloat(params?.lng)
  const lat = parseFloat(params?.lat)
  const zoom = parseFloat(params?.zoom)
  const initialCenter = Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null
  const initialZoom = Number.isFinite(zoom) ? zoom : null

  // Smart pin filter ("whisky", "homewares", …) — kept in the URL so a
  // filtered map view is shareable like every other map state.
  const initialQuery = typeof params?.q === 'string' ? params.q.slice(0, 60) : ''

  // Trail planner deep links: ?trail=1 opens the panel, ?trail=<uuid> loads
  // that saved trail for editing (the old /trails/builder?id= links redirect
  // here). ?resume=1 completes a save interrupted by OAuth; ?region=Name
  // frames a region (the "build a trail here" links on region pages).
  const trailParam = typeof params?.trail === 'string' ? params.trail : ''
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trailParam)
  const initialTrailOpen = trailParam === '1' || trailParam === 'new'
  const initialTrailEdit = isUuid ? trailParam : null
  const initialTrailResume = params?.resume === '1'
  const initialTrailRegion = typeof params?.region === 'string' ? params.region.slice(0, 80) : ''

  return (
    <Suspense fallback={
      <div style={{ height: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)', color: 'var(--color-muted)' }}>
        {t('loadingMap')}
      </div>
    }>
      <MapClient
        initialVertical={initialVertical}
        initialState={initialState}
        initialCenter={initialCenter}
        initialZoom={initialZoom}
        initialQuery={initialQuery}
        publicVerticals={getPublicVerticals()}
        initialTrailOpen={initialTrailOpen}
        initialTrailEdit={initialTrailEdit}
        initialTrailResume={initialTrailResume}
        initialTrailRegion={initialTrailRegion}
      />
    </Suspense>
  )
}
