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
const HIDDEN_LISTING_FIELDS = 'id,name,slug,vertical,sub_type,region,state,status,lat,lng,website,merged_into,updated_at'

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

  // Sort: Character-gate failures first — a service business polluting the
  // Atlas is the worst kind of live listing, so those flags outrank everything.
  // Then most-severe, then suggested action (delete > hide > pass), then newest scan.
  const actionRank = { delete: 2, hide: 1, pass: 0 }
  const charRank = r => (r.failed_gates || []).includes('gate5_character') ? 1 : 0
  rows.sort((a, b) =>
    charRank(b) - charRank(a) ||
    (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0) ||
    (actionRank[b.suggested_action] || 0) - (actionRank[a.suggested_action] || 0) ||
    new Date(b.scanned_at) - new Date(a.scanned_at)
  )
  return { rows, tableMissing: false }
}

/**
 * Fetch every listing that is currently HIDDEN, so an admin can review and
 * restore them. Deliberately LISTING-driven, not queue-driven: a listing can be
 * hidden by the Gate Check, by the dedupe merger (status 'hidden' + merged_into),
 * or by the listing editor — and only the first leaves a gate-check row. Keying
 * off listings.status='hidden' surfaces ALL of them. Any gate-check row is
 * attached for the "why", but its presence is not required.
 *
 * Returns { rows } where each row is shaped like a queue row (so the client can
 * reuse the same bits): { id (gate-check row id | null), listing_id, listing,
 * failed_gates, gate_details, primary_gate, reason_summary, severity,
 * suggested_action, merged_into, hidden_source }.
 */
export async function fetchHiddenListings(sb, { vertical = null, limit = 3000 } = {}) {
  let q = sb.from('listings')
    .select(HIDDEN_LISTING_FIELDS)
    .eq('status', 'hidden')
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (vertical) q = q.eq('vertical', vertical)
  const { data: listings, error } = await q
  if (error) throw new Error(`Failed to load hidden listings: ${error.message}`)
  if (!listings || !listings.length) return { rows: [] }

  // Attach any gate-check row for context (absent for editor/dedupe hides).
  const ids = listings.map(l => l.id)
  const gcByListing = {}
  for (const slice of chunk(ids, 200)) {
    const { data, error: gerr } = await sb.from('listing_gate_check').select(QUEUE_COLS).in('listing_id', slice)
    if (gerr && !isMissingTable(gerr)) throw new Error(`Failed to load gate-check context: ${gerr.message}`)
    for (const r of (data || [])) gcByListing[r.listing_id] = r
  }

  const rows = listings.map(l => {
    const gc = gcByListing[l.id] || null
    const source = gc ? 'gate_check' : (l.merged_into ? 'merge' : 'other')
    const fallbackReason = l.merged_into
      ? 'Hidden as a duplicate — merged into another listing.'
      : 'Hidden outside the Gate Check (dedupe or manual review).'
    return {
      id: gc?.id || null,
      listing_id: l.id,
      listing: l,
      failed_gates: gc?.failed_gates || [],
      gate_details: gc?.gate_details || [],
      primary_gate: gc?.primary_gate || null,
      reason_summary: gc?.reason_summary || fallbackReason,
      severity: gc?.severity || null,
      suggested_action: gc?.suggested_action || null,
      merged_into: l.merged_into || null,
      hidden_source: source,
    }
  })
  return { rows }
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

/**
 * Restore hidden listings by LISTING id (the Hidden view is listing-driven, so
 * many of its rows have no gate-check row to act on). Reactivates each listing
 * (portal-only, per the invariant) and, because a restored listing is no longer
 * a merged duplicate, clears merged_into so it isn't left in the inconsistent
 * active-but-merged state. Any gate-check row is reset to pending (un-reviewed)
 * so the listing re-enters the review queue and is tracked again.
 *
 * NOTE: like the Gate Check Hide, this is portal-only. For a listing whose
 * vertical source was unpublished (a dedupe merge), the 6-hourly source→master
 * sync won't resurrect it; for one still live at source, the sync is harmless
 * (the listing is active there too).
 */
export async function restoreHiddenListings(sb, { listingIds } = {}) {
  if (!Array.isArray(listingIds) || listingIds.length === 0) throw new Error('No listing ids provided')

  let listingsUpdated = 0
  for (const c of chunk(listingIds, 100)) {
    const { data, error } = await sb.from('listings')
      .update({ status: 'active', merged_into: null, updated_at: new Date().toISOString() })
      .in('id', c)
      .select('id')
    if (error) throw new Error(`Failed to restore listings to 'active': ${error.message}`)
    listingsUpdated += data.length
  }

  // Reset any gate-check rows for these listings back to pending. Best-effort:
  // a missing table just means there were none.
  let queueUpdated = 0
  for (const c of chunk(listingIds, 100)) {
    const { data, error } = await sb.from('listing_gate_check')
      .update({ status: 'pending', reviewed_at: null, reviewed_by: null })
      .in('listing_id', c)
      .select('id')
    if (error) {
      if (isMissingTable(error)) break
      throw new Error(`Failed to reset gate-check rows: ${error.message}`)
    }
    queueUpdated += data.length
  }

  return { action: 'restore', listings_updated: listingsUpdated, queue_updated: queueUpdated, listing_ids: listingIds }
}
