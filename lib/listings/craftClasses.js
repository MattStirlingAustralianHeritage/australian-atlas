// ============================================================
// craft_meta.offers_classes — "does this maker run classes or workshops?"
//
// The flag lives on the craft extension table (migration 089), not on
// `listings`, and it is the switch the place page's "Classes & Workshops"
// section reads. Only craft listings have the column, so every helper here is a
// no-op for other verticals rather than an error.
//
// Both the admin Listing Editor (via the _meta path on
// PATCH /api/admin/listings/[id]) and the operator dashboard write this flag;
// these helpers exist so the dashboard's read and write agree on one shape.
// ============================================================

/** Read the flag for a set of listings in one query. Returns a Map keyed by
 *  listing id; craft listings only, and missing meta rows read as false. */
export async function readOffersClassesMap(sb, listings) {
  const craftIds = (listings || []).filter(l => l?.vertical === 'craft').map(l => l.id)
  const map = new Map()
  if (craftIds.length === 0) return map
  const { data, error } = await sb
    .from('craft_meta')
    .select('listing_id, offers_classes')
    .in('listing_id', craftIds)
  if (error) {
    console.warn('[craftClasses] read failed:', error.message)
    return map
  }
  for (const row of data || []) map.set(row.listing_id, !!row.offers_classes)
  for (const id of craftIds) if (!map.has(id)) map.set(id, false)
  return map
}

/** Set the flag. Upserts so a craft listing with no meta row yet still saves.
 *  Returns { ok, error } — never throws; the caller decides how loud to be. */
export async function writeOffersClasses(sb, listingId, value) {
  const { error } = await sb
    .from('craft_meta')
    .upsert({ listing_id: listingId, offers_classes: !!value }, { onConflict: 'listing_id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true, error: null }
}
