// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 fact-check pass per docs/pitch-system-design.md.
//
// Validates that every entry in `verified_facts` traces to the cited field on
// the source listing record. This is the architectural anti-hallucination
// guarantee — a pitch that does not pass this check cannot reach the queue.
//
// Match strategy (dispatched on the runtime type of the source field):
//
//   • string  → substring match (case-insensitive, whitespace-normalised) of
//               the fact's `value` against the source field
//   • number  → numeric equality (coercing stringified numbers from the LLM)
//   • boolean → exact equality (coercing the strings "true" / "false")
//   • array   → at least one element of the source array must contain the
//               fact's `value` (string substring after normalisation)
//   • other   → refuse to validate; the fact fails
//
// Empty source values fail by construction — there is no way to ground a
// claim against `null`, `""`, or `[]`.
//
// Single-anchor pitches only in this phase. Multi-listing pitches are deferred;
// when added, the signature extends to accept a map of supporting listings and
// each fact gains an optional `listing_id` reference. The single-anchor case
// here is intentionally the simplest call shape.
//
// Pure function. No I/O. No side effects.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} VerifiedFact
 * @property {string} claim - Natural-language statement of the fact (for the
 *                            editor to read; not load-bearing for validation).
 * @property {string} field - Name of the column on the `listings` table that
 *                            grounds the claim.
 * @property {*}      value - The cell value as the LLM extracted it. The
 *                            validator checks this against the actual field.
 */

/**
 * @typedef {Object} FailedClaim
 * @property {VerifiedFact|null} fact         - The fact that failed (null if
 *                                              the input was malformed at the
 *                                              array level).
 * @property {string}            reason       - Stable string code describing
 *                                              why the fact failed.
 * @property {*}                 source_value - The actual value of the cited
 *                                              field on the listing record,
 *                                              retained for debugging.
 */

/**
 * Run the fact-check pass against a single source listing.
 *
 * @param {VerifiedFact[]} verifiedFacts
 * @param {Object}         sourceListing  - A full row from the `listings` table.
 * @returns {{passed: true} | {passed: false, failed_claims: FailedClaim[]}}
 */
export function factCheck(verifiedFacts, sourceListing) {
  if (!Array.isArray(verifiedFacts)) {
    return {
      passed: false,
      failed_claims: [{ fact: null, reason: 'verified_facts_not_array', source_value: undefined }],
    }
  }
  if (verifiedFacts.length === 0) {
    return {
      passed: false,
      failed_claims: [{ fact: null, reason: 'no_verified_facts', source_value: undefined }],
    }
  }
  if (!sourceListing || typeof sourceListing !== 'object' || Array.isArray(sourceListing)) {
    return {
      passed: false,
      failed_claims: [{ fact: null, reason: 'no_source_listing', source_value: undefined }],
    }
  }

  const failed = []
  for (const fact of verifiedFacts) {
    const reason = checkOneFact(fact, sourceListing)
    if (reason !== null) {
      failed.push({
        fact: fact ?? null,
        reason,
        source_value: fact && typeof fact === 'object' ? sourceListing[fact.field] : undefined,
      })
    }
  }

  return failed.length === 0
    ? { passed: true }
    : { passed: false, failed_claims: failed }
}

/**
 * @returns {string|null} - A failure-reason code, or `null` if the fact passes.
 */
function checkOneFact(fact, listing) {
  if (!fact || typeof fact !== 'object' || Array.isArray(fact)) return 'fact_not_object'
  if (typeof fact.field !== 'string' || fact.field.length === 0) return 'missing_field_name'
  if (fact.value === undefined || fact.value === null) return 'missing_value'
  if (typeof fact.value === 'string' && fact.value.trim().length === 0) return 'missing_value'

  // Disallow lookup into prototype-chain properties (defence against fields like
  // "__proto__" or "constructor" sneaking through).
  if (!Object.prototype.hasOwnProperty.call(listing, fact.field)) return 'field_not_on_listing'

  const sourceValue = listing[fact.field]
  if (sourceValue === null) return 'source_field_null'

  if (typeof sourceValue === 'string') {
    if (sourceValue.length === 0) return 'source_field_empty_string'
    const normSource = normaliseText(sourceValue)
    const normValue = normaliseText(String(fact.value))
    if (normValue.length === 0) return 'missing_value'
    return normSource.includes(normValue) ? null : 'value_not_in_source'
  }

  if (typeof sourceValue === 'number') {
    const claimedNum =
      typeof fact.value === 'number'
        ? fact.value
        : typeof fact.value === 'string' && fact.value.trim().length > 0
          ? Number(fact.value)
          : NaN
    if (Number.isNaN(claimedNum)) return 'value_not_numeric'
    return claimedNum === sourceValue ? null : 'numeric_mismatch'
  }

  if (typeof sourceValue === 'boolean') {
    let claimedBool
    if (typeof fact.value === 'boolean') claimedBool = fact.value
    else if (fact.value === 'true') claimedBool = true
    else if (fact.value === 'false') claimedBool = false
    else return 'value_not_boolean'
    return claimedBool === sourceValue ? null : 'boolean_mismatch'
  }

  if (Array.isArray(sourceValue)) {
    if (sourceValue.length === 0) return 'source_field_empty_array'
    const normValue = normaliseText(String(fact.value))
    if (normValue.length === 0) return 'missing_value'
    const matched = sourceValue.some(el => {
      if (el === null || el === undefined) return false
      return normaliseText(String(el)).includes(normValue)
    })
    return matched ? null : 'value_not_in_source_array'
  }

  // Objects, dates, etc. — no agreed-upon match strategy in this phase.
  return 'unsupported_source_type'
}

/**
 * Collapse internal whitespace runs to a single space, trim, lowercase. Used
 * to make substring matches forgiving of formatting noise without losing
 * semantic content.
 */
function normaliseText(s) {
  return String(s).replace(/\s+/g, ' ').trim().toLowerCase()
}
