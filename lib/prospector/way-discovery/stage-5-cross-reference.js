/**
 * Stage 5 — Cross-reference detection.
 *
 * Scans the first-party text fetched in Stage 1 for mentions of OTHER
 * Atlas Network operators or trails. The use case from the master
 * prompt: an operator's website mentions the Cape to Cape Track or
 * names another operator they collaborate with — that's editorial
 * cross-link potential.
 *
 * Match strategy: load known Atlas operators (Way listings + Way
 * candidates) and known Field trails, then scan ctx.firstPartyText
 * for substring matches. Confidence is MEDIUM by default — a mention
 * in first-party text supports the cross-link but isn't itself
 * editorial validation.
 *
 * Stage 5 depends on Stage 1 having populated ctx.firstPartyText. If
 * Stage 1 returned no text (operator website unreachable, or fetch
 * skipped), Stage 5 produces zero signals — that's correct, not a
 * failure.
 *
 * Self-mention guard: the candidate's own name is excluded from
 * cross-reference matching. Otherwise an operator's website
 * mentioning itself by name would round-trip into a self-cross-ref.
 */

import { SIGNAL_TYPES, CONFIDENCE, buildSignal } from './signals.js'

const MIN_NAME_FOR_MATCH = 6

/**
 * @param {object} ctx — pipeline context (candidate, runId, log,
 *   firstPartyText, fieldClient)
 * @param {object} supabase — portal master DB admin client
 * @returns {Promise<object[]>}
 */
export async function runStage5CrossReference(ctx, supabase) {
  const { candidate, runId, log, firstPartyText, fieldClient } = ctx
  const signals = []

  if (!firstPartyText || firstPartyText.length < 200) {
    log(5, `firstPartyText too short (${firstPartyText?.length || 0} chars); skipping cross-reference scan`)
    return signals
  }

  const haystackLower = firstPartyText.toLowerCase()
  const ownNameLower = (candidate.name || '').toLowerCase().trim()

  // ─── 5.1 — Way operators (existing listings) ─────────────────
  // Pull Way listings from portal listings + their slugs. We need
  // names to match by substring. Limit to active Way listings; we
  // don't cross-reference against rejected candidates.
  const { data: wayListings, error: wayErr } = await supabase
    .from('listings')
    .select('id, name, slug')
    .eq('vertical', 'way')
    .eq('status', 'active')
    .limit(500)

  if (wayErr) {
    log(5, `way listings query error: ${wayErr.message}`)
  } else {
    for (const op of (wayListings || [])) {
      if (!op.name || op.name.length < MIN_NAME_FOR_MATCH) continue
      if (op.name.toLowerCase() === ownNameLower) continue

      const idx = haystackLower.indexOf(op.name.toLowerCase())
      if (idx < 0) continue

      signals.push(buildSignal({
        candidateId:  candidate.id,
        stage:        5,
        signalType:   SIGNAL_TYPES.STAGE_5.OPERATOR_MENTION,
        claimText:    `First-party text mentions Atlas operator "${op.name}"`,
        sourceUrl:    candidate.website_url,
        sourceExcerpt: extractWindow(firstPartyText, idx, op.name.length, 80),
        sourceLabel:  `${candidate.name} website (cross-ref to ${op.name})`,
        confidence:   CONFIDENCE.MEDIUM,
        urlResolved:  true,           // first-party text is already validated by Stage 1
        urlValidationStatus: 'first_party_via_stage_1',
        rawData: {
          referenced_entity_type: 'operator',
          referenced_entity_id:   op.id,
          referenced_name:        op.name,
          referenced_slug:        op.slug,
        },
        runId,
      }))
    }
    log(5, `${(wayListings || []).length} Way operators scanned, ${signals.length} mentions found so far`)
  }

  // ─── 5.2 — Field trails ──────────────────────────────────────
  if (!fieldClient) {
    log(5, 'no Field Atlas client provided; skipping field trail cross-reference')
    return signals
  }

  try {
    const trailTypes = ['bush_walk', 'coastal_walk']
    const { data: trails, error: trailErr } = await fieldClient
      .from('places')
      .select('id, name, slug, place_type')
      .in('place_type', trailTypes)
      .limit(500)

    if (trailErr) {
      log(5, `field.places query error: ${trailErr.message}`)
      return signals
    }

    let trailMatchCount = 0
    for (const t of (trails || [])) {
      if (!t.name || t.name.length < MIN_NAME_FOR_MATCH) continue
      const idx = haystackLower.indexOf(t.name.toLowerCase())
      if (idx < 0) continue

      signals.push(buildSignal({
        candidateId:  candidate.id,
        stage:        5,
        signalType:   SIGNAL_TYPES.STAGE_5.TRAIL_MENTION,
        claimText:    `First-party text mentions Field Atlas trail "${t.name}"`,
        sourceUrl:    candidate.website_url,
        sourceExcerpt: extractWindow(firstPartyText, idx, t.name.length, 80),
        sourceLabel:  `${candidate.name} website (cross-ref to ${t.name})`,
        confidence:   CONFIDENCE.MEDIUM,
        urlResolved:  true,
        urlValidationStatus: 'first_party_via_stage_1',
        rawData: {
          referenced_entity_type: 'trail',
          referenced_entity_id:   t.id,
          referenced_name:        t.name,
          referenced_slug:        t.slug,
          place_type:             t.place_type,
        },
        runId,
      }))
      trailMatchCount++
    }
    log(5, `${(trails || []).length} Field trails scanned, ${trailMatchCount} mentions found`)
  } catch (e) {
    log(5, `field.places fetch error: ${e?.message || e}`)
  }

  return signals
}

// ─── helpers ─────────────────────────────────────────────────────

function extractWindow(text, idx, matchLen, windowSize) {
  const start = Math.max(0, idx - windowSize)
  const end = Math.min(text.length, idx + matchLen + windowSize)
  let snippet = text.slice(start, end).trim().replace(/\s+/g, ' ')
  if (start > 0) snippet = '…' + snippet
  if (end < text.length) snippet = snippet + '…'
  return snippet
}
