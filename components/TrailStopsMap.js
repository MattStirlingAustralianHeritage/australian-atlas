'use client'
import 'mapbox-gl/dist/mapbox-gl.css'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

const MARKER_COLOR = '#C49A3C'
const ROUTE_COLOR = '#C4943A'
const STYLE_URL = 'mapbox://styles/mattstirlingaustralianheritage/cmn32b0iz003401swccb7d21k'

function isValidStop(s) {
  if (!s) return false
  const lat = parseFloat(s.venue_lat)
  const lng = parseFloat(s.venue_lng)
  return !Number.isNaN(lat) && !Number.isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

export default function TrailStopsMap({ stops, height = 280, interactive = false }) {
  const t = useTranslations('trails')
  const validStops = (stops || []).filter(isValidStop)

  if (validStops.length === 0) {
    return (
      <div style={{
        background: 'var(--color-cream)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        height,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <p style={{ fontSize: 12, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', margin: 0 }}>
          {t('noMappedStops')}
        </p>
      </div>
    )
  }

  return <MapInstance stops={validStops} height={height} interactive={interactive} />
}

function MapInstance({ stops, height, interactive }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const mapboxRef = useRef(null)
  const markersRef = useRef([])
  const [loaded, setLoaded] = useState(false)

  const coordinates = stops.map(s => [parseFloat(s.venue_lng), parseFloat(s.venue_lat)])
  const coordsKey = JSON.stringify(coordinates)

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) return

    let cancelled = false
    const initialCoords = coordinates.length > 0 ? coordinates : [[133, -25]]

    import('mapbox-gl').then(mod => {
      if (cancelled || !containerRef.current) return
      const mapboxgl = mod.default || mod
      mapboxgl.accessToken = token
      mapboxRef.current = mapboxgl

      const bounds = initialCoords.reduce(
        (b, c) => b.extend(c),
        new mapboxgl.LngLatBounds(initialCoords[0], initialCoords[0])
      )

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: STYLE_URL,
        bounds,
        fitBoundsOptions: { padding: 40, maxZoom: 13 },
        interactive,
        scrollZoom: false,
        attributionControl: false,
      })

      mapRef.current = map

      if (interactive) {
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
      }

      map.on('load', () => {
        if (cancelled) return

        map.addSource('trail-route', {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } },
        })

        map.addLayer({
          id: 'trail-route-line',
          type: 'line',
          source: 'trail-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': ROUTE_COLOR, 'line-width': 2.5, 'line-opacity': 0.85 },
        })

        setLoaded(true)
      })
    })

    return () => {
      cancelled = true
      markersRef.current.forEach(m => m.remove())
      markersRef.current = []
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current
    const mapboxgl = mapboxRef.current
    if (!map || !mapboxgl || !loaded) return

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    stops.forEach((stop, index) => {
      const el = document.createElement('div')
      el.style.cssText = `
        width: 26px; height: 26px; border-radius: 50%;
        background: ${MARKER_COLOR};
        border: 2px solid #fff;
        color: #1c1a17;
        font-weight: 700; font-size: 12px;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        font-family: system-ui, -apple-system, sans-serif;
      `
      el.innerText = index + 1

      const popup = new mapboxgl.Popup({ offset: 16, closeButton: false }).setHTML(
        `<div style="font-family:system-ui,sans-serif;padding:4px 6px;font-size:12px;font-weight:600;">${escapeHtml(stop.venue_name || '')}</div>`
      )

      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([parseFloat(stop.venue_lng), parseFloat(stop.venue_lat)])
        .setPopup(popup)
        .addTo(map)

      markersRef.current.push(marker)
    })

    try {
      map.getSource('trail-route')?.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates },
      })
    } catch {}

    if (coordinates.length === 1) {
      map.flyTo({ center: coordinates[0], zoom: 12, duration: 500 })
    } else if (coordinates.length > 1) {
      const bounds = coordinates.reduce(
        (b, c) => b.extend(c),
        new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
      )
      map.fitBounds(bounds, { padding: 40, maxZoom: 13, duration: 500 })
    }
  }, [coordsKey, loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
      <div ref={containerRef} style={{ height, width: '100%' }} />
    </div>
  )
}
