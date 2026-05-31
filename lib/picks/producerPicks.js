// Producer Picks — shared helper.
//
// Canonical store: the master-portal `listing_relationships` table
// (migration 024), with relationship_type = 'producer_pick'.
//
// Direction is fixed and meaningful:
//   listing_id_a = curator  — the venue GIVING the pick (vouching)
//   listing_id_b = picked   — the venue BEING vouched for
//
// A curator may have at most MAX_PICKS outgoing producer picks. The table
// enforces no-self-pick (CHECK) and no-duplicate (UNIQUE a,b,type); the
// per-curator cap is a business rule enforced here.
//
// Callers map their own semantics onto curator/picked:
//   - Operator self-service: curator = my listing, picked = chosen venue.
//   - Admin "picked by" in the editor: picked = the listing being edited,
//     curator = the venue the admin says picked it.

import { LISTING_REGION_SELECT } from '@/lib/regions'

export const RELATIONSHIP_TYPE = 'producer_pick'
export const MAX_PICKS = 5

const SELECT_COLS = 'id, listing_id_a, listing_id_b, source, confidence, metadata, created_at'

// id -> { id, name, slug, vertical, region, state }
export async function hydrateListings(sb, ids) {
  const unique = [...new Set((ids || []).filter(Boolean))]
  if (!unique.length) return {}
  const { data } = await sb
    .from('listings')
    .select('id, name, slug, vertical, region, state, status')
    .in('id', unique)
  const map = {}
  for (const l of data || []) map[l.id] = l
  return map
}

function shapePick(r, map) {
  const curator = map[r.listing_id_a] || null
  const picked = map[r.listing_id_b] || null
  const meta = r.metadata || {}
  return {
    id: r.id,
    curatorId: r.listing_id_a,
    pickedId: r.listing_id_b,
    curatorName: curator?.name || 'Unknown venue',
    curatorSlug: curator?.slug || null,
    curatorVertical: curator?.vertical || null,
    curatorRegion: curator?.region || null,
    curatorStatus: curator?.status || null,
    pickedName: picked?.name || 'Unknown venue',
    pickedSlug: picked?.slug || null,
    pickedVertical: picked?.vertical || null,
    pickedRegion: picked?.region || null,
    pickedStatus: picked?.status || null,
    note: meta.note || null,
    position: meta.position ?? null,
    source: r.source || null,
    createdAt: r.created_at,
  }
}

const byPosition = (a, b) =>
  (a.position ?? 99) - (b.position ?? 99) ||
  new Date(a.createdAt) - new Date(b.createdAt)

// How many outgoing picks a curator already has (for the cap).
export async function countOutgoing(sb, curatorId) {
  if (!curatorId) return 0
  const { count } = await sb
    .from('listing_relationships')
    .select('*', { count: 'exact', head: true })
    .eq('listing_id_a', curatorId)
    .eq('relationship_type', RELATIONSHIP_TYPE)
  return count || 0
}

// Picks GIVEN BY the supplied listing id(s) — hydrated + ordered.
export async function listOutgoing(sb, curatorIds) {
  const ids = [...new Set((Array.isArray(curatorIds) ? curatorIds : [curatorIds]).filter(Boolean))]
  if (!ids.length) return []
  const { data } = await sb
    .from('listing_relationships')
    .select(SELECT_COLS)
    .in('listing_id_a', ids)
    .eq('relationship_type', RELATIONSHIP_TYPE)
  const rels = data || []
  const map = await hydrateListings(sb, rels.flatMap(r => [r.listing_id_a, r.listing_id_b]))
  return rels.map(r => shapePick(r, map)).sort(byPosition)
}

// Picks RECEIVED BY the supplied listing id(s) — i.e. "picked by …".
export async function listIncoming(sb, pickedIds) {
  const ids = [...new Set((Array.isArray(pickedIds) ? pickedIds : [pickedIds]).filter(Boolean))]
  if (!ids.length) return []
  const { data } = await sb
    .from('listing_relationships')
    .select(SELECT_COLS)
    .in('listing_id_b', ids)
    .eq('relationship_type', RELATIONSHIP_TYPE)
  const rels = data || []
  const map = await hydrateListings(sb, rels.flatMap(r => [r.listing_id_a, r.listing_id_b]))
  return rels.map(r => shapePick(r, map)).sort(byPosition)
}

// Full card + region select for a picked venue, so a ListingCard can render it
// (region resolution needs the LISTING_REGION_SELECT joins).
const PICKED_CARD_SELECT =
  `id, name, slug, vertical, state, source_id, hero_image_url, is_featured, is_claimed, editors_pick, status, ${LISTING_REGION_SELECT}`

// Every venue on the network that has RECEIVED at least one producer pick,
// shaped for the public picks directory. Each picked venue appears once, with
// the active curators that vouched for it and a pick count. Both the picked
// venue and its curators are filtered to active status, so a card never links
// to a hidden listing and attribution is always truthful — mirroring the place
// page's pick surfacing. Sorted most-vouched first, then most-recent, then name.
export async function listPickedVenues(sb) {
  const { data: rels, error } = await sb
    .from('listing_relationships')
    .select('listing_id_a, listing_id_b, created_at')
    .eq('relationship_type', RELATIONSHIP_TYPE)
  if (error || !rels?.length) return []

  const pickedIds = [...new Set(rels.map(r => r.listing_id_b).filter(Boolean))]
  const curatorIds = [...new Set(rels.map(r => r.listing_id_a).filter(Boolean))]

  const [{ data: pickedRows }, { data: curatorRows }] = await Promise.all([
    sb.from('listings').select(PICKED_CARD_SELECT).in('id', pickedIds).eq('status', 'active'),
    sb.from('listings').select('id, name, slug, vertical, status').in('id', curatorIds).eq('status', 'active'),
  ])
  const pickedMap = new Map((pickedRows || []).map(l => [l.id, l]))
  const curatorMap = new Map((curatorRows || []).map(l => [l.id, l]))

  // Group active curators under each active picked venue.
  const grouped = new Map() // pickedId -> { listing, curators, latestAt }
  for (const r of rels) {
    const listing = pickedMap.get(r.listing_id_b)
    const curator = curatorMap.get(r.listing_id_a)
    if (!listing || !curator) continue
    let entry = grouped.get(listing.id)
    if (!entry) {
      entry = { listing, curators: [], latestAt: r.created_at }
      grouped.set(listing.id, entry)
    }
    if (!entry.curators.some(c => c.id === curator.id)) {
      entry.curators.push({ id: curator.id, name: curator.name, slug: curator.slug, vertical: curator.vertical })
    }
    if (r.created_at > entry.latestAt) entry.latestAt = r.created_at
  }

  return [...grouped.values()]
    .map(e => ({ listing: e.listing, curators: e.curators, pickCount: e.curators.length, latestAt: e.latestAt }))
    .sort((a, b) =>
      b.pickCount - a.pickCount ||
      new Date(b.latestAt) - new Date(a.latestAt) ||
      a.listing.name.localeCompare(b.listing.name)
    )
}

// Create a producer pick (curator vouches for picked).
// Enforces: required ids, no self-pick, curator cap. The DB enforces
// no-duplicate. Returns { ok, pick } | { ok:false, error, code }.
export async function createPick(sb, { curatorId, pickedId, note = null, source = 'operator', createdBy = null }) {
  if (!curatorId || !pickedId) return { ok: false, error: 'Both venues are required', code: 'bad_request' }
  if (curatorId === pickedId) return { ok: false, error: 'A venue cannot pick itself', code: 'self' }

  const current = await countOutgoing(sb, curatorId)
  if (current >= MAX_PICKS) {
    return { ok: false, error: `A venue can vouch for at most ${MAX_PICKS} producer picks`, code: 'cap', count: current }
  }

  const metadata = { created_by: createdBy || source, position: current + 1 }
  if (note) metadata.note = String(note).trim().slice(0, 280)

  const { data, error } = await sb
    .from('listing_relationships')
    .insert({
      listing_id_a: curatorId,
      listing_id_b: pickedId,
      relationship_type: RELATIONSHIP_TYPE,
      source,
      confidence: 1.0,
      metadata,
    })
    .select(SELECT_COLS)
    .single()

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'That venue has already been picked', code: 'duplicate' }
    if (error.code === '23514') return { ok: false, error: 'A venue cannot pick itself', code: 'self' }
    if (error.code === '23503') return { ok: false, error: 'One of the venues no longer exists', code: 'missing' }
    return { ok: false, error: error.message, code: 'db' }
  }

  const map = await hydrateListings(sb, [data.listing_id_a, data.listing_id_b])
  return { ok: true, pick: shapePick(data, map) }
}

// Delete a pick by its relationship id. If curatorId is supplied, the delete
// is constrained so a caller can only remove a pick made BY that listing
// (operator security). Admin omits curatorId to remove any pick.
export async function deletePick(sb, { id, curatorId = null }) {
  if (!id) return { ok: false, error: 'Pick id is required', code: 'bad_request' }
  let q = sb
    .from('listing_relationships')
    .delete()
    .eq('id', id)
    .eq('relationship_type', RELATIONSHIP_TYPE)
  if (curatorId) q = q.eq('listing_id_a', curatorId)
  const { data, error } = await q.select('id')
  if (error) return { ok: false, error: error.message, code: 'db' }
  if (!data || data.length === 0) return { ok: false, error: 'Pick not found', code: 'not_found' }
  return { ok: true, deletedId: id }
}
