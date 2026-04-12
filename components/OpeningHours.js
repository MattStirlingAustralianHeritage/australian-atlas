'use client'

import { useState, useEffect, useMemo } from 'react'

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const DAY_LABELS = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
}
const DAY_FULL = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday',
  friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
}

/** Convert "09:00" to "9am", "17:30" to "5:30pm", "12:00" to "12pm" */
function formatTime(t) {
  if (!t) return ''
  const [hStr, mStr] = t.split(':')
  let h = parseInt(hStr, 10)
  const m = parseInt(mStr, 10)
  const suffix = h >= 12 ? 'pm' : 'am'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return m > 0 ? `${h}:${mStr}${suffix}` : `${h}${suffix}`
}

/** Get current JS day name (lowercase) */
function getCurrentDay() {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  return days[new Date().getDay()]
}

/** Check if currently open based on hours for today */
function isOpenNow(hours) {
  const today = getCurrentDay()
  const todayHours = hours[today]
  if (!todayHours) return false

  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  const [openH, openM] = todayHours.open.split(':').map(Number)
  const [closeH, closeM] = todayHours.close.split(':').map(Number)
  const openMinutes = openH * 60 + openM
  const closeMinutes = closeH * 60 + closeM

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes
}

/**
 * Group consecutive days with identical hours.
 * Returns array of { startDay, endDay, open, close, closed }
 */
function groupHours(hours) {
  const groups = []
  let current = null

  for (const day of DAY_ORDER) {
    const h = hours[day]
    const key = h ? `${h.open}-${h.close}` : 'closed'

    if (current && current.key === key) {
      current.endDay = day
    } else {
      if (current) groups.push(current)
      current = {
        startDay: day,
        endDay: day,
        key,
        open: h?.open || null,
        close: h?.close || null,
        closed: !h,
      }
    }
  }
  if (current) groups.push(current)
  return groups
}

/** Format a group label like "Mon-Fri" or just "Sat" */
function groupLabel(group) {
  if (group.startDay === group.endDay) {
    return DAY_LABELS[group.startDay]
  }
  return `${DAY_LABELS[group.startDay]}\u2013${DAY_LABELS[group.endDay]}`
}

/** Check if a day falls within a group */
function dayInGroup(group, day) {
  const startIdx = DAY_ORDER.indexOf(group.startDay)
  const endIdx = DAY_ORDER.indexOf(group.endDay)
  const dayIdx = DAY_ORDER.indexOf(day)
  return dayIdx >= startIdx && dayIdx <= endIdx
}

export default function OpeningHours({ hours }) {
  const [expanded, setExpanded] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const groups = useMemo(() => groupHours(hours), [hours])

  const today = mounted ? getCurrentDay() : null
  const openNow = mounted ? isOpenNow(hours) : null
  const todayHours = mounted ? hours[today] : null

  return (
    <div style={{ marginTop: '16px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
      {/* Header row: label + open/closed indicator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: expanded ? '12px' : '0' }}>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
            color: 'var(--color-ink)',
            lineHeight: 1.4,
          }}
        >
          {/* Clock icon */}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-muted)', flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>

          {mounted && todayHours ? (
            <span>
              <span style={{ fontWeight: 500 }}>{DAY_FULL[today]}</span>
              {' '}
              <span style={{ color: 'var(--color-muted)' }}>
                {formatTime(todayHours.open)}{'\u2013'}{formatTime(todayHours.close)}
              </span>
            </span>
          ) : mounted ? (
            <span>
              <span style={{ fontWeight: 500 }}>{DAY_FULL[today]}</span>
              {' '}
              <span style={{ color: 'var(--color-muted)' }}>Closed</span>
            </span>
          ) : (
            <span style={{ color: 'var(--color-muted)' }}>Opening hours</span>
          )}

          {/* Chevron */}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              color: 'var(--color-muted)',
              transition: 'transform 0.2s ease',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* Open now / Closed now badge */}
        {mounted && openNow !== null && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontFamily: 'var(--font-body)',
              fontSize: '11px',
              fontWeight: 500,
              letterSpacing: '0.03em',
              color: openNow ? '#3a7d44' : 'var(--color-muted)',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: openNow ? '#3a7d44' : 'var(--color-muted)',
              }}
            />
            {openNow ? 'Open now' : 'Closed now'}
          </span>
        )}
      </div>

      {/* Expanded hours table */}
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {groups.map((group) => {
            const isToday = mounted && dayInGroup(group, today)
            return (
              <div
                key={group.startDay}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  fontFamily: 'var(--font-body)',
                  fontSize: '13px',
                  lineHeight: 1.5,
                  padding: '2px 0',
                  color: isToday ? 'var(--color-ink)' : 'var(--color-muted)',
                  fontWeight: isToday ? 500 : 400,
                }}
              >
                <span>{groupLabel(group)}</span>
                <span>
                  {group.closed
                    ? 'Closed'
                    : `${formatTime(group.open)}\u2013${formatTime(group.close)}`
                  }
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
