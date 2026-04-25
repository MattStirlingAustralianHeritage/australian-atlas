'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getListingRegion } from '@/lib/regions'

/**
 * "Start a trail here" button + modal for listing detail pages.
 *
 * Renders a CTA button that opens a lightweight modal asking for
 * trip preferences (days, accommodation, transport, group, pace).
 * On submit, navigates to /itinerary with the listing as the anchor.
 *
 * Props:
 *   listing  – { id, name, slug, region, state, vertical, lat, lng }
 */

const ACCOMMODATION_OPTIONS = [
  { value: 'need', label: 'I\u2019ll need somewhere to stay' },
  { value: 'sorted', label: 'Already sorted' },
  { value: 'daytrip', label: 'Day trip' },
]

const TRANSPORT_OPTIONS = [
  { value: 'driving', label: 'Driving' },
  { value: 'public', label: 'Public transport' },
  { value: 'walking', label: 'Walking or cycling' },
]

const GROUP_OPTIONS = [
  { value: 'solo', label: 'Solo' },
  { value: 'couple', label: 'Couple' },
  { value: 'friends', label: 'Friends' },
  { value: 'family', label: 'Family with kids' },
]

const PACE_OPTIONS = [
  { value: 'relaxed', label: 'Relaxed' },
  { value: 'packed', label: 'Packed' },
]

const DAYS_OPTIONS = [
  { value: '1', label: '1 day' },
  { value: '2', label: '2 days' },
  { value: '3', label: '3 days' },
  { value: '5', label: '5 days' },
]

function OptionGrid({ options, selected, onSelect, columns }) {
  const cols = columns || (options.length <= 3 ? options.length : 2)
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: 8,
    }}>
      {options.map(opt => {
        const active = selected === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => onSelect(active ? null : opt.value)}
            style={{
              fontFamily: 'var(--font-body)', fontWeight: active ? 500 : 400,
              fontSize: 13, lineHeight: 1.4,
              color: active ? 'var(--color-ink)' : 'var(--color-text, #5a5347)',
              background: active ? 'var(--color-cream, #faf7f2)' : '#fff',
              border: active ? '1.5px solid var(--color-sage)' : '1px solid var(--color-border, #e8e3da)',
              borderRadius: 8, padding: '12px 14px',
              cursor: 'pointer', transition: 'all 0.15s ease', textAlign: 'left',
            }}
            onMouseEnter={e => {
              if (!active) {
                e.currentTarget.style.borderColor = 'var(--color-sage, #5F8A7E)'
                e.currentTarget.style.background = 'var(--color-cream, #faf7f2)'
              }
            }}
            onMouseLeave={e => {
              if (!active) {
                e.currentTarget.style.borderColor = 'var(--color-border, #e8e3da)'
                e.currentTarget.style.background = '#fff'
              }
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function QuestionBlock({ label, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{
        fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
        color: 'var(--color-muted)', marginBottom: 10,
        textTransform: 'uppercase', letterSpacing: '0.14em', lineHeight: 1,
      }}>
        {label}
      </p>
      {children}
    </div>
  )
}

function StartTrailModal({ listing, onClose }) {
  const router = useRouter()
  const [answers, setAnswers] = useState({
    days: '1',
    accommodation: null,
    transport: null,
    group: null,
    pace: null,
  })

  // Close on Escape
  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  // When days = 1, force daytrip accommodation
  useEffect(() => {
    if (answers.days === '1' && answers.accommodation !== 'daytrip') {
      setAnswers(prev => ({ ...prev, accommodation: 'daytrip' }))
    }
  }, [answers.days])

  function set(key, value) {
    setAnswers(prev => ({ ...prev, [key]: value }))
  }

  function buildQuery() {
    // Build a natural-language query from the listing context
    const region = getListingRegion(listing)?.name || listing.state || 'Australia'
    const days = parseInt(answers.days, 10) || 1
    return `${days} day${days > 1 ? 's' : ''} in ${region}`
  }

  function handleSubmit() {
    const params = new URLSearchParams({
      q: buildQuery(),
      anchor: String(listing.id),
      _prefs: '1',
    })
    if (answers.accommodation) params.set('accommodation', answers.accommodation)
    if (answers.transport) params.set('transport', answers.transport)
    if (answers.group) params.set('group', answers.group)
    if (answers.pace) params.set('pace', answers.pace)
    router.push(`/itinerary?${params.toString()}`)
  }

  function handleSkip() {
    const params = new URLSearchParams({
      q: buildQuery(),
      anchor: String(listing.id),
      _prefs: '1',
    })
    router.push(`/itinerary?${params.toString()}`)
  }

  const answeredCount = Object.values(answers).filter(Boolean).length
  const showAccommodation = answers.days !== '1'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(42, 34, 24, 0.4)',
        backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: '#fff', borderRadius: 12,
          width: '100%', maxWidth: 520, maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 24px 64px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
          border: '1px solid rgba(0,0,0,0.04)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '32px 32px 0',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div>
            <p style={{
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 10,
              color: 'var(--color-sage)', textTransform: 'uppercase',
              letterSpacing: '0.18em', marginBottom: 8, lineHeight: 1,
            }}>
              Start a trail
            </p>
            <p style={{
              fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22,
              color: 'var(--color-ink)', lineHeight: 1.25, margin: 0,
            }}>
              Build a trail starting<br />from {listing.name}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-muted)', padding: 4, marginTop: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Anchor listing pill */}
        <div style={{ padding: '20px 32px 0' }}>
          <div style={{
            fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 14,
            color: 'var(--color-ink)',
            background: 'var(--color-cream, #faf7f2)',
            border: '1px solid var(--color-border, #e8e3da)',
            borderRadius: 8, padding: '12px 14px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-sage)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span style={{ fontWeight: 500 }}>{listing.name}</span>
            {(() => {
              const r = getListingRegion(listing)
              return r && <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>{r.name}</span>
            })()}
          </div>
        </div>

        {/* Questions */}
        <div style={{ padding: '28px 32px 8px' }}>
          <QuestionBlock label="How many days?">
            <OptionGrid
              options={DAYS_OPTIONS}
              selected={answers.days}
              onSelect={v => set('days', v || '1')}
              columns={4}
            />
          </QuestionBlock>

          {showAccommodation && (
            <QuestionBlock label="Accommodation">
              <OptionGrid
                options={ACCOMMODATION_OPTIONS}
                selected={answers.accommodation}
                onSelect={v => set('accommodation', v)}
              />
            </QuestionBlock>
          )}

          <QuestionBlock label="Getting around">
            <OptionGrid
              options={TRANSPORT_OPTIONS}
              selected={answers.transport}
              onSelect={v => set('transport', v)}
            />
          </QuestionBlock>

          <QuestionBlock label="Travelling with">
            <OptionGrid
              options={GROUP_OPTIONS}
              selected={answers.group}
              onSelect={v => set('group', v)}
              columns={2}
            />
          </QuestionBlock>

          <QuestionBlock label="Pace">
            <OptionGrid
              options={PACE_OPTIONS}
              selected={answers.pace}
              onSelect={v => set('pace', v)}
            />
          </QuestionBlock>
        </div>

        {/* Divider */}
        <div style={{ margin: '0 32px', borderTop: '1px solid var(--color-border, #e8e3da)' }} />

        {/* Actions */}
        <div style={{
          padding: '20px 32px 28px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <button
            onClick={handleSkip}
            style={{
              fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 13,
              color: 'var(--color-muted)', background: 'none', border: 'none',
              cursor: 'pointer', padding: '8px 0', letterSpacing: '0.01em',
            }}
          >
            Skip, just build it
          </button>
          <button
            onClick={handleSubmit}
            style={{
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13,
              color: '#fff', background: 'var(--color-ink, #2a2218)',
              border: 'none', borderRadius: 6, padding: '12px 28px',
              cursor: 'pointer', transition: 'opacity 0.15s',
              opacity: answeredCount > 1 ? 1 : 0.6,
              letterSpacing: '0.02em',
            }}
          >
            Build trail · {answeredCount}/5
          </button>
        </div>
      </div>
    </div>
  )
}

export default function StartTrailButton({ listing }) {
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
        style={{
          fontFamily: 'var(--font-body)',
          border: '1px solid var(--color-sage, #5F8A7E)',
          color: 'var(--color-sage, #5F8A7E)',
          background: 'transparent',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'var(--color-sage, #5F8A7E)'
          e.currentTarget.style.color = '#fff'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--color-sage, #5F8A7E)'
        }}
      >
        Start a trail here
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 17l5-5-5-5" />
          <path d="M6 17l5-5-5-5" />
        </svg>
      </button>

      {showModal && (
        <StartTrailModal
          listing={listing}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}
