import { createHash } from 'crypto'
import { embedQuery, toVectorLiteral, VOYAGE_MODEL } from './voyage.js'

/**
 * Embed a search query (input_type "query") with a write-through cache in
 * query_embedding_cache. Returns { lit, error }:
 *   - lit:   a pgvector-literal string ('[...]') ready to pass to an RPC, or null
 *   - error: a Voyage error string when embedding failed (so the caller can log
 *            it and degrade to the lexical arm), or null
 * Never throws.
 */
export async function embedQueryCached(sb, text) {
  const norm = (text || '').trim().toLowerCase()
  if (!norm) return { lit: null, error: null }

  const hash = createHash('sha256').update(`${norm}:${VOYAGE_MODEL}`).digest('hex')

  // Cache read (best-effort).
  try {
    const { data: hit } = await sb
      .from('query_embedding_cache')
      .select('embedding')
      .eq('query_hash', hash)
      .maybeSingle()
    if (hit?.embedding) {
      return { lit: typeof hit.embedding === 'string' ? hit.embedding : toVectorLiteral(hit.embedding), error: null }
    }
  } catch { /* cache miss treated as no-hit */ }

  // Miss -> embed via Voyage.
  let emb
  try {
    emb = await embedQuery(text)
  } catch (e) {
    console.warn('[search] query embed failed:', e.message)
    return { lit: null, error: e.message }
  }
  if (!emb) return { lit: null, error: 'no embedding' }

  const lit = toVectorLiteral(emb)
  // Write-through (best-effort).
  try {
    await sb.from('query_embedding_cache').upsert(
      { query_hash: hash, model: VOYAGE_MODEL, embedding: lit },
      { onConflict: 'query_hash' }
    )
  } catch { /* non-fatal */ }

  return { lit, error: null }
}
