'use client'

import { useEffect, useRef } from 'react'

const VERTICAL_COLORS = {
  sba: '#6b3a2a',
  collection: '#5a6b7c',
  craft: '#7c6b5a',
  fine_grounds: '#5F8A7E',
  rest: '#8a5a6b',
  field: '#5a7c5a',
  corner: '#7c5a7c',
  found: '#5a7c6b',
  table: '#7c6b5a',
}

// Day-number tints: Day 1 = sage, Day 2 = amber, Day 3 = muted
const DAY_OPACITY = { 1: 1.0, 2: 0.85, 3: 0.7 }

export default function ItineraryMap({ stops, highlightedStop, onStopClick }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])

  useEffect(() => {
    if (!containerRef.current || !stops || stops.length === 0) return
    if (mapRef.current) {
      // Map already exists — just update highlights
      updateHighlight()
      return
    }

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

      const coords = stops
        .filter(s => s.listing?.lat && s.listing?.lng)
        .map(s => [s.listing.lng, s.listing.lat])

      if (coords.length === 0) return

      const lngs = coords.map(c => c[0])
      const lats = coords.map(c => c[1])
      const sw = [Math.min(...lngs) - 0.02, Math.min(...lats) - 0.02]
      const ne = [Math.max(...lngs) + 0.02, Math.max(...lats) + 0.02]

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/light-v11',
        bounds: [sw, ne],
        fitBoundsOptions: { padding: 50, maxZoom: 13 },
        attributionControl: false,
      })

      mapRef.current = map
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
      map.addControl(new mapboxgl.AttributionControl({ compact: true }))

      map.on('load', () => {
        // Create custom HTML markers for each stop
        const markers = []

        stops.forEach((stop) => {
          if (!stop.listing?.lat || !stop.listing?.lng) return

          const vertColor = VERTICAL_COLORS[stop.listing.vertical] || '#6b7c5a'
          const opacity = DAY_OPACITY[stop.dayNumber] || 1.0
          const isAccom = stop.isAccommodation

          // Create marker element
          const el = document.createElement('div')
          el.style.cssText = `
            width: ${isAccom ? '32px' : '28px'};
            height: ${isAccom ? '32px' : '28px'};
            border-radius: 50%;
            background-color: ${vertColor};
            opacity: ${opacity};
            border: 2.5px solid #fff;
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: system-ui, sans-serif;
            font-size: ${isAccom ? '12px' : '11px'};
            font-weight: 700;
            color: #fff;
            transition: transform 0.15s ease, box-shadow 0.15s ease;
          `

          if (isAccom) {
            // House icon for accommodation
            el.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>'
          } else {
            // Day number + stop number within day
            el.textContent = `${stop.index + 1}`
          }

          el.addEventListener('mouseenter', () => {
            el.style.transform = 'scale(1.2)'
            el.style.boxShadow = '0 3px 10px rgba(0,0,0,0.3)'
          })
          el.addEventListener('mouseleave', () => {
            el.style.transform = 'scale(1)'
            el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)'
          })
          el.addEventListener('click', () => {
            if (onStopClick && !isAccom) {
              onStopClick(stop.index)
            }
          })

          const popup = new mapboxgl.Popup({
            offset: 18,
            closeButton: false,
            closeOnClick: false,
          }).setHTML(`
            <div style="font-family: system-ui; font-size: 12px; padding: 2px 4px; max-width: 200px;">
              <strong>${stop.listing_name}</strong>
              ${!isAccom && stop.dayNumber ? `<br/><span style="color: #8a8a8a; font-size: 11px;">Day ${stop.dayNumber}</span>` : ''}
              ${isAccom ? '<br/><span style="color: #8a5a6b; font-size: 11px;">Your base</span>' : ''}
            </div>
          `)

          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([stop.listing.lng, stop.listing.lat])
            .setPopup(popup)
            .addTo(map)

          el.addEventListener('mouseenter', () => popup.addTo(map))
          el.addEventListener('mouseleave', () => popup.remove())

          markers.push({ marker, el, stop })
        })

        markersRef.current = markers
      })

      return () => {
        map.remove()
        mapRef.current = null
        markersRef.current = []
      }
    })
  }, [stops, onStopClick])

  // Update highlight effect
  function updateHighlight() {
    markersRef.current.forEach(({ el, stop }) => {
      if (stop.index === highlightedStop) {
        el.style.transform = 'scale(1.3)'
        el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.35)'
        el.style.zIndex = '10'
      } else {
        el.style.transform = 'scale(1)'
        el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)'
        el.style.zIndex = '1'
      }
    })
  }

  // Effect to handle highlight changes
  useEffect(() => {
    updateHighlight()
  }, [highlightedStop])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 300,
      }}
    />
  )
}
