'use client'

import { useReducer, useEffect, useRef, useCallback, useState } from 'react'

/* ─── Region data ────────────────────────────────────────────────────────
   25 regions with ≥5 active Rest listings (from coverage audit).
   Will swap for a real fetch in a later build.                          */
const COVERED_REGIONS = [
  { name: 'Hobart & Southern Tasmania', state: 'TAS' },
  { name: 'Sydney', state: 'NSW' },
  { name: 'Hobart City', state: 'TAS' },
  { name: 'Adelaide', state: 'SA' },
  { name: 'Launceston & Tamar Valley', state: 'TAS' },
  { name: 'Perth', state: 'WA' },
  { name: 'Scenic Rim', state: 'QLD' },
  { name: 'Adelaide Hills', state: 'SA' },
  { name: 'Margaret River', state: 'WA' },
  { name: 'Cradle Country', state: 'TAS' },
  { name: 'Sunshine Coast Hinterland', state: 'QLD' },
  { name: 'Barossa Valley', state: 'SA' },
  { name: 'Darwin & Top End', state: 'NT' },
  { name: 'Blue Mountains', state: 'NSW' },
  { name: 'Cairns & Tropical North', state: 'QLD' },
  { name: 'Brisbane', state: 'QLD' },
  { name: 'Melbourne', state: 'VIC' },
  { name: 'Yarra Valley', state: 'VIC' },
  { name: 'Canberra District', state: 'ACT' },
  { name: 'Southern Highlands', state: 'NSW' },
  { name: 'Victorian High Country', state: 'VIC' },
  { name: 'McLaren Vale', state: 'SA' },
  { name: 'East Coast Tasmania', state: 'TAS' },
  { name: 'South Coast NSW', state: 'NSW' },
]

/* ─── Question definitions ───────────────────────────────────────────── */
const INTENT_OPTIONS = [
  { id: 'food-and-producers', label: 'Food and producers', sub: 'Farm gates, long lunches, the people who make what you eat.' },
  { id: 'landscape-and-walking', label: 'Landscape and walking', sub: 'Coast, ranges, gorges, the slow kind of day outside.' },
  { id: 'makers-and-craft', label: 'Makers and craft', sub: 'Studios, kilns, looms, the things being made by hand.' },
  { id: 'quiet-and-slow', label: 'Quiet and slow', sub: 'Less moving, more sitting. A book, a view, a meal.' },
  { id: 'a-bit-of-everything', label: 'A bit of everything', sub: 'Mixed days. Trust us.' },
]

const PACING_OPTIONS = [
  { id: 'out-early-back-late', label: 'Out early, back late', sub: 'Big walks, long drives, full days.' },
  { id: 'steady', label: 'Steady', sub: 'Moderate days, time to linger.' },
  { id: 'as-little-driving', label: 'As little driving as we can manage', sub: 'Anchored close, mostly local.' },
  { id: 'surprise-us', label: 'Surprise us', sub: "Whatever fits the rest of what you've said." },
]

const DURATION_OPTIONS = [
  { id: 2, label: '2' },
  { id: 3, label: '3' },
  { id: 4, label: '4' },
  { id: 5, label: '5' },
  { id: 6, label: 'Longer' },
]

const SEASON_OPTIONS = [
  { id: 'this-month', label: 'This month' },
  { id: 'next-month', label: 'Next month' },
  { id: 'a-few-months-out', label: 'A few months out' },
  { id: 'just-exploring', label: 'Just exploring' },
]

/* ─── Steps in order ─────────────────────────────────────────────────── */
const STEPS = ['intent', 'pacing', 'duration', 'region', 'season', 'loading', 'output']

/* ─── Season sensitivity ─────────────────────────────────────────────── */
const SEASONAL_REGIONS = new Set(['Darwin & Top End', 'Cairns & Tropical North'])

function computeNeedsSeason(state) {
  if (SEASONAL_REGIONS.has(state.region)) return true
  if (state.intent.includes('food-and-producers')) return true
  return false
}

/* ─── Reducer ────────────────────────────────────────────────────────── */
const INITIAL_STATE = {
  step: 'intent',
  intent: [],
  pacing: null,
  duration: null,
  region: null,
  hasAnchor: false,
  needsSeason: false,
  season: null,
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_INTENT': {
      let next = [...state.intent]
      const idx = next.indexOf(action.value)
      if (idx >= 0) {
        next.splice(idx, 1)
      } else {
        if (next.length >= 2) next.shift()
        next.push(action.value)
      }
      const updated = { ...state, intent: next }
      updated.needsSeason = computeNeedsSeason(updated)
      return updated
    }
    case 'SET_PACING':
      return { ...state, pacing: action.value }
    case 'SET_DURATION':
      return { ...state, duration: action.value }
    case 'SET_REGION': {
      const updated = { ...state, region: action.value }
      updated.needsSeason = computeNeedsSeason(updated)
      return updated
    }
    case 'SET_SEASON':
      return { ...state, season: action.value }
    case 'ADVANCE': {
      const currentIdx = STEPS.indexOf(state.step)
      if (currentIdx < 0) return state
      let nextIdx = currentIdx + 1
      // Skip season if not needed
      if (STEPS[nextIdx] === 'season' && !state.needsSeason) nextIdx++
      if (nextIdx >= STEPS.length) return state
      return { ...state, step: STEPS[nextIdx] }
    }
    case 'GO_TO_STEP':
      return { ...state, step: action.value }
    case 'RESET':
      return { ...INITIAL_STATE }
    default:
      return state
  }
}

/* ─── Summary text helpers ───────────────────────────────────────────── */
function intentSummary(ids) {
  return ids.map(id => INTENT_OPTIONS.find(o => o.id === id)?.label).filter(Boolean).join(', ')
}

function pacingSummary(id) {
  return PACING_OPTIONS.find(o => o.id === id)?.label || ''
}

function durationSummary(val) {
  if (val === 6) return 'Longer'
  return val ? `${val} days` : ''
}

function regionSummary(val) {
  if (val === '__not_sure') return 'Not sure yet'
  return val || ''
}

function seasonSummary(id) {
  return SEASON_OPTIONS.find(o => o.id === id)?.label || ''
}

/* ─── Progress dots ──────────────────────────────────────────────────── */
function ProgressDots({ currentStep, needsSeason }) {
  const visibleSteps = ['intent', 'pacing', 'duration', 'region']
  if (needsSeason) visibleSteps.push('season')
  const currentIdx = visibleSteps.indexOf(currentStep)

  // Don't show on loading/output
  if (currentStep === 'loading' || currentStep === 'output') return null

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      gap: 8,
      padding: '48px 0 32px',
    }}>
      {visibleSteps.map((step, i) => {
        const isCurrent = step === currentStep
        const isCompleted = i < currentIdx
        return (
          <div
            key={step}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: isCurrent
                ? 'var(--color-ink, #1C1A17)'
                : isCompleted
                  ? 'var(--color-muted, #6B6760)'
                  : 'var(--color-border, rgba(28,26,23,0.12))',
              transition: 'background-color 0.3s ease',
            }}
          />
        )
      })}
    </div>
  )
}

/* ─── Answer summary line (tappable to go back) ──────────────────────── */
function SummaryLine({ text, onClick, visible }) {
  if (!visible || !text) return null
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        background: 'none',
        border: 'none',
        padding: '6px 0',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'var(--font-body)',
        fontSize: 14,
        color: 'var(--color-muted, #6B6760)',
        lineHeight: 1.4,
        letterSpacing: '0.01em',
      }}
    >
      <span style={{ opacity: 0.55 }}>You said:</span>{' '}
      <span style={{ opacity: 0.8 }}>{text}</span>
    </button>
  )
}

/* ─── Question wrapper with slide-in animation ───────────────────────── */
function QuestionScreen({ children, visible }) {
  const ref = useRef(null)
  const hasAnimated = useRef(false)

  useEffect(() => {
    if (visible && ref.current && !hasAnimated.current) {
      hasAnimated.current = true
      ref.current.style.opacity = '0'
      ref.current.style.transform = 'translateY(16px)'
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (ref.current) {
            ref.current.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out'
            ref.current.style.opacity = '1'
            ref.current.style.transform = 'translateY(0)'
          }
        })
      })
    }
    if (!visible) {
      hasAnimated.current = false
    }
  }, [visible])

  if (!visible) return null

  return (
    <div ref={ref} style={{ opacity: 0, transform: 'translateY(16px)' }}>
      {children}
    </div>
  )
}

/* ─── Option card ────────────────────────────────────────────────────── */
function OptionCard({ label, sub, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '18px 20px',
        background: selected ? 'rgba(28, 26, 23, 0.04)' : 'transparent',
        border: selected
          ? '1.5px solid var(--color-ink, #1C1A17)'
          : '1px solid var(--color-border, rgba(28,26,23,0.12))',
        borderRadius: 10,
        cursor: 'pointer',
        transition: 'border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease',
        minHeight: 48,
        fontFamily: 'var(--font-body)',
      }}
      onMouseEnter={e => {
        if (!selected) {
          e.currentTarget.style.borderColor = 'rgba(28,26,23,0.3)'
          e.currentTarget.style.backgroundColor = 'rgba(28,26,23,0.02)'
        }
      }}
      onMouseLeave={e => {
        if (!selected) {
          e.currentTarget.style.borderColor = 'var(--color-border, rgba(28,26,23,0.12))'
          e.currentTarget.style.backgroundColor = 'transparent'
        }
      }}
    >
      <span style={{
        display: 'block',
        fontWeight: 600,
        fontSize: 16,
        color: 'var(--color-ink, #1C1A17)',
        lineHeight: 1.3,
        marginBottom: sub ? 4 : 0,
      }}>
        {label}
      </span>
      {sub && (
        <span style={{
          display: 'block',
          fontSize: 14,
          color: 'var(--color-muted, #6B6760)',
          lineHeight: 1.45,
        }}>
          {sub}
        </span>
      )}
    </button>
  )
}

/* ─── Duration pill ──────────────────────────────────────────────────── */
function DurationPill({ label, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '12px 22px',
        background: selected ? 'var(--color-ink, #1C1A17)' : 'transparent',
        color: selected ? '#FAF8F4' : 'var(--color-ink, #1C1A17)',
        border: selected
          ? '1.5px solid var(--color-ink, #1C1A17)'
          : '1px solid var(--color-border, rgba(28,26,23,0.12))',
        borderRadius: 100,
        cursor: 'pointer',
        fontFamily: 'var(--font-body)',
        fontWeight: 500,
        fontSize: 15,
        transition: 'all 0.2s ease',
        minWidth: 48,
        minHeight: 48,
      }}
      onMouseEnter={e => {
        if (!selected) {
          e.currentTarget.style.borderColor = 'rgba(28,26,23,0.3)'
          e.currentTarget.style.backgroundColor = 'rgba(28,26,23,0.02)'
        }
      }}
      onMouseLeave={e => {
        if (!selected) {
          e.currentTarget.style.borderColor = 'var(--color-border, rgba(28,26,23,0.12))'
          e.currentTarget.style.backgroundColor = 'transparent'
        }
      }}
    >
      {label}
    </button>
  )
}

/* ─── Region row ─────────────────────────────────────────────────────── */
function RegionRow({ name, stateAbbr, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        textAlign: 'left',
        padding: '14px 18px',
        background: selected ? 'rgba(28, 26, 23, 0.04)' : 'transparent',
        border: 'none',
        borderBottom: '1px solid var(--color-border, rgba(28,26,23,0.12))',
        cursor: 'pointer',
        transition: 'background-color 0.15s ease',
        minHeight: 48,
        fontFamily: 'var(--font-body)',
      }}
      onMouseEnter={e => {
        if (!selected) e.currentTarget.style.backgroundColor = 'rgba(28,26,23,0.02)'
      }}
      onMouseLeave={e => {
        if (!selected) e.currentTarget.style.backgroundColor = 'transparent'
      }}
    >
      <span style={{
        fontSize: 16,
        fontWeight: selected ? 600 : 400,
        color: 'var(--color-ink, #1C1A17)',
        lineHeight: 1.3,
      }}>
        {name}
      </span>
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'var(--color-muted, #6B6760)',
        opacity: 0.6,
        flexShrink: 0,
        marginLeft: 16,
      }}>
        {stateAbbr}
      </span>
    </button>
  )
}

/* ─── Season card (simpler, no subtitle) ─────────────────────────────── */
function SeasonCard({ label, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '16px 20px',
        background: selected ? 'rgba(28, 26, 23, 0.04)' : 'transparent',
        border: selected
          ? '1.5px solid var(--color-ink, #1C1A17)'
          : '1px solid var(--color-border, rgba(28,26,23,0.12))',
        borderRadius: 10,
        cursor: 'pointer',
        transition: 'border-color 0.2s ease, background-color 0.2s ease',
        minHeight: 48,
        fontFamily: 'var(--font-body)',
        fontWeight: 500,
        fontSize: 16,
        color: 'var(--color-ink, #1C1A17)',
        lineHeight: 1.3,
      }}
      onMouseEnter={e => {
        if (!selected) {
          e.currentTarget.style.borderColor = 'rgba(28,26,23,0.3)'
          e.currentTarget.style.backgroundColor = 'rgba(28,26,23,0.02)'
        }
      }}
      onMouseLeave={e => {
        if (!selected) {
          e.currentTarget.style.borderColor = 'var(--color-border, rgba(28,26,23,0.12))'
          e.currentTarget.style.backgroundColor = 'transparent'
        }
      }}
    >
      {label}
    </button>
  )
}

/* ─── Continue button ────────────────────────────────────────────────── */
function ContinueButton({ onClick, visible }) {
  const ref = useRef(null)

  useEffect(() => {
    if (visible && ref.current) {
      ref.current.style.opacity = '0'
      ref.current.style.transform = 'translateY(8px)'
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (ref.current) {
            ref.current.style.transition = 'opacity 0.25s ease-out, transform 0.25s ease-out'
            ref.current.style.opacity = '1'
            ref.current.style.transform = 'translateY(0)'
          }
        })
      })
    }
  }, [visible])

  if (!visible) return null

  return (
    <div ref={ref} style={{ opacity: 0, paddingTop: 28 }}>
      <button
        onClick={onClick}
        style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 500,
          fontSize: 15,
          color: '#FAF8F4',
          background: 'var(--color-ink, #1C1A17)',
          border: 'none',
          borderRadius: 8,
          padding: '14px 36px',
          cursor: 'pointer',
          transition: 'opacity 0.2s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
      >
        Continue
      </button>
    </div>
  )
}

/* ─── Loading screen ─────────────────────────────────────────────────── */
function LoadingScreen({ state, onComplete, onError }) {
  const lines = [
    `Looking at what's listed within range…`,
    'Sequencing the days…',
    'Writing the trip…',
  ]

  const [visibleCount, setVisibleCount] = useReducer(
    (s) => s + 1,
    0
  )
  const fetchStarted = useRef(false)

  useEffect(() => {
    const timers = []
    // Show first line immediately
    timers.push(setTimeout(() => setVisibleCount(), 100))

    // Fire the real API pipeline
    if (!fetchStarted.current) {
      fetchStarted.current = true

      const answers = {
        intent: state.intent,
        pacing: state.pacing,
        duration: state.duration,
        region: state.region,
        season: state.season,
        anchor: null,
      }

      // Step 1: Retrieve
      fetch('/api/plan-a-stay/retrieve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answers),
      })
        .then(res => {
          if (!res.ok) throw new Error(`Retrieve failed: ${res.status}`)
          return res.json()
        })
        .then(retrieval => {
          // Show line 2 — retrieve done, assemble starting
          setVisibleCount()

          // Step 2: Assemble
          return fetch('/api/plan-a-stay/assemble', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers, retrieval }),
          }).then(res => {
            if (!res.ok) throw new Error(`Assemble failed: ${res.status}`)
            return res.json()
          })
        })
        .then(assembled => {
          // Show line 3 — done
          setVisibleCount()
          // Brief pause so the user sees "Writing the trip…" before output
          setTimeout(() => onComplete(assembled), 600)
        })
        .catch(err => {
          console.error('[plan-a-stay] Pipeline error:', err)
          onError(err.message)
        })
    }

    return () => timers.forEach(clearTimeout)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '40vh',
      gap: 12,
      padding: '64px 24px',
    }}>
      {lines.map((line, i) => (
        <p
          key={i}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            fontStyle: 'italic',
            color: 'var(--color-muted, #6B6760)',
            lineHeight: 1.5,
            margin: 0,
            opacity: i < visibleCount ? 1 : 0,
            transform: i < visibleCount ? 'translateY(0)' : 'translateY(6px)',
            transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
          }}
        >
          {line}
        </p>
      ))}
    </div>
  )
}

/* ─── Vertical badge labels ──────────────────────────────────────────── */
const VERTICAL_LABELS = {
  craft: 'Craft',
  collection: 'Collection',
  table: 'Table',
  sba: 'SBA',
  rest: 'Rest',
  field: 'Field',
  found: 'Found',
  corner: 'Corner',
  fine_grounds: 'Fine Grounds',
  culture: 'Culture',
}

/* ─── Stop card ──────────────────────────────────────────────────────── */
function StopCard({ stop, index, prevStop }) {
  // Compute distance from previous stop
  let distLabel = null
  if (prevStop) {
    const R = 6371
    const dLat = (stop.lat - prevStop.lat) * Math.PI / 180
    const dLng = (stop.lng - prevStop.lng) * Math.PI / 180
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(prevStop.lat * Math.PI / 180) * Math.cos(stop.lat * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2
    const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    if (km >= 1) distLabel = `${Math.round(km)}km from previous`
    else distLabel = `${Math.round(km * 1000)}m from previous`
  }

  return (
    <div style={{
      padding: '16px 20px',
      background: 'rgba(28, 26, 23, 0.02)',
      border: '1px solid var(--color-border, rgba(28,26,23,0.12))',
      borderRadius: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <span style={{
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--color-muted, #6B6760)',
          minWidth: 20,
        }}>
          {index + 1}
        </span>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          fontSize: 17,
          color: 'var(--color-ink, #1C1A17)',
          lineHeight: 1.3,
        }}>
          {stop.name}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 30, marginBottom: stop.description_excerpt ? 8 : 0 }}>
        <span style={{
          fontFamily: 'var(--font-body)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: '#C4973B',
        }}>
          {VERTICAL_LABELS[stop.vertical] || stop.vertical}
        </span>
        {stop.sub_type && (
          <span style={{
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            color: 'var(--color-muted, #6B6760)',
          }}>
            {stop.sub_type.replace(/_/g, ' ')}
          </span>
        )}
        {distLabel && (
          <span style={{
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            color: 'var(--color-muted, #6B6760)',
            opacity: 0.7,
          }}>
            · {distLabel}
          </span>
        )}
      </div>
      {stop.description_excerpt && (
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          color: 'var(--color-muted, #6B6760)',
          lineHeight: 1.5,
          margin: 0,
          marginLeft: 30,
        }}>
          {stop.description_excerpt}
        </p>
      )}
    </div>
  )
}

/* ─── Output screen — real trip rendering ────────────────────────────── */
function OutputScreen({ tripData, error, onReset }) {
  // Error state
  if (error) {
    return (
      <div style={{ padding: '64px 0 96px', textAlign: 'center' }}>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          fontSize: 24,
          color: 'var(--color-ink, #1C1A17)',
          lineHeight: 1.25,
          marginBottom: 12,
        }}>
          Something went wrong.
        </h2>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 15,
          color: 'var(--color-muted, #6B6760)',
          lineHeight: 1.6,
          maxWidth: 440,
          margin: '0 auto 32px',
        }}>
          {error}
        </p>
        <button
          onClick={onReset}
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: 15,
            color: 'var(--color-ink, #1C1A17)',
            background: 'transparent',
            border: '1px solid var(--color-border, rgba(28,26,23,0.12))',
            borderRadius: 8,
            padding: '12px 32px',
            cursor: 'pointer',
          }}
        >
          Start over
        </button>
      </div>
    )
  }

  // Empty state — no candidates found
  if (tripData?.empty_state) {
    return (
      <div style={{ padding: '64px 0 96px', textAlign: 'center' }}>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          fontSize: 24,
          color: 'var(--color-ink, #1C1A17)',
          lineHeight: 1.25,
          marginBottom: 12,
        }}>
          {"We couldn't build a trip."}
        </h2>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 15,
          color: 'var(--color-muted, #6B6760)',
          lineHeight: 1.6,
          maxWidth: 440,
          margin: '0 auto 32px',
        }}>
          {tripData.empty_state.message}
        </p>
        <button
          onClick={onReset}
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: 15,
            color: 'var(--color-ink, #1C1A17)',
            background: 'transparent',
            border: '1px solid var(--color-border, rgba(28,26,23,0.12))',
            borderRadius: 8,
            padding: '12px 32px',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </div>
    )
  }

  // No data yet
  if (!tripData?.trip) return null

  const { trip } = tripData

  return (
    <div style={{
      padding: '48px 0 96px',
      maxWidth: 720,
      margin: '0 auto',
    }}>
      {/* ── Title ─────────────────────────────────────────────── */}
      <h2 style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 400,
        fontSize: 'clamp(24px, 4.5vw, 34px)',
        color: 'var(--color-ink, #1C1A17)',
        lineHeight: 1.2,
        textAlign: 'center',
        marginBottom: 12,
      }}>
        {trip.title}
      </h2>

      {/* ── Intro ─────────────────────────────────────────────── */}
      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: 15,
        color: 'var(--color-muted, #6B6760)',
        lineHeight: 1.6,
        textAlign: 'center',
        marginBottom: trip.trip_disclosures?.length > 0 ? 16 : 40,
      }}>
        {trip.intro}
      </p>

      {/* ── Trip disclosures ──────────────────────────────────── */}
      {trip.trip_disclosures?.length > 0 && (
        <div style={{ marginBottom: 40, textAlign: 'center' }}>
          {trip.trip_disclosures.map((d, i) => (
            <p key={i} style={{
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              fontStyle: 'italic',
              color: 'var(--color-muted, #6B6760)',
              lineHeight: 1.5,
              margin: '4px 0',
            }}>
              {d}
            </p>
          ))}
        </div>
      )}

      {/* ── Days ──────────────────────────────────────────────── */}
      {trip.days?.map((day, dayIdx) => (
        <div key={day.day_number} style={{ marginBottom: 48 }}>
          {/* Day heading */}
          <h3 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: 22,
            color: 'var(--color-ink, #1C1A17)',
            lineHeight: 1.3,
            marginBottom: 4,
          }}>
            {day.heading}
          </h3>

          {/* Day theme */}
          {day.theme && (
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              fontStyle: 'italic',
              color: 'var(--color-muted, #6B6760)',
              lineHeight: 1.5,
              marginBottom: day.day_disclosures?.length > 0 ? 8 : 16,
            }}>
              {day.theme}
            </p>
          )}

          {/* Day disclosures */}
          {day.day_disclosures?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {day.day_disclosures.map((d, i) => (
                <p key={i} style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  color: 'var(--color-muted, #6B6760)',
                  lineHeight: 1.5,
                  margin: '2px 0',
                  opacity: 0.8,
                }}>
                  {d}
                </p>
              ))}
            </div>
          )}

          {/* Static map */}
          {day.map_url && (
            <div style={{
              marginBottom: 16,
              borderRadius: 10,
              overflow: 'hidden',
              border: '1px solid var(--color-border, rgba(28,26,23,0.12))',
            }}>
              <img
                src={day.map_url}
                alt={`Map for ${day.heading}`}
                loading={dayIdx === 0 ? 'eager' : 'lazy'}
                style={{
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                  minHeight: 160,
                  background: '#2d2a24',
                }}
              />
            </div>
          )}

          {/* Stop cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {day.stops?.map((stop, stopIdx) => (
              <StopCard
                key={stop.listing_id}
                stop={stop}
                index={stopIdx}
                prevStop={stopIdx > 0 ? day.stops[stopIdx - 1] : null}
              />
            ))}
          </div>
        </div>
      ))}

      {/* ── Action buttons ────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 12,
        paddingTop: 24,
        borderTop: '1px solid var(--color-border, rgba(28,26,23,0.12))',
      }}>
        <button
          disabled
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: 14,
            color: 'var(--color-muted, #6B6760)',
            background: 'transparent',
            border: '1px solid var(--color-border, rgba(28,26,23,0.12))',
            borderRadius: 8,
            padding: '10px 24px',
            cursor: 'not-allowed',
            opacity: 0.5,
          }}
        >
          Save — coming soon
        </button>
        <button
          disabled
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: 14,
            color: 'var(--color-muted, #6B6760)',
            background: 'transparent',
            border: '1px solid var(--color-border, rgba(28,26,23,0.12))',
            borderRadius: 8,
            padding: '10px 24px',
            cursor: 'not-allowed',
            opacity: 0.5,
          }}
        >
          Share — coming soon
        </button>
        <button
          onClick={onReset}
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: 14,
            color: 'var(--color-ink, #1C1A17)',
            background: 'transparent',
            border: '1px solid var(--color-border, rgba(28,26,23,0.12))',
            borderRadius: 8,
            padding: '10px 24px',
            cursor: 'pointer',
            transition: 'border-color 0.2s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(28,26,23,0.3)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border, rgba(28,26,23,0.12))' }}
        >
          Start over
        </button>
      </div>
    </div>
  )
}

/* ═════════════════════════════════════════════════════════════════════════
   Main component
   ═════════════════════════════════════════════════════════════════════════ */
export default function PlanAStayV2Client() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)
  const [tripData, setTripData] = useState(null)
  const [tripError, setTripError] = useState(null)
  const autoAdvanceTimer = useRef(null)

  // Clean up any pending auto-advance on unmount
  useEffect(() => {
    return () => { if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current) }
  }, [])

  /* ── Auto-advance helper for single-select questions ─────────────── */
  function autoAdvance() {
    if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current)
    autoAdvanceTimer.current = setTimeout(() => {
      dispatch({ type: 'ADVANCE' })
    }, 400)
  }

  /* ── Step index helpers ──────────────────────────────────────────── */
  const currentStepIdx = STEPS.indexOf(state.step)
  function isStepBefore(step) {
    const idx = STEPS.indexOf(step)
    return idx < currentStepIdx && idx >= 0
  }

  /* ── Loading complete callback ───────────────────────────────────── */
  const handleLoadingComplete = useCallback((assembled) => {
    setTripData(assembled)
    setTripError(null)
    dispatch({ type: 'GO_TO_STEP', value: 'output' })
  }, [])

  const handleLoadingError = useCallback((errMsg) => {
    setTripError(errMsg)
    dispatch({ type: 'GO_TO_STEP', value: 'output' })
  }, [])

  function handleReset() {
    setTripData(null)
    setTripError(null)
    dispatch({ type: 'RESET' })
  }

  /* ── Summary lines for completed questions ───────────────────────── */
  const summaries = [
    {
      step: 'intent',
      text: state.intent.length > 0 ? intentSummary(state.intent) : null,
    },
    {
      step: 'pacing',
      text: state.pacing ? pacingSummary(state.pacing) : null,
    },
    {
      step: 'duration',
      text: state.duration ? durationSummary(state.duration) : null,
    },
    {
      step: 'region',
      text: state.region ? regionSummary(state.region) : null,
    },
    ...(state.needsSeason ? [{
      step: 'season',
      text: state.season ? seasonSummary(state.season) : null,
    }] : []),
  ]

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-bg, #F8F6F1)',
    }}>
      <div style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '0 24px 96px',
      }}>
        <ProgressDots currentStep={state.step} needsSeason={state.needsSeason} />

        {/* ── Completed-step summary lines ──────────────────────────── */}
        {state.step !== 'loading' && state.step !== 'output' && (
          <div style={{ marginBottom: summaries.some(s => isStepBefore(s.step) && s.text) ? 20 : 0 }}>
            {summaries.map(s => (
              <SummaryLine
                key={s.step}
                text={s.text}
                visible={isStepBefore(s.step)}
                onClick={() => dispatch({ type: 'GO_TO_STEP', value: s.step })}
              />
            ))}
          </div>
        )}

        {/* ── Question 1: Intent ───────────────────────────────────── */}
        <QuestionScreen visible={state.step === 'intent'}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: 'clamp(26px, 4vw, 34px)',
            color: 'var(--color-ink, #1C1A17)',
            lineHeight: 1.2,
            marginBottom: 8,
          }}>
            What kind of trip is this?
          </h1>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            color: 'var(--color-muted, #6B6760)',
            lineHeight: 1.5,
            marginBottom: 28,
          }}>
            Pick one or two. We{"'"}ll build from there.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {INTENT_OPTIONS.map(opt => (
              <OptionCard
                key={opt.id}
                label={opt.label}
                sub={opt.sub}
                selected={state.intent.includes(opt.id)}
                onClick={() => dispatch({ type: 'SET_INTENT', value: opt.id })}
              />
            ))}
          </div>
          <ContinueButton
            visible={state.intent.length > 0}
            onClick={() => dispatch({ type: 'ADVANCE' })}
          />
        </QuestionScreen>

        {/* ── Question 2: Pacing ───────────────────────────────────── */}
        <QuestionScreen visible={state.step === 'pacing'}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: 'clamp(26px, 4vw, 34px)',
            color: 'var(--color-ink, #1C1A17)',
            lineHeight: 1.2,
            marginBottom: 28,
          }}>
            How are you wanting to spend the days?
          </h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {PACING_OPTIONS.map(opt => (
              <OptionCard
                key={opt.id}
                label={opt.label}
                sub={opt.sub}
                selected={state.pacing === opt.id}
                onClick={() => {
                  dispatch({ type: 'SET_PACING', value: opt.id })
                  autoAdvance()
                }}
              />
            ))}
          </div>
        </QuestionScreen>

        {/* ── Question 3: Duration ─────────────────────────────────── */}
        <QuestionScreen visible={state.step === 'duration'}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: 'clamp(26px, 4vw, 34px)',
            color: 'var(--color-ink, #1C1A17)',
            lineHeight: 1.2,
            marginBottom: 28,
          }}>
            How many days?
          </h1>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
          }}>
            {DURATION_OPTIONS.map(opt => (
              <DurationPill
                key={opt.id}
                label={opt.label}
                selected={state.duration === opt.id}
                onClick={() => {
                  dispatch({ type: 'SET_DURATION', value: opt.id })
                  autoAdvance()
                }}
              />
            ))}
          </div>
        </QuestionScreen>

        {/* ── Question 4: Region ───────────────────────────────────── */}
        <QuestionScreen visible={state.step === 'region'}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: 'clamp(26px, 4vw, 34px)',
            color: 'var(--color-ink, #1C1A17)',
            lineHeight: 1.2,
            marginBottom: 8,
          }}>
            Where in Australia?
          </h1>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            color: 'var(--color-muted, #6B6760)',
            lineHeight: 1.5,
            marginBottom: 24,
          }}>
            We{"'"}re well-covered in some regions and still building others. These are the ones with enough to plan a trip through.
          </p>
          <div style={{
            border: '1px solid var(--color-border, rgba(28,26,23,0.12))',
            borderRadius: 10,
            overflow: 'hidden',
          }}>
            {COVERED_REGIONS.map(r => (
              <RegionRow
                key={r.name}
                name={r.name}
                stateAbbr={r.state}
                selected={state.region === r.name}
                onClick={() => {
                  dispatch({ type: 'SET_REGION', value: r.name })
                  autoAdvance()
                }}
              />
            ))}
          </div>
          {/* "Not sure yet" — disabled until recommendation flow exists */}
          <div style={{ padding: '16px 0 0' }}>
            <div
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '14px 18px',
                background: 'transparent',
                border: '1px solid var(--color-border, rgba(28,26,23,0.12))',
                borderRadius: 10,
                cursor: 'default',
                fontFamily: 'var(--font-body)',
                opacity: 0.45,
                minHeight: 48,
              }}
            >
              <span style={{
                display: 'block',
                fontSize: 15,
                fontStyle: 'italic',
                color: 'var(--color-muted, #6B6760)',
                lineHeight: 1.3,
              }}>
                Not sure yet — recommend a region.
              </span>
              <span style={{
                display: 'block',
                fontSize: 12,
                color: 'var(--color-muted, #6B6760)',
                lineHeight: 1.4,
                marginTop: 2,
              }}>
                Coming soon — region recommendations.
              </span>
            </div>
          </div>
        </QuestionScreen>

        {/* ── Question 5: Season (conditional) ─────────────────────── */}
        <QuestionScreen visible={state.step === 'season'}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: 'clamp(26px, 4vw, 34px)',
            color: 'var(--color-ink, #1C1A17)',
            lineHeight: 1.2,
            marginBottom: 28,
          }}>
            When are you thinking?
          </h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {SEASON_OPTIONS.map(opt => (
              <SeasonCard
                key={opt.id}
                label={opt.label}
                selected={state.season === opt.id}
                onClick={() => {
                  dispatch({ type: 'SET_SEASON', value: opt.id })
                  autoAdvance()
                }}
              />
            ))}
          </div>
        </QuestionScreen>

        {/* ── Loading state ────────────────────────────────────────── */}
        {state.step === 'loading' && (
          <LoadingScreen
            state={state}
            onComplete={handleLoadingComplete}
            onError={handleLoadingError}
          />
        )}

        {/* ── Trip output ──────────────────────────────────────────── */}
        {state.step === 'output' && (
          <OutputScreen
            tripData={tripData}
            error={tripError}
            onReset={handleReset}
          />
        )}
      </div>
    </div>
  )
}
