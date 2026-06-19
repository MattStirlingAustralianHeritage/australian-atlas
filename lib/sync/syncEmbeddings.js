import { getSupabaseAdmin } from '../supabase/clients.js'
import { embedDocuments, toVectorLiteral, VOYAGE_MODEL } from '../embeddings/voyage.js'
import { buildListingText, buildArticleText } from '../embeddings/sourceText.js'

const TOKEN_BUDGET = 2600     // est tokens/request — keeps 3 req/min under the 10K TPM free-tier cap
const MAX_BATCH = 40          // hard cap on inputs per request
const WRITE_CONCURRENCY = 12  // parallel PostgREST writes
const PACING_MS = 21000       // ~3 requests/min, under the free-tier 3 RPM cap (effectively a no-op once the key is paid)

const estTokens = (s) => Math.ceil((s || '').length / 4)

/** Greedily pack {text,...} items into batches under TOKEN_BUDGET / MAX_BATCH. */
function tokenBatches(items) {
  const batches = []
  let cur = []
  let tok = 0
  for (const it of items) {
    const t = estTokens(it.text)
    if (cur.length && (tok + t > TOKEN_BUDGET || cur.length >= MAX_BATCH)) {
      batches.push(cur)
      cur = []
      tok = 0
    }
    cur.push(it)
    tok += t
  }
  if (cur.length) batches.push(cur)
  return batches
}

/** Run async `worker` over `items` with bounded concurrency. */
async function pool(items, worker, concurrency) {
  let idx = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++
      await worker(items[i], i)
    }
  })
  await Promise.all(runners)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Generate embeddings for listings/articles that need one — never embedded
 * (embedding IS NULL) OR flagged stale by the drift trigger (needs_embedding).
 * Model: voyage-3.5 @ 1024 (see lib/embeddings/voyage.js). Token-aware batching
 * + pacing keep it within the Voyage free-tier limits (3 RPM / 10K TPM); the
 * helper also backs off on 429.
 *
 * Fails LOUD: a failed Voyage batch or a failed row write is logged and counted
 * in `failures`; the success counter only increments on a confirmed write.
 *
 * @returns {{listings:number, articles:number, failures:number}}
 */
export async function generateEmbeddings({ maxListings = 1000, maxArticles = 200 } = {}) {
  if (!process.env.VOYAGE_API_KEY) {
    console.warn('[embeddings] VOYAGE_API_KEY not configured — skipping')
    return { listings: 0, articles: 0, failures: 0 }
  }

  const sb = getSupabaseAdmin()
  let listingCount = 0
  let articleCount = 0
  let failures = 0

  // Region id -> name map for override-wins region resolution in the source text.
  const { data: regions } = await sb.from('regions').select('id, name')
  const regionName = new Map((regions || []).map((r) => [r.id, r.name]))

  // ── Listings ──────────────────────────────────────────────
  const { data: listings, error: lerr } = await sb
    .from('listings')
    .select('id, name, description, sub_type, region, state, vertical, presence_type, region_override_id, region_computed_id, operator_highlights, search_keywords')
    .eq('status', 'active')
    .or('embedding.is.null,needs_embedding.eq.true')
    // Drain never-embedded (null) rows first, then oldest-stale, so the backlog
    // clears deterministically instead of re-touching the same head each run.
    .order('embedding_updated_at', { ascending: true, nullsFirst: true })
    .limit(maxListings)
  if (lerr) console.error('[embeddings] listing select failed:', lerr.message)

  if (listings && listings.length) {
    const items = listings.map((l) => ({
      l,
      text: buildListingText(l, regionName.get(l.region_override_id ?? l.region_computed_id)),
    }))
    const batches = tokenBatches(items)
    console.log(`[embeddings] ${listings.length} listings need embeddings -> ${batches.length} batches (model=${VOYAGE_MODEL})`)

    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b]
      let embeddings
      try {
        embeddings = await embedDocuments(batch.map((x) => x.text))
      } catch (e) {
        console.error('[embeddings] Voyage batch FAILED (no writes for this batch):', e.message)
        failures += batch.length
        continue
      }
      await pool(
        batch,
        async (x, j) => {
          const { error } = await sb
            .from('listings')
            .update({
              embedding: toVectorLiteral(embeddings[j]),
              embedding_updated_at: new Date().toISOString(),
              needs_embedding: false,
            })
            .eq('id', x.l.id)
          if (error) {
            console.error(`[embeddings] write FAILED listing ${x.l.id}:`, error.message)
            failures++
          } else {
            listingCount++
          }
        },
        WRITE_CONCURRENCY
      )
      if (b < batches.length - 1) await sleep(PACING_MS)
    }
  }

  // ── Articles (no needs_embedding column — null-only) ──────
  const { data: articles, error: aerr } = await sb
    .from('articles')
    .select('id, title, excerpt, category, vertical')
    .eq('status', 'published')
    .is('embedding', null)
    .limit(maxArticles)
  if (aerr) console.error('[embeddings] article select failed:', aerr.message)

  if (articles && articles.length) {
    const items = articles.map((a) => ({ a, text: buildArticleText(a) }))
    const batches = tokenBatches(items)
    console.log(`[embeddings] ${articles.length} articles need embeddings -> ${batches.length} batches`)
    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b]
      let embeddings
      try {
        embeddings = await embedDocuments(batch.map((x) => x.text))
      } catch (e) {
        console.error('[embeddings] Voyage batch FAILED (articles):', e.message)
        failures += batch.length
        continue
      }
      await pool(
        batch,
        async (x, j) => {
          const { error } = await sb
            .from('articles')
            .update({ embedding: toVectorLiteral(embeddings[j]) })
            .eq('id', x.a.id)
          if (error) {
            console.error(`[embeddings] write FAILED article ${x.a.id}:`, error.message)
            failures++
          } else {
            articleCount++
          }
        },
        WRITE_CONCURRENCY
      )
      if (b < batches.length - 1) await sleep(PACING_MS)
    }
  }

  console.log(`[embeddings] Done: ${listingCount} listings, ${articleCount} articles, ${failures} failures`)
  return { listings: listingCount, articles: articleCount, failures }
}
