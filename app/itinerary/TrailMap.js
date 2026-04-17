'use client'

import { useEffect, useRef, useCallback } from 'react'
import {
  stopsToGeoJSON,
  allStopLayers,
} from '@/lib/routeEditor/mapLayers'

const DAY_COLORS = ['#B87333', '#4A6741', '#4A5568', '#744210', '#2C5282']
const ANIMATION_MS = 1500

/**
 * Trail itinerary map with interactive route editing.
 *
 * Props:
 *   stops      — Flat ordered stop list from useRouteEditor, augmented with
 *                _included, _pinned, _idx, _day, _accom fields.
 *   days       — Original days array (used only for day count / route grouping).
 *   onToggle   — (stopId) => void — called when user clicks a marker to toggle.
 *                If null, markers are not clickable (read-only mode).
 *
 * The map renders two visual states for stops:
 *   - Included: filled circle with white text number
 *   - Excluded: outline-only circle with faded number
 *
 * Routes are fetched per day, using only included stops as waypoints.
 * When toggle state changes, routes are re-fetched and redrawn.
 */
export default function TrailMap({ stops, days, onToggle }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const initializedRef = useRef(false)
  // Track current route fetch generation to discard stale responses
  const routeGenRef = useRef(0)

  // ── Initial map creation (runs once) ──
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    if (!stops || stops.length === 0) return

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

      const validStops = stops.filter(s => s.lat && s.lng && !isNaN(s.lat) && !isNaN(s.lng))
      if (validStops.length === 0) return

      const lngs = validStops.map(s => parseFloat(s.lng))
      const lats = validStops.map(s => parseFloat(s.lat))

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/light-v11',
        bounds: [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        fitBoundsOptions: { padding: 80, maxZoom: 16 },
        attributionControl: false,
      })

      mapRef.current = map
      map.addControl(new mapboxgl.NavigationControl(), 'top-right')
      map.addControl(new mapboxgl.AttributionControl({ compact: true }))

      map.on('load', () => {
        map.resize()
        buildLayers(map, mapboxgl, stops, days)
        initializedRef.current = true
      })
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        initializedRef.current = false
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update map when stops or toggle state changes ──
  useEffect(() => {
    if (!initializedRef.current || !mapRef.current) return
    const map = mapRef.current
    if (!stops || stops.length === 0) return

    // Update stop markers (GeoJSON source)
    const geojson = stopsToGeoJSON(stops)
    // All stops visible immediately on update (animation only on first load)
    geojson.features.forEach(f => { f.properties.visible = true })
    const src = map.getSource('trail-stops')
    if (src) src.setData(geojson)

    // Re-fetch and redraw routes using only included stops
    updateRoutes(map, stops, days)

    // Refit bounds to include all stops (not just active)
    const validStops = stops.filter(s => s.lat && s.lng && !isNaN(s.lat) && !isNaN(s.lng))
    if (validStops.length > 0) {
      const lngs = validStops.map(s => parseFloat(s.lng))
      const lats = validStops.map(s => parseFloat(s.lat))
      map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)],
         [Math.max(...lngs), Math.max(...lats)]],
        { padding: 80, duration: 500, maxZoom: 16 }
      )
    }
  }, [stops, days]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Click handler for marker toggle ──
  const onToggleRef = useRef(onToggle)
  onToggleRef.current = onToggle

  useEffect(() => {
    if (!initializedRef.current || !mapRef.current) return
    const map = mapRef.current

    function handleClick(e) {
      if (!onToggleRef.current) return
      const feature = e.features?.[0]
      if (!feature) return
      const stopId = feature.properties.id
      const pinned = feature.properties.pinned
      if (pinned === true || pinned === 'true') return
      onToggleRef.current(stopId)
    }

    // Listen on both included and excluded circle layers
    map.on('click', 'trail-stops-circle', handleClick)
    map.on('click', 'trail-stops-circle-excluded', handleClick)

    return () => {
      if (!map || !map.getLayer) return
      map.off('click', 'trail-stops-circle', handleClick)
      map.off('click', 'trail-stops-circle-excluded', handleClick)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 400 }} />
  )
}

// ── Layer construction + initial animation ──────────────────

async function buildLayers(map, mapboxgl, stops, days) {
  const validStops = stops.filter(s => s.lat && s.lng && !isNaN(s.lat) && !isNaN(s.lng))
  if (validStops.length === 0) return

  // Fit bounds
  const lngs = validStops.map(s => parseFloat(s.lng))
  const lats = validStops.map(s => parseFloat(s.lat))
  map.fitBounds(
    [[Math.min(...lngs), Math.min(...lats)],
     [Math.max(...lngs), Math.max(...lats)]],
    { padding: 80, duration: 0, maxZoom: 16 }
  )

  // Fetch routed geometry per day (included stops only)
  const dayCount = days?.length || 1
  const dayRoutes = await fetchRoutes(stops, dayCount)

  // Add empty route sources + line layers (drawn first so stops render on top)
  for (let i = 0; i < dayCount; i++) {
    map.addSource(`trail-route-${i}`, {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } },
    })
    map.addLayer({
      id: `trail-route-line-${i}`,
      type: 'line',
      source: `trail-route-${i}`,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': DAY_COLORS[i % DAY_COLORS.length],
        'line-width': 3,
        'line-opacity': 0.8,
      },
    })
  }

  // Add stop source + layers (on top of routes)
  const geojson = stopsToGeoJSON(stops)
  map.addSource('trail-stops', { type: 'geojson', data: geojson })

  for (const layer of allStopLayers()) {
    map.addLayer(layer)
  }

  // Hover popup
  const popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 18,
    maxWidth: '240px',
  })

  function showPopup(e) {
    map.getCanvas().style.cursor = 'pointer'
    const props = e.features[0].properties
    const coords = e.features[0].geometry.coordinates.slice()
    const vertColor = props.verticalColor || '#1a1a1a'
    const vertLabel = props.vertical
      ? (props.vertical === 'sba' ? 'Small Batch'
        : props.vertical === 'fine_grounds' ? 'Fine Grounds'
        : props.vertical.charAt(0).toUpperCase() + props.vertical.slice(1))
      : ''
    const included = props.included === true || props.included === 'true'
    const pinned = props.pinned === true || props.pinned === 'true'

    popup
      .setLngLat(coords)
      .setHTML(
        `<div style="font-family:system-ui,-apple-system,sans-serif;padding:2px 4px;">` +
        `<div style="font-size:13px;font-weight:600;color:#1a1a1a;">${props.name}</div>` +
        (vertLabel
          ? `<div style="font-size:10px;color:${vertColor};font-weight:600;margin-top:2px;">${props.isAccom === true || props.isAccom === 'true' ? '🛏 ' : ''}${vertLabel}</div>`
          : '') +
        (!pinned
          ? `<div style="font-size:10px;color:#888;margin-top:3px;">${included ? 'Click to remove from route' : 'Click to add to route'}</div>`
          : '') +
        `</div>`
      )
      .addTo(map)
  }

  function hidePopup() {
    map.getCanvas().style.cursor = ''
    popup.remove()
  }

  map.on('mouseenter', 'trail-stops-circle', showPopup)
  map.on('mouseenter', 'trail-stops-circle-excluded', showPopup)
  map.on('mouseleave', 'trail-stops-circle', hidePopup)
  map.on('mouseleave', 'trail-stops-circle-excluded', hidePopup)

  // Animate route drawing + reveal stops
  animateRoutes(map, dayRoutes, stops, geojson)
}

// ── Route fetching ──────────────────────────────────────────

async function fetchRoutes(stops, dayCount) {
  const routes = []
  for (let i = 0; i < dayCount; i++) {
    // Only included stops contribute to the driving route
    const dayStops = stops.filter(s => s._day === i && s._included !== false)
    const validStops = dayStops.filter(s => s.lat && s.lng && !isNaN(s.lat) && !isNaN(s.lng))

    if (validStops.length < 2) {
      routes.push(validStops.map(s => [parseFloat(s.lng), parseFloat(s.lat)]))
      continue
    }

    const coords = validStops.map(s => [parseFloat(s.lng), parseFloat(s.lat)])
    try {
      const coordStr = coords.map(c => c.join(',')).join(';')
      const res = await fetch(`/api/mapbox/directions?coords=${encodeURIComponent(coordStr)}`)
      if (res.ok) {
        const data = await res.json()
        if (data.geometry?.coordinates?.length >= 2) {
          routes.push(data.geometry.coordinates)
          continue
        }
      }
    } catch { /* fall back to straight lines */ }
    routes.push(coords)
  }
  return routes
}

// ── Update routes (called on toggle, no animation) ──────────

async function updateRoutes(map, stops, days) {
  const dayCount = days?.length || 1
  const dayRoutes = await fetchRoutes(stops, dayCount)

  for (let i = 0; i < dayCount; i++) {
    const src = map.getSource(`trail-route-${i}`)
    if (src) {
      const coords = dayRoutes[i] || []
      src.setData({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: coords.length >= 2 ? coords : [],
        },
      })
    }
  }
}

// ── Route animation (first load only) ───────────────────────

function animateRoutes(map, dayRoutes, allStops, geojson) {
  const segments = dayRoutes.map((coords, dayIdx) => {
    const dayStops = allStops.filter(s => s._day === dayIdx)
    const stopCoordMap = dayStops.map(stop => {
      const sLng = parseFloat(stop.lng)
      const sLat = parseFloat(stop.lat)
      let closest = 0
      let best = Infinity
      for (let j = 0; j < coords.length; j++) {
        const d = (coords[j][0] - sLng) ** 2 + (coords[j][1] - sLat) ** 2
        if (d < best) { best = d; closest = j }
      }
      return { id: stop.id, coordIdx: closest }
    })
    return { coords, dayIdx, stopCoordMap }
  })

  const start = performance.now()

  function tick(now) {
    const elapsed = now - start
    const t = Math.min(elapsed / ANIMATION_MS, 1)
    const eased = 1 - Math.pow(1 - t, 3)

    let revealed = false

    for (const seg of segments) {
      const { coords, dayIdx, stopCoordMap } = seg
      if (coords.length === 0) continue

      const endIdx = Math.max(1, Math.floor(eased * coords.length))
      const partial = coords.slice(0, endIdx)

      if (partial.length >= 2) {
        const src = map.getSource(`trail-route-${dayIdx}`)
        if (src) {
          src.setData({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: partial },
          })
        }
      }

      for (const { id, coordIdx } of stopCoordMap) {
        if (endIdx > coordIdx) {
          const fi = geojson.features.findIndex(f => f.properties.id === String(id))
          if (fi >= 0 && !geojson.features[fi].properties.visible) {
            geojson.features[fi].properties.visible = true
            revealed = true
          }
        }
      }
    }

    if (revealed) {
      map.getSource('trail-stops').setData(geojson)
    }

    if (t < 1) {
      requestAnimationFrame(tick)
    } else {
      let final = false
      geojson.features.forEach(f => {
        if (!f.properties.visible) { f.properties.visible = true; final = true }
      })
      if (final) map.getSource('trail-stops').setData(geojson)
    }
  }

  requestAnimationFrame(tick)
}
