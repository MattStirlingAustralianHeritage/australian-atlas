'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  Wine, Coffee, Landmark, UtensilsCrossed, Wheat, BedDouble,
  Palette, Mountain, Compass, CornerDownLeft, ArrowUpDown,
  Check, Moon, ChevronDown, AlertTriangle, ArrowRight,
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
  'Mapping the route and marking the good stops\u2026',
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
  const formRef = useRef(null)
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

      if (!res.ok) {
        const body = await res.text()
        console.error('[on-this-road] API error:', res.status, body)
        // Try to parse JSON error body for user-friendly message
        try {
          const errData = JSON.parse(body)
          setError(errData.error || `Something went wrong (${res.status}). Please try again.`)
        } catch {
          setError(`Something went wrong (${res.status}). Please try again.`)
        }
        return
      }
      const data = await res.json()
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
      <div className="otr-form-section" ref={formRef}>
        <div className="otr-form-inner">
          <div>

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
                        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 500, opacity: 0.6, letterSpacing: '0.02em' }}>
                          always on
                        </span>
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

            {/* Submit — own row for visual weight */}
            <div className="otr-cta-row">
              <button type="button" className={`otr-cta ${loading ? 'loading' : ''}`}
                disabled={loading || !canSubmit}
                onClick={handleSubmit}>
                {loading ? 'Planning your trip\u2026' : surpriseMe ? 'Surprise me' : 'Show me what\u2019s on this road'}
              </button>
            </div>
          </div>
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
          <ResultsView result={result} formRef={formRef} onRegenerate={handleSubmit} />
        </div>
      )}
    </div>
  )
}

// ── Results view ────────────────────────────────────────────────────

function ResultsView({ result, formRef, onRegenerate }) {
  const {
    title, subtitle, stops, days, route_geometry,
    route_duration_minutes, route_distance_km, intro,
    additional_stop_hours, coverage_gaps, is_long_trip,
    is_surprise_loop, is_multi_day, rest_listings,
    start_name, end_name, start_coords, end_coords,
    departure_timing, trip_length,
  } = result

  const [saving, setSaving] = useState(false)
  const [savedUrl, setSavedUrl] = useState(null)
  const [mobileMapExpanded, setMobileMapExpanded] = useState(false)
  const [activeDayNumber, setActiveDayNumber] = useState(null)
  const [highlightedStopIndex, setHighlightedStopIndex] = useState(null)
  const [regenCount, setRegenCount] = useState(0)
  const [regenCooldown, setRegenCooldown] = useState(0)
  const dayRefs = useRef({})
  const observerRef = useRef(null)
  const cooldownRef = useRef(null)

  const hasDays = is_multi_day && days && days.length > 1

  // Tag stops with globalIndex and day_number for the map
  const taggedStops = []
  let globalIdx = 1
  if (hasDays) {
    for (const day of days) {
      for (const stop of (day.stops || [])) {
        taggedStops.push({ ...stop, globalIndex: globalIdx++, day_number: day.day_number })
      }
      if (day.overnight) {
        taggedStops.push({ ...day.overnight, globalIndex: globalIdx++, day_number: day.day_number, is_overnight: true })
      }
    }
  } else {
    for (const stop of (stops || [])) {
      taggedStops.push({ ...stop, globalIndex: globalIdx++, day_number: 1 })
    }
  }

  // IntersectionObserver for day-fly
  useEffect(() => {
    if (!hasDays) return
    const entries = Object.values(dayRefs.current).filter(Boolean)
    if (entries.length === 0) return

    observerRef.current = new IntersectionObserver((observations) => {
      for (const entry of observations) {
        if (entry.isIntersecting) {
          const dayNum = parseInt(entry.target.getAttribute('data-day'))
          if (dayNum) setActiveDayNumber(dayNum)
        }
      }
    }, { threshold: 0.3, rootMargin: '-10% 0px -40% 0px' })

    for (const el of entries) {
      observerRef.current.observe(el)
    }

    return () => observerRef.current?.disconnect()
  }, [hasDays, days])

  // Regenerate cooldown timer
  useEffect(() => {
    if (regenCooldown <= 0) return
    cooldownRef.current = setInterval(() => {
      setRegenCooldown(prev => {
        if (prev <= 1) { clearInterval(cooldownRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(cooldownRef.current)
  }, [regenCooldown])

  // Pin click → scroll to stop
  const handlePinClick = useCallback((stopGlobalIndex) => {
    const el = document.querySelector(`[data-stop-index="${stopGlobalIndex}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  // Save trip (anonymous by default, associated with account if authed)
  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/on-this-road/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      })
      const data = await res.json()
      if (data.url) setSavedUrl(`https://australianatlas.com.au${data.url}`)
    } catch { /* silent */ }
    setSaving(false)
  }

  const handleShare = () => {
    if (savedUrl) {
      navigator.clipboard?.writeText(savedUrl)
      return
    }
    handleSave()
  }

  const handleRegenerate = () => {
    if (regenCount >= 3 || regenCooldown > 0) return
    setRegenCount(prev => prev + 1)
    setRegenCooldown(30)
    if (onRegenerate) onRegenerate()
  }

  // Build Google Maps URL with waypoints
  const buildGoogleMapsUrl = () => {
    const waypoints = taggedStops.filter(s => !s.is_overnight && s.lat && s.lng).slice(0, 9) // Google max 9 waypoints
    const origin = start_coords ? `${start_coords.lat},${start_coords.lng}` : encodeURIComponent(start_name)
    const dest = end_coords ? `${end_coords.lat},${end_coords.lng}` : encodeURIComponent(end_name)
    const wp = waypoints.map(s => `${s.lat},${s.lng}`).join('|')
    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${wp ? `&waypoints=${wp}` : ''}&travelmode=driving`
  }

  const buildAppleMapsUrl = () => {
    const allPoints = taggedStops.filter(s => !s.is_overnight && s.lat && s.lng)
    const origin = start_coords ? `${start_coords.lat},${start_coords.lng}` : ''
    const dest = end_coords ? `${end_coords.lat},${end_coords.lng}` : ''
    return `maps://?saddr=${origin}&daddr=${dest}&dirflg=d`
  }

  // Empty state
  if (!taggedStops.length) {
    return (
      <div className="otr-empty-state">
        <p className="otr-empty-title">We don&apos;t have much on this route yet.</p>
        <p className="otr-empty-sub">The network is growing. Know a place that should be here?</p>
        <Link href="/suggest" className="otr-empty-link">Suggest a place</Link>
      </div>
    )
  }

  // Parse day labels — "Day 1 — Melbourne to Seymour" → { prefix: "Day 1", places: "Melbourne to Seymour" }
  const parseDayLabel = (label) => {
    const match = label?.match(/^(Day \d+)\s*[—–-]\s*(.+)$/)
    if (match) return { prefix: match[1], places: match[2] }
    return { prefix: label || '', places: '' }
  }

  // Departure day name
  const departureDayName = (() => {
    const map = { this_morning: 'Today', this_afternoon: 'Today', tomorrow_morning: 'Tomorrow', this_weekend: 'This weekend' }
    return map[departure_timing] || null
  })()

  return (
    <>
      {/* ── Trip header ───────────────────────────────────────── */}
      <div className="otr-results-header">
        <h2 className="otr-trip-title">{title}</h2>
        {subtitle && <p className="otr-trip-subtitle">{subtitle}</p>}

        {/* Metadata strip */}
        <div className="otr-trip-meta">
          {route_distance_km > 0 && <span>{route_distance_km.toLocaleString()} KM</span>}
          {route_distance_km > 0 && route_duration_minutes > 0 && <span className="otr-meta-dot" aria-hidden="true">&middot;</span>}
          {route_duration_minutes > 0 && <span>~{Math.round(route_duration_minutes / 60)} HR DRIVE</span>}
          <span className="otr-meta-dot" aria-hidden="true">&middot;</span>
          <span>{taggedStops.filter(s => !s.is_overnight).length} STOPS</span>
          {hasDays && <><span className="otr-meta-dot" aria-hidden="true">&middot;</span><span>{days.length} DAYS</span></>}
          {departureDayName && <><span className="otr-meta-dot" aria-hidden="true">&middot;</span><span>DEPARTING {departureDayName.toUpperCase()}</span></>}
          {is_surprise_loop && <><span className="otr-meta-dot" aria-hidden="true">&middot;</span><span>SURPRISE LOOP</span></>}
        </div>

        {intro && <p className="otr-trip-intro">{intro}</p>}

        {additional_stop_hours > 0 && (
          <p className="otr-trip-stop-hours">
            Add approximately {additional_stop_hours} {additional_stop_hours === 1 ? 'hour' : 'hours'} for stops.
          </p>
        )}
      </div>

      {/* ── Actions bar ───────────────────────────────────────── */}
      <div className="otr-trip-actions">
        <button type="button" className="otr-action-btn" onClick={handleSave} disabled={saving || !!savedUrl}>
          <Upload size={14} strokeWidth={2} />
          {savedUrl ? 'Saved' : saving ? 'Saving\u2026' : 'Save this trip'}
        </button>
        <button type="button" className="otr-action-btn" onClick={handleShare}>
          Share
        </button>
        <a className="otr-action-btn" href={buildGoogleMapsUrl()} target="_blank" rel="noopener noreferrer">
          Open in Google Maps
        </a>
        <a className="otr-action-btn otr-action-btn--secondary" href={buildAppleMapsUrl()} target="_blank" rel="noopener noreferrer">
          Apple Maps
        </a>
        <button type="button" className="otr-action-btn otr-action-btn--secondary"
          onClick={() => formRef?.current?.scrollIntoView({ behavior: 'smooth' })}>
          Edit trip
        </button>
        <button type="button" className="otr-action-btn otr-action-btn--secondary"
          onClick={handleRegenerate}
          disabled={regenCount >= 3 || regenCooldown > 0}>
          {regenCooldown > 0 ? `Regenerate (${regenCooldown}s)` : regenCount >= 3 ? 'Limit reached' : 'Regenerate'}
        </button>
      </div>

      {/* ── Body: split layout ────────────────────────────────── */}
      <div className="otr-results-body">
        {/* Mobile map preview bar */}
        <div className={`otr-mobile-map-bar ${mobileMapExpanded ? 'otr-mobile-map-bar--expanded' : ''}`}
          onClick={() => !mobileMapExpanded && setMobileMapExpanded(true)}>
          {mobileMapExpanded && (
            <button type="button" className="otr-mobile-map-close"
              onClick={(e) => { e.stopPropagation(); setMobileMapExpanded(false) }}>
              &times;
            </button>
          )}
          <RouteMap
            routeGeometry={route_geometry}
            stops={taggedStops}
            coverageGaps={coverage_gaps}
            startName={start_name}
            endName={end_name}
            activeDayNumber={activeDayNumber}
            highlightedStopIndex={highlightedStopIndex}
            onPinClick={(idx) => { handlePinClick(idx); setMobileMapExpanded(false) }}
            compact={!mobileMapExpanded}
          />
        </div>

        <div className="otr-split">
          {/* Itinerary column */}
          <div className="otr-itinerary-col">
            {hasDays ? (
              days.map((day) => {
                const { prefix, places } = parseDayLabel(day.label)
                const dayStops = taggedStops.filter(s => s.day_number === day.day_number && !s.is_overnight)
                const overnight = taggedStops.find(s => s.day_number === day.day_number && s.is_overnight)

                return (
                  <section key={day.day_number} className="otr-day-chapter"
                    data-day={day.day_number}
                    ref={el => { dayRefs.current[day.day_number] = el }}>

                    <div className="otr-day-heading">
                      <span className="otr-day-number">{prefix}</span>
                      {places && <h3 className="otr-day-title">{places}</h3>}
                      {day.day_subtitle && <p className="otr-day-subtitle">{day.day_subtitle}</p>}
                      <div className="otr-day-rule" />
                    </div>

                    {dayStops.map((stop) => (
                      <StopCard key={stop.listing_id || stop.globalIndex} stop={stop}
                        onHover={setHighlightedStopIndex} />
                    ))}

                    {overnight && <OvernightCard stop={overnight} />}

                    {day.accommodation_gap && (
                      <div className="otr-accommodation-gap">
                        <AlertTriangle size={14} strokeWidth={1.5} />
                        {day.accommodation_note || 'No verified stays found for this night — you may need to book independently.'}
                      </div>
                    )}
                  </section>
                )
              })
            ) : (
              <section className="otr-day-chapter" data-day="1"
                ref={el => { dayRefs.current[1] = el }}>
                {taggedStops.map((stop) => (
                  <StopCard key={stop.listing_id || stop.globalIndex} stop={stop}
                    onHover={setHighlightedStopIndex} />
                ))}
              </section>
            )}

            {/* Long trip warning */}
            {is_long_trip && rest_listings && rest_listings.length > 0 && !hasDays && (
              <LongTripBanner routeDistanceKm={route_distance_km} restListings={rest_listings} />
            )}
          </div>

          {/* Map column (desktop sticky) */}
          <div className="otr-map-col">
            <RouteMap
              routeGeometry={route_geometry}
              stops={taggedStops}
              coverageGaps={coverage_gaps}
              startName={start_name}
              endName={end_name}
              activeDayNumber={activeDayNumber}
              highlightedStopIndex={highlightedStopIndex}
              onPinClick={handlePinClick}
            />
          </div>
        </div>
      </div>
    </>
  )
}

// ── Stop card ───────────────────────────────────────────────────────

function StopCard({ stop, onHover }) {
  const vertName = VERTICAL_NAMES[stop.vertical] || stop.vertical
  const hasImage = stop.hero_image_url && !stop.hero_image_url.includes('unsplash.com')
  const isLast = false // spine continues unless explicitly marked

  return (
    <div className="otr-stop" data-stop-index={stop.globalIndex}
      onMouseEnter={() => onHover?.(stop.globalIndex)}
      onMouseLeave={() => onHover?.(null)}>
      <div className="otr-stop-timeline">
        <div className="otr-stop-dot">{stop.globalIndex}</div>
        {!isLast && <div className="otr-stop-spine" />}
      </div>
      <div className="otr-stop-content">
        <a className="otr-stop-name" href={`/place/${stop.slug}`} target="_blank" rel="noopener noreferrer">
          {stop.listing_name}
        </a>
        <div className="otr-stop-byline">
          <span className="otr-stop-vertical">{vertName}</span>
          <span className="otr-stop-location">
            {stop.suburb}{stop.suburb && stop.position_km != null ? ' \u00b7 ' : ''}{stop.position_km != null ? `${stop.position_km} km` : ''}
          </span>
        </div>
        {(stop.reason || stop.notes) && (
          <p className="otr-stop-reason">{stop.reason || stop.notes}</p>
        )}
        <a className="otr-stop-link" href={`/place/${stop.slug}`} target="_blank" rel="noopener noreferrer">
          View listing <ArrowRight size={12} strokeWidth={1.5} />
        </a>
      </div>
      {hasImage && (
        <div className="otr-stop-image">
          <img src={stop.hero_image_url} alt={stop.listing_name} loading="lazy" />
        </div>
      )}
    </div>
  )
}

// ── Overnight card ──────────────────────────────────────────────────

function OvernightCard({ stop }) {
  const hasImage = stop.hero_image_url && !stop.hero_image_url.includes('unsplash.com')

  return (
    <div className="otr-overnight-pick" data-stop-index={stop.globalIndex}>
      {hasImage && (
        <div className="otr-overnight-image">
          <img src={stop.hero_image_url} alt={stop.listing_name} loading="lazy" />
        </div>
      )}
      <div className="otr-overnight-content">
        <span className="otr-overnight-eyebrow">Tonight&apos;s Stay</span>
        <a className="otr-overnight-name" href={`/place/${stop.slug}`} target="_blank" rel="noopener noreferrer">
          {stop.listing_name}
        </a>
        {(stop.region || stop.suburb) && (
          <p className="otr-overnight-location">{stop.suburb || stop.region}{stop.state ? `, ${stop.state}` : ''}</p>
        )}
        {stop.reason && <p className="otr-overnight-reason">{stop.reason}</p>}
        <span className="otr-overnight-tag">Rest Atlas</span>
      </div>
    </div>
  )
}

// ── Long trip banner ────────────────────────────────────────────────

function LongTripBanner({ routeDistanceKm, restListings }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="otr-long-trip-banner">
      <div className="otr-long-trip-header">
        <AlertTriangle size={18} strokeWidth={1.5} />
        <div>
          <p className="otr-long-trip-title">This is a long drive ({routeDistanceKm.toLocaleString()} km)</p>
          <p className="otr-long-trip-sub">Consider selecting a multi-day trip length. We found {restListings.length} boutique stays along the route.</p>
        </div>
      </div>
      {restListings.length > 0 && (
        <button type="button" className="otr-long-trip-toggle" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Hide' : 'Show'} overnight stops
          <ChevronDown size={12} strokeWidth={2} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
      )}
      {expanded && restListings.map((stay, i) => (
        <a key={stay.listing_id || i} href={`/place/${stay.slug}`} target="_blank" rel="noopener noreferrer" className="otr-long-trip-stay">
          {stay.hero_image_url && <img src={stay.hero_image_url} alt="" loading="lazy" />}
          <div>
            <p className="otr-long-trip-stay-name">{stay.listing_name}</p>
            <p className="otr-long-trip-stay-meta">{stay.region || stay.suburb} &middot; {stay.position_km} km</p>
          </div>
        </a>
      ))}
    </div>
  )
}
