/**
 * Operator name variant generator.
 *
 * Stage 2 and Stage 3 verification uses these variants to test whether
 * a page actually mentions the operator (vs being a generic publication
 * or body page that passes URL validation but isn't operator-specific).
 *
 * Two failure modes the variants protect against:
 *   • False NEGATIVES from naive full-name substring: case differences,
 *     trailing-word drops in editorial copy. "wukalina Walk" must
 *     match a page that says "wukalina" alone.
 *   • False POSITIVES from naive short-core match: "wukalina" alone
 *     also matches Mt Wukalina the place rather than wukalina Walk
 *     the operator. The short-only match is allowed but downgrades
 *     the confidence band.
 *
 * Algorithm — deliberately conservative:
 *   1. Lowercase, normalise whitespace, trim.
 *   2. Always include the full normalised name as variant[0].
 *   3. Suffix-trim generic descriptors (Walk, Tours, Company, etc.)
 *      one at a time. After each trim, include the result IF it's
 *      ≥ MIN_CORE_LENGTH (6) characters. Stop trimming when the
 *      next-word-up isn't on the descriptor list, or when trimmed
 *      result would be shorter than the minimum.
 *   4. Dedupe.
 *
 * Variants are returned LONGEST FIRST. Stage 3's verifier walks
 * the array in order and uses the first match — so the most
 * specific match wins. The CALLER decides confidence-band logic
 * based on which variant matched (longest-match → keep body's
 * default band; shortest-only → drop one band).
 *
 * Edge cases: hand-editable via Candidate Review. The algorithm
 * doesn't try to generate informal abbreviations like "tas walking
 * co" — those are operator-specific knowledge an editor adds
 * manually.
 */

// Generic activity / business descriptors. Last-word matches against
// this set are eligible for trimming. The list errs on the side of
// inclusion: a word here strips off cleanly only if doing so leaves
// a core ≥ MIN_CORE_LENGTH chars, so over-aggressive trimming is
// self-limiting.
const GENERIC_DESCRIPTORS = new Set([
  // Walking / hiking
  'walk', 'walks', 'walking',
  'trek', 'treks', 'trekking',
  'hike', 'hikes', 'hiking',
  // Touring / experience
  'tour', 'tours', 'touring',
  'experience', 'experiences',
  'adventure', 'adventures',
  'expedition', 'expeditions',
  'trip', 'trips',
  'journey', 'journeys',
  // Guiding
  'guide', 'guides', 'guiding',
  // Marine / aerial / specialist activities (when used as descriptors)
  'kayaking', 'kayak', 'kayaks',
  'sailing', 'charter', 'charters',
  'flying', 'flights',
  'diving', 'dives',
  'fishing',
  // Business descriptors
  'company', 'co', 'corporation', 'corp',
  'group', 'groups',
  'enterprises', 'enterprise',
  'pty', 'ltd', 'pty ltd',           // multi-word handled by trimming twice
  'australia', 'australian',         // place-of-business descriptors that aren't operator-specific
])

const MIN_CORE_LENGTH = 6

/**
 * Generate variants for an operator name. Returns longest-first.
 *
 * @param {string} name
 * @returns {string[]} variants (deduped, ordered longest→shortest)
 */
export function generateNameVariants(name) {
  if (!name || typeof name !== 'string') return []
  const normalised = name.toLowerCase().replace(/\s+/g, ' ').trim()
  if (!normalised) return []

  const out = [normalised]
  const words = normalised.split(' ')

  // Iteratively trim trailing descriptors. Stop on first non-descriptor
  // last word, or when the would-be trimmed result is too short.
  let current = words.slice()
  while (current.length > 1) {
    const last = current[current.length - 1]
    if (!GENERIC_DESCRIPTORS.has(last)) break

    const trimmedWords = current.slice(0, -1)
    const trimmed = trimmedWords.join(' ')
    if (trimmed.length < MIN_CORE_LENGTH) break

    out.push(trimmed)
    current = trimmedWords
  }

  // Dedupe (could happen if input had repeated tokens)
  return [...new Set(out)]
}

/**
 * Determine if a matched variant is the "shortest" of the candidate's
 * variants — i.e. the most permissive match, where confidence should
 * drop one band per Q2 sign-off addendum.
 *
 * @param {string} matchedVariant
 * @param {string[]} allVariants  — same array as returned by generateNameVariants
 * @returns {boolean}
 */
export function isShortestOnlyMatch(matchedVariant, allVariants) {
  if (!Array.isArray(allVariants) || allVariants.length <= 1) return false
  // Variants are ordered longest-first; last entry is shortest.
  const shortest = allVariants[allVariants.length - 1]
  return matchedVariant === shortest
}
