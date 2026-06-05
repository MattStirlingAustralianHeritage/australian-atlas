/**
 * Gate-review queue data layer — shared by the admin page (server) and the
 * /api/admin/gate-review route. Pure data access; no auth (callers gate that).
 *
 * INVARIANT: all listing-status writes here are PORTAL-ONLY direct updates to
 * the master listings table. We deliberately do NOT call lib/admin/updateListing
 * (which syncs status down to the vertical source DBs) — the gate-review system
 * must never touch vertical projects.
 */

const QUEUE_COLS = 'id,listing_id,flagged_at,flag_source,flag_reason,gate_flagged,confidence,suggested_action,status,reviewed_at,reviewed_by'
const LISTING_FIELDS = 'id,name,slug,vertical,sub_type,region,state,status'

function chunk(arr, n) {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

function isMissingTable(error) {
  return error && (error.code === 'PGRST205' || /listing_review_queue/.test(error.message || ''))
}

/**
 * Fetch queue rows for a view, each merged with its listing data.
 * Listing data is fetched in a second query (chunked .in()) rather than via a
 * PostgREST FK embed, so it does not depend on schema-cache FK introspection.
 * Returns { rows, tableMissing }.
 */
export async function fetchQueueRows(sb, { status = 'pending', vertical = null, gate = null, source = null, limit = 2000 } = {}) {
  let q = sb.from('listing_review_queue')
    .select(QUEUE_COLS)
    .eq('status', status)
    .order('confidence', { ascending: false })
    .order('flagged_at', { ascending: false })
    .limit(limit)
  if (gate) q = q.eq('gate_flagged', gate)
  if (source) q = q.eq('flag_source', source)

  const { data: qrows, error } = await q
  if (error) {
    if (isMissingTable(error)) return { rows: [], tableMissing: true }
    throw new Error(`Failed to load review queue: ${error.message}`)
  }
  if (!qrows || !qrows.length) return { rows: [], tableMissing: false }

  const ids = [...new Set(qrows.map(r => r.listing_id))]
  const listingsById = {}
  for (const slice of chunk(ids, 200)) {
    const { data, error: lerr } = await sb.from('listings').select(LISTING_FIELDS).in('id', slice)
    if (lerr) throw new Error(`Failed to load listings for queue: ${lerr.message}`)
    for (const l of data) listingsById[l.id] = l
  }

  let rows = qrows.map(r => ({ ...r, listing: listingsById[r.listing_id] || null }))
  if (vertical) rows = rows.filter(r => r.listing && r.listing.vertical === vertical)
  return { rows, tableMissing: false }
}

// action -> (queue status, listing status | null). listing:null = leave listing unchanged.
const ACTION_MAP = {
  approve: { queue: 'approved', listing: null },      // keep the listing; stop re-surfacing
  hide:    { queue: 'hidden',   listing: 'hidden' },  // remove from public (allowlist excludes non-active)
  delete:  { queue: 'deleted',  listing: 'deleted' }, // reversible soft-delete
  restore: { queue: 'pending',  listing: 'active' },  // undo: back to public + back into the queue
}

export const GATE_ACTIONS = Object.keys(ACTION_MAP)

/**
 * Apply an action to a set of queue rows (single or bulk).
 * Updates listings.status (portal-only) where the action requires it, then the
 * queue rows. Fails loudly — any DB error throws.
 */
export async function applyGateAction(sb, { ids, action, reviewer = 'admin' }) {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error('No queue ids provided')
  const map = ACTION_MAP[action]
  if (!map) throw new Error(`Invalid action: ${action}`)

  // Resolve the affected listing ids from the selected queue rows.
  const queueRows = []
  for (const c of chunk(ids, 200)) {
    const { data, error } = await sb.from('listing_review_queue').select('id,listing_id').in('id', c)
    if (error) throw new Error(`Failed to read queue rows: ${error.message}`)
    queueRows.push(...data)
  }
  if (!queueRows.length) throw new Error('No matching queue rows found for the given ids')
  const listingIds = [...new Set(queueRows.map(r => r.listing_id))]

  // 1. Listing status (portal-only). Skipped for 'approve'.
  let listingsUpdated = 0
  if (map.listing) {
    for (const c of chunk(listingIds, 100)) {
      const { data, error } = await sb.from('listings')
        .update({ status: map.listing, updated_at: new Date().toISOString() })
        .in('id', c)
        .select('id')
      if (error) throw new Error(`Failed to update listings to '${map.listing}': ${error.message}`)
      listingsUpdated += data.length
    }
  }

  // 2. Queue rows. Restore clears the review stamp (back to un-reviewed pending).
  const reviewedAt = action === 'restore' ? null : new Date().toISOString()
  const reviewedBy = action === 'restore' ? null : reviewer
  let queueUpdated = 0
  for (const c of chunk(ids, 100)) {
    const { data, error } = await sb.from('listing_review_queue')
      .update({ status: map.queue, reviewed_at: reviewedAt, reviewed_by: reviewedBy })
      .in('id', c)
      .select('id')
    if (error) throw new Error(`Failed to update queue rows to '${map.queue}': ${error.message}`)
    queueUpdated += data.length
  }

  return { action, queue_updated: queueUpdated, listings_updated: listingsUpdated, listing_ids: listingIds }
}
