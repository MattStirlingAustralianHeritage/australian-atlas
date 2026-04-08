'use client'
import 'mapbox-gl/dist/mapbox-gl.css'

import { useEffect, useRef } from 'react'

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A', fine_grounds: '#8A7055',
  rest: '#5A8A9A', field: '#4A7C59', corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft', fine_grounds: 'Fine Grounds',
  rest: 'Rest', field: 'Field', corner: 'Corner', found: 'Found', table: 'Table',
}

const ROUTE_COLOR = '#C4943A'
const ANIMATION_DURATION_MS = 2500
const FRAME_INTERVAL = 1000 / 60 // ~60fps

/**
 * Measure cumulative distances along a coordinate array.
 * Uses simple Euclidean distance in coordinate space (sufficient for animation pacing).
 */
function measureLine(coords) {
  const distances = [0]
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i][0] - coords[i - 1][0]
    const dy = coords[i][1] - coords[i - 1][1]
    distances.push(distances[i - 1] + Math.sqrt(dx * dx + dy * dy))
  }
  return distances
}

/**
 * Interpolate a point along a polyline at a given fraction (0-1) of total length.
 * Returns the [lng, lat] and the index up to which the line has been drawn.
 */
function interpolateAlongLine(coords, cumDist, fraction) {
  const totalLength = cumDist[cumDist.length - 1]
  if (totalLength === 0) return { point: coords[0], segIndex: 0 }

  const targetDist = fraction * totalLength

  for (let i = 1; i < coords.length; i++) {
    if (cumDist[i] >= targetDist) {
      const segLength = cumDist[i] - cumDist[i - 1]
      const t = segLength > 0 ? (targetDist - cumDist[i - 1]) / segLength : 0
      return {
        point: [
          coords[i - 1][0] + t * (coords[i][0] - coords[i - 1][0]),
          coords[i - 1][1] + t * (coords[i][1] - coords[i - 1][1]),
        ],
        segIndex: i,
      }
    }
  }

  return { point: coords[coords.length - 1], segIndex: coords.length - 1 }
}

/**
 * For each stop, find the fractional progress (0-1) along the route
 * where that stop is closest. Used to time marker reveals.
 */
function stopFractions(stopCoords, routeCoords, cumDist) {
  const totalLength = cumDist[cumDist.length - 1]
  if (totalLength === 0) return stopCoords.map((_, i) => i / Math.max(stopCoords.length - 1, 1))

  return stopCoords.map(sc => {
    let bestDist = Infinity
    let bestFrac = 0
    for (let i = 0; i < routeCoords.length; i++) {
      const dx = routeCoords[i][0] - sc[0]
      const dy = routeCoords[i][1] - sc[1]
      const d = dx * dx + dy * dy
      if (d < bestDist) {
        bestDist = d
        bestFrac = cumDist[i] / totalLength
      }
    }
    return bestFrac
  })
}

async function fetchRouteGeometry(coordinates, token) {
  if (coordinates.length < 2 || coordinates.length > 25) return null
  const coords = coordinates.map(c => c.join(',')).join(';')
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${token}`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    return data.routes?.[0]?.geometry ?? null
  } catch {
    return null
  }
}

export default function TrailMap({ stops }) {
  const mapContainer = useRef(null)
  const mapRef = useRef(null)

  // Sort stops: by day first, then by order_index within each day
  const sortedStops = [...stops].sort((a, b) => {
    const dayA = a.day || 1
    const dayB = b.day || 1
    if (dayA !== dayB) return dayA - dayB
    return (a.order_index || 0) - (b.order_index || 0)
  })

  const validSorted = sortedStops.filter(s => s.venue_lat && s.venue_lng)
  const coordinates = validSorted.map(s => [parseFloat(s.venue_lng), parseFloat(s.venue_lat)])

  useEffect(() => {
    if (!coordinates || coordinates.length === 0) return
    if (mapRef.current) return
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) return

    let animFrame = null

    import('mapbox-gl').then(async (mapboxgl) => {
      mapboxgl = mapboxgl.default || mapboxgl
      mapboxgl.accessToken = token

      const bounds = coordinates.reduce(
        (b, coord) => b.extend(coord),
        new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
      )

      const map = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mattstirlingaustralianheritage/cmn32b0iz003401swccb7d21k',
        bounds,
        fitBoundsOptions: { padding: { top: 60, bottom: 60, left: 60, right: 60 } },
        scrollZoom: false,
      })

      mapRef.current = map
      map.addControl(new mapboxgl.NavigationControl(), 'top-right')

      map.on('load', async () => {
        // Fetch road-following route, fall back to straight lines
        let routeGeometry = null
        if (coordinates.length >= 2) {
          routeGeometry = await fetchRouteGeometry(coordinates, token)
        }

        const routeCoords = routeGeometry
          ? routeGeometry.coordinates
          : [...coordinates]

        const fullGeojson = routeGeometry
          ? { type: 'Feature', geometry: routeGeometry }
          : { type: 'Feature', geometry: { type: 'LineString', coordinates: routeCoords } }

        // Measure the route for animation pacing
        const cumDist = measureLine(routeCoords)
        const totalLength = cumDist[cumDist.length - 1]

        // Compute when each stop marker should appear
        const markerFractions = stopFractions(coordinates, routeCoords, cumDist)

        // Animated route source -- starts as an empty line
        const animatedData = {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [routeCoords[0]] },
        }
        map.addSource('trail-route', { type: 'geojson', data: animatedData })

        // Full route source (used for the static glow after animation)
        map.addSource('trail-route-full', { type: 'geojson', data: fullGeojson })

        // Glow layer on full route -- starts invisible
        map.addLayer({
          id: 'trail-route-glow',
          type: 'line',
          source: 'trail-route-full',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': ROUTE_COLOR, 'line-width': 8, 'line-opacity': 0 },
        })

        // Animated route line
        map.addLayer({
          id: 'trail-route-line',
          type: 'line',
          source: 'trail-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': ROUTE_COLOR,
            'line-width': 3,
          },
        })

        // Create markers -- start hidden (scale 0)
        const markers = []
        validSorted.forEach((stop, index) => {
          const color = VERTICAL_COLORS[stop.vertical] || '#5f8a7e'
          const label = VERTICAL_LABELS[stop.vertical] || stop.vertical || ''

          const el = document.createElement('div')
          el.style.cssText = `width:30px;height:30px;border-radius:50%;background:${color};border:2px solid white;color:white;font-weight:bold;font-size:12px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;font-family:system-ui,sans-serif;transform:scale(0);opacity:0;transition:transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease;`
          el.innerText = index + 1

          const popup = new mapboxgl.Popup({ offset: 20, closeButton: false })
            .setHTML(`
              <div style="font-family:system-ui,sans-serif;padding:6px 4px;">
                <p style="font-weight:600;margin:0 0 2px;font-size:13px;">${stop.venue_name || ''}</p>
                ${label ? `<p style="margin:0;color:${color};font-size:10px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">${label}</p>` : ''}
              </div>
            `)

          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([parseFloat(stop.venue_lng), parseFloat(stop.venue_lat)])
            .setPopup(popup)
            .addTo(map)

          markers.push({ marker, el, fraction: markerFractions[index] })
        })

        // Run animation
        if (totalLength > 0 && routeCoords.length >= 2) {
          const revealedMarkers = new Set()

          // Show first marker immediately
          if (markers.length > 0) {
            markers[0].el.style.transform = 'scale(1)'
            markers[0].el.style.opacity = '1'
            revealedMarkers.add(0)
          }

          let startTime = null

          const animate = (timestamp) => {
            if (!startTime) startTime = timestamp
            const elapsed = timestamp - startTime
            const rawProgress = Math.min(elapsed / ANIMATION_DURATION_MS, 1)
            // Ease-out cubic for smooth deceleration
            const progress = 1 - Math.pow(1 - rawProgress, 3)

            // Build the partial line up to current progress
            const { point, segIndex } = interpolateAlongLine(routeCoords, cumDist, progress)
            const partialCoords = routeCoords.slice(0, segIndex).concat([point])
            if (partialCoords.length < 2) {
              partialCoords.unshift(routeCoords[0])
            }

            map.getSource('trail-route').setData({
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: partialCoords },
            })

            // Fade in glow proportionally
            map.setPaintProperty('trail-route-glow', 'line-opacity', progress * 0.15)

            // Reveal markers as the line reaches them
            markers.forEach((m, i) => {
              if (!revealedMarkers.has(i) && progress >= m.fraction) {
                m.el.style.transform = 'scale(1)'
                m.el.style.opacity = '1'
                revealedMarkers.add(i)
              }
            })

            if (rawProgress < 1) {
              animFrame = requestAnimationFrame(animate)
            } else {
              // Settle into final static state -- full route visible
              map.getSource('trail-route').setData(fullGeojson)
              map.setPaintProperty('trail-route-glow', 'line-opacity', 0.15)
              markers.forEach(m => {
                m.el.style.transform = 'scale(1)'
                m.el.style.opacity = '1'
              })
            }
          }

          // Brief pause for the map to settle before animating
          setTimeout(() => {
            animFrame = requestAnimationFrame(animate)
          }, 400)
        } else {
          // No animation (single stop or zero-length route)
          map.getSource('trail-route').setData(fullGeojson)
          map.setPaintProperty('trail-route-glow', 'line-opacity', 0.15)
          markers.forEach(m => {
            m.el.style.transform = 'scale(1)'
            m.el.style.opacity = '1'
          })
        }
      })
    })

    return () => {
      if (animFrame) cancelAnimationFrame(animFrame)
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!coordinates || coordinates.length === 0) {
    return (
      <div style={{ background: 'var(--color-cream)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '48px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>No mapped stops yet.</p>
      </div>
    )
  }

  return (
    <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--color-border)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      <div ref={mapContainer} style={{ height: 480, width: '100%' }} />
      <div style={{ background: 'var(--color-card-bg)', padding: '10px 16px', borderTop: '1px solid var(--color-border)', textAlign: 'center' }}>
        <p style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', margin: 0 }}>
          {stops.length} stops · Click markers for details
        </p>
      </div>
    </div>
  )
}
