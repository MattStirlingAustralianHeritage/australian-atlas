#!/usr/bin/env node
/**
 * scripts/way-places-discovery.mjs
 *
 * Way Atlas Places auto-discovery — CODE PRESENT, NOT ACTIVATED.
 *
 * Per Q3 sign-off (architectural decision 2026-05-XX):
 *   "Places auto-discovery: code present in Phase 2B, but not
 *    activated until Phase 5 calibration confirms the pipeline
 *    works. Auto-discovery flooding the queue before pipeline
 *    verification pollutes the calibration signal."
 *
 * This script is intentionally hard-gated: it refuses to run unless
 * the explicit unlock flag PHASE_5_CALIBRATION_PASSED=true is set in
 * the environment. The flag should only be set after the calibration
 * ceremony in Phase 5 has cleared its three gates.
 *
 * Once activated, the script will:
 *   1. Issue Google Places searches for Way primary types per region
 *      (e.g. "guided walk", "tour operator", "scenic flight" within
 *      a Tasmania bounding box).
 *   2. Filter results to plausible Way candidates (independent
 *      operators only; group-operator pre-filter applied).
 *   3. Insert each into way_candidates with discovery_source='places_auto'.
 *   4. Run the discovery pipeline on each.
 *
 * Until activated, the script exits with a clear message explaining
 * the gate and pointing at scripts/way-discover.mjs (CLI seed) as
 * the active path.
 */

const PHASE_5_GATE = process.env.PHASE_5_CALIBRATION_PASSED === 'true'

if (!PHASE_5_GATE) {
  console.error(`
[way-places-discovery] BLOCKED — Phase 5 calibration gate not cleared.

  Auto-discovery via Google Places is intentionally inactive until
  Phase 5 calibration has confirmed the discovery pipeline produces
  editorially-sane results across n=5, n=20, and n=50 operators.

  Per architectural sign-off 2026-05-XX:
    "Places auto-discovery: code present in Phase 2B, but not
     activated until Phase 5 calibration confirms the pipeline
     works. Auto-discovery flooding the queue before pipeline
     verification pollutes the calibration signal."

  To activate (only after Phase 5 calibration passes):
    PHASE_5_CALIBRATION_PASSED=true \\
      node --env-file=.env.local scripts/way-places-discovery.mjs

  In the meantime, use scripts/way-discover.mjs for editor-curated
  CLI seed runs:

    node --env-file=.env.local scripts/way-discover.mjs \\
      --name "wukalina Walk" \\
      --url "https://wukalinawalk.com.au" \\
      --type cultural_tour --state TAS
`)
  process.exit(2)
}

// ─── Below-gate code: Places search + pipeline integration ─────────
// This block runs only when PHASE_5_CALIBRATION_PASSED=true. The
// implementation is deliberately a skeleton — Phase 5 activation
// will populate the search regions, the per-primary-type queries,
// and the group-operator pre-filter after seeing what the pipeline
// produces during calibration.

import { createClient } from '@supabase/supabase-js'
import { discoverCandidates, isInAustralia } from '../lib/prospector/google-places.js'
import { runWayDiscoveryPipeline } from '../lib/prospector/way-discovery/pipeline.js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const FIELD_URL = process.env.FIELD_SUPABASE_URL
const FIELD_KEY = process.env.FIELD_SUPABASE_SERVICE_KEY
const fieldClient = (FIELD_URL && FIELD_KEY) ? createClient(FIELD_URL, FIELD_KEY) : null

// Skeleton: per-primary-type Places queries. Phase 5 will refine these.
// The keys mirror Way's 17 primary types per Spec §III.
const QUERIES_BY_PRIMARY_TYPE = {
  guided_walk_multiday:    ['multi-day guided walk', 'walking expedition operator'],
  guided_walk_day:         ['guided day walk', 'day hike operator'],
  cultural_tour:           ['Aboriginal-led cultural tour', 'Indigenous-owned tour'],
  scenic_flight:           ['scenic flight operator'],
  helicopter_tour:         ['helicopter tour operator'],
  sailing_charter:         ['sailing charter operator'],
  sea_kayak_tour:          ['sea kayak tour operator'],
  dive_operator:           ['independent dive operator'],
  fishing_guide:           ['fly fishing guide', 'fishing charter'],
  photography_expedition:  ['photography expedition'],
  specialist_natural_history: ['birding tour', 'naturalist guide'],
  foraging_bushfood:       ['foraging walk', 'bush food guide'],
  heritage_tour:           ['lighthouse tour', 'mine tour', 'woolshed tour'],
  workshop_intensive:      ['boat building school', 'traditional cooking school'],
  river_canoe_tour:        ['river canoe tour', 'kayak river guide'],
  horseback_expedition:    ['horseback expedition', 'pack-horse guided trip'],
  four_wheel_drive_expedition: ['4WD expedition', 'owner-operated 4WD tour'],
}

// Skeleton: per-state geographic seeds. Phase 5 will tune coverage.
const STATE_SEEDS = [
  { state: 'TAS', label: 'Tasmania' },
  { state: 'NSW', label: 'New South Wales' },
  { state: 'VIC', label: 'Victoria' },
  { state: 'QLD', label: 'Queensland' },
  { state: 'WA',  label: 'Western Australia' },
  { state: 'SA',  label: 'South Australia' },
  { state: 'NT',  label: 'Northern Territory' },
  { state: 'ACT', label: 'Australian Capital Territory' },
]

// TODO Phase 5: implement the actual Places + pipeline loop here.
// Skeleton signal that activation has cleared the gate but not yet
// run anything — fail loudly so an operator who flips the gate
// without reviewing the implementation can't accidentally flood
// the queue.
console.error(`
[way-places-discovery] Phase 5 gate cleared, but the discovery loop
is still a skeleton. Implement the Places+pipeline integration
before running unsupervised. See QUERIES_BY_PRIMARY_TYPE and
STATE_SEEDS above; the discoverCandidates() helper from
lib/prospector/google-places.js is the existing primitive.
`)
process.exit(3)

// eslint-disable-next-line no-unreachable
async function _runDiscoveryLoop() {  // referenced for IDE find-usages; not invoked
  for (const stateSeed of STATE_SEEDS) {
    for (const [primaryType, queries] of Object.entries(QUERIES_BY_PRIMARY_TYPE)) {
      for (const q of queries) {
        const candidates = await discoverCandidates({
          query: q,
          state: stateSeed.state,
        })
        for (const c of candidates) {
          if (!isInAustralia(c)) continue
          // upsert into way_candidates with discovery_source='places_auto'
          // run runWayDiscoveryPipeline
          // TODO: rate-limiting, dedup, group-operator pre-filter
        }
      }
    }
  }
  // unused references to silence linters during the skeleton phase
  void supabase; void fieldClient; void runWayDiscoveryPipeline
}
