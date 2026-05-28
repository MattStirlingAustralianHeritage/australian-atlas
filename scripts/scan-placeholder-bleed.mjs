#!/usr/bin/env node
//
// _placeholder-bleed-scan.mjs (THROWAWAY)
//
// Scan active listings across all verticals for prompt-template
// placeholder bleed — strings that only make sense as AI-generation
// scaffolding leaked into stored descriptions. Pattern set is curated
// for high precision (low false-positive risk on real editorial copy).
//
// Surfaces: per-pattern hit count, per-vertical distribution of affected
// listings, and sample descriptions.
//
// Usage:
//   node --env-file=.env.local scripts/_placeholder-bleed-scan.mjs

import { createClient } from '@supabase/supabase-js'
import { exit, env } from 'node:process'

const PATTERNS = [
  // Word-count placeholders (from the-orchard-table find)
  { name: 'parenthetical-word-count', sql: '%(40-80 words)%' },
  { name: 'parenthetical-word-count-generic', sql: '%(%words)%' },
  { name: 'description-colon-words', sql: '%Description (%words)%' },
  // Bracket-name placeholders
  { name: 'bracket-Place', sql: '%[Place]%' },
  { name: 'bracket-venue-name', sql: '%[venue name]%' },
  { name: 'bracket-name', sql: '%[name]%' },
  { name: 'bracket-location', sql: '%[location]%' },
  { name: 'bracket-suburb', sql: '%[suburb]%' },
  { name: 'bracket-region', sql: '%[region]%' },
  // Instruction-verb leaks
  { name: 'write-a-description', sql: '%Write a description%' },
  { name: 'write-word-description', sql: '%Write a %-word description%' },
  { name: 'describe-this-venue', sql: '%Describe this venue%' },
  { name: 'describe-the-venue', sql: '%Describe the venue%' },
  // Output-framing leftovers
  { name: 'heres-description', sql: "%Here's a description%" },
  { name: 'here-is-description', sql: '%Here is a description%' },
  // Common scaffolding labels
  { name: 'label-description-colon', sql: 'Description:%' }, // anchored at start
]

async function main() {
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('env'); exit(2) }
  const sb = createClient(url, key)

  console.log('Scanning active listings (all verticals) for prompt-template placeholder bleed...\n')

  const hitsByPattern = new Map()
  const allHits = new Map() // id -> { listing, matchedPatterns: [] }

  for (const p of PATTERNS) {
    const { data, error } = await sb.from('listings')
      .select('id, slug, vertical, name, description, data_source, needs_review, status')
      .ilike('description', p.sql)
      .eq('status', 'active')
      .not('description', 'is', null)
    if (error) { console.error(`pattern ${p.name}: ${error.message}`); continue }

    hitsByPattern.set(p.name, data.length)
    for (const row of data) {
      if (!allHits.has(row.id)) allHits.set(row.id, { listing: row, matchedPatterns: [] })
      allHits.get(row.id).matchedPatterns.push(p.name)
    }
  }

  console.log('━━━ Hit count per pattern ━━━')
  for (const [name, count] of hitsByPattern.entries()) {
    console.log(`  ${name.padEnd(36)} ${count}`)
  }
  console.log()

  console.log(`━━━ Unique listings affected: ${allHits.size} ━━━`)
  if (allHits.size === 0) {
    console.log('No bleed detected. Pipeline appears clean.')
    return
  }

  // Group by vertical
  const byVertical = new Map()
  for (const { listing } of allHits.values()) {
    const v = listing.vertical
    if (!byVertical.has(v)) byVertical.set(v, 0)
    byVertical.set(v, byVertical.get(v) + 1)
  }
  console.log('By vertical:')
  for (const [v, c] of [...byVertical.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v.padEnd(15)} ${c}`)
  }
  console.log()

  console.log('━━━ All affected listings (slug, vertical, matched patterns, first 200 chars) ━━━')
  for (const { listing, matchedPatterns } of allHits.values()) {
    console.log(`\n[${listing.vertical}/${listing.slug}] data_source=${listing.data_source} needs_review=${listing.needs_review} matched=${matchedPatterns.join(',')}`)
    console.log(`  ${listing.description.slice(0, 200).replace(/\n/g, '\n  ')}${listing.description.length > 200 ? '...' : ''}`)
  }
}

main().catch(err => { console.error(err); exit(1) })
