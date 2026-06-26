/**
 * Run the candidate generation pipeline for a trail_pitches row:
 *   1. Embed the thesis (and mood brief if present) via Voyage-3.
 *   2. Pull region/vertical-filtered listings, score by cosine similarity
 *      with vertical-weight and must-include boosts.
 *   3. Take top ~30, send to Claude with the structural-only prompt.
 *   4. Parse JSON output, attach drive-time/distance for the proposed
 *      sequence via Mapbox Directions.
 *   5. Return { candidate_results, warnings, prompt_version }.
 *
 * Stored on the pitch row by the caller.
 */

import { embedText } from './voyage-embed.js'
import { scoreCandidates, fallbackCandidates } from './scoring.js'
import { buildCandidatePrompt, CANDIDATE_PROMPT_VERSION } from './candidate-prompt.js'
import { legsForSequence } from './mapbox-distances.js'

const ANTHROPIC_MODEL = 'claude-sonnet-4-6' // matches the rewrite pipeline
const ANTHROPIC_MAX_TOKENS = 1500

async function callClaude(prompt) {
  let _resv = { ok: true }
  try {
    const { reserveAnthropicBudget } = await import('@/lib/ai/guardedAnthropic')
    const { estimateTokens } = await import('@/lib/budget/governor')
    _resv = await reserveAnthropicBudget({ model: ANTHROPIC_MODEL, inputTokens: estimateTokens(prompt), maxOutputTokens: ANTHROPIC_MAX_TOKENS })
  } catch { _resv = { ok: true } }
  if (!_resv.ok) {
    // Monthly Anthropic budget reached — skip the Claude step. The caller
    // treats a null return as "no AI enrichment" and yields the non-AI path.
    console.warn('[generate-candidates] anthropic monthly budget reached — skipping')
    return null
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = await res.json()
  try { const { reconcileAnthropicBudget } = await import('@/lib/ai/guardedAnthropic'); await reconcileAnthropicBudget(_resv, data.usage) } catch {}
  return data?.content?.[0]?.text?.trim() ?? ''
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim())
  } catch {
    return null
  }
}

export async function generateCandidates(sb, pitch) {
  const startedAt = Date.now()

  // 1. Embed (best-effort — fall back to quality-score ranking if unavailable)
  const composedText = pitch.mood_brief ? `${pitch.thesis}\n\n${pitch.mood_brief}` : pitch.thesis
  const embedding = await embedText(composedText)
  let scoringMode = 'embedding'

  // 2. Score candidates
  let top
  if (embedding) {
    top = await scoreCandidates(sb, pitch, embedding, 30)
    if (!top.length) {
      // Region/vertical filter intersected with embedding-having listings to nothing.
      // Try the fallback path which doesn't require embeddings on the listings.
      top = await fallbackCandidates(sb, pitch, 30)
      scoringMode = 'fallback (no listings with embeddings matched filters)'
    }
  } else {
    top = await fallbackCandidates(sb, pitch, 30)
    scoringMode = 'fallback (VOYAGE_API_KEY unavailable)'
  }
  if (!top.length) {
    return {
      prompt_version: CANDIDATE_PROMPT_VERSION,
      stops: [],
      warnings: ['No listings matched the region/vertical filters. Widen the constraints.'],
      candidate_pool: [],
      generated_at: new Date().toISOString(),
      generation_ms: Date.now() - startedAt,
    }
  }

  // 3. Resolve region names for the prompt
  const regionIds = [pitch.region_id, ...(pitch.secondary_region_ids || [])].filter(Boolean)
  const { data: regionRows } = regionIds.length
    ? await sb.from('regions').select('id, name').in('id', regionIds)
    : { data: [] }
  const primaryRegion = regionRows?.find(r => r.id === pitch.region_id)?.name || null
  const secondaryRegions = (regionRows || []).filter(r => r.id !== pitch.region_id).map(r => r.name)

  // 4. Call Claude
  const prompt = buildCandidatePrompt({
    thesis: pitch.thesis,
    region: primaryRegion,
    secondary_regions: secondaryRegions,
    day_count: pitch.day_count,
    vertical_weights: pitch.vertical_weights,
    must_include_listing_ids: pitch.must_include_listing_ids,
    must_start_at_listing_id: pitch.must_start_at_listing_id,
    must_end_at_listing_id: pitch.must_end_at_listing_id,
    max_km_per_day: pitch.max_km_per_day,
    season_window: pitch.season_window,
    mood_tags: pitch.mood_tags,
    mood_brief: pitch.mood_brief,
    candidate_pool: top,
  })

  const text = await callClaude(prompt)
  if (text === null) {
    // AI budget reached — return the non-AI path: scored candidate pool with
    // no Claude-sequenced stops. Caller stores this as a budget-limited result.
    return {
      prompt_version: CANDIDATE_PROMPT_VERSION,
      scoring_mode: scoringMode,
      stops: [],
      warnings: ['AI monthly budget reached — candidate pool returned without AI sequencing. Try again next month.'],
      candidate_pool: top.map(c => ({ id: c.id, name: c.name, vertical: c.vertical, score: c.score, similarity: c.similarity })),
      generated_at: new Date().toISOString(),
      generation_ms: Date.now() - startedAt,
    }
  }
  const parsed = safeJsonParse(text)
  if (!parsed?.stops) {
    throw new Error(`Claude returned non-JSON or no stops: "${text.slice(0, 200)}"`)
  }

  // 5. Compute distance/duration legs along the proposed sequence.
  // Drop stops whose listing_id isn't in the candidate pool — the model occasionally
  // emits row-indices or hallucinated UUIDs. We can't promote those, and we can't
  // silently lie about them either, so we filter and warn.
  const lookup = Object.fromEntries(top.map(c => [c.id, c]))
  const droppedHallucinatedIds = []
  const validStops = []
  for (const s of parsed.stops) {
    if (lookup[s.listing_id]) validStops.push(s)
    else droppedHallucinatedIds.push(s.listing_id)
  }
  const stopsByPos = [...validStops].sort((a, b) => (a.suggested_position || 0) - (b.suggested_position || 0))
  const sequence = stopsByPos.map(s => lookup[s.listing_id])
  const legs = await legsForSequence(sequence)

  const enrichedStops = stopsByPos.map((s, i) => {
    const c = lookup[s.listing_id]
    return {
      listing_id: s.listing_id,
      suggested_position: s.suggested_position,
      suggested_day: s.suggested_day,
      rationale: s.rationale,
      is_overnight: !!s.is_overnight,
      // Snapshot of the listing for the candidate review UI (so the editor
      // doesn't need a second round-trip).
      listing: { id: c.id, name: c.name, slug: c.slug, vertical: c.vertical,
        sub_type: c.sub_type, region: c.region, suburb: c.suburb, state: c.state,
        lat: c.lat, lng: c.lng, similarity: c.similarity },
      distance_from_previous_km: legs[i]?.distance_km ?? null,
      duration_from_previous_minutes: legs[i]?.duration_minutes ?? null,
    }
  })

  // Day-budget warnings: walk the sequence summing per-day km
  const perDayKm = {}
  for (const s of enrichedStops) {
    const d = s.suggested_day || 1
    perDayKm[d] = (perDayKm[d] || 0) + (s.distance_from_previous_km || 0)
  }
  const budgetWarnings = []
  const cap = pitch.max_km_per_day ?? 200
  for (const [day, km] of Object.entries(perDayKm)) {
    if (km > cap) budgetWarnings.push(`Day ${day} totals ${Math.round(km)} km, over the ${cap} km/day cap.`)
  }
  if (droppedHallucinatedIds.length) {
    budgetWarnings.push(`Dropped ${droppedHallucinatedIds.length} stop(s) with invalid listing_id (model returned row-index or unknown UUID): ${droppedHallucinatedIds.join(', ')}`)
  }

  return {
    prompt_version: CANDIDATE_PROMPT_VERSION,
    scoring_mode: scoringMode,
    stops: enrichedStops,
    warnings: [...(parsed.warnings || []), ...budgetWarnings],
    candidate_pool: top.map(c => ({ id: c.id, name: c.name, vertical: c.vertical, score: c.score, similarity: c.similarity })),
    generated_at: new Date().toISOString(),
    generation_ms: Date.now() - startedAt,
  }
}
