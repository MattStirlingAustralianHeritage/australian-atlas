'use client'

import { useState, useRef, useEffect } from 'react'
import { useLocation } from './LocationProvider'

const GOLD = '#C4973B'

/**
 * LocationBar — compact location indicator for the nav bar.
 * Shows current location name with option to detect or change.
 */
export default function LocationBar() {
  const { location, status, detectLocation, setManualLocation, clearLocation, isReady } = useLocation()
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [searching, setSearching] = useState(false)
  const inputRef = useRef(null)
  const panelRef = useRef(null)
  const debounceRef = useRef(null)

  // Close panel on outside click
  useEffect(() => {
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setSearchOpen(false)
      }
    }
    if (searchOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [searchOpen])

  // Focus input when opened
  useEffect(() => {
    if (searchOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [searchOpen])

  // Debounced forward geocode search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query || query.length < 2) {
      setSuggestions([])
      return
    }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/mapbox/geocode?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setSuggestions(data.features || [])
      } catch {
        setSuggestions([])
      }
      setSearching(false)
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  function handleSelect(feature) {
    const [lng, lat] = feature.center
    setManualLocation(lat, lng, feature.text || feature.place_name)
    setSearchOpen(false)
    setQuery('')
    setSuggestions([])
  }

  // Debug: log state transitions
  useEffect(() => {
    console.log('[Atlas LocationBar] status:', status, 'isReady:', isReady, 'location:', location)
  }, [status, isReady, location])

  // ── Not ready: show detect button ──
  if (!isReady) {
    if (status === 'detecting') {
      return (
        <span style={{
          fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 400,
          color: 'var(--color-muted)', whiteSpace: 'nowrap',
        }}>
          Locating...
        </span>
      )
    }

    // Don't show anything in denied/overseas/unavailable states
    if (status !== 'idle') return null

    return (
      <button
        onClick={detectLocation}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
          fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 400,
          color: 'var(--color-muted)', whiteSpace: 'nowrap',
        }}
        title="Use my location"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
        </svg>
        Near me
      </button>
    )
  }

  // ── Location ready: show name with change option ──
  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setSearchOpen(!searchOpen)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
          fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 400,
          color: GOLD, whiteSpace: 'nowrap', maxWidth: '160px',
        }}
        title={`Location: ${location?.name || 'Set'}. Click to change.`}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <span style={{
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {location?.name || 'Your location'}
        </span>
      </button>

      {searchOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '8px',
          width: '280px',
          background: '#fff',
          borderRadius: '10px',
          border: '1px solid var(--color-border)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
          zIndex: 200,
          overflow: 'hidden',
        }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-border)' }}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search a town or city..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                width: '100%',
                border: 'none',
                outline: 'none',
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                color: 'var(--color-ink)',
                background: 'transparent',
              }}
            />
          </div>

          {suggestions.length > 0 && (
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {suggestions.map((f, i) => (
                <button
                  key={i}
                  onClick={() => handleSelect(f)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '8px 12px', border: 'none', background: 'none',
                    fontFamily: 'var(--font-body)', fontSize: '13px',
                    color: 'var(--color-ink)', cursor: 'pointer',
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'var(--color-cream)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  {f.place_name}
                </button>
              ))}
            </div>
          )}

          <div style={{
            padding: '8px 12px',
            borderTop: suggestions.length > 0 ? '1px solid var(--color-border)' : 'none',
            display: 'flex', gap: '12px',
          }}>
            <button
              onClick={() => {
                detectLocation()
                setSearchOpen(false)
              }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 500,
                color: GOLD, padding: '4px 0',
              }}
            >
              Use my location
            </button>
            <button
              onClick={() => {
                clearLocation()
                setSearchOpen(false)
              }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 400,
                color: 'var(--color-muted)', padding: '4px 0',
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
