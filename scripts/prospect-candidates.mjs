#!/usr/bin/env node
/**
 * Daily Listing Prospector (with Quality Gates)
 *
 * Generates candidate recommendations per vertical, then runs each
 * through the 5-gate verification pipeline before entering the queue.
 *
 * Pipeline:
 *   Claude generates candidates -> Gate 0 (dedup) -> Gate 1 (web)
 *   -> Gate 2 (address) -> Gate 3 (activity) -> Gate 4 (vertical fit)
 *   -> Score -> Queue
 *
 * Failure at any gate writes to candidates_disqualified. Only verified
 * candidates with passing scores enter the review queue.
 *
 * Usage:
 *   node --env-file=.env.local scripts/prospect-candidates.mjs
 *   node --env-file=.env.local scripts/prospect-candidates.mjs --dry-run
 *   node --env-file=.env.local scripts/prospect-candidates.mjs --vertical=sba
 *   node --env-file=.env.local scripts/prospect-candidates.mjs --skip-gates
 *
 * Scheduling:
 *   Run daily at 5:30am AEST via cron or scheduled task.
 *   Results appear on /admin/candidates by 6:00am.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { runPipeline } from '../lib/prospector/pipeline.js'

// Parse .env.local manually — dotenv v17 auto-inject skips some keys
try {
  const envText = readFileSync('.env.local', 'utf-8')
  for (const line of envText.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.substring(0, eqIdx)
    const val = trimmed.substring(eqIdx + 1)
    if (!process.env[key]) process.env[key] = val
  }
} catch { /* .env.local may not exist in production */ }

const MASTER_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const MASTER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

if (!MASTER_URL || !MASTER_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!ANTHROPIC_KEY) {
  console.error('Missing ANTHROPIC_API_KEY')
  process.exit(1)
}

const sb = createClient(MASTER_URL, MASTER_KEY)
const dryRun = process.argv.includes('--dry-run')
const skipGates = false // --skip-gates disabled permanently — all candidates must pass quality gates
const onlyVertical = process.argv.find(a => a.startsWith('--vertical='))?.split('=')[1] || null

const VERTICALS = {
  sba: {
    label: 'Small Batch Atlas',
    description: 'Artisan food and drink producers — distilleries, wineries, breweries, small-batch makers, providores, olive oil producers, cheese makers, specialty food producers',
    searchTerms: 'craft distillery, boutique winery, microbrewery, artisan cheese, providore, olive oil producer, small-batch spirits, craft cider, specialty food maker',
  },
  collection: {
    label: 'Collection Atlas',
    description: 'Museums, galleries, private collections, heritage collections, art spaces, sculpture parks, archives, cultural institutions',
    searchTerms: 'regional gallery, private museum, heritage collection, art space, sculpture garden, cultural centre, historical society, antique collection',
  },
  craft: {
    label: 'Craft Atlas',
    description: 'Makers, artisans, studios — ceramicists, woodworkers, glassblowers, weavers, jewellers, blacksmiths, printmakers, leatherworkers',
    searchTerms: 'pottery studio, woodworking workshop, glass blowing, weaving studio, artisan jeweller, blacksmith forge, printmaking studio, leather workshop',
  },
  fine_grounds: {
    label: 'Fine Grounds Atlas',
    description: 'Specialty coffee roasters — micro roasters, single origin roasters, coffee roasteries, specialty coffee producers',
    searchTerms: 'specialty coffee roaster, micro roastery, single origin coffee, third wave coffee, coffee roasting, artisan coffee',
  },
  rest: {
    label: 'Rest Atlas',
    description: 'Boutique and independent accommodation — farm stays, heritage B&Bs, eco-lodges, glamping, tiny houses, boutique hotels, unique stays',
    searchTerms: 'boutique hotel, farm stay, heritage bed and breakfast, eco lodge, glamping, tiny house accommodation, country retreat, homestead stay',
  },
  field: {
    label: 'Field Atlas',
    description: 'Outdoor and nature experiences — hiking trails, nature reserves, national parks, botanical gardens, wildlife sanctuaries, natural landmarks',
    searchTerms: 'walking trail, nature reserve, botanical garden, wildlife sanctuary, national park, natural landmark, bush walk, scenic lookout',
  },
  corner: {
    label: 'Corner Atlas',
    description: 'Independent retail — bookshops, record stores, vintage shops, design stores, specialty retail, independent boutiques, makers markets',
    searchTerms: 'independent bookshop, record store, vintage shop, design store, specialty retail, makers market, artisan boutique, curated homewares',
  },
  found: {
    label: 'Found Atlas',
    description: 'Secondhand, vintage, antique, and op shops — charity shops, antique dealers, salvage yards, vintage clothing, retro furnishings',
    searchTerms: 'antique shop, vintage store, op shop, secondhand furniture, salvage yard, retro clothing, charity shop, vintage dealer',
  },
  table: {
    label: 'Table Atlas',
    description: 'Independent restaurants, cafes, and dining — regional dining, farm-to-table, destination restaurants, local cafes, food trucks, bakeries',
    searchTerms: 'farm to table restaurant, regional dining, destination restaurant, independent cafe, artisan bakery, food truck, local bistro',
  },
}

const STATES = ['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']

// ─── Main ────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════')
  console.log('  DAILY LISTING PROSPECTOR (with Quality Gates)')
  console.log(`  ${new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`)
  console.log('══════════════════════════════════════════\n')

  if (dryRun) console.log('  [dry-run] No database writes\n')
  if (skipGates) console.log('  [skip-gates] Quality gates disabled — inserting raw candidates\n')

  // 1. Build coverage context
  const coverage = await buildCoverageContext()

  // 2. Get existing names for Claude's dedup prompt (basic — gates do the real dedup)
  const existingNames = await getExistingNames()

  // 3. Generate and gate candidates per vertical
  const verticalsToProcess = onlyVertical ? [onlyVertical] : Object.keys(VERTICALS)
  let totalQueued = 0
  let totalDisqualified = 0

  for (const vertical of verticalsToProcess) {
    if (!VERTICALS[vertical]) {
      console.error(`  Unknown vertical: ${vertical}`)
      continue
    }

    console.log(`\n── ${VERTICALS[vertical].label} ──`)

    try {
      // Generate raw candidates from Claude
      const rawCandidates = await generateCandidates(vertical, coverage, existingNames)
      console.log(`  Generated ${rawCandidates.length} raw candidates`)

      if (skipGates) {
        // Legacy mode — insert without gates
        if (!dryRun && rawCandidates.length > 0) {
          const inserted = await insertCandidatesLegacy(rawCandidates)
          totalQueued += inserted
          console.log(`  Inserted ${inserted} candidates (no gates)`)
        }
        continue
      }

      // Run each candidate through the quality gate pipeline
      let passed = 0
      let failed = 0

      for (const candidate of rawCandidates) {
        const result = await runPipeline(candidate, sb, { dryRun, verbose: true })

        if (result.passed) {
          passed++
          console.log(`    QUEUED: ${candidate.name} — score ${result.score}/100`)
          existingNames.add(candidate.name.toLowerCase().trim())
        } else {
          failed++
          console.log(`    DROPPED: ${candidate.name} — Gate ${result.failedGate} (${result.failReason})`)
        }

        // Rate limit between candidates (web fetches + API calls)
        await sleep(1500)
      }

      totalQueued += passed
      totalDisqualified += failed
      console.log(`  Result: ${passed} queued, ${failed} disqualified`)

    } catch (err) {
      console.error(`  Error processing ${vertical}:`, err.message)
    }

    // Rate limit between verticals
    if (verticalsToProcess.indexOf(vertical) < verticalsToProcess.length - 1) {
      await sleep(2000)
    }
  }

  console.log('\n══════════════════════════════════════════')
  console.log(`  Done. ${dryRun ? 'Would queue' : 'Queued'} ${totalQueued} candidates, ${totalDisqualified} disqualified.`)
  console.log('══════════════════════════════════════════\n')
}

// ─── Coverage Context ────────────────────────────────────────

async function buildCoverageContext() {
  const coverage = {}

  for (const v of Object.keys(VERTICALS)) {
    coverage[v] = { total: 0, byState: {}, byRegion: {}, existingNames: [] }

    // Count by state
    for (const s of STATES) {
      const { count } = await sb
        .from('listings')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active').eq('vertical', v).eq('state', s)
      coverage[v].byState[s] = count || 0
      coverage[v].total += (count || 0)
    }

    // Get top regions and their counts
    const { data: regionListings } = await sb
      .from('listings')
      .select('region')
      .eq('status', 'active').eq('vertical', v)
      .not('region', 'is', null)

    if (regionListings) {
      const regionCounts = {}
      for (const l of regionListings) {
        const r = l.region
        regionCounts[r] = (regionCounts[r] || 0) + 1
      }
      coverage[v].byRegion = regionCounts
    }

    // Get existing listing names for this vertical (for dedup)
    const { data: names } = await sb
      .from('listings')
      .select('name')
      .eq('status', 'active').eq('vertical', v)
      .limit(2000)

    if (names) {
      coverage[v].existingNames = names.map(n => n.name)
    }
  }

  return coverage
}

async function getExistingNames() {
  const names = new Set()

  // Existing listings
  const { data: listings } = await sb
    .from('listings')
    .select('name')
    .eq('status', 'active')
    .limit(10000)

  if (listings) {
    for (const l of listings) names.add(l.name.toLowerCase().trim())
  }

  // Existing candidates (pending or reviewing)
  const { data: candidates } = await sb
    .from('listing_candidates')
    .select('name')
    .in('status', ['pending', 'reviewing'])

  if (candidates) {
    for (const c of candidates) names.add(c.name.toLowerCase().trim())
  }

  return names
}

// ─── Claude-Powered Candidate Generation ─────────────────────

async function generateCandidates(vertical, coverage, existingNames) {
  const config = VERTICALS[vertical]
  const cov = coverage[vertical]

  // Identify the thinnest states for this vertical
  const thinStates = STATES
    .map(s => ({ state: s, count: cov.byState[s] || 0 }))
    .sort((a, b) => a.count - b.count)
    .slice(0, 4)

  // Identify thin regions
  const allRegions = Object.entries(cov.byRegion)
    .sort((a, b) => a[1] - b[1])

  const thinRegions = allRegions.filter(([, count]) => count <= 5).slice(0, 10)
  const strongRegions = allRegions.filter(([, count]) => count >= 10).slice(-5)

  // Build context for Claude
  const prompt = `You are helping build the Australian Atlas network — a curated directory of independent, artisan, and culturally significant places across Australia.

VERTICAL: ${config.label}
DESCRIPTION: ${config.description}
SEARCH TERMS: ${config.searchTerms}

CURRENT COVERAGE:
- Total listings: ${cov.total}
- By state: ${STATES.map(s => `${s}: ${cov.byState[s] || 0}`).join(', ')}
- Thinnest states: ${thinStates.map(s => `${s.state} (${s.count})`).join(', ')}
${thinRegions.length > 0 ? `- Thin regions: ${thinRegions.map(([r, c]) => `${r} (${c})`).join(', ')}` : ''}
${strongRegions.length > 0 ? `- Strong regions (avoid over-indexing): ${strongRegions.map(([r, c]) => `${r} (${c})`).join(', ')}` : ''}

EXISTING LISTINGS (sample — do NOT recommend these):
${cov.existingNames.slice(0, 80).join(', ')}

YOUR TASK:
Recommend exactly 10 real Australian businesses that would be excellent additions to ${config.label}. Focus on:
1. Filling gaps in thin states and regions (prioritise states with fewest listings)
2. Well-known or respected places that are genuinely missing from the directory
3. Geographic diversity — spread recommendations across different states and regions
4. Quality over quantity — these should be places an editorial team would be proud to feature

For each recommendation, provide:
- name: The real business name
- region: The Australian region (e.g., "Barossa Valley", "Blue Mountains", "Daintree")
- state: Two-letter state code (VIC, NSW, QLD, SA, WA, TAS, ACT, NT)
- website_url: The business website URL if you know it (null if unsure — do NOT guess)
- confidence: 0.0-1.0 — how confident you are this is a real, operating business (0.9+ for well-known, 0.6-0.8 for likely real, below 0.6 for uncertain)
- notes: One sentence on why this is a good addition (e.g., "Award-winning micro-distillery in an underserved region")

CRITICAL RULES:
- Only recommend businesses you believe are REAL and currently operating
- Do NOT invent fictional businesses
- Do NOT recommend any business already in the existing listings list above
- Set confidence appropriately — be honest about uncertainty
- website_url MUST be null if you're not confident about the exact URL
- Prioritise thin states and regions to maximise coverage impact

Respond with a JSON array of exactly 10 objects. No other text, just the JSON array.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Anthropic API error: ${response.status} — ${body}`)
  }

  const result = await response.json()
  const text = result.content?.[0]?.text || ''

  // Parse JSON from response (handle markdown code blocks)
  let candidates
  try {
    const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    candidates = JSON.parse(jsonStr)
  } catch (err) {
    console.error(`  Failed to parse Claude response:`, err.message)
    console.error(`  Raw response:`, text.substring(0, 500))
    return []
  }

  if (!Array.isArray(candidates)) {
    console.error(`  Expected array, got:`, typeof candidates)
    return []
  }

  // Basic dedup against names Claude already knows about
  // (the real dedup happens in Gate 0)
  const filtered = candidates.filter(c => {
    if (!c.name) return false
    const normalised = c.name.toLowerCase().trim()
    if (existingNames.has(normalised)) {
      console.log(`    Skipping known duplicate: ${c.name}`)
      return false
    }
    return true
  })

  // Return raw candidate objects for the pipeline to process
  return filtered.slice(0, 10).map(c => ({
    name: c.name.trim(),
    region: c.region || null,
    vertical,
    website_url: c.website_url || null, // Pipeline will verify this
    confidence: Math.min(1, Math.max(0, parseFloat(c.confidence) || 0.5)),
    source: 'ai_prospector',
    source_detail: `Daily prospector — ${new Date().toISOString().split('T')[0]}`,
    notes: c.state ? `[${c.state}] ${c.notes || ''}`.trim() : (c.notes || null),
    status: 'pending',
  }))
}

// ─── Legacy Insert (when --skip-gates) ───────────────────────

async function insertCandidatesLegacy(candidates) {
  let inserted = 0
  for (const candidate of candidates) {
    // Never trust AI-generated URLs in legacy mode
    const row = { ...candidate, website_url: null }
    const { error } = await sb.from('listing_candidates').insert(row)
    if (!error) {
      inserted++
    } else if (error.code === '23505') {
      // Duplicate — skip silently
    } else {
      console.error(`    Insert error for ${candidate.name}:`, error.message)
    }
  }
  return inserted
}

// ─── Helpers ─────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
