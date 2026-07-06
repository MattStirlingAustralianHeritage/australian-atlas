#!/usr/bin/env node

/**
 * Apply the sentence deletions approved in
 * docs/audits/2026-06-12-region-editorial-hallucination-audit.md.
 *
 * Deletion only — no copy is regenerated. Every `> ` blockquote in the audit
 * is one sentence to remove from BOTH regions.generated_intro and
 * regions.long_description (the audit verified the two columns are
 * byte-identical in every affected region).
 *
 * Usage:
 *   node --env-file=.env.local scripts/apply-region-editorial-audit-2026-06-12.mjs           # dry run
 *   node --env-file=.env.local scripts/apply-region-editorial-audit-2026-06-12.mjs --apply   # write
 *
 * Snapshots: before/after JSON per region under
 * docs/audits/2026-06-12-pre-outreach/, plus rollback.sql restoring the
 * original full text of both columns.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local', override: true })

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const AUDIT_PATH = path.join(ROOT, 'docs/audits/2026-06-12-region-editorial-hallucination-audit.md')
const SNAP_DIR = path.join(ROOT, 'docs/audits/2026-06-12-pre-outreach')

const apply = process.argv.includes('--apply')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ── Parse the audit: slug sections + blockquote sentences ──
function parseAudit() {
  const lines = readFileSync(AUDIT_PATH, 'utf8').split('\n')
  const bySlug = new Map()
  let slug = null
  let inProposed = false
  for (const line of lines) {
    if (/^## Proposed sentence deletions/.test(line)) inProposed = true
    if (!inProposed) continue
    const h = line.match(/^### ([a-z0-9-]+) —/)
    if (h) { slug = h[1]; if (!bySlug.has(slug)) bySlug.set(slug, []); continue }
    const q = line.match(/^> (.+)$/)
    if (q && slug) bySlug.get(slug).push(q[1].trim())
  }
  return bySlug
}

// Remove one sentence from text. Exact match first, then a
// whitespace-tolerant regex fallback. Returns { text, hit }.
function removeSentence(text, sentence) {
  if (!text) return { text, hit: false }
  if (text.includes(sentence)) {
    return { text: cleanup(text.replace(sentence, ' ')), hit: true }
  }
  const pattern = sentence
    .split(/\s+/)
    .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+')
  const re = new RegExp(pattern)
  if (re.test(text)) {
    return { text: cleanup(text.replace(re, ' ')), hit: true }
  }
  return { text, hit: false }
}

function cleanup(text) {
  return text
    .replace(/[ \t]+/g, ' ')        // collapse runs of spaces
    .replace(/ +\n/g, '\n')          // trailing space before newline
    .replace(/\n +/g, '\n')          // leading space after newline
    .replace(/\n{3,}/g, '\n\n')      // collapse blank paragraphs
    .trim()
}

function sqlLiteral(v) {
  if (v == null) return 'NULL'
  return `$aud$${v}$aud$`
}

const bySlug = parseAudit()
const totalSentences = [...bySlug.values()].reduce((s, a) => s + a.length, 0)
console.log(`Audit parsed: ${bySlug.size} regions, ${totalSentences} sentences`)
if (totalSentences !== 84) {
  console.error(`Expected 84 sentences per the audit summary, got ${totalSentences} — aborting.`)
  process.exit(1)
}

mkdirSync(SNAP_DIR, { recursive: true })

let regionsChanged = 0
let removed = 0
const misses = []
const rollback = ['-- Rollback for 2026-06-12 region editorial audit deletions',
  '-- Restores generated_intro + long_description to pre-deletion full text.', '']

for (const [slug, sentences] of bySlug) {
  const { data: region, error } = await supabase
    .from('regions')
    .select('id, slug, generated_intro, long_description')
    .eq('slug', slug)
    .single()
  if (error || !region) {
    console.error(`[${slug}] region not found — skipping (${error?.message})`)
    misses.push({ slug, sentence: '(region row missing)' })
    continue
  }

  let intro = region.generated_intro
  let long = region.long_description
  const removedHere = []
  for (const sentence of sentences) {
    const ri = removeSentence(intro, sentence)
    const rl = removeSentence(long, sentence)
    if (!ri.hit && !rl.hit) {
      misses.push({ slug, sentence: sentence.slice(0, 90) + '…' })
      continue
    }
    intro = ri.text
    long = rl.text
    removedHere.push(sentence)
    removed++
  }

  if (removedHere.length === 0) {
    console.log(`[${slug}] nothing to remove (0/${sentences.length} matched)`)
    continue
  }

  console.log(`[${slug}] removing ${removedHere.length}/${sentences.length} sentences` + (apply ? '' : ' (dry run)'))

  const snapshot = {
    slug,
    applied_at: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    sentences_removed: removedHere,
    before: { generated_intro: region.generated_intro, long_description: region.long_description },
    after: { generated_intro: intro, long_description: long },
  }
  writeFileSync(path.join(SNAP_DIR, `${slug}.json`), JSON.stringify(snapshot, null, 2))

  rollback.push(`UPDATE regions SET generated_intro = ${sqlLiteral(region.generated_intro)}, long_description = ${sqlLiteral(region.long_description)} WHERE slug = '${slug}';`, '')

  if (apply) {
    const { error: upErr } = await supabase
      .from('regions')
      .update({ generated_intro: intro, long_description: long })
      .eq('id', region.id)
    if (upErr) {
      console.error(`[${slug}] UPDATE FAILED: ${upErr.message}`)
      process.exit(1)
    }
    regionsChanged++
  }
}

writeFileSync(path.join(SNAP_DIR, 'rollback.sql'), rollback.join('\n'))

console.log('\n——— Summary ———')
console.log(`Sentences removed: ${removed}/${totalSentences}${apply ? '' : ' (dry run — nothing written)'}`)
console.log(`Regions updated: ${apply ? regionsChanged : 0}`)
if (misses.length) {
  console.log(`MISSES (${misses.length}):`)
  for (const m of misses) console.log(`  [${m.slug}] ${m.sentence}`)
}
