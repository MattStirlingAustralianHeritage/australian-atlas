/**
 * Stage 4 — Atlas internal cross-references.
 *
 * Queries the existing Atlas Network for any existing mention of
 * this operator. Two source classes:
 *
 *   1. Articles (portal.articles) — published editorial mentions.
 *      Matched by case-insensitive substring against article title +
 *      excerpt + body. Articles with the operator in their
 *      listing_tags are NOT matched here (those would be Way listings
 *      that already exist; Way candidates are pre-listing).
 *
 *   2. Field trail listings (field.places where place_type implies
 *      a trail — bush_walk, coastal_walk). A guided walk operator
 *      named in a Field trail's description is a strong cross-link
 *      signal that the operator guides on a known Atlas trail.
 *
 * Match strategy: substring on the operator's name in the relevant
 * text field. Case-insensitive. We don't try fuzzy matching here —
 * Stage 4 is precise, not exhaustive. If the operator name appears
 * verbatim in an Atlas article, that's editorial validation; if it
 * doesn't, that's a Stage 6 silence signal candidate.
 *
 * Confidence: HIGH for both sub-classes (matching against our own
 * curated DB).
 */

import { SIGNAL_TYPES, CONFIDENCE, buildSignal } from './signals.js'

// Minimum operator name length to substring-match against. Names
// shorter than this produce too many false positives in articles
// (e.g. "Bay Walks" would match any article mentioning "bay walks").
const MIN_NAME_FOR_MATCH = 6

/**
 * @param {object} ctx — pipeline context (candidate, runId, log, fieldClient)
 * @param {object} supabase — portal master DB admin client
 * @returns {Promise<object[]>} signals (ready for persistSignals)
 */
export async function runStage4AtlasInternal(ctx, supabase) {
  const { candidate, runId, log, fieldClient } = ctx
  const signals = []
  const name = (candidate.name || '').trim()
  if (name.length < MIN_NAME_FOR_MATCH) {
    log(4, `operator name "${name}" too short for safe substring match (min ${MIN_NAME_FOR_MATCH}); skipping`)
    return signals
  }

  // ─── 4.1 — Articles ──────────────────────────────────────────
  // Substring match across title, excerpt, body. Restrict to
  // published articles only.
  const { data: articleHits, error: artErr } = await supabase
    .from('articles')
    .select('id, title, excerpt, slug, published_at, listing_tags')
    .eq('status', 'published')
    .or(`title.ilike.%${escapeLike(name)}%,excerpt.ilike.%${escapeLike(name)}%,body.ilike.%${escapeLike(name)}%`)
    .limit(20)

  if (artErr) {
    log(4, `articles query error: ${artErr.message}`)
    // Don't throw — articles may be empty or RLS may reject; pipeline
    // continues with whatever Stage 4 can produce. The orchestrator
    // catches stage exceptions; we choose to return partial here.
  } else {
    for (const a of (articleHits || [])) {
      // Build a portal-internal source URL. Articles live at
      // /journal/<slug> on the portal. Mark url_resolved=true since
      // Atlas-internal references don't go through web validation —
      // we know the article exists because we just queried it.
      const sourceUrl = `https://australianatlas.com.au/journal/${a.slug}`

      // Excerpt: pull a short window around the operator name from
      // the title or excerpt. Body is heavier to fetch and we don't
      // need it for source-binding.
      const haystack = `${a.title || ''} — ${a.excerpt || ''}`
      const excerpt = extractWindowAround(haystack, name, 80) || a.title

      signals.push(buildSignal({
        candidateId:  candidate.id,
        stage:        4,
        signalType:   SIGNAL_TYPES.STAGE_4.ARTICLE_MENTION,
        claimText:    `Mentioned in Atlas Network journal article "${a.title}"`,
        sourceUrl,
        sourceExcerpt: excerpt,
        sourceLabel:  `Atlas journal: "${a.title}"`,
        confidence:   CONFIDENCE.HIGH,
        urlResolved:  true,
        urlValidationStatus: 'internal',
        rawData: {
          atlas_entity_type: 'article',
          atlas_entity_id:   a.id,
          published_at:      a.published_at,
        },
        runId,
      }))
    }
    log(4, `found ${(articleHits || []).length} article mentions`)
  }

  // ─── 4.2 — Field trail listings ──────────────────────────────
  // Field Atlas lives on a separate Supabase project. If no client
  // is provided (e.g. running in a context without Field credentials),
  // skip with a warning. Cross-project FK isn't possible; we read by
  // name + description substring just like articles.
  if (!fieldClient) {
    log(4, 'no Field Atlas client provided; skipping field.places cross-reference')
  } else {
    // Field's `places` table has columns: id, name, slug, description,
    // place_type. Trail-relevant types per migration 001 schema:
    // bush_walk, coastal_walk, national_park (some), gorge (some).
    const trailTypes = ['bush_walk', 'coastal_walk']
    try {
      const { data: trailHits, error: fieldErr } = await fieldClient
        .from('places')
        .select('id, name, slug, description, place_type')
        .in('place_type', trailTypes)
        .ilike('description', `%${escapeLike(name)}%`)
        .limit(20)

      if (fieldErr) {
        log(4, `field.places query error: ${fieldErr.message}`)
      } else {
        for (const p of (trailHits || [])) {
          const sourceUrl = `https://fieldatlas.com.au/places/${p.slug}`
          const excerpt = extractWindowAround(p.description || '', name, 80) || p.name
          signals.push(buildSignal({
            candidateId:  candidate.id,
            stage:        4,
            signalType:   SIGNAL_TYPES.STAGE_4.FIELD_TRAIL_MENTION,
            claimText:    `Named in Field Atlas trail listing "${p.name}" (${p.place_type})`,
            sourceUrl,
            sourceExcerpt: excerpt,
            sourceLabel:  `Field Atlas trail: "${p.name}"`,
            confidence:   CONFIDENCE.HIGH,
            urlResolved:  true,
            urlValidationStatus: 'internal',
            rawData: {
              atlas_entity_type: 'field_place',
              atlas_entity_id:   p.id,
              place_type:        p.place_type,
            },
            runId,
          }))
        }
        log(4, `found ${(trailHits || []).length} Field trail mentions`)
      }
    } catch (e) {
      // Field client errors (network, auth) are non-fatal.
      log(4, `field.places fetch error: ${e?.message || e}`)
    }
  }

  return signals
}

// ─── helpers ─────────────────────────────────────────────────────

// Escape % and _ in a substring before passing to ilike. Without
// this, an operator name containing a literal underscore would
// over-match.
function escapeLike(s) {
  return String(s).replace(/[%_\\]/g, '\\$&')
}

// Pull a window of N chars around the first occurrence of `needle`
// in `haystack`. Returns null if not found.
function extractWindowAround(haystack, needle, windowSize) {
  if (!haystack || !needle) return null
  const lower = haystack.toLowerCase()
  const idx = lower.indexOf(needle.toLowerCase())
  if (idx < 0) return null
  const start = Math.max(0, idx - windowSize)
  const end = Math.min(haystack.length, idx + needle.length + windowSize)
  let snippet = haystack.slice(start, end).trim()
  if (start > 0) snippet = '…' + snippet
  if (end < haystack.length) snippet = snippet + '…'
  return snippet
}
