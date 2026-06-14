/**
 * Search-keyword normalisation — the single source of truth for validating and
 * cleaning operator-authored search keywords. Pure (no imports, no I/O) so the
 * SAME rules run on the client (KeywordsEditor chip input) and on the server
 * (PATCH /api/dashboard/listing), and so the database CHECK (cardinality <= 15,
 * migration 161) is only ever a backstop that's already satisfied.
 *
 * Rules: trim → collapse internal whitespace → lowercase → 2–40 chars →
 * no URLs / emails / HTML → dedupe → hard cap of 15.
 */

export const MAX_KEYWORDS = 15
export const MIN_LEN = 2
export const MAX_LEN = 40

const URL_RE = /(https?:\/\/|www\.)/i
const EMAIL_RE = /\S+@\S+\.\S+/
const HTML_RE = /[<>]/

/**
 * Clean one raw term. Returns the normalised keyword, or null if it is empty
 * after trimming (a blank chip is silently skipped, not an error).
 * Throws-free: invalid-but-non-empty values come back via the { reason } object
 * so the caller can decide whether to drop or reject.
 *
 * @returns {{ value: string|null, reason: string|null }}
 */
export function inspectKeyword(raw) {
  if (typeof raw !== 'string') return { value: null, reason: 'not_text' }
  const s = raw.trim().replace(/\s+/g, ' ').toLowerCase()
  if (!s) return { value: null, reason: null } // empty → skip silently
  if (URL_RE.test(s) || EMAIL_RE.test(s) || HTML_RE.test(s)) {
    return { value: null, reason: 'links, emails, or HTML aren’t allowed' }
  }
  if (s.length < MIN_LEN) return { value: null, reason: `must be at least ${MIN_LEN} characters` }
  if (s.length > MAX_LEN) return { value: null, reason: `must be ${MAX_LEN} characters or fewer` }
  return { value: s, reason: null }
}

/**
 * Convenience for the client: normalise one term to a string, or null if it is
 * empty or invalid (no reason surfaced).
 */
export function cleanKeyword(raw) {
  return inspectKeyword(raw).value
}

/**
 * Normalise a whole list (server-side authority). Trims/collapses/lowercases
 * each term, drops blanks, dedupes, and enforces the rules + the 15 cap.
 * REJECTS the payload (ok:false) when an entry contains a link/email/HTML or is
 * out of the length range, or when more than 15 unique terms remain — so every
 * rule is provably enforced on the server, not just the client.
 *
 * @returns {{ ok: true, value: string[] } | { ok: false, error: string }}
 */
export function normalizeSearchKeywords(input) {
  if (input == null) return { ok: true, value: [] }
  if (!Array.isArray(input)) return { ok: false, error: 'Keywords must be a list.' }

  const seen = new Set()
  const out = []
  for (const raw of input) {
    const { value, reason } = inspectKeyword(raw)
    if (value == null) {
      if (reason == null) continue // empty entry → skip
      return { ok: false, error: `A keyword ${reason}.` }
    }
    if (seen.has(value)) continue // dedupe
    seen.add(value)
    out.push(value)
  }
  if (out.length > MAX_KEYWORDS) {
    return { ok: false, error: `Add at most ${MAX_KEYWORDS} keywords.` }
  }
  return { ok: true, value: out }
}
