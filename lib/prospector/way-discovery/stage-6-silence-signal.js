/**
 * Stage 6 — Silence signal aggregator.
 *
 * Per spec re-read: Stage 6 is the silence signal, NOT cultural
 * authority extraction (which folds into Stage 1). The master prompt
 * had this wrong; the spec is authoritative.
 *
 * Per Q2 sign-off: silence as explicit signal, not implicit scoring
 * penalty. The editor needs to see "no press in last 24 months"
 * alongside other signals at triage. Implicit penalties are
 * invisible at decision time and harder to override when editorial
 * judgement disagrees. Silence is editorially meaningful (a high-
 * quality operator with no recent press is differently situated, not
 * worse) and the triage interface should reflect that distinction.
 *
 * Stage 6 reads the in-memory signals from this run (Stages 1-5)
 * rather than round-tripping through the DB. It emits a fixed
 * catalogue of silence signal types, one per absent-evidence
 * category. Each silence signal has a synthetic source_url
 * (silence-signal:<run-id>:<type>) — the silence is about absent
 * evidence, not a fetched page. The migration's
 * way_candidate_signals_validated view explicitly includes Stage 6
 * regardless of url_resolved, so silence signals are always visible
 * to the scoring layer.
 *
 * Silence signal catalogue:
 *
 *   silence.press_24mo
 *     No editorial press hits (Stage 2) in the last 24 months.
 *     Threshold: zero stage-2 signals OR all stage-2 signals older
 *     than 24 months.
 *
 *   silence.awards_5yr
 *     No institutional award signals (Stage 3 institutional.award)
 *     in the last 5 years. Threshold: zero stage-3 signals of type
 *     institutional.award OR all older than 5 years.
 *
 *   silence.institutional_certification
 *     No institutional certification signals (Stage 3
 *     institutional.certification) at all. Certifications are
 *     ongoing-status not date-bound, so the threshold is simply zero.
 *
 *   silence.atlas_internal
 *     No Atlas internal cross-references (Stage 4) at all. Means the
 *     operator hasn't been written about in journal articles or
 *     associated with Field trails — likely a brand-new candidate
 *     to the network's editorial coverage.
 *
 * Silence signals don't have a confidence band per se — they state
 * an absence. Stored as MEDIUM by convention; the scoring layer
 * reads them as binary.
 */

import { SIGNAL_TYPES, CONFIDENCE, buildSignal } from './signals.js'

const MS_PER_DAY = 86400 * 1000
const PRESS_WINDOW_DAYS = 24 * 30      // 24 months ≈ 720 days
const AWARDS_WINDOW_DAYS = 5 * 365     // 5 years ≈ 1825 days

/**
 * @param {object} ctx — pipeline context (candidate, runId, log)
 * @param {object[]} runSignals — signals produced this run, before persist
 * @returns {Promise<object[]>}
 */
export async function runStage6SilenceSignal(ctx, runSignals) {
  const { candidate, runId, log } = ctx
  const out = []

  const now = Date.now()

  // ─── silence.press_24mo ──────────────────────────────────────
  // Stage 2 signals (editorial_press.article) are date-bound via
  // raw_data.published_date when web_search returns it. If absent,
  // we can't tell — count those as "press exists" (don't flag
  // silence). Conservative.
  const stage2Signals = runSignals.filter(s =>
    s.stage === 2 && s.signal_type === SIGNAL_TYPES.STAGE_2.ARTICLE
  )
  const recentPress = stage2Signals.filter(s => {
    const pub = s.raw_data?.published_date
    if (!pub) return true   // unknown date — assume recent (don't fire silence)
    const ageMs = now - new Date(pub).getTime()
    return Number.isFinite(ageMs) && ageMs <= PRESS_WINDOW_DAYS * MS_PER_DAY
  })
  if (recentPress.length === 0) {
    out.push(buildSignal({
      candidateId:  candidate.id,
      stage:        6,
      signalType:   SIGNAL_TYPES.STAGE_6.PRESS_24MO,
      claimText:    'No editorial press coverage in the last 24 months',
      sourceUrl:    syntheticSilenceUrl(runId, 'press_24mo'),
      sourceLabel:  'Silence signal: editorial press whitelist',
      confidence:   CONFIDENCE.MEDIUM,
      urlResolved:  true,                  // synthetic source — always "valid"
      urlValidationStatus: 'silence_synthetic',
      rawData: {
        silence_type:     'press_24mo',
        threshold_period: '24 months',
        count_found:      stage2Signals.length,
        count_in_window:  recentPress.length,
        whitelist_searched: stage2Signals.length > 0,
      },
      runId,
    }))
  }

  // ─── silence.awards_5yr ──────────────────────────────────────
  const awardSignals = runSignals.filter(s =>
    s.stage === 3 && s.signal_type === SIGNAL_TYPES.STAGE_3.AWARD
  )
  const recentAwards = awardSignals.filter(s => {
    const yr = s.raw_data?.year
    if (!Number.isFinite(yr)) return true
    const yearsAgo = new Date().getFullYear() - yr
    return yearsAgo <= 5
  })
  if (recentAwards.length === 0) {
    out.push(buildSignal({
      candidateId:  candidate.id,
      stage:        6,
      signalType:   SIGNAL_TYPES.STAGE_6.AWARDS_5YR,
      claimText:    'No tourism awards in the last 5 years',
      sourceUrl:    syntheticSilenceUrl(runId, 'awards_5yr'),
      sourceLabel:  'Silence signal: institutional awards (5-year window)',
      confidence:   CONFIDENCE.MEDIUM,
      urlResolved:  true,
      urlValidationStatus: 'silence_synthetic',
      rawData: {
        silence_type:     'awards_5yr',
        threshold_period: '5 years',
        count_found:      awardSignals.length,
        count_in_window:  recentAwards.length,
      },
      runId,
    }))
  }

  // ─── silence.institutional_certification ─────────────────────
  const certSignals = runSignals.filter(s =>
    s.stage === 3 && s.signal_type === SIGNAL_TYPES.STAGE_3.CERTIFICATION
  )
  if (certSignals.length === 0) {
    out.push(buildSignal({
      candidateId:  candidate.id,
      stage:        6,
      signalType:   SIGNAL_TYPES.STAGE_6.INSTITUTIONAL_CERTIFICATION,
      claimText:    'No institutional certifications detected',
      sourceUrl:    syntheticSilenceUrl(runId, 'institutional_certification'),
      sourceLabel:  'Silence signal: certifications (ATAP, ECO, ROC, etc.)',
      confidence:   CONFIDENCE.MEDIUM,
      urlResolved:  true,
      urlValidationStatus: 'silence_synthetic',
      rawData: {
        silence_type: 'institutional_certification',
        count_found:  0,
      },
      runId,
    }))
  }

  // ─── silence.atlas_internal ──────────────────────────────────
  const atlasSignals = runSignals.filter(s => s.stage === 4)
  if (atlasSignals.length === 0) {
    out.push(buildSignal({
      candidateId:  candidate.id,
      stage:        6,
      signalType:   SIGNAL_TYPES.STAGE_6.ATLAS_INTERNAL,
      claimText:    'No Atlas Network internal cross-references found',
      sourceUrl:    syntheticSilenceUrl(runId, 'atlas_internal'),
      sourceLabel:  'Silence signal: Atlas internal (articles + Field trails)',
      confidence:   CONFIDENCE.MEDIUM,
      urlResolved:  true,
      urlValidationStatus: 'silence_synthetic',
      rawData: {
        silence_type: 'atlas_internal',
        count_found:  0,
      },
      runId,
    }))
  }

  log(6, `emitted ${out.length} silence signals (out of 4 possible)`)
  return out
}

function syntheticSilenceUrl(runId, type) {
  // Non-resolvable URN-style identifier. Distinct from real URLs so a
  // sloppy join against url_resolved doesn't surface these
  // accidentally. The migration view (way_candidate_signals_validated)
  // includes Stage 6 regardless of url_resolved.
  return `silence-signal:${runId}:${type}`
}
