// ============================================================
// Outreach send window — business hours, Melbourne wall clock
// ------------------------------------------------------------
// All outward outreach email (operator, press, trade — autopilot AND manual)
// may only go out between 09:00 and 17:00 Australia/Melbourne. The autopilot
// crons check this up front and hold gracefully; the send engines enforce it
// as a hard backstop so a delayed cron or an off-hours manual batch can never
// slip through. Australia/Melbourne (not a fixed UTC+10) so daylight saving
// is handled by the tz database, not by us.
// ============================================================

const TZ = 'Australia/Melbourne'
const OPEN_HOUR = 9   // inclusive — 09:00
const CLOSE_HOUR = 17 // exclusive — last send 16:59

export const SEND_WINDOW_LABEL = '9am–5pm Melbourne time'

export function melbourneHour(now = new Date()) {
  return Number(
    new Intl.DateTimeFormat('en-AU', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(now)
  )
}

export function isWithinSendWindow(now = new Date()) {
  const h = melbourneHour(now)
  return h >= OPEN_HOUR && h < CLOSE_HOUR
}

// UTC offset of the Melbourne wall clock at a given instant (handles DST).
function melbourneOffsetMs(at) {
  const p = {}
  for (const { type, value } of new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(at)) p[type] = value
  const raw = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - at.getTime()
  // formatToParts is second-granular, so raw carries `at`'s millisecond
  // fraction as noise; real tz offsets are whole minutes.
  return Math.round(raw / 60000) * 60000
}

/**
 * The UTC instant the current Melbourne calendar day began. Daily send quotas
 * anchor here — "today" on the wall clock the whole outreach system runs on —
 * never on a rolling now-minus-24h window.
 */
export function melbourneDayStart(now = new Date()) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now).split('-').map(Number)
  const wallMidnight = Date.UTC(y, m - 1, d)
  // Two passes pin the offset even if DST flipped since midnight (Melbourne
  // transitions at 2/3am local, so midnight itself always exists exactly once).
  let ts = wallMidnight - melbourneOffsetMs(now)
  ts = wallMidnight - melbourneOffsetMs(new Date(ts))
  return new Date(ts)
}

export function sendWindowHoldNote(kind = 'outreach') {
  return `outside send window — ${kind} email goes out ${SEND_WINDOW_LABEL} only`
}

export function assertWithinSendWindow(kind = 'outreach') {
  if (!isWithinSendWindow()) {
    throw new Error(`${kind} sends are held outside ${SEND_WINDOW_LABEL} (it is currently ${melbourneHour()}:00h in Melbourne)`)
  }
}
