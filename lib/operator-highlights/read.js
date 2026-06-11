// ============================================================
// Operator Highlights — resilient reads
// ============================================================
//
// Reads the `listings.operator_highlights` JSONB. These helpers degrade
// gracefully when the column does not exist yet (Postgres error 42703) so a
// deploy that lands before migration 157 is applied can never 500 a place page
// or the operator dashboard — it simply shows no highlights until the column
// arrives. `sb` must be a master-portal client.

// Postgres "undefined column" — the column hasn't been migrated in yet.
function isMissingColumn(error) {
  return !!error && (error.code === '42703' || /operator_highlights/.test(error.message || ''))
}

// Single listing → its highlights object, or null when absent/unreadable.
export async function readHighlights(sb, listingId) {
  if (!listingId) return null
  try {
    const { data, error } = await sb
      .from('listings')
      .select('operator_highlights')
      .eq('id', listingId)
      .maybeSingle()
    if (error) {
      if (!isMissingColumn(error)) {
        console.error('[highlights] read failed for', listingId, '—', error.message)
      }
      return null
    }
    return data?.operator_highlights || null
  } catch (err) {
    console.error('[highlights] read threw for', listingId, '—', err.message)
    return null
  }
}

// Many listings → Map(id → highlights object). Missing column / errors yield an
// empty map (every listing simply has no highlights). Used by the dashboard so
// the editor can preload without an extra round-trip per listing.
export async function readHighlightsMap(sb, ids) {
  const map = new Map()
  const list = (ids || []).filter(Boolean)
  if (!list.length) return map
  try {
    const { data, error } = await sb
      .from('listings')
      .select('id, operator_highlights')
      .in('id', list)
    if (error) {
      if (!isMissingColumn(error)) {
        console.error('[highlights] batch read failed —', error.message)
      }
      return map
    }
    for (const row of data || []) {
      if (row.operator_highlights) map.set(row.id, row.operator_highlights)
    }
    return map
  } catch (err) {
    console.error('[highlights] batch read threw —', err.message)
    return map
  }
}
