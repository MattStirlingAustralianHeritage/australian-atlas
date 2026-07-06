// Does a venue plausibly match what the user has TYPED SO FAR? Guards the
// autocomplete "Places" section's typo-tolerant fallback.
//
// Problem: when the name-prefix arm comes up thin, the fallback pads the
// dropdown from search_listings_hybrid — whose lexical arm is deliberately
// OR-recall (any significant term is a candidate). Great for the full results
// page; wrong for a typeahead. "australiana themed earrings" suggested
// Australiana Pioneer Village (name hit on one token), a Theme Park (stem hit
// on "themed") and PJ Pottery (description hit) as if they were name matches.
//
// Rule: a suggestion is only a "Place" match if EVERY significant query token
// is covered by the venue's name (suburb/state included, so "smith bakery
// orange" can still find Smith's Bakery in Orange). A token is covered when a
// haystack word equals it, extends it (prefix — the user is mid-word), or is
// within a small typo distance (bigram overlap or one transposition/edit —
// keeps the original "Breww" → Brewery rescue working). When any token has no
// home, the venue is a single-token fluke: show nothing rather than nonsense —
// the full search page, not the dropdown, is where OR-recall belongs.

// Words too generic to demand coverage of ("cafe in berry" shouldn't require
// "in" inside the name). Deliberately short — content words must all match.
const QUERY_STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'in', 'on', 'at', 'for', 'with', 'near', 'to',
])

function normTokens(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining marks post-NFD: café == cafe
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

// Dice coefficient over character bigrams — cheap trigram-similarity stand-in
// for single-character typos and truncations ("breww" vs "brewery" = 0.6).
function bigramDice(a, b) {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0
  const grams = new Map()
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2)
    grams.set(g, (grams.get(g) || 0) + 1)
  }
  let hits = 0
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2)
    const n = grams.get(g) || 0
    if (n > 0) {
      grams.set(g, n - 1)
      hits++
    }
  }
  return (2 * hits) / (a.length + b.length - 2)
}

// Optimal-string-alignment distance (Levenshtein + adjacent transposition),
// early-exited via the length gap. Catches what bigrams miss: "hgih" → "high"
// is one transposition but has zero shared bigrams.
function osaDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const prev2 = new Array(b.length + 1)
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      const sub = prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      let d = Math.min(sub, prev[j] + 1, cur[j - 1] + 1)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, prev2[j - 2] + 1)
      }
      cur.push(d)
    }
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j]
    prev = cur
  }
  return prev[b.length]
}

function tokenCovered(qt, haystackTokens) {
  for (const nt of haystackTokens) {
    if (nt === qt) return true
    // User mid-word: "pott" → "pottery". Any prefix counts.
    if (nt.startsWith(qt)) return true
    // Query word longer than the name's ("earrings" vs "earring") — only when
    // the name word is substantial, so single letters can't absorb anything.
    if (qt.startsWith(nt) && nt.length >= 4) return true
    // Typo tolerance — only for words long enough to carry a signal.
    if (qt.length >= 4 && nt.length >= 4) {
      // Mid-word with a typo tail: "breww" still reads as "Brew(house)".
      let common = 0
      while (common < qt.length && common < nt.length && qt[common] === nt[common]) common++
      if (common >= 4 && qt.length - common <= 2) return true
      if (bigramDice(qt, nt) >= 0.55) return true
      const maxEdits = qt.length >= 6 ? 2 : 1
      if (osaDistance(qt, nt, maxEdits) <= maxEdits) return true
    }
  }
  return false
}

/**
 * True when every significant word the user typed is plausibly part of this
 * venue's name (or its suburb/state) — i.e. the venue has EARNED a slot in the
 * "Places" typeahead rather than surfacing on a single-token fluke.
 */
export function nameMatchesQuery(query, name, { suburb, state } = {}) {
  const queryTokens = normTokens(query).filter(t => !QUERY_STOPWORDS.has(t))
  if (queryTokens.length === 0) return false
  const haystack = [
    ...normTokens(name),
    ...normTokens(suburb),
    ...normTokens(state),
  ]
  if (haystack.length === 0) return false
  return queryTokens.every(qt => tokenCovered(qt, haystack))
}
