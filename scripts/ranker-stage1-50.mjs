#!/usr/bin/env node

/**
 * scripts/ranker-stage1-50.mjs
 *
 * Set-and-forget Phase 3 Stage 1 ranker run. Picks 50 listings stratified
 * across 5 verticals (sba, craft, rest, table, collection — collection is
 * the DB code for the "Culture" vertical), runs Stage 1 in WRITE mode
 * against each, scores them with the rubric in the user's brief, and
 * writes a markdown report at the project root.
 *
 * IMPORTANT:
 *   - Production mode (no --dry-run). pitch_sources / pitch_characters /
 *     pitch_character_attributes / pitch_signals get written.
 *   - The substring validator (lib/pitch/stage1/validate.mjs) still
 *     rejects invented content at write time as designed.
 *   - 2s delay between listings (polite + spread load on Anthropic).
 *   - 90-minute wall-clock budget. If exceeded, stops and reports
 *     what completed.
 *   - 3 consecutive failures = stop and report what completed.
 *
 * Crash recovery: writes each listing's outcome to a JSONL state file
 * (logs/ranker-state-2026-05-22.jsonl) as it happens. If the script
 * dies mid-run, the DB still has what was inserted and the JSONL has the
 * per-listing audit trail. A second invocation could pick up — but per
 * the brief, this is set-and-forget; one shot.
 *
 * Selection:
 *   - status = 'active'   (the brief said 'published' but this DB uses
 *                          'active'; verified via inventory)
 *   - website IS NOT NULL and passes a real-URL filter (no Google search,
 *     no Instagram-only handles, no Facebook-only)
 *   - Exclude the 5 Gate 1 calibration slugs
 *   - Random within each vertical, 10 per vertical
 *
 * Scoring rubric (per user's brief):
 *   - First character (with primary_source_id): +20
 *   - Each additional character: +5 (cap +15)
 *   - family_history attribute: +10 (cap +20)
 *   - technique attribute: +8 (cap +16)
 *   - quote attribute: +10 (cap +20)
 *   - background attribute: +5 (cap +15)
 *   - recently_opened signal: +10
 *   - first_in_category signal: +15
 *   - founder_pivot signal: +15
 *   - methodology_novelty signal: +12
 *   - unusual_location signal: +8
 *   - award signal: +12 (cap +24)
 *   - Each distinct source URL fetched: +2 (cap +10)
 */

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { runStage1 } from '../lib/pitch/stage1/orchestrate.mjs'

// ── Constants ───────────────────────────────────────────────────────────────

const VERTICALS = ['sba', 'craft', 'rest', 'table', 'collection'] // collection = "Culture"
const PER_VERTICAL = 10
const TOTAL_TARGET = 50
const INTER_LISTING_DELAY_MS = 2_000
const MAX_CONSECUTIVE_FAILURES = 3
const MAX_WALL_TIME_MS = 90 * 60 * 1_000 // 90 minutes
const GATE_1_SLUGS = new Set([
  'black-gate-distillery-mendooran',
  'timboon-distillery',
  'melbourne-tram-museum',
  'apostle-whey-cheese',
  'alkina-lodge',
])

// Friendly names for the report
const VERTICAL_DISPLAY = {
  sba: 'Small Batch',
  craft: 'Craft',
  rest: 'Rest',
  table: 'Table',
  collection: 'Culture (collection)',
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')
const REPORT_PATH = resolve(PROJECT_ROOT, 'dry-run-stage1-ranker-2026-05-22.md')
const STATE_PATH = resolve(PROJECT_ROOT, 'logs/ranker-state-2026-05-22.jsonl')
const FULL_LOG_PATH = resolve(PROJECT_ROOT, 'logs/ranker-run-2026-05-22.log')

// ── Env loading (same pattern as scripts/pitch-generate.mjs) ───────────────

function loadEnv() {
  try {
    const raw = readFileSync(resolve(PROJECT_ROOT, '.env.local'), 'utf-8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (!m) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      process.env[m[1]] = v
    }
  } catch {}
}
loadEnv()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

if (!SUPABASE_URL || !SUPABASE_KEY || !ANTHROPIC_KEY) {
  console.error('Missing required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

// ── Logging ─────────────────────────────────────────────────────────────────

mkdirSync(dirname(FULL_LOG_PATH), { recursive: true })
const logStream = []
function log(level, msg) {
  const stamp = new Date().toISOString()
  const line = `[${stamp}] [${level}] ${msg}`
  logStream.push(line)
  console.log(line)
  try { appendFileSync(FULL_LOG_PATH, line + '\n') } catch {}
}

function appendState(record) {
  try { appendFileSync(STATE_PATH, JSON.stringify(record) + '\n') } catch {}
}

// ── URL filter ──────────────────────────────────────────────────────────────

/**
 * Returns true if the URL looks like a real venue website (not a Google
 * search result, not Instagram-only, not Facebook-only). Permissive enough
 * to accept bare hostnames; the fetcher normalises them.
 */
function isRealUrl(url) {
  if (!url || typeof url !== 'string') return false
  const t = url.trim().toLowerCase()
  if (!t) return false
  // Reject obvious non-website carriers
  if (t.includes('google.com/search') || t.includes('google.com.au/search')) return false
  if (t.includes('instagram.com/')) return false
  if (t.startsWith('https://www.facebook.com') || t.startsWith('https://facebook.com')) return false
  if (t.startsWith('https://m.facebook.com') || t.startsWith('http://facebook.com')) return false
  // Reject placeholder-y values
  if (t === 'n/a' || t === 'tbc' || t === 'tbd') return false
  // Must look domain-shaped if no protocol
  if (!/^https?:\/\//.test(t)) {
    return /^[a-z0-9-]+\.[a-z]{2,}/i.test(t)
  }
  return true
}

// ── Listing picker ─────────────────────────────────────────────────────────

async function pickListings() {
  const picked = []
  for (const vertical of VERTICALS) {
    // Overshoot to give the filter + random sample room. 200 should be
    // safely above what we'll need to throw away.
    const { data, error } = await supabase
      .from('listings')
      .select('id, slug, name, vertical, region, state, website')
      .eq('vertical', vertical)
      .eq('status', 'active')
      .not('website', 'is', null)
      .limit(500)
    if (error) throw new Error(`pickListings(${vertical}): ${error.message}`)
    const eligible = (data ?? []).filter(l => !GATE_1_SLUGS.has(l.slug) && isRealUrl(l.website))
    // Random shuffle, take 10
    const shuffled = eligible.sort(() => Math.random() - 0.5)
    const chosen = shuffled.slice(0, PER_VERTICAL)
    log('info', `picker: ${vertical} — ${data?.length ?? 0} fetched, ${eligible.length} eligible, picked ${chosen.length}`)
    picked.push(...chosen)
  }
  return picked
}

// ── Main run loop ──────────────────────────────────────────────────────────

const RUN_T0 = Date.now()
function wallElapsedMs() { return Date.now() - RUN_T0 }
function wallElapsedMin() { return (wallElapsedMs() / 60_000).toFixed(1) }
function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

async function processListing(listing, index, total) {
  log('info', `[${index}/${total}] ${listing.vertical}/${listing.slug} — starting Stage 1 (elapsed ${wallElapsedMin()}m)`)
  try {
    const summary = await runStage1(listing.id, {
      supabase,
      dryRun: false,
      log: (level, msg) => log(level, `  ${listing.slug}: ${msg}`),
    })
    const stateRecord = {
      listing_id: listing.id,
      slug: listing.slug,
      vertical: listing.vertical,
      name: listing.name,
      region: listing.region,
      state: listing.state,
      website: listing.website,
      kind: summary.kind,
      pages_attempted: summary.pages_attempted,
      pages_fetched: summary.pages_fetched,
      characters_validated: summary.characters_validated,
      attributes_validated: summary.attributes_validated,
      signals_validated: summary.signals_validated,
      sources_inserted: summary.sources_inserted,
      // Capture validator rejections for the "what the model tried to
      // invent" section of the report. Strip large `parent` objects to
      // keep the JSONL human-tractable.
      rejections: (summary.validation?.invalid ?? []).map(r => ({
        kind: r.kind,
        reason: r.reason,
        item: r.item,
        parent_name: r.parent?.name ?? null,
      })),
      error: summary.error ?? null,
      timestamp: new Date().toISOString(),
    }
    appendState(stateRecord)
    log(
      'info',
      `[${index}/${total}] ${listing.slug} -> ${summary.kind}; pages=${summary.pages_fetched}/${summary.pages_attempted}; chars=${summary.characters_validated}; sig=${summary.signals_validated}; sources_inserted=${summary.sources_inserted}`,
    )
    return { ok: summary.kind === 'ok' || summary.kind === 'no_pages_fetched', summary, stateRecord }
  } catch (err) {
    const errMessage = err?.message ?? String(err)
    const stateRecord = {
      listing_id: listing.id,
      slug: listing.slug,
      vertical: listing.vertical,
      kind: 'orchestrator_throw',
      error: errMessage,
      timestamp: new Date().toISOString(),
    }
    appendState(stateRecord)
    log('error', `[${index}/${total}] ${listing.slug} -> orchestrator threw: ${errMessage}`)
    return { ok: false, error: errMessage, stateRecord }
  }
}

// ── Scoring ─────────────────────────────────────────────────────────────────

async function scoreListings(listingIds) {
  // Round-trip 1: sources, characters, signals all keyed by listing_id
  const [sources, characters, signals] = await Promise.all([
    supabase.from('pitch_sources').select('id, listing_id, source_url').in('listing_id', listingIds),
    supabase.from('pitch_characters').select('id, listing_id, name, primary_source_id').in('listing_id', listingIds),
    supabase.from('pitch_signals').select('id, listing_id, signal_type').in('listing_id', listingIds),
  ])
  if (sources.error) throw new Error(`scoreListings.sources: ${sources.error.message}`)
  if (characters.error) throw new Error(`scoreListings.characters: ${characters.error.message}`)
  if (signals.error) throw new Error(`scoreListings.signals: ${signals.error.message}`)

  // Round-trip 2: attributes keyed by character_id (which we now have)
  const characterIds = (characters.data ?? []).map(c => c.id)
  let attrRows = []
  if (characterIds.length > 0) {
    const { data, error } = await supabase
      .from('pitch_character_attributes')
      .select('id, character_id, attribute_type, confidence')
      .in('character_id', characterIds)
    if (error) throw new Error(`scoreListings.attributes: ${error.message}`)
    attrRows = data ?? []
  }

  // Build per-listing index
  const charsByListing = new Map()
  for (const c of characters.data ?? []) {
    const arr = charsByListing.get(c.listing_id) ?? []
    arr.push(c)
    charsByListing.set(c.listing_id, arr)
  }
  const attrsByCharacter = new Map()
  for (const a of attrRows) {
    const arr = attrsByCharacter.get(a.character_id) ?? []
    arr.push(a)
    attrsByCharacter.set(a.character_id, arr)
  }
  const signalsByListing = new Map()
  for (const s of signals.data ?? []) {
    const arr = signalsByListing.get(s.listing_id) ?? []
    arr.push(s)
    signalsByListing.set(s.listing_id, arr)
  }
  const sourcesByListing = new Map()
  for (const s of sources.data ?? []) {
    const set = sourcesByListing.get(s.listing_id) ?? new Set()
    set.add(s.source_url)
    sourcesByListing.set(s.listing_id, set)
  }

  function scoreOne(listingId) {
    const chars = charsByListing.get(listingId) ?? []
    const sigs = signalsByListing.get(listingId) ?? []
    const sourceUrls = sourcesByListing.get(listingId) ?? new Set()

    const breakdown = {}
    let score = 0
    function add(label, n) { breakdown[label] = (breakdown[label] || 0) + n; score += n }

    // Characters
    if (chars.length >= 1) add('first_character', 20)
    if (chars.length > 1) add('extra_characters', Math.min((chars.length - 1) * 5, 15))

    // Aggregate attribute type counts across all characters
    const attrCounts = { family_history: 0, technique: 0, quote: 0, background: 0 }
    for (const c of chars) {
      for (const a of (attrsByCharacter.get(c.id) ?? [])) {
        if (a.attribute_type in attrCounts) attrCounts[a.attribute_type]++
      }
    }
    add('family_history_attrs', Math.min(attrCounts.family_history * 10, 20))
    add('technique_attrs', Math.min(attrCounts.technique * 8, 16))
    add('quote_attrs', Math.min(attrCounts.quote * 10, 20))
    add('background_attrs', Math.min(attrCounts.background * 5, 15))

    // Signals
    const signalCounts = {}
    for (const s of sigs) signalCounts[s.signal_type] = (signalCounts[s.signal_type] || 0) + 1
    if (signalCounts.recently_opened) add('recently_opened', 10)
    if (signalCounts.first_in_category) add('first_in_category', 15)
    if (signalCounts.founder_pivot) add('founder_pivot', 15)
    if (signalCounts.methodology_novelty) add('methodology_novelty', 12)
    if (signalCounts.unusual_location) add('unusual_location', 8)
    if (signalCounts.award) add('award', Math.min(signalCounts.award * 12, 24))

    // Sources
    add('distinct_sources', Math.min(sourceUrls.size * 2, 10))

    return {
      score,
      breakdown,
      character_count: chars.length,
      character_names: chars.map(c => c.name),
      attribute_counts: attrCounts,
      signal_counts: signalCounts,
      source_count: sourceUrls.size,
    }
  }

  const scored = new Map()
  for (const id of listingIds) scored.set(id, scoreOne(id))
  return scored
}

// ── Report ──────────────────────────────────────────────────────────────────

function pad(s, n) { const str = String(s); return str.length >= n ? str : str + ' '.repeat(n - str.length) }

function buildReport({ stateRecords, scored, picked, finishedReason, elapsedMs, rubricCapsExceeded }) {
  const lines = []
  const completedKinds = stateRecords.map(r => r.kind)
  const tally = {}
  for (const k of completedKinds) tally[k] = (tally[k] || 0) + 1

  const totalRejections = stateRecords.reduce((a, r) => a + (r.rejections?.length ?? 0), 0)

  lines.push('# Atlas Ranker — 50-listing sample')
  lines.push('')
  lines.push(`**Date**: 2026-05-22`)
  lines.push(`**Sample size**: ${picked.length} picked, ${stateRecords.length} processed`)
  lines.push(`**Run finished because**: ${finishedReason}`)
  lines.push(`**Total runtime**: ${(elapsedMs / 60_000).toFixed(1)} minutes`)
  lines.push(`**Stage 1 prompt version**: phase3-stage1-v2-2026-05-22`)
  lines.push(`**Validator rejections caught**: ${totalRejections}`)
  lines.push(`**Mode**: PRODUCTION (Stage 1 writes to pitch_sources / pitch_characters / pitch_character_attributes / pitch_signals)`)
  lines.push('')
  lines.push('## Outcome tally')
  lines.push('')
  for (const [k, n] of Object.entries(tally).sort()) lines.push(`- \`${k}\`: ${n}`)
  lines.push('')

  // ── Top 10 ────────────────────────────────────────────────────────────
  const successful = stateRecords.filter(r => r.kind === 'ok')
  const ranked = successful
    .map(r => ({ r, sc: scored.get(r.listing_id) }))
    .filter(x => x.sc)
    .sort((a, b) => b.sc.score - a.sc.score)
  const top10 = ranked.slice(0, 10)

  lines.push('## Top 10')
  lines.push('')
  if (top10.length === 0) {
    lines.push('_No successful extractions; nothing to rank._')
  } else {
    let i = 0
    for (const { r, sc } of top10) {
      i++
      const featureBits = []
      if (sc.character_count > 0) featureBits.push(`${sc.character_count} named character${sc.character_count > 1 ? 's' : ''}`)
      if (sc.attribute_counts.family_history > 0) featureBits.push(`${sc.attribute_counts.family_history} family_history`)
      if (sc.attribute_counts.technique > 0) featureBits.push(`${sc.attribute_counts.technique} technique`)
      if (sc.attribute_counts.quote > 0) featureBits.push(`${sc.attribute_counts.quote} quote`)
      if (sc.signal_counts.award) featureBits.push(`${sc.signal_counts.award} award${sc.signal_counts.award > 1 ? 's' : ''}`)
      if (sc.signal_counts.founder_pivot) featureBits.push('founder_pivot')
      if (sc.signal_counts.first_in_category) featureBits.push('first_in_category')
      if (sc.signal_counts.methodology_novelty) featureBits.push(`${sc.signal_counts.methodology_novelty} methodology_novelty`)
      const featureLine = featureBits.length > 0 ? featureBits.join(', ') : '(signals only — no characters)'

      lines.push(`### ${i}. ${r.name ?? r.slug} — score ${sc.score}`)
      lines.push('')
      lines.push(`- **Vertical**: ${VERTICAL_DISPLAY[r.vertical] ?? r.vertical}`)
      lines.push(`- **Region**: ${r.region ?? '(unknown)'} · ${r.state ?? ''}`)
      lines.push(`- **What's there**: ${featureLine}`)
      if (sc.character_names.length > 0) lines.push(`- **Characters**: ${sc.character_names.join(', ')}`)
      lines.push(`- **Portal**: https://australianatlas.com.au/listings/${r.slug}`)
      lines.push(`- **Website**: ${r.website}`)
      lines.push(`- **Score breakdown**: ${Object.entries(sc.breakdown).filter(([_, v]) => v > 0).map(([k, v]) => `${k}=+${v}`).join(', ')}`)
      lines.push('')
    }
  }

  // ── Full ranked list ──────────────────────────────────────────────────
  lines.push('## Full ranked list')
  lines.push('')
  lines.push('| Rank | Score | Slug | Vertical | Chars | Sig | Sources |')
  lines.push('|---:|---:|---|---|---:|---:|---:|')
  let rk = 0
  for (const { r, sc } of ranked) {
    rk++
    lines.push(`| ${rk} | ${sc.score} | ${r.slug} | ${VERTICAL_DISPLAY[r.vertical] ?? r.vertical} | ${sc.character_count} | ${Object.values(sc.signal_counts).reduce((a, b) => a + b, 0)} | ${sc.source_count} |`)
  }
  lines.push('')

  // ── Score distribution ────────────────────────────────────────────────
  const buckets = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81+': 0 }
  for (const { sc } of ranked) {
    if (sc.score <= 20) buckets['0-20']++
    else if (sc.score <= 40) buckets['21-40']++
    else if (sc.score <= 60) buckets['41-60']++
    else if (sc.score <= 80) buckets['61-80']++
    else buckets['81+']++
  }
  lines.push('## Score distribution')
  lines.push('')
  for (const [b, n] of Object.entries(buckets)) {
    lines.push(`- \`${pad(b, 6)}\` ${'█'.repeat(n)}  (${n})`)
  }
  lines.push('')

  // ── By vertical ───────────────────────────────────────────────────────
  lines.push('## By vertical')
  lines.push('')
  lines.push('| Vertical | Count | Mean score | Median score |')
  lines.push('|---|---:|---:|---:|')
  for (const v of VERTICALS) {
    const inVert = ranked.filter(({ r }) => r.vertical === v)
    if (inVert.length === 0) {
      lines.push(`| ${VERTICAL_DISPLAY[v]} | 0 | — | — |`)
      continue
    }
    const scores = inVert.map(x => x.sc.score).sort((a, b) => a - b)
    const mean = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
    const median = scores.length % 2 === 0
      ? ((scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2).toFixed(1)
      : scores[(scores.length - 1) / 2].toFixed(1)
    lines.push(`| ${VERTICAL_DISPLAY[v]} | ${inVert.length} | ${mean} | ${median} |`)
  }
  lines.push('')

  // ── Validator rejections ──────────────────────────────────────────────
  lines.push('## Validator rejections')
  lines.push('')
  if (totalRejections === 0) {
    lines.push("_The validator did not reject any extracted items in this run. Either the model behaved or every fabrication slipped past the substring check (unlikely given the v2 prompt's tight grounding rules)._")
  } else {
    lines.push(`Total rejections: **${totalRejections}** across ${stateRecords.filter(r => (r.rejections?.length ?? 0) > 0).length} listings.`)
    lines.push('')
    for (const r of stateRecords) {
      if (!r.rejections || r.rejections.length === 0) continue
      lines.push(`### \`${r.slug}\` (${VERTICAL_DISPLAY[r.vertical] ?? r.vertical})`)
      lines.push('')
      for (const rej of r.rejections) {
        const kind = rej.kind
        const parent = rej.parent_name ? ` (parent: ${rej.parent_name})` : ''
        let label = ''
        if (kind === 'character') label = `${rej.item?.name ?? '<unknown>'}`
        else if (kind === 'attribute') label = `${rej.item?.attribute_type ?? '<unknown>'}`
        else if (kind === 'signal') label = `${rej.item?.signal_type ?? '<unknown>'}`
        const excerpt = (rej.item?.source_excerpt ?? '').slice(0, 200)
        lines.push(`- **${kind}**${parent} — ${label} — \`${rej.reason}\``)
        lines.push(`  - excerpt: "${excerpt}${(rej.item?.source_excerpt?.length ?? 0) > 200 ? '…' : ''}"`)
      }
      lines.push('')
    }
  }

  // ── Failures ───────────────────────────────────────────────────────────
  lines.push('## Failures')
  lines.push('')
  const failures = stateRecords.filter(r => r.kind !== 'ok')
  if (failures.length === 0) {
    lines.push('_No failures — every processed listing returned `ok`._')
  } else {
    lines.push(`| Slug | Vertical | Outcome | Pages fetched | Detail |`)
    lines.push(`|---|---|---|---:|---|`)
    for (const f of failures) {
      const detail = (f.error ?? '').slice(0, 200).replace(/\|/g, '\\|').replace(/\n/g, ' ')
      lines.push(`| ${f.slug} | ${VERTICAL_DISPLAY[f.vertical] ?? f.vertical ?? '?'} | ${f.kind} | ${f.pages_fetched ?? 0} | ${detail} |`)
    }
  }
  lines.push('')

  // ── Notes ──────────────────────────────────────────────────────────────
  lines.push('## Notes')
  lines.push('')
  lines.push(`- \`status='active'\` is the DB value (the brief said \`'published'\` but that value doesn't exist on this table; verified via the schema inventory before the run).`)
  lines.push(`- "Culture" maps to the \`collection\` vertical in the DB.`)
  lines.push(`- Picker shuffled randomly within each vertical from the eligible pool. Re-running would produce a different 50.`)
  lines.push(`- Validator stayed on. Invented attributes/signals are dropped before INSERT.`)
  lines.push(`- No rubric tuning between picks. Scoring is a faithful application of the brief.`)
  lines.push('')

  return lines.join('\n')
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  log('info', 'Ranker run starting')
  log('info', `Wall-clock budget: ${MAX_WALL_TIME_MS / 60_000} min`)
  log('info', `Inter-listing delay: ${INTER_LISTING_DELAY_MS} ms`)
  log('info', `Max consecutive failures: ${MAX_CONSECUTIVE_FAILURES}`)

  // ── Pick the listings ─────────────────────────────────────────────────
  log('info', 'Picking listings...')
  const picked = await pickListings()
  log('info', `Picked ${picked.length} listings across ${VERTICALS.length} verticals`)
  writeFileSync(resolve(PROJECT_ROOT, 'logs/ranker-picked-2026-05-22.json'), JSON.stringify(picked, null, 2))
  appendState({ event: 'picked', count: picked.length, timestamp: new Date().toISOString() })

  // ── Process loop ───────────────────────────────────────────────────────
  const stateRecords = []
  let consecutiveFailures = 0
  let finishedReason = 'normal_completion'

  for (let i = 0; i < picked.length; i++) {
    const listing = picked[i]

    // Wall-clock guard
    if (wallElapsedMs() > MAX_WALL_TIME_MS) {
      finishedReason = `wall_clock_exceeded (${wallElapsedMin()}m > 90m budget)`
      log('warn', `Stopping: ${finishedReason}`)
      break
    }

    // 2s pause between listings (skip before the first one)
    if (i > 0) await delay(INTER_LISTING_DELAY_MS)

    const result = await processListing(listing, i + 1, picked.length)
    stateRecords.push(result.stateRecord)

    if (result.ok) {
      consecutiveFailures = 0
    } else {
      consecutiveFailures++
      log('warn', `Consecutive failures: ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}`)
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        // Surface the FULL error response per the brief, then bail.
        const lastN = stateRecords.slice(-MAX_CONSECUTIVE_FAILURES)
        log('error', '── EXACT ERROR RESPONSES FROM CONSECUTIVE FAILURES ──')
        for (const f of lastN) {
          log('error', `  slug=${f.slug} kind=${f.kind}`)
          log('error', `  error: ${f.error ?? '<none>'}`)
        }
        finishedReason = `${MAX_CONSECUTIVE_FAILURES}_consecutive_failures`
        break
      }
    }
  }

  log('info', `Loop done. Elapsed ${wallElapsedMin()}m. Reason: ${finishedReason}`)

  // ── Score ──────────────────────────────────────────────────────────────
  const processedIds = stateRecords.map(r => r.listing_id).filter(Boolean)
  log('info', `Scoring ${processedIds.length} listings...`)
  let scored
  try {
    scored = await scoreListings(processedIds)
  } catch (err) {
    log('error', `Scoring failed: ${err.message}`)
    scored = new Map()
  }
  log('info', `Scored ${scored.size} listings`)

  // ── Write report ───────────────────────────────────────────────────────
  const report = buildReport({
    stateRecords,
    scored,
    picked,
    finishedReason,
    elapsedMs: wallElapsedMs(),
  })
  writeFileSync(REPORT_PATH, report)
  log('info', `Report written: ${REPORT_PATH}`)
  log('info', `State JSONL: ${STATE_PATH}`)
  log('info', `Full log: ${FULL_LOG_PATH}`)
  log('info', 'Done.')
}

main().catch(err => {
  log('error', `Fatal: ${err?.stack ?? err?.message ?? String(err)}`)
  process.exit(1)
})
