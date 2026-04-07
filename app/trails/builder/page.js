'use client'

import { Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getAuthSupabase } from '@/lib/supabase/auth-clients'
import { getVerticalUrl, getVerticalBadge } from '@/lib/verticalUrl'

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A', fine_grounds: '#8A7055',
  rest: '#5A8A9A', field: '#4A7C59', corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

const VERTICAL_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'sba', label: 'Small Batch' },
  { key: 'collection', label: 'Culture' },
  { key: 'craft', label: 'Craft' },
  { key: 'fine_grounds', label: 'Fine Grounds' },
  { key: 'rest', label: 'Rest' },
  { key: 'field', label: 'Field' },
  { key: 'corner', label: 'Corner' },
  { key: 'found', label: 'Found' },
  { key: 'table', label: 'Table' },
]

const SAGE = 'var(--color-sage)'

function TrailBuilderInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('id')

  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [activeVertical, setActiveVertical] = useState('all')
  const [stops, setStops] = useState([])
  const [stopNotes, setStopNotes] = useState({}) // { venueId: 'note text' }
  const [trailName, setTrailName] = useState('')
  const [trailDesc, setTrailDesc] = useState('')
  const [visibility, setVisibility] = useState('private')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [mobileTab, setMobileTab] = useState('builder')

  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const popupRef = useRef(null)
  const searchTimeout = useRef(null)
  const routeLayersRef = useRef([])
  const stopMarkersRef = useRef([])
  const resultMarkersRef = useRef([])
  const stopsRef = useRef(stops)

  useEffect(() => { stopsRef.current = stops }, [stops])

  // Check auth
  useEffect(() => {
    const supabase = getAuthSupabase()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setAuthChecked(true)
    })
  }, [])

  // Window functions for popup interaction
  useEffect(() => {
    window.__trailBuilderAdd = (venueId, venueName, venueVertical, venueRegion, venueLat, venueLng, venueSlug) => {
      if (stopsRef.current.find(s => String(s.id) === String(venueId))) return
      setStops(prev => [...prev, {
        id: venueId, name: venueName, vertical: venueVertical,
        region: venueRegion, latitude: venueLat, longitude: venueLng, slug: venueSlug,
      }])
      if (popupRef.current) popupRef.current.remove()
    }
    window.__trailBuilderRemove = (venueId) => {
      setStops(prev => prev.filter(s => String(s.id) !== String(venueId)))
      if (popupRef.current) popupRef.current.remove()
    }
  })

  // Debounced search
  useEffect(() => {
    clearTimeout(searchTimeout.current)
    if (!search.trim()) {
      setSearchResults([])
      return
    }
    searchTimeout.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const verticalParam = activeVertical !== 'all' ? `&vertical=${activeVertical}` : ''
        const res = await fetch(`/api/trails/search?q=${encodeURIComponent(search.trim())}${verticalParam}`)
        if (!res.ok) throw new Error()
        const data = await res.json()
        setSearchResults(data.results || [])
      } catch {
        setSearchResults([])
      } finally {
        setSearchLoading(false)
      }
    }, 400)
    return () => clearTimeout(searchTimeout.current)
  }, [search, activeVertical])

  // Draw route between stops using Mapbox Directions API
  const drawRoute = useCallback(async (map, stopsToRender) => {
    // Clear old routes
    routeLayersRef.current.forEach(id => {
      try {
        if (map.getLayer(id)) map.removeLayer(id)
        if (map.getSource(id)) map.removeSource(id)
      } catch (e) {}
    })
    routeLayersRef.current = []

    if (!map || stopsToRender.length < 2) return

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    const newLayerIds = []

    for (let i = 0; i < stopsToRender.length - 1; i++) {
      const from = stopsToRender[i]
      const to = stopsToRender[i + 1]
      if (!from.longitude || !from.latitude || !to.longitude || !to.latitude) continue

      const sourceId = `route-${i}-${Date.now()}`
      const layerId = `route-line-${i}-${Date.now()}`
      newLayerIds.push(sourceId, layerId)

      try {
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?geometries=geojson&access_token=${token}`
        const res = await fetch(url)
        const data = await res.json()
        const route = data.routes?.[0]?.geometry

        if (route) {
          map.addSource(sourceId, { type: 'geojson', data: { type: 'Feature', geometry: route } })
        } else {
          // Fallback: straight line
          map.addSource(sourceId, {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: [
                  [parseFloat(from.longitude), parseFloat(from.latitude)],
                  [parseFloat(to.longitude), parseFloat(to.latitude)],
                ],
              },
            },
          })
        }

        map.addLayer({
          id: layerId, type: 'line', source: sourceId,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#5F8A7E', 'line-width': 2.5, 'line-opacity': 0.7, 'line-dasharray': [2, 1.5] },
        })
      } catch (e) {
        // Fallback to straight line on error
        try {
          map.addSource(sourceId, {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: [
                  [parseFloat(from.longitude), parseFloat(from.latitude)],
                  [parseFloat(to.longitude), parseFloat(to.latitude)],
                ],
              },
            },
          })
          map.addLayer({
            id: layerId, type: 'line', source: sourceId,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#5F8A7E', 'line-width': 2.5, 'line-opacity': 0.7, 'line-dasharray': [2, 1.5] },
          })
        } catch (e2) {}
      }
    }
    routeLayersRef.current = newLayerIds
  }, [])

  // Fit map bounds to stops
  const fitToStops = useCallback((map, stopsToFit) => {
    if (!map || stopsToFit.length === 0) return
    const withCoords = stopsToFit.filter(s => s.latitude && s.longitude)
    if (withCoords.length === 0) return
    if (withCoords.length === 1) {
      map.flyTo({ center: [parseFloat(withCoords[0].longitude), parseFloat(withCoords[0].latitude)], zoom: 11, duration: 800 })
      return
    }
    const lngs = withCoords.map(s => parseFloat(s.longitude))
    const lats = withCoords.map(s => parseFloat(s.latitude))
    map.fitBounds(
      [[Math.min(...lngs) - 0.05, Math.min(...lats) - 0.05], [Math.max(...lngs) + 0.05, Math.max(...lats) + 0.05]],
      { padding: 60, duration: 800 }
    )
  }, [])

  // Render stop markers (numbered, colored by vertical)
  const renderStopMarkers = useCallback((map, mapboxgl, currentStops) => {
    // Clear existing stop markers
    stopMarkersRef.current.forEach(m => m.remove())
    stopMarkersRef.current = []

    currentStops.forEach((stop, i) => {
      if (!stop.latitude || !stop.longitude) return
      const color = VERTICAL_COLORS[stop.vertical] || '#5F8A7E'
      const el = document.createElement('div')
      el.style.cssText = `width:28px;height:28px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;font-family:system-ui,sans-serif;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.2);cursor:pointer;`
      el.textContent = String(i + 1)

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([parseFloat(stop.longitude), parseFloat(stop.latitude)])
        .addTo(map)

      el.addEventListener('click', () => {
        const isAdded = true
        const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: false, maxWidth: '280px', offset: 16 })
        popup.setLngLat([parseFloat(stop.longitude), parseFloat(stop.latitude)])
          .setHTML(buildPopupHTML(stop, isAdded))
          .addTo(map)
        popupRef.current = popup
        attachPopupListeners(popup)
      })

      stopMarkersRef.current.push(marker)
    })
  }, [])

  // Render search result markers (small, grey)
  const renderResultMarkers = useCallback((map, mapboxgl, results, currentStops) => {
    resultMarkersRef.current.forEach(m => m.remove())
    resultMarkersRef.current = []

    const stopIds = new Set(currentStops.map(s => String(s.id)))

    results.forEach(r => {
      if (!r.latitude || !r.longitude || stopIds.has(String(r.id))) return
      const el = document.createElement('div')
      el.style.cssText = `width:10px;height:10px;border-radius:50%;background:#999;border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.15);cursor:pointer;`

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([parseFloat(r.longitude), parseFloat(r.latitude)])
        .addTo(map)

      el.addEventListener('click', () => {
        const isAdded = stopsRef.current.find(s => String(s.id) === String(r.id))
        const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: false, maxWidth: '280px', offset: 8 })
        popup.setLngLat([parseFloat(r.longitude), parseFloat(r.latitude)])
          .setHTML(buildPopupHTML(r, !!isAdded))
          .addTo(map)
        popupRef.current = popup
        attachPopupListeners(popup)
      })

      resultMarkersRef.current.push(marker)
    })
  }, [])

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      const map = new mapboxgl.Map({
        container: mapRef.current,
        style: 'mapbox://styles/mattstirlingaustralianheritage/cmn32b0iz003401swccb7d21k',
        center: [134, -27], zoom: 3.8, attributionControl: false,
      })
      mapInstance.current = map
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    })

    return () => {
      if (popupRef.current) popupRef.current.remove()
      if (mapInstance.current) { try { mapInstance.current.remove() } catch (e) {} mapInstance.current = null }
    }
  }, [])

  // Update stop markers + route when stops change
  useEffect(() => {
    const map = mapInstance.current
    if (!map) return

    const doUpdate = async () => {
      const mapboxgl = (await import('mapbox-gl')).default
      renderStopMarkers(map, mapboxgl, stops)
      await drawRoute(map, stops)
      if (stops.length > 0) fitToStops(map, stops)
    }

    if (map.isStyleLoaded()) {
      doUpdate()
    } else {
      map.once('load', doUpdate)
    }
  }, [stops, drawRoute, fitToStops, renderStopMarkers])

  // Update result markers when search results change
  useEffect(() => {
    const map = mapInstance.current
    if (!map) return

    const doUpdate = async () => {
      const mapboxgl = (await import('mapbox-gl')).default
      renderResultMarkers(map, mapboxgl, searchResults, stops)
    }

    if (map.isStyleLoaded()) {
      doUpdate()
    } else {
      map.once('load', doUpdate)
    }
  }, [searchResults, stops, renderResultMarkers])

  function addStop(venue) {
    if (stops.find(s => String(s.id) === String(venue.id))) return
    setStops(prev => [...prev, venue])
  }

  function removeStop(id) {
    setStops(prev => prev.filter(s => String(s.id) !== String(id)))
    setStopNotes(prev => { const next = { ...prev }; delete next[id]; return next })
  }

  function moveStop(index, dir) {
    setStops(prev => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  async function saveTrail() {
    if (!trailName.trim() || stops.length < 2) return

    if (!user) {
      router.push(`/login?return_url=/trails/builder`)
      return
    }

    setSaving(true)
    setSaveError(null)

    try {
      const res = await fetch('/api/trails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trailName.trim(),
          description: trailDesc.trim(),
          visibility,
          stops: stops.map((s, i) => ({
            venue_id: s.id,
            vertical: s.vertical,
            position: i,
            notes: stopNotes[s.id] || '',
          })),
        }),
      })

      if (!res.ok) throw new Error('Save failed')
      const data = await res.json()
      router.push(`/trails/${data.slug}`)
    } catch (err) {
      console.error(err)
      setSaveError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const canSave = trailName.trim().length > 0 && stops.length >= 2

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100svh', overflow: 'hidden', background: 'var(--color-cream)' }}>

      {/* Mobile tab toggle */}
      <div style={{ display: 'none' }} className="trail-mobile-tabs">
        {['builder', 'map'].map(tab => (
          <button
            key={tab}
            onClick={() => {
              setMobileTab(tab)
              if (tab === 'map') setTimeout(() => { if (mapInstance.current) mapInstance.current.resize() }, 50)
            }}
            style={{
              flex: 1, padding: '10px 0', border: 'none',
              borderBottom: `2px solid ${mobileTab === tab ? '#5F8A7E' : 'transparent'}`,
              background: 'transparent', fontFamily: 'var(--font-body)', fontSize: 12,
              fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: mobileTab === tab ? 'var(--color-ink)' : 'var(--color-muted)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {tab === 'builder' ? 'Builder' : 'Map'}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }} className="trail-body">

        {/* Left Panel - Sidebar */}
        <div
          className={`trail-sidebar${mobileTab === 'builder' ? ' mobile-active' : ''}`}
          style={{
            width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column',
            borderRight: '1px solid var(--color-border)', background: 'var(--color-cream)',
            overflow: 'hidden',
          }}
        >

          {/* Trail metadata */}
          <div style={{ padding: '20px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
            <div style={{
              fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase',
              color: 'var(--color-muted)', fontFamily: 'var(--font-body)', fontWeight: 600, marginBottom: 12,
            }}>
              <Link href="/map" style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', textDecoration: 'none', letterSpacing: '0.06em' }}>
                &larr; Map
              </Link>
              <span style={{ margin: '0 8px', color: 'var(--color-border)' }}>|</span>
              Trail Builder
            </div>

            <input
              value={trailName}
              onChange={e => setTrailName(e.target.value)}
              placeholder="Name your trail..."
              style={{
                width: '100%', fontFamily: 'var(--font-display)', fontSize: 20,
                color: 'var(--color-ink)', background: 'transparent', border: 'none',
                outline: 'none', boxSizing: 'border-box', marginBottom: 12,
              }}
            />

            <textarea
              value={trailDesc}
              onChange={e => setTrailDesc(e.target.value)}
              placeholder="Add a description (optional)..."
              rows={2}
              style={{
                width: '100%', padding: '8px 0', fontFamily: 'var(--font-body)', fontSize: 13,
                color: 'var(--color-ink)', background: 'transparent', border: 'none',
                borderBottom: '1px solid var(--color-border)', outline: 'none',
                resize: 'none', boxSizing: 'border-box', lineHeight: 1.5, marginBottom: 12,
              }}
            />

            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={visibility}
                onChange={e => setVisibility(e.target.value)}
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-ink)',
                  background: '#fff', border: '1px solid var(--color-border)', borderRadius: 4,
                  padding: '8px 12px', cursor: 'pointer', flexShrink: 0, outline: 'none',
                }}
              >
                <option value="private">Private</option>
                <option value="link">Link only</option>
                <option value="public">Public</option>
              </select>

              <button
                onClick={saveTrail}
                disabled={saving || !canSave}
                style={{
                  flex: 1, padding: '8px 16px',
                  background: canSave && !saving ? '#5F8A7E' : '#e8e4de',
                  color: canSave && !saving ? '#fff' : 'var(--color-muted)',
                  border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  fontFamily: 'var(--font-body)',
                  cursor: canSave && !saving ? 'pointer' : 'not-allowed',
                  transition: 'all 0.15s',
                }}
              >
                {saving ? 'Saving...' : 'Save trail'}
              </button>
            </div>

            {!canSave && !saveError && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>
                {!trailName.trim() && stops.length < 2
                  ? 'Add a name and at least 2 stops to save'
                  : !trailName.trim() ? 'Add a name to save' : 'Add at least 2 stops to save'}
              </div>
            )}

            {saveError && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#c0392b', fontFamily: 'var(--font-body)' }}>{saveError}</div>
            )}

            {!user && authChecked && (
              <div style={{ marginTop: 10, padding: '10px 12px', background: '#f5f0e8', borderRadius: 4, fontSize: 12, fontFamily: 'var(--font-body)', color: 'var(--color-ink)' }}>
                <Link
                  href="/login?return_url=/trails/builder"
                  style={{ color: '#5F8A7E', fontWeight: 600, textDecoration: 'none' }}
                >
                  Sign in
                </Link>
                {' '}to save your trail
              </div>
            )}
          </div>

          {/* Search section */}
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search venues across all verticals..."
                style={{
                  width: '100%', padding: '9px 12px 9px 32px', fontFamily: 'var(--font-body)',
                  fontSize: 13, color: 'var(--color-ink)', background: '#fff',
                  border: '1px solid var(--color-border)', borderRadius: 4,
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)"
                strokeWidth="2" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
              >
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              {searchLoading && (
                <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>
                  ...
                </div>
              )}
            </div>

            {/* Vertical filter pills */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {VERTICAL_FILTERS.map(v => {
                const active = activeVertical === v.key
                const color = v.key === 'all' ? '#5F8A7E' : (VERTICAL_COLORS[v.key] || '#5F8A7E')
                return (
                  <button
                    key={v.key}
                    onClick={() => setActiveVertical(v.key)}
                    style={{
                      padding: '4px 10px', borderRadius: 3,
                      border: `1px solid ${active ? color : 'var(--color-border)'}`,
                      cursor: 'pointer', fontSize: 11, fontWeight: 500,
                      fontFamily: 'var(--font-body)',
                      background: active ? color : 'transparent',
                      color: active ? '#fff' : 'var(--color-muted)',
                      transition: 'all 0.1s',
                    }}
                  >
                    {v.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Search results */}
          {searchResults.length > 0 && (
            <div style={{ maxHeight: 200, overflowY: 'auto', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
              {searchResults.map(r => {
                const isAdded = stops.find(s => String(s.id) === String(r.id))
                const color = VERTICAL_COLORS[r.vertical] || '#5F8A7E'
                return (
                  <div
                    key={r.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 20px', borderBottom: '1px solid var(--color-border)',
                      opacity: isAdded ? 0.5 : 1,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink)',
                        fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {r.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                          color, fontFamily: 'var(--font-body)',
                        }}>
                          {getVerticalBadge(r.vertical)}
                        </span>
                        {r.region && (
                          <span style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>
                            {r.region}
                          </span>
                        )}
                      </div>
                    </div>
                    {!isAdded && (
                      <button
                        onClick={() => addStop(r)}
                        style={{
                          flexShrink: 0, marginLeft: 8, padding: '4px 10px',
                          background: 'none', border: '1px solid var(--color-border)',
                          borderRadius: 3, fontSize: 11, color: '#5F8A7E', cursor: 'pointer',
                          fontFamily: 'var(--font-body)', fontWeight: 600,
                        }}
                      >
                        + Add
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Stops list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
            {stops.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '40px 16px', color: 'var(--color-muted)',
                fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.8,
              }}>
                <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>
                  No stops yet
                </div>
                Search for venues above or click pins on the map to build your trail.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{
                  fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: 'var(--color-muted)', fontFamily: 'var(--font-body)', fontWeight: 600, marginBottom: 4,
                }}>
                  {stops.length} stop{stops.length !== 1 ? 's' : ''}
                </div>

                {stops.map((stop, i) => {
                  const color = VERTICAL_COLORS[stop.vertical] || '#5F8A7E'
                  return (
                    <div key={stop.id} style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 4, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: '50%', background: color,
                          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, flexShrink: 0, fontFamily: 'var(--font-body)',
                        }}>
                          {i + 1}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink)',
                            fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {stop.name}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
                            <span style={{
                              fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                              textTransform: 'uppercase', color, fontFamily: 'var(--font-body)',
                            }}>
                              {getVerticalBadge(stop.vertical)}
                            </span>
                            {stop.region && (
                              <span style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>
                                {stop.region}
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                          <button
                            onClick={() => moveStop(i, -1)} disabled={i === 0}
                            style={{
                              width: 22, height: 22, border: '1px solid var(--color-border)',
                              background: 'transparent', color: 'var(--color-muted)', borderRadius: 3,
                              fontSize: 10, cursor: i === 0 ? 'not-allowed' : 'pointer',
                              opacity: i === 0 ? 0.35 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            &uarr;
                          </button>
                          <button
                            onClick={() => moveStop(i, 1)} disabled={i === stops.length - 1}
                            style={{
                              width: 22, height: 22, border: '1px solid var(--color-border)',
                              background: 'transparent', color: 'var(--color-muted)', borderRadius: 3,
                              fontSize: 10, cursor: i === stops.length - 1 ? 'not-allowed' : 'pointer',
                              opacity: i === stops.length - 1 ? 0.35 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            &darr;
                          </button>
                          <button
                            onClick={() => removeStop(stop.id)}
                            style={{
                              width: 22, height: 22, border: '1px solid var(--color-border)',
                              background: 'transparent', color: 'var(--color-muted)', borderRadius: 3,
                              fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            &times;
                          </button>
                        </div>
                      </div>

                      {/* Notes input */}
                      <input
                        value={stopNotes[stop.id] || ''}
                        onChange={e => setStopNotes(prev => ({ ...prev, [stop.id]: e.target.value }))}
                        placeholder="Add a note..."
                        style={{
                          width: '100%', marginTop: 6, padding: '5px 0',
                          fontFamily: 'var(--font-body)', fontSize: 12,
                          color: 'var(--color-muted)', background: 'transparent',
                          border: 'none', borderBottom: '1px solid var(--color-border)',
                          outline: 'none', boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Map */}
        <div
          className={`trail-map${mobileTab === 'map' ? ' mobile-active' : ''}`}
          style={{ position: 'relative', flex: 1, height: '100%' }}
        >
          <div ref={mapRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />

          {/* Legend */}
          <div style={{
            position: 'absolute', bottom: 40, left: 12, background: 'rgba(250,247,242,0.97)',
            border: '1px solid var(--color-border)', borderRadius: 4, padding: '12px 14px', zIndex: 5,
          }}>
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--color-muted)', marginBottom: 8, fontFamily: 'var(--font-body)',
            }}>
              Verticals
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
              {Object.entries(VERTICAL_COLORS).map(([key, color]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: 'var(--color-ink)', fontFamily: 'var(--font-body)' }}>
                    {getVerticalBadge(key)}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="24" height="8" style={{ flexShrink: 0 }}>
                  <line x1="0" y1="4" x2="24" y2="4" stroke="#5F8A7E" strokeWidth="2.5" strokeDasharray="4 3" />
                </svg>
                <span style={{ fontSize: 10, color: 'var(--color-ink)', fontFamily: 'var(--font-body)' }}>Route</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Popup and responsive styles */}
      <style>{`
        .mapboxgl-popup-content {
          border-radius: 4px !important;
          padding: 14px 16px !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.12) !important;
          border: 1px solid var(--color-border) !important;
          background: var(--color-cream) !important;
        }
        .mapboxgl-popup-tip { display: none !important; }
        .mapboxgl-popup-close-button { font-size: 16px; color: var(--color-muted); padding: 4px 8px; }

        @media (max-width: 768px) {
          .trail-mobile-tabs { display: flex !important; background: var(--color-cream); border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
          .trail-body { flex-direction: column; position: relative; }
          .trail-sidebar { width: 100% !important; flex-shrink: 0 !important; border-right: none !important; display: none !important; flex: 1; min-height: 0; overflow-y: auto; }
          .trail-sidebar.mobile-active { display: flex !important; }
          .trail-map { position: absolute !important; inset: 0 !important; visibility: hidden !important; pointer-events: none !important; }
          .trail-map.mobile-active { visibility: visible !important; pointer-events: auto !important; position: relative !important; flex: 1 !important; height: 100% !important; }
        }
      `}</style>
    </div>
  )
}

function buildPopupHTML(venue, isAdded) {
  const color = VERTICAL_COLORS[venue.vertical] || '#5F8A7E'
  const badge = getVerticalBadge(venue.vertical)
  const escapedName = (venue.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;')
  const escapedRegion = (venue.region || '').replace(/'/g, "\\'").replace(/"/g, '&quot;')

  return `<div style="font-family:system-ui,sans-serif;padding:2px 0;max-width:260px;">
    <div style="font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${color};margin-bottom:6px;">${badge}</div>
    <div style="font-family:Georgia,serif;font-size:16px;color:#1a1614;margin-bottom:3px;line-height:1.3;">${venue.name}</div>
    ${venue.region ? `<div style="font-size:11px;color:#9a8878;margin-bottom:10px;">${venue.region}</div>` : ''}
    ${isAdded
      ? `<button data-venue-id="${venue.id}" data-action="remove" style="width:100%;padding:7px 0;background:transparent;border:1px solid #5F8A7E;color:#5F8A7E;border-radius:3px;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;cursor:pointer;">Remove from trail</button>`
      : `<button onclick="window.__trailBuilderAdd('${venue.id}','${escapedName}','${venue.vertical}','${escapedRegion}','${venue.latitude}','${venue.longitude}','${venue.slug}')" style="width:100%;padding:7px 0;background:#5F8A7E;border:none;color:#fff;border-radius:3px;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;cursor:pointer;">+ Add to trail</button>`
    }
  </div>`
}

function attachPopupListeners(popup) {
  popup.on('open', () => {
    const el = popup.getElement()
    if (!el) return
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-venue-id]')
      if (!btn) return
      const id = btn.getAttribute('data-venue-id')
      const action = btn.getAttribute('data-action')
      if (action === 'remove') window.__trailBuilderRemove(id)
    })
  })
}

export default function TrailBuilderPage() {
  return (
    <Suspense fallback={
      <div style={{ background: 'var(--color-cream)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)' }}>Loading...</div>
      </div>
    }>
      <TrailBuilderInner />
    </Suspense>
  )
}
