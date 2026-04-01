import { Suspense } from 'react'
import MapClient from '@/components/MapClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Map — Australian Atlas',
  description: 'Explore every independent business across Australia on an interactive map. Filter by category, state, or search by name.',
}

export default function MapPage() {
  return (
    <Suspense fallback={
      <div style={{ height: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)', color: 'var(--color-muted)' }}>
        Loading map…
      </div>
    }>
      <MapClient />
    </Suspense>
  )
}
