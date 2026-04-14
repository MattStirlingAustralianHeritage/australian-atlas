#!/usr/bin/env node
/**
 * One-off tourist-area prospector push.
 * Runs Google Places discovery + full 5-gate pipeline for 15 high-traffic
 * Australian tourist drives/regions, paced across 5 days (3 areas/day).
 *
 * This runs IN ADDITION to the regular daily prospector — it does not
 * modify or pause the existing daily cron job.
 *
 * Usage:
 *   node --env-file=.env.local scripts/prospect-tourist-areas.mjs --day=1
 *   node --env-file=.env.local scripts/prospect-tourist-areas.mjs --day=2 --dry-run
 *   node --env-file=.env.local scripts/prospect-tourist-areas.mjs --area=great-ocean-road
 *   node --env-file=.env.local scripts/prospect-tourist-areas.mjs --area=barossa-valley --vertical=sba
 *   node --env-file=.env.local scripts/prospect-tourist-areas.mjs --all   # runs everything (hours)
 *
 * Flags:
 *   --day=N          Run day N's batch (1–5, three areas each)
 *   --area=SLUG      Run a single area by slug
 *   --vertical=KEY   Limit to one vertical (sba, rest, craft, etc.)
 *   --dry-run        No database writes
 *   --all            Run all 15 areas (takes several hours)
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { discoverCandidates, isInAustralia } from '../lib/prospector/google-places.js'
import { runPipeline } from '../lib/prospector/pipeline.js'
import { trigramSimilarity } from '../lib/prospector/gates.js'

// ── Parse .env.local ────────────────────────────────────────────────
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
} catch { /* .env.local may not exist */ }

const MASTER_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const MASTER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!MASTER_URL || !MASTER_KEY) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
if (!process.env.GOOGLE_PLACES_API_KEY) { console.error('Missing GOOGLE_PLACES_API_KEY'); process.exit(1) }

const sb = createClient(MASTER_URL, MASTER_KEY)

// ── CLI flags ───────────────────────────────────────────────────────
const dryRun = process.argv.includes('--dry-run')
const runAll = process.argv.includes('--all')
const dayArg = process.argv.find(a => a.startsWith('--day='))?.split('=')[1]
const areaArg = process.argv.find(a => a.startsWith('--area='))?.split('=')[1] || null
const onlyVertical = process.argv.find(a => a.startsWith('--vertical='))?.split('=')[1] || null

// ── Tourist areas ───────────────────────────────────────────────────
// 15 high-traffic areas grouped into 5 days (3 per day)

const TOURIST_AREAS = [
  // Day 1 — Victoria
  { slug: 'great-ocean-road',       name: 'Great Ocean Road',            state: 'VIC', lat: -38.68,  lng: 143.40, radius: 150000, day: 1 },
  { slug: 'yarra-valley',           name: 'Yarra Valley',                state: 'VIC', lat: -37.75,  lng: 145.55, radius: 80000,  day: 1 },
  { slug: 'mornington-peninsula',   name: 'Mornington Peninsula',        state: 'VIC', lat: -38.35,  lng: 144.95, radius: 60000,  day: 1 },

  // Day 2 — Victoria (Alpine) + South Australia
  { slug: 'great-alpine-road',      name: 'Great Alpine Road corridor',  state: 'VIC', lat: -36.75,  lng: 146.95, radius: 120000, day: 2 },
  { slug: 'barossa-valley',         name: 'Barossa Valley',              state: 'SA',  lat: -34.52,  lng: 138.95, radius: 60000,  day: 2 },
  { slug: 'mclaren-vale-fleurieu',  name: 'McLaren Vale & Fleurieu',     state: 'SA',  lat: -35.22,  lng: 138.55, radius: 80000,  day: 2 },

  // Day 3 — South Australia + Western Australia
  { slug: 'adelaide-hills',         name: 'Adelaide Hills',              state: 'SA',  lat: -35.02,  lng: 138.72, radius: 60000,  day: 3 },
  { slug: 'margaret-river',         name: 'Margaret River',              state: 'WA',  lat: -33.95,  lng: 115.08, radius: 100000, day: 3 },
  { slug: 'blue-mountains',         name: 'Blue Mountains',              state: 'NSW', lat: -33.72,  lng: 150.31, radius: 80000,  day: 3 },

  // Day 4 — New South Wales
  { slug: 'hunter-valley',          name: 'Hunter Valley',               state: 'NSW', lat: -32.75,  lng: 151.15, radius: 80000,  day: 4 },
  { slug: 'grand-pacific-drive',    name: 'Grand Pacific Drive',         state: 'NSW', lat: -34.42,  lng: 150.90, radius: 80000,  day: 4 },
  { slug: 'byron-hinterland',       name: 'Byron Hinterland',            state: 'NSW', lat: -28.64,  lng: 153.35, radius: 80000,  day: 4 },

  // Day 5 — Tasmania + Queensland
  { slug: 'tasmania-east-coast',    name: 'Tasmania East Coast',         state: 'TAS', lat: -42.00,  lng: 148.15, radius: 150000, day: 5 },
  { slug: 'atherton-tablelands',    name: 'Atherton Tablelands',         state: 'QLD', lat: -17.27,  lng: 145.50, radius: 100000, day: 5 },
  { slug: 'sunshine-coast-hinterland', name: 'Sunshine Coast Hinterland', state: 'QLD', lat: -26.69, lng: 152.85, radius: 80000,  day: 5 },
]

const VERTICALS = {
  sba: 'Small Batch Atlas',
  collection: 'Culture Atlas',
  craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas',
  rest: 'Rest Atlas',
  field: 'Field Atlas',
  corner: 'Corner Atlas',
  found: 'Found Atlas',
  table: 'Table Atlas',
}

const WEBSITE_EXEMPT_VERTICALS = ['field']

// ── Helpers ─────────────────────────────────────────────────────────

function normaliseDomain(url) {
  if (!url) return null
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname
      .replace(/^www\./, '').toLowerCase()
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase()
  }
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── Select which areas to run ───────────────────────────────────────

function selectAreas() {
  if (areaArg) {
    const area = TOURIST_AREAS.find(a => a.slug === areaArg)
    if (!area) {
      console.error(`Unknown area: ${areaArg}`)
      console.error('Available:', TOURIST_AREAS.map(a => a.slug).join(', '))
      process.exit(1)
    }
    return [area]
  }
  if (dayArg) {
    const day = parseInt(dayArg)
    if (day < 1 || day > 5) { console.error('Day must be 1–5'); process.exit(1) }
    return TOURIST_AREAS.filter(a => a.day === day)
  }
  if (runAll) return TOURIST_AREAS
  console.error('Specify --day=N (1–5), --area=SLUG, or --all')
  console.error('\nDays:')
  for (let d = 1; d <= 5; d++) {
    const areas = TOURIST_AREAS.filter(a => a.day === d)
    console.error(`  Day ${d}: ${areas.map(a => a.name).join(', ')}`)
  }
  console.error('\nAreas:', TOURIST_AREAS.map(a => a.slug).join(', '))
  process.exit(1)
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const areas = selectAreas()

  console.log('\n══════════════════════════════════════════════════════')
  console.log('  TOURIST AREA PROSPECTOR PUSH')
  console.log(`  ${new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`)
  console.log(`  Areas: ${areas.map(a => a.name).join(', ')}`)
  if (onlyVertical) console.log(`  Vertical: ${onlyVertical} only`)
  if (dryRun) console.log('  [dry-run] No database writes')
  console.log('══════════════════════════════════════════════════════\n')

  // Pre-load dedup sets
  const existingNames = new Set()
  const existingDomains = new Set()
  const existingCoords = []

  console.log('  Loading existing listings for dedup...')
  const { data: existingListings } = await sb
    .from('listings')
    .select('name, website, lat, lng')
    .eq('status', 'active')
    .limit(20000)

  if (existingListings) {
    for (const l of existingListings) {
      existingNames.add(l.name.toLowerCase().trim())
      if (l.website) existingDomains.add(normaliseDomain(l.website))
      if (l.lat && l.lng) existingCoords.push({ lat: l.lat, lng: l.lng })
    }
  }

  const { data: existingCandidates } = await sb
    .from('listing_candidates')
    .select('name, website_url')
    .limit(10000)

  if (existingCandidates) {
    for (const c of existingCandidates) {
      existingNames.add(c.name.toLowerCase().trim())
      if (c.website_url) existingDomains.add(normaliseDomain(c.website_url))
    }
  }

  console.log(`  Loaded ${existingNames.size} names, ${existingDomains.size} domains\n`)

  // Totals
  let grandQueued = 0
  let grandDisqualified = 0
  let grandDiscovered = 0
  const disqualifiedByGate = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }

  const verticalsToRun = onlyVertical && VERTICALS[onlyVertical]
    ? [onlyVertical]
    : Object.keys(VERTICALS)

  for (let areaIdx = 0; areaIdx < areas.length; areaIdx++) {
    const area = areas[areaIdx]
    const regionCenter = { lat: area.lat, lng: area.lng }

    console.log(`\n┌─────────────────────────────────────────────┐`)
    console.log(`│  ${area.name} (${area.state})`)
    console.log(`│  Center: ${area.lat}, ${area.lng} — Radius: ${area.radius / 1000}km`)
    console.log(`└─────────────────────────────────────────────┘`)

    let areaQueued = 0
    let areaDisqualified = 0

    for (const vertical of verticalsToRun) {
      console.log(`\n  ── ${VERTICALS[vertical]} (${vertical}) ──`)

      let rawCandidates
      try {
        rawCandidates = await discoverCandidates(vertical, area.state, {
          maxPerSearch: 8,
          regionCenter,
          radius: area.radius,
        })
      } catch (err) {
        console.error(`    Discovery error: ${err.message}`)
        continue
      }

      // Pre-filter: dedup against existing listings + candidates + this run
      const filtered = []
      for (const candidate of rawCandidates) {
        const nameLower = candidate.name.toLowerCase().trim()
        if (existingNames.has(nameLower)) continue
        let fuzzyDupe = false
        for (const existing of existingNames) {
          if (trigramSimilarity(nameLower, existing) > 0.85) { fuzzyDupe = true; break }
        }
        if (fuzzyDupe) continue
        if (candidate.website_url) {
          const domain = normaliseDomain(candidate.website_url)
          if (domain && existingDomains.has(domain)) continue
        }
        if (candidate.lat && candidate.lng) {
          const tooClose = existingCoords.some(c => haversineMeters(c.lat, c.lng, candidate.lat, candidate.lng) < 100)
          if (tooClose) continue
        }
        if (candidate.lat && candidate.lng && !isInAustralia(candidate.lat, candidate.lng)) continue
        if (!candidate.website_url && !WEBSITE_EXEMPT_VERTICALS.includes(vertical)) continue

        filtered.push(candidate)
        existingNames.add(nameLower)
        if (candidate.website_url) existingDomains.add(normaliseDomain(candidate.website_url))
        if (candidate.lat && candidate.lng) existingCoords.push({ lat: candidate.lat, lng: candidate.lng })
      }

      console.log(`    ${rawCandidates.length} found, ${filtered.length} after dedup`)
      grandDiscovered += filtered.length

      // Run each through the full 5-gate pipeline
      for (const candidate of filtered) {
        try {
          const result = await runPipeline(candidate, sb, { dryRun, verbose: false })
          if (result.passed) {
            areaQueued++
            console.log(`    ✓ QUEUED: "${candidate.name}" — score ${result.score}`)
          } else {
            areaDisqualified++
            if (result.failedGate != null) disqualifiedByGate[result.failedGate]++
            console.log(`    ✗ DROPPED: "${candidate.name}" — Gate ${result.failedGate}: ${result.failReason}`)
          }
        } catch (err) {
          console.error(`    Pipeline error for "${candidate.name}": ${err.message}`)
          areaDisqualified++
        }
        await sleep(800)
      }

      // Pause between verticals
      await sleep(2000)
    }

    grandQueued += areaQueued
    grandDisqualified += areaDisqualified
    console.log(`\n  ▸ ${area.name} done: ${areaQueued} queued, ${areaDisqualified} disqualified`)

    // Pause between areas (30s) — keep Google Places API usage smooth
    if (areaIdx < areas.length - 1) {
      console.log(`\n  ⏱ Pausing 30s before next area...`)
      await sleep(30000)
    }
  }

  // Final summary
  console.log('\n══════════════════════════════════════════════════════')
  console.log('  TOURIST AREA PUSH — COMPLETE')
  console.log(`  ${dryRun ? 'Would queue' : 'Queued'}: ${grandQueued} candidates`)
  console.log(`  Discovered: ${grandDiscovered} | Disqualified: ${grandDisqualified}`)
  console.log(`  By gate: G0=${disqualifiedByGate[0]} G1=${disqualifiedByGate[1]} G2=${disqualifiedByGate[2]} G3=${disqualifiedByGate[3]} G4=${disqualifiedByGate[4]}`)
  console.log('══════════════════════════════════════════════════════\n')

  // Per-area breakdown
  console.log('  Pacing guide (run one per day):')
  for (let d = 1; d <= 5; d++) {
    const dayAreas = TOURIST_AREAS.filter(a => a.day === d)
    console.log(`    Day ${d}: ${dayAreas.map(a => a.name).join(', ')}`)
  }
  console.log(`\n  Example: node --env-file=.env.local scripts/prospect-tourist-areas.mjs --day=1`)
  console.log()
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
