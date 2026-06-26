/**
 * Stage 1 — First-party sources.
 *
 * Fetches the operator's own website (homepage + heuristic chain)
 * and extracts structured signals via Claude. Cultural authority
 * claim extraction is folded in here per the spec re-read (master
 * prompt was wrong about this; spec is authoritative).
 *
 * Heuristic URL chain per master prompt: /, /itinerary, /itineraries,
 * /walks, /tours, /expeditions, /about, /our-guides, /team. Pages
 * that 404 are skipped quietly. Pages that resolve are fetched once
 * each (politely, per polite-fetch); their HTML-stripped text is
 * concatenated and passed to a single Claude extraction call.
 *
 * The Claude prompt is grounded — it is told that it MUST quote
 * verbatim text fragments as source_excerpt for each extracted
 * signal, and that signals without verifiable text fragments are
 * to be omitted. This mirrors the Pitch System Design's grounding
 * rule: extension is forbidden, paraphrase is acceptable, invention
 * is rejected at the validation step.
 *
 * Cultural authority extraction (folded in here):
 *   • Named Traditional Owner consultation
 *   • Named community organisation as operator or partner
 *   • Specific Country/clan named with authorisation context
 *   • Aboriginal-led classification claim (owned, partnership,
 *     or community)
 *
 * These signals feed Phase 2C's Gate 4 evaluation. If primary_type
 * is cultural_tour and Stage 1 finds NO cultural authority signals,
 * Gate 4 will fail and the candidate routes to the
 * cultural_authority_review queue (already wired by migration 116).
 *
 * Output: signals stored in way_candidate_signals; concatenated
 * text deposited on ctx.firstPartyText for Stage 5 to scan.
 *
 * Confidence:
 *   HIGH for guide_named, guide_qualification, established_year,
 *        accreditation_claim, cultural_authority_claim — these are
 *        operator's stated facts where extension would be obvious.
 *   MEDIUM for primary_type, duration, price, season, group_size —
 *        looser fields where the source page may use vague phrasing.
 *   MEDIUM for method_described, country_named — interpretive
 *        extraction.
 */

import { politeFetch } from '../polite-fetch.js'
import { SIGNAL_TYPES, CONFIDENCE, buildSignal } from './signals.js'
import { htmlToText } from './operator-mention.js'

const URL_PATHS_TO_TRY = [
  '/',
  '/itinerary',
  '/itineraries',
  '/walks',
  '/walks/',
  '/tours',
  '/expeditions',
  '/about',
  '/about-us',
  '/our-guides',
  '/team',
  '/guides',
  '/the-walk',
]

const FETCH_TIMEOUT_MS = 10000
const MAX_TEXT_PER_PAGE = 8000
const MAX_TOTAL_TEXT_FOR_LLM = 20000

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const EXTRACTION_MODEL = 'claude-sonnet-4-5-20250929'

const HIGH_CONFIDENCE_TYPES = new Set([
  SIGNAL_TYPES.STAGE_1.GUIDE_NAMED,
  SIGNAL_TYPES.STAGE_1.GUIDE_QUALIFICATION,
  SIGNAL_TYPES.STAGE_1.ESTABLISHED_YEAR,
  SIGNAL_TYPES.STAGE_1.ACCREDITATION_CLAIM,
  SIGNAL_TYPES.STAGE_1.CULTURAL_AUTHORITY_CLAIM,
  SIGNAL_TYPES.STAGE_1.ABORIGINAL_PARTNERSHIP,
])

/**
 * @param {object} ctx — pipeline context (candidate, runId, log)
 * @param {object} _supabase — unused at Stage 1; kept for orchestrator parity
 * @returns {Promise<object[]>}
 */
export async function runStage1FirstParty(ctx, _supabase) {
  const { candidate, runId, log } = ctx
  if (!candidate.website_url) {
    log(1, 'no website_url on candidate; skipping')
    return []
  }

  // ─── 1.1 Fetch the URL chain ────────────────────────────────
  const fetched = await fetchHeuristicChain(candidate.website_url, log)
  if (fetched.totalChars === 0) {
    log(1, 'no first-party text retrieved; stage 1 produces no signals')
    ctx.firstPartyText = ''
    ctx.firstPartyPagesByPath = {}
    return []
  }
  log(1, `fetched ${fetched.pagesFetched} pages, ${fetched.totalChars} chars total`)

  ctx.firstPartyText = fetched.combinedText
  ctx.firstPartyPagesByPath = fetched.byPath

  // ─── 1.2 LLM extraction ─────────────────────────────────────
  const extractionInput = fetched.combinedText.slice(0, MAX_TOTAL_TEXT_FOR_LLM)
  let extracted
  try {
    extracted = await extractStructuredSignals({
      operatorName: candidate.name,
      operatorWebsite: candidate.website_url,
      websiteText: extractionInput,
      log,
    })
  } catch (e) {
    log(1, `extraction error: ${e?.message || e}; stage 1 produces no signals`)
    return []
  }

  // ─── 1.2b Deposit experiences on context ────────────────────
  // The LLM identifies distinct experiences offered by the operator.
  // These are deposited on ctx for the pipeline orchestrator to
  // persist as way_candidate_experiences records. Gate 4 evaluates
  // per-experience.
  const experiences = Array.isArray(extracted.experiences) ? extracted.experiences : []
  ctx.experiences = experiences
  if (experiences.length > 0) {
    log(1, `identified ${experiences.length} distinct experiences: ${experiences.map(e => e.name).join(', ')}`)
  }

  // ─── 1.3 Validate extracted signals against source text ─────
  const lowerSource = extractionInput.toLowerCase()
  const validated = []
  let dropped = 0
  for (const claim of (extracted.claims || [])) {
    if (!claim.source_excerpt || typeof claim.source_excerpt !== 'string') {
      dropped++; continue
    }
    if (claim.source_excerpt.length < 6) { dropped++; continue }
    const excerpt = claim.source_excerpt.trim().toLowerCase()
    if (lowerSource.includes(excerpt) || lowerSource.includes(normaliseWhitespace(excerpt))) {
      validated.push(claim)
    } else {
      dropped++
    }
  }
  if (dropped > 0) log(1, `dropped ${dropped} claims that didn't trace to source text`)

  // ─── 1.4 Build signal records ───────────────────────────────
  const signals = []
  for (const claim of validated) {
    if (!claim.signal_type || !SIGNAL_TYPES.STAGE_1[Object.keys(SIGNAL_TYPES.STAGE_1).find(k =>
      SIGNAL_TYPES.STAGE_1[k] === claim.signal_type
    )]) {
      continue
    }
    const sourceUrl = claim.source_path
      ? new URL(claim.source_path, candidate.website_url).toString()
      : candidate.website_url
    const confidence = HIGH_CONFIDENCE_TYPES.has(claim.signal_type) ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM

    signals.push(buildSignal({
      candidateId:  candidate.id,
      stage:        1,
      signalType:   claim.signal_type,
      claimText:    claim.claim_text || claim.value || '(no claim)',
      sourceUrl,
      sourceExcerpt: claim.source_excerpt,
      sourceLabel:  `${candidate.name} — ${claim.source_path || '/'}`,
      confidence,
      urlResolved:  true,
      urlValidationStatus: 'fetched_in_stage_1',
      rawData: {
        url_path:        claim.source_path || '/',
        extracted_field: claim.field || null,
        value:           claim.value || null,
        experience_ref:  claim.experience_ref || null,
      },
      runId,
    }))
  }

  return signals
}

// ─── URL chain fetcher ─────────────────────────────────────────

async function fetchHeuristicChain(websiteUrl, log) {
  const base = normaliseBaseUrl(websiteUrl)
  if (!base) return { combinedText: '', byPath: {}, pagesFetched: 0, totalChars: 0 }

  const byPath = {}
  let combinedText = ''
  let pagesFetched = 0

  for (const path of URL_PATHS_TO_TRY) {
    if (combinedText.length >= MAX_TOTAL_TEXT_FOR_LLM) break
    const url = new URL(path, base).toString()
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
      let res
      try {
        res = await politeFetch(url, {
          method: 'GET',
          signal: ctrl.signal,
          redirect: 'follow',
          headers: { 'User-Agent': 'AustralianAtlas-Discovery/1.0 (+https://australianatlas.com.au)' },
        })
      } finally { clearTimeout(t) }
      if (!res.ok) continue
      const html = await res.text()
      const text = htmlToText(html).slice(0, MAX_TEXT_PER_PAGE)
      if (text.length < 200) continue   // probably a near-empty page
      byPath[path] = text
      combinedText += `\n\n── PATH ${path} ──\n${text}`
      pagesFetched++
    } catch {
      // Skip; absent pages are the norm.
    }
  }

  return { combinedText: combinedText.trim(), byPath, pagesFetched, totalChars: combinedText.length }
}

function normaliseBaseUrl(s) {
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`)
    return `${u.protocol}//${u.hostname}/`
  } catch { return null }
}

function normaliseWhitespace(s) {
  return s.replace(/\s+/g, ' ').trim()
}

// ─── LLM extraction ────────────────────────────────────────────

const EXPERIENCE_TYPES = [
  'guided_walk_multiday','guided_walk_day','cultural_tour',
  'scenic_flight','helicopter_tour',
  'sailing_charter','sea_kayak_tour','dive_operator',
  'fishing_guide','photography_expedition',
  'specialist_natural_history','foraging_bushfood',
  'heritage_tour','workshop_intensive',
  'river_canoe_tour','horseback_expedition',
  'four_wheel_drive_expedition',
]

const DURATION_BANDS = [
  'half_day','full_day','overnight',
  'multiday_2_3','multiday_4_7','expedition_8_plus',
]

async function extractStructuredSignals({ operatorName, operatorWebsite, websiteText, log }) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing')

  const allowedSignalTypes = Object.values(SIGNAL_TYPES.STAGE_1)

  const systemPrompt = `You extract structured editorial signals from an Australian experience operator's own website. Your output is consumed by a curatorial pipeline that has explicit anti-fabrication rules.

RULES (non-negotiable):

1. Every claim you emit MUST quote a verbatim text fragment from the input as source_excerpt. The fragment must be the operator's own words from the website, copied exactly.

2. If a fact is implied but not stated in the text, do NOT emit a claim for it. Speculation, paraphrase-as-fact, and "stands to reason" inference are forbidden.

3. If a field is empty in the source, omit the corresponding claim. Do not fill gaps.

4. signal_type values are restricted to this catalogue. Use the exact strings:
   ${allowedSignalTypes.map(t => `- ${t}`).join('\n   ')}

5. For ${SIGNAL_TYPES.STAGE_1.CULTURAL_AUTHORITY_CLAIM}: ONLY emit if the website explicitly states a Traditional Owner consultation, names a community organisation as operator or partner, or names a specific Country/clan with authorisation context. Generic references to "respecting Country" are NOT cultural authority claims; emit nothing in that case.

6. For ${SIGNAL_TYPES.STAGE_1.GUIDE_NAMED}: ONLY emit if a guide or founder is named with a real name. "Our experienced guides" is NOT a guide_named signal.

EXPERIENCE IDENTIFICATION:

7. Identify the distinct named experiences (trips, tours, walks) this operator offers. Each experience should have a unique ref (exp_1, exp_2, etc.), a name, and an experience_type from this list:
   ${EXPERIENCE_TYPES.join(', ')}

   Classify cultural_tour ONLY when the experience involves Aboriginal or Torres Strait Islander cultural content (partnership with community, cultural interpretation by Traditional Owners). Heritage tours about settler/colonial history or geology use heritage_tour, NOT cultural_tour.

   Also assign a duration_band if stated: ${DURATION_BANDS.join(', ')}

8. Tag each claim with the experience_ref it belongs to. Operator-level claims (operator_name, established_year, method_described about the operator generally, guides who work across multiple experiences) should have experience_ref: null.

   Experience-specific claims (duration of a specific walk, cultural authority for a specific tour, departure point for a specific trip) should carry the matching experience_ref.

OUTPUT: Strict JSON only, no markdown fences. Schema:
{
  "experiences": [
    {
      "ref": "exp_1",
      "name": "<experience name, e.g. 'Cradle Mountain Huts Walk'>",
      "experience_type": "<from list above>",
      "duration_band": "<from list above, or null>"
    }
  ],
  "claims": [
    {
      "signal_type": "<from catalogue above>",
      "field": "<short tag>",
      "value": "<concise value>",
      "claim_text": "<one-sentence editorial-grade claim>",
      "source_excerpt": "<verbatim text fragment from input>",
      "source_path": "<URL path or null>",
      "experience_ref": "<ref from experiences array, or null for operator-level>"
    }
  ]
}`

  const userPrompt = `OPERATOR: ${operatorName}
WEBSITE: ${operatorWebsite}

WEBSITE TEXT (concatenated paths):
${websiteText}

Extract structured editorial signals and identify distinct experiences.`

  let _resv = { ok: true }
  try {
    const { reserveAnthropicBudget } = await import('@/lib/ai/guardedAnthropic')
    const { estimateTokens } = await import('@/lib/budget/governor')
    _resv = await reserveAnthropicBudget({ model: EXTRACTION_MODEL, inputTokens: estimateTokens(systemPrompt + '\n' + userPrompt), maxOutputTokens: 8192 })
  } catch { _resv = { ok: true } }
  if (!_resv.ok) {
    // Monthly Anthropic budget reached — skip the extraction step and produce
    // no signals; the orchestrator continues with whatever else it has.
    log(1, 'anthropic monthly budget reached — skipping extraction')
    return { claims: [], experiences: [] }
  }

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: EXTRACTION_MODEL,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`extraction API ${res.status}: ${text.slice(0, 200)}`)
  }
  const json = await res.json()
  try { const { reconcileAnthropicBudget } = await import('@/lib/ai/guardedAnthropic'); await reconcileAnthropicBudget(_resv, json.usage) } catch {}
  const content = (json.content || []).map(b => b.text || '').join('\n').trim()
  const cleaned = content.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim()
  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch (e) {
    log(1, `failed to parse extraction JSON: ${e?.message || e}`)
    log(1, `raw output (first 200 chars): ${content.slice(0, 200)}`)
    return { claims: [], experiences: [] }
  }

  // Validate experience_type values.
  const validTypes = new Set(EXPERIENCE_TYPES)
  const validBands = new Set(DURATION_BANDS)
  const experiences = (Array.isArray(parsed.experiences) ? parsed.experiences : [])
    .filter(e => e.ref && e.name && validTypes.has(e.experience_type))
    .map(e => ({
      ref: e.ref,
      name: e.name,
      experience_type: e.experience_type,
      duration_band: validBands.has(e.duration_band) ? e.duration_band : null,
    }))

  return {
    claims: Array.isArray(parsed.claims) ? parsed.claims : [],
    experiences,
  }
}
