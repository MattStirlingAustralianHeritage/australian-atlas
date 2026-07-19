'use client'

import { useMemo, useState } from 'react'
import { INTERESTS, TRIP_LENGTHS, PACES } from './engineShared'

/**
 * IntakeWizard — the gentle guided front door of the Itinerary Engine.
 * Four unhurried questions: where, how long, what you're into, what pace.
 * Answers seed the build canvas; nothing here is irreversible.
 */
export default function IntakeWizard({ regions, initial, onComplete }) {
  // Seed from URL params where we can.
  const seedRegion = initial?.region
    ? regions.find((r) => r.slug === initial.region)
    : initial?.q
      ? regions.find((r) => r.name.toLowerCase() === initial.q.trim().toLowerCase())
      : null

  const [step, setStep] = useState(seedRegion ? 1 : 0)
  const [query, setQuery] = useState(initial?.q && !seedRegion ? initial.q : '')
  const [destination, setDestination] = useState(
    seedRegion
      ? {
          regionSlug: seedRegion.slug,
          regionName: seedRegion.name,
          state: seedRegion.state,
          centerLat: seedRegion.center_lat,
          centerLng: seedRegion.center_lng,
          mapZoom: seedRegion.map_zoom,
        }
      : null
  )
  const [dayCount, setDayCount] = useState(initial?.days ? Math.min(Math.max(parseInt(initial.days), 1), 7) : null)
  const [interests, setInterests] = useState([])
  const [pace, setPace] = useState('balanced')
  const [geoLoading, setGeoLoading] = useState(false)

  const steps = ['Where', 'How long', 'Interests', 'Pace']

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const live = regions.filter((r) => r.center_lat && r.center_lng)
    if (!q) return live.slice(0, 10)
    return live
      .filter((r) => r.name.toLowerCase().includes(q) || (r.state || '').toLowerCase() === q)
      .slice(0, 12)
  }, [query, regions])

  function pickRegion(r) {
    setDestination({
      regionSlug: r.slug,
      regionName: r.name,
      state: r.state,
      centerLat: r.center_lat,
      centerLng: r.center_lng,
      mapZoom: r.map_zoom,
    })
    setStep(1)
  }

  function useNearMe() {
    if (!navigator.geolocation) return
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDestination({
          regionSlug: null,
          regionName: 'Near you',
          state: null,
          centerLat: pos.coords.latitude,
          centerLng: pos.coords.longitude,
          mapZoom: 11,
        })
        setGeoLoading(false)
        setStep(1)
      },
      () => setGeoLoading(false),
      { timeout: 8000 }
    )
  }

  function toggleInterest(v) {
    setInterests((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]))
  }

  function finish() {
    const paceObj = PACES.find((p) => p.key === pace) || PACES[1]
    onComplete({
      destination,
      dayCount: dayCount || 1,
      isDayTrip: (dayCount || 1) <= 1,
      interests,
      pace,
      perDay: paceObj.perDay,
    })
  }

  const canContinue =
    (step === 0 && !!destination) ||
    (step === 1 && !!dayCount) ||
    step === 2 ||
    step === 3

  return (
    <div className="ie-intake">
      <div className="ie-intake-inner">
        {/* Progress */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 40 }}>
          <div className="ie-dots">
            {steps.map((_, i) => (
              <span key={i} className={`ie-dot${i <= step ? ' on' : ''}`} />
            ))}
          </div>
          {step > 0 && (
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              ← Back
            </button>
          )}
        </div>

        {/* Step 0 — Where */}
        {step === 0 && (
          <div className="ie-step" key="s0">
            <p className="ie-eyebrow" style={{ marginBottom: 14 }}>Plan a trip</p>
            <h1 className="ie-question" style={{ marginBottom: 28 }}>
              Where are you <em style={{ fontStyle: 'italic' }}>headed?</em>
            </h1>
            <input
              className="ie-search-input"
              placeholder="Search a region or town…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <button
              onClick={useNearMe}
              disabled={geoLoading}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 14,
                fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 500,
                color: 'var(--color-sage)', background: 'none', border: 'none', cursor: 'pointer',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              </svg>
              {geoLoading ? 'Finding you…' : 'Use my location'}
            </button>

            <div style={{ marginTop: 24 }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 6 }}>
                {query.trim() ? 'Matches' : 'Popular right now'}
              </p>
              {matches.length === 0 && (
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)', padding: '16px 0' }}>
                  No regions match “{query}”. Try a nearby town or region.
                </p>
              )}
              {matches.map((r) => (
                <button key={r.slug} className="ie-region-row" onClick={() => pickRegion(r)}>
                  <span className="ie-region-name">{r.name}</span>
                  <span className="ie-region-meta">
                    {r.state}
                    {r.listing_count ? ` · ${r.listing_count} places` : ''}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1 — How long */}
        {step === 1 && (
          <div className="ie-step" key="s1">
            <p className="ie-eyebrow" style={{ marginBottom: 14 }}>{destination?.regionName}</p>
            <h1 className="ie-question" style={{ marginBottom: 28 }}>
              How long is <em style={{ fontStyle: 'italic' }}>the trip?</em>
            </h1>
            {TRIP_LENGTHS.map((t, i) => (
              <button
                key={t.days}
                className={`ie-option${dayCount === t.days ? ' sel' : ''}`}
                onClick={() => {
                  setDayCount(t.days)
                  setTimeout(() => setStep(2), 160)
                }}
              >
                <span className="ie-option-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="ie-option-body">
                  <span className="ie-option-title">{t.label}</span>
                  <span className="ie-option-hint">{t.hint}</span>
                </span>
                <span className="ie-option-arrow">→</span>
              </button>
            ))}
          </div>
        )}

        {/* Step 2 — Interests */}
        {step === 2 && (
          <div className="ie-step" key="s2">
            <p className="ie-eyebrow" style={{ marginBottom: 14 }}>{destination?.regionName}</p>
            <h1 className="ie-question" style={{ marginBottom: 12 }}>
              What are you <em style={{ fontStyle: 'italic' }}>into?</em>
            </h1>
            <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 15.5, lineHeight: 1.6, color: 'var(--color-muted)', marginBottom: 26, maxWidth: 460 }}>
              Pick a few — we’ll surface the right places to add as you build. You can change these anytime.
            </p>
            <div className="ie-chips">
              {INTERESTS.map((it) => (
                <button
                  key={it.vertical}
                  className={`ie-chip${interests.includes(it.vertical) ? ' on' : ''}`}
                  onClick={() => toggleInterest(it.vertical)}
                >
                  <span className="ie-chip-label">{it.label}</span>
                  <span className="ie-chip-hint">{it.hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3 — Pace */}
        {step === 3 && (
          <div className="ie-step" key="s3">
            <p className="ie-eyebrow" style={{ marginBottom: 14 }}>Almost there</p>
            <h1 className="ie-question" style={{ marginBottom: 28 }}>
              What’s your <em style={{ fontStyle: 'italic' }}>pace?</em>
            </h1>
            {PACES.map((p, i) => (
              <button
                key={p.key}
                className={`ie-option${pace === p.key ? ' sel' : ''}`}
                onClick={() => setPace(p.key)}
              >
                <span className="ie-option-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="ie-option-body">
                  <span className="ie-option-title">{p.label}</span>
                  <span className="ie-option-hint">{p.hint}</span>
                </span>
                <span className="ie-option-arrow" style={{ opacity: pace === p.key ? 1 : 0, transform: 'none' }}>
                  {pace === p.key ? '✓' : '→'}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Continue / finish */}
        {(step === 2 || step === 3) && (
          <div style={{ marginTop: 36 }}>
            <button
              onClick={() => (step === 3 ? finish() : setStep(3))}
              disabled={!canContinue}
              className="btn btn-primary"
              style={{ opacity: canContinue ? 1 : 0.5 }}
            >
              {step === 3 ? 'Start building →' : 'Continue →'}
            </button>
            {step === 2 && interests.length === 0 && (
              <button
                onClick={() => setStep(3)}
                style={{ marginLeft: 16, fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--color-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Show me everything
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
