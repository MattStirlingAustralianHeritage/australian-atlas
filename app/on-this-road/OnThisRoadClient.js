'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { isApprovedImageSource } from '@/lib/image-utils'
import {
  Wine, Coffee, Landmark, UtensilsCrossed, Wheat,
  Palette, Mountain, Compass, CornerDownLeft, ArrowUpDown,
  Check, Moon, ChevronDown, AlertTriangle, ArrowRight,
  Upload, MapPin, RefreshCw, Route, Store, Tag, Beer,
  Star, Camera, ChevronRight, Bike, Car, Download,
} from 'lucide-react'
import { VERTICAL_MUTED } from '@/lib/verticalUrl'
import { readDiscoveryPicks } from '@/lib/discover/sessionPicks'
import './on-this-road.css'

const RouteMap = dynamic(() => import('./RouteMap'), { ssr: false })

// ── Constants ───────────────────────────────────────────────────────

const VERTICAL_COLORS = VERTICAL_MUTED
const VERTICAL_NAMES = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

const TRIP_LENGTH_OPTIONS = [
  { value: 'passing_through', labelKey: 'tripLengthPassingThrough' },
  { value: 'day_trip', labelKey: 'tripLengthDayTrip' },
  { value: '2_days', labelKey: 'tripLength2Days' },
  { value: '3_days', labelKey: 'tripLength3Days' },
  { value: '4_plus', labelKey: 'tripLength4Plus' },
]

const BIKE_TRIP_LENGTH_OPTIONS = [
  { value: 'half_day', labelKey: 'bikeLengthHalfDay', sublabelKey: 'bikeLengthHalfDaySub' },
  { value: 'full_day', labelKey: 'bikeLengthFullDay', sublabelKey: 'bikeLengthFullDaySub' },
  { value: 'weekend', labelKey: 'bikeLengthWeekend', sublabelKey: 'bikeLengthWeekendSub' },
]

const BIKE_TYPE_OPTIONS = [
  { value: 'road', labelKey: 'bikeTypeRoad' },
  { value: 'gravel', labelKey: 'bikeTypeGravel' },
  { value: 'any', labelKey: 'bikeTypeAny' },
]

const FITNESS_OPTIONS = [
  { value: 'relaxed', labelKey: 'fitnessRelaxed', sublabelKey: 'fitnessRelaxedSub' },
  { value: 'moderate', labelKey: 'fitnessModerate', sublabelKey: 'fitnessModerateSub' },
  { value: 'strong', labelKey: 'fitnessStrong', sublabelKey: 'fitnessStrongSub' },
]

const DEPARTURE_OPTIONS = [
  { value: 'this_morning', labelKey: 'departureThisMorning' },
  { value: 'this_afternoon', labelKey: 'departureThisAfternoon' },
  { value: 'tomorrow_morning', labelKey: 'departureTomorrowMorning' },
  { value: 'this_weekend', labelKey: 'departureThisWeekend' },
]

const DETOUR_OPTIONS = [
  { value: 'on_route', labelKey: 'detourOnRoute', sublabelKey: 'detourOnRouteSub' },
  { value: 'happy_to_detour', labelKey: 'detourHappy', sublabelKey: 'detourHappySub' },
  { value: 'flexible', labelKey: 'detourFlexible', sublabelKey: 'detourFlexibleSub' },
]

const PREFERENCE_CHIPS = [
  { key: 'cellar_doors', Icon: Wine, labelKey: 'prefCellarDoors' },
  { key: 'great_coffee', Icon: Coffee, labelKey: 'prefGreatCoffee' },
  { key: 'history', Icon: Landmark, labelKey: 'prefHistory' },
  { key: 'lunch', Icon: UtensilsCrossed, labelKey: 'prefLunch' },
  { key: 'producers', Icon: Wheat, labelKey: 'prefProducers' },
  { key: 'art_makers', Icon: Palette, labelKey: 'prefArtMakers' },
  { key: 'nature', Icon: Mountain, labelKey: 'prefNature' },
  { key: 'local_shops', Icon: Store, labelKey: 'prefLocalShops' },
  { key: 'markets', Icon: Tag, labelKey: 'prefMarkets' },
  { key: 'craft_drinks', Icon: Beer, labelKey: 'prefCraftDrinks' },
  { key: 'fine_dining', Icon: Star, labelKey: 'prefFineDining' },
  { key: 'scenic', Icon: Camera, labelKey: 'prefScenic' },
]

const LOADING_MESSAGE_KEYS = [
  'loadingMsg1', 'loadingMsg2', 'loadingMsg3', 'loadingMsg4', 'loadingMsg5',
]

const SURPRISE_LOADING_MESSAGE_KEYS = [
  'surpriseLoadingMsg1', 'surpriseLoadingMsg2', 'surpriseLoadingMsg3',
  'surpriseLoadingMsg4', 'surpriseLoadingMsg5',
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
  const t = useTranslations('onThisRoad')
  const [mode, setMode] = useState('plan') // 'plan' | 'surprise'
  const [transportMode, setTransportMode] = useState('driving') // 'driving' | 'cycling'
  const [startPlace, setStartPlace] = useState('')
  const [endPlace, setEndPlace] = useState('')
  const [tripLength, setTripLength] = useState('day_trip')
  const [bikeType, setBikeType] = useState('any')
  const [fitness, setFitness] = useState('moderate')
  const [departureTiming, setDepartureTiming] = useState('tomorrow_morning')
  const [detourTolerance, setDetourTolerance] = useState('happy_to_detour')
  const [preferences, setPreferences] = useState([])
  const [surpriseMe, setSurpriseMe] = useState(false)
  const [returnDifferent, setReturnDifferent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [loadingMsg, setLoadingMsg] = useState(t(LOADING_MESSAGE_KEYS[0]))
  const loadingInterval = useRef(null)
  const resultsRef = useRef(null)
  const formRef = useRef(null)
  const [heroUrl] = useState(() => getHeroTileUrl())

  // Surprise Me reveal state
  const [revealPhase, setRevealPhase] = useState('idle') // 'idle' | 'compass' | 'direction' | 'route' | 'stops' | 'done'
  const [surpriseDirection, setSurpriseDirection] = useState(null) // { bearing, label, quadrant }
  const [revealedStopCount, setRevealedStopCount] = useState(0)
  const revealTimerRef = useRef(null)

  // Sync surpriseMe with mode
  useEffect(() => {
    setSurpriseMe(mode === 'surprise')
  }, [mode])

  const isMultiDay = ['2_days', '3_days', '4_plus'].includes(tripLength)

  // Multi-day trips always search for accommodation (handled server-side)
  const effectivePrefs = preferences

  const togglePref = (key) => {
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

    const isSurpriseMode = mode === 'surprise' || surpriseMe
    setLoading(true)
    setError(null)
    setResult(null)
    setRevealPhase('idle')
    setRevealedStopCount(0)
    setSurpriseDirection(null)
    clearTimeout(revealTimerRef.current)

    // Cycle loading messages
    const msgKeys = isSurpriseMode ? SURPRISE_LOADING_MESSAGE_KEYS : LOADING_MESSAGE_KEYS
    let msgIdx = 0
    setLoadingMsg(t(msgKeys[0]))
    loadingInterval.current = setInterval(() => {
      msgIdx = (msgIdx + 1) % msgKeys.length
      setLoadingMsg(t(msgKeys[msgIdx]))
    }, 3500)

    // Discovery onboarding picks (in-session "I'd visit this") bias stop
    // selection toward the kinds of place the visitor just kept — works for
    // anonymous visitors too, before any account exists.
    const discoveryPicks = readDiscoveryPicks()

    try {
      const res = await fetch('/api/on-this-road', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: startPlace,
          end: surpriseMe ? undefined : endPlace,
          discoveryPicks,
          tripLength: transportMode === 'cycling' ? tripLength : tripLength,
          departureTiming: isSurpriseMode ? 'tomorrow_morning' : departureTiming,
          detourTolerance: isSurpriseMode ? 'happy_to_detour' : detourTolerance,
          preferences: effectivePrefs,
          surpriseMe: isSurpriseMode,
          returnDifferentRoad: !isSurpriseMode && isMultiDay && returnDifferent,
          transportMode,
          ...(transportMode === 'cycling' ? { bikeType, fitness } : {}),
        }),
      })

      if (!res.ok) {
        const body = await res.text()
        console.error('[on-this-road] API error:', res.status, body)
        try {
          const errData = JSON.parse(body)
          setError(errData.error || t('errorGeneric', { status: res.status }))
        } catch {
          setError(t('errorGeneric', { status: res.status }))
        }
        return
      }
      const data = await res.json()

      // Surprise mode: trigger reveal animation sequence
      if (isSurpriseMode && data.surprise_direction) {
        setSurpriseDirection(data.surprise_direction)
        setRevealPhase('compass')

        // Phase 1: Compass spins (2.5s), then settles
        setTimeout(() => setRevealPhase('direction'), 2800)
        // Phase 2: Direction label shows (1s), then reveal route + results
        setTimeout(() => {
          setResult(data)
          setRevealPhase('route')
        }, 4200)
        // Phase 3: Start revealing stops sequentially
        setTimeout(() => {
          setRevealPhase('stops')
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 5000)
      } else {
        setResult(data)
        // Standard scroll to results
        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 100)
      }
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('timeout')) {
        setError(t('errorTimeout'))
      } else if (!navigator.onLine) {
        setError(t('errorOffline'))
      } else {
        setError(t('errorUnreachable'))
      }
      console.error('[on-this-road] Client error:', err)
    } finally {
      setLoading(false)
      clearInterval(loadingInterval.current)
    }
  }

  const canSubmit = startPlace.trim() && (endPlace.trim() || surpriseMe || mode === 'surprise')

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
            {t('heroEyebrow')}
          </p>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400,
            fontSize: 'clamp(36px, 6vw, 56px)', lineHeight: 1.05,
            color: 'var(--otr-paper)', margin: 0,
          }}>
            {t('heroTitle')}
          </h1>
          <p style={{
            fontFamily: 'var(--font-display)', fontSize: 'clamp(16px, 2.5vw, 20px)',
            fontWeight: 400, fontStyle: 'italic',
            color: 'rgba(250, 248, 245, 0.5)', margin: '12px 0 0', lineHeight: 1.5,
            maxWidth: 500,
          }}>
            {t('heroSubtitle')}
          </p>
        </div>
      </div>

      {/* ── Form ────────────────────────────────────────────── */}
      <div className="otr-form-section" ref={formRef}>
        <div className="otr-form-inner">
          <div>

            {/* Mode toggle */}
            <div className="otr-mode-toggle">
              <button type="button"
                className={`otr-mode-btn ${mode === 'plan' ? 'active' : ''}`}
                onClick={() => setMode('plan')}>
                <Route size={14} strokeWidth={1.5} />
                {t('modePlanTrip')}
              </button>
              <button type="button"
                className={`otr-mode-btn ${mode === 'surprise' ? 'active' : ''}`}
                onClick={() => setMode('surprise')}>
                <Compass size={14} strokeWidth={1.5} />
                {t('modeSurpriseMe')}
              </button>
            </div>

            {/* From / To inputs */}
            <div className="otr-inputs" style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <PlaceInput value={startPlace} onChange={setStartPlace}
                placeholder={mode === 'surprise' ? t('placeholderWhereAreYou') : 'Melbourne'}
                label={mode === 'surprise' ? t('labelWhereAreYou') : t('labelFrom')} />

              {mode === 'plan' && (
                <>
                  <button type="button" className="otr-swap-btn" onClick={handleSwap} title={t('swapTitle')}>
                    <ArrowUpDown size={16} strokeWidth={2} />
                  </button>
                  <PlaceInput value={endPlace} onChange={setEndPlace}
                    placeholder="Sydney" label={t('labelTo')} />
                </>
              )}
            </div>

            {/* Transport mode */}
            <div className="otr-selector-group">
              <p className="otr-selector-label">{t('travelHeading')}</p>
              <div className="otr-pill-row">
                <button type="button"
                  className={`otr-pill ${transportMode === 'driving' ? 'active' : ''}`}
                  onClick={() => { setTransportMode('driving'); setTripLength('day_trip') }}>
                  <Car size={14} strokeWidth={1.5} style={{ marginRight: 4 }} /> {t('transportCar')}
                </button>
                <button type="button"
                  className={`otr-pill ${transportMode === 'cycling' ? 'active' : ''}`}
                  onClick={() => { setTransportMode('cycling'); setTripLength('full_day') }}>
                  <Bike size={14} strokeWidth={1.5} style={{ marginRight: 4 }} /> {t('transportBike')}
                </button>
              </div>
            </div>

            {/* Departure timing — Plan mode, driving only */}
            {mode === 'plan' && transportMode === 'driving' && (
              <div className="otr-selector-group">
                <p className="otr-selector-label">{t('leavingHeading')}</p>
                <div className="otr-pill-row">
                  {DEPARTURE_OPTIONS.map(opt => (
                    <button key={opt.value} type="button"
                      className={`otr-pill ${departureTiming === opt.value ? 'active' : ''}`}
                      onClick={() => setDepartureTiming(opt.value)}>
                      {t(opt.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Trip length */}
            <div className="otr-selector-group">
              <p className="otr-selector-label">{mode === 'surprise' ? t('howLongHeading') : t('tripLengthHeading')}</p>
              <div className="otr-pill-row">
                {(transportMode === 'cycling' ? BIKE_TRIP_LENGTH_OPTIONS : TRIP_LENGTH_OPTIONS).map(opt => (
                  <button key={opt.value} type="button"
                    className={`otr-pill ${opt.sublabelKey ? 'otr-pill--detour' : ''} ${tripLength === opt.value ? 'active' : ''}`}
                    onClick={() => setTripLength(opt.value)}>
                    <span>{t(opt.labelKey)}</span>
                    {opt.sublabelKey && <span className="otr-pill__sublabel">{t(opt.sublabelKey)}</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Bike type + fitness — cycling only */}
            {transportMode === 'cycling' && (
              <>
                <div className="otr-selector-group">
                  <p className="otr-selector-label">{t('ridingHeading')}</p>
                  <div className="otr-pill-row">
                    {BIKE_TYPE_OPTIONS.map(opt => (
                      <button key={opt.value} type="button"
                        className={`otr-pill ${bikeType === opt.value ? 'active' : ''}`}
                        onClick={() => setBikeType(opt.value)}>
                        {t(opt.labelKey)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="otr-selector-group">
                  <p className="otr-selector-label">{t('fitnessHeading')}</p>
                  <div className="otr-pill-row">
                    {FITNESS_OPTIONS.map(opt => (
                      <button key={opt.value} type="button"
                        className={`otr-pill otr-pill--detour ${fitness === opt.value ? 'active' : ''}`}
                        onClick={() => setFitness(opt.value)}>
                        <span>{t(opt.labelKey)}</span>
                        <span className="otr-pill__sublabel">{t(opt.sublabelKey)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Detour tolerance — Plan mode, driving only */}
            {mode === 'plan' && transportMode === 'driving' && (
              <div className="otr-selector-group">
                <p className="otr-selector-label">{t('detourHeading')}</p>
                <div className="otr-pill-row">
                  {DETOUR_OPTIONS.map(opt => (
                    <button key={opt.value} type="button"
                      className={`otr-pill otr-pill--detour ${detourTolerance === opt.value ? 'active' : ''}`}
                      onClick={() => setDetourTolerance(opt.value)}>
                      <span>{t(opt.labelKey)}</span>
                      <span className="otr-pill__sublabel">{t(opt.sublabelKey)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Preference chips */}
            <div className="otr-selector-group">
              <p className="otr-selector-label">{t('intoHeading')}</p>
              <div className="otr-chips-grid">
                {PREFERENCE_CHIPS.map(chip => {
                  const isActive = effectivePrefs.includes(chip.key)
                  return (
                    <button key={chip.key} type="button"
                      className={`otr-chip ${isActive ? 'active' : ''}`}
                      onClick={() => togglePref(chip.key)}>
                      <span className="otr-chip-icon">
                        <chip.Icon size={16} strokeWidth={1.5} />
                      </span>
                      <span>{t(chip.labelKey)}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Multi-day: return different road (Plan mode only) */}
            {isMultiDay && mode === 'plan' && (
              <button type="button"
                className={`otr-return-toggle ${returnDifferent ? 'active' : ''}`}
                onClick={() => setReturnDifferent(!returnDifferent)}>
                <span className="otr-return-checkbox">
                  {returnDifferent && <Check size={14} strokeWidth={2.5} />}
                </span>
                <CornerDownLeft size={16} strokeWidth={1.5} />
                <span>{returnDifferent ? t('returnRoadActive') : t('returnRoadInactive')}</span>
              </button>
            )}

            {/* Submit — own row for visual weight */}
            <div className="otr-cta-row">
              <button type="button" className={`otr-cta ${loading ? 'loading' : ''}`}
                disabled={loading || !canSubmit}
                onClick={handleSubmit}>
                {loading ? (mode === 'surprise' ? t('ctaFindingSurprise') : t('ctaPlanningTrip')) : mode === 'surprise' ? t('ctaSurpriseMe') : t('ctaShowMe')}
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

      {/* ── Compass Reveal (Surprise mode) ──────────────────── */}
      {(revealPhase === 'compass' || revealPhase === 'direction') && (
        <div className="otr-compass-reveal">
          <div className="otr-compass-ring">
            <div
              className={`otr-compass-needle ${revealPhase === 'compass' ? 'spinning' : 'settled'}`}
              style={revealPhase === 'direction' && surpriseDirection ? {
                '--compass-target': `${surpriseDirection.bearing}deg`,
              } : undefined}
            />
          </div>
          {revealPhase === 'direction' && surpriseDirection && (
            <>
              <p className="otr-compass-direction">{surpriseDirection.name}</p>
              <p className="otr-compass-heading">{surpriseDirection.label}</p>
            </>
          )}
        </div>
      )}

      {/* ── Loading ─────────────────────────────────────────── */}
      {loading && revealPhase === 'idle' && (
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
            {result.message || t('shortTripMessage')}
          </p>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
            color: 'var(--color-muted)', margin: '0 0 24px', lineHeight: 1.6,
          }}>
            {t('shortTripSub')}
          </p>
        </div>
      )}

      {/* ── Results ─────────────────────────────────────────── */}
      {result && !result.short_trip && !loading && (
        <div ref={resultsRef} className="otr-results">
          <ResultsView
            result={result}
            formRef={formRef}
            onRegenerate={handleSubmit}
            isSurpriseMode={mode === 'surprise'}
            revealPhase={revealPhase}
            onRevealComplete={() => setRevealPhase('done')}
          />
        </div>
      )}
    </div>
  )
}

// ── Results view ────────────────────────────────────────────────────

function ResultsView({ result, formRef, onRegenerate, isSurpriseMode, revealPhase, onRevealComplete }) {
  const t = useTranslations('onThisRoad')
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

  const [revealedCount, setRevealedCount] = useState(isSurpriseMode ? 0 : 999)
  const revealRef = useRef(null)
  const [overnightSwaps, setOvernightSwaps] = useState({}) // { dayNumber: swappedStop }

  const hasDays = is_multi_day && days && days.length > 1

  // Sequential stop reveal for surprise mode
  useEffect(() => {
    if (!isSurpriseMode || revealPhase !== 'stops') return
    const totalItems = hasDays
      ? days.reduce((n, d) => n + (d.stops?.length || 0) + (d.overnight ? 1 : 0), 0) + days.length
      : (stops?.length || 0)
    if (revealedCount >= totalItems) {
      onRevealComplete?.()
      return
    }
    revealRef.current = setTimeout(() => {
      setRevealedCount(prev => prev + 1)
    }, 400) // 400ms between each reveal
    return () => clearTimeout(revealRef.current)
  }, [isSurpriseMode, revealPhase, revealedCount, hasDays, days, stops, onRevealComplete])

  // Reset reveal when result changes
  useEffect(() => {
    if (isSurpriseMode) setRevealedCount(0)
    else setRevealedCount(999)
  }, [result, isSurpriseMode])

  // Tag stops with globalIndex and day_number for the map
  const taggedStops = []
  let globalIdx = 1
  if (hasDays) {
    for (const day of days) {
      for (const stop of (day.stops || [])) {
        taggedStops.push({ ...stop, globalIndex: globalIdx++, day_number: day.day_number })
      }
      // Use swapped overnight if available
      const effectiveOvernight = overnightSwaps[day.day_number] || day.overnight
      if (effectiveOvernight) {
        taggedStops.push({ ...effectiveOvernight, globalIndex: globalIdx++, day_number: day.day_number, is_overnight: true })
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

  const isCycling = result.transport_mode === 'cycling'

  // Build Google Maps URL with waypoints
  const buildGoogleMapsUrl = () => {
    const waypoints = taggedStops.filter(s => !s.is_overnight && s.lat && s.lng).slice(0, 9)
    const origin = start_coords ? `${start_coords.lat},${start_coords.lng}` : encodeURIComponent(start_name)
    const dest = end_coords ? `${end_coords.lat},${end_coords.lng}` : encodeURIComponent(end_name)
    const wp = waypoints.map(s => `${s.lat},${s.lng}`).join('|')
    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${wp ? `&waypoints=${wp}` : ''}&travelmode=${isCycling ? 'bicycling' : 'driving'}`
  }

  const buildAppleMapsUrl = () => {
    const origin = start_coords ? `${start_coords.lat},${start_coords.lng}` : ''
    const dest = end_coords ? `${end_coords.lat},${end_coords.lng}` : ''
    return `maps://?saddr=${origin}&daddr=${dest}&dirflg=${isCycling ? 'b' : 'd'}`
  }

  const handleDownloadGpx = () => {
    const coords = route_geometry?.coordinates || []
    const escXml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Australian Atlas Network" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${escXml(title)}</name><desc>${escXml(subtitle || '')}</desc></metadata>
  <trk><name>${escXml(title)}</name><trkseg>
${coords.map(c => `    <trkpt lat="${c[1]}" lon="${c[0]}">${c[2] ? `<ele>${c[2]}</ele>` : ''}</trkpt>`).join('\n')}
  </trkseg></trk>
${taggedStops.filter(s => s.lat && s.lng).map(s => `  <wpt lat="${s.lat}" lon="${s.lng}"><name>${escXml(s.listing_name)}</name></wpt>`).join('\n')}
</gpx>`
    const blob = new Blob([gpx], { type: 'application/gpx+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(title || 'trail').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.gpx`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Empty state
  if (!taggedStops.length) {
    return (
      <div className="otr-empty-state">
        <p className="otr-empty-title">{t('emptyTitle')}</p>
        <p className="otr-empty-sub">{t('emptySub')}</p>
        <Link href="/suggest" className="otr-empty-link">{t('emptyLink')}</Link>
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
    const map = {
      this_morning: t('departDayToday'),
      this_afternoon: t('departDayToday'),
      tomorrow_morning: t('departDayTomorrow'),
      this_weekend: t('departDayWeekend'),
    }
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
          {route_distance_km > 0 && <span>{t('metaKm', { km: route_distance_km.toLocaleString() })}</span>}
          {route_distance_km > 0 && route_duration_minutes > 0 && <span className="otr-meta-dot" aria-hidden="true">&middot;</span>}
          {route_duration_minutes > 0 && <span>{result.transport_mode === 'cycling' ? t('metaHrRide', { hr: Math.round(route_duration_minutes / 60) }) : t('metaHrDrive', { hr: Math.round(route_duration_minutes / 60) })}</span>}
          <span className="otr-meta-dot" aria-hidden="true">&middot;</span>
          <span>{t('metaStops', { count: taggedStops.filter(s => !s.is_overnight).length })}</span>
          {hasDays && <><span className="otr-meta-dot" aria-hidden="true">&middot;</span><span>{t('metaDays', { count: days.length })}</span></>}
          {departureDayName && <><span className="otr-meta-dot" aria-hidden="true">&middot;</span><span>{t('metaDeparting', { day: departureDayName })}</span></>}
          {is_surprise_loop && <><span className="otr-meta-dot" aria-hidden="true">&middot;</span><span>{t('metaSurpriseLoop')}</span></>}
        </div>

        {intro && <p className="otr-trip-intro">{intro}</p>}

        {additional_stop_hours > 0 && (
          <p className="otr-trip-stop-hours">
            {t('addStopHours', { count: additional_stop_hours })}
          </p>
        )}
      </div>

      {/* ── Actions bar ───────────────────────────────────────── */}
      <div className="otr-trip-actions">
        <button type="button" className="otr-action-btn" onClick={handleSave} disabled={saving || !!savedUrl}>
          <Upload size={14} strokeWidth={2} />
          {savedUrl ? t('actionSaved') : saving ? t('actionSaving') : t('actionSaveTrip')}
        </button>
        <button type="button" className="otr-action-btn" onClick={handleShare}>
          {t('actionShare')}
        </button>
        <a className="otr-action-btn" href={buildGoogleMapsUrl()} target="_blank" rel="noopener noreferrer">
          {t('actionGoogleMaps')}
        </a>
        <a className="otr-action-btn otr-action-btn--secondary" href={buildAppleMapsUrl()} target="_blank" rel="noopener noreferrer">
          {t('actionAppleMaps')}
        </a>
        {isCycling && route_geometry && (
          <button type="button" className="otr-action-btn" onClick={handleDownloadGpx}>
            <Download size={14} strokeWidth={2} /> {t('actionDownloadGpx')}
          </button>
        )}
        <button type="button" className="otr-action-btn otr-action-btn--secondary"
          onClick={() => formRef?.current?.scrollIntoView({ behavior: 'smooth' })}>
          {t('actionEditTrip')}
        </button>
        {isSurpriseMode ? (
          <button type="button" className="otr-reroll-btn"
            onClick={handleRegenerate}
            disabled={regenCount >= 3 || regenCooldown > 0}>
            <Compass size={14} strokeWidth={1.5} className="otr-reroll-icon" />
            {regenCooldown > 0 ? t('rerollCooldown', { seconds: regenCooldown }) : regenCount >= 3 ? t('actionLimitReached') : t('rerollTryDirection')}
          </button>
        ) : (
          <button type="button" className="otr-action-btn otr-action-btn--secondary"
            onClick={handleRegenerate}
            disabled={regenCount >= 3 || regenCooldown > 0}>
            {regenCooldown > 0 ? t('regenerateCooldown', { seconds: regenCooldown }) : regenCount >= 3 ? t('actionLimitReached') : t('actionRegenerate')}
          </button>
        )}
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
              (() => {
                let itemIdx = 0 // Tracks reveal index across all items
                return days.map((day) => {
                  const { prefix, places } = parseDayLabel(day.label)
                  const dayStops = taggedStops.filter(s => s.day_number === day.day_number && !s.is_overnight)
                  const effectiveOvernight = overnightSwaps[day.day_number] || day.overnight
                  const overnight = effectiveOvernight ? taggedStops.find(s => s.day_number === day.day_number && s.is_overnight) : null
                  const overnightAlts = (day.overnight_alternatives || []).filter(
                    a => a.listing_id !== (effectiveOvernight?.listing_id)
                  )

                  const dayRevealIdx = itemIdx++
                  const isRevealing = isSurpriseMode && revealPhase === 'stops'

                  return (
                    <section key={day.day_number}
                      className={`otr-day-chapter ${isRevealing ? (dayRevealIdx < revealedCount ? 'reveal-visible' : 'reveal-hidden') : ''}`}
                      style={isRevealing && dayRevealIdx < revealedCount ? { animationDelay: '0s' } : undefined}
                      data-day={day.day_number}
                      ref={el => { dayRefs.current[day.day_number] = el }}>

                      <div className="otr-day-heading">
                        <span className="otr-day-number">{prefix}</span>
                        {places && <h3 className="otr-day-title">{places}</h3>}
                        {day.day_subtitle && <p className="otr-day-subtitle">{day.day_subtitle}</p>}
                        <div className="otr-day-rule" />
                      </div>

                      {dayStops.map((stop) => {
                        const stopRevealIdx = itemIdx++
                        return (
                          <StopCard key={stop.listing_id || stop.globalIndex} stop={stop}
                            onHover={setHighlightedStopIndex}
                            revealClass={isRevealing ? (stopRevealIdx < revealedCount ? 'reveal-visible' : 'reveal-hidden') : ''} />
                        )
                      })}

                      {overnight && (() => {
                        const onRevealIdx = itemIdx++
                        return <OvernightCard stop={overnight}
                          alternatives={overnightAlts}
                          onSwap={(alt) => setOvernightSwaps(prev => ({ ...prev, [day.day_number]: { ...alt, is_overnight: true } }))}
                          revealClass={isRevealing ? (onRevealIdx < revealedCount ? 'reveal-visible' : 'reveal-hidden') : ''} />
                      })()}

                    {day.accommodation_gap && (
                      <div className="otr-accommodation-gap">
                        <AlertTriangle size={14} strokeWidth={1.5} />
                        {day.accommodation_note || t('accommodationGapDefault')}
                      </div>
                    )}
                  </section>
                )
                })
              })()
            ) : (
              <section className="otr-day-chapter" data-day="1"
                ref={el => { dayRefs.current[1] = el }}>
                {taggedStops.map((stop, idx) => {
                  const isRevealing = isSurpriseMode && revealPhase === 'stops'
                  return (
                    <StopCard key={stop.listing_id || stop.globalIndex} stop={stop}
                      onHover={setHighlightedStopIndex}
                      revealClass={isRevealing ? (idx < revealedCount ? 'reveal-visible' : 'reveal-hidden') : ''} />
                  )
                })}
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

function StopCard({ stop, onHover, revealClass = '' }) {
  const t = useTranslations('onThisRoad')
  const vertName = VERTICAL_NAMES[stop.vertical] || stop.vertical
  const hasImage = isApprovedImageSource(stop.hero_image_url)
  const isLast = false // spine continues unless explicitly marked

  return (
    <div className={`otr-stop ${revealClass}`} data-stop-index={stop.globalIndex}
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
          {t('viewListing')} <ArrowRight size={12} strokeWidth={1.5} />
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

// ── Overnight card with accommodation picker ───────────────────────

function OvernightCard({ stop, alternatives = [], onSwap, revealClass = '' }) {
  const t = useTranslations('onThisRoad')
  const [showPicker, setShowPicker] = useState(false)
  const hasImage = isApprovedImageSource(stop.hero_image_url)
  const hasAlternatives = alternatives && alternatives.length > 0

  return (
    <div className={`otr-overnight-pick ${revealClass}`} data-stop-index={stop.globalIndex}>
      {hasImage && (
        <div className="otr-overnight-image">
          <img src={stop.hero_image_url} alt={stop.listing_name} loading="lazy" />
        </div>
      )}
      <div className="otr-overnight-content">
        <span className="otr-overnight-eyebrow">{t('overnightEyebrow')}</span>
        <a className="otr-overnight-name" href={`/place/${stop.slug}`} target="_blank" rel="noopener noreferrer">
          {stop.listing_name}
        </a>
        {(stop.region || stop.suburb) && (
          <p className="otr-overnight-location">{stop.suburb || stop.region}{stop.state ? `, ${stop.state}` : ''}</p>
        )}
        {stop.reason && <p className="otr-overnight-reason">{stop.reason}</p>}
        <div className="otr-overnight-footer">
          <span className="otr-overnight-tag">Rest Atlas</span>
          {hasAlternatives && (
            <button type="button" className="otr-overnight-swap"
              onClick={() => setShowPicker(!showPicker)}>
              {showPicker ? t('overnightClose') : t('overnightOtherOptions', { count: alternatives.length })}
              <ChevronRight size={12} strokeWidth={1.5} className={showPicker ? 'otr-chevron-down' : ''} />
            </button>
          )}
        </div>
        {showPicker && hasAlternatives && (
          <div className="otr-overnight-alternatives">
            {alternatives.map(alt => (
              <button key={alt.listing_id} type="button" className="otr-alt-option"
                onClick={() => { onSwap?.(alt); setShowPicker(false) }}>
                <span className="otr-alt-name">{alt.listing_name}</span>
                <span className="otr-alt-detail">
                  {alt.suburb || alt.region}{alt.position_km != null ? ` · ${alt.position_km} km` : ''}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Long trip banner ────────────────────────────────────────────────

function LongTripBanner({ routeDistanceKm, restListings }) {
  const t = useTranslations('onThisRoad')
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="otr-long-trip-banner">
      <div className="otr-long-trip-header">
        <AlertTriangle size={18} strokeWidth={1.5} />
        <div>
          <p className="otr-long-trip-title">{t('longTripTitle', { km: routeDistanceKm.toLocaleString() })}</p>
          <p className="otr-long-trip-sub">{t('longTripSub', { count: restListings.length })}</p>
        </div>
      </div>
      {restListings.length > 0 && (
        <button type="button" className="otr-long-trip-toggle" onClick={() => setExpanded(!expanded)}>
          {expanded ? t('longTripHideStops') : t('longTripShowStops')}
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
