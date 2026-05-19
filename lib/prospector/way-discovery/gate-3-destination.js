/**
 * Gate 3 — Destination Quality (0-30).
 *
 * Scores external validation from Stages 2-6:
 *
 *   Editorial press (Stage 2)     → 6pts/article HIGH, 4pts MEDIUM. Cap 18.
 *   Institutional awards (Stage 3) → 6pts each. Cap 12.
 *   Institutional certs (Stage 3)  → 5pts each. Cap 10.
 *   Institutional members (Stage 3) → 2pts HIGH/MED, 1pt LOW. Cap 6.
 *   Atlas internal (Stage 4)       → 3pts per mention. Cap 6.
 *   Cross-references (Stage 5)     → 2pts per mention. Cap 6.
 *   Cultural authority claims with specific community/country naming (Stage 1)
 *     → 3pts per HIGH-confidence claim. Cap 12.
 *     Gate 3 territory: "operator's connections are externally verifiable"
 *     (specific named communities, specific country, specific descent claims).
 *
 * Silence signals (Stage 6) are NOT score-deductive. They remain as
 * visible flags on the candidate record for editorial triage but do
 * not reduce the Gate 3 score. Per calibration: silence as a hidden
 * penalty clobbers cultural authority scores on smaller operators
 * (e.g. Bookabee's 12-point cultural authority wiped to 4 by -8
 * silence). Silence is an editorial flag, not a scoring input.
 *
 * Cap: 30. Floor: 0.
 */

import { SIGNAL_TYPES, CONFIDENCE } from './signals.js'

const WEIGHTS = {
  PRESS_HIGH:         6,
  PRESS_MEDIUM:       4,
  PRESS_CAP:          18,

  AWARD:              6,
  AWARD_CAP:          12,
  CERTIFICATION:      5,
  CERTIFICATION_CAP:  10,
  MEMBER_HIGH_MED:    2,
  MEMBER_LOW:         1,
  MEMBER_CAP:         6,

  ATLAS_INTERNAL:     3,
  ATLAS_INTERNAL_CAP: 6,

  CROSS_REF:          2,
  CROSS_REF_CAP:      6,

  CULTURAL_AUTHORITY: 3,
  CULTURAL_AUTH_CAP:  12,
}

// Cultural authority claims that score on Gate 3 must contain specific
// community, country, or people naming — not generic "Aboriginal-led"
// language. These heuristics test for specificity.
const SPECIFIC_CULTURAL_PATTERNS = [
  // Named peoples / language groups
  /\b(palawa|adnyamathanha|anangu|yolngu|arrernte|pitjantjatjara|yankunytjatjara|bundjalung|gundungurra|wiradjuri|ngunnawal|wurundjeri|boon wurrung|trawlwoolway|yarluyandi|narungga|kokatha|kaurna)\b/i,
  // Named country / place with cultural context
  /\bcountry\b.*\b(named|clan|traditional|ancestral|homeland)\b/i,
  /\b(traditional owner|traditional custodian|elder|community organisation|land council|aboriginal corporation)\b/i,
  // Specific descent / lineage claims
  /\bdescendant\b/i,
  /\bheritage\b.*\b(deeply|intertwined|ancestral)\b/i,
  // Specific community org naming
  /\b(enterprises|corporation|council|trust)\b.*\b(aboriginal|indigenous|palawa|torres strait)\b/i,
]

function isSpecificCulturalClaim(claimText) {
  if (!claimText) return false
  return SPECIFIC_CULTURAL_PATTERNS.some(p => p.test(claimText))
}

/**
 * @param {object[]} signals — all signals for this candidate (latest run)
 * @returns {{ score: number, breakdown: object }}
 */
export function evaluateGate3(signals) {
  let score = 0
  const breakdown = {}

  // Editorial press (Stage 2)
  const pressSignals = signals.filter(s => s.stage === 2 && s.signal_type === SIGNAL_TYPES.STAGE_2.ARTICLE)
  if (pressSignals.length > 0) {
    let pressPoints = 0
    for (const s of pressSignals) {
      pressPoints += s.confidence_band === CONFIDENCE.HIGH ? WEIGHTS.PRESS_HIGH : WEIGHTS.PRESS_MEDIUM
    }
    pressPoints = Math.min(pressPoints, WEIGHTS.PRESS_CAP)
    score += pressPoints
    breakdown.press = { count: pressSignals.length, points: pressPoints }
  }

  // Institutional awards (Stage 3)
  const awardSignals = signals.filter(s => s.stage === 3 && s.signal_type === SIGNAL_TYPES.STAGE_3.AWARD)
  if (awardSignals.length > 0) {
    const awardPoints = Math.min(awardSignals.length * WEIGHTS.AWARD, WEIGHTS.AWARD_CAP)
    score += awardPoints
    breakdown.awards = { count: awardSignals.length, points: awardPoints }
  }

  // Institutional certifications (Stage 3)
  const certSignals = signals.filter(s => s.stage === 3 && s.signal_type === SIGNAL_TYPES.STAGE_3.CERTIFICATION)
  if (certSignals.length > 0) {
    const certPoints = Math.min(certSignals.length * WEIGHTS.CERTIFICATION, WEIGHTS.CERTIFICATION_CAP)
    score += certPoints
    breakdown.certifications = { count: certSignals.length, points: certPoints }
  }

  // Institutional member listings (Stage 3)
  const memberSignals = signals.filter(s => s.stage === 3 && s.signal_type === SIGNAL_TYPES.STAGE_3.MEMBER_LISTING)
  if (memberSignals.length > 0) {
    let memberPoints = 0
    for (const s of memberSignals) {
      memberPoints += s.confidence_band === CONFIDENCE.LOW ? WEIGHTS.MEMBER_LOW : WEIGHTS.MEMBER_HIGH_MED
    }
    memberPoints = Math.min(memberPoints, WEIGHTS.MEMBER_CAP)
    score += memberPoints
    breakdown.members = { count: memberSignals.length, points: memberPoints }
  }

  // Atlas internal (Stage 4)
  const internalSignals = signals.filter(s => s.stage === 4)
  if (internalSignals.length > 0) {
    const intPoints = Math.min(internalSignals.length * WEIGHTS.ATLAS_INTERNAL, WEIGHTS.ATLAS_INTERNAL_CAP)
    score += intPoints
    breakdown.atlas_internal = { count: internalSignals.length, points: intPoints }
  }

  // Cross-references (Stage 5)
  const crossRefSignals = signals.filter(s => s.stage === 5)
  if (crossRefSignals.length > 0) {
    const crPoints = Math.min(crossRefSignals.length * WEIGHTS.CROSS_REF, WEIGHTS.CROSS_REF_CAP)
    score += crPoints
    breakdown.cross_references = { count: crossRefSignals.length, points: crPoints }
  }

  // Cultural authority claims with specific naming (Stage 1)
  const culturalSignals = signals.filter(s =>
    s.stage === 1 &&
    s.signal_type === SIGNAL_TYPES.STAGE_1.CULTURAL_AUTHORITY_CLAIM &&
    s.confidence_band === CONFIDENCE.HIGH &&
    isSpecificCulturalClaim(s.claim_text),
  )
  if (culturalSignals.length > 0) {
    const culPoints = Math.min(culturalSignals.length * WEIGHTS.CULTURAL_AUTHORITY, WEIGHTS.CULTURAL_AUTH_CAP)
    score += culPoints
    breakdown.cultural_authority = { count: culturalSignals.length, points: culPoints }
  }

  // Silence signals (Stage 6) — tracked for editorial visibility, NOT
  // score-deductive. The silence count appears in breakdown so editors
  // can see which external-validation categories returned empty, but
  // does not reduce the Gate 3 score.
  const silenceSignals = signals.filter(s => s.stage === 6)
  if (silenceSignals.length > 0) {
    breakdown.silence = { count: silenceSignals.length, points: 0 }
  }

  const capped = Math.min(Math.max(score, 0), 30)
  return { score: capped, breakdown }
}
