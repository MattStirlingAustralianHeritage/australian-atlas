#!/usr/bin/env node
/**
 * One-shot prospector using Google Places discovery.
 * Same logic as the /api/cron/prospect route, runnable locally.
 *
 * Usage:
 *   node --env-file=.env.local scripts/prospect-google-places.mjs
 *   node --env-file=.env.local scripts/prospect-google-places.mjs --vertical=sba
 *   node --env-file=.env.local scripts/prospect-google-places.mjs --dry-run
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { discoverCandidates, isInAustralia } from '../lib/prospector/google-places.js'
import { runPipeline } from '../lib/prospector/pipeline.js'
import { trigramSimilarity } from '../lib/prospector/gates.js'

// Parse .env.local
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
const dryRun = process.argv.includes('--dry-run')
const onlyVertical = process.argv.find(a => a.startsWith('--vertical='))?.split('=')[1] || null

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

const STATES = ['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']
const WEBSITE_EXEMPT_VERTICALS = ['field']
const MAX_NEW_PER_VERTICAL = 12

async function main() {
  console.log('\n══════════════════════════════════════════')
  console.log('  GOOGLE PLACES PROSPECTOR')
  console.log(`  ${new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`)
  console.log('══════════════════════════════════════════\n')
  if (dryRun) console.log('  [dry-run] No database writes\n')

  // Pre-load master DB for dedup
  const existingNames = new Set()
  const existingDomains = new Set()
  const existingCoords = []

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

  console.log(`  Loaded ${existingNames.size} existing names, ${existingDomains.size} domains for dedup\n`)

  const verticalsToRun = onlyVertical && VERTICALS[onlyVertical]
    ? [onlyVertical]
    : Object.keys(VERTICALS)

  let totalQueued = 0
  let totalDisqualified = 0
  let totalDiscovered = 0
  const disqualifiedByGate = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }

  for (const vertical of verticalsToRun) {
    console.log(`\n── ${VERTICALS[vertical]} (${vertical}) ──`)

    let verticalQueued = 0
    let verticalDisqualified = 0

    // Sort states by coverage (thinnest first)
    const coverage = {}
    for (const s of STATES) {
      const { count } = await sb
        .from('listings')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .eq('vertical', vertical)
        .eq('state', s)
      coverage[s] = count || 0
    }

    const statesToSearch = STATES
      .map(s => ({ state: s, count: coverage[s] || 0 }))
      .sort((a, b) => a.count - b.count)
      .map(s => s.state)

    console.log(`  Coverage: ${STATES.map(s => `${s}:${coverage[s]}`).join(' ')}`)

    for (const state of statesToSearch) {
      if (verticalQueued >= MAX_NEW_PER_VERTICAL) break

      console.log(`  Discovering ${vertical} in ${state}...`)
      let rawCandidates
      try {
        rawCandidates = await discoverCandidates(vertical, state, { maxPerSearch: 8 })
      } catch (err) {
        console.error(`    Discovery error: ${err.message}`)
        continue
      }

      // Pre-filter: dedup
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
      totalDiscovered += filtered.length

      for (const candidate of filtered) {
        if (verticalQueued >= MAX_NEW_PER_VERTICAL) break

        try {
          const result = await runPipeline(candidate, sb, { dryRun, verbose: false })
          if (result.passed) {
            verticalQueued++
            console.log(`    ✓ QUEUED: "${candidate.name}" (${state}) — score ${result.score}`)
          } else {
            verticalDisqualified++
            if (result.failedGate != null) disqualifiedByGate[result.failedGate]++
            console.log(`    ✗ DROPPED: "${candidate.name}" — Gate ${result.failedGate}: ${result.failReason}`)
          }
        } catch (err) {
          console.error(`    Pipeline error for "${candidate.name}": ${err.message}`)
          verticalDisqualified++
        }
        await new Promise(r => setTimeout(r, 800))
      }
    }

    totalQueued += verticalQueued
    totalDisqualified += verticalDisqualified
    console.log(`  Result: ${verticalQueued} queued, ${verticalDisqualified} disqualified`)
  }

  console.log('\n══════════════════════════════════════════')
  console.log(`  ${dryRun ? 'Would queue' : 'Queued'} ${totalQueued} candidates`)
  console.log(`  Discovered: ${totalDiscovered} | Disqualified: ${totalDisqualified}`)
  console.log(`  By gate: G0=${disqualifiedByGate[0]} G1=${disqualifiedByGate[1]} G2=${disqualifiedByGate[2]} G3=${disqualifiedByGate[3]} G4=${disqualifiedByGate[4]}`)
  console.log('══════════════════════════════════════════\n')
}

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

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
