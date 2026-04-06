'use client'

import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { VERTICAL_STYLES } from '@/components/VerticalBadge'
import { getVerticalUrl } from '@/lib/verticalUrl'
import TrailQuestionFlow from '@/components/TrailQuestionFlow'
// TrailLoadingOverlay imported lazily to avoid blocking render
import dynamic from 'next/dynamic'
const TrailLoadingOverlay = dynamic(() => import('@/components/TrailLoadingOverlay'), { ssr: false })

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A', fine_grounds: '#8A7055',
  rest: '#5A8A9A', field: '#4A7C59', corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

const DAY_COLORS = [
  '#4A7C59', // Day 1 — sage green
  '#C49A3C', // Day 2 — gold
  '#5A8A9A', // Day 3 — teal
  '#C1603A', // Day 4 — terracotta
  '#7A6B8A', // Day 5 — purple
  '#8A7055', // Day 6+ — brown
]

function getDayColor(dayNumber) {
  if (dayNumber <= 0) return DAY_COLORS[0]
  if (dayNumber <= DAY_COLORS.length) return DAY_COLORS[dayNumber - 1]
  return DAY_COLORS[DAY_COLORS.length - 1]
}

// Chronological flow order for daily suggestions
const VERTICAL_FLOW_ORDER = ['fine_grounds', 'table', 'field', 'collection', 'craft', 'corner', 'found', 'sba', 'rest']

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Collections', craft: 'Craft', fine_grounds: 'Fine Grounds',
  rest: 'Rest', field: 'Field', corner: 'Corner', found: 'Found', table: 'Table',
}

// Loading messages that cycle during generation
const LOADING_MESSAGES = [
  'Finding venues across nine atlases...',
  'Checking accommodation options...',
  'Mapping the route...',
  'Writing your itinerary...',
  'Almost there...',
]

function extractDestination(query) {
  if (!query) return 'your'
  const q = query.toLowerCase()
  const regions = ['barossa', 'yarra valley', 'mornington', 'blue mountains', 'byron', 'adelaide hills',
    'hunter valley', 'margaret river', 'daylesford', 'macedon', 'gippsland', 'southern highlands',
    'melbourne', 'sydney', 'hobart', 'brisbane', 'adelaide', 'perth', 'tasmania', 'noosa',
    'sunshine coast', 'gold coast', 'bellarine', 'goldfields', 'bendigo', 'ballarat', 'fremantle',
    'great ocean road', 'grampians', 'beechworth', 'bright', 'healesville', 'launceston',
    'kangaroo island', 'mclaren vale', 'clare valley', 'orange', 'mudgee']
  for (const r of regions.sort((a, b) => b.length - a.length)) {
    if (q.includes(r)) return r.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
  }
  return 'your'
}

// Mapbox route line fetcher
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

function ItineraryMap({ days }) {
  const mapContainer = useRef(null)
  const mapRef = useRef(null)
  const [mapExpanded, setMapExpanded] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Detect mobile on mount and resize
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Collect all stops with coordinates AND day number
  const allStops = []
  let stopIndex = 0
  const dayStopGroups = [] // array of { dayNumber, coordinates }
  for (const day of days) {
    const dayNum = day.day_number || (days.indexOf(day) + 1)
    const dayCoords = []
    for (const stop of (day.stops || [])) {
      if (stop.lat && stop.lng) {
        allStops.push({ ...stop, globalIndex: ++stopIndex, isOvernight: false, dayNumber: dayNum })
        dayCoords.push([parseFloat(stop.lng), parseFloat(stop.lat)])
      }
    }
    if (day.overnight?.lat && day.overnight?.lng) {
      allStops.push({ ...day.overnight, globalIndex: ++stopIndex, isOvernight: true, dayNumber: dayNum })
      dayCoords.push([parseFloat(day.overnight.lng), parseFloat(day.overnight.lat)])
    }
    if (dayCoords.length >= 2) {
      dayStopGroups.push({ dayNumber: dayNum, coordinates: dayCoords })
    }
  }

  const coordinates = allStops.map(s => [parseFloat(s.lng), parseFloat(s.lat)])

  useEffect(() => {
    if (!coordinates || coordinates.length === 0) return
    if (mapRef.current) return
    if (isMobile && !mapExpanded) return
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) return

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
        fitBoundsOptions: { padding: 80 },
        scrollZoom: false,
      })

      mapRef.current = map
      map.addControl(new mapboxgl.NavigationControl(), 'top-right')

      map.on('load', async () => {
        // Per-day route lines
        for (const group of dayStopGroups) {
          const dayColor = getDayColor(group.dayNumber)
          let routeGeometry = null
          if (group.coordinates.length >= 2) {
            routeGeometry = await fetchRouteGeometry(group.coordinates, token)
          }

          const geojsonData = routeGeometry
            ? { type: 'Feature', geometry: routeGeometry }
            : { type: 'Feature', geometry: { type: 'LineString', coordinates: group.coordinates } }

          const sourceId = `route-day-${group.dayNumber}`
          map.addSource(sourceId, { type: 'geojson', data: geojsonData })

          map.addLayer({
            id: `${sourceId}-glow`,
            type: 'line',
            source: sourceId,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': dayColor, 'line-width': 8, 'line-opacity': 0.15 },
          })

          map.addLayer({
            id: `${sourceId}-line`,
            type: 'line',
            source: sourceId,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': dayColor, 'line-width': 2.5, 'line-dasharray': [2, 1.5] },
          })
        }

        // Numbered markers colored by day
        allStops.forEach((stop) => {
          const color = getDayColor(stop.dayNumber)
          const label = VERTICAL_LABELS[stop.vertical] || stop.vertical || ''

          const el = document.createElement('div')
          el.style.cssText = `width:30px;height:30px;border-radius:50%;background:${color};border:2px solid white;color:white;font-weight:bold;font-size:12px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;font-family:system-ui,sans-serif;`
          if (stop.isOvernight) {
            el.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
          } else {
            el.innerText = stop.globalIndex
          }

          const popup = new mapboxgl.Popup({ offset: 20, closeButton: false })
            .setHTML(`
              <div style="font-family:system-ui,sans-serif;padding:6px 4px;">
                <p style="font-weight:600;margin:0 0 2px;font-size:13px;">${stop.venue_name || ''}</p>
                <p style="margin:0;color:${color};font-size:10px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">Day ${stop.dayNumber}${label ? ` \u00B7 ${label}` : ''}</p>
                ${stop.note ? `<p style="margin:4px 0 0;font-size:11px;color:#666;line-height:1.3;">${stop.note}</p>` : ''}
              </div>
            `)

          new mapboxgl.Marker({ element: el })
            .setLngLat([parseFloat(stop.lng), parseFloat(stop.lat)])
            .setPopup(popup)
            .addTo(map)
        })
      })
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [mapExpanded]) // eslint-disable-line react-hooks/exhaustive-deps

  if (coordinates.length === 0) return null

  // Mobile collapsed state: show a button instead of the map
  if (isMobile && !mapExpanded) {
    return (
      <button
        onClick={() => setMapExpanded(true)}
        style={{
          width: '100%',
          padding: '14px 20px',
          borderRadius: 12,
          border: '1px solid var(--color-border)',
          background: 'var(--color-card-bg)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          fontFamily: 'var(--font-body)',
          fontWeight: 500,
          fontSize: 13,
          color: 'var(--color-ink)',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
        </svg>
        View map &middot; {allStops.length} stops across {days.length} {days.length === 1 ? 'day' : 'days'}
      </button>
    )
  }

  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--color-border)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      <div ref={mapContainer} style={{ height: isMobile ? 320 : 480, width: '100%' }} />
      <div style={{ background: 'var(--color-card-bg)', padding: '10px 16px', borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <p style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', margin: 0 }}>
          {allStops.length} stops across {days.length} {days.length === 1 ? 'day' : 'days'} &middot; Click markers for details
        </p>
        {isMobile && (
          <button
            onClick={() => { setMapExpanded(false); if (mapRef.current) { mapRef.current.remove(); mapRef.current = null } }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)', textDecoration: 'underline', padding: 0 }}
          >
            Hide map
          </button>
        )}
      </div>
    </div>
  )
}

function StopCard({ stop, index, isOvernight }) {
  const style = VERTICAL_STYLES[stop.vertical]
  const color = VERTICAL_COLORS[stop.vertical] || '#5f8a7e'
  const label = VERTICAL_LABELS[stop.vertical] || stop.vertical

  const venueUrl = stop.slug ? getVerticalUrl(stop.vertical, stop.slug) : null

  return (
    <div
      className="flex gap-4 items-start"
      style={{
        background: isOvernight ? 'linear-gradient(135deg, #f0f7fa 0%, #e8f4f8 100%)' : 'var(--color-card-bg)',
        border: `1px solid ${isOvernight ? '#5A8A9A30' : 'var(--color-border)'}`,
        borderRadius: 12,
        padding: '16px 18px',
      }}
    >
      {/* Number or moon icon */}
      <div
        style={{
          width: 32, height: 32, borderRadius: '50%',
          background: isOvernight ? '#5A8A9A' : color,
          color: 'white', fontWeight: 700, fontSize: 13,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, marginTop: 2,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {isOvernight ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        ) : index}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex items-center gap-2 flex-wrap">
          {venueUrl ? (
            <a
              href={venueUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 16, color: 'var(--color-ink)', textDecoration: 'none' }}
              className="hover:underline"
            >
              {stop.venue_name}
            </a>
          ) : (
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 16, color: 'var(--color-ink)' }}>
              {stop.venue_name}
            </span>
          )}
          {style && (
            <span
              style={{
                backgroundColor: style.bg, color: style.text,
                padding: '2px 8px', borderRadius: 99, fontSize: 10,
                fontWeight: 600, fontFamily: 'var(--font-body)',
                letterSpacing: '0.02em',
              }}
            >
              {label}
            </span>
          )}
          {isOvernight && (
            <span
              style={{
                background: '#5A8A9A15', color: '#5A8A9A',
                padding: '2px 8px', borderRadius: 99, fontSize: 10,
                fontWeight: 600, fontFamily: 'var(--font-body)',
              }}
            >
              Overnight
            </span>
          )}
        </div>
        {stop.note && (
          <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 13, color: 'var(--color-muted)', marginTop: 4, lineHeight: 1.5 }}>
            {stop.note}
          </p>
        )}
        {venueUrl && (
          <a
            href={venueUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6,
              fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 11,
              color, textDecoration: 'none', opacity: 0.8,
            }}
            className="hover:opacity-100"
          >
            View listing
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
            </svg>
          </a>
        )}
      </div>
    </div>
  )
}

function RecommendationCard({ rec, onAdd, added }) {
  const color = VERTICAL_COLORS[rec.vertical] || '#5f8a7e'
  const label = VERTICAL_LABELS[rec.vertical] || rec.vertical
  const isAccommodation = rec.vertical === 'rest'

  return (
    <div
      style={{
        background: isAccommodation ? 'linear-gradient(135deg, #f0f7fa 0%, #e8f4f8 100%)' : 'var(--color-card-bg)',
        border: isAccommodation ? '1.5px solid #5A8A9A40' : '1px solid var(--color-border)',
        borderRadius: 12,
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: 80,
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
    >
      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 14, color: 'var(--color-ink)' }}>
            {rec.name}
          </span>
          <span style={{
            backgroundColor: color, color: 'white',
            padding: '1px 7px', borderRadius: 99, fontSize: 10,
            fontWeight: 600, fontFamily: 'var(--font-body)',
            letterSpacing: '0.02em',
          }}>
            {label}
          </span>
        </div>
        {rec.description && (
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 11.5,
            color: 'var(--color-muted)', marginTop: 3, lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            whiteSpace: 'normal',
          }}>
            {rec.description}
          </p>
        )}
      </div>

      {/* Add button */}
      <button
        onClick={() => onAdd(rec)}
        disabled={added}
        style={{
          flexShrink: 0,
          width: 32, height: 32,
          borderRadius: '50%',
          border: added ? 'none' : `1.5px solid ${isAccommodation ? '#5A8A9A' : color}`,
          background: added ? '#4A7C59' : 'transparent',
          color: added ? 'white' : (isAccommodation ? '#5A8A9A' : color),
          cursor: added ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s ease',
          fontSize: 18,
          fontWeight: 300,
          lineHeight: 1,
        }}
        title={added ? 'Added' : 'Add to itinerary'}
      >
        {added ? '✓' : '+'}
      </button>
    </div>
  )
}

// Labels for flow chips
const FLOW_LABELS = {
  accommodation: { need: 'Accommodation included', sorted: 'Own accommodation', daytrip: 'Day trip' },
  transport: { driving: 'Driving', public: 'Public transport', walking: 'Walking / cycling' },
  group: { solo: 'Solo', couple: 'Couple', friends: 'Friends', family: 'Family with kids' },
  pace: { relaxed: 'Relaxed', packed: 'Packed' },
}

function ItineraryPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const q = searchParams.get('q') || ''

  // Read question flow params from URL
  const flowAccommodation = searchParams.get('accommodation')
  const flowTransport = searchParams.get('transport')
  const flowGroup = searchParams.get('group')
  const flowPace = searchParams.get('pace')

  // Gate: preferences modal must be completed before generation starts
  // Accept _prefs (from TrailQuestionFlow), rest_prefs (from Rest Atlas redirect),
  // or detect that all 4 pref params are already present in the URL
  const prefsConfirmed = searchParams.has('_prefs') || searchParams.has('rest_prefs') ||
    (flowAccommodation && flowTransport && flowGroup && flowPace)
  const needsPrefsModal = !!q && !prefsConfirmed

  const [itinerary, setItinerary] = useState(null)
  const [loading, setLoading] = useState(!needsPrefsModal)
  const [error, setError] = useState(null)
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [addedRecs, setAddedRecs] = useState(new Set())
  const originalRecsRef = useRef(null)

  const destination = extractDestination(q)

  // Cycle loading messages
  useEffect(() => {
    if (!loading) return
    const interval = setInterval(() => {
      setLoadingMsgIndex(prev => (prev + 1) % LOADING_MESSAGES.length)
    }, 2800)
    return () => clearInterval(interval)
  }, [loading])

  // Fetch itinerary — pass all URL params to API (only after prefs modal)
  useEffect(() => {
    if (!q) {
      setError('No query provided')
      setLoading(false)
      return
    }

    // Wait for preferences modal before generating
    if (needsPrefsModal) return

    // Ensure loading overlay shows — critical for client-side transitions
    // from TrailQuestionFlow (router.replace keeps component mounted,
    // so useState(false) retains its initial value without this)
    setLoading(true)
    setError(null)

    let cancelled = false

    async function fetchItinerary() {
      try {
        const params = new URLSearchParams({ q })
        if (flowAccommodation) params.set('accommodation', flowAccommodation)
        if (flowTransport) params.set('transport', flowTransport)
        if (flowGroup) params.set('group', flowGroup)
        if (flowPace) params.set('pace', flowPace)

        const res = await fetch(`/api/itinerary?${params.toString()}`)
        const data = await res.json()

        if (cancelled) return

        if (data.error === 'no_region' || data.error === 'insufficient_venues') {
          setError(data)
          setLoading(false)
          return
        }

        if (data.error) {
          setError({ error: data.error, message: data.message || data.error })
          setLoading(false)
          return
        }

        // Store original recommendations for later re-filtering
        if (data.recommendations?.length > 0) {
          originalRecsRef.current = [...data.recommendations]
        }
        // Sort initial recommendations by chronological flow order
        if (data.recommendations) {
          data.recommendations = sortRecsByFlowOrder(data.recommendations)
        }
        setItinerary(data)
        setLoading(false)
      } catch (err) {
        if (!cancelled) {
          setError('Something went wrong. Please try again.')
          setLoading(false)
        }
      }
    }

    fetchItinerary()
    return () => { cancelled = true }
  }, [q, flowAccommodation, flowTransport, flowGroup, flowPace, needsPrefsModal])

  // Sort recommendations by chronological daily flow order
  function sortRecsByFlowOrder(recs) {
    return [...recs].sort((a, b) => {
      const aIdx = VERTICAL_FLOW_ORDER.indexOf(a.vertical)
      const bIdx = VERTICAL_FLOW_ORDER.indexOf(b.vertical)
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx)
    })
  }

  // Client-side refresh: re-filter and re-sort original recs when 3+ have been added
  function refreshRecommendations(currentDays, newAddedRecs) {
    const originals = originalRecsRef.current
    if (!originals || originals.length === 0) return null

    // Count verticals currently in the itinerary days
    const verticalCounts = {}
    for (const day of currentDays) {
      for (const stop of (day.stops || [])) {
        verticalCounts[stop.vertical] = (verticalCounts[stop.vertical] || 0) + 1
      }
      if (day.overnight) {
        verticalCounts[day.overnight.vertical] = (verticalCounts[day.overnight.vertical] || 0) + 1
      }
    }

    // Compute centroid of all itinerary stops for proximity sorting
    let centroidLat = 0, centroidLng = 0, centroidCount = 0
    for (const day of currentDays) {
      for (const stop of (day.stops || [])) {
        if (stop.lat && stop.lng) {
          centroidLat += parseFloat(stop.lat)
          centroidLng += parseFloat(stop.lng)
          centroidCount++
        }
      }
      if (day.overnight?.lat && day.overnight?.lng) {
        centroidLat += parseFloat(day.overnight.lat)
        centroidLng += parseFloat(day.overnight.lng)
        centroidCount++
      }
    }
    if (centroidCount > 0) {
      centroidLat /= centroidCount
      centroidLng /= centroidCount
    }

    // Filter out already-added recs
    const available = originals.filter(r => !newAddedRecs.has(r.id))

    // Score each rec: under-represented verticals get lower score (sorted ascending)
    const maxCount = Math.max(1, ...Object.values(verticalCounts))
    const scored = available.map(r => {
      const vertRepresentation = (verticalCounts[r.vertical] || 0) / maxCount
      const flowIdx = VERTICAL_FLOW_ORDER.indexOf(r.vertical)
      const flowScore = flowIdx === -1 ? 999 : flowIdx
      // Distance from centroid (rough, no need for haversine at this scale)
      let dist = 0
      if (r.lat && r.lng && centroidCount > 0) {
        const dLat = parseFloat(r.lat) - centroidLat
        const dLng = parseFloat(r.lng) - centroidLng
        dist = Math.sqrt(dLat * dLat + dLng * dLng)
      }
      return { rec: r, vertRepresentation, flowScore, dist }
    })

    // Sort: under-represented verticals first, then by flow order, then proximity
    scored.sort((a, b) => {
      if (a.vertRepresentation !== b.vertRepresentation) return a.vertRepresentation - b.vertRepresentation
      if (a.flowScore !== b.flowScore) return a.flowScore - b.flowScore
      return a.dist - b.dist
    })

    return scored.slice(0, 12).map(s => s.rec)
  }

  // Save as trail
  const handleSave = useCallback(async () => {
    if (!itinerary || saving || saved) return
    setSaving(true)

    // Collect all stops
    const stops = []
    let orderIndex = 0
    for (const day of itinerary.days) {
      for (const stop of (day.stops || [])) {
        stops.push({
          listing_id: stop.listing_id,
          vertical: stop.vertical,
          venue_name: stop.venue_name,
          venue_lat: stop.lat,
          venue_lng: stop.lng,
          venue_image_url: stop.hero_image_url || null,
          order_index: orderIndex++,
          notes: stop.note || null,
        })
      }
      if (day.overnight) {
        stops.push({
          listing_id: day.overnight.listing_id,
          vertical: day.overnight.vertical,
          venue_name: day.overnight.venue_name,
          venue_lat: day.overnight.lat,
          venue_lng: day.overnight.lng,
          venue_image_url: day.overnight.hero_image_url || null,
          order_index: orderIndex++,
          notes: day.overnight.note ? `[Overnight] ${day.overnight.note}` : '[Overnight]',
        })
      }
    }

    try {
      const res = await fetch('/api/trails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: itinerary.title,
          description: itinerary.intro,
          type: 'user',
          visibility: 'private',
          region: itinerary.region || null,
          stops,
        }),
      })

      if (res.ok) {
        setSaved(true)
        const data = await res.json()
        if (data.trail?.slug) {
          setTimeout(() => router.push(`/trails/${data.trail.slug}`), 1200)
        }
      } else {
        const data = await res.json()
        if (res.status === 401) {
          // Not logged in
          router.push(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`)
          return
        }
        console.error('Save failed:', data.error)
      }
    } catch (err) {
      console.error('Save error:', err)
    } finally {
      setSaving(false)
    }
  }, [itinerary, saving, saved, router])

  // Add recommendation — accommodation triggers overnight + new day if needed
  const handleAddRec = useCallback((rec) => {
    if (!itinerary || addedRecs.has(rec.id)) return

    const isAccommodation = rec.vertical === 'rest'

    const newStop = {
      listing_id: rec.id,
      venue_name: rec.name,
      vertical: rec.vertical,
      lat: rec.lat,
      lng: rec.lng,
      note: '',
      slug: rec.slug,
      hero_image_url: rec.hero_image_url,
      region: rec.region,
    }

    const updatedDays = [...itinerary.days]

    if (isAccommodation) {
      // Find a day without overnight to slot this into
      const dayWithoutOvernight = updatedDays.findIndex(d => !d.overnight)
      const targetDayIndex = dayWithoutOvernight >= 0 ? dayWithoutOvernight : updatedDays.length - 1

      // Set as overnight on that day
      updatedDays[targetDayIndex] = {
        ...updatedDays[targetDayIndex],
        overnight: newStop,
      }

      // If this is the last day (or only day) and there's no next day yet, create one
      const isLastDay = targetDayIndex === updatedDays.length - 1
      if (isLastDay) {
        // Derive a day label from the venue region
        const regionLabel = rec.region || itinerary.region || ''
        const newDayNumber = updatedDays.length + 1
        updatedDays.push({
          day_number: newDayNumber,
          label: regionLabel ? `Day ${newDayNumber} — ${regionLabel}` : `Day ${newDayNumber}`,
          stops: [],
          overnight: null,
        })
      }
    } else {
      // Non-accommodation: add to the last day's stops
      const lastDayIndex = updatedDays.length - 1
      updatedDays[lastDayIndex] = {
        ...updatedDays[lastDayIndex],
        stops: [...(updatedDays[lastDayIndex].stops || []), newStop],
      }
    }

    const newAddedRecs = new Set([...addedRecs, rec.id])
    const newAddedCount = newAddedRecs.size

    // Refresh suggestions when 3+ recs have been added (and on every multiple of 3 after)
    let updatedRecs = itinerary.recommendations
    if (newAddedCount >= 3 && newAddedCount % 3 === 0) {
      const refreshed = refreshRecommendations(updatedDays, newAddedRecs)
      if (refreshed) {
        updatedRecs = refreshed
      }
    }

    setItinerary({ ...itinerary, days: updatedDays, recommendations: updatedRecs })
    setAddedRecs(newAddedRecs)
  }, [itinerary, addedRecs])

  // Share
  const handleShare = useCallback(() => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  // --- Preferences modal gate ---
  if (needsPrefsModal) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22, color: 'var(--color-ink)', marginBottom: 8 }}>
          Almost there...
        </h2>
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14, color: 'var(--color-muted)' }}>
          A few quick preferences to shape your trail.
        </p>
        <TrailQuestionFlow
          query={q}
          onClose={() => router.back()}
        />
      </div>
    )
  }

  // --- Loading state ---
  if (loading) {
    return (
      <>
        {/* Inline fallback that renders immediately — no external dependency */}
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          background: 'var(--color-bg)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 16,
        }}>
          <div style={{
            fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase',
            color: 'var(--color-muted)', fontFamily: 'var(--font-sans)', fontWeight: 600,
          }}>
            Australian Atlas
          </div>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400,
            fontSize: 'clamp(18px, 3vw, 26px)', color: 'var(--color-ink)',
          }}>
            {LOADING_MESSAGES[loadingMsgIndex]}
          </h2>
          <p style={{
            fontSize: 12, color: 'var(--color-muted)',
            fontFamily: 'var(--font-sans)', letterSpacing: '0.02em',
          }}>
            Building from verified venues only
          </p>
          {/* Progress bar */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 3,
            background: 'var(--color-border)',
          }}>
            <div style={{
              height: '100%', width: '60%',
              background: 'linear-gradient(90deg, var(--color-sage-dark), var(--color-sage))',
              animation: 'trailProgress 3s ease-in-out infinite',
            }} />
          </div>
          <style>{`
            @keyframes trailProgress {
              0% { width: 0%; }
              50% { width: 75%; }
              100% { width: 92%; }
            }
          `}</style>
        </div>
        {/* Layer the rich map overlay on top once it loads */}
        <TrailLoadingOverlay
          visible={true}
          regionLabel={destination !== 'your' ? destination : null}
          trailReady={false}
        />
      </>
    )
  }

  // --- Error state ---
  if (error) {
    const isNoRegion = error.error === 'no_region'
    const isInsufficient = error.error === 'insufficient_venues'
    const errorRegion = error.region_label || error.region

    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
        <svg className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--color-border)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {isNoRegion ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          )}
        </svg>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22, color: 'var(--color-ink)', marginBottom: 8 }}>
          {isNoRegion
            ? 'Which region did you have in mind?'
            : isInsufficient
            ? `Not enough listings${errorRegion ? ` in ${errorRegion}` : ''} yet`
            : 'Could not build this itinerary'}
        </h2>
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14, color: 'var(--color-muted)', maxWidth: 440, margin: '0 auto 24px', lineHeight: 1.6 }}>
          {error.message || 'Something went wrong. Please try again.'}
        </p>

        {/* Suggested regions for no_region error */}
        {isNoRegion && (
          <div style={{ maxWidth: 440, margin: '0 auto 24px' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 12, color: 'var(--color-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Try one of these
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {['Barossa Valley wineries', 'Weekend in Hobart', 'Yarra Valley day trip', 'Byron Bay 3 days', 'Eastern Victoria food trail'].map(suggestion => (
                <Link
                  key={suggestion}
                  href={`/itinerary?q=${encodeURIComponent(suggestion)}`}
                  style={{
                    fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 13,
                    color: 'var(--color-ink)', background: '#f5f5f0',
                    padding: '6px 14px', borderRadius: 99, textDecoration: 'none',
                    border: '1px solid var(--color-border)',
                    transition: 'background 0.15s',
                  }}
                  className="hover:bg-[var(--color-cream)]"
                >
                  {suggestion}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Alternative trail suggestions for insufficient coverage */}
        {isInsufficient && error.suggested_trails?.length > 0 && (
          <div style={{ maxWidth: 480, margin: '0 auto 28px' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 11, color: 'var(--color-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Try a nearby region instead
            </p>
            <div className="grid gap-2" style={{ textAlign: 'left' }}>
              {error.suggested_trails.map(trail => (
                <Link
                  key={trail.query}
                  href={`/itinerary?q=${encodeURIComponent(trail.query)}`}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink)',
                    background: '#fff', padding: '12px 16px', borderRadius: 8,
                    textDecoration: 'none', border: '1px solid var(--color-border)',
                    transition: 'border-color 0.15s',
                  }}
                  className="hover:border-[var(--color-sage)]"
                >
                  <span style={{ fontWeight: 400 }}>{trail.query}</span>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)' }}>
                    {trail.listing_count} listings
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Suggested trail queries for no_region with suggested_trails from API */}
        {isNoRegion && error.suggested_trails?.length > 0 && (
          <div style={{ maxWidth: 440, margin: '0 auto 24px' }}>
            <div className="flex flex-wrap justify-center gap-2">
              {error.suggested_trails.map(trail => (
                <Link
                  key={trail.query}
                  href={`/itinerary?q=${encodeURIComponent(trail.query)}`}
                  style={{
                    fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 13,
                    color: 'var(--color-ink)', background: '#f5f5f0',
                    padding: '6px 14px', borderRadius: 99, textDecoration: 'none',
                    border: '1px solid var(--color-border)',
                  }}
                  className="hover:bg-[var(--color-cream)]"
                >
                  {trail.query}
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-4">
          {isInsufficient && errorRegion ? (
            <>
              <Link href={`/search?q=${encodeURIComponent(errorRegion)}`} style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13, color: 'var(--color-accent)' }}>
                Search {errorRegion}
              </Link>
              <span style={{ color: 'var(--color-border)' }}>|</span>
              <Link href="/regions" style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13, color: 'var(--color-accent)' }}>
                Browse all regions
              </Link>
              <span style={{ color: 'var(--color-border)' }}>|</span>
              <Link href="/map" style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13, color: 'var(--color-accent)' }}>
                Explore the map
              </Link>
            </>
          ) : (
            <>
              <Link href="/search" style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13, color: 'var(--color-accent)' }}>
                Try searching instead
              </Link>
              <span style={{ color: 'var(--color-border)' }}>|</span>
              <Link href="/regions" style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13, color: 'var(--color-accent)' }}>
                Browse regions
              </Link>
            </>
          )}
        </div>
      </div>
    )
  }

  // Safety net — should never reach here, but avoid blank page if state is unexpected
  if (!itinerary) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'var(--color-bg)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 16,
      }}>
        <div style={{
          fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase',
          color: 'var(--color-muted)', fontFamily: 'var(--font-sans)', fontWeight: 600,
        }}>
          Australian Atlas
        </div>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400,
          fontSize: 'clamp(18px, 3vw, 26px)', color: 'var(--color-ink)',
        }}>
          Building your trail...
        </h2>
      </div>
    )
  }

  // Count total stops
  const totalStops = itinerary.days.reduce((sum, d) => sum + (d.stops?.length || 0) + (d.overnight ? 1 : 0), 0)

  // --- Itinerary result ---
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href={`/search?q=${encodeURIComponent(q)}`}
          style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 12, color: 'var(--color-muted)' }}
          className="hover:text-[var(--color-ink)] transition-colors inline-flex items-center gap-1 mb-4"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back to search
        </Link>

        {/* Region label — prominent so user can immediately confirm correct area */}
        {(itinerary.region_label || itinerary.region) && (
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 12,
            color: 'var(--color-sage)', letterSpacing: '0.08em', textTransform: 'uppercase',
            marginBottom: 6,
          }}>
            {itinerary.region_label || itinerary.region}
          </p>
        )}

        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 32, color: 'var(--color-ink)', lineHeight: 1.2 }}>
          {itinerary.title}
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 15, color: 'var(--color-muted)', marginTop: 8, lineHeight: 1.6, maxWidth: 640 }}>
          {itinerary.intro}
        </p>

        {/* Summary chips: days, stops, flow answers */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <span style={{
            fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 11,
            background: 'var(--color-ink)', color: 'white',
            padding: '3px 10px', borderRadius: 99,
          }}>
            {itinerary.days.length} {itinerary.days.length === 1 ? 'day' : 'days'}
          </span>
          <span style={{
            fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 11,
            background: '#f5f5f0', color: 'var(--color-muted)',
            padding: '3px 10px', borderRadius: 99,
          }}>
            {totalStops} stops
          </span>
          {/* Flow answer chips */}
          {itinerary.flow && Object.entries(itinerary.flow).map(([key, val]) => {
            if (!val || !FLOW_LABELS[key]?.[val]) return null
            return (
              <span key={key} style={{
                fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 11,
                background: '#f5f5f0', color: 'var(--color-muted)',
                padding: '3px 10px', borderRadius: 99,
              }}>
                {FLOW_LABELS[key][val]}
              </span>
            )
          })}
          {itinerary.personalised && (
            <span style={{
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 11,
              background: 'rgba(95,138,126,0.1)', color: 'var(--color-sage)',
              padding: '3px 10px', borderRadius: 99,
            }}>
              Personalised
            </span>
          )}
        </div>

        {/* Preferences applied line */}
        {itinerary.preference_labels && itinerary.preference_labels.length > 0 && (
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 12,
            color: 'var(--color-sage)', marginTop: 8, lineHeight: 1.5,
          }}>
            Personalised for: {itinerary.preference_labels.join(' \u00B7 ')}
          </p>
        )}

        {/* Sign-in prompt for unauthenticated users */}
        {itinerary.authenticated === false && (
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 12,
            color: 'var(--color-muted)', marginTop: 6, lineHeight: 1.5,
          }}>
            <Link
              href={`/login?redirect=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/trails')}`}
              style={{ color: 'var(--color-sage)', textDecoration: 'underline', textUnderlineOffset: 2 }}
            >
              Sign in
            </Link>
            {' '}to personalise trails based on your saved preferences.
          </p>
        )}

        {/* Thin corpus notice */}
        {itinerary.thin_corpus && itinerary.focus_verticals && (
          <div style={{
            marginTop: 16, padding: '12px 16px', borderRadius: 8,
            background: 'rgba(95,138,126,0.06)', border: '1px solid rgba(95,138,126,0.15)',
          }}>
            <p style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.5, margin: 0 }}>
              We found {itinerary.focus_venue_count || 'limited'} {itinerary.focus_verticals.join(' / ')} {itinerary.focus_venue_count === 1 ? 'venue' : 'venues'} in this area — we&apos;ve included {itinerary.focus_venue_count === 1 ? 'it' : 'them all'} and supplemented with complementary stops. Our coverage here is growing.
            </p>
          </div>
        )}
      </div>

      {/* Map */}
      <div className="mb-10">
        <ItineraryMap days={itinerary.days} />
      </div>

      {/* Day-by-day sections */}
      <div className="space-y-10">
        {itinerary.days.map((day, dayIndex) => {
          let stopCounter = 0
          // Count stops from previous days
          for (let i = 0; i < dayIndex; i++) {
            stopCounter += itinerary.days[i].stops?.length || 0
            if (itinerary.days[i].overnight) stopCounter++
          }

          return (
            <div key={day.day_number || dayIndex}>
              {/* Day header */}
              <div className="flex items-center gap-3 mb-4">
                <span style={{
                  fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 11,
                  background: 'var(--color-ink)', color: 'white',
                  padding: '4px 10px', borderRadius: 99,
                  letterSpacing: '0.05em', textTransform: 'uppercase',
                }}>
                  Day {day.day_number || dayIndex + 1}
                </span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 18, color: 'var(--color-ink)' }}>
                  {day.label}
                </span>
              </div>

              {/* Stops */}
              <div className="space-y-3 ml-1">
                {(day.stops || []).map((stop, i) => {
                  stopCounter++
                  return <StopCard key={`${stop.listing_id}-${i}`} stop={stop} index={stopCounter} isOvernight={false} />
                })}

                {/* Overnight */}
                {day.overnight && (
                  <>
                    {(() => { stopCounter++; return null })()}
                    <StopCard stop={day.overnight} index={stopCounter} isOvernight={true} />
                  </>
                )}
              </div>

              {/* Night transition — visual connector between days */}
              {day.overnight && dayIndex < itinerary.days.length - 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0 0 1px', padding: '0 0 0 14px' }}>
                  <div style={{ width: 1, height: 24, background: 'var(--color-border)', opacity: 0.5 }} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Recommendations */}
      {itinerary.recommendations?.length > 0 && (
        <div className="mt-10 pt-8" style={{ borderTop: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-3 mb-1">
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 20, color: 'var(--color-ink)', margin: 0 }}>
              {itinerary.needs_accommodation ? 'Add accommodation & more' : 'You might also add'}
            </h2>
          </div>
          <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 13, color: 'var(--color-muted)', marginBottom: 16 }}>
            {itinerary.needs_accommodation
              ? 'This multi-day trip needs somewhere to stay. Tap + to add venues to your itinerary.'
              : 'Nearby venues that complement your trail. Tap + to add.'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
            {itinerary.recommendations.map(rec => (
              <RecommendationCard
                key={rec.id}
                rec={rec}
                onAdd={handleAddRec}
                added={addedRecs.has(rec.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-10 pt-8 flex items-center gap-3 flex-wrap" style={{ borderTop: '1px solid var(--color-border)' }}>
        <button
          onClick={handleSave}
          disabled={saving || saved}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full transition-all hover:opacity-90 disabled:opacity-60"
          style={{
            fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13,
            background: saved ? '#4A7C59' : 'var(--color-ink)',
            color: 'white', border: 'none', cursor: saving || saved ? 'default' : 'pointer',
          }}
        >
          {saved ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
              Saved as trail
            </>
          ) : saving ? (
            'Saving...'
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                <polyline points="17,21 17,13 7,13 7,21"/>
                <polyline points="7,3 7,8 15,8"/>
              </svg>
              Save as trail
            </>
          )}
        </button>

        <button
          onClick={handleShare}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full transition-all hover:opacity-80"
          style={{
            fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13,
            background: 'transparent',
            color: 'var(--color-ink)',
            border: '1px solid var(--color-border)',
            cursor: 'pointer',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
          {copied ? 'Link copied!' : 'Share'}
        </button>

        <Link
          href={`/search?q=${encodeURIComponent(q)}`}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full transition-all hover:opacity-80"
          style={{
            fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13,
            color: 'var(--color-muted)',
            border: '1px solid var(--color-border)',
            textDecoration: 'none',
          }}
        >
          Search instead
        </Link>
      </div>

      {/* Disclaimer */}
      <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 11, color: 'var(--color-muted)', marginTop: 24, lineHeight: 1.5, opacity: 0.7 }}>
        This itinerary was generated from venues listed across the Australian Atlas network.
        Check individual venue pages for opening hours and booking details before you set off.
      </p>
    </div>
  )
}

class ItineraryErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('[Itinerary] Client error:', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22, color: 'var(--color-ink)', marginBottom: 8 }}>
            Something went wrong
          </h2>
          <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14, color: 'var(--color-muted)', marginBottom: 16 }}>
            We hit a snag building your trail. Please try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 14,
              color: 'white', background: 'var(--color-sage)', border: 'none',
              padding: '10px 24px', borderRadius: 8, cursor: 'pointer',
            }}
          >
            Reload page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// Visible loading fallback — renders in static HTML, visible immediately
function LoadingFallback() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9998,
      background: 'var(--color-bg)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 16,
    }}>
      <div style={{
        fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase',
        color: 'var(--color-muted)', fontFamily: 'var(--font-sans)', fontWeight: 600,
      }}>
        Australian Atlas
      </div>
      <h2 style={{
        fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22,
        color: 'var(--color-ink)',
      }}>
        Building your trail...
      </h2>
      <p style={{
        fontSize: 12, color: 'var(--color-muted)',
        fontFamily: 'var(--font-sans)', letterSpacing: '0.02em',
      }}>
        Building from verified venues only
      </p>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: 'var(--color-border)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: '40%',
          background: 'linear-gradient(90deg, var(--color-sage-dark), var(--color-sage))',
          animation: 'trailShimmer 1.5s ease-in-out infinite alternate',
        }} />
      </div>
      <style>{`
        @keyframes trailShimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }
      `}</style>
    </div>
  )
}

export default function ItineraryPage() {
  return (
    <ItineraryErrorBoundary>
      <Suspense fallback={<LoadingFallback />}>
        <ItineraryPageInner />
      </Suspense>
    </ItineraryErrorBoundary>
  )
}
