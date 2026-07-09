/**
 * Opening-hours normalisation + formatting — the ONE place that understands
 * every shape stored in `listings.opening_hours`. Pure functions, no React,
 * so the render component, JSON-LD builders and the vertical-sync push can all
 * share exactly the same interpretation of the data.
 *
 * Stored shapes seen in production (2026-07):
 *   1. rich (crawler)      { regular:{monday:[{open,close|null}]}, human, notes, recurring, weekday_text }
 *   2. legacy flat-object  { monday:{open,close}, ... }
 *   3. flat string day-map { monday:"08:00 – 18:00", ... }
 *   4. google weekday_text { weekday_text:["Monday: 9:00 AM – 5:00 PM", ...], periods, ... }
 *   5. note-only           { note:"Departs daily ..." }        (Way — tours)
 *   6. human-only          { human:"Open Wed–Sun 11am–5pm" }
 *
 * normalizeHours() flattens 1–4 into a uniform weekly map of intervals and,
 * where a day cannot be parsed to numbers (prose like "By appointment"),
 * keeps the original display string so nothing is ever silently dropped.
 */

export const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const DAY_SET = new Set(DAY_ORDER)

/** A close word that means "no fixed close" (open-ended). */
const OPEN_ENDED = /^(late|close|closing|till late|til late)$/i

/** Parse one clock token → {h,min,hadMer} or null. Understands noon/midnight. */
export function parseClockToken(tok, meridiem) {
  tok = String(tok || '').trim()
  if (/^noon$/i.test(tok)) return { h: 12, min: 0, hadMer: true }
  if (/^midnight$/i.test(tok)) return { h: 0, min: 0, hadMer: true }
  // allow a leading "12 noon" style
  tok = tok.replace(/\s*noon$/i, '').trim() || '12'
  const m = tok.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(a\.?m\.?|p\.?m\.?)?$/i)
  if (!m) return null
  let h = parseInt(m[1], 10)
  const min = m[2] ? parseInt(m[2], 10) : 0
  if (h > 23 || min > 59) return null
  const mer = (m[3] || meridiem || '').replace(/\./g, '').toUpperCase()
  if (mer === 'AM') { if (h === 12) h = 0 }
  else if (mer === 'PM') { if (h !== 12) h += 12 }
  return { h, min, hadMer: !!m[3] }
}

const pad = (n) => String(n).padStart(2, '0')
const to24 = (h, min) => `${pad(h)}:${pad(min)}`

/**
 * Parse a single interval string → { open, close|null, full? } or null.
 *  "10:00 AM – 5:00 PM" · "12:00 – 2:00 PM" · "4:00 PM - 9:00 PM"
 *  "from 4:00pm" / "5:30pm onwards" / "4pm – late"  → open-ended (close:null)
 *  "Open 24 hours" / "24 hours"                     → { full:true }
 *  bare "Open" / prose                              → null (caller keeps raw text)
 */
export function parseInterval(str) {
  let s = String(str || '').trim()
  if (!s) return null
  if (/24\s*hours/i.test(s) || /^open\s*24/i.test(s)) return { open: '00:00', close: '24:00', full: true }
  // strip common open-ended prefixes/suffixes
  s = s.replace(/^(open\s+)?from\s+/i, '').replace(/\s+(onwards?|only)$/i, '').trim()

  const parts = s.split(/\s*[–—-]\s*|\s+to\s+|\s+till?\s+/i).map((p) => p.trim()).filter(Boolean)

  if (parts.length === 1) {
    if (/^open$/i.test(parts[0])) return null // "Open" with no times → prose, keep raw
    const only = parseClockToken(parts[0], parts[0].match(/(a\.?m\.?|p\.?m\.?)/i)?.[0])
    return only ? { open: to24(only.h, only.min), close: null } : null
  }
  if (parts.length !== 2) return null

  if (OPEN_ENDED.test(parts[1])) {
    const open = parseClockToken(parts[0], parts[0].match(/(a\.?m\.?|p\.?m\.?)/i)?.[0])
    return open ? { open: to24(open.h, open.min), close: null } : null
  }
  const closeMer = parts[1].match(/(a\.?m\.?|p\.?m\.?)/i)?.[0]
  const openMer = parts[0].match(/(a\.?m\.?|p\.?m\.?)/i)?.[0]
  const close = parseClockToken(parts[1], null)
  if (!close) return null
  let open = parseClockToken(parts[0], openMer || closeMer)
  if (!open) return null
  let openM = open.h * 60 + open.min
  const closeM = close.h * 60 + close.min
  // Meridiem inference can flip an open past its close (e.g. "11:00 – 9:00 PM"
  // wrongly read as 23:00). If open had no explicit meridiem, try the other one.
  if (openM >= closeM && !open.hadMer && closeMer) {
    const alt = parseClockToken(parts[0], /p/i.test(closeMer) ? 'AM' : 'PM')
    if (alt) { const aM = alt.h * 60 + alt.min; if (aM < closeM) { open = alt; openM = aM } }
  }
  return { open: to24(open.h, open.min), close: to24(close.h, close.min) }
}

/** Parse google weekday_text[] → { reg:{day:[iv]}, rawByDay:{day:text}, unparsed:Set } */
export function parseWeekdayText(arr) {
  const reg = {}, rawByDay = {}, unparsed = new Set()
  if (!Array.isArray(arr)) return { reg, rawByDay, unparsed }
  for (const rawLine of arr) {
    const line = String(rawLine || '').trim()
    const cm = line.match(/^([A-Za-z]+):\s*(.*)$/)
    if (!cm) continue
    const day = cm[1].toLowerCase()
    if (!DAY_SET.has(day)) continue
    const body = cm[2].trim()
    rawByDay[day] = body
    if (!body || /^closed$/i.test(body)) continue // omit → renders as "Closed"
    const intervals = []
    let anyFail = false
    for (const seg of body.split(',')) {
      const t = seg.trim(); if (!t) continue
      const iv = parseInterval(t)
      if (iv) intervals.push(iv); else anyFail = true
    }
    if (intervals.length) reg[day] = intervals
    if (anyFail || !intervals.length) unparsed.add(day) // prose present → keep raw for this day
  }
  return { reg, rawByDay, unparsed }
}

/**
 * Flatten ANY stored shape → { reg, rawByDay, unparsed, human, notes, hasData }.
 *  reg:      { day:[{open, close|null, full?}] } — open days only
 *  rawByDay: { day: "display string" }          — for days reg couldn't parse
 *  unparsed: Set(day)                            — days to show from rawByDay
 */
export function normalizeHours(raw) {
  const empty = { reg: {}, rawByDay: {}, unparsed: new Set(), human: null, notes: null, hasData: false }
  if (!raw || typeof raw !== 'object') return empty

  const human = typeof raw.human === 'string' && raw.human.trim() ? raw.human.trim() : null
  const notes = typeof raw.notes === 'string' && raw.notes.trim() ? raw.notes.trim() : null

  // 1/2 — rich `regular` or legacy flat day-map (values are objects or arrays)
  const src = raw.regular && typeof raw.regular === 'object' ? raw.regular : raw
  const reg = {}
  let structured = false
  for (const day of DAY_ORDER) {
    const v = src[day]
    if (v == null) continue
    let intervals = []
    if (Array.isArray(v)) {
      intervals = v.filter((iv) => iv && iv.open).map((iv) => ({ open: iv.open, close: iv.close || null }))
    } else if (typeof v === 'object' && v.open) {
      intervals = [{ open: v.open, close: v.close || null }]
    } else if (typeof v === 'string') {
      // 3 — flat string day-map: "08:00 – 18:00"
      const iv = parseInterval(v)
      if (iv) intervals = [iv]
    }
    if (intervals.length) { reg[day] = intervals; structured = true }
  }
  if (structured) return { reg, rawByDay: {}, unparsed: new Set(), human, notes, hasData: true }

  // 4 — google weekday_text
  if (Array.isArray(raw.weekday_text) && raw.weekday_text.length) {
    const w = parseWeekdayText(raw.weekday_text)
    const hasData = Object.keys(w.reg).length > 0 || w.unparsed.size > 0
    return { ...w, human, notes, hasData: hasData || !!human }
  }

  // 5/6 — note-only or human-only. Treat a meaningful note like a human line.
  const noteVal = typeof raw.note === 'string' ? raw.note.trim() : null
  const meaningfulNote = noteVal && /[a-z0-9]/i.test(noteVal.replace(/[\s,]/g, '')) ? noteVal : null
  const summary = human || meaningfulNote
  return { reg: {}, rawByDay: {}, unparsed: new Set(), human: summary, notes, hasData: !!summary }
}

/** "09:00"→"9am", "17:30"→"5:30pm", "12:00"→"12pm", "00:00"→"12am" */
export function formatTime(t) {
  if (!t) return ''
  const [hs, ms] = t.split(':')
  let h = parseInt(hs, 10)
  const m = parseInt(ms, 10)
  const suffix = h >= 12 && h < 24 ? 'pm' : 'am'
  if (h === 0 || h === 24) h = 12
  else if (h > 12) h -= 12
  return m > 0 ? `${h}:${pad(m)}${suffix}` : `${h}${suffix}`
}

/** Format a day's interval list. `open24h` = localised "Open 24 hours". */
export function formatIntervals(intervals, { open24h } = {}) {
  if (!intervals || !intervals.length) return ''
  if (intervals.length === 1 && intervals[0].full) return open24h || 'Open 24 hours'
  return intervals
    .map((iv) => (iv.full ? (open24h || 'Open 24 hours') : iv.close ? `${formatTime(iv.open)}–${formatTime(iv.close)}` : `${formatTime(iv.open)}–`))
    .join(', ')
}

const jsDayToName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
export function currentDayName(d = new Date()) { return jsDayToName[d.getDay()] }

/**
 * open / closed / null.  null = no weekly data to judge (recurring-only market
 * or prose-only) → caller hides the badge rather than assert "Closed".
 * Overnight-aware: an interval whose close ≤ open is treated as spanning midnight.
 */
export function computeOpenNow(reg, now = new Date()) {
  if (!reg || Object.keys(reg).length === 0) return null
  const cur = now.getHours() * 60 + now.getMinutes()
  const today = currentDayName(now)
  const yName = jsDayToName[(now.getDay() + 6) % 7]
  const test = (intervals, offset) => {
    if (!intervals) return false
    for (const iv of intervals) {
      if (iv.full) return true
      const [oh, om] = iv.open.split(':').map(Number)
      const openM = oh * 60 + om
      if (iv.close == null) { if (offset === 0 && cur >= openM) return true; continue }
      let [ch, cm] = iv.close.split(':').map(Number)
      let closeM = ch * 60 + cm
      const overnight = closeM <= openM
      if (offset === 0) {
        if (!overnight && cur >= openM && cur < closeM) return true
        if (overnight && cur >= openM) return true // into the small hours of tomorrow
      } else if (offset === -1 && overnight) {
        if (cur < closeM) return true // still inside yesterday's overnight block
      }
    }
    return false
  }
  if (test(reg[today], 0)) return true
  if (test(reg[yName], -1)) return true
  return false
}

/**
 * Rich status for the badge line: whether open now plus the next transition
 * TODAY (so we can show "Open now · Closes 5pm" / "Closed · Opens 9am").
 * Conservative: only reports a same-day transition; returns null fields rather
 * than guess across midnight. `openNow` is null when there's no weekly data.
 */
export function openStatus(reg, now = new Date()) {
  const openNow = computeOpenNow(reg, now)
  if (openNow === null) return { openNow: null, closesAt: null, opensAt: null }
  const cur = now.getHours() * 60 + now.getMinutes()
  const today = currentDayName(now)
  const intervals = (reg[today] || []).filter((iv) => !iv.full)
  const toM = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m }
  if (openNow) {
    // find the interval we're inside; report its close (skip open-ended/overnight)
    let closesAt = null
    for (const iv of intervals) {
      if (iv.close == null) { closesAt = null; break }
      const o = toM(iv.open), c = toM(iv.close)
      if (c > o && cur >= o && cur < c) { closesAt = iv.close; break }
    }
    return { openNow: true, closesAt, opensAt: null }
  }
  // closed now: next opening later today
  let opensAt = null
  for (const iv of intervals) {
    const o = toM(iv.open)
    if (o > cur) { opensAt = opensAt == null || o < toM(opensAt) ? iv.open : opensAt }
  }
  return { openNow: false, closesAt: null, opensAt }
}

/** Group consecutive days sharing an identical interval-set → grouped rows. */
export function groupHours(reg) {
  const groups = []
  let cur = null
  for (const day of DAY_ORDER) {
    const intervals = reg[day] || null
    const key = intervals ? intervals.map((iv) => (iv.full ? '24' : `${iv.open}-${iv.close ?? ''}`)).join('|') : 'closed'
    if (cur && cur.key === key) cur.endDay = day
    else { if (cur) groups.push(cur); cur = { startDay: day, endDay: day, key, intervals, closed: !intervals } }
  }
  if (cur) groups.push(cur)
  return groups
}

export function dayInGroup(group, day) {
  const s = DAY_ORDER.indexOf(group.startDay), e = DAY_ORDER.indexOf(group.endDay), d = DAY_ORDER.indexOf(day)
  return d >= s && d <= e
}
