// ─────────────────────────────────────────────────────────────────────────────
// Manual pitch — two-source fact-check.
//
// The architectural anti-hallucination guarantee for manual pitches. Every
// entry in verified_facts must trace to its declared source:
//
//   • source="listing" → delegated VERBATIM to the batch field-checker
//     (lib/pitch/fact-check.mjs): type-dispatched substring/numeric/boolean/
//     array match against the named column on the Atlas listing record.
//   • source="website" → the excerpt must substring-match (case-insensitive,
//     whitespace-normalised) the fetched text of the page at its declared URL.
//     Identical to Stage 1's discovery validator (lib/pitch/stage1/validate.mjs).
//
// A pitch with even one ungrounded fact fails — it cannot reach the editor.
//
// Pure function. No I/O. No side effects.
// ─────────────────────────────────────────────────────────────────────────────

import { factCheck as factCheckListing } from '../fact-check.mjs'
import { normaliseText } from '../stage1/validate.mjs'

/**
 * @param {Array<Object>} verifiedFacts  - The pitch's declared facts. Each has
 *   { claim, source, field, value, url, excerpt }.
 * @param {Object} sources
 * @param {Object|null} sources.listing   - The Atlas listing row, or null.
 * @param {Map<string,string>} sources.pageIndex - URL → normalised page text.
 * @returns {{passed: true} | {passed: false, failed_claims: Array}}
 */
export function factCheckManual(verifiedFacts, sources = {}) {
  if (!Array.isArray(verifiedFacts)) {
    return { passed: false, failed_claims: [{ fact: null, reason: 'verified_facts_not_array', source_value: undefined }] }
  }
  if (verifiedFacts.length === 0) {
    return { passed: false, failed_claims: [{ fact: null, reason: 'no_verified_facts', source_value: undefined }] }
  }

  const listing = sources.listing && typeof sources.listing === 'object' ? sources.listing : null
  const pageIndex = sources.pageIndex instanceof Map ? sources.pageIndex : new Map()

  const failed = []
  for (const fact of verifiedFacts) {
    const result = checkOneFact(fact, listing, pageIndex)
    if (result !== null) failed.push(result)
  }

  return failed.length === 0 ? { passed: true } : { passed: false, failed_claims: failed }
}

/**
 * @returns {null} when the fact is grounded, or a FailedClaim object otherwise.
 */
function checkOneFact(fact, listing, pageIndex) {
  if (!fact || typeof fact !== 'object' || Array.isArray(fact)) {
    return { fact: fact ?? null, reason: 'fact_not_object', source_value: undefined }
  }

  if (fact.source === 'listing') {
    if (!listing) {
      return { fact, reason: 'no_listing_for_listing_fact', source_value: undefined }
    }
    // Delegate to the proven batch field-checker for this single fact. It
    // handles the column type dispatch and the prototype-pollution guard.
    const res = factCheckListing([fact], listing)
    if (res.passed) return null
    const fc = res.failed_claims[0]
    return { fact, reason: fc.reason, source_value: fc.source_value }
  }

  if (fact.source === 'website') {
    const url = typeof fact.url === 'string' ? fact.url : ''
    const excerpt = typeof fact.excerpt === 'string' ? fact.excerpt : ''
    if (url.length === 0) return { fact, reason: 'missing_url', source_value: undefined }
    if (normaliseText(excerpt).length === 0) return { fact, reason: 'missing_excerpt', source_value: undefined }
    const pageText = pageIndex.get(url)
    if (pageText === undefined) return { fact, reason: 'source_url_not_fetched', source_value: undefined }
    return pageText.includes(normaliseText(excerpt))
      ? null
      : { fact, reason: 'excerpt_not_in_source', source_value: undefined }
  }

  return { fact, reason: 'invalid_source', source_value: fact.source }
}
