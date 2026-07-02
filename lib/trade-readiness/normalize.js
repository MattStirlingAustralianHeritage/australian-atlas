/**
 * Trade-readiness normalisation — the single source of truth for validating the
 * operator-authored Atlas Trade fields. Pure (no imports, no I/O) so the SAME
 * rules run on the client (TradeReadinessEditor) and the server (PATCH
 * /api/dashboard/listing). The six columns land on `listings` in migration 170.
 *
 * Consent + preservation contract:
 *   - `trade_welcome` is the master switch. Nothing is trade-includable unless
 *     it is true — the `trade_buildable_listings` view enforces this. Default
 *     false (no silent opt-in).
 *   - Sub-values are NEVER cleared here because a master/group toggle is off.
 *     The UI hides the sub-fields when the master (or group) is off, but their
 *     stored values are preserved so toggling back on restores them. This
 *     normaliser writes exactly what was sent.
 *   - `trade_rates_available` is a boolean only — Atlas never stores or displays
 *     the rate itself.
 */

// A trade group larger than this is almost certainly a typo, not a real
// ceiling. Guards absurd input without inventing a domain limit.
export const MAX_GROUP_SIZE = 100000

const BOOL_KEYS = [
  'trade_welcome',
  'trade_bespoke',
  'trade_group',
  'trade_contact_before_booking',
  'trade_rates_available',
]

/** Coerce to a strict boolean (default false). Accepts true / 'true' / 1 / '1'. */
function toBool(v) {
  return v === true || v === 'true' || v === 1 || v === '1'
}

/**
 * Validate + clean an incoming trade-readiness payload.
 *
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 *   `value` carries exactly the six `listings` columns, ready to UPDATE.
 */
export function normalizeTradeReadiness(input) {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Trade readiness must be an object.' }
  }

  const value = {}
  for (const k of BOOL_KEYS) value[k] = toBool(input[k])

  // Group ceiling: optional integer >= 1, capped. Empty / absent / null → null
  // (unspecified). Preserved regardless of the group toggle (see contract above).
  const rawSize = input.trade_group_size_max
  if (rawSize == null || rawSize === '') {
    value.trade_group_size_max = null
  } else {
    const n = typeof rawSize === 'number' ? rawSize : Number(String(rawSize).trim())
    if (!Number.isInteger(n)) {
      return { ok: false, error: 'Maximum group size must be a whole number.' }
    }
    if (n < 1) {
      return { ok: false, error: 'Maximum group size must be at least 1.' }
    }
    if (n > MAX_GROUP_SIZE) {
      return { ok: false, error: 'Maximum group size looks too large — enter a realistic number.' }
    }
    value.trade_group_size_max = n
  }

  return { ok: true, value }
}

// ── Extended trade profile (listing_trade_profiles, migration 204) ──────────

export const MAX_NOTICE_DAYS = 365
const MAX_TEXT_FIELD = 400
const MAX_LANGUAGES = 12

const PROFILE_BOOL_KEYS = ['coach_access', 'insurance_confirmed', 'famil_open']
const PROFILE_TEXT_KEYS = ['dietary_notes', 'capacity_notes', 'seasonal_notes', 'contact_name', 'contact_phone']

/** Trim to a bounded, single-spaced string; empty → null. */
function cleanText(v, max = MAX_TEXT_FIELD) {
  if (v == null) return null
  const s = String(v).replace(/\s+/g, ' ').trim().slice(0, max)
  return s || null
}

/**
 * Validate + clean the extended trade profile payload (the fact-sheet depth:
 * notice period, coach access, languages, dietary, capacity, seasonality,
 * insurance, famils, trade-only contact). Same client/server contract as
 * normalizeTradeReadiness: values are written exactly as sent, never cleared
 * by a toggle elsewhere.
 *
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 *   `value` carries exactly the listing_trade_profiles columns (minus keys).
 */
export function normalizeTradeProfile(input) {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Trade profile must be an object.' }
  }

  const value = {}
  for (const k of PROFILE_BOOL_KEYS) value[k] = toBool(input[k])
  for (const k of PROFILE_TEXT_KEYS) value[k] = cleanText(input[k])

  // Minimum booking notice, in days. Empty → null (unspecified).
  const rawNotice = input.notice_days
  if (rawNotice == null || rawNotice === '') {
    value.notice_days = null
  } else {
    const n = typeof rawNotice === 'number' ? rawNotice : Number(String(rawNotice).trim())
    if (!Number.isInteger(n) || n < 0) {
      return { ok: false, error: 'Booking notice must be a whole number of days (0 or more).' }
    }
    if (n > MAX_NOTICE_DAYS) {
      return { ok: false, error: `Booking notice can be at most ${MAX_NOTICE_DAYS} days.` }
    }
    value.notice_days = n
  }

  // Languages: accept an array or a comma-separated string.
  const rawLangs = input.languages
  let langs = []
  if (Array.isArray(rawLangs)) langs = rawLangs
  else if (typeof rawLangs === 'string') langs = rawLangs.split(',')
  langs = langs
    .map((l) => cleanText(l, 40))
    .filter(Boolean)
    .slice(0, MAX_LANGUAGES)
  value.languages = langs.length ? langs : null

  // Trade contact email: light shape check only (it's operator-authored).
  const email = cleanText(input.contact_email, 200)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'The trade contact email doesn’t look like an email address.' }
  }
  value.contact_email = email ? email.toLowerCase() : null

  return { ok: true, value }
}
