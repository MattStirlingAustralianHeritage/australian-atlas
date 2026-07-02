/**
 * Atlas Trade — extended trade profile (listing_trade_profiles, migration 204).
 *
 * The operator-authored depth behind the trade_welcome switch: the fields the
 * travel trade needs before contracting a venue (notice period, coach access,
 * languages, dietary handling, capacity, seasonality, insurance, famils) plus a
 * TRADE-ONLY contact channel.
 *
 * Privacy contract: this table has RLS enabled with NO policies — it is
 * readable only through service-role routes, and the contact channel renders
 * exclusively on gated trade surfaces (fact sheets, enquiries). It must never
 * appear on a consumer page or a public (published-itinerary) page.
 *
 * Like enrichment (lib/trade/enrich), profile reads are additive: a failure
 * returns an empty map and must never break the surface that asked.
 */

const PROFILE_SELECT =
  'listing_id, notice_days, coach_access, languages, dietary_notes, capacity_notes, ' +
  'seasonal_notes, insurance_confirmed, famil_open, contact_name, contact_email, contact_phone, updated_at'

/** Map<listing_id, profile> for the given ids. Missing ids simply aren't in the map. */
export async function getTradeProfiles(sb, listingIds) {
  const ids = [...new Set((listingIds || []).filter(Boolean))]
  if (ids.length === 0) return new Map()

  const { data, error } = await sb
    .from('listing_trade_profiles')
    .select(PROFILE_SELECT)
    .in('listing_id', ids)

  if (error) {
    console.error('[trade/profile] read failed:', error.message)
    return new Map()
  }
  return new Map((data || []).map((p) => [p.listing_id, p]))
}

/** Single-listing convenience. Returns the profile row or null. */
export async function getTradeProfile(sb, listingId) {
  const map = await getTradeProfiles(sb, [listingId])
  return map.get(listingId) || null
}

/**
 * Upsert the operator-authored profile (dashboard PATCH path — ownership is
 * gated by the caller). `value` must already be normalised via
 * normalizeTradeProfile. Returns { ok } or { ok:false, error }.
 */
export async function upsertTradeProfile(sb, listingId, value) {
  const { error } = await sb
    .from('listing_trade_profiles')
    .upsert({ listing_id: listingId, ...value }, { onConflict: 'listing_id' })
    // '*' — never name columns here; a missing column would silently roll back
    // the write (the 42703 trap from the inline-editor meta-save incident).
    .select('*')
  if (error) {
    console.error('[trade/profile] upsert failed:', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

/**
 * The profile shaped for GATED trade surfaces (fact sheet, enquiry recipient
 * resolution). Contact fields included — gated surfaces only.
 */
export function tradeProfileView(p) {
  if (!p) return null
  return {
    notice_days: p.notice_days ?? null,
    coach_access: !!p.coach_access,
    languages: Array.isArray(p.languages) ? p.languages : [],
    dietary_notes: p.dietary_notes || null,
    capacity_notes: p.capacity_notes || null,
    seasonal_notes: p.seasonal_notes || null,
    insurance_confirmed: !!p.insurance_confirmed,
    famil_open: !!p.famil_open,
    contact_name: p.contact_name || null,
    contact_email: p.contact_email || null,
    contact_phone: p.contact_phone || null,
  }
}
