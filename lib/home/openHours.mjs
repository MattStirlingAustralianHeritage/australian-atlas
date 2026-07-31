// ─────────────────────────────────────────────────────────────────
// Opening-hours awareness for the worked day: a venue that is closed
// on the day the reader is looking never appears, and a venue that is
// closed during a slot's window never carries that slot — no more
// dinner-only restaurants dealt as lunch, no Monday cards for a
// Wednesday–Sunday gallery.
//
// The gate only ever acts on hours it can READ. Coverage is uneven
// (field listings — waterfalls, lookouts — mostly carry none), so
// unknown or unparseable hours always pass: exclusion requires
// positive knowledge of a closure, absence of data is not a closure.
// ─────────────────────────────────────────────────────────────────

export const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

// Slot windows in minutes since local midnight. A venue must be open
// for at least MIN_OVERLAP_MIN inside the window to carry the slot.
// 'stay' is exempt: opening hours on accommodation are reception
// hours, and the reader sleeps there regardless.
export const SLOT_WINDOWS = {
  morning:    [8 * 60, 10 * 60 + 30],
  midmorning: [10 * 60, 12 * 60],
  midday:     [12 * 60, 14 * 60],
  afternoon:  [14 * 60, 17 * 60],
  tasting:    [15 * 60, 17 * 60 + 30],
  stay:       null,
}
export const MIN_OVERLAP_MIN = 30

// Whole-state timezone map — the resolution the listings carry. July
// or January doesn't matter for day-of-week: Intl handles DST.
const STATE_TZ = {
  WA: 'Australia/Perth',
  NT: 'Australia/Darwin',
  SA: 'Australia/Adelaide',
  QLD: 'Australia/Brisbane',
  NSW: 'Australia/Sydney',
  ACT: 'Australia/Sydney',
  VIC: 'Australia/Melbourne',
  TAS: 'Australia/Hobart',
}

// The day of week at `now` in a state's local time, as a lowercase
// name matching the hours payloads. Unknown state falls back to
// Sydney — right for the eastern-seaboard bulk of the atlas, and at
// worst wrong for a few hours around midnight.
export function localDayName(state, now = new Date()) {
  const tz = STATE_TZ[String(state || '').trim().toUpperCase()] || 'Australia/Sydney'
  try {
    return new Intl.DateTimeFormat('en-AU', { weekday: 'long', timeZone: tz })
      .format(now).toLowerCase()
  } catch {
    return DAY_NAMES[now.getUTCDay()]
  }
}

function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim())
  if (!m) return null
  const mins = Number(m[1]) * 60 + Number(m[2])
  return mins >= 0 && mins < 24 * 60 ? mins : null
}

// [open, close] minutes; a close at or before the open ("17:00–00:00",
// "22:00–02:00") clamps to end-of-day — the spill into the next
// morning can't matter to daytime slots.
function toInterval(open, close) {
  const o = toMinutes(open)
  let c = toMinutes(close)
  if (o === null || c === null) return null
  if (c <= o) c = 24 * 60
  return [o, c]
}

// "5:00 PM – 12:00 AM", "4:00 – 11:00 PM" (first time inherits the
// second's meridiem), "7:00 AM – 4:00 PM", "Open 24 hours", "Closed".
// Returns [] for closed, null for a line it can't read.
export function parseWeekdayTextLine(line) {
  const body = String(line || '').replace(/^[A-Za-z]+:\s*/, '').trim()
  if (!body) return null
  if (/closed/i.test(body)) return []
  if (/open 24 hours/i.test(body)) return [[0, 24 * 60]]
  const intervals = []
  for (const part of body.split(/,/)) {
    const m = /(\d{1,2}):(\d{2})\s*(AM|PM)?\s*[–—-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(part)
    if (!m) continue
    let [, h1, m1, mer1, h2, m2, mer2] = m
    if (!mer1 && !mer2) continue
    if (!mer1) mer1 = mer2
    const to24 = (h, mer) => {
      let hh = Number(h) % 12
      if (String(mer).toUpperCase() === 'PM') hh += 12
      return hh
    }
    const iv = toInterval(
      `${to24(h1, mer1)}:${m1}`,
      `${to24(h2, mer2 || mer1)}:${m2}`
    )
    if (iv) intervals.push(iv)
  }
  return intervals.length ? intervals : null
}

// A listing's open intervals per day name, from the best source it
// carries: operator-entered `hours` (a single {open, close} per open
// day — a missing day is a closed day), else the pipeline's
// `opening_hours.regular` (arrays per day, [] meaning closed), else
// its `weekday_text`. Returns null when nothing is readable — the
// caller must treat that as "no information", never as "closed".
// A day key mapped to undefined (an unreadable weekday_text line)
// also means "no information" for that one day.
export function parseOpenIntervals(listing) {
  if (!listing) return null

  const oper = listing.hours
  if (oper && typeof oper === 'object' && !Array.isArray(oper)) {
    const out = {}
    let any = false
    for (const day of DAY_NAMES) {
      const e = oper[day]
      if (e && typeof e === 'object') {
        const iv = toInterval(e.open, e.close)
        out[day] = iv ? [iv] : []
        if (iv) any = true
      } else {
        out[day] = []
      }
    }
    if (any) return out
  }

  const oh = listing.opening_hours
  if (oh && typeof oh === 'object') {
    if (oh.regular && typeof oh.regular === 'object') {
      const out = {}
      for (const day of DAY_NAMES) {
        const entries = oh.regular[day]
        if (!Array.isArray(entries)) { out[day] = undefined; continue }
        const ivs = []
        for (const e of entries) {
          const iv = e && toInterval(e.open, e.close)
          if (iv) ivs.push(iv)
        }
        // An empty source array is a stated closure; entries that were
        // all unreadable are not.
        out[day] = entries.length && !ivs.length ? undefined : ivs
      }
      return out
    }
    if (Array.isArray(oh.weekday_text)) {
      const out = {}
      let any = false
      for (const line of oh.weekday_text) {
        const dm = /^([A-Za-z]+):/.exec(String(line).trim())
        const day = dm && dm[1].toLowerCase()
        if (!day || !DAY_NAMES.includes(day)) continue
        const ivs = parseWeekdayTextLine(line)
        out[day] = ivs === null ? undefined : ivs
        if (ivs !== null) any = true
      }
      return any ? out : null
    }
  }

  return null
}

function overlapsWindow(intervals, window) {
  const [ws, we] = window
  return intervals.some(([o, c]) => Math.min(c, we) - Math.max(o, ws) >= MIN_OVERLAP_MIN)
}

// May this listing carry this slot today? True unless the listing's
// own hours positively rule it out: closed all day (rule one — it
// never appears anywhere), or open today but not during the slot's
// window (rule two — some other day part may still seat it).
export function openForSlot(listing, slot, now = new Date()) {
  const window = SLOT_WINDOWS[slot]
  if (window === null || window === undefined) return true
  const intervals = parseOpenIntervals(listing)
  if (!intervals) return true
  const today = intervals[localDayName(listing.state, now)]
  if (today === undefined) return true
  if (!today.length) return false
  return overlapsWindow(today, window)
}
