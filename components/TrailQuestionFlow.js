'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * 4-question pre-flight modal that shapes trail generation.
 * All questions on one screen — one interaction step on mobile.
 *
 * Q1: Accommodation — need | sorted | daytrip
 * Q2: Transport     — driving | public | walking
 * Q3: Who's coming  — solo | couple | friends | family
 * Q4: Pace          — relaxed | packed
 */

const QUESTIONS = [
  {
    key: 'accommodation',
    label: 'Accommodation',
    options: [
      { value: 'need', label: 'I\u2019ll need somewhere to stay' },
      { value: 'sorted', label: 'Already sorted' },
      { value: 'daytrip', label: 'Day trip' },
    ],
  },
  {
    key: 'transport',
    label: 'Getting around',
    options: [
      { value: 'driving', label: 'Driving' },
      { value: 'public', label: 'Public transport' },
      { value: 'walking', label: 'Walking or cycling' },
    ],
  },
  {
    key: 'group',
    label: 'Travelling with',
    options: [
      { value: 'solo', label: 'Solo' },
      { value: 'couple', label: 'Couple' },
      { value: 'friends', label: 'Friends' },
      { value: 'family', label: 'Family with kids' },
    ],
  },
  {
    key: 'pace',
    label: 'Pace',
    options: [
      { value: 'relaxed', label: 'Relaxed' },
      { value: 'packed', label: 'Packed' },
    ],
  },
]

export default function TrailQuestionFlow({ query, regionName, onClose }) {
  const router = useRouter()
  const [answers, setAnswers] = useState({
    accommodation: null,
    transport: null,
    group: null,
    pace: null,
  })

  // Close on Escape
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  function handleSelect(key, value) {
    setAnswers(prev => ({
      ...prev,
      [key]: prev[key] === value ? null : value,
    }))
  }

  function handleSubmit() {
    const params = new URLSearchParams({ q: query, _prefs: '1' })
    if (answers.accommodation) params.set('accommodation', answers.accommodation)
    if (answers.transport) params.set('transport', answers.transport)
    if (answers.group) params.set('group', answers.group)
    if (answers.pace) params.set('pace', answers.pace)
    router.replace(`/itinerary?${params.toString()}`)
  }

  function handleSkip() {
    router.replace(`/itinerary?q=${encodeURIComponent(query)}&_prefs=1`)
  }

  const answeredCount = Object.values(answers).filter(Boolean).length

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
          background: '#fff',
          borderRadius: 12,
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
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
              Tailor your trail
            </p>
            <p style={{
              fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22,
              color: 'var(--color-ink)', lineHeight: 1.25, margin: 0,
            }}>
              A few details to shape<br />your itinerary
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

        {/* Destination / query label — always shown as fixed context */}
        <div style={{ padding: '24px 32px 0' }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
            color: 'var(--color-muted)', marginBottom: 10,
            textTransform: 'uppercase', letterSpacing: '0.14em', lineHeight: 1,
          }}>
            {regionName ? 'Destination' : 'Your trail'}
          </p>
          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 16,
            color: 'var(--color-ink)',
            background: 'var(--color-cream, #faf7f2)',
            border: '1px solid var(--color-border, #e8e3da)',
            borderRadius: 8,
            padding: '12px 14px',
          }}>
            {regionName || query}
          </div>
        </div>

        {/* Questions */}
        <div style={{ padding: '28px 32px 8px' }}>
          {QUESTIONS.map(({ key, label, options }) => (
            <div key={key} style={{ marginBottom: 24 }}>
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
                color: 'var(--color-muted)', marginBottom: 10,
                textTransform: 'uppercase', letterSpacing: '0.14em', lineHeight: 1,
              }}>
                {label}
              </p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: options.length <= 3 ? `repeat(${options.length}, 1fr)` : 'repeat(2, 1fr)',
                gap: 8,
              }}>
                {options.map(opt => {
                  const selected = answers[key] === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => handleSelect(key, opt.value)}
                      style={{
                        fontFamily: 'var(--font-body)', fontWeight: selected ? 500 : 400,
                        fontSize: 13,
                        lineHeight: 1.4,
                        color: selected ? 'var(--color-ink)' : 'var(--color-text, #5a5347)',
                        background: selected ? 'var(--color-cream, #faf7f2)' : '#fff',
                        border: selected ? '1.5px solid var(--color-sage)' : '1px solid var(--color-border, #e8e3da)',
                        borderRadius: 8,
                        padding: '12px 14px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        textAlign: 'left',
                      }}
                      onMouseEnter={e => {
                        if (!selected) {
                          e.currentTarget.style.borderColor = 'var(--color-sage, #5F8A7E)'
                          e.currentTarget.style.background = 'var(--color-cream, #faf7f2)'
                        }
                      }}
                      onMouseLeave={e => {
                        if (!selected) {
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
            </div>
          ))}
        </div>

        {/* Divider */}
        <div style={{ margin: '0 32px', borderTop: '1px solid var(--color-border, #e8e3da)' }} />

        {/* Actions */}
        <div style={{
          padding: '20px 32px 28px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12,
        }}>
          <button
            onClick={handleSkip}
            style={{
              fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 13,
              color: 'var(--color-muted)', background: 'none', border: 'none',
              cursor: 'pointer', padding: '8px 0',
              letterSpacing: '0.01em',
            }}
          >
            Skip, just build it
          </button>
          <button
            onClick={handleSubmit}
            style={{
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13,
              color: '#fff', background: 'var(--color-ink, #2a2218)',
              border: 'none', borderRadius: 6,
              padding: '12px 28px',
              cursor: 'pointer',
              transition: 'opacity 0.15s',
              opacity: answeredCount > 0 ? 1 : 0.6,
              letterSpacing: '0.02em',
            }}
          >
            Build trail{answeredCount > 0 ? ` \u00b7 ${answeredCount}/4` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
