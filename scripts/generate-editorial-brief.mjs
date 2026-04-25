#!/usr/bin/env node

/**
 * Editorial Brief Generator
 * =========================
 * Generates a structured editorial brief for a venue interview or profile.
 * Uses listing data + regional context to produce: background, story angles,
 * interview questions, and regional context.
 *
 * Usage:
 *   node scripts/generate-editorial-brief.mjs --name="Turkey Flat Vineyards"
 *   node scripts/generate-editorial-brief.mjs --listing-id=UUID
 *
 * Output: Clean formatted text suitable for printing.
 */

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getListingRegion, LISTING_REGION_SELECT } from '../lib/regions/getListingRegion.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  try {
    const lines = readFileSync(resolve(__dirname, '../.env.local'), 'utf-8').split('\n')
    for (const line of lines) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq === -1) continue
      if (!process.env[t.slice(0, eq).trim()]) process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim()
    }
  } catch {}
}
loadEnv()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const NAME_FLAG = process.argv.find(a => a.startsWith('--name='))?.split('=').slice(1).join('=')
const ID_FLAG = process.argv.find(a => a.startsWith('--listing-id='))?.split('=')[1]

async function main() {
  if (!NAME_FLAG && !ID_FLAG) {
    console.error('Usage: node scripts/generate-editorial-brief.mjs --name="Venue Name"')
    process.exit(1)
  }

  // Find the listing
  let listing
  if (ID_FLAG) {
    const { data } = await supabase.from('listings').select(`*, ${LISTING_REGION_SELECT}`).eq('id', ID_FLAG).single()
    listing = data
  } else {
    const { data } = await supabase.from('listings').select(`*, ${LISTING_REGION_SELECT}`).ilike('name', `%${NAME_FLAG}%`).limit(1).single()
    listing = data
  }

  if (!listing) {
    console.error(`Listing not found: ${NAME_FLAG || ID_FLAG}`)
    process.exit(1)
  }

  const listingRegionName = getListingRegion(listing)?.name ?? null
  console.log(`\nGenerating brief for: ${listing.name}`)
  console.log(`Vertical: ${listing.vertical} | Region: ${listingRegionName} | State: ${listing.state}\n`)

  // Fetch nearby listings for regional context
  const { data: nearby } = await supabase
    .from('listings')
    .select('name, vertical, category, suburb')
    .eq('status', 'active')
    .ilike('region', `%${listing.region || listing.state}%`)
    .neq('id', listing.id)
    .limit(30)

  const nearbyContext = (nearby || []).map(n => `${n.name} (${n.vertical}: ${n.category}) — ${n.suburb}`).join('\n')

  // Generate brief
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 2000,
    system: `You are an editorial planner for Australian Atlas, a network of curated directories mapping independent Australia. Generate a structured editorial brief for a venue profile or interview. Write in a direct, informed voice. Every suggestion must be grounded in the listing data provided — do not invent attributes or claims.`,
    messages: [{
      role: 'user',
      content: `Generate an editorial brief for this venue:

Name: ${listing.name}
Category: ${listing.category}
Vertical: ${listing.vertical}
Location: ${listing.suburb || ''}, ${listingRegionName || ''}, ${listing.state}
Description: ${listing.description || 'No description available'}
Website: ${listing.website_url || 'Not listed'}
Claimed: ${listing.is_claimed ? 'Yes (operator-managed)' : 'No'}
Featured: ${listing.is_featured ? 'Yes' : 'No'}

Regional context (nearby listings on the Atlas Network):
${nearbyContext || 'Limited regional data available'}

Output format (plain text, clearly sectioned):

EDITORIAL BRIEF: [Venue Name]
Prepared for Australian Atlas interview/profile

1. BACKGROUND
[2-3 paragraphs of what we know from listing data and regional context. What kind of venue is this? What's its position in the regional landscape?]

2. THREE STORY ANGLES
[Three distinct story angles, each with a one-sentence pitch]

3. FIVE INTERVIEW QUESTIONS
[Five specific, non-generic questions grounded in what we know about this venue and region]

4. REGIONAL CONTEXT
[One paragraph on the regional landscape this venue sits within — what else is around, what makes this specific area interesting from an Atlas perspective]

5. PRODUCTION NOTES
[Any practical notes: what to photograph, what to observe, what to ask about that might not be obvious]`
    }],
  })

  const brief = response.content[0]?.text || ''

  console.log('━'.repeat(60))
  console.log(brief)
  console.log('━'.repeat(60))

  // Save to file
  const filename = `brief-${listing.slug || listing.name.toLowerCase().replace(/\s+/g, '-')}.txt`
  const outputPath = resolve(__dirname, `../${filename}`)
  writeFileSync(outputPath, brief)
  console.log(`\nSaved to: ${outputPath}`)
}

main().catch(err => {
  console.error('Brief generation failed:', err)
  process.exit(1)
})
