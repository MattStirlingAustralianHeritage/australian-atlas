#!/usr/bin/env node
/**
 * Targeted embedding pass: embed ONLY active listings that have NO embedding
 * (embedding IS NULL) — the rows that are semantically invisible (the semantic
 * arm of search_listings_hybrid can't match them at all). Recently-added venues
 * (e.g. the new chocolatiers) land here. This is the EXISTING free-tier Voyage
 * pipeline (same model + source text as lib/sync/syncEmbeddings.js) run against
 * the priority subset, so the new vectors are directly comparable to the rest.
 *
 * Deliberately does NOT touch the large needs_embedding=true re-embed backlog —
 * those rows already have a (slightly stale) vector and remain searchable; the
 * 6-hourly sync cron drains them over time.
 *
 * Usage: node --env-file=.env.local scripts/embed-null-listings.mjs
 */
import { getSupabaseAdmin } from '../lib/supabase/clients.js'
import { embedDocuments, toVectorLiteral, VOYAGE_MODEL } from '../lib/embeddings/voyage.js'
import { buildListingText } from '../lib/embeddings/sourceText.js'

const TOKEN_BUDGET = 2600
const MAX_BATCH = 40
const PACING_MS = 21000
const estTokens = (s) => Math.ceil((s || '').length / 4)

function tokenBatches(items) {
  const batches = []
  let cur = [], tok = 0
  for (const it of items) {
    const t = estTokens(it.text)
    if (cur.length && (tok + t > TOKEN_BUDGET || cur.length >= MAX_BATCH)) { batches.push(cur); cur = []; tok = 0 }
    cur.push(it); tok += t
  }
  if (cur.length) batches.push(cur)
  return batches
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (!process.env.VOYAGE_API_KEY) { console.error('VOYAGE_API_KEY not set'); process.exit(1) }
const sb = getSupabaseAdmin()

const { data: regions } = await sb.from('regions').select('id, name')
const regionName = new Map((regions || []).map((r) => [r.id, r.name]))

const { data: listings, error } = await sb
  .from('listings')
  .select('id, name, description, sub_type, region, state, vertical, presence_type, region_override_id, region_computed_id, operator_highlights, search_keywords')
  .eq('status', 'active')
  .is('embedding', null)
  .limit(2000)
if (error) { console.error('select failed:', error.message); process.exit(1) }

console.log(`${listings.length} active listings have NO embedding`)
if (!listings.length) { console.log('nothing to do'); process.exit(0) }

const items = listings.map((l) => ({ l, text: buildListingText(l, regionName.get(l.region_override_id ?? l.region_computed_id)) }))
const batches = tokenBatches(items)
console.log(`-> ${batches.length} batches (model=${VOYAGE_MODEL}), ~${Math.round(batches.length * PACING_MS / 1000)}s with pacing`)

let ok = 0, fail = 0
for (let b = 0; b < batches.length; b++) {
  const batch = batches[b]
  let embeddings
  try {
    embeddings = await embedDocuments(batch.map((x) => x.text))
  } catch (e) {
    console.error(`batch ${b} Voyage FAILED:`, e.message); fail += batch.length; continue
  }
  for (let j = 0; j < batch.length; j++) {
    const { error: werr } = await sb.from('listings').update({
      embedding: toVectorLiteral(embeddings[j]),
      embedding_updated_at: new Date().toISOString(),
      needs_embedding: false,
    }).eq('id', batch[j].l.id)
    if (werr) { console.error(`write FAILED ${batch[j].l.id}:`, werr.message); fail++ } else { ok++ }
  }
  console.log(`batch ${b + 1}/${batches.length}: ${ok} written, ${fail} failed`)
  if (b < batches.length - 1) await sleep(PACING_MS)
}
console.log(`\nDone: ${ok} embedded, ${fail} failed`)
process.exit(0)
