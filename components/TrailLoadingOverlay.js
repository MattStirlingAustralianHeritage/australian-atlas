'use client'
import 'mapbox-gl/dist/mapbox-gl.css'

import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Full-screen loading overlay for trail generation on Australian Atlas.
 * Shows an animated Mapbox map with a wandering route line,
 * cycling text messages, and a sage progress bar.
 *
 * Props:
 *   visible      – boolean, whether the overlay is shown
 *   regionLabel  – optional string (e.g. "Barossa") to center the map
 *   waypoints    – optional array of {lat, lng, name} for pin-drop animation
 *   trailReady   – boolean; when true, completes the progress bar and fades out
 *   minimumMs    – minimum display time in ms (default 1500)
 */

const REGION_CENTERS = {
  'Barossa':              { lat: -34.56, lng: 138.95, zoom: 10 },
  'Yarra Valley':         { lat: -37.73, lng: 145.51, zoom: 10 },
  'Mornington Peninsula': { lat: -38.37, lng: 145.03, zoom: 10.5 },
  'Blue Mountains':       { lat: -33.72, lng: 150.31, zoom: 10 },
  'Byron':                { lat: -28.64, lng: 153.61, zoom: 10 },
  'Adelaide Hills':       { lat: -35.02, lng: 138.72, zoom: 10 },
  'Hunter Valley':        { lat: -32.75, lng: 151.28, zoom: 10 },
  'Margaret River':       { lat: -33.95, lng: 115.07, zoom: 10 },
  'Daylesford':           { lat: -37.35, lng: 144.15, zoom: 11 },
  'Macedon Ranges':       { lat: -37.35, lng: 144.55, zoom: 10 },
  'Dandenong Ranges':     { lat: -37.85, lng: 145.35, zoom: 11 },
  'Goldfields':           { lat: -37.05, lng: 144.28, zoom: 9 },
  'Bellarine':            { lat: -38.25, lng: 144.55, zoom: 10.5 },
  'Gippsland':            { lat: -38.05, lng: 146.00, zoom: 8.5 },
  'Southern Highlands':   { lat: -34.50, lng: 150.45, zoom: 10 },
  'McLaren Vale':         { lat: -35.22, lng: 138.55, zoom: 11 },
  'Clare Valley':         { lat: -33.83, lng: 138.60, zoom: 10 },
  'Great Ocean Road':     { lat: -38.68, lng: 143.55, zoom: 9 },
  'Grampians':            { lat: -37.15, lng: 142.45, zoom: 9 },
  'Bruny Island':         { lat: -43.30, lng: 147.33, zoom: 10.5 },
  'Tamar Valley':         { lat: -41.30, lng: 147.05, zoom: 10 },
  'Kangaroo Island':      { lat: -35.80, lng: 137.20, zoom: 9.5 },
  'Granite Belt':         { lat: -28.65, lng: 151.95, zoom: 10 },
  'Scenic Rim':           { lat: -28.10, lng: 152.80, zoom: 10 },
  'Melbourne':            { lat: -37.81, lng: 144.96, zoom: 11 },
  'Sydney':               { lat: -33.87, lng: 151.21, zoom: 11 },
  'Brisbane':             { lat: -27.47, lng: 153.03, zoom: 11 },
  'Adelaide':             { lat: -34.93, lng: 138.60, zoom: 11 },
  'Perth':                { lat: -31.95, lng: 115.86, zoom: 11 },
  'Hobart':               { lat: -42.88, lng: 147.33, zoom: 11 },
  'Launceston':           { lat: -41.45, lng: 147.14, zoom: 11 },
  'Bendigo':              { lat: -36.76, lng: 144.28, zoom: 11 },
  'Ballarat':             { lat: -37.56, lng: 143.85, zoom: 11 },
  'Orange':               { lat: -33.28, lng: 149.10, zoom: 10 },
  'Mudgee':               { lat: -32.60, lng: 149.59, zoom: 10 },
  'Beechworth':           { lat: -36.36, lng: 146.69, zoom: 11 },
  'Fremantle':            { lat: -32.05, lng: 115.75, zoom: 11 },
  'Canberra':             { lat: -35.28, lng: 149.13, zoom: 10 },
  'Noosa':                { lat: -26.39, lng: 153.09, zoom: 11 },
  'Gold Coast':           { lat: -28.02, lng: 153.43, zoom: 10 },
  'Sunshine Coast':       { lat: -26.65, lng: 153.07, zoom: 10 },
  'Central Coast':        { lat: -33.43, lng: 151.34, zoom: 10 },
  'Tasmania':             { lat: -42.00, lng: 146.50, zoom: 7.5 },
  'TAS':                  { lat: -42.00, lng: 146.50, zoom: 7.5 },
  'Victoria':             { lat: -37.40, lng: 144.80, zoom: 7 },
  'VIC':                  { lat: -37.40, lng: 144.80, zoom: 7 },
  'New South Wales':      { lat: -33.00, lng: 149.50, zoom: 6.5 },
  'NSW':                  { lat: -33.00, lng: 149.50, zoom: 6.5 },
  'Queensland':           { lat: -25.00, lng: 150.00, zoom: 5.5 },
  'QLD':                  { lat: -25.00, lng: 150.00, zoom: 5.5 },
  'South Australia':      { lat: -34.50, lng: 138.50, zoom: 7 },
  'SA':                   { lat: -34.50, lng: 138.50, zoom: 7 },
  'Western Australia':    { lat: -32.00, lng: 116.00, zoom: 6 },
  'WA':                   { lat: -32.00, lng: 116.00, zoom: 6 },
}

const DEFAULT_CENTER = { lat: -28.5, lng: 134.5, zoom: 4.2 }

const LOADING_LINES = [
  'Searching across nine atlases\u2026',
  'Finding independent venues\u2026',
  'Plotting your route\u2026',
  'Checking the back roads\u2026',
  'Almost there\u2026',
]

const LINE_CYCLE_MS = 2800

function generateWanderingRoute(center, pointCount = 12, spread = 0.15) {
  const points = []
  let lat = center.lat - spread * 0.4
  let lng = center.lng - spread * 0.5

  for (let i = 0; i < pointCount; i++) {
    lat += (Math.random() - 0.45) * spread * 0.35
    lng += spread * (0.8 + Math.random() * 0.4) / pointCount
    lat += Math.sin((i / (pointCount - 1)) * Math.PI * 2) * spread * 0.1
    points.push([lng, lat])
  }
  return points
}

export default function TrailLoadingOverlay({
  visible,
  regionLabel,
  waypoints,
  trailReady,
  minimumMs = 1500,
}) {
  const [lineIndex, setLineIndex] = useState(0)
  const [fadingOut, setFadingOut] = useState(false)
  const [hidden, setHidden] = useState(!visible)
  const [progress, setProgress] = useState(0)

  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const animFrameRef = useRef(null)
  const startTimeRef = useRef(null)
  const lineIntervalRef = useRef(null)
  const progressIntervalRef = useRef(null)
  const mountedRef = useRef(true)
  const wanderRouteRef = useRef(null)
  const waypointMarkersRef = useRef([])

  const getCenter = useCallback(() => {
    if (regionLabel && REGION_CENTERS[regionLabel]) {
      return REGION_CENTERS[regionLabel]
    }
    if (regionLabel) {
      const key = Object.keys(REGION_CENTERS).find(
        k => k.toLowerCase().includes(regionLabel.toLowerCase()) ||
             regionLabel.toLowerCase().includes(k.toLowerCase())
      )
      if (key) return REGION_CENTERS[key]
    }
    return DEFAULT_CENTER
  }, [regionLabel])

  // Text line cycling
  useEffect(() => {
    if (!visible) return
    setLineIndex(0)
    lineIntervalRef.current = setInterval(() => {
      setLineIndex(prev => (prev + 1) % LOADING_LINES.length)
    }, LINE_CYCLE_MS)
    return () => clearInterval(lineIntervalRef.current)
  }, [visible])

  // Progress bar: fast to ~80%, then slow
  useEffect(() => {
    if (!visible) return
    setProgress(0)
    const start = Date.now()

    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - start
      let p
      if (elapsed < 4000) {
        p = 80 * (1 - Math.pow(1 - elapsed / 4000, 2.5))
      } else {
        const slowElapsed = elapsed - 4000
        p = 80 + 12 * (1 - Math.pow(1 - Math.min(slowElapsed / 20000, 1), 0.5))
      }
      setProgress(Math.min(p, 92))
    }, 50)

    return () => clearInterval(progressIntervalRef.current)
  }, [visible])

  // Show/hide transitions
  useEffect(() => {
    if (visible) {
      setHidden(false)
      setFadingOut(false)
      startTimeRef.current = Date.now()
    }
  }, [visible])

  // Trail ready → fade out
  useEffect(() => {
    if (!trailReady || !visible) return
    clearInterval(progressIntervalRef.current)
    setProgress(100)

    const elapsed = Date.now() - (startTimeRef.current || Date.now())
    const remaining = Math.max(0, minimumMs - elapsed)

    const timeout = setTimeout(() => {
      setFadingOut(true)
      setTimeout(() => {
        setHidden(true)
        setFadingOut(false)
      }, 600)
    }, remaining)

    return () => clearTimeout(timeout)
  }, [trailReady, visible, minimumMs])

  // Initialize Mapbox map
  useEffect(() => {
    if (!visible || hidden) return
    const initTimeout = setTimeout(() => {
      if (!mapContainerRef.current || mapRef.current) return
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      if (!token) return

      import('mapbox-gl').then((mapboxgl) => {
        mapboxgl = mapboxgl.default || mapboxgl
        mapboxgl.accessToken = token

        const center = getCenter()
        const map = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: 'mapbox://styles/mattstirlingaustralianheritage/cmn32b0iz003401swccb7d21k',
          center: [center.lng, center.lat],
          zoom: center.zoom,
          interactive: false,
          attributionControl: false,
          fadeDuration: 0,
        })

        mapRef.current = map

        map.on('load', () => {
          if (!mountedRef.current) return
          startWanderingAnimation(map, center, mapboxgl)
        })
      })
    }, 80)

    return () => {
      clearTimeout(initTimeout)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      waypointMarkersRef.current.forEach(m => m.remove())
      waypointMarkersRef.current = []
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [visible, hidden, getCenter])

  // When waypoints arrive, show pin drops
  useEffect(() => {
    if (!waypoints || waypoints.length === 0 || !mapRef.current) return

    import('mapbox-gl').then((mapboxgl) => {
      mapboxgl = mapboxgl.default || mapboxgl
      const map = mapRef.current
      if (!map) return

      try {
        if (map.getLayer('wander-line')) map.removeLayer('wander-line')
        if (map.getLayer('wander-glow')) map.removeLayer('wander-glow')
        if (map.getSource('wander-route')) map.removeSource('wander-route')
      } catch (e) { /* ignore */ }

      if (waypoints.length >= 2) {
        const bounds = new mapboxgl.LngLatBounds()
        waypoints.forEach(wp => bounds.extend([wp.lng, wp.lat]))
        map.fitBounds(bounds, { padding: 80, duration: 1200 })
      }

      waypoints.forEach((wp, i) => {
        setTimeout(() => {
          if (!mapRef.current) return

          const el = document.createElement('div')
          el.className = 'trail-loading-pin'
          el.style.cssText = `
            width: 24px; height: 24px; border-radius: 50%;
            background: #5f8a7e; border: 2px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            animation: atlasTrailPinDrop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
            opacity: 0; transform: scale(0) translateY(-20px);
          `

          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([wp.lng, wp.lat])
            .addTo(map)

          waypointMarkersRef.current.push(marker)

          if (wp.name) {
            const label = document.createElement('div')
            label.style.cssText = `
              position: absolute; top: -28px; left: 50%;
              transform: translateX(-50%);
              background: rgba(28, 25, 23, 0.85); color: white;
              padding: 3px 8px; border-radius: 3px;
              font-family: var(--font-sans); font-size: 10px;
              font-weight: 600; letter-spacing: 0.03em;
              white-space: nowrap; pointer-events: none;
              animation: atlasTrailLabelFade 0.3s 0.2s ease forwards;
              opacity: 0;
            `
            label.textContent = wp.name
            el.style.position = 'relative'
            el.appendChild(label)
          }

          if (i > 0) {
            const routeCoords = waypoints.slice(0, i + 1).map(w => [w.lng, w.lat])
            const sourceId = 'waypoint-route'
            try {
              if (map.getSource(sourceId)) {
                map.getSource(sourceId).setData({
                  type: 'Feature',
                  geometry: { type: 'LineString', coordinates: routeCoords },
                })
              } else {
                map.addSource(sourceId, {
                  type: 'geojson',
                  data: {
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: routeCoords },
                  },
                })
                map.addLayer({
                  id: 'waypoint-route-glow',
                  type: 'line',
                  source: sourceId,
                  layout: { 'line-join': 'round', 'line-cap': 'round' },
                  paint: { 'line-color': '#5f8a7e', 'line-width': 6, 'line-opacity': 0.2 },
                })
                map.addLayer({
                  id: 'waypoint-route-line',
                  type: 'line',
                  source: sourceId,
                  layout: { 'line-join': 'round', 'line-cap': 'round' },
                  paint: {
                    'line-color': '#4a7166',
                    'line-width': 2.5,
                    'line-dasharray': [2, 1.5],
                  },
                })
              }
            } catch (e) { /* ignore */ }
          }
        }, i * 600)
      })
    })
  }, [waypoints])

  function startWanderingAnimation(map, center, mapboxgl) {
    const route = generateWanderingRoute(center)
    wanderRouteRef.current = route

    map.addSource('wander-route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [route[0]] },
      },
    })

    map.addLayer({
      id: 'wander-glow',
      type: 'line',
      source: 'wander-route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#5f8a7e', 'line-width': 8, 'line-opacity': 0.12 },
    })

    map.addLayer({
      id: 'wander-line',
      type: 'line',
      source: 'wander-route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#4a7166',
        'line-width': 2.5,
        'line-dasharray': [2, 1.5],
      },
    })

    const totalDuration = 6000
    const startTime = performance.now()

    function animate(now) {
      if (!mapRef.current) return
      const elapsed = now - startTime
      const t = Math.min(elapsed / totalDuration, 1)
      const easedT = 1 - Math.pow(1 - t, 2)

      const totalSegments = route.length - 1
      const currentFloat = easedT * totalSegments
      const currentIndex = Math.floor(currentFloat)
      const segFraction = currentFloat - currentIndex

      const coords = route.slice(0, currentIndex + 1)
      if (currentIndex < totalSegments) {
        const from = route[currentIndex]
        const to = route[currentIndex + 1]
        coords.push([
          from[0] + (to[0] - from[0]) * segFraction,
          from[1] + (to[1] - from[1]) * segFraction,
        ])
      }

      try {
        const source = map.getSource('wander-route')
        if (source) {
          source.setData({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: coords },
          })
        }
      } catch (e) { /* map might be removed */ }

      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(animate)
      } else {
        setTimeout(() => {
          if (!mapRef.current) return
          const newRoute = generateWanderingRoute(center)
          wanderRouteRef.current = newRoute
          const newStart = performance.now()

          function animateNext(now) {
            if (!mapRef.current) return
            const el = now - newStart
            const t2 = Math.min(el / totalDuration, 1)
            const et2 = 1 - Math.pow(1 - t2, 2)
            const ts2 = newRoute.length - 1
            const cf2 = et2 * ts2
            const ci2 = Math.floor(cf2)
            const sf2 = cf2 - ci2
            const c2 = newRoute.slice(0, ci2 + 1)
            if (ci2 < ts2) {
              const f2 = newRoute[ci2]
              const t2p = newRoute[ci2 + 1]
              c2.push([
                f2[0] + (t2p[0] - f2[0]) * sf2,
                f2[1] + (t2p[1] - f2[1]) * sf2,
              ])
            }
            try {
              const src = map.getSource('wander-route')
              if (src) {
                src.setData({
                  type: 'Feature',
                  geometry: { type: 'LineString', coordinates: c2 },
                })
              }
            } catch (e) {}
            if (t2 < 1) {
              animFrameRef.current = requestAnimationFrame(animateNext)
            }
          }
          animFrameRef.current = requestAnimationFrame(animateNext)
        }, 800)
      }
    }

    animFrameRef.current = requestAnimationFrame(animate)
  }

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  if (hidden && !visible) return null

  return (
    <>
      <style>{`
        @keyframes atlasTrailPinDrop {
          0% { opacity: 0; transform: scale(0) translateY(-20px); }
          60% { opacity: 1; transform: scale(1.15) translateY(0); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes atlasTrailLabelFade {
          from { opacity: 0; transform: translateX(-50%) translateY(4px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes atlasTrailTextFade {
          0% { opacity: 0; transform: translateY(6px); }
          12% { opacity: 1; transform: translateY(0); }
          82% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-6px); }
        }
        @keyframes atlasProgressPulse {
          0%, 100% { opacity: 0.85; }
          50% { opacity: 1; }
        }
      `}</style>

      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          opacity: fadingOut ? 0 : 1,
          transition: 'opacity 0.6s ease',
          pointerEvents: fadingOut ? 'none' : 'auto',
        }}
      >
        {/* Progress bar */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            zIndex: 10002,
            background: 'rgba(0,0,0,0.15)',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #4a7166, #5f8a7e)',
              transition: progress === 100 ? 'width 0.4s ease' : 'width 0.15s linear',
              animation: progress < 100 ? 'atlasProgressPulse 2s ease infinite' : 'none',
            }}
          />
        </div>

        {/* Map background */}
        <div
          ref={mapContainerRef}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10000,
          }}
        />
        {/* Dim overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10001,
            background: 'rgba(28, 25, 23, 0.45)',
            pointerEvents: 'none',
          }}
        />

        {/* Text overlay */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10002,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 'max(20vh, 100px)',
            pointerEvents: 'none',
          }}
        >
          {/* Branding */}
          <div
            style={{
              fontSize: 9,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.45)',
              fontFamily: 'var(--font-sans)',
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            Australian Atlas
          </div>

          {/* Cycling text */}
          <div
            style={{
              position: 'relative',
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {LOADING_LINES.map((line, i) => (
              <span
                key={line}
                style={{
                  position: 'absolute',
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(18px, 3vw, 26px)',
                  fontWeight: 400,
                  color: '#fff',
                  whiteSpace: 'nowrap',
                  opacity: i === lineIndex ? 1 : 0,
                  transform: i === lineIndex ? 'translateY(0)' : 'translateY(6px)',
                  transition: 'opacity 0.5s ease, transform 0.5s ease',
                }}
              >
                {line}
              </span>
            ))}
          </div>

          {/* Subline */}
          <div
            style={{
              marginTop: 14,
              fontSize: 12,
              color: 'rgba(255,255,255,0.35)',
              fontFamily: 'var(--font-sans)',
              letterSpacing: '0.02em',
            }}
          >
            Building from verified venues only
          </div>
        </div>
      </div>
    </>
  )
}
