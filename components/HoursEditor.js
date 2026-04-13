'use client'

import { useState, useCallback } from 'react'

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const DAY_LABELS = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

const TYPICAL_CAFE = {
  monday:    { open: '07:00', close: '16:00' },
  tuesday:   { open: '07:00', close: '16:00' },
  wednesday: { open: '07:00', close: '16:00' },
  thursday:  { open: '07:00', close: '16:00' },
  friday:    { open: '07:00', close: '16:00' },
  saturday:  { open: '08:00', close: '15:00' },
  sunday:    { open: '08:00', close: '15:00' },
}

function buildInitialState(initialHours) {
  const state = {}
  for (const day of DAY_ORDER) {
    const h = initialHours?.[day]
    state[day] = h
      ? { closed: false, open: h.open, close: h.close }
      : { closed: true, open: '09:00', close: '17:00' }
  }
  return state
}

function stateToPayload(state) {
  const result = {}
  for (const day of DAY_ORDER) {
    const d = state[day]
    if (!d.closed) {
      result[day] = { open: d.open, close: d.close }
    }
    // Closed days are omitted (null in the jsonb object)
  }
  return result
}

export default function HoursEditor({ listingId, initialHours }) {
  const [hours, setHours] = useState(() => buildInitialState(initialHours))
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null) // 'saved' | 'error'

  const updateDay = useCallback((day, field, value) => {
    setHours(prev => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }))
    setStatus(null)
  }, [])

  const toggleClosed = useCallback((day) => {
    setHours(prev => ({
      ...prev,
      [day]: { ...prev[day], closed: !prev[day].closed },
    }))
    setStatus(null)
  }, [])

  function copyPreviousDay(dayIndex) {
    if (dayIndex === 0) return
    const prevDay = DAY_ORDER[dayIndex - 1]
    const currentDay = DAY_ORDER[dayIndex]
    setHours(prev => ({
      ...prev,
      [currentDay]: { ...prev[prevDay] },
    }))
    setStatus(null)
  }

  function applyMondayToAll() {
    const mondayHours = hours.monday
    const updated = {}
    for (const day of DAY_ORDER) {
      updated[day] = { ...mondayHours }
    }
    setHours(updated)
    setStatus(null)
  }

  function applyTypicalCafe() {
    const updated = {}
    for (const day of DAY_ORDER) {
      updated[day] = { closed: false, open: TYPICAL_CAFE[day].open, close: TYPICAL_CAFE[day].close }
    }
    setHours(updated)
    setStatus(null)
  }

  async function handleSave() {
    setSaving(true)
    setStatus(null)
    try {
      const payload = stateToPayload(hours)
      const res = await fetch(`/api/admin/listings/${listingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours: payload }),
      })
      if (res.ok) {
        setStatus('saved')
        setTimeout(() => setStatus(null), 3000)
      } else {
        setStatus('error')
      }
    } catch (err) {
      console.error('Failed to save hours:', err)
      setStatus('error')
    }
    setSaving(false)
  }

  const shortcutButton = {
    padding: '0.35rem 0.7rem',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: '#fff',
    fontFamily: 'var(--font-body)',
    fontSize: '0.75rem',
    color: 'var(--color-ink)',
    cursor: 'pointer',
    transition: 'border-color 0.15s',
    whiteSpace: 'nowrap',
  }

  return (
    <div style={{ fontFamily: 'var(--font-body)' }}>
      {/* Shortcut buttons */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '1rem',
        flexWrap: 'wrap',
      }}>
        <button onClick={applyMondayToAll} style={shortcutButton}>
          Open 7 days
        </button>
        <button onClick={applyTypicalCafe} style={shortcutButton}>
          Typical cafe hours
        </button>
      </div>

      {/* Day rows */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        overflow: 'hidden',
      }}>
        {DAY_ORDER.map((day, i) => {
          const d = hours[day]
          return (
            <div
              key={day}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.6rem 0.75rem',
                borderBottom: i < DAY_ORDER.length - 1 ? '1px solid var(--color-border)' : 'none',
                background: d.closed ? '#fafafa' : '#fff',
                transition: 'background 0.15s',
              }}
            >
              {/* Day label */}
              <span style={{
                width: '80px',
                fontSize: '0.82rem',
                fontWeight: 500,
                color: d.closed ? 'var(--color-muted)' : 'var(--color-ink)',
                flexShrink: 0,
              }}>
                {DAY_LABELS[day]}
              </span>

              {/* Closed toggle */}
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.75rem',
                color: 'var(--color-muted)',
                cursor: 'pointer',
                flexShrink: 0,
                userSelect: 'none',
              }}>
                <input
                  type="checkbox"
                  checked={d.closed}
                  onChange={() => toggleClosed(day)}
                  style={{ margin: 0, accentColor: 'var(--color-sage, #5A7A6B)' }}
                />
                Closed
              </label>

              {/* Time inputs */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                flex: 1,
                opacity: d.closed ? 0.3 : 1,
                pointerEvents: d.closed ? 'none' : 'auto',
                transition: 'opacity 0.15s',
              }}>
                <input
                  type="time"
                  value={d.open}
                  onChange={(e) => updateDay(day, 'open', e.target.value)}
                  style={{
                    padding: '0.3rem 0.4rem',
                    borderRadius: '5px',
                    border: '1px solid var(--color-border)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.8rem',
                    color: 'var(--color-ink)',
                    background: '#fff',
                    width: '110px',
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>to</span>
                <input
                  type="time"
                  value={d.close}
                  onChange={(e) => updateDay(day, 'close', e.target.value)}
                  style={{
                    padding: '0.3rem 0.4rem',
                    borderRadius: '5px',
                    border: '1px solid var(--color-border)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.8rem',
                    color: 'var(--color-ink)',
                    background: '#fff',
                    width: '110px',
                  }}
                />
              </div>

              {/* Copy previous day */}
              {i > 0 && (
                <button
                  onClick={() => copyPreviousDay(i)}
                  title={`Same as ${DAY_LABELS[DAY_ORDER[i - 1]]}`}
                  style={{
                    padding: '0.25rem 0.4rem',
                    borderRadius: '4px',
                    border: '1px solid var(--color-border)',
                    background: '#fff',
                    cursor: 'pointer',
                    fontSize: '0.7rem',
                    color: 'var(--color-muted)',
                    fontFamily: 'var(--font-body)',
                    flexShrink: 0,
                    transition: 'border-color 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
                    <polyline points="17 1 21 5 17 9" />
                    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  </svg>
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Save row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: '1rem',
        gap: '0.75rem',
      }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '0.55rem 1.25rem',
            borderRadius: '8px',
            border: 'none',
            background: status === 'saved' ? '#dcfce7' : 'var(--color-sage, #5A7A6B)',
            color: status === 'saved' ? '#166534' : '#fff',
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
            fontWeight: 500,
            cursor: saving ? 'wait' : 'pointer',
            opacity: saving ? 0.7 : 1,
            transition: 'all 0.2s',
          }}
        >
          {saving ? 'Saving...' : status === 'saved' ? 'Saved' : 'Save hours'}
        </button>

        {status === 'error' && (
          <span style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.8rem',
            color: '#dc2626',
          }}>
            Failed to save. Please try again.
          </span>
        )}
      </div>
    </div>
  )
}
