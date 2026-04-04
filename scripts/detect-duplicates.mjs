#!/usr/bin/env node

/**
 * Semantic Deduplication Detection
 * =================================
 * Uses pgvector cosine similarity to find potential duplicate listings.
 * Flags pairs above threshold for human review in admin/duplicates.
 *
 * Usage:
 *   DRY RUN:  node scripts/detect-duplicates.mjs
 *   LIVE:     node scripts/detect-duplicates.mjs --execute
 *   SINGLE:   node scripts/detect-duplicates.mjs --execute --vertical=sba
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRY_RUN = !process.argv.includes('--execute')
const VERTICAL_FLAG = process.argv.find(a => a.startsWith('--vertical='))?.split('=')[1]
const SIMILARITY_THRESHOLD = 0.92

// Load env
function loadEnv() {
  try {
    const lines = readFileSync(resolve(__dirname, '../.env.local'), 'utf-8').split('\n')
    for (const line of lines) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq === -1) continue
      const k = t.slice(0, eq).trim()
      const v = t.slice(eq + 1).trim()
      if (!process.env[k]) process.env[k] = v
    }
  } catch {}
}
loadEnv()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

async function main() {
  console.log(`\n=== Semantic Deduplication Detection ===`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
  console.log(`Threshold: ${SIMILARITY_THRESHOLD}`)
  console.log(`Vertical: ${VERTICAL_FLAG || 'all'}\n`)

  // Fetch listings with embeddings
  let query = supabase
    .from('listings')
    .select('id, name, vertical, suburb, state, region, slug, embedding')
    .eq('status', 'active')
    .not('embedding', 'is', null)

  if (VERTICAL_FLAG) query = query.eq('vertical', VERTICAL_FLAG)
  query = query.limit(2000)

  const { data: listings, error } = await query

  if (error) {
    console.error('Failed to fetch listings:', error.message)
    process.exit(1)
  }

  console.log(`Fetched ${listings.length} listings with embeddings\n`)

  if (listings.length === 0) {
    console.log('No listings with embeddings found. Run embedding sync first.')
    return
  }

  // Compare within verticals first (most likely duplicates)
  const byVertical = {}
  for (const l of listings) {
    if (!byVertical[l.vertical]) byVertical[l.vertical] = []
    byVertical[l.vertical].push(l)
  }

  const pairs = []

  for (const [vertical, vListings] of Object.entries(byVertical)) {
    console.log(`Checking ${vertical}: ${vListings.length} listings...`)

    for (let i = 0; i < vListings.length; i++) {
      for (let j = i + 1; j < vListings.length; j++) {
        const a = vListings[i]
        const b = vListings[j]

        if (!a.embedding || !b.embedding) continue

        const sim = cosineSimilarity(a.embedding, b.embedding)
        if (sim >= SIMILARITY_THRESHOLD) {
          pairs.push({
            listing_id_a: a.id,
            listing_id_b: b.id,
            name_a: a.name,
            name_b: b.name,
            vertical,
            similarity_score: Math.round(sim * 1000) / 1000,
          })
        }
      }
    }
  }

  console.log(`\nFound ${pairs.length} pairs above ${SIMILARITY_THRESHOLD} threshold\n`)

  if (pairs.length === 0) {
    console.log('No duplicates detected.')
    return
  }

  // Display pairs
  for (const p of pairs.slice(0, 30)) {
    console.log(`  [${(p.similarity_score * 100).toFixed(1)}%] ${p.name_a} <-> ${p.name_b} (${p.vertical})`)
  }
  if (pairs.length > 30) console.log(`  ... and ${pairs.length - 30} more`)

  if (DRY_RUN) {
    console.log(`\nDRY RUN complete. Run with --execute to insert into dedup_flags.`)
    return
  }

  // Insert into dedup_flags
  let inserted = 0
  for (const p of pairs) {
    const { error } = await supabase.from('dedup_flags').upsert({
      listing_id_a: p.listing_id_a,
      listing_id_b: p.listing_id_b,
      similarity_score: p.similarity_score,
      status: 'pending',
    }, { onConflict: 'listing_id_a,listing_id_b' })

    if (!error) inserted++
  }

  console.log(`\nInserted ${inserted} dedup flags for review at /admin/duplicates`)
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0
  const len = Math.min(a.length, b.length)
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom === 0 ? 0 : dot / denom
}

main().catch(err => {
  console.error('Detection failed:', err)
  process.exit(1)
})
