/**
 * Gate Check queue data layer — shared by the admin page (server) and the
 * /api/admin/gate-check route. Pure data access; no auth (callers gate that).
 *
 * Master DB is authoritative: every listing-status change here is a direct
 * update to the master listings table, and we deliberately do NOT call
 * lib/admin/updateListing (which re-pushes the whole mapped row and can clobber
 * source-only fields like listing_tier / visitable).
 *
 * BUT a master-only status change is not durable: the 6-hourly source→master
 * sync (lib/sync/syncVertical.js) re-derives status from each vertical source
 * row's publish state (normalizeStatus in lib/sync/fieldMaps.js), so a Hide or
 * Delete is flipped back to 'active' within 6h whenever the source row is still
 * published (proven live: mis-listed craft trades and Invision NT). To make the
 * action stick we ALSO flip the single publish column on the source row —
 * surgically, via unpublishInVertical / republishInVertical (lib/sync/
 * pushToVertical.js). This mirrors the dedupe merger (app/api/admin/duplicates).
 * The source write is best-effort and never fails the master action.
 */
import { unpublishInVertical, republishInVertical } from '@/lib/sync/pushToVertical'

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

  // Sort: Hallucinated venues first — a fabricated / mis-identified listing is
  // the worst kind of live entry (it is not a real place at all), so it outranks
  // even the character gate. Then character-gate failures (a service business
  // polluting the Atlas). Then most-severe, then suggested action (delete > hide
  // > pass), then newest scan.
  const actionRank = { delete: 2, hide: 1, pass: 0 }
  const charRank = r => {
    const g = r.failed_gates || []
    if (g.includes('gate6_hallucination')) return 2
    if (g.includes('gate5_character')) return 1
    return 0
  }
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

// action -> (queue status, listing status | null, source publish op | null).
//   listing:null = leave the master listing unchanged.
//   source: 'unpublish' = also flip the vertical source row unpublished (so the
//     next sync can't resurrect it); 'republish' = flip it back published (so a
//     restore isn't undone by the next sync); null = leave the source row alone.
const ACTION_MAP = {
  pass:    { queue: 'passed',  listing: null,      source: null },        // keep the listing active; clear the flag
  hide:    { queue: 'hidden',  listing: 'hidden',  source: 'unpublish' }, // remove from public (allowlist excludes non-active)
  delete:  { queue: 'deleted', listing: 'deleted', source: 'unpublish' }, // reversible soft-delete
  restore: { queue: 'pending', listing: 'active',  source: 'republish' }, // undo: back to public + back into the queue
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

  // 3. Vertical source rows (best-effort — the master writes above are already
  //    committed and authoritative; this only stops the next source→master sync
  //    from reverting them). Surgically flips the publish column: 'unpublish'
  //    for Hide/Delete, 'republish' for Restore. Never throws.
  const { synced: sourceSynced, failed: sourceFailed, results: sourceResults } =
    map.source ? await syncSourcePublishState(sb, listingIds, map.source) : { synced: 0, failed: 0, results: [] }

  const warning = sourceFailed > 0
    ? `${sourceFailed} listing(s) were updated in the master DB, but their vertical source row could not be ${map.source === 'republish' ? 're-published' : 'unpublished'}. The 6-hourly sync may revert them — finish by hand in the affected vertical.`
    : null

  return {
    action,
    queue_updated: queueUpdated,
    listings_updated: listingsUpdated,
    listing_ids: listingIds,
    source_synced: sourceSynced,
    source_failed: sourceFailed,
    source_results: sourceResults,
    warning,
  }
}

/**
 * Flip the publish column on the vertical source rows for a set of master
 * listing ids. vertical + source_id aren't on the gate-check rows, so we read
 * them from listings. Best-effort and non-throwing: a failure here leaves the
 * (authoritative) master write in place and is surfaced as a warning, never an
 * error. A result carrying only `skipped` (e.g. no_source_row for a
 * portal-native listing) is expected and counts as neither synced nor failed.
 *
 * @param {'unpublish'|'republish'} op
 */
async function syncSourcePublishState(sb, listingIds, op) {
  const results = []
  let synced = 0, failed = 0

  const listingRows = []
  try {
    for (const c of chunk(listingIds, 200)) {
      const { data, error } = await sb.from('listings')
        .select('id,vertical,source_id')
        .in('id', c)
      if (error) throw new Error(error.message)
      listingRows.push(...(data || []))
    }
  } catch (err) {
    console.error(`[gate-check] could not load listings for source ${op} (master action still applied): ${err.message}`)
  }

  for (const l of listingRows) {
    let res
    try {
      res = op === 'unpublish'
        ? await unpublishInVertical(l.vertical, l.source_id)
        : await republishInVertical(l.vertical, l.source_id)
    } catch (e) {
      res = { ok: false, error: e?.message || String(e) }
    }
    if (res?.ok) synced++
    else if (res?.error) {
      failed++
      console.error(`[gate-check] source ${op} failed for listing ${l.id} (${l.vertical}/${l.source_id}): ${res.error}`)
    }
    results.push({ listing_id: l.id, vertical: l.vertical, ...res })
  }

  return { synced, failed, results }
}

/**
 * Restore hidden listings by LISTING id (the Hidden view is listing-driven, so
 * many of its rows have no gate-check row to act on). Reactivates each listing
 * (portal-only, per the invariant) and, because a restored listing is no longer
 * a merged duplicate, clears merged_into so it isn't left in the inconsistent
 * active-but-merged state. Any gate-check row is reset to pending (un-reviewed)
 * so the listing re-enters the review queue and is tracked again.
 *
 * Durability: a Hide/Delete/dedupe-merge now unpublishes the vertical source row
 * (see applyGateCheckAction + the dedupe merger), so flipping the master row back
 * to 'active' alone would be undone by the next source→master sync. We therefore
 * ALSO re-publish the source row (best-effort), the exact inverse of the Hide.
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

  // Re-publish the vertical source rows so the restore survives the next sync
  // (best-effort; the master 'active' above is authoritative).
  const { synced: sourceSynced, failed: sourceFailed, results: sourceResults } =
    await syncSourcePublishState(sb, listingIds, 'republish')
  const warning = sourceFailed > 0
    ? `${sourceFailed} listing(s) were restored in the master DB, but their vertical source row could not be re-published. The 6-hourly sync may re-hide them — finish by hand in the affected vertical.`
    : null

  return {
    action: 'restore',
    listings_updated: listingsUpdated,
    queue_updated: queueUpdated,
    listing_ids: listingIds,
    source_synced: sourceSynced,
    source_failed: sourceFailed,
    source_results: sourceResults,
    warning,
  }
}
