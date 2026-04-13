'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'

// ── Constants ────────────────────────────────────────────────
const CITIES = [
  'Sydney', 'Melbourne', 'Brisbane', 'Adelaide', 'Perth',
  'Hobart', 'Canberra', 'Darwin', 'Gold Coast', 'Newcastle', 'Wollongong',
]

const RADIUS_OPTIONS = [
  { value: '1h', label: '1 hour' },
  { value: '2h', label: '2 hours' },
  { value: '3h', label: '3 hours' },
  { value: 'anywhere', label: 'Anywhere' },
]

const GROUP_OPTIONS = [
  { value: 'Solo', label: 'Solo' },
  { value: 'Couple', label: 'Couple' },
  { value: 'Friends', label: 'Friends' },
  { value: 'Family with kids', label: 'Family with kids' },
]

const VIBE_OPTIONS = [
  { value: 'Relaxed', label: 'Relaxed' },
  { value: 'Adventurous', label: 'Adventurous' },
  { value: 'Cultural', label: 'Cultural' },
  { value: 'Foodie', label: 'Foodie' },
  { value: 'Nature', label: 'Nature' },
  { value: 'All of the above', label: 'All of the above' },
]

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

// ── Component ────────────────────────────────────────────────
export default function LongWeekendClient() {
  const formRef = useRef(null)

  // Form state
  const [city, setCity] = useState('')
  const [radius, setRadius] = useState('2h')
  const [group, setGroup] = useState('')
  const [vibes, setVibes] = useState([])

  // Result state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [saveStatus, setSaveStatus] = useState(null)
  const [copied, setCopied] = useState(false)

  const toggleVibe = useCallback((vibe) => {
    setVibes(prev => {
      if (vibe === 'All of the above') {
        // If selecting "All", toggle all on/off
        if (prev.includes('All of the above')) return []
        return VIBE_OPTIONS.map(v => v.value)
      }
      // If toggling an individual vibe, remove "All of the above" logic
      const without = prev.filter(v => v !== 'All of the above')
      if (without.includes(vibe)) {
        return without.filter(v => v !== vibe)
      }
      const next = [...without, vibe]
      // If all individual vibes are selected, add "All of the above" too
      const allIndividual = VIBE_OPTIONS.filter(v => v.value !== 'All of the above').every(v => next.includes(v.value))
      if (allIndividual) return VIBE_OPTIONS.map(v => v.value)
      return next
    })
  }, [])

  const canSubmit = city && radius && group && vibes.length > 0

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    setResult(null)
    setSaveStatus(null)
    setCopied(false)

    try {
      const res = await fetch('/api/long-weekend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city, radius, group, vibes: vibes.filter(v => v !== 'All of the above') }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        return
      }

      setResult(data)
    } catch (err) {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [canSubmit, city, radius, group, vibes])

  const handleSaveTrail = useCallback(async () => {
    if (!result?.itinerary) return
    setSaveStatus('saving')

    try {
      const { itinerary } = result
      const stops = []
      let orderIndex = 0

      for (const day of itinerary.days || []) {
        for (const stop of day.stops || []) {
          if (stop.listing) {
            stops.push({
              listing_id: stop.listing.id,
              vertical: stop.listing.vertical,
              venue_name: stop.listing.name,
              venue_lat: stop.listing.lat,
              venue_lng: stop.listing.lng,
              venue_image_url: stop.listing.hero_image_url || null,
              order_index: orderIndex++,
              notes: stop.notes || null,
            })
          }
        }
      }

      // Include accommodation as a stop too
      if (itinerary.accommodation?.listing) {
        const acc = itinerary.accommodation
        stops.push({
          listing_id: acc.listing.id,
          vertical: acc.listing.vertical,
          venue_name: acc.listing.name,
          venue_lat: acc.listing.lat,
          venue_lng: acc.listing.lng,
          venue_image_url: acc.listing.hero_image_url || null,
          order_index: orderIndex++,
          notes: acc.notes || null,
        })
      }

      const res = await fetch('/api/trails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: itinerary.title || 'Long Weekend Trip',
          description: itinerary.summary || null,
          type: 'user',
          visibility: 'private',
          region: itinerary.region || null,
          stops,
        }),
      })

      if (res.ok) {
        setSaveStatus('saved')
      } else {
        const data = await res.json()
        if (res.status === 401) {
          setSaveStatus('auth')
        } else {
          setSaveStatus('error')
        }
      }
    } catch {
      setSaveStatus('error')
    }
  }, [result])

  const handleShare = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [])

  const handleAdjust = useCallback(() => {
    formRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const summaryText = canSubmit
    ? `A ${vibes.filter(v => v !== 'All of the above').join(', ').toLowerCase()} weekend for ${group === 'Solo' ? 'one' : group === 'Couple' ? 'two' : group.toLowerCase()}, ${radius === 'anywhere' ? 'anywhere from' : radius.replace('h', ' hour') + (radius !== '1h' ? 's' : '') + ' from'} ${city}`
    : null

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-bg, #faf8f5)' }}>
      {/* ── Hero header ─────────────────────────────────────── */}
      <header style={{
        padding: '80px 24px 48px',
        textAlign: 'center',
        maxWidth: 720,
        margin: '0 auto',
      }}>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'var(--color-muted, #8a8a8a)',
          marginBottom: 16,
        }}>
          Plan your escape
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(32px, 5vw, 52px)',
          fontWeight: 400,
          color: 'var(--color-ink, #1a1a1a)',
          lineHeight: 1.15,
          marginBottom: 16,
        }}>
          Build a long weekend
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 17,
          lineHeight: 1.6,
          color: 'var(--color-muted, #8a8a8a)',
          maxWidth: 540,
          margin: '0 auto',
        }}>
          Tell us where you are starting, who you are travelling with, and what kind of weekend
          you are after. We will pull together a 3-day itinerary from the best independent places nearby.
        </p>
      </header>

      {/* ── Form ────────────────────────────────────────────── */}
      <section ref={formRef} style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '0 24px 64px',
      }}>
        {/* Departure city */}
        <FormSection label="Departing from">
          <select
            value={city}
            onChange={e => setCity(e.target.value)}
            style={{
              ...selectStyle,
              color: city ? 'var(--color-ink, #1a1a1a)' : 'var(--color-muted, #8a8a8a)',
            }}
          >
            <option value="">Choose your city</option>
            {CITIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </FormSection>

        {/* Drive radius */}
        <FormSection label="How far will you drive?">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {RADIUS_OPTIONS.map(opt => (
              <PillButton
                key={opt.value}
                label={opt.label}
                selected={radius === opt.value}
                onClick={() => setRadius(opt.value)}
              />
            ))}
          </div>
        </FormSection>

        {/* Travel group */}
        <FormSection label="Who is coming?">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {GROUP_OPTIONS.map(opt => (
              <PillButton
                key={opt.value}
                label={opt.label}
                selected={group === opt.value}
                onClick={() => setGroup(opt.value)}
              />
            ))}
          </div>
        </FormSection>

        {/* Vibes */}
        <FormSection label="What is the vibe?">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {VIBE_OPTIONS.map(opt => (
              <ChipButton
                key={opt.value}
                label={opt.label}
                selected={vibes.includes(opt.value)}
                onClick={() => toggleVibe(opt.value)}
              />
            ))}
          </div>
        </FormSection>

        {/* Submit */}
        <div style={{ marginTop: 40, textAlign: 'center' }}>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || loading}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 16,
              fontWeight: 500,
              padding: '16px 40px',
              borderRadius: 8,
              border: 'none',
              cursor: canSubmit && !loading ? 'pointer' : 'default',
              backgroundColor: canSubmit ? 'var(--color-sage, #6b7c5a)' : 'var(--color-border, #e0ddd8)',
              color: canSubmit ? '#fff' : 'var(--color-muted, #8a8a8a)',
              transition: 'all 0.2s ease',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Building...' : 'Build my long weekend'}
          </button>
        </div>
      </section>

      {/* ── Loading state ───────────────────────────────────── */}
      {loading && (
        <section style={{
          maxWidth: 640,
          margin: '0 auto',
          padding: '0 24px 64px',
          textAlign: 'center',
        }}>
          <div style={{
            padding: '48px 32px',
            backgroundColor: '#fff',
            borderRadius: 12,
            border: '1px solid var(--color-border, #e0ddd8)',
          }}>
            <div style={{ marginBottom: 24 }}>
              <div style={{
                width: 200,
                height: 3,
                backgroundColor: 'var(--color-border, #e0ddd8)',
                borderRadius: 2,
                margin: '0 auto',
                overflow: 'hidden',
              }}>
                <div style={{
                  width: '40%',
                  height: '100%',
                  backgroundColor: 'var(--color-sage, #6b7c5a)',
                  borderRadius: 2,
                  animation: 'lw-pulse 1.5s ease-in-out infinite',
                }} />
              </div>
            </div>
            <p style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              color: 'var(--color-ink, #1a1a1a)',
              marginBottom: 12,
            }}>
              Building your long weekend...
            </p>
            {summaryText && (
              <p style={{
                fontFamily: 'var(--font-body)',
                fontSize: 15,
                color: 'var(--color-muted, #8a8a8a)',
                fontStyle: 'italic',
              }}>
                {summaryText}
              </p>
            )}
          </div>
          <style>{`
            @keyframes lw-pulse {
              0%, 100% { transform: translateX(-100%); }
              50% { transform: translateX(250%); }
            }
          `}</style>
        </section>
      )}

      {/* ── Error state ─────────────────────────────────────── */}
      {error && !loading && (
        <section style={{
          maxWidth: 640,
          margin: '0 auto',
          padding: '0 24px 64px',
          textAlign: 'center',
        }}>
          <div style={{
            padding: '32px',
            backgroundColor: '#fef2f2',
            borderRadius: 12,
            border: '1px solid #fecaca',
          }}>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: 15,
              color: '#991b1b',
            }}>
              {error}
            </p>
          </div>
        </section>
      )}

      {/* ── Results ─────────────────────────────────────────── */}
      {result && !loading && (
        <ItineraryResults
          result={result}
          onSave={handleSaveTrail}
          saveStatus={saveStatus}
          onShare={handleShare}
          copied={copied}
          onAnother={handleSubmit}
          onAdjust={handleAdjust}
        />
      )}
    </div>
  )
}

// ── Form building blocks ─────────────────────────────────────

function FormSection({ label, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <label style={{
        display: 'block',
        fontFamily: 'var(--font-display)',
        fontSize: 18,
        color: 'var(--color-ink, #1a1a1a)',
        marginBottom: 12,
      }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function PillButton({ label, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: 14,
        padding: '10px 20px',
        borderRadius: 100,
        border: `1.5px solid ${selected ? 'var(--color-sage, #6b7c5a)' : 'var(--color-border, #e0ddd8)'}`,
        backgroundColor: selected ? 'var(--color-sage, #6b7c5a)' : 'transparent',
        color: selected ? '#fff' : 'var(--color-ink, #1a1a1a)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

function ChipButton({ label, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: 13,
        padding: '8px 16px',
        borderRadius: 100,
        border: `1.5px solid ${selected ? 'var(--color-sage, #6b7c5a)' : 'var(--color-border, #e0ddd8)'}`,
        backgroundColor: selected ? 'rgba(107, 124, 90, 0.1)' : 'transparent',
        color: selected ? 'var(--color-sage, #6b7c5a)' : 'var(--color-muted, #8a8a8a)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        fontWeight: selected ? 600 : 400,
        whiteSpace: 'nowrap',
      }}
    >
      {selected ? '+ ' : ''}{label}
    </button>
  )
}

const selectStyle = {
  fontFamily: 'var(--font-body)',
  fontSize: 15,
  padding: '12px 16px',
  borderRadius: 8,
  border: '1.5px solid var(--color-border, #e0ddd8)',
  backgroundColor: '#fff',
  width: '100%',
  appearance: 'none',
  WebkitAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%238a8a8a' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 16px center',
  cursor: 'pointer',
  outline: 'none',
}

// ── Itinerary results ────────────────────────────────────────

function ItineraryResults({ result, onSave, saveStatus, onShare, copied, onAnother, onAdjust }) {
  const { itinerary, meta } = result

  return (
    <section style={{
      maxWidth: 720,
      margin: '0 auto',
      padding: '0 24px 80px',
    }}>
      {/* Title block */}
      <div style={{
        textAlign: 'center',
        marginBottom: 48,
        paddingTop: 16,
        borderTop: '1px solid var(--color-border, #e0ddd8)',
      }}>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'var(--color-muted, #8a8a8a)',
          marginBottom: 12,
        }}>
          Your long weekend
        </p>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(28px, 4.5vw, 42px)',
          fontWeight: 400,
          color: 'var(--color-ink, #1a1a1a)',
          lineHeight: 1.2,
          marginBottom: 8,
        }}>
          {itinerary.title}
        </h2>
        {itinerary.region && (
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            color: 'var(--color-sage, #6b7c5a)',
            fontWeight: 500,
            marginBottom: 16,
          }}>
            {itinerary.region}
          </p>
        )}
        {itinerary.summary && (
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 16,
            lineHeight: 1.65,
            color: 'var(--color-muted, #8a8a8a)',
            maxWidth: 560,
            margin: '0 auto',
          }}>
            {itinerary.summary}
          </p>
        )}
      </div>

      {/* Accommodation card */}
      {itinerary.accommodation?.listing && (
        <div style={{
          marginBottom: 40,
          padding: 24,
          backgroundColor: '#fff',
          borderRadius: 12,
          border: '1px solid var(--color-border, #e0ddd8)',
          display: 'flex',
          gap: 20,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}>
          {itinerary.accommodation.listing.hero_image_url && (
            <div style={{
              width: 100,
              height: 100,
              borderRadius: 8,
              overflow: 'hidden',
              flexShrink: 0,
            }}>
              <Image
                src={itinerary.accommodation.listing.hero_image_url}
                alt={itinerary.accommodation.listing_name || ''}
                width={100}
                height={100}
                style={{ objectFit: 'cover', width: '100%', height: '100%' }}
              />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: VERTICAL_COLORS.rest,
              fontWeight: 600,
              marginBottom: 4,
            }}>
              Your base
            </p>
            <Link
              href={`/place/${itinerary.accommodation.listing.slug}`}
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 20,
                color: 'var(--color-ink, #1a1a1a)',
                textDecoration: 'none',
              }}
            >
              {itinerary.accommodation.listing_name}
            </Link>
            {itinerary.accommodation.notes && (
              <p style={{
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                color: 'var(--color-muted, #8a8a8a)',
                marginTop: 6,
                lineHeight: 1.5,
              }}>
                {itinerary.accommodation.notes}
              </p>
            )}
            <VerticalBadge vertical={itinerary.accommodation.listing.vertical} />
          </div>
        </div>
      )}

      {/* Day-by-day itinerary */}
      {(itinerary.days || []).map((day, dayIdx) => (
        <div key={dayIdx} style={{ marginBottom: 48 }}>
          {/* Day heading */}
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 12,
            marginBottom: 20,
            paddingBottom: 12,
            borderBottom: '1px solid var(--color-border, #e0ddd8)',
          }}>
            <span style={{
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--color-sage, #6b7c5a)',
              fontWeight: 600,
            }}>
              Day {day.day_number}
            </span>
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              color: 'var(--color-ink, #1a1a1a)',
              fontWeight: 400,
            }}>
              {day.theme}
            </span>
          </div>

          {/* Stops */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {(day.stops || []).map((stop, stopIdx) => (
              <StopCard key={stopIdx} stop={stop} />
            ))}
          </div>
        </div>
      ))}

      {/* Action buttons */}
      <div style={{
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        justifyContent: 'center',
        marginTop: 48,
        paddingTop: 32,
        borderTop: '1px solid var(--color-border, #e0ddd8)',
      }}>
        <ActionButton
          label={saveStatus === 'saved' ? 'Saved!' : saveStatus === 'saving' ? 'Saving...' : saveStatus === 'auth' ? 'Sign in to save' : saveStatus === 'error' ? 'Save failed' : 'Save this trip'}
          onClick={onSave}
          disabled={saveStatus === 'saving' || saveStatus === 'saved'}
          primary
        />
        <ActionButton
          label={copied ? 'Copied!' : 'Share'}
          onClick={onShare}
        />
        <ActionButton
          label="Build me another"
          onClick={onAnother}
        />
        <ActionButton
          label="Adjust"
          onClick={onAdjust}
        />
      </div>
    </section>
  )
}

function StopCard({ stop }) {
  const listing = stop.listing
  if (!listing) return null

  return (
    <div style={{
      display: 'flex',
      gap: 16,
      padding: 16,
      backgroundColor: '#fff',
      borderRadius: 10,
      border: '1px solid var(--color-border, #e0ddd8)',
      transition: 'box-shadow 0.15s ease',
      alignItems: 'flex-start',
    }}>
      {/* Thumbnail */}
      {listing.hero_image_url && (
        <div style={{
          width: 80,
          height: 80,
          borderRadius: 6,
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          <Image
            src={listing.hero_image_url}
            alt={listing.name || ''}
            width={80}
            height={80}
            style={{ objectFit: 'cover', width: '100%', height: '100%' }}
          />
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <Link
            href={`/place/${listing.slug}`}
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 17,
              color: 'var(--color-ink, #1a1a1a)',
              textDecoration: 'none',
              lineHeight: 1.3,
            }}
          >
            {stop.listing_name || listing.name}
          </Link>
          <VerticalBadge vertical={listing.vertical} />
        </div>

        {/* Time + duration */}
        <div style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          marginBottom: 6,
        }}>
          {stop.arrival_time && (
            <span style={{
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              color: 'var(--color-sage, #6b7c5a)',
              fontWeight: 600,
            }}>
              {stop.arrival_time}
            </span>
          )}
          {stop.duration_minutes && (
            <span style={{
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              color: 'var(--color-muted, #8a8a8a)',
            }}>
              {stop.duration_minutes >= 60
                ? `${Math.floor(stop.duration_minutes / 60)}h${stop.duration_minutes % 60 ? ` ${stop.duration_minutes % 60}m` : ''}`
                : `${stop.duration_minutes}m`}
            </span>
          )}
        </div>

        {/* Notes */}
        {stop.notes && (
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            color: 'var(--color-muted, #8a8a8a)',
            lineHeight: 1.5,
            margin: 0,
          }}>
            {stop.notes}
          </p>
        )}
      </div>
    </div>
  )
}

function VerticalBadge({ vertical }) {
  if (!vertical) return null
  const color = VERTICAL_COLORS[vertical] || '#6b7c5a'
  const name = VERTICAL_NAMES[vertical] || vertical

  return (
    <span style={{
      display: 'inline-block',
      fontFamily: 'var(--font-body)',
      fontSize: 10,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      fontWeight: 600,
      color: color,
      backgroundColor: `${color}14`,
      padding: '3px 8px',
      borderRadius: 4,
      whiteSpace: 'nowrap',
    }}>
      {name}
    </span>
  )
}

function ActionButton({ label, onClick, disabled, primary }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: 14,
        fontWeight: 500,
        padding: '10px 24px',
        borderRadius: 8,
        border: primary ? 'none' : '1.5px solid var(--color-border, #e0ddd8)',
        backgroundColor: primary ? 'var(--color-sage, #6b7c5a)' : 'transparent',
        color: primary ? '#fff' : 'var(--color-ink, #1a1a1a)',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'all 0.15s ease',
        opacity: disabled ? 0.6 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}
