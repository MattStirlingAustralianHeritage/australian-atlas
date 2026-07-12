'use client'
import 'mapbox-gl/dist/mapbox-gl.css'

import { useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from 'react'
import { VERTICAL_ACCENTS } from '@/lib/verticalUrl'

const VERTICAL_COLORS = VERTICAL_ACCENTS

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft', fine_grounds: 'Fine Grounds',
  rest: 'Rest', field: 'Field', corner: 'Corner', found: 'Found', table: 'Table',
}

const ROUTE_COLOR = '#C4943A'
const MARKER_COLOR = '#C49A3C'
// Slowed from 2500: with the camera opening close on the first stop
// and pulling back as the line travels, the draw needs room to read
// as a drive rather than a flick.
const ANIMATION_DURATION_MS = 5200

function measureLine(coords) {
  const distances = [0]
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i][0] - coords[i - 1][0]
    const dy = coords[i][1] - coords[i - 1][1]
    distances.push(distances[i - 1] + Math.sqrt(dx * dx + dy * dy))
  }
  return distances
}

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
      if (d < bestDist) { bestDist = d; bestFrac = cumDist[i] / totalLength }
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
  } catch { return null }
}

/** Inject keyframes for animations once */
function injectAnimationStyles() {
  if (document.getElementById('trail-marker-styles')) return
  const style = document.createElement('style')
  style.id = 'trail-marker-styles'
  style.textContent = `
    @keyframes trail-marker-pulse {
      0% { box-shadow: 0 0 0 0 rgba(196,154,60,0.5); }
      70% { box-shadow: 0 0 0 10px rgba(196,154,60,0); }
      100% { box-shadow: 0 0 0 0 rgba(196,154,60,0); }
    }
    @keyframes trail-suggestion-slide-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes trail-added-slide-in {
      from { opacity: 0; transform: translateX(-12px) scale(0.95); }
      to { opacity: 1; transform: translateX(0) scale(1); }
    }
  `
  document.head.appendChild(style)
}

// routeGeometry (optional): a pre-fetched Directions LineString. When the
// caller already holds the road geometry (the homepage caches it hourly so
// visitors don't each hit the Directions API), the internal fetch is skipped.
const TrailMap = forwardRef(function TrailMap({ stops, routeGeometry: providedGeometry }, ref) {
  const mapContainer = useRef(null)
  const mapRef = useRef(null)
  const mapboxRef = useRef(null)
  const markersRef = useRef([])
  const animQueueRef = useRef([])
  const isAnimatingRef = useRef(false)
  const routeCoordsRef = useRef([])
  const fullGeojsonRef = useRef(null)
  const observerRef = useRef(null)

  // Sort stops: by day first, then by position within each day
  const sortedStops = [...stops].sort((a, b) => {
    const dayA = a.day || 1
    const dayB = b.day || 1
    if (dayA !== dayB) return dayA - dayB
    return (a.position || 0) - (b.position || 0)
  })

  const validSorted = sortedStops.filter(s => s.venue_lat && s.venue_lng)
  const coordinates = validSorted.map(s => [parseFloat(s.venue_lng), parseFloat(s.venue_lat)])

  // Process animation queue
  const processQueue = useCallback(() => {
    if (isAnimatingRef.current || animQueueRef.current.length === 0) return
    const nextStop = animQueueRef.current.shift()
    isAnimatingRef.current = true
    animateNewStop(nextStop).then(() => {
      isAnimatingRef.current = false
      processQueue()
    })
  }, [])

  // Animate a newly added stop
  const animateNewStop = useCallback(async (stop) => {
    const map = mapRef.current
    const mapboxgl = mapboxRef.current
    if (!map || !mapboxgl) return

    const newCoord = [parseFloat(stop.venue_lng), parseFloat(stop.venue_lat)]
    const prevCoords = routeCoordsRef.current
    const isMobile = window.innerWidth < 768
    const markerSize = isMobile ? 32 : 28
    const fontSize = isMobile ? 14 : 13

    // Extend route
    const newRouteCoords = [...prevCoords, newCoord]
    routeCoordsRef.current = newRouteCoords

    // Animate the line extension over 0.8s
    const segStart = prevCoords[prevCoords.length - 1] || newCoord
    const duration = 800
    const startTime = performance.now()

    await new Promise(resolve => {
      function animLine(now) {
        const elapsed = now - startTime
        const rawProgress = Math.min(elapsed / duration, 1)
        const progress = 1 - Math.pow(1 - rawProgress, 3)

        const interpPoint = [
          segStart[0] + progress * (newCoord[0] - segStart[0]),
          segStart[1] + progress * (newCoord[1] - segStart[1]),
        ]

        const partialCoords = [...prevCoords, interpPoint]

        try {
          map.getSource('trail-route')?.setData({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: partialCoords },
          })
          map.getSource('trail-route-full')?.setData({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: partialCoords },
          })
        } catch {}

        if (rawProgress < 1) {
          requestAnimationFrame(animLine)
        } else {
          resolve()
        }
      }
      requestAnimationFrame(animLine)
    })

    // Create and animate the new marker
    const number = markersRef.current.length + 1
    const color = VERTICAL_COLORS[stop.vertical] || MARKER_COLOR

    const wrapper = document.createElement('div')
    wrapper.style.cssText = `display:flex;flex-direction:column;align-items:center;transform:scale(0);opacity:0;transition:transform 0.4s cubic-bezier(0.34,1.56,0.64,1), opacity 0.35s ease;will-change:transform,opacity;`

    const el = document.createElement('div')
    el.style.cssText = `width:${markerSize}px;height:${markerSize}px;border-radius:50%;background:${MARKER_COLOR};border:2.5px solid #fff;color:#1c1a17;font-weight:700;font-size:${fontSize}px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.25);cursor:pointer;font-family:system-ui,-apple-system,sans-serif;transition:transform 0.2s ease;`
    el.innerText = number

    el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.18)' })
    el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)' })

    wrapper.appendChild(el)

    const label = VERTICAL_LABELS[stop.vertical] || stop.vertical || ''
    const popup = new mapboxgl.Popup({ offset: 20, closeButton: false })
      .setHTML(`<div style="font-family:system-ui,sans-serif;padding:6px 4px;"><p style="font-weight:600;margin:0 0 2px;font-size:13px;">${stop.venue_name || ''}</p>${label ? `<p style="margin:0;color:${color};font-size:10px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">${label}</p>` : ''}</div>`)

    const marker = new mapboxgl.Marker({ element: wrapper, anchor: 'bottom' })
      .setLngLat(newCoord)
      .setPopup(popup)
      .addTo(map)

    markersRef.current.push({ marker, wrapper, el })

    // Pop in the marker
    requestAnimationFrame(() => {
      wrapper.style.transform = 'scale(1)'
      wrapper.style.opacity = '1'
    })

    // Remove pulse from previous last marker, add to new last
    if (markersRef.current.length > 1) {
      const prevLast = markersRef.current[markersRef.current.length - 2]
      if (prevLast) prevLast.el.style.animation = 'none'
    }
    setTimeout(() => { el.style.animation = 'trail-marker-pulse 2s ease-out infinite' }, 500)

    // Gently re-fit bounds if needed
    try {
      const bounds = map.getBounds()
      if (!bounds.contains(newCoord)) {
        const allCoords = routeCoordsRef.current
        const newBounds = allCoords.reduce(
          (b, c) => b.extend(c),
          new mapboxgl.LngLatBounds(allCoords[0], allCoords[0])
        )
        map.fitBounds(newBounds, { padding: { top: 60, bottom: 60, left: 60, right: 60 }, duration: 600 })
      }
    } catch {}
  }, [])

  // Expose addStop to parent via ref
  useImperativeHandle(ref, () => ({
    addStop(stop) {
      animQueueRef.current.push(stop)
      processQueue()
    }
  }), [processQueue])

  useEffect(() => {
    if (!coordinates || coordinates.length === 0) return
    if (mapRef.current) return
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) return

    injectAnimationStyles()

    const isMobile = window.innerWidth < 768
    const markerSize = isMobile ? 32 : 28
    const fontSize = isMobile ? 14 : 13

    let animFrame = null
    // Strict-mode dev runs this effect twice before the mapbox import
    // resolves; without the flag both .then callbacks built a map into
    // the same container (two canvases, broken markers). Same guard
    // TrailStopsMap uses.
    let cancelled = false

    import('mapbox-gl').then(async (mapboxgl) => {
      if (cancelled || mapRef.current || !mapContainer.current) return
      mapboxgl = mapboxgl.default || mapboxgl
      mapboxgl.accessToken = token
      mapboxRef.current = mapboxgl

      const bounds = coordinates.reduce(
        (b, coord) => b.extend(coord),
        new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
      )

      // The draw-in choreography opens close on the first stop and
      // pulls back as the line travels, so the camera starts there;
      // reduced motion (or a single stop) keeps the plain fitted view.
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const willAnimate = !reduceMotion && coordinates.length >= 2

      const map = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mattstirlingaustralianheritage/cmn32b0iz003401swccb7d21k',
        ...(willAnimate
          ? { center: coordinates[0], zoom: 12 }
          : { bounds, fitBoundsOptions: { padding: { top: 60, bottom: 60, left: 60, right: 60 } } }),
        scrollZoom: false,
      })

      mapRef.current = map
      map.addControl(new mapboxgl.NavigationControl(), 'top-right')

      map.on('load', async () => {
        let routeGeometry = providedGeometry || null
        if (!routeGeometry && coordinates.length >= 2) {
          routeGeometry = await fetchRouteGeometry(coordinates, token)
        }

        const routeCoords = routeGeometry ? routeGeometry.coordinates : [...coordinates]
        const fullGeojson = routeGeometry
          ? { type: 'Feature', geometry: routeGeometry }
          : { type: 'Feature', geometry: { type: 'LineString', coordinates: routeCoords } }

        const cumDist = measureLine(routeCoords)
        const totalLength = cumDist[cumDist.length - 1]
        const markerFractions = stopFractions(coordinates, routeCoords, cumDist)

        // Animated route source
        map.addSource('trail-route', {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [routeCoords[0]] } },
        })
        map.addSource('trail-route-full', { type: 'geojson', data: fullGeojson })

        // Glow layer
        map.addLayer({
          id: 'trail-route-glow', type: 'line', source: 'trail-route-full',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': ROUTE_COLOR, 'line-width': 8, 'line-opacity': 0 },
        })

        // Animated route line
        map.addLayer({
          id: 'trail-route-line', type: 'line', source: 'trail-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': ROUTE_COLOR, 'line-width': 3 },
        })

        // Determine day breaks for day labels
        const dayFirstIndex = {}
        validSorted.forEach((stop, i) => {
          const day = stop.day || 1
          if (!(day in dayFirstIndex)) dayFirstIndex[day] = i
        })
        const hasDays = Object.keys(dayFirstIndex).length > 1

        // Create numbered markers
        const markers = []
        validSorted.forEach((stop, index) => {
          const color = VERTICAL_COLORS[stop.vertical] || MARKER_COLOR
          const label = VERTICAL_LABELS[stop.vertical] || stop.vertical || ''
          const isLast = index === validSorted.length - 1
          const day = stop.day || 1
          const isFirstOfDay = dayFirstIndex[day] === index && hasDays

          // Marker wrapper (holds circle + optional day label)
          const wrapper = document.createElement('div')
          wrapper.style.cssText = `display:flex;flex-direction:column;align-items:center;transform:scale(0);opacity:0;transition:transform 0.4s cubic-bezier(0.34,1.56,0.64,1), opacity 0.35s ease;will-change:transform,opacity;`

          // Circle marker
          const el = document.createElement('div')
          el.style.cssText = `width:${markerSize}px;height:${markerSize}px;border-radius:50%;background:${MARKER_COLOR};border:2.5px solid #fff;color:#1c1a17;font-weight:700;font-size:${fontSize}px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.25);cursor:pointer;font-family:system-ui,-apple-system,sans-serif;transition:transform 0.2s ease;`
          el.innerText = index + 1

          // Hover effect
          el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.18)' })
          el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)' })

          wrapper.appendChild(el)

          // Day label under first stop of each day
          if (isFirstOfDay) {
            const dayLabel = document.createElement('div')
            dayLabel.style.cssText = `margin-top:3px;font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${MARKER_COLOR};font-family:system-ui,-apple-system,sans-serif;white-space:nowrap;text-shadow:0 1px 3px rgba(255,255,255,0.9);`
            dayLabel.textContent = `Day ${day}`
            wrapper.appendChild(dayLabel)
          }

          const popup = new mapboxgl.Popup({ offset: 20, closeButton: false })
            .setHTML(`
              <div style="font-family:system-ui,sans-serif;padding:6px 4px;">
                <p style="font-weight:600;margin:0 0 2px;font-size:13px;">${stop.venue_name || ''}</p>
                ${label ? `<p style="margin:0;color:${color};font-size:10px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">${label}</p>` : ''}
              </div>
            `)

          const marker = new mapboxgl.Marker({ element: wrapper, anchor: 'bottom' })
            .setLngLat([parseFloat(stop.venue_lng), parseFloat(stop.venue_lat)])
            .setPopup(popup)
            .addTo(map)

          markers.push({ marker, wrapper, el, fraction: markerFractions[index], isLast })
        })

        // Store refs for dynamic additions
        markersRef.current = markers
        routeCoordsRef.current = routeCoords
        fullGeojsonRef.current = fullGeojson

        // Run animation
        if (willAnimate && totalLength > 0 && routeCoords.length >= 2) {
          const revealedMarkers = new Set()

          if (markers.length > 0) {
            markers[0].wrapper.style.transform = 'scale(1)'
            markers[0].wrapper.style.opacity = '1'
            revealedMarkers.add(0)
          }

          // Camera choreography: open close on the first stop, pull
          // back frame by frame to keep the drawn line in view, and
          // settle on the whole route. The pull-back only ever zooms
          // out (monotonic), and any user touch hands the camera over.
          const routeBounds = routeCoords.reduce(
            (b, c) => b.extend(c),
            new mapboxgl.LngLatBounds(routeCoords[0], routeCoords[0])
          )
          const camPadding = { padding: { top: 70, bottom: 70, left: 70, right: 70 } }
          let finalCam = null
          try { finalCam = map.cameraForBounds(routeBounds, camPadding) } catch {}
          let lastZoom = null
          let followCancelled = false
          const stopFollow = () => { followCancelled = true }
          map.on('mousedown', stopFollow)
          map.on('touchstart', stopFollow)
          map.on('wheel', stopFollow)
          if (finalCam) {
            const startZoom = Math.max(finalCam.zoom, Math.min(13.5, finalCam.zoom + 2.4))
            map.jumpTo({ center: routeCoords[0], zoom: startZoom })
            lastZoom = startZoom
          }

          let startTime = null

          const animate = (timestamp) => {
            if (cancelled || !mapRef.current) return
            if (!startTime) startTime = timestamp
            const elapsed = timestamp - startTime
            const rawProgress = Math.min(elapsed / ANIMATION_DURATION_MS, 1)
            const progress = 1 - Math.pow(1 - rawProgress, 3)

            const { point, segIndex } = interpolateAlongLine(routeCoords, cumDist, progress)
            const partialCoords = routeCoords.slice(0, segIndex).concat([point])
            if (partialCoords.length < 2) partialCoords.unshift(routeCoords[0])

            map.getSource('trail-route').setData({
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: partialCoords },
            })

            map.setPaintProperty('trail-route-glow', 'line-opacity', progress * 0.15)

            if (finalCam && !followCancelled) {
              const partialBounds = partialCoords.reduce(
                (b, c) => b.extend(c),
                new mapboxgl.LngLatBounds(partialCoords[0], partialCoords[0])
              )
              let cam = null
              try { cam = map.cameraForBounds(partialBounds, camPadding) } catch {}
              if (cam) {
                const zoom = Math.min(lastZoom, Math.max(cam.zoom, finalCam.zoom))
                map.jumpTo({ center: cam.center, zoom })
                lastZoom = zoom
              }
            }

            markers.forEach((m, i) => {
              if (!revealedMarkers.has(i) && progress >= m.fraction) {
                m.wrapper.style.transform = 'scale(1)'
                m.wrapper.style.opacity = '1'
                revealedMarkers.add(i)
              }
            })

            if (rawProgress < 1) {
              animFrame = requestAnimationFrame(animate)
            } else {
              map.getSource('trail-route').setData(fullGeojson)
              map.setPaintProperty('trail-route-glow', 'line-opacity', 0.15)
              markers.forEach(m => {
                m.wrapper.style.transform = 'scale(1)'
                m.wrapper.style.opacity = '1'
              })
              if (finalCam && !followCancelled) {
                map.easeTo({ center: finalCam.center, zoom: finalCam.zoom, duration: 500 })
              }
              // Final stop pulse
              const last = markers[markers.length - 1]
              if (last) {
                last.el.style.animation = 'trail-marker-pulse 2s ease-out infinite'
              }
            }
          }

          // Hold the draw until the map has actually scrolled into
          // view (the homepage mounts it below the fold; playing on
          // page load meant nobody saw it). Falls back to the old
          // fixed delay where IntersectionObserver is unavailable.
          const begin = () => { animFrame = requestAnimationFrame(animate) }
          if (typeof IntersectionObserver !== 'undefined' && mapContainer.current) {
            const io = new IntersectionObserver((entries) => {
              if (entries.some(e => e.isIntersecting)) {
                io.disconnect()
                setTimeout(begin, 350)
              }
            }, { threshold: 0.35 })
            io.observe(mapContainer.current)
            observerRef.current = io
          } else {
            setTimeout(begin, 400)
          }
        } else {
          if (willAnimate) {
            // Animation was planned (camera opened on the first stop)
            // but the route turned out degenerate: show the fitted view.
            try { map.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 60, right: 60 }, duration: 0 }) } catch {}
          }
          map.getSource('trail-route').setData(fullGeojson)
          map.setPaintProperty('trail-route-glow', 'line-opacity', 0.15)
          markers.forEach(m => {
            m.wrapper.style.transform = 'scale(1)'
            m.wrapper.style.opacity = '1'
          })
          const last = markers[markers.length - 1]
          if (last) last.el.style.animation = 'trail-marker-pulse 2s ease-out infinite'
        }
      })
    })

    return () => {
      cancelled = true
      if (animFrame) cancelAnimationFrame(animFrame)
      observerRef.current?.disconnect()
      observerRef.current = null
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
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
          {stops.length} stops · Hover markers for details
        </p>
      </div>
    </div>
  )
})

export default TrailMap
