#!/usr/bin/env node
//
// detect-hallucinations.mjs
//
// Hallucinated-description detector for the Atlas portal listings table.
// Implements the corpus in docs/banned-phrase-corpus.md as the canonical
// specification. READ-ONLY — never mutates listings.
//
// Designed against the failure mode that produced the May 2026 SSOT
// archival work: the seed generator emitted ~5,722 listings on 2026-04-01
// with AI-generated descriptions that read plausibly but lack specific
// anchors and frequently share verbatim closing sentences. 94 of those
// were hand-archived (Found 24, Corner 42, Fine Grounds 28). This script
// flags the remainder for review.
//
// Usage:
//   node --env-file=.env.local scripts/detect-hallucinations.mjs --vertical=all
//   node --env-file=.env.local scripts/detect-hallucinations.mjs --vertical=table --csv=table-suspects.csv
//
// Flags:
//   --vertical=all|<key>   required. one of {sba,collection,craft,fine_grounds,
//                          rest,field,corner,found,table,way} or 'all'
//   --limit=N              cap rows scanned (default 20000)
//   --csv=path             optional CSV output (full signal detail)
//   --quiet                suppress LOW band in stdout (still in CSV)
//   --threshold=N          override the LOW threshold (default 5)
//
// Tuning constants are at the top of this file. Part 3 calibration
// adjusts them against known-good / known-bad control sets.

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { argv, exit, env } from 'node:process'

// ── Corpus weights — canonical source: docs/banned-phrase-corpus.md ──

const WEIGHTS = {
  template: 50,         // Tier 1-T verbatim template sentence (auto-HIGH)
  tier1: 10,            // Tier 1 phrase
  tier2_standard: 3,    // Tier 2 entries 2.1–2.6 (≤20% leak)
  tier2_tiebreaker: 1,  // Tier 2 entries 2.7–2.10 (>20% leak)
  tier3: 4,             // Tier 3 structural pattern
}

const THRESHOLDS = {
  HIGH: 25,
  MEDIUM: 15,
  LOW: 5,
}

// ── Tier 1: 12 strong-signal phrases (single hit warrants flagging) ──
// All have 0 non-April hits in the corpus analysis.

const TIER_1_PHRASES = [
  'particularly known for',
  'must-visit',
  'worth a visit',
  'delightful destination',
  'a wonderful destination',
  'destination for families',
  'passionate booksellers',
  'personal recommendations',
  'stationery lovers',
  'anyone looking to discover',
  'artisan craftsmanship',
  'quality pressings',
]

// ── Tier 1-T: 9 verbatim template sentences (auto-HIGH on match) ──

const TIER_1_TEMPLATES = [
  "a must-visit for book lovers seeking thoughtfully curated reads and personal recommendations from passionate booksellers",
  "a haven for stationery lovers, letter writers, and anyone who appreciates the art of beautiful paper goods and writing instruments",
  "worth a visit for vinyl enthusiasts and music lovers hunting for rare finds and quality pressings",
  "expect racks of carefully curated garments spanning decades, from mid-century dresses to retro denim and statement accessories",
  "a delightful destination for families and gift buyers looking for quality toys and games",
  "a wonderful destination for anyone looking to discover unique homewares, gifts, and beautifully crafted pieces for the home",
  "worth a visit for anyone seeking distinctive, often locally made jewellery pieces and artisan craftsmanship",
  "visitors can browse through cabinets of porcelain, silverware, and jewellery alongside larger pieces of period furniture and artwork",
  "browse showroom floors filled with restored sideboards, dining settings, armchairs, and lighting from the 1950s through the 1980s",
]

// ── Tier 2: weak signals, accumulation-only. Two weight bands. ──

const TIER_2_STANDARD = [
  // entries 2.1–2.6 (≤20% leak rate)
  'known for',
  'specialising in',
  'a haven for',
  'destination for anyone',
  'for anyone',
  'book lovers',
]

const TIER_2_TIEBREAKER = [
  // entries 2.7–2.10 (>20% leak rate — tiebreaker only)
  'anyone seeking',
  'rare finds',
  'thoughtfully curated',
  'carefully curated',
]

// ── Tier 3: structural patterns 3.1–3.8 ──

// Pattern 3.8 — promotional "located in" suffix.
// "Located in Adelaide, South Australia's elegant capital known for its festivals…"
// Verb list widened to handle template variants (known|famous|renowned|celebrated).
// Multi-word place names via optional repeat group.
const LOCATED_IN_PROMOTIONAL_RE = /located in [A-Z][a-z]+(\s[A-Z][a-z]+)*, [A-Z][a-z]+(\s[A-Z][a-z]+)*'s \w+ \w+ (known|famous|renowned|celebrated) for [^.]{20,}/i

function tier3Patterns(text, listingName) {
  const hits = []

  // 3.1 No specific anchors — no founding years, no concrete numbers.
  // The corpus says "every hallucinated description lacks verifiable
  // specifics." Real descriptions anchor in dates ("since 1976") and
  // numbers ("200 producers", "5pm Sundays"). Named-person detection is
  // unreliable without NER (would false-positive on place names), so we
  // key off numbers and four-digit years. If neither appears anywhere
  // in the text, the description is anchor-less.
  const hasYear = /\b(18|19|20)\d{2}\b/.test(text)
  const hasNumber = /\b\d{2,}\b/.test(text)
  if (!hasYear && !hasNumber) {
    hits.push({ pattern: '3.1 no specific anchors' })
  }

  // 3.2 "Known for [bare comma list]" — inventory dump structure.
  if (/Known for [A-Z][^.]{5,60},/.test(text)) {
    hits.push({ pattern: '3.2 known-for comma list' })
  }

  // 3.3 CTA ending — final sentence contains promotional/CTA wording.
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean)
  const lastSentence = sentences[sentences.length - 1] || ''
  if (/\b(visit|destination|stop by|don't miss|worth|haven|must)\b/i.test(lastSentence)) {
    hits.push({ pattern: '3.3 CTA ending' })
  }

  // 3.4 Long comma list — any sentence with 3+ commas.
  if (sentences.some(s => (s.match(/,/g) || []).length >= 3)) {
    hits.push({ pattern: '3.4 long comma list' })
  }

  // 3.5 "[Name] is a [category]" opener — description starts with venue
  // name followed by is-a/is-an/is-the within first 80 chars.
  if (listingName) {
    const firstChunk = text.slice(0, 120)
    const namePrefix = firstChunk.slice(0, listingName.length + 4)
    if (namePrefix.toLowerCase().startsWith(listingName.toLowerCase())) {
      const tail = firstChunk.slice(listingName.length, listingName.length + 80)
      if (/^\s+(is\s+an?|is\s+the)\s/i.test(tail)) {
        hits.push({ pattern: '3.5 is-a opener' })
      }
    }
  }

  // 3.6 Doubled location adjectives within the same sentence.
  const locAdj = '(vibrant|tropical|bustling|coastal|charming|picturesque)'
  for (const s of sentences) {
    const re = new RegExp(`\\b${locAdj}\\b[^.]*\\b\\1\\b`, 'i')
    if (re.test(s)) {
      hits.push({ pattern: '3.6 doubled location adjective' })
      break
    }
  }

  // 3.7 Missing apostrophe in possessive proper noun — e.g. "Fremantles".
  // Strict heuristic: capitalised word ending in 's' followed by capital,
  // where the prefix isn't a known plural pattern. Conservative regex:
  // matches "Xxxxs Xxxx" where the preceding word starts with capital.
  if (/\b[A-Z][a-z]{2,}s\s+[A-Z][a-z]+/.test(text)) {
    hits.push({ pattern: '3.7 missing apostrophe in possessive' })
  }

  // 3.8 Promotional "located in" suffix (promoted from Tier 2).
  if (LOCATED_IN_PROMOTIONAL_RE.test(text)) {
    hits.push({ pattern: '3.8 located-in promotional suffix' })
  }

  return hits
}

// ── Phrase matching ──

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findPhraseMatches(text, phrases) {
  const hits = []
  for (const p of phrases) {
    const re = new RegExp(escapeRegex(p), 'gi')
    const matches = text.match(re)
    if (matches && matches.length > 0) {
      hits.push({ phrase: p, count: matches.length })
    }
  }
  return hits
}

// Template sentence match: case-insensitive substring (the corpus templates
// are reproduced verbatim from archived descriptions; small whitespace
// drift is possible but case is the main normalisation needed).
function findTemplateMatches(text) {
  const lower = text.toLowerCase()
  const hits = []
  for (const tpl of TIER_1_TEMPLATES) {
    if (lower.includes(tpl.toLowerCase())) {
      hits.push({ template: tpl })
    }
  }
  return hits
}

// ── Scoring ──

function score({ description, name }) {
  if (!description) return { score: 0, signals: [], classification: 'CLEAN' }

  const signals = []

  // Template sentences (auto-HIGH)
  for (const t of findTemplateMatches(description)) {
    signals.push({
      type: 'template',
      value: t.template.slice(0, 60) + (t.template.length > 60 ? '…' : ''),
      count: 1,
      points: WEIGHTS.template,
    })
  }

  // Tier 1
  for (const h of findPhraseMatches(description, TIER_1_PHRASES)) {
    signals.push({ type: 'tier1', value: h.phrase, count: h.count, points: WEIGHTS.tier1 * h.count })
  }

  // Tier 2 standard
  for (const h of findPhraseMatches(description, TIER_2_STANDARD)) {
    signals.push({ type: 'tier2_std', value: h.phrase, count: h.count, points: WEIGHTS.tier2_standard * h.count })
  }

  // Tier 2 tiebreaker
  for (const h of findPhraseMatches(description, TIER_2_TIEBREAKER)) {
    signals.push({ type: 'tier2_tb', value: h.phrase, count: h.count, points: WEIGHTS.tier2_tiebreaker * h.count })
  }

  // Tier 3 structural
  for (const t3 of tier3Patterns(description, name)) {
    signals.push({ type: 'tier3', value: t3.pattern, count: 1, points: WEIGHTS.tier3 })
  }

  const total = signals.reduce((s, x) => s + x.points, 0)
  const hasTemplate = signals.some(s => s.type === 'template')

  let classification
  if (hasTemplate || total >= THRESHOLDS.HIGH) classification = 'HIGH'
  else if (total >= THRESHOLDS.MEDIUM) classification = 'MEDIUM'
  else if (total >= THRESHOLDS.LOW) classification = 'LOW'
  else classification = 'CLEAN'

  return { score: total, signals, classification }
}

// ── Main ──

function parseArgs(argv) {
  const out = {}
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/)
    if (m) out[m[1]] = m[2] === undefined ? true : m[2]
  }
  return out
}

const VALID_VERTICALS = ['sba','collection','craft','fine_grounds','rest','field','corner','found','table','way']

async function main() {
  const args = parseArgs(argv)
  if (!args.vertical || (args.vertical !== 'all' && !VALID_VERTICALS.includes(args.vertical))) {
    console.error('Usage: --vertical=all|<key>  [--limit=N] [--csv=path] [--quiet] [--threshold=N]')
    console.error(`Valid verticals: all, ${VALID_VERTICALS.join(', ')}`)
    exit(2)
  }
  const limit = Math.max(1, Math.min(20000, Number(args.limit) || 20000))
  if (args.threshold !== undefined) THRESHOLDS.LOW = Number(args.threshold) || THRESHOLDS.LOW

  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.')
    console.error('Run with: node --env-file=.env.local scripts/detect-hallucinations.mjs --vertical=...')
    exit(2)
  }
  const sb = createClient(url, key)

  // Fetch in chunks (PostgREST caps responses).
  const PAGE = 1000
  let all = []
  let from = 0
  while (from < limit) {
    const to = Math.min(from + PAGE - 1, limit - 1)
    let q = sb.from('listings')
      .select('id, slug, vertical, name, description, status, data_source, needs_review')
      .eq('status', 'active')
      .not('description', 'is', null)
      .order('id', { ascending: true })
      .range(from, to)
    if (args.vertical !== 'all') q = q.eq('vertical', args.vertical)
    const { data, error } = await q
    if (error) { console.error('fetch failed:', error.message); exit(1) }
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < PAGE) break
    from += PAGE
  }

  const scored = all.map(l => ({
    id: l.id, slug: l.slug, vertical: l.vertical, name: l.name,
    data_source: l.data_source, needs_review: l.needs_review,
    description_len: (l.description || '').length,
    ...score({ description: l.description, name: l.name }),
  }))

  const flagged = scored.filter(r => r.classification !== 'CLEAN')
    .sort((a, b) => b.score - a.score)
  const high = flagged.filter(r => r.classification === 'HIGH')
  const medium = flagged.filter(r => r.classification === 'MEDIUM')
  const low = flagged.filter(r => r.classification === 'LOW')

  // Stdout report
  console.log(`HALLUCINATION DETECTION SCAN`)
  console.log(`vertical: ${args.vertical}`)
  console.log(`listings scanned: ${all.length}`)
  console.log(`flagged: ${flagged.length} (${high.length} HIGH, ${medium.length} MEDIUM, ${low.length} LOW)`)
  console.log(`thresholds: HIGH ≥${THRESHOLDS.HIGH} | MEDIUM ${THRESHOLDS.MEDIUM}–${THRESHOLDS.HIGH - 1} | LOW ${THRESHOLDS.LOW}–${THRESHOLDS.MEDIUM - 1}`)
  console.log()

  if (high.length) {
    console.log(`HIGH CONFIDENCE (score ≥ ${THRESHOLDS.HIGH} or template match):`)
    for (const r of high) printRow(r, false)
    console.log()
  }
  if (medium.length) {
    console.log(`MEDIUM (score ${THRESHOLDS.MEDIUM}–${THRESHOLDS.HIGH - 1}):`)
    for (const r of medium) printRow(r, false)
    console.log()
  }
  if (low.length && !args.quiet) {
    console.log(`LOW (score ${THRESHOLDS.LOW}–${THRESHOLDS.MEDIUM - 1}):`)
    for (const r of low) printRow(r, true)
    console.log()
  } else if (low.length && args.quiet) {
    console.log(`(${low.length} LOW entries suppressed; rerun without --quiet or check CSV)`)
    console.log()
  }

  if (args.csv) {
    const lines = ['vertical,slug,name,score,classification,data_source,needs_review,signals,description_len']
    for (const r of flagged) {
      const sigSummary = r.signals.map(s => `${s.type}:${s.value.replace(/[,"]/g, ' ')}(×${s.count})`).join(' | ')
      lines.push([
        r.vertical,
        `"${r.slug}"`,
        `"${(r.name || '').replace(/"/g, '""')}"`,
        r.score,
        r.classification,
        r.data_source || '',
        r.needs_review ? 'true' : 'false',
        `"${sigSummary.replace(/"/g, '""')}"`,
        r.description_len,
      ].join(','))
    }
    writeFileSync(args.csv, lines.join('\n'))
    console.log(`CSV written to ${args.csv} (${flagged.length} rows)`)
  }

  exit(0)
}

function printRow(r, compact) {
  const v = (r.vertical || '').padEnd(13)
  const slug = (r.slug || '').padEnd(48)
  const scoreStr = String(r.score).padStart(3)
  if (compact) {
    console.log(`  ${v} ${slug} score ${scoreStr}`)
  } else {
    const sigSummary = r.signals.map(s => `${s.type}:${s.value}(×${s.count})`).join(', ')
    console.log(`  ${v} ${slug} score ${scoreStr}  [${sigSummary}]`)
  }
}

main().catch(err => { console.error(err); exit(1) })
