/**
 * Shared operator-mention verifier.
 *
 * Fetches a URL, strips HTML to plain text, and tests whether any of
 * the candidate's name variants appear in the page. Used by Stage 2
 * (editorial press) and Stage 3 (institutional) to filter out generic
 * publication / body pages that pass URL validation but don't actually
 * mention the operator.
 *
 * Extracted from stage-3-institutional.js during Phase 2B Stage 2 fix
 * (Auswalk calibration surfaced the same false-positive class on
 * editorial press that Stage 3 had pre-fix).
 */

import { politeFetch } from '../polite-fetch.js'

const VERIFY_FETCH_TIMEOUT_MS = 8000
const VERIFY_MAX_TEXT = 16000

/**
 * Fetch a page and test whether the operator's name (or a variant)
 * appears in the visible text.
 *
 * @param {string} url
 * @param {string[]} variants — ordered longest-first (from generateNameVariants)
 * @returns {Promise<{matched: boolean, matchedVariant?: string, reason?: string}>}
 */
export async function verifyOperatorMentioned(url, variants) {
  if (!variants || variants.length === 0) {
    return { matched: false, reason: 'no_variants_provided' }
  }
  let text = ''
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), VERIFY_FETCH_TIMEOUT_MS)
    let res
    try {
      res = await politeFetch(url, {
        method: 'GET',
        signal: ctrl.signal,
        redirect: 'follow',
        headers: { 'User-Agent': 'AustralianAtlas-Discovery/1.0 (+https://australianatlas.com.au)' },
      })
    } finally { clearTimeout(t) }
    if (!res.ok) return { matched: false, reason: `fetch_status_${res.status}` }
    const html = await res.text()
    text = htmlToText(html).slice(0, VERIFY_MAX_TEXT).toLowerCase()
  } catch (e) {
    const reason = e?.name === 'AbortError' ? 'fetch_timeout' : (e?.message || 'fetch_error')
    return { matched: false, reason: reason.slice(0, 60) }
  }
  for (const variant of variants) {
    if (text.includes(variant.toLowerCase())) {
      return { matched: true, matchedVariant: variant }
    }
  }
  return { matched: false, reason: 'no_variant_in_page' }
}

export function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#?\w+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
