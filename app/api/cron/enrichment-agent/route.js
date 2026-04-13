import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'

export const maxDuration = 300

/**
 * GET /api/cron/enrichment-agent
 *
 * Enrichment agent — scrapes listing websites and generates AI descriptions
 * via Anthropic Claude for listings that lack editorial copy.
 *
 * Processes up to 20 listings per run. Stores results in ai_description
 * (never overwrites human-written description). Admin reviews at /admin/enrichment-review.
 *
 * Auth: Bearer CRON_SECRET
 */
export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const runId = await startRun('enrichment-agent')
  const startTime = Date.now()

  const counts = { attempted: 0, enriched: 0, skipped: 0, errors: 0 }
  const enrichedListings = []

  try {
    // ── Fetch candidates for enrichment ──────────────────────
    // Active listings with a website but no meaningful description and not yet enriched
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: listings, error: fetchError } = await sb
      .from('listings')
      .select('id, name, slug, vertical, region, state, website, description, ai_description')
      .eq('status', 'active')
      .not('website', 'is', null)
      .is('ai_description', null)
      .or(`description.is.null,description.eq.,description.lt.${' '.repeat(40)}`)
      .or(`enrichment_attempted_at.is.null,enrichment_attempted_at.lt.${sevenDaysAgo}`)
      .limit(20)

    if (fetchError) {
      throw new Error(`Failed to fetch listings: ${fetchError.message}`)
    }

    if (!listings || listings.length === 0) {
      console.log('[enrichment-agent] No listings need enrichment')
      await completeRun(runId, { status: 'success', summary: { ...counts, note: 'No listings needed enrichment' } })
      return NextResponse.json({ ok: true, ...counts })
    }

    console.log(`[enrichment-agent] Found ${listings.length} listings to enrich`)

    // ── Process each listing ─────────────────────────────────
    for (const listing of listings) {
      counts.attempted++

      // Filter out listings with short but non-null descriptions more precisely
      if (listing.description && listing.description.trim().length >= 40) {
        counts.skipped++
        console.log(`[enrichment-agent] Skipped "${listing.name}" — description already adequate (${listing.description.length} chars)`)
        // Mark attempted so we don't re-check this one soon
        await sb.from('listings').update({ enrichment_attempted_at: new Date().toISOString() }).eq('id', listing.id)
        continue
      }

      try {
        // ── 1. Scrape website ──────────────────────────────
        const scrapedText = await scrapeWebsite(listing.website)

        if (!scrapedText || scrapedText.length < 50) {
          console.log(`[enrichment-agent] Skipped "${listing.name}" — insufficient scraped text`)
          counts.skipped++
          await sb.from('listings').update({
            enrichment_attempted_at: new Date().toISOString(),
          }).eq('id', listing.id)
          continue
        }

        // ── 2. Generate description via Claude ─────────────
        const aiDescription = await generateDescription(listing, scrapedText)

        if (!aiDescription) {
          console.log(`[enrichment-agent] No description generated for "${listing.name}"`)
          counts.errors++
          await sb.from('listings').update({
            enrichment_attempted_at: new Date().toISOString(),
          }).eq('id', listing.id)
          continue
        }

        // ── 3. Store result ────────────────────────────────
        const { error: updateError } = await sb
          .from('listings')
          .update({
            ai_description: aiDescription,
            enrichment_attempted_at: new Date().toISOString(),
            enrichment_status: 'pending_review',
          })
          .eq('id', listing.id)

        if (updateError) {
          console.error(`[enrichment-agent] DB update failed for "${listing.name}":`, updateError.message)
          counts.errors++
          continue
        }

        counts.enriched++
        enrichedListings.push({ name: listing.name, vertical: listing.vertical })
        console.log(`[enrichment-agent] Enriched: "${listing.name}" (${listing.vertical})`)

        // Rate limit between API calls
        await new Promise(r => setTimeout(r, 500))

      } catch (err) {
        console.error(`[enrichment-agent] Error processing "${listing.name}":`, err.message)
        counts.errors++
        await sb.from('listings').update({
          enrichment_attempted_at: new Date().toISOString(),
        }).eq('id', listing.id).catch(() => {})
      }
    }

    // ── Send notification email ──────────────────────────────
    if (counts.enriched > 0) {
      const listItems = enrichedListings
        .map(l => `<li><strong>${escapeHtml(l.name)}</strong> <span style="color:#888">(${l.vertical})</span></li>`)
        .join('\n')

      await sendAgentEmail({
        subject: `Enrichment Agent \u2014 ${counts.enriched} descriptions ready for review`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px;">
            <h2 style="font-size: 18px; font-weight: 400; color: #1a1a1a; margin-bottom: 16px;">
              Enrichment Agent Run Complete
            </h2>
            <p style="font-size: 14px; color: #444; margin-bottom: 16px;">
              ${counts.enriched} new AI description${counts.enriched === 1 ? '' : 's'} generated and awaiting review.
            </p>
            <ul style="font-size: 13px; color: #333; line-height: 1.8; padding-left: 20px;">
              ${listItems}
            </ul>
            <p style="margin-top: 24px;">
              <a href="https://australianatlas.com.au/admin/enrichment-review"
                 style="display: inline-block; padding: 10px 20px; background: #4A7C59; color: #fff; text-decoration: none; border-radius: 6px; font-size: 13px;">
                Review Descriptions
              </a>
            </p>
            <p style="font-size: 12px; color: #999; margin-top: 24px;">
              Attempted: ${counts.attempted} | Enriched: ${counts.enriched} | Skipped: ${counts.skipped} | Errors: ${counts.errors}
            </p>
          </div>
        `,
      })
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[enrichment-agent] Done in ${duration}s — ${counts.enriched} enriched, ${counts.skipped} skipped, ${counts.errors} errors`)

    await completeRun(runId, { status: 'success', summary: counts })

    return NextResponse.json({ ok: true, duration: `${duration}s`, ...counts })

  } catch (err) {
    console.error('[enrichment-agent] Fatal error:', err.message)
    await completeRun(runId, { status: 'error', error: err.message, summary: counts })
    return NextResponse.json({ ok: false, error: err.message, ...counts }, { status: 500 })
  }
}


// ─── Helpers ───────────────────────────────────────────────────


/**
 * Scrape a website URL and extract meaningful text content.
 * Returns the first ~2000 characters of body text with HTML stripped.
 */
async function scrapeWebsite(url) {
  try {
    const normalised = url.startsWith('http') ? url : `https://${url}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    const res = await fetch(normalised, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AustralianAtlasBot/1.0 (+https://australianatlas.com.au)',
        'Accept': 'text/html',
      },
      redirect: 'follow',
    })
    clearTimeout(timeout)

    if (!res.ok) return null

    const html = await res.text()

    // Strip script, style, nav, header, footer tags and their contents
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, ' ')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')               // Strip remaining HTML tags
      .replace(/&[a-z]+;/gi, ' ')              // Strip HTML entities
      .replace(/\s+/g, ' ')                    // Collapse whitespace
      .trim()

    // Take the first ~2000 meaningful characters
    return text.slice(0, 2000)
  } catch (err) {
    console.warn(`[enrichment-agent] Scrape failed for ${url}:`, err.message)
    return null
  }
}


/**
 * Generate a description via Anthropic Claude API (direct fetch, no SDK).
 */
async function generateDescription(listing, scrapedText) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[enrichment-agent] ANTHROPIC_API_KEY not set — skipping generation')
    return null
  }

  const prompt = `You are writing for Australian Atlas, a curated guide to independent Australian places. Write a description of ${listing.name} (${listing.vertical}) in ${listing.region || 'Unknown Region'}, ${listing.state || 'Australia'} in 60-80 words. Voice: place-based, specific, non-promotional, measured. Do not use the word 'unique', 'passionate', or 'journey'. Do not mention the business name in the first sentence. Ground it in what is specific about this place \u2014 what it makes, where it is, what kind of person would love it. Source material: ${scrapedText}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [
          { role: 'user', content: prompt },
        ],
      }),
    })

    if (!res.ok) {
      const errorBody = await res.text()
      console.error(`[enrichment-agent] Claude API error (${res.status}):`, errorBody)
      return null
    }

    const data = await res.json()
    const text = data?.content?.[0]?.text?.trim()
    return text || null

  } catch (err) {
    console.error('[enrichment-agent] Claude API call failed:', err.message)
    return null
  }
}


function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
