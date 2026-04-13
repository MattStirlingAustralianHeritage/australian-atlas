'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { VERTICAL_STYLES } from '@/components/VerticalBadge'

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
  collection: 'Culture Atlas',
  craft: 'Maker Studios',
  fine_grounds: 'Fine Grounds',
  rest: 'Boutique Stays',
  field: 'Field Atlas',
  corner: 'Corner Atlas',
  found: 'Found Atlas',
  table: 'Table Atlas',
}

const TIME_OPTIONS = [
  { value: '1', label: '1 hour' },
  { value: '2', label: '2 hours' },
  { value: '4', label: '4 hours' },
  { value: 'all_day', label: 'All day' },
]

// ---- Autocomplete input with Mapbox geocoding ----

function PlaceInput({ value, onChange, placeholder, label }) {
  const [query, setQuery] = useState(value || '')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const debounceRef = useRef(null)
  const inputRef = useRef(null)

  const fetchSuggestions = useCallback((q) => {
    if (!q || q.length < 3) {
      setSuggestions([])
      return
    }
    const url = `/api/mapbox/geocode?q=${encodeURIComponent(q)}`
    fetch(url)
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
        fontFamily: 'var(--font-body)',
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--color-muted)',
        display: 'block',
        marginBottom: 6,
      }}>
        {label}
      </label>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleChange}
        onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '12px 16px',
          fontSize: 15,
          fontFamily: 'var(--font-body)',
          fontWeight: 300,
          color: 'var(--color-ink)',
          background: 'var(--color-card-bg, #fff)',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          outline: 'none',
          transition: 'border-color 0.2s',
          boxSizing: 'border-box',
        }}
        onFocusCapture={e => e.target.style.borderColor = 'var(--color-accent, #B87333)'}
        onBlurCapture={e => e.target.style.borderColor = 'var(--color-border)'}
      />
      {showSuggestions && suggestions.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: 'var(--color-card-bg, #fff)',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          marginTop: 4,
          zIndex: 100,
          boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
          overflow: 'hidden',
        }}>
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={() => selectSuggestion(s)}
              style={{
                display: 'block',
                width: '100%',
                padding: '10px 16px',
                fontSize: 14,
                fontFamily: 'var(--font-body)',
                fontWeight: 300,
                color: 'var(--color-ink)',
                background: 'transparent',
                border: 'none',
                borderBottom: i < suggestions.length - 1 ? '1px solid var(--color-border)' : 'none',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.target.style.background = 'var(--color-cream, #f5f2ec)'}
              onMouseLeave={e => e.target.style.background = 'transparent'}
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
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '80px 20px',
      textAlign: 'center',
    }}>
      <style>{`
        @keyframes roadLine {
          0% { transform: scaleX(0); transform-origin: left; }
          50% { transform: scaleX(1); transform-origin: left; }
          50.1% { transform: scaleX(1); transform-origin: right; }
          100% { transform: scaleX(0); transform-origin: right; }
        }
      `}</style>
      <div style={{
        width: 120,
        height: 3,
        background: 'var(--color-border)',
        borderRadius: 2,
        overflow: 'hidden',
        marginBottom: 24,
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--color-accent, #B87333)',
          animation: 'roadLine 2s ease-in-out infinite',
        }} />
      </div>
      <p style={{
        fontFamily: 'var(--font-display)',
        fontSize: 20,
        fontWeight: 400,
        fontStyle: 'italic',
        color: 'var(--color-ink)',
        margin: 0,
      }}>
        Finding places along the way...
      </p>
      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: 13,
        fontWeight: 300,
        color: 'var(--color-muted)',
        marginTop: 8,
      }}>
        Mapping the route and discovering independent stops
      </p>
    </div>
  )
}

// ---- Stop card ----

function StopCard({ stop, index }) {
  const vertColor = VERTICAL_COLORS[stop.vertical] || '#5F8A7E'
  const vertName = VERTICAL_NAMES[stop.vertical] || stop.vertical
  const vertStyle = VERTICAL_STYLES[stop.vertical]
  const hasImage = stop.hero_image_url && !stop.hero_image_url.includes('unsplash.com')

  return (
    <div style={{
      display: 'flex',
      gap: 16,
      padding: '20px 0',
      borderBottom: '1px solid var(--color-border)',
    }}>
      {/* Number badge */}
      <div style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: vertColor,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-body)',
        fontWeight: 600,
        fontSize: 13,
        flexShrink: 0,
        marginTop: 2,
      }}>
        {index + 1}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Time from previous */}
        {stop.estimated_minutes_from_previous && (
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            fontWeight: 400,
            color: 'var(--color-muted)',
            margin: '0 0 4px',
            letterSpacing: '0.03em',
          }}>
            {stop.estimated_minutes_from_previous} min from previous
          </p>
        )}

        {/* Name */}
        <Link
          href={`/place/${stop.slug}`}
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 18,
            fontWeight: 400,
            color: 'var(--color-ink)',
            textDecoration: 'none',
            lineHeight: 1.3,
            display: 'block',
          }}
          onMouseEnter={e => e.target.style.color = vertColor}
          onMouseLeave={e => e.target.style.color = 'var(--color-ink)'}
        >
          {stop.listing_name}
        </Link>

        {/* Vertical badge + region */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          {vertStyle && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '3px 10px',
              borderRadius: 99,
              fontSize: 11,
              fontWeight: 500,
              fontFamily: 'var(--font-body)',
              backgroundColor: vertStyle.bg,
              color: vertStyle.text,
            }}>
              {vertName}
            </span>
          )}
          {stop.cluster && (
            <span style={{
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              fontWeight: 300,
              color: 'var(--color-muted)',
            }}>
              {stop.cluster}
            </span>
          )}
        </div>

        {/* Notes */}
        {stop.notes && (
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            fontWeight: 300,
            color: 'var(--color-ink)',
            margin: '8px 0 0',
            lineHeight: 1.5,
            fontStyle: 'italic',
          }}>
            {stop.notes}
          </p>
        )}
      </div>

      {/* Thumbnail */}
      {hasImage && (
        <div style={{
          width: 72,
          height: 72,
          borderRadius: 8,
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          <img
            src={stop.hero_image_url}
            alt={stop.listing_name}
            loading="lazy"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        </div>
      )}
    </div>
  )
}

// ---- Main component ----

export default function OnThisRoadClient() {
  const [startPlace, setStartPlace] = useState('')
  const [endPlace, setEndPlace] = useState('')
  const [timeAvailable, setTimeAvailable] = useState('2')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!startPlace.trim() || !endPlace.trim()) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/on-this-road', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: startPlace,
          end: endPlace,
          timeAvailable,
        }),
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
      <div style={{
        maxWidth: 900,
        margin: '0 auto',
        padding: '48px 20px 0',
      }}>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--color-muted)',
          margin: '0 0 12px',
        }}>
          Road Trip Planner
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          fontSize: 'clamp(32px, 5vw, 48px)',
          lineHeight: 1.1,
          color: 'var(--color-ink)',
          margin: 0,
        }}>
          On This Road
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 16,
          fontWeight: 300,
          color: 'var(--color-muted)',
          margin: '12px 0 0',
          maxWidth: 500,
          lineHeight: 1.6,
        }}>
          Discover independent makers, stays, and cultural spaces between any two points in Australia.
        </p>
      </div>

      {/* Form */}
      <div style={{
        maxWidth: 900,
        margin: '0 auto',
        padding: '32px 20px',
      }}>
        <form onSubmit={handleSubmit}>
          {/* Start / End inputs */}
          <div style={{
            display: 'flex',
            gap: 16,
            flexWrap: 'wrap',
          }}>
            <style>{`
              @media (max-width: 640px) {
                .otr-inputs { flex-direction: column !important; }
                .otr-inputs > div { flex: unset !important; }
              }
            `}</style>
            <div className="otr-inputs" style={{ display: 'flex', gap: 16, flex: 1 }}>
              <PlaceInput
                value={startPlace}
                onChange={setStartPlace}
                placeholder="Melbourne"
                label="From"
              />
              <PlaceInput
                value={endPlace}
                onChange={setEndPlace}
                placeholder="Sydney"
                label="To"
              />
            </div>
          </div>

          {/* Time available pills */}
          <div style={{ marginTop: 20 }}>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-muted)',
              margin: '0 0 8px',
            }}>
              Time to spare
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {TIME_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTimeAvailable(opt.value)}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 99,
                    fontSize: 14,
                    fontFamily: 'var(--font-body)',
                    fontWeight: timeAvailable === opt.value ? 500 : 300,
                    color: timeAvailable === opt.value ? '#fff' : 'var(--color-ink)',
                    background: timeAvailable === opt.value ? 'var(--color-ink)' : 'transparent',
                    border: `1px solid ${timeAvailable === opt.value ? 'var(--color-ink)' : 'var(--color-border)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    minHeight: 40,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !startPlace.trim() || !endPlace.trim()}
            style={{
              marginTop: 24,
              padding: '14px 32px',
              fontSize: 15,
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
              color: '#fff',
              background: loading ? 'var(--color-muted)' : 'var(--color-ink)',
              border: 'none',
              borderRadius: 8,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.2s',
              minHeight: 48,
            }}
            onMouseEnter={e => { if (!loading) e.target.style.opacity = '0.85' }}
            onMouseLeave={e => e.target.style.opacity = '1'}
          >
            {loading ? 'Planning...' : 'Show me what\u2019s on this road'}
          </button>
        </form>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          maxWidth: 900,
          margin: '0 auto',
          padding: '0 20px',
        }}>
          <div style={{
            padding: '16px 20px',
            borderRadius: 8,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            color: '#991b1b',
          }}>
            {error}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && <LoadingState />}

      {/* Results */}
      {result && !loading && (
        <ResultsView result={result} />
      )}
    </div>
  )
}

// ---- Results split view ----

function ResultsView({ result }) {
  const { title, stops, route_geometry, total_listings_found, route_duration_minutes, route_distance_km } = result

  if (!stops || stops.length === 0) {
    return (
      <div style={{
        maxWidth: 900,
        margin: '0 auto',
        padding: '40px 20px',
        textAlign: 'center',
      }}>
        <p style={{
          fontFamily: 'var(--font-display)',
          fontSize: 20,
          fontWeight: 400,
          fontStyle: 'italic',
          color: 'var(--color-ink)',
        }}>
          No independent places found along this route yet.
        </p>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          fontWeight: 300,
          color: 'var(--color-muted)',
          marginTop: 8,
        }}>
          Try a different route or a longer distance.
        </p>
      </div>
    )
  }

  return (
    <div style={{
      maxWidth: 1200,
      margin: '0 auto',
      padding: '0 20px 60px',
    }}>
      {/* Route title */}
      <div style={{
        padding: '32px 0 24px',
        borderBottom: '1px solid var(--color-border)',
        marginBottom: 0,
      }}>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          fontSize: 'clamp(24px, 4vw, 36px)',
          lineHeight: 1.2,
          color: 'var(--color-ink)',
          margin: 0,
        }}>
          {title}
        </h2>
        <div style={{
          display: 'flex',
          gap: 16,
          marginTop: 10,
          flexWrap: 'wrap',
        }}>
          <span style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 300,
            color: 'var(--color-muted)',
          }}>
            {stops.length} stops
          </span>
          {route_distance_km && (
            <span style={{
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              fontWeight: 300,
              color: 'var(--color-muted)',
            }}>
              {route_distance_km} km
            </span>
          )}
          {route_duration_minutes && (
            <span style={{
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              fontWeight: 300,
              color: 'var(--color-muted)',
            }}>
              ~{Math.round(route_duration_minutes / 60)} hr drive
            </span>
          )}
          {total_listings_found > 0 && (
            <span style={{
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              fontWeight: 300,
              color: 'var(--color-muted)',
            }}>
              {total_listings_found} places found along route
            </span>
          )}
        </div>
      </div>

      {/* Split layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: 0,
      }}>
        <style>{`
          @media (min-width: 768px) {
            .otr-split {
              grid-template-columns: 3fr 2fr !important;
              gap: 32px !important;
            }
            .otr-map-col {
              position: sticky !important;
              top: 20px !important;
              align-self: start !important;
              height: calc(100vh - 40px) !important;
            }
          }
        `}</style>
        <div className="otr-split" style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: 0,
        }}>
          {/* Stop list */}
          <div>
            {stops.map((stop, i) => (
              <StopCard key={stop.listing_id || i} stop={stop} index={i} />
            ))}

            {/* Add to trail CTA */}
            <div style={{
              marginTop: 32,
              padding: '20px 24px',
              borderRadius: 12,
              background: 'var(--color-cream, #f5f2ec)',
              border: '1px solid var(--color-border)',
              textAlign: 'center',
            }}>
              <p style={{
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                fontWeight: 400,
                color: 'var(--color-ink)',
                margin: '0 0 8px',
              }}>
                Save this route as a trail
              </p>
              <p style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                fontWeight: 300,
                color: 'var(--color-muted)',
                margin: '0 0 16px',
              }}>
                Create an account to save and share your road trips
              </p>
              <Link
                href="/trails/builder"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '12px 24px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontFamily: 'var(--font-body)',
                  fontWeight: 500,
                  color: '#fff',
                  background: 'var(--color-ink)',
                  textDecoration: 'none',
                  transition: 'opacity 0.2s',
                  minHeight: 44,
                }}
              >
                Add to trail
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>

          {/* Map column */}
          <div className="otr-map-col" style={{
            borderRadius: 12,
            overflow: 'hidden',
            border: '1px solid var(--color-border)',
            minHeight: 400,
            marginTop: 24,
          }}>
            <RouteMap
              routeGeometry={route_geometry}
              stops={stops}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
