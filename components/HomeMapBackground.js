'use client'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useRef, useEffect } from 'react'

export default function HomeMapBackground() {
  const containerRef = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    import('mapbox-gl').then(mapboxgl => {
      mapboxgl.default.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

      mapRef.current = new mapboxgl.default.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mattstirlingaustralianheritage/cmn32b0iz003401swccb7d21k',
        center: [134, -28],
        zoom: 3.6,
        interactive: false,
        attributionControl: false,
        fadeDuration: 0,
      })
    })

    return () => {
      if (mapRef.current) {
        try { mapRef.current.remove() } catch (e) {}
        mapRef.current = null
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
      }}
    />
  )
}
