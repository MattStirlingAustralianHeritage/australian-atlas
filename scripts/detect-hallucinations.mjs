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
import { resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { argv, exit, env } from 'node:process'

// ── Corpus weights — canonical source: docs/banned-phrase-corpus.md ──
// Exported so the calibration runner reads the same constants the CLI uses.

export const WEIGHTS = {
  template: 50,         // Tier 1-T verbatim template sentence (auto-HIGH)
  tier1: 10,            // Tier 1 phrase
  tier2_standard: 3,    // Tier 2 entries 2.1–2.6 (≤20% leak)
  tier2_tiebreaker: 1,  // Tier 2 entries 2.7–2.10 (>20% leak)
  tier3: 2,             // Tier 3 structural pattern
  // Tier 3 lowered from 4 → 2 during calibration. The 3.1+3.4 stack on
  // legitimate inventory-list descriptions (e.g. cheese listings, furniture
  // brand stockists) was producing 8-point scores well above the LOW
  // threshold. At weight 2 the stack scores 4 (CLEAN), while genuine
  // hallucinations are still caught via their phrase signals (Tier 1 and
  // template hits dominate the score regardless of Tier 3 weight).
}

export const THRESHOLDS = {
  HIGH: 25,
  MEDIUM: 15,
  LOW: 5,
}

// ── Tier 1: strong-signal entries (single hit warrants flagging) ──
//
// Each entry is either:
//   { phrase: 'string' }          — case-insensitive substring match
//   { regex: /.../i, label: '…' } — regex pattern with display label
//
// Original 12 entries from the May 2026 Found/Corner/FG analysis: zero
// non-April hits each.
// Entries 1.13–1.23 added in Part 4a (2026-05-28) from Table-template
// corpus expansion. Each had zero true-external leak across the four-pool
// leak analysis (seed / known-good / table-real / cross-vertical food-adj).

const TIER_1_ENTRIES = [
  // ── Original Found/Corner/Fine Grounds corpus (1.1–1.12) ──
  { phrase: 'particularly known for' },
  { phrase: 'must-visit' },
  { phrase: 'worth a visit' },
  { phrase: 'delightful destination' },
  { phrase: 'a wonderful destination' },
  { phrase: 'destination for families' },
  { phrase: 'passionate booksellers' },
  { phrase: 'personal recommendations' },
  { phrase: 'stationery lovers' },
  { phrase: 'anyone looking to discover' },
  { phrase: 'artisan craftsmanship' },
  { phrase: 'quality pressings' },
  // ── Part 4a Table-template additions (1.13–1.23) ──
  { regex: /expertly crafted (dishes|meals|items|food|cocktails|pastries|drinks|cuisine|coffee|breads)/gi,
    label: 'expertly crafted [object]' },
  { regex: /honou?ring classic [\w\- ]+ traditions/gi,
    label: 'honoring classic [X] traditions' },
  { regex: /while embracing/gi,
    label: 'while embracing' },
  { regex: /creates? the perfect setting for/gi,
    label: 'create the perfect setting for' },
  { regex: /combines culinary creativity with/gi,
    label: 'combines culinary creativity with' },
  { regex: /commitment to sustainable practices/gi,
    label: 'commitment to sustainable practices' },
  { regex: /exceptional ingredients/gi,
    label: 'exceptional ingredients' },
  { regex: /designed for passing around/gi,
    label: 'designed for passing around' },
  { regex: /elegant dining spaces?/gi,
    label: 'elegant dining spaces' },
  { regex: /selection of complementary/gi,
    label: 'selection of complementary' },
  { regex: /complemented by an impressive selection/gi,
    label: 'complemented by an impressive selection' },
  // ── Part 4a iteration additions (1.24–1.25) ──
  // Single-seed entries with zero true-external leak. Promoted under the
  // "rare and structurally distinctive" rule. Surfaced during the
  // score-2 cohort iteration sampling pass.
  { regex: /culinary fusion/gi,
    label: 'culinary fusion' },
  { regex: /evolved approach to contemporary cuisine/gi,
    label: 'evolved approach to contemporary cuisine' },
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
// Same entry shape as TIER_1_ENTRIES (phrase or regex).

const TIER_2_STANDARD_ENTRIES = [
  // entries 2.1–2.6 (≤20% leak rate, original corpus)
  { phrase: 'known for' },
  { phrase: 'specialising in' },
  { phrase: 'a haven for' },
  { phrase: 'destination for anyone' },
  { phrase: 'for anyone' },
  { phrase: 'book lovers' },
  // ── Part 4a Table-template additions (2.11–2.12) ──
  { regex: /this independent (venue|restaurant|establishment|cafe|café|bakery|patisserie|shop|store|destination|space)/gi,
    label: 'this independent [venue]' },
  { regex: /alongside classic [\w\- ]+ (favorites|favourites|dishes|options)/gi,
    label: 'alongside classic [X] favorites' },
]

const TIER_2_TIEBREAKER_ENTRIES = [
  // entries 2.7–2.10 (>20% leak rate — tiebreaker only)
  { phrase: 'anyone seeking' },
  { phrase: 'rare finds' },
  { phrase: 'thoughtfully curated' },
  { phrase: 'carefully curated' },
  // ── Part 4a Table-template addition (2.13) ──
  { regex: /with a focus on/gi,
    label: 'with a focus on' },
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

  // 3.3 CTA ending — final sentence contains a CTA *phrase*, not just any
  // CTA-flavoured word. Calibration showed the bare-word version false-fired
  // on legitimate uses like "somewhere worth being" or "worth a watch".
  // The phrase patterns are tighter and align with how the seed generator
  // actually closed its templates.
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean)
  const lastSentence = sentences[sentences.length - 1] || ''
  const CTA_PHRASES = /\b(worth a visit|worth visiting|worth stopping|must[\s-]visit|must[\s-]see|don't miss|stop by|a haven for|a destination for|a delightful destination|a wonderful destination)\b/i
  if (CTA_PHRASES.test(lastSentence)) {
    hits.push({ pattern: '3.3 CTA ending' })
  }

  // 3.4 Long comma list — any sentence with 5+ commas. Threshold history:
  //   Part 3 set ≥3, then ≥4 to avoid false-fires on furniture brand
  //   stockist lists ("HAY, Muuto, Ferm Living, Carl Hansen Søn").
  //   Part 4a raised to ≥5 because ≥4 still caught legitimate Table
  //   producer/menu lists (Africola's wine producers, sprout-artisan's
  //   wholesale customers, panna-artisan's product attribute lists).
  //   The seed-generator's true inventory dumps ran 5–7 commas per
  //   sentence in their closer lists, so ≥5 still catches the pattern.
  if (sentences.some(s => (s.match(/,/g) || []).length >= 5)) {
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

  // 3.7 Missing apostrophe in possessive proper noun — REMOVED post-
  // calibration. The corpus said this pattern was in only 1 of 94 archived
  // descriptions (1.1%), but calibration showed it false-fires on any
  // plural-capital followed by capital ("Owners Lesley", "Lakes National",
  // "Heaths Old", any "Bay of Martyrs Blue" coastal place name). High FP
  // rate, near-zero recall — net negative. Removed from scoring.

  // 3.8 Promotional "located in" suffix (promoted from Tier 2).
  if (LOCATED_IN_PROMOTIONAL_RE.test(text)) {
    hits.push({ pattern: '3.8 located-in promotional suffix' })
  }

  // 3.9 Celebrating + adj-pair + foodword (Part 4a addition). Gerund
  // construction with comma-separated adjective pair before a food noun.
  // Example matches: "celebrating premium, seasonal ingredients"
  // (butcher-and-the-farmer-tramsheds), "celebrating healthy, delicious
  // food" (avocado-moment-cafe). Structural scaffold, zero external leak
  // in Part 4a four-pool analysis.
  const CELEBRATING_ADJ_PAIR_RE = /celebrating [a-z]+,\s*[a-z]+\s+(ingredients|food|dishes|produce|cuisine|fare|offerings|flavou?rs)/i
  if (CELEBRATING_ADJ_PAIR_RE.test(text)) {
    hits.push({ pattern: '3.9 celebrating adj-pair foodword' })
  }

  // 3.10 "^A charming [vertical]" description-opener (Part 4a iteration).
  // Structural signature of the seed generator's "A charming [adj]
  // [vertical] [...]" template. Cross-vertical: catches both Table
  // (bakery-cafe-hazel, scenic-rim-farm-shop) and Corner (astoria-
  // romance-fantasy-bookstore) listings sharing the template family.
  // Anchored at description start — mid-sentence "charming" is common
  // editorial use and would over-fire; opener position is the specific
  // rhetorical move the template makes.
  const CHARMING_OPENER_RE = /^A charming [\w\- ]+(cafe|café|bakery|restaurant|patisserie|venue|destination|space|establishment|market|dairy|farm|shop|store|hobby)/i
  if (CHARMING_OPENER_RE.test(text)) {
    hits.push({ pattern: '3.10 A charming opener' })
  }

  return hits
}

// ── Phrase matching ──

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findEntryMatches(text, entries) {
  const hits = []
  for (const e of entries) {
    const re = e.regex || new RegExp(escapeRegex(e.phrase), 'gi')
    const matches = text.match(re)
    if (matches && matches.length > 0) {
      hits.push({ value: e.label || e.phrase, count: matches.length })
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

export function score({ description, name }) {
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
  for (const h of findEntryMatches(description, TIER_1_ENTRIES)) {
    signals.push({ type: 'tier1', value: h.value, count: h.count, points: WEIGHTS.tier1 * h.count })
  }

  // Tier 2 standard
  for (const h of findEntryMatches(description, TIER_2_STANDARD_ENTRIES)) {
    signals.push({ type: 'tier2_std', value: h.value, count: h.count, points: WEIGHTS.tier2_standard * h.count })
  }

  // Tier 2 tiebreaker
  for (const h of findEntryMatches(description, TIER_2_TIEBREAKER_ENTRIES)) {
    signals.push({ type: 'tier2_tb', value: h.value, count: h.count, points: WEIGHTS.tier2_tiebreaker * h.count })
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

  // No exit(0) — let main() return naturally so buffered stdout flushes.
  // Calling process.exit() here was racing the flush and producing empty
  // CLI output on some terminals.
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

// Only run main() when invoked directly as a CLI. When imported as a module
// (e.g. by scripts/calibrate-detector.mjs), the scoring exports are reusable
// without firing the network fetch.
//
// Comparing import.meta.url against argv[1] directly is brittle:
//   - argv[1] may be relative (`scripts/x.mjs`) while import.meta.url is absolute.
//   - argv[1] is undefined when this module is dynamic-imported.
//   - Paths with spaces get URL-encoded in import.meta.url (%20).
// fileURLToPath normalises all three.
const scriptPath = fileURLToPath(import.meta.url)
const argvPath = argv[1] ? resolvePath(argv[1]) : null
const isCli = argvPath !== null && scriptPath === argvPath
if (isCli) main().catch(err => { console.error(err); exit(1) })
