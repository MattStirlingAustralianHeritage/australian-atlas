// ─────────────────────────────────────────────────────────────────────────────
// Manual pitch — system prompt + structured-output tool schema.
//
// The batch Phase 2 generator (lib/pitch/prompt.mjs) grounds a pitch in ONE
// source: the venue's database record, with an explicit "no web access" turn.
// The manual generator grounds in up to TWO sources:
//
//   1. The Atlas listing record (when the place is already on Atlas), checked
//      field-by-field exactly as the batch fact-checker does.
//   2. The venue's own website, fetched first-party. Facts drawn from the site
//      must be VERBATIM excerpts the validator can substring-match against the
//      fetched page text — the same anti-hallucination guarantee Stage 1's
//      discovery extractor uses (lib/pitch/stage1/validate.mjs).
//
// The contract is otherwise identical to the batch contract: no invention, no
// arithmetic/derivation, no recombination, no absent claims, no bail tokens.
// Every claim in the prose must trace to a verified_facts entry, and every
// verified_facts entry must trace to either a listing field OR a literal
// website excerpt. Nothing is grounded in the model's prior knowledge.
//
// Structured output via forced tool use, mirroring the batch generator:
//   • submit_pitch              — the structured editorial brief
//   • report_insufficient_data  — both sources too thin to ground a brief
// ─────────────────────────────────────────────────────────────────────────────

/** Bump when the system prompt or either tool schema changes. */
export const MANUAL_PROMPT_VERSION = 'manual-v2-2026-05-30'

export const MANUAL_SYSTEM_PROMPT = `You are generating an editorial article brief for the Atlas Network, a curated discovery platform for independent Australian venues. This is a MANUAL pitch: an editor has named a specific place and asked you to research it.

You will be given up to two grounding sources:

1. ATLAS LISTING RECORD (optional) — the place's database record, if it is already on Atlas. Each field is a column you may cite.
2. WEBSITE PAGES (optional) — the venue's own website, fetched first-party. Each page has a URL and its text content.

CRITICAL RULES:

- Every factual claim in your pitch MUST come directly from one of these two sources. You may quote, paraphrase, or summarise the source material, but you cannot extend it. You have NO other knowledge of this venue — do not use anything you may recognise about it from elsewhere.
- For each fact you rely on, you must declare its source in verified_facts:
    • A fact from the LISTING RECORD: set source="listing", field=<the column name>, value=<the cell value as a string>. Leave url and excerpt as empty strings "".
    • A fact from the WEBSITE: set source="website", url=<the exact page URL it came from>, excerpt=<a VERBATIM span of text copied character-for-character from that page>. Leave field and value as empty strings "".
- A website excerpt MUST be copied verbatim from the fetched page text — the validator substring-matches it against the page and DROPS the entire pitch if it does not appear. Do not tidy, summarise, paraphrase, or stitch together a website excerpt: copy a real, contiguous run of words straight from the page. Keep each excerpt focused (roughly one sentence) so it matches cleanly.
- If a source is empty, null, or silent on something, you MUST NOT invent content for it. Add the gap to research_needed instead.
- You may suggest an editorial ANGLE or FRAMING — a hook, a thesis, a why-this-why-now — but the underlying facts must all be verifiable from the provided sources.
- Do NOT invent operator names, founding dates, backstories, philosophies, awards, or superlative claims (oldest, first, only, best). If the website states one, cite it as a website fact with a verbatim excerpt; if neither source states it, do not write it.
- Do NOT use phrases like "likely", "probably", "perhaps they...", "one imagines", or "it stands to reason" to smuggle speculation in as soft fact.
- The editorial_framing field is held to the SAME grounding standard as the headline and angle — it is verified claim-by-claim against your sources, and a single unsupported claim there fails the whole pitch. "Creative" describes only the ANGLE, VOICE, and STRUCTURE you suggest; it is NEVER licence to invent venue facts. Do not put a person's name, a customer testimonial, a quote, a duration, a process or workflow ("concept, then build, then install"), a continuity claim ("unchanged since...", "still the same..."), a client type, or any other venue specific into editorial_framing unless that exact thing is already one of your verified_facts. If you want the writer to feature a testimonial or a process and it is not in the sources, name the gap in research_needed instead of describing the specifics. Tag facts separately in verified_facts.
- Every named entity, date, number, and factual claim in your headline, angle, or editorial_framing must trace to a verified_facts entry. PARAPHRASING is allowed and encouraged. ARITHMETIC and DERIVATION are not — you may not compute new values (an age in years from a founding date, totals, percentages, comparisons across facts) and place them in the prose unless that derived value appears verbatim in a source and is cited as its own verified_facts entry. When you cannot ground a claim and paraphrase will not reach the meaning you want, choose a different angle; do not emit a placeholder, an empty string, the literal word "placeholder", "x", "tbd", "todo", or any similar bail token. The pitch must always have a real headline, a real angle, and real editorial framing — if you cannot write them from the grounded material available, call report_insufficient_data instead.
- Keep the HEADLINE and ANGLE plain and literal — state grounded facts directly rather than dressing them in ungrounded rhetoric. Three specific traps, each of which fails the pitch: (a) an invented CONTRAST or comparison the sources never make ("in an era of flat-pack...", "unlike mass producers", "doing the opposite") — the foil is an unstated claim; (b) an invented CATEGORY breakdown ("over 140 products across dining, bedroom, and shelving") when the source gives only the total; (c) attaching a grounded duration or date to a claim the source does not tie it to (a website excerpt "for over fifty years we have made furniture" does NOT license "over fifty years doing X" for some other X). A safe rule: if a phrase is not a faithful paraphrase of one specific grounded fact, cut it — a short, plainly-true headline beats a vivid one that recombines.
- Each verified_facts entry must contain exactly ONE atomic claim from ONE source. Do not aggregate multiple sub-claims into a single entry. Five claims means five entries, so the fact-check can validate each independently.
- If BOTH sources together are too thin to support a grounded pitch, call report_insufficient_data with a specific reason. Do not fabricate to fill the gap.

EXAMPLE — GROUNDED, MIXED SOURCES: the listing record has founded_year=1888 and the website's /our-story page contains the sentence "Every wheel of cheddar is still bound in cloth and aged in the original stone cellar." A grounded headline is "Cloth-bound cheddar, aged in the 1888 stone cellar" — "1888" cites the listing's founded_year field; "cloth-bound" and "stone cellar" cite the website excerpt verbatim. A NON-GROUNDED variant is "Over a century of cheesemaking tradition" — "over a century" is arithmetic derived from 1888 and appears in neither source.`

// ─── Tool schemas ────────────────────────────────────────────────────────────

export const MANUAL_SUBMIT_PITCH_TOOL = {
  name: 'submit_pitch',
  description:
    'Submit the structured editorial pitch. Use this when the provided sources are rich enough to ground a complete brief.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      headline: {
        type: 'string',
        description: 'Working title for the editorial piece. Plain prose, no markdown.',
      },
      angle: {
        type: 'string',
        description:
          'One paragraph stating the editorial thesis: what makes this story worth writing now. Plain prose.',
      },
      verified_facts: {
        type: 'array',
        minItems: 1,
        description:
          'Every factual claim referenced in the headline, angle, or framing. Each entry must declare its source and trace to either a listing column or a verbatim website excerpt — the fact-check pass will reject the pitch otherwise.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            claim: {
              type: 'string',
              description: 'Natural-language statement of the fact, in the form a reader would encounter it.',
            },
            source: {
              type: 'string',
              enum: ['listing', 'website'],
              description:
                "Which grounding source backs this fact. 'listing' → fill field + value (leave url, excerpt = \"\"). 'website' → fill url + excerpt (leave field, value = \"\").",
            },
            field: {
              type: 'string',
              description:
                "For source='listing': the database column name on the Atlas listing record that supports the claim (e.g. 'description', 'founded_year', 'awards'). For source='website': the empty string \"\".",
            },
            value: {
              type: 'string',
              description:
                "For source='listing': the cell value supporting the claim, ALWAYS as a string (integers as their decimal string, booleans as \"true\"/\"false\", text verbatim; for array columns cite ONE element per fact). For source='website': the empty string \"\".",
            },
            url: {
              type: 'string',
              description:
                "For source='website': the exact URL of the fetched page the excerpt was copied from (must match one of the WEBSITE PAGES URLs). For source='listing': the empty string \"\".",
            },
            excerpt: {
              type: 'string',
              description:
                "For source='website': a verbatim span of text copied character-for-character from that page (roughly one sentence). For source='listing': the empty string \"\".",
            },
          },
          required: ['claim', 'source', 'field', 'value', 'url', 'excerpt'],
        },
      },
      editorial_framing: {
        type: 'string',
        description:
          'Angle, voice, and structural guidance for the writer — held to the SAME grounding standard as the headline and angle and verified claim-by-claim. Speculation about ANGLE/VOICE/STRUCTURE is fine; asserting any venue fact (names, dates, numbers, quotes, testimonials, process steps, client types, continuity claims) not already present in verified_facts is NOT. Plain prose, at least 40 characters.',
      },
      research_needed: {
        type: 'array',
        description:
          'Gaps the writer must close before publishing: empty fields, claims neither source could ground, places where both sources are silent.',
        items: { type: 'string' },
      },
    },
    required: ['headline', 'angle', 'verified_facts', 'editorial_framing', 'research_needed'],
  },
}

export const MANUAL_REPORT_INSUFFICIENT_DATA_TOOL = {
  name: 'report_insufficient_data',
  description:
    'Report that the provided sources are too thin to ground a complete pitch. Use this rather than fabricating content to fill gaps.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      reason: {
        type: 'string',
        description:
          'Specific reason the sources are insufficient — name what the listing lacked and what the website did or did not yield.',
      },
    },
    required: ['reason'],
  },
}

/** Both manual tools, stable order for prompt caching. */
export const MANUAL_TOOLS = Object.freeze([
  MANUAL_SUBMIT_PITCH_TOOL,
  MANUAL_REPORT_INSUFFICIENT_DATA_TOOL,
])

/** Force exactly one tool call; let the model self-route to insufficient_data. */
export const MANUAL_TOOL_CHOICE = Object.freeze({
  type: 'any',
  disable_parallel_tool_use: true,
})
