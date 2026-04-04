#!/usr/bin/env node
/**
 * Name/URL Mismatch Audit — flags listings where the business name doesn't
 * match the associated website URL, for manual review.
 *
 * Two-pass approach:
 *   Pass 1 — Heuristic: token overlap between domain and listing name
 *   Pass 2 — LLM: batch-verifies flagged records via Claude Haiku
 *
 * Output: audit/name-url-mismatches.csv
 *
 * Usage:
 *   node --env-file=.env.local scripts/audit-name-url-mismatches.mjs
 *   node --env-file=.env.local scripts/audit-name-url-mismatches.mjs --vertical=sba
 */
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')

// ─── Config ──────────────────────────────────────────────────────────────────

// Load env vars from .env.local, overriding any empty shell vars
import { readFileSync } from 'fs'
try {
  const envPath = join(PROJECT_ROOT, '.env.local')
  const envContent = readFileSync(envPath, 'utf8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) continue
    const key = trimmed.slice(0, eqIdx)
    const val = trimmed.slice(eqIdx + 1)
    // Only override if current value is empty or undefined
    if (!process.env[key]) process.env[key] = val
  }
} catch { /* .env.local not found — rely on --env-file or shell env */ }

const MASTER_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const MASTER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

if (!MASTER_URL || !MASTER_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!ANTHROPIC_KEY) {
  console.error('Missing ANTHROPIC_API_KEY (needed for Pass 2 LLM verification)')
  process.exit(1)
}

const sb = createClient(MASTER_URL, MASTER_KEY)

const args = process.argv.slice(2)
const verticalArg = args.find(a => a.startsWith('--vertical='))?.split('=')[1]

const VERTICALS = ['sba', 'collection', 'craft', 'fine_grounds', 'rest', 'field', 'corner', 'found', 'table']
const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Collection', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

const verticalsToAudit = verticalArg
  ? (VERTICALS.includes(verticalArg) ? [verticalArg] : (() => { console.error(`Unknown vertical: ${verticalArg}`); process.exit(1) })())
  : VERTICALS

// ─── Heuristic helpers ───────────────────────────────────────────────────────

// Common words to strip before comparing tokens
const STOP_WORDS = new Set([
  'the', 'and', 'of', 'in', 'at', 'a', 'an', 'to', 'for', 'on', 'by',
  'is', 'it', 'au', 'com', 'www', 'org', 'net', 'co', 'info',
  'pty', 'ltd', 'inc',
])

/**
 * Extract the registrable domain from a URL, strip TLD and www.
 * e.g. "https://www.beechworththoys.com.au/about" → "beechworththoys"
 */
function extractDomain(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    // Strip www prefix
    const noWww = hostname.replace(/^www\./, '')
    // Strip TLD suffixes (.com.au, .com, .org.au, .net.au, etc.)
    const domain = noWww
      .replace(/\.(com|org|net|gov|edu)\.(au|nz|uk)$/, '')
      .replace(/\.(com|org|net|gov|edu|au|nz|io|co|info|biz)$/, '')
    return domain
  } catch {
    return null
  }
}

/**
 * Tokenise a string: lowercase, split on non-alpha, remove stop words and
 * very short tokens (< 3 chars). Returns unique meaningful tokens.
 */
function tokenise(str) {
  if (!str) return []
  return [...new Set(
    str.toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3 && !STOP_WORDS.has(t))
  )]
}

/**
 * Check if any meaningful token from the listing name appears (as a substring)
 * within the domain string, or vice versa.
 * Returns { match: boolean, overlapping: string[] }
 */
function checkTokenOverlap(nameTokens, domainStr) {
  if (!nameTokens.length || !domainStr) return { match: false, overlapping: [] }

  const overlapping = []
  for (const token of nameTokens) {
    // Token appears as substring in domain (covers abbreviations, compound words)
    if (domainStr.includes(token)) {
      overlapping.push(token)
    }
    // Or domain contains a substring that matches a significant portion of the token
    // (handles cases like "antiques" in name matching "antique" in domain)
    else if (token.length >= 4) {
      const stem = token.slice(0, -1) // rough stem: drop last char
      if (domainStr.includes(stem)) {
        overlapping.push(`${token}~`)
      }
    }
  }

  // Also check reverse: domain tokens appearing in the joined name string
  const domainTokens = tokenise(domainStr)
  const nameJoined = nameTokens.join(' ')
  for (const dt of domainTokens) {
    if (nameJoined.includes(dt) && !overlapping.some(o => o.replace('~', '') === dt)) {
      overlapping.push(dt)
    }
  }

  return { match: overlapping.length > 0, overlapping }
}

// ─── Data fetching ───────────────────────────────────────────────────────────

async function fetchListings(vertical) {
  const allListings = []
  const pageSize = 1000
  let from = 0

  while (true) {
    const { data, error } = await sb
      .from('listings')
      .select('id, name, website, region, state')
      .eq('status', 'active')
      .eq('vertical', vertical)
      .not('website', 'is', null)
      .neq('website', '')
      .range(from, from + pageSize - 1)

    if (error) {
      console.error(`  Error fetching ${vertical} listings:`, error.message)
      break
    }
    if (!data || data.length === 0) break
    allListings.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }

  return allListings
}

// ─── Pass 1: Heuristic check ─────────────────────────────────────────────────

function heuristicCheck(listing) {
  const domain = extractDomain(listing.website)
  if (!domain) return { flagged: true, reason: 'invalid_url' }

  const nameTokens = tokenise(listing.name)
  const { match, overlapping } = checkTokenOverlap(nameTokens, domain)

  if (!match) {
    return {
      flagged: true,
      reason: `no token overlap — name tokens: [${nameTokens.join(', ')}], domain: "${domain}"`,
    }
  }

  return { flagged: false, overlapping }
}

// ─── Pass 2: LLM verification (batched) ──────────────────────────────────────

const LLM_BATCH_SIZE = 50

async function llmVerifyBatch(records) {
  const batch = records.map(r => ({
    id: r.id,
    vertical: r.vertical,
    name: r.name,
    website: r.website,
  }))

  const prompt = `For each of the following listings, determine whether the website URL plausibly belongs to the named business. Consider abbreviations, trading names, partial matches, and common rebrandings as acceptable.

Return a JSON array with exactly ${batch.length} objects, each with:
- "id": the listing id (string)
- "verdict": "likely_mismatch" | "plausible_match" | "uncertain"
- "reason": one-line explanation

Listings:
${JSON.stringify(batch, null, 2)}

Respond with the JSON array only. No markdown fences, no explanation text.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error(`  LLM API error (${res.status}):`, errText.slice(0, 200))
      // Fall back: mark all as uncertain
      return records.map(r => ({ id: r.id, verdict: 'uncertain', reason: 'LLM API error' }))
    }

    const data = await res.json()
    const textBlock = data.content?.find(b => b.type === 'text')
    if (!textBlock) {
      return records.map(r => ({ id: r.id, verdict: 'uncertain', reason: 'No LLM response' }))
    }

    let rawText = textBlock.text.trim()
    if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    const verdicts = JSON.parse(rawText)
    return verdicts
  } catch (err) {
    console.error(`  LLM parse error:`, err.message)
    return records.map(r => ({ id: r.id, verdict: 'uncertain', reason: `Parse error: ${err.message}` }))
  }
}

async function llmVerify(flaggedRecords) {
  const allVerdicts = []
  const batches = []

  for (let i = 0; i < flaggedRecords.length; i += LLM_BATCH_SIZE) {
    batches.push(flaggedRecords.slice(i, i + LLM_BATCH_SIZE))
  }

  console.log(`\nPass 2 — LLM verification: ${flaggedRecords.length} records in ${batches.length} batch(es)`)

  for (let i = 0; i < batches.length; i++) {
    process.stdout.write(`  Batch ${i + 1}/${batches.length} (${batches[i].length} records)...`)
    const verdicts = await llmVerifyBatch(batches[i])
    allVerdicts.push(...verdicts)
    console.log(' done')
  }

  return allVerdicts
}

// ─── CSV writing ─────────────────────────────────────────────────────────────

function escapeCSV(val) {
  if (val == null) return ''
  const str = String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function writeCSV(rows, outputPath) {
  const header = 'vertical,id,name,website,suburb,state,heuristic_flag,llm_verdict,llm_reason'
  const lines = [header]

  for (const row of rows) {
    lines.push([
      escapeCSV(row.vertical),
      escapeCSV(row.id),
      escapeCSV(row.name),
      escapeCSV(row.website),
      escapeCSV(row.suburb),
      escapeCSV(row.state),
      escapeCSV(row.heuristic_flag),
      escapeCSV(row.llm_verdict),
      escapeCSV(row.llm_reason),
    ].join(','))
  }

  // Ensure audit/ directory exists
  const dir = dirname(outputPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  writeFileSync(outputPath, lines.join('\n') + '\n')
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Name/URL Mismatch Audit')
  console.log(`Verticals: ${verticalsToAudit.map(v => VERTICAL_LABELS[v]).join(', ')}`)
  console.log('')

  // Pass 1: collect all heuristic flags
  const allFlagged = []
  let totalChecked = 0

  for (const vertical of verticalsToAudit) {
    process.stdout.write(`Pass 1 — ${VERTICAL_LABELS[vertical]}... `)
    const listings = await fetchListings(vertical)

    let flagged = 0
    for (const listing of listings) {
      const result = heuristicCheck(listing)
      if (result.flagged) {
        allFlagged.push({
          id: listing.id,
          vertical,
          name: listing.name,
          website: listing.website,
          suburb: listing.region || '',
          state: listing.state || '',
          heuristic_flag: result.reason,
        })
        flagged++
      }
    }

    totalChecked += listings.length
    console.log(`${listings.length} listings, ${flagged} flagged`)
  }

  if (allFlagged.length === 0) {
    console.log('\nNo heuristic flags found. All name/URL pairs appear consistent.')
    return
  }

  // Pass 2: LLM verification
  const verdicts = await llmVerify(allFlagged)

  // Merge verdicts back into flagged records
  const verdictMap = new Map(verdicts.map(v => [v.id, v]))

  const results = allFlagged.map(row => {
    const v = verdictMap.get(row.id)
    return {
      ...row,
      llm_verdict: v?.verdict || 'uncertain',
      llm_reason: v?.reason || 'No verdict returned',
    }
  })

  // Sort: likely_mismatch first, then uncertain, then plausible_match. Within group, by vertical.
  const VERDICT_ORDER = { likely_mismatch: 0, uncertain: 1, plausible_match: 2 }
  results.sort((a, b) => {
    const va = VERDICT_ORDER[a.llm_verdict] ?? 1
    const vb = VERDICT_ORDER[b.llm_verdict] ?? 1
    if (va !== vb) return va - vb
    return a.vertical.localeCompare(b.vertical)
  })

  // Write CSV
  const outputPath = join(PROJECT_ROOT, 'audit', 'name-url-mismatches.csv')
  writeCSV(results, outputPath)

  // Summary
  const mismatches = results.filter(r => r.llm_verdict === 'likely_mismatch').length
  const uncertain = results.filter(r => r.llm_verdict === 'uncertain').length
  const plausible = results.filter(r => r.llm_verdict === 'plausible_match').length

  console.log('\n─────────────────────────────────────')
  console.log('Audit complete.')
  console.log(`  Total listings checked: ${totalChecked}`)
  console.log(`  Heuristic flags: ${allFlagged.length}`)
  console.log(`  LLM confirmed mismatches: ${mismatches}`)
  console.log(`  LLM uncertain: ${uncertain}`)
  console.log(`  LLM plausible matches: ${plausible}`)
  console.log(`  Report written to ${outputPath}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
