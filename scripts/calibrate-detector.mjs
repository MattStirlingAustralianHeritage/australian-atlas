#!/usr/bin/env node
//
// calibrate-detector.mjs
//
// Part 3 calibration runner for the hallucination detector. Samples
// known-good (post-April Candidate Review) and known-bad (status='hidden'
// archived SSOT cleanup) control sets, scores each via the detector's
// public score() function, and reports:
//
//  - False-positive rate on known-good at score ≥ LOW threshold
//  - Catch rate on known-bad at score ≥ HIGH threshold
//  - Score distribution for each control set
//  - Specific false positives + false negatives with their signal stacks
//
// Calibration targets (from the work plan):
//  - Known-good: <5% false positive at score ≥ 5
//  - Known-bad: 100% catch at score ≥ 10 (HIGH = 25 currently)
//
// If targets fail, the script identifies which signals are responsible.
// Adjust the constants in detect-hallucinations.mjs and re-run.
//
// Usage:
//   node --env-file=.env.local scripts/calibrate-detector.mjs

import { createClient } from '@supabase/supabase-js'
import { argv, exit, env } from 'node:process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { score, THRESHOLDS, WEIGHTS } from './detect-hallucinations.mjs'

const KNOWN_GOOD_SIZE = 50
const KNOWN_BAD_SIZE = 20
const SEED = 42

// Versioned, audited exclusion list for the known-good pool. Each entry
// documents a listing whose data_source label misrepresents its content
// (e.g. manually_curated label over template content). Surfaced during
// Part 4a stratified eyeballing; mechanism documented in
// docs/table-data-quality-findings-2026-05-25.md (2026-05-28 update).
//
// Exclusions are filtered out of the known-good pool AFTER the DB query
// so the query predicate stays a documented intent. To add an exclusion,
// edit the JSON directly with a `reason` field — the list is data, not
// logic, and each entry should be individually justifiable from the file.
const __dirname = dirname(fileURLToPath(import.meta.url))
const EXCLUSIONS_PATH = join(__dirname, 'calibration-known-good-exclusions.json')
const KNOWN_GOOD_EXCLUSIONS = JSON.parse(readFileSync(EXCLUSIONS_PATH, 'utf-8'))
const EXCLUDED_SLUGS = new Set(KNOWN_GOOD_EXCLUSIONS.map(e => e.slug))

function mulberry32(seed) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6D2B79F5) >>> 0
    let x = t
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle(arr, rand) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function fetchAll(sb, baseQuery, pageSize = 1000) {
  let all = []
  let from = 0
  while (true) {
    const { data, error } = await baseQuery().range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

async function main() {
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
    console.error('Run with: node --env-file=.env.local scripts/calibrate-detector.mjs')
    exit(2)
  }
  const sb = createClient(url, key)
  const rand = mulberry32(SEED)

  // ── Known-good pool: post-seed-batch curator-approved content ──
  // The work plan says "listings that have passed Candidate Review (curated,
  // not seed-generated)". The crucial filter is created_at > 2026-04-01 —
  // the seed batch ran on 2026-04-01 and some of its output was mislabeled
  // as data_source='manually_curated' afterwards (e.g. red-cross-subiaco,
  // salvos-bunbury both have verbatim "Particularly known for [X], [Y]"
  // Tier 1 phrasing but data_source='manually_curated'). The date filter
  // excludes that contamination. Within the post-seed cohort:
  //   - operator_verified: human operator submitted content directly
  //   - manually_curated: human curator wrote content directly
  //   - ai_generated (post-2026-04-01): went through Candidate Review with
  //     human approval — the corpus says these "should score CLEAN or LOW"
  const goodPoolRaw = await fetchAll(sb, () => sb.from('listings')
    .select('id, slug, vertical, name, description, data_source, created_at')
    .eq('status', 'active')
    .gt('created_at', '2026-04-02')
    .in('data_source', ['manually_curated', 'operator_verified', 'ai_generated'])
    .not('description', 'is', null)
    .order('id'))

  // Post-fetch filter: drop listings whose data_source label is known to
  // misrepresent the content. See calibration-known-good-exclusions.json.
  const goodPool = goodPoolRaw.filter(l => !EXCLUDED_SLUGS.has(l.slug))
  const excludedHits = goodPoolRaw.length - goodPool.length
  if (excludedHits > 0) {
    console.log(`Known-good pool: excluded ${excludedHits} mislabeled listing(s) per exclusions JSON:`)
    for (const l of goodPoolRaw.filter(l => EXCLUDED_SLUGS.has(l.slug))) {
      const reason = KNOWN_GOOD_EXCLUSIONS.find(e => e.slug === l.slug)?.reason ?? '(no reason)'
      console.log(`  ${l.vertical}/${l.slug}: ${reason}`)
    }
  }

  // ── Known-bad pool: hidden archived from the SSOT cleanups ──
  // Per commit history: Found (n=24), Corner (n=42), Fine Grounds (n=27)
  // were archived to status='hidden'.
  const badPool = await fetchAll(sb, () => sb.from('listings')
    .select('id, slug, vertical, name, description, data_source')
    .eq('status', 'hidden')
    .in('vertical', ['found', 'corner', 'fine_grounds'])
    .not('description', 'is', null)
    .order('id'))

  console.log(`Known-good pool: ${goodPool.length} listings (manually_curated + operator_verified)`)
  console.log(`Known-bad pool : ${badPool.length} listings (status=hidden, Found+Corner+Fine Grounds)`)

  const good = shuffle(goodPool, rand).slice(0, KNOWN_GOOD_SIZE)
  const bad = shuffle(badPool, rand).slice(0, KNOWN_BAD_SIZE)

  console.log(`\nSampling: ${good.length} known-good, ${bad.length} known-bad (seed=${SEED})`)
  console.log(`Current weights : ${JSON.stringify(WEIGHTS)}`)
  console.log(`Current thresholds: ${JSON.stringify(THRESHOLDS)}`)
  console.log()

  const scoreOne = (l) => ({
    id: l.id, slug: l.slug, vertical: l.vertical, name: l.name,
    data_source: l.data_source,
    ...score({ description: l.description, name: l.name }),
  })
  const goodScored = good.map(scoreOne)
  const badScored = bad.map(scoreOne)

  // ── Known-good: false-positive metrics ──
  const goodFlagged = goodScored.filter(r => r.classification !== 'CLEAN')
  const goodHigh = goodScored.filter(r => r.classification === 'HIGH')
  const goodMed = goodScored.filter(r => r.classification === 'MEDIUM')
  const goodLow = goodScored.filter(r => r.classification === 'LOW')
  const goodFpRate = (goodFlagged.length / good.length * 100).toFixed(1)

  console.log('━━━ KNOWN-GOOD (curator-approved content; should score CLEAN) ━━━')
  console.log(`Distribution:`)
  console.log(`  CLEAN  : ${good.length - goodFlagged.length}/${good.length}`)
  console.log(`  LOW    : ${goodLow.length}/${good.length}`)
  console.log(`  MEDIUM : ${goodMed.length}/${good.length}`)
  console.log(`  HIGH   : ${goodHigh.length}/${good.length}`)
  console.log(`False-positive rate at score ≥ LOW: ${goodFpRate}%   target: <5%`)
  console.log(`False-positive rate at score ≥ MEDIUM: ${((goodMed.length + goodHigh.length) / good.length * 100).toFixed(1)}%   target: 0%`)
  console.log(`Pass: ${goodFpRate < 5 ? 'YES' : 'NO'} (LOW), ${(goodMed.length + goodHigh.length) === 0 ? 'YES' : 'NO'} (MEDIUM+)`)

  if (goodFlagged.length) {
    console.log(`\nFalse positives on known-good (top 10 by score):`)
    for (const r of goodFlagged.slice().sort((a, b) => b.score - a.score).slice(0, 10)) {
      const sigs = r.signals.map(s => `${s.type}:${s.value.replace(/\s+/g, ' ').slice(0, 30)}(×${s.count})`).join(', ')
      console.log(`  [${r.classification.padEnd(6)}] ${r.vertical.padEnd(13)} ${r.slug.padEnd(45)} score=${r.score}`)
      console.log(`            ${sigs}`)
    }
  }

  // ── Known-bad: catch metrics ──
  const badHigh = badScored.filter(r => r.classification === 'HIGH')
  const badMed = badScored.filter(r => r.classification === 'MEDIUM')
  const badLow = badScored.filter(r => r.classification === 'LOW')
  const badClean = badScored.filter(r => r.classification === 'CLEAN')
  const badCatchHigh = (badHigh.length / bad.length * 100).toFixed(1)
  const badCatchMedPlus = ((badHigh.length + badMed.length) / bad.length * 100).toFixed(1)

  console.log('\n━━━ KNOWN-BAD (archived hallucinated; should score HIGH) ━━━')
  console.log(`Distribution:`)
  console.log(`  CLEAN  : ${badClean.length}/${bad.length}`)
  console.log(`  LOW    : ${badLow.length}/${bad.length}`)
  console.log(`  MEDIUM : ${badMed.length}/${bad.length}`)
  console.log(`  HIGH   : ${badHigh.length}/${bad.length}`)
  console.log(`Catch rate at HIGH: ${badCatchHigh}%   target: 100%`)
  console.log(`Catch rate at MEDIUM+: ${badCatchMedPlus}%`)
  console.log(`Pass: ${badCatchHigh == 100 ? 'YES' : 'NO'}`)

  const missed = badScored.filter(r => r.classification !== 'HIGH')
  if (missed.length) {
    console.log(`\nKnown-bad listings NOT scoring HIGH (need investigation):`)
    for (const r of missed.sort((a, b) => a.score - b.score)) {
      const sigs = r.signals.map(s => `${s.type}:${s.value.replace(/\s+/g, ' ').slice(0, 30)}(×${s.count})`).join(', ') || '(no signals)'
      console.log(`  [${r.classification.padEnd(6)}] ${r.vertical.padEnd(13)} ${r.slug.padEnd(45)} score=${r.score}`)
      console.log(`            ${sigs}`)
    }
  }

  // ── Score distributions ──
  console.log('\n━━━ Score distributions ━━━')
  const goodScores = goodScored.map(r => r.score).sort((a, b) => a - b)
  const badScores = badScored.map(r => r.score).sort((a, b) => a - b)
  const pct = (arr, p) => arr[Math.floor(arr.length * p / 100)]
  console.log(`Known-good scores:`)
  console.log(`  min=${goodScores[0]}  p25=${pct(goodScores, 25)}  p50=${pct(goodScores, 50)}  p75=${pct(goodScores, 75)}  p90=${pct(goodScores, 90)}  max=${goodScores[goodScores.length-1]}`)
  console.log(`Known-bad scores:`)
  console.log(`  min=${badScores[0]}  p25=${pct(badScores, 25)}  p50=${pct(badScores, 50)}  p75=${pct(badScores, 75)}  p90=${pct(badScores, 90)}  max=${badScores[badScores.length-1]}`)

  // ── Summary ──
  const allPass = goodFpRate < 5 && badCatchHigh == 100
  console.log(`\n━━━ Calibration verdict ━━━`)
  console.log(`Known-good FP rate at score ≥ LOW   (target <5%): ${goodFpRate}%  ${goodFpRate < 5 ? '✓' : '✗'}`)
  console.log(`Known-bad catch rate at HIGH       (target 100%): ${badCatchHigh}%  ${badCatchHigh == 100 ? '✓' : '✗'}`)
  console.log(`Overall: ${allPass ? 'CALIBRATION PASSES' : 'CALIBRATION FAILS — adjust constants and re-run'}`)
  exit(allPass ? 0 : 1)
}

main().catch(err => { console.error(err); exit(1) })
