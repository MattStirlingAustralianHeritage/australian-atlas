// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 Stage 1 — discovery orchestrator.
//
// Per docs/pitch-system-phase3-design.md §Stage 1 Orchestrator. Single entry
// point per listing:
//
//   1. Read listing (website, name, vertical)
//   2. Fetch first-party pages (lib/pitch/stage1/fetch.mjs)
//   3. If zero pages fetched, log and return early
//   4. Call LLM with the Stage 1 system prompt + tool + fetched pages
//   5. Parse the forced submit_extraction tool call
//   6. Substring-validate every excerpt (lib/pitch/stage1/validate.mjs)
//   7. INSERT in FK order: pitch_sources → pitch_characters →
//      pitch_character_attributes → pitch_signals
//   8. Return a summary
//
// Source rows: one pitch_sources row PER FETCHED PAGE. This is the audit
// trail — the row holds the exact text used for substring validation, so
// future re-validation can re-confirm any claim still grounds against the
// stored source_text. Characters / attributes / signals point at the
// pitch_sources row whose source_url matches their cited URL.
//
// LLM call: claude-opus-4-7, effort: 'high', NO adaptive thinking (forced
// tool_choice + thinking → 400, same constraint Phase 2 hit). Streamed via
// .finalMessage() to handle the tool_use block cleanly under high effort.
//
// All DB access uses the injected Supabase service-role client. The
// migration runner is not involved. The orchestrator is pure-ish: it takes
// an Anthropic client and a Supabase client by injection; the CLI wires
// them up.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk'
import { fetchFirstPartyPages } from './fetch.mjs'
import {
  PHASE_3_STAGE_1_SYSTEM_PROMPT,
  PHASE_3_STAGE_1_TOOLS,
  PHASE_3_STAGE_1_TOOL_CHOICE,
  PHASE_3_STAGE_1_PROMPT_VERSION,
} from './prompt.mjs'
import { validateExtraction } from './validate.mjs'

/** Model used for Stage 1 extraction. Pinned here so reviewers see it. */
export const STAGE_1_MODEL = 'claude-opus-4-7'

/** Max output tokens. Extraction payloads are larger than Phase 2 pitches
 *  (one row per character + attribute + signal); generous ceiling for the
 *  forced tool call. */
const MAX_TOKENS = 16000

/**
 * Static defaults for the Anthropic call. Frozen so accidental mutation
 * surfaces in tests. The absence of `thinking` is load-bearing — see
 * lib/pitch/generate.mjs for the same constraint (adaptive thinking +
 * forced tool_choice 400s).
 */
const LLM_REQUEST_DEFAULTS = Object.freeze({
  model: STAGE_1_MODEL,
  max_tokens: MAX_TOKENS,
  output_config: { effort: 'high' },
})

/**
 * Columns from `listings` Stage 1 needs. Whitelisted so the orchestrator
 * doesn't pull computational fields (search_vector, embedding) or sync
 * metadata into memory.
 */
export const STAGE_1_LISTING_FIELDS = Object.freeze([
  'id', 'name', 'slug', 'vertical', 'website', 'region', 'state',
])

/**
 * @typedef {Object} Stage1Opts
 * @property {Object}    supabase                 - Service-role Supabase client.
 * @property {Anthropic} [anthropicClient]
 * @property {boolean}   [dryRun=false]           - No DB writes when true.
 * @property {(level: string, msg: string) => void} [log]
 * @property {typeof fetch} [fetch]               - Injectable fetch (tests).
 * @property {(ms: number) => Promise<void>} [delay] - Injectable delay (tests).
 *
 * @typedef {Object} Stage1Summary
 * @property {string}  kind                        - One of: 'ok',
 *                                                   'listing_not_found',
 *                                                   'no_website', 'no_pages_fetched',
 *                                                   'llm_error', 'tool_not_called'
 * @property {string}  listing_id
 * @property {string}  [listing_slug]
 * @property {number}  pages_attempted
 * @property {number}  pages_fetched
 * @property {number}  characters_extracted
 * @property {number}  characters_validated
 * @property {number}  attributes_extracted
 * @property {number}  attributes_validated
 * @property {number}  signals_extracted
 * @property {number}  signals_validated
 * @property {number}  sources_inserted
 * @property {Object}  [validation]                 - Full validator output
 *                                                    (valid + invalid arrays)
 * @property {Object}  [extraction]                 - Raw LLM extraction
 * @property {string}  [error]                      - Set on llm_error etc.
 */

/**
 * Run the full Stage 1 discovery pipeline against a single listing.
 *
 * @param {string} listingId
 * @param {Stage1Opts} opts
 * @returns {Promise<Stage1Summary>}
 */
export async function runStage1(listingId, opts) {
  if (!listingId || typeof listingId !== 'string') {
    throw new Error('runStage1: listingId is required (string)')
  }
  if (!opts?.supabase) throw new Error('runStage1: opts.supabase is required')

  const { supabase, anthropicClient } = opts
  const dryRun = opts.dryRun ?? false
  const log = opts.log || (() => {})

  // ── 1. Load the listing ──────────────────────────────────────────────────
  const listing = await fetchListing(supabase, listingId)
  if (!listing) {
    return makeSummary({
      kind: 'listing_not_found',
      listing_id: listingId,
    })
  }
  if (!listing.website || typeof listing.website !== 'string') {
    return makeSummary({
      kind: 'no_website',
      listing_id: listing.id,
      listing_slug: listing.slug,
    })
  }

  log('info', `stage1: ${listing.slug} (${listing.id}) — fetching ${listing.website}`)

  // ── 2. Fetch first-party pages ───────────────────────────────────────────
  const fetchResult = await fetchFirstPartyPages(listing.website, {
    fetch: opts.fetch,
    delay: opts.delay,
    log,
  })

  // ── 3. No pages → log + return ──────────────────────────────────────────
  if (fetchResult.pages.length === 0) {
    log(
      'warn',
      `stage1: ${listing.slug} — zero pages fetched (attempted ${fetchResult.attempted.length}, errors ${fetchResult.errors.length})`,
    )
    return makeSummary({
      kind: 'no_pages_fetched',
      listing_id: listing.id,
      listing_slug: listing.slug,
      pages_attempted: fetchResult.attempted.length,
      fetch_errors: fetchResult.errors,
    })
  }

  // ── 4–5. LLM call + parse ───────────────────────────────────────────────
  const client = anthropicClient || new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let extraction
  let llmRaw
  try {
    const result = await callExtractionLLM(client, listing, fetchResult.pages)
    extraction = result.extraction
    llmRaw = result.raw
  } catch (err) {
    log('error', `stage1: ${listing.slug} — LLM error: ${err?.message ?? String(err)}`)
    return makeSummary({
      kind: 'llm_error',
      listing_id: listing.id,
      listing_slug: listing.slug,
      pages_attempted: fetchResult.attempted.length,
      pages_fetched: fetchResult.pages.length,
      error: err?.message ?? String(err),
    })
  }

  if (!extraction) {
    return makeSummary({
      kind: 'tool_not_called',
      listing_id: listing.id,
      listing_slug: listing.slug,
      pages_attempted: fetchResult.attempted.length,
      pages_fetched: fetchResult.pages.length,
    })
  }

  // ── 6. Substring validation ─────────────────────────────────────────────
  const validation = validateExtraction(extraction, fetchResult.pages)

  // ── 7. Log invalid items (audit + console) ──────────────────────────────
  for (const v of validation.invalid) {
    log(
      'warn',
      `stage1: ${listing.slug} — invalid ${v.kind} (${v.reason}): ${describeInvalid(v)}`,
    )
  }

  // ── 8. Insert validated rows ────────────────────────────────────────────
  let sourcesInserted = 0
  if (!dryRun) {
    const writeResult = await writeExtraction({
      supabase,
      listing,
      fetchedPages: fetchResult.pages,
      valid: validation.valid,
    })
    sourcesInserted = writeResult.sources_inserted
  }

  return makeSummary({
    kind: 'ok',
    listing_id: listing.id,
    listing_slug: listing.slug,
    pages_attempted: fetchResult.attempted.length,
    pages_fetched: fetchResult.pages.length,
    characters_extracted: validation.stats.characters_extracted,
    characters_validated: validation.stats.characters_validated,
    attributes_extracted: validation.stats.attributes_extracted,
    attributes_validated: validation.stats.attributes_validated,
    signals_extracted: validation.stats.signals_extracted,
    signals_validated: validation.stats.signals_validated,
    sources_inserted: sourcesInserted,
    validation,
    extraction,
    llm: llmRaw,
    fetch_errors: fetchResult.errors,
  })
}

// ─── LLM call ──────────────────────────────────────────────────────────────

/**
 * Build the user turn for the extraction call. Renders one block per fetched
 * page; the model cites a page by repeating the URL exactly in source_url.
 * The system prompt is the architectural anti-hallucination contract; this
 * function only assembles the per-listing context.
 *
 * Exported so tests can verify the rendered shape without making an API call.
 */
export function buildUserMessage(listing, fetchedPages) {
  const head =
    `VENUE: ${listing.name}\n` +
    `VERTICAL: ${listing.vertical ?? '<null>'}\n` +
    `REGION: ${listing.region ?? '<null>'}, ${listing.state ?? '<null>'}\n` +
    `WEBSITE: ${listing.website}\n\n` +
    `Below are the pages fetched from this venue's first-party site. ` +
    `Each page is delimited by a banner with its exact URL. When you call ` +
    `submit_extraction, every source_url you cite must exactly match one of ` +
    `the URLs below, and every source_excerpt must be a verbatim substring ` +
    `of that page's text (case and whitespace differences are tolerated).\n`

  const pageBlocks = fetchedPages
    .map((p, idx) => {
      const header =
        `═══ PAGE ${idx + 1}/${fetchedPages.length} ═══\n` +
        `URL: ${p.url}\n` +
        `FETCHED_AT: ${p.fetched_at}\n` +
        `═══════════════════════`
      return `${header}\n${p.text}\n═══ END PAGE ═══`
    })
    .join('\n\n')

  return `${head}\n${pageBlocks}\n\nNow call submit_extraction. Empty arrays for characters or venue_signals are valid output — only extract what the source supports.`
}

/**
 * Issue the Stage 1 LLM call and return the parsed submit_extraction
 * payload. Streams via .finalMessage() to handle the tool_use block cleanly.
 * Returns { extraction: null, raw } if the model failed to call the tool
 * (forced tool_choice should prevent this; null is treated as 'tool_not_called'
 * upstream).
 */
async function callExtractionLLM(client, listing, fetchedPages) {
  const userMessage = buildUserMessage(listing, fetchedPages)

  const stream = client.messages.stream({
    ...LLM_REQUEST_DEFAULTS,
    system: [
      { type: 'text', text: PHASE_3_STAGE_1_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userMessage }],
    tools: PHASE_3_STAGE_1_TOOLS,
    tool_choice: PHASE_3_STAGE_1_TOOL_CHOICE,
  })

  const response = await stream.finalMessage()
  const toolUse = (response?.content || []).find(b => b.type === 'tool_use')
  if (!toolUse || toolUse.name !== 'submit_extraction') {
    return { extraction: null, raw: response }
  }
  return { extraction: toolUse.input, raw: response }
}

// ─── DB writes ─────────────────────────────────────────────────────────────

/**
 * Insert validated extraction rows in FK order. Each fetched page becomes a
 * pitch_sources row, regardless of whether anything was extracted from it
 * — the source rows are the audit trail and remain useful for re-validation
 * later. Returns the count of source rows inserted.
 *
 * Per-page source rows are pre-inserted so we can map source_url → source_id
 * before inserting characters / attributes / signals. Each character takes
 * its primary_source_id from its source_url. Each attribute on a character
 * inherits the character's source_id (the validator already confirmed the
 * attribute excerpt validates against the character's source page). Each
 * signal points at the source matching its source_url.
 */
async function writeExtraction({ supabase, listing, fetchedPages, valid }) {
  // ── pitch_sources: one row per fetched page ────────────────────────────
  const sourceRows = fetchedPages.map(p => ({
    listing_id: listing.id,
    source_type: 'venue_first_party',
    source_url: p.url,
    source_text: p.text,
    fetched_at: p.fetched_at,
  }))

  const { data: insertedSources, error: srcErr } = await supabase
    .from('pitch_sources')
    .insert(sourceRows)
    .select('id, source_url')
  if (srcErr) throw new Error(`pitch_sources.insert: ${srcErr.message}`)

  // url → source_id index for the character / signal inserts.
  const urlToSourceId = new Map()
  for (const row of insertedSources) urlToSourceId.set(row.source_url, row.id)

  // ── pitch_characters + pitch_character_attributes ──────────────────────
  for (const character of valid.characters) {
    const primarySourceId = urlToSourceId.get(character.source_url)
    if (!primarySourceId) {
      // Should be impossible — validator confirmed source_url is in the
      // fetched_pages list and every fetched page got a source row above.
      // Defensive log + skip.
      console.error(
        `writeExtraction: character "${character.name}" cites source_url not in inserted sources (${character.source_url}); skipping`,
      )
      continue
    }

    const { data: insertedCharacter, error: charErr } = await supabase
      .from('pitch_characters')
      .insert({
        listing_id: listing.id,
        name: character.name,
        role: character.role || null,
        primary_source_id: primarySourceId,
      })
      .select('id')
      .single()
    if (charErr) throw new Error(`pitch_characters.insert: ${charErr.message}`)

    if (Array.isArray(character.attributes) && character.attributes.length > 0) {
      const attributeRows = character.attributes.map(attr => ({
        character_id: insertedCharacter.id,
        attribute_type: attr.attribute_type,
        attribute_text: attr.attribute_text,
        source_id: primarySourceId,
        source_excerpt: attr.source_excerpt,
        confidence: attr.confidence,
      }))
      const { error: attrErr } = await supabase
        .from('pitch_character_attributes')
        .insert(attributeRows)
      if (attrErr) throw new Error(`pitch_character_attributes.insert: ${attrErr.message}`)
    }
  }

  // ── pitch_signals ──────────────────────────────────────────────────────
  if (valid.venue_signals.length > 0) {
    const signalRows = valid.venue_signals
      .map(signal => {
        const sourceId = urlToSourceId.get(signal.source_url)
        if (!sourceId) {
          console.error(
            `writeExtraction: signal cites source_url not in inserted sources (${signal.source_url}); skipping`,
          )
          return null
        }
        return {
          listing_id: listing.id,
          signal_type: signal.signal_type,
          source_id: sourceId,
          signal_data: signal.signal_data ?? {},
        }
      })
      .filter(Boolean)

    if (signalRows.length > 0) {
      const { error: sigErr } = await supabase.from('pitch_signals').insert(signalRows)
      if (sigErr) throw new Error(`pitch_signals.insert: ${sigErr.message}`)
    }
  }

  return { sources_inserted: insertedSources.length }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function fetchListing(supabase, listingId) {
  const cols = STAGE_1_LISTING_FIELDS.join(', ')
  const { data, error } = await supabase
    .from('listings')
    .select(cols)
    .eq('id', listingId)
    .maybeSingle()
  if (error) throw new Error(`fetchListing: ${error.message}`)
  return data
}

function describeInvalid(v) {
  if (v.kind === 'character') return `name="${v.item?.name ?? '<unknown>'}" url=${v.item?.source_url}`
  if (v.kind === 'attribute') {
    const parentName = v.parent?.name ?? '<unknown>'
    return `parent="${parentName}" type=${v.item?.attribute_type ?? '<unknown>'}`
  }
  if (v.kind === 'signal') return `type=${v.item?.signal_type} url=${v.item?.source_url}`
  return JSON.stringify(v.item)
}

/**
 * Defaults numeric counts to 0 so the summary object is always uniform —
 * callers can rely on every count field being a number whatever the outcome.
 */
function makeSummary(overrides) {
  return {
    kind: overrides.kind,
    listing_id: overrides.listing_id ?? null,
    listing_slug: overrides.listing_slug ?? null,
    pages_attempted: overrides.pages_attempted ?? 0,
    pages_fetched: overrides.pages_fetched ?? 0,
    characters_extracted: overrides.characters_extracted ?? 0,
    characters_validated: overrides.characters_validated ?? 0,
    attributes_extracted: overrides.attributes_extracted ?? 0,
    attributes_validated: overrides.attributes_validated ?? 0,
    signals_extracted: overrides.signals_extracted ?? 0,
    signals_validated: overrides.signals_validated ?? 0,
    sources_inserted: overrides.sources_inserted ?? 0,
    prompt_version: PHASE_3_STAGE_1_PROMPT_VERSION,
    ...overrides,
  }
}

// Exported for tests
export { LLM_REQUEST_DEFAULTS, callExtractionLLM, writeExtraction }
