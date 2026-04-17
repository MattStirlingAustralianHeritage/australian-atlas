#!/usr/bin/env node
/**
 * Seed Michelin Key recipients into listing_candidates table for Rest Atlas.
 *
 * These are NOT auto-approved — they go through the standard 5-gate verification.
 * Many Michelin Key holders are chain hotels that may not meet Rest Atlas editorial criteria.
 *
 * Usage:
 *   node scripts/seed-michelin-key-candidates.mjs
 *   node scripts/seed-michelin-key-candidates.mjs --dry-run
 *
 * Requires: .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

config({ path: '.env.local' })

const __dirname = dirname(fileURLToPath(import.meta.url))

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  console.log(`\n🏨 Michelin Key Candidate Seeder${DRY_RUN ? ' (DRY RUN)' : ''}`)
  console.log('─'.repeat(50))

  // Load candidate data
  const dataPath = join(__dirname, 'data', 'michelin-key-candidates.json')
  let candidates
  try {
    candidates = JSON.parse(readFileSync(dataPath, 'utf-8'))
  } catch (err) {
    console.error(`Failed to read ${dataPath}: ${err.message}`)
    process.exit(1)
  }

  console.log(`Loaded ${candidates.length} Michelin Key recipients`)

  // Show summary
  const byKeys = {}
  const byChain = { independent: 0, chain: 0 }
  for (const c of candidates) {
    const k = `${c.michelin_keys} Key${c.michelin_keys > 1 ? 's' : ''}`
    byKeys[k] = (byKeys[k] || 0) + 1
    if (c.is_chain) byChain.chain++
    else byChain.independent++
  }
  console.log('\nBy Michelin Keys:')
  for (const [k, count] of Object.entries(byKeys).sort()) {
    console.log(`  ${k}: ${count}`)
  }
  console.log(`\nIndependent: ${byChain.independent} | Chain: ${byChain.chain}`)

  // Check existing candidates
  const { data: existing } = await sb
    .from('listing_candidates')
    .select('name')
    .eq('vertical', 'rest')
    .limit(10000)

  const existingNames = new Set((existing || []).map(c => c.name.toLowerCase().trim()))
  const newCandidates = candidates.filter(c => !existingNames.has(c.name.toLowerCase().trim()))
  console.log(`\nAlready in DB: ${candidates.length - newCandidates.length} | New to insert: ${newCandidates.length}`)

  if (newCandidates.length === 0) {
    console.log('\nNo new candidates to insert.')
    return
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Would insert:')
    for (const c of newCandidates) {
      const chain = c.is_chain ? ` [CHAIN: ${c.chain_name}]` : ''
      console.log(`  ${c.michelin_keys}🔑 ${c.name} — ${c.city}, ${c.state}${chain}`)
    }
    return
  }

  // Insert candidates
  let inserted = 0
  let skipped = 0
  let errors = 0

  for (const c of newCandidates) {
    const row = {
      name: c.name.trim(),
      website_url: c.website || null,
      region: c.city || c.region || null,
      vertical: 'rest',
      confidence: 0.9, // High confidence — Michelin-verified
      source: 'web_search',
      source_detail: `michelin_key_australia_${c.year_awarded || 2024}`,
      notes: [
        c.description,
        `Michelin Key: ${c.michelin_keys} Key${c.michelin_keys > 1 ? 's' : ''} (${c.year_awarded || 'unknown year'})`,
        c.category ? `Category: ${c.category}` : null,
        c.is_chain ? `⚠️ Chain hotel: ${c.chain_name} — may not meet Rest Atlas editorial criteria` : 'Independent property',
        c.state ? `State: ${c.state}` : null,
      ].filter(Boolean).join(' | '),
      status: 'pending',
    }

    const { error } = await sb
      .from('listing_candidates')
      .insert(row)

    if (error) {
      if (error.code === '23505') {
        skipped++
      } else {
        console.error(`  Error inserting "${row.name}": ${error.message}`)
        errors++
      }
    } else {
      inserted++
    }
  }

  console.log(`\n✅ Done!`)
  console.log(`  Inserted: ${inserted}`)
  console.log(`  Skipped (duplicate): ${skipped}`)
  console.log(`  Errors: ${errors}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
