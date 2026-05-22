// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 Stage 1 — first-party website fetcher.
//
// Given a venue's website URL, fetch the homepage plus a heuristic chain of
// about/story/team/journal pages, strip HTML to text, and return an array of
// successfully-fetched pages for downstream LLM extraction.
//
// Spec: docs/pitch-system-phase3-design.md §Stage 1 → Page chain + Fetch
// behaviour. The page-chain order and the fetch policy (timeout, delay, user
// agent, html-to-text) are locked in by the spec; do not change without
// updating the spec first.
//
// Network behaviour:
//   - 10s timeout per request via AbortController
//   - 1–2s delay between requests (these are small-business websites; courtesy
//     is the spec posture)
//   - 404s are silently skipped (the path didn't apply to this venue)
//   - Network errors are logged via an injected `log` callback but don't
//     halt the chain — a venue with /about working and /journal timing out
//     should still produce its /about page
//
// Pure-ish: takes a `fetch` and `delay` via opts for testability (the unit
// tests mock both). Defaults to global fetch and a real setTimeout.
// ─────────────────────────────────────────────────────────────────────────────

import { convert } from 'html-to-text'

/**
 * Page-chain paths to attempt in order, relative to the venue's website root.
 * Locked in by spec. Order matters — homepage first, then About variants,
 * then process/team/people, then contact/journal/blog at the tail. The model
 * sees this content in order, so leading with the homepage anchors the
 * extraction to canonical material.
 */
export const STAGE_1_PAGE_CHAIN = Object.freeze([
  '/',
  '/about',
  '/about-us',
  '/our-story',
  '/the-story',
  '/process',
  '/studio',
  '/makers',
  '/team',
  '/people',
  '/founders',
  '/contact',
  '/journal',
  '/blog',
])

/** Per-request timeout, milliseconds. */
export const FETCH_TIMEOUT_MS = 10_000

/** Default inter-request delay range, milliseconds. */
export const FETCH_DELAY_MIN_MS = 1_000
export const FETCH_DELAY_MAX_MS = 2_000

/**
 * Spec-locked user agent. Identifies the Atlas to politely-curious site
 * operators who check their logs; the contact URL gives them a way to push
 * back if they want.
 */
export const USER_AGENT =
  'Mozilla/5.0 (compatible; AustralianAtlas/1.0; +https://australianatlas.com.au)'

/**
 * html-to-text conversion options. Tuned for editorial extraction:
 *   - wordwrap: false → preserves natural sentence boundaries; we want long
 *     lines we can substring-match against later
 *   - selectors strip script/style/nav/footer for noise reduction
 *   - links emitted as their text only (URLs would clutter the LLM context
 *     and don't aid character extraction)
 */
const HTML_TO_TEXT_OPTIONS = {
  wordwrap: false,
  selectors: [
    { selector: 'script', format: 'skip' },
    { selector: 'style', format: 'skip' },
    { selector: 'nav', format: 'skip' },
    { selector: 'footer', format: 'skip' },
    { selector: 'a', options: { ignoreHref: true } },
    { selector: 'img', format: 'skip' },
    // Preserve case on headings. The default html-to-text behaviour
    // uppercases h1–h6, which would store all-caps source_excerpts (substring
    // matching is case-insensitive per spec, so functionally fine, but the
    // database rows + editor UI read better in the original case).
    { selector: 'h1', options: { uppercase: false } },
    { selector: 'h2', options: { uppercase: false } },
    { selector: 'h3', options: { uppercase: false } },
    { selector: 'h4', options: { uppercase: false } },
    { selector: 'h5', options: { uppercase: false } },
    { selector: 'h6', options: { uppercase: false } },
  ],
}

/**
 * @typedef {Object} FetchedPage
 * @property {string} url        - Fully-qualified URL that was fetched
 * @property {string} text       - HTML-stripped text content
 * @property {string} fetched_at - ISO timestamp of fetch completion
 *
 * @typedef {Object} FetchOpts
 * @property {typeof fetch} [fetch]     - Injectable fetch (defaults to global)
 * @property {(ms: number) => Promise<void>} [delay] - Injectable delay
 *                                        (defaults to setTimeout-based);
 *                                        tests use a no-op
 * @property {(level: string, msg: string) => void} [log] - Injectable logger
 * @property {readonly string[]} [chain] - Page chain to attempt (defaults to
 *                                          STAGE_1_PAGE_CHAIN)
 *
 * @typedef {Object} FetchResult
 * @property {FetchedPage[]} pages         - Successfully fetched + stripped pages
 * @property {string[]}       attempted     - All URLs tried (for audit)
 * @property {Array<{url: string, status: number|null, error: string|null}>} errors
 *                                          - Per-URL non-fatal errors
 */

/**
 * Fetch the first-party page chain for a single venue.
 *
 * @param {string} websiteUrl
 * @param {FetchOpts} [opts]
 * @returns {Promise<FetchResult>}
 */
export async function fetchFirstPartyPages(websiteUrl, opts = {}) {
  if (!websiteUrl || typeof websiteUrl !== 'string') {
    throw new Error('fetchFirstPartyPages: websiteUrl is required (string)')
  }
  const chain = opts.chain || STAGE_1_PAGE_CHAIN
  const doFetch = opts.fetch || globalThis.fetch
  const doDelay = opts.delay || defaultDelay
  const log = opts.log || (() => {})

  const base = normaliseBase(websiteUrl)
  if (!base) {
    throw new Error(`fetchFirstPartyPages: invalid websiteUrl: ${websiteUrl}`)
  }

  /** @type {FetchedPage[]} */
  const pages = []
  /** @type {string[]} */
  const attempted = []
  /** @type {Array<{url: string, status: number|null, error: string|null}>} */
  const errors = []

  for (let i = 0; i < chain.length; i++) {
    const path = chain[i]
    const url = joinUrl(base, path)
    attempted.push(url)

    // Polite delay between requests. Skipped before the first request.
    if (i > 0) {
      await doDelay(randomBetween(FETCH_DELAY_MIN_MS, FETCH_DELAY_MAX_MS))
    }

    const result = await fetchOne(url, doFetch, log)

    if (result.kind === 'ok') {
      pages.push({ url, text: result.text, fetched_at: result.fetched_at })
      log('debug', `fetched ${url} (${result.text.length} chars)`)
    } else if (result.kind === 'http_error') {
      // 404 is silent per spec; other HTTP errors get logged but don't halt.
      if (result.status !== 404) {
        errors.push({ url, status: result.status, error: null })
        log('warn', `http ${result.status} fetching ${url}`)
      }
    } else {
      // Network/abort/parse errors. Logged + recorded, but the chain continues.
      errors.push({ url, status: null, error: result.error })
      log('warn', `error fetching ${url}: ${result.error}`)
    }
  }

  return { pages, attempted, errors }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function fetchOne(url, doFetch, log) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await doFetch(url, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*;q=0.8' },
      signal: controller.signal,
      redirect: 'follow',
    })
    if (!response.ok) {
      return { kind: 'http_error', status: response.status }
    }
    const html = await response.text()
    const text = stripHtml(html)
    return {
      kind: 'ok',
      text,
      fetched_at: new Date().toISOString(),
    }
  } catch (err) {
    return {
      kind: 'network_error',
      error: err?.name === 'AbortError' ? 'timeout' : err?.message ?? String(err),
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * HTML → plaintext. Exported for tests; uses html-to-text under the hood.
 * Returns the stripped string ready for substring matching against
 * source_excerpts later in the pipeline.
 */
export function stripHtml(html) {
  if (!html || typeof html !== 'string') return ''
  return convert(html, HTML_TO_TEXT_OPTIONS).trim()
}

/**
 * Normalise a website URL into a clean base for joining paths against.
 * Handles trailing slashes, missing protocols, paths-on-base.
 */
function normaliseBase(websiteUrl) {
  let candidate = websiteUrl.trim()
  if (!candidate) return null
  // Allow bare hostnames (no protocol) — common in listings data.
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = 'https://' + candidate
  }
  try {
    const u = new URL(candidate)
    // Strip any path/query/hash; we want the bare origin.
    return u.origin
  } catch {
    return null
  }
}

function joinUrl(origin, path) {
  if (path === '/' || path === '') return origin + '/'
  if (path.startsWith('/')) return origin + path
  return origin + '/' + path
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function defaultDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
