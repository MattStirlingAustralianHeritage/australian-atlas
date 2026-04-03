'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Nav from '@/components/Nav'
import { VERTICAL_STYLES } from '@/components/VerticalBadge'
import { getVerticalUrl } from '@/lib/verticalUrl'

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A', fine_grounds: '#8A7055',
  rest: '#5A8A9A', field: '#4A7C59', corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

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

  // Collect all stops with coordinates
  const allStops = []
  let stopIndex = 0
  for (const day of days) {
    for (const stop of (day.stops || [])) {
      if (stop.lat && stop.lng) {
        allStops.push({ ...stop, globalIndex: ++stopIndex, isOvernight: false })
      }
    }
    if (day.overnight?.lat && day.overnight?.lng) {
      allStops.push({ ...day.overnight, globalIndex: ++stopIndex, isOvernight: true })
    }
  }

  const coordinates = allStops.map(s => [parseFloat(s.lng), parseFloat(s.lat)])

  useEffect(() => {
    if (!coordinates || coordinates.length === 0) return
    if (mapRef.current) return
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
        // Route line
        let routeGeometry = null
        if (coordinates.length >= 2) {
          routeGeometry = await fetchRouteGeometry(coordinates, token)
        }

        const geojsonData = routeGeometry
          ? { type: 'Feature', geometry: routeGeometry }
          : { type: 'Feature', geometry: { type: 'LineString', coordinates } }

        map.addSource('itinerary-route', { type: 'geojson', data: geojsonData })

        map.addLayer({
          id: 'itinerary-route-glow',
          type: 'line',
          source: 'itinerary-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#5f8a7e', 'line-width': 8, 'line-opacity': 0.15 },
        })

        map.addLayer({
          id: 'itinerary-route-line',
          type: 'line',
          source: 'itinerary-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#4a7166', 'line-width': 2.5, 'line-dasharray': [2, 1.5] },
        })

        // Numbered markers
        allStops.forEach((stop) => {
          const color = stop.isOvernight ? '#5A8A9A' : (VERTICAL_COLORS[stop.vertical] || '#5f8a7e')
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
                ${label ? `<p style="margin:0;color:${color};font-size:10px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">${label}</p>` : ''}
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (coordinates.length === 0) return null

  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--color-border)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      <div ref={mapContainer} style={{ height: 480, width: '100%' }} />
      <div style={{ background: 'var(--color-card-bg)', padding: '10px 16px', borderTop: '1px solid var(--color-border)', textAlign: 'center' }}>
        <p style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', margin: 0 }}>
          {allStops.length} stops across {days.length} {days.length === 1 ? 'day' : 'days'} &middot; Click markers for details
        </p>
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
      </div>
    </div>
  )
}

function ItineraryPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const q = searchParams.get('q') || ''

  const [itinerary, setItinerary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const destination = extractDestination(q)

  // Cycle loading messages
  useEffect(() => {
    if (!loading) return
    const interval = setInterval(() => {
      setLoadingMsgIndex(prev => (prev + 1) % LOADING_MESSAGES.length)
    }, 2800)
    return () => clearInterval(interval)
  }, [loading])

  // Fetch itinerary
  useEffect(() => {
    if (!q) {
      setError('No query provided')
      setLoading(false)
      return
    }

    let cancelled = false

    async function fetchItinerary() {
      try {
        const res = await fetch(`/api/itinerary?q=${encodeURIComponent(q)}`)
        const data = await res.json()

        if (cancelled) return

        if (data.error === 'insufficient_venues') {
          setError(data.message)
          setLoading(false)
          return
        }

        if (data.error) {
          setError(data.error)
          setLoading(false)
          return
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
  }, [q])

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

  // Share
  const handleShare = useCallback(() => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  // --- Loading state ---
  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div style={{ width: 48, height: 48, margin: '0 auto 24px', position: 'relative' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            border: '3px solid var(--color-border)',
            borderTopColor: 'var(--color-sage)',
            animation: 'spin 1s linear infinite',
          }} />
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22, color: 'var(--color-ink)', marginBottom: 8 }}>
          Planning {destination !== 'your' ? `your ${destination}` : 'your'} trail...
        </h2>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14, color: 'var(--color-muted)',
          transition: 'opacity 0.3s ease',
        }}>
          {LOADING_MESSAGES[loadingMsgIndex]}
        </p>
        <style jsx>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  // --- Error state ---
  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
        <svg className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--color-border)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22, color: 'var(--color-ink)', marginBottom: 8 }}>
          Could not build this itinerary
        </h2>
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14, color: 'var(--color-muted)', maxWidth: 400, margin: '0 auto 24px' }}>
          {error}
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/search" style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13, color: 'var(--color-accent)' }}>
            Try searching instead
          </Link>
          <span style={{ color: 'var(--color-border)' }}>|</span>
          <Link href="/regions" style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13, color: 'var(--color-accent)' }}>
            Browse regions
          </Link>
        </div>
      </div>
    )
  }

  if (!itinerary) return null

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

        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 32, color: 'var(--color-ink)', lineHeight: 1.2 }}>
          {itinerary.title}
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 15, color: 'var(--color-muted)', marginTop: 8, lineHeight: 1.6, maxWidth: 640 }}>
          {itinerary.intro}
        </p>

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
          {itinerary.region && (
            <span style={{
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 11,
              background: '#f5f5f0', color: 'var(--color-muted)',
              padding: '3px 10px', borderRadius: 99,
            }}>
              {itinerary.region}
            </span>
          )}
        </div>
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
            </div>
          )
        })}
      </div>

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

export default function ItineraryPage() {
  return (
    <Suspense fallback={
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div style={{ width: 48, height: 48, margin: '0 auto 24px', position: 'relative' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            border: '3px solid var(--color-border)',
            borderTopColor: 'var(--color-sage)',
            animation: 'spin 1s linear infinite',
          }} />
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22, color: 'var(--color-ink)' }}>
          Building your trail...
        </h2>
        <style jsx>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    }>
      <ItineraryPageInner />
    </Suspense>
  )
}
