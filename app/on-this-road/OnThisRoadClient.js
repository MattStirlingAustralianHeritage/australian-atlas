'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  Wine, Coffee, Landmark, UtensilsCrossed, Wheat, BedDouble,
  Palette, Mountain, Compass, CornerDownLeft, ArrowUpDown,
  Check, Lock, Moon, ChevronDown, AlertTriangle, ArrowRight,
  Upload, MapPin,
} from 'lucide-react'
import './on-this-road.css'

const RouteMap = dynamic(() => import('./RouteMap'), { ssr: false })

// ── Constants ───────────────────────────────────────────────────────

const VERTICAL_COLORS = {
  sba: '#6b3a2a', collection: '#5a6b7c', craft: '#7c6b5a',
  fine_grounds: '#5F8A7E', rest: '#8a5a6b', field: '#5a7c5a',
  corner: '#7c5a7c', found: '#5a7c6b', table: '#7c6b5a',
}
const VERTICAL_NAMES = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

const TRIP_LENGTH_OPTIONS = [
  { value: 'passing_through', label: 'Just passing through' },
  { value: 'day_trip', label: 'Day trip' },
  { value: '2_days', label: '2 days' },
  { value: '3_days', label: '3 days' },
  { value: '4_plus', label: '4+ days' },
]

const DEPARTURE_OPTIONS = [
  { value: 'this_morning', label: 'This morning' },
  { value: 'this_afternoon', label: 'This afternoon' },
  { value: 'tomorrow_morning', label: 'Tomorrow morning' },
  { value: 'this_weekend', label: 'This weekend' },
]

const DETOUR_OPTIONS = [
  { value: 'on_route', label: 'Stays on route', sublabel: '15 min max detour' },
  { value: 'happy_to_detour', label: 'Happy to detour', sublabel: '30\u201345 min off-route' },
  { value: 'flexible', label: 'Flexible', sublabel: 'Show me what\u2019s worth it' },
]

const PREFERENCE_CHIPS = [
  { key: 'cellar_doors', Icon: Wine, label: 'Cellar doors & wineries' },
  { key: 'great_coffee', Icon: Coffee, label: 'Great coffee' },
  { key: 'history', Icon: Landmark, label: 'History & heritage' },
  { key: 'lunch', Icon: UtensilsCrossed, label: 'Worth stopping for lunch' },
  { key: 'producers', Icon: Wheat, label: 'Producers & farm gates' },
  { key: 'accommodation', Icon: BedDouble, label: 'Somewhere good to stay' },
  { key: 'art_makers', Icon: Palette, label: 'Art & makers' },
  { key: 'nature', Icon: Mountain, label: 'Nature & scenery' },
]

const LOADING_MESSAGES = [
  'Mapping the route and finding hidden gems\u2026',
  'Checking which cellar doors are on the way\u2026',
  'Asking locals where to stop\u2026',
  'Finding places worth pulling over for\u2026',
  'Curating your road trip\u2026',
]

// Mapbox static tile for hero background
const MAPBOX_STYLE = 'mattstirlingaustralianheritage/cmn32b0iz003401swccb7d21k'
const HERO_TILE_URL = typeof window !== 'undefined'
  ? null // Will be set from env
  : null

function getHeroTileUrl() {
  const token = typeof window !== 'undefined'
    ? (document.querySelector('meta[name="mapbox-token"]')?.content || '')
    : ''
  if (!token) return null
  return `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/static/134,-28,3.5,0/1280x400@2x?access_token=${token}`
}

// ── Place input with autocomplete ───────────────────────────────────

function PlaceInput({ value, onChange, placeholder, label }) {
  const [query, setQuery] = useState(value || '')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const debounceRef = useRef(null)

  const fetchSuggestions = useCallback((q) => {
    if (!q || q.length < 3) { setSuggestions([]); return }
    fetch(`/api/mapbox/geocode?q=${encodeURIComponent(q)}`)
      .then(res => res.json())
      .then(data => {
        if (data.features) {
          setSuggestions(data.features.slice(0, 5).map(f => ({
            place_name: f.place_name, text: f.text,
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
      <label className="otr-input-label">{label}</label>
      <input
        type="text" value={query} onChange={handleChange}
        onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder={placeholder}
        className="otr-place-input"
      />
      {showSuggestions && suggestions.length > 0 && (
        <div className="otr-suggestion-panel">
          {suggestions.map((s, i) => (
            <button key={i} type="button" className="otr-suggestion-btn"
              onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s) }}>
              {s.place_name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────

export default function OnThisRoadClient() {
  const [startPlace, setStartPlace] = useState('')
  const [endPlace, setEndPlace] = useState('')
  const [tripLength, setTripLength] = useState('day_trip')
  const [departureTiming, setDepartureTiming] = useState('tomorrow_morning')
  const [detourTolerance, setDetourTolerance] = useState('happy_to_detour')
  const [preferences, setPreferences] = useState([])
  const [surpriseMe, setSurpriseMe] = useState(false)
  const [returnDifferent, setReturnDifferent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0])
  const loadingInterval = useRef(null)
  const resultsRef = useRef(null)
  const [heroUrl] = useState(() => getHeroTileUrl())

  const isMultiDay = ['2_days', '3_days', '4_plus'].includes(tripLength)

  // Auto-select accommodation chip for multi-day
  const effectivePrefs = isMultiDay && !preferences.includes('accommodation')
    ? [...preferences, 'accommodation']
    : preferences

  const togglePref = (key) => {
    if (key === 'accommodation' && isMultiDay) return // Locked
    setPreferences(prev =>
      prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]
    )
  }

  const handleSwap = () => {
    const tmp = startPlace
    setStartPlace(endPlace)
    setEndPlace(tmp)
  }

  const handleSubmit = async (e) => {
    if (e) e.preventDefault()
    if (!startPlace.trim()) return
    if (!endPlace.trim() && !surpriseMe) return

    setLoading(true)
    setError(null)
    setResult(null)

    // Cycle loading messages
    let msgIdx = 0
    loadingInterval.current = setInterval(() => {
      msgIdx = (msgIdx + 1) % LOADING_MESSAGES.length
      setLoadingMsg(LOADING_MESSAGES[msgIdx])
    }, 3500)

    try {
      const res = await fetch('/api/on-this-road', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: startPlace,
          end: surpriseMe ? undefined : endPlace,
          tripLength,
          departureTiming,
          detourTolerance,
          preferences: effectivePrefs,
          surpriseMe,
          returnDifferentRoad: isMultiDay && returnDifferent,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        return
      }
      setResult(data)

      // Scroll to results
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    } catch (err) {
      // Surface specific error categories
      if (err.name === 'AbortError' || err.message?.includes('timeout')) {
        setError('The route is taking longer than expected to plan. Try a shorter trip or fewer preferences.')
      } else if (!navigator.onLine) {
        setError('You appear to be offline. Please check your internet connection and try again.')
      } else {
        setError('Could not reach the trip planner. Please try again in a moment.')
      }
      console.error('[on-this-road] Client error:', err)
    } finally {
      setLoading(false)
      clearInterval(loadingInterval.current)
    }
  }

  const canSubmit = startPlace.trim() && (endPlace.trim() || surpriseMe)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* ── Hero ────────────────────────────────────────────── */}
      <div className="otr-hero">
        <div className={`otr-hero-bg ${heroUrl ? '' : 'otr-hero-bg-fallback'}`}
          style={heroUrl ? { backgroundImage: `url(${heroUrl})` } : undefined}
        />
        <div className="otr-hero-inner">
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            color: 'rgba(250, 248, 245, 0.6)', margin: '0 0 16px',
          }}>
            Road Trip Planner
          </p>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400,
            fontSize: 'clamp(36px, 6vw, 56px)', lineHeight: 1.05,
            color: 'var(--otr-paper)', margin: 0,
          }}>
            On This Road
          </h1>
          <p style={{
            fontFamily: 'var(--font-display)', fontSize: 'clamp(16px, 2.5vw, 20px)',
            fontWeight: 400, fontStyle: 'italic',
            color: 'rgba(250, 248, 245, 0.5)', margin: '12px 0 0', lineHeight: 1.5,
            maxWidth: 500,
          }}>
            Every drive is better with somewhere worth stopping.
          </p>
        </div>
      </div>

      {/* ── Form ────────────────────────────────────────────── */}
      <div className="otr-form-section">
        <div className="otr-form-inner">
          <form onSubmit={handleSubmit}>

            {/* From / To inputs */}
            <div className="otr-inputs" style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <PlaceInput value={startPlace} onChange={setStartPlace}
                placeholder="Melbourne" label="FROM" />

              <button type="button" className="otr-swap-btn" onClick={handleSwap} title="Swap">
                <ArrowUpDown size={16} strokeWidth={2} />
              </button>

              {!surpriseMe && (
                <PlaceInput value={endPlace} onChange={setEndPlace}
                  placeholder="Sydney" label="TO" />
              )}
              {surpriseMe && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 0' }}>
                  <p style={{
                    fontFamily: 'var(--font-display)', fontSize: 16, fontStyle: 'italic',
                    color: 'var(--otr-ink-60)', margin: 0,
                  }}>
                    We&apos;ll pick the direction
                  </p>
                </div>
              )}
            </div>

            {/* Surprise Me — inline link style */}
            <div style={{ textAlign: 'center' }}>
              <button type="button"
                className={`otr-surprise-link ${surpriseMe ? 'active' : ''}`}
                onClick={() => setSurpriseMe(!surpriseMe)}>
                <Compass size={14} strokeWidth={1.5} />
                <span>{surpriseMe ? 'Surprise mode on \u2014 we\u2019ll pick a loop' : 'Surprise me \u2014 just pick a direction'}</span>
              </button>
            </div>

            {/* Departure timing */}
            <div className="otr-selector-group">
              <p className="otr-selector-label">Leaving</p>
              <div className="otr-pill-row">
                {DEPARTURE_OPTIONS.map(opt => (
                  <button key={opt.value} type="button"
                    className={`otr-pill ${departureTiming === opt.value ? 'active' : ''}`}
                    onClick={() => setDepartureTiming(opt.value)}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Trip length */}
            <div className="otr-selector-group">
              <p className="otr-selector-label">Trip Length</p>
              <div className="otr-pill-row">
                {TRIP_LENGTH_OPTIONS.map(opt => (
                  <button key={opt.value} type="button"
                    className={`otr-pill ${tripLength === opt.value ? 'active' : ''}`}
                    onClick={() => setTripLength(opt.value)}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Detour tolerance */}
            <div className="otr-selector-group">
              <p className="otr-selector-label">Detour Tolerance</p>
              <div className="otr-pill-row">
                {DETOUR_OPTIONS.map(opt => (
                  <button key={opt.value} type="button"
                    className={`otr-pill otr-pill--detour ${detourTolerance === opt.value ? 'active' : ''}`}
                    onClick={() => setDetourTolerance(opt.value)}>
                    <span>{opt.label}</span>
                    <span className="otr-pill__sublabel">{opt.sublabel}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Preference chips */}
            <div className="otr-selector-group">
              <p className="otr-selector-label">What Are You Into?</p>
              <div className="otr-chips-grid">
                {PREFERENCE_CHIPS.map(chip => {
                  const isActive = effectivePrefs.includes(chip.key)
                  const isLocked = chip.key === 'accommodation' && isMultiDay
                  return (
                    <button key={chip.key} type="button"
                      className={`otr-chip ${isActive ? 'active' : ''} ${isLocked ? 'locked' : ''}`}
                      onClick={() => togglePref(chip.key)}>
                      <span className="otr-chip-icon">
                        <chip.Icon size={16} strokeWidth={1.5} />
                      </span>
                      <span>{chip.label}</span>
                      {isLocked && (
                        <Lock size={12} strokeWidth={2} style={{ marginLeft: 'auto', opacity: 0.5 }} />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Multi-day: return different road */}
            {isMultiDay && (
              <button type="button"
                className={`otr-return-toggle ${returnDifferent ? 'active' : ''}`}
                onClick={() => setReturnDifferent(!returnDifferent)}>
                <span className="otr-return-checkbox">
                  {returnDifferent && <Check size={14} strokeWidth={2.5} />}
                </span>
                <CornerDownLeft size={16} strokeWidth={1.5} />
                <span>{returnDifferent ? 'Taking a different road home' : 'Take a different road home'}</span>
              </button>
            )}

            {/* Submit */}
            <button type="submit" className={`otr-cta ${loading ? 'loading' : ''}`}
              disabled={loading || !canSubmit}>
              {loading ? 'Planning your trip\u2026' : surpriseMe ? 'Surprise me' : 'Show me what\u2019s on this road'}
            </button>
          </form>
        </div>
      </div>

      {/* ── Error ───────────────────────────────────────────── */}
      {error && (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
          <div style={{
            padding: '16px 20px', borderRadius: 8,
            background: 'rgba(220, 38, 38, 0.06)', border: '1px solid rgba(220, 38, 38, 0.15)',
            fontFamily: 'var(--font-body)', fontSize: 14, color: '#dc2626',
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <AlertTriangle size={16} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* ── Loading ─────────────────────────────────────────── */}
      {loading && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '80px 20px', textAlign: 'center',
        }}>
          <div style={{
            width: 120, height: 3, background: 'var(--otr-border)',
            borderRadius: 2, overflow: 'hidden', marginBottom: 24, position: 'relative',
          }}>
            <div style={{
              position: 'absolute', inset: 0,
              background: 'var(--otr-amber)',
              animation: 'roadLine 2s ease-in-out infinite',
            }} />
          </div>
          <p style={{
            fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400,
            fontStyle: 'italic', color: 'var(--color-ink)', margin: 0,
          }}>
            {loadingMsg}
          </p>
        </div>
      )}

      {/* ── Short trip ──────────────────────────────────────── */}
      {result?.short_trip && !loading && (
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
          <p style={{
            fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400,
            fontStyle: 'italic', color: 'var(--color-ink)', margin: '0 0 12px', lineHeight: 1.4,
          }}>
            {result.message || "That\u2019s a short trip \u2014 not much road to explore."}
          </p>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
            color: 'var(--color-muted)', margin: '0 0 24px', lineHeight: 1.6,
          }}>
            On This Road works best for drives of 20km or more.
          </p>
        </div>
      )}

      {/* ── Results ─────────────────────────────────────────── */}
      {result && !result.short_trip && !loading && (
        <div ref={resultsRef} className="otr-results">
          <ResultsView result={result} />
        </div>
      )}
    </div>
  )
}

// ── Results view ────────────────────────────────────────────────────

function ResultsView({ result }) {
  const {
    title, stops, days, route_geometry, total_listings_found,
    route_duration_minutes, route_distance_km, intro,
    additional_stop_hours, coverage_gaps, is_long_trip,
    is_surprise_loop, is_multi_day, rest_listings,
    start_name, end_name,
  } = result

  const [mobileView, setMobileView] = useState('list')
  const [saving, setSaving] = useState(false)
  const [savedUrl, setSavedUrl] = useState(null)

  const allStops = stops || []
  const hasDays = is_multi_day && days && days.length > 1

  // Empty state
  if (allStops.length === 0) {
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
        </Link>
      </div>
    )
  }

  // Save trip
  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/on-this-road/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      })
      const data = await res.json()
      if (data.url) {
        setSavedUrl(`https://australianatlas.com.au${data.url}`)
      }
    } catch { /* silent */ }
    setSaving(false)
  }

  const copyUrl = () => {
    if (savedUrl) navigator.clipboard?.writeText(savedUrl)
  }

  return (
    <>
      {/* Header */}
      <div className="otr-results-header">
        <h2 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400,
          fontSize: 'clamp(24px, 4vw, 36px)', lineHeight: 1.2,
          color: 'var(--color-ink)', margin: 0,
        }}>
          {title}
        </h2>

        {/* Route stats */}
        <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
          {route_distance_km > 0 && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300, color: 'var(--color-muted)' }}>
              {route_distance_km.toLocaleString()} km
            </span>
          )}
          {route_duration_minutes > 0 && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300, color: 'var(--color-muted)' }}>
              ~{Math.round(route_duration_minutes / 60)} hr drive
            </span>
          )}
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300, color: 'var(--color-muted)' }}>
            {allStops.length} stops
          </span>
          {is_surprise_loop && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500, color: 'var(--otr-amber)', background: 'rgba(196,154,60,0.1)', padding: '2px 10px', borderRadius: 99 }}>
              Surprise loop
            </span>
          )}
          {hasDays && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500, color: 'var(--otr-amber)', background: 'rgba(196,154,60,0.1)', padding: '2px 10px', borderRadius: 99 }}>
              {days.length} days
            </span>
          )}
        </div>

        {intro && (
          <p style={{
            fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 400,
            fontStyle: 'italic', color: 'var(--color-ink)', margin: '16px 0 0',
            lineHeight: 1.6, maxWidth: 700, opacity: 0.85,
          }}>
            {intro}
          </p>
        )}

        {additional_stop_hours > 0 && (
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 400,
            color: 'var(--otr-amber)', margin: '10px 0 0',
          }}>
            Add approximately {additional_stop_hours} {additional_stop_hours === 1 ? 'hour' : 'hours'} for stops.
          </p>
        )}
      </div>

      <div className="otr-results-body">
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
          }}>Stops</button>
          <button onClick={() => setMobileView('map')} style={{
            padding: '8px 20px', fontSize: 13, fontFamily: 'var(--font-body)', fontWeight: 500,
            color: mobileView === 'map' ? '#fff' : 'var(--color-ink)',
            background: mobileView === 'map' ? 'var(--color-ink)' : 'transparent',
            border: 'none', borderLeft: '1px solid var(--color-border)', cursor: 'pointer',
          }}>Map</button>
        </div>

        {/* Split layout */}
        <div className="otr-split" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0, marginTop: 8 }}>
          {/* Stops list */}
          {mobileView === 'list' && (
            <div>
              {hasDays ? (
                // Multi-day: render by day
                days.map(day => (
                  <DaySection key={day.day_number} day={day} />
                ))
              ) : (
                // Single-day: flat list with clusters
                <SingleDayStops stops={allStops} />
              )}

              {/* Long trip warning */}
              {is_long_trip && rest_listings && rest_listings.length > 0 && !hasDays && (
                <LongTripBanner routeDistanceKm={route_distance_km} restListings={rest_listings} />
              )}

              {/* Save & share */}
              <div className="otr-save-bar">
                {!savedUrl ? (
                  <button className="otr-save-btn" onClick={handleSave} disabled={saving}>
                    <Upload size={16} strokeWidth={2} />
                    {saving ? 'Saving\u2026' : 'Save & share this trip'}
                  </button>
                ) : (
                  <>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, color: 'var(--otr-amber)' }}>
                      Trip saved!
                    </span>
                    <span className="otr-share-url">
                      <a href={savedUrl} target="_blank" rel="noopener noreferrer">{savedUrl}</a>
                    </span>
                    <button className="otr-save-btn" onClick={copyUrl} style={{ padding: '8px 16px', fontSize: 12 }}>
                      Copy link
                    </button>
                  </>
                )}
              </div>

              {/* Footer CTAs */}
              <div style={{ marginTop: 24, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <Link href="/trails/builder" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '14px 28px', borderRadius: 8, fontSize: 14,
                  fontFamily: 'var(--font-body)', fontWeight: 500, color: '#fff',
                  background: 'var(--color-ink)', textDecoration: 'none', minHeight: 48,
                }}>
                  Build a full trail
                </Link>
              </div>
            </div>
          )}

          {/* Map */}
          <div className={mobileView === 'map' ? 'otr-map-col' : 'otr-map-col otr-mobile-map'}
            style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--color-border)', minHeight: 400, marginTop: 24 }}>
            <RouteMap
              routeGeometry={route_geometry}
              stops={allStops}
              coverageGaps={coverage_gaps}
              startName={start_name}
              endName={end_name}
            />
          </div>
        </div>
      </div>
    </>
  )
}

// ── Single day stops (clustered) ────────────────────────────────────

function SingleDayStops({ stops }) {
  const clustered = []
  let currentCluster = null
  for (const stop of stops) {
    const name = stop.cluster || 'Along the way'
    if (name !== currentCluster) {
      clustered.push({ name, stops: [] })
      currentCluster = name
    }
    clustered[clustered.length - 1].stops.push(stop)
  }

  let globalIdx = 0
  return clustered.map((cluster, ci) => (
    <div key={ci}>
      {clustered.length > 1 && (
        <div style={{ padding: '16px 0 8px', borderBottom: '1px solid var(--color-border)' }}>
          <h3 style={{
            fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 400,
            fontStyle: 'italic', color: 'var(--color-ink)', margin: 0,
          }}>
            {cluster.name}
          </h3>
        </div>
      )}
      {cluster.stops.map((stop) => {
        const idx = globalIdx++
        return <StopCard key={stop.listing_id || idx} stop={stop} index={idx} />
      })}
    </div>
  ))
}

// ── Day section (multi-day) ─────────────────────────────────────────

function DaySection({ day }) {
  return (
    <div className="otr-day-section">
      <div className="otr-day-header">
        <div className="otr-day-badge">{day.day_number}</div>
        <h3 className="otr-day-label">{day.label || `Day ${day.day_number}`}</h3>
      </div>

      {day.stops?.map((stop, i) => (
        <StopCard key={stop.listing_id || i} stop={stop} index={i} />
      ))}

      {day.overnight && <OvernightCard stop={day.overnight} />}

      {day.accommodation_gap && (
        <div style={{
          padding: '12px 16px', borderRadius: 8, margin: '12px 0',
          background: 'rgba(220, 38, 38, 0.04)', border: '1px solid rgba(220, 38, 38, 0.1)',
          fontFamily: 'var(--font-body)', fontSize: 13, color: '#dc2626',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertTriangle size={14} strokeWidth={1.5} />
          No accommodation found for this night — you may need to book independently.
        </div>
      )}
    </div>
  )
}

// ── Stop card ───────────────────────────────────────────────────────

function StopCard({ stop, index }) {
  const vertColor = VERTICAL_COLORS[stop.vertical] || '#5F8A7E'
  const vertName = VERTICAL_NAMES[stop.vertical] || stop.vertical
  const hasImage = stop.hero_image_url && !stop.hero_image_url.includes('unsplash.com')

  return (
    <div style={{
      display: 'flex', gap: 16, padding: '16px 0 16px 16px',
      borderBottom: '1px solid var(--color-border)',
      borderLeft: `3px solid ${vertColor}`,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%', background: vertColor,
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13,
        flexShrink: 0, marginTop: 2,
      }}>
        {index + 1}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <a href={`/place/${stop.slug}`} target="_blank" rel="noopener noreferrer" style={{
          fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400,
          color: 'var(--color-ink)', textDecoration: 'none', lineHeight: 1.3,
        }}>
          {stop.listing_name}
        </a>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex', padding: '3px 10px', borderRadius: 99,
            fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-body)',
            backgroundColor: vertColor, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.04em',
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

        {(stop.reason || stop.notes) && (
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
            color: 'var(--color-ink)', margin: '8px 0 0', lineHeight: 1.5, fontStyle: 'italic',
          }}>
            {stop.reason || stop.notes}
          </p>
        )}

        <a href={`/place/${stop.slug}`} target="_blank" rel="noopener noreferrer" style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8,
          fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 400,
          color: 'var(--color-muted)', textDecoration: 'none',
        }}>
          View listing
          <ArrowRight size={12} strokeWidth={1.5} />
        </a>
      </div>

      {hasImage && (
        <div style={{ width: 72, height: 72, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
          <img src={stop.hero_image_url} alt={stop.listing_name} loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}
    </div>
  )
}

// ── Overnight card ──────────────────────────────────────────────────

function OvernightCard({ stop }) {
  const hasImage = stop.hero_image_url && !stop.hero_image_url.includes('unsplash.com')

  return (
    <div className="otr-overnight">
      {hasImage && (
        <div style={{ width: 80, height: 80, borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
          <img src={stop.hero_image_url} alt={stop.listing_name} loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <span className="otr-overnight-badge">
            <Moon size={12} strokeWidth={2} />
            Stay tonight
          </span>
        </div>
        <a href={`/place/${stop.slug}`} target="_blank" rel="noopener noreferrer" style={{
          fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400,
          color: '#fff', textDecoration: 'none', lineHeight: 1.3,
        }}>
          {stop.listing_name}
        </a>
        {stop.region && (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 300, color: 'rgba(255,255,255,0.4)', margin: '4px 0 0' }}>
            {stop.region}
          </p>
        )}
        {stop.reason && (
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
            color: 'rgba(255,255,255,0.6)', margin: '8px 0 0', lineHeight: 1.5, fontStyle: 'italic',
          }}>
            {stop.reason}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Long trip banner ────────────────────────────────────────────────

function LongTripBanner({ routeDistanceKm, restListings }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{
      padding: '16px 20px', borderRadius: 12, marginTop: 24,
      background: 'linear-gradient(135deg, #2d2a24 0%, #3a2a35 100%)',
      border: '1px solid rgba(138, 90, 107, 0.3)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <AlertTriangle size={20} strokeWidth={1.5} color="#C49A3C" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1 }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500, color: '#fff', margin: '0 0 4px' }}>
            This is a long drive ({routeDistanceKm.toLocaleString()} km)
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.5 }}>
            Consider selecting a multi-day trip length. We found {restListings.length} boutique stays along the route.
          </p>
        </div>
      </div>

      {restListings.length > 0 && (
        <button onClick={() => setExpanded(!expanded)} style={{
          display: 'flex', alignItems: 'center', gap: 6, marginTop: 12,
          padding: '6px 12px', borderRadius: 6, fontSize: 12,
          fontFamily: 'var(--font-body)', fontWeight: 500, color: '#C49A3C',
          background: 'rgba(196, 154, 60, 0.1)', border: '1px solid rgba(196, 154, 60, 0.2)', cursor: 'pointer',
        }}>
          {expanded ? 'Hide' : 'Show'} overnight stops
          <ChevronDown size={12} strokeWidth={2}
            style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
      )}

      {expanded && restListings.map((stay, i) => (
        <a key={stay.listing_id || i} href={`/place/${stay.slug}`} target="_blank" rel="noopener noreferrer" style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
          borderRadius: 8, background: 'rgba(255,255,255,0.05)', textDecoration: 'none', marginTop: 8,
        }}>
          {stay.hero_image_url && (
            <img src={stay.hero_image_url} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} loading="lazy" />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 400, color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {stay.listing_name}
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 300, color: 'rgba(255,255,255,0.5)', margin: '2px 0 0' }}>
              {stay.region || stay.suburb} &middot; {stay.position_km} km
            </p>
          </div>
        </a>
      ))}
    </div>
  )
}
