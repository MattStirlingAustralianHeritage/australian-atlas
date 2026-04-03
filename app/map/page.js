import { Suspense } from 'react'
import MapClient from '@/components/MapClient'

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
}

export default async function MapPage({ searchParams }) {
  const params = await searchParams
  const verticalSlug = params?.vertical || ''
  const stateParam = params?.state || ''

  // Resolve slug to internal key
  const initialVertical = VERTICAL_SLUG_MAP[verticalSlug] || (verticalSlug === 'all' ? 'all' : '')
  const initialState = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT'].includes(stateParam?.toUpperCase())
    ? stateParam.toUpperCase()
    : ''

  return (
    <Suspense fallback={
      <div style={{ height: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)', color: 'var(--color-muted)' }}>
        Loading map…
      </div>
    }>
      <MapClient initialVertical={initialVertical} initialState={initialState} />
    </Suspense>
  )
}
