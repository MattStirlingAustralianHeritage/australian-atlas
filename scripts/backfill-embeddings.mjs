#!/usr/bin/env node
/**
 * One-time backfill: run the corrected generateEmbeddings() in a loop until no
 * active listing remains with embedding IS NULL OR needs_embedding = true.
 * Usage: node --env-file=.env.local scripts/backfill-embeddings.mjs
 */
import { generateEmbeddings } from '../lib/sync/syncEmbeddings.js'
import { getSupabaseAdmin } from '../lib/supabase/clients.js'

const sb = getSupabaseAdmin()

async function remaining() {
  const { count } = await sb
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .or('embedding.is.null,needs_embedding.eq.true')
  return count ?? 0
}

const start = await remaining()
console.log(`Backfill start — ${start} active listings need embeddings`)

let round = 0
let totalListings = 0
let totalArticles = 0
let totalFailures = 0
while (true) {
  round++
  const r = await generateEmbeddings({ maxListings: 8000 })
  totalListings += r.listings
  totalArticles += r.articles
  totalFailures += r.failures
  const rem = await remaining()
  console.log(`round ${round}: +${r.listings} listings, +${r.articles} articles, ${r.failures} failures, remaining=${rem}`)
  if (rem === 0) break
  if (r.listings === 0 && r.articles === 0) {
    console.log('no progress this round — stopping (check failures above)')
    break
  }
  if (round >= 30) {
    console.log('round cap (30) reached — stopping')
    break
  }
}

console.log(`\nBackfill complete: ${totalListings} listings, ${totalArticles} articles, ${totalFailures} failures, ${await remaining()} remaining`)
process.exit(0)
