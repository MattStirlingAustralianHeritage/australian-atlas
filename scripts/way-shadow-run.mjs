#!/usr/bin/env node
/**
 * Way Atlas Shadow Discovery Run — scale execution.
 *
 * Runs both working scrapers (Tourism Awards + ECO Certified), deduplicates
 * across sources, filters through Gate 1 (independence), inserts passing
 * candidates into way_candidates with shadow_run = true, then runs the
 * full 6-stage discovery pipeline on each.
 *
 * Usage:
 *   node scripts/way-shadow-run.mjs [--dry-run] [--skip-pipeline] [--limit N]
 *
 * Options:
 *   --dry-run        Scrape and dedup only, don't write to DB
 *   --skip-pipeline  Insert candidates but skip the 6-stage pipeline
 *   --skip-preflight Skip pre-flight URL validation
 *   --limit N        Process only the first N candidates (for testing)
 *   --resume         Skip candidates already in way_candidates
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createClient } from '@supabase/supabase-js'
import { scrapeTourismAwards } from '../lib/prospector/way-seeds/scrape-tourism-awards.js'
import { scrapeEcoCertified } from '../lib/prospector/way-seeds/scrape-eco-certified.js'
import { evaluateGate1 } from '../lib/prospector/way-discovery/gate-1-independence.js'
import { generateNameVariants } from '../lib/prospector/way-discovery/variants.js'
import { runWayDiscoveryPipeline } from '../lib/prospector/way-discovery/pipeline.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── Env ─────────────────────────────────────────────────────────

const envText = readFileSync(join(__dirname, '..', '.env.local'), 'utf-8')
for (const line of envText.split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const eq = t.indexOf('=')
  if (eq === -1) continue
  let k = t.substring(0, eq), v = t.substring(eq + 1)
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!process.env[k]) process.env[k] = v
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

let fieldClient = null
if (process.env.FIELD_SUPABASE_URL && process.env.FIELD_SUPABASE_SERVICE_KEY) {
  fieldClient = createClient(process.env.FIELD_SUPABASE_URL, process.env.FIELD_SUPABASE_SERVICE_KEY)
}

// ─── CLI args ────────────────────────────────────────────────────

const args = {
  dryRun: process.argv.includes('--dry-run'),
  skipPipeline: process.argv.includes('--skip-pipeline'),
  skipPreflight: process.argv.includes('--skip-preflight'),
  resume: process.argv.includes('--resume'),
  limit: (() => {
    const i = process.argv.indexOf('--limit')
    return i >= 0 ? Number(process.argv[i + 1]) : Infinity
  })(),
}

// ─── Dedup ───────────────────────────────────────────────────────

function extractDomain(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch { return null }
}

function dedupAcrossSources(tourismAwards, ecoCertified) {
  const byDomain = new Map()
  const byName = new Map()
  const merged = []

  function add(seed) {
    const domain = extractDomain(seed.website_url)
    const nameKey = seed.name.toLowerCase().trim()

    if (domain && byDomain.has(domain)) {
      const existing = byDomain.get(domain)
      existing.sources = [...new Set([...(existing.sources || [existing.source]), seed.source])]
      if (seed.award_level) existing.award_level = seed.award_level
      if (seed.award_year) existing.award_year = seed.award_year
      if (seed.certification_level) existing.certification_level = seed.certification_level
      return
    }

    if (byName.has(nameKey)) {
      const existing = byName.get(nameKey)
      existing.sources = [...new Set([...(existing.sources || [existing.source]), seed.source])]
      if (seed.website_url && !existing.website_url) existing.website_url = seed.website_url
      if (seed.award_level) existing.award_level = seed.award_level
      if (seed.certification_level) existing.certification_level = seed.certification_level
      return
    }

    seed.sources = [seed.source]
    merged.push(seed)
    if (domain) byDomain.set(domain, seed)
    byName.set(nameKey, seed)
  }

  // ECO first: chain-operated entries (Experience Co, APT, Beckons)
  // cluster in the ECO list, so ECO-first ordering exercises Gate 1
  // against real scraper output early in any --limit sample.
  for (const s of ecoCertified) add(s)
  for (const s of tourismAwards) add(s)
  return merged
}

// ─── Candidate helpers ───────────────────────────────────────────

function slugify(s) {
  return String(s).toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

async function findExistingCandidate(slug, websiteUrl) {
  const { data } = await sb
    .from('way_candidates')
    .select('id, name, slug, shadow_run, website_url, run_count, status')
    .or(`slug.eq.${slug}${websiteUrl ? `,website_url.eq.${websiteUrl}` : ''}`)
    .limit(1)
  return data?.[0] || null
}

// ─── Pre-flight URL validation ──────────────────────────────

const AGGREGATOR_DOMAINS = [
  'booking.com', 'tripadvisor.com', 'tripadvisor.com.au',
  'viator.com', 'getyourguide.com', 'expedia.com', 'expedia.com.au',
  'hotels.com', 'agoda.com', 'airbnb.com', 'airbnb.com.au',
  'wotif.com', 'lastminute.com.au', 'trivago.com.au',
]

function isAggregatorDomain(hostname) {
  const h = hostname.toLowerCase().replace(/^www\./, '')
  return AGGREGATOR_DOMAINS.some(d => h === d || h.endsWith('.' + d))
}

const PREFLIGHT_DELAY_MS = 2000
const PREFLIGHT_TIMEOUT_MS = 10000
const MIN_BODY_BYTES = 500

let _lastPreflightTime = 0

async function preflightCheck(url) {
  if (!url) return { pass: false, reason: 'no_url' }

  let parsedUrl
  try { parsedUrl = new URL(url) }
  catch { return { pass: false, reason: 'invalid_url' } }

  // Rate limit: 2s between fetches
  const now = Date.now()
  const wait = PREFLIGHT_DELAY_MS - (now - _lastPreflightTime)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  _lastPreflightTime = Date.now()

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PREFLIGHT_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'AustralianAtlasBot/1.0 (editorial-discovery; +https://australianatlas.com.au)',
      },
    })
    clearTimeout(timer)

    // Check final URL after redirects for aggregator domains
    const finalUrl = res.url || url
    let finalHost
    try { finalHost = new URL(finalUrl).hostname }
    catch { finalHost = parsedUrl.hostname }

    if (isAggregatorDomain(finalHost)) {
      return { pass: false, reason: `redirect_aggregator:${finalHost}` }
    }

    // Check HTTP status
    if (res.status >= 400) {
      return { pass: false, reason: `http_${res.status}` }
    }

    // Check body size (read as text, check byte length)
    const body = await res.text()
    if (Buffer.byteLength(body, 'utf-8') < MIN_BODY_BYTES) {
      return { pass: false, reason: `body_too_small:${Buffer.byteLength(body, 'utf-8')}b` }
    }

    return { pass: true }
  } catch (e) {
    clearTimeout(timer)
    if (e.name === 'AbortError') {
      return { pass: false, reason: 'timeout' }
    }
    // DNS failure, connection refused, etc.
    const code = e.cause?.code || e.code || ''
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
      return { pass: false, reason: 'nxdomain' }
    }
    if (code === 'ECONNREFUSED') {
      return { pass: false, reason: 'connection_refused' }
    }
    return { pass: false, reason: `fetch_error:${code || e.message?.slice(0, 60)}` }
  }
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now()
  console.log('=== Way Atlas Shadow Discovery Run ===\n')
  if (args.dryRun) console.log('  [DRY RUN — no DB writes]\n')

  // Phase 1: Scrape (with disk cache to avoid 18-min re-scrape on retries)
  console.log('─── Phase 1: Scraping seed sources ───\n')

  const cacheDir = join(__dirname, '..', '.cache')
  const tourismCachePath = join(cacheDir, 'way-seeds-tourism-awards.json')
  const ecoCachePath = join(cacheDir, 'way-seeds-eco-certified.json')

  let tourismAwards, ecoCertified

  if (existsSync(tourismCachePath) && existsSync(ecoCachePath)) {
    console.log('  Using cached scrape data (delete .cache/ to re-scrape)\n')
    tourismAwards = JSON.parse(readFileSync(tourismCachePath, 'utf-8'))
    ecoCertified = JSON.parse(readFileSync(ecoCachePath, 'utf-8'))
    console.log(`  Tourism Awards: ${tourismAwards.length} operators (cached)`)
    console.log(`  ECO Certified:  ${ecoCertified.length} operators (cached)\n`)
  } else {
    console.log('  Tourism Awards...')
    tourismAwards = await scrapeTourismAwards()
    console.log(`  → ${tourismAwards.length} Way-relevant operators\n`)

    console.log('  ECO Certified (729 listings, ~18 min at 1.5s rate)...')
    ecoCertified = await scrapeEcoCertified({
      onProgress: (n, total) => {
        if (n % 50 === 0 || n === total) process.stdout.write(`\r  → fetched ${n}/${total}`)
      },
    })
    console.log(`\n  → ${ecoCertified.length} operators parsed\n`)

    // Cache to disk for retries
    try {
      if (!existsSync(cacheDir)) { const { mkdirSync } = await import('fs'); mkdirSync(cacheDir, { recursive: true }) }
      writeFileSync(tourismCachePath, JSON.stringify(tourismAwards, null, 2))
      writeFileSync(ecoCachePath, JSON.stringify(ecoCertified, null, 2))
      console.log('  Scrape results cached to .cache/ for re-runs\n')
    } catch (e) {
      console.warn('  (cache write failed, will re-scrape next run:', e.message, ')\n')
    }
  }

  // Phase 2: Dedup
  console.log('─── Phase 2: Cross-source dedup ───\n')
  const seeds = dedupAcrossSources(tourismAwards, ecoCertified)
  console.log(`  ${tourismAwards.length} + ${ecoCertified.length} raw → ${seeds.length} unique seeds\n`)

  const toProcess = seeds.slice(0, args.limit)
  if (args.limit < Infinity) console.log(`  [limited to ${args.limit} candidates]\n`)

  // Phase 3a: Gate 1 filter
  console.log('─── Phase 3a: Gate 1 independence filter ───\n')

  const counts = {
    gate1Pass: 0, gate1Fail: 0, gate1CaseByCase: 0,
    preflightPass: 0, preflightFail: 0,
    inserted: 0, skippedExisting: 0, pipelineRun: 0,
    pipelineErrors: 0, noUrl: 0,
  }
  const gate1Rejects = []
  const gate1Passers = []  // seeds that pass Gate 1

  for (let i = 0; i < toProcess.length; i++) {
    const seed = toProcess[i]

    if (!seed.website_url) {
      counts.noUrl++
      continue
    }

    const nameVariants = generateNameVariants(seed.name)
    const candidateForGate = {
      name: seed.name,
      website_url: seed.website_url,
      name_variants: nameVariants,
    }

    const g1 = await evaluateGate1(candidateForGate, sb)

    if (g1.gate === 'fail') {
      counts.gate1Fail++
      if (g1.verifyCaseByCase) counts.gate1CaseByCase++
      gate1Rejects.push({
        name: seed.name,
        matchedGroup: g1.matchedGroup,
        reason: g1.reason,
        caseByCase: g1.verifyCaseByCase || false,
      })
      continue
    }

    counts.gate1Pass++
    gate1Passers.push({ ...seed, _nameVariants: nameVariants })
    if ((i + 1) % 50 === 0) console.log(`  processed ${i + 1}/${toProcess.length}`)
  }

  console.log(`\n  Gate 1: ${counts.gate1Pass} pass, ${counts.gate1Fail} fail (${counts.gate1CaseByCase} case-by-case)`)
  console.log(`  No URL: ${counts.noUrl} skipped`)

  if (gate1Rejects.length > 0) {
    console.log(`\n  Gate 1 rejects (sample):`)
    for (const r of gate1Rejects.slice(0, 15)) {
      console.log(`    ✗ ${r.name} → ${r.matchedGroup}${r.caseByCase ? ' (case-by-case)' : ''}`)
    }
    if (gate1Rejects.length > 15) console.log(`    ... and ${gate1Rejects.length - 15} more`)
  }

  // Phase 3b: Pre-flight URL validation
  let preflightPassers = gate1Passers

  if (!args.skipPreflight && gate1Passers.length > 0) {
    console.log(`\n─── Phase 3b: Pre-flight URL validation (${gate1Passers.length} candidates) ───\n`)

    preflightPassers = []
    const preflightRejects = []

    for (let i = 0; i < gate1Passers.length; i++) {
      const seed = gate1Passers[i]
      const result = await preflightCheck(seed.website_url)

      if (result.pass) {
        counts.preflightPass++
        preflightPassers.push(seed)
      } else {
        counts.preflightFail++
        preflightRejects.push({ name: seed.name, url: seed.website_url, source: seed.sources?.join('+') || seed.source, reason: result.reason })
      }

      if ((i + 1) % 50 === 0 || i === gate1Passers.length - 1) {
        console.log(`  checked ${i + 1}/${gate1Passers.length} (${counts.preflightFail} rejected so far)`)
      }
    }

    console.log(`\n  Pre-flight: ${counts.preflightPass} pass, ${counts.preflightFail} fail`)

    if (preflightRejects.length > 0) {
      // Group by reason
      const byReason = {}
      for (const r of preflightRejects) {
        const key = r.reason.split(':')[0]  // e.g. "redirect_aggregator" not the full domain
        if (!byReason[key]) byReason[key] = []
        byReason[key].push(r)
      }
      console.log(`\n  Pre-flight rejects by reason:`)
      for (const [reason, items] of Object.entries(byReason).sort((a, b) => b[1].length - a[1].length)) {
        console.log(`    ${reason}: ${items.length}`)
        for (const item of items.slice(0, 3)) {
          console.log(`      ${item.name} (${item.reason})`)
        }
        if (items.length > 3) console.log(`      ... +${items.length - 3} more`)
      }

      // Persist full rejection log to disk
      const logPath = join(__dirname, '..', '.cache', 'way-preflight-rejects.json')
      try {
        const logData = preflightRejects.map(r => ({
          name: r.name,
          url: r.url,
          domain: extractDomain(r.url) || r.url,
          source: r.source || null,
          reason: r.reason,
          timestamp: new Date().toISOString(),
        }))
        writeFileSync(logPath, JSON.stringify(logData, null, 2))
        console.log(`\n  Pre-flight rejection log saved to .cache/way-preflight-rejects.json`)
      } catch (e) {
        console.warn(`  (failed to write preflight log: ${e.message})`)
      }
    }
  } else if (args.skipPreflight) {
    console.log(`\n  [--skip-preflight: skipping URL validation]`)
    counts.preflightPass = gate1Passers.length
  }

  console.log(`\n  Final candidate count: ${preflightPassers.length} (Gate 1 pass: ${counts.gate1Pass}, pre-flight pass: ${counts.preflightPass})`)

  if (args.dryRun || args.skipPipeline) {
    const estCost = (preflightPassers.length * 0.30).toFixed(0)
    console.log(`  Estimated pipeline cost: ~$${estCost} (${preflightPassers.length} × $0.30/candidate)`)
    console.log(`\n${args.dryRun ? 'Dry run' : 'Skip-pipeline'} complete. ${elapsed(t0)}`)
    return
  }

  // Phase 3c: Insert candidates into DB
  console.log(`\n─── Phase 3c: Insert ${preflightPassers.length} candidates ───\n`)

  const candidatesForPipeline = []

  for (const seed of preflightPassers) {
    const slug = slugify(seed.name)
    const nameVariants = seed._nameVariants || generateNameVariants(seed.name)

    if (args.resume) {
      const existing = await findExistingCandidate(slug, seed.website_url)
      if (existing) {
        if (existing.shadow_run === false) {
          console.log(`  SKIP: ${seed.name} — calibration row (shadow_run=false), not re-pipelining`)
          continue
        }
        counts.skippedExisting++
        candidatesForPipeline.push(existing)
        continue
      }
    }

    const { data: created, error: insertErr } = await sb
      .from('way_candidates')
      .insert({
        name: seed.name,
        slug,
        website_url: seed.website_url,
        primary_type_guess: seed.category || null,
        region_hints: seed.location ? [seed.location] : [],
        state: seed.state || null,
        discovery_source: seed.sources?.join('+') || seed.source,
        status: 'discovering',
        name_variants: nameVariants,
        shadow_run: true,
      })
      .select('*')
      .single()

    if (insertErr) {
      const existing = await findExistingCandidate(slug, seed.website_url)
      if (existing) {
        // Guard: never re-pipeline calibration rows (shadow_run=false)
        if (existing.shadow_run === false) {
          console.log(`  SKIP: ${seed.name} — calibration row (shadow_run=false), not re-pipelining`)
          continue
        }
        counts.skippedExisting++
        candidatesForPipeline.push(existing)
      } else {
        console.error(`  INSERT ERROR: ${seed.name} — ${insertErr.message}`)
      }
      continue
    }

    counts.inserted++
    candidatesForPipeline.push(created)
    if (counts.inserted % 50 === 0) console.log(`  inserted ${counts.inserted}...`)
  }

  console.log(`  Inserted: ${counts.inserted} new candidates (${counts.skippedExisting} already existed)`)

  // Phase 4: Pipeline
  console.log(`\n─── Phase 4: 6-stage pipeline (${candidatesForPipeline.length} candidates) ───\n`)

  for (let i = 0; i < candidatesForPipeline.length; i++) {
    const cand = candidatesForPipeline[i]
    const label = `[${i + 1}/${candidatesForPipeline.length}] ${cand.name}`
    try {
      const result = await runWayDiscoveryPipeline(cand, sb, {
        fieldClient,
        log: (stage, msg) => {}, // quiet — just show progress
      })
      counts.pipelineRun++
      console.log(`  ✓ ${label} — ${result.totalSignals} signals (${result.elapsedMs}ms)`)
    } catch (e) {
      counts.pipelineErrors++
      console.error(`  ✗ ${label} — ${e?.message || e}`)
    }
  }

  // Summary
  console.log(`\n═══ Shadow Run Complete ═══\n`)
  console.log(`  Seeds scraped:    ${tourismAwards.length + ecoCertified.length}`)
  console.log(`  After dedup:      ${seeds.length}`)
  console.log(`  Gate 1 pass:      ${counts.gate1Pass}`)
  console.log(`  Gate 1 fail:      ${counts.gate1Fail}`)
  console.log(`  Candidates in DB: ${counts.inserted + counts.skippedExisting}`)
  console.log(`  Pipeline run:     ${counts.pipelineRun}`)
  console.log(`  Pipeline errors:  ${counts.pipelineErrors}`)
  console.log(`  ${elapsed(t0)}`)
}

function elapsed(t0) {
  const s = Math.round((Date.now() - t0) / 1000)
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${s % 60}s elapsed` : `${s}s elapsed`
}

main().catch(e => { console.error('FATAL:', e?.message || e); process.exit(1) })
