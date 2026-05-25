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
   Both are cached by a deterministic hash of conversation inputs.        */

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
const SYSTEM_PROMPT = `You are writing for Australian Atlas, a curated venue platform for regional Australia.

Voice guidelines (follow exactly):
Specific. Restrained. Confident without being clipped. No emoji. No hospitality cliché. No filler words like "unparalleled" or "bespoke" or "curated experiences" or "nestled in." Concrete nouns over adjectives.

Your task: write a single trip title between 8 and 16 words.

Pattern to follow: [Pacing-phrase] of [intent-themes] [preposition] [region/anchor].

Examples of correct register:
- Two slow days of long lunches and small studios above Adelaide.
- Three days of granite country and cool-climate wine around Captains Flat.
- A steady weekend of coast walks and farm gates on the Far South Coast.
- Four days through the Hunter for food, wine, and not very much driving.
- Three quiet days of cellar doors and cottage stays around Margaret River.

Output: just the title string. No quotation marks, no preamble, no explanation.`


/* ─── Cache key generation ──────────────────────────────────────────── */
export function computeCacheKey(answers) {
  const normalised = {
    intent: [...(answers.intent || [])].sort(),
    pacing: answers.pacing || null,
    duration: answers.duration || null,
    region: answers.region || null,
    season: answers.season || null,
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


/* ─── Template fallback ─────────────────────────────────────────────── */
const PACING_WORDS = {
  'out-early-back-late': 'Big',
  'steady': 'A steady',
  'as-little-driving': 'Slow',
  'surprise-us': 'A few',
}

const INTENT_PHRASES = {
  'food-and-producers': 'food and producers',
  'landscape-and-walking': 'landscape and walking',
  'makers-and-craft': 'makers and studios',
  'quiet-and-slow': 'slow afternoons',
  'a-bit-of-everything': 'a bit of everything',
}

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

function combineIntentPhrases(intents) {
  if (intents.length === 0) return 'exploring'
  if (intents.length === 1) return INTENT_PHRASES[intents[0]] || 'exploring'
  // Combine two intents
  const first = INTENT_PHRASES[intents[0]] || 'exploring'
  const second = INTENT_PHRASES[intents[1]] || 'more'
  // Merge: "food and producers" + "slow afternoons" → "food and slow afternoons"
  if (first.includes('food') && second.includes('slow')) return 'food and slow afternoons'
  if (first.includes('slow') && second.includes('food')) return 'slow food and producers'
  if (first.includes('landscape') && second.includes('slow')) return 'walking and slow afternoons'
  if (first.includes('makers') && second.includes('food')) return 'studios and long lunches'
  return `${first} and ${second}`
}

export function generateTitleFromTemplate(answers) {
  const pacingWord = PACING_WORDS[answers.pacing] || 'A few'
  const dayCount = answers.duration || 3
  const intentPhrase = combineIntentPhrases(answers.intent || [])
  const prep = REGION_PREPOSITIONS[answers.region] || 'around'
  const region = answers.region || 'the region'

  return `${pacingWord} ${dayCount} days of ${intentPhrase} ${prep} ${region}.`
}


/* ─── LLM title generation ──────────────────────────────────────────── */
function buildUserMessage(answers, retrieval) {
  const clusters = retrieval?.clusters || []
  const verticalCounts = {}
  for (const cluster of clusters) {
    for (const c of cluster.candidates || []) {
      verticalCounts[c.vertical] = (verticalCounts[c.vertical] || 0) + 1
    }
  }
  const dominantVerticals = Object.entries(verticalCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([v]) => v)
    .slice(0, 4)

  const coverage = retrieval?.coverage || {}
  const coverageNote = coverage.binding_constraint === 'none'
    ? 'full coverage, no gaps'
    : `constraint: ${coverage.binding_constraint}`

  const intentLabels = (answers.intent || []).map(id => {
    const labels = {
      'food-and-producers': 'food and producers',
      'landscape-and-walking': 'landscape and walking',
      'makers-and-craft': 'makers and craft',
      'quiet-and-slow': 'quiet and slow',
      'a-bit-of-everything': 'a bit of everything',
    }
    return labels[id] || id
  })

  return `Region: ${answers.region || 'Unknown'}
Duration: ${answers.duration || 3} days
Pacing: ${answers.pacing || 'steady'}
Intent themes: ${intentLabels.join(', ')}
Dominant verticals in retrieval: ${dominantVerticals.join(', ') || 'mixed'}
Coverage note: ${coverageNote}

Write the title.`
}


export async function generateTripTitle(answers, retrieval) {
  // 1. Check cache
  const cacheKey = computeCacheKey(answers)
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
      messages: [{ role: 'user', content: buildUserMessage(answers, retrieval) }],
    })

    let title = (response.content?.[0]?.text || '').trim()
    // Strip surrounding quotes if present
    title = title.replace(/^["']|["']$/g, '').trim()

    // Validate: 8–16 words
    const wordCount = title.split(/\s+/).length
    if (wordCount < 8 || wordCount > 16) {
      console.warn(`[title-generation] LLM title out of range (${wordCount} words): "${title}"`)
      const fallback = generateTitleFromTemplate(answers)
      writeCachedTitle(cacheKey, fallback, 'template').catch(() => {})
      return fallback
    }

    // Validate: no banned phrases
    const lower = title.toLowerCase()
    for (const phrase of BANNED_PHRASES) {
      if (lower.includes(phrase)) {
        console.warn(`[title-generation] LLM title contained banned phrase "${phrase}": "${title}"`)
        const fallback = generateTitleFromTemplate(answers)
        writeCachedTitle(cacheKey, fallback, 'template').catch(() => {})
        return fallback
      }
    }

    // Good title — cache it
    writeCachedTitle(cacheKey, title, 'llm').catch(() => {})
    return title
  } catch (err) {
    console.error('[title-generation] LLM call failed:', err.message)
    const fallback = generateTitleFromTemplate(answers)
    try {
      await writeCachedTitle(cacheKey, fallback, 'template')
    } catch (_) { /* swallow */ }
    return fallback
  }
}
