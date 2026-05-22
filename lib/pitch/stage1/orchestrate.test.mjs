// Unit tests for the Phase 3 Stage 1 orchestrator.
//
// The orchestrator is glue: it sequences fetch → LLM call → validate → write.
// Each branch (listing_not_found, no_website, no_pages_fetched, llm_error,
// tool_not_called, ok with dry-run, ok with writes) gets one test using a
// fake Supabase client and a fake fetch.
//
// We do NOT make real Anthropic API calls. The Anthropic client is
// substituted with a stub that returns a canned Message-shaped object.
//
// Run with:  node --test lib/pitch/stage1/orchestrate.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  runStage1,
  buildUserMessage,
  STAGE_1_LISTING_FIELDS,
  STAGE_1_MODEL,
  LLM_REQUEST_DEFAULTS,
  parseSignalData,
} from './orchestrate.mjs'

// ── Test helpers ───────────────────────────────────────────────────────────

/**
 * Build a fake Supabase client. `fixtures.listing` is returned by the listings
 * select; insertedRows captures all inserts keyed by table. Insert calls
 * return synthesised UUID-like ids so the FK chain (sources → characters →
 * attributes / signals) is exercised.
 */
function makeFakeSupabase(fixtures = {}) {
  const insertedRows = { pitch_sources: [], pitch_characters: [], pitch_character_attributes: [], pitch_signals: [] }
  let idCounter = 0
  const nextId = () => `00000000-0000-0000-0000-${String(++idCounter).padStart(12, '0')}`

  function from(table) {
    if (table === 'listings') {
      return {
        select() { return this },
        eq(_col, _val) { return this },
        maybeSingle() {
          return Promise.resolve({ data: fixtures.listing ?? null, error: null })
        },
      }
    }
    // pitch_sources / pitch_characters / pitch_character_attributes / pitch_signals
    return {
      insert(rows) {
        const array = Array.isArray(rows) ? rows : [rows]
        const inserted = array.map(r => ({ ...r, id: nextId() }))
        insertedRows[table].push(...inserted)
        const builder = {
          // Different insert paths use .select(...) or .single() at the end.
          select(_cols) {
            return {
              then(resolve) { resolve({ data: inserted, error: null }) },
              single() {
                return Promise.resolve({ data: inserted[0], error: null })
              },
            }
          },
          // pitch_character_attributes uses .insert(rows) with no chained
          // .select() — return a thenable so `await` works.
          then(resolve) { resolve({ data: inserted, error: null }) },
        }
        return builder
      },
    }
  }
  return { from, _inserted: insertedRows }
}

/**
 * Fake Anthropic client. Returns a stream whose .finalMessage() resolves to a
 * canned Message with the given tool_use input.
 */
function makeFakeAnthropic({ toolName = 'submit_extraction', toolInput = { characters: [], venue_signals: [] }, throwError = null } = {}) {
  return {
    messages: {
      stream(_params) {
        return {
          finalMessage() {
            if (throwError) return Promise.reject(throwError)
            return Promise.resolve({
              id: 'msg_test_01',
              model: STAGE_1_MODEL,
              stop_reason: 'tool_use',
              content: [
                {
                  type: 'tool_use',
                  name: toolName,
                  input: toolInput,
                },
              ],
            })
          },
        }
      },
    },
  }
}

/**
 * Fake fetch returning canned HTML for given URL → body map. Unknown URLs 404.
 */
function makeFakeFetch(pageMap) {
  return async function fakeFetch(url, _opts) {
    const html = pageMap[url]
    if (html === undefined) {
      return { ok: false, status: 404, async text() { return '' } }
    }
    return { ok: true, status: 200, async text() { return html } }
  }
}

const NO_DELAY = () => Promise.resolve()

// ── parseSignalData ────────────────────────────────────────────────────────

test('parseSignalData handles valid JSON strings', () => {
  assert.deepEqual(parseSignalData('{"name":"Halliday","year":"2024"}'), { name: 'Halliday', year: '2024' })
  assert.deepEqual(parseSignalData('{}'), {})
})

test('parseSignalData defends against malformed / null / empty input', () => {
  // Defensive fallback to {} rather than throw — the source_excerpt is
  // the load-bearing grounding evidence; signal_data is editorial sugar.
  assert.deepEqual(parseSignalData(null), {})
  assert.deepEqual(parseSignalData(undefined), {})
  assert.deepEqual(parseSignalData(''), {})
  assert.deepEqual(parseSignalData('   '), {})
  assert.deepEqual(parseSignalData('not json at all'), {})
  assert.deepEqual(parseSignalData('[1,2,3]'), {}) // arrays not allowed
  assert.deepEqual(parseSignalData('"just a string"'), {})
  assert.deepEqual(parseSignalData('42'), {})
})

test('parseSignalData accepts already-parsed objects (forgiving for callers)', () => {
  assert.deepEqual(parseSignalData({ name: 'Halliday' }), { name: 'Halliday' })
})

// ── Exports + constants ───────────────────────────────────────────────────

test('STAGE_1_LISTING_FIELDS includes the columns the orchestrator needs', () => {
  for (const col of ['id', 'name', 'slug', 'vertical', 'website']) {
    assert.ok(STAGE_1_LISTING_FIELDS.includes(col), `STAGE_1_LISTING_FIELDS must include "${col}"`)
  }
})

test('LLM_REQUEST_DEFAULTS pins model + effort + no thinking', () => {
  // Adaptive thinking + forced tool_choice 400s. The absence of `thinking`
  // is load-bearing — see lib/pitch/generate.mjs's comment. Lock it in.
  assert.equal(LLM_REQUEST_DEFAULTS.model, 'claude-opus-4-7')
  assert.equal(LLM_REQUEST_DEFAULTS.output_config.effort, 'high')
  assert.equal('thinking' in LLM_REQUEST_DEFAULTS, false)
  assert.ok(Object.isFrozen(LLM_REQUEST_DEFAULTS))
})

// ── buildUserMessage shape ────────────────────────────────────────────────

test('buildUserMessage includes venue meta + URL of each fetched page', () => {
  const listing = {
    name: 'Bream Creek Vineyard',
    vertical: 'sba',
    region: 'East Coast',
    state: 'TAS',
    website: 'https://breamcreekvineyard.com.au',
  }
  const pages = [
    { url: 'https://breamcreekvineyard.com.au/', text: 'homepage text', fetched_at: '2026-05-22T00:00:00Z' },
    { url: 'https://breamcreekvineyard.com.au/about', text: 'about text', fetched_at: '2026-05-22T00:00:01Z' },
  ]
  const msg = buildUserMessage(listing, pages)
  assert.ok(msg.includes('Bream Creek Vineyard'))
  assert.ok(msg.includes('https://breamcreekvineyard.com.au'))
  assert.ok(msg.includes('https://breamcreekvineyard.com.au/about'))
  assert.ok(msg.includes('homepage text'))
  assert.ok(msg.includes('about text'))
  // Page banners delimit each page so the model can cite the right URL
  assert.ok(msg.includes('PAGE 1/2'))
  assert.ok(msg.includes('PAGE 2/2'))
})

// ── Branch: listing_not_found ─────────────────────────────────────────────

test('listing_not_found short-circuits before any fetch or LLM call', async () => {
  const supabase = makeFakeSupabase({ listing: null })
  const summary = await runStage1('11111111-1111-1111-1111-111111111111', { supabase })
  assert.equal(summary.kind, 'listing_not_found')
  assert.equal(summary.pages_fetched, 0)
  assert.equal(supabase._inserted.pitch_sources.length, 0)
})

// ── Branch: no_website ─────────────────────────────────────────────────────

test('no_website short-circuits when listing.website is null', async () => {
  const supabase = makeFakeSupabase({
    listing: { id: 'aaa', slug: 'no-web', vertical: 'sba', website: null },
  })
  const summary = await runStage1('aaa', { supabase })
  assert.equal(summary.kind, 'no_website')
  assert.equal(summary.listing_slug, 'no-web')
  assert.equal(summary.pages_fetched, 0)
})

// ── Branch: no_pages_fetched ───────────────────────────────────────────────

test('no_pages_fetched when every URL returns 404', async () => {
  const supabase = makeFakeSupabase({
    listing: { id: 'aaa', slug: 'empty', vertical: 'sba', website: 'https://example.test' },
  })
  // Every URL 404s → zero pages
  const fakeFetch = makeFakeFetch({})
  const summary = await runStage1('aaa', {
    supabase, fetch: fakeFetch, delay: NO_DELAY,
  })
  assert.equal(summary.kind, 'no_pages_fetched')
  assert.equal(summary.pages_fetched, 0)
  assert.ok(summary.pages_attempted > 0)
})

// ── Branch: llm_error ──────────────────────────────────────────────────────

test('llm_error surfaces the Anthropic error message', async () => {
  const supabase = makeFakeSupabase({
    listing: { id: 'aaa', slug: 'broken', vertical: 'sba', website: 'https://example.test' },
  })
  const fakeFetch = makeFakeFetch({
    'https://example.test/': '<html><body>hi</body></html>',
  })
  const fakeAnthropic = makeFakeAnthropic({ throwError: new Error('429: rate limit') })
  const summary = await runStage1('aaa', {
    supabase, fetch: fakeFetch, delay: NO_DELAY, anthropicClient: fakeAnthropic,
  })
  assert.equal(summary.kind, 'llm_error')
  assert.match(summary.error, /rate limit/)
})

// ── Branch: tool_not_called ────────────────────────────────────────────────

test('tool_not_called when the model returns text-only content', async () => {
  const supabase = makeFakeSupabase({
    listing: { id: 'aaa', slug: 'odd', vertical: 'sba', website: 'https://example.test' },
  })
  const fakeFetch = makeFakeFetch({
    'https://example.test/': '<html><body>hi</body></html>',
  })
  // Simulate a model that defied forced tool_choice (would normally be a
  // 400 upstream, but the orchestrator should classify it cleanly).
  const fakeAnthropic = {
    messages: {
      stream() {
        return {
          finalMessage() {
            return Promise.resolve({
              id: 'msg_no_tool',
              model: STAGE_1_MODEL,
              stop_reason: 'end_turn',
              content: [{ type: 'text', text: 'I refuse to use the tool.' }],
            })
          },
        }
      },
    },
  }
  const summary = await runStage1('aaa', {
    supabase, fetch: fakeFetch, delay: NO_DELAY, anthropicClient: fakeAnthropic,
  })
  assert.equal(summary.kind, 'tool_not_called')
})

// ── Branch: ok (dry-run, no DB writes) ────────────────────────────────────

test('dry-run ok: validates extraction without DB writes', async () => {
  const supabase = makeFakeSupabase({
    listing: { id: 'aaa', slug: 'good', vertical: 'sba', website: 'https://example.test' },
  })
  const fakeFetch = makeFakeFetch({
    'https://example.test/': '<html><body><h1>About Tom McHugh</h1><p>Tom McHugh founded the dairy in 2010.</p></body></html>',
  })
  const fakeAnthropic = makeFakeAnthropic({
    toolInput: {
      characters: [
        {
          name: 'Tom McHugh',
          role: 'founder',
          source_url: 'https://example.test/',
          source_excerpt: 'Tom McHugh founded the dairy in 2010.',
          attributes: [
            {
              attribute_type: 'background',
              attribute_text: 'Founded the dairy in 2010.',
              source_excerpt: 'founded the dairy in 2010',
              confidence: 'explicit',
            },
          ],
        },
      ],
      venue_signals: [],
    },
  })
  const summary = await runStage1('aaa', {
    supabase, fetch: fakeFetch, delay: NO_DELAY, anthropicClient: fakeAnthropic, dryRun: true,
  })
  assert.equal(summary.kind, 'ok')
  assert.equal(summary.characters_extracted, 1)
  assert.equal(summary.characters_validated, 1)
  assert.equal(summary.attributes_extracted, 1)
  assert.equal(summary.attributes_validated, 1)
  assert.equal(summary.sources_inserted, 0) // dry-run
  assert.equal(supabase._inserted.pitch_sources.length, 0)
  assert.equal(supabase._inserted.pitch_characters.length, 0)
})

// ── Branch: ok (production, writes FK chain) ──────────────────────────────

test('production ok: writes pitch_sources, characters, attributes, signals in FK order', async () => {
  const supabase = makeFakeSupabase({
    listing: { id: 'listing-aaa', slug: 'good', vertical: 'sba', website: 'https://example.test' },
  })
  const fakeFetch = makeFakeFetch({
    'https://example.test/': '<html><body><h1>About Tom McHugh</h1><p>Tom McHugh founded the dairy in 2010.</p><p>The dairy won the Best Producer award in 2024.</p></body></html>',
  })
  const fakeAnthropic = makeFakeAnthropic({
    toolInput: {
      characters: [
        {
          name: 'Tom McHugh',
          role: 'founder',
          source_url: 'https://example.test/',
          source_excerpt: 'Tom McHugh founded the dairy in 2010.',
          attributes: [
            {
              attribute_type: 'background',
              attribute_text: 'Founded the dairy in 2010.',
              source_excerpt: 'Tom McHugh founded the dairy',
              confidence: 'explicit',
            },
            {
              attribute_type: 'philosophy',
              attribute_text: 'NOT IN SOURCE — should be dropped',
              source_excerpt: 'this excerpt does not appear in the page',
              confidence: 'implied',
            },
          ],
        },
      ],
      venue_signals: [
        {
          signal_type: 'award',
          source_url: 'https://example.test/',
          source_excerpt: 'Best Producer award in 2024',
          // signal_data is JSON-encoded per the v2 prompt schema —
          // the orchestrator parses it back before insert.
          signal_data: '{"name":"Best Producer","year":"2024"}',
        },
      ],
    },
  })
  const summary = await runStage1('listing-aaa', {
    supabase, fetch: fakeFetch, delay: NO_DELAY, anthropicClient: fakeAnthropic, dryRun: false,
  })

  assert.equal(summary.kind, 'ok')
  assert.equal(summary.pages_fetched, 1)
  // 1 source row per fetched page, regardless of extraction outcome
  assert.equal(summary.sources_inserted, 1)
  assert.equal(supabase._inserted.pitch_sources.length, 1)
  assert.equal(supabase._inserted.pitch_sources[0].source_type, 'venue_first_party')
  // Character inserted with primary_source_id pointing at the page's source row
  assert.equal(supabase._inserted.pitch_characters.length, 1)
  assert.equal(supabase._inserted.pitch_characters[0].name, 'Tom McHugh')
  assert.equal(
    supabase._inserted.pitch_characters[0].primary_source_id,
    supabase._inserted.pitch_sources[0].id,
  )
  // Only the valid attribute was inserted (the second one was dropped by validation)
  assert.equal(supabase._inserted.pitch_character_attributes.length, 1)
  assert.equal(supabase._inserted.pitch_character_attributes[0].attribute_type, 'background')
  // Signal inserted with source_id pointing at the page's source row
  assert.equal(supabase._inserted.pitch_signals.length, 1)
  assert.equal(supabase._inserted.pitch_signals[0].signal_type, 'award')
  // The JSON-encoded payload from the LLM is parsed back into an object
  // (note: year arrives as a string per the v2 schema's string-encoding
  // requirement, since JSON.parse preserves types but the LLM was
  // instructed to stringify within the JSON).
  assert.deepEqual(
    supabase._inserted.pitch_signals[0].signal_data,
    { name: 'Best Producer', year: '2024' },
  )

  // Stats reflect partial drop
  assert.equal(summary.characters_extracted, 1)
  assert.equal(summary.characters_validated, 1)
  assert.equal(summary.attributes_extracted, 2)
  assert.equal(summary.attributes_validated, 1)
  assert.equal(summary.signals_extracted, 1)
  assert.equal(summary.signals_validated, 1)
})

// ── Defensive: invalid characters/signals don't insert ────────────────────

test('rejected characters do not produce DB inserts even if attributes were valid', async () => {
  const supabase = makeFakeSupabase({
    listing: { id: 'listing-aaa', slug: 'fail', vertical: 'sba', website: 'https://example.test' },
  })
  const fakeFetch = makeFakeFetch({
    'https://example.test/': '<html><body><p>nothing useful here</p></body></html>',
  })
  const fakeAnthropic = makeFakeAnthropic({
    toolInput: {
      characters: [
        {
          name: 'Made-up Person',
          role: 'founder',
          source_url: 'https://example.test/', // url is fetched
          source_excerpt: 'this excerpt is not in the page text',
          attributes: [
            // Even if this attribute could match (it can't), the character
            // failed primary excerpt so it's rejected wholesale.
            {
              attribute_type: 'background',
              attribute_text: '...',
              source_excerpt: 'something',
              confidence: 'explicit',
            },
          ],
        },
      ],
      venue_signals: [],
    },
  })
  const summary = await runStage1('listing-aaa', {
    supabase, fetch: fakeFetch, delay: NO_DELAY, anthropicClient: fakeAnthropic, dryRun: false,
  })
  assert.equal(summary.kind, 'ok')
  // Source row still inserted (it's audit material, not contingent on extraction)
  assert.equal(supabase._inserted.pitch_sources.length, 1)
  // No characters, no attributes
  assert.equal(supabase._inserted.pitch_characters.length, 0)
  assert.equal(supabase._inserted.pitch_character_attributes.length, 0)
  assert.equal(summary.characters_validated, 0)
})

// ── Defensive: character citing URL not in fetched pages drops cleanly ────

test('character citing source_url not in fetched_pages is rejected without crash', async () => {
  const supabase = makeFakeSupabase({
    listing: { id: 'listing-aaa', slug: 'mixed', vertical: 'sba', website: 'https://example.test' },
  })
  const fakeFetch = makeFakeFetch({
    'https://example.test/': '<html><body><p>Tom McHugh founded the dairy.</p></body></html>',
  })
  const fakeAnthropic = makeFakeAnthropic({
    toolInput: {
      characters: [
        {
          name: 'Tom McHugh',
          role: 'founder',
          source_url: 'https://example.test/never-fetched',
          source_excerpt: 'Tom McHugh founded the dairy.',
          attributes: [],
        },
      ],
      venue_signals: [],
    },
  })
  const summary = await runStage1('listing-aaa', {
    supabase, fetch: fakeFetch, delay: NO_DELAY, anthropicClient: fakeAnthropic, dryRun: false,
  })
  assert.equal(summary.kind, 'ok')
  assert.equal(summary.characters_validated, 0)
  assert.equal(supabase._inserted.pitch_characters.length, 0)
})
