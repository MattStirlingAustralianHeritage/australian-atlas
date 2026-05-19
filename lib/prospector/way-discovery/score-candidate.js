/**
 * Scoring orchestrator — runs all 4 gates on a candidate.
 *
 * Consumes signals from the candidate's latest discovery run and
 * produces gate scores written back to way_candidates.
 *
 * Surfacing threshold (per Q3 sign-off + calibration):
 *   Gate 1 pass AND Gate 2 ≥ 15 AND Gate 3 ≥ G3_FLOOR AND total ≥ 25
 *   AND (Gate 4 pass or not_applicable for all experiences)
 *
 * Gate 3 floor:
 *   Default: G3 ≥ 5
 *   Character exemption: if G2 ≥ 25, G3 ≥ 0 qualifies (floor lifts).
 *   Rationale: G2 ≥ 25 means the operator is substantially documented
 *   in first-party content (multiple named guides, distinctive method,
 *   named country, established history). The character IS the validation.
 *
 * Gate 4 failure blocks individual experiences, not the entire
 * operator. An operator with mixed cultural/non-cultural experiences
 * can still surface — only the failing cultural experiences are
 * excluded from listing.
 */

import { evaluateGate1 } from './gate-1-independence.js'
import { evaluateGate2 } from './gate-2-character.js'
import { evaluateGate3 } from './gate-3-destination.js'
import { evaluateGate4 } from './gate-4-cultural.js'

/**
 * @param {object} candidate — way_candidates row (must include id, name, etc.)
 * @param {object} supabase — portal admin client
 * @param {object} [opts]
 * @param {Function} [opts.log] — logger
 * @param {boolean} [opts.dryRun=false] — if true, don't write scores
 * @returns {Promise<{
 *   gate1: object,
 *   gate2: object,
 *   gate3: object,
 *   gate4: object,
 *   total: number,
 *   surfaces: boolean,
 *   surfaceReason: string,
 * }>}
 */
export async function scoreCandidate(candidate, supabase, opts = {}) {
  const log = opts.log || ((msg) => console.log(`[scoring] ${msg}`))
  const dryRun = opts.dryRun || false

  // Fetch latest run's signals
  const { data: latestSig } = await supabase
    .from('way_candidate_signals')
    .select('run_id')
    .eq('candidate_id', candidate.id)
    .order('created_at', { ascending: false })
    .limit(1)

  if (!latestSig || latestSig.length === 0) {
    log(`no signals for ${candidate.name}; cannot score`)
    return null
  }

  const runId = latestSig[0].run_id

  const { data: signals } = await supabase
    .from('way_candidate_signals')
    .select('*')
    .eq('candidate_id', candidate.id)
    .eq('run_id', runId)

  if (!signals || signals.length === 0) {
    log(`no signals in run ${runId} for ${candidate.name}`)
    return null
  }

  // Fetch latest run's experiences
  const { data: experiences } = await supabase
    .from('way_candidate_experiences')
    .select('*')
    .eq('candidate_id', candidate.id)
    .eq('run_id', runId)

  log(`scoring ${candidate.name} — ${signals.length} signals, ${(experiences || []).length} experiences (run ${runId})`)

  // Gate 1 — Independence
  const gate1 = await evaluateGate1(candidate, supabase)
  log(`Gate 1: ${gate1.gate} — ${gate1.reason}`)

  // Gate 2 — Character (0-30)
  const gate2 = evaluateGate2(signals)
  log(`Gate 2: ${gate2.score}/30 — ${JSON.stringify(gate2.breakdown)}`)

  // Gate 3 — Destination Quality (0-30)
  const gate3 = evaluateGate3(signals)
  log(`Gate 3: ${gate3.score}/30 — ${JSON.stringify(gate3.breakdown)}`)

  // Gate 4 — Cultural Authority (per-experience)
  const gate4 = evaluateGate4(candidate, experiences || [], signals)
  log(`Gate 4: ${gate4.operatorGate4} — ${gate4.reason}`)
  for (const exp of gate4.experiences) {
    log(`  ${exp.experienceName}: ${exp.gate} — ${exp.reason}`)
  }

  // Total and surfacing
  const total = gate2.score + gate3.score
  // pass, not_applicable, and mixed all allow the operator to surface.
  // Only 'fail' (ALL cultural experiences blocked) prevents surfacing.
  const gate4Clear = gate4.operatorGate4 !== 'fail'

  // Character exemption: if G2 ≥ 25, the Gate 3 floor drops from 5 to 0.
  // Strong first-party character depth is self-validating.
  const characterExemption = gate2.score >= 25
  const gate3Floor = characterExemption ? 0 : 5

  let surfaces = false
  let surfaceReason = ''

  if (gate1.gate === 'fail') {
    surfaceReason = `Gate 1 fail: ${gate1.reason}`
  } else if (gate2.score < 15) {
    surfaceReason = `Gate 2 below floor: ${gate2.score}/30 (need ≥15)`
  } else if (gate3.score < gate3Floor) {
    surfaceReason = `Gate 3 below floor: ${gate3.score}/30 (need ≥${gate3Floor}${characterExemption ? ', character exemption active' : ''})`
  } else if (total < 25) {
    surfaceReason = `Total below threshold: ${total}/60 (need ≥25)`
  } else if (!gate4Clear) {
    surfaceReason = `Gate 4 fail: ${gate4.reason}`
  } else {
    surfaces = true
    surfaceReason = `Passes all gates: G1=${gate1.gate}, G2=${gate2.score}, G3=${gate3.score}, total=${total}, G4=${gate4.operatorGate4}${characterExemption ? ' (character exemption)' : ''}`
  }

  log(`Total: ${total}/60 — surfaces: ${surfaces} — ${surfaceReason}`)

  // Persist scores
  if (!dryRun) {
    const updatePayload = {
      gate_1_independence: gate1.gate,
      gate_2_character_score: gate2.score,
      gate_3_destination_score: gate3.score,
      gate_4_cultural_authority: gate4.operatorGate4,
      total_score: total,
      scored_at: new Date().toISOString(),
      status: gate1.gate === 'fail' ? 'rejected' : surfaces ? 'scored' : 'discovering',
      rejection_reason: gate1.gate === 'fail' ? gate1.reason : null,
      rejection_gate: gate1.gate === 'fail' ? 1 : null,
    }

    const { error } = await supabase
      .from('way_candidates')
      .update(updatePayload)
      .eq('id', candidate.id)

    if (error) {
      log(`ERROR persisting scores: ${error.message}`)
    } else {
      log(`scores persisted`)
    }

    // Write per-experience Gate 4 results + included_in_listing flag
    for (const exp of gate4.experiences) {
      await supabase
        .from('way_candidate_experiences')
        .update({
          gate_4_status: exp.gate,
          gate_4_reason: exp.reason,
          included_in_listing: exp.includedInListing,
        })
        .eq('id', exp.experienceId)
    }
  }

  return {
    gate1,
    gate2,
    gate3,
    gate4,
    total,
    surfaces,
    surfaceReason,
  }
}
