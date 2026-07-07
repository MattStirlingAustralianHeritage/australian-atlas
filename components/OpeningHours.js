'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

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

/**
 * Format a day's interval list for display.
 *  - single: "9am–5pm"
 *  - split:  "9am–12pm, 1pm–5pm"
 *  - open-ended (no close, e.g. "from 4pm / til late"): "4pm–"
 */
function formatIntervals(intervals) {
  return intervals
    .map((iv) => (iv.close ? `${formatTime(iv.open)}–${formatTime(iv.close)}` : `${formatTime(iv.open)}–`))
    .join(', ')
}

/** Get current JS day name (lowercase) */
function getCurrentDay() {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  return days[new Date().getDay()]
}

/**
 * Normalize either shape into a uniform `{ monday:[{open,close|null}], ... }`
 * containing only the OPEN days:
 *   - legacy flat day-map:   { monday: { open, close }, ... }
 *   - enrichment rich shape: { regular: { monday: [{ open, close }] }, human, recurring, ... }
 * A null `close` is preserved (open-ended "from 4pm" hours).
 */
function normalizeRegular(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const src = raw.regular && typeof raw.regular === 'object' ? raw.regular : raw
  const out = {}
  for (const day of DAY_ORDER) {
    const v = src[day]
    if (!v) continue
    let intervals = []
    if (Array.isArray(v)) {
      intervals = v.filter((iv) => iv && iv.open).map((iv) => ({ open: iv.open, close: iv.close || null }))
    } else if (typeof v === 'object' && v.open) {
      intervals = [{ open: v.open, close: v.close || null }]
    }
    if (intervals.length) out[day] = intervals
  }
  return out
}

/**
 * Is the venue open right now, judged from the regular weekly hours only.
 * Returns true / false / null (null = no regular data to judge, e.g. a
 * recurring-only market — caller then hides the badge rather than lie "Closed").
 */
function computeOpenNow(reg) {
  if (!reg || Object.keys(reg).length === 0) return null
  const intervals = reg[getCurrentDay()]
  if (!intervals || !intervals.length) return false
  const now = new Date()
  const cur = now.getHours() * 60 + now.getMinutes()
  for (const iv of intervals) {
    const [oh, om] = iv.open.split(':').map(Number)
    const openM = oh * 60 + om
    if (iv.close == null) {
      if (cur >= openM) return true // open-ended ("til late") — treat as open once started
      continue
    }
    const [ch, cm] = iv.close.split(':').map(Number)
    const closeM = ch * 60 + cm
    if (cur >= openM && cur < closeM) return true
  }
  return false
}

/**
 * Group consecutive days sharing an identical interval-set.
 * Returns array of { startDay, endDay, intervals|null, closed }.
 */
function groupHours(reg) {
  const groups = []
  let current = null
  for (const day of DAY_ORDER) {
    const intervals = reg[day] || null
    const key = intervals ? intervals.map((iv) => `${iv.open}-${iv.close ?? ''}`).join('|') : 'closed'
    if (current && current.key === key) {
      current.endDay = day
    } else {
      if (current) groups.push(current)
      current = { startDay: day, endDay: day, key, intervals, closed: !intervals }
    }
  }
  if (current) groups.push(current)
  return groups
}

/** Format a group label like "Mon–Fri" or just "Sat" */
function groupLabel(group, dayLabels) {
  if (group.startDay === group.endDay) return dayLabels[group.startDay]
  return `${dayLabels[group.startDay]}–${dayLabels[group.endDay]}`
}

/** Check if a day falls within a group */
function dayInGroup(group, day) {
  const startIdx = DAY_ORDER.indexOf(group.startDay)
  const endIdx = DAY_ORDER.indexOf(group.endDay)
  const dayIdx = DAY_ORDER.indexOf(day)
  return dayIdx >= startIdx && dayIdx <= endIdx
}

export default function OpeningHours({ hours }) {
  const t = useTranslations('placePanels')
  const [expanded, setExpanded] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const DAY_LABELS = {
    monday: t('dayShortMon'), tuesday: t('dayShortTue'), wednesday: t('dayShortWed'), thursday: t('dayShortThu'),
    friday: t('dayShortFri'), saturday: t('dayShortSat'), sunday: t('dayShortSun'),
  }
  const DAY_FULL = {
    monday: t('dayMon'), tuesday: t('dayTue'), wednesday: t('dayWed'), thursday: t('dayThu'),
    friday: t('dayFri'), saturday: t('daySat'), sunday: t('daySun'),
  }

  const reg = useMemo(() => normalizeRegular(hours), [hours])
  const groups = useMemo(() => groupHours(reg), [reg])
  const hasRegular = Object.keys(reg).length > 0
  const human = hours && typeof hours.human === 'string' ? hours.human : null
  const notes = hours && typeof hours.notes === 'string' ? hours.notes : null

  const today = mounted ? getCurrentDay() : null
  const openNow = mounted ? computeOpenNow(reg) : null
  const todayIntervals = mounted && today ? reg[today] : null

  // Nothing meaningful to render.
  if (!hasRegular && !human) return null

  // Collapsed line: prefer today's concrete hours; fall back to the human summary
  // for recurring-only venues (markets) that have no fixed weekly hours.
  const summaryIsHuman = mounted && !todayIntervals?.length && !hasRegular && !!human

  return (
    <div style={{ marginTop: '16px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
      {/* Header row: label + open/closed indicator */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: expanded ? '12px' : '0' }}>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
            color: 'var(--color-ink)',
            lineHeight: 1.4,
          }}
        >
          {/* Clock icon */}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-muted)', flexShrink: 0, marginTop: '2px' }}>
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>

          {!mounted ? (
            <span style={{ color: 'var(--color-muted)' }}>{t('openingHours')}</span>
          ) : todayIntervals && todayIntervals.length ? (
            <span>
              <span style={{ fontWeight: 500 }}>{DAY_FULL[today]}</span>
              {' '}
              <span style={{ color: 'var(--color-muted)' }}>{formatIntervals(todayIntervals)}</span>
            </span>
          ) : hasRegular ? (
            <span>
              <span style={{ fontWeight: 500 }}>{DAY_FULL[today]}</span>
              {' '}
              <span style={{ color: 'var(--color-muted)' }}>{t('closed')}</span>
            </span>
          ) : (
            <span style={{ color: 'var(--color-ink)' }}>{human}</span>
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
              flexShrink: 0,
              marginTop: '4px',
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
              flexShrink: 0,
              marginTop: '2px',
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
            {openNow ? t('openNow') : t('closedNow')}
          </span>
        )}
      </div>

      {/* Expanded detail: full human summary → weekday grid → notes */}
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {human && !summaryIsHuman && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', lineHeight: 1.5, color: 'var(--color-ink)', marginBottom: '2px' }}>
              {human}
            </div>
          )}

          {hasRegular && groups.map((group) => {
            const isToday = mounted && dayInGroup(group, today)
            return (
              <div
                key={group.startDay}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: '16px',
                  fontFamily: 'var(--font-body)',
                  fontSize: '13px',
                  lineHeight: 1.5,
                  padding: '2px 0',
                  color: isToday ? 'var(--color-ink)' : 'var(--color-muted)',
                  fontWeight: isToday ? 500 : 400,
                }}
              >
                <span>{groupLabel(group, DAY_LABELS)}</span>
                <span style={{ textAlign: 'right' }}>
                  {group.closed ? t('closed') : formatIntervals(group.intervals)}
                </span>
              </div>
            )
          })}

          {notes && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '12px', lineHeight: 1.5, color: 'var(--color-muted)', marginTop: '4px' }}>
              {notes}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
