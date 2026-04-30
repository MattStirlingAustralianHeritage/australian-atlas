/**
 * Candidate scoring for trail pitches.
 *
 * Pulls listings in the pitch's region(s) + selected verticals, computes
 * cosine similarity against the thesis embedding, applies vertical_weights,
 * boosts must_include listings, and returns the top N candidates with full
 * metadata for the LLM call.
 *
 * pgvector cosine ops are exposed via the listings.embedding column
 * (1024-dim, Voyage-3 — see migration 049). The Supabase JS client doesn't
 * expose <-> directly, so we score in JS rather than via SQL ORDER BY.
 */

const TOP_K_DEFAULT = 30
const MUST_INCLUDE_BOOST = 1.0  // forces these to the top of the candidate list

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  if (!magA || !magB) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

/**
 * @param {SupabaseClient} sb - service-role client
 * @param {Object} pitch - the trail_pitches row
 * @param {number[]} thesisEmbedding - 1024-dim float array
 * @param {number} topK - number of candidates to return (default 30)
 * @returns {Promise<Array>} candidate listings with score + metadata
 */
export async function scoreCandidates(sb, pitch, thesisEmbedding, topK = TOP_K_DEFAULT) {
  const verticalWeights = pitch.vertical_weights || {}
  const selectedVerticals = Object.keys(verticalWeights).filter(v => (verticalWeights[v] ?? 0) > 0)

  // Resolve region filters: primary region + secondary regions → list of region slugs/text
  // for matching the listings.region (text) column. (Listings aren't yet linked by uuid to regions.)
  const regionIds = [
    pitch.region_id,
    ...(pitch.secondary_region_ids || []),
  ].filter(Boolean)

  const { data: regionsRows } = regionIds.length
    ? await sb.from('regions').select('id, slug, name').in('id', regionIds)
    : { data: [] }

  const regionMatchTerms = (regionsRows || []).flatMap(r => [r.name, r.slug].filter(Boolean))

  // Pull listings — page through results.
  const all = []
  for (let from = 0; ; from += 1000) {
    let q = sb.from('listings')
      .select('id, name, slug, vertical, sub_type, region, suburb, state, lat, lng, description, embedding')
      .eq('status', 'active')
      .not('embedding', 'is', null)
      .range(from, from + 999)

    if (selectedVerticals.length) q = q.in('vertical', selectedVerticals)
    if (regionMatchTerms.length) {
      // listings.region is free text — use ilike. Use OR over multiple region terms.
      const orFilter = regionMatchTerms.map(t => `region.ilike.%${t.replace(/%/g, '')}%`).join(',')
      q = q.or(orFilter)
    }

    const { data, error } = await q
    if (error) throw error
    if (!data?.length) break
    all.push(...data)
    if (data.length < 1000) break
  }

  const mustInclude = new Set(pitch.must_include_listing_ids || [])

  const scored = all.map(l => {
    const sim = cosine(thesisEmbedding, l.embedding)
    const vWeight = verticalWeights[l.vertical] ?? 1.0
    let score = sim * vWeight
    if (mustInclude.has(l.id)) score += MUST_INCLUDE_BOOST
    return {
      id: l.id,
      name: l.name,
      slug: l.slug,
      vertical: l.vertical,
      sub_type: l.sub_type,
      region: l.region,
      suburb: l.suburb,
      state: l.state,
      lat: l.lat,
      lng: l.lng,
      description: l.description,
      score,
      similarity: sim,
      must_include: mustInclude.has(l.id),
    }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}

/**
 * Fallback when no embedding is available (e.g. VOYAGE_API_KEY unset, or
 * upstream embedding API is down). Pulls listings under the same filters
 * but ranks by quality_score as the proxy for "good fit", with must-include
 * boosts. Claude still does the actual ordering downstream.
 */
export async function fallbackCandidates(sb, pitch, topK = TOP_K_DEFAULT) {
  const verticalWeights = pitch.vertical_weights || {}
  const selectedVerticals = Object.keys(verticalWeights).filter(v => (verticalWeights[v] ?? 0) > 0)
  const regionIds = [pitch.region_id, ...(pitch.secondary_region_ids || [])].filter(Boolean)
  const { data: regionsRows } = regionIds.length
    ? await sb.from('regions').select('id, slug, name').in('id', regionIds)
    : { data: [] }
  const regionMatchTerms = (regionsRows || []).flatMap(r => [r.name, r.slug].filter(Boolean))

  let q = sb.from('listings')
    .select('id, name, slug, vertical, sub_type, region, suburb, state, lat, lng, description, quality_score')
    .eq('status', 'active')
    .order('quality_score', { ascending: false, nullsFirst: false })
    .limit(topK * 3)
  if (selectedVerticals.length) q = q.in('vertical', selectedVerticals)
  if (regionMatchTerms.length) {
    const orFilter = regionMatchTerms.map(t => `region.ilike.%${t.replace(/%/g, '')}%`).join(',')
    q = q.or(orFilter)
  }
  const { data, error } = await q
  if (error) throw error

  const mustInclude = new Set(pitch.must_include_listing_ids || [])
  const scored = (data || []).map(l => ({
    id: l.id, name: l.name, slug: l.slug, vertical: l.vertical, sub_type: l.sub_type,
    region: l.region, suburb: l.suburb, state: l.state, lat: l.lat, lng: l.lng,
    description: l.description,
    score: (l.quality_score ?? 0) + (mustInclude.has(l.id) ? MUST_INCLUDE_BOOST * 100 : 0),
    similarity: null,
    must_include: mustInclude.has(l.id),
  }))
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}

export { cosine }
