/**
 * Shared Voyage embedding helper (REST via fetch — the `voyageai` SDK has an ESM
 * directory-import bug under Node 22).
 *
 * Model: voyage-3.5 @ 1024 dims. input_type "document" for content, "query" for
 * searches. Two retry profiles:
 *   - embedDocuments (batch backfill / cron): PATIENT — long 429 backoff, many
 *     retries; throughput over latency.
 *   - embedQuery (interactive search): FAST-FAIL — one short attempt, no long
 *     backoff, plus a process-local circuit breaker. A rate-limited/slow Voyage
 *     degrades the search to its lexical arm in <4s instead of blocking the
 *     /api/search request for 20-45s (the "search is broken / Searching…" hang).
 */

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings'
export const VOYAGE_MODEL = process.env.VOYAGE_EMBED_MODEL || 'voyage-3.5'
export const VOYAGE_DIM = 1024
const MAX_BATCH = 128

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Process-local circuit breaker for the interactive query path: once Voyage
// rate-limits or times out a query embed, skip embedding (straight to lexical)
// for a short window rather than repeatedly paying the per-request timeout.
let queryCooldownUntil = 0

async function callVoyage(inputs, inputType, opts = {}) {
  const { maxAttempts = 9, timeoutMs = 20000, backoff429Ms = 22000 } = opts
  const key = process.env.VOYAGE_API_KEY
  if (!key) throw new Error('VOYAGE_API_KEY not configured')
  let lastErr
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    let res
    try {
      res = await fetch(VOYAGE_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: inputs, model: VOYAGE_MODEL, input_type: inputType }),
        signal: ctrl.signal,
      })
    } catch (e) {
      clearTimeout(timer)
      lastErr = e && e.name === 'AbortError' ? new Error(`voyage timeout after ${timeoutMs}ms`) : e
      if (attempt < maxAttempts) { await sleep(Math.min(1000 * 2 ** attempt, 16000)); continue }
      throw lastErr
    }
    clearTimeout(timer)
    if (res.status === 429) {
      lastErr = new Error('voyage 429 (rate limit)')
      if (attempt < maxAttempts && backoff429Ms > 0) { await sleep(backoff429Ms + Math.floor(Math.random() * 5000)); continue }
      throw lastErr
    }
    if (res.status >= 500) {
      lastErr = new Error(`voyage HTTP ${res.status}`)
      if (attempt < maxAttempts) { await sleep(Math.min(1000 * 2 ** attempt, 16000)); continue }
      throw lastErr
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`voyage HTTP ${res.status}: ${body.slice(0, 180)}`)
    }
    const data = await res.json()
    const out = (data.data || []).map((d) => d.embedding)
    if (out.length !== inputs.length) throw new Error(`voyage returned ${out.length} embeddings for ${inputs.length} inputs`)
    for (const e of out) {
      if (!Array.isArray(e) || e.length !== VOYAGE_DIM) throw new Error(`voyage dim ${e?.length} != ${VOYAGE_DIM}`)
    }
    return out
  }
  throw lastErr || new Error('voyage failed after retries')
}

/** Embed content/documents — PATIENT profile (batch backfill / cron). */
export async function embedDocuments(texts) {
  const out = []
  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    out.push(...(await callVoyage(texts.slice(i, i + MAX_BATCH), 'document', { maxAttempts: 9, timeoutMs: 20000, backoff429Ms: 22000 })))
  }
  return out
}

/**
 * Embed a single search query — FAST-FAIL profile. Returns the embedding, or
 * null if Voyage is unavailable/rate-limited/slow (the caller then degrades to
 * the lexical arm). Never throws; never blocks the request beyond ~4s. Opens a
 * short process-local circuit breaker on rate-limit/timeout so subsequent
 * interactive searches skip the wait entirely.
 */
export async function embedQuery(text) {
  if (Date.now() < queryCooldownUntil) return null
  try {
    const [e] = await callVoyage([text], 'query', { maxAttempts: 1, timeoutMs: 4000, backoff429Ms: 0 })
    return e || null
  } catch (err) {
    const m = String((err && err.message) || '')
    if (/429|rate limit|timeout|abort/i.test(m)) queryCooldownUntil = Date.now() + 20000
    return null
  }
}

/** Format a float array as a pgvector literal string for PostgREST writes. */
export function toVectorLiteral(arr) {
  return '[' + arr.join(',') + ']'
}
