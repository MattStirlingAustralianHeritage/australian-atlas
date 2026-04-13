import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'

export const maxDuration = 300

const AGENT_NAME = 'competitor-intelligence'

/**
 * Map venue category strings from Claude's response to Atlas vertical slugs.
 */
function mapCategoryToVertical(category) {
  if (!category) return null
  const cat = category.toLowerCase()
  if (cat.includes('brewery') || cat.includes('distillery') || cat.includes('winery') || cat.includes('cellar') || cat.includes('wine bar')) return 'sba'
  if (cat.includes('gallery') || cat.includes('museum') || cat.includes('art space') || cat.includes('exhibition')) return 'collection'
  if (cat.includes('cafe') || cat.includes('coffee') || cat.includes('roaster')) return 'fine_grounds'
  if (cat.includes('restaurant') || cat.includes('dining') || cat.includes('bistro') || cat.includes('eatery')) return 'table'
  if (cat.includes('bar') || cat.includes('pub') || cat.includes('cocktail')) return 'corner'
  if (cat.includes('bakery') || cat.includes('patisserie') || cat.includes('pastry')) return 'craft'
  if (cat.includes('farm') || cat.includes('market') || cat.includes('produce')) return 'field'
  if (cat.includes('accommodation') || cat.includes('stay') || cat.includes('lodge') || cat.includes('cabin')) return 'rest'
  return null
}

/**
 * Strip markdown code fences from Claude's response text if present.
 */
function extractJSON(text) {
  let cleaned = text.trim()
  // Remove ```json ... ``` or ``` ... ```
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim()
  }
  return cleaned
}

/**
 * Small delay helper for rate limiting between DB operations.
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * HTML-escape for email rendering.
 */
function esc(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ─── GET handler ────────────────────────────────────────────────

export async function GET(request) {
  // ── Auth ──────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const runId = await startRun(AGENT_NAME)
  const sb = getSupabaseAdmin()

  let venues = []
  let newVenues = 0
  let existingMentioned = 0
  let errorCount = 0
  const errors = []

  // Collect results for email
  const newVenuesList = []        // { name, suburb, state, source, url }
  const existingMentionsList = [] // { name, suburb, state, source, url }

  // ── Step 1: Call Claude API ───────────────────────────────
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
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
          content: `Search each of these Australian publications for venue features, new openings, or best-of lists published in the last 7 days: Broadsheet Australia (broadsheet.com.au), Time Out Australia (timeout.com/australia), Concrete Playground (concreteplayground.com), Australian Traveller (australiantraveller.com), Gourmet Traveller (gourmettraveller.com.au).

For each venue mentioned extract: name, suburb, state, category. Return JSON array only, no other text: [{ "name": string, "suburb": string, "state": string, "category": string, "source": string, "url": string, "published_date": string }]. Independent venues only — exclude chains, franchises, hotels over 50 rooms, national retail brands. If no venues found, return [].`
        }],
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`Claude API returned ${res.status}: ${errBody}`)
    }

    const data = await res.json()
    const rawText = data?.content?.[0]?.text || '[]'
    const jsonStr = extractJSON(rawText)

    try {
      venues = JSON.parse(jsonStr)
      if (!Array.isArray(venues)) {
        venues = []
      }
    } catch (parseErr) {
      console.error('[competitor-intelligence] JSON parse error:', parseErr.message)
      console.error('[competitor-intelligence] Raw text:', rawText.substring(0, 500))
      errors.push(`JSON parse: ${parseErr.message}`)
      errorCount++
      venues = []
    }
  } catch (err) {
    console.error('[competitor-intelligence] Claude API error:', err.message)
    errors.push(`Claude API: ${err.message}`)
    errorCount++
  }

  // ── Steps 3-5: Process each venue ─────────────────────────
  for (const venue of venues) {
    try {
      if (!venue.name || !venue.state) {
        console.warn('[competitor-intelligence] Skipping venue with missing name/state:', venue)
        continue
      }

      // Rate limit between DB operations
      await delay(2000)

      // Check if venue already exists in Atlas
      const { data: existing, error: queryErr } = await sb
        .from('listings')
        .select('id, name, slug, suburb, state')
        .ilike('name', `%${venue.name}%`)
        .eq('state', venue.state)
        .limit(1)

      if (queryErr) {
        console.error('[competitor-intelligence] Listings query error:', queryErr.message)
        errors.push(`Query ${venue.name}: ${queryErr.message}`)
        errorCount++
        continue
      }

      if (existing && existing.length > 0) {
        // ── Already in Atlas: log press mention ──
        const listing = existing[0]

        const { error: insertErr } = await sb
          .from('press_mentions')
          .insert({
            listing_id: listing.id,
            source: venue.source || 'Unknown',
            source_url: venue.url || null,
            published_date: venue.published_date || null,
          })

        if (insertErr) {
          console.error('[competitor-intelligence] press_mentions insert error:', insertErr.message)
          errors.push(`Press mention ${venue.name}: ${insertErr.message}`)
          errorCount++
        } else {
          existingMentioned++
          existingMentionsList.push({
            name: listing.name,
            suburb: listing.suburb || venue.suburb,
            state: venue.state,
            source: venue.source,
            url: venue.url,
          })
        }
      } else {
        // ── Not in Atlas: create listing suggestion ──
        const vertical = mapCategoryToVertical(venue.category)

        const { error: insertErr } = await sb
          .from('listing_suggestions')
          .insert({
            name: venue.name,
            website: null,
            suburb: venue.suburb || null,
            state: venue.state,
            vertical,
            reason: `Found in ${venue.source || 'competitor publication'} article`,
            status: 'pending',
            submitter_email: null,
            source: 'competitor_intelligence',
            source_url: venue.url || null,
          })

        if (insertErr) {
          console.error('[competitor-intelligence] listing_suggestions insert error:', insertErr.message)
          errors.push(`Suggestion ${venue.name}: ${insertErr.message}`)
          errorCount++
        } else {
          newVenues++
          newVenuesList.push({
            name: venue.name,
            suburb: venue.suburb,
            state: venue.state,
            source: venue.source,
            url: venue.url,
          })
        }
      }
    } catch (venueErr) {
      console.error('[competitor-intelligence] Venue processing error:', venueErr.message)
      errors.push(`Processing ${venue.name}: ${venueErr.message}`)
      errorCount++
    }
  }

  // ── Step 6: Log run ───────────────────────────────────────
  const summary = {
    sources_checked: 5,
    venues_found: venues.length,
    new_candidates: newVenues,
    existing_mentioned: existingMentioned,
    errors: errorCount,
  }

  await completeRun(runId, {
    status: errorCount > 0 ? 'partial' : 'success',
    summary,
    error: errors.length > 0 ? errors.join('; ') : null,
  })

  // ── Step 7: Send email ────────────────────────────────────
  const subject = `Competitor Intelligence — ${newVenues} new venue${newVenues !== 1 ? 's' : ''} found this week`
  const html = buildEmailHtml({
    newVenuesList,
    existingMentionsList,
    summary,
    errors,
  })

  await sendAgentEmail({ subject, html })

  return NextResponse.json({ success: true, summary })
}

// ─── Email builder ──────────────────────────────────────────────

function buildEmailHtml({ newVenuesList, existingMentionsList, summary, errors }) {
  const sections = []
  const weekLabel = new Date().toLocaleDateString('en-AU')
  const hasContent = newVenuesList.length > 0 || existingMentionsList.length > 0

  // Header
  sections.push(`
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 680px; margin: 0 auto; color: #1a1a1a;">
    <div style="background: #2d2a24; padding: 24px 32px; border-radius: 8px 8px 0 0;">
      <h1 style="color: #d4a843; margin: 0; font-size: 22px; font-weight: 600;">Competitor Intelligence</h1>
      <p style="color: #a89a7e; margin: 4px 0 0; font-size: 13px;">Australian Atlas &middot; Week of ${esc(weekLabel)}</p>
    </div>
    <div style="padding: 24px 32px; border: 1px solid #e5e0d5; border-top: none; border-radius: 0 0 8px 8px;">
  `)

  // Summary stats
  sections.push(`
    <div style="display: flex; gap: 16px; margin-bottom: 24px;">
      <div style="background: #f9fafb; border-radius: 8px; padding: 16px 20px; flex: 1; text-align: center;">
        <div style="font-size: 28px; font-weight: 700; color: #2d2a24;">${summary.venues_found}</div>
        <div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">Venues found</div>
      </div>
      <div style="background: #f9fafb; border-radius: 8px; padding: 16px 20px; flex: 1; text-align: center;">
        <div style="font-size: 28px; font-weight: 700; color: ${summary.new_candidates > 0 ? '#166534' : '#2d2a24'};">${summary.new_candidates}</div>
        <div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">New candidates</div>
      </div>
      <div style="background: #f9fafb; border-radius: 8px; padding: 16px 20px; flex: 1; text-align: center;">
        <div style="font-size: 28px; font-weight: 700; color: #2d2a24;">${summary.existing_mentioned}</div>
        <div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">Atlas venues in press</div>
      </div>
    </div>
  `)

  if (!hasContent) {
    sections.push(`
      <p style="color: #6b7280; font-size: 15px; padding: 32px 0; text-align: center;">
        Quiet week &mdash; no new venues surfaced from competitor publications.
      </p>
    `)
  } else {
    // ── New venues grouped by source ──
    if (newVenuesList.length > 0) {
      sections.push(`
        <div style="margin-bottom: 24px;">
          <h2 style="font-size: 15px; font-weight: 600; color: #2d2a24; margin: 0 0 4px;">
            New Venue Candidates
          </h2>
          <p style="font-size: 12px; color: #9ca3af; margin: 0 0 12px;">Not currently in the Atlas — added to listing suggestions for review</p>
      `)

      // Group by source
      const bySource = {}
      for (const v of newVenuesList) {
        const src = v.source || 'Unknown'
        if (!bySource[src]) bySource[src] = []
        bySource[src].push(v)
      }

      for (const [source, venues] of Object.entries(bySource)) {
        sections.push(`
          <p style="font-size: 13px; font-weight: 600; color: #b8862b; margin: 16px 0 6px;">${esc(source)}</p>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
        `)
        for (const v of venues) {
          const locationParts = [v.suburb, v.state].filter(Boolean)
          const location = locationParts.join(', ')
          sections.push(`
            <tr>
              <td style="padding: 4px 8px; font-size: 13px; border-bottom: 1px solid #f3f0eb;">
                ${esc(v.name)}
              </td>
              <td style="padding: 4px 8px; font-size: 12px; color: #6b7280; border-bottom: 1px solid #f3f0eb;">
                ${esc(location)}
              </td>
              <td style="padding: 4px 8px; font-size: 12px; text-align: right; border-bottom: 1px solid #f3f0eb;">
                ${v.url ? `<a href="${esc(v.url)}" style="color: #b8862b; text-decoration: none;">article &rarr;</a>` : ''}
              </td>
            </tr>
          `)
        }
        sections.push(`</table>`)
      }
      sections.push(`</div>`)
    }

    // ── Existing Atlas venues mentioned in press ──
    if (existingMentionsList.length > 0) {
      sections.push(`
        <div style="margin-bottom: 24px;">
          <h2 style="font-size: 15px; font-weight: 600; color: #2d2a24; margin: 0 0 4px;">
            Atlas Listings in the Press
          </h2>
          <p style="font-size: 12px; color: #9ca3af; margin: 0 0 12px;">Existing Atlas venues mentioned in competitor publications this week</p>
      `)

      // Group by source
      const bySource = {}
      for (const v of existingMentionsList) {
        const src = v.source || 'Unknown'
        if (!bySource[src]) bySource[src] = []
        bySource[src].push(v)
      }

      for (const [source, venues] of Object.entries(bySource)) {
        sections.push(`
          <p style="font-size: 13px; font-weight: 600; color: #b8862b; margin: 16px 0 6px;">${esc(source)}</p>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
        `)
        for (const v of venues) {
          const locationParts = [v.suburb, v.state].filter(Boolean)
          const location = locationParts.join(', ')
          sections.push(`
            <tr>
              <td style="padding: 4px 8px; font-size: 13px; border-bottom: 1px solid #f3f0eb;">
                ${esc(v.name)}
              </td>
              <td style="padding: 4px 8px; font-size: 12px; color: #6b7280; border-bottom: 1px solid #f3f0eb;">
                ${esc(location)}
              </td>
              <td style="padding: 4px 8px; font-size: 12px; text-align: right; border-bottom: 1px solid #f3f0eb;">
                ${v.url ? `<a href="${esc(v.url)}" style="color: #b8862b; text-decoration: none;">article &rarr;</a>` : ''}
              </td>
            </tr>
          `)
        }
        sections.push(`</table>`)
      }
      sections.push(`</div>`)
    }
  }

  // Errors
  if (errors.length > 0) {
    sections.push(`
      <div style="margin-top: 24px; padding: 12px 16px; background: #fef2f2; border-left: 3px solid #ef4444; border-radius: 4px;">
        <p style="margin: 0 0 8px; font-weight: 600; color: #991b1b; font-size: 13px;">Errors (${errors.length})</p>
        <ul style="margin: 0; padding-left: 20px; color: #991b1b; font-size: 12px;">
          ${errors.map(e => `<li>${esc(e)}</li>`).join('')}
        </ul>
      </div>
    `)
  }

  // Footer
  sections.push(`
      <hr style="border: none; border-top: 1px solid #e5e0d5; margin: 28px 0 16px;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        Sources checked: Broadsheet, Time Out, Concrete Playground, Australian Traveller, Gourmet Traveller
      </p>
      <p style="color: #c4bfb4; font-size: 11px; margin: 8px 0 0;">
        Sent by the Competitor Intelligence Agent &middot; Australian Atlas
      </p>
    </div></div>
  `)

  return sections.join('')
}
