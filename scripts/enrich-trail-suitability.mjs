#!/usr/bin/env node

/**
 * Batch enrichment: classify every active listing for trail suitability.
 *
 * For each listing, calls the Anthropic API to determine:
 *   - visit_type: experiential | venue | retail | workshop | attraction
 *   - trail_suitable: boolean
 *
 * Usage:
 *   node scripts/enrich-trail-suitability.mjs              # all un-classified
 *   node scripts/enrich-trail-suitability.mjs --force       # re-classify everything
 *   node scripts/enrich-trail-suitability.mjs --dry-run     # preview without writing
 *   node scripts/enrich-trail-suitability.mjs --limit 50    # process at most 50
 *
 * Env vars required:
 *   ANTHROPIC_API_KEY
 *   SUPABASE_URL  /  NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'

// ── Config ───────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!ANTHROPIC_API_KEY) { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1) }
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const MODEL = 'claude-sonnet-4-20250514'
const CONCURRENCY = 5
const BATCH_SIZE = 200           // Supabase page size
const RETRY_LIMIT = 1            // retry once on API failure
const RETRY_DELAY_MS = 2000

const VALID_VISIT_TYPES = new Set([
  'experiential', 'venue', 'retail', 'workshop', 'attraction',
])

// ── CLI flags ────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const FORCE    = args.includes('--force')
const DRY_RUN  = args.includes('--dry-run')
const limitIdx = args.indexOf('--limit')
const LIMIT    = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity

const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Prompt ───────────────────────────────────────────────────────────
function buildPrompt(listing) {
  return `You are classifying business listings for an Australian discovery network to determine their suitability as road trip or trail stops.

Given a listing with the following details:
- Name: ${listing.name}
- Vertical: ${listing.vertical}
- Description: ${(listing.description || '').slice(0, 500)}
- Region: ${listing.region || 'Unknown'}

Return a JSON object with two fields:

"visit_type": one of:
  - "experiential" — visitors come for an experience (tasting, tour, event, attraction)
  - "venue" — a place to eat, drink, or stay
  - "retail" — primarily a shop or showroom
  - "workshop" — maker/producer space, appointment or limited access
  - "attraction" — museum, heritage site, natural feature

"trail_suitable": boolean — true if this is a stop someone would naturally include on a multi-day road trip without pre-planning. Consider: is it walk-in friendly, does it have broad appeal, is it a reason to stop rather than a reason to detour?

Return only valid JSON. No explanation.`
}

// ── Anthropic API call ───────────────────────────────────────────────
async function classify(listing, attempt = 0) {
  const prompt = buildPrompt(listing)

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 128,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`API ${res.status}: ${body.slice(0, 200)}`)
    }

    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error(`No JSON in response: ${text.slice(0, 100)}`)

    const parsed = JSON.parse(jsonMatch[0])

    // Validate
    const visitType = VALID_VISIT_TYPES.has(parsed.visit_type) ? parsed.visit_type : null
    const trailSuitable = typeof parsed.trail_suitable === 'boolean' ? parsed.trail_suitable : null

    if (!visitType || trailSuitable === null) {
      throw new Error(`Invalid classification: ${JSON.stringify(parsed)}`)
    }

    return { visit_type: visitType, trail_suitable: trailSuitable }
  } catch (err) {
    if (attempt < RETRY_LIMIT) {
      await sleep(RETRY_DELAY_MS)
      return classify(listing, attempt + 1)
    }
    return { error: err.message }
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// ── Concurrency-limited runner ───────────────────────────────────────
async function runWithConcurrency(items, fn, limit) {
  const results = []
  let idx = 0

  async function worker() {
    while (idx < items.length) {
      const i = idx++
      results[i] = await fn(items[i], i)
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== Trail Suitability Enrichment ===`)
  console.log(`  Mode:  ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
  console.log(`  Force: ${FORCE ? 'yes (re-classify all)' : 'no (only un-classified)'}`)
  console.log(`  Limit: ${LIMIT === Infinity ? 'none' : LIMIT}`)
  console.log(`  Concurrency: ${CONCURRENCY}\n`)

  // Fetch listings in pages
  let allListings = []
  let page = 0

  while (true) {
    let query = sb
      .from('listings')
      .select('id, name, vertical, description, region')
      .eq('status', 'active')
      .order('id')
      .range(page * BATCH_SIZE, (page + 1) * BATCH_SIZE - 1)

    if (!FORCE) {
      query = query.is('visit_type', null)
    }

    const { data, error } = await query

    if (error) {
      console.error('Supabase query error:', error.message)
      process.exit(1)
    }

    if (!data || data.length === 0) break
    allListings.push(...data)
    page++

    if (allListings.length >= LIMIT) {
      allListings = allListings.slice(0, LIMIT)
      break
    }
  }

  console.log(`Found ${allListings.length} listings to classify.\n`)

  if (allListings.length === 0) {
    console.log('Nothing to do.')
    return
  }

  // Process with concurrency limit
  let classified = 0
  let failed = 0
  let suitableCount = 0
  const typeCounts = {}

  const results = await runWithConcurrency(allListings, async (listing, i) => {
    const result = await classify(listing)

    if (result.error) {
      failed++
      console.log(`  [${i + 1}/${allListings.length}] FAIL  ${listing.name} — ${result.error}`)
      return null
    }

    classified++
    typeCounts[result.visit_type] = (typeCounts[result.visit_type] || 0) + 1
    if (result.trail_suitable) suitableCount++

    const icon = result.trail_suitable ? '\u2713' : '\u2717'
    console.log(`  [${i + 1}/${allListings.length}] ${icon} ${listing.name} — ${result.visit_type} (trail: ${result.trail_suitable})`)

    if (!DRY_RUN) {
      const { error: updateErr } = await sb
        .from('listings')
        .update({ visit_type: result.visit_type, trail_suitable: result.trail_suitable })
        .eq('id', listing.id)

      if (updateErr) {
        console.log(`    ^ DB write failed: ${updateErr.message}`)
        return null
      }
    }

    return result
  }, CONCURRENCY)

  // Summary
  console.log(`\n=== Summary ===`)
  console.log(`  Classified: ${classified}`)
  console.log(`  Failed:     ${failed}`)
  console.log(`  Trail suitable: ${suitableCount} / ${classified} (${classified ? Math.round(suitableCount / classified * 100) : 0}%)`)
  console.log(`\n  By visit_type:`)
  for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${type}: ${count}`)
  }

  if (DRY_RUN) {
    console.log(`\n  (Dry run — no database changes were made)`)
  }

  console.log('')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
