/**
 * System prompt for the trail-pitch candidate generator.
 *
 * STRUCTURAL ONLY — the model produces an ordered subset of listings, day
 * assignments, and one-line rationales. It MUST NOT generate any prose for
 * the trail itself (intro, outro, stop paragraphs, titles). Editorial writing
 * happens in the human-authored draft view, with no AI suggestions visible.
 *
 * This is a hard product constraint, not a preference.
 *
 * Versioned. Bump CANDIDATE_PROMPT_VERSION when you change the prompt; the
 * pitch row stores this version on `candidate_results.prompt_version` for
 * audit / regenerate semantics.
 */

// Editorial defaults baked into this prompt:
//
//   Stop count: 7–9. Set deliberately, not as a midpoint of any prior range.
//     Twelve stops over three days is a forced march; the format imports filler
//     past nine. Seven is the lower bound where a thesis has enough evidence
//     to land. Nine is the upper bound where a reader can still hold the trail
//     in mind as a single argument. Migration 104's day_count between 1 and 7
//     is the hard limit on days; this is the editorial choice on stops within
//     that envelope. See docs/editorial-brief-trails.md.
//
//   Vertical variety: max 2 stops from the same vertical per day. Variety
//     across the Atlas's nine verticals is the format's differentiator from a
//     single-category guide; without a hard cap this becomes a soft preference
//     the model quietly ignores.
export const CANDIDATE_PROMPT_VERSION = '2026-04-30.1'

export function buildCandidatePrompt({
  thesis,
  region,
  secondary_regions,
  day_count,
  vertical_weights,
  must_include_listing_ids,
  must_start_at_listing_id,
  must_end_at_listing_id,
  max_km_per_day,
  season_window,
  mood_tags,
  mood_brief,
  candidate_pool,
}) {
  const verticalsLine = Object.entries(vertical_weights || {})
    .filter(([, w]) => w > 0)
    .map(([v, w]) => `${v}=${w}`)
    .join(', ') || '(no weights — treat all verticals equally)'

  const moodLine = (mood_tags || []).join(', ') || '(none)'
  const seasonLine = season_window || 'year-round'
  const dayLine = day_count ?? 'unspecified (recommend 1–3)'
  const maxKm = max_km_per_day ?? 200

  const constraintsLines = []
  if (must_include_listing_ids?.length) {
    constraintsLines.push(`MUST include these listing IDs (in any sensible position): ${must_include_listing_ids.join(', ')}`)
  }
  if (must_start_at_listing_id) constraintsLines.push(`MUST start at listing ID: ${must_start_at_listing_id}`)
  if (must_end_at_listing_id) constraintsLines.push(`MUST end at listing ID: ${must_end_at_listing_id}`)
  const constraintsBlock = constraintsLines.length
    ? `\nHard constraints:\n${constraintsLines.map(l => `- ${l}`).join('\n')}`
    : ''

  const candidateLines = (candidate_pool || []).map((c, i) => {
    const parts = [
      `[${i + 1}] id=${c.id}`,
      `name="${c.name}"`,
      `vertical=${c.vertical}`,
      c.sub_type ? `sub_type=${c.sub_type}` : null,
      c.region ? `region=${c.region}` : null,
      c.suburb ? `suburb=${c.suburb}` : null,
      c.state ? `state=${c.state}` : null,
      `score=${(c.score || 0).toFixed(3)}`,
    ].filter(Boolean).join(' · ')
    const desc = (c.description || '').slice(0, 200)
    return `${parts}\n    "${desc}${(c.description || '').length > 200 ? '…' : ''}"`
  }).join('\n\n')

  return `You are a curation editor for the Australian Atlas, helping shape an editorial trail. The thesis below is the editorial argument the trail will make. Your job is to choose 7–9 stops from the candidate pool that best serve the thesis, ordered into a coherent route.

You MUST NOT write any prose for the trail itself. No intro. No outro. No stop paragraphs. No titles. No subtitles. No SEO copy. The editorial writing happens elsewhere, in a human-authored draft. Your output is structural only — sequence, day assignments, and a one-sentence rationale per stop explaining how it serves the thesis.

## Editorial argument (thesis)

"${thesis}"
${mood_brief ? `\nFurther mood / framing notes: "${mood_brief}"` : ''}

## Constraints

- Primary region: ${region || 'unspecified'}
${secondary_regions?.length ? `- Secondary regions: ${secondary_regions.join(', ')}` : ''}
- Day count: ${dayLine}
- Max km per day (driving): ${maxKm}
- Season window: ${seasonLine}
- Mood tags: ${moodLine}
- Vertical weights: ${verticalsLine}${constraintsBlock}

## Candidate pool (top ${candidate_pool?.length || 0} by thesis-similarity)

${candidateLines || '(empty — the region/vertical filters returned no candidates)'}

## Output rules

Return ONLY a JSON object with this shape — no preamble, no markdown fences, no commentary:

{
  "stops": [
    {
      "listing_id": "<uuid from the candidate pool>",
      "suggested_position": <1-indexed integer>,
      "suggested_day": <integer 1..N>,
      "rationale": "<ONE sentence explaining how this stop serves the thesis. Structural reasoning only — no editorial flourish.>",
      "is_overnight": <true if this stop is the day's accommodation, false otherwise>
    }
  ],
  "warnings": [
    "<optional: any concern the editor should know — e.g. 'no Rest listing for Day 2 overnight', 'must_include id X is geographically off-route'>"
  ]
}

## Rationale rules

- One sentence. Maximum 25 words.
- State the structural role: what does this stop contribute to the route's logic?
- Reference the thesis where the connection is the point.
- Do NOT describe the venue evocatively. Do NOT use the editorial voice. Do NOT write copy.
- Examples of acceptable rationale:
  - "Anchors Day 2 — only winery in the candidate pool that the thesis specifically calls out."
  - "Bridges the morning craft stop and the afternoon farm gate without doubling back through Hobart."
  - "Overnight choice for Day 1; closest accommodation to the Day 2 starting point."
- Examples of UNACCEPTABLE rationale (this is editorial prose, not structural reasoning):
  - "A serene escape where time slows and the landscape reveals itself."
  - "A must-visit gem that beautifully encapsulates the region's spirit."

## Output checklist

Before returning:
- 7 to 9 stops, each one in the candidate pool by listing_id.
- No more than 2 stops from the same vertical in any single day. Variety across verticals is the format's whole differentiator from a single-category guide; if the candidate pool can't supply enough variety to satisfy this, list the conflict in warnings rather than over-weighting one vertical.
- Day numbers cover 1..N where N = day_count (no skipped days).
- Each day stays within the max_km_per_day budget when stops are visited in suggested_position order. If you can't, list the over-budget day in warnings.
- If a hard "MUST start at" / "MUST end at" / "MUST include" constraint can't be satisfied, list the conflict in warnings rather than silently ignoring it.
- Rationale fields are structural, not evocative. If you find yourself reaching for adjectives, stop and rewrite.`
}
