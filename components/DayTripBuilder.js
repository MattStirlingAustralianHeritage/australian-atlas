'use client'

import { useState, useRef } from 'react'
import DayTripCard from './DayTripCard'

const SAGE = '#5F8A7E'

const DAY_OPTIONS = [
  { value: 2, label: '2 days' },
  { value: 3, label: '3 days' },
  { value: 4, label: '4 days' },
  { value: 5, label: '5 days' },
]

/**
 * "Stay here, explore from here" — day trip generator for Rest Atlas listings.
 * Rendered on listing detail pages when vertical === 'rest'.
 */
export default function DayTripBuilder({ listing, mapboxToken }) {
  const [numDays, setNumDays] = useState(3)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [shareUrl, setShareUrl] = useState(null)
  const [copied, setCopied] = useState(false)
  const resultsRef = useRef(null)

  async function handleBuild() {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/day-trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_listing_id: listing.id,
          num_days: numDays,
          max_radius_km: 60,
          travel_mode: 'drive',
        }),
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        setError(data.message || data.error || 'Something went wrong. Please try again.')
        return
      }

      setResult(data)

      // Scroll results into view after render
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!result || saving) return
    setSaving(true)

    try {
      const tripId = result.trip_id || crypto.randomUUID()

      // Save each day as a trail with shared trip_id
      for (const day of result.days) {
        await fetch('/api/trails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `Day ${day.day_number}: ${day.theme}`,
            description: `Day trip from ${listing.name} — ${day.direction ? `heading ${day.direction}` : 'exploring nearby'}`,
            type: 'day_trip',
            visibility: 'link',
            region: listing.region || null,
            vertical_focus: null,
            transport_mode: 'drive',
            saved_via: 'day_trip_builder',
            trip_id: tripId,
            base_listing_id: listing.id,
            day_number: day.day_number,
            day_theme: day.theme,
            total_distance_km: day.total_distance_km,
            estimated_drive_minutes: day.estimated_drive_minutes,
            stops: day.stops.map((stop, i) => ({
              listing_id: stop.listing_id,
              vertical: stop.vertical,
              venue_name: stop.name,
              venue_lat: stop.lat,
              venue_lng: stop.lng,
              venue_image_url: stop.hero_image_url || null,
              order_index: i,
              notes: stop.description_snippet || null,
              distance_from_base_km: stop.distance_from_base_km,
              bearing_from_base_deg: stop.bearing_from_base_deg,
            })),
          }),
        })
      }

      const url = `${window.location.origin}/day-trip/${tripId}`
      setShareUrl(url)
    } catch {
      setError('Could not save this trip. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function handleCopy() {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <section style={{
      marginTop: 40,
      paddingTop: 40,
      borderTop: '1px solid var(--color-border)',
    }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400,
          fontSize: 'clamp(20px, 3vw, 26px)', color: 'var(--color-ink)',
          lineHeight: 1.3, margin: '0 0 8px',
        }}>
          Plan your stay
        </h2>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14,
          color: 'var(--color-muted)', lineHeight: 1.6, margin: 0,
        }}>
          Use {listing.name} as your base and we&apos;ll plan day trips into the surrounding area.
        </p>
      </div>

      {/* Controls */}
      {!result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Day count selector */}
          <div>
            <p style={{
              fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
              letterSpacing: '0.14em', textTransform: 'uppercase',
              color: 'var(--color-muted)', marginBottom: 8,
            }}>
              How many days?
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              {DAY_OPTIONS.map(opt => {
                const active = numDays === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => setNumDays(opt.value)}
                    style={{
                      fontFamily: 'var(--font-body)', fontWeight: active ? 500 : 400,
                      fontSize: 13, lineHeight: 1.4,
                      color: active ? 'var(--color-ink)' : 'var(--color-muted)',
                      background: active ? 'var(--color-cream)' : '#fff',
                      border: active ? `1.5px solid ${SAGE}` : '1px solid var(--color-border)',
                      borderRadius: 8, padding: '10px 18px',
                      cursor: 'pointer', transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={e => {
                      if (!active) {
                        e.currentTarget.style.borderColor = SAGE
                        e.currentTarget.style.background = 'var(--color-cream)'
                      }
                    }}
                    onMouseLeave={e => {
                      if (!active) {
                        e.currentTarget.style.borderColor = 'var(--color-border)'
                        e.currentTarget.style.background = '#fff'
                      }
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Build button */}
          <button
            onClick={handleBuild}
            disabled={loading}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              alignSelf: 'flex-start',
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13,
              color: '#fff', background: 'var(--color-ink)',
              border: 'none', borderRadius: 8, padding: '12px 28px',
              cursor: loading ? 'wait' : 'pointer',
              transition: 'opacity 0.15s',
              opacity: loading ? 0.6 : 1,
              letterSpacing: '0.02em',
            }}
          >
            {loading ? (
              <>
                <span style={{
                  width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff', borderRadius: '50%',
                  animation: 'dtSpin 0.8s linear infinite',
                }} />
                Planning your days from {listing.name}...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                </svg>
                Plan my days
              </>
            )}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          marginTop: 16, padding: '14px 18px',
          background: '#fdf8f0', border: '1px solid var(--color-border)',
          borderRadius: 8,
        }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 13,
            color: 'var(--color-muted)', margin: 0,
          }}>
            {error}
          </p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div ref={resultsRef} style={{ scrollMarginTop: 80 }}>
          {/* Trip summary */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            marginBottom: 20,
          }}>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 400,
              color: 'var(--color-muted)', margin: 0,
            }}>
              {result.days.length} day{result.days.length !== 1 ? 's' : ''} &middot;{' '}
              {result.days.reduce((n, d) => n + d.stops.length, 0)} stops &middot;{' '}
              within {result.radius_used_km}km
            </p>
            <button
              onClick={() => { setResult(null); setError(null); setShareUrl(null) }}
              style={{
                fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
                color: SAGE, background: 'none', border: 'none',
                cursor: 'pointer', textDecoration: 'underline',
                textUnderlineOffset: 3,
              }}
            >
              Rebuild
            </button>

            {/* Save & Share */}
            {!shareUrl ? (
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
                  color: '#fff', background: SAGE, border: 'none',
                  borderRadius: 6, padding: '6px 16px',
                  cursor: saving ? 'wait' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                  transition: 'opacity 0.15s',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                {saving ? 'Saving...' : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
                    </svg>
                    Save &amp; share
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleCopy}
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
                  color: SAGE, background: `${SAGE}12`, border: `1px solid ${SAGE}`,
                  borderRadius: 6, padding: '6px 16px',
                  cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
                {copied ? 'Copied!' : 'Copy link'}
              </button>
            )}
          </div>

          {/* Coverage note (from API) */}
          {result.coverage_note && (
            <div style={{
              padding: '12px 16px', marginBottom: 16,
              background: '#fdf8f0', border: '1px solid var(--color-border)',
              borderRadius: 8,
            }}>
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: 13,
                color: 'var(--color-muted)', margin: 0, lineHeight: 1.6,
              }}>
                {result.coverage_note}
              </p>
            </div>
          )}

          {/* Day cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {result.days.map(day => (
              <DayTripCard
                key={day.day_number}
                day={day}
                base={result.base}
                mapboxToken={mapboxToken}
              />
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes dtSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </section>
  )
}
