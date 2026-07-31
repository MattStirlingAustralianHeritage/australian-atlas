/**
 * Closure review queue data layer — shared by the /admin/closures page
 * (server) and the /api/admin/closures route. Pure data access; no auth
 * (callers gate that).
 *
 * The sweep only ever writes closure_signals; THIS module is where a human
 * verdict becomes listing state. Durability rules follow the Gate Check:
 *
 *   - Master DB is authoritative, but a master-only status change is NOT
 *     durable — the 6-hourly source→master sync re-derives status from the
 *     vertical source row's publish state. Hiding a permanently closed venue
 *     therefore ALSO unpublishes the source row (best-effort, surgical, via
 *     unpublishInVertical), exactly like lib/gate-check/queue.js.
 *   - hidden_reason must NOT be 'no_website': the sync cron auto-reinstates
 *     inactive+no_website listings that have a website. We use status='hidden'
 *     + hidden_reason='permanently_closed', which nothing resurrects.
 *   - Temporary closure is display metadata, not a status: closure_status =
 *     'temporarily_closed' keeps the venue publicly visible with a badge
 *     (listings.status stays 'active', so migration 153's CHECK is happy and
 *     the venue remains discoverable). Master-only; the sync never touches it.
 */
import { unpublishInVertical, triggerVerticalRevalidation } from '@/lib/sync/pushToVertical'
import { revalidatePlacePages } from '@/lib/picks/revalidate'

const SIGNAL_COLS = 'id,listing_id,signal,confidence,reasons,evidence,status,resolution,resolved_at,resolved_by,detected_at,created_at'
const LISTING_FIELDS = 'id,name,slug,vertical,source_id,sub_type,suburb,region,state,status,website,closure_status,closure_noted_at,community_reports'

function chunk(arr, n) {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

function isMissingTable(error) {
  return error && (error.code === 'PGRST205' || /closure_signals/.test(error.message || ''))
}

const SIGNAL_RANK = { closed_permanently: 3, closed_temporarily: 2, reopened: 2, possibly_closed: 1 }
const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 }

/**
 * Fetch signals for a view, each merged with its listing.
 * view: 'open' | 'resolved'. Returns { rows, tableMissing }.
 */
export async function fetchClosureSignals(sb, { view = 'open', vertical = null, limit = 2000 } = {}) {
  let q = sb.from('closure_signals').select(SIGNAL_COLS).limit(limit)
  q = view === 'open'
    ? q.eq('status', 'open')
    : q.in('status', ['actioned', 'dismissed']).order('resolved_at', { ascending: false })

  const { data: signals, error } = await q
  if (error) {
    if (isMissingTable(error)) return { rows: [], tableMissing: true }
    throw new Error(`Failed to load closure signals: ${error.message}`)
  }
  if (!signals?.length) return { rows: [], tableMissing: false }

  const ids = [...new Set(signals.map(s => s.listing_id))]
  const listingsById = {}
  for (const slice of chunk(ids, 200)) {
    const { data, error: lerr } = await sb.from('listings').select(LISTING_FIELDS).in('id', slice)
    if (lerr) throw new Error(`Failed to load listings for closure signals: ${lerr.message}`)
    for (const l of data || []) listingsById[l.id] = l
  }

  let rows = signals.map(s => ({ ...s, listing: listingsById[s.listing_id] || null }))
  if (vertical) rows = rows.filter(r => r.listing?.vertical === vertical)

  if (view === 'open') {
    // Strongest claims first: permanent closures, then by confidence, then newest.
    rows.sort((a, b) =>
      (SIGNAL_RANK[b.signal] || 0) - (SIGNAL_RANK[a.signal] || 0) ||
      (CONFIDENCE_RANK[b.confidence] || 0) - (CONFIDENCE_RANK[a.confidence] || 0) ||
      new Date(b.detected_at) - new Date(a.detected_at)
    )
  }
  return { rows, tableMissing: false }
}

/** Head-counts for the view toggle. Missing table → zeros. */
export async function countClosureSignals(sb) {
  const [openRes, resolvedRes] = await Promise.all([
    sb.from('closure_signals').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    sb.from('closure_signals').select('id', { count: 'exact', head: true }).in('status', ['actioned', 'dismissed']),
  ])
  if (openRes.error && !isMissingTable(openRes.error)) throw new Error(openRes.error.message)
  return { open: openRes.count || 0, resolved: resolvedRes.count || 0 }
}

export const CLOSURE_ACTIONS = ['hide_permanent', 'mark_temporary', 'clear_temporary', 'dismiss']

/**
 * Apply a human verdict to one signal.
 *
 *   hide_permanent — venue is gone: hide the master listing durably
 *                    (status='hidden', hidden_reason='permanently_closed'),
 *                    unpublish the vertical source row, bust the place page.
 *   mark_temporary — venue is paused: closure_status='temporarily_closed';
 *                    stays publicly visible with a badge.
 *   clear_temporary— venue is back: clear the badge.
 *   dismiss        — false positive: resolve the signal only; the sweep
 *                    suppresses the same signal type for 90 days.
 *
 * Fails loudly on master-DB errors; the source unpublish is best-effort and
 * surfaces as `warning`, never an error (mirrors gate-check).
 */
export async function applyClosureAction(sb, { id, action, reviewer = 'admin' }) {
  if (!CLOSURE_ACTIONS.includes(action)) throw new Error(`Invalid action: ${action}`)

  const { data: signal, error: sigErr } = await sb
    .from('closure_signals')
    .select(SIGNAL_COLS)
    .eq('id', id)
    .maybeSingle()
  if (sigErr) throw new Error(`Failed to read signal: ${sigErr.message}`)
  if (!signal) throw new Error('Signal not found')
  if (signal.status !== 'open') throw new Error('Signal is already resolved')

  const { data: listing, error: listErr } = await sb
    .from('listings')
    .select(LISTING_FIELDS)
    .eq('id', signal.listing_id)
    .maybeSingle()
  if (listErr) throw new Error(`Failed to read listing: ${listErr.message}`)
  if (!listing) throw new Error('Listing no longer exists')

  const now = new Date().toISOString()
  let resolution
  let warning = null
  let sourceResult = null

  if (action === 'hide_permanent') {
    resolution = 'hidden_permanent'
    const { error } = await sb.from('listings').update({
      status: 'hidden',
      hidden_reason: 'permanently_closed',
      closure_status: null,
      updated_at: now,
    }).eq('id', listing.id)
    if (error) throw new Error(`Failed to hide listing: ${error.message}`)

    // Stop the 6-hourly sync resurrecting it (best-effort, never throws).
    try {
      sourceResult = await unpublishInVertical(listing.vertical, listing.source_id)
    } catch (e) {
      sourceResult = { ok: false, error: e?.message || String(e) }
    }
    if (sourceResult && !sourceResult.ok && sourceResult.error) {
      warning = `"${listing.name}" is hidden in the master DB, but its ${listing.vertical} source row could not be unpublished (${sourceResult.error}). The 6-hourly sync may revert it — finish by hand in the vertical.`
    }

    // Third step: purge the vertical site's ISR cache, or its public page
    // keeps serving 200 long after the DB unpublish (proven live before).
    if (sourceResult?.ok) {
      try {
        await triggerVerticalRevalidation(listing.vertical, listing.slug, listing.sub_type)
      } catch { /* best-effort — the page ages out at its ISR window anyway */ }
    }
  } else if (action === 'mark_temporary') {
    resolution = 'marked_temporary'
    const { error } = await sb.from('listings').update({
      closure_status: 'temporarily_closed',
      closure_noted_at: now,
      updated_at: now,
    }).eq('id', listing.id)
    if (error) throw new Error(`Failed to mark temporarily closed: ${error.message}`)
  } else if (action === 'clear_temporary') {
    resolution = 'cleared_temporary'
    const { error } = await sb.from('listings').update({
      closure_status: null,
      closure_noted_at: null,
      updated_at: now,
    }).eq('id', listing.id)
    if (error) throw new Error(`Failed to clear temporary closure: ${error.message}`)
  } else {
    resolution = 'dismissed'
  }

  const { error: resolveErr } = await sb.from('closure_signals').update({
    status: action === 'dismiss' ? 'dismissed' : 'actioned',
    resolution,
    resolved_at: now,
    resolved_by: reviewer,
  }).eq('id', signal.id)
  if (resolveErr) throw new Error(`Listing updated but the signal could not be resolved: ${resolveErr.message}`)

  // Bust the public place page so the change shows without waiting out ISR.
  if (action !== 'dismiss') {
    await revalidatePlacePages(sb, [listing.id])
  }

  return {
    action,
    resolution,
    listing_id: listing.id,
    listing_name: listing.name,
    source_result: sourceResult,
    warning,
  }
}
