#!/usr/bin/env node
/**
 * Enrichment Hallucination Audit — retroactively verifies AI-generated
 * descriptions that were created before source text storage was added.
 *
 * For each listing with an ai_description but no enrichment_source_text:
 *   1. Re-scrapes the venue website to recover source material
 *   2. Runs Claude Haiku grounding verification against the description
 *   3. Stores source text, confidence, risk level, and grounding result
 *
 * Usage:
 *   node --env-file=.env.local scripts/audit-enrichment.mjs
 *   node --env-file=.env.local scripts/audit-enrichment.mjs --limit 100
 *   node --env-file=.env.local scripts/audit-enrichment.mjs --dry-run
 *   node --env-file=.env.local scripts/audit-enrichment.mjs --dry-run --limit 10
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

// ─── Arg parsing ────────────────────────────────────────────────────────────

const args = process.argv.slice(2)

function argValue(flag) {
  const idx = args.indexOf(flag)
  if (idx === -1 || idx + 1 >= args.length) return undefined
  return args[idx + 1]
}

const DRY_RUN = args.includes('--dry-run')
const LIMIT = Number(argValue('--limit')) || 50

// ─── Env checks ─────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[audit-enrichment] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!ANTHROPIC_KEY) {
  console.error('[audit-enrichment] Missing ANTHROPIC_API_KEY')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Scraping ───────────────────────────────────────────────────────────────

/**
 * Scrape a website URL and extract meaningful text content.
 * Mirrors the enrichment agent's scraping logic: strips script, style, nav,
 * header, footer tags, collapses whitespace, returns first 3000 chars.
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

    return text.slice(0, 3000)
  } catch (err) {
    return null
  }
}

// ─── Word count ─────────────────────────────────────────────────────────────

function countWords(text) {
  if (!text) return 0
  return text.split(/\s+/).filter(w => w.length > 0).length
}

// ─── Grounding verification ────────────────────────────────────────────────

/**
 * Calls Claude Haiku to verify an AI description against scraped source text.
 * Uses the same prompt and model as the enrichment agent's verifyGrounding().
 *
 * Returns: { confidence, risk_level, issues, verdict }
 */
async function verifyGrounding(listingName, description, sourceText) {
  const fallback = {
    confidence: 50,
    risk_level: 'unaudited',
    issues: ['Verification not performed'],
    verdict: 'Verification skipped',
  }

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
        'x-api-key': ANTHROPIC_KEY,
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
      const errorBody = await res.text()
      console.error(`[audit-enrichment] Claude API error (${res.status}):`, errorBody)
      return fallback
    }

    const data = await res.json()
    const text = data?.content?.[0]?.text?.trim()

    if (!text) return fallback

    // Parse JSON response — handle potential markdown wrapping
    const jsonStr = text.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim()
    const result = JSON.parse(jsonStr)

    return {
      confidence: Math.max(0, Math.min(100, Number(result.confidence) || 50)),
      risk_level: ['low', 'medium', 'high'].includes(result.risk_level) ? result.risk_level : 'medium',
      issues: Array.isArray(result.issues) ? result.issues.slice(0, 10) : [],
      verdict: String(result.verdict || 'No verdict provided').slice(0, 500),
    }

  } catch (err) {
    console.error(`[audit-enrichment] Grounding verification failed:`, err.message)
    return fallback
  }
}

// ─── Rate limiter ───────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n================================================')
  console.log('  AUSTRALIAN ATLAS — ENRICHMENT HALLUCINATION AUDIT')
  console.log(`  Mode: ${DRY_RUN ? '\x1b[33mDRY RUN (no database changes)\x1b[0m' : '\x1b[32mLIVE (will update database)\x1b[0m'}`)
  console.log(`  Limit: ${LIMIT} listings per run`)
  console.log('================================================\n')

  // ── 1. Find listings with ai_description but no enrichment_source_text ────

  const { data: listings, error: fetchError } = await sb
    .from('listings')
    .select('id, name, slug, vertical, region, state, website, ai_description, enrichment_status')
    .not('ai_description', 'is', null)
    .is('enrichment_source_text', null)
    .order('created_at', { ascending: true })
    .limit(LIMIT)

  if (fetchError) {
    console.error('[audit-enrichment] Failed to fetch listings:', fetchError.message)
    process.exit(1)
  }

  if (!listings || listings.length === 0) {
    console.log('[audit-enrichment] No listings need auditing. All enrichments have source text.')
    return
  }

  console.log(`[audit-enrichment] Found ${listings.length} listing(s) to audit\n`)

  // ── 2. Process each listing ───────────────────────────────────────────────

  const results = []
  const counts = { audited: 0, skipped_no_website: 0, scrape_failed: 0, verified: 0, errors: 0 }

  for (let i = 0; i < listings.length; i++) {
    const listing = listings[i]
    const progress = `[${i + 1}/${listings.length}]`

    // Skip listings without a website URL
    if (!listing.website) {
      counts.skipped_no_website++
      console.log(`${progress} SKIP "${listing.name}" — no website URL`)

      if (!DRY_RUN) {
        await sb.from('listings').update({
          enrichment_risk_level: 'unaudited',
          enrichment_grounding_result: {
            confidence: 0,
            risk_level: 'unaudited',
            issues: ['No website URL available for retroactive verification'],
            verdict: 'Cannot verify — no website to scrape',
          },
        }).eq('id', listing.id)
      }

      continue
    }

    counts.audited++

    if (DRY_RUN) {
      console.log(`${progress} WOULD AUDIT "${listing.name}" (${listing.vertical}) — ${listing.website}`)
      results.push({
        name: listing.name,
        vertical: listing.vertical,
        website: listing.website,
        confidence: null,
        risk_level: 'pending',
        issues: [],
        verdict: 'Dry run — not verified',
      })
      continue
    }

    // ── 2a. Scrape website ──────────────────────────────────────────────────

    console.log(`${progress} Scraping "${listing.name}" — ${listing.website}`)
    const scrapedText = await scrapeWebsite(listing.website)
    const sourceWordCount = scrapedText ? countWords(scrapedText) : 0

    if (!scrapedText || sourceWordCount < 10) {
      counts.scrape_failed++
      console.log(`${progress} SCRAPE FAILED "${listing.name}" — ${sourceWordCount} words recovered`)

      await sb.from('listings').update({
        enrichment_source_text: scrapedText ? scrapedText.slice(0, 2000) : null,
        enrichment_source_word_count: sourceWordCount,
        enrichment_risk_level: 'unaudited',
        enrichment_grounding_result: {
          confidence: 0,
          risk_level: 'unaudited',
          issues: ['Website scrape failed or returned insufficient text for verification'],
          verdict: `Scrape returned ${sourceWordCount} words — insufficient for verification`,
        },
      }).eq('id', listing.id)

      results.push({
        name: listing.name,
        vertical: listing.vertical,
        website: listing.website,
        confidence: 0,
        risk_level: 'unaudited',
        issues: ['Scrape failed'],
        verdict: `Scrape returned ${sourceWordCount} words`,
      })

      continue
    }

    // ── 2b. Verify grounding via Claude ─────────────────────────────────────

    console.log(`${progress} Verifying grounding for "${listing.name}" (${sourceWordCount} words scraped)`)
    const grounding = await verifyGrounding(listing.name, listing.ai_description, scrapedText)

    // ── 2c. Store results ───────────────────────────────────────────────────

    const { error: updateError } = await sb
      .from('listings')
      .update({
        enrichment_source_text: scrapedText.slice(0, 2000),
        enrichment_source_word_count: sourceWordCount,
        enrichment_confidence: grounding.confidence,
        enrichment_risk_level: grounding.risk_level,
        enrichment_grounding_result: grounding,
      })
      .eq('id', listing.id)

    if (updateError) {
      console.error(`${progress} DB UPDATE FAILED for "${listing.name}":`, updateError.message)
      counts.errors++
      continue
    }

    counts.verified++
    const riskColor = grounding.risk_level === 'high' ? '\x1b[31m' : grounding.risk_level === 'medium' ? '\x1b[33m' : '\x1b[32m'
    console.log(`${progress} ${riskColor}${grounding.risk_level.toUpperCase()}\x1b[0m "${listing.name}" — confidence: ${grounding.confidence}, ${grounding.verdict}`)

    results.push({
      name: listing.name,
      vertical: listing.vertical,
      website: listing.website,
      confidence: grounding.confidence,
      risk_level: grounding.risk_level,
      issues: grounding.issues,
      verdict: grounding.verdict,
    })

    // ── Rate limit: 500ms between Claude API calls ──────────────────────────
    if (i < listings.length - 1) {
      await sleep(500)
    }
  }

  // ── 3. Summary report ────────────────────────────────────────────────────

  console.log('\n================================================')
  console.log('  AUDIT SUMMARY')
  console.log('================================================')

  const riskBreakdown = { high: 0, medium: 0, low: 0, unaudited: 0, pending: 0 }
  for (const r of results) {
    const level = r.risk_level || 'unaudited'
    if (level in riskBreakdown) riskBreakdown[level]++
    else riskBreakdown.unaudited++
  }

  console.log(`\n  Total listings found:       ${listings.length}`)
  console.log(`  Audited (had website):      ${counts.audited}`)
  console.log(`  Skipped (no website):       ${counts.skipped_no_website}`)
  console.log(`  Scrape failures:            ${counts.scrape_failed}`)
  console.log(`  Successfully verified:      ${counts.verified}`)
  console.log(`  DB errors:                  ${counts.errors}`)

  console.log(`\n  Risk Breakdown:`)
  if (riskBreakdown.high > 0) console.log(`    \x1b[31mHigh risk:     ${riskBreakdown.high}\x1b[0m`)
  if (riskBreakdown.medium > 0) console.log(`    \x1b[33mMedium risk:   ${riskBreakdown.medium}\x1b[0m`)
  if (riskBreakdown.low > 0) console.log(`    \x1b[32mLow risk:      ${riskBreakdown.low}\x1b[0m`)
  if (riskBreakdown.unaudited > 0) console.log(`    Unaudited:     ${riskBreakdown.unaudited}`)
  if (riskBreakdown.pending > 0) console.log(`    Pending (dry): ${riskBreakdown.pending}`)

  // ── Top 10 highest-risk descriptions ──────────────────────────────────────

  const riskyResults = results
    .filter(r => r.confidence !== null && r.risk_level !== 'pending')
    .sort((a, b) => a.confidence - b.confidence)
    .slice(0, 10)

  if (riskyResults.length > 0) {
    console.log(`\n  Top ${riskyResults.length} Highest-Risk Descriptions:`)
    console.log('  ' + '-'.repeat(70))

    for (let i = 0; i < riskyResults.length; i++) {
      const r = riskyResults[i]
      const riskColor = r.risk_level === 'high' ? '\x1b[31m' : r.risk_level === 'medium' ? '\x1b[33m' : '\x1b[32m'
      console.log(`\n  ${i + 1}. ${r.name} (${r.vertical})`)
      console.log(`     Confidence: ${r.confidence}/100  Risk: ${riskColor}${r.risk_level.toUpperCase()}\x1b[0m`)
      if (r.issues.length > 0) {
        console.log(`     Issues:`)
        for (const issue of r.issues) {
          console.log(`       - ${issue}`)
        }
      }
      if (r.verdict) {
        console.log(`     Verdict: ${r.verdict}`)
      }
    }
  }

  console.log('\n================================================\n')

  if (DRY_RUN) {
    console.log('\x1b[33m  This was a dry run. No changes were made to the database.\x1b[0m')
    console.log('  Run without --dry-run to apply changes.\n')
  }
}

main().catch(err => {
  console.error('[audit-enrichment] Fatal error:', err)
  process.exit(1)
})
