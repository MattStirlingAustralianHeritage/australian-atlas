#!/usr/bin/env node

/**
 * scripts/discovery-stage1.mjs
 *
 * Phase 3 Stage 1 CLI per docs/pitch-system-phase3-design.md §Stage 1 → CLI.
 * Takes one or more listing IDs (or slugs), runs the discovery pipeline
 * against each, and either writes validated rows to pitch_sources /
 * pitch_characters / pitch_character_attributes / pitch_signals (production)
 * or prints the full extraction + validation trace to stdout (dry-run).
 *
 * Usage:
 *   node scripts/discovery-stage1.mjs --dry-run --listing-slug=<slug>
 *   node scripts/discovery-stage1.mjs --listing-slug=<slug>             # writes
 *
 * Required env (in ./.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ANTHROPIC_API_KEY
 *
 * Env loading mirrors scripts/pitch-generate.mjs — inline-regex parser with
 * explicit quote-stripping. The project has two competing env-loader patterns;
 * this one is the variant that works against the current .env.local shape.
 *
 * Gate 1 calibration: five listings, dry-run mandatory, editor at the
 * keyboard reading every extracted excerpt against the source page.
 *
 *   node scripts/discovery-stage1.mjs \
 *     --dry-run \
 *     --listing-slug=black-gate-distillery-mendooran \
 *     --listing-slug=timboon-distillery \
 *     --listing-slug=melbourne-tram-museum \
 *     --listing-slug=apostle-whey-cheese \
 *     --listing-slug=alkina-lodge
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { runStage1 } from '../lib/pitch/stage1/orchestrate.mjs'

// ── Env loading ─────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  try {
    const raw = readFileSync(resolve(__dirname, '../.env.local'), 'utf-8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (!m) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      process.env[m[1]] = v
    }
  } catch {}
}
loadEnv()

// ── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const listingIds = []
const listingSlugs = []
let dryRun = false

for (const arg of args) {
  if (arg === '--help' || arg === '-h') {
    printUsage()
    process.exit(0)
  } else if (arg === '--dry-run') {
    dryRun = true
  } else if (arg.startsWith('--listing-id=')) {
    listingIds.push(arg.slice('--listing-id='.length))
  } else if (arg.startsWith('--listing-slug=')) {
    listingSlugs.push(arg.slice('--listing-slug='.length))
  } else {
    console.error(`Unknown argument: ${arg}`)
    printUsage()
    process.exit(1)
  }
}

if (listingIds.length === 0 && listingSlugs.length === 0) {
  console.error('At least one --listing-id or --listing-slug is required.\n')
  printUsage()
  process.exit(1)
}

if (!dryRun) {
  console.error('━'.repeat(72))
  console.error('  PRODUCTION MODE — pitch_sources / pitch_characters /')
  console.error('  pitch_character_attributes / pitch_signals will be written.')
  console.error('  Use --dry-run for calibration and review passes.')
  console.error('━'.repeat(72))
  console.error('')
}

// ── Supabase + Anthropic ────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.')
  process.exit(1)
}
if (!ANTHROPIC_KEY) {
  console.error('Missing ANTHROPIC_API_KEY in environment.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
})

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const resolvedIds = [...listingIds]
  for (const slug of listingSlugs) {
    const { data, error } = await supabase
      .from('listings')
      .select('id, slug')
      .eq('slug', slug)
      .maybeSingle()
    if (error) {
      console.error(`Failed to resolve slug "${slug}": ${error.message}`)
      process.exit(1)
    }
    if (!data) {
      console.error(`No listing found for slug "${slug}".`)
      process.exit(1)
    }
    resolvedIds.push(data.id)
  }

  const t0 = Date.now()
  const summaries = []

  let i = 0
  for (const listingId of resolvedIds) {
    i++
    console.log(`\n${'═'.repeat(72)}`)
    console.log(`  Listing ${i}/${resolvedIds.length} — id=${listingId}`)
    console.log(`${'═'.repeat(72)}`)

    let summary
    try {
      summary = await runStage1(listingId, {
        supabase,
        dryRun,
        log: (level, msg) => {
          // Surface info/warn/error to stderr so stdout stays human-readable
          if (level === 'debug') return
          console.error(`  [${level}] ${msg}`)
        },
      })
    } catch (err) {
      console.error(`\n  ✗ Orchestrator threw: ${err?.stack || err?.message || String(err)}\n`)
      summaries.push({ listing_id: listingId, kind: 'orchestrator_error', error: err?.message })
      continue
    }

    summaries.push(summary)
    printSummary(summary)
  }

  // ── Run-level summary ────────────────────────────────────────────────────
  console.log(`\n${'━'.repeat(72)}`)
  console.log('  Run summary')
  console.log(`${'━'.repeat(72)}`)
  console.log(`  Total listings:    ${resolvedIds.length}`)
  console.log(`  Mode:              ${dryRun ? 'DRY-RUN (no DB writes)' : 'PRODUCTION'}`)
  console.log(`  Elapsed:           ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  console.log(`  Outcomes:`)
  const counts = {}
  for (const s of summaries) counts[s.kind] = (counts[s.kind] || 0) + 1
  for (const [kind, n] of Object.entries(counts).sort()) {
    console.log(`    ${kind.padEnd(28)} ${n}`)
  }

  // Aggregate totals across all successful summaries
  const ok = summaries.filter(s => s.kind === 'ok')
  if (ok.length > 0) {
    const totals = {
      pages_fetched: ok.reduce((a, s) => a + (s.pages_fetched || 0), 0),
      characters_extracted: ok.reduce((a, s) => a + (s.characters_extracted || 0), 0),
      characters_validated: ok.reduce((a, s) => a + (s.characters_validated || 0), 0),
      attributes_extracted: ok.reduce((a, s) => a + (s.attributes_extracted || 0), 0),
      attributes_validated: ok.reduce((a, s) => a + (s.attributes_validated || 0), 0),
      signals_extracted: ok.reduce((a, s) => a + (s.signals_extracted || 0), 0),
      signals_validated: ok.reduce((a, s) => a + (s.signals_validated || 0), 0),
    }
    console.log(`  Aggregates (ok listings only):`)
    for (const [k, v] of Object.entries(totals)) {
      console.log(`    ${k.padEnd(28)} ${v}`)
    }
  }
  console.log('')
}

// ── Per-listing rendering ───────────────────────────────────────────────────

function printSummary(s) {
  console.log(`\n  Slug:                ${s.listing_slug ?? '<unknown>'}`)
  console.log(`  Outcome:             ${s.kind}`)
  console.log(`  Pages attempted:     ${s.pages_attempted}`)
  console.log(`  Pages fetched:       ${s.pages_fetched}`)

  if (s.kind !== 'ok') {
    if (s.error) console.log(`  Error:               ${s.error}`)
    if (s.fetch_errors?.length) {
      console.log(`  Fetch errors:`)
      for (const e of s.fetch_errors) {
        console.log(`    • ${e.url}  (${e.status ?? 'network'}${e.error ? ' — ' + e.error : ''})`)
      }
    }
    return
  }

  console.log(`  Characters:          ${s.characters_validated}/${s.characters_extracted} validated`)
  console.log(`  Attributes:          ${s.attributes_validated}/${s.attributes_extracted} validated`)
  console.log(`  Signals:             ${s.signals_validated}/${s.signals_extracted} validated`)
  console.log(`  Sources inserted:    ${s.sources_inserted}`)

  // Detailed dry-run trace — every validated character + signal with their
  // excerpts, plus every invalid item with rejection reason. The editor uses
  // this to spot-check every claim against the source page.
  const v = s.validation
  if (!v) return

  if (v.valid.characters.length > 0) {
    console.log(`\n  ── VALIDATED CHARACTERS ─────────────────────────────────────`)
    for (const c of v.valid.characters) {
      console.log(`\n  ✓ ${c.name}${c.role ? ` (${c.role})` : ''}`)
      console.log(`    source_url:     ${c.source_url}`)
      console.log(`    excerpt:        "${truncate(c.source_excerpt, 120)}"`)
      if (c.attributes && c.attributes.length > 0) {
        console.log(`    attributes (${c.attributes.length}):`)
        for (const a of c.attributes) {
          console.log(`      • [${a.attribute_type}] (${a.confidence}) ${truncate(a.attribute_text, 80)}`)
          console.log(`        excerpt: "${truncate(a.source_excerpt, 100)}"`)
        }
      }
    }
  }

  if (v.valid.venue_signals.length > 0) {
    console.log(`\n  ── VALIDATED SIGNALS ────────────────────────────────────────`)
    for (const sig of v.valid.venue_signals) {
      console.log(`\n  ✓ ${sig.signal_type}`)
      console.log(`    source_url:     ${sig.source_url}`)
      console.log(`    excerpt:        "${truncate(sig.source_excerpt, 120)}"`)
      console.log(`    signal_data:    ${JSON.stringify(sig.signal_data ?? {})}`)
    }
  }

  if (v.invalid.length > 0) {
    console.log(`\n  ── REJECTED (${v.invalid.length}) ────────────────────────────────────────`)
    for (const inv of v.invalid) {
      const where = inv.parent ? ` (parent: ${inv.parent.name ?? '<unknown>'})` : ''
      console.log(`\n  ✗ ${inv.kind}${where} — ${inv.reason}`)
      if (inv.item?.name) console.log(`    name:     ${inv.item.name}`)
      if (inv.item?.signal_type) console.log(`    type:     ${inv.item.signal_type}`)
      if (inv.item?.attribute_type) console.log(`    type:     ${inv.item.attribute_type}`)
      if (inv.item?.source_url) console.log(`    url:      ${inv.item.source_url}`)
      if (inv.item?.source_excerpt) console.log(`    excerpt:  "${truncate(inv.item.source_excerpt, 120)}"`)
    }
  }
}

function truncate(s, n) {
  if (s == null) return '<null>'
  const str = String(s)
  return str.length > n ? str.slice(0, n - 1) + '…' : str
}

function printUsage() {
  console.log(`Usage:
  node scripts/discovery-stage1.mjs [options]

Reads env vars from ./.env.local. Required: NEXT_PUBLIC_SUPABASE_URL,
SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY.

Options:
  --listing-id=<uuid>        Listing UUID to discover (repeatable).
  --listing-slug=<slug>      Listing slug to resolve to a UUID (repeatable).
  --dry-run                  Skip all DB writes. Print extraction + validation
                             trace to stdout. REQUIRED for calibration.
  -h, --help                 Show this help.

Gate 1 calibration (five listings, dry-run, editor at the keyboard reading
every excerpt against source):

  node scripts/discovery-stage1.mjs \\
    --dry-run \\
    --listing-slug=black-gate-distillery-mendooran \\
    --listing-slug=timboon-distillery \\
    --listing-slug=melbourne-tram-museum \\
    --listing-slug=apostle-whey-cheese \\
    --listing-slug=alkina-lodge

Production:
  - Validated rows are inserted into pitch_sources, pitch_characters,
    pitch_character_attributes, pitch_signals.
  - One pitch_sources row per fetched page (audit trail).
  - Items that fail substring validation are dropped silently from inserts
    but appear in the stdout trace.
`)
}

main().catch(err => {
  console.error('Fatal:', err?.stack || err?.message || String(err))
  process.exit(1)
})
