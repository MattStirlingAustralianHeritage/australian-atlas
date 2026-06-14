import { embedDocuments, toVectorLiteral } from './voyage.js'
import { buildListingText } from './sourceText.js'

/**
 * Regenerate ONE listing's embedding immediately.
 *
 * Used by the operator dashboard after a search-affecting edit (e.g. saving
 * search keywords) so the change is reflected in search without waiting for the
 * embedding cron. This reuses exactly the same source text + Voyage *document*
 * embedding + pgvector write as the batch backfill in lib/sync/syncEmbeddings.js
 * — just for a single row, no batch job, no bulk re-embedding.
 *
 * Region resolution mirrors the cron (override-wins: region_override_id then
 * region_computed_id, falling back to the legacy region text). The embedding is
 * generated with a BOUNDED retry profile so an interactive save never hangs:
 * on Voyage failure this throws, and the caller leaves needs_embedding=true so
 * the cron retries (the safety net).
 *
 * @param {object} sb - master-portal Supabase client (service role)
 * @param {string} listingId
 * @returns {Promise<{ ok: true, text: string }>}
 * @throws if the listing is missing, Voyage fails, or the write fails
 */
export async function regenerateListingEmbedding(sb, listingId) {
  if (!listingId) throw new Error('listingId is required')

  const { data: l, error } = await sb
    .from('listings')
    .select('id, name, description, sub_type, region, state, vertical, presence_type, region_override_id, region_computed_id, operator_highlights, search_keywords')
    .eq('id', listingId)
    .single()
  if (error || !l) throw new Error(error?.message || 'listing not found')

  // Override-wins region name (same as syncEmbeddings.js), falling back to the
  // legacy region text inside buildListingText.
  let regionName = null
  const regionId = l.region_override_id ?? l.region_computed_id
  if (regionId) {
    const { data: r } = await sb.from('regions').select('name').eq('id', regionId).maybeSingle()
    regionName = r?.name || null
  }

  const text = buildListingText(l, regionName)
  // Bounded profile: at most 2 short attempts, no long 429 backoff — an
  // interactive save must not block. embedDocuments uses input_type "document",
  // matching every other stored listing vector.
  const [embedding] = await embedDocuments([text], { maxAttempts: 2, timeoutMs: 8000, backoff429Ms: 0 })
  if (!embedding) throw new Error('voyage returned no embedding')

  const { error: wErr } = await sb
    .from('listings')
    .update({
      embedding: toVectorLiteral(embedding),
      embedding_updated_at: new Date().toISOString(),
      needs_embedding: false,
    })
    .eq('id', listingId)
  if (wErr) throw new Error(wErr.message)

  return { ok: true, text }
}
