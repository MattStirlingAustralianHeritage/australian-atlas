// lib/pitch/storyIdea.mjs
//
// Single source of truth for turning a kept pitch into a story_ideas row, so
// the auto-triage keep (app/api/admin/pitches) and the manual researcher keep
// (app/api/admin/pitches/manual) carry the SAME structured payload through to
// the Editorial Queue (/admin/editorial). Every field the Pitch Triage shows is
// preserved here — headline, angle, editorial framing, verified facts, research
// needed, supporting venues, scores, slot type, and a full provenance snapshot.
//
// Requires the structured columns added in migration 165.

/** Coerce to a plain array (jsonb columns accept JS arrays directly). */
function asArray(v) {
  return Array.isArray(v) ? v : []
}

/** Trim to a non-empty string, else null. */
function asText(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** Clamp a score to an int in [0, 100], else null. */
function asScore(v) {
  if (v == null) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(100, Math.round(n)))
}

/**
 * Build the story_ideas insert payload from a pitch object + context.
 *
 * @param {Object} pitch  The pitch source. For auto-triage this is the full
 *   `pitches` row (carries scores, slot_type, supporting_listing_ids). For the
 *   manual researcher this is the researched `pitch_data` (headline, angle,
 *   editorial_framing, verified_facts, research_needed — no scores).
 * @param {Object} ctx
 * @param {string|null} [ctx.venueName]
 * @param {string|null} [ctx.region]
 * @param {string|null} [ctx.listingId]  anchor listing id
 * @param {string|null} [ctx.vertical]
 * @param {string|null} [ctx.slotType]   overrides pitch.slot_type (manual path)
 * @param {string}      [ctx.source]     'pitch' | 'manual_pitch'
 * @param {string|null} [ctx.pitchId]    pitches.id (auto) or null (manual)
 * @param {Object|null} [ctx.snapshot]   full snapshot to store (defaults to pitch)
 * @returns {Object} a story_ideas insert payload
 */
export function buildStoryIdeaFromPitch(pitch, ctx = {}) {
  const p = pitch && typeof pitch === 'object' ? pitch : {}
  return {
    venue_name: ctx.venueName ?? null,
    listing_id: ctx.listingId ?? null,
    vertical: ctx.vertical ?? null,
    region: ctx.region ?? null,

    // The headline is the proposed title; story_angle is the hook. Keeping them
    // in separate columns (rather than conflating into story_angle/notes) lets
    // the queue show both and frees notes for genuine human editorial notes.
    headline: asText(p.headline),
    story_angle: asText(p.angle),
    editorial_framing: asText(p.editorial_framing),

    // The research backbone — the whole reason this hand-off must be lossless.
    verified_facts: asArray(p.verified_facts),
    research_needed: asArray(p.research_needed),
    supporting_listing_ids: asArray(p.supporting_listing_ids),

    candidate_score: asScore(p.candidate_score),
    confidence_score: asScore(p.confidence_score),
    slot_type: asText(ctx.slotType ?? p.slot_type),

    pitch_id: ctx.pitchId ?? null,
    pitch_snapshot: ctx.snapshot ?? p,

    notes: null, // reserved for human editorial notes added on the queue
    source: ctx.source || 'pitch',
    status: 'in_progress',
  }
}
