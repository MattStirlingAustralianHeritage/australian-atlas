// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 Stage 1 — substring validator.
//
// Architectural anti-hallucination guarantee. Before any INSERT into
// pitch_sources / pitch_characters / pitch_character_attributes / pitch_signals,
// every source_excerpt from the LLM output must substring-match the original
// fetched text from the URL it claims to come from.
//
// Spec: docs/pitch-system-phase3-design.md §Grounding Validation.
//   - Source URL must exist in fetched_pages — if not, reject the whole
//     character or signal
//   - source_excerpt must appear (case-insensitive, whitespace-normalised)
//     in the fetched text for that URL
//   - For characters with attributes, validate each attribute's source_excerpt
//     independently — a character can survive with only its valid attributes
//   - For implied-confidence attributes, the excerpt validation is the same;
//     the architectural rule is "the excerpt must exist in source", regardless
//     of the inference type
//   - Signals validate the same way — source_url must exist + source_excerpt
//     must substring-match
//
// Pure function. No I/O. No side effects.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} FetchedPage
 * @property {string} url
 * @property {string} text
 *
 * @typedef {Object} Attribute
 * @property {string} attribute_type
 * @property {string} attribute_text
 * @property {string} source_excerpt
 * @property {string} confidence  - 'explicit' | 'implied'
 *
 * @typedef {Object} Character
 * @property {string} name
 * @property {string} [role]
 * @property {string} source_url
 * @property {string} source_excerpt
 * @property {Attribute[]} attributes
 *
 * @typedef {Object} VenueSignal
 * @property {string} signal_type
 * @property {string} source_url
 * @property {string} source_excerpt
 * @property {Object} [signal_data]
 *
 * @typedef {Object} Extraction
 * @property {Character[]}   characters
 * @property {VenueSignal[]} venue_signals
 */

/**
 * Validate an LLM extraction against the fetched pages.
 *
 * @param {Extraction} extraction
 * @param {FetchedPage[]} fetchedPages
 * @returns {{
 *   valid: {
 *     characters: Character[],
 *     venue_signals: VenueSignal[],
 *   },
 *   invalid: Array<{
 *     kind: 'character' | 'signal' | 'attribute',
 *     reason: 'source_url_not_fetched' | 'excerpt_not_in_source' | 'attribute_excerpt_not_in_source',
 *     item: any,
 *     parent?: any,
 *   }>,
 *   stats: {
 *     characters_extracted: number,
 *     characters_validated: number,
 *     attributes_extracted: number,
 *     attributes_validated: number,
 *     signals_extracted: number,
 *     signals_validated: number,
 *   }
 * }}
 */
export function validateExtraction(extraction, fetchedPages) {
  // Defensive: defaults so callers don't have to pre-validate the shape
  const characters = Array.isArray(extraction?.characters) ? extraction.characters : []
  const venueSignals = Array.isArray(extraction?.venue_signals) ? extraction.venue_signals : []
  const pages = Array.isArray(fetchedPages) ? fetchedPages : []

  // Index fetched pages by URL for O(1) lookup, with text pre-normalised
  // so we don't re-normalise on every substring check.
  const pageIndex = new Map()
  for (const p of pages) {
    if (p?.url && typeof p.text === 'string') {
      pageIndex.set(p.url, normaliseText(p.text))
    }
  }

  const valid = { characters: [], venue_signals: [] }
  const invalid = []

  let attributesExtracted = 0
  let attributesValidated = 0

  // ── Characters ──────────────────────────────────────────────────────────
  for (const character of characters) {
    if (!character || typeof character !== 'object') continue

    const normSourceText = pageIndex.get(character.source_url)
    if (normSourceText === undefined) {
      invalid.push({
        kind: 'character',
        reason: 'source_url_not_fetched',
        item: character,
      })
      // Don't process attributes on a character whose source we never fetched
      attributesExtracted += Array.isArray(character.attributes) ? character.attributes.length : 0
      continue
    }

    if (!excerptInText(character.source_excerpt, normSourceText)) {
      invalid.push({
        kind: 'character',
        reason: 'excerpt_not_in_source',
        item: character,
      })
      attributesExtracted += Array.isArray(character.attributes) ? character.attributes.length : 0
      continue
    }

    // Character primary excerpt validates. Now sift attributes — surviving
    // attributes attach to the character; rejected ones go to invalid with
    // the parent character for context. A character with zero valid
    // attributes still survives if its primary excerpt validated.
    const rawAttributes = Array.isArray(character.attributes) ? character.attributes : []
    const survivingAttributes = []
    for (const attr of rawAttributes) {
      attributesExtracted++
      if (!attr || typeof attr !== 'object') {
        invalid.push({
          kind: 'attribute',
          reason: 'attribute_excerpt_not_in_source',
          item: attr,
          parent: character,
        })
        continue
      }
      // Attribute inherits character.source_url unless it ever carries its
      // own (the current schema doesn't expose source_url on attributes; the
      // attribute's source_excerpt is checked against the SAME page as the
      // character's source_url).
      if (excerptInText(attr.source_excerpt, normSourceText)) {
        attributesValidated++
        survivingAttributes.push(attr)
      } else {
        invalid.push({
          kind: 'attribute',
          reason: 'attribute_excerpt_not_in_source',
          item: attr,
          parent: character,
        })
      }
    }

    valid.characters.push({
      ...character,
      attributes: survivingAttributes,
    })
  }

  // ── Venue signals ──────────────────────────────────────────────────────
  for (const signal of venueSignals) {
    if (!signal || typeof signal !== 'object') continue

    const normSourceText = pageIndex.get(signal.source_url)
    if (normSourceText === undefined) {
      invalid.push({
        kind: 'signal',
        reason: 'source_url_not_fetched',
        item: signal,
      })
      continue
    }
    if (!excerptInText(signal.source_excerpt, normSourceText)) {
      invalid.push({
        kind: 'signal',
        reason: 'excerpt_not_in_source',
        item: signal,
      })
      continue
    }
    valid.venue_signals.push(signal)
  }

  return {
    valid,
    invalid,
    stats: {
      characters_extracted: characters.length,
      characters_validated: valid.characters.length,
      attributes_extracted: attributesExtracted,
      attributes_validated: attributesValidated,
      signals_extracted: venueSignals.length,
      signals_validated: valid.venue_signals.length,
    },
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Normalise text for substring matching per spec:
 *   - strip zero-width / word-joiner characters (no textual meaning)
 *   - fold typographic punctuation to ASCII (curly quotes, en/em dashes, …)
 *   - lowercase (case-insensitive)
 *   - collapse runs of whitespace (spaces, newlines, tabs) to a single space
 *   - trim leading/trailing whitespace
 *
 * The punctuation fold is load-bearing: source HTML renders curly quotes and
 * en/em dashes, while the LLM routinely emits straight quotes and hyphens in
 * its excerpts. Without folding, a near-verbatim excerpt fails the substring
 * gate purely on a ’-vs-' or —-vs-- mismatch. Folding equates visually
 * identical punctuation only — it never introduces letters or digits, so the
 * anti-hallucination guarantee (every word must exist in source) is preserved.
 *
 * The same normalisation runs on BOTH the source text (once per page, cached)
 * and the candidate excerpt (each check).
 */
export function normaliseText(s) {
  if (s == null) return ''
  return String(s)
    .replace(/[​‌‍⁠﻿]/g, '')
    .replace(/[‘’‚‛′‵`´]/g, "'")
    .replace(/[“”„‟″‶«»]/g, '"')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Substring-match an excerpt against a pre-normalised page text.
 * Returns false on null/empty inputs by construction (an empty excerpt
 * trivially "matches" everywhere; reject defensively).
 */
function excerptInText(excerpt, normSourceText) {
  if (typeof excerpt !== 'string') return false
  const normExcerpt = normaliseText(excerpt)
  if (normExcerpt.length === 0) return false
  return normSourceText.includes(normExcerpt)
}
