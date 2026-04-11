'use client'
import 'mapbox-gl/dist/mapbox-gl.css'

import { useEffect, useRef } from 'react'

/**
 * Interactive Mapbox GL JS map for listing detail pages.
 * Single marker at the listing location, fully navigable.
 * Scroll zoom disabled on mobile (two-finger gesture instead).
 */
export default function ListingMap({ lat, lng, name, color = '#5F8A7E' }) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)

  useEffect(() => {
    if (!mapRef.current || !lat || !lng) return
    if (mapInstance.current) {
      mapInstance.current.remove()
      mapInstance.current = null
    }

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

      const map = new mapboxgl.Map({
        container: mapRef.current,
        style: 'mapbox://styles/mattstirlingaustralianheritage/cmn32b0iz003401swccb7d21k',
        center: [lng, lat],
        zoom: 14,
        attributionControl: false,
        interactive: true,
      })

      // Zoom controls
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')

      // Disable scroll zoom on mobile to prevent scroll-hijacking
      const isMobile = /Mobi|Android/i.test(navigator.userAgent)
      if (isMobile) {
        map.scrollZoom.disable()
        // Enable cooperative gestures (two-finger to zoom)
        map['cooperativeGestures'] = true
      }

      // Marker pin matching the vertical color
      const markerEl = document.createElement('div')
      markerEl.innerHTML = `<svg width="28" height="40" viewBox="0 0 28 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.268 21.732 0 14 0z" fill="${color}"/>
        <circle cx="14" cy="14" r="6" fill="white"/>
      </svg>`
      markerEl.style.cursor = 'pointer'

      new mapboxgl.Marker({ element: markerEl, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(map)

      mapInstance.current = map
    })

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
      }
    }
  }, [lat, lng, name, color])

  return (
    <div
      ref={mapRef}
      style={{ width: '100%', height: '100%' }}
    />
  )
}
