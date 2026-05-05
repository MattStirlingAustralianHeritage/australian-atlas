#!/usr/bin/env node
/**
 * scripts/way-discover.mjs
 *
 * Way Atlas discovery pipeline CLI runner.
 *
 * Two invocation modes:
 *
 *   1. Single operator (one-off):
 *      node --env-file=.env.local scripts/way-discover.mjs \
 *        --name "wukalina Walk" \
 *        --url "https://wukalinawalk.com.au" \
 *        [--type cultural_tour] \
 *        [--region "Tasmania East Coast"] \
 *        [--state TAS] \
 *        [--dry-run]
 *
 *   2. Seed file (CLI seed list, per Q3 sign-off):
 *      node --env-file=.env.local scripts/way-discover.mjs \
 *        --seed-file scripts/data/way-calibration-seeds.json
 *
 *      The seed file is a JSON array of objects with at minimum
 *      `name` and `url`; other fields (type, region, state) are
 *      optional and passed through to the candidate record.
 *
 * Per Q3 sign-off: this CLI is the active discovery input for
 * Phase 2B. Places auto-discovery (scripts/way-places-discovery.mjs)
 * is present but NOT activated until Phase 5 calibration confirms
 * the pipeline. Auto-discovery flooding the queue before pipeline
 * verification would pollute the calibration signal.
 *
 * The script:
 *   1. Resolves or creates a way_candidates row (de-duped on slug
 *      + website_url).
 *   2. Optionally connects a Field Atlas client for Stage 4/5 cross-
 *      references (no-op if FIELD_SUPABASE_URL/_KEY missing).
 *   3. Runs runWayDiscoveryPipeline.
 *   4. Prints a summary report to stdout (JSON).
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { runWayDiscoveryPipeline } from '../lib/prospector/way-discovery/pipeline.js'

// ─── CLI parsing ─────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') out.dryRun = true
    else if (a.startsWith('--name=')) out.name = a.slice('--name='.length)
    else if (a === '--name')      out.name      = argv[++i]
    else if (a.startsWith('--url=')) out.url = a.slice('--url='.length)
    else if (a === '--url')       out.url       = argv[++i]
    else if (a === '--type')      out.type      = argv[++i]
    else if (a === '--region')    out.region    = argv[++i]
    else if (a === '--state')     out.state     = argv[++i]
    else if (a === '--seed-file') out.seedFile  = argv[++i]
    else if (a === '--help' || a === '-h') out.help = true
  }
  return out
}

function usage() {
  return `Way Atlas discovery pipeline.

  Single operator:
    node --env-file=.env.local scripts/way-discover.mjs \\
      --name "wukalina Walk" --url "https://wukalinawalk.com.au" \\
      [--type cultural_tour] [--region "Tasmania East Coast"] \\
      [--state TAS] [--dry-run]

  Seed file (batch):
    node --env-file=.env.local scripts/way-discover.mjs \\
      --seed-file scripts/data/way-calibration-seeds.json
`
}

const args = parseArgs(process.argv.slice(2))
if (args.help || (!args.name && !args.seedFile)) {
  console.error(usage())
  process.exit(args.help ? 0 : 1)
}

// ─── Supabase clients ────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const FIELD_URL = process.env.FIELD_SUPABASE_URL
const FIELD_KEY = process.env.FIELD_SUPABASE_SERVICE_KEY
const fieldClient = (FIELD_URL && FIELD_KEY)
  ? createClient(FIELD_URL, FIELD_KEY)
  : null
if (!fieldClient) {
  console.warn('[way-discover] Field Atlas credentials missing; Stage 4 + 5 will skip Field cross-references')
}

// ─── Candidate resolution ────────────────────────────────────────

function slugify(s) {
  return String(s).toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

async function findOrCreateCandidate({ name, url, type, region, state }) {
  if (!name || !url) {
    throw new Error('findOrCreateCandidate: name and url are both required')
  }
  const slug = slugify(name)

  // Look up by slug or website_url first.
  const { data: existing, error: findErr } = await supabase
    .from('way_candidates')
    .select('*')
    .or(`slug.eq.${slug},website_url.eq.${url}`)
    .limit(1)
  if (findErr) throw new Error(`way_candidates lookup: ${findErr.message}`)

  if (existing && existing.length > 0) return existing[0]

  const { data: created, error: insertErr } = await supabase
    .from('way_candidates')
    .insert({
      name,
      slug,
      website_url: url,
      primary_type_guess: type || null,
      region_hints: region ? [region] : [],
      state: state || null,
      discovery_source: 'cli_seed',
      status: 'discovering',
    })
    .select('*')
    .single()
  if (insertErr) throw new Error(`way_candidates insert: ${insertErr.message}`)
  return created
}

// ─── Single-operator run ─────────────────────────────────────────

async function runOne(seed) {
  const candidate = await findOrCreateCandidate(seed)
  console.error(`[way-discover] running pipeline for ${candidate.name} (${candidate.id})`)
  const result = await runWayDiscoveryPipeline(candidate, supabase, {
    dryRun: args.dryRun,
    fieldClient,
  })
  return { candidate: { id: candidate.id, name: candidate.name, slug: candidate.slug }, result }
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  if (args.seedFile) {
    const text = readFileSync(args.seedFile, 'utf8')
    let seeds
    try { seeds = JSON.parse(text) } catch (e) {
      throw new Error(`seed file ${args.seedFile} is not valid JSON: ${e.message}`)
    }
    if (!Array.isArray(seeds)) throw new Error('seed file must be a JSON array')

    const results = []
    for (const seed of seeds) {
      try {
        results.push(await runOne(seed))
      } catch (e) {
        results.push({ seed, error: e?.message || String(e) })
      }
    }
    console.log(JSON.stringify({ seedCount: seeds.length, results }, null, 2))
    return
  }

  const result = await runOne({
    name:   args.name,
    url:    args.url,
    type:   args.type,
    region: args.region,
    state:  args.state,
  })
  console.log(JSON.stringify(result, null, 2))
}

main().catch((e) => {
  console.error('[way-discover] FATAL:', e?.message || e)
  process.exit(1)
})
