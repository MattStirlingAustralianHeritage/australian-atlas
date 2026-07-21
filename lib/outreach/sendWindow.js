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

export function sendWindowHoldNote(kind = 'outreach') {
  return `outside send window — ${kind} email goes out ${SEND_WINDOW_LABEL} only`
}

export function assertWithinSendWindow(kind = 'outreach') {
  if (!isWithinSendWindow()) {
    throw new Error(`${kind} sends are held outside ${SEND_WINDOW_LABEL} (it is currently ${melbourneHour()}:00h in Melbourne)`)
  }
}
