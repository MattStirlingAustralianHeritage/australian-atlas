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

const OPEN_GREEN = '#3a7d44'

/**
 * Opening hours for the place information cluster.
 *
 * Reads as one of the info-cluster rows (accent icon → uppercase label →
 * value), so it sits with Address / Website / Phone rather than looking bolted
 * on. Collapsed line is the familiar "● Open now · Closes 9pm" status; the
 * chevron reveals the full week (grouped where clean, verbatim where the source
 * is prose). Understands every stored shape via lib/opening-hours, so nothing
 * with real hours is silently dropped.
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
  const hasWeek = hasRegular || hasRaw
  const canExpand = hasWeek || !!notes

  const groupLabel = (g) => (g.startDay === g.endDay ? DAY_SHORT[g.startDay] : `${DAY_SHORT[g.startDay]}–${DAY_SHORT[g.endDay]}`)
  // Day-agnostic one-liner ("Mon–Fri 9am–5pm · Sat 10am–2pm") — used before the
  // client mounts (no "now" to judge) and as the fallback summary for markets.
  const weekSummary = useMemo(() => {
    const open = groups.filter((g) => !g.closed)
    if (!open.length) return null
    return open.map((g) => `${groupLabel(g)} ${fmt(g.intervals)}`).join('  ·  ')
  }, [groups]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!hasData) return null

  const today = mounted ? currentDayName() : null
  const status = mounted ? openStatus(reg) : { openNow: null, closesAt: null, opensAt: null }
  const todayIntervals = mounted && today ? reg[today] : null

  // Transition hint: "Closes 9pm" while open, "Opens 5:30pm" while closed.
  const hint = status.openNow === true && status.closesAt
    ? t('closesAt', { time: formatTime(status.closesAt) })
    : status.openNow === false && status.opensAt
      ? t('opensAt', { time: formatTime(status.opensAt) })
      : null

  // The collapsed value: a live status pill when we can judge "now", otherwise a
  // plain summary (human line for markets/prose, else the week one-liner).
  const showStatus = mounted && status.openNow !== null
  let statusWord = null
  if (showStatus) {
    if (status.openNow) statusWord = t('openNow')
    else statusWord = todayIntervals && todayIntervals.length ? t('closedNow') : t('closedToday')
  }
  const summaryText = human || weekSummary || t('openingHours')

  return (
    <div style={{ marginTop: '16px' }}>
      <div style={{ display: 'flex', gap: '12px' }}>
        {/* clock icon — same accent treatment as the other info-cluster rows */}
        <span style={{ color: 'var(--color-accent)', flexShrink: 0, marginTop: '2px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 7 12 12 15.5 14" />
          </svg>
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-body)', color: 'var(--color-muted)',
              letterSpacing: '0.08em', fontSize: '10px', fontWeight: 600,
              textTransform: 'uppercase', marginBottom: '3px',
            }}
          >
            {t('openingHours')}
          </div>

          <button
            onClick={() => canExpand && setExpanded((v) => !v)}
            aria-expanded={canExpand ? expanded : undefined}
            style={{
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px',
              width: '100%', background: 'none', border: 'none', padding: 0, margin: 0,
              cursor: canExpand ? 'pointer' : 'default', textAlign: 'left',
              fontFamily: 'var(--font-body)', fontSize: '14px', lineHeight: 1.45, color: 'var(--color-ink)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: '6px', rowGap: '2px', minWidth: 0 }}>
              {showStatus ? (
                <>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: status.openNow ? OPEN_GREEN : 'var(--color-ink)' }}>
                    <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0, background: status.openNow ? OPEN_GREEN : 'var(--color-muted)' }} />
                    {statusWord}
                  </span>
                  {hint && <span style={{ color: 'var(--color-muted)' }}>{'·'} {hint}</span>}
                </>
              ) : (
                <span style={{ color: 'var(--color-ink)' }}>{summaryText}</span>
              )}
            </span>

            {canExpand && (
              <svg
                width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
                style={{ color: 'var(--color-muted)', flexShrink: 0, alignSelf: 'center', transition: 'transform 0.2s ease', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )}
          </button>

          {expanded && canExpand && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '10px' }}>
              {/* Show the human summary at the top only when it isn't already the collapsed line */}
              {human && showStatus && (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', lineHeight: 1.5, color: 'var(--color-ink)', marginBottom: '3px' }}>
                  {human}
                </div>
              )}

              {hasRegular && !unparsed.size && groups.map((group) => (
                <Row
                  key={group.startDay}
                  label={groupLabel(group)}
                  value={group.closed ? t('closed') : fmt(group.intervals)}
                  isToday={mounted && dayInGroup(group, today)}
                  muted={group.closed}
                />
              ))}

              {(hasRegular || hasRaw) && unparsed.size > 0 && DAY_ORDER.map((day) => {
                const intervals = reg[day]
                const raw = rawByDay[day]
                let value, muted = false
                if (intervals && intervals.length) value = fmt(intervals)
                else if (raw && !/^closed$/i.test(raw)) value = raw
                else { value = t('closed'); muted = true }
                return <Row key={day} label={DAY_FULL[day]} value={value} isToday={mounted && day === today} muted={muted} />
              })}

              {notes && (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '12px', lineHeight: 1.5, color: 'var(--color-muted)', marginTop: '5px' }}>
                  {notes}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, isToday, muted }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '16px',
      fontFamily: 'var(--font-body)', fontSize: '13px', lineHeight: 1.5,
      color: isToday ? 'var(--color-ink)' : 'var(--color-muted)', fontWeight: isToday ? 600 : 400,
    }}>
      <span>{label}</span>
      <span style={{ textAlign: 'right', color: muted && !isToday ? 'var(--color-muted)' : undefined }}>{value}</span>
    </div>
  )
}
