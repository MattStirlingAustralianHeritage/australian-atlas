/**
 * Fire-and-forget search_events insert. Never throws, never blocks search.
 * Surfaces: front_door | vibe | plan | itinerary | similar.
 */
export function logSearchEvent(sb, f) {
  try {
    sb.from('search_events').insert({
      query_text: f.query_text ?? null,
      surface: f.surface,
      result_count: f.result_count ?? null,
      latency_ms: f.latency_ms ?? null,
      vector_arm_fired: f.vector_arm_fired ?? null,
      fell_back: f.fell_back ?? null,
      voyage_error: f.voyage_error ?? null,
      zero_result: f.zero_result ?? null,
    }).then(() => {}, () => {})
  } catch { /* silent — logging must never break search */ }
}
