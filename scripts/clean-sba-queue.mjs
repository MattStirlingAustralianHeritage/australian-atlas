#!/usr/bin/env node
/**
 * Clean up SBA candidate queue — move non-alcohol food producers to disqualified.
 *
 * Scans listing_candidates where vertical = 'sba' and status = 'pending',
 * checks names, notes, and gate_results for food-related indicators,
 * and moves matches to candidates_disqualified with appropriate reason.
 *
 * Usage:
 *   node scripts/clean-sba-queue.mjs                # dry-run (report only)
 *   node scripts/clean-sba-queue.mjs --disqualify   # actually move them
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(supabaseUrl, supabaseServiceKey)
const doDisqualify = process.argv.includes('--disqualify')

// Food-related keywords that indicate wrong vertical for SBA
const FOOD_KEYWORDS = [
  'olive oil', 'olives', 'butter', 'honey', 'dairy', 'cheese', 'milk',
  'smallgoods', 'charcuterie', 'salami', 'preserves', 'jam', 'marmalade',
  'condiment', 'sauce', 'relish', 'chutney', 'mustard', 'vinegar',
  'chocolate', 'confectionery', 'bakery', 'bread', 'pastry', 'patisserie',
  'ice cream', 'gelato', 'providore', 'grocer', 'deli', 'delicatessen',
  'farm gate', 'farmgate', 'farm shop', 'produce', 'artisan food',
  'food producer', 'small goods', 'spice', 'herb', 'tea', 'coffee',
  'kombucha', 'juice', 'non-alcoholic', 'nut butter', 'granola', 'muesli',
  'pasta', 'noodle', 'tofu', 'tempeh', 'fermented food',
  'restaurant', 'cafe', 'bistro', 'eatery', 'dining',
]

// Alcohol-related keywords that indicate correct SBA placement
const ALCOHOL_KEYWORDS = [
  'brewery', 'brewhouse', 'brewing', 'beer', 'ale', 'lager', 'stout', 'ipa',
  'winery', 'wine', 'vineyard', 'cellar door', 'vintage',
  'distillery', 'distilling', 'spirits', 'gin', 'whisky', 'whiskey', 'vodka', 'rum',
  'cidery', 'cider', 'meadery', 'mead',
]

function isFoodProducer(candidate) {
  const searchText = [
    candidate.name || '',
    candidate.notes || '',
    candidate.region || '',
    // Check gate_results for any stored descriptions
    JSON.stringify(candidate.gate_results?.gates?.gate4?.justification || ''),
  ].join(' ').toLowerCase()

  const matchedFoodKeywords = FOOD_KEYWORDS.filter(kw => searchText.includes(kw))
  const matchedAlcoholKeywords = ALCOHOL_KEYWORDS.filter(kw => searchText.includes(kw))

  // If name/notes contain food terms and NO alcohol terms → food producer
  if (matchedFoodKeywords.length > 0 && matchedAlcoholKeywords.length === 0) {
    return { isFood: true, foodMatches: matchedFoodKeywords, alcoholMatches: [] }
  }

  // Also check Google Places types if available
  const gpTypes = candidate.gate_results?.google_places?.types
    || candidate.google_places_data?.types || []
  const foodTypes = ['restaurant', 'food', 'grocery_or_supermarket', 'bakery',
    'meal_delivery', 'meal_takeaway', 'cafe', 'supermarket']
  const alcoholTypes = ['brewery', 'winery', 'distillery', 'bar', 'liquor_store']

  const hasGoogleFoodType = gpTypes.some(t => foodTypes.some(f => t.includes(f)))
  const hasGoogleAlcoholType = gpTypes.some(t => alcoholTypes.some(a => t.includes(a)))

  if (hasGoogleFoodType && !hasGoogleAlcoholType && matchedAlcoholKeywords.length === 0) {
    return { isFood: true, foodMatches: [...matchedFoodKeywords, `google:${gpTypes.join(',')}`], alcoholMatches: [] }
  }

  return { isFood: false, foodMatches: matchedFoodKeywords, alcoholMatches: matchedAlcoholKeywords }
}

async function main() {
  console.log(`\n=== Clean SBA Candidate Queue ===`)
  console.log(`Mode: ${doDisqualify ? 'DISQUALIFY (live)' : 'DRY RUN (report only)'}`)

  // Fetch all pending SBA candidates
  const { data: candidates, error } = await sb
    .from('listing_candidates')
    .select('id, name, notes, region, vertical, website_url, gate_results')
    .eq('vertical', 'sba')
    .eq('status', 'pending')

  if (error) {
    console.error('Query error:', error.message)
    process.exit(1)
  }

  console.log(`Found ${candidates.length} pending SBA candidates\n`)

  const toDisqualify = []
  const clean = []

  for (const c of candidates) {
    const { isFood, foodMatches, alcoholMatches } = isFoodProducer(c)
    if (isFood) {
      toDisqualify.push({ ...c, foodMatches })
      console.log(`  ✗ FOOD: ${c.name}`)
      console.log(`    Matched: ${foodMatches.join(', ')}`)
    } else {
      clean.push(c)
    }
  }

  console.log(`\n--- Summary ---`)
  console.log(`Food producers (to disqualify): ${toDisqualify.length}`)
  console.log(`Clean alcohol producers (keep): ${clean.length}`)

  if (!doDisqualify || toDisqualify.length === 0) {
    if (toDisqualify.length > 0) console.log(`\nRun with --disqualify to move them.`)
    return
  }

  console.log(`\nDisqualifying ${toDisqualify.length} non-alcohol candidates...`)

  let moved = 0
  for (const c of toDisqualify) {
    // Write to candidates_disqualified
    const { error: insertError } = await sb.from('candidates_disqualified').insert({
      name: c.name,
      vertical: 'sba',
      region: c.region || null,
      gate_failed: 4,
      reason: `Wrong vertical — non-alcohol food producer (matched: ${c.foodMatches.slice(0, 3).join(', ')}). Likely Table Atlas candidate.`,
      data_at_failure: {
        website_url: c.website_url,
        original_candidate_id: c.id,
        food_keywords_matched: c.foodMatches,
      },
    })

    if (insertError) {
      console.log(`  ⚠ Failed to write disqualification for ${c.name}: ${insertError.message}`)
      continue
    }

    // Update candidate status to 'rejected' so it's removed from queue
    const { error: updateError } = await sb
      .from('listing_candidates')
      .update({ status: 'rejected' })
      .eq('id', c.id)

    if (updateError) {
      console.log(`  ⚠ Failed to update status for ${c.name}: ${updateError.message}`)
      continue
    }

    console.log(`  ✓ Disqualified: ${c.name}`)
    moved++
  }

  console.log(`\nDone. Moved ${moved}/${toDisqualify.length} to disqualified.`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
