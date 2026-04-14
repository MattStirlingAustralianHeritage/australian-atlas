import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'

export const maxDuration = 300

// Minimum word count for scraped source text to be considered usable
const MIN_SOURCE_WORDS = 150

/**
 * GET /api/cron/enrichment-agent
 *
 * Enrichment agent v2 — scrapes listing websites, generates AI descriptions
 * via Anthropic Claude, then runs a grounding verification pass to detect
 * hallucination risk. Stores source text, confidence score, and risk level.
 *
 * Pipeline: scrape → quality gate → generate → verify → store
 *
 * Processes up to 20 listings per run. Admin reviews at /admin/enrichment-review.
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

  const counts = { attempted: 0, enriched: 0, skipped: 0, errors: 0, low_quality_source: 0 }
  const enrichedListings = []

  try {
    // ── Fetch candidates for enrichment ──────────────────────
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

      // Filter out listings with adequate existing descriptions
      if (listing.description && listing.description.trim().length >= 40) {
        counts.skipped++
        console.log(`[enrichment-agent] Skipped "${listing.name}" — description already adequate (${listing.description.length} chars)`)
        await sb.from('listings').update({ enrichment_attempted_at: new Date().toISOString() }).eq('id', listing.id)
        continue
      }

      try {
        // ── 1. Scrape website ──────────────────────────────
        const scrapedText = await scrapeWebsite(listing.website)
        const sourceWordCount = scrapedText ? countWords(scrapedText) : 0

        // ── 2. Source quality gate (150 words minimum) ─────
        if (!scrapedText || sourceWordCount < MIN_SOURCE_WORDS) {
          console.log(`[enrichment-agent] Skipped "${listing.name}" — source too thin (${sourceWordCount} words, need ${MIN_SOURCE_WORDS})`)
          counts.low_quality_source++
          counts.skipped++
          await sb.from('listings').update({
            enrichment_attempted_at: new Date().toISOString(),
            enrichment_source_word_count: sourceWordCount,
            enrichment_source_text: scrapedText ? scrapedText.slice(0, 2000) : null,
          }).eq('id', listing.id)
          continue
        }

        // ── 3. Generate description via Claude ─────────────
        const aiDescription = await generateDescription(listing, scrapedText)

        if (!aiDescription) {
          console.log(`[enrichment-agent] No description generated for "${listing.name}"`)
          counts.errors++
          await sb.from('listings').update({
            enrichment_attempted_at: new Date().toISOString(),
            enrichment_source_text: scrapedText.slice(0, 2000),
            enrichment_source_word_count: sourceWordCount,
          }).eq('id', listing.id)
          continue
        }

        // ── 4. Grounding verification (second Claude call) ─
        const grounding = await verifyGrounding(listing.name, aiDescription, scrapedText)

        // ── 5. Store result with source text + confidence ──
        const { error: updateError } = await sb
          .from('listings')
          .update({
            ai_description: aiDescription,
            enrichment_attempted_at: new Date().toISOString(),
            enrichment_status: 'pending_review',
            enrichment_source_text: scrapedText.slice(0, 2000),
            enrichment_source_word_count: sourceWordCount,
            enrichment_confidence: grounding.confidence,
            enrichment_risk_level: grounding.risk_level,
            enrichment_grounding_result: grounding,
          })
          .eq('id', listing.id)

        if (updateError) {
          console.error(`[enrichment-agent] DB update failed for "${listing.name}":`, updateError.message)
          counts.errors++
          continue
        }

        counts.enriched++
        enrichedListings.push({
          name: listing.name,
          vertical: listing.vertical,
          confidence: grounding.confidence,
          risk: grounding.risk_level,
        })
        console.log(`[enrichment-agent] Enriched: "${listing.name}" (${listing.vertical}) — confidence: ${grounding.confidence}, risk: ${grounding.risk_level}`)

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
      const highRisk = enrichedListings.filter(l => l.risk === 'high').length
      const medRisk = enrichedListings.filter(l => l.risk === 'medium').length

      const listItems = enrichedListings
        .map(l => {
          const riskBadge = l.risk === 'high'
            ? '<span style="color:#c44;font-weight:600">\u26a0 HIGH RISK</span>'
            : l.risk === 'medium'
            ? '<span style="color:#c90;font-weight:600">\u26a1 MEDIUM</span>'
            : '<span style="color:#4a7c59">\u2713 LOW</span>'
          return `<li><strong>${escapeHtml(l.name)}</strong> <span style="color:#888">(${l.vertical})</span> \u2014 ${riskBadge} (${l.confidence}%)</li>`
        })
        .join('\n')

      await sendAgentEmail({
        subject: `Enrichment Agent \u2014 ${counts.enriched} descriptions ready${highRisk > 0 ? ` (${highRisk} high risk)` : ''}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px;">
            <h2 style="font-size: 18px; font-weight: 400; color: #1a1a1a; margin-bottom: 16px;">
              Enrichment Agent Run Complete
            </h2>
            <p style="font-size: 14px; color: #444; margin-bottom: 16px;">
              ${counts.enriched} new AI description${counts.enriched === 1 ? '' : 's'} generated and awaiting review.
              ${highRisk > 0 ? `<br><strong style="color:#c44">${highRisk} flagged as high hallucination risk.</strong>` : ''}
              ${medRisk > 0 ? `<br><span style="color:#c90">${medRisk} flagged as medium risk.</span>` : ''}
              ${counts.low_quality_source > 0 ? `<br>${counts.low_quality_source} skipped due to thin source material (&lt;${MIN_SOURCE_WORDS} words).` : ''}
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
              Attempted: ${counts.attempted} | Enriched: ${counts.enriched} | Skipped: ${counts.skipped} | Low quality source: ${counts.low_quality_source} | Errors: ${counts.errors}
            </p>
          </div>
        `,
      })
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[enrichment-agent] Done in ${duration}s \u2014 ${counts.enriched} enriched, ${counts.skipped} skipped (${counts.low_quality_source} thin source), ${counts.errors} errors`)

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
 * Count words in a string (splitting on whitespace).
 */
function countWords(text) {
  if (!text) return 0
  return text.split(/\s+/).filter(w => w.length > 0).length
}


/**
 * Scrape a website URL and extract meaningful text content.
 * Returns the first ~3000 characters of body text with HTML stripped.
 * Increased from 2000 to give Claude more material to work with.
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

    // Take the first ~3000 meaningful characters
    return text.slice(0, 3000)
  } catch (err) {
    console.warn(`[enrichment-agent] Scrape failed for ${url}:`, err.message)
    return null
  }
}


/**
 * Generate a description via Anthropic Claude API.
 *
 * Updated prompt with stronger grounding instruction:
 * - Explicitly forbids inventing details not in source
 * - Requires factual claims to be traceable to source
 * - Warns about common hallucination patterns
 */
async function generateDescription(listing, scrapedText) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[enrichment-agent] ANTHROPIC_API_KEY not set \u2014 skipping generation')
    return null
  }

  const prompt = `You are writing for Australian Atlas, a curated guide to independent Australian places.

Write a description of ${listing.name} (${listing.vertical}) in ${listing.region || 'Unknown Region'}, ${listing.state || 'Australia'} in 60-80 words.

Voice: place-based, specific, non-promotional, measured.

STRICT GROUNDING RULES:
- ONLY include facts, details, and claims that are directly supported by the source material below.
- Do NOT invent founding years, owner names, ingredient details, specific dishes, awards, or any other facts not present in the source.
- Do NOT infer what kind of food is served, what products are made, or what the space looks like unless the source explicitly states it.
- If the source is vague, write a more atmospheric description focused on location and type rather than inventing specifics.
- Every factual claim in your description must be traceable to a phrase in the source material.

Style rules:
- Do not use the word 'unique', 'passionate', or 'journey'.
- Do not mention the business name in the first sentence.
- Ground it in what is specific about this place \u2014 what it makes, where it is, what kind of person would love it.
- Prefer concrete over abstract. If you cannot be concrete from the source, be honest and atmospheric.

SOURCE MATERIAL:
${scrapedText}`

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


/**
 * Grounding verification \u2014 second Claude call to check the generated
 * description against the source material for hallucinated details.
 *
 * Returns: { confidence: 0-100, risk_level: 'low'|'medium'|'high', issues: string[], verdict: string }
 */
async function verifyGrounding(listingName, description, sourceText) {
  // Default result if verification fails or API key missing
  const fallback = { confidence: 50, risk_level: 'unaudited', issues: ['Verification not performed'], verdict: 'Verification skipped' }

  if (!process.env.ANTHROPIC_API_KEY) return fallback

  const prompt = `You are a fact-checking editor for Australian Atlas. Your job is to verify that an AI-generated venue description is grounded in the source material and does not contain hallucinated details.

VENUE: ${listingName}

AI-GENERATED DESCRIPTION:
"${description}"

SOURCE MATERIAL (scraped from venue website):
"${sourceText.slice(0, 2000)}"

Analyse the description and check every factual claim against the source. Look for:
1. Invented founding years or dates not in the source
2. Owner/chef names not mentioned in the source
3. Specific dishes, ingredients, or products not described in the source
4. Awards or accolades not mentioned in the source
5. Architectural or interior details not described in the source
6. Historical claims not supported by the source
7. Specific processes or techniques not mentioned in the source

Respond in this exact JSON format (no markdown, no code blocks):
{"confidence": <0-100>, "risk_level": "<low|medium|high>", "issues": ["<issue 1>", "<issue 2>"], "verdict": "<one sentence summary>"}

Scoring guide:
- 90-100 (low risk): All claims clearly traceable to source. No invented details.
- 60-89 (medium risk): Minor inferences or atmospheric embellishments that go slightly beyond source. Plausible but not explicitly stated.
- 0-59 (high risk): Contains specific claims (names, dates, dishes, awards) not found in source material.

If issues array is empty, that means no problems found.`

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
        max_tokens: 500,
        messages: [
          { role: 'user', content: prompt },
        ],
      }),
    })

    if (!res.ok) {
      console.error(`[enrichment-agent] Grounding verification API error (${res.status})`)
      return fallback
    }

    const data = await res.json()
    const text = data?.content?.[0]?.text?.trim()

    if (!text) return fallback

    // Parse JSON response — handle potential markdown wrapping
    const jsonStr = text.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim()
    const result = JSON.parse(jsonStr)

    // Validate and normalise
    return {
      confidence: Math.max(0, Math.min(100, Number(result.confidence) || 50)),
      risk_level: ['low', 'medium', 'high'].includes(result.risk_level) ? result.risk_level : 'medium',
      issues: Array.isArray(result.issues) ? result.issues.slice(0, 10) : [],
      verdict: String(result.verdict || 'No verdict provided').slice(0, 500),
    }

  } catch (err) {
    console.error('[enrichment-agent] Grounding verification failed:', err.message)
    return fallback
  }
}


function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
