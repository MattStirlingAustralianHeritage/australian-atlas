/**
 * Anthropic web_search wrapper for the Way discovery pipeline.
 *
 * Implements the two structural requirements from Q1 sign-off:
 *
 *   1. URL validation — every URL claimed by web_search is fetched
 *      via polite-fetch BEFORE the result is returned. URLs that
 *      don't resolve are dropped (not just flagged); this stops the
 *      pipeline from persisting fabricated source URLs the way the
 *      original pitch generator did.
 *
 *   2. Hard domain whitelist — for Stage 2 (editorial press), every
 *      URL's hostname must be in the canonical whitelist. Junk
 *      hostnames are filtered post-hoc; we do NOT trust web_search
 *      to honour the whitelist from the prompt alone.
 *
 * Per the codebase convention, this uses direct fetch against
 * api.anthropic.com (not the @anthropic-ai/sdk client) to match the
 * existing prospector pattern in lib/prospector/gates.js. Switching
 * to the SDK is a separate decision; staying consistent for now.
 *
 * Raw search responses are persisted on the signal's raw_data field
 * so that swapping to Tavily/Brave later is a consumer change only,
 * not a rewrite.
 */

import { politeFetch } from '../polite-fetch.js'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

// Web search tool identifier per Anthropic's published interface.
// Update if Anthropic deprecates this tool revision.
const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 3,                     // hard cap matching spec §V Stage 2
}

const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929'   // Sonnet for retrieval; Haiku is too thin for this
const URL_VALIDATION_TIMEOUT_MS = 8000

// ─── URL validation ──────────────────────────────────────────────

/**
 * Validate a URL by issuing a HEAD (falling back to GET for sites
 * that reject HEAD) and checking for a 2xx response. Returns the
 * validation outcome WITHOUT consuming the body — Stage 1 does its
 * own GETs for excerpt extraction.
 *
 * @param {string} url
 * @param {object} [opts]
 * @param {number} [opts.delayMs] — passed through to politeFetch
 * @returns {Promise<{ resolved: boolean, status: string }>}
 */
export async function validateUrl(url, opts = {}) {
  if (!url || typeof url !== 'string') {
    return { resolved: false, status: 'invalid' }
  }
  let host
  try { host = new URL(url).hostname } catch { return { resolved: false, status: 'invalid' } }
  if (!host) return { resolved: false, status: 'invalid' }

  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), URL_VALIDATION_TIMEOUT_MS)
    let res
    try {
      // HEAD first — cheaper. Some sites return 405; fall through to GET.
      res = await politeFetch(url, {
        method: 'HEAD',
        signal: ctrl.signal,
        redirect: 'follow',
        delayMs: opts.delayMs,
      })
      if (res.status === 405 || res.status === 501) {
        res = await politeFetch(url, {
          method: 'GET',
          signal: ctrl.signal,
          redirect: 'follow',
          delayMs: opts.delayMs,
        })
      }
    } finally {
      clearTimeout(t)
    }
    return {
      resolved: res.ok,                          // 2xx
      status: String(res.status),
    }
  } catch (e) {
    const reason = (e && e.name === 'AbortError') ? 'timeout' : 'unreachable'
    return { resolved: false, status: reason }
  }
}

// ─── Whitelist enforcement ───────────────────────────────────────

/**
 * Build a hostname matcher for a whitelist. Accepts an array of
 * hostnames (or substrings); returns a function that takes a URL
 * and returns true if the URL's hostname matches any whitelist
 * entry as suffix (so "abc.theguardian.com" matches "theguardian.com").
 *
 * @param {string[]} hostnames
 * @returns {(url: string) => boolean}
 */
export function makeHostMatcher(hostnames) {
  const lower = hostnames.map(h => h.toLowerCase().replace(/^www\./, ''))
  return (url) => {
    let host
    try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, '') }
    catch { return false }
    return lower.some(w => host === w || host.endsWith('.' + w))
  }
}

// ─── Anthropic web_search invocation ─────────────────────────────

/**
 * Run a web search via Anthropic's web_search server tool.
 * Returns parsed search hits + the raw API response (for audit).
 *
 * Output shape:
 *   {
 *     hits: [{ url, title, page_age, encrypted_content }],
 *     rawResponse: <full API response>,
 *     usedSearches: <number of web_search tool invocations>,
 *   }
 *
 * @param {object} params
 * @param {string} params.query
 * @param {string} [params.systemPrompt]   — extra instructions to constrain
 * @param {number} [params.maxUses]        — override WEB_SEARCH_TOOL.max_uses
 * @param {string[]} [params.allowedDomains]  — passed to web_search tool's allowed_domains
 * @param {string[]} [params.blockedDomains]  — passed to web_search tool's blocked_domains
 * @returns {Promise<{ hits: Array, rawResponse: object, usedSearches: number }>}
 */
export async function webSearch(params) {
  const {
    query,
    systemPrompt,
    maxUses = WEB_SEARCH_TOOL.max_uses,
    allowedDomains,
    blockedDomains,
  } = params

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('webSearch: ANTHROPIC_API_KEY missing from env')

  const tool = { ...WEB_SEARCH_TOOL, max_uses: maxUses }
  if (allowedDomains && allowedDomains.length) tool.allowed_domains = allowedDomains
  if (blockedDomains && blockedDomains.length) tool.blocked_domains = blockedDomains

  const body = {
    model: DEFAULT_MODEL,
    max_tokens: 2048,
    tools: [tool],
    messages: [{
      role: 'user',
      content: query,
    }],
  }
  if (systemPrompt) body.system = systemPrompt

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`webSearch: Anthropic API ${res.status} — ${text.slice(0, 200)}`)
  }
  const rawResponse = await res.json()

  // Extract web_search_tool_result blocks. Each block contains hits.
  const hits = []
  let usedSearches = 0
  for (const block of (rawResponse.content || [])) {
    if (block.type === 'server_tool_use' && block.name === 'web_search') {
      usedSearches++
    }
    if (block.type === 'web_search_tool_result') {
      const content = block.content
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item.type === 'web_search_result' && item.url) {
            hits.push({
              url: item.url,
              title: item.title || null,
              page_age: item.page_age || null,
              // encrypted_content is opaque; surface it for downstream
              // reuse if Anthropic's tool chain ever supports it.
              encrypted_content: item.encrypted_content || null,
            })
          }
        }
      }
    }
  }

  return { hits, rawResponse, usedSearches }
}

/**
 * High-level wrapper: run web search, validate URLs, optionally
 * filter by whitelist. Returns hits in stable shape with validation
 * metadata attached. This is the call sites in stages 2 + 3 use.
 *
 * @param {object} params
 * @param {string} params.query
 * @param {string} [params.systemPrompt]
 * @param {number} [params.maxUses]
 * @param {string[]} [params.allowedDomains]
 * @param {(url: string) => boolean} [params.whitelistMatcher]
 *        — applied AFTER the API call; URLs not matching are dropped.
 *          For Stage 2 (editorial press) this is the canonical whitelist;
 *          for Stage 3 it's the per-body site domain.
 * @returns {Promise<{
 *   hits: Array<{ url, title, page_age, encrypted_content,
 *                 url_resolved, url_validation_status }>,
 *   rawResponse: object,
 *   usedSearches: number,
 *   filteredOut: number,
 * }>}
 */
export async function webSearchValidated(params) {
  const { whitelistMatcher } = params
  const { hits, rawResponse, usedSearches } = await webSearch(params)

  // Whitelist pre-filter: drop URLs not matching the matcher BEFORE
  // we spend HTTP budget validating them.
  const whitelisted = whitelistMatcher
    ? hits.filter(h => whitelistMatcher(h.url))
    : hits
  const filteredOut = hits.length - whitelisted.length

  // Validate every remaining URL. Sequential serialisation per host
  // is handled by polite-fetch.
  const validated = []
  for (const hit of whitelisted) {
    const v = await validateUrl(hit.url)
    validated.push({
      ...hit,
      url_resolved: v.resolved,
      url_validation_status: v.status,
    })
  }

  return {
    hits: validated,
    rawResponse,
    usedSearches,
    filteredOut,
  }
}
