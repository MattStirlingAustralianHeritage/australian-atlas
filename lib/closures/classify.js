// Closure-sweep classification.
//
// Pure functions: the cron gathers raw signals (Google Places business_status,
// a website probe, closure phrases scraped from the venue's own site) and this
// module turns them into a single reviewable verdict. Nothing here hides a
// listing — every verdict lands in closure_signals for a human decision,
// because Places CLOSED_PERMANENTLY alone has run at ~60% false positives
// on this dataset (rebrands, wrong matches, stale Google data).
//
// PURE MODULE — relative imports only, no DB, no network. Safe for node --test.

import { nameSimilarity } from '../gate-check/gates.js'

export { nameSimilarity }

// Same-identity threshold for trusting a matched place's status. Matches
// AUTO_MATCH in the Gate Check website repair — below this, the Places result
// is likely a different business (the rebrand trap), so its closure status
// says nothing about our listing.
export const NAME_MATCH_THRESHOLD = 0.62

// Probe classifications that mean "this website is genuinely gone".
// Deliberately excludes:
//   tls_issue    — a TLS error is NOT a dead site (expired cert ≠ closed venue)
//   dead_timeout — bot-blocked and WAF'd sites time out routinely
//   http_error   — 4xx/5xx other than gone: broken, not absent
export const HARD_DEAD_CLASSIFICATIONS = ['dead_dns', 'dead_refused', 'http_gone']

// Phrases on a venue's own website that indicate closure. Kept deliberately
// literal — a regex sweep beat an LLM judge on this codebase before.
const PERMANENT_PHRASES = [
  /permanently\s+closed/i,
  /closed\s+permanently/i,
  /closed\s+(?:its|our)\s+doors\s+for\s+good/i,
  /closed\s+(?:its|our)\s+doors\s+permanently/i,
  /we\s+(?:have|'ve)\s+(?:now\s+)?closed\s+(?:our|the)\s+doors/i,
  /(?:has|have|we(?:'ve| have))\s+ceased\s+trading/i,
  /no\s+longer\s+(?:trading|in\s+business|operating)/i,
  /business\s+has\s+closed/i,
  /thank\s+you\s+for\s+(?:the\s+)?(?:many\s+)?(?:wonderful\s+)?years[\s\S]{0,120}closed/i,
]

const TEMPORARY_PHRASES = [
  /temporarily\s+closed/i,
  /closed\s+temporarily/i,
  /closed\s+until\s+further\s+notice/i,
  /closed\s+for\s+(?:the\s+)?(?:winter|summer|season|renovations?|maintenance|refurbishment)/i,
  /reopening\s+(?:in|on)\s+\w+/i,
  /on\s+(?:a\s+)?(?:short\s+)?hiatus/i,
  /we(?:'re|\s+are|\s+will\s+be)\s+taking\s+a\s+(?:short\s+|little\s+)?break/i,
]

/**
 * Scan visible page text (already stripped of tags by the caller) for
 * closure language. Returns { permanent: [...], temporary: [...] } with the
 * matched snippets as evidence for the review console.
 */
export function scanSiteTextForClosure(text) {
  const hay = String(text || '').slice(0, 200_000)
  const found = { permanent: [], temporary: [] }
  for (const re of PERMANENT_PHRASES) {
    const m = hay.match(re)
    if (m) found.permanent.push(snippetAround(hay, m.index, m[0].length))
  }
  for (const re of TEMPORARY_PHRASES) {
    const m = hay.match(re)
    if (m) found.temporary.push(snippetAround(hay, m.index, m[0].length))
  }
  return found
}

function snippetAround(text, index, matchLen) {
  const start = Math.max(0, index - 60)
  const end = Math.min(text.length, index + matchLen + 60)
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : '')
}

/**
 * Classify one listing's gathered signals into a verdict.
 *
 * @param {object} input
 * @param {string|null} input.placesStatus  'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY' | null (no match / not checked)
 * @param {string|null} input.placesName    display name Google returned for the matched place
 * @param {string} input.listingName
 * @param {object|null} input.websiteProbe  { classification: string } — one of 'ok' | 'dead_dns' |
 *                                          'dead_refused' | 'dead_timeout' | 'http_gone' | 'http_error' |
 *                                          'tls_issue' | 'fetch_error' (or null when there is no website)
 * @param {{permanent: string[], temporary: string[]}|null} input.siteText  closure phrases found on the venue's own site
 * @param {string|null} [input.currentClosureStatus]  the listing's closure_status ('temporarily_closed' | null)
 * @returns {null | { signal: 'closed_permanently'|'closed_temporarily'|'possibly_closed'|'reopened',
 *                    confidence: 'high'|'medium'|'low', reasons: string[] }}
 *          null when nothing suggests closure (operational / no evidence).
 */
export function classifyClosure({ placesStatus, placesName, listingName, websiteProbe, siteText, currentClosureStatus = null }) {
  const reasons = []
  const nameOk = placesName == null
    ? null
    : nameSimilarity(listingName, placesName) >= NAME_MATCH_THRESHOLD

  const sitePermanent = (siteText?.permanent?.length ?? 0) > 0
  const siteTemporary = (siteText?.temporary?.length ?? 0) > 0
  const siteDead = websiteProbe != null
    && HARD_DEAD_CLASSIFICATIONS.includes(websiteProbe.classification)

  // The venue's own website saying it closed is the strongest single signal.
  if (sitePermanent) {
    reasons.push('own website states permanent closure')
    if (placesStatus === 'CLOSED_PERMANENTLY' && nameOk) reasons.push('Google Places agrees (CLOSED_PERMANENTLY, name matched)')
    return { signal: 'closed_permanently', confidence: 'high', reasons }
  }

  if (placesStatus === 'CLOSED_PERMANENTLY') {
    if (nameOk === false) {
      // Matched a different identity — likely a rebrand or the wrong place.
      reasons.push('Places says CLOSED_PERMANENTLY but the matched place name differs — possible rebrand or mismatched venue')
      return { signal: 'possibly_closed', confidence: 'low', reasons }
    }
    reasons.push(nameOk ? 'Google Places CLOSED_PERMANENTLY (name matched)' : 'Google Places CLOSED_PERMANENTLY')
    if (siteDead) {
      reasons.push(`website unreachable (${websiteProbe.classification})`)
      return { signal: 'closed_permanently', confidence: 'high', reasons }
    }
    // Site still alive (or no site): needs a human eye before hiding.
    return { signal: 'closed_permanently', confidence: 'medium', reasons }
  }

  if (siteTemporary || placesStatus === 'CLOSED_TEMPORARILY') {
    if (placesStatus === 'CLOSED_TEMPORARILY') {
      if (nameOk === false) {
        reasons.push('Places says CLOSED_TEMPORARILY but the matched place name differs')
        return { signal: 'possibly_closed', confidence: 'low', reasons }
      }
      reasons.push('Google Places CLOSED_TEMPORARILY' + (nameOk ? ' (name matched)' : ''))
    }
    if (siteTemporary) reasons.push('own website states temporary closure')
    const confidence = siteTemporary && placesStatus === 'CLOSED_TEMPORARILY' ? 'high' : 'medium'
    return { signal: 'closed_temporarily', confidence, reasons }
  }

  // A venue we flagged temporarily closed now looks open again — surface it
  // so the admin can clear the badge (never cleared automatically).
  if (currentClosureStatus === 'temporarily_closed' && placesStatus === 'OPERATIONAL' && nameOk) {
    reasons.push('marked temporarily closed here, but Google Places now reports OPERATIONAL (name matched) and its website shows no closure notice')
    return { signal: 'reopened', confidence: 'medium', reasons }
  }

  // No closure statement anywhere, but the site is hard-gone (DNS dead /
  // connection refused / HTTP 404-410). A TLS error or timeout is NOT a dead
  // site and never lands here.
  if (siteDead && placesStatus !== 'OPERATIONAL') {
    reasons.push(`website unreachable (${websiteProbe.classification}) and no Places confirmation the venue is open`)
    return { signal: 'possibly_closed', confidence: 'low', reasons }
  }

  return null
}
