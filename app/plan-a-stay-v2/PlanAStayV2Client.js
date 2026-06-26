'use client'

import { useReducer, useEffect, useRef, useCallback, useState } from 'react'
import {
  VERTICAL_LABELS,
  StopCard,
  TripRender,
  StaysOnlyRender,
} from '@/components/PlanAStayTripRender'
import RegionMapSelect from '@/components/RegionMapSelect'
import AuthModal from '@/components/AuthModal'
import { readDiscoveryPicks } from '@/lib/discover/sessionPicks'

/* ─── Trip persistence helpers ───────────────────────────────────────────
   Build the exact payload sent to /share and /save. Visitor accommodation
   picks (lifted into OutputScreen) are folded into the trip's days so the
   stored trip matches what was on screen.                                */
function buildTripPayload(tripData, accommodationByDay) {
  const payload = { answers: tripData._answers || {} }
  if (tripData.stays_only) {
    payload.stays_only = tripData.stays_only
  } else {
    const byDay = accommodationByDay || {}
    payload.trip = {
      ...tripData.trip,
      days: (tripData.trip.days || []).map(d => ({
        ...d,
        accommodation: byDay[d.day_number] || null,
      })),
    }
  }
  return payload
}

// Stash key + query flag for resuming a save across a Google OAuth redirect
// (the trip lives only in client state, so we carry it through sessionStorage).
const RESUME_SAVE_KEY = 'pas:resumeSave'
const RESUME_QUERY = 'save'

/* ─── Region data ────────────────────────────────────────────────────────
   Regions with ≥5 active Rest listings, derived live from threshold
   query. Passed as prop from the server page component.
   Shape: [{ name, state, slug, listing_count }]                       */

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
function OptionCard({ label, sub, selected, onClick, index }) {
  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const numeral = String(index + 1).padStart(2, '0')

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        width: '100%',
        textAlign: 'left',
        padding: '16px 0',
        background: 'transparent',
        border: 'none',
        borderBottom: '1px solid rgba(28,26,23,0.08)',
        borderLeft: selected ? '2px solid var(--color-accent, #C4603A)' : '2px solid transparent',
        paddingLeft: selected ? 14 : 16,
        cursor: 'pointer',
        transition: prefersReducedMotion
          ? 'border-color 0.18s ease, color 0.18s ease'
          : 'border-color 0.18s ease, color 0.18s ease, transform 0.18s ease',
        minHeight: 48,
        fontFamily: 'var(--font-body)',
        position: 'relative',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderBottomColor = 'rgba(28,26,23,0.2)'
        if (!prefersReducedMotion) {
          e.currentTarget.style.transform = 'translateY(-1px)'
        }
        const arrow = e.currentTarget.querySelector('[data-arrow]')
        if (arrow) {
          arrow.style.opacity = '1'
          if (!prefersReducedMotion) {
            arrow.style.transform = 'translateX(0)'
          }
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderBottomColor = 'rgba(28,26,23,0.08)'
        if (!prefersReducedMotion) {
          e.currentTarget.style.transform = 'translateY(0)'
        }
        const arrow = e.currentTarget.querySelector('[data-arrow]')
        if (arrow) {
          arrow.style.opacity = '0'
          if (!prefersReducedMotion) {
            arrow.style.transform = 'translateX(4px)'
          }
        }
      }}
    >
      <span style={{
        fontFamily: 'var(--font-display)',
        fontSize: 14,
        color: selected ? 'var(--color-accent, #C4603A)' : 'var(--color-muted, #6B6760)',
        opacity: selected ? 1 : 0.4,
        minWidth: 28,
        lineHeight: 1.5,
        transition: 'color 0.18s ease, opacity 0.18s ease',
      }}>
        {numeral}
      </span>
      <div style={{ flex: 1 }}>
        <span style={{
          display: 'block',
          fontWeight: 500,
          fontSize: 16,
          color: selected ? 'var(--color-accent, #C4603A)' : 'var(--color-ink, #1C1A17)',
          lineHeight: 1.3,
          marginBottom: sub ? 4 : 0,
          transition: 'color 0.18s ease',
        }}>
          {label}
        </span>
        {sub && (
          <span style={{
            display: 'block',
            fontSize: 13,
            color: 'var(--color-muted, #6B6760)',
            lineHeight: 1.45,
          }}>
            {sub}
          </span>
        )}
      </div>
      <span
        data-arrow=""
        style={{
          fontSize: 16,
          color: 'var(--color-muted, #6B6760)',
          opacity: 0,
          transform: prefersReducedMotion ? 'none' : 'translateX(4px)',
          transition: prefersReducedMotion
            ? 'opacity 0.18s ease'
            : 'opacity 0.18s ease, transform 0.18s ease',
          alignSelf: 'center',
          flexShrink: 0,
        }}
      >
        {'→'}
      </span>
    </button>
  )
}

/* ─── Duration pill (editorial row) ─────────────────────────────────── */
function DurationPill({ label, selected, onClick, index }) {
  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const numeral = String(index + 1).padStart(2, '0')

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        width: '100%',
        textAlign: 'left',
        padding: '16px 0',
        background: 'transparent',
        border: 'none',
        borderBottom: '1px solid rgba(28,26,23,0.08)',
        borderLeft: selected ? '2px solid var(--color-accent, #C4603A)' : '2px solid transparent',
        paddingLeft: selected ? 14 : 16,
        cursor: 'pointer',
        fontFamily: 'var(--font-body)',
        fontWeight: 500,
        fontSize: 16,
        color: selected ? 'var(--color-accent, #C4603A)' : 'var(--color-ink, #1C1A17)',
        transition: prefersReducedMotion
          ? 'border-color 0.18s ease, color 0.18s ease'
          : 'border-color 0.18s ease, color 0.18s ease, transform 0.18s ease',
        minHeight: 48,
        position: 'relative',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderBottomColor = 'rgba(28,26,23,0.2)'
        if (!prefersReducedMotion) {
          e.currentTarget.style.transform = 'translateY(-1px)'
        }
        const arrow = e.currentTarget.querySelector('[data-arrow]')
        if (arrow) {
          arrow.style.opacity = '1'
          if (!prefersReducedMotion) {
            arrow.style.transform = 'translateX(0)'
          }
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderBottomColor = 'rgba(28,26,23,0.08)'
        if (!prefersReducedMotion) {
          e.currentTarget.style.transform = 'translateY(0)'
        }
        const arrow = e.currentTarget.querySelector('[data-arrow]')
        if (arrow) {
          arrow.style.opacity = '0'
          if (!prefersReducedMotion) {
            arrow.style.transform = 'translateX(4px)'
          }
        }
      }}
    >
      <span style={{
        fontFamily: 'var(--font-display)',
        fontSize: 14,
        color: selected ? 'var(--color-accent, #C4603A)' : 'var(--color-muted, #6B6760)',
        opacity: selected ? 1 : 0.4,
        minWidth: 28,
        transition: 'color 0.18s ease, opacity 0.18s ease',
      }}>
        {numeral}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      <span
        data-arrow=""
        style={{
          fontSize: 16,
          color: 'var(--color-muted, #6B6760)',
          opacity: 0,
          transform: prefersReducedMotion ? 'none' : 'translateX(4px)',
          transition: prefersReducedMotion
            ? 'opacity 0.18s ease'
            : 'opacity 0.18s ease, transform 0.18s ease',
          flexShrink: 0,
        }}
      >
        {'→'}
      </span>
    </button>
  )
}

/* ─── Region row ─────────────────────────────────────────────────────── */
function RegionRow({ name, stateAbbr, selected, onClick, index }) {
  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const numeral = String(index + 1).padStart(2, '0')

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        width: '100%',
        textAlign: 'left',
        padding: '16px 0',
        background: 'transparent',
        border: 'none',
        borderBottom: '1px solid rgba(28,26,23,0.08)',
        borderLeft: selected ? '2px solid var(--color-accent, #C4603A)' : '2px solid transparent',
        paddingLeft: selected ? 14 : 16,
        cursor: 'pointer',
        transition: prefersReducedMotion
          ? 'border-color 0.18s ease, color 0.18s ease'
          : 'border-color 0.18s ease, color 0.18s ease, transform 0.18s ease',
        minHeight: 48,
        fontFamily: 'var(--font-body)',
        position: 'relative',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderBottomColor = 'rgba(28,26,23,0.2)'
        if (!prefersReducedMotion) {
          e.currentTarget.style.transform = 'translateY(-1px)'
        }
        const arrow = e.currentTarget.querySelector('[data-arrow]')
        if (arrow) {
          arrow.style.opacity = '1'
          if (!prefersReducedMotion) {
            arrow.style.transform = 'translateX(0)'
          }
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderBottomColor = 'rgba(28,26,23,0.08)'
        if (!prefersReducedMotion) {
          e.currentTarget.style.transform = 'translateY(0)'
        }
        const arrow = e.currentTarget.querySelector('[data-arrow]')
        if (arrow) {
          arrow.style.opacity = '0'
          if (!prefersReducedMotion) {
            arrow.style.transform = 'translateX(4px)'
          }
        }
      }}
    >
      <span style={{
        fontFamily: 'var(--font-display)',
        fontSize: 14,
        color: selected ? 'var(--color-accent, #C4603A)' : 'var(--color-muted, #6B6760)',
        opacity: selected ? 1 : 0.4,
        minWidth: 28,
        transition: 'color 0.18s ease, opacity 0.18s ease',
      }}>
        {numeral}
      </span>
      <span style={{
        flex: 1,
        fontSize: 16,
        fontWeight: 500,
        color: selected ? 'var(--color-accent, #C4603A)' : 'var(--color-ink, #1C1A17)',
        lineHeight: 1.3,
        transition: 'color 0.18s ease',
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
      }}>
        {stateAbbr}
      </span>
      <span
        data-arrow=""
        style={{
          fontSize: 16,
          color: 'var(--color-muted, #6B6760)',
          opacity: 0,
          transform: prefersReducedMotion ? 'none' : 'translateX(4px)',
          transition: prefersReducedMotion
            ? 'opacity 0.18s ease'
            : 'opacity 0.18s ease, transform 0.18s ease',
          flexShrink: 0,
        }}
      >
        {'→'}
      </span>
    </button>
  )
}

/* ─── Season card (editorial row) ────────────────────────────────────── */
function SeasonCard({ label, selected, onClick, index }) {
  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const numeral = String(index + 1).padStart(2, '0')

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        width: '100%',
        textAlign: 'left',
        padding: '16px 0',
        background: 'transparent',
        border: 'none',
        borderBottom: '1px solid rgba(28,26,23,0.08)',
        borderLeft: selected ? '2px solid var(--color-accent, #C4603A)' : '2px solid transparent',
        paddingLeft: selected ? 14 : 16,
        cursor: 'pointer',
        transition: prefersReducedMotion
          ? 'border-color 0.18s ease, color 0.18s ease'
          : 'border-color 0.18s ease, color 0.18s ease, transform 0.18s ease',
        minHeight: 48,
        fontFamily: 'var(--font-body)',
        fontWeight: 500,
        fontSize: 16,
        color: selected ? 'var(--color-accent, #C4603A)' : 'var(--color-ink, #1C1A17)',
        lineHeight: 1.3,
        position: 'relative',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderBottomColor = 'rgba(28,26,23,0.2)'
        if (!prefersReducedMotion) {
          e.currentTarget.style.transform = 'translateY(-1px)'
        }
        const arrow = e.currentTarget.querySelector('[data-arrow]')
        if (arrow) {
          arrow.style.opacity = '1'
          if (!prefersReducedMotion) {
            arrow.style.transform = 'translateX(0)'
          }
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderBottomColor = 'rgba(28,26,23,0.08)'
        if (!prefersReducedMotion) {
          e.currentTarget.style.transform = 'translateY(0)'
        }
        const arrow = e.currentTarget.querySelector('[data-arrow]')
        if (arrow) {
          arrow.style.opacity = '0'
          if (!prefersReducedMotion) {
            arrow.style.transform = 'translateX(4px)'
          }
        }
      }}
    >
      <span style={{
        fontFamily: 'var(--font-display)',
        fontSize: 14,
        color: selected ? 'var(--color-accent, #C4603A)' : 'var(--color-muted, #6B6760)',
        opacity: selected ? 1 : 0.4,
        minWidth: 28,
        transition: 'color 0.18s ease, opacity 0.18s ease',
      }}>
        {numeral}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      <span
        data-arrow=""
        style={{
          fontSize: 16,
          color: 'var(--color-muted, #6B6760)',
          opacity: 0,
          transform: prefersReducedMotion ? 'none' : 'translateX(4px)',
          transition: prefersReducedMotion
            ? 'opacity 0.18s ease'
            : 'opacity 0.18s ease, transform 0.18s ease',
          flexShrink: 0,
        }}
      >
        {'→'}
      </span>
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

      // Discovery onboarding picks (in-session) personalise candidate ranking,
      // even for anonymous visitors with no account yet.
      const discoveryPicks = readDiscoveryPicks()

      // Step 1: Retrieve
      fetch('/api/plan-a-stay/retrieve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...answers, discoveryPicks }),
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
          setTimeout(() => onComplete(assembled, answers), 600)
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

/* ─── Output screen — real trip rendering ────────────────────────────── */
function OutputScreen({ tripData, error, onReset, resumePayload }) {
  const [shareState, setShareState] = useState('idle') // idle | sharing | shared | error
  const [shareUrl, setShareUrl] = useState(null)
  // Accommodation the visitor picks per day (day_number → stay), lifted here
  // so the Share button can fold the choices into the saved trip.
  const [accommodationByDay, setAccommodationByDay] = useState({})

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

  // Stays-only — region has accommodation but nothing curated to do
  if (tripData?.stays_only) {
    return (
      <div>
        <StaysOnlyRender staysOnly={tripData.stays_only} />
        <ActionButtons
          tripData={tripData}
          onReset={onReset}
          shareState={shareState}
          setShareState={setShareState}
          shareUrl={shareUrl}
          setShareUrl={setShareUrl}
          resumePayload={resumePayload}
        />
      </div>
    )
  }

  // No data yet
  if (!tripData?.trip) return null

  return (
    <div>
      <TripRender trip={tripData.trip} onAccommodationChange={setAccommodationByDay} />
      <ActionButtons
        tripData={tripData}
        accommodationByDay={accommodationByDay}
        onReset={onReset}
        shareState={shareState}
        setShareState={setShareState}
        shareUrl={shareUrl}
        setShareUrl={setShareUrl}
        resumePayload={resumePayload}
      />
    </div>
  )
}


/* ─── Action buttons (Share / Save / Start over) ─────────────────────── */
function ActionButtons({ tripData, accommodationByDay, onReset, shareState, setShareState, shareUrl, setShareUrl, resumePayload }) {
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | error
  const [savedUrl, setSavedUrl] = useState(null)
  const [authOpen, setAuthOpen] = useState(false)
  const resumeFiredRef = useRef(false)

  async function handleShare() {
    if (shareState === 'sharing') return

    setShareState('sharing')
    try {
      const payload = buildTripPayload(tripData, accommodationByDay)

      const res = await fetch('/api/plan-a-stay/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error(`Share failed: ${res.status}`)

      const result = await res.json()
      const fullUrl = `${window.location.origin}${result.url}`
      setShareUrl(fullUrl)

      // Copy to clipboard
      try {
        await navigator.clipboard.writeText(fullUrl)
      } catch {
        // Clipboard may fail on non-HTTPS — still show the URL
      }

      setShareState('shared')
    } catch (err) {
      console.error('[plan-a-stay] Share error:', err)
      setShareState('error')
      // Reset after a moment so user can retry
      setTimeout(() => setShareState('idle'), 3000)
    }
  }

  /* ── Save to account ──────────────────────────────────────────────
     Attempt the save; a 401 means "not signed in" — stash the trip and
     open the sign-in modal. Email/password resolves synchronously and we
     retry inline; Google OAuth redirects and resumes via RESUME_QUERY.  */
  const doSave = useCallback(async (explicitPayload) => {
    if (saveState === 'saving' || saveState === 'saved') return
    setSaveState('saving')
    const payload = explicitPayload || buildTripPayload(tripData, accommodationByDay)
    try {
      const res = await fetch('/api/plan-a-stay/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.status === 401) {
        // Not signed in — keep the trip for an OAuth round-trip, then prompt.
        try { sessionStorage.setItem(RESUME_SAVE_KEY, JSON.stringify({ tripData, payload })) } catch {}
        setSaveState('idle')
        setAuthOpen(true)
        return
      }
      if (!res.ok) throw new Error(`Save failed: ${res.status}`)
      const result = await res.json()
      setSavedUrl(`${window.location.origin}${result.url}`)
      setSaveState('saved')
    } catch (err) {
      console.error('[plan-a-stay] Save error:', err)
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 3000)
    }
  }, [saveState, tripData, accommodationByDay])

  // After a Google OAuth round-trip, the restored trip arrives as
  // resumePayload — fire the save once.
  useEffect(() => {
    if (!resumePayload || resumeFiredRef.current) return
    resumeFiredRef.current = true
    doSave(resumePayload)
  }, [resumePayload, doSave])

  async function handleAuthSuccess() {
    // Email/password sign-in resolved in the modal — retry the save now.
    setAuthOpen(false)
    try { sessionStorage.removeItem(RESUME_SAVE_KEY) } catch {}
    await doSave()
  }

  // returnTo must be a PATH: /auth/callback redirects to `${origin}${next}`,
  // so a full URL would double the origin.
  const returnTo = typeof window !== 'undefined'
    ? (() => {
        const u = new URL(window.location.href)
        u.searchParams.set(RESUME_QUERY, 'resume')
        return u.pathname + u.search
      })()
    : undefined

  const shareLabel =
    shareState === 'sharing' ? 'Sharing…' :
    shareState === 'shared' ? 'Link copied' :
    shareState === 'error' ? 'Failed — try again' :
    'Share'

  const saveLabel =
    saveState === 'saving' ? 'Saving…' :
    saveState === 'saved' ? 'Saved' :
    saveState === 'error' ? 'Failed — try again' :
    'Save to account'

  return (
    <div style={{
      maxWidth: 720,
      margin: '0 auto',
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        paddingTop: 24,
        borderTop: '1px solid var(--color-border, rgba(28,26,23,0.12))',
      }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => doSave()}
            disabled={saveState === 'saving' || saveState === 'saved'}
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
              fontSize: 14,
              color: saveState === 'saved' ? '#5a7c5a' : 'var(--color-ink, #1C1A17)',
              background: 'transparent',
              border: `1px solid ${saveState === 'saved' ? 'rgba(90,124,90,0.3)' : 'var(--color-border, rgba(28,26,23,0.12))'}`,
              borderRadius: 8,
              padding: '10px 24px',
              cursor: saveState === 'saving' ? 'wait' : saveState === 'saved' ? 'default' : 'pointer',
              transition: 'border-color 0.2s ease, color 0.2s ease',
            }}
          >
            {saveLabel}
          </button>
          <button
            onClick={handleShare}
            disabled={shareState === 'sharing'}
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
              fontSize: 14,
              color: shareState === 'shared'
                ? '#5a7c5a'
                : 'var(--color-ink, #1C1A17)',
              background: 'transparent',
              border: `1px solid ${shareState === 'shared' ? 'rgba(90,124,90,0.3)' : 'var(--color-border, rgba(28,26,23,0.12))'}`,
              borderRadius: 8,
              padding: '10px 24px',
              cursor: shareState === 'sharing' ? 'wait' : 'pointer',
              transition: 'border-color 0.2s ease, color 0.2s ease',
            }}
          >
            {shareLabel}
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

        {/* Show URL after sharing */}
        {shareState === 'shared' && shareUrl && (
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            color: 'var(--color-muted, #6B6760)',
            margin: '4px 0 0',
            wordBreak: 'break-all',
          }}>
            {shareUrl}
          </p>
        )}

        {/* Confirmation after saving to account */}
        {saveState === 'saved' && (
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            color: 'var(--color-muted, #6B6760)',
            margin: '4px 0 0',
          }}>
            Saved to your account —{' '}
            <a
              href="/account/trails"
              style={{ color: '#5a7c5a', textDecoration: 'underline' }}
            >
              view in My Trails
            </a>
          </p>
        )}
      </div>

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthSuccess={handleAuthSuccess}
        returnTo={returnTo}
      />
    </div>
  )
}

/* ═════════════════════════════════════════════════════════════════════════
   Main component
   ═════════════════════════════════════════════════════════════════════════ */
export default function PlanAStayV2Client({ regions = [] }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)
  const [tripData, setTripData] = useState(null)
  const [tripError, setTripError] = useState(null)
  // Carries a stashed trip back to the output screen after a Google OAuth
  // round-trip so the save can resume (see ActionButtons.doSave).
  const [resumePayload, setResumePayload] = useState(null)
  const autoAdvanceTimer = useRef(null)

  // Clean up any pending auto-advance on unmount
  useEffect(() => {
    return () => { if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current) }
  }, [])

  /* ── Resume a save after returning from OAuth sign-in ─────────────── */
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get(RESUME_QUERY) !== 'resume') return

    // Strip the flag so a refresh doesn't re-trigger the resume.
    params.delete(RESUME_QUERY)
    const qs = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : '') + window.location.hash)

    let stash = null
    try { stash = JSON.parse(sessionStorage.getItem(RESUME_SAVE_KEY) || 'null') } catch {}
    try { sessionStorage.removeItem(RESUME_SAVE_KEY) } catch {}
    if (!stash?.tripData || !stash?.payload) return

    setTripData(stash.tripData)
    setResumePayload(stash.payload)
    dispatch({ type: 'GO_TO_STEP', value: 'output' })
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
  const handleLoadingComplete = useCallback((assembled, answers) => {
    // Attach answers so the Share button can send them to the share endpoint
    setTripData({ ...assembled, _answers: answers })
    setTripError(null)
    setResumePayload(null)   // a fresh trip is not a resume
    dispatch({ type: 'GO_TO_STEP', value: 'output' })
  }, [])

  const handleLoadingError = useCallback((errMsg) => {
    setTripError(errMsg)
    dispatch({ type: 'GO_TO_STEP', value: 'output' })
  }, [])

  function handleReset() {
    setTripData(null)
    setTripError(null)
    setResumePayload(null)
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
        maxWidth: 560,
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
            fontSize: 'clamp(28px, 5vw, 42px)',
            color: 'var(--color-ink, #1C1A17)',
            lineHeight: 1.1,
            marginBottom: 8,
            maxWidth: 440,
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {INTENT_OPTIONS.map((opt, i) => (
              <OptionCard
                key={opt.id}
                label={opt.label}
                sub={opt.sub}
                selected={state.intent.includes(opt.id)}
                onClick={() => dispatch({ type: 'SET_INTENT', value: opt.id })}
                index={i}
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
            fontSize: 'clamp(28px, 5vw, 42px)',
            color: 'var(--color-ink, #1C1A17)',
            lineHeight: 1.1,
            marginBottom: 28,
            maxWidth: 440,
          }}>
            How are you wanting to spend the days?
          </h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {PACING_OPTIONS.map((opt, i) => (
              <OptionCard
                key={opt.id}
                label={opt.label}
                sub={opt.sub}
                selected={state.pacing === opt.id}
                onClick={() => {
                  dispatch({ type: 'SET_PACING', value: opt.id })
                  autoAdvance()
                }}
                index={i}
              />
            ))}
          </div>
        </QuestionScreen>

        {/* ── Question 3: Duration ─────────────────────────────────── */}
        <QuestionScreen visible={state.step === 'duration'}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: 'clamp(28px, 5vw, 42px)',
            color: 'var(--color-ink, #1C1A17)',
            lineHeight: 1.1,
            marginBottom: 28,
            maxWidth: 440,
          }}>
            How many days?
          </h1>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
          }}>
            {DURATION_OPTIONS.map((opt, i) => (
              <DurationPill
                key={opt.id}
                label={opt.label}
                selected={state.duration === opt.id}
                onClick={() => {
                  dispatch({ type: 'SET_DURATION', value: opt.id })
                  autoAdvance()
                }}
                index={i}
              />
            ))}
          </div>
        </QuestionScreen>

        {/* ── Question 4: Region ───────────────────────────────────── */}
        <QuestionScreen visible={state.step === 'region'}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: 'clamp(28px, 5vw, 42px)',
            color: 'var(--color-ink, #1C1A17)',
            lineHeight: 1.1,
            marginBottom: 8,
            maxWidth: 440,
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
          <RegionMapSelect
            regions={regions}
            selectedRegion={state.region}
            onSelect={(name) => {
              dispatch({ type: 'SET_REGION', value: name })
              autoAdvance()
            }}
          />
        </QuestionScreen>

        {/* ── Question 5: Season (conditional) ─────────────────────── */}
        <QuestionScreen visible={state.step === 'season'}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: 'clamp(28px, 5vw, 42px)',
            color: 'var(--color-ink, #1C1A17)',
            lineHeight: 1.1,
            marginBottom: 28,
            maxWidth: 440,
          }}>
            When are you thinking?
          </h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {SEASON_OPTIONS.map((opt, i) => (
              <SeasonCard
                key={opt.id}
                label={opt.label}
                selected={state.season === opt.id}
                onClick={() => {
                  dispatch({ type: 'SET_SEASON', value: opt.id })
                  autoAdvance()
                }}
                index={i}
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
            resumePayload={resumePayload}
          />
        )}
      </div>
    </div>
  )
}
