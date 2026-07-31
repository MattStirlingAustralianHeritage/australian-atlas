// Does a query read as a TRIP-PLANNING request (multi-stop, multi-day) rather
// than a venue/category search? Drives the redirect from /search to /itinerary.
//
// Extracted from app/search/page.js (2026-08-01) and tightened to WORD-BOUNDARY
// matching. The old substring check hijacked genuine venue searches: "brewery
// tours in the yarra valley" (venues that RUN tours), "walking trail" (a Field
// category), "great ocean road route" all matched bare 'tour'/'trail'/'route'
// and threw the searcher off the results page on submit. Bare 'trail'/'route'/
// 'tour' are gone — they are venue vocabulary as often as trip vocabulary; the
// multi-day phrases and duration patterns below are the actual trip signal.

const PHRASES = [
  'day trip', 'road trip', 'weekend away', 'weekend in', 'weekend trip',
  'long weekend', 'build me', 'build a', 'plan a', 'plan my', 'plan me',
  'build a trail', 'create a trail', 'overnight in', 'overnight trip',
  'nights in', 'days in', 'day tour', 'tour of',
]

const KEYWORDS = ['itinerary', 'overnight']

// \b-anchored, escaped, compiled once.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const PHRASE_RE = new RegExp(`\\b(?:${PHRASES.map(esc).join('|')})\\b`)
const KEYWORD_RE = new RegExp(`\\b(?:${KEYWORDS.map(esc).join('|')})\\b`)

/**
 * Heuristic intent classifier: does the query look like an itinerary request?
 */
export function isItineraryIntent(query) {
  if (!query || query.trim().length < 5) return false
  const q = query.toLowerCase().trim()

  if (PHRASE_RE.test(q)) return true
  if (KEYWORD_RE.test(q)) return true

  // number + duration ("2 night", "3 days") and word-number + duration
  if (/\d+\s*(night|day|nights|days)\b/.test(q)) return true
  if (/\b(one|two|three|four|five|six|seven)\s*(night|day|nights|days)\b/.test(q)) return true

  return false
}
