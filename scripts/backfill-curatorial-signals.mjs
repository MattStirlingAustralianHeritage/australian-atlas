#!/usr/bin/env node

/**
 * scripts/backfill-curatorial-signals.mjs
 *
 * Backfills five columns on the listings table that were added in
 * migration 106 (the four boolean signal columns) and 028+ (founded_year)
 * but currently have zero populated values across the network. These
 * are the data inputs the pitch system Phase 1 candidate scoring
 * needs to differentiate listings.
 *
 * Columns backfilled:
 *   - is_owner_operator       (boolean)
 *   - independence_confirmed  (boolean)
 *   - single_location         (boolean)
 *   - heritage_significance   (boolean)
 *   - founded_year            (integer)
 *
 * Modes:
 *   --calibrate=N  : sample N listings stratified across all nine
 *                    verticals, run all heuristics, output proposed
 *                    values + source-text excerpts to stdout. NO
 *                    writes. For editor review at the n=20 / n=50
 *                    calibration gates.
 *
 *   --full         : run heuristics on every active listing, write
 *                    populated values to listings + audit row to
 *                    backfill_log. Requires --confirm in addition.
 *
 * Strict source binding: every populated value must trace to a
 * source-text excerpt the editor can re-verify. No value populated
 * by inference alone. Default to NULL when ambiguous. False
 * negatives (missing a TRUE that should have been set) are far
 * less harmful than false positives (setting TRUE on something
 * that isn't).
 *
 * The heuristics scan listings.description ONLY — not description_v2
 * (which holds AI-rewritten staged copy that hasn't been promoted
 * to the published description and is therefore lower-trust as a
 * source) and not ai_description.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── CLI args ─────────────────────────────────────────────────────────

const args = process.argv.slice(2)
function arg(name, defaultVal = null) {
  const prefix = `--${name}=`
  for (const a of args) if (a.startsWith(prefix)) return a.slice(prefix.length)
  return defaultVal
}
function flag(name) { return args.includes(`--${name}`) }

const calibrateN = arg('calibrate') ? parseInt(arg('calibrate'), 10) : null
const fullMode = flag('full')
const confirmFlag = flag('confirm')

if (!calibrateN && !fullMode) {
  console.error('Usage:')
  console.error('  node --env-file=.env.local scripts/backfill-curatorial-signals.mjs --calibrate=20')
  console.error('  node --env-file=.env.local scripts/backfill-curatorial-signals.mjs --calibrate=50')
  console.error('  node --env-file=.env.local scripts/backfill-curatorial-signals.mjs --full --confirm')
  process.exit(1)
}
if (fullMode && !confirmFlag) {
  console.error('--full requires --confirm. Refusing to write without explicit confirmation.')
  process.exit(1)
}

const VERTICALS = ['sba', 'collection', 'craft', 'fine_grounds', 'rest', 'field', 'corner', 'found', 'table']

// ── Source-text excerpt helper ───────────────────────────────────────

function excerpt(text, matchIndex, matchLength, padding = 40) {
  if (!text || matchIndex == null) return null
  const start = Math.max(0, matchIndex - padding)
  const end = Math.min(text.length, matchIndex + matchLength + padding)
  let snippet = text.slice(start, end).replace(/\s+/g, ' ').trim()
  if (start > 0) snippet = '…' + snippet
  if (end < text.length) snippet = snippet + '…'
  return snippet
}

// ── Heuristic: founded_year ──────────────────────────────────────────
// Match a year (1700-current) adjacent to a founding verb. Bare years
// in description (vintage references, current events) are not enough.

const CURRENT_YEAR = new Date().getFullYear()

const FOUNDED_YEAR_PATTERNS = [
  {
    name: 'verb_then_year',
    // "founded 1955", "established in 1850", "opened its doors in 1995",
    // "since 1900", "planted here in 1955", "started in 1990"
    regex: /\b(established|estd\.?|founded|opened|launched|started|planted|since|opened\s+(?:its\s+)?doors)\s+(?:in\s+|here\s+in\s+|its\s+doors\s+in\s+)?((?:1[789]|20)\d{2})\b/i,
    yearGroup: 2,
  },
  {
    name: 'year_then_verb',
    // "in 1955 [name] planted...", "1850 saw the founding of"
    regex: /\bin\s+((?:1[789]|20)\d{2})\b[^.]{0,50}?\b(?:planted|opened|founded|established|started|launched|built)\b/i,
    yearGroup: 1,
  },
  {
    name: 'year_with_founder_phrase',
    // "[Name] planted here in 1955" — same as year_then_verb but without leading "in"
    regex: /\b(?:planted|opened|founded|established|started|launched|built)(?:\s+(?:here|its\s+doors))?\s+(?:in\s+)?((?:1[789]|20)\d{2})\b/i,
    yearGroup: 1,
  },
]

function extractFoundedYear(desc) {
  if (!desc) return { value: null, source_excerpt: null, heuristic: 'no_description' }
  const matches = []
  for (const p of FOUNDED_YEAR_PATTERNS) {
    const m = desc.match(p.regex)
    if (!m) continue
    const year = parseInt(m[p.yearGroup], 10)
    if (year < 1700 || year > CURRENT_YEAR) continue
    matches.push({
      year,
      heuristic: p.name,
      excerpt: excerpt(desc, m.index, m[0].length),
    })
  }
  if (matches.length === 0) return { value: null, source_excerpt: null, heuristic: 'no_match' }
  // Conflict resolution: if patterns disagree on year, return NULL (ambiguous).
  const distinct = [...new Set(matches.map(m => m.year))]
  if (distinct.length > 1) {
    return {
      value: null,
      source_excerpt: matches.map(m => `${m.year}: ${m.excerpt}`).join(' || '),
      heuristic: 'conflicting_years',
    }
  }
  // Single year matched (possibly by multiple patterns). Use the first match.
  return {
    value: matches[0].year,
    source_excerpt: matches[0].excerpt,
    heuristic: matches[0].heuristic,
  }
}

// ── Heuristic: is_owner_operator ─────────────────────────────────────
// TRUE only on explicit owner-operator language. NULL otherwise.

const OWNER_OPERATOR_PATTERNS = [
  { name: 'family_run',         regex: /\bfamily[- ](?:run|owned|operation|business)\b/i },
  { name: 'family_owned_phrase',regex: /\bfamily[- ]owned\s+and\s+operated\b/i },
  { name: 'husband_and_wife',   regex: /\b(?:husband[- ]and[- ]wife|wife[- ]and[- ]husband)\b/i },
  { name: 'parent_child_pair',  regex: /\b(?:father[- ]and[- ]son|son[- ]and[- ]father|mother[- ]and[- ]daughter|daughter[- ]and[- ]mother|father[- ]and[- ]daughter|mother[- ]and[- ]son)\b/i },
  { name: 'owner_operated',     regex: /\bowner[- ](?:operator|operated)\b/i },
  { name: 'multi_generation',   regex: /\b(?:second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|2nd|3rd|4th|5th|6th|7th|8th)[- ]generation\b/i },
  // Plural-form multi-generation, anchored to a family or activity word so
  // we don't match bare "generations of customers" / "generations of
  // Australians" (per editor decision 2026-04-30).
  { name: 'multi_generation_plural',
    regex: /\b(?:two|three|four|five|six|seven|eight)\s+generations?\s+of\s+(?:the\s+[A-Z]\w+|farming|making|brewing|distilling|baking|growing|the\s+family|family)\b/i },
]

// Owner-operator heuristic scans description AND curation_review.reasoning.
// Per editor decision 2026-04-30: curator-written reasoning is a reliable
// source for ownership signals that the public description sometimes
// doesn't repeat. Source excerpt tags which field the match came from.
function extractIsOwnerOperator(desc, curationReasoning) {
  if (desc) {
    for (const p of OWNER_OPERATOR_PATTERNS) {
      const m = desc.match(p.regex)
      if (m) {
        return {
          value: true,
          source_excerpt: 'description: ' + excerpt(desc, m.index, m[0].length),
          heuristic: p.name,
        }
      }
    }
  }
  if (curationReasoning) {
    for (const p of OWNER_OPERATOR_PATTERNS) {
      const m = curationReasoning.match(p.regex)
      if (m) {
        return {
          value: true,
          source_excerpt: 'curation_review.reasoning: ' + excerpt(curationReasoning, m.index, m[0].length),
          heuristic: p.name + '_in_curation',
        }
      }
    }
  }
  return { value: null, source_excerpt: null, heuristic: 'no_match' }
}

// ── Heuristic: independence_confirmed ────────────────────────────────
// TRUE if curation_review has YAY or SOFT_YAY for the listing (latest
// record per listing). NULL otherwise.

function extractIndependenceConfirmed(curationLatest) {
  if (!curationLatest) return { value: null, source_excerpt: null, heuristic: 'no_curation_record' }
  if (curationLatest.decision === 'YAY' || curationLatest.decision === 'SOFT_YAY') {
    const reasoning = (curationLatest.reasoning || '').slice(0, 200)
    return {
      value: true,
      source_excerpt: `curation_review.decision=${curationLatest.decision} ${reasoning ? '· reasoning: ' + reasoning : ''}`.trim(),
      heuristic: `curation_review_${curationLatest.decision.toLowerCase()}`,
    }
  }
  return { value: null, source_excerpt: null, heuristic: `curation_review_${curationLatest.decision || 'unknown'}` }
}

// ── Heuristic: single_location ───────────────────────────────────────
// TRUE only on POSITIVE single-location language. NULL by default.
// Per editor decision: false negatives are safe, false positives aren't.

const SINGLE_LOCATION_PATTERNS = [
  { name: 'only_location',  regex: /\bour\s+(?:only|sole|single)\s+(?:location|venue|store|shop|studio|cellar\s+door|premises)\b/i },
  { name: 'one_location',   regex: /\bone\s+(?:location|venue|store|shop)\b/i },
  { name: 'based_solely',   regex: /\bbased\s+(?:solely|only)\s+(?:in|at)\b/i },
  { name: 'sole_premises',  regex: /\bsole\s+(?:premises|outlet)\b/i },
]

function extractSingleLocation(desc) {
  if (!desc) return { value: null, source_excerpt: null, heuristic: 'no_description' }
  for (const p of SINGLE_LOCATION_PATTERNS) {
    const m = desc.match(p.regex)
    if (m) {
      return { value: true, source_excerpt: excerpt(desc, m.index, m[0].length), heuristic: p.name }
    }
  }
  return { value: null, source_excerpt: null, heuristic: 'no_match' }
}

// ── Heuristic: heritage_significance ─────────────────────────────────
// TRUE if founded_year < 1970 OR explicit heritage phrases present.

const HERITAGE_PATTERNS = [
  { name: 'heritage_listed',     regex: /\bheritage[- ]listed\b/i },
  { name: 'national_trust',      regex: /\bnational\s+trust\b/i },
  { name: 'heritage_significance_phrase', regex: /\bheritage[- ]significan(?:t|ce)\b/i },
  { name: 'historic_venue',      regex: /\bhistoric(?:al)?\s+(?:building|site|property|venue|pub|hotel|cottage|homestead|estate)\b/i },
  { name: 'multi_generation_3plus', regex: /\b(?:third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|3rd|4th|5th|6th|7th|8th)[- ]generation\b/i },
  // Plural-form 3+ generations, anchored to family or activity (per the
  // same family/activity guard used for is_owner_operator). Heritage
  // requires three or more generations — two generations doesn't qualify
  // by age alone.
  { name: 'multi_generation_3plus_plural',
    regex: /\b(?:three|four|five|six|seven|eight)\s+generations?\s+of\s+(?:the\s+[A-Z]\w+|farming|making|brewing|distilling|baking|growing|the\s+family|family)\b/i },
]

// Heritage heuristic scans description AND curation_review.reasoning,
// after first checking for a pre-1970 founded_year derived earlier.
function extractHeritageSignificance(desc, foundedYear, curationReasoning) {
  // Year-derived: pre-1970 founded year is heritage by age
  if (foundedYear && foundedYear < 1970) {
    return {
      value: true,
      source_excerpt: `founded_year=${foundedYear} (pre-1970)`,
      heuristic: 'founded_year_pre_1970',
    }
  }
  if (desc) {
    for (const p of HERITAGE_PATTERNS) {
      const m = desc.match(p.regex)
      if (m) {
        return {
          value: true,
          source_excerpt: 'description: ' + excerpt(desc, m.index, m[0].length),
          heuristic: p.name,
        }
      }
    }
  }
  if (curationReasoning) {
    for (const p of HERITAGE_PATTERNS) {
      const m = curationReasoning.match(p.regex)
      if (m) {
        return {
          value: true,
          source_excerpt: 'curation_review.reasoning: ' + excerpt(curationReasoning, m.index, m[0].length),
          heuristic: p.name + '_in_curation',
        }
      }
    }
  }
  return { value: null, source_excerpt: null, heuristic: 'no_match' }
}

// ── Loaders ──────────────────────────────────────────────────────────

async function loadListings(verticalFilter = null, sampleSize = null) {
  // Paginated fetch (PostgREST 1000-row cap).
  const PAGE_SIZE = 1000
  const all = []
  let offset = 0
  while (true) {
    let q = supabase
      .from('listings')
      .select('id, name, slug, vertical, description, region, state, suburb, founded_year, is_owner_operator, independence_confirmed, single_location, heritage_significance')
      .eq('status', 'active')
      .neq('needs_review', true)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (verticalFilter) q = q.eq('vertical', verticalFilter)
    const { data, error } = await q
    if (error) throw new Error(`listings load failed (offset ${offset}): ${error.message}`)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  if (sampleSize && sampleSize < all.length) {
    return shuffleStable(all).slice(0, sampleSize)
  }
  return all
}

async function loadCurationLatestByListing() {
  // Latest curation_review record per listing (by created_at desc).
  // Returns Map<listing_id, {decision, reasoning, created_at}>.
  const PAGE_SIZE = 1000
  const all = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('curation_review')
      .select('listing_id, decision, reasoning, created_at')
      .order('listing_id', { ascending: true })
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(`curation_review load failed (offset ${offset}): ${error.message}`)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  // First record per listing_id is the latest (we sorted by created_at desc).
  const map = new Map()
  for (const r of all) {
    if (!map.has(r.listing_id)) map.set(r.listing_id, r)
  }
  return map
}

// Stable shuffle (deterministic, seed = 'atlas-pitch-backfill').
// For calibration reproducibility — same listings sampled across runs.
function shuffleStable(arr) {
  // Simple LCG-seeded Fisher-Yates. Output deterministic for a given input order.
  let seed = 0xA710
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ── Stratified sampling for calibration ──────────────────────────────

function stratifiedSample(listingsByVertical, totalN) {
  // Pick at least 1 from each vertical that has any listings; allocate the
  // rest proportionally, capped per vertical at the available count.
  const verticals = VERTICALS.filter(v => (listingsByVertical[v] || []).length > 0)
  const baselinePerVertical = Math.max(1, Math.floor(totalN / verticals.length))
  const remainder = Math.max(0, totalN - baselinePerVertical * verticals.length)

  // Distribute baseline + extras (extras go to verticals with the largest pools)
  const sortedByPool = [...verticals].sort((a, b) =>
    (listingsByVertical[b].length - listingsByVertical[a].length))
  const extras = {}
  for (let i = 0; i < remainder; i++) {
    const v = sortedByPool[i % sortedByPool.length]
    extras[v] = (extras[v] || 0) + 1
  }

  const out = []
  for (const v of verticals) {
    const n = Math.min(baselinePerVertical + (extras[v] || 0), listingsByVertical[v].length)
    const shuffled = shuffleStable(listingsByVertical[v])
    out.push(...shuffled.slice(0, n))
  }
  return out
}

// ── Heuristic runner ─────────────────────────────────────────────────

function runHeuristics(listing, curationLatest) {
  const desc = listing.description || ''
  const curationReasoning = curationLatest?.reasoning || ''
  const foundedYear = extractFoundedYear(desc)
  const owner = extractIsOwnerOperator(desc, curationReasoning)
  const independence = extractIndependenceConfirmed(curationLatest)
  const single = extractSingleLocation(desc)
  const heritage = extractHeritageSignificance(desc, foundedYear.value, curationReasoning)
  return {
    founded_year: foundedYear,
    is_owner_operator: owner,
    independence_confirmed: independence,
    single_location: single,
    heritage_significance: heritage,
  }
}

// ── Output formatting ────────────────────────────────────────────────

function formatCalibrationOutput(listing, current, proposed) {
  const lines = []
  lines.push('────────────────────────────────────────────────────────────────')
  lines.push(`${listing.name}  ·  ${listing.vertical}  ·  ${listing.region || '?'}, ${listing.state || '?'}  ·  id=${listing.id.slice(0, 8)}`)
  if (listing.description) {
    lines.push(`description (${listing.description.length} chars): ${listing.description.slice(0, 240)}${listing.description.length > 240 ? '…' : ''}`)
  } else {
    lines.push('description: (empty)')
  }
  lines.push('')
  for (const col of ['founded_year', 'is_owner_operator', 'independence_confirmed', 'single_location', 'heritage_significance']) {
    const cur = current[col] === null || current[col] === undefined ? 'NULL' : String(current[col])
    const prop = proposed[col]
    const propStr = prop.value === null || prop.value === undefined ? 'NULL' : String(prop.value)
    const change = (cur !== propStr) ? '  ←' : ''
    lines.push(`  ${col.padEnd(24)} current: ${cur.padEnd(6)}  proposed: ${propStr.padEnd(6)}${change}`)
    if (prop.source_excerpt) {
      lines.push(`    heuristic: ${prop.heuristic}`)
      lines.push(`    source:    ${prop.source_excerpt}`)
    } else if (prop.heuristic !== 'no_match' && prop.heuristic !== 'no_description' && prop.heuristic !== 'no_curation_record') {
      lines.push(`    heuristic: ${prop.heuristic}`)
    }
  }
  return lines.join('\n')
}

// ── Calibration mode ─────────────────────────────────────────────────

async function runCalibrate(n) {
  process.stderr.write(`Calibration mode: n=${n} stratified across ${VERTICALS.length} verticals (read-only).\n\n`)

  const [allListings, curationMap] = await Promise.all([
    loadListings(),
    loadCurationLatestByListing(),
  ])

  // Group by vertical
  const byVertical = {}
  for (const v of VERTICALS) byVertical[v] = []
  for (const L of allListings) {
    if (byVertical[L.vertical]) byVertical[L.vertical].push(L)
  }

  const sample = stratifiedSample(byVertical, n)

  const stats = { count: sample.length, by_column: {}, by_vertical: {} }
  for (const col of ['founded_year', 'is_owner_operator', 'independence_confirmed', 'single_location', 'heritage_significance']) {
    stats.by_column[col] = { proposed_non_null: 0 }
  }
  for (const v of VERTICALS) stats.by_vertical[v] = 0

  for (const L of sample) {
    const proposed = runHeuristics(L, curationMap.get(L.id))
    const current = {
      founded_year: L.founded_year,
      is_owner_operator: L.is_owner_operator,
      independence_confirmed: L.independence_confirmed,
      single_location: L.single_location,
      heritage_significance: L.heritage_significance,
    }
    console.log(formatCalibrationOutput(L, current, proposed))
    for (const col of Object.keys(stats.by_column)) {
      if (proposed[col].value !== null && proposed[col].value !== undefined) {
        stats.by_column[col].proposed_non_null++
      }
    }
    stats.by_vertical[L.vertical] = (stats.by_vertical[L.vertical] || 0) + 1
  }

  console.log('')
  console.log('════════════════════════════════════════════════════════════════')
  console.log('Calibration summary')
  console.log('════════════════════════════════════════════════════════════════')
  console.log(`  Sample size: ${stats.count}`)
  console.log('')
  console.log('  Sample by vertical:')
  for (const v of Object.keys(stats.by_vertical)) {
    if (stats.by_vertical[v] > 0) console.log(`    ${v.padEnd(14)} ${stats.by_vertical[v]}`)
  }
  console.log('')
  console.log('  Proposed non-null values per column:')
  for (const col of Object.keys(stats.by_column)) {
    console.log(`    ${col.padEnd(24)} ${stats.by_column[col].proposed_non_null} of ${stats.count}`)
  }
}

// ── Full mode (writes) ───────────────────────────────────────────────

async function runFull() {
  process.stderr.write('Full backfill mode. Writing to listings + backfill_log.\n\n')

  const [allListings, curationMap] = await Promise.all([
    loadListings(),
    loadCurationLatestByListing(),
  ])

  process.stderr.write(`Loaded ${allListings.length} listings, ${curationMap.size} curation records.\n`)

  const updates = []
  const logs = []

  // Boolean signal columns (is_owner_operator, independence_confirmed,
  // single_location, heritage_significance) — only an explicit TRUE counts
  // as "already set." NULL and FALSE both mean "no positive signal yet"
  // and are eligible to be set TRUE by the heuristic.
  // founded_year (integer) — any populated value is treated as set; we
  // don't overwrite an existing year.
  const BOOLEAN_SIGNAL_COLUMNS = new Set([
    'is_owner_operator',
    'independence_confirmed',
    'single_location',
    'heritage_significance',
  ])

  for (const L of allListings) {
    const proposed = runHeuristics(L, curationMap.get(L.id))
    const patch = {}
    for (const col of ['founded_year', 'is_owner_operator', 'independence_confirmed', 'single_location', 'heritage_significance']) {
      const prop = proposed[col]
      const cur = L[col]
      if (prop.value === null || prop.value === undefined) continue
      // Skip if already set to a positive signal.
      // For booleans: only TRUE counts as set (FALSE is the default).
      // For founded_year: any non-null value counts.
      if (BOOLEAN_SIGNAL_COLUMNS.has(col)) {
        if (cur === true) continue
      } else {
        if (cur !== null && cur !== undefined) continue
      }
      patch[col] = prop.value
      logs.push({
        listing_id: L.id,
        column_name: col,
        old_value: cur === null || cur === undefined ? null : String(cur),
        new_value: String(prop.value),
        source_text_excerpt: prop.source_excerpt,
        heuristic_used: prop.heuristic,
      })
    }
    if (Object.keys(patch).length > 0) {
      updates.push({ id: L.id, patch })
    }
  }

  process.stderr.write(`Updates planned: ${updates.length} listings, ${logs.length} log rows.\n`)

  // Apply updates in batches. supabase-js can handle one PATCH per listing;
  // for ~6500 listings worst case, send sequentially with a small delay
  // budget. Concurrent writes via Promise.all in chunks of 50.
  const CHUNK = 50
  let written = 0
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK)
    await Promise.all(chunk.map(u =>
      supabase.from('listings').update(u.patch).eq('id', u.id)
        .then(({ error }) => {
          if (error) throw new Error(`listings update failed for ${u.id}: ${error.message}`)
        })
    ))
    written += chunk.length
    process.stderr.write(`  listings updated: ${written}/${updates.length}\r`)
  }
  process.stderr.write('\n')

  // Insert log rows in batches.
  const LOG_CHUNK = 500
  let logged = 0
  for (let i = 0; i < logs.length; i += LOG_CHUNK) {
    const chunk = logs.slice(i, i + LOG_CHUNK)
    const { error } = await supabase.from('backfill_log').insert(chunk)
    if (error) throw new Error(`backfill_log insert failed at batch ${i / LOG_CHUNK}: ${error.message}`)
    logged += chunk.length
    process.stderr.write(`  backfill_log rows: ${logged}/${logs.length}\r`)
  }
  process.stderr.write('\n')

  console.log(JSON.stringify({
    listings_updated: updates.length,
    backfill_log_rows: logs.length,
    by_column: logs.reduce((acc, l) => {
      acc[l.column_name] = (acc[l.column_name] || 0) + 1
      return acc
    }, {}),
  }, null, 2))
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  if (calibrateN) {
    await runCalibrate(calibrateN)
  } else if (fullMode) {
    await runFull()
  }
}

main().catch(e => {
  console.error(e.stack || e.message || String(e))
  process.exit(1)
})
