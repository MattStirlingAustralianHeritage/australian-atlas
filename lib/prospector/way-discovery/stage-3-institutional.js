/**
 * Stage 3 — Institutional / accreditation register hits.
 *
 * Per spec §V Stage 3, Q2 sign-off: site-scoped generic search rather
 * than per-body parsers, with confidence bands attached to each
 * institutional source. Tourism awards URLs have stable structures
 * and are high-confidence; forum mentions on advocacy bodies are
 * low-confidence; the signal record stores the band so the scoring
 * layer in 2C can weight accordingly.
 *
 * Bodies covered (per master prompt + spec):
 *   • Australian Tourism Awards (state + national, last 5 years)        HIGH
 *   • Ecotourism Australia (Advanced + ECO Destination certifications)  HIGH
 *   • Respecting Our Culture (ROC) certification register               HIGH
 *   • Bushwalking Federation Australia member operators                 MEDIUM
 *   • Australian Mountain Guides Association certified operators        MEDIUM
 *   • Outdoor Council of Australia operator register                    MEDIUM
 *   • State Aboriginal tourism bodies (Welcome to Country,
 *     NSW Aboriginal Tourism Operators Council, Karrkad Kanjdji
 *     Trust supported operators, etc.)                                  LOW-MEDIUM
 *
 * Implementation: one web_search per body, scoped via
 * `allowed_domains` on the web_search tool. Each search is
 * independent (different domain, different rate budget).
 *
 * URL validation: every returned URL is fetched via polite-fetch
 * before signal persistence (Q1 sign-off requirement). Whitelist
 * enforcement is per-body — the search is scoped to that body's
 * domain, and the matcher rejects URLs outside that domain.
 *
 * Signal type assignment by body category:
 *   • Awards bodies emit institutional.award
 *   • Certification bodies emit institutional.certification
 *   • Membership bodies emit institutional.member_listing
 *
 * The body's confidence_band is attached per signal.
 */

import { webSearchValidated, makeHostMatcher } from './web-search.js'
import { SIGNAL_TYPES, CONFIDENCE, buildSignal } from './signals.js'

// Institutional registers configuration. Each entry:
//   id            — internal ID (used in raw_data.body)
//   label         — human-readable
//   domains[]     — allowed_domains for web_search; matcher uses these
//   signalType    — one of SIGNAL_TYPES.STAGE_3.*
//   confidence    — band per Q2 sign-off
//   queryTemplate — function from operatorName → search query string
//
// Confidence bands rationale:
//   HIGH for awards/certs because their listings are structured
//        (the operator either won the award or didn't; the cert is
//        either current or it isn't), and the search hits land on
//        canonical listing pages.
//   MEDIUM for member listings because membership tiers and statuses
//        vary, and member directories are sometimes incomplete or
//        stale.
//   LOW for state Aboriginal tourism bodies because their sites
//        vary widely in structure, and "supported by" language is
//        editorially looser than "certified by".

const INSTITUTIONAL_BODIES = [
  {
    id: 'australian_tourism_awards',
    label: 'Australian Tourism Awards',
    domains: ['qualitytourismaustralia.com.au', 'awards.qualitytourismaustralia.com.au'],
    signalType: SIGNAL_TYPES.STAGE_3.AWARD,
    confidence: CONFIDENCE.HIGH,
    queryTemplate: (n) => `"${n}" Australian Tourism Awards winner OR finalist`,
  },
  {
    id: 'ecotourism_australia',
    label: 'Ecotourism Australia',
    domains: ['ecotourism.org.au'],
    signalType: SIGNAL_TYPES.STAGE_3.CERTIFICATION,
    confidence: CONFIDENCE.HIGH,
    queryTemplate: (n) => `"${n}" Ecotourism Australia certification (Advanced OR ECO Destination)`,
  },
  {
    id: 'respecting_our_culture',
    label: 'Respecting Our Culture (ROC)',
    domains: ['ecotourism.org.au', 'respectingourculture.com.au'],
    signalType: SIGNAL_TYPES.STAGE_3.CERTIFICATION,
    confidence: CONFIDENCE.HIGH,
    queryTemplate: (n) => `"${n}" Respecting Our Culture certification ROC`,
  },
  {
    id: 'bushwalking_federation',
    label: 'Bushwalking Federation Australia',
    domains: ['bushwalkingaustralia.org', 'bushwalking.org.au'],
    signalType: SIGNAL_TYPES.STAGE_3.MEMBER_LISTING,
    confidence: CONFIDENCE.MEDIUM,
    queryTemplate: (n) => `"${n}" Bushwalking Federation Australia member operator`,
  },
  {
    id: 'australian_mountain_guides',
    label: 'Australian Mountain Guides Association',
    domains: ['amga.org.au', 'mountainguides.org.au'],
    signalType: SIGNAL_TYPES.STAGE_3.MEMBER_LISTING,
    confidence: CONFIDENCE.MEDIUM,
    queryTemplate: (n) => `"${n}" Australian Mountain Guides Association certified`,
  },
  {
    id: 'outdoor_council',
    label: 'Outdoor Council of Australia',
    domains: ['outdoorcouncil.asn.au'],
    signalType: SIGNAL_TYPES.STAGE_3.MEMBER_LISTING,
    confidence: CONFIDENCE.MEDIUM,
    queryTemplate: (n) => `"${n}" Outdoor Council of Australia operator register`,
  },
  {
    id: 'welcome_to_country',
    label: 'Welcome to Country (Aboriginal tourism portal)',
    domains: ['welcometocountry.com', 'welcometocountry.org'],
    signalType: SIGNAL_TYPES.STAGE_3.MEMBER_LISTING,
    confidence: CONFIDENCE.LOW,
    queryTemplate: (n) => `"${n}" Welcome to Country Aboriginal tourism listing`,
  },
  {
    id: 'nsw_aboriginal_tourism',
    label: 'NSW Aboriginal Tourism Operators Council',
    domains: ['nswaboriginaltourism.com.au', 'nswato.com.au'],
    signalType: SIGNAL_TYPES.STAGE_3.MEMBER_LISTING,
    confidence: CONFIDENCE.LOW,
    queryTemplate: (n) => `"${n}" NSW Aboriginal Tourism Operators Council`,
  },
  {
    id: 'karrkad_kanjdji',
    label: 'Karrkad Kanjdji Trust',
    domains: ['kkt.org.au', 'karrkadkanjdji.com'],
    signalType: SIGNAL_TYPES.STAGE_3.MEMBER_LISTING,
    confidence: CONFIDENCE.LOW,
    queryTemplate: (n) => `"${n}" Karrkad Kanjdji Trust supported operator`,
  },
]

/**
 * @param {object} ctx — pipeline context
 * @param {object} _supabase — unused
 * @returns {Promise<object[]>}
 */
export async function runStage3Institutional(ctx, _supabase) {
  const { candidate, runId, log } = ctx
  if (!candidate.name) {
    log(3, 'no candidate name; skipping')
    return []
  }

  const signals = []

  for (const body of INSTITUTIONAL_BODIES) {
    const matcher = makeHostMatcher(body.domains)
    const query = body.queryTemplate(candidate.name)

    let result
    try {
      result = await webSearchValidated({
        query,
        // 1 search per body (low max_uses — we don't want Anthropic
        // to expand the query and search broadly).
        maxUses: 1,
        // Pass allowed_domains so the underlying web_search tool
        // does its own pre-filter; the matcher is the post-hoc
        // hard filter.
        allowedDomains: body.domains,
        whitelistMatcher: matcher,
      })
    } catch (e) {
      log(3, `${body.label}: web_search error: ${e?.message || e}`)
      continue
    }

    if (result.hits.length === 0 && result.filteredOut === 0) {
      log(3, `${body.label}: no hits`)
      continue
    }

    log(3, `${body.label}: ${result.hits.length} validated hits, ${result.filteredOut} off-domain dropped`)

    for (const hit of result.hits) {
      if (!hit.url_resolved) {
        log(3, `${body.label}: dropped unresolved URL ${hit.url}`)
        continue
      }

      signals.push(buildSignal({
        candidateId:  candidate.id,
        stage:        3,
        signalType:   body.signalType,
        claimText:    hit.title
          ? `${body.label}: "${hit.title}"`
          : `Listed on ${body.label}`,
        sourceUrl:    hit.url,
        sourceExcerpt: hit.title || null,
        sourceLabel:  body.label,
        confidence:   body.confidence,
        urlResolved:  true,
        urlValidationStatus: hit.url_validation_status,
        rawData: {
          body:               body.id,
          body_label:         body.label,
          body_signal_type:   body.signalType,
          year:               extractYearFromTitle(hit.title) || extractYearFromUrl(hit.url),
          search_query:       query,
          page_age_raw:       hit.page_age,
        },
        runId,
      }))
    }
  }

  log(3, `stage 3 produced ${signals.length} signals across ${INSTITUTIONAL_BODIES.length} bodies`)
  return signals
}

// ─── helpers ─────────────────────────────────────────────────────

function extractYearFromTitle(title) {
  if (!title) return null
  const m = title.match(/\b(19|20)\d{2}\b/)
  return m ? parseInt(m[0], 10) : null
}

function extractYearFromUrl(url) {
  if (!url) return null
  const m = url.match(/\b(19|20)\d{2}\b/)
  return m ? parseInt(m[0], 10) : null
}
