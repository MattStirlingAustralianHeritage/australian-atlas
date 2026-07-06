'use client'

import { useReducer, useEffect, useRef, useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  VERTICAL_LABELS,
  StopCard,
  TripRender,
  StaysOnlyRender,
} from '@/components/PlanAStayTripRender'
import RegionMapSelect from '@/components/RegionMapSelect'
import AuthModal from '@/components/AuthModal'
import { readDiscoveryPicks } from '@/lib/discover/sessionPicks'
import { writeDraft, stopsFromPlanAStayTrip } from '@/lib/trail/draft'

/* ─── Trip persistence helpers ───────────────────────────────────────────
   Build the exact payload sent to /share and /save. Visitor accommodation
   picks AND any stop edits (swap/remove/add/reorder — lifted into
   OutputScreen) are folded into the trip's days so the stored trip matches
   what was on screen. The unplaced `alternates` are stripped: a shared
   trip is frozen, and identical visible trips should fingerprint alike. */
function buildTripPayload(tripData, accommodationByDay, editedDays) {
  const payload = { answers: tripData._answers || {} }
  if (tripData.stays_only) {
    payload.stays_only = tripData.stays_only
  } else {
    const byDay = accommodationByDay || {}
    const sourceDays = editedDays || tripData.trip.days || []
    payload.trip = {
      ...tripData.trip,
      days: sourceDays.map(d => {
        const { alternates, ...rest } = d
        return {
          ...rest,
          accommodation: byDay[d.day_number] || null,
        }
      }),
    }
  }
  return payload
}

// Stash key + query flag for resuming a save across a Google OAuth redirect
// (the trip lives only in client state, so we carry it through sessionStorage).
const RESUME_SAVE_KEY = 'pas:resumeSave'
const RESUME_QUERY = 'save'

/* ─── Funnel events (fire-and-forget, never blocks the UI) ─────────────── */
function trackPlannerEvent(event_type, payload = {}) {
  try {
    fetch('/api/plan-a-stay/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type, ...payload }),
      keepalive: true,
    }).catch(() => {})
  } catch { /* analytics must never break planning */ }
}

/* ─── Region data ────────────────────────────────────────────────────────
   Regions with ≥5 active Rest listings, derived live from threshold
   query. Passed as prop from the server page component.
   Shape: [{ name, state, slug, listing_count }]                       */

/* ─── Question definitions ───────────────────────────────────────────── */
const INTENT_OPTIONS = [
  { id: 'food-and-producers', labelKey: 'intentFoodLabel', subKey: 'intentFoodSub' },
  { id: 'landscape-and-walking', labelKey: 'intentLandscapeLabel', subKey: 'intentLandscapeSub' },
  { id: 'makers-and-craft', labelKey: 'intentMakersLabel', subKey: 'intentMakersSub' },
  { id: 'quiet-and-slow', labelKey: 'intentQuietLabel', subKey: 'intentQuietSub' },
  { id: 'a-bit-of-everything', labelKey: 'intentEverythingLabel', subKey: 'intentEverythingSub' },
]

const PACING_OPTIONS = [
  { id: 'out-early-back-late', labelKey: 'pacingEarlyLateLabel', subKey: 'pacingEarlyLateSub' },
  { id: 'steady', labelKey: 'pacingSteadyLabel', subKey: 'pacingSteadySub' },
  { id: 'as-little-driving', labelKey: 'pacingLittleDrivingLabel', subKey: 'pacingLittleDrivingSub' },
  { id: 'surprise-us', labelKey: 'pacingSurpriseLabel', subKey: 'pacingSurpriseSub' },
]

const DURATION_OPTIONS = [
  { id: 2, labelKey: 'durationTwo' },
  { id: 3, labelKey: 'durationThree' },
  { id: 4, labelKey: 'durationFour' },
  { id: 5, labelKey: 'durationFive' },
  { id: 6, labelKey: 'durationLonger' },
]

const SEASON_OPTIONS = [
  { id: 'this-month', labelKey: 'seasonThisMonth' },
  { id: 'next-month', labelKey: 'seasonNextMonth' },
  { id: 'a-few-months-out', labelKey: 'seasonFewMonths' },
  { id: 'just-exploring', labelKey: 'seasonJustExploring' },
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
function intentSummary(ids, t) {
  return ids.map(id => {
    const opt = INTENT_OPTIONS.find(o => o.id === id)
    return opt ? t(opt.labelKey) : null
  }).filter(Boolean).join(', ')
}

function pacingSummary(id, t) {
  const opt = PACING_OPTIONS.find(o => o.id === id)
  return opt ? t(opt.labelKey) : ''
}

function durationSummary(val, t) {
  if (val === 6) return t('durationLonger')
  return val ? t('durationSummaryDays', { count: val }) : ''
}

function regionSummary(val, t) {
  if (val === '__not_sure') return t('regionNotSureYet')
  return val || ''
}

function seasonSummary(id, t) {
  const opt = SEASON_OPTIONS.find(o => o.id === id)
  return opt ? t(opt.labelKey) : ''
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
  const t = useTranslations('planStay')
  if (!visible || !text) return null // eslint-disable-line
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
      <span style={{ opacity: 0.55 }}>{t('youSaid')}</span>{' '}
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
      aria-pressed={selected}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        width: '100%',
        textAlign: 'left',
        padding: '16px 0',
        background: selected ? 'rgba(196,96,58,0.05)' : 'transparent',
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
      aria-pressed={selected}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        width: '100%',
        textAlign: 'left',
        padding: '16px 0',
        background: selected ? 'rgba(196,96,58,0.05)' : 'transparent',
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
      aria-pressed={selected}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        width: '100%',
        textAlign: 'left',
        padding: '16px 0',
        background: selected ? 'rgba(196,96,58,0.05)' : 'transparent',
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
      aria-pressed={selected}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        width: '100%',
        textAlign: 'left',
        padding: '16px 0',
        background: selected ? 'rgba(196,96,58,0.05)' : 'transparent',
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

/* ─── Region recommendations ("Not sure where yet") ──────────────────────
   Scores every qualifying region against the intent + duration answered so
   far (/api/plan-a-stay/recommend) and offers the top three. The "why" is
   the live counts themselves — nothing editorial is asserted.            */
function RecommendRegions({ intent, duration, onSelect }) {
  const t = useTranslations('planStay')
  const tr = useTranslations('regions')
  const [state, setState] = useState('idle') // idle | loading | done | error
  const [recs, setRecs] = useState([])

  async function load() {
    setState('loading')
    try {
      const res = await fetch('/api/plan-a-stay/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent, duration }),
      })
      if (!res.ok) throw new Error(`recommend failed: ${res.status}`)
      const data = await res.json()
      setRecs(data.recommendations || [])
      setState('done')
    } catch (err) {
      console.error('[plan-a-stay] recommend error:', err)
      setState('error')
    }
  }

  if (state === 'idle') {
    return (
      <button
        onClick={load}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
          fontFamily: 'var(--font-body)',
          background: 'rgba(196,151,59,0.04)',
          border: '1px dashed rgba(196,151,59,0.45)',
          borderRadius: 10, padding: '13px 18px', cursor: 'pointer', marginBottom: 22,
          transition: 'background 0.18s ease, border-color 0.18s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(196,151,59,0.08)'; e.currentTarget.style.borderColor = 'rgba(196,151,59,0.65)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(196,151,59,0.04)'; e.currentTarget.style.borderColor = 'rgba(196,151,59,0.45)' }}
      >
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, borderRadius: 999, flexShrink: 0,
          background: 'rgba(196,151,59,0.14)', color: 'var(--color-gold, #C4973B)',
          fontSize: 15, lineHeight: 1,
        }}>✦</span>
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink, #1C1A17)' }}>
            {t('recommendTitle')}
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-muted, #6B6760)', marginTop: 1 }}>
            {t('recommendSub')}
          </span>
        </span>
      </button>
    )
  }

  if (state === 'loading') {
    return (
      <p style={{
        fontFamily: 'var(--font-body)', fontSize: 13, fontStyle: 'italic',
        color: 'var(--color-muted, #6B6760)', margin: '0 0 22px', padding: '13px 18px',
      }}>
        {t('recommendLoading')}
      </p>
    )
  }

  if (state === 'error' || recs.length === 0) {
    return (
      <p style={{
        fontFamily: 'var(--font-body)', fontSize: 13,
        color: 'var(--color-muted, #6B6760)', margin: '0 0 22px', padding: '13px 18px',
      }}>
        {t('recommendError')}
      </p>
    )
  }

  return (
    <div style={{
      border: '1px solid rgba(196,151,59,0.35)',
      borderRadius: 10, overflow: 'hidden', background: '#fff', marginBottom: 26,
    }}>
      <div style={{
        padding: '10px 16px', background: 'rgba(196,151,59,0.07)',
        borderBottom: '1px solid rgba(28,26,23,0.08)',
        fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 700,
        letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-gold, #C4973B)',
      }}>
        {t('recommendHeader')}
      </div>
      {recs.map((r, i) => (
        <button
          key={r.name}
          onClick={() => {
            trackPlannerEvent('pas_recommend_used', { region: r.name, intent, duration })
            onSelect(r.name)
          }}
          style={{
            display: 'flex', flexDirection: 'column', gap: 4,
            width: '100%', textAlign: 'left', padding: '14px 16px',
            background: 'transparent', cursor: 'pointer', border: 'none',
            borderTop: i === 0 ? 'none' : '1px solid rgba(28,26,23,0.06)',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(196,151,59,0.06)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{
              fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 400,
              color: 'var(--color-ink, #1C1A17)', flex: 1,
            }}>
              {r.name}
            </span>
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
              letterSpacing: '0.14em', textTransform: 'uppercase',
              color: 'var(--color-muted, #6B6760)', opacity: 0.6,
            }}>
              {r.state}
            </span>
          </span>
          <span style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            fontFamily: 'var(--font-body)', fontSize: 12,
            color: 'var(--color-muted, #6B6760)',
          }}>
            <span>{tr('stayCount', { count: r.stays })}</span>
            {r.breakdown.map(b => (
              <span key={b.vertical} style={{
                padding: '2px 9px', borderRadius: 999,
                background: 'rgba(196,151,59,0.09)', color: '#8a6a25',
                fontWeight: 600, fontSize: 11.5,
              }}>
                {VERTICAL_LABELS[b.vertical] || b.vertical} {b.count}
              </span>
            ))}
          </span>
        </button>
      ))}
    </div>
  )
}

/* ─── Continue button ────────────────────────────────────────────────── */
function ContinueButton({ onClick, visible }) {
  const t = useTranslations('planStay')
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
        {t('continue')}
      </button>
    </div>
  )
}

/* ─── Loading screen ─────────────────────────────────────────────────── */
function LoadingScreen({ state, onComplete, onError }) {
  const t = useTranslations('planStay')
  const lines = [
    t('loadingLookingAtListed'),
    t('loadingSequencingDays'),
    t('loadingWritingTrip'),
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
          }).then(assembled => ({
            assembled,
            personalised: !!retrieval.coverage?.personalised,
          }))
        })
        .then(({ assembled, personalised }) => {
          // Show line 3 — done
          setVisibleCount()
          // Brief pause so the user sees "Writing the trip…" before output
          setTimeout(() => onComplete(assembled, answers, personalised), 600)
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
      <style>{`@keyframes pas-pulse { 0%,100% { opacity: 0.35; transform: scale(0.94); } 50% { opacity: 1; transform: scale(1.06); } }`}</style>
      <span aria-hidden="true" style={{
        fontSize: 22,
        color: 'var(--color-gold, #B98A2F)',
        animation: 'pas-pulse 1.6s ease-in-out infinite',
        marginBottom: 6,
      }}>✦</span>
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
  const t = useTranslations('planStay')
  const [shareState, setShareState] = useState('idle') // idle | sharing | shared | error
  const [shareUrl, setShareUrl] = useState(null)
  // Accommodation the visitor picks per day (day_number → stay), lifted here
  // so the Share button can fold the choices into the saved trip.
  const [accommodationByDay, setAccommodationByDay] = useState({})
  // The days as edited in the renderer (swap/remove/add/reorder) — Share and
  // Save persist exactly what's on screen.
  const [editedDays, setEditedDays] = useState(null)
  // First onDaysChange is the initial render, not an edit.
  const daysChangeCount = useRef(0)
  const handleDaysChange = useCallback((days) => {
    setEditedDays(days)
    if (daysChangeCount.current++ > 0) {
      trackPlannerEvent('pas_trip_edited', { region: tripData?._answers?.region })
    }
  }, [tripData])

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
          {t('somethingWentWrong')}
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
          {t('startOver')}
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
          {t('couldntBuildTrip')}
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
          {t('tryAgain')}
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
      <TripRender
        trip={tripData.trip}
        onAccommodationChange={setAccommodationByDay}
        onDaysChange={handleDaysChange}
        editable
        personalised={!!tripData._personalised}
      />
      <ActionButtons
        tripData={tripData}
        accommodationByDay={accommodationByDay}
        editedDays={editedDays}
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


/* ─── Action buttons (Save / Share / Print / Map / Start over) ───────── */
function ActionButtons({ tripData, accommodationByDay, editedDays, onReset, shareState, setShareState, shareUrl, setShareUrl, resumePayload }) {
  const t = useTranslations('planStay')
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | error
  const [savedUrl, setSavedUrl] = useState(null)
  const [authOpen, setAuthOpen] = useState(false)
  const resumeFiredRef = useRef(false)

  async function handleShare() {
    if (shareState === 'sharing') return

    setShareState('sharing')
    try {
      const payload = buildTripPayload(tripData, accommodationByDay, editedDays)

      const res = await fetch('/api/plan-a-stay/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error(`Share failed: ${res.status}`)

      const result = await res.json()
      const fullUrl = `${window.location.origin}${result.url}`
      setShareUrl(fullUrl)
      trackPlannerEvent('pas_trip_shared', { region: tripData?._answers?.region })

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
    const payload = explicitPayload || buildTripPayload(tripData, accommodationByDay, editedDays)
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
      trackPlannerEvent('pas_trip_saved', { region: tripData?._answers?.region })
    } catch (err) {
      console.error('[plan-a-stay] Save error:', err)
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 3000)
    }
  }, [saveState, tripData, accommodationByDay, editedDays])

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
    shareState === 'sharing' ? t('sharing') :
    shareState === 'shared' ? t('linkCopied') :
    shareState === 'error' ? t('failedTryAgain') :
    t('share')

  const saveLabel =
    saveState === 'saving' ? t('saving') :
    saveState === 'saved' ? t('saved') :
    saveState === 'error' ? t('failedTryAgain') :
    t('saveToAccount')

  return (
    <div className="pas-no-print" style={{
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
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={() => doSave()}
            disabled={saveState === 'saving' || saveState === 'saved'}
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              fontSize: 14,
              color: '#FAF8F4',
              background: saveState === 'saved' ? '#5a7c5a' : 'var(--color-ink, #1C1A17)',
              border: '1px solid transparent',
              borderRadius: 999,
              padding: '11px 26px',
              cursor: saveState === 'saving' ? 'wait' : saveState === 'saved' ? 'default' : 'pointer',
              transition: 'background 0.2s ease, opacity 0.2s ease',
            }}
            onMouseEnter={e => { if (saveState === 'idle') e.currentTarget.style.opacity = '0.85' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
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
              background: '#FFFCF7',
              border: `1px solid ${shareState === 'shared' ? 'rgba(90,124,90,0.4)' : 'rgba(28,26,23,0.16)'}`,
              borderRadius: 999,
              padding: '11px 24px',
              cursor: shareState === 'sharing' ? 'wait' : 'pointer',
              transition: 'border-color 0.2s ease, color 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(28,26,23,0.34)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = shareState === 'shared' ? 'rgba(90,124,90,0.4)' : 'rgba(28,26,23,0.16)' }}
          >
            {shareLabel}
          </button>
          {/* One tech tree: hand the drafted trip to the /map trail planner
              as an editable trail — same draft shape, same engine. */}
          {tripData?.trip && (
            <button
              onClick={() => {
                const tripForMap = editedDays
                  ? { ...tripData.trip, days: editedDays }
                  : tripData.trip
                const stops = stopsFromPlanAStayTrip(tripForMap)
                if (stops.length < 2) return
                writeDraft({
                  name: tripData.trip.title || '',
                  desc: '',
                  visibility: 'private',
                  transportMode: 'drive',
                  neighbourhoodLabel: '',
                  stops,
                  notes: {},
                  savedAt: Date.now(),
                })
                window.location.href = '/map?trail=1'
              }}
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 500,
                fontSize: 14,
                color: 'var(--color-ink, #1C1A17)',
                background: '#FFFCF7',
                border: '1px solid rgba(28,26,23,0.16)',
                borderRadius: 999,
                padding: '11px 24px',
                cursor: 'pointer',
                transition: 'border-color 0.2s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(28,26,23,0.34)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(28,26,23,0.16)' }}
            >
              {t('openOnMap')}
            </button>
          )}
          {tripData?.trip && (
            <button
              onClick={() => window.print()}
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 500,
                fontSize: 14,
                color: 'var(--color-ink, #1C1A17)',
                background: '#FFFCF7',
                border: '1px solid rgba(28,26,23,0.16)',
                borderRadius: 999,
                padding: '11px 24px',
                cursor: 'pointer',
                transition: 'border-color 0.2s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(28,26,23,0.34)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(28,26,23,0.16)' }}
            >
              {t('printTrip')}
            </button>
          )}
          <button
            onClick={onReset}
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
              fontSize: 14,
              color: 'var(--color-muted, #6B6760)',
              background: 'transparent',
              border: '1px solid transparent',
              borderRadius: 999,
              padding: '11px 18px',
              cursor: 'pointer',
              transition: 'color 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-ink, #1C1A17)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-muted, #6B6760)' }}
          >
            {t('startOver')}
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
            {t.rich('savedToAccount', {
              link: (chunks) => (
                <a
                  href="/account/trails"
                  style={{ color: '#5a7c5a', textDecoration: 'underline' }}
                >
                  {chunks}
                </a>
              ),
            })}
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
  const t = useTranslations('planStay')
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
  const handleLoadingComplete = useCallback((assembled, answers, personalised) => {
    // Attach answers so the Share button can send them to the share endpoint.
    // _personalised is display-only (buildTripPayload never reads it).
    setTripData({ ...assembled, _answers: answers, _personalised: !!personalised })
    setTripError(null)
    setResumePayload(null)   // a fresh trip is not a resume
    dispatch({ type: 'GO_TO_STEP', value: 'output' })
    if (assembled?.trip) {
      trackPlannerEvent('pas_trip_generated', {
        region: answers.region,
        intent: answers.intent,
        duration: answers.duration,
        meta: { personalised: !!personalised, days: assembled.trip.days?.length || 0 },
      })
    }
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
      text: state.intent.length > 0 ? intentSummary(state.intent, t) : null,
    },
    {
      step: 'pacing',
      text: state.pacing ? pacingSummary(state.pacing, t) : null,
    },
    {
      step: 'duration',
      text: state.duration ? durationSummary(state.duration, t) : null,
    },
    {
      step: 'region',
      text: state.region ? regionSummary(state.region, t) : null,
    },
    ...(state.needsSeason ? [{
      step: 'season',
      text: state.season ? seasonSummary(state.season, t) : null,
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
            {t('intentTitle')}
          </h1>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            color: 'var(--color-muted, #6B6760)',
            lineHeight: 1.5,
            marginBottom: 28,
          }}>
            {t('intentSubhead')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {INTENT_OPTIONS.map((opt, i) => (
              <OptionCard
                key={opt.id}
                label={t(opt.labelKey)}
                sub={t(opt.subKey)}
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
            {t('pacingTitle')}
          </h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {PACING_OPTIONS.map((opt, i) => (
              <OptionCard
                key={opt.id}
                label={t(opt.labelKey)}
                sub={t(opt.subKey)}
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
            {t('durationTitle')}
          </h1>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
          }}>
            {DURATION_OPTIONS.map((opt, i) => (
              <DurationPill
                key={opt.id}
                label={t(opt.labelKey)}
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
            {t('regionTitle')}
          </h1>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            color: 'var(--color-muted, #6B6760)',
            lineHeight: 1.5,
            marginBottom: 24,
          }}>
            {t('regionSubhead')}
          </p>
          <RecommendRegions
            intent={state.intent}
            duration={state.duration || 3}
            onSelect={(name) => {
              dispatch({ type: 'SET_REGION', value: name })
              autoAdvance()
            }}
          />
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
            {t('seasonTitle')}
          </h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {SEASON_OPTIONS.map((opt, i) => (
              <SeasonCard
                key={opt.id}
                label={t(opt.labelKey)}
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
