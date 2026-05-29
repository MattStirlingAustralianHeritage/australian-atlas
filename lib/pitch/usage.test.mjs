// Pure-math tests for token-usage capture + cost estimation.
//
// No network. Cost errors here would silently misreport the run's dollar
// figure, so the arithmetic is pinned explicitly.
//
// Run with:  node --test lib/pitch/usage.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractUsage, estimateCost, sumUsage, formatUsage, SONNET_4_6_RATES } from './usage.mjs'

test('extractUsage zero-fills a response with no usage block', () => {
  const u = extractUsage({})
  assert.deepEqual(u, {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  })
})

test('extractUsage reads all four token fields', () => {
  const u = extractUsage({
    usage: {
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_input_tokens: 200,
      cache_read_input_tokens: 100,
    },
  })
  assert.equal(u.input_tokens, 1000)
  assert.equal(u.output_tokens, 500)
  assert.equal(u.cache_creation_input_tokens, 200)
  assert.equal(u.cache_read_input_tokens, 100)
})

test('estimateCost applies Sonnet 4.6 rates per million tokens', () => {
  // 1M input @ $3 + 1M output @ $15 = $18 exactly.
  const cost = estimateCost({ input_tokens: 1_000_000, output_tokens: 1_000_000 })
  assert.equal(cost, 18)
})

test('estimateCost bills cache write/read at their own rates', () => {
  // 1M cache-write @ $3.75 + 1M cache-read @ $0.30 = $4.05.
  const cost = estimateCost({
    cache_creation_input_tokens: 1_000_000,
    cache_read_input_tokens: 1_000_000,
  })
  assert.ok(Math.abs(cost - 4.05) < 1e-9)
})

test('estimateCost on zero usage is zero', () => {
  assert.equal(estimateCost(extractUsage({})), 0)
})

test('sumUsage aggregates per-call usage into a per-run total', () => {
  const total = sumUsage([
    { input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    { input_tokens: 200, output_tokens: 20, cache_creation_input_tokens: 5, cache_read_input_tokens: 1 },
  ])
  assert.deepEqual(total, {
    input_tokens: 300,
    output_tokens: 30,
    cache_creation_input_tokens: 5,
    cache_read_input_tokens: 1,
  })
})

test('sumUsage on an empty list returns all zeros', () => {
  assert.deepEqual(sumUsage([]), {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  })
})

test('formatUsage includes token counts and a dollar figure', () => {
  const line = formatUsage('compose', { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 })
  assert.ok(line.includes('compose'))
  assert.ok(line.includes('in=1000'))
  assert.ok(line.includes('out=500'))
  assert.ok(line.includes('$'))
})

test('SONNET_4_6_RATES are the published $3 / $15 input/output rates', () => {
  assert.equal(SONNET_4_6_RATES.input, 3.0)
  assert.equal(SONNET_4_6_RATES.output, 15.0)
})
