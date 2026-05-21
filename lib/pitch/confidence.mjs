// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 confidence scoring per docs/pitch-system-design.md §Confidence scoring.
//
// Deterministic, code-side. The LLM never self-assesses confidence. Each signal
// contributes a fixed weight from the spec's table; the breakdown is returned
// alongside the score for editor audit.
//
//   Signal                                                Contribution
//   ────────────────────────────────────────────────────  ────────────
//   All claimed facts traced to fields                       +40   ← always
//                                                                    awarded for
//                                                                    written pitches
//                                                                    (the pitch
//                                                                    couldn't have
//                                                                    reached here
//                                                                    without
//                                                                    fact-check
//                                                                    passing)
//   Anchor has populated operator name                       SKIPPED (see note ↓)
//   Anchor has populated founding date                       +10
//   Anchor has substantive description (>200 chars)          +10
//   Multi-listing pitch with all listings grounded           +10   ← N/A single-anchor
//   Anchor has independence flag confirmed                    +5
//   Cross-references geographically coherent (≤50km)          +5   ← N/A single-anchor
//   Editorial framing distinguishable from facts             +10   ← binary
//
// MAXIMUM: 90 (operator_name skipped). 75 for single-anchor pitches (which
// can't earn the two multi-listing signals).
//
// ┌─ operator_name editorial decision (Matt, 5 May 2026) ──────────────────┐
// │ The "+10 for populated operator name" signal in the spec requires an   │
// │ `operator_name` column on `listings` that does not exist. Adding +     │
// │ backfilling it is deferred indefinitely. This signal is dropped, not   │
// │ substituted with `is_owner_operator` (which is a flag, not a name —    │
// │ different semantics). Phase 2 confidence scores cap at 90; the         │
// │ 70-point low-confidence threshold from the spec still holds.           │
// │                                                                        │
// │ Do not "fix" this by adding a fallback to `is_owner_operator`. If you  │
// │ want this back, add the `operator_name` column and backfill it.        │
// └────────────────────────────────────────────────────────────────────────┘
//
// Pure function. No I/O. No side effects.
// ─────────────────────────────────────────────────────────────────────────────

const WEIGHTS = Object.freeze({
  facts_traced: 40,
  // operator_name_populated: 10,   // SKIPPED — see note above
  founding_date_populated: 10,
  substantive_description: 10,
  multi_listing_all_grounded: 10,
  independence_confirmed: 5,
  cross_references_coherent: 5,
  framing_distinguishable: 10,
})

const MAX_SCORE = Object.values(WEIGHTS).reduce((a, b) => a + b, 0) // 90

const CROSS_REF_RADIUS_KM = 50
const DESCRIPTION_FLOOR_CHARS = 200

/**
 * @typedef {Object} ConfidenceBreakdown
 * @property {number} facts_traced
 * @property {number} founding_date_populated
 * @property {number} substantive_description
 * @property {number} multi_listing_all_grounded
 * @property {number} independence_confirmed
 * @property {number} cross_references_coherent
 * @property {number} framing_distinguishable
 */

/**
 * @typedef {Object} ConfidenceResult
 * @property {number} score                   - Integer in [0, 90].
 * @property {number} max_score               - 90 in this phase (operator_name skipped).
 * @property {ConfidenceBreakdown} breakdown  - Per-signal contribution.
 */

/**
 * Compute the confidence score for a pitch.
 *
 * Precondition: the pitch has passed the fact-check pass (its facts trace to
 * the source listings). This function assumes the precondition holds and
 * always awards `+facts_traced`. Callers must not call this for a pitch that
 * has not passed fact-check.
 *
 * @param {Object}   pitch                       - The composed pitch.
 * @param {Array}    pitch.verified_facts        - Array of {claim, field, value}.
 * @param {string}   [pitch.editorial_framing]   - The editorial framing prose.
 * @param {string[]} [pitch.supporting_listing_ids] - IDs of supporting listings,
 *                                                  if any (empty for single-anchor).
 * @param {Object}   anchorListing               - The anchor listing record.
 * @param {Object[]} [supportingListings]        - Records for supporting listings
 *                                                 (must match pitch.supporting_listing_ids
 *                                                 in length and order for multi-listing
 *                                                 scoring to apply).
 * @returns {ConfidenceResult}
 */
export function computeConfidence(pitch, anchorListing, supportingListings = []) {
  if (!pitch || typeof pitch !== 'object') {
    throw new Error('computeConfidence: pitch is required')
  }
  if (!anchorListing || typeof anchorListing !== 'object') {
    throw new Error('computeConfidence: anchorListing is required')
  }

  /** @type {ConfidenceBreakdown} */
  const breakdown = {
    facts_traced: 0,
    founding_date_populated: 0,
    substantive_description: 0,
    multi_listing_all_grounded: 0,
    independence_confirmed: 0,
    cross_references_coherent: 0,
    framing_distinguishable: 0,
  }

  // ── Facts traced (+40) ─────────────────────────────────────────────────
  // Precondition: this function is only called on pitches that have passed
  // fact-check. We award +40 unconditionally for written pitches, mirroring
  // the spec's "zero is a hard fail" language — the only way to "score 0" on
  // this signal is to fail fact-check, in which case we never reach scoring.
  // Defensive check: if verified_facts is somehow empty, don't award.
  if (Array.isArray(pitch.verified_facts) && pitch.verified_facts.length > 0) {
    breakdown.facts_traced = WEIGHTS.facts_traced
  }

  // ── Founding date populated (+10) ──────────────────────────────────────
  if (Number.isInteger(anchorListing.founded_year) && anchorListing.founded_year > 0) {
    breakdown.founding_date_populated = WEIGHTS.founding_date_populated
  }

  // ── Substantive description >200 chars (+10) ──────────────────────────
  if (
    typeof anchorListing.description === 'string' &&
    anchorListing.description.length > DESCRIPTION_FLOOR_CHARS
  ) {
    breakdown.substantive_description = WEIGHTS.substantive_description
  }

  // ── Independence flag confirmed (+5) ──────────────────────────────────
  // Spec wording: "independence flag confirmed". The listings table column is
  // `independence_confirmed`. Only an explicit `true` counts — `null` (unknown)
  // and `false` both score 0. Mirrors the Phase 1 scoring convention.
  if (anchorListing.independence_confirmed === true) {
    breakdown.independence_confirmed = WEIGHTS.independence_confirmed
  }

  // ── Multi-listing all grounded (+10) ──────────────────────────────────
  // Single-anchor pitches don't earn this. Awarded only when there is at least
  // one supporting listing AND we received a record for each cited supporter.
  const supportingIds = Array.isArray(pitch.supporting_listing_ids) ? pitch.supporting_listing_ids : []
  if (supportingIds.length > 0 && supportingListings.length === supportingIds.length) {
    // All cited supporting listings have a corresponding record passed in,
    // i.e. all are grounded (fact-check would have already failed otherwise).
    breakdown.multi_listing_all_grounded = WEIGHTS.multi_listing_all_grounded
  }

  // ── Cross-references geographically coherent (+5) ─────────────────────
  // Awarded when every supporting listing sits within 50km of the anchor.
  // Single-anchor pitches don't earn this (no supporting listings to check).
  if (supportingListings.length > 0 && hasAnchorCoords(anchorListing)) {
    const allWithin = supportingListings.every(supp => {
      if (!hasAnchorCoords(supp)) return false
      return haversineKm(anchorListing, supp) <= CROSS_REF_RADIUS_KM
    })
    if (allWithin) {
      breakdown.cross_references_coherent = WEIGHTS.cross_references_coherent
    }
  }

  // ── Editorial framing distinguishable from facts (+10, binary) ────────
  // The output schema separates `editorial_framing` from `verified_facts` by
  // construction. We award +10 when both are populated and the framing is
  // substantive (≥40 chars — anything shorter is a stub, not a frame).
  const framing = typeof pitch.editorial_framing === 'string' ? pitch.editorial_framing.trim() : ''
  if (framing.length >= 40 && Array.isArray(pitch.verified_facts) && pitch.verified_facts.length > 0) {
    breakdown.framing_distinguishable = WEIGHTS.framing_distinguishable
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0)
  return { score, max_score: MAX_SCORE, breakdown }
}

function hasAnchorCoords(listing) {
  return (
    listing != null &&
    typeof listing === 'object' &&
    Number.isFinite(Number(listing.lat)) &&
    Number.isFinite(Number(listing.lng))
  )
}

function haversineKm(a, b) {
  const toRad = deg => (Number(deg) * Math.PI) / 180
  const R_KM = 6371
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const dLat = toRad(Number(b.lat) - Number(a.lat))
  const dLng = toRad(Number(b.lng) - Number(a.lng))
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R_KM * Math.asin(Math.sqrt(h))
}

// Exported for tests and audit.
export { WEIGHTS, MAX_SCORE, CROSS_REF_RADIUS_KM, DESCRIPTION_FLOOR_CHARS }
