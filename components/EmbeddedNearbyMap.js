'use client'

// Thin wrapper that defers loading the full MapClient bundle until after
// hydration. The listing page renders this map below the fold, so users
// don't need the ~700 lines of chrome code (filters, geocoding, mobile sheet,
// etc.) to be parsed before first paint. ssr:false also avoids server-side
// rendering of the Mapbox container, which depends on `window`.

import dynamic from 'next/dynamic'

const MapClient = dynamic(() => import('@/components/MapClient'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: '100%', height: '100%',
        background: '#faf8f5',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)',
        letterSpacing: '0.08em', textTransform: 'uppercase',
      }}
    >
      Loading map…
    </div>
  ),
})

export default function EmbeddedNearbyMap(props) {
  return <MapClient mode="embedded" {...props} />
}
