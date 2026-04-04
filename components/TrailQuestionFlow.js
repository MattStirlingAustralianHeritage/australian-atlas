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
      { value: 'need', label: "I'll need somewhere to stay", icon: '🏠' },
      { value: 'sorted', label: 'Already sorted', icon: '✓' },
      { value: 'daytrip', label: 'Day trip / live here', icon: '☀' },
    ],
  },
  {
    key: 'transport',
    label: 'Getting around',
    options: [
      { value: 'driving', label: 'Driving', icon: '🚗' },
      { value: 'public', label: 'Public transport', icon: '🚌' },
      { value: 'walking', label: 'Walking or cycling', icon: '🚶' },
    ],
  },
  {
    key: 'group',
    label: "Who's coming",
    options: [
      { value: 'solo', label: 'Solo', icon: '🧑' },
      { value: 'couple', label: 'Couple', icon: '💛' },
      { value: 'friends', label: 'Friends', icon: '👥' },
      { value: 'family', label: 'Family with kids', icon: '👨‍👩‍👧' },
    ],
  },
  {
    key: 'pace',
    label: 'Pace',
    options: [
      { value: 'relaxed', label: 'Relaxed', icon: '🌿' },
      { value: 'packed', label: 'Packed', icon: '⚡' },
    ],
  },
]

export default function TrailQuestionFlow({ query, onClose }) {
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
      [key]: prev[key] === value ? null : value, // toggle on re-click
    }))
  }

  function handleSubmit() {
    const params = new URLSearchParams({ q: query })
    if (answers.accommodation) params.set('accommodation', answers.accommodation)
    if (answers.transport) params.set('transport', answers.transport)
    if (answers.group) params.set('group', answers.group)
    if (answers.pace) params.set('pace', answers.pace)
    router.push(`/itinerary?${params.toString()}`)
  }

  function handleSkip() {
    router.push(`/itinerary?q=${encodeURIComponent(query)}`)
  }

  const answeredCount = Object.values(answers).filter(Boolean).length

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: 'var(--color-bg)',
          borderRadius: 16,
          width: '100%',
          maxWidth: 480,
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 16px 48px rgba(0,0,0,0.15)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px 0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <p style={{
              fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 11,
              color: 'var(--color-sage)', textTransform: 'uppercase',
              letterSpacing: '0.1em', marginBottom: 4,
            }}>
              Quick setup
            </p>
            <p style={{
              fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 20,
              color: 'var(--color-ink)', lineHeight: 1.3,
            }}>
              A few details for a better trail
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-muted)', fontSize: 20, padding: 4,
            }}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Questions */}
        <div style={{ padding: '20px 24px' }}>
          {QUESTIONS.map(({ key, label, options }) => (
            <div key={key} style={{ marginBottom: 20 }}>
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 12,
                color: 'var(--color-muted)', marginBottom: 8,
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                {label}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {options.map(opt => {
                  const selected = answers[key] === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => handleSelect(key, opt.value)}
                      style={{
                        fontFamily: 'var(--font-body)', fontWeight: selected ? 500 : 400,
                        fontSize: 13,
                        color: selected ? 'white' : 'var(--color-ink)',
                        background: selected ? 'var(--color-sage)' : 'var(--color-cream)',
                        border: selected ? '1.5px solid var(--color-sage)' : '1.5px solid var(--color-border)',
                        borderRadius: 99,
                        padding: '7px 14px',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      <span style={{ fontSize: 13 }}>{opt.icon}</span>
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{
          padding: '0 24px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12,
        }}>
          <button
            onClick={handleSkip}
            style={{
              fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 13,
              color: 'var(--color-muted)', background: 'none', border: 'none',
              cursor: 'pointer', padding: '8px 0',
              textDecoration: 'underline', textUnderlineOffset: 3,
            }}
          >
            Skip, just build it
          </button>
          <button
            onClick={handleSubmit}
            style={{
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13,
              color: 'white', background: 'var(--color-sage)',
              border: 'none', borderRadius: 99,
              padding: '10px 24px',
              cursor: 'pointer',
              transition: 'opacity 0.15s',
              opacity: answeredCount > 0 ? 1 : 0.7,
            }}
          >
            Build trail{answeredCount > 0 ? ` (${answeredCount}/4)` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
