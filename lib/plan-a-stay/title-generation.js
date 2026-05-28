import Anthropic from '@anthropic-ai/sdk'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

/* ═══════════════════════════════════════════════════════════════════════
   Title generation for Plan-a-Stay v2
   ═══════════════════════════════════════════════════════════════════════
   Two paths:
   1. LLM (Claude Haiku 4.5) — editorially voiced, specific to the trip
   2. Template — safe fallback when the LLM is unavailable or off-voice
   Both are cached by a deterministic hash of the assembled trip shape.   */

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 80
const TEMPERATURE = 0.7

const BANNED_PHRASES = [
  'unparalleled',
  'bespoke',
  'curated experiences',
  'creating memorable experiences',
  'nestled in',
  'hidden gem',
]

/* ─── System prompt ─────────────────────────────────────────────────── */
const SYSTEM_PROMPT = `You are writing a title for a trip in Australian Atlas's editorial voice.

Voice guidelines: Specific. Restrained. Confident without being clipped. No emoji. No hospitality cliché. No filler words like "unparalleled" or "bespoke" or "curated experiences" or "nestled in." Concrete nouns over adjectives.

The trip below was just assembled from listings in the Atlas database. Read the actual stops, day themes, and disclosures, then write a title that honestly describes the trip as it stands — not what the user asked for, but what was built.

Length: 8 to 16 words. Single sentence. No quotation marks, no preamble.

Examples of titles in the right register:
- Two slow days of long lunches and small studios above Adelaide.
- Three days through the Hunter for food, wine, and not very much driving.
- A steady weekend of coast walks and farm gates on the Far South Coast.
- Three quiet days of cellar doors and cottage stays around Margaret River.
- Four days of granite country and cool-climate wine around Captains Flat.

Output: just the title string. No quotation marks, no preamble, no explanation.`


/* ─── Cache key generation ──────────────────────────────────────────── */
export function computeCacheKey(assembled) {
  const normalised = {
    day_count: assembled.day_count || 0,
    region: assembled.region || null,
    day_themes: (assembled.days || []).map(d => d.theme || ''),
  }
  const raw = JSON.stringify(normalised)
  const hash = crypto.createHash('sha256').update(raw).digest('base64')
  return hash.slice(0, 32)
}


/* ─── Cache lookup / write ──────────────────────────────────────────── */
async function getCachedTitle(cacheKey) {
  const sb = getSupabaseAdmin()
  const { data } = await sb
    .from('plan_a_stay_title_cache')
    .select('title')
    .eq('cache_key', cacheKey)
    .single()
  return data?.title || null
}

async function writeCachedTitle(cacheKey, title, source) {
  const sb = getSupabaseAdmin()
  await sb
    .from('plan_a_stay_title_cache')
    .upsert({ cache_key: cacheKey, title, source }, { onConflict: 'cache_key' })
}


/* ─── Sub-type → plural noun (for template fallback) ──────────────── */
const SUBTYPE_NOUNS = {
  winery:         'cellar doors',
  brewery:        'breweries',
  distillery:     'distilleries',
  cidery:         'cideries',
  restaurant:     'long lunches',
  creamery:       'creameries',
  farm_gate:      'farm gates',
  bakery:         'bakeries',
  market:         'markets',
  boutique_hotel: 'boutique hotels',
  cottage:        'cottages',
  glamping:       'glamping',
  farm_stay:      'farm stays',
  lookout:        'lookouts',
  waterfall:      'waterfalls',
  national_park:  'walks',
  swimming_hole:  'swimming holes',
  coastal_walk:   'coast walks',
  gorge:          'gorges',
  bookshop:       'bookshops',
  homewares:      'homewares',
  records:        'record shops',
}

const VERTICAL_NOUNS = {
  craft:        'studios',
  collection:   'galleries',
  table:        'meals',
  sba:          'producers',
  rest:         'stays',
  field:        'walks',
  found:        'finds',
  corner:       'shops',
  fine_grounds: 'cafes',
  culture:      'cultural stops',
}

/* ─── Region prepositions ──────────────────────────────────────────── */
const REGION_PREPOSITIONS = {
  'Adelaide Hills': 'in the',
  'Adelaide': 'in',
  'Barossa Valley': 'through the',
  'Blue Mountains': 'in the',
  'Brisbane': 'in',
  'Cairns & Tropical North': 'in the',
  'Canberra District': 'around the',
  'Cradle Country': 'through',
  'Darwin & Top End': 'in the',
  'East Coast Tasmania': 'along the',
  'Hobart & Southern Tasmania': 'around',
  'Hobart City': 'in',
  'Launceston & Tamar Valley': 'around',
  'Margaret River': 'around',
  'McLaren Vale': 'around',
  'Melbourne': 'in',
  'Perth': 'around',
  'Scenic Rim': 'on the',
  'South Coast NSW': 'along the',
  'Southern Highlands': 'in the',
  'Sunshine Coast Hinterland': 'in the',
  'Sydney': 'around',
  'Victorian High Country': 'in the',
  'Yarra Valley': 'through the',
}


/* ─── Template fallback ─────────────────────────────────────────────── */
export function generateTitleFromTemplate(assembled) {
  const dayCount = assembled.day_count || 1
  const region = assembled.region || 'the region'
  const prep = REGION_PREPOSITIONS[region] || 'around'

  // Count sub_types and verticals across all stops to find dominant types
  const typeCounts = new Map()
  for (const day of assembled.days || []) {
    for (const stop of day.stop_types || []) {
      const noun = (stop.sub_type && SUBTYPE_NOUNS[stop.sub_type])
        || VERTICAL_NOUNS[stop.vertical]
        || null
      if (noun) {
        typeCounts.set(noun, (typeCounts.get(noun) || 0) + 1)
      }
    }
  }

  // Sort by count, take top 2
  const sorted = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])
  let summary = 'exploring'
  if (sorted.length >= 2) {
    summary = `${sorted[0][0]} and ${sorted[1][0]}`
  } else if (sorted.length === 1) {
    summary = sorted[0][0]
  }

  return `${dayCount} days of ${summary} ${prep} ${region}.`
}


/* ─── LLM title generation ──────────────────────────────────────────── */
function buildUserMessage(assembled) {
  let msg = `Region: ${assembled.region || 'Unknown'}
Day count: ${assembled.day_count}
Total stops: ${assembled.total_stops}`

  for (const day of assembled.days || []) {
    msg += `\n\nDay ${day.day_number}: ${day.theme}`
    msg += `\nStops: ${(day.stop_summary || []).join(', ')}`
  }

  if (assembled.disclosures && assembled.disclosures.length > 0) {
    msg += `\n\nNotes from the system: ${assembled.disclosures.join(', ')}`
  }

  msg += '\n\nWrite the title.'
  return msg
}


export async function generateTripTitle({ answers, assembled }) {
  // 1. Check cache using assembled shape
  const cacheKey = computeCacheKey(assembled)
  try {
    const cached = await getCachedTitle(cacheKey)
    if (cached) return cached
  } catch (err) {
    console.warn('[title-generation] Cache read failed, proceeding to LLM:', err.message)
  }

  // 2. Try LLM
  try {
    // Resolve the API key — process.env may have an empty system-level value
    // that shadows the .env.local value (common in dev with Claude Code running).
    let apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      try {
        const envPath = path.resolve(process.cwd(), '.env.local')
        const envContent = fs.readFileSync(envPath, 'utf8')
        const match = envContent.match(/^ANTHROPIC_API_KEY=(.+)$/m)
        if (match) apiKey = match[1].trim()
      } catch (_) { /* file not found or unreadable — fine, we'll fall through to template */ }
    }
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not available')

    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(assembled) }],
    })

    let title = (response.content?.[0]?.text || '').trim()
    // Strip surrounding quotes if present
    title = title.replace(/^["']|["']$/g, '').trim()

    // Validate: 8-16 words
    const wordCount = title.split(/\s+/).length
    if (wordCount < 8 || wordCount > 16) {
      console.warn(`[title-generation] LLM title out of range (${wordCount} words): "${title}"`)
      const fallback = generateTitleFromTemplate(assembled)
      writeCachedTitle(cacheKey, fallback, 'template').catch(() => {})
      return fallback
    }

    // Validate: no banned phrases
    const lower = title.toLowerCase()
    for (const phrase of BANNED_PHRASES) {
      if (lower.includes(phrase)) {
        console.warn(`[title-generation] LLM title contained banned phrase "${phrase}": "${title}"`)
        const fallback = generateTitleFromTemplate(assembled)
        writeCachedTitle(cacheKey, fallback, 'template').catch(() => {})
        return fallback
      }
    }

    // Good title — cache it
    writeCachedTitle(cacheKey, title, 'llm').catch(() => {})
    return title
  } catch (err) {
    console.error('[title-generation] LLM call failed:', err.message)
    const fallback = generateTitleFromTemplate(assembled)
    try {
      await writeCachedTitle(cacheKey, fallback, 'template')
    } catch (_) { /* swallow */ }
    return fallback
  }
}
