// Max impression rows persisted per search — the top of the list is what
// "queries you appeared for" intelligence needs; the tail is noise.
const IMPRESSIONS_CAP = 20

/**
 * Build search_result_impressions rows from the FINAL result list sent to the
 * client. `offset` shifts positions so paginated responses record the GLOBAL
 * rank (page 2 of 24 starts at position 25), 1-based. Returns [] on anything
 * malformed — impressions must never break the event log.
 */
function buildImpressionRows(f) {
  const listings = f?.impressions
  if (!Array.isArray(listings) || !listings.length || !f.query_text) return []
  const offset = Number.isFinite(f.impressions_offset) ? f.impressions_offset : 0
  return listings.slice(0, IMPRESSIONS_CAP)
    .map((l, i) => (l && l.id ? {
      query_text: f.query_text,
      surface: f.surface,
      listing_id: l.id,
      position: offset + i + 1,
    } : null))
    .filter(Boolean)
}

/** Fire-and-forget bulk insert of impression rows (never throws). */
function insertImpressions(sb, rows, searchEventId) {
  try {
    sb.from('search_result_impressions')
      .insert(rows.map((r) => ({ ...r, search_event_id: searchEventId ?? null })))
      .then(() => {}, () => {})
  } catch { /* silent — logging must never break search */ }
}

/**
 * Fire-and-forget search_events insert. Never throws, never blocks search.
 * Surfaces: front_door | vibe | plan | itinerary | similar | ask.
 *
 * Optionally pass `impressions` (the FINAL listings array sent to the client,
 * top 20 kept) and `impressions_offset` (pagination offset for global 1-based
 * positions) to also log per-listing result impressions into
 * search_result_impressions. The impressions insert chains off the event
 * insert's returned id — still entirely unawaited, so it adds zero latency to
 * the search response; if the event insert fails, impressions are logged with
 * search_event_id null.
 */
export function logSearchEvent(sb, f) {
  try {
    const insert = sb.from('search_events').insert({
      query_text: f.query_text ?? null,
      surface: f.surface,
      result_count: f.result_count ?? null,
      latency_ms: f.latency_ms ?? null,
      vector_arm_fired: f.vector_arm_fired ?? null,
      fell_back: f.fell_back ?? null,
      voyage_error: f.voyage_error ?? null,
      zero_result: f.zero_result ?? null,
      reranked: f.reranked ?? null,
    })
    const impressionRows = buildImpressionRows(f)
    if (!impressionRows.length) {
      insert.then(() => {}, () => {})
      return
    }
    insert.select('id').single().then(
      ({ data }) => insertImpressions(sb, impressionRows, data?.id ?? null),
      () => insertImpressions(sb, impressionRows, null),
    )
  } catch { /* silent — logging must never break search */ }
}
