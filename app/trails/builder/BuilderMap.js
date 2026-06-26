'use client'

import 'mapbox-gl/dist/mapbox-gl.css'
import { useRef, useEffect, useState } from 'react'
import { getVerticalBadge, getVerticalBrandColour, VERTICAL_ACCENTS } from '@/lib/verticalUrl'

const VERTICAL_COLORS = VERTICAL_ACCENTS

// Same framing constants as the /map page — the builder opens on the whole
// country and lets users dive into wherever they're planning.
const AUSTRALIA_BOUNDS = [[112.7, -43.9], [153.9, -10.4]]
const MIN_ZOOM = 2

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const SUB_TYPE_FALLBACK = {}

function pinColor(vertical) {
  return getVerticalBrandColour(vertical) || VERTICAL_COLORS[vertical] || '#5F8A7E'
}

/**
 * BuilderMap — the right-hand map of the trail builder.
 *
 * Layers, bottom to top:
 *   discovery clusters + pins   — every active, trail-suitable listing on
 *                                 the network (the "what's out there" layer)
 *   route line                  — the current trail's driving/walking path
 *   numbered stop markers       — DOM markers, one per stop
 *
 * The discovery layer is the core of the revamp: pins are clickable
 * everywhere (not just after a search), with a hover tooltip and an
 * add/remove popup. The map initialises ONCE — data flows in via setData
 * so camera position is never reset underneath the user.
 */
export default function BuilderMap({
  listings,
  stops,
  routeGeometry,
  stopIds,
  highlightId,
  initialFitBounds,
  onAddStop,
  onRemoveStop,
  onViewportChange,
  active = true,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const readyRef = useRef(false)
  const popupRef = useRef(null)
  const hoverTipRef = useRef(null)
  const markersRef = useRef([])
  const listingByIdRef = useRef(new Map())
  const stopIdsRef = useRef(stopIds)
  const prevStopsLenRef = useRef(0)
  const callbacksRef = useRef({ onAddStop, onRemoveStop, onViewportChange })

  // Legend: always open on desktop, collapsed to a small pill on phones so it
  // doesn't blanket the bottom-left of a 375px map (and clear the Mapbox logo).
  const [legendOpen, setLegendOpen] = useState(true)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) setLegendOpen(false)
  }, [])

  useEffect(() => { stopIdsRef.current = stopIds }, [stopIds])
  useEffect(() => { callbacksRef.current = { onAddStop, onRemoveStop, onViewportChange } }, [onAddStop, onRemoveStop, onViewportChange])

  // Keep a lookup of listing data for popup actions
  useEffect(() => {
    const m = new Map()
    for (const l of listings) m.set(String(l.id), l)
    listingByIdRef.current = m
  }, [listings])

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
        minZoom: MIN_ZOOM,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        attributionControl: false,
      })
      mapRef.current = m

      m.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')
      m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')

      popupRef.current = new mapboxgl.Popup({ closeButton: true, closeOnClick: false, maxWidth: '280px', offset: 12 })
      hoverTipRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, maxWidth: '240px', offset: 10, className: 'builder-hover-tip' })
      const hoverEnabled = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches

      m.on('load', () => {
        if (cancelled) return

        // Discovery source — clustered network pins
        m.addSource('discovery', {
          type: 'geojson',
          cluster: true,
          clusterMaxZoom: 9,
          clusterMinPoints: 6,
          clusterRadius: 44,
          data: { type: 'FeatureCollection', features: [] },
        })

        m.addLayer({
          id: 'discovery-clusters', type: 'circle', source: 'discovery',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': 'rgba(95,138,126,0.75)',
            'circle-radius': ['step', ['get', 'point_count'], 14, 50, 19, 200, 26],
            'circle-stroke-width': 1.5, 'circle-stroke-color': '#ffffff',
          },
        })
        m.addLayer({
          id: 'discovery-cluster-count', type: 'symbol', source: 'discovery',
          filter: ['has', 'point_count'],
          layout: { 'text-field': '{point_count_abbreviated}', 'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'], 'text-size': 11 },
          paint: { 'text-color': '#ffffff' },
        })
        m.addLayer({
          id: 'discovery-pins', type: 'circle', source: 'discovery',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 3.5, 6, 5, 10, 6.5, 14, 8.5],
            'circle-color': ['get', 'color'],
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#ffffff',
            // Pins already on the trail recede — the numbered marker takes over.
            'circle-opacity': ['case', ['get', 'added'], 0.35, 0.92],
          },
        })

        // Ring highlighting the suggestion card under the cursor in the rail
        m.addLayer({
          id: 'discovery-highlight', type: 'circle', source: 'discovery',
          filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], '__none__']],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 9, 10, 13],
            'circle-color': 'transparent',
            'circle-stroke-width': 2.5,
            'circle-stroke-color': ['get', 'color'],
            'circle-stroke-opacity': 0.85,
          },
        })

        // Route line under the stop markers
        m.addSource('trail-route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } } })
        m.addLayer({
          id: 'trail-route-line', type: 'line', source: 'trail-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#5F8A7E', 'line-width': 2.5, 'line-opacity': 0.75, 'line-dasharray': [2, 1.5] },
        })

        // ── Interactions ──
        m.on('mouseenter', 'discovery-pins', (e) => {
          m.getCanvas().style.cursor = 'pointer'
          if (!hoverEnabled || !e.features?.length) return
          const p = e.features[0].properties
          hoverTipRef.current.setLngLat(e.features[0].geometry.coordinates.slice()).setHTML(
            `<div style="font-family:system-ui,-apple-system,sans-serif;padding:1px 2px;">
              <div style="font-family:Georgia,serif;font-size:13px;color:#1a1614;line-height:1.25;">${esc(p.name)}</div>
              <div style="font-size:10px;color:#9a8878;margin-top:2px;">${esc(p.badge)}${p.region && p.region !== 'null' ? ` · ${esc(p.region)}` : ''}${p.added === 'true' || p.added === true ? ' · On your trail' : ''}</div>
            </div>`
          ).addTo(m)
        })
        m.on('mouseleave', 'discovery-pins', () => {
          m.getCanvas().style.cursor = ''
          hoverTipRef.current?.remove()
        })

        m.on('click', 'discovery-pins', (e) => {
          if (!e.features?.length) return
          const p = e.features[0].properties
          const coords = e.features[0].geometry.coordinates.slice()
          hoverTipRef.current?.remove()
          openVenuePopup(m, coords, String(p.id))
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

        m.on('moveend', () => {
          const b = m.getBounds()
          callbacksRef.current.onViewportChange?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()])
        })
        // Seed the first viewport for empty-state recommendations
        const b = m.getBounds()
        callbacksRef.current.onViewportChange?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()])

        readyRef.current = true
        // Trigger the data effects below in case props arrived before load
        m.fire('atlas:ready')
      })
    })

    return () => {
      cancelled = true
      readyRef.current = false
      if (popupRef.current) popupRef.current.remove()
      if (hoverTipRef.current) hoverTipRef.current.remove()
      markersRef.current.forEach(mk => mk.remove())
      markersRef.current = []
      if (mapRef.current) { try { mapRef.current.remove() } catch (e) {} mapRef.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Venue popup with add/remove action. Content is data-driven from the
  // listing lookup; the click handler is delegated — no window globals.
  function openVenuePopup(m, coords, id) {
    const l = listingByIdRef.current.get(id)
    if (!l) return
    const added = stopIdsRef.current.has(id)
    const color = pinColor(l.vertical)
    const desc = l.description && l.description !== 'null'
      ? (l.description.length > 110 ? l.description.slice(0, 110).trimEnd() + '…' : l.description)
      : ''
    popupRef.current
      .setLngLat(coords)
      .setHTML(
        `<div style="font-family:system-ui,-apple-system,sans-serif;padding:2px 0;max-width:250px;">
          <div style="font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${color};margin-bottom:6px;">${esc(getVerticalBadge(l.vertical))}</div>
          <div style="font-family:Georgia,serif;font-size:16px;color:#1a1614;margin-bottom:3px;line-height:1.3;">${esc(l.name)}</div>
          ${l.region ? `<div style="font-size:11px;color:#9a8878;margin-bottom:${desc ? 6 : 10}px;">${esc([l.region, l.state].filter(Boolean).join(', '))}</div>` : ''}
          ${desc ? `<div style="font-size:11.5px;color:#5a4e45;line-height:1.45;margin-bottom:10px;">${esc(desc)}</div>` : ''}
          <button data-id="${esc(String(l.id))}" data-action="${added ? 'remove' : 'add'}" style="width:100%;padding:7px 0;background:${added ? 'transparent' : '#5F8A7E'};border:1px solid #5F8A7E;color:${added ? '#5F8A7E' : '#fff'};border-radius:3px;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;cursor:pointer;">${added ? 'Remove from trail' : '+ Add to trail'}</button>
          ${l.slug ? `<a href="/place/${esc(l.slug)}" target="_blank" rel="noreferrer" style="display:block;margin-top:6px;text-align:center;font-size:10px;color:#9a8878;text-decoration:underline;">View listing</a>` : ''}
        </div>`
      )
      .addTo(m)

    const el = popupRef.current.getElement()
    if (el && !el.__atlasBound) {
      el.__atlasBound = true
      el.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button[data-id]')
        if (!btn) return
        const targetId = btn.getAttribute('data-id')
        const action = btn.getAttribute('data-action')
        const listing = listingByIdRef.current.get(targetId)
        if (action === 'add' && listing) {
          callbacksRef.current.onAddStop?.({
            id: listing.id, name: listing.name, vertical: listing.vertical,
            sub_type: listing.sub_type, region: listing.region, state: listing.state,
            latitude: listing.lat, longitude: listing.lng, slug: listing.slug,
          })
        } else if (action === 'remove') {
          callbacksRef.current.onRemoveStop?.(targetId)
        }
        popupRef.current?.remove()
      })
    }
  }

  // Run a callback now if the style is ready, else after load.
  function whenReady(fn) {
    const m = mapRef.current
    if (!m) return
    if (readyRef.current) fn(m)
    else m.once('atlas:ready', () => fn(m))
  }

  // ── Discovery data ──
  useEffect(() => {
    whenReady((m) => {
      const features = listings
        .filter(l => l.lat != null && l.lng != null)
        .map(l => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [parseFloat(l.lng), parseFloat(l.lat)] },
          properties: {
            id: String(l.id),
            name: l.name,
            badge: getVerticalBadge(l.vertical),
            region: l.region || '',
            color: pinColor(l.vertical),
            added: stopIds.has(String(l.id)),
          },
        }))
      m.getSource('discovery')?.setData({ type: 'FeatureCollection', features })
    })
  }, [listings, stopIds])

  // ── Route geometry ──
  useEffect(() => {
    whenReady((m) => {
      m.getSource('trail-route')?.setData(
        routeGeometry
          ? { type: 'Feature', geometry: routeGeometry }
          : { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } }
      )
    })
  }, [routeGeometry])

  // ── Suggestion highlight ring ──
  useEffect(() => {
    whenReady((m) => {
      if (m.getLayer('discovery-highlight')) {
        m.setFilter('discovery-highlight', ['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], highlightId ? String(highlightId) : '__none__']])
      }
    })
  }, [highlightId])

  // ── Stop markers ──
  useEffect(() => {
    let cancelled = false
    import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (cancelled) return
      whenReady((m) => {
        markersRef.current.forEach(mk => mk.remove())
        markersRef.current = []

        stops.forEach((stop, i) => {
          if (!stop.latitude || !stop.longitude) return
          const color = pinColor(stop.vertical)
          const el = document.createElement('div')
          el.style.cssText = `width:28px;height:28px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;font-family:system-ui,sans-serif;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.25);cursor:pointer;`
          el.textContent = String(i + 1)
          el.title = stop.name

          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([parseFloat(stop.longitude), parseFloat(stop.latitude)])
            .addTo(m)

          el.addEventListener('click', (ev) => {
            ev.stopPropagation()
            openVenuePopupForStop(m, stop)
          })
          markersRef.current.push(marker)
        })

        // Re-fit only when a stop was just added — never on remove/reorder.
        if (stops.length > prevStopsLenRef.current && stops.length > 0) {
          const withCoords = stops.filter(s => s.latitude && s.longitude)
          if (withCoords.length === 1) {
            m.flyTo({ center: [parseFloat(withCoords[0].longitude), parseFloat(withCoords[0].latitude)], zoom: Math.max(m.getZoom(), 10.5), duration: 700 })
          } else if (withCoords.length > 1) {
            const lngs = withCoords.map(s => parseFloat(s.longitude))
            const lats = withCoords.map(s => parseFloat(s.latitude))
            m.fitBounds(
              [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
              { padding: { top: 70, bottom: 60, left: 70, right: 70 }, duration: 700, maxZoom: 13 }
            )
          }
        }
        prevStopsLenRef.current = stops.length
      })
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops])

  function openVenuePopupForStop(m, stop) {
    // Stops may come from saved trails whose listing isn't in the discovery
    // payload (e.g. now-hidden). Fall back to a minimal card.
    const id = String(stop.id)
    if (listingByIdRef.current.has(id)) {
      openVenuePopup(m, [parseFloat(stop.longitude), parseFloat(stop.latitude)], id)
      return
    }
    const color = pinColor(stop.vertical)
    popupRef.current
      .setLngLat([parseFloat(stop.longitude), parseFloat(stop.latitude)])
      .setHTML(
        `<div style="font-family:system-ui,-apple-system,sans-serif;padding:2px 0;max-width:250px;">
          <div style="font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${color};margin-bottom:6px;">${esc(getVerticalBadge(stop.vertical))}</div>
          <div style="font-family:Georgia,serif;font-size:16px;color:#1a1614;margin-bottom:8px;line-height:1.3;">${esc(stop.name)}</div>
          <button data-stop-remove="${esc(id)}" style="width:100%;padding:7px 0;background:transparent;border:1px solid #5F8A7E;color:#5F8A7E;border-radius:3px;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;cursor:pointer;">Remove from trail</button>
        </div>`
      )
      .addTo(m)
    const el = popupRef.current.getElement()
    if (el && !el.__atlasStopBound) {
      el.__atlasStopBound = true
      el.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button[data-stop-remove]')
        if (!btn) return
        callbacksRef.current.onRemoveStop?.(btn.getAttribute('data-stop-remove'))
        popupRef.current?.remove()
      })
    }
  }

  // ── One-shot region framing (?region= deep link) ──
  useEffect(() => {
    if (!initialFitBounds) return
    whenReady((m) => {
      m.fitBounds(initialFitBounds, { padding: 60, duration: 800, maxZoom: 11 })
    })
  }, [initialFitBounds])

  // ── Mobile tab switching: canvas needs a resize after display change ──
  useEffect(() => {
    if (active && mapRef.current) {
      setTimeout(() => mapRef.current?.resize(), 60)
    }
  }, [active])

  return (
    <>
      <div ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />

      {/* Compact legend — collapses to a pill on phones */}
      {legendOpen ? (
        <div style={{
          position: 'absolute', bottom: 36, left: 12, background: 'rgba(250,247,242,0.97)',
          border: '1px solid var(--color-border)', borderRadius: 4, padding: '10px 12px', zIndex: 5,
          maxWidth: 190, boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 7 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>
              Tap a pin to add it
            </span>
            <button onClick={() => setLegendOpen(false)} aria-label="Hide legend" className="builder-legend-close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 15, lineHeight: 1, padding: 0, display: 'none' }}>×</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px' }}>
            {Object.entries(VERTICAL_COLORS).map(([key, color]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontSize: 9.5, color: 'var(--color-ink)', fontFamily: 'var(--font-body)' }}>{getVerticalBadge(key)}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="22" height="8" style={{ flexShrink: 0 }}>
              <line x1="0" y1="4" x2="22" y2="4" stroke="#5F8A7E" strokeWidth="2.5" strokeDasharray="4 3" />
            </svg>
            <span style={{ fontSize: 9.5, color: 'var(--color-ink)', fontFamily: 'var(--font-body)' }}>Your route</span>
          </div>
        </div>
      ) : (
        <button onClick={() => setLegendOpen(true)} style={{
          position: 'absolute', bottom: 36, left: 12, zIndex: 5,
          background: 'rgba(250,247,242,0.97)', border: '1px solid var(--color-border)',
          borderRadius: 999, padding: '7px 13px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6, minHeight: 36,
          boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--color-muted)', fontFamily: 'var(--font-body)',
        }}>
          <span style={{ display: 'inline-flex', gap: 2 }}>
            {['#C4973B', '#5f8a7e', '#C4603A'].map(c => (
              <span key={c} style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />
            ))}
          </span>
          Key
        </button>
      )}
      {/* Show the close affordance only on touch/small screens */}
      <style>{`@media (max-width: 768px) { .builder-legend-close { display: inline-flex !important; } }`}</style>
    </>
  )
}
