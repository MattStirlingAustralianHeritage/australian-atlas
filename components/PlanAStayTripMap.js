'use client'
import 'mapbox-gl/dist/mapbox-gl.css'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'

/* ═══════════════════════════════════════════════════════════════════════
   PlanAStayTripMap — interactive overview of the whole trip
   ═══════════════════════════════════════════════════════════════════════
   One Mapbox GL map above the day-by-day itinerary: every stop as a
   numbered pin coloured by day, a dashed as-the-crow-flies line joining
   each day's stops in order (deliberately NOT a routed line — we don't
   assert roads we haven't computed), and a moon pin for a chosen stay.

   Rebuilds its markers whenever the days change, so swap / remove /
   reorder / add edits are reflected immediately. Clicking a pin scrolls
   the itinerary to that stop's card (#pas-stop-<listing_id>).

   Renders nothing without a token or with fewer than 2 mapped stops —
   the static per-day maps continue to carry those cases (and print).   */

const MAP_STYLE = 'mapbox://styles/mattstirlingaustralianheritage/cmn32b0iz003401swccb7d21k'

const DAY_COLORS = ['#C4973B', '#8a5a6b', '#5F8A7E', '#A0562B', '#54718a', '#7d6b9e', '#997f4a']
const REST_ACCENT = '#8a5a6b'

function dayColor(dayNumber) {
  return DAY_COLORS[(dayNumber - 1) % DAY_COLORS.length]
}

function collectPoints(days, accommodationByDay) {
  const stops = []
  const stays = []
  for (const day of days || []) {
    ;(day.stops || []).forEach((s, i) => {
      if (s.lat == null || s.lng == null) return
      stops.push({
        lng: s.lng, lat: s.lat, name: s.name,
        listing_id: s.listing_id,
        day: day.day_number, indexInDay: i,
        firstOfDay: i === 0,
      })
    })
    const stay = accommodationByDay?.[day.day_number]
    if (stay && stay.lat != null && stay.lng != null) {
      stays.push({ lng: stay.lng, lat: stay.lat, name: stay.name, day: day.day_number })
    }
  }
  return { stops, stays }
}

function lineFeatures(days) {
  const features = []
  for (const day of days || []) {
    const coords = (day.stops || [])
      .filter(s => s.lat != null && s.lng != null)
      .map(s => [s.lng, s.lat])
    if (coords.length < 2) continue
    features.push({
      type: 'Feature',
      properties: { color: dayColor(day.day_number) },
      geometry: { type: 'LineString', coordinates: coords },
    })
  }
  return { type: 'FeatureCollection', features }
}

export default function PlanAStayTripMap({ days, accommodationByDay }) {
  const t = useTranslations('plan')
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const mapboxRef = useRef(null)
  const loadedRef = useRef(false)
  const markersRef = useRef([])
  const dataRef = useRef({ days, accommodationByDay })
  dataRef.current = { days, accommodationByDay }

  const { stops } = collectPoints(days, accommodationByDay)
  const signature = JSON.stringify([
    (days || []).map(d => [d.day_number, (d.stops || []).map(s => s.listing_id)]),
    Object.entries(accommodationByDay || {}).map(([k, v]) => [k, v?.listing_id]),
  ])

  /* Rebuild markers + lines from current data. Idempotent. */
  function refresh() {
    const map = mapRef.current
    const mapboxgl = mapboxRef.current
    if (!map || !mapboxgl || !loadedRef.current) return
    const { days: d, accommodationByDay: a } = dataRef.current
    const { stops: pts, stays } = collectPoints(d, a)

    for (const m of markersRef.current) m.remove()
    markersRef.current = []

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
    const size = isMobile ? 30 : 26
    const font = isMobile ? 13 : 12

    const reducedMotion = typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    for (const p of pts) {
      const color = dayColor(p.day)
      const wrapper = document.createElement('div')
      wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer;'
      wrapper.setAttribute('role', 'button')
      wrapper.setAttribute('tabindex', '0')
      wrapper.setAttribute('aria-label', `${p.name || ''} — Day ${p.day}, stop ${p.indexInDay + 1}`)

      const el = document.createElement('div')
      el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid #fff;color:#fff;font-weight:700;font-size:${font}px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.25);font-family:system-ui,-apple-system,sans-serif;transition:transform 0.2s ease;`
      el.innerText = p.indexInDay + 1
      el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.18)' })
      el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)' })
      wrapper.appendChild(el)

      if (p.firstOfDay && d.length > 1) {
        const label = document.createElement('div')
        label.style.cssText = `margin-top:3px;font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${color};font-family:system-ui,-apple-system,sans-serif;white-space:nowrap;text-shadow:0 1px 3px rgba(255,255,255,0.9);`
        label.textContent = `Day ${p.day}`
        wrapper.appendChild(label)
      }

      const popup = new mapboxgl.Popup({ offset: 18, closeButton: false })
        .setHTML(`<div style="font-family:system-ui,sans-serif;padding:5px 4px;"><p style="font-weight:600;margin:0;font-size:13px;">${(p.name || '').replace(/</g, '&lt;')}</p></div>`)

      const jumpToCard = () => {
        const card = document.getElementById(`pas-stop-${p.listing_id}`)
        if (card) card.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' })
      }
      wrapper.addEventListener('click', jumpToCard)
      wrapper.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jumpToCard() }
      })

      const marker = new mapboxgl.Marker({ element: wrapper, anchor: 'bottom' })
        .setLngLat([p.lng, p.lat])
        .setPopup(popup)
        .addTo(map)
      markersRef.current.push(marker)
    }

    for (const s of stays) {
      const el = document.createElement('div')
      el.style.cssText = `width:${size - 4}px;height:${size - 4}px;border-radius:50%;background:${REST_ACCENT};border:2.5px solid #fff;color:#fff;font-size:${font}px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.25);font-family:system-ui,-apple-system,sans-serif;`
      el.innerText = '☾'
      const popup = new mapboxRef.current.Popup({ offset: 16, closeButton: false })
        .setHTML(`<div style="font-family:system-ui,sans-serif;padding:5px 4px;"><p style="font-weight:600;margin:0;font-size:13px;">${(s.name || '').replace(/</g, '&lt;')}</p></div>`)
      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([s.lng, s.lat])
        .setPopup(popup)
        .addTo(map)
      markersRef.current.push(marker)
    }

    try {
      map.getSource('pas-day-lines')?.setData(lineFeatures(d))
    } catch { /* source not ready yet */ }

    const all = [...pts, ...stays]
    if (all.length >= 2) {
      const bounds = all.reduce(
        (b, p) => b.extend([p.lng, p.lat]),
        new mapboxgl.LngLatBounds([all[0].lng, all[0].lat], [all[0].lng, all[0].lat])
      )
      map.fitBounds(bounds, { padding: { top: 64, bottom: 48, left: 48, right: 48 }, duration: 500, maxZoom: 13 })
    }
  }

  /* Init once */
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token || stops.length < 2) return

    let cancelled = false
    import('mapbox-gl').then((mod) => {
      if (cancelled || mapRef.current) return
      const mapboxgl = mod.default || mod
      mapboxgl.accessToken = token
      mapboxRef.current = mapboxgl

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        center: [stops[0].lng, stops[0].lat],
        zoom: 8,
        scrollZoom: false,
        attributionControl: true,
      })
      mapRef.current = map
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')

      map.on('load', () => {
        loadedRef.current = true
        map.addSource('pas-day-lines', { type: 'geojson', data: lineFeatures(dataRef.current.days) })
        map.addLayer({
          id: 'pas-day-lines-layer', type: 'line', source: 'pas-day-lines',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 2,
            'line-opacity': 0.65,
            'line-dasharray': [2, 2],
          },
        })
        refresh()
      })
    })

    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; loadedRef.current = false }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* Rebuild on any day/stay change */
  useEffect(() => {
    refresh()
  }, [signature]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN || stops.length < 2) return null

  return (
    <div className="pas-no-print" style={{ marginBottom: 40 }}>
      <div
        role="region"
        aria-label={t('tripMapCaption')}
        style={{
          borderRadius: 10,
          overflow: 'hidden',
          border: '1px solid var(--color-border, rgba(28,26,23,0.12))',
        }}
      >
        <div ref={containerRef} style={{ height: 'min(420px, 55vh)', width: '100%', background: '#E8E2D6' }} />
      </div>
      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: 11.5,
        color: 'var(--color-muted, #6B6760)',
        textAlign: 'center',
        margin: '8px 0 0',
      }}>
        {t('tripMapCaption')}
      </p>
    </div>
  )
}
