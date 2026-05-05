/**
 * Way Atlas discovery pipeline orchestrator.
 *
 * Runs the six discovery stages against an operator candidate and
 * persists structured, source-bound signals to the
 * way_candidate_signals table for the 4-gate scoring layer (Phase 2C)
 * to consume.
 *
 * Stage order and dependencies:
 *
 *   Stage 1 — first-party sources (operator's own website)
 *               → produces text content reused by Stage 5
 *               → cultural authority claim extraction folded in
 *                 (per spec re-read; master prompt was wrong about
 *                 silence vs cultural authority placement)
 *
 *   Stage 2 — editorial press (web_search + whitelist + URL validation)
 *               → independent of other stages
 *
 *   Stage 3 — institutional / accreditation (site-scoped web_search
 *               with confidence bands per body)
 *               → independent of other stages
 *
 *   Stage 4 — Atlas internal (DB query: articles + Field trail
 *               listings)
 *               → reads portal articles + field.places
 *
 *   Stage 5 — cross-reference detection (text scan of Stage 1 output
 *               for mentions of other operators / trails in Atlas)
 *               → depends on Stage 1 + reads Atlas listings
 *
 *   Stage 6 — silence signals (aggregator: looks at Stages 2/3/4
 *               and emits explicit "no evidence found" signals)
 *               → depends on Stages 2, 3, 4
 *
 * Pipeline runs stages 1-5 in order (Stage 5 depends on Stage 1's
 * fetched text; Stages 2/3/4 are independent but kept sequential
 * for predictable rate limiting). Stage 6 runs last after all
 * discovery stages have completed.
 *
 * Per-pipeline-run isolation is via a fresh run_id (UUID) generated
 * at run start. All signals from a run share that ID. The scoring
 * layer in 2C reads signals filtered to the candidate's latest run.
 */

import { randomUUID } from 'crypto'
import { runStage1FirstParty } from './stage-1-first-party.js'
import { runStage2EditorialPress } from './stage-2-editorial-press.js'
import { runStage3Institutional } from './stage-3-institutional.js'
import { runStage4AtlasInternal } from './stage-4-atlas-internal.js'
import { runStage5CrossReference } from './stage-5-cross-reference.js'
import { runStage6SilenceSignal } from './stage-6-silence-signal.js'
import { persistSignals } from './signals.js'

/**
 * Run the full 6-stage discovery pipeline on one candidate.
 *
 * @param {object} candidate — way_candidates row (must include id,
 *   name, slug, website_url, region_hints, primary_type_guess)
 * @param {object} supabase — portal master DB admin client
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun=false] — log signals but don't persist
 * @param {object} [opts.fieldClient] — Field Atlas Supabase client for
 *   Stage 4's field.places query. Optional; if absent, Field cross-
 *   references are skipped with a warning.
 * @param {object} [opts.log] — optional logger; defaults to console
 * @returns {Promise<{
 *   candidateId: string,
 *   runId: string,
 *   stages: Record<number, { signalCount: number, errors: string[] }>,
 *   totalSignals: number,
 *   elapsedMs: number,
 * }>}
 */
export async function runWayDiscoveryPipeline(candidate, supabase, opts = {}) {
  const { dryRun = false, fieldClient = null } = opts
  const log = opts.log || ((stage, msg) => console.log(`[way-discovery][stage-${stage}] ${msg}`))

  const t0 = Date.now()
  const runId = randomUUID()
  const ctx = {
    candidate,
    runId,
    log,
    fieldClient,
    // Stage 1 deposits its fetched website text here so Stage 5 can
    // scan it without re-fetching.
    firstPartyText: '',
    firstPartyPagesByPath: {},
  }

  const stages = {}
  const allSignals = []

  // ─── Stages 1-5 ────────────────────────────────────────────────
  const discoveryStages = [
    [1, runStage1FirstParty],
    [2, runStage2EditorialPress],
    [3, runStage3Institutional],
    [4, runStage4AtlasInternal],
    [5, runStage5CrossReference],
  ]
  for (const [n, runner] of discoveryStages) {
    stages[n] = { signalCount: 0, errors: [] }
    try {
      const signals = await runner(ctx, supabase)
      allSignals.push(...signals)
      stages[n].signalCount = signals.length
      log(n, `produced ${signals.length} signals`)
    } catch (e) {
      stages[n].errors.push(e?.message || String(e))
      log(n, `ERROR: ${e?.message || e}`)
      // Stage failure does not abort the pipeline. Each stage's
      // signal absence will be picked up by Stage 6's silence
      // detector. Persistent stage failures are visible in the
      // returned report for ops triage.
    }
  }

  // ─── Stage 6 — silence aggregator ──────────────────────────────
  // Runs against the in-memory signals from this run rather than
  // round-tripping through the DB (which would require persisting
  // first). This is the only stage that reads from the run's
  // accumulated signals; persistence happens after Stage 6.
  stages[6] = { signalCount: 0, errors: [] }
  try {
    const silenceSignals = await runStage6SilenceSignal(ctx, allSignals)
    allSignals.push(...silenceSignals)
    stages[6].signalCount = silenceSignals.length
    log(6, `produced ${silenceSignals.length} silence signals`)
  } catch (e) {
    stages[6].errors.push(e?.message || String(e))
    log(6, `ERROR: ${e?.message || e}`)
  }

  // ─── Persist ───────────────────────────────────────────────────
  if (!dryRun && allSignals.length > 0) {
    const { inserted, error } = await persistSignals(supabase, allSignals)
    if (error) {
      // Persistence failure is fatal — the pipeline ran successfully
      // but the results aren't saved. Surface clearly.
      throw new Error(`persistSignals: ${error}`)
    }
    log('persist', `inserted ${inserted} signals (run_id=${runId})`)

    // Update way_candidates run tracking.
    await supabase
      .from('way_candidates')
      .update({
        last_run_at: new Date().toISOString(),
        run_count: (candidate.run_count || 0) + 1,
        status: candidate.status === 'discovering' ? 'discovering' : candidate.status,
      })
      .eq('id', candidate.id)
  }

  return {
    candidateId: candidate.id,
    runId,
    stages,
    totalSignals: allSignals.length,
    elapsedMs: Date.now() - t0,
  }
}
