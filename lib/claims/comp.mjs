// Comped Standard grants — the admin side door where Standard is granted with
// no Stripe subscription (payment taken by invoice or phone, a partner comp, a
// goodwill month). See migration 261 for the column semantics.
//
// A comp can now carry a TERM. On a row with tier='standard' and no
// stripe_subscription_id:
//
//   comp_expires_at IS NULL   → in perpetuity
//   comp_expires_at > now     → running
//   comp_expires_at <= now    → LAPSED — the listing is Free again
//
// The lapse is enforced at READ time (filterPaidListingIds in
// lib/listing-gallery.js calls isCompLapsed) so benefits stop on the stroke of
// the term regardless of whether any sweep has run. lib/claims/compSweep.js
// then reconciles the stored tier so the row says what the gates already do.
//
// Pure term logic only — no imports, no database. Kept dependency-free so it
// runs under `node --test lib/claims/comp.test.mjs`; the month arithmetic below
// is exactly the kind of thing that breaks silently on the 31st.

// The durations offered in the admin UI. `months: null` is in perpetuity.
// Shared by the picker and the API validator so the two can't drift.
export const COMP_DURATIONS = [
  { key: '1m', label: '1 month', months: 1 },
  { key: '2m', label: '2 months', months: 2 },
  { key: '3m', label: '3 months', months: 3 },
  { key: '6m', label: '6 months', months: 6 },
  { key: '12m', label: '12 months', months: 12 },
  { key: '24m', label: '24 months', months: 24 },
  { key: 'perpetual', label: 'In perpetuity', months: null },
]

export const DEFAULT_COMP_DURATION = '12m'

export function isValidCompDuration(key) {
  return COMP_DURATIONS.some(d => d.key === key)
}

export function compDurationLabel(key) {
  return COMP_DURATIONS.find(d => d.key === key)?.label || key
}

// Add whole months without the setMonth() overflow bug (31 Jan + 1 month must
// be 28/29 Feb, not 2/3 March — a comp should never gain a day it wasn't given).
export function addMonthsUTC(date, months) {
  const d = new Date(date.getTime())
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const lastDayOfTarget = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, lastDayOfTarget))
  return d
}

/**
 * Resolve a duration key to an expiry timestamp.
 * @returns {string|null} ISO timestamp, or null for in perpetuity.
 */
export function compExpiryFromDuration(key, from = new Date()) {
  const duration = COMP_DURATIONS.find(d => d.key === key)
  if (!duration) throw new Error(`Unknown comp duration: ${key}`)
  if (duration.months === null) return null
  return addMonthsUTC(from, duration.months).toISOString()
}

// Is this claim row a comp — Standard granted with no Stripe subscription
// behind it? (Free rows are not comps; Stripe rows are paid.)
export function isComped(row) {
  return !!row && row.tier === 'standard' && !row.stripe_subscription_id
}

// Has a comped Standard term run out? A comp with no expiry is perpetual and
// never lapses; a Stripe-billed row is not a comp and never lapses here (its
// lifecycle ends through the cancel webhook).
export function isCompLapsed(row, now = new Date()) {
  if (!isComped(row) || !row.comp_expires_at) return false
  return new Date(row.comp_expires_at).getTime() <= now.getTime()
}

/**
 * Describe a claim row's commercial state for display.
 * @returns {{ paid: boolean, comped: boolean, perpetual: boolean,
 *             expiresAt: string|null, lapsed: boolean, daysRemaining: number|null }}
 */
export function compStatus(row, now = new Date()) {
  const comped = isComped(row)
  const lapsed = isCompLapsed(row, now)
  const expiresAt = comped ? (row.comp_expires_at || null) : null
  const daysRemaining = expiresAt && !lapsed
    ? Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 86400000)
    : null
  return {
    paid: !!row && row.tier === 'standard' && !lapsed,
    comped,
    perpetual: comped && !row.comp_expires_at,
    expiresAt,
    lapsed,
    daysRemaining,
  }
}
