// The monthly sweep anchors to the Melbourne calendar month — the wall clock
// the whole network runs on — never a rolling now-minus-30-days window
// (rolling windows starved the outreach quotas before; same trap).
//
// Offset logic mirrors lib/outreach/sendWindow.js melbourneDayStart, adapted
// to the 1st of the month. Australia/Melbourne (not a fixed UTC+10) so
// daylight saving comes from the tz database, not us.

const TZ = 'Australia/Melbourne'

/** 'YYYY-MM' for the current Melbourne month — the sweep's identity key. */
export function melbourneMonthKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit',
  }).format(now).slice(0, 7)
}

// UTC offset of the Melbourne wall clock at a given instant (handles DST).
function melbourneOffsetMs(at) {
  const p = {}
  for (const { type, value } of new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(at)) p[type] = value
  const raw = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - at.getTime()
  return Math.round(raw / 60000) * 60000
}

/**
 * The UTC instant the current Melbourne calendar month began. A listing whose
 * closure_checked_at predates this is due for this month's sweep.
 */
export function melbourneMonthStart(now = new Date()) {
  const [y, m] = melbourneMonthKey(now).split('-').map(Number)
  const wallMidnight = Date.UTC(y, m - 1, 1)
  // Two passes pin the offset even if DST flipped between now and the 1st
  // (Melbourne transitions at 2/3am local, so midnight itself always exists).
  let ts = wallMidnight - melbourneOffsetMs(now)
  ts = wallMidnight - melbourneOffsetMs(new Date(ts))
  return new Date(ts)
}
