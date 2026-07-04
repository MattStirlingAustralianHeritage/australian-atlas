/**
 * Gate Check queue data layer — shared by the admin page (server) and the
 * /api/admin/gate-check route. Pure data access; no auth (callers gate that).
 *
 * INVARIANT (identical to lib/gate/queue.js): every listing-status write here is
 * a PORTAL-ONLY direct update to the master listings table. We deliberately do
 * NOT call lib/admin/updateListing (which syncs status down to the vertical
 * source DBs) — Gate Check must never touch vertical projects.
 */

const QUEUE_COLS = 'id,listing_id,scanned_at,failed_gates,gate_details,primary_gate,reason_summary,severity,suggested_action,website,http_status,status,reviewed_at,reviewed_by'
const LISTING_FIELDS = 'id,name,slug,vertical,sub_type,region,state,status,lat,lng,website'

const SEVERITY_RANK = { high: 3, medium: 2, low: 1 }

function chunk(arr, n) {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

function isMissingTable(error) {
  return error && (error.code === 'PGRST205' || /listing_gate_check/.test(error.message || ''))
}

/**
 * Fetch queue rows for a view, each merged with its listing data.
 * Returns { rows, tableMissing }.
 */
export async function fetchGateCheckRows(sb, { status = 'pending', vertical = null, gate = null, action = null, severity = null, limit = 3000 } = {}) {
  // Trash is always unfiltered — its filter UI is hidden in the client, so applying
  // queue filters here would silently hide restorable rows.
  if (status === 'deleted') { vertical = null; gate = null; action = null; severity = null }
  let q = sb.from('listing_gate_check')
    .select(QUEUE_COLS)
    .eq('status', status)
    .limit(limit)
  if (action) q = q.eq('suggested_action', action)
  if (severity) q = q.eq('severity', severity)
  if (gate) q = q.contains('failed_gates', [gate])

  const { data: qrows, error } = await q
  if (error) {
    if (isMissingTable(error)) return { rows: [], tableMissing: true }
    throw new Error(`Failed to load gate-check queue: ${error.message}`)
  }
  if (!qrows || !qrows.length) return { rows: [], tableMissing: false }

  const ids = [...new Set(qrows.map(r => r.listing_id))]
  const listingsById = {}
  for (const slice of chunk(ids, 200)) {
    const { data, error: lerr } = await sb.from('listings').select(LISTING_FIELDS).in('id', slice)
    if (lerr) throw new Error(`Failed to load listings for gate-check: ${lerr.message}`)
    for (const l of data) listingsById[l.id] = l
  }

  let rows = qrows.map(r => ({ ...r, listing: listingsById[r.listing_id] || null }))
  if (vertical) rows = rows.filter(r => r.listing && r.listing.vertical === vertical)

  // Sort: most-severe first, then suggested action (delete > hide > pass), then newest scan.
  const actionRank = { delete: 2, hide: 1, pass: 0 }
  rows.sort((a, b) =>
    (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0) ||
    (actionRank[b.suggested_action] || 0) - (actionRank[a.suggested_action] || 0) ||
    new Date(b.scanned_at) - new Date(a.scanned_at)
  )
  return { rows, tableMissing: false }
}

// action -> (queue status, listing status | null). listing:null = leave listing unchanged.
const ACTION_MAP = {
  pass:    { queue: 'passed',  listing: null },      // keep the listing active; clear the flag
  hide:    { queue: 'hidden',  listing: 'hidden' },  // remove from public (allowlist excludes non-active)
  delete:  { queue: 'deleted', listing: 'deleted' }, // reversible soft-delete
  restore: { queue: 'pending', listing: 'active' },  // undo: back to public + back into the queue
}

export const GATE_CHECK_ACTIONS = Object.keys(ACTION_MAP)

/**
 * Apply an action to a set of queue rows (single or bulk).
 * Updates listings.status (portal-only) where required, then the queue rows.
 * Fails loudly — any DB error throws.
 */
export async function applyGateCheckAction(sb, { ids, action, reviewer = 'admin' }) {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error('No queue ids provided')
  const map = ACTION_MAP[action]
  if (!map) throw new Error(`Invalid action: ${action}`)

  const queueRows = []
  for (const c of chunk(ids, 200)) {
    const { data, error } = await sb.from('listing_gate_check').select('id,listing_id').in('id', c)
    if (error) throw new Error(`Failed to read gate-check rows: ${error.message}`)
    queueRows.push(...data)
  }
  if (!queueRows.length) throw new Error('No matching gate-check rows found for the given ids')
  const listingIds = [...new Set(queueRows.map(r => r.listing_id))]

  // 1. Listing status (portal-only). Skipped for 'pass'.
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
    const { data, error } = await sb.from('listing_gate_check')
      .update({ status: map.queue, reviewed_at: reviewedAt, reviewed_by: reviewedBy })
      .in('id', c)
      .select('id')
    if (error) throw new Error(`Failed to update gate-check rows to '${map.queue}': ${error.message}`)
    queueUpdated += data.length
  }

  return { action, queue_updated: queueUpdated, listings_updated: listingsUpdated, listing_ids: listingIds }
}
