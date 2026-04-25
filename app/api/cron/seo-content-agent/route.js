import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'
import { getListingRegion, LISTING_REGION_SELECT } from '@/lib/regions'

export const maxDuration = 300

const AGENT_NAME = 'seo-content'
const MAX_PAGES_PER_RUN = 10
const MIN_LISTINGS = 3
const MIN_CONTENT_WORDS = 300
const DELAY_MS = 1500

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function extractJSON(text) {
  let cleaned = text.trim()
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) cleaned = fenceMatch[1].trim()
  return cleaned
}

function esc(str) {
  if (!str) return ''
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80)
}

/**
 * Map category strings to Atlas vertical filters.
 */
function categoryToVerticals(category) {
  if (!category) return []
  const cat = category.toLowerCase()
  if (cat.includes('cellar') || cat.includes('winer') || cat.includes('brewery') || cat.includes('distiller')) return ['sba']
  if (cat.includes('bookshop') || cat.includes('record') || cat.includes('vintage')) return ['corner']
  if (cat.includes('cafe') || cat.includes('coffee') || cat.includes('roaster')) return ['fine_grounds']
  if (cat.includes('restaurant') || cat.includes('dining') || cat.includes('bistro')) return ['table']
  if (cat.includes('gallery') || cat.includes('museum') || cat.includes('art')) return ['collection']
  if (cat.includes('accommodation') || cat.includes('stay') || cat.includes('glamping') || cat.includes('farm stay')) return ['rest']
  if (cat.includes('craft') || cat.includes('ceramic') || cat.includes('studio') || cat.includes('maker')) return ['craft']
  if (cat.includes('farm') || cat.includes('trail') || cat.includes('walk') || cat.includes('park')) return ['field']
  if (cat.includes('bar') || cat.includes('pub') || cat.includes('cocktail')) return ['corner']
  if (cat.includes('found') || cat.includes('antique') || cat.includes('market')) return ['found']
  return []
}

// ─── GET handler ────────────────────────────────────────────────

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const runId = await startRun(AGENT_NAME)

  const counts = { opportunities_found: 0, pages_created: 0, skipped_existing: 0, skipped_few_listings: 0, errors: 0 }
  const createdPages = []

  try {
    // ── Step 1: Identify content opportunities via Claude ──────
    console.log('[seo-content] Step 1: Identifying content opportunities...')

    const opportunityRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `Identify the 10 highest-traffic location + category search combinations relevant to independent Australian travel, food, drink, accommodation, and culture that currently return weak or no results from australianatlas.com.au. Focus on specific, high-intent queries like 'best cellar doors Mornington Peninsula', 'independent bookshops Brisbane', 'glamping Victoria', 'farm stays Hunter Valley', 'ceramic studios Melbourne'. For each query return: { "query": string, "location": string, "category": string, "estimated_intent": string, "suggested_page_title": string, "suggested_slug": string }. Return JSON array only, no other text.`,
        }],
      }),
    })

    if (!opportunityRes.ok) {
      throw new Error(`Claude API error: ${opportunityRes.status}`)
    }

    const opportunityData = await opportunityRes.json()
    const rawText = opportunityData.content?.[0]?.text || '[]'
    let opportunities = []

    try {
      opportunities = JSON.parse(extractJSON(rawText))
    } catch {
      console.error('[seo-content] Failed to parse opportunities JSON')
      throw new Error('Failed to parse Claude response for opportunities')
    }

    if (!Array.isArray(opportunities)) opportunities = []
    counts.opportunities_found = opportunities.length
    console.log(`[seo-content] Found ${opportunities.length} opportunities`)

    // ── Step 2: Check existing coverage ─────────────────────────
    const { data: existingPages } = await sb
      .from('seo_pages')
      .select('slug, query')

    const existingSlugs = new Set((existingPages || []).map(p => p.slug))
    const existingQueries = new Set((existingPages || []).map(p => p.query.toLowerCase()))

    // Also check against existing routes
    const { data: existingRegions } = await sb.from('regions').select('slug')
    const regionSlugs = new Set((existingRegions || []).map(r => r.slug))

    let pagesCreated = 0

    for (const opp of opportunities) {
      if (pagesCreated >= MAX_PAGES_PER_RUN) break

      const slug = slugify(opp.suggested_slug || opp.query)

      // Skip if already exists
      if (existingSlugs.has(slug) || existingQueries.has(opp.query.toLowerCase())) {
        counts.skipped_existing++
        console.log(`[seo-content] Skipped "${opp.query}" — already exists`)
        continue
      }

      // Skip if slug conflicts with existing routes
      if (regionSlugs.has(slug)) {
        counts.skipped_existing++
        console.log(`[seo-content] Skipped "${opp.query}" — conflicts with region slug`)
        continue
      }

      // ── Step 3: Query matching listings ───────────────────────
      const verticals = categoryToVerticals(opp.category)
      let query = sb
        .from('listings')
        .select(`id, name, slug, vertical, region, state, suburb, lat, lng, hero_image_url, description, quality_score, is_featured, editors_pick, ${LISTING_REGION_SELECT}`)
        .eq('status', 'active')
        .not('description', 'is', null)

      // Filter by region/location (ilike match)
      if (opp.location) {
        query = query.or(`region.ilike.%${opp.location}%,state.ilike.%${opp.location}%,suburb.ilike.%${opp.location}%`)
      }

      // Filter by vertical if we can map the category
      if (verticals.length === 1) {
        query = query.eq('vertical', verticals[0])
      } else if (verticals.length > 1) {
        query = query.in('vertical', verticals)
      }

      const { data: matchingListings } = await query
        .order('quality_score', { ascending: false, nullsFirst: false })
        .limit(8)

      if (!matchingListings || matchingListings.length < MIN_LISTINGS) {
        counts.skipped_few_listings++
        console.log(`[seo-content] Skipped "${opp.query}" — only ${matchingListings?.length || 0} listings`)
        continue
      }

      // ── Step 4: Generate page content via Claude ──────────────
      await delay(DELAY_MS)

      const listingData = matchingListings.map(l => ({
        name: l.name,
        vertical: l.vertical,
        region: getListingRegion(l)?.name ?? null,
        state: l.state,
        suburb: l.suburb,
        description: l.description?.substring(0, 200),
      }))

      const contentRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 3000,
          messages: [{
            role: 'user',
            content: `You are writing for Australian Atlas, a curated guide to independent Australian places. Write a regional guide page for '${opp.query}'. Voice: place-based, specific, editorial, non-promotional. Structure: opening paragraph (60-80 words) that earns its place — says something specific and true about this place and this category that a visitor would actually want to know. Then a brief introduction to each listing (20-30 words each) that reads as editorial recommendation not directory copy. Close with one paragraph (40-60 words) about the broader experience of this place — what it feels like to spend time here across these venues. Do not use 'unique', 'passionate', 'journey', 'amazing', 'hidden gem'. Listings data: ${JSON.stringify(listingData)}. Location: ${opp.location}. Category: ${opp.category}.`,
          }],
        }),
      })

      if (!contentRes.ok) {
        counts.errors++
        console.error(`[seo-content] Content generation failed for "${opp.query}": ${contentRes.status}`)
        continue
      }

      const contentData = await contentRes.json()
      const content = contentData.content?.[0]?.text || ''

      // Quality gate: minimum word count
      const wordCount = content.split(/\s+/).length
      if (wordCount < MIN_CONTENT_WORDS) {
        counts.errors++
        console.log(`[seo-content] Content too short for "${opp.query}" (${wordCount} words)`)
        continue
      }

      // ── Step 5: Generate SEO metadata ─────────────────────────
      const title = opp.suggested_page_title || `${opp.location} ${opp.category}`
      let metaTitle = `${title} — Australian Atlas`
      if (metaTitle.length > 60) {
        metaTitle = metaTitle.substring(0, 57) + '...'
      }

      // Extract first ~155 chars of opening paragraph for meta description
      const firstParagraph = content.split('\n\n')[0] || content.substring(0, 200)
      let metaDescription = firstParagraph.substring(0, 155)
      if (metaDescription.length === 155) {
        metaDescription = metaDescription.substring(0, metaDescription.lastIndexOf(' ')) + '...'
      }

      // ── Step 6: Store in seo_pages ────────────────────────────
      const listingIds = matchingListings.map(l => l.id)

      const { error: insertError } = await sb.from('seo_pages').insert({
        slug,
        title,
        query: opp.query,
        location: opp.location,
        category: opp.category,
        content,
        listing_ids: listingIds,
        status: 'draft',
        quality_score: wordCount,
        meta_title: metaTitle,
        meta_description: metaDescription,
        agent_run_id: runId,
      })

      if (insertError) {
        counts.errors++
        console.error(`[seo-content] Insert error for "${opp.query}": ${insertError.message}`)
        continue
      }

      pagesCreated++
      counts.pages_created++
      createdPages.push({
        title,
        query: opp.query,
        slug,
        listingCount: listingIds.length,
        wordCount,
      })

      console.log(`[seo-content] Created page: "${title}" (${wordCount} words, ${listingIds.length} listings)`)
      await delay(DELAY_MS)
    }

    // ── Step 7: Email notification ──────────────────────────────
    if (createdPages.length > 0) {
      await sendAgentEmail({
        subject: `SEO Content Agent — ${createdPages.length} new pages ready for review`,
        html: buildEmailHtml(counts, createdPages),
      })
    }

    await completeRun(runId, {
      status: counts.errors > 0 ? 'partial' : 'success',
      summary: counts,
    })

    return NextResponse.json({ ok: true, ...counts })
  } catch (err) {
    console.error(`[seo-content] Fatal error: ${err.message}`)
    await completeRun(runId, { status: 'error', error: err.message, summary: counts })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}


// ─── Email HTML ──────────────────────────────────────────────────

function buildEmailHtml(counts, pages) {
  const pageRows = pages.map(p => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e8e4da;font-family:sans-serif;font-size:14px;color:#2d2a24">
        <strong>${esc(p.title)}</strong><br/>
        <span style="font-size:12px;color:#8a7a5a">Target query: ${esc(p.query)}</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8e4da;font-family:sans-serif;font-size:13px;color:#2d2a24;text-align:center">${p.listingCount}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8e4da;font-family:sans-serif;font-size:13px;color:#2d2a24;text-align:center">${p.wordCount}</td>
    </tr>
  `).join('')

  return `
    <div style="background:#2d2a24;padding:24px 32px;border-radius:8px 8px 0 0">
      <h1 style="margin:0;font-family:Georgia,serif;font-weight:400;font-size:22px;color:#d4a843">
        SEO Content Agent
      </h1>
      <p style="margin:6px 0 0;font-family:sans-serif;font-size:13px;color:#8a7a5a">
        ${new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </p>
    </div>

    <div style="padding:24px 32px;background:#faf8f4;border:1px solid #e8e4da;border-top:none;border-radius:0 0 8px 8px">
      <div style="display:flex;gap:16px;margin-bottom:24px">
        <div style="text-align:center;padding:16px 24px;background:#fff;border-radius:8px;border:1px solid #e8e4da;flex:1">
          <div style="font-family:Georgia,serif;font-size:32px;color:#4a7c59">${counts.pages_created}</div>
          <div style="font-family:sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a;margin-top:4px">Pages Created</div>
        </div>
        <div style="text-align:center;padding:16px 24px;background:#fff;border-radius:8px;border:1px solid #e8e4da;flex:1">
          <div style="font-family:Georgia,serif;font-size:32px;color:#C49A3C">${counts.opportunities_found}</div>
          <div style="font-family:sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a;margin-top:4px">Opportunities Found</div>
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <thead>
          <tr style="background:#f0ece4">
            <th style="padding:8px 12px;text-align:left;font-family:sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a">Page</th>
            <th style="padding:8px 12px;text-align:center;font-family:sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a">Listings</th>
            <th style="padding:8px 12px;text-align:center;font-family:sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a">Words</th>
          </tr>
        </thead>
        <tbody>${pageRows}</tbody>
      </table>

      <div style="text-align:center;margin-top:20px">
        <a href="https://australianatlas.com.au/admin/seo-content" style="display:inline-block;padding:10px 24px;background:#2d2a24;color:#d4a843;font-family:sans-serif;font-size:13px;font-weight:500;text-decoration:none;border-radius:6px">
          Review & Publish
        </a>
      </div>

      <p style="font-family:sans-serif;font-size:12px;color:#8a7a5a;margin-top:20px;text-align:center">
        Pages are in draft — nothing is live until you approve.
      </p>

      ${counts.skipped_existing > 0 || counts.skipped_few_listings > 0 ? `
        <p style="font-family:sans-serif;font-size:11px;color:#8a7a5a;margin-top:16px;border-top:1px solid #e8e4da;padding-top:12px">
          Skipped: ${counts.skipped_existing} already covered, ${counts.skipped_few_listings} too few listings${counts.errors > 0 ? `, ${counts.errors} errors` : ''}
        </p>
      ` : ''}
    </div>
  `
}
