// ─────────────────────────────────────────────────────────────────────────────
// Source-binding for operator-fed descriptions.
//
// The pitch system (lib/pitch/fact-check.mjs) validates STRUCTURED triples
// ({claim, field, value}) the model emits against source columns. Here the unit
// under test is the generated PROSE itself: we cannot trust the model to
// honestly self-report its claims, so we extract the checkable claims FROM the
// finished text and require each to trace back to a submitted fact.
//
// Same anti-hallucination guarantee, same match strategy as the pitch pass:
// case-insensitive, whitespace-normalised substring matching. A draft that does
// not pass cannot be marked publishable; empty source fails by construction.
//
// What we extract and how strictly we treat it:
//
//   • Numbers (3+ digits) → HARD FAIL if not grounded. Years and large counts
//     are the highest-signal invented facts (a fabricated founding date is the
//     canonical hallucination). Small 1–2 digit counts are left alone: they ride
//     along in natural phrasing ("two rooms") and carry high false-positive risk.
//   • Multi-word proper nouns (2+ capitalised tokens, lowercase connectors
//     allowed) → HARD FAIL if not grounded. "Gertrude Street", "Mount Buller":
//     specific, located, and rarely produced by accident.
//   • Single proper noun after a locative/naming trigger ("in Fitzroy") → WARNING
//     only. Single capitalised words false-positive on sentence starts and common
//     words, so the admin approval gate is the backstop here, not a hard block.
//
// Each claim must ground within a SINGLE source string — we never concatenate
// fields, so a number from one fact and a name from another can't be spuriously
// stitched into a match.
//
// Pure functions. No I/O. No side effects.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Collapse internal whitespace runs to a single space, trim, lowercase.
 * Identical to lib/pitch/fact-check.mjs so matching behaves the same everywhere.
 */
export function normaliseText(s) {
  return String(s).replace(/\s+/g, ' ').trim().toLowerCase()
}

// The fact keys that can ground a claim, in form order. established_year and
// products_operators_named are handled specially below.
const PROSE_FACT_KEYS = [
  'building_description',
  'what_you_book',
  'design_fitting_detail',
  'where_it_sits',
  'ownership_transition_note',
  // The operator's free-text rewrite request is operator-supplied source too:
  // anything they asked us to cover can legitimately ground a claim in the prose.
  'coverage_request',
]

/**
 * Build the array of normalised source strings a claim may ground against. Each
 * fact field contributes its own entry (kept separate on purpose — see header),
 * each named product its own entry, and established_year its stringified value.
 *
 * @param {Object} facts - A row/shape from operator_facts.
 * @returns {string[]} normalised, non-empty source strings.
 */
export function buildSourceStrings(facts) {
  if (!facts || typeof facts !== 'object' || Array.isArray(facts)) return []
  const out = []

  for (const key of PROSE_FACT_KEYS) {
    const v = facts[key]
    if (typeof v === 'string' && v.trim().length > 0) out.push(normaliseText(v))
  }

  // established_year: an INT in the schema. Stringify so a year in the prose can
  // ground against it. Absent year ⇒ no source string ⇒ any year in the prose
  // fails, which is exactly the invented-founding-date guard.
  if (facts.established_year !== null && facts.established_year !== undefined && facts.established_year !== '') {
    const yearStr = normaliseText(String(facts.established_year))
    if (yearStr.length > 0) out.push(yearStr)
  }

  // Named products/makers: each its own source string.
  if (Array.isArray(facts.products_operators_named)) {
    for (const p of facts.products_operators_named) {
      if (typeof p === 'string' && p.trim().length > 0) out.push(normaliseText(p))
    }
  }

  // Guided-interview answers ("Your Story", rolled into the description
  // intake): operator-supplied prose, so each answer may ground a claim —
  // kept separate per answer, same as every other field.
  if (facts.story_answers && typeof facts.story_answers === 'object' && !Array.isArray(facts.story_answers)) {
    for (const v of Object.values(facts.story_answers)) {
      if (typeof v === 'string' && v.trim().length > 0) out.push(normaliseText(v))
    }
  }

  return out
}

// ── Claim extraction ─────────────────────────────────────────────────────────

// Lowercase tokens allowed to sit *between* capitalised words without breaking a
// multi-word proper noun ("Bank of England", "Salt and Pepper", "Mont de Marsan").
const CONNECTORS = new Set(['of', 'the', 'and', 'on', 'at', 'by', 'upon', 'de', 'la', 'le', 'van', 'von', '&'])

// Words that, when they precede a single capitalised token, mark it as a likely
// place/name claim worth surfacing to the admin (warning, not a hard fail).
const NAME_TRIGGERS = new Set(['in', 'on', 'at', 'near', 'by', 'from', 'off', 'called', 'named'])

/**
 * Pull numeric tokens of 3+ digits out of the text. Digit grouping separators
 * are stripped first so "1,200" reads as "1200".
 * @returns {string[]}
 */
export function extractNumbers(text) {
  const cleaned = String(text || '').replace(/(\d),(\d)/g, '$1$2')
  return cleaned.match(/\d{3,}/g) || []
}

function isCapitalised(w) {
  return /^[A-Z]/.test(w)
}

/**
 * Tokenise into words, each tagged with the raw text that precedes it. The gap
 * is what lets us tell "Gertrude Street" (one space — same phrase) from
 * "...Fitzroy. A long..." (period + newline — different sentences): a proper-noun
 * run may only continue across a gap of pure spaces/tabs.
 *
 * @returns {Array<{word:string, gapBefore:string}>}
 */
function tokensWithGaps(text) {
  const s = String(text || '')
  const re = /[A-Za-z][A-Za-z'’-]*/g
  const toks = []
  let m
  let prevEnd = 0
  while ((m = re.exec(s)) !== null) {
    toks.push({ word: m[0], gapBefore: s.slice(prevEnd, m.index) })
    prevEnd = m.index + m[0].length
  }
  return toks
}

// A gap that does NOT break a capitalised run: one or more spaces/tabs only. Any
// punctuation, comma, or newline in the gap ends the run.
const CLEAN_GAP = /^[ \t]+$/

/**
 * Extract proper-noun claims from prose.
 *
 *   { multi:  string[] }  — multi-word proper nouns (hard-fail candidates)
 *   { single: string[] }  — single proper nouns after a trigger (warning only)
 *
 * Runs of capitalised words (lowercase connectors allowed in the gaps) of length
 * ≥2 are "multi". A lone capitalised word is "single" only when the immediately
 * preceding lowercase word is a locative/naming trigger in the same clause —
 * otherwise it's almost certainly a sentence start or an ordinary word, and we
 * ignore it. Runs never cross punctuation or line breaks.
 */
export function extractProperNouns(text) {
  const toks = tokensWithGaps(text)
  const multi = []
  const single = []

  let i = 0
  while (i < toks.length) {
    if (isCapitalised(toks[i].word)) {
      // Greedily extend: Cap (connector Cap)* — but only across clean gaps, and
      // a connector counts only if itself clean-gapped and followed by a clean-
      // gapped capitalised token (so a trailing "of" isn't swallowed).
      const run = [toks[i].word]
      let j = i + 1
      while (j < toks.length && CLEAN_GAP.test(toks[j].gapBefore)) {
        if (isCapitalised(toks[j].word)) {
          run.push(toks[j].word); j++
        } else if (
          CONNECTORS.has(toks[j].word.toLowerCase()) &&
          j + 1 < toks.length &&
          CLEAN_GAP.test(toks[j + 1].gapBefore) &&
          isCapitalised(toks[j + 1].word)
        ) {
          run.push(toks[j].word.toLowerCase()); run.push(toks[j + 1].word); j += 2
        } else {
          break
        }
      }
      if (run.length >= 2) {
        multi.push(run.join(' '))
      } else {
        // Lone capitalised token: keep only if the previous word is a naming
        // trigger sitting in the same clause (clean gap before this token).
        const prev = i > 0 ? toks[i - 1].word.toLowerCase() : null
        if (prev && NAME_TRIGGERS.has(prev) && CLEAN_GAP.test(toks[i].gapBefore)) single.push(run[0])
      }
      i = j
    } else {
      i++
    }
  }
  return { multi, single }
}

// Lenient variants of a proper noun for matching: as-is, leading article
// stripped, trailing possessive stripped. All normalised.
function nounVariants(noun) {
  const base = normaliseText(noun)
  const variants = new Set([base])
  const noArticle = base.replace(/^(the|a|an)\s+/, '')
  variants.add(noArticle)
  for (const v of [base, noArticle]) {
    variants.add(v.replace(/['’]s$/, '').replace(/['’]$/, ''))
  }
  return [...variants].filter(v => v.length > 0)
}

function groundedIn(needle, sourceStrings) {
  const n = normaliseText(needle)
  if (n.length === 0) return true
  return sourceStrings.some(src => src.includes(n))
}

function nounGroundedIn(noun, sourceStrings) {
  return nounVariants(noun).some(v => sourceStrings.some(src => src.includes(v)))
}

/**
 * Validate that every hard claim in `text` traces to a submitted fact.
 *
 * @param {string} text  - The generated description prose.
 * @param {Object} facts - operator_facts shape.
 * @param {string[]} [extraSources] - Additional prose that may ground a claim.
 *   The rewrite path passes the previously PUBLISHED description here: those
 *   claims were already admin-approved, so a revision keeping them must not
 *   fail the gate. Each entry is one source string (claims cannot stitch
 *   across entries, same as fact fields).
 * @returns {{
 *   passed: boolean,
 *   failed_claims: Array<{type:string, value:string, reason:string}>,
 *   warnings: Array<{type:string, value:string, reason:string}>,
 * }}
 */
export function validateSourceBinding(text, facts, extraSources = []) {
  const sourceStrings = [
    ...buildSourceStrings(facts),
    ...(Array.isArray(extraSources) ? extraSources : [])
      .filter(s => typeof s === 'string' && s.trim().length > 0)
      .map(normaliseText),
  ]
  const failed_claims = []
  const warnings = []

  const prose = String(text || '')
  if (prose.trim().length === 0) {
    return {
      passed: false,
      failed_claims: [{ type: 'text', value: '', reason: 'empty_text' }],
      warnings,
    }
  }

  // Numbers (3+ digits) — hard fail.
  for (const num of extractNumbers(prose)) {
    if (!groundedIn(num, sourceStrings)) {
      failed_claims.push({ type: 'number', value: num, reason: 'number_not_in_facts' })
    }
  }

  // Proper nouns.
  const { multi, single } = extractProperNouns(prose)
  for (const noun of multi) {
    if (!nounGroundedIn(noun, sourceStrings)) {
      failed_claims.push({ type: 'proper_noun', value: noun, reason: 'proper_noun_not_in_facts' })
    }
  }
  for (const noun of single) {
    if (!nounGroundedIn(noun, sourceStrings)) {
      warnings.push({ type: 'proper_noun', value: noun, reason: 'unverified_single_proper_noun' })
    }
  }

  return { passed: failed_claims.length === 0, failed_claims, warnings }
}
