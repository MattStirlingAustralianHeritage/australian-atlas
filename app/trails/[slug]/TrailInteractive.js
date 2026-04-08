'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import TrailMap from './TrailMap'

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A', fine_grounds: '#8A7055',
  rest: '#5A8A9A', field: '#4A7C59', corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}
const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft', fine_grounds: 'Fine Grounds',
  rest: 'Rest', field: 'Field', corner: 'Corner', found: 'Found', table: 'Table',
}

export default function TrailInteractive({ initialStops, trailRegion }) {
  const [addedStops, setAddedStops] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(true)
  const [addedIds, setAddedIds] = useState(new Set())
  const [recentlyAdded, setRecentlyAdded] = useState(new Set())
  const mapRef = useRef(null)

  // IDs already in the trail
  const existingIds = new Set(initialStops.map(s => s.listing_id).filter(Boolean))

  // Compute centre of initial stops for nearby search
  const centre = initialStops.length > 0
    ? {
        lat: initialStops.reduce((s, st) => s + parseFloat(st.venue_lat || 0), 0) / initialStops.length,
        lng: initialStops.reduce((s, st) => s + parseFloat(st.venue_lng || 0), 0) / initialStops.length,
      }
    : null

  // Fetch nearby suggestions
  useEffect(() => {
    if (!centre) { setLoadingSuggestions(false); return }
    const params = new URLSearchParams({
      lat: centre.lat.toFixed(6),
      lng: centre.lng.toFixed(6),
      radius: '30',
      limit: '8',
    })
    fetch(`/api/nearby?${params}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const venues = (data || []).filter(v => !existingIds.has(v.id))
        setSuggestions(venues.slice(0, 6))
      })
      .catch(() => setSuggestions([]))
      .finally(() => setLoadingSuggestions(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // All stops (original + added)
  const allStops = [
    ...initialStops,
    ...addedStops,
  ]

  const handleAdd = useCallback((venue) => {
    if (addedIds.has(venue.id)) return

    const newStop = {
      id: `added-${venue.id}`,
      listing_id: venue.id,
      venue_name: venue.name,
      venue_lat: venue.lat,
      venue_lng: venue.lng,
      venue_image_url: venue.hero_image_url,
      vertical: venue.vertical,
      order_index: initialStops.length + addedStops.length,
      notes: null,
      day: null,
      listings: { slug: venue.slug },
      _isNew: true,
    }

    setAddedStops(prev => [...prev, newStop])
    setAddedIds(prev => new Set(prev).add(venue.id))
    setRecentlyAdded(prev => new Set(prev).add(venue.id))

    // Clear the green confirmation after 1.5s
    setTimeout(() => {
      setRecentlyAdded(prev => {
        const next = new Set(prev)
        next.delete(venue.id)
        return next
      })
    }, 1500)

    // Tell map to add the stop
    if (mapRef.current?.addStop) {
      mapRef.current.addStop(newStop)
    }
  }, [addedIds, addedStops.length, initialStops.length])

  const visibleSuggestions = suggestions.filter(v => !addedIds.has(v.id))

  return (
    <>
      {/* Map with ref for dynamic additions */}
      <TrailMap ref={mapRef} stops={allStops} />

      {/* You might also add */}
      {!loadingSuggestions && visibleSuggestions.length > 0 && (
        <div style={{ marginTop: 20, background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '20px 20px 16px', overflow: 'hidden' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-sage)', fontFamily: 'var(--font-body)', marginBottom: 14 }}>
            You might also add
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visibleSuggestions.map((venue, i) => (
              <SuggestionCard
                key={venue.id}
                venue={venue}
                isAdded={addedIds.has(venue.id)}
                isRecentlyAdded={recentlyAdded.has(venue.id)}
                onAdd={() => handleAdd(venue)}
                index={i}
              />
            ))}
          </div>
        </div>
      )}

      {/* Added stops list */}
      {addedStops.length > 0 && (
        <div style={{ marginTop: 16, padding: '16px 20px', background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: 8 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-sage)', fontFamily: 'var(--font-body)', marginBottom: 12 }}>
            Added to trail
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {addedStops.map((stop, i) => (
              <AddedStopCard key={stop.id} stop={stop} number={initialStops.length + i + 1} />
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function SuggestionCard({ venue, isAdded, isRecentlyAdded, onAdd, index }) {
  const color = VERTICAL_COLORS[venue.vertical] || '#7A8B6F'
  const label = VERTICAL_LABELS[venue.vertical] || venue.vertical || ''

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 12px', borderRadius: 6,
        border: '1px solid var(--color-border)',
        background: 'var(--color-bg)',
        animation: `trail-suggestion-slide-in 0.3s ease ${index * 0.05}s both`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 400, color: 'var(--color-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {venue.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color, fontFamily: 'var(--font-body)' }}>
            {label}
          </span>
          {venue.distance_km != null && (
            <span style={{ fontSize: 10, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>
              {venue.distance_km < 1 ? `${Math.round(venue.distance_km * 1000)}m` : `${venue.distance_km.toFixed(1)}km`}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={onAdd}
        disabled={isAdded}
        style={{
          width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: isAdded ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 700, fontFamily: 'system-ui, sans-serif',
          background: isRecentlyAdded ? '#16a34a' : isAdded ? 'var(--color-border)' : 'var(--color-sage)',
          color: '#fff',
          transition: 'background 0.3s ease, transform 0.2s ease',
          transform: isRecentlyAdded ? 'scale(1.1)' : 'scale(1)',
          flexShrink: 0,
        }}
      >
        {isAdded ? (isRecentlyAdded ? '✓' : '✓') : '+'}
      </button>
    </div>
  )
}

function AddedStopCard({ stop, number }) {
  const color = VERTICAL_COLORS[stop.vertical] || '#7A8B6F'
  const listingSlug = stop.listings?.slug
  const venueUrl = listingSlug ? `/place/${listingSlug}` : null

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px', borderRadius: 4,
        border: '1px solid var(--color-border)',
        background: 'var(--color-bg)',
        animation: 'trail-added-slide-in 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
      }}
    >
      <div style={{
        width: 24, height: 24, borderRadius: '50%', background: color, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 11, fontFamily: 'system-ui, sans-serif', flexShrink: 0,
      }}>
        {number}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {venueUrl ? (
          <a href={venueUrl} style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--color-ink)', textDecoration: 'none' }}>
            {stop.venue_name}
          </a>
        ) : (
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--color-ink)' }}>{stop.venue_name}</span>
        )}
      </div>
      <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color, fontFamily: 'var(--font-body)' }}>
        {VERTICAL_LABELS[stop.vertical] || ''}
      </span>
    </div>
  )
}
