/**
 * Per-host rate-limited fetch wrapper.
 *
 * Maintains an in-process map of hostname → last-request timestamp; subsequent
 * fetches to the same host wait until the configured delay has elapsed since
 * the previous request to that host. Different hosts run independently —
 * this is per-host throttling, not global.
 *
 * Built for discovery pipelines that fetch many URLs per candidate
 * (operator websites + editorial press articles + institutional registers
 * + cross-reference scans). The existing prospector pipeline at
 * lib/prospector/pipeline.js makes ~1–2 fetches per candidate and runs
 * candidates sequentially, so it doesn't need explicit throttling. Way
 * Atlas's discovery pipeline will fetch from many more sources per
 * candidate and across many hosts; this helper keeps each host's load
 * polite.
 *
 * Defaults match the network's standing rule (CLAUDE.md, "1–2 second
 * delays between fetches of operator websites; 2–3 seconds between API
 * calls to external registers"). Override via the `delayMs` option per
 * call, or construct a dedicated client via `makePoliteFetch({delayMs})`.
 *
 * In-process state caveats:
 *   • The per-host map is in-process. Multiple Node processes running
 *     discovery in parallel won't synchronise — that's a deliberate
 *     non-feature; if cross-process throttling becomes necessary, move
 *     the map into Postgres or Redis and add advisory locks.
 *   • The map grows with the number of distinct hosts hit and is never
 *     pruned. For long-running processes hitting tens of thousands of
 *     hosts, add LRU eviction. Today's discovery touches dozens at most;
 *     not a concern.
 *   • Concurrent calls to the same host correctly serialise via the
 *     queue chain on `_lastRequest`. Promises chain on top of one another
 *     so the second concurrent caller waits for the first's delay to
 *     elapse before claiming its own slot.
 *
 * Usage:
 *   import { politeFetch } from '@/lib/prospector/polite-fetch'
 *   const res = await politeFetch('https://example.com/about')
 *
 *   // Per-call override:
 *   const res = await politeFetch(url, { delayMs: 3000 })
 *
 *   // Dedicated client with non-default delay (e.g. for slower
 *   // institutional registers that prefer 3-second pacing):
 *   const slowFetch = makePoliteFetch({ delayMs: 3000 })
 *   const res = await slowFetch('https://atap.example.com/operators')
 */

const DEFAULT_DELAY_MS = 1500

const _hostQueue = new Map()  // hostname → Promise resolving to "request slot acquired"

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Wait for the host's slot to be available, then claim it.
 * Returns once it's safe to issue the fetch.
 *
 * Concurrent calls for the same host queue: each one chains its wait onto
 * the previous one's release timestamp, so request N+1 waits delayMs after
 * request N's slot was claimed (not after the fetch resolved — claiming
 * is the rate-relevant moment).
 */
function acquireHostSlot(host, delayMs) {
  if (!host) return Promise.resolve()  // null host (e.g. invalid URL) → no throttle
  const previous = _hostQueue.get(host) || Promise.resolve(0)
  const next = previous.then(async (lastRequestAt) => {
    const elapsed = Date.now() - (lastRequestAt || 0)
    if (elapsed < delayMs) await sleep(delayMs - elapsed)
    return Date.now()
  })
  _hostQueue.set(host, next)
  return next
}

/**
 * Drop-in fetch replacement with per-host rate limiting.
 *
 * @param {string|URL} url
 * @param {object} [options] — fetch options, plus:
 *   @param {number} [options.delayMs=1500] — minimum interval between
 *     fetches to the same host, in ms.
 * @returns {Promise<Response>}
 */
export async function politeFetch(url, options = {}) {
  const { delayMs = DEFAULT_DELAY_MS, ...fetchOptions } = options
  const host = hostOf(typeof url === 'string' ? url : url.toString())
  await acquireHostSlot(host, delayMs)
  return fetch(url, fetchOptions)
}

/**
 * Construct a dedicated polite-fetch client with a non-default delay.
 * Useful for paths that have a known different politeness budget — e.g.
 * external registers that explicitly request slower pacing.
 *
 * @param {object} config
 * @param {number} config.delayMs
 * @returns {(url: string|URL, options?: object) => Promise<Response>}
 */
export function makePoliteFetch({ delayMs = DEFAULT_DELAY_MS } = {}) {
  return (url, options = {}) => politeFetch(url, { ...options, delayMs })
}

/**
 * Internal: clear the per-host state. For tests only.
 */
export function _resetForTests() {
  _hostQueue.clear()
}
