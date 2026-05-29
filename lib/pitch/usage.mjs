// ─────────────────────────────────────────────────────────────────────────────
// Token-usage capture + cost estimation for the Phase 2 pipeline.
//
// Until this build the pipeline had never measured a token. Every model call
// (composition in generate.mjs, verification in verify.mjs) now captures the
// Anthropic `response.usage` block, and this module turns raw token counts into
// a dollar estimate at Sonnet 4.6 rates. The batch runner aggregates per-call
// usage into a per-run total.
//
// Rates are per MILLION tokens, USD, Sonnet 4.6:
//   input            $3.00 / M
//   output           $15.00 / M
//   cache write (5m) $3.75 / M   (1.25× input)
//   cache read       $0.30 / M   (0.10× input)
// ─────────────────────────────────────────────────────────────────────────────

export const SONNET_4_6_RATES = Object.freeze({
  input: 3.0,
  output: 15.0,
  cache_write: 3.75,
  cache_read: 0.3,
})

const PER_MILLION = 1_000_000

const ZERO_USAGE = Object.freeze({
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
})

/**
 * Normalise an Anthropic Message `usage` block into a plain object with every
 * field present and zero-filled. Safe to call on a response with no usage (e.g.
 * a mocked test response) — returns all-zeros rather than undefined.
 *
 * @param {Object} response  - Full Anthropic Message object.
 * @returns {{input_tokens:number, output_tokens:number, cache_creation_input_tokens:number, cache_read_input_tokens:number}}
 */
export function extractUsage(response) {
  const u = response?.usage ?? {}
  return {
    input_tokens: u.input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
  }
}

/**
 * Dollar cost of one normalised usage object at the given rates (Sonnet 4.6 by
 * default). Cache-write and cache-read tokens are billed at their own rates;
 * regular input tokens (cache misses) at the input rate.
 *
 * @param {Object} usage
 * @param {Object} [rates=SONNET_4_6_RATES]
 * @returns {number} USD
 */
export function estimateCost(usage, rates = SONNET_4_6_RATES) {
  const u = usage ?? ZERO_USAGE
  return (
    ((u.input_tokens ?? 0) / PER_MILLION) * rates.input +
    ((u.output_tokens ?? 0) / PER_MILLION) * rates.output +
    ((u.cache_creation_input_tokens ?? 0) / PER_MILLION) * rates.cache_write +
    ((u.cache_read_input_tokens ?? 0) / PER_MILLION) * rates.cache_read
  )
}

/**
 * Sum any number of normalised usage objects into one. Used by the batch runner
 * to roll per-call usage up into a per-run total.
 *
 * @param {Array<Object>} usages
 * @returns {{input_tokens:number, output_tokens:number, cache_creation_input_tokens:number, cache_read_input_tokens:number}}
 */
export function sumUsage(usages) {
  return (usages ?? []).reduce(
    (acc, u) => ({
      input_tokens: acc.input_tokens + (u?.input_tokens ?? 0),
      output_tokens: acc.output_tokens + (u?.output_tokens ?? 0),
      cache_creation_input_tokens: acc.cache_creation_input_tokens + (u?.cache_creation_input_tokens ?? 0),
      cache_read_input_tokens: acc.cache_read_input_tokens + (u?.cache_read_input_tokens ?? 0),
    }),
    { ...ZERO_USAGE }
  )
}

/**
 * One-line human-readable summary of a usage object and its estimated cost.
 *
 * @param {string} label
 * @param {Object} usage
 * @returns {string}
 */
export function formatUsage(label, usage) {
  const u = usage ?? ZERO_USAGE
  const cost = estimateCost(u)
  return (
    `${label}: in=${u.input_tokens} out=${u.output_tokens} ` +
    `cache_w=${u.cache_creation_input_tokens} cache_r=${u.cache_read_input_tokens} ` +
    `→ $${cost.toFixed(4)}`
  )
}
