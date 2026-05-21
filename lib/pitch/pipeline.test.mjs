// Input-validation smoke tests for the Phase 2 pipeline orchestrator.
//
// End-to-end pipeline behaviour is exercised via the dry-run script
// (scripts/pitch-generate.mjs) against a real listing — that hits Anthropic
// and Supabase. These tests cover the validation surface that runs before any
// network call.
//
// Run with:  node --test lib/pitch/pipeline.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runPipeline, LISTING_PITCH_FIELDS } from './pipeline.mjs'

function fakeSupabase() {
  // Returns a stub that throws if any of its methods are touched. Used to
  // assert that validation fails BEFORE the pipeline reaches the network.
  return new Proxy({}, {
    get(_t, prop) {
      throw new Error(`fakeSupabase: pipeline unexpectedly touched supabase.${String(prop)}`)
    },
  })
}

test('throws when candidate is missing', async () => {
  await assert.rejects(() => runPipeline(null, { supabase: fakeSupabase() }), /candidate is required/)
})

test('throws when listingId is missing', async () => {
  await assert.rejects(
    () => runPipeline({ slotType: 'general' }, { supabase: fakeSupabase() }),
    /listingId is required/
  )
})

test('throws when slotType is missing', async () => {
  await assert.rejects(
    () => runPipeline({ listingId: 'abc' }, { supabase: fakeSupabase() }),
    /slotType is required/
  )
})

test('throws when slotType is invalid', async () => {
  await assert.rejects(
    () => runPipeline({ listingId: 'abc', slotType: 'portal' }, { supabase: fakeSupabase() }),
    /invalid slotType/
  )
})

test('throws when supabase is missing', async () => {
  await assert.rejects(
    () => runPipeline({ listingId: 'abc', slotType: 'general' }, {}),
    /supabase is required/
  )
})

test('LISTING_PITCH_FIELDS includes the columns required by the output schema', () => {
  // The submit_pitch tool requires anchor_listing.id, name, vertical, region, slug.
  // Those columns must be in the LLM's view of the listing.
  for (const field of ['id', 'name', 'vertical', 'region', 'slug']) {
    assert.ok(
      LISTING_PITCH_FIELDS.includes(field),
      `LISTING_PITCH_FIELDS must include ${field} (required by submit_pitch schema)`
    )
  }
})

test('LISTING_PITCH_FIELDS excludes computational columns', () => {
  for (const field of ['search_vector', 'embedding']) {
    assert.equal(
      LISTING_PITCH_FIELDS.includes(field),
      false,
      `LISTING_PITCH_FIELDS must NOT include ${field}`
    )
  }
})

test('LISTING_PITCH_FIELDS is frozen (immutable)', () => {
  assert.equal(Object.isFrozen(LISTING_PITCH_FIELDS), true)
})
