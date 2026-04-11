/**
 * Prospector Pipeline Runner
 *
 * Takes a candidate object, runs gates 0-4 sequentially,
 * stops at first failure, and writes outcomes to the appropriate tables.
 *
 * Usage:
 *   import { runPipeline } from '@/lib/prospector/pipeline'
 *   const result = await runPipeline(candidate, supabase)
 *
 * Pipeline:
 *   Gate 0 (dedup) -> Gate 1 (web) -> Gate 2 (address) -> Gate 3 (activity) -> Gate 4 (vertical fit) -> Score -> Queue
 */

import { gate0Dedup, gate1WebPresence, gate2AddressRegion, gate3BusinessActivity, gate4VerticalFit } from './gates.js'
import { calculateScore } from './scoring.js'

const GATE_NAMES = ['Deduplication', 'Web Presence', 'Address/Region', 'Business Activity', 'Vertical Fit']

// ─── Google Places category pre-filter (before Gate 4) ────────
// Kills obvious vertical mismatches using Google's own categorisation,
// before the expensive Claude API call in Gate 4.
//
// Returns { pass: true } or { pass: false, reason: string }

// SBA must have at least one alcohol-related Google type
const SBA_ALLOW_TYPES = ['brewery', 'winery', 'distillery', 'bar', 'liquor_store', 'night_club']
// SBA must NOT have these as primary signals (food producers)
const SBA_BLOCK_TYPES = [
  'restaurant', 'food', 'grocery_or_supermarket', 'bakery', 'meal_delivery',
  'meal_takeaway', 'cafe', 'supermarket', 'convenience_store',
]

function preFilterGoogleCategories(candidate) {
  const types = candidate.google_places_data?.types || []
  if (types.length === 0) return { pass: true } // no data — let Gate 4 decide

  const vertical = candidate.vertical

  if (vertical === 'sba') {
    const hasAlcoholType = types.some(t => SBA_ALLOW_TYPES.some(a => t.includes(a)))
    const hasFoodType = types.some(t => SBA_BLOCK_TYPES.some(b => t === b))

    // If Google categorises this primarily as food and NOT as alcohol → disqualify
    if (hasFoodType && !hasAlcoholType) {
      return {
        pass: false,
        reason: `Non-alcohol food producer (Google types: ${types.slice(0, 5).join(', ')}) — likely Table Atlas candidate`,
      }
    }
  }

  return { pass: true }
}

/**
 * Run the full quality gate pipeline on a single candidate.
 *
 * @param {object} candidate - { name, website_url, vertical, region, notes, ... }
 * @param {object} supabase - Supabase admin client
 * @param {object} options - { dryRun: false, verbose: false }
 * @returns {{
 *   passed: boolean,
 *   gateResults: object,
 *   failedGate: number|null,
 *   failReason: string|null,
 *   score: number|null,
 *   scoreBreakdown: object|null,
 *   candidateId: string|null,
 * }}
 */
export async function runPipeline(candidate, supabase, options = {}) {
  const { dryRun = false, verbose = false } = options

  const gateResults = {}
  let websiteText = null
  let websiteUrl = candidate.website_url || null
  let lastModified = null

  const log = verbose ? (...args) => console.log('  [pipeline]', ...args) : () => {}

  // ─── Gate 0: Deduplication ───────────────────────────────
  log(`Gate 0: Checking deduplication for "${candidate.name}"...`)
  const g0 = await gate0Dedup(candidate, supabase)
  gateResults.gate0 = { name: 'Deduplication', ...g0 }

  if (!g0.pass) {
    log(`Gate 0 FAILED: ${g0.reason}`)
    if (!dryRun) {
      await writeDisqualification(supabase, candidate, 0, g0.reason, g0.details)
    }
    return buildResult(false, gateResults, 0, g0.reason)
  }
  log('Gate 0 PASSED')

  // ─── Gate 1: Web Presence ────────────────────────────────
  log(`Gate 1: Verifying web presence...`)
  const g1 = await gate1WebPresence(candidate)
  gateResults.gate1 = { name: 'Web Presence', ...g1 }

  if (!g1.pass) {
    log(`Gate 1 FAILED: ${g1.reason}`)
    if (!dryRun) {
      await writeDisqualification(supabase, candidate, 1, g1.reason, g1.details)
    }
    return buildResult(false, gateResults, 1, g1.reason)
  }

  // Capture website data for downstream gates
  websiteText = g1.websiteText || null
  websiteUrl = g1.websiteUrl || websiteUrl
  lastModified = g1.lastModified || null
  log(`Gate 1 PASSED — ${g1.details?.urlChecked || 'URL verified'}`)

  // ─── Gate 2: Address and Region ──────────────────────────
  log(`Gate 2: Verifying address and region...`)
  const g2 = await gate2AddressRegion(candidate, websiteText)
  gateResults.gate2 = { name: 'Address/Region', ...g2 }

  if (!g2.pass) {
    log(`Gate 2 FAILED: ${g2.reason}`)
    if (!dryRun) {
      await writeDisqualification(supabase, candidate, 2, g2.reason, g2.details)
    }
    return buildResult(false, gateResults, 2, g2.reason)
  }
  log(`Gate 2 PASSED${g2.details?.placeName ? ` — ${g2.details.placeName}` : ''}`)

  // ─── Gate 3: Business Activity ───────────────────────────
  log(`Gate 3: Checking business activity signals...`)
  const g3 = await gate3BusinessActivity(candidate, websiteText, lastModified)
  gateResults.gate3 = { name: 'Business Activity', ...g3 }

  if (!g3.pass) {
    log(`Gate 3 FAILED: ${g3.reason}`)
    if (!dryRun) {
      await writeDisqualification(supabase, candidate, 3, g3.reason, g3.details)
    }
    return buildResult(false, gateResults, 3, g3.reason)
  }
  log(`Gate 3 PASSED — ${g3.details?.signalCount || 0} activity signals`)

  // ─── Pre-filter: Google Places category check ───────────
  // Cheap check before the expensive Claude API call in Gate 4
  const preFilter = preFilterGoogleCategories(candidate)
  if (!preFilter.pass) {
    log(`Pre-filter BLOCKED: ${preFilter.reason}`)
    gateResults.gate4 = { name: 'Vertical Fit', pass: false, reason: preFilter.reason, details: { preFilterBlocked: true } }
    if (!dryRun) {
      await writeDisqualification(supabase, candidate, 4, preFilter.reason, { preFilterBlocked: true, googleTypes: candidate.google_places_data?.types || [] })
    }
    return buildResult(false, gateResults, 4, preFilter.reason)
  }

  // ─── Gate 4: Vertical Fit ───────────────────────────────
  log(`Gate 4: Classifying vertical fit...`)
  const g4 = await gate4VerticalFit(candidate, websiteText)
  gateResults.gate4 = { name: 'Vertical Fit', ...g4 }

  if (!g4.pass) {
    log(`Gate 4 FAILED: ${g4.reason}`)
    if (!dryRun) {
      await writeDisqualification(supabase, candidate, 4, g4.reason, g4.details)

      // If wrong vertical, also write to candidates_wrong_vertical
      if (g4.wrongVertical) {
        await writeWrongVertical(supabase, g4.wrongVertical)
      }
    }
    return buildResult(false, gateResults, 4, g4.reason)
  }
  log(`Gate 4 PASSED — ${g4.details?.confidence ? Math.round(g4.details.confidence * 100) + '%' : 'verified'}`)

  // ─── All gates passed — calculate score ──────────────────
  const { score, breakdown } = calculateScore(gateResults)
  log(`Score: ${score}/100`)

  // Build gate_results for storage on the candidate row
  const gateResultsSummary = buildGateResultsSummary(gateResults, score, breakdown)

  // Write to listing_candidates with status 'pending'
  let candidateId = candidate.id || null
  if (!dryRun) {
    candidateId = await writeCandidate(supabase, candidate, score, websiteUrl, gateResultsSummary)
  }

  return {
    passed: true,
    gateResults,
    failedGate: null,
    failReason: null,
    score,
    scoreBreakdown: breakdown,
    candidateId,
    websiteUrl,
  }
}

/**
 * Re-run gates on an existing candidate already in the queue.
 * Used by the re-run endpoint to filter out candidates that no longer pass.
 *
 * @param {object} candidate - Full candidate row from listing_candidates
 * @param {object} supabase - Supabase admin client
 * @returns {{ passed: boolean, failedGate: number|null, failReason: string|null, gateResults: object }}
 */
export async function rerunGates(candidate, supabase) {
  const gateResults = {}

  // Gate 0
  const g0 = await gate0Dedup(candidate, supabase)
  gateResults.gate0 = { name: 'Deduplication', ...g0 }
  if (!g0.pass) {
    return { passed: false, failedGate: 0, failReason: g0.reason, gateResults }
  }

  // Gate 1
  const g1 = await gate1WebPresence(candidate)
  gateResults.gate1 = { name: 'Web Presence', ...g1 }
  if (!g1.pass) {
    return { passed: false, failedGate: 1, failReason: g1.reason, gateResults }
  }

  const websiteText = g1.websiteText || null
  const lastModified = g1.lastModified || null

  // Gate 2
  const g2 = await gate2AddressRegion(candidate, websiteText)
  gateResults.gate2 = { name: 'Address/Region', ...g2 }
  if (!g2.pass) {
    return { passed: false, failedGate: 2, failReason: g2.reason, gateResults }
  }

  // Gate 3
  const g3 = await gate3BusinessActivity(candidate, websiteText, lastModified)
  gateResults.gate3 = { name: 'Business Activity', ...g3 }
  if (!g3.pass) {
    return { passed: false, failedGate: 3, failReason: g3.reason, gateResults }
  }

  // Pre-filter: Google Places category check
  const preFilter = preFilterGoogleCategories(candidate)
  if (!preFilter.pass) {
    gateResults.gate4 = { name: 'Vertical Fit', pass: false, reason: preFilter.reason, details: { preFilterBlocked: true } }
    return { passed: false, failedGate: 4, failReason: preFilter.reason, gateResults }
  }

  // Gate 4
  const g4 = await gate4VerticalFit(candidate, websiteText)
  gateResults.gate4 = { name: 'Vertical Fit', ...g4 }
  if (!g4.pass) {
    return { passed: false, failedGate: 4, failReason: g4.reason, gateResults, wrongVertical: g4.wrongVertical || null }
  }

  // Recalculate score
  const { score, breakdown } = calculateScore(gateResults)

  return {
    passed: true,
    failedGate: null,
    failReason: null,
    gateResults,
    score,
    scoreBreakdown: breakdown,
  }
}

// ─── Internal Helpers ────────────────────────────────────────

function buildResult(passed, gateResults, failedGate, failReason) {
  return {
    passed,
    gateResults,
    failedGate,
    failReason,
    score: null,
    scoreBreakdown: null,
    candidateId: null,
  }
}

/**
 * Build a compact summary of gate results for storage in the candidate row.
 */
function buildGateResultsSummary(gateResults, score, breakdown) {
  const summary = { score, breakdown, gates: {} }

  for (const [key, result] of Object.entries(gateResults)) {
    summary.gates[key] = {
      name: result.name,
      pass: result.pass,
      details: result.details || {},
    }
    // Add display-friendly fields
    if (key === 'gate1' && result.details?.urlChecked) {
      summary.gates[key].url = result.details.urlChecked
    }
    if (key === 'gate2' && result.details?.placeName) {
      summary.gates[key].placeName = result.details.placeName
      summary.gates[key].geocodeConfidence = result.details.geocodeConfidence
    }
    if (key === 'gate3') {
      summary.gates[key].signalCount = result.details?.signalCount || 0
      summary.gates[key].signals = (result.details?.signals || []).map(s => s.detail)
    }
    if (key === 'gate4') {
      summary.gates[key].confidence = result.details?.confidence || null
      summary.gates[key].justification = result.details?.justification || null
    }
  }

  // Include Google Places metadata at top level for display
  const g0 = gateResults.gate0?.details || {}
  if (g0.source === 'google_places') {
    summary.source = 'google_places'
    summary.google_places = {
      business_status: g0.googlePlacesStatus || null,
      rating: g0.googlePlacesRating || null,
      rating_count: g0.googlePlacesRatingCount || null,
    }
  }

  return summary
}

/**
 * Write a disqualification record.
 */
async function writeDisqualification(supabase, candidate, gateFailed, reason, details) {
  try {
    await supabase.from('candidates_disqualified').insert({
      name: candidate.name,
      vertical: candidate.vertical || null,
      region: candidate.region || null,
      gate_failed: gateFailed,
      reason,
      data_at_failure: {
        ...details,
        website_url: candidate.website_url || null,
        notes: candidate.notes || null,
      },
    })
  } catch (err) {
    console.error(`[pipeline] Failed to write disqualification for "${candidate.name}":`, err.message)
  }
}

/**
 * Write a wrong-vertical record.
 */
async function writeWrongVertical(supabase, data) {
  try {
    await supabase.from('candidates_wrong_vertical').insert(data)
  } catch (err) {
    console.error(`[pipeline] Failed to write wrong-vertical record for "${data.name}":`, err.message)
  }
}

/**
 * Write (or update) a candidate in the review queue.
 * Returns the candidate ID.
 */
// Map discovery sources to DB-allowed values
// The listing_candidates_source_check constraint allows a fixed set of sources
const SOURCE_MAP = {
  google_places: 'automated_discovery',
  ai_prospector: 'ai_prospector',
  ai_daily: 'ai_prospector',
  manual: 'user_suggested',
}

async function writeCandidate(supabase, candidate, score, websiteUrl, gateResults) {
  const rawSource = candidate.source || 'ai_prospector'
  const dbSource = SOURCE_MAP[rawSource] || 'ai_prospector'

  const row = {
    name: candidate.name.trim(),
    region: candidate.region || null,
    vertical: candidate.vertical,
    website_url: websiteUrl || null,
    confidence: score / 100,
    source: dbSource,
    source_detail: candidate.source_detail || `${rawSource} — ${new Date().toISOString().split('T')[0]}`,
    notes: candidate.notes || null,
    status: 'pending',
    gate_results: gateResults,
  }

  // If candidate already has an ID (re-run), update instead
  if (candidate.id) {
    const { error } = await supabase
      .from('listing_candidates')
      .update({ confidence: row.confidence, gate_results: row.gate_results })
      .eq('id', candidate.id)
    if (error) {
      console.error(`[pipeline] Failed to update candidate "${candidate.name}":`, error.message)
    }
    return candidate.id
  }

  const { data, error } = await supabase
    .from('listing_candidates')
    .insert(row)
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      // Duplicate — already exists, that's fine
      return null
    }
    console.error(`[pipeline] Failed to insert candidate "${candidate.name}":`, error.message)
    return null
  }

  return data?.id || null
}
