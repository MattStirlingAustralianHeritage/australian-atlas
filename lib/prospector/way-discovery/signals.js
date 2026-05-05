/**
 * Way discovery signal catalogue + persistence helpers.
 *
 * Every signal extracted by the discovery pipeline lands in the
 * way_candidate_signals table (migration 121). Each row is source-
 * bound: claim_text + source_url + source_excerpt + source_label
 * are all required. The `signal_type` is a dotted string namespacing
 * the signal kind under its producing stage.
 *
 * The constants here are the canonical catalogue. New signal kinds
 * added during calibration should be added here, then used by the
 * stage runners that emit them. The DB doesn't enforce the catalogue
 * via CHECK constraint (it's editable text) so this file is the
 * effective source of truth.
 */

// ─── Signal types ──────────────────────────────────────────────────
// Stage namespaces match the spec's stage numbering. Strings are
// chosen so a quick `signal_type LIKE 'first_party.%'` query groups
// a stage's output cleanly.

export const SIGNAL_TYPES = {
  // Stage 1 — first-party operator website extraction.
  // Cultural authority claim extraction is folded into Stage 1 per
  // spec re-read; the master prompt's Stage 6 = silence signal, not
  // cultural authority.
  STAGE_1: {
    OPERATOR_NAME:              'first_party.operator_name',
    PRIMARY_TYPE:               'first_party.primary_type',
    GUIDE_NAMED:                'first_party.guide_named',
    GUIDE_QUALIFICATION:        'first_party.guide_qualification',
    DURATION:                   'first_party.duration',
    PRICE:                      'first_party.price',
    SEASON:                     'first_party.season',
    GROUP_SIZE:                 'first_party.group_size',
    DEPARTURE_POINT:            'first_party.departure_point',
    METHOD_DESCRIBED:           'first_party.method_described',
    COUNTRY_NAMED:              'first_party.country_named',
    CULTURAL_AUTHORITY_CLAIM:   'first_party.cultural_authority_claim',
    ABORIGINAL_PARTNERSHIP:     'first_party.aboriginal_partnership',
    ESTABLISHED_YEAR:           'first_party.established_year',
    ACCREDITATION_CLAIM:        'first_party.accreditation_claim',
  },

  // Stage 2 — editorial press whitelist hits.
  // One signal row per article. Whitelist enforcement is post-hoc
  // (URL domain check) per Q1 sign-off.
  STAGE_2: {
    ARTICLE:                    'editorial_press.article',
  },

  // Stage 3 — institutional / accreditation register hits.
  STAGE_3: {
    AWARD:                      'institutional.award',
    CERTIFICATION:              'institutional.certification',
    MEMBER_LISTING:             'institutional.member_listing',
  },

  // Stage 4 — Atlas internal cross-references.
  STAGE_4: {
    ARTICLE_MENTION:            'atlas_internal.article_mention',
    FIELD_TRAIL_MENTION:        'atlas_internal.field_trail_mention',
  },

  // Stage 5 — cross-reference detection: mentions of OTHER operators
  // or trails surfaced inside Stage 1's first-party text.
  STAGE_5: {
    OPERATOR_MENTION:           'cross_reference.operator_mention',
    TRAIL_MENTION:              'cross_reference.trail_mention',
  },

  // Stage 6 — silence signals. Explicit, structured. Per Q2 of
  // architecture sign-off: surfaced as visible flags at triage, not
  // implicit scoring penalties. The scoring layer in 2C decides how
  // to weight; signal records simply state "no evidence found in
  // this category over this period."
  STAGE_6: {
    PRESS_24MO:                 'silence.press_24mo',
    AWARDS_5YR:                 'silence.awards_5yr',
    INSTITUTIONAL_CERTIFICATION:'silence.institutional_certification',
    ATLAS_INTERNAL:             'silence.atlas_internal',
  },
}

// Confidence bands per Q2 sign-off. Stage runners pick a band per
// signal based on source quality. Defaults documented per stage.
export const CONFIDENCE = {
  HIGH:   'high',
  MEDIUM: 'medium',
  LOW:    'low',
}

// Stage 1 first-party signals are HIGH by default — first-party text
// is the operator stating their own claim. Stage 1 is HIGH when the
// claim is structured and discoverable (named guide on /our-guides
// page; pricing in a stated price band on /book). Stage 1 drops to
// MEDIUM when extraction is from less structured sources (general
// /about page).

// Stage 2 editorial press is HIGH (whitelist publications are the
// editorial bar; whitelist is the filter, not a guideline).

// Stage 3 institutional confidence varies per body — the runner
// passes the right band per body. See INSTITUTIONAL_CONFIDENCE in
// stage-3-institutional.js.

// Stage 4 Atlas internal is HIGH (we're matching against our own DB).

// Stage 5 cross-reference is MEDIUM by default (a mention surfaced
// in first-party text supports the cross-link but isn't itself
// editorial validation).

// Stage 6 silence signals don't have a confidence band per se — they
// state an absence. Stored as MEDIUM by convention; the scoring
// layer reads them as binary.


// ─── Source binding helpers ──────────────────────────────────────
// Build a signal record. The pipeline orchestrator collects these
// and bulk-inserts at the end of the run.

/**
 * Construct a signal record for the way_candidate_signals table.
 *
 * Required fields enforced here, not at the DB level — the DB has
 * NOT NULL on claim_text and source_url, but a missing source_excerpt
 * doesn't fail the insert. Fail-fast in JS keeps misuse loud.
 *
 * @param {object} params
 * @param {string} params.candidateId   — way_candidates.id
 * @param {number} params.stage         — 1-6
 * @param {string} params.signalType    — from SIGNAL_TYPES
 * @param {string} params.claimText     — the claim being made
 * @param {string} params.sourceUrl     — where the claim came from
 * @param {string} [params.sourceExcerpt] — literal excerpt
 * @param {string} [params.sourceLabel]   — human label
 * @param {('high'|'medium'|'low')} [params.confidence] — defaults to medium
 * @param {object} [params.rawData]     — stage-specific structured fields
 * @param {string} params.runId         — pipeline execution UUID
 * @param {boolean} [params.urlResolved] — set true if URL was validated
 *                                         (typical for stages 4/5/6 where
 *                                         the source isn't a remote URL or
 *                                         is internal)
 * @param {string} [params.urlValidationStatus]
 * @returns {object} record ready for `.insert()` into way_candidate_signals
 */
export function buildSignal(params) {
  const required = ['candidateId', 'stage', 'signalType', 'claimText', 'sourceUrl', 'runId']
  for (const k of required) {
    if (params[k] == null) {
      throw new Error(`buildSignal: missing required field '${k}' (signal ${params.signalType || 'unknown'})`)
    }
  }
  const stage = params.stage
  if (!Number.isInteger(stage) || stage < 1 || stage > 6) {
    throw new Error(`buildSignal: stage must be 1-6, got ${stage}`)
  }
  return {
    candidate_id:           params.candidateId,
    stage,
    signal_type:            params.signalType,
    claim_text:             params.claimText,
    source_url:             params.sourceUrl,
    source_excerpt:         params.sourceExcerpt || null,
    source_label:           params.sourceLabel || null,
    confidence_band:        params.confidence || CONFIDENCE.MEDIUM,
    url_resolved:           params.urlResolved ?? false,
    url_validation_status:  params.urlValidationStatus || null,
    url_validated_at:       params.urlResolved ? new Date().toISOString() : null,
    raw_data:               params.rawData || {},
    run_id:                 params.runId,
  }
}

/**
 * Insert a batch of signal records into way_candidate_signals.
 * Caller is responsible for handling errors. No upsert semantics —
 * the run_id makes each pipeline run produce a fresh signal set.
 *
 * @param {object} supabase — admin client (portal master DB)
 * @param {object[]} signals — records from buildSignal()
 * @returns {Promise<{inserted: number, error?: string}>}
 */
export async function persistSignals(supabase, signals) {
  if (!signals || signals.length === 0) return { inserted: 0 }
  const { data, error } = await supabase
    .from('way_candidate_signals')
    .insert(signals)
    .select('id')
  if (error) {
    return { inserted: 0, error: error.message }
  }
  return { inserted: (data || []).length }
}

/**
 * Mark older signal sets as superseded. Discovery is supposed to
 * refresh weekly per master prompt; old signals shouldn't pollute
 * scoring on the next run. We don't delete (audit value) — we just
 * keep the run_id distinct so the scoring layer queries the latest
 * run only.
 *
 * The way_candidate_signals_validated view in 121 doesn't filter by
 * run; the scoring layer's read in 2C will join against the
 * way_candidates.last_run_at to constrain to current.
 *
 * Helper provided here for completeness.
 */
export async function getLatestRunId(supabase, candidateId) {
  const { data, error } = await supabase
    .from('way_candidate_signals')
    .select('run_id, created_at')
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`getLatestRunId failed: ${error.message}`)
  return data?.run_id || null
}
