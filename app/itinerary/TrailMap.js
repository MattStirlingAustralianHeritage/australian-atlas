'use client'

import { useEffect, useRef } from 'react'

const DAY_COLORS = ['#B87333', '#4A6741', '#4A5568', '#744210', '#2C5282']
const ACCOM_COLOR = '#5A8A9A'
const ANIMATION_MS = 1500

// Brand colours per vertical — matches itinerary page
const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A', fine_grounds: '#8A7055',
  rest: '#5A8A9A', field: '#4A7C59', corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

/**
 * Trail itinerary map — native GL layers (no HTML markers).
 *
 * Sources:
 *   trail-stops        FeatureCollection of Points (number, name, isAccom, visible)
 *   trail-route-{i}    LineString per day (animated on load)
 *
 * Layers:
 *   trail-route-line-{i}   per-day route line
 *   trail-stops-circle      numbered dot background
 *   trail-stops-number      stop index text
 */
export default function TrailMap({ days }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const initializedRef = useRef(false)

  // Initial map creation — only runs once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    if (!days || days.length === 0) return

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

      // Collect ALL stops including overnights
      const allStops = collectStops(days)
      if (allStops.length === 0) return

      // Calculate initial bounds for immediate fit (no zoom pop)
      const lngs = allStops.map(s => parseFloat(s.lng))
      const lats = allStops.map(s => parseFloat(s.lat))
      const sw = [Math.min(...lngs), Math.min(...lats)]
      const ne = [Math.max(...lngs), Math.max(...lats)]

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/light-v11',
        bounds: [sw, ne],
        fitBoundsOptions: { padding: 80, maxZoom: 16 },
        attributionControl: false,
      })

      mapRef.current = map
      map.addControl(new mapboxgl.NavigationControl(), 'top-right')
      map.addControl(new mapboxgl.AttributionControl({ compact: true }))

      map.on('load', () => {
        map.resize()
        buildLayers(map, mapboxgl, days, allStops)
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
  }, [days])

  // Update map data when days change (e.g. user adds a recommendation)
  useEffect(() => {
    if (!initializedRef.current || !mapRef.current) return
    const map = mapRef.current
    const allStops = collectStops(days)
    if (allStops.length === 0) return

    // Update stop source with all stops visible
    const geojson = stopsGeoJSON(allStops)
    geojson.features.forEach(f => { f.properties.visible = true })
    const src = map.getSource('trail-stops')
    if (src) src.setData(geojson)

    // Refit bounds to include new stops
    const lngs = allStops.map(s => parseFloat(s.lng))
    const lats = allStops.map(s => parseFloat(s.lat))
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)],
       [Math.max(...lngs), Math.max(...lats)]],
      { padding: 80, duration: 500, maxZoom: 16 }
    )
  }, [days])

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 400 }} />
  )
}

// ── Helpers ──────────────────────────────────────────────────

/** Flatten days → ordered stop list including overnights. */
function collectStops(days) {
  const out = []
  let idx = 0
  days.forEach((day, dayIdx) => {
    ;(day.stops || [])
      .filter(s => s.lat && s.lng && !isNaN(s.lat) && !isNaN(s.lng))
      .forEach(stop => {
        idx++
        out.push({ ...stop, _idx: idx, _day: dayIdx, _accom: stop.vertical === 'rest' })
      })
    if (day.overnight?.lat && day.overnight?.lng && !isNaN(day.overnight.lat) && !isNaN(day.overnight.lng)) {
      idx++
      out.push({ ...day.overnight, _idx: idx, _day: dayIdx, _accom: true })
    }
  })
  return out
}

/** Build a GeoJSON FeatureCollection for stops. */
function stopsGeoJSON(allStops) {
  return {
    type: 'FeatureCollection',
    features: allStops.map(s => {
      const vertColor = VERTICAL_COLORS[s.vertical] || '#1a1a1a'
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [parseFloat(s.lng), parseFloat(s.lat)] },
        properties: {
          number: s._accom ? '⌂' : String(s._idx),
          name: s.venue_name || s.name || '',
          vertical: s.vertical || '',
          verticalColor: vertColor,
          isAccom: s._accom || false,
          day: s._day,
          visible: false,
        },
      }
    }),
  }
}

// ── Layer construction + animation ──────────────────────────

async function buildLayers(map, mapboxgl, days, allStops) {
  // 1. Fit bounds — tight to actual stops, 80px padding, no extra degree buffer
  const lngs = allStops.map(s => parseFloat(s.lng))
  const lats = allStops.map(s => parseFloat(s.lat))
  map.fitBounds(
    [[Math.min(...lngs), Math.min(...lats)],
     [Math.max(...lngs), Math.max(...lats)]],
    { padding: 80, duration: 0, maxZoom: 16 }
  )

  // 2. Fetch routed geometry per day (in parallel)
  const routePromises = days.map(async (day, i) => {
    const dayStops = allStops.filter(s => s._day === i)
    if (dayStops.length < 2) {
      return dayStops.map(s => [parseFloat(s.lng), parseFloat(s.lat)])
    }
    const coords = dayStops.map(s => [parseFloat(s.lng), parseFloat(s.lat)])
    try {
      const coordStr = coords.map(c => c.join(',')).join(';')
      const res = await fetch(`/api/mapbox/directions?coords=${encodeURIComponent(coordStr)}`)
      if (res.ok) {
        const data = await res.json()
        if (data.geometry?.coordinates?.length >= 2) return data.geometry.coordinates
      }
    } catch { /* fall back to straight lines */ }
    return coords
  })
  const dayRoutes = await Promise.all(routePromises)

  // 3. Add empty route sources + line layers (drawn first so stops render on top)
  dayRoutes.forEach((_, i) => {
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
  })

  // 4. Add stop source + layers (on top of routes)
  const geojson = stopsGeoJSON(allStops)
  map.addSource('trail-stops', { type: 'geojson', data: geojson })

  map.addLayer({
    id: 'trail-stops-circle',
    type: 'circle',
    source: 'trail-stops',
    filter: ['==', ['get', 'visible'], true],
    paint: {
      'circle-radius': ['case', ['==', ['get', 'isAccom'], true], 15, 14],
      'circle-color': ['get', 'verticalColor'],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  })

  map.addLayer({
    id: 'trail-stops-number',
    type: 'symbol',
    source: 'trail-stops',
    filter: ['==', ['get', 'visible'], true],
    layout: {
      'text-field': ['get', 'number'],
      'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
      'text-size': 12,
      'text-allow-overlap': true,
      'icon-allow-overlap': true,
    },
    paint: { 'text-color': '#ffffff' },
  })

  // 5. Hover popup
  const popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 18,
    maxWidth: '240px',
  })
  map.on('mouseenter', 'trail-stops-circle', (e) => {
    map.getCanvas().style.cursor = 'pointer'
    const props = e.features[0].properties
    const coords = e.features[0].geometry.coordinates.slice()
    const vertColor = props.verticalColor || '#1a1a1a'
    const vertLabel = props.vertical ? (props.vertical === 'sba' ? 'Small Batch' : props.vertical === 'fine_grounds' ? 'Fine Grounds' : props.vertical.charAt(0).toUpperCase() + props.vertical.slice(1)) : ''
    popup
      .setLngLat(coords)
      .setHTML(
        `<div style="font-family:system-ui,-apple-system,sans-serif;padding:2px 4px;">` +
        `<div style="font-size:13px;font-weight:600;color:#1a1a1a;">${props.name}</div>` +
        (vertLabel
          ? `<div style="font-size:10px;color:${vertColor};font-weight:600;margin-top:2px;">${props.isAccom === true || props.isAccom === 'true' ? '🛏 ' : ''}${vertLabel}</div>`
          : '') +
        `</div>`
      )
      .addTo(map)
  })
  map.on('mouseleave', 'trail-stops-circle', () => {
    map.getCanvas().style.cursor = ''
    popup.remove()
  })

  // 6. Animate route drawing + reveal stops
  animateRoutes(map, dayRoutes, allStops, geojson)
}

// ── Route animation ─────────────────────────────────────────

function animateRoutes(map, dayRoutes, allStops, geojson) {
  // Pre-compute: for each day route, find the closest coord index for each stop
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
      return { globalIdx: stop._idx, coordIdx: closest }
    })
    return { coords, dayIdx, stopCoordMap }
  })

  const start = performance.now()

  function tick(now) {
    const elapsed = now - start
    const t = Math.min(elapsed / ANIMATION_MS, 1)
    const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic

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

      // Reveal stops as the line reaches them
      for (const { globalIdx, coordIdx } of stopCoordMap) {
        if (endIdx > coordIdx) {
          const fi = geojson.features.findIndex(
            f => f.properties.number === String(globalIdx)
          )
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
      // Ensure every stop is visible at the end
      let final = false
      geojson.features.forEach(f => {
        if (!f.properties.visible) { f.properties.visible = true; final = true }
      })
      if (final) map.getSource('trail-stops').setData(geojson)
    }
  }

  requestAnimationFrame(tick)
}
