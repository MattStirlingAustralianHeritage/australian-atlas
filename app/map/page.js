import { Suspense } from 'react'
import MapClient from '@/components/MapClient'
import { getPublicVerticals, isVerticalPublic } from '@/lib/verticalUrl'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Map — Australian Atlas',
  description: 'Explore every independent business across Australia on an interactive map. Filter by category, state, or search by name.',
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

  return (
    <Suspense fallback={
      <div style={{ height: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)', color: 'var(--color-muted)' }}>
        Loading map…
      </div>
    }>
      <MapClient
        initialVertical={initialVertical}
        initialState={initialState}
        initialCenter={initialCenter}
        initialZoom={initialZoom}
        initialQuery={initialQuery}
        publicVerticals={getPublicVerticals()}
      />
    </Suspense>
  )
}
