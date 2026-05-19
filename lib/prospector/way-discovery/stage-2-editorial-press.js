/**
 * Stage 2 — Editorial press whitelist hits.
 *
 * Per spec §V Stage 2 + Q1 sign-off.
 *
 * Cap: 3 web_search invocations per operator. This is enforced by
 * Anthropic's web_search tool's max_uses parameter (passed via
 * web-search.js's webSearch helper).
 *
 * Whitelist enforcement: post-hoc URL-domain filter, NOT just
 * in-prompt. Per Q1 sign-off — every returned URL is checked
 * against the canonical EDITORIAL_PRESS_WHITELIST before persistence.
 *
 * URL validation: every returned URL is fetched via polite-fetch
 * before its signal is persisted. Per Q1 sign-off — we don't trust
 * web_search's URL claims, we verify them.
 *
 * Confidence: HIGH for all whitelist hits — the whitelist IS the
 * editorial bar; if a URL passes both whitelist and resolution
 * checks, it's high-confidence editorial validation.
 *
 * Raw search response is persisted on raw_data.raw_search_response
 * so the swap path to Tavily/Brave is clean if web_search proves
 * unreliable in calibration (per Q1 structural requirement).
 */

import { webSearchValidated, makeHostMatcher } from './web-search.js'
import { SIGNAL_TYPES, CONFIDENCE, buildSignal } from './signals.js'
import { generateNameVariants, isShortestOnlyMatch } from './variants.js'
import { verifyOperatorMentioned } from './operator-mention.js'

// Canonical editorial press whitelist. Per spec §V Stage 2 + the
// master prompt's whitelist:
//
// General editorial:
//   australiangeographic.com.au, wildmag.com.au,
//   australiantraveller.com, outdoor.com.au,
//   thesaturdaypaper.com.au, themonthly.com.au,
//   smh.com.au (traveller section is part of the host),
//   theage.com.au (traveller section is part of the host),
//   theguardian.com (Australia editions), abc.net.au
//
// Specialist press:
//   australianmtb.com.au, verticallifemag.com.au (climbing),
//   flylifemagazine.com.au, australianseakayak.com.au
//
// Aboriginal-led specifically:
//   nitv.sbs.com.au, indigenousx.com.au, kooricourier.com.au,
//   kooricourier.com (alternate), koorimail.com
//
// We allow all subdomains of each whitelist host (suffix match in
// makeHostMatcher) so e.g. www.theguardian.com and
// au.theguardian.com both pass.

export const EDITORIAL_PRESS_WHITELIST = [
  // General editorial
  'australiangeographic.com.au',
  'wildmag.com.au',
  'australiantraveller.com',
  'outdoor.com.au',
  'thesaturdaypaper.com.au',
  'themonthly.com.au',
  'smh.com.au',
  'theage.com.au',
  'theguardian.com',
  'abc.net.au',
  // Specialist press
  'australianmtb.com.au',
  'verticallifemag.com.au',
  'flylifemagazine.com.au',
  'australianseakayak.com.au',
  // Aboriginal-led
  'nitv.sbs.com.au',
  'sbs.com.au',                  // NITV's parent, in case web_search returns sbs.com.au URLs
  'indigenousx.com.au',
  'koorimail.com',
  'kooricourier.com',
]

const SEARCH_QUERY_VARIANTS = [
  // Three queries per spec §V — Anthropic's web_search will issue up to
  // 3 searches based on the user message; we provide three
  // editorially-distinct angles to maximise whitelist hit rate.
  (name) => `"${name}" feature OR profile OR review`,
  (name) => `"${name}" guide OR walking OR experience`,
  (name) => `"${name}" Aboriginal OR Indigenous OR cultural`,
]

/**
 * @param {object} ctx — pipeline context
 * @param {object} _supabase — unused; signals returned to orchestrator
 * @returns {Promise<object[]>}
 */
export async function runStage2EditorialPress(ctx, _supabase) {
  const { candidate, runId, log } = ctx
  if (!candidate.name) {
    log(2, 'no candidate name; skipping')
    return []
  }

  const matcher = makeHostMatcher(EDITORIAL_PRESS_WHITELIST)

  // Use a single web_search call with max_uses=3, but seed it with a
  // user message that suggests three angles. Claude will spread its
  // search budget across the angles.
  const userQuery = `Find Australian editorial press coverage of the experience operator "${candidate.name}". I'm specifically interested in feature articles, profiles, and reviews from Australian magazines and newspapers. Try up to three different searches, varying the angle (feature/profile/review; guide/walking/experience; cultural/Aboriginal coverage where relevant). Report what you find — I'll use this to assess editorial reception.`

  const systemPrompt = `You are searching for editorial press coverage of an Australian experience tourism operator. Use the web_search tool. Prefer hits from Australian Geographic, Wild magazine, Australian Traveller, Outdoor magazine, The Saturday Paper, The Monthly, SMH, The Age, The Guardian Australia, ABC News, NITV, Koori Mail, IndigenousX, plus specialist press (Australian Mountain Bike, Vertical Life, FlyLife, Australian Sea Kayaker). Return what the search finds; I will filter post-hoc.`

  let result
  try {
    result = await webSearchValidated({
      query: userQuery,
      systemPrompt,
      maxUses: 3,
      whitelistMatcher: matcher,
    })
  } catch (e) {
    log(2, `web_search error: ${e?.message || e}`)
    return []
  }

  log(2, `web_search: ${result.usedSearches} searches, ${result.hits.length + result.filteredOut} raw hits, ${result.filteredOut} filtered out (off-whitelist), ${result.hits.length} post-whitelist`)

  // Resolve name variants for operator-mention verification.
  // Same pattern as Stage 3: editorial press whitelist hits that
  // resolve to publication homepages or category pages (not operator-
  // specific articles) are false positives. Auswalk calibration
  // surfaced 7 Australian Geographic / Australian Traveller hits that
  // were generic pages, not Auswalk articles.
  const variants = (Array.isArray(candidate.name_variants) && candidate.name_variants.length > 0)
    ? candidate.name_variants
    : generateNameVariants(candidate.name)
  if (variants.length === 0) {
    log(2, `no name variants for "${candidate.name}"; skipping stage 2`)
    return []
  }
  log(2, `verifying with variants: ${JSON.stringify(variants)}`)

  const signals = []
  let droppedNoMention = 0
  let bandDroppedShortMatch = 0

  for (const hit of result.hits) {
    if (!hit.url_resolved) {
      log(2, `dropped unresolved URL: ${hit.url} (status=${hit.url_validation_status})`)
      continue
    }

    // Verify the operator is actually mentioned on the page.
    const verification = await verifyOperatorMentioned(hit.url, variants)
    if (!verification.matched) {
      log(2, `dropped ${hit.url} — operator not mentioned in page text (${verification.reason})`)
      droppedNoMention++
      continue
    }

    let host = ''
    try { host = new URL(hit.url).hostname } catch {}
    const publication = inferPublicationFromHost(host)

    // Confidence band: HIGH by default (whitelist IS the editorial bar),
    // drop to MEDIUM if only the shortest variant matched.
    let confidence = CONFIDENCE.HIGH
    const onlyShort = isShortestOnlyMatch(verification.matchedVariant, variants)
    if (onlyShort) {
      confidence = CONFIDENCE.MEDIUM
      bandDroppedShortMatch++
    }

    signals.push(buildSignal({
      candidateId:  candidate.id,
      stage:        2,
      signalType:   SIGNAL_TYPES.STAGE_2.ARTICLE,
      claimText:    hit.title
        ? `Editorial coverage in ${publication}: "${hit.title}"`
        : `Editorial coverage in ${publication}`,
      sourceUrl:    hit.url,
      sourceExcerpt: hit.title || null,
      sourceLabel:  publication,
      confidence,
      urlResolved:  true,
      urlValidationStatus: hit.url_validation_status,
      rawData: {
        publication,
        published_date:  parsePageAge(hit.page_age),
        page_age_raw:    hit.page_age,
        title:           hit.title,
        encrypted_content: hit.encrypted_content,
        search_query:    userQuery,
        raw_response_size_bytes: JSON.stringify(result.rawResponse).length,
        matched_variant: verification.matchedVariant,
        variants_tested: variants,
        confidence_dropped_for_short_match: onlyShort,
      },
      runId,
    }))
  }

  if (droppedNoMention > 0 || bandDroppedShortMatch > 0) {
    log(2, `${droppedNoMention} dropped (no operator mention), ${bandDroppedShortMatch} band-dropped (shortest variant match only)`)
  }
  log(2, `stage 2 produced ${signals.length} signals`)
  return signals
}

// Map a hostname to a human-readable publication label.
function inferPublicationFromHost(host) {
  const m = host.toLowerCase().replace(/^www\./, '')
  const labels = {
    'australiangeographic.com.au':  'Australian Geographic',
    'wildmag.com.au':               'Wild magazine',
    'australiantraveller.com':      'Australian Traveller',
    'outdoor.com.au':               'Outdoor magazine',
    'thesaturdaypaper.com.au':      'The Saturday Paper',
    'themonthly.com.au':            'The Monthly',
    'smh.com.au':                   'Sydney Morning Herald',
    'theage.com.au':                'The Age',
    'theguardian.com':              'Guardian Australia',
    'abc.net.au':                   'ABC News',
    'australianmtb.com.au':         'Australian Mountain Bike',
    'verticallifemag.com.au':       'Vertical Life',
    'flylifemagazine.com.au':       'FlyLife',
    'australianseakayak.com.au':    'Australian Sea Kayaker',
    'nitv.sbs.com.au':              'NITV',
    'sbs.com.au':                   'SBS',
    'indigenousx.com.au':           'IndigenousX',
    'koorimail.com':                'Koori Mail',
    'kooricourier.com':             'Koori Courier',
  }
  for (const [domain, label] of Object.entries(labels)) {
    if (m === domain || m.endsWith('.' + domain)) return label
  }
  return host
}

// Anthropic's web_search returns page_age as a string like "2 months ago"
// or sometimes ISO date. Best-effort parse to ISO date string; null if
// we can't resolve it.
function parsePageAge(pageAge) {
  if (!pageAge || typeof pageAge !== 'string') return null
  // ISO date-like (YYYY-MM-DD or with time)
  const isoMatch = pageAge.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`

  // Relative phrasing: "N units ago"
  const m = pageAge.toLowerCase().match(/^(\d+)\s+(day|week|month|year)s?\s+ago/)
  if (m) {
    const n = parseInt(m[1], 10)
    const unit = m[2]
    const now = new Date()
    if (unit === 'day')   now.setDate(now.getDate() - n)
    if (unit === 'week')  now.setDate(now.getDate() - n * 7)
    if (unit === 'month') now.setMonth(now.getMonth() - n)
    if (unit === 'year')  now.setFullYear(now.getFullYear() - n)
    return now.toISOString().slice(0, 10)
  }
  return null
}
