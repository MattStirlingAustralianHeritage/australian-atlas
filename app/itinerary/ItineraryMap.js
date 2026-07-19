'use client'

import 'mapbox-gl/dist/mapbox-gl.css'
import { useRef, useEffect } from 'react'
import { getVerticalBadge, getVerticalBrandColour, VERTICAL_ACCENTS } from '@/lib/verticalUrl'
import { dayColor } from './engineShared'

const AUSTRALIA_BOUNDS = [
  [112.7, -43.9],
  [153.9, -10.4],
]
const MAX_DAYS = 7

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

function pinColor(vertical) {
  return getVerticalBrandColour(vertical) || VERTICAL_ACCENTS[vertical] || '#5F8A7E'
}

/**
 * ItineraryMap — the working surface of the Itinerary Engine.
 *
 * Layers, bottom to top:
 *   discovery clusters + pins  — every place in range, coloured by vertical.
 *                                Pins already on the itinerary recede.
 *   per-day route lines        — one line per day, coloured by that day.
 *   numbered stop markers       — DOM markers, coloured by day, numbered
 *                                 within their day.
 *
 * The map initialises once; everything flows in via setData so the camera is
 * never yanked from under the user. Clicking any pin opens an add/remove card.
 */
export default function ItineraryMap({
  pins = [],
  stops = [],
  routesByDay = {},
  initialCenter,
  activeDay = null,
  highlightId,
  candidateIds = [],
  onAddStop,
  onRemoveStop,
  active = true,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const readyRef = useRef(false)
  const popupRef = useRef(null)
  const hoverTipRef = useRef(null)
  const markersRef = useRef([])
  const pinByIdRef = useRef(new Map())
  const stopIdSetRef = useRef(new Set())
  const prevStopsLenRef = useRef(0)
  const framedRef = useRef(false)
  const initialCenterRef = useRef(initialCenter)
  const cbRef = useRef({ onAddStop, onRemoveStop })

  useEffect(() => {
    cbRef.current = { onAddStop, onRemoveStop }
  }, [onAddStop, onRemoveStop])

  useEffect(() => {
    initialCenterRef.current = initialCenter
  }, [initialCenter])

  useEffect(() => {
    const m = new Map()
    for (const p of pins) m.set(String(p.id), p)
    pinByIdRef.current = m
  }, [pins])

  useEffect(() => {
    stopIdSetRef.current = new Set(stops.map((s) => String(s.id)))
  }, [stops])

  // ── Map init (once) ──
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let cancelled = false

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (cancelled || !containerRef.current) return
      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

      const m = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mattstirlingaustralianheritage/cmn32b0iz003401swccb7d21k',
        bounds: AUSTRALIA_BOUNDS,
        fitBoundsOptions: { padding: 48 },
        projection: 'mercator',
        minZoom: 2,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        attributionControl: false,
        // The map lives in a sticky card beside a scrolling page — plain
        // wheel events must scroll the page, not hijack the zoom.
        cooperativeGestures: true,
      })
      mapRef.current = m
      m.on('error', (e) => console.warn('[itinerary-map]', e?.error?.message || e?.error || e))

      m.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')
      m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')

      popupRef.current = new mapboxgl.Popup({ closeButton: true, closeOnClick: false, maxWidth: '280px', offset: 14 })
      hoverTipRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, maxWidth: '240px', offset: 12, className: 'ie-builder-tip' })
      const hoverEnabled = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches

      // The hosted style is built on Mapbox Standard (style imports). `load`
      // waits for every import to settle and can hang; `style.load` is the
      // documented hook for adding custom sources/layers on v3 import-based
      // styles. Run setup once on whichever fires first.
      let setupDone = false
      const setup = () => {
        if (cancelled || setupDone) return
        if (m.getSource('discovery')) {
          setupDone = true
          return
        }
        setupDone = true

        m.addSource('discovery', {
          type: 'geojson',
          cluster: true,
          clusterMaxZoom: 11,
          clusterMinPoints: 6,
          clusterRadius: 42,
          data: { type: 'FeatureCollection', features: [] },
        })
        m.addLayer({
          id: 'discovery-clusters',
          type: 'circle',
          source: 'discovery',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': 'rgba(95,138,126,0.72)',
            'circle-radius': ['step', ['get', 'point_count'], 13, 40, 18, 150, 24],
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#ffffff',
          },
        })
        m.addLayer({
          id: 'discovery-cluster-count',
          type: 'symbol',
          source: 'discovery',
          filter: ['has', 'point_count'],
          layout: { 'text-field': '{point_count_abbreviated}', 'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'], 'text-size': 11 },
          paint: { 'text-color': '#ffffff' },
        })
        m.addLayer({
          id: 'discovery-pins',
          type: 'circle',
          source: 'discovery',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 4.5, 10, 6, 14, 8],
            'circle-color': ['get', 'color'],
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': ['case', ['get', 'added'], 0.28, 0.92],
          },
        })
        // The current trio of choices gets a quiet ring so the three options
        // read on the map while the traveller decides.
        m.addLayer({
          id: 'discovery-candidates',
          type: 'circle',
          source: 'discovery',
          filter: ['all', ['!', ['has', 'point_count']], ['in', ['get', 'id'], ['literal', []]]],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 9, 14, 13],
            'circle-color': 'transparent',
            'circle-stroke-width': 2,
            'circle-stroke-color': ['get', 'color'],
            'circle-stroke-opacity': 0.55,
          },
        })
        m.addLayer({
          id: 'discovery-highlight',
          type: 'circle',
          source: 'discovery',
          filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], '__none__']],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 11, 14, 16],
            'circle-color': 'transparent',
            'circle-stroke-width': 2.5,
            'circle-stroke-color': ['get', 'color'],
            'circle-stroke-opacity': 0.9,
          },
        })

        // One route source + layer per possible day.
        for (let d = 0; d < MAX_DAYS; d++) {
          m.addSource(`route-day-${d}`, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } } })
          m.addLayer({
            id: `route-day-${d}`,
            type: 'line',
            source: `route-day-${d}`,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': dayColor(d), 'line-width': 3, 'line-opacity': 0.8 },
          })
        }

        m.on('mouseenter', 'discovery-pins', (e) => {
          m.getCanvas().style.cursor = 'pointer'
          if (!hoverEnabled || !e.features?.length) return
          const p = e.features[0].properties
          hoverTipRef.current
            .setLngLat(e.features[0].geometry.coordinates.slice())
            .setHTML(
              `<div style="font-family:system-ui,-apple-system,sans-serif;padding:1px 2px;">
                <div style="font-family:Georgia,serif;font-size:13px;color:#1a1614;line-height:1.25;">${esc(p.name)}</div>
                <div style="font-size:10px;color:#9a8878;margin-top:2px;">${esc(p.badge)}${p.region && p.region !== 'null' ? ` · ${esc(p.region)}` : ''}${p.added === 'true' || p.added === true ? ' · On your trip' : ''}</div>
              </div>`
            )
            .addTo(m)
        })
        m.on('mouseleave', 'discovery-pins', () => {
          m.getCanvas().style.cursor = ''
          hoverTipRef.current?.remove()
        })
        m.on('click', 'discovery-pins', (e) => {
          if (!e.features?.length) return
          const coords = e.features[0].geometry.coordinates.slice()
          hoverTipRef.current?.remove()
          openPinPopup(m, coords, String(e.features[0].properties.id))
        })
        m.on('click', 'discovery-clusters', (e) => {
          const features = m.queryRenderedFeatures(e.point, { layers: ['discovery-clusters'] })
          const clusterId = features[0]?.properties?.cluster_id
          if (clusterId == null) return
          m.getSource('discovery').getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return
            m.easeTo({ center: features[0].geometry.coordinates, zoom: zoom + 1 })
          })
        })
        m.on('mouseenter', 'discovery-clusters', () => { m.getCanvas().style.cursor = 'pointer' })
        m.on('mouseleave', 'discovery-clusters', () => { m.getCanvas().style.cursor = '' })

        readyRef.current = true
        m.fire('atlas:ready')

        // Frame the destination here, on the live instance — a one-shot
        // atlas:ready handler races with React StrictMode's double-mount.
        const ic = initialCenterRef.current
        if (ic && Number.isFinite(ic.lat) && Number.isFinite(ic.lng)) {
          framedRef.current = true
          m.flyTo({ center: [ic.lng, ic.lat], zoom: (ic.zoom || 9) - 0.4, duration: 1100, essential: true })
        }
      }
      // With an import-based style, custom sources can only be added once the
      // imports settle — 'load' signals that. Some environments never resolve
      // the Standard import; the watchdog below swaps to a classic style
      // (no imports, loads everywhere) whose style.load re-triggers setup.
      const trySetup = () => {
        if (cancelled || setupDone) return
        try {
          setup()
        } catch (e) {
          setupDone = false // style not actually ready — watchdog will recover
        }
      }
      m.on('load', trySetup)
      m.on('style.load', trySetup)
      const watchdog = setTimeout(() => {
        if (!cancelled && !setupDone) {
          m.setStyle('mapbox://styles/mapbox/light-v11')
        }
      }, 4000)
      m.once('remove', () => clearTimeout(watchdog))
    })

    return () => {
      cancelled = true
      readyRef.current = false
      popupRef.current?.remove()
      hoverTipRef.current?.remove()
      markersRef.current.forEach((mk) => mk.remove())
      markersRef.current = []
      if (mapRef.current) {
        try { mapRef.current.remove() } catch (e) {}
        mapRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function whenReady(fn) {
    const m = mapRef.current
    if (!m) return
    if (readyRef.current) fn(m)
    else m.once('atlas:ready', () => fn(m))
  }

  function openPinPopup(m, coords, id) {
    const p = pinByIdRef.current.get(id)
    if (!p) return
    const added = stopIdSetRef.current.has(id)
    const color = pinColor(p.vertical)
    const desc = p.description && p.description !== 'null' ? p.description : ''
    popupRef.current
      .setLngLat(coords)
      .setHTML(
        `<div style="font-family:system-ui,-apple-system,sans-serif;padding:2px 0;max-width:250px;">
          <div style="font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${color};margin-bottom:6px;">${esc(getVerticalBadge(p.vertical))}</div>
          <div style="font-family:Georgia,serif;font-size:16px;color:#1a1614;margin-bottom:3px;line-height:1.3;">${esc(p.name)}</div>
          ${p.region ? `<div style="font-size:11px;color:#9a8878;margin-bottom:${desc ? 6 : 10}px;">${esc([p.region, p.state].filter(Boolean).join(', '))}</div>` : ''}
          ${desc ? `<div style="font-size:11.5px;color:#5a4e45;line-height:1.45;margin-bottom:10px;">${esc(desc)}</div>` : ''}
          <button data-id="${esc(id)}" data-action="${added ? 'remove' : 'add'}" style="width:100%;padding:8px 0;background:${added ? 'transparent' : '#5F8A7E'};border:1px solid #5F8A7E;color:${added ? '#5F8A7E' : '#fff'};border-radius:999px;font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;cursor:pointer;">${added ? 'Remove from trip' : '+ Add to trip'}</button>
          ${p.slug ? `<a href="/place/${esc(p.slug)}" target="_blank" rel="noreferrer" style="display:block;margin-top:6px;text-align:center;font-size:10px;color:#9a8878;text-decoration:underline;">View listing</a>` : ''}
        </div>`
      )
      .addTo(m)

    const el = popupRef.current.getElement()
    if (el && !el.__ieBound) {
      el.__ieBound = true
      el.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button[data-id]')
        if (!btn) return
        const targetId = btn.getAttribute('data-id')
        const action = btn.getAttribute('data-action')
        const listing = pinByIdRef.current.get(targetId)
        if (action === 'add' && listing) cbRef.current.onAddStop?.(listing)
        else if (action === 'remove') cbRef.current.onRemoveStop?.(targetId)
        popupRef.current?.remove()
      })
    }
  }

  // ── Discovery pins ──
  useEffect(() => {
    whenReady((m) => {
      const addedSet = new Set(stops.map((s) => String(s.id)))
      const features = pins
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [parseFloat(p.lng), parseFloat(p.lat)] },
          properties: {
            id: String(p.id),
            name: p.name,
            badge: getVerticalBadge(p.vertical),
            region: p.region || '',
            color: pinColor(p.vertical),
            added: addedSet.has(String(p.id)),
          },
        }))
      m.getSource('discovery')?.setData({ type: 'FeatureCollection', features })
    })
  }, [pins, stops])

  // ── Route lines per day ──
  useEffect(() => {
    whenReady((m) => {
      for (let d = 0; d < MAX_DAYS; d++) {
        const geom = routesByDay[d]?.geometry
        m.getSource(`route-day-${d}`)?.setData(
          geom ? { type: 'Feature', geometry: geom } : { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } }
        )
        if (m.getLayer(`route-day-${d}`)) {
          const emphasized = activeDay == null || d === activeDay
          m.setPaintProperty(`route-day-${d}`, 'line-width', emphasized ? 3.5 : 2.5)
          m.setPaintProperty(`route-day-${d}`, 'line-opacity', emphasized ? 0.85 : 0.55)
        }
      }
    })
  }, [routesByDay, activeDay])

  // ── Highlight ring (card hover) ──
  useEffect(() => {
    whenReady((m) => {
      if (m.getLayer('discovery-highlight')) {
        m.setFilter('discovery-highlight', ['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], highlightId ? String(highlightId) : '__none__']])
      }
    })
  }, [highlightId])

  // ── Candidate rings (the current trio of choices) ──
  const candidateSig = candidateIds.join(',')
  useEffect(() => {
    whenReady((m) => {
      if (m.getLayer('discovery-candidates')) {
        m.setFilter('discovery-candidates', ['all', ['!', ['has', 'point_count']], ['in', ['get', 'id'], ['literal', candidateIds.map(String)]]])
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateSig])

  // ── Numbered stop markers ──
  useEffect(() => {
    let cancelled = false
    import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (cancelled) return
      whenReady((m) => {
        markersRef.current.forEach((mk) => mk.remove())
        markersRef.current = []

        stops.forEach((stop) => {
          if (stop.lat == null || stop.lng == null) return
          const color = dayColor(stop.day || 0)
          const el = document.createElement('div')
          el.style.cssText = `width:28px;height:28px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;font-family:system-ui,sans-serif;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.28);cursor:pointer;`
          el.textContent = stop.is_overnight ? '★' : String(stop.dayIndex ?? '')
          el.title = stop.name
          const marker = new mapboxgl.Marker({ element: el }).setLngLat([parseFloat(stop.lng), parseFloat(stop.lat)]).addTo(m)
          el.addEventListener('click', (ev) => {
            ev.stopPropagation()
            openStopPopup(m, stop)
          })
          markersRef.current.push(marker)
        })

        // Re-fit only when a stop was just added.
        if (stops.length > prevStopsLenRef.current && stops.length > 0) {
          const withCoords = stops.filter((s) => s.lat != null && s.lng != null)
          if (withCoords.length === 1) {
            m.flyTo({ center: [parseFloat(withCoords[0].lng), parseFloat(withCoords[0].lat)], zoom: Math.max(m.getZoom(), 10.5), duration: 700 })
          } else if (withCoords.length > 1) {
            const lngs = withCoords.map((s) => parseFloat(s.lng))
            const lats = withCoords.map((s) => parseFloat(s.lat))
            m.fitBounds(
              [
                [Math.min(...lngs), Math.min(...lats)],
                [Math.max(...lngs), Math.max(...lats)],
              ],
              { padding: { top: 80, bottom: 70, left: 70, right: 70 }, duration: 700, maxZoom: 13 }
            )
          }
        }
        prevStopsLenRef.current = stops.length
      })
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops])

  function openStopPopup(m, stop) {
    const id = String(stop.id)
    if (pinByIdRef.current.has(id)) {
      openPinPopup(m, [parseFloat(stop.lng), parseFloat(stop.lat)], id)
      return
    }
    const color = dayColor(stop.day || 0)
    popupRef.current
      .setLngLat([parseFloat(stop.lng), parseFloat(stop.lat)])
      .setHTML(
        `<div style="font-family:system-ui,-apple-system,sans-serif;padding:2px 0;max-width:250px;">
          <div style="font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${color};margin-bottom:6px;">Day ${(stop.day || 0) + 1}${stop.vertical ? ' · ' + esc(getVerticalBadge(stop.vertical)) : ''}</div>
          <div style="font-family:Georgia,serif;font-size:16px;color:#1a1614;margin-bottom:8px;line-height:1.3;">${esc(stop.name)}</div>
          <button data-stop-remove="${esc(id)}" style="width:100%;padding:8px 0;background:transparent;border:1px solid #5F8A7E;color:#5F8A7E;border-radius:999px;font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;cursor:pointer;">Remove from trip</button>
        </div>`
      )
      .addTo(m)
    const el = popupRef.current.getElement()
    if (el && !el.__ieStopBound) {
      el.__ieStopBound = true
      el.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button[data-stop-remove]')
        if (!btn) return
        cbRef.current.onRemoveStop?.(btn.getAttribute('data-stop-remove'))
        popupRef.current?.remove()
      })
    }
  }

  // ── Initial framing to the destination ──
  useEffect(() => {
    if (!initialCenter || framedRef.current) return
    whenReady((m) => {
      if (framedRef.current) return
      framedRef.current = true
      m.flyTo({ center: [initialCenter.lng, initialCenter.lat], zoom: (initialCenter.zoom || 9) - 0.4, duration: 900, essential: true })
    })
  }, [initialCenter])

  // ── Mobile pane switch needs a resize ──
  useEffect(() => {
    if (active && mapRef.current) setTimeout(() => mapRef.current?.resize(), 80)
  }, [active])

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
}
