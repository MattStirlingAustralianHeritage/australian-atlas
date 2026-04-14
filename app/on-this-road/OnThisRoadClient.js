'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import './on-this-road.css'

const RouteMap = dynamic(() => import('./RouteMap'), { ssr: false })

const VERTICAL_COLORS = {
  sba: '#6b3a2a',
  collection: '#5a6b7c',
  craft: '#7c6b5a',
  fine_grounds: '#5F8A7E',
  rest: '#8a5a6b',
  field: '#5a7c5a',
  corner: '#7c5a7c',
  found: '#5a7c6b',
  table: '#7c6b5a',
}

const VERTICAL_NAMES = {
  sba: 'Small Batch',
  collection: 'Culture',
  craft: 'Craft',
  fine_grounds: 'Fine Grounds',
  rest: 'Rest',
  field: 'Field',
  corner: 'Corner',
  found: 'Found',
  table: 'Table',
}

const TIME_OPTIONS = [
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
  { value: '120', label: '2 hours' },
  { value: 'all', label: 'As long as it takes' },
]

// ---- Autocomplete input with Mapbox geocoding ----

function PlaceInput({ value, onChange, placeholder, label }) {
  const [query, setQuery] = useState(value || '')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const debounceRef = useRef(null)

  const fetchSuggestions = useCallback((q) => {
    if (!q || q.length < 3) {
      setSuggestions([])
      return
    }
    fetch(`/api/mapbox/geocode?q=${encodeURIComponent(q)}`)
      .then(res => res.json())
      .then(data => {
        if (data.features) {
          setSuggestions(data.features.slice(0, 5).map(f => ({
            place_name: f.place_name,
            text: f.text,
          })))
        }
      })
      .catch(() => setSuggestions([]))
  }, [])

  const handleChange = (e) => {
    const val = e.target.value
    setQuery(val)
    onChange(val)
    setShowSuggestions(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300)
  }

  const selectSuggestion = (s) => {
    setQuery(s.place_name)
    onChange(s.place_name)
    setSuggestions([])
    setShowSuggestions(false)
  }

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <label style={{
        fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--color-muted)', display: 'block', marginBottom: 6,
      }}>
        {label}
      </label>
      <input
        type="text"
        value={query}
        onChange={handleChange}
        onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '12px 16px', fontSize: 15,
          fontFamily: 'var(--font-body)', fontWeight: 300,
          color: 'var(--color-ink)', background: 'var(--color-card-bg, #fff)',
          border: '1px solid var(--color-border)', borderRadius: 8,
          outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box',
        }}
      />
      {showSuggestions && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: 'var(--color-card-bg, #fff)', border: '1px solid var(--color-border)',
          borderRadius: 8, marginTop: 4, zIndex: 100,
          boxShadow: '0 8px 24px rgba(0,0,0,0.1)', overflow: 'hidden',
        }}>
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s) }}
              style={{
                display: 'block', width: '100%', padding: '10px 16px',
                fontSize: 14, fontFamily: 'var(--font-body)', fontWeight: 300,
                color: 'var(--color-ink)', background: 'transparent', border: 'none',
                borderBottom: i < suggestions.length - 1 ? '1px solid var(--color-border)' : 'none',
                textAlign: 'left', cursor: 'pointer',
              }}
            >
              {s.place_name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Loading animation ----

function LoadingState() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '80px 20px', textAlign: 'center',
    }}>
      <div style={{
        width: 120, height: 3, background: 'var(--color-border)',
        borderRadius: 2, overflow: 'hidden', marginBottom: 24, position: 'relative',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'var(--color-accent, #B87333)',
          animation: 'roadLine 2s ease-in-out infinite',
        }} />
      </div>
      <p style={{
        fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400,
        fontStyle: 'italic', color: 'var(--color-ink)', margin: 0,
      }}>
        Finding places along the way...
      </p>
      <p style={{
        fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
        color: 'var(--color-muted)', marginTop: 8,
      }}>
        Mapping the route and discovering independent stops
      </p>
    </div>
  )
}

// ---- Short trip message ----

function ShortTripMessage({ message }) {
  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
      <p style={{
        fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400,
        fontStyle: 'italic', color: 'var(--color-ink)', margin: '0 0 12px', lineHeight: 1.4,
      }}>
        {message || "That\u2019s a short trip \u2014 not much road to explore."}
      </p>
      <p style={{
        fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
        color: 'var(--color-muted)', margin: '0 0 24px', lineHeight: 1.6,
      }}>
        On This Road works best for drives of 20km or more. Try the Long Weekend Engine for places near your destination.
      </p>
      <Link href="/long-weekend" style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '12px 28px', borderRadius: 8, fontSize: 14,
        fontFamily: 'var(--font-body)', fontWeight: 500, color: '#fff',
        background: 'var(--color-ink)', textDecoration: 'none', minHeight: 44,
      }}>
        Try the Long Weekend Engine
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
      </Link>
    </div>
  )
}

// ---- Long trip warning banner ----

function LongTripBanner({ routeDistanceKm, restListings }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{
      padding: '16px 20px', borderRadius: 12,
      background: 'linear-gradient(135deg, #2d2a24 0%, #3a2a35 100%)',
      border: '1px solid rgba(138, 90, 107, 0.3)', marginBottom: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d4a843" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
        <div style={{ flex: 1 }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500, color: '#fff', margin: '0 0 4px' }}>
            This is a long drive ({routeDistanceKm.toLocaleString()} km)
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.5 }}>
            Consider breaking this into days. We found {restListings.length} boutique stays along the route.
          </p>
        </div>
      </div>

      {restListings.length > 0 && (
        <>
          <button onClick={() => setExpanded(!expanded)} style={{
            display: 'flex', alignItems: 'center', gap: 6, marginTop: 12,
            padding: '6px 12px', borderRadius: 6, fontSize: 12,
            fontFamily: 'var(--font-body)', fontWeight: 500, color: '#d4a843',
            background: 'rgba(212, 168, 67, 0.1)', border: '1px solid rgba(212, 168, 67, 0.2)', cursor: 'pointer',
          }}>
            {expanded ? 'Hide' : 'Show'} overnight stops
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {expanded && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {restListings.map((stay, i) => (
                <a key={stay.listing_id || i} href={`/place/${stay.slug}`} target="_blank" rel="noopener noreferrer" style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  borderRadius: 8, background: 'rgba(255,255,255,0.05)', textDecoration: 'none',
                }}>
                  {stay.hero_image_url && (
                    <img src={stay.hero_image_url} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} loading="lazy" />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 400, color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {stay.listing_name}
                    </p>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 300, color: 'rgba(255,255,255,0.5)', margin: '2px 0 0' }}>
                      {stay.region || stay.suburb} &middot; {stay.position_km} km into route
                    </p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---- Cluster section header ----

function ClusterHeader({ name, count }) {
  return (
    <div style={{ padding: '16px 0 8px', borderBottom: '1px solid var(--color-border)' }}>
      <h3 style={{
        fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 400,
        fontStyle: 'italic', color: 'var(--color-ink)', margin: 0,
      }}>
        {name}
      </h3>
      <p style={{
        fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 400,
        color: 'var(--color-muted)', margin: '2px 0 0', letterSpacing: '0.03em',
      }}>
        {count} {count === 1 ? 'stop' : 'stops'}
      </p>
    </div>
  )
}

// ---- Stop card ----

function StopCard({ stop, index }) {
  const vertColor = VERTICAL_COLORS[stop.vertical] || '#5F8A7E'
  const vertName = VERTICAL_NAMES[stop.vertical] || stop.vertical
  const hasImage = stop.hero_image_url && !stop.hero_image_url.includes('unsplash.com')
  const isRest = stop.vertical === 'rest'

  return (
    <div style={{
      display: 'flex', gap: 16, padding: '16px 0 16px 16px',
      borderBottom: '1px solid var(--color-border)',
      borderLeft: `3px solid ${vertColor}`,
    }}>
      {/* Number badge */}
      <div style={{
        width: 32, height: 32, borderRadius: '50%', background: vertColor,
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13,
        flexShrink: 0, marginTop: 2,
      }}>
        {index + 1}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <a href={`/place/${stop.slug}`} target="_blank" rel="noopener noreferrer" style={{
            fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400,
            color: 'var(--color-ink)', textDecoration: 'none', lineHeight: 1.3,
          }}>
            {stop.listing_name}
          </a>
          {isRest && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
              borderRadius: 4, fontSize: 10, fontWeight: 600,
              fontFamily: 'var(--font-body)', backgroundColor: '#8a5a6b',
              color: '#fff', textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              Stay here
            </span>
          )}
        </div>

        {/* Vertical badge + suburb + km */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', padding: '3px 10px',
            borderRadius: 99, fontSize: 11, fontWeight: 600,
            fontFamily: 'var(--font-body)', backgroundColor: vertColor,
            color: '#fff', textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            {vertName}
          </span>
          {stop.suburb && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 300, color: 'var(--color-muted)' }}>
              {stop.suburb}
            </span>
          )}
          {stop.position_km != null && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 300, color: 'var(--color-muted)' }}>
              {stop.position_km} km
            </span>
          )}
        </div>

        {/* Reason */}
        {(stop.reason || stop.notes) && (
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
            color: 'var(--color-ink)', margin: '8px 0 0', lineHeight: 1.5, fontStyle: 'italic',
          }}>
            {stop.reason || stop.notes}
          </p>
        )}

        {/* View listing link */}
        <a href={`/place/${stop.slug}`} target="_blank" rel="noopener noreferrer" style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8,
          fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 400,
          color: 'var(--color-muted)', textDecoration: 'none',
        }}>
          View listing
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </a>
      </div>

      {/* Thumbnail */}
      {hasImage && (
        <div style={{ width: 72, height: 72, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
          <img src={stop.hero_image_url} alt={stop.listing_name} loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}
    </div>
  )
}

// ---- Main component ----

export default function OnThisRoadClient() {
  const [startPlace, setStartPlace] = useState('')
  const [endPlace, setEndPlace] = useState('')
  const [timeAvailable, setTimeAvailable] = useState('120')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const handleSwap = () => {
    const tmp = startPlace
    setStartPlace(endPlace)
    setEndPlace(tmp)
  }

  const handleSubmit = async (e) => {
    if (e) e.preventDefault()
    if (!startPlace.trim() || !endPlace.trim()) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/on-this-road', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: startPlace, end: endPlace, timeAvailable }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        return
      }

      setResult(data)
    } catch {
      setError('Could not connect. Please check your internet and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* Header */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '48px 20px 0' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'var(--color-muted)', margin: '0 0 12px',
        }}>
          Road Trip Planner
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400,
          fontSize: 'clamp(32px, 5vw, 48px)', lineHeight: 1.1, color: 'var(--color-ink)', margin: 0,
        }}>
          On This Road
        </h1>
        <p style={{
          fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400,
          fontStyle: 'italic', color: 'var(--color-muted)', margin: '8px 0 0', lineHeight: 1.5,
        }}>
          Every drive is better with somewhere worth stopping.
        </p>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
          color: 'var(--color-muted)', margin: '8px 0 0', maxWidth: 500, lineHeight: 1.6,
        }}>
          You know where you&apos;re going. We&apos;ll find what&apos;s worth seeing on the way.
        </p>
      </div>

      {/* Form */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px' }}>
        <form onSubmit={handleSubmit}>
          {/* Start / Swap / End inputs */}
          <div className="otr-inputs" style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <PlaceInput
              key={`start-${endPlace === startPlace ? '0' : '1'}`}
              value={startPlace}
              onChange={setStartPlace}
              placeholder="Melbourne"
              label="From"
            />
            <button type="button" className="otr-swap-btn" onClick={handleSwap} title="Swap direction">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
            <PlaceInput
              key={`end-${startPlace === endPlace ? '0' : '1'}`}
              value={endPlace}
              onChange={setEndPlace}
              placeholder="Sydney"
              label="To"
            />
          </div>

          {/* Time available pills */}
          <div style={{ marginTop: 20 }}>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'var(--color-muted)', margin: '0 0 8px',
            }}>
              Time to spare
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {TIME_OPTIONS.map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => setTimeAvailable(opt.value)}
                  style={{
                    padding: '8px 20px', borderRadius: 99, fontSize: 14,
                    fontFamily: 'var(--font-body)',
                    fontWeight: timeAvailable === opt.value ? 500 : 300,
                    color: timeAvailable === opt.value ? '#fff' : 'var(--color-ink)',
                    background: timeAvailable === opt.value ? 'var(--color-ink)' : 'transparent',
                    border: `1px solid ${timeAvailable === opt.value ? 'var(--color-ink)' : 'var(--color-border)'}`,
                    cursor: 'pointer', transition: 'all 0.2s', minHeight: 40,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button type="submit"
            disabled={loading || !startPlace.trim() || !endPlace.trim()}
            style={{
              marginTop: 24, padding: '14px 32px', fontSize: 15,
              fontFamily: 'var(--font-body)', fontWeight: 500, color: '#fff',
              background: loading ? 'var(--color-muted)' : 'var(--color-ink)',
              border: 'none', borderRadius: 8,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.2s', minHeight: 48,
              opacity: (!startPlace.trim() || !endPlace.trim()) ? 0.4 : 1,
            }}
          >
            {loading ? 'Planning...' : 'Show me what\u2019s on this road'}
          </button>
        </form>
      </div>

      {/* Error */}
      {error && (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px' }}>
          <div style={{
            padding: '16px 20px', borderRadius: 8,
            background: '#fef2f2', border: '1px solid #fecaca',
            fontFamily: 'var(--font-body)', fontSize: 14, color: '#991b1b',
          }}>
            {error}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && <LoadingState />}

      {/* Short trip redirect */}
      {result && result.short_trip && !loading && (
        <ShortTripMessage message={result.message} />
      )}

      {/* Results */}
      {result && !result.short_trip && !loading && (
        <ResultsView result={result} />
      )}
    </div>
  )
}

// ---- Results view ----

function ResultsView({ result }) {
  const {
    title, stops, route_geometry, total_listings_found,
    route_duration_minutes, route_distance_km, intro,
    additional_stop_hours, coverage_gaps, is_long_trip,
    rest_listings, start_name, end_name, buffer_expanded,
  } = result

  const [mobileView, setMobileView] = useState('list')

  // Empty state
  if (!stops || stops.length === 0) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
        <p style={{
          fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400,
          fontStyle: 'italic', color: 'var(--color-ink)', margin: '0 0 12px',
        }}>
          We don&apos;t have much on this route yet.
        </p>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
          color: 'var(--color-muted)', margin: '0 0 24px', lineHeight: 1.6,
        }}>
          The network is growing. Know a place that should be here?
        </p>
        <Link href="/suggest" style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '12px 24px', borderRadius: 8, fontSize: 14,
          fontFamily: 'var(--font-body)', fontWeight: 500,
          color: 'var(--color-ink)', border: '1px solid var(--color-border)',
          textDecoration: 'none', background: 'transparent',
        }}>
          Suggest a place
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    )
  }

  // Group stops by cluster
  const clusteredStops = []
  let currentCluster = null
  for (const stop of stops) {
    const clusterName = stop.cluster || 'Along the way'
    if (clusterName !== currentCluster) {
      clusteredStops.push({ name: clusterName, stops: [] })
      currentCluster = clusterName
    }
    clusteredStops[clusteredStops.length - 1].stops.push(stop)
  }

  const trailStopIds = stops.map(s => s.listing_id).filter(Boolean).join(',')

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px 60px' }}>
      {/* Route title + intro */}
      <div style={{ padding: '32px 0 24px', borderBottom: '1px solid var(--color-border)' }}>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400,
          fontSize: 'clamp(24px, 4vw, 36px)', lineHeight: 1.2,
          color: 'var(--color-ink)', margin: 0,
        }}>
          {title}
        </h2>

        {/* Route stats */}
        <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
          {route_distance_km && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300, color: 'var(--color-muted)' }}>
              {route_distance_km.toLocaleString()} km
            </span>
          )}
          {route_duration_minutes && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300, color: 'var(--color-muted)' }}>
              ~{Math.round(route_duration_minutes / 60)} hr drive
            </span>
          )}
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300, color: 'var(--color-muted)' }}>
            {stops.length} stops
          </span>
          {total_listings_found > 0 && total_listings_found !== stops.length && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300, color: 'var(--color-muted)' }}>
              {total_listings_found} places found along route
            </span>
          )}
        </div>

        {/* Editorial intro */}
        {intro && (
          <p style={{
            fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 400,
            fontStyle: 'italic', color: 'var(--color-ink)', margin: '16px 0 0',
            lineHeight: 1.6, maxWidth: 700, opacity: 0.85,
          }}>
            {intro}
          </p>
        )}

        {/* Additional stop time */}
        {additional_stop_hours > 0 && (
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 400,
            color: 'var(--color-accent, #B87333)', margin: '10px 0 0',
          }}>
            With your stops, add approximately {additional_stop_hours} {additional_stop_hours === 1 ? 'hour' : 'hours'} to the drive.
          </p>
        )}

        {/* Buffer expanded notice */}
        {buffer_expanded && (
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 400,
            color: 'var(--color-muted)', margin: '8px 0 0', fontStyle: 'italic',
          }}>
            We expanded our search to find you more stops.
          </p>
        )}
      </div>

      {/* Long trip warning */}
      {is_long_trip && rest_listings && rest_listings.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <LongTripBanner routeDistanceKm={route_distance_km} restListings={rest_listings} />
        </div>
      )}

      {/* Mobile toggle */}
      <div className="otr-mobile-toggle" style={{
        gap: 0, marginTop: 16, borderRadius: 8, overflow: 'hidden',
        border: '1px solid var(--color-border)', width: 'fit-content',
      }}>
        <button onClick={() => setMobileView('list')} style={{
          padding: '8px 20px', fontSize: 13, fontFamily: 'var(--font-body)', fontWeight: 500,
          color: mobileView === 'list' ? '#fff' : 'var(--color-ink)',
          background: mobileView === 'list' ? 'var(--color-ink)' : 'transparent',
          border: 'none', cursor: 'pointer',
        }}>
          Stops
        </button>
        <button onClick={() => setMobileView('map')} style={{
          padding: '8px 20px', fontSize: 13, fontFamily: 'var(--font-body)', fontWeight: 500,
          color: mobileView === 'map' ? '#fff' : 'var(--color-ink)',
          background: mobileView === 'map' ? 'var(--color-ink)' : 'transparent',
          border: 'none', borderLeft: '1px solid var(--color-border)', cursor: 'pointer',
        }}>
          Map
        </button>
      </div>

      {/* Split layout */}
      <div className="otr-split" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0, marginTop: 8 }}>
        {/* Stop list */}
        {mobileView === 'list' && (
          <div>
            {clusteredStops.map((cluster, ci) => (
              <div key={ci}>
                {clusteredStops.length > 1 && (
                  <ClusterHeader name={cluster.name} count={cluster.stops.length} />
                )}
                {cluster.stops.map((stop, si) => {
                  const globalIndex = clusteredStops.slice(0, ci).reduce((sum, c) => sum + c.stops.length, 0) + si
                  return <StopCard key={stop.listing_id || globalIndex} stop={stop} index={globalIndex} />
                })}
              </div>
            ))}

            {/* Footer CTAs */}
            <div style={{ marginTop: 40, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <Link href={`/trails/builder${trailStopIds ? `?stops=${trailStopIds}` : ''}`} style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '14px 28px', borderRadius: 8, fontSize: 14,
                fontFamily: 'var(--font-body)', fontWeight: 500, color: '#fff',
                background: 'var(--color-ink)', textDecoration: 'none', minHeight: 48,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
                </svg>
                Build a full trail
              </Link>
              {end_name && (
                <Link href={`/long-weekend?destination=${encodeURIComponent(end_name)}`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '14px 28px', borderRadius: 8, fontSize: 14,
                  fontFamily: 'var(--font-body)', fontWeight: 500,
                  color: 'var(--color-ink)', background: 'transparent',
                  border: '1px solid var(--color-border)', textDecoration: 'none', minHeight: 48,
                }}>
                  Plan a long weekend at {end_name}
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Map column — always render on desktop, toggle on mobile */}
        <div className={mobileView === 'map' ? 'otr-map-col' : 'otr-map-col otr-mobile-map'}
          style={{
            borderRadius: 12, overflow: 'hidden',
            border: '1px solid var(--color-border)',
            minHeight: 400, marginTop: 24,
          }}
        >
          <RouteMap
            routeGeometry={route_geometry}
            stops={stops}
            coverageGaps={coverage_gaps}
            startName={start_name}
            endName={end_name}
          />
        </div>
      </div>
    </div>
  )
}
