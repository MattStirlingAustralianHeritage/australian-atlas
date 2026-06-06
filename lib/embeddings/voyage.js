/**
 * Shared Voyage embedding helper.
 *
 * Uses the Voyage REST API via fetch — the `voyageai` SDK has an ESM
 * directory-import bug under Node 22 that throws on `await import('voyageai')`.
 *
 * Model: voyage-3.5 @ 1024 dims (matches the listings.embedding column).
 * input_type: "document" for content, "query" for search queries (asymmetric
 * retrieval). Batches up to 128 inputs/request with exponential backoff on
 * 429/5xx. Throws on hard failure so callers can fail loud (never silent).
 */

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings'
export const VOYAGE_MODEL = process.env.VOYAGE_EMBED_MODEL || 'voyage-3.5'
export const VOYAGE_DIM = 1024
const MAX_BATCH = 128

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function callVoyage(inputs, inputType) {
  const key = process.env.VOYAGE_API_KEY
  if (!key) throw new Error('VOYAGE_API_KEY not configured')
  let lastErr
  for (let attempt = 0; attempt <= 8; attempt++) {
    let res
    try {
      res = await fetch(VOYAGE_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: inputs, model: VOYAGE_MODEL, input_type: inputType }),
      })
    } catch (e) {
      lastErr = e
      await sleep(Math.min(1000 * 2 ** attempt, 16000))
      continue // network blip — retry
    }
    if (res.status === 429) {
      // Free tier is 3 RPM / 10K TPM and resets per-minute — wait out the window.
      lastErr = new Error('voyage 429 (rate limit)')
      await sleep(20000 + Math.floor(Math.random() * 5000))
      continue
    }
    if (res.status >= 500) {
      lastErr = new Error(`voyage HTTP ${res.status}`)
      await sleep(Math.min(1000 * 2 ** attempt, 16000))
      continue // transient — retry
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

/** Embed content/documents. Returns embeddings in input order. */
export async function embedDocuments(texts) {
  const out = []
  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    out.push(...(await callVoyage(texts.slice(i, i + MAX_BATCH), 'document')))
  }
  return out
}

/** Embed a single search query. */
export async function embedQuery(text) {
  const [e] = await callVoyage([text], 'query')
  return e
}

/** Format a float array as a pgvector literal string for PostgREST writes. */
export function toVectorLiteral(arr) {
  return '[' + arr.join(',') + ']'
}
