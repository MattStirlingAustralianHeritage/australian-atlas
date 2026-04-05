import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

/**
 * GET /api/cron/prospect
 *
 * Daily listing prospector — generates 10 candidate recommendations per vertical.
 * Triggered by Vercel Cron at 5:30am AEST (19:30 UTC previous day).
 *
 * Auth: Bearer CRON_SECRET
 */

const VERTICALS = {
  sba: {
    label: 'Small Batch Atlas',
    description: 'Artisan food and drink producers — distilleries, wineries, breweries, small-batch makers, providores, olive oil producers, cheese makers',
    searchTerms: 'craft distillery, boutique winery, microbrewery, artisan cheese, providore, olive oil producer, small-batch spirits',
  },
  collection: {
    label: 'Collection Atlas',
    description: 'Museums, galleries, private collections, heritage collections, art spaces, sculpture parks, archives',
    searchTerms: 'regional gallery, private museum, heritage collection, art space, sculpture garden, cultural centre',
  },
  craft: {
    label: 'Craft Atlas',
    description: 'Makers, artisans, studios — ceramicists, woodworkers, glassblowers, weavers, jewellers, blacksmiths',
    searchTerms: 'pottery studio, woodworking workshop, glass blowing, weaving studio, artisan jeweller',
  },
  fine_grounds: {
    label: 'Fine Grounds Atlas',
    description: 'Specialty coffee roasters — micro roasters, single origin roasters, coffee roasteries',
    searchTerms: 'specialty coffee roaster, micro roastery, single origin coffee, third wave coffee',
  },
  rest: {
    label: 'Rest Atlas',
    description: 'Boutique and independent accommodation — farm stays, heritage B&Bs, eco-lodges, glamping, tiny houses',
    searchTerms: 'boutique hotel, farm stay, heritage bed and breakfast, eco lodge, glamping',
  },
  field: {
    label: 'Field Atlas',
    description: 'Outdoor and nature experiences — hiking trails, nature reserves, national parks, botanical gardens',
    searchTerms: 'walking trail, nature reserve, botanical garden, wildlife sanctuary, scenic lookout',
  },
  corner: {
    label: 'Corner Atlas',
    description: 'Independent retail — bookshops, record stores, vintage shops, design stores, specialty retail',
    searchTerms: 'independent bookshop, record store, vintage shop, design store, makers market',
  },
  found: {
    label: 'Found Atlas',
    description: 'Secondhand, vintage, antique, and op shops — charity shops, antique dealers, salvage yards',
    searchTerms: 'antique shop, vintage store, op shop, secondhand furniture, salvage yard',
  },
  table: {
    label: 'Table Atlas',
    description: 'Independent restaurants, cafes, and dining — regional dining, farm-to-table, destination restaurants',
    searchTerms: 'farm to table restaurant, regional dining, destination restaurant, independent cafe, artisan bakery',
  },
}

const STATES = ['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']

export const maxDuration = 300 // 5 minutes

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const startTime = Date.now()
  const results = []
  let totalInserted = 0

  // Get all existing names for dedup
  const existingNames = new Set()
  const { data: existingListings } = await sb
    .from('listings').select('name').eq('status', 'active').limit(10000)
  if (existingListings) existingListings.forEach(l => existingNames.add(l.name.toLowerCase().trim()))

  const { data: existingCandidates } = await sb
    .from('listing_candidates').select('name').in('status', ['pending', 'reviewing'])
  if (existingCandidates) existingCandidates.forEach(c => existingNames.add(c.name.toLowerCase().trim()))

  for (const [vertical, config] of Object.entries(VERTICALS)) {
    try {
      // Get coverage for this vertical
      const coverage = { total: 0, byState: {} }
      for (const s of STATES) {
        const { count } = await sb
          .from('listings').select('*', { count: 'exact', head: true })
          .eq('status', 'active').eq('vertical', vertical).eq('state', s)
        coverage.byState[s] = count || 0
        coverage.total += (count || 0)
      }

      // Get existing names for this vertical
      const { data: vertNames } = await sb
        .from('listings').select('name')
        .eq('status', 'active').eq('vertical', vertical).limit(2000)
      const sampleNames = vertNames?.map(n => n.name).slice(0, 80) || []

      // Identify thin states
      const thinStates = STATES
        .map(s => ({ state: s, count: coverage.byState[s] || 0 }))
        .sort((a, b) => a.count - b.count)
        .slice(0, 4)

      // Generate candidates via Claude
      const candidates = await generateWithClaude(vertical, config, coverage, thinStates, sampleNames, existingNames)

      if (candidates.length > 0) {
        let inserted = 0
        for (const candidate of candidates) {
          const { error } = await sb.from('listing_candidates').insert(candidate)
          if (!error) {
            inserted++
            existingNames.add(candidate.name.toLowerCase().trim())
          }
        }
        totalInserted += inserted
        results.push({ vertical, generated: candidates.length, inserted, status: 'ok' })
      } else {
        results.push({ vertical, generated: 0, inserted: 0, status: 'no_candidates' })
      }
    } catch (err) {
      console.error(`[prospect] ${vertical} error:`, err.message)
      results.push({ vertical, generated: 0, inserted: 0, status: 'error', error: err.message })
    }

    // Rate limit between API calls
    await new Promise(r => setTimeout(r, 1500))
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log(`[prospect] Done in ${duration}s — ${totalInserted} candidates inserted`)

  return NextResponse.json({
    success: true,
    date: new Date().toISOString().split('T')[0],
    duration_seconds: parseFloat(duration),
    total_inserted: totalInserted,
    results,
  })
}

async function generateWithClaude(vertical, config, coverage, thinStates, sampleNames, existingNames) {
  const prompt = `You are helping build the Australian Atlas network — a curated directory of independent, artisan, and culturally significant places across Australia.

VERTICAL: ${config.label}
DESCRIPTION: ${config.description}
SEARCH TERMS: ${config.searchTerms}

CURRENT COVERAGE:
- Total listings: ${coverage.total}
- By state: ${STATES.map(s => `${s}: ${coverage.byState[s] || 0}`).join(', ')}
- Thinnest states: ${thinStates.map(s => `${s.state} (${s.count})`).join(', ')}

EXISTING LISTINGS (sample — do NOT recommend these):
${sampleNames.join(', ')}

YOUR TASK:
Recommend exactly 10 real Australian businesses for ${config.label}. Focus on:
1. Filling gaps in thin states (prioritise states with fewest listings)
2. Well-known or respected places genuinely missing from the directory
3. Geographic diversity across states and regions
4. Quality — places an editorial team would be proud to feature

For each, provide:
- name: Real business name
- region: Australian region (e.g., "Barossa Valley", "Blue Mountains")
- state: Two-letter state code
- website_url: Business website URL if known (null if unsure — do NOT guess)
- confidence: 0.0-1.0 (0.9+ well-known, 0.6-0.8 likely real, below 0.6 uncertain)
- notes: One sentence on why this is a good addition

RULES:
- Only REAL, currently operating businesses
- Do NOT invent fictional businesses
- Do NOT recommend businesses from the existing list
- website_url MUST be null if uncertain
- Be honest about confidence levels

Respond with a JSON array of exactly 10 objects. No other text.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    throw new Error(`Anthropic API ${response.status}`)
  }

  const result = await response.json()
  const text = result.content?.[0]?.text || ''

  let candidates
  try {
    const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    candidates = JSON.parse(jsonStr)
  } catch {
    console.error(`[prospect] Failed to parse response for ${vertical}`)
    return []
  }

  if (!Array.isArray(candidates)) return []

  return candidates
    .filter(c => c.name && !existingNames.has(c.name.toLowerCase().trim()))
    .slice(0, 10)
    .map(c => ({
      name: c.name.trim(),
      region: c.region || null,
      vertical,
      website_url: c.website_url || null,
      confidence: Math.min(1, Math.max(0, parseFloat(c.confidence) || 0.5)),
      source: 'ai_prospector',
      source_detail: `Daily prospector — ${new Date().toISOString().split('T')[0]}`,
      notes: c.notes || null,
      status: 'pending',
    }))
}
