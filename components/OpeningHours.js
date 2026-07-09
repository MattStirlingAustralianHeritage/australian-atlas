'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import {
  normalizeHours,
  openStatus,
  groupHours,
  dayInGroup,
  formatIntervals,
  formatTime,
  currentDayName,
  DAY_ORDER,
} from '@/lib/opening-hours'

/**
 * Opening hours for the place information cluster.
 *
 * Understands every shape stored in `listings.opening_hours` (rich crawler,
 * google weekday_text, flat day-maps, note/human-only) via lib/opening-hours —
 * so nothing that has real hours is ever silently dropped. Collapsed: today's
 * hours + an "Open now · Closes 5pm" badge. Expanded: the full week, grouped
 * where it's clean, verbatim where the source is prose.
 */
export default function OpeningHours({ hours }) {
  const t = useTranslations('placePanels')
  const [expanded, setExpanded] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const DAY_SHORT = {
    monday: t('dayShortMon'), tuesday: t('dayShortTue'), wednesday: t('dayShortWed'), thursday: t('dayShortThu'),
    friday: t('dayShortFri'), saturday: t('dayShortSat'), sunday: t('dayShortSun'),
  }
  const DAY_FULL = {
    monday: t('dayMon'), tuesday: t('dayTue'), wednesday: t('dayWed'), thursday: t('dayThu'),
    friday: t('dayFri'), saturday: t('daySat'), sunday: t('daySun'),
  }
  const fmtOpts = { open24h: t('open24h') }
  const fmt = (intervals) => formatIntervals(intervals, fmtOpts)

  const { reg, rawByDay, unparsed, human, notes, hasData } = useMemo(() => normalizeHours(hours), [hours])
  const groups = useMemo(() => groupHours(reg), [reg])
  const hasRegular = Object.keys(reg).length > 0
  const hasRaw = Object.keys(rawByDay).length > 0

  const today = mounted ? currentDayName() : null
  const status = mounted ? openStatus(reg) : { openNow: null, closesAt: null, opensAt: null }
  const todayIntervals = mounted && today ? reg[today] : null
  const todayRaw = mounted && today ? rawByDay[today] : null

  // Nothing meaningful to show → render nothing (keeps the info card tidy).
  if (!hasData) return null

  // Collapsed summary text:
  // 1) concrete parsed hours for today · 2) verbatim source line for today
  // (prose like "By appointment") · 3) the human summary (markets / no weekday grid)
  const summaryIsHuman = mounted && !todayIntervals?.length && !todayRaw && !hasRegular && !!human
  const badgeHint = status.openNow === true && status.closesAt
    ? t('closesAt', { time: formatTime(status.closesAt) })
    : status.openNow === false && status.opensAt
      ? t('opensAt', { time: formatTime(status.opensAt) })
      : null

  return (
    <div style={{ marginTop: '16px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: expanded ? '12px' : '0' }}>
        <button
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: '8px', background: 'none', border: 'none',
            padding: 0, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)',
            fontSize: '14px', color: 'var(--color-ink)', lineHeight: 1.4, flex: 1, minWidth: 0,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-muted)', flexShrink: 0, marginTop: '2px' }}>
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>

          {!mounted ? (
            <span style={{ color: 'var(--color-muted)' }}>{t('openingHours')}</span>
          ) : todayIntervals && todayIntervals.length ? (
            <span>
              <span style={{ fontWeight: 500 }}>{DAY_FULL[today]}</span>{' '}
              <span style={{ color: 'var(--color-muted)' }}>{fmt(todayIntervals)}</span>
            </span>
          ) : todayRaw && !/^closed$/i.test(todayRaw) ? (
            <span>
              <span style={{ fontWeight: 500 }}>{DAY_FULL[today]}</span>{' '}
              <span style={{ color: 'var(--color-muted)' }}>{todayRaw}</span>
            </span>
          ) : summaryIsHuman ? (
            <span style={{ color: 'var(--color-ink)' }}>{human}</span>
          ) : hasRegular || hasRaw ? (
            <span>
              <span style={{ fontWeight: 500 }}>{DAY_FULL[today]}</span>{' '}
              <span style={{ color: 'var(--color-muted)' }}>{t('closed')}</span>
            </span>
          ) : (
            <span style={{ color: 'var(--color-ink)' }}>{human}</span>
          )}

          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ color: 'var(--color-muted)', flexShrink: 0, marginTop: '4px', transition: 'transform 0.2s ease', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {mounted && status.openNow !== null && (
          <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flexShrink: 0, marginTop: '1px' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-body)',
              fontSize: '11px', fontWeight: 600, letterSpacing: '0.02em', whiteSpace: 'nowrap',
              color: status.openNow ? '#3a7d44' : 'var(--color-muted)',
            }}>
              <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: status.openNow ? '#3a7d44' : 'var(--color-muted)' }} />
              {status.openNow ? t('openNow') : t('closedNow')}
            </span>
            {badgeHint && (
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                {badgeHint}
              </span>
            )}
          </span>
        )}
      </div>

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {human && !summaryIsHuman && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', lineHeight: 1.5, color: 'var(--color-ink)', marginBottom: '2px' }}>
              {human}
            </div>
          )}

          {/* Clean weekly grid: grouped when every day parsed; otherwise a faithful
              per-day list that falls back to the source text for prose days. */}
          {hasRegular && !unparsed.size && groups.map((group) => {
            const isToday = mounted && dayInGroup(group, today)
            return (
              <Row
                key={group.startDay}
                label={group.startDay === group.endDay ? DAY_SHORT[group.startDay] : `${DAY_SHORT[group.startDay]}–${DAY_SHORT[group.endDay]}`}
                value={group.closed ? t('closed') : fmt(group.intervals)}
                isToday={isToday}
              />
            )
          })}

          {(hasRegular || hasRaw) && unparsed.size > 0 && DAY_ORDER.map((day) => {
            const intervals = reg[day]
            const raw = rawByDay[day]
            let value
            if (intervals && intervals.length) value = fmt(intervals)
            else if (raw && !/^closed$/i.test(raw)) value = raw
            else value = t('closed')
            return <Row key={day} label={DAY_FULL[day]} value={value} isToday={mounted && day === today} />
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

function Row({ label, value, isToday }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '16px',
      fontFamily: 'var(--font-body)', fontSize: '13px', lineHeight: 1.5, padding: '2px 0',
      color: isToday ? 'var(--color-ink)' : 'var(--color-muted)', fontWeight: isToday ? 500 : 400,
    }}>
      <span>{label}</span>
      <span style={{ textAlign: 'right' }}>{value}</span>
    </div>
  )
}
