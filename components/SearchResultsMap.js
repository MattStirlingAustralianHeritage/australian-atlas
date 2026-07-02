'use client'
import 'mapbox-gl/dist/mapbox-gl.css'

import { useEffect, useRef } from 'react'
import { ATLAS_PAPER_STYLE } from '@/lib/map/atlasPaperStyle'
import { VERTICAL_ACCENTS } from '@/lib/verticalUrl'

// ============================================================
// SearchResultsMap — the /search map split-view.
//
// Every ranked result in the current pool (not just the visible page)
// is plotted on the Atlas Paper basemap as a vertical-coloured dot.
// Hover is synced both ways with the result cards: hovering a card
// swells its pin; hovering a pin notifies the page (which highlights
// the card). Clicking a pin opens a small popup linking to the place.
// ============================================================

const AUSTRALIA_BOUNDS = [[112.5, -44.5], [154.5, -9.5]]

function pinColor(vertical) {
  return VERTICAL_ACCENTS[vertical] || '#C4603A'
}

export default function SearchResultsMap({ pins = [], origin = null, activeId = null, onPinHover }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef(new Map())   // id → { marker, inner }
  const originMarkerRef = useRef(null)
  const popupRef = useRef(null)
  const mapboxRef = useRef(null)
  const onPinHoverRef = useRef(onPinHover)
  onPinHoverRef.current = onPinHover
  // Pins/origin present at map-init time (init effect runs once; these refs
  // let it draw the state that existed before the style finished loading).
  const stateRef = useRef({ pins, origin })
  stateRef.current = { pins, origin }

  // ── Init once ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (cancelled || !containerRef.current || mapRef.current) return
      mapboxRef.current = mapboxgl
      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: ATLAS_PAPER_STYLE,
        bounds: AUSTRALIA_BOUNDS,
        fitBoundsOptions: { padding: 40 },
        attributionControl: false,
        cooperativeGestures: /Mobi|Android/i.test(navigator.userAgent),
      })
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
      mapRef.current = map
      map.on('load', () => {
        if (cancelled) return
        syncMarkers(stateRef.current.pins)
        syncOrigin(stateRef.current.origin)
        fitToPins(stateRef.current.pins, false)
      })
    }).catch((err) => console.error('[SearchResultsMap] mapbox load failed:', err))

    return () => {
      cancelled = true
      if (popupRef.current) { popupRef.current.remove(); popupRef.current = null }
      markersRef.current.forEach(({ marker }) => marker.remove())
      markersRef.current.clear()
      if (originMarkerRef.current) { originMarkerRef.current.remove(); originMarkerRef.current = null }
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function makePinElement(pin) {
    // Outer element belongs to Mapbox (it sets transform for positioning) —
    // all styling/transitions live on the INNER node so they never fight.
    const el = document.createElement('div')
    el.style.cursor = 'pointer'
    const inner = document.createElement('div')
    const size = pin.strong ? 15 : 11
    Object.assign(inner.style, {
      width: `${size}px`, height: `${size}px`, borderRadius: '50%',
      background: pinColor(pin.vertical),
      border: '2px solid #fff',
      boxShadow: '0 1px 4px rgba(40,30,15,0.4)',
      transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      transformOrigin: 'center center',
    })
    el.appendChild(inner)

    el.addEventListener('mouseenter', () => {
      if (onPinHoverRef.current) onPinHoverRef.current(pin.id)
      setActive(inner, true)
    })
    el.addEventListener('mouseleave', () => {
      if (onPinHoverRef.current) onPinHoverRef.current(null)
      setActive(inner, false)
    })
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      showPopup(pin)
    })
    return { el, inner }
  }

  function setActive(inner, active) {
    inner.style.transform = active ? 'scale(1.7)' : 'scale(1)'
    inner.style.boxShadow = active
      ? '0 2px 10px rgba(40,30,15,0.5)'
      : '0 1px 4px rgba(40,30,15,0.4)'
  }

  function showPopup(pin) {
    const map = mapRef.current
    const mapboxgl = mapboxRef.current
    if (!map || !mapboxgl) return
    if (popupRef.current) popupRef.current.remove()
    const meta = [pin.sub_type ? String(pin.sub_type).replace(/_/g, ' ') : null, pin.suburb, pin.state]
      .filter(Boolean).join(' · ')
    const div = document.createElement('div')
    div.style.cssText = 'font-family: var(--font-body, "DM Sans", sans-serif); padding: 2px 4px; max-width: 220px;'
    div.innerHTML = `
      <p style="font-family: var(--font-display, Georgia); font-size: 15px; line-height: 1.25; margin: 0; color: #1C1A17;"></p>
      <p style="font-size: 10.5px; letter-spacing: 0.05em; text-transform: uppercase; color: #6B6760; margin: 4px 0 0;"></p>
      <a style="display: inline-block; font-size: 12px; font-weight: 600; color: #C4603A; margin-top: 7px; text-decoration: none;">View place →</a>
    `
    div.children[0].textContent = pin.name
    div.children[1].textContent = meta
    div.children[2].href = `/place/${pin.slug}`
    popupRef.current = new mapboxgl.Popup({ offset: 14, closeButton: true, maxWidth: '260px' })
      .setLngLat([pin.lng, pin.lat])
      .setDOMContent(div)
      .addTo(map)
  }

  function syncMarkers(nextPins) {
    const map = mapRef.current
    const mapboxgl = mapboxRef.current
    if (!map || !mapboxgl) return
    const nextIds = new Set(nextPins.map((p) => p.id))
    // Remove stale
    for (const [id, { marker }] of markersRef.current) {
      if (!nextIds.has(id)) { marker.remove(); markersRef.current.delete(id) }
    }
    // Add new
    for (const pin of nextPins) {
      if (markersRef.current.has(pin.id)) continue
      if (typeof pin.lat !== 'number' || typeof pin.lng !== 'number') continue
      const { el, inner } = makePinElement(pin)
      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map)
      markersRef.current.set(pin.id, { marker, inner })
    }
  }

  function syncOrigin(nextOrigin) {
    const map = mapRef.current
    const mapboxgl = mapboxRef.current
    if (!map || !mapboxgl) return
    if (originMarkerRef.current) { originMarkerRef.current.remove(); originMarkerRef.current = null }
    if (!nextOrigin || typeof nextOrigin.lat !== 'number' || typeof nextOrigin.lng !== 'number') return
    const el = document.createElement('div')
    el.innerHTML = `<svg width="26" height="36" viewBox="0 0 28 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.268 21.732 0 14 0z" fill="#1C1A17"/>
      <circle cx="14" cy="14" r="5" fill="#C4973B"/>
    </svg>`
    el.title = nextOrigin.label || 'Search origin'
    originMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([nextOrigin.lng, nextOrigin.lat])
      .addTo(map)
  }

  // Camera-only outlier rejection: a single mis-geocoded listing (a "VIC" venue
  // with Brisbane coordinates) would otherwise stretch fitBounds across half
  // the country. Keep pins within 5× the 90th-percentile distance from the
  // median centre — legitimate spread (Melbourne→Mildura) survives, a lone
  // cross-country stray doesn't steer the camera. Every pin still renders.
  function cameraPins(coords) {
    if (coords.length <= 2) return coords
    const mid = (arr) => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)]
    const cLat = mid(coords.map((p) => p.lat))
    const cLng = mid(coords.map((p) => p.lng))
    const cosLat = Math.cos((cLat * Math.PI) / 180)
    const dist = coords.map((p) => Math.hypot(p.lat - cLat, (p.lng - cLng) * cosLat))
    const p90 = dist.slice().sort((a, b) => a - b)[Math.floor(dist.length * 0.9)]
    const cutoff = Math.max(p90 * 5, 1)   // never tighter than ~110 km
    const kept = coords.filter((_, i) => dist[i] <= cutoff)
    return kept.length >= 2 ? kept : coords
  }

  function fitToPins(nextPins, animate = true) {
    const map = mapRef.current
    const mapboxgl = mapboxRef.current
    if (!map || !mapboxgl) return
    const coords = cameraPins(nextPins.filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number'))
    if (!coords.length) return
    if (coords.length === 1) {
      map.easeTo({ center: [coords[0].lng, coords[0].lat], zoom: 11, duration: animate ? 600 : 0 })
      return
    }
    const bounds = coords.reduce(
      (b, p) => b.extend([p.lng, p.lat]),
      new mapboxgl.LngLatBounds([coords[0].lng, coords[0].lat], [coords[0].lng, coords[0].lat])
    )
    map.fitBounds(bounds, { padding: 56, maxZoom: 12, duration: animate ? 700 : 0 })
  }

  // ── React to pin/origin changes ───────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapboxRef.current) return
    syncMarkers(pins)
    syncOrigin(origin)
    fitToPins(pins)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, origin])

  // ── Card-hover → pin highlight ────────────────────────────────────────
  useEffect(() => {
    for (const [id, { inner }] of markersRef.current) {
      setActive(inner, id === activeId)
    }
  }, [activeId])

  // The split view mounts the map inside a container that can change size
  // (view toggles, responsive breaks) — keep the canvas in sync.
  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => { if (mapRef.current) mapRef.current.resize() })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
