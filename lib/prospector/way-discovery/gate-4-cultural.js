/**
 * Gate 4 — Cultural Authority (per-experience).
 *
 * Fires for each experience with experience_type === 'cultural_tour'.
 * Non-cultural experiences get 'not_applicable'.
 *
 * Pass criteria (any of):
 *   • aboriginal_owned_led or aboriginal_community operator_type
 *     → pass by definition (verify classification accuracy separately)
 *   • aboriginal_partnership with named community involvement:
 *     candidate has cultural_authority_claim or aboriginal_partnership
 *     signals tagged to this experience (or operator-level if not
 *     experience-tagged) that name a specific community, Traditional
 *     Owner group, or Country with authorisation context.
 *
 * Fail criteria:
 *   • cultural_tour experience with no cultural authority signals
 *   • cultural_content_non_indigenous attempting Country-specific
 *     Aboriginal cultural content (per spec: "regardless of how
 *     well-meaning the operator")
 *
 * Gate 4 failure on any experience is NOT automatic NAY for the
 * entire operator — only that experience is blocked. The operator's
 * non-cultural experiences score normally through Gates 1-3.
 */

import { SIGNAL_TYPES } from './signals.js'

const CULTURAL_EXPERIENCE_TYPES = new Set(['cultural_tour'])

// Operator types that pass Gate 4 by definition for cultural_tour experiences.
const AUTO_PASS_OPERATOR_TYPES = new Set([
  'aboriginal_owned_led',
  'aboriginal_community',
])

// Operator types that auto-fail for Aboriginal cultural content.
const AUTO_FAIL_FOR_ABORIGINAL_CONTENT = new Set([
  'cultural_content_non_indigenous',
])

/**
 * Evaluate Gate 4 for all experiences of a candidate.
 *
 * @param {object} candidate — way_candidates row
 * @param {object[]} experiences — way_candidate_experiences rows (latest run)
 * @param {object[]} signals — all signals (latest run)
 * @returns {{
 *   experiences: Array<{
 *     experienceId: string,
 *     experienceName: string,
 *     gate: 'pass' | 'fail' | 'not_applicable',
 *     includedInListing: boolean,
 *     reason: string,
 *   }>,
 *   operatorGate4: 'pass' | 'fail' | 'not_applicable' | 'mixed',
 *   reason: string,
 * }}
 */
export function evaluateGate4(candidate, experiences, signals) {
  if (!experiences || experiences.length === 0) {
    // No per-experience data yet. Fall back to operator-level
    // primary_type_guess check.
    return evaluateOperatorLevel(candidate, signals)
  }

  const results = []
  let culturalPass = 0
  let culturalFail = 0

  for (const exp of experiences) {
    if (!CULTURAL_EXPERIENCE_TYPES.has(exp.experience_type)) {
      results.push({
        experienceId: exp.id,
        experienceName: exp.name,
        gate: 'not_applicable',
        includedInListing: true,
        reason: `experience_type ${exp.experience_type} does not require Gate 4`,
      })
      continue
    }

    // Check operator type auto-pass/fail
    const operatorType = candidate.operator_type || candidate.primary_type_guess
    if (AUTO_FAIL_FOR_ABORIGINAL_CONTENT.has(operatorType)) {
      results.push({
        experienceId: exp.id,
        experienceName: exp.name,
        gate: 'fail',
        includedInListing: false,
        reason: `operator_type ${operatorType} cannot offer Aboriginal cultural content`,
      })
      culturalFail++
      continue
    }

    if (AUTO_PASS_OPERATOR_TYPES.has(operatorType)) {
      results.push({
        experienceId: exp.id,
        experienceName: exp.name,
        gate: 'pass',
        includedInListing: true,
        reason: `operator_type ${operatorType} auto-pass (verify classification accuracy)`,
      })
      culturalPass++
      continue
    }

    // For aboriginal_partnership and other types: check for cultural
    // authority signals tagged to this experience or operator-level.
    const culturalSignals = signals.filter(s =>
      (s.signal_type === SIGNAL_TYPES.STAGE_1.CULTURAL_AUTHORITY_CLAIM ||
       s.signal_type === SIGNAL_TYPES.STAGE_1.ABORIGINAL_PARTNERSHIP) &&
      (s.experience_id === exp.id || s.experience_id === null),
    )

    if (culturalSignals.length > 0) {
      const claims = culturalSignals.map(s => s.claim_text).join('; ')
      results.push({
        experienceId: exp.id,
        experienceName: exp.name,
        gate: 'pass',
        includedInListing: true,
        reason: `${culturalSignals.length} cultural authority signal(s): ${claims.slice(0, 200)}`,
      })
      culturalPass++
    } else {
      results.push({
        experienceId: exp.id,
        experienceName: exp.name,
        gate: 'fail',
        includedInListing: false,
        reason: 'cultural_tour with no cultural authority signals',
      })
      culturalFail++
    }
  }

  const anyCultural = culturalPass + culturalFail > 0

  // Operator-level Gate 4 outcome:
  //   not_applicable — no cultural_tour experiences
  //   pass           — all cultural experiences passed
  //   fail           — ALL cultural experiences failed (nothing culturally-backable)
  //   mixed          — some passed, some failed (operator surfaces; failing excluded)
  let operatorGate4
  let reason
  if (!anyCultural) {
    operatorGate4 = 'not_applicable'
    reason = 'no cultural_tour experiences'
  } else if (culturalFail === 0) {
    operatorGate4 = 'pass'
    reason = 'all cultural experiences passed Gate 4'
  } else if (culturalPass === 0) {
    operatorGate4 = 'fail'
    reason = 'all cultural experiences failed Gate 4 — no culturally-backable content'
  } else {
    operatorGate4 = 'mixed'
    reason = `${culturalPass} cultural experience(s) passed, ${culturalFail} failed — failing experiences excluded from listing`
  }

  return { experiences: results, operatorGate4, reason }
}

/**
 * Fallback: evaluate at operator level when no per-experience data exists.
 * Uses primary_type_guess on the candidate row.
 */
function evaluateOperatorLevel(candidate, signals) {
  const type = candidate.primary_type_guess

  if (!CULTURAL_EXPERIENCE_TYPES.has(type)) {
    return {
      experiences: [],
      operatorGate4: 'not_applicable',
      reason: `primary_type ${type} does not require Gate 4`,
    }
  }

  // Cultural tour operator with no experience breakdown.
  // Check for cultural authority signals at operator level.
  const culturalSignals = signals.filter(s =>
    s.signal_type === SIGNAL_TYPES.STAGE_1.CULTURAL_AUTHORITY_CLAIM ||
    s.signal_type === SIGNAL_TYPES.STAGE_1.ABORIGINAL_PARTNERSHIP,
  )

  if (culturalSignals.length > 0) {
    return {
      experiences: [],
      operatorGate4: 'pass',
      reason: `operator-level: ${culturalSignals.length} cultural authority signal(s)`,
    }
  }

  return {
    experiences: [],
    operatorGate4: 'fail',
    reason: 'cultural_tour with no cultural authority signals (operator-level fallback)',
  }
}
