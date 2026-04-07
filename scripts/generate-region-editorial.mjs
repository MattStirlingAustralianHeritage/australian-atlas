#!/usr/bin/env node

/**
 * Generate editorial content for each region using Anthropic Claude.
 *
 * Usage:
 *   node --env-file=.env.local scripts/generate-region-editorial.mjs
 *
 * Optional flags:
 *   --slug=yarra-valley    Generate for a single region
 *   --force                Regenerate even if content exists
 *   --dry-run              Print prompts without calling API
 *
 * Cost: ~$0.02 per region (~1200 tokens out × $0.015/1K).
 * Total for 47 regions: ~$1.
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load env BEFORE importing Anthropic SDK — override: true needed
// because dotenvx preload may set empty ANTHROPIC_API_KEY
dotenv.config({ path: '.env.local', override: true })

const { default: Anthropic } = await import('@anthropic-ai/sdk')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const args = process.argv.slice(2)
const singleSlug = args.find(a => a.startsWith('--slug='))?.split('=')[1]
const force = args.includes('--force')
const dryRun = args.includes('--dry-run')

const VERTICAL_LABELS = {
  sba: 'Small Batch Atlas (wineries, breweries, distilleries)',
  fine_grounds: 'Fine Grounds Atlas (specialty coffee)',
  collection: 'Culture Atlas (museums, galleries, heritage)',
  craft: 'Craft Atlas (makers, studios, artisans)',
  rest: 'Rest Atlas (boutique accommodation)',
  field: 'Field Atlas (nature, walks, swimming holes)',
  corner: 'Corner Atlas (independent shops)',
  found: 'Found Atlas (vintage, op shops, secondhand)',
  table: 'Table Atlas (restaurants, cafes, food producers)',
}

const SYSTEM_PROMPT = `You are an editorial writer for the Australian Atlas Network — a suite of independently curated Australian discovery platforms. Your voice is:

- Specific and place-grounded. Name actual towns, landmarks, roads, and producers. Never write generic tourism copy.
- Independently minded. Emphasise what's locally owned, family-run, or community-driven. Never mention chains or franchises.
- Monocle-adjacent in tone: concise, considered, globally aware but locally focused. Think quality over quantity.
- Anti-promotional. You're describing a place as it is, not selling it. No superlatives without substance.
- Seasonally aware. Mention when to go if it matters (harvest, whale season, wildflowers).

You write editorial prose, not marketing copy. Paragraphs, not bullet points. Sentences that a good travel editor would let stand.`

async function getRegionContext(regionName) {
  // Get listings grouped by vertical for this region
  const { data: listings } = await supabase
    .from('listings')
    .select('vertical, name, is_featured')
    .eq('status', 'active')
    .ilike('region', `%${regionName}%`)
    .limit(200)

  if (!listings || listings.length === 0) return null

  const byVertical = {}
  for (const l of listings) {
    if (!byVertical[l.vertical]) byVertical[l.vertical] = []
    byVertical[l.vertical].push(l.name)
  }

  let context = `The Atlas Network currently lists ${listings.length} independent venues in this region:\n\n`
  for (const [v, names] of Object.entries(byVertical)) {
    const label = VERTICAL_LABELS[v] || v
    const sample = names.slice(0, 8).join(', ')
    const extra = names.length > 8 ? ` and ${names.length - 8} more` : ''
    context += `- ${label}: ${names.length} listings — including ${sample}${extra}\n`
  }

  return context
}

async function generateEditorial(region, listingContext) {
  const prompt = `Write an editorial introduction for the ${region.name} region page on the Australian Atlas.

REGION: ${region.name}
STATE: ${region.state}
TAGLINE: ${region.description}

${listingContext || 'No listings are currently synced for this region — write based on general knowledge.'}

Write 4-6 paragraphs (800-1200 words total) covering:

1. What defines this region geographically and culturally — its character, not its attractions list
2. What the presence of these Atlas Network listings signals about the region's character (if listings exist). Reference specific venue names where they add texture.
3. The seasonal rhythm — when locals go, when it's best avoided, what changes through the year
4. What a thoughtful visitor would actually do here — not a checklist, but a sense of how time is spent
5. What makes this region distinct from its neighbours

Do NOT use:
- Bullet points or numbered lists
- Headings or subheadings (this is body prose)
- The word "nestled"
- Phrases like "hidden gem", "best-kept secret", "must-visit", "world-class" (unless truly accurate)
- Marketing language or promotional tone

Write in present tense. Address the reader directly only sparingly. Let the place speak for itself.`

  if (dryRun) {
    console.log(`  [dry-run] Prompt length: ${prompt.length} chars`)
    return '[DRY RUN — editorial would be generated here]'
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  })

  return response.content[0].text
}

async function main() {
  console.log('Fetching regions...\n')

  let query = supabase
    .from('regions')
    .select('id, name, slug, state, description, long_description, generated_intro')
    .order('name')

  if (singleSlug) {
    query = query.eq('slug', singleSlug)
  }

  const { data: regions, error } = await query

  if (error) {
    console.error('Failed to fetch regions:', error)
    process.exit(1)
  }

  // Filter to regions that need generation
  const toGenerate = force
    ? regions
    : regions.filter(r => !r.generated_intro && !r.long_description)

  console.log(`Found ${regions.length} regions, ${toGenerate.length} need editorial content`)
  if (dryRun) console.log('[DRY RUN MODE — no API calls will be made]\n')

  let success = 0
  let failed = 0

  for (const region of toGenerate) {
    console.log(`[${region.slug}] Generating editorial for ${region.name}...`)

    try {
      const listingContext = await getRegionContext(region.name)
      const editorial = await generateEditorial(region, listingContext)

      if (!dryRun) {
        const { error: updateError } = await supabase
          .from('regions')
          .update({
            generated_intro: editorial,
            long_description: editorial,
            generated_at: new Date().toISOString(),
            reviewed: false,
          })
          .eq('id', region.id)

        if (updateError) {
          console.log(`  ✗ DB update failed: ${updateError.message}`)
          failed++
          continue
        }
      }

      const wordCount = editorial.split(/\s+/).length
      console.log(`  ✓ ${wordCount} words`)
      success++

      // Small delay between API calls
      if (!dryRun) await new Promise(r => setTimeout(r, 500))

    } catch (err) {
      console.log(`  ✗ Error: ${err.message}`)
      failed++
    }
  }

  console.log(`\nDone: ${success} generated, ${failed} failed, ${regions.length - toGenerate.length} already had content`)
}

main()
