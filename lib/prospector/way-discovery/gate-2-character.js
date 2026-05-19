/**
 * Gate 2 — Character (0-30).
 *
 * Scores the operator's character from Stage 1 first-party signals.
 * The spec's four indicators map to signal types:
 *
 *   Named guides         → guide_named + guide_qualification
 *   Specific method      → method_described
 *   Geographic depth     → country_named
 *   Relationship language → aboriginal_partnership
 *
 * Additional signals with weight:
 *   established_year     → longevity bonus (pre-2000: 3, pre-2010: 2, pre-2020: 1)
 *
 * Signals that do NOT carry Gate 2 weight:
 *   accreditation_claim  → marketing claim; Gate 3 via Stage 3 verification only
 *   cultural_authority_claim → Gate 3 (external verifiability) + Gate 4 territory
 *   duration, price, season, group_size, departure_point — operational, not character
 *
 * Cap: 30. Floor: 0.
 */

import { SIGNAL_TYPES } from './signals.js'

const WEIGHTS = {
  GUIDE_FIRST:        5,
  GUIDE_ADDITIONAL:   3,
  GUIDE_CAP:          20,
  QUALIFICATION:      2,
  QUALIFICATION_CAP:  6,
  METHOD_FIRST:       5,
  COUNTRY_FIRST:      4,
  COUNTRY_SECOND:     2,
  COUNTRY_CAP:        6,
  PARTNERSHIP:        5,
  ESTABLISHED_PRE_2000: 3,
  ESTABLISHED_PRE_2010: 2,
  ESTABLISHED_PRE_2020: 1,
}

/**
 * @param {object[]} signals — Stage 1 signals for this candidate (latest run)
 * @returns {{ score: number, breakdown: object }}
 */
export function evaluateGate2(signals) {
  const stage1 = signals.filter(s => s.stage === 1)

  let score = 0
  const breakdown = {}

  // Named guides
  const guideSignals = stage1.filter(s => s.signal_type === SIGNAL_TYPES.STAGE_1.GUIDE_NAMED)
  if (guideSignals.length > 0) {
    const guidePoints = Math.min(
      WEIGHTS.GUIDE_FIRST + Math.max(0, guideSignals.length - 1) * WEIGHTS.GUIDE_ADDITIONAL,
      WEIGHTS.GUIDE_CAP,
    )
    score += guidePoints
    breakdown.guides = { count: guideSignals.length, points: guidePoints }
  }

  // Guide qualifications
  const qualSignals = stage1.filter(s => s.signal_type === SIGNAL_TYPES.STAGE_1.GUIDE_QUALIFICATION)
  if (qualSignals.length > 0) {
    const qualPoints = Math.min(qualSignals.length * WEIGHTS.QUALIFICATION, WEIGHTS.QUALIFICATION_CAP)
    score += qualPoints
    breakdown.qualifications = { count: qualSignals.length, points: qualPoints }
  }

  // Method described
  const methodSignals = stage1.filter(s => s.signal_type === SIGNAL_TYPES.STAGE_1.METHOD_DESCRIBED)
  if (methodSignals.length > 0) {
    score += WEIGHTS.METHOD_FIRST
    breakdown.method = { count: methodSignals.length, points: WEIGHTS.METHOD_FIRST }
  }

  // Country named (geographic depth)
  const countrySignals = stage1.filter(s => s.signal_type === SIGNAL_TYPES.STAGE_1.COUNTRY_NAMED)
  if (countrySignals.length > 0) {
    const countryPoints = Math.min(
      WEIGHTS.COUNTRY_FIRST + Math.max(0, countrySignals.length - 1) * WEIGHTS.COUNTRY_SECOND,
      WEIGHTS.COUNTRY_CAP,
    )
    score += countryPoints
    breakdown.country = { count: countrySignals.length, points: countryPoints }
  }

  // Aboriginal partnership (relationship language)
  const partnershipSignals = stage1.filter(s => s.signal_type === SIGNAL_TYPES.STAGE_1.ABORIGINAL_PARTNERSHIP)
  if (partnershipSignals.length > 0) {
    score += WEIGHTS.PARTNERSHIP
    breakdown.partnership = { count: partnershipSignals.length, points: WEIGHTS.PARTNERSHIP }
  }

  // Established year (longevity bonus)
  const yearSignals = stage1.filter(s => s.signal_type === SIGNAL_TYPES.STAGE_1.ESTABLISHED_YEAR)
  if (yearSignals.length > 0) {
    const yearStr = yearSignals[0].raw_data?.value || yearSignals[0].claim_text
    const yearMatch = yearStr?.match(/\b(19|20)\d{2}\b/)
    if (yearMatch) {
      const year = parseInt(yearMatch[0], 10)
      let yearPoints = 0
      if (year < 2000)      yearPoints = WEIGHTS.ESTABLISHED_PRE_2000
      else if (year < 2010) yearPoints = WEIGHTS.ESTABLISHED_PRE_2010
      else if (year < 2020) yearPoints = WEIGHTS.ESTABLISHED_PRE_2020
      if (yearPoints > 0) {
        score += yearPoints
        breakdown.established = { year, points: yearPoints }
      }
    }
  }

  const capped = Math.min(Math.max(score, 0), 30)
  return { score: capped, breakdown }
}
