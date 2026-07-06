#!/usr/bin/env node

/**
 * Generate structured narrative content for each LIVE region using Claude,
 * grounded in verified listing rows and machine-validated before saving.
 *
 * Produces four blocks per region (editorial_overview, best_time_to_visit,
 * what_makes_distinct, vertical_highlights) stored in region_narratives and
 * rendered by /regions/[slug].
 *
 * Grounding rules (this replaced an earlier version after the 2026-06-12
 * hallucination audit found 111 invented venue names in region editorial):
 *   - The prose fields may NOT name any business. Venue names live only in
 *     vertical_highlights, where each listing_name must exactly match an
 *     active listing in the region or the entry is dropped.
 *   - Proper nouns in prose are checked against a whitelist built from the
 *     region name, its real towns/suburbs, states, and generic geo terms.
 *     A violation triggers one retry with feedback; if it persists, the
 *     offending field is dropped rather than published.
 *
 * Usage:
 *   node --env-file=.env.local scripts/generate-region-narratives.mjs [--slug=x] [--force] [--dry-run] [--limit=N]
 */

import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local', override: true })

const { default: Anthropic } = await import('@anthropic-ai/sdk')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const args = process.argv.slice(2)
const singleSlug = args.find(a => a.startsWith('--slug='))?.split('=')[1]
const limitArg = Number(args.find(a => a.startsWith('--limit='))?.split('=')[1] || 0)
const force = args.includes('--force')
const dryRun = args.includes('--dry-run')

const MODEL = 'claude-sonnet-5'
const PROMPT_VERSION = 'v2-grounded-2026-07-06'

const VERTICAL_LABELS = {
  sba: 'Small Batch (wineries, breweries, distilleries, artisan producers)',
  fine_grounds: 'Fine Grounds (specialty coffee roasters)',
  collection: 'Culture (museums, galleries, heritage collections)',
  craft: 'Craft (makers, studios, artisans)',
  rest: 'Rest (boutique accommodation)',
  field: 'Field (nature, walks, outdoor places)',
  corner: 'Corner (independent shops)',
  found: 'Found (vintage, op shops, secondhand)',
  table: 'Table (independent dining, food producers)',
  way: 'Way (guided walks, tours, experiences)',
}

const SYSTEM_PROMPT = `You write editorial for Australian Atlas, a curated map of independent Australia. Voice: informed, place-specific, quietly opinionated. Never tourism-brochure, never listicle.

You are given VERIFIED DATA for one region: its towns, and its actual listings grouped by category. You must not introduce anything that is not in that data.

Respond with ONLY valid JSON (no fences, no preamble):
{
  "editorial_overview": "90-130 words on the region's character as revealed by the data — what kinds of places cluster here, in which towns, and what that says about the place.",
  "best_time_to_visit": "40-70 words. General seasonal guidance from climate and the venue mix only.",
  "what_makes_distinct": "60-100 words on what genuinely sets this region apart, argued from the listing mix (relative depth of categories, town spread).",
  "vertical_highlights": [
    { "vertical": "sba", "listing_name": "EXACT name copied from the data", "note": "≤14 words, grounded strictly in that listing's provided description" }
  ]
}

HARD RULES — violating any of these makes the output unusable:
1. In editorial_overview, best_time_to_visit and what_makes_distinct: do NOT name any business, venue, festival, event, trail, or product. No exceptions.
2. The ONLY proper nouns allowed in those three fields are: the region name, its state, Australia, and town/locality names copied from the provided TOWNS list.
3. vertical_highlights: 3 or 4 entries, each listing_name copied EXACTLY (character for character) from the provided listing data, each from a different category where possible.
4. Notes must restate facts from the provided description — no new claims, no invented history, awards or specialties.
5. No superlatives without substance. Do not guess at anything.
6. Output mechanics: double quotes only as JSON delimiters. Inside string values never emit a raw double-quote — rephrase or use curly quotes. Keep each string on a single line.`

function hashContext(contextObj) {
  return crypto.createHash('md5').update(PROMPT_VERSION + JSON.stringify(contextObj)).digest('hex')
}

async function getRegionListings(region) {
  const { data } = await supabase
    .from('listings_with_region')
    .select('id, vertical, name, suburb, description')
    .eq('status', 'active')
    .eq('region_id', region.id)
    .order('editors_pick', { ascending: false })
    .order('is_featured', { ascending: false })
    .limit(200)
  return data || []
}

function buildContextObject(region, listings) {
  const byVertical = {}
  for (const l of listings) {
    if (!byVertical[l.vertical]) byVertical[l.vertical] = []
    byVertical[l.vertical].push(l)
  }
  const towns = {}
  for (const l of listings) {
    const t = (l.suburb || '').trim()
    if (t) towns[t] = (towns[t] || 0) + 1
  }
  const verticals = Object.entries(byVertical).map(([v, items]) => ({
    vertical: v,
    label: VERTICAL_LABELS[v] || v,
    count: items.length,
    listings: items.slice(0, 12).map(l => ({
      name: l.name,
      town: l.suburb || undefined,
      description: l.description
        ? l.description.split(/\s+/).slice(0, 45).join(' ')
        : undefined,
    })),
  }))
  return {
    region_name: region.name,
    state: region.state,
    total_listings: listings.length,
    towns: Object.entries(towns).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} (${n})`),
    verticals,
  }
}

// ── Validation ─────────────────────────────────────────────

const GENERIC_ALLOWED = new Set([
  'australia', 'australian', 'australians', 'the', 'a', 'an', 'it', 'its', 'this', 'that', 'these', 'those',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october',
  'november', 'december', 'summer', 'autumn', 'winter', 'spring', 'easter', 'christmas',
  'victoria', 'victorian', 'queensland', 'tasmania', 'tasmanian', 'nsw', 'wa', 'sa', 'nt', 'act',
  'new', 'south', 'wales', 'western', 'northern', 'territory', 'capital',
  'east', 'west', 'north', 'coast', 'coastal', 'inland', 'outback', 'hinterland',
  'indigenous', 'aboriginal', 'first', 'nations', 'country',
])

function whitelistTokens(region, listings) {
  const allowed = new Set(GENERIC_ALLOWED)
  const addPhrase = (p) => {
    for (const w of String(p || '').toLowerCase().split(/[^a-z']+/)) {
      if (w) allowed.add(w)
    }
  }
  addPhrase(region.name)
  for (const l of listings) addPhrase(l.suburb)
  return allowed
}

// Flag capitalized words (outside sentence starts) whose lowercase form is
// not whitelisted — the cheap, high-recall proxy for "invented proper noun".
function findProseViolations(text, allowed) {
  if (!text) return []
  const violations = new Set()
  // Split into sentences, then examine capitalized tokens after position 0.
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const words = sentence.split(/\s+/)
    words.forEach((raw, i) => {
      const w = raw.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, '')
      if (!w || !/^[A-Z]/.test(w)) return
      if (i === 0) return // sentence-start capitalization is fine
      const lower = w.toLowerCase().replace(/'s$/, '')
      if (!allowed.has(lower)) violations.add(w)
    })
  }
  return [...violations]
}

function validateNarrative(parsed, region, listings) {
  const allowed = whitelistTokens(region, listings)
  const nameSet = new Map(listings.filter(l => l.name).map(l => [l.name.trim(), l]))
  const issues = []

  // 1. prose fields: proper-noun scan + word caps
  for (const field of ['editorial_overview', 'best_time_to_visit', 'what_makes_distinct']) {
    const text = parsed[field]
    if (!text) continue
    const violations = findProseViolations(text, allowed)
    if (violations.length) issues.push({ field, violations })
    if (text.split(/\s+/).length > 170) issues.push({ field, violations: ['(too long)'] })
  }

  // 2. highlights: exact-name matching, vertical agreement
  const validHighlights = []
  for (const h of parsed.vertical_highlights || []) {
    const match = nameSet.get(String(h.listing_name || '').trim())
    if (!match) { issues.push({ field: 'vertical_highlights', violations: [h.listing_name] }); continue }
    if (match.vertical !== h.vertical) h.vertical = match.vertical
    if (h.note && h.note.split(/\s+/).length > 20) h.note = h.note.split(/\s+/).slice(0, 20).join(' ')
    validHighlights.push({ vertical: h.vertical, listing_name: match.name, note: h.note || '' })
  }
  parsed.vertical_highlights = validHighlights.slice(0, 4)

  return issues
}

// ── Generation ─────────────────────────────────────────────

async function callModel(region, contextObj, feedback) {
  const userPrompt = `Generate the JSON narrative for ${region.name} (${region.state}).

VERIFIED REGION DATA:
${JSON.stringify(contextObj, null, 2)}${feedback ? `

YOUR PREVIOUS ATTEMPT BROKE THE RULES — fix and regenerate. Problems found:
${feedback}` : ''}`

  const response = await anthropic.messages.create({
    model: MODEL,
    // The model thinks before answering and thinking tokens count against
    // max_tokens — a low cap truncates the JSON mid-string.
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  })
  if (response.stop_reason === 'max_tokens') throw new Error('response truncated at max_tokens')
  const text = (response.content.find(b => b.type === 'text')?.text || '').trim()
  const cleaned = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '')
  return { parsed: JSON.parse(sanitizeJson(cleaned)), usage: response.usage }
}

// Models sometimes emit raw line breaks inside JSON string values, which is
// invalid JSON. Walk the text tracking in-string state and flatten them.
function sanitizeJson(s) {
  let out = ''
  let inStr = false
  let esc = false
  for (const ch of s) {
    if (inStr) {
      if (esc) { out += ch; esc = false; continue }
      if (ch === '\\') { out += ch; esc = true; continue }
      if (ch === '"') { inStr = false; out += ch; continue }
      if (ch === '\n' || ch === '\r') { out += ' '; continue }
      out += ch
    } else {
      if (ch === '"') inStr = true
      out += ch
    }
  }
  return out
}

async function generateNarrative(region, contextObj, listings) {
  let { parsed, usage } = await callModel(region, contextObj, null)
  let issues = validateNarrative(parsed, region, listings)

  const proseIssues = issues.filter(i => i.field !== 'vertical_highlights')
  const needRetry = proseIssues.length > 0 || parsed.vertical_highlights.length < 2

  if (needRetry) {
    const feedback = issues
      .map(i => `- ${i.field}: disallowed or unmatched name(s): ${i.violations.join(', ')}`)
      .join('\n') + '\n- Remember: no business/venue/event names in prose fields; highlights must copy exact names from the data.'
    console.log('  retry: validation issues →\n' + feedback.split('\n').map(s => '      ' + s).join('\n'))
    ;({ parsed, usage } = await callModel(region, contextObj, feedback))
    issues = validateNarrative(parsed, region, listings)
  }

  // Post-retry: drop any prose field that still violates rather than publish it.
  for (const i of issues) {
    if (i.field !== 'vertical_highlights') {
      console.log(`  DROPPED ${i.field} (persistent violations: ${i.violations.join(', ')})`)
      parsed[i.field] = null
    }
  }
  if (!parsed.editorial_overview && !parsed.best_time_to_visit && !parsed.what_makes_distinct) {
    throw new Error('all prose fields failed validation')
  }
  return { parsed, usage }
}

// ── Main ───────────────────────────────────────────────────

async function main() {
  let query = supabase
    .from('regions')
    .select('id, name, slug, state, listing_count')
    .eq('status', 'live')
    .order('name')
  if (singleSlug) query = query.eq('slug', singleSlug)
  const { data: regions, error } = await query
  if (error) { console.error(error); process.exit(1) }

  const { data: existing } = await supabase.from('region_narratives').select('region_id, content_hash')
  const existingHash = Object.fromEntries((existing || []).map(n => [n.region_id, n.content_hash]))

  const targets = limitArg ? regions.slice(0, limitArg) : regions
  console.log(`${targets.length} live region(s)${dryRun ? ' [DRY RUN]' : ''} — model ${MODEL}`)

  let generated = 0, skipped = 0, failed = 0, noListings = 0
  let inTok = 0, outTok = 0

  for (const region of targets) {
    console.log(`\n[${region.slug}] ${region.name}`)
    try {
      const listings = await getRegionListings(region)
      if (listings.length === 0) { console.log('  skipped: no active listings'); noListings++; continue }

      const contextObj = buildContextObject(region, listings)
      const contentHash = hashContext(contextObj)
      if (!force && existingHash[region.id] === contentHash) {
        console.log('  skipped: unchanged'); skipped++; continue
      }
      if (dryRun) { console.log(`  would generate from ${listings.length} listings`); generated++; continue }

      const { parsed, usage } = await generateNarrative(region, contextObj, listings)
      inTok += usage?.input_tokens || 0
      outTok += usage?.output_tokens || 0

      const { error: upErr } = await supabase.from('region_narratives').upsert({
        region_id: region.id,
        editorial_overview: parsed.editorial_overview,
        best_time_to_visit: parsed.best_time_to_visit,
        what_makes_distinct: parsed.what_makes_distinct,
        vertical_highlights: parsed.vertical_highlights,
        listing_count_at_generation: listings.length,
        content_hash: contentHash,
        generated_at: new Date().toISOString(),
      }, { onConflict: 'region_id' })
      if (upErr) throw upErr
      console.log(`  saved (${parsed.vertical_highlights.length} highlights)`)
      generated++
      await new Promise(r => setTimeout(r, 250))
    } catch (err) {
      console.log(`  ERROR: ${err.message}`)
      failed++
    }
  }

  console.log(`\nDone: ${generated} generated, ${skipped} unchanged, ${noListings} empty, ${failed} failed`)
  console.log(`Tokens: ${inTok} in / ${outTok} out`)
  if (failed > 0) process.exitCode = 1
}

main()
