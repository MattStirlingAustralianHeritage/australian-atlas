// Shared classifier: is a search query a plain-language INQUIRY (a request we
// should answer conversationally) or a LOOKUP (a name / category / place the
// existing keyword+semantic search already nails)?
//
// Used on BOTH the client (the search bar morphs its dropdown into an "Ask the
// Atlas" affordance the moment an inquiry is detected) and the server (the
// /api/search/ask concierge route + the /search page decide when to run the
// concierge). Keeping the signal in one pure module means the bar's promise and
// the results page can never drift apart.
//
// Design goal: FIRE only for genuinely conversational requests — a shopper
// describing what they want ("a gift for my niece that's made in Australia"),
// asking a question ("where can I take my mum for her birthday"), or stating an
// intent in the first person ("I'm looking for a pottery class near Byron").
// STAY SILENT for the descriptive keyword queries the plain search handles
// beautifully ("natural wine in the Adelaide Hills", "quiet farm stay in
// Tasmania", "galleries in Hobart", "Fellini Jewellery"). When unsure, prefer
// LOOKUP — a false concierge on a simple lookup is a worse failure than a
// keyword query that could have been answered conversationally.

// Strong request phrases — a searcher spelling out a need rather than naming a
// thing. Substring-matched against the lowercased, punctuation-normalised query.
const REQUEST_PHRASES = [
  'looking for', 'look for', 'i want', 'i need', 'we want', 'we need',
  "i'm after", 'im after', 'i am after', "i'm looking", 'i am looking',
  'help me find', 'help me', 'can you find', 'can i find', 'can we find',
  'where can', 'where do i', 'where should', "where's a", 'wheres a',
  'where to', 'somewhere to', 'somewhere that', 'somewhere with', 'somewhere for',
  'something to', 'something for', 'something that', 'something with', 'something special',
  'anywhere to', 'anywhere that', 'is there anywhere', 'is there a', 'is there somewhere',
  'a place to', 'places to', 'place to take', 'places to take', 'a spot to', 'spots to',
  'buy a', 'buy me', 'buy something', 'to buy', 'where to buy', 'i can buy', 'that i can buy',
  'gift for', 'a gift', 'present for', 'a present', 'gift idea', 'gift ideas', 'as a gift',
  'recommend', 'recommendation', 'suggest', 'suggestion', 'ideas for', 'idea for',
  'what should', "what's a good", 'whats a good', 'what is a good', 'what to', 'things to do',
  'take my', 'take the kids', 'take the family', 'treat my', 'surprise my',
  'good for', 'best for', 'perfect for', 'ideal for', 'suitable for',
]

// Occasion / gifting / who-it's-for words. On their own they're a weak signal
// (they can appear in venue names), so they only contribute to the score.
const OCCASION_WORDS = [
  'gift', 'present', 'birthday', 'anniversary', 'wedding', 'engagement',
  'christmas', 'mothers day', "mother's day", 'fathers day', "father's day",
  'valentine', 'honeymoon', 'proposal', 'celebrate', 'celebration',
  'date night', 'girls trip', 'girls weekend', 'hens', 'bucks', 'baby shower',
  'housewarming', 'retirement', 'graduation', 'souvenir', 'keepsake', 'memento',
]

const FIRST_PERSON = /\b(i|i'm|im|i'd|id|i've|ive|my|me|we|we're|were|our|us)\b/i

// Question openers — a query that starts like a question is almost always an
// inquiry even without a trailing question mark ("where can i find …").
const QUESTION_OPENERS = /^(where|what|which|who|how|why|when|can|could|should|would|is|are|do|does|help|find me|looking)/i

// Price / budget cues — a shopper bounding a purchase ("under $50", "on a
// budget") is describing a need, not naming a venue.
const BUDGET_CUE = /(under \$?\d|\$\d|\bon a budget\b|\baffordable\b|\binexpensive\b|\bcheap\b)/i

// Category/place lookups that could otherwise trip the length heuristics. If a
// query is essentially "<some words> in <place>" with no request/occasion/first-
// person signal, it's a normal search — the plain pipeline handles it.
function countWords(s) {
  return (s.match(/\S+/g) || []).length
}

/**
 * Score a query's "inquiry-ness". Threshold-based so no single weak signal
 * (a lone "gift" in a shop name, an 8-word category query) flips it alone.
 * @returns {number} score; >= INQUIRY_THRESHOLD means treat as an inquiry.
 */
export function inquiryScore(query) {
  const raw = String(query || '').trim()
  if (raw.length < 8) return 0
  const lower = raw.toLowerCase()
  // Normalise punctuation to spaces for phrase matching, but remember the marks.
  const hasQuestionMark = /\?/.test(raw)
  const sentenceBreaks = (raw.match(/[.!?]+\s+\S/g) || []).length
  const hasComma = /,/.test(raw)
  const norm = ' ' + lower.replace(/[^a-z0-9$'\s]/g, ' ').replace(/\s+/g, ' ').trim() + ' '
  const words = countWords(raw)

  let score = 0

  if (hasQuestionMark) score += 3
  if (QUESTION_OPENERS.test(raw)) score += 2

  // Strong request phrases (cap their combined contribution so a single clear
  // request already clears the bar, but stacking them can't run away).
  let phraseHits = 0
  for (const p of REQUEST_PHRASES) {
    if (norm.includes(' ' + p + ' ') || norm.includes(' ' + p)) { phraseHits++; if (phraseHits >= 2) break }
  }
  score += Math.min(phraseHits, 2) * 3

  // Occasion / gifting language.
  let occHits = 0
  for (const w of OCCASION_WORDS) {
    if (norm.includes(' ' + w + ' ')) { occHits++; if (occHits >= 2) break }
  }
  score += Math.min(occHits, 2) * 2

  if (FIRST_PERSON.test(raw)) score += 1
  if (BUDGET_CUE.test(raw)) score += 2

  // Longer, multi-clause phrasing reads as a described need, not a name.
  if (words >= 8) score += 1
  if (words >= 12) score += 2
  if (hasComma) score += 1
  if (sentenceBreaks >= 1) score += 2

  return score
}

export const INQUIRY_THRESHOLD = 3

/**
 * Does this query read as a plain-language inquiry the concierge should answer,
 * rather than a name/category/place lookup?
 */
export function isInquiryQuery(query) {
  return inquiryScore(query) >= INQUIRY_THRESHOLD
}
